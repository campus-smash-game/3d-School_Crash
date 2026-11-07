import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeCampusSupplements, readCampusSupplements } from './merge-campus-supplements.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(project, 'sources');
const targetDir = path.join(project, 'public/data');
await fs.mkdir(sourceDir, { recursive: true });
await fs.mkdir(targetDir, { recursive: true });
const sourceFile = path.join(sourceDir, 'campus.osm');
const endpoint = 'https://www.openstreetmap.org/api/0.6/map?bbox=126.944,37.437,126.973,37.475';
let xml;
try { xml = await fs.readFile(sourceFile, 'utf8'); }
catch {
  const legacy = path.join(targetDir, 'source-1.osm');
  try { xml = await fs.readFile(legacy, 'utf8'); }
  catch {
    const response = await fetch(endpoint, { headers: { 'User-Agent': 'SNUCampusPrototype/0.1' }, signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`OpenStreetMap API: ${response.status}`);
    xml = await response.text();
  }
  await fs.writeFile(sourceFile, xml);
}
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const attrs = (s) => Object.fromEntries([...s.matchAll(/([\w:]+)="([^"]*)"/g)].map(m => [m[1], decode(m[2])]));
const elements = [...xml.matchAll(/<(node|way|relation)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g)].map(m => ({
  type: m[1], ...attrs(m[2]),
  tags: Object.fromEntries([...((m[3] ?? '').matchAll(/<tag\b([^>]*?)\/>/g))].map(n => { const a = attrs(n[1]); return [a.k, a.v]; })),
  nodes: [...((m[3] ?? '').matchAll(/<nd\b([^>]*?)\/>/g))].map(n => attrs(n[1]).ref),
  members: [...((m[3] ?? '').matchAll(/<member\b([^>]*?)\/>/g))].map(n => attrs(n[1])),
}));
const byKey = new Map(elements.map(e => [`${e.type}/${e.id}`, e]));
const nodes = new Map(elements.filter(e => e.type === 'node').map(e => [e.id, e]));
const boundary = byKey.get('relation/11917142');
if (!boundary) throw new Error('The SNU campus boundary is absent from the response');
const boundaryWays = boundary.members.filter(m => m.type === 'way' && m.role === 'outer').map(m => byKey.get(`way/${m.ref}`)?.nodes).filter(Boolean);
const rings = [];
while (boundaryWays.length) {
  const ring = [...boundaryWays.shift()];
  while (ring[0] !== ring.at(-1)) {
    const next = boundaryWays.findIndex(w => w[0] === ring.at(-1) || w.at(-1) === ring.at(-1));
    if (next < 0) throw new Error('Campus boundary is incomplete');
    const way = [...boundaryWays.splice(next, 1)[0]];
    if (way[0] !== ring.at(-1)) way.reverse();
    ring.push(...way.slice(1));
  }
  rings.push(ring);
}
const origin = { lat: 37.4663683, lon: 126.948395075, source: 'https://www.openstreetmap.org/way/419542255' };
const longitudeScale = 111320 * Math.cos(origin.lat * Math.PI / 180);
const round = n => Math.round(n * 100) / 100;
const position = n => [round((Number(n.lon) - origin.lon) * longitudeScale), round((Number(n.lat) - origin.lat) * 111320)];
const pointForId = id => position(nodes.get(id));
const boundaryPoints = rings.map(ring => ring.map(pointForId));
function inside(p, polygon) {
  let contains = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) contains = !contains;
  }
  return contains;
}
const inCampus = p => boundaryPoints.some(ring => inside(p, ring));
const centroid = points => [points.reduce((n, p) => n + p[0], 0) / points.length, points.reduce((n, p) => n + p[1], 0) / points.length];
const wayPoints = e => e.nodes.filter(id => nodes.has(id)).map(pointForId);
const isClosed = points => points.length >= 4 && points[0][0] === points.at(-1)[0] && points[0][1] === points.at(-1)[1];
const area = points => Math.abs(points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
const buildings = [];
const buildingWayIds = new Set();
function addBuilding(e, points, holes = []) {
  if (!isClosed(points) || area(points) < 12 || !inCampus(centroid(points))) return;
  const t = e.tags;
  const knownLevels = Number(t['building:levels']) || null;
  const knownHeight = Number.parseFloat(t.height) || null;
  const levels = knownLevels || (t.building === 'dormitory' ? 7 : t.building === 'roof' ? 1 : t.building === 'greenhouse' ? 1 : t.building === 'garage' ? 1 : 4);
  const match = (t['addr:housename'] || '').match(/\((\d+(?:-\d+)?)\)/);
  buildings.push({ id: `${e.type}/${e.id}`, name: t['name:ko'] || t.name || '', ref: t.ref || match?.[1] || '', kind: t.building, points, holes, height: knownHeight || levels * 3.5, levels, heightEstimated: !knownHeight, levelsEstimated: !knownLevels, terrainElevation: Number(t.ele) || null });
}
for (const e of elements.filter(e => e.type === 'relation' && e.tags.building)) {
  const outer = e.members.filter(m => m.type === 'way' && m.role === 'outer').map(m => byKey.get(`way/${m.ref}`)).filter(Boolean);
  const inner = e.members.filter(m => m.type === 'way' && m.role === 'inner').map(m => byKey.get(`way/${m.ref}`)).filter(Boolean).map(wayPoints).filter(isClosed);
  for (const w of outer) { addBuilding(e, wayPoints(w), inner); buildingWayIds.add(w.id); }
}
for (const e of elements.filter(e => e.type === 'way' && e.tags.building && !buildingWayIds.has(e.id))) addBuilding(e, wayPoints(e));
const widths = { primary: 20, primary_link: 6, secondary: 14, secondary_link: 6, tertiary: 8, tertiary_link: 5, unclassified: 7, residential: 6, service: 5.5, living_street: 5, pedestrian: 5, footway: 2.5, path: 2, steps: 2, cycleway: 2.5, track: 3 };
const roads = [];
for (const e of elements.filter(e => e.type === 'way' && e.tags.highway)) {
  const t = e.tags; const all = e.nodes.filter(id => nodes.has(id));
  const allPoints = all.map(pointForId);
  // 정문 외부 교차로를 함께 표시하고, 경계를 넘는 도로는 인접 구간까지만 남긴다.
  const accepted = p => inCampus(p) || Math.hypot(p[0], p[1]) < 200;
  if (!allPoints.some(accepted)) continue;
  let run = [];
  const flush = () => {
    if (run.length < 2) { run = []; return; }
    const points = run.map(i => allPoints[i]);
    const kind = t.highway;
    const knownWidth = Number.parseFloat(t.width);
    const width = knownWidth || (Number(t.lanes) ? Number(t.lanes) * 3.2 : widths[kind] || 4);
    roads.push({ id: `way/${e.id}/${roads.length}`, name: t['name:ko'] || t.name || '', kind, points, nodeIds: run.map(i => all[i]), width, widthEstimated: !knownWidth, drivable: !['footway', 'pedestrian', 'path', 'steps', 'cycleway', 'track', 'bridleway', 'construction'].includes(kind), oneway: t.oneway === 'yes' || t.oneway === '1', access: t.access || '' });
    run = [];
  };
  for (let i = 0; i < allPoints.length; i++) {
    const nearby = accepted(allPoints[i]) || (i > 0 && accepted(allPoints[i - 1])) || (i + 1 < allPoints.length && accepted(allPoints[i + 1]));
    if (nearby) run.push(i); else flush();
  }
  flush();
}
const areas = [];
for (const e of elements.filter(e => e.type === 'way' && (e.tags.natural === 'water' || e.tags.leisure || e.tags.landuse))) {
  const points = wayPoints(e);
  if (!isClosed(points) || !inCampus(centroid(points))) continue;
  areas.push({ id: `way/${e.id}`, name: e.tags.name || '', kind: e.tags.natural === 'water' ? 'water' : e.tags.leisure || e.tags.landuse, sport: e.tags.sport || '', points });
}
const stops = elements.filter(e => e.type === 'node' && (e.tags.highway === 'bus_stop' || e.tags.public_transport === 'platform')).map(e => ({ id: `node/${e.id}`, name: e.tags.name || '', point: position(e) })).filter(e => inCampus(e.point) || Math.hypot(...e.point) < 200);
const allBoundary = boundaryPoints.flat();
const data = {
  origin,
  source: { provider: 'OpenStreetMap', attribution: '© OpenStreetMap contributors', license: 'ODbL 1.0', licenseUrl: 'https://www.openstreetmap.org/copyright', endpoint, boundary: 'https://www.openstreetmap.org/relation/11917142', fetchedAt: new Date().toISOString(), note: '건물 평면과 도로 좌표는 OSM 자료다. 높이와 층수, 도로 폭은 별도 확인값이 없으면 추정값으로 표시했다.' },
  bounds: { minX: Math.min(...allBoundary.map(p => p[0])), maxX: Math.max(...allBoundary.map(p => p[0])), minZ: Math.min(...allBoundary.map(p => p[1])), maxZ: Math.max(...allBoundary.map(p => p[1])) },
  boundary: boundaryPoints, buildings, roads, areas, stops,
};
const supplement = await readCampusSupplements(path.join(sourceDir, 'campus-supplemental-buildings.json'));
const merged = mergeCampusSupplements(data, supplement);
await fs.writeFile(path.join(targetDir, 'campus.json'), JSON.stringify(merged));
console.log(JSON.stringify({ origin, bounds: merged.bounds, buildings: merged.buildings.length, osmBuildings: buildings.length, supplementalBuildings: merged.source.supplemental?.count ?? 0, namedBuildings: merged.buildings.filter(b => b.name).length, taggedHeights: merged.buildings.filter(b => !b.heightEstimated).length, taggedLevels: merged.buildings.filter(b => !b.levelsEstimated).length, roads: roads.length, drivableRoads: roads.filter(r => r.drivable).length, areas: areas.length, stops: stops.length, landmarks: merged.buildings.filter(b => /도서관|학생회관|행정관|공학관|301|302|303/.test(b.name + ' ' + b.ref)).map(b => ({ name: b.name, ref: b.ref, point: centroid(b.points) })) }, null, 2));
