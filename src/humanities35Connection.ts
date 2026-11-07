import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import { HUMANITIES35, getHumanities35Layout } from './humanities35Site';
import { humanities23Frame } from './humanities23Site';

type XZ = [number, number];
type Proxy = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
type Frame = ReturnType<typeof humanities23Frame>;
export function createHumanities35Connection(scene: THREE.Scene, heightAt: (x: number, z: number) => number, footprints: XZ[][] = [], existingPaving: XZ[][] = []) {
  const q = getHumanities35Layout(heightAt), shell = new THREE.Group(); shell.name = 'connection/humanities-3-5';
  Object.assign(shell.userData, { role: 'campus-connection', connectionId: shell.name, buildingId: HUMANITIES35.buildingId }); scene.add(shell);
  const breakables: BreakableSpec[] = [], pavementMasks: { component: string; polygon: XZ[] }[] = [];
  const batches = [false, true].map(glass => ({ glass, positions: [] as number[], colors: [] as number[], parts: [] as { proxy: Proxy; start: number; end: number; original: Float32Array; colors: Float32Array; base: THREE.Color; color: number; shown: boolean }[] }));
  const at = (f: Frame, s: number, y: number, n = 0) => { const p = f.point(s, n); return new THREE.Vector3(p[0], y, p[1]); };
  function component(name: string, vertices: THREE.Vector3[], color: number, material: BreakableSpec['material'] = 'stone', owner?: Proxy, flat = false) {
    const bounds = new THREE.Box3().setFromPoints(vertices), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const geometry = flat ? new THREE.BufferGeometry() : new ConvexGeometry(vertices.map(p => p.clone().sub(center)));
    if (flat) { const positions: number[] = []; for (let i = 1; i + 1 < vertices.length; i++) for (const p of [vertices[0], vertices[i], vertices[i + 1]]) positions.push(...p.clone().sub(center).toArray()); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); }
    const attr = geometry.attributes.position;
    const proxy = owner ?? new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color }));
    if (!owner) { proxy.position.copy(center); proxy.updateMatrixWorld(true); Object.assign(proxy.userData, { buildingId: HUMANITIES35.buildingId, connectionId: shell.name, component: name, renderProxy: true, convex: true }); breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attr.array), material, label: '3동 5동 연결부', toughness: material === 'glass' ? 2 : 8 }); }
    const batch = batches[material === 'glass' ? 1 : 0], start = batch.positions.length, tint = new THREE.Color(color);
    for (let i = 0; i < attr.count; i++) { batch.positions.push(attr.getX(i) + center.x, attr.getY(i) + center.y, attr.getZ(i) + center.z); batch.colors.push(tint.r, tint.g, tint.b); }
    batch.parts.push({ proxy, start, end: batch.positions.length, original: Float32Array.from(batch.positions.slice(start)), colors: Float32Array.from(batch.colors.slice(start)), base: proxy.material.color.clone(), color: proxy.material.color.getHex(), shown: true });
    if (owner) geometry.dispose(); return proxy;
  }
  function box(name: string, f: Frame, s0: number, s1: number, n0: number, n1: number, y0: number, y1: number, color = 0xdbdcd2, material: BreakableSpec['material'] = 'stone', owner?: Proxy) {
    const vertices: THREE.Vector3[] = []; for (const s of [s0, s1]) for (const n of [n0, n1]) for (const y of [y0, y1]) vertices.push(at(f, s, y, n)); return component(name, vertices, color, material, owner);
  }
  function beam(name: string, a: THREE.Vector3, b: THREE.Vector3, width: number, color: number, owner?: Proxy) {
    const delta = b.clone().sub(a), g = new THREE.BoxGeometry(width, width, delta.length()), rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), delta.normalize()), center = a.clone().add(b).multiplyScalar(.5), p = g.attributes.position;
    const result = component(name, Array.from({ length: p.count }, (_, i) => new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).applyQuaternion(rotation).add(center)), color, 'metal', owner); g.dispose(); return result;
  }
  const terrain = scene.getObjectByName('campus-terrain') as THREE.Mesh<THREE.BufferGeometry>, p = terrain.geometry.attributes.position, index = terrain.geometry.index;
  const terrainTriangles: THREE.Vector3[][] = [];
  for (let i = 0; i < (index?.count ?? p.count); i += 3) {
    const tri = [0, 1, 2].map(j => { const k = index ? index.getX(i + j) : i + j; return new THREE.Vector3(p.getX(k), p.getY(k), p.getZ(k)); });
    if (Math.max(...tri.map(v => v.x)) >= 438 && Math.min(...tri.map(v => v.x)) <= 496 && Math.max(...tri.map(v => v.z)) >= -690 && Math.min(...tri.map(v => v.z)) <= -585) terrainTriangles.push(tri);
  }
  const clip = (polygon: THREE.Vector3[], distance: (p: THREE.Vector3) => number) => {
    const output: THREE.Vector3[] = [];
    for (let i = 0; i < polygon.length; i++) { const a = polygon[i], b = polygon[(i + 1) % polygon.length], da = distance(a), db = distance(b); if (da >= -1e-8) output.push(a); if ((da >= -1e-8) !== (db >= -1e-8)) output.push(a.clone().lerp(b, da / (da - db))); } return output;
  };
  const patches = (f: Frame, s0: number, s1: number, n0: number, n1: number) => terrainTriangles.map(tri => {
    let polygon = tri; const local = (v: THREE.Vector3) => f.local([v.x, v.z]);
    for (const plane of [(v: THREE.Vector3) => local(v).s - s0, (v: THREE.Vector3) => s1 - local(v).s, (v: THREE.Vector3) => local(v).n - n0, (v: THREE.Vector3) => n1 - local(v).n]) polygon = clip(polygon, plane);
    return polygon;
  }).filter(p => p.length >= 3 && new THREE.Triangle(p[0], p[1], p[2]).getArea() > 1e-7);
  function ground(f: Frame, s: number, n = 0) {
    const [x, z] = f.point(s, n);
    for (const [a, b, c] of terrainTriangles) { const det = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x), u = ((x - a.x) * (c.z - a.z) - (z - a.z) * (c.x - a.x)) / det, v = ((b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x)) / det; if (u >= -1e-7 && v >= -1e-7 && u + v <= 1.0000001) return a.y + u * (b.y - a.y) + v * (c.y - a.y); }
    throw Error('Missing humanities 3/5 terrain sample');
  }
  const planes = (ring: XZ[]) => {
    const sign = Math.sign(ring.reduce((sum, a, i) => { const b = ring[(i + 1) % ring.length]; return sum + a[0] * b[1] - b[0] * a[1]; }, 0));
    return ring.map((a, i) => { const b = ring[(i + 1) % ring.length]; return (p: THREE.Vector3) => sign * ((b[0] - a[0]) * (p.z - a[1]) - (b[1] - a[1]) * (p.x - a[0])); });
  };
  const area = (p: THREE.Vector3[]) => Math.abs(p.reduce((sum, a, i) => { const b = p[(i + 1) % p.length]; return sum + a.x * b.z - b.x * a.z; }, 0));
  function subtract(poly: THREE.Vector3[], mask: XZ[]) {
    const ps = planes(mask); if (area(ps.reduce((p, plane) => clip(p, plane), poly)) < 1e-8) return [poly];
    const output: THREE.Vector3[][] = []; let rest = poly;
    for (const plane of ps) { const outside = clip(rest, p => -plane(p)); if (outside.length >= 3 && area(outside) > 1e-8) output.push(outside); rest = clip(rest, plane); } return output;
  }
  function paving(f: Frame, s0: number, s1: number, n0: number, n1: number, name = 'paved-apron', lift?: (s: number, n: number) => number, filter?: (p: THREE.Vector3[]) => THREE.Vector3[][]) {
    if (!filter) pavementMasks.push({ component: name, polygon: [f.point(s0, n0), f.point(s1, n0), f.point(s1, n1), f.point(s0, n1)] });
    const cell = name === 'asphalt-lane' ? 3 : 2.4;
    for (let s = s0; s < s1 - .001; s += cell) for (let n = n0; n < n1 - .001; n += cell) for (const raw of patches(f, s, Math.min(s1, s + cell), n, Math.min(n1, n + cell))) for (const poly of filter ? filter(raw) : [raw]) {
      if (filter) pavementMasks.push({ component: name, polygon: poly.map(p => [p.x, p.z]) });
      const top = poly.map(v => { const t = f.local([v.x, v.z]); return new THREE.Vector3(v.x, v.y + .045 + (lift?.(t.s, t.n) ?? 0), v.z); });
      const frame = Math.floor((s - s0) / 1.2) % 8 === 0 || Math.floor((n - n0) / 1.2) % 8 === 0;
      const owner = component(name, [...top, ...top.map(v => v.clone().add(new THREE.Vector3(0, -.12, 0)))], name === 'asphalt-lane' ? 0x7b827b : frame ? 0x9d9b92 : 0xb6b5aa);
      if (name === 'asphalt-lane') continue;
      // 줄눈은 바닥 부품에 묶어 표시한다. 보도블록마다 충돌체를 만들지 않는다.
      const joints: THREE.Vector3[][] = [];
      for (let ss = s + .2; ss < Math.min(s1, s + cell); ss += .2) joints.push(...patches(f, ss, Math.min(s1, ss + .008), n, Math.min(n1, n + cell)));
      for (let nn = n + .4; nn < Math.min(n1, n + cell); nn += .4) joints.push(...patches(f, s, Math.min(s1, s + cell), nn, Math.min(n1, nn + .008)));
      for (const part of joints) { const joint = planes(poly.map(p => [p.x, p.z])).reduce((p, plane) => clip(p, plane), part); if (joint.length < 3 || area(joint) < 1e-8) continue; const points = joint.map(v => { const t = f.local([v.x, v.z]); return new THREE.Vector3(v.x, v.y + .047 + (lift?.(t.s, t.n) ?? 0), v.z); }); component('paver-joint', points, 0x8e9087, 'stone', owner, true); }
    }
  }
  const b = q.bridge, y = q.bridgeFloor, start = -1.6, finish = b.length + 1.6;
  box('open-bridge-floor', b, start, finish, -1.4, 1.4, y - .26, y, 0xb7b9b0);
  box('open-bridge-roof', b, start, finish, -1.58, 1.58, q.bridgeRoof - .18, q.bridgeRoof, 0xa2aaa6, 'metal');
  // 사진의 열린 측면에는 유리를 넣지 않는다. 난간과 지붕 기둥을 분리한다.
  for (const n of [-1.4, 1.4]) {
    for (let s = 0; s < b.length; s += 2.4) {
      const end = Math.min(b.length, s + 2.4); beam('bridge-metal-post', at(b, s, y, n), at(b, s, q.bridgeRoof - .18, n), .085, 0x637b7e);
      for (const h of [.23, .48, .74, 1.03]) beam('open-bridge-rail', at(b, s, y + h, n), at(b, end, y + h, n), .045, 0x8d9994);
    }
    beam('bridge-end-post', at(b, b.length, y, n), at(b, b.length, q.bridgeRoof - .18, n), .085, 0x637b7e);
    for (const s of [.25, b.length - .25]) {
      const p = b.point(s, n), g = new THREE.CylinderGeometry(.18, .18, y - ground(b, s, n), 10), center = new THREE.Vector3(p[0], (y + ground(b, s, n)) / 2, p[1]), a = g.attributes.position;
      component('bridge-round-support', Array.from({ length: a.count }, (_, i) => new THREE.Vector3(a.getX(i), a.getY(i), a.getZ(i)).add(center)), 0xaeb4aa); g.dispose();
    }
  }
  for (const s of [start, finish]) box('upper-vestibule-end', b, s - .07, s + .07, -1.4, 1.4, y, q.bridgeRoof - .18, 0xc8ccc0);
  for (const n of [-1.4, 1.4]) for (const [s0, s1] of [[start, 0], [b.length, finish]]) box('upper-vestibule-side', b, s0, s1, n - .06, n + .06, y, q.bridgeRoof - .18, 0xc8ccc0);
  const e = q.entry, ey = q.entryFloor, entryS = 5.7;
  box('entry-floor', e, 0, 12, -2.1, 3.1, ey - .23, ey, 0xb3b6aa);
  box('entry-back', e, 2, 11, 2.95, 3.1, ey, ey + 3.2, 0xa9afa3);
  for (const s of [2, 11]) box('entry-recess-side', e, s - .06, s + .06, 0, 3.1, ey, ey + 3.2, 0xb9bdb2);
  for (const [s0, s1] of [[2, 4.5], [6.9, 11]]) {
    const pane = box('entry-glass-wall', e, s0, s1, -.09, -.02, ey + .08, ey + 2.95, 0x668d84, 'glass');
    for (let s = s0; s < s1; s += 1.1) box('entry-window-frame', e, s, s + .045, -.14, .03, ey, ey + 3, 0xc7d0c7, 'metal', pane);
  }
  for (const s of [4.5, 6.9]) { const leaf = box('open-entry-door', e, s - .035, s + .035, .06, 1.15, ey + .05, ey + 2.8, 0x88aaa0, 'glass'); beam('door-handle', at(e, s, ey + .85, .85), at(e, s, ey + 1.5, .85), .024, 0xd0d8ca, leaf); }
  box('entry-transom', e, 4.5, 6.9, -.1, -.02, ey + 2.8, ey + 3.2, 0x668d84, 'glass');
  box('entry-white-canopy', e, -.2, 12.2, -2.2, .2, ey + 3.12, ey + 3.48, 0xe0e0d4);
  for (const s of [0, 11.9]) box('entry-white-column', e, s - .15, s + .15, -2.15, -1.85, ey, ey + 3.15, 0xd9ddd1);
  const low = Math.max(...[2, entryS, 10.8].map(s => ground(e, s, -3.6))) + .045;
  const stepCount = Math.max(3, Math.ceil((ey - low) / .16)), steps: { point: XZ; top: number }[] = [];
  for (let i = 0; i < stepCount; i++) {
    const n0 = -3.6 + i * 1.5 / stepCount, n1 = -3.6 + (i + 1) * 1.5 / stepCount, top = low + (ey - low) * (i + 1) / stepCount;
    const step = box('entrance-step', e, 2, 10.8, n0, n1, Math.min(low, ground(e, 10.8, n0)) - .15, top, 0xaeb2a6);
    box('step-nosing', e, 2, 10.8, n0, n0 + .025, top, top + .003, 0xd0cbb6, 'stone', step); steps.push({ point: e.point(entryS, (n0 + n1) / 2), top });
  }
  pavementMasks.push({ component: 'entrance-step', polygon: [e.point(0, -3.6), e.point(12, -3.6), e.point(12, 3.1), e.point(0, 3.1)] });
  // 사진 속 왼쪽 진입 경사로를 참고한다. 길이와 경사는 현장 실측값이 아니다.
  const rampStart = -8.5, rampEnd = 1.5, rampN = -4, rampMin = rampN - .75, rampMax = rampN + .75;
  const rampLow = Math.max(ground(e, rampStart, rampMin), ground(e, rampStart, rampMax)) + .045;
  const rampY = (s: number) => rampLow + (ey - rampLow) * (s - rampStart) / (rampEnd - rampStart);
  for (let s = rampStart; s < rampEnd; s += 1) {
    const end = Math.min(rampEnd, s + 1), top = [at(e, s, rampY(s), rampMin), at(e, end, rampY(end), rampMin), at(e, end, rampY(end), rampMax), at(e, s, rampY(s), rampMax)];
    component('entry-ramp', [...top, ...top.map(p => p.clone().add(new THREE.Vector3(0, -.2, 0)))], 0xa9afa3);
    for (const n of [rampMin - .12, rampMax + .12]) { const rail = beam('ramp-rail', at(e, s, rampY(s) + .9, n), at(e, end, rampY(end) + .9, n), .045, 0xa2aaa1); if (Math.round(s - rampStart) % 2 === 0) beam('ramp-rail-post', at(e, s, rampY(s), n), at(e, s, rampY(s) + .9, n), .035, 0xa2aaa1, rail); }
  }
  const rampPolygon = [e.point(rampStart, rampMin), e.point(rampEnd, rampMin), e.point(rampEnd, rampMax), e.point(rampStart, rampMax)];
  pavementMasks.push({ component: 'entry-ramp', polygon: rampPolygon });
  box('ramp-upper-landing', e, 0, 1.9, rampMin, -2.1, ey - .25, ey, 0xa9afa3);
  pavementMasks.push({ component: 'ramp-upper-landing', polygon: [e.point(0, rampMin), e.point(1.9, rampMin), e.point(1.9, -2.1), e.point(0, -2.1)] });
  // 끝벽의 흰 띠, 발코니와 세로 배수관은 사진으로 확인한 범위에만 추가한다.
  for (const h of [ey + 3.3, ey + 6.5, ey + 9.7, q.base5 + 14]) box('end-white-band', e, 0, e.length, -.45, -.34, h - .22, h + .22, 0xdddfd4);
  for (const s of [0, e.length]) box('end-white-pier', e, s - .18, s + .18, -.46, -.32, ground(e, s, -.3), q.base5 + 14.35, 0xdddfd4);
  for (const h of [ey + 3.3, ey + 6.5, ey + 9.7]) {
    const top = Math.min(h + 2.75, q.base5 + 13.6), pane = box('end-balcony-window', e, 7.5, 10.1, -.43, -.37, h + .15, top, 0x527d73);
    for (const s of [7.5, 8.8, 10.1]) box('balcony-window-mullion', e, s - .035, s + .035, -.49, -.43, h + .15, top, 0xc4cec4, 'metal', pane);
    for (const level of [h + .15, h + 1.05, top]) box('balcony-window-frame', e, 7.5, 10.1, -.49, -.43, level - .03, level + .03, 0xc4cec4, 'metal', pane);
    const sill = box('end-balcony-sill', e, 7.3, 10.3, -.85, -.35, h - .13, h + .02, 0xd2d7cb);
    for (const s of [7.4, 10.2]) beam('balcony-rail-post', at(e, s, h, -.77), at(e, s, h + .95, -.77), .035, 0x8c9f94, sill);
    for (let s = 7.45; s <= 10.2; s += .17) beam('balcony-upright', at(e, s, h, -.77), at(e, s, h + .92, -.77), .018, 0x8c9f94, sill);
    beam('balcony-handrail', at(e, 7.4, h + .95, -.77), at(e, 10.2, h + .95, -.77), .035, 0x8c9f94, sill);
  }
  beam('end-drainpipe', at(e, 12, ground(e, 12), -.6), at(e, 12, q.base5 + 13.8, -.6), .07, 0xadb4a9);
  const exclusions = [...existingPaving, ...pavementMasks.map(m => m.polygon)];
  for (const footprint of footprints) {
    const ring = footprint.slice(0, -1); for (const tri of THREE.ShapeUtils.triangulateShape(ring.map(p => new THREE.Vector2(...p)), [])) exclusions.push(tri.map(i => ring[i]));
    // 공통 벽의 두께만큼 여백을 두어 포장이 벽 내부까지 들어가지 않게 한다.
    for (let i = 0; i < ring.length; i++) { const f = humanities23Frame(ring[i], ring[(i + 1) % ring.length]); exclusions.push([f.point(-.08, -.43), f.point(f.length + .08, -.43), f.point(f.length + .08, .43), f.point(-.08, .43)]); }
  }
  function clear(poly: THREE.Vector3[]) { let pieces = [poly]; for (const mask of exclusions) pieces = pieces.flatMap(p => subtract(p, mask)); return pieces; }
  paving(e, -1, 12, -7.4, -3.6, 'entry-paving', (s, n) => Math.max(0, low - ground(e, s, -3.6) - .045) * Math.max(0, (n + 7.4) / 3.8), clear);
  paving(e, rampStart - 2.5, rampStart, rampMin, rampMax, 'ramp-lower-apron', (s, n) => Math.max(0, rampLow - ground(e, rampStart, n) - .045) * Math.max(0, (s - rampStart + 2.5) / 2.5), clear);
  exclusions.push(...pavementMasks.map(m => m.polygon));
  for (let i = 1; i < HUMANITIES35.groundPath.length; i++) { const f = humanities23Frame(HUMANITIES35.groundPath[i - 1], HUMANITIES35.groundPath[i]); paving(f, -.1, f.length + .1, -1.4, 1.4, 'asphalt-lane', undefined, clear); }
  // 입구 앞 공터는 기존 해방터 포장과 이어지되 건물과 경사로 내부를 덮지 않는다.
  exclusions.push(...pavementMasks.map(m => m.polygon));
  const court: XZ[] = [[446, -677.6], [453, -681], [465, -682], [474, -677], [462, -664], [453, -665]];
  paving(e, -14, 12, -11, -.5, 'entry-court', undefined, poly => { const inside = planes(court).reduce((p, fn) => clip(p, fn), poly); return inside.length >= 3 && area(inside) > 1e-8 ? clear(inside) : []; });
  const binY = ground(e, -6.2, -6.7), bin = box('metal-litter-bin', e, -6.6, -6, -7, -6.4, binY, binY + .85, 0x9ca79d, 'metal');
  box('bin-opening', e, -6.52, -6.08, -7.02, -7, binY + .63, binY + .78, 0x394c43, 'metal', bin);
  const numberOwner = box('building-number-mount', e, .3, 1.2, -.48, -.39, q.base5 + 12.4, q.base5 + 13.35, 0xdce0d2);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128; const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#dce0d2'; ctx.fillRect(0, 0, 128, 128); ctx.fillStyle = '#29443d'; ctx.font = '600 112px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('5', 64, 66);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; const origin = e.point(0), outer = e.point(0, -1), normal = new THREE.Vector3(outer[0] - origin[0], 0, outer[1] - origin[1]), right = new THREE.Vector3(normal.z, 0, -normal.x);
  const number = new THREE.Mesh(new THREE.PlaneGeometry(.9, .95).scale(-1, 1, 1), new THREE.MeshStandardMaterial({ map, side: THREE.DoubleSide })); number.position.copy(at(e, .75, q.base5 + 12.875, -.49)); number.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, new THREE.Vector3(0, 1, 0), normal)); number.userData.text = '5'; shell.add(number);
  const meshes = batches.map(batch => {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(batch.positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(batch.colors, 3)); geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: batch.glass ? .22 : .82, transparent: batch.glass, opacity: batch.glass ? .46 : 1, depthWrite: !batch.glass, side: THREE.DoubleSide })); mesh.name = batch.glass ? 'humanities-35-glass' : 'humanities-35-surfaces'; mesh.castShadow = !batch.glass; mesh.receiveShadow = true; shell.add(mesh); return mesh;
  });
  shell.userData.humanities35 = { ...HUMANITIES35, bridgeFloor: y, bridgeRoof: q.bridgeRoof, entryFloor: ey, pavementMasks, steps, bridgeRoute: [b.point(start + .55), b.point(finish - .55)], entryRoute: [e.point(entryS, -6), e.point(entryS, -3.65), e.point(entryS, -1), e.point(entryS, 1.9)], rampRoute: [e.point(rampStart - 1.5, rampN), e.point(rampStart, rampN), e.point(rampEnd, rampN), e.point(rampEnd, -1.15), e.point(entryS, -1.15), e.point(entryS, 1.9)], dimensionsEstimated: true, bridgeHeightEstimated: true, upperBridgeAccessFromGroundImplemented: false, wholeInteriorImplemented: false, photoCaptureDate: null, source: 'https://map.snu.ac.kr/api/upload/default/F_BUILD_0000005.jpg', geometry: { meshes: 2, signMeshes: 1, triangles: batches.reduce((n, b) => n + b.positions.length / 9, 0), colliders: breakables.length, textures: 1 } };
  function update(_player: THREE.Vector3) {
    batches.forEach((batch, index) => {
      const a = meshes[index].geometry.attributes.position as THREE.BufferAttribute, c = meshes[index].geometry.attributes.color as THREE.BufferAttribute; let changed = false, recolored = false;
      for (const p of batch.parts) {
        if (p.shown !== p.proxy.visible) { p.shown = p.proxy.visible; changed = true; if (p.shown) (a.array as Float32Array).set(p.original, p.start); else for (let i = p.start; i < p.end; i += 3) { a.array[i] = p.proxy.position.x; a.array[i + 1] = p.proxy.position.y; a.array[i + 2] = p.proxy.position.z; } }
        const tint = p.proxy.material.color; if (p.color !== tint.getHex()) { p.color = tint.getHex(); recolored = true; const scale = [tint.r / p.base.r, tint.g / p.base.g, tint.b / p.base.b]; for (let i = p.start; i < p.end; i++) c.array[i] = p.colors[i - p.start] * scale[(i - p.start) % 3]; }
      }
      if (changed) a.needsUpdate = true; if (recolored) c.needsUpdate = true;
    }); number.visible = numberOwner.visible; shell.visible = batches.some(b => b.parts.some(p => p.proxy.visible));
  }
  return { shell, breakables, update };
}
