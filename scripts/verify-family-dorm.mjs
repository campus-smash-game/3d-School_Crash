import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, 'artifacts/family-dorm-test'); await mkdir(artifacts, { recursive: true });
for (const name of ['terrain', 'physics', 'observedAppearances', 'buildingAppearance', 'familyDormLandmark', 'engineering301303Site', 'livingScienceCourtyardSite', 'educationParkingSite', 'educationParkingTerrain', 'dining76Site', 'dining76Terrain', 'dining76EastSite', 'dining76EastTerrain', 'education101EntrySite', 'education101EntryTerrain', 'education12Site', 'education12Terrain', 'humanitiesGardenSite', 'humanitiesGardenTerrain']) {
  const source = await readFile(path.join(root, `src/${name}.ts`), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  await writeFile(path.join(artifacts, `${name}.mjs`), compiled.replace(/from '(\.\/[\w-]+)'/g, "from '$1.mjs'"));
}
const { createTerrain } = await import(pathToFileURL(path.join(artifacts, 'terrain.mjs')).href);
const { getBuildingAppearance } = await import(pathToFileURL(path.join(artifacts, 'buildingAppearance.mjs')).href);
const { createFamilyDormLandmark } = await import(pathToFileURL(path.join(artifacts, 'familyDormLandmark.mjs')).href);
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
const terrain = createTerrain(new THREE.Scene(), elevation, data.buildings);
const ids = ['way/439707895', 'way/439707894', 'way/439707893', 'way/439707892', 'way/409030550'];
const fixtures = [], results = [], far = new THREE.Vector3(100000, 100, 100000);
function makeFixture(id) {
  const building = data.buildings.find(b => b.id === id); assert.ok(building, `missing reviewed dormitory ${id}`);
  const scene = new THREE.Scene(), model = createFamilyDormLandmark(scene, building, getBuildingAppearance(building), terrain.heightAt);
  const shell = scene.children.find(object => object.userData.buildingId === id && object.userData.role === 'building-shell'); assert.ok(shell);
  const meshes = []; shell.traverse(object => { if (object.isMesh) meshes.push(object); }); scene.updateMatrixWorld(true);
  const originals = meshes.map(mesh => mesh.geometry.attributes.position.array.slice());
  const points = building.points.slice(0, -1), edges = points.map((p, i) => new THREE.Vector3(points[(i + 1) % points.length][0] - p[0], 0, points[(i + 1) % points.length][1] - p[1]));
  const along = edges.sort((a, b) => b.lengthSq() - a.lengthSq())[0].normalize(); if (along.x < 0) along.negate();
  const across = new THREE.Vector3(-along.z, 0, along.x), xs = points.map(p => p[0] * along.x + p[1] * along.z), zs = points.map(p => p[0] * across.x + p[1] * across.z);
  const minX = Math.min(...xs), minZ = Math.min(...zs), length = Math.max(...xs) - minX, depth = Math.max(...zs) - minZ;
  const x = points.reduce((sum, p) => sum + p[0], 0) / points.length, z = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  const origin = along.clone().multiplyScalar(minX).addScaledVector(across, minZ); origin.y = terrain.heightAt(x, z);
  const local = (x, y, z) => origin.clone().addScaledVector(along, x).addScaledVector(across, z).add(new THREE.Vector3(0, y, 0));
  const frontSign = id === 'way/439707892' ? 1 : -1, front = across.clone().multiplyScalar(frontSign), near = local(length / 2, 2, frontSign > 0 ? depth + 8 : -8);
  const sim = new Simulation(model.breakables, [], local(length / 2, 60, depth / 2), data.bounds, terrain);
  const collisionState = collisionVerifier(sim);
  const cast = (origin, direction, distance) => { sim.setFocus(origin, true); sim.world.step(); return sim.world.castRay(new RAPIER.Ray(origin, direction), distance, true, undefined, undefined, undefined, undefined,
    collider => sim.targets.some(target => target.body && target.body.handle === collider.parent()?.handle)); };
  return { building, scene, model, shell, meshes, originals, along, across, origin, local, front, frontSign, near, sim, cast, collisionState, length, depth, points };
}
function triangles(f) {
  let count = 0; const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (const mesh of f.meshes) if (f.shell.visible && mesh.visible) {
    const p = mesh.geometry.attributes.position;
    for (let i = 0; i < p.count; i += 3) { a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2); if (b.sub(a).cross(c.sub(a)).lengthSq() > 1e-10) count++; }
  }
  return count;
}
function check(name, run) { const details = run(); results.push({ name, status: 'passed', ...details }); console.log(`PASS ${name}${details ? ` ${JSON.stringify(details)}` : ''}`); }
function restoreCheck(f) {
  assert.equal(f.sim.destroyed, 0); assert.equal(f.sim.debris.length, 0);
  f.collisionState.restored();
  f.meshes.forEach((mesh, i) => assert.deepEqual(mesh.geometry.attributes.position.array, f.originals[i], 'reset must restore exact positions'));
}
try {
  for (const id of ids) fixtures.push(makeFixture(id));
  check('all five real dormitories use five facade tiers and finite terrain-based geometry', () => {
    const report = [];
    for (const f of fixtures) {
      const tiers = new Set(f.sim.targets.filter(target => target.mesh.userData.component === 'front-balcony').map(target => Math.round((target.mesh.position.y + target.size.y / 2 - f.origin.y) * 10)));
      assert.equal(tiers.size, 5, `${f.building.name} does not have the five documented balcony levels`);
      assert.ok(f.model.breakables.every(part => part.size.toArray().every(value => Number.isFinite(value) && value > 0)));
      const coordinates = f.meshes.flatMap(mesh => Array.from(mesh.geometry.attributes.position.array)); assert.ok(coordinates.every(Number.isFinite));
      const maxY = Math.max(...coordinates.filter((_, i) => i % 3 === 1)); assert.ok(Math.abs(maxY - f.origin.y - 17.5) < .1, 'estimated envelope is not applied');
      assert.ok(f.meshes.length <= 3); assert.ok(f.meshes.some(mesh => mesh.material.map?.isDataTexture), 'procedural brick pattern missing');
      for (const target of f.sim.targets.filter(target => ['blank-end-wall', 'front-balcony', 'stair-entry-wall', 'estimated-rear-window'].includes(target.mesh.userData.component))) {
        const bottom = target.mesh.position.y - target.size.y / 2;
        if (bottom < f.origin.y) assert.ok(bottom <= terrain.heightAt(target.mesh.position.x, target.mesh.position.z) + .12, 'foundation floats above terrain');
      }
      f.originalTriangles = triangles(f); report.push({ building: f.building.name, parts: f.sim.targets.length, meshes: f.meshes.length, triangles: f.originalTriangles });
    }
    return { buildings: report };
  });

  check('short end walls remain unglazed and the observed circular stair windows have separate entrance walls', () => {
    for (const f of fixtures) {
      const windows = f.sim.targets.filter(target => target.mesh.userData.component === 'round-stair-window');
      const heights = new Set(windows.map(target => Math.round((target.mesh.position.y - f.origin.y) * 10)));
      assert.equal(heights.size, 4, 'four inter-storey circular-window rows observed in the photos are missing');
      assert.ok(f.sim.targets.some(target => target.mesh.userData.component === 'stair-entry-wall'));
      const glazing = f.meshes.find(mesh => mesh.name === 'family-dorm-glazing').geometry.attributes.position;
      for (let i = 0; i < glazing.count; i++) {
        const vertex = new THREE.Vector3().fromBufferAttribute(glazing, i).sub(f.origin), x = vertex.dot(f.along);
        assert.ok(x > .2 && x < f.length - .2, 'glazing was repeated onto a blank short end wall');
      }
    }
    return { checkedBuildings: fixtures.length, circularWindowRows: 4 };
  });

  check('the staggered 935 outline keeps both mapped recesses empty', () => {
    const f = fixtures[4], down = new THREE.Vector3(0, -1, 0);
    for (const [x, z] of [[5, 1], [40, 16.5]]) assert.ok(!(f.cast(f.local(x, 30, z), down, 40)), '935 was filled by its rectangular envelope');
    for (const [x, z] of [[5, 10], [40, 7]]) assert.ok(f.cast(f.local(x, 30, z), down, 40), 'one staggered wing has no roof collision');
    assert.ok(f.shell.userData.roofBlocks.length > 1, 'staggered roof was reduced to a single rectangle');
    return { recessesClear: 2, separateWingsPresent: true };
  });

  check('sloped roof collision follows the actual rendered surface on every dormitory', () => {
    const down = new THREE.Vector3(0, -1, 0), report = [];
    for (const f of fixtures) {
      const x = f.length * .2, localOutline = f.points.map(p => ({ x: p[0] * f.along.x + p[1] * f.along.z - f.origin.dot(f.along), z: p[0] * f.across.x + p[1] * f.across.z - f.origin.dot(f.across) }));
      const intersections = [];
      for (let i = 0; i < localOutline.length; i++) { const a = localOutline[i], b = localOutline[(i + 1) % localOutline.length]; if ((a.x < x && b.x > x) || (b.x < x && a.x > x)) intersections.push(a.z + (b.z - a.z) * (x - a.x) / (b.x - a.x)); }
      const low = Math.min(...intersections), high = Math.max(...intersections), heights = [];
      for (const z of [low + 1.1, (low + high) / 2, high - 1.1]) {
        const origin = f.local(x, 30, z), hit = f.cast(origin, down, 35); assert.ok(hit, 'roof collider missing');
        const visual = new THREE.Raycaster(origin, down, 0, 35).intersectObjects(f.meshes, false)[0]; assert.ok(visual, 'roof render surface missing');
        assert.ok(Math.abs(hit.timeOfImpact - visual.distance) < .26, 'roof collider does not match its pitched mesh');
        heights.push(30 - hit.timeOfImpact);
      }
      assert.ok(heights[1] > heights[0] + 1 && heights[1] > heights[2] + 1, 'roof collider is flat'); report.push({ building: f.building.name, roofHeights: heights });
    }
    return { buildings: report };
  });

  check('outward railing shots and upward slab shots match rendered geometry and independent damage', () => {
    const report = [], up = new THREE.Vector3(0, 1, 0);
    for (const f of fixtures) {
      const railings = f.sim.targets.filter(target => target.mesh.userData.component === 'balcony-railing');
      railings.sort((a, b) => Math.abs(a.mesh.position.y - f.origin.y - 6.865) - Math.abs(b.mesh.position.y - f.origin.y - 6.865));
      const railing = railings[0], railAim = railing.mesh.position.clone();
      railAim.y += (railing.size.y - .025) / 2 - .03;
      const railOrigin = railAim.clone().addScaledVector(f.front, 3), inward = f.front.clone().negate();
      const railVisual = new THREE.Raycaster(railOrigin, inward, 0, 3.15).intersectObjects(f.meshes, false)[0];
      const railHit = f.cast(railOrigin, inward, 3.15); assert.ok(railVisual && railHit, 'visible railing cannot be hit');
      assert.equal(railHit.collider.parent()?.handle, railing.body.handle);
      const railError = Math.abs(railHit.timeOfImpact - railVisual.distance); assert.ok(railError < .05, 'railing collision is behind its rendered bars');
      const slabs = f.sim.targets.filter(target => target.mesh.userData.component === 'balcony-slab');
      slabs.sort((a, b) => a.mesh.position.distanceToSquared(railing.mesh.position.clone().addScaledVector(f.front, -.46).add(new THREE.Vector3(0, -.515, 0))) - b.mesh.position.distanceToSquared(railing.mesh.position.clone().addScaledVector(f.front, -.46).add(new THREE.Vector3(0, -.515, 0))));
      const slab = slabs[0], slabOrigin = slab.mesh.position.clone().addScaledVector(f.front, .25).add(new THREE.Vector3(0, -.7, 0));
      const slabVisual = new THREE.Raycaster(slabOrigin, up, 0, 1).intersectObjects(f.meshes, false)[0], slabHit = f.cast(slabOrigin, up, 1);
      assert.ok(slabVisual && slabHit, 'visible slab underside cannot be hit'); assert.equal(slabHit.collider.parent()?.handle, slab.body.handle);
      const slabError = Math.abs(slabHit.timeOfImpact - slabVisual.distance); assert.ok(slabError < .04, 'upward shot hits an invisible wall extension before the slab');
      f.sim.hit(railing, railing.toughness + 1, inward); f.sim.world.step(); f.model.update(f.near);
      assert.ok(!(f.cast(railOrigin, inward, 3.15)), 'destroyed railing still collides'); assert.ok(f.cast(slabOrigin, up, 1), 'destroying the railing also removed its slab');
      assert.equal(new THREE.Raycaster(railOrigin, inward, 0, 3.15).intersectObjects(f.meshes, false).length, 0, 'destroyed railing still renders');
      f.sim.setFocus(far, true); f.model.update(far);
      assert.ok(!(f.sim.castUnloadedTargets(railOrigin, inward, 3.15)));
      assert.equal(f.sim.castUnloadedTargets(slabOrigin, up, 1)?.object, slab.mesh, 'unloaded slab misses the same upward shot');
      f.sim.reset(); f.model.update(f.near); restoreCheck(f);
      report.push({ building: f.building.name, railingRayErrorMeters: railError, slabRayErrorMeters: slabError });
    }
    return { buildings: report };
  });

  check('partial damage removes the selected balcony at loaded and unloaded distances', () => {
    for (const f of fixtures) {
      const candidates = f.sim.targets.filter(target => target.mesh.userData.component === 'front-balcony');
      candidates.sort((a, b) => Math.abs(a.mesh.position.y - f.origin.y - 8) - Math.abs(b.mesh.position.y - f.origin.y - 8));
      const target = candidates[0], retained = candidates.find(other => other.mesh.position.distanceTo(target.mesh.position) > 8); assert.ok(target && retained);
      const ray = t => ({ origin: t.mesh.position.clone().addScaledVector(f.front, 3), direction: f.front.clone().negate(), distance: 4 });
      const removedRay = ray(target), retainedRay = ray(retained); assert.ok(f.cast(removedRay.origin, removedRay.direction, removedRay.distance));
      f.sim.hit(target, target.toughness + 1, removedRay.direction); f.sim.world.step(); f.model.update(f.near);
      assert.ok(!(f.cast(removedRay.origin, removedRay.direction, removedRay.distance))); assert.ok(f.cast(retainedRay.origin, retainedRay.direction, retainedRay.distance));
      const remaining = triangles(f); assert.ok(remaining > 0 && remaining < f.originalTriangles);
      f.sim.setFocus(far, true); f.model.update(far); assert.equal(triangles(f), remaining);
      assert.ok(!(f.sim.castUnloadedTargets(removedRay.origin, removedRay.direction, removedRay.distance)));
      assert.equal(f.sim.castUnloadedTargets(retainedRay.origin, retainedRay.direction, retainedRay.distance)?.object, retained.mesh);
      f.removedRay = removedRay;
    }
    return { checkedBuildings: fixtures.length };
  });

  check('every model resets partial and total destruction including debris and collision', () => {
    for (const f of fixtures) {
      f.sim.reset(); f.model.update(f.near); restoreCheck(f); assert.ok(f.cast(f.removedRay.origin, f.removedRay.direction, f.removedRay.distance));
      assert.equal(f.sim.explode(f.local(f.length / 2, 8, f.depth / 2), 140, 100, new THREE.Vector3(0, 1, 0)), f.sim.targets.length);
      for (const player of [f.near, far, f.near]) { f.model.update(player); assert.equal(triangles(f), 0); }
      f.sim.reset(); f.model.update(far); restoreCheck(f); assert.equal(triangles(f), f.originalTriangles);
    }
    return { checkedBuildings: fixtures.length };
  });

  check('all five models follow a changed terrain datum without changing the map outline', () => {
    for (const f of fixtures) {
      const scene = new THREE.Scene(); createFamilyDormLandmark(scene, f.building, getBuildingAppearance(f.building), (x, z) => terrain.heightAt(x, z) + 50);
      const shell = scene.children.find(object => object.userData.role === 'building-shell');
      for (let m = 0; m < f.meshes.length; m++) {
        const values = shell.children[m].geometry.attributes.position.array, original = f.originals[m]; assert.equal(values.length, original.length);
        for (let i = 0; i < values.length; i += 3) { assert.ok(Math.abs(values[i] - original[i]) < .001 && Math.abs(values[i + 2] - original[i + 2]) < .001); assert.ok(Math.abs(values[i + 1] - original[i + 1] - 50) < .001); }
      }
    }
    return { checkedBuildings: fixtures.length, terrainOffset: 50 };
  });
  console.log(`Family dorm checks: ${results.length}/${results.length} passed.`);
  console.log('Scope: five actual building outlines and geometry/physics regression. Front orientation, heights and unseen rear elevations remain estimates. No browser or physical-phone test.');
} finally {
  for (const f of fixtures) f.sim.world.free();
  await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ scope: 'Geometry and physics regression, not survey accuracy, full photographic fidelity, browser rendering or mobile hardware.', results }, null, 2) + '\n');
}
