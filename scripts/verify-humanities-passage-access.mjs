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
const BASELINE='79c7debb0bf6f604b6f38e2c0c690175d1570bf6';
const baselineRoot=pathToFileURL(path.join(root,'artifacts/humanities-passage-access-test/historical-src')+path.sep).href;
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

async function campusBeforeLaterHumanities(env){
 const scene=new THREE.Scene();scene.add(env.terrain.mesh.clone());
 const {createFullCampus}=await sourceModule('fullCampus');
 const campus=createFullCampus(scene,env.data,env.terrain.heightAt,{humanities250:false,humanities23:false,humanities4:false,humanities35:false,humanities8:false,humanities7:false,humanities6:false,humanities14Exterior:false,humanities1:false,humanities2:false,humanities35Exterior:false,education10Exterior:false,education11Exterior:false});scene.updateMatrixWorld(true);return {...campus,scene};
}
function sourceStillMatches(){return Object.fromEntries(Object.entries(hashes).map(([f,h])=>[f,sha(fs.readFileSync(path.join(root,f)))===h]));}

function movementTools(sim){
 const describe=c=>{const body=c.parent(),target=body?sim.targets.find(t=>t.body?.handle===body.handle):undefined;return {collider:c.handle,buildingId:target?.mesh.userData.buildingId??null,connectionId:target?.mesh.userData.connectionId??null,component:target?.mesh.userData.component??null,label:target?.label??(body?'unmapped body':'terrain or static')};};
 const contacts=()=>{const shape=sim.playerCollider.shape,position=sim.player.translation(),rotation=sim.playerCollider.rotation(),found=[];sim.world.intersectionsWithShape(position,rotation,shape,c=>{const hit=c.contactShape(shape,position,rotation,.02);if(hit&&hit.distance<-.01)found.push({...describe(c),penetration:-hit.distance,point:hit.point1});return true;},R.QueryFilterFlags.EXCLUDE_DYNAMIC,undefined,sim.playerCollider,sim.player);return found;};
 const blockers=()=>Array.from({length:sim.controller.numComputedCollisions()},(_,i)=>sim.controller.computedCollision(i)).filter(c=>c?.collider).map(c=>({...describe(c.collider),normal:c.normal1,point:c.witness1}));
 function walk(route,requestedSpeed=6){const segments=[];let maxPenetration=0;for(const dest of route){let stalled=0,frames=0,last=new THREE.Vector3().copy(sim.player.translation());for(;frames<1600;frames++){const p=sim.player.translation(),dx=dest.x-p.x,dz=dest.z-p.z,d=Math.hypot(dx,dz);if(d<.12)break;const speed=Math.min(requestedSpeed,d*60);sim.step(1/60,dx/d*speed,dz/d*speed,false);const q=new THREE.Vector3().copy(sim.player.translation());stalled=q.distanceTo(last)<.002?stalled+1:0;last=q;if(frames%10===0)for(const c of contacts())maxPenetration=Math.max(maxPenetration,c.penetration);if(stalled>120)break;}const p=sim.player.translation(),distance=Math.hypot(dest.x-p.x,dest.z-p.z);segments.push({dest,frames,end:{...p},distance,penetrations:contacts(),blockers:distance>.2?blockers():[]});if(distance>.2)break;}return {reached:segments.length===route.length&&segments.at(-1).distance<.2,maxPenetration,segments};}
 return {contacts,blockers,walk};
}

const output=path.join(root,'artifacts/humanities-passage-access-test/results.json'),results=[];
fs.mkdirSync(path.dirname(output),{recursive:true});
const report={scope:'원본 /540과 양끝 보행로를 실제 전체 장면에서 검사한다. 통과구 폭과 내공, 마감은 게임 근사이며 이 검사는 실물 관측이나 모바일 렌더링 검사가 아니다.',baselineCommit:BASELINE,results,harnessSha256:sha(fs.readFileSync(new URL(import.meta.url)))};
const must=(condition,message,details)=>{if(!condition)throw Object.assign(new Error(message),{details});};
const check=async(name,fn)=>{try{results.push({name,status:'PASS',...await fn()});console.log('PASS '+name);}catch(e){results.push({name,status:'FAIL',message:e.message,details:e.details});console.log('FAIL '+name+' '+e.message);}};
const vec=p=>Array.isArray(p)?new THREE.Vector3(...p):new THREE.Vector3(p.x,p.y??0,p.z),up=new THREE.Vector3(0,1,0),down=up.clone().negate(),H=p=>new THREE.Vector3(p.x,p.y,-p.z);
const visible=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};
const bytes=v=>Buffer.from(v.buffer,v.byteOffset,v.byteLength);
const geometryHash=g=>sha(Buffer.concat([...(g.index?[bytes(g.index.array)]:[]),...Object.keys(g.attributes).sort().map(k=>bytes(g.attributes[k].array))]));
const specSignature=t=>JSON.stringify({matrix:t.mesh.matrixWorld.elements,size:t.size.toArray(),geometry:geometryHash(t.mesh.geometry),convex:t.collisionVertices?sha(bytes(t.collisionVertices)):null});
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
function compareOutsideRoadGeometry(before,after,regions){
 const limit=.00001,schema=g=>Object.keys(g.attributes).sort().map(key=>({key,itemSize:g.attributes[key].itemSize,normalized:g.attributes[key].normalized,arrayType:g.attributes[key].array.constructor.name}));
 assert.deepEqual(schema(after),schema(before),'Outside road attributes changed their layout.');
 function rows(g){
  const keys=Object.keys(g.attributes).sort(),position=g.attributes.position,count=g.index?.count??position.count,groups=new Map();
  const regenerated=g.clone();regenerated.computeVertexNormals();let normalSamples=0;
  for(let i=0;i<count;i+=3){
   const ids=[0,1,2].map(k=>g.index?g.index.getX(i+k):i+k),xs=ids.map(k=>position.getX(k)),zs=ids.map(k=>position.getZ(k));
   if(regions.some(r=>Math.max(...xs)>=r.minX&&Math.min(...xs)<=r.maxX&&Math.max(...zs)>=r.minZ&&Math.min(...zs)<=r.maxZ))continue;
   const vertices=ids.map(k=>Object.fromEntries(keys.map(key=>{const a=g.attributes[key];return[key,Array.from({length:a.itemSize},(_,j)=>a.array[k*a.itemSize+j])]})));
   for(const k of ids)for(let j=0;j<3;j++){assert.equal(g.attributes.normal.array[k*3+j],regenerated.attributes.normal.array[k*3+j],`Road normal is not derived from its actual positions at triangle ${i/3}.`);normalSamples++;}
   // 시작 정점의 순환 이동만 정규화한다. XZ 좌표와 삼각형 방향은 정확히 보존한다.
   let start=0;for(let j=1;j<3;j++)if(vertices[j].position[0]<vertices[start].position[0]||(vertices[j].position[0]===vertices[start].position[0]&&vertices[j].position[2]<vertices[start].position[2]))start=j;
   const ordered=[0,1,2].map(j=>vertices[(start+j)%3]),key=JSON.stringify(ordered.map(v=>keys.filter(k=>k!=='normal').map(k=>[k,k==='position'?[v[k][0],v[k][2]]:v[k]]))),row={triangle:i/3,vertices:ordered};
   const group=groups.get(key)??[];group.push(row);groups.set(key,group);
  }
  regenerated.dispose();
  for(const group of groups.values())group.sort((a,b)=>{for(let j=0;j<3;j++){const d=a.vertices[j].position[1]-b.vertices[j].position[1];if(d)return d;}return 0;});
  return{groups,normalSamples};
 }
 const old=rows(before),current=rows(after),changes=[];let triangles=0,maxYDifference=0,maxNormalDifference=0;
 assert.equal(current.groups.size,old.groups.size,'Outside road XZ triangles or exact attributes changed.');
 for(const[key,oldGroup]of old.groups){
  const newGroup=current.groups.get(key);assert(newGroup,'An outside road XZ triangle or its exact attributes changed.');assert.equal(newGroup.length,oldGroup.length,'An outside road triangle was added or removed.');
  for(let i=0;i<oldGroup.length;i++){
   const a=oldGroup[i],b=newGroup[i],ys=a.vertices.map((v,j)=>Math.abs(v.position[1]-b.vertices[j].position[1])),normals=a.vertices.flatMap((v,j)=>v.normal.map((n,k)=>Math.abs(n-b.vertices[j].normal[k])));
   ys.forEach(d=>assert(Number.isFinite(d)&&d<=limit,`Outside road height changed by ${d}m at triangle ${a.triangle}.`));
   const dy=Math.max(...ys),dn=Math.max(...normals);maxYDifference=Math.max(maxYDifference,dy);maxNormalDifference=Math.max(maxNormalDifference,dn);triangles++;
   if(dy||dn)changes.push({oldTriangle:a.triangle,newTriangle:b.triangle,points:a.vertices.map(v=>v.position),maxYDifference:dy,maxNormalDifference:dn});
  }
 }
 return{triangles,regions,numericYLimit:limit,maxYDifference,maxNormalDifference,changedTriangles:changes.length,changes,xzAndWindingExact:true,otherAttributesExact:true,normalsRecomputedExactly:true,normalAttributeSamples:old.normalSamples+current.normalSamples,scope:'제외 영역 밖의 XZ 삼각형과 다른 속성은 정확히 같다. Y만 0.01mm 이하의 수치 차이를 허용한다. 법선은 전후 값을 느슨하게 비교하지 않고 각 버전의 실제 정점으로 다시 계산한 값과 정확히 대조한다.'};
}
const collectMeshes=world=>{const list=[];world.traverse(o=>{if(o.isMesh)list.push(o);});return list;};
let sim;
try{
 read('src/main.ts');
 const env=await buildWorld(),{world,terrain,data,campus}=env,buildingId='way/167984624',road=data.roads.find(r=>r.id==='way/1429747754/540'),building=data.buildings.find(b=>b.id===buildingId);
 must(road&&building,'The original humanities building or passage is missing.');
 const origin=new THREE.Vector3(road.points[0][0],0,road.points[0][1]),end=new THREE.Vector3(road.points.at(-1)[0],0,road.points.at(-1)[1]),axis=end.clone().sub(origin).normalize(),side=new THREE.Vector3(-axis.z,0,axis.x),length=origin.distanceTo(end),at=(s,n=0)=>origin.clone().addScaledVector(axis,s).addScaledVector(side,n);
 const crossings=[];for(let i=0;i<building.points.length-1;i++){const a=building.points[i],b=building.points[i+1],dx=b[0]-a[0],dz=b[1]-a[1],den=axis.x*dz-axis.z*dx;if(Math.abs(den)<1e-10)continue;const x=a[0]-origin.x,z=a[1]-origin.z,s=(x*dz-z*dx)/den,t=(x*axis.z-z*axis.x)/den;if(s>=0&&s<=length&&t>=0&&t<=1)crossings.push({edge:i,s,point:at(s).toArray()});}crossings.sort((a,b)=>a.s-b.s);must(crossings.length===2,'The original centerline no longer crosses two building edges.',crossings);
 const near=at(length/2).setY(terrain.heightAt(...road.points[0])+2),far=near.clone().add(new THREE.Vector3(900,0,900));sim=env.makeSimulation(near);
 const moving=movementTools(sim),meshes=collectMeshes(world),shell=world.children.find(o=>o.userData.buildingId===buildingId&&o.userData.role==='building-shell');
 let access=shell?.userData.humanitiesPassage;world.traverse(o=>{access??=o.userData.humanitiesPassage;});must(access,'The actual full campus has no humanities passage metadata.');
 let ownerByBody=new Map();
 const update=p=>{env.update(p);world.updateMatrixWorld(true);};
 const focus=p=>{sim.setFocus(p,true);sim.world.step();ownerByBody=new Map(sim.targets.filter(t=>t.body).map(t=>[t.body.handle,t]));};
 const owner=c=>ownerByBody.get(c.parent()?.handle),describe=t=>t?{buildingId:t.mesh.userData.buildingId??null,component:t.mesh.userData.component??null,label:t.label}:null;
 const render=(p,d,max)=>new THREE.Raycaster(world.scale.z<0?H(p):p,world.scale.z<0?H(d):d,0,max).intersectObjects(meshes.filter(visible),false);
 const cast=(p,d,max)=>sim.world.castRay(new R.Ray(p,d),max,true,R.QueryFilterFlags.EXCLUDE_DYNAMIC,undefined,sim.playerCollider,sim.player);
 const floor=p=>{const q=new THREE.Vector3(Math.fround(p.x),0,Math.fround(p.z)),ground=terrain.meshHeightAt(q.x,q.z),from=q.clone().setY(ground+.8);focus(from);const h=cast(from,down,1.8),v=render(from,down,1.8)[0];must(h&&v&&h.timeOfImpact>.005,'A passage floor probe starts in solid geometry or has no surface.',{point:q.toArray(),ground,physical:h?.timeOfImpact,owner:h&&describe(owner(h.collider)),rendered:v?.object.name});return{point:q.setY(from.y-h.timeOfImpact),ground,physical:h,owner:owner(h.collider),rendered:v,renderY:v.point.y,difference:Math.abs(h.timeOfImpact-v.distance)};};
 const reset=()=>{world.scale.z=1;sim.reset();update(near);};
 const settle=p=>{const f=floor(p);sim.teleport(f.point.clone().addScaledVector(up,1.75));for(let i=0;i<60;i++)sim.step(1/60,0,0,false);must(!moving.contacts().length,'The initial capsule intersects a fixed surface.',moving.contacts());return f;};
 const verifyWalk=w=>must(w.reached&&w.maxPenetration<.025&&w.segments.every(s=>!s.penetrations.length),'The original passage route is blocked or penetrates a fixed surface.',w);
 update(near);report.geometry={length,interiorLength:crossings[1].s-crossings[0].s,crossings,access,targets:sim.targets.length};

 await check('release42 preservation with the separately verified 250 and 2/3 additions disabled',async()=>{
  for(const f of['public/data/campus.json','public/data/terrain.json','sources/campus.osm'])assertCampusSourcePreserved(f,read(f),gitBytes(f));
  const unchangedSource=[];for(const f of['src/physics.ts']){const current=read(f),before=gitBytes(f),normalize=b=>b.toString('utf8').replaceAll('\r\n','\n');assert.equal(sha(normalize(current)),sha(normalize(before)),`${f} differs from release 42 beyond line endings.`);unchangedSource.push({file:f,currentBytes:sha(current),gitBytes:sha(before),normalizedLF:sha(normalize(current))});}
  const raw=read('sources/campus.osm').toString(),body=raw.match(/<way\b[^>]*id="1429747754"[^>]*>([\s\S]*?)<\/way>/)?.[1];must(body&&body.includes('k="tunnel" v="building_passage"')&&body.includes('k="covered" v="yes"'),'The original mapped covered passage tags are missing.');
  const [oldTerrainModule,oldCampusModule]=await Promise.all(['terrain.ts','fullCampus.ts'].map(n=>import(new URL(n,baselineRoot))));
  const oldWorld=new THREE.Scene(),oldTerrain=oldTerrainModule.createTerrain(oldWorld,JSON.parse(read('public/data/terrain.json')),data.buildings),oldCampus=oldCampusModule.createFullCampus(oldWorld,data,oldTerrain.heightAt);oldCampus.update(near);oldWorld.updateMatrixWorld(true);
  const currentTerrainModule=await sourceModule('terrain'),priorTerrain=currentTerrainModule.createTerrain(new THREE.Scene(),JSON.parse(read('public/data/terrain.json')),data.buildings,{humanitiesGarden:false});
  assert(bytes(oldTerrain.vertices).equals(bytes(priorTerrain.vertices)),"Terrain vertices changed before the separately verified garden correction.");
  assert(bytes(oldTerrain.indices).equals(bytes(priorTerrain.indices)),"Terrain indices changed before the separately verified garden correction.");
  // 이후 추가된 14동 계단과 아방궁은 별도 전체 장면 검사에서 이전 건물과의 독립성을 대조한다.
  const unrelated=t=>t.mesh.userData.buildingId!==buildingId&&!['connection/humanities-14-stair','connection/humanities-garden'].includes(t.mesh.userData.connectionId);
  const before250=await campusBeforeLaterHumanities(env); const oldOther=oldCampus.breakables.filter(unrelated),newOther=before250.breakables.filter(unrelated),preservedParts=comparePreservedParts(oldOther,newOther);
  const oldRoof=oldCampus.breakables.find(t=>t.mesh.userData.buildingId===buildingId&&t.mesh.userData.roof),roof=before250.breakables.find(t=>t.mesh.userData.buildingId===buildingId&&t.mesh.userData.roof);must(oldRoof&&roof&&specSignature(oldRoof)===specSignature(roof),"The generic roof changed.");
  const oldRoad=oldWorld.getObjectByName("campus-road-surface"),currentRoad=before250.scene.getObjectByName("campus-road-surface"),diningRoadRegions=[];
  must(oldRoad&&currentRoad,"Road geometry is missing.");
  assert.equal(geometryHash(oldRoad.geometry),geometryHash(currentRoad.geometry),"Road geometry changed.");
  const preservedRoadGeometry={allAttributesExact:true};
  const oldShell=oldWorld.children.find(o=>o.userData.buildingId===buildingId&&o.userData.role==='building-shell'),oldMeshes=collectMeshes(oldShell),newMeshes=collectMeshes(before250.scene.children.find(o=>o.userData.buildingId===buildingId&&o.userData.role==='building-shell')),oldInstances=oldMeshes.filter(o=>o.isInstancedMesh),newInstances=newMeshes.filter(o=>o.isInstancedMesh);
  assert.equal(newInstances.length,oldInstances.length,'The generic facade batching changed.');
  const passageShell=world.getObjectByName('connection/humanities-1-passage'),passageMeshes=passageShell?collectMeshes(passageShell):[];
  before250.update(near);before250.scene.updateMatrixWorld(true);const oldRayMeshes=collectMeshes(oldWorld),legacyRayMeshes=collectMeshes(before250.scene),upper=[];for(const c of crossings){const d=axis.clone().multiplyScalar(c===crossings[0]?1:-1),p=at(c.s).addScaledVector(d,-2).setY(terrain.heightAt(...road.points[0])+7);const before=new THREE.Raycaster(p,d,0,4).intersectObjects(oldRayMeshes.filter(visible),false)[0],after=new THREE.Raycaster(p,d,0,4).intersectObjects(legacyRayMeshes.filter(visible),false)[0];must(before&&after&&Math.abs(before.distance-after.distance)<.025,'The upper facade above the opening changed its exposed plane.',{edge:c.edge,before:before?.distance,after:after?.distance});upper.push({edge:c.edge,before:before.distance,after:after.distance});}
  must(newMeshes.length===oldMeshes.length&&passageMeshes.length===1,'The passage creates per-part render meshes.',{old:oldMeshes.length,new:newMeshes.length,outsideShell:passageMeshes.length});
  return{rawTags:{covered:'yes',tunnel:'building_passage'},originalFootprint:building.points,unchangedSource,unchangedOtherBreakables:oldOther.length,preservedParts,preservedRoadGeometry,terrainVertices:terrain.vertices.length/3,roofUnchangedWithLater250Disabled:true,terrainUnchangedWithLaterGardenDisabled:true,drivableRoadGeometryUnchangedOutside:diningRoadRegions,upper,renderBatches:{oldShell:oldMeshes.length,newShell:newMeshes.length,additionalOutsideShell:passageMeshes.length,facadeInstancedMeshes:newInstances.length},scope:"42판과 차도 및 다른 건물을 비교한다. 지형은 별도 검증한 아방궁 보정을 끄고 대조한다. 1동 입구 창의 표시와 새 시설만 달라졌다. 실제 휴대폰 성능 측정은 아니다."};
 });

 await check('desktop and mobile speed walks clear the passage and its original branches',()=>{
  const paths=[];for(const requestedSpeed of[6,8])for(const offset of[-1.6,0,1.6])for(const reverse of[false,true]){reset();const route=[at(0,offset),at(length,offset)];if(reverse)route.reverse();const start=settle(route[0]),walk=moving.walk(route.slice(1),requestedSpeed);verifyWalk(walk);paths.push({speed:requestedSpeed,offset,reverse,startFloor:start.point.toArray(),walk});}
  const south=data.roads.find(r=>r.id==='way/167982833/52'),north=data.roads.find(r=>r.id==='way/167982832/51'),branch=data.roads.find(r=>r.id==='way/456534588/285');must(south&&north&&branch,'An original endpoint branch is missing.');
  const point=p=>new THREE.Vector3(p[0],0,p[1]),toward=(start,dest,distance)=>start.clone().addScaledVector(dest.clone().sub(start).normalize(),distance),start=toward(origin,point(south.points[0]),5),destinations=[{id:north.id,p:toward(end,point(north.points[1]),5)},{id:branch.id+':west',p:toward(end,point(branch.points[2]),5)},{id:branch.id+':east',p:toward(end,point(branch.points[4]),5)}],joins=[];
  for(const dest of destinations){reset();settle(start);const route=[origin,end,dest.p],outbound=moving.walk(route);verifyWalk(outbound);const returned=moving.walk([end,origin,start]);verifyWalk(returned);joins.push({id:dest.id,start:start.toArray(),end:dest.p.toArray(),outbound,returned});}
  return{speeds:[6,8],offsets:[-1.6,0,1.6],paths,joins,scope:'원본 /540의 세 보행선을 양방향으로 통과하고 /52와 /51, /285의 세 분기를 각각 5m 연장해 왕복한다. 모든 외곽 바닥이나 실측 보행폭을 검증했다는 뜻은 아니다.'};
 });

 await check('actual floor, portals and ceiling agree with rendered surfaces',()=>{
  reset();const samples=[],failures=[],headrooms=[];for(let s=.3;s<length-.2;s+=.7)for(const n of[-1.95,-1,0,1,1.95]){const f=floor(at(s,n)),row={s,n,point:f.point.toArray(),ground:f.ground,physicalOwner:describe(f.owner),render:f.rendered.object.name,difference:f.difference,clearance:f.point.y-f.ground};samples.push(row);if(f.difference>.025||row.clearance<.019||row.clearance>.06)failures.push(row);if(s>crossings[0].s+.5&&s<crossings[1].s-.5){const p=f.point.clone().addScaledVector(up,.1);focus(p);const h=cast(p,up,5),v=render(p,up,5)[0];const hrow={s,n,height:h?.timeOfImpact+.1,physicalOwner:h&&describe(owner(h.collider)),rendered:v?.distance+.1,difference:h&&v?Math.abs(h.timeOfImpact-v.distance):null};headrooms.push(hrow);if(!h||!v||hrow.difference>.025||hrow.height<2.675)failures.push(hrow);}}
  must(!failures.length,'A passage floor or ceiling differs from rendering or lacks usable clearance.',{failures:failures.slice(0,25),count:failures.length});
  const portals=[];for(const crossing of crossings)for(const n of[-1.6,0,1.6]){const d=axis.clone().multiplyScalar(crossing===crossings[0]?1:-1),q=at(crossing.s,n),p=q.clone().addScaledVector(d,-.8).setY(terrain.meshHeightAt(q.x,q.z)+1.05);focus(p);const h=cast(p,d,1.6),v=render(p,d,1.6)[0];must(!h&&!v,'A generic wall or window still seals the mapped opening.',{edge:crossing.edge,n,physical:h?.timeOfImpact,owner:h&&describe(owner(h.collider)),rendered:v?.distance,mesh:v?.object.name});portals.push({edge:crossing.edge,n,clearDistance:1.6});}
  const joins=[];for(const s of[.01,length-.01])for(const n of[-1.6,0,1.6]){const a=floor(at(s-.02,n)),b=floor(at(s+.02,n)),outside=s<1?a:b,row={s,n,sampleSeparation:.04,heightDifference:b.point.y-a.point.y,renderHeightDifference:b.renderY-a.renderY,firstOwner:describe(a.owner),secondOwner:describe(b.owner),renderMeshA:a.rendered.object.name,renderMeshB:b.rendered.object.name,renderDifferenceA:a.difference,renderDifferenceB:b.difference};must(Math.abs(row.heightDifference)<.1,'The new floor leaves an abrupt endpoint step.',row);if(outside.rendered.object===terrain.mesh){row.transitionKind='floor to original bare terrain';must(Math.abs(row.renderHeightDifference-row.heightDifference)<.025,'The bare-terrain threshold has a visual-only obstruction.',row);}else{row.transitionKind='floor to existing pedestrian overlay';must(Math.abs(row.renderHeightDifference)<.025,'The existing pedestrian ribbon leaves a visible step at the new floor endpoint.',row);}joins.push(row);}
  const overlayBoundaries=[];for(const s of[-2,length+2])for(const n of[-.7,0,.7]){const a=floor(at(s-.002,n)),b=floor(at(s+.002,n)),row={s,n,sampleSeparation:.004,renderHeightDifference:b.renderY-a.renderY,physicalHeightDifference:b.point.y-a.point.y,renderMeshA:a.rendered.object.name,renderMeshB:b.rendered.object.name};must(Math.abs(row.renderHeightDifference)<.025,'The outer edge of the pedestrian overlay transition is discontinuous.',row);overlayBoundaries.push(row);}
  return{samples:samples.length,maximumDifference:Math.max(...samples.map(p=>p.difference)),floorLimit:.025,terrainClearance:[Math.min(...samples.map(p=>p.clearance)),Math.max(...samples.map(p=>p.clearance))],minimumHeadroom:Math.min(...headrooms.map(p=>p.height)),ceilingSamples:headrooms.length,maximumCeilingDifference:Math.max(...headrooms.map(p=>p.difference)),portals,joins,overlayBoundaries,endpointOverlay:access.endpointOverlay,scope:'내부 보행면과 천장 표면은 2.5cm 기준이다. 기존 표시와의 접속은 실제 표시 높이를 확인하고, 표시가 없는 남쪽 양옆의 지형 접속은 약3.5cm 물리 턱과 시각 턱의 일치를 별도로 기록한다. 바깥 기존 보행 표시 전체가 물리 바닥과 2.5cm 이내라고 주장하지 않는다.'};
 });

 await check('side walls and overhead facade remain solid beside the restored opening',()=>{
  reset();const walls=[];for(const s of[6.3,12.3,19.3])for(const sign of[-1,1]){const p=floor(at(s)).point.addScaledVector(up,1),d=side.clone().multiplyScalar(sign);focus(p);const h=cast(p,d,4),v=render(p,d,4)[0];must(h&&v&&owner(h.collider)?.mesh.userData.buildingId===buildingId,'A passage side wall is missing.',{s,sign,owner:h&&describe(owner(h.collider)),render:v?.object.name});must(Math.abs(h.timeOfImpact-v.distance)<.025,'A side wall has an oversized collider.',{s,sign,physical:h.timeOfImpact,rendered:v.distance});walls.push({s,sign,physical:h.timeOfImpact,rendered:v.distance,owner:describe(owner(h.collider))});}
  const preserved=[];for(const crossing of crossings)for(const n of[-3.5,3.5]){const d=axis.clone().multiplyScalar(crossing===crossings[0]?1:-1),q=at(crossing.s,n),p=q.clone().addScaledVector(d,-2).setY(terrain.meshHeightAt(q.x,q.z)+1);focus(p);const h=cast(p,d,4),v=render(p,d,4)[0];must(h&&v&&owner(h.collider)?.mesh.userData.buildingId===buildingId,'The generic facade beside the opening was removed.',{edge:crossing.edge,n,owner:h&&describe(owner(h.collider))});preserved.push({edge:crossing.edge,n,physical:h.timeOfImpact,rendered:v.distance});}
  const p=floor(at(length/2)).point.addScaledVector(up,.12);focus(p);const ceiling=cast(p,up,5);must(ceiling&&owner(ceiling.collider)?.mesh.userData.buildingId===buildingId,'There is no fixed ceiling over the restored passage.');
  return{walls,preserved,ceiling:{height:ceiling.timeOfImpact+.12,owner:describe(owner(ceiling.collider))},scope:'통로 옆면과 개구부 바깥 외벽, 머리 위의 고정 충돌면을 확인한다. 원본 건물의 층수나 천장 높이를 실측값으로 보증하지 않는다.'};
 });

 await check("photo details share their owners damage and restore multicolour paving",()=>{
  reset();const mesh=world.getObjectByName("humanities-passage-surfaces"),before=geometryHash(mesh.geometry),probeRows=[];
  for(const component of["noticeboard-backing","entry-upper-window"]){
   const target=sim.targets.find(t=>t.mesh.userData.component===component);must(target,"Missing photo component.",{component});
   const from=target.mesh.position.clone().addScaledVector(axis,-2),initial=render(from,axis,3)[0];must(initial,"Photo component has no rendered surface.",{component});
   sim.hit(target,100,axis);update(near);must(!render(from,axis,initial.distance+.015).length,"An attached detail floats after its owner is destroyed.",{component});
   update(far);must(!render(from,axis,initial.distance+.015).length,"An attached detail returns at distance.",{component});
   sim.reset();update(near);assert.equal(geometryHash(mesh.geometry),before,"Reset did not restore all photo detail colours and geometry.");probeRows.push({component,distance:initial.distance});
  }
  const f=floor(at(12.37,.5)),owner=f.owner;must(owner,"No floor owner for colour check.");
  sim.hit(owner,1,axis);sim.step(1/60,0,0,false);update(near);sim.reset();update(near);
  assert.equal(geometryHash(mesh.geometry),before,"Paver colours changed permanently after damage flash.");
  return{probeRows,geometry:access.geometry,floorDecoration:access.floorDecoration,allColoursRestored:true,scope:"게시판 종이와 창살은 본체가 부서지면 함께 사라진다. 바닥 파괴와 복원 검사는 기존 보행 검사와 함께 수행한다."};
 });

 await check('one H preserves loaded and distant wall damage and reset restores the passage',()=>{
  reset();const p=floor(at(12.37)).point.addScaledVector(up,1),d=side.clone();focus(p);const h=cast(p,d,4),v=render(p,d,4)[0],target=h&&owner(h.collider);must(target&&v,'The representative passage wall is missing.');sim.setFocus(far,true);const unloaded=sim.castUnloadedTargets(p,d,4);must(unloaded?.target===target&&Math.abs(unloaded.distance-h.timeOfImpact)<.002,'Loaded and unloaded passage collision differs.',{physical:h.timeOfImpact,unloaded:unloaded?.distance,physicalOwner:describe(target),unloadedOwner:unloaded&&describe(unloaded.target)});
  world.scale.z=-1;update(near);const reflected=render(p,d,4)[0];must(reflected&&Math.abs(reflected.distance-v.distance)<.001,'One H changes the actual wall surface.');
  const farPortals=[];for(const distance of[279,281,900]){const observer=near.clone().add(new THREE.Vector3(distance,0,distance));sim.setFocus(observer,true);update(observer);for(const crossing of crossings)for(const n of[-1.6,0,1.6]){const direction=axis.clone().multiplyScalar(crossing===crossings[0]?1:-1),q=at(crossing.s,n),from=q.clone().addScaledVector(direction,-.8).setY(terrain.meshHeightAt(q.x,q.z)+1.05),unloadedHit=sim.castUnloadedTargets(from,direction,1.6),shown=render(from,direction,1.6)[0];must(!unloadedHit&&!shown,'A distant generic facade seals the mapped portal.',{distance,edge:crossing.edge,n,unloaded:unloadedHit?.distance,rendered:shown?.distance});farPortals.push({distance,edge:crossing.edge,n});}}
  const max=Math.max(h.timeOfImpact,v.distance)+.02;sim.hit(target,100,d);update(near);const distances=[];for(const distance of[279,281,900]){const observer=near.clone().add(new THREE.Vector3(distance,0,distance));sim.setFocus(observer,true);update(observer);must(!sim.castUnloadedTargets(p,d,max)&&!render(p,d,max).length,'A destroyed wall reappears at distance.',{distance});distances.push(distance);}
  update(near);const floorBefore=floor(at(12.37,.5)),floorTarget=floorBefore.owner;must(floorTarget?.mesh.userData.component==='passage-floor','The representative floor has no destructible owner.');sim.hit(floorTarget,100,down);update(near);const revealed=floor(at(12.37,.5));must(!revealed.owner&&Math.abs(revealed.point.y-revealed.ground)<.001&&revealed.difference<.001,'Destroying a floor part leaves a hidden collider or an old pedestrian overlay.',{owner:describe(revealed.owner),physicalY:revealed.point.y,terrainY:revealed.ground,renderDifference:revealed.difference});
  const resets=[];for(let cycle=0;cycle<2;cycle++){sim.reset();update(near);focus(p);const restored=cast(p,d,4),shown=render(p,d,4)[0];must(restored&&owner(restored.collider)===target&&shown&&Math.abs(shown.distance-v.distance)<.001,'Reset does not restore the original passage wall.');const start=floor(at(0)).point;sim.teleport(start.clone().addScaledVector(up,1.75));for(let i=0;i<60;i++)sim.step(1/60,0,0,false);const walk=moving.walk([at(length)]);verifyWalk(walk);resets.push({cycle,walk});if(cycle===0)sim.hit(target,100,d);}
  return{owner:describe(target),loaded:h.timeOfImpact,unloaded:unloaded.distance,rendered:v.distance,reflected:reflected.distance,farPortals,distances,floorDestruction:{removedOwner:describe(floorTarget),beforeY:floorBefore.point.y,revealedY:revealed.point.y,terrainY:revealed.ground,renderDifference:revealed.difference},resets,scope:'논리 좌표에서 만든 물리 장면에 H를 한 번 적용한 뒤 실제 표면과 원거리 개구부, 파괴 구멍, 바닥 파괴 후 지형 노출, 복원 후 통과를 검사한다. 화면 캡처를 이용한 시각 검토는 아니다.'};
 });
}catch(e){results.push({name:'humanities passage full scene setup',status:'FAIL',message:e.message,details:e.details});console.log('FAIL '+e.message);}
finally{if(sim){sim.world.removeCharacterController(sim.controller);sim.world.free();}const matches=sourceStillMatches();fs.writeFileSync(output,JSON.stringify({...report,hashes,baselineHashes,sourceStillMatches:matches},null,2)+'\n');if(results.some(r=>r.status==='FAIL')||Object.values(matches).some(v=>!v))process.exitCode=1;}
