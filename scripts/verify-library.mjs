import assert from 'node:assert/strict';
import {captureLoadedState, castLoaded} from './streaming-test-helpers.mjs';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, 'artifacts/library-test');
await mkdir(artifacts, { recursive: true });
// Compile current source dependencies; only imported modules execute.
for (const filename of (await readdir(path.join(root, 'src'))).filter(n => n.endsWith('.ts'))) {
  const name = filename.slice(0, -3);
  const source = await readFile(path.join(root, `src/${name}.ts`), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  await writeFile(path.join(artifacts, `${name}.mjs`), compiled.replace(/from '(\.\/[\w-]+)'/g, "from '$1.mjs'"));
}
const { createTerrain } = await import(pathToFileURL(path.join(artifacts, 'terrain.mjs')).href);
const { getBuildingAppearance } = await import(pathToFileURL(path.join(artifacts, 'buildingAppearance.mjs')).href);
const { createLandmarkBuilding } = await import(pathToFileURL(path.join(artifacts, 'landmarkBuildings.mjs')).href);
const { Simulation } = await import(pathToFileURL(path.join(artifacts, 'physics.mjs')).href);
await RAPIER.init();
// 간판 캔버스만 대체한다. 실제 글자 렌더링은 브라우저에서 확인한다.
globalThis.document={createElement(tag){assert.equal(tag,'canvas');return {width:0,height:0,getContext(){return new Proxy({},{get(o,k){return o[k]??(()=>{});},set(o,k,v){o[k]=v;return true;}});}};}};

const data = JSON.parse(await readFile(path.join(root, 'public/data/campus.json'), 'utf8'));
const elevation = JSON.parse(await readFile(path.join(root, 'public/data/terrain.json'), 'utf8'));
const library = data.buildings.find(b => b.id === 'way/329398175');
const mainLibrary = data.buildings.find(b => b.id === 'way/148286730');
assert.ok(library && mainLibrary, 'both library buildings must exist in real campus data');
const scene = new THREE.Scene();
const terrain = createTerrain(scene, elevation, data.buildings);
const model = createLandmarkBuilding(scene, library, getBuildingAppearance(library), terrain.heightAt);
assert.ok(model, 'the real landmark factory must select the library model');
const shell = scene.children.find(c => c.userData.role === 'building-shell' && c.userData.buildingId === library.id);
assert.ok(shell, 'library shell is missing');
const meshes = [];
shell.traverse(object => { if (object.isMesh) meshes.push(object); });
assert.ok(meshes.length > 0, 'library has no renderable geometry');
const originalPositions = meshes.map(mesh => mesh.geometry.attributes.position.array.slice());

// Derive the orientation from the input outline independently of the model's axis metadata.
const points = library.points.slice(0, -1);
const edges = points.map((p, i) => {
  const q = points[(i + 1) % points.length];
  return new THREE.Vector3(q[0] - p[0], 0, q[1] - p[1]);
});
const along = edges.sort((a, b) => b.lengthSq() - a.lengthSq())[0].normalize();
if (along.x < 0) along.negate();
const across = new THREE.Vector3(-along.z, 0, along.x);
const origin = new THREE.Vector3(shell.userData.localOrigin.x, shell.userData.localOrigin.y, shell.userData.localOrigin.z);
const local = (x, y, z) => origin.clone().addScaledVector(along, x).addScaledVector(across, z).add(new THREE.Vector3(0, y, 0));
const inward = across.clone().negate();
const near = local(0, 2, 35), far = new THREE.Vector3(100000, 300, 100000);
const sim = new Simulation(model.breakables, [], local(0, 100, 0), data.bounds, terrain);
const initialLoaded = captureLoadedState(sim);
const results = [];

function check(name, run) {
  const details = run();
  results.push({ name, status: 'passed', ...details });
  console.log(`PASS ${name}${details ? ` ${JSON.stringify(details)}` : ''}`);
}
function positions() {
  const values = [];
  for (const mesh of meshes) {
    const attribute = mesh.geometry.attributes.position;
    for (let i = 0; i < attribute.count; i++) values.push(new THREE.Vector3().fromBufferAttribute(attribute, i));
  }
  return values;
}
function visibleTriangles() {
  let count = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (const mesh of meshes) {
    if (!shell.visible || !mesh.visible) continue;
    const attribute = mesh.geometry.attributes.position;
    for (let i = 0; i < attribute.count; i += 3) {
      a.fromBufferAttribute(attribute, i); b.fromBufferAttribute(attribute, i + 1); c.fromBufferAttribute(attribute, i + 2);
      if (b.sub(a).cross(c.sub(a)).lengthSq() > 1e-10) count++;
    }
  }
  return count;
}
function cast(origin, direction, distance) {
  return castLoaded(sim, origin, direction, distance, false);
}
function isBuildingHit(hit) {
  return hit && sim.targets.some(target => target.body && target.body.handle === hit.collider.parent()?.handle);
}
function faceRay(target) {
  return { origin: target.mesh.position.clone().addScaledVector(across, 5), direction: inward, distance: 6 };
}
function assertRestored() {
  // 기존 상층은 cuboid, 새 계단과 얇은 난간은 실제 렌더 정점의 convex 형상을 사용한다.
  assert.equal(sim.destroyed, 0); assert.equal(sim.debris.length, 0);
  assert.equal(sim.world.bodies.len(), initialLoaded.bodies);
  assert.deepEqual(sim.targets.flatMap((target, index) => target.body ? [index] : []), initialLoaded.targets);
  for (const target of sim.targets) {
    assert.ok(target.mesh.visible && target.hp === target.toughness);
    sim.setFocus(target.box.getCenter(new THREE.Vector3()), true); sim.world.step();
    assert.ok(target.body); assert.equal(target.body.numColliders(), 1);
    assert.ok(target.mesh.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3().copy(target.body.translation())) < .001);
    assert.ok(Math.abs(target.mesh.getWorldQuaternion(new THREE.Quaternion()).dot(new THREE.Quaternion().copy(target.body.rotation()))) > .99999);
    const collider = target.body.collider(0);
    assert.equal(collider.shapeType(), target.collisionVertices ? RAPIER.ShapeType.ConvexPolyhedron : RAPIER.ShapeType.Cuboid);
    if (!target.collisionVertices) { const half = collider.halfExtents(); assert.ok(new THREE.Vector3(half.x, half.y, half.z).distanceTo(target.size.clone().multiplyScalar(.5)) < .001); }
  }
  sim.setFocus(new THREE.Vector3(1000000, 1000000, 1000000), true); assert.ok(sim.targets.every(target => !target.body));
  sim.setFocus(sim.spawn, true); sim.world.step();
  assert.equal(sim.world.bodies.len(), initialLoaded.bodies);
  assert.deepEqual(sim.targets.flatMap((target, index) => target.body ? [index] : []), initialLoaded.targets);
  for (let i = 0; i < meshes.length; i++) assert.deepEqual(meshes[i].geometry.attributes.position.array, originalPositions[i], 'reset must restore the original vertex buffer exactly');
}

let originalTriangles, damagedTarget, retainedTarget, removedRay, retainedRay;
try {
  check('library geometry follows the documented envelope and original map direction', () => {
    const vertices = positions();
    assert.ok(vertices.every(p => p.toArray().every(Number.isFinite)), 'non-finite library vertex');
    // 남동측 외부 계단은 30m 몸체 밖에 있다. 기존 상층 치수는 실제 상부 정점만으로 검사한다.
    const upperVertices = vertices.filter(p => p.y >= origin.y + 30.25);
    const xs = upperVertices.map(p => p.dot(along)), zs = upperVertices.map(p => p.dot(across));
    const length = Math.max(...xs) - Math.min(...xs), depth = Math.max(...zs) - Math.min(...zs);
    const roof = Math.max(...vertices.map(p => p.y));
    // Official report, printed page 104: 165 by 30 by 42.75 m. Folded cladding projects about 0.32 m.
    assert.ok(length >= 165 && length < 166, `incorrect length or orientation: ${length}`);
    assert.ok(depth >= 30 && depth < 31, `incorrect depth or orientation: ${depth}`);
    const mainPoints = mainLibrary.points.slice(0,-1);
    const datumX = mainPoints.reduce((sum,p)=>sum+p[0],0)/mainPoints.length;
    const datumZ = mainPoints.reduce((sum,p)=>sum+p[1],0)/mainPoints.length;
    const datum = terrain.heightAt(datumX,datumZ);
    assert.ok(Math.abs(origin.y-datum)<.001, 'library must share the mapped main-library datum after terrain correction');
    assert.ok(Math.abs(roof - datum - 42.75) < .02, 'roof must use the documented height above its shared mapped datum');
    assert.ok(model.breakables.every(part => part.size.toArray().every(value => Number.isFinite(value) && value > 0)), 'invalid collider size');
    originalTriangles = visibleTriangles(); assert.ok(originalTriangles > 0);
    return { length, depth, roofHeight: roof - origin.y };
  });

  check('the elevated span clears the main library roof on the real terrain', () => {
    const pts = mainLibrary.points.slice(0, -1);
    const x = pts.reduce((sum, p) => sum + p[0], 0) / pts.length;
    const z = pts.reduce((sum, p) => sum + p[1], 0) / pts.length;
    const mainRoof = terrain.heightAt(x, z) + (getBuildingAppearance(mainLibrary).height ?? mainLibrary.height);
    const underside = cast(local(0, 28, 0), new THREE.Vector3(0, 1, 0), 20);
    assert.ok(isBuildingHit(underside), 'no actual overhead collider above the centre of the span');
    for (const [x, z] of [[-7.5, 0], [7.5, 0], [0, 1]]) {
      assert.ok(isBuildingHit(cast(local(x, 28, z), new THREE.Vector3(0, 1, 0), 20)), `projectile ray leaked through a rotated slab joint at ${x}, ${z}`);
    }
    const undersideY = local(0, 28, 0).y + underside.timeOfImpact;
    assert.ok(undersideY > mainRoof + .5, `span intersects the existing main library roof: ${undersideY - mainRoof}`);
    assert.ok(undersideY < mainRoof + 12, 'span is detached too far above the main library');
    return { mainRoofY: mainRoof, undersideY, clearance: undersideY - mainRoof };
  });

  check('Rapier preserves the span void up to the photographed southeast body', () => {
    // This fixture contains the library and real terrain, not the neighbouring main library interior.
    // Stay two metres outside the 30 m envelope; the former 80 m ray also crossed the hillside behind it.
    // The revised southeast body starts near n=-10. The void remains open from n=17 to n=-8.
    assert.ok(!cast(local(0,25,17),inward,25),'The span void before the southeast body must stay open');
    assert.ok(isBuildingHit(cast(local(0,25,17),inward,34)),'The photographed southeast body must have collision');
    for (const x of [-72, 72]) assert.ok(isBuildingHit(cast(local(x, 25, 17), inward, 34)), `missing end-support collision at ${x}`);
    assert.ok(isBuildingHit(cast(local(0, 36, 17), inward, 34)), 'missing upper-span collision');
    return { testedSupports: 2, centralVoidOpen: true };
  });

  check('one destroyed facade opens its collision gap and remaining sections persist at all distances', () => {
    const candidates = sim.targets.filter(target => target.mesh.userData.component === 'bridge-facade' && target.mesh.position.clone().sub(origin).dot(across) > 0);
    candidates.sort((a, b) => a.mesh.position.distanceToSquared(local(0, 34, 15)) - b.mesh.position.distanceToSquared(local(0, 34, 15)));
    [damagedTarget, retainedTarget] = candidates;
    assert.ok(damagedTarget && retainedTarget, 'need separately destructible neighbouring facade pieces');
    removedRay = faceRay(damagedTarget); retainedRay = faceRay(retainedTarget);
    assert.ok(isBuildingHit(cast(removedRay.origin, removedRay.direction, removedRay.distance)));
    assert.equal(sim.hit(damagedTarget, damagedTarget.toughness + 1, inward), true);
    sim.world.step(); model.update(near);
    assert.equal(damagedTarget.body, null); assert.equal(damagedTarget.mesh.visible, false);
    assert.equal(cast(removedRay.origin, removedRay.direction, removedRay.distance), null, 'destroyed section still collides');
    assert.ok(isBuildingHit(cast(retainedRay.origin, retainedRay.direction, retainedRay.distance)), 'neighbour was removed with the hit section');
    const remaining = visibleTriangles();
    assert.ok(remaining > 0 && remaining < originalTriangles, 'rendered damage must remove only part of the model');
    sim.setFocus(far, true); model.update(far);
    assert.equal(visibleTriangles(), remaining, 'remaining geometry disappeared at long distance');
    assert.equal(sim.castUnloadedTargets(removedRay.origin, removedRay.direction, removedRay.distance), null);
    const distantHit = sim.castUnloadedTargets(retainedRay.origin, retainedRay.direction, retainedRay.distance);
    assert.equal(distantHit?.object, retainedTarget.mesh, 'unloaded remaining section must still accept distant projectile rays');
    model.update(near); assert.equal(visibleTriangles(), remaining);
    return { originalTriangles, remainingTriangles: remaining };
  });

  check('Simulation reset restores damaged geometry, collision and debris state', () => {
    sim.reset(); model.update(near); assertRestored();
    assert.ok(isBuildingHit(cast(removedRay.origin, removedRay.direction, removedRay.distance)), 'reset did not restore the collision gap');
    model.update(far); assert.equal(visibleTriangles(), originalTriangles);
    return { restoredTriangles: visibleTriangles() };
  });

  check('complete destruction stays hidden nearby and far away and can be reset', () => {
    const destroyed = sim.explode(local(0, 20, 0), 250, 100, new THREE.Vector3(0, 1, 0));
    assert.equal(destroyed, sim.targets.length, 'blast did not reach every building part');
    assert.ok(sim.targets.every(target => !target.mesh.visible && !target.body));
    for (const player of [near, far, near]) { model.update(player); assert.equal(visibleTriangles(), 0); }
    sim.reset(); model.update(far); assertRestored();
    assert.equal(visibleTriangles(), originalTriangles);
    return { destroyedParts: destroyed, restoredAtLongDistance: true };
  });
  console.log(`Library checks: ${results.length}/${results.length} passed.`);
  console.log('Scope: geometry and physics regression only; no full photograph comparison, browser rendering or physical-phone test.');
} finally {
  sim.world.free();
  await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({
    scope: 'Geometry and physics regression. Does not verify full photograph fidelity, browser rendering or mobile hardware.',
    results,
  }, null, 2) + '\n');
}
