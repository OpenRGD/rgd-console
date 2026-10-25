'use client';

import { useEffect, useState } from 'react';
import { Activity, ArrowUpRight, Clock3, DatabaseZap, RadioTower } from 'lucide-react';
import type { ConsoleEvent, Measurement, RobotKind } from '@/lib/contracts';

export function Pill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'mint' | 'amber' | 'red' | 'neutral' }) {
  const tones = {
    mint: 'text-mint border-mint/30 bg-mint/10',
    amber: 'text-amber border-amber/30 bg-amber/10',
    red: 'text-rose-300 border-rose-400/30 bg-rose-500/10',
    neutral: 'text-slate-300 border-slate-500/30 bg-slate-400/10',
  };
  return <span className={`status-pill ${tones[tone]}`}>{children}</span>;
}

export function SourceBadge({ kind }: { kind: RobotKind }) {
  return <Pill tone={kind === 'simulated' ? 'amber' : 'neutral'}><span className="h-1.5 w-1.5 rounded-full bg-current" />{kind === 'simulated' ? 'SIMULATO' : 'FISICO · NON COLLEGATO'}</Pill>;
}

export function SectionHeading({ overline, title, description, extra }: { overline: string; title: string; description: string; extra?: React.ReactNode }) {
  return <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div><div className="eyebrow mb-2">{overline}</div><h1 className="text-2xl font-semibold tracking-tight text-slate-50 sm:text-[29px]">{title}</h1><p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted">{description}</p></div>
    {extra && <div className="shrink-0">{extra}</div>}
  </div>;
}

export function Panel({ title, subtitle, children, action, className = '' }: { title?: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return <section className={`panel overflow-hidden ${className}`}>
    {(title || subtitle) && <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
      <div>{title && <h2 className="text-sm font-semibold tracking-wide text-slate-100">{title}</h2>}{subtitle && <p className="mt-1 text-xs text-muted">{subtitle}</p>}</div>
      {action}
    </div>}
    {children}
  </section>;
}

export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function measurementText(metric: Measurement | null | undefined, now: number, digits = 2): { value: string; stale: boolean; meta: string } {
  if (!metric || metric.value === null || !Number.isFinite(metric.value)) return { value: '—', stale: false, meta: 'Sensore non disponibile' };
  const ageMs = metric.measured_at ? now - new Date(metric.measured_at).getTime() : Number.POSITIVE_INFINITY;
  const stale = !Number.isFinite(ageMs) || ageMs > 5000 || ageMs < -10000;
  return {
    value: `${metric.value.toLocaleString('it-IT', { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${metric.unit}`,
    stale,
    meta: stale ? 'Campione non aggiornato' : metric.source_kind === 'simulated' ? 'Campione sintetico' : 'Campione osservato',
  };
}

export function MetricTile({ name, metric, glyph, digits = 2 }: { name: string; metric: Measurement | null | undefined; glyph?: React.ReactNode; digits?: number }) {
  const now = useNow();
  const formatted = measurementText(metric, now, digits);
  return <div className="glass min-h-[162px] rounded-2xl p-5">
    <div className="mb-5 flex items-center justify-between text-muted"><span className="text-xs font-semibold uppercase tracking-wider">{name}</span>{glyph ?? <Activity size={18} strokeWidth={1.7} />}</div>
    <div className={`mono text-2xl font-semibold tracking-tight ${formatted.stale ? 'text-amber' : 'text-slate-100'}`}>{formatted.value}</div>
    <p className={`mt-2 text-xs ${formatted.stale ? 'text-amber' : 'text-muted'}`}>{formatted.meta}</p>
    <div className="mt-4 truncate border-t border-slate-700/60 pt-3 font-mono text-[10px] text-muted" title={metric?.source_id || '—'}>SOURCE {metric?.source_id ?? '—'}</div>
    <div className="mt-1 text-[10px] text-muted">{metric?.measured_at ? `Misurato: ${new Date(metric.measured_at).toLocaleTimeString('it-IT')}` : 'Nessuna misurazione'}</div>
  </div>;
}

export function StateBlock({ title, value, hint, icon }: { title: string; value: string; hint: string; icon?: React.ReactNode }) {
  return <div className="glass rounded-2xl p-5">
    <div className="flex items-center justify-between text-muted"><span className="text-xs uppercase tracking-widest">{title}</span>{icon ?? <RadioTower size={17} />}</div>
    <div className="mt-5 text-xl font-semibold capitalize text-slate-100">{value}</div>
    <p className="mt-2 text-xs text-muted">{hint}</p>
  </div>;
}

export function EmptyState({ title, message, icon }: { title: string; message: string; icon?: React.ReactNode }) {
  return <div className="flex min-h-[170px] flex-col items-center justify-center px-6 py-10 text-center">
    <div className="mb-3 rounded-xl border border-line bg-elevated p-3 text-muted">{icon ?? <DatabaseZap size={21} />}</div>
    <div className="text-sm font-medium text-slate-200">{title}</div><div className="mt-1 max-w-md text-xs leading-5 text-muted">{message}</div>
  </div>;
}

export function EventTimeline({ events, limit }: { events: ConsoleEvent[]; limit?: number }) {
  const visible = limit ? events.slice(0, limit) : events;
  if (!visible.length) return <EmptyState title="Nessun evento disponibile" message="Il registro operativo mostrerà soltanto eventi emessi dalla sorgente selezionata. Non sono stati creati Chronon." icon={<Clock3 size={21} />} />;
  return <ol className="divide-y divide-line/80">
    {visible.map((event, index) => <li key={event.event_id} className="group relative flex gap-4 px-5 py-4 hover:bg-white/[.025] sm:px-6">
      <div className="flex w-2.5 flex-col items-center pt-1.5"><span className={`h-2 w-2 rounded-full ${event.severity === 'error' ? 'bg-rose-400' : event.source_kind === 'simulated' ? 'bg-amber' : 'bg-mint'}`} />{index < visible.length - 1 && <div className="mt-2 h-full min-h-8 w-px bg-line" />}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-[13px] font-medium text-slate-100">{event.title}</h3><span className="mono text-[10px] text-muted">{new Date(event.observed_at).toLocaleTimeString('it-IT')}</span></div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted"><span className="font-mono text-slate-400">{event.event_kind}</span><span>{event.stage}</span><span className={event.source_kind === 'simulated' ? 'text-amber' : ''}>{event.source_kind === 'simulated' ? 'SIMULATO' : 'OSSERVATO'}</span></div>
        <div className="mt-2 truncate font-mono text-[10px] text-slate-500" title={event.event_id}>ID {event.event_id}</div>
        {(event.causal_parent_event_ids.length > 0 || event.payload_ref) && <p className="mt-1 truncate text-[10px] text-muted" title={event.payload_ref ?? ''}>{event.causal_parent_event_ids.length ? `${event.causal_parent_event_ids.length} relazioni causali · ` : ''}{event.payload_ref ?? ''}</p>}
      </div>
      <ArrowUpRight aria-hidden="true" size={14} className="mt-1 shrink-0 text-slate-600 group-hover:text-mint" />
    </li>)}
  </ol>;
}
