import { humanities23Frame } from './humanities23Site';
import { cutTerrainPatch } from './terrainPatch';
import { physics561SurfaceHeight, type Physics561Surface } from './physics561Site';
import { getEngineering3130ConnectionLayout } from './engineering3130Connection';
import type { Engineering30DiningLayout } from './engineering30DiningSite';

export const ENGINEERING30_ID = 'way/389628347';
type XZ = [number, number];
type Frame = ReturnType<typeof humanities23Frame>;
export type Engineering30Surface = Physics561Surface & { frame: Frame };

export function getEngineering30Layout(heightAt: (x: number, z: number) => number, footprint: XZ[], dining?: Engineering30DiningLayout) {
  const outline = footprint.slice(0, -1), floor = dining?.floor ?? heightAt(222.75, -1095.86) + .42;
  const court = floor - .42, roof = floor + 17.5;
  const connector = getEngineering3130ConnectionLayout(heightAt, floor);
  const north = humanities23Frame(connector.point(0, 3), connector.point(connector.length, 3));
  const south = humanities23Frame(outline[0], outline[2]), southDoor = south.local(outline[1]).s;
  const west = humanities23Frame(outline[4], outline[5]), westDoor = west.length - 1.8;
  // 계단실 돌출부의 존재는 항공사진과 거리뷰에서 확인했다. 지상 윤곽은 사진 비례에 맞춘 근사다.
  const tower: XZ[] = [[203.19,-1029.83],[216.3,-1028.43],[216.3,-1019.6],[212.6,-1017.5],[204.1,-1017.4]];
  const surfaces: Engineering30Surface[] = [], routes: Record<string, [number, number, number][]> = {};
  const at = (f: Frame, s: number, n: number, y: number): [number, number, number] => { const p=f.point(s,n); return [p[0],y,p[1]]; };
  const add = (name: string, frame: Frame, s0: number, s1: number, n0: number, n1: number, y0: number, y1=y0, axis:'s'|'n'='s') => { const a={name,frame,s0,s1,n0,n1,y0,y1,axis};surfaces.push(a);return a; };
  // 북쪽 현관과 큰 계단 사이의 마당을 평탄하게 한다. 절대 높이는 게임 지형에 맞춘다.
  for(let s=0;s<26;s+=4) add('north-court-paving',north,s,Math.min(s+4,26),.02,13.7,court);
  const stair=humanities23Frame([187.69,-1004.27],[186.84,-1013.48]), half=8.5;
  const bottom=heightAt(...stair.point(-.15,0))+.04;
  const count=Math.max(16,Math.ceil((court-bottom)/.16)), flightLength=stair.length-3.0;
  const steps:[number,number,number][]=[];
  // 큰 계단의 정확한 폭과 단 수는 실측하지 않았다. 원본 지도 계단 중심선을 유지한다.
  for(let i=0;i<count;i++){
    const s0=flightLength*i/count,s1=flightLength*(i+1)/count,y=bottom+(court-bottom)*(i+1)/count;
    add('north-broad-stair',stair,s0,s1,-half,half,y);steps.push(at(stair,(s0+s1)/2,0,y));
  }
  add('north-stair-top-landing',stair,flightLength,stair.length+.1,-half,half,court);
  for(let n=-half;n<half;n+=1){const a=heightAt(...stair.point(-2,n))+.035,b=heightAt(...stair.point(-2,n+1))+.035;add('north-stair-approach',stair,-2,0,n,n+1,(a+b)/2,bottom);}
  // 현관은 세 단을 올라 진입한다. 문 오른쪽 짧은 경사로도 같은 바닥에 연결한다.
  const entry=8, entryHalf=3;
  for(let i=0;i<3;i++){const n0=1.8-1.5*(i+1)/3,n1=1.8-1.5*i/3;add('connector-entry-stair',north,entry-entryHalf,entry+entryHalf,n0,n1,court+.42*(i+1)/3);}
  add('connector-entry-landing',north,entry-entryHalf,entry+entryHalf,-.3,.3,floor);
  add('connector-access-ramp',north,entry-entryHalf-4,entry-entryHalf,-.1,1.6,court,floor);
  const crossing=connector.crossing;
  add('connector-open-bay-approach',north,crossing-2.3,crossing+2.3,-.3,2.0,floor,court,'n');
  routes.northEntry=[at(stair,-1.9,0,heightAt(...stair.point(-1.9,0))+.04),...steps,at(north,entry,4,court),at(north,entry,1.55,court+.14),at(north,entry,1.05,court+.28),at(north,entry,.55,floor),at(north,entry,-1.5,floor)];
  routes.accessRamp=[at(north,entry-entryHalf-4.1,.8,court),at(north,entry-entryHalf+.05,.8,floor),at(north,entry,.1,floor),at(north,entry,-1.5,floor)];
  routes.connector=Array.from({length:9},(_,i)=>{const u=1+(connector.length-2)*i/8,p=connector.point(u,0);return [p[0],floor,p[1]] as [number,number,number];});
  const southBottom=heightAt(...north.point(crossing,-13))+.04,southCount=Math.max(4,Math.ceil((floor-southBottom)/.16)),southSteps:[number,number,number][]=[];
  for(let i=0;i<southCount;i++){const n1=-6-7*i/southCount,n0=-6-7*(i+1)/southCount,y=floor+(southBottom-floor)*(i+1)/southCount;add('south-court-stair',north,crossing-2.3,crossing+2.3,n0,n1,y);southSteps.push(at(north,crossing,(n0+n1)/2,y));}
  routes.openBay=[at(north,crossing,3,court),at(north,crossing,-1.5,floor),...southSteps,at(north,crossing,-13.1,southBottom)];
  // 사진 속 차가 서 있는 마당의 진입로를 원본 서비스 도로 중심선에 맞춘다.
  const approach=humanities23Frame([142.05,-1004.81],[175.22,-1010.63]), low=heightAt(...approach.point(0,0))+.035;
  for(let i=0;i<8;i++)add('service-court-ramp',approach,approach.length*i/8,approach.length*(i+1)/8,-2.75,2.75,low+(court-low)*i/8,low+(court-low)*(i+1)/8);
  const join=humanities23Frame([175.22,-1010.63],[186.84,-1013.48]);
  add('service-court-landing',join,0,join.length,-2.75,2.75,court);
  const serviceCutout=[approach.point(-.1,-2.76),approach.point(approach.length+.1,-2.76),approach.point(approach.length+.1,2.76),approach.point(-.1,2.76)];
  const serviceEnd=north.local([192.63,-1026.94]),serviceEndY=floor+(court-floor)*(serviceEnd.n+.3)/2.3;
  routes.serviceApproach=[at(approach,.1,0,low),at(approach,approach.length,0,court),[186.84,court,-1013.48],[192.4,court,-1017],[192.63,serviceEndY,-1026.94]];
  // 30동 남쪽 출입구는 OSM 출입구 좌표를 사용한다. 문틀과 디딤판 치수는 근사다.
  for(const[name,f,door]of[['south',south,southDoor],['west',west,westDoor]] as [string,Frame,number][]){
    const low=heightAt(...f.point(door,-4))+.04;
    add(name+'-entry-landing',f,door-1.5,door+1.5,-.8,.8,floor);
    add(name+'-entry-ramp',f,door-1.5,door+1.5,-4,-.8,low,floor,'n');
    routes[name+'Entry']=[at(f,door,-3.9,low+(floor-low)*.1/3.2),at(f,door,-.4,floor),at(f,door,2,floor)];
  }
  if(dining){
    const bridge=dining.surfaces.find(a=>a.name==='west-entry-bridge')!;bridge.y0=court;bridge.n0=-3.8;
    dining.routes.westEntry[0]=at(dining.west,dining.westDoor,-3.7,court+(floor-court)*.1/3.2);
  }
  const points=[...outline,...tower,...surfaces.flatMap(a=>[a.frame.point(a.s0,a.n0),a.frame.point(a.s1,a.n0),a.frame.point(a.s1,a.n1),a.frame.point(a.s0,a.n1)])];
  const bounds={minX:Math.min(...points.map(p=>p[0]))-1,maxX:Math.max(...points.map(p=>p[0]))+1,minZ:Math.min(...points.map(p=>p[1]))-1,maxZ:Math.max(...points.map(p=>p[1]))+1};
  return {outline,tower,floor,court,roof,connector,north,south,southDoor,west,westDoor,stair,stairCount:count,stairBottom:bottom,entry,surfaces,serviceCutout,routes,bounds};
}
export type Engineering30Layout=ReturnType<typeof getEngineering30Layout>;

export function engineering30ClipPolygon(poly:XZ[],mask:XZ[],keepInside=false):XZ[][]{
  const area=mask.reduce((sum,p,i)=>{const b=mask[(i+1)%mask.length];return sum+p[0]*b[1]-b[0]*p[1];},0),sign=area>=0?1:-1;
  let remaining=poly;const outside:XZ[][]=[];
  for(let i=0;i<mask.length&&remaining.length>=3;i++){
    const a=mask[i],b=mask[(i+1)%mask.length],side=(p:XZ)=>sign*((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]));
    const halves:[XZ[],XZ[]]=[[],[]];
    for(let j=0;j<remaining.length;j++){const p=remaining[j],r=remaining[(j+1)%remaining.length],d=side(p),e=side(r);if(d>=-1e-7)halves[0].push(p);if(d<=1e-7)halves[1].push(p);if(d*e<-1e-12){const t=d/(d-e),v:XZ=[p[0]+(r[0]-p[0])*t,p[1]+(r[1]-p[1])*t];halves[0].push(v);halves[1].push(v);}}
    if(halves[1].length>=3)outside.push(halves[1]);remaining=halves[0];
  }
  return (keepInside?(remaining.length>=3?[remaining]:[]):outside).filter(p=>Math.abs(p.reduce((v,a,i)=>{const b=p[(i+1)%p.length];return v+a[0]*b[1]-b[0]*a[1];},0))>1e-6);
}
export function engineering30SurfacePolygons(a:Engineering30Surface,q:Engineering30Layout){
  const p=[a.frame.point(a.s0,a.n0),a.frame.point(a.s1,a.n0),a.frame.point(a.s1,a.n1),a.frame.point(a.s0,a.n1)];
  return a.name==='north-court-paving'?engineering30ClipPolygon(p,q.serviceCutout):[p];
}

export function cutEngineering30Terrain(positions:number[],indices:number[],q:Engineering30Layout){
  const inside=(p:XZ[],x:number,z:number)=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
  const floorPolygon=[q.connector.point(q.connector.start,-2.8),q.connector.point(q.connector.end,-2.8),q.connector.point(q.connector.end,2.8),q.connector.point(q.connector.start,2.8)];
  const polygons=[q.outline,q.tower,floorPolygon];
  const inSurface=(a:Engineering30Surface,x:number,z:number)=>{const p=a.frame.local([x,z]);return p.s>=a.s0-1e-5&&p.s<=a.s1+1e-5&&p.n>=a.n0-1e-5&&p.n<=a.n1+1e-5?p:undefined;};
  const surfaceAt=(x:number,z:number)=>{let result: number|undefined;for(const a of q.surfaces){if(a.name==='north-court-paving'&&inside(q.serviceCutout,x,z))continue;const p=inSurface(a,x,z);if(p)result=physics561SurfaceHeight(a,p.s,p.n);}return result;};
  const segments=[...polygons,q.serviceCutout,...q.surfaces.map(a=>[a.frame.point(a.s0,a.n0),a.frame.point(a.s1,a.n0),a.frame.point(a.s1,a.n1),a.frame.point(a.s0,a.n1)])].flatMap(p=>p.map((a,i)=>[a,p[(i+1)%p.length]]));
  const patch=cutTerrainPatch(positions,indices,0,{bounds:q.bounds,local:(x,z)=>({s:x,n:z}),lines:{s:[],n:[]},boundarySegments:segments,apply:(x,z,y)=>{
    const h=surfaceAt(x,z);if(h!==undefined)return h-.22;
    return polygons.some(p=>inside(p,x,z))?Math.min(y,q.floor-.25):y;
  }});
  return {...patch,surfaceAt,affects:(x:number,z:number)=>surfaceAt(x,z)!==undefined||polygons.some(p=>inside(p,x,z))};
}
