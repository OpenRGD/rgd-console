/** Manual, explicitly non-live Voice Lab status; no credential or audio transport. */
export interface VoiceReadiness {
  schema_version: 'console.voice-readiness.v0.1-candidate';
  robot_id: string;
  generated_at_utc: string;
  source_kind: 'manual_localhost_probe';
  service_reachable: boolean;
  voice_lab_version: string | null;
  audio_available: boolean | null;
  input_device_count: number | null;
  output_device_count: number | null;
  ready_local_models: number | null;
  ready_cloud_models: number | null;
  piper_model_loaded: boolean | null;
  live_connection: false;
  non_actuating: true;
}

export const MAX_VOICE_REPORT_BYTES = 8192;
export const VOICE_REPORT_TTL_MS = 90_000;
export const VOICE_REPORT_CLOCK_TOLERANCE_MS = 5_000;

const KEYS = [
  'schema_version', 'robot_id', 'generated_at_utc', 'source_kind',
  'service_reachable', 'voice_lab_version', 'audio_available',
  'input_device_count', 'output_device_count', 'ready_local_models',
  'ready_cloud_models', 'piper_model_loaded', 'live_connection', 'non_actuating',
] as const;

const isNullableBoolean = (value: unknown): value is boolean | null =>
  value === null || typeof value === 'boolean';
const isNullableCount = (value: unknown): value is number | null =>
  value === null || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 100);

export function isVoiceReadiness(value: unknown): value is VoiceReadiness {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  const receivedKeys = Object.keys(v);
  if (receivedKeys.length !== KEYS.length ||
      receivedKeys.some(key => !(KEYS as readonly string[]).includes(key))) return false;
  if (v.schema_version !== 'console.voice-readiness.v0.1-candidate' ||
      v.source_kind !== 'manual_localhost_probe' ||
      v.live_connection !== false || v.non_actuating !== true) return false;
  if (typeof v.robot_id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$(?![\s\S])/.test(v.robot_id)) return false;
  if (typeof v.generated_at_utc !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(v.generated_at_utc) ||
      !Number.isFinite(Date.parse(v.generated_at_utc)) ||
      new Date(v.generated_at_utc).toISOString() !== v.generated_at_utc.replace('Z', '.000Z')) return false;
  if (typeof v.service_reachable !== 'boolean' ||
      !(v.voice_lab_version === null ||
        (typeof v.voice_lab_version === 'string' &&
         /^[0-9]{1,10}\.[0-9]{1,10}\.[0-9]{1,10}$(?![\s\S])/.test(v.voice_lab_version)))) return false;
  if (!isNullableBoolean(v.audio_available) ||
      !isNullableBoolean(v.piper_model_loaded)) return false;
  for (const key of ['input_device_count', 'output_device_count', 'ready_local_models', 'ready_cloud_models']) {
    if (!isNullableCount(v[key])) return false;
  }
  if (!v.service_reachable) {
    for (const key of ['voice_lab_version', 'audio_available', 'input_device_count', 'output_device_count', 'ready_local_models', 'ready_cloud_models', 'piper_model_loaded']) {
      if (v[key] !== null) return false;
    }
  } else if (v.voice_lab_version === null) return false;
  if (v.audio_available !== true && (v.input_device_count !== null || v.output_device_count !== null)) return false;
  return true;
}

/** Parse only a small, closed, flat report. JSON.parse alone silently accepts duplicate keys. */
export function parseVoiceReadiness(raw: string, robotId: string): VoiceReadiness {
  if (new TextEncoder().encode(raw).length > MAX_VOICE_REPORT_BYTES)
    throw new Error('Il file supera il limite di 8 KiB.');
  let value: unknown;
  try {
    value = JSON.parse(raw);
    const seen = new Set<string>();
    // After successful JSON parsing, a quoted token followed by a colon is a key.
    // Decode escaped key spellings too; duplicate keys anywhere are rejected.
    for (const token of raw.matchAll(/"(?:[^"\\]|\\.)*"/gs)) {
      const end = (token.index ?? 0) + token[0].length;
      if (!/^\s*:/.test(raw.slice(end))) continue;
      const key: string = JSON.parse(token[0]);
      if (seen.has(key)) throw new Error('duplicate key');
      seen.add(key);
    }
  } catch {
    // Never expose a parser error that might include private contents of the file.
    throw new Error('JSON non valido o chiavi duplicate.');
  }
  if (!isVoiceReadiness(value))
    throw new Error('Contratto di diagnostica Voice non valido o contenuto non consentito.');
  if (value.robot_id !== robotId) throw new Error('Il report appartiene a un altro robot.');
  return value;
}

export function voiceReportState(report: VoiceReadiness | null, now: number):
  'absent' | 'future' | 'stale' | 'unreachable' | 'recent' {
  if (!report) return 'absent';
  const age = now - Date.parse(report.generated_at_utc);
  if (!Number.isFinite(age) || age > VOICE_REPORT_TTL_MS) return 'stale';
  if (age < -VOICE_REPORT_CLOCK_TOLERANCE_MS) return 'future';
  return report.service_reachable ? 'recent' : 'unreachable';
}
