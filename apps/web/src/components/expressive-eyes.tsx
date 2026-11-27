'use client';

import { useEffect, useId, useState } from 'react';
import type { CSSProperties } from 'react';
import { BrainCircuit, CheckCircle2, Download, Eye, Plus, RotateCcw, ShieldAlert, Sparkles } from 'lucide-react';
import './expressive-eyes.css';

import { DEMO_EXPRESSION, DEMO_PROPOSAL, validExpression, validProposal, type EyeParams, type EyeExpression } from '@/lib/visual-expression';
import { parseVisualJson } from '@/lib/visual-json';
export { DEMO_EXPRESSION, validExpression } from '@/lib/visual-expression';
export type { EyeExpression, EyeParams } from '@/lib/visual-expression';

const SAVE_KEY = 'openrgd.visual.eyes.operator-drafts.v0.1';
export function EyeScreen({ eye, side, expression, blink }: {
  eye: EyeParams; side: 'left' | 'right'; expression: EyeExpression; blink: boolean;
}) {
  const cy = 83;
  const ry = 13 + (blink ? .12 : eye.openness) * 34;
  const pupilR = 16 * eye.pupil_scale;
  const x = 105 + eye.gaze_x * 30;
  const y = cy + eye.gaze_y * 24;
  const clipId = 've-eye-clip-' + side + '-' + useId().replace(/:/g, '_');
  const moving = expression.animation.mode === 'scan' ? 've-iris-scan' : expression.animation.mode === 'breathe' ? 've-iris-breathe' : '';
  return <div className="ve-expressive-screen">
    <div className="ve-expressive-screen-tag">DISPLAY {side === 'left' ? 'SINISTRO' : 'DESTRO'} · SIMULATO</div>
    <svg viewBox="0 0 210 155" role="img" aria-label={'Anteprima occhio ' + (side === 'left' ? 'sinistro' : 'destro') + ' per ' + expression.label}>
      <defs><clipPath id={clipId}><ellipse cx="105" cy={cy} rx="75" ry={ry}/></clipPath></defs>
      <rect width="210" height="155" rx="15" fill={expression.palette.background}/>
      <line x1="45" y1={39 + eye.brow_tilt_deg * .45} x2="165" y2={39 - eye.brow_tilt_deg * .45}
        stroke={expression.palette.accent} strokeWidth="5" strokeLinecap="round"/>
      <ellipse cx="105" cy={cy} rx="75" ry={ry} fill="#cbd8db" stroke={expression.palette.accent} strokeWidth="3"/>
      <g clipPath={'url(#' + clipId + ')'}>
        <g className={moving}>
          <circle cx={x} cy={y} r={pupilR + 5} fill="#173642"/>
          <circle cx={x} cy={y} r={pupilR} fill={expression.palette.iris}/>
          <circle cx={x + 1} cy={y + 1} r={Math.max(6, pupilR * .51)} fill="#07111d"/>
          <circle cx={x - pupilR * .35} cy={y - pupilR * .36} r="4.2" fill="#ffffff" opacity=".86"/>
        </g>
      </g>
      <ellipse cx="105" cy={cy} rx="75" ry={ry} fill="none" stroke={expression.palette.accent} strokeWidth="3"/>
    </svg>
  </div>;
}

function RangeControl({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void;
}) {
  return <label className="block text-[11px] text-slate-400">
    <span className="mb-2 flex items-center justify-between gap-3"><span>{label}</span><span className="font-mono text-slate-200">{value.toFixed(2)}</span></span>
    <input className="w-full accent-emerald-400" type="range" min={min} max={max} step={step}
      value={value} onChange={e => onChange(Number(e.target.value))}/>
  </label>;
}

export function ExpressiveEyesStudio({ stageInScene, currentSceneLabel, targetRobotId, selectedSceneExpression }: {
  stageInScene?: (expression: EyeExpression) => void;
  currentSceneLabel?: string;
  targetRobotId: string;
  selectedSceneExpression?: EyeExpression;
}) {
  const [current, setCurrent] = useState<EyeExpression>(DEMO_EXPRESSION);
  const [proposalRobotId, setProposalRobotId] = useState<string | null>(targetRobotId);
  const [proposalJson, setProposalJson] = useState(JSON.stringify({ ...DEMO_PROPOSAL, robot_id: targetRobotId }, null, 2));
  const [previewSource, setPreviewSource] = useState('Esempio sintetico · nessun Cognitive System collegato');
  const [saved, setSaved] = useState<EyeExpression[]>([]);
  const [message, setMessage] = useState('I due schermi sono esclusivamente una simulazione.');
  const [blink, setBlink] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVE_KEY + '.' + targetRobotId);
      const parsed: unknown = raw ? parseVisualJson(raw, 128 * 1024) : [];
      if (Array.isArray(parsed)) setSaved(parsed.filter(validExpression).slice(0, 24));
    } catch { /* Corrupted local drafts do not affect the robot. */ }
  }, []);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduced.matches) return;
    let timer: number;
    let closeTimer: number | undefined;
    const schedule = () => {
      timer = window.setTimeout(() => {
        setBlink(true);
        closeTimer = window.setTimeout(() => { setBlink(false); schedule(); }, current.animation.blink_duration_ms);
      }, current.animation.blink_interval_ms);
    };
    schedule();
    return () => { window.clearTimeout(timer); if (closeTimer !== undefined) window.clearTimeout(closeTimer); setBlink(false); };
  }, [current.animation.blink_interval_ms, current.animation.blink_duration_ms]);

  function changeEye(side: 'left' | 'right', key: keyof EyeParams, value: number) {
    setCurrent(v => ({ ...v, eyes: {
      ...v.eyes, [side]: { ...v.eyes[side], [key]: value },
    }}));
  }
  function editBothEyes(key: keyof EyeParams, value: number) {
    setCurrent(v => ({ ...v, eyes: {
      left: { ...v.eyes.left, [key]: value },
      right: { ...v.eyes.right, [key]: value },
    }}));
  }
  function reset() {
    setCurrent(DEMO_EXPRESSION);
    setProposalRobotId(targetRobotId);
    setProposalJson(JSON.stringify({ ...DEMO_PROPOSAL, robot_id: targetRobotId }, null, 2));
    setPreviewSource('Esempio sintetico · nessun Cognitive System collegato');
    setMessage('Anteprima ripristinata: nessun effetto sul robot.');
  }
  function importProposal() {
    if (proposalJson.length > 12 * 1024) { setMessage('Proposta oltre 12 KiB: rifiutata.'); return; }
    try {
      const input: unknown = parseVisualJson(proposalJson, 12 * 1024);
      if (!validProposal(input) || input.robot_id !== targetRobotId) throw new Error('Proposta non valida o destinata a un altro profilo.');
      const proposal = input;
      setCurrent(proposal.expression);
      setProposalRobotId(proposal.robot_id);
      setPreviewSource('Proposta simulata ' + proposal.proposal_id.slice(0, 8) + ' · ' + proposal.source_module);
      setMessage(proposal.robot_id === targetRobotId
        ? 'Proposta accettata soltanto in anteprima. Nessun preset registrato o display comandato.'
        : 'Proposta visibile in anteprima, ma destinata a ' + proposal.robot_id + '. Non può essere associata al profilo ' + targetRobotId + '.');
    } catch (err) {
      setMessage('Proposta rifiutata: JSON o ambito robot non valido.');
    }
  }
  function loadExpressionFromScene() {
    if (!selectedSceneExpression || !validExpression(selectedSceneExpression)) return;
    if (!window.confirm('Caricare la ricetta della scena corrente nell’editor? Eventuali modifiche non salvate in questa anteprima saranno perse.')) return;
    setCurrent(selectedSceneExpression);
    setProposalRobotId(selectedSceneExpression.origin === 'cognitive_proposal' ? targetRobotId : null);
    setPreviewSource('Catalogo scene locale · ' + targetRobotId);
    setMessage('Ricetta caricata nell’editor; il profilo della scena non cambia finché non premi Associa alla scena.');
  }
  function createOperatorExpression() {
    setCurrent(v => ({ ...v, origin: 'operator', expression_id: 'nuova_espressione', label: 'Nuova espressione' }));
    setProposalRobotId(null);
    setPreviewSource('Bozza manuale operatore');
    setMessage('Modifica nome, sguardo e palette per definire una nuova espressione.');
  }
  function saveLocalDraft() {
    if (!validExpression(current)) { setMessage('Correggi prima identificatore e parametri: non sono validi.'); return; }
    if (current.origin === 'cognitive_proposal' && proposalRobotId !== targetRobotId) {
      setMessage('La proposta cognitiva è destinata a ' + (proposalRobotId ?? 'un robot sconosciuto') + '. Seleziona il robot corretto prima di archiviare la bozza.');
      return;
    }
    if (!window.confirm('Salvare una bozza nel browser? Non sarà attivata sul robot, né approvata per l’hardware.')) return;
    const items = [current, ...saved.filter(item => item.expression_id !== current.expression_id)].slice(0, 24);
    try {
      localStorage.setItem(SAVE_KEY + '.' + targetRobotId, JSON.stringify(items));
      setSaved(items);
      setMessage('Bozza salvata SOLO in questo browser. La pubblicazione nel catalogo del robot resta separata.');
    } catch { setMessage('Memorizzazione locale non disponibile. Nessun dispositivo è stato modificato.'); }
  }
  function exportExpression() {
    if (!validExpression(current)) { setMessage('Definizione non valida.'); return; }
    const data = new Blob([JSON.stringify(current, null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(data);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'openrgd-expression-' + current.expression_id + '.preview.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage('Definizione esportata per revisione; non distribuita.');
  }

  const isValid = validExpression(current);
  const boxStyle = { '--ve-ring-accent': current.palette.accent } as CSSProperties;
  return <section className="panel overflow-hidden" aria-label="Studio espressivo occhi">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-5 sm:p-6">
      <div>
        <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.16em] text-mint"><Eye size={15}/> Visual Studio · Espressioni / mini display</div>
        <h2 className="text-lg font-semibold text-white">Eye Renderer · Emotional Expressions</h2>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">Una nuova emozione visiva è un nome libero con una ricetta dichiarativa: due occhi, palette, movimento e durata. Nessun modello cognitivo sta scrivendo su questa pagina.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <span className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-1.5 text-[10px] font-semibold text-amber-200">SIMULAZIONE · NO HARDWARE</span>
        <span className="rounded-lg border border-line px-2.5 py-1.5 text-[10px] text-slate-300">Emozione rappresentata, non provata</span>
      </div>
    </div>
    <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1.12fr)_minmax(340px,.88fr)] sm:p-6">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] text-muted">ESPRESSIONE VISIVA · {current.origin.toUpperCase()}</div>
            <div className="mt-1 text-xl font-semibold">{current.label}</div>
            <div className="mt-1 font-mono text-[11px] text-mint">{current.expression_id}</div>
          </div>
          <div className="flex gap-2">
            <button onClick={createOperatorExpression} type="button" className="flex items-center gap-1.5 rounded-lg border border-mint/30 bg-mint/10 px-3 py-2 text-xs text-mint"><Plus size={14}/> Nuova</button>
            {selectedSceneExpression && <button onClick={loadExpressionFromScene} type="button" className="rounded-lg border border-line px-3 py-2 text-xs text-slate-300">Carica dalla scena</button>}
            <button onClick={reset} type="button" className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs"><RotateCcw size={14}/> Reset</button>
          </div>
        </div>
        <div className="ve-expressive-pair" style={boxStyle}>
          <EyeScreen eye={current.eyes.left} side="left" expression={current} blink={blink}/>
          <EyeScreen eye={current.eyes.right} side="right" expression={current} blink={blink}/>
        </div>
        <div className="grid gap-2 rounded-xl border border-line bg-[#0c1824] p-4 sm:grid-cols-3">
          <div><div className="text-[10px] text-muted">VALENZA</div><div className="mt-1 font-mono text-sm">{current.affect.valence.toFixed(2)}</div></div>
          <div><div className="text-[10px] text-muted">ATTIVAZIONE</div><div className="mt-1 font-mono text-sm">{current.affect.arousal.toFixed(2)}</div></div>
          <div><div className="text-[10px] text-muted">INTENSITÀ</div><div className="mt-1 font-mono text-sm">{current.affect.intensity.toFixed(2)}</div></div>
          <div className="col-span-full mt-2 text-[11px] text-slate-400">Durata proposta: {(current.duration_ms / 1000).toFixed(1)} s · Animazione: {current.animation.mode} · LED accent: {current.palette.accent}</div>
        </div>
        <div className="rounded-xl border border-line p-4">
          <h3 className="mb-4 text-xs font-semibold">Modifica espressione (bozza)</h3>
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <label className="text-[11px] text-muted">Nome
              <input className="mt-1 w-full rounded-lg border border-line bg-[#101c28] p-2 text-xs text-white" maxLength={64}
                value={current.label} onChange={e => setCurrent(v => ({ ...v, label: e.target.value }))}/>
            </label>
            <label className="text-[11px] text-muted">ID aperto a nuove emozioni
              <input className="mt-1 w-full rounded-lg border border-line bg-[#101c28] p-2 font-mono text-xs text-white" maxLength={48}
                value={current.expression_id} onChange={e => setCurrent(v => ({ ...v, expression_id: e.target.value }))}/>
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <RangeControl label="Apertura occhio sinistro" value={current.eyes.left.openness} min={.12} max={1} step={.01} onChange={v => changeEye('left', 'openness', v)}/>
            <RangeControl label="Apertura occhio destro" value={current.eyes.right.openness} min={.12} max={1} step={.01} onChange={v => changeEye('right', 'openness', v)}/>
            <RangeControl label="Sguardo orizzontale (entrambi)" value={current.eyes.left.gaze_x} min={-.6} max={.6} step={.02} onChange={v => editBothEyes('gaze_x', v)}/>
            <RangeControl label="Sguardo verticale (entrambi)" value={current.eyes.left.gaze_y} min={-.6} max={.6} step={.02} onChange={v => editBothEyes('gaze_y', v)}/>
            <RangeControl label="Dimensione pupilla" value={current.eyes.left.pupil_scale} min={.6} max={1.4} step={.02} onChange={v => editBothEyes('pupil_scale', v)}/>
            <RangeControl label="Sopracciglio sinistro" value={current.eyes.left.brow_tilt_deg} min={-20} max={20} step={1} onChange={v => changeEye('left', 'brow_tilt_deg', v)}/>
            <RangeControl label="Sopracciglio destro" value={current.eyes.right.brow_tilt_deg} min={-20} max={20} step={1} onChange={v => changeEye('right', 'brow_tilt_deg', v)}/>
            <RangeControl label="Valenza espressiva" value={current.affect.valence} min={-1} max={1} step={.02} onChange={v => setCurrent(p => ({ ...p, affect: { ...p.affect, valence: v } }))}/>
            <RangeControl label="Attivazione espressiva" value={current.affect.arousal} min={0} max={1} step={.02} onChange={v => setCurrent(p => ({ ...p, affect: { ...p.affect, arousal: v } }))}/>
            <RangeControl label="Intensità espressiva" value={current.affect.intensity} min={0} max={1} step={.02} onChange={v => setCurrent(p => ({ ...p, affect: { ...p.affect, intensity: v } }))}/>
            <RangeControl label="Intervallo battito (s)" value={current.animation.blink_interval_ms / 1000} min={2.5} max={12} step={.5} onChange={v => setCurrent(p => ({ ...p, animation: { ...p.animation, blink_interval_ms: Math.round(v * 1000) } }))}/>
            <label className="text-[11px] text-muted">Movimento virtuale
              <select className="mt-2 block h-8 w-full rounded-lg border border-line bg-[#101c28] text-xs text-white"
                value={current.animation.mode} onChange={e => setCurrent(p => ({ ...p, animation: { ...p.animation, mode: e.target.value as EyeExpression['animation']['mode'] } }))}>
                <option value="still">Statico</option><option value="breathe">Respirazione lenta</option><option value="scan">Esplorazione lenta</option>
              </select>
            </label>
            <RangeControl label="Luminosità LED simulata" value={current.palette.ring_brightness_pct} min={0} max={40} step={1} onChange={v => setCurrent(p => ({ ...p, palette: { ...p.palette, ring_brightness_pct: v } }))}/>
            <RangeControl label="Durata (secondi)" value={current.duration_ms / 1000} min={.5} max={12} step={.5} onChange={v => setCurrent(p => ({ ...p, duration_ms: Math.round(v * 1000) }))}/>
            <label className="text-[11px] text-muted">Colore iride
              <input aria-label="Colore iride" type="color" className="mt-1 h-8 w-full" value={current.palette.iris} onChange={e => setCurrent(p => ({ ...p, palette: { ...p.palette, iris: e.target.value.toUpperCase() } }))}/>
            </label>
            <label className="text-[11px] text-muted">Colore accento
              <input aria-label="Colore accento" type="color" className="mt-1 h-8 w-full" value={current.palette.accent} onChange={e => setCurrent(p => ({ ...p, palette: { ...p.palette, accent: e.target.value.toUpperCase() } }))}/>
            </label>
          </div>
          <p className="mt-3 text-[10px] leading-5 text-muted">Valenza, attivazione e intensità sono coordinate della rappresentazione, non misure di uno stato emotivo interno. La geometria degli occhi rimane modificabile separatamente.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={saveLocalDraft} disabled={!isValid} className="rounded-lg border border-mint/40 bg-mint/10 px-3 py-2 text-xs text-mint disabled:opacity-40"><CheckCircle2 size={14} className="mr-1 inline"/> Salva bozza locale</button>
            <button type="button" onClick={exportExpression} disabled={!isValid} className="rounded-lg border border-line px-3 py-2 text-xs disabled:opacity-40"><Download size={14} className="mr-1 inline"/> Esporta JSON</button>
            {stageInScene && <button type="button" disabled={!isValid}
              onClick={() => {
                if (current.origin === 'cognitive_proposal' && proposalRobotId !== targetRobotId) {
                  setMessage('Questa proposta è destinata a ' + (proposalRobotId ?? 'un robot sconosciuto') + ', non a ' + targetRobotId + '. Passa al profilo corretto.');
                  return;
                }
                if (!window.confirm('Inserire questa espressione nella scena ' + (currentSceneLabel ?? 'corrente') + ' e nella bozza del Visual Studio? Nessun display reale verrà comandato.')) return;
                stageInScene(current);
                setMessage('Espressione proposta alla scena corrente. Verifica il simulatore: nessun hardware è stato comandato.');
              }}
              className="rounded-lg border border-mint/40 bg-mint/10 px-3 py-2 text-xs font-semibold text-mint disabled:opacity-40">
              <Plus size={14} className="mr-1 inline"/> Associa alla scena (bozza)
            </button>}
          </div>
        </div>
      </div>
      <div className="space-y-5">
        <div className="rounded-xl border border-line bg-[#0e1926] p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><BrainCircuit size={18} className="text-mint"/> Cognitive Proposal Sandbox</h3>
          <p className="mt-2 text-xs leading-5 text-muted">Incolla una definizione generata da un futuro Cognitive System, oppure usa l’esempio sintetico. Il parser non esegue codice né chiama dispositivi.</p>
          <label htmlFor="ve-cognitive-json" className="mt-4 block text-[11px] text-muted">Payload JSON candidato</label>
          <textarea id="ve-cognitive-json" spellCheck={false} maxLength={12 * 1024} rows={13}
            value={proposalJson} onChange={e => setProposalJson(e.target.value)}
            className="mt-2 w-full resize-y rounded-lg border border-line bg-[#07111d] p-3 font-mono text-[10px] leading-5 text-slate-300 outline-none focus:border-mint"/>
          <button type="button" onClick={importProposal} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-mint/30 bg-mint/10 px-3 py-2.5 text-xs font-semibold text-mint hover:bg-mint/15">
            <Sparkles size={15}/> Valida e visualizza proposta
          </button>
          <p className="mt-3 text-[10px] leading-5 text-amber-200">Sorgente cognitiva solo dichiarata e non autenticata. Nessuna applicazione automatica, nessuna persistenza senza azione dell’operatore.</p>
        </div>
        <div className="rounded-xl border border-line p-4">
          <div className="mb-3 text-xs font-semibold">Catalogo bozze del browser ({saved.length}/24)</div>
          {saved.length === 0 ? <p className="text-[11px] text-muted">Nessuna espressione salvata. Le proposte cognitive non vengono archiviate automaticamente.</p> :
            <div className="space-y-2">{saved.map(item => <button type="button" key={item.expression_id} onClick={() => { setCurrent(item); setProposalRobotId(targetRobotId); setPreviewSource('Catalogo bozze locale · ' + targetRobotId); }}
              className="flex w-full items-center justify-between rounded-lg border border-line p-2.5 text-left text-xs hover:border-mint/30">
              <span>{item.label}<span className="mt-1 block font-mono text-[10px] text-muted">{item.expression_id}</span></span>
              <span className="text-[10px] text-muted">{item.origin === 'operator' ? 'OPERATORE' : 'PROPOSTA'}</span>
            </button>)}</div>}
        </div>
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
          <h3 className="flex items-center gap-2 text-xs font-semibold text-amber-200"><ShieldAlert size={17}/> Rendering e governance</h3>
          <p className="mt-2 text-[11px] leading-5 text-slate-300">Anteprima puramente grafica: nessun collegamento agli occhi fisici, al robot o al Cognitive System. Creare un’emozione visiva non equivale ad affermare che il robot la provi.</p>
          <p className="mt-2 text-[10px] leading-5 text-muted">Fonte: {previewSource}. Il renderer su mini display reali richiederà una futura interfaccia PERIPH, sincronizzazione e collaudo.</p>
        </div>
      </div>
    </div>
    <p role="status" className="border-t border-line px-5 py-3 text-xs text-slate-300">{message}</p>
  </section>;
}
