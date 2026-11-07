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
const BASELINE='6a08dd7d03cf6ce96f56aad05fa3364acc5621d3';
const baselineRoot=pathToFileURL(path.join(root,'artifacts/humanities-garden-access-test/historical-src')+path.sep).href;
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
 const campus=createFullCampus(scene,env.data,env.terrain.heightAt,{humanities250:false,humanities23:false,humanities4:false,humanities35:false,humanities8:false,humanities7:false,humanities6:false,humanities14Exterior:false,humanities1:false,humanities2:false,humanities35Exterior:false,education10Exterior:false,education11Exterior:false});
 const [tr,pl,ad,info,gr,gyu]=await Promise.all(['transitFacilities','centralPlazaFacilities','administrationPlazaFacilities','informationCourtApproach','administrationPlazaGround','gyujanggakApproach'].map(sourceModule));
 tr.createTransitFacilities(scene,JSON.parse(read('public/data/transit-facilities.json')),env.terrain.heightAt);pl.createCentralPlazaFacilities(scene,env.terrain.heightAt);ad.createAdministrationPlazaFacilities(scene,env.data,env.terrain.heightAt);info.createInformationCourtApproach(scene,env.terrain.heightAt);gr.createAdministrationPlazaGround(scene,env.terrain.heightAt);gyu.createGyujanggakApproach(scene,env.terrain.heightAt);
 scene.updateMatrixWorld(true);return {...campus,scene};
}
function sourceStillMatches(){return Object.fromEntries(Object.entries(hashes).map(([f,h])=>[f,sha(fs.readFileSync(path.join(root,f)))===h]));}

function movementTools(sim){
 const describe=c=>{const body=c.parent(),target=body?sim.targets.find(t=>t.body?.handle===body.handle):undefined;return {collider:c.handle,buildingId:target?.mesh.userData.buildingId??null,connectionId:target?.mesh.userData.connectionId??null,component:target?.mesh.userData.component??null,label:target?.label??(body?'unmapped body':'terrain or static')};};
 const contacts=()=>{const shape=sim.playerCollider.shape,position=sim.player.translation(),rotation=sim.playerCollider.rotation(),found=[];sim.world.intersectionsWithShape(position,rotation,shape,c=>{const hit=c.contactShape(shape,position,rotation,.02);if(hit&&hit.distance<-.01)found.push({...describe(c),penetration:-hit.distance,point:hit.point1});return true;},R.QueryFilterFlags.EXCLUDE_DYNAMIC,undefined,sim.playerCollider,sim.player);return found;};
 const blockers=()=>Array.from({length:sim.controller.numComputedCollisions()},(_,i)=>sim.controller.computedCollision(i)).filter(c=>c?.collider).map(c=>({...describe(c.collider),normal:c.normal1,point:c.witness1}));
 function walk(route,requestedSpeed=6){const segments=[];let maxPenetration=0;for(const dest of route){let stalled=0,frames=0,last=new THREE.Vector3().copy(sim.player.translation());for(;frames<1600;frames++){const p=sim.player.translation(),dx=dest.x-p.x,dz=dest.z-p.z,d=Math.hypot(dx,dz);if(d<.12)break;const speed=Math.min(requestedSpeed,d*60);sim.step(1/60,dx/d*speed,dz/d*speed,false);const q=new THREE.Vector3().copy(sim.player.translation());stalled=q.distanceTo(last)<.002?stalled+1:0;last=q;if(frames%10===0)for(const c of contacts())maxPenetration=Math.max(maxPenetration,c.penetration);if(stalled>120)break;}const p=sim.player.translation(),distance=Math.hypot(dest.x-p.x,dest.z-p.z);segments.push({dest,frames,end:{...p},distance,penetrations:contacts(),blockers:distance>.2?blockers():[]});if(distance>.2)break;}return {reached:segments.length===route.length&&segments.at(-1).distance<.2,maxPenetration,segments};}
 return {contacts,blockers,walk};
}

const output=path.join(root,'artifacts/humanities-garden-access-test/results.json'),results=[];
fs.mkdirSync(path.dirname(output),{recursive:true});
const report={scope:'사진 기반 아방궁 근사 동선과 시설을 전체 물리 장면에서 검사한다. 동선과 치수는 실측값이 아니다.',baselineCommit:BASELINE,results,harnessSha256:sha(fs.readFileSync(new URL(import.meta.url)))};
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
 if(current.groups.size!==old.groups.size) fs.writeFileSync(path.join(root,'artifacts/humanities-garden-access-test/changed-triangles.json'),JSON.stringify([...current.groups.entries()].filter(([k])=>!old.groups.has(k)).slice(0,40),null,2)); assert.equal(current.groups.size,old.groups.size,'Outside road XZ triangles or exact attributes changed.');
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
 const env=await buildWorld(),{world,terrain,data,campus}=env,connection='connection/humanities-garden',shell=world.getObjectByName(connection),access=shell?.userData.humanitiesGarden;must(access,'Garden metadata missing.');
 const route=access.route.map(p=>new THREE.Vector3(p[0],0,p[1])),near=new THREE.Vector3(399.5,40,-690.5),far=near.clone().add(new THREE.Vector3(900,0,900));sim=env.makeSimulation(near);const moving=movementTools(sim),meshes=collectMeshes(world),gardenMesh=world.getObjectByName('humanities-garden-surfaces');
 const update=p=>{env.update(p);world.updateMatrixWorld(true);},focus=p=>{sim.setFocus(p,true);sim.world.step();},owner=c=>c.parent()?sim.targets.find(t=>t.body&&t.body.handle===c.parent().handle):undefined;
 const cast=(p,d,max)=>sim.world.castRay(new R.Ray(p,d),max,true,R.QueryFilterFlags.EXCLUDE_DYNAMIC,undefined,sim.playerCollider,sim.player),render=(p,d,max)=>new THREE.Raycaster(world.scale.z<0?H(p):p,world.scale.z<0?H(d):d,0,max).intersectObjects(meshes.filter(visible),false);
 const floor=p=>{const q=new THREE.Vector3(Math.fround(p.x),0,Math.fround(p.z)),g=terrain.meshHeightAt(q.x,q.z),from=q.clone().setY(g+.8);focus(from);const h=cast(from,down,1.8),v=render(from,down,1.8)[0];must(h&&v&&h.timeOfImpact>.005,'Missing or obstructed floor.',{q:q.toArray(),ground:g,physical:h?.timeOfImpact,render:v?.object.name});return {point:q.setY(from.y-h.timeOfImpact),ground:g,owner:owner(h.collider),rendered:v,difference:Math.abs(h.timeOfImpact-v.distance)};};
 const reset=()=>{world.scale.z=1;sim.reset();update(near);};const settle=p=>{const f=floor(p);sim.teleport(f.point.clone().addScaledVector(up,1.75));for(let i=0;i<60;i++)sim.step(1/60,0,0,false);must(!moving.contacts().length,'Spawn overlaps fixed objects.',moving.contacts());};const verifyWalk=w=>must(w.reached&&w.maxPenetration<.025&&w.segments.every(s=>!s.penetrations.length),'Garden route is blocked or penetrates geometry.',w);
 update(near);report.geometry=access;
 await check('release44 preservation with the separately verified 250 and 2/3 additions disabled',async()=>{
  for(const f of['public/data/campus.json','public/data/terrain.json','public/data/campus-transit.json','sources/campus.osm'])assertCampusSourcePreserved(f,read(f),gitBytes(f));
  for(const f of['src/main.ts','src/physics.ts'])assert.equal(read(f).toString().replaceAll('\r\n','\n'),gitBytes(f).toString().replaceAll('\r\n','\n'));
  const [tm,cm]=await Promise.all(['terrain.ts','fullCampus.ts'].map(n=>import(new URL(n,baselineRoot))));const old=new THREE.Scene(),ot=tm.createTerrain(old,JSON.parse(read('public/data/terrain.json')),data.buildings),oc=cm.createFullCampus(old,data,ot.heightAt);oc.update(near);old.updateMatrixWorld(true);
  const [transit,plaza,admin,information,ground,gyujanggak]=await Promise.all(['transitFacilities.ts','centralPlazaFacilities.ts','administrationPlazaFacilities.ts','informationCourtApproach.ts','administrationPlazaGround.ts','gyujanggakApproach.ts'].map(n=>import(new URL(n,baselineRoot))));
  transit.createTransitFacilities(old,JSON.parse(read('public/data/transit-facilities.json')),ot.heightAt);plaza.createCentralPlazaFacilities(old,ot.heightAt);admin.createAdministrationPlazaFacilities(old,data,ot.heightAt);information.createInformationCourtApproach(old,ot.heightAt);ground.createAdministrationPlazaGround(old,ot.heightAt);gyujanggak.createGyujanggakApproach(old,ot.heightAt);old.updateMatrixWorld(true);
  const patch=terrain.mesh.userData.humanitiesGardenCorrection,q=patch.bounds,{humanitiesGardenLocal}=await sourceModule('humanitiesGardenSite');
  const changed={minX:q.minX-25,maxX:q.maxX+25,minZ:q.minZ-25,maxZ:q.maxZ+25};
  const outsideGeometry=compareOutsideRoadGeometry(ot.mesh.geometry,terrain.mesh.geometry,[changed]);
  let outsideSamples=0,flatSamples=0,maxOutsideDifference=0,maxFlatDifference=0;
  for(let x=q.minX-25;x<=q.maxX+25;x+=.8)for(let z=q.minZ-25;z<=q.maxZ+25;z+=.8){const p=humanitiesGardenLocal(x,z),actual=terrain.meshHeightAt(x,z);if(Math.abs(p.s)>=12.001||Math.abs(p.n)>=7.501){const diff=Math.abs(actual-ot.meshHeightAt(x,z));maxOutsideDifference=Math.max(maxOutsideDifference,diff);assert(diff<.0001,'Terrain height changed outside the declared garden: '+diff);outsideSamples++;}if(Math.abs(p.s)<7.9&&Math.abs(p.n)<2.9){maxFlatDifference=Math.max(maxFlatDifference,Math.abs(actual-patch.datumOffset));flatSamples++;}}
  assert(maxFlatDifference<.0001,'Pergola floor is not level.');
  const before250=await campusBeforeLaterHumanities(env); const actual=before250.breakables.filter(t=>t.mesh.userData.connectionId!==connection);assert.equal(actual.length,oc.breakables.length);actual.forEach((t,i)=>assert.equal(specSignature(t),specSignature(oc.breakables[i]),'Existing part '+i));
  assert.equal(geometryHash(old.getObjectByName('campus-road-surface').geometry),geometryHash(before250.scene.getObjectByName('campus-road-surface').geometry));
  const pedestrianBefore=old.getObjectByName('campus-pedestrian-surface').geometry,attr=pedestrianBefore.attributes.position,mask=access.maskedPolylineOverlay.bounds,regions=[mask];
  for(let i=0;i<attr.count;i+=3){const xs=[0,1,2].map(j=>attr.getX(i+j)),zs=[0,1,2].map(j=>attr.getZ(i+j)),r={minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs)};if(r.maxX>=mask.minX&&r.minX<=mask.maxX&&r.maxZ>=mask.minZ&&r.minZ<=mask.maxZ)regions.push(r);}
  const outsidePedestrian=compareOutsideRoadGeometry(pedestrianBefore,before250.scene.getObjectByName('campus-pedestrian-surface').geometry,regions);
  return{preservedParts:actual.length,outsideGeometry,outsideSamples,maxOutsideDifference,flatSamples,maxFlatDifference,outsidePedestrian,carRoadExact:true,rawInputsExact:true};
 });
 await check('garden walking at desktop and mobile speed with three lanes and both street approaches',()=>{
  const paths=[];
  for(const speed of[6,8])for(const offset of[-.5,0,.5])for(const direction of[1,-1]){
   const line=route.map((p,i)=>{const a=route[Math.max(0,i-1)],b=route[Math.min(route.length-1,i+1)],d=b.clone().sub(a).normalize();return p.clone().add(new THREE.Vector3(-d.z,0,d.x).multiplyScalar(offset));});if(direction<0)line.reverse();reset();settle(line[0]);const walk=moving.walk(line.slice(1),speed);verifyWalk(walk);paths.push({speed,offset,direction,walk});
  }
  const road=data.roads.find(r=>r.id==='way/167609412/31'),axis=vec([road.points[1][0]-road.points[0][0],0,road.points[1][1]-road.points[0][1]]).normalize(),joins=[];
  for(const i of[0,route.length-1])for(const sign of[-1,1]){reset();const onRoad=route[i].clone().addScaledVector(axis,sign*5),inside=route[i===0?1:route.length-2];settle(onRoad);const out=moving.walk([route[i],inside],8);verifyWalk(out);const back=moving.walk([route[i],onRoad],8);verifyWalk(back);joins.push({endpoint:i,sign,out,back});}
  return{paths,joins};
 });
 await check('stone paving has matching collision and pergola leaves a walkable central aisle',()=>{
  reset();const samples=[],roadOverlaps=[];
  for(let i=0;i<route.length-1;i++){const a=route[i],b=route[i+1],len=a.distanceTo(b),axis=b.clone().sub(a).normalize(),side=new THREE.Vector3(-axis.z,0,axis.x);for(let s=.5;s<len-.5;s+=1.15)for(const n of[-.5,0,.5]){const f=floor(a.clone().addScaledVector(axis,s).addScaledVector(side,n));if(f.rendered.object.name==='campus-road-surface'){must((i===0||i===route.length-2)&&f.difference<.25,'Road overlap exceeds the original road surface offset.',{i,s,n,difference:f.difference});roadOverlaps.push({i,s,n,difference:f.difference});continue;}must(f.owner?.mesh.userData.component==='garden-paving'&&f.difference<.025,'A paving probe hits wrong owner or differs from rendering.',{segment:i,s,n,component:f.owner?.mesh.userData.component,render:f.rendered.object.name,difference:f.difference});samples.push({i,s,n,difference:f.difference,clearance:f.point.y-f.ground});}}
  must(samples.length>100,'Too few garden floor probes.');
  const p=(u,v=0)=>new THREE.Vector3(399.5+.935*u+.355*v,0,-690.5-.355*u+.935*v),headroom=[];
  for(const u of[-6,-4,-2,0,2,4,6])for(const v of[-.5,0,.5]){const f=floor(p(u,v)),from=f.point.clone().addScaledVector(up,.1);focus(from);const hit=cast(from,up,2.35);must(!hit,'Pergola lacks player headroom.',{u,v,component:hit&&owner(hit.collider)?.mesh.userData.component});headroom.push({u,v,clearTo:2.45});}
  reset();settle(p(-6.5));const aisle=moving.walk([p(6.5)],8);verifyWalk(aisle);return{samples:samples.length,maxDifference:Math.max(...samples.map(p=>p.difference)),headroom,aisle,roadOverlaps,roadJoinRenderingLimit:'기존 차도 표시는 지형보다 높다. 광선이 실제 차도에 닿는 표본은 돌길 표시 검사와 구분하고 양쪽 접속의 왕복 보행을 별도로 확인한다.'};
 });
 await check('destruction removes attached stones and foliage and reset restores original colours',()=>{
  reset();const before=geometryHash(gardenMesh.geometry),point=new THREE.Vector3(388.4,0,-710.9),f=floor(point),target=f.owner;must(target?.mesh.userData.component==='garden-paving','No representative garden floor.');const from=f.point.clone().addScaledVector(up,.5);focus(from);const h=cast(from,down,1),v=render(from,down,1)[0];sim.setFocus(far,true);const unloaded=sim.castUnloadedTargets(from,down,1);must(unloaded?.target===target&&Math.abs(unloaded.distance-h.timeOfImpact)<.002,'Unloaded floor collision differs.');world.scale.z=-1;update(near);must(Math.abs(render(from,down,1)[0].distance-v.distance)<.001,'H changes garden surface.');sim.hit(target,100,down);update(near);const exposed=floor(point);must(!exposed.owner&&Math.abs(exposed.point.y-exposed.ground)<.002&&exposed.difference<.002,'Paving damage leaves hidden floor or stone pattern.',{owner:exposed.owner?.label,render:exposed.rendered.object.name,difference:exposed.difference});for(const distance of[279,281,900]){const eye=near.clone().add(new THREE.Vector3(distance,0,distance));sim.setFocus(eye,true);update(eye);must(render(from,down,1)[0]?.object===terrain.mesh,'Stone pattern returns at distance.');must(!sim.castUnloadedTargets(from,down,h.timeOfImpact+.005),'Destroyed floor collision returns.');}
  sim.reset();update(near);assert.equal(geometryHash(gardenMesh.geometry),before);
  const rows=[];for(const component of['pergola-brick-pier','garden-bench-seat','garden-tree']){const t=sim.targets.find(t=>t.mesh.userData.connectionId===connection&&t.mesh.userData.component===component);must(t,'Missing destructible detail '+component);const base=gardenMesh.geometry.attributes.position.array.slice();sim.hit(t,100,down);update(near);let changed=0;const a=gardenMesh.geometry.attributes.position.array;for(let i=0;i<a.length;i++)if(a[i]!==base[i])changed++;must(changed>36,'Attached detail is not removed.',{component,changed});update(far);sim.reset();update(near);assert.equal(geometryHash(gardenMesh.geometry),before);rows.push({component,changedCoordinates:changed});}
  sim.hit(target,1,down);sim.step(1/60,0,0,false);update(near);sim.reset();update(near);assert.equal(geometryHash(gardenMesh.geometry),before);settle(route[0]);const walk=moving.walk(route.slice(1),8);verifyWalk(walk);return{unloadedMatch:true,terrainRevealed:true,attachedDetails:rows,resetWalk:walk};
 });
}catch(e){results.push({name:'full scene setup',status:'FAIL',message:e.message,details:e.details});console.log('FAIL '+e.message);}
finally{if(sim){sim.world.removeCharacterController(sim.controller);sim.world.free();}const matches=sourceStillMatches();fs.writeFileSync(output,JSON.stringify({...report,hashes,baselineHashes,sourceStillMatches:matches},null,2)+'\n');if(results.some(r=>r.status==='FAIL')||Object.values(matches).some(v=>!v))process.exitCode=1;}
