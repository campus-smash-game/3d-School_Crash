import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {registerHooks} from 'node:module';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hashes={};
const sourceRoot=pathToFileURL(path.join(root,'src')+path.sep).href;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=f=>{const bytes=fs.readFileSync(path.join(root,f));hashes[f]=sha(bytes);return bytes;};

// 생산 모듈을 메모리에서 변환한다. 공용 컴파일 캐시에는 쓰지 않는다.
registerHooks({
 resolve(specifier,context,next){
  if(context.parentURL?.startsWith(sourceRoot)&&specifier.startsWith('.')&&!path.extname(specifier))return {url:new URL(specifier+'.ts',context.parentURL).href,shortCircuit:true};
  return next(specifier,context);
 },
 load(url,context,next){
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
 const data=json('public/data/campus.json'),dem=json('public/data/terrain.json'),plan=json('public/data/campus-transit.json'),facilitiesPlan=json('public/data/transit-facilities.json');
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

const output=path.join(root,'artifacts/living-science-courtyard-test/results.json'),results=[];
fs.mkdirSync(path.dirname(output),{recursive:true});
const report={scope:'실제 전체 장면에서 원본 /524 북쪽 출구, /338과 /339를 따라 222 현관을 검사한다. 공식 사진의 공간을 근사한 모델의 보행과 충돌 검사이며, 안마당 내부 거리뷰 관측이나 실제 접근성 규격 검증은 아니다.',results,harnessSha256:sha(fs.readFileSync(new URL(import.meta.url)))};
const must=(condition,message,details)=>{if(!condition)throw Object.assign(new Error(message),{details});};
const check=(name,fn)=>{try{results.push({name,status:'PASS',...fn()});console.log('PASS '+name);}catch(e){results.push({name,status:'FAIL',message:e.message,details:e.details});console.log('FAIL '+name+' '+e.message);}};
const vec=p=>Array.isArray(p)?new THREE.Vector3(...p):new THREE.Vector3(p.x,p.y??0,p.z);
const H=p=>new THREE.Vector3(p.x,p.y,-p.z),up=new THREE.Vector3(0,1,0),down=up.clone().negate();
function offsetRoute(route,offset){
 return route.map((p,i)=>{const a=route[i].clone().sub(route[Math.max(0,i-1)]),b=route[Math.min(route.length-1,i+1)].clone().sub(route[i]);a.y=b.y=0;if(!a.lengthSq())a.copy(b);if(!b.lengthSq())b.copy(a);a.normalize();b.normalize();const n1=new THREE.Vector3(a.z,0,-a.x),n2=new THREE.Vector3(b.z,0,-b.x),n=n1.clone().add(n2).normalize();return p.clone().addScaledVector(n,offset/Math.max(.5,n.dot(n1)));});
}

let sim;
try{
 read('src/main.ts');
 const env=await buildWorld(),{world,terrain,data}=env,id='way/386890828',building=data.buildings.find(b=>b.id===id),shell=world.children.find(o=>o.userData.buildingId===id&&o.userData.role==='building-shell');
 must(shell?.userData.courtyard,'The courtyard is missing from the actual full campus.');
 const info=shell.userData.courtyard,passage=data.roads.find(r=>r.id==='way/1185265108/524'),north=data.roads.find(r=>r.id==='way/456922935/338'),branch=data.roads.find(r=>r.id==='way/456922938/339');
 must(passage&&north&&branch,'An original approach footway is missing.');
 const point=p=>new THREE.Vector3(p[0],0,p[1]),entry=vec(info.door.center),outward=vec(info.door.outward),tangent=vec(info.door.tangent),inside=vec(info.insideEnd),mapped=point(branch.points[0]);
 const route=[point(passage.points.at(-1)),point(north.points[1]),point(north.points[2]),mapped,entry,inside],near=route[0].clone().setY(terrain.heightAt(route[0].x,route[0].z)+2.2),far=near.clone().add(new THREE.Vector3(900,0,900));
 sim=env.makeSimulation(near);const moving=movementTools(sim),door=sim.targets.find(t=>t.mesh.userData.buildingId===id&&t.mesh.userData.component===info.door.component);
 must(door,'The mapped entrance has no destructible door.');
 const update=p=>{env.update(p);world.updateMatrixWorld(true);};update(near);
 const meshes=[];world.traverse(m=>{if(m.isMesh&&!m.isInstancedMesh)meshes.push(m);});
 const visible=m=>{for(let p=m;p;p=p.parent)if(!p.visible)return false;return true;};
 const visual=(origin,direction,max)=>new THREE.Raycaster(world.scale.z<0?H(origin):origin,world.scale.z<0?H(direction):direction,0,max).intersectObjects(meshes.filter(visible),false);
 const owner=c=>{const body=c.parent();return body?sim.targets.find(t=>t.body?.handle===body.handle):null;};
 const cast=(origin,direction,max)=>sim.world.castRay(new R.Ray(origin,direction),max,true,R.QueryFilterFlags.EXCLUDE_DYNAMIC,undefined,sim.playerCollider,sim.player);
 const focus=p=>{sim.setFocus(p,true);sim.world.step();};
 const reset=()=>{world.scale.z=1;sim.reset();update(near);};
 // Rapier가 사용하는 Float32 좌표와 같은 위치에서 렌더 광선을 비교한다.
 const floor=p=>{const q=new THREE.Vector3(Math.fround(p.x),0,Math.fround(p.z)),ground=terrain.meshHeightAt(q.x,q.z),origin=q.clone().setY(Math.fround(Math.max(ground,entry.y)+1.15));focus(origin);const physical=cast(origin,down,2.5),shown=visual(origin,down,2.5)[0];must(physical&&shown,'An approach point has no rendered and physical floor.',{point:p.toArray(),ground});return{point:q.setY(origin.y-physical.timeOfImpact),renderedY:shown.point.y,ground,component:owner(physical.collider)?.mesh.userData.component??null,renderMesh:shown.object.name,physical,shown};};
 const settle=p=>{const q=floor(p).point;sim.teleport(q.clone().addScaledVector(up,1.75));for(let i=0;i<60;i++)sim.step(1/60,0,0,false);must(!moving.contacts().length,'The route starts inside a fixed surface.',{point:p.toArray(),contacts:moving.contacts()});};
 const verify=w=>{must(w.reached,'The mapped courtyard route is blocked.',w);must(w.maxPenetration<.025,'The walking capsule penetrates a fixed surface.',w);for(const s of w.segments)must(!s.penetrations.length,'A route endpoint remains inside a solid.',s);};
 report.rawRoads=[passage,north,branch];report.geometry={targets:sim.targets.length,buildingParts:sim.targets.filter(t=>t.mesh.userData.buildingId===id).length,roads:data.roads.length};

 check('raw entrance node reaches the actual door and three complete six metre per second return paths',()=>{
  const xml=read('sources/campus.osm').toString('utf8'),node=xml.match(/<node\b[^>]*\bid="4531517992"[^>]*>[\s\S]*?<\/node>/)?.[0];
  must(node?.includes('k="entrance" v="yes"')&&node.includes('k="wheelchair" v="yes"'),'The mapped entry evidence is absent.');
  assert.deepEqual(branch.nodeIds[0],'4531517992');assert.deepEqual(branch.points[0],building.points[4]);assert.deepEqual(shell.userData.mappedOutline,building.points.slice(0,-1));
  const delta=entry.clone().sub(mapped),along=delta.dot(tangent),recess=-delta.dot(outward);
  must(Math.abs(along)<.04&&recess>.5&&recess<1.5,'The door is displaced along the facade from the original entrance node.',{along,recess,entry:entry.toArray(),mapped:mapped.toArray()});
  const details=[];
  for(const offset of[-.8,0,.8]){reset();const points=offsetRoute(route,offset);settle(points[0]);const closed=moving.walk(points.slice(1));must(!closed.reached,'The intact door does not stop the capsule.',closed);const blocker=closed.segments.at(-1);must(blocker.blockers.some(b=>b.component===info.door.component),'The original route is blocked before reaching the actual door.',closed);const stop=vec(sim.player.translation()).sub(entry);must(stop.dot(outward)>.1&&stop.dot(outward)<.9,'The closed door stops the player outside its intended threshold.',closed);sim.hit(door,100,outward.clone().negate());update(near);const opened=moving.walk([points.at(-1)]);verify(opened);const returned=moving.walk(points.slice(0,-1).reverse());verify(returned);details.push({offset,closed,opened,returned});}
  return{sourceNode:'4531517992',alongFacadeError:along,recess,route:route.map(p=>p.toArray()),speed:6,teleportOnlyAtInitialStart:true,details};
 });

 check('real courtyard floors and branch width clear terrain with matching collision surfaces',()=>{
  reset();sim.hit(door,100,outward.clone().negate());update(near);
  const floors=sim.targets.filter(t=>t.mesh.userData.buildingId===id&&info.surfaceComponents.includes(t.mesh.userData.component));
  let triangleSamples=0,exposedSamples=0,coveredSamples=0,precisionCheckedCoveredSamples=0,approximateCoveredSamples=0,maxSurfaceDifference=0,minTerrainClearance=Infinity,maximumCoveredSurfaceDifference=0,minimumCoveredRenderHeight=Infinity;const covered=[],failures=[];
  for(const target of floors){target.mesh.updateMatrixWorld(true);const p=target.mesh.geometry.getAttribute('position');
   for(let i=0;i<p.count;i+=3){const v=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,i+k).applyMatrix4(target.mesh.matrixWorld)),normal=v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0]));if(normal.y<=1e-8)continue;triangleSamples++;
    for(const weights of[[1/3,1/3,1/3],[.6,.2,.2],[.2,.6,.2],[.2,.2,.6]]){const q=v[0].clone().multiplyScalar(weights[0]).addScaledVector(v[1],weights[1]).addScaledVector(v[2],weights[2]),origin=q.clone().addScaledVector(up,.55);focus(origin);const hit=cast(origin,down,.8),shown=visual(origin,down,.8)[0],t=hit&&owner(hit.collider),ground=terrain.meshHeightAt(q.x,q.z);minTerrainClearance=Math.min(minTerrainClearance,q.y-ground);
     if(t&&!info.surfaceComponents.includes(t.mesh.userData.component)){
      // 충돌체만 바닥을 가리는 오류를 제외하지 않도록, 구조물 위에서 실제 상면도 대조한다.
      const outside=q.clone().setY(t.box.max.y+.3);focus(outside);const upperHit=cast(outside,down,outside.y-q.y+.2),upperShown=visual(outside,down,outside.y-q.y+.2)[0],upperTarget=upperHit&&owner(upperHit.collider),upperDifference=upperHit&&upperShown?Math.abs(upperHit.timeOfImpact-upperShown.distance):Infinity;
      // 안내판은 기울어진 판과 기둥을 합친 볼록체다. 그 외피 차이는 보행 바닥과 분리한다.
      const precisionChecked=t.mesh.userData.component!=='courtyard-unreadable-information-stand',renderHeight=(upperShown?.point.y??-Infinity)-q.y;
      if(precisionChecked)precisionCheckedCoveredSamples++;else approximateCoveredSamples++;
      maximumCoveredSurfaceDifference=Math.max(maximumCoveredSurfaceDifference,upperDifference);minimumCoveredRenderHeight=Math.min(minimumCoveredRenderHeight,renderHeight);
      if(!upperHit||!upperShown||upperTarget!==t||renderHeight<.15||precisionChecked&&upperDifference>.025)failures.push({covered:true,point:q.toArray(),floor:target.mesh.userData.component,above:t.mesh.userData.component,upperComponent:upperTarget?.mesh.userData.component,render:upperShown?.object.name,renderHeight,upperDifference,precisionChecked});
      coveredSamples++;covered.push({point:q.toArray(),floor:target.mesh.userData.component,above:t.mesh.userData.component,physicalDistance:hit.timeOfImpact,upperComponent:upperTarget?.mesh.userData.component,renderHeight,upperDifference,precisionChecked,...(!precisionChecked?{limitation:'기울어진 안내판과 기둥의 통합 볼록체는 정확한 판 표면을 재현하지 않는다. 렌더 존재와 충돌 소유자만 확인하며 정밀표면 통과로 집계하지 않는다.'}:{})});continue;
     }
     const difference=hit&&shown?Math.abs(hit.timeOfImpact-shown.distance):Infinity;maxSurfaceDifference=Math.max(maxSurfaceDifference,difference);exposedSamples++;
     if(!hit||!shown||!t||difference>.025||q.y-ground<.015)failures.push({point:q.toArray(),component:target.mesh.userData.component,physical:t?.mesh.userData.component??null,render:shown?.object.name??null,difference,groundClearance:q.y-ground});
    }
   }
  }
  const routeSamples=[];let minimumHeadroom=Infinity;
  for(let k=1;k<route.length;k++){const a=route[k-1],b=route[k],d=b.clone().sub(a).setY(0),length=d.length(),side=new THREE.Vector3(d.z,0,-d.x).normalize(),steps=Math.ceil(length/.25);for(let j=0;j<=steps;j++)for(const offset of[-.8,0,.8]){const q=a.clone().lerp(b,j/steps).addScaledVector(side,offset),f=floor(q),origin=f.point.clone().addScaledVector(up,.08),head=cast(origin,up,2.2);if(head)minimumHeadroom=Math.min(minimumHeadroom,head.timeOfImpact+.08);const difference=Math.abs(f.point.y-f.renderedY);if(difference>.025||f.point.y-f.ground<-.005||head&&head.timeOfImpact<1.8)failures.push({routeSegment:k,offset,point:f.point.toArray(),difference,groundClearance:f.point.y-f.ground,headroom:head?.timeOfImpact,component:f.component});routeSamples.push({segment:k,offset,point:f.point.toArray(),physicalComponent:f.component,renderMesh:f.renderMesh,renderDifference:difference,terrainClearance:f.point.y-f.ground});}}
  // 원본 /338와 /339의 분기점은 중심선 사이의 폭도 조사한다.
  const junction=point(north.points[2]),junctionSamples=[];
  for(let s=-1;s<=1.001;s+=.2)for(let n=-1;n<=1.001;n+=.2){const q=junction.clone().addScaledVector(tangent,s).addScaledVector(outward,n),f=floor(q),difference=Math.abs(f.point.y-f.renderedY);if(difference>.025||f.point.y-f.ground<.015||!info.surfaceComponents.includes(f.component))failures.push({junction:true,point:q.toArray(),difference,component:f.component,terrainClearance:f.point.y-f.ground});junctionSamples.push({s,n,y:f.point.y,component:f.component});}
  const passageDirection=point(passage.points.at(-1)).sub(point(passage.points[0])).normalize(),passageSide=new THREE.Vector3(passageDirection.z,0,-passageDirection.x),seamSamples=[];
  for(let offset=-1.8;offset<=1.8001;offset+=.2){const sides=[-.001,.001].map(distance=>{const f=floor(route[0].clone().addScaledVector(passageDirection,distance).addScaledVector(passageSide,offset));return{distance,offset,point:f.point.toArray(),component:f.component,difference:Math.abs(f.point.y-f.renderedY)};});const step=Math.abs(sides[0].point[1]-sides[1].point[1]);if(step>.035||sides.some(f=>f.difference>.025))failures.push({seam:true,sides,step});seamSamples.push({offset,sides,step});}
  must(triangleSamples>100&&exposedSamples>400,'The floor audit missed most of the new courtyard.');
  must(!failures.length,'Actual paving, terrain, or branch-width clearance does not match the physical floor.',{count:failures.length,triangleSamples,exposedSamples,coveredSamples,maxSurfaceDifference,minTerrainClearance,minimumHeadroom,failures:failures.slice(0,30)});
  return{triangleSamples,exposedSamples,coveredSamples,precisionCheckedCoveredSamples,approximateCoveredSamples,coveredExamples:covered,maximumCoveredSurfaceDifference,minimumCoveredRenderHeight,maxSurfaceDifference,minTerrainClearance,minimumHeadroom:Number.isFinite(minimumHeadroom)?minimumHeadroom:null,routeSamples,junctionSamples,seamSamples,scope:'화단이나 문틀 바로 밑의 바닥은 실제 상부 렌더와 동일 부품의 충돌을 확인해 별도로 기록한다. 안내판 통합 볼록체의 외피 차이는 한계로 남기며 정밀표면 통과로 집계하지 않는다. Rapier와 렌더 광선은 같은 Float32 위치에서 비교한다.'};
 });

 check('entry and courtyard surfaces preserve H reflection distant damage holes and two resets',()=>{
  reset();const own=[];shell.traverse(o=>{if(o.isMesh)own.push(o);});const original=own.map(m=>m.geometry.attributes.position.array.slice());
  const ray={origin:entry.clone().addScaledVector(outward,.7).addScaledVector(tangent,-1.1).addScaledVector(up,1.25),direction:outward.clone().negate(),max:1.2};focus(ray.origin);const hit=cast(ray.origin,ray.direction,ray.max),shown=visual(ray.origin,ray.direction,ray.max)[0];must(hit&&shown&&owner(hit.collider)===door,'The actual door is masked by residual facade geometry.');must(Math.abs(hit.timeOfImpact-shown.distance)<.08,'The door collider is too far from the rendered glass.');sim.setFocus(far,true);const remote=sim.castUnloadedTargets(ray.origin,ray.direction,ray.max);must(remote?.target===door&&Math.abs(remote.distance-hit.timeOfImpact)<.002,'The unloaded door differs from its loaded surface.');
  const wall=sim.targets.find(t=>t.mesh.userData.buildingId===id&&t.mesh.userData.component==='courtyard-curved-brick-planter');must(wall,'The observed low planter has no collision.');let wallRay;
  const wp=wall.mesh.geometry.attributes.position;
  for(let i=0;i<wp.count;i+=3){const v=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(wp,i+k).applyMatrix4(wall.mesh.matrixWorld)),normal=v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])).normalize();if(Math.abs(normal.y)>.1)continue;const c=v[0].add(v[1]).add(v[2]).multiplyScalar(1/3);if(c.y<terrain.heightAt(c.x,c.z)+.2)continue;const origin=c.clone().addScaledVector(normal,.5),direction=normal.clone().negate();focus(origin);const h=cast(origin,direction,.8),r=visual(origin,direction,.8)[0];if(h&&owner(h.collider)===wall&&r){wallRay={origin,direction,max:.8};break;}}
  must(wallRay,'The planter has no exposed side face to inspect.');focus(wallRay.origin);const wh=cast(wallRay.origin,wallRay.direction,wallRay.max),ws=visual(wallRay.origin,wallRay.direction,wallRay.max)[0];must(wh&&ws&&owner(wh.collider)===wall,'The representative planter surface is missing.');must(Math.abs(wh.timeOfImpact-ws.distance)<.025,'The thin planter collision differs from the rendered face.');
  world.scale.z=-1;update(near);for(const [r,expected]of[[ray,shown.distance],[wallRay,ws.distance]]){const h=visual(r.origin,r.direction,r.max)[0];must(h&&Math.abs(h.distance-expected)<.001,'One H changes the actual courtyard surface.');}
  sim.hit(door,100,ray.direction);sim.hit(wall,100,wallRay.direction);update(near);
  for(const distance of[279,281,900]){const away=near.clone().add(new THREE.Vector3(distance,0,distance));sim.setFocus(away,true);update(away);for(const [r,limit]of[[ray,hit.timeOfImpact+.025],[wallRay,wh.timeOfImpact+.025]]){must(!sim.castUnloadedTargets(r.origin,r.direction,limit),'Destroyed courtyard collision returns at distance.',{distance});must(!visual(r.origin,r.direction,limit).length,'Destroyed courtyard rendering returns at distance.',{distance});}const f=floor(route[2]);must(info.surfaceComponents.includes(f.component),'An intact courtyard floor disappears at distance.');}
  settle(route[0]);const forward=moving.walk(route.slice(1));verify(forward);const backward=moving.walk(route.slice(0,-1).reverse());verify(backward);
  for(let cycle=0;cycle<2;cycle++){sim.reset();update(near);for(let i=0;i<own.length;i++)assert.deepEqual(own[i].geometry.attributes.position.array,original[i],'Reset does not restore actual merged geometry.');sim.setFocus(far,true);must(sim.castUnloadedTargets(ray.origin,ray.direction,ray.max)?.target===door,'Reset does not restore door collision.');must(sim.castUnloadedTargets(wallRay.origin,wallRay.direction,wallRay.max)?.target===wall,'Reset does not restore planter collision.');if(cycle===0){sim.hit(door,100,ray.direction);sim.hit(wall,100,wallRay.direction);update(near);}}
  return{door:{rendered:shown.distance,physical:hit.timeOfImpact,unloaded:remote.distance},planter:{rendered:ws.distance,physical:wh.timeOfImpact},reflectedReturn:{forward,backward},resetCycles:2};
 });
}catch(e){results.push({name:'full scene and courtyard registration',status:'FAIL',message:e.message,details:e.details});console.log('FAIL '+e.message);}
finally{
 if(sim){sim.world.removeCharacterController(sim.controller);sim.world.free();}
 const matches=sourceStillMatches();fs.writeFileSync(output,JSON.stringify({...report,hashes,sourceStillMatches:matches},null,2)+'\n');
 if(results.some(r=>r.status==='FAIL')||Object.values(matches).some(v=>!v))process.exitCode=1;
}

