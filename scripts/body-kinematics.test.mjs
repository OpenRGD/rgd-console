import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nominalBody,fitNominalBody,toDisplay} from '../apps/web/src/lib/body-kinematics.ts';
import {bodyEncoderDiagnostics} from '../apps/web/src/lib/body-encoder-diagnostics.ts';
const joint=(id,parent,child,xyz=[0,0,0],rpy=[0,0,0],type='REVOLUTE')=>({id,parent_link:parent,child_link:child,origin_xyz_m:xyz,origin_rpy_rad:rpy,joint_type:type});
const model=(links,joints)=>({links:links.map(id=>({id})),joints});
const equalVec=(a,b)=>{assert.equal(a.length,3);a.forEach((x,i)=>assert.ok(Math.abs(x-b[i])<1e-9));};
test('rotated parent and child translations use source frames independent of input order',()=>{
 const body=nominalBody(model(['root','a','b'],[joint('second','a','b',[1,0,0],[0,0,0],'FIXED'),joint('first','root','a',[0,1,0],[0,0,Math.PI/2])]));
 assert.equal(body.state,'nominal');assert.equal(body.root,'root');equalVec(body.links.find(x=>x.id==='b').position,[0,2,0]);assert.equal(body.physicalPoseVerified,false);
 assert.equal(body.bones.length,2);assert.ok(body.links.every(x=>toDisplay(x.position,fitNominalBody(body)).every(Number.isFinite)));
});
test('different arbitrary robot topologies work without model-specific defaults',()=>{
 const a=nominalBody(model(['x','y'],[joint('hinge','x','y',[0,0,2])]));
 const b=nominalBody(model(['r','p','q','s'],[joint('one','r','p',[1,0,0]),joint('two','r','q',[0,1,0]),joint('three','r','s',[0,0,1])]));
 assert.equal(a.bones.length,1);assert.equal(b.bones.length,3);assert.equal(b.links.length,4);
 assert.equal(nominalBody(null).state,'empty');assert.equal(nominalBody(model(['a'],[])).state,'empty');
});
test('missing RPY blocks descendants but preserves independent branches',()=>{
 const a=joint('unknown','root','a',[1,0,0]);delete a.origin_rpy_rad;
 const b=nominalBody(model(['root','a','b','c'],[a,joint('child','a','b',[1,0,0]),joint('known','root','c',[0,0,1])]));
 assert.equal(b.state,'partial');assert.deepEqual(b.omitted.map(x=>x.reason),['missing_transform','unresolved_parent']);assert.deepEqual(b.bones.map(x=>x.jointId),['known']);
});
test('reject cycles, duplicates, multiple parents, dangling links, disconnected graph and preview overflow',()=>{
 for(const x of [model(['a','b'],[joint('j','a','b'),joint('k','b','a')]),model(['a','a','b'],[joint('j','a','b')]),
 model(['a','b','c'],[joint('j','a','b'),joint('j','a','c')]),model(['a','b','c'],[joint('j','a','c'),joint('k','b','c')]),
 model(['a'],[joint('j','a','b')]),model(['a','b','c'],[joint('j','a','b')]),model(Array.from({length:513},(_,i)=>String(i)),[joint('j','0','1')])])
 assert.equal(nominalBody(x).state,'invalid');
});
test('invalid numeric data and unsupported joint types never acquire transforms',()=>{
 for(const [xyz,rpy,type] of [[[0,0,Infinity],[0,0,0],'FIXED'],[[0,0,0],[0,0],'FIXED'],[[1e9,0,0],[0,0,0],'FIXED'],[[0,0,0],[0,0,0],'FLOATING']]){
  const b=nominalBody(model(['a','b'],[joint('j','a','b',xyz,rpy,type)]));assert.equal(b.state,'partial');assert.equal(b.bones.length,0);
 }
});
test('passive angular readings use selected physical source; never calibrated FK',()=>{
 const m=model(['r','a','b'],[joint('j','r','a'),joint('k','a','b')]);
 const now=Date.parse('2026-01-01T00:00:00Z'),when=new Date(now).toISOString();
 const motor={id:'motor',joint:'j',state:'observed',measured_at:when,position:{value:0,quality:'observed',source_kind:'physical',source_id:'provider',unit:'rad',measured_at:when}};
 const s={schema_version:'console.v1',robot_id:'fixture-a',source_kind:'physical',connection_state:'connected',received_at:when,motors:[motor]};
 const run=(snap=s,robot='fixture-a',physical=true,ws=true)=>bodyEncoderDiagnostics(m,snap,robot,physical,ws,now);
 assert.equal(run().expected,2);assert.equal(run().rows[0].angleRad,0);assert.equal(run().validForKinematicPose,0);
 assert.equal(run(s,'fixture-b').observedReadOnly,0);assert.equal(run(s,'fixture-a',false).observedReadOnly,0);assert.equal(run(s,'fixture-a',true,false).observedReadOnly,0);
 assert.equal(run({...s,source_kind:'simulated'}).observedReadOnly,0);
 assert.equal(run({...s,motors:[motor,{...motor,joint:'k'}]}).rows[0].status,'AMBIGUOUS');
 assert.equal(run({...s,motors:[motor,{...motor,id:'other'}]}).rows[0].status,'AMBIGUOUS');
 assert.equal(run({...s,motors:[{...motor,measured_at:'2025-01-01T00:00:00Z'}]}).rows[0].status,'STALE');
 assert.equal(run({...s,motors:[{...motor,position:{...motor.position,value:NaN}}]}).rows[0].status,'INVALID');
 assert.equal(nominalBody(m).physicalPoseVerified,false);
});
test('shared renderer consumes source model, not live telemetry or embedded robot data',()=>{
 const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 const live=load('apps/web/src/components/robot-live.tsx'),section=load('apps/web/src/components/sections.tsx');
 const viewport=load('apps/web/src/components/body-viewport.tsx'),kin=load('apps/web/src/lib/body-kinematics.ts');
 assert.match(live,/<BodyViewport model=\{importedModel\}/);assert.match(section,/<BodyViewport model=\{model\}/);
 assert.match(live,/loadedModel.robotId===selectedRobot\?\.id/);assert.match(section,/loaded.robotId===robot.id/);
 assert.doesNotMatch(viewport+kin,/\bMotorTelemetry\b|snapshot\.motors|useConsole|apiWrite\(|new WebSocket|\/dev\/tty/);
 assert.match(kin,/physicalPoseVerified:false/);
});
