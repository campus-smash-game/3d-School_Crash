import * as THREE from 'three';
import {MeshoptDecoder} from 'meshoptimizer/decoder';
export const campusDecoderReady=MeshoptDecoder.ready;

type Ref = {r:number} | {u:1} | {n:string} | string | number | boolean | null;
type Registry = Record<string,(env:Record<string,unknown>)=>(...args:any[])=>any>;

/** 배포 전에 만든 형상과 기존 갱신 함수의 상태를 복원한다. */
export function decodeCampusSnapshot(buffer:ArrayBuffer,updaters:Registry):any {
  const view=new DataView(buffer),headerLength=view.getUint32(0,true),start=view.getUint32(4,true);
  const data=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,8,headerLength)));
  if(data.schema!==2)throw new Error('Unsupported campus snapshot');
  const values:any[]=new Array(data.records.length),filled=new Uint8Array(data.records.length);
  const emptyGeometry=new THREE.BufferGeometry(),emptyMaterial=new THREE.MeshBasicMaterial();
  const constructors=THREE as unknown as Record<string,any>;
  const arrays={Float32Array,Float64Array,Uint32Array,Uint16Array,Uint8Array,Uint8ClampedArray,Int32Array,Int16Array,Int8Array};
  const entries=(props:any):[string,Ref][]=>Array.isArray(props)?data.layouts[props[0]].map((key:string,i:number)=>[key,props[1][i]]):Object.entries(props);
  const assign=(out:any,props:any)=>{if(Array.isArray(props)){const keys=data.layouts[props[0]],refs=props[1];for(let i=0;i<keys.length;i++)out[keys[i]]=read(refs[i]);}else for(const[k,v]of Object.entries(props))out[k]=read(v as Ref);};
  function read(ref:Ref):any{
    if(ref===null||typeof ref!=='object')return ref;
    if('u'in ref)return undefined;if('n'in ref)return Number(ref.n);
    const id=ref.r;if(filled[id])return values[id];
    filled[id]=1;const r=data.records[id],type=r[0];let value:any;
    switch(type){
      case 'three':value=THREE;break;
      case 'numeric':case 'typed':{
        const ctor=arrays[r[1] as keyof typeof arrays],offset=start+r[2];
        if(!r[5])value=new ctor(buffer,offset,r[4]).slice();
        else if(r[5]===5){
          value=new ctor(r[4]);const info=new DataView(buffer,offset,8),count=info.getUint32(0,true),size=info.getUint32(4,true),dict=new Uint32Array(count*3),indices=new Uint32Array(r[4]/3);
          MeshoptDecoder.decodeVertexBuffer(new Uint8Array(dict.buffer),count,12,new Uint8Array(buffer,offset+8,size));
          MeshoptDecoder.decodeIndexSequence(new Uint8Array(indices.buffer),indices.length,4,new Uint8Array(buffer,offset+8+size,r[3]-8-size));
          const words=new Uint32Array(value.buffer);for(let i=0;i<indices.length;i++){const j=indices[i]*3;words[i*3]=dict[j];words[i*3+1]=dict[j+1];words[i*3+2]=dict[j+2];}
        }else if(r[5]===4){
          value=new ctor(r[4]);MeshoptDecoder.decodeVertexBuffer(new Uint8Array(value.buffer),value.byteLength/r[6],r[6],new Uint8Array(buffer,offset,r[3]));
        }else if(r[5]===3){
          value=new ctor(r[4]);const bytes=new Uint8Array(value.buffer),packed=new Uint8Array(buffer,offset,r[3]),width=r[6];
          for(let b=0;b<width;b++)for(let i=0;i<r[4];i++)bytes[i*width+b]=packed[b*r[4]+i];
        }else{
          value=new ctor(r[4]);const words=new Uint32Array(value.buffer),dictionary=new Uint32Array(buffer,offset,r[6]);
          const ids=r[5]===1?new Uint8Array(buffer,offset+r[6]*4,r[4]):new Uint16Array(buffer,offset+r[6]*4,r[4]);
          for(let i=0;i<words.length;i++)words[i]=dictionary[ids[i]];
        }if(type==='numeric')value=Array.from(value);break;
      }
      case 'copy':value=read(r[1]).slice(r[2],r[2]+r[3]);break;
      case 'array':value=[];values[id]=value;for(const item of r[1])value.push(read(item));break;
      case 'map':value=new Map();values[id]=value;for(const[k,v]of r[1])value.set(read(k),read(v));break;
      case 'set':value=new Set();values[id]=value;for(const v of r[1])value.add(read(v));break;
      case 'object':value={};values[id]=value;assign(value,r[1]);break;
      case 'function':{
        let fn:(...args:any[])=>any;value=(...args:any[])=>fn(...args);values[id]=value;
        const factory=updaters[r[1]];if(!factory)throw new Error('Missing campus updater '+r[1]);fn=factory(read(r[2]));break;
      }
      case 'value':value=new constructors[r[1]]().fromArray(r[2].map((x:any)=>x==='-0'?-0:x));break;
      case 'box':value=new THREE.Box3();values[id]=value;value.min=read(r[1]);value.max=read(r[2]);break;
      case 'sphere':value=new THREE.Sphere();values[id]=value;value.center=read(r[1]);value.radius=r[2];break;
      case 'interleaved':value=new THREE.InterleavedBuffer(read(r[1]),r[2]);value.setUsage(r[3]);break;
      case 'interleavedAttribute':value=new THREE.InterleavedBufferAttribute(read(r[1]),r[2],r[3],r[4]);break;
      case 'attribute':value=r[5]?new THREE.InstancedBufferAttribute(read(r[1]),r[2],r[3],r[5]):new THREE.BufferAttribute(read(r[1]),r[2],r[3]);value.setUsage(r[4]);break;
      case 'geometry':value=new THREE.BufferGeometry();values[id]=value;for(const[k,v]of Object.entries(r[1]))value.setAttribute(k,read(v as Ref));value.setIndex(read(r[2]));value.boundingBox=read(r[3]);value.boundingSphere=read(r[4]);value.drawRange=read(r[5]);value.groups=read(r[6]);value.userData=read(r[7])??{};break;
      case 'canvas':{
        value=document.createElement('canvas');value.width=r[1];value.height=r[2];const ctx=value.getContext('2d'),gradients:any[]=[];
        for(const c of r[3]){if(c[0]==='gradient')gradients[c[1]]=ctx[c[2]](...c[3]);else if(c[0]==='stop')gradients[c[1]].addColorStop(...c[2]);else if(c[0]==='set')ctx[c[1]]=c[2]?.gradient!==undefined?gradients[c[2].gradient]:c[2];else ctx[c[1]](...c[2]);}break;
      }
      case 'texture':value=new THREE.CanvasTexture(read(r[1]));values[id]=value;assign(value,r[2]);value.needsUpdate=true;break;
      case 'material':value=new constructors[r[1]]();values[id]=value;assign(value,r[2]);break;
      case 'proxy':{
        value=new THREE.Mesh(emptyGeometry,emptyMaterial);values[id]=value;
        value.geometry=read(r[1]);value.material=read(r[2]);value.position.fromArray(r[3]);value.quaternion.fromArray(r[4]);value.scale.fromArray(r[5]);value.userData=read(r[6])??{};value.userData.campusImmutableGeometry=true;value.name=r[7];value.visible=r[8];value.updateMatrix();break;
      }
      case 'object3d':{
        value=r[1]==='InstancedMesh'?new THREE.InstancedMesh(emptyGeometry,emptyMaterial,0):r[1]==='Mesh'?new THREE.Mesh(emptyGeometry,emptyMaterial):new constructors[r[1]]();values[id]=value;
        for(const[k,ref]of entries(r[2])){
          if(k==='layers'){value.layers.mask=read(ref as Ref);continue;}
          if(k==='userData'){value.userData=read(ref as Ref)??{};continue;}
          if(['position','quaternion','scale','matrix','center'].includes(k)){value[k].copy(read(ref as Ref));continue;}
          value[k]=read(ref as Ref);
        }
        for(const child of r[3])value.add(read(child));value.updateMatrix();break;
      }
      default:throw new Error('Unsupported campus record '+type);
    }
    values[id]=value;return value;
  }
  return read(data.entry);
}
