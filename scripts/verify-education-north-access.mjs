import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {registerHooks} from 'node:module';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hashes={};
const sourceRoot=pathToFileURL(path.join(root,'src')+path.sep).href;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=f=>{const bytes=fs.readFileSync(path.join(root,f));hashes[f]=sha(bytes);return bytes;};

// 생산 모듈을 메모리에서 변환한다. 공용 컴파일 캐시에는 쓰지 않는다.
registerHooks({
 resolve(specifier,context,next){
  if(context.parentURL?.startsWith(sourceRoot)&&specifier.startsWith('.')&&!path.extname(specifier))return {url:new URL(specifier+'.ts',context.parentURL).href,shortCircuit:true};
  return next(specifier,context);
 },
 load(url,context,next){
  if(url.startsWith(sourceRoot)&&url.endsWith('.ts')){
   const relative=path.relative(root,fileURLToPath(url)).replaceAll('\\','/');
   return {format:'module',shortCircuit:true,source:ts.transpileModule(read(relative).toString('utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText};
  }
  return next(url,context);
 }
});

// 글자 캔버스만 대체한다. 지형, 건물, 시설과 물리는 실제 생산 모듈이다.
globalThis.document={createElement(){const canvas={width:0,height:0,textCalls:[]};canvas.getContext=()=>new Proxy({},{get(o,k){if(k==='fillText')return(...args)=>canvas.textCalls.push(args);if(k==='measureText')return s=>({width:String(s).length*20});if(k==='createLinearGradient'||k==='createRadialGradient')return()=>({addColorStop(){}});return o[k]??(()=>{});},set(o,k,v){o[k]=v;return true;}});return canvas;}};
const sourceModule=n=>import(pathToFileURL(path.join(root,'src',n+'.ts')));

async function buildWorld(){
 await R.init();
 const names=['terrain','scene','fullCampus','physics','transitFacilities','centralPlazaFacilities','administrationPlazaFacilities','informationCourtApproach','administrationPlazaGround','gyujanggakApproach'];
 const [terrainModule,gateModule,campusModule,physicsModule,transitModule,plazaModule,adminModule,informationModule,groundModule,gyujanggakModule]=await Promise.all(names.map(sourceModule));
 const json=f=>JSON.parse(read(f));
 const data=json('public/data/campus.json'),dem=json('public/data/terrain.json'),plan=json('public/data/campus-transit.json'),facilitiesPlan=json('public/data/transit-facilities.json');
 const originalRoads=data.roads.length;data.roads.push(...(plan.supplementalRoads??[]));
 const world=new THREE.Scene(),terrain=terrainModule.createTerrain(world,dem,data.buildings),gate=gateModule.createCampus(world,{full:true}),campus=campusModule.createFullCampus(world,data,terrain.heightAt);
 const facilities=[transitModule.createTransitFacilities(world,facilitiesPlan,terrain.heightAt),plazaModule.createCentralPlazaFacilities(world,terrain.heightAt),adminModule.createAdministrationPlazaFacilities(world,data,terrain.heightAt),informationModule.createInformationCourtApproach(world,terrain.heightAt),groundModule.createAdministrationPlazaGround(world,terrain.heightAt),gyujanggakModule.createGyujanggakApproach(world,terrain.heightAt)];
 world.updateMatrixWorld(true);
 return {world,terrain,data,campus,facilities,originalRoads,terrainWithoutParking:()=>terrainModule.createTerrain(new THREE.Scene(),dem,data.buildings,{educationParking:false}),makeSimulation(spawn){return new physicsModule.Simulation([...gate.breakables,...campus.breakables,...facilities.flatMap(f=>f.breakables)],[...gate.colliders,...campus.colliders],spawn,data.bounds,terrain);},update(point){campus.update(point);for(const f of facilities)f.update(point);}};
}

function sourceStillMatches(){return Object.fromEntries(Object.entries(hashes).map(([f,h])=>[f,sha(fs.readFileSync(path.join(root,f)))===h]));}

function movementTools(sim){
 const describe=c=>{const body=c.parent(),target=body?sim.targets.find(t=>t.body?.handle===body.handle):undefined;return {collider:c.handle,buildingId:target?.mesh.userData.buildingId??null,connectionId:target?.mesh.userData.connectionId??null,component:target?.mesh.userData.component??null,label:target?.label??(body?'unmapped body':'terrain or static')};};
 const contacts=()=>{const shape=sim.playerCollider.shape,position=sim.player.translation(),rotation=sim.playerCollider.rotation(),found=[];sim.world.intersectionsWithShape(position,rotation,shape,c=>{const hit=c.contactShape(shape,position,rotation,.02);if(hit&&hit.distance<-.01)found.push({...describe(c),penetration:-hit.distance,point:hit.point1});return true;},R.QueryFilterFlags.EXCLUDE_DYNAMIC,undefined,sim.playerCollider,sim.player);return found;};
 const blockers=()=>Array.from({length:sim.controller.numComputedCollisions()},(_,i)=>sim.controller.computedCollision(i)).filter(c=>c?.collider).map(c=>({...describe(c.collider),normal:c.normal1,point:c.witness1}));
 function walk(route){const segments=[];let maxPenetration=0;for(const dest of route){let stalled=0,frames=0,last=new THREE.Vector3().copy(sim.player.translation());for(;frames<1600;frames++){const p=sim.player.translation(),dx=dest.x-p.x,dz=dest.z-p.z,d=Math.hypot(dx,dz);if(d<.12)break;const speed=Math.min(6,d*60);sim.step(1/60,dx/d*speed,dz/d*speed,false);const q=new THREE.Vector3().copy(sim.player.translation());stalled=q.distanceTo(last)<.002?stalled+1:0;last=q;if(frames%10===0)for(const c of contacts())maxPenetration=Math.max(maxPenetration,c.penetration);if(stalled>120)break;}const p=sim.player.translation(),distance=Math.hypot(dest.x-p.x,dest.z-p.z);segments.push({dest,frames,end:{...p},distance,penetrations:contacts(),blockers:distance>.2?blockers():[]});if(distance>.2)break;}return {reached:segments.length===route.length&&segments.at(-1).distance<.2,maxPenetration,segments};}
 return {contacts,blockers,walk};
}

const output=path.join(root,'artifacts/education-north-access-test/results.json'),results=[];
fs.mkdirSync(path.dirname(output),{recursive:true});
const report={scope:'실제 전체 장면에서 원본 220 p1/p22 출입점, 외부 북측 보행로와 /347 계단을 검사한다. 사진에서 확인하지 못한 치수나 현장 표지 좌표를 정답으로 취급하지 않는다. Node의 Three.js와 Rapier 검사이며 브라우저 화면 또는 실제 기기 검증은 아니다.',results,harnessSha256:sha(fs.readFileSync(new URL(import.meta.url)))};
const must=(condition,message,details)=>{if(!condition)throw Object.assign(new Error(message),{details});};
const check=(name,fn)=>{try{results.push({name,status:'PASS',...fn()});console.log('PASS '+name);}catch(e){results.push({name,status:'FAIL',message:e.message,details:e.details});console.log('FAIL '+name+' '+e.message);}};
const vec=p=>Array.isArray(p)?new THREE.Vector3(...p):new THREE.Vector3(p.x,p.y??0,p.z);
const point=p=>new THREE.Vector3(p[0],0,p[1]),up=new THREE.Vector3(0,1,0),down=up.clone().negate(),H=p=>new THREE.Vector3(p.x,p.y,-p.z);
function offsetRoute(route,offset){return route.map((p,i)=>{const a=p.clone().sub(route[Math.max(0,i-1)]),b=route[Math.min(route.length-1,i+1)].clone().sub(p);a.y=b.y=0;if(!a.lengthSq())a.copy(b);if(!b.lengthSq())b.copy(a);a.normalize();b.normalize();const n1=new THREE.Vector3(a.z,0,-a.x),n2=new THREE.Vector3(b.z,0,-b.x),n=n1.clone().add(n2).normalize();return p.clone().addScaledVector(n,offset/Math.max(.5,n.dot(n1)));});}
function parseElements(xml){const attrs=s=>Object.fromEntries([...s.matchAll(/([\w:]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));return new Map([...xml.matchAll(/<(node|way|relation)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g)].map(m=>{const a=attrs(m[2]);return[m[1]+'/'+a.id,{type:m[1],...a,tags:Object.fromEntries([...((m[3]??'').matchAll(/<tag\b([^>]*?)\/>/g))].map(t=>{const v=attrs(t[1]);return[v.k,v.v];})),nodes:[...((m[3]??'').matchAll(/<nd\b([^>]*?)\/>/g))].map(n=>attrs(n[1]).ref)}];}));}
let sim;
try{
 read('src/main.ts');
 const env=await buildWorld(),{world,terrain,data}=env,id='way/297046999',building=data.buildings.find(b=>b.id===id),shell=world.children.find(o=>o.userData.buildingId===id&&o.userData.role==='building-shell'),access=shell?.userData.northAccess;
 must(access,'The registered 220 north access is missing from the full campus.');
 const raw=parseElements(read('sources/campus.osm').toString('utf8')),road=n=>data.roads.find(r=>r.id.endsWith('/'+n)),mapped338=road(338),mapped347=road(347),mapped205=road(205);
 must(mapped338&&mapped347&&mapped205,'An original northern route is missing.');
 const near=point(mapped338.points[3]).setY(terrain.heightAt(...mapped338.points[3])+1.8),far=near.clone().add(new THREE.Vector3(900,0,900));
 sim=env.makeSimulation(near);const moving=movementTools(sim);
 const meshes=[];world.traverse(m=>{if(m.isMesh&&!m.isInstancedMesh)meshes.push(m);});
 let bodyOwners=new Map();
 const update=p=>{env.update(p);world.updateMatrixWorld(true);};
 const focus=p=>{sim.setFocus(p,true);sim.world.step();bodyOwners=new Map(sim.targets.filter(t=>t.body).map(t=>[t.body.handle,t]));};
 const owner=c=>bodyOwners.get(c.parent()?.handle);
 const describe=t=>t?{buildingId:t.mesh.userData.buildingId??null,component:t.mesh.userData.component??null,facilityId:t.mesh.userData.facilityId??null}:null;
 const visible=m=>{for(let p=m;p;p=p.parent)if(!p.visible)return false;return true;};
 const render=(origin,direction,max)=>new THREE.Raycaster(world.scale.z<0?H(origin):origin,world.scale.z<0?H(direction):direction,0,max).intersectObjects(meshes.filter(visible),false);
 const cast=(origin,direction,max)=>sim.world.castRay(new R.Ray(origin,direction),max,true,R.QueryFilterFlags.EXCLUDE_DYNAMIC,undefined,sim.playerCollider,sim.player);
 const floor=p=>{const q=new THREE.Vector3(Math.fround(p.x),0,Math.fround(p.z)),ground=terrain.meshHeightAt(q.x,q.z),hint=Number.isFinite(p.y)&&p.y>ground-1?p.y:ground,origin=q.clone().setY(Math.fround(Math.max(ground,hint)+.65));focus(origin);let physical=cast(origin,down,3),shown=render(origin,down,3)[0];const firstTarget=physical&&owner(physical.collider);let probeRaisedFromFloor=false;
  // 새 계단이 원지면보다 높으면 실제 바닥 부품 위에서 다시 쏜다. 벽 안에서 시작한 광선은 그대로 실패한다.
  if(physical&&physical.timeOfImpact<=.005&&firstTarget&&surfaceComponents.has(firstTarget.mesh.userData.component)&&!/planter|wall/.test(firstTarget.mesh.userData.component)){origin.y=Math.fround(firstTarget.box.max.y+.65);physical=cast(origin,down,origin.y-ground+1);shown=render(origin,down,origin.y-ground+1)[0];probeRaisedFromFloor=true;}
  must(physical&&shown,'A route point has no rendered and physical floor.',{point:p.toArray(),ground});must(physical.timeOfImpact>.005,'The route floor probe starts inside a solid.',{point:p.toArray(),owner:describe(owner(physical.collider)),ground});return{point:q.setY(origin.y-physical.timeOfImpact),renderedY:shown.point.y,ground,physical,shown,target:owner(physical.collider),probeRaisedFromFloor};};
 const settle=p=>{const f=floor(p);sim.teleport(f.point.clone().addScaledVector(up,1.75));for(let i=0;i<60;i++)sim.step(1/60,0,0,false);must(!moving.contacts().length,'The route starts inside a fixed surface.',{point:p.toArray(),contacts:moving.contacts()});return f;};
 const reset=()=>{world.scale.z=1;sim.reset();update(near);};
 const verifyWalk=w=>{must(w.reached,'The full-scene northern route is blocked.',w);must(w.maxPenetration<.025,'The walking capsule penetrates a fixed surface.',w);must(w.segments.every(s=>!s.penetrations.length),'A route endpoint remains inside a solid.',w);};
 const doors=access.doors??[],doorTargets=new Map(doors.map(d=>[d.sourceNode,sim.targets.find(t=>t.mesh.userData.buildingId===id&&t.mesh.userData.component===d.component)]));
 const exterior=(access.exteriorRouteWorld??[]).map(vec),stairs=access.stairs,stairRoute=(stairs?.routeWorld??[]).map(vec),surfaceComponents=new Set(access.surfaceComponents??[]);
 if(exterior.length){const junction=point(mapped338.points[3]);junction.y=terrain.heightAt(junction.x,junction.z);if(junction.clone().setY(exterior[0].y).distanceTo(exterior[0])>.2)exterior.unshift(junction);}
 update(near);
 report.geometry={targets:sim.targets.length,northSurfaceComponents:[...surfaceComponents],originalRoadCount:env.originalRoads,roadCountWithSupplements:data.roads.length,maskedPolylineOverlay:access.maskedPolylineOverlay??null};
 report.rawRoutes=[mapped338,mapped347,mapped205];
 const exercisedRoutes=doors.map(d=>{const c=vec(d.center),n=vec(d.outward).setY(0).normalize(),start=d.sourceNode==='4531518011'?point(mapped338.points[4]):point(mapped205.points[0]);return[start.setY(c.y),c.clone().addScaledVector(n,.75),c,c.clone().addScaledVector(n,-2.3)];}).concat([exterior,stairRoute]);
 check('mapped p1 and p22 entrances stop intact capsules and open into short lobbies',()=>{
  const details=[];
  for(const spec of[{node:'4531518011',index:1,start:point(mapped338.points[4])},{node:'4514838231',index:22,start:point(mapped205.points[0])}]){
   const rawNode=raw.get('node/'+spec.node),rawBuilding=raw.get(id),door=doors.find(d=>d.sourceNode===spec.node),target=doorTargets.get(spec.node);
   must(rawNode?.tags.entrance==='yes'&&rawBuilding?.nodes[spec.index]===spec.node,'An entrance is not tied to its original building node.',spec);must(door&&target,'A mapped entrance has no destructible door.',spec);
   const center=vec(door.center),outward=vec(door.outward).setY(0).normalize(),tangent=vec(door.tangent).setY(0).normalize(),mapped=point(building.points[spec.index]),delta=center.clone().sub(mapped),along=delta.dot(tangent),recess=-delta.dot(outward);
   must(Math.abs(along)<.2&&Math.abs(recess)<1.6,'The door is displaced from its mapped entrance.',{spec,center:center.toArray(),along,recess});
   const inner=center.clone().addScaledVector(outward,-2.3),outside=center.clone().addScaledVector(outward,.75),base=[spec.start.clone().setY(center.y),outside,center,inner],paths=[];
   for(const offset of[-.5,0,.5]){reset();const route=base.map(p=>p.clone().addScaledVector(tangent,offset));settle(route[0]);const closed=moving.walk(route.slice(1));must(!closed.reached&&closed.segments.at(-1).blockers.some(b=>b.component===door.component),'The mapped entrance is open or a different wall blocks its approach.',closed);sim.hit(target,100,outward.clone().negate());update(near);const opened=moving.walk(route.slice(2));verifyWalk(opened);const returned=moving.walk(route.slice(0,-1).reverse());verifyWalk(returned);paths.push({offset,closed,opened,returned});}
   details.push({sourceNode:spec.node,rawTags:rawNode.tags,alongFacadeError:along,recess,paths});
  }
  return{speed:6,offsets:[-.5,0,.5],details,scope:'두 원본 현관과 각각 2.3m의 짧은 로비만 확인한다. 두 현관 사이 건물 내부 연결을 주장하지 않는다.'};
 });
 check('exterior northern path remains continuous while both entrance doors stay intact',()=>{
  must(exterior.length>=3,'The exterior route metadata is absent.');
  const west209=point(road(209).points.at(-1));must(exterior.some(p=>p.distanceTo(west209.clone().setY(p.y))<3),'The exterior route does not reach the mapped /209 western junction.');
  const details=[];
  for(const offset of[-.3,0,.3]){reset();const route=offsetRoute(exterior,offset);settle(route[0]);const forward=moving.walk(route.slice(1));verifyWalk(forward);const returned=moving.walk(route.slice(0,-1).reverse());verifyWalk(returned);must([...doorTargets.values()].every(t=>t&&t.hp>0&&t.mesh.visible),'Exterior travel required destroying an entrance door.');details.push({offset,forward,returned});}
  return{details,scope:'벽 밖의 연결 경로를 검사하며 원본 p1 현관 진입과 별도로 취급한다.'};
 });
 check('mapped 347 has real level treads and connects both original endpoints in both directions',()=>{
  must(stairs&&stairRoute.length>=2,'The mapped stair route is missing.');
  const first=point(mapped347.points[0]),last=point(mapped347.points.at(-1)),forward=stairRoute[0].distanceTo(first.clone().setY(stairRoute[0].y))<stairRoute[0].distanceTo(last.clone().setY(stairRoute[0].y)),route=forward?stairRoute:[...stairRoute].reverse();
  const mappedDistance=q=>Math.min(...route.slice(1).map((b,i)=>{const a=route[i],dx=b.x-a.x,dz=b.z-a.z,t=THREE.MathUtils.clamp(((q.x-a.x)*dx+(q.z-a.z)*dz)/(dx*dx+dz*dz),0,1);return Math.hypot(q.x-a.x-dx*t,q.z-a.z-dz*t);}));
  must(mappedDistance(first)<.08&&mappedDistance(last)<.08,'Stairs do not pass through both original /347 endpoints.',{first:mappedDistance(first),last:mappedDistance(last)});
  const actualTreads=[];
  for(const target of sim.targets.filter(t=>t.mesh.userData.buildingId===id&&(/step|tread/i.test(t.mesh.userData.component??''))&&(stairs.surfaceComponents??[]).includes(t.mesh.userData.component))){target.mesh.updateMatrixWorld(true);const p=target.mesh.geometry.getAttribute('position');for(let i=0;i<p.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(target.mesh.matrixWorld),b=new THREE.Vector3().fromBufferAttribute(p,i+1).applyMatrix4(target.mesh.matrixWorld),c=new THREE.Vector3().fromBufferAttribute(p,i+2).applyMatrix4(target.mesh.matrixWorld),n=b.clone().sub(a).cross(c.clone().sub(a));if(n.y<=1e-7||Math.abs(n.x)+Math.abs(n.z)>.001*n.y)continue;actualTreads.push({y:(a.y+b.y+c.y)/3,component:target.mesh.userData.component,area:n.length()/2});}}
  const levels=new Set(actualTreads.filter(t=>t.area>.03).map(t=>Math.round(t.y*1000)));must(levels.size>=8,'The mapped stairs have no meaningful sequence of actual level tread surfaces.',{levels:[...levels],triangles:actualTreads.length});
  const joinIndex=exterior.findIndex(p=>Math.hypot(p.x-route.at(-1).x,p.z-route.at(-1).z)<.1);must(joinIndex>=0,'The stair and exterior path metadata do not share a junction.');
  const continuous=[...route,...exterior.slice(joinIndex+1)],paths=[];
  for(const offset of[-.3,0,.3]){reset();const r=offsetRoute(continuous,offset);settle(r[0]);const up=moving.walk(r.slice(1));verifyWalk(up);const down=moving.walk(r.slice(0,-1).reverse());verifyWalk(down);must([...doorTargets.values()].every(t=>t&&t.hp>0&&t.mesh.visible),'The continuous exterior route required opening a door.');paths.push({offset,up,down});}
  return{rawTags:raw.get('way/456922959').tags,levelTreadCount:levels.size,horizontalTopTriangles:actualTreads.length,continuousRoute:continuous.map(p=>p.toArray()),paths,scope:'계단 아래 지면에서 /338 북단까지 문을 닫은 채 연속 왕복한다. 단수와 단높이가 사진 실측과 같다는 검사가 아니다.'};
 });
 check('walkable floors match rendering and leave the existing nearby road and terrain anchors unchanged',()=>{
  reset();for(const d of doors){sim.hit(doorTargets.get(d.sourceNode),100,vec(d.outward).negate());}update(near);
  const failures=[],samples=[],existingPathOverlays=[],boundaryChecks=[];let maximumFloorDifference=0,minimumHeadroom=Infinity;
  const stairSurfaces=new Set(stairs.surfaceComponents),outerEdges=new Map();
  // 단 경계는 두 디딤판과 수직 단면을 따로 확인한다. 경계의 수직 광선 결과를 내부 정밀도에 합산하지 않는다.
  for(const target of sim.targets.filter(t=>t.mesh.userData.buildingId===id&&stairSurfaces.has(t.mesh.userData.component))){
   const positions=target.mesh.geometry.attributes.position,edges=new Map();target.mesh.updateMatrixWorld(true);
   for(let i=0;i<positions.count;i+=3){const vs=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(positions,i+k).applyMatrix4(target.mesh.matrixWorld)),normal=vs[1].clone().sub(vs[0]).cross(vs[2].clone().sub(vs[0]));if(normal.y<=1e-8)continue;
    for(let j=0;j<3;j++){const a=vs[j],b=vs[(j+1)%3],key=[a,b].map(v=>v.toArray().map(x=>x.toFixed(5)).join(',')).sort().join('|'),entry=edges.get(key);if(entry)entry.count++;else edges.set(key,{a,b,count:1});}
   }
   outerEdges.set(target,[...edges.values()].filter(e=>e.count===1));
  }
  const boundaryCheck=f=>{
   if(!outerEdges.has(f.target))return null;
   let nearest;
   for(const edge of outerEdges.get(f.target)){const along=edge.b.clone().sub(edge.a).setY(0),lengthSq=along.lengthSq();if(lengthSq<1e-8)continue;const t=THREE.MathUtils.clamp(f.point.clone().sub(edge.a).setY(0).dot(along)/lengthSq,0,1),at=edge.a.clone().lerp(edge.b,t),distance=Math.hypot(at.x-f.point.x,at.z-f.point.z);if(!nearest||distance<nearest.distance)nearest={...edge,at,along:along.normalize(),distance};}
   if(!nearest||nearest.distance>.02)return null;
   const n=new THREE.Vector3(nearest.along.z,0,-nearest.along.x),sides=[-1,1].map(sign=>{const p=nearest.at.clone().addScaledVector(n,sign*.08),side=floor(p);return{sign,position:side.point,renderedY:side.renderedY,difference:Math.abs(side.point.y-side.renderedY),owner:describe(side.target),render:side.shown.object.name};});
   must(sides.every(s=>s.difference<=.025),'A stair boundary has an inaccurate adjacent tread interior.',{at:nearest.at.toArray(),sides});
   const sorted=[...sides].sort((a,b)=>a.position.y-b.position.y),low=sorted[0],high=sorted[1],height=high.position.y-low.position.y;
   must(height>.03&&height<.38,'A classified stair boundary has no walkable riser.',{height,sides});
   const origin=low.position.clone().setY((low.position.y+high.position.y)/2),direction=high.position.clone().sub(low.position).setY(0).normalize();focus(origin);
   const physical=cast(origin,direction,.25),shown=render(origin,direction,.25)[0],target=physical&&owner(physical.collider),difference=physical&&shown?Math.abs(physical.timeOfImpact-shown.distance):Infinity;
   must(physical&&shown&&stairSurfaces.has(target?.mesh.userData.component)&&difference<=.025,'A stair vertical face differs from its actual rendered riser.',{origin:origin.toArray(),direction:direction.toArray(),physical:physical?.timeOfImpact,rendered:shown?.distance,owner:describe(target),difference});
   return{originalPoint:f.point.toArray(),originalVerticalRayDifference:Math.abs(f.point.y-f.renderedY),distanceToActualTopBoundary:nearest.distance,boundaryPoint:nearest.at.toArray(),adjacentInteriorOffset:.08,adjacentInteriors:sides.map(s=>({...s,position:s.position.toArray()})),riser:{height,physical:physical.timeOfImpact,rendered:shown.distance,difference,owner:describe(target)},boundaryVerticalRayPrecisionChecked:false};
  };
  must(exercisedRoutes.length>=4&&exercisedRoutes.every(r=>r.length>=2),'The north access floor sampling paths are incomplete.');
  for(let routeIndex=0;routeIndex<exercisedRoutes.length;routeIndex++){const route=exercisedRoutes[routeIndex];for(let segment=1;segment<route.length;segment++){const a=route[segment-1],b=route[segment],dir=b.clone().sub(a).setY(0),length=dir.length(),side=new THREE.Vector3(dir.z,0,-dir.x).normalize(),count=Math.ceil(length/.6);for(let step=0;step<=count;step++)for(const offset of[-.3,0,.3]){
   const q=a.clone().lerp(b,step/Math.max(1,count)).addScaledVector(side,offset),f=floor(q),difference=Math.abs(f.point.y-f.renderedY),headOrigin=f.point.clone().addScaledVector(up,.06);focus(headOrigin);const head=cast(headOrigin,up,1.95),headroom=head?head.timeOfImpact+.06:null;
   const floorOrigin=f.point.clone().addScaledVector(up,.65),newFloor=sim.world.castRay(new R.Ray(floorOrigin,down),4,true,R.QueryFilterFlags.EXCLUDE_DYNAMIC,undefined,sim.playerCollider,sim.player,c=>surfaceComponents.has(owner(c)?.mesh.userData.component));
   const existingPathOverlay=!f.target&&!newFloor&&f.shown.object.name==='campus-pedestrian-surface'&&Math.abs(f.point.y-f.ground)<.005;
   const boundary=!existingPathOverlay&&difference>.025?boundaryCheck(f):null;
   if(boundary)boundaryChecks.push({routeIndex,segment,offset,...boundary});
   if(!existingPathOverlay&&!boundary)maximumFloorDifference=Math.max(maximumFloorDifference,difference);if(headroom!==null)minimumHeadroom=Math.min(minimumHeadroom,headroom);
   const sample={routeIndex,segment,offset,point:f.point.toArray(),physical:describe(f.target),render:f.shown.object.name,difference,groundClearance:f.point.y-f.ground,headroom,existingPathOverlay,stairBoundary:!!boundary};samples.push(sample);if(existingPathOverlay)existingPathOverlays.push(sample);
   if(!existingPathOverlay&&!boundary&&difference>.025||headroom!==null&&headroom<1.8||f.point.y<f.ground-.005)failures.push(sample);
  }}}
  must(!failures.length,'An exercised walking surface differs from rendering or loses capsule clearance.',{maximumFloorDifference,failures:failures.slice(0,20)});
  const anchors=[{point:[424.76,-172.23],y:26.012195014424623},{point:[458.06,-188.79],y:37.669855196045816},{point:[470.51,-166.52],y:33.07390879631043},{point:[504.36,-184.03],y:38.45976203845688},{point:[518.71,-175.51],y:36.310878031974845},{point:[566.52,-87.88],y:34.47007471229199}],unmodifiedTerrain=env.terrainWithoutParking(),parkingCorrection=terrain.mesh.userData.educationParkingCorrection,terrainChecks=anchors.map(a=>({...a,actual:terrain.meshHeightAt(...a.point),withoutParking:unmodifiedTerrain.meshHeightAt(...a.point),authorizedParkingCut:parkingCorrection?.id==='education-220-parking-approach'&&a.point[0]===518.71&&a.point[1]===-175.51}));
  must(terrainChecks.every(a=>Math.abs(a.withoutParking-a.y)<.00001&&(a.authorizedParkingCut||Math.abs(a.actual-a.y)<.00001)),'The feature changed a protected terrain anchor outside the explicit parking cut.',terrainChecks);
  assert.deepEqual(road(659).points,[[518.71,-175.51],[566.52,-87.88]],'The original service road moved.');assert.equal(road(659).width,5.5);assert.deepEqual(mapped347.points,[[424.76,-172.23],[458.06,-188.79]],'The original stair route moved.');
  return{samples:samples.length,precisionCheckedSamples:samples.length-existingPathOverlays.length-boundaryChecks.length,maximumFloorDifference,minimumHeadroom:Number.isFinite(minimumHeadroom)?minimumHeadroom:null,terrainChecks,existingPathOverlays,boundaryChecks,boundaryScope:'실제 단 경계에서 2cm 이내인 광선 불일치는 양쪽 8cm 내부와 수직 단면을 각각 2.5cm 기준으로 확인한다. 경계의 수직 광선 정밀도는 통과로 집계하지 않는다. 일부 1cm 옆에서도 Rapier가 윗단을 선택했으며 이를 Float32 반올림만으로 설명하지 않는다.',scope:'실제 걸은 중심선과 좌우 0.3m의 새 바닥 내부를 2.5cm 기준으로 대조한다. 새 바닥 부품이 없는 원지면 구간의 기존 보행 표시는 따로 기록한다. 표지와 복합 시설 외피도 바닥 정밀도 수치에 포함하지 않는다.'};
 });
 check('one H distant damage holes and two resets preserve the actual entrance and a nearby facility',()=>{
  reset();const d=doors.find(d=>d.sourceNode==='4531518011'),door=doorTargets.get(d.sourceNode),center=vec(d.center),outward=vec(d.outward).normalize(),ray={origin:center.clone().addScaledVector(outward,.7).addScaledVector(up,1.2),direction:outward.clone().negate(),max:1.3};focus(ray.origin);
  const physical=cast(ray.origin,ray.direction,ray.max),shown=render(ray.origin,ray.direction,ray.max)[0];must(physical&&shown&&owner(physical.collider)===door,'The mapped entrance ray hits a residual wall.');must(Math.abs(physical.timeOfImpact-shown.distance)<.08,'The door frame and glass differ too far from their collision surface.');
  const signComponent=access.facilities?.[0]?.signComponent,facility=sim.targets.find(t=>t.mesh.userData.buildingId===id&&t.mesh.userData.component===signComponent);must(facility,'No representative northern facility exists.');
  let fixture;const pos=facility.mesh.geometry.attributes.position;facility.mesh.updateMatrixWorld(true);for(let i=0;i<pos.count;i+=3){const v=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(pos,i+k).applyMatrix4(facility.mesh.matrixWorld)),n=v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])).normalize();if(Math.abs(n.y)>.7)continue;const c=v[0].clone().add(v[1]).add(v[2]).multiplyScalar(1/3),o=c.clone().addScaledVector(n,.6);focus(o);const hit=cast(o,n.clone().negate(),1),rendered=render(o,n.clone().negate(),1)[0];if(hit&&rendered&&owner(hit.collider)===facility){fixture={origin:o,direction:n.clone().negate(),max:1,physical:hit.timeOfImpact,rendered:rendered.distance};break;}}
  must(fixture,'A representative facility has no exposed rendered and physical face.');
  const selected=[{target:door,ray,physical:physical.timeOfImpact,rendered:shown.distance,precisionLimit:.08},{target:facility,ray:fixture,physical:fixture.physical,rendered:fixture.rendered,precisionLimit:null}];
  for(const s of selected){sim.setFocus(far,true);const h=sim.castUnloadedTargets(s.ray.origin,s.ray.direction,s.ray.max);must(h?.target===s.target&&Math.abs(h.distance-s.physical)<.002,'Loaded and unloaded north access collision differs.');}
  world.scale.z=-1;update(near);for(const s of selected){const h=render(s.ray.origin,s.ray.direction,s.ray.max)[0];must(h&&Math.abs(h.distance-s.rendered)<.001,'One H changes an actual north access surface.');sim.hit(s.target,100,s.ray.direction);}update(near);
  for(const distance of[279,281,900]){const away=near.clone().add(new THREE.Vector3(distance,0,distance));sim.setFocus(away,true);update(away);for(const s of selected){const limit=Math.min(s.physical,s.rendered)+.015;must(!sim.castUnloadedTargets(s.ray.origin,s.ray.direction,limit),'Destroyed northern collision returns at distance.',{distance,component:s.target.mesh.userData.component});must(!render(s.ray.origin,s.ray.direction,limit).length,'Destroyed northern rendering returns at distance.',{distance,component:s.target.mesh.userData.component});}}
  for(let cycle=0;cycle<2;cycle++){sim.reset();update(near);for(const s of selected){focus(s.ray.origin);const h=cast(s.ray.origin,s.ray.direction,s.ray.max),v=render(s.ray.origin,s.ray.direction,s.ray.max)[0];must(h&&v&&owner(h.collider)===s.target,'Reset did not restore a northern facility or entrance.');if(cycle===0)sim.hit(s.target,100,s.ray.direction);}update(near);}
  return{door:{rendered:shown.distance,physical:physical.timeOfImpact,limit:.08},facility:{component:facility.mesh.userData.component,rendered:fixture.rendered,physical:fixture.physical,surfaceDifference:Math.abs(fixture.rendered-fixture.physical),precisionChecked:false,scope:'시설의 실제 렌더 존재, 충돌 소유자, 로드와 미로드 일치 및 파괴 복구만 검사한다. 복합 외피의 정밀표면 통과로 집계하지 않는다.'},distances:[279,281,900],resetCycles:2};
 });
}catch(e){results.push({name:'full campus north access registration',status:'FAIL',message:e.message,details:e.details});console.log('FAIL '+e.message);}
finally{if(sim){sim.world.removeCharacterController(sim.controller);sim.world.free();}const matches=sourceStillMatches();fs.writeFileSync(output,JSON.stringify({...report,hashes,sourceStillMatches:matches},null,2)+'\n');if(results.some(r=>r.status==='FAIL')||Object.values(matches).some(v=>!v))process.exitCode=1;}
