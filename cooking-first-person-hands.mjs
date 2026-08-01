function sideForSlot(slotId, selectedLayerId = "") {
  const normalized = String(slotId ?? "");
  if (normalized.startsWith("bread-left")) return "left";
  if (normalized.startsWith("sauce-right")) return "right";
  if (normalized.startsWith("filling-back")) {
    const index = Number.parseInt(normalized.split("-").at(-1), 10);
    return Number.isFinite(index) && index >= 3 ? "right" : "left";
  }
  const checksum = [...String(selectedLayerId)].reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );
  return checksum % 2 ? "left" : "right";
}

function selectedSlot(detail) {
  const selectedLayerId = detail?.selectedLayerId;
  if (!selectedLayerId) return null;
  return detail?.state?.locations?.[selectedLayerId]?.slotId
    ?? detail?.state?.instanceHomes?.[selectedLayerId]
    ?? null;
}

function normalizedToolPosition(detail) {
  const x = Number(detail?.position?.x);
  const y = Number(detail?.position?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return Object.freeze({
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
  });
}

export function firstPersonHandPoseForStageChange(detail = {}) {
  const selectedLayerId = detail.selectedLayerId ?? "";
  const side = sideForSlot(selectedSlot(detail), selectedLayerId);
  switch (detail.reason) {
    case "selection":
      return selectedLayerId
        ? Object.freeze({ state: "reach", side, settleAfter: 0 })
        : Object.freeze({ state: "idle", side: "center", settleAfter: 0 });
    case "drop-intent":
      return detail.dropIntent?.kind === "prep"
        ? Object.freeze({ state: "carry", side, settleAfter: 0 })
        : Object.freeze({ state: "reach", side, settleAfter: 0 });
    case "drop-layer":
      return Object.freeze({ state: "place", side, settleAfter: 360 });
    case "remove-layer":
      return Object.freeze({ state: "return", side, settleAfter: 300 });
    case "invalid-drop":
      return Object.freeze({ state: "miss", side, settleAfter: 420 });
    case "sauce-stroke":
    case "sauce-strokes":
    case "sauce-gesture":
      return Object.freeze({ state: "squeeze", side: "right", settleAfter: 420 });
    case "finish":
    case "reset":
    case "undo":
    case "continue":
    case "ready":
    case "interaction-paused":
      return Object.freeze({ state: "idle", side: "center", settleAfter: 0 });
    default:
      return null;
  }
}

export function createCookingFirstPersonHands(
  documentTarget = globalThis.document,
  {
    windowTarget = globalThis,
    setTimeoutFn = windowTarget?.setTimeout?.bind(windowTarget)
      ?? globalThis.setTimeout?.bind(globalThis),
    clearTimeoutFn = windowTarget?.clearTimeout?.bind(windowTarget)
      ?? globalThis.clearTimeout?.bind(globalThis),
  } = {},
) {
  const root = documentTarget?.querySelector?.("#first-person-hands");
  if (!root) return null;
  const previewMode = (() => {
    if (documentTarget?.body?.dataset?.debug !== "true") return null;
    try {
      const value = new URLSearchParams(windowTarget?.location?.search ?? "")
        .get("handPreview");
      return ["left", "right", "sauce"].includes(value) ? value : null;
    } catch {
      return null;
    }
  })();
  let settleTimer = null;
  let beat = 0;
  let activeToolGestureId = null;
  let activeIngredientGestureId = null;
  let activeIngredientSide = "left";

  const clearSettle = () => {
    if (settleTimer === null) return;
    clearTimeoutFn?.(settleTimer);
    settleTimer = null;
  };
  const setPose = ({ state, side = "center", settleAfter = 0 }) => {
    clearSettle();
    beat += 1;
    root.dataset.handState = state;
    root.dataset.handSide = side;
    root.dataset.handBeat = String(beat);
    if (documentTarget?.body?.dataset) {
      documentTarget.body.dataset.cookingHandState = state;
    }
    if (settleAfter > 0 && typeof setTimeoutFn === "function") {
      settleTimer = setTimeoutFn(() => {
        settleTimer = null;
        setPose({ state: "idle", side: "center" });
      }, settleAfter);
    }
  };

  const setToolPosition = (detail) => {
    const position = normalizedToolPosition(detail);
    if (!position) return null;
    root.style?.setProperty?.("--hand-tool-x", `${position.x * 100}%`);
    root.style?.setProperty?.("--hand-tool-y", `${position.y * 100}%`);
    return position;
  };

  const setIngredientPosition = (detail) => {
    const position = normalizedToolPosition(detail);
    if (!position) return null;
    root.style?.setProperty?.("--hand-ingredient-x", `${position.x * 100}%`);
    root.style?.setProperty?.("--hand-ingredient-y", `${position.y * 100}%`);
    return position;
  };

  const handleStageChange = (detail) => {
    if (["finish", "reset", "undo", "continue", "ready", "interaction-paused"]
      .includes(detail?.reason)) {
      // A lifecycle boundary owns the whole stage. Forget any interrupted
      // gesture so a late pointer event cannot revive a stale hand pose or
      // reject the next gesture because its id differs from the old one.
      activeToolGestureId = null;
      activeIngredientGestureId = null;
    }
    if (activeToolGestureId !== null
      && ["sauce-stroke", "sauce-strokes", "sauce-gesture"].includes(detail?.reason)) {
      return Object.freeze({ state: "sauce-hold", side: "right", settleAfter: 0 });
    }
    if (activeIngredientGestureId !== null
      && ["selection", "drop-intent", "drop-layer"].includes(detail?.reason)) {
      return Object.freeze({
        state: "ingredient-hold",
        side: activeIngredientSide,
        settleAfter: 0,
      });
    }
    const pose = previewMode
      ? Object.freeze({
        state: previewMode === "sauce" ? "sauce-hold" : "reach",
        side: previewMode === "left" ? "left" : "right",
        settleAfter: 0,
      })
      : firstPersonHandPoseForStageChange(detail);
    if (pose) {
      if (pose.side === "left" || pose.side === "right") {
        activeIngredientSide = pose.side;
      }
      setPose(pose);
    }
    return pose;
  };

  const handleIngredientGesture = (detail = {}) => {
    const phase = detail.phase;
    const gestureId = detail.gestureId ?? null;
    if (phase === "start") {
      if (gestureId === null) return null;
      activeIngredientGestureId = gestureId;
    } else if (phase === "move") {
      if (activeIngredientGestureId === null || gestureId !== activeIngredientGestureId) {
        return null;
      }
    }
    if (phase === "start" || phase === "move") {
      setIngredientPosition(detail);
      const side = root.dataset.handSide === "left" || root.dataset.handSide === "right"
        ? root.dataset.handSide
        : activeIngredientSide;
      activeIngredientSide = side;
      const pose = Object.freeze({ state: "ingredient-hold", side, settleAfter: 0 });
      if (root.dataset.handState !== pose.state || root.dataset.handSide !== pose.side) {
        setPose(pose);
      }
      return pose;
    }
    if (phase === "end") {
      if (activeIngredientGestureId === null || gestureId !== activeIngredientGestureId) {
        return null;
      }
      setIngredientPosition(detail);
      activeIngredientGestureId = null;
      const pose = Object.freeze({
        state: "ingredient-release",
        side: activeIngredientSide,
        settleAfter: 220,
      });
      setPose(pose);
      return pose;
    }
    return null;
  };

  const handleToolGesture = (detail = {}) => {
    const phase = detail.phase;
    const gestureId = detail.gestureId ?? null;
    if (phase === "start") {
      if (gestureId === null) return null;
      activeToolGestureId = gestureId;
    } else if (phase === "move") {
      if (activeToolGestureId === null || gestureId !== activeToolGestureId) return null;
    }
    if (phase === "start" || phase === "move") {
      setToolPosition(detail);
      const pose = Object.freeze({ state: "sauce-hold", side: "right", settleAfter: 0 });
      if (root.dataset.handState !== pose.state || root.dataset.handSide !== pose.side) {
        setPose(pose);
      }
      return pose;
    }
    if (phase === "end") {
      if (activeToolGestureId === null || gestureId !== activeToolGestureId) return null;
      setToolPosition(detail);
      activeToolGestureId = null;
      const pose = Object.freeze({ state: "sauce-release", side: "right", settleAfter: 220 });
      setPose(pose);
      return pose;
    }
    return null;
  };

  if (previewMode === "sauce") {
    setToolPosition({ position: { x: 0.79, y: 0.43 } });
  }
  setPose(previewMode
    ? {
      state: previewMode === "sauce" ? "sauce-hold" : "reach",
      side: previewMode === "left" ? "left" : "right",
    }
    : { state: "idle", side: "center" });
  return Object.freeze({
    handleStageChange,
    handleToolGesture,
    handleIngredientGesture,
    dispose() {
      clearSettle();
      activeToolGestureId = null;
      activeIngredientGestureId = null;
      root.dataset.handState = "idle";
      root.dataset.handSide = "center";
      root.style?.removeProperty?.("--hand-tool-x");
      root.style?.removeProperty?.("--hand-tool-y");
      root.style?.removeProperty?.("--hand-ingredient-x");
      root.style?.removeProperty?.("--hand-ingredient-y");
    },
  });
}
