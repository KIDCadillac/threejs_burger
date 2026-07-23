import {
  BURGER_SHOP_ORDER_MS,
  applyBurgerShopEvent,
  createBurgerShopRun,
} from "./burger-shop-run-state.mjs";
import { createBurgerOrder } from "./burger-order-generator.mjs";
import {
  scoreBurgerOrder,
  summarizeBurgerRun,
} from "./burger-order-score.mjs";
import { createBurgerShopSave } from "./burger-shop-save.mjs";
import { createBurgerShopStageAdapter } from "./burger-shop-stage-adapter.mjs";
import { createBurgerCustomerStage } from "./burger-customer-stage.mjs";
import { createBurgerShopAudio } from "./burger-shop-audio.mjs";

const INGREDIENT_LABELS = Object.freeze({
  "bottom-bun": "下层面包",
  "middle-bun": "中层面包",
  "top-bun": "上层面包",
  patty: "牛肉饼",
  cheese: "芝士",
  tomato: "番茄",
  lettuce: "生菜",
  pickle: "酸黄瓜",
  onion: "洋葱碎",
});

const SAUCE_LABELS = Object.freeze({
  ketchup: "番茄酱",
  mustard: "芥末酱",
  "house-sauce": "招牌酱",
});

const CUSTOMERS = Object.freeze([
  Object.freeze({ id: "customer-1", name: "阿乐", color: "#e89455" }),
  Object.freeze({ id: "customer-2", name: "小满", color: "#79a6d2" }),
  Object.freeze({ id: "customer-3", name: "安安", color: "#a986c7" }),
]);

function requiredElement(documentTarget, selector) {
  const element = documentTarget?.querySelector?.(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}

function safeNow(now) {
  const value = now();
  if (!Number.isFinite(value)) throw new TypeError("now must return a finite timestamp");
  return value;
}

function remainingFor(run, now) {
  if (run.phase !== "cooking" || !Number.isFinite(run.deadlineAt)) {
    return BURGER_SHOP_ORDER_MS;
  }
  return Math.max(0, run.deadlineAt - safeNow(now));
}

function customerFor(orderNumber) {
  return CUSTOMERS[Math.max(0, Math.min(CUSTOMERS.length - 1, orderNumber - 1))];
}

function reactionFromScore(score) {
  if (score >= 850) return "high";
  if (score >= 550) return "medium";
  return "low";
}

function scoreCopy(reaction) {
  if (reaction === "high") return "太棒了！顾客非常满意";
  if (reaction === "medium") return "做得不错，再快一点会更好";
  return "顺序或配料不太对，再试一次";
}

function phaseCopy(phase) {
  if (phase === "customer-arrival") return "顾客来了";
  if (phase === "order-preview") return "记住这张订单";
  if (phase === "cooking") return "按订单从下往上制作";
  if (phase === "serving") return "正在交付";
  if (phase === "tasting") return "顾客正在品尝";
  if (phase === "order-result") return "本单完成";
  return "今日营业结束";
}

function runIdAt(timestamp) {
  return `shop-${Math.floor(timestamp).toString(36)}`;
}

export function bootBurgerShopPage(
  documentTarget = globalThis.document,
  {
    windowTarget = globalThis,
    stage,
    now = Date.now,
    random = Math.random,
    setIntervalFn = windowTarget?.setInterval?.bind(windowTarget),
    clearIntervalFn = windowTarget?.clearInterval?.bind(windowTarget),
    schedule = windowTarget?.setTimeout?.bind(windowTarget),
    cancelSchedule = windowTarget?.clearTimeout?.bind(windowTarget),
    stageAdapterFactory = createBurgerShopStageAdapter,
    customerFactory = createBurgerCustomerStage,
    audioFactory = createBurgerShopAudio,
    saveFactory = createBurgerShopSave,
    orderFactory = createBurgerOrder,
    scoreFactory = scoreBurgerOrder,
    summaryFactory = summarizeBurgerRun,
  } = {},
) {
  if (!stage) throw new TypeError("burger shop page requires a stage");
  if (typeof now !== "function" || typeof random !== "function") {
    throw new TypeError("burger shop clock and random source are required");
  }
  if (typeof setIntervalFn !== "function" || typeof clearIntervalFn !== "function") {
    throw new TypeError("burger shop interval functions are required");
  }

  const elements = {
    body: requiredElement(documentTarget, "body"),
    ui: requiredElement(documentTarget, "#burger-shop-ui"),
    customer: requiredElement(documentTarget, "#shop-customer"),
    ticketButton: requiredElement(documentTarget, "#shop-order-ticket"),
    timer: requiredElement(documentTarget, "#shop-order-timer"),
    ticketPanel: requiredElement(documentTarget, "#shop-ticket-panel"),
    tasting: requiredElement(documentTarget, "#shop-tasting"),
    orderResult: requiredElement(documentTarget, "#shop-order-result"),
    runResult: requiredElement(documentTarget, "#shop-run-result"),
    serveButton: requiredElement(documentTarget, "#shop-serve-button"),
    orderNumber: requiredElement(documentTarget, "[data-shop-order-number]"),
    customerName: requiredElement(documentTarget, "[data-shop-customer-name]"),
    ticketNumber: requiredElement(documentTarget, "[data-shop-ticket-number]"),
    ticketName: requiredElement(documentTarget, "[data-shop-ticket-name]"),
    ticketLayers: requiredElement(documentTarget, "[data-shop-ticket-layers]"),
    ticketSauces: requiredElement(documentTarget, "[data-shop-ticket-sauces]"),
    undoButton: requiredElement(documentTarget, '[data-shop-action="undo"]'),
    focusButton: requiredElement(documentTarget, '[data-shop-action="focus"]'),
  };
  documentTarget.title = "今日营业 · 3D 汉堡店";

  let pageStorage = null;
  try {
    pageStorage = windowTarget?.localStorage ?? null;
  } catch {
    pageStorage = null;
  }
  const reducedMotion = Boolean(
    windowTarget?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches,
  );
  const adapter = stageAdapterFactory(stage);
  const customer = customerFactory({
    root: elements.customer,
    reducedMotion,
    schedule,
    cancel: cancelSchedule,
  });
  const audio = audioFactory({
    muted: false,
    haptics: true,
    navigatorTarget: windowTarget?.navigator,
  });
  const save = saveFactory({ storage: pageStorage, now });
  const restored = save.load?.() ?? null;

  let run = restored?.run ?? createBurgerShopRun({
    runId: runIdAt(safeNow(now)),
    now,
  });
  let currentOrder = restored?.order ?? orderFactory({
    orderNumber: run.orderNumber,
    random,
  });
  let lastScore = null;
  let lastTickSecond = null;
  let intervalId = null;
  let phaseHandle = null;
  let disposed = false;
  let ticketOpen = false;
  let focused = false;
  let latestCookingState = adapter.startOrder({
    restoredState: restored?.cookingState ?? null,
  });

  const settings = Object.freeze({
    muted: Boolean(restored?.settings?.muted),
    haptics: restored?.settings?.haptics !== false,
    reducedMotion,
  });
  audio.setMuted?.(settings.muted);
  audio.setHaptics?.(settings.haptics);

  const clearPhaseSchedule = () => {
    if (phaseHandle === null) return;
    try {
      cancelSchedule?.(phaseHandle);
    } catch {
      // Phase animation timing is optional.
    }
    phaseHandle = null;
  };
  const clearTimer = () => {
    if (intervalId === null) return;
    clearIntervalFn(intervalId);
    intervalId = null;
  };
  const persist = () => save.save?.({
    run,
    order: currentOrder,
    cookingState: latestCookingState ?? adapter.getCookingState(),
    settings,
  });

  const renderTicket = () => {
    elements.ticketNumber.textContent = `#${String(run.orderNumber).padStart(2, "0")}`;
    elements.ticketName.textContent = currentOrder.publicName;
    elements.ticketLayers.innerHTML = currentOrder.layers
      .map(({ ingredientId }, index) => (
        `<li><span>${index + 1}</span><strong>${INGREDIENT_LABELS[ingredientId] ?? ingredientId}</strong></li>`
      ))
      .join("");
    elements.ticketSauces.hidden = currentOrder.sauces.length === 0;
    elements.ticketSauces.textContent = currentOrder.sauces.length
      ? `酱料：${currentOrder.sauces.map(({ sauceId }) => SAUCE_LABELS[sauceId] ?? sauceId).join("、")}`
      : "";
    elements.ticketPanel.hidden = !ticketOpen;
    elements.ticketButton.setAttribute("aria-expanded", String(ticketOpen));
  };

  const renderTimer = () => {
    const remainingMs = remainingFor(run, now);
    const seconds = Math.max(0, Math.ceil(remainingMs / 1_000));
    elements.timer.textContent = String(seconds);
    elements.timer.dataset.urgent = String(run.phase === "cooking" && seconds <= 10);
    return seconds;
  };

  const render = () => {
    const cooking = run.phase === "cooking";
    const customerProfile = customerFor(run.orderNumber);
    elements.body.dataset.gameMode = "orders";
    elements.body.dataset.shopPhase = run.phase;
    elements.ui.hidden = false;
    elements.orderNumber.textContent = String(run.orderNumber);
    elements.customerName.textContent = customerProfile.name;
    elements.ui.dataset.phaseCopy = phaseCopy(run.phase);
    elements.serveButton.disabled = !cooking;
    elements.undoButton.disabled = !cooking;
    elements.focusButton.disabled = !cooking;
    elements.focusButton.setAttribute("aria-pressed", String(focused));
    renderTimer();
    renderTicket();

    elements.tasting.hidden = run.phase !== "tasting";
    elements.tasting.textContent = run.phase === "tasting"
      ? "顾客正在品尝你的汉堡…"
      : "";
    elements.orderResult.hidden = run.phase !== "order-result";
    if (run.phase === "order-result") {
      const score = lastScore?.total ?? run.orders.at(-1)?.score ?? 0;
      const reaction = lastScore?.reaction ?? reactionFromScore(score);
      elements.orderResult.innerHTML = `
        <div class="shop-result-card" data-reaction="${reaction}">
          <small>第 ${run.orderNumber} 单</small>
          <strong>${score}</strong>
          <p>${scoreCopy(reaction)}</p>
          <button type="button" data-shop-action="next">${run.orderNumber >= 3 ? "查看营业结果" : "迎接下一位顾客"}</button>
        </div>
      `;
    }
    elements.runResult.hidden = run.phase !== "run-result";
    if (run.phase === "run-result") {
      const summary = summaryFactory(run.orders.map((item) => ({ total: item.score })));
      elements.runResult.innerHTML = `
        <div class="shop-result-card shop-result-card--run">
          <small>三单营业完成</small>
          <strong>${summary.totalScore}</strong>
          <p>${"★".repeat(summary.stars)}${"☆".repeat(3 - summary.stars)} · 获得 ${summary.coins} 金币</p>
          <button type="button" data-shop-action="restart">再营业一次</button>
          <a href="./cooking.html?mode=practice">去自由练习</a>
        </div>
      `;
    }
  };

  const startTimer = () => {
    clearTimer();
    lastTickSecond = null;
    intervalId = setIntervalFn(() => {
      if (disposed || run.phase !== "cooking") return;
      const seconds = renderTimer();
      if (seconds <= 10 && seconds > 0 && seconds !== lastTickSecond) {
        lastTickSecond = seconds;
        audio.play?.("tick");
      }
      const previous = run;
      run = applyBurgerShopEvent(run, { type: "clock.tick" }, { now });
      if (run !== previous && run.phase === "serving") {
        completeServing(0);
      }
    }, 250);
  };

  const schedulePhase = (callback, delay) => {
    clearPhaseSchedule();
    if (typeof schedule !== "function" || reducedMotion) {
      callback();
      return;
    }
    phaseHandle = schedule(() => {
      phaseHandle = null;
      callback();
    }, delay);
  };

  const enterPhase = () => {
    clearTimer();
    clearPhaseSchedule();
    adapter.setCooking(run.phase === "cooking");
    if (run.phase === "customer-arrival") {
      customer.enter({
        ...customerFor(run.orderNumber),
        orderNumber: run.orderNumber,
      });
      audio.play?.("correct");
      schedulePhase(() => dispatch({ type: "customer.arrived" }), 520);
    } else if (run.phase === "order-preview") {
      customer.wait();
      ticketOpen = true;
      schedulePhase(() => dispatch({ type: "order.previewed" }), 1_000);
    } else if (run.phase === "cooking") {
      ticketOpen = false;
      customer.wait();
      startTimer();
    } else if (run.phase === "tasting") {
      const reaction = lastScore?.reaction
        ?? reactionFromScore(run.orders.at(-1)?.score ?? 0);
      Promise.resolve(customer.taste(reaction)).then(() => {
        if (!disposed && run.phase === "tasting") {
          dispatch({ type: "tasting.finished" });
        }
      });
    } else if (run.phase === "run-result") {
      customer.leave();
      audio.play?.("result");
      save.clear?.();
    }
    render();
    persist();
  };

  const dispatch = (event) => {
    if (disposed) return false;
    const previous = run;
    const next = applyBurgerShopEvent(run, event, { now });
    if (next === previous) return false;
    run = next;
    if (
      run.phase === "customer-arrival"
      && run.orderNumber !== currentOrder.orderNumber
    ) {
      currentOrder = orderFactory({ orderNumber: run.orderNumber, random });
      lastScore = null;
      latestCookingState = adapter.startOrder();
      focused = false;
      ticketOpen = false;
    }
    enterPhase();
    return true;
  };

  const completeServing = (remainingMs) => {
    if (disposed || run.phase !== "serving") return false;
    clearTimer();
    const score = scoreFactory(currentOrder, run.servedSnapshot, { remainingMs });
    lastScore = score;
    audio.play?.("result");
    return dispatch({ type: "order.scored", score: score.total });
  };

  const serve = () => {
    if (disposed || run.phase !== "cooking") return false;
    const remainingMs = remainingFor(run, now);
    const snapshot = adapter.serve();
    const changed = dispatch({ type: "order.served", snapshot });
    if (!changed) return false;
    audio.play?.("bell");
    return completeServing(remainingMs);
  };

  const next = () => {
    if (run.phase !== "order-result") return false;
    customer.leave();
    return dispatch({ type: "order.next" });
  };

  const restart = () => {
    if (run.phase !== "run-result") return false;
    save.clear?.();
    run = createBurgerShopRun({ runId: runIdAt(safeNow(now)), now });
    currentOrder = orderFactory({ orderNumber: 1, random });
    lastScore = null;
    latestCookingState = adapter.startOrder();
    ticketOpen = false;
    focused = false;
    enterPhase();
    return true;
  };

  const handleClick = (event) => {
    const ticketTarget = event.target?.closest?.("#shop-order-ticket");
    if (ticketTarget || event.target === elements.ticketButton) {
      ticketOpen = !ticketOpen;
      renderTicket();
      return;
    }
    const actionTarget = event.target?.closest?.("[data-shop-action]");
    const action = actionTarget?.dataset?.shopAction;
    if (action === "serve") serve();
    else if (action === "next") next();
    else if (action === "restart") restart();
    else if (action === "undo" && run.phase === "cooking") adapter.undo?.();
    else if (action === "focus" && run.phase === "cooking") {
      focused = !focused;
      adapter.focus(focused);
      render();
    }
  };

  const handleVisibility = () => {
    if (documentTarget.visibilityState === "hidden") {
      clearTimer();
      audio.pause?.();
      persist();
      return;
    }
    audio.resume?.();
    if (run.phase === "cooking") {
      const previous = run;
      run = applyBurgerShopEvent(run, { type: "clock.tick" }, { now });
      if (run !== previous && run.phase === "serving") completeServing(0);
      else startTimer();
    }
    render();
  };

  const handlePageHide = (event) => {
    if (event?.persisted) {
      clearTimer();
      audio.pause?.();
      persist();
      return;
    }
    controller.dispose();
  };
  const handlePageShow = (event) => {
    if (!event?.persisted || disposed) return;
    handleVisibility();
  };
  const handleStageChange = (detail) => {
    if (disposed || !detail?.state) return false;
    latestCookingState = detail.state;
    if (run.phase === "cooking") {
      if (detail.reason === "drop-layer") audio.play?.("drop");
      else if (detail.reason === "remove-layer") audio.play?.("pick");
      persist();
    }
    return true;
  };

  documentTarget.addEventListener("click", handleClick);
  documentTarget.addEventListener("visibilitychange", handleVisibility);
  windowTarget.addEventListener("pagehide", handlePageHide);
  windowTarget.addEventListener("pageshow", handlePageShow);

  const controller = Object.freeze({
    getState: () => run,
    serve,
    next,
    restart,
    handleStageChange,
    dispose() {
      if (disposed) return false;
      disposed = true;
      clearTimer();
      clearPhaseSchedule();
      documentTarget.removeEventListener("click", handleClick);
      documentTarget.removeEventListener("visibilitychange", handleVisibility);
      windowTarget.removeEventListener("pagehide", handlePageHide);
      windowTarget.removeEventListener("pageshow", handlePageShow);
      customer.dispose?.();
      audio.dispose?.();
      return true;
    },
  });

  enterPhase();
  return controller;
}
