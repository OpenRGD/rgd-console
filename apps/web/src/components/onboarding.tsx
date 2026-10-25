'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Box as BoxIcon, CheckCircle2, CircleAlert, CircleDot,
  ClipboardList, Cpu, FileArchive, FileCheck2, HardDrive, Info, Layers3,
  Link2, LockKeyhole, Network, Plus, RadioTower, RefreshCw, ShieldCheck, UploadCloud,
} from 'lucide-react';
import type { BindingDraft, DiscoveryReport, HostInspection, HostInventory, InstallationDiagnostics, ImportedModel, ReadinessReport, RgdHalInspection, RobotRecord } from '@/lib/contracts';
import { apiGet, apiWrite } from '@/lib/api';
import { EmptyState, Panel, Pill, SectionHeading, StateBlock } from './ui';

const STEPS = [
  { name: 'Installazione', subtitle: 'System overview' },
  { name: 'Import RGD', subtitle: 'Modello & istanza' },
  { name: 'Robot workspace', subtitle: 'Struttura dichiarata' },
  { name: 'Host inventory', subtitle: 'Snapshot passivo' },
  { name: 'Mapping', subtitle: 'HAL RGD & proposte' },
  { name: 'Readiness', subtitle: 'Gap e sicurezza' },
] as const;

function FieldRow({ title, value, caption }: { title: string; value: string; caption?: string }) {
  return <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line py-3 last:border-0">
    <div><div className="text-xs text-slate-300">{title}</div>{caption && <p className="mt-1 max-w-sm text-[11px] text-muted">{caption}</p>}</div>
    <div className="mono max-w-[390px] break-all text-right text-xs text-slate-100">{value}</div>
  </div>;
}

export function ModelSummary({ model, compact = false }: { model: ImportedModel; compact?: boolean }) {
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-3">
      <StateBlock title="Link dichiarati" value={String(model.links.length)} hint="Topologia nominale" icon={<BoxIcon size={17} />} />
      <StateBlock title="Articolazioni" value={String(model.joints.length)} hint="Nessuna posizione osservata" icon={<CircleDot size={17} />} />
      <StateBlock title="Sensori" value={String(model.sensors.length)} hint="Dispositivi non identificati" icon={<RadioTower size={17} />} />
    </div>
    <Panel title="Identità del profilo" subtitle="Estratta dai file RGD, non dall'hardware fisico">
      <div className="px-5 py-3 sm:px-6">
        <FieldRow title="Modello" value={model.name} />
        <FieldRow title="Standard dichiarato" value={model.standard_version ?? 'Non dichiarato'} />
        <FieldRow title="Identità kernel" value={model.kernel_identity ?? 'Non presente'} />
        <FieldRow title="Import" value={model.profile_state.replaceAll('_', ' ')} />
        <FieldRow title="SHA-256 dell'archivio" value={model.source_sha256} caption="Non equivale all'integrity root canonico OpenRGD" />
      </div>
    </Panel>
    {!compact && <Panel title="Articolazioni descritte" subtitle="Limiti nominali in radianti, quando esplicitamente presenti">
      {model.joints.length ? <div className="max-h-[400px] overflow-auto"><table className="w-full min-w-[560px] text-left text-xs"><thead><tr className="border-b border-line text-muted"><th className="px-5 py-3">Joint</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Parent → Child</th><th className="px-5 py-3">Limits</th></tr></thead><tbody className="divide-y divide-line">{model.joints.map(j => <tr key={j.id}><td className="mono px-5 py-3 text-slate-100">{j.id}</td><td className="px-4 py-3 text-muted">{j.joint_type ?? '—'}</td><td className="mono px-4 py-3 text-muted">{j.parent_link ?? '?'} → {j.child_link ?? '?'}</td><td className="mono px-5 py-3 text-slate-300">{j.lower_limit == null ? '?' : j.lower_limit.toFixed(3)} … {j.upper_limit == null ? '?' : j.upper_limit.toFixed(3)}</td></tr>)}</tbody></table></div> : <EmptyState title="Articolazioni non presenti" message="Non genero giunti o geometrie non dichiarati nello standard." icon={<Layers3 size={20} />} />}
    </Panel>}
    <div className="rounded-xl border border-amber/20 bg-amber/5 p-4 text-xs leading-5 text-amber">
      <p className="flex items-center gap-2 font-semibold"><CircleAlert size={15} /> Integrità canonica non verificata</p>
      <p className="mt-2">Il parser della Console produce solo un'anteprima strutturale. Non sostituisce <code>rgd check</code>, non garantisce la completezza geometrica e non autorizza movimenti.</p>
      {!!model.warnings.length && <ul className="mt-3 list-disc space-y-1 pl-4">{model.warnings.slice(0, 10).map((warning, i) => <li key={i}>{warning}</li>)}{model.warnings.length > 10 && <li>Altri {model.warnings.length - 10} avvisi.</li>}</ul>}
    </div>
  </div>;
}

export function OnboardingWizard({ selectedRobot, onCreated }: { selectedRobot: RobotRecord | null; onCreated: (robotId: string) => Promise<void> }) {
  const [step, setStep] = useState(0);
  const [models, setModels] = useState<ImportedModel[]>([]);
  const [modelId, setModelId] = useState('');
  const [robotName, setRobotName] = useState('');
  const [host, setHost] = useState<HostInspection | null>(null);
  const [installDiag, setInstallDiag] = useState<InstallationDiagnostics | null>(null);
  const [hostInventory, setHostInventory] = useState<HostInventory | null>(null);
  const [model, setModel] = useState<ImportedModel | null>(null);
  const [readiness, setReadiness] = useState<ReadinessReport | null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryReport | null>(null);
  const [bindings, setBindings] = useState<BindingDraft[]>([]);
  const [halInspection, setHalInspection] = useState<RgdHalInspection | null>(null);
  const [halError, setHalError] = useState<string | null>(null);
  const [componentId, setComponentId] = useState('');
  const [endpointHint, setEndpointHint] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const robotId = selectedRobot?.rgd_model_id ? selectedRobot.id : null;

  useEffect(() => {
    void apiGet<HostInspection>('/host').then(setHost).catch(() => {});
    void apiGet<InstallationDiagnostics>('/installation/diagnostics').then(setInstallDiag).catch(() => {});
    void apiGet<HostInventory | null>('/host-reports/latest').then(setHostInventory).catch(() => {});
    void apiGet<ImportedModel[]>('/models').then(setModels).catch(() => {});
  }, []);
  const refreshRobotContext = useCallback(async (id: string) => {
    const [details, checks, detected, existing, hal] = await Promise.all([
      apiGet<ImportedModel>(`/robots/${encodeURIComponent(id)}/model`),
      apiGet<ReadinessReport>(`/robots/${encodeURIComponent(id)}/readiness`),
      apiGet<DiscoveryReport>(`/robots/${encodeURIComponent(id)}/discovery`),
      apiGet<BindingDraft[]>(`/robots/${encodeURIComponent(id)}/bindings`),
      apiGet<RgdHalInspection>(`/robots/${encodeURIComponent(id)}/hal-declarations`)
        .then(value => ({ value, error: null as string | null }))
        .catch((reason: unknown) => ({ value: null as RgdHalInspection | null, error: reason instanceof Error ? reason.message : 'HAL non disponibile' })),
    ]);
    setModel(details); setModelId(details.model_id); setReadiness(checks); setDiscovery(detected); setBindings(existing); setHalInspection(hal.value); setHalError(hal.error);
  }, []);
  useEffect(() => {
    if (!robotId) { setReadiness(null); setBindings([]); setDiscovery(null); setModel(null); setHalInspection(null); setHalError(null); return; }
    void refreshRobotContext(robotId).catch(() => setError('Dettagli robot non disponibili dal backend.'));
  }, [robotId, refreshRobotContext]);

  const chosenModel = useMemo(() => models.find(m => m.model_id === modelId) ?? null, [models, modelId]);
  const effectiveModel = model?.model_id === modelId ? model : chosenModel;
  const components = effectiveModel ? [
    ...effectiveModel.joints.map(j => ({ id: j.id, category: 'Joint' })),
    ...effectiveModel.sensors.map(s => ({ id: s.id, category: 'Sensor' })),
    ...effectiveModel.links.map(l => ({ id: l.id, category: 'Link' })),
  ] : [];

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(null); setNotice(null);
    if (!/\.(zip|rgd)$/i.test(file.name)) { setError('Scegli un pacchetto RGD .zip oppure .rgd (archivio ZIP valido).'); return; }
    if (file.size > 8 * 1024 * 1024) { setError('Limite 8 MiB: riduci il bundle prima dell’importazione.'); return; }
    setBusy(true);
    try {
      const data = new FormData(); data.append('file', file, file.name);
      const imported = await apiWrite<ImportedModel>('/models/import', data);
      setModels(existing => [...existing.filter(m => m.model_id !== imported.model_id), imported]);
      setModelId(imported.model_id); setRobotName(imported.name);
      setNotice('Profilo importato per ispezione. Crea ora una distinta istanza fisica.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Import fallito'); }
    finally { setBusy(false); }
  };
  const uploadHostInventory = async (file: File | undefined) => {
    if (!file) return;
    setError(null); setNotice(null);
    if (!file.name.toLowerCase().endsWith('.json') || file.size > 128 * 1024) {
      setError('Il report host deve essere un JSON di massimo 128 KiB.');
      return;
    }
    setBusy(true);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('Formato JSON non valido');
      const imported = await apiWrite<HostInventory>('/host-reports/import', parsed as object);
      setHostInventory(imported);
      setInstallDiag(await apiGet<InstallationDiagnostics>('/installation/diagnostics'));
      if (robotId) await refreshRobotContext(robotId);
      setNotice(`Snapshot host importato: ${imported.report.interfaces.length} endpoint descrittivi. Nessun dispositivo è stato interrogato dalla Console.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Impossibile importare report host'); }
    finally { setBusy(false); }
  };

  const createInstance = async () => {
    if (!modelId || !robotName.trim()) { setError('Seleziona un modello e indica il nome dell’istanza.'); return; }
    setBusy(true); setError(null); setNotice(null);
    try {
      const robot = await apiWrite<RobotRecord>('/instances', { model_id: modelId, name: robotName.trim() });
      await onCreated(robot.id);
      await refreshRobotContext(robot.id);
      setStep(2);
      setNotice(`Istanza ${robot.name} registrata. Nessun dispositivo fisico è stato attivato.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Creazione istanza fallita'); }
    finally { setBusy(false); }
  };
  // Deliberately only populates form fields. An operator must review and
  // explicitly save a PROPOSED_UNVERIFIED draft. Never open CAN or auto-bind.
  const prefillHalDraft = (jointId: string, bus: string, nodeId: number) => {
    setComponentId(jointId);
    setEndpointHint(`${bus} / node ${nodeId} (RGD HAL source only)`);
    setNotice('Campi compilati da una dichiarazione HAL: rivedi e salva manualmente soltanto come bozza NON VERIFICATA.');
    setError(null);
  };

  const saveBinding = async () => {
    if (!robotId || !componentId || !endpointHint.trim()) { setError('Seleziona un componente e inserisci un riferimento descrittivo.'); return; }
    setBusy(true); setError(null); setNotice(null);
    try {
      await apiWrite(`/robots/${encodeURIComponent(robotId)}/bindings`, { component_id: componentId, endpoint_hint: endpointHint });
      await refreshRobotContext(robotId);
      setEndpointHint('');
      setNotice('Associazione salvata come BOZZA NON VERIFICATA. Nessuna connessione hardware.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Binding non salvato'); }
    finally { setBusy(false); }
  };

  const jump = (index: number) => {
    if (index >= 2 && !robotId) { setError('Per proseguire crea prima un’istanza RGD.'); setStep(1); return; }
    setError(null); setNotice(null); setStep(index);
  };

  return <>
    <SectionHeading overline="MODEL-FIRST / FOUNDATION v0.3" title="Robot Onboarding" description="Importa un modello, registra l'istanza fisica e documenta cosa è noto, assente o ancora non verificato. La Console non effettua movimenti." extra={<Pill tone="mint"><ShieldCheck size={13} /> NON ATTUANTE</Pill>} />
    <nav aria-label="Passaggi del wizard" className="mb-6 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">{STEPS.map((stage, i) => <button key={stage.name} type="button" disabled={i >= 2 && !robotId} onClick={() => jump(i)} aria-current={step === i ? 'step' : undefined} className={`rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${step === i ? 'border-mint/40 bg-mint/10' : 'border-line bg-elevated hover:border-slate-500'}`}><span className={`mono text-[10px] ${step === i ? 'text-mint' : 'text-muted'}`}>STEP {String(i + 1).padStart(2, '0')}</span><div className="mt-2 text-xs font-semibold text-slate-100">{stage.name}</div><p className="mt-1 text-[10px] text-muted">{stage.subtitle}</p></button>)}</nav>
    {error && <div role="alert" className="mb-5 rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-xs text-rose-200">{error}</div>}
    {notice && <div role="status" className="mb-5 rounded-xl border border-mint/20 bg-mint/5 p-4 text-xs text-mint">{notice}</div>}

    {step === 0 && <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
      <Panel title="OpenRGD Console è pronta per l'onboarding" subtitle="Nessun middleware o robot specifico richiesto">
        <div className="space-y-4 p-6">
          <div className="rounded-xl border border-mint/20 bg-mint/5 p-5"><FileCheck2 className="text-mint" size={24} /><h3 className="mt-3 text-lg font-semibold">Un solo flusso per qualsiasi robot</h3><p className="mt-2 text-sm leading-6 text-muted">Il modello viene importato e ispezionato prima di cercare hardware. Ogni istanza fisica mantiene una propria identità, distinta dal modello teorico.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">{[
            ['Profilo RGD', 'ZIP con cartella spec/ e moduli Foundation'],
            ['Rete', 'Nessuna connessione necessaria dopo il deploy'],
            ['Hardware', 'Non richiesto durante la prima importazione'],
            ['Sicurezza', 'Nessuna connessione motoria o esecuzione moduli'],
          ].map(([title, caption]) => <div key={title} className="rounded-lg border border-line p-4"><p className="text-sm font-medium">{title}</p><p className="mt-1 text-xs leading-5 text-muted">{caption}</p></div>)}</div>
          {installDiag && <div className="rounded-xl border border-line bg-[#0b141d] p-4 text-xs leading-6 text-slate-300">
            <div className="font-semibold text-slate-100">Diagnostica API · v{installDiag.console_version}</div>
            <div>Persistenza locale: {installDiag.data_directory_present ? 'directory presente' : 'non rilevata'}</div>
            <div>Modelli importati: {installDiag.imported_models}</div>
            <div>Report host: {installDiag.host_report_imported ? 'caricato (non verificato)' : 'non caricato'}</div>
            <div className="text-amber">Validator canonico: da integrare · attuazione: disabilitata</div>
          </div>}
          {robotId && <button type="button" onClick={() => jump(2)} className="rounded-lg border border-line px-4 py-3 text-xs text-slate-200 hover:border-mint/50">Continua con {selectedRobot?.name} <ArrowRight className="ml-1 inline" size={14} /></button>}
        </div>
      </Panel>
      <Panel title="Runtime environment" subtitle="Dati del processo API, non scansione del computer fisico"><div className="p-5 sm:p-6">
        <FieldRow title="Sistema" value={host?.operating_system ?? 'Non disponibile'} />
        <FieldRow title="Distribuzione dell'ambiente" value={host?.environment_distribution ?? 'Non rilevata'} />
        <FieldRow title="Architettura" value={host?.architecture ?? '—'} />
        <FieldRow title="Scope" value={host?.inspection_scope ?? '—'} />
        <FieldRow title="Host verificato" value="NO" caption="In Docker viene rilevato il sistema del container, non l'host Ubuntu/Fedora." />
        <FieldRow title="Controllo motorio" value="DISABILITATO" />
        <button type="button" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-mint px-5 py-3 text-xs font-bold text-[#081817]" onClick={() => jump(1)}>Inizia importazione <ArrowRight size={15} /></button>
      </div></Panel>
    </div>}

    {step === 1 && <div className="grid gap-5 xl:grid-cols-[1.05fr_.95fr]">
      <Panel title="Importa un profilo RGD" subtitle="Pacchetto RGD: .zip o .rgd compatibile contenente spec/">
        <div className="space-y-5 p-6">
          <label className="flex cursor-pointer flex-col items-center rounded-xl border border-dashed border-mint/35 bg-mint/[.035] px-6 py-10 text-center hover:bg-mint/10">
            <UploadCloud size={30} className="text-mint" />
            <span className="mt-3 text-sm font-semibold text-slate-100">{busy ? 'Importazione…' : 'Seleziona pacchetto RGD (.zip / .rgd)'}</span>
            <span className="mt-2 max-w-sm text-xs leading-5 text-muted">Profilo sorgente RGD con spec/, importato per ispezione strutturale. Massimo 8 MiB. Nessun codice viene eseguito.</span>
            <input disabled={busy} type="file" accept=".zip,.rgd,application/zip" className="sr-only" onChange={e => { void upload(e.target.files?.[0]); e.currentTarget.value = ''; }} />
          </label>
          <p className="flex items-start gap-2 text-xs leading-5 text-muted"><Info size={16} className="mt-0.5 shrink-0" />Supportiamo .zip oppure .rgd solo se il contenuto è un archivio ZIP con spec/. I modelli RGD già esistenti come cartelle vanno compressi in ZIP; un singolo JSON rinominato .rgd non basta. L’integrità canonica resta da verificare con rgd check.</p>
          <div className="border-t border-line pt-4"><label htmlFor="model_id" className="block text-xs font-medium text-slate-300">Oppure scegli un modello già importato</label><select id="model_id" value={modelId} onChange={e => { setModelId(e.target.value); const found = models.find(m => m.model_id === e.target.value); if (found) setRobotName(found.name); }} className="mt-2 w-full rounded-lg border border-line bg-[#0a141d] px-3 py-3 text-sm text-white"><option value="">— Seleziona un modello —</option>{models.map(m => <option key={m.model_id} value={m.model_id}>{m.name} · {m.model_id.slice(0, 14)}</option>)}</select></div>
        </div>
      </Panel>
      <Panel title="Crea un'istanza fisica" subtitle="Modello e istanza sono entità diverse"><div className="space-y-4 p-6">
        <div className="rounded-lg border border-line p-4 text-xs leading-5 text-muted"><FileArchive className="mb-2 text-mint" size={21} />{chosenModel ? <><p className="font-semibold text-slate-100">{chosenModel.name}</p><p className="mono mt-2 break-all">{chosenModel.model_id}</p><p className="mt-2 text-amber">{chosenModel.profile_state === 'partial_foundation' ? 'Profilo parziale' : 'Struttura ispezionata'} · integrità canonica da verificare</p></> : 'Nessun modello ancora selezionato.'}</div>
        <label htmlFor="robot_name" className="block text-xs font-medium text-slate-300">Nome dell'istanza</label>
        <input id="robot_name" maxLength={80} value={robotName} onChange={e => setRobotName(e.target.value)} placeholder="Es. Robot laboratorio 01" className="w-full rounded-lg border border-line bg-[#0a141d] px-3 py-3 text-sm text-white placeholder:text-slate-600" />
        <button type="button" onClick={() => void createInstance()} disabled={!chosenModel || !robotName.trim() || busy} className="inline-flex items-center gap-2 rounded-lg bg-mint px-5 py-3 text-xs font-bold text-[#081817] disabled:cursor-not-allowed disabled:opacity-40"><Plus size={15} /> Registra istanza</button>
        <p className="text-xs leading-5 text-muted">La registrazione salva metadati locali. Non installa driver e non collega nessun dispositivo.</p>
      </div></Panel>
    </div>}

    {step === 2 && (model ? <ModelSummary model={model} /> : <Panel><EmptyState title="Nessun modello associato" message="Importa un bundle RGD e registra un'istanza per ispezionarne la struttura." /></Panel>)}

    {step === 3 && <div className="grid gap-5 xl:grid-cols-2">
      <Panel title="Process environment" subtitle="Metadati del container che esegue l'API"><div className="px-6 py-3">
        <FieldRow title="Ambiente" value={host?.inspection_scope ?? 'Sconosciuto'} />
        <FieldRow title="Sistema" value={host?.operating_system ?? '—'} />
        <FieldRow title="Distribuzione" value={host?.environment_distribution ?? '—'} />
        <FieldRow title="Architettura" value={host?.architecture ?? '—'} />
        <FieldRow title="Interrogazione hardware" value="DISABILITATA" />
        <p className="mt-3 text-xs leading-5 text-amber">Questo è il container, non un inventario dei dispositivi fisici collegati al computer.</p>
      </div></Panel>
      <Panel title="Importa inventario passivo dell'host" subtitle="Raccolto esternamente, fornito dall'operatore e NON verificato"><div className="space-y-4 p-6">
        <div className="rounded-xl border border-amber/25 bg-amber/5 p-4 text-xs leading-6 text-slate-200">
          Sul computer Ubuntu/Fedora esegui <code className="mono text-mint">python3 scripts/host-snapshot.py</code>, poi carica qui il file <code>openrgd-host-report.json</code>. Lo script legge soltanto nomi e metadati: non apre CAN, seriali o controller.
        </div>
        <label className="flex cursor-pointer items-center justify-center gap-3 rounded-xl border border-dashed border-mint/30 px-4 py-5 text-sm text-mint hover:bg-mint/5">
          <UploadCloud size={19} /> {busy ? 'Importazione…' : 'Carica report host .json'}
          <input type="file" accept=".json,application/json" disabled={busy} className="sr-only" onChange={e => { void uploadHostInventory(e.target.files?.[0]); e.currentTarget.value = ''; }} />
        </label>
        <FieldRow title="Stato report" value={hostInventory?.verification_state ?? 'non caricato'} />
        <FieldRow title="OS dichiarato" value={hostInventory?.report.platform.pretty_name ?? '—'} />
        <FieldRow title="Interfacce elencate" value={hostInventory ? String(hostInventory.report.interfaces.length) : '—'} />
        <FieldRow title="Raccolto il" value={hostInventory?.report.collected_at ?? '—'} />
        <p className="text-xs leading-5 text-amber">Un endpoint osservato non prova l'identità del controller collegato e non costituisce una mappatura confermata.</p>
      </div></Panel>
      <div className="xl:col-span-2"><Panel title="Endpoint descrittivi" subtitle="Nessun handshake eseguito; niente letture fisiche o controllo">
        {hostInventory?.report.interfaces.length ? <div className="max-h-[360px] divide-y divide-line overflow-auto">{hostInventory.report.interfaces.map(item =>
          <div key={`${item.category}:${item.endpoint}`} className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
            <div><p className="mono text-xs text-slate-100">{item.endpoint}</p><p className="mt-1 text-[11px] text-muted">{item.category.replaceAll('_', ' ')} · {item.evidence_source}</p></div>
            <Pill tone="amber">{item.state.replaceAll('_', ' ')}</Pill>
          </div>)}</div> : <EmptyState title="Nessuna interfaccia importata" message={discovery?.status === 'not_enabled' ? 'La Console non effettua scansioni. Importa uno snapshot passivo oppure prosegui con una bozza manuale.' : 'Nessun report disponibile.'} icon={<Network size={20} />} />}
      </Panel></div>
    </div>}

    {step === 4 && <div className="grid gap-5 xl:grid-cols-[.85fr_1.15fr]">
      <div className="xl:col-span-2">
        <Panel title="HAL dichiarato nel profilo RGD" subtitle="Lettura diretta dall'archivio già importato, senza discovery hardware né binding automatici">
          <div className="space-y-4 p-5 sm:p-6">
            <div className="rounded-lg border border-amber/30 bg-amber/5 p-4 text-xs leading-5 text-amber">
              <p className="font-semibold">DICHIARAZIONI DEL MODELLO ≠ MAPPATURA CAN VERIFICATA</p>
              <p className="mt-2">L'URDF BHL non assegna gli ID fisici. L'HAL può contenere esempi ereditati dal seed: non associamo automaticamente motori e articolazioni e non consideriamo verificato alcun nodo.</p>
              {halInspection?.hal_mapping_id === 'bhl_ros2_hal_v3' && <p className="mt-2 font-semibold">Riconosciuto HAL di esempio OpenRGD ({halInspection.hal_mapping_id}): CAN e ID NON costituiscono la mappatura ufficiale BHL V1/Paky-01.</p>}
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-slate-300">
              <span>Joint nel modello: <strong className="text-white">{effectiveModel?.joints.length ?? 0}</strong></span>
              <span>Driver HAL dichiarati: <strong className="text-white">{halInspection?.declared_actuator_count ?? '—'}</strong></span>
              <span>Riferimenti espliciti a joint: <strong className="text-white">{halInspection?.linked_joint_count ?? '—'}</strong></span>
              <Pill tone="amber">0 BINDING FISICI VERIFICATI</Pill>
            </div>
            {halInspection?.hal_mapping_id && <p className="mono break-all text-[11px] text-muted">HAL: {halInspection.source_path} · {halInspection.hal_mapping_id}</p>}
            {halError && <div role="alert" className="rounded-lg border border-rose-500/25 bg-rose-500/5 p-4 text-xs text-rose-200">Lettura HAL non riuscita: {halError}. Il modello RGD resta disponibile, ma i driver dichiarati non possono essere mostrati fino alla verifica dell'archivio.</div>}
            {!halError && halInspection?.hal_present && halInspection.declarations.length ? (
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full min-w-[780px] text-left text-xs">
                  <thead className="border-b border-line bg-[#0b1923] text-muted"><tr>
                    <th className="px-4 py-3">Attuatore RGD</th><th className="px-4 py-3">Protocollo</th>
                    <th className="px-4 py-3">Interfaccia</th><th className="px-4 py-3">Node ID</th>
                    <th className="px-4 py-3">Joint esplicito</th><th className="px-4 py-3">Esito / bozza</th>
                  </tr></thead>
                  <tbody className="divide-y divide-line">
                    {halInspection.declarations.map(item => {
                      const reportedHost = hostInventory?.report.interfaces.some(dev => dev.endpoint === item.bus_interface) ?? false;
                      const mayPrepare = item.joint_id && item.bus_interface && item.device_node_id !== null;
                      return <tr key={item.source_key}>
                        <td className="mono px-4 py-3 text-slate-100">{item.logical_actuator_ref ?? item.source_key}<div className="mt-1 text-[10px] text-muted">{item.source_key}</div></td>
                        <td className="mono px-4 py-3 text-muted">{item.communication_protocol ?? '—'}</td>
                        <td className="mono px-4 py-3">{item.bus_interface ?? '—'}<div className="mt-1 text-[10px] text-amber">{reportedHost ? 'Nome presente nello snapshot host (non verificato)' : 'Interfaccia non riscontrata nello snapshot host'}</div></td>
                        <td className="mono px-4 py-3 text-slate-100">{item.device_node_id ?? '—'}</td>
                        <td className="mono px-4 py-3">{item.joint_id ?? 'NON RISOLTO'}</td>
                        <td className="px-4 py-3">
                          {mayPrepare ? <button type="button" className="rounded-md border border-amber/40 px-3 py-2 text-[11px] text-amber hover:bg-amber/10" onClick={() => prefillHalDraft(item.joint_id!, item.bus_interface!, item.device_node_id!)}>Prepara bozza</button>
                            : <Pill tone="red">RIFERIMENTO NON COLLEGATO</Pill>}
                        </td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
            ) : !halError && <EmptyState title={halInspection?.hal_present ? 'HAL senza driver motori' : 'Nessun HAL leggibile in questo archivio'} message="Per compilare il mapping CAN bisogna disporre di riferimenti HAL espliciti al joint e di evidenze fisiche. Il profilo può comunque essere validato staticamente." icon={<Network size={21} />} />}
            <p className="text-[11px] leading-5 text-muted">Lettura non attuante del modulo 01_foundation/hal_mapping.jsonc. Il percorso positivo del Boot Manager verifica l'integrità del profilo, non l'identità dei controller o la compatibilità HAL con il corpo.</p>
          </div>
        </Panel>
      </div>
      <Panel title="Proponi un'associazione" subtitle="Un binding salvato NON viene mai applicato all'hardware"><div className="space-y-4 p-6">
        <p className="rounded-lg border border-amber/20 bg-amber/5 p-4 text-xs leading-5 text-amber">Nessun device discovery verificato. Puoi soltanto annotare una proposta manuale associata a un componente effettivamente dichiarato nel modello.</p>
        <label className="block text-xs text-slate-300" htmlFor="component_id">Componente logico</label>
        <select id="component_id" value={componentId} onChange={e => setComponentId(e.target.value)} className="w-full rounded-lg border border-line bg-[#0a141d] px-3 py-3 text-xs text-slate-100"><option value="">— Scegli un componente —</option>{components.map(c => <option key={`${c.category}:${c.id}`} value={c.id}>{c.category}: {c.id}</option>)}</select>
        {Boolean(hostInventory?.report.interfaces.length) && <><label className="block text-xs text-slate-300" htmlFor="observed_endpoint">Scegli un endpoint dallo snapshot (facoltativo)</label>
          <select id="observed_endpoint" value={hostInventory?.report.interfaces.find(item => item.endpoint === endpointHint)?.endpoint ?? ''} onChange={e => setEndpointHint(e.target.value)} className="w-full rounded-lg border border-line bg-[#0a141d] px-3 py-3 text-xs text-slate-100">
            <option value="">— Solo suggerimenti non verificati —</option>
            {hostInventory?.report.interfaces.map(item => <option key={`${item.category}:${item.endpoint}`} value={item.endpoint}>{item.category}: {item.endpoint} ({item.state})</option>)}
          </select></>}
        <label className="block text-xs text-slate-300" htmlFor="endpoint_hint">Endpoint ipotizzato</label>
        <input id="endpoint_hint" value={endpointHint} maxLength={180} onChange={e => setEndpointHint(e.target.value)} placeholder="Es. bus0 / controller XY / address ?" className="w-full rounded-lg border border-line bg-[#0a141d] px-3 py-3 text-xs text-slate-100 placeholder:text-slate-600" />
        <button disabled={!componentId || !endpointHint.trim() || busy} type="button" className="inline-flex items-center gap-2 rounded-lg border border-mint/40 bg-mint/10 px-4 py-3 text-xs font-semibold text-mint disabled:opacity-40" onClick={() => void saveBinding()}><Link2 size={15} /> Salva bozza non verificata</button>
      </div></Panel>
      <Panel title="Proposte locali" subtitle="Stato unico: proposed_unverified"><div className="divide-y divide-line">{bindings.length ? bindings.map(binding => <div key={binding.id} className="flex flex-wrap justify-between gap-4 px-6 py-4"><div><p className="mono text-xs text-slate-100">{binding.component_id}</p><p className="mono mt-1 text-xs text-muted">→ {binding.endpoint_hint}</p><p className="mt-1 text-[10px] text-muted">Registrato: {new Date(binding.created_at).toLocaleString('it-IT')}</p></div><Pill tone="amber">NON VERIFICATO</Pill></div>) : <EmptyState title="Nessuna associazione" message="Il modello resta leggibile anche senza binding fisici. Puoi proseguire direttamente allo stato di readiness." icon={<Link2 size={21} />} />}</div></Panel>
    </div>}

    {step === 5 && <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
      <Panel title="Readiness del robot" subtitle="Ogni stato deve essere fondato su una fonte verificabile"><div className="divide-y divide-line">{readiness?.checks.map(check => <div key={check.key} className="flex flex-wrap items-center justify-between gap-4 px-6 py-4"><div className="min-w-0 flex-1"><h3 className="mono text-xs text-slate-100">{check.key.replaceAll('_', ' ')}</h3><p className="mt-1 text-xs leading-5 text-muted">{check.detail}</p></div><Pill tone={check.state === 'structurally_inspected' ? 'mint' : check.state === 'blocked' ? 'red' : 'amber'}>{check.state.replaceAll('_', ' ')}</Pill></div>)}{!readiness && <EmptyState title="Readiness non ancora disponibile" message="Seleziona un'istanza RGD." />}</div></Panel>
      <Panel title="Esito dell'onboarding" subtitle="Non rappresenta una certificazione di sicurezza"><div className="space-y-4 p-6"><div className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-5"><LockKeyhole className="text-rose-300" size={24} /><p className="mt-3 text-base font-semibold">Movimento non autorizzato</p><p className="mt-2 text-xs leading-5 text-muted">L'integrità canonica, la connessione al runtime, la calibrazione e la mappatura dei dispositivi non sono state verificate.</p></div><FieldRow title="Proposte mapping" value={String(bindings.length)} /><FieldRow title="Binding confermati" value="0" /><FieldRow title="Attuazione" value="DISABILITATA" /><button type="button" className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-3 text-xs hover:border-mint/40" onClick={() => robotId && void refreshRobotContext(robotId)}><RefreshCw size={14} /> Aggiorna report</button></div></Panel>
    </div>}

    <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
      <button type="button" disabled={step === 0} onClick={() => jump(step - 1)} className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2.5 text-xs text-slate-300 disabled:opacity-30"><ArrowLeft size={15} /> Indietro</button>
      <span className="text-xs text-muted">STEP {step + 1} / {STEPS.length} · {robotId ? selectedRobot?.name : 'Nessuna istanza selezionata'}</span>
      {step < 5 && <button type="button" disabled={step === 1 && !robotId} onClick={() => jump(step + 1)} className="inline-flex items-center gap-2 rounded-lg border border-mint/30 bg-mint/10 px-4 py-2.5 text-xs font-semibold text-mint disabled:cursor-not-allowed disabled:opacity-30">Avanti <ArrowRight size={15} /></button>}
    </div>
  </>;
}
