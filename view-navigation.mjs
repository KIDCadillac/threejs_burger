export function createViewNavigation(options = {}) {
  const scrollTo = options.scrollTo
    ?? globalThis.scrollTo?.bind(globalThis);
  let currentView = null;

  return {
    enter(nextView) {
      if (nextView === currentView) return false;
      currentView = nextView;
      if (typeof scrollTo === "function") scrollTo(0, 0);
      return true;
    },
  };
}
