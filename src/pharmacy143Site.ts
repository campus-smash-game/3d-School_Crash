import {cutTerrainPatchSteps} from './terrainPatch';
import * as THREE from 'three';
import { humanities23Frame } from './humanities23Site';
import type { Pharmacy20Layout } from './pharmacy20Site';
type XZ=[number,number];
export const PHARMACY143_ID='way/434754623';
export const PHARMACY143_BRIDGE_ROAD='way/435329616/178';
export const PHARMACY143_BOUNDS={minX:374,maxX:444,minZ:-942,maxZ:-862};
export function getPharmacy143Layout(heightAt:(x:number,z:number)=>number,pharmacy20:Pharmacy20Layout){
 const anchors:XZ[]=[[429.05,-868.36],[395.2,-899.25],[385.05,-909.75],[378.82,-929.69]];
 const curve=new THREE.CatmullRomCurve3(anchors.map(p=>new THREE.Vector3(p[0],0,p[1])),false,'centripetal');
 const front=Array.from({length:25},(_,i):XZ=>{const p=curve.getPoint(i/24);return[p.x,p.z];});
 const lower=front.map((p,i):XZ=>{const t=curve.getTangent(i/24);return[p[0]-t.z*3.2,p[1]+t.x*3.2];});
 const frames=front.slice(0,-1).map((p,i)=>humanities23Frame(p,front[i+1]));
 const lowerFrames=lower.slice(0,-1).map((p,i)=>humanities23Frame(p,lower[i+1]));
 const bridge=humanities23Frame([369.57,-896.58],[385.05,-909.75]);
 const bridgeFloor=pharmacy20.floor+10.5,floor=bridgeFloor-3.5,roof=floor+17.5;
 const entries=[{id:'main',index:9},{id:'bridgeSide',index:16}].map(e=>{const f=lowerFrames[e.index],s=f.length*.5;return {...e,f,s};});
 const apronFloor=floor-1.36;
 const walk=frames.map((f,i)=>({f,i,y0:i<5?heightAt(...f.point(0,-4))+.08:apronFloor,y1:i<4?heightAt(...f.point(f.length,-4))+.08:apronFloor}));
 return{front,lower,frames,lowerFrames,bridge,bridgeFloor,floor,roof,entries,apronFloor,walk,pharmacy20,bridgeWidth:1.5,steps:8,dimensionsEstimated:true};
}
export type Pharmacy143Layout=ReturnType<typeof getPharmacy143Layout>;
/** 연결교의 통행 영역을 외벽 선분에 투영한다. */
export function pharmacy143BridgeCut(q:Pharmacy143Layout,frame:ReturnType<typeof humanities23Frame>){
 const a=q.bridge.local(frame.point(0)),b=q.bridge.local(frame.point(frame.length));let low=0,high=1;
 for(const[start,end,min,max]of[[a.s,b.s,-4,q.bridge.length+6],[a.n,b.n,-1,1]]){if(Math.abs(end-start)<1e-9){if(start<min||start>max)return undefined;}else{const t=[(min-start)/(end-start),(max-start)/(end-start)].sort((a,b)=>a-b);low=Math.max(low,t[0]);high=Math.min(high,t[1]);}}
 return high>low?{a:low*frame.length,b:high*frame.length,bottom:q.bridgeFloor-.2,top:q.bridgeFloor+2.9}:undefined;
}
export function* cutPharmacy143TerrainSteps(positions:number[],indices:number[],q:Pharmacy143Layout){
 const zones=q.walk.map(w=>({f:w.f,s0:0,s1:w.f.length,n0:-4.7,n1:7,y:(s:number)=>w.y0+(w.y1-w.y0)*s/w.f.length}));
 const segments=zones.flatMap(a=>{const p=[a.f.point(a.s0,a.n0),a.f.point(a.s1,a.n0),a.f.point(a.s1,a.n1),a.f.point(a.s0,a.n1)];return p.map((b,i)=>[b,p[(i+1)%4]]);});
 const weight=(x:number,z:number,a:typeof zones[number])=>{const p=a.f.local([x,z]);return Math.max(0,1-Math.hypot(Math.max(0,a.s0-p.s,p.s-a.s1),Math.max(0,a.n0-p.n,p.n-a.n1))/.3);};
 const patch=(yield* cutTerrainPatchSteps(positions,indices,0,{bounds:PHARMACY143_BOUNDS,local:(x,z)=>({s:x,n:z}),lines:{s:[],n:[]},boundarySegments:segments,apply:(x,z,y)=>{let result=y;for(const a of zones){const p=a.f.local([x,z]);result=Math.min(result,y+(a.y(p.s)-.23-y)*weight(x,z,a));}return result;}}));
 return{...patch,affects:(x:number,z:number)=>zones.some(a=>weight(x,z,a)>0)};
}

export function cutPharmacy143Terrain(...args:Parameters<typeof cutPharmacy143TerrainSteps>){
  const steps=cutPharmacy143TerrainSteps(...args);let result=steps.next();
  while(!result.done)result=steps.next();
  return result.value;
}
