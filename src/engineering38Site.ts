import {cutTerrainPatchSteps} from './terrainPatch';
import { humanities23Frame } from './humanities23Site';
import { physics561SurfaceHeight } from './physics561Site';
import type { Engineering30Surface } from './engineering30Site';

type XZ=[number,number];
export const ENGINEERING38_ID='way/93549089';

export function getEngineering38Layout(heightAt:(x:number,z:number)=>number,footprint:XZ[]){
  const axis=humanities23Frame(footprint[5],footprint[2]),width=axis.length;
  // 낮은 북서 현관의 짧은 계단을 기준으로 바닥을 정한다. 중앙 건물 패드의
  // 평균 높이를 쓰면 사진의 짧은 진입부가 급한 절벽으로 바뀐다.
  const floor=heightAt(...axis.point(19,7.05))+1.53,lower=floor-3.6;
  const surfaces:Engineering30Surface[]=[],routes:Record<string,[number,number,number][]>= {};
  const add=(name:string,s0:number,s1:number,n0:number,n1:number,y0:number,y1=y0,direction:'s'|'n'='s')=>{const a:Engineering30Surface={name,frame:axis,s0,s1,n0,n1,y0,y1,axis:direction};surfaces.push(a);return a;};
  const at=(s:number,n:number,y:number):[number,number,number]=>{const p=axis.point(s,n);return[p[0],y,p[1]];};
  const steps=(name:string,s0:number,s1:number,n0:number,n1:number,low:number,high:number,count:number,direction:'s'|'n'='n')=>{
    const result:[number,number,number][]=[];
    for(let i=0;i<count;i++){
      const a=add(name,direction==='s'?s0+(s1-s0)*i/count:s0,direction==='s'?s0+(s1-s0)*(i+1)/count:s1,direction==='n'?n0+(n1-n0)*i/count:n0,direction==='n'?n0+(n1-n0)*(i+1)/count:n1,low+(high-low)*(high>=low?i+1:i)/count);
      result.push(at((a.s0+a.s1)/2,(a.n0+a.n1)/2,a.y0));
    }return result;
  };
  // 북쪽 도로의 높이를 유지하며 기둥 아래의 수평 바닥으로 연결한다.
  const walkHeight=(s:number)=>heightAt(...axis.point(s,7.05))+.035;
  const knots=[-3,0,13,19,23,35.5,39.55,43.5,60.9,62.4,63.9,72.2,76];
  for(let i=0;i+1<knots.length;i++)add('north-road-sidewalk',knots[i],knots[i+1],6.35,7.75,walkHeight(knots[i]),walkHeight(knots[i+1]));
  add('north-piloti-paving',0,width,-5.2,1,floor);
  add('west-piloti-paving',0,5.2,-50.2,-5.2,floor);
  const entryLow=floor-1.08;
  const entrance=steps('northwest-entry-stair',13,23,1,4.5,floor,entryLow,9);
  add('northwest-entry-apron',13,23,4.5,6.35,entryLow,walkHeight(19),'n');
  const middleLow=walkHeight(39.55),middleCount=Math.max(3,Math.ceil((floor-middleLow)/.16));
  const middle=steps('mapped-north-central-stair',35.5,43.5,1,6.35,floor,middleLow,middleCount);
  add('mapped-northeast-approach',60.9,63.9,1,6.35,floor,walkHeight(62.4),'n');
  // 건축사 잡지의 남측 교수연구동 설명으로 도면 방위를 대응한다. 치수와 표고는 근사다.
  add('west-cafe-floor',5.2,24,-43,-5.2,floor);
  add('court-north-gallery',24,72.2,-11.8,-5.2,floor);
  add('court-west-gallery',24,28,-34,-16.5,floor);
  add('court-stair-west-gallery',24,27,-16.5,-11.8,floor);
  add('east-open-piloti',44,72.2,-50.2,-11.8,floor);
  add('south-open-piloti',5.2,44,-50.2,-34,floor);
  add('sunken-court-paving',28,44,-34,-17,lower);
  add('court-north-lip',37,44,-17,-11.8,floor);
  add('sunken-stair-turn',27,28,-16.5,-11.8,lower+1.8);
  add('sunken-stair-top-join',34,37,-14,-11.8,floor);
  add('sunken-stair-bottom-join',34,37,-17,-14.3,lower);
  add('sunken-stair-south-join',28,34,-17,-16.5,lower);
  const courtUpper=steps('sunken-upper-stair',28,34,-14,-11.8,lower+1.8,floor,12,'s');
  const courtLower=steps('sunken-lower-stair',28,34,-16.5,-14.3,lower+1.8,lower,12,'s');
  routes.northwestEntrance=[at(19,7,walkHeight(19)),at(19,6.35,walkHeight(19)),at(19,4.5,entryLow),...entrance.slice().reverse(),at(19,-4.5,floor)];
  routes.centralApproach=[at(39.55,7,walkHeight(39.55)),...middle.slice().reverse(),at(39.55,.5,floor),at(36,.5,floor),at(36,-4,floor)];
  routes.northeastApproach=[at(62.4,7,walkHeight(62.4)),at(62.4,6.35,walkHeight(62.4)),at(62.4,1,floor),at(59,.5,floor),at(59,-2.8,floor)];
  routes.northPiloti=[at(2.8,-2.8,floor),at(69,-2.8,floor)];
  routes.westPiloti=[at(2.1,-2.8,floor),at(2.1,-48,floor)];
  routes.northSidewalk=knots.slice(1,-1).map(s=>at(s,7.05,walkHeight(s)));
  routes.sunkenCourt=[at(36,-4,floor),at(36,-10.5,floor),at(35.5,-12.9,floor),...courtUpper.slice().reverse(),at(27.5,-12.9,lower+1.8),at(27.5,-15.4,lower+1.8),...courtLower,at(35.5,-15.4,lower),at(36,-20,lower),at(36,-32.5,lower)];
  routes.upperGallery=[at(47,-10.5,floor),at(47,-36,floor),at(26,-36,floor),at(26,-19,floor)];
  routes.eastOpenPiloti=[at(58,-4,floor),at(58,-45,floor)];
  routes.southOpenPiloti=[at(8,-47,floor),at(67,-47,floor)];
  const polygons=surfaces.map(a=>[axis.point(a.s0,a.n0),axis.point(a.s1,a.n0),axis.point(a.s1,a.n1),axis.point(a.s0,a.n1)]),points=polygons.flat();
  const bounds={minX:Math.min(...points.map(p=>p[0]))-.5,maxX:Math.max(...points.map(p=>p[0]))+.5,minZ:Math.min(...points.map(p=>p[1]))-.5,maxZ:Math.max(...points.map(p=>p[1]))+.5};
  return{axis,width,floor,lower,entryLow,surfaces,routes,polygons,bounds,entry:humanities23Frame(axis.point(24,-5.2),axis.point(14,-5.2))};
}
export type Engineering38Layout=ReturnType<typeof getEngineering38Layout>;

export function* cutEngineering38TerrainSteps(positions:number[],indices:number[],q:Engineering38Layout){
  const sample=(x:number,z:number,lowest=false)=>{const p=q.axis.local([x,z]);let h:number|undefined;for(const a of q.surfaces)if(p.s>=a.s0-.001&&p.s<=a.s1+.001&&p.n>=a.n0-.001&&p.n<=a.n1+.001){const y=physics561SurfaceHeight(a,p.s,p.n);h=lowest&&h!==undefined?Math.min(h,y):y;}return h;};
  const edges=new Map<string,{points:number[][];heights:number[]}>();
  q.polygons.forEach((polygon,index)=>polygon.forEach((a,i)=>{const b=polygon[(i+1)%polygon.length],key=[a,b].map(v=>v.map(n=>n.toFixed(5)).join(',')).sort().join('/'),p=q.axis.local([(a[0]+b[0])/2,(a[1]+b[1])/2]),height=physics561SurfaceHeight(q.surfaces[index],p.s,p.n),edge=edges.get(key);if(edge)edge.heights.push(height);else edges.set(key,{points:[a,b],heights:[height]});}));
  const boundarySegments=[...edges.values()].filter(e=>e.heights.length===1||Math.max(...e.heights)-Math.min(...e.heights)>.001).map(e=>e.points);
  const patch=(yield* cutTerrainPatchSteps(positions,indices,0,{bounds:q.bounds,local:(x,z)=>({s:x,n:z}),lines:{s:[],n:[]},boundarySegments,apply:(x,z,y)=>{const h=sample(x,z,true);return h===undefined?y:h-.42;}}));
  return{...patch,surfaceAt:(x:number,z:number)=>sample(x,z),affects:(x:number,z:number)=>sample(x,z)!==undefined};
}

export function cutEngineering38Terrain(...args:Parameters<typeof cutEngineering38TerrainSteps>){
  const steps=cutEngineering38TerrainSteps(...args);let result=steps.next();
  while(!result.done)result=steps.next();
  return result.value;
}
