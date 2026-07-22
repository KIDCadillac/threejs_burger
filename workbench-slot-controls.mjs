import {
  WORKBENCH_CONTENT_PRESENTATION,
  WORKBENCH_REGION_OPTIONS,
  WORKBENCH_SLOT_PRESENTATION,
  WORKBENCH_SLOTS,
  getNextWorkbenchSlotContent,
  normalizeWorkbenchLoadout,
} from "./workbench-loadout.mjs";
import {
  SLOT_CONTROL_COMPACT_WIDTH,
  SLOT_CONTROL_MAX_ANCHOR_DISTANCE,
  layoutWorkbenchSlotControls,
} from "./workbench-slot-control-layout.mjs";

export const WORKBENCH_SLOT_CONTROLS_ONBOARDING_KEY = "workbench-slot-controls-onboarded:v1";
export const WORKBENCH_SLOT_CONTROL_LONG_PRESS_MS = 350;
export const WORKBENCH_SLOT_CONTROL_DRAG_SLOP = 8;

const REGION_PRESENTATION = Object.freeze({
  bread: Object.freeze({ label: "面包", icon: "🍞" }),
  filling: Object.freeze({ label: "配料", icon: "🥩" }),
  sauce: Object.freeze({ label: "酱料", icon: "🥫" }),
});

function optionalCall(callback, ...args) {
  if (typeof callback === "function") return callback(...args);
  return undefined;
}

function getRequiredNode(root, selector) {
  const node = root?.querySelector?.(selector);
  if (!node) throw new TypeError(`Missing workbench slot-control node: ${selector}`);
  return node;
}

function setDataset(element, name, value) {
  if (!element?.dataset) return;
  if (value === undefined || value === null || value === false) delete element.dataset[name];
  else element.dataset[name] = String(value);
}

function createButton(documentTarget, className) {
  const button = documentTarget.createElement("button");
  button.setAttribute("type", "button");
  button.classList?.add(className);
  return button;
}

function pointerPosition(event) {
  return {
    x: Number.isFinite(event?.clientX) ? event.clientX : 0,
    y: Number.isFinite(event?.clientY) ? event.clientY : 0,
  };
}

function safeStorageGet(storage, key) {
  try { return storage?.getItem?.(key) ?? null; } catch { return null; }
}

function safeStorageSet(storage, key, value) {
  try { storage?.setItem?.(key, value); } catch { /* onboarding is optional */ }
}

function safeReducedMotion(matchMedia) {
  try { return Boolean(matchMedia?.("(prefers-reduced-motion: reduce)")?.matches); }
  catch { return false; }
}

export function createWorkbenchSlotControls({
  root,
  canvas,
  slots = WORKBENCH_SLOTS,
  initialLoadout,
  getProjectedAnchors,
  subscribeAfterFrame,
  onCycle,
  onChoose,
  onPreview,
  onOpenPicker,
  onHighlight,
  storage = globalThis.localStorage,
  timers = globalThis,
  matchMedia = globalThis.matchMedia,
} = {}) {
  if (!root || !canvas) throw new TypeError("Workbench slot controls require root and canvas");
  const documentTarget = root.ownerDocument ?? globalThis.document;
  if (typeof documentTarget?.createElement !== "function") {
    throw new TypeError("Workbench slot controls require a document");
  }
  if (!Array.isArray(slots) || slots.length === 0) {
    throw new TypeError("Workbench slot controls require slots");
  }

  const linesRoot = getRequiredNode(root, "[data-slot-lines]");
  const buttonsRoot = getRequiredNode(root, "[data-slot-buttons]");
  const regionsRoot = getRequiredNode(root, "[data-slot-regions]");
  const regionMenu = getRequiredNode(root, "[data-slot-region-menu]");
  const slotCapsule = getRequiredNode(root, "[data-slot-capsule]");
  const hint = getRequiredNode(root, "[data-slot-hint]");
  const slotById = new Map(slots.map((slot) => [slot.slotId, slot]));
  let loadout = normalizeWorkbenchLoadout(initialLoadout);
  let hidden = false;
  let disposed = false;
  let activeGesture = null;
  let openRegion = null;
  let openRegionTrigger = null;
  let openCapsuleSlotId = null;
  let openCapsuleTrigger = null;
  let buttonSignature = "";
  let regionSignature = "";
  const independentButtons = new Map();
  const regionButtons = new Map();
  const cleanups = [];

  const reducedMotion = safeReducedMotion(matchMedia);
  const firstVisit = safeStorageGet(storage, WORKBENCH_SLOT_CONTROLS_ONBOARDING_KEY) === null;
  if (firstVisit) {
    safeStorageSet(storage, WORKBENCH_SLOT_CONTROLS_ONBOARDING_KEY, "1");
    hint.hidden = false;
    if (!reducedMotion) root.classList?.add("is-onboarding");
  } else {
    hint.hidden = true;
  }
  root.hidden = false;
  regionMenu.hidden = true;
  slotCapsule.hidden = true;

  function closeSlotCapsule({ restoreFocus = true } = {}) {
    if (!openCapsuleSlotId) return;
    const trigger = openCapsuleTrigger;
    openCapsuleSlotId = null;
    openCapsuleTrigger = null;
    slotCapsule.hidden = true;
    slotCapsule.replaceChildren?.();
    setDataset(slotCapsule, "slotId", undefined);
    if (restoreFocus) trigger?.focus?.();
  }

  function openSlotCapsule(slotId, trigger) {
    const detail = currentDetail(slotId);
    if (!detail || disposed || hidden) return false;
    const returnTrigger = openRegion ? openRegionTrigger : trigger;
    closeRegionMenu({ restoreFocus: false });
    closeSlotCapsule({ restoreFocus: false });
    openCapsuleSlotId = slotId;
    openCapsuleTrigger = returnTrigger;
    setDataset(slotCapsule, "slotId", slotId);
    setDataset(slotCapsule, "region", detail.slot.region);
    slotCapsule.style?.setProperty?.(
      "--capsule-x",
      trigger?.style?.getPropertyValue?.("--slot-x") || "50%",
    );
    slotCapsule.style?.setProperty?.(
      "--capsule-y",
      trigger?.style?.getPropertyValue?.("--slot-y") || "50%",
    );
    const candidates = WORKBENCH_REGION_OPTIONS[detail.slot.region].map((contentId, index) => {
      const button = createButton(documentTarget, "workbench-slot-capsule__item");
      const presentation = WORKBENCH_CONTENT_PRESENTATION[contentId];
      setDataset(button, "contentId", contentId);
      button.textContent = `${presentation?.icon ?? ""} ${presentation?.label ?? contentId}`.trim();
      button.setAttribute("aria-pressed", String(contentId === detail.contentId));
      button.tabIndex = contentId === detail.contentId ? 0 : -1;
      if (index === 0 && !WORKBENCH_REGION_OPTIONS[detail.slot.region].includes(detail.contentId)) {
        button.tabIndex = 0;
      }
      return button;
    });
    slotCapsule.replaceChildren?.(...candidates);
    slotCapsule.hidden = false;
    candidates.find(({ tabIndex }) => tabIndex === 0)?.focus?.();
    return true;
  }

  function currentDetail(slotId) {
    const slot = slotById.get(slotId);
    if (!slot) return null;
    const contentId = loadout[slotId];
    const nextContentId = getNextWorkbenchSlotContent(loadout, slotId);
    return { slot, contentId, nextContentId };
  }

  function readableLabel(slotId) {
    const detail = currentDetail(slotId);
    if (!detail) return "未知材料槽位";
    const slotLabel = WORKBENCH_SLOT_PRESENTATION[slotId]?.label ?? slotId;
    const current = WORKBENCH_CONTENT_PRESENTATION[detail.contentId]?.label ?? detail.contentId;
    const next = WORKBENCH_CONTENT_PRESENTATION[detail.nextContentId]?.label ?? detail.nextContentId;
    return `${slotLabel}，当前${current}，轻触切换为${next}，长按选择全部材料`;
  }

  function clearTransient(gesture = activeGesture) {
    if (!gesture) return;
    if (gesture.timerId !== null && gesture.timerId !== undefined) {
      timers?.clearTimeout?.(gesture.timerId);
      gesture.timerId = null;
    }
    setDataset(gesture.button, "active", undefined);
    optionalCall(onPreview, null);
    optionalCall(onHighlight, gesture.slotId, false);
  }

  function cancelGesture() {
    if (!activeGesture) return;
    const gesture = activeGesture;
    activeGesture = null;
    clearTransient(gesture);
    try { gesture.button.releasePointerCapture?.(gesture.pointerId); } catch { /* detached */ }
  }

  function finishGesture(event, shouldCycle) {
    const gesture = activeGesture;
    if (!gesture || event?.pointerId !== gesture.pointerId) return;
    activeGesture = null;
    clearTransient(gesture);
    try { gesture.button.releasePointerCapture?.(gesture.pointerId); } catch { /* detached */ }
    if (!disposed && shouldCycle && !gesture.longPressed && !gesture.cancelled) {
      const detail = currentDetail(gesture.slotId);
      if (detail) optionalCall(onCycle, {
        slotId: gesture.slotId,
        contentId: detail.nextContentId,
      });
    }
  }

  function armGesture(button, slotId, event) {
    if (disposed || hidden) return;
    if (activeGesture) {
      cancelGesture();
      return;
    }
    if (event?.isPrimary === false) return;
    const detail = currentDetail(slotId);
    if (!detail) return;
    const origin = pointerPosition(event);
    const gesture = {
      button,
      slotId,
      region: detail.slot.region,
      pointerId: event?.pointerId,
      origin,
      timerId: null,
      longPressed: false,
      cancelled: false,
    };
    activeGesture = gesture;
    try { button.setPointerCapture?.(gesture.pointerId); } catch { /* capture is progressive */ }
    setDataset(button, "active", true);
    optionalCall(onHighlight, slotId, true);
    optionalCall(onPreview, { slotId, contentId: detail.nextContentId });
    gesture.timerId = timers?.setTimeout?.(() => {
      if (activeGesture !== gesture || gesture.cancelled || disposed) return;
      gesture.longPressed = true;
      clearTransient(gesture);
      if (!openSlotCapsule(slotId, button)) {
        optionalCall(onOpenPicker, { slotId, region: gesture.region });
      }
    }, WORKBENCH_SLOT_CONTROL_LONG_PRESS_MS);
  }

  function moveGesture(event) {
    const gesture = activeGesture;
    if (!gesture || event?.pointerId !== gesture.pointerId) return;
    const point = pointerPosition(event);
    if (Math.hypot(point.x - gesture.origin.x, point.y - gesture.origin.y)
      > WORKBENCH_SLOT_CONTROL_DRAG_SLOP) {
      gesture.cancelled = true;
      cancelGesture();
    }
  }

  function closeRegionMenu({ restoreFocus = true } = {}) {
    if (!openRegion) return;
    const trigger = openRegionTrigger;
    openRegion = null;
    openRegionTrigger = null;
    regionMenu.hidden = true;
    regionMenu.replaceChildren?.();
    if (restoreFocus) trigger?.focus?.();
  }

  function cycleFromKeyboard(slotId) {
    const detail = currentDetail(slotId);
    if (!detail) return;
    optionalCall(onCycle, { slotId, contentId: detail.nextContentId });
  }

  function installSlotButton(button, slotId) {
    const handlePointerDown = (event) => armGesture(button, slotId, event);
    const handlePointerMove = (event) => moveGesture(event);
    const handlePointerUp = (event) => finishGesture(event, true);
    const handlePointerCancel = (event) => finishGesture(event, false);
    const handleLostCapture = (event) => finishGesture(event, false);
    const handleKeyDown = (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault?.();
        cycleFromKeyboard(slotId);
      } else if (event.key === "ArrowDown") {
        event.preventDefault?.();
        openSlotCapsule(slotId, button);
      } else if (event.key === "Escape" && openCapsuleSlotId) {
        event.preventDefault?.();
        closeSlotCapsule();
      } else if (event.key === "Escape" && openRegion) {
        event.preventDefault?.();
        closeRegionMenu();
      }
    };
    for (const [type, listener] of [
      ["pointerdown", handlePointerDown], ["pointermove", handlePointerMove],
      ["pointerup", handlePointerUp], ["pointercancel", handlePointerCancel],
      ["lostpointercapture", handleLostCapture], ["keydown", handleKeyDown],
    ]) {
      button.addEventListener(type, listener);
      cleanups.push(() => button.removeEventListener(type, listener));
    }
  }

  function updateSlotButton(button, slotId) {
    const detail = currentDetail(slotId);
    if (!detail) return;
    setDataset(button, "slotId", slotId);
    setDataset(button, "region", detail.slot.region);
    button.setAttribute("aria-label", readableLabel(slotId));
    const presentation = WORKBENCH_CONTENT_PRESENTATION[detail.contentId];
    button.textContent = `${presentation?.icon ?? "•"}`;
    button.setAttribute("title", readableLabel(slotId));
  }

  function getIndependentButton(slotId) {
    let button = independentButtons.get(slotId);
    if (!button) {
      button = createButton(documentTarget, "workbench-slot-control");
      installSlotButton(button, slotId);
      independentButtons.set(slotId, button);
    }
    updateSlotButton(button, slotId);
    return button;
  }

  function getRegionButton(region) {
    let button = regionButtons.get(region);
    if (!button) {
      button = createButton(documentTarget, "workbench-slot-region");
      const handleClick = () => openRegionMenu(region, button._slotIds ?? [], button);
      button.addEventListener("click", handleClick);
      cleanups.push(() => button.removeEventListener("click", handleClick));
      regionButtons.set(region, button);
    }
    return button;
  }

  function openRegionMenu(region, slotIds, trigger) {
    if (disposed || hidden || !REGION_PRESENTATION[region]) return false;
    cancelGesture();
    closeSlotCapsule({ restoreFocus: false });
    openRegion = region;
    openRegionTrigger = trigger;
    const menuButtons = slotIds.map((slotId) => {
      const button = createButton(documentTarget, "workbench-slot-region__item");
      installSlotButton(button, slotId);
      updateSlotButton(button, slotId);
      return button;
    });
    regionMenu.replaceChildren?.(...menuButtons);
    regionMenu.hidden = false;
    menuButtons[0]?.focus?.();
    return true;
  }

  function handleCapsuleClick(event) {
    const contentId = event?.target?.dataset?.contentId;
    if (!openCapsuleSlotId || !contentId) return;
    const slotId = openCapsuleSlotId;
    const result = optionalCall(onChoose, { slotId, contentId });
    if (result === false) return;
    closeSlotCapsule();
  }

  function handleCapsuleKeyDown(event) {
    if (!openCapsuleSlotId) return;
    const candidates = [...(slotCapsule.children ?? [])];
    if (event.key === "Escape") {
      event.preventDefault?.();
      closeSlotCapsule();
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault?.();
    const current = Math.max(0, candidates.indexOf(event.target));
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? candidates.length - 1
        : (current + (event.key === "ArrowLeft" ? -1 : 1) + candidates.length)
          % candidates.length;
    candidates.forEach((candidate, index) => { candidate.tabIndex = index === nextIndex ? 0 : -1; });
    candidates[nextIndex]?.focus?.();
  }

  slotCapsule.addEventListener("click", handleCapsuleClick);
  slotCapsule.addEventListener("keydown", handleCapsuleKeyDown);
  cleanups.push(() => slotCapsule.removeEventListener("click", handleCapsuleClick));
  cleanups.push(() => slotCapsule.removeEventListener("keydown", handleCapsuleKeyDown));

  function renderLines(individual) {
    const lines = individual.filter((entry) => (
      entry.anchorVisible === true
        && Math.hypot(entry.x - entry.anchorX, entry.y - entry.anchorY)
          <= SLOT_CONTROL_MAX_ANCHOR_DISTANCE
    )).map((entry) => {
      const line = typeof documentTarget.createElementNS === "function"
        ? documentTarget.createElementNS("http://www.w3.org/2000/svg", "line")
        : documentTarget.createElement("line");
      line.setAttribute("x1", entry.anchorX);
      line.setAttribute("y1", entry.anchorY);
      line.setAttribute("x2", entry.x);
      line.setAttribute("y2", entry.y);
      setDataset(line, "slotId", entry.slotId);
      return line;
    });
    linesRoot.replaceChildren?.(...lines);
  }

  function renderLayout(layout) {
    const nextButtonSignature = layout.individual.map(({ slotId }) => slotId).join("|");
    const buttons = layout.individual.map((entry) => {
      const button = getIndependentButton(entry.slotId);
      button.style?.setProperty?.("--slot-x", `${entry.x}px`);
      button.style?.setProperty?.("--slot-y", `${entry.y}px`);
      return button;
    });
    if (nextButtonSignature !== buttonSignature) {
      cancelGesture();
      buttonsRoot.replaceChildren?.(...buttons);
      buttonSignature = nextButtonSignature;
    }

    const nextRegionSignature = layout.regionFallbacks
      .map(({ region, slotIds }) => `${region}:${slotIds.join(",")}`)
      .join("|");
    const regions = layout.regionFallbacks.map((entry) => {
      const button = getRegionButton(entry.region);
      const presentation = REGION_PRESENTATION[entry.region];
      button._slotIds = [...entry.slotIds];
      setDataset(button, "region", entry.region);
      button.style?.setProperty?.("--slot-x", `${entry.x}px`);
      button.style?.setProperty?.("--slot-y", `${entry.y}px`);
      button.textContent = `${presentation.icon} ${entry.slotIds.length}`;
      button.setAttribute("aria-label", `${presentation.label}，${entry.slotIds.length} 个可切换槽位`);
      return button;
    });
    if (nextRegionSignature !== regionSignature) {
      regionsRoot.replaceChildren?.(...regions);
      regionSignature = nextRegionSignature;
    }
    if (openRegion && !layout.regionFallbacks.some(({ region }) => region === openRegion)) {
      closeRegionMenu({ restoreFocus: false });
    }
    renderLines(layout.individual);
  }

  function fallbackAnchors() {
    return slots.map(({ slotId, region }) => ({ slotId, region, x: 0, y: 0, visible: false }));
  }

  function refresh() {
    if (disposed || hidden) return false;
    const rect = canvas.getBoundingClientRect?.() ?? {};
    const viewport = { width: rect.width, height: rect.height };
    let anchors;
    let projectionFailed = false;
    try {
      anchors = optionalCall(getProjectedAnchors);
      if (!Array.isArray(anchors)) anchors = fallbackAnchors();
    } catch {
      anchors = fallbackAnchors();
      projectionFailed = true;
    }
    let layout;
    try {
      layout = layoutWorkbenchSlotControls({
        viewport: projectionFailed
          ? { ...viewport, width: Math.min(viewport.width, SLOT_CONTROL_COMPACT_WIDTH - 1) }
          : viewport,
        anchors,
      });
    } catch {
      return false;
    }
    renderLayout(layout);
    return true;
  }

  const unsubscribe = typeof subscribeAfterFrame === "function"
    ? subscribeAfterFrame(refresh)
    : null;
  refresh();

  return Object.freeze({
    refresh,
    setLoadout(nextLoadout) {
      if (disposed) return loadout;
      loadout = normalizeWorkbenchLoadout(nextLoadout);
      for (const [slotId, button] of independentButtons) updateSlotButton(button, slotId);
      if (!regionMenu.hidden && openRegion) {
        for (const button of regionMenu.children ?? []) {
          if (button.dataset?.slotId) updateSlotButton(button, button.dataset.slotId);
        }
      }
      return loadout;
    },
    setHidden(value) {
      if (disposed) return true;
      hidden = Boolean(value);
      root.hidden = hidden;
      if (hidden) {
        cancelGesture();
        closeRegionMenu({ restoreFocus: false });
        closeSlotCapsule({ restoreFocus: false });
      } else {
        refresh();
      }
      return hidden;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelGesture();
      closeRegionMenu({ restoreFocus: false });
      closeSlotCapsule({ restoreFocus: false });
      try { unsubscribe?.(); } catch { /* optional frame source */ }
      while (cleanups.length > 0) {
        try { cleanups.pop()(); } catch { /* best effort cleanup */ }
      }
      root.classList?.remove("is-onboarding");
      root.hidden = true;
      buttonsRoot.replaceChildren?.();
      regionsRoot.replaceChildren?.();
      linesRoot.replaceChildren?.();
    },
  });
}
