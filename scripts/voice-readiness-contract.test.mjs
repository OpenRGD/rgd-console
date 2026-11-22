import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const schema = JSON.parse(readFileSync(new URL('../contracts/console/voice-readiness.v0.1-candidate.schema.json', import.meta.url), 'utf8'));

test('Voice status is a closed, manual, non-actuating snapshot contract', () => {
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.properties.live_connection, { const: false });
  assert.deepEqual(schema.properties.non_actuating, { const: true });
  assert.deepEqual(schema.properties.source_kind, { const: 'manual_localhost_probe' });
  for (const name of ['schema_version', 'robot_id', 'generated_at_utc', 'service_reachable',
                      'voice_lab_version', 'audio_available', 'input_device_count',
                      'output_device_count', 'ready_local_models', 'ready_cloud_models',
                      'piper_model_loaded', 'live_connection', 'non_actuating']) {
    assert.ok(schema.required.includes(name), name);
  }
  for (const forbidden of ['credentials', 'api_key', 'hostname', 'audio', 'transcript',
                           'microphone_name', 'speaker_name', 'model_path']) {
    assert.equal(Object.hasOwn(schema.properties, forbidden), false);
  }
});
