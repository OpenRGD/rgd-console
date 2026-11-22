'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, FileJson2, Headphones, Mic2, ShieldCheck } from 'lucide-react';
import { isVoiceReadiness, type VoiceReadiness } from '@/lib/voice-readiness';
import { Pill, SectionHeading, StateBlock, useNow } from './ui';

const MAX_FILE_BYTES = 8192;
const FRESH_MS = 90_000;

const showCount = (value: number | null | undefined) => value === null || value === undefined ? '—' : String(value);
const showBool = (value: boolean | null | undefined) => value === null || value === undefined ? 'Non verificato' : value ? 'Sì' : 'No';

export function VoiceReadinessPanel({ robotId }: { robotId: string }) {
  const [report, setReport] = useState<VoiceReadiness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = useNow();
  useEffect(() => {
    setReport(null);
    setError(null);
  }, [robotId]);

  const ageMs = report ? now - Date.parse(report.generated_at_utc) : null;
  const recent = ageMs !== null && ageMs >= -5000 && ageMs <= FRESH_MS;
  const available = recent && report?.service_reachable === true;

  async function importReport(file: File | undefined) {
    if (!file) return;
    setReport(null);
    setError(null);
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error('Il file deve essere inferiore a 8 KiB.');
      const parsed: unknown = JSON.parse(await file.text());
      if (!isVoiceReadiness(parsed)) throw new Error('Contratto di diagnostica Voice non valido o contenuto non consentito.');
      if (parsed.robot_id !== robotId) throw new Error('Il report appartiene a un altro robot.');
      setReport(parsed);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Importazione non riuscita.');
    }
  }

  return <>
    <SectionHeading overline="VOICE-CONSOLE-0.1 / READ-ONLY" title="Voice Lab"
      description="Diagnostica offline del servizio vocale. Nessun accesso diretto a microfoni, altoparlanti o credenziali dalla Console."
      extra={<Pill tone="amber">ANTEPRIMA · NON LIVE</Pill>} />

    <div className="mb-6 rounded-xl border border-amber/25 bg-amber/5 px-5 py-4 text-xs leading-6 text-slate-300">
      <div className="flex items-center gap-2 font-semibold text-amber"><AlertTriangle size={16} /> Nessun Audio Agent autorizzato collegato</div>
      <p className="mt-2">Voice Lab resta un servizio host indipendente. La Console non verifica automaticamente se il microfono sta registrando o se il Bose sta riproducendo audio. Il report caricato è una fotografia locale, non uno stream autenticato né un’installazione registrata.</p>
    </div>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StateBlock title="Collegamento Console" value="Non collegato" hint="Host Audio Agent da progettare" icon={<Headphones size={18} />} />
      <StateBlock title="Ultimo report" value={report ? recent ? 'Recente' : 'Obsoleto' : 'Assente'} hint={report ? report.generated_at_utc : 'Nessuna istantanea importata'} icon={<FileJson2 size={18} />} />
      <StateBlock title="Voice Lab rilevato" value={available ? 'Sì (report)' : 'Non verificato'} hint={report?.voice_lab_version ? 'Versione riportata: ' + report.voice_lab_version : 'Nessuna versione recente'} icon={<Mic2 size={18} />} />
      <StateBlock title="Controllo motori" value="Disabilitato" hint="Nessuna autorità fisica da Voice" icon={<ShieldCheck size={18} />} />
    </div>

    <div className="mt-6 panel px-5 py-5 sm:px-6">
      <h3 className="text-sm font-semibold text-slate-100">Importa report diagnostico locale</h3>
      <p className="mt-2 max-w-3xl text-xs leading-6 text-muted">Sul mini-PC, esegui il comando documentato in docs/VOICE-CONSOLE-0.1.md. Seleziona poi il file JSON esportato. Limite 8 KiB, controllo rigoroso dello schema e dell’identità del robot. Il file non viene caricato sul server né conservato nel browser.</p>
      <label htmlFor="voice-readiness-file" className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-mint/30 bg-mint/10 px-4 py-3 text-xs font-semibold text-mint hover:bg-mint/20">
        <FileJson2 size={16} /> Scegli report JSON
      </label>
      <input id="voice-readiness-file" type="file" accept=".json,application/json" className="sr-only"
        onChange={event => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          void importReport(file);
        }} />
      {error && <p role="alert" className="mt-3 text-xs text-rose-300">{error}</p>}
      {report && <p className="mt-3 text-xs text-muted">Report di {report.robot_id}; fonte: operatore / loopback host. {recent ? 'Età compatibile con la finestra diagnostica.' : 'Oltre la finestra di 90 secondi: stato corrente sconosciuto.'}</p>}
    </div>

    <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StateBlock title="Audio host" value={available ? showBool(report?.audio_available) : 'Non verificato'} hint="Solo disponibilità riportata" icon={<Headphones size={18} />} />
      <StateBlock title="Ingressi audio" value={available ? showCount(report?.input_device_count) : '—'} hint="Conteggio, non nomi dei dispositivi" icon={<Mic2 size={18} />} />
      <StateBlock title="Uscite audio" value={available ? showCount(report?.output_device_count) : '—'} hint="Nessuna prova di suono fisico" icon={<Headphones size={18} />} />
      <StateBlock title="Modelli locali pronti" value={available ? showCount(report?.ready_local_models) : '—'} hint="Stato riferito dal laboratorio" icon={<FileJson2 size={18} />} />
    </div>
    <p className="mt-6 text-xs leading-6 text-muted">Cloud configurati: {available ? showCount(report?.ready_cloud_models) : '—'} · Piper residente: {available ? showBool(report?.piper_model_loaded) : 'Non verificato'}. Nessun audio, trascrizione, dispositivo identificabile o segreto viene acquisito dal report.</p>
  </>;
}
