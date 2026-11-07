import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, 'artifacts/campus-test');
await mkdir(artifacts, { recursive: true });
for (const name of ['terrain', 'physics', 'scene', 'observedAppearances', 'observedBuildingOverrides', 'buildingAppearance', 'libraryLandmark', 'mainLibraryLandmark', 'administrationLandmark', 'studentCenterLandmark', 'museumLandmark', 'livingScienceLandmark', 'livingScienceSouthSite', 'gymLandmark', 'agricultureLandmark', 'sportsLandmark', 'gyujanggakLandmark', 'pavilionLandmark', 'engineering301Landmark', 'educationHealthLandmark', 'educationNorthApproach', 'educationParkingApproach', 'healthCourtyard', 'science500Landmark', 'engineering303Landmark', 'engineering312Landmark', 'engineering303312Connection', 'facultyClubLandmark', 'teachingCenterLandmark', 'engineering35Landmark', 'engineering31Landmark', 'engineering302Landmark', 'engineerHouseLandmark', 'samsungResearchLandmark', 'familyDormLandmark', 'researchParkLandmark', 'globalEngineeringLandmark', 'admissionsLandmark', 'neutinamuLandmark', 'baekhakLandmark', 'landmarkBuildings', 'distantBuildings', 'campusConstruction', 'fullCampus', 'humanitiesPassage', 'humanities14Stair', 'humanitiesGarden', 'humanities250', 'humanities23Site', 'humanities23Connection', 'humanities4Landmark', 'humanities8Landmark', 'humanities7Landmark', 'humanities6Landmark', 'humanities14Landmark','humanities1Landmark','humanities2Landmark','humanities35Exterior','education10Exterior','terrainPatch','education13Site','education13Exterior','education1320Site','education1320Connection','pharmacy20Site','pharmacy20Exterior','librarySoutheastSite','libraryAmenitiesSite','pharmacy2021Site','pharmacy2021Connection','pharmacy21Site','pharmacy21Exterior','pharmacy143Site','pharmacy143Exterior','engineering30Site','engineering30Exterior','engineering30DiningSite','engineering30DiningExterior','science28Site','science28Exterior','science251Site','science251Exterior','science24Site','science24Exterior','science2527Site','science2527Exterior','science26Site','science26Exterior','science23Site','science23Exterior','science2256AccessSite', 'science2256Site','science2256Exterior','physics561Site','physics561Exterior','education11Exterior','education1112Site','education1112Connection', 'humanitiesUpperApproach', 'humanities35Site', 'humanities35Connection', 'humanitiesGardenSite', 'humanitiesGardenTerrain', 'dining76Approach', 'dining76EastApproach', 'education101Site', 'education101Approach', 'engineering301303Connection', 'engineering3130Connection', 'engineering301303Site', 'livingScienceCourtyardSite', 'educationParkingSite', 'educationParkingTerrain', 'dining76Site', 'dining76Terrain', 'dining76EastSite', 'dining76EastTerrain', 'education101EntrySite', 'education101EntryTerrain', 'education12Landmark', 'pascucci111Landmark', 'education12Site', 'education12Terrain', 'engineeringRoadFacilities']) {
  const source = await readFile(path.join(root, `src/${name}.ts`), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  await writeFile(path.join(artifacts, `${name}.mjs`), compiled.replace(/from '(\.\/[\w-]+)'/g, "from '$1.mjs'"));
}
const { createTerrain } = await import(pathToFileURL(path.join(artifacts, 'terrain.mjs')).href);
const { createCampus } = await import(pathToFileURL(path.join(artifacts, 'scene.mjs')).href);
const { createFullCampus } = await import(pathToFileURL(path.join(artifacts, 'fullCampus.mjs')).href);
const { Simulation } = await import(pathToFileURL(path.join(artifacts, 'physics.mjs')).href);
await RAPIER.init();

// Only CanvasTexture text and pattern creation is stubbed; this is not a browser or image test.
const canvasCalls = new Set(['fillRect', 'clearRect', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'ellipse', 'stroke', 'fill', 'fillText', 'strokeText', 'roundRect', 'save', 'restore', 'translate', 'rotate', 'scale', 'quadraticCurveTo', 'bezierCurveTo', 'setTransform']);
globalThis.document = {
  createElement(tag) {
    assert.equal(tag, 'canvas', `unexpected DOM access: ${tag}`);
    const context = new Proxy({}, {
      get(target, name) {
        if (name === 'measureText') return text => ({ width: String(text).length * 20 });
        if (name === 'createLinearGradient' || name === 'createRadialGradient') return () => ({ addColorStop() {} });
        if (canvasCalls.has(name)) return () => {};
        return target[name];
      },
      set(target, name, value) { target[name] = value; return true; },
    });
    return { width: 0, height: 0, getContext(type) { assert.equal(type, '2d'); return context; } };
  },
};

const data = JSON.parse(await readFile(path.join(root, 'public/data/campus.json'), 'utf8'));
const inputDataSnapshot = JSON.stringify(data);
// This independently bounded exception does not remove the original OSM row.
const observedGroundOnlyIds = new Set(['way/455025059']);
const renderedBuildings = data.buildings.filter(b => !observedGroundOnlyIds.has(b.id));
const elevation = JSON.parse(await readFile(path.join(root, 'public/data/terrain.json'), 'utf8'));
const rawXml = await readFile(path.join(root, 'sources/campus.osm'), 'utf8');
const attributes = text => Object.fromEntries([...text.matchAll(/([\w:]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
const rawById = new Map();
for (const match of rawXml.matchAll(/<node\b([^>]*)\/?\s*>/g)) {
  const node = attributes(match[1]); rawById.set(`node/${node.id}`, node);
}
for (const match of rawXml.matchAll(/<way\b([^>]*)>([\s\S]*?)<\/way>/g)) {
  const way = attributes(match[1]);
  way.nodes = [...match[2].matchAll(/<nd\b[^>]*ref="([^"]+)"/g)].map(m => m[1]);
  way.tags = Object.fromEntries([...match[2].matchAll(/<tag\b([^>]*)\/?\s*>/g)].map(m => { const tag = attributes(m[1]); return [tag.k, tag.v]; }));
  rawById.set(`way/${way.id}`, way);
}
const results = [];
function check(name, run) {
  const details = run();
  results.push({ name, status: 'passed', ...details });
  console.log(`PASS ${name}${details ? ` ${JSON.stringify(details)}` : ''}`);
}
const inside = (p, bounds) => p[0] >= bounds.minX && p[0] <= bounds.maxX && p[1] >= bounds.minZ && p[1] <= bounds.maxZ;
const center = points => {
  const p = points.slice(0, -1);
  return [p.reduce((s, v) => s + v[0], 0) / p.length, p.reduce((s, v) => s + v[1], 0) / p.length];
};
const landmarks = [
  { id: 'way/148286730', name: '중앙도서관', ref: '62', area: 'central' },
  { id: 'way/167609409', name: '행정관', ref: '60', area: 'central' },
  { id: 'way/228476658', name: '제1공학관', ref: '301', area: 'south' },
  { id: 'way/482207537', name: '제2공학관', ref: '302', area: 'south' },
  { id: 'way/482425583', name: '919A', ref: '919A', area: 'east' },
];

check('building and road coordinates are finite and occupy the campus boundary', () => {
  assert.ok(data.boundary.length > 0);
  for (const b of data.buildings) {
    assert.ok(b.points.length >= 4 && b.height > 0);
    for (const p of b.points) { assert.ok(p.every(Number.isFinite)); assert.ok(inside(p, data.bounds), `building outside playable bounds: ${b.name}`); }
  }
  for (const road of data.roads) {
    assert.ok(road.points.length >= 2 && road.width > 0);
    assert.ok(road.points.every(p => p.every(Number.isFinite)));
  }
  for (const p of [[data.bounds.minX, data.bounds.minZ], [data.bounds.maxX, data.bounds.maxZ]]) assert.ok(inside(p, elevation.bounds));
  return { buildings: data.buildings.length, roads: data.roads.length, northSouthMetres: data.bounds.maxZ - data.bounds.minZ, eastWestMetres: data.bounds.maxX - data.bounds.minX };
});

check('library, administration, southern engineering buildings and eastern dormitory match source OSM coordinates', () => {
  const locations = [];
  for (const landmark of landmarks) {
    const building = data.buildings.find(b => b.id === landmark.id);
    assert.ok(building, `missing ${landmark.name}`);
    const source = rawById.get(landmark.id);
    assert.equal(source.tags.name, landmark.name);
    for (const nodeId of source.nodes) {
      const node = rawById.get(`node/${nodeId}`);
      const expected = [(Number(node.lon) - data.origin.lon) * 111320 * Math.cos(data.origin.lat * Math.PI / 180), (Number(node.lat) - data.origin.lat) * 111320];
      assert.ok(building.points.some(p => Math.hypot(p[0] - expected[0], p[1] - expected[1]) < 0.02), `${landmark.name} lost source node ${nodeId}`);
    }
    const [x, z] = center(building.points);
    if (landmark.area === 'south') assert.ok(z < -1700, 'southern engineering campus was collapsed into the main gate area');
    if (landmark.area === 'east') assert.ok(x > 800, 'dormitory campus was collapsed into the main gate area');
    if (landmark.area === 'central') assert.ok(z < -600 && z > -950);
    locations.push({ name: landmark.name, x, z });
  }
  return { locations };
});

const scene = new THREE.Scene();
const terrain = createTerrain(scene, elevation, data.buildings);
const gate = createCampus(scene, { full: true });
const full = createFullCampus(scene, data, terrain.heightAt);

check('photo-specific building models are selected in the full campus rather than only in isolated tests', () => {
  const expected = [
    ['way/892896238', 'engineering-35', 17.5, 5, true, false],
    ['way/389628348', 'engineering-31', 17.5, 5, true, false],
    ['way/167659979', 'faculty-club', 12.6, 2, true, false],
    ['way/193893591', 'teaching-center', 14, 4, true, true],
    ['way/148286730', 'main-library', 28, 6, true, false],
    ['way/167609409', 'administration', 20, 5, true, false],
    ['way/167607356', 'student-center', 21.4, 6, true, false],
    ['way/439693757', 'museum', 13.8, 2, true, false],
    ['way/386890828', 'living-science', 24.5, 7, true, false],
    ['way/386891006', 'gym', 14, 4, true, true],
    ['way/179742149', 'agriculture', 32.4, 9, true, false],
    ['way/439707878', 'neutinamu', 14, 4, true, false],
    ['way/439707877', 'baekhak', 10.5, 3, true, false],
    ['way/93549089', 'global-engineering', 23.5, 5, true, false],
    ['way/386891016', 'admissions', 17.5, 5, true, false],
    ['way/482207537', 'engineering-302', 35, 10, true, false],
    ['way/228476658', 'engineering-301', 52.5, 15, true, false],
    ['supplemental/snu-303', 'engineering-303', 28, 7, true, false],
    ['way/777502176', 'engineering-312', 35.5, 6, true, false],
    ['way/297046999', 'education-220', 27, 7, true, false],
    ['way/297047243', 'public-health-221', 24.5, 6, true, false],
    ['way/179742155', 'science-500', 23.4, 6, true, true],
    ['way/179742150', 'science-500', 23.4, 6, true, true],
    ['way/179742153', 'science-500', 23.4, 6, true, true],
    ['way/329398248', 'science-500', 9, 2, true, true],
    ['way/297047750', 'science-500', 24, 6, true, true],
    ['way/386890466', 'engineer-house', 10.1, 2, true, true],
    ['way/700872151', 'samsung-research', 35, 10, true, false],
    ['way/439707875', 'research-park', 14, 4, true, true],
    ...['way/439707895', 'way/439707894', 'way/439707893', 'way/439707892', 'way/409030550'].map(id => [id, 'family-dorm', 17.5, 5, true, false]),
  ];
  for (const [id, landmark, height, levels, heightEstimated, levelsEstimated] of expected) {
    const shells = scene.children.filter(object => object.userData.role === 'building-shell' && object.userData.buildingId === id);
    assert.equal(shells.length, 1, `missing or duplicated custom shell ${id}`);
    const shell = shells[0], appearance = shell.userData.appearance;
    assert.equal(shell.userData.landmark, landmark, `full campus fell back to a generic building for ${id}`);
    assert.equal(appearance.height, height); assert.equal(appearance.levels, levels);
    assert.equal(appearance.heightEstimated, heightEstimated); assert.equal(appearance.levelsEstimated, levelsEstimated);
    assert.ok(full.breakables.some(part => part.mesh.userData.buildingId === id && part.mesh.userData.landmark === landmark));
    const meshes = shell.children.filter(object => object.isMesh);
    const bankLabels = meshes.filter(object => object.name === 'student-center-bank-labels');
    if (landmark === 'student-center') {
      assert.equal(bankLabels.length, 1, 'student center signs must share one atlas mesh');
      assert.equal(bankLabels[0].userData.labels.length, 3, 'all three confirmed bank signs must use the shared mesh');
      assert.equal(bankLabels[0].material.map.name, 'student-center-bank-signs');
    } else assert.equal(bankLabels.length, 0);
    assert.ok(meshes.length - bankLabels.length <= 3, `too many individual render meshes in ${id}`);
    assert.equal(scene.children.some(object => object.userData.role === 'distant-building' && object.userData.buildingId === id && object.userData.renderRange), false);
  }
  return { integratedModels: expected.length };
});

check('custom models keep their navigation labels within the shared five-label budget', () => {
  const ids = ['way/892896238', 'way/389628348', 'way/167659979', 'way/193893591', 'way/228476658', 'way/482207537', 'way/179742149', 'way/386891006', 'way/148286730', 'way/167609409', 'way/297046999', 'way/297047243', 'way/179742155', 'way/179742150', 'way/179742153', 'way/329398248', 'way/297047750', 'way/777502176'];
  for (const id of ids) {
    const labels = scene.children.filter(o => o.isSprite && o.userData.buildingId === id && o.userData.worldText);
    assert.equal(labels.length, 1, `custom building lost or duplicated its navigation label: ${id}`);
  }
  const target = scene.children.find(o => o.isSprite && o.userData.buildingId === 'way/228476658');
  assert.equal(target.userData.worldText.text, '301 제1공학관');
  const building = data.buildings.find(b => b.id === 'way/228476658');
  const xs = building.points.map(p => p[0]), zs = building.points.map(p => p[1]);
  const radius = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) / 2;
  const position = target.position.clone(); position.z += radius + 80;
  full.update(position); assert.equal(target.visible, true, '301 name should appear on approach');
  let maximumVisible = 0;
  for (const [x, z] of [[position.x, position.z], [0, 0], [0, -750], [350, -1800], [500, -200], [10000, 10000]]) {
    full.update(new THREE.Vector3(x, 0, z));
    const visible = scene.children.filter(o => o.isSprite && o.userData.worldText && o.visible).length;
    maximumVisible = Math.max(maximumVisible, visible); assert.ok(visible <= 5, 'custom and generic labels exceeded the shared limit');
  }
  assert.equal(target.visible, false, '301 name remained visible outside the label range');
  full.update(new THREE.Vector3(0, 0, 35));
  return { checkedCustomLabels: ids.length, label: target.userData.worldText.text, maximumVisible };
});

check('every quick-travel destination lies outside buildings and on a mapped route or verified engineering approach', () => {
  const pointInRing = ([x, z], points) => {
    let result = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i], b = points[j];
      if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
    }
    return result;
  };
  const distanceToSegment = (p, a, b) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], lengthSq = dx * dx + dz * dz;
    const fraction = lengthSq ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / lengthSq)) : 0;
    return Math.hypot(p[0] - a[0] - dx * fraction, p[1] - a[1] - dz * fraction);
  };
  let largestDistanceToBuildingCentre = 0;
  for (const location of full.locations) {
    const point = [location.x, location.z];
    assert.ok(inside(point, elevation.bounds));
    for (const building of renderedBuildings) {
      assert.equal(pointInRing(point, building.points), false, `${location.name} arrives inside ${building.name}`);
      for (let i = 1; i < building.points.length; i++) assert.ok(distanceToSegment(point, building.points[i - 1], building.points[i]) > 0.7, `${location.name} arrives too close to a wall`);
    }
    let routeDistance = Infinity, nearestRoute;
    for (const road of data.roads) for (let i = 1; i < road.points.length; i++) {
      const distance = distanceToSegment(point, road.points[i - 1], road.points[i]);
      if (distance < routeDistance) { routeDistance = distance; nearestRoute = road; }
    }
    if (location.id === 'supplemental/snu-303') {
      assert.equal(nearestRoute.id, 'way/481787202/411');
      assert.ok(routeDistance < nearestRoute.width / 2, '303 arrival left the mapped road width');
      assert.ok(scene.children.some(o => o.userData.connectionId === 'connection/engineering301-303'), '303 approach needs its registered connection');
    } else assert.ok(routeDistance < 0.02, `${location.name} is not on a mapped road or path`);
    const nearestBuilding = data.buildings.filter(b => b.id === location.id).map(b => center(b.points));
    largestDistanceToBuildingCentre = Math.max(largestDistanceToBuildingCentre, Math.min(...nearestBuilding.map(p => Math.hypot(point[0] - p[0], point[1] - p[1]))));
  }
  return { destinations: full.locations.length, largestDistanceToBuildingCentre };
});

check('engineering301 and engineering303 quick travel starts clear of structures and remains grounded while settling', () => {
  const records = [];
  for (const id of ['way/228476658', 'supplemental/snu-303']) {
  const location = full.locations.find(p => p.id === id);
  assert.ok(location);
  const spawn = new THREE.Vector3(location.x, terrain.heightAt(location.x, location.z) + 1.7, location.z);
  const sim = new Simulation([...gate.breakables, ...full.breakables], [...gate.colliders, ...full.colliders], spawn, data.bounds, terrain);
  const samples = [];
  try {
    for (let frame = 0; frame <= 120; frame++) {
      if (frame) sim.step(1 / 60, 0, 0, false);
      if (![0, 30, 120].includes(frame)) continue;
      const position = sim.player.translation();
      let overlaps = 0;
      sim.world.intersectionsWithShape(position, sim.player.rotation(), sim.playerCollider.shape, () => { overlaps++; return true; }, RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC, 0x00040001, sim.playerCollider, sim.player);
      assert.equal(overlaps, 0, `quick travel capsule intersects terrain or structures at frame ${frame}`);
      if (frame) assert.ok(sim.grounded, 'quick travel did not settle on its approach path');
      samples.push({ frame, position: { ...position }, overlaps, grounded: sim.grounded });
    }
  } finally { sim.world.removeCharacterController(sim.controller); sim.world.free(); }
  records.push({ location, samples });
  }
  return { records };
});

check('actual scene generation covers source buildings with finite geometry and destructible walls', () => {
  assert.equal(JSON.stringify(data), inputDataSnapshot, 'scene creation mutated source map data');
  assert.equal(full.locations.length, data.buildings.length - observedGroundOnlyIds.size);
  for (const id of observedGroundOnlyIds) {
    const rows = data.buildings.filter(b => b.id === id), source = rawById.get(id);
    assert.equal(rows.length, 1, 'the original observed-ground-only row must remain in map data');
    assert.equal(source.tags.building, 'yes');
    const expected = source.nodes.map(nodeId => { const node = rawById.get(`node/${nodeId}`); return [(Number(node.lon) - data.origin.lon) * 111320 * Math.cos(data.origin.lat * Math.PI / 180), (Number(node.lat) - data.origin.lat) * 111320].map(n => Math.round(n * 100) / 100); });
    assert.deepEqual(rows[0].points, expected, 'the excluded volume must retain its raw OSM footprint');
    assert.equal(full.locations.some(p => p.id === id), false, 'unconfirmed ground-only body remains a destination');
    assert.equal(full.breakables.some(p => p.mesh.userData.buildingId === id), false, 'unconfirmed body still has destructible collision');
    const objects = []; scene.traverse(o => { if (o.userData.buildingId === id) objects.push(o); });
    assert.equal(objects.length, 0, 'unconfirmed body retains a shell, distant range, roof or label');
  }
  for (const building of data.buildings) {
    if (observedGroundOnlyIds.has(building.id)) continue;
    assert.ok(full.locations.some(p => p.id === building.id));
    const identifier = building.kind === 'construction' ? 'areaId' : 'buildingId';
    assert.ok(full.breakables.some(p => p.mesh.userData[identifier] === building.id), `missing destructible building or construction fence ${building.id}`);
  }
  for (const landmark of landmarks) assert.ok(full.locations.some(p => p.id === landmark.id && p.name.includes(landmark.ref)), `missing labelled ${landmark.ref}`);
  let meshCount = 0, vertexCount = 0;
  scene.traverse(object => {
    if (!object.geometry) return;
    meshCount++;
    for (const key of ['position', 'normal']) {
      const attr = object.geometry.getAttribute(key);
      if (attr) assert.ok(Array.from(attr.array).every(Number.isFinite), `non-finite ${key}`);
    }
    const position = object.geometry.getAttribute('position');
    if (position) vertexCount += position.count;
    const index = object.geometry.getIndex();
    if (index) for (const i of index.array) assert.ok(i >= 0 && i < position.count, `out-of-bounds triangle index ${i}`);
  });
  for (const target of [...gate.breakables, ...full.breakables]) {
    assert.ok(target.mesh.position.toArray().every(Number.isFinite));
    assert.ok(target.size.toArray().every(n => Number.isFinite(n) && n > 0));
  }
  for (const landmark of landmarks) {
    const loc = full.locations.find(p => p.id === landmark.id);
    full.update(new THREE.Vector3(loc.x, terrain.heightAt(loc.x, loc.z) + 1.7, loc.z));
  }
  return { sourceBuildingRows: data.buildings.length, observedGroundOnlyIds: [...observedGroundOnlyIds], locations: full.locations.length, destructiblePieces: full.breakables.length + gate.breakables.length, meshCount, vertexCount };
});

check('all intact buildings retain a rendered representation beyond the former distance cutoff', () => {
  const farById = new Map(), shellById = new Map();
  scene.traverse(object => {
    if (object.userData.role === 'distant-building') farById.set(object.userData.buildingId, object);
    if (object.userData.role === 'building-shell') for (const id of object.userData.buildingIds ?? [object.userData.buildingId]) shellById.set(id, object);
  });
  const observerPositions = [new THREE.Vector3(0, 1.7, 35), new THREE.Vector3(350, 150, -2050), new THREE.Vector3(4500, 300, 4500)];
  let distantRepresentations = 0;
  for (const observer of observerPositions) {
    full.update(observer);
    for (const building of data.buildings) {
      const far = farById.get(building.id), shell = shellById.get(building.id);
      if (observedGroundOnlyIds.has(building.id)) {
        assert.equal(far, undefined, 'unconfirmed volume regained a distant building');
        assert.equal(shell, undefined, 'unconfirmed volume regained a building shell');
        continue;
      }
      if (building.kind === 'construction') {
        assert.equal(far, undefined, 'construction site acquired a false distant building');
        assert.equal(shell, undefined, 'construction site acquired a false building shell');
        const fence = scene.children.find(o => o.userData.role === 'construction-fence' && o.userData.areaId === building.id);
        assert.ok(fence?.visible && fence.children.some(o => o.isInstancedMesh && o.count > 0), 'construction fence disappeared at distance');
        continue;
      }
      if (shell?.userData.buildingIds?.includes(building.id)) {
        assert.equal(shell.visible, true, `shared shell disappeared at distance: ${building.name}`);
        assert.ok(!far?.visible, `shared shell rendered a duplicate: ${building.name}`);
        assert.ok(shell.children.some(child => child.geometry?.getAttribute('position')?.count > 0), `shared shell has no geometry: ${building.name}`);
        assert.ok(full.breakables.some(part => part.mesh.userData.buildingId === building.id && part.mesh.visible), `shared shell lost building ownership: ${building.name}`);
        continue;
      }
      assert.ok(far && shell, `render records missing: ${building.name}`);
      if (shell.userData.landmark) {
        assert.equal(shell.visible, true, `landmark disappeared at distance: ${building.name}`);
        assert.equal(far.visible, false, `landmark metadata rendered a duplicate: ${building.name}`);
        assert.ok(shell.children.some(child => child.geometry?.getAttribute('position')?.count > 0), `landmark has no rendered geometry: ${building.name}`);
        continue;
      }
      assert.notEqual(far.visible, shell.visible, `intact building missing or duplicated at distance: ${building.name}`);
      if (far.visible) {
        distantRepresentations++;
        const range = far.userData.renderRange;
        assert.ok(range.mesh?.visible && range.indexCount > 0, `no submitted distant geometry: ${building.name}`);
        assert.equal(range.mesh.material.vertexColors, true);
        const geometry = range.mesh.geometry, index = geometry.getIndex(), colors = geometry.getAttribute('color');
        assert.ok(range.indexStart >= 0 && range.indexStart + range.indexCount <= geometry.drawRange.count);
        const glassColor = new THREE.Color(far.userData.appearance.glassColor);
        let glassVertices = 0;
        for (let i = range.indexStart; i < range.indexStart + range.indexCount; i++) {
          const vertex = index.getX(i);
          assert.ok(vertex >= range.vertexStart && vertex < range.vertexStart + range.vertexCount, 'batch range contains another building');
          if (Math.abs(colors.getX(vertex)-glassColor.r)<1e-5 && Math.abs(colors.getY(vertex)-glassColor.g)<1e-5 && Math.abs(colors.getZ(vertex)-glassColor.b)<1e-5) glassVertices++;
        }
        assert.ok(glassVertices >= range.windowCount * 6, `distant facade loses window geometry: ${building.name}`);
        assert.equal(shell.children.find(child => child.userData.role === 'detailed-windows').visible, false);
      }
    }
  }
  return { observers: observerPositions.length, buildingsPerObserver: renderedBuildings.filter(b => b.kind !== 'construction').length, constructionSitesPerObserver: data.buildings.filter(b => b.kind === 'construction').length, observedGroundOnlyIds: [...observedGroundOnlyIds], distantRepresentations };
});

check('distant campus uses bounded ordinary draw batches without a multi-draw extension', () => {
  full.update(new THREE.Vector3(4500,300,4500));
  const batches = scene.children.filter(o=>o.userData.role==='distant-building-batch'&&o.visible);
  const markers = scene.children.filter(o=>o.userData.role==='distant-building'&&o.userData.renderRange&&o.visible);
  assert.ok(batches.length > 0 && batches.length < 50, 'too many distant draw batches');
  assert.ok(batches.length < markers.length / 3, 'distant batching no longer reduces draw calls');
  for(const batch of batches) {
    assert.equal(batch.isBatchedMesh, undefined, 'must work without WEBGL_multi_draw');
    assert.equal(batch.isMesh, true);
    assert.equal(Array.isArray(batch.material), false);
    assert.equal(batch.geometry.groups.length, 0);
    assert.ok(batch.geometry.boundingSphere.radius > 0);
  }
  return {batches:batches.length,buildings:markers.length,previousDistantDrawCalls:markers.length*2};
});

check('partially damaged buildings retain surviving walls, glass and roof at distance and restore after reset', () => {
  const genericShell = scene.children.find(object => object.userData.role === 'building-shell' && !object.userData.landmark && object.children.some(child => child.userData.role === 'walls'));
  assert.ok(genericShell, 'a generic building is required to verify the distant batching path');
  const id = genericShell.userData.buildingId;
  const far = scene.children.find(object => object.userData.buildingId === id && object.userData.role === 'distant-building');
  const shell = scene.children.find(object => object.userData.buildingId === id && object.userData.role === 'building-shell');
  const rooftop = scene.children.find(object => object.userData.buildingId === id && object.userData.role === 'rooftop');
  const targets = full.breakables.filter(target => target.mesh.userData.buildingId === id);
  const wallTargets = targets.filter(target => !target.mesh.userData.roof), roofTarget = targets.find(target => target.mesh.userData.roof);
  const walls = shell.children.find(child => child.userData.role === 'walls');
  const fineGlass = shell.children.find(child => child.userData.role === 'detailed-windows');
  const distantGlass = shell.children.find(child => child.userData.role === 'distant-windows');
  assert.ok(wallTargets.length > 1 && roofTarget);
  const observer = new THREE.Vector3(4000, 200, 4000), matrix = new THREE.Matrix4();
  wallTargets[0].mesh.visible = false;
  full.update(observer);
  assert.equal(far.visible, false, 'damaged building must not return its intact silhouette');
  assert.equal(far.userData.renderRange.indexCount, 0, 'damaged silhouette remains submitted in a batch');
  assert.equal(shell.visible, true, 'surviving structure disappeared at distance');
  assert.equal(distantGlass.visible, true);
  assert.equal(fineGlass.visible, false, 'detailed glass still renders in the distant damaged representation');
  walls.getMatrixAt(0, matrix); assert.equal(matrix.determinant(), 0, 'destroyed wall remained visible');
  walls.getMatrixAt(1, matrix); assert.notEqual(matrix.determinant(), 0, 'surviving wall disappeared');
  assert.equal(rooftop.visible, true);
  const triangles = geometry => (geometry.getIndex()?.count ?? geometry.getAttribute('position').count) / 3;
  assert.ok(triangles(distantGlass.geometry) < triangles(fineGlass.geometry), 'distant glass should use fewer triangles than box windows');
  for (const target of targets) target.mesh.visible = false;
  full.update(observer);
  assert.equal(far.visible, false); assert.equal(shell.visible, false); assert.equal(rooftop.visible, false);
  for (const target of targets) target.mesh.visible = true;
  full.update(observer);
  assert.equal(far.visible, true, 'reset did not restore the distant model');
  assert.ok(far.userData.renderRange.indexCount > 0, 'reset did not restore submitted batch triangles');
  assert.equal(shell.visible, false); assert.equal(rooftop.visible, true);
  const near = full.locations.find(location => location.id === id);
  full.update(new THREE.Vector3(near.x, 10, near.z));
  assert.equal(shell.visible, true); assert.equal(fineGlass.visible, true); assert.equal(distantGlass.visible, false);
  walls.getMatrixAt(0, matrix); assert.notEqual(matrix.determinant(), 0, 'reset did not restore the near instance');
  return { testedBuilding: id, wallPieces: wallTargets.length, distances: ['near', 'beyond 4000 metres'] };
});

check('museum landmark preserves its mapped footprint, elevated shell, truss geometry and damage at every distance', () => {
  const id = 'way/252233408', building = data.buildings.find(b => b.id === id);
  assert.ok(building);
  const shell = scene.children.find(object => object.userData.buildingId === id && object.userData.role === 'building-shell');
  const distant = scene.children.find(object => object.userData.buildingId === id && object.userData.role === 'distant-building');
  const mesh = shell.children.find(child => child.name === 'moa-cantilever-and-truss');
  const targets = full.breakables.filter(target => target.mesh.userData.buildingId === id);
  assert.equal(shell.userData.landmark, 'moa');
  assert.equal(shell.children.filter(child => child.isMesh).length, 1, 'landmark should retain its single merged render mesh');
  assert.equal(targets.length, 38, 'landmark destructible facade and roof segments changed');
  assert.ok(targets.some(target => target.material === 'glass') && targets.some(target => target.material === 'metal') && targets.some(target => target.material === 'stone'));
  const [cx, cz] = center(building.points), base = terrain.heightAt(cx, cz);
  const box = new THREE.Box3().setFromObject(mesh);
  const mappedXs = building.points.map(p => p[0]), mappedZs = building.points.map(p => p[1]);
  assert.ok(Math.abs(box.min.x - Math.min(...mappedXs)) < 1 && Math.abs(box.max.x - Math.max(...mappedXs)) < 1, 'museum X footprint drifted');
  assert.ok(Math.abs(box.min.z - Math.min(...mappedZs)) < 1 && Math.abs(box.max.z - Math.max(...mappedZs)) < 1, 'museum Z footprint drifted');
  assert.ok(Math.abs(box.max.y - base - 17.815) < .1, 'museum sourced height is not reflected in geometry');
  assert.ok(targets.filter(t => t.material === 'glass').every(t => t.mesh.position.y - t.size.y / 2 > base + 2), 'museum glazed shell should be raised above the plaza');
  const position = mesh.geometry.getAttribute('position'), original = Float32Array.from(position.array);
  const colors = mesh.geometry.getAttribute('color');
  assert.ok(position.count > 5000 && colors.count === position.count, 'museum exterior lost mullions or truss geometry');
  assert.ok(Array.from(position.array).every(Number.isFinite));
  const observer = new THREE.Vector3(4500, 200, 4500);
  full.update(observer); assert.equal(shell.visible, true); assert.equal(distant.visible, false);
  targets[0].mesh.visible = false; full.update(observer);
  assert.equal(shell.visible, true, 'partial destruction removed the entire museum');
  assert.ok(position.array.some((value, i) => value !== original[i]), 'destroyed museum component did not alter the merged geometry');
  assert.ok(position.array.some(value => value !== 0), 'remaining museum components disappeared');
  for (const target of targets) target.mesh.visible = false;
  full.update(observer); assert.equal(shell.visible, false); assert.ok(position.array.every(value => value === 0));
  for (const target of targets) target.mesh.visible = true;
  full.update(observer); assert.equal(shell.visible, true); assert.deepEqual(position.array, original);
  return { components: targets.length, vertices: position.count, mappedHeight: box.max.y - base, distantObserverMetres: Math.hypot(observer.x - cx, observer.z - cz) };
});

const world = new RAPIER.World({ x: 0, y: -18, z: 0 });
world.createCollider(RAPIER.ColliderDesc.trimesh(terrain.vertices, terrain.indices));
world.step();
try {
  check('terrain sampler agrees with the rendered mesh and Rapier ground triangles', () => {
    const samples = [[0, 0], ...landmarks.map(l => center(data.buildings.find(b => b.id === l.id).points))];
    for (let i = 1; i <= 25; i++) samples.push([data.bounds.minX + (data.bounds.maxX - data.bounds.minX) * ((i * 7 % 29) / 29), data.bounds.minZ + (data.bounds.maxZ - data.bounds.minZ) * ((i * 11 % 31) / 31)]);
    let maxDifference = 0;
    for (const [x, z] of samples) {
      const expected = terrain.heightAt(x, z);
      const ray = new RAPIER.Ray({ x, y: expected + 800, z }, { x: 0, y: -1, z: 0 });
      const hit = world.castRay(ray, 1600, true);
      assert.ok(hit, `missing terrain collider at ${x}, ${z}`);
      const physicalHeight = ray.origin.y - hit.timeOfImpact;
      const difference = Math.abs(physicalHeight - (expected - 0.03));
      maxDifference = Math.max(maxDifference, difference);
      assert.ok(difference < 0.015, `height mismatch ${difference} at ${x}, ${z}`);
    }
    return { samples: samples.length, maxDifferenceMetres: maxDifference };
  });
} finally { world.free(); }

check('player can walk sampled sloping roads across the campus', () => {
  const cases = [];
  const targetAreas = [{ name: 'gate', x: 0, z: 0 }, ...landmarks.filter(l => l.area !== 'central' || l.name === '행정관').map(l => {
    const [x, z] = center(data.buildings.find(b => b.id === l.id).points); return { name: l.name, x, z };
  })];
  const segments = [];
  for (const road of data.roads.filter(r => r.drivable)) for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1], b = road.points[i];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 30) continue;
    const dx = (b[0] - a[0]) / length, dz = (b[1] - a[1]) / length;
    const x = a[0] + dx * length * 0.3, z = a[1] + dz * length * 0.3;
    const grade = Math.abs(terrain.heightAt(x + dx * 8, z + dz * 8) - terrain.heightAt(x, z)) / 8;
    if (grade < 0.35) segments.push({ x, z, dx, dz, grade });
  }
  for (const area of targetAreas) {
    const segment = segments.toSorted((a, b) => Math.hypot(a.x - area.x, a.z - area.z) - Math.hypot(b.x - area.x, b.z - area.z))[0];
    assert.ok(segment);
    const { x, z, dx, dz } = segment;
    const sim = new Simulation([], [], new THREE.Vector3(x, terrain.heightAt(x, z) + 2, z), data.bounds, terrain);
    try {
      for (let i = 0; i < 120; i++) sim.step(1 / 60, 0, 0, false);
      const start = sim.player.translation();
      for (let i = 0; i < 120; i++) sim.step(1 / 60, dx * 4, dz * 4, false);
      const finish = sim.player.translation();
      const distance = Math.hypot(finish.x - start.x, finish.z - start.z);
      const clearance = finish.y - terrain.heightAt(finish.x, finish.z);
      assert.ok(distance > 6, `road traversal blocked near ${area.name}: ${distance}`);
      assert.ok(clearance > 0.6 && clearance < 1.2, `player did not stay on terrain near ${area.name}: ${clearance}`);
      cases.push({ near: area.name, grade: segment.grade, walkedMetres: distance, groundClearance: clearance });
    } finally { sim.world.removeCharacterController(sim.controller); sim.world.free(); }
  }
  return { cases };
});

await writeFile(path.join(root, 'artifacts/campus-verification.json'), JSON.stringify({ verifiedAt: new Date().toISOString(), tests: results, limitations: 'Numeric scene and physics checks only; canvas rasterization, WebGL rendering and real devices are not exercised.' }, null, 2));
console.log(`Verified ${results.length} campus regressions.`);
