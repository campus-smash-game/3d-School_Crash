import { humanities23Frame } from './humanities23Site';
import { cutTerrainPatch } from './terrainPatch';
import { education13Frames, type Education13Layout } from './education13Site';
type XZ=[number,number];
export const EDUCATION1320_ID='way/300587512';
export const EDUCATION20_ID='way/167598095';
export const EDUCATION1320_BOUNDS={minX:419,maxX:450,minZ:-840,maxZ:-808};
export function getEducation1320Layout(heightAt:(x:number,z:number)=>number,e13:Education13Layout){
 const front=humanities23Frame([427.65,-826.55],[439.81,-814.98]),stair=humanities23Frame([424.37,-812.07],[442.99,-833.92]);
 // 사진의 낮은 연결교와 뒤쪽 계단을 분리한다. 깊이 4.8m는 실측이 아닌 외관 근사다.
 const depth=4.8,ends=[humanities23Frame([427.65,-826.55],[435.62,-835.11]),humanities23Frame([439.81,-814.98],[444.16,-825.78])];
 const edgePoint=(i:number,n:number)=>{const f=ends[i],p=front.local(f.point(1));return f.point(n/p.n);};
 const polygon=[front.point(0),front.point(front.length),edgePoint(1,-depth),edgePoint(0,-depth)];
 const door20=ends[0],door13=education13Frames[4],center20=edgePoint(0,-depth/2),center13=edgePoint(1,-depth/2),floor=e13.floor+3.5;
 const lo=e13.stairs.find(s=>s.id==='way/456540231/334'&&s.segment===1)!.hi,landing=lo+.51,hi=heightAt(...stair.point(stair.length))+.08;
 const profile=[{s:0,y:lo},{s:6.3,y:lo},{s:7.5,y:landing},{s:18.2,y:landing},{s:stair.length-.6,y:hi},{s:stair.length,y:hi}];
 const ground=(s:number)=>{s=Math.max(0,Math.min(stair.length,s));const b=profile.findIndex(p=>p.s>=s);if(b<=0)return lo;const a=profile[b-1],c=profile[b];return a.y+(c.y-a.y)*(s-a.s)/(c.s-a.s);};
 return {front,stair,depth,polygon,ends,floor,roof:floor+3.35,lo,landing,hi,profile,ground,width:7.2,door20,door13,s20:door20.local(center20).s,s13:door13.local(center13).s};
}
export type Education1320Layout=ReturnType<typeof getEducation1320Layout>;
export function education1320Opening(q:Education1320Layout){return{buildingId:EDUCATION20_ID,edgeIndex:7,a:q.door20.point(q.s20-1.4),b:q.door20.point(q.s20+1.4),bottom:q.floor-.2,top:q.floor+2.8};}
export function cutEducation1320Terrain(positions:number[],indices:number[],q:Education1320Layout){
 const half=q.width/2+.15,segments=q.profile.map(p=>[q.stair.point(p.s,-half),q.stair.point(p.s,half)]);
 for(const n of[-half,half])segments.push([q.stair.point(3.5,n),q.stair.point(q.stair.length,n)]);
 const doors=[{f:q.door13,s:q.s13,n0:-.6,n1:3.4},{f:q.door20,s:q.s20,n0:-3.4,n1:.6}];
 for(const d of doors){const p=[d.f.point(d.s-1.65,d.n0),d.f.point(d.s+1.65,d.n0),d.f.point(d.s+1.65,d.n1),d.f.point(d.s-1.65,d.n1)];segments.push(...p.map((a,i)=>[a,p[(i+1)%4]]));}
 const weight=(x:number,z:number)=>{const p=q.stair.local([x,z]);return Math.max(0,Math.min(1,(p.s-3.5)/.8,(q.stair.length+.6-p.s)/.6,(half+.8-Math.abs(p.n))/.8));};
 const doorWeight=(x:number,z:number,d:typeof doors[number])=>{const p=d.f.local([x,z]),dist=Math.hypot(Math.max(0,Math.abs(p.s-d.s)-1.65),Math.max(0,d.n0-p.n,p.n-d.n1));return Math.max(0,1-dist/.6);};
 const affects=(x:number,z:number)=>weight(x,z)>0||doors.some(d=>doorWeight(x,z,d)>0);
 const patch=cutTerrainPatch(positions,indices,0,{bounds:EDUCATION1320_BOUNDS,lines:{s:[],n:[]},local:(x,z)=>({s:x,n:z}),boundarySegments:segments,apply:(x,z,y)=>{let result=Math.min(y,y+(q.ground(q.stair.local([x,z]).s)-.22-y)*weight(x,z));for(const d of doors)result=Math.min(result,y+(q.floor-.22-y)*doorWeight(x,z,d));return result;}});
 return{...patch,affects};
}
