/** Universal nominal source-only kinematic tree projection. No telemetry input. */
import type { ImportedModel, RgdJoint } from './contracts';
import { nominalRpy } from './model-metadata.ts';

export type Vec3 = [number, number, number];
type Quaternion = [number, number, number, number]; // xyzw
interface Frame { position: Vec3; rotation: Quaternion }
export interface NominalBone {
  jointId:string; parentLink:string; childLink:string; from:Vec3; to:Vec3;
}
export interface NominalBody {
  state:'empty'|'invalid'|'partial'|'nominal'; root:string|null;
  bones:NominalBone[]; links:{id:string;position:Vec3}[];
  omitted:{jointId:string;reason:'missing_transform'|'unsupported_joint'|'unresolved_parent'|'numeric_limit'}[];
  reason:string|null; declaredJoints:number; physicalPoseVerified:false;
}
export const MAX_PREVIEW_LINKS=512;
const MAX_COORDINATE_M=1_000_000; // numeric/rendering budget, NOT a physical limit
const types=new Set(['FIXED','REVOLUTE','CONTINUOUS','PRISMATIC']);
const validId=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=512;
const finitePosition=(v:Vec3)=>v.every(x=>Number.isFinite(x)&&Math.abs(x)<=MAX_COORDINATE_M);
const triple=(v:unknown):Vec3|null=>{const a=nominalRpy(v);return a?[a[0],a[1],a[2]]:null;};
function multiply(a:Quaternion,b:Quaternion):Quaternion{
  const [x,y,z,w]=a,[u,v,t,s]=b;
  return [w*u+x*s+y*t-z*v,w*v-x*t+y*s+z*u,w*t+x*v-y*u+z*s,w*s-x*u-y*v-z*t];
}
function rpyRotation([r,p,y]:Vec3):Quaternion{
  return multiply(multiply([0,0,Math.sin(y/2),Math.cos(y/2)],
    [0,Math.sin(p/2),0,Math.cos(p/2)]),[Math.sin(r/2),0,0,Math.cos(r/2)]);
}
function rotate(q:Quaternion,v:Vec3):Vec3{
  const a=multiply(multiply(q,[...v,0]),[-q[0],-q[1],-q[2],q[3]]);
  return [a[0],a[1],a[2]];
}
const add=(a:Vec3,b:Vec3):Vec3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];

/** Mathematical zero for supported single-axis/fixed joints, NOT actual or
 * safe pose (zero may be outside nominal limits). Missing transforms block
 * their subtrees. The root is an arbitrary local mathematical reference.
 */
export function nominalBody(model:Pick<ImportedModel,'links'|'joints'>|null):NominalBody{
  const declaredJoints=Array.isArray(model?.joints)?model.joints.length:0;
  const blank=(state:NominalBody['state'],reason:string):NominalBody=>({
    state,root:null,bones:[],links:[],omitted:[],reason,declaredJoints,physicalPoseVerified:false,
  });
  if(!model)return blank('empty','Nessun modello RGD associato');
  if(!Array.isArray(model.links)||!Array.isArray(model.joints))return blank('invalid','Topologia non valida');
  if(model.links.length>MAX_PREVIEW_LINKS||model.joints.length>MAX_PREVIEW_LINKS)return blank('invalid','Modello oltre il budget della vista');
  if(!model.joints.length)return blank('empty','Nessuna articolazione dichiarata');
  const links=new Set<string>(),ids=new Set<string>(),incoming=new Set<string>();
  const children=new Map<string,RgdJoint[]>();
  for(const link of model.links){
    if(!link||!validId(link.id)||links.has(link.id))return blank('invalid','Link assente o duplicato');
    links.add(link.id);
  }
  for(const j of model.joints){
    if(!j||!validId(j.id)||ids.has(j.id)||!validId(j.parent_link)||!validId(j.child_link)||
      !links.has(j.parent_link)||!links.has(j.child_link)||j.parent_link===j.child_link||incoming.has(j.child_link))
      return blank('invalid','Riferimenti di giunto ambigui o non risolti');
    ids.add(j.id);incoming.add(j.child_link);
    const row=children.get(j.parent_link)??[];row.push(j);children.set(j.parent_link,row);
  }
  const roots=[...links].filter(id=>!incoming.has(id));
  if(roots.length!==1)return blank('invalid','Attesa una sola radice; grafo disconnesso o ciclico');
  const root=roots[0],order:string[]=[root],seen=new Set<string>(order);
  for(let i=0;i<order.length;i++)for(const j of children.get(order[i])??[]){
    const child=j.child_link!;
    if(seen.has(child))return blank('invalid','Ciclo nella topologia');
    seen.add(child);order.push(child);
  }
  if(seen.size!==links.size)return blank('invalid','Link non raggiungibili dalla radice');
  const frames=new Map<string,Frame>([[root,{position:[0,0,0],rotation:[0,0,0,1]}]]);
  const bones:NominalBone[]=[],omitted:NominalBody['omitted']=[];
  for(const id of order){
    const parent=frames.get(id);
    for(const joint of children.get(id)??[]){
      const child=joint.child_link!;
      const fail=(reason:NominalBody['omitted'][number]['reason'])=>omitted.push({jointId:joint.id,reason});
      if(!parent){fail('unresolved_parent');continue;}
      if(typeof joint.joint_type!=='string'||!types.has(joint.joint_type.toUpperCase())){fail('unsupported_joint');continue;}
      const xyz=triple(joint.origin_xyz_m),rpy=triple(joint.origin_rpy_rad);
      if(!xyz||!rpy){fail('missing_transform');continue;}
      const position=add(parent.position,rotate(parent.rotation,xyz));
      const rotation=multiply(parent.rotation,rpyRotation(rpy)),magnitude=Math.hypot(...rotation);
      if(!finitePosition(xyz)||!finitePosition(position)||!Number.isFinite(magnitude)||magnitude<1e-12){fail('numeric_limit');continue;}
      frames.set(child,{position,rotation:rotation.map(x=>x/magnitude) as Quaternion});
      bones.push({jointId:joint.id,parentLink:id,childLink:child,from:parent.position,to:position});
    }
  }
  return {state:omitted.length?'partial':'nominal',root,bones,links:[...frames].map(([id,frame])=>({id,position:frame.position})),
    omitted,reason:null,declaredJoints,physicalPoseVerified:false};
}

/** Display fit does not change source positions in meters. */
export function fitNominalBody(body:NominalBody){
  const points=body.links.map(x=>x.position);
  if(!points.length)return {center:[0,0,0] as Vec3,scale:1};
  const low:Vec3=[...points[0]],high:Vec3=[...points[0]];
  for(const point of points)for(let i=0;i<3;i++){low[i]=Math.min(low[i],point[i]);high[i]=Math.max(high[i],point[i]);}
  const center=[0,1,2].map(i=>(low[i]+high[i])/2) as Vec3;
  const extent=Math.max(...high.map((x,i)=>x-low[i]));
  return {center,scale:extent>1e-9?2/extent:1};
}
export function toDisplay(point:Vec3,fit:ReturnType<typeof fitNominalBody>):Vec3{
  return point.map((x,i)=>(x-fit.center[i])*fit.scale) as Vec3;
}
