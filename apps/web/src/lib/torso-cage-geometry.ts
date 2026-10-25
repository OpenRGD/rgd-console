/** Paky-01 cage preview contract: operator-reported geometry, NOT a canonical RGD/URDF body. */
import type { ImuObservation } from './contracts';

export const CAGE_PREVIEW_ROBOT_ID = 'paky-01';
export const CAGE_IMU_SENSOR_ID = 'torso-imu-01';
export const CAGE_IMU_SOURCE_ID = 'paky01-wit-serial';
export const CAGE_IMU_FRAME_ID = 'paky01_imu_sensor_unverified';
export const CAGE_PREVIEW_STALE_AFTER_MS = 3000;
export const CAGE_PREVIEW_FUTURE_TOLERANCE_MS = 1500;
export const CAGE_PREVIEW_TILT_LIMIT_DEG = 35;

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
}

export interface RelativeCagePose {
  rollDeg: number;
  pitchDeg: number;
  // Three.js axes: X width, Y up, Z front for a SCHEMATIC display only.
  // +sensor roll -> cage leans to its nominal right (+X).
  // +sensor pitch -> cage leans to its nominal front (+Z).
  rotationXRad: number;
  rotationZRad: number;
  limited: boolean;
}

export function imuSourceKey(imu: ImuObservation): string {
  return [imu.robot_id, imu.sensor_id, imu.session_id].join(':');
}

/** Read-only physical source and receive-time gate; WS online alone is not sensor presence. */
export function isCurrentPakyImu(
  imu: ImuObservation | null,
  robotId: string | null,
  connected: boolean,
  nowMs: number,
): imu is ImuObservation {
  if (!imu || robotId !== CAGE_PREVIEW_ROBOT_ID || !connected || !Number.isFinite(nowMs)) return false;
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
 * Never uses uncalibrated yaw or mutates device/body calibration.
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
    rotationZRad: -roll * radians,
    limited: roll !== rawRoll || pitch !== rawPitch,
  };
}
