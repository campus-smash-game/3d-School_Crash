import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), out = path.join(root, 'artifacts/living-science-test');
await mkdir(out, { recursive: true }); const hashes = {};
for (const filename of (await readdir(path.join(root, 'src'))).filter(n => n.endsWith('.ts'))) {
  const source = await readFile(path.join(root, 'src', filename), 'utf8'); hashes[filename] = createHash('sha256').update(source).digest('hex');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  await writeFile(path.join(out, filename.replace(/\.ts$/, '.mjs')), js.replace(/from (['"])(\.\/[\w-]+)\1/g, "from '$2.mjs'"));
}
const { createLivingScienceLandmark } = await import(pathToFileURL(path.join(out, 'livingScienceLandmark.mjs')));
const { createTerrain } = await import(pathToFileURL(path.join(out, 'terrain.mjs')));
const { getBuildingAppearance } = await import(pathToFileURL(path.join(out, 'buildingAppearance.mjs')));
const { Simulation } = await import(pathToFileURL(path.join(out, 'physics.mjs')));
const { dataToRenderPoint: H } = await import(pathToFileURL(path.join(out, 'coordinates.mjs')));
await RAPIER.init();
const data = JSON.parse(await readFile(path.join(root, 'public/data/campus.json'), 'utf8')), dem = JSON.parse(await readFile(path.join(root, 'public/data/terrain.json'), 'utf8'));
const building = data.buildings.find(b => b.id === 'way/386890828'), originalData = JSON.stringify({ building, dem });
const scene = new THREE.Scene(), terrain = createTerrain(scene, dem, data.buildings), profile = getBuildingAppearance(building), model = createLivingScienceLandmark(scene, building, profile, terrain.heightAt);
const shell = scene.children.find(o => o.userData.role === 'building-shell'), info = shell.userData, meshes = shell.children.filter(o => o.isMesh), original = meshes.map(m => m.geometry.attributes.position.array.slice());
const base=info.localOrigin.y,axis=new THREE.Vector3(info.axis.x,0,info.axis.z),front=new THREE.Vector3(-axis.z,0,axis.x),up=new THREE.Vector3(0,1,0);
const point=(x,y,z)=>new THREE.Vector3(info.localOrigin.x,base+y,info.localOrigin.z).addScaledVector(axis,x).addScaledVector(front,z);
const local=p=>{const q=p.clone().sub(point(0,0,0));return[q.dot(axis),q.y,q.dot(front)];};
const near=point(30,2,30),far=new THREE.Vector3(100000,500,100000),sim=new Simulation(model.breakables,[],near,data.bounds,terrain),results=[];
function check(name,fn){try{const details=fn();results.push({name,status:'passed',...details});console.log(`PASS ${name} ${JSON.stringify(details)}`);}catch(error){results.push({name,status:'failed',message:error.message});throw error;}}
function cast(p,d,distance){const lookup=new Map(sim.targets.filter(t=>t.body).map(t=>[t.body.handle,t]));const hit=sim.world.castRay(new RAPIER.Ray(p,d),distance,true,undefined,undefined,undefined,undefined,c=>lookup.has(c.parent()?.handle));return hit?{object:lookup.get(hit.collider.parent().handle).mesh,distance:hit.timeOfImpact}:null;}
function visual(p,d,distance){scene.updateMatrixWorld(true);return new THREE.Raycaster(p,d,0,distance).intersectObjects(meshes,false)[0]??null;}
function reset(){sim.reset();sim.setFocus(near,true);sim.world.step();model.update(near);}
function count(){if(!shell.visible)return 0;let n=0;for(const m of meshes){const p=m.geometry.attributes.position;for(let i=0;i<p.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(p,i),b=new THREE.Vector3().fromBufferAttribute(p,i+1),c=new THREE.Vector3().fromBufferAttribute(p,i+2);if(b.sub(a).cross(c.sub(a)).lengthSq()>1e-12)n++;}}return n;}
function inside(x,z){let yes=false;const ring=building.points;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
const initialCount=count();
try{
 reset();
 check('original eleven point footprint and DEM remain unchanged with documented seven floor use',()=>{
  // 약 3m 간격의 포장 삼각기둥이 추가돼 부품 예산만 넓힌다. 기존 삼각형과 병합 메시 예산은 유지한다.
  assert.equal(JSON.stringify({building,dem}),originalData);assert.deepEqual(info.mappedOutline,building.points.slice(0,-1));assert.equal(info.mappedOutline.length,11);assert.deepEqual(info.levels,{aboveGround:7,belowGround:2});assert.equal(info.heightEstimated,true);assert.equal(info.wingLevelPlacementEstimated,true);assert.equal(info.classroomInteriorModeled,false);assert.equal(info.basementInteriorModeled,false);assert.equal(info.mainRoofHeight,24.5);assert.equal(meshes.length,3);assert.ok(sim.targets.length<1150&&initialCount<40000);
  return{parts:sim.targets.length,triangles:initialCount,meshes:meshes.length,base,heightEstimated:info.mainRoofHeight,documentedFloorUse:7};
 });
 check('mapped roof covers the L footprint and leaves its exterior concavity empty',()=>{
  const roofs=sim.targets.filter(t=>t.mesh.userData.component==='mapped-roof-panel');assert.ok(roofs.length>30&&roofs.every(t=>t.collisionVertices));let covered=0,empty=0;
  for(let x=-2.3;x<49;x+=2.2)for(let z=-2.3;z<62;z+=2.2){const p=point(x,40,z),expected=inside(p.x,p.z),hit=new THREE.Raycaster(p,up.clone().negate(),0,40).intersectObjects(roofs.map(t=>t.mesh),false)[0];assert.equal(!!hit,expected,`roof ${x},${z}`);expected?covered++:empty++;}
  let concave=0;for(const x of [28,35,42])for(const z of [27,38,50]){const p=point(x,5,z);sim.setFocus(p,true);sim.world.step();assert.equal(cast(p,up,35),null);assert.equal(visual(p,up,35),null);concave++;}return{coveredSamples:covered,emptySamples:empty,concavitySamples:concave,convexRoofParts:roofs.length};
 });
 check('all glazing triangle samples clear the actual terrain mesh',()=>{
  const p=meshes.find(m=>m.name.endsWith('glazing')).geometry.attributes.position;let min=Infinity,samples=0;
  for(let i=0;i<p.count;i+=3){const tri=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,i+k));for(let a=0;a<=6;a++)for(let b=0;b<=6-a;b++){const v=tri[0].clone().multiplyScalar(1-(a+b)/6).addScaledVector(tri[1],a/6).addScaledVector(tri[2],b/6);min=Math.min(min,v.y-terrain.meshHeightAt(v.x,v.z));samples++;}}
  assert.ok(min>.04,`glass terrain clearance ${min}`);return{triangleSamples:samples,minimumClearance:min};
 });
 check('brick narrow top windows and gray ribbon windows are exposed with exterior frames',()=>{
  const picks=[sim.targets.find(t=>t.mesh.userData.component==='upper-narrow-window'),sim.targets.find(t=>t.mesh.userData.component==='ribbon-window'&&t.mesh.userData.edge===3&&t.mesh.userData.level===3),sim.targets.find(t=>t.mesh.userData.component==='ribbon-window'&&t.mesh.userData.edge===8&&t.mesh.userData.level===3)];let maxError=0;
  for(const t of picks){assert.ok(t);const n=new THREE.Vector3().fromArray(t.mesh.userData.surfaceNormal),c=new THREE.Vector3().fromArray(t.mesh.userData.windowCenter),p=c.clone().addScaledVector(n,.8),hit=visual(p,n.clone().negate(),1);assert.ok(hit);assert.ok(hit.distance>.70&&hit.distance<.81);sim.setFocus(p,true);sim.world.step();const loaded=cast(p,n.clone().negate(),1);assert.equal(loaded?.object,t.mesh);maxError=Math.max(maxError,Math.abs(loaded.distance-hit.distance));}
  assert.ok(maxError<.08);return{mandatoryVisibleWindowTypes:picks.length,maximumProxyEnvelopeAllowance:maxError};
 });
 check('all three raised canopies have open space between independent posts',()=>{
  let empty=0,roofHits=0;for(const c of info.canopies){const z=(c.minZ+c.maxZ)/2,p=point(c.minX-1,info.mainRoofHeight+1,z),d=axis.clone();sim.setFocus(p,true);sim.world.step();assert.equal(cast(p,d,c.maxX-c.minX+2),null);assert.equal(visual(p,d,c.maxX-c.minX+2),null);empty++;const centre=point((c.minX+c.maxX)/2,info.mainRoofHeight+1,z),hit=cast(centre,up,3),render=visual(centre,up,3);assert.ok(hit&&render&&Math.abs(hit.distance-render.distance)<.02);roofHits++;sim.setFocus(far,true);sim.world.step();assert.equal(sim.castUnloadedTargets(p,d,c.maxX-c.minX+2),null);assert.ok(sim.castUnloadedTargets(centre,up,3));}
  reset();return{canopies:info.canopies.length,openHorizontalPaths:empty,undersideRays:roofHits};
 });
 check('balanced bay proxies stay within eight centimetres of exterior and interior surfaces',()=>{
  reset();const picks=[sim.targets.find(t=>t.mesh.userData.numberLabel==='222'),sim.targets.find(t=>t.mesh.userData.component==='ribbon-window'&&t.mesh.userData.edge===3&&t.mesh.userData.level===3)],samples=[];
  for(const target of picks){assert.ok(target);const n=new THREE.Vector3().fromArray(target.mesh.userData.surfaceNormal),plane=new THREE.Vector3().fromArray(target.mesh.userData.surfacePlane),tangent=new THREE.Vector3(1,0,0).applyQuaternion(target.mesh.quaternion),center=target.mesh.position;
   const cases=[{name:'glass exterior',mesh:'glazing',depth:-.065,side:1},{name:'glass interior',mesh:'glazing',depth:-.065,side:-1},{name:'wall exterior',mesh:'brick-and-gray-envelope',depth:.03,side:1},{name:'wall interior',mesh:'brick-and-gray-envelope',depth:-.19,side:-1},{name:'floor band exterior',mesh:'roof-and-frames',depth:.065,side:1},...(target.mesh.userData.numberLabel?[{name:'number exterior',mesh:'roof-and-frames',depth:.075,side:1}]:[])];
   for(const test of cases){const mesh=meshes.find(m=>m.name.endsWith(test.mesh)),a=mesh.geometry.attributes.position;let found=false;
    for(let i=0;i<a.count;i+=3){const vertices=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(a,i+k)),cross=vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0]));if(cross.lengthSq()<1e-12||Math.abs(cross.normalize().dot(n))<.999)continue;const c=vertices[0].add(vertices[1]).add(vertices[2]).multiplyScalar(1/3),delta=c.clone().sub(center);if(Math.abs(delta.dot(tangent))>target.size.x/2-.025||Math.abs(delta.y)>target.size.y/2-.015||Math.abs(c.clone().sub(plane).dot(n)-test.depth)>.0001)continue;
     const p=c.clone().addScaledVector(n,.4*test.side),d=n.clone().multiplyScalar(-test.side),render=visual(p,d,.7);if(!render||Math.abs(render.distance-.4)>.001)continue;
     sim.setFocus(p,true);sim.world.step();const hit=cast(p,d,.7);assert.ok(hit?.object===target.mesh,`wrong target at ${test.name}`);const error=Math.abs(render.distance-hit.distance);assert.ok(error<.08,`${test.name} error ${error}`);sim.setFocus(far,true);sim.world.step();const unloaded=sim.castUnloadedTargets(p,d,.7);assert.ok(unloaded?.object===target.mesh&&Math.abs(unloaded.distance-hit.distance)<.001);samples.push({surface:test.name,edge:target.mesh.userData.edge,level:target.mesh.userData.level,renderDistance:render.distance,loadedDistance:hit.distance,error});found=true;break;
    }
    assert.ok(found,`no exposed real triangle for ${test.name}`);
   }
  }
  reset();return{actualTriangleRays:samples.length,maximumSurfaceDifference:Math.max(...samples.map(s=>s.error)),samples};
 });
 check('actual terrain supports approach and door destruction opens the recessed entry',()=>{
  const e=info.entry,door=sim.targets.find(t=>t.mesh.userData.component==='recessed-entry-door'),paths=[];
  const walk=(x,z,dir,frames)=>{const spawn=point(x,0,z);spawn.y=terrain.heightAt(spawn.x,spawn.z)+1.7;sim.teleport(spawn);for(let i=0;i<30;i++)sim.step(1/60,0,0,false);for(let i=0;i<frames;i++)sim.step(1/60,axis.x*dir*6,axis.z*dir*6,false);return local(new THREE.Vector3().copy(sim.player.translation()));};
  for(const dz of [-1.6,0,1.6]){reset();const closed=walk(e.approachX+1,e.z+dz,-1,180);assert.ok(closed[0]>e.x&&closed[0]<e.x+.7,`closed ${JSON.stringify({dz,closed})}`);sim.hit(door,100,axis.clone().negate());model.update(near);const open=walk(e.approachX+1,e.z+dz,-1,105);assert.ok(open[0]<e.x-2,`open ${JSON.stringify({dz,open})}`);for(let i=0;i<120;i++)sim.step(1/60,axis.x*6,axis.z*6,false);const back=local(new THREE.Vector3().copy(sim.player.translation()));assert.ok(back[0]>e.approachX+.3,`return ${JSON.stringify({dz,back})}`);paths.push({offset:dz,closed,open,returned:back});}
  reset();return{speed:6,paths,entryFloor:e.floor};
 });
 check('external concavity permits capsule walking without a building-sized hidden collider',()=>{
  const start=point(32,0,25),floor=visual(start.clone().setY(base+8),up.clone().negate(),12);assert.ok(floor,'courtyard floor missing');start.y=Math.max(terrain.heightAt(start.x,start.z),floor.point.y)+1.7;sim.teleport(start);for(let i=0;i<30;i++)sim.step(1/60,0,0,false);const before=new THREE.Vector3().copy(sim.player.translation());for(let i=0;i<180;i++)sim.step(1/60,front.x*6,front.z*6,false);const after=new THREE.Vector3().copy(sim.player.translation()),progress=after.clone().sub(before).dot(front);assert.ok(progress>17.5,`concavity progress ${progress}`);return{speed:6,requestedDistance:18,actualProgress:progress,grounded:sim.grounded,spawnSurface:'actual courtyard top'};
 });
 check('mandatory wall glass roof canopy and ramp rays agree when loaded and unloaded',()=>{
  reset();const rays=[];
  for(const component of ['upper-narrow-window','ribbon-window','recessed-entry-door','mapped-roof-panel','floating-canopy-panel','entry-ground-connection']){
   const group=sim.targets.filter(t=>t.mesh.userData.component===component);assert.ok(group.length);const chosen=group.filter((_,i)=>i===0||i===Math.floor(group.length/2)||i===group.length-1);
   for(const target of chosen){let p,d;if(target.mesh.userData.windowCenter){d=new THREE.Vector3().fromArray(target.mesh.userData.surfaceNormal).negate();p=new THREE.Vector3().fromArray(target.mesh.userData.windowCenter).addScaledVector(d,-.8);}else if(component==='recessed-entry-door'){d=axis.clone().negate();p=point(info.entry.x+.8,info.entry.floor+1.2,info.entry.z+.4);}else{const g=target.mesh.geometry.attributes.position;let bestArea=0,surface;for(let i=0;i<g.count;i+=3){const q=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(g,i+k).applyMatrix4(target.mesh.matrixWorld)),cross=q[1].clone().sub(q[0]).cross(q[2].clone().sub(q[0]));if(cross.y>0&&cross.length()>bestArea){bestArea=cross.length();surface=q[0].add(q[1]).add(q[2]).multiplyScalar(1/3);}}assert.ok(surface,component);d=up.clone().negate();p=surface.addScaledVector(up,.6);}
    sim.setFocus(p,true);sim.world.step();const hit=cast(p,d,1),render=visual(p,d,1);assert.equal(hit?.object,target.mesh,component);assert.ok(render,component);assert.ok(Math.abs(hit.distance-render.distance)<.08,component);rays.push({p,d,target,distance:hit.distance});}
  }
  sim.setFocus(far,true);sim.world.step();let maxError=0;for(const r of rays){const hit=sim.castUnloadedTargets(r.p,r.d,1);assert.equal(hit?.object,r.target.mesh,r.target.mesh.userData.component);maxError=Math.max(maxError,Math.abs(hit.distance-r.distance));}assert.ok(maxError<.025);reset();return{mandatoryRays:rays.length,components:6,maximumLoadedUnloadedDifference:maxError};
 });
 check('window holes and canopy damage persist across distance thresholds and four resets',()=>{
  const window=sim.targets.find(t=>t.mesh.userData.component==='ribbon-window'&&t.mesh.userData.edge===3&&t.mesh.userData.level===3),canopy=sim.targets.find(t=>t.mesh.userData.component==='floating-canopy-panel'),n=new THREE.Vector3().fromArray(window.mesh.userData.surfaceNormal),c=new THREE.Vector3().fromArray(window.mesh.userData.windowCenter),p=c.clone().addScaledVector(n,.8),d=n.clone().negate(),initialBodies=sim.world.bodies.len();
  for(let k=0;k<4;k++){sim.hit(window,100,d);sim.hit(canopy,100,up);model.update(near);const remaining=count();assert.ok(remaining<initialCount&&remaining>0);sim.setFocus(p,true);sim.world.step();assert.equal(cast(p,d,1),null,'destroyed glass retains collision');assert.equal(visual(p,d,1),null,'destroyed glass retains visual');for(const distance of [279,281,900]){const q=near.clone().addScaledVector(axis,distance);sim.setFocus(q,true);model.update(q);assert.equal(count(),remaining);assert.equal(sim.castUnloadedTargets(p,d,1),null);}reset();assert.equal(sim.world.bodies.len(),initialBodies);meshes.forEach((m,i)=>assert.deepEqual(m.geometry.attributes.position.array,original[i]));}
  sim.explode(point(22,12,28),160,100,up);model.update(near);assert.equal(count(),0);model.update(far);assert.equal(shell.visible,false);reset();assert.equal(count(),initialCount);return{resetCycles:4,distances:[279,281,900],initialBodies,restoredParts:sim.targets.length,restoredTriangles:initialCount};
 });
 check('geometric 222 remains exposed and non mirrored after the single world reflection',()=>{
  const label=info.numberLabel,n=new THREE.Vector3().fromArray(label.outward),r=new THREE.Vector3().fromArray(label.right),centres=label.glyphCenters.map(p=>new THREE.Vector3().fromArray(p));assert.equal(label.segmentCenters.length,15);const geometricRight=H(n.clone().negate()).cross(up).normalize();assert.ok(H(centres[1]).sub(H(centres[0])).dot(geometricRight)>.9);
  for(const q of label.segmentCenters){const p=new THREE.Vector3().fromArray(q).addScaledVector(n,.3),hit=visual(p,n.clone().negate(),.4);assert.ok(hit?.object.name.endsWith('roof-and-frames')&&Math.abs(hit.distance-.3)<.001);}
  scene.scale.z=-1;scene.updateMatrixWorld(true);for(const aspect of [390/844,844/390]){const camera=new THREE.PerspectiveCamera(60,aspect,.1,1000),eye=H(centres[1].clone().addScaledVector(n,15));camera.position.copy(eye);camera.lookAt(H(centres[1]));camera.updateMatrixWorld(true);const projected=centres.map(p=>H(p).project(camera));assert.ok(projected[0].x<projected[1].x&&projected[1].x<projected[2].x);for(let digit=0;digit<3;digit++){const topRight=H(new THREE.Vector3().fromArray(label.segmentCenters[digit*5+1])).project(camera),bottomLeft=H(new THREE.Vector3().fromArray(label.segmentCenters[digit*5+3])).project(camera);assert.ok(topRight.x>bottomLeft.x&&topRight.y>bottomLeft.y,'actual 2 stems are mirrored');}}
  for(const q of label.segmentCenters){const p=H(new THREE.Vector3().fromArray(q).addScaledVector(n,.3)),hit=new THREE.Raycaster(p,H(n.clone().negate()),0,.4).intersectObjects(meshes,false)[0];assert.ok(hit&&Math.abs(hit.distance-.3)<.001);}const logical=point(info.entry.x+.8,info.entry.floor+1.2,info.entry.z+.4),direction=axis.clone().negate();sim.setFocus(logical,true);sim.world.step();const hit=cast(logical,direction,1);sim.setFocus(far,true);assert.ok(sim.castUnloadedTargets(logical,direction,1)?.object===hit?.object,"reflected logical entry target mismatch");scene.scale.z=1;scene.updateMatrixWorld(true);reset();const labelPart=sim.targets.find(t=>t.mesh.userData.numberLabel==='222');sim.hit(labelPart,100,n);model.update(near);{const h=visual(new THREE.Vector3().fromArray(label.segmentCenters[0]).addScaledVector(n,.3),n.clone().negate(),.4);assert.ok(!h||h.distance>.35,"number segment remains at its former surface after wall destruction "+JSON.stringify({hp:labelPart.hp,name:h?.object.name,distance:h?.distance}))};reset();return{text:'222',exposedSegments:15,cameraAspects:[390/844,844/390],attachedToDestructibleWall:true,logicalQueriesUnaffected:true};
 });
 check('callback elevation offset and reversed source winding preserve the same model contract',()=>{
  const liftedScene=new THREE.Scene();createLivingScienceLandmark(liftedScene,building,profile,(x,z)=>terrain.heightAt(x,z)+50);const lifted=liftedScene.children.find(o=>o.userData.role==='building-shell');for(let m=0;m<meshes.length;m++){const p=lifted.children[m].geometry.attributes.position.array;assert.equal(p.length,original[m].length);for(let i=0;i<p.length;i+=3){assert.ok(Math.abs(p[i]-original[m][i])<.001&&Math.abs(p[i+2]-original[m][i+2])<.001);assert.ok(Math.abs(p[i+1]-original[m][i+1]-50)<.001);}}
  const reverseScene=new THREE.Scene();createLivingScienceLandmark(reverseScene,{...building,points:building.points.slice().reverse()},profile,terrain.heightAt);const reversed=reverseScene.children.find(o=>o.userData.role==='building-shell');for(let m=0;m<meshes.length;m++)assert.deepEqual(reversed.children[m].geometry.attributes.position.array,original[m]);assert.equal(JSON.stringify({building,dem}),originalData);return{elevationOffset:50,reversedWindingIdentical:true,sourceDataUnchanged:true};
 });
 check('the source entrance and broad courtyard have terrain-clear paving with shared tactile ownership',()=>{
  reset();const court=info.courtyard;assert.equal(court.entryNode,'4531517992');assert.deepEqual(court.sourceEntryWorld,building.points[4]);assert.equal(court.entrySign.text,'생활과학대학');assert.equal(sim.targets.filter(t=>t.mesh.userData.component==='courtyard-tactile-strip').length,0);
  const mesh=meshes.find(m=>m.name.endsWith('roof-and-frames')),p=mesh.geometry.attributes.position,c=mesh.geometry.attributes.color,tint=new THREE.Color(0xac795b);let samples=0,triangles=0,minimumClearance=Infinity,maximumSurfaceDifference=0;
  for(let i=0;i<p.count;i+=3){if(Math.abs(c.getX(i)-tint.r)>.00001||Math.abs(c.getY(i)-tint.g)>.00001)continue;const v=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,i+k));triangles++;
   for(let a=0;a<=10;a++)for(let b=0;b<=10-a;b++){const q=v[0].clone().multiplyScalar(1-(a+b)/10).addScaledVector(v[1],a/10).addScaledVector(v[2],b/10);minimumClearance=Math.min(minimumClearance,q.y-terrain.meshHeightAt(q.x,q.z));samples++;}
   const q=v[0].clone().add(v[1]).add(v[2]).multiplyScalar(1/3).addScaledVector(up,.04);sim.setFocus(q,true);sim.world.step();const physical=cast(q,up.clone().negate(),.1),render=visual(q,up.clone().negate(),.1);assert.ok(physical&&render,'courtyard top missing');assert.ok(court.surfaceComponents.includes(physical.object.userData.component),'courtyard collider is not a paving part');maximumSurfaceDifference=Math.max(maximumSurfaceDifference,Math.abs(physical.distance-render.distance));
  }
  assert.equal(triangles,court.pavingTriangles);assert.ok(samples>10000);assert.ok(minimumClearance>.05);assert.ok(maximumSurfaceDifference<.025);
  const tactileColors=[[new THREE.Color(0xc2a044),.012],[new THREE.Color(0xe1bf5f),.014]];let tactileTriangleRays=0,tactileMaximumOffsetError=0;
  for(let i=0;i<p.count;i+=3){const match=tactileColors.find(([color])=>Math.abs(c.getX(i)-color.r)<.00001&&Math.abs(c.getY(i)-color.g)<.00001);if(!match)continue;const v=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,i+k));if(v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])).lengthSq()<1e-10)continue;const q=v[0].add(v[1]).add(v[2]).multiplyScalar(1/3).addScaledVector(up,.04);sim.setFocus(q,true);sim.world.step();const hit=cast(q,up.clone().negate(),.1);assert.ok(hit&&court.surfaceComponents.includes(hit.object.userData.component),'tactile marking has no underlying paving');tactileMaximumOffsetError=Math.max(tactileMaximumOffsetError,Math.abs(hit.distance-.04-match[1]));tactileTriangleRays++;}
  assert.ok(tactileTriangleRays>50);assert.ok(tactileMaximumOffsetError<.001,'tactile marking floats across a floor crease');
  const header=sim.targets.find(t=>t.mesh.userData.component===court.entrySign.parentComponent),sign=shell.children.find(o=>o.name==='living-science-entry-name');sim.hit(header,100,axis);model.update(near);assert.equal(sign.visible,false);reset();assert.equal(sign.visible,true);return{triangles,samples,minimumClearance,maximumSurfaceDifference,tactileTriangleRays,tactileMaximumOffsetError,tactileUsesFloorParts:true,entrySignSharesHeaderDestruction:true};
 });
 check('mapped passage is open beneath a real beam with terrain-clear paving and exact convex surfaces',()=>{
  reset(); const p=info.passage,direction=new THREE.Vector3().fromArray(p.direction),side=new THREE.Vector3().fromArray(p.side),start=new THREE.Vector3().fromArray(p.start),raySamples=[];assert.equal(p.roadId,'way/1185265108/524');assert.equal(p.openWithoutDestruction,true);assert.equal(p.widthEstimated,true);assert.equal(p.northernApproachMaterialEstimated,true);
  const mapped=data.roads.find(r=>r.id===p.roadId);assert.deepEqual([p.start[0],p.start[2]],mapped.points[0]);assert.deepEqual([p.end[0],p.end[2]],mapped.points[1]);
  let minimumTerrainClearance=Infinity,minimumHeadroom=Infinity,maxSurfaceError=0,maxUnloadedError=0;
  for(let s=3.05;s<p.length-.05;s+=.45)for(const n of [-1.75,-.8,0,.8,1.75]){
   const q=start.clone().addScaledVector(direction,s).addScaledVector(side,n).setY(p.ceilingWorldY-.25),render=visual(q,up.clone().negate(),8);assert.ok(render&&render.distance<5,'floor is missing');const floor=render.point.y,terrainClearance=floor-terrain.meshHeightAt(q.x,q.z);minimumTerrainClearance=Math.min(minimumTerrainClearance,terrainClearance);assert.ok(terrainClearance>.015,`paving enters terrain ${s},${n}: ${terrainClearance}`);
   sim.setFocus(q,true);sim.world.step();const hit=cast(q,up.clone().negate(),8);assert.ok(hit&&hit.object.userData.component.startsWith('passage-'));maxSurfaceError=Math.max(maxSurfaceError,Math.abs(hit.distance-render.distance));
   const open=q.clone().setY(floor+1.7),roof=visual(open,up,5),roofPhysics=cast(open,up,5);if(s>=p.intersections[0].s+.2&&s<=p.intersections[1].s-.2){assert.ok(roof&&roofPhysics);minimumHeadroom=Math.min(minimumHeadroom,roof.point.y-floor);maxSurfaceError=Math.max(maxSurfaceError,Math.abs(roof.distance-roofPhysics.distance));assert.ok(roof.point.y-floor>2.8);}
   raySamples.push({q,d:up.clone().negate(),distance:hit.distance,component:hit.object.userData.component});
  }
  const empty=start.clone().addScaledVector(direction,1.7).setY(Math.max(...p.floorEnds)+1.4);sim.setFocus(empty,true);sim.world.step();assert.equal(visual(empty,direction,p.length-2),null);assert.equal(cast(empty,direction,p.length-2),null);
  sim.setFocus(far,true);sim.world.step();for(const r of raySamples){const hit=sim.castUnloadedTargets(r.q,r.d,8);assert.ok(hit&&hit.object.userData.component===r.component);maxUnloadedError=Math.max(maxUnloadedError,Math.abs(hit.distance-r.distance));}assert.ok(maxSurfaceError<.006);assert.ok(maxUnloadedError<.006);reset();return{floorRays:raySamples.length,minimumTerrainClearance,minimumHeadroom,maxSurfaceError,maxUnloadedError,rawCenterlinePreserved:true};
 });
 check('the unobstructed passage supports five actual terrain capsule routes in both directions',()=>{
  reset();const p=info.passage,direction=new THREE.Vector3().fromArray(p.direction),side=new THREE.Vector3().fromArray(p.side),start=new THREE.Vector3().fromArray(p.start),routes=[];
  for(const offset of [-1.35,-.65,0,.65,1.35]){
   const spawn=start.clone().addScaledVector(side,offset);spawn.y=terrain.heightAt(spawn.x,spawn.z)+1.7;sim.teleport(spawn);for(let i=0;i<30;i++)sim.step(1/60,0,0,false);const origin=new THREE.Vector3().copy(sim.player.translation());let minHeightError=Infinity,maxHeightError=-Infinity;
   const advance=(sign,frames)=>{for(let i=0;i<frames;i++){sim.step(1/60,direction.x*6*sign,direction.z*6*sign,false);const pos=new THREE.Vector3().copy(sim.player.translation()),s=pos.clone().sub(start).dot(direction);if(s>p.mainFloorRange[0]+.2&&s<p.mainFloorRange[1]-.2){const expected=THREE.MathUtils.lerp(p.floorEnds[0],p.floorEnds[1],(s-p.mainFloorRange[0])/(p.mainFloorRange[1]-p.mainFloorRange[0])),error=pos.y-.85-expected;minHeightError=Math.min(minHeightError,error);maxHeightError=Math.max(maxHeightError,error);assert.ok(error>-.035&&error<.12,`wrong walking level ${offset} ${error}`);}}};
   advance(1,280);const forward=new THREE.Vector3().copy(sim.player.translation()),progress=forward.clone().sub(origin).dot(direction);assert.ok(progress>p.length+1,`blocked ${offset}: ${progress}`);advance(-1,280);const back=new THREE.Vector3().copy(sim.player.translation()),returnError=back.distanceTo(origin);assert.ok(returnError<.35,`return ${offset}: ${returnError}`);routes.push({offset,progress,returnError,minHeightError,maxHeightError,grounded:sim.grounded});
  }
  reset();return{speed:6,routes,doorsRequired:false};
 });
 check('passage floor beam and facilities retain surface detail through destruction distance reset and H',()=>{
  reset();const components=['passage-red-paving','passage-overhead-beam','passage-left-wall','passage-right-column','passage-low-brick-planter','passage-exterior-rail-post','passage-exterior-rail-bar','passage-convex-mirror','passage-poster-panel'],targets=components.map(c=>{const t=sim.targets.find(t=>t.mesh.userData.component===c);assert.ok(t?.collisionVertices,c);return t;});
  const detail=meshes.find(m=>m.name.endsWith('roof-and-frames')),uv=detail.geometry.attributes.uv.array.slice(),map=detail.material.map;assert.ok(map?.isDataTexture);assert.equal(map,meshes.find(m=>m.name.endsWith('brick-and-gray-envelope')).material.map);const uniqueUV=new Set(uv);assert.ok(uniqueUV.size>10&&Math.max(...uniqueUV)-Math.min(...uniqueUV)>10,'paving has no repeated UV detail');
  for(const t of targets)sim.hit(t,100,up);model.update(near);const damaged=count();assert.ok(damaged<initialCount);for(const distance of [279,281,900]){const q=near.clone().addScaledVector(axis,distance);sim.setFocus(q,true);model.update(q);assert.equal(count(),damaged);}reset();meshes.forEach((m,i)=>assert.deepEqual(m.geometry.attributes.position.array,original[i]));assert.deepEqual(detail.geometry.attributes.uv.array,uv);
  const p=info.passage,start=new THREE.Vector3().fromArray(p.start),direction=new THREE.Vector3().fromArray(p.direction),eye=start.clone().addScaledVector(direction,12).setY(Math.max(...p.floorEnds)+1.4),logical=visual(eye,up.clone().negate(),3);scene.scale.z=-1;scene.updateMatrixWorld(true);const reflected=new THREE.Raycaster(H(eye),up.clone().negate(),0,3).intersectObjects(meshes,false)[0];assert.ok(logical&&reflected&&Math.abs(logical.distance-reflected.distance)<.0001);scene.scale.z=1;scene.updateMatrixWorld(true);reset();return{components:components.length,mergedMeshes:meshes.length,sharedProceduralTexture:true,resetGeometryIdentical:true,reflectedFloorDifference:Math.abs(logical.distance-reflected.distance)};
 });
 console.log(`Living science checks ${results.length}/${results.length} passed. Geometry and Rapier only; no browser, GPU or physical-phone verification.`);
}finally{sim.world.removeCharacterController(sim.controller);sim.world.free();await writeFile(path.join(out,'results.json'),JSON.stringify({scope:'Actual model geometry and current DEM/Rapier only. Dimensions and wing-level placement are estimates. No field survey, browser rendering or phone performance verification.',hashes,results},null,2)+'\n');}
