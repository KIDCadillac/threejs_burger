import test from "node:test";
import assert from "node:assert/strict";
import { createBurgerCustomerStage } from "../app/static/burger-customer-stage.mjs";

function createRoot() {
  return {
    dataset: {},
    hidden: false,
    innerHTML: "",
  };
}

function createScheduler() {
  const tasks = [];
  return {
    schedule(callback) {
      const task = { callback, cancelled: false };
      tasks.push(task);
      return task;
    },
    cancel(task) {
      task.cancelled = true;
    },
    flush() {
      while (tasks.length) {
        const task = tasks.shift();
        if (!task.cancelled) task.callback();
      }
    },
  };
}

test("customer entry renders an original character and current order number then settles to waiting", () => {
  const root = createRoot();
  const scheduler = createScheduler();
  const customer = createBurgerCustomerStage({
    root,
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });

  customer.enter({
    id: "customer-1",
    name: "阿乐",
    color: "#e79a57",
    orderNumber: 2,
  });
  assert.equal(root.dataset.customerState, "entering");
  assert.equal(root.dataset.customerId, "customer-1");
  assert.match(root.innerHTML, /shop-character__head/);
  assert.match(root.innerHTML, /data-shop-order-number>2</);
  assert.match(root.innerHTML, /阿乐/);

  scheduler.flush();
  assert.equal(root.dataset.customerState, "waiting");
  customer.dispose();
});

test("tasting exposes eating before distinct high medium and low reactions", async () => {
  for (const reaction of ["high", "medium", "low"]) {
    const root = createRoot();
    const scheduler = createScheduler();
    const customer = createBurgerCustomerStage({
      root,
      schedule: scheduler.schedule,
      cancel: scheduler.cancel,
    });

    customer.wait();
    const completed = customer.taste(reaction);
    assert.equal(root.dataset.customerState, "eating");
    scheduler.flush();
    await completed;
    assert.equal(root.dataset.customerState, reaction);
    assert.equal(root.dataset.reaction, reaction);
    customer.dispose();
  }
});

test("reduced motion reaches stable states without scheduling animation work", async () => {
  const root = createRoot();
  const customer = createBurgerCustomerStage({
    root,
    reducedMotion: true,
    schedule() {
      throw new Error("reduced motion must not schedule");
    },
  });

  customer.enter({ id: "customer-2", name: "小满" });
  assert.equal(root.dataset.customerState, "waiting");
  await customer.taste("medium");
  assert.equal(root.dataset.customerState, "medium");
  customer.leave();
  assert.equal(root.hidden, true);
  customer.dispose();
});

test("disposing cancels pending customer animation callbacks", () => {
  const root = createRoot();
  const scheduler = createScheduler();
  const customer = createBurgerCustomerStage({
    root,
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });

  customer.enter({ id: "customer-3", name: "安安" });
  customer.dispose();
  scheduler.flush();
  assert.equal(root.dataset.customerState, "disposed");
  assert.equal(root.hidden, true);
});
