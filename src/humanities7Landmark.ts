import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import type { CampusBuilding } from './fullCampus';
import { humanities23Frame } from './humanities23Site';

type XZ = [number, number];
type Frame = ReturnType<typeof humanities23Frame>;
type Proxy = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
export const HUMANITIES7_ID = 'way/238937021';

/** 공식 캠퍼스 사진의 전면과 지도상의 외곽을 결합한다. 높이와 시설 치수는 근사다. */
export function createHumanities7Landmark(scene: THREE.Scene, building: CampusBuilding, heightAt: (x: number, z: number) => number, blockedPaving: XZ[][] = []) {
  const shell = new THREE.Group(); shell.name = 'landmark/humanities7';
  Object.assign(shell.userData, { role: 'building-shell', buildingId: building.id, landmark: 'humanities7', mappedOutline: building.points }); scene.add(shell);
  const distant = new THREE.Group(); distant.name = `${building.id}:humanities7-distant`; distant.visible = false;
  Object.assign(distant.userData, { role: 'distant-building', buildingId: building.id }); scene.add(distant);
  const ring = building.points.slice(0, -1).filter((_, i) => i !== 4), frames = ring.map((p, i) => humanities23Frame(p, ring[(i + 1) % ring.length]));
  const base = heightAt(ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length);
  const breakables: BreakableSpec[] = [], pavementMasks: { component: string; polygon: XZ[] }[] = [];
  const batches = [false, true].map(glass => ({ glass, positions: [] as number[], colors: [] as number[], parts: [] as { proxy: Proxy; start: number; end: number; original: Float32Array; colors: Float32Array; base: THREE.Color; color: number; shown: boolean }[] }));
  const at = (f: Frame, s: number, y: number, n = 0) => { const p = f.point(s, n); return new THREE.Vector3(p[0], y, p[1]); };
  function part(name: string, vertices: THREE.Vector3[], color: number, material: BreakableSpec['material'] = 'stone', owner?: Proxy, flat = false) {
    const bounds = new THREE.Box3().setFromPoints(vertices), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const g = flat ? new THREE.BufferGeometry() : new ConvexGeometry(vertices.map(p => p.clone().sub(center)));
    if (flat) { const values: number[] = []; for (let i = 1; i + 1 < vertices.length; i++) for (const p of [vertices[0], vertices[i], vertices[i + 1]]) values.push(...p.clone().sub(center).toArray()); g.setAttribute('position', new THREE.Float32BufferAttribute(values, 3)); }
    const attr = g.attributes.position, proxy = owner ?? new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color }));
    if (!owner) { proxy.position.copy(center); proxy.updateMatrixWorld(true); Object.assign(proxy.userData, { buildingId: building.id, component: name, renderProxy: true, convex: true }); breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attr.array), toughness: material === 'glass' ? 2 : 8, material, label: '7동과 안마당' }); }
    const b = batches[material === 'glass' ? 1 : 0], start = b.positions.length, tint = new THREE.Color(color);
    for (let i = 0; i < attr.count; i++) { b.positions.push(attr.getX(i) + center.x, attr.getY(i) + center.y, attr.getZ(i) + center.z); b.colors.push(tint.r, tint.g, tint.b); }
    b.parts.push({ proxy, start, end: b.positions.length, original: Float32Array.from(b.positions.slice(start)), colors: Float32Array.from(b.colors.slice(start)), base: proxy.material.color.clone(), color: proxy.material.color.getHex(), shown: true });
    if (owner) g.dispose(); return proxy;
  }
  function box(name: string, f: Frame, s0: number, s1: number, n0: number, n1: number, y0: number, y1: number, color = 0xd9dcd4, material: BreakableSpec['material'] = 'stone', owner?: Proxy) {
    const v: THREE.Vector3[] = []; for (const s of [s0, s1]) for (const n of [n0, n1]) for (const y of [y0, y1]) v.push(at(f, s, y, n)); return part(name, v, color, material, owner);
  }
  function beam(name: string, a: THREE.Vector3, b: THREE.Vector3, radius: number, color: number, owner?: Proxy) {
    const d = b.clone().sub(a), g = new THREE.CylinderGeometry(radius, radius, d.length(), 8), rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), center = a.clone().add(b).multiplyScalar(.5), p = g.attributes.position;
    const result = part(name, Array.from({ length: p.count }, (_, i) => new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).applyQuaternion(rotation).add(center)), color, 'metal', owner); g.dispose(); return result;
  }
  function facet(name: string, f: Frame, s0: number, s1: number, y0: number, y1: number, n: number, color: number, owner: Proxy) { part(name, [at(f, s0, y0, n), at(f, s1, y0, n), at(f, s1, y1, n), at(f, s0, y1, n)], color, 'stone', owner, true); }
  const terrain = scene.getObjectByName('campus-terrain') as THREE.Mesh<THREE.BufferGeometry>, tp = terrain.geometry.attributes.position, ti = terrain.geometry.index;
  const terrainTriangles: THREE.Vector3[][] = [];
  for (let i = 0; i < (ti?.count ?? tp.count); i += 3) { const t = [0, 1, 2].map(j => { const k = ti ? ti.getX(i + j) : i + j; return new THREE.Vector3(tp.getX(k), tp.getY(k), tp.getZ(k)); }); if (Math.max(...t.map(v => v.x)) > 470 && Math.min(...t.map(v => v.x)) < 565 && Math.max(...t.map(v => v.z)) > -740 && Math.min(...t.map(v => v.z)) < -592) terrainTriangles.push(t); }
  function ground(p: XZ) { const [x, z] = p; for (const [a, b, c] of terrainTriangles) { const det = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x), u = ((x - a.x) * (c.z - a.z) - (z - a.z) * (c.x - a.x)) / det, v = ((b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x)) / det; if (u >= -1e-7 && v >= -1e-7 && u + v <= 1.0000001) return a.y + u * (b.y - a.y) + v * (c.y - a.y); } throw Error('Missing humanities 7 terrain'); }
  function clip(poly: THREE.Vector3[], distance: (p: THREE.Vector3) => number) { const out: THREE.Vector3[] = []; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], da = distance(a), db = distance(b); if (da >= -1e-8) out.push(a); if ((da >= -1e-8) !== (db >= -1e-8)) out.push(a.clone().lerp(b, da / (da - db))); } return out; }
  const planes = (poly: XZ[]) => { const sign = Math.sign(poly.reduce((n, a, i) => { const b = poly[(i + 1) % poly.length]; return n + a[0] * b[1] - b[0] * a[1]; }, 0)); return poly.map((a, i) => { const b = poly[(i + 1) % poly.length]; return (p: THREE.Vector3) => sign * ((b[0] - a[0]) * (p.z - a[1]) - (b[1] - a[1]) * (p.x - a[0])); }); };
  const area = (p: THREE.Vector3[]) => Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a.x * b.z - b.x * a.z; }, 0));
  function subtract(poly: THREE.Vector3[], mask: XZ[]) { const ps = planes(mask); if (area(ps.reduce((p, fn) => clip(p, fn), poly)) < 1e-8) return [poly]; let rest = poly; const out: THREE.Vector3[][] = []; for (const fn of ps) { const p = clip(rest, v => -fn(v)); if (p.length >= 3 && area(p) > 1e-8) out.push(p); rest = clip(rest, fn); } return out; }
  const masks = (f: Frame, s0: number, s1: number, n0: number, n1: number) => [f.point(s0, n0), f.point(s1, n0), f.point(s1, n1), f.point(s0, n1)];
  const footprints = THREE.ShapeUtils.triangulateShape(ring.map(p => new THREE.Vector2(...p)), []).map(tri => tri.map(i => ring[i]));
  function paving(f: Frame, s0: number, s1: number, n0: number, n1: number, component: string, lift?: (p: THREE.Vector3) => number) {
    const excluded = [...footprints, ...blockedPaving, ...pavementMasks.map(m => m.polygon)];
    for (let s = s0; s < s1 - .001; s += 2.6) for (let n = n0; n < n1 - .001; n += 2.6) {
      const ss = Math.min(s1, s + 2.6), nn = Math.min(n1, n + 2.6), ps = planes(masks(f, s, ss, n, nn));
      for (const tri of terrainTriangles) { let pieces = [ps.reduce((p, fn) => clip(p, fn), tri)].filter(p => p.length >= 3 && area(p) > 1e-8); for (const mask of excluded) pieces = pieces.flatMap(p => subtract(p, mask));
        for (const poly of pieces) { const top = poly.map(v => v.clone().add(new THREE.Vector3(0, .045 + (lift?.(v) ?? 0), 0))), owner = part(component, [...top, ...top.map(v => v.clone().add(new THREE.Vector3(0, -.12, 0)))], (Math.floor(s / 2.6) + Math.floor(n / 2.6)) % 3 === 0 ? 0x9e9c92 : 0xb5b5ab); pavementMasks.push({ component, polygon: poly.map(v => [v.x, v.z]) });
          for (const axis of ['s', 'n'] as const) for (let t = axis === 's' ? s + .25 : n + .5; t < (axis === 's' ? ss : nn); t += axis === 's' ? .25 : .5) { let joint = clip(poly, v => f.local([v.x, v.z])[axis] - t); joint = clip(joint, v => t + .009 - f.local([v.x, v.z])[axis]); if (joint.length >= 3 && area(joint) > 1e-8) part('paving-joint', joint.map(v => v.clone().add(new THREE.Vector3(0, .047 + (lift?.(v) ?? 0), 0))), 0x81867f, 'stone', owner, true); }
        }
      }
    }
  }
  const front = humanities23Frame([498.59, -709.08], [516.13, -721.4]);
  const portal = { s0: 1.2, s1: 10.5, top: 0 }, entryS = 5.85;
  const floor = Math.max(...masks(front, portal.s0, portal.s1, -3.8, 6.9).map(ground)) + .28, roof = floor + 10.8;
  portal.top = floor + 3.15;
  const stepSamples: { point: XZ; top: number }[] = [];
  // 공식 지도 사진에 보이는 공사 전 남쪽 끝벽과 동쪽 긴 면을 반영한다.
  for (const [edge, f] of frames.entries()) {
    const isFront = edge === 3, observed = isFront || edge === 4 || edge === 5;
    const sections = Math.ceil(f.length / 3.8), bay = f.length / sections;
    const limits = isFront ? [0, 1.2, 8.8, 10.5, 12, f.length] : Array.from({ length: sections + 1 }, (_, i) => bay * i);
    for (let level = 0; level < 3; level++) for (let j = 1; j < limits.length; j++) {
      const s0 = limits[j - 1], s1 = limits[j], y = floor + level * 3.5, bottom = level ? y : Math.min(floor - .4, ground(f.point((s0 + s1) / 2)) - .15);
      const inEntry = isFront && level === 0 && s0 >= portal.s0 && s1 <= portal.s1;
      const recess = isFront && level > 0 && s0 >= 8.8 && s1 <= 12;
      if (inEntry) continue;
      const wall = box('brick-facade-bay', f, s0, s1, recess ? 1.6 : 0, recess ? 1.85 : .25, bottom, y + 3.5, observed ? 0x65564b : 0x777067);
      if (observed) for (let h = Math.max(bottom, floor); h < y + 3.48; h += .22) {
        facet('brick-horizontal-joint', f, s0 + .01, s1 - .01, h, h + .01, recess ? 1.59 : -.009, 0xa39a87, wall);
        for (let s = s0 + .31 + (Math.round((h - floor) / .22) % 2) * .3; s < s1 - .02; s += .62) facet('brick-vertical-joint', f, s, Math.min(s1 - .01, s + .01), h, Math.min(y + 3.5, h + .22), recess ? 1.585 : -.012, 0xa39a87, wall);
      }
      if (!isFront && s1 - s0 > 2.1) {
        const a = s0 + .48, b = s1 - .48, low = y + .7, high = y + 2.7;
        facet('observed-window', f, a, b, low, high, -.025, 0x547570, wall);
        for (const s of [a, (a + b) / 2, b]) box('window-frame', f, s - .035, s + .035, -.10, -.02, low, high, 0xb8beb6, 'metal', wall);
        for (const h of [low, high]) box('window-frame', f, a, b, -.10, -.02, h - .035, h + .035, 0xb8beb6, 'metal', wall);
        if (observed && level === 0) for (let s = a; s < b; s += .19) box('ground-window-grille', f, s, s + .025, -.15, -.1, low, high, 0xa2aaa1, 'metal', wall);
        if (observed && level === 1 && j % 3 === 1) { const ac = box('air-conditioner', f, b - .85, b, -.55, -.12, y + .03, y + .65, 0xc7c4b2, 'metal', wall); for (let h = y + .1; h < y + .6; h += .08) facet('air-conditioner-louvre', f, b - .75, b - .1, h, h + .018, -.56, 0x676e66, ac); }
      }
    }
    for (let level = 1; level <= 3; level++) box('white-floor-band', f, 0, f.length, -.24, .36, floor + level * 3.5 - .3, floor + level * 3.5 + .12, 0xd8d5bf);
    if (isFront) {
      for (const s of [0, 8.8, 12, f.length]) box('white-front-pier', f, s - .2, s + .2, -.28, .38, floor - .25, roof, 0xd8d5bf);
      for (let level = 1; level < 3; level++) {
        const y = floor + level * 3.5;
        box('recess-balcony-floor', f, 8.8, 12, -.1, 1.8, y - .18, y, 0xb2b09f);
        box('recess-open-balustrade', f, 8.8, 12, -.22, .05, y + .8, y + 1.02, 0xd7d4bd);
        for (const s of [8.9, 10.4, 11.9]) box('recess-balustrade-post', f, s - .08, s + .08, -.22, .05, y, y + 1.02, 0xd7d4bd);
      }
    }
    if (observed) {
      box('roof-parapet-bottom', f, 0, f.length, -.5, .3, roof - .3, roof, 0xc7c7b5);
      box('roof-open-parapet-rail', f, 0, f.length, -.48, -.1, roof + .6, roof + .83, 0xc7c7b5);
      for (let s = 0; s < f.length; s += 2.8) box('roof-parapet-post', f, s, Math.min(f.length, s + .18), -.48, -.1, roof, roof + .7, 0xc7c7b5);
    }
  }
  for (const tri of footprints) { const top = tri.map(([x, z]) => new THREE.Vector3(x, roof, z)); part('footprint-roof', [...top, ...top.map(v => v.clone().add(new THREE.Vector3(0, -.2, 0)))], 0x8c9589); }
  box('entry-floor', front, portal.s0, portal.s1, -.6, 5.2, floor - .35, floor, 0xa66c52);
  box('entry-ceiling', front, portal.s0, portal.s1, -.5, 5.2, portal.top - .2, portal.top, 0xbbbfae);
  for (const s of [portal.s0, portal.s1]) box('entry-side-wall', front, s - .1, s + .1, 0, 5.2, floor, portal.top, 0x73624e);
  box('vestibule-floor', front, entryS - 1.3, entryS + 1.3, 5.2, 7.4, floor - .2, floor, 0xaaa992);
  box('vestibule-back', front, entryS - 1.4, entryS + 1.4, 7.3, 7.5, floor, floor + 2.9, 0xb8b7a5);
  for (const s of [entryS - 1.35, entryS + 1.35]) box('vestibule-side', front, s - .08, s + .08, 5.1, 7.5, floor, floor + 2.9, 0xb8b7a5);
  for (const [a, b] of [[portal.s0, entryS - 1.25], [entryS + 1.25, portal.s1]]) box('entry-glass-panel', front, a, b, 5.05, 5.15, floor, floor + 2.9, 0x648077, 'glass');
  for (const s of [portal.s0, entryS - 1.28, entryS + 1.28, portal.s1]) box('entry-metal-frame', front, s - .035, s + .035, 5, 5.2, floor, floor + 2.9, 0xb4b9ae, 'metal');
  for (const s of [entryS - 1.22, entryS + 1.22]) { const door = box('open-entry-door', front, s - .04, s + .04, 5.1, 6.2, floor, floor + 2.8, 0x66847e, 'glass'); beam('entry-door-handle', at(front, s, floor + .85, 5.9), at(front, s, floor + 1.6, 5.9), .022, 0xd1d2c1, door); }
  const low = Math.max(...masks(front, portal.s0, portal.s1, -3.8, -3.1).map(ground)) + .045;
  const count = Math.max(2, Math.ceil((floor - low) / .16));
  for (let k = 0; k < count; k++) { const n0 = -3.8 + 3.2 * k / count, n1 = -3.8 + 3.2 * (k + 1) / count, top = low + (floor - low) * (k + 1) / count; box('entry-step', front, portal.s0, portal.s1, n0, n1, low - .2, top, 0xc0bba7); stepSamples.push({ point: front.point(entryS, (n0 + n1) / 2), top }); }
  pavementMasks.push({ component: 'entry-steps', polygon: masks(front, portal.s0, portal.s1, -3.8, 7.6) });
  paving(front, 0, 11.5, -8.3, -.6, 'entry-court-paving', p => { const q = front.local([p.x, p.z]); return Math.max(0, Math.min(1, (q.n + 8.3) / 4.5)) * Math.max(0, low - ground(front.point(q.s, -3.8)) - .045); });
  const entryRoute = [front.point(entryS, -8.2), front.point(entryS, -4), front.point(entryS, 1), front.point(entryS, 4.5), front.point(entryS, 6.5)];

  function handrail(f: Frame, n: number, y0: number, y1: number, concrete = false) {
    const sections = Math.ceil(f.length / 1.6), ys = (s: number) => y0 + (y1 - y0) * s / f.length;
    for (let k = 0; k <= sections; k++) { const s = k / sections * f.length, y = ys(s); box(concrete ? 'concrete-balustrade-post' : 'black-stair-post', f, s - (concrete ? .13 : .035), s + (concrete ? .13 : .035), n - .07, n + .07, y, y + .98, concrete ? 0xbebcaa : 0x313b3c, concrete ? 'stone' : 'metal'); }
    for (const h of concrete ? [.12, .9] : [.3, .64, .95]) beam(concrete ? 'concrete-balustrade-rail' : 'black-stair-rail', at(f, 0, y0 + h, n), at(f, f.length, y1 + h, n), concrete ? .12 : .035, concrete ? 0xbebcaa : 0x313b3c);
  }
  const outside = humanities23Frame(front.point(13.2, -2.3), front.point(front.length + 1.3, -2.3));
  const stairLow = Math.max(...masks(outside, 0, .5, -1.25, 1.25).map(ground)) + .045, stairHigh = Math.max(...masks(outside, outside.length - .5, outside.length, -1.25, 1.25).map(ground)) + .12;
  const outerCount = Math.max(2, Math.ceil((stairHigh - stairLow) / .16));
  for (let k = 0; k < outerCount; k++) { const a = outside.length * k / outerCount, b = outside.length * (k + 1) / outerCount, top = Math.max(stairLow + (stairHigh - stairLow) * (k + 1) / outerCount, ...masks(outside, a, b, -1.25, 1.25).map(p => ground(p) + .045)); box('outer-entry-stair', outside, a, b, -1.25, 1.25, Math.min(...masks(outside, a, b, -1.25, 1.25).map(ground)) - .15, top, 0xb9b5a0); stepSamples.push({ point: outside.point((a + b) / 2), top }); }
  pavementMasks.push({ component: 'outer-entry-stair', polygon: masks(outside, 0, outside.length, -1.25, 1.25) });
  handrail(outside, -1.3, stairLow, stairHigh, true); handrail(outside, 1.3, stairLow, stairHigh, true);
  for (const start of [true, false]) paving(outside, start ? -2 : outside.length, start ? 0 : outside.length + 2, -1.25, 1.25, 'outer-stair-apron', p => { const q = outside.local([p.x, p.z]), weight = start ? (q.s + 2) / 2 : (outside.length + 2 - q.s) / 2, y = start ? stairLow : stairHigh; return Math.max(0, Math.min(1, weight)) * Math.max(0, y - ground(outside.point(start ? 0 : outside.length, q.n)) - .045); });
  const outerRoute = [outside.point(-2), outside.point(0), outside.point(outside.length), outside.point(outside.length + 2)];

  // 5동 옆 계단과 안마당은 바닥 아래를 채운 고정 형태로 연결한다. 원본 표고 자료는 보존한다.
  const stair = humanities23Frame([480.92, -681.09], [486, -671.75]), stairBottom = Math.max(...masks(stair, 0, .5, -1.55, 1.55).map(ground)) + .045;
  const courtHeight = (p: XZ) => 44.4 + .014 * (p[1] + 671.75) + .012 * (p[0] - 486), stairTop = courtHeight(stair.point(stair.length));
  const stairCount = Math.ceil((stairTop - stairBottom) / .17);
  for (let k = 0; k < stairCount; k++) { const a = stair.length * k / stairCount, b = stair.length * (k + 1) / stairCount, top = stairBottom + (stairTop - stairBottom) * (k + 1) / stairCount, owner = box('north-court-stair', stair, a, b, -1.55, 1.55, Math.min(...masks(stair, a, b, -1.55, 1.55).map(ground)) - .15, top, 0xbdb8a7); box('north-stair-nosing', stair, a, a + .025, -1.55, 1.55, top, top + .003, 0xd4cfbc, 'stone', owner); stepSamples.push({ point: stair.point((a + b) / 2), top }); }
  const stairMask = masks(stair, -2.5, stair.length, -1.6, 1.6); pavementMasks.push({ component: 'north-court-stair', polygon: stairMask });
  handrail(stair, -1.6, stairBottom, stairTop); handrail(stair, 1.6, stairBottom, stairTop);
  const courtPolygon: XZ[] = [[482.6, -671.8], [487.4, -674.1], [503.82, -684.55], [510.45, -688.5], [539.5, -640.2], [516.6, -624.1], [511.65, -623.9], [486.8, -664.8]];
  function platform(polygon: XZ[], name: string, topAt: (p: XZ) => number, color: number, exclusions: XZ[][] = [], joints = true) {
    const triangles = THREE.ShapeUtils.triangulateShape(polygon.map(p => new THREE.Vector2(...p)), []);
    for (const ids of triangles) for (const original of terrainTriangles) {
      const ps = planes(ids.map(i => polygon[i])); let pieces = [ps.reduce((p, fn) => clip(p, fn), original)].filter(p => p.length >= 3 && area(p) > 1e-8);
      for (const mask of exclusions) pieces = pieces.flatMap(p => subtract(p, mask));
      for (const poly of pieces) {
        const tops = poly.map(p => new THREE.Vector3(p.x, Math.max(p.y + .045, topAt([p.x, p.z])), p.z)), owner = part(name, [...tops, ...poly.map(p => p.clone().add(new THREE.Vector3(0, -.15, 0)))], color);
        pavementMasks.push({ component: name, polygon: poly.map(p => [p.x, p.z]) });
        if (joints) for (const key of ['x', 'z'] as const) for (let v = Math.floor(Math.min(...poly.map(p => p[key])) / .6) * .6; v < Math.max(...poly.map(p => p[key])); v += .6) { const joint = clip(clip(poly, p => p[key] - v), p => v + .012 - p[key]); if (joint.length >= 3 && area(joint) > 1e-8) part('court-paving-joint', joint.map(p => new THREE.Vector3(p.x, Math.max(p.y + .047, topAt([p.x, p.z]) + .002), p.z)), 0x848b7c, 'stone', owner, true); }
      }
    }
  }
  platform(courtPolygon, 'raised-court-floor', courtHeight, 0xa8afa0, [stairMask]);
  platform(masks(stair, stair.length, stair.length + 2, -1.55, 1.55), 'north-stair-landing', courtHeight, 0xbdb8a7);
  platform(masks(stair, -2.5, 0, -1.55, 1.55), 'north-stair-apron', p => { const q = stair.local(p); return ground(p) + .045 + Math.max(0, Math.min(1, (q.s + 2.5) / 2.5)) * Math.max(0, stairBottom - ground(stair.point(0, q.n)) - .045); }, 0xb5b6a9);
  const northExit: XZ[] = [[513, -625.4], [520.1, -613], [523, -608], [526.82, -602.07]], exitLength = northExit.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - northExit[i][0], p[1] - northExit[i][1]), 0), exitTop = courtHeight(northExit[0]), exitLow = ground(northExit.at(-1)!) + .045;
  let walked = 0;
  for (let i = 1; i < northExit.length; i++) { const f = humanities23Frame(northExit[i - 1], northExit[i]), offset = walked; platform(masks(f, 0, f.length, -1.3, 1.3), 'north-court-exit', p => exitTop + (exitLow - exitTop) * (offset + f.local(p).s) / exitLength, 0xa8afa0); walked += f.length; }
  const courtRoute = [stair.point(-2.5), stair.point(0), stair.point(stair.length), [489, -667] as XZ, ...northExit];
  const garden = humanities23Frame([498.5, -670], [520, -635]);
  platform(masks(garden, 0, garden.length, -3.2, 3.2), 'inner-garden-soil', p => courtHeight(p) + .12, 0x6c774b, [], false);
  for (let s = 3; s < garden.length; s += 8) for (const n of [-1.8, 1.8]) { const p = garden.point(s, n), y = courtHeight(p) + .12, trunk = beam('inner-court-tree', at(garden, s, y, n), at(garden, s + .2, y + 5, n), .16, 0x6a5b43); for (let k = 0; k < 5; k++) { const angle = k * 2.4, end = at(garden, s + Math.cos(angle) * 1.6, y + 4.8 + k * .3, n + Math.sin(angle) * 1.6); beam('inner-court-branch', at(garden, s, y + 2.7, n), end, .04, 0x6a5b43, trunk); } }

  const east = humanities23Frame([516.13, -721.4], [557.47, -651.69]);
  for (const s of [3, 12, 22]) { const n = -3.2, p = east.point(s, n), y = ground(p), trunk = beam('roadside-tree', at(east, s, y, n), at(east, s, y + 7, n), .22, 0x65553f); box('green-tree-wrap', east, s - .3, s + .3, n - .3, n + .3, y, y + .8, 0x426354, 'wood', trunk); for (let k = 0; k < 6; k++) { const a = k * 2.4; beam('roadside-tree-branch', at(east, s, y + 3.8, n), at(east, s + Math.cos(a) * 2.5, y + 6.8 + k * .2, n + Math.sin(a) * 2.5), .05, 0x65553f, trunk); } }
  for (let s = 6; s <= 20; s += 3.5) { const p = front.point(s, -7.6), y = ground(p) + .045; beam('yellow-bollard', at(front, s, y, -7.6), at(front, s, y + .95, -7.6), .095, 0xe4b32b); }
  for (let s = 5.5; s < 11; s += .8) { const n = -1.6, y = ground(east.point(s, n)); const rack = beam('cycle-rack', at(east, s, y, n - .4), at(east, s, y + .65, n - .4), .035, 0xb1bcb7); beam('cycle-rack-top', at(east, s, y + .65, n - .4), at(east, s, y + .65, n + .4), .035, 0xb1bcb7, rack); beam('cycle-rack-leg', at(east, s, y + .65, n + .4), at(east, s, y, n + .4), .035, 0xb1bcb7, rack); }

  const signs: { mesh: THREE.Mesh; owner: Proxy }[] = [];
  function sign(text: string, s: number, y: number, width: number, height: number, background: string, color: string, f = front, n = -.3) {
    const owner = box('observed-sign', f, s - width / 2, s + width / 2, n, n + .1, y, y + height, Number.parseInt(background.slice(1), 16), 'metal');
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = Math.round(512 * height / width); const ctx = canvas.getContext('2d')!; ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = color; ctx.font = `600 ${canvas.height * .78}px "Malgun Gothic", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width * .92);
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; const a = f.point(0), b = f.point(0, -1), normal = new THREE.Vector3(b[0] - a[0], 0, b[1] - a[1]), right = new THREE.Vector3(normal.z, 0, -normal.x), mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height).scale(-1, 1, 1), new THREE.MeshStandardMaterial({ map, side: THREE.DoubleSide }));
    mesh.position.copy(at(f, s, y + height / 2, n - .01)); mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, new THREE.Vector3(0, 1, 0), normal)); mesh.userData.text = text; shell.add(mesh); signs.push({ mesh, owner });
  }
  sign('7', 3.4, floor + 6.8, .75, 1, '#65564b', '#eeeecc');
  const meshes = batches.map(b => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(b.positions, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(b.colors, 3)); g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere(); const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: b.glass ? .22 : .68, side: THREE.DoubleSide, transparent: b.glass, opacity: b.glass ? .55 : 1, depthWrite: !b.glass })); mesh.name = b.glass ? 'humanities7-glass' : 'humanities7-surfaces'; mesh.castShadow = !b.glass; mesh.receiveShadow = true; shell.add(mesh); return mesh; });
  shell.userData.humanities7Access = { buildingId: building.id, floor, base, visibleLevels: 3, levelsEstimated: true, documentedAboveGroundLevels: 4, floorArrangementVerified: false, levelSource: 'https://designcampus.snu.ac.kr/competition/snu567/', height: roof - floor, heightEstimated: true, pavementMasks, stepSamples, entryRoute, outerRoute, courtRoute, courtPolygon, northExit, stairBottom, stairTop, source: 'https://map.snu.ac.kr/api/upload/default/F_BUILD_0000007.jpg', captureDate: null, dimensionsEstimated: true, courtyardLayoutEstimated: true, appearanceEra: 'official-photo-before-announced-2026-construction', currentConstructionStateVerified: false, rearAppearanceUnobserved: true, wholeInteriorImplemented: false, connectionTo8Implemented: false, northStairTo5Implemented: true, doorsOpenedForGameplay: true, geometry: { meshes: 2, signMeshes: signs.length, textures: signs.length, triangles: batches.reduce((n, b) => n + b.positions.length / 9, 0), colliders: breakables.length } };
  function update(_player: THREE.Vector3) { batches.forEach((b, index) => { const a = meshes[index].geometry.attributes.position as THREE.BufferAttribute, c = meshes[index].geometry.attributes.color as THREE.BufferAttribute; let moved = false, tinted = false;
    for (const p of b.parts) { if (p.shown !== p.proxy.visible) { p.shown = p.proxy.visible; moved = true; if (p.shown) (a.array as Float32Array).set(p.original, p.start); else for (let i = p.start; i < p.end; i += 3) { a.array[i] = p.proxy.position.x; a.array[i + 1] = p.proxy.position.y; a.array[i + 2] = p.proxy.position.z; } } if (p.color !== p.proxy.material.color.getHex()) { p.color = p.proxy.material.color.getHex(); tinted = true; const t = p.proxy.material.color, scale = [t.r / p.base.r, t.g / p.base.g, t.b / p.base.b]; for (let i = p.start; i < p.end; i++) c.array[i] = p.colors[i - p.start] * scale[(i - p.start) % 3]; } }
    if (moved) a.needsUpdate = true; if (tinted) c.needsUpdate = true;
  }); for (const s of signs) s.mesh.visible = s.owner.visible; shell.visible = batches.some(b => b.parts.some(p => p.proxy.visible)); }
  return { shell, breakables, update };
}
