import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const src=p=>readFileSync(new URL('../'+p, import.meta.url),'utf8');
const referenceUrl=new URL('../apps/web/src/lib/bhl-v1-reference.ts',import.meta.url).href;
const fkUrl=new URL('../apps/web/src/lib/bhl-reference-kinematics.ts',import.meta.url).href;
const diagnosticUrl=new URL('../apps/web/src/lib/bhl-encoder-diagnostics.ts',import.meta.url).href;

function evaluateTypeScript(lines){
  const script=lines.join('\n');
  const cmd=spawnSync(process.execPath,
    ['--experimental-strip-types','--input-type=module','-e',script,
     referenceUrl,fkUrl,diagnosticUrl],
    {encoding:'utf8',timeout:12000});
  assert.equal(cmd.status,0,cmd.stderr || cmd.stdout);
}

test('BHL V1 exact reference identity: 26 joints, 22 actuated and 4 fixed, with valid neutral FK',()=>{
  evaluateTypeScript([
    "import assert from 'node:assert/strict';",
    "const ref=await import(process.argv[1]);",
    "const {bhlReferenceNeutralSkeleton}=await import(process.argv[2]);",
    "const source=ref.BHL_REFERENCE_SOURCE, joints=ref.BHL_V1_URDF_JOINTS;",
    "assert.equal(source.commit,'fc90fedd008b1e56a22e3c5221548d6b24f49707');",
    "assert.equal(source.urdfBlobSha,'13261c106eff81726e1d788d3ccf671a246a6fb3');",
    "assert.equal(source.headAndNeckGeometryVerified,false);",
    "assert.equal(joints.length,26);",
    "assert.equal(joints.filter(j=>j.type==='revolute').length,22);",
    "assert.equal(ref.BHL_V1_ACTUATED_IDS.length,22);",
    "assert.equal(new Set(joints.map(j=>j.child)).size,26);",
    "const fk=bhlReferenceNeutralSkeleton();",
    "assert.equal(fk.jointCount,22);",
    "assert.equal(fk.bones.length,22);",
    "assert.equal(fk.pivots.length,22);",
    "assert.equal(fk.terminals.length,4);",
    "assert.equal(fk.source,'BHL_V1_NEUTRAL_URDF_REFERENCE_UNVERIFIED');",
    "const left=fk.pivots.find(p=>p.id==='arm_left_shoulder_pitch_joint');",
    "const right=fk.pivots.find(p=>p.id==='arm_right_shoulder_pitch_joint');",
    "assert.ok(left.position[0]<0 && right.position[0]>0,'URDF y=left must map to viewer negative x');",
    "assert.ok(Math.abs(left.position[1]-right.position[1])<1e-6);",
    "const hip=fk.pivots.find(p=>p.id==='leg_left_hip_roll_joint');",
    "const ankle=fk.pivots.find(p=>p.id==='leg_left_ankle_roll_joint');",
    "assert.ok(ankle.position[1]<hip.position[1]);",
    "assert.ok(fk.pivots.every(p=>p.position.length===3&&p.position.every(Number.isFinite)));",
    "assert.ok(fk.bones.every(b=>b.start.every(Number.isFinite)&&b.end.every(Number.isFinite)));"
  ]);
});

test('Physical joint diagnostics require observed fresh rad values and never become calibrated FK',()=>{
  evaluateTypeScript([
    "import assert from 'node:assert/strict';",
    "const ref=await import(process.argv[1]);",
    "const {describeBhlEncoderDiagnostics}=await import(process.argv[3]);",
    "const now=Date.parse('2026-10-26T18:00:00.000Z'), when=new Date(now).toISOString();",
    "const plain=describeBhlEncoderDiagnostics(null,'paky-01',true,now);",
    "assert.equal(plain.expected,22);assert.equal(plain.observedReadOnly,0);assert.equal(plain.validForKinematicPose,0);",
    "assert.ok(plain.rows.every(r=>r.status==='NO_SOURCE'&&r.angleRad===null&&!r.validForKinematicPose));",
    "const motor={id:'CAN5',joint:'leg_left_knee_pitch_joint',measured_at:when,state:'observed',position:{quality:'observed',source_kind:'physical',value:0,unit:'rad',source_id:'read-only-can5',measured_at:when}};",
    "const snap={schema_version:'console.v1',robot_id:'paky-01',source_kind:'physical',connection_state:'connected',received_at:when,motors:[motor]};",
    "const obs=describeBhlEncoderDiagnostics(snap,'paky-01',true,now);",
    "assert.equal(obs.observedReadOnly,1);assert.equal(obs.validForKinematicPose,0);",
    "assert.equal(obs.rows.find(x=>x.jointId===motor.joint).angleRad,0);",
    "assert.equal(obs.rows.find(x=>x.jointId===motor.joint).status,'OBSERVED_UNVERIFIED_MAPPING');",
    "assert.ok(obs.rows.every(x=>x.validForKinematicPose===false));",
    "assert.equal(describeBhlEncoderDiagnostics({...snap,source_kind:'simulated'},'paky-01',true,now).observedReadOnly,0);",
    "assert.equal(describeBhlEncoderDiagnostics(snap,'paky-01',false,now).observedReadOnly,0);",
    "assert.equal(describeBhlEncoderDiagnostics(snap,'another-robot',true,now).observedReadOnly,0);",
    "assert.equal(describeBhlEncoderDiagnostics({...snap,received_at:new Date(now-9000).toISOString()},'paky-01',true,now).observedReadOnly,0);",
    "assert.equal(describeBhlEncoderDiagnostics({...snap,motors:[motor,{...motor,id:'CAN6'}]},'paky-01',true,now).rows.find(x=>x.jointId===motor.joint).status,'AMBIGUOUS');",
    "assert.equal(describeBhlEncoderDiagnostics({...snap,motors:[{...motor,measured_at:new Date(now-4000).toISOString()}]},'paky-01',true,now).rows.find(x=>x.jointId===motor.joint).status,'STALE');",
    "assert.equal(describeBhlEncoderDiagnostics({...snap,motors:[{...motor,position:{...motor.position,quality:'simulated'}}]},'paky-01',true,now).rows.find(x=>x.jointId===motor.joint).angleRad,null);",
    "assert.equal(describeBhlEncoderDiagnostics({...snap,motors:[{...motor,position:{...motor.position,value:NaN}}]},'paky-01',true,now).observedReadOnly,0);",
    "assert.equal(ref.BHL_V1_ACTUATED_IDS.length,22);"
  ]);
});

test('Full-body renderer is reference only and reuses Console motor snapshot without opening another bus reader',()=>{
  const view=src('apps/web/src/components/torso-cage-preview.tsx');
  const body=src('apps/web/src/components/bhl-reference-body.tsx');
  const live=src('apps/web/src/components/robot-live.tsx');
  const kinematic=src('apps/web/src/lib/bhl-reference-kinematics.ts');
  const encoder=src('apps/web/src/lib/bhl-encoder-diagnostics.ts');
  assert.match(view,/STRUTTURA BHL V1 · 22 GIUNTI/);
  assert.match(view,/ROBOT COMPLETO · NON VERIFICATO/);
  assert.match(view,/bhl_reference/);
  assert.match(view,/GIUNTI ANIMATI DA ENCODER: 0\/22/);
  assert.match(view,/BhlReferenceBody/);
  assert.match(live,/snapshot=\{physical && currentSnapshot/);
  assert.match(body,/bhlReferenceNeutralSkeleton/);
  assert.doesNotMatch(body,/motor\.position|angular_velocity|gyro|connectCAN|useConsole/);
  assert.doesNotMatch(kinematic,/MotorTelemetry|snapshot\.motors|motor\.position|jointAngles/);
  assert.match(encoder,/validForKinematicPose: false/);
  assert.match(encoder,/OBSERVED_UNVERIFIED_MAPPING/);
  for(const c of [view,body,kinematic,encoder]){
    assert.doesNotMatch(c,/\bfetch\(|new WebSocket|serialport|\/dev\/tty|motor\.command|motor\.write|can\.send|apiWrite\(/);
  }
});
