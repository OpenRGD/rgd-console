'use client';
import {useEffect,useRef,useState} from 'react';
import {MAX_PERIPH_SNAPSHOT_BYTES,parsePeriphSnapshot,type OfflineSnapshot} from '@/lib/periph-readonly';
import {PERIPH_SOURCE_COMMIT} from '@/lib/periph-schema-snapshot';
const label={reported:'Stato riportato',unavailable:'Non disponibile',unknown:'Sconosciuto',reconciliation_required:'Riconciliazione necessaria',recovery_unavailable:'Recovery non disponibile'};
export function PeripheralsPanel({robotId}:{robotId:string}){
 const [snapshot,setSnapshot]=useState<OfflineSnapshot|null>(null),[error,setError]=useState('');
 const seq=useRef(0);useEffect(()=>()=>{seq.current+=1;},[]);
 async function load(file:File|undefined){
  if(!file)return;
  const revision=++seq.current;setSnapshot(null);setError('');
  try{if(!file.size||file.size>MAX_PERIPH_SNAPSHOT_BYTES)throw Error('size');
   const raw=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());if(revision!==seq.current)return;
   setSnapshot(parsePeriphSnapshot(raw,robotId));
  }catch{if(revision===seq.current)setError('Snapshot rifiutato: formato, versione, correlazione o scope non compatibile.');}
 }
 return <div className="space-y-5">
  <section className="panel space-y-3 p-5">
   <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Peripheral Manager</h2><span className="rounded-full border border-amber-400/30 px-3 py-1 text-xs text-amber-200">OFFLINE · SOLA LETTURA</span></div>
   <p className="text-xs leading-6 text-muted">PERIPH 0.1.0-alpha.1 · pin {PERIPH_SOURCE_COMMIT.slice(0,12)} · ambito {robotId}. Nessuna connessione autorizzata al broker. Informazioni importate dichiarate, non attestate e non live.</p>
   <div className="flex flex-wrap items-center gap-3"><input type="file" accept=".json,application/json" aria-label="Importa snapshot PERIPH offline" className="text-xs" onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';void load(file);}}/><button type="button" onClick={()=>{seq.current+=1;setSnapshot(null);setError('');}} className="rounded-lg border border-line px-3 py-2 text-xs">Chiudi snapshot</button></div>
   {error&&<p role="alert" className="text-xs text-amber-200">{error}</p>}
   <p className="text-xs text-muted">{snapshot?'Fonte dichiarata: '+snapshot.sourceKind:'Manager non disponibile · inventario e stato correnti sconosciuti. Importare una fixture del robot selezionato.'}</p>
  </section>
  {snapshot?.rows.map(row=><section key={row.descriptor.peripheral_id} className="panel space-y-4 p-5">
   <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold break-all">{row.descriptor.display_name}</h3><p className="text-xs text-muted break-all">{row.descriptor.peripheral_id} · {row.descriptor.category} · {row.descriptor.source_kind}</p></div><span className="rounded-lg border border-amber-400/25 px-3 py-2 text-xs text-amber-200">{label[row.availability]}</span></div>
   <div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
   {Object.entries({'Binding dichiarato':row.descriptor.binding.verification,'Trasporto dichiarato':row.descriptor.binding.transport,'Binding ref (opaco)':row.descriptor.binding.binding_ref,'Owner publisher':row.descriptor.publisher.publisher_id,'Manager dichiarato':row.descriptor.publisher.manager,'Presenza riportata':row.presence,'Lifecycle riportato':row.lifecycle,'Manager disponibile nel report':row.managerAvailable===null?'Sconosciuto':row.managerAvailable?'Sì':'No','Binding verificato nel report':row.bindingVerified===null?'Sconosciuto':row.bindingVerified?'Sì (dichiarato)':'No','Revisione riportata':row.revision??'—','Timestamp riportato':row.observedAt??'—','Errore riportato':row.errorCode??'—'}).map(([key,value])=><div key={key} className="rounded-lg border border-line p-3"><p className="text-muted">{key}</p><strong className="mt-1 block break-all">{value}</strong></div>)}
   </div>
   <p className="text-xs text-muted">Capability dichiarate (non permessi): {row.descriptor.capabilities.join(' · ')}</p>
   {row.publicStatusCompatible===false&&<p className="text-xs text-amber-200">Report stream non correlato alla revisione host: stato sconosciuto.</p>}
   <div className="space-y-2">{row.streams.map(s=><div key={s.id} className="rounded-lg border border-line p-3 text-xs"><div className="flex flex-wrap justify-between gap-2"><strong className="break-all">{s.id}</strong><span className="text-amber-200">Stato attuale: sconosciuto</span></div><p className="mt-1 text-muted">Stato storico dichiarato: {s.reportedState} · fonte {s.sourceKind} · età riportata {s.reportedAgeMs??'—'} ms · budget {s.freshnessBudgetMs} ms</p></div>)}</div>
   <div className="flex flex-wrap items-center gap-2"><button disabled type="button" className="rounded-lg border border-line px-3 py-2 text-xs opacity-40">Avvia acquisizione</button><button disabled type="button" className="rounded-lg border border-line px-3 py-2 text-xs opacity-40">Ferma acquisizione</button><span className="text-xs text-muted">PERIPH-0.3 e trasporto autorizzato richiesti.</span></div>
  </section>)}
  {snapshot&&snapshot.rows.length===0&&<p className="text-xs text-muted">Nessuna periferica dichiarata nello snapshot.</p>}
  <p className="text-xs leading-5 text-muted">Presenza, lifecycle e freschezza sono indipendenti: running non significa stream LIVE. IMU e stream esistenti restano indipendenti. Nessun file inviato o conservato.</p>
 </div>;
}
