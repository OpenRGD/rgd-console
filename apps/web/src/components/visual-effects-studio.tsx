'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  ArrowLeft, CircleDot, Download, Lightbulb, Plus, RotateCcw,
  ShieldCheck, Sparkles, SlidersHorizontal, Volume2,
} from 'lucide-react';
import './visual-effects-studio.css';
import { DEMO_EXPRESSION, EyeScreen, ExpressiveEyesStudio, validExpression } from './expressive-eyes';
import type { EyeExpression } from './expressive-eyes';

type LightEffect = 'solid' | 'pulse' | 'chase' | 'wave';
type Effect = LightEffect | 'eye_expression';
type Binding = 'operator_reported' | 'planned';
type Zone = { id: string; label: string; adapter_id: string | null; capabilities: Effect[]; binding_status: Binding };
type LightTarget = { zone_id: string; effect: LightEffect; color: string; brightness: number };
type EyeTarget = { zone_id: string; effect: 'eye_expression'; expression_id: string };
type Target = LightTarget | EyeTarget;
type Mapping = { source: string; event: string; scene: string; priority: number };
type StudioProfile = {
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
type LegacyProfile = Omit<StudioProfile, 'schema_version' | 'expressions'> & {
  schema_version: 'openrgd.visual-studio.profile.v0.1-candidate';
};

const STORAGE_KEY = 'openrgd.visual-studio.preview.v0.2';
const OLD_STORAGE_KEY = 'openrgd.visual-studio.preview.v0.1';
const EXPRESSIVE_ZONE: Zone = {
  id: 'expressive-eyes', label: 'Occhi · due mini display (futuri)',
  adapter_id: null, capabilities: ['eye_expression'], binding_status: 'planned',
};
const EVENTS = [
  { source: 'voice', event: 'listening.started', scene: 'listening', priority: 50 },
  { source: 'voice', event: 'inference.started', scene: 'thinking', priority: 50 },
  { source: 'voice', event: 'playback.started', scene: 'speaking', priority: 50 },
  { source: 'voice', event: 'playback.ended', scene: 'idle', priority: 50 },
  { source: 'voice', event: 'voice.error', scene: 'error', priority: 90 },
  { source: 'voice', event: 'voice.ready', scene: 'idle', priority: 50 },
  { source: 'system', event: 'operator.welcome', scene: 'welcome', priority: 10 },
] satisfies Mapping[];

const INITIAL: StudioProfile = {
  schema_version: 'openrgd.visual-studio.profile.v0.2-candidate',
  robot_id: 'paky-01',
  revision: 1,
  zones: [
    { id: 'face-ring', label: 'Anello RGB · testa', adapter_id: 'miracles-star-ble', capabilities: ['solid'], binding_status: 'operator_reported' },
    { id: 'room-lights', label: 'Luci ambiente · future', adapter_id: null, capabilities: ['solid', 'pulse'], binding_status: 'planned' },
    EXPRESSIVE_ZONE,
  ],
  scenes: {
    idle: [{ zone_id: 'face-ring', effect: 'solid', color: '#FFFFFF', brightness: 10 }],
    listening: [{ zone_id: 'face-ring', effect: 'solid', color: '#0050FF', brightness: 35 }],
    thinking: [{ zone_id: 'face-ring', effect: 'solid', color: '#9600FF', brightness: 35 }],
    speaking: [{ zone_id: 'face-ring', effect: 'solid', color: '#00FF46', brightness: 35 }],
    error: [{ zone_id: 'face-ring', effect: 'solid', color: '#FF0000', brightness: 30 }],
    off: [{ zone_id: 'face-ring', effect: 'solid', color: '#000000', brightness: 0 }],
    welcome: [
      { zone_id: 'face-ring', effect: 'solid', color: '#40FAD2', brightness: 40 },
      { zone_id: 'room-lights', effect: 'pulse', color: '#40FAD2', brightness: 30 },
      { zone_id: 'expressive-eyes', effect: 'eye_expression', expression_id: DEMO_EXPRESSION.expression_id },
    ],
  },
  expressions: { [DEMO_EXPRESSION.expression_id]: DEMO_EXPRESSION },
  mappings: EVENTS,
  fallback_scene: 'idle',
  non_actuating: true,
  preview_only: true,
};

function isLightTarget(target: Target): target is LightTarget {
  return target.effect !== 'eye_expression';
}
function sceneColor(target: LightTarget | undefined): string {
  return target?.brightness === 0 ? '#293442' : (target?.color ?? '#293442');
}
function validDraftBase(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const c = value as Record<string, unknown>;
  return c.robot_id === INITIAL.robot_id && c.preview_only === true
    && c.non_actuating === true && typeof c.revision === 'number'
    && Number.isSafeInteger(c.revision) && c.revision >= 1
    && Array.isArray(c.zones) && Array.isArray(c.mappings)
    && c.scenes !== null && typeof c.scenes === 'object' && !Array.isArray(c.scenes);
}
function isLegacyDraft(value: unknown): value is LegacyProfile {
  return validDraftBase(value) &&
    value.schema_version === 'openrgd.visual-studio.profile.v0.1-candidate';
}
function isDraft(value: unknown): value is StudioProfile {
  if (!validDraftBase(value) || value.schema_version !== INITIAL.schema_version) return false;
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
          typeof target.expression_id === 'string' && target.expression_id in catalog;
      }
      return ['solid','pulse','chase','wave'].includes(String(target.effect)) &&
        typeof target.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(target.color) &&
        typeof target.brightness === 'number' && Number.isInteger(target.brightness) &&
        target.brightness >= 0 && target.brightness <= 100;
    }));
}
function upgradeLegacyDraft(old: LegacyProfile): StudioProfile {
  // The saved v0.1 user scene/rule data is preserved: no expression is
  // silently assigned. Only a planned zone and empty catalog are added.
  return {
    ...old, schema_version: INITIAL.schema_version,
    zones: old.zones.some(z => z.id === EXPRESSIVE_ZONE.id) ? old.zones : [...old.zones, EXPRESSIVE_ZONE],
    expressions: {},
  };
}

export function VisualEffectsStudio() {
  const [profile, setProfile] = useState<StudioProfile>(INITIAL);
  const [ruleIndex, setRuleIndex] = useState(2);
  const [overrideScene, setOverrideScene] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState('Nessuna luce reale viene comandata.');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (isDraft(parsed)) setProfile(parsed);
      } else {
        const legacy = localStorage.getItem(OLD_STORAGE_KEY);
        if (legacy) {
          const parsed: unknown = JSON.parse(legacy);
          if (isLegacyDraft(parsed)) setProfile(upgradeLegacyDraft(parsed));
        }
      }
    } catch {
      // Invalid local draft never becomes a runtime config.
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(profile)); } catch {
      // Browser storage is optional. Profile can still be exported.
    }
  }, [loaded, profile]);

  const selectedRule = profile.mappings[ruleIndex] ?? profile.mappings[0];
  const activeScene = overrideScene && profile.scenes[overrideScene] ? overrideScene :
    (profile.scenes[selectedRule?.scene] ? selectedRule.scene : profile.fallback_scene);
  const targets = profile.scenes[activeScene] ?? [];
  const face = targets.find((target): target is LightTarget => target.zone_id === 'face-ring' && isLightTarget(target));
  const eyesTarget = targets.find((target): target is EyeTarget => target.effect === 'eye_expression');
  const activeEyeExpression = eyesTarget ? profile.expressions[eyesTarget.expression_id] : undefined;
  const activeEffects = targets.map(target => target.effect);
  const ringStyle = { '--ve-color': sceneColor(face), opacity: face ? Math.max(0.16, face.brightness / 100) : 0.2 } as CSSProperties;

  const replaceTargets = (next: Target[]) => setProfile(p => ({ ...p, scenes: { ...p.scenes, [activeScene]: next } }));

  function updateLightTarget(zoneId: string, patch: Partial<LightTarget>) {
    replaceTargets(targets.map(item => item.zone_id === zoneId && isLightTarget(item) ?
      { ...item, ...patch } : item));
  }
  function chooseExpression(zoneId: string, expressionId: string) {
    if (!(expressionId in profile.expressions)) return;
    replaceTargets(targets.map(item => item.zone_id === zoneId && item.effect === 'eye_expression' ?
      { ...item, expression_id: expressionId } : item));
  }

  function toggleZone(zoneId: string) {
    if (targets.some(target => target.zone_id === zoneId)) {
      if (targets.length <= 1) {
        setMessage('Una scena deve contenere almeno una zona.');
        return;
      }
      replaceTargets(targets.filter(target => target.zone_id !== zoneId));
    } else {
      if (zoneId === EXPRESSIVE_ZONE.id) {
        const expressionId = Object.keys(profile.expressions)[0];
        if (!expressionId) {
          setMessage('Crea prima un’espressione nell’editor degli occhi, poi associane la zona.');
          return;
        }
        replaceTargets([...targets, { zone_id: zoneId, effect: 'eye_expression', expression_id: expressionId }]);
      } else {
        replaceTargets([...targets, { zone_id: zoneId, effect: 'solid', color: '#40FAD2', brightness: 25 }]);
      }
    }
  }

  function stageExpressionInScene(expression: EyeExpression) {
    if (!validExpression(expression)) {
      setMessage('Ricetta espressiva non valida: nessuna modifica alla bozza.');
      return;
    }
    if (!(expression.expression_id in profile.expressions) && Object.keys(profile.expressions).length >= 32) {
      setMessage('Catalogo pieno (massimo 32 espressioni per questa bozza).');
      return;
    }
    const previous = profile.expressions[expression.expression_id];
    if (previous && JSON.stringify(previous) !== JSON.stringify(expression) &&
        !window.confirm('Esiste già ' + expression.expression_id + '. Sostituire la ricetta nella bozza? Le scene che la referenziano cambieranno in anteprima.')) return;
    setProfile(current => {
      const sceneTargets = current.scenes[activeScene] ?? [];
      const newEyeTarget: EyeTarget = {
        zone_id: EXPRESSIVE_ZONE.id, effect: 'eye_expression',
        expression_id: expression.expression_id,
      };
      const nextScene = sceneTargets.some(t => t.zone_id === EXPRESSIVE_ZONE.id)
        ? sceneTargets.map(t => t.zone_id === EXPRESSIVE_ZONE.id ? newEyeTarget : t)
        : [...sceneTargets, newEyeTarget];
      return {
        ...current,
        expressions: { ...current.expressions, [expression.expression_id]: expression },
        zones: current.zones.some(z => z.id === EXPRESSIVE_ZONE.id) ? current.zones : [...current.zones, EXPRESSIVE_ZONE],
        scenes: { ...current.scenes, [activeScene]: nextScene },
      };
    });
    setMessage('Espressione ' + expression.expression_id + ' associata alla scena ' + activeScene + ' SOLO nella bozza. Nessun dispositivo è stato comandato.');
  }

  function setRuleScene(value: string) {
    setProfile(p => ({ ...p, mappings: p.mappings.map((rule, i) => i === ruleIndex ? { ...rule, scene: value } : rule) }));
    setOverrideScene(null);
  }

  function createScene() {
    const name = window.prompt('Identificatore della nuova scena (es. greeting, charging):');
    if (name === null) return;
    if (!/^[a-z][a-z0-9_-]{0,79}$/.test(name) || profile.scenes[name]) {
      setMessage('Identificatore non valido oppure scena già presente.');
      return;
    }
    if (Object.keys(profile.scenes).length >= 64) return;
    setProfile(p => ({ ...p, scenes: { ...p.scenes, [name]: [{ zone_id: 'face-ring', effect: 'solid', color: '#40FAD2', brightness: 25 }] } }));
    setOverrideScene(name);
    setMessage('Nuova scena creata nella bozza locale.');
  }

  function addMapping() {
    const source = window.prompt('Sorgente dell’evento (es. vision, voice, system):', 'vision');
    if (source === null) return;
    const event = window.prompt('Nome evento (es. person.detected):', 'person.detected');
    if (event === null) return;
    if (!/^[a-z][a-z0-9_-]{0,79}$/.test(source) || !/^[a-z][a-z0-9._-]{0,99}$/.test(event)) {
      setMessage('Sorgente o evento non valido. Usa lettere minuscole, numeri, punti, trattini.');
      return;
    }
    if (profile.mappings.some(row => row.source === source && row.event === event && row.priority === 50)) {
      setMessage('È già presente un matching per questo evento e priorità.');
      return;
    }
    if (profile.mappings.length >= 128) return;
    setProfile(p => ({ ...p, mappings: [...p.mappings, { source, event, scene: activeScene, priority: 50 }] }));
    setRuleIndex(profile.mappings.length);
    setOverrideScene(null);
    setMessage('Regola aggiunta alla bozza. Nessun evento esterno è stato sottoscritto.');
  }

  function reset() {
    if (!window.confirm('Ripristinare soltanto la bozza del browser? Nessun dispositivo sarà modificato.')) return;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(OLD_STORAGE_KEY);
    setProfile(INITIAL);
    setRuleIndex(2);
    setOverrideScene(null);
    setMessage('Bozza locale ripristinata.');
  }

  function exportDraft() {
    const data = JSON.stringify({ ...profile, revision: profile.revision + 1 }, null, 2) + '\n';
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'openrgd-visual-studio-' + profile.robot_id + '.preview.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage('Bozza JSON esportata. Non è stata applicata al robot.');
  }

  const shadow = '0 0 33px ' + sceneColor(face) + '66';
  return <div className="min-h-screen bg-canvas text-slate-100">
    <div className="border-b border-line bg-[#0d1721]/95">
      <div className="mx-auto flex max-w-[1560px] flex-wrap items-center justify-between gap-4 px-5 py-5 md:px-10">
        <div className="flex items-center gap-4">
          <Link href="/modules" className="rounded-xl border border-line p-2 text-slate-300 hover:text-mint" aria-label="Torna ai moduli"><ArrowLeft size={19} /></Link>
          <div className="grid h-11 w-11 place-items-center rounded-xl border border-mint/25 bg-mint/10 text-mint"><Sparkles size={23} /></div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[.21em] text-mint">OpenRGD · Studio</div>
            <h1 className="text-xl font-semibold sm:text-2xl">Visual Effects Studio</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-[11px] font-semibold tracking-wide text-amber-200">ANTEPRIMA SIMULATA</span>
          <span className="rounded-full border border-line px-3 py-1.5 text-[11px] text-slate-300"><ShieldCheck size={13} className="mr-1 inline" />Nessun comando hardware</span>
        </div>
      </div>
    </div>

    <main className="mx-auto max-w-[1560px] px-5 py-8 md:px-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">EVENTI → REGOLE → SCENE → OUTPUT</p>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Associa eventi a scene che combinano LED, luci ambientali e occhi espressivi. Le nuove emozioni sono ricette nel catalogo JSON della bozza: non servono modifiche al software del renderer. Nessun dispositivo reale viene controllato.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={reset} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2.5 text-xs text-slate-300 hover:bg-white/5"><RotateCcw size={15} /> Ripristina</button>
          <button type="button" onClick={exportDraft} className="flex items-center gap-2 rounded-lg border border-mint/30 bg-mint/10 px-4 py-2.5 text-xs font-semibold text-mint hover:bg-mint/20"><Download size={15} /> Esporta bozza JSON</button>
        </div>
      </div>

      <div className="mb-7 grid gap-3 sm:grid-cols-3">
        <div className="panel p-4"><div className="eyebrow">ROBOT / PROFILO</div><div className="mt-2 font-semibold">Paky-01 <span className="ml-2 text-xs font-normal text-muted">fixture di esempio</span></div></div>
        <div className="panel p-4"><div className="eyebrow">REGOLE D'EVENTO</div><div className="mt-2 text-xl font-semibold">{profile.mappings.length}</div></div>
        <div className="panel p-4"><div className="eyebrow">ZONE &amp; REPERTORIO</div><div className="mt-2 text-xl font-semibold">{profile.zones.length} <span className="text-xs font-normal text-muted">zone · {Object.keys(profile.expressions).length} espressioni in bozza</span></div></div>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(270px,.95fr)_minmax(360px,1.1fr)_minmax(310px,.95fr)]">
        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-line p-5"><div><h2 className="text-sm font-semibold">1 · Trigger &amp; matching</h2><p className="mt-1 text-xs text-muted">Eventi normalizzati, non dispositivi</p></div><Volume2 className="text-mint" size={19}/></div>
          <div className="max-h-[460px] space-y-1 overflow-auto p-3">
            {profile.mappings.map((rule, index) => <button type="button" key={rule.source + ':' + rule.event + ':' + index} onClick={() => { setRuleIndex(index); setOverrideScene(null); }}
              className={'w-full rounded-xl border p-3 text-left transition ' + (ruleIndex === index ? 'border-mint/30 bg-mint/10' : 'border-transparent hover:bg-white/[.04]')}>
              <div className="flex items-center justify-between gap-2"><span className="font-mono text-[10px] uppercase tracking-wide text-mint">{rule.source}</span><span className="text-[10px] text-muted">P{rule.priority}</span></div>
              <div className="mt-1 break-all text-[13px] font-medium text-slate-100">{rule.event}</div>
              <div className="mt-1 text-[11px] text-slate-400">→ {rule.scene}</div>
            </button>)}
          </div>
          <div className="border-t border-line p-4"><button type="button" onClick={addMapping} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-600 py-3 text-xs text-slate-300 hover:border-mint/50 hover:text-mint"><Plus size={15}/> Aggiungi matching alla bozza</button></div>
        </section>

        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-line p-5"><div><h2 className="text-sm font-semibold">2 · Scene &amp; comportamenti</h2><p className="mt-1 text-xs text-muted">LED, display espressivi e catalogo di ricette</p></div><SlidersHorizontal className="text-mint" size={19}/></div>
          <div className="space-y-5 p-5">
            <label className="block text-xs text-slate-400">Scena assegnata all’evento
              <select className="mt-2 w-full rounded-xl border border-line bg-[#111e2b] p-3 text-sm text-white outline-none focus:border-mint" value={selectedRule?.scene ?? profile.fallback_scene} onChange={e => setRuleScene(e.target.value)}>
                {Object.keys(profile.scenes).map(name => <option value={name} key={name}>{name}</option>)}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">{Object.keys(profile.scenes).map(name => <button type="button" key={name} onClick={() => setOverrideScene(name)}
              className={'rounded-lg border px-2.5 py-1.5 text-[11px] ' + (activeScene === name ? 'border-mint/40 bg-mint/10 text-mint' : 'border-line text-slate-400')}>{name}</button>)}
              <button type="button" onClick={createScene} title="Nuova scena" className="rounded-lg border border-dashed border-line px-2.5 py-1 text-slate-400 hover:text-mint"><Plus size={14}/></button>
            </div>
            {profile.zones.map(zone => {
              const target = targets.find(t => t.zone_id === zone.id);
              return <div key={zone.id} className="rounded-xl border border-line bg-[#101b26] p-4">
                <div className="flex items-center justify-between gap-2">
                  <div><div className="text-[12px] font-semibold">{zone.label}</div><div className="mt-1 text-[10px] text-muted">{zone.binding_status === 'planned' ? 'Zona futura · non collegata' : 'Hardware riferito dall’operatore · non verificato qui'}</div></div>
                  <label className="flex items-center gap-2 text-[11px] text-slate-300"><input type="checkbox" checked={Boolean(target)} onChange={() => toggleZone(zone.id)} /> In scena</label>
                </div>
                {target && (target.effect === 'eye_expression'
                  ? <div className="mt-4 space-y-2">
                      <label className="block text-[11px] text-muted">Ricetta nel catalogo di questa bozza
                        <select value={target.expression_id} onChange={e => chooseExpression(zone.id, e.target.value)}
                          className="mt-2 w-full rounded-lg border border-line bg-[#182636] p-2 text-xs text-white">
                          {Object.values(profile.expressions).map(expr =>
                            <option key={expr.expression_id} value={expr.expression_id}>{expr.label} · {expr.expression_id}</option>)}
                        </select>
                      </label>
                      <p className="text-[11px] text-amber-200">Eye Renderer virtuale. Nessun display fisico collegato.</p>
                      {!zone.capabilities.includes('eye_expression') &&
                        <p className="text-[11px] text-amber-200">La zona non dichiara la capacità `eye_expression`.</p>}
                    </div>
                  : <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label className="text-[11px] text-muted">Colore <input type="color" aria-label={'Colore ' + zone.label} value={target.color}
                        onChange={e => updateLightTarget(zone.id, { color: e.target.value.toUpperCase() })}
                        className="mt-1 block h-10 w-full cursor-pointer rounded-lg border border-line bg-transparent" /></label>
                      <label className="text-[11px] text-muted">Effetto
                        <select value={target.effect} onChange={e => updateLightTarget(zone.id, { effect: e.target.value as LightEffect })}
                          className="mt-1 h-10 w-full rounded-lg border border-line bg-[#182636] px-2 text-xs text-white">
                          {(['solid','pulse','chase','wave'] as const).map(effect =>
                            <option key={effect} value={effect}>{effect}</option>)}
                        </select>
                      </label>
                      <label className="col-span-full text-[11px] text-muted">Luminosità simulata · {target.brightness}%
                        <input type="range" min="0" max="100" value={target.brightness}
                          onChange={e => updateLightTarget(zone.id, { brightness: Number(e.target.value) })}
                          className="mt-2 w-full accent-emerald-400" />
                      </label>
                      {!zone.capabilities.includes(target.effect) &&
                        <p className="col-span-full text-[11px] text-amber-300">Effetto non supportato dalle capacità dichiarate per questa zona: solo anteprima.</p>}
                    </div>)}
              </div>;
            })}
          </div>
        </section>

        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-line p-5"><div><h2 className="text-sm font-semibold">3 · Simulatore</h2><p className="mt-1 text-xs text-muted">Nessun BLE / USB / Wi-Fi attivato</p></div><Lightbulb className="text-mint" size={20}/></div>
          <div className="relative grid min-h-[345px] place-items-center overflow-hidden bg-[radial-gradient(circle_at_center,#152537,#0a121b_68%)] p-10">
            <div className="ve-ring-shell">
              <div className={'ve-ring ve-' + (face?.effect ?? 'solid')} style={{ ...ringStyle, boxShadow: shadow }} aria-label={'Anello virtuale ' + activeScene} />
              <div className="ve-ring-center"><CircleDot size={26} className="mx-auto text-slate-500" /><div className="mt-2 text-center text-xs font-semibold text-slate-200">Paky-01</div><div className="mt-1 text-center font-mono text-[10px] text-muted">VIRTUAL OUTPUT</div></div>
            </div>
          </div>
          {activeEyeExpression
            ? <div className="border-t border-line px-4 py-5">
                <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-mint">Expressive Displays · simulazione</div>
                <div className="ve-expressive-pair">
                  <EyeScreen eye={activeEyeExpression.eyes.left} side="left" expression={activeEyeExpression} blink={false}/>
                  <EyeScreen eye={activeEyeExpression.eyes.right} side="right" expression={activeEyeExpression} blink={false}/>
                </div>
                <p className="mt-3 text-xs font-semibold text-slate-200">{activeEyeExpression.label}</p>
                <p className="mt-1 text-[11px] text-muted">Catalogo: {activeEyeExpression.expression_id} · due display virtuali, nessun dispositivo attivo.</p>
              </div>
            : <div className="border-t border-line px-5 py-4 text-[11px] text-muted">Nessuna espressione per gli occhi è associata a questa scena.</div>}
          <div className="space-y-4 p-5">
            <div><div className="eyebrow">SCENA SIMULATA</div><div className="mt-2 text-lg font-semibold capitalize">{activeScene}</div><p className="mt-1 text-xs text-muted">{targets.length} zona/e nella scena · {activeEffects.join(', ') || 'nessuna'}</p></div>
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs leading-5 text-amber-200">I cambiamenti qui sono soltanto grafici. Non implicano LED connessi, comandi inviati o luce fisicamente osservata.</div>
            <div className="flex flex-wrap gap-2">{targets.map(target => <div key={target.zone_id} className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-[11px]">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: target.effect === 'eye_expression'
                ? (profile.expressions[target.expression_id]?.palette.accent ?? '#526070') : target.color }} />
              {target.zone_id} · {target.effect === 'eye_expression' ? target.expression_id : target.effect}
            </div>)}</div>
          </div>
        </section>
      </div>

      <div className="mt-8"><ExpressiveEyesStudio stageInScene={stageExpressionInScene} currentSceneLabel={activeScene}/></div>
      <p role="status" className="mt-6 text-xs text-slate-400">{message}</p>
      <div className="mt-8 rounded-xl border border-line bg-[#0e1823] p-5 text-xs leading-6 text-muted">
        <p className="mb-1 flex items-center gap-2 font-semibold text-mint"><ShieldCheck size={15}/> Confine architetturale</p>
        <p>Questo Studio è un editor locale di profili candidati. La distribuzione su Paky-01 richiederà validazione del contratto, autorizzazione esplicita, controllo capacità e un host adapter separato. La Console non apre dispositivi, non controlla i motori e non certifica la luce emessa.</p>
      </div>
    </main>
  </div>;
}
