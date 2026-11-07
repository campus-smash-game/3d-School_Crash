import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import * as THREE from 'three';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), out = path.join(root, 'artifacts/world-presentation-test');
await fs.mkdir(out, { recursive: true }); const hashes = {};
for (const filename of (await fs.readdir(path.join(root, 'src'))).filter(name => name.endsWith('.ts'))) {
  const source = await fs.readFile(path.join(root, 'src', filename), 'utf8'); hashes[filename] = createHash('sha256').update(source).digest('hex');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  await fs.writeFile(path.join(out, filename.replace(/\.ts$/, '.mjs')), compiled.replace(/from (['"])(\.\/[\w-]+)\1/g, "from '$2.mjs'"));
}
const calls = new Set(['fillRect', 'clearRect', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'ellipse', 'stroke', 'fill', 'fillText', 'strokeText', 'roundRect', 'save', 'restore', 'translate', 'rotate', 'scale', 'quadraticCurveTo', 'bezierCurveTo', 'setTransform']);
globalThis.document = { createElement(tag) { assert.equal(tag, 'canvas'); const context = new Proxy({}, { get(o, key) { if (key === 'measureText') return text => ({ width: String(text).length * 20 }); if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} }); return calls.has(key) ? () => {} : o[key]; }, set(o, key, value) { o[key] = value; return true; } }); return { width: 0, height: 0, getContext() { return context; } }; } };
const { createCampus } = await import(pathToFileURL(path.join(out, 'scene.mjs')));
const { createFullCampus } = await import(pathToFileURL(path.join(out, 'fullCampus.mjs')));
const { createAdmissionsLandmark } = await import(pathToFileURL(path.join(out, 'admissionsLandmark.mjs')));
const { getBuildingAppearance } = await import(pathToFileURL(path.join(out, 'buildingAppearance.mjs')));
const { dataToRenderPoint: H } = await import(pathToFileURL(path.join(out, 'coordinates.mjs')));
const data = JSON.parse(await fs.readFile(path.join(root, 'public/data/campus.json'), 'utf8'));
const awaitableSpriteShader = await fs.readFile(path.join(root, 'node_modules/three/src/renderers/shaders/ShaderLib/sprite.glsl.js'), 'utf8'), up = new THREE.Vector3(0, 1, 0);
const rootScene = new THREE.Scene(), world = new THREE.Scene(); rootScene.add(world);
const gate = createCampus(world, { full: true });
world.scale.z = -1;
const results = [];
function check(name, run) { const details = run(); results.push({ name, status: 'passed', ...details }); console.log(`PASS ${name} ${JSON.stringify(details ?? {})}`); }
function planeCamera(mesh) {
  mesh.updateWorldMatrix(true, false);
  const center = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld), normal = new THREE.Vector3(0, 0, 1).applyMatrix3(new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld)).normalize(), localUp = new THREE.Vector3(0, 1, 0).transformDirection(mesh.matrixWorld);
  const camera = new THREE.PerspectiveCamera(50, 1.5, .01, 200); camera.up.copy(localUp); camera.position.copy(center).addScaledVector(normal, 35); camera.lookAt(center); camera.updateMatrixWorld(true); return camera;
}
try {
  check('three physical text planes read left to right from their reflected front face', () => {
    const planes = []; world.traverse(o => { if (o.userData.worldText?.kind === 'plane') planes.push(o); }); assert.equal(planes.length, 2); assert.equal(world.getObjectByName('gate-bus-stop-sign'), undefined);
    const standalone = new THREE.Scene(); createCampus(standalone); standalone.scale.z = -1; const bus = standalone.getObjectByName('gate-bus-stop-sign'); assert.ok(bus); planes.push(bus);
    const samples = planes.map(mesh => {
      const camera = planeCamera(mesh), p = mesh.geometry.attributes.position, uv = mesh.geometry.attributes.uv;
      const vertex = (u, v) => { for (let i = 0; i < uv.count; i++) if (uv.getX(i) === u && uv.getY(i) === v) return new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld).project(camera); throw Error('UV corner missing'); };
      const left = vertex(0, 0), right = vertex(1, 0), top = vertex(0, 1); assert.ok(right.x > left.x && top.y > left.y, `${mesh.name} text is mirrored or upside down`);
      const uncorrectedLeft = vertex(1, 0), uncorrectedRight = vertex(0, 0); assert.ok(uncorrectedRight.x < uncorrectedLeft.x, 'negative control does not catch uncorrected U');
      const original = new THREE.PlaneGeometry(mesh.geometry.parameters.width, mesh.geometry.parameters.height); assert.deepEqual(mesh.geometry.attributes.position.array, original.attributes.position.array); assert.deepEqual(mesh.geometry.index.array, original.index.array); assert.deepEqual(mesh.geometry.attributes.normal.array, original.attributes.normal.array); original.dispose();
      assert.equal(mesh.geometry.userData.worldTextUReflection, true);
      return { name: mesh.name, projectedUWidth: right.x - left.x, projectedVHeight: top.y - left.y, geometryPositionsUnchanged: true, negativeControlWithoutUCorrectionMirrors: true };
    }); return { planes: samples };
  });
  check('actual Sprite shader keeps labels readable without reflecting UV or signed scales', () => {
    const shader = awaitableSpriteShader;
    assert.ok(shader.includes('modelViewMatrix[ 3 ]') && shader.includes('length( modelMatrix[ 0 ].xyz )') && shader.includes('length( modelMatrix[ 1 ].xyz )') && shader.includes('mvPosition.xy += rotatedPosition'));
    const fixture = { ...data, buildings: [{ id: 'presentation-label-fixture', name: '행정관', ref: '60', kind: 'university', points: [[100, 100], [120, 100], [120, 120], [100, 120], [100, 100]], holes: [], height: 14, levels: 4, heightEstimated: true, levelsEstimated: true }], roads: [], areas: [], stops: [], boundary: [] };
    world.scale.z = 1; createFullCampus(world, fixture, () => 0); world.scale.z = -1; world.updateMatrixWorld(true);
    const labels = []; world.traverse(o => { if (o.isSprite && o.userData.worldText) labels.push(o); }); assert.equal(labels.length, 1);
    const label = labels[0], matrix = label.matrixWorld; assert.ok(matrix.determinant() < 0);
    const scaleX = new THREE.Vector3().setFromMatrixColumn(matrix, 0).length(), scaleY = new THREE.Vector3().setFromMatrixColumn(matrix, 1).length(), center = new THREE.Vector3().setFromMatrixPosition(matrix);
    const camera = new THREE.PerspectiveCamera(50, 1.5, .01, 500); camera.position.copy(center).add(new THREE.Vector3(14, 5, 30)); camera.lookAt(center); camera.updateMatrixWorld(true);
    const mv = new THREE.Vector4(0, 0, 0, 1).applyMatrix4(new THREE.Matrix4().multiplyMatrices(camera.matrixWorldInverse, matrix)), p = label.geometry.attributes.position, uv = label.geometry.attributes.uv, vertices = [];
    for (let i = 0; i < p.count; i++) { const v = mv.clone(); v.x += (p.getX(i) - (label.center.x - .5)) * scaleX; v.y += (p.getY(i) - (label.center.y - .5)) * scaleY; v.applyMatrix4(camera.projectionMatrix); vertices.push({ x: v.x / v.w, y: v.y / v.w, u: uv.getX(i), v: uv.getY(i) }); }
    const left = vertices.find(p => p.u === 0 && p.v === 0), right = vertices.find(p => p.u === 1 && p.v === 0), top = vertices.find(p => p.u === 0 && p.v === 1); assert.ok(right.x > left.x && top.y > left.y); assert.deepEqual(label.material.map.repeat.toArray(), [1, 1]);
    return { labels: labels.length, worldDeterminant: matrix.determinant(), shaderScale: [scaleX, scaleY], UVChanged: false, numericalShaderContractOnly: true };
  });
  check('east-side observer sees north on the right after exactly one H transform', () => {
    const observerData = new THREE.Vector3(20, 5, 0), targetData = new THREE.Vector3(0, 5, 0), northData = new THREE.Vector3(0, 5, 1), southData = new THREE.Vector3(0, 5, -1);
    const camera = new THREE.PerspectiveCamera(50, 1.5, .01, 100); camera.position.copy(H(observerData)); camera.lookAt(H(targetData)); camera.updateMatrixWorld(true);
    const north = H(northData).project(camera), south = H(southData).project(camera); assert.ok(north.x > south.x);
    assert.ok(northData.clone().project(camera).x < southData.clone().project(camera).x, 'negative control does not catch missing H');
    return { dataObserver: observerData.toArray(), renderObserver: camera.position.toArray(), northScreenX: north.x, southScreenX: south.x };
  });
  check('all thirteen actual 150 strokes read correctly with existing geometry and a proper camera', () => {
    const building = data.buildings.find(b => b.id === 'way/386891016'), modelScene = new THREE.Scene(); createAdmissionsLandmark(modelScene, building, getBuildingAppearance(building), () => 0);
    const shell = modelScene.children.find(o => o.userData.role === 'building-shell'), info = shell.userData, mesh = shell.children.find(o => o.name === 'admissions-roofs-and-frames'), p = mesh.geometry.attributes.position, colors = mesh.geometry.attributes.color, color = new THREE.Color(0xcce1d9), numberVertices = [];
    for (let i = 0; i < p.count; i++) if (Math.abs(colors.getX(i) - color.r) < 1e-6 && Math.abs(colors.getY(i) - color.g) < 1e-6 && Math.abs(colors.getZ(i) - color.b) < 1e-6) numberVertices.push(new THREE.Vector3().fromBufferAttribute(p, i));
    assert.equal(numberVertices.length, 13 * 36);
    const rightData = new THREE.Vector3(info.axis.x, 0, info.axis.z), backData = new THREE.Vector3(-info.axis.z, 0, info.axis.x), local = (x, y, z) => new THREE.Vector3(info.localOrigin.x, info.localOrigin.y, info.localOrigin.z).addScaledVector(rightData, x).addScaledVector(up, y).addScaledVector(backData, z);
    const x0 = -info.dimensions.length * .37, y0 = info.bodyTop - .58, reference = H(local(x0, y0, -.13)), front = H(new THREE.Vector3(info.frontFacing.x, 0, info.frontFacing.z));
    const camera = new THREE.PerspectiveCamera(50, 1, .01, 100); camera.position.copy(reference).addScaledVector(front, 10); camera.lookAt(reference); camera.updateMatrixWorld(true); const cameraRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), cameraUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    assert.ok(cameraRight.dot(H(rightData)) > .999999, 'existing local +X no longer maps to screen right');
    const digits = [[1, 2], [0, 5, 6, 2, 3], [0, 1, 2, 3, 4, 5]], expected = [];
    for (let d = 0; d < digits.length; d++) for (const segment of digits[d]) { let x = d * .40, y = 0; if ([0, 3, 6].includes(segment)) y += segment === 0 ? .25 : segment === 3 ? -.25 : 0; else { x += [1, 2].includes(segment) ? .14 : -.14; y += [1, 5].includes(segment) ? .125 : -.125; } expected.push({ digit: '150'[d], segment, x, y }); }
    let error = 0; for (let i = 0; i < 13; i++) { const center = new THREE.Box3().setFromPoints(numberVertices.slice(i * 36, (i + 1) * 36)).getCenter(new THREE.Vector3()), delta = H(center).sub(reference), x = delta.dot(cameraRight), y = delta.dot(cameraUp); error = Math.max(error, Math.abs(x - expected[i].x), Math.abs(y - expected[i].y)); }
    assert.ok(error < .0001); return { text: '150', actualStrokes: 13, maximumProjectionErrorMeters: error, localGeometryReflected: false, reason: 'The number faces local -Z; after H its original local +X is already screen right.' };
  });
  check('gate key column and matching foundation occupy the documented west road side', () => {
    const column = gate.breakables.filter(p => p.mesh.userData.gate && p.size.y > 2.9 && p.size.x > 1.6); assert.equal(column.length, 7); assert.ok(column.every(p => Math.abs(p.mesh.position.x + 12.8) < 1e-8));
    const foundation = world.children.find(o => o.userData.gateFoundations?.some(f => f.side === 'west-column')); assert.ok(foundation); const foundationMatrix = new THREE.Matrix4(); foundation.getMatrixAt(foundation.userData.gateFoundations.find(f => f.side === 'west-column').index, foundationMatrix); const foundationX = new THREE.Vector3().setFromMatrixPosition(foundationMatrix).x; assert.equal(foundationX, -13);
    const camera = new THREE.PerspectiveCamera(50, 1.5, .01, 100); camera.position.copy(H(new THREE.Vector3(0, 12, 35))); camera.lookAt(H(new THREE.Vector3(0, 12, 0))); camera.updateMatrixWorld(true);
    const projected = H(new THREE.Vector3(-12.8, 12, 0)).project(camera); assert.ok(projected.x > 0); return { columnDataX: -12.8, foundationDataX: foundationX, northObserverColumnScreenX: projected.x };
  });
  check('fountain long edge stays west and prototype bus stop has no full-campus render or collider', () => {
    const waterFeatures = world.children.filter(o => o.userData.gateWaterFeature); assert.equal(waterFeatures.length, 4);
    for (const mesh of waterFeatures) {
      const positions = mesh.geometry.attributes.position, minimumX = Math.min(...Array.from({ length: positions.count }, (_, i) => positions.getX(i)));
      const westYs = Array.from({ length: positions.count }, (_, i) => i).filter(i => Math.abs(positions.getX(i) - minimumX) < 1e-6).map(i => positions.getY(i));
      assert.ok(Math.max(...westYs) - Math.min(...westYs) > 12.9, 'long fountain edge is not west'); assert.equal(mesh.position.x, 1);
    }
    assert.ok(gate.colliders.some(c => c.position.x === 1 && c.position.z === -27 && c.size.x === 6));
    const standalone = new THREE.Scene(), prototype = createCampus(standalone);
    const isBusCollider = c => c.position.x >= 48 && c.position.x <= 49.3 && c.position.z >= -12 && c.position.z <= -5;
    assert.equal(prototype.colliders.filter(isBusCollider).length, 4); assert.equal(gate.colliders.filter(isBusCollider).length, 0);
    assert.equal(prototype.breakables.filter(b => b.label === '정류장 유리').length, 1); assert.equal(gate.breakables.filter(b => b.label === '정류장 유리').length, 0);
    assert.equal(world.getObjectByName('gate-bus-stop-sign'), undefined);
    return { fountainParts: waterFeatures.length, longEdgeDataSide: 'west', prototypeBusColliders: 4, fullCampusBusColliders: 0, fullCampusBusGlass: 0 };
  });
  console.log(`${results.length}/${results.length} world presentation checks passed. CPU transforms and installed shader contract only; no real GPU/browser screen was tested.`);
} finally { await fs.writeFile(path.join(out, 'results.json'), JSON.stringify({ scope: 'CPU numerical projection and installed Three.js shader contract. No WebGL pixels, browser screen or mobile performance validation.', hashes, results }, null, 2) + '\n'); }
