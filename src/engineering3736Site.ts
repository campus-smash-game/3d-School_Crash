import { humanities23Frame } from './humanities23Site';
import { cutTerrainPatch } from './terrainPatch';
import { physics561SurfaceHeight } from './physics561Site';
import type { Engineering30Surface } from './engineering30Site';
import type { Engineering36Layout } from './engineering36Site';
import type { Engineering37Layout } from './engineering37Site';

type XZ = [number, number];
export const ENGINEERING3736_ID = 'access/engineering37-36';

export function getEngineering3736Layout(heightAt: (x: number, z: number) => number, q36: Engineering36Layout, q37: Engineering37Layout) {
  const axis = q36.axis, entryFloor = q36.floors[1], courtFloor = entryFloor - .72, northFloor = q37.deck + 1.2;
  // 항공사진의 낮은 녹색 지붕을 탑 동쪽의 별도 부속부로 대응한다. 좌표와 표고는 근사다.
  const roofPolygon: XZ[] = [[-11.9,-16.4],[-5.9,-16.4],[-5.9,-19],[-11.9,-25]];
  const front = humanities23Frame(axis.point(-11.9,-25), axis.point(-5.9,-19));
  const surfaces: Engineering30Surface[] = [], routes: Record<string, [number, number, number][]> = {};
  const add = (name: string, s0: number, s1: number, n0: number, n1: number, y0: number, y1=y0, direction:'s'|'n'='s', frame=axis) => {
    const a: Engineering30Surface = {name, frame, s0, s1, n0, n1, y0, y1, axis: direction}; surfaces.push(a); return a;
  };
  const at = (frame:typeof axis,s:number,n:number,y:number):[number,number,number] => {const p=frame.point(s,n);return [p[0],y,p[1]];};
  const p = (s:number,n:number,y:number) => at(axis,s,n,y);
  add('lower-parking-court',-14,-.2,-32,-21,courtFloor);
  const westRoad = heightAt(...axis.point(-20,-30))+.035, eastRoad=heightAt(...axis.point(4,-30))+.035;
  add('west-court-road-join',-20,-14,-32,-28.5,westRoad,courtFloor);
  add('east-court-road-join',-.2,4,-32,-28.5,courtFloor,eastRoad);
  const southRoad=heightAt(...axis.point(-4.85,-41.6))+.035;
  add('south-footway-approach',-6.5,-3.2,-41.6,-32,southRoad,courtFloor,'n');
  add('entry-lower-landing',.4,front.length-1.5,-4.5,-3.4,courtFloor,courtFloor,'s',front);
  const entrySteps: [number,number,number][]=[];
  for(let i=0;i<5;i++){
    const a=add('entry-front-stair',.4,front.length-1.5,-3.4+1.9*i/5,-3.4+1.9*(i+1)/5,courtFloor+.72*(i+1)/5,undefined,'n',front);
    entrySteps.push(at(front,front.length/2,(a.n0+a.n1)/2,a.y0));
  }
  add('entry-front-landing',.15,front.length-.15,-1.5,.2,entryFloor,entryFloor,'s',front);
  add('entry-shallow-floor',.15,front.length-.15,.2,1.6,entryFloor,entryFloor,'s',front);
  add('entry-side-landing',front.length-.3,front.length+1,-1.3,-.1,entryFloor,entryFloor,'s',front);
  add('red-side-landing',-5.9,-.1,-19,-16.5,entryFloor);
  add('right-access-ramp',-3.7,-2.1,-26.5,-17.8,courtFloor,entryFloor,'n');
  const rightSteps:[number,number,number][]=[];
  for(let i=0;i<4;i++){
    const a=add('right-short-stair',-1.7,-.1,-25.3+1.6*i/4,-25.3+1.6*(i+1)/4,courtFloor+.72*(i+1)/4,undefined,'n');
    rightSteps.push(p(-.9,(a.n0+a.n1)/2,a.y0));
  }
  add('right-stair-upper-walk',-1.7,-.1,-23.7,-17.8,entryFloor);
  add('under-bridge-upper-walk',-3.9,-.1,-17.8,-14,entryFloor);
  for(let n=-14;n<3;n+=3){const end=Math.min(3,n+3);add('north-sloping-walk',-3.9,-.1,n,end,entryFloor+(northFloor-entryFloor)*(n+14)/17,entryFloor+(northFloor-entryFloor)*(end+14)/17,'n');}
  add('north-wall-walk-join',-.1,1.2,.4,3,northFloor);

  // 기존 직선 접근로는 새 현관을 가로질렀으므로 지도의 남북 보행선 안에서 우회한다.
  const oldApproach=q37.surfaces.filter(a=>a.name==='south-deck-approach');
  q37.surfaces.splice(0,q37.surfaces.length,...q37.surfaces.filter(a=>a.name!=='south-deck-approach'));
  const plazaStart=q37.axis.point(46,q37.width+5),plazaJoin=humanities23Frame(plazaStart,axis.point(-2.3,3));
  add('plaza-join-start',0,1.2,-1.2,1.2,q37.deck,q37.deck,'s',plazaJoin);
  add('plaza-to-underpass',1.2,plazaJoin.length,-1.2,1.2,q37.deck,northFloor,'s',plazaJoin);
  const frontOutside=at(front,front.length/2,-4,courtFloor),underNorth=p(-2.3,2,northFloor+(entryFloor-northFloor)/17);
  routes.frontEntrance=[p(-6,-29,courtFloor),frontOutside,...entrySteps,at(front,front.length/2,-.4,entryFloor)];
  routes.accessRamp=[p(-2.9,-28,courtFloor),p(-2.9,-26.5,courtFloor),p(-2.9,-18.1,entryFloor-.72*.3/8.7),p(-2.9,-17,entryFloor)];
  routes.shortStair=[p(-.9,-27,courtFloor),p(-.9,-25.5,courtFloor),...rightSteps,p(-.9,-19,entryFloor),p(-.9,-17,entryFloor),p(-2.9,-17,entryFloor)];
  routes.underBridge=[p(-2.3,-17,entryFloor),p(-2.3,-14,entryFloor),underNorth,p(1,1.8,northFloor)];
  routes.plazaToUnderpass=[at(plazaJoin,0,0,q37.deck),at(plazaJoin,1.2,0,q37.deck),at(plazaJoin,plazaJoin.length,0,northFloor),p(-2.3,-14,entryFloor),p(-2.9,-17,entryFloor)];
  routes.entryToUnderpass=[at(front,front.length/2,-.4,entryFloor),at(front,front.length+.7,-.5,entryFloor),p(-5,-17,entryFloor),p(-2.9,-17,entryFloor)];
  routes.southRoadToCourt=[p(-4.85,-41.4,southRoad+(courtFloor-southRoad)*.2/9.6),p(-4.85,-32,courtFloor),p(-4.85,-28,courtFloor)];
  routes.westEastCourt=[p(-19.8,-30,westRoad+(courtFloor-westRoad)*.2/6),p(-14,-30,courtFloor),p(-.2,-30,courtFloor),p(3.8,-30,courtFloor+(eastRoad-courtFloor)*4/4.2)];
  q37.routes.deckWestEdge.splice(-2,2,at(q37.axis,46,q37.width+5,q37.deck),...routes.plazaToUnderpass.slice(1),...routes.accessRamp.slice().reverse().slice(1));
  const polygons=surfaces.map(a=>[a.frame.point(a.s0,a.n0),a.frame.point(a.s1,a.n0),a.frame.point(a.s1,a.n1),a.frame.point(a.s0,a.n1)]);
  const oldPolygons=oldApproach.map(a=>[a.frame.point(a.s0,a.n0),a.frame.point(a.s1,a.n0),a.frame.point(a.s1,a.n1),a.frame.point(a.s0,a.n1)]);
  const points=[...polygons.flat(),...oldPolygons.flat()];
  const bounds={minX:Math.min(...points.map(p=>p[0]))-.5,maxX:Math.max(...points.map(p=>p[0]))+.5,minZ:Math.min(...points.map(p=>p[1]))-.5,maxZ:Math.max(...points.map(p=>p[1]))+.5};
  return {axis,front,roofPolygon,entryFloor,courtFloor,northFloor,surfaces,routes,polygons,oldPolygons,bounds,q36,q37};
}
export type Engineering3736Layout=ReturnType<typeof getEngineering3736Layout>;

export function cutEngineering3736Terrain(positions:number[],indices:number[],q:Engineering3736Layout){
  const sample=(x:number,z:number,lowest=false)=>{let h:number|undefined;for(const a of q.surfaces){const p=a.frame.local([x,z]);if(p.s>=a.s0-.001&&p.s<=a.s1+.001&&p.n>=a.n0-.001&&p.n<=a.n1+.001){const y=physics561SurfaceHeight(a,p.s,p.n);h=lowest&&h!==undefined?Math.min(h,y):y;}}return h;};
  // 같은 경사면의 내부 이음선은 다시 자르지 않아 짧은 중복 변을 줄인다.
  const edges=new Map<string,{points:number[][];heights:number[]}>();
  q.polygons.forEach((polygon,index)=>polygon.forEach((a,i)=>{
    const b=polygon[(i+1)%polygon.length],key=[a,b].map(v=>v.map(n=>n.toFixed(5)).join(',')).sort().join('/');
    const local=q.surfaces[index].frame.local([(a[0]+b[0])/2,(a[1]+b[1])/2]),height=physics561SurfaceHeight(q.surfaces[index],local.s,local.n),edge=edges.get(key);
    if(edge)edge.heights.push(height);else edges.set(key,{points:[a,b],heights:[height]});
  }));
  const boundarySegments=[...edges.values()].filter(e=>e.heights.length===1||Math.max(...e.heights)-Math.min(...e.heights)>.001).map(e=>e.points);
  const patch=cutTerrainPatch(positions,indices,0,{bounds:q.bounds,local:(x,z)=>({s:x,n:z}),lines:{s:[],n:[]},boundarySegments,apply:(x,z,y)=>{const h=sample(x,z,true);return h===undefined?y:h-.24;}});
  return {...patch,surfaceAt:(x:number,z:number)=>sample(x,z),affects:(x:number,z:number)=>sample(x,z)!==undefined};
}
