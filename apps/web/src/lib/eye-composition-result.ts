/** VISUAL v0.1 — strict read-only parser for canonical Eye Composer outputs.
 *
 * This is NOT the composition policy engine and not an evidence verifier.
 * It permits only explicitly non-actuating synthetic operator previews.
 */
import { validExpression } from '@/components/expressive-eyes';
import type { EyeExpression } from '@/components/expressive-eyes';

export const MAX_COMPOSITION_FILE = 64 * 1024;
const ROBOT = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const GESTURE = /^[a-f0-9]{32}$/;
const COLOR = /^#[a-fA-F0-9]{6}$/;
const PHASES = new Set([
  'idle','listening','thinking','speaking','error','off','boot','connecting',
  'transcribing','awaiting_user','no_input','link_lost','rest',
]);
const SOCIAL = new Set(['welcome','friendly','curious','surprised','uncertain','ack','concern']);
const GAZE = new Set(['not_provided','applied_in_preview','expired_centered','suppressed_by_display_or_state']);
const GESTURE_STATUS = new Set(['not_requested','suppressed','expired','visible']);

function object(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
function exact(v: unknown, keys: string[]): v is Record<string, unknown> {
  return object(v) && Object.keys(v).length === keys.length &&
    keys.every(k => Object.prototype.hasOwnProperty.call(v, k));
}
const isInt=(x:unknown)=>typeof x==='number' && Number.isSafeInteger(x);
const isPhase=(x:unknown)=>typeof x==='string' && PHASES.has(x);

export type CompositionResult = {
  schema_version: 'openrgd.visual.eye-compose-result.v0.1-candidate';
  robot_id: string; source_kind: 'operator_synthetic_preview';
  voice_phase_requested: string | null; voice_sample_current: boolean;
  functional_scene: string; eyes_scene: string; eyes_disabled: boolean;
  display_link_state: 'ready' | 'connecting' | 'lost';
  microphone_state: 'disabled' | 'monitoring' | 'capturing' | 'unknown';
  gesture_status: 'not_requested' | 'suppressed' | 'expired' | 'visible';
  social_overlay: null | {scene: string; gesture_id: string; remaining_ms: number};
  gaze_status: string;
  ring_intent: {color: string; brightness: number; derived_from: string; applied: false};
  expression: EyeExpression;
  eye_frame_plan: Record<string,unknown>;
  blank_pixels_intent: boolean;
  reasons: string[];
  source_authenticated: false;
  hardware_commands_sent: false; physical_output_observed: false;
  preview_only: true; non_actuating: true;
};

export function parseCompositionResult(input: unknown, expectedRobot: string): CompositionResult {
  if (!exact(input, [
    'schema_version','robot_id','source_kind','voice_phase_requested','voice_sample_current',
    'functional_scene','eyes_scene','eyes_disabled','display_link_state',
    'microphone_state','gesture_status','social_overlay','gaze_status',
    'ring_intent','expression','eye_frame_plan','blank_pixels_intent','reasons',
    'source_authenticated','hardware_commands_sent','physical_output_observed',
    'preview_only','non_actuating',
  ])) throw new Error('Non è un risultato Eye Composer v0.1 valido.');
  if (input.schema_version !== 'openrgd.visual.eye-compose-result.v0.1-candidate' ||
    input.source_kind !== 'operator_synthetic_preview' ||
    input.source_authenticated !== false || input.hardware_commands_sent !== false ||
    input.physical_output_observed !== false || input.preview_only !== true ||
    input.non_actuating !== true) {
    throw new Error('Il risultato richiede un formato simulato e privo di autorità hardware.');
  }
  if (typeof input.robot_id !== 'string' || !ROBOT.test(input.robot_id))
    throw new Error('Identificatore robot non valido.');
  if (input.robot_id !== expectedRobot)
    throw new Error('Questo risultato è per ' + input.robot_id + '. Seleziona il robot corretto.');
  if (!isPhase(input.functional_scene) || !isPhase(input.eyes_scene) ||
    (input.voice_phase_requested !== null && !isPhase(input.voice_phase_requested)) ||
    typeof input.voice_sample_current !== 'boolean' ||
    typeof input.eyes_disabled !== 'boolean' ||
    typeof input.blank_pixels_intent !== 'boolean') throw new Error('Stati di composizione non validi.');
  if (!['ready','connecting','lost'].includes(String(input.display_link_state)) ||
    !['disabled','monitoring','capturing','unknown'].includes(String(input.microphone_state)) ||
    !GESTURE_STATUS.has(String(input.gesture_status)) || !GAZE.has(String(input.gaze_status)))
    throw new Error('Stato periferica o indicatore non valido.');
  if (input.eyes_disabled && (input.eyes_scene !== 'off' || input.blank_pixels_intent !== true))
    throw new Error('Output occhi disabilitato ma non rappresentato come blank.');
  if (input.blank_pixels_intent && input.eyes_scene !== 'off')
    throw new Error('Blank intent non compatibile con la scena occhi.');
  if (!exact(input.ring_intent,['color','brightness','derived_from','applied']) ||
    typeof input.ring_intent.color !== 'string' || !COLOR.test(input.ring_intent.color) ||
    !isInt(input.ring_intent.brightness) || (input.ring_intent.brightness as number) < 0 ||
    (input.ring_intent.brightness as number) > 100 ||
    typeof input.ring_intent.derived_from !== 'string' ||
    (!isPhase(input.ring_intent.derived_from) && input.ring_intent.derived_from !== 'no_style_defined') ||
    input.ring_intent.applied !== false) throw new Error('Ring intent non valido.');
  if (input.social_overlay !== null) {
    if (!exact(input.social_overlay,['scene','gesture_id','remaining_ms']) ||
      !SOCIAL.has(String(input.social_overlay.scene)) ||
      typeof input.social_overlay.gesture_id !== 'string' || !GESTURE.test(input.social_overlay.gesture_id) ||
      !isInt(input.social_overlay.remaining_ms) ||
      (input.social_overlay.remaining_ms as number) <= 0 ||
      input.gesture_status !== 'visible')
      throw new Error('Overlay sociale non valido.');
  } else if (input.gesture_status === 'visible') {
    throw new Error('Overlay dichiarato visibile ma assente.');
  }
  if (!validExpression(input.expression)) throw new Error('Ricetta composta non valida.');
  if (!object(input.eye_frame_plan) ||
    input.eye_frame_plan.schema_version !== 'openrgd.visual.eye-frame-plan.v0.1-candidate' ||
    input.eye_frame_plan.expression_id !== input.expression.expression_id ||
    input.eye_frame_plan.preview_only !== true ||
    input.eye_frame_plan.non_actuating !== true ||
    input.eye_frame_plan.hardware_commands_sent !== false ||
    input.eye_frame_plan.physical_output_observed !== false)
    throw new Error('Piano occhi non valido.');
  if (!Array.isArray(input.reasons) || input.reasons.length > 20 ||
    !input.reasons.every(x=>typeof x==='string' && /^[a-z][a-z0-9_]{0,79}$/.test(x)))
    throw new Error('Motivi della composizione non validi.');
  return input as CompositionResult;
}
