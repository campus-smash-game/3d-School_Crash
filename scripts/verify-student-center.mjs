import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

globalThis.document = { createElement(name) {
  assert.equal(name, 'canvas');
  const canvas = { width: 0, height: 0, textCalls: [], fills: [] };
  const ctx = { fillStyle: '', fillRect(x, y, width, height) { canvas.fills.push({ x, y, width, height, color: this.fillStyle }); }, fillText(text, x, y, maxWidth) { canvas.textCalls.push({ text, x, y, maxWidth, color: this.fillStyle, font: this.font }); } };
  canvas.getContext = kind => kind === '2d' ? ctx : null; return canvas;
} };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), out = path.join(root, 'artifacts/student-center-test');
await mkdir(out, { recursive: true }); const hashes = {};
for (const filename of (await readdir(path.join(root, 'src'))).filter(n => n.endsWith('.ts'))) {
  const source = await readFile(path.join(root, 'src', filename), 'utf8'); hashes[filename] = createHash('sha256').update(source).digest('hex');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  await writeFile(path.join(out, filename.replace(/\.ts$/, '.mjs')), js.replace(/from (['"])(\.\/[\w-]+)\1/g, "from '$2.mjs'"));
}
const { createStudentCenterLandmark } = await import(pathToFileURL(path.join(out, 'studentCenterLandmark.mjs')));
const { createTerrain } = await import(pathToFileURL(path.join(out, 'terrain.mjs')));
const { getBuildingAppearance } = await import(pathToFileURL(path.join(out, 'buildingAppearance.mjs')));
const { Simulation } = await import(pathToFileURL(path.join(out, 'physics.mjs')));
const { dataToRenderPoint: H } = await import(pathToFileURL(path.join(out, 'coordinates.mjs')));
await RAPIER.init();
const data = JSON.parse(await readFile(path.join(root, 'public/data/campus.json'), 'utf8')), dem = JSON.parse(await readFile(path.join(root, 'public/data/terrain.json'), 'utf8'));
const building = data.buildings.find(b => b.id === 'way/167607356'), originalData = JSON.stringify({ building, dem });
const scene = new THREE.Scene(), terrain = createTerrain(scene, dem, data.buildings), profile = getBuildingAppearance(building), model = createStudentCenterLandmark(scene, building, profile, terrain.heightAt);
const shell = scene.children.find(o => o.userData.role === 'building-shell'), info = shell.userData, meshes = shell.children.filter(o => o.isMesh), original = meshes.map(m => m.geometry.attributes.position.array.slice());
const base = info.localOrigin.y, axis = new THREE.Vector3(info.axis.x, 0, info.axis.z), front = new THREE.Vector3(-axis.z, 0, axis.x), up = new THREE.Vector3(0, 1, 0);
const point = (x, y, z) => new THREE.Vector3(info.localOrigin.x, base + y, info.localOrigin.z).addScaledVector(axis, x).addScaledVector(front, z);
const local = p => { const q = p.clone().sub(point(0, 0, 0)); return [q.dot(axis), q.y, q.dot(front)]; };
const near = point(info.stair.startX - 2, 1.8, info.stair.centerZ), far = new THREE.Vector3(100000, 500, 100000), sim = new Simulation(model.breakables, [], near, data.bounds, terrain), results = [];
function check(name, fn) { const details = fn(); results.push({ name, status: 'passed', ...details }); console.log(`PASS ${name} ${JSON.stringify(details)}`); }
function cast(p, d, distance) { const lookup = new Map(sim.targets.filter(t => t.body).map(t => [t.body.handle, t])); const hit = sim.world.castRay(new RAPIER.Ray(p, d), distance, true, undefined, undefined, undefined, undefined, c => lookup.has(c.parent()?.handle)); return hit ? { object: lookup.get(hit.collider.parent().handle).mesh, distance: hit.timeOfImpact } : null; }
function visual(p, d, distance) { scene.updateMatrixWorld(true); return new THREE.Raycaster(p, d, 0, distance).intersectObjects(meshes, false)[0] ?? null; }
function reset() { sim.reset(); sim.setFocus(near, true); sim.world.step(); model.update(near); }
function triangles() { if (!shell.visible) return 0; let n = 0; const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(); for (const mesh of meshes) { const p = mesh.geometry.attributes.position; for (let i = 0; i < p.count; i += 3) if (b.fromBufferAttribute(p, i + 1).sub(a.fromBufferAttribute(p, i)).cross(c.fromBufferAttribute(p, i + 2).sub(a)).lengthSq() > 1e-10) n++; } return n; }
function inside(x, z) { let yes = false; const ring = building.points; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) yes = !yes; } return yes; }
let originalTriangles;
try {
  reset();
  check('mapped outline and distinct north and south levels remain explicit estimates', () => {
    assert.equal(JSON.stringify({ building, dem }), originalData); assert.deepEqual(info.mappedOutline, building.points.slice(0, -1)); assert.equal(info.mappedOutline.length, 14);
    assert.equal(meshes.length, 4); assert.equal(meshes.filter(m => m.material.vertexColors).length, 3); assert.equal(meshes.filter(m => m.material.map).length, 1); assert.equal(info.levels.northMaximum, 6); assert.equal(info.levels.south, 4); assert.equal(info.levels.uniformSixFloors, false); assert.equal(info.floorHeightsEstimated, true); assert.equal(info.planLevelStaggerReproduced, false);
    assert.equal(info.southRoofHeight, 14.4); assert.equal(info.roofHeight, 21.4); assert.equal(info.photographedFront, 'southwest');
    assert.ok(meshes.every(m => [...m.geometry.attributes.position.array].every(Number.isFinite))); assert.ok(sim.targets.every(t => t.size.toArray().every(v => v > 0 && Number.isFinite(v))));
    originalTriangles = triangles(); assert.ok(sim.targets.length < 1000 && originalTriangles < 40000);
    return { mappedPoints: 14, renderMeshes: meshes.length, parts: sim.targets.length, triangles: originalTriangles, base, lowRoof: info.southRoofHeight, highRoof: info.roofHeight, maximumIncludingEstimatedRoofRoom: info.maximumHeightWithRoofRoom, planLevelOffsetNotReconstructed: info.planLevelOffsetNotation };
  });
  check('triangulated roof preserves both concave notches and north-only upper floors', () => {
    const roof = sim.targets.filter(t => ['mapped-low-roof', 'mapped-high-roof'].includes(t.mesh.userData.component)); assert.ok(roof.length > 20 && roof.every(t => t.collisionVertices));
    let insideSamples = 0, outsideSamples = 0, highSamples = 0, lowSamples = 0;
    for (let x = 145.3; x < 242; x += 2.9) for (let z = -840.3; z < -737; z += 2.9) {
      const expected = inside(x, z), p = new THREE.Vector3(x, base + 26, z), hits = new THREE.Raycaster(p, up.clone().negate(), 0, 20).intersectObjects(roof.map(t => t.mesh), false), actual = hits.length > 0;
      assert.equal(actual, expected, `footprint mismatch ${x},${z}`);
      if (expected) { const l = local(p), high = l[2] >= info.upperSetback, y = high ? 21.18 : 14.18; assert.ok(Math.abs(hits[0].point.y - base - y) < .002, `wrong wing height ${x},${z}`); insideSamples++; high ? highSamples++ : lowSamples++; } else outsideSamples++;
    }
    assert.ok(highSamples > 50 && lowSamples > 150); return { convexRoofParts: roof.length, insideSamples, outsideSamples, highSamples, lowSamples, setbacksNotUniformExtrusion: true };
  });
  check('glass avoids terrain and projecting bays expose actual cheeks and undersides', () => {
    const mesh = meshes.find(m => m.name.endsWith('ribbon-glazing')), p = mesh.geometry.attributes.position; let minimum = Infinity, samples = 0;
    for (let i = 0; i < p.count; i += 3) { const tri = [0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(p, i + k)); for (let a = 0; a <= 4; a++) for (let b = 0; b <= 4 - a; b++) { const v = tri[0].clone().multiplyScalar(1 - (a + b) / 4).addScaledVector(tri[1], a / 4).addScaledVector(tri[2], b / 4); minimum = Math.min(minimum, v.y - terrain.meshHeightAt(v.x, v.z)); samples++; } }
    assert.ok(minimum > .04, `glass terrain intrusion: ${minimum}`);
    const projections = sim.targets.filter(t => t.mesh.userData.component === 'projecting-window-body'); assert.ok(projections.length >= 6 && projections.every(t => t.size.z > 1.4)); let exposedGlass = 0, underside = 0;
    for (const target of projections) { const normal = new THREE.Vector3().fromArray(target.mesh.userData.outward), tangent = new THREE.Vector3().crossVectors(up, normal).normalize(), centre = target.mesh.position.clone().addScaledVector(tangent, .23); centre.y = base + 9.3; const hit = visual(centre.clone().addScaledVector(normal, 2), normal.clone().negate(), 3); if (hit?.object === mesh) exposedGlass++;
      const lower = target.mesh.position.clone(); lower.y = base + 7; const downFace = visual(lower, up, .5); if (downFace) underside++;
    }
    const southBays = projections.filter(t => new THREE.Vector3().fromArray(t.mesh.userData.outward).dot(axis) < -.99 && local(t.mesh.position)[2] < 0);
    assert.equal(southBays.length, 3); assert.ok(southBays.every(t => t.mesh.userData.bayWidth > 6.8));
    assert.ok(exposedGlass >= 5 && underside >= 5); return { glassSamples: samples, minimumTerrainClearance: minimum, projectingBays: projections.length, southLargeBays: southBays.length, visibleWindowFaces: exposedGlass, undersideRays: underside };
  });
  check('open undercroft has separated stairs floor columns and a recessed door', () => {
    const o = info.openUndercroft, p = point(o.x - .6, o.floor + 1.7, o.z), d = axis.clone(), length = o.depth + .2;
    sim.setFocus(p, true); sim.world.step(); assert.equal(cast(p, d, length), null); assert.equal(visual(p, d, length), null);
    const door = sim.targets.find(t => t.mesh.userData.component === 'upper-stair-entrance-door'), hit = cast(p, d, o.depth + 1); assert.equal(hit?.object, door.mesh);
    const stepTargets = sim.targets.filter(t => t.mesh.userData.component === 'external-stair-step'); assert.equal(stepTargets.length, 24); assert.ok(stepTargets.every(t => t.collisionVertices));
    const riser = (info.stair.top - info.stair.bottom) / info.stair.steps; assert.ok(riser > 0 && riser < .30); return { clearDepthBeforeDoor: length, doorDistance: hit.distance, stairComponents: stepTargets.length, stepRise: riser, estimatedGeometry: true };
  });
  check('stair capsule ascends the actual terrain approach and enters only after door destruction', () => {
    const stair = info.stair, door = sim.targets.find(t => t.mesh.userData.component === 'upper-stair-entrance-door'), spawn = point(stair.startX - 1.5, 0, stair.centerZ); spawn.y = terrain.heightAt(spawn.x, spawn.z) + 1.7;
    const walk = () => { sim.teleport(spawn); let maxGroundGap = -Infinity; for (let i = 0; i < 780; i++) { sim.step(1 / 60, axis.x * 2, axis.z * 2, false); const p = sim.player.translation(); maxGroundGap = Math.max(maxGroundGap, p.y - .85 - terrain.meshHeightAt(p.x, p.z)); } const end = new THREE.Vector3().copy(sim.player.translation()); return { progress: end.clone().sub(spawn).dot(axis), local: local(end), maximumGroundGap: maxGroundGap }; };
    const closed = walk(); assert.ok(closed.progress > 17 && closed.progress < 22, JSON.stringify(closed)); assert.ok(closed.local[1] > info.openUndercroft.floor + .7, JSON.stringify(closed));
    sim.hit(door, 100, axis); model.update(near); const opened = walk(); assert.ok(opened.progress > closed.progress + 2, JSON.stringify({ closed, opened })); reset(); return { closedDoor: closed, destroyedDoor: opened };
  });
  check('ground-level orange entrance is separate from the upper stair entrance', () => {
    const e = info.lowerEntrance, door = sim.targets.find(t => t.mesh.userData.component === 'lower-orange-entrance-door'), p = point(e.x - 1, e.floor + 1.55, e.z), d = axis.clone(); sim.setFocus(p, true); sim.world.step(); assert.equal(cast(p, d, 2)?.object, door.mesh);
    const before = visual(p, d, 2); assert.ok(before); sim.hit(door, 100, d); model.update(near); sim.world.step(); assert.equal(cast(p, d, 2), null); assert.equal(visual(p, d, 2), null); assert.ok(info.openUndercroft.floor - e.floor > 2.4); reset();
    return { lowerFloor: e.floor, upperFloor: info.openUndercroft.floor, floorSeparation: info.openUndercroft.floor - e.floor, louverCount: sim.targets.filter(t => t.mesh.userData.component.includes('louver')).length };
  });
  check('six metre per second capsules traverse the centre and both stair edges in both directions', () => {
    const s = info.stair, o = info.openUndercroft, door = sim.targets.find(t => t.mesh.userData.component === 'upper-stair-entrance-door'), rows = [];
    const walk = (spawn, direction, frames) => { sim.teleport(spawn); for (let i = 0; i < frames; i++) sim.step(1 / 60, direction.x * 6, direction.z * 6, false); return local(new THREE.Vector3().copy(sim.player.translation())); };
    for (const offset of [-(s.width / 2 - .65), 0, s.width / 2 - .65]) {
      reset(); const z = s.centerZ + offset, start = point(s.startX - 3, 0, z); start.y = terrain.heightAt(start.x, start.z) + 1.7;
      const closed = walk(start, axis, 540); assert.ok(closed[0] > o.x + o.depth - .8 && closed[0] < o.x + o.depth, `stair edge blocked ${JSON.stringify({ offset, closed })}`); assert.ok(closed[1] > s.top + .75, `did not ascend ${JSON.stringify({ offset, closed })}`);
      sim.hit(door, 100, axis); model.update(near); const opened = walk(start, axis, 540); assert.ok(opened[0] > o.x + o.depth + .65, `stair door passage blocked ${JSON.stringify({ offset, opened })}`);
      const downSpawn = point(o.x + 1.5, s.top + 1.7, z), down = walk(downSpawn, axis.clone().negate(), 310); assert.ok(down[0] < s.startX - 2.7, `stair descent blocked ${JSON.stringify({ offset, down })}`);
      rows.push({ lateralOffset: offset, closedDoorLocal: closed, destroyedDoorLocal: opened, descentLocal: down });
    }
    reset(); return { speed: 6, ascentFrames: 540, descentFrames: 310, widthOffsets: rows, firstStepApproachParts: sim.targets.filter(t => t.mesh.userData.component === 'stair-terrain-approach').length };
  });
  check('bank entrance passes through the original recessed facade and preserves the orange entry', () => {
    const bank = info.bankFront, tangent = new THREE.Vector3().fromArray(bank.tangent), outward = new THREE.Vector3().fromArray(bank.outward), inward = outward.clone().negate();
    const door = sim.targets.find(t => t.mesh.uuid === bank.doorOwner), rows = [];
    assert.equal(door.mesh.userData.component, 'bank-entrance-door');
    function walk(goal) {
      let frames = 0, penetration = 0;
      for (; frames < 300; frames++) {
        const p = new THREE.Vector3().copy(sim.player.translation()), delta = goal.clone().sub(p).setY(0); if (delta.length() < .11) break;
        delta.normalize(); sim.step(1 / 60, delta.x * 6, delta.z * 6, false);
        if (frames % 10 === 0) for (const target of sim.nearby(new THREE.Vector3().copy(sim.player.translation()), 2)) if (target.body) { const contact = sim.playerCollider.contactCollider(target.body.collider(0), 0); if (contact) penetration = Math.max(penetration, -contact.distance); }
      }
      return { remaining: new THREE.Vector3().copy(sim.player.translation()).sub(goal).setY(0).length(), frames, penetration };
    }
    for (const offset of [-.95, 0, .95]) {
      reset(); const start = new THREE.Vector3().fromArray(bank.approach).addScaledVector(tangent, offset).addScaledVector(outward, .5), inside = new THREE.Vector3().fromArray(bank.inside).addScaledVector(tangent, offset);
      start.y = terrain.heightAt(start.x, start.z) + 1.7; sim.teleport(start); for (let i = 0; i < 60; i++) sim.step(1 / 60, 0, 0, false);
      const closed = walk(inside), insideDepth = inside.clone().sub(new THREE.Vector3().fromArray(bank.door)).dot(inward); assert.ok(closed.remaining > insideDepth - .1 && closed.remaining < insideDepth + .8, JSON.stringify({ offset, closed }));
      sim.hit(door, 100, inward); model.update(start); sim.world.step();
      const rayStart = new THREE.Vector3().fromArray(bank.door).addScaledVector(tangent, offset).addScaledVector(outward, .2); rayStart.y += 1.4;
      assert.equal(cast(rayStart, inward, insideDepth + .25), null, 'old row-zero glazing must not seal the new entrance');
      const opened = walk(inside), returned = walk(start); assert.ok(opened.remaining < .12 && returned.remaining < .12, JSON.stringify({ offset, opened, returned })); assert.ok(opened.penetration < .025 && returned.penetration < .025);
      rows.push({ offset, closed, opened, returned });
    }
    reset(); const e = info.lowerEntrance, orange = sim.targets.find(t => t.mesh.userData.component === 'lower-orange-entrance-door'), start = point(e.approachX - .5, 0, e.z), goal = point(e.x + 1, e.floor, e.z);
    start.y = terrain.heightAt(start.x, start.z) + 1.7; sim.teleport(start); for (let i = 0; i < 60; i++) sim.step(1 / 60, 0, 0, false); sim.hit(orange, 100, axis); model.update(start);
    const orangeForward = walk(goal), orangeReturn = walk(start); assert.ok(orangeForward.remaining < .12 && orangeReturn.remaining < .12, JSON.stringify({ orangeForward, orangeReturn }));
    reset(); return { speed: 6, bankPaths: rows, orangeForward, orangeReturn, originalUpperEntryTestedSeparately: true, exactSurveyedDoorPosition: false };
  });
  check('bank signs share one atlas and follow owner damage with readable text after H', () => {
    const bank = info.bankFront, label = meshes.find(m => m.name === 'student-center-bank-labels'), attr = label.geometry.attributes.position, uv = label.geometry.attributes.uv, atlas = label.material.map, text = atlas.image.textCalls;
    assert.deepEqual(text.map(v => v.text), ['신한은행', 'NH Bank', 'NH농협은행']); assert.equal(atlas.image.fills.length, 3); assert.equal(label.material.toneMapped, false);
    const originalLabels = attr.array.slice(), outward = new THREE.Vector3().fromArray(bank.outward), tangent = new THREE.Vector3().fromArray(bank.tangent);
    const eye = H(new THREE.Vector3().fromArray(bank.door).addScaledVector(outward, 10).addScaledVector(up, 1.3)), camera = new THREE.PerspectiveCamera(55, 1.5, .1, 100); camera.position.copy(eye); camera.lookAt(H(new THREE.Vector3().fromArray(bank.door).addScaledVector(up, 3))); camera.updateMatrixWorld(true);
    const projection = [], visible = [];
    scene.scale.z = -1; scene.updateMatrixWorld(true);
    for (const sign of bank.signs) {
      const left = new THREE.Vector3().fromBufferAttribute(attr, sign.start), right = new THREE.Vector3().fromBufferAttribute(attr, sign.start + 5), top = new THREE.Vector3().fromBufferAttribute(attr, sign.start + 1);
      const pl = H(left).project(camera), pr = H(right).project(camera), pt = H(top).project(camera); assert.ok(pl.x < pr.x && pt.y > pl.y, 'sign pixels must read left to right and top upwards after H');
      const texLeft = new THREE.Vector2().fromBufferAttribute(uv, sign.start), texRight = new THREE.Vector2().fromBufferAttribute(uv, sign.start + 5), texTop = new THREE.Vector2().fromBufferAttribute(uv, sign.start + 1); atlas.transformUv(texLeft); atlas.transformUv(texRight); atlas.transformUv(texTop);
      assert.ok(texLeft.x < texRight.x && texTop.y < texLeft.y, 'Canvas pixels must follow the projected glyph orientation');
      const tile = atlas.image.fills[projection.length], worldRatio = right.distanceTo(left) / top.distanceTo(left), pixelRatio = tile.width / tile.height, fontHeight = Number(text[projection.length].font.match(/(\d+)px/)[1]);
      assert.ok(Math.abs(pixelRatio / worldRatio - 1) < .1, 'atlas must not flatten the letters'); assert.ok(fontHeight / tile.height > .65 && fontHeight / tile.height < .9, 'letters must occupy a readable sign height');
      for (const fraction of [.1, .3, .5, .7, .9]) {
        const centre = left.clone().lerp(right, fraction).addScaledVector(up, top.distanceTo(left) / 2), rayOrigin = H(centre.clone().addScaledVector(outward, 4)), direction = H(outward).negate(), hit = new THREE.Raycaster(rayOrigin, direction, 0, 4.5).intersectObjects(meshes, false)[0]; assert.equal(hit?.object, label, 'columns or frames must not interrupt the sign from the courtyard'); visible.push(hit.distance);
      }
      projection.push({ text: sign.text, left: pl.x, right: pr.x, worldRatio, pixelRatio, fontHeightRatio: fontHeight / tile.height });
    }
    assert.ok(projection[0].right < projection[1].left && projection[1].right < projection[2].left);
    scene.scale.z = 1; scene.updateMatrixWorld(true);
    for (const sign of bank.signs) {
      reset(); const owner = sim.targets.find(t => t.mesh.uuid === sign.owner); sim.hit(owner, 100, tangent); model.update(near);
      for (const distance of [279, 281, 900]) {
        const observer = new THREE.Vector3().fromArray(sign.position).addScaledVector(outward, distance); sim.setFocus(observer, true); model.update(observer);
        for (const item of bank.signs) {
          const positions = attr.array.slice(item.start * 3, (item.start + item.count) * 3);
          if (item === sign) { const a = new THREE.Vector3().fromArray(positions), b = new THREE.Vector3().fromArray(positions, 3), c = new THREE.Vector3().fromArray(positions, 6); assert.equal(b.sub(a).cross(c.sub(a)).lengthSq(), 0); }
          else assert.deepEqual(positions, originalLabels.slice(item.start * 3, (item.start + item.count) * 3));
        }
      }
      reset(); assert.deepEqual(attr.array, originalLabels); assert.ok(owner.body);
    }
    return { labels: text.map(v => v.text), atlasCount: 1, labelMeshes: 1, projectedOrder: projection, exposedFaceDistances: visible, ownerDamageAndResetCases: 3, distances: [279, 281, 900], canvasRasterizationNotTested: true };
  });
  check('loaded and unloaded external rays agree for windows stairs and concave outline slabs', () => {
    const rays = [], kinds = new Set(); let seamTies = 0;
    for (const target of sim.targets) { const sizes = target.size.toArray(), thin = sizes.indexOf(Math.min(...sizes)), normal = new THREE.Vector3(thin === 0 ? 1 : 0, thin === 1 ? 1 : 0, thin === 2 ? 1 : 0).applyQuaternion(target.mesh.quaternion);
      for (const sign of [-1, 1]) { const n = normal.clone().multiplyScalar(sign); let surface = target.mesh.position.clone().addScaledVector(n, sizes[thin] / 2);
        if (target.collisionVertices) { const vertices = target.mesh.geometry.attributes.position; let maximumArea = 0; for (let i = 0; i < vertices.count; i += 3) { const tri = [0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(vertices, i + k).applyMatrix4(target.mesh.matrixWorld)), cross = tri[1].clone().sub(tri[0]).cross(tri[2].clone().sub(tri[0])), area = cross.length(); if (area > maximumArea && cross.normalize().dot(n) > .9) { maximumArea = area; surface = tri[0].add(tri[1]).add(tri[2]).multiplyScalar(1 / 3); } } }
        const p = surface.addScaledVector(n, .7), d = n.negate(); sim.setFocus(p, true); sim.world.step(); const hit = cast(p, d, 1); if (hit?.object !== target.mesh || hit.distance < .5) continue;
        const hits = new THREE.Raycaster(p, d, 0, 1).intersectObjects(sim.targets.map(t => t.mesh), false), distinct = hits.filter((h, i, all) => all.findIndex(q => q.object === h.object) === i); if (distinct.length > 1 && Math.abs(distinct[0].distance - distinct[1].distance) < .0001) { seamTies++; continue; }
        rays.push({ target, p, d, distance: hit.distance }); kinds.add(target.mesh.userData.component); break;
      }
    }
    assert.ok(rays.length > 300); for (const kind of ['mapped-low-roof', 'mapped-high-roof', 'projecting-window-body', 'external-stair-step', 'upper-stair-entrance-door']) assert.ok(kinds.has(kind), kind);
    sim.setFocus(far, true); sim.world.step(); let error = 0; for (const ray of rays) { const hit = sim.castUnloadedTargets(ray.p, ray.d, 1); assert.ok(hit?.object === ray.target.mesh, `unloaded target differs: ${JSON.stringify({ expected: ray.target.mesh.userData.component, actual: hit?.object.userData.component, loadedDistance: ray.distance, unloadedDistance: hit?.distance })}`); error = Math.max(error, Math.abs(hit.distance - ray.distance)); }
    assert.ok(error < .025); reset(); return { externalRays: rays.length, componentKinds: kinds.size, maximumDistanceDifference: error, coincidentSeamTiesExcluded: seamTies, startsInsideCollidersExcluded: true };
  });
  check('partial and complete damage persist at distance and reset restores exact buffers', () => {
    const target = sim.targets.find(t => t.mesh.userData.component === 'projecting-window-body'), normal = new THREE.Vector3().fromArray(target.mesh.userData.outward), p = target.mesh.position.clone().addScaledVector(normal, 2), d = normal.clone().negate(); sim.setFocus(p, true); sim.world.step(); assert.equal(cast(p, d, 2)?.object, target.mesh);
    sim.hit(target, 100, d); sim.world.step(); model.update(near); const remaining = triangles(); assert.ok(remaining > 0 && remaining < originalTriangles); assert.equal(cast(p, d, 2), null); sim.setFocus(far, true); model.update(far); assert.equal(triangles(), remaining); assert.equal(sim.castUnloadedTargets(p, d, 2), null);
    reset(); meshes.forEach((m, i) => assert.deepEqual(m.geometry.attributes.position.array, original[i])); sim.explode(point(0, 10, 0), 150, 100, up); model.update(near); assert.equal(triangles(), 0); model.update(far); assert.equal(shell.visible, false); reset(); assert.equal(triangles(), originalTriangles); meshes.forEach((m, i) => assert.deepEqual(m.geometry.attributes.position.array, original[i])); return { removedTriangles: originalTriangles - remaining, restoredTriangles: originalTriangles, restoredParts: sim.targets.length };
  });
  check('one H reflection preserves logical physics and puts the south wing on the photo right', () => {
    const eye = point(-60, 10, -50), target = point(-10, 10, -6), renderEye = H(eye), renderDirection = H(target).sub(renderEye).normalize(), right = renderDirection.clone().cross(up).normalize();
    const southRight = H(point(-10, 8, -18)).sub(H(point(-26, 8, -6))).dot(right); assert.ok(southRight > 10);
    const e = info.lowerEntrance, p = point(e.x - 1, e.floor + 1.55, e.z), d = axis.clone(), before = visual(p, d, 2); assert.ok(before);
    scene.scale.z = -1; scene.updateMatrixWorld(true); const reflected = new THREE.Raycaster(H(p), H(d), 0, 2).intersectObjects(meshes, false)[0]; assert.ok(reflected && Math.abs(before.distance - reflected.distance) < .001);
    sim.setFocus(p, true); sim.world.step(); const loaded = cast(p, d, 2); sim.setFocus(far, true); const unloaded = sim.castUnloadedTargets(p, d, 2); assert.ok(loaded && unloaded && loaded.object === unloaded.object && Math.abs(loaded.distance - unloaded.distance) < .025);
    scene.scale.z = 1; scene.updateMatrixWorld(true); reset(); return { southWingPhotographicRightDisplacement: southRight, reflectedRayDistanceDifference: Math.abs(before.distance - reflected.distance), logicalPhysicsUnchanged: true };
  });
  check('callback elevation and reversed winding keep the same campus placement', () => {
    const liftedScene = new THREE.Scene(); createStudentCenterLandmark(liftedScene, building, profile, (x, z) => terrain.heightAt(x, z) + 50); const lifted = liftedScene.children.find(o => o.userData.role === 'building-shell');
    for (let m = 0; m < meshes.length; m++) { const p = lifted.children[m].geometry.attributes.position.array; assert.equal(p.length, original[m].length); for (let i = 0; i < p.length; i += 3) { assert.ok(Math.abs(p[i] - original[m][i]) < .001 && Math.abs(p[i + 2] - original[m][i + 2]) < .001); assert.ok(Math.abs(p[i + 1] - original[m][i + 1] - 50) < .001); } }
    const reversedScene = new THREE.Scene(); createStudentCenterLandmark(reversedScene, { ...building, points: building.points.slice().reverse() }, profile, terrain.heightAt); const reversed = reversedScene.children.find(o => o.userData.role === 'building-shell'); assert.ok(Math.abs(reversed.userData.localOrigin.y - base) < .001); assert.deepEqual(reversed.userData.axis, info.axis); assert.deepEqual(reversed.userData.levels, info.levels);
    const e = info.lowerEntrance, p = point(e.x - 1, e.floor + 1.55, e.z), d = axis.clone(), before = visual(p, d, 2), after = new THREE.Raycaster(p, d, 0, 2).intersectObjects(reversed.children, false)[0]; assert.ok(before && after && Math.abs(before.distance - after.distance) < .001); return { callbackOffset: 50, reversedWindingSameDatumAndFront: true };
  });
  console.log(`Student center checks ${results.length}/${results.length} passed. Geometry and Rapier only; no browser, GPU benchmark or physical-phone test.`);
} finally { sim.world.removeCharacterController(sim.controller); sim.world.free(); await writeFile(path.join(out, 'results.json'), JSON.stringify({ scope: 'Current geometry, actual DEM and Rapier regression. No surveyed dimensions, browser rendering or physical-phone performance verification.', hashes, results }, null, 2) + '\n'); }
