import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, 'artifacts/engineer-house-test');
await mkdir(artifacts, { recursive: true });
// Exercise actual application modules without a browser or a canvas stub.
for (const name of ['terrain', 'physics', 'observedAppearances', 'buildingAppearance', 'engineerHouseLandmark', 'engineering301303Site', 'livingScienceCourtyardSite', 'educationParkingSite', 'educationParkingTerrain', 'dining76Site', 'dining76Terrain', 'dining76EastSite', 'dining76EastTerrain', 'education101EntrySite', 'education101EntryTerrain', 'education12Site', 'education12Terrain', 'humanitiesGardenSite', 'humanitiesGardenTerrain']) {
  const source = await readFile(path.join(root, `src/${name}.ts`), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  await writeFile(path.join(artifacts, `${name}.mjs`), compiled.replace(/from '(\.\/[\w-]+)'/g, "from '$1.mjs'"));
}
const { createTerrain } = await import(pathToFileURL(path.join(artifacts, 'terrain.mjs')).href);
const { getBuildingAppearance } = await import(pathToFileURL(path.join(artifacts, 'buildingAppearance.mjs')).href);
const { createEngineerHouseLandmark } = await import(pathToFileURL(path.join(artifacts, 'engineerHouseLandmark.mjs')).href);
const { Simulation } = await import(pathToFileURL(path.join(artifacts, 'physics.mjs')).href);
await RAPIER.init();
const data = JSON.parse(await readFile(path.join(root, 'public/data/campus.json'), 'utf8'));
const elevation = JSON.parse(await readFile(path.join(root, 'public/data/terrain.json'), 'utf8'));
const building = data.buildings.find(b => b.id === 'way/386890466');
assert.ok(building, 'the independently reviewed Engineer House footprint must exist');
const scene = new THREE.Scene(), terrain = createTerrain(scene, elevation, data.buildings);
const model = createEngineerHouseLandmark(scene, building, getBuildingAppearance(building), terrain.heightAt);
const shell = scene.children.find(object => object.userData.buildingId === building.id && object.userData.role === 'building-shell');
assert.ok(shell);
const meshes = []; shell.traverse(object => { if (object.isMesh) meshes.push(object); });
const originals = meshes.map(mesh => mesh.geometry.attributes.position.array.slice());
const points = building.points.slice(0, -1);
const edges = points.map((p, i) => new THREE.Vector3(points[(i + 1) % points.length][0] - p[0], 0, points[(i + 1) % points.length][1] - p[1]));
const along = edges.sort((a, b) => b.lengthSq() - a.lengthSq())[0].normalize();
if (along.x < 0) along.negate();
const across = new THREE.Vector3(-along.z, 0, along.x);
const projections = points.map(p => new THREE.Vector3(p[0], 0, p[1]));
const bounds = vector => { const numbers = projections.map(p => p.dot(vector)); return [Math.min(...numbers), Math.max(...numbers)]; };
const [minX, maxX] = bounds(along), [minZ, maxZ] = bounds(across);
const length = maxX - minX, depth = maxZ - minZ;
const origin = along.clone().multiplyScalar((minX + maxX) / 2).addScaledVector(across, (minZ + maxZ) / 2);
origin.y = terrain.heightAt(origin.x, origin.z);
const local = (x, y, z) => origin.clone().addScaledVector(along, x).addScaledVector(across, z).add(new THREE.Vector3(0, y, 0));
const near = local(0, 2, 35), far = new THREE.Vector3(100000, 300, 100000);
const sim = new Simulation(model.breakables, [], local(0, 100, 0), data.bounds, terrain);
const initialLoaded=sim.targets.map(t=>Boolean(t.body)),initialBodies=sim.world.bodies.len();
const results = [];
function check(name, run) { const details = run(); results.push({ name, status: 'passed', ...details }); console.log(`PASS ${name}${details ? ` ${JSON.stringify(details)}` : ''}`); }
function triangles() {
  let count = 0; const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (const mesh of meshes) if (shell.visible && mesh.visible) {
    const p = mesh.geometry.attributes.position;
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
      if (b.sub(a).cross(c.sub(a)).lengthSq() > 1e-10) count++;
    }
  }
  return count;
}
function cast(origin, direction, distance) {
  sim.setFocus(origin,true);sim.world.step();
  return sim.world.castRay(new RAPIER.Ray(origin, direction), distance, true, undefined, undefined, undefined, undefined,
    collider => sim.targets.some(target => target.body && target.body.handle === collider.parent()?.handle));
}
function rayFor(target) {
  const outward = new THREE.Vector3(0, 1, 0).applyQuaternion(target.mesh.quaternion);
  return { origin: target.mesh.position.clone().addScaledVector(outward, 3), direction: outward.negate(), distance: 4 };
}
function hitRay(ray) { return cast(ray.origin, ray.direction, ray.distance); }
function restored() {
  assert.equal(sim.destroyed, 0); assert.equal(sim.debris.length, 0);
  assert.deepEqual(sim.targets.map(t=>Boolean(t.body)),initialLoaded);assert.equal(sim.world.bodies.len(),initialBodies);
  assert.ok(sim.targets.every(target => target.mesh.visible && target.hp === target.toughness));
  for(const target of sim.targets){sim.setFocus(target.mesh.position,true);sim.world.step();assert.ok(target.body);const extents=target.body.collider(0).halfExtents();assert.ok(extents&&new THREE.Vector3().copy(extents).distanceTo(target.size.clone().multiplyScalar(.5))<.0001);}
  sim.setFocus(far,true);sim.setFocus(sim.spawn,true);sim.world.step();assert.deepEqual(sim.targets.map(t=>Boolean(t.body)),initialLoaded);
  meshes.forEach((mesh, i) => assert.deepEqual(mesh.geometry.attributes.position.array, originals[i], 'reset changed the original vertex buffer'));
}

let originalTriangles, removedRay, retainedRay, damaged, retained;
try {
  check('low building envelope follows the map and current terrain without the old four-storey extrusion', () => {
    const vertices = meshes.flatMap(mesh => Array.from({ length: mesh.geometry.attributes.position.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, i)));
    assert.ok(vertices.every(p => p.toArray().every(Number.isFinite)));
    const projectedX = vertices.map(p => p.dot(along));
    assert.ok(Math.abs(Math.max(...projectedX) - Math.min(...projectedX) - length) < .7, 'roof long axis drifted from the real map outline');
    const roofTop = Math.max(...vertices.map(p => p.y)) - origin.y;
    assert.ok(roofTop > 9 && roofTop < 11, 'photo-derived roof regressed to the old 14 m extrusion');
    assert.ok(model.breakables.every(part => part.size.toArray().every(value => Number.isFinite(value) && value > 0)));
    for (const part of model.breakables.filter(part => ['low-body-wall', 'entry-glazing'].includes(part.mesh.userData.component))) {
      const p = part.mesh.position;
      assert.ok(p.y - part.size.y / 2 <= terrain.heightAt(p.x, p.z) + .12, 'wall foundation floats above the terrain');
    }
    assert.ok(meshes.length <= 3);
    originalTriangles = triangles();
    return { mapLength: length, mapDepth: depth, estimatedTop: roofTop, parts: model.breakables.length, meshes: meshes.length, triangles: originalTriangles };
  });

  check('central glazing rises above the side roofs and both roof slopes collide', () => {
    const down = new THREE.Vector3(0, -1, 0), readHeight = (x, z) => {
      const hit = cast(local(x, 25, z), down, 30); assert.ok(hit, 'missing roof collision'); return 25 - hit.timeOfImpact;
    };
    const metalHigh = readHeight(length * .35, 2), metalLow = readHeight(length * .35, depth * .32);
    const centralHigh = readHeight(0, 2);
    assert.ok(metalHigh > metalLow + 1, 'metal roof is flat');
    assert.ok(centralHigh > metalHigh + 1, 'central glazed roof is no higher than the side roof');
    for (const z of [-4, 4]) assert.ok(cast(local(0, 25, z), down, 30), 'missing rear or front skylight slope');
    return { sideRoofHigh: metalHigh, sideRoofLow: metalLow, centralSkylight: centralHigh };
  });

  check('exposed frame and diagonal entrance posts keep the visible gaps open', () => {
    assert.equal(cast(local(length * .35, 9, depth), across.clone().negate(), depth * 2), null, 'space between exposed roof trusses became a solid upper wall');
    const post = sim.targets.find(target => target.mesh.userData.component === 'diagonal-porch-post');
    assert.ok(post, 'diagonal porch supports missing');
    assert.ok(cast(post.mesh.position.clone().addScaledVector(across, 1), across.clone().negate(), 2), 'tilted porch support does not collide');
    assert.equal(cast(local(0, 2, depth / 2 + 1), across.clone().negate(), 2), null, 'entrance approach is blocked outside the glazing');
    assert.ok(cast(local(0, 2, depth / 2 + 1), across.clone().negate(), 10), 'closed entrance glazing lost collision');
    return { frameGapsOpen: true, diagonalPostBlocks: true };
  });

  check('destroyed sloped glazing loses only its own geometry and collision at near and far distances', () => {
    const candidates = sim.targets.filter(target => target.mesh.userData.component === 'central-skylight');
    candidates.sort((a, b) => a.mesh.position.distanceToSquared(local(0, 8, 4)) - b.mesh.position.distanceToSquared(local(0, 8, 4)));
    damaged = candidates[0]; retained = candidates.find(target => target.mesh.position.distanceTo(damaged.mesh.position) > 8);
    assert.ok(damaged && retained);
    removedRay = rayFor(damaged); retainedRay = rayFor(retained); assert.ok(hitRay(removedRay)); assert.ok(hitRay(retainedRay));
    sim.hit(damaged, damaged.toughness + 1, removedRay.direction); sim.world.step(); model.update(near);
    assert.equal(damaged.body, null); assert.equal(hitRay(removedRay), null, 'destroyed glazing still collides'); assert.ok(hitRay(retainedRay));
    const remaining = triangles(); assert.ok(remaining > 0 && remaining < originalTriangles);
    sim.setFocus(far, true); model.update(far); assert.equal(triangles(), remaining);
    assert.equal(sim.castUnloadedTargets(removedRay.origin, removedRay.direction, removedRay.distance), null);
    assert.equal(sim.castUnloadedTargets(retainedRay.origin, retainedRay.direction, retainedRay.distance)?.object, retained.mesh);
    return { remainingTriangles: remaining, distantProjectileTarget: true };
  });

  check('partial and complete destruction reset exact buffers, live collision and debris state', () => {
    sim.reset(); model.update(near); restored(); assert.ok(hitRay(removedRay));
    assert.equal(sim.explode(local(0, 6, 0), 140, 100, new THREE.Vector3(0, 1, 0)), sim.targets.length);
    assert.ok(sim.targets.every(target => !target.mesh.visible && !target.body));
    for (const player of [near, far, near]) { model.update(player); assert.equal(triangles(), 0); }
    sim.reset(); model.update(far); restored(); assert.equal(triangles(), originalTriangles);
    return { restoredAtLongDistance: true };
  });

  check('all geometry follows a changed terrain datum rather than a fixed altitude', () => {
    const lifted = new THREE.Scene(); createEngineerHouseLandmark(lifted, building, getBuildingAppearance(building), (x, z) => terrain.heightAt(x, z) + 60);
    const liftedShell = lifted.children.find(object => object.userData.role === 'building-shell');
    for (let m = 0; m < meshes.length; m++) {
      const values = liftedShell.children[m].geometry.attributes.position.array, original = originals[m]; assert.equal(values.length, original.length);
      for (let i = 0; i < values.length; i += 3) {
        assert.ok(Math.abs(values[i] - original[i]) < .001 && Math.abs(values[i + 2] - original[i + 2]) < .001);
        assert.ok(Math.abs(values[i + 1] - original[i + 1] - 60) < .001, 'terrain datum was ignored');
      }
    }
    return { testedTerrainOffset: 60 };
  });
  console.log('Engineer House checks: ' + results.length + '/' + results.length + ' passed.');
  console.log('Scope: geometry and physics regression only. Roof heights remain photo estimates; no survey, browser rendering or physical-phone test.');
} finally {
  sim.world.free();
  await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ scope: 'Geometry and physics regression, not survey accuracy, full photographic fidelity, browser rendering or mobile hardware.', results }, null, 2) + '\n');
}
