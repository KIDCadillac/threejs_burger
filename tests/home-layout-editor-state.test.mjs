import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_LAYOUT_VALUE,
  DEFAULT_TRUCK_TIMELINE,
  LAYOUT_VERSION,
  PROJECT_DEFAULT_LAYOUT_ELEMENTS,
  WORKBENCH_FILE_FORMAT,
  createProjectDefaultLayoutDocument,
  createWorkbenchFile,
  createLayoutHistory,
  mergeProjectDefaultLayout,
  normalizeLayoutDocument,
  normalizeLayoutValue,
  normalizeMotionValue,
  normalizeTruckTimeline,
  parseLayoutDocument,
  parseWorkbenchFile,
  projectDefaultLayoutValue,
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
    perspective: 9999,
    rotateX: -999,
    rotateY: 999,
    originX: -20,
    originY: 300,
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
  assert.equal(value.perspective, 4000);
  assert.equal(value.rotateX, -180);
  assert.equal(value.rotateY, 180);
  assert.equal(value.originX, 0);
  assert.equal(value.originY, 100);
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

test("fills missing element fields from v6 defaults", () => {
  assert.deepEqual(normalizeLayoutValue({ x: 4 }), {
    ...DEFAULT_LAYOUT_VALUE,
    x: 4,
  });
});

test("v6 project baseline contains no retired vehicle parts", () => {
  const defaults = createProjectDefaultLayoutDocument();

  assert.deepEqual(PROJECT_DEFAULT_LAYOUT_ELEMENTS, {});
  assert.deepEqual(defaults.elements, {});
  assert.equal("wheelDuration" in defaults.truckTimeline, false);
  assert.equal("wheelTurns" in defaults.truckTimeline, false);
  assert.deepEqual(projectDefaultLayoutValue("unknown"), DEFAULT_LAYOUT_VALUE);
});

test("keeps active edits while filtering retired cab and wheel layers", () => {
  const merged = mergeProjectDefaultLayout({
    elements: {
      "burger.sign": { x: 8 },
      "burger.wheel-rear": { x: 21, y: 44, scale: 0.9 },
      "burger.body": { x: 12 },
    },
  });

  assert.equal(merged.elements["burger.sign"].x, 8);
  assert.equal("burger.wheel-rear" in merged.elements, false);
  assert.equal("burger.body" in merged.elements, false);
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

test("migrates v2 files to the suspended booth and drops vehicle edits", () => {
  const parsed = parseLayoutDocument(
    JSON.stringify({
      version: 2,
      elements: {
        "burger.wheel-front": { x: -26.1, y: 43.3, scale: 0.8 },
        "burger.wheel-rear": { x: 19.2, y: 43.4, scale: 0.8 },
        "burger.sign": { x: 7 },
      },
      truckTimeline: {
        cameraEndX: -12,
        cameraEndY: -28,
        cameraEndScale: 1.76,
      },
    }),
  );

  assert.equal(parsed.version, LAYOUT_VERSION);
  assert.equal("burger.wheel-front" in parsed.elements, false);
  assert.equal("burger.wheel-rear" in parsed.elements, false);
  assert.equal(parsed.elements["burger.sign"].x, 7);
  assert.deepEqual(parsed.truckTimeline, DEFAULT_TRUCK_TIMELINE);
});

test("creates a Codex handoff file and imports it again", () => {
  const payload = createWorkbenchFile(
    {
      elements: {
        "burger.sign": { x: 18, y: -4 },
      },
    },
    { sheetsById: { main: {} } },
    {
      createdAt: "2026-07-28T09:00:00.000Z",
      sourcePage: "https://kidcadillac.github.io/threejs_burger/?layout=1",
    },
  );

  assert.equal(payload.format, WORKBENCH_FILE_FORMAT);
  assert.equal(payload.version, 6);
  assert.equal(payload.layoutDocument.version, 6);
  assert.equal(payload.summary.editedElementCount, 1);
  assert.deepEqual(payload.summary.editedElementIds, ["burger.sign"]);
  assert.equal(payload.summary.includesTheatreTimeline, true);
  assert.match(payload.handoff.instruction, /上传给 Codex/);

  const imported = parseWorkbenchFile(JSON.stringify(payload));
  assert.equal(imported.layoutDocument.elements["burger.sign"].x, 18);
  assert.deepEqual(imported.theatreState, payload.theatreState);
});

test("imports legacy layout-only files", () => {
  const imported = parseWorkbenchFile(
    JSON.stringify({ elements: { "global.title": { y: 12 } } }),
  );
  assert.equal(imported.format, "legacy-layout-document");
  assert.equal(imported.layoutDocument.elements["global.title"].y, 12);
  assert.equal(imported.theatreState, null);
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
  assert.equal(history.undo().truckTimeline.cameraEndY, 0);
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
