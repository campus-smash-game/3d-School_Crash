import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';

type XZ = [number, number];
type Proxy = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
export const HUMANITIES250 = { buildingId: 'way/167983080', neighborId: 'way/167984624', origin: [370.85, -674.34] as XZ, width: Math.hypot(11.08, -3.43), depth: 5.8 };
const ux = 11.08 / HUMANITIES250.width, uz = -3.43 / HUMANITIES250.width;
export function humanities250Point(u: number, v: number): XZ { return [370.85 + ux * u - uz * v, -674.34 + uz * u + ux * v]; }
export function humanities250Local(p: XZ) { const x = p[0] - 370.85, z = p[1] + 674.34; return { u: x * ux + z * uz, v: -x * uz + z * ux }; }
export function getHumanities250Layout(heightAt: (x: number, z: number) => number) {
  // 2동의 기존 기준 높이를 유지한다. 사진에서 확인할 수 없는 깊이와 계단 치수는 근사다.
  const base = heightAt(397.36, -668.1492307692308), storey = 3.5;
  const floors = [0, 1, 2, 3].map(i => base + i * storey);
  const foot = humanities250Point(12.8, -9), entryBase = heightAt(...foot) + .04, entryTop = base + 1.75;
  return { base, floors, storey, foot, entryBase, entryTop, entrySteps: Math.ceil((entryTop - entryBase) / .18), roof: base + 14.6 };
}
export function getHumanities250Openings(buildingId: string, points: XZ[], heightAt: (x: number, z: number) => number) {
  const q = getHumanities250Layout(heightAt);
  if (buildingId === HUMANITIES250.buildingId) return [
    { buildingId, edgeIndex: 1, a: points[1], b: points[2], bottom: q.base - .3, top: q.roof },
    { buildingId, edgeIndex: 2, a: points[2], b: points[3], bottom: q.entryTop - .2, top: q.entryTop + 3.12 },
  ];
  if (buildingId !== HUMANITIES250.neighborId) return [];
  const a = points[3], b = points[4], pa = humanities250Local(a), pb = humanities250Local(b);
  const at = (u: number): XZ => { const t = (u - pa.u) / (pb.u - pa.u); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
  return q.floors.slice(0, 3).map(y => ({ buildingId, edgeIndex: 3, a: at(4.0), b: at(6.8), bottom: y - .06, top: y + 2.95 }));
}

export function createHumanities250(scene: THREE.Scene, heightAt: (x: number, z: number) => number) {
  const q = getHumanities250Layout(heightAt), w = HUMANITIES250.width;
  const shell = new THREE.Group(); shell.name = 'connection/humanities-250';
  Object.assign(shell.userData, { role: 'campus-connection', connectionId: shell.name, buildingId: HUMANITIES250.buildingId }); scene.add(shell);
  const breakables: BreakableSpec[] = [];
  const batches = [false, true].map(glass => ({ glass, positions: [] as number[], colors: [] as number[], parts: [] as { proxy: Proxy; start: number; end: number; original: Float32Array; originalColors: Float32Array; base: THREE.Color; color: number; shown: boolean }[] }));
  const world = (u: number, y: number, v: number) => { const p = humanities250Point(u, v); return new THREE.Vector3(p[0], y, p[1]); };
  function component(name: string, vertices: THREE.Vector3[], color: number, material: BreakableSpec['material'] = 'stone', owner?: Proxy) {
    const bounds = new THREE.Box3().setFromPoints(vertices), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const geometry = new ConvexGeometry(vertices.map(p => p.clone().sub(center))), attr = geometry.attributes.position;
    const proxy = owner ?? new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color }));
    if (!owner) { proxy.position.copy(center); proxy.updateMatrixWorld(true); Object.assign(proxy.userData, { buildingId: HUMANITIES250.buildingId, connectionId: shell.name, component: name, renderProxy: true, convex: true }); breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attr.array), material, label: '250동 연결부', toughness: material === 'glass' ? 2 : 9 }); }
    const batch = batches[material === 'glass' ? 1 : 0], start = batch.positions.length, tint = new THREE.Color(color);
    for (let i = 0; i < attr.count; i++) { batch.positions.push(attr.getX(i) + center.x, attr.getY(i) + center.y, attr.getZ(i) + center.z); batch.colors.push(tint.r, tint.g, tint.b); }
    batch.parts.push({ proxy, start, end: batch.positions.length, original: Float32Array.from(batch.positions.slice(start)), originalColors: Float32Array.from(batch.colors.slice(start)), base: proxy.material.color.clone(), color: proxy.material.color.getHex(), shown: true });
    if (owner) geometry.dispose(); return proxy;
  }
  function box(name: string, u0: number, u1: number, v0: number, v1: number, y0: number, y1: number, color = 0xdadbd2, material: BreakableSpec['material'] = 'stone', owner?: Proxy) {
    const vertices: THREE.Vector3[] = []; for (const u of [u0, u1]) for (const v of [v0, v1]) for (const y of [y0, y1]) vertices.push(world(u, y, v)); return component(name, vertices, color, material, owner);
  }
  function beam(name: string, a: THREE.Vector3, b: THREE.Vector3, width = .055, owner?: Proxy) {
    const delta = b.clone().sub(a), g = new THREE.BoxGeometry(width, width, delta.length()), rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), delta.normalize()), center = a.clone().add(b).multiplyScalar(.5), p = g.attributes.position;
    const result = component(name, Array.from({ length: p.count }, (_, i) => new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).applyQuaternion(rotation).add(center)), 0x929e98, 'metal', owner); g.dispose(); return result;
  }
  function rail(u0: number, v0: number, y0: number, u1: number, v1: number, y1: number) {
    const top = beam('stair-handrail', world(u0, y0 + 1.02, v0), world(u1, y1 + 1.02, v1), .065);
    const length = Math.hypot(u1 - u0, v1 - v0), count = Math.ceil(length / .65);
    for (let i = 0; i <= count; i++) { const t = i / count, u = THREE.MathUtils.lerp(u0, u1, t), v = THREE.MathUtils.lerp(v0, v1, t), y = THREE.MathUtils.lerp(y0, y1, t); beam('stair-baluster', world(u, y + .06, v), world(u, y + 1.02, v), .035, top); }
    return top;
  }
  const routes: number[][][] = [];
  const step = (u0: number, u1: number, v0: number, v1: number, y: number, thickness = .2) => box('stair-tread', u0, u1, v0, v1, y - thickness, y, 0xb7bdb7);
  // 전면 계단과 뒤쪽 되돌이 계단을 같은 충돌 형상으로 만든다.
  for (let level = 0; level < 3; level++) {
    const y = q.floors[level], half = y + 1.75, top = y + 3.5, n = 11;
    box('storey-landing', 3.25, 5, .45, 5.8, y - .22, y);
    box('half-landing', 10.15, w, .45, 5.8, half - .22, half);
    for (let i = 0; i < n; i++) {
      step(5 + i * 5.15 / n, 5 + (i + 1) * 5.15 / n + .012, .55, 2.55, y + (i + 1) * 1.75 / n);
      step(10.15 - (i + 1) * 5.15 / n - .012, 10.15 - i * 5.15 / n, 3.6, 5.6, half + (i + 1) * 1.75 / n);
    }
    rail(5, 2.58, y + .16, 10.15, 2.58, half); rail(10.15, 3.57, half + .16, 5, 3.57, top);
    rail(w - .2, level === 0 ? 3.5 : .6, half, w - .2, 5.6, half);
    routes.push([[4.2, y, 1.5], [10.8, half, 1.5], [10.8, half, 4.6], [4.2, top, 4.6]]);
  }
  box('storey-landing', 3.25, 5, .45, 5.8, q.floors[3] - .22, q.floors[3]);
  box('ground-floor', 3.25, w, .35, 3.25, q.base - .25, q.base);
  box('entry-landing', w - .1, w + 2.4, .35, 3.25, q.entryTop - .25, q.entryTop);
  box('stair-back-wall', 3.1, w, 5.8, 6.0, q.base - .3, q.roof, 0xc4c9c0);
  box('shaft-divider', 3.1, 3.3, .0, 5.8, q.base - .3, q.roof, 0xe0e2d9);
  box('shaft-left-wall', -.18, .04, .0, 5.8, q.base - .3, q.roof, 0xd4d7cf);
  box('shaft-back-wall', 0, 3.1, 5.6, 5.8, q.base - .3, q.roof, 0x4d746f);
  for (const u of [0, 3.2, w]) box('white-facade-pier', u - .15, u + .15, -.22, .12, q.base - .5, q.roof, 0xe6e6dd);
  for (let level = 0; level < 4; level++) {
    const y = q.floors[level];
    box('white-facade-band', -.15, w + .15, -.24, .14, y - .18, y + .28, 0xe3e5dd);
    // 1동으로 이어지는 세 층의 문은 열어 둔다. 실내 평면과 문 상태는 게임용 근사다.
    const panels = level < 3 ? [[3.4, 3.95], [6.85, w - .2]] : [[3.4, w - .2]];
    for (const [a, b] of panels) {
      box('stair-glazing', a, b, -.1, -.04, y + .28, y + 3.25, 0xa4c4bf, 'glass');
      for (let u = a; u <= b; u += 1.4) box('window-mullion', u - .025, u + .025, -.14, -.02, y + .28, y + 3.25, 0xc7d0c7, 'metal');
    }
    box('teal-shaft-glazing', .16, 3.04, -.30, -.20, y + .28, y + 3.25, 0x279a9c, 'glass');
    box('shaft-mullion', 1.55, 1.61, -.34, -.18, y + .28, y + 3.25, 0x7eb7b2, 'metal');
  }
  box('white-roof-cap', -.25, w + .25, -.30, 6.05, q.roof - .35, q.roof, 0xe6e6dd);
  // 1동의 기존 벽을 통과하는 짧은 연결부만 만든다. 건물 전체 실내를 추정하지 않는다.
  for (const y of q.floors.slice(0, 3)) {
    box('link-floor', 3.95, 6.85, -7.2, .5, y - .22, y);
    box('link-end-wall', 3.95, 6.85, -7.35, -7.2, y, y + 3.3, 0xcbd0c6);
    for (const u of [3.95, 6.85]) {
      box('link-white-band', u - .08, u + .08, -7.2, .1, y, y + .32);
      box('link-glazing', u - .025, u + .025, -7.2, -.1, y + .32, y + 3.1, 0x9dbdb5, 'glass');
      for (let v = -7; v < 0; v += 1.4) box('link-window-mullion', u - .055, u + .055, v - .03, v + .03, y + .3, y + 3.15, 0xd4dad0, 'metal');
    }
  }
  box('link-roof', 3.8, 7, -7.4, .25, q.floors[2] + 3.1, q.floors[2] + 3.35);
  // 정원 접근 계단은 기존 DEM 위에 놓고 진입 위치와 치수의 추정을 기록한다.
  const entryStep = (q.entryTop - q.entryBase) / q.entrySteps;
  for (let i = 0; i < q.entrySteps; i++) step(11.8, 13.8, -9 + i * 9.35 / q.entrySteps, -9 + (i + 1) * 9.35 / q.entrySteps + .014, q.entryBase + (i + 1) * entryStep, .24);
  rail(11.72, -9, q.entryBase, 11.72, .35, q.entryTop); rail(13.88, -9, q.entryBase, 13.88, .35, q.entryTop);
  box('entry-canopy', 11.45, 14.2, -.1, 3.5, q.entryTop + 3.08, q.entryTop + 3.28);
  box('entry-door-header', w - .08, w + .14, .25, 3.25, q.entryTop + 2.85, q.entryTop + 3.08, 0xa7b3aa, 'metal');
  for (const v of [.3, 3.22]) box('entry-door-frame', w - .10, w + .15, v - .06, v + .06, q.entryTop, q.entryTop + 2.85, 0xb1beb6, 'metal');
  const approachStart: XZ = [389.6825, -686.7725], approachEnd = humanities250Point(12.8, -9.6);
  const adx = approachEnd[0] - approachStart[0], adz = approachEnd[1] - approachStart[1], al = Math.hypot(adx, adz);
  const along = (p: THREE.Vector3) => ((p.x - approachStart[0]) * adx + (p.z - approachStart[1]) * adz) / al;
  const across = (p: THREE.Vector3) => (-(p.x - approachStart[0]) * adz + (p.z - approachStart[1]) * adx) / al;
  const clip = (polygon: THREE.Vector3[], distance: (p: THREE.Vector3) => number) => {
    const result: THREE.Vector3[] = [];
    for (let i = 0; i < polygon.length; i++) { const a = polygon[i], b = polygon[(i + 1) % polygon.length], da = distance(a), db = distance(b); if (da >= -1e-8) result.push(a); if ((da >= -1e-8) !== (db >= -1e-8)) result.push(a.clone().lerp(b, da / (da - db))); } return result;
  };
  const terrain = scene.getObjectByName('campus-terrain') as THREE.Mesh<THREE.BufferGeometry>, attr = terrain.geometry.attributes.position, index = terrain.geometry.index;
  const gardenMasks = (scene.getObjectByName('connection/humanities-garden')?.userData.humanitiesGarden?.pavementMasks ?? []) as { polygon: XZ[] }[];
  const area = (p: THREE.Vector3[]) => Math.abs(p.reduce((sum, a, j) => { const b = p[(j + 1) % p.length]; return sum + a.x * b.z - b.x * a.z; }, 0));
  const subtractGarden = (polygon: THREE.Vector3[], mask: XZ[]) => {
    const sign = Math.sign(mask.reduce((sum, a, j) => { const b = mask[(j + 1) % mask.length]; return sum + a[0] * b[1] - b[0] * a[1]; }, 0));
    const planes = mask.map((a, j) => { const b = mask[(j + 1) % mask.length]; return (p: THREE.Vector3) => sign * ((b[0] - a[0]) * (p.z - a[1]) - (b[1] - a[1]) * (p.x - a[0])); });
    if (area(planes.reduce((p, plane) => clip(p, plane), polygon)) < 1e-8) return [polygon];
    const pieces: THREE.Vector3[][] = []; let rest = polygon;
    for (const plane of planes) { const outside = clip(rest, p => -plane(p)); if (outside.length >= 3 && area(outside) > 1e-8) pieces.push(outside); rest = clip(rest, plane); }
    return pieces;
  };
  for (let i = 0; i < (index?.count ?? attr.count); i += 3) {
    let p = [0, 1, 2].map(j => { const k = index ? index.getX(i + j) : i + j; return new THREE.Vector3(attr.getX(k), attr.getY(k), attr.getZ(k)); });
    if (Math.max(...p.map(v => v.x)) < 378 || Math.min(...p.map(v => v.x)) > 390 || Math.max(...p.map(v => v.z)) < -698 || Math.min(...p.map(v => v.z)) > -684) continue;
    for (const plane of [(v: THREE.Vector3) => along(v), (v: THREE.Vector3) => al - along(v), (v: THREE.Vector3) => across(v) + .9, (v: THREE.Vector3) => .9 - across(v)]) p = clip(p, plane);
    if (p.length < 3) continue;
    let patches = [p]; for (const mask of gardenMasks) patches = patches.flatMap(patch => subtractGarden(patch, mask.polygon));
    for (const patch of patches) {
      const top = patch.map(v => v.clone().add(new THREE.Vector3(0, .045, 0)));
      component('garden-entry-paving', [...top, ...top.map(v => v.clone().add(new THREE.Vector3(0, -.12, 0)))], 0xb6b3a3);
    }
  }
  const meshes = batches.map(batch => {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(batch.positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(batch.colors, 3)); geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); (geometry.attributes.position as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: batch.glass ? .2 : .82, transparent: batch.glass, opacity: batch.glass ? .30 : 1, depthWrite: !batch.glass, side: THREE.DoubleSide })); mesh.name = batch.glass ? 'humanities-250-glass' : 'humanities-250-surfaces'; mesh.castShadow = !batch.glass; mesh.receiveShadow = true; shell.add(mesh); return mesh;
  });
  shell.userData.humanities250 = { ...q, approachRoute: [approachStart, approachEnd], approachWidth: 1.8, width: w, depth: 5.8, pointOrigin: HUMANITIES250.origin, axis: [ux, uz], routes: routes.map(route => route.map(([u, y, v]) => world(u, y, v).toArray())), entryRoute: [[12.8, q.entryBase, -9.6], [12.8, q.entryTop, 1.5], [10.8, q.entryTop, 1.5]].map(([u, y, v]) => world(u, y, v).toArray()), linkRoutes: q.floors.slice(0, 3).map(y => [world(5.4, y, 4.6).toArray(), world(5.4, y, -6.3).toArray()]), photoSource: 'https://map.snu.ac.kr/api/upload/default/F_BUILD_0000001.jpg', officialMap: 'https://map.snu.ac.kr/web/facility_detail.action?convinType=N&inst_seq=181', observed: ['white frame', 'teal glazed shaft', 'stair flights visible through glazing'], dimensionsEstimated: true, internalLayoutEstimated: true, entrancePositionEstimated: true, elevatorOperationImplemented: false, rawTerrainChanged: false, wholeBuildingReconstructed: false, geometry: { meshes: 2, colliders: breakables.length, triangles: batches.reduce((n, b) => n + b.positions.length / 9, 0), textures: 0 } };
  function update(_player: THREE.Vector3) {
    batches.forEach((batch, index) => {
      const geometry = meshes[index].geometry, a = geometry.attributes.position as THREE.BufferAttribute, c = geometry.attributes.color as THREE.BufferAttribute; let changed = false, recolored = false;
      for (const p of batch.parts) {
        if (p.shown !== p.proxy.visible) { p.shown = p.proxy.visible; changed = true; if (p.shown) (a.array as Float32Array).set(p.original, p.start); else for (let i = p.start; i < p.end; i += 3) { a.array[i] = p.proxy.position.x; a.array[i + 1] = p.proxy.position.y; a.array[i + 2] = p.proxy.position.z; } }
        const tint = p.proxy.material.color; if (p.color !== tint.getHex()) { p.color = tint.getHex(); recolored = true; const scale = [tint.r / p.base.r, tint.g / p.base.g, tint.b / p.base.b]; for (let i = p.start; i < p.end; i++) c.array[i] = p.originalColors[i - p.start] * scale[(i - p.start) % 3]; }
      }
      if (changed) a.needsUpdate = true; if (recolored) c.needsUpdate = true;
    }); shell.visible = batches.some(b => b.parts.some(p => p.proxy.visible));
  }
  return { shell, breakables, update };
}


