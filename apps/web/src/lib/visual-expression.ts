import {validPreviewRobot} from './visual-json.ts';
export type EyeParams = {
  openness: number; gaze_x: number; gaze_y: number;
  pupil_scale: number; brow_tilt_deg: number;
};
export type EyeExpression = {
  schema_version: 'openrgd.visual.eye-expression.v0.1-candidate';
  expression_id: string; label: string; origin: 'operator' | 'cognitive_proposal';
  affect: { valence: number; arousal: number; intensity: number };
  eyes: { left: EyeParams; right: EyeParams };
  palette: { background: string; iris: string; accent: string; ring_brightness_pct: number };
  animation: { mode: 'still' | 'breathe' | 'scan'; blink_interval_ms: number; blink_duration_ms: number };
  duration_ms: number; preview_only: true; non_actuating: true;
  claims_emotion_as_internal_state: false;
};
export type Proposal = {
  contract: 'openrgd.visual.cognitive-expression-proposal.v0.1-candidate';
  proposal_id: string;
  robot_id: string;
  source_module: 'org.openrgd.cognition';
  source_session_id: string;
  source_sequence: number;
  requested_at_utc: string;
  presentation: 'transient_preview';
  approval_required_for_persistence: true;
  hardware_execution_authorized: false;
  expression: EyeExpression;
};

const EYE_KEYS = ['openness', 'gaze_x', 'gaze_y', 'pupil_scale', 'brow_tilt_deg'];
const EXPR_KEYS = [
  'schema_version', 'expression_id', 'label', 'origin', 'affect', 'eyes',
  'palette', 'animation', 'duration_ms', 'preview_only', 'non_actuating',
  'claims_emotion_as_internal_state',
];
const PROPOSAL_KEYS = [
  'contract', 'proposal_id', 'robot_id', 'source_module', 'source_session_id',
  'source_sequence', 'requested_at_utc', 'presentation',
  'approval_required_for_persistence', 'hardware_execution_authorized', 'expression',
];

export const DEMO_EXPRESSION: EyeExpression = {
  schema_version: 'openrgd.visual.eye-expression.v0.1-candidate',
  expression_id: 'demo_expression',
  label: 'Esempio sintetico',
  origin: 'cognitive_proposal',
  affect: { valence: 0.76, arousal: 0.61, intensity: 0.74 },
  eyes: {
    left: { openness: 0.92, gaze_x: 0.22, gaze_y: -0.18, pupil_scale: 1.17, brow_tilt_deg: -9 },
    right: { openness: 0.88, gaze_x: 0.22, gaze_y: -0.18, pupil_scale: 1.17, brow_tilt_deg: 11 },
  },
  palette: { background: '#081424', iris: '#4FE3D0', accent: '#67DEFF', ring_brightness_pct: 25 },
  animation: { mode: 'breathe', blink_interval_ms: 5200, blink_duration_ms: 140 },
  duration_ms: 6200, preview_only: true, non_actuating: true,
  claims_emotion_as_internal_state: false,
};
export const DEMO_PROPOSAL: Proposal = {
  contract: 'openrgd.visual.cognitive-expression-proposal.v0.1-candidate',
  proposal_id: 'acebacebacebacebacebacebacebaceb',
  robot_id: 'preview-demo',
  source_module: 'org.openrgd.cognition',
  source_session_id: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  source_sequence: 1,
  requested_at_utc: '2026-10-26T12:00:00Z',
  presentation: 'transient_preview',
  approval_required_for_persistence: true,
  hardware_execution_authorized: false,
  expression: DEMO_EXPRESSION,
};

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exact(value: unknown, keys: string[]): value is Record<string, unknown> {
  return object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
}
function numeric(v: unknown, low: number, high: number) {
  return typeof v === 'number' && Number.isFinite(v) && v >= low && v <= high;
}
function integer(v: unknown, low: number, high: number) {
  return numeric(v, low, high) && Number.isInteger(v);
}
function color(v: unknown): v is string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
}
function isEye(value: unknown): value is EyeParams {
  if (!exact(value, EYE_KEYS)) return false;
  return numeric(value.openness, .12, 1) && numeric(value.gaze_x, -.6, .6) &&
    numeric(value.gaze_y, -.6, .6) && numeric(value.pupil_scale, .6, 1.4) &&
    numeric(value.brow_tilt_deg, -20, 20);
}
export function validExpression(value: unknown): value is EyeExpression {
  if (!exact(value, EXPR_KEYS)) return false;
  if (value.schema_version !== DEMO_EXPRESSION.schema_version ||
    typeof value.expression_id !== 'string' || !/^[a-z][a-z0-9_]{2,47}$(?![\s\S])/.test(value.expression_id) || ['constructor','prototype'].includes(value.expression_id)) return false;
  if (typeof value.label !== 'string' || !value.label.length || Array.from(value.label).length > 64 || /[\x00-\x1f\x7f]/.test(value.label)) return false;
  if (value.origin !== 'operator' && value.origin !== 'cognitive_proposal') return false;
  if (value.preview_only !== true || value.non_actuating !== true || value.claims_emotion_as_internal_state !== false) return false;
  if (!exact(value.affect, ['valence', 'arousal', 'intensity']) || !numeric(value.affect.valence, -1, 1)
    || !numeric(value.affect.arousal, 0, 1) || !numeric(value.affect.intensity, 0, 1)) return false;
  if (!exact(value.eyes, ['left', 'right']) || !isEye(value.eyes.left) || !isEye(value.eyes.right)) return false;
  if (!exact(value.palette, ['background', 'iris', 'accent', 'ring_brightness_pct'])
    || !color(value.palette.background) || !color(value.palette.iris) || !color(value.palette.accent)
    || !integer(value.palette.ring_brightness_pct, 0, 40)) return false;
  if (!exact(value.animation, ['mode', 'blink_interval_ms', 'blink_duration_ms'])
    || typeof value.animation.mode !== 'string' || !['still', 'breathe', 'scan'].includes(value.animation.mode)
    || !integer(value.animation.blink_interval_ms, 2500, 12000)
    || !integer(value.animation.blink_duration_ms, 80, 250)) return false;
  return integer(value.duration_ms, 500, 12000);
}
export function validProposal(value: unknown): value is Proposal {
  if (!exact(value, PROPOSAL_KEYS)) return false;
  return value.contract === DEMO_PROPOSAL.contract &&
    typeof value.proposal_id === 'string' && /^[a-f0-9]{32}$/.test(value.proposal_id) &&
    validPreviewRobot(value.robot_id) &&
    value.source_module === DEMO_PROPOSAL.source_module &&
    typeof value.source_session_id === 'string' && /^[a-f0-9]{32}$/.test(value.source_session_id) &&
    integer(value.source_sequence, 0, Number.MAX_SAFE_INTEGER) &&
    typeof value.requested_at_utc === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value.requested_at_utc) &&
    Number.isFinite(Date.parse(value.requested_at_utc)) &&
    value.presentation === 'transient_preview' &&
    value.approval_required_for_persistence === true &&
    value.hardware_execution_authorized === false &&
    validExpression(value.expression) && value.expression.origin === 'cognitive_proposal';
}

