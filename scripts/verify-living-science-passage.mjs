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

const output=path.join(root,'artifacts/living-science-passage-test/results.json'),results=[];
fs.mkdirSync(path.dirname(output),{recursive:true});
const report={scope:'실제 전체 캠퍼스, DEM, 원본 /524 보행로와 /208 차량 경로를 함께 검사한다. 사진의 정확한 치수와 실제 휴대전화 성능은 검사하지 않는다.',results,harnessSha256:sha(fs.readFileSync(new URL(import.meta.url)))};
const must=(condition,message,details)=>{if(!condition)throw Object.assign(new Error(message),{details});};
const check=(name,fn)=>{try{results.push({name,status:'PASS',...fn()});console.log('PASS '+name);}catch(e){results.push({name,status:'FAIL',message:e.message,details:e.details});console.log('FAIL '+name+' '+e.message);}};
const H=p=>new THREE.Vector3(p.x,p.y,-p.z);
const rawPoint=p=>new THREE.Vector3(p[0],0,p[1]);
function offsetRoute(route,offset){
 return route.map((p,i)=>{const a=route[i].clone().sub(route[Math.max(0,i-1)]),b=route[Math.min(route.length-1,i+1)].clone().sub(route[i]);a.y=b.y=0;if(!a.lengthSq())a.copy(b);if(!b.lengthSq())b.copy(a);a.normalize();b.normalize();const n1=new THREE.Vector3(a.z,0,-a.x),n2=new THREE.Vector3(b.z,0,-b.x),n=n1.clone().add(n2).normalize();return p.clone().addScaledVector(n,offset/Math.max(.5,n.dot(n1)));});
}

let sim,traffic;
try{
 read('src/main.ts');
 const env=await buildWorld(),{world,terrain,data,campus}=env,id='way/386890828',building=data.buildings.find(b=>b.id===id),awaitTraffic=await sourceModule('traffic');
 const shell=world.children.find(o=>o.userData.buildingId===id&&o.userData.role==='building-shell');
 must(shell,'The actual full-campus 222 model is missing.');
 const passageInfo=shell.userData.passage;must(passageInfo?.openWithoutDestruction,'The observed open passage is not registered.');
 const passage=data.roads.find(r=>r.id==='way/1185265108/524'),south=data.roads.find(r=>r.id==='way/455018306/208'),north=data.roads.find(r=>r.id==='way/456922935/338');
 must(passage&&south&&north,'An original approach road is missing.');
 const a=rawPoint(passage.points[0]),b=rawPoint(passage.points.at(-1)),serviceStart=rawPoint(south.points[0]).lerp(a,.5),rawRoute=[serviceStart,a,b,rawPoint(north.points[1]),rawPoint(north.points[2])];
 const near=a.clone().setY(terrain.heightAt(a.x,a.z)+1.7),far=near.clone().add(new THREE.Vector3(900,0,900));
 sim=env.makeSimulation(near);const walking=movementTools(sim);
 const update=p=>{env.update(p);world.updateMatrixWorld(true);};update(near);
 const renderMeshes=()=>{const out=[];world.traverse(o=>{if(!o.isMesh||o.isInstancedMesh)return;for(let p=o;p;p=p.parent)if(!p.visible)return;out.push(o);});return out;};
 const visual=(origin,direction,max)=>new THREE.Raycaster(world.scale.z<0?H(origin):origin,world.scale.z<0?H(direction):direction,0,max).intersectObjects(renderMeshes(),false);
 const colliderOwner=c=>{const body=c.parent();return body?sim.targets.find(t=>t.body?.handle===body.handle):null;};
 const direction=b.clone().sub(a).normalize(),side=new THREE.Vector3(direction.z,0,-direction.x),length=a.distanceTo(b),at=(s,n,y=0)=>a.clone().addScaledVector(direction,s).addScaledVector(side,n).setY(y);
 const cast=(origin,dir,max)=>sim.world.castRay(new R.Ray(origin,dir),max,true,R.QueryFilterFlags.EXCLUDE_DYNAMIC,undefined,sim.playerCollider,sim.player);
 const floorAt=(s,n)=>{const p=at(s,n),ground=terrain.meshHeightAt(p.x,p.z),origin=p.clone().setY(Math.min(passageInfo.ceilingWorldY-.2,ground+2.2));sim.setFocus(origin,true);sim.world.step();const hit=cast(origin,new THREE.Vector3(0,-1,0),3.4),shown=visual(origin,new THREE.Vector3(0,-1,0),3.4)[0];must(hit&&shown,'A passage point has no actual floor.',{s,n,origin:origin.toArray()});const y=origin.y-hit.timeOfImpact,target=colliderOwner(hit.collider);return{s,n,point:p.setY(y),terrain:ground,renderedY:shown.point.y,renderMesh:shown.object.name,target:target?.mesh.userData.component??null};};
 const settle=p=>{sim.teleport(new THREE.Vector3(p.x,terrain.heightAt(p.x,p.z)+2.2,p.z));for(let i=0;i<60;i++)sim.step(1/60,0,0,false);must(walking.contacts().length===0,'The approach begins inside a fixed surface.',{point:p.toArray(),contacts:walking.contacts()});};
 const verifyWalk=w=>{must(w.reached,'The original mapped passage route is blocked.',w);must(w.maxPenetration<.025,'The capsule penetrates a fixed surface.',w);for(const s of w.segments)must(s.penetrations.length===0,'A path endpoint remains inside a fixed surface.',s);};
 report.originalRoads={passage,south,north};report.geometry={targets:sim.targets.length,roads:data.roads.length,originalRoads:env.originalRoads,parts:sim.targets.filter(t=>t.mesh.userData.buildingId===id).length};
 check('original south road passage and north footway support three continuous return paths',()=>{
  const details=[];
  for(const offset of[-.8,0,.8]){sim.reset();update(near);const route=offsetRoute(rawRoute,offset);settle(route[0]);const forward=walking.walk(route.slice(1));verifyWalk(forward);const backward=walking.walk(route.slice(0,-1).reverse());verifyWalk(backward);details.push({offset,forward,backward});}
  return{speed:6,withoutTeleportAtFarEnd:true,details};
 });

 check('real paving and ceiling preserve floor contact headroom and the original footprint',()=>{
  sim.reset();update(near);const samples=[],surfaceMismatches=[];let minimumHeadroom=Infinity,minimumGroundClearance=Infinity,maxSurfaceDifference=0;
  assert.deepEqual(shell.userData.mappedOutline,building.points.slice(0,-1));
  const beamStart=passageInfo.intersections[0].s,beamEnd=passageInfo.intersections[1].s;
  // Float32 외곽선의 안팎 반올림을 표면 누락으로 오인하지 않도록 끝에서 3 cm 안쪽을 조사한다.
  for(const s of [...Array.from({length:Math.floor((length-3.05)/.5)+1},(_,i)=>3.05+i*.5),length-.03])for(const n of[-1.5,0,1.5]){
   const floor=floorAt(Math.min(s,length),n),difference=Math.abs(floor.renderedY-floor.point.y),clear=floor.point.y-floor.terrain;maxSurfaceDifference=Math.max(maxSurfaceDifference,difference);minimumGroundClearance=Math.min(minimumGroundClearance,clear);
   must(clear>=-.008,'A new walking surface enters the terrain.',floor);
   if(difference>=.035)surfaceMismatches.push({...floor,difference});
   if(s>beamStart+.3&&s<beamEnd-.3){const origin=floor.point.clone().add(new THREE.Vector3(0,.12,0)),up=new THREE.Vector3(0,1,0),hit=cast(origin,up,5),render=visual(origin,up,5)[0];must(hit&&render,'A covered passage lacks its actual overhead surface.',floor);const headroom=hit.timeOfImpact+.12;minimumHeadroom=Math.min(minimumHeadroom,headroom);must(headroom>2.1,'The real ceiling is too low for the standing capsule.',{...floor,headroom});must(Math.abs(hit.timeOfImpact-render.distance)<.035,'The overhead render and collider disagree.',{s,n,render:render.distance,physical:hit.timeOfImpact});}
   samples.push({...floor,point:floor.point.toArray(),difference});
  }
  must(!surfaceMismatches.length,'The visible passage surface differs from the physical walking surface.',{count:surfaceMismatches.length,maxSurfaceDifference,minimumHeadroom,minimumGroundClearance,worst:surfaceMismatches.sort((a,b)=>b.difference-a.difference).slice(0,12)});
  const mergedMeshes=shell.children.filter(o=>o.isMesh).length;must(mergedMeshes<=3,'The passage breaks the existing merged-mesh budget.',{mergedMeshes});
  return{samples,minimumHeadroom,minimumGroundClearance,maxSurfaceDifference,mergedMeshes};
 });

 check('new thin surfaces remain consistent through H reflection partial destruction distance and reset',()=>{
  sim.reset();update(near);const own=shell.children.filter(o=>o.isMesh),original=own.map(m=>m.geometry.attributes.position.array.slice()),floor=floorAt(12,0),rays=[
   {component:'passage-left-wall',origin:at(12,-1.2,floor.point.y+1.1),direction:side.clone().negate(),max:1.4},
   {component:'passage-overhead-beam',origin:at(12,0,floor.point.y+1.1),direction:new THREE.Vector3(0,1,0),max:4},
   {component:'passage-red-paving',origin:at(12,.6,floor.point.y+.6),direction:new THREE.Vector3(0,-1,0),max:.9}
  ],samples=[];
  for(const r of rays){sim.setFocus(r.origin,true);sim.world.step();const actual=cast(r.origin,r.direction,r.max),render=visual(r.origin,r.direction,r.max)[0],target=actual?colliderOwner(actual.collider):null;must(target?.mesh.userData.component===r.component&&render,'A representative actual passage surface is missing or masked.',{expected:r.component,actual:target?.mesh.userData.component,render:render?.object.name});must(Math.abs(render.distance-actual.timeOfImpact)<.035,'A new thin surface has an oversized collider.',{component:r.component,render:render.distance,physical:actual.timeOfImpact});sim.setFocus(far,true);const remote=sim.castUnloadedTargets(r.origin,r.direction,r.max);must(remote?.target===target&&Math.abs(remote.distance-actual.timeOfImpact)<.002,'Loaded and unloaded thin surfaces differ.',{component:r.component});r.target=target;r.distance=actual.timeOfImpact;samples.push({component:r.component,rendered:render.distance,physical:actual.timeOfImpact,unloaded:remote.distance});}
  world.scale.z=-1;update(near);for(let i=0;i<rays.length;i++){const r=rays[i],hit=visual(r.origin,r.direction,r.max)[0];must(hit&&Math.abs(hit.distance-samples[i].rendered)<.001,'One H changes a passage surface.',{component:r.component});}
  const wall=rays[0];sim.hit(wall.target,100,wall.direction);update(near);
  for(const distance of[279,281,900]){const p=near.clone().add(new THREE.Vector3(distance,0,distance));update(p);sim.setFocus(p,true);must(!sim.castUnloadedTargets(wall.origin,wall.direction,wall.distance+.04),'A destroyed passage wall returns in distant collision.');must(!visual(wall.origin,wall.direction,wall.distance+.04).length,'A destroyed passage wall returns in distant rendering.');for(const r of rays.slice(1))must(visual(r.origin,r.direction,r.max)[0],'An undamaged floor or beam disappears at distance.');}
  settle(rawRoute[0]);const forward=walking.walk(rawRoute.slice(1));verifyWalk(forward);const backward=walking.walk(rawRoute.slice(0,-1).reverse());verifyWalk(backward);
  for(let cycle=0;cycle<2;cycle++){sim.reset();update(near);for(let i=0;i<own.length;i++){const x=own[i].geometry.attributes.position.array,y=original[i];must(Buffer.from(x.buffer,x.byteOffset,x.byteLength).equals(Buffer.from(y.buffer,y.byteOffset,y.byteLength)),'Reset does not restore the merged passage surface.',{cycle,mesh:own[i].name});}sim.setFocus(far,true);for(const r of rays)must(sim.castUnloadedTargets(r.origin,r.direction,r.max)?.target===r.target,'Reset does not restore a passage collider.',{cycle,component:r.component});sim.hit(wall.target,100,wall.direction);update(near);}
  world.scale.z=1;sim.reset();update(near);return{samples,reflectedContinuousReturn:{forward,backward},resetCycles:2};
 });

 check('observed south sidewalk connects the real footways and preserves thin facilities through reflection damage and reset',()=>{
  sim.reset();world.scale.z=1;update(near);
  const site=world.children.find(o=>o.userData.facilityId==='facilities/living-science-south-site');
  must(site,'The observed south site is missing from the actual full campus.');
  const route=site.userData.routeWorld.map(p=>new THREE.Vector3(p.x,p.y,p.z)),own=site.children.filter(o=>o.isMesh),original=own.map(m=>m.geometry.attributes.position.array.slice()),siteTargets=sim.targets.filter(t=>t.mesh.userData.facilityId===site.userData.facilityId);
  must(own.length<=3&&siteTargets.length>0,'The site has no physical parts or exceeds its mesh budget.');
  const path210=data.roads.find(r=>r.id==='way/455020727/210');
  must(path210&&path210.points.some(p=>Math.hypot(p[0]-route.at(-1).x,p[1]-route.at(-1).z)<.05),'The new path does not meet the original /210 endpoint.');
  const walks=[];for(const offset of[-.3,0,.3]){const points=offsetRoute(route,offset);settle(points[0]);const forward=walking.walk(points.slice(1));verifyWalk(forward);const backward=walking.walk(points.slice(0,-1).reverse());verifyWalk(backward);walks.push({offset,forward,backward});}
  let samples=0,maxSurfaceDifference=0,minimumTerrainClearance=Infinity,maximumTerrainClearance=-Infinity;
  const floors=siteTargets.filter(t=>['gray-sidewalk','east-path-connection'].includes(t.mesh.userData.component));
  for(const target of floors){
   const p=target.mesh.geometry.attributes.position,points=[];for(let i=0;i<p.count;i++)points.push(new THREE.Vector3().fromBufferAttribute(p,i).add(target.mesh.position));
   // Probe actual convex top triangles, not the metadata's nominal height.
   for(let i=0;i<points.length;i+=3){const a=points[i],b=points[i+1],c=points[i+2],normal=new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a));if(normal.y<=1e-7)continue;
    const q=a.clone().add(b).add(c).multiplyScalar(1/3),origin=q.clone().add(new THREE.Vector3(0,.55,0)),down=new THREE.Vector3(0,-1,0);sim.setFocus(origin,true);sim.world.step();
    const hit=cast(origin,down,.9),shown=visual(origin,down,.9)[0],owner=hit&&colliderOwner(hit.collider);must(hit&&shown&&owner?.mesh.userData.facilityId===site.userData.facilityId,'A site floor is missing or covered by unrelated geometry.',{component:target.mesh.userData.component,point:q.toArray(),actual:owner?.mesh.userData.component,render:shown?.object.name});
    const difference=Math.abs(shown.distance-hit.timeOfImpact),terrainClearance=q.y-terrain.meshHeightAt(q.x,q.z);maxSurfaceDifference=Math.max(maxSurfaceDifference,difference);minimumTerrainClearance=Math.min(minimumTerrainClearance,terrainClearance);maximumTerrainClearance=Math.max(maximumTerrainClearance,terrainClearance);samples++;
    must(difference<.025&&terrainClearance>.17&&terrainClearance<.21,'A visible site floor differs from its actual collider or terrain surface.',{point:q.toArray(),difference,terrainClearance});
   }
  }
  must(samples>20,'The independent floor sampling did not cover both connections.');
  const across=new THREE.Vector3(...site.userData.across),targets=[siteTargets.find(t=>t.mesh.userData.component==='lower-retaining-wall'&&t.mesh.userData.section===3),siteTargets.filter(t=>t.mesh.userData.component==='silver-railing-post')[4]],rays=[];
  for(const target of targets){must(target,'A representative thin site component is missing.');const origin=target.mesh.position.clone().addScaledVector(across,-.75),direction=across.clone();sim.setFocus(origin,true);sim.world.step();const hit=cast(origin,direction,1.5),shown=visual(origin,direction,1.5)[0];must(hit&&shown&&colliderOwner(hit.collider)===target,'A thin site member is masked or lacks collision.',{component:target.mesh.userData.component,actual:hit&&colliderOwner(hit.collider)?.mesh.userData.component,render:shown?.object.name});must(Math.abs(hit.timeOfImpact-shown.distance)<.025,'A thin site member has oversized collision.');sim.setFocus(far,true);const remote=sim.castUnloadedTargets(origin,direction,1.5);must(remote?.target===target&&Math.abs(remote.distance-hit.timeOfImpact)<.002,'The site member changes between loaded and unloaded queries.');rays.push({target,origin,direction,rendered:shown.distance,physical:hit.timeOfImpact,unloaded:remote.distance});}
  world.scale.z=-1;update(near);for(const ray of rays){const shown=visual(ray.origin,ray.direction,1.5)[0];must(shown&&Math.abs(shown.distance-ray.rendered)<.001,'H reflection moves the site surface.');}
  const wall=rays[0];sim.hit(wall.target,100,wall.direction);update(near);
  for(const distance of[279,281,900]){const away=near.clone().add(new THREE.Vector3(distance,0,distance));sim.setFocus(away,true);update(away);must(!sim.castUnloadedTargets(wall.origin,wall.direction,wall.physical+.02),'Destroyed site wall returns in distant physics.');must(!visual(wall.origin,wall.direction,wall.rendered+.02).length,'Destroyed site wall returns in distant rendering.');must(visual(rays[1].origin,rays[1].direction,1.5).length>0,'An undamaged railing disappears at distance.');}
  for(let cycle=0;cycle<2;cycle++){sim.reset();update(near);own.forEach((m,i)=>assert.deepEqual(m.geometry.attributes.position.array,original[i],'Reset did not restore site geometry.'));sim.setFocus(far,true);for(const ray of rays)must(sim.castUnloadedTargets(ray.origin,ray.direction,1.5)?.target===ray.target,'Reset did not restore a site collider.');if(cycle===0){sim.hit(wall.target,100,wall.direction);update(near);}}
  world.scale.z=1;update(near);
  return{walks,routeWidthOffsets:[-.3,0,.3],samples,maxSurfaceDifference,minimumTerrainClearance,maximumTerrainClearance,meshes:own.length,parts:siteTargets.length,raySamples:rays.map(r=>({component:r.target.mesh.userData.component,rendered:r.rendered,physical:r.physical,unloaded:r.unloaded})),resetCycles:2};
 });

 check('mapped south road has no taxi collisions after removing the unsupported above-ground volume',()=>{
  sim.reset();world.scale.z=1;update(near);
  const {Traffic}=awaitTraffic,plan=JSON.parse(read('public/data/campus-transit.json'));
  traffic=new Traffic(new THREE.Scene(),data.roads,terrain.heightAt,plan);
  const vehicle=traffic.vehicles.find(v=>v.service==='taxi'),edge=traffic.edges.find(e=>e.roadId===south.id&&e.segmentIndex===0&&e.a.point.x<e.b.point.x),next=traffic.edges.find(e=>e.roadId===south.id&&e.segmentIndex===1&&e.a.point.x<e.b.point.x);
  must(vehicle&&edge&&next,'The actual two-way road or taxi geometry is unavailable.');
  sim.setFocus(near,true);sim.world.step();const rows=[];
  for(const [start,following] of[[edge,next],[next.reverse,edge.reverse]]){
   const sparse=[],dense=[];vehicle.edge=start;vehicle.next=following;vehicle.turn=null;
   for(let j=0;j<=20;j++)sparse.push({phase:'inbound-straight',edge:start,distance:Math.max(0,start.length-12)+j/20*(Math.min(12,start.length)-4.8)});
   traffic.startTurn(vehicle);const turn={...vehicle.turn};for(let j=0;j<=80;j++)sparse.push({phase:'turn',edge:start,turn:{...turn,distance:turn.length*j/80}});
   for(let j=0;j<=20;j++)sparse.push({phase:'outbound-straight',edge:following,distance:4.8+j/20*7.2});
   for(let d=0;d<start.length-4.8;d+=.1)dense.push({phase:'inbound-straight',edge:start,distance:d});
   for(let j=0;j<=Math.ceil(turn.length/.05);j++)dense.push({phase:'turn',edge:start,turn:{...turn,distance:turn.length*j/Math.ceil(turn.length/.05)}});
   for(let d=4.8;d<=following.length;d+=.1)dense.push({phase:'outbound-straight',edge:following,distance:d});
   const shape=new R.Cuboid(vehicle.width/2,vehicle.height/2,vehicle.length/2);
   for(const [resolution,samples] of [['legacy-123',sparse],['whole-segment-dense',dense]]){
   const contacts=[];
   for(let j=0;j<samples.length;j++){
    const s=samples[j];vehicle.edge=s.edge;vehicle.distance=s.distance??0;vehicle.turn=s.turn??null;traffic.pose(vehicle);const center=new THREE.Vector3(0,vehicle.height/2,0).applyQuaternion(vehicle.quaternion).add(vehicle.position);
    sim.world.intersectionsWithShape(center,vehicle.quaternion,shape,c=>{const t=colliderOwner(c);if(!t)return true;const hit=c.contactShape(shape,center,vehicle.quaternion,.01);if(hit&&hit.distance<-.005)contacts.push({sample:j,phase:s.phase,position:vehicle.position.toArray(),component:t.mesh.userData.component??null,facilityId:t.mesh.userData.facilityId??null,buildingId:t.mesh.userData.buildingId??null,label:t.label,penetration:-hit.distance});return true;},R.QueryFilterFlags.EXCLUDE_DYNAMIC,undefined,sim.playerCollider,sim.player);
   }
   must(contacts.length===0,'A fixed building or site facility obstructs the real taxi lane or turn.',{resolution,from:start.a.point.toArray(),count:contacts.length,contacts});
   rows.push({resolution,from:start.a.point.toArray(),samples:samples.length,contacts});
   }
  }
  must(data.buildings.filter(b=>b.id==='way/455025059').length===1,'The original OSM row was removed instead of only its unsupported volume.');
  must(!sim.targets.some(t=>t.mesh.userData.buildingId==='way/455025059'),'The excluded above-ground volume retains collision.');
  return{rows,baseline:'변경 전 같은246자세에서54접촉이 있었다. controls-30-road-collision.json의 원본 차도 전체1278자세도 함께 재검사하며 현재 허용 접촉은0이다. 미확인 지상체적만 제외했고 원본 도로, 건물 윤곽과 DEM은 유지한다.',busRoutesUsingRoad:plan.routes.filter(r=>r.segments.some(s=>s.roadId===south.id)).map(r=>r.id)};
 });
}catch(e){results.push({name:'full scene and raw passage registration',status:'FAIL',message:e.message,details:e.details});console.log('FAIL '+e.message);}
finally{
 if(traffic)traffic.dispose();if(sim){sim.world.removeCharacterController(sim.controller);sim.world.free();}
 const matches=sourceStillMatches();fs.writeFileSync(output,JSON.stringify({...report,hashes,sourceStillMatches:matches},null,2)+'\n');
 if(results.some(r=>r.status==='FAIL')||Object.values(matches).some(v=>!v))process.exitCode=1;
}

