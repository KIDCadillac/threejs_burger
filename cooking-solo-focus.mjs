function safeFocus(target) {
  try {
    target?.focus?.({ preventScroll: true });
  } catch {
    // A detached or hidden node must not interrupt the completion transition.
  }
}

export function createFinishFocusManager({ dialog, returnTarget } = {}) {
  let finished = false;
  return Object.freeze({
    sync(nextFinished) {
      const next = Boolean(nextFinished);
      if (next === finished) return;
      finished = next;
      safeFocus(next ? dialog : returnTarget);
    },
  });
}
