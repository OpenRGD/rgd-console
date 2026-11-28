/** Owner-pinned read-only offline consumer. No transport implementation or lifecycle actions. */
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {PERIPH_SCHEMAS,PERIPH_SOURCE_COMMIT} from './periph-schema-snapshot.ts';
import {parseVisualJson as parseBoundedJson} from './visual-json.ts';

const ajv=new Ajv2020({strict:false,allErrors:false,coerceTypes:false,removeAdditional:false,useDefaults:false});
addFormats(ajv);
const validators=Object.fromEntries(Object.entries(PERIPH_SCHEMAS).map(([key,schema])=>[key,ajv.compile(schema)]));
export const MAX_PERIPH_SNAPSHOT_BYTES=256*1024;
const MAX_FRAME_BYTES=2048,encoder=new TextEncoder();
const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-z][a-z0-9-]{0,79}$(?![\s\S])/.test(v);
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$(?![\s\S])/.test(v);
const safeRev=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const unit=(v:unknown):v is string=>typeof v==='string'&&/^openrgd-[a-z0-9-]{1,62}\.service$(?![\s\S])/.test(v);
const exact=(v:unknown,keys:string[]):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
function need(condition:unknown,label:string){if(!condition)throw Error(label);}
function check<T>(name:string,value:unknown):T{need(validators[name](value),'Contratto PERIPH non valido: '+name);return value as T;}
export type Descriptor={
 robot_id:string;peripheral_id:string;display_name:string;category:string;source_kind:string;schema_version:string;actuation_enabled:false;
 binding:{transport:string;binding_ref:string;verification:string};
 publisher:{publisher_id:string;host_id:string;manager:string;service_ref:string;resource_lock:string;ownership:string;startup_policy:string};
 streams:{stream_id:string;sample_schema:string;data_class:string;freshness_ms:number;nominal_rate_hz:number|null}[];capabilities:string[];
};
export type StatusRequest={schema_version:'openrgd.peripheral-host-request.v0.1-candidate';request_id:string;robot_id:string;peripheral_id:string;action:'status'};
type Reply={request_id:string;robot_id:string;peripheral_id:string;observed_at:string;status_revision:number;device:{presence:string;binding_verified:boolean};publisher:{lifecycle:string;manager_available:boolean;enabled_on_boot:boolean|null;service_ref:string|null};disposition:string;error_code:string|null;actuation_enabled:false};
type PublicStatus={robot_id:string;peripheral_id:string;status_revision:number;reported_at:string;device:{presence:string;binding_verified:boolean};publisher:{lifecycle:string;manager_available:boolean};streams:{stream_id:string;state:string;source_kind:string;last_received_at:string|null;age_ms:number|null}[];controls:{can_start:boolean;can_stop:boolean;reason:string};actuation_enabled:false};
export type Availability='reported'|'unavailable'|'unknown'|'reconciliation_required'|'recovery_unavailable';
export type ReadOnlyPeripheral={descriptor:Descriptor;availability:Availability;revision:number|null;observedAt:string|null;presence:string;lifecycle:string;managerAvailable:boolean|null;bindingVerified:boolean|null;errorCode:string|null;streams:{id:string;freshnessBudgetMs:number;reportedState:string;reportedAt:string|null;reportedAgeMs:number|null;sourceKind:string;currentState:'unknown'}[];publicStatusCompatible:boolean|null;controls:{canStart:false;canStop:false};physicalAuthority:false};
function decodeFrame(frame:unknown):unknown{
 need(typeof frame==='string','Frame mancante');const raw=frame as string;
 need(raw.endsWith('\n')&&!/[\r\n]/.test(raw.slice(0,-1))&&encoder.encode(raw).length<=MAX_FRAME_BYTES,'Frame IPC non valido');
 return parseBoundedJson(raw.slice(0,-1),MAX_FRAME_BYTES-1);
}
function encodeFrame(value:unknown):string{
 const frame=JSON.stringify(value)+'\n';need(encoder.encode(frame).length<=MAX_FRAME_BYTES,'Frame IPC oltre limite');return frame;
}
export function statusRequest(robotId:string,peripheralId:string,requestId:string):StatusRequest{
 need(id(robotId)&&id(peripheralId)&&uuid(requestId),'Scope o UUID non valido');
 return check<StatusRequest>('host-request',{schema_version:'openrgd.peripheral-host-request.v0.1-candidate',robot_id:robotId,peripheral_id:peripheralId,request_id:requestId,action:'status'});
}
export function validateDescriptor(value:unknown,robotId:string):Descriptor{
 const d=check<Descriptor>('descriptor',value);
 need(id(robotId)&&d.robot_id===robotId&&id(d.peripheral_id),'Descriptor di altro scope');
 need(d.capabilities.includes('observation.read'),'Capability di lettura mancante');
 const managed=d.capabilities.some(x=>x!=='observation.read');
 need(!managed||(d.source_kind==='physical'&&d.publisher.manager==='systemd_user'&&d.publisher.ownership==='exclusive_device_owner'),'Ownership incompatibile');
 need(new Set(d.streams.map(x=>x.stream_id)).size===d.streams.length,'Stream duplicato');return d;
}
function validatePublicStatus(value:unknown,d:Descriptor):PublicStatus{
 const s=check<PublicStatus>('status',value);
 need(s.robot_id===d.robot_id&&s.peripheral_id===d.peripheral_id&&safeRev(s.status_revision),'Status di altro scope o revisione invalida');
 need(!s.device.binding_verified||s.device.presence==='present','Binding incoerente');
 need(s.publisher.manager_available||(!s.controls.can_start&&!s.controls.can_stop),'Controlli incoerenti');
 need(s.device.presence!=='absent'||!s.controls.can_start,'Controlli incoerenti');
 const seen=new Set<string>();
 for(const item of s.streams){
  const spec=d.streams.find(x=>x.stream_id===item.stream_id);
  need(spec&&!seen.has(item.stream_id),'Stream non dichiarato o duplicato');seen.add(item.stream_id);
  need(item.age_ms===null||safeRev(item.age_ms),'Età stream invalida');
  need(item.state!=='no_source'||(item.last_received_at===null&&item.age_ms===null),'Stream senza fonte incoerente');
  need(item.state!=='live'||(item.source_kind===d.source_kind&&item.last_received_at!==null&&item.age_ms!==null&&item.age_ms<=spec!.freshness_ms),'Stream live dichiarato incoerente');
 }
 return s;
}
function validateReply(frame:string,request:StatusRequest,d:Descriptor,minRevision?:number):Reply{
 const r=check<Reply>('host-response',decodeFrame(frame));
 need(r.request_id===request.request_id&&r.robot_id===request.robot_id&&r.peripheral_id===request.peripheral_id,'Risposta IPC non correlata');
 need(safeRev(r.status_revision),'Revisione IPC non interoperabile');
 if(minRevision!==undefined)need(safeRev(minRevision)&&r.status_revision>=minRevision,'Revisione IPC regredita nella lineage dichiarata');
 need(r.disposition==='status'||r.disposition==='rejected','Risposta non di lettura');
 need(r.disposition!=='rejected'||r.error_code!==null,'Rifiuto senza motivo');
 need(!r.device.binding_verified||r.device.presence==='present','Binding IPC incoerente');
 const service=r.publisher.service_ref;need(service===null||unit(service),'Service ref IPC invalida');
 need(r.disposition!=='status'||(service!==null&&service===d.publisher.service_ref),'Service ref non corrispondente');
 return r;
}
/** One status-only exchange, injected offline. No default transport, retry or polling.
 * Optional revision floor only for a caller-established same lineage.
 */
export function readStatus(d:Descriptor,requestId:string,exchange:(frame:string)=>string|null,publicStatus:unknown=null,minRevision?:number):ReadOnlyPeripheral{
 d=validateDescriptor(d,d.robot_id);
 const req=statusRequest(d.robot_id,d.peripheral_id,requestId),status=publicStatus===null?null:validatePublicStatus(publicStatus,d);
 let frame:string|null=null;
 try{frame=exchange(encodeFrame(req));}catch{/* unavailable; never retry */}
 const reply=frame===null?null:validateReply(frame,req,d,minRevision),accepted=reply?.disposition==='status';
 let availability:Availability='unknown';
 if(!reply||!accepted)availability='unavailable';
 else if(reply.error_code==='reconciliation_required')availability='reconciliation_required';
 else if(reply.error_code==='recovery_unavailable')availability='recovery_unavailable';
 else if(!reply.publisher.manager_available)availability='unavailable';
 else if(reply.error_code!==null)availability='unknown';else availability='reported';
 const compatible=status===null?null:!!accepted&&status.status_revision===reply!.status_revision;
 const streamSource=compatible?status:null;
 return {descriptor:d,availability,revision:accepted?reply!.status_revision:null,observedAt:accepted?reply!.observed_at:null,
  presence:accepted?reply!.device.presence:'unknown',lifecycle:accepted?reply!.publisher.lifecycle:'unknown',managerAvailable:accepted?reply!.publisher.manager_available:null,bindingVerified:accepted?reply!.device.binding_verified:null,errorCode:reply?.error_code??null,
  publicStatusCompatible:compatible,streams:d.streams.map(spec=>{const sample=streamSource?.streams.find(s=>s.stream_id===spec.stream_id);return {id:spec.stream_id,freshnessBudgetMs:spec.freshness_ms,reportedState:sample?.state??'unknown',reportedAt:sample?.last_received_at??null,reportedAgeMs:sample?.age_ms??null,sourceKind:sample?.source_kind??'unknown',currentState:'unknown'};}),controls:{canStart:false,canStop:false},physicalAuthority:false};
}
export type OfflineSnapshot={robotId:string;sourceKind:'synthetic'|'operator_supplied_unverified';rows:ReadOnlyPeripheral[];liveConnection:false};
export function parsePeriphSnapshot(raw:string,selectedRobot:string):OfflineSnapshot{
 const v=parseBoundedJson(raw,MAX_PERIPH_SNAPSHOT_BYTES);
 if(!exact(v,['schema_version','owner_commit','robot_id','source_kind','entries','live_connection','actuation_enabled']))throw Error('Formato snapshot PERIPH non valido');
 need(v.schema_version==='console.periph-offline-snapshot.v0.1-candidate'&&v.owner_commit===PERIPH_SOURCE_COMMIT&&v.robot_id===selectedRobot&&id(selectedRobot)&&(v.source_kind==='synthetic'||v.source_kind==='operator_supplied_unverified')&&v.live_connection===false&&v.actuation_enabled===false,'Versione, scope o autorità non ammessa');
 need(Array.isArray(v.entries)&&v.entries.length<=32,'Inventario oltre limite');
 const seen=new Set<string>(),requests=new Set<string>(),owners=new Map<string,string>(),rows:ReadOnlyPeripheral[]=[];
 for(const row of v.entries as unknown[]){
  if(!exact(row,['descriptor','request_frame','response_frame','public_status']))throw Error('Riga inventario non valida');
  const d=validateDescriptor(row.descriptor,selectedRobot);
  need(!seen.has(d.peripheral_id),'Periferica duplicata');seen.add(d.peripheral_id);
  const resource=d.publisher.host_id+'\0'+d.publisher.resource_lock,owner=owners.get(resource);
  need(owner===undefined||owner===d.publisher.publisher_id,'Ownership dichiarata in conflitto');owners.set(resource,d.publisher.publisher_id);
  const request=check<StatusRequest>('host-request',decodeFrame(row.request_frame));
  need(request.action==='status'&&request.robot_id===selectedRobot&&request.peripheral_id===d.peripheral_id&&uuid(request.request_id),'Richiesta non read-only o di altro scope');
  need(!requests.has(request.request_id.toLowerCase()),'UUID ripetuto');requests.add(request.request_id.toLowerCase());
  need(row.response_frame===null||typeof row.response_frame==='string','Risposta non valida');
  // Imported request IDs are declared correlation, not authenticated requests.
  rows.push(readStatus(d,request.request_id,()=>row.response_frame as string|null,row.public_status));
 }
 return {robotId:selectedRobot,sourceKind:v.source_kind as OfflineSnapshot['sourceKind'],rows,liveConnection:false};
}
