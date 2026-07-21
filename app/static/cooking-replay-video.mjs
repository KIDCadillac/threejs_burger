export const REPLAY_VIDEO_CANDIDATES = Object.freeze([
  Object.freeze({ mimeType: "video/webm;codecs=vp9", extension: "webm" }),
  Object.freeze({ mimeType: "video/webm;codecs=vp8", extension: "webm" }),
  Object.freeze({ mimeType: "video/mp4;codecs=avc1.42E01E", extension: "mp4" }),
  Object.freeze({ mimeType: "video/mp4", extension: "mp4" }),
]);

function codedError(code, message, properties = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, properties);
  return error;
}

export function extensionForReplayMimeType(mimeType) {
  const normalized = String(mimeType ?? "").trim().toLowerCase();
  if (normalized.startsWith("video/webm")) return "webm";
  if (normalized.startsWith("video/mp4")) return "mp4";
  return null;
}

export function selectReplayVideoFormat({ MediaRecorderImpl = globalThis.MediaRecorder } = {}) {
  if (typeof MediaRecorderImpl !== "function") return null;
  if (typeof MediaRecorderImpl.isTypeSupported !== "function") return null;
  for (const candidate of REPLAY_VIDEO_CANDIDATES) {
    try {
      if (MediaRecorderImpl.isTypeSupported(candidate.mimeType)) return candidate;
    } catch {
      // A broken candidate probe must not prevent probing the remaining formats.
    }
  }
  return null;
}

function positiveNumber(value, fallback, label) {
  const number = Number(value ?? fallback);
  if (!Number.isFinite(number) || number <= 0) {
    throw new TypeError(`${label} must be a positive finite number`);
  }
  return number;
}

export function createReplayFrameBuffer({
  maxDurationMs = 8_000,
  maxFrames = 96,
} = {}) {
  const durationLimit = positiveNumber(maxDurationMs, 8_000, "maxDurationMs");
  const frameLimit = Math.max(1, Math.floor(positiveNumber(maxFrames, 96, "maxFrames")));
  let entries = [];
  let nextSequence = 0;
  let disposed = false;

  const prune = () => {
    if (!entries.length) return;
    entries.sort((left, right) => left.timestamp - right.timestamp || left.sequence - right.sequence);
    const newestTimestamp = entries.at(-1).timestamp;
    const oldestAllowed = newestTimestamp - durationLimit;
    entries = entries.filter(({ timestamp }) => timestamp >= oldestAllowed);
    if (entries.length > frameLimit) entries = entries.slice(-frameLimit);
  };

  return Object.freeze({
    push(frame, timestamp) {
      if (disposed) return false;
      const frameTimestamp = Number(timestamp);
      if (!frame || !Number.isFinite(frameTimestamp)) {
        throw new TypeError("frame and a finite timestamp are required");
      }
      entries.push({ frame, timestamp: frameTimestamp, sequence: nextSequence++ });
      prune();
      return entries.some((entry) => entry.frame === frame && entry.timestamp === frameTimestamp);
    },
    snapshot({
      fromTimestamp = Number.NEGATIVE_INFINITY,
      toTimestamp = Number.POSITIVE_INFINITY,
    } = {}) {
      const from = Number(fromTimestamp);
      const to = Number(toTimestamp);
      return entries
        .filter(({ timestamp }) => timestamp >= from && timestamp <= to)
        .map(({ frame, timestamp }) => Object.freeze({ frame, timestamp }));
    },
    size: () => entries.length,
    durationMs() {
      return entries.length > 1 ? entries.at(-1).timestamp - entries[0].timestamp : 0;
    },
    clear() {
      const removed = entries.length;
      entries = [];
      return removed;
    },
    dispose() {
      if (disposed) return false;
      disposed = true;
      entries = [];
      return true;
    },
  });
}

function replayEntry(value, index) {
  const hasEnvelope = value && typeof value === "object" && "frame" in value;
  const frame = hasEnvelope ? value.frame : value;
  const proposedTimestamp = hasEnvelope ? value.timestamp : value?.timestamp;
  const timestamp = Number.isFinite(Number(proposedTimestamp)) ? Number(proposedTimestamp) : index;
  return { frame, timestamp, sequence: index };
}

function frameDimensions(frame) {
  const source = frame?.source ?? frame;
  const width = Number(frame?.width ?? source?.videoWidth ?? source?.naturalWidth ?? source?.width);
  const height = Number(frame?.height ?? source?.videoHeight ?? source?.naturalHeight ?? source?.height);
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw codedError("VIDEO_REPLAY_INVALID_FRAME", "Replay frame dimensions are invalid.");
  }
  return { width, height };
}

function stopStream(stream) {
  try {
    for (const track of stream?.getTracks?.() ?? []) track.stop?.();
  } catch {
    // Stream release is best effort and must not mask the export result.
  }
}

export function createReplayVideoExporter({
  documentTarget = globalThis.document,
  MediaRecorderImpl = globalThis.MediaRecorder,
  BlobImpl = globalThis.Blob,
  URLImpl = globalThis.URL,
  outputWidth = 480,
  fps = 12,
  videoBitsPerSecond = 800_000,
  timeoutMs = 20_000,
  setTimeoutImpl = globalThis.setTimeout?.bind(globalThis),
  clearTimeoutImpl = globalThis.clearTimeout?.bind(globalThis),
  sleepImpl,
  drawFrameImpl,
} = {}) {
  const targetWidth = Math.max(2, Math.round(positiveNumber(outputWidth, 480, "outputWidth")));
  const targetFps = positiveNumber(fps, 12, "fps");
  const targetBitrate = Math.round(positiveNumber(
    videoBitsPerSecond,
    800_000,
    "videoBitsPerSecond",
  ));
  const defaultTimeout = positiveNumber(timeoutMs, 20_000, "timeoutMs");
  const format = selectReplayVideoFormat({ MediaRecorderImpl });
  const managedUrls = new Set();
  const sleep = typeof sleepImpl === "function"
    ? sleepImpl
    : (delay) => new Promise((resolve) => setTimeoutImpl(resolve, delay));
  let activeJob = null;
  let disposed = false;

  const assertUsable = () => {
    if (disposed) throw codedError("VIDEO_REPLAY_DISPOSED", "The replay video exporter is disposed.");
  };

  const unsupportedError = () => codedError(
    "VIDEO_REPLAY_UNSUPPORTED",
    "This browser cannot encode a compact video replay.",
    { fallback: "gif" },
  );

  const exportFrames = (values, {
    onProgress = () => {},
    timeoutMs: exportTimeoutMs = defaultTimeout,
  } = {}) => {
    try {
      assertUsable();
    } catch (error) {
      return Promise.reject(error);
    }
    if (!format) return Promise.reject(unsupportedError());
    if (activeJob) {
      return Promise.reject(codedError(
        "VIDEO_REPLAY_BUSY",
        "A replay video export is already running.",
      ));
    }
    if (!Array.isArray(values) || !values.length) {
      return Promise.reject(codedError("NO_REPLAY_FRAMES", "There are no replay frames to encode."));
    }

    const entries = values
      .map(replayEntry)
      .sort((left, right) => left.timestamp - right.timestamp || left.sequence - right.sequence);
    const sourceSize = frameDimensions(entries[0].frame);
    const targetHeight = Math.max(
      2,
      Math.round((targetWidth * sourceSize.height / sourceSize.width) / 2) * 2,
    );
    const frameDelay = 1000 / targetFps;
    const canvas = documentTarget?.createElement?.("canvas");
    const context = canvas?.getContext?.("2d", { alpha: false });
    if (!canvas || !context || typeof canvas.captureStream !== "function") {
      return Promise.reject(unsupportedError());
    }
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    return new Promise((resolve, reject) => {
      let recorder = null;
      let stream = null;
      let timeoutId = null;
      let settled = false;
      let terminalError = null;
      let scratchCanvas = null;
      let scratchContext = null;
      const chunks = [];

      const cleanup = () => {
        if (timeoutId !== null) clearTimeoutImpl?.(timeoutId);
        timeoutId = null;
        if (recorder) {
          recorder.ondataavailable = null;
          recorder.onerror = null;
          recorder.onstop = null;
          try {
            if (recorder.state !== "inactive") recorder.stop?.();
          } catch {
            // The stream is still released below when recorder.stop() fails.
          }
        }
        stopStream(stream);
        if (activeJob === job) activeJob = null;
      };

      const finishError = (error) => {
        if (settled) return false;
        settled = true;
        cleanup();
        reject(error);
        return true;
      };

      const finishSuccess = () => {
        if (settled) return false;
        if (terminalError) return finishError(terminalError);
        let blob;
        try {
          blob = new BlobImpl(chunks, { type: format.mimeType });
        } catch (cause) {
          return finishError(codedError(
            "VIDEO_REPLAY_ENCODING_FAILED",
            "The replay video could not be finalized.",
            { cause },
          ));
        }
        if (!blob.size) {
          return finishError(codedError(
            "VIDEO_REPLAY_EMPTY",
            "The replay video encoder returned no data.",
          ));
        }
        settled = true;
        cleanup();
        resolve(Object.freeze({
          blob,
          mimeType: format.mimeType,
          extension: format.extension,
          width: targetWidth,
          height: targetHeight,
          fps: targetFps,
          durationMs: entries.length * frameDelay,
        }));
        return true;
      };

      const stopRecorder = () => {
        try {
          if (recorder?.state !== "inactive") recorder?.stop?.();
        } catch {
          // finishError below remains the authoritative terminal result.
        }
      };

      const job = {
        cancel(error) {
          if (settled) return false;
          terminalError = error;
          stopRecorder();
          finishError(error);
          return true;
        },
      };
      activeJob = job;

      const drawFrame = async (frame) => {
        context.clearRect?.(0, 0, targetWidth, targetHeight);
        if (typeof drawFrameImpl === "function") {
          await drawFrameImpl({
            frame,
            canvas,
            context,
            width: targetWidth,
            height: targetHeight,
          });
          return;
        }
        if (frame?.rgba) {
          const size = frameDimensions(frame);
          if (!scratchCanvas) {
            scratchCanvas = documentTarget.createElement("canvas");
            scratchContext = scratchCanvas?.getContext?.("2d");
          }
          if (!scratchCanvas || !scratchContext?.createImageData || !scratchContext?.putImageData) {
            throw codedError("VIDEO_REPLAY_INVALID_FRAME", "RGBA replay frames are unsupported.");
          }
          scratchCanvas.width = size.width;
          scratchCanvas.height = size.height;
          const image = scratchContext.createImageData(size.width, size.height);
          image.data.set(frame.rgba);
          scratchContext.putImageData(image, 0, 0);
          context.drawImage(scratchCanvas, 0, 0, targetWidth, targetHeight);
          return;
        }
        context.drawImage(frame?.source ?? frame, 0, 0, targetWidth, targetHeight);
      };

      try {
        stream = canvas.captureStream(targetFps);
        recorder = new MediaRecorderImpl(stream, {
          mimeType: format.mimeType,
          videoBitsPerSecond: targetBitrate,
        });
        recorder.ondataavailable = ({ data }) => {
          if (data?.size) chunks.push(data);
        };
        recorder.onerror = (event) => {
          const cause = event?.error ?? event;
          finishError(codedError(
            "VIDEO_REPLAY_ENCODING_FAILED",
            "The replay video encoder failed.",
            { cause },
          ));
        };
        recorder.onstop = () => finishSuccess();
        recorder.start();
        timeoutId = setTimeoutImpl?.(() => job.cancel(codedError(
          "VIDEO_REPLAY_TIMEOUT",
          "Replay video encoding timed out.",
        )), positiveNumber(exportTimeoutMs, defaultTimeout, "timeoutMs")) ?? null;
      } catch (cause) {
        finishError(codedError(
          "VIDEO_REPLAY_ENCODING_FAILED",
          "The replay video encoder could not start.",
          { cause },
        ));
        return;
      }

      Promise.resolve().then(async () => {
        for (let index = 0; index < entries.length; index += 1) {
          if (settled) return;
          await drawFrame(entries[index].frame);
          if (settled) return;
          for (const track of stream?.getTracks?.() ?? []) track.requestFrame?.();
          onProgress({
            completed: index + 1,
            total: entries.length,
            ratio: (index + 1) / entries.length,
          });
          await sleep(frameDelay);
        }
        if (!settled) stopRecorder();
      }).catch((cause) => {
        if (settled) return;
        const error = cause?.code
          ? cause
          : codedError(
            "VIDEO_REPLAY_ENCODING_FAILED",
            "A replay frame could not be rendered.",
            { cause },
          );
        terminalError = error;
        stopRecorder();
        finishError(error);
      });
    });
  };

  return Object.freeze({
    format: () => format,
    supported: () => Boolean(format),
    exportFrames,
    stop() {
      return activeJob?.cancel(codedError(
        "VIDEO_REPLAY_CANCELLED",
        "Replay video encoding was cancelled.",
      )) ?? false;
    },
    createObjectUrl(blob) {
      assertUsable();
      if (typeof URLImpl?.createObjectURL !== "function") {
        throw codedError("VIDEO_REPLAY_URL_UNSUPPORTED", "Object URLs are unavailable.");
      }
      const url = URLImpl.createObjectURL(blob);
      managedUrls.add(url);
      return url;
    },
    revokeObjectUrl(url) {
      if (!managedUrls.delete(url)) return false;
      try { URLImpl?.revokeObjectURL?.(url); } catch { /* best effort */ }
      return true;
    },
    dispose() {
      if (disposed) return false;
      disposed = true;
      activeJob?.cancel(codedError(
        "VIDEO_REPLAY_DISPOSED",
        "The replay video exporter was disposed.",
      ));
      for (const url of managedUrls) {
        try { URLImpl?.revokeObjectURL?.(url); } catch { /* best effort */ }
      }
      managedUrls.clear();
      return true;
    },
  });
}
