import {cutTerrainPatchSteps} from './terrainPatch';
import { humanities23Frame } from './humanities23Site';
import { physics561SurfaceHeight } from './physics561Site';
import type { Engineering30Surface } from './engineering30Site';

type XZ=[number,number];
export const ENGINEERING39_ID='way/179742154';

export function getEngineering39Layout(heightAt:(x:number,z:number)=>number,footprint:XZ[]){
 const axis=humanities23Frame(footprint[0],footprint[28]);
 // 북쪽 B1 필로티, 상부 네 창줄과 중정의 단차를 구분한다. 높이는 사진과 기존 지형을 맞춘 근사다.
 const lower=heightAt(...axis.point(0,4))+.2,upper=lower+3.5,second=upper,third=upper+1;
 const researchFloor=lower+8.2,roof=researchFloor+14;
 const surfaces:Engineering30Surface[]=[],routes:Record<string,[number,number,number][]>= {};
 const add=(name:string,s0:number,s1:number,n0:number,n1:number,y0:number,y1=y0,direction:'s'|'n'='s')=>{const a:Engineering30Surface={name,frame:axis,s0,s1,n0,n1,y0,y1,axis:direction};surfaces.push(a);return a;};
 const at=(s:number,n:number,y:number):[number,number,number]=>{const p=axis.point(s,n);return[p[0],y,p[1]];};
 const steps=(name:string,s0:number,s1:number,n0:number,n1:number,y0:number,y1:number,direction:'s'|'n',count:number)=>{
  const points:[number,number,number][]=[];
  for(let i=0;i<count;i++){const t=i/count,u=(i+1)/count,a=add(name,direction==='s'?s0+(s1-s0)*t:s0,direction==='s'?s0+(s1-s0)*u:s1,direction==='n'?n0+(n1-n0)*t:n0,direction==='n'?n0+(n1-n0)*u:n1,y0+(y1-y0)*(y1>y0?u:t));points.push(at((a.s0+a.s1)/2,(a.n0+a.n1)/2,a.y0));}return points;
 };
 add('north-piloti-paving',0,57,-9,1.4,lower);
 add('entry-shallow-floor',33.55,46.55,-10.2,-8.6,lower);
 // 36동 쪽 연결로 끝은 그대로 두고 북쪽 도로의 가장자리까지만 연결한다.
 for(let s=0;s<56;s+=7){const end=s+7,h=heightAt(...axis.point((s+end)/2,6));add('north-road-join',s,end,2.6,6,lower-.36,h,'n');}
 const northSteps=steps('north-low-stair',6,50,1.4,2.6,lower,lower-.36,'n',3);
 const westLow=lower-1.44,westRoad=heightAt(...axis.point(-11,-3))+.03;
 add('west-piloti-road-landing',-7.5,-4.5,-8,1.4,westLow);
 const westSteps=steps('west-wide-stair',-4.5,0,-8,1.4,westLow,lower,'s',9);
 add('west-road-join',-11,-7.5,-8,1.4,westRoad,westLow);
 add('west-north-road-join',-7.5,-4.5,1.4,5,westLow,heightAt(...axis.point(-6,5))+.03,'n');
 add('west-south-road-join',-7.5,-4.5,-18,-8,heightAt(...axis.point(-6,-18))+.03,westLow,'n');
 add('northeast-road-apron',57,64,-3,1.4,lower,heightAt(...axis.point(64,-1))+.03);
 // 낮은 현관 앞 바닥은 안쪽 큰 계단까지 이어진다. OSM 첫 내부 계단을 같은 계단 후보로 대응한다.
 add('first-lower-court',12.5,36,-24,-9,lower);
 const mainSteps=steps('north-inner-stair',16.5,29.5,-33,-24,upper,lower,'n',20);
 add('main-stair-upper-landing',16.5,36,-35,-33,upper);
 // 사진의 현관 위 난간 바닥과 별도 계단을 연결한다. 뒤쪽 회랑의 연결 길이는 게임용 근사다.
 add('entry-upper-gallery',31.5,55,-12,-9,upper);
 add('upper-gallery-return',31.5,36,-35,-12,upper);
 add('entry-east-lower-apron',47,55,-10,-8,lower);
 const sideLower=steps('entry-side-lower-stair',48,50.5,-16,-10,lower+1.75,lower,'n',10);
 add('entry-side-turn-landing',48,54.3,-18,-16,lower+1.75);
 const sideUpper=steps('entry-side-upper-stair',51.8,54.3,-16,-12,lower+1.75,upper,'n',10);
 add('middle-court',12.5,36,-55,-35,second);
 const secondSteps=steps('second-underpass-stair',15.8,18.8,-65,-55,third,second,'n',8);
 add('second-stair-upper-join',15.8,18.8,-68,-65,third);
 add('south-court',12.5,36,-84,-68,third);
 // 지도에 표시된 동쪽 계단의 중심선을 따른다. 폭과 단수는 사진 비례로 정한다.
 for(const [index,n,high]of[[0,-18.7,upper],[1,-46.3,second],[2,-74.9,third]]){
  const low=heightAt(...axis.point(64,n))+.04,start=index===0?51: index===1?50.7:53.7,end=60;
  add('east-court-road-join',end,64,n-1.3,n+1.3,low);
  const stair=steps('east-court-stair-'+index,start,end,n-1.3,n+1.3,high,low,'s',Math.max(4,Math.ceil(Math.abs(high-low)/.18)));
  add('east-court-passage',34,start,n-1.3,n+1.3,high);
  routes['eastCourt'+index]=[at(63.7,n,low),...stair.reverse(),at(34.5,n,high),at(index===0?34:28,n,high)];
 }
 routes.northEntrance=[at(28,5.5,lower-.36+(heightAt(...axis.point(24.5,6))-(lower-.36))*2.9/3.4),...northSteps.reverse().map(p=>{const l=axis.local([p[0],p[2]]);return at(28,l.n,p[1]);}),at(28,-.4,lower),at(23,-.4,lower),at(23,-22,lower),...mainSteps.slice().reverse(),at(23,-34,upper)];
 routes.westPiloti=[at(-10.8,-3,westRoad+(westLow-westRoad)*.2/3.5),at(-6,-3,westLow),...westSteps.map(p=>{const l=axis.local([p[0],p[2]]);return at(l.s,-3,p[1]);}),at(8,-3,lower)];
 routes.pilotiCrossing=[at(2,-.4,lower),at(50,-.4,lower)];
 routes.firstCourt=[at(23,-12,lower),at(23,-22,lower),...mainSteps.slice().reverse(),at(23,-34,upper),at(23,-40,second)];
 routes.entrySideStair=[at(49.25,-9,lower),...sideLower.reverse(),at(49.25,-17,lower+1.75),at(53.05,-17,lower+1.75),...sideUpper,at(53.05,-10.5,upper),at(34,-10.5,upper)];
 routes.upperGallery=[at(34,-10.5,upper),at(32.8,-10.5,upper),at(32.8,-18.7,upper),at(32.8,-34,upper),at(23,-34,upper)];
 routes.galleryUnderpass=[at(34,-22,lower),at(34,-14,lower),at(23,-14,lower)];
 routes.middleCourt=[at(23,-40,second),at(17.3,-45,second),at(17.3,-54,second),...secondSteps.reverse(),at(17.3,-72,third)];
 routes.southCourt=[at(17.3,-72,third),at(25.5,-74.9,third),at(25.5,-82,third)];
 const bars=[{s0:0,s1:56.55,n0:-9.2,n1:0},{s0:0,s1:57.77,n0:-42.3,n1:-30},{s0:0,s1:56.62,n0:-72.23,n1:-55},{s0:0,s1:57.22,n0:-94.64,n1:-84}];
 const eastWings=[{n0:-15.475,n1:0,s1:56.55},{n0:-40.34,n1:-21.94,s1:57.77},{n0:-70.37,n1:-51.75,s1:56.62},{n0:-94.64,n1:-78.26,s1:57.22}];
 const polygons=surfaces.map(a=>[axis.point(a.s0,a.n0),axis.point(a.s1,a.n0),axis.point(a.s1,a.n1),axis.point(a.s0,a.n1)]);
 const points=[...polygons.flat(),...footprint];
 const bounds={minX:Math.min(...points.map(p=>p[0]))-.5,maxX:Math.max(...points.map(p=>p[0]))+.5,minZ:Math.min(...points.map(p=>p[1]))-.5,maxZ:Math.max(...points.map(p=>p[1]))+.5};
 return{axis,lower,upper,second,third,researchFloor,roof,bars,eastWings,surfaces,routes,polygons,bounds};
}
export type Engineering39Layout=ReturnType<typeof getEngineering39Layout>;

export function* cutEngineering39TerrainSteps(positions:number[],indices:number[],q:Engineering39Layout){
 const sample=(x:number,z:number,lowest=false)=>{const p=q.axis.local([x,z]);let h:number|undefined;for(const a of q.surfaces)if(p.s>=a.s0-.001&&p.s<=a.s1+.001&&p.n>=a.n0-.001&&p.n<=a.n1+.001){const y=physics561SurfaceHeight(a,p.s,p.n);h=lowest&&h!==undefined?Math.min(h,y):y;}return h;};
 const edges=new Map<string,{points:number[][];heights:number[]}>();
 q.polygons.forEach((polygon,index)=>polygon.forEach((a,i)=>{const b=polygon[(i+1)%polygon.length],key=[a,b].map(v=>v.map(n=>n.toFixed(5)).join(',')).sort().join('/'),p=q.axis.local([(a[0]+b[0])/2,(a[1]+b[1])/2]),height=physics561SurfaceHeight(q.surfaces[index],p.s,p.n),edge=edges.get(key);if(edge)edge.heights.push(height);else edges.set(key,{points:[a,b],heights:[height]});}));
 const boundarySegments=[...edges.values()].filter(e=>e.heights.length===1||Math.max(...e.heights)-Math.min(...e.heights)>.001).map(e=>e.points);
 const patch=(yield* cutTerrainPatchSteps(positions,indices,0,{bounds:q.bounds,local:(x,z)=>({s:x,n:z}),lines:{s:[],n:[]},boundarySegments,apply:(x,z,y)=>{const h=sample(x,z,true);return h===undefined?y:h-.24;}}));
 return{...patch,surfaceAt:(x:number,z:number)=>sample(x,z),affects:(x:number,z:number)=>sample(x,z)!==undefined};
}

export function cutEngineering39Terrain(...args:Parameters<typeof cutEngineering39TerrainSteps>){
  const steps=cutEngineering39TerrainSteps(...args);let result=steps.next();
  while(!result.done)result=steps.next();
  return result.value;
}
