export const SAUCE_CAPSULE_HOLD_MS = 300;
export const SAUCE_CAPSULE_SWIPE_THRESHOLD = 18;
export const SAUCE_CAPSULE_SWIPE_STEP = 54;
export const SAUCE_CAPSULE_LIFT_THRESHOLD = 34;
export const SAUCE_CAPSULE_LIFT_DOMINANCE = 1.1;
export const SAUCE_CAPSULE_RETURN_MS = 220;

const DEFAULT_PRESENTATION = Object.freeze({
  ketchup: Object.freeze({ label: "番茄酱", shortLabel: "番茄", color: "#d9472f" }),
  mustard: Object.freeze({ label: "芥末酱", shortLabel: "芥末", color: "#e5ad2c" }),
  "house-sauce": Object.freeze({ label: "小馆特调酱", shortLabel: "特调", color: "#e9984f" }),
});

function requireFunction(value, label) {
  if (typeof value !== "function") throw new TypeError(`${label} must be a function`);
  return value;
}

function normalizeSauceIds(sauceIds) {
  if (!Array.isArray(sauceIds) || sauceIds.length < 2) {
    throw new TypeError("sauceIds must contain at least two sauce ids");
  }
  const normalized = sauceIds.map((value) => {
    if (typeof value !== "string" || !value) {
      throw new TypeError("sauceIds must contain non-empty strings");
    }
    return value;
  });
  if (new Set(normalized).size !== normalized.length) {
    throw new TypeError("sauceIds must not contain duplicates");
  }
  return Object.freeze(normalized);
}

function positiveFinite(value, fallback, label) {
  const normalized = value ?? fallback;
  if (typeof normalized !== "number" || !Number.isFinite(normalized) || normalized <= 0) {
    throw new TypeError(`${label} must be a positive finite number`);
  }
  return normalized;
}

function wrapIndex(index, length) {
  return ((index % length) + length) % length;
}

function pointerPoint(event) {
  return Object.freeze({
    x: Number.isFinite(event?.clientX) ? event.clientX : 0,
    y: Number.isFinite(event?.clientY) ? event.clientY : 0,
  });
}

function suppressGestureEvent(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
}

function createElement(documentTarget, tagName, className) {
  const node = documentTarget.createElement(tagName);
  node.classList?.add(className);
  return node;
}

export function createSauceCapsuleGesture({
  element,
  sauceIds,
  initialSauceId,
  presentation = DEFAULT_PRESENTATION,
  timers = globalThis,
  holdMs = SAUCE_CAPSULE_HOLD_MS,
  swipeThresholdPx = SAUCE_CAPSULE_SWIPE_THRESHOLD,
  swipeStepPx = SAUCE_CAPSULE_SWIPE_STEP,
  liftThresholdPx = SAUCE_CAPSULE_LIFT_THRESHOLD,
  liftDominance = SAUCE_CAPSULE_LIFT_DOMINANCE,
  returnMs = SAUCE_CAPSULE_RETURN_MS,
  onSelect = () => {},
  onPickupStart = () => true,
  onPickupMove = () => {},
  onPickupCommit = () => {},
  onPickupCancel = () => {},
  onFeedback = () => {},
} = {}) {
  if (!element?.addEventListener) {
    throw new TypeError("Sauce capsule requires an event target element");
  }
  const documentTarget = element.ownerDocument ?? globalThis.document;
  if (typeof documentTarget?.createElement !== "function") {
    throw new TypeError("Sauce capsule requires a document");
  }
  const ids = normalizeSauceIds(sauceIds);
  requireFunction(onSelect, "onSelect");
  requireFunction(onPickupStart, "onPickupStart");
  requireFunction(onPickupMove, "onPickupMove");
  requireFunction(onPickupCommit, "onPickupCommit");
  requireFunction(onPickupCancel, "onPickupCancel");
  requireFunction(onFeedback, "onFeedback");
  const normalizedHoldMs = positiveFinite(holdMs, SAUCE_CAPSULE_HOLD_MS, "holdMs");
  const normalizedSwipeThreshold = positiveFinite(
    swipeThresholdPx,
    SAUCE_CAPSULE_SWIPE_THRESHOLD,
    "swipeThresholdPx",
  );
  const normalizedSwipeStep = positiveFinite(
    swipeStepPx,
    SAUCE_CAPSULE_SWIPE_STEP,
    "swipeStepPx",
  );
  const normalizedLiftThreshold = positiveFinite(
    liftThresholdPx,
    SAUCE_CAPSULE_LIFT_THRESHOLD,
    "liftThresholdPx",
  );
  const normalizedLiftDominance = positiveFinite(
    liftDominance,
    SAUCE_CAPSULE_LIFT_DOMINANCE,
    "liftDominance",
  );
  const normalizedReturnMs = positiveFinite(returnMs, SAUCE_CAPSULE_RETURN_MS, "returnMs");
  const initialIndex = ids.indexOf(initialSauceId);
  let selectedIndex = initialIndex >= 0 ? initialIndex : 0;
  let gesture = null;
  let disabled = false;
  let disposed = false;
  let feedbackTimer = null;
  let settleTimer = null;
  let visualState = "idle";

  const track = createElement(documentTarget, "div", "sauce-capsule__track");
  const prompt = createElement(documentTarget, "span", "sauce-capsule__prompt");
  const optionNodes = ids.map((sauceId) => {
    const option = createElement(documentTarget, "span", "sauce-capsule__option");
    const info = presentation[sauceId] ?? { label: sauceId, shortLabel: sauceId, color: "#d9904f" };
    option.dataset.sauceOption = sauceId;
    option.id = `sauce-capsule-option-${sauceId}`;
    option.setAttribute?.("role", "option");
    option.style?.setProperty?.("--sauce-color", info.color);
    const dot = createElement(documentTarget, "i", "sauce-capsule__dot");
    const label = createElement(documentTarget, "b", "sauce-capsule__label");
    label.textContent = info.shortLabel ?? info.label ?? sauceId;
    option.append?.(dot, label);
    return option;
  });
  track.append?.(...optionNodes);
  element.replaceChildren?.(track, prompt);
  element.dataset.sauceCapsule = "true";
  element.dataset.gestureState = "idle";
  element.setAttribute?.("role", "listbox");
  element.setAttribute?.("aria-label", "调料胶囊，左右滑动切换，长按后向上拨取用");
  element.tabIndex = 0;
  element.hidden = false;

  function selectedSauceId() {
    return ids[selectedIndex];
  }

  function setGestureState(state) {
    visualState = state;
    element.dataset.gestureState = state;
    prompt.textContent = state === "pressing"
      ? "继续按住"
      : state === "armed"
        ? "向上拨取调料"
        : state === "carrying"
          ? "拖到汉堡上松手"
          : state === "settling"
            ? "已挤上汉堡"
            : state === "returning"
              ? "未放到汉堡 · 已放回"
          : "左右滑切换 · 长按上拨取用";
  }

  function renderSelection() {
    const sauceId = selectedSauceId();
    element.dataset.selectedSauce = sauceId;
    element.setAttribute?.("aria-activedescendant", `sauce-capsule-option-${sauceId}`);
    optionNodes.forEach((node, index) => {
      const selected = index === selectedIndex;
      const position = selected
        ? "current"
        : index === wrapIndex(selectedIndex - 1, ids.length)
          ? "previous"
          : "next";
      node.dataset.selected = String(selected);
      node.dataset.position = position;
      node.style.order = position === "previous" ? "0" : position === "current" ? "1" : "2";
      node.setAttribute?.("aria-selected", String(selected));
    });
  }

  function clearFeedback() {
    if (feedbackTimer !== null) timers?.clearTimeout?.(feedbackTimer);
    feedbackTimer = null;
    delete element.dataset.feedback;
  }

  function flashFeedback(kind) {
    clearFeedback();
    element.dataset.feedback = kind;
    onFeedback(kind, selectedSauceId());
    feedbackTimer = timers?.setTimeout?.(() => {
      feedbackTimer = null;
      delete element.dataset.feedback;
    }, 240) ?? null;
  }

  function chooseIndex(index, reason = "swipe") {
    const next = wrapIndex(index, ids.length);
    if (next === selectedIndex) return false;
    selectedIndex = next;
    renderSelection();
    onSelect(Object.freeze({ sauceId: selectedSauceId(), index: selectedIndex, reason }));
    flashFeedback("select");
    return true;
  }

  function clearHoldTimer(active = gesture) {
    if (!active || active.holdTimer === null) return;
    timers?.clearTimeout?.(active.holdTimer);
    active.holdTimer = null;
  }

  function releasePointer(active = gesture) {
    if (!active) return;
    try {
      if (element.hasPointerCapture?.(active.pointerId)) {
        element.releasePointerCapture?.(active.pointerId);
      }
    } catch {
      // Pointer capture is progressive enhancement and may already be released.
    }
  }

  function clearSettleTimer() {
    if (settleTimer !== null) timers?.clearTimeout?.(settleTimer);
    settleTimer = null;
  }

  function resetGesture({ release = true, state = "idle" } = {}) {
    const active = gesture;
    gesture = null;
    clearHoldTimer(active);
    if (release) releasePointer(active);
    setGestureState(state);
  }

  function finishVisualState(state, feedback) {
    clearSettleTimer();
    resetGesture({ state });
    flashFeedback(feedback);
    settleTimer = timers?.setTimeout?.(() => {
      settleTimer = null;
      if (!disposed && !gesture) setGestureState("idle");
    }, normalizedReturnMs) ?? null;
  }

  function cancelGesture(reason, event = null) {
    const active = gesture;
    if (!active) return false;
    let callbackError = null;
    try {
      if (active.phase === "carrying") {
        onPickupCancel(Object.freeze({
          sauceId: active.sauceId,
          pointerId: active.pointerId,
          reason,
          event,
        }));
      }
    } catch (error) {
      callbackError = error;
    } finally {
      if (reason === "disposed") resetGesture();
      else finishVisualState("returning", "cancel");
    }
    if (callbackError) throw callbackError;
    return true;
  }

  function beginPickup(event) {
    if (!gesture || gesture.phase !== "armed") return false;
    const sauceId = selectedSauceId();
    let accepted;
    try {
      accepted = onPickupStart(Object.freeze({
        sauceId,
        pointerId: gesture.pointerId,
        event,
      }));
    } catch (error) {
      finishVisualState("returning", "cancel");
      throw error;
    }
    if (accepted === false) {
      cancelGesture("pickup-rejected", event);
      return false;
    }
    gesture.phase = "carrying";
    gesture.sauceId = sauceId;
    setGestureState("carrying");
    flashFeedback("pickup");
    try {
      onPickupMove(Object.freeze({ sauceId, pointerId: gesture.pointerId, event }));
    } catch (error) {
      cancelGesture("pickup-move-error", event);
      throw error;
    }
    return true;
  }

  function handlePointerDown(event) {
    if (disposed || disabled || visualState === "returning" || visualState === "settling"
      || event?.isPrimary === false) return;
    if (gesture) {
      if (event?.pointerId !== gesture.pointerId) {
        suppressGestureEvent(event);
        cancelGesture("multitouch", event);
      }
      return;
    }
    if (Number.isFinite(event?.button) && event.button !== 0) return;
    suppressGestureEvent(event);
    const origin = pointerPoint(event);
    gesture = {
      pointerId: event.pointerId,
      origin,
      last: origin,
      originIndex: selectedIndex,
      phase: "pressing",
      sauceId: null,
      holdTimer: null,
    };
    try { element.setPointerCapture?.(event.pointerId); } catch { /* optional */ }
    setGestureState("pressing");
    gesture.holdTimer = timers?.setTimeout?.(() => {
      if (!gesture || gesture.pointerId !== event.pointerId || gesture.phase !== "pressing") return;
      gesture.holdTimer = null;
      gesture.phase = "armed";
      setGestureState("armed");
      flashFeedback("armed");
    }, normalizedHoldMs) ?? null;
  }

  function handlePointerMove(event) {
    if (!gesture || event?.pointerId !== gesture.pointerId) return;
    suppressGestureEvent(event);
    const point = pointerPoint(event);
    gesture.last = point;
    if (gesture.phase === "carrying") {
      try {
        onPickupMove(Object.freeze({
          sauceId: gesture.sauceId,
          pointerId: gesture.pointerId,
          event,
        }));
      } catch (error) {
        cancelGesture("pickup-move-error", event);
        throw error;
      }
      return;
    }
    const dx = point.x - gesture.origin.x;
    const dy = point.y - gesture.origin.y;
    if (gesture.phase === "armed") {
      if (dy <= -normalizedLiftThreshold
        && -dy >= Math.abs(dx) * normalizedLiftDominance) beginPickup(event);
      return;
    }
    if (gesture.phase !== "pressing" && gesture.phase !== "selecting") return;
    if (Math.abs(dy) > normalizedSwipeThreshold && Math.abs(dy) > Math.abs(dx)) {
      cancelGesture("vertical-before-hold", event);
      return;
    }
    if (Math.abs(dx) < normalizedSwipeThreshold || Math.abs(dx) <= Math.abs(dy)) return;
    clearHoldTimer();
    gesture.phase = "selecting";
    setGestureState("selecting");
    const steps = Math.trunc((Math.abs(dx) + normalizedSwipeStep / 2) / normalizedSwipeStep);
    const direction = dx < 0 ? 1 : -1;
    chooseIndex(gesture.originIndex + direction * Math.max(1, steps));
  }

  function handlePointerUp(event) {
    if (!gesture || event?.pointerId !== gesture.pointerId) return;
    suppressGestureEvent(event);
    const active = gesture;
    if (active.phase === "carrying") {
      let outcome;
      let callbackError = null;
      try {
        outcome = onPickupCommit(Object.freeze({
          sauceId: active.sauceId,
          pointerId: active.pointerId,
          event,
        }));
      } catch (error) {
        callbackError = error;
      } finally {
        finishVisualState(
          outcome?.committed === true ? "settling" : "returning",
          outcome?.committed === true ? "drop" : "cancel",
        );
      }
      if (callbackError) throw callbackError;
      return;
    }
    const reason = active.phase === "selecting"
      ? "selection-finished"
      : active.phase === "armed"
        ? "lift-not-started"
        : "short-press";
    resetGesture();
    if (reason !== "selection-finished") flashFeedback("hint");
  }

  function handlePointerCancel(event) {
    if (!gesture || event?.pointerId !== gesture.pointerId) return;
    suppressGestureEvent(event);
    cancelGesture(event?.type === "lostpointercapture" ? "lost-pointer-capture" : "pointer-cancel", event);
  }

  function handleKeyDown(event) {
    if (disposed || disabled) return;
    if (event?.key === "ArrowLeft") {
      suppressGestureEvent(event);
      chooseIndex(selectedIndex - 1, "keyboard");
    } else if (event?.key === "ArrowRight") {
      suppressGestureEvent(event);
      chooseIndex(selectedIndex + 1, "keyboard");
    } else if (event?.key === "Escape" && gesture) {
      suppressGestureEvent(event);
      cancelGesture("escape", event);
    }
  }

  function handleDocumentKeyDown(event) {
    if (event?.key !== "Escape" || !gesture) return;
    suppressGestureEvent(event);
    cancelGesture("escape", event);
  }

  function handleVisibilityChange() {
    if (documentTarget.hidden && gesture) cancelGesture("document-hidden");
  }

  const listeners = [
    ["pointerdown", handlePointerDown],
    ["pointermove", handlePointerMove],
    ["pointerup", handlePointerUp],
    ["pointercancel", handlePointerCancel],
    ["lostpointercapture", handlePointerCancel],
    ["keydown", handleKeyDown],
  ];
  listeners.forEach(([type, listener]) => element.addEventListener(type, listener));
  const documentPointerListeners = [
    ["pointermove", handlePointerMove],
    ["pointerup", handlePointerUp],
    ["pointercancel", handlePointerCancel],
  ];
  documentPointerListeners.forEach(([type, listener]) => {
    // Capture before the canvas interaction controller. Capsule-owned pointer
    // events must be settled exactly once even after the pointer leaves the rail.
    documentTarget.addEventListener?.(type, listener, true);
  });
  documentTarget.addEventListener?.("keydown", handleDocumentKeyDown);
  documentTarget.addEventListener?.("visibilitychange", handleVisibilityChange);
  setGestureState("idle");
  renderSelection();

  return Object.freeze({
    pointerDown: handlePointerDown,
    pointerMove: handlePointerMove,
    pointerUp: handlePointerUp,
    pointerCancel: handlePointerCancel,
    getState: () => gesture?.phase ?? visualState,
    getSelectedSauceId: selectedSauceId,
    setSelectedSauceId(sauceId, reason = "programmatic") {
      const index = ids.indexOf(sauceId);
      if (index < 0) throw new TypeError(`Unknown sauce id: ${String(sauceId)}`);
      if (index === selectedIndex) return false;
      return chooseIndex(index, reason);
    },
    setDisabled(value) {
      disabled = Boolean(value);
      element.dataset.disabled = String(disabled);
      element.setAttribute?.("aria-disabled", String(disabled));
      if (disabled) cancelGesture("disabled");
      return disabled;
    },
    cancel(reason = "programmatic") {
      return cancelGesture(reason);
    },
    resetFromStage(reason = "stage-ended") {
      if (!gesture) return false;
      resetGesture();
      if (reason !== "pointer-up") flashFeedback("cancel");
      return true;
    },
    syncToolGesture(detail) {
      if (detail?.phase !== "end" || !gesture) return false;
      if (["pointer-up", "release-outside-burger", "empty-sauce-gesture"].includes(detail.reason)) {
        return false;
      }
      resetGesture();
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try {
        cancelGesture("disposed");
      } finally {
        clearFeedback();
        clearSettleTimer();
        listeners.forEach(([type, listener]) => element.removeEventListener(type, listener));
        documentPointerListeners.forEach(([type, listener]) => {
          documentTarget.removeEventListener?.(type, listener, true);
        });
        documentTarget.removeEventListener?.("keydown", handleDocumentKeyDown);
        documentTarget.removeEventListener?.("visibilitychange", handleVisibilityChange);
        element.hidden = true;
      }
    },
  });
}
