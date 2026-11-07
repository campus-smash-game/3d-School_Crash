import {cutTerrainPatchSteps} from './terrainPatch';
import { humanities23Frame } from './humanities23Site';
import type { Education1320Layout } from './education1320Site';
type XZ=[number,number];
export const PHARMACY20_ID='way/167598095';
export const PHARMACY20_BOUNDS={minX:345,maxX:440,minZ:-905,maxZ:-815};
export const pharmacy20NW=humanities23Frame([421.48,-819.92],[351.82,-884.73]);
export function getPharmacy20Layout(heightAt:(x:number,z:number)=>number,bridge:Education1320Layout){
 const f=pharmacy20NW,floor=bridge.floor,terrace=floor+3.5,roof=floor+17.5;
 const profile=Array.from({length:33},(_,i)=>{const s=f.length*i/32;return{s,y:heightAt(...f.point(s,-.8))+.07};});
 const walkHeight=(s:number)=>{s=Math.max(0,Math.min(f.length,s));const k=Math.min(31,Math.floor(s/f.length*32)),a=profile[k],b=profile[k+1];return a.y+(b.y-a.y)*(s-a.s)/(b.s-a.s);};
 const entries=[{id:'northeast',s:22,floor},{id:'central',s:60,floor},{id:'terrace',s:48,floor:terrace}];
 const renderRing:XZ[]=[[351.82,-884.73],[357.97,-891.16],[364.87,-898.76],[365.96,-899.93],[369.57,-896.58],[383.84,-883.3],[412.26,-856.85],[435.62,-835.11],[427.65,-826.55],[421.48,-819.92],[371.12,-866.76]];
 // 지도 원본은 보존한다. 북서쪽 외벽은 도로와 보도 폭에 맞춰 안쪽으로 근사한다.
 for(const i of[0,9,10]){const p=f.local(renderRing[i]);renderRing[i]=f.point(p.s,3.2);}
 return{f,floor,terrace,roof,profile,walkHeight,entries,renderRing,bridge,frontGlassN:6.5,upperFrontN:3.2,stair:{s0:46.2,s1:49.8,n0:.8,n1:5.5},dimensionsEstimated:true};
}
export type Pharmacy20Layout=ReturnType<typeof getPharmacy20Layout>;
export function* cutPharmacy20TerrainSteps(positions:number[],indices:number[],q:Pharmacy20Layout){
 const f=q.f,zones=[{s0:0,s1:f.length,n0:-.6,n1:1.2,y:(s:number)=>q.walkHeight(s)},...[[18,26],[44,46.2],[49.8,67]].map(([s0,s1])=>({s0,s1,n0:1.2,n1:6.5,y:(s:number)=>Math.min(q.floor,q.walkHeight(s))})),...q.entries.map(e=>({s0:e.s-2.1,s1:e.s+2.1,n0:e.id==='terrace'?5.5:1.2,n1:10,y:()=>e.floor})),{s0:45.9,s1:50.1,n0:-.2,n1:6.5,y:()=>q.floor}];
 const segments=zones.flatMap(a=>{const p=[f.point(a.s0,a.n0),f.point(a.s1,a.n0),f.point(a.s1,a.n1),f.point(a.s0,a.n1)];return p.map((b,i)=>[b,p[(i+1)%4]]);});
 for(const p of q.profile)segments.push([f.point(p.s,-.6),f.point(p.s,1.2)]);
 const weight=(s:number,n:number,a:typeof zones[number])=>Math.max(0,1-Math.hypot(Math.max(0,a.s0-s,s-a.s1),Math.max(0,a.n0-n,n-a.n1))/.45);
 const affects=(x:number,z:number)=>{const p=f.local([x,z]);return zones.some(a=>weight(p.s,p.n,a)>0);};
 const patch=(yield* cutTerrainPatchSteps(positions,indices,0,{bounds:PHARMACY20_BOUNDS,local:(x,z)=>f.local([x,z]),lines:{s:[],n:[]},boundarySegments:segments,apply:(x,z,y)=>{const p=f.local([x,z]);let result=y;for(const a of zones)result=Math.min(result,y+(a.y(p.s)-.22-y)*weight(p.s,p.n,a));return result;}}));
 return{...patch,affects};
}

export function cutPharmacy20Terrain(...args:Parameters<typeof cutPharmacy20TerrainSteps>){
  const steps=cutPharmacy20TerrainSteps(...args);let result=steps.next();
  while(!result.done)result=steps.next();
  return result.value;
}
