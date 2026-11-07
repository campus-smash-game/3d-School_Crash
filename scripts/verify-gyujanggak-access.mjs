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
 const names=['terrain','scene','fullCampus','physics','transitFacilities','centralPlazaFacilities','administrationPlazaFacilities','informationCourtApproach','administrationPlazaGround'];
 const [terrainModule,gateModule,campusModule,physicsModule,transitModule,plazaModule,adminModule,informationModule,groundModule]=await Promise.all(names.map(sourceModule));
 const json=f=>JSON.parse(read(f));
 const data=json('public/data/campus.json'),dem=json('public/data/terrain.json'),plan=json('public/data/campus-transit.json'),facilitiesPlan=json('public/data/transit-facilities.json');
 const originalRoads=data.roads.length;data.roads.push(...(plan.supplementalRoads??[]));
 const world=new THREE.Scene(),terrain=terrainModule.createTerrain(world,dem,data.buildings),gate=gateModule.createCampus(world,{full:true}),campus=campusModule.createFullCampus(world,data,terrain.heightAt);
 const facilities=[transitModule.createTransitFacilities(world,facilitiesPlan,terrain.heightAt),plazaModule.createCentralPlazaFacilities(world,terrain.heightAt),adminModule.createAdministrationPlazaFacilities(world,data,terrain.heightAt),informationModule.createInformationCourtApproach(world,terrain.heightAt),groundModule.createAdministrationPlazaGround(world,terrain.heightAt)];
 world.updateMatrixWorld(true);
 return {world,terrain,data,campus,facilities,originalRoads,makeSimulation(spawn){return new physicsModule.Simulation([...gate.breakables,...campus.breakables,...facilities.flatMap(f=>f.breakables)],[...gate.colliders,...campus.colliders],spawn,data.bounds,terrain);},update(point){campus.update(point);for(const f of facilities)f.update(point);}};
}

function sourceStillMatches(){return Object.fromEntries(Object.entries(hashes).map(([f,h])=>[f,sha(fs.readFileSync(path.join(root,f)))===h]));}

function movementTools(sim){
 const describe=c=>{const body=c.parent(),target=body?sim.targets.find(t=>t.body?.handle===body.handle):undefined;return {collider:c.handle,buildingId:target?.mesh.userData.buildingId??null,connectionId:target?.mesh.userData.connectionId??null,component:target?.mesh.userData.component??null,label:target?.label??(body?'unmapped body':'terrain or static')};};
 const contacts=()=>{const shape=sim.playerCollider.shape,position=sim.player.translation(),rotation=sim.playerCollider.rotation(),found=[];sim.world.intersectionsWithShape(position,rotation,shape,c=>{const hit=c.contactShape(shape,position,rotation,.02);if(hit&&hit.distance<-.01)found.push({...describe(c),penetration:-hit.distance,point:hit.point1});return true;},R.QueryFilterFlags.EXCLUDE_DYNAMIC,undefined,sim.playerCollider,sim.player);return found;};
 const blockers=()=>Array.from({length:sim.controller.numComputedCollisions()},(_,i)=>sim.controller.computedCollision(i)).filter(c=>c?.collider).map(c=>({...describe(c.collider),normal:c.normal1,point:c.witness1}));
 function walk(route){const segments=[];let maxPenetration=0;for(const dest of route){let stalled=0,frames=0,last=new THREE.Vector3().copy(sim.player.translation());for(;frames<1600;frames++){const p=sim.player.translation(),dx=dest.x-p.x,dz=dest.z-p.z,d=Math.hypot(dx,dz);if(d<.12)break;const speed=Math.min(6,d*60);sim.step(1/60,dx/d*speed,dz/d*speed,false);const q=new THREE.Vector3().copy(sim.player.translation());stalled=q.distanceTo(last)<.002?stalled+1:0;last=q;if(frames%10===0)for(const c of contacts())maxPenetration=Math.max(maxPenetration,c.penetration);if(stalled>120)break;}const p=sim.player.translation(),distance=Math.hypot(dest.x-p.x,dest.z-p.z);segments.push({dest,frames,end:{...p},distance,penetrations:contacts(),blockers:distance>.2?blockers():[]});if(distance>.2)break;}return {reached:segments.length===route.length&&segments.at(-1).distance<.2,maxPenetration,segments};}
 return {contacts,blockers,walk};
}


const results=[],output=path.join(root,'artifacts/gyujanggak-review/controls-fullscene-access-results.json');
fs.mkdirSync(path.dirname(output),{recursive:true});
const report={candidate:process.argv[2]??'current-source',scope:'실제 전체 캠퍼스와 지형, 현재 시설 및 Rapier를 쓰는 독립 Node 검사다. 사진 정합, 실제 WebGL 화면과 휴대전화 성능은 이 검사로 확인하지 않는다.',results};
const hash=b=>createHash('sha256').update(b).digest('hex');
report.harnessSha256=hash(fs.readFileSync(new URL(import.meta.url)));
hashes['src/main.ts']=hash(fs.readFileSync(path.join(root,'src/main.ts')));
function check(name,fn){try{results.push({name,status:'PASS',...fn()});console.log('PASS '+name);}catch(e){results.push({name,status:'FAIL',message:String(e.message),details:e.details});console.log('FAIL '+name+' '+e.message);}}
function must(value,message,details){if(!value)throw Object.assign(new Error(message),{details});}
const point=p=>Array.isArray(p)?new THREE.Vector3(...p):new THREE.Vector3(p.x,p.y??0,p.z);
const xzDistance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const compactWalk=w=>({reached:w.reached,maxPenetration:w.maxPenetration,last:w.segments.at(-1)});

// 경로 메타는 검사 위치를 고른다. 통과 판정은 실제 메시와 캡슐 이동으로 확인한다.
// 기존 차양 위치나 이전 테라스 높이를 새 현관의 정답으로 쓰지 않는다.
function accessContract(shell,facilities){
 const entry=shell.userData.entrance,access=facilities?.shell?.userData.access??shell.userData.access;
 must(entry&&access,'The new entrance and access metadata must be available before this test runs.');
 return {entry,access};
}

function verifyWalkHeight(w,terrain){
 for(const s of w.segments){
  const floor=s.dest.y,delta=s.end.y-floor;
  must(Number.isFinite(floor)&&delta>.62&&delta<1.48,'The capsule reached XZ at the wrong floor height.',{dest:s.dest,end:s.end,centerAboveExpectedFloor:delta,terrain:terrain.heightAt(s.end.x,s.end.z)});
  must(s.penetrations.length===0,'The capsule ends inside a fixed object.',s.penetrations);
 }
}

function inspectVehicleLanes(sim,traffic,targets,plan){
 const roadIds=['way/456487335/264','way/456487337/266'];
 const edges=traffic.edges.filter(e=>roadIds.includes(e.roadId));
 must(edges.length>0,'Actual /264 and /266 edges must be present.');
 const representative=traffic.vehicles.find(v=>v.kind==='car');
 must(representative,'The current traffic must contain a car.');
 const vehicle={...representative,position:new THREE.Vector3(),quaternion:new THREE.Quaternion(),forward:new THREE.Vector3(),width:1.82,height:1.86,length:4.3};
 const shape=new R.Cuboid(vehicle.width/2,vehicle.height/2,vehicle.length/2),collisions=[];
 let samples=0;
 const inspect=(mode,edgeId,fraction)=>{
  traffic.pose(vehicle);sim.setFocus(vehicle.position,true);sim.world.step();
  const owners=new Map(targets.filter(t=>t.body).map(t=>[t.body.handle,t]));
  const center=new THREE.Vector3(0,vehicle.height/2,0).applyQuaternion(vehicle.quaternion).add(vehicle.position);
  sim.world.intersectionsWithShape(center,vehicle.quaternion,shape,c=>{
   const body=c.parent(),target=body&&owners.get(body.handle);if(!target)return true;
   const contact=c.contactShape(shape,center,vehicle.quaternion,0);
   if(contact&&contact.distance<-.005)collisions.push({mode,edgeId,fraction,component:target.mesh.userData.component,facilityId:target.mesh.userData.facilityId??null,position:vehicle.position.toArray(),penetration:-contact.distance});
   return true;
  });samples++;
 };
 for(const edge of edges){
  vehicle.edge=edge;vehicle.next=edge.reverse;vehicle.turn=null;
  for(let d=0;d<=edge.length;d+=.75){vehicle.distance=d;inspect('straight',edge.id,d/edge.length);}
 }
 const legal=edge=>{const candidates=edge.b.edges.filter(e=>e.allowed),other=candidates.filter(e=>e!==edge.reverse);return other.length?other:candidates;};
 const turns=new Map();
 for(const edge of edges){
  for(const next of legal(edge))turns.set(edge.id+':'+next.id,[edge,next]);
  for(const incoming of traffic.edges.filter(e=>e.allowed&&e.b===edge.a))if(legal(incoming).includes(edge))turns.set(incoming.id+':'+edge.id,[incoming,edge]);
 }
 for(const [key,[edge,next]]of turns){
  vehicle.edge=edge;vehicle.next=next;vehicle.turn=null;vehicle.distance=edge.length-traffic.trim(vehicle);traffic.startTurn(vehicle);
  for(let i=0;i<=24;i++){vehicle.turn.distance=vehicle.turn.length*i/24;inspect('turn',key,i/24);}
 }
 must(collisions.length===0,'The new facade or roadside objects enter actual car lane poses.',{samples,collisions:collisions.slice(0,20)});
 return {roadIds,edges:edges.length,legalTurns:turns.size,samples,collisions:0,vehicleEnvelope:{width:vehicle.width,length:vehicle.length,height:vehicle.height},confirmedBusRoutes:plan.routes.filter(r=>r.segments.some(s=>roadIds.includes(s.roadId))).map(r=>r.id),scope:'현재 Traffic의 실제 차로와 회전 곡선에 택시 높이의 승용차 외접 상자를 놓았다. 실차 배차나 실제 도로 운영을 검증하지 않았다.'};
}

let sim,traffic;
try{
 const env=await buildWorld(),{world,campus,terrain,data}=env;
 const {createGyujanggakApproach}=await import(pathToFileURL(path.join(root,'src/gyujanggakApproach.ts')));
 const facilities=createGyujanggakApproach(world,terrain.heightAt);env.facilities.push(facilities);
 const id='way/238935852',shell=world.children.find(o=>o.userData.buildingId===id&&o.userData.role==='building-shell');
 assert(shell,'Actual fullCampus must contain the Gyujanggak shell.');
 const {entry,access}=accessContract(shell,facilities);
 report.contract={entry,access};
 const doorPoint=entry.world?point(entry.world):new THREE.Vector3(entry.x,entry.floor,entry.z);
 const outward=point(entry.outward).normalize(),across=new THREE.Vector3(outward.z,0,-outward.x);
 const routes=access.routes.map(r=>({...r,points:r.points.map(point)}));
 const inside=point(entry.inside??access.inside??routes[0].points.at(-1));
 if(!routes.some(r=>r.roadId==='way/456487337/266')){
  const road=data.roads.find(r=>r.id==='way/456487337/266'),start=road.points[0],bend=[180,-419];
  routes.push({roadId:road.id,source:'독립 검사 경로: 실제 도로 북단에서 앞마당을 거쳐 확인된 현관 정면 접점으로 합류한다. 측량 동선은 아니다.',points:[new THREE.Vector3(start[0],terrain.heightAt(...start)+.035,start[1]),new THREE.Vector3(bend[0],terrain.heightAt(...bend)+.035,bend[1]),...routes[0].points.slice(2).map(p=>p.clone())]});
 }
 must(routes.some(r=>r.roadId==='way/456487335/264')&&routes.some(r=>r.roadId==='way/456487337/266'),'Both actual road approaches must be included.');
 must([doorPoint,inside,outward].every(v=>v.toArray().every(Number.isFinite)),'Entrance vectors are incomplete.');
 const spawn=routes[0].points[0].clone().add(new THREE.Vector3(0,1.7,0));
 sim=env.makeSimulation(spawn);const walking=movementTools(sim);
 const components=entry.components??[entry.component],doors=sim.targets.filter(t=>t.mesh.userData.buildingId===id&&components.includes(t.mesh.userData.component));
 must(doors.length>0,'Actual door targets must be identified by the entrance contract.');
 const ownTargets=sim.targets.filter(t=>t.mesh.userData.buildingId===id||t.mesh.userData.facilityId===facilities.shell.userData.facilityId);
 report.geometry={campusTargets:sim.targets.length,roads:data.roads.length,originalRoads:env.originalRoads,buildingParts:sim.targets.filter(t=>t.mesh.userData.buildingId===id).length,facilityParts:facilities.breakables.length,facilityMeshes:facilities.shell.children.length,doorComponents:components};
 const near=doorPoint.clone().addScaledVector(outward,5),far=near.clone().add(new THREE.Vector3(900,0,0));
 const update=p=>{env.update(p);world.updateMatrixWorld(true);};
 const settle=start=>{sim.teleport(start.clone().add(new THREE.Vector3(0,1.7,0)));for(let i=0;i<30;i++)sim.step(1/60,0,0,false);};
 const reset=()=>{sim.reset();update(near);};
 const destroyDoors=()=>{for(const t of doors)sim.hit(t,100,outward.clone().negate());update(near);};
 const pathFor=(route,offset=0)=>{const p=route.points.slice(1);if(xzDistance(p.at(-1),inside)>.01)p.push(doorPoint,inside);return p.filter((v,i,a)=>i===0||xzDistance(v,a[i-1])>.01).map((v,i,a)=>i>=a.length-3?v.clone().addScaledVector(across,offset):v.clone());};
 const compact=walk=>({reached:walk.reached,maxPenetration:walk.maxPenetration,last:walk.segments.at(-1)});
 check('two real road approaches reach only the closed entrance door',()=>{
  const details=[];
  for(const route of routes){
   reset();settle(route.points[0]);must(walking.contacts().length===0,'Initial capsule overlaps the full scene.',{road:route.roadId,contacts:walking.contacts()});
   const walk=walking.walk(pathFor(route));
   must(!walk.reached&&walk.segments.at(-1).blockers.some(b=>components.includes(b.component)),'The closed approach stops at an unexpected obstacle or passes through the door.',{road:route.roadId,walk:compact(walk)});
   details.push({roadId:route.roadId,walk});
  }
  return {details};
 });
 check('door destruction opens continuous centre and side return paths at 6 m/s',()=>{
  const details=[];
  for(const route of routes)for(const offset of[-.65,0,.65]){
   reset();destroyDoors();settle(route.points[0]);const path=pathFor(route,offset),forward=walking.walk(path),backward=forward.reached?walking.walk(path.slice(0,-1).reverse().concat(route.points[0])):null;
   must(forward.reached&&backward?.reached,'The open full-scene route cannot be completed in both directions.',{road:route.roadId,offset,forward:compact(forward),backward:backward&&compact(backward)});
   verifyWalkHeight(forward,terrain);verifyWalkHeight(backward,terrain);
   must(Math.max(forward.maxPenetration,backward.maxPenetration)<.025,'The return path penetrates a fixed surface.',{road:route.roadId,offset,forward:forward.maxPenetration,backward:backward.maxPenetration});
   details.push({roadId:route.roadId,offset,forward,backward});
  }
  return {speed:6,continuousWithoutReturnTeleport:true,details};
 });
 check('actual walking surfaces agree with floor metadata and loaded collision',()=>{
  reset();destroyDoors();const meshes=[];world.traverse(o=>{if(o.isMesh&&!o.isInstancedMesh&&o.visible)meshes.push(o);});
  const points=[...routes.flatMap(r=>pathFor(r)),inside],samples=[];
  for(const p of points){
   sim.setFocus(p,true);sim.world.step();const rayStart=p.clone().add(new THREE.Vector3(0,.4,0)),down=new THREE.Vector3(0,-1,0);
   const rendered=new THREE.Raycaster(rayStart,down,0,1).intersectObjects(meshes,false)[0];
   const physical=sim.world.castRay(new R.Ray(rayStart,down),1,true,R.QueryFilterFlags.EXCLUDE_DYNAMIC,undefined,sim.playerCollider,sim.player);
   must(rendered&&physical,'The walking path lacks a real surface or collider.',{point:p.toArray(),render:!!rendered,physical:!!physical});
   const physicsY=rayStart.y-physical.timeOfImpact;
   must(Math.abs(rendered.point.y-physicsY)<.20&&Math.abs(physicsY-p.y)<.25,'The walking surface and collider differ too much.',{point:p.toArray(),renderY:rendered.point.y,physicsY});
   samples.push({point:p.toArray(),renderY:rendered.point.y,physicsY,mesh:rendered.object.name});
  }
  return {samples};
 });
 check('door surface damage distance H reflection and reset stay consistent',()=>{
  reset();const rayStart=doorPoint.clone().add(new THREE.Vector3(0,1.2,0)).addScaledVector(outward,.8),direction=outward.clone().negate(),meshes=[];shell.traverse(o=>{if(o.isMesh)meshes.push(o);});
  const render=()=>{const p=rayStart.clone(),d=direction.clone();if(world.scale.z<0){p.z=-p.z;d.z=-d.z;}world.updateMatrixWorld(true);return new THREE.Raycaster(p,d,0,1.6).intersectObjects(meshes,false)[0];};
  sim.setFocus(rayStart,true);sim.world.step();const owners=new Set(doors.filter(t=>t.body).map(t=>t.body.handle));
  const loaded=sim.world.castRay(new R.Ray(rayStart,direction),1.6,true,undefined,undefined,undefined,undefined,c=>!!c.parent()&&owners.has(c.parent().handle));
  const visible=render();must(loaded&&visible,'The intact real door must be rendered and collide.');
  must(Math.abs(loaded.timeOfImpact-visible.distance)<.12,'The door proxy differs from its real rendered surface.',{loaded:loaded.timeOfImpact,rendered:visible.distance});
  sim.setFocus(far,true);const unloaded=sim.castUnloadedTargets(rayStart,direction,1.6);must(unloaded&&doors.includes(unloaded.target),'Unloaded door ray selects the wrong object.');
  must(Math.abs(unloaded.distance-loaded.timeOfImpact)<.002,'Loaded and unloaded door surfaces differ.');
  world.scale.z=-1;update(near);const reflected=render();must(reflected&&Math.abs(reflected.distance-visible.distance)<.001,'H changes the actual door surface.');
  destroyDoors();
  for(const p of[near.clone().add(new THREE.Vector3(279,0,0)),near.clone().add(new THREE.Vector3(281,0,0)),far]){update(p);sim.setFocus(p,true);must(!sim.castUnloadedTargets(rayStart,direction,1.6),'A destroyed door returns in remote collision.');must(!render(),'A destroyed door returns in the actual visible mesh.');}
  settle(routes[0].points[0]);const route=pathFor(routes[0]),forward=walking.walk(route),backward=forward.reached?walking.walk(route.slice(0,-1).reverse().concat(routes[0].points[0])):null;
  must(forward.reached&&backward?.reached,'H changes the physical return route.',{forward:compact(forward),backward:backward&&compact(backward)});verifyWalkHeight(forward,terrain);verifyWalkHeight(backward,terrain);
  reset();const restored=render();must(restored&&Math.abs(restored.distance-visible.distance)<.001&&doors.every(t=>t.hp===t.toughness),'Reset failed to restore door rendering or health.');
  return {loadedRenderDifference:Math.abs(loaded.timeOfImpact-visible.distance),loadedUnloadedDifference:Math.abs(unloaded.distance-loaded.timeOfImpact),reflectionDifference:Math.abs(reflected.distance-visible.distance),distances:[279,281,900],returnAfterReflection:true,resetRestored:true};
 });
 const {Traffic}=await import(pathToFileURL(path.join(root,'src/traffic.ts')));
 const plan=JSON.parse(fs.readFileSync(path.join(root,'public/data/campus-transit.json')));traffic=new Traffic(new THREE.Scene(),data.roads,terrain.heightAt,plan);
 check('new facade and approach facilities clear actual two-way car lanes and turns',()=>{reset();return inspectVehicleLanes(sim,traffic,ownTargets,plan);});
 check('paving stays above real terrain outside the road and sign owners restore their labels',()=>{
  reset();assert.equal(facilities.shell.children.filter(o=>o.isMesh).length,3);
  const paving=facilities.shell.getObjectByName('gyujanggak-block-paving'),signs=facilities.shell.getObjectByName('gyujanggak-directory-and-bulletin-faces');
  assert(paving&&signs);assert.equal(paving.userData.physicalCollider,false);
  const position=paving.geometry.getAttribute('position'),roads=data.roads.filter(r=>['way/456487335/264','way/456487337/266'].includes(r.id));
  const distance=(p,a,b)=>{const dx=b[0]-a[0],dz=b[1]-a[1],t=THREE.MathUtils.clamp(((p.x-a[0])*dx+(p.z-a[1])*dz)/(dx*dx+dz*dz),0,1);return Math.hypot(p.x-a[0]-t*dx,p.z-a[1]-t*dz);};
  let min=Infinity,max=-Infinity,roadMargin=Infinity,roadMarginSample=null,samples=0;
  for(let i=0;i<position.count;i+=3){
   const vertices=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(position,i+j));
   for(const weights of[[1,0,0],[0,1,0],[0,0,1],[1/3,1/3,1/3],[.2,.3,.5]]){
    const p=vertices[0].clone().multiplyScalar(weights[0]).addScaledVector(vertices[1],weights[1]).addScaledVector(vertices[2],weights[2]),clear=p.y-terrain.meshHeightAt(p.x,p.z);min=Math.min(min,clear);max=Math.max(max,clear);samples++;
    for(const road of roads)for(let j=1;j<road.points.length;j++){const margin=distance(p,road.points[j-1],road.points[j])-road.width/2;if(margin<roadMargin){roadMargin=margin;roadMarginSample={roadId:road.id,segment:j-1,point:p.toArray(),margin};}}
   }
  }
  must(samples>0&&min>.034&&max<.036,'Paving triangles do not follow the actual terrain surface at +0.035 m.',{samples,min,max});
  must(roadMargin>.28,'Paving enters the mapped traffic road width.',{roadMargin,roadMarginSample});
  const link=facilities.shell.userData.linkPolygon;must(link?.length===4,'The forecourt and sidewalk connector is missing.');
  const corners=link.map(p=>new THREE.Vector3(p[0],0,p[1])),a=corners[0].clone().add(corners[1]).multiplyScalar(.5),b=corners[2].clone().add(corners[3]).multiplyScalar(.5),direction=b.clone().sub(a).normalize();
  const from=a.clone().addScaledVector(direction,-.6),to=b.clone().addScaledVector(direction,.6);for(const p of[from,to])p.y=terrain.meshHeightAt(p.x,p.z)+.035;
  const linkSamples=[];world.updateMatrixWorld(true);
  const n=Math.ceil(xzDistance(from,to)/.25);for(let i=0;i<=n;i++){
   const p=from.clone().lerp(to,i/n);p.y=terrain.meshHeightAt(p.x,p.z)+.5;const query=p.clone();if(world.scale.z<0)query.z=-query.z;
   const hit=new THREE.Raycaster(query,new THREE.Vector3(0,-1,0),0,1).intersectObject(paving,false)[0];must(hit,'The forecourt-to-sidewalk centreline crosses unpaved ground.',{sample:p.toArray(),fraction:i/n});linkSamples.push([p.x,hit.point.y,p.z]);
  }
  settle(from);const linkForward=walking.walk([to]),linkBackward=linkForward.reached?walking.walk([from]):null;
  must(linkForward.reached&&linkBackward?.reached,'A roadside object blocks the forecourt-to-sidewalk connector.',{forward:compact(linkForward),backward:linkBackward&&compact(linkBackward)});
  assert.equal(signs.material.map.name,'gyujanggak-observed-name-and-generic-notices');
  const texts=signs.material.map.image.textCalls.map(c=>c[0]);must(texts.includes('103')&&texts.includes('규장각한국학연구원'),'Observed readable name is missing from the generated atlas.',{texts});
  const pos=signs.geometry.getAttribute('position'),uv=signs.geometry.getAttribute('uv');
  const counts=()=>{const values={directory:0,bulletin:0};for(let i=0;i<pos.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(pos,i),b=new THREE.Vector3().fromBufferAttribute(pos,i+1),c=new THREE.Vector3().fromBufferAttribute(pos,i+2);if(b.sub(a).cross(c.sub(a)).lengthSq()<1e-10)continue;values[(uv.getX(i)+uv.getX(i+1)+uv.getX(i+2))/3<.5?'directory':'bulletin']++;}return values;};
  const before=counts(),owner=ownTargets.find(t=>t.mesh.userData.component==='directory-frame');assert(owner&&before.directory>0&&before.bulletin>0);
  sim.hit(owner,100,outward.clone().negate());update(near);const damaged=counts();must(damaged.directory===0&&damaged.bulletin===before.bulletin,'Destroying one frame hides the wrong atlas range.',{before,damaged});
  update(far);assert.deepEqual(counts(),damaged);reset();assert.deepEqual(counts(),before);
  const projections=[];world.updateMatrixWorld(true);
  for(const board of facilities.shell.userData.boards){
   const slot=board.name==='directory'?0:1,values=[];for(let i=0;i<pos.count;i++)if((slot===0?uv.getX(i)<=.5:uv.getX(i)>=.5)){const p=new THREE.Vector3().fromBufferAttribute(pos,i);if(Math.hypot(p.x-board.position[0],p.z-board.position[2])<board.width)values.push({p:p.applyMatrix4(signs.matrixWorld),u:uv.getX(i)});}
   const minU=Math.min(...values.map(v=>v.u)),maxU=Math.max(...values.map(v=>v.u));
   const center=new THREE.Vector3(...board.position).add(new THREE.Vector3(0,.65+board.height/2,0)),normal=new THREE.Vector3(...board.front);if(world.scale.z<0){center.z=-center.z;normal.z=-normal.z;}
   const camera=new THREE.PerspectiveCamera(60,1,.1,100);camera.position.copy(center).addScaledVector(normal,8);camera.lookAt(center);camera.updateMatrixWorld(true);
   const average=u=>{const v=values.filter(v=>Math.abs(v.u-u)<1e-5);return v.reduce((s,x)=>s+x.p.clone().project(camera).x,0)/v.length;};
   const left=average(minU),right=average(maxU);must(left<right,'The atlas horizontal direction is reversed after H.',{board:board.name,left,right});projections.push({board:board.name,left,right});
  }
  return {meshes:3,pavingSamples:samples,minTerrainClearance:min,maxTerrainClearance:max,minRoadEdgeMargin:roadMargin,connector:{paintSamples:linkSamples,forward:linkForward,backward:linkBackward},atlasTexts:texts,labelTriangles:before,ownerDamage:damaged,restored:true,projectedAfterH:projections};
 });
}catch(e){results.push({name:'complete scene and new access registration',status:'FAIL',message:String(e.message)});console.log('FAIL '+e.message);}
finally{
 if(traffic)traffic.dispose();
 if(sim){sim.world.removeCharacterController(sim.controller);sim.world.free();}
 const matches=sourceStillMatches();
 fs.writeFileSync(output,JSON.stringify({...report,hashes,sourceStillMatches:matches},null,2)+'\n');
 if(results.some(r=>r.status==='FAIL')||Object.values(matches).some(v=>!v))process.exitCode=1;
}
