import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeCampusSupplements, readCampusSupplements, SUPPLEMENT_COORDINATE_SYSTEM } from './merge-campus-supplements.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts/campus-supplements-test');
await mkdir(out, { recursive: true });
const hash = value => createHash('sha256').update(value).digest('hex');
const clone = value => structuredClone(value);
const same = (a, b, message) => assert.ok(isDeepStrictEqual(a, b), message);
const rect = (x, z, w = 10, d = 10) => [[x, z], [x + w, z], [x + w, z + d], [x, z + d], [x, z]];
const original = { id: 'way/1', name: 'OSM fixture', ref: '1', kind: 'university', points: rect(0, 0), holes: [], height: 14, levels: 4, heightEstimated: true, levelsEstimated: true };
const base = {
  origin: { lat: 37.4663683, lon: 126.948395075 },
  source: { provider: 'OpenStreetMap', note: 'Original fixture attribution', attribution: '© OpenStreetMap contributors', license: 'ODbL 1.0' },
  bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, boundary: [rect(-100, -100, 200, 200)],
  buildings: [original], roads: [{ id: 'way/2/0', points: [[-100, -30], [100, -30]], width: 4 }], areas: [], stops: [],
};
const building = (overrides = {}) => ({
  id: 'supplemental/fixture-303', name: '303 supplement fixture', ref: '303', kind: 'university',
  points: rect(20, 20), holes: [], height: 24.5, levels: 7, heightEstimated: true, levelsEstimated: false,
  footprintEstimated: true, terrainPad: false, sources: [{ url: 'https://example.test/public-building-reference', title: 'Synthetic regression fixture' }],
  ...overrides,
});
const supplement = (buildings = [building()]) => ({ schemaVersion: 1, coordinateSystem: SUPPLEMENT_COORDINATE_SYSTEM, origin: clone(base.origin), buildings });
const results = [];
const sources = ['scripts/merge-campus-supplements.mjs', 'scripts/fetch-campus.mjs', 'scripts/verify-campus-supplements.mjs', 'sources/campus.osm', 'public/data/campus.json'];
const sourceHashes = Object.fromEntries(await Promise.all(sources.map(async file => [file, hash(await readFile(path.join(root, file)))])));

async function check(name, run) {
  try {
    const details = await run(); results.push({ name, status: 'passed', ...details });
    console.log(`PASS ${name}${details ? ` ${JSON.stringify(details)}` : ''}`);
  } catch (error) {
    results.push({ name, status: 'failed', error: error.message }); throw error;
  }
}
try {
  await check('absent and empty supplements preserve the complete base dataset', () => {
    for (const value of [undefined, null, supplement([])]) same(mergeCampusSupplements(base, value), base, 'absence changed original data');
    return { originalBuildings: base.buildings.length };
  });
  await check('only missing files are ignored; malformed JSON and other read errors propagate', async () => {
    const missing = path.join(out, 'missing-optional-file.json'); await rm(missing, { force: true });
    assert.equal(await readCampusSupplements(missing), null);
    const bad = path.join(out, 'malformed.json'); await writeFile(bad, '{ invalid JSON');
    await assert.rejects(readCampusSupplements(bad), SyntaxError);
    await assert.rejects(readCampusSupplements(out), error => error.code !== 'ENOENT');
    const valid = path.join(out, 'valid-fixture.json'); await writeFile(valid, JSON.stringify(supplement()));
    same(await readCampusSupplements(valid), supplement(), 'valid file was transformed');
  });
  await check('accepted additions preserve every original feature and distinguish non-OSM provenance', () => {
    const before = clone(base), incoming = supplement(), incomingBefore = clone(incoming), merged = mergeCampusSupplements(base, incoming);
    same(base, before, 'base was mutated'); same(incoming, incomingBefore, 'manifest was mutated');
    same(merged.buildings[0], original, 'original building changed');
    for (const key of ['roads', 'areas', 'stops', 'boundary', 'bounds', 'origin']) same(merged[key], base[key], `${key} changed`);
    assert.equal(merged.source.provider, 'OpenStreetMap'); assert.equal(merged.source.osmNote, base.source.note);
    assert.notEqual(merged.source.note, base.source.note); assert.equal(merged.source.supplemental.count, 1);
    same(merged.buildings[1], incoming.buildings[0], 'addition lost fields');
    same(merged.source.supplemental.sources, incoming.buildings[0].sources, 'source evidence missing');
    assert.equal(merged.buildings[1].terrainPad, false); assert.equal(merged.buildings[1].footprintEstimated, true);
    merged.buildings[1].points[0][0] = 99; assert.equal(incoming.buildings[0].points[0][0], 20, 'output aliases supplemental coordinates');
  });
  await check('schema, origin and coordinate-axis mistakes are rejected before adding buildings', () => {
    const bad = [ { ...supplement(), schemaVersion: 2 }, { ...supplement(), coordinateSystem: 'west-south' }, { ...supplement(), origin: { ...base.origin, lat: base.origin.lat + 1e-8 } }, { ...supplement(), origin: { lat: '37.4663683', lon: base.origin.lon } }, { ...supplement(), buildings: {} } ];
    for (const candidate of bad) assert.throws(() => mergeCampusSupplements(base, candidate), /Campus supplement:/);
    return { rejected: bad.length };
  });
  await check('namespaces, duplicate IDs and attempts to overwrite existing identities are rejected', () => {
    for (const id of ['way/1', 'relation/42', '303', 'supplemental/', 'supplemental/a/../b']) assert.throws(() => mergeCampusSupplements(base, supplement([building({ id })])), /namespace/);
    assert.throws(() => mergeCampusSupplements(base, supplement([building(), building()])), /duplicate supplemental ID/);
    const foreign = { ...base, buildings: [building()] };
    assert.throws(() => mergeCampusSupplements(foreign, supplement()), /cannot overwrite/);
    const before = clone(base); assert.throws(() => mergeCampusSupplements(base, supplement([building(), building({ id: 'way/1' })])));
    same(base, before, 'validation failure changed original data');
    const multipolygon = { ...base, buildings: [{ ...original, id: 'relation/1', ref: '' }, { ...original, id: 'relation/1', ref: '', points: rect(-30, -30) }] };
    const withAddition = mergeCampusSupplements(multipolygon, supplement());
    same(withAddition.buildings.slice(0, 2), multipolygon.buildings, 'OSM relation outer rings were deduplicated');
  });
  await check('unproven geometry and invalid level, height or source metadata cannot be accepted', () => {
    const bad = [{ footprintEstimated: false }, { footprintEstimated: undefined }, { terrainPad: undefined }, { height: NaN }, { height: -1 }, { levels: 1.5 }, { heightEstimated: undefined }, { levelsEstimated: undefined }, { sources: [] }, { sources: ['https://example.test/photo'] }, { sources: [{ url: 'file:///private/photo.jpg' }] }, { sources: [{ url: 'https://user:password@example.test/photo' }] }];
    for (const value of bad) assert.throws(() => mergeCampusSupplements(base, supplement([building(value)])), /Campus supplement:/);
    return { rejected: bad.length };
  });
  await check('explicit local cuts preserve fixed anchors and protection metadata across reapplication', () => {
    const terrainCut = { level: 122.278, apron: 1, blend: 5, protectedCorridors: [{ points: [[0, 0], [10, 10]], width: 11.5 }] };
    const input = supplement([building({ terrainCut })]), before = clone(input), merged = mergeCampusSupplements(base, input);
    same(merged.buildings[1].terrainCut, terrainCut, 'cut contract was transformed');
    same(mergeCampusSupplements(JSON.parse(JSON.stringify(merged)), input), merged, 'cut reapplication changed data');
    same(input, before, 'cut validation mutated the manifest');
    const changed = clone(input); changed.buildings[0].terrainCut.level += 1;
    assert.throws(() => mergeCampusSupplements(merged, changed), /cannot overwrite/);
    const invalid = [null, {}, { ...terrainCut, level: NaN }, { ...terrainCut, apron: Infinity }, { ...terrainCut, apron: -1 }, { ...terrainCut, blend: 0 }, { ...terrainCut, blend: '5' }, { ...terrainCut, protectedCorridors: undefined }, ...[
      { width: 0, points: [[0, 0], [1, 1]] }, { width: Infinity, points: [[0, 0], [1, 1]] }, { width: 2, points: [[0, 0]] }, { width: 2, points: [[0, 0], [0, 0]] }, { width: 2, points: [[0, 0], [NaN, 1]] },
    ].map(corridor => ({ ...terrainCut, protectedCorridors: [corridor] }))];
    for (const terrainCut of invalid) assert.throws(() => mergeCampusSupplements(base, supplement([building({ terrainCut })])), /terrainCut/);
    assert.throws(() => mergeCampusSupplements(base, supplement([building({ terrainCut, terrainPad: true })])), /terrainPad:false/);
    assert.equal(mergeCampusSupplements(base, supplement([building({ terrainCut: { level: -2, apron: 0, blend: 1, protectedCorridors: [] } })])).buildings.length, 2);
    return { rejected: invalid.length + 1, fixedAnchorPreserved: true, idempotent: true };
  });
  await check('non-finite, open, self-crossing and misplaced hole rings are rejected', () => {
    const bad = [
      { points: [[20, 20], [30, Infinity], [30, 30], [20, 20]] }, { points: [[20, 20], [30, 20], [30, 30], [20, 30]] },
      { points: [[20, 20], [30, 30], [20, 30], [30, 20], [20, 20]] }, { points: rect(95, 95) },
      { holes: [rect(50, 50, 2, 2)] }, { holes: [rect(22, 22, 5, 5), rect(24, 24, 4, 4)] },
    ];
    for (const value of bad) assert.throws(() => mergeCampusSupplements(base, supplement([building(value)])), /Campus supplement:/);
    return { rejected: bad.length };
  });
  await check('an OSM building with the same ref blocks a second distant copy', () => {
    const campus = { ...base, buildings: [{ ...original, ref: '303' }] };
    assert.throws(() => mergeCampusSupplements(campus, supplement()), /duplicate building ref 303/);
  });
  await check('actual crossings and containment are blocked even when no crossing vertex is inside', () => {
    const campus = { ...base, buildings: [{ ...original, points: rect(-20, -2, 40, 4) }] };
    assert.throws(() => mergeCampusSupplements(campus, supplement([building({ points: rect(-2, -20, 4, 40) })])), /overlaps .*16\.000 m2/);
    assert.throws(() => mergeCampusSupplements(base, supplement([building({ points: rect(2, 2, 4, 4) })])), /overlaps/);
    assert.throws(() => mergeCampusSupplements(base, supplement([building({ points: rect(-2, -2, 14, 14) })])), /overlaps/);
    assert.throws(() => mergeCampusSupplements(base, supplement([building(), building({ id: 'supplemental/fixture-304', ref: '304', points: rect(22, 22) })])), /overlaps/);
  });
  await check('empty concave corners, courtyard holes and shared boundaries do not cause AABB false positives', () => {
    const lShape = { ...original, points: [[0, 0], [20, 0], [20, 5], [5, 5], [5, 20], [0, 20], [0, 0]] };
    assert.equal(mergeCampusSupplements({ ...base, buildings: [lShape] }, supplement([building({ points: rect(9, 9, 5, 5) })])).buildings.length, 2);
    const courtyard = { ...original, points: rect(0, 0, 30, 30), holes: [rect(5, 5, 20, 20)] };
    assert.equal(mergeCampusSupplements({ ...base, buildings: [courtyard] }, supplement([building({ points: rect(10, 10, 5, 5) })])).buildings.length, 2);
    assert.equal(mergeCampusSupplements(base, supplement([building({ points: rect(10, 0) })])).buildings.length, 2);
    const surrounding = building({ points: rect(-5, -5, 20, 20), holes: [rect(-1, -1, 12, 12)] });
    assert.equal(mergeCampusSupplements(base, supplement([surrounding])).buildings.length, 2);
  });
  await check('reapplication is idempotent after JSON round-trip and changed content cannot overwrite it', () => {
    const input = supplement(), first = mergeCampusSupplements(base, input), roundTrip = JSON.parse(JSON.stringify(first));
    same(mergeCampusSupplements(roundTrip, input), first, 'same manifest changed output after serialization');
    const reordered = { ...input, buildings: [Object.fromEntries(Object.entries(input.buildings[0]).reverse())] };
    same(mergeCampusSupplements(roundTrip, reordered), first, 'object key order broke idempotence');
    assert.throws(() => mergeCampusSupplements(roundTrip, supplement([building({ height: 25 })])), /cannot overwrite/);
    same(roundTrip, first, 'failed replacement changed original merged dataset');
    const refreshed = { ...roundTrip, buildings: [...roundTrip.buildings, { ...original, id: 'way/new-osm-303', ref: '303', points: rect(-30, -30) }] };
    assert.throws(() => mergeCampusSupplements(refreshed, input), /duplicate building ref 303/);
  });

  const fixture = path.join(out, 'generation-fixture'), sourceDir = path.join(fixture, 'sources'), scriptDir = path.join(fixture, 'scripts');
  await mkdir(sourceDir, { recursive: true }); await mkdir(scriptDir, { recursive: true });
  for (const name of ['fetch-campus.mjs', 'merge-campus-supplements.mjs']) await copyFile(path.join(root, 'scripts', name), path.join(scriptDir, name));
  await copyFile(path.join(root, 'sources/campus.osm'), path.join(sourceDir, 'campus.osm'));
  const optionalPath = path.join(sourceDir, 'campus-supplemental-buildings.json'), generatedPath = path.join(fixture, 'public/data/campus.json');
  await rm(optionalPath, { force: true });
  const generate = () => spawnSync(process.execPath, [path.join(scriptDir, 'fetch-campus.mjs')], { encoding: 'utf8', timeout: 30000 });
  let baseline;
  await check('real OSM generation without a manifest preserves current original geometry and routes', async () => {
    const run = generate(); assert.equal(run.status, 0, run.stderr);
    baseline = JSON.parse(await readFile(generatedPath, 'utf8'));
    const current = JSON.parse(await readFile(path.join(root, 'public/data/campus.json'), 'utf8'));
    const originalBuildings = current.buildings.filter(b => !b.id.startsWith('supplemental/'));
    same(baseline.buildings, originalBuildings, 'fresh OSM conversion changed an original building');
    for (const key of ['roads', 'areas', 'stops', 'boundary', 'bounds', 'origin']) same(baseline[key], current[key], `fresh conversion changed ${key}`);
    assert.equal(baseline.source.provider, 'OpenStreetMap'); assert.equal(baseline.source.supplemental, undefined);
    return { osmBuildings: baseline.buildings.length, roads: baseline.roads.length };
  });
  await check('the real generator retains a sourced addition on successive rebuilds without changing OSM data', async () => {
    // 이 작은 사각형은 합치기 회귀용이며 303의 실제 외곽으로 쓰지 않는다.
    const input = supplement([building({ id: 'supplemental/regression-only', ref: 'REGRESSION-ONLY', name: 'Synthetic data-pipeline fixture', points: rect(250, -1820, 20, 20) })]);
    await writeFile(optionalPath, JSON.stringify(input));
    const snapshots = [];
    for (let i = 0; i < 2; i++) {
      const run = generate(); assert.equal(run.status, 0, run.stderr);
      const data = JSON.parse(await readFile(generatedPath, 'utf8'));
      same(data.buildings.slice(0, baseline.buildings.length), baseline.buildings, 'rebuild modified OSM building data');
      for (const key of ['roads', 'areas', 'stops', 'boundary', 'bounds', 'origin']) same(data[key], baseline[key], `rebuild modified ${key}`);
      assert.equal(data.buildings.length, baseline.buildings.length + 1);
      assert.equal(data.buildings.filter(b => b.id === input.buildings[0].id).length, 1);
      delete data.source.fetchedAt; snapshots.push(data);
    }
    same(snapshots[0], snapshots[1], 'rebuild changed geometry or provenance');
    assert.equal(hash(await readFile(path.join(sourceDir, 'campus.osm'))), sourceHashes['sources/campus.osm']);
    return { generatedBuildings: snapshots[0].buildings.length, runs: 2, output: 'artifacts/campus-supplements-test/generation-fixture/public/data/campus.json', syntheticFootprint: true };
  });
  await check('an invalid manifest stops the generator before replacing the previous output', async () => {
    const before = hash(await readFile(generatedPath));
    await writeFile(optionalPath, JSON.stringify(supplement([building({ id: 'way/228476658' })])));
    const run = generate(); assert.notEqual(run.status, 0); assert.match(run.stderr, /namespace/);
    assert.equal(hash(await readFile(generatedPath)), before);
    // 다음 실행과 수동 검토를 위해 오류 입력도 보존하고 유효 fixture로 되돌린다.
    await copyFile(optionalPath, path.join(out, 'rejected-overwrite-manifest.json'));
    await writeFile(optionalPath, JSON.stringify(supplement([building({ id: 'supplemental/regression-only', ref: 'REGRESSION-ONLY', name: 'Synthetic data-pipeline fixture', points: rect(250, -1820, 20, 20) })])));
  });
  await check('production data and raw OSM remain byte-for-byte unchanged by the test', async () => {
    for (const file of ['sources/campus.osm', 'public/data/campus.json']) assert.equal(hash(await readFile(path.join(root, file))), sourceHashes[file], `${file} changed during the test`);
  });
} finally {
  await writeFile(path.join(out, 'results.json'), JSON.stringify({
    verifiedAt: new Date().toISOString(), scope: 'Node data-contract and real OSM regeneration tests in an isolated artifacts fixture. No production dataset writes, browser, geometry rendering or phone validation.',
    sourceHashes, results,
  }, null, 2) + '\n');
}
console.log(`${results.length}/${results.length} campus supplement checks passed.`);
