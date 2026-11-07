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
const BASELINE='2dffc895bc4e1fb8e29440d44c09f0f7125b33d8';
const baselineRoot=pathToFileURL(path.join(root,'artifacts/humanities-upper-access-test/historical-src')+path.sep).href;
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

const output=path.join(root,'artifacts/humanities-upper-access-test/results.json'),results=[];
fs.mkdirSync(path.dirname(output),{recursive:true});
const must=(ok,message,details)=>{if(!ok)throw Object.assign(new Error(message),{details});};
const check=async(name,fn)=>{try{results.push({name,status:'PASS',...await fn()});console.log('PASS '+name);}catch(e){results.push({name,status:'FAIL',message:e.message,details:e.details});console.log('FAIL '+name+' '+e.message);}};
const up=new THREE.Vector3(0,1,0),down=up.clone().negate();
const geometryHash=g=>sha(Buffer.concat(Object.keys(g.attributes).sort().map(k=>{const a=g.attributes[k].array;return Buffer.from(a.buffer,a.byteOffset,a.byteLength)})));
const signature=t=>JSON.stringify({data:t.mesh.userData,m:t.mesh.matrixWorld.elements,size:t.size.toArray(),geometry:geometryHash(t.mesh.geometry),collision:t.collisionVertices?sha(Buffer.from(t.collisionVertices.buffer)):null});
function preservedRoads(before,after,bounds){
 const boxes=g=>{const p=g.attributes.position,rows=[];for(let i=0;i<p.count;i+=3){const ids=[i,i+1,i+2],xs=ids.map(k=>p.getX(k)),zs=ids.map(k=>p.getZ(k));rows.push({minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs)});}return rows;};
 const overlaps=(a,b)=>a.maxX>=b.minX&&a.minX<=b.maxX&&a.maxZ>=b.minZ&&a.minZ<=b.maxZ;
 const regions=[bounds,...boxes(before).filter(b=>overlaps(b,bounds))];
 const rows=g=>{const b=boxes(g),keys=Object.keys(g.attributes).sort(),out=[];for(let i=0;i<b.length;i++){if(regions.some(r=>overlaps(b[i],r)))continue;const vertices=[0,1,2].map(j=>JSON.stringify(keys.map(key=>{const a=g.attributes[key];return[key,Array.from(a.array.slice((i*3+j)*a.itemSize,(i*3+j+1)*a.itemSize))]})));const rotations=[0,1,2].map(j=>vertices.slice(j).concat(vertices.slice(0,j)).join('|'));out.push(rotations.sort()[0]);}return out.sort();};
 const a=rows(before),b=rows(after),oldSet=new Set(a),newSet=new Set(b);must(a.length===b.length&&sha(a.join('\n'))===sha(b.join('\n')),'Road triangles changed outside the building 6 approaches',{before:a.length,after:b.length,added:b.filter(v=>!oldSet.has(v)).slice(0,3),removed:a.filter(v=>!newSet.has(v)).slice(0,3)});return{unchangedTriangles:a.length,declaredBounds:bounds,originalBoundaryTriangles:regions.length-1};
}

let sim;
try {
 const env=await buildWorld(),{world,terrain,data,campus}=env,id='connection/humanities-upper',shell=world.getObjectByName(id),q=shell.userData.humanitiesUpperAccess;
 const at=p=>new THREE.Vector3(p[0],terrain.meshHeightAt(...p)+.06,p[1]);
 sim=env.makeSimulation(at(q.route[0]).addScaledVector(up,1.8));const move=movementTools(sim);
 const settle=p=>{sim.teleport(p.clone().addScaledVector(up,1.8));for(let i=0;i<90;i++)sim.step(1/60,0,0,false);};
 await check('mapped approach changes preserve every existing building and rear stair',async()=>{
  assert(q.dimensionsEstimated&&q.railDesignEstimated&&!q.finishesPhotoVerified);assert.equal(q.geometry.meshes,1);assert.equal(q.geometry.textures,0);assert(q.geometry.triangles<22000&&q.geometry.colliders<550);
  const seven=world.getObjectByName('landmark/humanities7').userData.humanities7Access;assert.equal(seven.documentedAboveGroundLevels,4);assert.equal(seven.floorArrangementVerified,false);
  const [tm,cm]=await Promise.all(['terrain.ts','fullCampus.ts'].map(n=>import(new URL(n,baselineRoot))));const old=new THREE.Scene(),ot=tm.createTerrain(old,JSON.parse(read('public/data/terrain.json')),data.buildings),oc=cm.createFullCampus(old,data,ot.heightAt);old.updateMatrixWorld(true);
  const [tr,pl,ad,info,gr,gyu]=await Promise.all(['transitFacilities.ts','centralPlazaFacilities.ts','administrationPlazaFacilities.ts','informationCourtApproach.ts','administrationPlazaGround.ts','gyujanggakApproach.ts'].map(n=>import(new URL(n,baselineRoot))));
  tr.createTransitFacilities(old,JSON.parse(read('public/data/transit-facilities.json')),ot.heightAt);pl.createCentralPlazaFacilities(old,ot.heightAt);ad.createAdministrationPlazaFacilities(old,data,ot.heightAt);info.createInformationCourtApproach(old,ot.heightAt);gr.createAdministrationPlazaGround(old,ot.heightAt);gyu.createGyujanggakApproach(old,ot.heightAt);old.updateMatrixWorld(true);
  assert.equal(geometryHash(terrain.mesh.geometry),geometryHash(ot.mesh.geometry));
  const before14=await buildWorld({humanities14Exterior:false,humanities1:false,humanities2:false,humanities35Exterior:false,education10Exterior:false,education11Exterior:false});const a=oc.breakables,b=before14.campus.breakables.filter(t=>t.mesh.userData.connectionId!==id);assert.equal(a.length,b.length);a.forEach((t,i)=>assert.equal(signature(t),signature(b[i]),'Existing part '+i));
  const roads={};for(const name of ['campus-road-surface','campus-pedestrian-surface'])roads[name]=preservedRoads(old.getObjectByName(name).geometry,before14.world.getObjectByName(name).geometry,q.maskedPolylineOverlay.bounds);
  for(const file of ['public/data/campus.json','public/data/terrain.json','public/data/campus-transit.json','sources/campus.osm'])assertCampusSourcePreserved(file,read(file),gitBytes(file));
  return{unchangedParts:a.length,terrainExact:true,rawInputsExact:true,geometry:q.geometry,roads};
 });
 await check('building 6 to building 14 rear road can be walked both ways at mobile and desktop speeds',()=>{
  const walks=[],rear=world.getObjectByName('connection/humanities-14-stair').userData.humanities14Access;
  const points=[[526.82,-602.07],...q.route,[600.14518285,-591.75390029],[626.81,-556.44]];
  for(const speed of[6,8])for(const reverse of[false,true]){const path=(reverse?[...points].reverse():points).map(at);settle(path[0]);const result=move.walk(path.slice(1),speed);walks.push({speed,reverse,...result});}
  must(walks.every(w=>w.reached&&w.maxPenetration<.035),'Approach blocked or penetrating',walks.filter(w=>!w.reached||w.maxPenetration>=.035));return{walks};
 });
 await check('new stairs and paving match visible and physical floors',()=>{
  const specs=campus.breakables.filter(t=>t.mesh.userData.connectionId===id),samples=[];
  for(const spec of specs.filter(t=>['mapped-stair-tread','upper-path-paving','turn-landing'].includes(t.mesh.userData.component))){const p=spec.mesh.position.clone();p.y+=spec.size.y/2+.08;sim.setFocus(p,true);sim.world.step();world.updateMatrixWorld(true);const length=spec.size.y+.2;let checked=false;
   for(const [dx,dz]of[[0,0],[.1,0],[-.1,0],[0,.1],[0,-.1],[.22,0],[-.22,0],[0,.22],[0,-.22]]){const origin=p.clone().add(new THREE.Vector3(dx,0,dz));if(!new THREE.Raycaster(origin,down,0,length).intersectObject(spec.mesh,false).length)continue;const visual=new THREE.Raycaster(origin,down,0,length).intersectObjects(shell.children,false)[0],hit=sim.world.castRay(new R.Ray(origin,down),length,true,R.QueryFilterFlags.EXCLUDE_DYNAMIC,undefined,sim.playerCollider,sim.player);if(hit&&hit.timeOfImpact<.001)continue;must(hit&&visual&&Math.abs(hit.timeOfImpact-visual.distance)<.008,'Floor mismatch',{component:spec.mesh.userData.component,p:origin.toArray(),physics:hit?.timeOfImpact,render:visual?.distance});samples.push({component:spec.mesh.userData.component,difference:Math.abs(hit.timeOfImpact-visual.distance)});checked=true;break;}must(checked,'Floor sample missing',{component:spec.mesh.userData.component,p:p.toArray()});
  }return{samples};
 });
 await check('stairs and rails retain damage at a distance and restore on reset',()=>{
  const original=shell.children.map(m=>geometryHash(m.geometry)),far=new THREE.Vector3(2000,30,1500);env.update(far);assert(shell.visible);
  for(const component of['mapped-stair-tread','estimated-metal-handrail']){const target=sim.targets.find(t=>t.mesh.userData.connectionId===id&&t.mesh.userData.component===component);sim.hit(target,100,new THREE.Vector3(0,0,1));env.update(far);assert.equal(target.mesh.visible,false);}
  assert.notDeepEqual(shell.children.map(m=>geometryHash(m.geometry)),original);sim.reset();env.update(far);assert.deepEqual(shell.children.map(m=>geometryHash(m.geometry)),original);
  return{damageReset:true,farVisible:true};
 });
}finally{if(sim){sim.world.removeCharacterController(sim.controller);sim.world.free();}const matches=sourceStillMatches();fs.writeFileSync(output,JSON.stringify({scope:'6동에서 14동 뒤 계단으로 이어지는 지도상 통로. 마감과 난간은 사진 미확인 근사다.',baselineCommit:BASELINE,results,hashes,baselineHashes,sourceStillMatches:matches},null,2)+'\n');if(results.some(r=>r.status==='FAIL')||Object.values(matches).some(v=>!v))process.exitCode=1;}
