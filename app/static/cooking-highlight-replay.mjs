export const HIGHLIGHT_LAYER_MILESTONES = Object.freeze([10, 20, 40, 60]);

const DEFAULT_PRE_EVENT_MS = 2_500;
const DEFAULT_POST_EVENT_MS = 600;
const DEFAULT_MAX_POST_EVENT_MS = 1_500;
const HARD_MAX_POST_EVENT_MS = 2_000;
const DEFAULT_MAX_SNAPSHOT_FRAMES = 18;
const HARD_MAX_SNAPSHOT_FRAMES = 30;
const DEFAULT_MAX_CLIPS = 3;
const HARD_MAX_CLIPS = HIGHLIGHT_LAYER_MILESTONES.length + 1;

function finiteNonNegative(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function boundedInteger(value, fallback, maximum) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0
    ? Math.min(number, maximum)
    : fallback;
}

function codedError(code, message, cause) {
  const error = new Error(message, cause === undefined ? undefined : { cause });
  error.code = code;
  return error;
}

function frozenFrameList(values, maxFrames) {
  const byTimestamp = new Map();
  for (const value of Array.isArray(values) ? values : []) {
    const timestamp = Number(value?.timestamp);
    if (!Number.isFinite(timestamp)) continue;
    byTimestamp.set(timestamp, Object.freeze({ ...value, timestamp }));
  }
  const ordered = [...byTimestamp.values()]
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(-maxFrames);
  return Object.freeze(ordered);
}

function replayBlob(value) {
  return value?.blob ?? value;
}

export function createCookingHighlightReplayCoordinator({
  recorder,
  URLImpl = globalThis.URL,
  now = () => globalThis.performance?.now?.() ?? Date.now(),
  initialLayerCount = 0,
  initialFinished = false,
  preEventMs = DEFAULT_PRE_EVENT_MS,
  postEventMs = DEFAULT_POST_EVENT_MS,
  maxPostEventMs = DEFAULT_MAX_POST_EVENT_MS,
  maxSnapshotFrames = DEFAULT_MAX_SNAPSHOT_FRAMES,
  maxClips = DEFAULT_MAX_CLIPS,
  setTimeoutImpl = globalThis.setTimeout?.bind(globalThis),
  clearTimeoutImpl = globalThis.clearTimeout?.bind(globalThis),
  onClip = () => {},
  onError = () => {},
} = {}) {
  if (typeof recorder?.snapshotFrames !== "function" || typeof recorder?.exportVideo !== "function") {
    throw new TypeError("a replay recorder with snapshotFrames and exportVideo is required");
  }
  if (typeof URLImpl?.createObjectURL !== "function") {
    throw new TypeError("URL.createObjectURL is required");
  }

  const preWindowMs = finiteNonNegative(preEventMs, DEFAULT_PRE_EVENT_MS);
  const postWindowLimit = Math.min(
    finiteNonNegative(maxPostEventMs, DEFAULT_MAX_POST_EVENT_MS),
    HARD_MAX_POST_EVENT_MS,
  );
  const postWindowMs = Math.min(
    finiteNonNegative(postEventMs, DEFAULT_POST_EVENT_MS),
    postWindowLimit,
  );
  const frameLimit = boundedInteger(
    maxSnapshotFrames,
    DEFAULT_MAX_SNAPSHOT_FRAMES,
    HARD_MAX_SNAPSHOT_FRAMES,
  );
  const clipLimit = boundedInteger(maxClips, DEFAULT_MAX_CLIPS, HARD_MAX_CLIPS);
  const startingLayerCount = finiteNonNegative(initialLayerCount, 0);
  const seen = new Set(
    HIGHLIGHT_LAYER_MILESTONES
      .filter((milestone) => milestone <= startingLayerCount)
      .map((milestone) => `layers-${milestone}`),
  );
  if (initialFinished) seen.add("finish");
  const clips = [];
  const pendingWaits = new Map();
  const activeBatches = new Set();
  let previousLayerCount = startingLayerCount;
  let previousFinished = Boolean(initialFinished);
  let exportTail = Promise.resolve();
  let disposed = false;

  const reportError = (error, event) => {
    try { onError(error, event); } catch { /* lifecycle callbacks are isolated */ }
  };

  const revokeUrl = (url) => {
    try { URLImpl.revokeObjectURL?.(url); } catch { /* best effort */ }
  };

  const removeClipAt = (index) => {
    if (index < 0 || index >= clips.length) return false;
    const [removed] = clips.splice(index, 1);
    revokeUrl(removed.url);
    return true;
  };

  const retainClip = (event, blob) => {
    if (disposed) return null;
    if (!blob || !String(blob.type).startsWith("video/") || !(blob.size > 0)) {
      throw codedError("HIGHLIGHT_VIDEO_INVALID", "Highlight export did not return a playable video Blob.");
    }
    const url = URLImpl.createObjectURL(blob);
    if (disposed) {
      revokeUrl(url);
      return null;
    }
    const clip = Object.freeze({
      id: event.id,
      kind: event.kind,
      layerCount: event.layerCount,
      createdAt: event.createdAt,
      blob,
      mimeType: blob.type,
      url,
    });
    clips.push(clip);
    while (clips.length > clipLimit) removeClipAt(0);
    try { onClip(clip); } catch (error) { reportError(error, event); }
    return clip;
  };

  const enqueueExport = (event, frames) => {
    exportTail = exportTail.then(async () => {
      if (disposed) return null;
      try {
        const result = await recorder.exportVideo({ frames });
        return retainClip(event, replayBlob(result));
      } catch (error) {
        if (!disposed) reportError(error, event);
        return null;
      }
    });
    return exportTail;
  };

  const waitForPostWindow = () => {
    if (!postWindowMs) return Promise.resolve(true);
    return new Promise((resolve, reject) => {
      let timerId;
      try {
        timerId = setTimeoutImpl(() => {
          pendingWaits.delete(timerId);
          resolve(true);
        }, postWindowMs);
      } catch (cause) {
        reject(codedError("HIGHLIGHT_TIMER_FAILED", "Highlight post-event timer failed.", cause));
        return;
      }
      pendingWaits.set(timerId, resolve);
    });
  };

  const scheduleBatch = (events, eventTimestamp) => {
    const leasedSnapshots = [];
    let batch;
    batch = (async () => {
      const preSnapshot = recorder.snapshotFrames({
        toTimestamp: eventTimestamp,
        maxDurationMs: preWindowMs,
      });
      leasedSnapshots.push(preSnapshot);
      let frames = frozenFrameList(
        preSnapshot,
        frameLimit,
      );
      const waited = await waitForPostWindow();
      if (!waited || disposed) return;
      if (postWindowMs) {
        const postSnapshot = recorder.snapshotFrames({
          fromTimestamp: eventTimestamp + 0.001,
          toTimestamp: eventTimestamp + postWindowMs,
          maxDurationMs: postWindowMs,
        });
        leasedSnapshots.push(postSnapshot);
        frames = frozenFrameList([...frames, ...postSnapshot], frameLimit);
      }
      await Promise.all(events.map((event) => enqueueExport(event, frames)));
      frames = Object.freeze([]);
    })().catch((error) => {
      if (!disposed) reportError(error, events[0]);
    }).finally(() => {
      for (const snapshot of leasedSnapshots) {
        try { snapshot?.release?.(); } catch { /* best effort */ }
      }
      leasedSnapshots.length = 0;
      activeBatches.delete(batch);
    });
    activeBatches.add(batch);
  };

  return Object.freeze({
    observe({ layerCount = 0, finished = false } = {}) {
      if (disposed) return Object.freeze([]);
      const nextLayerCount = finiteNonNegative(layerCount, 0);
      const nextFinished = Boolean(finished);
      const observedAt = finiteNonNegative(now(), 0);
      const events = [];
      for (const milestone of HIGHLIGHT_LAYER_MILESTONES) {
        const id = `layers-${milestone}`;
        if (previousLayerCount < milestone && nextLayerCount >= milestone && !seen.has(id)) {
          seen.add(id);
          events.push(Object.freeze({
            id,
            kind: "layers",
            layerCount: milestone,
            createdAt: observedAt,
          }));
        }
      }
      if (!previousFinished && nextFinished && !seen.has("finish")) {
        seen.add("finish");
        events.push(Object.freeze({
          id: "finish",
          kind: "finish",
          layerCount: nextLayerCount,
          createdAt: observedAt,
        }));
      }
      previousLayerCount = nextLayerCount;
      previousFinished = nextFinished;
      if (events.length) scheduleBatch(events, observedAt);
      return Object.freeze(events.map(({ id }) => id));
    },
    clips() {
      return Object.freeze([...clips]);
    },
    removeClip(idOrClip) {
      if (disposed) return false;
      const id = typeof idOrClip === "string" ? idOrClip : idOrClip?.id;
      return removeClipAt(clips.findIndex((clip) => clip.id === id));
    },
    async whenIdle() {
      while (activeBatches.size) {
        await Promise.allSettled([...activeBatches]);
      }
      await exportTail.catch(() => {});
      return Object.freeze([...clips]);
    },
    dispose() {
      if (disposed) return false;
      disposed = true;
      for (const [timerId, resolve] of pendingWaits) {
        try { clearTimeoutImpl?.(timerId); } catch { /* best effort */ }
        resolve(false);
      }
      pendingWaits.clear();
      try { recorder.cancelVideoExport?.(); } catch { /* best effort */ }
      while (clips.length) removeClipAt(0);
      return true;
    },
  });
}
