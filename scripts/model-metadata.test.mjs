import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nominalRpy, describeNominalRpy, nominalRpyCoverage } from '../apps/web/src/lib/model-metadata.ts';

test('nominal RPY preserves source order and distinguishes explicit zero from unknown', () => {
  assert.deepEqual(nominalRpy([0.25,-1.5,0.5]), [0.25,-1.5,0.5]);
  assert.equal(describeNominalRpy([0,0,0]), '0 / 0 / 0');
  assert.equal(describeNominalRpy(undefined), 'Non noto');
  assert.equal(describeNominalRpy(null), 'Non noto');
  assert.equal(describeNominalRpy([0.000001,-0.000002,0]), '0.000001 / -0.000002 / 0');
});
test('invalid vector shapes do not acquire a nominal transform', () => {
  for (const invalid of [[],[1,2],[1,2,3,4],[0,'1',2],[0,true,2],[0,null,2],[NaN,0,0],[Infinity,0,0],Array(3),{}]) {
    assert.equal(nominalRpy(invalid), null);
    assert.equal(describeNominalRpy(invalid), 'Non noto');
  }
});
test('mixed legacy and newly imported joints have honest coverage', () => {
  assert.deepEqual(nominalRpyCoverage([]), {total:0,declared:0,unknown:0});
  assert.deepEqual(nominalRpyCoverage([{},{origin_rpy_rad:null},{origin_rpy_rad:[0,0,0]},{origin_rpy_rad:[0.1,0.2,0.3]},{origin_rpy_rad:[1,2]}]), {total:5,declared:2,unknown:3});
});
test('model schema stays additive and distinct from identity or mutation authority', () => {
  const model = JSON.parse(readFileSync(new URL('../contracts/console/v1/model.schema.json',import.meta.url),'utf8'));
  const joint = model.properties.joints.items;
  assert.ok(!joint.required.includes('origin_rpy_rad'));
  const rpy = joint.properties.origin_rpy_rad;
  assert.deepEqual(rpy.type,['array','null']);
  assert.equal(rpy.minItems,3);
  assert.equal(rpy.maxItems,3);
  assert.equal(model.properties.integrity_state.const,'canonical_not_verified');
  for (const key of ['life_id','as_built_revision_ref','source_root_digest','history_committed','physical_execution_authorized']) assert.ok(!Object.hasOwn(model.properties,key));
});
