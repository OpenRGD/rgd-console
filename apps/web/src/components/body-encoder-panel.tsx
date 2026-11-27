'use client';

import type {ImportedModel,TelemetrySnapshot} from '@/lib/contracts';
import {bodyEncoderDiagnostics} from '@/lib/body-encoder-diagnostics';
const labels={NO_SOURCE:'Non disponibile',STALE:'Scaduto',INVALID:'Non valido',AMBIGUOUS:'Ambiguo',OBSERVED_UNVERIFIED_MAPPING:'Osservato · mapping non verificato'};
export function BodyEncoderPanel({model,snapshot,robotId,physicalRobot,connected,now,selectedJoint=null}:
  {model:ImportedModel|null;snapshot:TelemetrySnapshot|null;robotId:string|null;physicalRobot:boolean;connected:boolean;now:number;selectedJoint?:string|null}){
  const result=bodyEncoderDiagnostics(model,snapshot,robotId,physicalRobot,connected,now);
  const rows=selectedJoint?result.rows.filter(r=>r.jointId===selectedJoint):result.rows;
  return <section className="space-y-3 rounded-xl border border-line bg-[#101d28] p-4" aria-label="Diagnostica giunti angolari">
    <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-100"><strong>ENCODER · SOLA LETTURA</strong><span>{result.observedReadOnly}/{result.expected} dichiarazioni angolari</span></div>
    <p className="text-xs leading-5 text-muted">Associazione, riduzione, segno e zero non verificati. {result.telemetryConnected?'Sorgente fisica dichiarata, non attestata.':'Nessuna telemetria fisica attuale verificabile.'} Giunti animati da encoder: 0.</p>
    {rows.length?<div className="max-h-60 overflow-auto divide-y divide-line">{rows.map(row=><div key={row.jointId} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 py-2 text-xs"><span className="break-all font-mono">{row.jointId}</span><strong>{row.angleRad===null?'—':String(row.angleRad)+' rad'}</strong><small className="col-span-2 text-muted">{labels[row.status]}</small></div>)}</div>:<p className="text-xs text-muted">Nessuna lettura angolare associabile alla selezione.</p>}
  </section>;
}
