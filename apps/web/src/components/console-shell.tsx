'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  Activity, Box as BodyIcon, BrainCircuit, ChevronDown, CircleDot, Cpu,
  Database, Gauge, Layers3, LayoutDashboard, Menu, PanelLeftClose, RadioTower,
  Settings2, ShieldCheck, FileUp, Monitor, Power, Palette, X,
} from 'lucide-react';
import { SECTIONS, type SectionId } from '@/lib/navigation';
import { useConsole } from '@/hooks/use-console';
import { SourceBadge, Pill, EmptyState } from './ui';
import { Body, Electronics, Memory, Mind, Modules, Overview, Settings, type ConsoleData } from './sections';
import { OnboardingWizard } from './onboarding';

const ICONS = {
  overview: LayoutDashboard,
  onboarding: FileUp,
  body: BodyIcon,
  electronics: Cpu,
  mind: BrainCircuit,
  memory: Database,
  modules: Layers3,
  settings: Settings2,
};

function Brand() {
  return <div className="flex items-center gap-3"><div className="relative grid h-10 w-10 place-items-center rounded-xl border border-mint/25 bg-mint/10 text-mint"><CircleDot size={25} strokeWidth={1.6} /><div className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-mint" /></div><div><div className="text-[15px] font-bold leading-4 tracking-wide text-white">Open<span className="text-mint">RGD</span></div><div className="mt-1.5 text-[10px] font-semibold uppercase tracking-[.26em] text-muted">Console / v0.4C</div></div></div>;
}

function Navigation({ section, close }: { section: SectionId; close: () => void }) {
  return <div className="flex h-full flex-col"><div className="border-b border-line px-6 pb-7 pt-7"><Brand /></div>
    <div className="px-4 pt-7"><div className="eyebrow mb-3 px-3">WORKSPACE</div><nav aria-label="Navigazione Console" className="space-y-1">{SECTIONS.map(item => {
      const Icon = ICONS[item.id];
      return <Link key={item.id} href={`/${item.id}`} onClick={close} aria-current={item.id === section ? 'page' : undefined} className={`group flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-medium transition-colors ${section === item.id ? 'border border-mint/15 bg-mint/10 text-mint' : 'border border-transparent text-slate-400 hover:bg-white/[.04] hover:text-slate-100'}`}><Icon size={18} strokeWidth={section === item.id ? 2.1 : 1.7} /><span className="flex-1">{item.label}</span>{section === item.id && <span className="h-1.5 w-1.5 rounded-full bg-mint" />}</Link>;
    })}</nav></div>
    <div className="mt-auto space-y-4 p-4"><Link href="/visual-effects" className="flex items-center gap-3 rounded-xl border border-mint/20 bg-mint/5 px-4 py-3 text-xs font-semibold text-mint hover:bg-mint/10"><Palette size={17}/> Visual Effects Studio <span className="ml-auto rounded border border-amber/40 px-1.5 py-0.5 text-[9px] text-amber">PREVIEW</span></Link><Link href="/boot" className="flex items-center gap-3 rounded-xl border border-mint/25 bg-mint/5 px-4 py-3 text-xs text-mint hover:bg-mint/10"><Power size={17} /> Boot &amp; Recovery</Link><div className="rounded-xl border border-line bg-[#0d1721] p-4"><div className="flex items-center gap-2 text-xs font-semibold text-mint"><ShieldCheck size={16} /> SAFETY BOUNDARY</div><p className="mt-2 text-[11px] leading-5 text-muted">Nessun endpoint di attuazione. Il controllo real-time resta fuori dalla Console.</p></div><div className="flex items-center justify-between px-3 pb-3 text-[10px] text-slate-500"><span>Foundation 0.4C</span><span className="font-mono">OFFLINE FIRST</span></div></div>
  </div>;
}

function RenderSection({ section, data }: { section: SectionId; data: ConsoleData }) {
  switch (section) {
    case 'overview': return <Overview {...data} />;
    case 'onboarding': return null; // rendered separately, may have no selected robot
    case 'electronics': return <Electronics {...data} />;
    case 'body': return <Body {...data} />;
    case 'mind': return <Mind {...data} />;
    case 'memory': return <Memory {...data} />;
    case 'modules': return <Modules {...data} />;
    case 'settings': return <Settings {...data} />;
  }
}

export function ConsoleShell({ section }: { section: SectionId }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { robots, selectedRobot, selectRobot, refreshRobots, snapshot, history, events, modules, status, streamStatus, apiError } = useConsole();
  const data: ConsoleData | null = selectedRobot ? { robots, robot: selectedRobot, snapshot, history, events, modules, status, streamStatus } : null;
  return <div className="min-h-screen bg-canvas">
    <a className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-mint focus:p-2 focus:text-black" href="#main-content">Vai al contenuto</a>
    {menuOpen && <button onClick={() => setMenuOpen(false)} aria-label="Chiudi navigazione" className="fixed inset-0 z-40 bg-black/65 lg:hidden" type="button" />}
    <aside className={`fixed inset-y-0 left-0 z-50 w-[248px] border-r border-line bg-[#0c141e] transition-transform lg:translate-x-0 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <button type="button" onClick={() => setMenuOpen(false)} aria-label="Chiudi menu" className="absolute right-4 top-7 text-slate-300 lg:hidden"><X size={21} /></button>
      <Navigation section={section} close={() => setMenuOpen(false)} />
    </aside>
    <div className="min-w-0 lg:pl-[248px]">
      <header className="sticky top-0 z-30 flex min-h-[82px] items-center justify-between gap-4 border-b border-line bg-[#0a111aeF] px-4 backdrop-blur-xl sm:px-8 xl:px-10">
        <div className="flex items-center gap-3"><button type="button" onClick={() => setMenuOpen(true)} aria-label="Apri navigazione" className="rounded-lg border border-line p-2 text-slate-200 lg:hidden"><Menu size={20} /></button><div><div className="text-[11px] text-muted">OpenRGD <span className="mx-2 text-slate-600">/</span> Workspace</div><div className="mt-1 text-[15px] font-semibold text-white">{SECTIONS.find(s => s.id === section)?.label}</div></div></div>
        <div className="flex min-w-0 items-center gap-3 sm:gap-5"><div className="hidden items-center gap-2 md:flex"><span className={`h-2 w-2 rounded-full ${streamStatus === 'live' ? 'bg-mint' : streamStatus === 'connecting' ? 'bg-amber animate-pulse' : 'bg-rose-400'}`} /><span className="text-[11px] text-muted">WS {streamStatus === 'live' ? 'connected' : streamStatus}</span></div>
          <div className="relative flex min-w-0 items-center gap-2 rounded-xl border border-line bg-[#111d28] py-2 pl-3 pr-8"><RadioTower size={17} className="hidden shrink-0 text-mint sm:block" /><label className="sr-only" htmlFor="robot-selector">Seleziona robot</label><select id="robot-selector" value={selectedRobot?.id ?? ''} onChange={event => selectRobot(event.target.value)} disabled={!robots.length} className="max-w-[136px] appearance-none truncate bg-transparent text-xs font-medium text-slate-100 outline-none disabled:opacity-50 sm:max-w-[210px] sm:text-[13px]">{robots.length ? robots.map(robot => <option key={robot.id} value={robot.id}>{robot.name}</option>) : <option value="">Connessione in corso…</option>}</select><ChevronDown size={15} aria-hidden="true" className="pointer-events-none absolute right-2.5 text-muted" /></div>
          <Link href="/live" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-mint/30 bg-mint/10 px-3 text-xs font-semibold text-mint hover:bg-mint/20" aria-label="Apri Robot Live"><Monitor size={17}/><span className="hidden xl:inline">Robot Live</span></Link>
        </div>
      </header>
      <main id="main-content" className="mx-auto max-w-[1600px] px-4 pb-16 pt-8 sm:px-8 xl:px-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-2"><span className="eyebrow">OPENRGD / FOUNDATION v0.4C</span>{selectedRobot && <SourceBadge kind={selectedRobot.kind} />}</div><Pill tone="mint"><ShieldCheck size={13} /> MOTOR CONTROL DISABLED</Pill></div>
        {apiError && <div role="alert" className="mb-6 rounded-xl border border-rose-400/25 bg-rose-500/5 px-5 py-4 text-sm text-rose-200">{apiError}</div>}
        {section === 'onboarding'
          ? <OnboardingWizard selectedRobot={selectedRobot} onCreated={async id => { await refreshRobots(id); }} />
          : data ? <RenderSection section={section} data={data} /> : <div className="panel"><EmptyState title="Registro dei robot non disponibile" message="La Console non sostituisce i dati mancanti con un robot fittizio. Avvia il backend Rust e verifica la configurazione del gateway." icon={<RadioTower size={21} />} /></div>}
        <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-[11px] text-muted"><span>OpenRGD Console · Diagnostics are not canonical Chronons</span><span className="font-mono">API {status?.api_version ?? 'not connected'} / CONTROL DISABLED</span></footer>
      </main>
    </div>
  </div>;
}
