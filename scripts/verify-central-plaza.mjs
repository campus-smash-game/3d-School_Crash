import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import * as T from 'three';
import R from '@dimforge/rapier3d-compat';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), out = path.join(root, 'artifacts/central-plaza-test');
await fs.mkdir(out, { recursive: true }); const hashes = {}, hash = b => createHash('sha256').update(b).digest('hex');
for (const f of (await fs.readdir(path.join(root, 'src'))).filter(f => f.endsWith('.ts'))) {
  const s = await fs.readFile(path.join(root, 'src', f), 'utf8'); hashes['src/' + f] = hash(s);
  await fs.writeFile(path.join(out, f.replace('.ts', '.mjs')), ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/from (['"])(\.\/[\w-]+)\1/g, "from '$2.mjs'"));
}
globalThis.document = { createElement() { return { width: 0, height: 0, getContext() { return new Proxy({}, { get(o, k) { if (k === 'measureText') return s => ({ width: String(s).length * 20 }); if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} }); return o[k] ?? (() => {}); }, set(o, k, v) { o[k] = v; return true; } }); } }; } };
const [{ createTerrain }, { createFullCampus }, { createCentralPlazaFacilities }, { Simulation }] = await Promise.all(['terrain', 'fullCampus', 'centralPlazaFacilities', 'physics'].map(n => import(pathToFileURL(path.join(out, n + '.mjs')))));
await R.init();
async function dataFile(f) { const b = await fs.readFile(path.join(root, f)); hashes[f] = hash(b); return JSON.parse(b); }
const data = await dataFile('public/data/campus.json'), dem = await dataFile('public/data/terrain.json'), snapshot = JSON.stringify(data), scene = new T.Scene(), terrain = createTerrain(scene, dem, data.buildings), terrainBefore = hash(terrain.vertices), campus = createFullCampus(scene, data, terrain.heightAt);
let shell = scene.children.find(o => o.userData.landmark === 'central-plaza');
const separate = !shell, plaza = separate ? createCentralPlazaFacilities(scene, terrain.heightAt) : { shell, breakables: [], update: p => campus.update(p) }; shell = plaza.shell;
const info = shell.userData, axis = new T.Vector3().fromArray(info.axis), across = new T.Vector3().fromArray(info.across), a = new T.Vector3().fromArray(info.anchors.lower), b = new T.Vector3().fromArray(info.anchors.upper), c = new T.Vector3().fromArray(info.anchors.libraryApproach), door = new T.Vector3().fromArray(info.anchors.libraryDoor), near = a.clone().addScaledVector(axis, -4).setY(terrain.heightAt(a.x, a.z) + 1.7), far = new T.Vector3(10000, 500, 10000), sim = new Simulation([...campus.breakables, ...plaza.breakables], campus.colliders, near, data.bounds, terrain), results = [];
const targets = sim.targets.filter(t => t.mesh.userData.facilityId === shell.name), mesh = shell.children.find(o => o.isMesh), original = mesh.geometry.attributes.position.array.slice();
function expect(yes, message, details) { if (!yes) throw Object.assign(Error(message), { details }); }
function check(name, fn) { try { const details = fn(); results.push({ name, status: 'PASS', ...details }); console.log('PASS ' + name); } catch (e) { results.push({ name, status: 'FAIL', error: e.message, details: e.details }); console.log('FAIL ' + name + ' ' + e.message + ' ' + JSON.stringify(e.details ?? {})); } }
function update(p) { campus.update(p); if (separate) plaza.update(p); scene.updateMatrixWorld(true); }
function reset() { sim.reset(); sim.setFocus(near, true); sim.world.step(); update(near); }
function physical(p, d, distance, onlyPlaza = true) { const owners = new Map(sim.targets.filter(t => t.body && (!onlyPlaza || t.mesh.userData.facilityId === shell.name)).map(t => [t.body.handle, t])); const hit = sim.world.castRay(new R.Ray(p, d), distance, true, undefined, undefined, undefined, undefined, collider => owners.has(collider.parent()?.handle)); return hit ? { target: owners.get(hit.collider.parent().handle), distance: hit.timeOfImpact } : null; }
function visual(p, d, distance) { scene.updateMatrixWorld(true); return new T.Raycaster(p, d, 0, distance).intersectObject(mesh, false)[0]; }
function floor(p) { sim.setFocus(p.clone().setY(45), true); sim.world.step(); const hit = sim.world.castRay(new R.Ray({ x: p.x, y: 50, z: p.z }, { x: 0, y: -1, z: 0 }), 40, true, undefined, undefined, sim.playerCollider, sim.player); return hit ? 50 - hit.timeOfImpact : terrain.heightAt(p.x, p.z); }
function walk(destination) { let frames = 0, stalls = 0, previous = new T.Vector3().copy(sim.player.translation()); for (; frames < 1500; frames++) { const p = new T.Vector3().copy(sim.player.translation()), d = destination.clone().sub(p).setY(0); if (d.length() < .13) break; d.normalize(); sim.step(1 / 60, d.x * 6, d.z * 6, false); const next = new T.Vector3().copy(sim.player.translation()); stalls = next.distanceTo(previous) < .002 ? stalls + 1 : 0; previous = next; if (stalls > 90) break; } const end = new T.Vector3().copy(sim.player.translation()), remaining = end.clone().sub(destination).setY(0).length(); return { destination: destination.toArray(), end: end.toArray(), remaining, frames }; }
function spawn(p) { const y = floor(p); sim.teleport(p.clone().setY(y + 1.7)); for (let i = 0; i < 30; i++) sim.step(1 / 60, 0, 0, false); }
function triangleCount() { if (!shell.visible) return 0; let n = 0; const p = mesh.geometry.attributes.position, a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(); for (let i = 0; i < p.count; i += 3) if (b.fromBufferAttribute(p, i + 1).sub(a.fromBufferAttribute(p, i)).cross(c.fromBufferAttribute(p, i + 2).sub(a)).lengthSq() > 1e-10) n++; return n; }
try {
  reset();
  check('mapped stair axis, entrance anchors, terrain and bounded merged geometry', () => {
    expect(JSON.stringify(data) === snapshot && hash(terrain.vertices) === terrainBefore, 'raw map or terrain changed');
    expect(shell.children.length <= 3 && targets.length < 500 && targets.every(t => t.collisionVertices?.length >= 12), 'unbounded geometry or missing exact convex proxies');
    expect(Math.abs(a.x - 258.75) < .001 && Math.abs(b.z + 770.03) < .001, 'mapped stair axis changed');
    const heights = info.stairs.steps.map(s => s.top), jumps = heights.slice(1).map((y, i) => y - heights[i]); expect(Math.max(...jumps) < .35 && Math.min(...jumps) >= -.01, 'stairs exceed safe riser height', { jumps });
    expect([...mesh.geometry.attributes.position.array].every(Number.isFinite), 'nonfinite render vertex');
    return { renderMeshes: shell.children.length, parts: targets.length, triangles: triangleCount(), stepSections: heights.length, minimumRiser: Math.min(...jumps), maximumRiser: Math.max(...jumps), lowerHeight: heights[0], upperHeight: heights.at(-1), widthEstimate: info.stairs.width };
  });
  check('actual stair and paving top triangles clear the unchanged terrain', () => {
    let samples = 0, minimum = Infinity, maximum = -Infinity;
    for (const target of targets.filter(t => /central-step|central-landing|ground-connection|paving-connection/.test(t.mesh.userData.component))) {
      const p = target.mesh.geometry.attributes.position; for (let i = 0; i < p.count; i += 3) {
        const vertices = [0, 1, 2].map(k => new T.Vector3().fromBufferAttribute(p, i + k).applyMatrix4(target.mesh.matrixWorld)), normal = vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0])).normalize(); if (normal.y < .5) continue;
        for (let j = 0; j <= 5; j++) for (let k = 0; k <= 5 - j; k++) { const q = vertices[0].clone().multiplyScalar(1 - (j + k) / 5).addScaledVector(vertices[1], j / 5).addScaledVector(vertices[2], k / 5), clearance = q.y - terrain.meshHeightAt(q.x, q.z); minimum = Math.min(minimum, clearance); maximum = Math.max(maximum, clearance); samples++; }
      }
    }
    expect(minimum > -.003, 'new paving is buried', { samples, minimum, maximum }); return { samples, minimumTerrainClearance: minimum, maximumRaisedSurface: maximum };
  });
  check('central stairs and upper approach allow 6m per second round trips across three lanes', () => {
    const routes = [];
    for (const offset of [-2, 0, 2]) {
      const start = a.clone().addScaledVector(axis, -4.2).addScaledVector(across, offset), lower = a.clone().addScaledVector(across, offset), upper = b.clone().addScaledVector(across, offset), landing = c.clone().addScaledVector(new T.Vector3(.73443125, 0, .67868309), offset * .4), front = c.clone().sub(door).setY(0).normalize(), beforeDoor = door.clone().addScaledVector(front, .8);
      spawn(start); const legs = [lower, upper, landing, beforeDoor, landing, upper, lower, start].map(walk); routes.push({ offset, legs }); expect(legs.every(l => l.remaining < .2), 'walking lane blocked', routes.at(-1));
    }
    return { routes };
  });
  check('destroyed entrance permits entry and returning along the plaza', () => {
    const target = sim.targets.find(t => t.mesh.userData.component === 'low-front-entrance-glass'), direction = door.clone().sub(c).setY(0).normalize(); expect(target, 'main entrance missing'); sim.hit(target, 100, direction); update(near);
    const start = a.clone().addScaledVector(axis, -4.2); spawn(start); const legs = [a, b, c, door.clone().addScaledVector(direction, 2.5), c, b, a, start].map(walk); expect(legs.every(l => l.remaining < .2), 'entry route blocked after door destruction', { legs }); reset(); return { legs };
  });
  check('actual visible surfaces match loaded and distant collision queries', () => {
    const rays = [];
    for (const target of targets.filter(t => !/lamp|trunk/.test(t.mesh.userData.component))) {
      const q = target.mesh.position.clone(), p = q.clone().setY(target.box.max.y + 1), d = new T.Vector3(0, -1, 0), shown = visual(p, d, 3); expect(shown, 'missing visible surface', { component: target.mesh.userData.component });
      sim.setFocus(p, true); sim.world.step(); const loaded = physical(p, d, 3); expect(loaded && Math.abs(loaded.distance - shown.distance) < .008, 'render and loaded surface differ', { component: target.mesh.userData.component, rendered: shown?.distance, loaded: loaded?.distance }); rays.push({ p, d, distance: loaded.distance });
    }
    sim.setFocus(far, true); sim.world.step(); let maximum = 0; for (const ray of rays) { const hit = sim.castUnloadedTargets(ray.p, ray.d, 3); expect(hit, 'distant surface missing'); maximum = Math.max(maximum, Math.abs(hit.distance - ray.distance)); } expect(maximum < .008, 'loaded and distant surfaces differ', { maximum }); reset(); return { rays: rays.length, maximumLoadedUnloadedDifference: maximum, selection: 'All paving, boundary, crown and shrub component centres. Lamps use horizontal rays below; trunk-top origins inside crowns are excluded by component geometry, not physics hit/miss.' };
  });
  check('partial destruction persists at distance, H applies once and reset restores geometry', () => {
    const target = targets.find(t => t.mesh.userData.component === 'paired-globe-lamp-globe'), p = target.mesh.position.clone().addScaledVector(across, -.8), d = across.clone(), initial = triangleCount(); sim.setFocus(p, true); sim.world.step(); expect(physical(p, d, 1)?.target === target, 'lamp query missing'); const before = visual(p, d, 1);
    scene.scale.z = -1; scene.updateMatrixWorld(true); const reflected = new T.Vector3(p.x, p.y, -p.z), reflectedDirection = new T.Vector3(d.x, d.y, -d.z), hit = new T.Raycaster(reflected, reflectedDirection, 0, 1).intersectObject(mesh, false)[0]; expect(hit && before && Math.abs(hit.point.z + before.point.z) < .001 && Math.abs(hit.distance - before.distance) < .001, 'render reflection differs'); scene.scale.z = 1; scene.updateMatrixWorld(true);
    sim.hit(target, 100, d); sim.world.step(); update(far); expect(triangleCount() > 0 && triangleCount() < initial, 'partial destruction not shown'); sim.setFocus(far, true); sim.world.step(); expect(!sim.castUnloadedTargets(p, d, .9), 'destroyed globe remains in distant query');
    reset(); expect(mesh.geometry.attributes.position.array.every((v, i) => v === original[i]), 'reset vertex buffer differs');
    for (const t of targets) sim.hit(t, 100, d); update(far); expect(!shell.visible && triangleCount() === 0, 'total destruction leaves geometry'); reset(); expect(triangleCount() === initial, 'reset triangle count differs');
    return { initialTriangles: initial, restoredParts: targets.length, reflectionCount: 1 };
  });
} finally {
  sim.world.removeCharacterController(sim.controller); sim.world.free(); const sourceStillMatches = {};
  for (const [f, value] of Object.entries(hashes)) sourceStillMatches[f] = hash(await fs.readFile(path.join(root, f))) === value;
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify({ scope: 'Actual map, terrain, full-campus geometry and Rapier in Node. No browser, field survey, GPU or phone verification.', hashes, sourceStillMatches, results }, null, 2) + '\n');
}
if (results.some(r => r.status !== 'PASS')) process.exitCode = 1;
