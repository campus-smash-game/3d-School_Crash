import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import ts from 'typescript';
import * as T from 'three';
import R from '@dimforge/rapier3d-compat';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); process.chdir(root);
const out = path.join(root, 'artifacts/transit-facilities-test'); await fs.mkdir(out, { recursive: true });
const hashes = {}, hash = s => createHash('sha256').update(s).digest('hex');
for (const name of (await fs.readdir('src')).filter(n => n.endsWith('.ts')).map(n => n.slice(0, -3))) {
  const file = `src/${name}.ts`, text = await fs.readFile(file, 'utf8'); hashes[file] = hash(text);
  await fs.writeFile(path.join(out, name + '.mjs'), ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/from (['"])(\.\/[\w-]+)\1/g, "from '$2.mjs'"));
}
for (const file of ['public/data/campus.json', 'public/data/terrain.json', 'public/data/campus-transit.json', 'public/data/shuttle-stops.json', 'public/data/transit-facilities.json']) hashes[file] = hash(await fs.readFile(file));
globalThis.document = { createElement() { return { width: 0, height: 0, getContext() { return new Proxy({}, { get(o, k) { if (k === 'measureText') return text => ({ width: String(text).length * 16 }); if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} }); return o[k] ?? (() => {}); }, set(o, k, v) { o[k] = v; return true; } }); } }; } };
const [{ createTransitFacilities }, { createTerrain }, { Simulation }, { Traffic }, { createFullCampus }] = await Promise.all(['transitFacilities', 'terrain', 'physics', 'traffic', 'fullCampus'].map(n => import(pathToFileURL(path.join(out, n + '.mjs')))));
await R.init();
const read = async p => JSON.parse(await fs.readFile(p, 'utf8'));
const [data, dem, transit, shuttle, plan] = await Promise.all(['campus', 'terrain', 'campus-transit', 'shuttle-stops', 'transit-facilities'].map(n => read(`public/data/${n}.json`)));
const roads = [...data.roads, ...transit.supplementalRoads], scene = new T.Scene(), terrain = createTerrain(scene, dem, data.buildings);
createFullCampus(scene, { ...data, roads, buildings: [], areas: [], stops: [] }, terrain.heightAt);
const model = createTransitFacilities(scene, plan, terrain.heightAt), spawn = new T.Vector3(shuttle.stops[0].x, terrain.heightAt(shuttle.stops[0].x, shuttle.stops[0].z) + 1.7, shuttle.stops[0].z);
const sim = new Simulation(model.breakables, [], spawn, data.bounds, terrain), results = [];
async function check(name, run) { try { const details = await run(); results.push({ name, status: 'PASS', ...details }); console.log('PASS ' + name); } catch (e) { results.push({ name, status: 'FAIL', error: e.message, details: e.details }); console.log('FAIL ' + name + ': ' + e.message); } }
function must(test, message, details) { if (!test) throw Object.assign(Error(message), { details }); }
function targetHit(o, d, max = 10) {
  const h = sim.world.castRay(new R.Ray(o, d), max, true, undefined, undefined, undefined, undefined, c => sim.targets.some(t => t.body && t.body.handle === c.parent()?.handle));
  return h ? { target: sim.targets.find(t => t.body && t.body.handle === h.collider.parent()?.handle), distance: h.timeOfImpact } : null;
}

await check('facility source records preserve every directed operating stop and both gate sides', async () => {
  for (const [file, expected] of Object.entries(plan.sourceHashes)) assert.equal(hash(await fs.readFile(file)), expected, file);
  const actual = plan.stops.flatMap(s => s.calls.map(c => `${c.routeId}:${c.callIndex}:${c.stopId}`));
  const expected = transit.routes.flatMap(r => r.stops.map((s, i) => `${r.id}:${i}:${s.stopId}`));
  assert.deepEqual([...actual].sort(), [...expected].sort()); assert.equal(new Set(actual).size, actual.length);
  const gate = plan.stops.filter(s => s.calls.some(c => c.stopId === 'snu-101')); assert.equal(gate.length, 2);
  must(gate[0].forward[0] * gate[1].forward[0] + gate[0].forward[1] * gate[1].forward[1] < -.9, 'gate directions merged');
  assert.equal(plan.fixtures.filter(f => f.kind === 'cantilever-signal').length, 1); assert.equal(model.shell.userData.signalCount, 1);
  assert.equal(model.shell.userData.streetLampCount, 6);
  assert.ok(plan.fixtures.filter(f => f.kind === 'standard-shelter').every(f => f.existence === 'osm-shelter-yes' && f.appearance === 'estimated-common-form'));
  return { calls: actual.length, sites: plan.stops.length, gateSides: gate.length, parts: model.breakables.length, renderMeshes: model.shell.userData.renderMeshes, triangles: model.shell.userData.triangles };
});

await check('all site geometry is finite, regionally culled and rooted in the real terrain', () => {
  let vertices = 0, maxRegionSpan = 0, minPoleBase = Infinity;
  for (const mesh of model.shell.children) {
    assert.ok(mesh.frustumCulled); const p = mesh.geometry.attributes.position;
    for (const v of p.array) assert.ok(Number.isFinite(v)); vertices += p.count;
    const size = mesh.geometry.boundingBox.getSize(new T.Vector3()); maxRegionSpan = Math.max(maxRegionSpan, size.x, size.z);
    must(size.x < 250 && size.z < 250, 'batch extends beyond a local region', { name: mesh.name, size: size.toArray() });
  }
  for (const part of model.breakables.filter(p => p.mesh.userData.component === 'stop-pole')) {
    const bottom = part.mesh.position.y - part.size.y / 2, ground = terrain.meshHeightAt(part.mesh.position.x, part.mesh.position.z);
    minPoleBase = Math.min(minPoleBase, bottom - ground); must(bottom <= ground + .03 && bottom >= ground - .08, 'post floats or sinks excessively', { bottom, ground });
  }
  return { vertices, maxRegionSpan, minPoleBase, actualTerrain: true };
});

await check('existing fifteen shuttle starting capsules remain clear of new facilities', () => {
  const positions = [];
  for (const stop of shuttle.stops) {
    const p = new T.Vector3(stop.x, terrain.heightAt(stop.x, stop.z) + 1.7, stop.z); sim.teleport(p);
    for (let i = 0; i < 30; i++) sim.step(1 / 60, 0, 0, false);
    const player = sim.player.translation(), shape = new R.Capsule(.5, .35), contacts = [];
    for (const target of sim.targets.filter(t => t.body)) for (let i = 0; i < target.body.numColliders(); i++) { const c = target.body.collider(i), hit = c.contactShape(shape, player, { x: 0, y: 0, z: 0, w: 1 }, .01); if (hit && hit.distance < -.002) contacts.push({ component: target.mesh.userData.component, site: target.mesh.userData.siteId, distance: hit.distance }); }
    must(contacts.length === 0, 'shuttle start overlaps facility', { id: stop.id, contacts }); positions.push({ id: stop.id, contacts: contacts.length });
  }
  return { starts: positions };
});

await check('actual curved bus routes and all stopping poses clear the new facility colliders', () => {
  const traffic = new Traffic(new T.Scene(), roads, terrain.heightAt, transit);
  for (const target of sim.targets) if (!target.body) sim.addTarget(target); sim.world.step();
  const owners = new Map(sim.targets.map(t => [t.body.handle, t])); let poses = 0; const contacts = [], bounds = new T.Box3();
  for (const part of traffic.fleets.bus.parts) { part.mesh.geometry.computeBoundingBox(); bounds.union(part.mesh.geometry.boundingBox); }
  const size = bounds.getSize(new T.Vector3()), envelopeCenter = bounds.getCenter(new T.Vector3());
  for (const route of traffic.routes) {
    const vehicle = traffic.vehicles.find(v => v.transit?.route === route); assert.ok(vehicle);
    const progress = new Set([...Array.from({ length: Math.ceil(route.length / 2) + 1 }, (_, i) => Math.min(i * 2, route.length)), ...route.stops.map(s => s.progress)]);
    for (const d of [...progress].sort((a, b) => a - b)) {
      vehicle.transit.progress = d; vehicle.transit.pieceIndex = 0; traffic.placeTransit(vehicle); traffic.pose(vehicle);
      const shape = new R.Cuboid(size.x / 2, size.y / 2, size.z / 2), center = vehicle.position.clone().add(envelopeCenter.clone().applyQuaternion(vehicle.quaternion));
      sim.world.intersectionsWithShape(center, vehicle.quaternion, shape, c => { const target = owners.get(c.parent()?.handle); if (target) { const hit = c.contactShape(shape, center, vehicle.quaternion, 0); if (hit && hit.distance < -.005) contacts.push({ route: route.definition.id, component: target.mesh.userData.component, site: target.mesh.userData.siteId, point: vehicle.position.toArray(), distance: hit.distance }); } return true; }); poses++;
    }
  }
  traffic.dispose(); must(contacts.length === 0, 'bus body or mirror envelope intersects a roadside object', contacts.slice(0, 12));
  return { poses, routes: transit.routes.length, samplingMetres: 2, busEnvelope: size.toArray(), contacts: contacts.length };
});

await check('photo-based gate tunnel and OSM-backed shelters keep their real walking channels open', () => {
  const paths = [];
  function walk(goal) { let frames = 0; for (; frames < 360; frames++) { const now = new T.Vector3().copy(sim.player.translation()), delta = goal.clone().sub(now).setY(0); if (delta.length() < .16) break; delta.normalize(); sim.step(1 / 60, delta.x * 6, delta.z * 6, false); } return { frames, remaining: new T.Vector3().copy(sim.player.translation()).sub(goal).setY(0).length() }; }
  for (const fixture of plan.fixtures.filter(f => f.kind.includes('shelter'))) {
    const v = fixture.kind === 'arched-shelter' ? .3 : .45;
    const make = u => { const p = fixture.position.map((n, i) => n + fixture.forward[i] * u - fixture.outward[i] * v); return new T.Vector3(p[0], terrain.heightAt(...p) + 1.7, p[1]); };
    const start = make(-fixture.length / 2 - .65), end = make(fixture.length / 2 + .65); sim.teleport(start);
    for (let i = 0; i < 20; i++) sim.step(1 / 60, 0, 0, false);
    const out = walk(end), back = walk(start); must(out.remaining < .18 && back.remaining < .18, 'shelter passage blocks the actual capsule', { id: fixture.id, out, back });
    paths.push({ id: fixture.id, out, back });
  }
  const tunnel = model.shell.userData.fixtures.find(f => f.kind === 'arched-shelter'); assert.equal(tunnel.openEnds, true); assert.equal(tunnel.ribs, 13);
  return { paths, tunnelMaterialConfirmedTransparent: false };
});

await check('crosswalk paint clips to the actual fullCampus road triangles without a floating slab', () => {
  const mesh = model.shell.getObjectByName('transit-facilities/gate-crosswalk'), roads = scene.getObjectByName('campus-road-surface');
  assert.ok(mesh && roads); const p = mesh.geometry.attributes.position, ray = new T.Raycaster(); let min = Infinity, max = -Infinity, samples = 0;
  for (let i = 0; i < p.count; i += 3) {
    const a = new T.Vector3().fromBufferAttribute(p, i), b = new T.Vector3().fromBufferAttribute(p, i + 1), c = new T.Vector3().fromBufferAttribute(p, i + 2);
    if (new T.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).length() < 1e-8) continue;
    for (const weights of [[1 / 3, 1 / 3, 1 / 3], [.1, .3, .6]]) {
      const q = a.clone().multiplyScalar(weights[0]).addScaledVector(b, weights[1]).addScaledVector(c, weights[2]);
      ray.set(new T.Vector3(q.x, q.y + 20, q.z), new T.Vector3(0, -1, 0)); const hit = ray.intersectObject(roads, false)[0];
      must(hit, 'paint lies outside the actual road', { triangle: i / 3, point: q.toArray(), a: a.toArray(), b: b.toArray(), c: c.toArray() }); const gap = q.y - hit.point.y; min = Math.min(min, gap); max = Math.max(max, gap); samples++;
    }
  }
  must(samples > 100 && min > .025 && max < .045, 'paint floats or is buried by the road surface', { min, max, samples });
  assert.equal(sim.targets.filter(t => t.mesh.userData.component === 'crosswalk').length, 0);
  return { samples, minRoadClearance: min, maxRoadClearance: max, roadInput: 'createFullCampus production ribbon', physicalSlab: false };
});

await check('signal lenses face the observed approach and retain independent colors through update damage and reset', () => {
  sim.reset(); model.update(spawn);
  const lenses = model.shell.children.flatMap(mesh => (mesh.userData.parts ?? []).filter(p => p.baseColor === 0x36b27c).map(p => ({ mesh, p })));
  const diffusers = model.shell.children.flatMap(mesh => (mesh.userData.parts ?? []).filter(p => p.baseColor === 0xd8dfd8).map(p => ({ mesh, p })));
  assert.equal(lenses.length, 2); assert.equal(diffusers.length, 12);
  const original = [...lenses, ...diffusers].map(({ mesh, p }) => mesh.geometry.attributes.color.array.slice(p.start * 3, (p.start + p.count) * 3));
  const facing = [];
  for (const { mesh, p } of lenses) {
    const target = sim.targets.find(t => t.mesh.uuid === p.owner), signal = plan.fixtures.find(f => f.kind === 'cantilever-signal');
    const normal = new T.Vector3(-signal.forward[0], 0, -signal.forward[1]);
    const cameraVector = new T.Vector3(113 - target.mesh.position.x, 0, 139 - target.mesh.position.z).normalize();
    must(normal.dot(cameraVector) > .9, 'signal lens faces away from the photographed approach'); facing.push(normal.dot(cameraVector));
    const red = mesh.userData.parts.find(r => r.owner === p.owner && r.baseColor === 0x4b2525);
    const centerOf = part => { const attr = mesh.geometry.attributes.position, sum = new T.Vector3(); for (let i = part.start; i < part.start + part.count; i++) sum.add(new T.Vector3(attr.getX(i), attr.getY(i), -attr.getZ(i))); return sum.multiplyScalar(1 / part.count); };
    const greenPosition = centerOf(p), redPosition = centerOf(red), renderCamera = new T.Vector3(113, target.mesh.position.y, -139), look = greenPosition.clone().add(redPosition).multiplyScalar(.5).sub(renderCamera).normalize();
    const screenRight = new T.Vector3().crossVectors(look, new T.Vector3(0, 1, 0)).normalize();
    must(greenPosition.clone().sub(redPosition).dot(screenRight) > .6, 'H-reflected signal has green on the left');
  }
  [...lenses, ...diffusers].forEach(({ mesh, p }, i) => { const tint = new T.Color(p.baseColor), a = mesh.geometry.attributes.color; for (let j = p.start; j < p.start + p.count; j++) assert.ok(Math.abs(a.getX(j) - tint.r) + Math.abs(a.getY(j) - tint.g) + Math.abs(a.getZ(j) - tint.b) < 1e-6); });
  const owner = sim.targets.find(t => t.mesh.uuid === lenses[0].p.owner); sim.teleport(owner.mesh.position.clone().add(new T.Vector3(0, 0, 5)));
  sim.hit(owner, .5, new T.Vector3(1, 0, 0)); sim.step(1 / 60, 0, 0, false); model.update(spawn);
  const damaged = lenses[0].mesh.geometry.attributes.color.array.slice(lenses[0].p.start * 3, (lenses[0].p.start + lenses[0].p.count) * 3);
  must(damaged.some((v, i) => v !== original[0][i]), 'damage flash did not follow its owner');
  sim.hit(owner, 100, new T.Vector3(1, 0, 0)); model.update(spawn);
  const pp = lenses[0].mesh.geometry.attributes.position, start = lenses[0].p.start;
  for (let i = start + 1; i < start + lenses[0].p.count; i++) assert.deepEqual([pp.getX(i), pp.getY(i), pp.getZ(i)], [pp.getX(start), pp.getY(start), pp.getZ(start)]);
  sim.reset(); model.update(spawn);
  [...lenses, ...diffusers].forEach(({ mesh, p }, i) => assert.deepEqual(mesh.geometry.attributes.color.array.slice(p.start * 3, (p.start + p.count) * 3), original[i]));
  return { greenLenses: lenses.length, lampDiffusers: diffusers.length, approachFacingDot: facing, restoredIndependentColors: true };
});

await check('rendered thin panels and polygon poles agree with loaded and unloaded ray queries', () => {
  let rays = 0, maxRenderError = 0, maxUnloadedError = 0;
  const caster = new T.Raycaster();
  for (const site of model.shell.userData.stopSites) for (const component of ['stop-panel', 'stop-pole']) {
    const target = sim.targets.find(t => t.mesh.userData.siteId === site.id && t.mesh.userData.component === component);
    sim.teleport(target.mesh.position.clone().add(new T.Vector3(0, 0, 4))); sim.world.step();
    const direction = new T.Vector3(site.outward[0], 0, site.outward[1]);
    const origin = target.mesh.position.clone().addScaledVector(direction, -2); caster.set(origin, direction);
    const rendered = caster.intersectObject(target.mesh, false)[0]; assert.ok(rendered);
    const loaded = targetHit(origin, direction, 4);
    sim.setFocus(new T.Vector3(-5000, 0, -5000), true);
    const unloaded = sim.castUnloadedTargets(origin, direction, 4);
    must(loaded?.target === target && unloaded?.target === target, 'ray selects a different facility', { component, site: site.id, loaded: loaded ? { component: loaded.target?.mesh.userData.component, distance: loaded.distance } : null, unloaded: unloaded ? { component: unloaded.target.mesh.userData.component, distance: unloaded.distance } : null });
    maxRenderError = Math.max(maxRenderError, Math.abs(loaded.distance - rendered.distance)); maxUnloadedError = Math.max(maxUnloadedError, Math.abs(loaded.distance - unloaded.distance)); rays++;
  }
  must(maxRenderError < .002 && maxUnloadedError < .002, 'facility proxy differs from its rendered surface', { maxRenderError, maxUnloadedError });
  return { rays, maxRenderError, maxUnloadedError };
});

await check('partial destruction keeps labels attached and resets all regional buffers at distance', () => {
  sim.reset(); model.update(spawn);
  const buffers = model.shell.children.map(m => m.geometry.attributes.position.array.slice());
  const target = sim.targets.find(t => t.mesh.userData.component === 'stop-panel');
  sim.hit(target, 100, new T.Vector3(1, 0, 0)); model.update(spawn);
  let changedVertices = 0; model.shell.children.forEach((m, i) => { const p = m.geometry.attributes.position.array; for (let j = 0; j < p.length; j += 3) if (p[j] !== buffers[i][j] || p[j + 1] !== buffers[i][j + 1] || p[j + 2] !== buffers[i][j + 2]) changedVertices++; });
  must(changedVertices >= 30, 'panel or attached labels remain visible', { changedVertices });
  const broken = model.shell.children.map(m => m.geometry.attributes.position.array.slice());
  for (const distance of [279, 281, 900]) { model.update(spawn.clone().add(new T.Vector3(distance, 0, 0))); model.shell.children.forEach((m, i) => assert.deepEqual(m.geometry.attributes.position.array, broken[i])); }
  sim.reset(); model.update(spawn); model.shell.children.forEach((m, i) => assert.deepEqual(m.geometry.attributes.position.array, buffers[i]));
  return { changedVertices, restoredMeshes: buffers.length, distances: [279, 281, 900] };
});

await check('one world reflection preserves facility geometry and readable road-facing label order', () => {
  const logical = sim.targets[0].mesh.position.clone(); scene.scale.z = -1; scene.updateMatrixWorld(true);
  const meshes = model.shell.children.filter(m => m.userData.labelRanges.length); let faces = 0;
  for (const mesh of meshes) {
    const p = mesh.geometry.attributes.position, uv = mesh.geometry.attributes.uv;
    for (const range of mesh.userData.labelRanges) for (let i = range.start; i < range.start + range.count; i += 6) {
      const points = Array.from({ length: 6 }, (_, j) => new T.Vector3().fromBufferAttribute(p, i + j).applyMatrix4(mesh.matrixWorld));
      const center = points.reduce((s, q) => s.add(q), new T.Vector3()).multiplyScalar(1 / 6);
      const site = model.shell.userData.stopSites.reduce((best, s) => { const d = Math.hypot(s.position[0] - center.x, -s.position[2] - center.z); return !best || d < best.d ? { s, d } : best; }, null).s;
      const towardRoad = new T.Vector3(-site.outward[0], 0, site.outward[1]);
      const normal = new T.Vector3().crossVectors(points[1].clone().sub(points[0]), points[2].clone().sub(points[0])).normalize().negate();
      if (normal.dot(towardRoad) < .9) continue;
      const right = new T.Vector3().crossVectors(towardRoad.clone().negate(), new T.Vector3(0, 1, 0)).normalize();
      const lo = points.filter((_, j) => uv.getX(i + j) < .1), hi = points.filter((_, j) => uv.getX(i + j) > .9);
      must(hi[0].clone().sub(lo[0]).dot(right) > 0, 'stop label reads backwards after H'); faces++;
    }
  }
  scene.scale.z = 1; scene.updateMatrixWorld(true); assert.deepEqual(sim.targets[0].mesh.position.toArray(), logical.toArray());
  assert.equal(faces, plan.stops.length); return { roadFacingLabels: faces, physicsCoordinatesUnchanged: true };
});

const sourceStillMatches = {}; for (const [file, expected] of Object.entries(hashes)) sourceStillMatches[file] = hash(await fs.readFile(file)) === expected;
await fs.writeFile(path.join(out, 'results.json'), JSON.stringify({ scope: 'Node geometry, actual DEM, Rapier and production Traffic poses. No browser or mobile FPS claim.', hashes, sourceStillMatches, results }, null, 2) + '\n');
sim.world.removeCharacterController(sim.controller); sim.world.free();
if (results.some(r => r.status === 'FAIL') || Object.values(sourceStillMatches).some(v => !v)) process.exitCode = 1;
