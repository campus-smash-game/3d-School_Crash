import { humanities23Frame } from './humanities23Site';
import { cutTerrainPatch } from './terrainPatch';
import { physics561SurfaceHeight } from './physics561Site';
import type { Engineering30Surface } from './engineering30Site';
import type { Engineering3334Layout } from './engineering3334Site';
type XZ=[number,number];
export const ENGINEERING35_ACCESS_ID='access/engineering35-west';
export function getEngineering35AccessLayout(heightAt:(x:number,z:number)=>number,q90:Engineering3334Layout){
 const axis=q90.wall35,terraceFloor=q90.terraceFloor,labFloor=terraceFloor-5.5;
 const surfaces:Engineering30Surface[]=[],elevated:Engineering30Surface[]=[],routes:Record<string,[number,number,number][]>={};
 const add=(list:Engineering30Surface[],name:string,s0:number,s1:number,n0:number,n1:number,y0:number,y1=y0,direction:'s'|'n'='s',frame=axis)=>{const a:Engineering30Surface={name,frame,s0,s1,n0,n1,y0,y1,axis:direction};list.push(a);return a;};
 const at=(s:number,n:number,y:number):[number,number,number]=>{const p=axis.point(s,n);return[p[0],y,p[1]];};
 // 원본 도로 중심선의 교내 구간을 유지하고 실험실 앞 높이만 사진에 맞춰 근사한다.
 const roadPoints:XZ[]=[[299.72,-1153.62],[296.37,-1125.28],[292.46,-1103.7],[282.52,-1078.29],[279.82,-1072.28]],roadFloors=roadPoints.map((p,i)=>i===1||i===2?labFloor-.8:heightAt(...p)+.035);
 const roadSegments=roadPoints.slice(1).map((p,i)=>{const frame=humanities23Frame(roadPoints[i],p);add(surfaces,'west-living-street',0,frame.length,-2.9,2.9,roadFloors[i],roadFloors[i+1],'s',frame);return{frame,y0:roadFloors[i],y1:roadFloors[i+1]};});
 const roadAt=(s:number)=>{for(let i=0;i<roadPoints.length-1;i++){const a=axis.local(roadPoints[i]),b=axis.local(roadPoints[i+1]);if(s>=a.s&&s<=b.s){const t=(s-a.s)/(b.s-a.s);return{n:a.n+(b.n-a.n)*t,y:roadFloors[i]+(roadFloors[i+1]-roadFloors[i])*t};}}throw Error('35 west road sample outside modeled segment');};
 for(let s=0;s<70;s+=5)add(surfaces,'lab-lower-floor',s,s+5,.3,7.4,labFloor);
 for(const s of[14,54]){const road=roadAt(s),approach=humanities23Frame(axis.point(s,7.4),axis.point(s,road.n-2.5));for(let i=0;i<4;i++)add(surfaces,'lab-vehicle-apron',approach.length*i/4,approach.length*(i+1)/4,-3.2,3.2,labFloor+(road.y-labFloor)*i/4,labFloor+(road.y-labFloor)*(i+1)/4,'s',approach);routes['lab'+s+'Approach']=[at(s,road.n,road.y),at(s,7.4,labFloor),at(s,5.0,labFloor)];}
 const northHeight=heightAt(...axis.point(91.77,6.2))+.035;
 for(let i=0;i<8;i++)add(surfaces,'lab-north-sidewalk',70+21.77*i/8,70+21.77*(i+1)/8,4.5,7.4,labFloor+(northHeight-labFloor)*i/8,labFloor+(northHeight-labFloor)*(i+1)/8);
 const southRoad=roadAt(1),southApproach=humanities23Frame(axis.point(1,7.4),axis.point(1,southRoad.n-2.5));
 add(surfaces,'lab-south-road-link',0,southApproach.length,-1.4,1.4,labFloor,southRoad.y,'s',southApproach);
 routes.lowerFrontWalk=[at(1,southRoad.n,southRoad.y),at(1,6.2,labFloor),at(69,6.2,labFloor),at(91.4,6.2,labFloor+(northHeight-labFloor)*21.4/21.77)];
 routes.roadBelowBridge=roadPoints.map((p,i)=>[p[0],roadFloors[i],p[1]]);
 const stair=humanities23Frame([279.82,-1072.28],[288.01,-1051.02]),stairBottom=roadFloors[4],stairTop=terraceFloor,steps=Math.ceil((stairTop-stairBottom)/.17),stairRoute:[number,number,number][]=[];
 const fp=(frame:typeof axis,s:number,n:number,y:number):[number,number,number]=>{const p=frame.point(s,n);return[p[0],y,p[1]];};
 add(surfaces,'north-stair-bottom',-1,0,-1.3,1.3,stairBottom,stairBottom,'s',stair);
 for(let i=0;i<steps;i++){const a=add(surfaces,'north-map-stair',stair.length*i/steps,stair.length*(i+1)/steps,-1.1,1.1,stairBottom+(stairTop-stairBottom)*(i+1)/steps,undefined,'s',stair);stairRoute.push(fp(stair,(a.s0+a.s1)/2,0,a.y0));}
 add(surfaces,'north-stair-top',stair.length,stair.length+1.5,-1.3,1.3,stairTop,stairTop,'s',stair);
 const stairEnd=axis.local(stair.point(stair.length,0));
 const crosswalk={s0:stairEnd.s+.6,s1:stairEnd.s+2.8};
 add(elevated,'north-terrace-crosswalk',crosswalk.s0,crosswalk.s1,2.5,stairEnd.n+.3,terraceFloor);
 for(const [s0,s1,n0,n1]of[[0,q90.terraceStart-1.8,0,4.4],[q90.terraceStart-1.8,51.7,0,.12],[51.7,58.3,1.9,4.4],[58.3,96,0,4.4]])add(elevated,'west-terrace-extension',s0,s1,n0,n1,terraceFloor);
 routes.northStairToEntry=[fp(stair,-.6,0,stairBottom),...stairRoute,fp(stair,stair.length+1.2,0,stairTop),at(stairEnd.s+1.6,2.8,terraceFloor),at(55,2.8,terraceFloor),at(55,1.2,terraceFloor)];
 routes.terraceAlongFacade=[at(2,2.8,terraceFloor),at(55,2.8,terraceFloor),at(95,2.8,terraceFloor)];
 // 34동에서 이어지는 하부 진입로도 새 도로 높이에 맞춘다.
 const oldRoad=q90.surfaces.filter(a=>a.name==='north-court-east-road'),oldEnd=oldRoad.at(-1)!,endPoint=q90.axis.point(oldEnd.s1,70.5),roadLocal=axis.local(endPoint),road=roadAt(roadLocal.s),rampStart=49;
 const rampEnd=oldEnd.s1-6,driveHeight=(s:number)=>q90.entryFloor+(road.y-q90.entryFloor)*Math.max(0,Math.min(1,(s-rampStart)/(rampEnd-rampStart)));
 for(const a of oldRoad){a.y0=driveHeight(a.s0);a.y1=driveHeight(a.s1);}
 for(const p of q90.routes.underNorthLinks){const local=q90.axis.local([p[0],p[2]]);if(local.s>=rampStart)p[1]=driveHeight(local.s);}
 const terrainSurfaces=[...surfaces,...oldRoad];
 // 포장 사이 흙도 함께 낮춰 오래된 건물 기단 높이가 섬처럼 남지 않게 한다.
 const gradingPolygon=[axis.point(-5,-1),axis.point(96,-1),axis.point(96,31),axis.point(-5,31)];
 const grade=(x:number,z:number,y:number)=>{
  const p=axis.local([x,z]),clamp=(v:number)=>Math.max(0,Math.min(1,v));
  if(p.s<-5||p.s>96||p.n<-1||p.n>31)return y;
  const s=Math.max(0,Math.min(91.77,p.s)),floor=s<=70?labFloor:labFloor+(northHeight-labFloor)*(s-70)/21.77;
  let target=floor-.24;
  if(s<=70){const r=roadAt(s);if(p.n>7.4)target=labFloor-.24+(r.y-labFloor)*clamp((p.n-7.4)/(r.n-2.9-7.4));if(p.n>r.n+2.9)target+=(y-target)*clamp((p.n-r.n-2.9)/4.6);}
  else if(p.n>7.4)target+=(y-target)*clamp((p.n-7.4)/8);
  const blend=clamp((p.s+5)/5)*clamp((96-p.s)/(96-91.77))*clamp((p.n+1)/1.3);
  return Math.min(y,y+(target-y)*blend);
 };
 const polygons=terrainSurfaces.map(a=>[a.frame.point(a.s0,a.n0),a.frame.point(a.s1,a.n0),a.frame.point(a.s1,a.n1),a.frame.point(a.s0,a.n1)]),points=[...polygons.flat(),...gradingPolygon];
 const bounds={minX:Math.min(...points.map(p=>p[0]))-.5,maxX:Math.max(...points.map(p=>p[0]))+.5,minZ:Math.min(...points.map(p=>p[1]))-.5,maxZ:Math.max(...points.map(p=>p[1]))+.5};
 return{axis,terraceFloor,labFloor,surfaces,elevated,terrainSurfaces,polygons,gradingPolygon,grade,bounds,routes,roadPoints,roadFloors,roadSegments,roadAt,stair,stairBottom,stairTop,steps,stairEnd,crosswalk,garages:[14,54],q90};
}
export type Engineering35AccessLayout=ReturnType<typeof getEngineering35AccessLayout>;
export function cutEngineering35AccessTerrain(positions:number[],indices:number[],q:Engineering35AccessLayout){
 const sample=(x:number,z:number,lowest=false)=>{let h:number|undefined;for(const a of q.terrainSurfaces){const p=a.frame.local([x,z]);if(p.s>=a.s0-.001&&p.s<=a.s1+.001&&p.n>=a.n0-.001&&p.n<=a.n1+.001){const y=physics561SurfaceHeight(a,p.s,p.n);h=lowest&&h!==undefined?Math.min(h,y):y;}}return h;};
 const edges=new Map<string,{points:XZ[];heights:number[]}>();
 q.polygons.forEach((p,index)=>p.forEach((a,i)=>{const b=p[(i+1)%p.length],key=[a,b].map(v=>v.map(n=>n.toFixed(5)).join(',')).sort().join('/'),local=q.terrainSurfaces[index].frame.local([(a[0]+b[0])/2,(a[1]+b[1])/2]),h=physics561SurfaceHeight(q.terrainSurfaces[index],local.s,local.n),edge=edges.get(key);if(edge)edge.heights.push(h);else edges.set(key,{points:[a,b],heights:[h]});}));
 const boundaries=[...edges.values()].filter(e=>e.heights.length===1||Math.max(...e.heights)-Math.min(...e.heights)>.001).map(e=>e.points);
 boundaries.push(...q.gradingPolygon.map((a,i)=>[a,q.gradingPolygon[(i+1)%4]]));
 const patch=cutTerrainPatch(positions,indices,0,{bounds:q.bounds,local:(x,z)=>q.axis.local([x,z]),lines:{s:[0,70,91.77],n:[.3,7.4]},boundarySegments:boundaries,apply:(x,z,y)=>{const h=sample(x,z,true);return h===undefined?q.grade(x,z,y):h-.24;}});
 return{...patch,surfaceAt:(x:number,z:number)=>sample(x,z),affects:(x:number,z:number)=>sample(x,z)!==undefined};
}
