import { readFile } from 'node:fs/promises';
import { ShapeUtils, Vector2 } from 'three';

export const SUPPLEMENT_COORDINATE_SYSTEM = 'campus-local-east-north-meters';
const overlapLimit = .25; // 경계의 미세한 오차와 실제 중첩을 구분하는 면적(m²).
const epsilon = 1e-8;
const fail = message => { throw new Error(`Campus supplement: ${message}`); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const signedArea = ring => ring.reduce((sum, a, i) => {
  const b = ring[(i + 1) % ring.length]; return sum + a[0] * b[1] - b[0] * a[1];
}, 0) / 2;
const samePoint = (a, b) => a[0] === b[0] && a[1] === b[1];
const canonical = value => JSON.stringify(sortObject(value));
function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (record(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortObject(value[key])]));
  return value;
}
function onSegment(p, a, b) {
  return Math.abs(cross(a, b, p)) <= epsilon && p[0] >= Math.min(a[0], b[0]) - epsilon && p[0] <= Math.max(a[0], b[0]) + epsilon && p[1] >= Math.min(a[1], b[1]) - epsilon && p[1] <= Math.max(a[1], b[1]) + epsilon;
}
function segmentsMeet(a, b, c, d) {
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  return (abC * abD < -epsilon && cdA * cdB < -epsilon) || onSegment(c, a, b) || onSegment(d, a, b) || onSegment(a, c, d) || onSegment(b, c, d);
}
function inside(p, ring) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
}
function ringsMeet(a, b) {
  for (let i = 1; i < a.length; i++) for (let j = 1; j < b.length; j++) if (segmentsMeet(a[i - 1], a[i], b[j - 1], b[j])) return true;
  return false;
}
function validateRing(ring, label, bounds) {
  if (!Array.isArray(ring) || ring.length < 4 || !ring.every(p => Array.isArray(p) && p.length === 2 && p.every(finite))) fail(`${label}: a ring needs finite [x,z] points`);
  if (!samePoint(ring[0], ring.at(-1))) fail(`${label}: ring must be closed`);
  if (Math.abs(signedArea(ring)) < .01) fail(`${label}: ring has no usable area`);
  for (let i = 1; i < ring.length; i++) {
    if (samePoint(ring[i - 1], ring[i])) fail(`${label}: repeated adjacent point`);
    const p = ring[i];
    if (p[0] < bounds.minX || p[0] > bounds.maxX || p[1] < bounds.minZ || p[1] > bounds.maxZ) fail(`${label}: point outside campus bounds`);
    for (let j = i + 2; j < ring.length; j++) {
      if (i === 1 && j === ring.length - 1) continue;
      if (segmentsMeet(ring[i - 1], ring[i], ring[j - 1], ring[j])) fail(`${label}: self-intersecting ring`);
    }
  }
}
function validateBuilding(b, bounds) {
  if (!record(b) || typeof b.id !== 'string' || !/^supplemental\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(b.id)) fail('building ID must use the supplemental/ namespace');
  for (const key of ['name', 'ref', 'kind']) if (typeof b[key] !== 'string' || !b[key].trim()) fail(`${b.id}: missing ${key}`);
  if (!finite(b.height) || b.height <= 0 || !Number.isInteger(b.levels) || b.levels < 1) fail(`${b.id}: positive height and integer levels are required`);
  for (const key of ['heightEstimated', 'levelsEstimated', 'terrainPad']) if (typeof b[key] !== 'boolean') fail(`${b.id}: ${key} must be explicit`);
  if (b.footprintEstimated !== true) fail(`${b.id}: footprintEstimated must be true`);
  if (b.terrainCut !== undefined) {
    const cut = b.terrainCut;
    if (!record(cut) || b.terrainPad !== false) fail(`${b.id}: terrainCut requires an object and terrainPad:false`);
    if (!finite(cut.level) || !finite(cut.apron) || cut.apron < 0 || !finite(cut.blend) || cut.blend <= 0) fail(`${b.id}: terrainCut needs finite level, non-negative apron and positive blend`);
    if (!Array.isArray(cut.protectedCorridors)) fail(`${b.id}: terrainCut protectedCorridors must be explicit`);
    for (const corridor of cut.protectedCorridors) {
      if (!record(corridor) || !finite(corridor.width) || corridor.width <= 0 || !Array.isArray(corridor.points) || corridor.points.length < 2 || !corridor.points.every(p => Array.isArray(p) && p.length === 2 && p.every(finite))) fail(`${b.id}: terrainCut corridor needs positive width and finite [x,z] points`);
      if (!corridor.points.some((p, i) => i && !samePoint(p, corridor.points[i - 1]))) fail(`${b.id}: terrainCut corridor has no usable length`);
    }
  }
  if (!Array.isArray(b.sources) || !b.sources.length) fail(`${b.id}: sources are required`);
  for (const source of b.sources) {
    if (!record(source) || typeof source.url !== 'string') fail(`${b.id}: each source needs a URL`);
    let url;
    try { url = new URL(source.url); } catch { fail(`${b.id}: invalid source URL`); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) fail(`${b.id}: source URL must be public HTTP(S)`);
  }
  validateRing(b.points, `${b.id} outer`, bounds);
  if (b.holes !== undefined && !Array.isArray(b.holes)) fail(`${b.id}: holes must be an array`);
  for (const [i, hole] of (b.holes ?? []).entries()) {
    validateRing(hole, `${b.id} hole ${i}`, bounds);
    if (!hole.every(p => inside(p, b.points)) || ringsMeet(hole, b.points)) fail(`${b.id}: hole must be strictly inside its outer ring`);
    for (const other of b.holes.slice(0, i)) if (ringsMeet(hole, other) || inside(hole[0], other) || inside(other[0], hole)) fail(`${b.id}: holes overlap or nest`);
  }
}
function polygonTriangles(b) {
  const outer = b.points.slice(0, -1).map(p => new Vector2(...p));
  const holes = (b.holes ?? []).map(ring => ring.slice(0, -1).map(p => new Vector2(...p)));
  const vertices = [...outer, ...holes.flat()];
  return ShapeUtils.triangulateShape(outer, holes).map(face => face.map(i => [vertices[i].x, vertices[i].y]));
}
function triangleOverlap(a, b) {
  let polygon = a;
  const sign = Math.sign(signedArea(b));
  for (let i = 0; i < 3 && polygon.length; i++) {
    const p = b[i], q = b[(i + 1) % 3], output = [];
    for (let j = 0; j < polygon.length; j++) {
      const start = polygon[j], end = polygon[(j + 1) % polygon.length];
      const ds = sign * cross(p, q, start), de = sign * cross(p, q, end);
      if (ds >= -epsilon) output.push(start);
      if ((ds >= -epsilon) !== (de >= -epsilon)) {
        const t = ds / (ds - de); output.push([start[0] + t * (end[0] - start[0]), start[1] + t * (end[1] - start[1])]);
      }
    }
    polygon = output;
  }
  return polygon.length < 3 ? 0 : Math.abs(signedArea(polygon));
}
function boundsOf(b) {
  const xs = b.points.map(p => p[0]), zs = b.points.map(p => p[1]);
  return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
}
function overlaps(a, b) {
  const aa = boundsOf(a), bb = boundsOf(b);
  if (aa[2] <= bb[0] || bb[2] <= aa[0] || aa[3] <= bb[1] || bb[3] <= aa[1]) return 0;
  let area = 0;
  const bt = polygonTriangles(b);
  for (const at of polygonTriangles(a)) for (const triangle of bt) area += triangleOverlap(at, triangle);
  return area;
}

/** Missing optional files are absent data; malformed JSON and other I/O failures propagate. */
export async function readCampusSupplements(file) {
  let text;
  try { text = await readFile(file, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  return JSON.parse(text);
}

/** Return an unchanged base when absent, or a new dataset with explicitly sourced additions. */
export function mergeCampusSupplements(data, supplement = null) {
  if (supplement === null || supplement === undefined) return data;
  if (!record(supplement) || supplement.schemaVersion !== 1) fail('schemaVersion must be 1');
  if (supplement.coordinateSystem !== SUPPLEMENT_COORDINATE_SYSTEM) fail('coordinateSystem does not match local east/north metres');
  if (!record(supplement.origin) || !['lat', 'lon'].every(key => finite(supplement.origin[key]) && supplement.origin[key] === data.origin?.[key])) fail('origin does not match the OSM dataset');
  if (!Array.isArray(supplement.buildings)) fail('buildings must be an array');
  if (!Array.isArray(data.buildings) || !record(data.bounds) || !['minX', 'maxX', 'minZ', 'maxZ'].every(key => finite(data.bounds[key]))) fail('base building data and bounds are required');
  if (data.source?.provider !== 'OpenStreetMap') fail('base source provider must remain OpenStreetMap');
  const incoming = new Set(), existing = new Map(data.buildings.map(b => [b.id, b]));
  // OSM multipolygon의 outer들은 같은 relation ID를 가질 수 있다. 기존 행은 보존한다.
  const existingSupplementIds = data.buildings.filter(b => b.id.startsWith('supplemental/')).map(b => b.id);
  if (new Set(existingSupplementIds).size !== existingSupplementIds.length) fail('base dataset contains duplicate supplemental IDs');
  for (const b of supplement.buildings) {
    validateBuilding(b, data.bounds);
    if (incoming.has(b.id)) fail(`duplicate supplemental ID ${b.id}`);
    incoming.add(b.id);
  }
  if (!supplement.buildings.length) return data;
  const owned = new Set(data.source.supplemental?.buildingIds ?? []), additions = [];
  for (const b of supplement.buildings) {
    const previous = existing.get(b.id);
    if (previous) {
      if (!owned.has(b.id) || canonical(previous) !== canonical(b)) fail(`cannot overwrite existing building ${b.id}`);
    }
    for (const other of [...data.buildings, ...additions]) {
      if (other.id === b.id) continue;
      if (String(other.ref ?? '').trim().toLowerCase() === b.ref.trim().toLowerCase()) fail(`${b.id}: duplicate building ref ${b.ref} (${other.id})`);
      const area = overlaps(b, other);
      if (area > overlapLimit) fail(`${b.id}: footprint overlaps ${other.id} by ${area.toFixed(3)} m2`);
    }
    if (!previous) additions.push(b);
  }
  if (!additions.length) return data;
  const buildings = [...data.buildings, ...structuredClone(additions)];
  const ids = [...owned, ...additions.map(b => b.id)].sort();
  const allSources = ids.flatMap(id => buildings.find(b => b.id === id)?.sources ?? []);
  const sources = [...new Map(allSources.map(source => [canonical(source), structuredClone(source)])).values()];
  return {
    ...data, buildings,
    source: {
      ...data.source,
      osmNote: data.source.osmNote ?? data.source.note,
      note: '기본 건물과 도로, 경계는 OpenStreetMap 자료다. supplemental/ 건물은 별도 출처를 참고한 근사 외곽이며 원본 OSM에 포함되지 않는다.',
      supplemental: {
        provider: 'Project-authored approximate building footprints', schemaVersion: 1,
        coordinateSystem: SUPPLEMENT_COORDINATE_SYSTEM, origin: { lat: data.origin.lat, lon: data.origin.lon },
        count: ids.length, buildingIds: ids, sources,
        note: '각 건물의 footprintEstimated와 sources에서 근사 여부와 근거를 확인할 수 있다. 공식 실측 외곽을 뜻하지 않는다.',
      },
    },
  };
}
