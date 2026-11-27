import { validExpression, type EyeExpression } from './visual-expression.ts';
import { validPreviewRobot } from './visual-json.ts';
export type LightEffect = 'solid' | 'pulse' | 'chase' | 'wave';
export type Effect = LightEffect | 'eye_expression';
export type Binding = 'operator_reported' | 'planned';
export type Zone = { id: string; label: string; adapter_id: string | null; capabilities: Effect[]; binding_status: Binding };
export type LightTarget = { zone_id: string; effect: LightEffect; color: string; brightness: number };
export type EyeTarget = { zone_id: string; effect: 'eye_expression'; expression_id: string };
export type Target = LightTarget | EyeTarget;
export type Mapping = { source: string; event: string; scene: string; priority: number };
export type StudioProfile = {
  schema_version: 'openrgd.visual-studio.profile.v0.2-candidate';
  robot_id: string;
  revision: number;
  zones: Zone[];
  scenes: Record<string, Target[]>;
  expressions: Record<string, EyeExpression>;
  mappings: Mapping[];
  fallback_scene: string;
  non_actuating: true;
  preview_only: true;
};

function validDraftBase(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const c = value as Record<string, unknown>;
  return validPreviewRobot(c.robot_id) && c.preview_only === true
    && c.non_actuating === true && typeof c.revision === 'number'
    && Number.isSafeInteger(c.revision) && c.revision >= 1
    && Array.isArray(c.zones) && Array.isArray(c.mappings)
    && c.scenes !== null && typeof c.scenes === 'object' && !Array.isArray(c.scenes);
}
function isDraft(value: unknown): value is StudioProfile {
  if (!validDraftBase(value) || value.schema_version !== 'openrgd.visual-studio.profile.v0.2-candidate') return false;
  const expressions = value.expressions;
  if (!expressions || typeof expressions !== 'object' || Array.isArray(expressions)) return false;
  const catalog = expressions as Record<string, unknown>;
  if (Object.keys(catalog).length > 32 ||
    !Object.entries(catalog).every(([id, recipe]) =>
      validExpression(recipe) && recipe.expression_id === id)) return false;
  const scenes = value.scenes as Record<string, unknown>;
  return Object.values(scenes).every(scene => Array.isArray(scene) && scene.length > 0 && scene.length <= 32 &&
    scene.every((output: unknown) => {
      if (!output || typeof output !== 'object' || Array.isArray(output)) return false;
      const target = output as Record<string, unknown>;
      if (target.effect === 'eye_expression') {
        return Object.keys(target).sort().join(',') === 'effect,expression_id,zone_id' &&
          typeof target.expression_id === 'string' && Object.hasOwn(catalog,target.expression_id);
      }
      return typeof target.effect==='string' && ['solid','pulse','chase','wave'].includes(target.effect) &&
        typeof target.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(target.color) &&
        typeof target.brightness === 'number' && Number.isInteger(target.brightness) &&
        target.brightness >= 0 && target.brightness <= 100;
    }));
}

export const validKey = (s: string) => /^[a-z][a-z0-9_-]{0,79}$(?![\s\S])/.test(s) && !['constructor','prototype','__proto__'].includes(s);
const hasOwn = (obj: object, name: string) => Object.prototype.hasOwnProperty.call(obj, name);

/** Import is only an untrusted browser draft, never a robot/runtime configuration. */
export function validCompleteDraft(value: unknown): value is StudioProfile {
  if (!isDraft(value)) return false;
  const p = value as StudioProfile;
  if (Object.keys(p).sort().join('|') !== 'expressions|fallback_scene|mappings|non_actuating|preview_only|revision|robot_id|scenes|schema_version|zones') return false;
  if (!Array.isArray(p.zones) || !p.zones.length || p.zones.length > 32) return false;
  if (Object.keys(p.scenes).length < 1 || Object.keys(p.scenes).length > 64 || p.mappings.length > 128) return false;
  const ids = new Set<string>();
  for (const z of p.zones) {
    if (!z || typeof z !== 'object' || Array.isArray(z) || Object.keys(z).sort().join('|') !== 'adapter_id|binding_status|capabilities|id|label' ||
      typeof z.id !== 'string' || !validKey(z.id) || ids.has(z.id) ||
      typeof z.label !== 'string' || !z.label || z.label.length > 120 ||
      !['planned','operator_reported'].includes(z.binding_status) ||
      !Array.isArray(z.capabilities) || z.capabilities.length < 1 || z.capabilities.length > 12 ||
      new Set(z.capabilities).size !== z.capabilities.length ||
      z.capabilities.some(effect => !['solid','pulse','chase','wave','eye_expression'].includes(effect)) ||
      (z.binding_status === 'planned' && z.adapter_id !== null) ||
      (z.adapter_id !== null && (typeof z.adapter_id !== 'string' || !/^[a-z][a-z0-9._-]{0,99}$/.test(z.adapter_id)))) return false;
    ids.add(z.id);
  }
  for (const [name, targets] of Object.entries(p.scenes)) {
    if (!validKey(name) || !Array.isArray(targets) || !targets.length || targets.length > 32) return false;
    const used = new Set<string>();
    for (const t of targets) {
      if (!t || !ids.has(t.zone_id) || used.has(t.zone_id)) return false;
      used.add(t.zone_id);
      const z = p.zones.find(zone => zone.id === t.zone_id);
      if (!z?.capabilities.includes(t.effect)) return false;
      if (t.effect === 'eye_expression') {
        if (Object.keys(t).sort().join('|') !== 'effect|expression_id|zone_id' ||
          !hasOwn(p.expressions, t.expression_id)) return false;
      } else {
        if (Object.keys(t).sort().join('|') !== 'brightness|color|effect|zone_id') return false;
      }
    }
  }
  if (typeof p.fallback_scene !== 'string' || !validKey(p.fallback_scene) || !hasOwn(p.scenes, p.fallback_scene)) return false;
  if (Object.keys(p.expressions).some(id => !/^[a-z][a-z0-9_]{2,47}$/.test(id) || ['constructor','prototype'].includes(id))) return false;
  const matches = new Set<string>();
  for (const m of p.mappings) {
    if (!m || typeof m !== 'object' || Array.isArray(m) || Object.keys(m).sort().join('|') !== 'event|priority|scene|source' ||
      typeof m.source !== 'string' || !validKey(m.source) ||
      typeof m.event !== 'string' || !/^[a-z][a-z0-9._-]{0,99}$/.test(m.event) ||
      typeof m.scene!=='string' || !hasOwn(p.scenes,m.scene) || !Number.isInteger(m.priority) || m.priority < 0 || m.priority > 100) return false;
    const token = m.source + ':' + m.event + ':' + m.priority;
    if (matches.has(token)) return false;
    matches.add(token);
  }
  return true;
}


export function createEmptyDraft(robotId:string):StudioProfile {
  if(!validPreviewRobot(robotId))throw new Error('Identificatore profilo non valido');
  return {schema_version:'openrgd.visual-studio.profile.v0.2-candidate',robot_id:robotId,revision:1,
    zones:[{id:'preview-light',label:'Luce virtuale · esempio sintetico',adapter_id:null,capabilities:['solid','pulse','chase','wave'],binding_status:'planned'},
      {id:'preview-eyes',label:'Occhi virtuali · esempio sintetico',adapter_id:null,capabilities:['eye_expression'],binding_status:'planned'}],
    scenes:{preview:[{zone_id:'preview-light',effect:'solid',color:'#808080',brightness:20}]},
    expressions:{},mappings:[],fallback_scene:'preview',non_actuating:true,preview_only:true};
}
