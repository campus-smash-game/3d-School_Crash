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
const BASELINE='7a26c73a68975edbfb30c3666197e9f6fc88f604';
const baselineRoot=pathToFileURL(path.join(root,'artifacts/humanities35-exterior-test/historical-src')+path.sep).href;
const gitBytes=file=>execFileSync('git',['-c','safe.directory='+root,'show',BASELINE+':'+file],{cwd:root,maxBuffer:64*1024*1024});
const sourceRoot=pathToFileURL(path.join(root,'src')+path.sep).href;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=f=>{const bytes=fs.readFileSync(path.join(root,f));hashes[f]=sha(bytes);return bytes;};

// 게임 모듈을 메모리에서 변환한다. 공용 컴파일 캐시에는 쓰지 않는다.
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

// 글자 캔버스만 대체한다. 지형, 건물, 시설과 물리는 실제 게임 모듈이다.
globalThis.document={createElement(){const canvas={width:0,height:0,textCalls:[]};canvas.getContext=()=>new Proxy({},{get(o,k){if(k==='fillText')return(...args)=>canvas.textCalls.push(args);if(k==='measureText')return s=>({width:String(s).length*20});if(k==='createLinearGradient'||k==='createRadialGradient')return()=>({addColorStop(){}});return o[k]??(()=>{});},set(o,k,v){o[k]=v;return true;}});return canvas;}};
const sourceModule=n=>import(pathToFileURL(path.join(root,'src',n+'.ts')));

async function buildWorld(options={}){
 options={engineering30:false,engineering30Dining:false,...options};
 options={science28:false,...options};
 await R.init();
 const names=['terrain','scene','fullCampus','physics','transitFacilities','centralPlazaFacilities','administrationPlazaFacilities','informationCourtApproach','administrationPlazaGround','gyujanggakApproach'];
 const [terrainModule,gateModule,campusModule,physicsModule,transitModule,plazaModule,adminModule,informationModule,groundModule,gyujanggakModule]=await Promise.all(names.map(sourceModule));
 const json=f=>JSON.parse(read(f));
 const data=campusAtHistoricalFootprints(json('public/data/campus.json'),gitBytes('public/data/campus.json')),dem=json('public/data/terrain.json'),plan=json('public/data/campus-transit.json'),facilitiesPlan=json('public/data/transit-facilities.json');
 const originalRoads=data.roads.length;data.roads.push(...(plan.supplementalRoads??[]));
 const world=new THREE.Scene(),terrain=terrainModule.createTerrain(world,dem,data.buildings),gate=gateModule.createCampus(world,{full:true}),campus=campusModule.createFullCampus(world,data,terrain.heightAt,options);
 const facilities=[transitModule.createTransitFacilities(world,facilitiesPlan,terrain.heightAt),plazaModule.createCentralPlazaFacilities(world,terrain.heightAt),adminModule.createAdministrationPlazaFacilities(world,data,terrain.heightAt),informationModule.createInformationCourtApproach(world,terrain.heightAt),groundModule.createAdministrationPlazaGround(world,terrain.heightAt),gyujanggakModule.createGyujanggakApproach(world,terrain.heightAt)];
 world.updateMatrixWorld(true);
 return {world,terrain,data,campus,facilities,originalRoads,makeSimulation(spawn){return new physicsModule.Simulation([...gate.breakables,...campus.breakables,...facilities.flatMap(f=>f.breakables)],[...gate.colliders,...campus.colliders],spawn,data.bounds,terrain);},update(point){campus.update(point);for(const f of facilities)f.update(point);}};
}

function sourceStillMatches(){return Object.fromEntries(Object.entries(hashes).map(([f,h])=>[f,sha(fs.readFileSync(path.join(root,f)))===h]));}

function movementTools(sim){
 const describe=c=>{const body=c.parent(),target=body?sim.targets.find(t=>t.body?.handle===body.handle):undefined;return {collider:c.handle,buildingId:target?.mesh.userData.buildingId??null,connectionId:target?.mesh.userData.connectionId??null,component:target?.mesh.userData.component??null,label:target?.label??(body?'unmapped body':'terrain or static')};};
 const contacts=()=>{const shape=sim.playerCollider.shape,position=sim.player.translation(),rotation=sim.playerCollider.rotation(),found=[];sim.world.intersectionsWithShape(position,rotation,shape,c=>{const hit=c.contactShape(shape,position,rotation,.02);if(hit&&hit.distance<-.01)found.push({...describe(c),penetration:-hit.distance,point:hit.point1});return true;},R.QueryFilterFlags.EXCLUDE_DYNAMIC,undefined,sim.playerCollider,sim.player);return found;};
 const blockers=()=>Array.from({length:sim.controller.numComputedCollisions()},(_,i)=>sim.controller.computedCollision(i)).filter(c=>c?.collider).map(c=>({...describe(c.collider),normal:c.normal1,point:c.witness1}));
 function walk(route,requestedSpeed=6){const segments=[];let maxPenetration=0,worstContact=null;for(const dest of route){let stalled=0,frames=0,last=new THREE.Vector3().copy(sim.player.translation());for(;frames<1600;frames++){const p=sim.player.translation(),dx=dest.x-p.x,dz=dest.z-p.z,d=Math.hypot(dx,dz);if(d<.12)break;const speed=Math.min(requestedSpeed,d*60);sim.step(1/60,dx/d*speed,dz/d*speed,false);const q=new THREE.Vector3().copy(sim.player.translation());stalled=q.distanceTo(last)<.002?stalled+1:0;last=q;if(frames%10===0)for(const c of contacts())if(c.penetration>maxPenetration){maxPenetration=c.penetration;worstContact={...c,position:{...sim.player.translation()},frames};}if(stalled>120)break;}const p=sim.player.translation(),distance=Math.hypot(dest.x-p.x,dest.z-p.z);segments.push({dest,frames,end:{...p},distance,penetrations:contacts(),blockers:distance>.2?blockers():[]});if(distance>.2)break;}return {reached:segments.length===route.length&&segments.at(-1).distance<.2,maxPenetration,worstContact,segments};}
 return {contacts,blockers,walk};
}


const awaitFrame=await sourceModule("humanities23Site");

const output=path.join(root,'artifacts/humanities35-exterior-test/results.json'),results=[];fs.mkdirSync(path.dirname(output),{recursive:true});
const must=(ok,message,details)=>{if(!ok)throw Object.assign(new Error(message),{details});};
const check=async(name,fn)=>{try{results.push({name,status:'PASS',...await fn()});console.log('PASS '+name);}catch(e){results.push({name,status:'FAIL',message:e.message,details:e.details});console.log('FAIL '+name+' '+e.message);}};
const geometryHash=g=>sha(Buffer.concat(Object.keys(g.attributes).sort().map(k=>{const a=g.attributes[k].array;return Buffer.from(a.buffer,a.byteOffset,a.byteLength)})));
const signature=t=>JSON.stringify({data:t.mesh.userData,m:t.mesh.matrixWorld.elements,size:t.size.toArray(),geometry:geometryHash(t.mesh.geometry),collision:t.collisionVertices?sha(Buffer.from(t.collisionVertices.buffer)):null});
const up=new THREE.Vector3(0,1,0),down=up.clone().negate(),ids=['way/167983609','way/167983611'];let sim;
try{
 const env=await buildWorld(),{world,terrain,data,campus}=env,shells=['3','5'].map(n=>world.getObjectByName('landmark/humanities'+n+'-exterior'));
 sim=env.makeSimulation(new THREE.Vector3(450,48,-670));
 await check('3 and 5 facade replacement preserves other objects, connections, roads and terrain',async()=>{
  const [tm,cm]=await Promise.all(['terrain.ts','fullCampus.ts'].map(n=>import(new URL(n,baselineRoot))));const old=new THREE.Scene(),ot=tm.createTerrain(old,JSON.parse(read('public/data/terrain.json')),data.buildings),oc=cm.createFullCampus(old,data,ot.heightAt);
  const [tr,pl,ad,info,gr,gyu]=await Promise.all(['transitFacilities.ts','centralPlazaFacilities.ts','administrationPlazaFacilities.ts','informationCourtApproach.ts','administrationPlazaGround.ts','gyujanggakApproach.ts'].map(n=>import(new URL(n,baselineRoot))));
  tr.createTransitFacilities(old,JSON.parse(read('public/data/transit-facilities.json')),ot.heightAt);pl.createCentralPlazaFacilities(old,ot.heightAt);ad.createAdministrationPlazaFacilities(old,data,ot.heightAt);info.createInformationCourtApproach(old,ot.heightAt);gr.createAdministrationPlazaGround(old,ot.heightAt);gyu.createGyujanggakApproach(old,ot.heightAt);old.updateMatrixWorld(true);
  const prior=await buildWorld({education10Exterior:false,education11Exterior:false});const other=t=>!ids.includes(t.mesh.userData.buildingId)||!!t.mesh.userData.connectionId,a=oc.breakables.filter(other),b=prior.campus.breakables.filter(other);assert.equal(a.length,b.length);a.forEach((t,i)=>assert.equal(signature(t),signature(b[i]),'Unrelated object '+i));
  assert.equal(geometryHash(terrain.mesh.geometry),geometryHash(ot.mesh.geometry));for(const name of['campus-road-surface','campus-pedestrian-surface'])assert.equal(geometryHash(world.getObjectByName(name).geometry),geometryHash(old.getObjectByName(name).geometry));
  for(const file of['public/data/campus.json','public/data/terrain.json','public/data/campus-transit.json','sources/campus.osm'])assertCampusSourcePreserved(file,read(file),gitBytes(file));
  const geometry=shells.map(s=>{const q=s.userData.humanities35Exterior;assert(q.dimensionsEstimated&&q.photoFaceMappingEstimated);assert.equal(q.wholeInteriorImplemented,false);assert(q.geometry.meshes===2&&q.geometry.textures===0&&q.geometry.triangles<85000&&q.geometry.colliders<1000);return {number:q.number,...q.geometry,floor:q.floor,roof:q.roof,openings:q.openings.length};});
  return{unchangedParts:a.length,geometry,terrainExact:true,roadsExact:true,rawInputsExact:true};
 });
 await check('both winding directions put photo detail outside their respective buildings',()=>{
  const {humanities23Frame}=awaitFrame,samples=[];
  for(const shell of shells){const q=shell.userData.humanities35Exterior,b=data.buildings.find(b=>b.id===q.buildingId),ring=b.points.slice(0,-1),area=ring.reduce((v,a,i)=>{const c=ring[(i+1)%ring.length];return v+a[0]*c[1]-c[0]*a[1]},0),edge=q.number==='3'?1:8;const f=area>0?humanities23Frame(ring[edge],ring[(edge+1)%ring.length]):humanities23Frame(ring[(edge+1)%ring.length],ring[edge]);
   const p=f.point(f.length*.45,-2),target=f.point(f.length*.45),dir=new THREE.Vector3(target[0]-p[0],0,target[1]-p[1]).normalize(),origin=new THREE.Vector3(p[0],q.floor+5.2,p[1]);world.updateMatrixWorld(true);
   const hit=new THREE.Raycaster(origin,dir,0,2.5).intersectObjects(shell.children,false)[0];must(hit&&hit.distance<1.69,'Facade decorations face inward',{number:q.number,area,distance:hit?.distance});samples.push({number:q.number,sourceWinding:Math.sign(area),distance:hit.distance});
  }return{samples};
 });
 await check('footprint roofs and balcony floors match their own colliders and visible surface',()=>{
  const samples=[];
  for(const shell of shells){const q=shell.userData.humanities35Exterior,meshes=shell.children.filter(o=>o.isMesh),specs=campus.breakables.filter(t=>t.mesh.userData.buildingId===q.buildingId&&!t.mesh.userData.connectionId&&['footprint-roof','end-balcony-floor'].includes(t.mesh.userData.component));
   for(const spec of specs){const p=spec.mesh.position.clone();p.y+=spec.size.y/2+.06;sim.setFocus(p,true);sim.world.step();world.updateMatrixWorld(true);let checked=false;
    for(const [dx,dz]of[[0,0],[.22,0],[-.22,0],[0,.22],[0,-.22]]){const origin=p.clone().add(new THREE.Vector3(dx,0,dz)),own=new THREE.Raycaster(origin,down,0,spec.size.y+.2).intersectObject(spec.mesh,false)[0];if(!own)continue;const target=sim.targets.find(t=>t.mesh===spec.mesh),hit=target?.body?.collider(0).castRay(new R.Ray(origin,down),spec.size.y+.2,true),visual=new THREE.Raycaster(origin,down,0,spec.size.y+.2).intersectObjects(meshes,false)[0];must(hit!==undefined&&hit>=0&&visual&&Math.abs(hit-own.distance)<.008&&Math.abs(visual.distance-own.distance)<.008,'Roof or balcony mismatch',{building:q.number,component:spec.mesh.userData.component,physics:hit,own:own.distance,visual:visual?.distance});samples.push({building:q.number,component:spec.mesh.userData.component,error:Math.abs(hit-own.distance)});checked=true;break;}must(checked,'No valid floor probe',{building:q.number,component:spec.mesh.userData.component});
   }
  }return{samples};
 });
 await check('photo details follow damage at distance and restore with their buildings',()=>{
  const far=new THREE.Vector3(2100,40,1500);env.update(far);const original=shells.map(s=>s.children.filter(o=>o.isMesh).map(m=>geometryHash(m.geometry)));
  for(const [i,id]of ids.entries()){const components=['brick-facade-bay','deep-roof-eave','white-concrete-pilaster',...(i===0?['end-balcony-floor','balcony-door']:[])];for(const component of components){const t=sim.targets.find(t=>t.mesh.userData.buildingId===id&&t.mesh.userData.component===component);assert(t);sim.hit(t,100,new THREE.Vector3(0,0,1));env.update(far);assert.equal(t.mesh.visible,false);}assert(shells[i].visible);assert.notDeepEqual(shells[i].children.filter(o=>o.isMesh).map(m=>geometryHash(m.geometry)),original[i]);}
  sim.reset();env.update(far);assert.deepEqual(shells.map(s=>s.children.filter(o=>o.isMesh).map(m=>geometryHash(m.geometry))),original);world.scale.z=-1;world.updateMatrixWorld(true);assert.equal(world.localToWorld(new THREE.Vector3(450,40,-650)).z,650);return{farVisible:true,damageReset:true,reflection:true};
 });
}finally{if(sim){sim.world.removeCharacterController(sim.controller);sim.world.free();}const matches=sourceStillMatches();fs.writeFileSync(output,JSON.stringify({scope:'3동과 5동 외관 검사. 입구와 연결교는 별도 실제 이동 검사로 확인한다.',baselineCommit:BASELINE,results,hashes,baselineHashes,sourceStillMatches:matches},null,2)+'\n');if(results.some(r=>r.status==='FAIL')||Object.values(matches).some(v=>!v))process.exitCode=1;}
