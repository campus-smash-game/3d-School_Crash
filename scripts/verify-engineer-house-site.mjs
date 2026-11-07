import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'artifacts/engineer-house-site-test');
await fs.mkdir(output, { recursive: true });
for (const file of await fs.readdir(path.join(root, 'src'))) {
  if (!file.endsWith('.ts')) continue;
  const source = await fs.readFile(path.join(root, 'src', file), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  await fs.writeFile(path.join(output, file.replace(/\.ts$/, '.mjs')), compiled.replace(/from (['"])(\.\/[\w-]+)\1/g, "from '$2.mjs'"));
}
const { createTerrain } = await import(pathToFileURL(path.join(output, 'terrain.mjs')));
const { getBuildingAppearance } = await import(pathToFileURL(path.join(output, 'buildingAppearance.mjs')));
const { createEngineerHouseLandmark } = await import(pathToFileURL(path.join(output, 'engineerHouseLandmark.mjs')));
const { Simulation } = await import(pathToFileURL(path.join(output, 'physics.mjs')));
const { createFullCampus } = await import(pathToFileURL(path.join(output, 'fullCampus.mjs')));
const data = JSON.parse(await fs.readFile(path.join(root, 'public/data/campus.json'), 'utf8'));
const elevation = JSON.parse(await fs.readFile(path.join(root, 'public/data/terrain.json'), 'utf8'));
const originalHeights = elevation.heights.slice();
const building = data.buildings.find(b => b.id === 'way/386890466');
assert.ok(building);
const scene = new THREE.Scene(), terrain = createTerrain(scene, elevation, data.buildings);
// Keep the actual footprint and all other pad rules. A neutral ID disables only 310's local plateau.
const baseline = createTerrain(new THREE.Scene(), elevation, data.buildings.map(b => b.id === building.id ? { ...b, id: 'baseline-engineer-house' } : b));
const model = createEngineerHouseLandmark(scene, building, getBuildingAppearance(building), terrain.heightAt);
const shell = scene.children.find(o => o.userData.buildingId === building.id && o.userData.role === 'building-shell');
const meta = shell.userData, origin = new THREE.Vector3(meta.localOrigin.x, meta.localOrigin.y, meta.localOrigin.z);
const along = new THREE.Vector3(meta.axis.x, 0, meta.axis.z), front = new THREE.Vector3(-meta.axis.z, 0, meta.axis.x);
const local = p => { const d = p.clone().sub(origin); return new THREE.Vector3(d.dot(along), d.y, d.dot(front)); };
const world = (x, y, z) => origin.clone().addScaledVector(along, x).addScaledVector(front, z).add(new THREE.Vector3(0, y, 0));
const frontZ = meta.bodyDepth / 2, porchZ = meta.dimensions.depth / 2 + .1;
const results = [], details = {};
const check = async (name, run) => {
  try { const value = await run(); results.push({ name, status: 'passed', ...value }); console.log(`PASS ${name} ${JSON.stringify(value ?? {})}`); }
  catch (error) { results.push({ name, status: 'failed', error: error.message }); console.error(`FAIL ${name}: ${error.message}`); process.exitCode = 1; }
};
const sampleTriangles = (mesh, accept, subdivisions = 8) => {
  const positions = mesh.geometry.getAttribute('position');
  let triangles = 0, samples = 0, minimum = Infinity, beforeMinimum = Infinity, where, beforeWhere;
  for (let i = 0; i < positions.count; i += 3) {
    const vertices = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(positions, i + j));
    if (!accept(vertices.map(local))) continue;
    if (vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0])).lengthSq() < 1e-10) continue;
    triangles++;
    for (let a = 0; a <= subdivisions; a++) for (let b = 0; b <= subdivisions - a; b++) {
      const p = vertices[0].clone().multiplyScalar(1 - (a + b) / subdivisions).addScaledVector(vertices[1], a / subdivisions).addScaledVector(vertices[2], b / subdivisions);
      const clearance = p.y - terrain.heightAt(p.x, p.z), before = p.y - baseline.heightAt(p.x, p.z);
      samples++;
      if (clearance < minimum) { minimum = clearance; where = p.toArray(); }
      if (before < beforeMinimum) { beforeMinimum = before; beforeWhere = p.toArray(); }
    }
  }
  return { triangles, samples, minimumClearance: minimum, where, beforeMinimumClearance: beforeMinimum, beforeWhere };
};
const glass = shell.children.find(m => m.name === 'engineer-house-glazing');
const opaque = shell.children.find(m => m.name === 'engineer-house-metal-and-frame');

await check('actual glazing and sloped roof triangles clear terrain without lifting the model', () => {
  const frontGlass = sampleTriangles(glass, points => points.every(p => Math.abs(p.z - frontZ - .26) < .002));
  const allGlass = sampleTriangles(glass, () => true);
  const roofHalfDepth = meta.bodyDepth / 2 + .9;
  const roofHeight = p => meta.wallTop + (meta.metalRidge - meta.wallTop) * (1 - Math.abs(p.z) / roofHalfDepth);
  const roof = sampleTriangles(opaque, points => points.every(p => Math.abs(p.x) >= meta.skylightHalf - .002 && Math.abs(p.y - roofHeight(p)) < .002));
  assert.ok(frontGlass.samples >= 1000 && roof.samples >= 1000, 'surface classification omitted the real geometry');
  assert.ok(frontGlass.beforeMinimumClearance < -3, 'the original intrusion is no longer exercised');
  assert.ok(roof.beforeMinimumClearance < -.5, 'the original roof intrusion is no longer exercised');
  assert.ok(frontGlass.minimumClearance > .2 && allGlass.minimumClearance > .2);
  assert.ok(roof.minimumClearance > 3);
  assert.equal(origin.y, baseline.heightAt(origin.x, origin.z), 'model elevation changed instead of terrain');
  details.surfaces = { frontGlass, allGlass, roof };
  return { frontGlass, allGlass, roof, unchangedBase: origin.y };
});

const entry = world(0, 0, porchZ), candidates = [];
for (const road of data.roads) for (let i = 0; i + 1 < road.points.length; i++) {
  const a = road.points[i], b = road.points[i + 1], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.ceil(length / 4));
  for (let j = 0; j <= n; j++) {
    const t = j / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
    const p = new THREE.Vector3(x, terrain.heightAt(x, z) + 1.7, z), l = local(p), distance = Math.hypot(x - entry.x, z - entry.z);
    if (l.z < porchZ + 1 || Math.abs(l.x) > meta.dimensions.length / 2 + 40 || distance > 110) continue;
    candidates.push({ id: road.id, segment: i, t, kind: road.kind, drivable: road.drivable, point: p.toArray(), distance });
  }
}
candidates.sort((a, b) => a.distance - b.distance);
const observers = [];
for (const candidate of candidates) {
  if (observers.every(p => Math.hypot(p.point[0] - candidate.point[0], p.point[2] - candidate.point[2]) >= 4)) observers.push(candidate);
  if (observers.length === 20) break;
}
const targets = [
  ['entry-glass-eye', world(0, 1.7, frontZ + .26)],
  ['entry-glass-upper', world(0, meta.wallTop - .5, frontZ + .26)],
  ['entry-canopy', world(0, 5.5, porchZ + .7)],
  ['central-skylight', world(0, (meta.wallTop + 9.95) / 2, (frontZ + .9) / 2)],
  ['left-metal-roof', world(-meta.dimensions.length * .34, (meta.wallTop + meta.metalRidge) / 2, (frontZ + .9) / 2)],
  ['right-metal-roof', world(meta.dimensions.length * .34, (meta.wallTop + meta.metalRidge) / 2, (frontZ + .9) / 2)],
];
scene.updateMatrixWorld(true);
await check('twenty actual road eye positions retain terrain visibility to entry and roof features', () => {
  assert.equal(observers.length, 20);
  const shots = [];
  for (const observer of observers) {
    const road = data.roads.find(r => r.id === observer.id), a = road.points[observer.segment], b = road.points[observer.segment + 1];
    assert.ok(Math.abs(a[0] + (b[0] - a[0]) * observer.t - observer.point[0]) < 1e-8);
    assert.ok(Math.abs(a[1] + (b[1] - a[1]) * observer.t - observer.point[2]) < 1e-8);
    const eye = new THREE.Vector3(...observer.point);
    assert.ok(Math.abs(eye.y - terrain.heightAt(eye.x, eye.z) - 1.7) < 1e-8);
    for (const [name, point] of targets) {
      const direction = point.clone().sub(eye), length = direction.length(); direction.normalize();
      const hit = new THREE.Raycaster(eye, direction, .03, length - .05).intersectObject(terrain.mesh)[0];
      assert.ok(!hit, `${name} hidden by terrain from ${observer.id} segment ${observer.segment}`);
      shots.push({ road: observer.id, eye: observer.point, target: name, terrainBlocked: !!hit });
    }
  }
  details.sightlines = { observers, targets: targets.map(([name, point]) => ({ name, point: point.toArray() })), shots };
  return { observers: observers.length, rays: shots.length, blocked: 0, scope: 'Terrain obstruction only; other buildings, trees and browser rendering are outside this check.' };
});

await check('entry platform stays above terrain and correction remains local', async () => {
  let platformMinimum = Infinity;
  for (let x = -meta.dimensions.length * .28; x <= meta.dimensions.length * .28 + .01; x += meta.dimensions.length * .07) for (const z of [frontZ, (frontZ + porchZ) / 2, porchZ]) {
    const p = world(x, .11, z); platformMinimum = Math.min(platformMinimum, p.y - terrain.heightAt(p.x, p.z));
  }
  assert.ok(platformMinimum > .05, `entry platform is buried: ${platformMinimum}`);
  const reviewed = JSON.parse(await fs.readFile(path.join(root, 'sources/engineer-house-model-notes.json'), 'utf8')).siteReview.correction;
  const gridCount = elevation.width * elevation.height, changed = [], refined = [];
  assert.equal(terrain.vertices.length, baseline.vertices.length, '310 plateau changes terrain topology');
  assert.deepEqual(terrain.indices, baseline.indices, '310 plateau changes triangle topology');
  for (let i = 0; i < terrain.vertices.length; i += 3) {
    assert.equal(terrain.vertices[i], baseline.vertices[i], '310 plateau moves an X coordinate');
    assert.equal(terrain.vertices[i + 2], baseline.vertices[i + 2], '310 plateau moves a Z coordinate');
    const delta = terrain.vertices[i + 1] - baseline.vertices[i + 1];
    if (Math.abs(delta) > 1e-6) (i / 3 < gridCount ? changed : refined).push({ index: i / 3, x: terrain.vertices[i], z: terrain.vertices[i + 2], delta });
  }
  assert.equal(changed.length, reviewed.changedGridVertices, 'correction changed the reviewed original-grid count');
  const changedBounds = { minX: Math.min(...changed.map(p => p.x)), maxX: Math.max(...changed.map(p => p.x)), minZ: Math.min(...changed.map(p => p.z)), maxZ: Math.max(...changed.map(p => p.z)) };
  assert.deepEqual(changedBounds, reviewed.changedVertexBounds, 'correction expanded outside the reviewed original-grid bounds');
  assert.equal(-Math.min(...changed.map(p => p.delta)), reviewed.maxGridCutMetres);
  assert.equal(Math.max(...changed.map(p => p.delta)), reviewed.maxGridFillMetres);
  // 새 세분 정점은 기존 24개 격자점의 삼각형 보간만 이어받아야 한다.
  const changedIndices = new Set(changed.map(p => p.index));
  let maximumInterpolationError = 0;
  for (const p of refined) {
    let c = 0, r = 0;
    while (c < elevation.width - 2 && terrain.vertices[(c + 1) * 3] <= p.x) c++;
    while (r < elevation.height - 2 && terrain.vertices[(r + 1) * elevation.width * 3 + 2] <= p.z) r++;
    const a = r * elevation.width + c, b = a + 1, d = a + elevation.width, e = d + 1;
    assert.ok([a, b, d, e].some(i => changedIndices.has(i)), '310 change escaped its original interpolation cells');
    const u = (p.x - terrain.vertices[a * 3]) / (terrain.vertices[b * 3] - terrain.vertices[a * 3]);
    const v = (p.z - terrain.vertices[a * 3 + 2]) / (terrain.vertices[d * 3 + 2] - terrain.vertices[a * 3 + 2]);
    const delta = i => terrain.vertices[i * 3 + 1] - baseline.vertices[i * 3 + 1];
    const expected = u + v <= 1 ? delta(a) + u * (delta(b) - delta(a)) + v * (delta(d) - delta(a)) : delta(e) + (1 - u) * (delta(d) - delta(e)) + (1 - v) * (delta(b) - delta(e));
    maximumInterpolationError = Math.max(maximumInterpolationError, Math.abs(p.delta - expected));
  }
  assert.ok(maximumInterpolationError < .00004, 'refined 310 changes differ from the reviewed coarse interpolation');
  assert.deepEqual(elevation.heights, originalHeights);
  const reverse = createTerrain(new THREE.Scene(), elevation, data.buildings.toReversed());
  assert.deepEqual(terrain.vertices, reverse.vertices, 'building array order changes the correction');
  details.terrainChange = { vertices: changed, interpolatedVertices: refined, changedBounds, maximumInterpolationError, maxCut: Math.min(...changed.map(p => p.delta)), maxFill: Math.max(...changed.map(p => p.delta)), platformMinimum };
  return { changedVertices: changed.length, interpolatedVertices: refined.length, maximumInterpolationError, reviewedBounds: changedBounds, maxCut: details.terrainChange.maxCut, maxFill: details.terrainChange.maxFill, platformMinimum, rawDEMUnchanged: true };
});

await check('other building centre elevations stay unchanged with a bounded nearest-corner effect', () => {
  const comparisons = [];
  for (const other of data.buildings.filter(b => b.id !== building.id)) {
    const ring = other.points.filter((p, i, all) => i !== all.length - 1 || p[0] !== all[0][0] || p[1] !== all[0][1]);
    const x = ring.reduce((s, p) => s + p[0], 0) / ring.length, z = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    const centreDelta = terrain.heightAt(x, z) - baseline.heightAt(x, z);
    const cornerDelta = Math.max(...ring.map(p => Math.abs(terrain.heightAt(...p) - baseline.heightAt(...p))));
    assert.ok(Math.abs(centreDelta) < 1e-6, `${other.id} centre elevation changed`);
    if (cornerDelta > 1e-6) assert.equal(other.id, 'way/430163191', 'another building footprint is affected');
    comparisons.push({ id: other.id, name: other.name, centre: [x, z], centreDelta, maxAbsFootprintVertexChange: cornerDelta });
  }
  // Only CanvasTexture drawing is stubbed. Inspect the actual generated walls and window matrices.
  globalThis.document = { createElement(tag) {
    assert.equal(tag, 'canvas');
    return { width: 128, height: 128, getContext() { return new Proxy({}, { get(o, key) { return o[key] ?? (() => {}); }, set(o, key, value) { o[key] = value; return true; } }); } };
  } };
  const affected = data.buildings.find(b => b.id === 'way/430163191');
  const inspectNeighbor = ground => {
    const s = new THREE.Scene(), full = createFullCampus(s, { ...data, buildings: [affected], roads: [], areas: [], boundary: [], stops: [] }, ground.heightAt);
    const group = s.children.find(o => o.userData.role === 'building-shell'), windows = group.children.find(o => o.userData.role === 'detailed-windows');
    const matrix = new THREE.Matrix4(), clearances = [];
    let maximumFoundationAboveGround = -Infinity;
    for (let i = 0; i < windows.count; i++) {
      windows.getMatrixAt(i, matrix);
      for (let x = -.5; x <= .501; x += .25) for (const z of [-.5, .5]) {
        const p = new THREE.Vector3(x, -.5, z).applyMatrix4(matrix);
        clearances.push(p.y - ground.heightAt(p.x, p.z));
      }
    }
    for (const part of full.breakables.filter(p => !p.mesh.userData.roof)) for (let x = -.5; x <= .501; x += .125) for (const z of [-.5, .5]) {
      const p = new THREE.Vector3(x, -.5, z).applyMatrix4(part.mesh.matrix);
      maximumFoundationAboveGround = Math.max(maximumFoundationAboveGround, p.y - ground.heightAt(p.x, p.z));
    }
    return { windows: windows.count, minimumWindowClearance: Math.min(...clearances), maximumFoundationAboveGround, clearances };
  };
  const before = inspectNeighbor(baseline), after = inspectNeighbor(terrain);
  assert.ok(after.maximumFoundationAboveGround < 0, 'lowered neighboring ground exposes a foundation gap');
  assert.equal(before.clearances.length, after.clearances.length);
  let worsenedSamples = 0;
  after.clearances.forEach((value, i) => { if (value < before.clearances[i] - .002) worsenedSamples++; });
  assert.equal(worsenedSamples, 0, 'neighboring glazing gained terrain intrusion');
  const neighboringGeometry = { id: affected.id, samples: after.clearances.length, before: { ...before, clearances: undefined }, after: { ...after, clearances: undefined }, worsenedSamples, note: 'The pre-existing lowest window intrusion remains; this local correction introduces no new or deeper sampled glazing intrusion.' };
  details.otherBuildings = comparisons; details.neighboringGeometry = neighboringGeometry;
  return { checkedBuildings: comparisons.length, changedCentres: 0, affectedFootprintVertices: comparisons.filter(p => p.maxAbsFootprintVertexChange > 1e-6), neighboringGeometry };
});

const roadChanges = [];
for (const road of data.roads) for (let i = 0; i + 1 < road.points.length; i++) {
  const a = road.points[i], b = road.points[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 4));
  for (let j = 0; j < n; j++) {
    const p = [a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n];
    const q = [a[0] + (b[0] - a[0]) * (j + 1) / n, a[1] + (b[1] - a[1]) * (j + 1) / n];
    const before = baseline.heightAt(...p), after = terrain.heightAt(...p), beforeQ = baseline.heightAt(...q), afterQ = terrain.heightAt(...q);
    if (Math.abs(after - before) < 1e-6 && Math.abs(afterQ - beforeQ) < 1e-6) continue;
    const distance = Math.hypot(q[0] - p[0], q[1] - p[1]);
    roadChanges.push({ id: road.id, kind: road.kind, drivable: road.drivable, point: p, next: q, before, after, change: after - before, oldGrade: Math.abs(beforeQ - before) / distance, newGrade: Math.abs(afterQ - after) / distance });
  }
}
await check('affected road grades stay walkable and the reviewed entrance segment becomes gentler', () => {
  assert.ok(roadChanges.length > 30);
  assert.ok(roadChanges.every(s => s.newGrade < .45), 'correction creates an excessive road slope');
  const entryRoad = roadChanges.find(s => s.id === 'way/424912283/158' && Math.hypot(s.point[0] - 249.81, s.point[1] + 1972.255) < .001);
  assert.ok(entryRoad, 'reviewed map segment missing');
  const before = entryRoad.oldGrade, after = entryRoad.newGrade;
  assert.ok(after < before);
  details.roads = roadChanges;
  return { affectedSamples: roadChanges.length, maxHeightChange: Math.min(...roadChanges.map(s => s.change)), maxGrade: Math.max(...roadChanges.map(s => s.newGrade)), entryRoadBeforeGrade: before, entryRoadAfterGrade: after };
});

await RAPIER.init();
await check('rendered ground and Rapier terrain collision match corrected heightAt samples', () => {
  const physics = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  physics.createCollider(RAPIER.ColliderDesc.trimesh(terrain.vertices, terrain.indices)); physics.step();
  let maxRenderError = 0, maxPhysicsError = 0;
  const samples = [...observers.map(o => [o.point[0], o.point[2]]), ...roadChanges.map(s => s.point)];
  try {
    for (const [x, z] of samples) {
      const expected = terrain.heightAt(x, z) - .03, eye = new THREE.Vector3(x, expected + 100, z), direction = new THREE.Vector3(0, -1, 0);
      const rendered = new THREE.Raycaster(eye, direction, 0, 200).intersectObject(terrain.mesh)[0];
      const physical = physics.castRay(new RAPIER.Ray(eye, direction), 200, true);
      assert.ok(rendered && physical);
      maxRenderError = Math.max(maxRenderError, Math.abs(rendered.point.y - expected));
      maxPhysicsError = Math.max(maxPhysicsError, Math.abs(eye.y - physical.timeOfImpact - expected));
    }
    assert.ok(maxRenderError < .002 && maxPhysicsError < .015);
  } finally { physics.free(); }
  return { samples: samples.length, maxRenderError, maxPhysicsError, existingGroundOffset: .03 };
});

await check('player capsule walks from the mapped road onto the entrance platform', () => {
  const start = observers.find(o => o.id === 'way/424912283/158' && o.point[0] > 250 && Math.abs(local(new THREE.Vector3(...o.point)).x) < 3);
  assert.ok(start);
  const spawn = new THREE.Vector3(start.point[0], terrain.heightAt(start.point[0], start.point[2]) + 2, start.point[2]);
  const destination = world(0, 0, frontZ + 1.5), sim = new Simulation(model.breakables, [], spawn, data.bounds, terrain);
  try {
    for (let i = 0; i < 120; i++) sim.step(1 / 60, 0, 0, false);
    const from = { ...sim.player.translation() };
    let frames = 0;
    for (; frames < 300; frames++) {
      const p = sim.player.translation(), dx = destination.x - p.x, dz = destination.z - p.z, remaining = Math.hypot(dx, dz);
      if (remaining < .12) break;
      const speed = Math.min(4, remaining * 60); sim.step(1 / 60, dx / remaining * speed, dz / remaining * speed, false);
    }
    const to = { ...sim.player.translation() }, distance = Math.hypot(to.x - from.x, to.z - from.z), remaining = Math.hypot(destination.x - to.x, destination.z - to.z);
    const clearance = to.y - terrain.heightAt(to.x, to.z);
    assert.ok(distance > 10 && remaining < .2, `entrance approach stopped after ${distance}m, ${remaining}m short`);
    assert.ok(clearance > .7 && clearance < 1.2);
    return { from, to, distance, remaining, centreClearance: clearance, frames, scope: 'Exterior platform only. Closed glazing is still a destructible wall.' };
  } finally { sim.world.removeCharacterController(sim.controller); sim.world.free(); }
});

await fs.writeFile(path.join(root, 'artifacts/engineer-house-site-verification.json'), JSON.stringify({ verifiedAt: new Date().toISOString(), buildingId: building.id, tests: results, details, limitations: 'Actual source triangles and Rapier checks, not WebGL rendering, mobile hardware or survey accuracy. Baseline keeps the same raw DEM and every other pad, disabling only the 310-specific plateau by changing its pad ID. Foundation triangles are excluded from surface clearance checks.' }, null, 2) + '\n');
console.log(`Engineer House site checks: ${results.filter(r => r.status === 'passed').length}/${results.length} passed.`);
