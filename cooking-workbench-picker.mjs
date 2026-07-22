import {
  createDefaultWorkbenchLoadout,
  getWorkbenchSlot,
  normalizeWorkbenchLoadout,
  setWorkbenchSlotContent,
} from "./workbench-loadout.mjs";

const REGION_TITLES = Object.freeze({
  bread: "左侧面包",
  filling: "后排配料",
  sauce: "右侧酱料",
});

function slotNumber(slotId) {
  const value = Number.parseInt(String(slotId).match(/(\d+)$/)?.[1] ?? "", 10);
  return Number.isFinite(value) ? value : 1;
}

function requireRoot(root) {
  if (!root?.addEventListener || !root?.removeEventListener) {
    throw new TypeError("workbench picker root must be an event target");
  }
  if (!root.querySelector || !root.querySelectorAll) {
    throw new TypeError("workbench picker root must support queries");
  }
  return root;
}

export function createWorkbenchSlotPicker({
  root,
  initialLoadout = createDefaultWorkbenchLoadout(),
  onChange = () => {},
  onRequestClose = () => {},
  returnTarget = null,
} = {}) {
  requireRoot(root);
  if (typeof onChange !== "function") throw new TypeError("onChange must be a function");
  if (typeof onRequestClose !== "function") {
    throw new TypeError("onRequestClose must be a function");
  }

  const title = root.querySelector("[data-workbench-title]");
  const optionButtons = [...root.querySelectorAll("[data-workbench-content]")];
  if (!title || !optionButtons.length) {
    throw new Error("workbench picker is missing its title or candidate buttons");
  }

  let disposed = false;
  let activeSlot = null;
  let activeOptionIndex = -1;
  let loadout = normalizeWorkbenchLoadout(initialLoadout);

  const visibleOptions = () => optionButtons.filter((option) => !option.hidden);
  const focusActiveOption = () => {
    const options = visibleOptions();
    options[activeOptionIndex]?.focus?.();
  };

  const render = ({ resetRoving = false } = {}) => {
    if (!activeSlot) return;
    const currentContentId = loadout[activeSlot.slotId];
    root.dataset.slotId = activeSlot.slotId;
    title.textContent = `${REGION_TITLES[activeSlot.region]} · ${slotNumber(activeSlot.slotId)}号槽`;
    for (const option of optionButtons) {
      const visible = option.dataset.workbenchRegion === activeSlot.region;
      const current = visible && option.dataset.workbenchContent === currentContentId;
      option.hidden = !visible;
      option.dataset.current = String(current);
      option.setAttribute?.("aria-pressed", String(current));
      option.tabIndex = -1;
    }
    const options = visibleOptions();
    const currentIndex = options.findIndex(({ dataset }) => (
      dataset.workbenchContent === currentContentId
    ));
    if (resetRoving || activeOptionIndex < 0 || activeOptionIndex >= options.length) {
      activeOptionIndex = currentIndex >= 0 ? currentIndex : 0;
    }
    if (options[activeOptionIndex]) options[activeOptionIndex].tabIndex = 0;
  };

  const close = (reason = "dismissed") => {
    if (disposed || root.hidden) return false;
    root.hidden = true;
    root.setAttribute?.("aria-hidden", "true");
    activeSlot = null;
    activeOptionIndex = -1;
    onRequestClose(reason);
    returnTarget?.focus?.();
    return true;
  };

  const applyContent = (contentId, { reset = false } = {}) => {
    if (disposed || !activeSlot) return false;
    const detail = Object.freeze({
      slotId: activeSlot.slotId,
      region: activeSlot.region,
      contentId,
      ...(reset ? { reset: true } : {}),
    });
    const next = setWorkbenchSlotContent(loadout, activeSlot.slotId, contentId);
    const applied = onChange(next, detail);
    loadout = applied && typeof applied === "object"
      ? normalizeWorkbenchLoadout(applied)
      : next;
    render();
    close("selected");
    return true;
  };

  const handleClick = (event) => {
    const target = event?.target;
    const option = target?.closest?.("[data-workbench-content]");
    if (option && !option.hidden && activeSlot) {
      if (option.dataset.workbenchRegion !== activeSlot.region) return;
      applyContent(option.dataset.workbenchContent);
      return;
    }
    if (target?.closest?.("[data-workbench-reset]") && activeSlot) {
      applyContent(activeSlot.defaultContentId, { reset: true });
      return;
    }
    if (target === root || target?.closest?.("[data-workbench-close]")) close("dismissed");
  };

  const handleKeyDown = (event) => {
    if (root.hidden) return;
    if (event?.key === "Escape") {
      event.preventDefault?.();
      close("escape");
      return;
    }
    const options = visibleOptions();
    if (!options.length) return;
    const previousKeys = new Set(["ArrowLeft", "ArrowUp"]);
    const nextKeys = new Set(["ArrowRight", "ArrowDown"]);
    if (previousKeys.has(event?.key)) {
      event.preventDefault?.();
      activeOptionIndex = (activeOptionIndex - 1 + options.length) % options.length;
    } else if (nextKeys.has(event?.key)) {
      event.preventDefault?.();
      activeOptionIndex = (activeOptionIndex + 1) % options.length;
    } else if (event?.key === "Home") {
      event.preventDefault?.();
      activeOptionIndex = 0;
    } else if (event?.key === "End") {
      event.preventDefault?.();
      activeOptionIndex = options.length - 1;
    } else if (event?.key === "Enter" || event?.key === " ") {
      event.preventDefault?.();
      applyContent(options[activeOptionIndex].dataset.workbenchContent);
      return;
    } else {
      return;
    }
    options.forEach((option, index) => { option.tabIndex = index === activeOptionIndex ? 0 : -1; });
    focusActiveOption();
  };

  root.addEventListener("click", handleClick);
  try {
    root.addEventListener("keydown", handleKeyDown);
  } catch (error) {
    root.removeEventListener("click", handleClick);
    throw error;
  }
  root.hidden = true;
  root.setAttribute?.("aria-hidden", "true");

  return Object.freeze({
    open(detail) {
      if (disposed) return false;
      let slot;
      try {
        slot = getWorkbenchSlot(detail?.slotId);
      } catch {
        return false;
      }
      if (detail?.region !== slot.region) return false;
      activeSlot = slot;
      render({ resetRoving: true });
      root.hidden = false;
      root.setAttribute?.("aria-hidden", "false");
      focusActiveOption();
      return true;
    },
    close,
    getLoadout() { return loadout; },
    setLoadout(next) {
      if (disposed) return loadout;
      loadout = normalizeWorkbenchLoadout(next);
      render();
      return loadout;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeEventListener("click", handleClick);
      root.removeEventListener("keydown", handleKeyDown);
      root.hidden = true;
      root.setAttribute?.("aria-hidden", "true");
      activeSlot = null;
    },
  });
}
