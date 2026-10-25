'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowUpRight, Blocks, CheckCircle2, CloudDownload, Cpu, ExternalLink, HardDrive,
  LockKeyhole, PackageOpen, RefreshCw, ShieldCheck, Terminal, XCircle } from 'lucide-react';
import type { ModuleCatalog, ModuleInstallJob, ModuleManifest, RegistryEntry } from '@/lib/contracts';
import { apiGet, apiWrite } from '@/lib/api';
import { EmptyState, Panel, Pill, SectionHeading, StateBlock } from './ui';
import { CalibrationInspector } from './calibration-inspector';

const JOB_KEY = 'openrgd.console.module-manager.active-job';
const statusText: Record<string, string> = {
  not_installed: 'Disponibile', source_only: 'Sorgente presente',
  ready: 'Software pronto', tampered: 'Integrità non valida',
};

function RegistryModuleCard({ entry, onInstall, disabled }: {
  entry: RegistryEntry;
  onInstall: (entry: RegistryEntry) => void;
  disabled: boolean;
}) {
  const { descriptor: d, installation: installed } = entry;
  const eligible = d.maturity === 'candidate' && d.safety.non_actuating === true
    && d.safety.automatic_motion_on_load === false
    && d.safety.active_calibration_supported === false
    && d.permissions_required.length === 0;
  const canInstall = installed.state === 'not_installed' && eligible;
  return <article className="panel overflow-hidden">
    <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
      <div className="flex min-w-0 gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-mint/20 bg-mint/10 text-mint"><Blocks size={22} /></div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><h3 className="text-[15px] font-semibold text-slate-100">{d.display_name}</h3><Pill tone="amber">{d.maturity.toUpperCase()}</Pill></div>
          <p className="mono mt-1.5 break-all text-[11px] text-muted">{d.id} · v{d.version}</p>
          <p className="mt-3 max-w-2xl text-xs leading-5 text-muted">{d.summary}</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-start gap-3 sm:items-end">
        <Pill tone={installed.state === 'ready' ? 'mint' : installed.state === 'tampered' ? 'red' : 'neutral'}>
          {installed.state === 'ready' ? <CheckCircle2 size={12} /> : <PackageOpen size={12} />}{statusText[installed.state] ?? installed.state}
        </Pill>
        <button type="button" onClick={() => onInstall(entry)} disabled={disabled || !canInstall}
          className="inline-flex items-center gap-2 rounded-lg border border-mint/40 bg-mint/10 px-4 py-2.5 text-xs font-semibold text-mint transition hover:bg-mint/20 disabled:cursor-not-allowed disabled:opacity-40">
          <CloudDownload size={15} /> Installa e compila
        </button>
      </div>
    </div>
    <div className="grid gap-3 border-t border-line bg-[#0b141d]/60 px-5 py-4 sm:grid-cols-3 sm:px-6">
      <div><p className="eyebrow">RUNTIME / DISTRIBUZIONE</p><p className="mono mt-2 text-xs text-slate-200">{d.distribution.kind}</p><p className="mt-1 text-[11px] text-muted">{d.distribution.hosts.join(', ')}</p></div>
      <div><p className="eyebrow">AUTORIZZAZIONI</p><p className="mt-2 text-xs text-slate-200">{d.permissions_required.length === 0 ? 'Nessun permesso host' : `${d.permissions_required.length} richiesti`}</p><p className="mt-1 text-[11px] text-muted">Motori: {d.safety.non_actuating ? 'nessuna attuazione' : 'non autorizzato'}</p></div>
      <div><p className="eyebrow">SOURCE COMMIT</p><p className="mono mt-2 break-all text-xs text-slate-300">{d.source.commit_sha.slice(0, 16)}…</p>
        <a href={d.source.git_url.replace(/\.git$/, '')} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-[11px] text-mint hover:underline">Repository <ExternalLink size={11} /></a></div>
    </div>
    <details className="border-t border-line px-5 py-4 text-xs text-muted sm:px-6">
      <summary className="cursor-pointer font-medium text-slate-300">Capacità dichiarate ({d.capabilities.length}) e integrità</summary>
      <div className="mt-3 space-y-1">{d.capabilities.map(c => <p key={c} className="mono break-all text-[11px]">{c}</p>)}</div>
      {installed.binary_sha256 && <p className="mono mt-4 break-all text-[10px]">Binary digest: {installed.binary_sha256}</p>}
      <p className="mt-3 leading-5">Lo stato ready riguarda esclusivamente il software locale. Non dimostra una calibrazione fisica, una posizione nota o la sicurezza del robot.</p>
    </details>
  </article>;
}

export function ModuleManager({ bundledModules }: { bundledModules: ModuleManifest[] }) {
  const [catalog, setCatalog] = useState<ModuleCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<RegistryEntry | null>(null);
  const [typed, setTyped] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<ModuleInstallJob | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const lastFinished = useRef<string | null>(null);

  const loadCatalog = useCallback(async () => {
    try {
      const value = await apiGet<ModuleCatalog>('/modules/catalog');
      if (value.manager_contract !== 'console.module-manager.v0.4a' || value.actuation_enabled !== false) throw new Error('Contratto Registry non atteso');
      setCatalog(value); setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Module Agent non raggiungibile');
      setCatalog(null);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void loadCatalog();
    const saved = localStorage.getItem(JOB_KEY);
    if (saved && /^[a-f0-9]{32}$/.test(saved)) setJobId(saved);
  }, [loadCatalog]);

  useEffect(() => {
    if (!jobId) return;
    let active = true;
    const refresh = async () => {
      try {
        const result = await apiGet<ModuleInstallJob>(`/modules/jobs/${jobId}`);
        if (!active) return;
        setJob(result);
        if ((result.state === 'succeeded' || result.state === 'failed') && lastFinished.current !== jobId) {
          lastFinished.current = jobId;
          localStorage.removeItem(JOB_KEY);
          void loadCatalog();
        }
      } catch {
        if (active) setInstallError('Job non raggiungibile. Il servizio può essere stato riavviato: verifica lo stato dal catalogo.');
      }
    };
    void refresh();
    const handle = window.setInterval(() => { if (lastFinished.current !== jobId) void refresh(); }, 2400);
    return () => { active = false; window.clearInterval(handle); };
  }, [jobId, loadCatalog]);

  const permissionPhrase = selected ? `INSTALL ${selected.descriptor.id}@${selected.descriptor.version} build` : '';
  const confirmInstall = async () => {
    if (!selected || typed !== permissionPhrase) return;
    setInstallError(null); setSubmitting(true);
    try {
      const created = await apiWrite<ModuleInstallJob>('/modules/install', {
        module_id: selected.descriptor.id, version: selected.descriptor.version,
        mode: 'build', confirmation: typed,
      });
      if (!/^[0-9a-f]{32}$/.test(created.job_id)) throw new Error('Job ID restituito non valido');
      lastFinished.current = null;
      setJob(created); setJobId(created.job_id);
      localStorage.setItem(JOB_KEY, created.job_id);
      setSelected(null); setTyped('');
    } catch (e) { setInstallError(e instanceof Error ? e.message : 'Richiesta di installazione rifiutata'); }
    finally { setSubmitting(false); }
  };

  const working = job?.state === 'queued' || job?.state === 'running';
  return <>
    <SectionHeading overline="06 / EXTENSIBILITY · v0.4B" title="Universal Module Manager"
      description="Catalogo versionato e installazione di estensioni non attuanti. Ogni download e compilazione richiede approvazione: nessuna installazione automatica."
      extra={<Pill tone="mint"><ShieldCheck size={13} /> MODULE SAFETY GATE</Pill>} />
    <div className="mb-6 grid gap-4 sm:grid-cols-3">
      <StateBlock title="Moduli Console" value={String(bundledModules.filter(m => m.status === 'installed').length)} hint="Componenti bundled interni" icon={<Blocks size={18} />} />
      <StateBlock title="Catalogo esterno" value={catalog ? String(catalog.catalog.length) : '—'} hint="Snapshot pinned del Registry" icon={<PackageOpen size={18} />} />
      <StateBlock title="Software pronto" value={catalog ? String(catalog.catalog.filter(e => e.installation.state === 'ready').length) : '—'} hint="Non equivale a robot calibrato" icon={<HardDrive size={18} />} />
    </div>
    <div className="mb-6 rounded-xl border border-amber/20 bg-amber/5 p-4 text-xs leading-6 text-amber">
      <div className="flex items-center gap-2 font-semibold"><AlertTriangle size={16} /> Candidate Registry / installazione sorgente verificata</div>
      <p className="mt-1 text-slate-300">Compilare un modulo Rust può eseguire build script delle dipendenze. Il Module Agent opera senza permessi hardware, senza Docker socket e con un volume proprio. Il catalogo è bloccato a un commit preciso; non è ancora una distribuzione firmata.</p>
    </div>
    {job && <Panel title="Installazione richiesta" subtitle={`Job ${job.job_id.slice(0, 14)}… · ${job.module_id} v${job.version}`} className="mb-6">
      <div className="flex flex-wrap items-center justify-between gap-4 p-5 sm:px-6">
        <div><Pill tone={job.state === 'succeeded' ? 'mint' : job.state === 'failed' ? 'red' : 'amber'}>{job.state === 'running' ? 'COMPILAZIONE / DOWNLOAD' : job.state.toUpperCase()}</Pill>
          <p className="mt-3 text-xs leading-5 text-muted">{job.state === 'succeeded' ? 'Binario installato e integrità verificata nel Registry locale.' : job.state === 'failed' ? (job.error || 'Installazione fallita') : 'Operazione approvata in esecuzione, senza accesso al robot.'}</p></div>
        {working ? <span className="flex items-center gap-2 text-xs text-amber"><RefreshCw size={15} className="animate-spin" /> Aggiornamento automatico</span>
          : <button type="button" className="rounded-lg border border-line px-3 py-2 text-xs text-muted hover:text-white" onClick={() => {setJob(null);setJobId(null);setInstallError(null);localStorage.removeItem(JOB_KEY);}} aria-label="Chiudi dettagli installazione">Chiudi</button>}
      </div>
    </Panel>}
    {installError && <p role="alert" className="mb-4 rounded-xl border border-rose-400/30 bg-rose-500/5 p-4 text-xs text-rose-200">{installError}</p>}
    <Panel title="OpenRGD Software Registry" subtitle={catalog?.source || 'Catalogo interno disponibile anche senza rete'}
      action={<button onClick={() => void loadCatalog()} aria-label="Aggiorna catalogo" type="button" className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs text-slate-200 hover:border-mint/40"><RefreshCw size={14} /> Ricarica</button>}>
      <div className="px-5 pt-5 sm:px-6"><div className="flex flex-wrap gap-2 text-[11px] text-muted"><Pill tone={catalog ? 'mint' : 'amber'}>{catalog ? 'MANAGER CONNECTED' : 'MANAGER OFFLINE'}</Pill><span>Contratto: {catalog?.registry_contract ?? 'non disponibile'}</span></div></div>
      {loading && <div className="p-8 text-center text-xs text-muted">Verifica Registry locale…</div>}
      {!loading && error && <div role="alert" className="px-5 py-6 sm:px-6"><p className="text-xs text-amber">Module Agent non disponibile: {error}</p><p className="mt-2 text-xs leading-5 text-muted">La Console, i dati RGD e la telemetria continuano a funzionare. Controlla i log del servizio module-agent e riprova.</p></div>}
      {!loading && catalog?.catalog.length === 0 && <EmptyState title="Nessun modulo distribuito" message="Il catalogo non dichiara versioni disponibili." />}
      {catalog && <div className="space-y-4 p-5 sm:p-6">{catalog.catalog.map(item => <RegistryModuleCard key={`${item.descriptor.id}:${item.descriptor.version}`} entry={item} onInstall={entry => { setInstallError(null); setSelected(entry); setTyped(''); }} disabled={Boolean(working)} />)}</div>}
    </Panel>
    {catalog?.catalog.some(item => item.descriptor.id === 'org.openrgd.calibration' && item.installation.state === 'ready') && <CalibrationInspector ready />}
    <div className="mt-6"><Panel title="Moduli interni della Console" subtitle="Registro separato da software distribuito esternamente">
      <div className="divide-y divide-line">{bundledModules.map(m => <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6"><div><p className="mono text-xs text-slate-200">{m.id}</p><p className="mt-1 text-[11px] text-muted">v{m.version} · {m.capabilities.join(', ') || 'nessuna capability attiva'}</p></div><Pill tone={m.status === 'installed' ? 'mint' : 'neutral'}>{m.status.replaceAll('_', ' ')}</Pill></div>)}</div>
    </Panel></div>
    {selected && <div role="presentation" className="fixed inset-0 z-[80] grid place-items-center bg-black/75 p-4" onMouseDown={e => { if (e.target === e.currentTarget && !submitting) setSelected(null); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="module-install-title" className="w-full max-w-xl rounded-2xl border border-line bg-[#111d28] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4"><div><div className="eyebrow">EXPLICIT APPROVAL REQUIRED</div><h2 id="module-install-title" className="mt-2 text-lg font-semibold">Installa {selected.descriptor.display_name}</h2></div><button type="button" onClick={() => setSelected(null)} aria-label="Annulla installazione" className="text-muted hover:text-white"><XCircle size={23} /></button></div>
        <div className="mt-5 space-y-3 rounded-xl border border-amber/30 bg-amber/5 p-4 text-xs leading-5 text-slate-200">
          <p><strong>Modulo:</strong> <code>{selected.descriptor.id}@{selected.descriptor.version}</code></p>
          <p><strong>Repository pin:</strong> <code className="break-all">{selected.descriptor.source.commit_sha}</code></p>
          <p><strong>Operazione:</strong> scarica sorgenti OpenRGD e compila dipendenze Rust/Cargo. Le dipendenze possono eseguire script di build, anche se il container è isolato dall'hardware.</p>
          <p><strong>Installazione:</strong> nel volume Docker dedicato `module_data`, senza abilitare motori, firmware, calibrazione attiva o plugin frontend.</p>
        </div>
        <label htmlFor="module_confirmation" className="mt-5 block text-xs font-semibold text-slate-200">Per approvare, digita esattamente:</label>
        <code className="mt-2 block break-all rounded-md bg-[#08131c] p-3 text-xs text-mint">{permissionPhrase}</code>
        <input id="module_confirmation" autoFocus type="text" value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" spellCheck={false}
          className="mt-3 w-full rounded-lg border border-line bg-[#09141c] px-3 py-3 text-sm text-white outline-none focus:border-mint" />
        <div className="mt-6 flex flex-wrap justify-end gap-3"><button type="button" disabled={submitting} onClick={() => setSelected(null)} className="rounded-lg border border-line px-5 py-3 text-xs text-slate-300">Annulla</button>
          <button type="button" onClick={() => void confirmInstall()} disabled={submitting || typed !== permissionPhrase}
            className="inline-flex items-center gap-2 rounded-lg bg-mint px-5 py-3 text-xs font-bold text-[#081817] disabled:opacity-35"><Terminal size={15} /> Conferma e compila</button></div>
      </div>
    </div>}
  </>;
}
