'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ChangeEvent } from 'react';
import {
  ArrowLeft, CircleDot, Download, Lightbulb, Plus, RotateCcw,
  ShieldCheck, Sparkles, SlidersHorizontal, Volume2, Upload, Eye,
} from 'lucide-react';
import './visual-effects-studio.css';
import { DEMO_EXPRESSION, EyeScreen, ExpressiveEyesStudio, validExpression } from './expressive-eyes';
import type { EyeExpression } from './expressive-eyes';
import { ExpressionCatalogManager } from './expression-catalog-manager';
import { EyeCompositionPreview } from './eye-composition-preview';
import { createEmptyDraft,validCompleteDraft,validKey,type StudioProfile,type Zone,type LightEffect,type LightTarget,type EyeTarget,type Target } from '@/lib/visual-studio-profile';
import { validPreviewRobot,parseVisualJson } from '@/lib/visual-json';
import { VisualStatusPreview } from './visual-status-preview';

const EYE_SERVICES = new Set(['boot','connecting','input_accepted','transcribing','awaiting_user','no_input','link_lost','rest']);
const EYE_MAIN = new Set(['idle','listening','thinking','speaking','error','off']);
const EXPRESSIVE_ZONE:Zone={id:'preview-eyes',label:'Occhi virtuali',adapter_id:null,capabilities:['eye_expression'],binding_status:'planned'};

function isLightTarget(target: Target): target is LightTarget {
  return target.effect !== 'eye_expression';
}
function sceneColor(target: LightTarget | undefined): string {
  return target?.brightness === 0 ? '#293442' : (target?.color ?? '#293442');
}
export function VisualEffectsStudio() {
  const [robotId,setRobotId]=useState('preview-demo');
  const [candidate,setCandidate]=useState('preview-demo');
  const [error,setError]=useState('');
  function selectScope(){
    if(!validPreviewRobot(candidate)){setError('Identificatore non valido.');return;}
    if(candidate===robotId)return;
    if(!window.confirm('Cambiare profilo? Esporta prima le bozze non salvate. Nessun dispositivo sarà modificato.'))return;
    setRobotId(candidate);setError('');
  }
  return <><div className="border-b border-line bg-[#0d1721] px-5 py-4">
    <div className="mx-auto flex max-w-[1560px] flex-wrap items-end gap-3">
      <label className="text-xs text-slate-300">Ambito anteprima (ID dichiarato, non autenticato)
        <input value={candidate} maxLength={80} onChange={e=>setCandidate(e.target.value)} className="mt-2 block rounded-lg border border-line bg-[#111e2b] p-2 text-sm" />
      </label>
      <button type="button" onClick={selectScope} className="rounded-lg border border-mint/30 px-4 py-2 text-xs text-mint">Apri profilo</button>
      <span className="text-xs text-muted">Nessuna connessione al robot · import/export esplicito</span>
      {error&&<span role="alert" className="text-xs text-amber">{error}</span>}
    </div>
  </div><StudioWorkspace key={robotId} robotId={robotId}/></>;
}

function StudioWorkspace({robotId}:{robotId:string}) {
  const [profile,setProfile]=useState<StudioProfile>(()=>createEmptyDraft(robotId));
  const [ruleIndex,setRuleIndex]=useState(0);
  const [overrideScene,setOverrideScene]=useState<string|null>(null);
  const importFileRef=useRef<HTMLInputElement>(null);
  const revision=useRef(0);
  const [message,setMessage]=useState('Bozza sintetica in memoria. Importa un profilo esplicito o crea una ricetta.');
  useEffect(()=>()=>{revision.current+=1;},[]);

  const selectedRule = profile.mappings[ruleIndex] ?? profile.mappings[0];
  const activeScene = overrideScene && profile.scenes[overrideScene] ? overrideScene :
    (selectedRule && Object.hasOwn(profile.scenes,selectedRule.scene) ? selectedRule.scene : profile.fallback_scene);
  const targets = profile.scenes[activeScene] ?? [];
  const face = targets.find(isLightTarget); // first light target only, not hardware discovery
  const eyesTarget = targets.find((target): target is EyeTarget => target.effect === 'eye_expression');
  const activeEyeExpression = eyesTarget ? profile.expressions[eyesTarget.expression_id] : undefined;
  const activeEffects = targets.map(target => target.effect);
  const ringStyle = { '--ve-color': sceneColor(face), opacity: face ? face.brightness / 100 : 0 } as CSSProperties;

  const replaceTargets = (next: Target[]) => setProfile(p => ({ ...p, scenes: { ...p.scenes, [activeScene]: next } }));

  function updateLightTarget(zoneId: string, patch: Partial<LightTarget>) {
    replaceTargets(targets.map(item => item.zone_id === zoneId && isLightTarget(item) ?
      { ...item, ...patch } : item));
  }
  function chooseExpression(zoneId: string, expressionId: string) {
    if (!Object.hasOwn(profile.expressions,expressionId)) return;
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
      const zone=profile.zones.find(z=>z.id===zoneId);
      if(!zone)return;
      const light=zone.capabilities.find((e):e is LightEffect=>e!=='eye_expression');
      if (!light && zone.capabilities.includes('eye_expression')) {
        const expressionId = Object.keys(profile.expressions)[0];
        if (!expressionId) {
          setMessage('Crea prima un’espressione nell’editor degli occhi, poi associane la zona.');
          return;
        }
        replaceTargets([...targets, { zone_id: zoneId, effect: 'eye_expression', expression_id: expressionId }]);
      } else {
        if(light)replaceTargets([...targets, { zone_id: zoneId, effect: light, color: '#808080', brightness: 20 }]);
      }
    }
  }

  function stageExpressionInScene(expression: EyeExpression) {
    if (!validExpression(expression)) {
      setMessage('Ricetta espressiva non valida: nessuna modifica alla bozza.');
      return;
    }
    if (!Object.hasOwn(profile.expressions,expression.expression_id) && Object.keys(profile.expressions).length >= 32) {
      setMessage('Catalogo pieno (massimo 32 espressioni per questa bozza).');
      return;
    }
    const eyeZone=profile.zones.find(z=>z.capabilities.includes('eye_expression'));
    if(!eyeZone && (profile.zones.length>=32 || profile.zones.some(z=>z.id===EXPRESSIVE_ZONE.id))){setMessage('Serve una zona occhi compatibile.');return;}
    const zone=eyeZone??EXPRESSIVE_ZONE;
    const previous = profile.expressions[expression.expression_id];
    if (previous && JSON.stringify(previous) !== JSON.stringify(expression) &&
        !window.confirm('Esiste già ' + expression.expression_id + '. Sostituire la ricetta nella bozza? Le scene che la referenziano cambieranno in anteprima.')) return;
    setProfile(current => {
      const sceneTargets = current.scenes[activeScene] ?? [];
      const newEyeTarget: EyeTarget = {
        zone_id: zone.id, effect: 'eye_expression',
        expression_id: expression.expression_id,
      };
      const nextScene = sceneTargets.some(t => t.zone_id === zone.id)
        ? sceneTargets.map(t => t.zone_id === zone.id ? newEyeTarget : t)
        : [...sceneTargets, newEyeTarget];
      return {
        ...current,
        expressions: { ...current.expressions, [expression.expression_id]: expression },
        zones: current.zones.some(z => z.id === zone.id) ? current.zones : [...current.zones, zone],
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
    if (!validKey(name) || Object.hasOwn(profile.scenes,name)) {
      setMessage('Identificatore non valido oppure scena già presente.');
      return;
    }
    if (Object.keys(profile.scenes).length >= 64) return;
    // Copy the selected scene, including its declared capabilities; no invented zone.
    setProfile(p=>({...p,scenes:{...p.scenes,[name]:targets.map(t=>({...t}))}}));
    setOverrideScene(name);
    setMessage('Nuova scena creata nella bozza locale.');
  }

  function addMapping() {
    const source = window.prompt('Sorgente dell’evento (es. vision, voice, system):', 'vision');
    if (source === null) return;
    const event = window.prompt('Nome evento (es. person.detected):', 'person.detected');
    if (event === null) return;
    if (!validKey(source) || !/^[a-z][a-z0-9._-]{0,99}$/.test(event)) {
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

  function reset(){
    if(!window.confirm('Ripristinare soltanto la bozza in memoria? Esporta prima eventuali modifiche.'))return;
    revision.current+=1;
    setProfile(createEmptyDraft(robotId));setRuleIndex(0);setOverrideScene(null);
    setMessage('Bozza sintetica ripristinata. Nessun archivio esistente è stato cancellato.');
  }

  async function importDraftFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const request=++revision.current;
    if (file.size > 128 * 1024 || file.size === 0) {
      setMessage('Import rifiutato: file JSON vuoto o oltre 128 KiB.'); return;
    }
    try {
      const raw=await file.text();
      if(request!==revision.current)return;
      const parsed:unknown=parseVisualJson(raw,128*1024);
      if (!validCompleteDraft(parsed) || parsed.robot_id !== profile.robot_id) {
        setMessage('Import rifiutato: contratto non valido o profilo destinato a un altro robot.'); return;
      }
      if (!window.confirm('Sostituire la bozza locale di ' + profile.robot_id +
        ' con il file selezionato? Esporta prima eventuali modifiche. Non si modifica il robot.')) return;
      setProfile(parsed);
      setRuleIndex(0);
      setOverrideScene(null);
      setMessage('Profilo JSON importato nella bozza di ' + profile.robot_id + '. Nessuna modifica a servizi o dispositivi.');
    } catch {
      if(request!==revision.current)return;
      setMessage('Impossibile leggere il JSON: nessuna modifica alla bozza.');
    }
  }

  function exportDraft() {
    if(!validCompleteDraft(profile)){setMessage('Bozza non valida: correggi prima di esportare.');return;}
    const data = JSON.stringify(profile, null, 2) + '\n';
    if(new TextEncoder().encode(data).length>128*1024){setMessage('Bozza oltre 128 KiB.');return;}
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'openrgd-visual-studio-' + profile.robot_id + '.preview.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage('Bozza JSON esportata. Non è stata applicata al robot.');
  }

  const shadow = face && face.brightness>0 ? '0 0 33px ' + sceneColor(face) + '66' : 'none';
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
          <a href="#expression-catalog" className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-mint hover:underline">
            Apri Expression Catalog Manager (snapshot locali) →
          </a>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={reset} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2.5 text-xs text-slate-300 hover:bg-white/5"><RotateCcw size={15} /> Ripristina</button>
          <button type="button" onClick={exportDraft} className="flex items-center gap-2 rounded-lg border border-mint/30 bg-mint/10 px-4 py-2.5 text-xs font-semibold text-mint hover:bg-mint/20"><Download size={15} /> Esporta bozza JSON</button>
        </div>
      </div>

      <div className="mb-7 grid gap-3 sm:grid-cols-3">
        <div className="panel p-4"><label className="eyebrow" htmlFor="visual-preview-robot">ROBOT / PROFILO</label>
          <div id="visual-preview-robot" className="mt-2 break-all font-mono text-sm">{robotId}</div>
          <p className="mt-1 text-[11px] text-muted">Bozza in memoria, non configurazione attiva.</p></div>
        <div className="panel p-4"><div className="eyebrow">REGOLE D'EVENTO</div><div className="mt-2 text-xl font-semibold">{profile.mappings.length}</div></div>
        <div className="panel p-4"><div className="eyebrow">ZONE &amp; REPERTORIO</div><div className="mt-2 text-xl font-semibold">{profile.zones.length} <span className="text-xs font-normal text-muted">zone · {Object.keys(profile.expressions).length} espressioni in bozza</span></div></div>
      </div>


      <section className="panel mb-7 overflow-hidden" aria-label="Repertorio Occhi e profili locali">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold"><Eye size={17} className="text-mint"/> Profili e repertori · import esplicito</h2>
            <p className="mt-1 text-[11px] text-muted">Il catalogo appartiene al profilo scelto. Nessun preset di macchina incorporato.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => importFileRef.current?.click()} className="rounded-lg border border-line px-3 py-2 text-xs text-slate-200 hover:bg-white/5">
              <Upload size={14} className="mr-1 inline"/> Importa profilo JSON OpenRGD
            </button>
            <input ref={importFileRef} type="file" accept=".json,application/json" className="sr-only"
              aria-label="Scegli profilo Visual Studio JSON" onChange={importDraftFile}/>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-[11px] text-muted">
          <p>Il repertorio universale appartiene a rgd-visual-feedback: esporta un profilo con eye_pack_preview.py --robot-id {robotId}, oppure importa un profilo candidato dalla repository dell’istanza. Esporta le bozze prima di sostituirle. Nessun salvataggio automatico del profilo.</p>
          <a href="https://github.com/OpenRGD/rgd-visual-feedback" target="_blank" rel="noopener noreferrer" className="shrink-0 font-semibold text-mint hover:underline">Owner Visual ↗</a>
        </div>
      </section>

      {Object.keys(profile.expressions).length > 0 && <section className="panel mb-7 p-5" aria-label="Catalogo rapido espressioni occhi">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="text-sm font-semibold">Sfoglia le espressioni</h2>
            <p className="mt-1 text-xs text-muted">Seleziona una scena per vederla nel simulatore, poi apri l'editor per modificarla e associarla alla bozza.</p></div>
          <a href="#eye-expression-editor" className="text-xs font-semibold text-mint hover:underline">Apri editor occhi ↓</a>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Object.entries(profile.scenes).flatMap(([name, sceneTargets]) => {
            const eyeTarget = sceneTargets.find((t): t is EyeTarget => t.effect === 'eye_expression');
            const expr = eyeTarget ? profile.expressions[eyeTarget.expression_id] : undefined;
            return expr ? [{ name, expr }] : [];
          }).map(({ name, expr }) =>
            <button key={name} type="button" onClick={() => setOverrideScene(name)} aria-pressed={activeScene === name}
              className={'rounded-xl border px-3 py-3 text-left transition-colors ' + (activeScene === name ? 'border-mint/50 bg-mint/10' : 'border-line bg-[#101b26] hover:border-slate-500')}>
              <span className="flex items-center gap-2 text-xs font-semibold text-slate-100">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: expr.palette.iris }}/>
                {expr.label}
              </span>
              <span className="mt-1 block font-mono text-[10px] text-muted">{name}</span>
              <span className="mt-2 block text-[10px] text-slate-400">
                {EYE_MAIN.has(name) ? 'Stato operativo' : EYE_SERVICES.has(name) ? 'Servizio' : 'Espressione'} · {(expr.duration_ms / 1000).toFixed(1)} s
              </span>
            </button>)}
        </div>
      </section>}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(270px,.95fr)_minmax(360px,1.1fr)_minmax(310px,.95fr)]">
        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-line p-5"><div><h2 className="text-sm font-semibold">1 · Trigger &amp; matching</h2><p className="mt-1 text-xs text-muted">Selezione manuale di una regola · non esecuzione del matching</p></div><Volume2 className="text-mint" size={19}/></div>
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
              <select className="mt-2 w-full rounded-xl border border-line bg-[#111e2b] p-3 text-sm text-white outline-none focus:border-mint" disabled={!selectedRule} value={selectedRule?.scene ?? profile.fallback_scene} onChange={e => setRuleScene(e.target.value)}>
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
                          {zone.capabilities.filter(effect=>effect!=='eye_expression').map(effect =>
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
              <div className={'ve-ring ve-' + (face?.effect ?? 'solid')} style={{ ...ringStyle, boxShadow: shadow }} aria-label={'Prima zona luminosa virtuale ' + activeScene} />
              <div className="ve-ring-center"><CircleDot size={26} className="mx-auto text-slate-500" /><div className="mt-2 text-center text-xs font-semibold text-slate-200">{profile.robot_id}</div><div className="mt-1 text-center font-mono text-[10px] text-muted">VIRTUAL OUTPUT</div></div>
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

      <div id="eye-expression-editor" className="mt-8 scroll-mt-6"><ExpressiveEyesStudio key={profile.robot_id}
        targetRobotId={profile.robot_id} stageInScene={stageExpressionInScene}
        selectedSceneExpression={activeEyeExpression} currentSceneLabel={activeScene}/></div>
      <div className="mt-8"><ExpressionCatalogManager key={profile.robot_id} robotId={profile.robot_id}/></div>
      <div className="mt-8"><EyeCompositionPreview key={profile.robot_id} robotId={profile.robot_id}/></div>
      <div className="mt-8"><VisualStatusPreview/></div>
      <p role="status" className="mt-6 text-xs text-slate-400">{message}</p>
      <div className="mt-8 rounded-xl border border-line bg-[#0e1823] p-5 text-xs leading-6 text-muted">
        <p className="mb-1 flex items-center gap-2 font-semibold text-mint"><ShieldCheck size={15}/> Confine architetturale</p>
        <p>Questo Studio è un editor locale di profili candidati. La distribuzione su un robot richiederà validazione del contratto, autorizzazione esplicita, controllo capacità e un host adapter separato. La Console non apre dispositivi, non controlla i motori e non certifica la luce emessa.</p>
      </div>
    </main>
  </div>;
}
