import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_LAYOUT_VALUE,
  createLayoutHistory,
  normalizeLayoutDocument,
  normalizeLayoutValue,
  parseLayoutDocument,
  updateLayoutElement,
} from "../home-layout-editor-state.mjs";

test("normalizes layout values and clamps unsafe ranges", () => {
  assert.deepEqual(
    normalizeLayoutValue({
      x: "12.5",
      y: -8,
      scale: 99,
      rotate: -999,
      z: 100000,
      opacity: -1,
      visible: 0,
      locked: 1,
    }),
    {
      x: 12.5,
      y: -8,
      scale: 4,
      rotate: -180,
      z: 999,
      opacity: 0,
      visible: false,
      locked: true,
    },
  );
});

test("fills missing element fields from defaults", () => {
  assert.deepEqual(normalizeLayoutValue({ x: 4 }), {
    ...DEFAULT_LAYOUT_VALUE,
    x: 4,
  });
});

test("updates one element without mutating the source document", () => {
  const source = normalizeLayoutDocument({
    elements: { title: { x: 2 } },
  });
  const result = updateLayoutElement(source, "title", { y: 7, scale: 1.2 });

  assert.equal(source.elements.title.y, 0);
  assert.equal(result.elements.title.x, 2);
  assert.equal(result.elements.title.y, 7);
  assert.equal(result.elements.title.scale, 1.2);
});

test("history supports undo and redo", () => {
  const history = createLayoutHistory({ elements: { hud: {} } });
  history.commit(updateLayoutElement(history.current(), "hud", { x: 20 }));
  history.commit(updateLayoutElement(history.current(), "hud", { y: 30 }));

  assert.equal(history.current().elements.hud.y, 30);
  assert.equal(history.undo().elements.hud.y, 0);
  assert.equal(history.undo().elements.hud.x, 0);
  assert.equal(history.redo().elements.hud.x, 20);
});

test("parses valid JSON and rejects malformed documents", () => {
  const parsed = parseLayoutDocument('{"version":1,"elements":{"hud":{"x":9}}}');
  assert.equal(parsed.elements.hud.x, 9);
  assert.throws(() => parseLayoutDocument("{broken"), /布局文件不是有效 JSON/);
  assert.throws(() => parseLayoutDocument('{"elements":[]}'), /布局文件结构无效/);
});
