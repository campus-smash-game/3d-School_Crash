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
const BASELINE='7378c5d7448ac4c0587dc37b0015346af6cf2236';
const baselineRoot=pathToFileURL(path.join(root,'artifacts/education12-access-test/historical-src')+path.sep).href;
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

async function buildWorld(historical=false){
 await R.init();
 const names=['terrain','scene','fullCampus','physics','transitFacilities','centralPlazaFacilities','administrationPlazaFacilities','informationCourtApproach','administrationPlazaGround','gyujanggakApproach'];
 const [terrainModule,gateModule,campusModule,physicsModule,transitModule,plazaModule,adminModule,informationModule,groundModule,gyujanggakModule]=await Promise.all(names.map(historical?oldModule:sourceModule));
 const json=f=>JSON.parse(read(f));
 const data=campusAtHistoricalFootprints(json('public/data/campus.json'),gitBytes('public/data/campus.json')),dem=json('public/data/terrain.json'),plan=json('public/data/campus-transit.json'),facilitiesPlan=json('public/data/transit-facilities.json');
 const originalRoads=data.roads.length;data.roads.push(...(plan.supplementalRoads??[]));
 const world=new THREE.Scene(),terrain=terrainModule.createTerrain(world,dem,data.buildings),gate=gateModule.createCampus(world,{full:true}),campus=campusModule.createFullCampus(world,data,terrain.heightAt);
 const facilities=[transitModule.createTransitFacilities(world,facilitiesPlan,terrain.heightAt),plazaModule.createCentralPlazaFacilities(world,terrain.heightAt),adminModule.createAdministrationPlazaFacilities(world,data,terrain.heightAt),informationModule.createInformationCourtApproach(world,terrain.heightAt),groundModule.createAdministrationPlazaGround(world,terrain.heightAt),gyujanggakModule.createGyujanggakApproach(world,terrain.heightAt)];
 world.updateMatrixWorld(true);
 return {world,terrain,data,dem,plan,campus,facilities,originalRoads,createTerrain:terrainModule.createTerrain,makeSimulation(spawn){return new physicsModule.Simulation([...gate.breakables,...campus.breakables,...facilities.flatMap(f=>f.breakables)],[...gate.colliders,...campus.colliders],spawn,data.bounds,terrain);},update(point){campus.update(point);for(const f of facilities)f.update(point);}};
}

const bytes=v=>Buffer.from(v.buffer,v.byteOffset,v.byteLength);
const oldModule=n=>import(new URL(n+'.ts',baselineRoot));
const up=new THREE.Vector3(0,1,0),down=up.clone().negate(),H=p=>new THREE.Vector3(p.x,p.y,-p.z);
const vec=p=>Array.isArray(p)?new THREE.Vector3(p[0],p.length===3?p[1]:0,p.at(-1)):new THREE.Vector3(p.x,p.y??0,p.z);
const visible=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};
const geometryHash=g=>sha(Buffer.concat([...(g.index?[bytes(g.index.array)]:[]),...Object.keys(g.attributes).sort().map(k=>bytes(g.attributes[k].array))]));
const signature=t=>JSON.stringify({matrix:t.mesh.matrixWorld.elements,size:t.size.toArray(),geometry:geometryHash(t.mesh.geometry),convex:t.collisionVertices?sha(bytes(t.collisionVertices)):null});
const meshList=o=>{const result=[];o.traverse(c=>{if(c.isMesh)result.push(c);});return result;};
function movementTools(sim){
 const describe=c=>{const body=c.parent(),target=body?sim.targets.find(t=>t.body?.handle===body.handle):undefined;return{collider:c.handle,buildingId:target?.mesh.userData.buildingId??null,connectionId:target?.mesh.userData.connectionId??null,component:target?.mesh.userData.component??null,label:target?.label??(body?'unmapped body':'terrain or static')};};
 const contacts=()=>{const shape=sim.playerCollider.shape,p=sim.player.translation(),q=sim.playerCollider.rotation(),out=[];sim.world.intersectionsWithShape(p,q,shape,c=>{const hit=c.contactShape(shape,p,q,.02);if(hit&&hit.distance<-.01)out.push({...describe(c),penetration:-hit.distance,point:hit.point1});return true;},R.QueryFilterFlags.EXCLUDE_DYNAMIC,undefined,sim.playerCollider,sim.player);return out;};
 const blockers=()=>Array.from({length:sim.controller.numComputedCollisions()},(_,i)=>sim.controller.computedCollision(i)).filter(c=>c?.collider).map(c=>({...describe(c.collider),normal:c.normal1,point:c.witness1}));
 function walk(route){const segments=[],penetrationEvents=[];let maxPenetration=0,maxLateralDeviation=0;for(const dest of route){const lineStart=new THREE.Vector3().copy(sim.player.translation()),line=dest.clone().sub(lineStart).setY(0),lineLength=line.length();let stalled=0,frames=0,last=new THREE.Vector3().copy(sim.player.translation());for(;frames<1800;frames++){const p=sim.player.translation(),dx=dest.x-p.x,dz=dest.z-p.z,d=Math.hypot(dx,dz);if(d<.12)break;const speed=Math.min(6,d*60);sim.step(1/60,dx/d*speed,dz/d*speed,false);const q=new THREE.Vector3().copy(sim.player.translation());stalled=q.distanceTo(last)<.002?stalled+1:0;last=q;if(lineLength>.01)maxLateralDeviation=Math.max(maxLateralDeviation,Math.abs((q.x-lineStart.x)*line.z-(q.z-lineStart.z)*line.x)/lineLength);if(frames%10===0)for(const c of contacts()){if(c.penetration>maxPenetration)penetrationEvents.push({segment:segments.length,frame:frames,player:q.toArray(),destination:dest.toArray(),...c});maxPenetration=Math.max(maxPenetration,c.penetration);}if(stalled>120)break;}const p=sim.player.translation(),distance=Math.hypot(dest.x-p.x,dest.z-p.z);segments.push({dest:dest.toArray(),frames,end:{...p},distance,penetrations:contacts(),blockers:distance>.2?blockers():[]});if(distance>.2)break;}return{reached:segments.length===route.length&&segments.at(-1).distance<.2,maxPenetration,maxLateralDeviation,penetrationEvents,segments};}
 return{contacts,blockers,walk};
}
const walkOnly=process.argv.includes('--walk-only');
const directory=path.join(root,'artifacts/education12-access-test'),output=path.join(directory,walkOnly?'walk-diagnostic.json':'results.json'),results=[];
fs.mkdirSync(directory,{recursive:true});if(fs.existsSync(output))fs.copyFileSync(output,path.join(directory,`previous-results-${new Date().toISOString().replaceAll(':','-')}.json`));
const report={baselineCommit:BASELINE,scope:'39차 12동 열린 중간층과 별도 111동 카페 및 도로변 계단을 실제 전체 장면으로 검사한다. 치수는 게임 근사이며 사진 관측이나 현장 실측 검사가 아니다.',results,harnessSha256:sha(fs.readFileSync(new URL(import.meta.url)))};
const must=(ok,message,details)=>{if(!ok)throw Object.assign(Error(message),{details})};
const sourceStillMatches=()=>Object.fromEntries(Object.entries(hashes).map(([f,h])=>[f,sha(fs.readFileSync(path.join(root,f)))===h]));
const save=running=>fs.writeFileSync(output,JSON.stringify({...report,running,hashes,baselineHashes,sourceStillMatches:sourceStillMatches()},null,2)+'\n');
const check=async(name,fn)=>{if(walkOnly&&!name.includes('continuous real capsule'))return;try{results.push({name,status:'PASS',...await fn()});console.log('PASS '+name);}catch(e){results.push({name,status:'FAIL',message:e.message,details:e.details});console.log('FAIL '+name+' '+e.message);}save(true)};
let sim,traffic,oldTraffic,historicalEnv,historicalSim,historicalQueries;function triangleSamples(mesh){
 const geometry=mesh.geometry,position=geometry.attributes.position,index=geometry.index,rows=[];
 const count=index?index.count:position.count;
 for(let i=0;i<count;i+=3){const vertices=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(position,index?index.getX(i+k):i+k).applyMatrix4(mesh.matrixWorld)),normal=vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0])),area=normal.length()/2;if(area<1e-10)continue;normal.normalize();rows.push({index:i/3,vertices,normal,area,point:vertices[0].clone().add(vertices[1]).add(vertices[2]).multiplyScalar(1/3)});}
 return rows;
}
function queries(env,simulation,near){
 const {world,terrain}=env,meshes=meshList(world),moving=movementTools(simulation);let owners=new Map();
 const update=p=>{env.update(p);world.updateMatrixWorld(true);};
 const focus=p=>{simulation.setFocus(p,true);simulation.world.step();owners=new Map(simulation.targets.filter(t=>t.body).map(t=>[t.body.handle,t]));};
 const owner=c=>owners.get(c.parent()?.handle);
 const describe=t=>t?{index:simulation.targets.indexOf(t),buildingId:t.mesh.userData.buildingId??null,connectionId:t.mesh.userData.connectionId??null,component:t.mesh.userData.component??null,label:t.label}:null;
 const render=(p,d,max)=>new THREE.Raycaster(world.scale.z<0?H(p):p,world.scale.z<0?H(d):d,0,max).intersectObjects(meshes.filter(visible),false);
 const cast=(p,d,max)=>simulation.world.castRay(new R.Ray(p,d),max,true,R.QueryFilterFlags.EXCLUDE_DYNAMIC,undefined,simulation.playerCollider,simulation.player);
 const reset=()=>{world.scale.z=1;simulation.reset();update(near);};
 const floor=(p,startY)=>{const q=vec(p);q.x=Math.fround(q.x);q.z=Math.fround(q.z);const ground=terrain.meshHeightAt(q.x,q.z),from=q.clone().setY(startY??ground+.75);focus(from);const h=cast(from,down,Math.max(2,from.y-ground+1)),v=render(from,down,Math.max(2,from.y-ground+1))[0];must(h&&v&&h.timeOfImpact>.005,'A floor probe starts in solid geometry or finds no surface.',{point:q.toArray(),ground,startY:from.y,physical:h?.timeOfImpact,owner:h&&describe(owner(h.collider)),render:v?.object.name});return{point:q.setY(from.y-h.timeOfImpact),ground,physical:h,owner:owner(h.collider),rendered:v,difference:Math.abs(h.timeOfImpact-v.distance)};};
 const settle=(p,startY)=>{const f=floor(p,startY);simulation.teleport(f.point.clone().addScaledVector(up,1.75));for(let i=0;i<75;i++)simulation.step(1/60,0,0,false);must(!moving.contacts().length,'A walk starts with capsule penetration.',{requestedPoint:vec(p).toArray(),physicalFloor:f.point.toArray(),contacts:moving.contacts()});return f;};
 const verifyWalk=w=>must(w.reached&&w.maxPenetration<.025&&w.segments.every(s=>!s.penetrations.length),'A real 6 m/s walk is blocked or penetrates fixed geometry.',w);
 return{moving,update,focus,owner,describe,render,cast,reset,floor,settle,verifyWalk};
}

function terrainTopology(env,q){
 const {terrain,data}=env,vertices=terrain.vertices,indices=terrain.indices,regions=terrain.heightAt.education12CorrectionRegions;
 const edges=new Map(),patch=[],invalid=[];
 for(let i=0;i<indices.length;i+=3){
  const ids=[indices[i],indices[i+1],indices[i+2]],points=ids.map(id=>new THREE.Vector3(vertices[id*3],vertices[id*3+1],vertices[id*3+2])),cross=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0]));
  if(!points.every(p=>p.toArray().every(Number.isFinite))||cross.lengthSq()<=1e-20)invalid.push({triangle:i/3,ids,points:points.map(p=>p.toArray())});
  for(let j=0;j<3;j++){const a=ids[j],b=ids[(j+1)%3],key=a<b?`${a},${b}`:`${b},${a}`;edges.set(key,(edges.get(key)??0)+1);}
  const p=points[0].clone().add(points[1]).add(points[2]).multiplyScalar(1/3);
  if(regions.some(r=>p.x>=r.minX&&p.x<=r.maxX&&p.z>=r.minZ&&p.z<=r.maxZ))patch.push({triangle:i/3,p});
 }
 must(!invalid.length,'The final Float32 terrain has degenerate or invalid triangles.',invalid.slice(0,10));
 const bounds=env.dem.bounds??data.bounds,open=[];
 for(const[key,count]of edges){if(count===2)continue;const ids=key.split(',').map(Number),p=ids.map(id=>({x:vertices[id*3],z:vertices[id*3+2]})),outer=count===1&&(['minX','maxX'].some(k=>p.every(v=>Math.abs(v.x-bounds[k])<.001))||['minZ','maxZ'].some(k=>p.every(v=>Math.abs(v.z-bounds[k])<.001)));if(!outer)open.push({ids,count,points:p});}
 must(!open.length,'The terrain has an interior open edge or a nonmanifold edge.',{count:open.length,examples:open.slice(0,15)});
 must(patch.length>0,'The declared education12 terrain region has no actual triangles.');
 let maxHeightDifference=0,maxPhysicalDifference=0;const failures=[],physicalRows=[];
 let terrainHandle;sim.world.forEachCollider(c=>{if(c.shape.type===R.ShapeType.TriMesh&&!c.parent())terrainHandle=c.handle;});
 must(terrainHandle!==undefined,'The real terrain trimesh collider is missing.');
 for(let i=0;i<patch.length;i++){
  const {triangle,p}=patch[i],height=terrain.meshHeightAt(p.x,p.z),difference=Math.abs(height-p.y);maxHeightDifference=Math.max(maxHeightDifference,difference);if(difference>.0001)failures.push({triangle,p:p.toArray(),height,difference});
  if(i%Math.max(1,Math.floor(patch.length/160))!==0)continue;
  const from=new THREE.Vector3(...p.clone().addScaledVector(up,.7).toArray().map(Math.fround)),expected=terrain.meshHeightAt(from.x,from.z),hit=sim.world.castRay(new R.Ray(from,down),1.4,true,R.QueryFilterFlags.EXCLUDE_DYNAMIC,undefined,sim.playerCollider,sim.player,c=>c.handle===terrainHandle),physical=hit?Math.abs(from.y-hit.timeOfImpact-expected):Infinity;maxPhysicalDifference=Math.max(maxPhysicalDifference,physical);physicalRows.push({triangle,point:p.toArray(),rayOrigin:from.toArray(),expectedHeight:expected,difference:physical});if(physical>.0001)failures.push({triangle,p:p.toArray(),physical});
 }
 must(!failures.length,'Terrain triangles, height queries and the real trimesh collider disagree.',{count:failures.length,examples:failures.slice(0,15)});
 return{triangles:indices.length/3,localTriangles:patch.length,interiorOpenEdges:0,invalidTriangles:0,maxHeightDifference,maxPhysicalDifference,physicalSamples:physicalRows.length,scope:'최종 Float32 정점과 전체 인덱스의 내부 닫힘을 검사한다. 국소 삼각형 중심에서 실제 메시 평면과 높이 함수를 대조하고 약 160개 표본은 실제 Rapier 지형 충돌체와 직접 비교한다.'};
}


try{
 const env=await buildWorld(),near=new THREE.Vector3(579,61,-790),world=env.world;
 sim=env.makeSimulation(near);const q=queries(env,sim,near);q.update(near);
 const cafe=world.getObjectByName('landmark/pascucci111'),edu=world.getObjectByName('landmark/education12');
 const ca=cafe?.userData.cafeAccess,ea=edu?.userData.education12Access;
 must(ca&&ea,'Both actual building modules and their access metadata are required.',{cafe:!!cafe,edu:!!edu,eduChildren:world.children.filter(o=>o.userData.buildingId==='way/238936704').map(o=>({name:o.name,data:o.userData}))});
 const owned=t=>['way/238936704','way/439707885'].includes(t.mesh.userData.buildingId);
 await check('release38 raw data and terrain outside the declared local correction remain preserved',async()=>{
  for(const file of['sources/campus.osm','public/data/campus.json','public/data/terrain.json','public/data/campus-transit.json'])assertCampusSourcePreserved(file,read(file),gitBytes(file));
  const oldTerrain=(await oldModule('terrain')).createTerrain(new THREE.Scene(),env.dem,env.data.buildings),disabled=env.createTerrain(new THREE.Scene(),env.dem,env.data.buildings,{education12:false});
  assert(bytes(disabled.vertices).equals(bytes(oldTerrain.vertices)),'Disabling education12 does not restore release38 vertices.');assert(bytes(disabled.indices).equals(bytes(oldTerrain.indices)),'Disabling education12 does not restore release38 indices.');
  const regions=env.terrain.heightAt.education12CorrectionRegions;must(regions?.length,'The local correction has no declared region.');
  const outside=(x,z)=>!regions.some(r=>x>=r.minX-.001&&x<=r.maxX+.001&&z>=r.minZ-.001&&z<=r.maxZ+.001);
  let samples=0,maxDifference=0;for(let i=0;i<oldTerrain.vertices.length;i+=3){const x=oldTerrain.vertices[i],z=oldTerrain.vertices[i+2];if(!outside(x,z))continue;const d=Math.abs(env.terrain.meshHeightAt(x,z)-oldTerrain.meshHeightAt(x,z));samples++;maxDifference=Math.max(maxDifference,d);must(d<.0001,'Terrain moved outside its declared region.',{x,z,d});}
  let triangleSamples=0;for(let i=0;i<env.terrain.indices.length;i+=3){let x=0,z=0;for(let k=0;k<3;k++){const j=env.terrain.indices[i+k]*3;x+=env.terrain.vertices[j]/3;z+=env.terrain.vertices[j+2]/3;}if(!outside(x,z))continue;const d=Math.abs(env.terrain.meshHeightAt(x,z)-oldTerrain.meshHeightAt(x,z));triangleSamples++;maxDifference=Math.max(maxDifference,d);must(d<.0001,'A new triangle changed the original surface outside the declared region.',{triangle:i/3,x,z,d});}
  return{disabledByteEqual:true,samples,triangleSamples,maxDifference,regions,rawInputsPreserved:true};
 });
 await check('two separate observed buildings replace their generic closed shells',()=>{
  must(!world.getObjectByName('way/238936704:shell')&&!world.getObjectByName('way/439707885:shell'),'A generic blocking shell remains.');
  must(ca.scope.separateFrom12&&ca.roofY-ca.floorY<9,'The cafe still uses the estimated four-storey body.');
  const names=sim.targets.filter(owned).map(t=>t.mesh.userData.component);
  must(names.includes('cafe-glass-door')&&names.includes('cafe-timber-fin')&&names.includes('education12-roadside-step'),'Observed structural components are missing.');
  return{cafe:ca.geometry,education12:ea.geometry??ea.cost,partCount:sim.targets.filter(owned).length,observedScope:{cafe:ca.scope,education12:ea.scope}};
 });
 await check('real terrain triangles remain closed and agree with physical height queries',()=>terrainTopology(env,q));
 const runRoute=(name,points,doorComponent,offset=0)=>{
  const line=points.map(vec);if(offset){const d=line.at(-1).clone().sub(line[0]).setY(0).normalize(),n=new THREE.Vector3(-d.z,0,d.x);line.forEach(p=>p.addScaledVector(n,offset));}
  q.reset();const door=doorComponent?sim.targets.find(t=>owned(t)&&t.mesh.userData.component===doorComponent):null;
  let closed;
  if(door){q.settle(line[0],line[0].y+.75);closed=q.moving.walk(line.slice(1));must(!closed.reached&&closed.segments.at(-1).blockers.some(b=>b.component===doorComponent),'The closed door is not the obstruction at its entrance.',{name,closed});sim.hit(door,100,new THREE.Vector3(1,0,0));q.update(near);}
  q.settle(line[0],line[0].y+.75);const forward=q.moving.walk(line.slice(1));try{q.verifyWalk(forward);}catch(e){throw Object.assign(e,{details:{name,offset,direction:'forward',walk:e.details}});}
  const backward=q.moving.walk(line.slice(0,-1).reverse());try{q.verifyWalk(backward);}catch(e){throw Object.assign(e,{details:{name,offset,direction:'backward',walk:e.details}});}
  return{name,offset,closed,forward,backward};
 };
 await check('cafe door and open porch support continuous real capsule movement',()=>({routes:[runRoute('cafe entrance',ca.entry.routeWorld,ca.entry.component),runRoute('cafe porch',ca.porch.routeWorld)]}));
 await check('cafe street apron supports continuous real capsule movement from the existing road',async()=>{
  const {pascucci111Point}=await sourceModule('pascucci111Landmark');
  const routes=[];
  for(const u of[2,7.6,11.4]){
   const inner=pascucci111Point(u,-3.1),entry=pascucci111Point(u,-1.8);
   const edge=ca.roadsideApron.boundary.map(vec).reduce((a,b)=>Math.hypot(b.x-inner[0],b.z-inner[1])<Math.hypot(a.x-inner[0],a.z-inner[1])?b:a);
   const outward=edge.clone().sub(new THREE.Vector3(inner[0],edge.y,inner[1])).setY(0).normalize(),start=edge.clone().addScaledVector(outward,.8);
   start.y=env.terrain.heightAt(start.x,start.z);
   routes.push(runRoute('cafe street apron '+u,[start.toArray(),edge.toArray(),[inner[0],ca.floorY,inner[1]],[entry[0],ca.floorY,entry[1]]],null));
  }
  return{routes,roadCenterClearance:ca.roadsideApron.roadCenterClearance};
 });
 await check('roadside stair and upper sidewalk support continuous real capsule movement',()=>{
  const routes=[];for(const offset of[-.75,0,.75])routes.push(runRoute('roadside stairs',ca.roadsideStair.routeWorld,null,offset));return{routes,stepCount:ca.roadsideStair.steps.length,rise:(ca.roadsideStair.topY-ca.roadsideStair.bottomY)/ca.roadsideStair.count};
 });
 await check('open terrace and lower entry support continuous real capsule movement',()=>{
  const routes=[];for(const entry of[ea.entry,ea.lowerEntry]){must(entry?.routeWorld?.length,'Missing actual entry route metadata.');routes.push(runRoute(entry===ea.entry?'terrace entrance':'lower entrance',entry.routeWorld,entry.door?.component??entry.component));}
  if(ea.externalStairs?.routeWorld)routes.push(runRoute('external stairs',ea.externalStairs.routeWorld));
  must(ea.openTerrace?.routeWorld?.length,'Missing open terrace path metadata.');routes.push(runRoute('open terrace',ea.openTerrace.routeWorld));return{routes};
 });
 await check('observed entrance paving and stair treads remain above the actual terrain',()=>{
  q.reset();const components=new Set(['cafe-grey-paved-forecourt','cafe-grey-roadside-apron','education12-front-forecourt','education12-lower-entry-apron','education12-west-lower-paving','education12-west-stair-tread','education12-west-stair-bottom-landing','education12-west-stair-top-landing','education12-roadside-step','education12-roadside-bottom-landing','education12-roadside-top-landing','education12-roadside-upper-walk']);
  const samples=[],buried=[];
  for(const target of sim.targets.filter(t=>owned(t)&&components.has(t.mesh.userData.component)))for(const triangle of triangleSamples(target.mesh)){
   if(triangle.normal.y<.7||triangle.area<.005)continue;
   for(const point of[triangle.point,...triangle.vertices.map(p=>p.clone().lerp(triangle.point,.05))]){const ground=env.terrain.meshHeightAt(point.x,point.z),row={component:target.mesh.userData.component,point:point.toArray(),clearance:point.y-ground};samples.push(row);if(row.clearance<-.005)buried.push(row);}
  }
  must(samples.length>100,'Insufficient entrance paving and stair surface probes.',{samples:samples.length});must(!buried.length,'Terrain covers an observed walk surface.',{count:buried.length,worst:[...buried].sort((a,b)=>a.clearance-b.clearance).slice(0,20)});
  return{samples:samples.length,minimumClearance:Math.min(...samples.map(r=>r.clearance)),components:[...new Set(samples.map(r=>r.component))]};
 });
 await check('new exposed walk surfaces agree between visible geometry and collider',()=>{
  q.reset();const rows=[],failures=[],occupiedProbes=[];let maximum=0,decorativeTriangles=0,decorativelyOccluded=0;
  const decorationRanges=ea.nonWalkableRenderRanges??[];
  for(const r of decorationRanges){must(r.kind==='ornamental-vegetation'&&r.endVertex>r.startVertex,'Unexpected non-walkable surface classification.',r);const mesh=edu.getObjectByName(r.mesh);must(mesh&&r.startVertex>=0&&r.endVertex<=mesh.geometry.attributes.position.count,'Invalid decoration range.',r);}
  const decoration=(mesh,faceIndex)=>decorationRanges.some(r=>r.mesh===mesh.name&&faceIndex*3>=r.startVertex&&faceIndex*3<r.endVertex);
  for(const shell of[cafe,edu])for(const mesh of meshList(shell))for(const t of triangleSamples(mesh)){
   if(decoration(mesh,t.index)){decorativeTriangles++;continue;}
   if(t.normal.y<.7||t.area<.012)continue;
   const p=t.point.clone(),ground=env.terrain.meshHeightAt(p.x,p.z);if(p.y>ca.floorY+2.5||p.y<ground-.05)continue;
   q.focus(p);const start=p.clone().addScaledVector(up,.35),shown=q.render(start,down,.7)[0],hit=q.cast(start,down,.7);if(!shown||!hit)continue;
   if(decoration(shown.object,shown.faceIndex)){decorativelyOccluded++;continue;}
   if(Math.abs(shown.point.y-p.y)>.015)continue;
   if(hit.timeOfImpact<.005){occupiedProbes.push({point:p.toArray(),owner:q.describe(q.owner(hit.collider)),reason:'Probe begins inside another solid, so this is not an exposed walk surface.'});continue;}
   const difference=Math.abs(hit.timeOfImpact-shown.distance);maximum=Math.max(maximum,difference);rows.push({point:p.toArray(),mesh:mesh.name,difference,owner:q.describe(q.owner(hit.collider))});if(difference>.008)failures.push(rows.at(-1));
  }
  must(rows.length>50,'Insufficient exposed surface samples.',{count:rows.length});must(!failures.length,'A visible floor differs from physical collision.',{maximum,failures:failures.slice(0,20)});return{samples:rows.length,maximum,tolerance:.008,occupiedProbes,decorativeTriangles,decorativelyOccluded,rows};
 });
 await check('observed parts remain visible at distance and recover after damage',()=>{
  q.reset();const target=sim.targets.find(t=>t.mesh.userData.component==='cafe-sign-beam');must(target,'Missing destructible sign support.');
  const before=meshList(cafe).map(m=>({name:m.name,hash:geometryHash(m.geometry)}));
  q.update(new THREE.Vector3(1800,80,-1800));must(cafe.visible&&edu.visible,'Observed facades disappeared at distance.');
  sim.hit(target,100,new THREE.Vector3(1,0,0));q.update(near);must(!target.mesh.visible&&!cafe.getObjectByName('pascucci-observed-outline-sign').visible,'Destroyed sign remains visible.');
  sim.reset();q.update(near);must(target.mesh.visible&&cafe.getObjectByName('pascucci-observed-outline-sign').visible,'Reset did not restore sign.');
  assert.deepEqual(meshList(cafe).map(m=>({name:m.name,hash:geometryHash(m.geometry)})),before);
  const blueSupport=sim.targets.find(t=>t.mesh.userData.component==='education12-blue-sign-support'),blueSign=edu.getObjectByName('education12-observed-blue-sign');must(blueSupport&&blueSign,'Missing observed blue sign or destructible support.');
  const educationBefore=meshList(edu).map(m=>({name:m.name,hash:geometryHash(m.geometry)}));
  sim.hit(blueSupport,100,new THREE.Vector3(1,0,0));q.update(near);must(!blueSupport.mesh.visible&&!blueSign.visible,'Destroyed education sign remains visible.');
  sim.reset();q.update(near);must(blueSupport.mesh.visible&&blueSign.visible,'Reset did not restore education sign.');assert.deepEqual(meshList(edu).map(m=>({name:m.name,hash:geometryHash(m.geometry)})),educationBefore);
  const point=vec(ca.entry.center).addScaledVector(up,1.3),out=vec(ca.entry.outward),start=point.clone().addScaledVector(out,2),direction=out.clone().negate();
  q.focus(start);const a=q.render(start,direction,3)[0];world.scale.z=-1;world.updateMatrixWorld(true);const b=q.render(start,direction,3)[0];must(a&&b&&Math.abs(a.distance-b.distance)<.0001,'World reflection changes the facade intersection.');world.scale.z=1;world.updateMatrixWorld(true);
  return{before,educationBefore,distancePreserved:true,signDamageAndReset:true,educationSignDamageAndReset:true,oneReflectionError:Math.abs(a.distance-b.distance)};
 });
}catch(e){results.push({name:'education12 full scene setup',status:'FAIL',message:e.message,details:e.details});console.log('FAIL '+e.message);}
finally{sim?.world.free();save(false);}
const failures=results.filter(r=>r.status==='FAIL');console.log(JSON.stringify({pass:results.length-failures.length,fail:failures.length,output}));if(failures.length)process.exitCode=1;
