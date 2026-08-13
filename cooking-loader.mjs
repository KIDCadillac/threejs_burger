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
    importApp = () => import("./cooking-solo-app.mjs?v=20260813-gameplay32u"),
    importShopApp = () => import("./burger-shop-app.mjs"),
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
    let shopController = null;
    let pendingStageChange = null;
    let stage = null;
    const debugStageTrace = [];
    const debugIngredientTrace = [];
    const refreshDebugInteractionPoints = () => {
      if (documentTarget.body.dataset.debug !== "true" || !stage) return;
      const canvas = documentTarget.querySelector("#cooking-canvas");
      const rect = canvas?.getBoundingClientRect?.();
      const camera = stage.host?.camera;
      const projectAnchor = (anchor) => {
        if (!rect || !camera || !anchor?.getWorldPosition) return null;
        anchor.updateWorldMatrix?.(true, false);
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
    };
    stage = app.bootSoloCookingPage(documentTarget, {
      windowTarget,
      manageLoading: false,
      openRecipePicker: mode !== "orders",
      mountDefaultActions: mode !== "orders",
      onToolGesture: (detail) => {
        if (documentTarget.body.dataset.debug === "true") {
          documentTarget.body.dataset.debugToolGesture = JSON.stringify(detail);
        }
      },
      onIngredientGesture: (detail) => {
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
          refreshDebugInteractionPoints();
        }
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
      documentTarget.body.dataset.debugHandRig = "procedural-3d";
      documentTarget.body.dataset.debugHandMeshes = String(
        stage.hands?.root?.children?.length ?? 0,
      );
      documentTarget.body.dataset.debugStageHandle = "ready";
      documentTarget.body.setAttribute("data-debug-stage-handle", "ready");
      // QA-only raw WebGL access. This never mounts an image into the game;
      // it lets the deterministic acceptance run inspect the rendered 3D
      // frame and motion state without relying on browser screenshots.
      windowTarget.__burgerCookingDebug = Object.freeze({
        getState: () => stage.getDebugState?.() ?? null,
        readFramePixels: (options) => {
          const frame = stage.readFramePixels?.(options);
          if (!frame) return null;
          return Object.freeze({
            width: frame.width,
            height: frame.height,
            flippedY: Boolean(frame.flippedY),
            rgba: Array.from(frame.rgba),
          });
        },
      });
      const encodeBytes = (bytes) => {
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        }
        return windowTarget.btoa(binary);
      };
      documentTarget.body.dataset.debugStateRequest = "0";
      documentTarget.body.dataset.debugStateRequest1 = "idle";
      documentTarget.body.dataset.debugStateRequest2 = "idle";
      documentTarget.body.dataset.debugFrameRequest = JSON.stringify({
        width: 200,
        height: 150,
        serial: 0,
      });
      documentTarget.body.dataset.debugFrameRequest1 = JSON.stringify({
        width: 200,
        height: 150,
        serial: 1,
      });
      documentTarget.body.dataset.debugMotionState = "null";
      documentTarget.body.dataset.debugFrameWidth = "0";
      documentTarget.body.dataset.debugFrameHeight = "0";
      documentTarget.body.dataset.debugFrameFlippedY = "false";
      documentTarget.body.dataset.debugFramePixels = "";
      documentTarget.body.dataset.debugFrameSerial = "0";
      documentTarget.body.dataset.debugHandRequest = JSON.stringify({
        side: "left",
        phase: "reach",
        ingredientId: "bottom-bun",
        position: { x: -0.8, y: 1.2, z: 0.3 },
      });
      documentTarget.body.dataset.debugStageRequest = JSON.stringify({
        ingredientId: "bottom-bun",
        position: { x: -1.45, y: 1.35, z: 0.35 },
        freeze: true,
      });
      documentTarget.body.dataset.debugTickTime = "0";
      for (let debugTickIndex = 1; debugTickIndex <= 8; debugTickIndex += 1) {
        documentTarget.body.dataset[`debugTickTime${debugTickIndex}`] = "0";
      }
      documentTarget.body.dataset.debugStageResponse = "idle";
      documentTarget.body.dataset.debugMotionStartedAt = "0";
      const respondWithDebugState = () => {
        documentTarget.body.dataset.debugMotionState = JSON.stringify(
          stage.getDebugState?.() ?? null,
        );
      };
      const respondWithDebugFrame = () => {
        let requested = {};
        try {
          requested = JSON.parse(documentTarget.body.dataset.debugFrameRequest || "{}");
        } catch {
          requested = {};
        }
        const frame = stage.readFramePixels?.(requested);
        if (!frame) {
          documentTarget.body.dataset.debugFramePixels = "";
          return;
        }
        documentTarget.body.dataset.debugFrameWidth = String(frame.width);
        documentTarget.body.dataset.debugFrameHeight = String(frame.height);
        documentTarget.body.dataset.debugFrameFlippedY = frame.flippedY ? "true" : "false";
        documentTarget.body.dataset.debugFramePixels = encodeBytes(frame.rgba);
        documentTarget.body.dataset.debugFrameSerial = String(
          Number(documentTarget.body.dataset.debugFrameSerial || 0) + 1,
        );
      };
      documentTarget.addEventListener("burger-cooking-debug-request-state", respondWithDebugState);
      documentTarget.addEventListener("burger-cooking-debug-request-frame", respondWithDebugFrame);
      let debugControlIndex = 0;
      const createDebugControl = (testId, label, handler) => {
        const control = documentTarget.createElement("button");
        control.type = "button";
        control.dataset.testid = testId;
        control.setAttribute("aria-label", label);
        control.textContent = label;
        const debugControlLeft = 8 + (debugControlIndex % 8) * 52;
        const debugControlTop = 1180 + Math.floor(debugControlIndex / 8) * 52;
        debugControlIndex += 1;
        control.style.cssText = `position:fixed;left:${debugControlLeft}px;top:${debugControlTop}px;width:44px;height:44px;opacity:.001;z-index:2147483647;overflow:hidden;padding:0;border:0;pointer-events:auto`;
        control.addEventListener("click", handler);
        documentTarget.body.append(control);
        return control;
      };
      const debugStateControl = createDebugControl(
        "debug-cooking-state",
        "采样料理动作状态",
        respondWithDebugState,
      );
      const debugFrameControl = createDebugControl(
        "debug-cooking-frame",
        "采样料理三维画面",
        respondWithDebugFrame,
      );
      const debugResetControl = createDebugControl(
        "debug-cooking-reset",
        "重置料理验收状态",
        () => {
          stage.reset?.();
          refreshDebugInteractionPoints();
          respondWithDebugState();
        },
      );
      const debugTickControl = createDebugControl(
        "debug-cooking-tick",
        "推进料理验收时间",
        () => {
          let nextTime = Number(documentTarget.body.dataset.debugTickTime);
          if (Number.isFinite(nextTime)) stage.tick?.(nextTime);
          for (let debugTickIndex = 1; debugTickIndex <= 8; debugTickIndex += 1) {
            const candidate = Number(documentTarget.body.dataset[`debugTickTime${debugTickIndex}`]);
            if (Number.isFinite(candidate) && candidate !== 0) {
              nextTime = candidate;
              stage.tick?.(nextTime);
              documentTarget.body.dataset[`debugTickTime${debugTickIndex}`] = "0";
            }
          }
          respondWithDebugState();
          respondWithDebugFrame();
        },
      );
      const debugTickOffsets = [0, 145, 286, 335, 414, 478, 560];
      const debugPhaseControls = debugTickOffsets.map((offset, index) => createDebugControl(
        `debug-cooking-phase-${index}`,
        `采样料理物理相位 ${index}`,
        () => {
          const motion = stage.getDebugState?.()?.activeMotion;
          if (!motion) {
            respondWithDebugState();
            respondWithDebugFrame();
            return;
          }
          const startedAt = Number(documentTarget.body.dataset.debugMotionStartedAt);
          stage.tick?.(startedAt + offset);
          respondWithDebugState();
          respondWithDebugFrame();
        },
      ));
      const debugStageControl = createDebugControl(
        "debug-cooking-stage-motion",
        "生成料理物理验收动作",
        () => {
          let request = {};
          try {
            request = JSON.parse(documentTarget.body.dataset.debugStageRequest || "{}");
          } catch {
            request = {};
          }
          const ingredientId = typeof request.ingredientId === "string"
            ? request.ingredientId
            : "bottom-bun";
          const position = request.position && typeof request.position === "object"
            ? request.position
            : { x: -1.45, y: 1.35, z: 0.35 };
          const layer = stage.burger?.getLayer?.(ingredientId);
          stage.setDebugClockFrozen?.(Boolean(request.freeze));
          const locationBefore = stage.getState?.()?.locations?.[ingredientId] ?? null;
          if (layer && stage.getState?.()?.locations?.[ingredientId]?.kind === "bin") {
            layer.position.set(position.x, position.y, position.z);
            layer.visible = true;
          }
          const dropped = stage.dropLayer?.(ingredientId, { kind: "prep" });
          documentTarget.body.dataset.debugMotionStartedAt = String(
            stage.getDebugState?.()?.time ?? 0,
          );
          documentTarget.body.dataset.debugStageResponse = JSON.stringify({
            ingredientId,
            dropped: Boolean(dropped),
            locationBefore,
            locationAfter: stage.getState?.()?.locations?.[ingredientId] ?? null,
          });
          respondWithDebugState();
          respondWithDebugFrame();
        },
      );
      const debugHandControl = createDebugControl(
        "debug-cooking-hand-pose",
        "生成料理手部验收姿态",
        () => {
          let request = {};
          try {
            request = JSON.parse(documentTarget.body.dataset.debugHandRequest || "{}");
          } catch {
            request = {};
          }
          stage.hands?.createDebugIngredientPose?.(request);
          respondWithDebugState();
          respondWithDebugFrame();
        },
      );
      const debugRightHandControl = createDebugControl(
        "debug-cooking-right-hand-grip",
        "采样右手抓取硬配料",
        () => {
          const station = stage.workbench?.getStationBySlot?.("filling-back-3");
          const anchor = station?.pickupAnchor;
          const point = anchor?.getWorldPosition
            ? anchor.getWorldPosition(anchor.position.clone())
            : { x: 0.8, y: 1.2, z: 0.3 };
          const now = Number(stage.getDebugState?.()?.time) || 0;
          stage.hands?.createDebugIngredientPose?.({
            side: "right",
            phase: "reach",
            ingredientId: "onion",
            position: point,
          });
          stage.tick?.(now + 95);
          stage.hands?.createDebugIngredientPose?.({
            side: "right",
            phase: "grip",
            ingredientId: "onion",
            position: point,
          });
          stage.tick?.(now + 160);
          stage.hands?.createDebugIngredientPose?.({
            side: "right",
            phase: "carry",
            ingredientId: "onion",
            position: point,
          });
          respondWithDebugState();
          respondWithDebugFrame();
        },
      );
      const settleDebugMotion = () => {
        const debugState = stage.getDebugState?.();
        const motion = debugState?.activeMotion;
        if (!motion) return;
        const startedAt = Number(debugState.time) - Number(motion.frame?.progress ?? 0) * 560;
        stage.tick?.(startedAt + 560);
      };
      const debugHardMotionControl = createDebugControl(
        "debug-cooking-hard-motion",
        "生成硬配料物理验收动作",
        () => {
          stage.reset?.();
          stage.setDebugClockFrozen?.(false);
          for (const ingredientId of ["bottom-bun", "patty", "pickle"]) {
            stage.dropLayer?.(ingredientId, { kind: "prep" });
            settleDebugMotion();
          }
          stage.setDebugClockFrozen?.(true);
          const onion = stage.burger?.getLayer?.("onion");
          const onionReleasePosition = { x: 1.45, y: 1.52, z: 0.3 };
          if (onion) onion.position.set(
            onionReleasePosition.x,
            onionReleasePosition.y,
            onionReleasePosition.z,
          );
          stage.dropLayer?.("onion", {
            kind: "prep",
            releasePose: onion ? {
              position: onionReleasePosition,
              scale: {
                x: onion.scale.x,
                y: onion.scale.y,
                z: onion.scale.z,
              },
              rotation: { y: onion.rotation.y },
            } : null,
          });
          documentTarget.body.dataset.debugMotionStartedAt = String(
            stage.getDebugState?.()?.time ?? 0,
          );
          respondWithDebugState();
          respondWithDebugFrame();
        },
      );
      const debugHardOffsets = [0, 145, 286, 335, 414, 478, 560];
      const debugHardPhaseControls = debugHardOffsets.map((offset, index) => createDebugControl(
        `debug-cooking-hard-phase-${index}`,
        `采样硬配料物理相位 ${index}`,
        () => {
          stage.reset?.();
          stage.setDebugClockFrozen?.(false);
          for (const ingredientId of ["bottom-bun", "patty", "pickle"]) {
            stage.dropLayer?.(ingredientId, { kind: "prep" });
            settleDebugMotion();
          }
          stage.setDebugClockFrozen?.(true);
          const onion = stage.burger?.getLayer?.("onion");
          const releasePosition = { x: 1.45, y: 1.52, z: 0.3 };
          if (onion) onion.position.set(releasePosition.x, releasePosition.y, releasePosition.z);
          stage.dropLayer?.("onion", {
            kind: "prep",
            releasePose: onion ? {
              position: releasePosition,
              scale: { x: onion.scale.x, y: onion.scale.y, z: onion.scale.z },
              rotation: { y: onion.rotation.y },
            } : null,
          });
          const startedAt = Number(stage.getDebugState?.()?.time) || 0;
          stage.tick?.(startedAt + offset);
          respondWithDebugState();
          respondWithDebugFrame();
        },
      ));
      // Browser automation evaluates in an isolated world on some hosts, so
      // custom window properties and Event constructors may not cross that
      // boundary. Attribute requests are plain DOM state and work everywhere.
      const DebugMutationObserver = windowTarget.MutationObserver;
      if (typeof DebugMutationObserver === "function") {
        const debugRequestObserver = new DebugMutationObserver((records) => {
          for (const record of records) {
            if (record.attributeName === "data-debug-state-request") {
              respondWithDebugState();
            } else if (record.attributeName === "data-debug-frame-request") {
              respondWithDebugFrame();
            }
          }
        });
        debugRequestObserver.observe(documentTarget.body, {
          attributes: true,
          attributeFilter: [
            "data-debug-state-request",
            "data-debug-state-request1",
            "data-debug-state-request2",
            "data-debug-frame-request",
            "data-debug-frame-request1",
          ],
        });
        windowTarget.addEventListener?.("beforeunload", () => {
          debugRequestObserver.disconnect();
          debugStateControl.remove();
          debugFrameControl.remove();
          debugResetControl.remove();
          debugTickControl.remove();
          debugPhaseControls.forEach((control) => control.remove());
          debugStageControl.remove();
          debugHandControl.remove();
          debugRightHandControl.remove();
          debugHardMotionControl.remove();
          debugHardPhaseControls.forEach((control) => control.remove());
        }, { once: true });
      }
    }
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
      refreshDebugInteractionPoints();
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
