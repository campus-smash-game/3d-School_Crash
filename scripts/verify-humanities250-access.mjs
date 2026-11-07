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
const BASELINE='e00d604ebf52086285fc4b5b9f0cdb84c64cd8d4';
const baselineRoot=pathToFileURL(path.join(root,'artifacts/humanities250-access-test/historical-src')+path.sep).href;
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

async function campusBefore23(env){
 const scene=new THREE.Scene();scene.add(env.terrain.mesh.clone());
 const {createFullCampus}=await sourceModule('fullCampus');
 const campus=createFullCampus(scene,env.data,env.terrain.heightAt,{humanities23:false,humanities4:false,humanities35:false,humanities8:false,humanities7:false,humanities6:false,humanities14Exterior:false,humanities1:false,humanities2:false,humanities35Exterior:false,education10Exterior:false,education11Exterior:false});scene.updateMatrixWorld(true);return campus;
}

function movementTools(sim){
 const describe=c=>{const body=c.parent(),target=body?sim.targets.find(t=>t.body?.handle===body.handle):undefined;return {collider:c.handle,buildingId:target?.mesh.userData.buildingId??null,connectionId:target?.mesh.userData.connectionId??null,component:target?.mesh.userData.component??null,label:target?.label??(body?'unmapped body':'terrain or static')};};
 const contacts=()=>{const shape=sim.playerCollider.shape,position=sim.player.translation(),rotation=sim.playerCollider.rotation(),found=[];sim.world.intersectionsWithShape(position,rotation,shape,c=>{const hit=c.contactShape(shape,position,rotation,.02);if(hit&&hit.distance<-.01)found.push({...describe(c),penetration:-hit.distance,point:hit.point1});return true;},R.QueryFilterFlags.EXCLUDE_DYNAMIC,undefined,sim.playerCollider,sim.player);return found;};
 const blockers=()=>Array.from({length:sim.controller.numComputedCollisions()},(_,i)=>sim.controller.computedCollision(i)).filter(c=>c?.collider).map(c=>({...describe(c.collider),normal:c.normal1,point:c.witness1}));
 function walk(route,requestedSpeed=6){const segments=[];let maxPenetration=0;for(const dest of route){let stalled=0,frames=0,last=new THREE.Vector3().copy(sim.player.translation());for(;frames<1600;frames++){const p=sim.player.translation(),dx=dest.x-p.x,dz=dest.z-p.z,d=Math.hypot(dx,dz);if(d<.12)break;const speed=Math.min(requestedSpeed,d*60);sim.step(1/60,dx/d*speed,dz/d*speed,false);const q=new THREE.Vector3().copy(sim.player.translation());stalled=q.distanceTo(last)<.002?stalled+1:0;last=q;if(frames%10===0)for(const c of contacts())maxPenetration=Math.max(maxPenetration,c.penetration);if(stalled>120)break;}const p=sim.player.translation(),distance=Math.hypot(dest.x-p.x,dest.z-p.z);segments.push({dest,frames,end:{...p},distance,penetrations:contacts(),blockers:distance>.2?blockers():[]});if(distance>.2)break;}return {reached:segments.length===route.length&&segments.at(-1).distance<.2,maxPenetration,segments};}
 return {contacts,blockers,walk};
}

const output=path.join(root,'artifacts/humanities250-access-test/results.json'),results=[];
fs.mkdirSync(path.dirname(output),{recursive:true});
const must=(ok,message,details)=>{if(!ok)throw Object.assign(new Error(message),{details});};
const check=async(name,fn)=>{try{results.push({name,status:'PASS',...await fn()});console.log('PASS '+name);}catch(e){results.push({name,status:'FAIL',message:e.message,details:e.details});console.log('FAIL '+name+' '+e.message);}};
const vec=p=>new THREE.Vector3(...p),up=new THREE.Vector3(0,1,0),down=up.clone().negate();
const geometryHash=g=>sha(Buffer.concat(Object.keys(g.attributes).sort().map(k=>{const a=g.attributes[k].array;return Buffer.from(a.buffer,a.byteOffset,a.byteLength)})));
const signature=t=>JSON.stringify({data:t.mesh.userData,m:t.mesh.matrixWorld.elements,size:t.size.toArray(),geometry:geometryHash(t.mesh.geometry),collision:t.collisionVertices?sha(Buffer.from(t.collisionVertices.buffer)):null});
let sim;
try{
 const env=await buildWorld(),{world,terrain,data,campus}=env,connection='connection/humanities-250',shell=world.getObjectByName(connection),q=shell.userData.humanities250;
 const {humanities250Point}=await sourceModule('humanities250');
 const at=(u,y,v)=>{const p=humanities250Point(u,v);return new THREE.Vector3(p[0],y,p[1]);};
 const gp=q.approachRoute[0]; const entry=[new THREE.Vector3(gp[0],terrain.meshHeightAt(...gp)+.055,gp[1]),at(12.8,q.entryBase,-9.6),at(12.8,q.entryTop,1.5),at(10.8,q.entryTop,1.5)];
 const start=entry[0].clone().addScaledVector(up,1.8);sim=env.makeSimulation(start);const move=movementTools(sim);
 const settle=p=>{sim.teleport(p.clone().addScaledVector(up,1.8));for(let i=0;i<90;i++)sim.step(1/60,0,0,false);};
 await check('250 preservation with the separately verified 2/3 addition disabled',async()=>{
  assert.equal(q.dimensionsEstimated,true);assert.equal(q.internalLayoutEstimated,true);assert.equal(q.geometry.meshes,2);assert.equal(q.geometry.textures,0);
  assert(q.geometry.triangles<14000);assert(q.geometry.colliders<350);
  const [tm,cm]=await Promise.all(['terrain.ts','fullCampus.ts'].map(n=>import(new URL(n,baselineRoot))));const old=new THREE.Scene(),ot=tm.createTerrain(old,JSON.parse(read('public/data/terrain.json')),data.buildings),oc=cm.createFullCampus(old,data,ot.heightAt);old.updateMatrixWorld(true);
  assert.equal(geometryHash(terrain.mesh.geometry),geometryHash(ot.mesh.geometry));
  const before23=await campusBefore23(env),other=t=>!['way/167983080','way/167984624'].includes(t.mesh.userData.buildingId),a=oc.breakables.filter(other),b=before23.breakables.filter(other);assert.equal(a.length,b.length);a.forEach((t,i)=>assert.equal(signature(t),signature(b[i]),'Unrelated part '+i));
  const roofs=list=>list.filter(t=>t.mesh.userData.buildingId==='way/167983080'&&t.mesh.userData.roof);assert.deepEqual(roofs(before23.breakables).map(signature),roofs(oc.breakables).map(signature));
  for(const file of ['public/data/campus.json','public/data/terrain.json','public/data/campus-transit.json'])assertCampusSourcePreserved(file,read(file),gitBytes(file));
  return{unchangedParts:a.length,terrainExact:true,rawInputsExact:true,building2RoofExactBeforeLaterExterior:true,building1RoofUsesFootprint:true,geometry:q.geometry};
 });
 await check('garden entry and all flights work at desktop and mobile speeds in both directions',()=>{
  const upper=[at(10.8,q.entryTop,4.6),at(4.2,q.floors[1],4.6),at(4.2,q.floors[1],1.5),at(10.8,q.floors[1]+1.75,1.5),at(10.8,q.floors[1]+1.75,4.6),at(4.2,q.floors[2],4.6),at(4.2,q.floors[2],1.5),at(10.8,q.floors[2]+1.75,1.5),at(10.8,q.floors[2]+1.75,4.6),at(4.2,q.floors[3],4.6)];
  const route=[...entry,...upper],walks=[];
  for(const speed of[6,8])for(const reverse of[false,true]){const path=reverse?[...route].reverse():route;settle(path[0]);const result=move.walk(path.slice(1),speed);walks.push({speed,reverse,...result});must(result.reached&&result.maxPenetration<.035,'Stair route blocked',{speed,reverse,...result});must(Math.abs(sim.player.translation().y-(path.at(-1).y+.875))<.3,'Route ended on wrong vertical level',{end:sim.player.translation(),expected:path.at(-1).toArray()});}
  return{walks};
 });
 await check('1 building link portals and lower flight remain walkable',()=>{
  const walks=[];
  for(const y of q.floors.slice(0,3))for(const speed of[6,8]){const route=[at(4.2,y,4.6),at(4.2,y,1.5),at(5.4,y,.5),at(5.4,y,-6.3),at(5.4,y,.5),at(4.2,y,1.5)];settle(route[0]);const result=move.walk(route.slice(1),speed);walks.push({y,speed,...result});must(result.reached&&result.maxPenetration<.035,'Link passage blocked',{y,speed,...result});}
  const route=[at(10.8,q.entryTop,1.5),at(4.2,q.base,1.5),at(10.8,q.entryTop,1.5)];settle(route[0]);const lower=move.walk(route.slice(1),8);must(lower.reached,'Lower flight blocked',lower);return{walks,lower};
 });
 await check('stair surfaces agree with physics and survive distant rendering, reflection, damage and reset',()=>{
  const meshes=shell.children.filter(o=>o.isMesh),targetSpecs=campus.breakables.filter(t=>t.mesh.userData.connectionId===connection),surfaces=targetSpecs.filter(t=>['stair-tread','storey-landing','half-landing','entry-landing','link-floor'].includes(t.mesh.userData.component)),samples=[];
  for(const spec of surfaces){const p=spec.mesh.position.clone();p.y+=spec.size.y/2+.10;sim.setFocus(p,true);sim.world.step();world.updateMatrixWorld(true);const visible=new THREE.Raycaster(p,down,0,.2).intersectObjects(meshes,false)[0],hit=sim.world.castRay(new R.Ray(p,down),.2,true,R.QueryFilterFlags.EXCLUDE_DYNAMIC,undefined,sim.playerCollider,sim.player);must(hit&&visible&&Math.abs(hit.timeOfImpact-visible.distance)<.006,'Visual and physical tread differ',{component:spec.mesh.userData.component,p:p.toArray(),physics:hit?.timeOfImpact,render:visible?.distance});samples.push({component:spec.mesh.userData.component,difference:Math.abs(hit.timeOfImpact-visible.distance)});}
  const original=meshes.map(m=>geometryHash(m.geometry)),far=new THREE.Vector3(2000,30,1500);env.update(far);assert(shell.visible);world.scale.z=-1;world.updateMatrixWorld(true);const local=at(8,q.floors[1]+1,0),reflected=world.localToWorld(local.clone());assert(Math.abs(reflected.z+local.z)<1e-6);
  const target=sim.targets.find(t=>t.mesh.userData.connectionId===connection&&t.mesh.userData.component==='stair-glazing');sim.hit(target,100,new THREE.Vector3(0,0,1));env.update(far);assert.equal(target.mesh.visible,false);assert.notDeepEqual(meshes.map(m=>geometryHash(m.geometry)),original);sim.reset();env.update(far);assert.deepEqual(meshes.map(m=>geometryHash(m.geometry)),original);world.scale.z=1;world.updateMatrixWorld(true);return{samples,damageReset:true,farVisible:true,reflection:true};
 });
}finally{if(sim){sim.world.removeCharacterController(sim.controller);sim.world.free();}const matches=sourceStillMatches();fs.writeFileSync(output,JSON.stringify({scope:'사진 기반 250동 연결부 근사 모델의 전체 장면 물리 검사. 실제 실내 배치나 치수를 보증하지 않는다.',baselineCommit:BASELINE,results,hashes,baselineHashes,sourceStillMatches:matches},null,2)+'\n');if(results.some(r=>r.status==='FAIL')||Object.values(matches).some(v=>!v))process.exitCode=1;}




