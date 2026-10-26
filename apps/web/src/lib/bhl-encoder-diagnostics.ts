/**
 * Read-only diagnostics for the 22 BHL reference joints.
 *
 * Contract reality 2026-10-26: Console's physical UnboundAdapter returns
 * motors: []; a declared MotorTelemetry.joint name is NOT a verified
 * encoder→joint identity, zero, gear ratio or URDF motion reference.
 * Values may be shown as unverified diagnostics only; NEVER drive FK.
 */
import type { MotorTelemetry, TelemetrySnapshot } from './contracts';
import { BHL_V1_ACTUATED_IDS } from './bhl-v1-reference.ts';

export const BHL_ENCODER_DISPLAY_STALE_MS = 1500;
export type EncoderDiagnosticStatus = 'NO_SOURCE' | 'STALE' | 'INVALID' | 'OBSERVED_UNVERIFIED_MAPPING' | 'AMBIGUOUS';
export interface JointEncoderDiagnostic {
  jointId: string;
  status: EncoderDiagnosticStatus;
  motorId: string | null;
  angleRad: number | null;
  sourceId: string | null;
  measuredAt: string | null;
  /** Always false until a separate mapping/zero/absolute-position contract is verified. */
  validForKinematicPose: false;
}
export interface EncoderDiagnostics {
  expected: number;
  reportedPhysical: number;
  observedReadOnly: number;
  validForKinematicPose: 0;
  rows: JointEncoderDiagnostic[];
  telemetryConnected: boolean;
}

function fresh(when: string | null | undefined, nowMs: number, maxAgeMs: number): boolean {
  if (!when) return false;
  const t=Date.parse(when);
  return Number.isFinite(t) && nowMs-t>=-1500 && nowMs-t<=maxAgeMs;
}

function isObservedPosition(m: MotorTelemetry, nowMs: number): boolean {
  const p=m.position;
  return typeof m.id === 'string' && m.id.length>0 &&
    m.state !== 'simulated' &&
    p?.quality==='observed' && p.source_kind==='physical' &&
    typeof p.source_id==='string' && p.source_id.trim().length>0 &&
    p.unit==='rad' && typeof p.value==='number' && Number.isFinite(p.value) &&
    Math.abs(p.value) <= Math.PI*256 &&
    fresh(m.measured_at,nowMs,BHL_ENCODER_DISPLAY_STALE_MS) &&
    fresh(p.measured_at,nowMs,BHL_ENCODER_DISPLAY_STALE_MS);
}

/**
 * Does NOT accept synthetic/unbound snapshots as actual motor readings.
 * Multiple motors claiming the same joint are AMBIGUOUS and never accepted.
 * A valid diagnostic still cannot actuate or animate a joint without proof of
 * absolute output encoder, motor ratio/direction and verified zero transform.
 */
export function describeBhlEncoderDiagnostics(
  snapshot: TelemetrySnapshot | null, robotId: string | null,
  webSocketLive: boolean, nowMs: number,
): EncoderDiagnostics {
  const connected=Boolean(
    snapshot && robotId==='paky-01' && snapshot.robot_id===robotId &&
    snapshot.schema_version==='console.v1' &&
    snapshot.source_kind==='physical' && snapshot.connection_state==='connected' &&
    webSocketLive && Number.isFinite(nowMs) &&
    fresh(snapshot.received_at,nowMs,3000)
  );
  const motors = connected && snapshot && Array.isArray(snapshot.motors)
    ? snapshot.motors : [];
  const reported = new Map<string,MotorTelemetry[]>();
  const known=new Set(BHL_V1_ACTUATED_IDS);
  for(const motor of motors){
    if(!motor || typeof motor.joint!=='string' || !known.has(motor.joint))continue;
    const list=reported.get(motor.joint)??[];
    list.push(motor);
    reported.set(motor.joint,list);
  }
  let observed=0;
  const rows=BHL_V1_ACTUATED_IDS.map(jointId=>{
    const matches=reported.get(jointId)??[];
    const row: JointEncoderDiagnostic={
      jointId,status:'NO_SOURCE',motorId:null,angleRad:null,sourceId:null,
      measuredAt:null,validForKinematicPose:false,
    };
    if(matches.length>1){row.status='AMBIGUOUS';return row;}
    if(matches.length===0)return row;
    const motor=matches[0];
    row.motorId=motor.id;
    row.sourceId=motor.position?.source_id??null;
    row.measuredAt=motor.position?.measured_at??null;
    if(!connected)return row;
    if(motor.position?.quality==='simulated' || motor.position?.source_kind!=='physical' ||
       motor.position?.unit!=='rad' || !Number.isFinite(motor.position?.value) ||
       typeof motor.position?.value!=='number') {
      row.status='INVALID';return row;
    }
    if(!fresh(motor.position.measured_at,nowMs,BHL_ENCODER_DISPLAY_STALE_MS) ||
       !fresh(motor.measured_at,nowMs,BHL_ENCODER_DISPLAY_STALE_MS)) {
      row.status='STALE';return row;
    }
    if(!isObservedPosition(motor,nowMs)){row.status='INVALID';return row;}
    row.status='OBSERVED_UNVERIFIED_MAPPING';
    row.angleRad=motor.position.value;
    observed++;
    return row;
  });
  return {
    expected:BHL_V1_ACTUATED_IDS.length,
    reportedPhysical:motors.length,
    observedReadOnly:observed,
    validForKinematicPose:0,
    rows,telemetryConnected:connected
  };
}
