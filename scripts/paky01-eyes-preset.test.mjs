import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const file = new URL('../apps/web/src/fixtures/paky01-eyes-v0.1.preview.json', import.meta.url);
const raw = readFileSync(file, 'utf8');
const p = JSON.parse(raw);
test('paky-01 eyes preset is identical to pinned design profile', () => {
  assert.equal(createHash('sha256').update(raw).digest('hex'), 'ae3178993e254513e049474ade7d4cb825f984069fd770ac2959f763bbddf563');
  assert.equal(p.robot_id, 'paky-01');
  assert.equal(p.schema_version, 'openrgd.visual-studio.profile.v0.2-candidate');
  assert.equal(p.preview_only, true);
  assert.equal(p.non_actuating, true);
  assert.equal(Object.keys(p.expressions).length, 21);
  assert.equal(Object.keys(p.scenes).length, 21);
  assert.equal(p.mappings.length, 27);
  assert.equal(p.zones.find(z=>z.id==='expressive-eyes')?.adapter_id, null);
});
test('every eye recipe is bounded and every scene resolves within the preset', () => {
  const known = new Set(Object.keys(p.expressions));
  for (const [id, expression] of Object.entries(p.expressions)) {
    assert.equal(id, expression.expression_id);
    assert.equal(expression.preview_only, true);
    assert.equal(expression.non_actuating, true);
    assert.equal(expression.claims_emotion_as_internal_state, false);
    for (const side of ['left','right']) {
      assert.ok(expression.eyes[side].openness >= .12 && expression.eyes[side].openness <= 1);
      assert.ok(expression.eyes[side].gaze_x >= -.6 && expression.eyes[side].gaze_x <= .6);
    }
  }
  for (const targets of Object.values(p.scenes)) {
    for (const t of targets) if (t.effect === 'eye_expression') assert.ok(known.has(t.expression_id));
  }
  for (const m of p.mappings) assert.ok(p.scenes[m.scene], m.scene);
  assert.ok(p.scenes[p.fallback_scene]);
});
test('six legacy ring colors and brightness values preserved', () => {
  const colors = {idle:['#FFFFFF',10],listening:['#0050FF',35],thinking:['#9600FF',35],speaking:['#00FF46',35],error:['#FF0000',30],off:['#000000',0]};
  for (const [name,[color,brightness]] of Object.entries(colors)) {
    const ring = p.scenes[name].find(t=>t.zone_id==='face-ring');
    assert.deepEqual([ring.color,ring.brightness],[color,brightness]);
  }
});
