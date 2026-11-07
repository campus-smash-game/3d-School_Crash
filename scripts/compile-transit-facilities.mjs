import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import * as THREE from 'three';

const root = new URL('../', import.meta.url);
const read = p => JSON.parse(fs.readFileSync(new URL(p, root), 'utf8'));
const hash = p => createHash('sha256').update(fs.readFileSync(new URL(p, root))).digest('hex');
const data = read('public/data/campus.json'), transit = read('public/data/campus-transit.json');
const official = read('sources/transit-official-routes.json'), shuttle = read('public/data/shuttle-stops.json');
const xml = fs.readFileSync(new URL('sources/campus.osm', root), 'utf8');
const decode = s => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const attrs = s => Object.fromEntries([...s.matchAll(/([\w:]+)="([^"]*)"/g)].map(m => [m[1], decode(m[2])]));
const raw = [...xml.matchAll(/<(node|way)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g)].map(m => ({
  type: m[1], ...attrs(m[2]),
  tags: Object.fromEntries([...(m[3] ?? '').matchAll(/<tag\b([^>]*?)\/>/g)].map(t => { const a = attrs(t[1]); return [a.k, a.v]; })),
  nodeIds: [...(m[3] ?? '').matchAll(/<nd\b([^>]*?)\/>/g)].map(t => attrs(t[1]).ref),
}));
const rawById = new Map(raw.map(e => [`${e.type}/${e.id}`, e]));
const roads = [...data.roads, ...transit.supplementalRoads], roadById = new Map(roads.map(r => [r.id, r]));
const names = new Map(official.routes.flatMap(r => r.stops.map(s => [s.id, s])));
const shuttleById = new Map(shuttle.stops.map(s => [s.id, s]));
const cache = new URL('artifacts/transit-facilities-test/compiler/', root); fs.mkdirSync(cache, { recursive: true });
for (const name of ['terrain', 'engineering301303Site', 'livingScienceCourtyardSite', 'educationParkingSite', 'educationParkingTerrain']) {
  const text = fs.readFileSync(new URL(`src/${name}.ts`, root), 'utf8');
  fs.writeFileSync(new URL(`${name}.mjs`, cache), ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/from (['"])(\.\/[\w-]+)\1/g, "from '$2.mjs'"));
}
const { createTerrain } = await import(new URL('terrain.mjs', cache));
const terrain = createTerrain(new THREE.Scene(), read('public/data/terrain.json'), data.buildings);
const round = n => Math.round(n * 1e6) / 1e6, point = p => p.map(round);
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
function segmentDistance(p, a, b) { const d = [b[0] - a[0], b[1] - a[1]], l2 = dot(d, d), t = l2 ? Math.max(0, Math.min(1, dot([p[0] - a[0], p[1] - a[1]], d) / l2)) : 0; return distance(p, [a[0] + d[0] * t, a[1] + d[1] * t]); }
function inside(p, polygon) { let result = false; for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) { const a = polygon[i], b = polygon[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) result = !result; } return result; }
const normalize = s => s.replace(/[^가-힣0-9]/g, '');
const aliases = { '법과대': '법대사회대입구', '자연대': '자연대행정관입구', '302동': '제2공학관', '301동': '유회진학술정보관제1공학관', '수의대': '수의대입구보건대학원앞', '경영대': '경영대행정대학원', '기숙사삼거리': '관악사삼거리', '정문': '서울대정문' };
const nameKey = s => aliases[s] || normalize(s);
const calls = [];
for (const route of transit.routes) for (let callIndex = 0; callIndex < route.stops.length; callIndex++) {
  const stop = route.stops[callIndex], segment = route.segments[stop.routeSegmentIndex], road = roadById.get(segment.roadId);
  if (!road) throw Error(`Missing transit road: ${segment.roadId}`);
  const a = road.points[segment.segmentIndex + (segment.direction < 0 ? 1 : 0)], b = road.points[segment.segmentIndex + (segment.direction < 0 ? 0 : 1)];
  const length = distance(a, b), forward = [(b[0] - a[0]) / length, (b[1] - a[1]) / length], outward = [forward[1], -forward[0]];
  const center = [a[0] + forward[0] * stop.distance, a[1] + forward[1] * stop.distance];
  const lane = road.oneway && road.width < 7 ? 0 : Math.min(3.1, Math.max(1.05, road.width * .23));
  const vehiclePosition = center.map((v, i) => v + outward[i] * lane);
  const candidate = center.map((v, i) => v + outward[i] * (road.width / 2 + 1.05));
  const source = names.get(stop.stopId) ?? shuttleById.get(stop.stopId), name = source?.name ?? stop.stopId;
  const matches = data.stops.map(s => ({ ...s, raw: rawById.get(s.id), distance: distance(s.point, candidate) }))
    .filter(s => s.distance < 32 && nameKey(s.name) === nameKey(name) && dot([s.point[0] - center[0], s.point[1] - center[1]], outward) > -.5)
    .sort((a, b) => a.distance - b.distance);
  const match = matches[0];
  calls.push({ stopId: stop.stopId, name, routeId: route.id, routeLabel: route.label, service: route.service, callIndex, routeSegmentIndex: stop.routeSegmentIndex,
    roadId: road.id, segmentIndex: segment.segmentIndex, direction: segment.direction, distance: stop.distance,
    center: point(center), vehiclePosition: point(vehiclePosition), forward: point(forward), outward: point(outward), candidate: point(candidate),
    roadWidth: road.width, roadWidthEstimated: road.widthEstimated,
    officialPosition: source?.officialPosition ? [source.officialPosition.x, source.officialPosition.z] : source?.point,
    osm: match ? { sourceId: match.id, name: match.name, point: match.point, distance: round(match.distance), tags: match.raw?.tags ?? {} } : null,
    sources: route.sources,
  });
}
const groups = [];
for (const call of calls) {
  const found = groups.find(g => dot(g[0].forward, call.forward) > .98 && (
    g.some(c => c.stopId === call.stopId && distance(c.candidate, call.candidate) < 8)
    || distance(g[0].candidate, call.candidate) < 4
    || (call.osm && g[0].osm?.sourceId === call.osm.sourceId && distance(g[0].candidate, call.candidate) < 12)
  ));
  if (found) found.push(call); else groups.push([call]);
}
const roadSegments = roads.filter(r => r.drivable).flatMap(r => r.points.slice(1).map((b, i) => ({ a: r.points[i], b, width: r.width, id: r.id })));
function clearance(p) {
  let road = Infinity, building = Infinity, spawn = Infinity;
  for (const r of roadSegments) road = Math.min(road, segmentDistance(p, r.a, r.b) - r.width / 2);
  for (const b of data.buildings) {
    if (inside(p, b.points) && !b.holes.some(h => inside(p, h))) return { road, building: -1, spawn };
    for (let i = 0; i < b.points.length; i++) building = Math.min(building, segmentDistance(p, b.points[i], b.points[(i + 1) % b.points.length]));
  }
  for (const s of shuttle.stops) spawn = Math.min(spawn, distance(p, [s.x, s.z]));
  return { road, building, spawn };
}
const stops = [], deferred = [];
for (const group of groups) {
  const c = group[0], stopIds = [...new Set(group.map(c => c.stopId))], placements = [];
  for (const along of [2.4, -2.4, 4, -4, 6, -6, 0]) for (const out of [1.05, 1.5, 2, 2.8]) {
    const p = c.center.map((v, i) => v + c.outward[i] * (c.roadWidth / 2 + out) + c.forward[i] * along), clear = clearance(p);
    if (clear.road >= .5 && clear.building >= .6 && clear.spawn >= 1.15 && stops.every(s => distance(s.position, p) > 1.4)) placements.push({ p, along, out, clear, score: Math.abs(along - 2.4) + Math.abs(out - 1.05) * 3 });
  }
  placements.sort((a, b) => a.score - b.score);
  const placement = placements[0];
  if (!placement) { deferred.push({ stopIds, reason: 'No unobstructed sidewalk candidate within the bounded placement search.', calls: group }); continue; }
  const osm = [...new Map(group.filter(c => c.osm).map(c => [c.osm.sourceId, c.osm])).values()];
  const shelter = osm.some(o => o.tags.shelter === 'no') ? 'no' : osm.some(o => o.tags.shelter === 'yes') ? 'yes' : 'unknown';
  stops.push({ id: `stop-facility/${stopIds.join('+')}/${c.direction === 1 ? 'f' : 'r'}`, stopIds,
    names: [...new Set(group.map(c => c.name))], label: c.name, services: [...new Set(group.map(c => c.service))], routes: [...new Set(group.map(c => c.routeLabel))],
    position: point(placement.p), forward: c.forward, outward: c.outward, roadId: c.roadId, roadWidth: c.roadWidth, roadWidthEstimated: c.roadWidthEstimated,
    signStyle: group.every(c => c.service === 'shuttle') ? 'shuttle-pole' : 'city-pole', shelter, shelterModel: 'pending-photo',
    placement: { basis: 'directed-operating-stop-roadside-offset', along: placement.along, outsideRoad: placement.out, estimated: true,
      clearances: Object.fromEntries(Object.entries(placement.clear).map(([k, v]) => [k, round(v)])) },
    calls: group, osm,
  });
}
const fixtures = [];
function fitRectangle(center, forward, outward, length, width, spawnGap = .7, maxSpread = Infinity) {
  const heights = [];
  for (const u of [-.5, 0, .5]) for (const v of [-.5, 0, .5]) {
    const p = center.map((n, i) => n + forward[i] * length * u + outward[i] * width * v), c = clearance(p);
    if (c.road < .35 || c.building < .35 || c.spawn < spawnGap) return false;
    heights.push(terrain.heightAt(...p));
  }
  return Math.max(...heights) - Math.min(...heights) <= maxSpread;
}
for (const site of stops.filter(s => s.shelter === 'yes')) {
  const c = site.calls[0]; let found;
  for (const along of [-2.8, -5.5, 5.5, -8, 8, -12, 12]) {
    for (const offset of [1.8, 2.5, 3.2]) {
      const p = c.center.map((v, i) => v + c.forward[i] * along + c.outward[i] * (c.roadWidth / 2 + offset));
      if (fitRectangle(p, c.forward, c.outward, 4.8, 2.2, .7, .8) && distance(p, site.position) > 3.6) { found = { p, along, offset }; break; }
    }
    if (found) break;
  }
  if (!found) { site.shelterModel = 'deferred-clearance'; continue; }
  site.shelterModel = 'estimated-common-open-shelter';
  fixtures.push({ id: site.id + '/shelter', kind: 'standard-shelter', label: site.label, stopIds: site.stopIds, position: point(found.p), forward: site.forward, outward: site.outward,
    length: 4.8, width: 2.2, height: 2.7, existence: 'osm-shelter-yes', appearance: 'estimated-common-form', sourceIds: site.osm.filter(s => s.tags.shelter === 'yes').map(s => s.sourceId),
    placement: { estimated: true, along: found.along, outsideRoad: found.offset } });
}
function nearestOnRoad(p, road) {
  let best;
  for (let i = 0; i < road.points.length - 1; i++) {
    const a = road.points[i], b = road.points[i + 1], v = [b[0] - a[0], b[1] - a[1]], len = Math.hypot(...v), t = Math.max(0, Math.min(1, dot([p[0] - a[0], p[1] - a[1]], v) / (len * len))), q = a.map((n, k) => n + v[k] * t), d = distance(p, q);
    if (!best || d < best.distance) best = { point: q, forward: v.map(x => x / len), distance: d, segmentIndex: i };
  }
  return best;
}
const gateRoad = roadById.get('way/468202819/405'), marker = data.stops.find(s => s.id === 'node/13392140067');
const gate = nearestOnRoad(marker.point, gateRoad), gateOut = [gate.forward[1], -gate.forward[0]];
const gateCenter = gate.point.map((v, i) => v + gateOut[i] * (gateRoad.width / 2 + 2.3));
if (!fitRectangle(gateCenter, gate.forward, gateOut, 14, 2.6, .7)) throw Error('Observed gate shelter footprint needs a placement review.');
fixtures.push({ id: 'observed/gate-shuttle-shelter', kind: 'arched-shelter', label: '정문 셔틀 쉼터', stopIds: ['snu-101'], position: point(gateCenter), forward: point(gate.forward), outward: point(gateOut),
  length: 14, width: 2.6, height: 2.8, ribs: 13, existence: 'roadview-2026-08', appearance: 'observed-dark-arched-shell-open-ends',
  sourceIds: [marker.id], originalPosition: marker.point, originalPositionShift: round(distance(marker.point, gateCenter)),
  sourceImage: '../references/transit-facilities/2026-08/gate-shuttle-shelter-ui.jpg', sourceUrl: 'https://kko.to/tOy1LfH3gq',
  placement: { estimated: true, basis: 'OSM longitudinal projection; photo-confirmed west sidewalk overrides the east-side marker.', outsideRoad: 2.3 },
  limits: ['Length, section, rib count and offset are estimated.', 'Dark covering may be sheet or mesh; transparent glass is not established.'] });
for (const z of [-10, -35, -86]) {
  const p = nearestOnRoad([0, z], gateRoad), n = [p.forward[1], -p.forward[0]];
  for (const side of [-1, 1]) {
    const q = p.point.map((v, i) => v + n[i] * side * (gateRoad.width / 2 + 1.8));
    const clear = clearance(q); if (clear.road < .65 || clear.building < .6 || clear.spawn < 1.2) throw Error('Observed lamp candidate requires clearance adjustment.');
    fixtures.push({ id: `observed/gate-lamp/${z}/${side}`, kind: 'double-lamp', label: '정문 도로 가로등', stopIds: [], position: point(q), forward: point(p.forward), outward: point(n.map(v => v * side)),
      height: 5.8, existence: 'roadview-2026-08-corridor', appearance: 'observed-dark-T-two-flat-luminaires',
      sourceImage: '../references/transit-facilities/2026-08/gate-shuttle-shelter-ui.jpg', sourceUrl: 'https://kko.to/tOy1LfH3gq',
      placement: { estimated: true, basis: 'Six photo-type lamps limited to the monument and shuttle-stop corridor; individual spacing is estimated.' } });
  }
}
const signalRoad = roadById.get('way/176767459/80'), signalNode = [88.31, 130.13], signal = nearestOnRoad(signalNode, signalRoad), signalOut = [signal.forward[1], -signal.forward[0]];
const mast = signal.point.map((v, i) => v + signalOut[i] * (signalRoad.width / 2 + 1.2));
fixtures.push({ id: 'observed/gate-northeast-signal', kind: 'cantilever-signal', label: '정문 북동쪽 신호기', stopIds: [], position: point(mast), forward: point(signal.forward), outward: point(signalOut),
  height: 7.3, armLength: 11.5, existence: 'crossing-tag-and-roadview-2026-08', appearance: 'one-north-mast-two-three-light-heads-and-pedestrian-box',
  sourceIds: ['node/13231900614', 'node/14241354281', 'way/1442039156'], sourceImage: '../references/transit-facilities/2026-08/gate-northeast-signals-west-ui.jpg', sourceUrl: 'https://kko.to/05e4YtiJW5',
  placement: { estimated: true, basis: 'North curb of the observed signal crossing; no unobserved opposite mast added.' }, signalOperation: 'static-visual-not-real-time-control' });
const crossing = rawById.get('way/1442039156'), crossingPoints = crossing.nodeIds.map(id => {
  const n = rawById.get('node/' + id); return point([(+n.lon - data.origin.lon) * 111320 * Math.cos(data.origin.lat * Math.PI / 180), (+n.lat - data.origin.lat) * 111320]);
});
fixtures.push({ id: 'observed/gate-northeast-crosswalk', kind: 'crosswalk', label: '정문 북동쪽 횡단보도', stopIds: [], position: [92.314199, 122.115257], forward: point(signal.forward), outward: point(signalOut), height: 0,
  points: crossingPoints, width: 4.2, roadPolygons: ['way/176767459/80', 'way/605434644/473'].flatMap(id => {
    const r = roadById.get(id); return r.points.slice(1).map((b, i) => { const a = r.points[i], len = distance(a, b), n = [(b[1] - a[1]) / len * r.width / 2, -(b[0] - a[0]) / len * r.width / 2]; return [a.map((x, k) => x + n[k]), b.map((x, k) => x + n[k]), b.map((x, k) => x - n[k]), a.map((x, k) => x - n[k])]; });
  }), sourceIds: ['way/1442039156', 'node/13231900614', 'node/14241354281'], sourceImage: '../references/transit-facilities/2026-08/gate-northeast-signals-west-ui.jpg', sourceUrl: 'https://kko.to/05e4YtiJW5',
  placement: { estimated: true, basis: 'OSM crossing path clipped to the two mapped carriageways; stripe width and pitch estimated.' } });
const sourceFiles = ['public/data/campus.json', 'public/data/campus-transit.json', 'sources/transit-official-routes.json', 'public/data/shuttle-stops.json', 'sources/campus.osm', 'public/data/terrain.json', 'src/terrain.ts', 'src/engineering301303Site.ts', 'src/livingScienceCourtyardSite.ts', 'src/educationParkingSite.ts', 'src/educationParkingTerrain.ts'];
const plan = { schemaVersion: 1, coordinateSystem: 'D: east/up/north; parent H once.', sourceHashes: Object.fromEntries(sourceFiles.map(p => [p, hash(p)])),
  stops, fixtures, deferred,
  evidence: { signalCrossingIds: ['node/13231900614', 'node/14241354281', 'way/1442039156'], signalPoleLocationsConfirmed: false, signalExistencePhotoConfirmed: true, streetLampLocationsConfirmed: false, streetLampTypePhotoConfirmed: true },
  summary: { routeStopCalls: calls.length, sourceStopIds: new Set(calls.map(c => c.stopId)).size, physicalGroups: groups.length, renderedStopSites: stops.length, deferredSites: deferred.length },
};
const target = new URL('public/data/transit-facilities.json', root);
fs.writeFileSync(target, JSON.stringify(plan, null, 2) + '\n');
console.log(JSON.stringify({ ...plan.summary, output: fileURLToPath(target), shelterTags: stops.reduce((m, s) => (m[s.shelter] = (m[s.shelter] ?? 0) + 1, m), {}) }, null, 2));
