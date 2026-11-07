import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, 'artifacts/research-park-test');
await mkdir(artifacts, { recursive: true });
for (const name of ['terrain', 'physics', 'observedAppearances', 'buildingAppearance', 'researchParkLandmark', 'engineering301303Site', 'livingScienceCourtyardSite', 'educationParkingSite', 'educationParkingTerrain', 'dining76Site', 'dining76Terrain', 'dining76EastSite', 'dining76EastTerrain', 'education101EntrySite', 'education101EntryTerrain', 'education12Site', 'education12Terrain', 'humanitiesGardenSite', 'humanitiesGardenTerrain']) {
  const source = await readFile(path.join(root, `src/${name}.ts`), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  await writeFile(path.join(artifacts, `${name}.mjs`), compiled.replace(/from '(\.\/[\w-]+)'/g, "from '$1.mjs'"));
}
const { createTerrain } = await import(pathToFileURL(path.join(artifacts, 'terrain.mjs')).href);
const { getBuildingAppearance } = await import(pathToFileURL(path.join(artifacts, 'buildingAppearance.mjs')).href);
const { createResearchParkLandmark } = await import(pathToFileURL(path.join(artifacts, 'researchParkLandmark.mjs')).href);
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
const building = data.buildings.find(b => b.id === 'way/439707875');
assert.ok(building, 'the reviewed research park footprint must exist');
const scene = new THREE.Scene(), terrain = createTerrain(scene, elevation, data.buildings);
const model = createResearchParkLandmark(scene, building, getBuildingAppearance(building), terrain.heightAt);
const shell = scene.children.find(o => o.userData.buildingId === building.id && o.userData.role === 'building-shell');
assert.ok(shell);
const meshes = []; shell.traverse(o => { if (o.isMesh) meshes.push(o); });
const originals = meshes.map(m => m.geometry.attributes.position.array.slice());
const origin = new THREE.Vector3(shell.userData.localOrigin.x, shell.userData.localOrigin.y, shell.userData.localOrigin.z);
const axis = new THREE.Vector3(shell.userData.axis.x, 0, shell.userData.axis.z), east = new THREE.Vector3(-axis.z, 0, axis.x);
const { length, depth, height } = shell.userData.dimensions;
const { canopy, foldPoints } = shell.userData;
const local = (x, y, z) => origin.clone().addScaledVector(axis, x).addScaledVector(east, z).add(new THREE.Vector3(0, y, 0));
const near = local(0, 2, 0), far = new THREE.Vector3(100000, 300, 100000);
const sim = new Simulation(model.breakables, [], local(0, 80, 0), data.bounds, terrain);
const collisionState = collisionVerifier(sim), results = [];
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
  sim.setFocus(origin, true); sim.world.step();
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
  if (target.mesh.userData.component === "sloped-canopy" && normal.y < 0) normal.negate();
  return { origin: target.mesh.position.clone().addScaledVector(normal, 1.5), direction: normal.negate(), distance: 2.4 };
}
const hit = ray => cast(ray.origin, ray.direction, ray.distance);
const unloaded = ray => sim.castUnloadedTargets(ray.origin, ray.direction, ray.distance);
const targetOf = collision => { const handle = collision?.collider.parent()?.handle; return handle === undefined ? undefined : sim.targets.find(target => target.body && target.body.handle === handle); };
function restored() {
  assert.equal(sim.destroyed, 0); assert.equal(sim.debris.length, 0);
  collisionState.restored();
  meshes.forEach((mesh, i) => assert.deepEqual(mesh.geometry.attributes.position.array, originals[i]));
}
let fullTriangles, removedRay, retainedRay;
try {
  check('the asymmetric map outline contains stepped wings and three folded glass bays in at most three meshes', () => {
    assert.equal(height, 14); assert.equal(shell.userData.estimatedLevels, 4); assert.equal(shell.userData.levelsEstimated, true);
    assert.ok(meshes.length <= 3); assert.ok(shell.userData.frontFacing.x < -.8 && shell.userData.frontFacing.z > .5);
    const vertices = meshes.flatMap(m => Array.from({ length: m.geometry.attributes.position.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(m.geometry.attributes.position, i)));
    assert.ok(vertices.every(p => p.toArray().every(Number.isFinite)));
    const xs = vertices.map(p => p.clone().sub(origin).dot(axis)), zs = vertices.map(p => p.clone().sub(origin).dot(east));
    assert.ok(Math.max(...xs) - Math.min(...xs) < length + .4); assert.ok(Math.max(...zs) - Math.min(...zs) < depth + .4);
    assert.ok(Math.max(...vertices.map(p => p.y)) - origin.y <= 14.05);
    const roofs = [...new Set(sim.targets.filter(t => t.mesh.userData.component === 'stepped-roof').map(t => Math.round((t.mesh.position.y - origin.y) * 100) / 100))];
    assert.equal(roofs.length, 3); assert.ok(sim.targets.filter(t => t.mesh.userData.component === 'folded-front').length >= 18);
    fullTriangles = triangles(); return { meshes: meshes.length, breakableParts: sim.targets.length, triangles: fullTriangles, estimatedRoofLevels: roofs };
  });
  check('three projecting folds have recessed valleys and the back map notch remains empty', () => {
    const distances = foldPoints.map(p => {
      const ray = { origin: local(p.x, 8, canopy.frontZ + 2), direction: east.clone().negate(), distance: 12 };
      const physical = hit(ray), rendered = renderCast(ray.origin, ray.direction, ray.distance);
      assert.equal(targetOf(physical)?.mesh.userData.component, 'folded-front');
      assert.ok(rendered && Math.abs(physical.timeOfImpact - rendered.distance) < .12);
      return physical.timeOfImpact;
    });
    for (const i of [1, 3, 5]) assert.ok(distances[i] + 1.3 < Math.min(distances[i - 1], distances[i + 1]), 'a broad collider filled a folded valley');
    const rear = { origin: local(8, 6, -depth * .35), direction: new THREE.Vector3(0, 1, 0), distance: 12 };
    assert.ok(!(hit(rear)), 'the concave rear map opening was filled'); assert.ok(!(renderCast(rear.origin, rear.direction, rear.distance)));
    return { foldHitDistances: distances, rearNotchPreserved: true };
  });
  check('the canopy follows its slope, leaves empty air above and below, and has thin tilted collision', () => {
    const center = (canopy.left + canopy.right) / 2;
    const above = { origin: local(center + 15, canopy.highY - .4, canopy.frontZ + .5), direction: east.clone().negate(), distance: 3 };
    const below = { origin: local(center - 4, 2.7, canopy.frontZ - 3), direction: axis, distance: 8 };
    for (const ray of [above, below]) { assert.ok(!(hit(ray))); assert.ok(!(renderCast(ray.origin, ray.direction, ray.distance))); }
    const panels = sim.targets.filter(t => t.mesh.userData.component === 'sloped-canopy');
    assert.ok(panels.length > 20);
    let checked = 0, largestDifference = 0;
    for (const target of panels) {
      assert.ok(Math.min(...target.size.toArray()) < .2);
      const ray = rayFor(target), physical = hit(ray), visible = renderCast(ray.origin, ray.direction, ray.distance);
      if (targetOf(physical) !== target || !visible) continue;
      const difference = Math.abs(physical.timeOfImpact - visible.distance); assert.ok(difference < .1);
      largestDifference = Math.max(largestDifference, difference); checked++;
    }
    assert.ok(checked > 20); return { checkedCanopyPanels: checked, largestDifferenceMeters: largestDifference };
  });
  check('front and folded window frames are visible from outside with either map winding', () => {
    function visibleFrameCount(shell) {
      const objects = []; shell.traverse(o => { if (o.isMesh) objects.push(o); }); shell.updateMatrixWorld(true);
      const frame = objects.find(o => o.name === 'research-park-frames-and-roof'), p = frame.geometry.attributes.position;
      let considered = 0, visible = 0, horizontal = 0, horizontalVisible = 0;
      for (let i = 0; i < p.count && (considered < 90 || horizontal < 30); i += 3) {
        const center = new THREE.Vector3().fromBufferAttribute(p, i).add(new THREE.Vector3().fromBufferAttribute(p, i + 1)).add(new THREE.Vector3().fromBufferAttribute(p, i + 2)).multiplyScalar(1 / 3);
        const q = center.clone().sub(origin), x = q.dot(axis), z = q.dot(east);
        if (center.y < origin.y + 6 || center.y > origin.y + 12 || x < canopy.left + 3 || x > canopy.right - 3 || z < canopy.backZ - .15) continue;
        const ys = [p.getY(i), p.getY(i + 1), p.getY(i + 2)];
        const isHorizontal = Math.max(...ys) - Math.min(...ys) < .09;
        if (considered >= 90 && (!isHorizontal || horizontal >= 30)) continue;
        considered++; if (isHorizontal) horizontal++;
        const first = new THREE.Raycaster(center.clone().addScaledVector(east, 4), east.clone().negate(), 0, 4.2).intersectObjects(objects, false)[0];
        if (first?.object === frame && Math.abs(first.distance - 4) < .025) { visible++; if (isHorizontal) horizontalVisible++; }
      }
      assert.ok(considered >= 50 && visible / considered > .8, `only ${visible}/${considered} exterior frame samples were visible`);
      assert.ok(horizontal >= 30 && horizontalVisible / horizontal > .9, 'horizontal window bars are obscured by glass');
      return { considered, visible, horizontal, horizontalVisible };
    }
    const standard = visibleFrameCount(shell);
    const reverseScene = new THREE.Scene(); createResearchParkLandmark(reverseScene, { ...building, points: [...building.points].reverse() }, getBuildingAppearance(building), terrain.heightAt);
    const reversed = visibleFrameCount(reverseScene.children.find(o => o.userData.role === 'building-shell'));
    return { standard, reversed };
  });
  check('loaded and unloaded shots hit identical folded glass, canopy, roof and wall parts', () => {
    const expected = sim.targets.map(target => ({ target, ray: rayFor(target) })).filter(({ target, ray }) => targetOf(hit(ray)) === target).map(s => ({ ...s, distance: hit(s.ray).timeOfImpact }));
    assert.ok(expected.length > 150);
    sim.setFocus(far, true); assert.ok(sim.targets.every(t => !t.body)); model.update(far);
    for (const { target, ray, distance } of expected) { const actual = unloaded(ray); assert.equal(actual?.object, target.mesh); assert.ok(Math.abs(actual.distance - distance) < .02); }
    assert.equal(triangles(), fullTriangles); sim.setFocus(near, true); sim.world.step();
    return { comparedRays: expected.length, intactFarGeometryRemainsVisible: true };
  });
  check('a single canopy pane loses its surface and collision without removing neighboring panes at distance', () => {
    const samples = sim.targets.filter(t => t.mesh.userData.component === 'sloped-canopy').map(target => ({ target, ray: rayFor(target) })).filter(({ target, ray }) => targetOf(hit(ray)) === target && renderCast(ray.origin, ray.direction, ray.distance));
    const first = samples.find(s => s.target.mesh.position.clone().sub(origin).dot(east) > canopy.frontZ - 2);
    assert.ok(first); removedRay = first.ray;
    const other = samples.find(s => s.target.mesh.position.distanceTo(first.target.mesh.position) > 15);
    assert.ok(other); retainedRay = other.ray;
    sim.hit(first.target, 100, removedRay.direction); sim.world.step(); model.update(near);
    assert.ok(!(hit(removedRay))); assert.ok(!(renderCast(removedRay.origin, removedRay.direction, removedRay.distance)));
    assert.ok(hit(retainedRay)); assert.ok(triangles() > 0 && triangles() < fullTriangles);
    const remaining = triangles(); sim.setFocus(far, true); model.update(far);
    assert.equal(triangles(), remaining); assert.ok(!(unloaded(removedRay))); assert.equal(unloaded(retainedRay)?.object, other.target.mesh);
    return { remainingTriangles: remaining, paneHolePersistsAtDistance: true };
  });
  check('reset restores exact buffers and collision after partial damage', () => {
    sim.reset(); model.update(far); restored(); assert.equal(triangles(), fullTriangles); assert.ok(hit(removedRay));
    return { exactVertexRestoration: true };
  });
  check('complete destruction stays invisible, debris stays bounded and repeated reset restores all parts', () => {
    assert.equal(sim.explode(origin, 180, 100, new THREE.Vector3(0, 1, 0)), sim.targets.length);
    assert.ok(sim.targets.every(t => !t.body && !t.mesh.visible)); assert.ok(sim.debris.length <= sim.maxDebris);
    for (const point of [near, far, near]) { model.update(point); assert.equal(triangles(), 0); }
    sim.reset(); model.update(near); restored(); assert.equal(triangles(), fullTriangles);
    return { restoredTriangles: fullTriangles };
  });
  check('terrain datum shifts every surface and foundations meet a nonconstant slope', () => {
    const slope = (x, z) => 60 + .015 * x - .02 * z, extraScene = new THREE.Scene();
    const extra = createResearchParkLandmark(extraScene, building, getBuildingAppearance(building), slope);
    assert.equal(extraScene.children.find(o => o.userData.role === 'building-shell').userData.localOrigin.y, slope(origin.x, origin.z));
    for (const t of extra.breakables.filter(t => t.mesh.userData.component === 'terrain-foundation')) assert.ok(t.mesh.position.y - t.size.y / 2 < slope(t.mesh.position.x, t.mesh.position.z));
    const flat = new THREE.Scene(); createResearchParkLandmark(flat, building, getBuildingAppearance(building), () => 25);
    let highest = -Infinity; flat.traverse(o => { if (o.isMesh) { const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i++) highest = Math.max(highest, p.getY(i)); } });
    assert.ok(Math.abs(highest - 39) < .01); return { relativeEstimatedHeight: highest - 25, slopedFoundationsReachTerrain: true };
  });
  check('the low canopy edge and entrance retain clearance above actual terrain and the immediate approach', () => {
    let edgeClearance = Infinity, approachClearance = Infinity;
    for (let i = 0; i <= 30; i++) {
      const x = THREE.MathUtils.lerp(canopy.left, canopy.right, i / 30), edge = local(x, canopy.lowY, canopy.frontZ), approach = local(x, 0, canopy.frontZ + 2);
      edgeClearance = Math.min(edgeClearance, edge.y - terrain.heightAt(edge.x, edge.z));
      approachClearance = Math.min(approachClearance, edge.y - terrain.heightAt(approach.x, approach.z));
    }
    assert.ok(edgeClearance > 1.75, `terrain intrudes into the low entry glazing: clearance ${edgeClearance}`);
    assert.ok(approachClearance > 1.7, `the immediate approach rises into the canopy: clearance ${approachClearance}`);
    return { samples: 31, minLowEdgeClearanceMeters: edgeClearance, minApproachClearanceMeters: approachClearance };
  });
  await writeFile(path.join(artifacts, 'geometry.json'), JSON.stringify({ origin: origin.toArray(), axis: axis.toArray(), meshes: meshes.map(m => ({ name: m.name, position: Array.from(m.geometry.attributes.position.array), color: Array.from(m.geometry.attributes.color.array) })) }));
  console.log(`Research park checks: ${results.length}/${results.length} passed.`);
  console.log('Scope: source geometry and Rapier regression only; no browser rendering, physical phone test or dimensional survey.');
} finally {
  sim.world.free();
  await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ scope: 'Geometry and physics regression. Height, floor count, dimensions and facade orientation remain estimates. No browser rendering or mobile hardware verification.', results }, null, 2) + '\n');
}
