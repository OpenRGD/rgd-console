'use client';

import { useRef, useState } from 'react';
import {
  ArrowLeftRight, BookOpen, CheckCircle2, Clock3, FileJson,
  FileWarning, GitCompareArrows, LockKeyhole, ShieldCheck, Upload,
} from 'lucide-react';
import type { ChangeEvent } from 'react';
import type { EyeExpression } from './expressive-eyes';
import { EyeScreen } from './expressive-eyes';
import {
  MAX_SNAPSHOT_BYTES, parseCatalogSnapshot,
} from '@/lib/catalog-snapshot';
import type {
  CatalogExpression, CatalogProposalPreview, CatalogRevision, CatalogSnapshot,
} from '@/lib/catalog-snapshot';

type View = 'expressions' | 'proposals';
const MAX_FILE_LABEL = 80;
const COMPARE: Array<[string,string]> = [
  ['Etichetta', 'label'],
  ['Valenza rappresentata', 'affect.valence'],
  ['Attivazione rappresentata', 'affect.arousal'],
  ['Intensità rappresentata', 'affect.intensity'],
  ['Apertura occhio sinistro', 'eyes.left.openness'],
  ['Apertura occhio destro', 'eyes.right.openness'],
  ['Sguardo orizzontale', 'eyes.left.gaze_x'],
  ['Sguardo verticale', 'eyes.left.gaze_y'],
  ['Dimensione pupilla', 'eyes.left.pupil_scale'],
  ['Sopracciglio sinistro', 'eyes.left.brow_tilt_deg'],
  ['Sopracciglio destro', 'eyes.right.brow_tilt_deg'],
  ['Iride', 'palette.iris'],
  ['Accento', 'palette.accent'],
  ['Luminosità proposta', 'palette.ring_brightness_pct'],
  ['Tipo animazione', 'animation.mode'],
  ['Intervallo battito (ms)', 'animation.blink_interval_ms'],
  ['Durata espressione (ms)', 'duration_ms'],
];

function valueAt(expression: EyeExpression, path: string): string {
  let value: unknown = expression;
  for (const key of path.split('.')) {
    if (typeof value !== 'object' || value === null || !(key in value)) return '—';
    value = (value as Record<string,unknown>)[key];
  }
  return value == null ? '—' : String(value);
}
function revisionLabel(item: CatalogRevision): string {
  const action = item.action === 'rollback'
    ? 'Rollback da rev. ' + item.rollback_source_revision
    : 'Approvazione';
  return 'Rev. ' + item.revision + ' · ' + action;
}

function EyeRevisionCard({ record, title }: { record: CatalogRevision; title: string }) {
  return <article className="rounded-2xl border border-line bg-[#0a1520] p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[.14em] text-mint">{title}</div>
        <h4 className="mt-1 text-sm font-semibold">{record.expression.label}</h4>
        <p className="mt-1 text-[11px] text-muted">{revisionLabel(record)} · {record.expression.origin}</p>
      </div>
      <span className="rounded-md border border-line px-2 py-1 font-mono text-[10px] text-slate-400">#{record.revision}</span>
    </div>
    <div className="ve-expressive-pair mt-4">
      <EyeScreen side="left" eye={record.expression.eyes.left} expression={record.expression} blink={false}/>
      <EyeScreen side="right" eye={record.expression.eyes.right} expression={record.expression} blink={false}/>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-muted">
      <div>Animazione: <span className="text-slate-200">{record.expression.animation.mode}</span></div>
      <div>Durata: <span className="text-slate-200">{record.expression.duration_ms} ms</span></div>
      <div>Accento: <span className="font-mono text-slate-200">{record.expression.palette.accent}</span></div>
      <div>Rev. rollback: <span className="text-slate-200">{record.rollback_source_revision ?? '—'}</span></div>
    </div>
  </article>;
}

function PendingCard({ proposal }: { proposal: CatalogProposalPreview }) {
  return <article className="rounded-2xl border border-amber-400/20 bg-[#101b26] p-4">
    <h4 className="text-sm font-semibold">{proposal.expression.label}</h4>
    <div className="mt-1 break-all font-mono text-[10px] text-mint">{proposal.expression_id}</div>
    <div className="mt-3 ve-expressive-pair">
      <EyeScreen side="left" eye={proposal.expression.eyes.left} expression={proposal.expression} blink={false}/>
      <EyeScreen side="right" eye={proposal.expression.eyes.right} expression={proposal.expression} blink={false}/>
    </div>
    <p className="mt-3 text-[11px] text-slate-300">
      Stato: <span className="font-semibold text-amber-200">{proposal.status}</span>
      {' · '}Origine dichiarata: {proposal.source_kind}
    </p>
    <p className="mt-1 break-all font-mono text-[10px] text-muted">Proposal ID: {proposal.proposal_id}</p>
    <p className="mt-3 text-[11px] leading-5 text-amber-200">
      Solo consultazione. Non è possibile approvare, rifiutare o applicare questa proposta dal browser.
    </p>
  </article>;
}

export function ExpressionCatalogManager({ robotId }: { robotId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [snapshot, setSnapshot] = useState<CatalogSnapshot | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<View>('expressions');
  const [activeId, setActiveId] = useState('');
  const [left, setLeft] = useState(1);
  const [right, setRight] = useState(1);
  const [activeProposalId, setActiveProposalId] = useState('');

  async function load(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    setError(null);
    try {
      if (file.size <= 0 || file.size > MAX_SNAPSHOT_BYTES) {
        throw new Error('Il file deve essere JSON e non superare 2 MiB.');
      }
      const raw = await file.text();
      const parsed: unknown = JSON.parse(raw);
      const valid = parseCatalogSnapshot(parsed, robotId);
      setSnapshot(valid);
      setFilename(file.name.slice(0,MAX_FILE_LABEL));
      const first = valid.expressions[0];
      setActiveId(first?.expression_id ?? '');
      setLeft(first ? Math.max(1,first.latest_revision - 1) : 1);
      setRight(first?.latest_revision ?? 1);
      setActiveProposalId(valid.proposals.find(x => x.status === 'pending')?.proposal_id ??
        valid.proposals[0]?.proposal_id ?? '');
      setTab('expressions');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossibile leggere lo snapshot.');
      // Never show outdated data after a failed/mismatched import.
      setSnapshot(null);
      setFilename(null);
      setActiveId('');
      setActiveProposalId('');
    }
  }
  function choose(item: CatalogExpression) {
    setActiveId(item.expression_id);
    setLeft(Math.max(1,item.latest_revision - 1));
    setRight(item.latest_revision);
  }
  const current = snapshot?.expressions.find(x => x.expression_id === activeId);
  const first = current?.revisions[left-1];
  const second = current?.revisions[right-1];
  const proposal = snapshot?.proposals.find(p => p.proposal_id === activeProposalId);
  const diffs = first && second ? COMPARE.filter(([,path]) =>
    valueAt(first.expression,path) !== valueAt(second.expression,path)
  ) : [];
  const proposalPending = snapshot?.proposals.filter(x => x.status === 'pending').length ?? 0;

  return <section id="expression-catalog" className="panel overflow-hidden" aria-label="Expression Catalog Manager">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-5 sm:px-6">
      <div>
        <p className="eyebrow flex items-center gap-2"><BookOpen size={15}/> Visual Studio · v0.2D</p>
        <h2 className="mt-2 text-lg font-semibold text-slate-100">Expression Catalog Manager</h2>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-muted">
          Libreria locale consultabile, cronologia e confronto delle espressioni. Importa uno snapshot esportato
          manualmente dal mini-PC; nessun accesso diretto ai file privati o ai dispositivi.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <span className="rounded-lg border border-mint/25 bg-mint/10 px-3 py-1.5 text-[10px] font-semibold text-mint">
          <LockKeyhole size={13} className="mr-1 inline"/> SOLO LETTURA
        </span>
        <span className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-[10px] font-semibold text-amber-200">
          FILE LOCALE · NON LIVE
        </span>
      </div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-[#0b1722] p-5">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted">Robot selezionato</div>
        <div className="mt-1 font-mono text-sm font-semibold text-white">{robotId}</div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={input} type="file" accept=".json,application/json" onChange={e => {void load(e);}} className="sr-only" aria-label="Seleziona snapshot catalogo JSON"/>
        <button type="button" onClick={() => input.current?.click()}
          className="inline-flex items-center gap-2 rounded-xl border border-mint/40 bg-mint/10 px-4 py-2.5 text-xs font-semibold text-mint hover:bg-mint/20">
          <Upload size={16}/> Carica snapshot JSON
        </button>
        {snapshot && <button type="button" onClick={() => {
          setSnapshot(null); setFilename(null); setError(null); setActiveId(''); setActiveProposalId('');
        }} className="rounded-xl border border-line px-3 py-2.5 text-xs text-slate-300">
          Chiudi snapshot
        </button>}
      </div>
    </div>
    {error && <div className="mx-5 mt-4 rounded-lg border border-rose-400/30 bg-rose-400/5 p-3 text-xs text-rose-200" role="alert">
      <FileWarning size={16} className="mr-2 inline"/>{error}
    </div>}
    {!snapshot
      ? <div className="grid min-h-[220px] place-items-center gap-4 p-8 text-center">
          <div>
            <FileJson size={32} className="mx-auto text-mint"/>
            <h3 className="mt-3 text-sm font-semibold">Nessun catalogo importato</h3>
            <p className="mx-auto mt-2 max-w-md text-xs leading-6 text-muted">
              Genera uno snapshot con il comando locale <span className="font-mono text-slate-300">visual_catalog.py snapshot</span>.
              Il file non viene caricato su server esterni e non viene salvato nel browser.
            </p>
          </div>
        </div>
      : <div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5 text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <CheckCircle2 size={16} className="text-mint"/>
              <span className="break-all">{filename}</span>
            </div>
            <div className="flex flex-wrap gap-4 text-[11px] text-muted">
              <span>{snapshot.expressions.length} espressioni</span>
              <span>{snapshot.proposals.length} proposte ({proposalPending} pending)</span>
              <span>Esportato: {new Date(snapshot.generated_at_utc).toLocaleString('it-IT')}</span>
            </div>
          </div>
          <div className="border-b border-line bg-amber-400/5 px-5 py-3 text-[11px] leading-5 text-amber-200">
            <ShieldCheck size={15} className="mr-2 inline"/>
            I record sono stati controllati dal programma di esportazione, ma lo snapshot non è firmato
            né verificato crittograficamente dal browser. Approvazione del catalogo ≠ effetto autorizzato sull'hardware.
          </div>
          <div className="flex gap-2 border-b border-line px-5 py-3">
            <button type="button" aria-pressed={tab==='expressions'} onClick={()=>setTab('expressions')}
              className={'rounded-lg px-4 py-2 text-xs '+(tab==='expressions'?'bg-mint/10 text-mint':'text-muted hover:text-white')}>
              Espressioni &amp; revisioni ({snapshot.expressions.length})
            </button>
            <button type="button" aria-pressed={tab==='proposals'} onClick={()=>setTab('proposals')}
              className={'rounded-lg px-4 py-2 text-xs '+(tab==='proposals'?'bg-mint/10 text-mint':'text-muted hover:text-white')}>
              Coda proposte ({snapshot.proposals.length})
            </button>
          </div>
          {tab === 'expressions'
            ? <div className="grid gap-5 p-5 xl:grid-cols-[minmax(220px,.7fr)_minmax(0,2fr)]">
                <div className="space-y-2">
                  {snapshot.expressions.length===0 &&
                    <p className="rounded-xl border border-line p-4 text-xs text-muted">Nessuna espressione approvata in questo snapshot.</p>}
                  {snapshot.expressions.map(item => {
                    const latest = item.revisions[item.latest_revision-1];
                    return <button type="button" key={item.expression_id} onClick={()=>choose(item)}
                      className={'w-full rounded-xl border p-4 text-left transition '+
                        (activeId===item.expression_id?'border-mint/40 bg-mint/10':'border-line hover:bg-white/[.04]')}>
                      <div className="text-sm font-semibold">{latest.expression.label}</div>
                      <div className="mt-1 break-all font-mono text-[10px] text-mint">{item.expression_id}</div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted">
                        <span>Rev. {item.latest_revision}</span>
                        <span>{latest.action==='rollback'?'Rollback':'Approvata'}</span>
                      </div>
                    </button>;
                  })}
                </div>
                {current && first && second
                  ? <div className="space-y-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold">Confronto revisioni</h3>
                          <p className="mt-1 font-mono text-[11px] text-muted">{current.expression_id}</p>
                        </div>
                        <span className="flex items-center gap-2 text-xs text-mint">
                          <GitCompareArrows size={16}/> {diffs.length} proprietà differenti
                        </span>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {([
                          {label:'Revisione A',value:left,set:setLeft},
                          {label:'Revisione B',value:right,set:setRight},
                        ]).map(sel=>
                          <label key={sel.label} className="text-[11px] text-muted">{sel.label}
                            <select value={sel.value} onChange={e=>sel.set(Number(e.target.value))}
                              className="mt-2 block w-full rounded-xl border border-line bg-[#132233] px-3 py-2.5 text-xs text-white">
                              {current.revisions.map(r=><option key={r.revision} value={r.revision}>{revisionLabel(r)}</option>)}
                            </select>
                          </label>)}
                      </div>
                      <div className="grid gap-4 lg:grid-cols-2">
                        <EyeRevisionCard record={first} title="Versione A"/>
                        <EyeRevisionCard record={second} title="Versione B"/>
                      </div>
                      <div className="rounded-xl border border-line bg-[#0c1721] p-4">
                        <div className="mb-3 flex items-center gap-2 text-xs font-semibold"><ArrowLeftRight size={16} className="text-mint"/> Variazioni dei parametri</div>
                        {diffs.length===0
                          ? <p className="text-xs text-mint">Le due revisioni contengono la stessa ricetta espressiva.</p>
                          : <div className="space-y-2">
                              {diffs.map(([label,path])=><div key={path} className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 border-b border-line/60 pb-2 text-[11px]">
                                <span className="text-muted">{label}</span>
                                <span className="break-all text-slate-300">{valueAt(first.expression,path)}</span>
                                <span className="break-all font-semibold text-mint">{valueAt(second.expression,path)}</span>
                              </div>)}
                            </div>}
                      </div>
                      <div className="rounded-xl border border-line p-4 text-[11px] leading-5 text-muted">
                        <Clock3 size={14} className="mr-1 inline"/>
                        Le revisioni sono storiche. Un rollback dalla Console non è disponibile in questa wave;
                        usa il CLI locale con la revisione attesa dopo aver verificato lo stato corrente.
                      </div>
                    </div>
                  : <div className="rounded-xl border border-line p-6 text-xs text-muted">Seleziona un'espressione da confrontare.</div>}
              </div>
            : <div className="grid gap-5 p-5 xl:grid-cols-[minmax(220px,.7fr)_minmax(0,2fr)]">
                <div className="space-y-2">
                  {snapshot.proposals.length === 0 && <p className="rounded-xl border border-line p-4 text-xs text-muted">Nessuna proposta esportata.</p>}
                  {snapshot.proposals.map(item=><button type="button" key={item.proposal_id} onClick={()=>setActiveProposalId(item.proposal_id)}
                    className={'w-full rounded-xl border p-4 text-left transition '+
                      (activeProposalId===item.proposal_id?'border-mint/40 bg-mint/10':'border-line hover:bg-white/[.04]')}>
                    <div className="text-sm font-semibold">{item.expression.label}</div>
                    <div className="mt-1 break-all font-mono text-[10px] text-muted">{item.proposal_id.slice(0,16)}…</div>
                    <div className="mt-2 text-[11px] text-amber-200">{item.status}</div>
                  </button>)}
                </div>
                {proposal ? <PendingCard proposal={proposal}/> :
                  <div className="rounded-xl border border-line p-6 text-xs text-muted">Seleziona una proposta.</div>}
              </div>}
        </div>}
  </section>;
}
