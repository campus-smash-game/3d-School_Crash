import {cutTerrainPatchSteps} from './terrainPatch';
import { humanities23Frame } from './humanities23Site';

export const PHYSICS561_ID = 'supplemental/snu-56-1';
export const PHYSICS56_ID = 'way/167595745';
export const PHYSICS561_FRAME = humanities23Frame([270.8,-926.56],[284.53,-932.96]);
export const PHYSICS561_BOUNDS = {minX:240,maxX:320,minZ:-948,maxZ:-884};
export type Physics561Surface = {name:string;s0:number;s1:number;n0:number;n1:number;y0:number;y1:number;axis:'s'|'n';y2?:number};
export function getPhysics561Layout(heightAt:(x:number,z:number)=>number) {
 const f=PHYSICS561_FRAME, floor=heightAt(262.8611111,-964.6594444)+.1;
 const floors=[floor-4.3,floor,floor+3.6,floor+7.15,floor+10.7],roof=floor+14.32;
 const surfaces:Physics561Surface[]=[], routes:Record<string,[number,number,number][]>={};
 const at=(s:number,n:number,y:number):[number,number,number]=>{const p=f.point(s,n);return[p[0],y,p[1]];};
 const add=(name:string,s0:number,s1:number,n0:number,n1:number,y0:number,y1=y0,axis:'s'|'n'='s')=>surfaces.push({name,s0,s1,n0,n1,y0,y1,axis});
 add('lower-entry-apron',-20,-12.1,0,25,floors[0]);
 add('lower-walk-approach',-23,-20,0,25,heightAt(...f.point(-23,12)),floors[0]);
 const flight=(name:string,s0:number,s1:number,n:number,width:number,ya:number,yb:number)=>{
  const count=Math.ceil(Math.abs(yb-ya)/.17),r=[at(s0+.08,n,ya)];
  for(let i=0;i<count;i++){const a=s0+(s1-s0)*i/count,b=s0+(s1-s0)*(i+1)/count,y=ya+(yb-ya)*(i+1)/count;add(name,a,b,n-width/2,n+width/2,y);r.push(at((a+b)/2,n,y));}
  r.push(at(s1-.08,n,yb));return r;
 };
 for(const [name,n,width,end] of [['south-gap',1.5,2.2,29],['north-garden',24,2.6,29]] as const){
  const a=flight(name+'-lower-stair',-19,-6,n,width,floors[0],floor);
  add(name+'-middle-landing',-6,8,n-width/2,n+width/2,floor);
  const high=heightAt(...f.point(end,n))+.04;
  const b=flight(name+'-upper-stair',8,27,n,width,floor,high);
  add(name+'-upper-landing',27,end+1,n-width/2,n+width/2,high);
  routes[name]=[...a,at(7,n,floor),...b,at(end,n,high)];
 }
 const upper=floors[3],apron=upper-1.05;
 add('upper-entry-landing',15.6,21.5,3,21.5,upper);
 add('upper-entry-apron',27,29,3,21.5,apron);
 // 도로 접속부는 기존 지형에 맞춰 짧은 띠로 나눈다.
 for(let n=3;n<21.5;n+=1){const end=Math.min(n+1,21.5);add('upper-road-approach',29,34,n,end,apron,heightAt(...f.point(34,n))+.03);surfaces.at(-1)!.y2=heightAt(...f.point(34,end))+.03;}
 routes.upperSteps=[at(28,18.5,apron),...flight('upper-main-stair',21.5,27,18.5,2.8,upper,apron).reverse(),at(19,18.5,upper),at(14.2,18.5,upper)];
 const ramp:[number,number,number][]=[at(28,4.5,apron),at(26,4.5,apron)];
 add('ramp-bottom-landing',25.2,28,3.7,4.5,apron);
 for(let i=0;i<3;i++){
  const s=26-i*1.7,ya=apron+1.05*i/3,yb=apron+1.05*(i+1)/3,forward=i%2===0;
  add('switchback-ramp',s-.75,s+.75,4.5,15.5,forward?ya:yb,forward?yb:ya,'n');
  ramp.push(at(s,forward?15.5:4.5,yb));
  if(i<2){const n=forward?15.5:3;add('ramp-turn-landing',s-2.45,s+.75,n,n+1.5,yb);ramp.push(at(s-1.7,forward?16:4,yb),at(s-1.7,forward?15.5:4.5,yb));}
 }
 add('ramp-top-landing',20,23.35,15.5,17,upper);
 routes.upperRamp=[...ramp,at(22.6,16.2,upper),at(20.5,16.2,upper),at(19,18.5,upper),at(14.2,18.5,upper)];
 routes.upperRoad=[at(33.8,12,apron+(heightAt(...f.point(34,12))+.03-apron)*4.8/5),at(28,12,apron),at(28,18.5,apron),...routes.upperSteps.slice(1)];
 routes.lowerEntry=[at(-22.8,7,surfaces[1].y0+(floors[0]-surfaces[1].y0)*.2/3),at(-21,7,floors[0]),at(-15,7,floors[0]),at(-10.5,7,floors[0])];
 const bridges=[floors[2],floors[3]].map((y,i)=>({name:'bridge-'+(i+2),floor:y,s:7,width:2.4}));
 for(const b of bridges)routes[b.name]=[at(b.s,-2,b.floor),at(b.s,1.5,b.floor),at(b.s,5,b.floor)];
 const openings=bridges.map(b=>({buildingId:PHYSICS56_ID,a:f.point(b.s-b.width/2,0),b:f.point(b.s+b.width/2,0),bottom:b.floor-.22,top:b.floor+2.9}));
 return{f,floor,floors,roof,apron,surfaces,routes,bridges,openings,dimensionsEstimated:true};
}
export type Physics561Layout=ReturnType<typeof getPhysics561Layout>;
export function physics561SurfaceHeight(a:Physics561Surface,s:number,n:number){if(a.y2!==undefined){const u=Math.max(0,Math.min(1,(s-a.s0)/(a.s1-a.s0))),v=Math.max(0,Math.min(1,(n-a.n0)/(a.n1-a.n0)));return u>=v?a.y0+(a.y1-a.y0)*u+(a.y2-a.y1)*v:a.y0+(a.y2-a.y0)*u;}const t=a.axis==='s'?(s-a.s0)/(a.s1-a.s0):(n-a.n0)/(a.n1-a.n0);return a.y0+(a.y1-a.y0)*Math.max(0,Math.min(1,t));}
export function* cutPhysics561TerrainSteps(positions:number[],indices:number[],q:Physics561Layout){
 const zones:Physics561Surface[]=[...q.surfaces,{name:'basement',s0:-13,s1:12.4,n0:3,n1:21.5,y0:q.floors[0],y1:q.floors[0],axis:'s'},{name:'buried-east',s0:12.4,s1:16.3,n0:3,n1:21.5,y0:q.floor,y1:q.floor,axis:'s'}];
 const weight=(s:number,n:number,a:Physics561Surface)=>Math.max(0,1-Math.hypot(Math.max(0,a.s0-s,s-a.s1),Math.max(0,a.n0-n,n-a.n1))/.3);
 const segments=zones.flatMap(a=>{const p=[q.f.point(a.s0,a.n0),q.f.point(a.s1,a.n0),q.f.point(a.s1,a.n1),q.f.point(a.s0,a.n1)];return p.map((b,i)=>[b,p[(i+1)%4]]);});
 const patch=(yield* cutTerrainPatchSteps(positions,indices,0,{bounds:PHYSICS561_BOUNDS,local:(x,z)=>q.f.local([x,z]),lines:{s:[],n:[]},boundarySegments:segments,apply:(x,z,y)=>{const p=q.f.local([x,z]);let result=y;for(const a of zones)result=Math.min(result,y+(physics561SurfaceHeight(a,p.s,p.n)-.24-y)*weight(p.s,p.n,a));return result;}}));
 return{...patch,affects:(x:number,z:number)=>{const p=q.f.local([x,z]);return zones.some(a=>weight(p.s,p.n,a)>0);}};
}

export function cutPhysics561Terrain(...args:Parameters<typeof cutPhysics561TerrainSteps>){
  const steps=cutPhysics561TerrainSteps(...args);let result=steps.next();
  while(!result.done)result=steps.next();
  return result.value;
}
