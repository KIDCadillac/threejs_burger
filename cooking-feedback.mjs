import { GIFEncoder, applyPalette, quantize } from "./vendor/gifenc.esm.js";

const DEFAULT_ENDPOINT = "/api/feedback";
const MAX_REPORT_LAYERS = 20;
const MAX_MESSAGE_LENGTH = 1000;

function boundedText(value, limit) {
  return String(value ?? "").trim().slice(0, limit);
}

function boundedInventory(inventory = {}) {
  return Object.fromEntries(
    Object.entries(inventory)
      .slice(0, 20)
      .map(([id, count]) => [boundedText(id, 40), Math.max(0, Number(count) || 0)]),
  );
}

export function buildCookingReportMetadata({
  message,
  generatedAt = new Date().toISOString(),
  pageUrl = "",
  userAgent = "",
  context = {},
} = {}) {
  const state = context.state ?? {};
  const assembledOrder = Array.isArray(state.assembledOrder)
    ? state.assembledOrder.slice(-MAX_REPORT_LAYERS)
    : [];
  const instances = state.instances ?? {};
  return Object.freeze({
    version: "2026.07.21",
    generatedAt: boundedText(generatedAt, 40),
    message: boundedText(message, MAX_MESSAGE_LENGTH),
    pageUrl: boundedText(pageUrl, 300),
    userAgent: boundedText(userAgent, 300),
    stackLayers: assembledOrder.length,
    assembledIngredients: assembledOrder.map((id) => boundedText(instances[id] ?? id, 40)),
    inventory: boundedInventory(state.inventory),
    sauceStrokes: Array.isArray(state.strokes) ? Math.min(state.strokes.length, 500) : 0,
    focused: Boolean(context.focused),
    expanded: Boolean(context.expanded),
  });
}

async function defaultYieldFrame() {
  await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

function codedError(code, message, cause) {
  const error = new Error(message, cause === undefined ? undefined : { cause });
  error.code = code;
  return error;
}

export async function encodeReplayGif(frames, {
  delay = 333,
  repeat = 0,
  onProgress = () => {},
  yieldFrame = defaultYieldFrame,
} = {}) {
  if (!Array.isArray(frames) || !frames.length) throw new Error("没有可用的操作回放画面");
  const width = frames[0].width;
  const height = frames[0].height;
  if (!width || !height) throw new Error("操作回放尺寸无效");
  const gif = GIFEncoder();
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index];
    if (frame.width !== width || frame.height !== height) {
      throw new Error("操作回放画面尺寸不一致");
    }
    const palette = quantize(frame.rgba, 128, { format: "rgb444" });
    const indexed = applyPalette(frame.rgba, palette, "rgb444");
    gif.writeFrame(indexed, width, height, {
      palette,
      delay,
      repeat: index === 0 ? repeat : undefined,
    });
    onProgress({ completed: index + 1, total: frames.length });
    if (index < frames.length - 1) await yieldFrame();
  }
  gif.finish();
  return gif.bytes();
}

export function createCanvasReplayRecorder({
  canvas,
  documentTarget = globalThis.document,
  windowTarget = globalThis,
  fps = 3,
  seconds = 6,
  width = 180,
  subscribeFrame,
  readFramePixels,
  encodeGif = encodeReplayGif,
  BlobImpl = globalThis.Blob,
} = {}) {
  if (!canvas) throw new TypeError("canvas is required");
  const frameCanvas = documentTarget?.createElement?.("canvas");
  const context = frameCanvas?.getContext?.("2d", { willReadFrequently: true });
  if (!frameCanvas || !context) throw new Error("浏览器不支持操作回放录制");
  const frames = [];
  const maxFrames = Math.max(2, Math.round(fps * seconds));
  const timerApi = windowTarget.setInterval ? windowTarget : globalThis;
  let timer = null;
  let removeFrame = null;
  let lastCaptureTime = Number.NEGATIVE_INFINITY;
  let disposed = false;
  let pixelCanvas = null;
  let pixelContext = null;
  let lastCaptureMode = "canvas";
  let lastCaptureHasColor = false;

  const drawCurrentFrame = (nextHeight) => {
    const sourcePixels = typeof readFramePixels === "function"
      ? readFramePixels({ width, height: nextHeight })
      : null;
    if (!sourcePixels?.rgba || !sourcePixels.width || !sourcePixels.height) {
      lastCaptureMode = "canvas";
      context.drawImage(canvas, 0, 0, width, nextHeight);
      return;
    }
    lastCaptureMode = "render-target";
    lastCaptureHasColor = false;
    for (let index = 0; index < sourcePixels.rgba.length; index += 64) {
      if (sourcePixels.rgba[index] || sourcePixels.rgba[index + 1] || sourcePixels.rgba[index + 2]) {
        lastCaptureHasColor = true;
        break;
      }
    }
    if (!pixelCanvas) {
      pixelCanvas = documentTarget.createElement("canvas");
      pixelContext = pixelCanvas?.getContext?.("2d");
    }
    if (!pixelCanvas || !pixelContext?.createImageData || !pixelContext?.putImageData) {
      context.drawImage(canvas, 0, 0, width, nextHeight);
      return;
    }
    if (pixelCanvas.width !== sourcePixels.width || pixelCanvas.height !== sourcePixels.height) {
      pixelCanvas.width = sourcePixels.width;
      pixelCanvas.height = sourcePixels.height;
    }
    const image = pixelContext.createImageData(sourcePixels.width, sourcePixels.height);
    image.data.set(sourcePixels.rgba);
    pixelContext.putImageData(image, 0, 0);
    if (sourcePixels.flippedY && context.save && context.restore) {
      context.save();
      context.translate(0, nextHeight);
      context.scale(1, -1);
      context.drawImage(pixelCanvas, 0, 0, width, nextHeight);
      context.restore();
    } else {
      context.drawImage(pixelCanvas, 0, 0, width, nextHeight);
    }
  };

  const capture = () => {
    if (disposed || !canvas.width || !canvas.height) return false;
    const nextHeight = Math.max(1, Math.round(width * canvas.height / canvas.width));
    if (frameCanvas.width !== width || frameCanvas.height !== nextHeight) {
      frameCanvas.width = width;
      frameCanvas.height = nextHeight;
    }
    drawCurrentFrame(nextHeight);
    const image = context.getImageData(0, 0, width, nextHeight);
    frames.push({ rgba: new Uint8ClampedArray(image.data), width, height: nextHeight });
    if (frames.length > maxFrames) frames.splice(0, frames.length - maxFrames);
    return true;
  };
  const captureAfterRender = (time = 0) => {
    const frameTime = Number(time);
    if (!Number.isFinite(frameTime) || frameTime - lastCaptureTime >= (1000 / fps) - 1) {
      lastCaptureTime = Number.isFinite(frameTime) ? frameTime : lastCaptureTime;
      capture();
    }
  };

  const stopRecording = () => {
    const wasRecording = timer !== null || removeFrame !== null;
    if (timer !== null) timerApi.clearInterval(timer);
    removeFrame?.();
    timer = null;
    removeFrame = null;
    return wasRecording;
  };

  return Object.freeze({
    start() {
      if (disposed || timer !== null || removeFrame !== null) return false;
      capture();
      if (typeof subscribeFrame === "function") {
        removeFrame = subscribeFrame(captureAfterRender) ?? (() => {});
      } else {
        timer = timerApi.setInterval(capture, Math.round(1000 / fps));
      }
      return true;
    },
    capture,
    stop: stopRecording,
    snapshotDataUrl() {
      try {
        if (typeof readFramePixels === "function" || !frames.length) capture();
        return frameCanvas.toDataURL?.("image/png") ?? "";
      } catch {
        return "";
      }
    },
    async exportGif({ onProgress } = {}) {
      if (typeof readFramePixels === "function" || !frames.length) capture();
      if (!frames.length) {
        throw codedError("NO_REPLAY_FRAMES", "暂时没有录到操作画面，请继续操作几秒后再提交");
      }
      try {
        const replayFrames = frames.length === 1 ? [frames[0], frames[0]] : [...frames];
        const bytes = await encodeGif(replayFrames, {
          delay: Math.round(1000 / fps),
          onProgress,
        });
        return new BlobImpl([bytes], { type: "image/gif" });
      } catch (error) {
        throw codedError(
          "REPLAY_ENCODING_FAILED",
          "操作回放生成失败，请稍后重试。",
          error,
        );
      }
    },
    frameCount: () => frames.length,
    diagnostics: () => ({
      mode: lastCaptureMode,
      hasColor: lastCaptureHasColor,
      frames: frames.length,
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      stopRecording();
      frames.length = 0;
    },
  });
}

async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return `data:${blob.type || "application/octet-stream"};base64,${globalThis.btoa(binary)}`;
}

function prepareReplayDataUrl(replay) {
  return blobToDataUrl(replay).catch((error) => {
    throw codedError(
      "REPLAY_PREPARATION_FAILED",
      "回放数据准备失败，请稍后重试。",
      error,
    );
  });
}

function startPreparedRequest(prepare, request, {
  timeoutMs = 20_000,
  setTimeoutImpl = globalThis.setTimeout?.bind(globalThis),
  clearTimeoutImpl = globalThis.clearTimeout?.bind(globalThis),
  AbortControllerImpl = globalThis.AbortController,
  onRequestStart = () => {},
} = {}) {
  const controller = typeof AbortControllerImpl === "function"
    ? new AbortControllerImpl()
    : null;
  let settled = false;
  let timer = null;
  let rejectOuter = null;

  const promise = new Promise((resolve, reject) => {
    rejectOuter = reject;
    const finish = (handler, value) => {
      if (settled) return false;
      settled = true;
      if (timer !== null) clearTimeoutImpl?.(timer);
      timer = null;
      handler(value);
      return true;
    };

    Promise.resolve()
      .then(prepare)
      .then(
        (prepared) => {
          if (settled) return;
          try {
            onRequestStart();
          } catch (error) {
            finish(reject, codedError("UPLOAD_FAILED", "网络请求失败。", error));
            return;
          }
          if (settled) return;
          timer = setTimeoutImpl?.(() => {
            if (settled) return;
            try { controller?.abort(); } catch { /* best effort */ }
            finish(
              reject,
              codedError("UPLOAD_TIMEOUT", "网络或 Google 服务响应超时。"),
            );
          }, timeoutMs) ?? null;

          let requestPromise;
          try {
            requestPromise = Promise.resolve(request(prepared, controller?.signal));
          } catch (error) {
            finish(reject, codedError("UPLOAD_FAILED", "网络请求失败。", error));
            return;
          }
          requestPromise.then(
            (value) => finish(resolve, value),
            (error) => finish(
              reject,
              codedError("UPLOAD_FAILED", "网络请求失败。", error),
            ),
          );
        },
        (error) => finish(reject, error),
      );
  });

  return Object.freeze({
    promise,
    cancel() {
      if (settled || !rejectOuter) return false;
      settled = true;
      if (timer !== null) clearTimeoutImpl?.(timer);
      timer = null;
      try { controller?.abort(); } catch { /* best effort */ }
      rejectOuter(codedError("UPLOAD_CANCELLED", "反馈提交已取消。"));
      return true;
    },
  });
}

export function createHttpFeedbackUploader({
  endpoint = DEFAULT_ENDPOINT,
  fetchImpl = globalThis.fetch,
  timeoutMs = 20_000,
  setTimeoutImpl = globalThis.setTimeout?.bind(globalThis),
  clearTimeoutImpl = globalThis.clearTimeout?.bind(globalThis),
  AbortControllerImpl = globalThis.AbortController,
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("浏览器不支持自动反馈上传");
  let activeRequest = null;
  return Object.freeze({
    async submit({ metadata, replay, screenshotDataUrl }, { onUploadStart } = {}) {
      if (activeRequest) throw codedError("UPLOAD_FAILED", "已有反馈正在提交。");
      const request = startPreparedRequest(
        () => prepareReplayDataUrl(replay),
        async (replayDataUrl, signal) => {
          const response = await fetchImpl(endpoint, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ metadata, replayDataUrl, screenshotDataUrl }),
            ...(signal ? { signal } : {}),
          });
          if (!response.ok) throw new Error(`反馈服务暂时不可用（${response.status}）`);
          return response.json();
        },
        {
          timeoutMs,
          setTimeoutImpl,
          clearTimeoutImpl,
          AbortControllerImpl,
          onRequestStart: () => onUploadStart?.(),
        },
      );
      activeRequest = request;
      try {
        return await request.promise;
      } finally {
        if (activeRequest === request) activeRequest = null;
      }
    },
    cancel() { return activeRequest?.cancel() ?? false; },
  });
}

function createReportId(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const random = globalThis.crypto?.getRandomValues
    ? [...globalThis.crypto.getRandomValues(new Uint8Array(4))]
      .map((value) => value.toString(16).padStart(2, "0")).join("")
    : Math.random().toString(16).slice(2, 10).padEnd(8, "0");
  return `FB-${stamp}-${random}`;
}

export function createGoogleDriveFeedbackUploader({
  endpoint,
  uploadKey = "",
  fetchImpl = globalThis.fetch,
  timeoutMs = 20_000,
  setTimeoutImpl = globalThis.setTimeout?.bind(globalThis),
  clearTimeoutImpl = globalThis.clearTimeout?.bind(globalThis),
  AbortControllerImpl = globalThis.AbortController,
} = {}) {
  let activeRequest = null;
  return Object.freeze({
    async submit({ metadata, replay, screenshotDataUrl }, { onUploadStart } = {}) {
      if (!endpoint) throw new Error("反馈云盘尚未连接，请管理员先完成一次授权配置。");
      if (typeof fetchImpl !== "function") throw new Error("浏览器不支持自动反馈上传");
      if (activeRequest) throw codedError("UPLOAD_FAILED", "已有反馈正在提交。");
      const id = createReportId(new Date(metadata.generatedAt));
      const request = startPreparedRequest(
        () => prepareReplayDataUrl(replay),
        (replayDataUrl, signal) => fetchImpl(endpoint, {
            method: "POST",
            mode: "no-cors",
            headers: { "content-type": "text/plain;charset=UTF-8" },
            body: JSON.stringify({ id, uploadKey, metadata, replayDataUrl, screenshotDataUrl }),
            ...(signal ? { signal } : {}),
          }),
        {
          timeoutMs,
          setTimeoutImpl,
          clearTimeoutImpl,
          AbortControllerImpl,
          onRequestStart: () => onUploadStart?.(),
        },
      );
      activeRequest = request;
      try {
        await request.promise;
        return { id, destination: "google-drive" };
      } finally {
        if (activeRequest === request) activeRequest = null;
      }
    },
    cancel() { return activeRequest?.cancel() ?? false; },
  });
}

export function createConfiguredFeedbackUploader({
  documentTarget = globalThis.document,
  windowTarget = globalThis,
} = {}) {
  const endpoint = documentTarget?.querySelector?.('meta[name="feedback-endpoint"]')?.content ?? "";
  const uploadKey = documentTarget?.querySelector?.('meta[name="feedback-upload-key"]')?.content ?? "";
  return createGoogleDriveFeedbackUploader({ endpoint, uploadKey, fetchImpl: windowTarget.fetch?.bind(windowTarget) });
}

const FEEDBACK_ERROR_COPY = Object.freeze({
  NO_REPLAY_FRAMES: "暂时没有录到操作画面，请继续操作几秒后再提交",
  REPLAY_ENCODING_FAILED: "操作回放生成失败，截图和问题说明已保留，请稍后重试。",
  REPLAY_PREPARATION_FAILED: "回放数据准备失败，截图和问题说明已保留，请稍后重试。",
  UPLOAD_TIMEOUT: "网络或 Google 服务响应超时，回放已保留，可直接重试",
  UPLOAD_FAILED: "网络请求失败，回放已保留，可直接重试",
  UPLOAD_CANCELLED: "反馈提交已取消。",
});

export function createCookingFeedbackReporter({
  canvas,
  dialog,
  preview,
  message,
  status,
  submitButton,
  windowTarget = globalThis,
  documentTarget = globalThis.document,
  getContext = () => ({}),
  subscribeFrame,
  readFramePixels,
  recorder = createCanvasReplayRecorder({
    canvas,
    documentTarget,
    windowTarget,
    subscribeFrame,
    readFramePixels,
  }),
  uploader = createConfiguredFeedbackUploader({ documentTarget, windowTarget }),
  now = () => new Date(),
} = {}) {
  if (!canvas || !dialog || !preview || !message || !status || !submitButton) {
    throw new Error("问题反馈界面不完整");
  }
  let screenshotDataUrl = "";
  let submitting = false;
  let disposed = false;
  let cachedReplay = null;
  let sessionId = 0;
  const idleButtonText = submitButton.dataset?.idleText
    || (!submitButton.disabled && submitButton.textContent)
    || "自动上传反馈";
  submitButton.disabled = false;
  submitButton.textContent = idleButtonText;
  const setStage = (text, expectedSession) => {
    if (disposed || expectedSession !== sessionId) return false;
    status.textContent = text;
    if (submitting) submitButton.textContent = text;
    return true;
  };
  recorder.start();

  return Object.freeze({
    open() {
      if (disposed) return false;
      sessionId += 1;
      screenshotDataUrl = recorder.snapshotDataUrl();
      recorder.stop?.();
      cachedReplay = null;
      const captureDiagnostics = recorder.diagnostics?.();
      if (dialog.dataset && captureDiagnostics) {
        dialog.dataset.captureMode = captureDiagnostics.mode;
        dialog.dataset.captureHasColor = String(captureDiagnostics.hasColor);
      }
      preview.src = screenshotDataUrl;
      preview.hidden = !screenshotDataUrl;
      dialog.hidden = false;
      status.textContent = screenshotDataUrl
        ? "已截取当前画面，并保留最近 6 秒操作回放。"
        : "已保留最近 6 秒操作回放。";
      message.focus?.();
      return true;
    },
    close() {
      dialog.hidden = true;
      if (!disposed) recorder.start();
      canvas.focus?.();
      return true;
    },
    async submit() {
      if (disposed || submitting) return false;
      const submissionSession = sessionId;
      const submissionScreenshot = screenshotDataUrl;
      const reportMessage = boundedText(message.value, MAX_MESSAGE_LENGTH);
      if (!reportMessage) {
        status.textContent = "请先写一下刚才遇到了什么问题。";
        message.focus?.();
        return false;
      }
      submitting = true;
      submitButton.disabled = true;
      try {
        let replay = cachedReplay;
        if (!replay) {
          setStage("正在压缩操作回放…", submissionSession);
          replay = await recorder.exportGif({
            onProgress({ completed, total }) {
              setStage(`正在压缩操作回放 ${completed}/${total}`, submissionSession);
            },
          });
          if (disposed || submissionSession !== sessionId) return false;
          cachedReplay = replay;
        }
        if (disposed || submissionSession !== sessionId) return false;
        setStage("正在准备上传数据", submissionSession);
        const metadata = buildCookingReportMetadata({
          message: reportMessage,
          generatedAt: now().toISOString(),
          pageUrl: windowTarget.location?.href,
          userAgent: windowTarget.navigator?.userAgent,
          context: getContext(),
        });
        const result = await uploader.submit({
          metadata,
          replay,
          screenshotDataUrl: submissionScreenshot,
        }, {
          onUploadStart() {
            setStage("正在上传到反馈云盘，最多等待 20 秒", submissionSession);
          },
        });
        if (disposed || submissionSession !== sessionId) return false;
        status.textContent = `反馈已提交，编号 ${result.id ?? "已生成"}。`;
        return result;
      } catch (error) {
        if (!disposed && submissionSession === sessionId) {
          status.textContent = FEEDBACK_ERROR_COPY[error?.code]
            ?? error?.message
            ?? "反馈自动上传失败，请稍后再试。";
        }
        return false;
      } finally {
        submitting = false;
        if (!disposed) {
          submitButton.disabled = false;
          submitButton.textContent = idleButtonText;
        }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      sessionId += 1;
      cachedReplay = null;
      uploader.cancel?.();
      recorder.dispose();
      submitButton.disabled = false;
      submitButton.textContent = idleButtonText;
    },
  });
}
