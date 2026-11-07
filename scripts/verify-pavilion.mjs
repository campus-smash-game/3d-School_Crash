import assert from 'node:assert/strict';
import {captureLoadedState, castLoaded, assertRestoredTargets} from './streaming-test-helpers.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, 'artifacts/pavilion-test');
await mkdir(artifacts, { recursive: true });
for (const name of ['terrain', 'physics', 'observedAppearances', 'buildingAppearance', 'pavilionLandmark', 'engineering301303Site', 'livingScienceCourtyardSite', 'educationParkingSite', 'educationParkingTerrain', 'dining76Site', 'dining76Terrain', 'dining76EastSite', 'dining76EastTerrain', 'education101EntrySite', 'education101EntryTerrain', 'education12Site', 'education12Terrain', 'humanitiesGardenSite', 'humanitiesGardenTerrain']) {
  const source = await readFile(path.join(root, `src/${name}.ts`), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  await writeFile(path.join(artifacts, `${name}.mjs`), compiled.replace(/from '(\.\/[\w-]+)'/g, "from '$1.mjs'"));
}
const { createTerrain } = await import(pathToFileURL(path.join(artifacts, 'terrain.mjs')).href);
const { getBuildingAppearance } = await import(pathToFileURL(path.join(artifacts, 'buildingAppearance.mjs')).href);
const { createPavilionLandmark } = await import(pathToFileURL(path.join(artifacts, 'pavilionLandmark.mjs')).href);
const { Simulation } = await import(pathToFileURL(path.join(artifacts, 'physics.mjs')).href);
await RAPIER.init();
const data = JSON.parse(await readFile(path.join(root, 'public/data/campus.json'), 'utf8'));
const elevation = JSON.parse(await readFile(path.join(root, 'public/data/terrain.json'), 'utf8'));
const building = data.buildings.find(b => b.id === 'way/193893586');
assert.ok(building, 'the reviewed amphitheater footprint must exist');
const scene = new THREE.Scene(), terrain = createTerrain(scene, elevation, data.buildings);
const model = createPavilionLandmark(scene, building, getBuildingAppearance(building), terrain.heightAt);
const shell = scene.children.find(o => o.userData.buildingId === building.id && o.userData.role === 'building-shell');
assert.ok(shell);
const meshes = []; shell.traverse(o => { if (o.isMesh) meshes.push(o); });
const originals = meshes.map(m => m.geometry.attributes.position.array.slice());
const origin = new THREE.Vector3(shell.userData.localOrigin.x, shell.userData.localOrigin.y, shell.userData.localOrigin.z);
const axis = new THREE.Vector3(shell.userData.axis.x, 0, shell.userData.axis.z), east = new THREE.Vector3(-axis.z, 0, axis.x);
const { length, depth } = shell.userData.dimensions;
const local = (x, y, z) => origin.clone().addScaledVector(axis, x).addScaledVector(east, z).add(new THREE.Vector3(0, y, 0));
const near = local(0, 2, 0), far = new THREE.Vector3(100000, 300, 100000);
const sim = new Simulation(model.breakables, [], local(0, 80, 0), data.bounds, terrain);
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
function renderCast(origin, direction, distance) {
  shell.updateMatrixWorld(true);
  return new THREE.Raycaster(origin, direction, 0, distance).intersectObjects(meshes, false)[0] ?? null;
}
function rayFor(target) {
  const thinAxis = target.mesh.userData.component === 'swept-roof' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  const normal = thinAxis.applyQuaternion(target.mesh.quaternion);
  return { origin: target.mesh.position.clone().addScaledVector(normal, 1.5), direction: normal.negate(), distance: 2.4 };
}
const hit = ray => cast(ray.origin, ray.direction, ray.distance);
const unloaded = ray => sim.castUnloadedTargets(ray.origin, ray.direction, ray.distance);
const targetOf = collision => { const handle = collision?.collider.parent()?.handle; return handle == null ? undefined : sim.targets.find(t => t.body && t.body.handle === handle); };
function restored() {
  assertRestoredTargets(sim, initialLoaded);
  meshes.forEach((mesh, i) => assert.deepEqual(mesh.geometry.attributes.position.array, originals[i]));
}
let fullTriangles, removedRay, retainedRay, removedTarget, retainedTarget;
try {
  check('the OSM site contains a low curved pavilion and open terraces within three meshes', () => {
    const vertices = meshes.flatMap(m => Array.from({ length: m.geometry.attributes.position.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(m.geometry.attributes.position, i)));
    assert.ok(vertices.every(p => p.toArray().every(Number.isFinite)));
    const xs = vertices.map(p => p.clone().sub(origin).dot(axis)), zs = vertices.map(p => p.clone().sub(origin).dot(east));
    assert.ok(Math.max(...xs) - Math.min(...xs) <= length + .6, 'model exceeded the retained map length');
    assert.ok(Math.max(...zs) - Math.min(...zs) <= depth + .6, 'model exceeded the retained map depth');
    assert.ok(meshes.length <= 3);
    assert.ok(shell.userData.stageFacing.x > .9, 'the open audience area must face east as in the published plan');
    const roof = sim.targets.filter(t => t.mesh.userData.component === 'swept-roof');
    assert.ok(roof.length > 30 && roof.some(t => Math.abs(t.mesh.quaternion.x) + Math.abs(t.mesh.quaternion.z) > .1));
    assert.ok(sim.targets.every(t => t.size.toArray().every(n => Number.isFinite(n) && n > 0)));
    fullTriangles = triangles();
    return { meshes: meshes.length, breakableParts: sim.targets.length, triangles: fullTriangles, mapLength: length, mapDepth: depth };
  });
  check('the seated audience and stage opening have no roof or invisible high wall', () => {
    const rays = [
      { origin: local(0, 11, depth * .32), direction: new THREE.Vector3(0, -1, 0), distance: 5 },
      { origin: local(0, 5.7, depth * .03), direction: east, distance: depth * .4 },
      { origin: local(-length * .25, 10.5, 0), direction: axis, distance: length * .5 },
    ];
    for (const ray of rays) { assert.equal(hit(ray), null, 'open space contains a collision wall'); assert.equal(renderCast(ray.origin, ray.direction, ray.distance), null); }
    assert.ok(cast(local(0, 8, depth * .32), new THREE.Vector3(0, -1, 0), 8), 'terraces have no walking surface');
    return { openRays: rays.length, terracesCollide: true };
  });
  check('visible roof and entry glass have nearby collision at the same surface', () => {
    let checked = 0, maxDifference = 0;
    for (const target of sim.targets.filter(t => ['swept-roof', 'entry-glass'].includes(t.mesh.userData.component))) {
      const ray = rayFor(target), physical = hit(ray), rendered = renderCast(ray.origin, ray.direction, ray.distance);
      if (!rendered || targetOf(physical) !== target) continue;
      const difference = Math.abs(physical.timeOfImpact - rendered.distance);
      assert.ok(difference < .42, `${target.mesh.userData.component} visible surface is ${difference} m away from its collider; size ${target.size.toArray()}`);
      maxDifference = Math.max(maxDifference, difference); checked++;
    }
    assert.ok(checked > 50, 'too few visible roof sections were checked');
    return { checked, maxDifferenceMeters: maxDifference };
  });
  check('the same intact projectile rays hit identical loaded and unloaded targets', () => {
    const samples = sim.targets.filter(t => ['swept-roof', 'entry-glass', 'stage-backwall'].includes(t.mesh.userData.component)).map(t => ({ target: t, ray: rayFor(t) })).filter(({ target, ray }) => targetOf(hit(ray)) === target);
    const expected = samples.map(({ target, ray }) => ({ target, ray, distance: hit(ray).timeOfImpact }));
    sim.setFocus(far, true); assert.ok(sim.targets.every(t => !t.body)); model.update(far);
    for (const { target, ray, distance } of expected) { const actual = unloaded(ray); assert.equal(actual?.object, target.mesh); assert.ok(Math.abs(actual.distance - distance) < .02); }
    assert.equal(triangles(), fullTriangles, 'intact pavilion vanished at distance');
    sim.setFocus(near, true); sim.world.step();
    return { comparedRays: expected.length, distantSilhouetteVisible: true };
  });
  check('one broken roof segment loses only its own visible surface and collider', () => {
    const candidates = sim.targets.filter(t => t.mesh.userData.component === 'swept-roof').map(target => ({ target, ray: rayFor(target) })).filter(({ target, ray }) => targetOf(hit(ray)) === target && renderCast(ray.origin, ray.direction, ray.distance));
    const first = candidates.find(({ target }) => target.mesh.position.y > origin.y + 6);
    assert.ok(first); removedTarget = first.target; removedRay = first.ray;
    const other = candidates.find(({ target }) => target.mesh.position.distanceTo(removedTarget.mesh.position) > 12);
    assert.ok(other); retainedTarget = other.target; retainedRay = other.ray;
    sim.hit(removedTarget, 100, removedRay.direction); sim.world.step(); model.update(near);
    assert.equal(removedTarget.body, null); assert.equal(hit(removedRay), null); assert.ok(hit(retainedRay));
    assert.ok(triangles() > 0 && triangles() < fullTriangles);
    const remaining = triangles(); sim.setFocus(far, true); model.update(far);
    assert.equal(triangles(), remaining); assert.equal(unloaded(removedRay), null); assert.equal(unloaded(retainedRay)?.object, retainedTarget.mesh);
    return { remainingTriangles: remaining, removedCollisionAbsentAtBothDistances: true };
  });
  check('reset restores all original buffers and the damaged collision surface', () => {
    sim.reset(); model.update(far); restored(); assert.equal(triangles(), fullTriangles); assert.ok(hit(removedRay));
    return { exactVertexRestoration: true };
  });
  check('complete destruction and repeated reset remain consistent at long distance', () => {
    assert.equal(sim.explode(origin, 180, 100, new THREE.Vector3(0, 1, 0)), sim.targets.length);
    assert.ok(sim.targets.every(t => !t.mesh.visible && !t.body));
    for (const player of [near, far, near]) { model.update(player); assert.equal(triangles(), 0); }
    sim.reset(); model.update(near); restored(); assert.equal(triangles(), fullTriangles);
    return { completeDestructionInvisible: true, restoredTriangles: fullTriangles };
  });
  check('site elevation is sampled and terrace foundations meet sloped terrain', () => {
    const slope = (x, z) => 120 + .018 * x - .02 * z;
    const extraScene = new THREE.Scene(), extra = createPavilionLandmark(extraScene, building, getBuildingAppearance(building), slope);
    const extraShell = extraScene.children.find(o => o.userData.role === 'building-shell');
    assert.equal(extraShell.userData.localOrigin.y, slope(origin.x, origin.z));
    for (const target of extra.breakables.filter(t => t.mesh.userData.component === 'terrace-step')) {
      const bottom = target.mesh.position.y - target.size.y / 2;
      assert.ok(bottom < slope(target.mesh.position.x, target.mesh.position.z), 'terrace foundation is suspended above terrain');
    }
    const flatScene = new THREE.Scene(); createPavilionLandmark(flatScene, building, getBuildingAppearance(building), () => 25);
    const flatShell = flatScene.children.find(o => o.userData.role === 'building-shell');
    let top = -Infinity; flatShell.traverse(o => { if (o.isMesh) { const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i++) top = Math.max(top, p.getY(i)); } });
    assert.ok(top - 25 > 7 && top - 25 < 9.2, 'roof regressed to the old 14 m office block');
    return { slopedSiteOrigin: extraShell.userData.localOrigin.y, estimatedHeightOnFlatTerrain: top - 25 };
  });
  // Offline geometry evidence can be plotted without claiming a browser render.
  await writeFile(path.join(artifacts, 'geometry.json'), JSON.stringify({ origin: origin.toArray(), axis: axis.toArray(), meshes: meshes.map(m => ({ name: m.name, position: Array.from(m.geometry.attributes.position.array), color: Array.from(m.geometry.attributes.color.array) })) }));
  console.log(`Pavilion checks: ${results.length}/${results.length} passed.`);
  console.log('Scope: geometry and physics regression only; no browser rendering, physical phone test or survey certification.');
} finally {
  sim.world.free();
  await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ scope: 'Geometry and physics regression. Dimensions and curvature are approximate. No browser rendering or mobile hardware verification.', results }, null, 2) + '\n');
}
