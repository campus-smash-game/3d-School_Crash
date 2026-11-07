import { humanities23Frame } from './humanities23Site';
import { cutTerrainPatch } from './terrainPatch';
import { physics561SurfaceHeight } from './physics561Site';
import { ENGINEERING33_ID, type Engineering3033Layout } from './engineering3033Site';
import type { Engineering30Surface } from './engineering30Site';

export { ENGINEERING33_ID };
type XZ=[number,number];
type Frame=ReturnType<typeof humanities23Frame>;

export function getEngineering33Layout(heightAt:(x:number,z:number)=>number,footprint:XZ[],court:Engineering3033Layout){
  const outline=footprint.slice(0,-1),annex=humanities23Frame(outline[5],outline[6]);
  const north=humanities23Frame(outline[7],outline[0]),south=humanities23Frame(outline[1],outline[2]);
  const main=[outline[0],outline[1],outline[2],outline[7]],wing=[outline[3],outline[4],outline[5],outline[6]];
  const pilotiFloor=heightAt(...annex.point(23,-4))+.08,floor=pilotiFloor+3.7,roof=floor+10.5;
  const surfaces:Engineering30Surface[]=[],routes:Record<string,[number,number,number][]>={};
  const at=(f:Frame,s:number,n:number,y:number):[number,number,number]=>{const p=f.point(s,n);return[p[0],y,p[1]];};
  const add=(name:string,frame:Frame,s0:number,s1:number,n0:number,n1:number,y0:number,y1=y0,axis:'s'|'n'='s')=>{const a={name,frame,s0,s1,n0,n1,y0,y1,axis};surfaces.push(a);return a;};
  // 서쪽 좁은 날개의 기둥 아래를 비운다. 바닥 표고와 기둥 간격은 게임 지형에 맞춘 근사다.
  for(let s=14;s<annex.length;s+=4)add('piloti-paving',annex,s,Math.min(s+4,annex.length),-8.03,0,pilotiFloor);
  for(let s=6;s<14;s+=4)add('entry-room-floor',annex,s,s+4,-8.03,0,pilotiFloor+.14);
  add('piloti-north-landing',annex,26,annex.length,0,3.5,pilotiFloor);
  const through=32;
  const southern=humanities23Frame(annex.point(through,-8),[177.18,-1146.45]);
  const southLow=heightAt(...southern.point(southern.length,0))+.035;
  for(let i=0;i<4;i++)add('piloti-south-approach',southern,southern.length*i/4,southern.length*(i+1)/4,-2.1,2.1,pilotiFloor+(southLow-pilotiFloor)*i/4,pilotiFloor+(southLow-pilotiFloor)*(i+1)/4);
  routes.pilotiNorthSouth=[at(annex,through,3.1,pilotiFloor),at(annex,through,-4,pilotiFloor),at(annex,through,-7.9,pilotiFloor),at(southern,southern.length-.1,0,southLow+(pilotiFloor-southLow)*.1/southern.length)];
  const entry=10,entryFloor=pilotiFloor+.14,entryLow=heightAt(...annex.point(entry,-12.5))+.035;
  add('west-entry-approach',annex,entry-1.8,entry+1.8,-12.5,-8.5,entryLow,entryFloor,'n');
  add('west-entry-landing',annex,entry-1.8,entry+1.8,-8.5,-8.03,entryFloor);
  routes.westEntry=[at(annex,entry,-12.4,entryLow+(entryFloor-entryLow)*.1/4),at(annex,entry,-8.3,entryFloor),at(annex,entry,-6,entryFloor)];
  routes.pilotiEastWest=[at(annex,16,-4,pilotiFloor),at(annex,through,-4,pilotiFloor),at(annex,37,-4,pilotiFloor)];
  // 2011년 동쪽 E33 현관 사진의 깊은 문과 짧은 계단이다. 현재 상태는 미확인이다.
  const east=humanities23Frame(outline[1],outline[0]),eastDoor=east.length/2,eastBottom=heightAt(...east.point(eastDoor,-3.3))+.035;
  const eastCount=Math.max(3,Math.ceil((floor-eastBottom)/.16)),eastSteps:[number,number,number][]=[];
  const eastApproach=heightAt(...east.point(eastDoor,-8.1))+.035;
  add('east-entry-approach',east,eastDoor-1.7,eastDoor+1.7,-8.1,-3.3,eastApproach,eastBottom,'n');
  for(let i=0;i<eastCount;i++){const n0=-3.3+3*i/eastCount,n1=-3.3+3*(i+1)/eastCount,y=eastBottom+(floor-eastBottom)*(i+1)/eastCount;add('east-entry-stair',east,eastDoor-1.6,eastDoor+1.6,n0,n1,y);eastSteps.push(at(east,eastDoor,(n0+n1)/2,y));}
  add('east-entry-landing',east,eastDoor-1.6,eastDoor+1.6,-.3,1.8,floor);
  routes.eastEntry=[at(east,eastDoor,-8,eastApproach+(eastBottom-eastApproach)*.1/4.8),...eastSteps,at(east,eastDoor,1.2,floor)];
  // 2024년 사진의 남서쪽 짧은 계단이다. 32동 공사 경계의 동쪽에서 내려온다.
  const stair=humanities23Frame(court.west.point(79,-21),[187.1,-1117.4]),flightStart=3.1;
  const count=Math.max(3,Math.ceil((court.upper-pilotiFloor)/.16)),steps:[number,number,number][]=[];
  add('court-stair-top',stair,-1.2,flightStart,-1.6,1.6,court.upper);
  for(let i=0;i<count;i++){
    const s0=flightStart+(stair.length-flightStart-.8)*i/count,s1=flightStart+(stair.length-flightStart-.8)*(i+1)/count,y=court.upper+(pilotiFloor-court.upper)*(i+1)/count;
    add('court-southwest-stair',stair,s0,s1,-1.6,1.6,y);steps.push(at(stair,(s0+s1)/2,0,y));
  }
  add('court-stair-bottom',stair,stair.length-.8,stair.length+.5,-1.6,1.6,pilotiFloor);
  const northLink=humanities23Frame(stair.point(stair.length,0),annex.point(35,3));
  add('north-piloti-link',northLink,0,northLink.length,-1.6,1.6,pilotiFloor);
  routes.courtToPiloti=[at(stair,-.9,0,court.upper),...steps,at(stair,stair.length,0,pilotiFloor),at(northLink,northLink.length,0,pilotiFloor),at(annex,through,0,pilotiFloor)];
  const polygons=surfaces.map(a=>[a.frame.point(a.s0,a.n0),a.frame.point(a.s1,a.n0),a.frame.point(a.s1,a.n1),a.frame.point(a.s0,a.n1)]);
  const points=[...outline,...polygons.flat()],bounds={minX:Math.min(...points.map(p=>p[0]))-.5,maxX:Math.max(...points.map(p=>p[0]))+.5,minZ:Math.min(...points.map(p=>p[1]))-.5,maxZ:Math.max(...points.map(p=>p[1]))+.5};
  const oldCourtMask=[court.west.point(40,-22),court.west.point(80,-22),court.west.point(80,-3.9),court.west.point(40,-3.9)];
  return {outline,main,wing,annex,north,south,east,eastDoor,eastBottom,eastCount,floor,roof,pilotiFloor,pilotiCeiling:floor,entry,entryFloor,stair,stairCount:count,surfaces,polygons,routes,bounds,oldCourtMask};
}
export type Engineering33Layout=ReturnType<typeof getEngineering33Layout>;

export function cutEngineering33Terrain(positions:number[],indices:number[],q:Engineering33Layout){
  const inside=(poly:XZ[],x:number,z:number)=>{let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
  const surfaceAt=(x:number,z:number)=>{let h:number|undefined;for(const a of q.surfaces){const p=a.frame.local([x,z]);if(p.s>=a.s0-.001&&p.s<=a.s1+.001&&p.n>=a.n0-.001&&p.n<=a.n1+.001)h=physics561SurfaceHeight(a,p.s,p.n);}return h;};
  const polys=[q.main,q.wing,...q.polygons];
  const patch=cutTerrainPatch(positions,indices,0,{bounds:q.bounds,local:(x,z)=>({s:x,n:z}),lines:{s:[],n:[]},boundarySegments:polys.flatMap(p=>p.map((a,i)=>[a,p[(i+1)%p.length]])),apply:(x,z,y)=>{const h=surfaceAt(x,z);if(h!==undefined)return h-.24;if(inside(q.main,x,z))return Math.min(y,q.floor-.24);return y;}});
  return {...patch,surfaceAt,affects:(x:number,z:number)=>surfaceAt(x,z)!==undefined||inside(q.main,x,z)};
}
