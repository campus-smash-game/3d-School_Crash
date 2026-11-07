import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), out = path.join(root, 'artifacts/museum-test');
await mkdir(out, { recursive: true }); const hashes = {};
for (const filename of (await readdir(path.join(root, 'src'))).filter(n => n.endsWith('.ts'))) {
  const source = await readFile(path.join(root, 'src', filename), 'utf8'); hashes[filename] = createHash('sha256').update(source).digest('hex');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  await writeFile(path.join(out, filename.replace(/\.ts$/, '.mjs')), js.replace(/from (['"])(\.\/[\w-]+)\1/g, "from '$2.mjs'"));
}
const { createMuseumLandmark } = await import(pathToFileURL(path.join(out, 'museumLandmark.mjs')));
const { createTerrain } = await import(pathToFileURL(path.join(out, 'terrain.mjs')));
const { getBuildingAppearance } = await import(pathToFileURL(path.join(out, 'buildingAppearance.mjs')));
const { Simulation } = await import(pathToFileURL(path.join(out, 'physics.mjs')));
const { dataToRenderPoint: H } = await import(pathToFileURL(path.join(out, 'coordinates.mjs')));
await RAPIER.init();
const data = JSON.parse(await readFile(path.join(root, 'public/data/campus.json'), 'utf8')), dem = JSON.parse(await readFile(path.join(root, 'public/data/terrain.json'), 'utf8'));
const building = data.buildings.find(b => b.id === 'way/439693757'), originalData = JSON.stringify({ building, dem });
const scene = new THREE.Scene(), terrain = createTerrain(scene, dem, data.buildings), profile = getBuildingAppearance(building), model = createMuseumLandmark(scene, building, profile, terrain.heightAt);
const shell = scene.children.find(o => o.userData.role === 'building-shell'), info = shell.userData, meshes = shell.children.filter(o => o.isMesh), original = meshes.map(m => m.geometry.attributes.position.array.slice());
const base = info.localOrigin.y, axis = new THREE.Vector3(info.axis.x, 0, info.axis.z), front = new THREE.Vector3(-axis.z, 0, axis.x), up = new THREE.Vector3(0, 1, 0);
const point = (x, y, z) => new THREE.Vector3(info.localOrigin.x, base + y, info.localOrigin.z).addScaledVector(axis, x).addScaledVector(front, z);
const local = p => { const q = p.clone().sub(point(0, 0, 0)); return [q.dot(axis), q.y, q.dot(front)]; };
const near = point(info.stair.startX - 2, 1.8, info.stair.centerZ), far = new THREE.Vector3(100000, 500, 100000), sim = new Simulation(model.breakables, [], near, data.bounds, terrain), results = [];
function check(name, fn) { const details = fn(); results.push({ name, status: 'passed', ...details }); console.log(`PASS ${name} ${JSON.stringify(details)}`); }
function cast(p, d, distance) { const lookup = new Map(sim.targets.filter(t => t.body).map(t => [t.body.handle, t])); const hit = sim.world.castRay(new RAPIER.Ray(p, d), distance, true, undefined, undefined, undefined, undefined, c => lookup.has(c.parent()?.handle)); return hit ? { object: lookup.get(hit.collider.parent().handle).mesh, distance: hit.timeOfImpact } : null; }
function visual(p, d, distance) { scene.updateMatrixWorld(true); return new THREE.Raycaster(p, d, 0, distance).intersectObjects(meshes, false)[0] ?? null; }
function reset() { sim.reset(); sim.setFocus(near, true); sim.world.step(); model.update(near); }
function triangles() { if (!shell.visible) return 0; let n = 0; const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(); for (const mesh of meshes) { const p = mesh.geometry.attributes.position; for (let i = 0; i < p.count; i += 3) if (b.fromBufferAttribute(p, i + 1).sub(a.fromBufferAttribute(p, i)).cross(c.fromBufferAttribute(p, i + 2).sub(a)).lengthSq() > 1e-12) n++; } return n; }
function inside(x, z) { let yes = false; const ring = building.points; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) yes = !yes; } return yes; }
let originalTriangles;
try {
  reset();
  check('official two levels and basement are separate from estimated heights and original footprint',()=>{
    assert.equal(JSON.stringify({building,dem}),originalData);assert.deepEqual(info.mappedOutline,building.points.slice(0,-1));assert.equal(info.mappedOutline.length,19);assert.deepEqual(info.levels,{aboveGround:2,belowGround:1,northExhibition:1,southExhibition:2});assert.equal(info.heightEstimated,true);assert.equal(info.basementInteriorModeled,false);assert.equal(meshes.length,3);
    assert.ok(meshes.every(m=>[...m.geometry.attributes.position.array].every(Number.isFinite)));originalTriangles=triangles();assert.ok(sim.targets.length<1000&&originalTriangles<40000);
    return {parts:sim.targets.length,triangles:originalTriangles,meshes:meshes.length,base,lowRoof:info.lowRoofHeight,highRoof:info.highRoofHeight,skylightPeak:info.roofHeight,basementInteriorModeled:info.basementInteriorModeled};
  });
  check('roof triangulation retains the original outline while excluding courtyard and all skylight openings',()=>{
    const roofs=sim.targets.filter(t=>t.mesh.userData.component==='mapped-roof-panel');assert.ok(roofs.length>40&&roofs.every(t=>t.collisionVertices));let roof=0,holes=0,outside=0;
    for(let x=-10.1;x<81;x+=2.3)for(let z=-62.1;z<2;z+=2.3){const p=point(x,25,z),source=inside(p.x,p.z),hole=info.roofHoles.some(h=>x>h.minX&&x<h.maxX&&z>h.minZ&&z<h.maxZ),hit=new THREE.Raycaster(p,up.clone().negate(),0,25).intersectObjects(roofs.map(t=>t.mesh),false)[0];assert.equal(!!hit,source&&!hole,`roof coverage ${x},${z}`);if(!source)outside++;else if(hole)holes++;else roof++;}
    assert.ok(holes>100&&roof>300);return {convexRoofParts:roofs.length,coveredSamples:roof,openSamples:holes,outsideSamples:outside};
  });
  check('courtyard has open sky in render and physical geometry',()=>{
    const c=info.courtyard;let count=0;
    for(let x=c.minX+1;x<c.maxX-1;x+=2.5)for(let z=c.minZ+1;z<c.maxZ-1;z+=2.5){const p=point(x,.9,z);sim.setFocus(p,true);sim.world.step();assert.equal(cast(p,up,30),null);assert.equal(visual(p,up,30),null);count++;}
    sim.setFocus(far,true);sim.world.step();const p=point((c.minX+c.maxX)/2,.9,(c.minZ+c.maxZ)/2);assert.equal(sim.castUnloadedTargets(p,up,30),null);reset();return {openSkySamples:count,unloadedOpenSky:true};
  });
  check('four quarter-circle skylights retain hollow interiors and smooth radial normals',()=>{
    assert.equal(info.skylights.length,4);const copper=sim.targets.filter(t=>t.mesh.userData.component==='quarter-circle-copper-panel');assert.equal(copper.length,224);assert.ok(copper.every(t=>t.collisionVertices));let hollow=0,outsideCorner=0,curveSamples=0,error=0;
    for(const s of info.skylights){const x=(s.eastStart+s.eastEnd)/2,p=point(x,s.roof+.65,-s.south-1.0);sim.setFocus(p,true);sim.world.step();assert.equal(cast(p,axis,2),null);assert.equal(visual(p,axis,2),null);hollow++;
      const corner=point(x,s.roof+3.05,-s.south-2.8);assert.equal(cast(corner,up.clone().negate(),.4),null);assert.equal(visual(corner,up.clone().negate(),.4),null);outsideCorner++;
      for(const theta of [.2,.5,.9,1.3]){const n=front.clone().multiplyScalar(-Math.sin(theta)).addScaledVector(up,Math.cos(theta)),surface=point(x,s.roof+s.radius*Math.cos(theta),-s.south-s.radius*Math.sin(theta)),hit=visual(surface.clone().addScaledVector(n,.5),n.clone().negate(),.7);assert.ok(hit);error=Math.max(error,Math.abs(hit.distance-.5));curveSamples++;}
    }
    const normals=meshes.find(m=>m.name==='museum-copper-and-frames').geometry.attributes.normal;let smoothNormalCount=0;for(let i=0;i<normals.count;i++){const n=new THREE.Vector3().fromBufferAttribute(normals,i);if(n.y>.05&&n.y<.98&&Math.abs(n.dot(axis))<.0001)smoothNormalCount++;}assert.ok(smoothNormalCount>1000);assert.ok(error<.01);reset();return {curvedConvexPanels:copper.length,hollowInteriorRays:hollow,emptyBoundingBoxCornerRays:outsideCorner,curveSamples,maximumTessellationError:error,smoothNormalCount};
  });
  check('glass remains above actual terrain and north-facing skylight glazing is exposed',()=>{
    const mesh=meshes.find(m=>m.name==='museum-glazing'),p=mesh.geometry.attributes.position;let min=Infinity,samples=0;
    for(let i=0;i<p.count;i+=3){const tri=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,i+k));for(let a=0;a<=4;a++)for(let b=0;b<=4-a;b++){const v=tri[0].clone().multiplyScalar(1-(a+b)/4).addScaledVector(tri[1],a/4).addScaledVector(tri[2],b/4);min=Math.min(min,v.y-terrain.meshHeightAt(v.x,v.z));samples++;}}
    assert.ok(min>.03,`glass terrain clearance ${min}`);let clearGlass=0;
    for(const s of info.skylights){const p=point(s.eastStart+3.15,s.roof+1.4,-s.south+.5),hit=visual(p,front.clone().negate(),1);assert.ok(hit?.object===mesh,'north-facing glazing hidden');clearGlass++;}return {glassSamples:samples,minimumTerrainClearance:min,northGlazingFaces:clearGlass};
  });
  check('southwest stair enclosure preserves empty space inside the mapped curved wall',()=>{
    const p=point(-2,2.5,-39.4),d=axis.clone().negate();sim.setFocus(p,true);sim.world.step();const hit=cast(p,d,12),render=visual(p,d,12);assert.ok(hit&&render&&hit.distance>3&&render.distance>3);assert.equal(cast(p,axis,2),null);assert.equal(visual(p,axis,2),null);return {interiorClearRay:2,curvedWallPhysicalDistance:hit.distance,curvedWallRenderDistance:render.distance};
  });
  check('front stair and long plaza support centre and edge capsule paths in both directions',()=>{
    const s=info.stair,rows=[];
    const walk=(spawn,dir,frames)=>{sim.teleport(spawn);for(let i=0;i<frames;i++)sim.step(1/60,dir.x*6,dir.z*6,false);return local(new THREE.Vector3().copy(sim.player.translation()));};
    for(const offset of [-(s.width/2-.7),0,s.width/2-.7]){reset();const z=s.centerZ+offset,start=point(s.startX-4,0,z);start.y=terrain.heightAt(start.x,start.z)+1.7;const rise=walk(start,axis,320);assert.ok(rise[0]>-10&&rise[1]>-1.4,`ascent ${JSON.stringify({offset,rise})}`);const downStart=point(-10,THREE.MathUtils.lerp(info.plaza.startY,info.plaza.endY,12/(info.plaza.endX-info.plaza.startX))+1.7,z),descent=walk(downStart,axis.clone().negate(),330);assert.ok(descent[0]<s.startX-2.6,`descent ${JSON.stringify({offset,descent})}`);rows.push({offset,ascent:rise,descent});}
    reset();return {speed:6,stairRise:(s.top-s.bottom)/s.steps,paths:rows};
  });
  check('destroying the front and courtyard doors opens a capsule route into the courtyard',()=>{
    const e=info.entry,c=info.courtyardDoor,door=sim.targets.find(t=>t.mesh.userData.component==='west-main-entrance-door'),yardDoor=sim.targets.find(t=>t.mesh.userData.component==='courtyard-entry-door'),spawn=point(-8,1.7,e.z);
    const walk=()=>{sim.teleport(spawn);for(let i=0;i<420;i++)sim.step(1/60,axis.x*6,axis.z*6,false);return local(new THREE.Vector3().copy(sim.player.translation()));};
    const closed=walk();assert.ok(closed[0]<e.x&&closed[0]>e.x-.9,JSON.stringify(closed));sim.hit(door,100,axis);model.update(near);const innerClosed=walk();assert.ok(innerClosed[0]>c.x-.9&&innerClosed[0]<c.x,JSON.stringify(innerClosed));sim.hit(yardDoor,100,axis);model.update(near);const open=walk();assert.ok(open[0]>c.x+3&&open[0]<info.courtyard.maxX,JSON.stringify(open));reset();return {frontDoorClosed:closed,courtyardDoorClosed:innerClosed,courtyardEntered:open};
  });
  check('number 70 is exposed and reads left to right after one H reflection',()=>{
    const text=info.numberLabel;assert.ok(text&&text.segments===9&&text.attachedToWallPart);const glyphs=text.glyphCenters.map(p=>new THREE.Vector3().fromArray(p)),normal=new THREE.Vector3().fromArray(text.outward),eye=glyphs[0].clone().addScaledVector(normal,25),view=H(normal.clone().negate()),right=view.clone().cross(up).normalize();assert.ok(H(glyphs[1]).sub(H(glyphs[0])).dot(right)>.9);
    const labelMesh=meshes.find(m=>m.name==='museum-copper-and-frames'),pos=labelMesh.geometry.attributes.position,colors=labelMesh.geometry.attributes.color,tint=new THREE.Color(0x397d7c),centres=[];
    for(let i=0;i<pos.count;i+=3){if(Math.abs(colors.getX(i)-tint.r)+Math.abs(colors.getY(i)-tint.g)+Math.abs(colors.getZ(i)-tint.b)>.000001)continue;const centre=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(pos,i+k)).reduce((s,p)=>s.add(p),new THREE.Vector3()).multiplyScalar(1/3),p=centre.clone().addScaledVector(normal,.25),hit=visual(p,normal.clone().negate(),.3);assert.ok(hit?.object===labelMesh&&Math.abs(hit.distance-.25)<.001,'number segment occluded by its wall');centres.push(centre);}
    assert.equal(centres.length,18);scene.scale.z=-1;scene.updateMatrixWorld(true);for(const centre of centres){const p=H(centre.clone().addScaledVector(normal,.25)),hit=new THREE.Raycaster(p,H(normal.clone().negate()),0,.3).intersectObjects(meshes,false)[0];assert.ok(hit?.object===labelMesh&&Math.abs(hit.distance-.25)<.001,'reflected number segment hidden');}scene.scale.z=1;scene.updateMatrixWorld(true);
    const part=sim.targets.find(t=>t.mesh.userData.numberLabel==='70');assert.ok(part);const before=triangles();sim.hit(part,100,normal.clone().negate());model.update(near);assert.ok(triangles()<before-18);reset();return {text:'70',segments:9,exposedTriangleRays:centres.length,reflectedExposedTriangleRays:centres.length,renderRightDistance:H(glyphs[1]).sub(H(glyphs[0])).dot(right),sameDestructibleWall:true,observer:H(eye).toArray()};
  });
  check('loaded and unloaded external rays agree for walls glass convex roof and copper panels',()=>{
    const rays=[],kinds=new Set();let ties=0;
    for(const target of sim.targets){const sizes=target.size.toArray(),thin=sizes.indexOf(Math.min(...sizes)),normal=new THREE.Vector3(thin===0?1:0,thin===1?1:0,thin===2?1:0).applyQuaternion(target.mesh.quaternion);
      for(const sign of [-1,1]){const n=normal.clone().multiplyScalar(sign);let surface=target.mesh.position.clone().addScaledVector(n,sizes[thin]/2);
        if(target.collisionVertices){const vertices=target.mesh.geometry.attributes.position;let max=0;for(let i=0;i<vertices.count;i+=3){const tri=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(vertices,i+k).applyMatrix4(target.mesh.matrixWorld)),cross=tri[1].clone().sub(tri[0]).cross(tri[2].clone().sub(tri[0])),area=cross.length();if(area>max&&cross.normalize().dot(n)>.7){max=area;surface=tri[0].add(tri[1]).add(tri[2]).multiplyScalar(1/3);}}}
        const p=surface.addScaledVector(n,.7),d=n.negate();sim.setFocus(p,true);sim.world.step();const hit=cast(p,d,1);if(hit?.object!==target.mesh||hit.distance<.5)continue;
        const hits=new THREE.Raycaster(p,d,0,1).intersectObjects(sim.targets.map(t=>t.mesh),false),distinct=hits.filter((h,i,all)=>all.findIndex(q=>q.object===h.object)===i);if(distinct.length>1&&Math.abs(distinct[0].distance-distinct[1].distance)<.0001){ties++;continue;}rays.push({target,p,d,distance:hit.distance});kinds.add(target.mesh.userData.component);break;
      }
    }
    assert.ok(rays.length>300);for(const kind of ['mapped-roof-panel','quarter-circle-copper-panel','skylight-north-glass','west-main-entrance-door'])assert.ok(kinds.has(kind),kind);
    sim.setFocus(far,true);sim.world.step();let error=0;for(const ray of rays){const hit=sim.castUnloadedTargets(ray.p,ray.d,1);assert.ok(hit?.object===ray.target.mesh,`unloaded mismatch ${ray.target.mesh.userData.component}/${hit?.object.userData.component}`);error=Math.max(error,Math.abs(hit.distance-ray.distance));}assert.ok(error<.025);reset();return {externalRays:rays.length,componentKinds:kinds.size,maximumDistanceDifference:error,seamTiesExcluded:ties,insideOriginsExcluded:true};
  });
  check('partial copper damage and complete destruction persist at distance and reset exactly',()=>{
    const target=sim.targets.find(t=>t.mesh.userData.component==='quarter-circle-copper-panel');sim.hit(target,100,up);model.update(near);const remaining=triangles();assert.ok(remaining>0&&remaining<originalTriangles);sim.setFocus(far,true);model.update(far);assert.equal(triangles(),remaining);reset();meshes.forEach((m,i)=>assert.deepEqual(m.geometry.attributes.position.array,original[i]));
    sim.explode(point(30,5,-25),160,100,up);model.update(near);assert.equal(triangles(),0);model.update(far);assert.equal(shell.visible,false);reset();assert.equal(triangles(),originalTriangles);meshes.forEach((m,i)=>assert.deepEqual(m.geometry.attributes.position.array,original[i]));return {removedCopperTriangles:originalTriangles-remaining,restoredTriangles:originalTriangles,restoredParts:sim.targets.length};
  });
  check('H reflection and callback offset preserve geometry and logical physics',()=>{
    const e=info.entry,p=point(e.x-1,2,e.z),d=axis.clone(),before=visual(p,d,2);assert.ok(before);scene.scale.z=-1;scene.updateMatrixWorld(true);const reflected=new THREE.Raycaster(H(p),H(d),0,2).intersectObjects(meshes,false)[0];assert.ok(reflected&&Math.abs(reflected.distance-before.distance)<.001);sim.setFocus(p,true);sim.world.step();const loaded=cast(p,d,2);sim.setFocus(far,true);const unloaded=sim.castUnloadedTargets(p,d,2);assert.ok(loaded&&unloaded&&loaded.object===unloaded.object&&Math.abs(loaded.distance-unloaded.distance)<.025);scene.scale.z=1;scene.updateMatrixWorld(true);reset();
    const liftedScene=new THREE.Scene();createMuseumLandmark(liftedScene,building,profile,(x,z)=>terrain.heightAt(x,z)+50);const lifted=liftedScene.children.find(o=>o.userData.role==='building-shell');for(let m=0;m<meshes.length;m++){const p=lifted.children[m].geometry.attributes.position.array;assert.equal(p.length,original[m].length);for(let i=0;i<p.length;i+=3){assert.ok(Math.abs(p[i]-original[m][i])<.001&&Math.abs(p[i+2]-original[m][i+2])<.001);assert.ok(Math.abs(p[i+1]-original[m][i+1]-50)<.001);}}
    const reverseScene=new THREE.Scene();createMuseumLandmark(reverseScene,{...building,points:building.points.slice().reverse()},profile,terrain.heightAt);const reverse=reverseScene.children.find(o=>o.userData.role==='building-shell');assert.deepEqual(reverse.userData.axis,info.axis);assert.deepEqual(reverse.userData.courtyard,info.courtyard);assert.ok(Math.abs(reverse.userData.localOrigin.y-base)<.001);return {reflectedRayDifference:Math.abs(reflected.distance-before.distance),logicalPhysicsUnchanged:true,elevationOffset:50,reversedWindingSameDatum:true};
  });
  console.log(`Museum checks ${results.length}/${results.length} passed. Geometry and Rapier only; no browser, GPU or physical-phone verification.`);
} finally {sim.world.removeCharacterController(sim.controller);sim.world.free();await writeFile(path.join(out,'results.json'),JSON.stringify({scope:'Actual model geometry and current DEM/Rapier only. Dimensions are estimates; no field survey, browser rendering or phone performance verification.',hashes,results},null,2)+'\n');}
