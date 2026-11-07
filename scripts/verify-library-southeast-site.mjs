import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts/library-southeast-test');
await mkdir(out, { recursive: true });
const hashes = {};
for (const filename of (await readdir(path.join(root, 'src'))).filter(n => n.endsWith('.ts'))) {
  const source = await readFile(path.join(root, 'src', filename), 'utf8');
  hashes[filename] = createHash('sha256').update(source).digest('hex');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  await writeFile(path.join(out, filename.replace(/\.ts$/, '.mjs')), js.replace(/from (['"])(\.\/[\w-]+)\1/g, "from '$2.mjs'"));
}
const { createLibraryLandmark } = await import(pathToFileURL(path.join(out, 'libraryLandmark.mjs')));
const { createTerrain } = await import(pathToFileURL(path.join(out, 'terrain.mjs')));
const { getBuildingAppearance } = await import(pathToFileURL(path.join(out, 'buildingAppearance.mjs')));
const { Simulation } = await import(pathToFileURL(path.join(out, 'physics.mjs')));
await RAPIER.init();
const data = JSON.parse(await readFile(path.join(root, 'public/data/campus.json'), 'utf8'));
const dem = JSON.parse(await readFile(path.join(root, 'public/data/terrain.json'), 'utf8'));
const b = data.buildings.find(b => b.id === 'way/329398175'), raw = JSON.stringify({ b, dem });
const scene = new THREE.Scene(), terrain = createTerrain(scene, dem, data.buildings, {librarySoutheast:false});
const model = createLibraryLandmark(scene, b, getBuildingAppearance(b), terrain.heightAt);
const shell = scene.children.find(o => o.userData.role === 'building-shell'), info = shell.userData, site = info.southeastSite;
const meshes = shell.children.filter(o => o.isMesh), original = meshes.map(m => m.geometry.attributes.position.array.slice());
const axis = new THREE.Vector3(info.axis.x, 0, info.axis.z), across = new THREE.Vector3(-info.axis.z, 0, info.axis.x), up = new THREE.Vector3(0, 1, 0);
const origin = new THREE.Vector3(info.localOrigin.x, info.localOrigin.y, info.localOrigin.z);
const point = (x, y, z) => origin.clone().addScaledVector(axis, x).addScaledVector(across, z).addScaledVector(up, y);
const local = p => { const q = p.clone().sub(origin); return [q.dot(axis), q.y, q.dot(across)]; };
const near = point(site.stairs.x, site.terrace.floor + 1.7, -20), far = new THREE.Vector3(100000, 500, 100000);
const sim = new Simulation(model.breakables, [], near, data.bounds, terrain), results = [];
function check(name, fn) { try { const metrics = fn(); results.push({ name, status: 'passed', ...metrics }); console.log('PASS ' + name + ' ' + JSON.stringify(metrics)); } catch (e) { results.push({ name, status: 'failed', error: String(e.stack || e) }); console.log('FAIL ' + name + ' ' + e.message); } }
function reset() { sim.reset(); sim.setFocus(near, true); sim.world.step(); model.update(near); }
function visual(p, d, distance) { scene.updateMatrixWorld(true); return new THREE.Raycaster(p, d, 0, distance).intersectObjects(meshes, false)[0] ?? null; }
function cast(p, d, distance) { const lookup = new Map(sim.targets.filter(t => t.body).map(t => [t.body.handle, t])); const hit = sim.world.castRay(new RAPIER.Ray(p, d), distance, true, undefined, undefined, undefined, undefined, c => lookup.has(c.parent()?.handle)); return hit ? { object: lookup.get(hit.collider.parent().handle).mesh, distance: hit.timeOfImpact } : null; }
function triangles() { if (!shell.visible) return 0; let count = 0; for (const m of meshes) { const p = m.geometry.attributes.position; for (let i = 0; i < p.count; i += 3) { const a = new THREE.Vector3().fromBufferAttribute(p, i), b = new THREE.Vector3().fromBufferAttribute(p, i + 1), c = new THREE.Vector3().fromBufferAttribute(p, i + 2); if (b.sub(a).cross(c.sub(a)).lengthSq() > 1e-10) count++; } } return count; }
function walk(route, onTerrace = false) {
  const first = route[0], spawn = point(first.x, onTerrace ? site.terrace.floor + 1.7 : 0, first.z);
  if (!onTerrace) spawn.y = terrain.heightAt(spawn.x, spawn.z) + 1.7;
  sim.teleport(spawn); for (let i = 0; i < 30; i++) sim.step(1 / 60, 0, 0, false);
  const segments = [];
  for (let j = 1; j < route.length; j++) {
    let frames = 0, stalled = 0, last = new THREE.Vector3().copy(sim.player.translation());
    for (; frames < 1000; frames++) {
      const p = new THREE.Vector3().copy(sim.player.translation()), l = local(p), dx = route[j].x - l[0], dz = route[j].z - l[2], length = Math.hypot(dx, dz);
      if (length < .12) break;
      sim.step(1 / 60, (axis.x * dx + across.x * dz) / length * 6, (axis.z * dx + across.z * dz) / length * 6, false);
      const q = new THREE.Vector3().copy(sim.player.translation()); stalled = q.distanceTo(last) < .002 ? stalled + 1 : 0; last.copy(q); if (stalled > 120) break;
    }
    const end = local(new THREE.Vector3().copy(sim.player.translation())), distance = Math.hypot(end[0] - route[j].x, end[2] - route[j].z);
    segments.push({ frames, end, distance }); if (distance > .2) break;
  }
  return { reached: segments.length === route.length - 1 && segments.at(-1).distance < .2, segments };
}
try {
  reset();
  check('retained upper envelope and bounded merged southeast geometry', () => {
    assert.equal(meshes.length, 3); assert.equal(info.dimensions.length, 165); assert.equal(info.dimensions.depth, 30); assert.equal(info.bridgeBottom, 30.25);
    assert.equal(JSON.stringify({ b, dem }), raw); assert.ok(model.breakables.length < 900);
    const main = data.buildings.find(b => b.id === 'way/148286730').points.slice(0, -1), x = main.reduce((s, p) => s + p[0], 0) / main.length, z = main.reduce((s, p) => s + p[1], 0) / main.length;
    assert.ok(Math.abs(origin.y - terrain.heightAt(x, z)) < 1e-6);
    assert.ok(sim.targets.filter(t => t.mesh.userData.southeastSite).every(t => t.collisionVertices));
    return { parts: model.breakables.length, triangles: triangles(), renderMeshes: meshes.length, base: origin.y, terraceWorldY: origin.y + site.terrace.floor, openHeight: site.openBay.ceiling - site.terrace.floor, site };
  });
  check('actual terrace void remains open through its depth', () => {
    const rows = [];
    for (const x of [-40, -10, 20, 40]) { const p = point(x, site.terrace.floor + 1.7, -17), d = across.clone(); assert.equal(visual(p, d, 18), null); assert.equal(cast(p, d, 18), null); rows.push({ p, d }); }
    sim.setFocus(far, true); for (const r of rows) assert.equal(sim.castUnloadedTargets(r.p, r.d, 18), null); reset(); return { rays: rows.length, distance: 18 };
  });
  check('site glass is above the supplied terrain and has thin exposed collision', () => {
    let samples = 0, minimum = Infinity, rays = 0, maxDifference = 0, maxUnloadedDifference = 0; const rows = [];
    for (const t of sim.targets.filter(t => t.mesh.userData.southeastSite && t.material === 'glass')) {
      const p = t.mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(t.mesh.matrixWorld); minimum = Math.min(minimum, v.y - terrain.heightAt(v.x, v.z)); samples++; }
      const p0 = t.mesh.position.clone().addScaledVector(across, -.4), d = across.clone(), r = visual(p0, d, .8); if (!r) continue;
      sim.setFocus(p0, true); sim.world.step(); const hit = cast(p0, d, .8); assert.ok(hit); maxDifference = Math.max(maxDifference, Math.abs(r.distance - hit.distance)); rows.push({ p: p0, d, hit }); rays++;
    }
    assert.ok(minimum > .1 && samples > 100 && rays > 10, JSON.stringify({ minimum, samples, rays })); assert.ok(maxDifference < .005);
    sim.setFocus(far, true); for (const r of rows) { const hit = sim.castUnloadedTargets(r.p, r.d, .8); assert.ok(hit); maxUnloadedDifference = Math.max(maxUnloadedDifference, Math.abs(hit.distance - r.hit.distance)); assert.ok(hit.object === r.hit.object); }
    assert.ok(maxUnloadedDifference < .003); reset(); return { samples, minimum, rays, maxDifference, maxUnloadedDifference };
  });
  check('closed lattice blocks walking and destruction opens three six-metre-per-second return paths', () => {
    const route = offset => [-45, -40.6, -38.8, -30.7, -22.55, -18, -5].map(z => ({ x: site.stairs.x + offset, z }));
    const gate = sim.targets.filter(t => t.mesh.userData.component === 'southeast-folding-gate'); assert.equal(gate.length, 24);
    reset(); const closed = walk(route(0)); assert.ok(!closed.reached && closed.segments.at(-1).end[2] > -22.6, JSON.stringify(closed));
    const paths = [];
    for (const offset of [-2.25, 0, 2.25]) { reset(); for (const t of gate) sim.hit(t, 100, across); model.update(near); const forward = walk(route(offset)), backward = forward.reached ? walk(route(offset).reverse(), true) : null; assert.ok(forward.reached && backward?.reached, JSON.stringify({ offset, forward, backward })); paths.push({ offset, forward, backward }); }
    reset(); return { speed: 6, closed, paths, gateInitiallyClosed: true };
  });
  check('mapped road connects to the ground approach without a hidden initial teleport', () => {
    const road = data.roads.find(r => r.id === 'way/457001557/376'), mapped = road.points.find(p => p[0] === 343.17 && p[1] === -889.08); assert.ok(mapped);
    const p = local(new THREE.Vector3(mapped[0], 0, mapped[1]));
    const route = [{ x: p[0], z: p[2] }, { x: site.stairs.x, z: -40.6 }, { x: site.stairs.x, z: -30.7 }, { x: site.stairs.x, z: -22.55 }, { x: site.stairs.x, z: -7 }];
    reset(); for (const t of sim.targets.filter(t => t.mesh.userData.component === 'southeast-folding-gate')) sim.hit(t, 100, across); model.update(near);
    const forward = walk(route), backward = forward.reached ? walk(route.slice().reverse(), true) : null; assert.ok(forward.reached && backward?.reached, JSON.stringify({ forward, backward })); reset(); return { roadId: road.id, mapped, forward, backward };
  });
  check('southeast structures stay outside the mapped vehicle road width', () => {
    const road = data.roads.find(r => r.id === 'way/457001557/376'); let minimumClearance = Infinity, vertices = 0;
    for (const target of sim.targets.filter(t => t.mesh.userData.southeastSite)) {
      const p = target.mesh.geometry.attributes.position;
      for (let j = 0; j < p.count; j++) {
        const v = new THREE.Vector3().fromBufferAttribute(p, j).applyMatrix4(target.mesh.matrixWorld); let nearest = Infinity;
        for (let i = 0; i < road.points.length - 1; i++) { const a = road.points[i], b = road.points[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], t = THREE.MathUtils.clamp(((v.x - a[0]) * dx + (v.z - a[1]) * dz) / (dx * dx + dz * dz), 0, 1); nearest = Math.min(nearest, Math.hypot(v.x - a[0] - dx * t, v.z - a[1] - dz * t)); }
        minimumClearance = Math.min(minimumClearance, nearest - road.width / 2); vertices++;
      }
    }
    assert.ok(minimumClearance > .05, JSON.stringify({ minimumClearance })); return { vertices, roadId: road.id, widthEstimated: road.widthEstimated, minimumClearance };
  });
  check('cafe doorway opens only after its own glass is destroyed', () => {
    reset(); const e = site.cafeDoor, p = point(e.x, e.floor + 1.5, e.z - .6), d = across.clone(); const before = cast(p, d, 1.2); assert.ok(before && before.object.userData.component === 'southeast-cafe-door'); const target = sim.targets.find(t => t.mesh === before.object); sim.hit(target, 100, d); model.update(near); assert.equal(cast(p, d, 1.2), null); sim.setFocus(far, true); assert.equal(sim.castUnloadedTargets(p, d, 1.2), null); reset(); return { isolatedDoor: true };
  });
  check('partial terrace damage stays absent at distance and reset restores all arrays', () => {
    reset(); const total = triangles(); for (const kind of ['southeast-main-step', 'southeast-glass-balustrade', 'southeast-open-bay-beam']) { const t = sim.targets.find(t => t.mesh.userData.component === kind); assert.ok(t); sim.hit(t, 100, up); } model.update(near); const remaining = triangles(); assert.ok(remaining < total && remaining > 0); for (const distance of [279, 281, 900]) { model.update(point(distance, 30, 0)); assert.equal(triangles(), remaining); } for (let i = 0; i < 3; i++) { reset(); meshes.forEach((m, k) => assert.deepEqual(m.geometry.attributes.position.array, original[k])); } for (const t of sim.targets) sim.hit(t, 100, up); model.update(far); assert.equal(triangles(), 0); reset(); return { total, remaining, cycles: 3 };
  });
  check('single H reflection preserves southeast glass and logical shots', () => {
    const e = site.cafeDoor, p = point(e.x, e.floor + 1.6, e.z - .6), d = across.clone(), r = visual(p, d, 1.2), hit = cast(p, d, 1.2); assert.ok(r && hit);
    const H = p => new THREE.Vector3(p.x, p.y, -p.z); scene.scale.z = -1; scene.updateMatrixWorld(true); const reflected = new THREE.Raycaster(H(p), H(d), 0, 1.2).intersectObjects(meshes, false)[0]; assert.ok(reflected && Math.abs(reflected.distance - r.distance) < .001); sim.setFocus(far, true); const unloaded = sim.castUnloadedTargets(p, d, 1.2); assert.ok(unloaded && unloaded.object === hit.object); scene.scale.z = 1; scene.updateMatrixWorld(true); reset(); return { distanceError: Math.abs(reflected.distance - r.distance) };
  });
} finally {
  sim.world.removeCharacterController(sim.controller); sim.world.free();
  const sourceStillMatches = Object.fromEntries(await Promise.all(Object.entries(hashes).map(async ([name, hash]) => [name, createHash('sha256').update(await readFile(path.join(root, 'src', name))).digest('hex') === hash])));
  await writeFile(path.join(out, 'results.json'), JSON.stringify({ scope: '현재 지도, 지형과 Rapier를 사용한 CPU 검사. 현장 측량, 전체 내부 연결 또는 모바일 화면 검증이 아니다.', hashes, sourceStillMatches, results }, null, 2) + '\n');
}
const failed = results.filter(r => r.status === 'failed'); console.log(`${results.length - failed.length}/${results.length} southeast library checks passed.`); if (failed.length) process.exitCode = 1;
