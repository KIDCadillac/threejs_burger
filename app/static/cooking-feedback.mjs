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

export function encodeReplayGif(frames, { delay = 250, repeat = 0 } = {}) {
  if (!Array.isArray(frames) || !frames.length) throw new Error("没有可用的操作回放画面");
  const width = frames[0].width;
  const height = frames[0].height;
  if (!width || !height) throw new Error("操作回放尺寸无效");
  const gif = GIFEncoder();
  frames.forEach((frame, index) => {
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
  });
  gif.finish();
  return gif.bytes();
}

export function createCanvasReplayRecorder({
  canvas,
  documentTarget = globalThis.document,
  windowTarget = globalThis,
  fps = 4,
  seconds = 6,
  width = 240,
  subscribeFrame,
  readFramePixels,
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
    snapshotDataUrl() {
      try {
        if (typeof readFramePixels === "function" || !frames.length) capture();
        return frameCanvas.toDataURL?.("image/png") ?? "";
      } catch {
        return "";
      }
    },
    async exportGif() {
      if (typeof readFramePixels === "function" || !frames.length) capture();
      if (!frames.length) throw new Error("暂时没有录到操作画面，请继续操作几秒后再提交");
      const replayFrames = frames.length === 1 ? [frames[0], frames[0]] : [...frames];
      const bytes = encodeReplayGif(replayFrames, { delay: Math.round(1000 / fps) });
      return new Blob([bytes], { type: "image/gif" });
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
      if (timer !== null) timerApi.clearInterval(timer);
      removeFrame?.();
      timer = null;
      removeFrame = null;
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

export function createHttpFeedbackUploader({
  endpoint = DEFAULT_ENDPOINT,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("浏览器不支持自动反馈上传");
  return Object.freeze({
    async submit({ metadata, replay, screenshotDataUrl }) {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          metadata,
          replayDataUrl: await blobToDataUrl(replay),
          screenshotDataUrl,
        }),
      });
      if (!response.ok) throw new Error(`反馈服务暂时不可用（${response.status}）`);
      return response.json();
    },
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
} = {}) {
  return Object.freeze({
    async submit({ metadata, replay, screenshotDataUrl }) {
      if (!endpoint) throw new Error("反馈云盘尚未连接，请管理员先完成一次授权配置。");
      if (typeof fetchImpl !== "function") throw new Error("浏览器不支持自动反馈上传");
      const id = createReportId(new Date(metadata.generatedAt));
      await fetchImpl(endpoint, {
        method: "POST",
        mode: "no-cors",
        headers: { "content-type": "text/plain;charset=UTF-8" },
        body: JSON.stringify({
          id,
          uploadKey,
          metadata,
          replayDataUrl: await blobToDataUrl(replay),
          screenshotDataUrl,
        }),
      });
      return { id, destination: "google-drive" };
    },
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

export function createCookingFeedbackReporter({
  canvas,
  dialog,
  preview,
  message,
  status,
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
  if (!canvas || !dialog || !preview || !message || !status) {
    throw new Error("问题反馈界面不完整");
  }
  let screenshotDataUrl = "";
  let submitting = false;
  recorder.start();

  return Object.freeze({
    open() {
      screenshotDataUrl = recorder.snapshotDataUrl();
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
      canvas.focus?.();
      return true;
    },
    async submit() {
      if (submitting) return false;
      const reportMessage = boundedText(message.value, MAX_MESSAGE_LENGTH);
      if (!reportMessage) {
        status.textContent = "请先写一下刚才遇到了什么问题。";
        message.focus?.();
        return false;
      }
      submitting = true;
      status.textContent = "正在生成 GIF 操作回放并自动上传…";
      try {
        const replay = await recorder.exportGif();
        const metadata = buildCookingReportMetadata({
          message: reportMessage,
          generatedAt: now().toISOString(),
          pageUrl: windowTarget.location?.href,
          userAgent: windowTarget.navigator?.userAgent,
          context: getContext(),
        });
        const result = await uploader.submit({ metadata, replay, screenshotDataUrl });
        status.textContent = `自动上传成功，反馈编号 ${result.id ?? "已生成"}。`;
        return result;
      } catch (error) {
        status.textContent = error?.message ?? "反馈自动上传失败，请稍后再试。";
        return false;
      } finally {
        submitting = false;
      }
    },
    dispose() { recorder.dispose(); },
  });
}
