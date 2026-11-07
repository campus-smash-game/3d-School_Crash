import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), out = path.join(root, 'artifacts/administration-test');
await mkdir(out, { recursive: true }); const hashes = {};
for (const filename of (await readdir(path.join(root, 'src'))).filter(n => n.endsWith('.ts'))) {
  const source = await readFile(path.join(root, 'src', filename), 'utf8'); hashes[filename] = createHash('sha256').update(source).digest('hex');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  await writeFile(path.join(out, filename.replace(/\.ts$/, '.mjs')), js.replace(/from (['"])(\.\/[\w-]+)\1/g, "from '$2.mjs'"));
}
const { createAdministrationLandmark } = await import(pathToFileURL(path.join(out, 'administrationLandmark.mjs')));
const { createTerrain } = await import(pathToFileURL(path.join(out, 'terrain.mjs')));
const { getBuildingAppearance } = await import(pathToFileURL(path.join(out, 'buildingAppearance.mjs')));
const { Simulation } = await import(pathToFileURL(path.join(out, 'physics.mjs')));
const { dataToRenderPoint: H } = await import(pathToFileURL(path.join(out, 'coordinates.mjs')));
await RAPIER.init();
const data = JSON.parse(await readFile(path.join(root, 'public/data/campus.json'), 'utf8')), dem = JSON.parse(await readFile(path.join(root, 'public/data/terrain.json'), 'utf8'));
const building = data.buildings.find(b => b.id === 'way/167609409'), originalData = JSON.stringify({ building, dem });
const scene = new THREE.Scene(), terrain = createTerrain(scene, dem, data.buildings), profile = getBuildingAppearance(building), model = createAdministrationLandmark(scene, building, profile, terrain.heightAt);
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
  check('official five floors and B1 remain distinct from estimated height and facade rows', () => {
    assert.equal(JSON.stringify({ building, dem }), originalData); assert.deepEqual(info.mappedOutline, building.points.slice(0, -1)); assert.equal(meshes.length, 3); assert.equal(info.levels.aboveGround, 5); assert.equal(info.levels.belowGround, 1); assert.equal(info.levels.upperWindowRows, 3); assert.equal(info.levels.lowerRecessedLevels, 2); assert.equal(info.heightEstimated, true); assert.equal(info.dimensions.height, 20);
    assert.deepEqual([...new Set(sim.targets.filter(t => t.mesh.userData.component === 'upper-grid-window-bay').map(t => t.mesh.userData.row))].sort(), [0, 1, 2]);
    assert.ok(meshes.every(m => [...m.geometry.attributes.position.array].every(Number.isFinite))); assert.ok(sim.targets.every(t => t.size.toArray().every(v => v > 0 && Number.isFinite(v))));
    originalTriangles = triangles(); assert.ok(sim.targets.length < 500 && originalTriangles < 30000);
    return { mappedPoints: info.mappedOutline.length, renderMeshes: meshes.length, parts: sim.targets.length, triangles: originalTriangles, estimatedHeight: info.dimensions.height, basementInteriorModeled: info.basementInteriorModeled };
  });
  check('roof and upper slab preserve actual outline with matching convex colliders', () => {
    const roof = sim.targets.filter(t => t.mesh.userData.component === 'mapped-roof-slab'), floor = sim.targets.filter(t => t.mesh.userData.component === 'upper-floor-slab'); assert.ok(roof.length > 20 && roof.every(t => t.collisionVertices)); assert.equal(floor.length, roof.length);
    let insideSamples = 0, outsideSamples = 0;
    for (let x = 208; x < 300; x += 3.7) for (let z = -754; z < -664; z += 3.7) { const expected = inside(x, z), ray = new THREE.Raycaster(new THREE.Vector3(x, base + 21, z), up.clone().negate(), 0, 2), actual = ray.intersectObjects(roof.map(t => t.mesh), false).length > 0; assert.equal(actual, expected, `roof footprint mismatch ${x},${z}`); expected ? insideSamples++ : outsideSamples++; }
    return { roofConvexParts: roof.length, upperFloorConvexParts: floor.length, insideSamples, outsideSamples };
  });
  check('photographed roof covers retain their silhouette without filling square bounding-box corners', () => {
    const covers = sim.targets.filter(t => t.mesh.userData.roofCover); assert.equal(covers.length, 4); assert.ok(covers.every(t => t.collisionVertices)); assert.equal(covers.filter(t => t.mesh.userData.component === 'roof-round-cover').length, 3);
    let emptyCornerRays = 0;
    for (const cover of info.rooftopCovers) {
      const p = point(cover.x, 23, cover.z), hit = visual(p, up.clone().negate(), 4); assert.ok(hit && Math.abs(hit.point.y - base - 19.65 - cover.rise) < .001);
      const corner = point(cover.x + cover.radius * .9, 23, cover.z + cover.radius * .9), ray = new THREE.Raycaster(corner, up.clone().negate(), 0, 3.2); assert.equal(ray.intersectObjects(covers.map(t => t.mesh), false).length, 0); emptyCornerRays++;
    }
    return { roundCovers: 3, angledCovers: 1, convexParts: covers.length, emptyCornerRays, maximumHeightEstimate: info.maximumHeightWithCovers };
  });
  check('recessed glass clears actual terrain and deep front frames expose the window face', () => {
    const mesh = meshes.find(m => m.name.endsWith('recessed-glazing')), p = mesh.geometry.attributes.position; let samples = 0, minimum = Infinity, frontNormals = 0, minimumNormal = Infinity;
    for (let i = 0; i < p.count; i += 3) { const tri = [0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(p, i + k)); for (let a = 0; a <= 6; a++) for (let b = 0; b <= 6 - a; b++) { const v = tri[0].clone().multiplyScalar(1 - (a + b) / 6).addScaledVector(tri[1], a / 6).addScaledVector(tri[2], b / 6); minimum = Math.min(minimum, v.y - terrain.meshHeightAt(v.x, v.z)); samples++; }
      const centre = tri[0].clone().add(tri[1]).add(tri[2]).multiplyScalar(1 / 3), l = local(centre);
      if (l[1] > 7 && l[2] > 6.5) { const normal = tri[1].clone().sub(tri[0]).cross(tri[2].clone().sub(tri[0])).normalize(); minimumNormal = Math.min(minimumNormal, normal.dot(front)); frontNormals++; const hit = visual(centre.clone().addScaledVector(front, 1.4), front.clone().negate(), 1.6); assert.ok(hit && hit.object === mesh, `glass behind solid frame: ${hit?.object.name}`); }
    }
    const bay = sim.targets.find(t => t.mesh.userData.component === 'upper-grid-window-bay' && new THREE.Vector3().fromArray(t.mesh.userData.outward).dot(front) > .99);
    assert.ok(minimum > .06, `glass terrain intrusion: ${minimum}`); assert.ok(frontNormals > 40 && minimumNormal > .99); assert.ok(bay.size.z > 1 && bay.size.z < 1.2);
    return { glassSamples: samples, minimumTerrainClearance: minimum, frontGlassTriangles: frontNormals, minimumOutwardNormalDot: minimumNormal, facadeDepth: bay.size.z };
  });
  check('open southwest passage permits model rays and actual terrain capsule traversal', () => {
    const start = point(info.passage.centerX, 2.4, info.passage.frontZ + 1), direction = front.clone().negate(), length = info.passage.frontZ - info.passage.backZ + 2;
    sim.setFocus(start, true); sim.world.step(); assert.equal(cast(start, direction, length), null); assert.equal(visual(start, direction, length), null);
    const spawn = point(info.passage.centerX, 0, info.passage.frontZ + 9); spawn.y = terrain.heightAt(spawn.x, spawn.z) + 1.7;
    sim.teleport(spawn); for (let i = 0; i < 1140; i++) sim.step(1 / 60, direction.x * 2, direction.z * 2, false);
    const end = new THREE.Vector3().copy(sim.player.translation()), progress = end.clone().sub(spawn).dot(direction), groundGap = end.y - .85 - terrain.meshHeightAt(end.x, end.z);
    assert.ok(progress > 33, `passage capsule blocked after ${progress}m`); assert.ok(groundGap > -.05); reset();
    return { passageWidthEstimate: info.passage.maxX - info.passage.minX, clearRayLength: length, capsuleProgress: progress, capsuleGroundGap: groundGap };
  });
  check('central glass door blocks the player until destroyed', () => {
    const door = sim.targets.find(t => t.mesh.userData.component === 'central-entrance-door'), start = point(0, 0, info.entrance.approach.endZ + .5), spawn = start.clone(), direction = front.clone().negate(); spawn.y = terrain.heightAt(spawn.x, spawn.z) + 1.7;
    const walk = () => { sim.teleport(spawn); for (let i = 0; i < 420; i++) sim.step(1 / 60, direction.x * 2, direction.z * 2, false); const end = new THREE.Vector3().copy(sim.player.translation()); return { progress: end.clone().sub(start).dot(direction), groundGap: end.y - .85 - terrain.meshHeightAt(end.x, end.z) }; };
    const closed = walk(); sim.hit(door, 100, direction); model.update(near); const opened = walk(); assert.ok(closed.progress > 8 && closed.progress < 11.2, JSON.stringify(closed)); assert.ok(opened.progress > closed.progress + 2 && opened.groundGap > -.05, JSON.stringify(opened)); reset(); return { closed, destroyed: opened };
  });
  check('loaded and unloaded exterior rays agree for window bays and convex slabs', () => {
    const rays = [], kinds = new Set(); let seamTies = 0;
    for (const target of sim.targets) { const sizes = target.size.toArray(), thin = sizes.indexOf(Math.min(...sizes)), normal = new THREE.Vector3(thin === 0 ? 1 : 0, thin === 1 ? 1 : 0, thin === 2 ? 1 : 0).applyQuaternion(target.mesh.quaternion);
      for (const sign of [-1, 1]) { const n = normal.clone().multiplyScalar(sign); let surface = target.mesh.position.clone().addScaledVector(n, sizes[thin] / 2);
        if (target.collisionVertices) { const vertices = target.mesh.geometry.attributes.position; let maximumArea = 0; for (let i = 0; i < vertices.count; i += 3) { const tri = [0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(vertices, i + k).applyMatrix4(target.mesh.matrixWorld)), cross = tri[1].clone().sub(tri[0]).cross(tri[2].clone().sub(tri[0])), area = cross.length(); if (area > maximumArea && cross.normalize().dot(n) > .9) { maximumArea = area; surface = tri[0].add(tri[1]).add(tri[2]).multiplyScalar(1 / 3); } } }
        const p = surface.addScaledVector(n, .7), d = n.negate(); sim.setFocus(p, true); sim.world.step(); const hit = cast(p, d, 1); if (hit?.object !== target.mesh || hit.distance < .5) continue;
        const hits = new THREE.Raycaster(p, d, 0, 1).intersectObjects(sim.targets.map(t => t.mesh), false), distinct = hits.filter((h, i, all) => all.findIndex(q => q.object === h.object) === i); if (distinct.length > 1 && Math.abs(distinct[0].distance - distinct[1].distance) < .0001) { seamTies++; continue; }
        rays.push({ target, p, d, distance: hit.distance }); kinds.add(target.mesh.userData.component); break;
      }
    }
    assert.ok(rays.length > 150); assert.ok(kinds.has('mapped-roof-slab') && kinds.has('central-entrance-door') && kinds.has('upper-grid-window-bay'));
    sim.setFocus(far, true); sim.world.step(); let error = 0; for (const ray of rays) { const hit = sim.castUnloadedTargets(ray.p, ray.d, 1); assert.ok(hit?.object === ray.target.mesh, `unloaded target differs: ${JSON.stringify({ expected: ray.target.mesh.userData.component, actual: hit?.object.userData.component, loadedDistance: ray.distance, unloadedDistance: hit?.distance })}`); error = Math.max(error, Math.abs(hit.distance - ray.distance)); }
    assert.ok(error < .025); reset(); return { externalRays: rays.length, componentKinds: kinds.size, maximumDistanceDifference: error, coincidentSeamTiesExcluded: seamTies, startsInsideCollidersExcluded: true };
  });
  check('partial and total destruction persist at distance and reset restores exact geometry', () => {
    const target = sim.targets.find(t => t.mesh.userData.component === 'upper-grid-window-bay'), normal = new THREE.Vector3().fromArray(target.mesh.userData.outward), p = target.mesh.position.clone().addScaledVector(normal, 1), d = normal.clone().negate(); sim.setFocus(p, true); sim.world.step(); assert.ok(cast(p, d, 1.5)?.object === target.mesh);
    sim.hit(target, 100, d); sim.world.step(); model.update(near); const remaining = triangles(); assert.ok(remaining > 0 && remaining < originalTriangles); assert.equal(cast(p, d, 1.5), null); sim.setFocus(far, true); model.update(far); assert.equal(triangles(), remaining); assert.equal(sim.castUnloadedTargets(p, d, 1.5), null);
    reset(); meshes.forEach((m, i) => assert.deepEqual(m.geometry.attributes.position.array, original[i])); sim.explode(point(0, 10, 0), 100, 100, up); model.update(near); assert.equal(triangles(), 0); model.update(far); assert.equal(shell.visible, false); reset(); assert.equal(triangles(), originalTriangles); meshes.forEach((m, i) => assert.deepEqual(m.geometry.attributes.position.array, original[i])); return { removedTriangles: originalTriangles - remaining, restoredTriangles: originalTriangles, restoredParts: sim.targets.length };
  });
  check('H reflection preserves logical physics and places the passage on the photographic right', () => {
    const eye = point(0, 10, info.passage.frontZ + 60), target = point(0, 10, info.passage.frontZ), renderEye = H(eye), renderDirection = H(target).sub(renderEye).normalize(), right = renderDirection.clone().cross(up).normalize();
    const passageRight = H(point(info.passage.centerX, 2, info.passage.frontZ)).sub(H(point(0, 2, info.passage.frontZ))).dot(right); assert.ok(passageRight > 16);
    const p = point(0, 1.8, info.entrance.z + 1), d = front.clone().negate(), before = visual(p, d, 2); assert.ok(before);
    scene.scale.z = -1; scene.updateMatrixWorld(true); const reflected = new THREE.Raycaster(H(p), H(d), 0, 2).intersectObjects(meshes, false)[0]; assert.ok(reflected && Math.abs(before.distance - reflected.distance) < .001);
    sim.setFocus(p, true); sim.world.step(); const loaded = cast(p, d, 2); sim.setFocus(far, true); const unloaded = sim.castUnloadedTargets(p, d, 2); assert.ok(loaded && unloaded && loaded.object === unloaded.object && Math.abs(loaded.distance - unloaded.distance) < .025);
    scene.scale.z = 1; scene.updateMatrixWorld(true); reset(); return { photographicRightDisplacement: passageRight, reflectedRayDistanceDifference: Math.abs(before.distance - reflected.distance), logicalPhysicsUnchanged: true };
  });
  check('elevation callback and reversed outline preserve front orientation', () => {
    const liftedScene = new THREE.Scene(); createAdministrationLandmark(liftedScene, building, profile, (x, z) => terrain.heightAt(x, z) + 50); const lifted = liftedScene.children.find(o => o.userData.role === 'building-shell');
    for (let m = 0; m < meshes.length; m++) { const p = lifted.children[m].geometry.attributes.position.array; assert.equal(p.length, original[m].length); for (let i = 0; i < p.length; i += 3) { assert.ok(Math.abs(p[i] - original[m][i]) < .001 && Math.abs(p[i + 2] - original[m][i + 2]) < .001); assert.ok(Math.abs(p[i + 1] - original[m][i + 1] - 50) < .001); } }
    const reversedScene = new THREE.Scene(); createAdministrationLandmark(reversedScene, { ...building, points: building.points.slice().reverse() }, profile, terrain.heightAt); const reversed = reversedScene.children.find(o => o.userData.role === 'building-shell'); assert.ok(Math.abs(reversed.userData.localOrigin.y - base) < .001); assert.ok(Math.abs(reversed.userData.axis.x - axis.x) < .00001); for (const [key, value] of Object.entries(info.passage)) { if (typeof value === 'number') assert.ok(Math.abs(reversed.userData.passage[key] - value) < 1e-8); else assert.equal(reversed.userData.passage[key], value); }
    const p = point(0, 1.6, info.entrance.z + 1), d = front.clone().negate(), before = visual(p, d, 2), after = new THREE.Raycaster(p, d, 0, 2).intersectObjects(reversed.children, false)[0]; assert.ok(before && after && Math.abs(before.distance - after.distance) < .001); return { callbackOffset: 50, reversedWindingSameDatumAndFront: true };
  });
  console.log(`Administration checks ${results.length}/${results.length} passed. Geometry and Rapier only; no browser, GPU benchmark or physical-phone test.`);
} finally { sim.world.removeCharacterController(sim.controller); sim.world.free(); await writeFile(path.join(out, 'results.json'), JSON.stringify({ scope: 'Current geometry, actual DEM and Rapier regression. No surveyed dimensions, browser rendering or physical-phone performance verification.', hashes, results }, null, 2) + '\n'); }
