'use client';

import { useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import { Eye, FileJson, LockKeyhole, ShieldCheck, Upload } from 'lucide-react';
import { EyeScreen } from './expressive-eyes';
import { MAX_COMPOSITION_FILE, parseCompositionResult } from '@/lib/eye-composition-result';
import type { CompositionResult } from '@/lib/eye-composition-result';

/** UI is a reader of the Visual Feedback composer's JSON, never an independent
 * policy engine. It has no network, catalog writes, or device bindings. */
export function EyeCompositionPreview({ robotId }: { robotId: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [data,setData] = useState<CompositionResult | null>(null);
  const [filename,setFilename] = useState('');
  const [error,setError] = useState('');
  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file=event.target.files?.[0];
    event.target.value='';
    if (!file) return;
    try {
      if (file.size <= 0 || file.size > MAX_COMPOSITION_FILE)
        throw new Error('File JSON vuoto o oltre 64 KiB.');
      const loaded: unknown=JSON.parse(await file.text());
      const result=parseCompositionResult(loaded,robotId);
      setData(result);
      setFilename(file.name.slice(0,80));
      setError('');
    } catch(e) {
      setData(null);
      setFilename('');
      setError(e instanceof Error?e.message:'Impossibile leggere l’anteprima.');
    }
  };

  const style = {
    '--ve-color':data?.ring_intent.color ?? '#223244',
    opacity:data?Math.max(0.16,data.ring_intent.brightness/100):0.2,
  } as CSSProperties;

  return <section className="panel overflow-hidden" aria-label="Eye Composition Preview">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-5 sm:p-6">
      <div>
        <p className="eyebrow flex items-center gap-2"><Eye size={16}/> Visual Feedback · Composition Preview</p>
        <h2 className="mt-2 text-lg font-semibold">Stato + sguardo + espressione</h2>
        <p className="mt-2 max-w-3xl text-xs leading-6 text-muted">
          Il motore di composizione vive in rgd-visual-feedback, non nella Console.
          Importa una risposta JSON ottenuta dal suo simulatore offline per vedere occhi e ring insieme.
        </p>
      </div>
      <span className="inline-flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[10px] font-semibold text-amber-200">
        <LockKeyhole size={14}/> SOLO SIMULAZIONE
      </span>
    </div>

    <div className="space-y-3 border-b border-line bg-[#0b1824] p-5">
      <p className="text-[11px] leading-5 text-slate-400">
        Da <span className="font-mono">rgd-visual-feedback</span> esegui <span className="font-mono text-slate-200">
          python3 scripts/eye_composition_preview.py &gt; eye-composition.json
        </span> e seleziona il file. Lo Studio non accede al terminale o ai file del robot.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-lg border border-line px-3 py-2 font-mono text-xs text-white">{robotId}</span>
        <input ref={ref} type="file" accept=".json,application/json" onChange={handleFile} className="sr-only" aria-label="Apri risultato composizione JSON"/>
        <button type="button" onClick={()=>ref.current?.click()} className="inline-flex items-center gap-2 rounded-lg border border-mint/40 bg-mint/10 px-4 py-2 text-xs font-semibold text-mint">
          <Upload size={15}/> Importa composizione JSON
        </button>
        {data && <button type="button" onClick={()=>{setData(null);setFilename('');}} className="rounded-lg border border-line px-3 py-2 text-xs">
          Chiudi anteprima
        </button>}
        {filename && <span className="inline-flex items-center gap-2 text-xs text-muted"><FileJson size={14}/>{filename}</span>}
      </div>
      {error && <p role="alert" className="rounded-md border border-rose-400/30 bg-rose-400/10 p-3 text-xs text-rose-200">{error}</p>}
    </div>

    {!data
      ? <div className="grid min-h-[145px] place-items-center p-6 text-center text-xs text-slate-400">
          Nessuna composizione caricata. Le scene dello Studio rimangono indipendenti.
        </div>
      : <div className="space-y-5 p-5 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-line p-3"><div className="eyebrow">FASE FUNZIONALE</div><p className="mt-2 text-sm font-semibold">{data.functional_scene}</p></div>
            <div className="rounded-xl border border-line p-3"><div className="eyebrow">DISPLAY OCCHI</div><p className="mt-2 text-sm font-semibold">{data.eyes_scene}</p></div>
            <div className="rounded-xl border border-line p-3"><div className="eyebrow">MICROFONO · DICHIARATO</div><p className="mt-2 text-sm font-semibold">{data.microphone_state}</p></div>
            <div className="rounded-xl border border-line p-3"><div className="eyebrow">GESTO</div><p className="mt-2 text-sm font-semibold">{data.social_overlay?.scene ?? data.gesture_status}</p></div>
          </div>

          <div className="grid items-center gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(200px,.8fr)]">
            {data.blank_pixels_intent
              ? <div className="grid min-h-[220px] place-items-center rounded-xl border border-line bg-black text-xs text-slate-400">
                  PIXEL NERI PROPOSTI · BACKLIGHT NON VERIFICATO
                </div>
              : <div className="ve-expressive-pair">
                  <EyeScreen side="left" eye={data.expression.eyes.left} expression={data.expression} blink={false}/>
                  <EyeScreen side="right" eye={data.expression.eyes.right} expression={data.expression} blink={false}/>
                </div>
            }
            <div className="rounded-xl border border-line p-4">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted">ANELLO · INTENTO FUNZIONALE</div>
              <div className="relative mx-auto grid h-32 w-32 place-items-center">
                <div className="ve-ring" style={{...style,inset:'10%',borderWidth:14,boxShadow:'none'}}
                  aria-label={'Ring preview '+data.ring_intent.color}/>
                <div className="ve-ring-center text-center text-[10px] text-muted">SIMULATO</div>
              </div>
              <p className="mt-3 text-center font-mono text-[11px] text-slate-300">
                {data.ring_intent.color} · {data.ring_intent.brightness}%
              </p>
              <p className="mt-1 text-center text-[10px] text-muted">Sorgente scena: {data.ring_intent.derived_from}</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-[#0b1722] p-4 text-[11px] leading-6">
              <p className="font-semibold text-slate-100">Risultato composizione</p>
              <p>Gaze: <span className="text-mint">{data.gaze_status}</span></p>
              <p>Gesto: <span className="text-mint">{data.gesture_status}</span></p>
              <p>Tempo gesto residuo: {data.social_overlay?.remaining_ms ?? '—'} ms</p>
              <p>Voce corrente nella simulazione: {data.voice_sample_current ? 'sì' : 'no'}</p>
            </div>
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-[11px] leading-6 text-amber-200">
              <p className="flex items-center gap-2 font-semibold"><ShieldCheck size={16}/> Semantica dell'evidenza</p>
              <p>I flag del JSON sono sintetici e non autenticati. Nessun microfono, player,
                LCD o LED è stato verificato dal browser. Approvazione del catalogo ≠ comando hardware.</p>
              {data.reasons.length > 0 && <p className="mt-1 text-slate-300">Motivi: {data.reasons.join(', ')}</p>}
            </div>
          </div>
        </div>}
  </section>;
}
