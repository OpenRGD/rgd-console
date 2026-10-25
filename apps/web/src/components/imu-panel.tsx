/** Generic read-only IMU observation panel. Never implies robot body alignment. */
'use client';
import type { CSSProperties } from 'react';
import type { ImuObservation } from '@/lib/contracts';

function degrees(value: number): string { return `${value.toFixed(2)}°`; }
function norm(values: [number, number, number]): number {
  return Math.hypot(values[0], values[1], values[2]);
}

export function ImuPanel({ imu, connected, now, compact = false }:
  { imu: ImuObservation | null; connected: boolean; now: number; compact?: boolean }) {
  const age = imu ? now - Date.parse(imu.console_received_at) : Number.POSITIVE_INFINITY;
  const current = Boolean(imu && connected && Number.isFinite(age) && age >= -1500 && age <= 3000);
  const attitude = current ? imu!.orientation_euler_deg : null;
  const axes = current ? imu!.angular_velocity_rad_s : null;
  const accel = current ? imu!.acceleration_m_s2 : null;
  const posture: CSSProperties = attitude ? {
    transform: `rotateZ(${attitude[2]}deg) rotateY(${attitude[0]}deg) rotateX(${attitude[1]}deg)`,
  } : {};
  return <section className={`imu-panel ${compact ? 'imu-compact' : ''}`} aria-label="Telemetria IMU non calibrata">
    <div className="imu-topline"><strong>IMU · ASSETTO SENSORIALE</strong><span className={current ? 'imu-online' : 'imu-offline'}>
      {current ? 'DATO FISICO LIVE' : 'NON DISPONIBILE / STALE'}
    </span></div>
    {current ? <>
      <div className="imu-data-row">
        <div className="imu-cube-viewport" aria-hidden="true"><div className="imu-cube" style={posture}><span>X</span><span>Y</span><span>Z</span></div></div>
        <dl className="imu-axis-grid">
          <div><dt>ROLL</dt><dd>{degrees(attitude![0])}</dd></div>
          <div><dt>PITCH</dt><dd>{degrees(attitude![1])}</dd></div>
          <div><dt>YAW*</dt><dd>{degrees(attitude![2])}</dd></div>
        </dl>
      </div>
      {!compact && <div className="imu-motion-grid">
        <span>‖ω‖ {norm(axes!).toFixed(3)} rad/s</span>
        <span>‖a‖ {(norm(accel!) / 9.80665).toFixed(3)} g</span>
        <span>{imu!.motion_hint === 'rotation_observed' ? 'Rotazione osservata' : 'Velocità angolare bassa'}</span>
      </div>}
      <small className="imu-evidence">{imu!.sensor_id} · frame: {imu!.sensor_frame_id} · campione {imu!.sequence}</small>
    </> : <p className="imu-muted">Nessuna IMU fisica attuale per il robot selezionato. Non viene generata telemetria simulata.</p>}
    <p className="imu-disclaimer">*Assi del sensore non allineati al torso · yaw assoluto non calibrato · non valido per decisioni motrici.</p>
  </section>;
}
