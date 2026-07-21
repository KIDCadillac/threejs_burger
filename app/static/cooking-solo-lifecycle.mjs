const activePages = new WeakMap();

function requireEvents(target, label) {
  if (!target?.addEventListener || !target?.removeEventListener) {
    throw new TypeError(`${label} must be an event target`);
  }
  return target;
}

export function disposeActiveSoloCookingPage(documentTarget) {
  const lifecycle = activePages.get(documentTarget);
  if (!lifecycle) return false;
  lifecycle.dispose();
  return true;
}

export function mountSoloCookingLifecycle({
  documentTarget,
  windowTarget,
  stage,
  onClick,
  onDispose = () => {},
} = {}) {
  requireEvents(documentTarget, "documentTarget");
  requireEvents(windowTarget, "windowTarget");
  if (!stage?.host || typeof stage.dispose !== "function") {
    throw new TypeError("stage must expose host and dispose");
  }
  if (typeof onClick !== "function") throw new TypeError("onClick must be a function");
  if (typeof onDispose !== "function") throw new TypeError("onDispose must be a function");
  disposeActiveSoloCookingPage(documentTarget);

  let disposed = false;
  const resize = () => stage.host.resize?.();
  const pagehide = (event) => {
    if (event?.persisted) {
      stage.host.setVisible?.(false);
      return;
    }
    lifecycle.dispose();
  };
  const pageshow = (event) => {
    if (!event?.persisted || disposed) return;
    stage.host.setVisible?.(true);
    stage.host.resize?.();
  };

  const lifecycle = Object.freeze({
    dispose() {
      if (disposed) return;
      disposed = true;
      let firstError = null;
      for (const task of [
        () => documentTarget.removeEventListener("click", onClick),
        () => windowTarget.removeEventListener("resize", resize),
        () => windowTarget.removeEventListener("pagehide", pagehide),
        () => windowTarget.removeEventListener("pageshow", pageshow),
      ]) {
        try {
          task();
        } catch (error) {
          if (!firstError) firstError = error;
        }
      }
      if (activePages.get(documentTarget) === lifecycle) activePages.delete(documentTarget);
      try {
        onDispose();
      } catch (error) {
        if (!firstError) firstError = error;
      }
      try {
        stage.dispose();
      } catch (error) {
        if (!firstError) firstError = error;
      }
      if (firstError) throw firstError;
    },
  });
  const rollback = [];
  try {
    documentTarget.addEventListener("click", onClick);
    rollback.push(() => documentTarget.removeEventListener("click", onClick));
    windowTarget.addEventListener("resize", resize, { passive: true });
    rollback.push(() => windowTarget.removeEventListener("resize", resize));
    windowTarget.addEventListener("pagehide", pagehide);
    rollback.push(() => windowTarget.removeEventListener("pagehide", pagehide));
    windowTarget.addEventListener("pageshow", pageshow);
    rollback.push(() => windowTarget.removeEventListener("pageshow", pageshow));
    activePages.set(documentTarget, lifecycle);
    return lifecycle;
  } catch (error) {
    while (rollback.length) {
      try {
        rollback.pop()();
      } catch {
        // The listener registration error remains primary.
      }
    }
    throw error;
  }
}
