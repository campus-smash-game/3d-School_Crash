import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, 'artifacts/admissions-test');
await mkdir(artifacts, { recursive: true });
const hashes = {};
for (const filename of (await readdir(path.join(root, 'src'))).filter(name => name.endsWith('.ts'))) {
  const source = await readFile(path.join(root, 'src', filename), 'utf8');
  hashes[filename] = createHash('sha256').update(source).digest('hex');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  await writeFile(path.join(artifacts, filename.replace(/\.ts$/, '.mjs')), compiled.replace(/from '(\.\/[\w-]+)'/g, "from '$1.mjs'"));
}
const { createTerrain } = await import(pathToFileURL(path.join(artifacts, 'terrain.mjs')).href);
const { getBuildingAppearance } = await import(pathToFileURL(path.join(artifacts, 'buildingAppearance.mjs')).href);
const { createAdmissionsLandmark } = await import(pathToFileURL(path.join(artifacts, 'admissionsLandmark.mjs')).href);
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

const data = JSON.parse(await readFile(path.join(root, 'public/data/campus.json'), 'utf8'));
const elevation = JSON.parse(await readFile(path.join(root, 'public/data/terrain.json'), 'utf8'));
const building = data.buildings.find(b => b.id === 'way/386891016');
assert.ok(building);
const scene = new THREE.Scene(), terrain = createTerrain(scene, elevation, data.buildings);
const profile = getBuildingAppearance(building);
const model = createAdmissionsLandmark(scene, building, profile, terrain.heightAt);
const shell = scene.children.find(o => o.userData.buildingId === building.id && o.userData.role === 'building-shell');
assert.ok(shell);
const meshes = shell.children.filter(o => o.isMesh), originals = meshes.map(m => m.geometry.attributes.position.array.slice());
const { localOrigin, axis, dimensions, centralHalf, recessInner, recessOuter, recessDepth, bodyTop } = shell.userData;
const origin = new THREE.Vector3(localOrigin.x, localOrigin.y, localOrigin.z), right = new THREE.Vector3(axis.x, 0, axis.z), back = new THREE.Vector3(-axis.z, 0, axis.x), up = new THREE.Vector3(0, 1, 0), front = back.clone().negate();
const local = (x, y, z) => origin.clone().addScaledVector(right, x).addScaledVector(back, z).addScaledVector(up, y);
const near = local(0, 1.7, -8), far = new THREE.Vector3(100000, 500, 100000);
const sim = new Simulation(model.breakables, [], near, data.bounds, terrain);
const collisionState = collisionVerifier(sim);
const targetByBody = () => new Map(sim.targets.filter(t => t.body).map(t => [t.body.handle, t]));
const results = [];
function check(name, run) { const detail = run(); results.push({ name, status: 'passed', ...detail }); console.log(`PASS ${name} ${JSON.stringify(detail ?? {})}`); }
function cast(position, direction, distance) {
  sim.setFocus(position, true); sim.world.step();
  const lookup = targetByBody();
  const hit = sim.world.castRay(new RAPIER.Ray(position, direction), distance, true, undefined, undefined, undefined, undefined, collider => lookup.has(collider.parent()?.handle));
  return hit ? { object: lookup.get(hit.collider.parent().handle).mesh, distance: hit.timeOfImpact } : null;
}
function visual(position, direction, distance) { return new THREE.Raycaster(position, direction, 0, distance).intersectObjects(meshes, false)[0] ?? null; }
function triangles() {
  if (!shell.visible) return 0;
  let n = 0; const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (const mesh of meshes) { const p = mesh.geometry.attributes.position; for (let i = 0; i < p.count; i += 3) if (b.fromBufferAttribute(p, i + 1).sub(a.fromBufferAttribute(p, i)).cross(c.fromBufferAttribute(p, i + 2).sub(a)).lengthSq() > 1e-10) n++; }
  return n;
}
function reset() { sim.reset(); collisionState.spawn(); sim.setFocus(near, true); model.update(near); sim.world.step(); }
let originalTriangles, selected, selectedRay, retained, retainedRay;
try {
  reset();
  check('mapped L footprint, official five floors and three bounded render meshes', () => {
    assert.equal(building.levels, 5); assert.equal(shell.userData.levels, 5); assert.equal(shell.userData.levelsEstimated, false);
    assert.equal(shell.userData.heightEstimated, true); assert.equal(dimensions.height, 17.5); assert.equal(meshes.length, 3);
    assert.equal(shell.userData.roofBays.length, 2);
    assert.ok(model.breakables.every(p => p.size.toArray().every(v => v > 0 && Number.isFinite(v)) && p.mesh.parent === null));
    const vertices = meshes.flatMap(m => Array.from({ length: m.geometry.attributes.position.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(m.geometry.attributes.position, i)));
    assert.ok(vertices.every(v => v.toArray().every(Number.isFinite)));
    const highest = Math.max(...vertices.map(v => v.y)) - origin.y; assert.ok(highest <= 17.51 && highest > 17.3);
    assert.ok(!(cast(local(-dimensions.length * .3, 25, dimensions.depth * .85), up.clone().negate(), 30)), 'northwest map notch was filled by a giant collision box');
    assert.ok(!(visual(local(-dimensions.length * .3, 25, dimensions.depth * .85), up.clone().negate(), 30)), 'northwest map notch was filled by roof geometry');
    originalTriangles = triangles();
    return { parts: model.breakables.length, meshes: meshes.length, triangles: originalTriangles, width: dimensions.length, depth: dimensions.depth, estimatedTop: highest, officialFloors: 5 };
  });
  check('two shallow curved roofs remain higher in the middle and split into local panels', () => {
    assert.equal(sim.targets.filter(t => t.mesh.userData.component === 'curved-metal-roof').length, 48);
    const samples = [];
    for (const bay of shell.userData.roofBays) {
      const mid = (bay.x0 + bay.x1) / 2, z = (bay.z0 + bay.z1) / 2;
      const height = x => { const hit = visual(local(x, 23, z), up.clone().negate(), 15); assert.ok(hit); return 23 - hit.distance; };
      const center = height(mid), left = height(bay.x0 + .1), rightEdge = height(bay.x1 - .1);
      assert.ok(center > left + .3 && center > rightEdge + .3, 'curved roof became flat or inverted'); samples.push({ center, left, right: rightEdge });
    }
    return { roofPanels: 48, samples };
  });
  check('central entry and recessed balconies keep their real open depth', () => {
    const samples = [];
    for (const x of [0, -(recessInner + recessOuter) / 2, (recessInner + recessOuter) / 2]) {
      assert.ok(!(cast(local(x, 1.7, -.5), back, 2.2)), 'open forecourt became a solid bounding box');
      const hit = cast(local(x, 1.7, -.5), back, 4); assert.ok(hit); assert.ok(hit.distance > 2.5 && hit.distance < 2.8);
      samples.push(hit.distance);
    }
    for (const side of [-1, 1]) {
      const x = side * (recessInner + recessOuter) / 2;
      assert.ok(!(cast(local(x, bodyTop / 5 + 1.7, -.5), back, 2.2)), 'balcony recess was blocked above the railing');
    }
    const door = sim.targets.find(t => t.mesh.userData.component === 'entry-glazing');
    const approach = local(0, 0, -1), spawn = approach.clone(); spawn.y = terrain.heightAt(spawn.x, spawn.z) + 1.7;
    const walk = () => {
      sim.teleport(spawn);
      for (let i = 0; i < 180; i++) sim.step(1 / 60, back.x * 2, back.z * 2, false);
      const p = sim.player.translation(); return { progress: (p.x - approach.x) * back.x + (p.z - approach.z) * back.z, groundGap: p.y - .85 - terrain.meshHeightAt(p.x, p.z) };
    };
    const closedWalk = walk(); assert.ok(closedWalk.progress > 1.5 && closedWalk.progress < 2.9, 'capsule cannot approach the recessed closed doorway ' + JSON.stringify(closedWalk));
    sim.hit(door, 100, back); sim.world.step(); model.update(near);
    assert.ok(!(cast(local(0, 1.7, -.5), back, 5)), 'broken door leaves an invisible entrance wall');
    const openWalk = walk(); assert.ok(openWalk.progress > 3.8 && openWalk.groundGap > -.04, 'capsule cannot cross the destroyed entrance ' + JSON.stringify({closedWalk,openWalk}));
    reset(); return { facadeToBackGlazing: samples, modelRecessDepth: recessDepth, walkableForecourtWidth: centralHalf * 2, capsuleClosed: closedWalk, capsuleAfterDestruction: openWalk };
  });
  check('brick perforations and front frames are geometric rather than a repeated facade texture', () => {
    assert.equal(sim.targets.filter(t => t.mesh.userData.component === 'perforated-brick-screen').length, 8);
    const mid = (-dimensions.length / 2 - recessOuter) / 2, low = bodyTop / 5 + .98;
    const left = mid - 1.48 / 2, h = 1.42 / 7, w = 1.48 / 7;
    const hole = visual(local(left + w * .5, low + h * .5, -1), back, 2);
    const bar = visual(local(left, low + h * .5, -1), back, 2);
    assert.ok(hole && bar); assert.ok(hole.distance > bar.distance + .20, 'perforations have no actual depth');
    const frameX = (-centralHalf + .05) + (2 * centralHalf - .10) / 3;
    const frameHit = visual(local(frameX, bodyTop / 5 + .6, -1), back, 2);
    assert.ok(frameHit?.object.name.endsWith('roofs-and-frames'), 'central frame is hidden behind its glass');
    return { perforatedScreens: 8, holeDepthFromBar: hole.distance - bar.distance, frameVisibleOutside: true };
  });
  check('all thirteen building-number strokes and upper-room frames are exposed outside the facade', () => {
    const digits = [[1, 2], [0, 5, 6, 2, 3], [0, 1, 2, 3, 4, 5]], distances = [];
    for (let digit = 0; digit < digits.length; digit++) for (const segment of digits[digit]) {
      let x = -dimensions.length * .37 + digit * .40, y = bodyTop - .58;
      if ([0, 3, 6].includes(segment)) y += segment === 0 ? .25 : segment === 3 ? -.25 : 0;
      else { x += [1, 2].includes(segment) ? .14 : -.14; y += [1, 5].includes(segment) ? .125 : -.125; }
      const hit = visual(local(x, y, -1), back, 2), collision = cast(local(x, y, -1), back, 2);
      assert.equal(hit?.object.name, 'admissions-roofs-and-frames'); assert.ok(hit.distance < .85, 'number lies behind brick');
      assert.equal(collision?.object.userData.component, 'building-number-150'); distances.push(hit.distance);
    }
    assert.equal(distances.length, 13);
    for (const bay of shell.userData.roofBays) {
      const x = bay.x0 + .35 + .13, y = (bodyTop + .1 + 17.5 - 1.25) / 2;
      const hit = visual(local(x, y, -1), back, 2); assert.equal(hit?.object.name, 'admissions-roofs-and-frames'); assert.ok(hit.distance < 1.15);
      const rearHit = visual(local(x, y, bay.z1 + .65), front, 2); assert.equal(rearHit?.object.name, 'admissions-roofs-and-frames'); assert.ok(rearHit.distance < 1.05, 'rear frame lies behind rear glazing');
    }
    return { exposedNumberSegments: distances.length, frontOfBrickMeters: 1 - Math.max(...distances), upperRoomFramesVisibleOutside: true };
  });
  check('loaded physics and unloaded oriented target rays agree for external starts', () => {
    const rays = [], kinds = new Set();
    for (const target of sim.targets) {
      const sizes = target.size.toArray(), thin = sizes.indexOf(Math.min(...sizes));
      const unit = new THREE.Vector3(thin === 0 ? 1 : 0, thin === 1 ? 1 : 0, thin === 2 ? 1 : 0).applyQuaternion(target.mesh.quaternion);
      for (const sign of [-1, 1]) {
        const outward = unit.clone().multiplyScalar(sign), position = target.mesh.position.clone().addScaledVector(outward, sizes[thin] / 2 + .7), direction = outward.negate();
        const hit = cast(position, direction, .9);
        if (hit?.object === target.mesh && hit.distance > .5) { rays.push({ target, position, direction, distance: .9, expected: hit.distance }); kinds.add(target.mesh.userData.component); break; }
      }
    }
    assert.ok(rays.length > 200);
    for (const name of ['curved-metal-roof', 'recess-back-glazing', 'central-curtain', 'front-brick-panel']) assert.ok(kinds.has(name), `missing ray coverage: ${name}`);
    sim.setFocus(far, true); assert.ok(sim.targets.every(t => !t.body));
    let maxDifference = 0;
    for (const ray of rays) { const hit = sim.castUnloadedTargets(ray.position, ray.direction, ray.distance); assert.equal(hit?.object, ray.target.mesh); const delta = Math.abs(hit.distance - ray.expected); maxDifference = Math.max(maxDifference, delta); assert.ok(delta < .025); }
    reset(); return { externallyStartedRays: rays.length, componentKinds: kinds.size, maxDifference, excluded: 'Starts within any collider and occluded samples are excluded.' };
  });
  check('partial damage persists at distance and reset restores exact buffers and collisions', () => {
    const roofs = sim.targets.filter(t => t.mesh.userData.component === 'curved-metal-roof');
    selected = roofs[0]; retained = roofs.find(t => t.mesh.position.distanceTo(selected.mesh.position) > 8);
    const rayFor = t => { const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(t.mesh.quaternion); return { position: t.mesh.position.clone().addScaledVector(normal, 1), direction: normal.negate(), distance: 1.6 }; };
    selectedRay = rayFor(selected); retainedRay = rayFor(retained);
    assert.equal(cast(selectedRay.position, selectedRay.direction, selectedRay.distance)?.object, selected.mesh);
    sim.hit(selected, 100, selectedRay.direction); sim.world.step(); model.update(near);
    assert.ok(!(cast(selectedRay.position, selectedRay.direction, selectedRay.distance)));
    assert.ok(!(visual(selectedRay.position, selectedRay.direction, selectedRay.distance)));
    const remaining = triangles(); assert.ok(remaining > 0 && remaining < originalTriangles);
    sim.setFocus(far, true); model.update(far); assert.equal(triangles(), remaining);
    assert.ok(!(sim.castUnloadedTargets(selectedRay.position, selectedRay.direction, selectedRay.distance)));
    assert.equal(sim.castUnloadedTargets(retainedRay.position, retainedRay.direction, retainedRay.distance)?.object, retained.mesh);
    reset(); meshes.forEach((m, i) => assert.deepEqual(m.geometry.attributes.position.array, originals[i])); assert.equal(triangles(), originalTriangles);
    collisionState.restored();
    return { removedTriangles: originalTriangles - remaining, retainedFarGeometry: true, exactReset: true };
  });
  check('complete destruction remains absent at any distance and reset rebuilds every target', () => {
    sim.explode(local(0, 9, 20), 100, 100, up); model.update(near); assert.equal(triangles(), 0); assert.equal(shell.visible, false);
    assert.ok(sim.targets.every(t => !t.mesh.visible && !t.body)); sim.setFocus(far, true); model.update(far); assert.equal(triangles(), 0);
    reset(); assert.equal(triangles(), originalTriangles); assert.equal(sim.destroyed, 0); assert.equal(sim.debris.length, 0);
    meshes.forEach((m, i) => assert.deepEqual(m.geometry.attributes.position.array, originals[i]));
    return { targetsRestored: sim.targets.length };
  });
  check('height callback and reversed footprint keep the same geometry datum and exterior frames', () => {
    const shiftedScene = new THREE.Scene(); createAdmissionsLandmark(shiftedScene, building, profile, (x, z) => terrain.heightAt(x, z) + 50);
    const shifted = shiftedScene.children.find(o => o.userData.role === 'building-shell');
    for (let j = 0; j < meshes.length; j++) { const p = shifted.children[j].geometry.attributes.position.array; for (let i = 0; i < p.length; i += 3) { assert.ok(Math.abs(p[i] - originals[j][i]) < .001); assert.ok(Math.abs(p[i + 2] - originals[j][i + 2]) < .001); assert.ok(Math.abs(p[i + 1] - originals[j][i + 1] - 50) < .001); } }
    const reversedScene = new THREE.Scene(); createAdmissionsLandmark(reversedScene, { ...building, points: building.points.slice().reverse() }, profile, terrain.heightAt);
    const reversed = reversedScene.children.find(o => o.userData.role === 'building-shell'); assert.ok(Math.abs(reversed.userData.axis.x - axis.x) < 1e-8); assert.ok(Math.abs(reversed.userData.axis.z - axis.z) < 1e-8);
    const frameX = -dimensions.length / 2, frameZ = 15, position = local(frameX - 2, bodyTop / 5 * 1.58, frameZ);
    const ray = new THREE.Raycaster(position, right, 0, 4), before = ray.intersectObjects(meshes, false)[0], after = ray.intersectObjects(reversed.children, false)[0];
    assert.ok(before && after); assert.equal(before.object.name, after.object.name); assert.ok(Math.abs(before.distance - after.distance) < .001);
    return { callbackShift: 50, reversedFootprintConsistent: true };
  });
  console.log(`Admissions geometry and physics checks: ${results.length}/${results.length} passed. No browser or mobile hardware rendering was tested.`);
} finally {
  sim.world.free();
  await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ scope: 'CPU geometry and Rapier regression only. No survey, browser rendering or mobile performance certification.', hashes, results }, null, 2) + '\n');
}



