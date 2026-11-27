import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { isVoiceReadiness, parseVoiceReadiness, voiceReportState, MAX_VOICE_REPORT_BYTES } from '../apps/web/src/lib/voice-readiness.ts';
import { spawnSync } from 'node:child_process';

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

const sample = {
  schema_version: 'console.voice-readiness.v0.1-candidate',
  robot_id: 'paky-01', generated_at_utc: '2026-11-27T10:00:00Z',
  source_kind: 'manual_localhost_probe', service_reachable: true,
  voice_lab_version: '0.3.1', audio_available: true,
  input_device_count: 2, output_device_count: 1,
  ready_local_models: 3, ready_cloud_models: 0, piper_model_loaded: false,
  live_connection: false, non_actuating: true
};
const now = Date.parse(sample.generated_at_utc);

test('browser parser accepts a matching snapshot; rejects wrong robot and surplus fields', () => {
  assert.deepEqual(parseVoiceReadiness(JSON.stringify(sample), 'paky-01'), sample);
  assert.throws(() => parseVoiceReadiness(JSON.stringify(sample), 'another-robot'), /altro robot/);
  assert.throws(() => parseVoiceReadiness(JSON.stringify({...sample, credentials: 'secret'}), 'paky-01'), /non consentito/);
  assert.throws(() => parseVoiceReadiness(JSON.stringify(sample) + ' '.repeat(MAX_VOICE_REPORT_BYTES), 'paky-01'), /8 KiB/);
});

test('reject duplicate and escaped duplicate keys without leaking parser contents', () => {
  const raw = JSON.stringify(sample);
  for (const key of ['"robot_id"', '"robot_\\u0069d"']) {
    assert.throws(() => parseVoiceReadiness(raw.slice(0,-1) + ',' + key + ':"paky-01"}', 'paky-01'), /duplicate/);
  }
  assert.throws(() => parseVoiceReadiness('sensitive-token!', 'paky-01'), e => !e.message.includes('sensitive-token'));
});

test('strict timestamp, identity, version, field types and contradictory values', () => {
  for (const patch of [
    {robot_id:'paky-01\n'}, {generated_at_utc:'2026-02-30T10:00:00Z'},
    {generated_at_utc:'2026-11-27T10:00:00+00:00'}, {voice_lab_version:'0.3.1\n'},
    {voice_lab_version:'9'.repeat(35)+'.0.0'}, {input_device_count:true},
    {ready_cloud_models:-1}, {audio_available:false}, {audio_available:null},
    {service_reachable:false}, {voice_lab_version:null},
    {live_connection:true}, {non_actuating:false}
  ]) assert.equal(isVoiceReadiness({...sample,...patch}), false, JSON.stringify(patch));
});

test('manual freshness is bounded, unknown clocks do not show recent availability', () => {
  assert.equal(voiceReportState(null, now), 'absent');
  assert.equal(voiceReportState(sample, now + 90_000), 'recent');
  assert.equal(voiceReportState(sample, now + 90_001), 'stale');
  assert.equal(voiceReportState(sample, now - 5_001), 'future');
  assert.equal(voiceReportState(sample, NaN), 'stale');
  const unreachable = {...sample,service_reachable:false,voice_lab_version:null,audio_available:null,
    input_device_count:null,output_device_count:null,ready_local_models:null,ready_cloud_models:null,piper_model_loaded:null};
  assert.equal(isVoiceReadiness(unreachable),true);
  assert.equal(voiceReportState(unreachable,now),'unreachable');
});

test('actual Python exporter projection conforms to actual browser parser (synthetic)', () => {
  const python = spawnSync('python3', ['-c', [
    'import json,sys',
    'sys.path.insert(0,"scripts")',
    'from voice_status_export import build_report',
    'h={"version":"0.3.1","audio":True,"ready_local":2,"connected_cloud":0,"piper_runtime":{"loaded":False},"host":"PRIVATE"}',
    'd={"available":False,"sources":[],"sinks":[]}',
    'print(json.dumps(build_report("paky-01",h,d,"2026-11-27T10:00:00Z")))'
  ].join(';')], {encoding:'utf8',timeout:5000});
  assert.equal(python.status,0,python.stderr);
  assert.ok(!python.stdout.includes('PRIVATE'));
  const parsed = parseVoiceReadiness(python.stdout,'paky-01');
  assert.equal(parsed.input_device_count,null);
  assert.equal(parsed.output_device_count,null);
  assert.equal(parsed.ready_local_models,2);
});

test('robot context remounts panel; async imports invalidate old generations', () => {
  const shell = readFileSync(new URL('../apps/web/src/components/console-shell.tsx', import.meta.url),'utf8');
  const panel = readFileSync(new URL('../apps/web/src/components/voice-readiness.tsx', import.meta.url),'utf8');
  assert.ok(shell.includes('key={data.robot.id} robotId={data.robot.id}'));
  assert.ok(panel.includes('++importRevision.current'));
  assert.ok(panel.includes('revision !== importRevision.current'));
  assert.ok(panel.includes('importRevision.current += 1'));
});
