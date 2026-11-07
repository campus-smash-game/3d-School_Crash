import {cutTerrainPatchSteps} from './terrainPatch';
import { humanities23Frame } from './humanities23Site';
type XZ=[number,number];
export const EDUCATION13_ID='way/251646340';
export const EDUCATION13_BOUNDS={minX:403,maxX:541,minZ:-842,maxZ:-750};
const ring:XZ[]=[[523.38,-769.7],[526.19,-776.5],[530.46,-786.85],[468,-815.03],[444.16,-825.78],[439.81,-814.98],[436.82,-807.55],[493.28,-782.86]];
export const education13Frames=ring.map((p,i)=>humanities23Frame(ring[(i+1)%ring.length],p));
export const education13Doors=[
  {id:'main1',name:'1층 정문',edge:7,s:23.381471,level:0,stairs:false},
  {id:'rear129',name:'129호 옆 후문',edge:7,s:2.849426,level:0,stairs:false},
  {id:'rear111',name:'111호 옆 후문',edge:6,s:52.433716,level:0,stairs:true},
  {id:'main2',name:'2층 정문',edge:2,s:11.017291,level:1,stairs:false},
];
const mappedStairs=[
  {id:'way/248012354/94',points:[[536.37,-759.57],[524.74,-764.69]] as XZ[]},
  {id:'way/456540231/334',points:[[409.85,-790.46],[418.76,-800.05],[424.37,-812.07]] as XZ[]},
];
export function getEducation13Layout(heightAt:(x:number,z:number)=>number){
  const floor=58.5+(heightAt(500.440947,-775.599836)-57.962577239593);
  const entries=education13Doors.map(d=>{const f=education13Frames[d.edge],y=floor+d.level*3.5,outer=heightAt(...f.point(d.s,-7))+.06,top=d.stairs?Math.max(y,heightAt(...f.point(d.s,-3))+.08):y;return{...d,f,floor:y,outer,top};});
  const stairs=mappedStairs.flatMap(r=>r.points.slice(1).map((b,i)=>{const a=r.points[i],f=humanities23Frame(a,b);return{id:r.id,segment:i,f,lo:heightAt(...a)+.08,hi:heightAt(...b)+.08,width:2.2};}));
  return{floor,roof:floor+14,entries,stairs};
}
export type Education13Layout=ReturnType<typeof getEducation13Layout>;
export function* cutEducation13TerrainSteps(positions:number[],indices:number[],q:Education13Layout){
  const zones=q.entries.map(e=>({f:humanities23Frame(e.f.point(e.s,-7),e.f.point(e.s,5)),half:1.9,length:12,at:(s:number)=>s<4?e.outer+(e.top-e.outer)*s/4:e.stairs&&s<6.7?e.top+(e.floor-e.top)*(s-4)/2.7:e.floor}));
  zones.push(...q.stairs.map(s=>({f:s.f,half:s.width/2+.12,length:s.f.length,at:(u:number)=>s.lo+(s.hi-s.lo)*u/s.f.length})));
  const segments=zones.flatMap(z=>{const p=[z.f.point(0,-z.half),z.f.point(z.length,-z.half),z.f.point(z.length,z.half),z.f.point(0,z.half)];return [...p.map((a,i)=>[a,p[(i+1)%4]]),...(z.length===12?[4,6.7].map(s=>[z.f.point(s,-z.half),z.f.point(s,z.half)]):[])];});
  const patch=(yield* cutTerrainPatchSteps(positions,indices,0,{bounds:EDUCATION13_BOUNDS,lines:{s:[],n:[]},local:(x,z)=>({s:x,n:z}),boundarySegments:segments,
    apply:(x,z,y)=>{let value=y;for(const a of zones){const p=a.f.local([x,z]),distance=Math.hypot(Math.max(0,-p.s,p.s-a.length),Math.max(0,Math.abs(p.n)-a.half));if(distance>=1)continue;const weight=1-distance,goal=a.at(Math.max(0,Math.min(a.length,p.s)))-.19;value=Math.min(value,y+(goal-y)*weight);}return value;}
  }));
  return {...patch,affects:(x:number,z:number)=>zones.some(a=>{const p=a.f.local([x,z]);return Math.hypot(Math.max(0,-p.s,p.s-a.length),Math.max(0,Math.abs(p.n)-a.half))<1;})};
}

export function cutEducation13Terrain(...args:Parameters<typeof cutEducation13TerrainSteps>){
  const steps=cutEducation13TerrainSteps(...args);let result=steps.next();
  while(!result.done)result=steps.next();
  return result.value;
}
