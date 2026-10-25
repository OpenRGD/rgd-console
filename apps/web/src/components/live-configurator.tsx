'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, ArrowUpRight, CheckCircle2, Info, Monitor, RotateCcw, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { RobotLive } from './robot-live';
import {
  DISPLAY_PRESETS, DEFAULT_LIVE_DISPLAY, liveViewport,
  type LiveDisplaySettings, type LiveDisplayPreset, type LiveSection,
} from '@/lib/display-profiles';
import { useLiveDisplay } from '@/hooks/use-live-display';

export function LiveConfigurator() {
  const [settings, saveSettings] = useLiveDisplay();
  const [savedMessage, setSavedMessage] = useState('');
  const viewport = liveViewport(settings);

  const update = (part: Partial<LiveDisplaySettings>) => {
    saveSettings({ ...settings, ...part });
    setSavedMessage('Salvato in questo browser');
  };
  const selectPreset = (id: LiveDisplayPreset) => update({ preset: id });
  const updatePanel = (panel: LiveSection, checked: boolean) =>
    update({ visible_panels: { ...settings.visible_panels, [panel]: checked } });

  return <main className="min-h-dvh bg-canvas p-4 text-slate-100 sm:p-7 xl:p-9">
    <div className="mx-auto max-w-[1700px]">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-[11px] font-bold uppercase tracking-[.22em] text-mint">OpenRGD Console / v0.4C</p><h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Display Profiles</h1><p className="mt-1.5 text-sm text-muted">Configura Robot Live senza cambiare la risoluzione di Ubuntu o il login automatico.</p></div>
        <div className="flex flex-wrap items-center gap-2"><Link href="/overview" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-panel px-4 text-xs font-semibold hover:border-mint"><ArrowLeft size={16} /> Console</Link><Link href="/live" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-mint px-4 text-xs font-bold text-[#071c19] hover:bg-[#8cf0d0]">Apri Live <ArrowUpRight size={15} /></Link></div>
      </header>

      <div className="grid items-start gap-5 xl:grid-cols-[350px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="panel p-5"><div className="mb-4 flex items-center gap-2 text-sm font-semibold"><Monitor className="text-mint" size={18} /> Profili display</div>
            <div className="grid gap-2">{DISPLAY_PRESETS.map(preset => <button key={preset.id} type="button" aria-pressed={settings.preset === preset.id} onClick={() => selectPreset(preset.id)} className={`flex min-h-[65px] items-center justify-between rounded-xl border px-3 text-left transition-colors ${settings.preset === preset.id ? 'border-mint/60 bg-mint/[.09]' : 'border-line bg-[#0b141e] hover:border-slate-500'}`}>
              <div><div className="text-xs font-semibold text-slate-100">{preset.name}</div><div className="mt-1 text-[11px] leading-4 text-muted">{preset.description}</div></div>
              {settings.preset === preset.id ? <CheckCircle2 size={18} className="shrink-0 text-mint" /> : <span className="mono shrink-0 text-[10px] text-muted">{preset.width}×{preset.height}</span>}
            </button>)}</div>
            {settings.preset === 'custom' && <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="text-xs text-muted">Larghezza (px)<input type="number" inputMode="numeric" min={320} max={3840} step={1} value={settings.custom_width} onChange={e => update({ custom_width: e.target.value === '' ? 800 : Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-slate-100" /></label>
              <label className="text-xs text-muted">Altezza (px)<input type="number" inputMode="numeric" min={240} max={2160} step={1} value={settings.custom_height} onChange={e => update({ custom_height: e.target.value === '' ? 480 : Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-slate-100" /></label>
            </div>}
          </section>

          <section className="panel p-5"><div className="mb-4 flex items-center gap-2 text-sm font-semibold"><SlidersHorizontal size={18} className="text-mint" /> Aspetto e widget</div>
            <label className="block text-xs font-semibold text-slate-200" htmlFor="live-scale">Scala testi: {Math.round(settings.text_scale * 100)}%</label>
            <input id="live-scale" type="range" min={0.8} max={1.5} step={0.05} value={settings.text_scale} onChange={e => update({ text_scale: Number(e.target.value) })} className="mt-3 w-full accent-emerald-300" />
            <div className="mt-4 flex gap-2"><label htmlFor="live-contrast" className="sr-only">Contrasto</label><select id="live-contrast" value={settings.contrast} onChange={e => update({ contrast: e.target.value === 'high' ? 'high' : 'standard' })} className="min-h-11 w-full rounded-lg border border-line bg-canvas px-3 text-xs text-slate-100"><option value="standard">Contrasto standard</option><option value="high">Contrasto elevato</option></select></div>
            <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 text-xs text-slate-200"><input type="checkbox" checked={settings.reduced_motion} onChange={e => update({ reduced_motion: e.target.checked })} className="accent-emerald-300" /> Riduci animazioni</label>
            <div className="mt-4 border-t border-line pt-3 text-[10px] font-bold uppercase tracking-widest text-muted">Pannelli in overview</div>
            {([['body','Body'],['signals','Electronics'],['activity','Ultimi eventi']] as const).map(([key,label]) => <label key={key} className="mt-1 flex min-h-11 cursor-pointer items-center gap-3 text-xs"><input type="checkbox" checked={settings.visible_panels[key]} onChange={e => updatePanel(key, e.target.checked)} className="accent-emerald-300" /> {label}</label>)}
            <button type="button" onClick={() => update({ ...DEFAULT_LIVE_DISPLAY, visible_panels: { ...DEFAULT_LIVE_DISPLAY.visible_panels } })} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-line text-xs font-semibold hover:border-mint"><RotateCcw size={15} /> Ripristina impostazioni</button>
            <p className="mt-3 text-xs text-mint" role="status">{savedMessage}</p>
          </section>
        </aside>
        <section className="panel min-w-0 p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Anteprima reale del layout</h2><p className="mt-1 text-xs text-muted">Dimensioni CSS simulate nel browser, non configurazione fisica del monitor.</p></div><div className="mono rounded-lg border border-line bg-elevated px-3 py-2 text-xs text-mint">{viewport.width} × {viewport.height}</div></div>
          <div className="overflow-x-auto rounded-xl border border-line bg-[#050c12] p-3 sm:p-5">
            <div className="live-preview-viewport mx-auto overflow-hidden rounded-lg border border-[#466577] shadow-[0_0_45px_#63e5c00b]" style={{ width: viewport.width, height: viewport.height }}>
              <RobotLive embedded />
            </div>
          </div>
          <div className="mt-5 grid gap-3 text-xs leading-5 text-muted md:grid-cols-2"><p className="flex gap-2"><Info size={17} className="mt-0.5 shrink-0 text-amber" /> Il preset definisce la dimensione dell’anteprima e le preferenze visive; non modifica HDMI, Wayland o la risoluzione del kernel.</p><p className="flex gap-2"><ShieldCheck size={17} className="mt-0.5 shrink-0 text-mint" /> Nessun comando motore, autologin, shutdown o cambio sessione Linux è disponibile dalla Console v0.4C.</p></div>
          <p className="mt-4 text-xs text-muted">Le preferenze restano nel browser/profilo Firefox che le ha salvate. Un futuro utente kiosk dedicato avrà inizialmente le proprie impostazioni, non sincronizzate con queste.</p>
        </section>
      </div>
    </div>
  </main>;
}
