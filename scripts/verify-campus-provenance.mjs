import {assertCampusSourcePreserved} from './assert-campus-source-preserved.mjs';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { ensureCampusProvenanceBaseline, RELEASE16_BASELINE } from './campus-provenance-baseline.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts/campus-provenance-test');
await mkdir(out, { recursive: true });
const id = 'supplemental/snu-303';
const baselinePath = 'artifacts/engineering303-review/pre-supplement-campus.json';
const manifestPath = 'sources/campus-supplemental-buildings.json';
const release16 = RELEASE16_BASELINE;
const hash = value => createHash('sha256').update(value).digest('hex');
const same = (a, b, message) => assert.ok(isDeepStrictEqual(a, b), message);
const bytes = relative => readFile(path.join(root, relative));
const json = async relative => JSON.parse(await bytes(relative));
const arrayBytes = value => Buffer.from(value.buffer, value.byteOffset, value.byteLength);
const results = [], sourceHashes = {}, models = [], metrics = {};
async function check(name, run) {
  try {
    const details = await run(); results.push({ name, status: 'passed', ...details });
    console.log(`PASS ${name}${details ? ` ${JSON.stringify(details)}` : ''}`);
  } catch (error) {
    results.push({ name, status: 'failed', error: error.message }); throw error;
  }
}
try {
  const baselineFixtures = await ensureCampusProvenanceBaseline(root);
  metrics.baselineFixtures = baselineFixtures;
  const inputs = [baselinePath, manifestPath, 'public/data/campus.json', 'public/data/terrain.json', 'sources/campus.osm', 'src/terrain.ts', 'src/engineering301303Site.ts', 'src/livingScienceCourtyardSite.ts', 'src/educationParkingSite.ts', 'src/educationParkingTerrain.ts', 'src/fullCampus.ts', 'scripts/verify-campus-provenance.mjs', 'scripts/campus-provenance-baseline.mjs', 'artifacts/campus-provenance-test/baseline-terrain.mjs', 'artifacts/campus-provenance-test/baseline-provenance.json'];
  for (const file of inputs) sourceHashes[file] = hash(await bytes(file));
  const baseline = await json(baselinePath), current = await json('public/data/campus.json'), manifest = await json(manifestPath);
  const dem = await json('public/data/terrain.json'), demBefore = structuredClone(dem), beforeCurrent = structuredClone(current), beforeBaseline = structuredClone(baseline);

  await check('release16 baseline, raw OSM and raw DEM retain their independently recorded hashes', async () => {
    assert.equal(sourceHashes[baselinePath], release16.campus, 'baseline campus is not the preserved release16 input');
    assert.equal(sourceHashes['sources/campus.osm'], release16.osm, 'raw OSM was changed');
    assert.equal(sourceHashes['public/data/terrain.json'], release16.dem, 'raw DEM was changed');
    assert.equal(sourceHashes['artifacts/campus-provenance-test/baseline-terrain.mjs'], release16.terrainModule, 'historical compiled terrain was changed');
    const provenance = await json('artifacts/campus-provenance-test/baseline-provenance.json');
    assert.equal(provenance.releaseCommit, release16.commit); assert.equal(provenance.compiledSha256, release16.terrainModule);
    assert.equal(provenance.baselineCampusSha256, release16.campus); assert.equal(provenance.baselineRawDemSha256, release16.dem);
    assert.equal(baseline.buildings.length, 205); assert.equal(baseline.roads.length, 715);
    return { releaseCommit: release16.commit, osmFootprints: 205, roads: 715, rawDemSha256: release16.dem };
  });
  await check('all 205 original footprint rows and 715 roads are preserved including both relation outer rings', () => {
    const originalRows = current.buildings.filter(b => !b.id.startsWith('supplemental/'));
    same(originalRows, baseline.buildings, 'original OSM footprint rows, order or properties changed');
    for (const key of ['roads', 'areas', 'stops', 'boundary', 'bounds', 'origin']) same(current[key], baseline[key], `${key} changed after adding 303`);
    const oldRelation = baseline.buildings.filter(b => b.id === 'relation/9741477'), newRelation = current.buildings.filter(b => b.id === 'relation/9741477');
    assert.equal(oldRelation.length, 2); same(newRelation, oldRelation, 'multipolygon outer rings were lost or renamed');
    assert.equal(current.buildings.length, 205 + manifest.buildings.length); assert.equal(current.buildings.filter(b => b.id === id).length, 1);
    return { totalFootprints: current.buildings.length, originalFootprints: originalRows.length, originalUniqueIds: new Set(originalRows.map(b => b.id)).size, relationOuterRows: newRelation.length };
  });
  await check('the actual 303 footprint and provenance match the manifest without treating approximate geometry as OSM', () => {
    assert.equal(manifest.schemaVersion, 1); assert.equal(manifest.coordinateSystem, 'campus-local-east-north-meters');
    for (const key of ['lat', 'lon']) assert.equal(manifest.origin[key], baseline.origin[key], `manifest ${key} differs from the original origin`);
    const entry = manifest.buildings.find(b => b.id === id), generated = current.buildings.find(b => b.id === id);
    assert.equal(manifest.buildings.length, 2); assert.ok(entry && generated, 'actual 303 entry missing');
    same(generated, entry, 'processed 303 changed manifest geometry or metadata');
    assert.equal(entry.ref, '303'); assert.match(entry.name, /해동/); assert.equal(entry.footprintEstimated, true); assert.equal(entry.terrainPad, false);
    assert.equal(entry.levels, 7); assert.equal(entry.levelsEstimated, false); assert.equal(entry.heightEstimated, true);
    assert.ok(Number.isFinite(entry.height) && entry.height > 0); assert.ok(Array.isArray(entry.sources) && entry.sources.length > 0);
    for (const source of entry.sources) { const url = new URL(source.url); assert.ok(['http:', 'https:'].includes(url.protocol)); assert.equal(url.username, ''); assert.equal(url.password, ''); }
    for (const ring of [entry.points, ...(entry.holes ?? [])]) {
      assert.ok(ring.length >= 4); same(ring[0], ring.at(-1), '303 ring is open');
      assert.ok(ring.every(point => point.length === 2 && point.every(Number.isFinite)), '303 coordinates are not finite local D pairs');
    }
    return { id, ref: entry.ref, points: entry.points.length - 1, heightEstimated: true, levelsEstimated: false, footprintEstimated: true, terrainPad: false, sources: entry.sources.length };
  });
  await check('dataset attribution preserves OSM information and separately records supplemental buildings', () => {
    assert.equal(current.source.provider, 'OpenStreetMap'); assert.equal(current.source.osmNote, baseline.source.note);
    for (const key of ['attribution', 'license', 'licenseUrl', 'endpoint', 'boundary']) same(current.source[key], baseline.source[key], `OSM ${key} changed`);
    const extra = current.source.supplemental;
    assert.ok(extra && extra.provider !== 'OpenStreetMap'); assert.equal(extra.count, manifest.buildings.length); same(extra.buildingIds, manifest.buildings.map(b=>b.id).sort(), 'supplemental ownership metadata differs');
    same(extra.origin, { lat: baseline.origin.lat, lon: baseline.origin.lon }, 'supplemental origin differs');
    assert.equal(extra.coordinateSystem, manifest.coordinateSystem); assert.notEqual(current.source.note, baseline.source.note);
    same(extra.sources, extra.buildingIds.flatMap(id=>manifest.buildings.find(b=>b.id===id).sources), 'aggregated source list differs from the actual manifest');
    return { baseProvider: current.source.provider, supplementalProvider: extra.provider, supplementalCount: extra.count };
  });

  const source = (await bytes('src/terrain.ts')).toString('utf8');
  const compiled = ts.transpileModule(source, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  assert.equal((compiled.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0, 'terrain transpilation produced errors');
  const currentModule = path.join(out, 'current-terrain.mjs');
  await writeFile(currentModule, compiled.outputText.replace(/from (['"])(\.\/[\w-]+)\1/g, "from '$2.mjs'"));
  for (const name of (await readdir(path.join(root,'src'))).filter(f=>f.endsWith('.ts')&&!f.endsWith('.d.ts')).map(f=>f.slice(0,-3))) {
    const dependency = (await bytes(`src/${name}.ts`)).toString('utf8');
    const dependencyModule = ts.transpileModule(dependency, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    await writeFile(path.join(out, `${name}.mjs`), dependencyModule.replace(/from (['"])(\.\/[\w-]+)\1/g, "from '$2.mjs'"));
  }
  const { createTerrain: oldCreateTerrain } = await import(pathToFileURL(path.join(out, 'baseline-terrain.mjs')).href);
  const { createTerrain } = await import(pathToFileURL(currentModule).href);
  const historical = oldCreateTerrain(new THREE.Scene(), dem, baseline.buildings);
  const historicalOptions = { engineering30:false,engineering30Dining:false, science28:false, science251:false, science24:false, science2527:false, science26:false, science23:false, education1112:false, education13:false, education1320:false, pharmacy20:false, pharmacy2021:false, pharmacy21:false, pharmacy143:false, physics561:false, librarySoutheast:false, libraryAmenities:false, livingScienceCourtyard: false, educationParking: false, dining76: false, dining76East: false, education101: false, education12: false, humanitiesGarden: false };
  const currentWithout303 = createTerrain(new THREE.Scene(), dem, baseline.buildings, historicalOptions);
  const noCutBuildings = structuredClone(current.buildings); for (const building of noCutBuildings) delete building.terrainCut;
  const currentWith303NoCut = createTerrain(new THREE.Scene(), dem, noCutBuildings, historicalOptions);
  const currentWith303 = createTerrain(new THREE.Scene(), dem, current.buildings, historicalOptions);
  models.push(historical, currentWithout303, currentWith303NoCut, currentWith303);

  await check('without supplemental 303 and with later independent site corrections disabled terrain remains byte-identical to release16', () => {
    for (const [label, terrain] of [['current without 303', currentWithout303]]) {
      assert.ok(arrayBytes(terrain.vertices).equals(arrayBytes(historical.vertices)), `${label}: physical vertex data changed`);
      assert.ok(arrayBytes(terrain.indices).equals(arrayBytes(historical.indices)), `${label}: physical triangle indices changed`);
      same(terrain.bounds, historical.bounds, `${label}: terrain bounds changed`);
      same(terrain.heightAt.detailRegions, historical.heightAt.detailRegions, `${label}: refinement regions changed`);
      assert.equal(terrain.heightAt.sampleStep, historical.heightAt.sampleStep, `${label}: road sample step changed`);
      const a = terrain.mesh.geometry, b = historical.mesh.geometry;
      same(Object.keys(a.attributes).sort(), Object.keys(b.attributes).sort(), `${label}: rendered attribute set changed`);
      for (const name of Object.keys(b.attributes)) assert.ok(arrayBytes(a.attributes[name].array).equals(arrayBytes(b.attributes[name].array)), `${label}: rendered ${name} changed`);
      assert.ok(arrayBytes(a.index.array).equals(arrayBytes(b.index.array)), `${label}: rendered index array changed`);
    }
    return { vertices: historical.vertices.length / 3, triangles: historical.indices.length / 3, vertexSha256: hash(arrayBytes(historical.vertices)), indexSha256: hash(arrayBytes(historical.indices)), comparisons: ['release16 versus current code with the original 205 buildings'], supplementalConnectionInactive: true };
  });
  await check('without supplemental 303 and later site corrections all historical height queries remain unchanged', () => {
    let samples = 0;
    function compare(x, z) {
      for (const method of ['heightAt', 'meshHeightAt']) {
        const expected = historical[method](x, z);
        assert.ok(Number.isFinite(expected), `non-finite historical ${method}`);
        assert.equal(currentWithout303[method](x, z), expected, `without303 ${method} changed at ${x},${z}`);
      }
      samples++;
    }
    const { bounds, width, height } = dem;
    for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
      const x = bounds.minX + (bounds.maxX - bounds.minX) * col / (width - 1), z = bounds.minZ + (bounds.maxZ - bounds.minZ) * row / (height - 1);
      compare(x, z);
      if (col + 1 < width && row + 1 < height) compare(x + (bounds.maxX - bounds.minX) / (width - 1) * .37, z + (bounds.maxZ - bounds.minZ) / (height - 1) * .61);
    }
    for (const region of historical.heightAt.detailRegions ?? []) for (const u of [.1, .5, .9]) for (const v of [.1, .5, .9]) compare(region.minX + u * (region.maxX - region.minX), region.minZ + v * (region.maxZ - region.minZ));
    const footprint = current.buildings.find(b => b.id === id).points;
    for (let i = 1; i < footprint.length; i++) {
      const a = footprint[i - 1], b = footprint[i], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
      for (const t of [0, .25, .5, .75, 1]) for (const distance of [-20, -1, 0, 1, 20]) compare(a[0] + dx * t - dz / length * distance, a[1] + dz * t + dx / length * distance);
    }
    return { samples, methods: ['heightAt', 'meshHeightAt'], maximumDifferenceMeters: 0, currentTerrainModuleSha256: hash(compiled.outputText) };
  });
  const entry = current.buildings.find(b => b.id === id), cut = entry.terrainCut;
  assert.ok(cut, 'the retained 303 manifest must retain its earlier explicit cut provenance');
  // 승인된 국소 수정 범위다. 301 패드와 도로 구역, 303 기존 절개 셀을 각각 제한한다.
  // 경계는 20 m DEM 격자에 맞춰 선언한다. 현행 메타데이터가 커져도 자동으로 허용하지 않는다.
  const permittedRegions = [
    { minX: 260, maxX: 420, minZ: Math.fround(-2022.7272727272727), maxZ: Math.fround(-1663.6363636363635) },
    { minX: 220, maxX: 260, minZ: Math.fround(-1863.1313131313132), maxZ: Math.fround(-1723.4848484848485) },
  ];
  const inBox = (x, z, q, padding = 0) => x >= q.minX - padding && x <= q.maxX + padding && z >= q.minZ - padding && z <= q.maxZ + padding;
  const permitted = (x, z, padding = 0) => permittedRegions.some(q => inBox(x, z, q, padding));
  const addedRegions = currentWith303.heightAt.detailRegions.filter(q => !historical.heightAt.detailRegions.some(old => isDeepStrictEqual(q, old)));
  const correctionRegions = currentWith303.heightAt.connectionCorrectionRegions;
  assert.ok(Array.isArray(correctionRegions) && correctionRegions.length > 0, 'connection correction regions not declared');
  const inRegions = (x, z, padding = 0) => correctionRegions.some(q => inBox(x, z, q, padding));
  await check('303 activates only the declared local correction and preserves every exterior terrain sample', () => {
    assert.equal(cut.level, 122.278); assert.equal(cut.apron, 1); assert.equal(cut.blend, 5);
    for (const corridor of cut.protectedCorridors) {
      const road = current.roads.find(road => road.id === corridor.id); assert.ok(road);
      same(corridor.points, road.points, 'retained protection line differs from original road'); assert.equal(corridor.width, road.width + 6);
    }
    const declaration = currentWith303.mesh.userData.connectionCorrection;
    assert.equal(declaration.id, 'engineering301-303'); assert.equal(declaration.rawDEMModified, false);
    assert.equal(declaration.removedPad, 'way/228476658'); same(declaration.regions, correctionRegions);
    assert.equal(declaration.roadProfile.south, -1944.08); assert.equal(declaration.roadProfile.north, -1740);
    for (const q of [...correctionRegions, ...addedRegions]) {
      assert.ok([q.minX, q.maxX, q.minZ, q.maxZ].every(Number.isFinite));
      assert.ok(permittedRegions.some(p => q.minX >= p.minX && q.maxX <= p.maxX && q.minZ >= p.minZ && q.maxZ <= p.maxZ), 'declared correction cell exceeds the independently approved boundary');
    }
    let outsideSamples = 0, localSamples = 0, changedSamples = 0, maximumOutsideChange = 0, maximumRaise = 0, maximumLowering = 0;
    const compare = (x, z) => {
      const old = historical.meshHeightAt(x, z), actual = currentWith303.meshHeightAt(x, z), delta = actual - old;
      assert.ok(Number.isFinite(actual));
      if (!permitted(x, z)) {
        for (const terrain of [currentWith303, currentWith303NoCut]) for (const method of ['heightAt', 'meshHeightAt']) maximumOutsideChange = Math.max(maximumOutsideChange, Math.abs(terrain[method](x, z) - historical[method](x, z)));
        outsideSamples++;
      } else { localSamples++; if (Math.abs(delta) > .0001) changedSamples++; maximumRaise = Math.max(maximumRaise, delta); maximumLowering = Math.max(maximumLowering, -delta); }
    };
    for (let r = 0; r < dem.height - 1; r++) for (let c = 0; c < dem.width - 1; c++) for (const [u, v] of [[0, 0], [.17, .29], [.73, .61]]) compare(dem.bounds.minX + (c + u) * (dem.bounds.maxX - dem.bounds.minX) / (dem.width - 1), dem.bounds.minZ + (r + v) * (dem.bounds.maxZ - dem.bounds.minZ) / (dem.height - 1));
    for (const q of correctionRegions) for (let x = q.minX + .29; x < q.maxX; x += .8) for (let z = q.minZ + .43; z < q.maxZ; z += .8) compare(x, z);
    const buildings = []; let exteriorBuildingSamples = 0, maximumExteriorBuildingChange = 0;
    for (const building of baseline.buildings) {
      const points = building.points, samples = [points.reduce((p, q) => [p[0] + q[0] / points.length, p[1] + q[1] / points.length], [0, 0]), ...points];
      for (let i = 1; i < points.length; i++) samples.push([(points[i - 1][0] + points[i][0]) / 2, (points[i - 1][1] + points[i][1]) / 2]);
      let change = 0, local = 0;
      for (const [x, z] of samples) { const delta = Math.abs(currentWith303.heightAt(x, z) - historical.heightAt(x, z)); change = Math.max(change, delta); if (permitted(x, z)) local++; else { exteriorBuildingSamples++; maximumExteriorBuildingChange = Math.max(maximumExteriorBuildingChange, delta); } }
      if (local || change > .0001) buildings.push({ id: building.id, ref: building.ref, localSamples: local, maximumHeightChange: change });
    }
    metrics.connection = { permittedRegions, declaredCells: correctionRegions.length, addedDetailCells: addedRegions.length, outsideSamples, localSamples, changedSamples, maximumOutsideChange, maximumRaise, maximumLowering, exteriorBuildingSamples, maximumExteriorBuildingChange, nearbyBuildings: buildings, legacyCutRetainedInManifest: true, old301DatumPreserved: false };
    assert.ok(outsideSamples > 80000 && localSamples > 1000); assert.ok(changedSamples > 500);
    assert.ok(maximumOutsideChange < .0001, 'local correction leaked outside the approved boundary');
    assert.ok(maximumExteriorBuildingChange < .0001, 'an exterior building datum or edge changed');
    return metrics.connection;
  });
  await check('road centre and ribbon edges outside the correction remain unchanged while local profiles are continuous', () => {
    const rows = []; let outsideSamples = 0, localSamples = 0, maximumExteriorChange = 0, maximumLocalHeightChange = 0, maximumLocalEpsilonJump = 0, maximumLocalStep = 0, worstLocalStep = null;
    for (const road of current.roads) {
      let local = 0, change = 0;
      for (let i = 1; i < road.points.length; i++) {
        const a = road.points[i - 1], b = road.points[i], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz); if (!length) continue;
        const n = Math.ceil(length / .5);
        for (const lateral of [-.5, 0, .5]) {
          let previous = null;
          for (let j = 0; j <= n; j++) {
            const x = a[0] + dx * j / n - dz / length * road.width * lateral, z = a[1] + dz * j / n + dx / length * road.width * lateral;
            const before = historical.meshHeightAt(x, z), after = currentWith303.meshHeightAt(x, z), difference = Math.abs(after - before); assert.ok(Number.isFinite(after));
            if (!permitted(x, z)) { outsideSamples++; maximumExteriorChange = Math.max(maximumExteriorChange, difference); previous = null; continue; }
            local++; localSamples++; change = Math.max(change, difference);
            const epsilon = 1e-5, left = currentWith303.meshHeightAt(x - dx / length * epsilon, z - dz / length * epsilon), right = currentWith303.meshHeightAt(x + dx / length * epsilon, z + dz / length * epsilon);
            maximumLocalEpsilonJump = Math.max(maximumLocalEpsilonJump, Math.abs(right - left));
            if (previous !== null && Math.abs(after - previous.height) > maximumLocalStep) { maximumLocalStep = Math.abs(after - previous.height); worstLocalStep = { id: road.id, kind: road.kind, drivable: road.drivable, lateral, x, z, after, previous }; } previous = { x, z, height: after };
          }
        }
      }
      if (local) rows.push({ id: road.id, drivable: road.drivable, samples: local, maximumHeightChange: change });
      maximumLocalHeightChange = Math.max(maximumLocalHeightChange, change);
    }
    metrics.roads = { outsideSamples, localSamples, maximumExteriorChange, maximumLocalHeightChange, maximumLocalEpsilonJump, maximumLocalHalfMeterStep: maximumLocalStep, worstLocalStep, roads: rows, localGradesIntentionallyChanged: true, walkabilityClaimed: false };
    assert.ok(outsideSamples > 1000 && localSamples > 500); assert.ok(maximumExteriorChange < .0001, 'exterior road datum changed');
    assert.ok(maximumLocalEpsilonJump < .001, 'local road height is discontinuous');
    return metrics.roads;
  });
  await check('cut mesh has conforming edges and its actual triangles agree with height queries and Rapier', async () => {
    await RAPIER.init();
    const { vertices, indices } = currentWith303, edges = new Map(), physicsSamples = [];
    let maximumTriangleError = 0, maximumOffsetError = 0, localTriangles = 0, minimumArea = Infinity, maximumAbsoluteGradientX = 0, maximumAbsoluteGradientZ = 0;
    for (let i = 0; i < indices.length; i += 3) {
      const ids = Array.from(indices.slice(i, i + 3)), p = ids.map(id => new THREE.Vector3().fromArray(vertices, id * 3));
      const area = Math.abs((p[1].x - p[0].x) * (p[2].z - p[0].z) - (p[2].x - p[0].x) * (p[1].z - p[0].z)) / 2; minimumArea = Math.min(minimumArea, area);
      for (let j = 0; j < 3; j++) { const a = ids[j], b = ids[(j + 1) % 3], key = a < b ? `${a},${b}` : `${b},${a}`; edges.set(key, (edges.get(key) ?? 0) + 1); }
      const q = p[0].clone().add(p[1]).add(p[2]).multiplyScalar(1 / 3);
      maximumTriangleError = Math.max(maximumTriangleError, Math.abs(currentWith303.meshHeightAt(q.x, q.z) - q.y));
      if (inRegions(q.x, q.z)) { const ab = p[1].clone().sub(p[0]), ac = p[2].clone().sub(p[0]), det = ab.x * ac.z - ac.x * ab.z; maximumAbsoluteGradientX = Math.max(maximumAbsoluteGradientX, Math.abs((ab.y * ac.z - ac.y * ab.z) / det)); maximumAbsoluteGradientZ = Math.max(maximumAbsoluteGradientZ, Math.abs((ab.x * ac.y - ac.x * ab.y) / det)); maximumOffsetError = Math.max(maximumOffsetError, Math.abs(currentWith303.heightAt(q.x, q.z) - q.y - .03)); if (localTriangles++ % 7 === 0) physicsSamples.push(q); }
    }
    let outerEdges = 0;
    for (const [key, count] of edges) {
      assert.ok(count === 1 || count === 2, 'non-manifold mesh edge'); if (count === 2) continue;
      const [a, b] = key.split(',').map(Number), x = vertices[a * 3], z = vertices[a * 3 + 2], xx = vertices[b * 3], zz = vertices[b * 3 + 2];
      assert.ok(x === xx && (x === dem.bounds.minX || x === dem.bounds.maxX) || z === zz && (z === dem.bounds.minZ || z === dem.bounds.maxZ), 'open interior edge or T-junction'); outerEdges++;
    }
    const world = new RAPIER.World({ x: 0, y: -18, z: 0 }); let maximumRapierError = 0;
    try {
      world.createCollider(RAPIER.ColliderDesc.trimesh(vertices, indices)); world.step();
      for (const q of physicsSamples) { const origin = { x: Math.fround(q.x), y: Math.fround(q.y + 30), z: Math.fround(q.z) }, expected = origin.y - currentWith303.meshHeightAt(origin.x, origin.z); const hit = world.castRay(new RAPIER.Ray(origin, { x: 0, y: -1, z: 0 }), 60, true); assert.ok(hit, 'missing physical terrain triangle'); maximumRapierError = Math.max(maximumRapierError, Math.abs(hit.timeOfImpact - expected)); }
    } finally { world.free(); }
    metrics.mesh = { vertices: vertices.length / 3, triangles: indices.length / 3, localTriangles, outerEdges, minimumArea, maximumAbsoluteGradientX, maximumAbsoluteGradientZ, maximumTriangleError, maximumOffsetError, physicsRays: physicsSamples.length, physicsRayOrigin: 'explicit Float32 XYZ compared at the identical mesh query coordinate', maximumRapierError };
    assert.ok(minimumArea > .1); assert.ok(maximumTriangleError < .0001); assert.ok(maximumOffsetError < .0001); assert.ok(maximumRapierError < .0005);
    return metrics.mesh;
  });
  await check('correction boundaries stay continuous and current road triangles follow the actual terrain', async () => {
    const source = (await bytes('src/fullCampus.ts')).toString('utf8'), start = source.indexOf('  function ribbon(points:'); assert.ok(start > 0);
    const roadSource = source.slice(start, source.indexOf('  for (const road of data.roads) {', start));
    const roadJS = ts.transpileModule(roadSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    const clipPush = 'destination.push(p[0], p[1] + .03 + offset, p[2]);'; assert.ok(roadJS.includes(clipPush), 'actual clipped-road emission branch changed');
    const instrumentedRoadJS = roadJS.replace(clipPush, '{clippedOffsets.add(destination.length);' + clipPush + '}');
    const makeRoad = new Function('heightAt', 'road', 'const pathPositions=[],roadPositions=[],clippedOffsets=new Set();' + instrumentedRoadJS + ';const out=road.drivable?roadPositions:pathPositions;ribbon(road.points,Math.max(1.3,road.width),out,road.drivable?.14:.12);return {vertices:Float32Array.from(out),unrounded:out,clippedOffsets};');
    let boundarySamples = 0, maximumBoundaryJump = 0, sampledPoints = 0, minimumClearance = Infinity, maximumConformingError = 0, maximumUnroundedConformingError = 0, maximumQuantizationBound = 0, maximumQuantizationExcess = 0, maximumRoundingX = 0, maximumRoundingY = 0, maximumRoundingZ = 0, worstConforming = null, conformingTriangles = 0, changedRoads = 0, exteriorTriangles = 0, fallbackSamples = 0, maximumFallbackWorsening = 0, worst = null;
    for (const q of correctionRegions) for (const t of [.17, .43, .81]) for (const [x, z, dx, dz] of [[q.minX, q.minZ + (q.maxZ - q.minZ) * t, 1, 0], [q.maxX, q.minZ + (q.maxZ - q.minZ) * t, 1, 0], [q.minX + (q.maxX - q.minX) * t, q.minZ, 0, 1], [q.minX + (q.maxX - q.minX) * t, q.maxZ, 0, 1]]) {
      maximumBoundaryJump = Math.max(maximumBoundaryJump, Math.abs(currentWith303.heightAt(x + dx * 1e-5, z + dz * 1e-5) - currentWith303.heightAt(x - dx * 1e-5, z - dz * 1e-5))); boundarySamples++;
    }
    const triangleBounds = (array, i) => ({ minX: Math.min(array[i], array[i + 3], array[i + 6]), maxX: Math.max(array[i], array[i + 3], array[i + 6]), minZ: Math.min(array[i + 2], array[i + 5], array[i + 8]), maxZ: Math.max(array[i + 2], array[i + 5], array[i + 8]) });
    // 도로는 지형 셀 밖 12 m까지 세분하고 이웃 기본 구간 두 개를 연결한다.
    const roadPresentationMargin = 24;
    const overlaps = (q, padding = 0) => permittedRegions.some(p => q.maxX >= p.minX - padding && q.minX <= p.maxX + padding && q.maxZ >= p.minZ - padding && q.minZ <= p.maxZ + padding);
    const exteriorKeys = array => { const keys = []; for (let i = 0; i < array.length; i += 9) if (!overlaps(triangleBounds(array, i), roadPresentationMargin)) keys.push(Array.from(array.slice(i, i + 9)).join(',')); return keys.sort(); };
    const oldRoadAt = (array, x, z) => {
      let minimum = Infinity;
      for (let i = 0; i < array.length; i += 9) {
        const ax = array[i], az = array[i + 2], bx = array[i + 3], bz = array[i + 5], cx = array[i + 6], cz = array[i + 8], den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz); if (Math.abs(den) < 1e-10) continue;
        const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / den, v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / den;
        if (u >= -1e-5 && v >= -1e-5 && u + v <= 1 + 1e-5) minimum = Math.min(minimum, u * array[i + 1] + v * array[i + 4] + (1 - u - v) * array[i + 7]);
      }
      return minimum;
    };
    for (const road of current.roads) {
      if (road.points.length < 2) continue;
      const afterResult = makeRoad(currentWith303.heightAt, road), after = afterResult.vertices, before = makeRoad(historical.heightAt, road).vertices;
      if (!arrayBytes(after).equals(arrayBytes(before))) changedRoads++;
      const exterior = exteriorKeys(after); same(exterior, exteriorKeys(before), road.id + ': road triangles changed outside correction and explicit 24 m presentation margin'); exteriorTriangles += exterior.length;
      for (let i = 0; i < after.length; i += 9) {
        const bounds = triangleBounds(after, i); if (!overlaps(bounds)) continue;
        const p = [0, 1, 2].map(k => new THREE.Vector3().fromArray(after, i + k * 3));
        const area = Math.abs((p[1].x - p[0].x) * (p[2].z - p[0].z) - (p[2].x - p[0].x) * (p[1].z - p[0].z)); if (area < 1e-8) continue;
        const conforming = afterResult.clippedOffsets.has(i);
        let quantizationBound = 0, gradient = null, rawPoints = null;
        if (conforming) {
          conformingTriangles++; rawPoints = [0, 1, 2].map(k => new THREE.Vector3().fromArray(afterResult.unrounded, i + k * 3));
          const ab = rawPoints[1].clone().sub(rawPoints[0]), ac = rawPoints[2].clone().sub(rawPoints[0]), det = ab.x * ac.z - ac.x * ab.z;
          const gx = (ab.y * ac.z - ac.y * ab.z) / det, gz = (ab.x * ac.y - ac.x * ab.y) / det;
          gradient = { x: gx, z: gz };
          for (let k = 0; k < 3; k++) { const rx = Math.abs(p[k].x - rawPoints[k].x), ry = Math.abs(p[k].y - rawPoints[k].y), rz = Math.abs(p[k].z - rawPoints[k].z); maximumRoundingX = Math.max(maximumRoundingX, rx); maximumRoundingY = Math.max(maximumRoundingY, ry); maximumRoundingZ = Math.max(maximumRoundingZ, rz); quantizationBound = Math.max(quantizationBound, ry + Math.abs(gx) * rx + Math.abs(gz) * rz); }
          maximumQuantizationBound = Math.max(maximumQuantizationBound, quantizationBound);
        }
        for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1 / 3, 1 / 3], [.2, .6], [.6, .2]]) {
          const q = p[0].clone().multiplyScalar(1 - u - v).addScaledVector(p[1], u).addScaledVector(p[2], v), ground = currentWith303.meshHeightAt(q.x, q.z), clearance = q.y - ground;
          assert.ok(Number.isFinite(clearance)); sampledPoints++;
          if (clearance < minimumClearance) { minimumClearance = clearance; worst = { road: road.id, x: q.x, z: q.z, clearance, conforming }; }
          if (conforming) {
            const offset = road.drivable ? .17 : .15, error = Math.abs(clearance - offset), raw = rawPoints[0].clone().multiplyScalar(1 - u - v).addScaledVector(rawPoints[1], u).addScaledVector(rawPoints[2], v);
            maximumUnroundedConformingError = Math.max(maximumUnroundedConformingError, Math.abs(raw.y - currentWith303.meshHeightAt(raw.x, raw.z) - offset));
            maximumQuantizationExcess = Math.max(maximumQuantizationExcess, error - quantizationBound);
            if (error > maximumConformingError) { maximumConformingError = error; worstConforming = { road: road.id, x: q.x, z: q.z, clearance, error, quantizationBound, gradient }; }
          }
          else {
            const previousY = oldRoadAt(before, q.x, q.z);
            if (Number.isFinite(previousY)) { fallbackSamples++; const oldClearance = previousY - historical.meshHeightAt(q.x, q.z); maximumFallbackWorsening = Math.max(maximumFallbackWorsening, Math.min(0, oldClearance) - clearance); }
          }
        }
      }
    }
    // 반올림된 경계 정점은 이웃 지형 면으로 이동할 수 있으므로 전체 국소 면의 최대 기울기도 적용한다.
    const regionalQuantizationBound = maximumRoundingY + metrics.mesh.maximumAbsoluteGradientX * maximumRoundingX + metrics.mesh.maximumAbsoluteGradientZ * maximumRoundingZ;
    metrics.roadMesh = { maximumRoundingX, maximumRoundingY, maximumRoundingZ, regionalQuantizationBound, boundarySamples, maximumBoundaryJump, sampledPoints, minimumClearance, maximumConformingError, maximumUnroundedConformingError, maximumQuantizationBound, maximumQuantizationExcess, worstConforming, conformingTriangles, changedRoads, exteriorTriangles, roadPresentationMargin, fallbackSamples, maximumFallbackWorsening, worst };
    assert.ok(maximumBoundaryJump < .001, 'height API jumps at a declared detail boundary'); assert.ok(sampledPoints > 1000 && conformingTriangles > 100);
    assert.ok(exteriorTriangles > 1000);
    assert.ok(maximumUnroundedConformingError < .0001, 'unrounded clipped road differs from actual terrain');
    assert.ok(maximumConformingError < regionalQuantizationBound + .0001, 'rendered road error exceeds the Float32 rounding bound across adjacent terrain planes');
    assert.ok(maximumConformingError < .001, 'rendered road mismatch exceeds the independent 1 mm display tolerance');
    assert.ok(minimumClearance > 0, 'a road surface is buried in the corrected region');
    assert.ok(maximumFallbackWorsening < .0005, 'road transition creates or worsens terrain burial');
    return metrics.roadMesh;
  });
  const release31 = {
    commit: '5b37353e2386f1943ff3377b2556c7bab405d1e4',
    terrainGitLF: 'c8606562908ebfaf2e4cc9c5fc38b453bbb621b2c38486cf932349f1e8f956fb',
    siteGitLF: 'b0c63ab74926e30bd808c042fd969d038346280e165e12ab837bd8ca761f0fc4',
    campus: '385cd702a8c2faf152ed726d349d7b5ebb06d979838b7b3ddbe947d768b6193c',
  };
  const git31 = (file, expected) => {
    const value = execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, 'show', `${release31.commit}:${file}`], { cwd: root, maxBuffer: 16 * 1024 * 1024 });
    assert.equal(hash(value), expected, `release31 Git snapshot differs: ${file}`); return value.toString('utf8');
  };
  const old31Source = git31('src/terrain.ts', release31.terrainGitLF), old31Site = git31('src/engineering301303Site.ts', release31.siteGitLF);
  assertCampusSourcePreserved('public/data/campus.json', await bytes('public/data/campus.json'), Buffer.from(git31('public/data/campus.json', release31.campus)));
  const compile31 = text => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  await writeFile(path.join(out, 'release31-terrain.mjs'), compile31(old31Source).replace(/(['"])\.\/engineering301303Site\1/g, "'./release31-engineering301303Site.mjs'"));
  await writeFile(path.join(out, 'release31-engineering301303Site.mjs'), compile31(old31Site));
  const { createTerrain: create31 } = await import(pathToFileURL(path.join(out, 'release31-terrain.mjs')).href);
  const terrain31 = create31(new THREE.Scene(), dem, current.buildings), courtyardTerrain = createTerrain(new THREE.Scene(), dem, current.buildings, { ...historicalOptions, livingScienceCourtyard: true });
  const no222 = current.buildings.filter(b => b.id !== 'way/386890828'), without222Old = create31(new THREE.Scene(), dem, no222), without222New = createTerrain(new THREE.Scene(), dem, no222, { ...historicalOptions, livingScienceCourtyard: true });
  models.push(terrain31, courtyardTerrain, without222Old, without222New);
  await check('the courtyard switch and absent 222 preserve the independently hashed release31 terrain', () => {
    const pairs = [['explicit courtyard false', currentWith303, terrain31], ['222 absent', without222New, without222Old]];
    for (const [label, actual, expected] of pairs) {
      assert.ok(arrayBytes(actual.vertices).equals(arrayBytes(expected.vertices)), `${label}: vertex bytes differ`);
      assert.ok(arrayBytes(actual.indices).equals(arrayBytes(expected.indices)), `${label}: index bytes differ`);
      for (const name of Object.keys(expected.mesh.geometry.attributes)) assert.ok(arrayBytes(actual.mesh.geometry.attributes[name].array).equals(arrayBytes(expected.mesh.geometry.attributes[name].array)), `${label}: rendered ${name} differs`);
      assert.equal(actual.heightAt.livingScienceCourtyardCorrectionRegions, undefined, `${label}: correction unexpectedly active`);
    }
    let samples = 0;
    for (let r = 0; r < dem.height - 1; r++) for (let c = 0; c < dem.width - 1; c++) {
      const x = dem.bounds.minX + (c + .37) * (dem.bounds.maxX - dem.bounds.minX) / (dem.width - 1), z = dem.bounds.minZ + (r + .61) * (dem.bounds.maxZ - dem.bounds.minZ) / (dem.height - 1);
      for (const [label, actual, expected] of pairs) for (const method of ['heightAt', 'meshHeightAt']) assert.equal(actual[method](x, z), expected[method](x, z), `${label}: ${method} differs at ${x},${z}`);
      samples++;
    }
    metrics.courtyardBaseline = { ...release31, pairs: pairs.map(p => p[0]), samples, sharedCacheWritten: false };
    return metrics.courtyardBaseline;
  });
  // 안마당과 한 격자 테두리에 한정한 독립 경계다. 생산 메타가 커져도 허용 범위를 따라 넓히지 않는다.
  const courtAllowed = { minX: 400, maxX: 520, minZ: Math.fround(-267.1717171717173), maxZ: Math.fround(-167.4242424242425) };
  const courtRegions = courtyardTerrain.heightAt.livingScienceCourtyardCorrectionRegions;
  await check('the new courtyard changes only its bounded cells and protects existing entries buildings and roads', () => {
    const declaration = courtyardTerrain.mesh.userData.livingScienceCourtyardCorrection;
    assert.equal(declaration?.id, 'living-science-222-courtyard'); assert.equal(declaration.rawDEMModified, false); assert.equal(declaration.rawFootprintModified, false);
    assert.ok(Array.isArray(courtRegions) && courtRegions.length > 0); same(declaration.regions, courtRegions);
    for (const q of courtRegions) assert.ok(q.minX >= courtAllowed.minX && q.maxX <= courtAllowed.maxX && q.minZ >= courtAllowed.minZ && q.maxZ <= courtAllowed.maxZ, 'courtyard refinement exceeds the independent allowed cells');
    const exteriorTriangles = terrain => {
      const keys = []; for (let i = 0; i < terrain.indices.length; i += 3) {
        const p = Array.from(terrain.indices.slice(i, i + 3), j => Array.from(terrain.vertices.slice(j * 3, j * 3 + 3)));
        const box = { minX: Math.min(...p.map(p => p[0])), maxX: Math.max(...p.map(p => p[0])), minZ: Math.min(...p.map(p => p[2])), maxZ: Math.max(...p.map(p => p[2])) };
        if (box.maxX >= courtAllowed.minX && box.minX <= courtAllowed.maxX && box.maxZ >= courtAllowed.minZ && box.minZ <= courtAllowed.maxZ) continue;
        keys.push(hash(arrayBytes(Float32Array.from(p.flat()))));
      } return keys.sort();
    };
    const triangles = exteriorTriangles(courtyardTerrain); same(triangles, exteriorTriangles(terrain31), 'exterior terrain triangle vertex bytes changed');
    let outsideSamples = 0, changedSamples = 0, maximumLowering = 0, maximumRaise = 0;
    for (let r = 0; r < dem.height - 1; r++) for (let c = 0; c < dem.width - 1; c++) for (const [u, v] of [[0, 0], [.17, .29], [.73, .61]]) {
      const x = dem.bounds.minX + (c + u) * (dem.bounds.maxX - dem.bounds.minX) / (dem.width - 1), z = dem.bounds.minZ + (r + v) * (dem.bounds.maxZ - dem.bounds.minZ) / (dem.height - 1);
      if (!inBox(x, z, courtAllowed)) { for (const method of ['heightAt', 'meshHeightAt']) assert.equal(courtyardTerrain[method](x, z), terrain31[method](x, z), `courtyard changed exterior ${method} at ${x},${z}`); outsideSamples++; }
    }
    for (let x = courtAllowed.minX + .37; x < courtAllowed.maxX; x += 1) for (let z = courtAllowed.minZ + .61; z < courtAllowed.maxZ; z += 1) {
      const delta = courtyardTerrain.meshHeightAt(x, z) - terrain31.meshHeightAt(x, z); maximumRaise = Math.max(maximumRaise, delta); maximumLowering = Math.max(maximumLowering, -delta); if (Math.abs(delta) > .001) changedSamples++;
    }
    assert.ok(maximumLowering > 1 && changedSamples > 100, 'default courtyard correction did not lower the intended ground'); assert.ok(maximumRaise < .0002, 'lowering-only correction raises terrain');
    const protectedPoints = [{ id: '220 southwest p7', x: 464.33, z: -272.09 }, { id: '220 southwest approach', x: 460.54, z: -269.78 }, { id: '221 shared upper datum', x: 559.5275, z: -168.73875 }];
    for (const id of ['way/297046999', 'way/297047243', 'way/386890828']) { const ring = current.buildings.find(b => b.id === id).points.slice(0, -1); protectedPoints.push({ id: id + ' model datum', x: ring.reduce((s, p) => s + p[0], 0) / ring.length, z: ring.reduce((s, p) => s + p[1], 0) / ring.length }); }
    let maximumProtectedDifference = 0, protectedRoadSamples = 0, worstProtected = null;
    const compareProtected = (x, z, label) => { for (const method of ['heightAt', 'meshHeightAt']) { const before = terrain31[method](x, z), after = courtyardTerrain[method](x, z), delta = Math.abs(after - before); if (delta > maximumProtectedDifference) { maximumProtectedDifference = delta; worstProtected = { x, z, label, method, before, after, delta }; } } };
    for (const p of protectedPoints) compareProtected(p.x, p.z, p.id);
    for (const road of current.roads.filter(r => r.drivable || r.id === 'way/1185265108/524')) for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1], b = road.points[i], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz), n = Math.ceil(length / .5); if (!length) continue;
      const half = road.id === 'way/1185265108/524' ? 2.1 : road.width / 2;
      for (const offset of [-half, 0, half]) for (let j = 0; j <= n; j++) { const x = a[0] + dx * j / n - dz / length * offset, z = a[1] + dz * j / n + dx / length * offset; compareProtected(x, z, road.id); protectedRoadSamples++; }
    }
    metrics.courtyardBoundary = { allowedCells: courtAllowed, declaredCells: courtRegions.length, exteriorTriangles: triangles.length, outsideSamples, changedSamples, maximumLowering, maximumRaise, protectedPoints, protectedRoadSamples, maximumProtectedDifference, worstProtected };
    assert.ok(maximumProtectedDifference < .0001, `protected terrain changed: ${JSON.stringify(worstProtected)}`);
    return metrics.courtyardBoundary;
  });
  await check('courtyard terrain triangles are closed and agree with public height queries and actual Rapier rays', async () => {
    await RAPIER.init(); const { vertices, indices } = courtyardTerrain, edges = new Map(), rays = []; let localTriangles = 0, maximumTriangleError = 0, maximumOffsetError = 0;
    for (let i = 0; i < indices.length; i += 3) {
      const ids = Array.from(indices.slice(i, i + 3)), p = ids.map(j => new THREE.Vector3().fromArray(vertices, j * 3));
      for (let j = 0; j < 3; j++) { const a = ids[j], b = ids[(j + 1) % 3], key = a < b ? `${a},${b}` : `${b},${a}`; edges.set(key, (edges.get(key) ?? 0) + 1); }
      const q = p[0].clone().add(p[1]).add(p[2]).multiplyScalar(1 / 3); if (!inBox(q.x, q.z, courtAllowed)) continue;
      maximumTriangleError = Math.max(maximumTriangleError, Math.abs(courtyardTerrain.meshHeightAt(q.x, q.z) - q.y)); maximumOffsetError = Math.max(maximumOffsetError, Math.abs(courtyardTerrain.heightAt(q.x, q.z) - q.y - .03)); if (localTriangles++ % 13 === 0) rays.push(q);
    }
    for (const [key, count] of edges) { assert.ok(count === 1 || count === 2, 'new courtyard terrain has a non-manifold edge'); if (count === 2) continue; const [a, b] = key.split(',').map(Number), x = vertices[a * 3], z = vertices[a * 3 + 2], xx = vertices[b * 3], zz = vertices[b * 3 + 2]; assert.ok(x === xx && (x === dem.bounds.minX || x === dem.bounds.maxX) || z === zz && (z === dem.bounds.minZ || z === dem.bounds.maxZ), 'new courtyard has an open interior edge'); }
    const world = new RAPIER.World({ x: 0, y: -18, z: 0 }); let maximumRapierError = 0;
    try { world.createCollider(RAPIER.ColliderDesc.trimesh(vertices, indices)); world.step(); for (const q of rays) { const p = { x: Math.fround(q.x), y: Math.fround(q.y + 10), z: Math.fround(q.z) }, hit = world.castRay(new RAPIER.Ray(p, { x: 0, y: -1, z: 0 }), 20, true); assert.ok(hit, 'court terrain ray missed'); maximumRapierError = Math.max(maximumRapierError, Math.abs(p.y - hit.timeOfImpact - courtyardTerrain.meshHeightAt(p.x, p.z))); } } finally { world.free(); }
    assert.ok(localTriangles > 1000 && rays.length > 100); assert.ok(maximumTriangleError < .0001 && maximumOffsetError < .0001 && maximumRapierError < .0005);
    metrics.courtyardMesh = { localTriangles, physicsRays: rays.length, maximumTriangleError, maximumOffsetError, maximumRapierError }; return metrics.courtyardMesh;
  });
  await check('terrain construction and the independent audit leave every production input and shared cache untouched', async () => {
    same(dem, demBefore, 'terrain constructor mutated raw DEM values'); same(current, beforeCurrent, 'terrain constructor mutated current campus'); same(baseline, beforeBaseline, 'terrain constructor mutated baseline campus');
    for (const file of inputs) assert.equal(hash(await bytes(file)), sourceHashes[file], `${file} changed during the audit`);
    return { unchangedInputFiles: inputs.length, compiledOutputDirectory: 'artifacts/campus-provenance-test', sharedCampusTestCacheWritten: false };
  });
} finally {
  for (const terrain of models) { terrain.mesh.geometry.dispose(); terrain.mesh.material.dispose(); }
  await writeFile(path.join(out, 'results.json'), JSON.stringify({
    verifiedAt: new Date().toISOString(), scope: 'Actual 303 manifest and processed campus provenance. With the new courtyard correction explicitly disabled, the release16 and earlier 301/303 contracts remain unchanged. The default 222 courtyard correction is compared with an independently hashed release31 Git module, including absent-222 behavior, exterior triangle bytes and height queries, building and entrance datums, protected roads, triangle topology and Rapier rays. Raw OSM and DEM remain unchanged. No walking-route, GPU, browser or phone validation; continuity is not a walkability claim.',
    baselineRelease: release16, sourceHashes, metrics, results,
  }, null, 2) + '\n');
}
console.log(`${results.length}/${results.length} campus provenance checks passed.`);
