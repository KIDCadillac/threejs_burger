const clamp01 = (value) => Math.min(1, Math.max(0, value));

const IMPACT_PROFILES = Object.freeze({
  "bottom-bun": Object.freeze({ colors: Object.freeze([0xffd36b, 0xfff1b2]), count: 10 }),
  "top-bun": Object.freeze({ colors: Object.freeze([0xffc34f, 0xffed9a]), count: 12 }),
  patty: Object.freeze({ colors: Object.freeze([0xb94b31, 0xf39a45]), count: 11 }),
  pickle: Object.freeze({ colors: Object.freeze([0x75a83a, 0xd7d95b]), count: 8 }),
  onion: Object.freeze({ colors: Object.freeze([0xf2ead2, 0xd7a7c9]), count: 8 }),
  default: Object.freeze({ colors: Object.freeze([0xffc760, 0xfff0b5]), count: 9 }),
});

export function getCookingImpactProfile(ingredientId) {
  return IMPACT_PROFILES[ingredientId] ?? IMPACT_PROFILES.default;
}

export function sampleCookingImpactParticle({
  index,
  elapsedMs,
  strength = 1,
} = {}) {
  if (!Number.isInteger(index) || index < 0) throw new TypeError("index must be a non-negative integer");
  if (!Number.isFinite(elapsedMs)) throw new TypeError("elapsedMs must be finite");
  if (!Number.isFinite(strength) || strength <= 0) {
    throw new TypeError("strength must be a positive finite number");
  }

  const progress = clamp01(elapsedMs / 430);
  const angle = index * 2.399963229728653;
  const lane = 0.65 + (index % 4) * 0.15;
  const lift = (0.46 + (index % 3) * 0.13) * strength;
  // Give the burst a small radial footprint on the contact frame so the food
  // reads as an impact instead of one bright clump, then continue the flight.
  const outward = lane * strength * (0.26 + progress * 0.74);
  const flight = Math.sin(Math.PI * progress);
  const scale = (0.72 + (index % 3) * 0.16) * (1 - progress) ** 0.62;

  return Object.freeze({
    progress,
    x: Math.cos(angle) * outward,
    y: 0.025 + lift * flight - 0.055 * progress,
    z: Math.sin(angle) * outward * 0.7,
    rotation: angle + progress * (4.2 + (index % 2) * 1.4),
    scale,
    opacity: (1 - progress) ** 1.35,
    done: progress >= 1,
  });
}

export function createCookingImpactFeedback(THREE, {
  parent,
  reducedMotion = false,
} = {}) {
  if (!THREE?.Group || !THREE?.Mesh || !THREE?.MeshBasicMaterial) {
    throw new TypeError("A compatible Three.js namespace is required");
  }
  if (!parent?.isObject3D) throw new TypeError("parent must be a Three.js Object3D");

  const root = new THREE.Group();
  root.name = "cooking-impact-feedback";
  root.userData.textureFree = true;
  root.renderOrder = 12;
  parent.add(root);

  const dropletGeometry = new THREE.SphereGeometry(0.105, 7, 5);
  const sparkleGeometry = new THREE.TetrahedronGeometry(0.135, 0);
  const particleCount = 12;
  const particles = Array.from({ length: particleCount }, (_, index) => {
    const material = new THREE.MeshBasicMaterial({
      color: 0xffd36b,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(index % 3 === 0 ? sparkleGeometry : dropletGeometry, material);
    mesh.name = `impact-particle-${index + 1}`;
    mesh.visible = false;
    mesh.raycast = () => null;
    mesh.renderOrder = 12;
    root.add(mesh);
    return mesh;
  });

  let active = null;
  let lastBurst = null;

  const hide = () => {
    for (const particle of particles) {
      particle.visible = false;
      particle.material.opacity = 0;
    }
    active = null;
  };

  const burst = ({ position, ingredientId, strength = 1, startedAt = 0 } = {}) => {
    if (reducedMotion) return false;
    if (!position || ![position.x, position.y, position.z].every(Number.isFinite)) {
      throw new TypeError("position must contain finite x, y, and z values");
    }
    if (!Number.isFinite(strength) || strength <= 0) {
      throw new TypeError("strength must be a positive finite number");
    }
    if (!Number.isFinite(startedAt)) throw new TypeError("startedAt must be finite");

    const profile = getCookingImpactProfile(ingredientId);
    const normalizedStrength = Math.min(1.25, Math.max(0.35, strength));
    active = {
      position: new THREE.Vector3(position.x, position.y, position.z),
      ingredientId,
      strength: normalizedStrength,
      startedAt,
      count: profile.count,
      colors: profile.colors,
    };
    lastBurst = Object.freeze({
      ingredientId,
      strength: normalizedStrength,
      startedAt,
      count: profile.count,
    });
    tick(startedAt);
    return true;
  };

  function tick(now = 0) {
    if (!active) return false;
    const elapsedMs = Math.max(0, now - active.startedAt);
    let visibleCount = 0;
    for (let index = 0; index < particles.length; index += 1) {
      const particle = particles[index];
      if (index >= active.count) {
        particle.visible = false;
        continue;
      }
      const frame = sampleCookingImpactParticle({
        index,
        elapsedMs,
        strength: active.strength,
      });
      if (frame.done) {
        particle.visible = false;
        continue;
      }
      particle.visible = true;
      particle.position.set(
        active.position.x + frame.x,
        active.position.y + frame.y,
        active.position.z + frame.z,
      );
      particle.rotation.set(frame.rotation * 0.35, frame.rotation, frame.rotation * 0.6);
      particle.scale.setScalar(frame.scale);
      particle.material.color.setHex(active.colors[index % active.colors.length]);
      particle.material.opacity = frame.opacity;
      visibleCount += 1;
    }
    if (!visibleCount && elapsedMs >= 430) hide();
    return visibleCount > 0;
  }

  return {
    root,
    burst,
    tick,
    hide,
    getDebugState: () => Object.freeze({
      active: Boolean(active),
      visibleCount: particles.filter((particle) => particle.visible).length,
      lastBurst,
    }),
    dispose() {
      hide();
      root.removeFromParent();
      dropletGeometry.dispose();
      sparkleGeometry.dispose();
      particles.forEach((particle) => particle.material.dispose());
    },
  };
}
