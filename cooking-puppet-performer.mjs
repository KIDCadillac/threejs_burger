function slotSide(slotId, selectedLayerId = "") {
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

export function puppetPoseForStageChange(detail = {}) {
  const selectedLayerId = detail.selectedLayerId ?? "";
  const side = slotSide(selectedSlot(detail), selectedLayerId);
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
      return Object.freeze({ state: "place", side, settleAfter: 560 });
    case "remove-layer":
      return Object.freeze({ state: "return", side, settleAfter: 460 });
    case "invalid-drop":
      return Object.freeze({ state: "miss", side, settleAfter: 520 });
    case "sauce-stroke":
    case "sauce-strokes":
      return Object.freeze({ state: "squeeze", side: "right", settleAfter: 520 });
    case "finish":
      return Object.freeze({ state: "celebrate", side: "center", settleAfter: 0 });
    case "reset":
    case "undo":
    case "continue":
    case "ready":
      return Object.freeze({ state: "idle", side: "center", settleAfter: 0 });
    default:
      return null;
  }
}

export function createCookingPuppetPerformer(
  documentTarget = globalThis.document,
  {
    windowTarget = globalThis,
    setTimeoutFn = windowTarget?.setTimeout?.bind(windowTarget)
      ?? globalThis.setTimeout?.bind(globalThis),
    clearTimeoutFn = windowTarget?.clearTimeout?.bind(windowTarget)
      ?? globalThis.clearTimeout?.bind(globalThis),
  } = {},
) {
  const puppet = documentTarget?.querySelector?.("#puppet-chef");
  if (!puppet) return null;
  let settleTimer = null;
  let beat = 0;

  const clearSettle = () => {
    if (settleTimer === null) return;
    clearTimeoutFn?.(settleTimer);
    settleTimer = null;
  };
  const setPose = ({ state, side = "center", settleAfter = 0 }) => {
    clearSettle();
    beat += 1;
    puppet.dataset.puppetState = state;
    puppet.dataset.puppetSide = side;
    puppet.dataset.puppetBeat = String(beat);
    if (documentTarget?.body?.dataset) {
      documentTarget.body.dataset.cookingPuppetState = state;
    }
    if (settleAfter > 0 && typeof setTimeoutFn === "function") {
      settleTimer = setTimeoutFn(() => {
        settleTimer = null;
        setPose({ state: "idle", side: "center" });
      }, settleAfter);
    }
  };

  const handleStageChange = (detail) => {
    const pose = puppetPoseForStageChange(detail);
    if (pose) setPose(pose);
    return pose;
  };

  setPose({ state: "idle", side: "center" });
  return Object.freeze({
    handleStageChange,
    dispose() {
      clearSettle();
      puppet.dataset.puppetState = "idle";
      puppet.dataset.puppetSide = "center";
    },
  });
}
