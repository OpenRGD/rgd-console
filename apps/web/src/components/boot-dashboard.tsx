'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowLeft, ArrowRight, CheckCircle2, CircleAlert, Clock3, Cpu,
  FileCheck, HardDrive, LockKeyhole, Monitor, Power, RefreshCw, ShieldCheck,
  Terminal, TriangleAlert, XCircle,
} from 'lucide-react';
import { apiGet, apiWrite } from '@/lib/api';
import type { BootReport, BootState, RobotRecord } from '@/lib/contracts';

const states: Record<BootState, { label: string; accent: string; description: string }> = {
  checking: { label: 'CHECKING', accent: 'text-sky-300 border-sky-400/40 bg-sky-400/10', description: 'Controlli non attuanti in corso' },
  setup_required: { label: 'SETUP REQUIRED', accent: 'text-amber border-amber/35 bg-amber/10', description: 'Seleziona una istanza RGD per questo host' },
  ready_non_actuating: { label: 'PROFILE CHECK OK', accent: 'text-mint border-mint/40 bg-mint/10', description: 'Profilo statico verificato; nessun permesso di movimento' },
  recovery_required: { label: 'RECOVERY MODE', accent: 'text-rose-300 border-rose-400/40 bg-rose-400/10', description: 'Un controllo è fallito; nessun runtime fisico viene autorizzato' },
  validator_unavailable: { label: 'VALIDATOR UNAVAILABLE', accent: 'text-amber border-amber/35 bg-amber/10', description: 'rgd check non è disponibile; integrità non dimostrata' },
};
const neutral = 'text-slate-400 border-line bg-elevated';

function CheckRow({ title, detail, result }: { title: string; detail: string; result: string }) {
  const isPass = result === 'passed';
  const isFailure = result === 'blocked';
  return <div className="flex gap-4 border-t border-line px-5 py-4 first:border-t-0 sm:px-7">
    <span className={`mt-0.5 shrink-0 ${isPass ? 'text-mint' : isFailure ? 'text-rose-300' : 'text-amber'}`}>
      {isPass ? <CheckCircle2 size={19} /> : isFailure ? <XCircle size={19} /> : <CircleAlert size={19} />}
    </span>
    <div className="min-w-0 flex-1"><p className="font-mono text-xs uppercase tracking-wider text-slate-100">{title.replaceAll('_', ' ')}</p>
      <p className="mt-1.5 text-xs leading-5 text-muted">{detail}</p></div>
    <span className={`self-start rounded-md border px-2 py-1 font-mono text-[10px] uppercase ${isPass ? 'border-mint/20 text-mint' : isFailure ? 'border-rose-300/25 text-rose-300' : 'border-amber/20 text-amber'}`}>{result}</span>
  </div>;
}

export function BootDashboard() {
  const [report, setReport] = useState<BootReport | null>(null);
  const [history, setHistory] = useState<BootReport[]>([]);
  const [instances, setInstances] = useState<RobotRecord[]>([]);
  const [instanceId, setInstanceId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [status, records, past] = await Promise.all([
        apiGet<BootReport>('/boot/status'),
        apiGet<RobotRecord[]>('/robots'),
        apiGet<BootReport[]>('/boot/history'),
      ]);
      if (status.schema_version !== 'console.boot.v0.1') throw new Error('Boot contract non riconosciuto');
      setReport(status);
      setHistory(past.slice(-10).reverse());
      const available = records.filter(r => r.kind === 'physical' && r.rgd_model_id);
      setInstances(available);
      setInstanceId(previous => available.find(r => r.id === previous)?.id
        ?? available.find(r => r.id === status.selection?.instance_id)?.id
        ?? available[0]?.id ?? '');
      setBackendOnline(true);
    } catch (e) {
      setBackendOnline(false);
      setError(e instanceof Error ? e.message : 'Boot Manager non raggiungibile');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const selected = useMemo(() => instances.find(r => r.id === instanceId) ?? null, [instances, instanceId]);
  const theme = report ? states[report.status] : states.checking;

  const select = async () => {
    if (!selected?.rgd_model_id) return;
    setBusy(true); setError(null);
    try {
      const result = await apiWrite<BootReport>('/boot/select', { instance_id: selected.id, model_id: selected.rgd_model_id });
      setReport(result);
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Selezione non riuscita'); }
    finally { setBusy(false); }
  };
  const recheck = async () => {
    setBusy(true); setError(null);
    try {
      setReport(await apiWrite<BootReport>('/boot/recheck', {}));
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Validazione non riuscita'); }
    finally { setBusy(false); }
  };

  return <main className="min-h-screen bg-[#080d15] px-4 pb-16 text-slate-100 sm:px-8">
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line py-6">
        <div className="flex items-center gap-3"><div className="rounded-xl border border-mint/25 bg-mint/10 p-3 text-mint"><Power size={24} /></div>
          <div><strong className="text-lg tracking-tight">Open<span className="text-mint">RGD</span></strong>
            <p className="font-mono text-[10px] uppercase tracking-[.2em] text-muted">BOOT MANAGER · FOUNDATION 0.4D</p></div></div>
        <nav aria-label="Boot navigation" className="flex flex-wrap gap-2 text-xs">
          <Link href="/live" className="flex items-center gap-2 rounded-lg border border-line px-3 py-2.5 hover:border-mint/40"><Monitor size={15} /> Robot Live</Link>
          <Link href="/overview" className="flex items-center gap-2 rounded-lg border border-line px-3 py-2.5 hover:border-mint/40"><ArrowLeft size={15} /> Console</Link>
          <Link href="/onboarding" className="flex items-center gap-2 rounded-lg border border-line px-3 py-2.5 hover:border-mint/40"><FileCheck size={15} /> Onboarding</Link>
        </nav>
      </header>

      <div className="pt-9"><div className="text-[10px] font-semibold uppercase tracking-[.22em] text-mint/75">SYSTEM INTEGRITY / NON-ACTUATING</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Boot & Recovery</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">Verifica del profilo RGD selezionato tramite toolchain canonica. È una procedura applicativa sopra Linux, non un BIOS, un controllo di sicurezza fisica o un sistema di avvio dei motori.</p></div>

      {error && <div role="alert" className="mt-5 rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>}
      <div className={`mt-7 rounded-2xl border p-6 sm:p-8 ${backendOnline === false ? states.recovery_required.accent : theme.accent}`}>
        <div className="flex flex-wrap items-start justify-between gap-6"><div>
          <div className="flex items-center gap-3"><ShieldCheck size={26} /><span className="font-mono text-sm font-bold tracking-[.08em]">{backendOnline === false ? 'BOOT MANAGER OFFLINE' : theme.label}</span></div>
          <h2 className="mt-4 text-xl font-semibold text-slate-50">{backendOnline === false ? 'Recovery indipendente disponibile' : report?.message ?? 'Verifica dello stato in corso'}</h2>
          <p className="mt-2 max-w-2xl text-xs leading-6 text-slate-300">{backendOnline === false ? 'La Console e il desktop Linux non dipendono dall’esito del Boot Manager.' : theme.description}</p>
        </div><div className="rounded-xl border border-rose-400/25 bg-[#111b24]/75 px-4 py-3 text-right"><LockKeyhole size={17} className="ml-auto mb-2 text-rose-300" /><div className="font-mono text-xs text-rose-200">ACTUATION: BLOCKED</div><small className="text-[10px] text-muted">Somatic Runtime non avviato</small></div></div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_1.15fr]">
        <section className="rounded-2xl border border-line bg-panel p-6">
          <h2 className="text-sm font-semibold">Profilo RGD per questo host</h2><p className="mt-1.5 text-xs leading-5 text-muted">Scegli un'istanza fisica già registrata in Onboarding. La selezione sarà ricordata ai successivi avvii del servizio.</p>
          <label htmlFor="boot-instance" className="mt-6 block text-xs text-slate-300">Istanza da verificare</label>
          <select id="boot-instance" value={instanceId} onChange={e => setInstanceId(e.target.value)} className="mt-2 w-full rounded-xl border border-line bg-[#0b151f] p-3 text-sm text-slate-100" disabled={!instances.length || busy}>
            {instances.length === 0 && <option value="">Nessuna istanza RGD importata</option>}
            {instances.map(r => <option key={r.id} value={r.id}>{r.name} · {r.id}</option>)}
          </select>
          {selected && <p className="mt-3 break-all font-mono text-[10px] text-muted">MODEL {selected.rgd_model_id}</p>}
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" disabled={!selected || busy} onClick={() => void select()} className="inline-flex items-center gap-2 rounded-lg bg-mint px-4 py-3 text-xs font-bold text-[#082018] disabled:opacity-40"><FileCheck size={15} /> Seleziona e verifica</button>
            <button type="button" disabled={busy || !report?.selection} onClick={() => void recheck()} className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-3 text-xs disabled:opacity-40"><RefreshCw size={15} /> Ripeti controllo</button>
          </div>
          <p className="mt-5 rounded-xl border border-amber/20 bg-amber/5 p-3 text-xs leading-5 text-amber">Una validazione positiva permette soltanto di utilizzare la Console con un modello staticamente coerente. Non certifica calibrazione, posizione dei giunti, circuiti di potenza o sicurezza del robot.</p>
        </section>
        <section className="overflow-hidden rounded-2xl border border-line bg-panel">
          <div className="flex items-center justify-between border-b border-line px-6 py-5"><h2 className="text-sm font-semibold">Sequenza di avvio</h2><span className="font-mono text-[11px] text-muted">RGD CHECK → RGD BOOT</span></div>
          {report?.checks.length ? report.checks.map((row,index) => <CheckRow key={`${row.id}:${index}`} title={row.id} result={row.state} detail={row.detail} />)
            : <div className="p-6 text-sm text-muted">Nessun report disponibile. La Console resta utilizzabile anche senza un profilo RGD valido.</div>}
          {report?.validation && <div className="border-t border-line px-6 py-4 text-xs"><p className="mb-2 text-mint">INTEGRITÀ CANONICA</p>
            <p>Robot: <span className="font-mono text-slate-200">{report.validation.robot_id}</span></p>
            <p className="mt-2">Moduli della spec: {report.validation.modules_count}</p>
            <p className="mt-2 break-all font-mono text-[10px] text-muted">{report.validation.source_root}</p></div>}
          <div className="border-t border-line px-6 py-4 text-xs leading-5 text-muted">Ultima verifica: {report?.checked_at ? new Date(report.checked_at).toLocaleString('it-IT') : 'non disponibile'} · Motori: nessun comando inviato</div>
        </section>
      </div>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <section className="rounded-2xl border border-line bg-panel p-6"><h2 className="flex items-center gap-2 text-sm font-semibold"><Activity size={17} /> Storico delle verifiche</h2>
          <div className="mt-4 divide-y divide-line">{history.length ? history.map((item,index) => <div key={`${item.checked_at}:${index}`} className="flex items-center justify-between gap-3 py-3 text-xs"><span className={states[item.status]?.accent.split(' ')[0] ?? 'text-muted'}>{states[item.status]?.label ?? item.status}</span><span className="text-muted">{new Date(item.checked_at).toLocaleString('it-IT')}</span></div>)
            : <p className="text-xs text-muted">Nessuna verifica registrata.</p>}</div>
        </section>
        <section className="rounded-2xl border border-line bg-panel p-6"><h2 className="flex items-center gap-2 text-sm font-semibold"><Terminal size={17} /> Recovery Mode</h2>
          <p className="mt-3 text-xs leading-6 text-muted">Se il modello manca o non passa `rgd check`, puoi continuare ad aprire Onboarding, Modules e Live. Correggi il profilo sorgente, reimportalo e seleziona la nuova istanza. Il Boot Manager non modifica file canonici né ripara hash automaticamente.</p>
          <div className="mt-5 flex flex-wrap gap-2"><Link className="rounded-lg border border-line px-3 py-2 text-xs hover:text-mint" href="/onboarding">Importa profilo <ArrowRight size={13} className="inline" /></Link><Link href="/modules" className="rounded-lg border border-line px-3 py-2 text-xs hover:text-mint">Moduli</Link></div>
        </section>
      </div>
      <footer className="mt-10 border-t border-line pt-5 font-mono text-[10px] text-muted">OPENRGD BOOT v0.1 · NO ACTUATION · NO KERNEL MODIFICATIONS · LOCAL-ONLY</footer>
    </div>
  </main>;
}
