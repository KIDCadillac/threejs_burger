import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_LAYOUT_VALUE,
  DEFAULT_TRUCK_TIMELINE,
  LAYOUT_VERSION,
  createLayoutHistory,
  normalizeLayoutDocument,
  normalizeLayoutValue,
  normalizeMotionValue,
  normalizeTruckTimeline,
  parseLayoutDocument,
  updateLayoutElement,
  updateTruckTimeline,
} from "../home-layout-editor-state.mjs";

test("normalizes layout, style and visibility values", () => {
  const value = normalizeLayoutValue({
    x: "12.5",
    y: -8,
    width: -10,
    height: 9000,
    scale: 99,
    rotate: -9999,
    z: 100000,
    opacity: -1,
    visible: 0,
    locked: 1,
    brightness: 8,
    saturate: -2,
    blur: 99,
    radius: -20,
    background: "#fff",
  });

  assert.equal(value.x, 12.5);
  assert.equal(value.width, 0);
  assert.equal(value.height, 4000);
  assert.equal(value.scale, 8);
  assert.equal(value.rotate, -1080);
  assert.equal(value.z, 999);
  assert.equal(value.opacity, 0);
  assert.equal(value.visible, false);
  assert.equal(value.locked, true);
  assert.equal(value.brightness, 4);
  assert.equal(value.saturate, 0);
  assert.equal(value.blur, 40);
  assert.equal(value.radius, -1);
  assert.equal(value.background, "#fff");
});

test("fills missing element fields from v2 defaults", () => {
  assert.deepEqual(normalizeLayoutValue({ x: 4 }), {
    ...DEFAULT_LAYOUT_VALUE,
    x: 4,
  });
});

test("normalizes generic motion settings", () => {
  const motion = normalizeMotionValue({
    enabled: true,
    trigger: "loop",
    duration: 99999,
    delay: -20,
    fromOpacity: 3,
    iterations: 0,
    direction: "alternate",
  });

  assert.equal(motion.enabled, true);
  assert.equal(motion.trigger, "loop");
  assert.equal(motion.duration, 30000);
  assert.equal(motion.delay, 0);
  assert.equal(motion.fromOpacity, 1);
  assert.equal(motion.iterations, 1);
  assert.equal(motion.direction, "alternate");
});

test("migrates v1 documents and supplies the truck timeline", () => {
  const parsed = parseLayoutDocument(
    '{"version":1,"elements":{"hud":{"x":9}}}',
  );
  assert.equal(parsed.version, LAYOUT_VERSION);
  assert.equal(parsed.elements.hud.x, 9);
  assert.deepEqual(parsed.truckTimeline, DEFAULT_TRUCK_TIMELINE);
});

test("updates nested element motion without mutating layout values", () => {
  const source = normalizeLayoutDocument({
    elements: { title: { x: 2, motion: { duration: 600 } } },
  });
  const result = updateLayoutElement(source, "title", {
    y: 7,
    motion: { enabled: true, fromX: -120 },
  });

  assert.equal(source.elements.title.y, 0);
  assert.equal(source.elements.title.motion.enabled, false);
  assert.equal(result.elements.title.x, 2);
  assert.equal(result.elements.title.y, 7);
  assert.equal(result.elements.title.motion.duration, 600);
  assert.equal(result.elements.title.motion.fromX, -120);
});

test("updates and clamps the native truck timeline", () => {
  const result = updateTruckTimeline(normalizeLayoutDocument({}), {
    cameraEndX: -24,
    cameraDuration: 20,
    shutterDelay: 800,
  });
  assert.equal(result.truckTimeline.cameraEndX, -24);
  assert.equal(result.truckTimeline.cameraDuration, 200);
  assert.equal(result.truckTimeline.shutterDelay, 800);
  assert.deepEqual(
    normalizeTruckTimeline(result.truckTimeline),
    result.truckTimeline,
  );
});

test("history supports undo and redo across layout and timeline changes", () => {
  const history = createLayoutHistory({ elements: { hud: {} } });
  history.commit(updateLayoutElement(history.current(), "hud", { x: 20 }));
  history.commit(updateTruckTimeline(history.current(), { cameraEndY: -40 }));

  assert.equal(history.current().truckTimeline.cameraEndY, -40);
  assert.equal(history.undo().truckTimeline.cameraEndY, -28);
  assert.equal(history.undo().elements.hud.x, 0);
  assert.equal(history.redo().elements.hud.x, 20);
});

test("rejects malformed JSON documents", () => {
  assert.throws(
    () => parseLayoutDocument("{broken"),
    /布局文件不是有效 JSON/,
  );
  assert.throws(
    () => parseLayoutDocument('{"elements":[]}'),
    /布局文件结构无效/,
  );
});
