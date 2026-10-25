import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = p => readFileSync(resolve(root, p), 'utf8');

test('HAL preview reads original RGD archive with digest check but never actuates', () => {
  const api = file('services/api/src/routes.rs');
  const importer = file('services/api/src/model_import.rs');
  assert.match(api, /hal-declarations", get\(robot_hal_declarations\)/);
  assert.match(api, /archive_digest_mismatch/);
  assert.match(importer, /pub fn inspect_hal_declarations/);
  assert.match(importer, /"rgd_source_declaration_unverified_not_physical_evidence"/);
  assert.match(importer, /physical_mapping_verified: false/);
  assert.match(importer, /actuation_enabled: false/);
  assert.doesNotMatch(importer, /socketcan|python-can|bus\.send\(/i);
});

test('HAL preview requires explicit RGD joint reference and no auto-binding', () => {
  const importer = file('services/api/src/model_import.rs');
  const ui = file('apps/web/src/components/onboarding.tsx');
  assert.match(importer, /unresolved_joint_reference/);
  assert.match(importer, /drives_joint_ref_str/);
  assert.match(importer, /joint_names\.contains\(joint\)/);
  assert.match(ui, /HAL dichiarato nel profilo RGD/);
  assert.match(ui, /Prepara bozza/);
  assert.match(ui, /DICHIARAZIONI DEL MODELLO ≠ MAPPATURA CAN VERIFICATA/);
  assert.doesNotMatch(ui, /useEffect\(\(\)\s*=>[^]*?apiWrite\([^]*?hal-declarations/);
});
