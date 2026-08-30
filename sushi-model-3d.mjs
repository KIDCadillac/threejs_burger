export const SUSHI_MODEL_INGREDIENTS = Object.freeze(["rice-bed", "salmon-slice"]);

export const SUSHI_ASSEMBLY_POSES = Object.freeze({
  "rice-bed": Object.freeze({ x: 0, y: 0.43, z: 0.72 }),
  "salmon-slice": Object.freeze({ x: 0, y: 0.88, z: 0.71 }),
});

function textureFreeMaterial(THREE, color, roughness = 0.84) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0,
  });
  material.userData = { textureFree: true, food: "sushi" };
  return material;
}

function noRaycast() {}

function outlinedSurface(THREE, geometry, material, name, outlineScale = 1.045) {
  const group = new THREE.Group();
  const outline = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color: 0x203a32, side: THREE.BackSide }),
  );
  outline.name = `${name}:outline`;
  outline.scale.setScalar(outlineScale);
  outline.raycast = noRaycast;
  const surface = new THREE.Mesh(geometry, material);
  surface.name = name;
  surface.castShadow = true;
  surface.receiveShadow = true;
  group.add(outline, surface);
  return { group, surface };
}

function createRice(THREE) {
  const root = new THREE.Group();
  root.name = "sushi-ingredient:rice-bed";
  const riceMaterial = textureFreeMaterial(THREE, 0xfff0c7, 0.94);
  const geometry = new THREE.SphereGeometry(1, 30, 18);
  const positions = geometry.attributes.position;
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    const wobble = 1
      + Math.sin(x * 8.3 + z * 5.7) * 0.018
      + Math.cos(y * 9.1 - x * 3.2) * 0.014;
    positions.setXYZ(index, x * wobble, y * wobble, z * wobble);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  const { group, surface } = outlinedSurface(
    THREE,
    geometry,
    riceMaterial,
    "sushi-ingredient:rice-bed:surface",
    1.035,
  );
  group.position.y = 0.2;
  group.scale.set(1.05, 0.38, 0.66);
  root.add(group);

  const grainGeometry = new THREE.CapsuleGeometry(0.024, 0.07, 2, 5);
  const grainMaterial = textureFreeMaterial(THREE, 0xfff8dc, 0.96);
  const grainCount = 48;
  const grains = new THREE.InstancedMesh(grainGeometry, grainMaterial, grainCount);
  grains.name = "sushi-rice-grains";
  grains.raycast = noRaycast;
  const dummy = new THREE.Object3D();
  for (let index = 0; index < grainCount; index += 1) {
    const ring = Math.floor(index / 12);
    const column = index % 12;
    const phi = 0.28 + ring * 0.31;
    const theta = column / 12 * Math.PI * 2 + ring * 0.18;
    dummy.position.set(
      Math.sin(phi) * Math.cos(theta) * 1.06,
      0.2 + Math.cos(phi) * 0.39,
      Math.sin(phi) * Math.sin(theta) * 0.67,
    );
    dummy.rotation.set(
      Math.PI / 2 + Math.sin(theta) * 0.28,
      theta + Math.PI / 2,
      index % 2 ? 0.22 : -0.18,
    );
    dummy.scale.setScalar(0.9 + (index % 4) * 0.045);
    dummy.updateMatrix();
    grains.setMatrixAt(index, dummy.matrix);
  }
  grains.instanceMatrix.needsUpdate = true;
  root.add(grains);
  root.userData.selectableSurface = surface;
  return root;
}

function createSalmon(THREE) {
  const root = new THREE.Group();
  root.name = "sushi-ingredient:salmon-slice";
  const salmonMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xf06c4f,
    roughness: 0.48,
    metalness: 0,
    clearcoat: 0.24,
    clearcoatRoughness: 0.56,
  });
  salmonMaterial.userData = { textureFree: true, food: "sushi" };
  const salmonShape = new THREE.Shape();
  salmonShape.moveTo(-1.02, -0.35);
  salmonShape.quadraticCurveTo(-1.16, -0.02, -0.98, 0.4);
  salmonShape.quadraticCurveTo(-0.22, 0.5, 0.84, 0.42);
  salmonShape.quadraticCurveTo(1.1, 0.1, 0.91, -0.38);
  salmonShape.quadraticCurveTo(0.05, -0.48, -1.02, -0.35);
  const geometry = new THREE.ExtrudeGeometry(salmonShape, {
    depth: 0.24,
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: 0.08,
    bevelThickness: 0.055,
    curveSegments: 18,
  });
  geometry.center();
  geometry.rotateX(-Math.PI / 2);
  const { group, surface } = outlinedSurface(
    THREE,
    geometry,
    salmonMaterial,
    "sushi-ingredient:salmon-slice:surface",
    1.04,
  );
  root.add(group);

  const stripeMaterial = textureFreeMaterial(THREE, 0xffd0a8, 0.62);
  [-0.68, -0.34, 0, 0.34, 0.68].forEach((x, index) => {
    const curve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(x - 0.1, 0.16, -0.32),
      new THREE.Vector3(x + 0.16, 0.19, -0.12),
      new THREE.Vector3(x - 0.14, 0.17, 0.12),
      new THREE.Vector3(x + 0.1, 0.15, 0.33),
    );
    const stripe = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 14, 0.022, 6, false),
      stripeMaterial,
    );
    stripe.name = `sushi-salmon-fat-line:${index + 1}`;
    stripe.raycast = noRaycast;
    root.add(stripe);
  });
  root.userData.selectableSurface = surface;
  return root;
}

function disposeRoot(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const list = Array.isArray(object.material) ? object.material : [object.material];
    list.forEach((material) => material && materials.add(material));
  });
  root.removeFromParent();
  geometries.forEach((geometry) => geometry.dispose?.());
  materials.forEach((material) => material.dispose?.());
}

export function createSushiIngredient3D(THREE, ingredientId) {
  if (!THREE?.Group || !SUSHI_MODEL_INGREDIENTS.includes(ingredientId)) {
    throw new TypeError(`Unknown sushi ingredient: ${String(ingredientId)}`);
  }
  const root = ingredientId === "rice-bed" ? createRice(THREE) : createSalmon(THREE);
  const surface = root.userData.selectableSurface;
  root.userData.sushiIngredientId = ingredientId;
  root.userData.foodLayer = Object.freeze({
    food: "sushi",
    layerId: ingredientId,
    ingredientId,
  });
  surface.userData.cookingSelectable = Object.freeze({
    kind: "food-layer",
    food: "sushi",
    layerId: ingredientId,
    ingredientId,
  });
  return Object.freeze({
    ingredientId,
    root,
    surface,
    dispose() {
      disposeRoot(root);
    },
  });
}

export function createSushiNigiriModel3D(THREE) {
  const root = new THREE.Group();
  root.name = "food:sushi:salmon-nigiri";
  root.userData.foodModel = Object.freeze({ food: "sushi", version: 1 });
  const ingredients = SUSHI_MODEL_INGREDIENTS.map((ingredientId) => (
    createSushiIngredient3D(THREE, ingredientId)
  ));
  ingredients.forEach((ingredient) => {
    const pose = SUSHI_ASSEMBLY_POSES[ingredient.ingredientId];
    ingredient.root.position.set(pose.x, pose.y, pose.z);
    root.add(ingredient.root);
  });
  return Object.freeze({
    root,
    ingredients: Object.freeze(ingredients),
    dispose() {
      ingredients.forEach((ingredient) => ingredient.dispose());
      root.removeFromParent();
    },
  });
}
