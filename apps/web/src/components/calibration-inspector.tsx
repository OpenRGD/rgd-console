'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSearch, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { apiGet, apiWrite } from '@/lib/api';
import type { CalibrationInspection, CalibrationParameter, RobotRecord } from '@/lib/contracts';
import { EmptyState, Panel, Pill } from './ui';

const validEnvelope = (value: unknown): value is CalibrationInspection => {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<CalibrationInspection>;
  const inspected = result.inspection;
  const report = inspected?.report;
  return result.schema_version === 'console.calibration-inspection.v0.4b'
    && result.actuation_enabled === false
    && result.physical_calibration_certified === false
    && result.source_integrity === 'canonical_not_verified'
    && inspected?.inspection_contract === 'console.passive-calibration.v0.4b'
    && inspected?.actuation_enabled === false
    && inspected?.physical_calibration_certified === false
    && !!report && report.report_version === '0.2.0'
    && report.profile_id === null && report.profile_state === null
    && report.profile_binding === 'no_profile' && report.export_preview === null
    && !!report.coverage && report.coverage.saved_evidence_fields === 0
    && report.current_robot_position_observed === false
    && report.physical_drift_evaluated === false
    && report.claims_physical_calibration_certified === false
    && Array.isArray(report.parameters) && report.parameters.every(p => !!p && Array.isArray(p.stored_measurements)
      && p.stored_measurements.length === 0 && (p.coverage === 'absent' || p.coverage === 'declared_only'))
    && Array.isArray(report.findings) && Array.isArray(report.source_digests)
    && report.source_digests.length > 0;
};

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return 'Non dichiarato';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function CoverageCard({ name, count, hint }: { name: string; count: number; hint: string }) {
  return <div className="rounded-xl border border-line bg-[#101d28] p-4">
    <div className="eyebrow">{name}</div>
    <div className="mono mt-3 text-2xl font-semibold text-slate-50">{count}</div>
    <p className="mt-1 text-[11px] leading-5 text-muted">{hint}</p>
  </div>;
}

function ParameterRow({ parameter }: { parameter: CalibrationParameter }) {
  return <tr className="border-t border-line align-top text-xs">
    <td className="px-4 py-3"><p className="mono break-all text-slate-200">{parameter.component_id}</p><p className="mt-1 text-[10px] text-muted">{parameter.component_kind}</p></td>
    <td className="max-w-[240px] break-all px-4 py-3 font-mono text-[11px] text-muted">{parameter.parameter_ref}</td>
    <td className="max-w-[170px] break-all px-4 py-3 font-mono text-[11px] text-slate-300">{stringifyValue(parameter.nominal_value)}</td>
    <td className="max-w-[170px] break-all px-4 py-3 font-mono text-[11px] text-slate-200">{stringifyValue(parameter.declared_value)}</td>
    <td className="px-4 py-3"><Pill tone={parameter.coverage === 'saved_evidence' ? 'mint' : 'amber'}>{parameter.coverage.replaceAll('_', ' ')}</Pill></td>
  </tr>;
}

export function CalibrationInspector({ ready }: { ready: boolean }) {
  const [robots, setRobots] = useState<RobotRecord[]>([]);
  const [robotId, setRobotId] = useState('');
  const [inspection, setInspection] = useState<CalibrationInspection | null>(null);
  const [running, setRunning] = useState(false);
  const [loadingLast, setLoadingLast] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'joint' | 'sensor'>('all');

  const refreshRobots = useCallback(async () => {
    try {
      const list = await apiGet<RobotRecord[]>('/robots');
      const eligible = list.filter(robot => robot.kind === 'physical' && !!robot.rgd_model_id);
      setRobots(eligible);
      setRobotId(previous => eligible.find(robot => robot.id === previous)?.id ?? eligible[0]?.id ?? '');
    } catch { setMessage('Impossibile caricare le istanze robot dalla Console.'); }
  }, []);

  useEffect(() => { void refreshRobots(); }, [refreshRobots]);
  useEffect(() => {
    if (!robotId) { setInspection(null); return; }
    let active = true;
    setInspection(null); setLoadingLast(true); setMessage(null);
    void apiGet<CalibrationInspection | null>(`/robots/${encodeURIComponent(robotId)}/calibration/last`)
      .then(value => {
        if (!active) return;
        if (value && validEnvelope(value) && value.robot_id === robotId) setInspection(value);
        else if (value) setMessage('Report storico non compatibile con la policy passiva attuale; rieseguire l’ispezione. Nessun dato salvato viene cancellato.');
      }).catch(() => { if (active) setMessage('Report precedente non disponibile.'); })
      .finally(() => { if (active) setLoadingLast(false); });
    return () => { active = false; };
  }, [robotId]);

  const selectedRobot = robots.find(r => r.id === robotId) ?? null;
  const inspectedReport = inspection?.inspection.report;
  const filteredParameters = useMemo(() => inspectedReport?.parameters.filter(p => filter === 'all' || p.component_kind === filter) ?? [], [inspectedReport, filter]);

  const run = async () => {
    if (!ready || !robotId || running) return;
    setRunning(true); setMessage(null);
    try {
      const payload = await apiWrite<CalibrationInspection>(`/robots/${encodeURIComponent(robotId)}/calibration/inspect`, {});
      if (!validEnvelope(payload) || payload.robot_id !== robotId) throw new Error('Risposta Calibration con invarianti di sicurezza inattesi');
      setInspection(payload);
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Ispezione non disponibile'); }
    finally { setRunning(false); }
  };

  const download = () => {
    if (!inspection) return;
    const blob = new Blob([JSON.stringify(inspection, null, 2)], {type: 'application/json'});
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href; anchor.download = `openrgd-calibration-passive-${inspection.robot_id}.json`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  };

  return <section id="calibration-passive-inspector" className="mt-7 scroll-mt-28">
    <Panel title="Calibration · Passive Inspection" subtitle="CAL-0.2 · il report analizza il profilo RGD, non misura il robot fisico">
      <div className="space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-mint/20 bg-mint/[.04] px-4 py-4">
          <div><p className="flex items-center gap-2 text-sm font-medium text-slate-100"><ShieldCheck size={17} className="text-mint" /> Calibration software: {ready ? 'ready' : 'not ready'}</p>
            <p className="mt-1 text-xs leading-5 text-muted">L'esecuzione è manuale e read-only. Non legge CAN, encoder o controller. Non genera correzioni applicate.</p>
          </div>
          <Pill tone="amber">NO PHYSICAL CALIBRATION CLAIMS</Pill>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <label className="min-w-[245px] flex-1 text-xs font-medium text-slate-300" htmlFor="calibration-robot">
            Istanza robot collegata a un modello RGD
            <select id="calibration-robot" value={robotId} onChange={e => setRobotId(e.target.value)} className="mt-2 block w-full rounded-lg border border-line bg-[#0a141d] px-3 py-3 text-sm text-white" disabled={running || !robots.length}>
              {robots.length ? robots.map(robot => <option key={robot.id} value={robot.id}>{robot.name} · {robot.id}</option>) : <option value="">Nessun modello importato</option>}
            </select>
          </label>
          <button type="button" onClick={() => void refreshRobots()} disabled={running} className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-3 text-xs text-slate-200 hover:border-mint/40"><RefreshCw size={15} /> Ricarica istanze</button>
          <button type="button" onClick={() => void run()} disabled={!ready || !robotId || running || loadingLast} className="inline-flex items-center gap-2 rounded-lg bg-mint px-5 py-3 text-xs font-bold text-[#071c19] disabled:cursor-not-allowed disabled:opacity-30"><FileSearch size={16} /> {running ? 'Analisi in corso…' : 'Ispeziona profilo RGD'}</button>
        </div>
        {!robots.length && <div className="rounded-xl border border-amber/20 bg-amber/5 p-4 text-xs leading-6 text-amber">Nessuna istanza fisica collegata a un modello. Prima carica un bundle RGD e registra un'istanza in <Link className="underline" href="/onboarding">Onboarding</Link>. Non è necessario accendere Paky-01.</div>}
        {message && <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/5 p-4 text-xs text-rose-200">{message}</p>}
        {loadingLast && <p className="text-xs text-muted">Ricerca ultimo report salvato…</p>}
        {inspectedReport && inspection && <>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            <div><h3 className="text-sm font-semibold text-slate-100">Report passivo — {inspectedReport.model_id}</h3>
              <p className="mt-1 text-[11px] text-muted">Istanza {selectedRobot?.name} · {new Date(inspection.generated_at).toLocaleString('it-IT')}</p></div>
            <button type="button" onClick={download} className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2.5 text-xs text-slate-100 hover:border-mint/40"><Download size={15} /> Esporta JSON</button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <CoverageCard name="CANDIDATI" count={inspectedReport.coverage.candidate_fields} hint="Parametri esaminati" />
            <CoverageCard name="DICHIARATI" count={inspectedReport.coverage.declared_fields} hint="Valori nel profilo" />
            <CoverageCard name="STORICI" count={inspectedReport.coverage.saved_evidence_fields} hint="Route senza profilo CAL: nessuna misura storica importata" />
            <CoverageCard name="SENZA MISURE" count={inspectedReport.coverage.without_saved_measurements} hint="Nessuna osservazione storica" />
            <CoverageCard name="ANOMALIE" count={inspectedReport.findings.filter(x => x.severity === 'warning').length} hint="Coerenza dichiarativa" />
          </div>
          <div className="rounded-xl border border-amber/25 bg-amber/5 p-4 text-xs leading-5 text-amber">
            <p className="flex items-center gap-2 font-semibold"><AlertTriangle size={16} /> Esito non certificato</p>
            <p className="mt-2">Sorgente RGD: integrità canonica non verificata. Report dichiarativo salvato; per rivalidare i byte della sorgente rieseguire l’ispezione. Nessuna posizione reale osservata, nessuna deriva misurata, nessuna calibrazione approvata. <strong>Movimenti disabilitati.</strong></p>
            <p className="mono mt-2 break-all text-[10px] text-muted">Archivio SHA-256: {inspection.source_profile_sha256}</p>
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold">Parameter inventory</h3><label className="text-xs text-muted">Visualizza <select value={filter} onChange={e => setFilter(e.target.value as typeof filter)} className="ml-2 rounded-lg border border-line bg-[#09151f] px-2 py-2 text-slate-200"><option value="all">Tutti</option><option value="joint">Joint</option><option value="sensor">Sensor</option></select></label></div>
            {filteredParameters.length ? <div className="overflow-x-auto rounded-xl border border-line"><table className="w-full min-w-[750px] text-left"><thead><tr className="bg-[#101b25] text-[11px] uppercase tracking-wide text-muted"><th className="px-4 py-3">Componente</th><th className="px-4 py-3">Parametro</th><th className="px-4 py-3">Nominale</th><th className="px-4 py-3">Dichiarato</th><th className="px-4 py-3">Copertura</th></tr></thead><tbody>{filteredParameters.map(p => <ParameterRow key={p.parameter_ref} parameter={p} />)}</tbody></table></div> : <EmptyState title="Nessun parametro per questo filtro" message="La struttura RGD potrebbe essere parziale. Nessuna misura viene inventata." />}
          </div>
          <div><h3 className="mb-3 text-sm font-semibold">Findings ({inspectedReport.findings.length})</h3>
            {inspectedReport.findings.length ? <div className="space-y-2">{inspectedReport.findings.map((finding, index) => <div key={`${finding.code}-${index}`} className="rounded-lg border border-line bg-[#0c1621] p-4 text-xs"><div className="flex flex-wrap items-center gap-2"><Pill tone={finding.severity === 'warning' ? 'amber' : 'neutral'}>{finding.severity}</Pill><code className="text-slate-100">{finding.code}</code></div><p className="mt-2 leading-5 text-slate-300">{finding.detail}</p><p className="mono mt-1 break-all text-[10px] text-muted">{finding.reference}</p></div>)}</div> : <div className="rounded-xl border border-line p-4 text-xs text-muted">Nessun finding prodotto dai dati dichiarati. Questo non dimostra una calibrazione fisica valida.</div>}</div>
        </>}
      </div>
    </Panel>
  </section>;
}
