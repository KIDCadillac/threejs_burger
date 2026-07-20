function requiredElement(documentTarget, selector) {
  const element = documentTarget?.querySelector?.(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}

export async function startSoloCookingLoader(
  documentTarget = globalThis.document,
  {
    windowTarget = globalThis,
    importApp = () => import("./cooking-solo-app.mjs"),
    requestFrame = windowTarget?.requestAnimationFrame?.bind(windowTarget)
      ?? ((callback) => windowTarget.setTimeout(callback, 16)),
    setTimeoutFn = windowTarget?.setTimeout?.bind(windowTarget)
      ?? globalThis.setTimeout?.bind(globalThis),
    clearTimeoutFn = windowTarget?.clearTimeout?.bind(windowTarget)
      ?? globalThis.clearTimeout?.bind(globalThis),
    setIntervalFn = windowTarget?.setInterval?.bind(windowTarget),
    clearIntervalFn = windowTarget?.clearInterval?.bind(windowTarget),
    now = () => Date.now(),
  } = {},
) {
  if (typeof importApp !== "function") throw new TypeError("importApp must be a function");
  if (typeof requestFrame !== "function") throw new TypeError("requestFrame must be a function");
  if (typeof setTimeoutFn !== "function" || typeof clearTimeoutFn !== "function") {
    throw new TypeError("loading timeout functions are required");
  }
  if (typeof setIntervalFn !== "function" || typeof clearIntervalFn !== "function") {
    throw new TypeError("loading interval functions are required");
  }
  if (typeof now !== "function") throw new TypeError("now must be a function");

  const elements = {
    loading: requiredElement(documentTarget, "#cooking-loading"),
    phase: requiredElement(documentTarget, "#cooking-loading-phase"),
    percent: requiredElement(documentTarget, "#cooking-loading-percent"),
    note: requiredElement(documentTarget, "#cooking-loading-note"),
    bar: requiredElement(documentTarget, "#cooking-loading-bar"),
    error: requiredElement(documentTarget, "#cooking-error"),
    status: requiredElement(documentTarget, "#cooking-status"),
  };
  const startedAt = now();
  let intervalId = null;
  let intervalCleared = false;

  const update = (percent, phase) => {
    const normalized = Math.max(0, Math.min(100, Math.round(percent)));
    elements.phase.textContent = phase;
    elements.percent.textContent = `${normalized}%`;
    elements.bar.style.width = `${normalized}%`;
    elements.loading.dataset.progress = String(normalized);
  };
  const updatePassiveProgress = () => {
    const elapsed = Math.max(0, now() - startedAt);
    if (elapsed >= 8_000) elements.note.textContent = "网络较慢，仍在继续加载";
    const passiveProgress = Math.min(68, 8 + Math.floor(elapsed / 1_500) * 12);
    const current = Number.parseInt(elements.percent.textContent, 10);
    if (!Number.isFinite(current) || current < passiveProgress) {
      update(passiveProgress, elements.phase.textContent || "正在连接料理台");
    }
  };
  const clearProgressLoop = () => {
    if (intervalCleared || intervalId === null) return;
    intervalCleared = true;
    clearIntervalFn(intervalId);
  };
  const waitForFirstFrame = () => new Promise((resolve) => {
    let settled = false;
    let timeoutId = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timeoutId !== null) clearTimeoutFn(timeoutId);
      resolve();
    };
    timeoutId = setTimeoutFn(finish, 750);
    try {
      requestFrame(finish);
    } catch (error) {
      clearTimeoutFn(timeoutId);
      throw error;
    }
  });

  elements.loading.hidden = false;
  elements.error.hidden = true;
  elements.note.textContent = "首次打开会准备三维食材";
  update(8, "正在连接料理台");
  updatePassiveProgress();
  intervalId = setIntervalFn(updatePassiveProgress, 250);

  try {
    const app = await importApp();
    if (typeof app?.bootSoloCookingPage !== "function") {
      throw new TypeError("Cooking page module is missing bootSoloCookingPage");
    }
    update(82, "正在摆放 3D 食材和工具");
    const stage = app.bootSoloCookingPage(documentTarget, {
      windowTarget,
      manageLoading: false,
    });
    if (!stage) throw new Error(elements.status.textContent || "无法启动三维料理台");
    update(94, "正在完成第一帧");
    await waitForFirstFrame();
    update(100, "料理台准备完成");
    elements.loading.hidden = true;
    clearProgressLoop();
    return stage;
  } catch (error) {
    clearProgressLoop();
    elements.loading.hidden = true;
    elements.error.hidden = false;
    elements.status.textContent = error?.message ?? "无法加载三维料理台";
    return null;
  }
}

if (globalThis.document) {
  startSoloCookingLoader(globalThis.document);
}
