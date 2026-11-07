import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), artifacts = path.join(root, 'artifacts/baekhak-test');
await mkdir(artifacts, { recursive: true });
const hashes = {};
for (const filename of (await readdir(path.join(root, 'src'))).filter(name => name.endsWith('.ts'))) {
  const source = await readFile(path.join(root, 'src', filename), 'utf8'); hashes[filename] = createHash('sha256').update(source).digest('hex');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  await writeFile(path.join(artifacts, filename.replace(/\.ts$/, '.mjs')), compiled.replace(/from '(\.\/[\w-]+)'/g, "from '$1.mjs'"));
}
const { createTerrain } = await import(pathToFileURL(path.join(artifacts, 'terrain.mjs')).href);
const { getBuildingAppearance } = await import(pathToFileURL(path.join(artifacts, 'buildingAppearance.mjs')).href);
const { createBaekhakLandmark } = await import(pathToFileURL(path.join(artifacts, 'baekhakLandmark.mjs')).href);
const { Simulation } = await import(pathToFileURL(path.join(artifacts, 'physics.mjs')).href);
await RAPIER.init();

function collisionVerifier(sim) {
  const initialBodies = sim.world.bodies.len(), initialLoaded = new Set(sim.targets.filter(target => target.body));
  function spawn() {
    assert.equal(sim.world.bodies.len(), initialBodies, 'reset leaked or omitted a spawn-area body');
    const actualLoaded = new Set(sim.targets.filter(target => target.body));
    assert.ok(actualLoaded.size === initialLoaded.size && [...actualLoaded].every(target => initialLoaded.has(target)), 'reset changed the initial spawn load set');
  }
  function restored() {
    spawn();
    for (const target of sim.targets) {
      assert.ok(target.mesh.visible && target.hp === target.toughness);
      sim.setFocus(target.box.getCenter(new THREE.Vector3()), true); sim.world.step();
      assert.ok(target.body && target.body.numColliders() === 1, 'restored target lacks a local collision shape');
      const collider = target.body.collider(0);
      assert.equal(collider.shapeType(), target.collisionVertices ? RAPIER.ShapeType.ConvexPolyhedron : RAPIER.ShapeType.Cuboid);
      assert.ok(new THREE.Vector3().copy(target.body.translation()).distanceTo(target.mesh.position) < .001);
      if (!target.collisionVertices) assert.ok(new THREE.Vector3().copy(collider.halfExtents()).distanceTo(target.size.clone().multiplyScalar(.5)) < .001);
    }
    sim.setFocus(new THREE.Vector3(1000000, 1000000, 1000000), true);
    sim.setFocus(sim.spawn, true); sim.world.step(); spawn();
  }
  return { spawn, restored };
}

const data = JSON.parse(await readFile(path.join(root, 'public/data/campus.json'), 'utf8')), elevation = JSON.parse(await readFile(path.join(root, 'public/data/terrain.json'), 'utf8'));
const building = data.buildings.find(b => b.id === 'way/439707877'), neighbor = data.buildings.find(b => b.id === 'way/439707878'); assert.ok(building && neighbor);
const scene = new THREE.Scene(), terrain = createTerrain(scene, elevation, data.buildings), profile = getBuildingAppearance(building);
const model = createBaekhakLandmark(scene, building, profile, terrain.heightAt), shell = scene.children.find(o => o.userData.role === 'building-shell');
assert.ok(shell); const meshes = shell.children.filter(o => o.isMesh), originals = meshes.map(m => m.geometry.attributes.position.array.slice()), info = shell.userData;
const base = info.localOrigin.y, entry = new THREE.Vector3(info.entry.x, base, info.entry.z), outward = new THREE.Vector3().fromArray(info.entrance.outward), up = new THREE.Vector3(0, 1, 0), near = entry.clone().addScaledVector(outward, 8), far = new THREE.Vector3(100000, 500, 100000);
near.y = terrain.heightAt(near.x, near.z) + 1.7;
const sim = new Simulation(model.breakables, [], near, data.bounds, terrain), collisionState = collisionVerifier(sim), results = [];
function check(name, run) { const details = run(); results.push({ name, status: 'passed', ...details }); console.log(`PASS ${name} ${JSON.stringify(details ?? {})}`); }
function cast(position, direction, distance) {
  sim.setFocus(position, true); sim.world.step();
  const lookup = new Map(sim.targets.filter(t => t.body).map(t => [t.body.handle, t]));
  const hit = sim.world.castRay(new RAPIER.Ray(position, direction), distance, true, undefined, undefined, undefined, undefined, c => lookup.has(c.parent()?.handle));
  return hit ? { object: lookup.get(hit.collider.parent().handle).mesh, distance: hit.timeOfImpact } : null;
}
function visual(position, direction, distance) { return new THREE.Raycaster(position, direction, 0, distance).intersectObjects(meshes, false)[0] ?? null; }
function triangles() {
  if (!shell.visible) return 0; let count = 0; const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (const m of meshes) { const p = m.geometry.attributes.position; for (let i = 0; i < p.count; i += 3) if (b.fromBufferAttribute(p, i + 1).sub(a.fromBufferAttribute(p, i)).cross(c.fromBufferAttribute(p, i + 2).sub(a)).lengthSq() > 1e-10) count++; }
  return count;
}
function reset() { sim.reset(); collisionState.spawn(); sim.setFocus(near, true); model.update(near); sim.world.step(); }
const point = (x, y, z) => new THREE.Vector3(x, base + y, z);
let originalTriangles;
try {
  reset();
  check('official three floors, low stepped masses and northern curved brick upper volume', () => {
    assert.equal(info.documentedLevels, 3); assert.equal(info.levelsEstimated, false); assert.equal(info.heightEstimated, true); assert.equal(info.dimensions.height, 10.5); assert.equal(meshes.length, 2);
    const vertices = meshes.flatMap(m => Array.from({ length: m.geometry.attributes.position.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(m.geometry.attributes.position, i)));
    assert.ok(vertices.every(p => p.toArray().every(Number.isFinite))); const maxY = Math.max(...vertices.map(p => p.y)) - base; assert.ok(maxY > 10.49 && maxY < 10.51);
    assert.ok(info.roundUpper.z > info.localOrigin.z + 10); assert.ok(info.lowerTop < info.upperTop && info.upperTop < info.dimensions.height);
    assert.equal(sim.targets.filter(t => t.mesh.userData.component === 'rounded-dark-brick').length, 48);
    assert.ok(sim.targets.filter(t => t.mesh.userData.component.includes('yellow')).every(t => t.size.y < .22), 'yellow neighboring building mass was copied');
    assert.ok(Math.max(...vertices.map(p => p.x)) < Math.min(...neighbor.points.map(p => p[0])) - .6, 'model entered 941-1 footprint');
    assert.ok(sim.targets.every(t => t.size.toArray().every(v => v > 0 && Number.isFinite(v))));
    originalTriangles = triangles(); return { renderMeshes: meshes.length, parts: sim.targets.length, triangles: originalTriangles, heightEstimate: maxY, lowerRoof: info.lowerTop, upperRoof: info.upperTop, northRoundCenter: info.roundUpper };
  });
  check('map courtyard notch and curved upper sides are not giant collision boxes', () => {
    const notch = point(880, 18, -35); assert.ok(!(cast(notch, up.clone().negate(), 22))); assert.ok(!(visual(notch, up.clone().negate(), 22)));
    const r = info.roundUpper, outside = point(r.x + r.radiusX * .95, 8.6, r.z + r.radiusZ * .95);
    assert.ok(!(cast(outside, up, .4)), 'empty ellipse corner is blocked');
    assert.ok(cast(point(r.x + r.radiusX + 1, 8.6, r.z), new THREE.Vector3(-1, 0, 0), 2), 'rounded outer wall has no collision');
    assert.ok(sim.targets.filter(t => t.mesh.userData.component === 'rounded-upper-roof').every(t => t.collisionVertices), 'roof sectors reverted to rectangular proxies');
    return { courtyardOpen: true, emptyUpperCornerOpen: true, curvedRoofSectors: 24, polygonSagittaUpperBound: Math.max(r.radiusX, r.radiusZ) * (1 - Math.cos(Math.PI / 24)) };
  });
  check('photographed arch, sparse front windows and exterior frames remain visible', () => {
    const arch = sim.targets.filter(t => t.mesh.userData.component === 'arched-front-window'); assert.equal(arch.length, 1);
    const window = sim.targets.find(t => t.mesh.userData.component === 'entrance-glazing'), bounds = new THREE.Box3().setFromObject(window.mesh); assert.ok(bounds.getSize(new THREE.Vector3()).y > 2.5);
    const glass = visual(entry.clone().addScaledVector(outward, 1).addScaledVector(up, 1.4), outward.clone().negate(), 2); assert.ok(glass); assert.equal(glass.object.name, 'baekhak-glazing-roofs-trim');
    const along = new THREE.Vector3(-outward.z, 0, outward.x), frame = entry.clone().addScaledVector(along, info.entrance.width / 6).addScaledVector(up, 1.4).addScaledVector(outward, 1);
    const frameHit = visual(frame, outward.clone().negate(), 2); assert.ok(frameHit); assert.ok(frameHit.distance < .91, 'frame is hidden by glass');
    return { archWindows: arch.length, frontGlassDistance: glass.distance, frontFrameDistance: frameHit.distance };
  });
  check('actual glass clears the terrain and the capsule enters only after door destruction', () => {
    const colors = [0x718f8f, 0x6c9a99].map(c => new THREE.Color(c)); let minimum = Infinity, samples = 0;
    const mesh = meshes.find(m => m.name === 'baekhak-glazing-roofs-trim'), p = mesh.geometry.attributes.position, color = mesh.geometry.attributes.color;
    for (let i = 0; i < p.count; i += 3) {
      if (!colors.some(c => Math.abs(c.r - color.getX(i)) < 1e-6 && Math.abs(c.g - color.getY(i)) < 1e-6 && Math.abs(c.b - color.getZ(i)) < 1e-6)) continue;
      const tri = [0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(p, i + k));
      for (let u = 0; u <= 8; u++) for (let v = 0; v <= 8 - u; v++) { const q = tri[0].clone().multiplyScalar(1 - (u + v) / 8).addScaledVector(tri[1], u / 8).addScaledVector(tri[2], v / 8); minimum = Math.min(minimum, q.y - terrain.meshHeightAt(q.x, q.z)); samples++; }
    }
    assert.ok(minimum >= -.015, `glass enters terrain by ${-minimum}m`);
    const start = entry.clone().addScaledVector(outward, 2.2), spawn = start.clone(); spawn.y = terrain.heightAt(spawn.x, spawn.z) + 1.7; const direction = outward.clone().negate();
    const walk = () => { sim.teleport(spawn); for (let i = 0; i < 180; i++) sim.step(1 / 60, direction.x * 2, direction.z * 2, false); const p = sim.player.translation(); return { progress: (p.x - start.x) * direction.x + (p.z - start.z) * direction.z, gap: p.y - .85 - terrain.meshHeightAt(p.x, p.z) }; };
    const closed = walk(); assert.ok(closed.progress > .8 && closed.progress < 2, JSON.stringify(closed));
    const door = sim.targets.find(t => t.mesh.userData.component === 'entrance-glazing'); sim.hit(door, 100, direction); model.update(near); const open = walk(); assert.ok(open.progress > 4 && open.gap > -.05, JSON.stringify(open)); reset();
    return { glassSamples: samples, minimumGlassClearance: minimum, closedDoor: closed, destroyedDoor: open };
  });
  check('road eye-height sightlines distinguish terrain occlusion from glass penetration', () => {
    const candidates = [];
    for (const road of data.roads) for (let i = 0; i < road.points.length - 1; i++) {
      const a = road.points[i], b = road.points[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2));
      for (let j = 0; j <= n; j++) {
        const x = THREE.MathUtils.lerp(a[0], b[0], j / n), z = THREE.MathUtils.lerp(a[1], b[1], j / n), delta = new THREE.Vector3(x - entry.x, 0, z - entry.z), distance = delta.length();
        if (distance < 6 || distance > 60 || delta.dot(outward) < 3) continue;
        candidates.push({ roadId: road.id, x, z, distance });
      }
    }
    candidates.sort((a, b) => a.distance - b.distance);
    const selected = []; for (const q of candidates) { if (selected.every(p => Math.hypot(p.x - q.x, p.z - q.z) >= 3)) selected.push(q); if (selected.length === 12) break; }
    assert.equal(selected.length, 12);
    const target = entry.clone().addScaledVector(up, 1.6), views = selected.map(q => {
      const eye = new THREE.Vector3(q.x, terrain.heightAt(q.x, q.z) + 1.7, q.z), delta = target.clone().sub(eye), distance = delta.length(), direction = delta.normalize();
      const hit = new THREE.Raycaster(eye, direction, .01, distance - .05).intersectObject(terrain.mesh, false)[0];
      return { roadId: q.roadId, eye: eye.toArray(), target: target.toArray(), distance, terrainOccluded: !!hit, hit: hit?.point.toArray() ?? null };
    });
    assert.ok(views.some(q => !q.terrainOccluded), 'all nearby road approaches lose the entrance behind terrain');
    return { views: views.length, terrainClear: views.filter(q => !q.terrainOccluded).length, terrainOccluded: views.filter(q => q.terrainOccluded).length, scope: 'Actual terrain triangles only; neighboring buildings, fences, vegetation and browser pixels are not included.', samples: views };
  });
  check('external loaded and unloaded rays agree for box and convex roof parts', () => {
    const rays = [], components = new Set(); let coincidentSeams = 0;
    for (const target of sim.targets) {
      const sizes = target.size.toArray(), thin = sizes.indexOf(Math.min(...sizes)), normal = new THREE.Vector3(thin === 0 ? 1 : 0, thin === 1 ? 1 : 0, thin === 2 ? 1 : 0).applyQuaternion(target.mesh.quaternion);
      for (const sign of [-1, 1]) { const out = normal.clone().multiplyScalar(sign), position = target.mesh.position.clone().addScaledVector(out, sizes[thin] / 2 + .8), direction = out.negate(), hit = cast(position, direction, 1);
        if (hit?.object === target.mesh && hit.distance > .6) {
          const candidates = new THREE.Raycaster(position, direction, 0, 1).intersectObjects(sim.targets.map(t => t.mesh), false), distinct = candidates.filter((p, i, all) => all.findIndex(q => q.object === p.object) === i);
          if (distinct.length > 1 && Math.abs(distinct[0].distance - distinct[1].distance) < .0001) { coincidentSeams++; continue; }
          rays.push({ target, position, direction, expected: hit.distance }); components.add(target.mesh.userData.component); break;
        }
      }
    }
    assert.ok(rays.length > 150); for (const name of ['entrance-glazing', 'rounded-dark-brick', 'rounded-upper-roof', 'mapped-low-roof']) assert.ok(components.has(name));
    sim.setFocus(far, true); assert.ok(sim.targets.every(t => !t.body)); let maximum = 0;
    for (const ray of rays) { const hit = sim.castUnloadedTargets(ray.position, ray.direction, 1); assert.ok(hit?.object === ray.target.mesh, JSON.stringify({expected:ray.target.mesh.userData.component, actual:hit?.object.userData.component, expectedPosition:ray.target.mesh.position.toArray(), actualPosition:hit?.object.position.toArray(),loadedDistance:ray.expected,unloadedDistance:hit?.distance})); maximum = Math.max(maximum, Math.abs(hit.distance - ray.expected)); assert.ok(maximum < .025); }
    reset(); return { externalRays: rays.length, componentKinds: components.size, maximumDistanceDifference: maximum, coincidentSeamSamplesExcluded: coincidentSeams, excluded: 'Starts inside colliders, occluded targets and surfaces tied within 0.1 mm at shared corners are excluded.' };
  });
  check('a destroyed rounded wall leaves a real hole and the rest persists at distance', () => {
    const candidates = sim.targets.filter(t => t.mesh.userData.component === 'rounded-dark-brick'), selected = candidates.sort((a, b) => b.mesh.position.x - a.mesh.position.x)[0], retained = candidates.find(t => t.mesh.position.distanceTo(selected.mesh.position) > 8);
    const rayFor = t => { const outward = t.mesh.position.clone().sub(point(info.roundUpper.x, 0, info.roundUpper.z)); outward.y = 0; outward.normalize(); return { position: t.mesh.position.clone().addScaledVector(outward, 1), direction: outward.negate() }; };
    const removedRay = rayFor(selected), retainedRay = rayFor(retained); assert.equal(cast(removedRay.position, removedRay.direction, 1.5)?.object, selected.mesh);
    sim.hit(selected, 100, removedRay.direction); sim.world.step(); model.update(near);
    assert.ok(!(cast(removedRay.position, removedRay.direction, 1.5))); assert.ok(!(visual(removedRay.position, removedRay.direction, 1.5)));
    const remaining = triangles(); assert.ok(remaining > 0 && remaining < originalTriangles); sim.setFocus(far, true); model.update(far); assert.equal(triangles(), remaining);
    assert.ok(!(sim.castUnloadedTargets(removedRay.position, removedRay.direction, 1.5))); assert.equal(sim.castUnloadedTargets(retainedRay.position, retainedRay.direction, 1.5)?.object, retained.mesh);
    reset(); meshes.forEach((m, i) => assert.deepEqual(m.geometry.attributes.position.array, originals[i])); return { removedTriangles: originalTriangles - remaining, distantRemainsVisible: true };
  });
  check('complete destruction and reset restore original buffers and every live collider', () => {
    sim.explode(point(info.localOrigin.x, 5, info.localOrigin.z), 110, 100, up); model.update(near); assert.equal(triangles(), 0); assert.ok(sim.targets.every(t => !t.mesh.visible && !t.body));
    for (const player of [far, near, far]) { model.update(player); assert.equal(shell.visible, false); }
    reset(); assert.equal(triangles(), originalTriangles); assert.equal(sim.destroyed, 0); assert.equal(sim.debris.length, 0); collisionState.restored();
    meshes.forEach((m, i) => assert.deepEqual(m.geometry.attributes.position.array, originals[i])); return { restoredTargets: sim.targets.length };
  });
  check('terrain datum changes and reversed map winding preserve placement and exterior exposure', () => {
    const liftedScene = new THREE.Scene(); createBaekhakLandmark(liftedScene, building, profile, (x, z) => terrain.heightAt(x, z) + 50); const lifted = liftedScene.children.find(o => o.userData.role === 'building-shell');
    for (let j = 0; j < meshes.length; j++) { const p = lifted.children[j].geometry.attributes.position.array; assert.equal(p.length, originals[j].length); for (let i = 0; i < p.length; i += 3) { assert.ok(Math.abs(p[i] - originals[j][i]) < .001 && Math.abs(p[i + 2] - originals[j][i + 2]) < .001); assert.ok(Math.abs(p[i + 1] - originals[j][i + 1] - 50) < .001); } }
    const reversedScene = new THREE.Scene(); const reversedModel = createBaekhakLandmark(reversedScene, { ...building, points: building.points.slice().reverse() }, profile, terrain.heightAt); const reversed = reversedScene.children.find(o => o.userData.role === 'building-shell');
    assert.deepEqual(reversed.userData.entry, info.entry); assert.deepEqual(reversed.userData.roundUpper, info.roundUpper); assert.equal(reversedModel.breakables.filter(t => t.mesh.userData.component === 'arched-front-window').length, 1);
    const ray = new THREE.Raycaster(entry.clone().addScaledVector(outward, 1).addScaledVector(up, 1.4), outward.clone().negate(), 0, 2); const before = ray.intersectObjects(meshes, false)[0], after = ray.intersectObjects(reversed.children, false)[0]; assert.ok(before && after); assert.ok(Math.abs(before.distance - after.distance) < .001);
    return { callbackOffset: 50, windingInvariantEntranceAndNorthRound: true };
  });
  console.log(`Baekhak geometry and physics checks: ${results.length}/${results.length} passed. No browser or mobile hardware rendering was tested.`);
} finally { sim.world.free(); await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ scope: 'CPU geometry and Rapier regression only. Not a survey, browser rendering or mobile performance test.', hashes, results }, null, 2) + '\n'); }

