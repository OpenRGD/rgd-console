'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, FileJson2, Headphones, Mic2, ShieldCheck } from 'lucide-react';
import { MAX_VOICE_REPORT_BYTES, parseVoiceReadiness, voiceReportState, type VoiceReadiness } from '@/lib/voice-readiness';
import { Pill, SectionHeading, StateBlock, useNow } from './ui';

const showCount = (value: number | null | undefined) => value === null || value === undefined ? '—' : String(value);
const showBool = (value: boolean | null | undefined) => value === null || value === undefined ? 'Non verificato' : value ? 'Sì' : 'No';

export function VoiceReadinessPanel({ robotId }: { robotId: string }) {
  const [report, setReport] = useState<VoiceReadiness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = useNow();
  // ConsoleShell keys this panel by robotId. Invalidate pending reads on cleanup
  // and on a newer selection, so late file completions cannot replace a newer report.
  const importRevision = useRef(0);
  useEffect(() => () => { importRevision.current += 1; }, []);
  const state = voiceReportState(report, now);
  const available = state === 'recent';
  const recent = available || state === 'unreachable';
  const statusLabel = state === 'absent' ? 'Assente' : state === 'future' ? 'Clock non compatibile' : state === 'stale' ? 'Obsoleto' : 'Recente';

  async function importReport(file: File | undefined) {
    if (!file) return;
    const revision = ++importRevision.current;
    setReport(null);
    setError(null);
    try {
      if (file.size > MAX_VOICE_REPORT_BYTES) throw new Error('Il file supera il limite di 8 KiB.');
      const raw = await file.text();
      if (revision !== importRevision.current) return;
      setReport(parseVoiceReadiness(raw, robotId));
    } catch (cause) {
      if (revision !== importRevision.current) return;
      // file.text errors are not part of the report contract: do not expose paths.
      setError(cause instanceof Error && [
        'Il file supera il limite di 8 KiB.',
        'JSON non valido o chiavi duplicate.',
        'Contratto di diagnostica Voice non valido o contenuto non consentito.',
        'Il report appartiene a un altro robot.',
      ].includes(cause.message) ? cause.message : 'Importazione non riuscita.');
    }
  }

  return <>
    <SectionHeading overline="VOICE-CONSOLE-0.1 / READ-ONLY" title="Voice Lab"
      description="Diagnostica offline del servizio vocale. Nessun accesso diretto a microfoni, altoparlanti o credenziali dalla Console."
      extra={<Pill tone="amber">ANTEPRIMA · NON LIVE</Pill>} />

    <div className="mb-6 rounded-xl border border-amber/25 bg-amber/5 px-5 py-4 text-xs leading-6 text-slate-300">
      <div className="flex items-center gap-2 font-semibold text-amber"><AlertTriangle size={16} /> Nessun Audio Agent autorizzato collegato</div>
      <p className="mt-2">Voice Lab resta un servizio host indipendente. La Console non verifica automaticamente se il microfono sta registrando o se l’altoparlante sta riproducendo audio. Il report caricato è una fotografia locale, non uno stream autenticato né un’installazione registrata.</p>
    </div>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StateBlock title="Collegamento Console" value="Non collegato" hint="Host Audio Agent da progettare" icon={<Headphones size={18} />} />
      <StateBlock title="Ultimo report" value={statusLabel} hint={report ? report.generated_at_utc : 'Nessuna istantanea importata'} icon={<FileJson2 size={18} />} />
      <StateBlock title="Voice Lab rilevato" value={available ? 'Sì (report)' : state === 'unreachable' ? 'Non rilevato nel report' : 'Non verificato'} hint={available && report?.voice_lab_version ? 'Versione riportata: ' + report.voice_lab_version : 'Nessuna versione recente verificabile'} icon={<Mic2 size={18} />} />
      <StateBlock title="Controllo motori" value="Disabilitato" hint="Nessuna autorità fisica da Voice" icon={<ShieldCheck size={18} />} />
    </div>

    <div className="mt-6 panel px-5 py-5 sm:px-6">
      <h3 className="text-sm font-semibold text-slate-100">Importa report diagnostico locale</h3>
      <p className="mt-2 max-w-3xl text-xs leading-6 text-muted">Sul mini-PC, esegui il comando documentato in docs/VOICE-CONSOLE-0.1.md. Seleziona poi il file JSON esportato. Limite 8 KiB, controllo rigoroso dello schema e dell’identità del robot. Il file resta soltanto nella memoria della pagina; l’identità è dichiarata dall’operatore, non autenticata.</p>
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
      {report && <p className="mt-3 text-xs text-muted">Report di {report.robot_id}; fonte: operatore / loopback host. {recent ? 'Età compatibile con il clock del browser; non è una connessione live.' : 'Report scaduto o clock incompatibile: stato corrente sconosciuto.'}</p>}
    </div>

    <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StateBlock title="Audio host" value={available ? showBool(report?.audio_available) : 'Non verificato'} hint="Solo disponibilità riportata" icon={<Headphones size={18} />} />
      <StateBlock title="Ingressi audio" value={available ? showCount(report?.input_device_count) : '—'} hint="Conteggio, non nomi dei dispositivi" icon={<Mic2 size={18} />} />
      <StateBlock title="Uscite audio" value={available ? showCount(report?.output_device_count) : '—'} hint="Nessuna prova di suono fisico" icon={<Headphones size={18} />} />
      <StateBlock title="Modelli locali pronti" value={available ? showCount(report?.ready_local_models) : '—'} hint="Stato riferito dal laboratorio" icon={<FileJson2 size={18} />} />
    </div>
    <p className="mt-6 text-xs leading-6 text-muted">Modelli cloud configurati (non verificati da remoto): {available ? showCount(report?.ready_cloud_models) : '—'} · Modello Piper caricato nel processo Voice Lab: {available ? showBool(report?.piper_model_loaded) : 'Non verificato'}. Nessun audio, trascrizione, dispositivo identificabile o segreto viene acquisito dal report.</p>
  </>;
}
