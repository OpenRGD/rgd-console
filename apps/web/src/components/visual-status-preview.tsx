'use client';
import {useEffect,useRef,useState} from 'react';
import {parseVisualJson} from '@/lib/visual-json';
import {parseVisualStatus,type VisualStatusProjection} from '@/lib/visual-status-report';
export function VisualStatusPreview(){
  const [data,setData]=useState<VisualStatusProjection|null>(null),[error,setError]=useState('');
  const revision=useRef(0);
  useEffect(()=>()=>{revision.current+=1;},[]);
  async function load(file:File|undefined){
    if(!file)return;
    const request=++revision.current;setData(null);setError('');
    try{
      if(file.size>65536||file.size===0)throw Error('size');
      const raw=await file.text();if(request!==revision.current)return;
      setData(parseVisualStatus(parseVisualJson(raw,65536)));
    }catch{if(request===revision.current)setError('Report rifiutato: formato, numeri o autorità incompatibili.');}
  }
  return <section className="panel space-y-4 p-5" aria-label="Report driver Visual non associato">
    <h2 className="text-sm font-semibold">Delivery &amp; Voice · snapshot non associato</h2>
    <p className="text-xs leading-6 text-muted">Importa un report redatto dall’owner Visual. Non contiene un binding robot verificato né un tempo di osservazione. Non è telemetria live, non alimenta il Composer o Reality Ingress.</p>
    <input aria-label="Importa report Visual" type="file" accept=".json,application/json" className="text-xs" onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';void load(file);}}/>
    <button type="button" onClick={()=>{revision.current+=1;setData(null);setError('');}} className="ml-3 rounded-lg border border-line px-3 py-2 text-xs">Chiudi report</button>
    {error&&<p role="alert" className="text-xs text-amber">{error}</p>}
    {data&&<div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
      {Object.entries({'Input dichiarato':data.inputKind,'Adapter dichiarato':data.adapter,'Connessione nel report':data.connected?'Sì':'No','Desired':data.desired,'Applied (driver)':data.applied??'Non disponibile','ACK riportato':data.ack?'Sì':'No','Errore riportato':data.error?'Sì':'No','Ultimo evento Voice riportato':data.lastVoiceEvent??'Non disponibile','Sequenza (non verificata)':data.sequence??'—','Freschezza':'Sconosciuta','Output fisico':'Non osservato','Binding robot':'Non verificato'}).map(([k,v])=><div key={k} className="rounded-lg border border-line p-3"><p className="text-muted">{k}</p><strong className="mt-1 block break-all">{v}</strong></div>)}
    </div>}
  </section>;
}
