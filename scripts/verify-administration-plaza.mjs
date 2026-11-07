import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import ts from 'typescript';
import * as T from 'three';
import R from '@dimforge/rapier3d-compat';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts/administration-plaza-test'), cache = path.join(out, 'compiled');
await fs.mkdir(cache, { recursive: true });
const hashes = {}, hash = value => createHash('sha256').update(value).digest('hex');
const modules = ['terrain', 'scene', 'fullCampus', 'physics', 'traffic', 'transitFacilities', 'centralPlazaFacilities', 'informationCourtApproach', 'administrationPlazaFacilities', 'administrationPlazaGround'];
async function compile(name) {
  const file = `src/${name}.ts`; if (hashes[file]) return;
  const source = await fs.readFile(path.join(root, file), 'utf8'); hashes[file] = hash(source);
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  for (const match of code.matchAll(/from ['"]\.\/([\w-]+)['"]/g)) await compile(match[1]);
  await fs.writeFile(path.join(cache, name + '.mjs'), code.replace(/from (['"])(\.\/[\w-]+)\1/g, "from '$2.mjs'"));
}
for (const name of modules) await compile(name);
globalThis.document = { createElement() {
  const canvas = { width: 0, height: 0, textCalls: [], fillRectCalls: [] };
  canvas.getContext = () => new Proxy({ fillStyle: '#000000' }, {
    get(o, k) {
      if (k === 'fillText') return (...args) => canvas.textCalls.push(args);
      if (k === 'fillRect') return (x, y, width, height) => canvas.fillRectCalls.push({ x, y, width, height, fillStyle: o.fillStyle });
      if (k === 'measureText') return s => ({ width: String(s).length * 20 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      return o[k] ?? (() => {});
    },
    set(o, k, v) { o[k] = v; return true; },
  });
  return canvas;
} };
const loaded = await Promise.all(modules.map(n => import(pathToFileURL(path.join(cache, n + '.mjs')))));
const [{ createTerrain }, { createCampus }, { createFullCampus }, { Simulation }, { Traffic }, { createTransitFacilities }, { createCentralPlazaFacilities }, { createInformationCourtApproach }, { createAdministrationPlazaFacilities }, { createAdministrationPlazaGround }] = loaded;
await R.init();
async function read(file) { const b = await fs.readFile(path.join(root, file)); hashes[file] = hash(b); return JSON.parse(b); }
const [raw, dem, plan, facilityPlan] = await Promise.all(['campus', 'terrain', 'campus-transit', 'transit-facilities'].map(n => read(`public/data/${n}.json`)));
const data = { ...raw, roads: [...raw.roads, ...(plan.supplementalRoads ?? [])] }, rawBefore = JSON.stringify(raw), scene = new T.Scene();
const terrain = createTerrain(scene, dem, data.buildings), terrainBefore = hash(terrain.vertices);
const gate = createCampus(scene, { full: true }), campus = createFullCampus(scene, data, terrain.heightAt);
const ground = createAdministrationPlazaGround(scene, terrain.heightAt);
const existing = [createTransitFacilities(scene, facilityPlan, terrain.heightAt), createCentralPlazaFacilities(scene, terrain.heightAt), createInformationCourtApproach(scene, terrain.heightAt), ground];
const model = createAdministrationPlazaFacilities(scene, data, terrain.heightAt), info = model.shell.userData;
const origin = new T.Vector3().fromArray(info.start), axis = new T.Vector3().fromArray(info.axis), across = new T.Vector3().fromArray(info.across);
const point = (s, n) => origin.clone().addScaledVector(axis, s).addScaledVector(across, n);
const eye = (s, n) => { const p = point(s, n); p.y = terrain.heightAt(p.x, p.z) + 1.7; return p; };
const sim = new Simulation([...gate.breakables, ...campus.breakables, ...existing.flatMap(m => m.breakables), ...model.breakables], [...gate.colliders, ...campus.colliders], eye(-2, 3.5), data.bounds, terrain);
const traffic = new Traffic(scene, data.roads, terrain.heightAt, plan), targets = sim.targets.filter(t => t.mesh.userData.facilityId === model.shell.name);
const mesh = model.shell.children[0], original = mesh.geometry.attributes.position.array.slice(), results = [];
function must(ok, message, details) { if (!ok) throw Object.assign(Error(message), { details }); }
function check(name, run) { try { const details = run(); results.push({ name, status: 'PASS', ...details }); console.log('PASS ' + name); } catch (e) { results.push({ name, status: 'FAIL', error: e.message, details: e.details }); console.log('FAIL ' + name + ': ' + e.message + ' ' + JSON.stringify(e.details ?? {})); } }
function contacts(p, rotation, shape, facilityOnly = false) {
  const byBody = new Map(sim.targets.filter(t => t.body).map(t => [t.body.handle, t])), rows = [];
  sim.world.intersectionsWithShape(p, rotation, shape, c => {
    const target = byBody.get(c.parent()?.handle); if (facilityOnly && ![model.shell.name, ground.shell.name].includes(target?.mesh.userData.facilityId)) return true;
    const hit = c.contactShape(shape, p, rotation, .02);
    if (hit && hit.distance < -.005) rows.push({ component: target?.mesh.userData.component ?? null, buildingId: target?.mesh.userData.buildingId ?? null, penetration: -hit.distance });
    return true;
  }, R.QueryFilterFlags.EXCLUDE_DYNAMIC, undefined, sim.playerCollider, sim.player);
  return rows;
}
function playerContacts() { return contacts(sim.player.translation(), sim.playerCollider.rotation(), sim.playerCollider.shape); }
function walk(destination) {
  let frames = 0, stalled = 0, maxPenetration = 0;
  for (; frames < 500; frames++) {
    const before = new T.Vector3().copy(sim.player.translation()), d = destination.clone().sub(before).setY(0);
    if (d.length() < .12) break; d.normalize(); sim.step(1 / 60, d.x * 6, d.z * 6, false);
    const after = new T.Vector3().copy(sim.player.translation()); stalled = before.distanceTo(after) < .002 ? stalled + 1 : 0;
    if (frames % 5 === 0) for (const c of playerContacts()) maxPenetration = Math.max(maxPenetration, c.penetration);
    if (stalled > 90) break;
  }
  return { frames, end: { ...sim.player.translation() }, remaining: new T.Vector3().copy(sim.player.translation()).sub(destination).setY(0).length(), maxPenetration };
}
function physical(o, d, distance = 1.2) {
  const owners = new Map(sim.targets.filter(t => t.body).map(t => [t.body.handle, t]));
  const hit = sim.world.castRay(new R.Ray(o, d), distance, true, undefined, undefined, undefined, undefined, c => owners.has(c.parent()?.handle));
  return hit ? { target: owners.get(hit.collider.parent().handle), distance: hit.timeOfImpact } : null;
}
function reset() { sim.reset(); model.update(sim.spawn); scene.updateMatrixWorld(true); }
const groundClearances = [];
for (const t of targets.filter(t => ['gate-yellow-island', 'map-post', 'notice-post', 'lamp-base', 'gate-reader-post'].includes(t.mesh.userData.component))) {
  const p = t.mesh.geometry.attributes.position, columns = new Map();
  for (let i = 0; i < p.count; i++) {
    const q = new T.Vector3().fromBufferAttribute(p, i).applyMatrix4(t.mesh.matrixWorld), key = q.x.toFixed(5) + ':' + q.z.toFixed(5);
    if (!columns.has(key) || q.y < columns.get(key).y) columns.set(key, q);
  }
  const gaps = [...columns.values()].map(q => q.y - terrain.meshHeightAt(q.x, q.z));
  groundClearances.push({ component: t.mesh.userData.component, position: t.mesh.position.toArray(), min: Math.min(...gaps), max: Math.max(...gaps) });
}

try {
  check('actual full-campus pedestrian channel stays open in both directions at 6 m/s', () => {
    assert.equal(JSON.stringify(raw), rawBefore); assert.equal(hash(terrain.vertices), terrainBefore);
    assert.equal(info.mappedRoad, 'way/167597965/24'); assert.equal(model.shell.children.length, 1);
    must(targets.length < 100 && targets.every(t => t.collisionVertices?.length >= 12), 'facility collider budget or convex proxy missing');
    must(groundClearances.filter(p => p.component !== 'gate-reader-post').every(p => p.max <= .05 && p.min > -.2), 'structural base floats or is buried too far below terrain', { groundClearances });
    const island = targets.find(t => t.mesh.userData.component === 'gate-yellow-island');
    for (const post of targets.filter(t => t.mesh.userData.component === 'gate-reader-post')) {
      const top = new T.Raycaster(post.mesh.position.clone().add(new T.Vector3(0, 2, 0)), new T.Vector3(0, -1, 0), 0, 5).intersectObject(island.mesh, false)[0];
      must(top && post.box.min.y < top.point.y + .01, 'gate reader floats above its supporting island');
    }
    const paths = [];
    for (const n of [3.3, 3.5, 3.8]) {
      sim.teleport(eye(-2, n)); for (let i = 0; i < 60; i++) sim.step(1 / 60, 0, 0, false);
      must(playerContacts().length === 0, 'starting capsule overlaps an existing or new object', { n, contacts: playerContacts() });
      const forward = walk(point(17, n)), backward = walk(point(-2, n));
      must(forward.remaining < .2 && backward.remaining < .2 && Math.max(forward.maxPenetration, backward.maxPenetration) < .022, 'walkway is blocked or penetrates an object', { n, forward, backward });
      paths.push({ n, forward, backward });
    }
    return { paths, parts: targets.length, triangles: mesh.geometry.attributes.position.count / 3, groundClearances };
  });

  check('actual taxi and private-car turns clear the fixed-open gates and centre island', () => {
    const short = traffic.edges.filter(e => e.roadId === info.mappedRoad), pairs = new Map(); assert.equal(short.length, 2);
    const legal = edge => { const all = edge.b.edges.filter(e => e.allowed), other = all.filter(e => e !== edge.reverse); return other.length ? other : all; };
    for (const edge of short) {
      for (const next of legal(edge)) pairs.set(edge.id + ':' + next.id, [edge, next]);
      for (const incoming of traffic.edges.filter(e => e.allowed && e.b === edge.a)) if (legal(incoming).includes(edge)) pairs.set(incoming.id + ':' + edge.id, [incoming, edge]);
    }
    const transitUsers = plan.routes.filter(r => r.segments.some(s => s.roadId === info.mappedRoad)).map(r => r.id);
    assert.deepEqual(transitUsers, []);
    const car = traffic.vehicles.find(v => v.kind === 'car'), v = { ...car, position: new T.Vector3(), quaternion: new T.Quaternion(), forward: new T.Vector3() };
    const shape = new R.Cuboid(v.width / 2, v.height / 2, v.length / 2), collisions = []; let samples = 0;
    function inspect(mode, fraction) {
      traffic.pose(v); sim.setFocus(v.position, true); sim.world.step();
      const center = new T.Vector3(0, v.height / 2, 0).applyQuaternion(v.quaternion).add(v.position), hits = contacts(center, v.quaternion, shape, true); samples++;
      if (hits.length) collisions.push({ mode, road: v.edge.roadId, next: v.next.roadId, fraction, position: v.position.toArray(), hits });
    }
    for (const edge of short) for (let d = 0; d <= edge.length; d += .25) { Object.assign(v, { edge, next: edge.reverse, distance: d, turn: null }); inspect('straight', d / edge.length); }
    for (const [edge, next] of pairs.values()) {
      Object.assign(v, { edge, next, turn: null, distance: edge.length }); traffic.startTurn(v);
      for (let i = 0; i <= 80; i++) { v.turn.distance = v.turn.length * i / 80; inspect('turn', i / 80); }
    }
    must(!collisions.length, 'new roadside facilities intersect a real car pose', { samples, collisions: collisions.slice(0, 12), collidingPoses: collisions.length });
    return { samples, turnPairs: pairs.size, vehicleEnvelope: [v.width, v.height, v.length], transitUsers, gatesOpenDegrees: info.gates.map(g => g.openingDegrees), collisions: 0 };
  });

  check('thin visible surfaces agree with loaded and remote queries and restore after partial destruction', () => {
    const checks = [];
    for (const component of ['map-frame', 'map-lower-panel', 'gate-arm', 'lamp-top']) {
      reset(); const target = targets.find(t => t.mesh.userData.component === component); assert.ok(target);
      const normal = new T.Vector3(component === 'gate-arm' ? 1 : 0, 0, component === 'gate-arm' ? 0 : 1).applyQuaternion(target.mesh.quaternion);
      const o = target.mesh.position.clone().addScaledVector(normal, .6), d = normal.clone().negate();
      sim.setFocus(o, true); sim.world.step();
      const rendered = new T.Raycaster(o, d, 0, 1.2).intersectObject(mesh, false)[0], local = physical(o, d);
      must(rendered && local?.target === target, 'local ray selects a different object', { component, local: local?.target?.mesh.userData.component, rendered: !!rendered });
      must(Math.abs(rendered.distance - local.distance) < .012, 'thin collider differs from visible panel', { component, rendered: rendered.distance, physical: local.distance });
      sim.setFocus(new T.Vector3(-5000, 0, -5000), true); assert.equal(target.body, null);
      const remote = sim.castUnloadedTargets(o, d, 1.2);
      must(remote?.target === target && Math.abs(local.distance - remote.distance) < .002, 'remote query differs from loaded collision', { component });
      sim.hit(target, 100, d); model.update(sim.spawn);
      assert.equal(target.mesh.visible, false); assert.equal(target.body, null);
      must(sim.castUnloadedTargets(o, d, 1.2)?.target !== target, 'destroyed target remains in remote queries');
      const broken = mesh.geometry.attributes.position.array.slice();
      must(broken.some((v, i) => v !== original[i]), 'destroyed owner leaves the merged surface unchanged');
      if (component === 'map-frame') {
        const uv = mesh.geometry.attributes.uv, p = mesh.geometry.attributes.position;
        let start = 0; while (start < p.count && uv.getX(start) >= .499) start++;
        const indices = Array.from({ length: 6 }, (_, i) => start + i);
        must(start < p.count && indices.every(i => uv.getX(i) <= .5), 'map atlas face is missing');
        must(indices.every(i => new T.Vector3().fromBufferAttribute(p, i).distanceTo(new T.Vector3().fromBufferAttribute(p, indices[0])) < 1e-7), 'map label survives its destroyed frame');
      }
      for (const distance of [279, 281, 900]) { model.update(sim.spawn.clone().addScaledVector(axis, distance)); assert.ok(model.shell.visible); assert.deepEqual(mesh.geometry.attributes.position.array, broken); }
      reset(); assert.deepEqual(mesh.geometry.attributes.position.array, original); assert.equal(target.hp, target.toughness); assert.ok(target.mesh.visible);
      must(physical(o, d)?.target === target, 'reset fails to restore local collision');
      checks.push({ component, renderedDistance: rendered.distance, loadedDistance: local.distance, remoteDistance: remote.distance });
    }
    return { checks, resetCycles: checks.length, distances: [279, 281, 900] };
  });

  check('road-facing map and notice UVs remain readable after the single world reflection', () => {
    reset(); const uv = mesh.geometry.attributes.uv, p = mesh.geometry.attributes.position, ranges = [], uniformSamples = new Map();
    let uniformTriangles = 0;
    for (let i = 0; i < p.count; i += 3) {
      const u = uv.getX(i), v = uv.getY(i);
      if ([1, 2].every(j => Math.abs(uv.getX(i + j) - u) < 1e-7 && Math.abs(uv.getY(i + j) - v) < 1e-7)) {
        uniformTriangles++; uniformSamples.set(`${u}:${v}`, { u, v }); continue;
      }
      const previous = ranges.at(-1);
      if (previous && previous.start + previous.count === i) previous.count += 3;
      else ranges.push({ start: i, count: 3 });
    }
    const texture = mesh.material.map, canvas = texture.image; texture.updateMatrix();
    must(uniformTriangles > 0 && canvas.fillRectCalls.length > 0, 'solid-color geometry or canvas painting records are missing');
    const uniformPaintSamples = [...uniformSamples.values()].map(({ u, v }) => {
      const imageUV = texture.transformUv(new T.Vector2(u, v)), x = imageUV.x * canvas.width, y = imageUV.y * canvas.height;
      const lastFill = canvas.fillRectCalls.findLast(r => x >= Math.min(r.x, r.x + r.width) && x < Math.max(r.x, r.x + r.width) && y >= Math.min(r.y, r.y + r.height) && y < Math.max(r.y, r.y + r.height));
      must(lastFill && typeof lastFill.fillStyle === 'string' && new T.Color(lastFill.fillStyle).getHex() === 0xffffff, 'solid-color geometry samples a colored atlas region', { u, v, canvasPoint: [x, y], lastFill });
      return { u, v, canvasPoint: [x, y], lastFill };
    });
    assert.equal(ranges.length, 4); const before = targets.map(t => t.mesh.position.toArray()), faces = [];
    scene.scale.z = -1; scene.updateMatrixWorld(true);
    try {
      const roadNormal = new T.Vector3(across.x, 0, -across.z);
      for (const range of ranges) {
        assert.equal(range.count, 6);
        const points = Array.from({ length: 6 }, (_, j) => new T.Vector3().fromBufferAttribute(p, range.start + j).applyMatrix4(mesh.matrixWorld));
        const centre = points.reduce((a, b) => a.add(b), new T.Vector3()).multiplyScalar(1 / 6), camera = new T.PerspectiveCamera(60, 1, .1, 100);
        camera.position.copy(centre).addScaledVector(roadNormal, 4); camera.lookAt(centre); camera.updateMatrixWorld(true);
        const values = points.map((v, j) => ({ position: v, projected: v.clone().project(camera), u: uv.getX(range.start + j), v: uv.getY(range.start + j) }));
        const minU = Math.min(...values.map(v => v.u)), maxU = Math.max(...values.map(v => v.u)), minV = Math.min(...values.map(v => v.v)), maxV = Math.max(...values.map(v => v.v));
        const average = (select, coordinate) => { const chosen = values.filter(select); return chosen.reduce((sum, v) => sum + v.projected[coordinate], 0) / chosen.length; };
        const right = average(v => v.u === maxU, 'x') - average(v => v.u === minU, 'x'), up = average(v => v.v === maxV, 'y') - average(v => v.v === minV, 'y');
        must(right > 0 && up > 0, 'atlas text is mirrored or upside down after H', { range, right, up });
        const hit = new T.Raycaster(camera.position, centre.clone().sub(camera.position).normalize(), 0, 10).intersectObject(mesh, false)[0];
        must(hit && hit.faceIndex * 3 >= range.start && hit.faceIndex * 3 < range.start + range.count, 'frame hides the road-facing label', { range, faceIndex: hit?.faceIndex });
        faces.push({ range, right, up, rayDistance: hit.distance });
      }
    } finally { scene.scale.z = 1; scene.updateMatrixWorld(true); }
    assert.deepEqual(targets.map(t => t.mesh.position.toArray()), before);
    const text = mesh.material.map.image.textCalls.map(c => c[0]);
    for (const expected of ['Campus Map', '서울대학교 게시판', '60 행정관', '63 학생회관', '102 정보화본부']) assert.ok(text.includes(expected), expected);
    return { faces, uniformTriangles, uniformPaintSamples, canvasTextCommandsChecked: true, actualRasterTypographyChecked: false };
  });
} finally {
  const sourceStillMatches = {}; for (const [file, expected] of Object.entries(hashes)) sourceStillMatches[file] = hash(await fs.readFile(path.join(root, file))) === expected;
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify({ scope: 'Actual fullCampus, DEM, Rapier and production Traffic pose calculations. Canvas drawing is stubbed; no browser, photograph registration or mobile performance claim.', hashes, sourceStillMatches, groundClearances, results }, null, 2) + '\n');
  traffic.dispose(); sim.world.removeCharacterController(sim.controller); sim.world.free();
  if (results.some(r => r.status === 'FAIL') || Object.values(sourceStillMatches).some(v => !v)) process.exitCode = 1;
}
