import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), folder = path.join(root, 'artifacts/neutinamu-test'), modules = path.join(folder, 'modules'); await mkdir(modules, { recursive: true });
for (const name of ['terrain', 'physics', 'observedAppearances', 'buildingAppearance', 'neutinamuLandmark', 'engineering301303Site', 'livingScienceCourtyardSite', 'educationParkingSite', 'educationParkingTerrain', 'dining76Site', 'dining76Terrain', 'dining76EastSite', 'dining76EastTerrain', 'education101EntrySite', 'education101EntryTerrain', 'education12Site', 'education12Terrain', 'humanitiesGardenSite', 'humanitiesGardenTerrain']) {
  const source = await readFile(path.join(root, 'src', name + '.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  await writeFile(path.join(modules, name + '.mjs'), compiled.replace(/from '(\.\/[\w-]+)'/g, "from '$1.mjs'"));
}
const { createTerrain } = await import(pathToFileURL(path.join(modules, 'terrain.mjs')));
const { getBuildingAppearance } = await import(pathToFileURL(path.join(modules, 'buildingAppearance.mjs')));
const { createNeutinamuLandmark } = await import(pathToFileURL(path.join(modules, 'neutinamuLandmark.mjs')));
const { Simulation } = await import(pathToFileURL(path.join(modules, 'physics.mjs')));
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

const data = JSON.parse(await readFile(path.join(root, 'public/data/campus.json'), 'utf8')), building = data.buildings.find(b => b.id === 'way/439707878'); assert.ok(building);
const terrain = createTerrain(new THREE.Scene(), JSON.parse(await readFile(path.join(root, 'public/data/terrain.json'), 'utf8')), data.buildings), scene = new THREE.Scene(), profile = getBuildingAppearance(building);
const model = createNeutinamuLandmark(scene, building, profile, terrain.heightAt), shell = scene.children.find(o => o.userData.role === 'building-shell'), meshes = shell.children.filter(o => o.isMesh); scene.updateMatrixWorld(true);
const originals = meshes.map(mesh => mesh.geometry.attributes.position.array.slice()), info = shell.userData, origin = new THREE.Vector3(info.localOrigin.x, info.localOrigin.y, info.localOrigin.z), front = new THREE.Vector3(info.front.x, 0, info.front.z), along = new THREE.Vector3(info.axis.x, 0, info.axis.z);
const point = (u, y, offset) => origin.clone().add(new THREE.Vector3(info.frontEdge.a.x, y, info.frontEdge.a.z)).addScaledVector(along, u).addScaledVector(front, offset);
const near = point(info.frontEdge.width / 2, 2, 4), far = new THREE.Vector3(100000, 300, 100000), sim = new Simulation(model.breakables, [], point(0, 80, 0), data.bounds, terrain), collisionState = collisionVerifier(sim), results = [];
const cast = (origin, direction, distance) => { sim.setFocus(origin, true); sim.world.step(); return sim.world.castRay(new RAPIER.Ray(origin, direction), distance, true, undefined, undefined, undefined, undefined, collider => sim.targets.some(target => target.body && target.body.handle === collider.parent()?.handle)); };

function castOnly(target, origin, direction, distance) { sim.setFocus(origin, true); sim.world.step(); assert.ok(target.body, 'selected loaded target is absent'); return sim.world.castRay(new RAPIER.Ray(origin, direction), distance, true, undefined, undefined, undefined, undefined, collider => !!target.body && target.body.handle === collider.parent()?.handle); }
const rayMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
function partMeshes(target) { return target.mesh.userData.renderRanges.filter(range => range.end > range.start).map(range => { const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(originals[range.surface].slice(range.start, range.end), 3)); const mesh = new THREE.Mesh(geometry, rayMaterial); mesh.updateMatrixWorld(true); return mesh; }); }
function check(name, run) { const details = run(); results.push({ name, status: 'passed', ...details }); console.log(`PASS ${name} ${JSON.stringify(details)}`); }
function triangleCount() { if (!shell.visible) return 0; let count = 0; for (const mesh of meshes) { const p = mesh.geometry.attributes.position; for (let i = 0; i < p.count; i += 3) { const a = new THREE.Vector3().fromBufferAttribute(p, i), b = new THREE.Vector3().fromBufferAttribute(p, i + 1), c = new THREE.Vector3().fromBufferAttribute(p, i + 2); if (b.sub(a).cross(c.sub(a)).lengthSq() > 1e-10) count++; } } return count; }
const originalTriangles = triangleCount();
function resetCheck() { sim.reset(); model.update(near); assert.equal(sim.debris.length, 0); assert.equal(sim.destroyed, 0); collisionState.restored(); meshes.forEach((mesh, i) => assert.deepEqual(mesh.geometry.attributes.position.array, originals[i])); }
try {
  check('model preserves the mapped C courtyard and distinct yellow raised northern wing', () => {
    assert.equal(info.levels, 4); assert.ok(meshes.length <= 3); assert.ok(sim.targets.every(target => target.size.toArray().every(n => Number.isFinite(n) && n > 0)));
    assert.ok(meshes.every(mesh => Array.from(mesh.geometry.attributes.position.array).every(Number.isFinite)));
    const down = new THREE.Vector3(0, -1, 0), courtyard = new THREE.Vector3(899, origin.y + 30, -35);
    assert.ok(!(cast(courtyard, down, 60)), 'C courtyard filled by a building envelope');
    assert.ok(cast(new THREE.Vector3(916, origin.y + 30, -35), down, 60), 'eastern spine missing');
    assert.ok(cast(new THREE.Vector3(898, origin.y + 30, -53), down, 60), 'southern wing missing');
    assert.ok(cast(point(info.frontEdge.width * .35, 30, -3), down, 60), 'northern pod missing');
    return { meshes: meshes.length, breakables: sim.targets.length, triangles: originalTriangles, baseElevation: origin.y, estimatedHeight: info.dimensions.height };
  });

  check('reversed winding and every cyclic start preserve the same component geometry', () => {
    const source = building.points.slice(0, -1), baseProxies = model.breakables.map(target => ({ component: target.mesh.userData.component, p: target.mesh.position.toArray(), q: target.mesh.quaternion.toArray(), size: target.size.toArray() })); let variants = 0;
    for (const reverse of [false, true]) for (let start = 0; start < source.length; start++) for (const closed of [false, true]) {
      const ring = reverse ? [...source].reverse() : [...source], rotated = [...ring.slice(start), ...ring.slice(0, start)]; if (closed) rotated.push(rotated[0]);
      const otherScene = new THREE.Scene(), other = createNeutinamuLandmark(otherScene, { ...building, points: rotated }, profile, terrain.heightAt), otherShell = otherScene.children.find(object => object.userData.role === 'building-shell');
      assert.deepEqual(otherShell.userData.front, info.front); assert.deepEqual(otherShell.userData.body, info.body); assert.deepEqual(otherShell.userData.pod, info.pod); assert.deepEqual(otherShell.userData.south, info.south);
      assert.deepEqual(other.breakables.map(target => ({ component: target.mesh.userData.component, p: target.mesh.position.toArray(), q: target.mesh.quaternion.toArray(), size: target.size.toArray() })), baseProxies);
      meshes.forEach((mesh, m) => assert.deepEqual(otherShell.children[m].geometry.attributes.position.array, originals[m]));
      otherShell.children.forEach(mesh => { mesh.geometry.dispose(); mesh.material.dispose(); }); for (const target of other.breakables) target.mesh.geometry.dispose(); variants++;
    }
    return { inputVariants: variants, exactRenderAndProxyArrays: true };
  });
  check('curved window colliders follow the actual rendered boundary without covering concave gaps', () => {
    resetCheck(); let rayPairs = 0, maxSurfaceError = 0, maxLoadedUnloadedError = 0;
    for (const target of sim.targets.filter(target => target.mesh.userData.component === 'organic-pod-window')) {
      const ring = info.windows[target.mesh.userData.windowIndex].outline, center = new THREE.Vector2(ring.reduce((s, p) => s + p.x, 0) / ring.length, ring.reduce((s, p) => s + p.y, 0) / ring.length);
      const signs = ring.map((p, i) => { const a = ring[(i + ring.length - 1) % ring.length], b = ring[(i + 1) % ring.length]; return (p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x); });
      assert.ok(signs.every(value => value > 0) || signs.every(value => value < 0), 'an organic outline became concave and cannot use a single convex collider');
      assert.ok(target.collisionVertices instanceof Float32Array); assert.deepEqual(target.mesh.scale.toArray(), [1, 1, 1]);
      const render = partMeshes(target), direction = front.clone().negate();
      for (let i = 0; i < ring.length; i++) for (const factor of [.5, .97, 1.08]) {
        const a = ring[i], b = ring[(i + 1) % ring.length], u = center.x + ((a.x + b.x) / 2 - center.x) * factor, y = center.y + ((a.y + b.y) / 2 - center.y) * factor, from = point(u, y, 1.5);
        const visible = new THREE.Raycaster(from, direction, 0, 2).intersectObjects(render, false)[0], hit = castOnly(target, from, direction, 2), unloaded = new THREE.Raycaster(from, direction, 0, 2).intersectObject(target.mesh, false)[0];
        assert.equal(!!hit, !!visible, 'curved collision extends beyond the real rendered window'); assert.equal(!!unloaded, !!visible, 'unloaded proxy differs at a curved boundary');
        if (visible) { maxSurfaceError = Math.max(maxSurfaceError, Math.abs(hit.timeOfImpact - visible.distance)); maxLoadedUnloadedError = Math.max(maxLoadedUnloadedError, Math.abs(hit.timeOfImpact - unloaded.distance)); }
        rayPairs++;
      }
      render.forEach(mesh => mesh.geometry.dispose());
    }
    assert.ok(maxSurfaceError < .09, 'window collision is more than 9 cm from a visible surface'); assert.ok(maxLoadedUnloadedError < .003);
    return { rayPairs, maximumRenderedSurfaceError: maxSurfaceError, maximumLoadedUnloadedError: maxLoadedUnloadedError };
  });
  check('roof and soffit ray boundaries match rendered prisms within 2 cm', () => {
    resetCheck(); let samples = 0, misses = 0, maxError = 0, boundaryCases = 0, maxBoundaryError = 0;
    for (const target of sim.targets.filter(target => /roof|soffit/.test(target.mesh.userData.component))) {
      assert.ok(target.collisionVertices); const render = partMeshes(target), box = new THREE.Box3().setFromObject(target.mesh);
      for (const directionSign of [-1, 1]) for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++) {
        const from = new THREE.Vector3(THREE.MathUtils.lerp(box.min.x, box.max.x, (x + .31) / 5), directionSign < 0 ? box.max.y + 1 : box.min.y - 1, THREE.MathUtils.lerp(box.min.z, box.max.z, (z + .27) / 5)), direction = new THREE.Vector3(0, directionSign, 0);
        const visible = new THREE.Raycaster(from, direction, 0, 3).intersectObjects(render, false)[0], hit = castOnly(target, from, direction, 3), unloaded = new THREE.Raycaster(from, direction, 0, 3).intersectObject(target.mesh, false)[0];
        assert.equal(!!unloaded, !!visible, 'unloaded roof proxy differs from visible triangle');
        if (!!hit !== !!visible) {
          const actualPoint = from.clone().addScaledVector(direction, hit?.timeOfImpact ?? visible.distance); let separation = Infinity;
          for (const mesh of render) { const positions = mesh.geometry.attributes.position; for (let i = 0; i < positions.count; i += 3) { const triangle = new THREE.Triangle(new THREE.Vector3().fromBufferAttribute(positions, i), new THREE.Vector3().fromBufferAttribute(positions, i + 1), new THREE.Vector3().fromBufferAttribute(positions, i + 2)); separation = Math.min(separation, triangle.closestPointToPoint(actualPoint, new THREE.Vector3()).distanceTo(actualPoint)); } }
          assert.ok(separation < .02, 'Rapier roof boundary differs from rendered prism by ' + separation + ' m'); boundaryCases++; maxBoundaryError = Math.max(maxBoundaryError, separation);
        } else if (visible) maxError = Math.max(maxError, Math.abs(hit.timeOfImpact - visible.distance), Math.abs(unloaded.distance - visible.distance));
        if (!visible) misses++; samples++;
      }
      render.forEach(mesh => mesh.geometry.dispose());
    }
    assert.ok(misses > 100, 'roof boundary test did not sample outside triangle boundaries'); assert.ok(maxError < .003);
    return { rayPairs: samples, outsideTriangleMisses: misses, maximumRenderedSurfaceError: maxError, rapierBoundaryToleranceCases: boundaryCases, maximumBoundarySeparation: maxBoundaryError };
  });

  check('closed prism faces point outward and organic glazing faces the photographed front', () => {
    let faces = 0;
    for (const target of sim.targets.filter(target => /roof|soffit|yellow-window-surround|organic-pod-window|rounded-pod-/.test(target.mesh.userData.component))) {
      for (const range of target.mesh.userData.renderRanges) {
        const positions = originals[range.surface];
        for (let i = range.start; i < range.end; i += 9) {
          const a = new THREE.Vector3().fromArray(positions, i), b = new THREE.Vector3().fromArray(positions, i + 3), c = new THREE.Vector3().fromArray(positions, i + 6), normal = b.clone().sub(a).cross(c.clone().sub(a)); if (normal.lengthSq() < 1e-12) continue;
          if (target.mesh.userData.component === 'organic-pod-window') { if (range.surface === 1) assert.ok(normal.dot(front) > 0, 'organic glass has reversed triangle winding'); }
          else { const center = a.add(b).add(c).multiplyScalar(1 / 3); assert.ok(normal.dot(center.sub(target.mesh.position)) >= -.0001, 'closed prism has an inward face'); }
          faces++;
        }
      }
    }
    return { inspectedTriangles: faces };
  });
  check('window destruction opens the full curved aperture at loaded and unloaded distances', () => {
    const direction = front.clone().negate(); let samples = 0;
    for (const target of sim.targets.filter(target => target.mesh.userData.component === 'organic-pod-window')) {
      resetCheck(); const ring = info.windows[target.mesh.userData.windowIndex].outline, center = new THREE.Vector2(ring.reduce((s, p) => s + p.x, 0) / ring.length, ring.reduce((s, p) => s + p.y, 0) / ring.length);
      sim.hit(target, 100, direction); sim.world.step(); model.update(near);
      const tests = [];
      for (let i = 0; i < ring.length; i++) for (const factor of [.94, 1.08]) { const a = ring[i], b = ring[(i + 1) % ring.length]; tests.push({ inside: factor < 1, from: point(center.x + ((a.x + b.x) / 2 - center.x) * factor, center.y + ((a.y + b.y) / 2 - center.y) * factor, .9) }); }
      for (const { inside, from } of tests) {
        const visible = new THREE.Raycaster(from, direction, 0, 1.4).intersectObjects(meshes, false)[0], hit = cast(from, direction, 1.4);
        assert.equal(!!visible, !inside); assert.equal(!!hit, !inside, 'a destroyed curve still has collision inside the aperture'); samples++;
      }
      const remaining = triangleCount(); sim.setFocus(far, true); model.update(far); assert.equal(triangleCount(), remaining);
      for (const { inside, from } of tests) assert.equal(!!sim.castUnloadedTargets(from, direction, 1.4), !inside);
    }
    resetCheck(); return { apertureBoundarySamples: samples, loadedAndUnloaded: true };
  });
  check('three irregular windows and vertical and inclined support columns are separate parts', () => {
    assert.equal(sim.targets.filter(target => target.mesh.userData.component === 'organic-pod-window').length, 3);
    const vertical = sim.targets.find(target => target.mesh.userData.component === 'vertical-yellow-column'), inclined = sim.targets.find(target => target.mesh.userData.component === 'inclined-yellow-column'); assert.ok(vertical && inclined);
    const tilt = new THREE.Vector3(0, 1, 0).applyQuaternion(inclined.mesh.quaternion); assert.ok(Math.hypot(tilt.x, tilt.z) > .1, 'observed diagonal support became vertical');
    for (const target of [vertical, inclined]) assert.ok(cast(target.mesh.position.clone().addScaledVector(front, 1), front.clone().negate(), 2));
    return { organicWindows: 3, supportColumns: 2, inclinedHorizontalFraction: Math.hypot(tilt.x, tilt.z) };
  });

  check('rounded edge trim uses matching curved render and convex collision surfaces', () => {
    resetCheck(); const trims = sim.targets.filter(target => /^rounded-pod-/.test(target.mesh.userData.component)); assert.ok(trims.some(target => target.mesh.userData.component === 'rounded-pod-lower-trim')); assert.ok(trims.some(target => target.mesh.userData.component === 'rounded-pod-vertical-trim')); let samples = 0, maxError = 0;
    for (const target of trims) {
      assert.ok(target.collisionVertices); const render = partMeshes(target);
      for (const fraction of [-.35, 0, .35]) for (let i = 0; i < 16; i++) {
        const angle = (i + .4) / 16 * Math.PI * 2, radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)).applyQuaternion(target.mesh.quaternion), center = new THREE.Vector3(0, target.size.y * fraction, 0).applyQuaternion(target.mesh.quaternion).add(target.mesh.position), from = center.clone().addScaledVector(radial, .6), direction = radial.clone().negate();
        const visible = new THREE.Raycaster(from, direction, 0, 1).intersectObjects(render, false)[0], hit = castOnly(target, from, direction, 1), unloaded = new THREE.Raycaster(from, direction, 0, 1).intersectObject(target.mesh, false)[0]; assert.ok(visible && hit && unloaded);
        maxError = Math.max(maxError, Math.abs(hit.timeOfImpact - visible.distance), Math.abs(unloaded.distance - visible.distance)); samples++;
      }
      render.forEach(mesh => mesh.geometry.dispose());
    }
    assert.ok(maxError < .005, 'rounded trim collision differs by more than 5 mm');
    const target = trims[0]; sim.hit(target, 100, front); sim.world.step(); model.update(near); assert.ok(!(target.body)); assert.equal(target.mesh.visible, false); const remaining = triangleCount(); model.update(far); assert.equal(triangleCount(), remaining); assert.ok(remaining < originalTriangles); resetCheck();
    return { trimParts: trims.length, radialRayPairs: samples, maximumRenderedSurfaceError: maxError, damageReset: true };
  });
  check('actual lower glazing stays clear of terrain and the two column foundations reach ground', () => {
    const glazing = meshes.find(mesh => mesh.name.endsWith('glazing')).geometry.attributes.position; let minimum = Infinity, samples = 0;
    for (let i = 0; i < glazing.count; i += 3) { const a = new THREE.Vector3().fromBufferAttribute(glazing, i), b = new THREE.Vector3().fromBufferAttribute(glazing, i + 1), c = new THREE.Vector3().fromBufferAttribute(glazing, i + 2);
      for (let u = 0; u <= 6; u++) for (let v = 0; v <= 6 - u; v++) { const p = a.clone().multiplyScalar(1 - (u + v) / 6).addScaledVector(b, u / 6).addScaledVector(c, v / 6); minimum = Math.min(minimum, p.y - terrain.heightAt(p.x, p.z)); samples++; }
    }
    assert.ok(minimum > .1, `glazing buried in terrain by ${-minimum} m`);
    for (const target of sim.targets.filter(target => /yellow-column$/.test(target.mesh.userData.component))) { const lower = new THREE.Vector3(0, -target.size.y / 2, 0).applyQuaternion(target.mesh.quaternion).add(target.mesh.position); assert.ok(lower.y < terrain.heightAt(lower.x, lower.z)); }
    return { samples, minimumGlazingClearance: minimum };
  });
  check('the space below the pod is traversable rather than a filled wall box', () => {
    const start = point(info.frontEdge.width * .35, 0, 2); start.y = terrain.heightAt(start.x, start.z) + 1.72;
    const inward = front.clone().negate(); let headroom = Infinity;
    for (let d = 2; d < 11; d += .25) { const p = start.clone().addScaledVector(inward, d); headroom = Math.min(headroom, origin.y + info.podBottom - .2 - terrain.heightAt(p.x, p.z)); }
    assert.ok(headroom > 2.3); assert.ok(!(cast(start, inward, 15))); assert.equal(new THREE.Raycaster(start, inward, 0, 15).intersectObjects(meshes, false).length, 0);
    sim.teleport(start); for (let i = 0; i < 40; i++) sim.step(1 / 60, 0, 0, false);
    const before = new THREE.Vector3().copy(sim.player.translation()); for (let i = 0; i < 180; i++) sim.step(1 / 60, inward.x * 5, inward.z * 5, false);
    const travelled = new THREE.Vector3().copy(sim.player.translation()).sub(before).dot(inward); assert.ok(travelled > 14, 'player cannot pass below the photographed raised volume');
    return { minimumHeadroom: headroom, walkedMeters: travelled };
  });
  check('destroying each irregular window leaves a real hole at near and unloaded distances', () => {
    const report = [];
    for (const target of sim.targets.filter(target => target.mesh.userData.component === 'organic-pod-window')) {
      resetCheck(); const aim = new THREE.Vector3().fromArray(target.mesh.userData.center), from = aim.clone().addScaledVector(front, .9), direction = front.clone().negate(), hit = cast(from, direction, 1.35); assert.ok(hit); assert.equal(hit.collider.parent()?.handle, target.body.handle);
      sim.hit(target, 100, direction); sim.world.step(); model.update(near);
      assert.ok(!(cast(from, direction, 1.35)), 'opaque wall proxy remains behind the broken organic window'); assert.equal(new THREE.Raycaster(from, direction, 0, 1.35).intersectObjects(meshes, false).length, 0);
      const remaining = triangleCount(); assert.ok(remaining > 0 && remaining < originalTriangles); sim.setFocus(far, true); model.update(far); assert.equal(triangleCount(), remaining); assert.ok(!(sim.castUnloadedTargets(from, direction, 1.35)));
      const retained = sim.targets.find(other => other.mesh.userData.component === 'organic-pod-window' && other !== target), retainedFrom = new THREE.Vector3().fromArray(retained.mesh.userData.center).addScaledVector(front, .9); assert.equal(sim.castUnloadedTargets(retainedFrom, direction, 1.35)?.object, retained.mesh);
      report.push({ window: target.mesh.userData.windowIndex, remainingTriangles: remaining });
    }
    return { windows: report };
  });
  check('reset restores exact source arrays and removes every fully destroyed collider', () => {
    resetCheck(); assert.equal(sim.explode(origin.clone().add(new THREE.Vector3(0, 8, 0)), 100, 100, front), sim.targets.length);
    for (const player of [near, far, near]) { model.update(player); assert.equal(triangleCount(), 0); } assert.ok(sim.targets.every(target => !target.body)); resetCheck(); model.update(far); assert.equal(triangleCount(), originalTriangles);
    return { exactArraysRestored: true, noGhostColliders: true };
  });
  check('all geometry follows a changed terrain datum', () => {
    const shifted = new THREE.Scene(); createNeutinamuLandmark(shifted, building, profile, (x, z) => terrain.heightAt(x, z) + 40); const other = shifted.children.find(object => object.userData.role === 'building-shell');
    meshes.forEach((mesh, m) => { const a = mesh.geometry.attributes.position.array, b = other.children[m].geometry.attributes.position.array; assert.equal(a.length, b.length); for (let i = 0; i < a.length; i++) assert.ok(Math.abs(b[i] - a[i] - (i % 3 === 1 ? 40 : 0)) < .001); });
    return { terrainOffset: 40 };
  });
  console.log(`Neutinamu checks: ${results.length}/${results.length} passed. Procedural geometry and Rapier only; no browser or physical-phone verification.`);
} finally { sim.world.free(); await writeFile(path.join(folder, 'results.json'), JSON.stringify({ scope: 'Production module regression. Direction and dimensions are estimates; no browser or physical-phone test.', results }, null, 2) + '\n'); }
