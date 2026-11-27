'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useState, type CSSProperties } from 'react';
import {
  Activity, ArrowLeft, BatteryCharging, Box as BodyIcon, ChevronDown, CircleDot,
  Clock3, Cpu, Expand, Gauge, HeartPulse, LockKeyhole,
  Settings2, ShieldCheck, Signal, Zap, Power,
} from 'lucide-react';
import { useConsole } from '@/hooks/use-console';
import { ImuPanel } from '@/components/imu-panel';
import { useLiveDisplay } from '@/hooks/use-live-display';
import { apiGet } from '@/lib/api';
import type { BootReport, ConsoleEvent, Measurement, ImportedModel, TelemetrySnapshot } from '@/lib/contracts';
import { useNow } from '@/components/ui';
import './robot-live.css';

type LiveView = 'overview' | 'cage' | 'signals' | 'activity';

// Load WebGL only when the operator opens the 3D panel; keep default Live lightweight.
const TorsoCagePreview = dynamic(() => import('@/components/torso-cage-preview'), {
  ssr: false,
  loading: () => <p className="live-note" role="status">Caricamento anteprima gabbia 3D…</p>,
});
type CatalogStatus = 'ready' | 'source_only' | 'not_installed' | 'tampered' | 'unknown';
interface RegistryResponse {
  catalog: Array<{ descriptor: { id: string }; installation: { state: string } }>;
}

function hasFreshReading(value: Measurement | undefined | null, now: number, wsLive: boolean): value is Measurement & { value: number } {
  if (!wsLive || !value || value.value == null || !Number.isFinite(value.value) || !value.measured_at) return false;
  const age = now - Date.parse(value.measured_at);
  return Number.isFinite(age) && age >= -10000 && age <= 5000;
}

function formattedReading(metric: Measurement | null | undefined, now: number, wsLive: boolean, fractionDigits = 2): string {
  if (!hasFreshReading(metric, now, wsLive)) return '—';
  return `${metric.value.toLocaleString('it-IT', { maximumFractionDigits: fractionDigits })} ${metric.unit}`;
}

function StatValue({ label, value, caption, tone = 'normal' }: { label: string; value: string; caption: string; tone?: 'normal' | 'warning' | 'healthy' }) {
  return <div className="live-stat"><div className="live-stat-label">{label}</div>
    <div className={`live-stat-value ${tone === 'warning' ? 'live-text-warning' : tone === 'healthy' ? 'live-text-ok' : ''}`}>{value}</div>
    <div className="live-stat-caption">{caption}</div>
  </div>;
}

function Tile({ heading, icon, children, secondary = false }: { heading: string; icon: React.ReactNode; children: React.ReactNode; secondary?: boolean }) {
  return <section className={`live-card ${secondary ? 'live-card-secondary' : ''}`}>
    <div className="live-card-title">{icon}<span>{heading}</span></div>{children}
  </section>;
}

function MeterGrid({ snapshot, now, wsLive }: { snapshot: TelemetrySnapshot | null; now: number; wsLive: boolean }) {
  const metric = snapshot?.power;
  const quality = snapshot?.source_kind === 'simulated' ? 'SINTETICO' : 'SORGENTE FISICA';
  const connected = wsLive && snapshot?.connection_state === 'connected';
  return <div className="live-stat-row live-meter-grid">
    <StatValue label="TENSIONE" value={formattedReading(metric?.voltage, now, connected)} caption={hasFreshReading(metric?.voltage, now, connected) ? quality : 'Nessuna misura attuale'} />
    <StatValue label="CORRENTE" value={formattedReading(metric?.current, now, connected)} caption={hasFreshReading(metric?.current, now, connected) ? quality : 'Nessuna misura attuale'} />
    <StatValue label="POTENZA" value={formattedReading(metric?.power, now, connected)} caption={hasFreshReading(metric?.power, now, connected) ? quality : 'Nessuna misura attuale'} />
  </div>;
}

function EventRows({ events, expanded = false }: { events: ConsoleEvent[]; expanded?: boolean }) {
  if (!events.length) return <p className="live-note">Nessun evento prodotto dalla sorgente selezionata. Non sono stati simulati Chronon o pensieri.</p>;
  return <ol className={`live-event-list ${expanded ? 'live-event-list-wide' : ''}`}>
    {events.slice(0, expanded ? 30 : 2).map(e => <li key={e.event_id} className="live-event-row">
      <span className="live-event-dot" aria-hidden="true" />
      <div className="live-event-body"><strong>{e.title}</strong><small>{e.event_kind} · {e.source_kind === 'simulated' ? 'SIMULATO' : e.evidence_class === 'console_diagnostic_not_chronon' ? 'DIAGNOSTICA CONSOLE' : 'SORGENTE FISICA'} · {new Date(e.observed_at).toLocaleTimeString('it-IT')}</small></div>
    </li>)}
  </ol>;
}

export function RobotLive({ embedded = false }: { embedded?: boolean } = {}) {
  const [settings] = useLiveDisplay();
  const [view, setView] = useState<LiveView>('overview');
  const [isEmbedded, setEmbedded] = useState(embedded);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState(false);
  const [calibrationStatus, setCalibrationStatus] = useState<CatalogStatus>('unknown');
  const [bootStatus, setBootStatus] = useState<BootReport['status'] | 'offline'>('offline');
  const [clockHydrated, setClockHydrated] = useState(false);
  const [importedModel, setImportedModel] = useState<ImportedModel | null>(null);
  const { robots, selectedRobot, selectRobot, snapshot, imu, events, status, streamStatus, apiError } = useConsole();
  const now = useNow();

  useEffect(() => {
    const controller = new AbortController();
    const readBoot = async () => {
      try {
        const result = await apiGet<BootReport>('/boot/status', controller.signal);
        if (!controller.signal.aborted) setBootStatus(result.status);
      } catch { if (!controller.signal.aborted) setBootStatus('offline'); }
    };
    void readBoot();
    const interval = window.setInterval(() => void readBoot(), 15000);
    return () => { controller.abort(); window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    setEmbedded(embedded || new URLSearchParams(window.location.search).get('embedded') === '1');
    setClockHydrated(true);
    const changed = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, [embedded]);

  useEffect(() => {
    const abort = new AbortController();
    const refresh = async () => {
      try {
        const result = await apiGet<RegistryResponse>('/modules/catalog', abort.signal);
        const entry = result.catalog?.find(x => x.descriptor?.id === 'org.openrgd.calibration');
        const state = entry?.installation?.state;
        if (!abort.signal.aborted) setCalibrationStatus(state === 'ready' || state === 'source_only' || state === 'not_installed' || state === 'tampered' ? state : 'unknown');
      } catch { if (!abort.signal.aborted) setCalibrationStatus('unknown'); }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30000);
    return () => { abort.abort(); window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    setImportedModel(null);
    if (selectedRobot?.rgd_model_id) {
      void apiGet<ImportedModel>(`/robots/${encodeURIComponent(selectedRobot.id)}/model`, abort.signal)
        .then(data => { if (!abort.signal.aborted) setImportedModel(data); })
        .catch(() => {});
    }
    return () => abort.abort();
  }, [selectedRobot?.id, selectedRobot?.rgd_model_id]);

  const liveWebSocket = streamStatus === 'live' && !apiError;
  const correctSnapshot = !!selectedRobot && snapshot?.robot_id === selectedRobot.id;
  const currentSnapshot = correctSnapshot ? snapshot : null;
  const physical = selectedRobot?.kind === 'physical';
  const isSimulator = selectedRobot?.kind === 'simulated';
  const adapterSimulated = isSimulator && currentSnapshot?.source_kind === 'simulated';
  const hardwareConnected = physical && currentSnapshot?.source_kind === 'physical' && liveWebSocket && currentSnapshot.connection_state === 'connected';
  const nowReadable = clockHydrated ? new Date(now).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--';
  const knownMeasuredPositions = hardwareConnected ? (currentSnapshot?.motors ?? []).filter(x => hasFreshReading(x.position, now, liveWebSocket)).length : 0;
  const sourceLabel = isSimulator ? 'SIMULATORE' : physical ? 'ROBOT FISICO' : 'SORGENTE NON DEFINITA';
  const runtimeLabel = status?.physical_runtime_connected ? 'CONNESSO' : 'NON CONNESSO';
  const selectedEventRows = events.filter(e => e.robot_id === selectedRobot?.id);
  const style = { '--live-scale': settings.text_scale } as CSSProperties;

  const requestFullscreen = async () => {
    setFullscreenError(false);
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else setFullscreenError(true);
    } catch { setFullscreenError(true); }
  };

  return <main id="live-main" className={`live-shell ${settings.contrast === 'high' ? 'live-high-contrast' : ''} ${settings.reduced_motion ? 'live-reduced-motion' : ''} ${isEmbedded ? 'live-embedded' : ''}`} style={style}>
    <a className="live-skip" href="#live-panels">Vai ai pannelli</a>
    <header className="live-header">
      <div className="live-brand"><CircleDot aria-hidden="true" size={23} /><div><strong>Open<span>RGD</span></strong><small>LIVE / v0.4.3</small></div></div>
      <div className="live-context">
        <label htmlFor="live-robot" className="live-hidden-label">Robot visualizzato</label>
        <select id="live-robot" disabled={!robots.length} value={selectedRobot?.id ?? ''} onChange={e => selectRobot(e.target.value)}>
          {!robots.length ? <option value="">Robot non disponibile</option> : robots.map(r => <option value={r.id} key={r.id}>{r.name}</option>)}
        </select><ChevronDown aria-hidden="true" size={13} />
      </div>
      <div className="live-header-state" role="status">
        <span className={`live-pulse ${liveWebSocket ? 'live-pulse-ok' : 'live-pulse-warn'}`} aria-hidden="true" />
        <span>{liveWebSocket ? 'WS ONLINE' : 'WS OFFLINE'}</span>
      </div>
      <div className="live-local-clock"><Clock3 aria-hidden="true" size={13} /> {nowReadable}</div>
      {!isEmbedded && <div className="live-header-actions">
        <button title={fullscreen ? 'Esci da fullscreen' : 'Fullscreen del browser'} aria-label={fullscreen ? 'Esci da fullscreen' : 'Fullscreen del browser'} onClick={() => void requestFullscreen()} type="button"><Expand size={17} /></button>
        <Link title="Boot &amp; Recovery" aria-label="Boot &amp; Recovery" href="/boot"><Power size={17} /></Link>
        <Link title="Configura display" aria-label="Configura display" href="/live/configure"><Settings2 size={17} /></Link>
        <Link title="Torna alla Console" aria-label="Torna alla Console" href="/overview"><ArrowLeft size={17} /></Link>
      </div>}
    </header>

    <div className="live-identity" aria-live="polite">
      <span className={`live-source-pill ${isSimulator ? 'live-source-sim' : 'live-source-physical'}`}>{sourceLabel}</span>
      <span className="live-short-name">{selectedRobot?.name ?? 'Nessun robot selezionato'}</span>
      <span className="live-identity-spacer" />
      <span className="live-security"><LockKeyhole aria-hidden="true" size={12} /> CONTROLLO MOTORI DISABILITATO</span>
    </div>

    {apiError && <div className="live-alert" role="alert">API non disponibile · dati fisici non osservati</div>}
    {fullscreenError && <div className="live-alert" role="alert">Fullscreen non consentito dal browser: puoi usare la modalità kiosk di Firefox quando la configureremo.</div>}
    {bootStatus === 'recovery_required' && <div className="live-alert" role="alert">Boot profile: verifica fallita. <Link href="/boot">Apri Recovery</Link>. Nessuna attuazione consentita.</div>}

    <div id="live-panels" className="live-content">
      {view === 'overview' && <div className={`live-grid live-count-${Object.values(settings.visible_panels).filter(Boolean).length}`}>
        {settings.visible_panels.body && <div className="live-grid-body"><Tile heading="BODY / STATO CORPOREO" icon={<BodyIcon size={15} aria-hidden="true" />}>
          <div className="live-body-summary"><div className="live-body-icon"><BodyIcon size={34} strokeWidth={1.1} aria-hidden="true" /></div><div><strong>{importedModel?.name ?? 'Nessun modello RGD associato'}</strong><small>{importedModel ? 'Topologia dichiarata · posa reale non ricostruita' : 'Carica un profilo da Onboarding per conoscere il corpo'}</small></div></div>
          <div className="live-stat-row live-body-numbers"><StatValue label="JOINT RGD" value={importedModel ? `${importedModel.joints.length}` : '—'} caption="dichiarati" /><StatValue label="ENCODER REALI" value={physical && hardwareConnected ? String(knownMeasuredPositions) : '—'} caption={physical && hardwareConnected ? 'posizioni osservate' : 'non osservati'} /><StatValue label="CALIBRAZIONE" value="—" caption="non valutata" tone="warning" /></div>
          {physical && <ImuPanel imu={imu?.robot_id === selectedRobot?.id ? imu : null} connected={liveWebSocket} now={now} compact />}
        </Tile></div>}
        {settings.visible_panels.signals && <div className="live-grid-signals"><Tile heading="ELECTRONICS / TELEMETRIA" icon={<Zap size={15} aria-hidden="true" />}>
          <MeterGrid snapshot={currentSnapshot} wsLive={liveWebSocket} now={now} />
          <div className="live-mini-detail"><Signal size={13} /><span>BUS: {currentSnapshot?.can.bus_state === 'simulated' && liveWebSocket ? 'SIMULATO' : hardwareConnected ? currentSnapshot?.can.bus_state : 'NON VERIFICATO'}</span></div>
        </Tile></div>}
        <div className="live-grid-status"><Tile heading="SERVIZI / STATO" icon={<Cpu size={15} aria-hidden="true" />} secondary>
          <div className="live-service-row"><span>Console API</span><strong className={status ? 'live-text-ok' : 'live-text-warning'}>{status ? 'ONLINE' : 'OFFLINE'}</strong></div>
          <div className="live-service-row"><span>Somatic Runtime</span><strong className={status?.physical_runtime_connected ? 'live-text-ok' : 'live-text-warning'}>{runtimeLabel}</strong></div>
          <div className="live-service-row"><span>Calibration software</span><strong>{calibrationStatus.replaceAll('_',' ').toUpperCase()}</strong></div>
          <div className="live-service-row"><span>Boot RGD</span><strong className={bootStatus === 'ready_non_actuating' ? 'live-text-ok' : 'live-text-warning'}>{bootStatus.replaceAll('_',' ').toUpperCase()}</strong></div>
        </Tile></div>
        {settings.visible_panels.activity && <div className="live-grid-activity"><Tile heading="EVENTI / DIAGNOSTICA" icon={<Activity size={15} aria-hidden="true" />} secondary><EventRows events={selectedEventRows} /></Tile></div>}
      </div>}

      {view === 'cage' && <div className="live-focus-layout"><Tile heading="CORPO 3D / GABBIA PAKY-01" icon={<BodyIcon size={16} aria-hidden="true" />}>
        <TorsoCagePreview robotId={physical ? selectedRobot?.id ?? null : null}
          imu={physical && imu?.robot_id === selectedRobot?.id ? imu : null}
          connected={liveWebSocket} now={now} />
      </Tile></div>}

      {view === 'signals' && <div className="live-focus-layout"><Tile heading="SEGNALI / DATI DISPONIBILI" icon={<Gauge size={16} />}>
        <MeterGrid snapshot={currentSnapshot} now={now} wsLive={liveWebSocket} />
        <div className="live-focus-list"><div className="live-service-row"><span>Temperatura</span><strong>{formattedReading(currentSnapshot?.power.temperature, now, liveWebSocket)}</strong></div><div className="live-service-row"><span>CAN</span><strong>{adapterSimulated && liveWebSocket ? 'SIMULATO' : hardwareConnected ? currentSnapshot?.can.bus_state : 'NESSUN DATO ATTUALE'}</strong></div><div className="live-service-row"><span>Controller osservati</span><strong>{hardwareConnected ? currentSnapshot?.controllers.length ?? '—' : isSimulator && liveWebSocket ? currentSnapshot?.controllers.length ?? '—' : '—'}</strong></div><div className="live-service-row"><span>Clock domain</span><strong>{currentSnapshot?.clock_domain ?? '—'}</strong></div><div className="live-service-row"><span>Sequenza</span><strong>{currentSnapshot?.sequence ?? '—'}</strong></div></div>
        {physical && <ImuPanel imu={imu?.robot_id === selectedRobot?.id ? imu : null} connected={liveWebSocket} now={now} />}
        <p className="live-note">I dati non attuali sono mostrati come indisponibili. Le misure simulate non sono letture di Paky-01.</p>
      </Tile></div>}

      {view === 'activity' && <div className="live-focus-layout"><Tile heading="EVENT STREAM / REGISTRO CONSOLE" icon={<HeartPulse size={16} />}>
        <p className="live-note">Eventi della Console, non memoria Chronon o ragionamenti non esposti dal sistema.</p><EventRows events={selectedEventRows} expanded />
      </Tile></div>}
    </div>

    <footer className="live-footer" aria-label="Navigazione Live">
      <button type="button" onClick={() => setView('overview')} aria-pressed={view === 'overview'} className={view === 'overview' ? 'live-tab-active' : ''}><BodyIcon size={17}/><span>OVERVIEW</span></button>
      <button type="button" onClick={() => setView('cage')} aria-pressed={view === 'cage'} className={view === 'cage' ? 'live-tab-active' : ''}><BodyIcon size={17}/><span>CORPO 3D</span></button>
      <button type="button" onClick={() => setView('signals')} aria-pressed={view === 'signals'} className={view === 'signals' ? 'live-tab-active' : ''}><BatteryCharging size={17}/><span>TELEMETRIA</span></button>
      <button type="button" onClick={() => setView('activity')} aria-pressed={view === 'activity'} className={view === 'activity' ? 'live-tab-active' : ''}><Activity size={17}/><span>EVENTI</span></button>
      <div className="live-footer-boundary"><ShieldCheck size={16}/><span>READ ONLY · ROBOT LIVE PREVIEW</span></div>
    </footer>
  </main>;
}
