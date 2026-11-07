import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import * as T from 'three';
import R from '@dimforge/rapier3d-compat';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts/information-court-approach-test');
await fs.mkdir(out, { recursive: true });
const hashes = {}, hash = value => createHash('sha256').update(value).digest('hex');
for (const file of (await fs.readdir(path.join(root, 'src'))).filter(p => p.endsWith('.ts'))) {
  const source = await fs.readFile(path.join(root, 'src', file), 'utf8'); hashes['src/' + file] = hash(source);
  await fs.writeFile(path.join(out, file.replace('.ts', '.mjs')), ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/from (['"])(\.\/[\w-]+)\1/g, "from '$2.mjs'"));
}
globalThis.document = { createElement() { return { width: 0, height: 0, getContext() { return new Proxy({}, { get(o, k) { if (k === 'measureText') return s => ({ width: String(s).length * 20 }); if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} }); return o[k] ?? (() => {}); }, set(o, k, v) { o[k] = v; return true; } }); } }; } };
const [{ createTerrain }, { createFullCampus }, { createInformationCourtApproach }, { createCentralPlazaFacilities }, { createTransitFacilities }, { Simulation }] = await Promise.all(['terrain', 'fullCampus', 'informationCourtApproach', 'centralPlazaFacilities', 'transitFacilities', 'physics'].map(n => import(pathToFileURL(path.join(out, n + '.mjs')))));
await R.init();
async function dataFile(file) { const buffer = await fs.readFile(path.join(root, file)); hashes[file] = hash(buffer); return JSON.parse(buffer); }
const raw = await dataFile('public/data/campus.json'), transit = await dataFile('public/data/campus-transit.json'), facilities = await dataFile('public/data/transit-facilities.json'), dem = await dataFile('public/data/terrain.json');
const data = { ...raw, roads: [...raw.roads, ...transit.supplementalRoads] }, snapshot = JSON.stringify(raw), scene = new T.Scene();
const terrain = createTerrain(scene, dem, data.buildings), terrainBefore = hash(terrain.vertices), campus = createFullCampus(scene, data, terrain.heightAt);
const existing = [createCentralPlazaFacilities(scene, terrain.heightAt), createTransitFacilities(scene, facilities, terrain.heightAt)];
const originalBuildings = scene.children.filter(o => o.userData.role === 'building-shell').map(o => ({ object: o, hashes: o.children.filter(c => c.isMesh).map(c => hash(c.geometry.attributes.position.array)) }));
const model = createInformationCourtApproach(scene, terrain.heightAt), info = model.shell.userData, mesh = model.shell.children[0], original = mesh.geometry.attributes.position.array.slice();
const axis = new T.Vector3().fromArray(info.axis), across = new T.Vector3().fromArray(info.across), near = new T.Vector3().fromArray(info.route.start).add(new T.Vector3(0, 1.7, 0)), far = new T.Vector3(10000, 500, 10000);
const sim = new Simulation([...campus.breakables, ...existing.flatMap(m => m.breakables), ...model.breakables], campus.colliders, near, data.bounds, terrain), targets = sim.targets.filter(t => t.mesh.userData.facilityId === model.shell.name), results = [];
function expect(value, message, details) { if (!value) throw Object.assign(Error(message), { details }); }
function check(name, fn) { try { const details = fn(); results.push({ name, status: 'PASS', ...details }); console.log('PASS ' + name); } catch (e) { results.push({ name, status: 'FAIL', error: e.message, details: e.details }); console.log('FAIL ' + name + ': ' + e.message + ' ' + JSON.stringify(e.details ?? {})); } }
function update(p) { campus.update(p); existing.forEach(m => m.update(p)); model.update(p); scene.updateMatrixWorld(true); }
function reset() { sim.reset(); sim.setFocus(near, true); sim.world.step(); update(near); }
function visual(p, d, distance) { scene.updateMatrixWorld(true); return new T.Raycaster(p, d, 0, distance).intersectObject(mesh, false)[0]; }
function physical(p, d, distance) { const owners = new Map(targets.filter(t => t.body).map(t => [t.body.handle, t])); const hit = sim.world.castRay(new R.Ray(p, d), distance, true, undefined, undefined, undefined, undefined, c => owners.has(c.parent()?.handle)); return hit ? { target: owners.get(hit.collider.parent().handle), distance: hit.timeOfImpact } : null; }
function contactDepth() { let depth = 0; const p = sim.player.translation(); for (const target of sim.nearby(new T.Vector3(p.x, p.y, p.z), 1.3)) { if (!target.body) continue; const hit = sim.playerCollider.contactCollider(target.body.collider(0), .03); if (hit) depth = Math.max(depth, -hit.distance); } return depth; }
function spawn(p) { sim.teleport(p.clone().setY(terrain.heightAt(p.x, p.z) + 1.7)); for (let i = 0; i < 30; i++) sim.step(1 / 60, 0, 0, false); expect(contactDepth() < .022, 'initial capsule penetrates a static object', { p: p.toArray(), depth: contactDepth() }); }
function walk(destination) {
  let frames = 0, stalls = 0, penetration = 0, airborne = 0;
  for (; frames < 1000; frames++) { const p = new T.Vector3().copy(sim.player.translation()), d = destination.clone().sub(p).setY(0), distance = d.length(); if (distance < .12) break; d.normalize(); sim.step(1 / 60, d.x * 6, d.z * 6, false); const q = new T.Vector3().copy(sim.player.translation()); stalls = q.clone().sub(p).setY(0).length() < .001 ? stalls + 1 : 0; if (frames % 5 === 0) penetration = Math.max(penetration, contactDepth()); if (!sim.grounded) airborne++; if (stalls > 90) break; }
  const end = new T.Vector3().copy(sim.player.translation()); return { destination: destination.toArray(), end: end.toArray(), frames, remaining: end.clone().sub(destination).setY(0).length(), penetration, airborne };
}
function triangleCount() { if (!model.shell.visible) return 0; let count = 0; const p = mesh.geometry.attributes.position; for (let i = 0; i < p.count; i += 3) { const a = new T.Vector3().fromBufferAttribute(p, i), b = new T.Vector3().fromBufferAttribute(p, i + 1), c = new T.Vector3().fromBufferAttribute(p, i + 2); if (b.sub(a).cross(c.sub(a)).lengthSq() > 1e-10) count++; } return count; }
try {
  reset();
  check('24 and 102 court anchors preserve raw terrain and all existing building geometry', () => {
    expect(JSON.stringify(raw) === snapshot && hash(terrain.vertices) === terrainBefore, 'map or terrain changed');
    for (const b of originalBuildings) expect(b.object.children.filter(c => c.isMesh).every((c, i) => hash(c.geometry.attributes.position.array) === b.hashes[i]), 'existing building buffer changed', { id: b.object.userData.buildingId });
    expect(info.adjacentBuildings.includes('way/238937635') && !info.adjacentBuildings.includes('way/167607356'), 'old student-centre identification retained');
    expect(model.shell.children.length === 1 && targets.length < 250 && targets.every(t => t.collisionVertices?.length >= 12), 'unbounded geometry or inexact colliders');
    expect([...mesh.geometry.attributes.position.array].every(Number.isFinite), 'nonfinite geometry');
    return { parts: targets.length, triangles: triangleCount(), renderMeshes: 1, steps: info.steps.length, width: info.width, lower: info.lower, upper: info.upper };
  });
  check('actual step and connection top triangles remain above the unchanged terrain', () => {
    let samples = 0, minimum = Infinity, maximum = -Infinity;
    for (const target of targets.filter(t => /stone-step|stone-paving|ground-connection/.test(t.mesh.userData.component))) {
      const p = target.mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i += 3) { const v = [0, 1, 2].map(k => new T.Vector3().fromBufferAttribute(p, i + k).applyMatrix4(target.mesh.matrixWorld)); if (v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])).normalize().y < .5) continue;
        for (let j = 0; j <= 5; j++) for (let k = 0; k <= 5 - j; k++) { const q = v[0].clone().multiplyScalar(1 - (j + k) / 5).addScaledVector(v[1], j / 5).addScaledVector(v[2], k / 5), clearance = q.y - terrain.meshHeightAt(q.x, q.z); minimum = Math.min(minimum, clearance); maximum = Math.max(maximum, clearance); samples++; }
      }
    }
    expect(samples > 100 && minimum > -.003, 'walking surface buried', { samples, minimum, maximum });
    const risers = info.steps.slice(1).map((s, i) => s.top - info.steps[i].top); expect(Math.max(...risers) <= .275 && Math.min(...risers) >= -.001, 'step height exceeds walking contract', { risers });
    return { samples, minimumTerrainClearance: minimum, maximumSurfaceRise: maximum, maximumRiser: Math.max(...risers) };
  });
  check('real full-campus capsules walk the staircase in both directions on three lanes', () => {
    const routes = [];
    for (const offset of [-.55, 0, .55]) {
      const points = ['start', 'lower', 'upper', 'end'].map(key => new T.Vector3().fromArray(info.route[key]).addScaledVector(across, offset)); spawn(points[0]);
      const legs = [...points.slice(1), ...points.slice(0, -1).reverse()].map(walk); routes.push({ offset, legs }); expect(legs.every(l => l.remaining < .18 && l.penetration < .022), 'walking lane blocked', routes.at(-1));
    }
    return { routes, speed: 6, scope: 'Actual fullCampus buildings, existing central plaza, transit facilities and terrain; no moving vehicles.' };
  });
  check('service court connects to the lower paving and returns without entering the 24 building', () => {
    const road = data.roads.find(r => r.id === 'way/167595747/10'), a = new T.Vector2(...road.points[0]), b = new T.Vector2(...road.points[1]), start = new T.Vector3().fromArray(info.route.start), ab = b.clone().sub(a), t = Math.max(0, Math.min(1, new T.Vector2(start.x, start.z).sub(a).dot(ab) / ab.lengthSq())), q = a.clone().addScaledVector(ab, t), roadPoint = new T.Vector3(q.x, 0, q.y);
    spawn(roadPoint); const end = new T.Vector3().fromArray(info.route.end), legs = [start, new T.Vector3().fromArray(info.route.lower), new T.Vector3().fromArray(info.route.upper), end, new T.Vector3().fromArray(info.route.upper), start, roadPoint].map(walk);
    expect(legs.every(l => l.remaining < .18 && l.penetration < .022), 'court-to-stair connection blocked', { legs }); return { roadId: road.id, roadPoint: roadPoint.toArray(), legs };
  });
  check('visible stone and metal surfaces match loaded and unloaded convex queries', () => {
    const rays = [];
    for (const target of targets) { const p = target.mesh.position.clone(), d = target.mesh.userData.component.includes('railing') ? across.clone().negate() : new T.Vector3(0, -1, 0); if (d.y < 0) p.y = target.box.max.y + .5; else p.addScaledVector(d, -.5); const shown = visual(p, d, 2); if (!shown) throw Error('visible component missing: ' + target.mesh.userData.component);
      sim.setFocus(p, true); sim.world.step(); const hit = physical(p, d, 2); expect(hit && Math.abs(hit.distance - shown.distance) < .003, 'loaded surface mismatch', { component: target.mesh.userData.component, rendered: shown.distance, loaded: hit?.distance }); rays.push({ p, d, distance: hit.distance }); }
    sim.setFocus(far, true); sim.world.step(); let maximum = 0; for (const ray of rays) { const hit = sim.castUnloadedTargets(ray.p, ray.d, 2); expect(hit, 'unloaded surface missing'); maximum = Math.max(maximum, Math.abs(hit.distance - ray.distance)); } expect(maximum < .003, 'unloaded surface mismatch', { maximum }); reset(); return { rays: rays.length, maximumLoadedUnloadedDifference: maximum };
  });
  check('rail gaps remain empty while individual horizontal members stop rays', () => {
    const a = info.posts[0], b = info.posts[1], s = (a.s + b.s) / 2, y = (a.y + b.y) / 2, point = new T.Vector3().fromArray(info.lower).addScaledVector(axis, s).addScaledVector(across, info.width / 2 + .08);
    sim.setFocus(point.clone().setY(y + 1), true); sim.world.step(); const gaps = [];
    for (const h of [.17, .50, .83, 1.25]) { const p = point.clone().setY(y + h).addScaledVector(across, -.35), shown = visual(p, across, .7), hit = physical(p, across, .7); expect(!shown && !hit, 'railing gap filled', { h, rendered: shown?.distance, physics: hit?.target.mesh.userData.component }); gaps.push(h); }
    const p = point.clone().setY(y + .67).addScaledVector(across, -.35); expect(visual(p, across, .7) && physical(p, across, .7), 'rail surface missing'); return { emptyHeights: gaps, checkedMemberHeight: .67 };
  });
  check('one world reflection preserves query placement and local destruction restores at distance', () => {
    const target = targets.find(t => t.mesh.userData.component === 'right-railing-post'), d = across.clone(), p = target.mesh.position.clone().addScaledVector(d, -.5); sim.setFocus(p, true); sim.world.step(); const before = visual(p, d, 1), initial = triangleCount(); expect(before && physical(p, d, 1), 'selected member missing');
    scene.scale.z = -1; scene.updateMatrixWorld(true); const reflected = visual(new T.Vector3(p.x, p.y, -p.z), new T.Vector3(d.x, d.y, -d.z), 1); expect(reflected && Math.abs(reflected.distance - before.distance) < .001, 'H mismatch'); scene.scale.z = 1; scene.updateMatrixWorld(true);
    sim.hit(target, 100, d); sim.world.step(); for (const distance of [279, 281, 900]) { const away = p.clone().addScaledVector(axis, distance); sim.setFocus(away, true); sim.world.step(); update(away); expect(triangleCount() < initial && triangleCount() > 0 && !sim.castUnloadedTargets(p, d, .75), 'destroyed member returns with distance'); }
    reset(); expect(mesh.geometry.attributes.position.array.every((v, i) => v === original[i]), 'partial reset differs');
    for (const target of targets) sim.hit(target, 100, d); update(far); expect(!model.shell.visible && triangleCount() === 0, 'destroyed facility remains visible'); reset(); expect(triangleCount() === initial, 'whole reset differs'); return { initialTriangles: initial, restoredParts: targets.length, reflectionCount: 1 };
  });
} finally {
  sim.world.removeCharacterController(sim.controller); sim.world.free(); const sourceStillMatches = {};
  for (const [file, value] of Object.entries(hashes)) sourceStillMatches[file] = hash(await fs.readFile(path.join(root, file))) === value;
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify({ scope: 'Node actual map, DEM, production fullCampus and Rapier. Photo dimensions and placement remain estimated. No browser or mobile FPS verification.', hashes, sourceStillMatches, results }, null, 2) + '\n');
}
if (results.some(r => r.status !== 'PASS')) process.exitCode = 1;
