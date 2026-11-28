/** Passive diagnostics from the existing stream; NEVER kinematics inputs. */
import type { ImportedModel, MotorTelemetry, TelemetrySnapshot } from './contracts';
export type EncoderState='NO_SOURCE'|'STALE'|'INVALID'|'AMBIGUOUS'|'OBSERVED_UNVERIFIED_MAPPING';
export interface EncoderRow {jointId:string;status:EncoderState;angleRad:number|null;validForKinematicPose:false;}
const fresh=(when:unknown,now:number,limit:number)=>{
  if(typeof when!=='string'||!Number.isFinite(now))return false;
  const age=now-Date.parse(when);return Number.isFinite(age)&&age>=-1500&&age<=limit;
};
export function bodyEncoderDiagnostics(model:Pick<ImportedModel,'joints'>|null,snapshot:TelemetrySnapshot|null,
  robotId:string|null,physicalRobot:boolean,connected:boolean,now:number){
  // Angular joint declarations, not installed motor inventory.
  const all=Array.isArray(model?.joints)?model.joints:[];
  const eligible=all.filter(j=>j&&typeof j.id==='string'&&j.id.length>0&&typeof j.joint_type==='string'&&
    ['REVOLUTE','CONTINUOUS'].includes(j.joint_type.toUpperCase()));
  const unique=new Set(eligible.map(j=>j.id));
  if(eligible.length!==unique.size||eligible.length>512)return {rows:[] as EncoderRow[],expected:0,observedReadOnly:0,validForKinematicPose:0 as const,telemetryConnected:false};
  const telemetryConnected=Boolean(physicalRobot&&connected&&robotId&&snapshot?.robot_id===robotId&&snapshot.schema_version==='console.v1'&&
    snapshot.source_kind==='physical'&&snapshot.connection_state==='connected'&&fresh(snapshot.received_at,now,3000)&&
    Array.isArray(snapshot.motors)&&snapshot.motors.length<=2048);
  const motors=telemetryConnected?snapshot!.motors:[];
  const claims=new Map<string,MotorTelemetry[]>(),motorCounts=new Map<string,number>();
  for(const motor of motors){
    if(!motor||typeof motor.id!=='string'||!motor.id.trim())continue;
    motorCounts.set(motor.id,(motorCounts.get(motor.id)??0)+1);
    if(typeof motor.joint!=='string'||!unique.has(motor.joint))continue;
    const list=claims.get(motor.joint)??[];list.push(motor);claims.set(motor.joint,list);
  }
  const rows:EncoderRow[]=eligible.map(j=>{
    const matches=claims.get(j.id)??[],row:EncoderRow={jointId:j.id,status:'NO_SOURCE',angleRad:null,validForKinematicPose:false};
    if(!matches.length)return row;
    const motor=matches[0],p=motor.position;
    if(matches.length!==1||(motorCounts.get(motor.id)??0)!==1){row.status='AMBIGUOUS';return row;}
    if(motor.state==='simulated'||p?.source_kind!=='physical'||p.quality!=='observed'||p.unit!=='rad'||
      typeof p.value!=='number'||!Number.isFinite(p.value)||typeof p.source_id!=='string'||!p.source_id.trim()){
      row.status='INVALID';return row;
    }
    if(!fresh(motor.measured_at,now,1500)||!fresh(p.measured_at,now,1500)){row.status='STALE';return row;}
    row.status='OBSERVED_UNVERIFIED_MAPPING';row.angleRad=p.value;return row;
  });
  return {rows,expected:rows.length,observedReadOnly:rows.filter(r=>r.status==='OBSERVED_UNVERIFIED_MAPPING').length,
    validForKinematicPose:0 as const,telemetryConnected};
}
