const REQUIRED_STAGE_METHODS = Object.freeze([
  "reset",
  "replaceState",
  "setBurgerFocus",
  "setInteractionPaused",
  "getState",
  "resetCamera",
]);

export function createBurgerShopStageAdapter(stage) {
  if (!stage || typeof stage !== "object") {
    throw new TypeError("burger shop stage adapter requires a stage");
  }
  for (const method of REQUIRED_STAGE_METHODS) {
    if (typeof stage[method] !== "function") {
      throw new TypeError(`burger shop stage is missing ${method}()`);
    }
  }

  return Object.freeze({
    startOrder({ restoredState = null } = {}) {
      stage.setBurgerFocus(false);
      stage.setInteractionPaused(true);
      if (restoredState) stage.replaceState(restoredState);
      else stage.reset();
      return stage.getState();
    },
    setCooking(active) {
      return stage.setInteractionPaused(!active);
    },
    serve() {
      stage.setBurgerFocus(false);
      stage.setInteractionPaused(true);
      return stage.getState();
    },
    getCookingState() {
      return stage.getState();
    },
    focus(active) {
      return stage.setBurgerFocus(Boolean(active));
    },
    resetCamera() {
      return stage.resetCamera();
    },
    undo() {
      return typeof stage.undo === "function" ? stage.undo() : false;
    },
    toggleFocus() {
      if (typeof stage.toggleBurgerFocus === "function") {
        return stage.toggleBurgerFocus();
      }
      return false;
    },
  });
}
