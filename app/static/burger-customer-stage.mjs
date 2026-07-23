const CUSTOMER_ENTER_MS = 420;
const CUSTOMER_TASTE_MS = 1_250;
const CUSTOMER_LEAVE_MS = 360;
const REACTIONS = new Set(["high", "medium", "low"]);

const ESCAPES = Object.freeze({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
});

function escapeMarkup(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ESCAPES[character]);
}

function customerMarkup(customer = {}) {
  const name = escapeMarkup(customer.name || "新顾客");
  const color = /^#[\da-f]{6}$/i.test(customer.color ?? "") ? customer.color : "#df8a55";
  const orderNumber = Number.isInteger(customer.orderNumber)
    ? Math.max(1, Math.min(3, customer.orderNumber))
    : 1;
  return `
    <span class="shop-character" aria-hidden="true" style="--customer-color:${color}">
      <span class="shop-character__body"></span>
      <span class="shop-character__head">
        <i class="shop-character__hair"></i>
        <i class="shop-character__eyes"></i>
        <i class="shop-character__mouth"></i>
      </span>
      <span class="shop-character__arm"><i class="shop-character__burger">🍔</i></span>
      <span class="shop-character__effect"></span>
    </span>
    <span class="shop-customer__copy">
      <small>第 <b data-shop-order-number>${orderNumber}</b>/3 位顾客</small>
      <strong data-shop-customer-name>${name}</strong>
    </span>
  `;
}

export function createBurgerCustomerStage({
  root,
  reducedMotion = false,
  schedule = globalThis.setTimeout?.bind(globalThis),
  cancel = globalThis.clearTimeout?.bind(globalThis),
} = {}) {
  if (!root || typeof root !== "object" || !root.dataset) {
    throw new TypeError("burger customer stage requires a root with dataset");
  }

  let disposed = false;
  let pendingHandle = null;
  let pendingResolve = null;

  const setState = (state) => {
    root.dataset.customerState = state;
  };

  const clearPending = () => {
    if (pendingHandle !== null) {
      try { cancel?.(pendingHandle); } catch { /* optional timer cleanup */ }
      pendingHandle = null;
    }
    if (pendingResolve) {
      const resolve = pendingResolve;
      pendingResolve = null;
      resolve(false);
    }
  };

  const scheduleState = (callback, delay) => {
    if (typeof schedule !== "function") {
      callback();
      return null;
    }
    pendingHandle = schedule(() => {
      pendingHandle = null;
      callback();
    }, delay);
    return pendingHandle;
  };

  return Object.freeze({
    enter(customer = {}) {
      if (disposed) return false;
      clearPending();
      root.hidden = false;
      root.dataset.customerId = String(customer.id ?? "");
      root.dataset.customerName = String(customer.name ?? "新顾客");
      root.innerHTML = customerMarkup(customer);
      setState("entering");
      if (reducedMotion) setState("waiting");
      else scheduleState(() => setState("waiting"), CUSTOMER_ENTER_MS);
      return true;
    },
    wait() {
      if (disposed) return false;
      clearPending();
      root.hidden = false;
      setState("waiting");
      return true;
    },
    taste(reaction) {
      if (disposed) return Promise.resolve(false);
      if (!REACTIONS.has(reaction)) {
        throw new TypeError(`unknown burger customer reaction: ${String(reaction)}`);
      }
      clearPending();
      root.hidden = false;
      root.dataset.reaction = reaction;
      setState("eating");
      if (reducedMotion) {
        setState(reaction);
        return Promise.resolve(reaction);
      }
      return new Promise((resolve) => {
        pendingResolve = resolve;
        scheduleState(() => {
          setState(reaction);
          pendingResolve = null;
          resolve(reaction);
        }, CUSTOMER_TASTE_MS);
      });
    },
    leave() {
      if (disposed) return false;
      clearPending();
      setState("leaving");
      const finish = () => {
        root.hidden = true;
        setState("left");
      };
      if (reducedMotion) finish();
      else scheduleState(finish, CUSTOMER_LEAVE_MS);
      return true;
    },
    dispose() {
      if (disposed) return false;
      disposed = true;
      clearPending();
      root.hidden = true;
      setState("disposed");
      return true;
    },
  });
}
