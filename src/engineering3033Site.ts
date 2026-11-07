import { humanities23Frame } from './humanities23Site';
import { cutTerrainPatch } from './terrainPatch';
import { physics561SurfaceHeight } from './physics561Site';
import type { Engineering30Layout, Engineering30Surface } from './engineering30Site';

type Frame = ReturnType<typeof humanities23Frame>;
export const ENGINEERING33_ID = 'way/347804717';

export function getEngineering3033Layout(heightAt:(x:number,z:number)=>number, main:Engineering30Layout) {
  const west=main.west, lower=main.floor-2.30, upper=main.court;
  const surfaces:Engineering30Surface[]=[],routes:Record<string,[number,number,number][]>={};
  const at=(f:Frame,s:number,n:number,y:number):[number,number,number]=>{const p=f.point(s,n);return[p[0],y,p[1]];};
  const add=(name:string,frame:Frame,s0:number,s1:number,n0:number,n1:number,y0:number,y1=y0)=>{
    const surface:Engineering30Surface={name,frame,s0,s1,n0,n1,y0,y1,axis:'s'};surfaces.push(surface);return surface;
  };
  // 2024년 사진의 회색 하단 마당, 남쪽으로 오르는 넓은 계단과 붉은 상단 마당이다.
  // 단수, 바닥 높이와 포장 경계는 지도와 기존 출입구에 맞춘 근사값이다.
  for(let s=17;s<34;s+=4)add('lower-gray-court',west,s,Math.min(s+4,34),-25,-3.9,lower);
  const stairCount=Math.ceil((upper-lower)/.16),stairRoute:[number,number,number][]=[];
  for(let i=0;i<stairCount;i++){
    const s0=34+6*i/stairCount,s1=34+6*(i+1)/stairCount,y=lower+(upper-lower)*(i+1)/stairCount;
    add('wide-court-stair',west,s0,s1,-22,-3.9,y);stairRoute.push(at(west,(s0+s1)/2,-12,y));
  }
  for(let s=40;s<80;s+=4)add('upper-red-court',west,s,Math.min(s+4,80),-22,-3.9,upper);
  const northStart=main.routes.openBay.at(-1)!;
  const north=humanities23Frame([northStart[0],northStart[2]],west.point(17.05,-12));
  add('north-court-link',north,0,north.length,-2.3,2.3,northStart[1],lower);
  routes.northCourt=[northStart,at(north,north.length,0,lower),at(west,28,-12,lower)];
  routes.wideStair=[at(west,32,-12,lower),...stairRoute,at(west,43,-12,upper)];
  routes.upperCourt=[at(west,43,-12,upper),at(west,59,-12,upper),at(west,77,-12,upper)];
  // 기존 서쪽 문 경사로를 새 상단 마당과 같은 높이에서 시작시킨다.
  const westEntry=main.surfaces.find(a=>a.name==='west-entry-ramp')!;
  westEntry.y0=upper;
  main.routes.westEntry[0][1]=upper+(main.floor-upper)*.1/3.2;
  routes.westEntry=[at(west,main.westDoor,-10,upper),...main.routes.westEntry];

  const north33=humanities23Frame([180.41,-1121.58],[234.62,-1116.26]);
  const bridge=humanities23Frame(main.south.point(main.southDoor,-.08),north33.point(44.25,0));
  const passage=humanities23Frame([242.2,-1107.15],west.point(79,-12));
  const crossing=passage.local(bridge.point(bridge.length*.54,0)).s;
  const rampStart=crossing-4,rampEnd=crossing+2,low=upper-.42;
  const roadHeight=heightAt(...passage.point(0,0))+.035;
  for(let i=0;i<4;i++)add('east-passage-approach',passage,rampStart*i/4,rampStart*(i+1)/4,-2.35,2.35,roadHeight+(low-roadHeight)*i/4,roadHeight+(low-roadHeight)*(i+1)/4);
  add('passage-access-ramp',passage,rampStart,rampEnd,.35,2.35,low,upper);
  add('passage-stair-bottom',passage,rampStart,crossing-1.2,-2.35,.35,low);
  const shortSteps:[number,number,number][]=[];
  for(let i=0;i<3;i++){
    const s0=crossing-1.2+i*.6,s1=s0+.6,y=low+.14*(i+1);
    add('passage-short-stair',passage,s0,s1,-2.35,.35,y);shortSteps.push(at(passage,(s0+s1)/2,-1,y));
  }
  add('passage-stair-top',passage,crossing+.6,rampEnd,-2.35,.35,upper);
  add('west-passage-landing',passage,rampEnd,passage.length,-2.35,2.35,upper);
  routes.southRamp=[at(passage,.2,1.35,roadHeight+(low-roadHeight)*.2/rampStart),at(passage,rampStart,1.35,low),at(passage,rampEnd,1.35,upper),at(passage,passage.length-.1,1.35,upper)];
  routes.southSteps=[at(passage,rampStart,-1,low),...shortSteps,at(passage,rampEnd+1,-1,upper)];
  routes.courtToPassage=[at(west,72,-12,upper),at(west,79,-12,upper),at(passage,rampEnd+1,0,upper)];
  const polygons=surfaces.map(a=>[a.frame.point(a.s0,a.n0),a.frame.point(a.s1,a.n0),a.frame.point(a.s1,a.n1),a.frame.point(a.s0,a.n1)]);
  const points=polygons.flat(),bounds={minX:Math.min(...points.map(p=>p[0]))-.5,maxX:Math.max(...points.map(p=>p[0]))+.5,minZ:Math.min(...points.map(p=>p[1]))-.5,maxZ:Math.max(...points.map(p=>p[1]))+.5};
  return {west,north,passage,bridge,lower,upper,stairCount,bridgeFloor:main.floor+3.5,bridgeRoof:main.floor+10.5,crossing,rampStart,rampEnd,surfaces,polygons,routes,bounds};
}
export type Engineering3033Layout=ReturnType<typeof getEngineering3033Layout>;

export function cutEngineering3033Terrain(positions:number[],indices:number[],q:Engineering3033Layout){
  const surfaceAt=(x:number,z:number)=>{
    let value:number|undefined;
    // Float32 지형 정점이 경계에서 반올림돼 기존 높은 땅을 남기지 않도록 허용 오차를 둔다.
    for(const a of q.surfaces){const p=a.frame.local([x,z]);if(p.s>=a.s0-1e-3&&p.s<=a.s1+1e-3&&p.n>=a.n0-1e-3&&p.n<=a.n1+1e-3)value=physics561SurfaceHeight(a,p.s,p.n);}
    return value;
  };
  const patch=cutTerrainPatch(positions,indices,0,{bounds:q.bounds,local:(x,z)=>({s:x,n:z}),lines:{s:[],n:[]},boundarySegments:q.polygons.flatMap(p=>p.map((a,i)=>[a,p[(i+1)%p.length]])),apply:(x,z,y)=>{const h=surfaceAt(x,z);return h===undefined?y:h-.24;}});
  return {...patch,surfaceAt,affects:(x:number,z:number)=>surfaceAt(x,z)!==undefined};
}
