/** Consumer of the owner Visual #11 inert report. No robot binding or live authority. */
function exact(x:unknown,keys:string[]):x is Record<string,unknown>{
  return !!x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
}
const states=['idle','listening','thinking','speaking','error','off'];
export type VisualStatusProjection={inputKind:string;adapter:string;connected:boolean;desired:string;applied:string|null;ack:boolean;error:boolean;lastVoiceEvent:string|null;sequence:number|null;freshness:'unknown';physicalOutputObserved:false};
export function parseVisualStatus(input:unknown):VisualStatusProjection{
  const fail=()=>{throw new Error('Report Visual non valido o non privo di autorità.');};
  if(!exact(input,['schema_version','input_kind','freshness','source_authenticated','robot_binding_verified','physical_output_observed','physical_observation_ref','history_committed','actuation_enabled','may_drive_visual','non_actuating','reports']))throw Error('Formato report Visual non valido.');
  if(input.schema_version!=='openrgd.visual.ri-status-report.v0.1-candidate'||!['unverified_snapshot','synthetic','replay'].includes(input.input_kind as string)||input.freshness!=='unknown'||input.physical_observation_ref!==null||input.non_actuating!==true||
     ['source_authenticated','robot_binding_verified','physical_output_observed','history_committed','actuation_enabled','may_drive_visual'].some(k=>input[k]!==false))return fail();
  if(!Array.isArray(input.reports)||input.reports.length<1||input.reports.length>2)return fail();
  const [delivery,voice]=input.reports;
  const envelope=['event_kind','source_owner','reported_by','occurred_at','clock_domain_id','proof','data'];
  if(!exact(delivery,envelope)||delivery.event_kind!=='visual.delivery.status_snapshot'||delivery.source_owner!=='rgd-visual-feedback'||delivery.reported_by!=='rgd-visual-feedback'||delivery.occurred_at!==null||delivery.clock_domain_id!==null||delivery.proof!=='driver_status_only')return fail();
  const d=delivery.data;
  if(!exact(d,['adapter','connected','desired','rendered_scene','applied','driver_ack_reported','error_reported'])||d.adapter!=='miracles-star-ble'||typeof d.connected!=='boolean'||!states.includes(d.desired as string)||d.rendered_scene!==null||
     (d.applied!==null&&(!states.includes(d.applied as string)||!d.connected))||d.driver_ack_reported!==(d.applied!==null)||typeof d.error_reported!=='boolean')return fail();
  let lastVoiceEvent:string|null=null,sequence:number|null=null;
  if(input.reports.length===2){
    if(!exact(voice,envelope)||voice.event_kind!=='voice.lifecycle.last_accepted_report'||voice.source_owner!=='rgd-voice'||voice.reported_by!=='rgd-visual-feedback'||voice.occurred_at!==null||voice.clock_domain_id!==null||voice.proof!=='visual_gate_status_only')return fail();
    const v=voice.data;
    if(!exact(v,['source_schema','session_id','sequence','event'])||v.source_schema!=='openrgd.visual.voice-event.v0.1-candidate'||typeof v.session_id!=='string'||!/^[0-9a-f]{32}$/.test(v.session_id)||typeof v.sequence!=='number'||!Number.isSafeInteger(v.sequence)||v.sequence<0||
       !['listening.started','inference.started','playback.started','playback.ended','voice.error','voice.ready'].includes(v.event as string))return fail();
    lastVoiceEvent=v.event as string;sequence=v.sequence;
  }
  return {inputKind:input.input_kind as string,adapter:d.adapter,connected:d.connected,desired:d.desired as string,applied:d.applied as string|null,ack:d.driver_ack_reported as boolean,error:d.error_reported,lastVoiceEvent,sequence,freshness:'unknown',physicalOutputObserved:false};
}
