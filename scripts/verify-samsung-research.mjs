import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import ts from 'typescript';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),output=path.join(root,'artifacts/samsung-research-test');
await fs.mkdir(output,{recursive:true});
for(const file of await fs.readdir(path.join(root,'src'))){
  if(!file.endsWith('.ts'))continue;
  const compiled=ts.transpileModule(await fs.readFile(path.join(root,'src',file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  await fs.writeFile(path.join(output,file.replace(/\.ts$/,'.mjs')),compiled.replace(/from (['"])(\.\/[\w-]+)\1/g,"from '$2.mjs'"));
}
const {createTerrain}=await import(pathToFileURL(path.join(output,'terrain.mjs')));
const {getBuildingAppearance}=await import(pathToFileURL(path.join(output,'buildingAppearance.mjs')));
const {createSamsungResearchLandmark}=await import(pathToFileURL(path.join(output,'samsungResearchLandmark.mjs')));
const {Simulation}=await import(pathToFileURL(path.join(output,'physics.mjs')));
await RAPIER.init();
const data=JSON.parse(await fs.readFile(path.join(root,'public/data/campus.json'),'utf8')),elevation=JSON.parse(await fs.readFile(path.join(root,'public/data/terrain.json'),'utf8'));
const building=data.buildings.find(b=>b.id==='way/700872151');assert.ok(building);
const scene=new THREE.Scene(),terrain=createTerrain(scene,elevation,data.buildings),profile=getBuildingAppearance(building);
const model=createSamsungResearchLandmark(scene,building,profile,terrain.heightAt);
const shell=scene.children.find(o=>o.userData.role==='building-shell'),meta=shell.userData,meshes=shell.children.filter(o=>o.isMesh),originals=meshes.map(m=>Float32Array.from(m.geometry.getAttribute('position').array));
const {x:ux,z:uz}=meta.axis,{x:cx,y:base,z:cz}=meta.localOrigin,{length,depth}=meta.dimensions;
const local=(x,y,z)=>new THREE.Vector3(cx+ux*x-uz*z,base+y,cz+uz*x+ux*z),along=new THREE.Vector3(ux,0,uz),across=new THREE.Vector3(-uz,0,ux);
const near=local(length/2,2,depth+15),far=new THREE.Vector3(100000,300,100000);
const sim=new Simulation(model.breakables,[],local(length/2,80,depth/2),data.bounds,terrain),results=[];
const initialLoaded=sim.targets.map(t=>Boolean(t.body)),initialBodies=sim.world.bodies.len();
const check=(name,run)=>{const detail=run();results.push({name,status:'passed',...detail});console.log(`PASS ${name} ${JSON.stringify(detail??{})}`);};
const cast=(origin,direction,distance)=>{sim.setFocus(origin,true);sim.world.step();return sim.world.castRay(new RAPIER.Ray(origin,direction),distance,true,undefined,undefined,undefined,undefined,c=>sim.targets.some(t=>t.body&&t.body.handle===c.parent()?.handle));};
const triangles=()=>{if(!shell.visible)return 0;let count=0;for(const mesh of meshes){const p=mesh.geometry.getAttribute('position');for(let i=0;i<p.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(p,i),b=new THREE.Vector3().fromBufferAttribute(p,i+1),c=new THREE.Vector3().fromBufferAttribute(p,i+2);if(b.sub(a).cross(c.sub(a)).lengthSq()>1e-9)count++;}}return count;};
const rayFor=t=>{const n=new THREE.Vector3(0,1,0).applyQuaternion(t.mesh.quaternion);return{origin:t.mesh.position.clone().addScaledVector(n,2),direction:n.negate(),distance:2.7};};
const hit=ray=>cast(ray.origin,ray.direction,ray.distance);
function restoredCollision(){
  assert.equal(sim.world.bodies.len(),initialBodies);assert.deepEqual(sim.targets.map(t=>Boolean(t.body)),initialLoaded);
  assert.ok(sim.targets.every(t=>t.mesh.visible&&t.hp===t.toughness));
  for(const target of sim.targets){sim.setFocus(target.mesh.position,true);sim.world.step();assert.ok(target.body);const extents=target.body.collider(0).halfExtents();assert.ok(extents&&new THREE.Vector3().copy(extents).distanceTo(target.size.clone().multiplyScalar(.5))<.0001);}
  sim.setFocus(far,true);sim.setFocus(sim.spawn,true);sim.world.step();assert.deepEqual(sim.targets.map(t=>Boolean(t.body)),initialLoaded);
}
let originalTriangles,damagedRay,retainedRay,damaged,retained;
try{
  check('three merged meshes preserve the mapped footprint, two high masses and a low connection',()=>{
    assert.equal(meshes.length,3);assert.equal(meta.documentedAboveGroundFloors,10);assert.equal(meta.heightEstimated,true);
    assert.ok(model.breakables.every(t=>t.size.toArray().every(v=>Number.isFinite(v)&&v>0)));
    const worldPoints=meshes.flatMap(m=>{const p=m.geometry.getAttribute('position');return Array.from({length:p.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(p,i));});
    assert.ok(worldPoints.every(p=>p.toArray().every(Number.isFinite)));
    const xs=worldPoints.map(p=>(p.x-cx)*ux+(p.z-cz)*uz),zs=worldPoints.map(p=>-(p.x-cx)*uz+(p.z-cz)*ux);
    assert.ok(Math.min(...xs)>-1&&Math.max(...xs)<length+1);assert.ok(Math.min(...zs)>-1&&Math.max(...zs)<depth+2);
    const topAt=(x,z)=>{const ray=local(x,70,z),hit=cast(ray,new THREE.Vector3(0,-1,0),80);assert.ok(hit);return 70-hit.timeOfImpact;};
    const westTop=topAt(length*.17,4),connectorTop=topAt(length*.45,4),eastTop=topAt(length*.65,3);
    assert.ok(westTop>connectorTop+15&&eastTop>connectorTop+12);assert.ok(westTop>eastTop+3);
    assert.equal(cast(local(length*.93,65,3),new THREE.Vector3(0,-1,0),75),null,'empty mapped corner was filled');
    originalTriangles=triangles();return{length,depth,westTop,connectorTop,eastTop,meshes:meshes.length,parts:model.breakables.length,triangles:originalTriangles};
  });
  check('the connector gap and recessed front remain empty instead of using a giant collider',()=>{
    assert.equal(cast(local(length*.45,22,depth+5),across.clone().negate(),depth+10),null,'upper gap was filled by a box');
    assert.equal(cast(local(length*.13,18,12),along,10),null,'tower interior was filled by a box');
    assert.ok(meta.recesses.length>0);const r=meta.recesses[0],origin=local((r.x0+r.x1)/2,(r.y0+r.y1)/2,r.frontZ+1);
    assert.equal(cast(origin,across.clone().negate(),2),null,'recess has a phantom wall at the original facade');
    const recessed=cast(origin,across.clone().negate(),5);assert.ok(recessed&&recessed.timeOfImpact>2.5);
    return{recesses:meta.recesses.length,recessHitDistance:recessed.timeOfImpact};
  });
  check('raised roof panels slope above the roof on separate columns',()=>{
    const c=meta.canopies[0],heights=[];
    for(const z of [c.z-c.depth*.28,c.z+c.depth*.28]){const h=cast(local(c.x,60,z),new THREE.Vector3(0,-1,0),35);assert.ok(h);heights.push(60-h.timeOfImpact);}
    assert.ok(heights[1]>heights[0]+1);
    const roofTop=meta.masses.find(m=>m.name==='east-tower').top;
    assert.ok(Math.min(...heights)>roofTop+1.5);
    assert.equal(cast(local(c.x,c.centreHeight-1.4,c.z-3),across,6),null,'space under the canopy is blocked');
    const columns=sim.targets.filter(t=>t.mesh.userData.component==='canopy-column');assert.equal(columns.length,8);
    const column=columns[0];assert.ok(cast(column.mesh.position.clone().addScaledVector(along,1),along.clone().negate(),2));
    for(const target of sim.targets.filter(t=>t.mesh.userData.component.endsWith('-foundation'))){const p=target.mesh.position;assert.ok(p.y-target.size.y/2<=terrain.heightAt(p.x,p.z)+.1);}
    return{canopyHeights:heights,roofTop,columns:columns.length};
  });
  check('partial canopy destruction updates collision and distant unloaded projectile targets',()=>{
    const c=meta.canopies[0],point=local(c.x,c.centreHeight,c.z),panels=sim.targets.filter(t=>t.mesh.userData.component==='canopy-panel');
    damaged=panels.toSorted((a,b)=>a.mesh.position.distanceToSquared(point)-b.mesh.position.distanceToSquared(point))[0];
    const other=meta.canopies[1],otherPoint=local(other.x,other.centreHeight,other.z);
    retained=panels.toSorted((a,b)=>a.mesh.position.distanceToSquared(otherPoint)-b.mesh.position.distanceToSquared(otherPoint))[0];
    damagedRay=rayFor(damaged);retainedRay=rayFor(retained);assert.ok(hit(damagedRay)&&hit(retainedRay));
    sim.hit(damaged,damaged.toughness+1,damagedRay.direction);sim.world.step();model.update(near);
    assert.equal(damaged.body,null);assert.equal(hit(damagedRay),null);assert.ok(hit(retainedRay));
    const remaining=triangles();assert.ok(remaining>0&&remaining<originalTriangles);
    sim.setFocus(far,true);model.update(far);assert.equal(triangles(),remaining);
    assert.equal(sim.castUnloadedTargets(damagedRay.origin,damagedRay.direction,damagedRay.distance),null);
    assert.equal(sim.castUnloadedTargets(retainedRay.origin,retainedRay.direction,retainedRay.distance)?.object,retained.mesh);
    return{remainingTriangles:remaining,farDistance:far.distanceTo(near)};
  });
  check('reset and complete destruction restore exact geometry and loaded collision',()=>{
    sim.reset();model.update(near);restoredCollision();assert.ok(hit(damagedRay));
    meshes.forEach((m,i)=>assert.deepEqual(m.geometry.getAttribute('position').array,originals[i]));
    assert.equal(sim.explode(local(length/2,18,depth/2),180,100,new THREE.Vector3(0,1,0)),sim.targets.length);
    for(const player of [near,far,near]){model.update(player);assert.equal(triangles(),0);assert.equal(shell.visible,false);}
    sim.reset();model.update(far);assert.equal(triangles(),originalTriangles);assert.equal(sim.destroyed,0);assert.equal(sim.debris.length,0);
    restoredCollision();
    meshes.forEach((m,i)=>assert.deepEqual(m.geometry.getAttribute('position').array,originals[i]));assert.ok(hit(damagedRay));
    return{restoredParts:sim.targets.length,restoredTriangles:originalTriangles};
  });
  check('every model vertex follows the injected terrain elevation',()=>{
    const shifted=new THREE.Scene();createSamsungResearchLandmark(shifted,building,profile,(x,z)=>terrain.heightAt(x,z)+80);
    const children=shifted.children.find(o=>o.userData.role==='building-shell').children;
    for(let m=0;m<children.length;m++){const a=children[m].geometry.getAttribute('position').array,b=originals[m];assert.equal(a.length,b.length);for(let i=0;i<a.length;i+=3){assert.ok(Math.abs(a[i]-b[i])<.001&&Math.abs(a[i+2]-b[i+2])<.001);assert.ok(Math.abs(a[i+1]-b[i+1]-80)<.001);}}
    return{terrainOffset:80};
  });
  console.log(`Verified ${results.length} Samsung research landmark regressions.`);
}finally{
  sim.world.free();
  await fs.writeFile(path.join(output,'results.json'),JSON.stringify({verifiedAt:new Date().toISOString(),scope:'Actual model geometry and Rapier checks. No survey, full photographic reconstruction, WebGL frame or mobile hardware test.',tests:results},null,2));
}
