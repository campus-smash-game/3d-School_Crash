import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, 'artifacts/global-engineering-test'); await mkdir(artifacts, { recursive: true });
for (const name of ['terrain', 'physics', 'observedAppearances', 'buildingAppearance', 'globalEngineeringLandmark', 'engineering301303Site', 'livingScienceCourtyardSite', 'educationParkingSite', 'educationParkingTerrain', 'dining76Site', 'dining76Terrain', 'dining76EastSite', 'dining76EastTerrain', 'education101EntrySite', 'education101EntryTerrain', 'education12Site', 'education12Terrain', 'humanitiesGardenSite', 'humanitiesGardenTerrain']) {
  const source = await readFile(path.join(root, `src/${name}.ts`), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  await writeFile(path.join(artifacts, `${name}.mjs`), compiled.replace(/from '(\.\/[\w-]+)'/g, "from '$1.mjs'"));
}
const { createTerrain } = await import(pathToFileURL(path.join(artifacts, 'terrain.mjs')).href);
const { getBuildingAppearance } = await import(pathToFileURL(path.join(artifacts, 'buildingAppearance.mjs')).href);
const { createGlobalEngineeringLandmark } = await import(pathToFileURL(path.join(artifacts, 'globalEngineeringLandmark.mjs')).href);
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
const building = data.buildings.find(b => b.id === 'way/93549089'); assert.ok(building, 'reviewed building 38 footprint missing');
const terrain = createTerrain(new THREE.Scene(), elevation, data.buildings), scene = new THREE.Scene();
const profile = getBuildingAppearance(building), model = createGlobalEngineeringLandmark(scene, building, profile, terrain.heightAt);
const shell = scene.children.find(object => object.userData.buildingId === building.id && object.userData.role === 'building-shell'); assert.ok(shell);
const meshes = shell.children.filter(object => object.isMesh), originals = meshes.map(mesh => mesh.geometry.attributes.position.array.slice()); scene.updateMatrixWorld(true);
const points = building.points.slice(0, -1), signedArea = points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0);
const edges = points.map((p, i) => ({ a: new THREE.Vector3(p[0], 0, p[1]), b: new THREE.Vector3(points[(i + 1) % points.length][0], 0, points[(i + 1) % points.length][1]) }));
const along = edges.map(({ a, b }) => b.clone().sub(a)).sort((a, b) => b.lengthSq() - a.lengthSq())[0].normalize(); if (along.x < 0) along.negate();
const across = new THREE.Vector3(-along.z, 0, along.x), xs = points.map(p => new THREE.Vector3(p[0], 0, p[1]).dot(along)), zs = points.map(p => new THREE.Vector3(p[0], 0, p[1]).dot(across));
const length = Math.max(...xs) - Math.min(...xs), depth = Math.max(...zs) - Math.min(...zs);
const origin = along.clone().multiplyScalar((Math.max(...xs) + Math.min(...xs)) / 2).addScaledVector(across, (Math.max(...zs) + Math.min(...zs)) / 2); origin.y = terrain.heightAt(origin.x, origin.z);
const local = (x, y, z) => origin.clone().addScaledVector(along, x).addScaledVector(across, z).add(new THREE.Vector3(0, y, 0));
const near = local(0, 2, depth / 2 + 8), far = new THREE.Vector3(100000, 100, 100000);
const sim = new Simulation(model.breakables, [], local(0, 70, 0), data.bounds, terrain), collisionState = collisionVerifier(sim), results = [];
function cast(origin, direction, distance) {
  sim.setFocus(origin, true); sim.world.step();
  return sim.world.castRay(new RAPIER.Ray(origin, direction), distance, true, undefined, undefined, undefined, undefined, collider => sim.targets.some(target => target.body && target.body.handle === collider.parent()?.handle));
}
function check(name, run) { const details = run(); results.push({ name, status: 'passed', ...details }); console.log(`PASS ${name}${details ? ` ${JSON.stringify(details)}` : ''}`); }
function triangles() {
  if (!shell.visible) return 0;
  let count = 0; const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (const mesh of meshes) { const p = mesh.geometry.attributes.position; for (let i = 0; i < p.count; i += 3) { a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2); if (b.sub(a).cross(c.sub(a)).lengthSq() > 1e-10) count++; } }
  return count;
}
function restored() {
  assert.equal(sim.destroyed, 0); assert.equal(sim.debris.length, 0);
  collisionState.restored();
  meshes.forEach((mesh, i) => assert.deepEqual(mesh.geometry.attributes.position.array, originals[i]));
}
function rayFor(target) {
  const direction = new THREE.Vector3().fromArray(target.mesh.userData.outward).negate();
  return { origin: target.mesh.position.clone().addScaledVector(direction, -2), direction, distance: 2.5 };
}
const originalTriangles = triangles(); let removedRay, retainedRay, damaged, retained;
try {
  check('the real map outline carries five floors and separate raised glazing and pilotis', () => {
    assert.ok(meshes.length <= 3 && meshes.length > 0); assert.equal(shell.userData.levels, 5);
    assert.ok(model.breakables.every(part => part.size.toArray().every(value => Number.isFinite(value) && value > 0)));
    assert.ok(meshes.every(mesh => Array.from(mesh.geometry.attributes.position.array).every(Number.isFinite)));
    assert.ok(sim.targets.some(target => target.mesh.userData.component === 'round-pilotis-column'));
    assert.ok(sim.targets.some(target => target.mesh.userData.component === 'recessed-entry'));
    const tiers = new Set(sim.targets.filter(target => target.mesh.userData.component === 'upper-curtain').map(target => Math.round(target.mesh.userData.paneBottom * 10)));
    assert.equal(tiers.size, 4, 'four upper floors above the recessed ground floor are missing');
    const glass = meshes.find(mesh => mesh.name.endsWith('blue-glazing')).geometry.attributes.position;
    for (let i = 0; i < glass.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(glass, i); if (v.y < origin.y + 6.2) continue;
      const nearest = Math.min(...edges.map(({ a, b }) => { const p = v.clone(); p.y = 0; return new THREE.Line3(a, b).closestPointToPoint(p, true, new THREE.Vector3()).distanceTo(p); }));
      assert.ok(nearest < .002, 'upper curtain wall changed the OSM outline');
    }
    return { renderMeshes: meshes.length, breakableParts: sim.targets.length, triangles: originalTriangles, length, depth, baseElevation: origin.y, height: shell.userData.dimensions.height };
  });

  check('visible glass normals face outward and the frame sits outside all four sides', () => {
    const glass = meshes.find(mesh => mesh.name.endsWith('blue-glazing')).geometry.attributes.position;
    let checkedNormals = 0;
    for (let i = 0; i < glass.count; i += 3) {
      const vs = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(glass, i + j)), midpoint = vs[0].clone().add(vs[1]).add(vs[2]).multiplyScalar(1 / 3);
      if (midpoint.y < origin.y + 6.2) continue;
      const flat = midpoint.clone(); flat.y = 0;
      const edge = edges.slice().sort((a, b) => new THREE.Line3(a.a, a.b).closestPointToPoint(flat, true, new THREE.Vector3()).distanceToSquared(flat) - new THREE.Line3(b.a, b.b).closestPointToPoint(flat, true, new THREE.Vector3()).distanceToSquared(flat))[0];
      const delta = edge.b.clone().sub(edge.a), outward = new THREE.Vector3(delta.z, 0, -delta.x).multiplyScalar(Math.sign(signedArea)).normalize();
      const normal = vs[1].clone().sub(vs[0]).cross(vs[2].clone().sub(vs[0])).normalize(); assert.ok(normal.dot(outward) > .999, 'upper glass winding faces inward'); checkedNormals++;
    }
    let maxError = 0; const seen = new Set();
    for (const target of sim.targets.filter(target => target.mesh.userData.component === 'upper-curtain')) {
      const normal = new THREE.Vector3().fromArray(target.mesh.userData.outward), key = `${Math.round(normal.x)},${Math.round(normal.z)}`; if (seen.has(key)) continue; seen.add(key);
      const aim = new THREE.Vector3().fromArray(target.mesh.userData.facadeMidpoint); aim.y = target.mesh.userData.paneBottom + .045;
      const from = aim.clone().addScaledVector(normal, 2), direction = normal.clone().negate();
      const visual = new THREE.Raycaster(from, direction, 0, 2.2).intersectObjects(meshes, false)[0], hit = cast(from, direction, 2.2); assert.ok(visual && hit);
      assert.ok(visual.point.clone().sub(aim).dot(normal) > .175, 'frame is buried behind glass');
      const error = Math.abs(visual.distance - hit.timeOfImpact); assert.ok(error < .04, 'frame collision misses the visible frame'); maxError = Math.max(maxError, error);
    }
    assert.equal(seen.size, 4); return { upperGlassTriangles: checkedNormals, sides: seen.size, maximumFrameRayError: maxError };
  });

  check('reversing the OSM ring preserves all geometry and collision placement', () => {
    const reversedScene = new THREE.Scene(), reversed = { ...building, points: [...building.points].reverse() };
    const reversedModel = createGlobalEngineeringLandmark(reversedScene, reversed, profile, terrain.heightAt), reversedShell = reversedScene.children.find(object => object.userData.role === 'building-shell');
    assert.equal(reversedModel.breakables.length, model.breakables.length);
    meshes.forEach((mesh, i) => assert.deepEqual(reversedShell.children[i].geometry.attributes.position.array, originals[i], 'reverse winding changed rendered geometry'));
    model.breakables.forEach((part, i) => { assert.ok(part.mesh.position.distanceTo(reversedModel.breakables[i].mesh.position) < 1e-8); assert.ok(part.size.distanceTo(reversedModel.breakables[i].size) < 1e-8); });
    return { identicalBuffers: true };
  });

  check('all visible glazing and entry panels remain above the actual terrain', () => {
    const glazing = meshes.find(mesh => mesh.name.endsWith('blue-glazing')).geometry.attributes.position;
    let minimum = Infinity, samples = 0; const lowest = {};
    for (let i = 0; i < glazing.count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(glazing, i), b = new THREE.Vector3().fromBufferAttribute(glazing, i + 1), c = new THREE.Vector3().fromBufferAttribute(glazing, i + 2);
      for (let u = 0; u <= 6; u++) for (let v = 0; v <= 6 - u; v++) {
        const p = a.clone().multiplyScalar(1 - (u + v) / 6).addScaledVector(b, u / 6).addScaledVector(c, v / 6), clearance = p.y - terrain.heightAt(p.x, p.z); samples++;
        if (clearance < minimum) { minimum = clearance; Object.assign(lowest, { x: p.x, y: p.y, z: p.z }); }
      }
    }
    assert.ok(minimum > .1, `a visible window or entry panel penetrates terrain by ${-minimum} m`);
    for (const target of sim.targets.filter(target => target.mesh.userData.component === 'round-pilotis-column')) assert.ok(target.mesh.position.y - target.size.y / 2 < terrain.heightAt(target.mesh.position.x, target.mesh.position.z), 'column floats above terrain');
    return { glassTriangleSamples: samples, minimumGlazingClearance: minimum, lowest };
  });

  check('the pilotis corridor is open below the soffit and a real player can walk through it', () => {
    const z = depth / 2 - 2.65, start = local(-12, 0, z); start.y = terrain.heightAt(start.x, start.z) + 1.72;
    let minimumHeadroom = Infinity;
    for (let x = -12; x <= 12; x += .5) {
      const p = local(x, 0, z), terrainY = terrain.heightAt(p.x, p.z); minimumHeadroom = Math.min(minimumHeadroom, origin.y + shell.userData.soffit - .225 - terrainY);
      const rayOrigin = new THREE.Vector3(p.x, terrainY + 1.4, p.z); assert.ok(!(cast(rayOrigin, along, .4)), 'pilotis gap is blocked by a solid lower building box');
    }
    assert.ok(minimumHeadroom > 2.5, 'the raised upper mass leaves insufficient walking clearance');
    assert.ok(!(cast(start, along, 24))); assert.equal(new THREE.Raycaster(start, along, 0, 24).intersectObjects(meshes, false).length, 0);
    assert.ok(cast(start, new THREE.Vector3(0, 1, 0), 12), 'exposed upper soffit is missing');
    sim.teleport(start); for (let i = 0; i < 30; i++) sim.step(1 / 60, 0, 0, false);
    const before = new THREE.Vector3().copy(sim.player.translation()); for (let i = 0; i < 180; i++) sim.step(1 / 60, along.x * 5, along.z * 5, false);
    const travelled = new THREE.Vector3().copy(sim.player.translation()).sub(before).dot(along); assert.ok(travelled > 14, `player stuck beneath the raised mass after ${travelled} m`);
    const column = sim.targets.find(target => target.mesh.userData.component === 'round-pilotis-column');
    const columnFrom = column.mesh.position.clone().addScaledVector(across, 2); assert.ok(cast(columnFrom, across.clone().negate(), 3));
    return { minimumHeadroom, walkedMeters: travelled, columnsCollide: true };
  });

  check('partial facade damage matches near and unloaded long-distance shots', () => {
    const candidates = sim.targets.filter(target => target.mesh.userData.component === 'upper-curtain');
    damaged = candidates[Math.floor(candidates.length / 3)]; retained = candidates.find(target => target.mesh.position.distanceTo(damaged.mesh.position) > 15);
    removedRay = rayFor(damaged); retainedRay = rayFor(retained); assert.ok(cast(removedRay.origin, removedRay.direction, removedRay.distance)); assert.ok(cast(retainedRay.origin, retainedRay.direction, retainedRay.distance));
    sim.hit(damaged, damaged.toughness + 1, removedRay.direction); sim.world.step(); model.update(near);
    assert.ok(!(cast(removedRay.origin, removedRay.direction, removedRay.distance))); assert.ok(cast(retainedRay.origin, retainedRay.direction, retainedRay.distance));
    assert.equal(new THREE.Raycaster(removedRay.origin, removedRay.direction, 0, removedRay.distance).intersectObjects(meshes, false).length, 0);
    const remaining = triangles(); assert.ok(remaining > 0 && remaining < originalTriangles); sim.setFocus(far, true); model.update(far); assert.equal(triangles(), remaining);
    assert.ok(!(sim.castUnloadedTargets(removedRay.origin, removedRay.direction, removedRay.distance))); assert.equal(sim.castUnloadedTargets(retainedRay.origin, retainedRay.direction, retainedRay.distance)?.object, retained.mesh);
    return { remainingTriangles: remaining };
  });

  check('partial and total destruction reset exact meshes, collision and debris', () => {
    sim.reset(); model.update(near); restored(); assert.ok(cast(removedRay.origin, removedRay.direction, removedRay.distance));
    assert.equal(sim.explode(local(0, 12, 0), 140, 100, new THREE.Vector3(0, 1, 0)), sim.targets.length);
    for (const player of [near, far, near]) { model.update(player); assert.equal(triangles(), 0); }
    assert.ok(sim.targets.every(target => !target.body)); sim.reset(); model.update(far); restored(); assert.equal(triangles(), originalTriangles);
    return { exactBuffersRestored: true, noGhostColliders: true };
  });

  check('terrain datum changes move all facade, columns and foundation together', () => {
    const shiftedScene = new THREE.Scene(); createGlobalEngineeringLandmark(shiftedScene, building, profile, (x, z) => terrain.heightAt(x, z) + 50);
    const shiftedShell = shiftedScene.children.find(object => object.userData.role === 'building-shell');
    for (let m = 0; m < meshes.length; m++) {
      const values = shiftedShell.children[m].geometry.attributes.position.array, original = originals[m]; assert.equal(values.length, original.length);
      for (let i = 0; i < values.length; i += 3) { assert.ok(Math.abs(values[i] - original[i]) < .001 && Math.abs(values[i + 2] - original[i + 2]) < .001); assert.ok(Math.abs(values[i + 1] - original[i + 1] - 50) < .001); }
    }
    return { terrainOffset: 50 };
  });
  console.log(`Global Engineering checks: ${results.length}/${results.length} passed.`);
  console.log('Scope: actual map geometry, render triangles and Rapier behavior. Dimensions and unseen elevations are estimates; no browser or physical-phone testing.');
} finally {
  sim.world.free(); await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ scope: 'Geometry and physics regression; not survey accuracy, complete photographic fidelity, browser rendering or mobile hardware.', results }, null, 2) + '\n');
}
