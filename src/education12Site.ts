type XZ = [number, number];
const origin: XZ = [581.96, -792.18];
const axis = { x: .5105667740474061, z: .8598381064123787 };
const across = { x: -axis.z, z: axis.x };
const footprint: XZ[] = [[562.77,-728.56],[574.95,-741.84],[577.32,-744.03],[568.05,-758.2],[565.21,-763.87],[565.47,-770.3],[570.37,-780.35],[572.42,-779.06],[575.77,-772.1],[581.44,-776.23],[577.58,-783.96],[559.81,-792.97],[548.21,-772.1],[545.64,-765.16],[547.19,-756.91],[552.48,-747.27],[562.77,-728.56]];
const cafeFootprint: XZ[] = [[595.48,-787.47],[586.86,-800.70],[594.12,-805.43],[602.73,-792.20],[595.48,-787.47]];
const road19: XZ[] = [origin,[564.05,-800.87]];
const protectedRoads: XZ[][] = [
  [[571.81,-812.86],[578.75,-821.92],[589.63,-835.75]],
  [[536.37,-759.57],[548.92,-778.48]],
  [[557.43,-792.65],[535.28,-789.67]],
  [[548.92,-778.48],[557.43,-792.65],[564.05,-800.87]],
  [[564.05,-800.87],[571.81,-812.86]],
];
const protectedWalks:XZ[][]=[[[551.48,-739.51],[563.69,-722.11]],[[551.48,-739.51],[539.18,-757.04],[536.37,-759.57]]];
export const EDUCATION12_SITE = {
  buildingId:'way/238936704', cafeBuildingId:'way/439707885', origin, axis, across, footprint, cafeFootprint,
  activeFootprintAnchor:[577.58,-783.96] as XZ,
  datumAnchor:[622.11,-724.63] as XZ, baselineDatumMeshY:56.032562258451115,
  terrace:59.384, lower:56.184, cafeFloor:59.384, roadFloor:59.234,
  road19, road333:[origin,[590.38,-778],[605.697003,-752.201224]] as XZ[],
  protectedRoads:[], protectedRoadHalfWidth:3.3,
  adjustedRoads:['way/167597855/19','way/456540230/333','way/456540222/330','way/456540224/331','way/167597859/22','way/167595750/12','way/435329621/181'],
  roadJunctionLevels:{west22:55.5,middle330:57.2,west19:59.234,south331:61.2838,heightsEstimated:true},
  westernAccess:{paths:protectedWalks,coreHalfWidth:3.5,blend:2.5,lowerGround:56.034,southTransition:{start:0,end:14,coreHalfWidth:2.5,blend:.7},endpointHeightsEstimated:true},
  westernLower:{minX:539.8,maxX:551,minZ:-765,maxZ:-745},
  roadsideStair:{points:[[572.98,-800.18],[572.764,-801.764],[573.124,-803.456]] as XZ[],bottomY:59.384,topY:61.184,width:3.2,count:10,upperEnd:[574.49,-806.46] as XZ,upperEndY:61.55},
  dimensionsEstimated:true,
};
// 높이는 사진의 층 관계와 원래 도로 접속을 맞춘 게임 근사다. 현장 실측값이 아니다.
export function education12Point(s:number,n=0){return{x:origin[0]+axis.x*s+across.x*n,z:origin[1]+axis.z*s+across.z*n};}
export function education12Local(x:number,z:number){return{s:(x-origin[0])*axis.x+(z-origin[1])*axis.z,n:(x-origin[0])*across.x+(z-origin[1])*across.z};}
export function getEducation12Layout(heightAt:(x:number,z:number)=>number){
  const datumOffset=heightAt(...EDUCATION12_SITE.datumAnchor)-.03-EDUCATION12_SITE.baselineDatumMeshY;
  return{terrace:EDUCATION12_SITE.terrace+datumOffset,lower:EDUCATION12_SITE.lower+datumOffset,cafeFloor:EDUCATION12_SITE.cafeFloor+datumOffset,datumOffset};
}
export function getEducation12RoadsideStair(heightAt:(x:number,z:number)=>number){
  const {datumOffset}=getEducation12Layout(heightAt),p=EDUCATION12_SITE.roadsideStair;
  return{points:p.points,bottomY:p.bottomY+datumOffset,topY:p.topY+datumOffset,width:p.width,count:p.count,upperEnd:p.upperEnd,dimensionsEstimated:true};
}
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const smooth=(v:number)=>{const t=clamp(v);return t*t*(3-2*t);};
const smoother=(v:number)=>{const t=clamp(v);return t*t*t*(10+t*(-15+6*t));};
function hermite(a:number,b:number,ma:number,mb:number,t:number,length:number){t=clamp(t);return(2*t*t*t-3*t*t+1)*a+(t*t*t-2*t*t+t)*ma*length+(-2*t*t*t+3*t*t)*b+(t*t*t-t*t)*mb*length;}
function northRoadDesign(s:number,n:number){return hermite(EDUCATION12_SITE.roadFloor,57.324249591,0,-.195141818,(s-4)/18,18)-.1793965*n*smoother(s/22);}
function inside(x:number,z:number,ring:XZ[]){let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
function segment(x:number,z:number,a:XZ,b:XZ){const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),s=((x-a[0])*dx+(z-a[1])*dz)/length,n=((x-a[0])*-dz+(z-a[1])*dx)/length,t=clamp(s/length);return{s,n,length,t,distance:Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t)};}
function ringDistance(x:number,z:number,ring:XZ[]){return Math.min(...ring.slice(1).map((p,i)=>segment(x,z,ring[i],p).distance));}
function boxWeight(x:number,z:number,q:{minX:number;maxX:number;minZ:number;maxZ:number},blend:number){const d=Math.hypot(Math.max(q.minX-x,0,x-q.maxX),Math.max(q.minZ-z,0,z-q.maxZ));return 1-smooth(d/blend);}
function localBoxWeight(s:number,n:number,s0:number,s1:number,n0:number,n1:number,blend:number){return boxWeight(s,n,{minX:s0,maxX:s1,minZ:n0,maxZ:n1},blend);}
const upperA: XZ = EDUCATION12_SITE.roadsideStair.points[2], upperB: XZ = EDUCATION12_SITE.roadsideStair.upperEnd;
const upperLength=Math.hypot(upperB[0]-upperA[0],upperB[1]-upperA[1]);
const landingEnd: XZ = [upperA[0]+(upperB[0]-upperA[0])*.9/upperLength,upperA[1]+(upperB[1]-upperA[1])*.9/upperLength];
const frontOrigin:XZ=[577.58,-783.96],frontAxis:XZ=[.89190353,.45222571];
function frontPoint(s:number,n:number):XZ{return[frontOrigin[0]+frontAxis[0]*s-frontAxis[1]*n,frontOrigin[1]+frontAxis[1]*s+frontAxis[0]*n];}
/** 굽힘점의 공통 횡단선을 보간해 계단 안쪽 단이 겹치거나 뒤집히지 않게 한다. */
export function education12RoadsideSection(points:XZ[],upperEnd:XZ,station:number){
  const path=[...points,upperEnd],segments=path.slice(1).map((b,i)=>{const a=path[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);return{length,dx:(b[0]-a[0])/length,dz:(b[1]-a[1])/length};});
  const normals=path.map((_,i)=>{const a=segments[Math.max(0,i-1)],b=segments[Math.min(segments.length-1,i)],denominator=1+a.dx*b.dx+a.dz*b.dz;return{nx:(-a.dz-b.dz)/denominator,nz:(a.dx+b.dx)/denominator};});
  let i=0,s=station;while(i<segments.length-1&&s>segments[i].length)s-=segments[i++].length;
  const segment=segments[i],t=s/segment.length,w=Math.max(0,Math.min(1,t)),a=path[i],b=path[i+1];
  return{x:a[0]+(b[0]-a[0])*t,z:a[1]+(b[1]-a[1])*t,nx:normals[i].nx+(normals[i+1].nx-normals[i].nx)*w,nz:normals[i].nz+(normals[i+1].nz-normals[i].nz)*w};
}
function roadsideCaps(){
  const q=EDUCATION12_SITE.roadsideStair,lengths=q.points.slice(1).map((p,i)=>Math.hypot(p[0]-q.points[i][0],p[1]-q.points[i][1])),total=lengths.reduce((a,b)=>a+b,0);
  const at=(s:number,n:number):XZ=>{const p=education12RoadsideSection(q.points,q.upperEnd,s);return[p.x+p.nx*n,p.z+p.nz*n];};
  const caps:{polygon:XZ[];floor:(x:number,z:number)=>number}[]=[],half=q.width/2;
  const add=(s0:number,s1:number,h:number)=>{const p=[at(s0,-half),at(s1,-half),at(s1,half),at(s0,half)];caps.push({polygon:[...p,p[0]],floor:()=>h});};
  add(-.55,0,q.bottomY);
  for(let i=0;i<q.count;i++)add(total*i/q.count,total*(i+1)/q.count,q.bottomY+(q.topY-q.bottomY)*(i+1)/q.count);
  add(total,total+.9,q.topY);
  const p:XZ[]=[at(total+.9,half),at(total+upperLength,half),at(total+upperLength,-half),at(total+.9,-half)];
  caps.push({polygon:[...p,p[0]],floor:(x,z)=>q.topY+(q.upperEndY-q.topY)*segment(x,z,landingEnd,upperB).t});
  return caps;
}
const stairCaps=roadsideCaps();

export function applyEducation12Correction(x:number,z:number,currentMeshY:number,datumOffset=0){
  const bounds=education12CorrectionBounds();if(x<=bounds.minX||x>=bounds.maxX||z<=bounds.minZ||z>=bounds.maxZ)return currentMeshY;
  const originalArea=x>=534&&x<=613&&z>=-821&&z<=-723;
  if(!originalArea&&Math.min(...protectedRoads.slice(0,2).flatMap(r=>r.slice(1).map((b,i)=>segment(x,z,r[i],b).distance)))>=7.5)return currentMeshY;
  const p=education12Local(x,z),site=EDUCATION12_SITE;
  let y=currentMeshY;
  const blend=(w:number,h:number)=>{if(w<=0)return;y+=(h+datumOffset-y)*w;};
  const in12=inside(x,z,footprint),d12=ringDistance(x,z,footprint);
  // 상판 아래는 낮은 유리층을 유지한다. 건물 전체를 테라스 높이까지 흙으로 채우지 않는다.
  const lowerWeight=in12?1:1-smooth(d12/2);
  y+=(Math.min(y,site.lower-.15+datumOffset)-y)*lowerWeight;
  blend(boxWeight(x,z,site.westernLower,3),site.lower-.15);
  if(!in12)blend(localBoxWeight(p.s,p.n,-14,15,-1,20,4)*smooth(d12/.6),site.terrace-.15);
  // 남쪽 하부 받침벽 안쪽만 채워 바깥 접근에서 급한 지형 단면이 드러나지 않게 한다.
  // 서측 유리층과 하부 출입문 앞은 낮은 기준을 유지한다.
  const fx=x-frontOrigin[0],fz=z-frontOrigin[1],fs=fx*frontAxis[0]+fz*frontAxis[1],fn=-fx*frontAxis[1]+fz*frontAxis[0];
  blend(localBoxWeight(fs,fn,-19.924,0,-1,3,2),site.terrace-.15);
  const eastFront=segment(x,z,footprint[10],footprint[9]);
  if(eastFront.s>=0&&eastFront.s<=eastFront.length)blend(1-smooth(Math.max(0,Math.abs(eastFront.n)-1.5)/1.5),site.terrace-.15);
  const cafeIn=inside(x,z,cafeFootprint),cafeDistance=ringDistance(x,z,cafeFootprint);
  blend(cafeIn?1:1-smooth(cafeDistance/3),site.cafeFloor-.15);
  // 카페 전면 보도와 차도 쪽 테라스는 같은 기준에서 낮은 경계석으로 나눈다.
  const cf=segment(x,z,cafeFootprint[0],cafeFootprint[1]);
  if(cf.s>=-.2&&cf.s<=cf.length+.3&&cf.n>=-3.1&&cf.n<=0)blend(1,site.cafeFloor-.15);
  const northAcross=1-smooth(Math.max(0,Math.abs(p.n)-3.4)/2.6);
  if(p.s>=-2&&p.s<=35){
    const design=northRoadDesign(p.s,p.n)+datumOffset;
    const target=p.s>=22?currentMeshY:design+(currentMeshY-design)*smoother((p.s-18)/4);
    y+=(target-y)*northAcross;
  }
  const west=segment(x,z,road19[0],road19[1]);
  if(west.s>=-2&&west.s<=west.length){
    const acrossWeight=1-smooth(Math.max(0,Math.abs(west.n)-3.4)/2.6);
    // 기존 종단의 움푹한 부분을 섞지 않고 회차 앞 원래 단면으로 연결한다.
    const target=site.roadFloor+datumOffset;
    y+=(target-y)*acrossWeight;
  }
  const stair=site.roadsideStair,points=stair.points,total=points.slice(1).reduce((a,b,i)=>a+Math.hypot(b[0]-points[i][0],b[1]-points[i][1]),0);
  let station=0,nearest:{distance:number;station:number}|undefined,underStair=Infinity;
  for(let i=1;i<points.length;i++){const q=segment(x,z,points[i-1],points[i]);if(!nearest||q.distance<nearest.distance)nearest={distance:q.distance,station:station+q.t*q.length};if(q.s>=-.5&&q.s<=q.length+.5&&Math.abs(q.n)<=stair.width/2+.4)underStair=Math.min(underStair,stair.bottomY+(stair.topY-stair.bottomY)*(station+q.t*q.length)/total-.22);station+=q.length;}
  if(nearest&&nearest.distance<3.1){
    const floor=stair.bottomY+(stair.topY-stair.bottomY)*nearest.station/total-.22;
    const weight=1-smooth(Math.max(0,nearest.distance-stair.width/2)/1.5);
    y+=(Math.min(y,Math.min(floor,underStair)+datumOffset)-y)*weight;
  }
  const landing=segment(x,z,upperA,landingEnd),ramp=segment(x,z,landingEnd,upperB);
  if(landing.s>=0&&landing.s<=landing.length)blend(1-smooth(Math.max(0,Math.abs(landing.n)-1.6)/1.2),stair.topY-.15);
  if(ramp.s>=0&&ramp.s<=ramp.length)blend(1-smooth(Math.max(0,Math.abs(ramp.n)-1.6)/1.2),stair.topY+(stair.upperEndY-stair.topY)*ramp.t-.15);
  const continuation=segment(x,z,upperB,[582.37,-817.27]);
  if(continuation.s>=0&&continuation.s<=continuation.length){const w=(1-smooth(continuation.s/continuation.length))*(1-smooth(Math.max(0,Math.abs(continuation.n)-1.6)/1.2));blend(w,stair.upperEndY-.15+(64.58449749415405-(stair.upperEndY-.15))*continuation.t);}
  // 꺾인 계단의 바깥 모서리는 최근접 중심선 구간이 바뀐다. 실제 단 폭의 합집합 아래를 따로 낮춘다.
  for(const cap of stairCaps){const d=inside(x,z,cap.polygon)?0:ringDistance(x,z,cap.polygon),w=1-smooth(Math.max(0,d-.03)/.3),limit=cap.floor(x,z)-.15+datumOffset;if(w>0)y+=(Math.min(y,limit)-y)*w;}
  // 서측 원래 보행선은 낮은 유리층 앞 마당을 지난다. 양끝 도로로 돌아가는 높이는 게임 근사다.
  const westPath:XZ[]=[[536.37,-759.57],[539.18,-757.04],[551.48,-739.51],[563.69,-722.11]];
  let westStation=0,nearestWalk:{distance:number;s:number}|undefined;
  for(let i=1;i<westPath.length;i++){const q=segment(x,z,westPath[i-1],westPath[i]);if(!nearestWalk||q.distance<nearestWalk.distance)nearestWalk={distance:q.distance,s:westStation+q.t*q.length};westStation+=q.length;}
  if(nearestWalk&&nearestWalk.distance<6){
    const station=nearestWalk.s,profile=smooth(station/14)*(1-smooth((station-29.1958729759)/14));
    const target=currentMeshY+(site.lower-.15+datumOffset-currentMeshY)*profile;
    y+=(target-y)*(1-smooth(Math.max(0,nearestWalk.distance-3.5)/2.5));
  }
  const branch=segment(x,z,[526.07,-722.86],[551.48,-739.51]);
  if(branch.s>=10&&branch.s<=branch.length+1&&Math.abs(branch.n)<5){
    const target=currentMeshY+(site.lower-.15+datumOffset-currentMeshY)*smooth((branch.s-10)/(branch.length-10));
    y+=(target-y)*(1-smooth(Math.max(0,Math.abs(branch.n)-2.85)/2.15));
  }
  // 낮은 문과 계단 하단은 같은 마당으로 연결한다.
  blend(boxWeight(x,z,{minX:542.0,maxX:551,minZ:-764,maxZ:-751},3),site.lower-.15);
  if(x<534||x>613||z < -821||z > -723)y=currentMeshY;
  // 접속부마다 같은 높이를 사용하고 길의 전폭을 함께 잇는다.
  const roadDesigns=[
    {points:road19,levels:[site.roadFloor,site.roadFloor]},
    {points:protectedRoads[3],levels:[55.5,57.2,site.roadFloor]},
    {points:protectedRoads[4],levels:[site.roadFloor,61.2838]},
    {points:protectedRoads[2],levels:[57.2,59.2287596737493]},
    {points:protectedRoads[0],levels:[61.2838,63.5,66.95651696881092]},
    {points:protectedRoads[1],levels:[51.62027498229533,55.5]},
  ];
  let bestDistance=Infinity,roadTarget=0,roadWeight=0;
  for(let ri=0;ri<roadDesigns.length;ri++){const r=roadDesigns[ri];for(let i=1;i<r.points.length;i++){const q=segment(x,z,r.points[i-1],r.points[i]);if(q.distance>=bestDistance)continue;bestDistance=q.distance;const t=q.t;let target=(ri===2?r.levels[0]+.06*q.s+.0058465*q.s*q.s:ri===4?hermite(61.2838,66.95651696881092,.227,.056,(q.s+(i===2?11.412805439:0))/29.009,29.009):r.levels[i-1]+(r.levels[i]-r.levels[i-1])*smooth(t))+datumOffset,restore=0;if(ri===5)restore=1-smooth((q.s-8)/(q.length-8));if(ri===4&&i===2)restore=smooth((q.s-2)/(q.length-8));if(ri===3)restore=smooth(q.s/q.length);target+=(currentMeshY-target)*restore;roadTarget=target;roadWeight=1-smooth(Math.max(0,q.distance-4.5)/3);}}
  if(roadWeight>0)y+=(roadTarget-y)*roadWeight;
  const joiningAxis=[.543315,-.839529];
  for(const [jx,jz,h,g,r] of [[564.05,-800.87,site.roadFloor,.06,6],[571.81,-812.86,61.2838,.227,4.0]]){const along=(x-jx)*joiningAxis[0]+(z-jz)*joiningAxis[1];if(jx===564.05&&along>6||jx!==564.05&&along < -4)continue;const d=Math.hypot(x-jx,z-jz),w=(1-smooth(Math.max(0,d-r)/3))*(jx===564.05?smooth((((x-jx)*joiningAxis[0]+(z-jz)*joiningAxis[1])+3)/2):1);if(w>0)y+=(h+datumOffset+g*along+.0058465*along*along-y)*w;}
  // 계단 폭의 바깥은 연속 비탈로 잇고, 실제 단 아래만 상면보다 낮게 제한한다.
  const nearestRoad=Math.min(...[road19,...protectedRoads.slice(3)].flatMap(r=>r.slice(1).map((p,i)=>segment(x,z,r[i],p).distance)));
  const stairRoadWeight=smooth((nearestRoad-2.8)/.6);
  if(stairRoadWeight>0){
    if(nearest&&nearest.distance<5){const target=stair.bottomY+(stair.topY-stair.bottomY)*nearest.station/total-.45+datumOffset,w=(1-smooth(Math.max(0,nearest.distance-1.8)/3.2))*stairRoadWeight;y+=(target-y)*w;}
    if(landing.s>=-.05&&landing.s<=landing.length+.05)blend((1-smooth(Math.max(0,Math.abs(landing.n)-1.6)/2.4))*stairRoadWeight,stair.topY-.15);
    if(ramp.s>=-.05&&ramp.s<=ramp.length+.4)blend((1-smooth(Math.max(0,Math.abs(ramp.n)-1.6)/2.4))*stairRoadWeight,stair.topY+(stair.upperEndY-stair.topY)*ramp.t-.15);
    for(const cap of stairCaps){const d=inside(x,z,cap.polygon)?0:ringDistance(x,z,cap.polygon),w=(1-smooth(Math.max(0,d-.03)/.3))*stairRoadWeight,limit=cap.floor(x,z)-.18+datumOffset;if(w>0)y+=(Math.min(y,limit)-y)*w;}
  }
  // 카페 바닥과 전면 경사 포장 아래는 도로 쪽 높이를 따라 매끈하게 잇는다.
  const cafeCapWeight=cafeIn?1:localBoxWeight(cf.s,cf.n,-.5,cf.length+.6,-3.4,0,1);y+=(Math.min(y,site.cafeFloor-.15+datumOffset)-y)*cafeCapWeight;
  if(cf.s>=-.2&&cf.s<=cf.length+.3&&cf.n < -3.1&&cf.n > -16){
    const a=cafeFootprint[0],b=cafeFootprint[1],dx=(b[0]-a[0])/cf.length,dz=(b[1]-a[1])/cf.length,at=(v:number):XZ=>[a[0]+dx*cf.s-dz*v,a[1]+dz*cf.s+dx*v];
    const distance=(p:XZ)=>Math.min(...[road19,site.road333].flatMap(r=>r.slice(1).map((b,i)=>segment(...p,r[i],b).distance)));
    let lo=3.1,hi=3.1;while(hi<16&&distance(at(-hi))>3)hi+=.2;for(let i=0;i<20;i++){const mid=(lo+hi)/2;if(distance(at(-mid))>3)lo=mid;else hi=mid;}
    const edgeDepth=(lo+hi)/2,ep=at(-edgeDepth),e=education12Local(...ep);
    const edgeRoad=segment(...ep,road19[0],road19[1]).distance<3.01?site.roadFloor:northRoadDesign(e.s,e.n);
    if(-cf.n<=edgeDepth){const fraction=clamp((-cf.n-3.1)/(edgeDepth-3.1));y=Math.min(y,site.cafeFloor-.15+(edgeRoad-.02-(site.cafeFloor-.15))*fraction+datumOffset);}
  }
  // 남쪽 상승부는 마당 상자와 차도 가장자리의 높이를 다시 섞지 않는다.
  // 원본 보행로의 전폭은 하나의 종단으로 잇고, 바깥 마당으로만 옆 비탈을 둔다.
  if(nearestWalk&&nearestWalk.s<14&&nearestWalk.distance<3.2){
    const target=currentMeshY+(site.lower-.15+datumOffset-currentMeshY)*smooth(nearestWalk.s/14);
    y+=(target-y)*(1-smooth(Math.max(0,nearestWalk.distance-2.5)/.7));
  }
  const protection=0;
  const boundaryWeight=smooth(Math.min(x-bounds.minX,bounds.maxX-x,z-bounds.minZ,bounds.maxZ-z)/2);
  return currentMeshY+(y-currentMeshY)*(1-protection)*boundaryWeight;
}
export function education12CorrectionBounds(){return{minX:528,maxX:613,minZ:-842,maxZ:-723};}
export function education12SplitLines(){
  const s:number[]=[],n:number[]=[];for(let v=-28;v<=58;v+=2)s.push(v);for(let v=-26;v<=62;v+=2)n.push(v);
  return{s:[...s,16.4914765864,18,35],n:[...n,-3.4,3.4]};
}
export function education12BoundarySegments():XZ[][]{
  const q=EDUCATION12_SITE.westernLower;
  const rectangles=[[[q.minX,q.minZ],[q.maxX,q.minZ],[q.maxX,q.maxZ],[q.minX,q.maxZ],[q.minX,q.minZ]] as XZ[]];
  const cu=(cafeFootprint[1][0]-cafeFootprint[0][0])/Math.hypot(cafeFootprint[1][0]-cafeFootprint[0][0],cafeFootprint[1][1]-cafeFootprint[0][1]),cz=(cafeFootprint[1][1]-cafeFootprint[0][1])/Math.hypot(cafeFootprint[1][0]-cafeFootprint[0][0],cafeFootprint[1][1]-cafeFootprint[0][1]),cl=Math.hypot(cafeFootprint[1][0]-cafeFootprint[0][0],cafeFootprint[1][1]-cafeFootprint[0][1]),cp=(u:number,v:number):XZ=>[cafeFootprint[0][0]+cu*u-cz*v,cafeFootprint[0][1]+cz*u+cu*v];
  rectangles.push([cp(-.5,-3.4),cp(cl+.6,-3.4),cp(cl+.6,0),cp(-.5,0),cp(-.5,-3.4)]);
  const cuts:XZ[][]=[...[footprint,cafeFootprint,...rectangles].flatMap(r=>r.slice(1).map((p,i)=>[r[i],p])),...protectedRoads.flatMap(r=>r.slice(1).flatMap((p,i)=>{const a=r[i],dx=p[0]-a[0],dz=p[1]-a[1],len=Math.hypot(dx,dz);return[-4.5,-3.4,-2.8,2.8,3.4,4.5].map(w=>[[a[0]-dz/len*w,a[1]+dx/len*w],[p[0]-dz/len*w,p[1]+dx/len*w]] as XZ[]);}))];
  for(const s of[-21.924,-19.924,0,2])cuts.push([frontPoint(s,-4),frontPoint(s,6)]);
  for(const n of[-3,-1,0,3,5])cuts.push([frontPoint(-21,n),frontPoint(3,n)]);
  const westA=road19[0],westB=road19[1],wx=westB[0]-westA[0],wz=westB[1]-westA[1],wl=Math.hypot(wx,wz);
  for(const w of[-2.8,2.8])cuts.push([[westA[0]-wz/wl*w,westA[1]+wx/wl*w],[westB[0]-wz/wl*w,westB[1]+wx/wl*w]]);
  for(const s of[0,3,6,9,12,wl]){const x=westA[0]+wx/wl*s,z=westA[1]+wz/wl*s;cuts.push([[x-wz/wl*7,z+wx/wl*7],[x+wz/wl*7,z-wx/wl*7]]);}
  for(let station=0;station<=27;station+=.5){const a=education12Point(station,-5),b=education12Point(station,5);cuts.push([[a.x,a.z],[b.x,b.z]]);}
  // 짧은 곡선 계단과 참은 2m 격자만으로 상면을 보간하지 않는다.
  const paths=[EDUCATION12_SITE.roadsideStair.points,[upperA,landingEnd,upperB,[582.37,-817.27] as XZ]];
  for(const path of paths)for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),ux=dx/length,uz=dz/length;
    for(const n of[-3.1,-2.8,-1.6,0,1.6,2.8,3.1])cuts.push([[a[0]-uz*n,a[1]+ux*n],[b[0]-uz*n,b[1]+ux*n]]);
    const count=Math.ceil(length/.35);for(let j=0;j<=count;j++){const x=a[0]+dx*j/count,z=a[1]+dz*j/count;cuts.push([[x-uz*4,z+ux*4],[x+uz*4,z-ux*4]]);}
  }
  for(const cap of stairCaps)for(let i=1;i<cap.polygon.length;i++)cuts.push([cap.polygon[i-1],cap.polygon[i]]);
  for(const road of protectedWalks)for(let i=1;i<road.length;i++){const a=road[i-1],b=road[i],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz);for(const n of[-3.35,-2.85,2.85,3.35])cuts.push([[a[0]-dz/l*n,a[1]+dx/l*n],[b[0]-dz/l*n,b[1]+dx/l*n]]);}
  return cuts;
}
