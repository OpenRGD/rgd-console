/** Paky-01 cage preview contract: operator-reported geometry, NOT a canonical RGD/URDF body. */
import type { ImuObservation } from './contracts';

export const CAGE_PREVIEW_ROBOT_ID = 'paky-01';
export const CAGE_IMU_SENSOR_ID = 'torso-imu-01';
export const CAGE_IMU_SOURCE_ID = 'paky01-wit-serial';
export const CAGE_IMU_FRAME_ID = 'paky01_imu_sensor_unverified';
export const CAGE_PREVIEW_STALE_AFTER_MS = 3000;
export const CAGE_PREVIEW_FUTURE_TOLERANCE_MS = 1500;
export const CAGE_PREVIEW_TILT_LIMIT_DEG = 35;
// Only an operator-enabled SCHEMATIC yaw preview. NOT absolute heading.
export const CAGE_PREVIEW_YAW_LIMIT_DEG = 90;

/**
 * Metres, in the OPERATOR'S cage frame only:
 * X = left/right width; Y = height UP from the EXTERNAL lower edge; Z = depth.
 * This is NOT a measured sensor-to-torso transform nor BHL's canonical axes.
 */
export const PAKY01_CAGE = {
  provenance: 'OPERATOR_REPORTED_NOT_GEOMETRICALLY_VERIFIED',
  coreWidthM: 0.15,
  totalHeightM: 0.24,
  totalDepthM: 0.14,
  uprightLengthM: 0.20,
  profileThicknessM: 0.02,
  upperBarLengthM: 0.25,
  upperBarOverhangEachSideM: 0.05,
  imuHeightFromOuterLowerEdgeM: 0.11,
  imuExactX: null,
  imuExactZ: null,
  imuExtrinsicQuaternion: null,
} as const;

export interface VisualZero {
  sourceKey: string;
  rollDeg: number;
  pitchDeg: number;
  yawDeg: number;
}

export interface RelativeYawPreview {
  yawRelativeDeg: number;
  rotationYRad: number;
  limited: boolean;
}

export interface RelativeCagePose {
  rollDeg: number;
  pitchDeg: number;
  // Three.js viewer: X width, Y up, Z front; SCHEMATIC display only.
  // Browser/operator feedback 2026-10-26: the prior negative-Z mapping
  // visually inverted RIGHT/LEFT; flip SCENE roll direction only.
  // These are visualization axes, NOT calibrated body-frame extrinsics.
  // +sensor pitch -> schematic cage leans to its nominal front (+Z).
  rotationXRad: number;
  rotationZRad: number;
  limited: boolean;
}

export function imuSourceKey(imu: ImuObservation): string {
  return [imu.robot_id, imu.sensor_id, imu.session_id].join(':');
}

/** Trusted-shape check only; provenance is a Console claim, not hardware attestation. */
export function isPakyImuSource(imu: ImuObservation | null, robotId: string | null): imu is ImuObservation {
  if (!imu || robotId !== CAGE_PREVIEW_ROBOT_ID) return false;
  if (imu.robot_id !== robotId || imu.sensor_id !== CAGE_IMU_SENSOR_ID ||
      imu.source_id !== CAGE_IMU_SOURCE_ID || imu.sensor_frame_id !== CAGE_IMU_FRAME_ID ||
      imu.schema_version !== 'console.imu.v0.1-candidate' ||
      imu.source_kind !== 'physical' || imu.reference_frame !== 'imu_sensor_axes_unverified' ||
      imu.time_quality !== 'host_receive_only_not_chronograph' ||
      imu.calibration_revision !== null || imu.decision_eligible !== false ||
      imu.heading_calibrated !== false || imu.observation_only !== true ||
      typeof imu.session_id !== 'string' || !/^[0-9a-f]{32}$/i.test(imu.session_id) ||
      !Number.isSafeInteger(imu.sequence) || imu.sequence < 1) return false;
  if (![imu.orientation_euler_deg, imu.angular_velocity_rad_s, imu.acceleration_m_s2]
        .every(v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite))) return false;
  return Number.isFinite(Date.parse(imu.console_received_at));
}

/** WS connected does not mean the physical sensor is current. */
export function isCurrentPakyImu(
  imu: ImuObservation | null,
  robotId: string | null,
  connected: boolean,
  nowMs: number,
): imu is ImuObservation {
  if (!connected || !Number.isFinite(nowMs) || !isPakyImuSource(imu, robotId)) return false;
  const age = nowMs - Date.parse(imu.console_received_at);
  return Number.isFinite(age) && age >= -CAGE_PREVIEW_FUTURE_TOLERANCE_MS &&
    age <= CAGE_PREVIEW_STALE_AFTER_MS;
}

function shortestDeltaDegrees(current: number, reference: number): number {
  const delta = current - reference;
  return ((delta + 180) % 360 + 360) % 360 - 180;
}

function limit(degrees: number): number {
  return Math.max(-CAGE_PREVIEW_TILT_LIMIT_DEG, Math.min(CAGE_PREVIEW_TILT_LIMIT_DEG, degrees));
}

/**
 * Does not use yaw; it is handled separately by an explicit experimental
 * display-only toggle. Never mutates device/body calibration.
 * A first fresh sample or operator click establishes only a DISPLAY baseline.
 */
export function relativeCagePose(imu: ImuObservation, zero: VisualZero): RelativeCagePose {
  if (zero.sourceKey !== imuSourceKey(imu)) throw new Error('visual zero belongs to another session');
  const rawRoll = shortestDeltaDegrees(imu.orientation_euler_deg[0], zero.rollDeg);
  const rawPitch = shortestDeltaDegrees(imu.orientation_euler_deg[1], zero.pitchDeg);
  const roll = limit(rawRoll);
  const pitch = limit(rawPitch);
  const radians = Math.PI / 180;
  return {
    rollDeg: roll,
    pitchDeg: pitch,
    rotationXRad: pitch * radians,
    rotationZRad: roll * radians,
    limited: roll !== rawRoll || pitch !== rawPitch,
  };
}


/**
 * OPTIONAL, uncalibrated relative vendor-fusion yaw for visualization only.
 * The operator must explicitly enable this; by default the 3D scene uses Y=0.
 *
 * This is NOT north/world heading or a verified physical Z-axis sign.
 * The shortest wrapped delta works across ±180 degrees for small relative turns,
 * but can jump under magnetic interference, drift or turns exceeding 180°.
 * It never integrates gyro readings or invents acquisition timestamps.
 */
export function relativeYawPreview(imu: ImuObservation, zero: VisualZero): RelativeYawPreview {
  if (zero.sourceKey !== imuSourceKey(imu)) throw new Error('yaw visual zero belongs to another session');
  if (!Number.isFinite(zero.yawDeg) || !Number.isFinite(imu.orientation_euler_deg[2])) {
    throw new Error('invalid uncalibrated yaw');
  }
  const rawYaw = shortestDeltaDegrees(imu.orientation_euler_deg[2], zero.yawDeg);
  const yawRelativeDeg = Math.max(-CAGE_PREVIEW_YAW_LIMIT_DEG,
    Math.min(CAGE_PREVIEW_YAW_LIMIT_DEG, rawYaw));
  return {
    yawRelativeDeg,
    rotationYRad: yawRelativeDeg * (Math.PI / 180),
    limited: yawRelativeDeg !== rawYaw,
  };
}
