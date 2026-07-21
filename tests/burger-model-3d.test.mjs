import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../app/static/vendor/three.module.min.js";
import { BURGER_LAYER_IDS, SAUCE_KEYS } from "../app/static/cooking-state.mjs";
import { createBurgerModel3D } from "../app/static/burger-model-3d.mjs";

const closeTo = (actual, expected, epsilon = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} is not close to ${expected}`);
};

const triangleCount = (geometry) => (
  geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3
);

function assertSurfaceRibbonClearance(mesh) {
  const { geometry } = mesh;
  const { surfaceFramePoints, surfaceFrameNormals, sauceCrossSectionPoints } = geometry.userData;
  assert.ok(surfaceFramePoints instanceof Float32Array);
  assert.ok(surfaceFrameNormals instanceof Float32Array);
  assert.equal(sauceCrossSectionPoints, 4);
  const positions = geometry.attributes.position;
  const vertexNormals = geometry.attributes.normal;
  const frameCount = surfaceFramePoints.length / 3;
  assert.equal(positions.count, frameCount * sauceCrossSectionPoints);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const surface = new THREE.Vector3().fromArray(surfaceFramePoints, frame * 3);
    const normal = new THREE.Vector3().fromArray(surfaceFrameNormals, frame * 3);
    for (let cross = 0; cross < sauceCrossSectionPoints; cross += 1) {
      const vertex = new THREE.Vector3().fromBufferAttribute(
        positions, frame * sauceCrossSectionPoints + cross,
      );
      assert.ok(
        vertex.sub(surface).dot(normal) >= mesh.userData.surfaceClearance - 1e-5,
        `sauce frame ${frame} cross-section ${cross} penetrates its food surface`,
      );
      if (cross > 0 && cross < sauceCrossSectionPoints - 1) {
        const vertexNormal = new THREE.Vector3().fromBufferAttribute(
          vertexNormals, frame * sauceCrossSectionPoints + cross,
        );
        assert.ok(
          vertexNormal.dot(normal) > 0.2,
          `sauce frame ${frame} cross-section ${cross} faces into its food surface`,
        );
      }
    }
  }
}

test("builds seven stable, independently transformable Three.js food layers", () => {
  const burger = createBurgerModel3D(THREE);

  assert.ok(burger.root instanceof THREE.Group);
  assert.deepEqual(burger.getLayerOrder(), BURGER_LAYER_IDS);
  assert.equal(burger.layers.size, BURGER_LAYER_IDS.length);
  assert.deepEqual([...burger.layers.keys()], BURGER_LAYER_IDS);
  assert.ok([...burger.layers.values()].every((layer) => layer instanceof THREE.Group));
  assert.ok(Object.isFrozen(burger.selectableSurfaces));
  assert.equal(burger.selectableSurfaces.length, BURGER_LAYER_IDS.length);
  assert.ok(burger.selectableSurfaces.every((surface) => surface instanceof THREE.Mesh));
  assert.ok(burger.selectableSurfaces.every((surface) => Object.isFrozen(
    surface.userData.cookingSelectable,
  )));
  for (const layerId of BURGER_LAYER_IDS) {
    const layer = burger.getLayer(layerId);
    const bounds = layer.userData.selectableSurface.geometry.boundingBox;
    assert.equal(layer.userData.boundsMinY, bounds.min.y);
    assert.equal(layer.userData.boundsMaxY, bounds.max.y);
  }

  const patty = burger.getLayer("patty");
  const tomato = burger.getLayer("tomato");
  const tomatoBefore = tomato.position.clone();
  burger.setLayerPose("patty", {
    position: { x: 0.72, y: 1.9, z: -0.31 },
    rotation: { x: 0.12, y: -0.48, z: 0.05 },
  });
  assert.deepEqual(patty.position.toArray(), [0.72, 1.9, -0.31]);
  closeTo(patty.rotation.x, 0.12);
  closeTo(patty.rotation.y, -0.48);
  closeTo(patty.rotation.z, 0.05);
  assert.deepEqual(tomato.position.toArray(), tomatoBefore.toArray());

  burger.dispose();
});

test("creates removable repeated ingredient instances that remain independently stackable and sauceable", () => {
  const burger = createBurgerModel3D(THREE);
  const template = burger.getLayer("patty");
  const repeated = burger.createLayerInstance("patty", "patty#2");
  const repeatedSurface = repeated.userData.selectableSurface;

  assert.equal(burger.getLayer("patty#2"), repeated);
  assert.equal(repeated.userData.foodLayer.ingredientId, "patty");
  assert.equal(repeatedSurface.userData.cookingSelectable.layerId, "patty#2");
  assert.equal(repeatedSurface.userData.cookingSelectable.ingredientId, "patty");
  assert.equal(repeatedSurface.geometry, template.userData.selectableSurface.geometry);
  assert.ok(burger.getSelectableSurfaces().includes(repeatedSurface));

  burger.reorderLayer("patty#2", 0);
  const sauce = burger.addSauceStroke({
    sauce: "mustard",
    layerId: "patty#2",
    amount: 0.5,
    points: [[-0.25, 0], [0.25, 0]],
  });
  assert.equal(sauce.parent, repeated);

  assert.equal(burger.removeLayerInstance("patty#2"), true);
  assert.equal(burger.layers.has("patty#2"), false);
  assert.equal(burger.getSelectableSurfaces().includes(repeatedSurface), false);
  assert.throws(() => burger.getLayer("patty#2"), /unknown/i);
  burger.dispose();
});

test("uses distinct procedural volume geometry and texture-free cooking materials", () => {
  const burger = createBurgerModel3D(THREE);
  const surfaces = Object.fromEntries(
    BURGER_LAYER_IDS.map((id) => [id, burger.getLayer(id).userData.selectableSurface]),
  );

  assert.ok(surfaces["bottom-bun"].geometry instanceof THREE.LatheGeometry);
  assert.ok(surfaces["top-bun"].geometry instanceof THREE.LatheGeometry);
  assert.ok(surfaces.patty.geometry instanceof THREE.CylinderGeometry);
  assert.equal(surfaces.cheese.geometry.type, "BufferGeometry");
  assert.ok(surfaces.tomato.geometry instanceof THREE.CylinderGeometry);
  assert.ok(surfaces.pickle.geometry instanceof THREE.CylinderGeometry);
  assert.equal(surfaces.lettuce.geometry.type, "BufferGeometry");
  assert.notEqual(surfaces.cheese.geometry, surfaces.lettuce.geometry);

  const geometryTypes = new Set(burger.selectableSurfaces.map(({ geometry }) => geometry.type));
  assert.ok(geometryTypes.size >= 3);
  for (const surface of burger.selectableSurfaces) {
    surface.geometry.computeBoundingBox();
    const size = surface.geometry.boundingBox.getSize(new THREE.Vector3());
    assert.ok(size.x > 0.5 && size.y > 0.05 && size.z > 0.5, `${surface.name} has volume`);
    assert.equal(surface.material.map, null);
    assert.ok(surface.material instanceof THREE.MeshStandardMaterial);
    assert.ok(surface.material.roughness >= 0.35 && surface.material.roughness <= 1);
  }
  assert.notEqual(surfaces.patty.material.color.getHex(), surfaces.tomato.material.color.getHex());
  assert.notEqual(surfaces.lettuce.material.color.getHex(), surfaces.pickle.material.color.getHex());

  burger.dispose();
});

test("keeps cheese and lettuce visually thin while separating contact planes from loose edges", () => {
  const burger = createBurgerModel3D(THREE);
  const cheese = burger.getLayer("cheese");
  const lettuce = burger.getLayer("lettuce");
  const cheeseBounds = cheese.userData.selectableSurface.geometry.boundingBox;
  const lettuceBounds = lettuce.userData.selectableSurface.geometry.boundingBox;

  assert.ok(cheeseBounds.max.y - cheeseBounds.min.y <= 0.2, "cheese is a thin slice");
  assert.ok(lettuceBounds.max.y - lettuceBounds.min.y <= 0.12, "lettuce is a thin leaf");
  for (const layerId of BURGER_LAYER_IDS) {
    const layer = burger.getLayer(layerId);
    assert.ok(Number.isFinite(layer.userData.stackMinY), `${layerId} has a lower contact plane`);
    assert.ok(Number.isFinite(layer.userData.stackMaxY), `${layerId} has an upper contact plane`);
    assert.ok(layer.userData.stackMinY >= layer.userData.boundsMinY);
    assert.ok(layer.userData.stackMaxY <= layer.userData.boundsMaxY);
    assert.ok(layer.userData.stackMaxY > layer.userData.stackMinY);
  }
  assert.ok(
    cheese.userData.stackMinY > cheese.userData.boundsMinY,
    "a drooping cheese corner does not lift the whole stack",
  );

  burger.dispose();
});

test("uses smooth food materials and lightweight ingredient-specific surface details", () => {
  const burger = createBurgerModel3D(THREE);
  assert.ok(burger.selectableSurfaces.every(({ material }) => material.flatShading === false));
  assert.ok(burger.getLayer("top-bun").userData.selectableSurface.geometry.parameters.segments >= 40);
  const kinds = new Set();
  burger.root.traverse((object) => {
    if (object.userData.foodDecoration?.kind) kinds.add(object.userData.foodDecoration.kind);
  });
  for (const kind of [
    "sesame", "bun-toast", "patty-char", "tomato-seed", "pickle-seed", "lettuce-vein",
  ]) assert.ok(kinds.has(kind), kind);
  burger.root.traverse((object) => {
    if (object.userData.foodDecoration) assert.equal(object.raycast, burger.noRaycast);
  });
  burger.dispose();
});

test("marks only edible solids selectable while decoration never raycasts", () => {
  const burger = createBurgerModel3D(THREE);
  burger.setExpanded(true);
  burger.root.updateMatrixWorld(true);

  const topBun = burger.getLayer("top-bun");
  const world = topBun.getWorldPosition(new THREE.Vector3());
  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(world.x, world.y + 5, world.z),
    new THREE.Vector3(0, -1, 0),
  );
  const hits = raycaster.intersectObject(burger.root, true);
  assert.ok(hits.length > 0);
  assert.ok(hits.every(({ object }) => burger.selectableSurfaces.includes(object)));

  const decoration = [];
  burger.root.traverse((object) => {
    if (object.userData.foodDecoration) decoration.push(object);
  });
  assert.ok(decoration.length > 0, "toasted bun has low-draw-call sesame decoration");
  assert.ok(decoration.every((object) => object.raycast !== THREE.Mesh.prototype.raycast));
  burger.dispose();
});

test("expands and collapses layers without overwriting horizontal workbench poses", () => {
  const burger = createBurgerModel3D(THREE);
  burger.setLayerPose("cheese", { position: { x: -0.8, z: 0.45 } });
  const collapsedY = BURGER_LAYER_IDS.map((id) => burger.getLayer(id).position.y);

  burger.setExpanded(true);
  const expandedY = BURGER_LAYER_IDS.map((id) => burger.getLayer(id).position.y);
  assert.ok(expandedY.every((value, index) => index === 0 || value > expandedY[index - 1]));
  assert.ok(expandedY.at(-1) - expandedY[0] > collapsedY.at(-1) - collapsedY[0] + 1.5);
  assert.equal(burger.getLayer("cheese").position.x, -0.8);
  assert.equal(burger.getLayer("cheese").position.z, 0.45);

  burger.setExpanded(false);
  BURGER_LAYER_IDS.forEach((id, index) => closeTo(burger.getLayer(id).position.y, collapsedY[index]));
  assert.equal(burger.getLayer("cheese").position.x, -0.8);
  burger.dispose();
});

test("reorders layers, snaps them to recipe stack anchors, and applies compositions", () => {
  const burger = createBurgerModel3D(THREE);
  burger.reorderLayer("pickle", 1);
  assert.deepEqual(burger.getLayerOrder(), [
    "bottom-bun", "pickle", "patty", "cheese", "tomato", "lettuce", "top-bun",
  ]);
  burger.setLayerPose("pickle", {
    position: { x: 0.9, y: 3.4, z: -0.4 },
    rotation: { x: 0.2, y: 0.6, z: -0.1 },
  });
  burger.snapLayer("pickle");
  assert.equal(burger.getLayer("pickle").position.x, 0);
  assert.equal(burger.getLayer("pickle").position.z, 0);
  assert.deepEqual(burger.getLayer("pickle").rotation.toArray().slice(0, 3), [0, 0, 0]);

  burger.applyComposition({
    food: "burger",
    layerOrder: [...BURGER_LAYER_IDS].reverse(),
    layerPoses: Object.fromEntries(BURGER_LAYER_IDS.map((id, index) => [id, {
      x: index / 10,
      z: -index / 20,
      yaw: index / 30,
    }])),
    strokes: [{
      sauce: "mustard",
      layerId: "cheese",
      amount: 0.4,
      points: [[-0.5, -0.2], [0, 0.3], [0.5, -0.1]],
    }],
  });
  assert.deepEqual(burger.getLayerOrder(), [...BURGER_LAYER_IDS].reverse());
  assert.equal(burger.getLayer("lettuce").position.x, 0.4);
  assert.equal(burger.getLayer("lettuce").position.z, -0.2);
  closeTo(burger.getLayer("lettuce").rotation.y, 4 / 30);
  assert.equal(burger.getSnapshot().strokes.length, 1);
  burger.dispose();
});

test("adds repeated and mixed condiment strokes as surface-safe rounded ribbons", () => {
  const burger = createBurgerModel3D(THREE);
  const chili = burger.addSauceStroke({
    sauce: "chili",
    layerId: "patty",
    amount: 0.5,
    points: [[-0.7, -0.1], [-0.2, 0.25], [0.25, -0.15], [0.7, 0.1]],
  });
  const mustard = burger.addSauceStroke({
    sauce: "mustard",
    layerId: "patty",
    amount: 0.8,
    points: [[-0.5, 0.4], [0.1, 0.1], [0.6, 0.35]],
  });
  const chiliAgain = burger.addSauceStroke({
    sauce: "chili",
    layerId: "tomato",
    amount: 0.25,
    points: [[-0.4, 0], [0.4, 0]],
  });

  for (const mesh of [chili, mustard, chiliAgain]) {
    assert.ok(mesh instanceof THREE.Mesh);
    assert.equal(mesh.geometry.type, "BufferGeometry");
    assert.equal(mesh.geometry.userData.sauceShape, "surface-ribbon");
    assert.equal(mesh.material.map, null);
    assert.equal(mesh.raycast, burger.noRaycast);
    assert.ok(Object.isFrozen(mesh.userData.sauceStroke));
    assertSurfaceRibbonClearance(mesh);
  }
  assert.equal(chili.parent, burger.getLayer("patty"));
  assert.equal(mustard.parent, burger.getLayer("patty"));
  assert.equal(chiliAgain.parent, burger.getLayer("tomato"));
  assert.notEqual(chili.material.color.getHex(), mustard.material.color.getHex());
  assert.equal(burger.getSnapshot().strokes.length, 3);

  burger.clearSauces();
  assert.equal(burger.getSnapshot().strokes.length, 0);
  assert.equal(chili.parent, null);
  assert.equal(mustard.parent, null);
  assert.equal(chiliAgain.parent, null);
  burger.dispose();
});

test("previews sauce on its food immediately and promotes the same mesh on commit", () => {
  const burger = createBurgerModel3D(THREE);
  const preview = burger.previewSauceStroke("gesture-1:0", {
    sauce: "mustard",
    layerId: "patty",
    amount: 0.5,
    points: [[-0.3, 0], [0.3, 0]],
  });

  assert.equal(preview.parent, burger.getLayer("patty"));
  assert.equal(preview.userData.preview, true);
  assert.ok(preview.userData.surfaceOffset >= preview.userData.tubeRadius + 0.008);
  assert.equal(burger.getSnapshot().strokes.length, 0, "preview is not authoritative state");

  const committed = burger.commitSaucePreviews("gesture-1");
  assert.deepEqual(committed, [preview]);
  assert.equal(committed[0], preview);
  assert.equal(preview.userData.preview, false);
  assert.equal(burger.getSnapshot().strokes.length, 1);

  const cancelled = burger.previewSauceStroke("gesture-2:0", {
    sauce: "sour",
    layerId: "cheese",
    amount: 0.4,
    points: [[-0.2, -0.2], [0.2, 0.2]],
  });
  assert.equal(burger.cancelSaucePreviews("gesture-2"), 1);
  assert.equal(cancelled.parent, null);
  assert.equal(burger.getSnapshot().strokes.length, 1);
  burger.dispose();
});

test("keeps live preview segments attached to their own food layers", () => {
  const burger = createBurgerModel3D(THREE);
  const patty = burger.previewSauceStroke("gesture-3:0", {
    sauce: "chili", layerId: "patty", amount: 0.5, points: [[-0.4, 0], [0.4, 0]],
  });
  const cheese = burger.previewSauceStroke("gesture-3:1", {
    sauce: "chili", layerId: "cheese", amount: 0.5, points: [[-0.4, 0], [0.4, 0]],
  });
  assert.equal(patty.parent, burger.getLayer("patty"));
  assert.equal(cheese.parent, burger.getLayer("cheese"));
  assert.equal(burger.cancelSaucePreviews("gesture-3"), 2);
  burger.dispose();
});

test("projects sauce paths onto each edible footprint and its real top surface", () => {
  const burger = createBurgerModel3D(THREE);
  const centerBun = burger.projectSurfacePoint("top-bun", [0, 0]);
  const edgeBun = burger.projectSurfacePoint("top-bun", [0.9, 0]);
  assert.ok(centerBun.y > edgeBun.y + 0.2, "bun sauce follows the toasted dome");

  const pattyCorner = burger.projectSurfacePoint("patty", [1, 1]);
  const pattyLayer = burger.getLayer("patty");
  assert.ok(
    Math.hypot(pattyCorner.x, pattyCorner.z) <= pattyLayer.userData.surfaceRadius * 0.93,
    "round layers project square input coordinates back into the edible disc",
  );
  const cheeseCorner = burger.projectSurfacePoint("cheese", [1, 1]);
  assert.ok(Math.abs(cheeseCorner.x) < 1 && Math.abs(cheeseCorner.z) < 1);
  const lettuceCenter = burger.projectSurfacePoint("lettuce", [0, 0]);
  assert.ok(Math.hypot(lettuceCenter.x, lettuceCenter.z) > 0.3, "lettuce avoids its real inner hole");
  for (const layerId of BURGER_LAYER_IDS) {
    const projected = burger.projectSurfacePoint(layerId, [1, 1]);
    assert.ok(
      [projected.x, projected.y, projected.z].every(Number.isFinite),
      `${layerId} owns a usable surface projector`,
    );
  }

  const sauce = burger.addSauceStroke({
    sauce: "mustard",
    layerId: "top-bun",
    amount: 0.6,
    points: [[-0.95, 0.5], [0, 0], [0.95, 0.5]],
  });
  const surface = burger.getLayer("top-bun").userData.selectableSurface;
  const raycaster = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  for (const time of [0, 0.125, 0.25, 0.5, 0.75, 0.875, 1]) {
    const sample = sauce.geometry.parameters.path.getPoint(time, new THREE.Vector3());
    raycaster.set(new THREE.Vector3(sample.x, 4, sample.z), down);
    const [hit] = raycaster.intersectObject(surface, false);
    assert.ok(hit, `ribbon sample ${time} remains inside the bun footprint`);
    assert.ok(
      sample.y - hit.point.y >= sauce.userData.surfaceClearance * 0.5,
      `ribbon sample ${time} clears the bun surface`,
    );
  }
  assertSurfaceRibbonClearance(sauce);
  burger.dispose();
});

test("routes every legal lettuce stroke continuously around the annular hole", () => {
  const cases = [
    [[-1, 0], [1, 0]],
    [[1, 0], [-1, 0]],
    [[0, -1], [0, 1]],
    [[-0.02, 0], [0.02, 0]],
    [[-1, 0], [1, 0], [-0.8, 0.2], [0.8, -0.2]],
    [[0, 0], [0, 0]],
    Array.from({ length: 24 }, (_, index) => [
      index % 2 === 0 ? -1 : 1,
      index % 4 < 2 ? 0.04 : -0.04,
    ]),
  ];
  for (const points of cases) {
    const burger = createBurgerModel3D(THREE);
    const sauce = burger.addSauceStroke({
      sauce: "sour",
      layerId: "lettuce",
      amount: 0.5,
      points,
    });
    const path = sauce.geometry.parameters.path;
    const first = path.getPointAt(0, new THREE.Vector3());
    const last = path.getPointAt(1, new THREE.Vector3());
    const expectedFirst = burger.projectSurfacePoint("lettuce", points[0]);
    const expectedLast = burger.projectSurfacePoint("lettuce", points.at(-1));
    closeTo(first.x, expectedFirst.x, 0.025);
    closeTo(first.z, expectedFirst.z, 0.025);
    closeTo(last.x, expectedLast.x, 0.025);
    closeTo(last.z, expectedLast.z, 0.025);
    assert.equal(sauce.userData.inputPointCount, points.length);
    assert.ok(sauce.userData.routePointCount <= 93, "24 inputs have a bounded generated route");
    assert.ok(
      [...sauce.geometry.attributes.position.array].every(Number.isFinite),
      "generated tube vertices never contain NaN",
    );

    const raycaster = new THREE.Raycaster();
    const surface = burger.getLayer("lettuce").userData.selectableSurface;
    let previous = null;
    let totalDistance = 0;
    const sampleCount = Math.max(64, sauce.userData.routePointCount * 4);
    for (let index = 0; index <= sampleCount; index += 1) {
      const sample = path.getPointAt(index / sampleCount, new THREE.Vector3());
      assert.ok(sample.toArray().every(Number.isFinite), "route never generates NaN");
      raycaster.set(new THREE.Vector3(sample.x, 3, sample.z), new THREE.Vector3(0, -1, 0));
      const [hit] = raycaster.intersectObject(surface, false);
      assert.ok(hit, "every generated sample stays on the actual lettuce annulus");
      assert.ok(Math.abs(sample.y - hit.point.y - sauce.userData.surfaceOffset) < 0.04);
      if (previous) {
        const step = previous.distanceTo(sample);
        assert.ok(step < 0.4, `route remains continuous (${step})`);
        totalDistance += step;
      }
      previous = sample;
    }
    assert.ok(totalDistance > 0.01, "tube curve is non-degenerate");
    burger.dispose();
  }
});

test("strictly rejects invalid layer poses, ordering, and condiment data", () => {
  const burger = createBurgerModel3D(THREE);
  const invalidCalls = [
    () => burger.getLayer("unknown"),
    () => burger.setLayerPose("unknown", {}),
    () => burger.setLayerPose("patty", { position: { x: Number.NaN } }),
    () => burger.setLayerPose("patty", { rotation: { y: Number.POSITIVE_INFINITY } }),
    () => burger.reorderLayer("patty", 2.5),
    () => burger.reorderLayer("patty", -1),
    () => burger.applyComposition({ food: "sushi" }),
    () => burger.applyComposition({
      food: "burger",
      layerOrder: [...BURGER_LAYER_IDS.slice(0, -1), "patty"],
      layerPoses: {},
      strokes: [],
    }),
    () => burger.addSauceStroke({
      sauce: "unknown", layerId: "patty", amount: 0.5, points: [[0, 0], [1, 1]],
    }),
    () => burger.addSauceStroke({
      sauce: "chili", layerId: "unknown", amount: 0.5, points: [[0, 0], [1, 1]],
    }),
    () => burger.addSauceStroke({
      sauce: "chili", layerId: "patty", amount: 0, points: [[0, 0], [1, 1]],
    }),
    () => burger.addSauceStroke({
      sauce: "chili", layerId: "patty", amount: 0.5, points: [[0, 0]],
    }),
    () => burger.addSauceStroke({
      sauce: "chili", layerId: "patty", amount: 0.5, points: [[0, 0], [1.1, 0]],
    }),
    () => burger.addSauceStroke({
      sauce: "chili", layerId: "patty", amount: 0.5,
      points: Array.from({ length: 25 }, () => [0, 0]),
    }),
    () => burger.setBiteAmount(-0.1),
    () => burger.setBiteAmount(Number.NaN),
  ];
  for (const call of invalidCalls) assert.throws(call, TypeError);
  burger.dispose();
});

test("applyComposition exactly matches the authoritative server recipe schema", () => {
  const burger = createBurgerModel3D(THREE);
  const valid = {
    food: "burger",
    layerOrder: [...BURGER_LAYER_IDS],
    layerPoses: Object.fromEntries(BURGER_LAYER_IDS.map((id, index) => [id, {
      x: index === 0 ? -1 : index === 1 ? 1 : 0,
      z: index === 2 ? -1 : index === 3 ? 1 : 0,
      yaw: index === 4 ? -3.1416 : index === 5 ? 3.1416 : 0,
    }])),
    strokes: [
      {
        sauce: "chili",
        layerId: "patty",
        amount: 0.01,
        points: [[-1, -1], [1, 1]],
      },
      {
        sauce: "sticky",
        layerId: "cheese",
        amount: 1,
        points: [[-1, 1], [1, -1]],
      },
    ],
  };
  burger.applyComposition(valid);
  assert.deepEqual(burger.serializeComposition(), valid, "all numeric schema boundaries are accepted");
  const before = burger.getSnapshot();
  const malformed = [
    { ...valid, extra: true },
    { food: valid.food, layerOrder: valid.layerOrder, layerPoses: valid.layerPoses },
    {
      ...valid,
      layerPoses: { ...valid.layerPoses, patty: { ...valid.layerPoses.patty, x: 999 } },
    },
    {
      ...valid,
      layerPoses: { ...valid.layerPoses, patty: { ...valid.layerPoses.patty, extra: 0 } },
    },
    {
      ...valid,
      layerPoses: { ...valid.layerPoses, patty: { x: 0, z: 0 } },
    },
    {
      ...valid,
      strokes: [{ ...valid.strokes[0], extra: true }],
    },
    {
      ...valid,
      strokes: [],
    },
  ];
  for (const composition of malformed) {
    assert.throws(() => burger.applyComposition(composition), TypeError);
    assert.deepEqual(burger.getSnapshot(), before, "rejected composition leaves live state unchanged");
  }
  burger.dispose();
});

test("applyComposition reconstructs authoritative poses without stale tilt", () => {
  const burger = createBurgerModel3D(THREE);
  burger.setLayerPose("patty", {
    position: { x: 0.7, y: 3.2, z: -0.6 },
    rotation: { x: 0.9, y: -0.8, z: 0.7 },
  });
  const composition = {
    food: "burger",
    layerOrder: [...BURGER_LAYER_IDS],
    layerPoses: Object.fromEntries(BURGER_LAYER_IDS.map((id) => [id, {
      x: id === "patty" ? 0.25 : 0,
      z: id === "patty" ? -0.15 : 0,
      yaw: id === "patty" ? 0.45 : 0,
    }])),
    strokes: [{
      sauce: "chili", layerId: "patty", amount: 0.5, points: [[-0.2, 0], [0.2, 0]],
    }],
  };

  burger.applyComposition(composition);
  const patty = burger.getLayer("patty");
  closeTo(patty.position.x, 0.25);
  closeTo(patty.position.z, -0.15);
  closeTo(patty.rotation.x, 0);
  closeTo(patty.rotation.y, 0.45);
  closeTo(patty.rotation.z, 0);
  burger.dispose();
});

test("applyComposition stages sauce geometry and rolls back construction failures", () => {
  let constructionCount = 0;
  let failAt = Number.POSITIVE_INFINITY;
  const created = [];
  const onSauceGeometry = (geometry) => {
    constructionCount += 1;
    geometry.disposeCount = 0;
    const originalDispose = geometry.dispose.bind(geometry);
    geometry.dispose = () => {
      geometry.disposeCount += 1;
      originalDispose();
    };
    created.push(geometry);
    if (constructionCount === failAt) throw new Error("injected sauce failure");
  };
  const burger = createBurgerModel3D(THREE, { onSauceGeometry });
  const originalMesh = burger.addSauceStroke({
    sauce: "chili", layerId: "patty", amount: 0.5, points: [[-0.3, 0], [0.3, 0]],
  });
  burger.reorderLayer("pickle", 1);
  burger.setLayerPose("cheese", {
    position: { x: 0.4, y: 2.4, z: -0.3 },
    rotation: { x: 0.2, y: 0.3, z: -0.1 },
  });
  const before = burger.getSnapshot();
  failAt = constructionCount + 2;
  const replacement = {
    food: "burger",
    layerOrder: [...BURGER_LAYER_IDS].reverse(),
    layerPoses: Object.fromEntries(BURGER_LAYER_IDS.map((id) => [id, {
      x: 0, z: 0, yaw: 0,
    }])),
    strokes: [
      { sauce: "mustard", layerId: "cheese", amount: 0.4, points: [[-0.4, 0], [0.4, 0]] },
      { sauce: "sour", layerId: "tomato", amount: 0.4, points: [[-0.4, 0], [0.4, 0]] },
      { sauce: "sticky", layerId: "pickle", amount: 0.4, points: [[-0.4, 0], [0.4, 0]] },
    ],
  };

  assert.throws(() => burger.applyComposition(replacement), /injected sauce failure/);
  assert.deepEqual(burger.getSnapshot(), before);
  assert.equal(originalMesh.parent, burger.getLayer("patty"));
  assert.equal(originalMesh.geometry.disposeCount, 0);
  assert.equal(created.length, 3, "the old, staged, and failing geometries were observed");
  assert.equal(created[1].disposeCount, 1, "the completed staged candidate is cleaned once");
  assert.equal(created[2].disposeCount, 1, "the failing candidate is cleaned once");

  failAt = Number.POSITIVE_INFINITY;
  burger.applyComposition(replacement);
  assert.deepEqual(burger.serializeComposition(), replacement);
  assert.equal(originalMesh.parent, null);
  assert.equal(originalMesh.geometry.disposeCount, 1, "successful swap retires old geometry once");
  const successfulCandidates = created.slice(3);
  assert.equal(successfulCandidates.length, replacement.strokes.length);
  assert.ok(successfulCandidates.every(({ disposeCount }) => disposeCount === 0));
  burger.dispose();
  assert.equal(originalMesh.geometry.disposeCount, 1);
  assert.equal(created[1].disposeCount, 1, "failed staged geometry is not disposed twice");
  assert.equal(created[2].disposeCount, 1, "failing geometry is not disposed twice");
  assert.ok(successfulCandidates.every(({ disposeCount }) => disposeCount === 1));
});

test("caps condiment history to 64 strokes and disposes evicted dynamic geometry", () => {
  const disposed = [];
  const burger = createBurgerModel3D(THREE, {
    onSauceGeometry(geometry) {
      const originalDispose = geometry.dispose.bind(geometry);
      geometry.dispose = () => {
        disposed.push(geometry);
        originalDispose();
      };
    },
  });
  const meshes = [];
  for (let index = 0; index < 65; index += 1) {
    meshes.push(burger.addSauceStroke({
      sauce: SAUCE_KEYS[index % SAUCE_KEYS.length],
      layerId: BURGER_LAYER_IDS[index % BURGER_LAYER_IDS.length],
      amount: 0.25,
      points: [[-0.4, -0.2], [0.4, 0.2]],
    }));
  }

  assert.equal(burger.getSnapshot().strokes.length, 64);
  assert.equal(meshes[0].parent, null);
  assert.equal(disposed.filter((geometry) => geometry === meshes[0].geometry).length, 1);
  burger.clearSauces();
  assert.equal(disposed.length, 65);
  assert.equal(new Set(disposed).size, 65);
  burger.dispose();
  assert.equal(disposed.length, 65, "cleared dynamic geometry is not disposed twice");
});

test("applies observable reversible vertex-level bite deformation", () => {
  const burger = createBurgerModel3D(THREE);
  const topBun = burger.getLayer("top-bun").userData.selectableSurface;
  const before = [...topBun.geometry.attributes.position.array];
  topBun.geometry.computeBoundingBox();
  const beforeWidth = topBun.geometry.boundingBox.max.x - topBun.geometry.boundingBox.min.x;

  burger.setBiteAmount(1);
  const bitten = [...topBun.geometry.attributes.position.array];
  topBun.geometry.computeBoundingBox();
  const bittenWidth = topBun.geometry.boundingBox.max.x - topBun.geometry.boundingBox.min.x;
  assert.equal(burger.root.userData.biteAmount, 1);
  assert.notDeepEqual(bitten, before);
  assert.ok(bittenWidth < beforeWidth);
  assert.equal(burger.root.scale.x, 1, "bite is not faked by scaling the whole burger");

  burger.setBiteAmount(0);
  assert.deepEqual([...topBun.geometry.attributes.position.array], before);
  assert.equal(burger.root.userData.biteAmount, 0);
  burger.dispose();
});

test("restores all seven food layers exactly after multi-frame bite deformation", () => {
  const burger = createBurgerModel3D(THREE);
  const records = BURGER_LAYER_IDS.map((layerId) => {
    const geometry = burger.getLayer(layerId).userData.selectableSurface.geometry;
    return {
      layerId,
      geometry,
      position: geometry.attributes.position,
      normal: geometry.attributes.normal,
      positionArray: geometry.attributes.position.array,
      normalArray: geometry.attributes.normal.array,
      basePositions: [...geometry.attributes.position.array],
      baseNormals: [...geometry.attributes.normal.array],
      boundingBox: geometry.boundingBox,
      boundingSphere: geometry.boundingSphere,
      baseBounds: {
        min: geometry.boundingBox.min.toArray(),
        max: geometry.boundingBox.max.toArray(),
        center: geometry.boundingSphere.center.toArray(),
        radius: geometry.boundingSphere.radius,
      },
    };
  });

  for (const amount of [0.12, 0.38, 0.67, 1, 0.81, 0.46, 0.19]) {
    burger.setBiteAmount(amount);
    for (const record of records) {
      const { geometry, normal } = record;
      assert.equal(geometry.attributes.position, record.position);
      assert.equal(geometry.attributes.normal, normal);
      assert.equal(geometry.attributes.position.array, record.positionArray);
      assert.equal(geometry.attributes.normal.array, record.normalArray);
      assert.equal(geometry.boundingBox, record.boundingBox);
      assert.equal(geometry.boundingSphere, record.boundingSphere);
      for (let index = 0; index < normal.count; index += 1) {
        const length = Math.hypot(normal.getX(index), normal.getY(index), normal.getZ(index));
        assert.ok(Number.isFinite(length), `${record.layerId} normal ${index} stays finite`);
        assert.ok(length > 0.999 && length < 1.001, `${record.layerId} normal ${index} stays unit`);
      }
    }
  }

  burger.setBiteAmount(0);
  for (const record of records) {
    const { geometry } = record;
    assert.deepEqual([...geometry.attributes.position.array], record.basePositions);
    assert.deepEqual([...geometry.attributes.normal.array], record.baseNormals);
    assert.equal(geometry.attributes.position, record.position);
    assert.equal(geometry.attributes.normal, record.normal);
    assert.equal(geometry.boundingBox, record.boundingBox);
    assert.equal(geometry.boundingSphere, record.boundingSphere);
    assert.deepEqual(geometry.boundingBox.min.toArray(), record.baseBounds.min);
    assert.deepEqual(geometry.boundingBox.max.toArray(), record.baseBounds.max);
    assert.deepEqual(geometry.boundingSphere.center.toArray(), record.baseBounds.center);
    assert.equal(geometry.boundingSphere.radius, record.baseBounds.radius);
  }
  burger.dispose();
});

test("keeps existing and new sauce ribbons attached to bite-aware edible surfaces", () => {
  const burger = createBurgerModel3D(THREE);
  const chili = burger.addSauceStroke({
    sauce: "chili", layerId: "top-bun", amount: 0.8, points: [[0.65, -0.1], [1, 0.1]],
  });
  const mustard = burger.addSauceStroke({
    sauce: "mustard", layerId: "patty", amount: 0.5, points: [[0.7, 0], [1, 0.2]],
  });
  const originalMeshes = [chili, mustard];
  const originalGeometries = originalMeshes.map(({ geometry }) => geometry);

  const assertSaucesConform = () => {
    for (const layerId of ["top-bun", "patty"]) {
      const layer = burger.getLayer(layerId);
      const surface = layer.userData.selectableSurface;
      const raycaster = new THREE.Raycaster();
      for (const mesh of layer.children.filter(({ userData }) => userData.sauceStroke)) {
        for (const time of [0, 0.25, 0.5, 0.75, 1]) {
          const sample = mesh.geometry.parameters.path.getPoint(time, new THREE.Vector3());
          raycaster.set(new THREE.Vector3(sample.x, 4, sample.z), new THREE.Vector3(0, -1, 0));
          const [hit] = raycaster.intersectObject(surface, false);
          assert.ok(hit, `${layerId} sauce remains inside the bitten edible footprint`);
          assert.ok(
            sample.y - hit.point.y >= mesh.userData.surfaceClearance * 0.25,
            `${layerId} ribbon remains above the bitten surface`,
          );
        }
      }
    }
  };

  burger.setBiteAmount(0.85);
  assert.equal(burger.getSnapshot().strokes.length, 2);
  assert.deepEqual(
    [chili, mustard].map(({ geometry }) => geometry),
    originalGeometries,
    "bite deformation preserves every existing sauce geometry",
  );
  assertSaucesConform();
  const sticky = burger.addSauceStroke({
    sauce: "sticky", layerId: "top-bun", amount: 0.6, points: [[0.85, -0.15], [1, 0.15]],
  });
  const stickyBitten = [...sticky.geometry.attributes.position.array];
  assert.equal(burger.getSnapshot().strokes.length, 3);
  assertSaucesConform();

  burger.setBiteAmount(0);
  assert.equal(burger.getSnapshot().strokes.length, 3);
  assert.notDeepEqual(
    [...sticky.geometry.attributes.position.array],
    stickyBitten,
    "a sauce created while bitten still owns an unbitten rest pose",
  );
  assert.equal(chili, originalMeshes[0]);
  assert.equal(mustard, originalMeshes[1]);
  assertSaucesConform();
  burger.dispose();
});

test("animates 64 sauce ribbons in place without constructing or replacing geometry", () => {
  let constructionCount = 0;
  const disposed = [];
  const burger = createBurgerModel3D(THREE, {
    onSauceGeometry(geometry) {
      constructionCount += 1;
      const originalDispose = geometry.dispose.bind(geometry);
      geometry.dispose = () => {
        disposed.push(geometry);
        originalDispose();
      };
    },
  });
  const meshes = Array.from({ length: 64 }, (_, index) => burger.addSauceStroke({
    sauce: SAUCE_KEYS[index % SAUCE_KEYS.length],
    layerId: BURGER_LAYER_IDS[index % BURGER_LAYER_IDS.length],
    amount: 0.3 + (index % 5) * 0.1,
    points: [[0.55, -0.15], [0.82, 0], [1, 0.15]],
  }));
  const geometries = meshes.map(({ geometry }) => geometry);
  const parents = meshes.map(({ parent }) => parent);
  const positionAttributes = geometries.map(({ attributes }) => attributes.position);
  const positionArrays = positionAttributes.map(({ array }) => array);
  const normalAttributes = geometries.map(({ attributes }) => attributes.normal);
  const normalArrays = normalAttributes.map(({ array }) => array);
  const boundingBoxes = geometries.map(({ boundingBox }) => boundingBox);
  const boundingSpheres = geometries.map(({ boundingSphere }) => boundingSphere);
  const unbittenVertices = positionArrays.map((array) => [...array]);

  assert.equal(constructionCount, 64);
  for (const amount of [0.08, 0.2, 0.35, 0.5, 0.7, 0.9, 1, 0.76, 0.42, 0.13]) {
    burger.setBiteAmount(amount);
    assert.equal(constructionCount, 64, "bite frames never construct replacement sauce geometry");
    meshes.forEach((mesh, index) => {
      assert.equal(mesh.geometry, geometries[index]);
      assert.equal(mesh.geometry.attributes.position, positionAttributes[index]);
      assert.equal(mesh.geometry.attributes.position.array, positionArrays[index]);
      assert.equal(mesh.geometry.attributes.normal, normalAttributes[index]);
      assert.equal(mesh.geometry.attributes.normal.array, normalArrays[index]);
      assert.equal(mesh.geometry.boundingBox, boundingBoxes[index]);
      assert.equal(mesh.geometry.boundingSphere, boundingSpheres[index]);
      assert.ok([...mesh.geometry.attributes.normal.array].every(Number.isFinite));
      assert.ok(mesh.geometry.boundingBox.min.toArray().every(Number.isFinite));
      assert.ok(mesh.geometry.boundingBox.max.toArray().every(Number.isFinite));
      assert.ok(Number.isFinite(mesh.geometry.boundingSphere.radius));
    });
  }
  assert.notDeepEqual([...positionArrays[0]], unbittenVertices[0]);

  burger.setBiteAmount(0);
  assert.equal(constructionCount, 64);
  positionArrays.forEach((array, index) => {
    assert.deepEqual([...array], unbittenVertices[index], `sauce ${index} restores exactly`);
  });
  meshes.forEach((mesh, index) => {
    assert.equal(mesh.geometry, geometries[index]);
    assert.equal(mesh.parent, parents[index]);
    assert.ok(parents[index].children.includes(mesh), "the returned Mesh stays mounted");
  });
  burger.dispose();
  assert.equal(disposed.length, 64);
  assert.equal(new Set(disposed).size, 64, "each persistent sauce geometry disposes once");
});

test("returns detached composition snapshots that cannot mutate live model state", () => {
  const burger = createBurgerModel3D(THREE);
  burger.setLayerPose("tomato", {
    position: { x: 0.3, y: 2.1, z: -0.2 },
    rotation: { x: 0.1, y: 0.2, z: 0.3 },
  });
  burger.addSauceStroke({
    sauce: "sticky", layerId: "tomato", amount: 0.7, points: [[-0.2, 0], [0.2, 0]],
  });
  const first = burger.getSnapshot();
  first.layerOrder.reverse();
  first.layerPoses.tomato.x = 999;
  first.strokes[0].points[0][0] = 999;
  const second = burger.getSnapshot();

  assert.deepEqual(second.layerOrder, BURGER_LAYER_IDS);
  assert.equal(second.layerPoses.tomato.x, 0.3);
  assert.equal(second.strokes[0].points[0][0], -0.2);
  assert.equal(second.food, "burger");
  burger.dispose();
});

test("keeps the public layer registry stable and failed pose updates atomic", () => {
  const burger = createBurgerModel3D(THREE);
  const patty = burger.getLayer("patty");
  const before = {
    position: patty.position.toArray(),
    rotation: patty.rotation.toArray(),
  };

  assert.equal(typeof burger.layers.set, "undefined");
  assert.equal(typeof burger.layers.delete, "undefined");
  assert.throws(() => burger.setLayerPose("patty", {
    position: { x: 0.5, y: Number.NaN, z: 0.4 },
    rotation: { x: 0.1, y: 0.2, z: 0.3 },
  }), TypeError);
  assert.deepEqual(patty.position.toArray(), before.position);
  assert.deepEqual(patty.rotation.toArray(), before.rotation);
  assert.equal(burger.layers.get("patty"), patty);
  assert.deepEqual([...burger.layers.keys()], BURGER_LAYER_IDS);
  burger.dispose();
});

test("stays within a bounded mobile mesh and triangle budget at maximum sauce history", () => {
  const burger = createBurgerModel3D(THREE);
  for (let index = 0; index < 64; index += 1) {
    burger.addSauceStroke({
      sauce: SAUCE_KEYS[index % SAUCE_KEYS.length],
      layerId: BURGER_LAYER_IDS[index % BURGER_LAYER_IDS.length],
      amount: 1,
      points: Array.from({ length: 24 }, (_, pointIndex) => [
        -0.9 + pointIndex * (1.8 / 23),
        Math.sin(pointIndex) * 0.4,
      ]),
    });
  }
  const meshes = [];
  burger.root.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object);
  });
  const triangles = meshes.reduce((sum, { geometry }) => sum + triangleCount(geometry), 0);

  assert.ok(meshes.length <= 82, `expected <=82 drawables, received ${meshes.length}`);
  assert.ok(triangles <= 30000, `expected <=30000 triangles, received ${triangles}`);
  burger.dispose();
});

test("keeps 64 worst-case alternating lettuce strokes below the mobile triangle budget", () => {
  const burger = createBurgerModel3D(THREE);
  const alternatingDiameter = Array.from({ length: 24 }, (_, index) => [
    index % 2 === 0 ? -1 : 1,
    index % 4 < 2 ? 0.04 : -0.04,
  ]);
  let representativeStroke;
  for (let index = 0; index < 64; index += 1) {
    representativeStroke = burger.addSauceStroke({
      sauce: SAUCE_KEYS[index % SAUCE_KEYS.length],
      layerId: "lettuce",
      amount: 1,
      points: alternatingDiameter,
    });
  }
  const meshes = [];
  burger.root.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object);
  });
  const triangles = meshes.reduce((sum, { geometry }) => sum + triangleCount(geometry), 0);

  assert.equal(burger.getSnapshot().strokes.length, 64);
  assert.ok(triangles < 30000, `worst-case burger must stay below 30000, received ${triangles}`);

  const geometry = representativeStroke.geometry;
  const tubularSegments = geometry.userData.sauceSegments;
  const crossSectionPoints = geometry.userData.sauceCrossSectionPoints;
  const positions = geometry.attributes.position;
  const ringCenters = [];
  for (let ring = 0; ring <= tubularSegments; ring += 1) {
    const center = new THREE.Vector3();
    for (let radial = 0; radial < crossSectionPoints; radial += 1) {
      const vertex = ring * crossSectionPoints + radial;
      center.x += positions.getX(vertex);
      center.y += positions.getY(vertex);
      center.z += positions.getZ(vertex);
    }
    ringCenters.push(center.multiplyScalar(1 / crossSectionPoints));
  }
  const raycaster = new THREE.Raycaster();
  const lettuce = burger.getLayer("lettuce").userData.selectableSurface;
  for (let index = 1; index < ringCenters.length; index += 1) {
    const midpoint = ringCenters[index - 1].clone().lerp(ringCenters[index], 0.5);
    raycaster.set(new THREE.Vector3(midpoint.x, 3, midpoint.z), new THREE.Vector3(0, -1, 0));
    assert.ok(
      raycaster.intersectObject(lettuce, false)[0],
      `rendered sauce segment ${index} does not chord across the lettuce hole`,
    );
  }
  assertSurfaceRibbonClearance(representativeStroke);
  burger.dispose();
});

test("deduplicates static resources, disposes all resources once, and is idempotent", () => {
  const createdResources = [];
  const instrument = (Base) => class extends Base {
    constructor(...args) {
      super(...args);
      this.disposeCount = 0;
      const originalDispose = this.dispose.bind(this);
      this.dispose = () => {
        this.disposeCount += 1;
        originalDispose();
      };
      createdResources.push(this);
    }
  };
  const instrumentedThree = {
    ...THREE,
    BufferGeometry: instrument(THREE.BufferGeometry),
    CapsuleGeometry: instrument(THREE.CapsuleGeometry),
    CylinderGeometry: instrument(THREE.CylinderGeometry),
    LatheGeometry: instrument(THREE.LatheGeometry),
    TubeGeometry: instrument(THREE.TubeGeometry),
    MeshPhysicalMaterial: instrument(THREE.MeshPhysicalMaterial),
    MeshStandardMaterial: instrument(THREE.MeshStandardMaterial),
  };
  const burger = createBurgerModel3D(instrumentedThree);
  const scene = new THREE.Scene();
  scene.add(burger.root);
  burger.addSauceStroke({
    sauce: "sour", layerId: "pickle", amount: 0.5, points: [[-0.4, 0], [0.4, 0]],
  });
  const bunMaterial = burger.getLayer("bottom-bun").userData.selectableSurface.material;
  assert.equal(bunMaterial, burger.getLayer("top-bun").userData.selectableSurface.material);

  burger.dispose();
  burger.dispose();
  assert.equal(burger.root.parent, null);
  assert.ok(createdResources.length > 0);
  assert.ok(createdResources.every(({ disposeCount }) => disposeCount === 1));
  assert.throws(() => burger.setExpanded(true), /disposed/i);
});

test("reuses the held ingredient geometry as a close-fitting translucent non-raycast shell", () => {
  const burger = createBurgerModel3D(THREE);
  assert.equal(burger.selectionFeedback.visible, false);
  assert.equal(burger.selectionFeedback.userData.kind, "selection-shell");
  assert.equal(burger.setLayerHighlighted("patty", true), true);
  assert.equal(burger.selectionFeedback.visible, true);
  assert.equal(burger.selectionFeedback.parent, burger.getLayer("patty"));
  assert.ok(burger.selectionFeedback.children.length >= 1);
  for (const child of burger.selectionFeedback.children) {
    assert.equal(child.geometry, burger.getLayer("patty").userData.selectableSurface.geometry);
    assert.equal(child.material.transparent, true);
    assert.equal(child.material.depthWrite, false);
    assert.notEqual(child.raycast, THREE.Mesh.prototype.raycast);
  }
  burger.setLayerHighlighted("cheese", true);
  for (const child of burger.selectionFeedback.children) {
    assert.equal(child.geometry, burger.getLayer("cheese").userData.selectableSurface.geometry);
  }
  burger.setLayerHighlighted("patty", false);
  assert.equal(burger.selectionFeedback.visible, false);
  burger.dispose();
});

test("previews the exact ingredient shape at a translucent target-layer pose", () => {
  const burger = createBurgerModel3D(THREE);
  assert.equal(burger.dropPreview.visible, false);
  const position = new THREE.Vector3(0.2, 1.7, -0.15);
  const scale = new THREE.Vector3(0.72, 0.72, 0.72);

  assert.equal(burger.setLayerDropPreview("cheese", {
    position,
    scale,
    yaw: 0.45,
    targetIndex: 2,
  }), true);
  assert.equal(burger.dropPreview.visible, true);
  assert.equal(burger.dropPreview.parent, burger.root);
  assert.deepEqual(burger.dropPreview.position.toArray(), position.toArray());
  assert.deepEqual(burger.dropPreview.scale.toArray(), scale.toArray());
  assert.equal(burger.dropPreview.rotation.y, 0.45);
  assert.equal(burger.dropPreview.userData.layerId, "cheese");
  assert.equal(burger.dropPreview.userData.targetIndex, 2);
  assert.ok(burger.dropPreview.children.length >= 1);
  for (const child of burger.dropPreview.children) {
    assert.equal(child.geometry, burger.getLayer("cheese").userData.selectableSurface.geometry);
    assert.equal(child.material.transparent, true);
    assert.ok(child.material.opacity > 0 && child.material.opacity < 0.5);
    assert.equal(child.material.depthWrite, false);
    assert.notEqual(child.raycast, THREE.Mesh.prototype.raycast);
  }

  burger.clearLayerDropPreview();
  assert.equal(burger.dropPreview.visible, false);
  assert.equal(Object.hasOwn(burger.dropPreview.userData, "layerId"), false);
  assert.equal(Object.hasOwn(burger.dropPreview.userData, "targetIndex"), false);
  assert.throws(() => burger.setLayerDropPreview("cheese", {
    position,
    scale,
    yaw: 0,
    targetIndex: -1,
  }), TypeError);
  burger.dispose();
});
