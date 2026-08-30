import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("sushi lesson is an independent image-free 3D route", async () => {
  const [html, loader, app, stage, model, fishPrep, mentor] = await Promise.all([
    source("sushi.html"),
    source("sushi-loader.mjs"),
    source("sushi-app.mjs"),
    source("sushi-stage.mjs"),
    source("sushi-model-3d.mjs"),
    source("sushi-fish-prep-3d.mjs"),
    source("sushi-chef-mentor-3d.mjs"),
  ]);

  assert.match(html, /sushi\.css\?v=20260831-sushi3/);
  assert.match(html, /sushi-loader\.mjs\?v=20260831-sushi3/);
  assert.match(html, /id="sushi-canvas"/);
  assert.match(html, /id="sushi-mentor"/);
  assert.match(html, /data-sushi-chapter="fish"/);
  assert.doesNotMatch(html, /<img\b/i);
  assert.match(loader, /sushi-app\.mjs\?v=20260831-sushi3/);
  assert.match(app, /performSushiFishPrep/);
  assert.match(app, /scheduleDemo/);
  assert.match(app, /onMentorCue/);
  assert.match(stage, /createCookingFirstPersonHands/);
  assert.match(stage, /createSushiFishPrep3D/);
  assert.match(stage, /createSushiChefMentor3D/);
  assert.match(stage, /evaluateSushiFishGesture/);
  assert.match(stage, /three-scene-host\.mjs\?v=20260831-sushi3/);
  assert.match(model, /CapsuleGeometry/);
  for (const sourceText of [model, fishPrep, mentor]) {
    assert.doesNotMatch(sourceText, /TextureLoader|\.png|\.jpe?g|\.webp/i);
  }
});

test("sushi interaction keeps hands hygienic and separates their jobs", async () => {
  const [stage, hands] = await Promise.all([
    source("sushi-stage.mjs"),
    source("cooking-first-person-hands.mjs"),
  ]);

  assert.match(stage, /whole-fish-hold/);
  assert.match(stage, /sushi-knife/);
  assert.match(stage, /fish-tweezers/);
  assert.match(stage, /sushi-grip/);
  assert.match(stage, /side:\s*"left"/);
  assert.match(stage, /side:\s*"right"/);
  assert.match(stage, /lostpointercapture/);
  assert.match(stage, /document-hidden/);
  assert.match(stage, /window-blur/);
  assert.match(stage, /event\.key === "Escape"/);
  assert.match(hands, /glove: proceduralMaterial/);
  assert.match(hands, /sleeve: proceduralMaterial/);
  assert.match(hands, /"whole-fish-hold"[\s\S]*poseId: "cradle"/);
  assert.match(hands, /"sushi-knife"[\s\S]*poseId: "bottle-wrap"/);
  assert.match(hands, /"fish-tweezers"[\s\S]*poseId: "precision-pinch"/);
});

test("homepage switches its mode family with the food and opens sushi", async () => {
  const [maps, lobby, index] = await Promise.all([
    source("home-map-carousel-state.mjs"),
    source("home-lobby-app.mjs"),
    source("index.html"),
  ]);

  assert.match(maps, /id: "sushi"[\s\S]*href: "\.\/sushi\.html"[\s\S]*available: true/);
  assert.match(lobby, /HOME_MAP_MODE_IDS/);
  assert.match(lobby, /changeModeIndexForMap\(activeMap\(\)\.id/);
  assert.match(lobby, /mode\.action === "sushi"[\s\S]*sushi\.html/);
  assert.doesNotMatch(lobby, /changeModeIndexForMap\("burger"/);
  assert.match(index, /home-lobby-app\.mjs\?v=20260831-sushi1/);
});
