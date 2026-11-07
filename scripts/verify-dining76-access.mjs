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
const stairDiagnostic=process.argv.includes('--stair-diagnostic');
const surfaceDiagnostic=process.argv.includes('--surface-diagnostic');
const trafficDiagnostic=process.argv.includes('--traffic-diagnostic');
const BASELINE='e62bf9f62ea90b303683d6f7f12a6dcbe2eebe90';
const sourceRoot=pathToFileURL(path.join(root,'src')+path.sep).href;
const baselineRoot=pathToFileURL(path.join(root,'artifacts/dining76-access-test/historical-src')+path.sep).href;
const hashes={},baselineHashes={},historicalBytes=new Map();
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const snapshotInputs=new Set(['src/dining76Approach.ts','src/dining76Site.ts','src/dining76Terrain.ts','src/terrain.ts','src/fullCampus.ts','src/traffic.ts']);
const read=file=>{const bytes=fs.readFileSync(path.join(root,file)),hash=sha(bytes);if(hashes[file]&&hashes[file]!==hash)throw Error(`Input changed while running: ${file}`);hashes[file]=hash;if(snapshotInputs.has(file)){const folder=path.join(root,'artifacts/dining76-access-test/input-snapshots');fs.mkdirSync(folder,{recursive:true});const name=path.join(folder,path.basename(file,'.ts')+'.'+hash+'.ts');if(!fs.existsSync(name))fs.writeFileSync(name,bytes);}return bytes;};
const json=file=>JSON.parse(read(file));
const gitBytes=file=>{if(!historicalBytes.has(file))historicalBytes.set(file,execFileSync('git',['-c','safe.directory='+root,'show',BASELINE+':'+file],{cwd:root,maxBuffer:64*1024*1024}));return historicalBytes.get(file);};
const bytes=v=>Buffer.from(v.buffer,v.byteOffset,v.byteLength);
const sourceModule=name=>import(pathToFileURL(path.join(root,'src',name+'.ts')));
const oldModule=name=>import(new URL(name+'.ts',baselineRoot));
registerHooks({
 resolve(specifier,context,next){
  if(specifier.startsWith(baselineRoot))return{url:specifier,shortCircuit:true};
  if((context.parentURL?.startsWith(sourceRoot)||context.parentURL?.startsWith(baselineRoot))&&specifier.startsWith('.')&&!path.extname(specifier))return{url:new URL(specifier+'.ts',context.parentURL).href,shortCircuit:true};
  return next(specifier,context);
 },
 load(url,context,next){
  if(url.startsWith(baselineRoot)&&url.endsWith('.ts')){const file='src/'+url.slice(baselineRoot.length),input=gitBytes(file);baselineHashes[file]=sha(input);return{format:'module',shortCircuit:true,source:ts.transpileModule(input.toString('utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText};}
  if(url.startsWith(sourceRoot)&&url.endsWith('.ts')){const file=path.relative(root,fileURLToPath(url)).replaceAll('\\','/');return{format:'module',shortCircuit:true,source:ts.transpileModule(read(file).toString('utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText};}
  return next(url,context);
 }
});

// 글자 캔버스만 대체하고 실제 지형, 전체 장면과 Rapier를 사용한다.
globalThis.document={createElement(){const canvas={width:0,height:0,textCalls:[]};canvas.getContext=()=>new Proxy({},{get(o,k){if(k==='fillText')return(...args)=>canvas.textCalls.push(args);if(k==='measureText')return s=>({width:String(s).length*20});if(k==='createLinearGradient'||k==='createRadialGradient')return()=>({addColorStop(){}});return o[k]??(()=>{});},set(o,k,v){o[k]=v;return true;}});return canvas;}};
async function buildWorld(){
 await R.init();
 const names=['terrain','scene','fullCampus','physics','transitFacilities','centralPlazaFacilities','administrationPlazaFacilities','informationCourtApproach','administrationPlazaGround','gyujanggakApproach'];
 const [tm,gm,cm,pm,tf,cp,ap,ic,ag,ga]=await Promise.all(names.map(sourceModule));
 const data=campusAtHistoricalFootprints(json('public/data/campus.json'),gitBytes('public/data/campus.json')),dem=json('public/data/terrain.json'),plan=json('public/data/campus-transit.json'),facilityPlan=json('public/data/transit-facilities.json');
 data.roads.push(...(plan.supplementalRoads??[]));
 const world=new THREE.Scene(),terrain=tm.createTerrain(world,dem,data.buildings),gate=gm.createCampus(world,{full:true}),campus=cm.createFullCampus(world,data,terrain.heightAt);
 const facilities=[tf.createTransitFacilities(world,facilityPlan,terrain.heightAt),cp.createCentralPlazaFacilities(world,terrain.heightAt),ap.createAdministrationPlazaFacilities(world,data,terrain.heightAt),ic.createInformationCourtApproach(world,terrain.heightAt),ag.createAdministrationPlazaGround(world,terrain.heightAt),ga.createGyujanggakApproach(world,terrain.heightAt)];
 world.updateMatrixWorld(true);
 return{world,terrain,data,dem,plan,campus,facilities,createTerrain:tm.createTerrain,makeSimulation(spawn){return new pm.Simulation([...gate.breakables,...campus.breakables,...facilities.flatMap(f=>f.breakables)],[...gate.colliders,...campus.colliders],spawn,data.bounds,terrain);},update(p){campus.update(p);for(const f of facilities)f.update(p);world.updateMatrixWorld(true);}};
}
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
 function walk(route){const segments=[],penetrationEvents=[];let maxPenetration=0;for(const dest of route){let stalled=0,frames=0,last=new THREE.Vector3().copy(sim.player.translation());for(;frames<1800;frames++){const p=sim.player.translation(),dx=dest.x-p.x,dz=dest.z-p.z,d=Math.hypot(dx,dz);if(d<.12)break;const speed=Math.min(6,d*60);sim.step(1/60,dx/d*speed,dz/d*speed,false);const q=new THREE.Vector3().copy(sim.player.translation());stalled=q.distanceTo(last)<.002?stalled+1:0;last=q;if(frames%10===0)for(const c of contacts()){if(c.penetration>maxPenetration)penetrationEvents.push({segment:segments.length,frame:frames,player:q.toArray(),destination:dest.toArray(),...c});maxPenetration=Math.max(maxPenetration,c.penetration);}if(stalled>120)break;}const p=sim.player.translation(),distance=Math.hypot(dest.x-p.x,dest.z-p.z);segments.push({dest:dest.toArray(),frames,end:{...p},distance,penetrations:contacts(),blockers:distance>.2?blockers():[]});if(distance>.2)break;}return{reached:segments.length===route.length&&segments.at(-1).distance<.2,maxPenetration,penetrationEvents,segments};}
 return{contacts,blockers,walk};
}
const directory=path.join(root,'artifacts/dining76-access-test'),output=path.join(directory,stairDiagnostic?'stair-diagnostic.json':surfaceDiagnostic?'surface-diagnostic.json':trafficDiagnostic?'traffic-diagnostic.json':'results.json'),results=[];
fs.mkdirSync(directory,{recursive:true});
if(fs.existsSync(output))fs.copyFileSync(output,path.join(directory,`previous-results-${new Date().toISOString().replaceAll(':','-')}.json`));
const report={scope:'76동의 실제 전체 장면에서 계단, 문, 낮은 옆길과 차량 제외 범위를 검사한다. 단수와 폭, 높이는 게임 근사이며 현장 실측이나 휴대폰 GPU 검증을 주장하지 않는다.',diagnosticOnly:stairDiagnostic||surfaceDiagnostic||trafficDiagnostic,baselineCommit:BASELINE,results,harnessSha256:sha(fs.readFileSync(new URL(import.meta.url)))};
const must=(ok,message,details)=>{if(!ok)throw Object.assign(new Error(message),{details});};
const sourceStillMatches=()=>Object.fromEntries(Object.entries(hashes).map(([f,h])=>[f,sha(fs.readFileSync(path.join(root,f)))===h]));
const save=running=>fs.writeFileSync(output,JSON.stringify({...report,running,hashes,sourceHashes:hashes,baselineHashes,sourceStillMatches:sourceStillMatches()},null,2)+'\n');
const check=async(name,fn)=>{if(stairDiagnostic&&!name.startsWith('both sides')||surfaceDiagnostic&&!name.startsWith('actual step,')||trafficDiagnostic&&!name.startsWith('only four')&&!name.startsWith('retained neighboring'))return;try{results.push({name,status:'PASS',...await fn()});console.log('PASS '+name);}catch(e){results.push({name,status:'FAIL',message:e.message,details:e.details});console.log('FAIL '+name+' '+e.message);}save(true);};
let sim,traffic,oldTraffic;
const removedSegments=new Set(['way/167597858/21:0','way/185937117/85:0','way/185937117/85:1','way/185937117/85:2']);
const segmentKey=e=>`${e.roadId}:${e.segmentIndex}`;
const edgeSignature=e=>JSON.stringify({road:e.roadId,segment:e.segmentIndex,a:e.a.point.toArray(),b:e.b.point.toArray(),width:e.width,allowed:e.allowed,oneway:e.oneway});
const compiledRouteSignature=r=>JSON.stringify({definition:r.definition,length:r.length,stops:r.stops,entry:r.entry.toArray(),exit:r.exit.toArray(),pieces:r.pieces.map(p=>({edge:edgeSignature(p.edge),next:edgeSignature(p.next),start:p.start,length:p.length,offset:p.offset,exitDistance:p.exitDistance,curve:p.curve?[p.curve.v0,p.curve.v1,p.curve.v2,p.curve.v3].map(v=>v.toArray()):null}))});
async function verifyTraffic(env,oldTerrain){
 const {Traffic}=await sourceModule('traffic'),{Traffic:OldTraffic}=await oldModule('traffic');
 traffic=new Traffic(new THREE.Scene(),env.data.roads,env.terrain.heightAt,env.plan);
 oldTraffic=new OldTraffic(new THREE.Scene(),env.data.roads,oldTerrain.heightAt,env.plan);
 const removed=oldTraffic.edges.filter(e=>removedSegments.has(segmentKey(e)));
 must(removed.length===8,'The historical four bidirectional segments are not the expected source roads.',removed.map(edgeSignature));
 must(!traffic.edges.some(e=>removedSegments.has(segmentKey(e))),'A restricted approach segment remains in the vehicle graph.');
 const expected=oldTraffic.edges.filter(e=>!removedSegments.has(segmentKey(e))).map(edgeSignature).sort(),actual=traffic.edges.map(edgeSignature).sort();
 assert.deepEqual(actual,expected,'Traffic graph changed outside the four observed pedestrian segments.');
 must(!env.plan.routes.some(r=>r.segments.some(s=>removedSegments.has(segmentKey(s)))),'A confirmed bus route uses an excluded segment.');
 const oldRoutes=oldTraffic.routes.map(compiledRouteSignature),newRoutes=traffic.routes.map(compiledRouteSignature);
 assert.deepEqual(newRoutes,oldRoutes,'A compiled bus route, stop sequence or turn curve changed.');
 const fleet=traffic.vehicles.filter(v=>v.kind==='bus').map(v=>({service:v.service,route:v.route})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),oldFleet=oldTraffic.vehicles.filter(v=>v.kind==='bus').map(v=>({service:v.service,route:v.route})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 assert.deepEqual(fleet,oldFleet,'The bus fleet changed during approach restriction.');
 return{excludedSegments:[...removedSegments],removedDirections:removed.length,remainingDirectedEdges:actual.length,compiledBusRoutes:newRoutes.length,buses:fleet.length,rawPlanUnchanged:true,scope:'원본 도로와 노선 데이터는 유지하고 게임 무작위 차량의 네 구간만 제외됐는지 이전 Git 그래프와 비교한다. 실제 도로의 법적 통행 규정을 판정하지 않는다.'};
}

function triangleSamples(mesh){
 const geometry=mesh.geometry,position=geometry.attributes.position,index=geometry.index,rows=[];
 const count=index?index.count:position.count;
 for(let i=0;i<count;i+=3){const vertices=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(position,index?index.getX(i+k):i+k).applyMatrix4(mesh.matrixWorld)),normal=vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0])),area=normal.length()/2;if(area<1e-10)continue;normal.normalize();rows.push({index:i/3,vertices,normal,area,point:vertices[0].clone().add(vertices[1]).add(vertices[2]).multiplyScalar(1/3)});}
 return rows;
}
function queries(env,simulation,near){
 const {world,terrain}=env,meshes=meshList(world),moving=movementTools(simulation);let owners=new Map();
 const update=p=>env.update(p);
 const focus=p=>{simulation.setFocus(p,true);simulation.world.step();owners=new Map(simulation.targets.filter(t=>t.body).map(t=>[t.body.handle,t]));};
 const owner=c=>owners.get(c.parent()?.handle);
 const describe=t=>t?{index:simulation.targets.indexOf(t),buildingId:t.mesh.userData.buildingId??null,connectionId:t.mesh.userData.connectionId??null,component:t.mesh.userData.component??null,label:t.label}:null;
 const render=(p,d,max)=>new THREE.Raycaster(world.scale.z<0?H(p):p,world.scale.z<0?H(d):d,0,max).intersectObjects(meshes.filter(visible),false);
 const cast=(p,d,max)=>simulation.world.castRay(new R.Ray(p,d),max,true,R.QueryFilterFlags.EXCLUDE_DYNAMIC,undefined,simulation.playerCollider,simulation.player);
 const reset=()=>{world.scale.z=1;simulation.reset();update(near);};
 const floor=(p,startY)=>{const q=vec(p);q.x=Math.fround(q.x);q.z=Math.fround(q.z);const ground=terrain.meshHeightAt(q.x,q.z),from=q.clone().setY(startY??ground+.75);focus(from);const h=cast(from,down,Math.max(2,from.y-ground+1)),v=render(from,down,Math.max(2,from.y-ground+1))[0];must(h&&v&&h.timeOfImpact>.005,'A floor probe starts in solid geometry or finds no surface.',{point:q.toArray(),ground,startY:from.y,physical:h?.timeOfImpact,owner:h&&describe(owner(h.collider)),render:v?.object.name});return{point:q.setY(from.y-h.timeOfImpact),ground,physical:h,owner:owner(h.collider),rendered:v,difference:Math.abs(h.timeOfImpact-v.distance)};};
 const settle=(p,startY)=>{const f=floor(p,startY);simulation.teleport(f.point.clone().addScaledVector(up,1.75));for(let i=0;i<75;i++)simulation.step(1/60,0,0,false);must(!moving.contacts().length,'A walk starts with capsule penetration.',moving.contacts());return f;};
 const verifyWalk=w=>must(w.reached&&w.maxPenetration<.025&&w.segments.every(s=>!s.penetrations.length),'A real 6 m/s walk is blocked or penetrates fixed geometry.',w);
 return{moving,update,focus,owner,describe,render,cast,reset,floor,settle,verifyWalk};
}

async function preservation(env){
 for(const file of['public/data/campus.json','public/data/terrain.json','sources/campus.osm','public/data/campus-transit.json'])assertCampusSourcePreserved(file,read(file),gitBytes(file));
 const historical=await oldModule('terrain'),oldTerrain=historical.createTerrain(new THREE.Scene(),env.dem,env.data.buildings),disabled=env.createTerrain(new THREE.Scene(),env.dem,env.data.buildings,{dining76:false,dining76East:false,education101:false,education12:false});
 assert(bytes(oldTerrain.vertices).equals(bytes(disabled.vertices)),'Disabling dining76 does not restore the historical terrain vertices.');
 assert(bytes(oldTerrain.indices).equals(bytes(disabled.indices)),'Disabling dining76 does not restore the historical terrain indices.');
 const regions=[...(env.terrain.heightAt.dining76CorrectionRegions??[]),...(env.terrain.heightAt.dining76EastCorrectionRegions??[])];
 must(regions?.length,'The active local terrain correction has no declared region.');
 for(const r of regions)must(r.minX>=580&&r.maxX<=700&&r.minZ>=-700&&r.maxZ<=-580,'The dining correction escaped its local campus area.',r);
 const entryRegions=env.terrain.heightAt.education101CorrectionRegions??[];
 for(const r of entryRegions)must(r.minX>=620&&r.maxX<=670&&r.minZ>=-725&&r.maxZ<=-680,'The separately tested 10-1 entrance correction escaped its local area.',r);
 const education12Regions=env.terrain.heightAt.education12CorrectionRegions??[];
 must(education12Regions.length>0,'The separately tested education12 correction has no declared region.');
 for(const r of education12Regions)must([r.minX,r.maxX,r.minZ,r.maxZ].every(Number.isFinite)&&r.minX>=528&&r.maxX<=613&&r.minZ>=-842&&r.maxZ<=-723&&r.minX<r.maxX&&r.minZ<r.maxZ,'The separately tested education12 correction escaped its declared local area.',r);
 regions.push(...entryRegions,...education12Regions);
 const outside=(x,z)=>!regions.some(r=>x>=r.minX-.001&&x<=r.maxX+.001&&z>=r.minZ-.001&&z<=r.maxZ+.001);
 let outsideSamples=0,maxMeshDifference=0,maxLogicalDifference=0;const failures=[];
 for(let i=0;i<oldTerrain.vertices.length;i+=3){const x=oldTerrain.vertices[i],z=oldTerrain.vertices[i+2];if(!outside(x,z))continue;outsideSamples++;const mesh=Math.abs(env.terrain.meshHeightAt(x,z)-oldTerrain.meshHeightAt(x,z)),logical=Math.abs(env.terrain.heightAt(x,z)-oldTerrain.heightAt(x,z));maxMeshDifference=Math.max(maxMeshDifference,mesh);maxLogicalDifference=Math.max(maxLogicalDifference,logical);if(mesh>.0001||logical>.0001)failures.push({x,z,mesh,logical});}
 must(!failures.length,'Terrain outside the declared dining region changed.',{count:failures.length,failures:failures.slice(0,15)});
 const preservedRoads=[];
 for(const id of['way/167597858/21','way/456540205/323','way/456540208/324']){
  const road=env.data.roads.find(r=>r.id===id);must(road,'A protected surrounding road disappeared.',id);let count=0,max=0;
  for(let i=1;i<road.points.length;i++){const a=road.points[i-1],b=road.points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),steps=Math.ceil(length/.75);for(let j=0;j<=steps;j++)for(const n of[-road.width/2,0,road.width/2]){const x=Math.fround(a[0]+dx*j/steps-dz/length*n),z=Math.fround(a[1]+dz*j/steps+dx/length*n),difference=Math.abs(env.terrain.meshHeightAt(x,z)-oldTerrain.meshHeightAt(x,z));count++;max=Math.max(max,difference);if(difference>.0001)failures.push({road:id,segment:i-1,x,z,n,difference});}}
  preservedRoads.push({id,samples:count,maxDifference:max});
 }
 must(!failures.length,'A protected surrounding road surface changed.',failures.slice(0,15));
 return{oldTerrain,record:{rawAndTransitInputsUnchanged:true,disabledTerrainByteEqual:true,regions,outsideSamples,maxMeshDifference,maxLogicalDifference,preservedRoads,scope:'별도 10-1동 검사에 맡긴 현관과 verify-education12-access가 맡긴 12동의 선언 구역을 분리하고 선언 범위 밖의 이전 지형 정점 위치와 주변 세 차도의 중심 및 폭 양끝을 비교한다. Float32와 삼각형 보간 차이는 0.1mm 이내로 제한한다.'}};
}

function terrainTopology(env,q){
 const {terrain,data}=env,vertices=terrain.vertices,indices=terrain.indices,regions=terrain.heightAt.dining76CorrectionRegions;
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
 must(patch.length>0,'The declared dining terrain region has no actual triangles.');
 let maxHeightDifference=0,maxPhysicalDifference=0;const failures=[],physicalRows=[];
 let terrainHandle;sim.world.forEachCollider(c=>{if(c.shape.type===R.ShapeType.TriMesh&&!c.parent())terrainHandle=c.handle;});
 must(terrainHandle!==undefined,'The real terrain trimesh collider is missing.');
 for(let i=0;i<patch.length;i++){
  const {triangle,p}=patch[i],height=terrain.meshHeightAt(p.x,p.z),difference=Math.abs(height-p.y);maxHeightDifference=Math.max(maxHeightDifference,difference);if(difference>.0001)failures.push({triangle,p:p.toArray(),height,difference});
  if(i%Math.max(1,Math.floor(patch.length/160))!==0)continue;
  const from=p.clone().addScaledVector(up,.7),hit=sim.world.castRay(new R.Ray(from,down),1.4,true,R.QueryFilterFlags.EXCLUDE_DYNAMIC,undefined,sim.playerCollider,sim.player,c=>c.handle===terrainHandle),physical=hit?Math.abs(.7-hit.timeOfImpact):Infinity;maxPhysicalDifference=Math.max(maxPhysicalDifference,physical);physicalRows.push({triangle,point:p.toArray(),difference:physical});if(physical>.0001)failures.push({triangle,p:p.toArray(),physical});
 }
 must(!failures.length,'Terrain triangles, height queries and the real trimesh collider disagree.',{count:failures.length,examples:failures.slice(0,15)});
 return{triangles:indices.length/3,localTriangles:patch.length,interiorOpenEdges:0,invalidTriangles:0,maxHeightDifference,maxPhysicalDifference,physicalSamples:physicalRows.length,scope:'최종 Float32 정점과 전체 인덱스의 내부 닫힘을 검사한다. 국소 삼각형 중심에서 실제 메시 평면과 높이 함수를 대조하고 약 160개 표본은 실제 Rapier 지형 충돌체와 직접 비교한다.'};
}

function inspectRemainingTraffic(q,ownedTarget){
 must(traffic,'Traffic must be compiled before inspecting lane contact.');
 q.reset();const taxi=traffic.vehicles.find(v=>v.service==='taxi');must(taxi,'The actual taxi fixture is missing.');
 const shape=new R.Cuboid(taxi.width/2,taxi.height/2,taxi.length/2),rows=[],failures=[],straightRanges=[];
 const edges=traffic.edges.filter(e=>e.allowed&&['way/167597858/21','way/456540205/323','way/456540208/324'].includes(String(e.roadId)));
 const inspect=(edge,distance,turn,phase)=>{
  taxi.edge=edge;taxi.distance=distance;taxi.turn=turn;traffic.pose(taxi);const center=new THREE.Vector3(0,taxi.height/2,0).applyQuaternion(taxi.quaternion).add(taxi.position);q.focus(center);const contacts=[];
  sim.world.intersectionsWithShape(center,taxi.quaternion,shape,c=>{const target=q.owner(c);if(!target||!ownedTarget(target))return true;const hit=c.contactShape(shape,center,taxi.quaternion,.01);if(hit&&hit.distance<-.005)contacts.push({...q.describe(target),penetration:-hit.distance});return true;},R.QueryFilterFlags.EXCLUDE_DYNAMIC,undefined,sim.playerCollider,sim.player);
  const row={road:edge.roadId,segment:edge.segmentIndex,edgeId:edge.id,distance,nextRoad:taxi.next.roadId,nextSegment:taxi.next.segmentIndex,phase,point:taxi.position.toArray(),contacts};rows.push(row);if(contacts.length)failures.push(row);
 };
 for(const edge of edges){
  // 짧은 도로에는 초기 차량이 생기지 않는다. 실제 이전 회전의 종료 거리부터 검사한다.
  const inbound=edge.a.edges.map(e=>e.reverse).filter(e=>e.allowed).filter(incoming=>{const choices=incoming.b.edges.filter(e=>e.allowed),alternatives=choices.filter(e=>e!==incoming.reverse);return(alternatives.length?alternatives:[incoming.reverse].filter(e=>e.allowed)).includes(edge);});
  const entries=inbound.map(incoming=>{taxi.edge=incoming;taxi.next=edge;taxi.turn=null;traffic.startTurn(taxi);return{incomingRoad:incoming.roadId,incomingSegment:incoming.segmentIndex,incomingEdge:incoming.id,exitDistance:taxi.turn.exitDistance};});
  const initialMinimum=edge.length>15?edge.length*.2:Infinity;
  const entryMinimum=Math.min(initialMinimum,...entries.map(e=>e.exitDistance));
  must(Number.isFinite(entryMinimum),'A tested traffic edge has no real spawn or inbound transition.',{edge:edge.id});
  const alternatives=edge.b.edges.filter(e=>e.allowed&&e!==edge.reverse),nexts=alternatives.length?alternatives:[edge.reverse].filter(e=>e.allowed);
  for(const next of nexts){taxi.edge=edge;taxi.next=next;taxi.turn=null;const end=edge.length-traffic.trim(taxi),start=Math.min(entryMinimum,end),count=Math.max(1,Math.ceil(end-start));straightRanges.push({road:edge.roadId,edgeId:edge.id,length:edge.length,nextRoad:next.roadId,start,end,initialSpawnEligible:edge.length>15,entries});for(let i=0;i<=count;i++)inspect(edge,start+(end-start)*i/count,null,'reachable-straight-between-runtime-turns');traffic.startTurn(taxi);const turn={...taxi.turn};for(let i=0;i<=32;i++)inspect(edge,end,{...turn,distance:turn.length*i/32},`turn:${next.roadId}:${next.segmentIndex}`);}
 }
 must(rows.length>0&&!failures.length,'A retained vehicle lane or turn intersects the dining approach.',{samples:rows.length,failures:failures.slice(0,20)});
 return{directedEdges:edges.length,poses:rows.length,newFacilityContacts:0,straightRanges,dimensions:{width:taxi.width,height:taxi.height,length:taxi.length},scope:'실제 초기 생성 가능 구간과 이전 회전의 exitDistance 중 이른 지점부터 다음 length-trim까지 직선을 검사하고 실제 회전곡선을 따른다. 15m 이하 도로의 도달 불가능한 시작 자세나 차로 끝까지 연장한 가상 자세는 사용하지 않는다. 현재 택시 충돌상자와 76동 부품을 대조하며 다른 건물의 기존 문제와 혼합하지 않는다.'};
}

function surfaceAgreement(env,q,floors,near){
 q.reset();must(floors.length>0,'No actual walkable dining parts were selected.');
 const rows=[],covered=[],failures=[],unloadedChecks=[],fixedRegression=[];let maxRenderDifference=0,maxUnloadedDifference=0,minTerrainClearance=Infinity;q.focus(near);
 for(const target of floors)for(const triangle of triangleSamples(target.mesh)){
  if(triangle.normal.y<.9||triangle.area<.001)continue;
  const p=triangle.point,from=p.clone().addScaledVector(up,.32);
  const h=q.cast(from,down,.8),v=q.render(from,down,.8)[0],owner=h&&q.owner(h.collider),edgeDistances=triangle.vertices.map((a,i)=>{const b=triangle.vertices[(i+1)%3];return Math.abs((b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x))/Math.hypot(b.x-a.x,b.z-a.z);}),row={owner:q.describe(target),triangle:triangle.index,point:p.toArray(),vertices:triangle.vertices.map(v=>v.toArray()),area:triangle.area,normal:triangle.normal.toArray(),minimumEdgeDistance:Math.min(...edgeDistances),physical:h?.timeOfImpact,rendered:v?.distance,physicalOwner:q.describe(owner)};
  if(!h||!v||h.timeOfImpact<=.005){failures.push({...row,reason:'missing or inside solid'});continue;}
  const difference=Math.abs(h.timeOfImpact-v.distance);
  if(v.distance<.295){covered.push({...row,difference});if(difference>.025||!owner)failures.push({...row,reason:'covered surface collision mismatch',difference});continue;}
  const expectedDifference=Math.abs(v.distance-.32),clearance=p.y-env.terrain.meshHeightAt(p.x,p.z);maxRenderDifference=Math.max(maxRenderDifference,difference);minTerrainClearance=Math.min(minTerrainClearance,clearance);
  if(owner!==target||difference>.025||expectedDifference>.025||clearance<-.001)failures.push({...row,reason:'floor target, rendered plane or terrain clearance differs',difference,expectedDifference,clearance});
  unloadedChecks.push({target,from,loaded:h.timeOfImpact,row});rows.push({...row,difference,clearance});
 }
 // 이전 실패 좌표를 유지해 재분할로 삼각형 중심만 달라진 경우도 확인한다.
 for(const point of[[626.870361328125,52.98902117571189,-652.8160400390625],[618.966258577434,52.52995892519691,-649.5210155936379],[612.7520088551989,51.6852571913145,-645.10215343018],[611.1605369447223,51.612960133556726,-644.1272116202078]]){
  const from=vec(point).addScaledVector(up,.32),h=q.cast(from,down,.8),v=q.render(from,down,.8)[0],target=h&&q.owner(h.collider),difference=h&&v?Math.abs(h.timeOfImpact-v.distance):Infinity,row={point,physical:h?.timeOfImpact,rendered:v?.distance,physicalOwner:q.describe(target),difference};
  if(!h||!v||!target||h.timeOfImpact<=.005||difference>.025)failures.push({...row,reason:'fixed former-failure coordinate still disagrees'});
  if(h&&target)unloadedChecks.push({target,from,loaded:h.timeOfImpact,row});fixedRegression.push(row);
 }
 sim.setFocus(near.clone().add(new THREE.Vector3(900,0,900)),true);
 for(const{target,from,loaded,row}of unloadedChecks){const unloaded=sim.castUnloadedTargets(from,down,.8),unloadedDifference=unloaded?Math.abs(unloaded.distance-loaded):Infinity;maxUnloadedDifference=Math.max(maxUnloadedDifference,unloadedDifference);if(unloaded?.target!==target||unloadedDifference>.002)failures.push({...row,reason:'unloaded collision differs',unloaded:unloaded?.distance,unloadedOwner:q.describe(unloaded?.target),unloadedDifference});}
 must(rows.length>0&&!failures.length,'A dining floor triangle disagrees with the visible or physical surface.',{tested:rows.length,covered:covered.length,failureCount:failures.length,failures:failures.slice(0,30),fixedRegression});
 return{floorParts:floors.length,exposedTriangleSamples:rows.length,coveredSamples:covered.length,maxRenderDifference,maxUnloadedDifference,minTerrainClearance,covered,fixedRegression,scope:'실제 부품의 상향 삼각형 중심을 사용한다. 물리 miss를 표본에서 제외하지 않는다. 더 높은 렌더 면에 가린 표본은 별도로 기록하고 그 표면의 충돌 존재와 2.5cm 일치를 확인한다. 정확한 단 모서리의 수직 광선을 이 정밀도 수에 포함하지 않는다. 이전 후보에서 실패한 네 좌표도 그대로 재검사한다.'};
}

try{
 read('src/main.ts');read('src/dining76Approach.ts');
 const env=await buildWorld(),{world,terrain,data,campus}=env,{getDining76Layout}=await sourceModule('dining76Site');
 const layout=getDining76Layout(terrain.heightAt),buildingId='way/167983986',building=data.buildings.find(b=>b.id===buildingId),road=data.roads.find(r=>r.id==='way/185937116/84');
 must(building&&road,'The original dining building or /84 steps are missing.');
 const origin=vec(road.points[0]),axis=vec(road.points.at(-1)).sub(origin).normalize(),side=new THREE.Vector3(-axis.z,0,axis.x),at=(s,n=0)=>origin.clone().addScaledVector(axis,s).addScaledVector(side,n),entry=vec(building.points[1]),outward=axis.clone().negate(),entryFloor=layout.entrance.center.y;
 must(Math.hypot(layout.entrance.center.x-entry.x,layout.entrance.center.z-entry.z)<.01,'The modeled entrance has moved away from the original tagged p1 node.');
 const osm=read('sources/campus.osm').toString('utf8'),node=osm.match(/<node\b[^>]*id="4564809430"[^>]*>([\s\S]*?)<\/node>/)?.[1];must(node?.includes('k="entrance" v="yes"')&&node?.includes('k="wheelchair" v="yes"'),'The original entrance node tags are missing.');
 const near=at(10).setY(entryFloor+1.75),far=near.clone().add(new THREE.Vector3(900,0,900));sim=env.makeSimulation(near);
 const q=queries(env,sim,near),ownedTarget=t=>t?.mesh.userData.buildingId===buildingId,owned=sim.targets.filter(ownedTarget),newParts=owned.filter(t=>String(t.mesh.userData.component??'').includes('dining76'));
 must(newParts.length,'The actual full campus did not register the dining approach parts.');
 q.update(near);report.geometry={layout,originalEntrance:[entry.x,entry.z],originalSteps:road.points,targets:sim.targets.length,newParts:newParts.length,components:[...new Set(newParts.map(t=>t.mesh.userData.component))]};
 let oldTerrain;
 await check('raw inputs and terrain outside the declared dining area are preserved',async()=>{const r=await preservation(env);oldTerrain=r.oldTerrain;return r.record;});
 await check('actual terrain triangles stay closed and agree with height queries and Rapier',()=>terrainTopology(env,q));
 await check('only four pedestrian segments leave the random traffic graph and bus routes stay unchanged',async()=>{if(!oldTerrain){const tm=await oldModule('terrain');oldTerrain=tm.createTerrain(new THREE.Scene(),env.dem,data.buildings);}return verifyTraffic(env,oldTerrain);});

 await check('both sides of the two-flight stair support complete 6 m/s round trips',()=>{
  const paths=[];
  for(const n of[-5,-2,2,5])for(const reverse of[false,true]){q.reset();const route=[at(.6,n),at(2.9,n),at(8.9,n),at(10.1,n),at(15.7,n)];if(reverse)route.reverse();const start=q.settle(route[0],entryFloor+.5),walk=q.moving.walk(route.slice(1));q.verifyWalk(walk);paths.push({offset:n,reverse,startFloor:start.point.toArray(),walk});}
  q.reset();const rail=newParts.find(t=>t.mesh.userData.component==='dining76-handrail'&&Math.abs(t.mesh.position.clone().sub(origin).dot(side))<.1);must(rail,'The center handrail part is missing.');const p=rail.mesh.position.clone().addScaledVector(side,-.65);q.focus(p);const h=q.cast(p,side,1.3),v=q.render(p,side,1.3)[0],target=h&&q.owner(h.collider);must(h&&v&&target===rail,'The observed center railing has no real collision and visible surface.',{origin:p.toArray(),physical:h?.timeOfImpact,rendered:v?.distance,owner:q.describe(target)});
  return{speed:6,paths,centerRail:{owner:q.describe(target),physical:h.timeOfImpact,rendered:v.distance},scope:'난간을 지나는 중앙선은 통행선으로 쓰지 않는다. 양쪽 n=-5,-2,2,5m를 오르내리며 중앙 난간의 충돌 존재를 별도로 확인한다. 폭과 단수는 실측값이 아니다.'};
 });

 await check('the mapped entrance blocks when closed and opens into the real short interior floor',()=>{
  const rows=[];
  for(const n of[-.7,0,.7]){
   q.reset();const before=entry.clone().addScaledVector(outward,1.8).addScaledVector(side,n),inside=entry.clone().addScaledVector(outward,-2).addScaledVector(side,n);q.settle(before,entryFloor+.5);
   const ray=before.clone().setY(entryFloor+1.1),direction=outward.clone().negate();q.focus(ray);const h=q.cast(ray,direction,4),v=q.render(ray,direction,4)[0],door=h&&q.owner(h.collider);must(door&&String(door.mesh.userData.component).includes('door')&&v,'The mapped entrance is still sealed by an old wall or has no actual door.',{n,owner:q.describe(door),physical:h?.timeOfImpact,rendered:v?.distance});
   const closed=q.moving.walk([inside]);must(!closed.reached&&closed.segments.at(-1).distance>1,'A closed entrance door does not block the player.',closed);
   sim.hit(door,100,direction);q.update(near);const inbound=q.moving.walk([inside]);q.verifyWalk(inbound);const back=q.moving.walk([before]);q.verifyWalk(back);rows.push({offset:n,door:q.describe(door),closed,inbound,back});
  }
  q.reset();const sides=[];for(const n of[-(layout.entrance.width/2+.65),layout.entrance.width/2+.65]){const p=entry.clone().addScaledVector(outward,1.5).addScaledVector(side,n).setY(entryFloor+1);q.focus(p);const h=q.cast(p,outward.clone().negate(),3),v=q.render(p,outward.clone().negate(),3)[0];must(h&&v&&ownedTarget(q.owner(h.collider)),'Opening the entrance removed an adjacent exterior wall.',{n,physical:h?.timeOfImpact,rendered:v?.distance});sides.push({offset:n,physical:h.timeOfImpact,rendered:v.distance});}
  return{speed:6,rows,adjacentWalls:sides,scope:'원본 entrance 노드를 기준으로 문과 그 옆 외벽을 구분한다. 세 보행선에서 닫힘, 문 파괴 후 2m 진입과 복귀를 확인하며 전체 실내를 재현했다는 뜻은 아니다.'};
 });

 await check('the lower side path stays separate and passes between both real bollards',()=>{
  const low=data.roads.find(r=>r.id==='way/167597858/21');must(low,'The original lower road is missing.');const a=vec(low.points[1]),b=vec(low.points[0]),axis=b.clone().sub(a).normalize(),normal=new THREE.Vector3(-axis.z,0,axis.x),length=a.distanceTo(b),point=(s,n=0)=>a.clone().addScaledVector(axis,s).addScaledVector(normal,n),paths=[];
  for(const n of[-.45,0,.45])for(const reverse of[false,true]){q.reset();const route=[point(.1,n),point(4.3,n),point(6.7,n),point(14.5,n),point(length-.1,n)];if(reverse)route.reverse();const start=q.settle(route[0],entryFloor+.5),walk=q.moving.walk(route.slice(1));q.verifyWalk(walk);paths.push({offset:n,reverse,startFloor:start.point.toArray(),walk});}
  const bollards=newParts.filter(t=>t.mesh.userData.component==='dining76-low-path-bollard');must(bollards.length===2,'The two modeled lower-path bollards changed.');q.reset();const surfaces=[];for(const t of bollards){const from=t.mesh.position.clone().addScaledVector(axis,-.6);q.focus(from);const h=q.cast(from,axis,1.2),v=q.render(from,axis,1.2)[0];must(h&&q.owner(h.collider)===t&&v&&Math.abs(h.timeOfImpact-v.distance)<.025,'A lower-path bollard has no matching visible and physical surface.',{owner:q.describe(t),physical:h?.timeOfImpact,rendered:v?.distance});surfaces.push({owner:q.describe(t),physical:h.timeOfImpact,rendered:v.distance});}
  return{sourceRoad:low.id,speed:6,paths,bollards:surfaces,scope:'원본 /21 첫 구간을 별도의 낮은 동선으로 왕복한다. 가운데 세 보행선은 두 볼라드 사이를 지나며 볼라드 자체의 충돌도 확인한다. 오른쪽 /87 계단은 이번 구현 대상이 아니므로 완성됐다고 판정하지 않는다.'};
 });

 await check('actual step, landing and path triangles match loaded and unloaded floor collision',()=>{
  const names=new Set(['dining76-stair-tread','dining76-middle-landing','dining76-upper-landing','dining76-entry-floor','dining76-lower-apron','dining76-lower-sidewalk']);
  return surfaceAgreement(env,q,newParts.filter(t=>names.has(t.mesh.userData.component)),near);
 });
 await check('retained neighboring vehicle lanes and turns avoid the new dining parts',()=>inspectRemainingTraffic(q,ownedTarget));

 await check('one H preserves visible damage at distance and reset restores batched facilities',()=>{
  q.reset();const shell=world.getObjectByName('approach/dining76-west');must(shell,'The dining approach render group is missing.');const meshes=meshList(shell),geometryBefore=meshes.map(m=>({name:m.name,hash:geometryHash(m.geometry)}));
  must(meshes.length===4&&meshes.every(m=>!m.isInstancedMesh)&&newParts.length>meshes.length,'The approach no longer uses three merged meshes and one map plane.',{meshes:meshes.map(m=>m.name),parts:newParts.length});
  let triangles=0;for(const m of meshes)triangles+=triangleSamples(m).length;
  const representatives=[newParts.find(t=>t.mesh.userData.component==='dining76-low-path-bollard'),newParts.find(t=>t.mesh.userData.component==='dining76-map-board')];must(representatives.every(Boolean),'The representative bollard or map board is missing.');
  const rows=[];
  for(const target of representatives){
   q.reset();const direction=axis.clone(),p=target.mesh.position.clone().addScaledVector(axis,-.65);q.focus(p);const h=q.cast(p,direction,1.3),v=q.render(p,direction,1.3)[0];must(h&&q.owner(h.collider)===target&&v,'A representative facility is not exposed.',{owner:q.describe(target),physical:h?.timeOfImpact,rendered:v?.distance});
   sim.setFocus(far,true);const unloaded=sim.castUnloadedTargets(p,direction,1.3);must(unloaded?.target===target&&Math.abs(unloaded.distance-h.timeOfImpact)<.002,'Loaded and unloaded facility collision differs.');
   world.scale.z=-1;q.update(near);const reflected=q.render(p,direction,1.3)[0];must(reflected&&Math.abs(reflected.distance-v.distance)<.001,'One H changes a facility surface.');
   sim.hit(target,100,direction);q.update(near);const max=Math.max(h.timeOfImpact,v.distance)+.03;
   for(const distance of[279,281,900]){const observer=near.clone().add(new THREE.Vector3(distance,0,distance));sim.setFocus(observer,true);q.update(observer);must(!sim.castUnloadedTargets(p,direction,max)&&!q.render(p,direction,max).length,'A destroyed facility or its map overlay reappears at distance.',{component:target.mesh.userData.component,distance});}
   for(let cycle=0;cycle<2;cycle++){sim.reset();q.update(near);q.focus(p);const restored=q.cast(p,direction,1.3),shown=q.render(p,direction,1.3)[0];must(restored&&q.owner(restored.collider)===target&&shown&&Math.abs(shown.distance-v.distance)<.001,'Reset failed to restore a facility and its attached display.');if(cycle===0)sim.hit(target,100,direction);}
   rows.push({component:target.mesh.userData.component,loaded:h.timeOfImpact,unloaded:unloaded.distance,rendered:v.distance,reflected:reflected.distance,distances:[279,281,900],resetCycles:2});
  }
  q.reset();assert.deepEqual(meshes.map(m=>({name:m.name,hash:geometryHash(m.geometry)})),geometryBefore,'A reset changed the merged geometry arrays.');
  const materials=new Set(meshes.flatMap(m=>Array.isArray(m.material)?m.material:[m.material])),textures=new Set([...materials].map(m=>m.map).filter(Boolean));
  return{rows,geometry:{parts:newParts.length,renderMeshes:meshes.length,triangles,materials:materials.size,textures:textures.size},scope:'실제 병합 메시와 지도 평면의 파괴 소유자, 한 번의 H, 279/281/900m 표시와 두 번 복원을 확인한다. 메시 수는 모바일 비용을 판단하기 위한 구조 지표이며 실기기 FPS나 GPU 드로콜 측정값이 아니다.'};
 });
}catch(e){results.push({name:'dining76 full scene setup',status:'FAIL',message:e.message,details:e.details});console.log('FAIL '+e.message);}
finally{if(sim){sim.world.removeCharacterController(sim.controller);sim.world.free();}traffic?.dispose();oldTraffic?.dispose();save(false);if(results.some(r=>r.status==='FAIL')||Object.values(sourceStillMatches()).some(v=>!v))process.exitCode=1;}
