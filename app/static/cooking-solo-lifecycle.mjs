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
} = {}) {
  requireEvents(documentTarget, "documentTarget");
  requireEvents(windowTarget, "windowTarget");
  if (!stage?.host || typeof stage.dispose !== "function") {
    throw new TypeError("stage must expose host and dispose");
  }
  if (typeof onClick !== "function") throw new TypeError("onClick must be a function");
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
      documentTarget.removeEventListener("click", onClick);
      windowTarget.removeEventListener("resize", resize);
      windowTarget.removeEventListener("pagehide", pagehide);
      windowTarget.removeEventListener("pageshow", pageshow);
      if (activePages.get(documentTarget) === lifecycle) activePages.delete(documentTarget);
      stage.dispose();
    },
  });
  documentTarget.addEventListener("click", onClick);
  windowTarget.addEventListener("resize", resize, { passive: true });
  windowTarget.addEventListener("pagehide", pagehide);
  windowTarget.addEventListener("pageshow", pageshow);
  activePages.set(documentTarget, lifecycle);
  return lifecycle;
}
