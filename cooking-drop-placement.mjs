const finite = (value, fallback = 0) => (
  Number.isFinite(Number(value)) ? Number(value) : fallback
);

const normalizeAngle = (value) => Math.atan2(Math.sin(value), Math.cos(value));

export function resolveCookingDropPlacement(releasePose, {
  deadzone = 0.11,
  retention = 0.42,
  maxOffset = 0.76,
} = {}) {
  const rawX = finite(releasePose?.position?.x);
  const rawZ = finite(releasePose?.position?.z);
  const distance = Math.hypot(rawX, rawZ);
  const safeDeadzone = Math.max(0, finite(deadzone, 0.11));
  const safeRetention = Math.max(0, finite(retention, 0.42));
  const safeMaxOffset = Math.max(0, finite(maxOffset, 0.76));
  const retained = distance <= safeDeadzone
    ? 0
    : Math.min(safeMaxOffset, (distance - safeDeadzone) * safeRetention);
  const scale = distance > 0 ? retained / distance : 0;

  return Object.freeze({
    offset: Object.freeze(retained === 0
      ? { x: 0, z: 0 }
      : { x: rawX * scale, z: rawZ * scale }),
    yaw: normalizeAngle(finite(releasePose?.rotation?.y)),
  });
}
