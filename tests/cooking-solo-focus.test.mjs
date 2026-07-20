import test from "node:test";
import assert from "node:assert/strict";

import { createFinishFocusManager } from "../app/static/cooking-solo-focus.mjs";

function focusTarget() {
  return { calls: [], focus(options) { this.calls.push(options); } };
}

test("focuses the dialog once when finishing and returns focus when editing resumes", () => {
  const dialog = focusTarget();
  const returnTarget = focusTarget();
  const manager = createFinishFocusManager({ dialog, returnTarget });

  manager.sync(false);
  manager.sync(true);
  manager.sync(true);
  assert.deepEqual(dialog.calls, [{ preventScroll: true }]);
  manager.sync(false);
  assert.deepEqual(returnTarget.calls, [{ preventScroll: true }]);
});

test("missing or throwing focus methods never interrupt cooking", () => {
  const manager = createFinishFocusManager({
    dialog: { focus() { throw new Error("detached"); } },
    returnTarget: {},
  });
  assert.doesNotThrow(() => manager.sync(true));
  assert.doesNotThrow(() => manager.sync(false));
});
