'use client';

import { Canvas } from '@react-three/fiber';
import { Component,useMemo,type ReactNode } from 'react';
import { Quaternion,Vector3 } from 'three';
import type { ImportedModel } from '@/lib/contracts';
import { nominalBody,fitNominalBody,toDisplay,type Vec3 } from '@/lib/body-kinematics';

/** Single source-only renderer for Body and Robot Live. */
class ViewportBoundary extends Component<{children:ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<div className="grid h-full place-items-center p-6 text-xs text-muted">WebGL non disponibile. La topologia testuale resta accessibile.</div>:this.props.children;}
}
function Bone({from,to,selected}:{from:Vec3;to:Vec3;selected:boolean}){
  const a=new Vector3(...from),b=new Vector3(...to),delta=b.clone().sub(a),length=delta.length();
  if(length<1e-7)return null;
  const q=new Quaternion().setFromUnitVectors(new Vector3(0,1,0),delta.normalize());
  return <mesh position={a.add(b).multiplyScalar(.5)} quaternion={q}>
    <cylinderGeometry args={[.018,.018,length,8]}/>
    <meshStandardMaterial color={selected?'#ffbe72':'#79bfc9'} roughness={.65}/>
  </mesh>;
}
export default function BodyViewport({model,selectedJoint=null}:{model:ImportedModel|null;selectedJoint?:string|null}){
  const body=useMemo(()=>nominalBody(model),[model]),fit=useMemo(()=>fitNominalBody(body),[body]);
  const show=(body.state==='nominal'||body.state==='partial')&&body.bones.length>0;
  return <div className="space-y-3">
    <div className="relative h-[320px] overflow-hidden rounded-xl bg-[#0a121b] sm:h-[420px]">
      {show?<ViewportBoundary key={model?.model_id}>
        <Canvas frameloop="demand" dpr={[1,1.5]} camera={{position:[3.2,-4.1,2.6],fov:45,near:.01,far:30,up:[0,0,1]}}
          gl={{antialias:true,powerPreference:'low-power'}} onCreated={({camera})=>{camera.lookAt(0,0,0);camera.updateProjectionMatrix();}}
          fallback={<div className="grid h-full place-items-center text-xs text-muted">WebGL non disponibile.</div>}>
          <color attach="background" args={['#0a121b']}/>
          <ambientLight intensity={1.1}/><directionalLight position={[2,-2,4]} intensity={1.5}/>
          <axesHelper args={[.55]}/>
          {body.bones.map(b=><Bone key={b.jointId} from={toDisplay(b.from,fit)} to={toDisplay(b.to,fit)} selected={b.jointId===selectedJoint}/>)}
          {body.links.map(link=><mesh key={link.id} position={toDisplay(link.position,fit)}>
            <sphereGeometry args={[.035,10,8]}/><meshStandardMaterial color={link.id===body.root?'#63e5c0':'#f3bf72'}/>
          </mesh>)}
        </Canvas>
      </ViewportBoundary>:<div className="grid h-full place-items-center p-8 text-center text-xs text-muted">{body.reason??'Nessuna catena con trasformazioni nominali sufficienti. Nessuna geometria inventata.'}</div>}
      <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-line bg-[#0b141de9] px-3 py-2 text-[11px] text-slate-200">RIFERIMENTO NOMINALE · NON POSA FISICA</div>
    </div>
    <div className="rounded-lg border border-line px-4 py-3 text-xs leading-5 text-slate-300">
      <strong>{body.bones.length}/{body.declaredJoints} trasformazioni proiettate</strong> · {body.declaredJoints-body.bones.length} non risolte
      <p className="mt-1 text-muted">Origine matematica, zero cinematico di riferimento (non verifica dei limiti), scala adattata alla vista. Punti e segmenti sono origini dei frame, non mesh, collisioni o posizione fisica.</p>
      {body.omitted.length>0&&<details className="mt-2"><summary className="cursor-pointer text-amber">Trasformazioni non disponibili</summary><ul className="mt-2 max-h-32 overflow-auto space-y-1">{body.omitted.map(x=><li key={x.jointId} className="break-all">{x.jointId}: {x.reason.replaceAll('_',' ')}</li>)}</ul></details>}
      {body.state==='invalid'&&<p className="text-amber">Topologia non rappresentabile: {body.reason}.</p>}
    </div>
  </div>;
}
