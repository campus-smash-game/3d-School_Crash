import assert from 'node:assert/strict';
import {captureLoadedState, castLoaded, assertRestoredTargets} from './streaming-test-helpers.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, 'artifacts/sports-test');
await mkdir(artifacts, { recursive: true });
// Exercise actual application modules without a browser or a canvas stub.
for (const name of ['terrain', 'physics', 'observedAppearances', 'buildingAppearance', 'sportsLandmark', 'engineering301303Site', 'livingScienceCourtyardSite', 'educationParkingSite', 'educationParkingTerrain', 'dining76Site', 'dining76Terrain', 'dining76EastSite', 'dining76EastTerrain', 'education101EntrySite', 'education101EntryTerrain', 'education12Site', 'education12Terrain', 'humanitiesGardenSite', 'humanitiesGardenTerrain']) {
  const source = await readFile(path.join(root, `src/${name}.ts`), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  await writeFile(path.join(artifacts, `${name}.mjs`), compiled.replace(/from '(\.\/[\w-]+)'/g, "from '$1.mjs'"));
}
const { createTerrain } = await import(pathToFileURL(path.join(artifacts, 'terrain.mjs')).href);
const { getBuildingAppearance } = await import(pathToFileURL(path.join(artifacts, 'buildingAppearance.mjs')).href);
const { createSportsLandmark } = await import(pathToFileURL(path.join(artifacts, 'sportsLandmark.mjs')).href);
const { Simulation } = await import(pathToFileURL(path.join(artifacts, 'physics.mjs')).href);
await RAPIER.init();
const data = JSON.parse(await readFile(path.join(root, 'public/data/campus.json'), 'utf8'));
const elevation = JSON.parse(await readFile(path.join(root, 'public/data/terrain.json'), 'utf8'));
const building = data.buildings.find(b => b.id === 'way/439687811');
assert.ok(building, 'the independently reviewed POSCO footprint must exist');
const scene = new THREE.Scene(), terrain = createTerrain(scene, elevation, data.buildings);
const model = createSportsLandmark(scene, building, getBuildingAppearance(building), terrain.heightAt);
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
const initialLoaded = captureLoadedState(sim);
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
  return castLoaded(sim, origin, direction, distance, true);
}
function rayFor(target) {
  const outward = new THREE.Vector3(0, 1, 0).applyQuaternion(target.mesh.quaternion);
  return { origin: target.mesh.position.clone().addScaledVector(outward, 3), direction: outward.negate(), distance: 4 };
}
function hitRay(ray) { return cast(ray.origin, ray.direction, ray.distance); }
function restored() {
  assertRestoredTargets(sim, initialLoaded);
  meshes.forEach((mesh, i) => assert.deepEqual(mesh.geometry.attributes.position.array, originals[i], 'reset changed the original vertex buffer'));
}

let originalTriangles, removedRay, retainedRay, damaged, retained;
try {
  check('the curved sports envelope follows the independently reviewed map outline', () => {
    const positions = meshes.flatMap(mesh => {
      const attribute = mesh.geometry.attributes.position;
      return Array.from({ length: attribute.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(attribute, i));
    });
    assert.ok(positions.every(p => p.toArray().every(Number.isFinite)));
    const xs = positions.map(p => p.dot(along)), zs = positions.map(p => p.dot(across));
    const modelLength = Math.max(...xs) - Math.min(...xs), modelDepth = Math.max(...zs) - Math.min(...zs);
    assert.ok(Math.abs(modelLength - length) < .1, 'long-axis envelope drifted outside the OSM outline');
    assert.ok(Math.abs(modelDepth - depth) < .2, 'barrel width no longer follows the OSM outline');
    const top = Math.max(...positions.map(p => p.y)) - origin.y;
    assert.ok(top > 22 && top < 25, 'photo-derived tall curved envelope regressed to the old 14 m extrusion');
    assert.ok(model.breakables.every(part => part.size.toArray().every(value => Number.isFinite(value) && value > 0)));
    assert.ok(meshes.length <= 3, 'single landmark exceeds the agreed merged-mesh budget');
    originalTriangles = triangles();
    return { mapLength: length, mapDepth: depth, estimatedHeight: top, meshes: meshes.length, triangles: originalTriangles };
  });

  check('Rapier collision follows the curved roof and leaves rounded upper corners empty', () => {
    const roofHeights = [];
    for (const z of [-depth * .3, 0, depth * .3]) {
      const rayOrigin = local(length * .18, 35, z), hit = cast(rayOrigin, new THREE.Vector3(0, -1, 0), 35);
      assert.ok(hit, `missing curved roof collider at cross-section ${z}`);
      roofHeights.push(35 - hit.timeOfImpact);
    }
    assert.ok(roofHeights[1] > roofHeights[0] + 1.5 && roofHeights[1] > roofHeights[2] + 1.5, 'roof collision has become a flat cuboid');
    assert.equal(cast(local(-length / 2 - 4, 22, depth * .48), along, length + 8), null, 'empty rounded corner has a rectangular phantom wall');
    assert.equal(cast(local(-length * .2, 13, 0), along, length * .4), null, 'building interior was filled by one giant solid collider');
    for (const x of [0, -length * .1, length * .1]) assert.ok(cast(local(x, 35, 0), new THREE.Vector3(0, -1, 0), 25), 'projectile ray leaked through a rotated roof joint');
    return { roofHeights, upperCornersClear: true };
  });

  check('the inset oval end and low podium meet actual terrain with working collision', () => {
    for (const side of [-1, 1]) {
      const rayOrigin = local(side * (length / 2 + 4), 13, 0);
      assert.ok(cast(rayOrigin, along.clone().multiplyScalar(-side), 10), 'missing inset oval glass collision');
    }
    for (const part of model.breakables.filter(part => part.mesh.userData.component === 'low-podium')) {
      const p = part.mesh.position;
      assert.ok(p.y - part.size.y / 2 <= terrain.heightAt(p.x, p.z) + .08, 'podium floats above the actual terrain');
    }
    assert.ok(cast(local(15, 2, depth / 2 + 4), across.clone().negate(), depth / 2), 'missing ground-level podium collision');
    return { endsBlocked: 2, terrainFoundationsChecked: true };
  });

  check('destroyed curved roof loses its tilted collider and only its own visible geometry', () => {
    const candidates = sim.targets.filter(target => target.mesh.userData.component === 'barrel-roof');
    candidates.sort((a, b) => a.mesh.position.distanceToSquared(local(length * .2, 23, 0)) - b.mesh.position.distanceToSquared(local(length * .2, 23, 0)));
    damaged = candidates[0]; retained = candidates.find(target => target.mesh.position.distanceTo(damaged.mesh.position) > 8);
    assert.ok(damaged && retained);
    removedRay = rayFor(damaged); retainedRay = rayFor(retained);
    assert.ok(hitRay(removedRay)); assert.ok(hitRay(retainedRay));
    sim.hit(damaged, damaged.toughness + 1, removedRay.direction); sim.world.step(); model.update(near);
    assert.equal(damaged.body, null); assert.equal(hitRay(removedRay), null, 'destroyed curved segment still blocks projectiles');
    assert.ok(hitRay(retainedRay), 'adjacent segment lost collision');
    const remaining = triangles(); assert.ok(remaining > 0 && remaining < originalTriangles);
    sim.setFocus(far, true); model.update(far);
    assert.equal(triangles(), remaining, 'remaining silhouette disappeared at distance');
    assert.equal(sim.castUnloadedTargets(removedRay.origin, removedRay.direction, removedRay.distance), null);
    assert.equal(sim.castUnloadedTargets(retainedRay.origin, retainedRay.direction, retainedRay.distance)?.object, retained.mesh);
    return { originalTriangles, remainingTriangles: remaining, distantProjectileTarget: true };
  });

  check('reset restores curved vertices, glass, collision and debris state', () => {
    sim.reset(); model.update(near); restored();
    assert.ok(hitRay(removedRay)); model.update(far); assert.equal(triangles(), originalTriangles);
    return { restoredTriangles: triangles() };
  });

  check('complete destruction and another reset remain correct at every distance', () => {
    assert.equal(sim.explode(local(0, 12, 0), 140, 100, new THREE.Vector3(0, 1, 0)), sim.targets.length);
    assert.ok(sim.targets.every(target => !target.mesh.visible && !target.body));
    for (const player of [near, far, near]) { model.update(player); assert.equal(triangles(), 0); }
    sim.reset(); model.update(far); restored(); assert.equal(triangles(), originalTriangles);
    return { restoredAtLongDistance: true };
  });
  console.log(`Sports checks: ${results.length}/${results.length} passed.`);
  console.log('Scope: geometry and physics regression only; estimated dimensions are not a survey. No browser rendering or phone test.');
} finally {
  sim.world.free();
  await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ scope: 'Geometry and physics regression. Does not certify survey dimensions, photographic fidelity, browser rendering or mobile hardware.', results }, null, 2) + '\n');
}
