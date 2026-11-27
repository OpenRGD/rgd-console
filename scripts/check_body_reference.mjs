import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nominalBody} from '../apps/web/src/lib/body-kinematics.ts';
const args=process.argv.slice(2), requireComplete=args.includes('--require-complete');
const [modelPath,expectedPath]=args.filter(x=>x!=='--require-complete');
if(!modelPath)throw Error('Usage: node scripts/check_body_reference.mjs MODEL_JSON [EXPECTED_INVENTORY_JSON] [--require-complete]');
const model=JSON.parse(readFileSync(modelPath,'utf8')),result=nominalBody(model);
assert.ok(['nominal','partial'].includes(result.state),result.reason);
if(requireComplete)assert.equal(result.state,'nominal','External fixture contains incomplete transforms');
assert.equal(result.physicalPoseVerified,false);assert.equal(result.declaredJoints,model.joints.length);
assert.equal(result.bones.length+result.omitted.length,model.joints.length);
assert.equal(result.links.length,result.bones.length+1);
assert.ok(result.links.every(x=>x.position.every(Number.isFinite)));
if(expectedPath){
 const expected=JSON.parse(readFileSync(expectedPath,'utf8'));
 assert.deepEqual(model.joints.map(j=>({id:j.id,type:j.joint_type.toUpperCase(),parent:j.parent_link,child:j.child_link})).sort((a,b)=>a.id.localeCompare(b.id)),expected.sort((a,b)=>a.id.localeCompare(b.id)));
}
console.log(JSON.stringify({state:result.state,declaredJoints:result.declaredJoints,resolvedTransforms:result.bones.length,omitted:result.omitted.length,physicalPoseVerified:false}));
