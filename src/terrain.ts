import { getEngineering39Layout, cutEngineering39Terrain, ENGINEERING39_ID } from './engineering39Site';
import { getEngineering3736Layout, cutEngineering3736Terrain } from './engineering3736Site';
import { getEngineering35AccessLayout, cutEngineering35AccessTerrain } from './engineering35AccessSite';
import { getEngineering3334Layout, cutEngineering3334Terrain } from './engineering3334Site';
import { getEngineering3436Layout, cutEngineering3436Terrain, ENGINEERING34_ID } from './engineering3436Site';
import { getEngineering36Layout, cutEngineering36Terrain, ENGINEERING36_ID } from './engineering36Site';
import { getEngineering37Layout, cutEngineering37Terrain } from './engineering37Site';
import { getEngineering3337Layout, cutEngineering3337Terrain, ENGINEERING37_ID } from './engineering3337Site';
import { getEngineering33Layout, cutEngineering33Terrain } from './engineering33Site';
import { getEngineering3033Layout, cutEngineering3033Terrain, ENGINEERING33_ID } from './engineering3033Site';
import { ENGINEERING30_ID, getEngineering30Layout, cutEngineering30Terrain } from './engineering30Site';
import { ENGINEERING30_DINING_ID, getEngineering30DiningLayout, cutEngineering30DiningTerrain } from './engineering30DiningSite';
import { SCIENCE28_ID, getScience28Layout, cutScience28Terrain } from './science28Site';
import { SCIENCE251_ID, getScience251Layout, cutScience251Terrain } from './science251Site';
import { SCIENCE24_ID, getScience24Layout, cutScience24Terrain } from './science24Site';
import { SCIENCE25_ID, SCIENCE27_ID, getScience2527Layout, cutScience2527Terrain } from './science2527Site';
import { SCIENCE26_ID, getScience26Layout, cutScience26Terrain } from './science26Site';
import { SCIENCE23_ID, getScience23Layout, cutScience23Terrain } from './science23Site';
import { getScience2256Layout, cutScience2256Terrain, SCIENCE22_ID, SCIENCE56_ID } from './science2256Site';
import { getPhysics561Layout, cutPhysics561Terrain, PHYSICS561_ID } from './physics561Site';
import { getPharmacy143Layout, cutPharmacy143Terrain, PHARMACY143_ID } from './pharmacy143Site';
import { getPharmacy21Layout, cutPharmacy21Terrain } from './pharmacy21Site';
import { PHARMACY21_ID } from './pharmacy2021Site';
import { getLibraryAmenitiesLayout, cutLibraryAmenitiesTerrain } from './libraryAmenitiesSite';
import { getLibrarySoutheastLayout, cutLibrarySoutheastTerrain, LIBRARY_ACCESS_ID } from './librarySoutheastSite';
import { getPharmacy2021Layout, cutPharmacy2021Terrain, PHARMACY2021_ID } from './pharmacy2021Site';
import { getPharmacy20Layout, cutPharmacy20Terrain, PHARMACY20_ID } from './pharmacy20Site';
import { getEducation1320Layout, cutEducation1320Terrain } from './education1320Site';
import { EDUCATION13_ID, getEducation13Layout, cutEducation13Terrain } from './education13Site';
import * as THREE from 'three';
import { ENGINEERING_CONNECTION_SITE, engineering301303Datum, engineeringRoadProjection } from './engineering301303Site';
import { LIVING_SCIENCE_COURTYARD, applyLivingScienceCourtyardCorrection, livingScienceCourtyardCorrectionBounds } from './livingScienceCourtyardSite';
import { EDUCATION_PARKING_SITE, educationParkingPoint } from './educationParkingSite';
import { cutEducationParkingTerrain } from './educationParkingTerrain';
import { DINING76_SITE } from './dining76Site';
import { cutDining76Terrain } from './dining76Terrain';
import { DINING76_EAST_SITE } from './dining76EastSite';
import { cutDining76EastTerrain } from './dining76EastTerrain';
import { EDUCATION101_ENTRY_SITE } from './education101EntrySite';
import { cutEducation101EntryTerrain } from './education101EntryTerrain';
import { EDUCATION12_SITE } from './education12Site';
import { cutEducation12Terrain } from './education12Terrain';
import { HUMANITIES_GARDEN_SITE, humanitiesGardenLocal } from './humanitiesGardenSite';
import { cutHumanitiesGardenTerrain } from './humanitiesGardenTerrain';

export type TerrainData={bounds:{minX:number;maxX:number;minZ:number;maxZ:number};width:number;height:number;heights:number[]};
type TerrainPoint=[number,number];
export type TerrainDetailRegion={minX:number;maxX:number;minZ:number;maxZ:number};
export type TerrainHeightSampler=((x:number,z:number)=>number)&{detailRegions?:TerrainDetailRegion[];roadDetailRegions?:TerrainDetailRegion[];sampleStep?:number;roadSurfaceTriangles?:(bounds:TerrainDetailRegion)=>number[][]|undefined;preservedDrivingSurfaceTriangles?:(bounds:TerrainDetailRegion)=>number[][]|undefined;connectionCorrectionRegions?:TerrainDetailRegion[];livingScienceCourtyardCorrectionRegions?:TerrainDetailRegion[];dining76CorrectionRegions?:TerrainDetailRegion[];dining76EastCorrectionRegions?:TerrainDetailRegion[];education101CorrectionRegions?:TerrainDetailRegion[];education12CorrectionRegions?:TerrainDetailRegion[]};
export type TerrainCut={level:number;apron:number;blend:number;protectedCorridors:{points:TerrainPoint[];width:number}[]};
type BuildingPad={id?:string;points:TerrainPoint[];holes?:TerrainPoint[][];terrainPad?:boolean;terrainCut?:TerrainCut};

function insideRing(x:number,z:number,ring:TerrainPoint[]){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[i],b=ring[j];
    if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
function ringDistance(x:number,z:number,ring:TerrainPoint[]){
  let nearest=Infinity;
  for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length],dx=b[0]-a[0],dz=b[1]-a[1],length=dx*dx+dz*dz;
    const t=length?THREE.MathUtils.clamp(((x-a[0])*dx+(z-a[1])*dz)/length,0,1):0;
    nearest=Math.min(nearest,Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz));
  }
  return nearest;
}
function ringCentre(ring:TerrainPoint[]){
  let twiceArea=0,x=0,z=0;
  for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length],cross=a[0]*b[1]-b[0]*a[1];
    twiceArea+=cross;x+=(a[0]+b[0])*cross;z+=(a[1]+b[1])*cross;
  }
  if(Math.abs(twiceArea)<1e-8)return {area:0,x:ring[0][0],z:ring[0][1]};
  return {area:Math.abs(twiceArea)/2,x:x/(3*twiceArea),z:z/(3*twiceArea)};
}
export function createTerrain(scene:THREE.Scene,data:TerrainData,buildings:BuildingPad[],options:{livingScienceCourtyard?:boolean;educationParking?:boolean;dining76?:boolean;dining76East?:boolean;education101?:boolean;education12?:boolean;education1112?:boolean;education13?:boolean;education1320?:boolean;pharmacy20?:boolean;pharmacy2021?:boolean;pharmacy21?:boolean;pharmacy143?:boolean;physics561?:boolean;science2256?:boolean;science2256Access?:boolean;science23?:boolean;science26?:boolean;science2527?:boolean;science24?:boolean;science251?:boolean;engineering39?:boolean;engineering3736?:boolean;engineering35Access?:boolean;engineering3334?:boolean;engineering3436?:boolean;engineering36?:boolean;engineering37?:boolean;engineering3337?:boolean;engineering33?:boolean;engineering3033?:boolean;engineering30?:boolean;engineering30Dining?:boolean;science28?:boolean;librarySoutheast?:boolean;libraryAmenities?:boolean;humanitiesGarden?:boolean}={}){
  const humanitiesGardenActive=options.humanitiesGarden!==false&&buildings.some(b=>b.id==='way/167983080'&&b.points.some(p=>Math.hypot(p[0]-425.94,p[1]+687.77)<.1))&&buildings.some(b=>b.id==='way/167984624');
  const connection301=buildings.find(b=>b.id==='way/228476658'),connection303=buildings.find(b=>b.id==='supplemental/snu-303');
  const connectionActive=!!connection301&&!!connection303;
  const courtyardBuilding=buildings.find(b=>b.id==='way/386890828');
  const courtyardActive=options.livingScienceCourtyard!==false&&!!courtyardBuilding?.points.some(p=>Math.hypot(p[0]-LIVING_SCIENCE_COURTYARD.origin.x,p[1]-LIVING_SCIENCE_COURTYARD.origin.z)<.1);
  const parkingActive=options.educationParking!==false&&!!buildings.find(b=>b.id==='way/297046999')?.points.some(p=>Math.hypot(p[0]-517.52,p[1]+195.77)<.1);
  const diningActive=options.dining76!==false&&!!buildings.find(b=>b.id===DINING76_SITE.buildingId)?.points.some(p=>Math.hypot(p[0]-DINING76_SITE.activeFootprintAnchor[0],p[1]-DINING76_SITE.activeFootprintAnchor[1])<.1);
  const diningEastActive=options.dining76East!==false&&!!buildings.find(b=>b.id===DINING76_EAST_SITE.buildingId)?.points.some(p=>Math.hypot(p[0]-DINING76_EAST_SITE.activeFootprintAnchor[0],p[1]-DINING76_EAST_SITE.activeFootprintAnchor[1])<.1);
  const education101Active=options.education101!==false&&!!buildings.find(b=>b.id===EDUCATION101_ENTRY_SITE.buildingId)?.points.some(p=>Math.hypot(p[0]-EDUCATION101_ENTRY_SITE.activeFootprintAnchor[0],p[1]-EDUCATION101_ENTRY_SITE.activeFootprintAnchor[1])<.1);
  const education12Active=options.education12!==false&&!!buildings.find(b=>b.id===EDUCATION12_SITE.buildingId)?.points.some(p=>Math.hypot(p[0]-EDUCATION12_SITE.activeFootprintAnchor[0],p[1]-EDUCATION12_SITE.activeFootprintAnchor[1])<.1);
  const {bounds,width,height}=data,stepX=(bounds.maxX-bounds.minX)/(width-1),stepZ=(bounds.maxZ-bounds.minZ)/(height-1);
  const heights=Float32Array.from(data.heights);
  const sampleGrid=(array:ArrayLike<number>,x:number,z:number)=>{
    const u=THREE.MathUtils.clamp((x-bounds.minX)/stepX,0,width-1.001),v=THREE.MathUtils.clamp((z-bounds.minZ)/stepZ,0,height-1.001);
    const c=Math.floor(u),r=Math.floor(v),a=u-c,b=v-r;
    return (array[r*width+c]*(1-a)+array[r*width+c+1]*a)*(1-b)+(array[(r+1)*width+c]*(1-a)+array[(r+1)*width+c+1]*a)*b;
  };
  // 정문 광장은 먼저 조정한다. 건물 패드 뒤에 적용하면 미술관 바닥이 다시 기울어진다.
  for(let r=0;r<height;r++)for(let c=0;c<width;c++){
    const x=bounds.minX+c*stepX,z=bounds.minZ+r*stepZ;
    heights[r*width+c]*=THREE.MathUtils.smoothstep(Math.hypot(x/1.25,z),55,120);
  }
  const baseline=heights.slice();
  const padBuildings=buildings.filter(b=>b.terrainPad!==false&&!(connectionActive&&b.id==='way/228476658'));
  const pads=padBuildings.filter(b=>b.points.length>=3).map(b=>{
    const xs=b.points.map(p=>p[0]),zs=b.points.map(p=>p[1]);
    const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
    const holes=(b.holes??[]).filter(r=>r.length>=3),outer=ringCentre(b.points);
    let area=outer.area,x=outer.x*area,z=outer.z*area;
    for(const hole of holes){const inner=ringCentre(hole);area-=inner.area;x-=inner.x*inner.area;z-=inner.z*inner.area;}
    const cx=area>1e-8?x/area:outer.x,cz=area>1e-8?z/area:outer.z;
    // 오목한 건물이나 중정에 중심이 놓이면 외곽 표본 평균을 기준으로 쓴다.
    const y=insideRing(cx,cz,b.points)&&!holes.some(h=>insideRing(cx,cz,h))
      ?sampleGrid(baseline,cx,cz):b.points.reduce((sum,p)=>sum+sampleGrid(baseline,p[0],p[1]),0)/b.points.length;
    // 미술관 밑면이 지면에서 떨어져 있어 격자 한 칸의 경계 보간까지 완만하게 연결한다.
    const blendWidth=b.id==='way/252233408'?Math.max(12,stepX,stepZ):12;
    // 낮은 엔지니어하우스의 창과 지붕 끝이 20m DEM 경계 보간에 묻히지 않도록 주변 표본까지 평탄하게 잇는다.
    const plateauWidth=b.id==='way/386890466'?Math.max(stepX,stepZ):0;
    return {id:b.id,minX,maxX,minZ,maxZ,points:b.points,holes,y,blendWidth,plateauWidth,key:JSON.stringify([b.id??'',b.points,holes])};
  }).sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);
  for(let r=0;r<height;r++)for(let c=0;c<width;c++){
    const x=bounds.minX+c*stepX,z=bounds.minZ+r*stepZ,i=r*width+c;
    let interiorSum=0,interiorCount=0,weightedSum=0,totalWeight=0,maxWeight=0;
    for(const p of pads){
      const blendWidth=p.blendWidth+p.plateauWidth;
      if(x<p.minX-blendWidth||x>p.maxX+blendWidth||z<p.minZ-blendWidth||z>p.maxZ+blendWidth)continue;
      const within=insideRing(x,z,p.points)&&!p.holes.some(h=>insideRing(x,z,h));
      if(within){interiorSum+=p.y;interiorCount++;continue;}
      const dist=Math.min(ringDistance(x,z,p.points),...p.holes.map(h=>ringDistance(x,z,h)));
      if(dist>=blendWidth)continue;
      const weight=1-THREE.MathUtils.smoothstep(dist,p.plateauWidth,blendWidth);
      weightedSum+=p.y*weight;totalWeight+=weight;maxWeight=Math.max(maxWeight,weight);
    }
    // 실제 건물 내부를 다른 건물의 주변 경사보다 우선한다. 중첩 내부는 대칭 평균한다.
    if(interiorCount)heights[i]=interiorSum/interiorCount;
    else if(totalWeight)heights[i]=THREE.MathUtils.lerp(baseline[i],weightedSum/totalWeight,maxWeight);
  }
  // 가족동 주변만 근접 가중을 쓰며, 원시 DEM과 각 pad의 기준 높이는 유지한다.
  const familyIds=new Set(['way/439707895','way/439707894','way/439707893','way/439707892','way/409030550']);
  const evaluatePad=(x:number,z:number)=>{
    let interiorSum=0,interiorCount=0,weightedSum=0,totalWeight=0,maxWeight=0;
    for(const p of pads){
      const apron=p.id&&familyIds.has(p.id)?.4:0,blendWidth=p.blendWidth+p.plateauWidth+apron;
      if(x<p.minX-blendWidth||x>p.maxX+blendWidth||z<p.minZ-blendWidth||z>p.maxZ+blendWidth)continue;
      const inHole=p.holes.some(h=>insideRing(x,z,h)),within=insideRing(x,z,p.points)&&!inHole;
      if(within){interiorSum+=p.y;interiorCount++;continue;}
      const dist=Math.min(ringDistance(x,z,p.points),...p.holes.map(h=>ringDistance(x,z,h)));
      if(dist>=blendWidth)continue;
      const plateau=p.plateauWidth+(inHole?0:apron),weight=1-THREE.MathUtils.smoothstep(dist,plateau,blendWidth);
      const proximityWeight=weight/Math.max(.000001,dist-plateau)**2;
      weightedSum+=p.y*proximityWeight;totalWeight+=proximityWeight;maxWeight=Math.max(maxWeight,weight);
    }
    if(interiorCount)return interiorSum/interiorCount;
    if(totalWeight)return THREE.MathUtils.lerp(sampleGrid(baseline,x,z),weightedSum/totalWeight,maxWeight);
    return sampleGrid(baseline,x,z);
  };
  const stride = width - 1, refined = new Set<number>();
  const familyRefined = new Set<number>();
  const family = padBuildings.filter(b => b.id && familyIds.has(b.id));
  const regions = family.map(b => {
    const xs = b.points.map(p => p[0]), zs = b.points.map(p => p[1]);
    return { id: b.id, minX: Math.min(...xs) - stepX, maxX: Math.max(...xs) + stepX, minZ: Math.min(...zs) - stepZ, maxZ: Math.max(...zs) + stepZ };
  });
  const validCell = (c:number, r:number) => c >= 0 && c < width - 1 && r >= 0 && r < height - 1;
  const isFine = (c:number, r:number) => validCell(c, r) && refined.has(r * stride + c);
  for (const q of regions) {
    const c0 = Math.max(0, Math.floor((q.minX - bounds.minX) / stepX)), c1 = Math.min(width - 2, Math.floor((q.maxX - bounds.minX) / stepX));
    const r0 = Math.max(0, Math.floor((q.minZ - bounds.minZ) / stepZ)), r1 = Math.min(height - 2, Math.floor((q.maxZ - bounds.minZ) / stepZ));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {refined.add(r * stride + c);familyRefined.add(r * stride + c);}
  }
  // 보조 건물의 절개는 기존 패드 계산 뒤에 적용한다. 원시 DEM과 보호 도로 높이는 유지한다.
  const cuts=buildings.filter(b=>b.terrainCut).map(b=>{
    const cut=b.terrainCut!,xs=b.points.map(p=>p[0]),zs=b.points.map(p=>p[1]),margin=cut.apron+cut.blend;
    if(!Number.isFinite(cut.level)||cut.apron<0||cut.blend<=0)throw Error('Invalid terrain cut');
    return {...cut,points:b.points,holes:b.holes??[],minX:Math.min(...xs)-margin,maxX:Math.max(...xs)+margin,minZ:Math.min(...zs)-margin,maxZ:Math.max(...zs)+margin};
  });
  for(const q of cuts){
    const c0=Math.max(0,Math.floor((q.minX-bounds.minX)/stepX)-1),c1=Math.min(width-2,Math.floor((q.maxX-bounds.minX)/stepX)+1);
    const r0=Math.max(0,Math.floor((q.minZ-bounds.minZ)/stepZ)-1),r1=Math.min(height-2,Math.floor((q.maxZ-bounds.minZ)/stepZ)+1);
    for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)refined.add(r*stride+c);
  }
  // 실제 로드뷰에서 확인한 연결 구역만 세분한다. 기존 도로 중심선의 종단은 그대로 표본화한다.
  const connectionRefined=new Set<number>();
  if(connectionActive){
    const xs=connection301!.points.map(p=>p[0]),zs=connection301!.points.map(p=>p[1]);
    const q={minX:Math.min(292,...xs)-5,maxX:Math.max(...xs)+5,minZ:ENGINEERING_CONNECTION_SITE.southLimit-5,maxZ:ENGINEERING_CONNECTION_SITE.northLimit+5};
    const c0=Math.max(0,Math.floor((q.minX-bounds.minX)/stepX)-1),c1=Math.min(width-2,Math.floor((q.maxX-bounds.minX)/stepX)+1),r0=Math.max(0,Math.floor((q.minZ-bounds.minZ)/stepZ)-1),r1=Math.min(height-2,Math.floor((q.maxZ-bounds.minZ)/stepZ)+1);
    for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++){refined.add(r*stride+c);connectionRefined.add(r*stride+c);}
  }
  // 사진에서 확인한 222동 안마당만 세분한다. 기존 패드와 원시 고도는 보존한다.
  const courtyardRefined=new Set<number>();
  if(courtyardActive){
    const q=livingScienceCourtyardCorrectionBounds();
    const c0=Math.max(0,Math.floor((q.minX-bounds.minX)/stepX)-1),c1=Math.min(width-2,Math.floor((q.maxX-bounds.minX)/stepX)+1),r0=Math.max(0,Math.floor((q.minZ-bounds.minZ)/stepZ)-1),r1=Math.min(height-2,Math.floor((q.maxZ-bounds.minZ)/stepZ)+1);
    for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++){refined.add(r*stride+c);courtyardRefined.add(r*stride+c);}
  }
  const n = 10, xs = Float32Array.from({ length: (width - 1) * n + 1 }, (_, i) => bounds.minX + i * stepX / n);
  const zs = Float32Array.from({ length: (height - 1) * n + 1 }, (_, i) => bounds.minZ + i * stepZ / n);
  const positions:number[] = [], indices:number[] = [], indexByGrid = new Map<number,number>(), fineCells = new Map<number,number[][]>();
  const key = (x:number, z:number) => z * xs.length + x;
  const add = (x:number, y:number, z:number) => { const index = positions.length / 3; positions.push(Math.fround(x), Math.fround(y), Math.fround(z)); return index; };
  for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) {
    const i = add(xs[c * n], heights[r * width + c] - .03, zs[r * n]); indexByGrid.set(key(c * n, r * n), i);
  }
  const originalPositions = Float32Array.from(positions);
  const connectionDatum=connectionActive?engineering301303Datum((x,z)=>coarseSurface(x,z)+.03):undefined;
  const courtyardDatumOffset=courtyardActive?coarseSurface(LIVING_SCIENCE_COURTYARD.origin.x,LIVING_SCIENCE_COURTYARD.origin.z)+.03-LIVING_SCIENCE_COURTYARD.baselineEntryHeightAt:0;
  const boundarySegments:number[][]=[];
  for(const cell of refined){const c=cell%stride,r=Math.floor(cell/stride);
    for(const[dx,dz]of[[-1,0],[1,0],[0,-1],[0,1]])if(!isFine(c+dx,r+dz)){
      const x0=xs[c*n],x1=xs[(c+1)*n],z0=zs[r*n],z1=zs[(r+1)*n];
      boundarySegments.push(dx?[dx<0?x0:x1,z0,dx<0?x0:x1,z1]:[x0,dz<0?z0:z1,x1,dz<0?z0:z1]);
    }
  }
  function boundaryDistance(x:number,z:number){let minimum=Infinity;for(const[a,b,c,d]of boundarySegments){const dx=c-a,dz=d-b,t=THREE.MathUtils.clamp(((x-a)*dx+(z-b)*dz)/(dx*dx+dz*dz),0,1);minimum=Math.min(minimum,Math.hypot(x-a-t*dx,z-b-t*dz));}return minimum;}
  function corridorDistance(x:number,z:number,points:TerrainPoint[]){
    let nearest=Infinity;
    for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1],sq=dx*dx+dz*dz,t=sq?THREE.MathUtils.clamp(((x-a[0])*dx+(z-a[1])*dz)/sq,0,1):0;nearest=Math.min(nearest,Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz));}
    return nearest;
  }
  function connectionRoadHeight(z:number){
    const q=ENGINEERING_CONNECTION_SITE,anchor=q.anchor.z;
    const center=(value:number)=>{let best=q.road[0];for(let i=1;i<q.road.length;i++){const a=q.road[i-1],b=q.road[i];if(value>=a[1]&&value<=b[1]){const t=(value-a[1])/(b[1]-a[1]);best=[a[0]+(b[0]-a[0])*t,value];break;}}return coarseSurface(best[0],value);};
    if(z<q.roadProfileSouth||z>q.roadProfileNorth)return center(z);
    const south=z<=anchor,a=south?q.roadProfileSouth:anchor,b=south?anchor:q.roadProfileNorth,ya=center(a),yb=center(b),length=b-a,t=(z-a)/length;
    const slope=(value:number)=>(center(value+1)-center(value-1))/2;
    const ma=south?THREE.MathUtils.clamp(slope(a),-.20,.10):-.15,mb=south?-.15:THREE.MathUtils.clamp(slope(b),-.25,0);
    return (2*t*t*t-3*t*t+1)*ya+(t*t*t-2*t*t+t)*length*ma+(-2*t*t*t+3*t*t)*yb+(t*t*t-t*t)*length*mb;
  }
  let connectionWalks:{a:TerrainPoint;b:TerrainPoint;ya:number;yb:number}[]|undefined;
  function connectionWalkHeight(x:number,z:number){
    if(!connectionDatum)return{distance:Infinity,y:0};
    if(!connectionWalks){
      const nodes:Record<string,TerrainPoint>={a:[319.21,-1925.07],b:[325.71,-1925.65],c:[333.02,-1925.71],d:[381.46,-1923.63],e:[380.52,-1905.24],f:[354.29,-1904.3],g:[346.18,-1905.45],h:[333.2,-1905.36],i:[334.06,-1873.57],j:[333.94,-1851.83],k:[317.28,-1872.78],l:[324.84,-1873.45],n:[331.71,-1768.36],s:[333.09,-1911.14],t:[332.8,-1948.21],u:[334.24,-1992.62],v:[333.62,-1974.65],w:[333.38,-1951.31],m:[319.69,-1949.6],o:[327.24,-1949.28],p:[336.57,-1956.78]};
      const y:Record<string,number>=Object.fromEntries(Object.entries(nodes).map(([id,p])=>[id,coarseSurface(p[0],p[1])]));
      y.a=connectionRoadHeight(nodes.a[1]);y.b=connectionRoadHeight(nodes.b[1])+.05;y.c=connectionRoadHeight(nodes.c[1])+.10;y.k=connectionRoadHeight(nodes.k[1]);y.l=connectionRoadHeight(nodes.l[1])+.1;y.i=y.k+1.5;y.j=connectionDatum.base301-.12;y.m=connectionRoadHeight(nodes.m[1]);y.o=connectionRoadHeight(nodes.o[1])+.1;y.w=connectionRoadHeight(nodes.w[1])+2;y.t=y.w+.3;y.p=Math.min(y.p,y.w+2.5);
      const paths=[['u','v','w','t','c','s','h','i','j','n'],['a','b','c','d','e','f','g','h'],['i','l','k'],['m','o','w','p']];
      connectionWalks=paths.flatMap(p=>p.slice(1).map((id,i)=>({a:nodes[p[i]],b:nodes[id],ya:y[p[i]],yb:y[id]})));
    }
    let distance=Infinity,total=0,weighted=0;
    for(const p of connectionWalks){const dx=p.b[0]-p.a[0],dz=p.b[1]-p.a[1],sq=dx*dx+dz*dz,t=THREE.MathUtils.clamp(((x-p.a[0])*dx+(z-p.a[1])*dz)/sq,0,1),d=Math.hypot(x-p.a[0]-t*dx,z-p.a[1]-t*dz);distance=Math.min(distance,d);if(d<7){const w=1/Math.max(.15,d)**2;total+=w;weighted+=THREE.MathUtils.lerp(p.ya,p.yb,t)*w;}}
    return{distance,y:total?weighted/total:0};
  }
  function evaluateSurface(x:number,z:number){
    const c=interval(xs,x,n),r=interval(zs,z,n),coarse=coarseSurface(x,z);
    let result=familyRefined.has(r*stride+c)?THREE.MathUtils.lerp(coarse,Math.fround(evaluatePad(x,z))-.03,THREE.MathUtils.smoothstep(boundaryDistance(x,z),0,20)):coarse;
    for(const cut of cuts){
      if(connectionActive&&cut.points===connection303!.points)continue;
      if(x<cut.minX||x>cut.maxX||z<cut.minZ||z>cut.maxZ||cut.holes.some(h=>insideRing(x,z,h)))continue;
      const inside=insideRing(x,z,cut.points),distance=inside?0:ringDistance(x,z,cut.points);
      let weight=1-THREE.MathUtils.smoothstep(distance,cut.apron,cut.apron+cut.blend);
      for(const road of cut.protectedCorridors){const clearance=corridorDistance(x,z,road.points)-road.width/2;weight*=THREE.MathUtils.smoothstep(clearance,0,3);}
      result=Math.min(result,THREE.MathUtils.lerp(coarse,Math.min(coarse,cut.level-.03),weight));
    }
    if(connectionDatum){
      const datum=connectionDatum,inside301=insideRing(x,z,connection301!.points),distance301=inside301?0:ringDistance(x,z,connection301!.points);
      if(distance301<3){
        // 북문과 아트리움은 연결 기준고에 맞추고 남쪽 탑 아래는 원지형으로 점차 복원한다.
        const localZ=-(x-339.12)*.0134005645+(z+1768.53)*.9999102084;
        const entryBlend=THREE.MathUtils.clamp((-localZ-4)/10,0,1),target=THREE.MathUtils.lerp(datum.entry301-.16,datum.base301-.16,entryBlend);
        result=Math.min(result,THREE.MathUtils.lerp(coarse,target,(1-THREE.MathUtils.smoothstep(distance301,.25,3))*THREE.MathUtils.smoothstep(localZ,-115,-83)));
      }
      // 서쪽 오목부는 건물 밖이지만 낮은 몸체 사이로 드러나는 공간이다. 원본 윤곽은 유지한다.
      const westNotch=connection301!.points.slice(11,15),notchDistance=insideRing(x,z,westNotch)?0:ringDistance(x,z,westNotch);
      if(notchDistance<3)result=Math.min(result,THREE.MathUtils.lerp(coarse,datum.base301-.16,1-THREE.MathUtils.smoothstep(notchDistance,.5,3)));
      const in303=insideRing(x,z,connection303!.points),dist303=in303?0:ringDistance(x,z,connection303!.points);
      if(dist303<5)result=Math.min(result,THREE.MathUtils.lerp(coarse,datum.base303-.12,1-THREE.MathUtils.smoothstep(dist303,.5,5)));
      const walk=connectionWalkHeight(x,z),westWalkDistance=walk.distance;
      if(westWalkDistance<6.8)result=THREE.MathUtils.lerp(result,walk.y,1-THREE.MathUtils.smoothstep(westWalkDistance,3.8,6.8));
      const p=engineeringRoadProjection(x,z),longitudinal=THREE.MathUtils.smoothstep(z,ENGINEERING_CONNECTION_SITE.southLimit,ENGINEERING_CONNECTION_SITE.southLimit+20)*(1-THREE.MathUtils.smoothstep(z,ENGINEERING_CONNECTION_SITE.northLimit-20,ENGINEERING_CONNECTION_SITE.northLimit));
      if(longitudinal>0&&p.distance<19){
        const transverse=1-THREE.MathUtils.smoothstep(p.distance,12.5,19),roadSurface=connectionRoadHeight(p.z),curb=.10*THREE.MathUtils.smoothstep(p.distance,6.4,8);
        const stepApproachWeight=THREE.MathUtils.smoothstep(z,-1970,-1960)*(1-THREE.MathUtils.smoothstep(z,-1940,-1930));
        const buildingMargin=THREE.MathUtils.smoothstep(Math.min(distance301,dist303),0,2)*Math.max(1-THREE.MathUtils.smoothstep(p.distance,11-3.5*stepApproachWeight,13-3.5*stepApproachWeight),THREE.MathUtils.smoothstep(westWalkDistance,3.8,6.8));
        result=THREE.MathUtils.lerp(result,roadSurface+curb,longitudinal*transverse*buildingMargin);
      }
      if(z>-1814&&z<-1772&&x>323&&x<341){
        const weight=THREE.MathUtils.smoothstep(z,-1814,-1810)*(1-THREE.MathUtils.smoothstep(z,-1776,-1772))*(1-THREE.MathUtils.smoothstep(x,338,341));
        result=THREE.MathUtils.lerp(result,connectionRoadHeight(p.z)+.10,weight);
      }
      // 횡단보도와 같은 높이의 303 하부 문 앞은 상부 데크와 별개의 보행 공간이다.
      const portalDistance=Math.hypot(Math.max(0,Math.abs(x-301.2)-6),Math.max(0,Math.abs(z-ENGINEERING_CONNECTION_SITE.anchor.z)-4.8));
      if(portalDistance<3)result=THREE.MathUtils.lerp(result,datum.lower303-.10,(1-THREE.MathUtils.smoothstep(portalDistance,0,3))*THREE.MathUtils.smoothstep(p.distance,6.4,8.4));
      const forecourtDistance=Math.hypot(Math.max(0,Math.abs(x-350)-10),Math.max(0,Math.abs(z+1769.2)-2.1));
      if(forecourtDistance<1.5)result=Math.min(result,THREE.MathUtils.lerp(coarse,datum.entry301-.12,1-THREE.MathUtils.smoothstep(forecourtDistance,0,1.5)));
      // 북측 가지 도로는 301 패드를 제외한 기존 종단으로 이어 주도로 보정 끝의 횡단차를 막는다.
      const northServiceDistance=Math.min(
        corridorDistance(x,z,[[327.55,-1769.48],[331.71,-1768.36],[346.57,-1758.93],[359.33,-1757.36],[378.88,-1758.28],[411.55,-1726.94]]),
        corridorDistance(x,z,[[349.59,-1704.36],[351.85,-1704.61],[366.94,-1708.31]]),
        corridorDistance(x,z,[[315.68,-1709.06],[329.39,-1712.35],[340.54,-1673.86]]),
        corridorDistance(x,z,[[329.39,-1712.35],[322.32,-1732.61]]),
        corridorDistance(x,z,[[342.03,-1672.61],[342.33,-1674.31],[331.36,-1713.38],[315.25,-1754.15],[310.03,-1766.95]])
      );
      const serviceTransition=THREE.MathUtils.smoothstep(z,ENGINEERING_CONNECTION_SITE.roadProfileNorth,ENGINEERING_CONNECTION_SITE.roadProfileNorth+10);
      if(northServiceDistance<6)result=THREE.MathUtils.lerp(result,coarse,THREE.MathUtils.smoothstep(p.distance,8.5-1.5*serviceTransition,12.5-1.5*serviceTransition)*(1-THREE.MathUtils.smoothstep(northServiceDistance,3.5,6)));
    }
    if(courtyardActive&&!insideRing(x,z,courtyardBuilding!.points))result=applyLivingScienceCourtyardCorrection(x,z,result,courtyardDatumOffset);
    return result;
  }
  function interval(values:Float32Array, value:number, stride = 1) {
    let a = 0, b = (values.length - 1) / stride;
    while (b - a > 1) { const mid = (a + b) >> 1; if (value < values[mid * stride]) b = mid; else a = mid; }
    return a;
  }
  function quadHeight(a:number, b:number, d:number, e:number, x:number, z:number, source:ArrayLike<number> = positions) {
    const u = (x - source[a * 3]) / (source[b * 3] - source[a * 3]);
    const v = (z - source[a * 3 + 2]) / (source[d * 3 + 2] - source[a * 3 + 2]);
    const ya = source[a * 3 + 1], yb = source[b * 3 + 1], yd = source[d * 3 + 1], ye = source[e * 3 + 1];
    return u + v <= 1 ? ya + u * (yb - ya) + v * (yd - ya) : ye + (1 - u) * (yd - ye) + (1 - v) * (yb - ye);
  }
  function coarseSurface(x:number, z:number) {
    const c = interval(xs, x, n), r = interval(zs, z, n), a = r * width + c;
    return quadHeight(a, a + 1, a + width, a + width + 1, x, z, originalPositions);
  }
  {
    for(let r=1;r<height-1;r++)for(let c=1;c<width-1;c++)if(isFine(c-1,r-1)&&isFine(c,r-1)&&isFine(c-1,r)&&isFine(c,r)){const index=r*width+c;positions[index*3+1]=Math.fround(evaluateSurface(xs[c*n],zs[r*n]));}
  }
  function vertex(gx:number, gz:number):number {
    const k = key(gx, gz); if (indexByGrid.has(k)) return indexByGrid.get(k)!;
    const columns = gx % n ? [Math.floor(gx / n)] : [gx / n - 1, gx / n];
    const rows = gz % n ? [Math.floor(gz / n)] : [gz / n - 1, gz / n];
    const adjacent = rows.flatMap(r => columns.filter(c => validCell(c, r)).map(c => isFine(c, r)));
    const pinned = adjacent.some(Boolean) && adjacent.some(v => !v), x = xs[gx], z = zs[gz];
    const y = pinned ? coarseSurface(x, z) : evaluateSurface(x, z);
    const index = add(x, y, z); indexByGrid.set(k, index);

    return index;
  }
  const push = (a:number, b:number, c:number) => indices.push(a, b, c);
  function coarseTriangle(c:number, r:number, corners:number[][]) {
    const polygon = [];
    for (let i = 0; i < 3; i++) {
      const a = corners[i], b = corners[(i + 1) % 3]; polygon.push(vertex(a[0], a[1]));
      let neighbor = false;
      if (a[0] === b[0]) neighbor = isFine(a[0] === c * n ? c - 1 : c + 1, r);
      if (a[1] === b[1]) neighbor = isFine(c, a[1] === r * n ? r - 1 : r + 1);
      if (neighbor) for (let k = 1; k < n; k++) polygon.push(vertex(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n));
    }
    if (polygon.length === 3) { push(polygon[0],polygon[1],polygon[2]); return; }
    const x = Math.fround(corners.reduce((s, q) => s + xs[q[0]], 0) / 3), z = Math.fround(corners.reduce((s, q) => s + zs[q[1]], 0) / 3);
    const center = add(x, coarseSurface(x, z), z);
    for (let i = 0; i < polygon.length; i++) push(center, polygon[i], polygon[(i + 1) % polygon.length]);
  }
  for (let r = 0; r < height - 1; r++) for (let c = 0; c < width - 1; c++) {
    if (isFine(c, r)) {
      const grid = Array.from({ length: n + 1 }, (_, j) => Array.from({ length: n + 1 }, (_, i) => vertex(c * n + i, r * n + j)));
      fineCells.set(r * stride + c, grid);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = grid[j][i], b = grid[j][i + 1], d = grid[j + 1][i], e = grid[j + 1][i + 1]; push(a, d, b); push(b, d, e); }
    } else {
      const a = [c * n, r * n], b = [(c + 1) * n, r * n], d = [c * n, (r + 1) * n], e = [(c + 1) * n, (r + 1) * n];
      coarseTriangle(c, r, [a, d, b]); coarseTriangle(c, r, [b, d, e]);
    }
  }
  let parkingPatch:ReturnType<typeof cutEducationParkingTerrain>|undefined;
  let diningPatch:ReturnType<typeof cutDining76Terrain>|undefined;
  let diningEastPatch:ReturnType<typeof cutDining76EastTerrain>|undefined;
  let education101Patch:ReturnType<typeof cutEducation101EntryTerrain>|undefined;
  let libraryAmenitiesPatch:ReturnType<typeof cutLibraryAmenitiesTerrain>|undefined;
  let libraryAmenitiesLayout:ReturnType<typeof getLibraryAmenitiesLayout>|undefined;
  let librarySoutheastPatch:ReturnType<typeof cutLibrarySoutheastTerrain>|undefined;
  let librarySoutheastLayout:ReturnType<typeof getLibrarySoutheastLayout>|undefined;
  let engineering39Patch:ReturnType<typeof cutEngineering39Terrain>|undefined;
  let engineering39Layout:ReturnType<typeof getEngineering39Layout>|undefined;
  let engineering3736Patch:ReturnType<typeof cutEngineering3736Terrain>|undefined;
  let engineering3736Layout:ReturnType<typeof getEngineering3736Layout>|undefined;
  let engineering35AccessPatch:ReturnType<typeof cutEngineering35AccessTerrain>|undefined;
  let engineering35AccessLayout:ReturnType<typeof getEngineering35AccessLayout>|undefined;
  let engineering3334Patch:ReturnType<typeof cutEngineering3334Terrain>|undefined;
  let engineering3334Layout:ReturnType<typeof getEngineering3334Layout>|undefined;
  let engineering3436Patch:ReturnType<typeof cutEngineering3436Terrain>|undefined;
  let engineering3436Layout:ReturnType<typeof getEngineering3436Layout>|undefined;
  let engineering36Patch:ReturnType<typeof cutEngineering36Terrain>|undefined;
  let engineering36Layout:ReturnType<typeof getEngineering36Layout>|undefined;
  let engineering37Patch:ReturnType<typeof cutEngineering37Terrain>|undefined;
  let engineering37Layout:ReturnType<typeof getEngineering37Layout>|undefined;
  let engineering3337Patch:ReturnType<typeof cutEngineering3337Terrain>|undefined;
  let engineering3337Layout:ReturnType<typeof getEngineering3337Layout>|undefined;
  let engineering33Patch:ReturnType<typeof cutEngineering33Terrain>|undefined;
  let engineering33Layout:ReturnType<typeof getEngineering33Layout>|undefined;
  let engineering3033Patch:ReturnType<typeof cutEngineering3033Terrain>|undefined;
  let engineering3033Layout:ReturnType<typeof getEngineering3033Layout>|undefined;
  let engineering30Patch:ReturnType<typeof cutEngineering30Terrain>|undefined;
  let engineering30Layout:ReturnType<typeof getEngineering30Layout>|undefined;
  let engineering30DiningPatch:ReturnType<typeof cutEngineering30DiningTerrain>|undefined;
  let science28Patch:ReturnType<typeof cutScience28Terrain>|undefined;
  let engineering30DiningLayout:ReturnType<typeof getEngineering30DiningLayout>|undefined;
  let science28Layout:ReturnType<typeof getScience28Layout>|undefined;
  let science251Patch:ReturnType<typeof cutScience251Terrain>|undefined;
  let science251Layout:ReturnType<typeof getScience251Layout>|undefined;
  let science24Patch:ReturnType<typeof cutScience24Terrain>|undefined;
  let science24Layout:ReturnType<typeof getScience24Layout>|undefined;
  let science2527Patch:ReturnType<typeof cutScience2527Terrain>|undefined;
  let science2527Layout:ReturnType<typeof getScience2527Layout>|undefined;
  let science26Patch:ReturnType<typeof cutScience26Terrain>|undefined;
  let science26Layout:ReturnType<typeof getScience26Layout>|undefined;
  let science23Patch:ReturnType<typeof cutScience23Terrain>|undefined;
  let science23Layout:ReturnType<typeof getScience23Layout>|undefined;
  let science2256Patch:ReturnType<typeof cutScience2256Terrain>|undefined;
  let science2256Layout:ReturnType<typeof getScience2256Layout>|undefined;
  let physics561Patch:ReturnType<typeof cutPhysics561Terrain>|undefined;
  let physics561Layout:ReturnType<typeof getPhysics561Layout>|undefined;
  let pharmacy143Patch:ReturnType<typeof cutPharmacy143Terrain>|undefined;
  let pharmacy143Layout:ReturnType<typeof getPharmacy143Layout>|undefined;
  let pharmacy21Patch:ReturnType<typeof cutPharmacy21Terrain>|undefined;
  let pharmacy21Layout:ReturnType<typeof getPharmacy21Layout>|undefined;
  let pharmacy2021Patch:ReturnType<typeof cutPharmacy2021Terrain>|undefined;
  let pharmacy2021Layout:ReturnType<typeof getPharmacy2021Layout>|undefined;
  let pharmacy20Patch:ReturnType<typeof cutPharmacy20Terrain>|undefined;
  let pharmacy20Layout:ReturnType<typeof getPharmacy20Layout>|undefined;
  let education1320Patch:ReturnType<typeof cutEducation1320Terrain>|undefined;
  let education1320Layout:ReturnType<typeof getEducation1320Layout>|undefined;
  let education13Patch:ReturnType<typeof cutEducation13Terrain>|undefined;
  let education13Layout:ReturnType<typeof getEducation13Layout>|undefined;
  let education12Patch:ReturnType<typeof cutEducation12Terrain>|undefined;
  let humanitiesGardenPatch:ReturnType<typeof cutHumanitiesGardenTerrain>|undefined;
  function meshHeightAt(x:number, z:number) {
    x = THREE.MathUtils.clamp(x, bounds.minX, bounds.maxX); z = THREE.MathUtils.clamp(z, bounds.minZ, bounds.maxZ);
    const building39Height=engineering39Patch?.heightAt(x,z);if(building39Height!==undefined)return building39Height;
    const access3736Height=engineering3736Patch?.heightAt(x,z);if(access3736Height!==undefined)return access3736Height;
    const access35Height=engineering35AccessPatch?.heightAt(x,z);if(access35Height!==undefined)return access35Height;
    const link3334Height=engineering3334Patch?.heightAt(x,z);if(link3334Height!==undefined)return link3334Height;
    const building3436Height=engineering3436Patch?.heightAt(x,z);if(building3436Height!==undefined)return building3436Height;
    const building36Height=engineering36Patch?.heightAt(x,z);if(building36Height!==undefined)return building36Height;
    const building37Height=engineering37Patch?.heightAt(x,z);if(building37Height!==undefined)return building37Height;
    const link3337Height=engineering3337Patch?.heightAt(x,z);if(link3337Height!==undefined)return link3337Height;
    const main33Height=engineering33Patch?.heightAt(x,z);if(main33Height!==undefined)return main33Height;
    const court3033Height=engineering3033Patch?.heightAt(x,z);if(court3033Height!==undefined)return court3033Height;
    const engineering30Height=engineering30Patch?.heightAt(x,z);if(engineering30Height!==undefined)return engineering30Height;
    const engineering30DiningHeight=engineering30DiningPatch?.heightAt(x,z);if(engineering30DiningHeight!==undefined)return engineering30DiningHeight;
    const science28Height=science28Patch?.heightAt(x,z);if(science28Height!==undefined)return science28Height;
    const science251Height=science251Patch?.heightAt(x,z);if(science251Height!==undefined)return science251Height;
    const science24Height=science24Patch?.heightAt(x,z);if(science24Height!==undefined)return science24Height;
    const science2527Height=science2527Patch?.heightAt(x,z);if(science2527Height!==undefined)return science2527Height;
    const science26Height=science26Patch?.heightAt(x,z);if(science26Height!==undefined)return science26Height;
    const science23Height=science23Patch?.heightAt(x,z);if(science23Height!==undefined)return science23Height;
    const science2256Height=science2256Patch?.heightAt(x,z);if(science2256Height!==undefined)return science2256Height;
    const physics561Height=physics561Patch?.heightAt(x,z);if(physics561Height!==undefined)return physics561Height;
    const pharmacy143Height=pharmacy143Patch?.heightAt(x,z);if(pharmacy143Height!==undefined)return pharmacy143Height;
    const pharmacy21Height=pharmacy21Patch?.heightAt(x,z);if(pharmacy21Height!==undefined)return pharmacy21Height;
    const amenitiesHeight=libraryAmenitiesPatch?.heightAt(x,z);if(amenitiesHeight!==undefined)return amenitiesHeight;
    const libraryHeight=librarySoutheastPatch?.heightAt(x,z);if(libraryHeight!==undefined)return libraryHeight;
    const pharmacy2021Height=pharmacy2021Patch?.heightAt(x,z);if(pharmacy2021Height!==undefined)return pharmacy2021Height;
    const pharmacy20Height=pharmacy20Patch?.heightAt(x,z);if(pharmacy20Height!==undefined)return pharmacy20Height;
    const education1320Height=education1320Patch?.heightAt(x,z);if(education1320Height!==undefined)return education1320Height;
    const education13Height=education13Patch?.heightAt(x,z);if(education13Height!==undefined)return education13Height;
    const gardenHeight=humanitiesGardenPatch?.heightAt(x,z);if(gardenHeight!==undefined)return gardenHeight;
    const education12Height=education12Patch?.heightAt(x,z);if(education12Height!==undefined)return education12Height;
    return meshHeightBeforeEducation12(x,z);
  }
  function meshHeightBeforeEducation12(x:number,z:number){
    const education101Height=education101Patch?.heightAt(x,z);if(education101Height!==undefined)return education101Height;
    const diningEastHeight=diningEastPatch?.heightAt(x,z);if(diningEastHeight!==undefined)return diningEastHeight;
    const diningHeight=diningPatch?.heightAt(x,z);if(diningHeight!==undefined)return diningHeight;
    const parkingHeight=parkingPatch?.heightAt(x,z);if(parkingHeight!==undefined)return parkingHeight;
    const c = interval(xs, x, n), r = interval(zs, z, n), grid = fineCells.get(r * stride + c);
    if (!grid) return coarseSurface(x, z);
    let i = 0, j = 0; while (i < n - 1 && x >= xs[c * n + i + 1]) i++; while (j < n - 1 && z >= zs[r * n + j + 1]) j++;
    return quadHeight(grid[j][i], grid[j][i + 1], grid[j + 1][i], grid[j + 1][i + 1], x, z);
  }
  // 기존 삼각형을 경계에서 잘라 낮춘다. 원본 격자와 이웃 보행로의 높이는 보존한다.
  if(parkingActive){const anchor=educationParkingPoint(EDUCATION_PARKING_SITE.datumStation),offset=meshHeightAt(anchor.x,anchor.z)-EDUCATION_PARKING_SITE.baselineDatumMeshY;parkingPatch=cutEducationParkingTerrain(positions,indices,offset);}
  if(diningActive){const [x,z]=DINING76_SITE.datumAnchor,offset=meshHeightAt(x,z)-DINING76_SITE.baselineDatumMeshY;diningPatch=cutDining76Terrain(positions,indices,offset);}
  if(diningEastActive){const [x,z]=DINING76_EAST_SITE.datumAnchor,offset=meshHeightAt(x,z)-DINING76_EAST_SITE.baselineDatumMeshY;diningEastPatch=cutDining76EastTerrain(positions,indices,offset);}
  const drivingBeforeEntry=education101Active?{vertices:Float32Array.from(positions),indices:Uint32Array.from(indices)}:undefined;
  if(education101Active){const [x,z]=EDUCATION101_ENTRY_SITE.datumAnchor,offset=meshHeightAt(x,z)-EDUCATION101_ENTRY_SITE.baselineDatumMeshY;education101Patch=cutEducation101EntryTerrain(positions,indices,offset);}
  if(education12Active){const [x,z]=EDUCATION12_SITE.datumAnchor,offset=meshHeightAt(x,z)-EDUCATION12_SITE.baselineDatumMeshY;education12Patch=cutEducation12Terrain(positions,indices,offset,options.education1112!==false);}
  if(humanitiesGardenActive){const [x,z]=HUMANITIES_GARDEN_SITE.origin,floor=meshHeightAt(x,z);humanitiesGardenPatch=cutHumanitiesGardenTerrain(positions,indices,floor);}
  if(options.education13!==false&&buildings.some(b=>b.id===EDUCATION13_ID)){education13Layout=getEducation13Layout(meshHeightAt);education13Patch=cutEducation13Terrain(positions,indices,education13Layout);}
  if(education13Layout&&options.education1320!==false){education1320Layout=getEducation1320Layout(meshHeightAt,education13Layout);education1320Patch=cutEducation1320Terrain(positions,indices,education1320Layout);}
  if(education1320Layout&&options.pharmacy20!==false&&buildings.some(b=>b.id===PHARMACY20_ID)){pharmacy20Layout=getPharmacy20Layout(meshHeightAt,education1320Layout);pharmacy20Patch=cutPharmacy20Terrain(positions,indices,pharmacy20Layout);}
  if(pharmacy20Layout&&options.pharmacy2021!==false&&buildings.some(b=>b.id===PHARMACY2021_ID)){pharmacy2021Layout=getPharmacy2021Layout(meshHeightAt,pharmacy20Layout);pharmacy2021Patch=cutPharmacy2021Terrain(positions,indices,pharmacy2021Layout);}
  if(pharmacy2021Layout&&options.librarySoutheast!==false&&buildings.some(b=>b.id===LIBRARY_ACCESS_ID)){librarySoutheastLayout=getLibrarySoutheastLayout(meshHeightAt);if(options.libraryAmenities===false)librarySoutheastPatch=cutLibrarySoutheastTerrain(positions,indices,librarySoutheastLayout);}
  if(librarySoutheastLayout&&options.libraryAmenities!==false){libraryAmenitiesLayout=getLibraryAmenitiesLayout(librarySoutheastLayout,meshHeightAt);libraryAmenitiesPatch=cutLibraryAmenitiesTerrain(positions,indices,libraryAmenitiesLayout);}
  if(pharmacy2021Layout&&options.pharmacy21!==false&&buildings.some(b=>b.id===PHARMACY21_ID)){pharmacy21Layout=getPharmacy21Layout(meshHeightAt,pharmacy2021Layout);pharmacy21Patch=cutPharmacy21Terrain(positions,indices,pharmacy21Layout);}
  if(pharmacy20Layout&&options.pharmacy143!==false&&buildings.some(b=>b.id===PHARMACY143_ID)){pharmacy143Layout=getPharmacy143Layout(meshHeightAt,pharmacy20Layout);pharmacy143Patch=cutPharmacy143Terrain(positions,indices,pharmacy143Layout);}
  if(pharmacy143Layout&&options.physics561!==false&&buildings.some(b=>b.id===PHYSICS561_ID)){physics561Layout=getPhysics561Layout(meshHeightAt);physics561Patch=cutPhysics561Terrain(positions,indices,physics561Layout);}
  if(physics561Layout&&options.science2256!==false&&[SCIENCE22_ID,SCIENCE56_ID].every(id=>buildings.some(b=>b.id===id))){science2256Layout=getScience2256Layout(meshHeightAt,physics561Layout,options.science2256Access!==false);science2256Patch=cutScience2256Terrain(positions,indices,science2256Layout,buildings as {id:string;points:[number,number][]}[]);}
  if(options.science23!==false&&buildings.some(b=>b.id===SCIENCE23_ID)){science23Layout=getScience23Layout(meshHeightAt);science23Patch=cutScience23Terrain(positions,indices,science23Layout);}
  if(options.science26!==false&&buildings.some(b=>b.id===SCIENCE26_ID)){science26Layout=getScience26Layout(meshHeightAt);science26Patch=cutScience26Terrain(positions,indices,science26Layout);}
  if(options.science2527!==false&&[SCIENCE25_ID,SCIENCE27_ID].every(id=>buildings.some(b=>b.id===id))){science2527Layout=getScience2527Layout(meshHeightAt);science2527Patch=cutScience2527Terrain(positions,indices,science2527Layout,buildings as {id:string;points:[number,number][]}[]);}
  if(science2527Layout&&options.science24!==false&&buildings.some(b=>b.id===SCIENCE24_ID)){science24Layout=getScience24Layout(meshHeightAt,science2527Layout);science24Patch=cutScience24Terrain(positions,indices,science24Layout);}
  if(science24Layout&&options.science251!==false&&buildings.some(b=>b.id===SCIENCE251_ID)){science251Layout=getScience251Layout(meshHeightAt,science24Layout);science251Patch=cutScience251Terrain(positions,indices,science251Layout);}
  if(options.science28!==false&&buildings.some(b=>b.id===SCIENCE28_ID)){science28Layout=getScience28Layout(meshHeightAt);science28Patch=cutScience28Terrain(positions,indices,science28Layout);}
  const dining30Building=buildings.find(b=>b.id===ENGINEERING30_DINING_ID);
  if(options.engineering30Dining!==false&&dining30Building)engineering30DiningLayout=getEngineering30DiningLayout(meshHeightAt,(dining30Building as {id:string;points:[number,number][]}).points);
  const main30Building=buildings.find(b=>b.id===ENGINEERING30_ID);
  if(options.engineering30!==false&&main30Building)engineering30Layout=getEngineering30Layout(meshHeightAt,(main30Building as {id:string;points:[number,number][]}).points,engineering30DiningLayout);
  if(options.engineering3033!==false&&engineering30Layout&&buildings.some(b=>b.id===ENGINEERING33_ID))engineering3033Layout=getEngineering3033Layout(meshHeightAt,engineering30Layout);
  if(engineering30DiningLayout)engineering30DiningPatch=cutEngineering30DiningTerrain(positions,indices,engineering30DiningLayout);
  if(engineering30Layout)engineering30Patch=cutEngineering30Terrain(positions,indices,engineering30Layout);
  if(engineering3033Layout)engineering3033Patch=cutEngineering3033Terrain(positions,indices,engineering3033Layout);
  const main33Building=buildings.find(b=>b.id===ENGINEERING33_ID);
  if(options.engineering33!==false&&engineering3033Layout&&main33Building){engineering33Layout=getEngineering33Layout(meshHeightAt,(main33Building as {id:string;points:[number,number][]}).points,engineering3033Layout);engineering33Patch=cutEngineering33Terrain(positions,indices,engineering33Layout);}
  const main37Building=buildings.find(b=>b.id===ENGINEERING37_ID);
  if(options.engineering3337!==false&&engineering33Layout&&main37Building){engineering3337Layout=getEngineering3337Layout(meshHeightAt,engineering33Layout,(main37Building as {id:string;points:[number,number][]}).points);engineering3337Patch=cutEngineering3337Terrain(positions,indices,engineering3337Layout);}
  if(options.engineering37!==false&&engineering3337Layout&&main37Building){engineering37Layout=getEngineering37Layout(meshHeightAt,(main37Building as {id:string;points:[number,number][]}).points,engineering3337Layout);engineering37Patch=cutEngineering37Terrain(positions,indices,engineering37Layout);}
  const main36Building=buildings.find(b=>b.id===ENGINEERING36_ID);
  if(options.engineering36!==false&&engineering37Layout&&main36Building){engineering36Layout=getEngineering36Layout(meshHeightAt,(main36Building as {id:string;points:[number,number][]}).points,engineering37Layout);engineering36Patch=cutEngineering36Terrain(positions,indices,engineering36Layout);}
  const main34Building=buildings.find(b=>b.id===ENGINEERING34_ID);
  if(options.engineering3436!==false&&engineering36Layout&&main34Building){
    engineering3436Layout=getEngineering3436Layout(meshHeightAt,engineering36Layout,(main34Building as {id:string;points:[number,number][]}).points);engineering3436Patch=cutEngineering3436Terrain(positions,indices,engineering3436Layout);
    if(engineering37Layout){const old=engineering37Layout.routes.eastFootway;engineering37Layout.routes.eastFootway=[old[0],...engineering3436Layout.routes.lowerPlazaBypass,old[old.length-1]];}
  }
  const main35Building=buildings.find(b=>b.id==='way/892896238'),main431Building=buildings.find(b=>b.id==='way/162045723');
  if(options.engineering3334!==false&&engineering3436Layout&&engineering33Layout&&main35Building&&main431Building){engineering3334Layout=getEngineering3334Layout(meshHeightAt,engineering3436Layout,engineering33Layout,(main35Building as {points:[number,number][]}).points,(main431Building as {points:[number,number][]}).points);engineering3334Patch=cutEngineering3334Terrain(positions,indices,engineering3334Layout);}
  if(options.engineering35Access!==false&&engineering3334Layout){engineering35AccessLayout=getEngineering35AccessLayout(meshHeightAt,engineering3334Layout);engineering35AccessPatch=cutEngineering35AccessTerrain(positions,indices,engineering35AccessLayout);}
  if(options.engineering3736!==false&&engineering36Layout&&engineering37Layout){engineering3736Layout=getEngineering3736Layout(meshHeightAt,engineering36Layout,engineering37Layout);engineering3736Patch=cutEngineering3736Terrain(positions,indices,engineering3736Layout);}
  const main39Building=buildings.find(b=>b.id===ENGINEERING39_ID);
  if(options.engineering39!==false&&main39Building){engineering39Layout=getEngineering39Layout(meshHeightAt,(main39Building as {id:string;points:[number,number][]}).points);engineering39Patch=cutEngineering39Terrain(positions,indices,engineering39Layout);}
  const vertices = Float32Array.from(positions), colors = new Float32Array(vertices.length), indexArray = Uint32Array.from(indices);
  const low = new THREE.Color('#7c8d69'), high = new THREE.Color('#537660'), color = new THREE.Color();
  for (let i = 0; i < vertices.length; i += 3) {
    const x = vertices[i], y = vertices[i + 1] + .03, z = vertices[i + 2], variation = (Math.sin(x * .017) * Math.cos(z * .022) + 1) * .08;
    color.copy(low).lerp(high, THREE.MathUtils.clamp(y / 250 + variation, 0, 1)); colors.set(color.toArray(), i);
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3)); geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); geometry.setIndex(new THREE.BufferAttribute(indexArray, 1)); geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })); mesh.receiveShadow = true; mesh.name = 'campus-terrain'; scene.add(mesh);
  const originalLogicalHeight=(x:number,z:number)=>{const u=THREE.MathUtils.clamp((x-bounds.minX)/stepX,0,width-1.001),v=THREE.MathUtils.clamp((z-bounds.minZ)/stepZ,0,height-1.001),c=Math.floor(u),r=Math.floor(v),a=u-c,b=v-r,i=r*width+c;return a+b<=1?heights[i]+a*(heights[i+1]-heights[i])+b*(heights[i+width]-heights[i]):heights[i+width+1]+(1-a)*(heights[i+width]-heights[i+width+1])+(1-b)*(heights[i+1]-heights[i+width+1]);};
  const heightAt:TerrainHeightSampler = (x:number,z:number) => {
    const cx=THREE.MathUtils.clamp(x,bounds.minX,bounds.maxX),cz=THREE.MathUtils.clamp(z,bounds.minZ,bounds.maxZ),c=interval(xs,cx,n),r=interval(zs,cz,n);
    // 선언 밖에서는 기존 논리 높이 계산을 유지한다. 실제 메시 조회는 meshHeightAt으로 별도 제공한다.
    const gardenLocal=humanitiesGardenLocal(cx,cz),gardenOuter=HUMANITIES_GARDEN_SITE.outer;
    if(humanitiesGardenPatch&&Math.abs(gardenLocal.s)<gardenOuter.s&&Math.abs(gardenLocal.n)<gardenOuter.n){const y=humanitiesGardenPatch.heightAt(cx,cz);if(y!==undefined)return y+.03;}
    if(engineering39Patch?.affects(cx,cz)){const h=engineering39Patch.surfaceAt(cx,cz);if(h!==undefined)return h+.03;}
    if(engineering3736Patch?.affects(cx,cz)){const h=engineering3736Patch.surfaceAt(cx,cz);if(h!==undefined)return h+.03;}
    if(engineering35AccessPatch?.affects(cx,cz)){const h=engineering35AccessPatch.surfaceAt(cx,cz);if(h!==undefined)return h+.03;}
    if(engineering3334Patch?.affects(cx,cz)){const h=engineering3334Patch.surfaceAt(cx,cz);if(h!==undefined)return h+.03;}
    if(engineering3436Patch?.affects(cx,cz)){const h=engineering3436Patch.surfaceAt(cx,cz);if(h!==undefined)return h+.03;}
    if(engineering36Patch?.affects(cx,cz)){const h=engineering36Patch.surfaceAt(cx,cz);if(h!==undefined)return h+.03;}
    if(engineering37Patch?.affects(cx,cz)){const h=engineering37Patch.surfaceAt(cx,cz);if(h!==undefined)return h+.03;}
    if(engineering3337Patch?.affects(cx,cz)){const h=engineering3337Patch.surfaceAt(cx,cz);if(h!==undefined)return h+.03;}
    if(engineering33Patch?.affects(cx,cz)){const h=engineering33Patch.surfaceAt(cx,cz);if(h!==undefined)return h+.03;const y=engineering33Patch.heightAt(cx,cz);if(y!==undefined)return y+.03;}
    if(engineering3033Patch?.affects(cx,cz)){const h=engineering3033Patch.surfaceAt(cx,cz);if(h!==undefined)return h+.03;}
    if(engineering30Patch?.affects(cx,cz)){const h=engineering30Patch.surfaceAt(cx,cz);if(h!==undefined)return h+.03;const y=engineering30Patch.heightAt(cx,cz);if(y!==undefined)return y+.03;}
    if(engineering30DiningPatch?.affects(cx,cz)){const y=engineering30DiningPatch.heightAt(cx,cz);if(y!==undefined)return y+.03;}
    if(science28Patch?.affects(cx,cz)){const y=science28Patch.heightAt(cx,cz);if(y!==undefined)return y+.03;}
    if(science251Patch?.affects(cx,cz)){const y=science251Patch.heightAt(cx,cz);if(y!==undefined)return y+.03;}
    if(science24Patch?.affects(cx,cz)){const y=science24Patch.heightAt(cx,cz);if(y!==undefined)return y+.03;}
    if(science2527Patch?.affects(cx,cz)){const y=science2527Patch.heightAt(cx,cz);if(y!==undefined)return y+.03;}
    if(science26Patch?.affects(cx,cz)){const y=science26Patch.heightAt(cx,cz);if(y!==undefined)return y+.03;}
    if(science23Patch?.affects(cx,cz)){const y=science23Patch.heightAt(cx,cz);if(y!==undefined)return y+.03;}
    if(science2256Patch?.affects(cx,cz)){const y=science2256Patch.heightAt(cx,cz);if(y!==undefined)return y+.03;}
    if(physics561Patch?.affects(cx,cz)){const y=physics561Patch.heightAt(cx,cz);if(y!==undefined)return y+.03;}
    if(pharmacy143Patch?.affects(cx,cz)){const y=pharmacy143Patch.heightAt(cx,cz);if(y!==undefined)return y+.03;}
    if(pharmacy21Patch?.affects(cx,cz)){const y=pharmacy21Patch.heightAt(cx,cz);if(y!==undefined)return y+.03;}
    if(libraryAmenitiesPatch?.affects(cx,cz)){const y=libraryAmenitiesPatch.heightAt(cx,cz);if(y!==undefined)return y+.03;}
    if(librarySoutheastPatch?.affects(cx,cz)){const y=librarySoutheastPatch.heightAt(cx,cz);if(y!==undefined)return y+.03;}
    if(pharmacy2021Patch?.affects(cx,cz)){const y=pharmacy2021Patch.heightAt(cx,cz);if(y!==undefined)return y+.03;}
    if(pharmacy20Patch?.affects(cx,cz)){const y=pharmacy20Patch.heightAt(cx,cz);if(y!==undefined)return y+.03;}
    if(education1320Patch?.affects(cx,cz)){const y=education1320Patch.heightAt(cx,cz);if(y!==undefined)return y+.03;}
    const e13=education13Patch?.bounds;if(e13&&education13Patch?.affects(cx,cz)){const y=education13Patch?.heightAt(cx,cz);if(y!==undefined)return y+.03;}
    const q=education12Patch?.bounds,inEducation12=q&&cx>=q.minX&&cx<=q.maxX&&cz>=q.minZ&&cz<=q.maxZ;
    const education12Height=inEducation12?education12Patch?.heightAt(cx,cz):undefined;if(education12Height!==undefined)return education12Height+.03;
    const education101Height=education101Patch?.heightAt(cx,cz);if(education101Height!==undefined)return education101Height+.03;
    const diningEastHeight=diningEastPatch?.heightAt(cx,cz);if(diningEastHeight!==undefined)return diningEastHeight+.03;
    const diningHeight=diningPatch?.heightAt(cx,cz);if(diningHeight!==undefined)return diningHeight+.03;
    const parkingHeight=parkingPatch?.heightAt(cx,cz);if(parkingHeight!==undefined)return parkingHeight+.03;
    return isFine(c,r)?meshHeightBeforeEducation12(cx,cz)+.03:originalLogicalHeight(x,z);
  };
  heightAt.detailRegions=Array.from(refined,cell=>{const c=cell%stride,r=Math.floor(cell/stride);return {minX:xs[c*n],maxX:xs[(c+1)*n],minZ:zs[r*n],maxZ:zs[(r+1)*n]};});
  // 도로를 보호한 절개 구역 때문에 기존 도로 메시의 대각선을 바꾸지 않는다.
  // 안마당 도로는 아래의 실제 삼각형 절단을 사용한다. 멀리 있는 도로의 세분 연결부는 유지한다.
  heightAt.roadDetailRegions=Array.from(new Set([...familyRefined,...connectionRefined]),cell=>{const c=cell%stride,r=Math.floor(cell/stride);return {minX:xs[c*n],maxX:xs[(c+1)*n],minZ:zs[r*n],maxZ:zs[(r+1)*n]};});
  heightAt.sampleStep=2;
  if(humanitiesGardenPatch)mesh.userData.humanitiesGardenCorrection={id:'humanities-garden',...humanitiesGardenPatch.metadata,bounds:humanitiesGardenPatch.bounds,site:HUMANITIES_GARDEN_SITE};
  if(connectionActive){
    const correctionCells=new Set(connectionRefined);
    for(const cut of cuts)if(cut.points===connection303!.points)for(const cell of refined){const c=cell%stride,r=Math.floor(cell/stride);if(xs[c*n]<=cut.maxX+stepX&&xs[(c+1)*n]>=cut.minX-stepX&&zs[r*n]<=cut.maxZ+stepZ&&zs[(r+1)*n]>=cut.minZ-stepZ)correctionCells.add(cell);}
    heightAt.connectionCorrectionRegions=Array.from(correctionCells,cell=>{const c=cell%stride,r=Math.floor(cell/stride);return{minX:xs[c*n],maxX:xs[(c+1)*n],minZ:zs[r*n],maxZ:zs[(r+1)*n]};});
    mesh.userData.connectionCorrection={id:'engineering301-303',rawDEMModified:false,removedPad:'way/228476658',regions:heightAt.connectionCorrectionRegions,roadProfile:{south:ENGINEERING_CONNECTION_SITE.roadProfileSouth,anchor:ENGINEERING_CONNECTION_SITE.anchor,north:ENGINEERING_CONNECTION_SITE.roadProfileNorth},dimensionsEstimated:true,interior301:{fullCutNorthOfLocalZ:-83,restoreSouthOfLocalZ:-115},pedestrianCorridors:{ids:['way/481915884/418','way/481915893/423','way/481915895/424','way/481915897/425','way/481917515/426','way/481917516/427','way/481917517/428','way/482207539/432'],plateauRadius:3.8,blendOuterRadius:6.8}};
  }
  if(courtyardActive){
    heightAt.livingScienceCourtyardCorrectionRegions=Array.from(courtyardRefined,cell=>{const c=cell%stride,r=Math.floor(cell/stride);return{minX:xs[c*n],maxX:xs[(c+1)*n],minZ:zs[r*n],maxZ:zs[(r+1)*n]};});
    mesh.userData.livingScienceCourtyardCorrection={id:'living-science-222-courtyard',rawDEMModified:false,rawFootprintModified:false,regions:heightAt.livingScienceCourtyardCorrectionRegions,bounds:livingScienceCourtyardCorrectionBounds(),site:LIVING_SCIENCE_COURTYARD,datumOffset:courtyardDatumOffset,dimensionsEstimated:true,observedSource:'sources/living-science-courtyard-roadview-review.json'};
  }
  const parkingCells=new Set<number>();
  if(parkingPatch){
    const q=parkingPatch.bounds,c0=Math.max(0,interval(xs,q.minX,n)-1),c1=Math.min(width-2,interval(xs,q.maxX,n)+1),r0=Math.max(0,interval(zs,q.minZ,n)-1),r1=Math.min(height-2,interval(zs,q.maxZ,n)+1);
    for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)parkingCells.add(r*stride+c);
    mesh.userData.educationParkingCorrection={id:EDUCATION_PARKING_SITE.id,...parkingPatch.metadata,bounds:q,site:EDUCATION_PARKING_SITE,observedSource:'sources/education-parking-roadview-review.json'};
  }
  const diningCells=new Set<number>();
  if(diningPatch){
    const q=diningPatch.bounds,c0=Math.max(0,interval(xs,q.minX,n)-1),c1=Math.min(width-2,interval(xs,q.maxX,n)+1),r0=Math.max(0,interval(zs,q.minZ,n)-1),r1=Math.min(height-2,interval(zs,q.maxZ,n)+1);
    for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)diningCells.add(r*stride+c);
    heightAt.dining76CorrectionRegions=[q];
    mesh.userData.dining76Correction={id:'dining-76-approach',...diningPatch.metadata,bounds:q,site:DINING76_SITE,observedSource:'sources/dining76-roadview-review.json'};
  }
  const diningEastCells=new Set<number>();
  if(diningEastPatch){
    const q=diningEastPatch.bounds,c0=Math.max(0,interval(xs,q.minX,n)-1),c1=Math.min(width-2,interval(xs,q.maxX,n)+1),r0=Math.max(0,interval(zs,q.minZ,n)-1),r1=Math.min(height-2,interval(zs,q.maxZ,n)+1);
    for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)diningEastCells.add(r*stride+c);
    heightAt.dining76EastCorrectionRegions=[q];
    mesh.userData.dining76EastCorrection={id:'dining-76-east-approach',...diningEastPatch.metadata,bounds:q,site:DINING76_EAST_SITE,observedSource:'sources/dining76-east-roadview-review.json'};
  }
  const education101Cells=new Set<number>();
  if(education101Patch){
    const q=education101Patch.bounds,c0=Math.max(0,interval(xs,q.minX,n)-1),c1=Math.min(width-2,interval(xs,q.maxX,n)+1),r0=Math.max(0,interval(zs,q.minZ,n)-1),r1=Math.min(height-2,interval(zs,q.maxZ,n)+1);
    for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)education101Cells.add(r*stride+c);
    heightAt.education101CorrectionRegions=[q];
    mesh.userData.education101Correction={id:'education-101-entry',...education101Patch.metadata,bounds:q,site:EDUCATION101_ENTRY_SITE,observedSource:'sources/humanities-court-roadview-review.json'};
  }
  const education12Cells=new Set<number>();
  if(education12Patch){
    const q=education12Patch.bounds,c0=Math.max(0,interval(xs,q.minX,n)-1),c1=Math.min(width-2,interval(xs,q.maxX,n)+1),r0=Math.max(0,interval(zs,q.minZ,n)-1),r1=Math.min(height-2,interval(zs,q.maxZ,n)+1);
    for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)education12Cells.add(r*stride+c);
    heightAt.education12CorrectionRegions=[q];
    mesh.userData.education12Correction={id:'education-12-courtyard',...education12Patch.metadata,bounds:q,site:EDUCATION12_SITE};
  }
  if(education1320Patch)mesh.userData.education1320Correction={...education1320Patch.metadata,bounds:education1320Patch.bounds,layout:education1320Layout};
  const education13Cells=new Set<number>();
  if(education13Patch){const q=education13Patch.bounds,c0=Math.max(0,interval(xs,q.minX,n)-1),c1=Math.min(width-2,interval(xs,q.maxX,n)+1),r0=Math.max(0,interval(zs,q.minZ,n)-1),r1=Math.min(height-2,interval(zs,q.maxZ,n)+1);for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)education13Cells.add(r*stride+c);mesh.userData.education13Correction={...education13Patch.metadata,bounds:q,layout:education13Layout};}
  const pharmacy20Cells=new Set<number>();
  if(pharmacy20Patch){const q=pharmacy20Patch.bounds,c0=Math.max(0,interval(xs,q.minX,n)-1),c1=Math.min(width-2,interval(xs,q.maxX,n)+1),r0=Math.max(0,interval(zs,q.minZ,n)-1),r1=Math.min(height-2,interval(zs,q.maxZ,n)+1);for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)pharmacy20Cells.add(r*stride+c);mesh.userData.pharmacy20Correction={...pharmacy20Patch.metadata,bounds:q,layout:pharmacy20Layout};}
  const pharmacy2021Cells=new Set<number>();
  if(pharmacy2021Patch){const q=pharmacy2021Patch.bounds,c0=Math.max(0,interval(xs,q.minX,n)-1),c1=Math.min(width-2,interval(xs,q.maxX,n)+1),r0=Math.max(0,interval(zs,q.minZ,n)-1),r1=Math.min(height-2,interval(zs,q.maxZ,n)+1);for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)pharmacy2021Cells.add(r*stride+c);mesh.userData.pharmacy2021Correction={...pharmacy2021Patch.metadata,bounds:q,layout:pharmacy2021Layout};}
  const librarySoutheastCells=new Set<number>();
  if(librarySoutheastPatch){const q=librarySoutheastPatch.bounds,c0=Math.max(0,interval(xs,q.minX,n)-1),c1=Math.min(width-2,interval(xs,q.maxX,n)+1),r0=Math.max(0,interval(zs,q.minZ,n)-1),r1=Math.min(height-2,interval(zs,q.maxZ,n)+1);for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)librarySoutheastCells.add(r*stride+c);mesh.userData.librarySoutheastCorrection={...librarySoutheastPatch.metadata,bounds:q,layout:librarySoutheastLayout};}
  const libraryAmenitiesCells=new Set<number>();
  if(libraryAmenitiesPatch){const q=libraryAmenitiesPatch.bounds,c0=Math.max(0,interval(xs,q.minX,n)-1),c1=Math.min(width-2,interval(xs,q.maxX,n)+1),r0=Math.max(0,interval(zs,q.minZ,n)-1),r1=Math.min(height-2,interval(zs,q.maxZ,n)+1);for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)libraryAmenitiesCells.add(r*stride+c);mesh.userData.libraryAmenitiesCorrection={...libraryAmenitiesPatch.metadata,bounds:q,layout:libraryAmenitiesLayout};}
  const existingRoadCells=new Set([...connectionRefined,...courtyardRefined,...parkingCells,...diningCells,...diningEastCells]);
  const pharmacy21Cells=new Set<number>();
  if(pharmacy21Patch){const q=pharmacy21Patch.bounds,c0=Math.max(0,interval(xs,q.minX,n)-1),c1=Math.min(width-2,interval(xs,q.maxX,n)+1),r0=Math.max(0,interval(zs,q.minZ,n)-1),r1=Math.min(height-2,interval(zs,q.maxZ,n)+1);for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)pharmacy21Cells.add(r*stride+c);mesh.userData.pharmacy21Correction={...pharmacy21Patch.metadata,bounds:q,layout:pharmacy21Layout};}
  if(engineering30Patch)(heightAt as TerrainHeightSampler & {engineering30CorrectionRegions?:TerrainDetailRegion[]}).engineering30CorrectionRegions=[{minX:139,maxX:204,minZ:-1033,maxZ:-1000}];
  const engineering39Cells=new Set<number>();
  if(engineering39Patch){const q=engineering39Patch.bounds,c0=Math.max(0,interval(xs,q.minX,n)-1),c1=Math.min(width-2,interval(xs,q.maxX,n)+1),r0=Math.max(0,interval(zs,q.minZ,n)-1),r1=Math.min(height-2,interval(zs,q.maxZ,n)+1);for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)engineering39Cells.add(r*stride+c);mesh.userData.engineering39Correction={...engineering39Patch.metadata,bounds:q,layout:engineering39Layout};}
  const engineering3736Cells=new Set<number>();
  if(engineering3736Patch){const q=engineering3736Patch.bounds,c0=Math.max(0,interval(xs,q.minX,n)-1),c1=Math.min(width-2,interval(xs,q.maxX,n)+1),r0=Math.max(0,interval(zs,q.minZ,n)-1),r1=Math.min(height-2,interval(zs,q.maxZ,n)+1);for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)engineering3736Cells.add(r*stride+c);mesh.userData.engineering3736Correction={...engineering3736Patch.metadata,bounds:q,layout:engineering3736Layout};}
  const engineering35AccessCells=new Set<number>();
  if(engineering35AccessPatch){const q=engineering35AccessPatch.bounds,c0=Math.max(0,interval(xs,q.minX,n)-1),c1=Math.min(width-2,interval(xs,q.maxX,n)+1),r0=Math.max(0,interval(zs,q.minZ,n)-1),r1=Math.min(height-2,interval(zs,q.maxZ,n)+1);for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)engineering35AccessCells.add(r*stride+c);mesh.userData.engineering35AccessCorrection={...engineering35AccessPatch.metadata,bounds:q,layout:engineering35AccessLayout};}
  const engineering3334Cells=new Set<number>();
  if(engineering3334Patch){const q=engineering3334Patch.bounds,c0=Math.max(0,interval(xs,q.minX,n)-1),c1=Math.min(width-2,interval(xs,q.maxX,n)+1),r0=Math.max(0,interval(zs,q.minZ,n)-1),r1=Math.min(height-2,interval(zs,q.maxZ,n)+1);for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)engineering3334Cells.add(r*stride+c);mesh.userData.engineering3334Correction={...engineering3334Patch.metadata,bounds:q,layout:engineering3334Layout};}
  const engineering3436Cells=new Set<number>();
  if(engineering3436Patch){const q=engineering3436Patch.bounds,c0=Math.max(0,interval(xs,q.minX,n)-1),c1=Math.min(width-2,interval(xs,q.maxX,n)+1),r0=Math.max(0,interval(zs,q.minZ,n)-1),r1=Math.min(height-2,interval(zs,q.maxZ,n)+1);for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)engineering3436Cells.add(r*stride+c);mesh.userData.engineering3436Correction={...engineering3436Patch.metadata,bounds:q,layout:engineering3436Layout};}
  const engineering36Cells=new Set<number>();
  if(engineering36Patch){const q=engineering36Patch.bounds,c0=Math.max(0,interval(xs,q.minX,n)-1),c1=Math.min(width-2,interval(xs,q.maxX,n)+1),r0=Math.max(0,interval(zs,q.minZ,n)-1),r1=Math.min(height-2,interval(zs,q.maxZ,n)+1);for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)engineering36Cells.add(r*stride+c);mesh.userData.engineering36Correction={...engineering36Patch.metadata,bounds:q,layout:engineering36Layout};}
  const engineering37Cells=new Set<number>();
  if(engineering37Patch){const q=engineering37Patch.bounds,c0=Math.max(0,interval(xs,q.minX,n)-1),c1=Math.min(width-2,interval(xs,q.maxX,n)+1),r0=Math.max(0,interval(zs,q.minZ,n)-1),r1=Math.min(height-2,interval(zs,q.maxZ,n)+1);for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)engineering37Cells.add(r*stride+c);mesh.userData.engineering37Correction={...engineering37Patch.metadata,bounds:q,layout:engineering37Layout};}
  const engineering3337Cells=new Set<number>();
  if(engineering3337Patch){const q=engineering3337Patch.bounds,c0=Math.max(0,interval(xs,q.minX,n)-1),c1=Math.min(width-2,interval(xs,q.maxX,n)+1),r0=Math.max(0,interval(zs,q.minZ,n)-1),r1=Math.min(height-2,interval(zs,q.maxZ,n)+1);for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)engineering3337Cells.add(r*stride+c);mesh.userData.engineering3337Correction={...engineering3337Patch.metadata,bounds:q,layout:engineering3337Layout};}
  const engineering33Cells=new Set<number>();
  if(engineering33Patch){const q=engineering33Patch.bounds,c0=Math.max(0,interval(xs,q.minX,n)-1),c1=Math.min(width-2,interval(xs,q.maxX,n)+1),r0=Math.max(0,interval(zs,q.minZ,n)-1),r1=Math.min(height-2,interval(zs,q.maxZ,n)+1);for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)engineering33Cells.add(r*stride+c);mesh.userData.engineering33Correction={...engineering33Patch.metadata,bounds:q,layout:engineering33Layout};}
  const engineering3033Cells=new Set<number>();
  if(engineering3033Patch){const q=engineering3033Patch.bounds,c0=Math.max(0,interval(xs,q.minX,n)-1),c1=Math.min(width-2,interval(xs,q.maxX,n)+1),r0=Math.max(0,interval(zs,q.minZ,n)-1),r1=Math.min(height-2,interval(zs,q.maxZ,n)+1);for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)engineering3033Cells.add(r*stride+c);mesh.userData.engineering3033Correction={...engineering3033Patch.metadata,bounds:q,layout:engineering3033Layout};}
  const engineering30Cells=new Set<number>();
  if(engineering30Patch){const q=engineering30Patch.bounds,c0=Math.max(0,interval(xs,q.minX,n)-1),c1=Math.min(width-2,interval(xs,q.maxX,n)+1),r0=Math.max(0,interval(zs,q.minZ,n)-1),r1=Math.min(height-2,interval(zs,q.maxZ,n)+1);for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)engineering30Cells.add(r*stride+c);mesh.userData.engineering30Correction={...engineering30Patch.metadata,bounds:q,layout:engineering30Layout};}
  const engineering30DiningCells=new Set<number>();
  const science28Cells=new Set<number>();
  if(engineering30DiningPatch){const q=engineering30DiningPatch.bounds,c0=Math.max(0,interval(xs,q.minX,n)-1),c1=Math.min(width-2,interval(xs,q.maxX,n)+1),r0=Math.max(0,interval(zs,q.minZ,n)-1),r1=Math.min(height-2,interval(zs,q.maxZ,n)+1);for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)engineering30DiningCells.add(r*stride+c);mesh.userData.engineering30DiningCorrection={...engineering30DiningPatch.metadata,bounds:q,layout:engineering30DiningLayout};}
  if(science28Patch){const q=science28Patch.bounds,c0=Math.max(0,interval(xs,q.minX,n)-1),c1=Math.min(width-2,interval(xs,q.maxX,n)+1),r0=Math.max(0,interval(zs,q.minZ,n)-1),r1=Math.min(height-2,interval(zs,q.maxZ,n)+1);for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)science28Cells.add(r*stride+c);mesh.userData.science28Correction={...science28Patch.metadata,bounds:q,layout:science28Layout};}
  const science251Cells=new Set<number>();
  if(science251Patch){const q=science251Patch.bounds,c0=Math.max(0,interval(xs,q.minX,n)-1),c1=Math.min(width-2,interval(xs,q.maxX,n)+1),r0=Math.max(0,interval(zs,q.minZ,n)-1),r1=Math.min(height-2,interval(zs,q.maxZ,n)+1);for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)science251Cells.add(r*stride+c);mesh.userData.science251Correction={...science251Patch.metadata,bounds:q,layout:science251Layout};}
  const science24Cells=new Set<number>();
  if(science24Patch){const q=science24Patch.bounds,c0=Math.max(0,interval(xs,q.minX,n)-1),c1=Math.min(width-2,interval(xs,q.maxX,n)+1),r0=Math.max(0,interval(zs,q.minZ,n)-1),r1=Math.min(height-2,interval(zs,q.maxZ,n)+1);for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)science24Cells.add(r*stride+c);mesh.userData.science24Correction={...science24Patch.metadata,bounds:q,layout:science24Layout};}
  const science2527Cells=new Set<number>();
  if(science2527Patch){const q=science2527Patch.bounds,c0=Math.max(0,interval(xs,q.minX,n)-1),c1=Math.min(width-2,interval(xs,q.maxX,n)+1),r0=Math.max(0,interval(zs,q.minZ,n)-1),r1=Math.min(height-2,interval(zs,q.maxZ,n)+1);for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)science2527Cells.add(r*stride+c);mesh.userData.science2527Correction={...science2527Patch.metadata,bounds:q,layout:science2527Layout};}
  const science26Cells=new Set<number>();
  if(science26Patch){const q=science26Patch.bounds,c0=Math.max(0,interval(xs,q.minX,n)-1),c1=Math.min(width-2,interval(xs,q.maxX,n)+1),r0=Math.max(0,interval(zs,q.minZ,n)-1),r1=Math.min(height-2,interval(zs,q.maxZ,n)+1);for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)science26Cells.add(r*stride+c);mesh.userData.science26Correction={...science26Patch.metadata,bounds:q,layout:science26Layout};}
  const science23Cells=new Set<number>();
  if(science23Patch){const q=science23Patch.bounds,c0=Math.max(0,interval(xs,q.minX,n)-1),c1=Math.min(width-2,interval(xs,q.maxX,n)+1),r0=Math.max(0,interval(zs,q.minZ,n)-1),r1=Math.min(height-2,interval(zs,q.maxZ,n)+1);for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)science23Cells.add(r*stride+c);mesh.userData.science23Correction={...science23Patch.metadata,bounds:q,layout:science23Layout};}
  const science2256Cells=new Set<number>();
  if(science2256Patch){const q=science2256Patch.bounds,c0=Math.max(0,interval(xs,q.minX,n)-1),c1=Math.min(width-2,interval(xs,q.maxX,n)+1),r0=Math.max(0,interval(zs,q.minZ,n)-1),r1=Math.min(height-2,interval(zs,q.maxZ,n)+1);for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)science2256Cells.add(r*stride+c);mesh.userData.science2256Correction={...science2256Patch.metadata,bounds:q,layout:science2256Layout};}
  const physics561Cells=new Set<number>();
  if(physics561Patch){const q=physics561Patch.bounds,c0=Math.max(0,interval(xs,q.minX,n)-1),c1=Math.min(width-2,interval(xs,q.maxX,n)+1),r0=Math.max(0,interval(zs,q.minZ,n)-1),r1=Math.min(height-2,interval(zs,q.maxZ,n)+1);for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)physics561Cells.add(r*stride+c);mesh.userData.physics561Correction={...physics561Patch.metadata,bounds:q,layout:physics561Layout};}
  const pharmacy143Cells=new Set<number>();
  if(pharmacy143Patch){const q=pharmacy143Patch.bounds,c0=Math.max(0,interval(xs,q.minX,n)-1),c1=Math.min(width-2,interval(xs,q.maxX,n)+1),r0=Math.max(0,interval(zs,q.minZ,n)-1),r1=Math.min(height-2,interval(zs,q.maxZ,n)+1);for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)pharmacy143Cells.add(r*stride+c);mesh.userData.pharmacy143Correction={...pharmacy143Patch.metadata,bounds:q,layout:pharmacy143Layout};}
  const roadTriangleCells=new Set([...existingRoadCells,...engineering39Cells,...engineering3736Cells,...engineering35AccessCells,...engineering3334Cells,...engineering3436Cells,...engineering36Cells,...engineering37Cells,...engineering3337Cells,...engineering33Cells,...engineering3033Cells,...engineering30Cells,...engineering30DiningCells,...science28Cells,...science251Cells,...science24Cells,...science2527Cells,...science26Cells,...science23Cells,...science2256Cells,...physics561Cells,...pharmacy143Cells,...pharmacy21Cells,...education101Cells,...education12Cells,...education13Cells,...pharmacy20Cells,...pharmacy2021Cells,...librarySoutheastCells,...libraryAmenitiesCells]);
  function surfaceSampler(sourceVertices:Float32Array,sourceIndices:Uint32Array,cells:Set<number>){
    const buckets=new Map<number,number[]>();
    for(let i=0;i<sourceIndices.length;i+=3){const ids=[sourceIndices[i],sourceIndices[i+1],sourceIndices[i+2]],x=ids.reduce((v,k)=>v+sourceVertices[k*3],0)/3,z=ids.reduce((v,k)=>v+sourceVertices[k*3+2],0)/3,c=interval(xs,x,n),r=interval(zs,z,n),cell=r*stride+c;if(!cells.has(cell))continue;const list=buckets.get(cell)??[];list.push(i);buckets.set(cell,list);}
    return(q:TerrainDetailRegion)=>{
      const c0=Math.max(0,interval(xs,q.minX,n)),c1=Math.min(width-2,interval(xs,q.maxX,n)),r0=Math.max(0,interval(zs,q.minZ,n)),r1=Math.min(height-2,interval(zs,q.maxZ,n));
      for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)if(!cells.has(r*stride+c))return undefined;
      const triangles:number[][]=[];for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)for(const i of buckets.get(r*stride+c)??[]){const p=[sourceIndices[i],sourceIndices[i+1],sourceIndices[i+2]].flatMap(k=>[sourceVertices[k*3],sourceVertices[k*3+1],sourceVertices[k*3+2]]);if(Math.max(p[0],p[3],p[6])<q.minX||Math.min(p[0],p[3],p[6])>q.maxX||Math.max(p[2],p[5],p[8])<q.minZ||Math.min(p[2],p[5],p[8])>q.maxZ)continue;triangles.push(p);}return triangles;
    };
  }
  // 새 현관 절개는 차도 밖에 있다. 차도 표시는 이전 분할을 유지하고 보도와 잔디는 새 지형에 맞춘다.
  if(roadTriangleCells.size)heightAt.roadSurfaceTriangles=surfaceSampler(vertices,indexArray,roadTriangleCells);
  if(drivingBeforeEntry){
    const preserved=surfaceSampler(drivingBeforeEntry.vertices,drivingBeforeEntry.indices,existingRoadCells);
    const updated30=engineering30Patch?surfaceSampler(vertices,indexArray,engineering30Cells):undefined;
    const updatedDining=engineering30DiningPatch?surfaceSampler(vertices,indexArray,engineering30DiningCells):undefined;
    const updated28=science28Patch?surfaceSampler(vertices,indexArray,science28Cells):undefined;
    const updated251=science251Patch?surfaceSampler(vertices,indexArray,science251Cells):undefined;
    const updated24=science24Patch?surfaceSampler(vertices,indexArray,science24Cells):undefined;
    const updated2527=science2527Patch?surfaceSampler(vertices,indexArray,science2527Cells):undefined;
    const updated26=science26Patch?surfaceSampler(vertices,indexArray,science26Cells):undefined;
    const updated23=science23Patch?surfaceSampler(vertices,indexArray,science23Cells):undefined;
    const updated2256=science2256Patch?surfaceSampler(vertices,indexArray,science2256Cells):undefined;
    const updated561=physics561Patch?surfaceSampler(vertices,indexArray,physics561Cells):undefined;
    const updated143=pharmacy143Patch?surfaceSampler(vertices,indexArray,pharmacy143Cells):undefined;
    const updated21=pharmacy21Patch?surfaceSampler(vertices,indexArray,pharmacy21Cells):undefined;
    const updatedAmenities=libraryAmenitiesPatch?surfaceSampler(vertices,indexArray,libraryAmenitiesCells):undefined;
    const updatedLibrary=librarySoutheastPatch?surfaceSampler(vertices,indexArray,librarySoutheastCells):undefined;
    const updated2021=pharmacy2021Patch?surfaceSampler(vertices,indexArray,pharmacy2021Cells):undefined;
    const updated20=pharmacy20Patch?surfaceSampler(vertices,indexArray,pharmacy20Cells):undefined;
    const updated13=education13Patch?surfaceSampler(vertices,indexArray,education13Cells):undefined;
    const updated=education12Patch?surfaceSampler(vertices,indexArray,education12Cells):undefined;
    // 10-1동은 기존 차도를 보존한다. 12동의 새 차도 보정 구역만 현재 실제 지형을 사용한다.
    heightAt.preservedDrivingSurfaceTriangles=q=>{
      const q30=engineering30Patch?.bounds;if(q30&&q.minX>=q30.minX&&q.maxX<=q30.maxX&&q.minZ>=q30.minZ&&q.maxZ<=q30.maxZ)return updated30?.(q)??preserved(q);
      const qDining=engineering30DiningPatch?.bounds;if(qDining&&q.minX>=qDining.minX&&q.maxX<=qDining.maxX&&q.minZ>=qDining.minZ&&q.maxZ<=qDining.maxZ)return updatedDining?.(q)??preserved(q);
      const q28=science28Patch?.bounds;if(q28&&q.minX>=q28.minX&&q.maxX<=q28.maxX&&q.minZ>=q28.minZ&&q.maxZ<=q28.maxZ)return updated28?.(q)??preserved(q);
      const q251=science251Patch?.bounds;if(q251&&q.minX>=q251.minX&&q.maxX<=q251.maxX&&q.minZ>=q251.minZ&&q.maxZ<=q251.maxZ)return updated251?.(q)??preserved(q);
      const q24=science24Patch?.bounds;if(q24&&q.minX>=q24.minX&&q.maxX<=q24.maxX&&q.minZ>=q24.minZ&&q.maxZ<=q24.maxZ)return updated24?.(q)??preserved(q);
      const q2527=science2527Patch?.bounds;if(q2527&&q.minX>=q2527.minX&&q.maxX<=q2527.maxX&&q.minZ>=q2527.minZ&&q.maxZ<=q2527.maxZ)return updated2527?.(q)??preserved(q);
      const q26=science26Patch?.bounds;if(q26&&q.minX>=q26.minX&&q.maxX<=q26.maxX&&q.minZ>=q26.minZ&&q.maxZ<=q26.maxZ)return updated26?.(q)??preserved(q);
      const q23=science23Patch?.bounds;if(q23&&q.minX>=q23.minX&&q.maxX<=q23.maxX&&q.minZ>=q23.minZ&&q.maxZ<=q23.maxZ)return updated23?.(q)??preserved(q);
      const q2256=science2256Patch?.bounds;if(q2256&&q.minX>=q2256.minX&&q.maxX<=q2256.maxX&&q.minZ>=q2256.minZ&&q.maxZ<=q2256.maxZ)return updated2256?.(q)??preserved(q);
      const q561=physics561Patch?.bounds;if(q561&&q.minX>=q561.minX&&q.maxX<=q561.maxX&&q.minZ>=q561.minZ&&q.maxZ<=q561.maxZ)return updated561?.(q)??preserved(q);
      const q143=pharmacy143Patch?.bounds;if(q143&&q.minX>=q143.minX&&q.maxX<=q143.maxX&&q.minZ>=q143.minZ&&q.maxZ<=q143.maxZ)return updated143?.(q)??preserved(q);
      const q21=pharmacy21Patch?.bounds;if(q21&&q.minX>=q21.minX&&q.maxX<=q21.maxX&&q.minZ>=q21.minZ&&q.maxZ<=q21.maxZ)return updated21?.(q)??preserved(q);
      const amenity=libraryAmenitiesPatch?.bounds;if(amenity&&q.minX>=amenity.minX&&q.maxX<=amenity.maxX&&q.minZ>=amenity.minZ&&q.maxZ<=amenity.maxZ)return updatedAmenities?.(q)??preserved(q);
      const lib=librarySoutheastPatch?.bounds;if(lib&&q.minX>=lib.minX&&q.maxX<=lib.maxX&&q.minZ>=lib.minZ&&q.maxZ<=lib.maxZ)return updatedLibrary?.(q)??preserved(q);
      const q2021=pharmacy2021Patch?.bounds;if(q2021&&q.minX>=q2021.minX&&q.maxX<=q2021.maxX&&q.minZ>=q2021.minZ&&q.maxZ<=q2021.maxZ)return updated2021?.(q)??preserved(q);
      const q20=pharmacy20Patch?.bounds;if(q20&&q.minX>=q20.minX&&q.maxX<=q20.maxX&&q.minZ>=q20.minZ&&q.maxZ<=q20.maxZ)return updated20?.(q)??preserved(q);
      const q13=education13Patch?.bounds;if(q13&&q.minX>=q13.minX&&q.maxX<=q13.maxX&&q.minZ>=q13.minZ&&q.maxZ<=q13.maxZ)return updated13?.(q)??preserved(q);
      const b=education12Patch?.bounds;
      return b&&q.minX>=b.minX&&q.maxX<=b.maxX&&q.minZ>=b.minZ&&q.maxZ<=b.maxZ?updated?.(q)??preserved(q):preserved(q);
    };
  }
  return {heightAt,meshHeightAt,vertices,indices:indexArray,bounds,mesh};
}
