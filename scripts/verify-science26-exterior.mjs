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
const BASELINE='656f4ebc6c6c9b450477b957d6e04aa873aa56e7';
const baselineRoot=pathToFileURL(path.join(root,'artifacts/science26-test/historical-src')+path.sep).href;
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
 options={science2527:false,...options};





 await R.init();
 const names=['terrain','scene','fullCampus','physics','transitFacilities','centralPlazaFacilities','administrationPlazaFacilities','informationCourtApproach','administrationPlazaGround','gyujanggakApproach'];
 const [terrainModule,gateModule,campusModule,physicsModule,transitModule,plazaModule,adminModule,informationModule,groundModule,gyujanggakModule]=await Promise.all(names.map(sourceModule));
 const json=f=>JSON.parse(read(f));
 const data=json('public/data/campus.json'),dem=json('public/data/terrain.json'),plan=json('public/data/campus-transit.json'),facilitiesPlan=json('public/data/transit-facilities.json');
 const originalRoads=data.roads.length;data.roads.push(...(plan.supplementalRoads??[]));
 const world=new THREE.Scene(),terrain=terrainModule.createTerrain(world,dem,data.buildings,options),gate=gateModule.createCampus(world,{full:true}),campus=campusModule.createFullCampus(world,data,terrain.heightAt,options);
 const facilities=[transitModule.createTransitFacilities(world,facilitiesPlan,terrain.heightAt),plazaModule.createCentralPlazaFacilities(world,terrain.heightAt),adminModule.createAdministrationPlazaFacilities(world,data,terrain.heightAt),informationModule.createInformationCourtApproach(world,terrain.heightAt),groundModule.createAdministrationPlazaGround(world,terrain.heightAt),gyujanggakModule.createGyujanggakApproach(world,terrain.heightAt)];
 world.updateMatrixWorld(true);
 return {world,terrain,data,dem,campus,facilities,originalRoads,makeSimulation(spawn){return new physicsModule.Simulation([...gate.breakables,...campus.breakables,...facilities.flatMap(f=>f.breakables)],[...gate.colliders,...campus.colliders],spawn,data.bounds,terrain);},update(point){campus.update(point);for(const f of facilities)f.update(point);}};
}

function sourceStillMatches(){return Object.fromEntries(Object.entries(hashes).map(([f,h])=>[f,sha(fs.readFileSync(path.join(root,f)))===h]));}

function movementTools(sim){
 const describe=c=>{const body=c.parent(),target=body?sim.targets.find(t=>t.body?.handle===body.handle):undefined;return {collider:c.handle,buildingId:target?.mesh.userData.buildingId??null,connectionId:target?.mesh.userData.connectionId??null,component:target?.mesh.userData.component??null,label:target?.label??(body?'unmapped body':'terrain or static')};};
 const contacts=()=>{const shape=sim.playerCollider.shape,position=sim.player.translation(),rotation=sim.playerCollider.rotation(),found=[];sim.world.intersectionsWithShape(position,rotation,shape,c=>{const hit=c.contactShape(shape,position,rotation,.02);if(hit&&hit.distance<-.01)found.push({...describe(c),penetration:-hit.distance,point:hit.point1});return true;},R.QueryFilterFlags.EXCLUDE_DYNAMIC,undefined,sim.playerCollider,sim.player);return found;};
 const blockers=()=>Array.from({length:sim.controller.numComputedCollisions()},(_,i)=>sim.controller.computedCollision(i)).filter(c=>c?.collider).map(c=>({...describe(c.collider),normal:c.normal1,point:c.witness1}));
 function walk(route,requestedSpeed=6){const segments=[];let maxPenetration=0,worstContact=null;for(const dest of route){let stalled=0,frames=0,last=new THREE.Vector3().copy(sim.player.translation());for(;frames<1600;frames++){const p=sim.player.translation(),dx=dest.x-p.x,dz=dest.z-p.z,d=Math.hypot(dx,dz);if(d<.12)break;const speed=Math.min(requestedSpeed,d*60);sim.step(1/60,dx/d*speed,dz/d*speed,false);const q=new THREE.Vector3().copy(sim.player.translation());stalled=q.distanceTo(last)<.002?stalled+1:0;last=q;if(frames%10===0)for(const c of contacts())if(c.penetration>maxPenetration){maxPenetration=c.penetration;worstContact={...c,position:{...sim.player.translation()},frames};}if(stalled>120)break;}const p=sim.player.translation(),distance=Math.hypot(dest.x-p.x,dest.z-p.z);segments.push({dest,frames,end:{...p},distance,penetrations:contacts(),blockers:distance>.2?blockers():[]});if(distance>.2)break;}return {reached:segments.length===route.length&&segments.at(-1).distance<.2,maxPenetration,worstContact,segments};}
 return {contacts,blockers,walk};
}


const up=new THREE.Vector3(0,1,0),down=up.clone().negate();
function terrainTopology(env,q){
 const {terrain,data}=env,vertices=terrain.vertices,indices=terrain.indices,regions=[terrain.mesh.userData.science26Correction.bounds];
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
 must(patch.length>0,'The declared pharmacy143 terrain region has no actual triangles.');
 let maxHeightDifference=0,maxPhysicalDifference=0;const failures=[],physicalRows=[];
 let terrainHandle;sim.world.forEachCollider(c=>{if(c.shape.type===R.ShapeType.TriMesh&&!c.parent())terrainHandle=c.handle;});
 must(terrainHandle!==undefined,'The real terrain trimesh collider is missing.');
 for(let i=0;i<patch.length;i++){
  const {triangle,p}=patch[i],height=terrain.meshHeightAt(p.x,p.z),difference=Math.abs(height-p.y);maxHeightDifference=Math.max(maxHeightDifference,difference);if(difference>.0001)failures.push({triangle,p:p.toArray(),height,difference});
  if(i%Math.max(1,Math.floor(patch.length/160))!==0)continue;
  const from=new THREE.Vector3(...p.clone().addScaledVector(up,.7).toArray().map(Math.fround)),expected=terrain.meshHeightAt(from.x,from.z),hit=sim.world.castRay(new R.Ray(from,down),1.4,true,R.QueryFilterFlags.EXCLUDE_DYNAMIC,undefined,sim.playerCollider,sim.player,c=>c.handle===terrainHandle),physical=hit?Math.abs(from.y-hit.timeOfImpact-expected):Infinity;maxPhysicalDifference=Math.max(maxPhysicalDifference,physical);physicalRows.push({triangle,point:p.toArray(),rayOrigin:from.toArray(),expectedHeight:expected,difference:physical});if(physical>.005)failures.push({triangle,p:p.toArray(),physical});
 }
 must(!failures.length,'Terrain triangles, height queries and the real trimesh collider disagree.',{count:failures.length,examples:failures.slice(0,15)});
 return{triangles:indices.length/3,localTriangles:patch.length,interiorOpenEdges:0,invalidTriangles:0,maxHeightDifference,maxPhysicalDifference,physicalSamples:physicalRows.length,physicalTolerance:.005,scope:'최종 Float32 정점과 전체 인덱스의 내부 닫힘을 검사한다. 국소 삼각형 중심에서 실제 메시 평면과 높이 함수를 대조하고 약 160개 표본은 실제 Rapier 지형 충돌체와 직접 비교한다. Float32의 길고 좁은 삼각형에서 생기는 계산 오차를 고려해 물리 높이 허용치는 5mm로 정한다.'};
}


const output=path.join(root,'artifacts/science26-test/results.json');fs.mkdirSync(path.dirname(output),{recursive:true});const results=[];let sim;
const check=async(name,fn)=>{try{results.push({name,status:'PASS',...await fn()});console.log('PASS '+name);}catch(e){results.push({name,status:'FAIL',message:e.message,details:e.details});console.log('FAIL '+name+' '+e.message+' '+JSON.stringify(e.details));if(process.argv.includes('--fail-fast'))throw e;}};
const must=(ok,message,details)=>{if(!ok)throw Object.assign(new Error(message),{details});};
const env=await buildWorld(),shell=env.world.getObjectByName('landmark/science26-exterior'),q=shell.userData.science26Exterior;
try{
 sim=env.makeSimulation(new THREE.Vector3(...q.routes.basementEntry[0]).add(new THREE.Vector3(0,1.8,0)));const move=movementTools(sim);
 const settle=p=>{sim.teleport(new THREE.Vector3(...p).add(new THREE.Vector3(0,1.8,0)));for(let i=0;i<90;i++)sim.step(1/60,0,0,false);};
 const adjacent=env.world.getObjectByName('landmark/science23-exterior').userData.science23Exterior;
 for(const[name,route]of Object.entries({...q.routes,...Object.fromEntries(Object.entries(adjacent.routes).map(([n,r])=>['23/'+n,r]))}))await check(name+' at desktop and mobile speeds both directions',()=>{
  const runs=[];for(const speed of[6,8]){settle(route[0]);const forward=move.walk(route.slice(1).map(p=>new THREE.Vector3(...p)),speed);must(forward.reached&&forward.maxPenetration<.04,'Forward blocked',{speed,forward});let p=sim.player.translation();must(Math.abs(p.y-route.at(-1)[1]-.95)<.24,'Wrong arrival floor',{p,expected:route.at(-1)});const backward=move.walk(route.slice(0,-1).reverse().map(p=>new THREE.Vector3(...p)),speed);must(backward.reached&&backward.maxPenetration<.04,'Backward blocked',{speed,backward});p=sim.player.translation();must(Math.abs(p.y-route[0][1]-.95)<.24,'Wrong return floor',{p,expected:route[0]});runs.push({speed,forward,backward});}return{runs};
 });
 await check('terrain topology and collider height agree',()=>terrainTopology(env));
 // 식재 경사면 일부는 벽 아래에 묻힌다. 개별 충돌체를 확인하고, 화면 맨 앞의 면은 같은 건물의 맨 앞 충돌체와 비교한다.
 await check('walking surfaces agree with real colliders',()=>{
  const specs=env.campus.breakables.filter(t=>q.buildingIds.includes(t.mesh.userData.buildingId)&&/stair$|ramp$|landing$|paving$|approach$|garden-bank$|old-bridge-floor/.test(t.mesh.userData.component)),samples=[];
  for(const t of specs){const p=t.mesh.position.clone().add(new THREE.Vector3(0,t.size.y/2+.12,0));sim.setFocus(p,true);sim.world.step();env.world.updateMatrixWorld(true);const target=sim.targets.find(v=>v.mesh===t.mesh),own=new THREE.Raycaster(p,down,0,2).intersectObject(t.mesh,false)[0];if(!own)continue;const physical=target?.body?.collider(0)?.castRay(new R.Ray(p,down),2,true),visible=new THREE.Raycaster(p,down,0,2).intersectObject(shell,true)[0];const handles=new Set(sim.targets.filter(v=>q.buildingIds.includes(v.mesh.userData.buildingId)&&v.body).map(v=>v.body.handle));const front=sim.world.castRay(new R.Ray(p,down),2,false,R.QueryFilterFlags.EXCLUDE_DYNAMIC,undefined,sim.playerCollider,sim.player,c=>handles.has(c.parent()?.handle));must(physical!==undefined&&visible&&front&&Math.abs(physical-own.distance)<.008&&Math.abs(visible.distance-front.timeOfImpact)<.04,'Surface mismatch',{component:t.mesh.userData.component,p,physical,own:own.distance,visible:visible?.distance,front:front?.timeOfImpact,frontComponent:front?sim.targets.find(v=>v.body?.handle===front.collider.parent()?.handle)?.mesh.userData.component:null});samples.push(t.mesh.userData.component);}assert.equal(samples.length,specs.length);assert(samples.length>20);return{samples:samples.length,expected:specs.length};
 });
 await check('damage stays visible at distance and reset restores geometry',()=>{
  const hash=()=>shell.children.filter(o=>o.isMesh).map(o=>sha(Buffer.from(o.geometry.attributes.position.array.buffer))),before=hash(),far=new THREE.Vector3(2000,30,1500);
  for(const component of['ribbon-window','horizontal-panel-spandrel','floor-slab-0','basement-stair']){const t=sim.targets.find(t=>q.buildingIds.includes(t.mesh.userData.buildingId)&&t.mesh.userData.component===component);assert(t);sim.hit(t,100,new THREE.Vector3(0,0,1));env.update(far);assert(!t.mesh.visible);}assert(shell.visible);assert.notDeepEqual(hash(),before);sim.reset();env.update(far);assert.deepEqual(hash(),before);return{farVisible:true,resetExact:true};
 });
 await check('raw data and unrelated buildings match release73',async()=>{
  for(const file of['public/data/campus.json','public/data/terrain.json','public/data/campus-transit.json','sources/campus.osm'])assert.equal(sha(read(file)),sha(gitBytes(file)));
  const prior=JSON.parse(gitBytes('public/data/campus.json'));
  const [tm,cm]=await Promise.all(['terrain.ts','fullCampus.ts'].map(n=>import(new URL(n,baselineRoot)))),world=new THREE.Scene(),terrain=tm.createTerrain(world,env.dem,prior.buildings);prior.roads.push(...JSON.parse(read('public/data/campus-transit.json')).supplementalRoads);const campus=cm.createFullCampus(world,prior,terrain.heightAt);world.updateMatrixWorld(true);
  const signature=t=>{const a=Array.from(t.mesh.geometry.attributes.position.array,x=>Math.round(x*1e5)/1e5),vertices=[];for(let i=0;i<a.length;i+=3)vertices.push(a.slice(i,i+3).join(','));const shape=t.mesh.userData.convex?[...new Set(vertices)].sort():vertices;return JSON.stringify({data:t.mesh.userData,m:t.mesh.matrixWorld.elements,size:t.size.toArray(),positions:sha(shape.join('|'))},(_k,v)=>typeof v==='number'?Math.round(v*1e8)/1e8:v);};
  const outside=t=>!q.buildingIds.includes(t.mesh.userData.buildingId),before=campus.breakables.filter(outside).map(signature),after=env.campus.breakables.filter(outside).map(signature),beforeSet=new Set(before);must(after.length===before.length&&sha(after.join('\n'))===sha(before.join('\n')),'Unrelated part changed',{before:before.length,after:after.length,changed:after.filter(x=>!beforeSet.has(x)).slice(0,3)});
  let samples=0;const b=env.terrain.mesh.userData.science26Correction.bounds;for(let i=0;i<terrain.vertices.length;i+=3){const[x,,z]=terrain.vertices.slice(i,i+3);if(x>=b.minX&&x<=b.maxX&&z>=b.minZ&&z<=b.maxZ)continue;must(Math.abs(env.terrain.meshHeightAt(x,z)-terrain.meshHeightAt(x,z))<.0001,'Outside terrain changed',{x,z,before:terrain.meshHeightAt(x,z),after:env.terrain.meshHeightAt(x,z)});samples++;}
  return{unrelatedParts:before.length,rawInputsExact:true,outsideTerrainSamples:samples};
 });
 await check('geometry budget and evidence limits',()=>{assert(q.dimensionsEstimated&&q.footprintEstimated&&q.entrancePositionEstimated&&q.rearFacadeEstimated&&!q.wholeInteriorImplemented);assert(!q.entranceCoordinatesFromOsm&&q.rawOsmFootprintPreserved);assert.equal(q.aboveGroundFloors,5);assert.equal(q.basementFloors,1);assert.equal(q.reconstructionYear,2019);must(q.geometry.meshes<=3&&q.geometry.colliders<1200&&q.geometry.triangles<100000,'Geometry budget exceeded',q.geometry);return{geometry:q.geometry};});
}finally{if(sim){sim.world.removeCharacterController(sim.controller);sim.world.free();}const matches=sourceStillMatches();fs.writeFileSync(output,JSON.stringify({results,hashes,baselineHashes,sourceStillMatches:matches},null,2));if(results.some(r=>r.status==='FAIL')||Object.values(matches).some(v=>!v))process.exitCode=1;}
