import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'artifacts/construction-test');await fs.mkdir(out,{recursive:true});
const hashes={};for(const file of (await fs.readdir(path.join(root,'src'))).filter(p=>p.endsWith('.ts'))){const source=await fs.readFile(path.join(root,'src',file),'utf8');hashes[file]=createHash('sha256').update(source).digest('hex');const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;await fs.writeFile(path.join(out,file.replace(/\.ts$/,'.mjs')),js.replace(/from (['"])(\.\/[\w-]+)\1/g,"from '$2.mjs'"));}
const {createTerrain}=await import(pathToFileURL(path.join(out,'terrain.mjs'))),{createCampusConstruction,createConstructionGround}=await import(pathToFileURL(path.join(out,'campusConstruction.mjs'))),{Simulation}=await import(pathToFileURL(path.join(out,'physics.mjs'))),{createFullCampus}=await import(pathToFileURL(path.join(out,'fullCampus.mjs')));
await RAPIER.init();
const data=JSON.parse(await fs.readFile(path.join(root,'public/data/campus.json'),'utf8')),dem=JSON.parse(await fs.readFile(path.join(root,'public/data/terrain.json'),'utf8')),area=data.areas.find(a=>a.id==='way/1485386287'),sourceSnapshot=JSON.stringify({data,dem}),scene=new THREE.Scene(),terrain=createTerrain(scene,dem,data.buildings),geometrySnapshot=terrain.vertices.slice(),model=createCampusConstruction(scene,data.areas,terrain.heightAt),ground=createConstructionGround(scene,area),group=scene.children.find(o=>o.userData.role==='construction-fence'),far=new THREE.Vector3(100000,300,100000);
const piece=model.breakables.find(p=>p.mesh.userData.edge===8&&p.mesh.userData.panel===3),tangent=new THREE.Vector3(1,0,0).applyQuaternion(piece.mesh.quaternion),normal=new THREE.Vector3(0,0,1).applyQuaternion(piece.mesh.quaternion),at=piece.mesh.position.clone(),near=at.clone().addScaledVector(normal,5);near.y=terrain.heightAt(near.x,near.z)+1.8;
const sim=new Simulation(model.breakables,[],near,data.bounds,terrain),results=[];
function check(name,fn){const result=fn();results.push({name,status:'passed',...result});console.log(`PASS ${name} ${JSON.stringify(result)}`);}
function inside(x,z){let yes=false;for(let i=0,j=area.points.length-1;i<area.points.length;j=i++){const a=area.points[i],b=area.points[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
function reset(){sim.reset();model.update(near);}
function targetCast(p,d,max){const owners=new Map(sim.targets.filter(t=>t.body).map(t=>[t.body.handle,t]));const hit=sim.world.castRay(new RAPIER.Ray(p,d),max,true,undefined,undefined,undefined,undefined,c=>owners.has(c.parent()?.handle));return hit?{target:owners.get(hit.collider.parent().handle),distance:hit.timeOfImpact}:null;}
try{
check('construction outline, documented height zones and terrain foundations remain bounded',()=>{
  assert.deepEqual(group.userData.mappedOutline,area.points.slice(0,-1));assert.equal(group.children.length,3);assert.ok(model.breakables.length<140);
  const heights=[...new Set(model.breakables.map(b=>b.mesh.userData.plannedHeight))].sort((a,b)=>a-b);assert.deepEqual(heights,[4,8,10]);let maxAbove=-Infinity;
  for(const b of model.breakables){const p=b.mesh.position,bottom=p.y-b.size.y/2;for(const f of [-.5,-.25,0,.25,.5]){const q=p.clone().addScaledVector(new THREE.Vector3(1,0,0).applyQuaternion(b.mesh.quaternion),f*b.size.x);maxAbove=Math.max(maxAbove,bottom-terrain.meshHeightAt(q.x,q.z));}assert.ok(b.size.x<=4.001);}
  assert.ok(maxAbove<-.2);return{parts:model.breakables.length,renderMeshes:3,heightZones:heights,maximumFoundationAboveTerrain:maxAbove};
});
check('construction ground follows actual terrain triangles and does not change terrain or source data',()=>{
  assert.ok(ground.userData.terrainTriangleOverlay);const p=ground.geometry.attributes.position;let samples=0,maxError=0;
  for(let i=0;i<p.count;i+=3){const v=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(p,i+j));if(new THREE.Vector3().subVectors(v[1],v[0]).cross(new THREE.Vector3().subVectors(v[2],v[0])).lengthSq()<1e-10)continue;for(const w of [[1/3,1/3,1/3],[.6,.2,.2],[.2,.6,.2],[.2,.2,.6]]){const q=v[0].clone().multiplyScalar(w[0]).addScaledVector(v[1],w[1]).addScaledVector(v[2],w[2]);assert.ok(inside(q.x,q.z));maxError=Math.max(maxError,Math.abs(q.y-terrain.meshHeightAt(q.x,q.z)-.025));samples++;}}
  assert.ok(maxError<.001);assert.deepEqual(terrain.vertices,geometrySnapshot);assert.equal(JSON.stringify({data,dem}),sourceSnapshot);return{triangles:p.count/3,samples,maximumOverlayHeightError:maxError,rawDataAndTerrainUnchanged:true};
});
check('loaded and unloaded fence shots agree after the common render reflection',()=>{
  let maxError=0,rays=0;scene.scale.z=-1;scene.updateMatrixWorld(true);
  for(const b of model.breakables.filter((_,i)=>i%7===0)){const n=new THREE.Vector3(0,0,1).applyQuaternion(b.mesh.quaternion),p=b.mesh.position.clone().addScaledVector(n,2),d=n.negate();sim.setFocus(p,true);sim.world.step();const loaded=targetCast(p,d,4);assert.ok(loaded);sim.setFocus(far,true);sim.world.step();const unloaded=sim.castUnloadedTargets(p,d,4);assert.ok(unloaded);assert.equal(unloaded.target,loaded.target);maxError=Math.max(maxError,Math.abs(unloaded.distance-loaded.distance));rays++;}
  assert.ok(maxError<.001);scene.scale.z=1;scene.updateMatrixWorld(true);reset();return{rays,maximumDistanceError:maxError};
});
check('an intact panel blocks a capsule and a destroyed panel opens the same route',()=>{
  const walk=destroy=>{reset();sim.teleport(near);if(destroy)sim.hit(sim.targets.find(t=>t.mesh===piece.mesh),1000,new THREE.Vector3());for(let i=0;i<50;i++)sim.step(1/60,0,0,false);const start=new THREE.Vector3().copy(sim.player.translation());for(let i=0;i<100;i++)sim.step(1/60,-normal.x*5,-normal.z*5,false);const end=new THREE.Vector3().copy(sim.player.translation());return end.sub(start).dot(normal.clone().negate());};
  const intact=walk(false),destroyed=walk(true);assert.ok(intact<5&&intact>3);assert.ok(destroyed>7);reset();return{blockedTravel:intact,openTravel:destroyed};
});
check('partial destruction remains visible far away and repeated resets restore all instances',()=>{
  reset();const original=group.children.map(m=>m.instanceMatrix.array.slice()),t=sim.targets.find(t=>t.mesh===piece.mesh),index=sim.targets.indexOf(t),panels=group.children[0],originalColors=panels.instanceColor.array.slice();sim.hit(t,1,new THREE.Vector3());sim.step(1/60,0,0,false);model.update(far);const changedColor=panels.instanceColor.array.slice(index*3,index*3+3);assert.notDeepEqual(changedColor,originalColors.slice(index*3,index*3+3));for(let i=0;i<model.breakables.length;i++)if(i!==index)assert.deepEqual(panels.instanceColor.array.slice(i*3,i*3+3),originalColors.slice(i*3,i*3+3));
  sim.hit(t,1000,new THREE.Vector3());model.update(far);assert.ok(group.visible);const matrix=new THREE.Matrix4();panels.getMatrixAt(index,matrix);assert.equal(matrix.determinant(),0);const origin=t.mesh.position.clone().addScaledVector(normal,2),direction=normal.clone().negate();sim.setFocus(far,true);assert.equal(sim.castUnloadedTargets(origin,direction,3),null);
  for(const target of sim.targets)sim.hit(target,1000,new THREE.Vector3());model.update(far);assert.equal(group.visible,false);
  for(let i=0;i<3;i++){reset();model.update(far);assert.ok(group.visible);group.children.forEach((m,j)=>assert.deepEqual(m.instanceMatrix.array,original[j]));assert.deepEqual(panels.instanceColor.array,originalColors);assert.equal(sim.targets.filter(t=>t.hp>0).length,model.breakables.length);sim.setFocus(origin,true);sim.world.step();assert.equal(targetCast(origin,direction,3)?.target,t);assert.ok(t.body);sim.setFocus(far,true);assert.equal(sim.castUnloadedTargets(origin,direction,3)?.target,t);}return{resetCycles:3,restoredPanels:model.breakables.length,nonlethalFlashLocalized:true,deletedRemoteHitAbsent:true,loadedAndUnloadedCollisionRestored:true};
});
const calls=new Set(['fillRect','clearRect','beginPath','closePath','moveTo','lineTo','arc','ellipse','stroke','fill','fillText','strokeText','roundRect','save','restore','translate','rotate','scale','quadraticCurveTo','bezierCurveTo','setTransform']);globalThis.document={createElement(){return{width:0,height:0,getContext(){return new Proxy({},{get(o,k){if(k==='measureText')return s=>({width:String(s).length*20});if(k==='createLinearGradient'||k==='createRadialGradient')return()=>({addColorStop(){}});return calls.has(k)?()=>{}:o[k];},set(o,k,v){o[k]=v;return true;}});}};}};
check('full campus keeps the outside walking route and excludes generated tree trunks from the construction area',()=>{
  const fullScene=new THREE.Scene(),fullTerrain=createTerrain(fullScene,dem,data.buildings),full=createFullCampus(fullScene,data,fullTerrain.heightAt);assert.equal(full.breakables.filter(t=>t.mesh.userData.areaId===area.id).length,model.breakables.length);const surface=fullScene.children.find(o=>o.userData.areaId===area.id&&o.userData.role==='mapped-area');assert.ok(surface.userData.terrainTriangleOverlay);let trees=0,inSite=0;
  fullScene.traverse(o=>{if(!o.isInstancedMesh||o.geometry.type!=='CylinderGeometry')return;for(let i=0;i<o.count;i++){const m=new THREE.Matrix4();o.getMatrixAt(i,m);const p=new THREE.Vector3().setFromMatrixPosition(m);trees++;if(inside(p.x,p.z))inSite++;}});assert.ok(trees>100);assert.equal(inSite,0);
  const [a,b]=area.points,along=new THREE.Vector3(b[0]-a[0],0,b[1]-a[1]).normalize(),outside=new THREE.Vector3(-along.z,0,along.x),start=new THREE.Vector3(a[0],0,a[1]).lerp(new THREE.Vector3(b[0],0,b[1]),.1).addScaledVector(outside,.9);start.y=fullTerrain.heightAt(start.x,start.z)+1.8;const walkSim=new Simulation(full.breakables,full.colliders,start,data.bounds,fullTerrain);
  let progress;try{for(let i=0;i<50;i++)walkSim.step(1/60,0,0,false);const p=new THREE.Vector3().copy(walkSim.player.translation());for(let i=0;i<500;i++)walkSim.step(1/60,along.x*5,along.z*5,false);progress=new THREE.Vector3().copy(walkSim.player.translation()).sub(p).dot(along);assert.ok(progress>40);}finally{walkSim.world.free();}
  return{registeredFenceParts:model.breakables.length,treeTrunks:trees,trunksInsideSite:inSite,outsideRouteOffset:.9,outsideRouteTravel:progress,routeScope:'One 41 m route parallel to mapped western fence with actual full-campus collisions; not a survey of the planned 2 m passage.'};
});
await fs.writeFile(path.join(out,'results.json'),JSON.stringify({scope:'Node geometry and Rapier with actual campus and terrain. Plan-based approximation; no current field survey, browser pixels, GPU or phone verification.',hashes,results},null,2));console.log(`${results.length}/${results.length} construction checks passed.`);
}finally{sim.world.free();}
