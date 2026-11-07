import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), out = path.join(root, 'artifacts/gym-test');
await mkdir(out, { recursive: true }); const hashes = {};
for (const filename of (await readdir(path.join(root, 'src'))).filter(n => n.endsWith('.ts'))) {
  const source = await readFile(path.join(root, 'src', filename), 'utf8'); hashes[filename] = createHash('sha256').update(source).digest('hex');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  await writeFile(path.join(out, filename.replace(/\.ts$/, '.mjs')), js.replace(/from (['"])(\.\/[\w-]+)\1/g, "from '$2.mjs'"));
}
const { createGymLandmark } = await import(pathToFileURL(path.join(out, 'gymLandmark.mjs')));
const { createTerrain } = await import(pathToFileURL(path.join(out, 'terrain.mjs')));
const { getBuildingAppearance } = await import(pathToFileURL(path.join(out, 'buildingAppearance.mjs')));
const { Simulation } = await import(pathToFileURL(path.join(out, 'physics.mjs')));
const { dataToRenderPoint: H } = await import(pathToFileURL(path.join(out, 'coordinates.mjs')));
await RAPIER.init();
const data = JSON.parse(await readFile(path.join(root, 'public/data/campus.json'), 'utf8')), dem = JSON.parse(await readFile(path.join(root, 'public/data/terrain.json'), 'utf8'));
const building = data.buildings.find(b => b.id === 'way/386891006'), originalData = JSON.stringify({ building, dem });
const scene = new THREE.Scene(), terrain = createTerrain(scene, dem, data.buildings), profile = getBuildingAppearance(building), model = createGymLandmark(scene, building, profile, terrain.heightAt);
const shell = scene.children.find(o => o.userData.role === 'building-shell'), info = shell.userData, meshes = shell.children.filter(o => o.isMesh), original = meshes.map(m => m.geometry.attributes.position.array.slice());
const base = info.localOrigin.y, axis = new THREE.Vector3(info.axis.x, 0, info.axis.z), front = new THREE.Vector3(-axis.z, 0, axis.x), up = new THREE.Vector3(0, 1, 0);
const point = (x, y, z) => new THREE.Vector3(info.localOrigin.x, base + y, info.localOrigin.z).addScaledVector(axis, x).addScaledVector(front, z);
const local = p => { const q = p.clone().sub(point(0, 0, 0)); return [q.dot(axis), q.y, q.dot(front)]; };
const near = point(-6, 1.8, info.entrance.z), far = new THREE.Vector3(100000, 500, 100000), sim = new Simulation(model.breakables, [], near, data.bounds, terrain), results = [];
function check(name, fn) { const details = fn(); results.push({ name, status: 'passed', ...details }); console.log(`PASS ${name} ${JSON.stringify(details)}`); }
function cast(p, d, distance) { const lookup = new Map(sim.targets.filter(t => t.body).map(t => [t.body.handle, t])); const hit = sim.world.castRay(new RAPIER.Ray(p, d), distance, true, undefined, undefined, undefined, undefined, c => lookup.has(c.parent()?.handle)); return hit ? { object: lookup.get(hit.collider.parent().handle).mesh, distance: hit.timeOfImpact } : null; }
function visual(p, d, distance) { scene.updateMatrixWorld(true); return new THREE.Raycaster(p, d, 0, distance).intersectObjects(meshes, false)[0] ?? null; }
function reset() { sim.reset(); sim.setFocus(near, true); sim.world.step(); model.update(near); }
function triangles() { if (!shell.visible) return 0; let n = 0; const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(); for (const mesh of meshes) { const p = mesh.geometry.attributes.position; for (let i = 0; i < p.count; i += 3) if (b.fromBufferAttribute(p, i + 1).sub(a.fromBufferAttribute(p, i)).cross(c.fromBufferAttribute(p, i + 2).sub(a)).lengthSq() > 1e-10) n++; } return n; }
function inside(x, z) { let yes = false; const ring = building.points; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) yes = !yes; } return yes; }

let originalTriangles;
try {
  reset();
  check('mapped outline and source classifications remain distinct from estimated gym massing',()=>{
    assert.equal(JSON.stringify({building,dem}),originalData);assert.deepEqual(info.mappedOutline,building.points.slice(0,-1));assert.equal(info.sourcePointCount,13);assert.equal(meshes.length,3);assert.equal(info.highRoof,14);assert.equal(info.lowRoof,8);assert.equal(info.levels.confirmedUseFloor,3);assert.equal(info.levels.classificationVerified,false);assert.equal(info.levels.usedAsFacadeRows,false);assert.equal(info.courtyardModeled,false);assert.equal(info.frontDirectionEstimated,true);
    assert.ok(meshes.every(m=>[...m.geometry.attributes.position.array].every(Number.isFinite)));assert.ok(sim.targets.every(t=>t.size.toArray().every(x=>x>0&&Number.isFinite(x))));originalTriangles=triangles();assert.ok(sim.targets.length<900&&originalTriangles<30000);
    return{renderMeshes:meshes.length,parts:sim.targets.length,triangles:originalTriangles,highRoofEstimate:14,lowRoofEstimate:8};
  });
  check('two roof heights retain the entire source polygon without an invented courtyard',()=>{
    const roof=sim.targets.filter(t=>t.mesh.userData.component==='mapped-roof-slab');let insideSamples=0,outsideSamples=0,highSamples=0,lowSamples=0;
    for(let x=270;x<402;x+=3.1)for(let z=70;z<192;z+=3.1){const expected=inside(x,z),ray=new THREE.Raycaster(new THREE.Vector3(x,base+15,z),up.clone().negate(),0,9),hit=ray.intersectObjects(roof.map(t=>t.mesh),false)[0];assert.equal(!!hit,expected,'roof footprint mismatch '+x+','+z);if(hit){const l=local(hit.point),target=l[2]>=info.bodySplitZ?13.85:7.85;assert.ok(Math.abs(l[1]-target)<.002);insideSamples++;l[2]>=info.bodySplitZ?highSamples++:lowSamples++;}else outsideSamples++;}
    assert.ok(highSamples>100&&lowSamples>100);assert.ok(roof.every(t=>t.collisionVertices));return{roofParts:roof.length,insideSamples,outsideSamples,highSamples,lowSamples};
  });
  check('low-wing and recessed entrance glass clear the actual terrain and face outward',()=>{
    const mesh=meshes.find(m=>m.name==='gym-glazing'),p=mesh.geometry.attributes.position;let samples=0,minimum=Infinity,frontGlass=0,exposedFrontGlass=0;
    for(let i=0;i<p.count;i+=3){const v=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,i+k));for(let a=0;a<=5;a++)for(let b=0;b<=5-a;b++){const q=v[0].clone().multiplyScalar(1-(a+b)/5).addScaledVector(v[1],a/5).addScaledVector(v[2],b/5);minimum=Math.min(minimum,q.y-terrain.meshHeightAt(q.x,q.z));samples++;}const centre=v[0].clone().add(v[1]).add(v[2]).multiplyScalar(1/3),l=local(centre),normal=v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])).normalize();if(Math.abs(l[0]-info.entrance.x)<.03&&l[2]>-38&&l[2]<-18&&normal.dot(axis)<-.9){frontGlass++;const hit=visual(centre.clone().addScaledVector(axis,-.3),axis,.4);if(hit&&hit.object===mesh)exposedFrontGlass++;}}
    assert.ok(minimum>.06,'glass terrain clearance '+minimum);assert.ok(frontGlass>=8&&exposedFrontGlass>=8);return{glassSamples:samples,minimumTerrainClearance:minimum,frontGlassTriangles:frontGlass,exposedFrontGlass};
  });
  check('photographed canopy support opening remains empty in render and collision geometry',()=>{
    const gap=info.supportOpening,walls=sim.targets.filter(t=>t.mesh.userData.component==='canopy-support-wall');assert.equal(walls.length,4);let emptyRays=0;
    for(const x of [gap.x0+.5,(gap.x0+gap.x1)/2,gap.x1-.5])for(const y of [gap.bottom+.4,(gap.bottom+gap.top)/2,gap.top-.4]){const p=point(x,y,gap.z-1),d=front.clone();sim.setFocus(p,true);sim.world.step();assert.ok(!cast(p,d,2),'support aperture blocked');assert.ok(!visual(p,d,2),'support aperture render blocked');emptyRays++;}
    for(const [x,y]of[[gap.x0-.35,2.5],[gap.x1+.35,2.5],[-4,.8],[-4,4.5]]){const p=point(x,y,gap.z-1);assert.ok(cast(p,front,2));assert.ok(visual(p,front,2));}
    return{emptyRays,solidBorderRays:4};
  });
  check('individual diagonal convex colliders leave triangular canopy gaps open',()=>{
    const t=info.truss,diagonals=sim.targets.filter(p=>p.mesh.userData.component==='truss-diagonal');assert.equal(diagonals.length,80);assert.ok(diagonals.every(p=>p.collisionVertices));let emptyRays=0,beamRays=0,error=0;
    for(let j=0;j<10;j++){const z=info.canopy.minZ+j*t.pitch+.43,p=point(info.canopy.minX-1,(t.lower+t.upper)/2,z);sim.setFocus(p,true);sim.world.step();assert.ok(!cast(p,axis,9.1),'front truss cell blocked');assert.ok(!visual(p,axis,9.1),'front truss render cell blocked');emptyRays++;}
    for(let j=0;j<10;j++){const z=info.canopy.minZ+j*t.pitch+t.pitch/4,p=point(info.canopy.minX-1,(t.lower+t.upper)/2,z),hit=cast(p,axis,2),v=visual(p,axis,2);assert.ok(hit&&v);error=Math.max(error,Math.abs(hit.distance-v.distance));beamRays++;}assert.ok(error<.012);return{convexDiagonals:diagonals.length,emptyRays,beamRays,maximumColliderSurfaceDifference:error};
  });
  check('real terrain capsule reaches the closed recessed entrance and enters after destruction',()=>{
    const door=sim.targets.find(t=>t.mesh.userData.component==='gym-entry-door'),paths=[];
    function walk(offset){const spawn=point(-22,0,info.entrance.z+offset);spawn.y=terrain.heightAt(spawn.x,spawn.z)+1.7;sim.teleport(spawn);for(let i=0;i<450;i++)sim.step(1/60,axis.x*6,axis.z*6,false);const end=new THREE.Vector3().copy(sim.player.translation());return{x:local(end)[0],y:local(end)[1],groundGap:end.y-.85-terrain.meshHeightAt(end.x,end.z)};}
    for(const offset of [-2,0,2]){reset();const closed=walk(offset);assert.ok(closed.x>1.7&&closed.x<2.1,'closed entrance '+JSON.stringify({offset,closed}));sim.hit(door,100,axis);model.update(near);const opened=walk(offset);assert.ok(opened.x>8&&opened.groundGap>-.06,'open entrance '+JSON.stringify({offset,opened}));paths.push({offset,closed,opened});}reset();return{speed:6,paths};
  });
  check('loaded and unloaded exterior rays agree for solid walls, convex beams, roof and door',()=>{
    const rays=[],kinds=new Set();let seams=0;
    for(const [i,target]of sim.targets.entries()){if(i%3!==0&&!['gym-entry-door','truss-diagonal','canopy-support-wall'].includes(target.mesh.userData.component))continue;const sizes=target.size.toArray(),thin=sizes.indexOf(Math.min(...sizes)),normal=new THREE.Vector3(thin===0?1:0,thin===1?1:0,thin===2?1:0).applyQuaternion(target.mesh.quaternion);
      for(const sign of[-1,1]){const n=normal.clone().multiplyScalar(sign);let surface=target.mesh.position.clone().addScaledVector(n,sizes[thin]/2);if(target.collisionVertices){const vertices=target.mesh.geometry.attributes.position;let maxArea=0;for(let k=0;k<vertices.count;k+=3){const tri=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(vertices,k+j).applyMatrix4(target.mesh.matrixWorld)),cross=tri[1].clone().sub(tri[0]).cross(tri[2].clone().sub(tri[0])),area=cross.length();if(area>maxArea&&cross.normalize().dot(n)>.9){maxArea=area;surface=tri[0].add(tri[1]).add(tri[2]).multiplyScalar(1/3);}}}const p=surface.addScaledVector(n,.5),d=n.negate();sim.setFocus(p,true);sim.world.step();const hit=cast(p,d,.8);if(hit?.object!==target.mesh||hit.distance<.35)continue;const all=new THREE.Raycaster(p,d,0,.8).intersectObjects(sim.targets.map(t=>t.mesh),false),unique=all.filter((h,k,a)=>a.findIndex(q=>q.object===h.object)===k);if(unique.length>1&&Math.abs(unique[0].distance-unique[1].distance)<.0001){seams++;continue;}rays.push({p,d,target,distance:hit.distance});kinds.add(target.mesh.userData.component);break;}}
    assert.ok(rays.length>120);for(const kind of['mapped-roof-slab','gym-entry-door','truss-diagonal','canopy-support-wall'])assert.ok(kinds.has(kind),kind);sim.setFocus(far,true);sim.world.step();let error=0;for(const r of rays){const hit=sim.castUnloadedTargets(r.p,r.d,.8);assert.ok(hit?.object===r.target.mesh,'unloaded object mismatch '+r.target.mesh.userData.component);error=Math.max(error,Math.abs(hit.distance-r.distance));}assert.ok(error<.025);reset();return{externalRays:rays.length,componentKinds:kinds.size,seamTiesExcluded:seams,startsInsideExcluded:true,maximumDistanceDifference:error};
  });

  check('closed window proxies keep a bounded distance from exposed glass',()=>{
    const glassMesh=meshes.find(m=>m.name==='gym-glazing'),p=glassMesh.geometry.attributes.position;let samples=0,maximum=0;
    for(let i=0;i<p.count;i+=3){const v=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,i+k)),normal=v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])).normalize();if(Math.abs(normal.y)>.1)continue;const centre=v[0].clone().add(v[1]).add(v[2]).multiplyScalar(1/3),start=centre.clone().addScaledVector(normal,.6),d=normal.clone().negate(),visualHit=visual(start,d,.8);if(!visualHit||visualHit.object!==glassMesh)continue;sim.setFocus(start,true);sim.world.step();const physical=cast(start,d,.8);if(!physical)continue;const difference=visualHit.distance-physical.distance;if(difference<-.002)continue;maximum=Math.max(maximum,difference);samples++;}assert.ok(samples>30);assert.ok(maximum<.16,'window proxy offset '+maximum);reset();return{exposedGlassRays:samples,maximumProxyLead:maximum,meaning:'Closed window proxies balance the visible wall and recessed glass planes.'};
  });

  check('balanced closed facade colliders bound visible wall recession without changing apertures',()=>{
    const wallMesh=meshes.find(m=>m.name==='gym-ivory-tiled-walls'),p=wallMesh.geometry.attributes.position;let samples=0,maximum=0;const adjusted=sim.targets.filter(t=>t.mesh.userData.facadeCollision);assert.ok(adjusted.length>40);assert.ok(adjusted.every(t=>t.mesh.userData.component==='low-wing-window-bay'&&!t.collisionVertices));
    for(let i=0;i<p.count;i+=3){const v=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,i+k)),normal=v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])).normalize();if(Math.abs(normal.y)>.1)continue;const centre=v[0].clone().add(v[1]).add(v[2]).multiplyScalar(1/3),start=centre.clone().addScaledVector(normal,.6),d=normal.clone().negate(),visible=visual(start,d,1);if(!visible||visible.object!==wallMesh||Math.abs(visible.distance-.6)>.002)continue;sim.setFocus(start,true);sim.world.step();const physical=cast(start,d,1);if(!physical?.object.userData.facadeCollision||new THREE.Vector3().fromArray(physical.object.userData.outward).dot(normal)<.999)continue;const error=physical.distance-visible.distance;assert.ok(error>-.003&&error<.16,'wall proxy recession '+error);maximum=Math.max(maximum,error);samples++;}
    assert.ok(samples>100);for(const t of sim.targets.filter(t=>['gym-entry-door','canopy-support-wall','truss-diagonal'].includes(t.mesh.userData.component)))assert.equal(t.mesh.userData.facadeCollision,undefined);reset();return{adjustedFacadeParts:adjusted.length,visibleWallRays:samples,maximumWallRecession:maximum,doorSupportAndTrussesExcluded:true};
  });
  check('partial truss destruction persists at distance and reset restores every triangle',()=>{
    const target=sim.targets.find(t=>t.mesh.userData.component==='truss-diagonal');sim.hit(target,100,axis);model.update(near);const remaining=triangles();assert.ok(remaining>0&&remaining<originalTriangles);sim.setFocus(far,true);model.update(far);assert.equal(triangles(),remaining);reset();meshes.forEach((m,i)=>assert.deepEqual(m.geometry.attributes.position.array,original[i]));for(const t of sim.targets)sim.hit(t,100,up);model.update(far);assert.equal(triangles(),0);assert.equal(shell.visible,false);reset();assert.equal(triangles(),originalTriangles);return{removedTriangles:originalTriangles-remaining,restoredParts:sim.targets.length,restoredTriangles:originalTriangles};
  });
  check('one H reflection preserves logical shots and puts the low southern wing on photographic right',()=>{
    const eye=point(-70,8,-28),target=point(0,8,-28),direction=H(target).sub(H(eye)).normalize(),right=direction.clone().cross(up).normalize(),southern=H(point(0,8,-70)).sub(H(point(0,8,-10))).dot(right);assert.ok(southern>59);const p=point(info.entrance.x-1,2,info.entrance.z),before=visual(p,axis,2);assert.ok(before);scene.scale.z=-1;scene.updateMatrixWorld(true);const after=new THREE.Raycaster(H(p),H(axis),0,2).intersectObjects(meshes,false)[0];assert.ok(after&&Math.abs(after.distance-before.distance)<.001);sim.setFocus(p,true);sim.world.step();const loaded=cast(p,axis,2);sim.setFocus(far,true);const unloaded=sim.castUnloadedTargets(p,axis,2);assert.ok(loaded&&unloaded&&loaded.object===unloaded.object&&Math.abs(loaded.distance-unloaded.distance)<.025);scene.scale.z=1;scene.updateMatrixWorld(true);reset();return{southernWingRightDisplacement:southern,reflectedDistanceDifference:Math.abs(after.distance-before.distance)};
  });
  check('datum callback and reversed ring keep the chosen orientation without changing source data',()=>{
    const elevatedScene=new THREE.Scene();createGymLandmark(elevatedScene,building,profile,(x,z)=>terrain.heightAt(x,z)+50);const elevated=elevatedScene.children.find(o=>o.userData.role==='building-shell');for(let m=0;m<meshes.length;m++){const p=elevated.children[m].geometry.attributes.position.array;assert.equal(p.length,original[m].length);for(let i=0;i<p.length;i+=3)assert.ok(Math.abs(p[i]-original[m][i])<.001&&Math.abs(p[i+2]-original[m][i+2])<.001&&Math.abs(p[i+1]-original[m][i+1]-50)<.001);}
    const reversedScene=new THREE.Scene();createGymLandmark(reversedScene,{...building,points:building.points.slice().reverse()},profile,terrain.heightAt);const reversed=reversedScene.children.find(o=>o.userData.role==='building-shell');assert.ok(Math.abs(reversed.userData.axis.x-axis.x)<1e-8&&Math.abs(reversed.userData.axis.z-axis.z)<1e-8);assert.deepEqual(reversed.userData.canopy,info.canopy);assert.equal(JSON.stringify({building,dem}),originalData);return{callbackElevationOffset:50,reversedRingSameOrientation:true};
  });
  console.log('Gym checks '+results.length+'/'+results.length+' passed. Geometry and Rapier only; no GPU or physical-phone verification.');
} finally {sim.world.removeCharacterController(sim.controller);sim.world.free();await writeFile(path.join(out,'results.json'),JSON.stringify({scope:'Actual geometry, DEM and Rapier. No survey, browser rendering or physical-phone performance verification.',hashes,results},null,2)+'\n');}
