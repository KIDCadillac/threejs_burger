import {
  WORKBENCH_CONTENT_PRESENTATION,
  WORKBENCH_REGION_OPTIONS,
  WORKBENCH_SLOT_PRESENTATION,
  WORKBENCH_SLOTS,
  getNextWorkbenchSlotContent,
  normalizeWorkbenchLoadout,
  setWorkbenchSlotContent,
} from "./workbench-loadout.mjs";

export const CONDIMENT_RACK_HOLD_MS = 360;
export const CONDIMENT_RACK_SWIPE_THRESHOLD = 18;
export const CONDIMENT_RACK_PICKUP_THRESHOLD = 20;
export const CONDIMENT_RACK_AXIS_DOMINANCE = 1.1;

const SAUCE_SLOTS = Object.freeze(WORKBENCH_SLOTS.filter(({ region }) => region === "sauce"));
const SAUCE_VISUALS = Object.freeze({
  ketchup: Object.freeze({ shortLabel: "番茄", color: "#d9472f" }),
  mustard: Object.freeze({ shortLabel: "芥末", color: "#e5ad2c" }),
  "house-sauce": Object.freeze({ shortLabel: "特调", color: "#e9984f" }),
});

function requiredNode(root, selector) {
  const node = root?.querySelector?.(selector);
  if (!node) throw new TypeError(`Missing condiment-rack node: ${selector}`);
  return node;
}

function requireFunction(value, label) {
  if (typeof value !== "function") throw new TypeError(`${label} must be a function`);
  return value;
}

function positiveFinite(value, fallback, label) {
  const normalized = value ?? fallback;
  if (typeof normalized !== "number" || !Number.isFinite(normalized) || normalized <= 0) {
    throw new TypeError(`${label} must be a positive finite number`);
  }
  return normalized;
}

function pointFromEvent(event) {
  return Object.freeze({
    x: Number.isFinite(event?.clientX) ? event.clientX : 0,
    y: Number.isFinite(event?.clientY) ? event.clientY : 0,
  });
}

function suppress(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
}

function setDataset(node, name, value) {
  if (!node?.dataset) return;
  if (value === undefined || value === null || value === false) delete node.dataset[name];
  else node.dataset[name] = String(value);
}

function createNode(documentTarget, tagName, className) {
  const node = documentTarget.createElement(tagName);
  node.classList?.add(className);
  return node;
}

function findContentButton(target, boundary) {
  let current = target;
  while (current && current !== boundary) {
    if (current.dataset?.contentId) return current;
    current = current.parentNode;
  }
  return null;
}

function safeCall(callback, ...args) {
  if (typeof callback !== "function") return undefined;
  return callback(...args);
}

export function createCondimentRackControls({
  root,
  canvas,
  slots = SAUCE_SLOTS,
  initialLoadout,
  getProjectedAnchors,
  subscribeAfterFrame,
  timers = globalThis,
  holdMs = CONDIMENT_RACK_HOLD_MS,
  swipeThresholdPx = CONDIMENT_RACK_SWIPE_THRESHOLD,
  pickupThresholdPx = CONDIMENT_RACK_PICKUP_THRESHOLD,
  axisDominance = CONDIMENT_RACK_AXIS_DOMINANCE,
  onCycle = () => {},
  onChoose = () => {},
  onPickupStart = () => true,
  onPickupMove = () => {},
  onPickupCommit = () => ({ handled: true, committed: false }),
  onPickupCancel = () => {},
  onHighlight = () => {},
  onFeedback = () => {},
  onStatus = () => {},
} = {}) {
  if (!root?.addEventListener || !canvas?.getBoundingClientRect) {
    throw new TypeError("Condiment rack controls require a root and canvas");
  }
  const documentTarget = root.ownerDocument ?? globalThis.document;
  if (!documentTarget?.createElement || !documentTarget?.addEventListener) {
    throw new TypeError("Condiment rack controls require a document");
  }
  if (!Array.isArray(slots) || slots.length === 0
    || slots.some(({ region }) => region !== "sauce")) {
    throw new TypeError("Condiment rack controls require sauce slots only");
  }
  requireFunction(getProjectedAnchors, "getProjectedAnchors");
  for (const [callback, label] of [
    [onCycle, "onCycle"],
    [onChoose, "onChoose"],
    [onPickupStart, "onPickupStart"],
    [onPickupMove, "onPickupMove"],
    [onPickupCommit, "onPickupCommit"],
    [onPickupCancel, "onPickupCancel"],
    [onHighlight, "onHighlight"],
    [onFeedback, "onFeedback"],
    [onStatus, "onStatus"],
  ]) requireFunction(callback, label);

  const normalizedHoldMs = positiveFinite(holdMs, CONDIMENT_RACK_HOLD_MS, "holdMs");
  const normalizedSwipeThreshold = positiveFinite(
    swipeThresholdPx,
    CONDIMENT_RACK_SWIPE_THRESHOLD,
    "swipeThresholdPx",
  );
  const normalizedPickupThreshold = positiveFinite(
    pickupThresholdPx,
    CONDIMENT_RACK_PICKUP_THRESHOLD,
    "pickupThresholdPx",
  );
  const normalizedAxisDominance = positiveFinite(
    axisDominance,
    CONDIMENT_RACK_AXIS_DOMINANCE,
    "axisDominance",
  );

  const linesRoot = requiredNode(root, "[data-slot-lines]");
  const buttonsRoot = requiredNode(root, "[data-slot-buttons]");
  const regionsRoot = requiredNode(root, "[data-slot-regions]");
  const regionMenu = requiredNode(root, "[data-slot-region-menu]");
  const picker = requiredNode(root, "[data-slot-capsule]");
  const hint = requiredNode(root, "[data-slot-hint]");
  const slotById = new Map(slots.map((slot) => [slot.slotId, slot]));
  const buttons = new Map();
  const cleanups = [];
  let loadout = normalizeWorkbenchLoadout(initialLoadout);
  let activeGesture = null;
  let openSlotId = null;
  let openTrigger = null;
  let disabled = false;
  let hidden = false;
  let disposed = false;

  setDataset(root, "controlMode", "condiment-rack");
  setDataset(root, "controlGrammar", "horizontal-swipe hold-assign upward-drag-squeeze");
  root.hidden = false;
  linesRoot.hidden = true;
  regionsRoot.hidden = true;
  regionMenu.hidden = true;
  picker.hidden = true;
  hint.hidden = false;
  hint.textContent = "瓶身左右滑换酱 · 上拖取用 · 长按指定";

  function sauceVisual(contentId) {
    const presentation = WORKBENCH_CONTENT_PRESENTATION[contentId];
    return {
      label: presentation?.label ?? contentId,
      shortLabel: SAUCE_VISUALS[contentId]?.shortLabel ?? presentation?.label ?? contentId,
      color: SAUCE_VISUALS[contentId]?.color ?? "#d9904f",
    };
  }

  function currentContent(slotId) {
    return loadout[slotId] ?? slotById.get(slotId)?.defaultContentId;
  }

  function setState(state, slotId = activeGesture?.slotId ?? openSlotId) {
    setDataset(root, "gestureState", state);
    setDataset(root, "activeSlot", slotId);
  }

  function updateButton(button, slotId) {
    const contentId = currentContent(slotId);
    const visual = sauceVisual(contentId);
    setDataset(button, "slotId", slotId);
    setDataset(button, "contentId", contentId);
    button.setAttribute("aria-label", `${WORKBENCH_SLOT_PRESENTATION[slotId]?.label ?? slotId}，当前${visual.label}。左右滑切换，上拖取用，长按指定酱料`);
    button.setAttribute("aria-haspopup", "listbox");
    button.setAttribute("aria-expanded", String(openSlotId === slotId));
    button.setAttribute("title", `${visual.label}：左右滑换酱，上拖取用，长按指定`);
    button.style?.setProperty?.("--rack-sauce-color", visual.color);
    const swatch = createNode(documentTarget, "i", "condiment-rack-control__swatch");
    swatch.setAttribute?.("aria-hidden", "true");
    const label = createNode(documentTarget, "span", "condiment-rack-control__name");
    label.textContent = visual.shortLabel;
    button.replaceChildren?.(swatch, label);
  }

  function releaseCapture(gesture) {
    try {
      if (gesture?.button?.hasPointerCapture?.(gesture.pointerId)) {
        gesture.button.releasePointerCapture?.(gesture.pointerId);
      }
    } catch {
      // Detached controls may lose capture before cleanup.
    }
  }

  function clearHold(gesture = activeGesture) {
    if (!gesture || gesture.holdTimer === null) return;
    timers?.clearTimeout?.(gesture.holdTimer);
    gesture.holdTimer = null;
  }

  function closePicker({ restoreFocus = false } = {}) {
    if (!openSlotId) return false;
    const trigger = openTrigger;
    openSlotId = null;
    openTrigger = null;
    picker.hidden = true;
    picker.replaceChildren?.();
    setDataset(picker, "slotId", undefined);
    setDataset(root, "pickerOpen", undefined);
    trigger?.setAttribute?.("aria-expanded", "false");
    safeCall(onHighlight, trigger?.dataset?.slotId, false);
    if (restoreFocus) trigger?.focus?.();
    if (!activeGesture) setState("idle", null);
    return true;
  }

  function updatePickerPosition(trigger = openTrigger) {
    if (!trigger || !openSlotId) return;
    picker.style?.setProperty?.(
      "--capsule-x",
      trigger.style?.getPropertyValue?.("--rack-x") || "50%",
    );
    picker.style?.setProperty?.(
      "--capsule-y",
      trigger.style?.getPropertyValue?.("--rack-y") || "50%",
    );
  }

  function applyContent(callback, slotId, contentId, reason) {
    const detail = Object.freeze({ slotId, contentId, reason });
    const result = callback(detail);
    if (result === false) return false;
    loadout = normalizeWorkbenchLoadout(
      result && typeof result === "object"
        ? result
        : setWorkbenchSlotContent(loadout, slotId, contentId),
    );
    updateButton(buttons.get(slotId), slotId);
    return true;
  }

  function cycle(slotId, direction, reason = "swipe") {
    const contentId = getNextWorkbenchSlotContent(loadout, slotId, direction);
    if (!applyContent(onCycle, slotId, contentId, reason)) return false;
    safeCall(onFeedback, "switch", Object.freeze({ slotId, contentId, direction }));
    safeCall(onStatus, `已把这个位置换成${sauceVisual(contentId).label}`);
    return true;
  }

  function openPicker(slotId, trigger) {
    if (disposed || disabled || hidden || !slotById.has(slotId)) return false;
    closePicker();
    openSlotId = slotId;
    openTrigger = trigger;
    setDataset(picker, "slotId", slotId);
    setDataset(picker, "region", "sauce");
    setDataset(root, "pickerOpen", true);
    const options = WORKBENCH_REGION_OPTIONS.sauce.map((contentId) => {
      const visual = sauceVisual(contentId);
      const button = createNode(documentTarget, "button", "condiment-rack-picker__item");
      button.setAttribute("type", "button");
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(contentId === currentContent(slotId)));
      button.setAttribute("aria-label", `把这个位置指定为${visual.label}`);
      setDataset(button, "contentId", contentId);
      button.style?.setProperty?.("--rack-sauce-color", visual.color);
      const icon = createNode(documentTarget, "i", "condiment-rack-picker__icon");
      icon.setAttribute?.("aria-hidden", "true");
      const label = createNode(documentTarget, "span", "condiment-rack-picker__label");
      label.textContent = visual.shortLabel;
      button.append?.(icon, label);
      return button;
    });
    picker.replaceChildren?.(...options);
    picker.setAttribute("role", "listbox");
    picker.setAttribute("aria-label", `${WORKBENCH_SLOT_PRESENTATION[slotId]?.label ?? slotId}酱料图标选择`);
    picker.hidden = false;
    trigger.setAttribute?.("aria-expanded", "true");
    safeCall(onHighlight, slotId, true);
    safeCall(onFeedback, "open", Object.freeze({ slotId }));
    safeCall(onStatus, "选择一个图标，指定这只调料罐装什么酱");
    updatePickerPosition(trigger);
    setState("choosing", slotId);
    return true;
  }

  function finishGesture({ keepPicker = false } = {}) {
    const gesture = activeGesture;
    if (!gesture) return;
    activeGesture = null;
    clearHold(gesture);
    releaseCapture(gesture);
    setDataset(gesture.button, "active", undefined);
    if (!keepPicker) safeCall(onHighlight, gesture.slotId, false);
    if (!openSlotId) setState("idle", null);
  }

  function cancel(reason = "cancelled", { closeSelection = true } = {}) {
    const gesture = activeGesture;
    if (gesture?.mode === "carrying") {
      try {
        safeCall(onPickupCancel, Object.freeze({
          slotId: gesture.slotId,
          sauceId: currentContent(gesture.slotId),
          pointerId: gesture.pointerId,
          reason,
        }));
      } finally {
        safeCall(onFeedback, "cancel", Object.freeze({ slotId: gesture.slotId, reason }));
      }
    }
    finishGesture({ keepPicker: !closeSelection && Boolean(openSlotId) });
    if (closeSelection) closePicker();
    if (!openSlotId) setState("idle", null);
    return Boolean(gesture);
  }

  function beginGesture(button, slotId, event) {
    if (disposed || disabled || hidden || event?.isPrimary === false || event?.button > 0) return;
    suppress(event);
    if (activeGesture) cancel("second-pointer");
    closePicker();
    const origin = pointFromEvent(event);
    const gesture = {
      button,
      slotId,
      pointerId: event.pointerId,
      origin,
      mode: "pressing",
      holdTimer: null,
      cycleDirection: 0,
    };
    activeGesture = gesture;
    try { button.setPointerCapture?.(event.pointerId); } catch { /* progressive enhancement */ }
    setDataset(button, "active", true);
    safeCall(onHighlight, slotId, true);
    setState("pressing", slotId);
    safeCall(onStatus, "左右滑换酱 · 向上拖动取用 · 继续按住指定图标");
    gesture.holdTimer = timers?.setTimeout?.(() => {
      if (disposed || disabled || activeGesture !== gesture || gesture.mode !== "pressing") return;
      gesture.holdTimer = null;
      gesture.mode = "choosing";
      openPicker(slotId, button);
    }, normalizedHoldMs) ?? null;
  }

  function handlePointerMove(event) {
    const gesture = activeGesture;
    if (!gesture || event?.pointerId !== gesture.pointerId) return;
    suppress(event);
    if (gesture.mode === "carrying") {
      safeCall(onPickupMove, Object.freeze({
        slotId: gesture.slotId,
        sauceId: currentContent(gesture.slotId),
        event,
      }));
      return;
    }
    if (gesture.mode === "choosing" || gesture.mode === "swiping") return;
    const point = pointFromEvent(event);
    const dx = point.x - gesture.origin.x;
    const dy = point.y - gesture.origin.y;
    const horizontal = Math.abs(dx) >= normalizedSwipeThreshold
      && Math.abs(dx) > Math.abs(dy) * normalizedAxisDominance;
    if (horizontal) {
      clearHold(gesture);
      const direction = dx < 0 ? 1 : -1;
      if (gesture.cycleDirection === 0 && cycle(gesture.slotId, direction)) {
        gesture.cycleDirection = direction;
        gesture.mode = "swiping";
        setState("swiping", gesture.slotId);
      }
      return;
    }
    const upward = -dy >= normalizedPickupThreshold
      && -dy > Math.abs(dx) * normalizedAxisDominance;
    if (upward) {
      clearHold(gesture);
      const sauceId = currentContent(gesture.slotId);
      const started = safeCall(onPickupStart, Object.freeze({
        slotId: gesture.slotId,
        sauceId,
        event,
      }));
      if (started === false) {
        safeCall(onStatus, "现在还不能拿取这只调料罐");
        cancel("pickup-rejected");
        return;
      }
      gesture.mode = "carrying";
      setState("carrying", gesture.slotId);
      safeCall(onFeedback, "pickup", Object.freeze({ slotId: gesture.slotId, sauceId }));
      safeCall(onStatus, `正在使用${sauceVisual(sauceId).label}，拖到汉堡上松手`);
    }
  }

  function handlePointerUp(event) {
    const gesture = activeGesture;
    if (!gesture || event?.pointerId !== gesture.pointerId) return;
    suppress(event);
    if (gesture.mode !== "carrying") {
      const keepPicker = gesture.mode === "choosing" && openSlotId === gesture.slotId;
      if (gesture.mode === "pressing") {
        safeCall(onFeedback, "hint", Object.freeze({ slotId: gesture.slotId }));
        safeCall(onStatus, "向上拖动拿瓶；左右滑换酱；长按指定图标");
      }
      finishGesture({ keepPicker });
      return;
    }
    const sauceId = currentContent(gesture.slotId);
    let result;
    try {
      result = safeCall(onPickupCommit, Object.freeze({
        slotId: gesture.slotId,
        sauceId,
        event,
      }));
      safeCall(onFeedback, result?.committed ? "drop" : "cancel", Object.freeze({
        slotId: gesture.slotId,
        sauceId,
        result,
      }));
      safeCall(onStatus, result?.committed
        ? `已挤上${sauceVisual(sauceId).label}`
        : "没有放到汉堡上，调料罐已归位");
    } finally {
      finishGesture();
    }
  }

  function handlePointerCancel(event) {
    if (!activeGesture || event?.pointerId !== activeGesture.pointerId) return;
    suppress(event);
    cancel("pointer-cancel");
  }

  function handleLostCapture(event) {
    if (!activeGesture || event?.pointerId !== activeGesture.pointerId) return;
    cancel("lost-pointer-capture");
  }

  function handleKeyDown(event, button, slotId) {
    if (disabled || hidden) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault?.();
      cycle(slotId, event.key === "ArrowLeft" ? -1 : 1, "keyboard");
    } else if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
      event.preventDefault?.();
      openPicker(slotId, button);
    } else if (event.key === "Escape") {
      event.preventDefault?.();
      cancel("escape");
    }
  }

  for (const slot of slots) {
    const button = createNode(documentTarget, "button", "condiment-rack-control");
    button.setAttribute("type", "button");
    button.setAttribute("aria-disabled", "false");
    button.hidden = true;
    updateButton(button, slot.slotId);
    const pointerDown = (event) => beginGesture(button, slot.slotId, event);
    const lostCapture = (event) => handleLostCapture(event);
    const keyDown = (event) => handleKeyDown(event, button, slot.slotId);
    button.addEventListener("pointerdown", pointerDown);
    button.addEventListener("lostpointercapture", lostCapture);
    button.addEventListener("keydown", keyDown);
    cleanups.push(() => button.removeEventListener("pointerdown", pointerDown));
    cleanups.push(() => button.removeEventListener("lostpointercapture", lostCapture));
    cleanups.push(() => button.removeEventListener("keydown", keyDown));
    buttons.set(slot.slotId, button);
  }
  buttonsRoot.replaceChildren?.(...buttons.values());

  function handlePickerClick(event) {
    const button = findContentButton(event?.target, picker);
    const contentId = button?.dataset?.contentId;
    const slotId = openSlotId;
    if (!slotId || !WORKBENCH_REGION_OPTIONS.sauce.includes(contentId)) return;
    suppress(event);
    if (applyContent(onChoose, slotId, contentId, "picker")) {
      safeCall(onFeedback, "choose", Object.freeze({ slotId, contentId }));
      safeCall(onStatus, `这只调料罐现在是${sauceVisual(contentId).label}`);
      closePicker({ restoreFocus: true });
    }
  }

  function handlePickerKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault?.();
      closePicker({ restoreFocus: true });
    }
  }

  function handleDocumentKeyDown(event) {
    if (event?.key !== "Escape") return;
    if (activeGesture || openSlotId) {
      event.preventDefault?.();
      cancel("escape");
    }
  }

  function handleVisibilityChange() {
    if (documentTarget.hidden) cancel("document-hidden");
  }

  picker.addEventListener("click", handlePickerClick);
  picker.addEventListener("keydown", handlePickerKeyDown);
  documentTarget.addEventListener("pointermove", handlePointerMove, true);
  documentTarget.addEventListener("pointerup", handlePointerUp, true);
  documentTarget.addEventListener("pointercancel", handlePointerCancel, true);
  documentTarget.addEventListener("keydown", handleDocumentKeyDown);
  documentTarget.addEventListener("visibilitychange", handleVisibilityChange);
  cleanups.push(() => picker.removeEventListener("click", handlePickerClick));
  cleanups.push(() => picker.removeEventListener("keydown", handlePickerKeyDown));
  cleanups.push(() => documentTarget.removeEventListener("pointermove", handlePointerMove, true));
  cleanups.push(() => documentTarget.removeEventListener("pointerup", handlePointerUp, true));
  cleanups.push(() => documentTarget.removeEventListener("pointercancel", handlePointerCancel, true));
  cleanups.push(() => documentTarget.removeEventListener("keydown", handleDocumentKeyDown));
  cleanups.push(() => documentTarget.removeEventListener("visibilitychange", handleVisibilityChange));

  function refresh() {
    if (disposed || hidden) return false;
    let anchors;
    try { anchors = getProjectedAnchors(); } catch { anchors = []; }
    const bySlot = new Map((Array.isArray(anchors) ? anchors : []).map((entry) => [entry.slotId, entry]));
    for (const [slotId, button] of buttons) {
      const anchor = bySlot.get(slotId);
      const visible = anchor?.visible === true
        && Number.isFinite(anchor.x) && Number.isFinite(anchor.y);
      button.hidden = !visible;
      if (!visible) continue;
      button.style?.setProperty?.("--rack-x", `${anchor.x}px`);
      button.style?.setProperty?.("--rack-y", `${anchor.y}px`);
    }
    updatePickerPosition();
    return true;
  }

  const unsubscribe = typeof subscribeAfterFrame === "function"
    ? subscribeAfterFrame(refresh)
    : null;
  refresh();

  return Object.freeze({
    refresh,
    getState: () => root.dataset?.gestureState ?? "idle",
    getOpenSlotId: () => openSlotId,
    getLoadout: () => loadout,
    setLoadout(nextLoadout) {
      if (disposed) return loadout;
      loadout = normalizeWorkbenchLoadout(nextLoadout);
      for (const [slotId, button] of buttons) updateButton(button, slotId);
      if (openSlotId) openPicker(openSlotId, openTrigger);
      return loadout;
    },
    setDisabled(value) {
      if (disposed) return true;
      const next = Boolean(value);
      if (next && !disabled) cancel("disabled");
      disabled = next;
      setDataset(root, "disabled", disabled);
      for (const button of buttons.values()) {
        button.disabled = disabled;
        button.setAttribute?.("aria-disabled", String(disabled));
      }
      return disabled;
    },
    setHidden(value) {
      if (disposed) return true;
      hidden = Boolean(value);
      if (hidden) cancel("hidden");
      root.hidden = hidden;
      if (!hidden) refresh();
      return hidden;
    },
    cancel,
    closePicker,
    dispose() {
      if (disposed) return;
      cancel("dispose");
      disposed = true;
      try { unsubscribe?.(); } catch { /* optional frame source */ }
      while (cleanups.length) {
        try { cleanups.pop()(); } catch { /* best effort */ }
      }
      buttonsRoot.replaceChildren?.();
      picker.replaceChildren?.();
      picker.hidden = true;
      root.hidden = true;
    },
  });
}
