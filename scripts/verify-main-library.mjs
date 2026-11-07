import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), out = path.join(root, 'artifacts/main-library-test');
await mkdir(out, { recursive: true }); const hashes = {};
for (const filename of (await readdir(path.join(root, 'src'))).filter(n => n.endsWith('.ts'))) {
  const source = await readFile(path.join(root, 'src', filename), 'utf8'); hashes[filename] = createHash('sha256').update(source).digest('hex');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  await writeFile(path.join(out, filename.replace(/\.ts$/, '.mjs')), js.replace(/from (['"])(\.\/[\w-]+)\1/g, "from '$2.mjs'"));
}
const { createMainLibraryLandmark } = await import(pathToFileURL(path.join(out, 'mainLibraryLandmark.mjs')));
const { createLibraryLandmark } = await import(pathToFileURL(path.join(out, 'libraryLandmark.mjs')));
const { createTerrain } = await import(pathToFileURL(path.join(out, 'terrain.mjs')));
const { getBuildingAppearance } = await import(pathToFileURL(path.join(out, 'buildingAppearance.mjs')));
const { Simulation } = await import(pathToFileURL(path.join(out, 'physics.mjs')));
await RAPIER.init();
// 간판 캔버스만 대체한다. 실제 글자 렌더링은 브라우저에서 확인한다.
globalThis.document={createElement(tag){assert.equal(tag,'canvas');return {width:0,height:0,getContext(){return new Proxy({},{get(o,k){return o[k]??(()=>{});},set(o,k,v){o[k]=v;return true;}});}};}};
const data = JSON.parse(await readFile(path.join(root, 'public/data/campus.json'), 'utf8')), dem = JSON.parse(await readFile(path.join(root, 'public/data/terrain.json'), 'utf8'));
const building = data.buildings.find(b => b.id === 'way/148286730'), bridgeBuilding = data.buildings.find(b => b.id === 'way/329398175'), sourceSnapshot = JSON.stringify(building);
const scene = new THREE.Scene(), terrain = createTerrain(scene, dem, data.buildings), profile = getBuildingAppearance(building), model = createMainLibraryLandmark(scene, building, profile, terrain.heightAt);
const shell = scene.children.find(o => o.userData.role === 'building-shell'), info = shell.userData, meshes = shell.children.filter(o => o.isMesh), original = meshes.map(m => m.geometry.attributes.position.array.slice());
const base = info.localOrigin.y, axis = new THREE.Vector3(info.axis.x, 0, info.axis.z), front = new THREE.Vector3(-axis.z, 0, axis.x), up = new THREE.Vector3(0, 1, 0);
const point = (x, y, z) => new THREE.Vector3(info.localOrigin.x, base + y, info.localOrigin.z).addScaledVector(axis, x).addScaledVector(front, z);
const local = p => { const q = p.clone().sub(point(0, 0, 0)); return [q.dot(axis), q.y, q.dot(front)]; };
const near = point(0, 1.8, info.entrance.z + 7), far = new THREE.Vector3(100000, 500, 100000), sim = new Simulation(model.breakables, [], near, data.bounds, terrain), results = [];
function check(name, fn) { const details = fn(); results.push({ name, status: 'passed', ...details }); console.log(`PASS ${name} ${JSON.stringify(details)}`); }
function cast(p, d, distance) { const lookup = new Map(sim.targets.filter(t => t.body).map(t => [t.body.handle, t])); const hit = sim.world.castRay(new RAPIER.Ray(p, d), distance, true, undefined, undefined, undefined, undefined, c => lookup.has(c.parent()?.handle)); return hit ? { object: lookup.get(hit.collider.parent().handle).mesh, distance: hit.timeOfImpact } : null; }
function visual(p, d, distance) { scene.updateMatrixWorld(true); return new THREE.Raycaster(p, d, 0, distance).intersectObjects(meshes, false)[0] ?? null; }
function reset() { sim.reset(); sim.setFocus(near, true); sim.world.step(); model.update(near); }
function triangles() { if (!shell.visible) return 0; let n = 0; const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(); for (const mesh of meshes) { const p = mesh.geometry.attributes.position; for (let i = 0; i < p.count; i += 3) if (b.fromBufferAttribute(p, i + 1).sub(a.fromBufferAttribute(p, i)).cross(c.fromBufferAttribute(p, i + 2).sub(a)).lengthSq() > 1e-10) n++; } return n; }
function inside(x, z) { let yes = false; const ring = building.points; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) yes = !yes; } return yes; }
let originalTriangles;
try {
  reset();
  check('mapped outline, six visible levels and bounded merged render geometry', () => {
    assert.equal(JSON.stringify(building), sourceSnapshot); assert.deepEqual(info.mappedOutline, building.points.slice(0, -1)); assert.equal(meshes.length, 3); assert.equal(info.levels.upperWindowRows, 4); assert.equal(info.levels.lowerRecessedLevels, 2); assert.equal(info.mainRoofHeight, 28); assert.equal(info.rooftopOpenCourtyards, 0);
    assert.deepEqual([...new Set(sim.targets.filter(t => t.mesh.userData.component === 'upper-recessed-window-bay').map(t => t.mesh.userData.row))].sort(), [0, 1, 2, 3]);
    assert.ok(meshes.every(m => [...m.geometry.attributes.position.array].every(Number.isFinite))); assert.ok(sim.targets.every(t => t.size.toArray().every(v => v > 0 && Number.isFinite(v))));
    assert.ok(sim.targets.length < 800); originalTriangles = triangles(); assert.ok(originalTriangles < 40000);
    return { mappedPoints: info.mappedOutline.length, renderMeshes: meshes.length, parts: sim.targets.length, triangles: originalTriangles, mainRoofHeightEstimate: 28, maximumHeightWithRoofRooms: info.dimensions.height };
  });
  check('roof triangles and convex collisions preserve notches without invented courtyard holes', () => {
    const roofParts = sim.targets.filter(t => t.mesh.userData.component === 'mapped-roof-slab'); assert.ok(roofParts.length > 20 && roofParts.every(t => t.collisionVertices));
    const roofMeshes = roofParts.map(t => t.mesh); let insideSamples = 0, outsideSamples = 0;
    for (let x = 265; x <= 385; x += 4.9) for (let z = -855; z <= -730; z += 4.9) {
      const expected = inside(x, z), ray = new THREE.Raycaster(new THREE.Vector3(x, base + 29, z), up.clone().negate(), 0, 2), actual = ray.intersectObjects(roofMeshes, false).length > 0;
      assert.equal(actual, expected, `roof footprint mismatch ${x},${z}`); expected ? insideSamples++ : outsideSamples++;
    }
    for (const r of info.rooftopStructures) { const p = point(r.x, 34, r.z), hit = visual(p, up.clone().negate(), 10); assert.ok(hit && hit.point.y > base + 31, 'a roof room was converted into a courtyard hole'); }
    return { roofConvexParts: roofParts.length, insideSamples, outsideSamples, closedRooftopRooms: 2 };
  });
  check('shared terrain datum and new rooftop rooms clear the Gwanjeong bridge', () => {
    const bridgeScene = new THREE.Scene(); createLibraryLandmark(bridgeScene, bridgeBuilding, getBuildingAppearance(bridgeBuilding), terrain.heightAt);
    const bridge = bridgeScene.children.find(o => o.userData.role === 'building-shell').userData, ba = new THREE.Vector3(bridge.axis.x, 0, bridge.axis.z), bz = new THREE.Vector3(-ba.z, 0, ba.x), origin = new THREE.Vector3(bridge.localOrigin.x, bridge.localOrigin.y, bridge.localOrigin.z);
    assert.ok(Math.abs(base - bridge.localOrigin.y) < 1e-6); let minimum = Infinity, overlapSamples = 0, rooftopRoomOverlap = 0;
    for (const mesh of meshes) { const p = mesh.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i), q = v.clone().sub(origin), x = q.dot(ba), z = q.dot(bz); if (Math.abs(x) <= 60.5 && Math.abs(z) <= 15.35) { overlapSamples++; minimum = Math.min(minimum, origin.y + bridge.bridgeBottom - v.y); if (v.y > base + 28.6) rooftopRoomOverlap++; } } }
    assert.ok(overlapSamples > 100 && minimum > 2.20, `new main-library geometry enters bridge: ${minimum}`); assert.equal(rooftopRoomOverlap, 0);
    return { base, bridgeUnderside: base + bridge.bridgeBottom, overlappingVertexSamples: overlapSamples, minimumVerticalClearance: minimum, rooftopRoomOverlap };
  });
  check('deep upper frames face outward and lower glass clears the sloped terrain', () => {
    const mesh = meshes.find(m => m.name.endsWith('recessed-glazing')), p = mesh.geometry.attributes.position; let samples = 0, minimum = Infinity, frontNormals = 0, minimumNormal = Infinity;
    for (let i = 0; i < p.count; i += 3) {
      const tri = [0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(p, i + k));
      for (let a = 0; a <= 6; a++) for (let b = 0; b <= 6 - a; b++) { const v = tri[0].clone().multiplyScalar(1 - (a + b) / 6).addScaledVector(tri[1], a / 6).addScaledVector(tri[2], b / 6); minimum = Math.min(minimum, v.y - terrain.meshHeightAt(v.x, v.z)); samples++; }
      const centre = tri[0].clone().add(tri[1]).add(tri[2]).multiplyScalar(1 / 3), l = local(centre);
      if (l[1] > 8 && l[2] > 31.5 && Math.max(...tri.map(p => local(p)[2])) - Math.min(...tri.map(p => local(p)[2])) < .01) { const normal = tri[1].clone().sub(tri[0]).cross(tri[2].clone().sub(tri[0])).normalize(); minimumNormal = Math.min(minimumNormal, normal.dot(front)); frontNormals++; const hit = visual(centre.clone().addScaledVector(front, 1.1), front.clone().negate(), 1.5); assert.ok(hit && hit.object === mesh, `recessed glass is hidden: ${JSON.stringify({ local: l, hit: hit?.object.name, distance: hit?.distance })}`); }
    }
    assert.ok(minimum > -.015, `glass penetrates ground by ${-minimum}`); assert.ok(frontNormals > 30 && minimumNormal > .99);
    const frontBay = sim.targets.find(t => t.mesh.userData.component === 'upper-recessed-window-bay' && new THREE.Vector3().fromArray(t.mesh.userData.outward).dot(front) > .99);
    assert.ok(frontBay && frontBay.size.z > .65 && frontBay.size.z < .9);
    return { glassSamples: samples, minimumTerrainClearance: minimum, frontGlassTriangles: frontNormals, minimumOutwardNormalDot: minimumNormal, facadeDepth: frontBay.size.z };
  });
  check('side passages remain open and front door destruction changes capsule entry', () => {
    const sideWalks = [];
    for (const x of [-59, 59]) { const p = point(x, 6.4, 0), direction = axis.clone().multiplyScalar(x < 0 ? 1 : -1); sim.setFocus(p, true); sim.world.step(); assert.ok(cast(p, direction, 17) === null, 'side passage was filled by a large collision box'); assert.ok(visual(p, direction, 17) === null, 'side passage still contains a visible wall');
      const spawn = point(x, 0, 0); spawn.y = terrain.heightAt(spawn.x, spawn.z) + 1.7; sim.teleport(spawn); for (let i = 0; i < 300; i++) sim.step(1 / 60, direction.x * 2, direction.z * 2, false); const end = new THREE.Vector3().copy(sim.player.translation()), progress = end.clone().sub(spawn).dot(direction); assert.ok(progress > 8.5, `actual terrain blocks side passage at ${x}: ${progress}`); sideWalks.push({ side: x < 0 ? 'southwest' : 'northeast', progress });
    }
    const door = sim.targets.find(t => t.mesh.userData.component === 'low-front-entrance-glass'), start = point(0, 0, info.entrance.z + 5.7), spawn = start.clone(); spawn.y = terrain.heightAt(start.x, start.z) + 1.8;
    const direction = front.clone().negate();
    const walk = () => { sim.teleport(spawn); for (let i = 0; i < 240; i++) sim.step(1 / 60, direction.x * 2, direction.z * 2, false); const end = new THREE.Vector3().copy(sim.player.translation()); return { progress: end.clone().sub(start).dot(direction), height: end.y, groundGap: end.y - .85 - terrain.meshHeightAt(end.x, end.z) }; };
    const closed = walk(); sim.hit(door, 100, direction); model.update(near); const opened = walk(); assert.ok(closed.progress > 3 && closed.progress < 5.5, JSON.stringify(closed)); assert.ok(opened.progress > 7 && opened.groundGap > -.05, JSON.stringify(opened)); reset();
    return { sidePassages: 2, actualTerrainSideWalks: sideWalks, closedDoor: closed, destroyedDoor: opened };
  });
  check('loaded and unloaded exterior rays agree for facade and convex roof parts', () => {
    const rays = [], kinds = new Set(); let seamTies = 0;
    for (const target of sim.targets) {
      const sizes = target.size.toArray(), thin = sizes.indexOf(Math.min(...sizes)), normal = new THREE.Vector3(thin === 0 ? 1 : 0, thin === 1 ? 1 : 0, thin === 2 ? 1 : 0).applyQuaternion(target.mesh.quaternion);
      for (const sign of [-1, 1]) { const n = normal.clone().multiplyScalar(sign); let surface = target.mesh.position.clone().addScaledVector(n, sizes[thin] / 2);
        if (target.collisionVertices) { const vertices = target.mesh.geometry.attributes.position; let maximumArea = 0; for (let i = 0; i < vertices.count; i += 3) { const tri = [0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(vertices, i + k).applyMatrix4(target.mesh.matrixWorld)), cross = tri[1].clone().sub(tri[0]).cross(tri[2].clone().sub(tri[0])), area = cross.length(); if (area > maximumArea && cross.normalize().dot(n) > .9) { maximumArea = area; surface = tri[0].add(tri[1]).add(tri[2]).multiplyScalar(1 / 3); } } }
        const p = surface.addScaledVector(n, .7), d = n.negate(); sim.setFocus(p, true); sim.world.step(); const hit = cast(p, d, 1);
        if (hit?.object !== target.mesh || hit.distance < .5) continue;
        const hits = new THREE.Raycaster(p, d, 0, 1).intersectObjects(sim.targets.map(t => t.mesh), false), distinct = hits.filter((h, i, all) => all.findIndex(q => q.object === h.object) === i);
        if (distinct.length > 1 && Math.abs(distinct[0].distance - distinct[1].distance) < .0001) { seamTies++; continue; }
        rays.push({ target, p, d, distance: hit.distance }); kinds.add(target.mesh.userData.component); break;
      }
    }
    assert.ok(rays.length > 250); assert.ok(kinds.has('mapped-roof-slab') && kinds.has('low-front-entrance-glass') && kinds.has('upper-recessed-window-bay'));
    sim.setFocus(far, true); sim.world.step(); let error = 0; for (const ray of rays) { const hit = sim.castUnloadedTargets(ray.p, ray.d, 1); assert.ok(hit?.object === ray.target.mesh, `unloaded target differs: ${JSON.stringify({ expected: ray.target.mesh.userData.component, actual: hit?.object.userData.component, expectedPosition: ray.target.mesh.position.toArray(), actualPosition: hit?.object.position.toArray(), loadedDistance: ray.distance, unloadedDistance: hit?.distance })}`); error = Math.max(error, Math.abs(hit.distance - ray.distance)); }
    assert.ok(error < .025); reset(); return { externalRays: rays.length, componentKinds: kinds.size, maximumDistanceDifference: error, coincidentSeamTiesExcluded: seamTies, startsInsideCollidersExcluded: true };
  });
  check('partial and total destruction persist at distance and reset restores vertex buffers', () => {
    const target = sim.targets.find(t => t.mesh.userData.component === 'upper-recessed-window-bay'), normal = new THREE.Vector3().fromArray(target.mesh.userData.outward), p = target.mesh.position.clone().addScaledVector(normal, 1), d = normal.clone().negate(); sim.setFocus(p, true); sim.world.step(); assert.ok(cast(p, d, 1.5)?.object === target.mesh);
    sim.hit(target, 100, d); sim.world.step(); model.update(near); const remaining = triangles(); assert.ok(remaining > 0 && remaining < originalTriangles); assert.equal(cast(p, d, 1.5), null); sim.setFocus(far, true); model.update(far); assert.equal(triangles(), remaining); assert.equal(sim.castUnloadedTargets(p, d, 1.5), null);
    reset(); meshes.forEach((m, i) => assert.deepEqual(m.geometry.attributes.position.array, original[i])); sim.explode(point(0, 16, 0), 140, 100, up); model.update(near); assert.equal(triangles(), 0); model.update(far); assert.equal(shell.visible, false); reset(); assert.equal(triangles(), originalTriangles); meshes.forEach((m, i) => assert.deepEqual(m.geometry.attributes.position.array, original[i]));
    return { removedTriangles: originalTriangles - remaining, restoredTriangles: originalTriangles, restoredParts: sim.targets.length };
  });
  check('elevation callback and reversed outline preserve the shared datum and facade direction', () => {
    const liftedScene = new THREE.Scene(); createMainLibraryLandmark(liftedScene, building, profile, (x, z) => terrain.heightAt(x, z) + 50); const lifted = liftedScene.children.find(o => o.userData.role === 'building-shell');
    for (let m = 0; m < meshes.length; m++) { const p = lifted.children[m].geometry.attributes.position.array; assert.equal(p.length, original[m].length); for (let i = 0; i < p.length; i += 3) { assert.ok(Math.abs(p[i] - original[m][i]) < .001 && Math.abs(p[i + 2] - original[m][i + 2]) < .001); assert.ok(Math.abs(p[i + 1] - original[m][i + 1] - 50) < .001); } }
    const reversedScene = new THREE.Scene(); createMainLibraryLandmark(reversedScene, { ...building, points: building.points.slice().reverse() }, profile, terrain.heightAt); const reversed = reversedScene.children.find(o => o.userData.role === 'building-shell'); assert.ok(Math.abs(reversed.userData.localOrigin.y - base) < .001); assert.ok(Math.abs(reversed.userData.axis.x - axis.x) < .00001); assert.deepEqual(reversed.userData.rooftopStructures, info.rooftopStructures);
    const p = point(0, 1.6, info.entrance.z + 1), d = front.clone().negate(), before = visual(p, d, 2), after = new THREE.Raycaster(p, d, 0, 2).intersectObjects(reversed.children, false)[0]; assert.ok(before && after && Math.abs(before.distance - after.distance) < .001);
    return { callbackOffset: 50, reversedWindingSameDatumAndFront: true };
  });
  console.log(`Main library checks ${results.length}/${results.length} passed. Geometry and Rapier only; no browser, real GPU or physical-phone test.`);
} finally { sim.world.removeCharacterController(sim.controller); sim.world.free(); await writeFile(path.join(out, 'results.json'), JSON.stringify({ scope: 'Current source geometry, terrain and Rapier regression. No surveyed elevations, browser pixels, GPU benchmark or physical-phone verification.', hashes, results }, null, 2) + '\n'); }
