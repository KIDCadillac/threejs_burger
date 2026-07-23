export const BURGER_SHOP_ORDER_COUNT = 3;
export const BURGER_SHOP_ORDER_MS = 45_000;

const EMPTY_SERVED_SNAPSHOT = Object.freeze({
  assembledOrder: Object.freeze([]),
});

function timestampFrom(now) {
  const value = now();
  if (!Number.isFinite(value)) throw new TypeError("now must return a finite timestamp");
  return value;
}

function freezeRun(state) {
  return Object.freeze({
    ...state,
    orders: Object.freeze([...state.orders]),
  });
}

export function createBurgerShopRun({ runId, now = Date.now } = {}) {
  if (typeof runId !== "string" || !runId.trim()) {
    throw new TypeError("runId is required");
  }
  if (typeof now !== "function") throw new TypeError("now must be a function");

  return freezeRun({
    version: 1,
    runId,
    phase: "customer-arrival",
    orderNumber: 1,
    phaseStartedAt: timestampFrom(now),
    deadlineAt: null,
    orders: [],
    servedSnapshot: null,
    totalScore: 0,
  });
}

export function applyBurgerShopEvent(state, event, { now = Date.now } = {}) {
  if (!state || typeof state !== "object") throw new TypeError("state is required");
  if (!event || typeof event.type !== "string") throw new TypeError("event.type is required");
  if (typeof now !== "function") throw new TypeError("now must be a function");

  const timestamp = timestampFrom(now);
  if (event.type === "customer.arrived" && state.phase === "customer-arrival") {
    return freezeRun({
      ...state,
      phase: "order-preview",
      phaseStartedAt: timestamp,
    });
  }

  if (event.type === "order.previewed" && state.phase === "order-preview") {
    return freezeRun({
      ...state,
      phase: "cooking",
      phaseStartedAt: timestamp,
      deadlineAt: timestamp + BURGER_SHOP_ORDER_MS,
    });
  }

  if (
    event.type === "order.served"
    && state.phase === "cooking"
    && timestamp <= state.deadlineAt
  ) {
    return freezeRun({
      ...state,
      phase: "serving",
      phaseStartedAt: timestamp,
      servedSnapshot: event.snapshot ?? EMPTY_SERVED_SNAPSHOT,
      deadlineAt: null,
    });
  }

  if (
    event.type === "clock.tick"
    && state.phase === "cooking"
    && timestamp >= state.deadlineAt
  ) {
    return freezeRun({
      ...state,
      phase: "serving",
      phaseStartedAt: timestamp,
      servedSnapshot: EMPTY_SERVED_SNAPSHOT,
      deadlineAt: null,
    });
  }

  if (event.type === "order.scored" && state.phase === "serving") {
    if (!Number.isFinite(event.score) || event.score < 0) {
      throw new TypeError("order score must be a non-negative finite number");
    }
    const order = Object.freeze({
      number: state.orderNumber,
      score: event.score,
      snapshot: state.servedSnapshot,
    });
    return freezeRun({
      ...state,
      phase: "tasting",
      phaseStartedAt: timestamp,
      orders: [...state.orders, order],
      totalScore: state.totalScore + event.score,
    });
  }

  if (event.type === "tasting.finished" && state.phase === "tasting") {
    return freezeRun({
      ...state,
      phase: "order-result",
      phaseStartedAt: timestamp,
    });
  }

  if (event.type === "order.next" && state.phase === "order-result") {
    if (state.orderNumber === BURGER_SHOP_ORDER_COUNT) {
      return freezeRun({
        ...state,
        phase: "run-result",
        phaseStartedAt: timestamp,
      });
    }
    return freezeRun({
      ...state,
      phase: "customer-arrival",
      orderNumber: state.orderNumber + 1,
      phaseStartedAt: timestamp,
      servedSnapshot: null,
    });
  }

  return state;
}
