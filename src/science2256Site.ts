import { humanities23Frame } from './humanities23Site';
import { cutTerrainPatch } from './terrainPatch';
import { physics561SurfaceHeight, type Physics561Layout, type Physics561Surface } from './physics561Site';
import { createScience2256Access, SCIENCE2256_DOORS, type Science2256Surface } from './science2256AccessSite';

export const SCIENCE22_ID='way/167605495', SCIENCE56_ID='way/167595745';
export const SCIENCE2256_BOUNDS={minX:180,maxX:300,minZ:-1022,maxZ:-896};
export function getScience2256Layout(heightAt:(x:number,z:number)=>number,newBuilding:Physics561Layout,completeAccess=true){
 const f=newBuilding.f, floor56=newBuilding.floor, bridgeFloor=newBuilding.floors[2];
 // 층고와 현관 단차는 게임용 근사다. 기존 연결교의 공식 접속층은 확인하지 못했다.
 const floors56=[floor56,...newBuilding.floors.slice(2),newBuilding.floors[4]+3.55],roof56=floors56[4]+3.55;
 const floors22=[bridgeFloor-10.6,bridgeFloor-7.1,bridgeFloor-3.55,bridgeFloor],roof22=bridgeFloor+3.55;
 const surfaces:Science2256Surface[]=[],routes:Record<string,[number,number,number][]>={};
 const at=(s:number,n:number,y:number):[number,number,number]=>{const p=f.point(s,n);return[p[0],y,p[1]];};
 const add=(name:string,s0:number,s1:number,n0:number,n1:number,y0:number,y1=y0,axis:'s'|'n'='s')=>surfaces.push({name,s0,s1,n0,n1,y0,y1,axis});
 const walk=floors22[1]-.3;
 add('court-paving',-23,-8,-74,-5,walk);
 const south=heightAt(...f.point(-15,-84))+.03;
 add('south-approach',-23,-8,-84,-74,south,walk,'n');
 add('north-approach',-23,-8,-5,0,walk,newBuilding.floors[0],'n');
 routes.court=[at(-16,-83.8,south+(walk-south)*.02),at(-16,-74,walk),at(-16,-34,walk),at(-16,-5,walk),at(-16,-.1,newBuilding.floors[0]+(walk-newBuilding.floors[0])*.02)];
 const flight=(name:string,s0:number,s1:number,n:number,width:number,low:number,high:number)=>{
  const count=Math.ceil(Math.abs(high-low)/.17),route=[at(s0+.06,n,low)];
  for(let i=0;i<count;i++){const a=s0+(s1-s0)*i/count,b=s0+(s1-s0)*(i+1)/count,y=low+(high-low)*(i+1)/count;add(name,a,b,n-width/2,n+width/2,y);route.push(at((a+b)/2,n,y));}
  route.push(at(s1-.06,n,high));return route;
 };
 const westEntries=completeAccess?['56-west-south','56-west-north'].map(name=>f.local(SCIENCE2256_DOORS.find(d=>d.name===name)!.point).n):[-50,-14];
 for(const [name,n,width]of[['56-main',westEntries[0],8],['56-north',westEntries[1],3]] as const){
  const end=name==='56-north'?-3:-1;
  const stair=flight(name+'-stair',end-7,end,n,width,walk,floor56);
  add(name+'-landing',end,5,n-width/2,n+width/2,floor56);
  routes[name]=[at(-13,n,walk),...stair,at(2.8,n,floor56)];
 }
 if(completeAccess){
  const d=f.local(SCIENCE2256_DOORS.find(d=>d.name==='22-east-south')!.point);
  add('22-ramp',-22,-19.6,-73.5,d.n-1.5,walk,floors22[1],'n');
  add('22-entry-landing',-26.8,-19.6,d.n-1.5,d.n+1.5,floors22[1]);
  routes.entry22=[at(-16,-73.5,walk),at(-20.8,-73.5,walk),at(-20.8,d.n,floors22[1]),at(d.s-1.5,d.n,floors22[1])];
 }else{
  add('22-ramp',-22.7,-20.3,-60,-43,walk,floors22[1],'n');
  add('22-entry-landing',-27,-20.3,-43,-40,floors22[1]);
  routes.entry22=[at(-18,-60,walk),at(-21.5,-60,walk),at(-21.5,-42,floors22[1]),at(-26,-41.5,floors22[1])];
 }
 const bridge=humanities23Frame([235.07,-947.14],[255.67,-956.51]);
 routes.bridge=[[-0.8,0],[bridge.length/2,0],[bridge.length+.8,0]].map(([s,n])=>{const p=bridge.point(s,n);return[p[0],bridgeFloor,p[1]];});
 const access=completeAccess?createScience2256Access(f,floors22,floors56,heightAt,surfaces,routes,newBuilding):undefined;
 const bounds=completeAccess?{...SCIENCE2256_BOUNDS,maxZ:-880}:SCIENCE2256_BOUNDS;
 return{f,floors56,floors22,roof56,roof22,bridge,bridgeFloor,surfaces,routes,walk,newBuilding,westEntries,access,bounds,dimensionsEstimated:true};
}
export type Science2256Layout=ReturnType<typeof getScience2256Layout>;
export function cutScience2256Terrain(positions:number[],indices:number[],q:Science2256Layout,buildings:{id:string;points:[number,number][]}[]){
 const rings=buildings.filter(b=>[SCIENCE22_ID,SCIENCE56_ID].includes(b.id)).map(b=>({points:b.points,floor:(b.id===SCIENCE22_ID?q.floors22:q.floors56)[0]}));
 const inside=(x:number,z:number,points:[number,number][])=>{let result=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])result=!result;}return result;};
 const segments=q.surfaces.flatMap(a=>{const f=a.frame??q.f,p=[f.point(a.s0,a.n0),f.point(a.s1,a.n0),f.point(a.s1,a.n1),f.point(a.s0,a.n1)];return p.map((b,i)=>[b,p[(i+1)%4]]);});
 for(const ring of rings)for(let i=1;i<ring.points.length;i++)segments.push([ring.points[i-1],ring.points[i]]);
 const weight=(s:number,n:number,a:Physics561Surface)=>Math.max(0,1-Math.hypot(Math.max(0,a.s0-s,s-a.s1),Math.max(0,a.n0-n,n-a.n1))/.25);
 const patch=cutTerrainPatch(positions,indices,0,{bounds:q.bounds,local:(x,z)=>q.f.local([x,z]),lines:{s:[],n:[]},boundarySegments:segments,apply:(x,z,y)=>{
  let result=y;
  for(const a of q.surfaces){const p=(a.frame??q.f).local([x,z]);result=Math.min(result,y+(physics561SurfaceHeight(a,p.s,p.n)-.25-y)*weight(p.s,p.n,a));}
  for(const ring of rings)if(inside(x,z,ring.points))result=Math.min(result,ring.floor-.25);
  return result;
 }});
 return{...patch,affects:(x:number,z:number)=>q.surfaces.some(a=>{const p=(a.frame??q.f).local([x,z]);return weight(p.s,p.n,a)>0;})||rings.some(r=>inside(x,z,r.points))};
}
