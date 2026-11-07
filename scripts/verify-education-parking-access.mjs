import {assertCampusSourcePreserved, campusAtHistoricalFootprints} from './assert-campus-source-preserved.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {registerHooks} from 'node:module';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hashes={},baselineHashes={};
const BASELINE='bd7941e43dbd6aa8da74bdedc1c6db5a409b3354';
const baselineRoot=pathToFileURL(path.join(root,'artifacts/education-parking-access-test/historical-src')+path.sep).href;
const gitBytes=file=>execFileSync('git',['-c','safe.directory='+root,'show',BASELINE+':'+file],{cwd:root,maxBuffer:64*1024*1024});
const sourceRoot=pathToFileURL(path.join(root,'src')+path.sep).href;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=f=>{const bytes=fs.readFileSync(path.join(root,f));hashes[f]=sha(bytes);return bytes;};

// 생산 모듈을 메모리에서 변환한다. 공용 컴파일 캐시에는 쓰지 않는다.
registerHooks({
 resolve(specifier,context,next){
  if(specifier.startsWith(baselineRoot))return {url:specifier,shortCircuit:true};
  if(context.parentURL?.startsWith(baselineRoot)&&specifier.startsWith('.')&&!path.extname(specifier))return {url:new URL(specifier+'.ts',context.parentURL).href,shortCircuit:true};
  if(context.parentURL?.startsWith(sourceRoot)&&specifier.startsWith('.')&&!path.extname(specifier))return {url:new URL(specifier+'.ts',context.parentURL).href,shortCircuit:true};
  return next(specifier,context);
 },
 load(url,context,next){
  if(url.startsWith(baselineRoot)&&url.endsWith('.ts')){const file='src/'+url.slice(baselineRoot.length),bytes=gitBytes(file);baselineHashes[file]=sha(bytes);return {format:'module',shortCircuit:true,source:ts.transpileModule(bytes.toString('utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText};}

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
 const data=campusAtHistoricalFootprints(json('public/data/campus.json'),gitBytes('public/data/campus.json')),dem=json('public/data/terrain.json'),plan=json('public/data/campus-transit.json'),facilitiesPlan=json('public/data/transit-facilities.json');
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

const output=path.join(root,'artifacts/education-parking-access-test/results.json'),results=[];
fs.mkdirSync(path.dirname(output),{recursive:true});
const report={scope:'실제 전체 장면의 /659 하강로와 짧은 지하 포털을 검사한다. 현장 실측, 전체 주차장 구성 또는 브라우저 검증을 주장하지 않는다.',baselineCommit:BASELINE,results,harnessSha256:sha(fs.readFileSync(new URL(import.meta.url)))};
const must=(condition,message,details)=>{if(!condition)throw Object.assign(new Error(message),{details});};
const check=(name,fn)=>{try{results.push({name,status:'PASS',...fn()});console.log('PASS '+name);}catch(e){results.push({name,status:'FAIL',message:e.message,details:e.details});console.log('FAIL '+name+' '+e.message);}};
const vec=p=>Array.isArray(p)?new THREE.Vector3(...p):new THREE.Vector3(p.x,p.y??0,p.z),up=new THREE.Vector3(0,1,0),down=up.clone().negate(),H=p=>new THREE.Vector3(p.x,p.y,-p.z);
let sim,traffic;
try{
 read('src/main.ts');
 const env=await buildWorld(),{world,terrain,data}=env,road=data.roads.find(r=>r.id==='way/1544714433/659'),building=data.buildings.find(b=>b.id==='way/297046999'),{Traffic}=await sourceModule('traffic');
 const shell=world.children.find(o=>o.userData.buildingId===building.id&&o.userData.role==='building-shell'),access=shell?.userData.parkingAccess;
 must(road&&access,'The actual campus has no parking approach metadata.');
 const origin=new THREE.Vector3(road.points[0][0],0,road.points[0][1]),axis=new THREE.Vector3(road.points[1][0]-origin.x,0,road.points[1][1]-origin.z).normalize(),side=new THREE.Vector3(-axis.z,0,axis.x),at=(s,n=0)=>origin.clone().addScaledVector(axis,s).addScaledVector(side,n),length=Math.hypot(road.points[1][0]-origin.x,road.points[1][1]-origin.z);
 const near=at(15).setY(terrain.heightAt(at(15).x,at(15).z)+2),far=near.clone().add(new THREE.Vector3(900,0,900));sim=env.makeSimulation(near);
 const moving=movementTools(sim),meshes=[];world.traverse(o=>{if(o.isMesh&&!o.isInstancedMesh)meshes.push(o);});
 let ownerByBody=new Map();
 const update=p=>{env.update(p);world.updateMatrixWorld(true);};
 const focus=p=>{sim.setFocus(p,true);sim.world.step();ownerByBody=new Map(sim.targets.filter(t=>t.body).map(t=>[t.body.handle,t]));};
 const owner=c=>ownerByBody.get(c.parent()?.handle),describe=t=>t?{buildingId:t.mesh.userData.buildingId??null,component:t.mesh.userData.component??null,label:t.label}:null;
 const visible=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};
 const render=(p,d,max)=>new THREE.Raycaster(world.scale.z<0?H(p):p,world.scale.z<0?H(d):d,0,max).intersectObjects(meshes.filter(visible),false);
 const cast=(p,d,max)=>sim.world.castRay(new R.Ray(p,d),max,true,R.QueryFilterFlags.EXCLUDE_DYNAMIC,undefined,sim.playerCollider,sim.player);
 const floor=p=>{const q=new THREE.Vector3(Math.fround(p.x),0,Math.fround(p.z)),ground=terrain.meshHeightAt(q.x,q.z),from=q.clone().setY(Math.fround(ground+.7));focus(from);const h=cast(from,down,1.5),v=render(from,down,1.5)[0];must(h&&v&&h.timeOfImpact>.005,'A parking floor probe starts inside a structure or lacks a surface.',{point:q.toArray(),ground,owner:h&&describe(owner(h.collider))});return{point:q.setY(from.y-h.timeOfImpact),renderedY:v.point.y,render:v.object.name,physical:h,owner:owner(h.collider),ground,difference:Math.abs(from.y-h.timeOfImpact-v.point.y)};};
 const reset=()=>{world.scale.z=1;sim.reset();update(near);};
 const settle=p=>{const f=floor(p);sim.teleport(f.point.clone().addScaledVector(up,1.75));for(let i=0;i<60;i++)sim.step(1/60,0,0,false);must(!moving.contacts().length,'Parking access starts with capsule penetration.',moving.contacts());return f;};
 const verifyWalk=w=>{must(w.reached&&w.maxPenetration<.025&&w.segments.every(s=>!s.penetrations.length),'The actual parking route blocks or penetrates a fixed surface.',w);};
 update(near);
 const historical=await import(new URL('terrain.ts',baselineRoot)),{createTerrain}=await sourceModule('terrain'),dem=JSON.parse(read('public/data/terrain.json')),old=historical.createTerrain(new THREE.Scene(),dem,data.buildings),off=createTerrain(new THREE.Scene(),dem,data.buildings,{educationParking:false,dining76:false,dining76East:false,education101:false,education12:false});
 report.geometry={targets:sim.targets.length,parkingAccess:access,terrainCorrection:terrain.mesh.userData.educationParkingCorrection};
 check('raw roads and protected 204 remain aligned with the release 33 terrain',()=>{
  for(const file of['public/data/campus.json','public/data/terrain.json','sources/campus.osm'])assertCampusSourcePreserved(file,read(file),gitBytes(file));
  const bytes=v=>Buffer.from(v.buffer,v.byteOffset,v.byteLength);assert(bytes(old.vertices).equals(bytes(off.vertices)),'Disabled parking correction changed baseline terrain vertices.');assert(bytes(old.indices).equals(bytes(off.indices)),'Disabled parking correction changed baseline terrain indices.');
  const education12Regions=terrain.heightAt.education12CorrectionRegions??[];
  must(education12Regions.length>0,'The separately tested education12 correction has no declared region.');
  for(const r of education12Regions)must([r.minX,r.maxX,r.minZ,r.maxZ].every(Number.isFinite)&&r.minX>=528&&r.maxX<=613&&r.minZ>=-842&&r.maxZ<=-723&&r.minX<r.maxX&&r.minZ<r.maxZ,'The separately tested education12 correction escaped its declared local area.',r);
  report.separatelyTestedEducation12={regions:education12Regions,test:'scripts/verify-education12-access.mjs'};
  const path204=data.roads.find(r=>r.id==='way/455018302/204'),samples=[];
  for(let i=1;i<path204.points.length;i++){const a=path204.points[i-1],b=path204.points[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),count=Math.ceil(len/.5);for(let j=0;j<=count;j++)for(const n of[-path204.width/2,0,path204.width/2]){const x=a[0]+dx*j/count-dz/len*n,z=a[1]+dz*j/count+dx/len*n;samples.push({segment:i-1,x,z,n,logicalDifference:Math.abs(terrain.heightAt(x,z)-old.heightAt(x,z)),meshDifference:Math.abs(terrain.meshHeightAt(x,z)-old.meshHeightAt(x,z))});}}
  const anchors=data.buildings.filter(b=>['way/297046999','way/297047243','way/386890828'].includes(b.id)).flatMap(b=>{const points=[...b.points,[b.points.reduce((s,p)=>s+p[0],0)/b.points.length,b.points.reduce((s,p)=>s+p[1],0)/b.points.length]];return points.map(p=>({id:b.id,point:p,difference:Math.abs(terrain.heightAt(...p)-old.heightAt(...p))}));});
  const maximumDifference=Math.max(...samples.flatMap(p=>[p.logicalDifference,p.meshDifference]),...anchors.map(a=>a.difference));must(maximumDifference<.00001,'Parking cut changes an existing protected path or building anchor.',{maximumDifference,failures:samples.filter(s=>s.logicalDifference>=.00001||s.meshDifference>=.00001),anchors:anchors.filter(a=>a.difference>=.00001)});
  const boundaryNodes=new Map(),boundaryEdges=[];for(let i=0;i<terrain.vertices.length;i+=3){const p=new THREE.Vector3(terrain.vertices[i],terrain.vertices[i+1],terrain.vertices[i+2]),q=p.clone().sub(origin),n=q.dot(side);if(Math.abs(n+4.2)<.0001)boundaryNodes.set(i/3,{id:i/3,point:p.toArray(),s:q.dot(axis),n,heightDifference:p.y-old.meshHeightAt(p.x,p.z)});}const seenBoundaryEdges=new Set();for(let i=0;i<terrain.indices.length;i+=3)for(let k=0;k<3;k++){const a=terrain.indices[i+k],b=terrain.indices[i+(k+1)%3],key=Math.min(a,b)+','+Math.max(a,b);if(boundaryNodes.has(a)&&boundaryNodes.has(b)&&!seenBoundaryEdges.has(key)){seenBoundaryEdges.add(key);boundaryEdges.push([boundaryNodes.get(a),boundaryNodes.get(b)]);}}
  const eastBoundary=[];for(const s of[0,15,28.08,45,50])for(const n of[-4.21,-4.2,-4.19]){const q=at(s,n),y=terrain.meshHeightAt(q.x,q.z),before=old.meshHeightAt(q.x,q.z),p=q.clone().setY(y+1);focus(p);const h=sim.world.castRay(new R.Ray(p,down),2,true,undefined,undefined,sim.playerCollider,sim.player,c=>c.shapeType()===R.ShapeType.TriMesh),v=new THREE.Raycaster(p,down,0,2).intersectObject(terrain.mesh,false)[0],row={s,n,point:q.toArray(),baselineY:before,meshY:y,changedY:y-before,physicalY:h&&p.y-h.timeOfImpact,renderedY:v?.point.y};must(h&&v&&Math.abs(h.timeOfImpact-v.distance)<.025,'The narrowed east cut boundary differs between actual terrain rendering and physics.',row);if(n<-4.2)must(Math.abs(y-before)<.00001,'The cut escapes the east boundary toward the existing 221 entrance.',row);if(n===-4.2){row.boundaryEdges=boundaryEdges.filter(edge=>Math.min(...edge.map(p=>p.s))<=s+.0001&&Math.max(...edge.map(p=>p.s))>=s-.0001);row.boundaryVertices=[...new Map(row.boundaryEdges.flatMap(edge=>edge).map(p=>[p.id,p])).values()];must(row.boundaryVertices.length>=2&&row.boundaryVertices.every(p=>Math.abs(p.heightDifference)<.00001),'The actual rounded east boundary vertices changed the original terrain height.',row);}eastBoundary.push(row);}
  return{samples:samples.length,maximumDifference,limit:.00001,anchors,eastBoundary,scope:'옆 /204 전체 길이와 폭 양끝, 220/221/222 중심과 꼭짓점, 좁힌 동측 절개 경계의 실제 지형을 검사한다. 명목 경계는 Float32 절단 변에서 수십 마이크로미터 차이가 날 수 있어 렌더/물리 수치로 기록하고, 실제 경계 정점과 바깥 1cm의 원지형 보존을 별도로 확인한다. 경계 양쪽 표본은 동일 좌표의 단차로 표현하지 않는다. 미세한 Float32 재삼각분할 차이가 있으며 보정 off 결과만 기존 전체 지형 바이트와 같아야 한다.'};
 });
 check('new core floor matches actual terrain rendering and physics while descending monotonically',()=>{
  reset();const rows=[],failures=[],monotonic=[];let minimumPortalHeadroom=Infinity;
  for(let s=-4.5;s<=45;s+=.5)for(const n of[-2.5,-1.265,0,1.265,2.5]){
   const f=floor(at(s,n)),p=f.point.clone().addScaledVector(up,.06);focus(p);const ceiling=cast(p,up,3.2),headroom=ceiling?ceiling.timeOfImpact+.06:null;
   const row={s,n,point:f.point.toArray(),terrainY:f.ground,physicalOwner:describe(f.owner),render:f.render,difference:f.difference,terrainClearance:f.point.y-f.ground,headroom};rows.push(row);
   if(f.difference>.025||headroom!==null&&headroom<1.8||f.point.y<f.ground-.005)failures.push(row);
   if(s<0&&headroom!==null)minimumPortalHeadroom=Math.min(minimumPortalHeadroom,headroom);
  }
  for(const n of[-2.5,-1.265,0,1.265,2.5]){const line=rows.filter(r=>r.n===n&&r.s>=0);for(let i=1;i<line.length;i++)if(line[i].terrainY+.0001<line[i-1].terrainY)monotonic.push({from:line[i-1],to:line[i]});}
  must(!failures.length,'A new core floor differs from rendering or loses head clearance.',failures.slice(0,20));must(!monotonic.length,'The corrected road has a reverse grade inside its core.',monotonic.slice(0,10));must(Number.isFinite(minimumPortalHeadroom)&&Math.abs(minimumPortalHeadroom-access.portal.clearHeight)<.025,'The portal headroom does not match its declared game geometry.',{minimumPortalHeadroom,declared:access.portal.clearHeight});
  const transitions=[];for(const s of[45,55])for(const n of[-2.5,0,2.5]){const left=floor(at(s-.01,n)),right=floor(at(s+.01,n)),difference=Math.abs(left.point.y-right.point.y);must(difference<.025,'A parking transition has an abrupt height gap.',{s,n,difference});transitions.push({s,n,sampleSeparation:.02,difference});}
  const portalThreshold=[];for(const n of[-2.5,-1.265,0,1.265,2.5]){const inside=floor(at(-.01,n)),outside=floor(at(.01,n)),difference=inside.point.y-outside.point.y;must(Math.abs(difference)<.025&&inside.owner?.mesh.userData.component==='education-parking-portal-floor'&&!outside.owner,'The portal threshold exceeds the floor limit or has an unexpected owner.',{n,difference,inside:describe(inside.owner),outside:describe(outside.owner)});portalThreshold.push({n,sampleSeparation:.02,insideY:inside.point.y,outsideY:outside.point.y,difference,insideOwner:describe(inside.owner),outsideOwner:describe(outside.owner)});}
  return{samples:rows.length,maximumDifference:Math.max(...rows.map(r=>r.difference)),limit:.025,minimumPortalHeadroom,transitions,portalThreshold,monotonicSurface:'actual terrain mesh, excluding the separate portal floor lip',scope:'새 core와 포털 바닥의 실제 최고 표면을 검사한다. 단조 경사는 지형 상면으로 판단하고 포털의 약 1cm 문턱은 별도로 기록한다. 전환 표본은 2cm 떨어져 있으므로 동일 좌표의 불연속 단차와 혼동하지 않는다. /206 교차로의 기존 높은 도로 표시는 이 정밀도 범위에 포함하지 않는다.'};
 });
 check('three full scene return walks enter the portal and the retaining sides remain solid',()=>{
  const paths=[];
  for(const n of[-1.265,0,1.265]){reset();const route=[58,45,30,15,2,0,-3.8].map(s=>at(s,n));settle(route[0]);const entered=moving.walk(route.slice(1));verifyWalk(entered);const returned=moving.walk(route.slice(0,-1).reverse());verifyWalk(returned);paths.push({n,entered,returned});}
  const health=world.children.find(o=>o.userData.buildingId==='way/297047243'&&o.userData.role==='building-shell'),entry=health?.userData.entries?.find(e=>e.name==='existing-core-entrance'),healthEntrance=[];must(entry,'The neighboring existing 221 entrance is missing.');
  const hOrigin=vec(health.userData.localOrigin),hAxis=vec(health.userData.axis).setY(0).normalize(),hAcross=new THREE.Vector3(-hAxis.z,0,hAxis.x),hp=(x,y,z)=>hOrigin.clone().addScaledVector(hAxis,x).addScaledVector(hAcross,z).addScaledVector(up,y),door=sim.targets.find(t=>t.mesh.userData.buildingId==='way/297047243'&&t.mesh.userData.component===entry.name+'-door');must(door,'The neighboring 221 door is not independently destructible.');
  for(const offset of[-1.2,0,1.2]){reset();const start=hp(entry.startX-1.5,0,entry.z+offset),inside=hp(entry.x+2.7,entry.floor,entry.z+offset);settle(start);const closed=moving.walk([inside]);must(!closed.reached&&closed.segments.some(s=>s.blockers.some(b=>b.component===entry.name+'-door')),'The new parking cut or facilities block the existing 221 approach before its closed door.',{offset,closed});sim.hit(door,100,hAxis);update(near);const entered=moving.walk([inside]);verifyWalk(entered);const returned=moving.walk([start]);verifyWalk(returned);healthEntrance.push({offset,start:start.toArray(),closed,entered,returned});}
  reset();settle(at(-3.8));const beyond=moving.walk([at(-6.2)]);must(!beyond.reached&&beyond.segments.some(s=>s.blockers.some(b=>b.component==='education-parking-portal-back')),'The short garage interior has no closing back wall.',beyond);
  const walls=[];for(const s of[10,30])for(const n of[-1,1]){const f=floor(at(s)),p=f.point.clone().addScaledVector(up,1),d=side.clone().multiplyScalar(n);focus(p);const h=cast(p,d,4),v=render(p,d,4)[0];must(h&&v&&access.wallComponents.includes(owner(h.collider)?.mesh.userData.component),'A retaining side is missing or has no matching wall owner.',{s,n,owner:h&&describe(owner(h.collider))});must(Math.abs(h.timeOfImpact-v.distance)<.025,'A retaining wall plane differs from its collider.',{s,n,physical:h.timeOfImpact,rendered:v.distance});walls.push({s,n,physical:h.timeOfImpact,rendered:v.distance,owner:describe(owner(h.collider))});}
  return{speed:6,paths,healthEntrance,backWall:beyond,walls,scope:'중앙과 양쪽 차로를 도보로 왕복하고 짧은 내부 끝의 닫힘을 확인한다. 기존 221 현관도 중앙과 양쪽에서 닫힌 문까지 접근한 뒤 문을 파괴하고 왕복한다. 전체 지하주차장 동선은 재현 범위가 아니다.'};
 });
 check('actual taxi lanes and dead end turns avoid the new walls and low portal',()=>{
  reset();const plan=JSON.parse(read('public/data/campus-transit.json'));traffic=new Traffic(new THREE.Scene(),data.roads,terrain.heightAt,plan);
  const busRoutes=plan.routes.filter(r=>r.segments.some(s=>s.roadId===road.id));must(!busRoutes.length,'An unexpected confirmed bus route enters the low garage.');
  const vehicle=traffic.vehicles.find(v=>v.service==='taxi'),edges=traffic.edges.filter(e=>e.roadId===road.id),shape=new R.Cuboid(vehicle.width/2,vehicle.height/2,vehicle.length/2),rows=[];
  const inspect=(edge,distance,turn,phase)=>{vehicle.edge=edge;vehicle.distance=distance;vehicle.turn=turn;traffic.pose(vehicle);const center=new THREE.Vector3(0,vehicle.height/2,0).applyQuaternion(vehicle.quaternion).add(vehicle.position);focus(center);const contacts=[];sim.world.intersectionsWithShape(center,vehicle.quaternion,shape,c=>{const t=owner(c);if(!t)return true;const hit=c.contactShape(shape,center,vehicle.quaternion,.01);if(hit&&hit.distance<-.005)contacts.push({...describe(t),penetration:-hit.distance});return true;},R.QueryFilterFlags.EXCLUDE_DYNAMIC,undefined,sim.playerCollider,sim.player);rows.push({phase,position:vehicle.position.toArray(),contacts});};
  for(const edge of edges){for(let s=0;s<=Math.ceil(edge.length*2);s++)inspect(edge,Math.min(s/2,edge.length),null,'straight');for(const next of edge.b.edges.filter(e=>e.allowed)){vehicle.edge=edge;vehicle.next=next;vehicle.turn=null;traffic.startTurn(vehicle);const turn={...vehicle.turn};for(let i=0;i<=60;i++)inspect(edge,edge.length,{...turn,distance:turn.length*i/60},`turn:${next.roadId}`);}}
  const failures=rows.filter(r=>r.contacts.length);must(!failures.length,'The actual taxi trajectory intersects a fixed wall or low portal.',{count:failures.length,failures:failures.slice(0,20)});
  return{samples:rows.length,contacts:0,dimensions:{width:vehicle.width,height:vehicle.height,length:vehicle.length},busRoutes:[],scope:'실제 Traffic의 차로와 회전곡선,차량충돌상자를 사용한 위치별 검사다. 전체 시간 운행이나 실제 주차장 운영을 재현했다는 검사가 아니다.'};
 });
 check('one H and distance preserve a wall damage hole and two reset restorations',()=>{
  reset();const direction=side.clone(),seamSamples=[];
  for(const station of[14.95,15,15.05]){
   const p=floor(at(station)).point.addScaledVector(up,1);focus(p);const h=cast(p,direction,4),v=render(p,direction,4)[0],loadedOwner=h&&owner(h.collider);sim.setFocus(far,true);const u=sim.castUnloadedTargets(p,direction,4),unloadedOwner=u?.target;
   const row={station,origin:p.toArray(),loaded:h?.timeOfImpact,unloaded:u?.distance,rendered:v?.distance,loadedTarget:sim.targets.indexOf(loadedOwner),unloadedTarget:sim.targets.indexOf(unloadedOwner),loadedStationRange:loadedOwner?.mesh.userData.stationRange,unloadedStationRange:unloadedOwner?.mesh.userData.stationRange,ownerMatches:loadedOwner===unloadedOwner};seamSamples.push(row);
   must(h&&u&&v&&loadedOwner?.mesh.userData.component==='education-parking-retaining-wall'&&unloadedOwner?.mesh.userData.component==='education-parking-retaining-wall'&&Math.abs(h.timeOfImpact-u.distance)<.002&&Math.abs(h.timeOfImpact-v.distance)<.025,'A wall seam or neighboring interior face has a surface gap.',row);
   if(station!==15)must(loadedOwner===unloadedOwner,'An interior wall face changes owner between loaded and unloaded queries.',row);
   else if(loadedOwner!==unloadedOwner){const a=row.loadedStationRange,b=row.unloadedStationRange;must(a&&b&&a.some(s=>Math.abs(s-station)<1e-8)&&b.some(s=>Math.abs(s-station)<1e-8)&&loadedOwner.mesh.userData.side===unloadedOwner.mesh.userData.side,'Different wall owners do not share the sampled seam.',row);}
  }
  const p=floor(at(15.67)).point.addScaledVector(up,1);focus(p);const physical=cast(p,direction,4),shown=render(p,direction,4)[0],target=physical&&owner(physical.collider);must(target&&shown&&access.wallComponents.includes(target.mesh.userData.component),'The representative retaining face is not exposed.');
  const max=physical.timeOfImpact+.015;sim.setFocus(far,true);const unloaded=sim.castUnloadedTargets(p,direction,4);must(unloaded?.target===target&&Math.abs(unloaded.distance-physical.timeOfImpact)<.002,'Loaded and unloaded wall collision differs.',{origin:p.toArray(),loaded:physical.timeOfImpact,unloaded:unloaded?.distance,loadedTarget:sim.targets.indexOf(target),unloadedTarget:unloaded&&sim.targets.indexOf(unloaded.target),loadedOwner:describe(target),unloadedOwner:unloaded&&describe(unloaded.target)});
  world.scale.z=-1;update(near);const reflected=render(p,direction,4)[0];must(reflected&&Math.abs(reflected.distance-shown.distance)<.001,'One H changes the wall surface.');sim.hit(target,100,direction);update(near);
  for(const distance of[279,281,900]){const observer=near.clone().add(new THREE.Vector3(distance,0,distance));sim.setFocus(observer,true);update(observer);must(!sim.castUnloadedTargets(p,direction,max)&&!render(p,direction,max).length,'A destroyed parking wall reappears at distance.',{distance});}
  for(let cycle=0;cycle<2;cycle++){sim.reset();update(near);focus(p);const h=cast(p,direction,4),v=render(p,direction,4)[0];must(h&&owner(h.collider)===target&&v&&Math.abs(v.distance-shown.distance)<.001,'Parking wall reset does not restore the original surfaces.');if(cycle===0)sim.hit(target,100,direction);}
  return{component:target.mesh.userData.component,loaded:physical.timeOfImpact,unloaded:unloaded.distance,rendered:shown.distance,distances:[279,281,900],resetCycles:2,seamSamples,seamScope:'같은 접합선과 양쪽 5cm 안쪽 면을 함께 검사한다. 정확한 접합선에서 인접 두 부품 중 어느 하나를 고르는 차이는 거리와 실제 공통 끝을 별도로 확인하며, 파괴 구멍은 부품 내부 표면에서 검사한다.'};
 });
}catch(e){results.push({name:'parking access full scene setup',status:'FAIL',message:e.message,details:e.details});console.log('FAIL '+e.message);}
finally{if(sim){sim.world.removeCharacterController(sim.controller);sim.world.free();}traffic?.dispose?.();const matches=sourceStillMatches();fs.writeFileSync(output,JSON.stringify({...report,hashes,baselineHashes,sourceStillMatches:matches},null,2)+'\n');if(results.some(r=>r.status==='FAIL')||Object.values(matches).some(v=>!v))process.exitCode=1;}
