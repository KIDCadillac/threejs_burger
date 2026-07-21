import {
  DEFAULT_BURGER_TUNING,
  normalizeBurgerTuning,
  resetBurgerIngredient,
  serializeBurgerTuning,
} from "./burger-tuning.mjs";

const INGREDIENT_IDS = Object.freeze([
  "bottom-bun",
  "patty",
  "cheese",
  "tomato",
  "lettuce",
  "pickle",
  "top-bun",
]);

const TUNING_KEYS = Object.freeze([
  "presentationScale",
  "scaleX",
  "scaleY",
  "scaleZ",
  "sinkY",
]);

export function createCookingTuningPanel({
  root,
  documentTarget = root?.ownerDocument ?? globalThis.document,
  navigatorTarget = globalThis.navigator,
  initialTuning = DEFAULT_BURGER_TUNING,
  onChange = () => {},
  onRequestClose = () => {},
} = {}) {
  if (
    !root
    || typeof root.querySelector !== "function"
    || typeof root.querySelectorAll !== "function"
  ) {
    throw new Error("Missing required tuning panel root");
  }

  let tuning = normalizeBurgerTuning(initialTuning);
  let selectedIngredient = "bottom-bun";
  let opened = false;
  let previousFocus = null;
  let disposed = false;
  let copyGeneration = 0;
  const tabs = [...root.querySelectorAll("[data-ingredient-id]")];
  const inputs = [...root.querySelectorAll("[data-tuning-key]")];
  const resetCurrent = root.querySelector('[data-action="tuning-reset-current"]');
  const resetAll = root.querySelector('[data-action="tuning-reset-all"]');
  const copyButton = root.querySelector('[data-action="tuning-copy"]');
  const closeButton = root.querySelector('[data-action="tuning-close"]');
  const status = root.querySelector("[data-tuning-status]");
  const copyFallback = root.querySelector("[data-tuning-copy-fallback]");

  function requireNode(condition, description) {
    if (!condition) {
      throw new Error(`Missing required tuning panel node: ${description}`);
    }
  }

  requireNode(tabs.length === INGREDIENT_IDS.length, "ingredient tabs");
  for (const id of INGREDIENT_IDS) {
    requireNode(
      tabs.filter((tab) => tab?.dataset?.ingredientId === id).length === 1,
      `[data-ingredient-id="${id}"]`,
    );
  }
  requireNode(inputs.length === TUNING_KEYS.length * 2, "tuning inputs");
  for (const key of TUNING_KEYS) {
    for (const type of ["range", "number"]) {
      requireNode(
        inputs.filter((input) => (
          input?.dataset?.tuningKey === key && input.type === type
        )).length === 1,
        `[data-tuning-key="${key}"][type="${type}"]`,
      );
    }
  }
  requireNode(copyButton, '[data-action="tuning-copy"]');
  requireNode(resetCurrent, '[data-action="tuning-reset-current"]');
  requireNode(resetAll, '[data-action="tuning-reset-all"]');
  requireNode(closeButton, '[data-action="tuning-close"]');
  requireNode(status, "[data-tuning-status]");
  requireNode(copyFallback, "[data-tuning-copy-fallback]");

  const listenerRemovers = [];

  function listen(target, type, listener) {
    target.addEventListener(type, listener);
    listenerRemovers.push(() => target.removeEventListener(type, listener));
  }

  function syncDom() {
    for (const tab of tabs) {
      const selected = tab.dataset.ingredientId === selectedIngredient;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }

    for (const input of inputs) {
      const key = input.dataset.tuningKey;
      if (!TUNING_KEYS.includes(key)) continue;
      const value = key === "presentationScale"
        ? tuning.global.presentationScale
        : tuning.ingredients[selectedIngredient][key];
      input.value = String(value);
    }
  }

  function selectIngredient(ingredientId, { focus = false } = {}) {
    selectedIngredient = ingredientId;
    syncDom();
    if (focus) {
      tabs.find((tab) => tab.dataset.ingredientId === selectedIngredient)?.focus?.();
    }
  }

  function focusableNodes() {
    const selectedTab = tabs.find((tab) => tab.dataset.ingredientId === selectedIngredient);
    return [
      selectedTab,
      ...inputs,
      copyButton,
      resetCurrent,
      resetAll,
      copyFallback.hidden ? null : copyFallback,
      closeButton,
    ].filter((node) => node && !node.hidden && !node.disabled && node.tabIndex !== -1);
  }

  root.hidden = true;
  root.setAttribute("aria-hidden", "true");
  syncDom();
  for (const tab of tabs) {
    listen(tab, "click", () => {
      selectIngredient(tab.dataset.ingredientId);
    });
    listen(tab, "keydown", (event) => {
      if (!opened) return;
      const currentIndex = tabs.indexOf(tab);
      let nextIndex = null;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        nextIndex = (currentIndex + 1) % tabs.length;
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = tabs.length - 1;
      }
      if (nextIndex === null) return;
      event.preventDefault?.();
      selectIngredient(tabs[nextIndex].dataset.ingredientId, { focus: true });
    });
  }
  listen(root, "keydown", (event) => {
    if (!opened) return;
    if (event.key === "Escape") {
      event.preventDefault?.();
      event.stopPropagation?.();
      onRequestClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusables = focusableNodes();
    if (!focusables.length) return;
    const currentIndex = focusables.indexOf(documentTarget?.activeElement);
    const moveToStart = currentIndex < 0 || (!event.shiftKey && currentIndex === focusables.length - 1);
    const moveToEnd = event.shiftKey && (currentIndex <= 0);
    if (!moveToStart && !moveToEnd) return;
    event.preventDefault?.();
    focusables[moveToEnd ? focusables.length - 1 : 0].focus?.();
  });
  for (const input of inputs) {
    listen(input, "input", () => {
      const key = input.dataset.tuningKey;
      const number = input.value === "" ? Number.NaN : Number(input.value);
      const next = key === "presentationScale"
        ? {
            ...tuning,
            global: { ...tuning.global, presentationScale: number },
          }
        : {
            ...tuning,
            ingredients: {
              ...tuning.ingredients,
              [selectedIngredient]: {
                ...tuning.ingredients[selectedIngredient],
                [key]: number,
              },
            },
          };
      tuning = normalizeBurgerTuning(next);
      syncDom();
      onChange(tuning);
    });
  }
  listen(resetCurrent, "click", () => {
    tuning = resetBurgerIngredient(tuning, selectedIngredient);
    syncDom();
    onChange(tuning);
  });
  listen(resetAll, "click", () => {
    tuning = DEFAULT_BURGER_TUNING;
    syncDom();
    onChange(tuning);
  });

  function isCurrentCopy(generation) {
    return !disposed && opened && generation === copyGeneration;
  }

  function showCopyFallback(json, generation) {
    if (!isCurrentCopy(generation)) return;
    copyFallback.value = json;
    copyFallback.readOnly = true;
    copyFallback.hidden = false;
    status.textContent = "复制失败，请手动复制";
    copyFallback.focus?.();
    copyFallback.select?.();
  }

  listen(copyButton, "click", () => {
    if (disposed || !opened) return;
    const generation = copyGeneration += 1;
    const json = serializeBurgerTuning(tuning);
    let write;
    try {
      if (typeof navigatorTarget?.clipboard?.writeText !== "function") {
        throw new TypeError("Clipboard API is unavailable");
      }
      write = navigatorTarget.clipboard.writeText(json);
    } catch {
      showCopyFallback(json, generation);
      return;
    }
    void Promise.resolve(write).then(
      () => {
        if (!isCurrentCopy(generation)) return;
        status.textContent = "参数已复制";
        copyFallback.hidden = true;
      },
      () => showCopyFallback(json, generation),
    ).catch(() => {});
  });

  function open() {
    if (disposed || opened) return false;
    opened = true;
    previousFocus = documentTarget?.activeElement ?? null;
    root.hidden = false;
    root.setAttribute("aria-hidden", "false");
    tabs.find((tab) => tab.dataset.ingredientId === selectedIngredient)?.focus?.();
    return true;
  }

  function close() {
    if (disposed || !opened) return false;
    opened = false;
    copyGeneration += 1;
    root.hidden = true;
    root.setAttribute("aria-hidden", "true");
    const focusTarget = previousFocus;
    previousFocus = null;
    focusTarget?.focus?.();
    return true;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    opened = false;
    copyGeneration += 1;
    previousFocus = null;
    for (const remove of listenerRemovers.splice(0)) {
      try {
        remove();
      } catch {
        // Continue removing the remaining listeners during teardown.
      }
    }
    root.hidden = true;
    root.setAttribute("aria-hidden", "true");
  }

  return Object.freeze({
    open,
    close,
    getTuning() {
      return tuning;
    },
    setTuning(next) {
      if (disposed) return tuning;
      tuning = normalizeBurgerTuning(next);
      syncDom();
      return tuning;
    },
    dispose,
  });
}
