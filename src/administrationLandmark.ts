import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { CampusBuilding } from './fullCampus';
import type { BuildingAppearance } from './buildingAppearance';
import type { BreakableSpec } from './scene';

type Point = { x: number; z: number };
type Surface = { positions: number[]; colors: number[]; geometry?: THREE.BufferGeometry };
type Range = { surface: Surface; start: number; end: number; original: Float32Array };
type Part = { proxy: THREE.Mesh; shown: boolean; ranges: Range[] };

// 공식 지상 5층/B1 분류와 사진의 상부 3행을 구분한다. 20m 높이와 세부 치수는 사진 비례에 따른 추정이다.
export function createAdministrationLandmark(scene: THREE.Scene, building: CampusBuilding, profile: BuildingAppearance, heightAt: (x: number, z: number) => number) {
  const mapped = building.points.filter((p, i, all) => i !== all.length - 1 || p[0] !== all[0][0] || p[1] !== all[0][1]);
  if (mapped.length < 3) throw new Error('Administration building needs a mapped footprint.');
  const cx = mapped.reduce((s, p) => s + p[0], 0) / mapped.length, cz = mapped.reduce((s, p) => s + p[1], 0) / mapped.length;
  let longest = 0, ux = 1, uz = 0;
  for (let i = 0; i < mapped.length; i++) { const p = mapped[i], q = mapped[(i + 1) % mapped.length], length = Math.hypot(q[0] - p[0], q[1] - p[1]); if (length > longest) { longest = length; ux = (q[0] - p[0]) / length; uz = (q[1] - p[1]) / length; } }
  if (ux < 0) { ux = -ux; uz = -uz; }
  const axis = new THREE.Vector3(ux, 0, uz), front = new THREE.Vector3(-uz, 0, ux), up = new THREE.Vector3(0, 1, 0), base = heightAt(cx, cz);
  const points = mapped.map(p => ({ x: (p[0] - cx) * ux + (p[1] - cz) * uz, z: -(p[0] - cx) * uz + (p[1] - cz) * ux }));
  if (points.reduce((s, p, i) => { const q = points[(i + 1) % points.length]; return s + p.x * q.z - q.x * p.z; }, 0) < 0) points.reverse();
  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x)), minZ = Math.min(...points.map(p => p.z)), maxZ = Math.max(...points.map(p => p.z));
  const height = 20, lowerTop = 7, upperPitch = 3.65, upperTop = lowerTop + upperPitch * 3, setback = 2, entryZ = maxZ - setback;
  const passage = { minX: -23, maxX: -11, centerX: -17, ceiling: lowerTop - .35, frontZ: maxZ, backZ: minZ, estimated: true };
  const world = (x: number, y: number, z: number) => new THREE.Vector3(cx + x * ux - z * uz, base + y, cz + x * uz + z * ux);
  const ground = (x: number, z: number) => { const p = world(x, 0, z); return heightAt(p.x, p.z) - base; };
  const shell = new THREE.Group(); shell.name = `${building.id}:administration-landmark`;
  Object.assign(shell.userData, { buildingId: building.id, role: 'building-shell', landmark: 'administration', appearance: profile,
    localOrigin: { x: cx, y: base, z: cz }, axis: { x: ux, z: uz }, frontFacing: { x: front.x, z: front.z },
    dimensions: { length: maxX - minX, depth: maxZ - minZ, height }, mappedOutline: mapped.map(p => p.slice()), mappedOutlinePreserved: true,
    heightEstimated: true, detailDimensionsEstimated: true, frontDirectionEstimated: true, levels: { aboveGround: 5, belowGround: 1, upperWindowRows: 3, lowerRecessedLevels: 2, sourceYear: 2016 },
    lowerTop, upperPitch, upperTop, roofHeight: height, entrance: { x: 0, z: entryZ, floor: .18, width: 6, height: 3.12 }, passage,
    basementInteriorModeled: false, floorPlanEstimated: true, currentCommonsExteriorVerified: false });
  scene.add(shell);
  const distant = new THREE.Group(); distant.visible = false; Object.assign(distant.userData, { buildingId: building.id, role: 'distant-building', landmark: 'administration' }); scene.add(distant);
  const concrete: Surface = { positions: [], colors: [] }, details: Surface = { positions: [], colors: [] }, glass: Surface = { positions: [], colors: [] }, surfaces = [concrete, details, glass];
  const parts: Part[] = [], breakables: BreakableSpec[] = [], cube = new THREE.BoxGeometry(1, 1, 1), cubeVertices = cube.toNonIndexed().getAttribute('position');
  const materials = { stone: new THREE.MeshStandardMaterial({ color: 0xa8a295 }), metal: new THREE.MeshStandardMaterial({ color: 0x49514e }), glass: new THREE.MeshStandardMaterial({ color: 0x49676f }) };
  function tri(s: Surface, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: number) { const tint = new THREE.Color(color); for (const p of [a, b, c]) { s.positions.push(p.x, p.y, p.z); s.colors.push(tint.r, tint.g, tint.b); } }
  function quad(s: Surface, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, color: number) { tri(s, a, b, c, color); tri(s, a, c, d, color); }
  function box(s: Surface, centre: THREE.Vector3, size: THREE.Vector3, color: number, ex = axis, ey = up) {
    const ez = new THREE.Vector3().crossVectors(ex, ey).normalize(), tint = new THREE.Color(color);
    for (let i = 0; i < cubeVertices.count; i++) { const p = centre.clone().addScaledVector(ex, cubeVertices.getX(i) * size.x).addScaledVector(ey, cubeVertices.getY(i) * size.y).addScaledVector(ez, cubeVertices.getZ(i) * size.z); s.positions.push(p.x, p.y, p.z); s.colors.push(tint.r, tint.g, tint.b); }
  }
  function component(kind: keyof typeof materials, name: string, draw: () => void, ex = axis, convex = false, extra: Record<string, unknown> = {}) {
    const starts = surfaces.map(s => s.positions.length); draw();
    const ranges = surfaces.map((surface, i) => ({ surface, start: starts[i], end: surface.positions.length, original: new Float32Array(surface.positions.slice(starts[i])) }));
    if (ranges.every(r => r.start === r.end)) return;
    const ez = new THREE.Vector3().crossVectors(ex, up).normalize(), axes = [ex, up, ez], lows = [Infinity, Infinity, Infinity], highs = [-Infinity, -Infinity, -Infinity], p = new THREE.Vector3();
    for (const r of ranges) for (let i = 0; i < r.original.length; i += 3) { p.fromArray(r.original, i); axes.forEach((a, j) => { lows[j] = Math.min(lows[j], p.dot(a)); highs[j] = Math.max(highs[j], p.dot(a)); }); }
    const proxy: THREE.Mesh = new THREE.Mesh(cube, materials[kind]); axes.forEach((a, i) => proxy.position.addScaledVector(a, (lows[i] + highs[i]) / 2));
    proxy.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ex, up, ez)); proxy.scale.set(...highs.map((v, i) => Math.max(.025, v - lows[i]) + .008) as [number, number, number]);
    const size = proxy.scale.clone(); let collisionVertices: Float32Array | undefined;
    if (convex) { const inverse = proxy.quaternion.clone().invert(), unique = new Map<string, THREE.Vector3>(); for (const r of ranges) for (let i = 0; i < r.original.length; i += 3) { const v = new THREE.Vector3().fromArray(r.original, i).sub(proxy.position).applyQuaternion(inverse); unique.set(v.toArray().map(n => n.toFixed(5)).join(','), v); } proxy.geometry = new ConvexGeometry([...unique.values()]); collisionVertices = Float32Array.from(proxy.geometry.getAttribute('position').array); proxy.scale.setScalar(1); }
    Object.assign(proxy.userData, { buildingId: building.id, landmark: 'administration', renderProxy: true, component: name, convex, ...extra }); proxy.updateMatrix(); proxy.updateMatrixWorld(true);
    parts.push({ proxy, shown: true, ranges }); breakables.push({ mesh: proxy, size, collisionVertices, toughness: kind === 'glass' ? 6 : 11, material: kind, label: building.name });
  }
  function wallBox(s: Surface, at: (u: number, y: number, depth?: number) => THREE.Vector3, ex: THREE.Vector3, a: number, b: number, bottom: number, top: number, depth: number, thickness: number, color: number) { if (b - a > .005 && top - bottom > .005) box(s, at((a + b) / 2, (bottom + top) / 2, depth), new THREE.Vector3(b - a, top - bottom, thickness), color, ex); }
  for (let edge = 0; edge < points.length; edge++) {
    const a = points[edge], b = points[(edge + 1) % points.length], length = Math.hypot(b.x - a.x, b.z - a.z), dx = (b.x - a.x) / length, dz = (b.z - a.z) / length;
    const tangent = axis.clone().multiplyScalar(dx).addScaledVector(front, dz), outward = new THREE.Vector3().crossVectors(tangent, up).negate(), localOut = { x: dz, z: -dx };
    const frontFace = localOut.z > .8, backFace = localOut.z < -.8, longFace = frontFace || backFace, depth = frontFace ? -setback : backFace ? -1.2 : -.65;
    const at = (u: number, y: number, d = 0) => world(a.x + dx * u, y, a.z + dz * u).addScaledVector(outward, d);
    const divisions = Math.max(1, Math.ceil(length / 6)), cuts = new Set<number>([0, length]);
    for (let j = 1; j < divisions; j++) cuts.add(length * j / divisions);
    if (longFace) for (const x of [passage.minX, passage.maxX, -9, -3, 3, 9]) { const u = (x - a.x) / dx; if (u > 0 && u < length) cuts.add(u); }
    for (let j = 0; j < divisions; j++) {
      const u0 = length * j / divisions, u1 = length * (j + 1) / divisions, width = u1 - u0, bays = Math.max(1, Math.round(width / 2.45)), pitch = width / bays;
      for (let row = 0; row < 3; row++) {
        const bottom = lowerTop + upperPitch * row, top = bottom + upperPitch, sill = bottom + .75, head = top - .45;
        component('glass', 'upper-grid-window-bay', () => {
          wallBox(concrete, at, tangent, u0, u1, bottom, sill, -.14, .9, 0xa8a294); wallBox(concrete, at, tangent, u0, u1, head, top, -.14, .9, 0xb2ab9a);
          for (let k = 0; k <= bays; k++) wallBox(concrete, at, tangent, Math.max(u0, u0 + k * pitch - .13), Math.min(u1, u0 + k * pitch + .13), sill, head, -.06, 1.06, 0x9a978a);
          for (let k = 0; k < bays; k++) {
            const left = u0 + k * pitch + .13, right = u0 + (k + 1) * pitch - .13, mid = (left + right) / 2;
            quad(glass, at(left + .05, sill + .08, -.52), at(left + .05, head - .08, -.52), at(right - .05, head - .08, -.52), at(right - .05, sill + .08, -.52), [0x3e5c66, 0x496772, 0x4e6c74][(k + row + j) % 3]);
            for (const y of [sill + .045, head - .045]) quad(details, at(left, y - .045, -.41), at(left, y + .045, -.41), at(right, y + .045, -.41), at(right, y - .045, -.41), 0x3d4947);
            for (const u of [left + .025, mid, right - .025]) quad(details, at(u - .035, sill + .08, -.41), at(u - .035, head - .08, -.41), at(u + .035, head - .08, -.41), at(u + .035, sill + .08, -.41), 0x394744);
          }
        }, tangent, false, { row, outward: outward.toArray(), windowRecess: .52, frameFront: .47, edge });
      }
      component('stone', 'deep-roof-parapet', () => { wallBox(concrete, at, tangent, u0, u1, upperTop, height, -.12, .94, 0xaaa393); for (let u = u0 + 1.7; u < u1; u += 2.0) wallBox(details, at, tangent, u - .008, u + .008, upperTop + .1, height - .05, .359, .012, 0x8b887d); }, tangent);
    }
    const sorted = [...cuts].sort((x, y) => x - y);
    for (let j = 0; j + 1 < sorted.length; j++) {
      const u0 = sorted[j], u1 = sorted[j + 1], middle = (u0 + u1) / 2, x = a.x + dx * middle, z = a.z + dz * middle;
      if (longFace && x > passage.minX && x < passage.maxX) continue;
      const lobby = frontFace && Math.abs(x) < 9.001, door = frontFace && Math.abs(x) < 3.001;
      for (let level = 0; level < 2; level++) {
        if (door && level === 0) continue;
        const bottom = level * lowerTop / 2, top = (level + 1) * lowerTop / 2, count = Math.max(3, Math.ceil((u1 - u0) / .6)), groundMax = Math.max(...Array.from({ length: count + 1 }, (_, k) => { const p = at(THREE.MathUtils.lerp(u0, u1, k / count), 0, depth); return heightAt(p.x, p.z) - base; }));
        const sill = Math.max(bottom + (lobby ? .18 : .45), groundMax + .10), head = top - (lobby ? .08 : .48);
        component('glass', lobby ? 'lower-lobby-glazing' : 'lower-setback-glazing', () => {
          if (head > sill + .15) { quad(glass, at(u0 + .06, sill, depth), at(u0 + .06, head, depth), at(u1 - .06, head, depth), at(u1 - .06, sill, depth), lobby ? 0x557780 : 0x375356); for (let u = u0 + .08; u < u1; u += 1.35) quad(details, at(u - .03, sill, depth + .095), at(u - .03, head, depth + .095), at(u + .03, head, depth + .095), at(u + .03, sill, depth + .095), 0x3f4d49); }
          wallBox(details, at, tangent, u0, u1, level ? bottom : Math.min(-.4, groundMax - .4), Math.min(sill, top), depth - .14, .28, 0x3e4a44);
          wallBox(details, at, tangent, u0, u1, Math.max(head, bottom), top, depth - .14, .28, 0x38423c);
        }, tangent, false, { level, terrainClipped: true, edge });
      }
      if (!lobby && (u1 - u0) > 1.5) { const bottom = Math.min(-.4, ground(x, z) - .35); component('stone', 'lower-exposed-column', () => box(details, at(u0, (bottom + lowerTop) / 2, -.35), new THREE.Vector3(.56, lowerTop - bottom, .72), 0x46514b, tangent), tangent); }
    }
  }
  function clip(poly: Point[], coordinate: 'x' | 'z', value: number, greater: boolean) { const out: Point[] = []; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], ia = greater ? a[coordinate] >= value : a[coordinate] <= value, ib = greater ? b[coordinate] >= value : b[coordinate] <= value; if (ia) out.push(a); if (ia !== ib) { const t = (value - a[coordinate]) / (b[coordinate] - a[coordinate]); out.push({ x: THREE.MathUtils.lerp(a.x, b.x, t), z: THREE.MathUtils.lerp(a.z, b.z, t) }); } } return out; }
  function slab(poly: Point[], ys: number[], thickness: number, color: number, name: string) {
    component('stone', name, () => { const top = poly.map((p, i) => world(p.x, ys[i], p.z)), bottom = top.map(p => p.clone().addScaledVector(up, -thickness)); for (let i = 1; i < poly.length - 1; i++) { tri(details, top[0], top[i + 1], top[i], color); tri(details, bottom[0], bottom[i], bottom[i + 1], color); } for (let i = 0; i < poly.length; i++) { const j = (i + 1) % poly.length; quad(details, bottom[i], bottom[j], top[j], top[i], color); } }, axis, true);
  }
  // 원본 지도 윤곽을 잘라 지붕과 상부 바닥의 충돌체도 같은 경계를 따른다.
  for (let x = minX; x < maxX; x += 16) for (let z = minZ; z < maxZ; z += 12) {
    let poly = points; for (const [key, value, greater] of [['x', x, true], ['x', x + 16, false], ['z', z, true], ['z', z + 12, false]] as const) poly = clip(poly, key, value, greater);
    if (poly.length < 3) continue;
    for (const face of THREE.ShapeUtils.triangulateShape(poly.map(p => new THREE.Vector2(p.x, p.z)), [])) { const triangle = face.map(k => poly[k]); slab(triangle, [height - .35, height - .35, height - .35], .25, 0x8b8e83, 'mapped-roof-slab'); slab(triangle, [lowerTop, lowerTop, lowerTop], .35, 0xb0aea0, 'upper-floor-slab'); }
  }
  // 사진에 보이는 원형 덮개 3개와 각진 덮개 1개다. 용도, 치수와 앞뒤 위치는 미확인이다.
  const rooftopCovers = [
    { x: 12.8, z: -4, radius: 1.65, topRadius: 1.5, rise: 1.05, sides: 24, kind: 'round' },
    { x: -6.8, z: -4, radius: 1.65, topRadius: 1.5, rise: 1.05, sides: 24, kind: 'round' },
    { x: -19, z: -4, radius: 1.65, topRadius: 1.5, rise: 1.05, sides: 24, kind: 'round' },
    { x: -13, z: -4, radius: 2.1, topRadius: 1.15, rise: 1.55, sides: 8, kind: 'angled' },
  ];
  shell.userData.rooftopCovers = rooftopCovers; shell.userData.maximumHeightWithCovers = height + 1.2;
  for (const r of rooftopCovers) component('metal', `roof-${r.kind}-cover`, () => {
    const bottom = Array.from({ length: r.sides }, (_, i) => world(r.x + r.radius * Math.cos(i * Math.PI * 2 / r.sides), height - .35, r.z + r.radius * Math.sin(i * Math.PI * 2 / r.sides)));
    const top = Array.from({ length: r.sides }, (_, i) => world(r.x + r.topRadius * Math.cos(i * Math.PI * 2 / r.sides), height - .35 + r.rise, r.z + r.topRadius * Math.sin(i * Math.PI * 2 / r.sides)));
    for (let i = 0; i < r.sides; i++) { const j = (i + 1) % r.sides; quad(details, bottom[i], top[i], top[j], bottom[j], r.kind === 'round' ? i % 2 ? 0xb4ac90 : 0xc2b99b : 0xc5c8bf); tri(details, world(r.x, height - .35 + r.rise, r.z), top[j], top[i], r.kind === 'round' ? 0xc7bd9e : 0xd6d8cd); tri(details, world(r.x, height - .35, r.z), bottom[i], bottom[j], 0x8b8d82); }
  }, axis, true, { roofCover: true, dimensionsEstimated: true, useUnverified: true });
  // 하부의 큰 빈 공간을 유지한다. 안쪽 사무실 배치는 확인하지 않아 재현하지 않는다.
  for (const x of [passage.minX - .34, passage.maxX + .34, -9.1, 9.1]) { const bottom = Math.min(-.4, ground(x, maxZ) - .4); component('stone', 'front-major-column', () => box(details, world(x, (lowerTop + bottom) / 2, maxZ - .45), new THREE.Vector3(.68, lowerTop - bottom, .90), 0x46514a)); }
  for (const x of [passage.minX - .22, passage.maxX + .22]) {
    component('stone', 'passage-side-wall', () => box(details, world(x, lowerTop / 2, (minZ + maxZ) / 2), new THREE.Vector3(.40, lowerTop, maxZ - minZ - 1.4), 0x4e5850));
  }
  component('glass', 'central-entrance-door', () => {
    box(glass, world(0, 1.74, entryZ), new THREE.Vector3(6, 3.12, .07), 0x42616a);
    for (const x of [-3, 0, 3]) box(details, world(x, 1.74, entryZ + .055), new THREE.Vector3(.07, 3.12, .12), 0x68766d);
    for (const y of [.235, 2.68, 3.245]) box(details, world(0, y, entryZ + .06), new THREE.Vector3(6, .09, .13), 0x586760);
  }, axis, false, { entrance: true, frameDimensionsEstimated: true });
  // 문턱과 통로 바닥은 기존 DEM에 연결한다. 지형 자료나 건물 기준고도를 바꾸지 않는다.
  const floorTop = .18, apronStart = maxZ + 1.8, apronEnd = maxZ + 8.8;
  slab([{ x: -9, z: entryZ - .5 }, { x: 9, z: entryZ - .5 }, { x: 9, z: apronStart }, { x: -9, z: apronStart }], [floorTop, floorTop, floorTop, floorTop], .24, 0x999d90, 'entrance-platform');
  const rampEnd = Math.min(floorTop, ground(0, apronEnd) + .04);
  slab([{ x: -3, z: apronStart }, { x: 3, z: apronStart }, { x: 3, z: apronEnd }, { x: -3, z: apronEnd }], [floorTop, floorTop, rampEnd, rampEnd], .22, 0x9c9f91, 'entrance-ground-connection');
  for (const [left, right] of [[-9, -3.1], [3.1, 9]]) for (let i = 0; i < 6; i++) { const a = apronStart + (apronEnd - apronStart) * i / 6, b = apronStart + (apronEnd - apronStart) * (i + 1) / 6, y = THREE.MathUtils.lerp(floorTop, rampEnd, i / 6); component('stone', 'front-steps', () => box(details, world((left + right) / 2, y - .14, (a + b) / 2), new THREE.Vector3(right - left, .28, b - a), 0x9b9e90)); }
  shell.userData.entrance.approach = { endZ: apronEnd, endY: rampEnd, estimatedGameGroundConnection: true };
  const passageStart = minZ - 2, passageEnd = maxZ + 8;
  const passageY = (z: number) => z > maxZ + 1 ? THREE.MathUtils.lerp(Math.max(.12, ground(passage.centerX, maxZ + 1) + .07), ground(passage.centerX, passageEnd) + .035, (z - maxZ - 1) / 7) : Math.max(.12, ground(passage.centerX, z) + .07);
  for (let z = passageStart; z < passageEnd; z += 2) { const next = Math.min(passageEnd, z + 2), y0 = passageY(z), y1 = passageY(next); slab([{ x: passage.minX + .05, z }, { x: passage.maxX - .05, z }, { x: passage.maxX - .05, z: next }, { x: passage.minX + .05, z: next }], [y0, y0, y1, y1], .18, 0x9b9f91, 'passage-floor'); }
  for (const [s, name, roughness] of [[concrete, 'concrete-grid', .92], [details, 'dark-base-and-frames', .72], [glass, 'recessed-glazing', .26]] as const) {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(s.positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(s.colors, 3)); (geometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage); geometry.computeVertexNormals(); geometry.computeBoundingSphere(); geometry.computeBoundingBox(); s.geometry = geometry;
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness, metalness: s === glass ? .16 : .02 })); mesh.name = `administration-${name}`; mesh.receiveShadow = true; shell.add(mesh); s.positions.length = 0; s.colors.length = 0;
  }
  function update(_player: THREE.Vector3) { const changed = new Set<Surface>(); for (const part of parts) if (part.shown !== part.proxy.visible) { part.shown = part.proxy.visible; for (const r of part.ranges) { if (r.start === r.end) continue; const attr = r.surface.geometry!.getAttribute('position') as THREE.BufferAttribute; if (!changed.has(r.surface)) attr.clearUpdateRanges(); changed.add(r.surface); if (part.shown) (attr.array as Float32Array).set(r.original, r.start); else for (let i = r.start; i < r.end; i += 3) { attr.array[i] = part.proxy.position.x; attr.array[i + 1] = part.proxy.position.y; attr.array[i + 2] = part.proxy.position.z; } attr.addUpdateRange(r.start, r.end - r.start); } } for (const s of changed) s.geometry!.getAttribute('position').needsUpdate = true; shell.visible = parts.some(p => p.proxy.visible); }
  return { breakables, update };
}
