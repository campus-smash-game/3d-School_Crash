import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, 'artifacts/engineering302-test');
await mkdir(artifacts, { recursive: true });
for (const name of ['terrain', 'physics', 'observedAppearances', 'buildingAppearance', 'engineering302Landmark', 'engineering301303Site', 'livingScienceCourtyardSite', 'educationParkingSite', 'educationParkingTerrain', 'dining76Site', 'dining76Terrain', 'dining76EastSite', 'dining76EastTerrain', 'education101EntrySite', 'education101EntryTerrain', 'education12Site', 'education12Terrain', 'humanitiesGardenSite', 'humanitiesGardenTerrain']) {
  const source = await readFile(path.join(root, `src/${name}.ts`), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  await writeFile(path.join(artifacts, `${name}.mjs`), compiled.replace(/from '(\.\/[\w-]+)'/g, "from '$1.mjs'"));
}
const { createTerrain } = await import(pathToFileURL(path.join(artifacts, 'terrain.mjs')).href);
const { getBuildingAppearance } = await import(pathToFileURL(path.join(artifacts, 'buildingAppearance.mjs')).href);
const { createEngineering302Landmark } = await import(pathToFileURL(path.join(artifacts, 'engineering302Landmark.mjs')).href);
const { Simulation } = await import(pathToFileURL(path.join(artifacts, 'physics.mjs')).href);
await RAPIER.init();
const data = JSON.parse(await readFile(path.join(root, 'public/data/campus.json'), 'utf8'));
const elevation = JSON.parse(await readFile(path.join(root, 'public/data/terrain.json'), 'utf8'));
const building = data.buildings.find(b => b.id === 'way/482207537');
assert.ok(building, 'the reviewed engineering 302 footprint must exist');
const scene = new THREE.Scene(), terrain = createTerrain(scene, elevation, data.buildings);
const model = createEngineering302Landmark(scene, building, getBuildingAppearance(building), terrain.heightAt);
const shell = scene.children.find(o => o.userData.buildingId === building.id && o.userData.role === 'building-shell');
assert.ok(shell);
const meshes = []; shell.traverse(o => { if (o.isMesh) meshes.push(o); });
const originals = meshes.map(m => m.geometry.attributes.position.array.slice());
const origin = new THREE.Vector3(shell.userData.localOrigin.x, shell.userData.localOrigin.y, shell.userData.localOrigin.z);
const axis = new THREE.Vector3(shell.userData.axis.x, 0, shell.userData.axis.z), east = new THREE.Vector3(-axis.z, 0, axis.x);
const { length, depth, height } = shell.userData.dimensions;
const { recess, frontTop } = shell.userData;
const local = (x, y, z) => origin.clone().addScaledVector(axis, x).addScaledVector(east, z).add(new THREE.Vector3(0, y, 0));
const near = local(0, 2, 0), far = new THREE.Vector3(100000, 300, 100000);
const sim = new Simulation(model.breakables, [], local(0, 80, 0), data.bounds, terrain);
const initialLoaded=sim.targets.map(t=>Boolean(t.body)),initialBodies=sim.world.bodies.len();
const results = [];
function check(name, run) { const details = run(); results.push({ name, status: 'passed', ...details }); console.log(`PASS ${name}${details ? ` ${JSON.stringify(details)}` : ''}`); }
function triangles() {
  let count = 0; const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (const mesh of meshes) if (shell.visible && mesh.visible) {
    const p = mesh.geometry.attributes.position;
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
      if (b.sub(a).cross(c.sub(a)).lengthSq() > 1e-10) count++;
    }
  }
  return count;
}
function cast(origin, direction, distance) {
  sim.setFocus(origin,true);sim.world.step();
  return sim.world.castRay(new RAPIER.Ray(origin, direction), distance, true, undefined, undefined, undefined, undefined,
    collider => sim.targets.some(target => target.body && target.body.handle === collider.parent()?.handle));
}
function renderCast(origin, direction, distance) {
  shell.updateMatrixWorld(true);
  return new THREE.Raycaster(origin, direction, 0, distance).intersectObjects(meshes, false)[0] ?? null;
}
function rayFor(target) {
  const sizes = target.size.toArray(), index = sizes.indexOf(Math.min(...sizes));
  const thinAxis = new THREE.Vector3(index === 0 ? 1 : 0, index === 1 ? 1 : 0, index === 2 ? 1 : 0);
  const normal = thinAxis.applyQuaternion(target.mesh.quaternion);
  return { origin: target.mesh.position.clone().addScaledVector(normal, 1.5), direction: normal.negate(), distance: 2.4 };
}
const hit = ray => cast(ray.origin, ray.direction, ray.distance);
const unloaded = ray => sim.castUnloadedTargets(ray.origin, ray.direction, ray.distance);
const targetOf = collision => {const body=collision?.collider.parent();return body?sim.targets.find(t=>t.body&&t.body.handle===body.handle):undefined;};
function restored() {
  assert.equal(sim.destroyed, 0); assert.equal(sim.debris.length, 0);
  assert.deepEqual(sim.targets.map(t=>Boolean(t.body)),initialLoaded);assert.equal(sim.world.bodies.len(),initialBodies);
  assert.ok(sim.targets.every(t => t.mesh.visible && t.hp === t.toughness));
  for(const target of sim.targets){sim.setFocus(target.mesh.position,true);sim.world.step();assert.ok(target.body);const extents=target.body.collider(0).halfExtents();assert.ok(extents&&new THREE.Vector3().copy(extents).distanceTo(target.size.clone().multiplyScalar(.5))<.0001);}
  sim.setFocus(far,true);sim.setFocus(sim.spawn,true);sim.world.step();assert.deepEqual(sim.targets.map(t=>Boolean(t.body)),initialLoaded);
  meshes.forEach((mesh, i) => assert.deepEqual(mesh.geometry.attributes.position.array, originals[i]));
}
let fullTriangles, removedRay, retainedRay, removedTarget, retainedTarget;
try {
  check('the 302 footprint retains its long axis, neck and estimated 35 m stepped outline in three meshes', () => {
    assert.equal(shell.userData.documentedLevels, 10);
    assert.equal(height, 35); assert.ok(frontTop < height - 5);
    assert.ok(meshes.length <= 3);
    assert.ok(shell.userData.frontFacing.x < -.99, 'the observed west frontage changed sides');
    const vertices = meshes.flatMap(m => Array.from({ length: m.geometry.attributes.position.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(m.geometry.attributes.position, i)));
    assert.ok(vertices.every(p => p.toArray().every(Number.isFinite)));
    const xs = vertices.map(p => p.clone().sub(origin).dot(axis)), zs = vertices.map(p => p.clone().sub(origin).dot(east));
    assert.ok(Math.max(...xs) - Math.min(...xs) <= length + .5);
    assert.ok(Math.max(...zs) - Math.min(...zs) <= depth + 3, 'only the entry canopy may project beyond the map footprint');
    assert.ok(Math.max(...vertices.map(p => p.y)) - origin.y <= 35.05);
    assert.ok(sim.targets.every(t => t.size.toArray().every(n => Number.isFinite(n) && n > 0)));
    assert.equal(sim.targets.filter(t => t.mesh.userData.component === 'red-x-frame').length, 6);
    const roofHeights = [...new Set(sim.targets.filter(t => t.mesh.userData.component === 'stepped-roof').map(t => Math.round((t.mesh.position.y - origin.y) * 10) / 10))];
    assert.equal(roofHeights.length, 3, 'tower, frontage and narrow connector should have three different roof heights');
    fullTriangles = triangles();
    return { meshes: meshes.length, breakableParts: sim.targets.length, triangles: fullTriangles, roofHeights };
  });
  check('the central glazing is recessed and the red frame leaves real openings', () => {
    const front = depth / 2, x = (recess.x0 + recess.x1) / 2;
    const emptyFront = { origin: local(x, 13, front + 1), direction: east.clone().negate(), distance: 4 };
    assert.equal(hit(emptyFront), null, 'a large collider fills the recess');
    assert.equal(renderCast(emptyFront.origin, emptyFront.direction, emptyFront.distance), null);
    const deep = { ...emptyFront, distance: 7 }, physical = hit(deep), rendered = renderCast(deep.origin, deep.direction, deep.distance);
    assert.equal(targetOf(physical)?.mesh.userData.component, 'recessed-glass');
    assert.ok(rendered && physical.timeOfImpact > 5 && Math.abs(physical.timeOfImpact - rendered.distance) < .2);
    // A point between the two diagonal beams must stay empty until the recessed pane.
    const hole = { origin: local(x, 21, front + 1), direction: east.clone().negate(), distance: 4 };
    assert.equal(hit(hole), null, 'the X was replaced with a solid rectangular collision plate');
    assert.equal(renderCast(hole.origin, hole.direction, hole.distance), null);
    const sky = { origin: local(0, 31, front + 2), direction: east.clone().negate(), distance: 12 };
    assert.equal(hit(sky), null); assert.equal(renderCast(sky.origin, sky.direction, sky.distance), null);
    const neck = { origin: local(-length * .16, 15, depth * .44), direction: axis, distance: 3 };
    assert.equal(hit(neck), null, 'the OSM side notch was filled');
    return { insetHitDistance: physical.timeOfImpact, recessAndFrameOpen: true, lowerRoofHasOpenSky: true };
  });
  check('visible glass, diagonal steel and sloped canopy have matching thin collision surfaces', () => {
    let checked = 0, maxDifference = 0; const counts = {};
    for (const target of sim.targets.filter(t => ['recessed-glass', 'red-x-frame', 'ribbon-facade', 'tower-curtain', 'sloped-entry-canopy'].includes(t.mesh.userData.component))) {
      const ray = rayFor(target), physical = hit(ray), rendered = renderCast(ray.origin, ray.direction, ray.distance);
      if (!rendered || targetOf(physical) !== target) continue;
      const difference = Math.abs(physical.timeOfImpact - rendered.distance);
      assert.ok(difference < .23, `${target.mesh.userData.component} collision differs by ${difference} m`);
      assert.ok(Math.min(...target.size.toArray()) < .7, 'a facade component became a deep collision box');
      maxDifference = Math.max(maxDifference, difference); checked++; counts[target.mesh.userData.component] = (counts[target.mesh.userData.component] ?? 0) + 1;
    }
    assert.ok(checked > 100 && counts['recessed-glass'] >= 8 && counts['red-x-frame'] >= 2 && counts['sloped-entry-canopy'] >= 3);
    return { checked, components: counts, maxDifferenceMeters: maxDifference };
  });
  check('opaque silver bands and window grids face outward for either footprint winding', () => {
    function inspectFront(objects) {
      objects.forEach(o => o.updateMatrixWorld(true));
      const at = (x, y, z, direction) => new THREE.Raycaster(local(x, y, z), direction, 0, 8).intersectObjects(objects, false)[0];
      const band = at(10, 7.5, depth / 2 + 2, east.clone().negate());
      const pane = at(10, 9.5, depth / 2 + 2, east.clone().negate());
      assert.equal(band?.object.name, 'engineering302-cladding-and-frame', 'silver band is buried behind glass');
      assert.equal(pane?.object.name, 'engineering302-blue-glazing', 'window opening became opaque cladding');
      // The mid-height grid crosses the recessed glass; this ray starts in the recess, between the X and the pane.
      const grid = at((recess.x0 + recess.x1) / 2 + .5, 12.25, depth / 2 - 1, east.clone().negate());
      assert.equal(grid?.object.name, 'engineering302-cladding-and-frame', 'recessed glazing grid faces the interior');
      // Both side reveals must face into the recess, even though their normals oppose each other.
      const revealOrigins = [recess.x0 + 1, recess.x1 - 1];
      for (let i = 0; i < revealOrigins.length; i++) {
        const reveal = at(revealOrigins[i], 12.25, depth / 2 - 2.5, axis.clone().multiplyScalar(i ? 1 : -1));
        assert.equal(reveal?.object.name, 'engineering302-cladding-and-frame', 'a side reveal grid faces away from the recess');
      }
    }
    inspectFront(meshes);
    const reversedScene = new THREE.Scene(); createEngineering302Landmark(reversedScene, { ...building, points: [...building.points].reverse() }, getBuildingAppearance(building), terrain.heightAt);
    const reverseShell = reversedScene.children.find(o => o.userData.role === 'building-shell');
    const reversed = []; reverseShell.traverse(o => { if (o.isMesh) reversed.push(o); });
    inspectFront(reversed);
    return { normalAndReversedWinding: true, exteriorBandPaneGridAndBothReveals: true };
  });
  check('loaded and unloaded projectile rays select the same individual components', () => {
    const samples = sim.targets.map(t => ({ target: t, ray: rayFor(t) })).filter(({ target, ray }) => targetOf(hit(ray)) === target);
    const expected = samples.map(({ target, ray }) => ({ target, ray, distance: hit(ray).timeOfImpact }));
    assert.ok(expected.length > 150);
    sim.setFocus(far, true); assert.ok(sim.targets.every(t => !t.body)); model.update(far);
    for (const { target, ray, distance } of expected) { const actual = unloaded(ray); assert.equal(actual?.object, target.mesh); assert.ok(Math.abs(actual.distance - distance) < .02); }
    assert.equal(triangles(), fullTriangles, 'intact 302 disappeared at long distance');
    sim.setFocus(near, true); sim.world.step();
    return { comparedRays: expected.length, distantSilhouetteVisible: true };
  });
  check('breaking one recessed pane removes only its own triangles and collision at every distance', () => {
    const candidates = sim.targets.filter(t => t.mesh.userData.component === 'recessed-glass').map(target => ({ target, ray: rayFor(target) })).filter(({ target, ray }) => targetOf(hit(ray)) === target && renderCast(ray.origin, ray.direction, ray.distance));
    const first = candidates.find(({ target }) => target.mesh.position.y > origin.y + 10 && target.mesh.position.y < origin.y + 18);
    assert.ok(first); removedTarget = first.target; removedRay = first.ray;
    const other = candidates.find(({ target }) => target.mesh.position.distanceTo(removedTarget.mesh.position) > 8);
    assert.ok(other); retainedTarget = other.target; retainedRay = other.ray;
    sim.hit(removedTarget, 100, removedRay.direction); sim.world.step(); model.update(near);
    assert.equal(removedTarget.body, null); assert.equal(hit(removedRay), null); assert.ok(hit(retainedRay));
    assert.equal(renderCast(removedRay.origin, removedRay.direction, removedRay.distance), null);
    assert.ok(triangles() > 0 && triangles() < fullTriangles);
    const remaining = triangles(); sim.setFocus(far, true); model.update(far);
    assert.equal(triangles(), remaining); assert.equal(unloaded(removedRay), null); assert.equal(unloaded(retainedRay)?.object, retainedTarget.mesh);
    assert.ok(sim.debris.length <= sim.maxDebris);
    return { remainingTriangles: remaining, unloadedHoleRemainsOpen: true };
  });
  check('reset restores exact vertex buffers, all health and loaded collision', () => {
    sim.reset(); model.update(far); restored(); assert.equal(triangles(), fullTriangles); assert.ok(hit(removedRay));
    return { exactVertexRestoration: true };
  });
  check('complete destruction stays invisible and a second reset restores the full model', () => {
    assert.equal(sim.explode(origin, 180, 100, new THREE.Vector3(0, 1, 0)), sim.targets.length);
    assert.ok(sim.targets.every(t => !t.mesh.visible && !t.body));
    for (const player of [near, far, near]) { model.update(player); assert.equal(triangles(), 0); }
    assert.ok(sim.debris.length <= sim.maxDebris);
    sim.reset(); model.update(near); restored(); assert.equal(triangles(), fullTriangles);
    return { completeDestructionInvisible: true, restoredTriangles: fullTriangles };
  });
  check('the complete model follows a variable terrain datum and foundations reach the sloped ground', () => {
    const slope = (x, z) => 90 + .012 * x - .017 * z;
    const extraScene = new THREE.Scene(), extra = createEngineering302Landmark(extraScene, building, getBuildingAppearance(building), slope);
    const extraShell = extraScene.children.find(o => o.userData.role === 'building-shell');
    assert.equal(extraShell.userData.localOrigin.y, slope(origin.x, origin.z));
    for (const target of extra.breakables.filter(t => t.mesh.userData.component === 'terrain-foundation')) {
      assert.ok(target.mesh.position.y - target.size.y / 2 < slope(target.mesh.position.x, target.mesh.position.z), 'foundation is suspended above terrain');
    }
    const flatScene = new THREE.Scene(); createEngineering302Landmark(flatScene, building, getBuildingAppearance(building), () => 25);
    const flatShell = flatScene.children.find(o => o.userData.role === 'building-shell');
    let highest = -Infinity; flatShell.traverse(o => { if (o.isMesh) { const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i++) highest = Math.max(highest, p.getY(i)); } });
    assert.ok(Math.abs(highest - 60) < .01, 'datum changed the relative height or restored the old 70 m block');
    return { slopedSiteOrigin: extraShell.userData.localOrigin.y, estimatedHeightOnFlatTerrain: highest - 25 };
  });
  await writeFile(path.join(artifacts, 'geometry.json'), JSON.stringify({ origin: origin.toArray(), axis: axis.toArray(), meshes: meshes.map(m => ({ name: m.name, position: Array.from(m.geometry.attributes.position.array), color: Array.from(m.geometry.attributes.color.array) })) }));
  console.log(`Engineering 302 checks: ${results.length}/${results.length} passed.`);
  console.log('Scope: source geometry and Rapier regression only; no browser rendering, physical phone test or dimensional survey.');
} finally {
  sim.world.free();
  await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ scope: 'Geometry and physics regression. Shape dimensions are approximate. No browser rendering or mobile hardware verification.', results }, null, 2) + '\n');
}
