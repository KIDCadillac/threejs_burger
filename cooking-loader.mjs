function requiredElement(documentTarget, selector) {
  const element = documentTarget?.querySelector?.(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}

function modeFromLocation(locationTarget) {
  try {
    const href = typeof locationTarget === "string"
      ? locationTarget
      : locationTarget?.href;
    if (!href) return "practice";
    const query = String(href).split("?")[1]?.split("#")[0] ?? "";
    return new URLSearchParams(query).get("mode") === "orders"
      ? "orders"
      : "practice";
  } catch {
    return "practice";
  }
}

export async function startSoloCookingLoader(
  documentTarget = globalThis.document,
  {
    windowTarget = globalThis,
    importApp = () => import("./cooking-solo-app.mjs?v=20260802-gameplay31"),
    importShopApp = () => import("./burger-shop-app.mjs"),
    importFirstPersonHands = () => import("./cooking-first-person-hands.mjs?v=20260802-gameplay31"),
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
  if (typeof importShopApp !== "function") {
    throw new TypeError("importShopApp must be a function");
  }
  if (typeof importFirstPersonHands !== "function") {
    throw new TypeError("importFirstPersonHands must be a function");
  }
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
    const mode = modeFromLocation(windowTarget?.location);
    try {
      const searchParams = new URL(
        windowTarget?.location?.href ?? "http://localhost/",
      ).searchParams;
      documentTarget.body.dataset.debug = searchParams.get("debug") === "1"
        ? "true"
        : "false";
      documentTarget.body.dataset.workbenchControls = searchParams.get("workbenchControls") === "1"
        ? "true"
        : "false";
    } catch {
      documentTarget.body.dataset.debug = "false";
      documentTarget.body.dataset.workbenchControls = "false";
    }
    const app = await importApp();
    if (typeof app?.bootSoloCookingPage !== "function") {
      throw new TypeError("Cooking page module is missing bootSoloCookingPage");
    }
    update(82, "正在摆放 3D 食材和工具");
    const handModule = await importFirstPersonHands();
    const handPerformer = handModule?.createCookingFirstPersonHands?.(
      documentTarget,
      { windowTarget },
    ) ?? null;
    let shopController = null;
    let pendingStageChange = null;
    const debugStageTrace = [];
    const debugIngredientTrace = [];
    const stage = app.bootSoloCookingPage(documentTarget, {
      windowTarget,
      manageLoading: false,
      openRecipePicker: mode !== "orders",
      mountDefaultActions: mode !== "orders",
      onToolGesture: (detail) => handPerformer?.handleToolGesture?.(detail),
      onInteractionPause: (detail) => handPerformer?.handleStageChange?.(detail),
      onIngredientGesture: (detail) => {
        handPerformer?.handleIngredientGesture?.(detail);
        if (documentTarget.body.dataset.debug === "true") {
          documentTarget.body.dataset.debugIngredientGesture = JSON.stringify(detail);
          debugIngredientTrace.push({
            phase: detail?.phase ?? null,
            gestureId: detail?.gestureId ?? null,
            layerId: detail?.layerId ?? null,
            position: detail?.position ?? null,
            reason: detail?.reason ?? null,
          });
          if (debugIngredientTrace.length > 24) debugIngredientTrace.shift();
          documentTarget.body.dataset.debugIngredientTrace = JSON.stringify(
            debugIngredientTrace,
          );
        }
      },
      onStageChange: (detail) => {
        pendingStageChange = detail;
        if (documentTarget.body.dataset.debug === "true" && detail?.state) {
          debugStageTrace.push({
            reason: detail.reason,
            selectedLayerId: detail.selectedLayerId ?? null,
            order: detail.state.assembledOrder.map((id) => detail.state.instances[id]),
            strokes: detail.state.strokes.map(({ sauce, layerId }) => ({ sauce, layerId })),
          });
          if (debugStageTrace.length > 16) debugStageTrace.shift();
          documentTarget.body.dataset.debugStageTrace = JSON.stringify(debugStageTrace);
        }
        handPerformer?.handleStageChange?.(detail);
        shopController?.handleStageChange?.(detail);
      },
    });
    if (mode === "orders" && stage) {
      const shopApp = await importShopApp();
      if (typeof shopApp?.bootBurgerShopPage !== "function") {
        throw new TypeError("Cooking shop module is missing bootBurgerShopPage");
      }
      shopController = shopApp.bootBurgerShopPage(documentTarget, {
        windowTarget,
        stage,
      });
      if (!shopController) throw new Error("Unable to start burger shop order mode");
      if (pendingStageChange) shopController.handleStageChange?.(pendingStageChange);
    }
    if (!stage) throw new Error(elements.status.textContent || "无法启动三维料理台");
    if (documentTarget.body.dataset.debug === "true") {
      try {
        const debugSeed = new URL(windowTarget?.location?.href ?? "http://localhost/")
          .searchParams.get("debugSeed");
        if (debugSeed === "patty") {
          stage.reset?.();
          stage.dropLayer?.("bottom-bun", { kind: "prep" });
          stage.dropLayer?.("patty", { kind: "prep" });
        }
      } catch {
        // Debug seeding is optional and must never block the actual game.
      }
    }
    update(94, "正在完成第一帧");
    await waitForFirstFrame();
    if (documentTarget.body.dataset.debug === "true") {
      const canvas = documentTarget.querySelector("#cooking-canvas");
      const rect = canvas?.getBoundingClientRect?.();
      const camera = stage.host?.camera;
      const projectAnchor = (anchor) => {
        if (!rect || !camera || !anchor?.getWorldPosition) return null;
        const point = anchor.getWorldPosition(anchor.position.clone()).project(camera);
        return {
          x: rect.left + (point.x + 1) * 0.5 * rect.width,
          y: rect.top + (1 - point.y) * 0.5 * rect.height,
        };
      };
      const pickups = stage.getSlotControlAnchors().map(({ slotId }) => ({
        slotId,
        point: projectAnchor(stage.workbench.getStationBySlot(slotId)?.pickupAnchor),
      }));
      const assembledOrder = stage.getState?.()?.assembledOrder ?? [];
      const topLayerId = assembledOrder[assembledOrder.length - 1] ?? null;
      const topLayerSurface = topLayerId
        ? stage.burger?.getLayer?.(topLayerId)?.userData?.selectableSurface
        : null;
      documentTarget.body.dataset.debugPickupPoints = JSON.stringify({
        prep: projectAnchor(stage.workbench.prep?.dropAnchor),
        pickups,
      });
      documentTarget.body.dataset.debugSauceTargetPoint = JSON.stringify({
        layerId: topLayerId,
        point: projectAnchor(topLayerSurface),
      });
    }
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
