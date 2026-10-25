'use client';

import Link from 'next/link';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowRight, BatteryCharging, Blocks, Box as BoxIcon, BrainCircuit,
  Cable, CheckCircle2, CircuitBoard, Clock3, Cpu, Database, Gauge, HardDrive, Layers3,
  LockKeyhole, RadioTower, Search, Server, ShieldCheck, Thermometer, Waves, Zap,
} from 'lucide-react';
import type { ConsoleEvent, ConsoleStatus, ImportedModel, ModuleManifest, RobotRecord, TelemetrySnapshot } from '@/lib/contracts';
import { apiGet } from '@/lib/api';
import { ModelSummary } from './onboarding';
import { ModuleManager } from './module-manager';
import { EmptyState, EventTimeline, measurementText, MetricTile, Panel, Pill, SectionHeading, SourceBadge, StateBlock, useNow } from './ui';

const BodyViewport = dynamic(() => import('./body-viewport'), { ssr: false, loading: () => <div className="h-[370px] animate-pulse rounded-xl bg-elevated" /> });

export type ConsoleData = {
  robots: RobotRecord[];
  robot: RobotRecord;
  snapshot: TelemetrySnapshot | null;
  history: TelemetrySnapshot[];
  events: ConsoleEvent[];
  modules: ModuleManifest[];
  status: ConsoleStatus | null;
  streamStatus: "connecting" | "live" | "offline";
};

function StateTag({ state }: { state: string }) {
  const tone = state === 'connected' || state === 'installed' ? 'mint' : state === 'simulated' ? 'amber' : 'neutral';
  return <Pill tone={tone}>{state.replaceAll('_', ' ')}</Pill>;
}

function MetricInline({ measurement }: { measurement: TelemetrySnapshot['power']['voltage'] | null }) {
  const now = useNow();
  return <span className="mono font-semibold text-slate-100">{measurementText(measurement, now).value}</span>;
}

function LineGraph({ history }: { history: TelemetrySnapshot[] }) {
  const points = history.filter(row => row.power.voltage.value !== null).map((row, i) => ({ x: i, y: row.power.voltage.value as number }));
  if (points.length < 2) return <EmptyState title="In attesa di campioni" message="Il grafico compare solo dopo la ricezione di misure con provenienza esplicita." icon={<Activity size={21} />} />;
  const min = Math.min(...points.map(p => p.y)) - 0.08;
  const max = Math.max(...points.map(p => p.y)) + 0.08;
  const spread = max - min || 1;
  const path = points.map((p, i) => `${i ? 'L' : 'M'} ${10 + (i / Math.max(points.length - 1, 1)) * 620} ${165 - (p.y - min) / spread * 135}`).join(' ');
  const last = points[points.length - 1].y;
  return <div className="px-5 pb-5 pt-5 sm:px-6">
    <div className="mb-3 flex items-center justify-between"><div><span className="eyebrow">VOLTAGE HISTORY</span><div className="mono mt-1 text-xl text-slate-100">{last.toFixed(2)} <span className="text-sm text-muted">V</span></div></div><Pill tone="amber">Dati sintetici se in simulazione</Pill></div>
    <div className="relative w-full rounded-xl border border-line bg-[#0b141d] p-3">
      <svg aria-label="Andamento tensione negli ultimi campioni" viewBox="0 0 640 190" className="h-[190px] w-full" preserveAspectRatio="none" role="img">
        {[35,80,125,170].map(y => <line key={y} x1="10" x2="630" y1={y} y2={y} stroke="#253542" strokeDasharray="4 5" />)}
        <path d={path} fill="none" stroke="#63e5c0" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx="630" cy={165 - (last - min) / spread * 135} r="4.5" fill="#63e5c0" />
      </svg>
    </div>
    <div className="mt-3 flex justify-between text-[11px] text-muted"><span>Campioni mantenuti in memoria nel browser: {points.length}</span><span>Campionamento demo: 1 Hz</span></div>
  </div>;
}

export function Overview({ robot, snapshot, events, modules, status, streamStatus }: ConsoleData) {
  const isSim = robot.kind === 'simulated';
  const now = useNow();
  const snapshotFresh = !!snapshot?.received_at && now - new Date(snapshot.received_at).getTime() < 5000 && now - new Date(snapshot.received_at).getTime() > -10000;
  const displayedConnection = snapshot?.connection_state === 'connected' && (!snapshotFresh || streamStatus !== 'live') ? 'stale' : (snapshot?.connection_state ?? 'unknown');
  return <>
    <SectionHeading overline="01 / COMMAND CENTER" title={`Bentornato in ${robot.name}`} description="Uno sguardo al corpo, ai servizi e al flusso degli eventi. I dati fisici sono mostrati soltanto quando realmente disponibili." extra={<SourceBadge kind={robot.kind} />} />
    <div className="relative mb-6 overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-[#18313b] via-[#11232c] to-[#0e1923] px-6 py-7 sm:px-8">
      <div className="pointer-events-none absolute -right-12 -top-28 h-80 w-80 rounded-full bg-mint/5 blur-3xl" />
      <div className="relative flex flex-wrap items-center justify-between gap-5"><div><div className="eyebrow text-mint/80">ACTIVE ROBOT CONTEXT</div><h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-50">{robot.name}</h2><p className="mt-1 text-sm text-slate-300">{robot.model} · {robot.manufacturer}</p><p className="mono mt-4 text-xs text-muted">ID {robot.id}</p></div><div className="rounded-xl border border-mint/20 bg-[#0b1d24]/70 px-5 py-4 text-right"><div className="text-[11px] uppercase tracking-widest text-muted">System boundary</div><div className="mt-2 flex items-center justify-end gap-2 font-semibold text-mint"><ShieldCheck size={18} /> CONTROL DISABLED</div><div className="mt-1 text-xs text-muted">Motori: nessun comando esposto</div></div></div>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StateBlock title="Connessione" value={displayedConnection} hint={isSim ? 'Adapter virtuale esplicito' : 'Nessun feed fisico collegato'} icon={<RadioTower size={18} />} />
      <StateBlock title="Runtime" value={snapshot?.runtime_state ?? 'unknown'} hint={isSim ? 'Non è Somatic Runtime' : 'Somatic Runtime non integrato'} icon={<Cpu size={18} />} />
      <StateBlock title="Alimentazione" value={snapshot?.power.voltage.value == null || !snapshotFresh ? '—' : `${snapshot.power.voltage.value.toFixed(2)} V`} hint={isSim ? (snapshotFresh ? 'Tensione generata dal simulatore' : 'Ultimo campione scaduto') : 'Nessuna misura di alimentazione'} icon={<BatteryCharging size={18} />} />
      <StateBlock title="Moduli core" value={`${modules.filter(m => m.status === 'installed').length} bundled`} hint="Registry software esterno nella sezione Modules" icon={<Blocks size={18} />} />
    </div>
    <div className="mt-6 grid gap-5 xl:grid-cols-[1.05fr_.95fr]">
      <Panel title="Stato dei sottosistemi" subtitle="Distinzione tra servizio Console e capacità robotiche">
        <div className="divide-y divide-line/80">
          {[
            { title: 'Console API', caption: 'Contratto REST / WebSocket', state: status?.api_version === 'console.v1' ? 'connected' : 'unknown' },
            { title: 'Backend telemetria', caption: robot.adapter_id, state: isSim ? 'simulated' : 'disconnected' },
            { title: 'Somatic Runtime', caption: 'Interfaccia in attesa di verifica e integrazione', state: 'not_connected' },
            { title: 'HyperAion / Chronon', caption: 'Nessun archivio canonico montato', state: 'not_connected' },
          ].map(row => <div className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6" key={row.title}><div><div className="text-[13px] font-medium text-slate-100">{row.title}</div><div className="mt-1 text-xs text-muted">{row.caption}</div></div><StateTag state={row.state} /></div>)}
        </div>
      </Panel>
      <Panel title="Ultimi eventi" subtitle="Registro Console: diagnostica, non Chronon" action={<span className="text-[11px] text-muted">{events.length} eventi caricati</span>}><EventTimeline events={events} limit={5} /></Panel>
    </div>
  </>;
}

export function Electronics({ robot, snapshot, history }: ConsoleData) {
  return <>
    <SectionHeading overline="03 / HARDWARE OBSERVABILITY" title="Electronics" description="Alimentazione, bus, controller e attuatori con origine e timestamp di ogni campione. I valori mancanti restano vuoti." extra={<SourceBadge kind={robot.kind} />} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricTile name="Tensione" metric={snapshot?.power.voltage} glyph={<Zap size={18} />} />
      <MetricTile name="Corrente" metric={snapshot?.power.current} glyph={<Activity size={18} />} />
      <MetricTile name="Potenza" metric={snapshot?.power.power} glyph={<BatteryCharging size={18} />} />
      <MetricTile name="Temperatura" metric={snapshot?.power.temperature} glyph={<Thermometer size={18} />} />
    </div>
    <div className="mt-6 grid gap-5 xl:grid-cols-[1.55fr_1fr]">
      <Panel title="Signal history" subtitle="Tensione · ultimi campioni ricevuti"><LineGraph history={history} /></Panel>
      <Panel title="Transport / CAN" subtitle="Lo stato reale del bus non viene inferito">
        <div className="space-y-5 px-5 py-6 sm:px-6">
          <div className="flex items-center justify-between"><div className="flex items-center gap-3 text-slate-200"><Cable size={19} className="text-mint" /> Stato bus</div><StateTag state={snapshot?.can.bus_state ?? 'unknown'} /></div>
          <p className="tiny-label">Ultimo stato bus: {snapshot?.can.measured_at ? new Date(snapshot.can.measured_at).toLocaleTimeString('it-IT') : 'non misurato'}</p>
          <div className="soft-divider pt-5"><div className="tiny-label">Bitrate</div><div className="mt-2"><MetricInline measurement={snapshot?.can.bitrate ?? null} /></div></div>
          <div className="soft-divider pt-5"><div className="tiny-label">Frequenza di aggiornamento</div><div className="mt-2"><MetricInline measurement={snapshot?.can.update_rate ?? null} /></div></div>
          <div className="soft-divider pt-5"><div className="tiny-label">Sorgente</div><p className="mono mt-2 break-all text-xs text-muted">{snapshot?.can.source_id ?? '—'}</p></div>
          <p className="rounded-lg border border-line bg-[#101f2a] px-3 py-3 text-xs leading-5 text-muted">Clock domain: <code>{snapshot?.clock_domain ?? 'unknown'}</code>. Nessuna sincronizzazione Chronograph è dichiarata.</p>
        </div>
      </Panel>
    </div>
    <div className="mt-6 grid gap-5 xl:grid-cols-[.75fr_1.25fr]">
      <Panel title="Controller" subtitle="Dispositivi dichiarati dalla sorgente">
        {snapshot?.controllers.length ? <div className="divide-y divide-line">{snapshot.controllers.map(c => <div key={c.id} className="px-5 py-4 sm:px-6"><div className="flex justify-between gap-2"><span className="mono text-sm font-medium">{c.id}</span><StateTag state={c.state} /></div><div className="mt-2 text-xs text-muted">{c.transport}</div><div className="mt-1 text-[10px] text-muted">{c.measured_at ? `Misurato: ${new Date(c.measured_at).toLocaleTimeString('it-IT')}` : 'Non misurato'}</div><div className="mono mt-2 truncate text-[10px] text-muted" title={c.source_id}>{c.source_id}</div></div>)}</div> : <EmptyState title="Nessun controller rilevato" message="L'elenco rimane vuoto finché un adapter verificato non dichiara dispositivi." icon={<CircuitBoard size={21} />} />}
      </Panel>
      <Panel title="Actuator telemetry" subtitle="Ogni misura specifica stato e fonte">
        {snapshot?.motors.length ? <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs"><thead><tr className="border-b border-line bg-white/[.02] text-muted"><th className="px-5 py-3 font-medium">Motore</th><th className="px-3 py-3 font-medium">Posizione</th><th className="px-3 py-3 font-medium">Velocità</th><th className="px-3 py-3 font-medium">Temperatura</th><th className="px-5 py-3 font-medium">Stato</th></tr></thead><tbody className="divide-y divide-line">{snapshot.motors.map(m => <tr key={m.id} className="hover:bg-white/[.02]"><td className="px-5 py-4"><div className="mono font-semibold text-slate-100">{m.id}</div><div className="mono mt-1 text-[10px] text-muted">{m.joint ?? 'joint n.d.'}</div><div className="mt-1 text-[10px] text-muted">{m.measured_at ? new Date(m.measured_at).toLocaleTimeString('it-IT') : 'mai'}</div></td><td className="mono px-3 py-4"><MetricInline measurement={m.position} /></td><td className="mono px-3 py-4"><MetricInline measurement={m.velocity} /></td><td className="mono px-3 py-4"><MetricInline measurement={m.temperature} /></td><td className="px-5 py-4"><StateTag state={m.state} /></td></tr>)}</tbody></table></div> : <EmptyState title="Nessun attuatore disponibile" message="Non assumiamo ID motori, encoder, temperature o posizioni per robot scollegati." icon={<Gauge size={21} />} />}
      </Panel>
    </div>
  </>;
}

export function Body({ robot, snapshot }: ConsoleData) {
  const [model, setModel] = useState<ImportedModel | null>(null);
  const [selectedJoint, setSelectedJoint] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setModel(null); setError(false); setSelectedJoint(null);
    if (!robot.rgd_model_id) return;
    void apiGet<ImportedModel>(`/robots/${encodeURIComponent(robot.id)}/model`)
      .then(data => { if (active) setModel(data); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [robot.id, robot.rgd_model_id]);
  const joint = model?.joints.find(j => j.id === selectedJoint) ?? null;
  const physicalSample = snapshot?.motors.find(m => m.joint === selectedJoint) ?? null;
  return <>
    <SectionHeading overline="02 / EMBODIMENT" title="Body" description="Modello corporeo dichiarato e telemetria osservata sono livelli distinti. Nessuna posa viene stimata senza trasformazioni e misure sufficienti." extra={<SourceBadge kind={robot.kind} />} />
    {error && <div role="alert" className="mb-4 rounded-lg border border-rose-400/30 bg-rose-500/10 p-4 text-xs text-rose-200">Il modello RGD non è disponibile in questo momento.</div>}
    <div className="grid gap-5 xl:grid-cols-[1.55fr_.8fr]">
      <Panel title="3D workspace" subtitle="Solo assi di riferimento: la geometria fisica richiede asset e trasformazioni verificabili" action={<Pill tone="amber">GEOMETRIA 3D NON VERIFICATA</Pill>}><div className="p-4"><BodyViewport /></div></Panel>
      <Panel title={model ? 'Joint topology · RGD' : 'Articolazioni'} subtitle={model ? 'Selezione del modello teorico, non comando motorio' : 'Nessun profilo RGD associato'}>
        {model?.joints.length ? <div className="max-h-[425px] overflow-y-auto divide-y divide-line">{model.joints.map(item => <button type="button" key={item.id} onClick={() => setSelectedJoint(item.id)} className={`flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-white/[.04] ${selectedJoint === item.id ? 'bg-mint/[.06]' : ''}`}><span><span className="mono block break-all text-xs font-medium text-slate-100">{item.id}</span><span className="mt-1 block text-[11px] text-muted">{item.parent_link ?? '—'} → {item.child_link ?? '—'}</span></span><ArrowRight size={16} className={selectedJoint === item.id ? 'text-mint' : 'text-muted'} /></button>)}</div> : <EmptyState title="Nessuna topologia importata" message="Per caricare link e joint vai su Onboarding e importa un profilo RGD; il simulatore non inventa una descrizione corporea." icon={<BoxIcon size={21} />} />}
        <div className="soft-divider px-5 py-5"><div className="eyebrow">DETTAGLIO JOINT</div>{joint ? <div className="mt-3 space-y-2 text-xs"><div className="flex justify-between gap-2"><span className="text-muted">Tipo dichiarato</span><span className="mono">{joint.joint_type ?? '—'}</span></div><div className="flex justify-between gap-2"><span className="text-muted">Limiti nominali</span><span className="mono">{joint.lower_limit ?? '?'} … {joint.upper_limit ?? '?'} rad</span></div><div className="flex justify-between gap-2"><span className="text-muted">Posizione fisica</span>{physicalSample ? <MetricInline measurement={physicalSample.position} /> : <span className="text-amber">Non osservata</span>}</div></div> : <p className="mt-2 text-xs text-muted">Seleziona un joint dichiarato dal profilo RGD.</p>}</div>
      </Panel>
    </div>
    {model && <div className="mt-6"><ModelSummary model={model} /></div>}
    {!model && <div className="mt-4 rounded-xl border border-line p-4 text-xs text-muted">Il robot selezionato non ha ancora un profilo RGD associato. Apri <a className="font-semibold text-mint hover:underline" href="/onboarding">Onboarding</a> per caricarne uno.</div>}
  </>;
}

export function Mind({ robot, events }: ConsoleData) {
  const cognitive = events.filter(e => ['requested', 'accepted', 'rejected', 'executing', 'result', 'decision', 'reasoning'].includes(e.stage));
  return <>
    <SectionHeading overline="04 / DECISION OBSERVABILITY" title="Mind" description="Mostra esclusivamente decisioni, intenzioni e valutazioni emesse come eventi strutturati dai moduli. Nessun pensiero sintetizzato dalla Console." extra={<SourceBadge kind={robot.kind} />} />
    <Panel title="Causal execution chain" subtitle="Percorso previsto, non dichiarazione di processi in esecuzione">
      <div className="grid grid-cols-2 gap-2 p-5 sm:grid-cols-3 lg:grid-cols-6 sm:p-6">{['Intent', 'Assessment', 'Decision', 'Execution', 'Feedback', 'Outcome'].map((label, i) => <div key={label} className="rounded-xl border border-line bg-[#0b141e] px-3 py-4"><div className="mono text-[11px] text-muted">0{i + 1}</div><div className="mt-3 text-xs font-semibold text-slate-200">{label}</div><div className="mt-1 text-[10px] text-muted">nessun evento attivo</div></div>)}</div>
    </Panel>
    <div className="mt-6"><Panel title="Decision event stream" subtitle="Solo tracce strutturate realmente ricevute"><EventTimeline events={cognitive} /></Panel></div>
  </>;
}

export function Memory({ robot, events }: ConsoleData) {
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState('all');
  const matches = useMemo(() => events.filter(e => (stage === 'all' || e.stage === stage) && `${e.title} ${e.event_kind} ${e.event_id}`.toLowerCase().includes(query.toLowerCase())), [events, query, stage]);
  const stages = [...new Set(events.map(e => e.stage))];
  return <>
    <SectionHeading overline="05 / TIME & CAUSALITY" title="Memory" description="Anteprima del registro eventi operativo. Chronon, HyperAion e replay sincronizzato richiederanno integrazioni reali e contratti convalidati." extra={<Pill tone="amber">NON È MEMORIA CHRONON</Pill>} />
    <div className="mb-6 grid gap-4 sm:grid-cols-3">
      <StateBlock title="Eventi visibili" value={String(events.length)} hint="Registro volatile del backend" icon={<Clock3 size={18} />} />
      <StateBlock title="Chronon canonici" value="Non collegato" hint="Nessun archivio Chronon esposto" icon={<Database size={18} />} />
      <StateBlock title="Replay temporale" value="Non disponibile" hint="Chronograph ancora non integrato" icon={<Layers3 size={18} />} />
    </div>
    <Panel title="Operational event timeline" subtitle="Puoi filtrare gli eventi ricevuti; la cronologia non è una prova canonica">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4 sm:px-6">
        <label className="relative min-w-[230px] flex-1"><Search aria-hidden="true" size={16} className="absolute left-3 top-3 text-muted" /><span className="sr-only">Cerca eventi</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Cerca per evento o identificativo…" className="w-full rounded-lg border border-line bg-[#0a141d] py-2.5 pl-9 pr-3 text-xs outline-none placeholder:text-slate-600 focus:border-mint" /></label>
        <label className="sr-only" htmlFor="stageFilter">Filtra per fase</label><select id="stageFilter" value={stage} onChange={e => setStage(e.target.value)} className="rounded-lg border border-line bg-[#0a141d] px-3 py-2.5 text-xs text-slate-200"><option value="all">Tutte le fasi</option>{stages.map(item => <option value={item} key={item}>{item}</option>)}</select>
      </div>
      <EventTimeline events={matches} />
    </Panel>
    <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted"><AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber" /> I dati del registro v0.1 non sono persistenti dopo il riavvio dell'API. Nessun evento viene spacciato per un Chronon o per una misura temporale certificata.</p>
  </>;
}

export function Modules({ modules }: ConsoleData) {
  return <ModuleManager bundledModules={modules} />;
}

export function Settings({ robots, robot, status, snapshot }: ConsoleData) {
  return <>
    <SectionHeading overline="07 / CONFIGURATION" title="Settings" description="Identità, diagnostica e stato delle integrazioni. La configurazione è dichiarativa e non attiva alcun dispositivo." extra={<Pill tone="mint">CONTROLLO MOTORI DISABILITATO</Pill>} />
    <div className="mb-5"><Panel title="Robot Live & Display Profiles" subtitle="Interfaccia di bordo per display da 5 pollici e altre dimensioni; configurazione locale al browser">
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-6"><div><p className="text-sm font-semibold text-slate-100">Development è la modalità di avvio predefinita</p><p className="mt-1 max-w-2xl text-xs leading-5 text-muted">Puoi provare Live Mode e simulare un display da 800 × 480 senza modificare HDMI, Wayland, login Ubuntu o sicurezza motoria.</p></div><div className="flex flex-wrap gap-2"><Link href="/live/configure" className="inline-flex min-h-11 items-center rounded-lg border border-mint/40 px-4 text-xs font-semibold text-mint hover:bg-mint/10">Configura Live</Link><Link href="/live" className="inline-flex min-h-11 items-center rounded-lg bg-mint px-4 text-xs font-bold text-[#0c211b]">Apri Live</Link></div></div>
    </Panel></div>
    <div className="grid gap-5 xl:grid-cols-2">
      <Panel title="Robot registry" subtitle="Istanza importata: registro locale persistente. Le voci iniziali restano in config/robots.json"><div className="divide-y divide-line">{robots.map(r => <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6"><div><p className="text-sm font-medium text-slate-100">{r.name}</p><p className="mono mt-1 text-[11px] text-muted">{r.id} · {r.adapter_id}</p></div><SourceBadge kind={r.kind} /></div>)}</div></Panel>
      <Panel title="API & security" subtitle="Nessun comando motorio disponibile"><div className="space-y-4 p-5 sm:p-6">{[
        ['Contract', status?.api_version ?? 'unavailable'],
        ['Version', status?.console_version ?? '—'],
        ['Control', status?.control_surface ?? '—'],
        ['Runtime fisico', status?.physical_runtime_connected ? 'collegato' : 'non collegato'],
        ['Archivio Chronon', status?.chronon_store_connected ? 'collegato' : 'non collegato'],
        ['Clock', snapshot?.clock_domain ?? 'unavailable'],
      ].map(([label, value]) => <div key={label} className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3 last:border-0"><span className="text-xs text-muted">{label}</span><span className="mono text-xs text-slate-100">{value}</span></div>)}<div className="rounded-xl border border-amber/25 bg-amber/5 px-4 py-3 text-xs leading-5 text-amber">L'accesso remoto richiede un gateway autenticato o una VPN. I container sono pubblicati solo su loopback; non esporre direttamente l'API su Internet.</div></div></Panel>
    </div>
    <div className="mt-5"><Panel title="Integration readiness" subtitle="Funzioni ancora non disponibili in Foundation v0.4C"><div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6">{[
      ['Somatic Runtime', 'Adapter versionato e safety negotiation pendenti'],
      ['RGD body model', 'Import ZIP e lettura topologia disponibili; integrità canonica e geometria 3D ancora da verificare'],
      ['Chronon / HyperAion', 'Adapter di lettura canonico pendente'],
      ['Remote identity', 'Demandata al gateway di accesso protetto'],
    ].map(([label, detail]) => <div key={label} className="rounded-xl border border-line bg-[#0b141d] p-4"><div className="flex items-center gap-2 text-sm text-slate-200"><AlertTriangle size={16} className="text-amber" />{label}</div><p className="mt-2 text-xs text-muted">{detail}</p></div>)}</div></Panel></div>
  </>;
}
