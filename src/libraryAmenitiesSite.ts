import {cutTerrainPatchSteps} from './terrainPatch';
import { humanities23Frame } from './humanities23Site';
import type { LibrarySoutheastLayout } from './librarySoutheastSite';
/** 도면 비례와 공식 VR의 통로 관계를 반영한다. 좌표와 표고는 실측값이 아니다. */
export function getLibraryAmenitiesLayout(previous:LibrarySoutheastLayout,heightAt:(x:number,z:number)=>number){
 const courtFloor=previous.down[0].y1;
 const down=previous.down.map((a,i)=>{
  const y0=i===1||i===2?courtFloor:a.y0,y1=i===1?courtFloor:a.y1;
  const profile=a.profile.map((p,k)=>({...p,y:k<2?y0:y1}));
  const height=(s:number)=>{const k=profile.findIndex(p=>p.s>=s);if(k<0)return y1;if(k===0)return y0;const a=profile[k-1],b=profile[k];return a.y+(b.y-a.y)*(s-a.s)/(b.s-a.s);};
  return{...a,y0,y1,profile,height};
 });
 const access={...previous,lowerStart:-41,lowerEnd:-39.6,mainStart:-36,mainEnd:-30.8,terraceFront:-30.5,down};
 const eastFrame=humanities23Frame(previous.point(55,-19.2),[409.85,-790.46]);
 const east={frame:eastFrame,y0:courtFloor,y1:heightAt(409.85,-790.46)+.04,width:4.8};
 return{access,courtFloor,east,roof:{minX:-47.5,maxX:55.5,front:-30.5,back:-21.5,floor:access.terraceFloor},court:{minX:-53.2,maxX:55,front:-21.5,back:-10},bridge:{minX:-12,maxX:-8,front:-21.5,back:-9.5},dimensionsEstimated:true,surveyed:false};
}
export type LibraryAmenitiesLayout=ReturnType<typeof getLibraryAmenitiesLayout>;
export function* cutLibraryAmenitiesTerrainSteps(positions:number[],indices:number[],q:LibraryAmenitiesLayout){
 const f=q.access.f;
 const zones=[{f,s0:q.court.minX,s1:q.court.maxX,n0:-24.5,n1:-8.7,y:(_s:number)=>q.courtFloor-.26},
  {f:q.east.frame,s0:0,s1:q.east.frame.length,n0:-2.55,n1:2.55,y:(s:number)=>q.east.y0+(q.east.y1-q.east.y0)*Math.max(0,Math.min(1,s/q.east.frame.length))-.26},
  ...q.access.down.map(a=>({f:a.frame,s0:a.start,s1:a.frame.length,n0:-a.width/2-.15,n1:a.width/2+.15,y:(s:number)=>a.height(s)-.26})),
  {f,s0:q.access.stairX-3.4,s1:q.access.stairX+3.4,n0:q.access.approachStart,n1:-34.9,y:()=>q.access.firstFloor-.25}];
 const segments=zones.flatMap(a=>[0,.6].flatMap(m=>{const p=[a.f.point(a.s0-m,a.n0-m),a.f.point(a.s1+m,a.n0-m),a.f.point(a.s1+m,a.n1+m),a.f.point(a.s0-m,a.n1+m)];return p.map((b,i)=>[b,p[(i+1)%4]]);}));
 for(const a of q.access.down)for(const p of a.profile)segments.push([a.frame.point(p.s,-a.width/2-.15),a.frame.point(p.s,a.width/2+.15)]);
 const points=segments.flatMap(p=>p),bounds={minX:Math.min(287,...points.map(p=>p[0]))-.1,maxX:Math.max(380,...points.map(p=>p[0]))+.1,minZ:Math.min(-894,...points.map(p=>p[1]))-.1,maxZ:Math.max(-835,...points.map(p=>p[1]))+.1};
 const weight=(x:number,z:number,a:typeof zones[number])=>{const p=a.f.local([x,z]);return Math.max(0,1-Math.hypot(Math.max(0,a.s0-p.s,p.s-a.s1),Math.max(0,a.n0-p.n,p.n-a.n1))/.6);};
 const patch=(yield* cutTerrainPatchSteps(positions,indices,0,{bounds,local:(x,z)=>({s:x,n:z}),lines:{s:[],n:[]},boundarySegments:segments,apply:(x,z,y)=>{let out=y;for(const a of zones){const w=weight(x,z,a);if(w<=0)continue;const p=a.f.local([x,z]);out=out+(a.y(p.s)-out)*w;}return out;}}));
 return{...patch,affects:(x:number,z:number)=>zones.some(a=>weight(x,z,a)>0)};
}

export function cutLibraryAmenitiesTerrain(...args:Parameters<typeof cutLibraryAmenitiesTerrainSteps>){
  const steps=cutLibraryAmenitiesTerrainSteps(...args);let result=steps.next();
  while(!result.done)result=steps.next();
  return result.value;
}
