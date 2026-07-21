function replayFormat(recorderMimeType) {
  const mimeType = String(recorderMimeType).toLowerCase().startsWith("video/webm")
    ? "video/webm"
    : "video/mp4";
  const extension = mimeType === "video/webm" ? "webm" : "mp4";
  return Object.freeze({
    recorderMimeType,
    mimeType,
    containerMimeType: mimeType,
    extension,
  });
}

export const REPLAY_VIDEO_CANDIDATES = Object.freeze([
  replayFormat("video/webm;codecs=vp9"),
  replayFormat("video/webm;codecs=vp8"),
  replayFormat("video/mp4;codecs=avc1.42E01E"),
  replayFormat("video/mp4"),
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

function supportedReplayVideoFormats(MediaRecorderImpl) {
  if (typeof MediaRecorderImpl !== "function") return [];
  if (typeof MediaRecorderImpl.isTypeSupported !== "function") return [];
  return REPLAY_VIDEO_CANDIDATES.filter((candidate) => {
    try {
      return Boolean(MediaRecorderImpl.isTypeSupported(candidate.recorderMimeType));
    } catch {
      return false;
    }
  });
}

export function selectReplayVideoFormat({ MediaRecorderImpl = globalThis.MediaRecorder } = {}) {
  return supportedReplayVideoFormats(MediaRecorderImpl)[0] ?? null;
}

function positiveNumber(value, fallback, label) {
  const number = Number(value ?? fallback);
  if (!Number.isFinite(number) || number <= 0) {
    throw new TypeError(`${label} must be a positive finite number`);
  }
  return number;
}

function firstPositiveDimension(values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return null;
}

function frameDimensions(frame) {
  const source = frame?.source ?? frame;
  const isRgbaFrame = Boolean(frame?.rgba);
  const width = isRgbaFrame
    ? firstPositiveDimension([frame?.width])
    : firstPositiveDimension([
      source?.videoWidth,
      source?.naturalWidth,
      source?.width,
      source === frame ? null : frame?.width,
    ]);
  const height = isRgbaFrame
    ? firstPositiveDimension([frame?.height])
    : firstPositiveDimension([
      source?.videoHeight,
      source?.naturalHeight,
      source?.height,
      source === frame ? null : frame?.height,
    ]);
  if (!width || !height) {
    throw codedError("VIDEO_REPLAY_INVALID_FRAME", "Replay frame dimensions are invalid.");
  }
  return { width, height };
}

function scaledFrameHeight(targetWidth, sourceSize) {
  return Math.max(
    2,
    Math.round((targetWidth * sourceSize.height / sourceSize.width) / 2) * 2,
  );
}

function releaseSnapshot(frame) {
  const resource = frame?.source;
  if (!resource) return;
  try { resource.close?.(); } catch { /* best effort */ }
  try { resource.width = 0; } catch { /* best effort */ }
  try { resource.height = 0; } catch { /* best effort */ }
}

function createFrameSnapshot(frame, { documentTarget, outputWidth }) {
  const sourceSize = frameDimensions(frame);
  const width = outputWidth;
  const height = scaledFrameHeight(width, sourceSize);
  const canvas = documentTarget?.createElement?.("canvas");
  const context = canvas?.getContext?.("2d", { alpha: false });
  if (!canvas || !context?.drawImage) {
    throw codedError(
      "VIDEO_REPLAY_SNAPSHOT_UNSUPPORTED",
      "This browser cannot create replay frame snapshots.",
    );
  }
  canvas.width = width;
  canvas.height = height;

  let scratchCanvas = null;
  try {
    if (frame?.rgba) {
      scratchCanvas = documentTarget.createElement("canvas");
      const scratchContext = scratchCanvas?.getContext?.("2d");
      if (!scratchCanvas || !scratchContext?.createImageData || !scratchContext?.putImageData) {
        throw codedError("VIDEO_REPLAY_INVALID_FRAME", "RGBA replay frames are unsupported.");
      }
      scratchCanvas.width = sourceSize.width;
      scratchCanvas.height = sourceSize.height;
      const image = scratchContext.createImageData(sourceSize.width, sourceSize.height);
      image.data.set(new Uint8ClampedArray(frame.rgba));
      scratchContext.putImageData(image, 0, 0);
      context.drawImage(scratchCanvas, 0, 0, width, height);
    } else {
      context.drawImage(frame?.source ?? frame, 0, 0, width, height);
    }
  } catch (cause) {
    releaseSnapshot({ source: canvas });
    if (cause?.code) throw cause;
    throw codedError(
      "VIDEO_REPLAY_INVALID_FRAME",
      "A replay frame could not be copied.",
      { cause },
    );
  } finally {
    if (scratchCanvas) releaseSnapshot({ source: scratchCanvas });
  }

  return Object.freeze({ source: canvas, width, height });
}

export function createReplayFrameBuffer({
  maxDurationMs = 8_000,
  maxFrames = 96,
  outputWidth = 480,
  documentTarget = globalThis.document,
} = {}) {
  const durationLimit = positiveNumber(maxDurationMs, 8_000, "maxDurationMs");
  const frameLimit = Math.max(1, Math.floor(positiveNumber(maxFrames, 96, "maxFrames")));
  const targetWidth = Math.max(2, Math.round(positiveNumber(outputWidth, 480, "outputWidth")));
  let entries = [];
  let nextSequence = 0;
  let disposed = false;

  const releaseEntryIfUnowned = (entry) => {
    if (!entry?.retired || entry.leases > 0 || entry.released) return false;
    entry.released = true;
    releaseSnapshot(entry.frame);
    return true;
  };

  const replaceEntries = (nextEntries) => {
    const retained = new Set(nextEntries);
    for (const entry of entries) {
      if (retained.has(entry)) continue;
      entry.retired = true;
      releaseEntryIfUnowned(entry);
    }
    entries = nextEntries;
  };

  const prune = () => {
    if (!entries.length) return;
    const ordered = [...entries]
      .sort((left, right) => left.timestamp - right.timestamp || left.sequence - right.sequence);
    const newestTimestamp = ordered.at(-1).timestamp;
    const oldestAllowed = newestTimestamp - durationLimit;
    let retained = ordered.filter(({ timestamp }) => timestamp >= oldestAllowed);
    if (retained.length > frameLimit) retained = retained.slice(-frameLimit);
    replaceEntries(retained);
  };

  const releaseAll = () => {
    const removed = entries.length;
    replaceEntries([]);
    return removed;
  };

  return Object.freeze({
    push(frame, timestamp) {
      if (disposed) return false;
      const frameTimestamp = Number(timestamp);
      if (!frame || !Number.isFinite(frameTimestamp)) {
        throw new TypeError("frame and a finite timestamp are required");
      }
      const entry = {
        frame: createFrameSnapshot(frame, {
          documentTarget,
          outputWidth: targetWidth,
        }),
        timestamp: frameTimestamp,
        sequence: nextSequence++,
        leases: 0,
        retired: false,
        released: false,
      };
      entries.push(entry);
      prune();
      return entries.includes(entry);
    },
    snapshot({
      fromTimestamp = Number.NEGATIVE_INFINITY,
      toTimestamp = Number.POSITIVE_INFINITY,
    } = {}) {
      const from = Number(fromTimestamp);
      const to = Number(toTimestamp);
      const selected = entries
        .filter(({ timestamp }) => timestamp >= from && timestamp <= to);
      for (const entry of selected) entry.leases += 1;
      let released = false;
      const snapshot = selected
        .map(({ frame, timestamp }) => Object.freeze({ frame, timestamp }));
      Object.defineProperty(snapshot, "release", {
        configurable: false,
        enumerable: false,
        writable: false,
        value() {
          if (released) return false;
          released = true;
          for (const entry of selected) {
            entry.leases = Math.max(0, entry.leases - 1);
            releaseEntryIfUnowned(entry);
          }
          return true;
        },
      });
      return Object.freeze(snapshot);
    },
    size: () => entries.length,
    durationMs() {
      return entries.length > 1 ? entries.at(-1).timestamp - entries[0].timestamp : 0;
    },
    clear: releaseAll,
    dispose() {
      if (disposed) return false;
      disposed = true;
      releaseAll();
      return true;
    },
  });
}

function replayEntry(value, index, frameDelay) {
  const hasEnvelope = value && typeof value === "object" && "frame" in value;
  const frame = hasEnvelope ? value.frame : value;
  const proposedTimestamp = hasEnvelope ? value.timestamp : value?.timestamp;
  const timestamp = Number.isFinite(Number(proposedTimestamp))
    ? Number(proposedTimestamp)
    : index * frameDelay;
  return { frame, timestamp, sequence: index };
}

function createPlaybackTimeline(entries, frameDelay, durationLimit) {
  const firstTimestamp = entries[0].timestamp;
  const normalized = entries.map((entry) => ({
    ...entry,
    offset: Math.max(0, entry.timestamp - firstTimestamp),
  }));
  const rawDuration = normalized.at(-1).offset;
  if (!Number.isFinite(rawDuration) || rawDuration > durationLimit) {
    throw codedError(
      "VIDEO_REPLAY_DURATION_LIMIT",
      "Replay timestamps exceed the supported clip duration.",
      { durationMs: rawDuration, maxDurationMs: durationLimit },
    );
  }
  return {
    durationMs: rawDuration + frameDelay,
    tailDelayMs: frameDelay,
    frames: normalized.map(({ frame, offset }) => ({ frame, offset })),
  };
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
  maxDurationMs = 12_000,
  setTimeoutImpl = globalThis.setTimeout?.bind(globalThis),
  clearTimeoutImpl = globalThis.clearTimeout?.bind(globalThis),
  sleepImpl,
  nowImpl = globalThis.performance?.now?.bind(globalThis.performance) ?? Date.now,
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
  const durationLimit = positiveNumber(maxDurationMs, 12_000, "maxDurationMs");
  const formats = supportedReplayVideoFormats(MediaRecorderImpl);
  const preferredFormat = formats[0] ?? null;
  const managedUrls = new Set();
  const sleep = typeof sleepImpl === "function"
    ? sleepImpl
    : (delay) => new Promise((resolve) => setTimeoutImpl(resolve, delay));
  const now = typeof nowImpl === "function" ? nowImpl : Date.now;
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

  const beginExport = (values, {
    onProgress = () => {},
    timeoutMs: exportTimeoutMs = defaultTimeout,
  } = {}) => {
    assertUsable();
    if (!formats.length) throw unsupportedError();
    if (activeJob) {
      throw codedError("VIDEO_REPLAY_BUSY", "A replay video export is already running.");
    }
    if (!Array.isArray(values) || !values.length) {
      throw codedError("NO_REPLAY_FRAMES", "There are no replay frames to encode.");
    }

    const frameDelay = 1000 / targetFps;
    const normalizedTimeout = positiveNumber(exportTimeoutMs, defaultTimeout, "timeoutMs");

    return new Promise((resolve, reject) => {
      let canvas = null;
      let context = null;
      let targetHeight = 0;
      let playback = null;
      let recorder = null;
      let stream = null;
      let activeFormat = null;
      let timeoutId = null;
      let settled = false;
      let terminalError = null;
      let scratchCanvas = null;
      let scratchContext = null;
      const chunks = [];
      const attemptedRecorderMimeTypes = [];
      const attemptErrors = [];

      const detachRecorder = (targetRecorder) => {
        if (!targetRecorder) return;
        targetRecorder.ondataavailable = null;
        targetRecorder.onerror = null;
        targetRecorder.onstop = null;
      };

      const releaseAttempt = ({ stopRecorder = true } = {}) => {
        const targetRecorder = recorder;
        const targetStream = stream;
        recorder = null;
        stream = null;
        detachRecorder(targetRecorder);
        if (stopRecorder && targetRecorder) {
          try {
            if (targetRecorder.state !== "inactive") targetRecorder.stop?.();
          } catch {
            // Stream release below is authoritative even when stop fails.
          }
        }
        stopStream(targetStream);
      };

      const cleanup = () => {
        if (timeoutId !== null) clearTimeoutImpl?.(timeoutId);
        timeoutId = null;
        releaseAttempt();
        if (scratchCanvas) releaseSnapshot({ source: scratchCanvas });
        scratchCanvas = null;
        scratchContext = null;
        if (canvas) releaseSnapshot({ source: canvas });
        canvas = null;
        context = null;
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
          blob = new BlobImpl(chunks, { type: activeFormat.mimeType });
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
        const result = Object.freeze({
          blob,
          mimeType: activeFormat.mimeType,
          containerMimeType: activeFormat.containerMimeType,
          recorderMimeType: activeFormat.recorderMimeType,
          extension: activeFormat.extension,
          fileName: `replay.${activeFormat.extension}`,
          width: targetWidth,
          height: targetHeight,
          fps: targetFps,
          durationMs: playback.durationMs,
        });
        settled = true;
        cleanup();
        resolve(result);
        return true;
      };

      const stopRecorder = () => {
        try {
          if (recorder?.state !== "inactive") recorder?.stop?.();
          return true;
        } catch (cause) {
          finishError(codedError(
            "VIDEO_REPLAY_ENCODING_FAILED",
            "The replay video encoder could not stop.",
            { cause },
          ));
          return false;
        }
      };

      const job = {
        cancel(error) {
          if (settled) return false;
          terminalError = error;
          try {
            if (recorder?.state !== "inactive") recorder?.stop?.();
          } catch {
            // finishError below remains the authoritative terminal result.
          }
          finishError(error);
          return true;
        },
      };
      activeJob = job;
      try {
        timeoutId = setTimeoutImpl?.(() => job.cancel(codedError(
          "VIDEO_REPLAY_TIMEOUT",
          "Replay video encoding timed out.",
        )), normalizedTimeout) ?? null;
      } catch (cause) {
        finishError(codedError(
          "VIDEO_REPLAY_ENCODING_FAILED",
          "The replay video timeout could not be scheduled.",
          { cause },
        ));
        return;
      }

      const drawFrame = async (frame) => {
        context.clearRect?.(0, 0, targetWidth, targetHeight);
        if (typeof drawFrameImpl === "function") {
          await drawFrameImpl({ frame, canvas, context, width: targetWidth, height: targetHeight });
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

      const startPlayback = () => {
        Promise.resolve().then(async () => {
          const startedAt = Number(now());
          if (!Number.isFinite(startedAt)) {
            throw codedError(
              "VIDEO_REPLAY_ENCODING_FAILED",
              "The replay video clock returned an invalid time.",
            );
          }
          const waitUntil = async (offset) => {
            const currentTime = Number(now());
            if (!Number.isFinite(currentTime)) {
              throw codedError(
                "VIDEO_REPLAY_ENCODING_FAILED",
                "The replay video clock returned an invalid time.",
              );
            }
            const remaining = (startedAt + offset) - currentTime;
            if (remaining > 0) await sleep(remaining);
          };
          for (let index = 0; index < playback.frames.length; index += 1) {
            if (settled) return;
            await waitUntil(playback.frames[index].offset);
            if (settled) return;
            await drawFrame(playback.frames[index].frame);
            if (settled) return;
            for (const track of stream?.getTracks?.() ?? []) track.requestFrame?.();
            onProgress({
              completed: index + 1,
              total: playback.frames.length,
              ratio: (index + 1) / playback.frames.length,
            });
          }
          await waitUntil(playback.durationMs);
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
          try {
            if (recorder?.state !== "inactive") recorder?.stop?.();
          } catch {
            // finishError below is authoritative.
          }
          finishError(error);
        });
      };

      const startFirstWorkingRecorder = () => {
        for (const candidate of formats) {
          attemptedRecorderMimeTypes.push(candidate.recorderMimeType);
          activeFormat = candidate;
          try {
            stream = canvas.captureStream(targetFps);
            recorder = new MediaRecorderImpl(stream, {
              mimeType: candidate.recorderMimeType,
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
                { cause, recorderMimeType: activeFormat?.recorderMimeType },
              ));
            };
            recorder.onstop = () => finishSuccess();
            recorder.start();
            startPlayback();
            return;
          } catch (cause) {
            attemptErrors.push(Object.freeze({
              recorderMimeType: candidate.recorderMimeType,
              cause,
            }));
            releaseAttempt();
          }
        }
        finishError(codedError(
          "VIDEO_REPLAY_ENCODING_FAILED",
          "No supported replay video encoder could be started.",
          { attemptedRecorderMimeTypes, attemptErrors },
        ));
      };

      try {
        const entries = values
          .map((value, index) => replayEntry(value, index, frameDelay))
          .sort((left, right) => left.timestamp - right.timestamp || left.sequence - right.sequence);
        const sourceSize = frameDimensions(entries[0].frame);
        targetHeight = scaledFrameHeight(targetWidth, sourceSize);
        playback = createPlaybackTimeline(entries, frameDelay, durationLimit);
        canvas = documentTarget?.createElement?.("canvas");
        context = canvas?.getContext?.("2d", { alpha: false });
        if (!canvas || !context || typeof canvas.captureStream !== "function") {
          throw unsupportedError();
        }
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      } catch (cause) {
        finishError(cause?.code
          ? cause
          : codedError(
            "VIDEO_REPLAY_ENCODING_FAILED",
            "Replay video preparation failed.",
            { cause },
          ));
        return;
      }
      startFirstWorkingRecorder();
    });
  };

  const exportFrames = (values, options) => {
    const capturedValues = Array.isArray(values) ? [...values] : values;
    const releaseValues = typeof values?.release === "function"
      ? values.release.bind(values)
      : null;
    return Promise.resolve()
      .then(() => beginExport(capturedValues, options))
      .finally(() => {
        try { releaseValues?.(); } catch { /* transferred snapshots release best effort */ }
      });
  };

  return Object.freeze({
    format: () => preferredFormat,
    supported: () => Boolean(preferredFormat),
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
