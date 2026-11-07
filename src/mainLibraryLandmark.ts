import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { CampusBuilding } from './fullCampus';
import type { BuildingAppearance } from './buildingAppearance';
import type { BreakableSpec } from './scene';

type Point = { x: number; z: number };
type Surface = { positions: number[]; colors: number[]; geometry?: THREE.BufferGeometry };
type Range = { surface: Surface; start: number; end: number; original: Float32Array };
type Part = { proxy: THREE.Mesh; shown: boolean; ranges: Range[] };

// 28m는 기존 배치와 관정관 밑면 간격을 보존하는 추정치다. 공식 실측 높이로 사용하지 않는다.
export function createMainLibraryLandmark(scene: THREE.Scene, building: CampusBuilding, profile: BuildingAppearance, heightAt: (x: number, z: number) => number) {
  const mapped = building.points.filter((p, i, all) => i !== all.length - 1 || p[0] !== all[0][0] || p[1] !== all[0][1]);
  if (mapped.length < 3) throw new Error('Main library needs a valid mapped footprint.');
  const cx = mapped.reduce((s, p) => s + p[0], 0) / mapped.length, cz = mapped.reduce((s, p) => s + p[1], 0) / mapped.length;
  let longest = 0, ux = 1, uz = 0;
  for (let i = 0; i < mapped.length; i++) { const p = mapped[i], q = mapped[(i + 1) % mapped.length], length = Math.hypot(q[0] - p[0], q[1] - p[1]); if (length > longest) { longest = length; ux = (q[0] - p[0]) / length; uz = (q[1] - p[1]) / length; } }
  if (ux < 0) { ux = -ux; uz = -uz; }
  const axis = new THREE.Vector3(ux, 0, uz), front = new THREE.Vector3(-uz, 0, ux), up = new THREE.Vector3(0, 1, 0);
  const points = mapped.map(p => ({ x: (p[0] - cx) * ux + (p[1] - cz) * uz, z: -(p[0] - cx) * uz + (p[1] - cz) * ux }));
  if (points.reduce((s, p, i) => { const q = points[(i + 1) % points.length]; return s + p.x * q.z - q.x * p.z; }, 0) < 0) points.reverse();
  const base = heightAt(cx, cz), roofHeight = 28, lowerTop = 8, upperPitch = 4.65, upperTop = lowerTop + upperPitch * 4;
  const world = (x: number, y: number, z: number) => new THREE.Vector3(cx + x * ux - z * uz, base + y, cz + x * uz + z * ux);
  const ground = (x: number, z: number) => { const p = world(x, 0, z); return heightAt(p.x, p.z) - base; };
  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x)), minZ = Math.min(...points.map(p => p.z)), maxZ = Math.max(...points.map(p => p.z));
  const entryZ = (points.filter(p => p.z > maxZ - .2).reduce((s, p) => s + p.z, 0) / points.filter(p => p.z > maxZ - .2).length) - 2.2;
  const shell = new THREE.Group(); shell.name = `${building.id}:main-library-landmark`;
  Object.assign(shell.userData, { buildingId: building.id, role: 'building-shell', landmark: 'main-library', appearance: profile,
    localOrigin: { x: cx, y: base, z: cz }, axis: { x: ux, z: uz }, frontFacing: { x: front.x, z: front.z },
    dimensions: { length: maxX - minX, depth: maxZ - minZ, height: 31.2 }, mainRoofHeight: roofHeight, lowerTop, upperPitch,
    mappedOutline: mapped.map(p => p.slice()), mappedOutlinePreserved: true, rooftopOpenCourtyards: 0,
    elevationReference: { x: cx, z: cz, kind: 'mapped-main-library-centre', surveyed: false },
    levels: { currentFloorLabels: 6, historicAboveGround: 4, historicBelowGround: 2, upperWindowRows: 4, lowerRecessedLevels: 2 },
    heightEstimated: true, detailDimensionsEstimated: true, entrance: { x: 0, z: entryZ, floor: .12, width: 6.2, height: 3.25 },
    sidePassage: { centerZ: 0, width: 8, ceiling: lowerTop },
    rooftopStructures: [{ x: -24, z: 10, sx: 16, sz: 12, height: 3.2 }, { x: 24, z: 10, sx: 16, sz: 12, height: 3.2 }] });
  scene.add(shell);
  const distant = new THREE.Group(); distant.visible = false;
  Object.assign(distant.userData, { buildingId: building.id, role: 'distant-building', landmark: 'main-library' }); scene.add(distant);
  const concrete: Surface = { positions: [], colors: [] }, details: Surface = { positions: [], colors: [] }, glass: Surface = { positions: [], colors: [] }, surfaces = [concrete, details, glass];
  const parts: Part[] = [], breakables: BreakableSpec[] = [], cube = new THREE.BoxGeometry(1, 1, 1), cubeVertices = cube.toNonIndexed().getAttribute('position');
  const materials = { stone: new THREE.MeshStandardMaterial({ color: 0xb4ad9e }), metal: new THREE.MeshStandardMaterial({ color: 0x969b91 }), glass: new THREE.MeshStandardMaterial({ color: 0x658e8d }), wood: new THREE.MeshStandardMaterial({ color: 0xa48a63 }) };
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
    if (convex) {
      const inverse = proxy.quaternion.clone().invert(), unique = new Map<string, THREE.Vector3>();
      for (const r of ranges) for (let i = 0; i < r.original.length; i += 3) { const v = new THREE.Vector3().fromArray(r.original, i).sub(proxy.position).applyQuaternion(inverse); unique.set(v.toArray().map(n => n.toFixed(5)).join(','), v); }
      proxy.geometry = new ConvexGeometry([...unique.values()]); collisionVertices = Float32Array.from(proxy.geometry.getAttribute('position').array); proxy.scale.setScalar(1);
    }
    Object.assign(proxy.userData, { buildingId: building.id, landmark: 'main-library', renderProxy: true, component: name, convex, ...extra }); proxy.updateMatrix(); proxy.updateMatrixWorld(true);
    parts.push({ proxy, shown: true, ranges }); breakables.push({ mesh: proxy, size, collisionVertices, toughness: kind === 'glass' ? 6 : 11, material: kind, label: building.name });
  }
  function wallBox(s: Surface, at: (u: number, y: number, depth?: number) => THREE.Vector3, ex: THREE.Vector3, a: number, b: number, bottom: number, top: number, depth: number, thickness: number, color: number) {
    if (b - a > .005 && top - bottom > .005) box(s, at((a + b) / 2, (bottom + top) / 2, depth), new THREE.Vector3(b - a, top - bottom, thickness), color, ex);
  }
  // 창 밖으로 돌출한 네 면의 틀을 실제 기하로 만든다.
  function upperBay(a: Point, b: Point, row: number) {
    const length = Math.hypot(b.x - a.x, b.z - a.z), dx = (b.x - a.x) / length, dz = (b.z - a.z) / length;
    const tangent = axis.clone().multiplyScalar(dx).addScaledVector(front, dz), outward = new THREE.Vector3().crossVectors(tangent, up).negate();
    const at = (u: number, y: number, depth = 0) => world(a.x + dx * u, y, a.z + dz * u).addScaledVector(outward, depth);
    const bottom = lowerTop + row * upperPitch, top = bottom + upperPitch, sill = bottom + 2.10, head = top - .36, count = Math.max(1, Math.round(length / 3.1)), pitch = length / count;
    component('glass', 'upper-recessed-window-bay', () => {
      wallBox(concrete, at, tangent, 0, length, bottom, sill, -.18, .42, 0xb6b09f); wallBox(concrete, at, tangent, 0, length, head, top, -.18, .42, 0xb4ad9e);
      quad(details, at(0, bottom + .85, .037), at(0, bottom + .875, .037), at(length, bottom + .875, .037), at(length, bottom + .85, .037), 0x84877f);
      for (let i = 0; i <= count; i++) wallBox(concrete, at, tangent, Math.max(0, i * pitch - .17), Math.min(length, i * pitch + .17), sill, head, -.10, .72, 0x99988a);
      for (let i = 0; i < count; i++) {
        const left = i * pitch + .17, right = (i + 1) * pitch - .17;
        // 유리는 깊이 0.36m 안으로 넣고, 네 면의 콘크리트 틀을 바깥쪽까지 잇는다.
        quad(glass, at(left, sill + .08, -.36), at(left, head - .08, -.36), at(right, head - .08, -.36), at(right, sill + .08, -.36), [0x729594, 0x628886, 0x769d9a][(i + row) % 3]);
        for (const y of [sill, head]) wallBox(concrete, at, tangent, left, right, y - .07, y + .07, -.10, .72, 0x99988a);
        const mid = (left + right) / 2; quad(details, at(mid - .035, sill + .08, -.30), at(mid - .035, head - .08, -.30), at(mid + .035, head - .08, -.30), at(mid + .035, sill + .08, -.30), 0x747e76);
      }
    }, tangent, false, { row, outward: outward.toArray(), windowRecess: .36, frameFront: .26 });
  }
  // 외곽의 각 변을 나눠 오목한 모서리와 출입구를 별도 충돌 구역으로 처리한다.
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length], length = Math.hypot(b.x - a.x, b.z - a.z), dx = (b.x - a.x) / length, dz = (b.z - a.z) / length;
    const tangent = axis.clone().multiplyScalar(dx).addScaledVector(front, dz), outward = new THREE.Vector3().crossVectors(tangent, up).negate();
    const localOut = { x: dz, z: -dx }, isFront = localOut.z > .8, isSide = Math.abs(localOut.x) > .8;
    const at = (u: number, y: number, depth = 0) => world(a.x + dx * u, y, a.z + dz * u).addScaledVector(outward, depth);
    const count = Math.max(1, Math.ceil(length / 7.5));
    for (let j = 0; j < count; j++) {
      const u0 = length * j / count, u1 = length * (j + 1) / count, aa = { x: a.x + dx * u0, z: a.z + dz * u0 }, bb = { x: a.x + dx * u1, z: a.z + dz * u1 };
      for (let row = 0; row < 4; row++) upperBay(aa, bb, row);
      component('stone', 'upper-parapet', () => wallBox(concrete, at, tangent, u0, u1, upperTop, roofHeight, -.19, .45, 0xaaa89a), tangent);
      component('metal', 'roof-rail', () => { wallBox(details, at, tangent, u0, u1, roofHeight - .08, roofHeight, -.18, .18, 0xa8ada3); for (let t = u0 + 1; t < u1; t += 2.7) wallBox(details, at, tangent, t - .045, t + .045, roofHeight - .35, roofHeight, -.18, .08, 0x8b9288); }, tangent);
    }
    const cuts = new Set<number>([0, length]); for (let j = 1; j < count; j++) cuts.add(length * j / count);
    // 사진의 북서쪽 낮은 문과 두 측면의 열린 통로를 외피에서 따로 뺀다.
    if (isFront && Math.abs(dx) > .1) for (const x of [-3.1, 3.1]) { const t = (x - a.x) / dx; if (t > 0 && t < length) cuts.add(t); }
    if (isSide && Math.abs(dz) > .1) for (const z of [-4, 4]) { const t = (z - a.z) / dz; if (t > 0 && t < length) cuts.add(t); }
    const sorted = [...cuts].sort((x, y) => x - y);
    for (let j = 0; j < sorted.length - 1; j++) {
      const u0 = sorted[j], u1 = sorted[j + 1], middle = (u0 + u1) / 2, x = a.x + dx * middle, z = a.z + dz * middle;
      const portal = isFront && Math.abs(x) < 3.101, passage = isSide && Math.abs(z) < 4.001;
      if (passage) continue;
      for (let level = 0; level < 2; level++) {
        if (portal && level === 0) continue;
        const bottom = level * 4, top = (level + 1) * 4;
        const n = Math.max(3, Math.ceil((u1 - u0) / .8)), groundMax = Math.max(...Array.from({ length: n + 1 }, (_, k) => { const p = at(THREE.MathUtils.lerp(u0, u1, k / n), 0, -2.2); return heightAt(p.x, p.z) - base; }));
        const sill = Math.max(bottom + .65, groundMax + .08), head = top - .48;
        component('glass', 'lower-setback-glazing', () => {
          // 경사면 아래의 하부 유리만 생략한다. 위층 창의 기준 높이는 옮기지 않는다.
          if (head > sill + .2) {
            quad(glass, at(u0 + .08, sill, -2.2), at(u0 + .08, head, -2.2), at(u1 - .08, head, -2.2), at(u1 - .08, sill, -2.2), 0x658f89);
            for (let u = u0 + .08; u < u1; u += 1.05) quad(details, at(u - .035, sill, -2.15), at(u - .035, head, -2.15), at(u + .035, head, -2.15), at(u + .035, sill, -2.15), 0x747f73);
          }
          wallBox(concrete, at, tangent, u0, u1, level ? bottom : Math.min(bottom, groundMax) - .5, Math.min(sill, top), -2.36, .36, 0xa7aa9d);
          wallBox(concrete, at, tangent, u0, u1, Math.max(head, bottom), top, -2.36, .36, 0xacae9f);
        }, tangent, false, { level, terrainClipped: true });
      }
    }
    for (let j = 0; j <= count; j++) {
      const u = length * j / count, x = a.x + dx * u, z = a.z + dz * u;
      if (isFront && Math.abs(x) < 4.3 || isSide && Math.abs(z) < 4.5) continue;
      const bottom = Math.min(-.5, ground(x, z) - .35);
      component('stone', 'lower-exposed-column', () => box(concrete, at(u, (bottom + lowerTop) / 2, -.32), new THREE.Vector3(.64, lowerTop - bottom, .90), 0xaeb0a1, tangent), tangent);
    }
  }
  function clip(poly: Point[], coordinate: 'x' | 'z', value: number, greater: boolean) { const out: Point[] = []; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], ia = greater ? a[coordinate] >= value : a[coordinate] <= value, ib = greater ? b[coordinate] >= value : b[coordinate] <= value; if (ia) out.push(a); if (ia !== ib) { const t = (value - a[coordinate]) / (b[coordinate] - a[coordinate]); out.push({ x: THREE.MathUtils.lerp(a.x, b.x, t), z: THREE.MathUtils.lerp(a.z, b.z, t) }); } } return out; }
  function prism(poly: Point[], y: number, thickness: number, color: number, name: string) {
    component('stone', name, () => { const bottom = poly.map(p => world(p.x, y - thickness, p.z)), top = poly.map(p => world(p.x, y, p.z)); for (let i = 1; i < poly.length - 1; i++) { tri(details, top[0], top[i + 1], top[i], color); tri(details, bottom[0], bottom[i], bottom[i + 1], color); } for (let i = 0; i < poly.length; i++) { const j = (i + 1) % poly.length; quad(details, bottom[i], bottom[j], top[j], top[i], color); } }, axis, true);
  }
  // 실제 윤곽을 삼각형으로 나눈 지붕과 바닥이다. 오목한 모서리 바깥에는 충돌체를 두지 않는다.
  for (let x = minX; x < maxX; x += 18) for (let z = minZ; z < maxZ; z += 18) {
    let poly = points; for (const [key, value, greater] of [['x', x, true], ['x', x + 18, false], ['z', z, true], ['z', z + 18, false]] as const) poly = clip(poly, key, value, greater);
    if (poly.length < 3) continue;
    for (const face of THREE.ShapeUtils.triangulateShape(poly.map(p => new THREE.Vector2(p.x, p.z)), [])) {
      const triangle = face.map(k => poly[k]); prism(triangle, roofHeight - .38, .25, 0x92978e, 'mapped-roof-slab'); prism(triangle, .12, .3, 0x9b9e91, 'mapped-ground-floor');
    }
  }
  // 낮은 정면의 짧은 차양과 유리문은 각각 파괴된다. 실내 방 배치는 재현하지 않는다.
  component('glass', 'low-front-entrance-glass', () => { box(glass, world(0, 1.74, entryZ), new THREE.Vector3(6.2, 3.25, .07), 0x4e7470); for (const x of [-3.1, 0, 3.1]) box(details, world(x, 1.74, entryZ + .06), new THREE.Vector3(.075, 3.25, .12), 0x7d857a); }, axis, false, { entrance: true });
  component('stone', 'short-front-canopy', () => box(concrete, world(0, 4.0, entryZ + 1.9), new THREE.Vector3(8.0, .46, 5.2), 0xc0c0ae));
  for (const x of [-3.85, 3.85]) component('stone', 'front-canopy-column', () => box(concrete, world(x, 1.90, entryZ + 3.1), new THREE.Vector3(.44, 3.8, .55), 0xb3b5a4));
  // 외부 DEM과 문턱의 단차를 잇는 짧은 접근면이다. 실제 경사로 치수나 측량값은 아니다.
  const rampNear = maxZ + .2, rampEnd = entryZ + 6.5, rampY = Math.min(.12, ground(0, rampEnd) + .03);
  prism([{ x: -3.1, z: entryZ - .4 }, { x: 3.1, z: entryZ - .4 }, { x: 3.1, z: rampNear }, { x: -3.1, z: rampNear }], .12, .25, 0xa4a797, 'entrance-threshold-floor');
  const ramp = [{ x: -3.1, z: rampNear }, { x: 3.1, z: rampNear }, { x: 3.1, z: rampEnd }, { x: -3.1, z: rampEnd }];
  component('stone', 'entrance-ground-connection', () => { const top = ramp.map((p, i) => world(p.x, i < 2 ? .12 : rampY, p.z)), bottom = top.map(p => p.clone().addScaledVector(up, -.25)); quad(details, top[0], top[3], top[2], top[1], 0xa4a797); quad(details, bottom[0], bottom[1], bottom[2], bottom[3], 0xa4a797); for (let i = 0; i < 4; i++) quad(details, bottom[i], bottom[(i + 1) % 4], top[(i + 1) % 4], top[i], 0xa4a797); }, axis, true);
  shell.userData.entrance.approach = { endZ: rampEnd, endY: rampY, estimatedGameGroundConnection: true };
  // 공식 항공사진의 흰 구조물 두 개는 막힌 옥상실이다. 중정이나 관통 구멍으로 만들지 않는다.
  for (const r of shell.userData.rooftopStructures as { x: number; z: number; sx: number; sz: number; height: number }[]) {
    for (const side of [-1, 1]) {
      for (let half = 0; half < 2; half++) component('stone', 'white-rooftop-room-wall', () => box(concrete, world(r.x - r.sx / 2 + (half + .5) * r.sx / 2, roofHeight + r.height / 2, r.z + side * r.sz / 2), new THREE.Vector3(r.sx / 2, r.height, .24), 0xd6d7ca));
      component('stone', 'white-rooftop-room-end', () => box(concrete, world(r.x + side * r.sx / 2, roofHeight + r.height / 2, r.z), new THREE.Vector3(.24, r.height, r.sz), 0xd0d4c8));
    }
    for (let half = 0; half < 2; half++) component('metal', 'white-rooftop-room-roof', () => box(details, world(r.x - r.sx / 2 + (half + .5) * r.sx / 2, roofHeight + r.height - .12, r.z), new THREE.Vector3(r.sx / 2 + .15, .24, r.sz + .25), 0xe0e1d2));
    component('metal', 'rooftop-room-door', () => box(details, world(r.x + 3, roofHeight + 1.1, r.z + r.sz / 2 + .14), new THREE.Vector3(1.2, 2.15, .035), 0x84938f));
  }
  for (const z of [-18, -10]) for (let x = -34; x < 35; x += 12) {
    component('wood', 'roof-garden-deck', () => box(details, world(x + 5.5, roofHeight - .15, z), new THREE.Vector3(11, .16, 4.5), 0xa48a63));
    component('stone', 'roof-garden-planter', () => { box(details, world(x + 5.5, roofHeight + .08, z + 3.1), new THREE.Vector3(10.7, .40, 1.8), 0x8b907c); box(details, world(x + 5.5, roofHeight + .34, z + 3.1), new THREE.Vector3(10.2, .16, 1.3), 0x728251); });
  }
  for (const [s, name, roughness] of [[concrete, 'concrete-structure', .92], [details, 'frames-roofs-garden', .68], [glass, 'recessed-glazing', .28]] as const) {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(s.positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(s.colors, 3)); (geometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage); geometry.computeVertexNormals(); geometry.computeBoundingSphere(); geometry.computeBoundingBox(); s.geometry = geometry;
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness, metalness: s === glass ? .16 : .02 })); mesh.name = `main-library-${name}`; mesh.receiveShadow = true; shell.add(mesh); s.positions.length = 0; s.colors.length = 0;
  }
  function update(_player: THREE.Vector3) { const changed = new Set<Surface>(); for (const part of parts) if (part.shown !== part.proxy.visible) { part.shown = part.proxy.visible; for (const r of part.ranges) { if (r.start === r.end) continue; const attr = r.surface.geometry!.getAttribute('position') as THREE.BufferAttribute; if (!changed.has(r.surface)) attr.clearUpdateRanges(); changed.add(r.surface); if (part.shown) (attr.array as Float32Array).set(r.original, r.start); else for (let i = r.start; i < r.end; i += 3) { attr.array[i] = part.proxy.position.x; attr.array[i + 1] = part.proxy.position.y; attr.array[i + 2] = part.proxy.position.z; } attr.addUpdateRange(r.start, r.end - r.start); } } for (const s of changed) s.geometry!.getAttribute('position').needsUpdate = true; shell.visible = parts.some(p => p.proxy.visible); }
  return { breakables, update };
}
