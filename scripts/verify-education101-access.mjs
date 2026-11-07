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
const BASELINE='c23ce6b2afd21657a1ad783d8b9a1fbbdbc627ba';
const baselineRoot=pathToFileURL(path.join(root,'artifacts/education101-access-test/historical-src')+path.sep).href;
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
const movementSpeed=process.argv.includes('--mobile-speed')?8:6;
function movementTools(sim){
 const describe=c=>{const body=c.parent(),target=body?sim.targets.find(t=>t.body?.handle===body.handle):undefined;return{collider:c.handle,buildingId:target?.mesh.userData.buildingId??null,connectionId:target?.mesh.userData.connectionId??null,component:target?.mesh.userData.component??null,label:target?.label??(body?'unmapped body':'terrain or static')};};
 const contacts=()=>{const shape=sim.playerCollider.shape,p=sim.player.translation(),q=sim.playerCollider.rotation(),out=[];sim.world.intersectionsWithShape(p,q,shape,c=>{const hit=c.contactShape(shape,p,q,.02);if(hit&&hit.distance<-.01)out.push({...describe(c),penetration:-hit.distance,point:hit.point1});return true;},R.QueryFilterFlags.EXCLUDE_DYNAMIC,undefined,sim.playerCollider,sim.player);return out;};
 const blockers=()=>Array.from({length:sim.controller.numComputedCollisions()},(_,i)=>sim.controller.computedCollision(i)).filter(c=>c?.collider).map(c=>({...describe(c.collider),normal:c.normal1,point:c.witness1}));
 function walk(route){const segments=[],penetrationEvents=[];let maxPenetration=0,maxLateralDeviation=0;for(const dest of route){const lineStart=new THREE.Vector3().copy(sim.player.translation()),line=dest.clone().sub(lineStart).setY(0),lineLength=line.length();let stalled=0,frames=0,last=new THREE.Vector3().copy(sim.player.translation());for(;frames<1800;frames++){const p=sim.player.translation(),dx=dest.x-p.x,dz=dest.z-p.z,d=Math.hypot(dx,dz);if(d<.12)break;const speed=Math.min(movementSpeed,d*60);sim.step(1/60,dx/d*speed,dz/d*speed,false);const q=new THREE.Vector3().copy(sim.player.translation());stalled=q.distanceTo(last)<.002?stalled+1:0;last=q;if(lineLength>.01)maxLateralDeviation=Math.max(maxLateralDeviation,Math.abs((q.x-lineStart.x)*line.z-(q.z-lineStart.z)*line.x)/lineLength);if(frames%10===0)for(const c of contacts()){if(c.penetration>maxPenetration)penetrationEvents.push({segment:segments.length,frame:frames,player:q.toArray(),destination:dest.toArray(),...c});maxPenetration=Math.max(maxPenetration,c.penetration);}if(stalled>120)break;}const p=sim.player.translation(),distance=Math.hypot(dest.x-p.x,dest.z-p.z);segments.push({dest:dest.toArray(),frames,end:{...p},distance,penetrations:contacts(),blockers:distance>.2?blockers():[]});if(distance>.2)break;}return{reached:segments.length===route.length&&segments.at(-1).distance<.2,maxPenetration,maxLateralDeviation,penetrationEvents,segments};}
 return{contacts,blockers,walk};
}
const walkOnly=process.argv.includes('--walk-only');
const directory=path.join(root,'artifacts/education101-access-test'),output=path.join(directory,walkOnly?'walk-diagnostic.json':'results.json'),results=[];
fs.mkdirSync(directory,{recursive:true});if(fs.existsSync(output))fs.copyFileSync(output,path.join(directory,`previous-results-${new Date().toISOString().replaceAll(':','-')}.json`));
const report={baselineCommit:BASELINE,scope:'10-1동 하부 차도와 현관, 41차에 연장한 10동 연결교를 실제 전체 장면으로 검사한다. 치수는 게임 근사이며 사진 관측이나 현장 실측 검사가 아니다.',results,harnessSha256:sha(fs.readFileSync(new URL(import.meta.url)))};
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

function genericWallCover(env,target,collider,point){
 if(target.mesh.userData.component||target.mesh.userData.roof)return null;
 const group=env.world.getObjectByName(`${target.mesh.userData.buildingId}:shell`),walls=group?.children.find(o=>o.isInstancedMesh&&o.userData.role==='walls');
 if(!walls||geometryHash(walls.geometry)!==geometryHash(target.mesh.geometry))return null;
 const matrix=new THREE.Matrix4(),expected=target.mesh.matrixWorld.elements.map(Math.fround);let instance=-1;
 for(let i=0;i<walls.count;i++){walls.getMatrixAt(i,matrix);if(matrix.elements.every((v,k)=>v===expected[k])){instance=i;break;}}
 if(instance<0)return null;
 // 다른 시설에 가려져도 실제 렌더 인스턴스의 부피가 존재하는지 확인한다.
 // 충돌 프록시를 렌더 근거로 재사용하지 않으며, 이 표본은 노출 바닥 정밀도에 합산하지 않는다.
 const actual=new THREE.Mesh(walls.geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));actual.matrixAutoUpdate=false;actual.matrixWorld.multiplyMatrices(walls.matrixWorld,matrix);
 const inverse=actual.matrixWorld.clone().invert(),local=point.clone().applyMatrix4(inverse);walls.geometry.computeBoundingBox();const bounds=walls.geometry.boundingBox;
 const inside=bounds.containsPoint(local)&&collider.containsPoint(point),rows=[];
 const scale=new THREE.Vector3().setFromMatrixScale(actual.matrixWorld),axis=scale.x<scale.z?'x':'z';
 for(const sign of[-1,1]){
  const start=local.clone();start[axis]=(sign<0?bounds.min[axis]:bounds.max[axis])+sign*.15/scale[axis];start.applyMatrix4(actual.matrixWorld);
  const direction=point.clone().sub(start).normalize(),maximum=start.distanceTo(point)+.1;
  const shown=new THREE.Raycaster(start,direction,0,maximum).intersectObject(actual,false)[0],physical=collider.castRay(new R.Ray(start,direction),maximum,true),difference=shown?Math.abs(physical-shown.distance):Infinity;
  rows.push({sign,origin:start.toArray(),direction:direction.toArray(),rendered:shown?.distance,physical,difference,valid:!!shown&&physical>.005&&difference<=.025});
 }
 actual.material.dispose();return{instance,role:walls.userData.role,geometryExact:true,instanceMatrixMatchesFloat32:true,inside,localPoint:local.toArray(),axis,rows,valid:inside&&rows.every(r=>r.valid),scope:'전체 장면의 실제 벽 인스턴스를 분리해 양쪽 얇은 면과 해당 충돌체를 비교한다. 다른 시설에 가린 벽 내부의 바닥은 노출 보행면 정밀 검사와 별도로 기록한다.'};
}


function terrainTopology(env,q){
 const {terrain,data}=env,vertices=terrain.vertices,indices=terrain.indices,regions=terrain.heightAt.education101CorrectionRegions;
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
 must(patch.length>0,'The declared education101 terrain region has no actual triangles.');
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


function comparePreservedParts(before,after){
 assert.equal(after.length,before.length,'The number of unrelated campus parts changed.');
 const limit=.00001,changes=[];let maxMatrixDifference=0,maxSizeDifference=0;
 const identity=t=>[t.mesh.userData.buildingId??null,t.mesh.userData.connectionId??null,t.mesh.userData.component??null,t.mesh.userData.roof??false,t.label,t.material,t.toughness];
 for(let i=0;i<before.length;i++){
  const a=before[i],b=after[i];assert.deepEqual(identity(b),identity(a),`Unrelated part identity changed at ${i}.`);
  assert.equal(geometryHash(b.mesh.geometry),geometryHash(a.mesh.geometry),`Unrelated render geometry changed at ${i}.`);
  assert.equal(b.collisionVertices?sha(bytes(b.collisionVertices)):null,a.collisionVertices?sha(bytes(a.collisionVertices)):null,`Unrelated convex collision vertices changed at ${i}.`);
  const matrix=a.mesh.matrixWorld.elements.map((v,k)=>Math.abs(v-b.mesh.matrixWorld.elements[k])),size=a.size.toArray().map((v,k)=>Math.abs(v-b.size.toArray()[k]));
  // 국소 지형 재삼각분할은 주변 일반 벽의 Y 위치와 높이에 수 마이크로미터 차이를 만든다.
  // XZ, 회전, 렌더 정점과 볼록 충돌 정점은 계속 정확히 일치해야 한다.
  matrix.forEach((d,k)=>assert.ok(Number.isFinite(d)&&d<=([5,13].includes(k)?limit:0),`Unrelated matrix[${k}] differs at ${i}: ${d}`));
  size.forEach((d,k)=>assert.ok(Number.isFinite(d)&&d<=(k===1?limit:0),`Unrelated size[${k}] differs at ${i}: ${d}`));
  maxMatrixDifference=Math.max(maxMatrixDifference,...matrix);maxSizeDifference=Math.max(maxSizeDifference,...size);
  if(matrix.some(d=>d)||size.some(d=>d))changes.push({index:i,identity:identity(a),matrixDifferences:matrix,sizeDifferences:size});
 }
 return{parts:before.length,numericYLimit:limit,maxMatrixDifference,maxSizeDifference,changedParts:changes.length,changes,geometryExact:true,collisionVerticesExact:true,otherTransformFieldsExact:true};
}

const buildingId='way/238937145',roadId='way/456540230/333';
const owned=t=>t?.mesh.userData.buildingId===buildingId||String(t?.mesh.userData.connectionId??'').includes('education101')||String(t?.mesh.userData.facilityId??'').includes('education101');
const edgeSignature=e=>JSON.stringify({road:e.roadId,segment:e.segmentIndex,a:e.a.point.toArray(),b:e.b.point.toArray(),width:e.width,allowed:e.allowed,oneway:e.oneway});
const routeSignature=r=>JSON.stringify({definition:r.definition,length:r.length,stops:r.stops,entry:r.entry.toArray(),exit:r.exit.toArray(),pieces:r.pieces.map(p=>({edge:edgeSignature(p.edge),next:edgeSignature(p.next),start:p.start,length:p.length,offset:p.offset,exitDistance:p.exitDistance,curve:p.curve?[p.curve.v0,p.curve.v1,p.curve.v2,p.curve.v3].map(v=>v.toArray()):null}))});
function vehicleSamples(instance,vehicle,road,inspect){
 const ranges=[];
 for(const edge of instance.edges.filter(e=>e.allowed&&e.roadId===road)){
  const inbound=edge.a.edges.map(e=>e.reverse).filter(e=>e.allowed).filter(incoming=>{const choices=incoming.b.edges.filter(e=>e.allowed),alternatives=choices.filter(e=>e!==incoming.reverse);return(alternatives.length?alternatives:[incoming.reverse].filter(e=>e.allowed)).includes(edge);});
  const entries=inbound.map(incoming=>{vehicle.edge=incoming;vehicle.next=edge;vehicle.turn=null;instance.startTurn(vehicle);return{incoming:incoming.id,exitDistance:vehicle.turn.exitDistance};});
  const entryMinimum=Math.min(edge.length>15?edge.length*.2:Infinity,...entries.map(e=>e.exitDistance));
  const alternatives=edge.b.edges.filter(e=>e.allowed&&e!==edge.reverse),nexts=alternatives.length?alternatives:[edge.reverse].filter(e=>e.allowed);
  for(const next of nexts){vehicle.edge=edge;vehicle.next=next;vehicle.turn=null;const end=edge.length-instance.trim(vehicle),start=Math.min(entryMinimum,end),count=Math.max(1,Math.ceil((end-start)/.5));ranges.push({edge:edge.id,segment:edge.segmentIndex,next:next.id,start,end,entries});for(let i=0;i<=count;i++){vehicle.distance=start+(end-start)*i/count;vehicle.turn=null;instance.pose(vehicle);inspect(vehicle,'reachable-straight');}instance.startTurn(vehicle);const turn={...vehicle.turn};for(let i=0;i<=48;i++){vehicle.distance=end;vehicle.turn={...turn,distance:turn.length*i/48};instance.pose(vehicle);inspect(vehicle,'runtime-turn');}}
 }
 return ranges;
}
try{
 const env=await buildWorld(),{world,terrain,data,campus}=env;
 let shell,access;world.traverse(o=>{if(o.userData.education101Access){shell=o;access=o.userData.education101Access;}});
 must(shell&&access?.portal,'The actual full campus is missing education101Access.portal.');
 const road=data.roads.find(r=>r.id===roadId),A=vec(road.points[3]),B=vec(road.points[4]),axis=B.clone().sub(A).normalize(),side=new THREE.Vector3(-axis.z,0,axis.x),length=A.distanceTo(B),at=(s,n=0)=>A.clone().addScaledVector(axis,s).addScaledVector(side,n),project=p=>({s:p.clone().sub(A).dot(axis),n:p.clone().sub(A).dot(side)}),near=at(length/2).setY(terrain.heightAt(A.x,A.z)+1.75),far=near.clone().add(new THREE.Vector3(900,0,900));
 sim=env.makeSimulation(near);const q=queries(env,sim,near);q.update(near);world.updateMatrixWorld(true);
 const floors=new Set(access.portal.surfaceComponents??access.portal.floorComponents??access.surfaceComponents??[]),newParts=sim.targets.filter(owned);
 report.geometry={buildingId,roadId,rawSegmentIndex:3,rawOutlineEdge:1,rawLength:length,sourceWidth:road.width,widthEstimated:road.widthEstimated,parts:newParts.length,portal:access.portal,entry:access.entry??null};
 await check('release37 raw inputs, terrain outside the declared correction, unrelated buildings and transit remain unchanged',async()=>{
  for(const file of['sources/campus.osm','public/data/campus.json','public/data/terrain.json','public/data/campus-transit.json'])assertCampusSourcePreserved(file,read(file),gitBytes(file));
  const [{Traffic},{Traffic:OldTraffic}]=await Promise.all([sourceModule('traffic'),oldModule('traffic')]);
  historicalEnv=await buildWorld(true);const oldWorld=historicalEnv.world,oldTerrain=historicalEnv.terrain,oldCampus=historicalEnv.campus;historicalSim=historicalEnv.makeSimulation(near);historicalQueries=queries(historicalEnv,historicalSim,near);
  const disabled=env.createTerrain(new THREE.Scene(),env.dem,data.buildings,{education101:false,education12:false});
  assert(bytes(disabled.vertices).equals(bytes(oldTerrain.vertices)),'Disabling the explicit education101 correction does not restore release37 vertices.');assert(bytes(disabled.indices).equals(bytes(oldTerrain.indices)),'Disabling the correction does not restore release37 indices.');
  const education12Regions=terrain.heightAt.education12CorrectionRegions??[];
  must(education12Regions.length>0,'The separately tested education12 correction has no declared region.');
  for(const r of education12Regions)must([r.minX,r.maxX,r.minZ,r.maxZ].every(Number.isFinite)&&r.minX>=528&&r.maxX<=613&&r.minZ>=-842&&r.maxZ<=-723&&r.minX<r.maxX&&r.minZ<r.maxZ,'The separately tested education12 correction escaped its declared local area.',r);
  const regions=[...(terrain.heightAt.education101CorrectionRegions??[]),...education12Regions],terrainChanged=!bytes(terrain.vertices).equals(bytes(oldTerrain.vertices))||!bytes(terrain.indices).equals(bytes(oldTerrain.indices));must(!terrainChanged||regions.length,'Changed terrain has no declared education101 region.');
  const outside=(x,z)=>!regions.some(r=>x>=r.minX-.001&&x<=r.maxX+.001&&z>=r.minZ-.001&&z<=r.maxZ+.001);let outsideSamples=0,maxOutsideDifference=0;
  for(let i=0;i<oldTerrain.vertices.length;i+=3){const x=oldTerrain.vertices[i],z=oldTerrain.vertices[i+2];if(!outside(x,z))continue;outsideSamples++;const d=Math.abs(terrain.meshHeightAt(x,z)-oldTerrain.meshHeightAt(x,z));maxOutsideDifference=Math.max(maxOutsideDifference,d);must(d<.0001,'Terrain changed outside the declared local entrance correction.',{x,z,d});}
  let outsideTriangleSamples=0;for(let i=0;i<terrain.indices.length;i+=3){let x=0,z=0;for(let k=0;k<3;k++){const index=terrain.indices[i+k]*3;x+=terrain.vertices[index]/3;z+=terrain.vertices[index+2]/3;}if(!outside(x,z))continue;outsideTriangleSamples++;const difference=Math.abs(terrain.meshHeightAt(x,z)-oldTerrain.meshHeightAt(x,z));maxOutsideDifference=Math.max(maxOutsideDifference,difference);must(difference<.0001,'A current outside triangle moved away from the release37 surface.',{triangle:i/3,x,z,difference});}
  report.terrain={disabledByteEqual:true,terrainChanged,regions,outsideSamples,outsideTriangleSamples,maxOutsideDifference,topology:terrainTopology(env,q)};
  traffic=new Traffic(new THREE.Scene(),data.roads,terrain.heightAt,env.plan);oldTraffic=new OldTraffic(new THREE.Scene(),data.roads,oldTerrain.heightAt,env.plan);
  const education12Ids=new Set(['way/238936704','way/439707885']);
  const changedTenEndWall=t=>{const p=project(t.mesh.position);return t.mesh.userData.buildingId==='way/180954536'&&p.s>=2.7&&p.s<=11.4&&p.n>=5.5&&p.n<=6.1;};
  const unrelated=t=>!owned(t)&&!education12Ids.has(t.mesh.userData.buildingId)&&!changedTenEndWall(t);
  const before=oldCampus.breakables.filter(unrelated),after=campus.breakables.filter(unrelated);assert.equal(after.length,before.length,'An unrelated building or facility part count changed.');
  const preservedParts=comparePreservedParts(before,after);
  const tenOpening=world.getObjectByName('way/180954536:shell')?.userData.connectionOpenings;
  must(tenOpening?.length===2&&tenOpening.every(o=>o.edgeIndex===5),'Both 10 openings must stay on the observed end wall.');
  for(const point of[tenOpening[0].a,tenOpening[0].b]){const p=project(vec(point));must(p.s>=8.6&&p.s<=11.1&&p.n>=5.5&&p.n<=5.9,'The 10 opening escaped the observed connection.',p);}
  for(const point of[tenOpening[1].a,tenOpening[1].b]){const p=project(vec(point));must(p.s>=2.9&&p.s<=5.3&&p.n>=5.5&&p.n<=5.9,'The lower 10 door escaped the observed end wall.',p);}
  
  assert.deepEqual(traffic.edges.map(edgeSignature),oldTraffic.edges.map(edgeSignature),'The existing traffic graph changed.');assert.deepEqual(traffic.routes.map(routeSignature),oldTraffic.routes.map(routeSignature),'A confirmed bus route, stop or curve changed.');
  const roadSamples=[],separatelyTestedSouthRoadSamples=[];let maxRoadHeightDifference=0;for(let i=0;i<road.points.length-1;i++){const a=vec(road.points[i]),b=vec(road.points[i+1]),d=b.clone().sub(a),l=d.length(),n=new THREE.Vector3(-d.z,0,d.x).divideScalar(l);for(let s=0;s<=l;s+=.5)for(const offset of[-road.width/2,0,road.width/2]){const p=a.clone().addScaledVector(d,s/l).addScaledVector(n,offset);const difference=Math.abs(terrain.meshHeightAt(p.x,p.z)-oldTerrain.meshHeightAt(p.x,p.z));if(education12Regions.some(r=>p.x>=r.minX&&p.x<=r.maxX&&p.z>=r.minZ&&p.z<=r.maxZ)){must(i<2,'The education12 exception reaches the protected 10-1 portal approach.',{segment:i,point:p.toArray()});separatelyTestedSouthRoadSamples.push({segment:i,point:p.toArray(),difference});continue;}maxRoadHeightDifference=Math.max(maxRoadHeightDifference,difference);must(difference<=.00001,'The raw road profile changed beyond 0.01mm numerical precision.',{point:p.toArray(),difference});roadSamples.push([p.x,p.z]);}}
  return{...report.terrain,unrelatedParts:before.length,preservedParts,tenOpening,roadHeightSamples:roadSamples.length,separatelyTestedSouthRoadSamples,education12Regions,maxRoadHeightDifference,roadHeightLimit:.00001,graphEdges:traffic.edges.length,busRoutes:traffic.routes.length,scope:'37판의 실제 전체 장면과 비교한다. 10-1동, 별도 검사가 맡은 12동 및 111동, 이번에 연결한 10동 끝벽의 제한 범위를 제외한 부품은 보존한다. 10동 나머지 벽도 비교에 포함한다. 원본 데이터와 차량 경로, 선언 구역 밖의 지형을 보존한다.'};
 });
 await check('10 upper connection clears its actual wall and canopy in both directions',()=>{
  const link=shell.userData.education10Link;must(link?.routeWorld?.length,'Missing 10 connection route.');
  const walks=[],rays=[];
  for(const offset of[-.38,0,.38]){
   q.reset();const door=sim.targets.find(t=>owned(t)&&t.mesh.userData.component==='education101-upper-link-door');must(door,'Missing 10-1 upper door.');sim.hit(door,100,side);q.update(near);
   const route=link.routeWorld.map(p=>vec(p).addScaledVector(axis,offset));q.settle(route[0],route[0].y+.75);
   const forward=q.moving.walk(route.slice(1));q.verifyWalk(forward);
   const backward=q.moving.walk(route.slice(0,-1).reverse());q.verifyWalk(backward);walks.push({offset,forward,backward});
   for(const n of[4.8,5.25,5.65,6.15,7.25]){const p=at(9.95+offset,n).setY(access.layout.bridgeFloorY+1);q.focus(p);const downHit=q.cast(p,down,1.4),shown=q.render(p,down,1.4)[0];must(downHit&&shown&&Math.abs(downHit.timeOfImpact-shown.distance)<.025,'10 connection floor and collision disagree.',{n,offset});rays.push({n,offset,difference:Math.abs(downHit.timeOfImpact-shown.distance)});}
  }
  q.reset();const from=at(9.95,4.7).setY(access.layout.bridgeFloorY+1.1);
  const distant=[];for(const distance of[0,281,900]){const observer=near.clone().add(new THREE.Vector3(distance,0,distance));sim.setFocus(observer,true);q.update(observer);world.updateMatrixWorld(true);const shown=q.render(from,side,2.5)[0],hit=distance?sim.castUnloadedTargets(from,side,2.5):q.cast(from,side,2.5);must(!shown&&!hit,'10 wall closes the connection at distance.',{distance,shown:shown?.distance,hit:hit?.distance??hit?.timeOfImpact});distant.push(distance);}
  q.update(near);return{walks,rays,distant,estimatedInteriorDepth:true,lowerStairsOutsideThisCheck:true};
 });
 await check('10 canopy glass has matching damage, distant display and reset',()=>{
  q.reset();const target=sim.targets.find(t=>t.mesh.userData.component==='education10-link-canopy-glass');must(target,'Missing new canopy glass.');
  const from=target.mesh.position.clone().addScaledVector(up,-.5);q.focus(from);const hit=q.cast(from,up,.8),shown=q.render(from,up,.8)[0];
  must(hit&&q.owner(hit.collider)===target&&shown&&Math.abs(hit.timeOfImpact-shown.distance)<.025,'Canopy glass render and physics disagree.');
  sim.hit(target,100,up);const damage=[];
  for(const distance of[0,281,900]){const observer=near.clone().add(new THREE.Vector3(distance,0,distance));sim.setFocus(observer,true);q.update(observer);world.updateMatrixWorld(true);const visual=q.render(from,up,hit.timeOfImpact+.02)[0],physical=distance?sim.castUnloadedTargets(from,up,hit.timeOfImpact+.02):q.cast(from,up,hit.timeOfImpact+.02);must(!visual&&!physical,'Destroyed canopy glass left a ghost surface.',{distance});damage.push(distance);}
  q.reset();q.focus(from);const restored=q.cast(from,up,.8),visual=q.render(from,up,.8)[0];must(restored&&q.owner(restored.collider)===target&&visual&&Math.abs(visual.distance-shown.distance)<.001,'Canopy glass did not reset.');
  return{loaded:hit.timeOfImpact,rendered:shown.distance,damage,reset:true};
 });
 await check('three stair flights retain headroom and both 10 openings remain open at distance',()=>{
  q.reset();const stairs=access.externalStairs,entry=shell.userData.education10GroundEntry;
  must(stairs.flightCount===3&&stairs.directionChanges===2&&new Set(stairs.steps.map(s=>s.flight)).size===3,'The observed three stair flights are missing.');
  const clearances=[];
  for(const step of stairs.steps){const p=at((step.s0+step.s1)/2,(step.n0+step.n1)/2).setY(step.top+1);q.focus(p);const hit=q.cast(p,up,5);const clearance=hit?hit.timeOfImpact+1:null;must(clearance===null||clearance>=2.3,'A stair tread has insufficient headroom.',{step,clearance});clearances.push({flight:step.flight,clearance});}
  const door=sim.targets.find(t=>t.mesh.userData.component===entry.doorComponent);must(door,'Missing lower glass door.');sim.hit(door,100,side);
  const probes=[{s:9.95,n:4.7,y:access.layout.bridgeFloorY+1.1},{s:4.1,n:4.9,y:entry.floorY+1.1}],distant=[];
  for(const distance of[0,281,900]){const observer=near.clone().add(new THREE.Vector3(distance,0,distance));sim.setFocus(observer,true);q.update(observer);world.updateMatrixWorld(true);for(const p of probes){const from=at(p.s,p.n).setY(p.y),shown=q.render(from,side,2.3)[0],hit=distance?sim.castUnloadedTargets(from,side,2.3):q.cast(from,side,2.3);must(!shown&&!hit,'A generic 10 facade seals one of its two openings.',{distance,p,shown:shown?.distance,hit:hit?.distance??hit?.timeOfImpact});distant.push({distance,p});}}
  q.reset();return{clearances,distant,lowerDoorReset:true};
 });
 await check('raw road portal and separate entrance support continuous real capsule movement',()=>{
  const routes=[],failures=[],previous=vec(road.points[2]),start=A.clone().addScaledVector(previous.sub(A).normalize(),6),end=vec(road.points[5]);
  for(const n of[-2.1,0,2.1])for(const reverse of[false,true]){q.reset();let route=[start,A,B,end].map(p=>p.clone().addScaledVector(side,n));if(reverse)route=route.reverse();q.settle(route[0]);const w=q.moving.walk(route.slice(1));routes.push({n,reverse,...w});if(!w.reached||w.maxPenetration>=.025||w.maxLateralDeviation>.4||w.segments.some(s=>s.penetrations.length))failures.push(routes.at(-1));}
  const entry=access.entry,groundEntry=shell.userData.education10GroundEntry,extraRoutes=[],closedDoors=[];
  const good=w=>w.reached&&w.maxPenetration<.025&&w.segments.every(s=>!s.penetrations.length);
  for(const [name,points,component]of[['main-entrance',entry?.routeWorld,entry?.door?.component],['entrance-ramp',entry?.rampRouteWorld,entry?.door?.component],['external-stairs-upper-link',access.externalStairs?.routeWorld,access.upperDoor?.component],['10-ground-door',groundEntry?.routeWorld,groundEntry?.doorComponent]]){
   if(!points?.length){failures.push({name,reason:'missing actual route'});continue;}
   q.reset();const route=points.map(vec),door=sim.targets.find(t=>owned(t)&&t.mesh.userData.component===component);
   if(!door){failures.push({name,component,reason:'missing actual door collider'});continue;}
   try{q.settle(route[0],route[0].y+.75);const closed=q.moving.walk(route.slice(1)),expectedDoor=!closed.reached&&closed.segments.at(-1)?.blockers.some(b=>b.component===component);closedDoors.push({name,component,expectedDoor,closed});if(!expectedDoor)failures.push({name,reason:'closed route did not stop at its actual door',closed});}catch(e){failures.push({name,reason:'closed route setup',message:e.message,details:e.details});}
   sim.hit(door,100,axis);q.update(near);
   for(const offset of name==='entrance-ramp'?[-.3,0,.3]:name==='external-stairs-upper-link'?[-.12,0,.12]:[0]){
    const line=route.map((p,i)=>p.clone().addScaledVector(side,(name==='entrance-ramp'&&i<4)||name==='external-stairs-upper-link'?offset:0)),row={name,offset};
    try{q.settle(line[0],line[0].y+.75);row.forward=q.moving.walk(line.slice(1));if(!good(row.forward))failures.push({name,offset,direction:'forward',...row.forward});}catch(e){failures.push({name,offset,direction:'forward',message:e.message,details:e.details});}
    // 전진이 막혀도 반대편에서 시작해 역방향의 별도 결함을 수집한다.
    // 전진 성공 시에는 같은 캡슐 위치에서 연속해서 되돌아온다.
    try{if(!row.forward?.reached)q.settle(line.at(-1),line.at(-1).y+.75);row.backward=q.moving.walk(line.slice(0,-1).reverse());if(!good(row.backward))failures.push({name,offset,direction:'backward',...row.backward});}catch(e){failures.push({name,offset,direction:'backward',message:e.message,details:e.details});}
    extraRoutes.push(row);
   }
  }
  must(!failures.length,'An actual continuous route remains blocked or penetrates fixed geometry.',{routes,closedDoors,extraRoutes,failures});
  return{routes,closedDoors,extraRoutes,speedMps:movementSpeed,penetrationLimit:.025,scope:'원본 /333 segment3과 양쪽 실제 도로 점까지 세 보행선의 양방향 통과를 확인한다. 현관과 경사판, 외부 계단은 닫힌 실제 문에서 멈추는지와 파괴 후 왕복을 따로 검사한다. 경로별 실패를 모두 수집하며 사진의 치수로 확정하지 않는다.'};
 });
 await check('actual adjacent taxi curves clear the portal without worsening old outside collisions',()=>{
  must(traffic,'The real Traffic plan was not created.');q.reset();
  must(historicalSim&&historicalQueries,'The exact release37 full scene baseline is unavailable.');
  const vehicle=traffic.vehicles.find(v=>v.service==='taxi'),shape=new R.Cuboid(vehicle.width/2,vehicle.height/2,vehicle.length/2),rows=[],failures=[],knownOutside=[];
  const ranges=vehicleSamples(traffic,vehicle,roadId,(v,phase)=>{if(v.position.distanceTo(A.clone().lerp(B,.5).setY(v.position.y))>40)return;const center=new THREE.Vector3(0,v.height/2,0).applyQuaternion(v.quaternion).add(v.position);q.focus(center);const contacts=[];sim.world.intersectionsWithShape(center,v.quaternion,shape,c=>{const target=q.owner(c);if(!target)return true;const hit=c.contactShape(shape,center,v.quaternion,.01);if(hit&&hit.distance<-.005)contacts.push({...q.describe(target),center:target.box.getCenter(new THREE.Vector3()).toArray(),penetration:-hit.distance});return true;},R.QueryFilterFlags.EXCLUDE_DYNAMIC,undefined,sim.playerCollider,sim.player);const local=project(v.position),row={edge:v.edge.id,next:v.next.id,segment:v.edge.segmentIndex,phase,point:v.position.toArray(),...local,contacts};rows.push(row);historicalQueries.focus(center);const old=[];historicalSim.world.intersectionsWithShape(center,v.quaternion,shape,c=>{const target=historicalQueries.owner(c);if(!target)return true;const hit=c.contactShape(shape,center,v.quaternion,.01);if(hit&&hit.distance<-.005)old.push({...historicalQueries.describe(target),center:target.box.getCenter(new THREE.Vector3()).toArray(),penetration:-hit.distance});return true;},R.QueryFilterFlags.EXCLUDE_DYNAMIC,undefined,historicalSim.playerCollider,historicalSim.player);for(const c of contacts){const previous=old.find(o=>o.buildingId===c.buildingId&&o.component===c.component&&o.label===c.label&&Math.hypot(o.center[0]-c.center[0],o.center[2]-c.center[2])<.0001);if(c.buildingId===buildingId&&local.s>=-4&&local.s<=length+4)failures.push({...row,reason:'portal contact'});else if(!previous||c.penetration>previous.penetration+.0001)failures.push({...row,reason:'new or enlarged outside collision'});else knownOutside.push({point:row.point,buildingId:c.buildingId,penetration:c.penetration,baseline:previous.penetration});}});
  must(rows.length&&!failures.length,'An actual reachable taxi pose hits the portal or creates a new outside obstruction.',{tested:rows.length,failures:failures.slice(0,35),failureCount:failures.length});
  return{poses:rows.length,portalContacts:0,knownOutside,dimensions:{width:vehicle.width,height:vehicle.height,length:vehicle.length},ranges,busesUsingRoad:env.plan.routes.filter(r=>r.segments.some(s=>String(s.roadId)===roadId)).map(r=>r.id),scope:'기존 Traffic의 실제 직선 시작 범위와 회전곡선을 사용한다. 이 도로를 사용하지 않는 버스의 가상 주행은 검사하지 않으며, baseline에 남아 있던 다른 건물의 접촉은 개선 완료로 집계하지 않는다.'};
 });
 await check('portal floors, clearance and retained walls match real render and collision',()=>{
  q.reset();const samples=[],headroom=[],failures=[];
  for(const s of[.35,3.13,6.17,9.23,12.29,15.31,length-.35])for(const n of[-2.1,0,2.1]){const f=q.floor(at(s,n)),p=f.point.clone().addScaledVector(up,.45);q.focus(p);const h=q.cast(p,up,15),shown=q.render(p,up,15)[0];const row={s,n,physicalFloor:f.point.y,terrainY:f.ground,physicalOwner:q.describe(f.owner),renderMesh:f.rendered.object.name,renderFloorDifference:f.difference};samples.push(row);if(f.owner&&owned(f.owner)&&f.difference>.025)failures.push({...row,reason:'new floor mismatch'});if(h&&shown&&owned(q.owner(h.collider))){const clear=h.timeOfImpact+.45,difference=Math.abs(h.timeOfImpact-shown.distance);headroom.push({s,n,clear,difference,owner:q.describe(q.owner(h.collider))});if(clear<2.2||difference>.025)failures.push({s,n,clear,difference,reason:'ceiling collision or clearance'});}}
  must(headroom.length>0,'No actual overhead structure was found above the observed portal.');
  const floorParts=newParts.filter(t=>floors.has(t.mesh.userData.component)),surfaces=[],covered=[];
  for(const t of floorParts)for(const tr of triangleSamples(t.mesh).filter(tr=>tr.normal.y>.65&&tr.area>.0001)){const p=tr.point,from=p.clone().addScaledVector(up,.3);q.focus(from);const hit=q.cast(from,down,.8),shown=q.render(from,down,.8)[0],actualOwner=hit&&q.owner(hit.collider),difference=hit&&shown?Math.abs(hit.timeOfImpact-shown.distance):Infinity;const row={component:t.mesh.userData.component,triangle:tr.index,point:p.toArray(),difference,owner:q.describe(actualOwner)};if(hit&&hit.timeOfImpact<.005&&actualOwner){const actualWall=genericWallCover(env,actualOwner,hit.collider,from);if(actualWall?.valid){covered.push({...row,actualWall});continue;}const proxy=new THREE.Mesh(actualOwner.mesh.geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));proxy.matrixAutoUpdate=false;proxy.matrixWorld.copy(actualOwner.mesh.matrixWorld);
   const probes=[];for(const axisName of['x','z'])for(const sign of[-1,1]){const outside=from.clone(),direction=new THREE.Vector3();outside[axisName]=(sign<0?actualOwner.box.min[axisName]-.15:actualOwner.box.max[axisName]+.15);direction[axisName]=-sign;const max=outside.distanceTo(from)+.2,actual=q.cast(outside,direction,max),visible=q.render(outside,direction,max)[0],surface=new THREE.Raycaster(outside,direction,0,max).intersectObject(proxy,false)[0],difference=actual&&visible?Math.abs(actual.timeOfImpact-visible.distance):Infinity,proxyDifference=surface&&visible?Math.abs(surface.distance-visible.distance):Infinity;probes.push({axisName,sign,physical:actual?.timeOfImpact,rendered:visible?.distance,proxy:surface?.distance,owner:actual&&q.describe(q.owner(actual.collider)),difference,proxyDifference,valid:!!(actual&&visible&&surface&&actual.timeOfImpact>.005&&q.owner(actual.collider)===actualOwner&&difference<=.025&&proxyDifference<=.025)});}
   const exit=hit.collider.castRay(new R.Ray(from,up),30,false),visibleExit=q.render(from,up,30)[0],proxyExit=new THREE.Raycaster(from,up,0,30).intersectObject(proxy,false)[0],exitDifference=visibleExit?Math.abs(exit-visibleExit.distance):Infinity,proxyDifference=proxyExit&&visibleExit?Math.abs(proxyExit.distance-visibleExit.distance):Infinity,evidence={...row,actualWall,exit,visibleExit:visibleExit?.distance,proxyExit:proxyExit?.distance,exitDifference,proxyDifference,probes};proxy.material.dispose();
   if((exit>.005&&exitDifference<=.025&&proxyDifference<=.025)||['x','z'].some(a=>probes.filter(p=>p.axisName===a).every(p=>p.valid)))covered.push(evidence);else failures.push({...evidence,reason:'covered floor lacks matching actual upper structure'});}else if(!hit||!shown||difference>.025)failures.push({...row,reason:'new actual floor surface'});else surfaces.push(row);}
  const portals=[];for(const s of[0,length])for(const n of[-2.1,0,2.1]){const d=axis.clone().multiplyScalar(s===0?1:-1),p=at(s,n).addScaledVector(d,-.7);p.y=terrain.meshHeightAt(p.x,p.z)+1.1;q.focus(p);const h=q.cast(p,d,1.4),v=q.render(p,d,1.4)[0];const row={s,n,physical:h?.timeOfImpact,rendered:v?.distance,owner:h&&q.describe(q.owner(h.collider))};portals.push(row);if(h||v)failures.push({...row,reason:'portal boundary sealed'});}
  must(!failures.length,'The portal has a sealed edge, insufficient clearance or a surface mismatch.',{failures,samples,headroom});
  return{roadSamples:samples,newFloorTriangles:surfaces.length,coveredStructures:covered,maxNewSurfaceDifference:Math.max(0,...surfaces.map(s=>s.difference)),minimumHeadroom:Math.min(...headroom.map(r=>r.clear)),headroom,portals,limit:.025,scope:'새 보행면과 실제 머리 위 구조의 표면 정밀도는 2.5cm다. 기존 차도 표시와 지형의 원래 오프셋은 별도로 기록하며 새 바닥 정밀도에 합산하지 않는다.'};
 });
 await check('one H, distant openings, partial damage and reset retain physical access',()=>{
  q.reset();const p=at(length/2).setY(terrain.meshHeightAt(...[at(length/2).x,at(length/2).z])+1.1),directions=[side.clone(),side.clone().negate(),up.clone()];let probe;
  for(const direction of directions){q.focus(p);const hit=q.cast(p,direction,15),shown=q.render(p,direction,15)[0],target=hit&&q.owner(hit.collider);if(target&&owned(target)&&shown&&hit.timeOfImpact>.05&&Math.abs(hit.timeOfImpact-shown.distance)<.025){probe={direction,hit,shown,target};break;}}
  must(probe,'No exposed portal wall or ceiling can be used for the physical damage check.');
  const {direction,hit,shown,target}=probe;sim.setFocus(far,true);q.update(far);const unloaded=sim.castUnloadedTargets(p,direction,15);must(unloaded?.target===target&&Math.abs(unloaded.distance-hit.timeOfImpact)<.002,'Loaded and distant physical surfaces differ.',{loaded:hit.timeOfImpact,unloaded:unloaded?.distance,owner:q.describe(target)});
  world.scale.z=-1;q.update(near);world.updateMatrixWorld(true);const reflected=q.render(p,direction,15)[0];must(reflected&&Math.abs(reflected.distance-shown.distance)<.001,'One H changes the actual visible surface.');
  const distant=[];for(const distance of[279,281,900]){const observer=near.clone().add(new THREE.Vector3(distance,0,distance));sim.setFocus(observer,true);q.update(observer);world.updateMatrixWorld(true);for(const s of[0,length])for(const n of[-2.1,0,2.1]){const d=axis.clone().multiplyScalar(s===0?1:-1),from=at(s,n).addScaledVector(d,-.7);from.y=terrain.meshHeightAt(from.x,from.z)+1.1;const physical=sim.castUnloadedTargets(from,d,1.4),visual=q.render(from,d,1.4)[0];must(!physical&&!visual,'A distant generic facade closes the portal.',{distance,s,n,physical:physical?.distance,rendered:visual?.distance});distant.push({distance,s,n});}}
  sim.hit(target,100,direction);const damage=[];for(const distance of[0,281,900]){const observer=near.clone().add(new THREE.Vector3(distance,0,distance));sim.setFocus(observer,true);q.update(observer);world.updateMatrixWorld(true);const visual=q.render(p,direction,shown.distance+.02)[0],physical=distance>110?sim.castUnloadedTargets(p,direction,hit.timeOfImpact+.02):q.cast(p,direction,hit.timeOfImpact+.02);must(!visual&&!physical,'A destroyed portal part leaves a ghost surface.',{distance,visual:visual?.distance,physical:physical?.distance??physical?.timeOfImpact});damage.push(distance);}
  const resets=[];for(let cycle=0;cycle<2;cycle++){sim.reset();q.update(near);world.updateMatrixWorld(true);q.focus(p);const restored=q.cast(p,direction,15),visual=q.render(p,direction,15)[0];must(restored&&q.owner(restored.collider)===target&&visual&&Math.abs(visual.distance-shown.distance)<.001,'Reset does not restore the portal part.');const start=at(-4,0),end=at(length+3,0);q.settle(start);const walk=q.moving.walk([end,start]);q.verifyWalk(walk);resets.push({cycle,walk});if(cycle===0)sim.hit(target,100,direction);}
  return{target:q.describe(target),loaded:hit.timeOfImpact,unloaded:unloaded.distance,rendered:shown.distance,reflected:reflected.distance,distant,damage,resets,scope:'논리 좌표의 물리를 유지하고 표시 장면에 H를 한 번 적용한다. 원거리 개구부와 실제 부품 파괴 및 복원 후 왕복을 확인하며 화면 품질 검사를 대신하지 않는다.'};
 });
}catch(e){results.push({name:'education101 full scene setup',status:'FAIL',message:e.message,details:e.details});console.log('FAIL '+e.message);}
finally{if(sim){sim.world.removeCharacterController(sim.controller);sim.world.free();}if(historicalSim){historicalSim.world.removeCharacterController(historicalSim.controller);historicalSim.world.free();}traffic?.dispose();oldTraffic?.dispose();save(false);if(results.some(r=>r.status==='FAIL')||Object.values(sourceStillMatches()).some(v=>!v))process.exitCode=1;}
