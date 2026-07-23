import { isLegalBurgerOrder } from "./burger-order-generator.mjs";
import {
  decodeSoloSave,
  hydrateSoloCookingState,
  serializeSoloSave,
} from "./cooking-solo-save.mjs";

export const BURGER_SHOP_SAVE_KEY = "burger-shop-run:v1";

const PHASES = new Set([
  "customer-arrival",
  "order-preview",
  "cooking",
  "serving",
  "tasting",
  "order-result",
  "run-result",
]);
const MAX_SERIALIZED_CHARS = 512 * 1024;
const MAX_ORDER_MS = 45_000;

function resolvedStorage(storage) {
  if (storage !== undefined) return storage;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function finite(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
  return value;
}

function nonNegative(value, label) {
  return Math.max(0, finite(value, label));
}

function normalizeRun(value, { deadlineAt = value?.deadlineAt } = {}) {
  if (!value || value.version !== 1) throw new TypeError("invalid run version");
  if (typeof value.runId !== "string" || !value.runId.length) {
    throw new TypeError("invalid runId");
  }
  if (!PHASES.has(value.phase)) throw new TypeError("invalid run phase");
  if (!Number.isInteger(value.orderNumber) || value.orderNumber < 1 || value.orderNumber > 3) {
    throw new TypeError("invalid run orderNumber");
  }
  if (!Array.isArray(value.orders) || value.orders.length > 3) {
    throw new TypeError("invalid run orders");
  }
  const orders = Object.freeze(value.orders.map((order) => {
    if (
      !Number.isInteger(order?.number)
      || order.number < 1
      || order.number > 3
      || !Number.isFinite(order.score)
      || order.score < 0
    ) {
      throw new TypeError("invalid scored order");
    }
    return Object.freeze({ ...order });
  }));
  const normalizedDeadline = deadlineAt === null
    ? null
    : finite(deadlineAt, "run.deadlineAt");
  return Object.freeze({
    ...value,
    phaseStartedAt: finite(value.phaseStartedAt, "run.phaseStartedAt"),
    deadlineAt: normalizedDeadline,
    orders,
    totalScore: nonNegative(value.totalScore, "run.totalScore"),
  });
}

function normalizeOrder(value) {
  if (!isLegalBurgerOrder(value)) throw new TypeError("invalid burger order");
  return Object.freeze({
    ...value,
    layers: Object.freeze(value.layers.map((layer) => Object.freeze({ ...layer }))),
    sauces: Object.freeze(value.sauces.map((sauce) => Object.freeze({ ...sauce }))),
  });
}

function normalizeSettings(value = {}) {
  return Object.freeze({
    muted: Boolean(value.muted),
    haptics: value.haptics !== false,
    reducedMotion: Boolean(value.reducedMotion),
  });
}

function normalizeRemaining(value) {
  if (value === null) return null;
  return Math.min(MAX_ORDER_MS, nonNegative(value, "remainingMs"));
}

export function createBurgerShopSave({
  storage,
  storageKey = BURGER_SHOP_SAVE_KEY,
  now = Date.now,
} = {}) {
  const target = resolvedStorage(storage);
  if (typeof now !== "function") throw new TypeError("now must be a function");

  return Object.freeze({
    load() {
      try {
        if (typeof target?.getItem !== "function") return null;
        const serialized = target.getItem(storageKey);
        if (
          typeof serialized !== "string"
          || !serialized.length
          || serialized.length > MAX_SERIALIZED_CHARS
        ) {
          return null;
        }
        const payload = JSON.parse(serialized);
        if (!payload || payload.version !== 1) return null;
        const remainingMs = normalizeRemaining(payload.remainingMs);
        const loadedAt = finite(now(), "now");
        const run = normalizeRun(payload.run, {
          deadlineAt: remainingMs === null ? null : loadedAt + remainingMs,
        });
        const order = normalizeOrder(payload.order);
        const decodedCooking = decodeSoloSave(payload.cookingSave);
        if (!decodedCooking) return null;
        const cookingState = hydrateSoloCookingState(decodedCooking.state);
        if (!cookingState) return null;
        return Object.freeze({
          version: 1,
          savedAt: finite(payload.savedAt, "savedAt"),
          remainingMs,
          run,
          order,
          cookingState,
          settings: normalizeSettings(payload.settings),
        });
      } catch {
        return null;
      }
    },

    save({ run, order, cookingState, settings = {} } = {}) {
      try {
        if (typeof target?.setItem !== "function") return false;
        const savedAt = finite(now(), "now");
        const normalizedRun = normalizeRun(run);
        const normalizedOrder = normalizeOrder(order);
        const remainingMs = normalizedRun.deadlineAt === null
          ? null
          : Math.min(
            MAX_ORDER_MS,
            Math.max(0, normalizedRun.deadlineAt - savedAt),
          );
        const serialized = JSON.stringify({
          version: 1,
          savedAt,
          remainingMs,
          run: normalizedRun,
          order: normalizedOrder,
          cookingSave: serializeSoloSave(cookingState),
          settings: normalizeSettings(settings),
        });
        if (serialized.length > MAX_SERIALIZED_CHARS) return false;
        target.setItem(storageKey, serialized);
        return true;
      } catch {
        return false;
      }
    },

    clear() {
      try {
        if (typeof target?.removeItem !== "function") return false;
        target.removeItem(storageKey);
        return true;
      } catch {
        return false;
      }
    },
  });
}
