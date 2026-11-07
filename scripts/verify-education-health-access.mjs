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

const results=[],output=path.join(root,'artifacts/education-health-access-test/results.json');
fs.mkdirSync(path.dirname(output),{recursive:true});
const report={candidate:process.argv[2]??'current-source',scope:'실제 전체 캠퍼스, DEM, 보충 도로, 공용 시설과 Rapier를 함께 검사한다. 이 검사는 사진의 정확한 치수, 실제 WebGL 화면 및 휴대전화 성능을 판정하지 않는다.',results,harnessSha256:sha(fs.readFileSync(new URL(import.meta.url)))};
read('src/main.ts');
const must=(condition,message,details)=>{if(!condition)throw Object.assign(new Error(message),{details});};
function check(name,fn){try{results.push({name,status:'PASS',...fn()});console.log('PASS '+name);}catch(e){results.push({name,status:'FAIL',message:e.message,details:e.details});console.log('FAIL '+name+' '+e.message);}}
const point=p=>Array.isArray(p)?new THREE.Vector3(...p):new THREE.Vector3(p.x,p.y??0,p.z);
const compact=w=>({reached:w.reached,maxPenetration:w.maxPenetration,last:w.segments.at(-1)});
const H=p=>new THREE.Vector3(p.x,p.y,-p.z);

// 꺾인 길 양쪽을 같은 폭으로 평행 이동한다. 메타 좌표를 통과 판정의 정답으로 쓰지는 않는다.
function offsetRoute(route,offset){
 return route.map((p,i)=>{const incoming=route[i].clone().sub(route[Math.max(0,i-1)]),outgoing=route[Math.min(route.length-1,i+1)].clone().sub(route[i]);incoming.y=outgoing.y=0;if(!incoming.lengthSq())incoming.copy(outgoing);if(!outgoing.lengthSq())outgoing.copy(incoming);incoming.normalize();outgoing.normalize();const n1=new THREE.Vector3(incoming.z,0,-incoming.x),n2=new THREE.Vector3(outgoing.z,0,-outgoing.x),bisector=n1.clone().add(n2).normalize();return p.clone().addScaledVector(bisector,offset/Math.max(.5,bisector.dot(n1)));});
}
function checkWalk(w,stepAllowance=0){
 must(w.reached,'The complete full-scene route is blocked.',compact(w));
 must(w.maxPenetration<.025,'The walking capsule penetrates a fixed surface.',compact(w));
 for(const s of w.segments){const above=s.end.y-s.dest.y;must(above>.72&&above<1.08+stepAllowance,'The capsule reaches XZ at a different level.',{expectedFloor:s.dest.y,end:s.end,above,blockers:s.blockers});must(s.penetrations.length===0,'The capsule ends inside a neighboring object.',s.penetrations);}
}
let sim;
try{
 const env=await buildWorld(),{world,terrain,data,campus}=env,ids=['way/297046999','way/297047243'];
 const awaitModules=await Promise.all(['educationHealthLandmark','buildingAppearance'].map(sourceModule));
 const shells=ids.map(id=>world.children.find(o=>o.userData.buildingId===id&&o.userData.role==='building-shell'));
 must(shells.every(Boolean),'Both actual fullCampus building shells must exist.');
 const [education,health]=shells,contract={...health.userData.upperConnection,doors:shells.flatMap(s=>s.userData.upperConnection?.doors??[])};
 must(contract?.routeWorld?.length>=6&&contract?.doors?.length===2,'The two interior endpoints and door contract must be provided before this test runs.');
 const route=contract.routeWorld.map(point),doorInfo=contract.doors.map(d=>({...d,center:point(d.center),outward:point(d.outward).normalize()})).sort((a,b)=>a.center.distanceToSquared(route[0])-b.center.distanceToSquared(route[0]));
 must(route.every(p=>p.toArray().every(Number.isFinite)),'The upper route contains invalid coordinates.');
 const near=route[0].clone(),far=near.clone().add(new THREE.Vector3(900,0,900));
 sim=env.makeSimulation(near.clone().add(new THREE.Vector3(0,1.7,0)));const walking=movementTools(sim);
 const doors=doorInfo.map(d=>sim.targets.find(t=>t.mesh.userData.component===d.component&&t.mesh.userData.buildingId===d.buildingId));
 must(doors.every(Boolean),'Each entrance must identify a real breakable door.');
 const update=p=>{env.update(p);world.updateMatrixWorld(true);};
 const reset=()=>{sim.reset();update(near);};
 const destroyDoors=()=>{for(const t of doors)sim.hit(t,100,new THREE.Vector3(0,0,1));update(near);};
 const settle=start=>{sim.teleport(start.clone().add(new THREE.Vector3(0,1.7,0)));for(let i=0;i<30;i++)sim.step(1/60,0,0,false);must(walking.contacts().length===0,'The initial full-scene capsule overlaps a fixed object.',{start,contacts:walking.contacts()});};
 const meshes=()=>{const list=[];world.traverse(o=>{if(!o.isMesh||o.isInstancedMesh)return;for(let p=o;p;p=p.parent)if(!p.visible)return;list.push(o);});return list;};
 const visual=(origin,direction,length)=>{world.updateMatrixWorld(true);return new THREE.Raycaster(world.scale.z<0?H(origin):origin,world.scale.z<0?H(direction):direction,0,length).intersectObjects(meshes(),false)[0]??null;};
 const actualFloor=(p,maxError=.04)=>{const start=p.clone().add(new THREE.Vector3(0,.32,0)),down=new THREE.Vector3(0,-1,0);sim.setFocus(start,true);sim.world.step();const render=visual(start,down,.8),hit=sim.world.castRay(new R.Ray(start,down),.8,true,R.QueryFilterFlags.EXCLUDE_DYNAMIC,undefined,sim.playerCollider,sim.player);must(render&&hit,'A planned walking point lacks a rendered or physical floor.',{point:p.toArray(),render:!!render,physical:!!hit});const renderedY=render.point.y,physicalY=start.y-hit.timeOfImpact;must(Math.abs(renderedY-physicalY)<.025&&Math.abs(physicalY-p.y)<maxError,'The real floor and its collider do not meet at the planned level.',{point:p.toArray(),renderedY,physicalY,mesh:render.object.name});return{point:p.toArray(),renderedY,physicalY,mesh:render.object.name};};
 const ownMeshes=shells.flatMap(s=>s.children.filter(o=>o.isMesh));
 const original=ownMeshes.map(m=>m.geometry.attributes.position.array.slice());
 report.contract=contract;report.geometry={targets:sim.targets.length,roads:data.roads.length,originalRoads:env.originalRoads,buildingParts:ids.map(id=>({id,parts:sim.targets.filter(t=>t.mesh.userData.buildingId===id).length})),mergedMeshes:ownMeshes.length};

 check('both interior routes stop at their own closed connection door',()=>{
  const details=[];
  for(const reverse of[false,true]){reset();const r=reverse?[...route].reverse():route;settle(r[0]);const w=walking.walk(r.slice(1)),last=w.segments.at(-1),expected=reverse?doors[1]:doors[0];must(!w.reached&&last.blockers.some(b=>b.component===expected.mesh.userData.component&&b.buildingId===expected.mesh.userData.buildingId),'A closed connection is blocked by another surface or bypasses its door.',{reverse,expected:expected.mesh.userData.component,walk:compact(w)});details.push({reverse,walk:w});}
  return{details};
 });
 check('three continuous interior-to-interior return paths remain clear in the full scene',()=>{
  const details=[];for(const offset of[-.65,0,.65]){reset();destroyDoors();const r=offsetRoute(route,offset);settle(r[0]);const forward=walking.walk(r.slice(1));checkWalk(forward);const backward=walking.walk(r.slice(0,-1).reverse());checkWalk(backward);details.push({offset,forward,backward});}return{speed:6,continuousReturnWithoutTeleport:true,details};
 });
 check('both interior floors and every bridge bend join the sixth-floor walking level',()=>{
  reset();destroyDoors();const sixthFloor=health.userData.localOrigin.y+health.userData.floors[5],roof=health.userData.localOrigin.y+health.userData.roofHeight;
  must(Math.abs(route[0].y-sixthFloor)<.02&&Math.abs(route.at(-1).y-sixthFloor)<.02&&roof-sixthFloor>2.5,'The corrected connection still uses the roof or mismatched room levels.',{routeStart:route[0].y,routeEnd:route.at(-1).y,sixthFloor,roof});
  const samples=[];for(let i=0;i<route.length;i++){samples.push(actualFloor(route[i]));if(i)for(let t=.25;t<1;t+=.25)samples.push(actualFloor(route[i-1].clone().lerp(route[i],t)));}
  return{sixthFloor,roof,roofSeparation:roof-sixthFloor,samples};
 });
 check('door surfaces preserve loaded unloaded H damage and repeated restoration',()=>{
  reset();const rays=doorInfo.map((d,i)=>({origin:d.center.clone().add(new THREE.Vector3(0,d.height/2,0)).addScaledVector(d.outward,.8),direction:d.outward.clone().negate(),target:doors[i]})),samples=[];
  for(const r of rays){sim.setFocus(r.origin,true);sim.world.step();const render=visual(r.origin,r.direction,1.2),loaded=sim.world.castRay(new R.Ray(r.origin,r.direction),1.2,true,R.QueryFilterFlags.EXCLUDE_DYNAMIC,undefined,sim.playerCollider,sim.player);must(render&&loaded&&loaded.collider.parent()?.handle===r.target.body?.handle,'The actual entrance face is hidden by another full-scene object.',{component:r.target.mesh.userData.component,renderMesh:render?.object.name,loaded:!!loaded});must(Math.abs(render.distance-loaded.timeOfImpact)<.10,'The real door surface is too far from its collider.',{render:render.distance,loaded:loaded.timeOfImpact});sim.setFocus(far,true);const unloaded=sim.castUnloadedTargets(r.origin,r.direction,1.2);must(unloaded?.target===r.target&&Math.abs(unloaded.distance-loaded.timeOfImpact)<.002,'Loaded and unloaded door queries disagree.');samples.push({component:r.target.mesh.userData.component,renderDistance:render.distance,loadedDistance:loaded.timeOfImpact,unloadedDistance:unloaded.distance});}
  world.scale.z=-1;update(near);for(let i=0;i<rays.length;i++){const render=visual(rays[i].origin,rays[i].direction,1.2);must(render&&Math.abs(render.distance-samples[i].renderDistance)<.001,'One H changes a door surface.');}
  destroyDoors();for(const distance of[279,281,900]){const p=near.clone().add(new THREE.Vector3(distance,0,distance));update(p);sim.setFocus(p,true);for(const r of rays){must(!sim.castUnloadedTargets(r.origin,r.direction,1.2),'A destroyed entrance returns in remote collision.');must(!visual(r.origin,r.direction,1.2),'A destroyed entrance returns in rendered geometry.');}}
  settle(route[0]);const forward=walking.walk(route.slice(1));checkWalk(forward);const backward=walking.walk(route.slice(0,-1).reverse());checkWalk(backward);
  for(let cycle=0;cycle<2;cycle++){reset();for(let i=0;i<ownMeshes.length;i++){const a=ownMeshes[i].geometry.attributes.position.array,b=original[i];must(Buffer.from(a.buffer,a.byteOffset,a.byteLength).equals(Buffer.from(b.buffer,b.byteOffset,b.byteLength)),'Reset fails to restore an actual merged surface.',{cycle,mesh:ownMeshes[i].name});}for(const r of rays){sim.setFocus(far,true);must(sim.castUnloadedTargets(r.origin,r.direction,1.2)?.target===r.target,'Reset does not restore the remote entrance.');}destroyDoors();}
  world.scale.z=1;reset();return{samples,reflectedWalk:{forward,backward},resetCycles:2};
 });
 check('a shifted terrain callback moves both endpoints and walking geometry together',()=>{
  reset();const [{createEducationHealthLandmark},{getBuildingAppearance}]=awaitModules;
  const raised=new THREE.Scene(),offset=7.25,rows=[];
  const shiftedHeightAt=Object.assign((x,z)=>terrain.heightAt(x,z)+offset,terrain.heightAt);
  if(terrain.heightAt.roadSurfaceTriangles)shiftedHeightAt.roadSurfaceTriangles=bounds=>terrain.heightAt.roadSurfaceTriangles(bounds).map(face=>face.map((v,i)=>i%3===1?v+offset:v));
  for(let index=0;index<ids.length;index++){const b=data.buildings.find(b=>b.id===ids[index]);createEducationHealthLandmark(raised,b,getBuildingAppearance(b),shiftedHeightAt);const s=raised.children.find(o=>o.userData.buildingId===b.id&&o.userData.role==='building-shell'),actual=s.userData.upperConnection.routeWorld.map(point),expected=shells[index].userData.upperConnection.routeWorld.map(point);assert.equal(actual.length,expected.length);for(let i=0;i<actual.length;i++)must(Math.abs(actual[i].x-expected[i].x)<.001&&Math.abs(actual[i].z-expected[i].z)<.001&&Math.abs(actual[i].y-expected[i].y-offset)<.001,'The upper route uses a fixed world height.',{building:b.id,index:i});const originalMeshes=shells[index].children.filter(o=>o.isMesh),newMeshes=s.children.filter(o=>o.isMesh);assert.equal(newMeshes.length,originalMeshes.length);let vertices=0;for(let m=0;m<newMeshes.length;m++){const a=newMeshes[m].geometry.attributes.position.array,b=originalMeshes[m].geometry.attributes.position.array;assert.equal(a.length,b.length);for(let i=0;i<a.length;i+=3){must(Math.abs(a[i]-b[i])<.002&&Math.abs(a[i+2]-b[i+2])<.002&&Math.abs(a[i+1]-b[i+1]-offset)<.002,'The floor or facade geometry fails the terrain offset.');vertices++;}}rows.push({building:ids[index],vertices,routePoints:actual.length});}return{callbackOffset:offset,rows};
 });
 check('the north deck rear walk and six side steps form one ground return route',()=>{
  reset();const c=health.userData.courtyard;must(c?.accessSteps===6,'The new ground courtyard metadata is missing.');const o=health.userData.localOrigin,a=health.userData.axis,worldPoint=(u,y,v)=>new THREE.Vector3(o.x+a.x*u-a.z*v,o.y+y,o.z+a.z*u+a.x*v);
  const north=c.northDeck.floor,rear=c.rearWalk.floor,path=[worldPoint(18.5,north,64.6),worldPoint(21.8,north,64.6),worldPoint(21.8,north,64),worldPoint(21.8,rear,55),worldPoint(21.8,rear,53),worldPoint(22.7,rear,52.3)];
  for(let i=0;i<c.accessSteps;i++)path.push(worldPoint(23.1+(i+.5)*.425,rear+(i+1)*c.walkRise,52.3));
  settle(path[0]);const forward=walking.walk(path.slice(1));checkWalk(forward,.4);const backward=walking.walk(path.slice(0,-1).reverse());checkWalk(backward,.4);
  const samples=path.map(p=>actualFloor(p));let minTerrainClearance=Infinity;for(let i=1;i<path.length;i++)for(let j=0;j<=8;j++){const p=path[i-1].clone().lerp(path[i],j/8);if(i>=6)continue;const floor=actualFloor(p,.07),clear=floor.renderedY-terrain.meshHeightAt(p.x,p.z);minTerrainClearance=Math.min(minTerrainClearance,clear);must(clear>=-.005,'New paving enters the actual terrain.',{point:p.toArray(),clear});}
  return{speed:6,steps:c.accessSteps,minTerrainClearance,forward,backward,samples};
 });
 check('the southwest ground door joins both existing sidewalks and the observed high walk',()=>{
  reset();const entry=education.userData.groundEntry,site=world.children.find(o=>o.userData.facilityId==='facilities/living-science-south-site');
  must(entry?.routeWorld?.length&&entry.southRouteWorld?.length&&entry.northWalkRouteWorld?.length&&site,'The ground entrance and existing south sidewalk are not registered.');
  const d=entry.door,target=sim.targets.find(t=>t.mesh.userData.component===d.component&&t.mesh.userData.buildingId===ids[0]);must(target,'The ground door has no actual breakable surface.');
  const junction=entry.routeWorld.map(point),siteRoute=site.userData.routeWorld.map(point),route=siteRoute.concat(junction.slice(siteRoute.at(-1).distanceTo(junction[0])<.05?1:0));
  const south=entry.southRouteWorld.map(point),north=entry.northWalkRouteWorld.map(point),closed=[];
  for(const r of[junction,[...junction].reverse()]){reset();settle(r[0]);const w=walking.walk(r.slice(1));must(!w.reached&&w.segments.at(-1).blockers.some(b=>b.component===d.component),'The closed ground entrance is blocked by an old wall or bypasses the door.',compact(w));closed.push(w);}
  const routes=[];for(const offset of[-.3,0,.3]){reset();sim.hit(target,100,new THREE.Vector3(0,0,1));update(junction[0]);const r=offsetRoute(route,offset);settle(r[0]);const forward=walking.walk(r.slice(1));checkWalk(forward,.07);const backward=walking.walk(r.slice(0,-1).reverse());checkWalk(backward,.07);routes.push({source:'existing-south-sidewalk-and-337',offset,forward,backward});}
  reset();sim.hit(target,100,new THREE.Vector3(0,0,1));update(junction[0]);settle(south[0]);const sf=walking.walk(south.slice(1));checkWalk(sf,.07);const sb=walking.walk(south.slice(0,-1).reverse());checkWalk(sb,.07);routes.push({source:'south-brick-approach-through-bollards',offset:0,forward:sf,backward:sb});
  const highEndSamples=[],entryOrigin=point(entry.origin),along=point(entry.tangent).normalize(),out=point(entry.outward).normalize(),walkEndS=entry.northWalk.s[1],endS=entry.northWalk.transitionEndS??walkEndS,endN=north.at(-1).clone().sub(entryOrigin).dot(out),sampleDistances=[...new Set([walkEndS-.2,walkEndS+.02,walkEndS+.2,walkEndS+.5,walkEndS+1,endS-.2,endS+.02,endS+.2,endS+.5,endS+1,endS+2])].sort((a,b)=>a-b);
  for(const s of sampleDistances){const p=entryOrigin.clone().addScaledVector(along,s).addScaledVector(out,endN),ground=terrain.heightAt(p.x,p.z),from=p.clone().setY(ground+2.4),down=new THREE.Vector3(0,-1,0);sim.setFocus(from,true);sim.world.step();const hit=sim.world.castRay(new R.Ray(from,down),3,true,R.QueryFilterFlags.EXCLUDE_DYNAMIC,undefined,sim.playerCollider,sim.player),render=visual(from,down,3);must(hit,'There is no physical ground beyond the north walking surface.',{s,point:p.toArray()});p.y=from.y-hit.timeOfImpact;highEndSamples.push({s,point:p,terrainY:ground,renderedY:render?.point.y,physicalY:p.y});}
  const high=[junction.at(-1),junction.at(-2),junction[1],...north,...highEndSamples.map(s=>s.point)];settle(high[0]);const nf=walking.walk(high.slice(1));checkWalk(nf,.07);const nb=walking.walk(high.slice(0,-1).reverse());checkWalk(nb,.07);routes.push({source:'interior-to-north-high-walk-and-two-metres-beyond',offset:0,forward:nf,backward:nb});
  const posts=sim.targets.filter(t=>t.mesh.userData.buildingId===ids[0]&&t.mesh.userData.component==='education-southwest-bollard');must(posts.length===2,'The two observed approach bollards are missing.');const clear=Math.hypot(posts[0].mesh.position.x-posts[1].mesh.position.x,posts[0].mesh.position.z-posts[1].mesh.position.z)-(posts[0].size.x+posts[1].size.x)/2;must(clear>.9,'The bollards leave no safe capsule gap.',{clear});
  return{speed:6,closed,routes,highEndSamples,bollardClearWidthApproximate:clear,northFarEndUnconfirmed:entry.northWalk.farEndUnconfirmed,scope:'Game movement two metres beyond the modeled high-walk end is tested; its real endpoint and wheelchair-standard compliance remain unconfirmed.'};
 });
 check('southwest entry floors canopy and cut walls agree through H damage distance and reset',()=>{
  reset();const entry=education.userData.groundEntry;must(entry,'The ground-entry metadata is missing.');const d=entry.door,center=point(d.center),out=point(d.outward).normalize(),tangent=point(d.tangent).normalize(),target=sim.targets.find(t=>t.mesh.userData.component===d.component&&t.mesh.userData.buildingId===ids[0]);
  const owner=c=>{const body=c.parent();return body?sim.targets.find(t=>t.body?.handle===body.handle):undefined;};
  const physical=(origin,direction,length)=>{sim.setFocus(origin,true);sim.world.step();return sim.world.castRay(new R.Ray(origin,direction),length,true,R.QueryFilterFlags.EXCLUDE_DYNAMIC,undefined,sim.playerCollider,sim.player);};
  const origin=center.clone().add(new THREE.Vector3(0,d.height/2,0)).addScaledVector(out,.8),direction=out.clone().negate(),shown=visual(origin,direction,1.6),loaded=physical(origin,direction,1.6);
  must(shown&&loaded&&target?.body&&loaded.collider.parent()?.handle===target.body.handle,'The new door is hidden behind an old edge6/7 facade.');must(Math.abs(shown.distance-loaded.timeOfImpact)<.08,'The visible ground door differs from its collider.');sim.setFocus(far,true);const unloaded=sim.castUnloadedTargets(origin,direction,1.6);must(unloaded?.target===target&&Math.abs(unloaded.distance-loaded.timeOfImpact)<.002,'Loaded/unloaded ground door queries disagree.');
  const wallSamples=[];for(const sign of[-1,1]){const p=origin.clone().addScaledVector(tangent,sign*(d.width/2+.7)),hit=physical(p,direction,1.6),render=visual(p,direction,1.6),body=hit&&owner(hit.collider);must(hit&&render&&body?.mesh.userData.buildingId===ids[0]&&body!==target,'Cutting the doorway also removed the neighboring wall.',{sign,component:body?.mesh.userData.component});wallSamples.push({sign,component:body.mesh.userData.component,physical:hit.timeOfImpact,rendered:render.distance});}
  sim.hit(target,100,direction);update(center);const floorSamples=[],floorStructureSamples=[],components=new Set(entry.surfaceComponents);let minTerrainClearance=Infinity,maxFloorDifference=0,maxCoveredFloorDepth=0;
  for(const part of sim.targets.filter(t=>t.mesh.userData.buildingId===ids[0]&&components.has(t.mesh.userData.component))){const p=part.mesh.geometry.attributes.position;for(let i=0;i<p.count;i+=3){const vertices=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,i+k).applyQuaternion(part.mesh.quaternion).add(part.mesh.position)),normal=vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0]));if(normal.y<1e-6)continue;const q=vertices[0].clone().add(vertices[1]).add(vertices[2]).multiplyScalar(1/3),from=q.clone().add(new THREE.Vector3(0,.45,0)),down=new THREE.Vector3(0,-1,0),hit=physical(from,down,.9),render=visual(from,down,.9);must(hit&&render,'A new ground walking triangle has no visible or physical floor.',{point:q.toArray(),component:part.mesh.userData.component});const py=from.y-hit.timeOfImpact,difference=Math.abs(py-render.point.y),clear=py-terrain.meshHeightAt(q.x,q.z),topOwner=owner(hit.collider),coveredDepth=py-q.y;if(topOwner?.mesh.userData.buildingId===ids[0]&&topOwner.mesh.userData.component?.startsWith('education-southwest-')&&!components.has(topOwner.mesh.userData.component)&&hit.timeOfImpact<1e-5){const above=q.clone().setY(topOwner.box.max.y+.08),length=above.y-q.y+.03,coverHit=physical(above,down,length),coverRender=visual(above,down,length);must(coverHit&&coverRender&&Math.abs(coverHit.timeOfImpact-coverRender.distance)<.08,'A structural footprint obscures a floor without a matching visible top.',{point:q.toArray(),component:topOwner.mesh.userData.component,physical:coverHit?.timeOfImpact,rendered:coverRender?.distance});floorStructureSamples.push({component:part.mesh.userData.component,cover:topOwner.mesh.userData.component,point:q.toArray(),coverTopDifference:Math.abs(coverHit.timeOfImpact-coverRender.distance)});continue;}minTerrainClearance=Math.min(minTerrainClearance,clear);maxFloorDifference=Math.max(maxFloorDifference,difference);maxCoveredFloorDepth=Math.max(maxCoveredFloorDepth,coveredDepth);must(topOwner?.mesh.userData.buildingId===ids[0]&&components.has(topOwner.mesh.userData.component)&&coveredDepth>=-.025&&difference<.025&&clear>=-.005,'A ground walking triangle is buried or differs from its collider.',{component:part.mesh.userData.component,topComponent:topOwner?.mesh.userData.component,point:q.toArray(),physicalY:py,renderY:render.point.y,clear,difference,coveredDepth});floorSamples.push({component:part.mesh.userData.component,topComponent:topOwner.mesh.userData.component,point:q.toArray(),physicalY:py,difference,clear,coveredDepth});}}
  must(floorSamples.length>20,'Ground floor sampling missed the approach or high walk.');
  // 생성된 삼각형 바깥도 표본화해 갈림길 폭 안의 빈틈과 바닥 단차를 찾는다.
  const junction=entry.routeWorld.map(point),south=entry.southRouteWorld.map(point),north=entry.northWalkRouteWorld.map(point),junctionProbes=[],probeRows=[];
  const probePaths=[{id:'south-to-door-landing',route:south.slice(1)},{id:'337-to-north-walk',route:[junction[0],junction[1],north[0],north[1]]}];
  let maxProbeHeightStep=0;
  for(const path of probePaths)for(const offset of[-.65,-.325,0,.325,.65]){const line=offsetRoute(path.route,offset);let previous;
   for(let i=1;i<line.length;i++){const a=line[i-1],b=line[i],steps=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.2);for(let j=1;j<=steps;j++){const q=a.clone().lerp(b,j/steps),from=q.clone().add(new THREE.Vector3(0,.6,0)),down=new THREE.Vector3(0,-1,0),hit=physical(from,down,1.2),render=visual(from,down,1.2),top=hit&&owner(hit.collider),py=hit?from.y-hit.timeOfImpact:null;const detail={path:path.id,offset,segment:i,point:q.toArray(),physicalY:py,renderedY:render?.point.y,topComponent:top?.mesh.userData.component};must(hit&&render&&top?.mesh.userData.buildingId===ids[0]&&components.has(top.mesh.userData.component),'A branch junction contains a gap in the new walking surface.',detail);const difference=Math.abs(py-render.point.y),levelError=Math.abs(py-q.y),clear=py-terrain.meshHeightAt(q.x,q.z);must(difference<.025&&levelError<.4&&clear>=-.005,'A branch junction floor is buried or discontinuous with its intended walking level.',{...detail,difference,levelError,clear});if(previous){const step=Math.abs(py-previous.y);maxProbeHeightStep=Math.max(maxProbeHeightStep,step);must(step<.32,'An abrupt floor step crosses the branch walking width.',{...detail,previous,step});}previous={x:q.x,y:py,z:q.z};junctionProbes.push({...detail,difference,clear});} }
   probeRows.push({path:path.id,offset,outerBoundaryExcludedMetres:.2});
  }
  const under=center.clone().addScaledVector(out,.55).setY(center.y+.1),up=new THREE.Vector3(0,1,0),roof=physical(under,up,5),renderRoof=visual(under,up,5);must(roof&&renderRoof&&roof.timeOfImpact+.1>2.5&&Math.abs(roof.timeOfImpact-renderRoof.distance)<.025,'The actual canopy leaves insufficient or mismatched clearance.');
  reset();world.scale.z=-1;update(center);const reflected=visual(origin,direction,1.6);must(reflected&&Math.abs(reflected.distance-shown.distance)<.001,'One H changes the ground entrance surface.');sim.hit(target,100,direction);update(center);
  for(const distance of[279,281,900]){const away=center.clone().add(new THREE.Vector3(distance,0,distance));sim.setFocus(away,true);update(away);must(!sim.castUnloadedTargets(origin,direction,1.6)&&!visual(origin,direction,1.6),'A destroyed ground door returns at distance.');}
  const r=entry.routeWorld.map(point);settle(r[0]);const forward=walking.walk(r.slice(1));checkWalk(forward);const backward=walking.walk(r.slice(0,-1).reverse());checkWalk(backward);
  for(let cycle=0;cycle<2;cycle++){reset();ownMeshes.forEach((m,i)=>assert.deepEqual(m.geometry.attributes.position.array,original[i],'Reset did not restore the full merged building.'));sim.setFocus(far,true);must(sim.castUnloadedTargets(origin,direction,1.6)?.target===target,'Reset did not restore the ground door collision.');if(!cycle){sim.hit(target,100,direction);update(center);}}
  world.scale.z=1;reset();return{door:{rendered:shown.distance,loaded:loaded.timeOfImpact,unloaded:unloaded.distance},wallSamples,floorSamples,floorStructureSamples,minTerrainClearance,maxFloorDifference,maxCoveredFloorDepth,junctionProbes,junctionProbePaths:probeRows,maxProbeHeightStep,canopyClearance:roof.timeOfImpact+.1,reflectedWalk:{forward,backward},resetCycles:2};
 });
}catch(e){results.push({name:'full scene and corrected connection registration',status:'FAIL',message:e.message,details:e.details});console.log('FAIL '+e.message);}
finally{
 if(sim){sim.world.removeCharacterController(sim.controller);sim.world.free();}
 const matches=sourceStillMatches();fs.writeFileSync(output,JSON.stringify({...report,hashes,sourceStillMatches:matches},null,2)+'\n');
 if(results.some(r=>r.status==='FAIL')||Object.values(matches).some(v=>!v))process.exitCode=1;
}


