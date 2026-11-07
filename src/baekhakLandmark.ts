import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { CampusBuilding } from './fullCampus';
import type { BuildingAppearance } from './buildingAppearance';
import type { BreakableSpec } from './scene';

type Point = { x: number; z: number };
type Surface = { positions: number[]; colors: number[]; uvs: number[]; geometry?: THREE.BufferGeometry };
type Range = { surface: Surface; start: number; end: number; original: Float32Array };
type Part = { proxy: THREE.Mesh; shown: boolean; ranges: Range[] };
let brickTexture: THREE.DataTexture | undefined;
function masonryTexture() {
  if (brickTexture) return brickTexture;
  const pixels = new Uint8Array(128 * 64 * 4);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) {
    const row = Math.floor(y / 16), joint = y % 16 < 1 || (x + row % 2 * 16) % 32 < 1;
    const value = joint ? 218 : 245 + ((Math.floor((x + row % 2 * 16) / 32) * 7 + row * 11) % 11);
    pixels.set([value, value, value, 255], (y * 128 + x) * 4);
  }
  brickTexture = new THREE.DataTexture(pixels, 128, 64); brickTexture.colorSpace = THREE.SRGBColorSpace;
  brickTexture.wrapS = brickTexture.wrapT = THREE.RepeatWrapping; brickTexture.magFilter = THREE.LinearFilter;
  brickTexture.minFilter = THREE.LinearMipmapLinearFilter; brickTexture.generateMipmaps = true; brickTexture.needsUpdate = true;
  return brickTexture;
}

// 공식 지상 3층을 유지한다. 높이와 각 매스의 깊이는 실측값이 아닌 사진 비례 추정이다.
export function createBaekhakLandmark(scene: THREE.Scene, building: CampusBuilding, profile: BuildingAppearance, heightAt: (x: number, z: number) => number) {
  const points = building.points.filter((p, i, all) => i !== all.length - 1 || p[0] !== all[0][0] || p[1] !== all[0][1]).map(([x, z]) => ({ x, z }));
  if (points.length < 3) throw new Error('Baekhak landmark needs a valid footprint.');
  if (points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p.x * q.z - q.x * p.z; }, 0) < 0) points.reverse();
  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x)), minZ = Math.min(...points.map(p => p.z)), maxZ = Math.max(...points.map(p => p.z));
  const width = maxX - minX, length = maxZ - minZ, map = (u: number, v: number): Point => ({ x: minX + width * u, z: minZ + length * v });
  // 941-1동과 마주 보는 동쪽 마당을 전면으로 추정한다. 둥근 상부는 북쪽 외곽 안에 둔다.
  const entryEdge = points.map((a, i) => ({ a, b: points[(i + 1) % points.length] })).filter(({ a, b }) => Math.hypot(b.x - a.x, b.z - a.z) > 6)
    .sort((a, b) => b.a.x + b.b.x - a.a.x - a.b.x)[0];
  const entry = { x: THREE.MathUtils.lerp(entryEdge.a.x, entryEdge.b.x, .65), z: THREE.MathUtils.lerp(entryEdge.a.z, entryEdge.b.z, .65) };
  const base = heightAt(entry.x, entry.z), height = profile.height ?? 10.5, scale = height / 10.5, lowerTop = 6.4 * scale, upperTop = 9.2 * scale;
  const world = (x: number, y: number, z: number) => new THREE.Vector3(x, base + y, z), up = new THREE.Vector3(0, 1, 0), east = new THREE.Vector3(1, 0, 0), north = new THREE.Vector3(0, 0, 1);
  const ground = (x: number, z: number) => heightAt(x, z) - base;
  const shell = new THREE.Group(); shell.name = `${building.id}:baekhak-landmark`;
  Object.assign(shell.userData, { buildingId: building.id, role: 'building-shell', landmark: 'baekhak', appearance: profile,
    localOrigin: { x: (minX + maxX) / 2, y: base, z: (minZ + maxZ) / 2 }, axis: { x: 0, z: 1 }, frontFacing: { x: 1, z: 0 },
    elevationReference: { ...entry, kind: 'mapped-east-entrance', surveyed: false }, entry, dimensions: { length, depth: width, height }, lowerTop, upperTop,
    documentedLevels: 3, levelsEstimated: false, heightEstimated: true, directionEstimated: true, excludedNeighbor: 'way/439707878' }); scene.add(shell);
  const distant = new THREE.Group(); distant.visible = false;
  Object.assign(distant.userData, { buildingId: building.id, role: 'distant-building', landmark: 'baekhak' }); scene.add(distant);
  const brick: Surface = { positions: [], colors: [], uvs: [] }, detail: Surface = { positions: [], colors: [], uvs: [] }, surfaces = [brick, detail];
  const parts: Part[] = [], breakables: BreakableSpec[] = [], cube = new THREE.BoxGeometry(1, 1, 1);
  const materials = { stone: new THREE.MeshStandardMaterial({ color: 0xb77d52 }), metal: new THREE.MeshStandardMaterial({ color: 0xb6bbb0 }), glass: new THREE.MeshStandardMaterial({ color: 0x779594 }) };
  function triangle(s: Surface, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: number, uv = [0, 0, 1, 0, 1, 1]) {
    const tint = new THREE.Color(color); for (const p of [a, b, c]) { s.positions.push(p.x, p.y, p.z); s.colors.push(tint.r, tint.g, tint.b); } s.uvs.push(...uv);
  }
  function quad(s: Surface, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, color: number) {
    const w = a.distanceTo(b) / 1.1, h = b.distanceTo(c) / .33;
    triangle(s, a, b, c, color, [0, 0, w, 0, w, h]); triangle(s, a, c, d, color, [0, 0, w, h, 0, h]);
  }
  function box(s: Surface, centre: THREE.Vector3, size: THREE.Vector3, color: number, ex = east, ey = up) {
    const ez = new THREE.Vector3().crossVectors(ex, ey).normalize();
    const p = (x: number, y: number, z: number) => centre.clone().addScaledVector(ex, x * size.x / 2).addScaledVector(ey, y * size.y / 2).addScaledVector(ez, z * size.z / 2);
    for (const k of [-1, 1]) {
      quad(s, p(-1, -1, k), p(1, -1, k), p(1, 1, k), p(-1, 1, k), color);
      quad(s, p(k, -1, -1), p(k, -1, 1), p(k, 1, 1), p(k, 1, -1), color);
      quad(s, p(-1, k, -1), p(1, k, -1), p(1, k, 1), p(-1, k, 1), color);
    }
  }
  function component(kind: keyof typeof materials, name: string, draw: () => void, xAxis = east, yAxis = up) {
    const starts = surfaces.map(s => s.positions.length); draw();
    const ranges = surfaces.map((surface, i) => ({ surface, start: starts[i], end: surface.positions.length, original: new Float32Array(surface.positions.slice(starts[i])) }));
    const ex = xAxis.clone().normalize(), ey = yAxis.clone().addScaledVector(ex, -yAxis.dot(ex)).normalize(), ez = new THREE.Vector3().crossVectors(ex, ey).normalize();
    const axes = [ex, ey, ez], lows = [Infinity, Infinity, Infinity], highs = [-Infinity, -Infinity, -Infinity], p = new THREE.Vector3();
    for (const range of ranges) for (let i = 0; i < range.original.length; i += 3) { p.fromArray(range.original, i); axes.forEach((a, j) => { lows[j] = Math.min(lows[j], p.dot(a)); highs[j] = Math.max(highs[j], p.dot(a)); }); }
    const proxy: THREE.Mesh = new THREE.Mesh(cube, materials[kind]); axes.forEach((a, i) => proxy.position.addScaledVector(a, (lows[i] + highs[i]) / 2));
    proxy.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ex, ey, ez)); proxy.scale.set(...highs.map((v, i) => Math.max(.04, v - lows[i]) + .012) as [number, number, number]);
    const size = proxy.scale.clone(); let collisionVertices: Float32Array | undefined;
    if (name === 'rounded-upper-roof' || name === 'mapped-low-roof') {
      const inverse = proxy.quaternion.clone().invert(), vertices = new Map<string, THREE.Vector3>();
      for (const range of ranges) for (let i = 0; i < range.original.length; i += 3) for (const sign of [-1, 1]) {
        const v = new THREE.Vector3().fromArray(range.original, i).sub(proxy.position).applyQuaternion(inverse); v.y += sign * .025;
        vertices.set(v.toArray().map(n => n.toFixed(6)).join(','), v);
      }
      proxy.geometry = new ConvexGeometry([...vertices.values()]); collisionVertices = Float32Array.from(proxy.geometry.getAttribute('position').array); proxy.scale.setScalar(1);
    }
    Object.assign(proxy.userData, { buildingId: building.id, landmark: 'baekhak', renderProxy: true, component: name, convex: !!collisionVertices }); proxy.updateMatrix(); proxy.updateMatrixWorld(true);
    parts.push({ proxy, shown: true, ranges }); breakables.push({ mesh: proxy, size, collisionVertices, toughness: kind === 'glass' ? 6 : kind === 'metal' ? 9 : 12, material: kind, label: building.name });
  }
  const signedArea = Math.sign(points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p.x * q.z - q.x * p.z; }, 0));
  function facade(a: Point, b: Point, bottom: number, top: number, color: number, name: string, opening?: { center: number; width: number; sill: number; head: number; entry?: boolean; arch?: boolean }) {
    const span = Math.hypot(b.x - a.x, b.z - a.z), along = new THREE.Vector3((b.x - a.x) / span, 0, (b.z - a.z) / span);
    const outward = new THREE.Vector3().crossVectors(along, up).multiplyScalar(-signedArea), at = (u: number, y: number, out = 0) => world(a.x, y, a.z).addScaledVector(along, u).addScaledVector(outward, out);
    const wall = (u0: number, u1: number, y0: number, y1: number) => { if (u1 - u0 < .01 || y1 - y0 < .01) return; component('stone', name, () => box(brick, at((u0 + u1) / 2, (y0 + y1) / 2, -.12), new THREE.Vector3(u1 - u0, y1 - y0, .24), color, along), along); };
    if (!opening) { wall(0, span, bottom, top); return; }
    const x0 = Math.max(.12, opening.center - opening.width / 2), x1 = Math.min(span - .12, opening.center + opening.width / 2), sill = opening.sill, head = opening.head;
    wall(0, x0, bottom, top); wall(x1, span, bottom, top); wall(x0, x1, bottom, sill); wall(x0, x1, head, top);
    component('glass', opening.entry ? 'entrance-glazing' : opening.arch ? 'arched-front-window' : name.includes('upper') ? 'upper-setback-window' : 'low-punched-window', () => {
      if (opening.arch) {
        const middle = (x0 + x1) / 2, shoulder = head - (x1 - x0) * .22, curve = Array.from({ length: 13 }, (_, i) => ({ x: x0 + (x1 - x0) * i / 12, y: shoulder + (head - shoulder) * Math.sin(Math.PI * i / 12) }));
        for (let i = 0; i < 12; i++) { const p = curve[i], q = curve[i + 1]; quad(detail, at(p.x, sill, .025), at(q.x, sill, .025), at(q.x, q.y, .025), at(p.x, p.y, .025), 0x6c9a99); quad(brick, at(p.x, p.y, 0), at(q.x, q.y, 0), at(q.x, head, 0), at(p.x, head, 0), color); const centre = at((p.x + q.x) / 2, (p.y + q.y) / 2, .09), tangent = at(q.x, q.y).sub(at(p.x, p.y)).normalize(); box(detail, centre, new THREE.Vector3(Math.hypot(q.x - p.x, q.y - p.y), .07, .09), 0xd4cdbc, tangent, outward.clone().cross(tangent).normalize()); }
      } else quad(detail, at(x0, sill, .025), at(x1, sill, .025), at(x1, head, .025), at(x0, head, .025), 0x718f8f);
      const columns = opening.entry ? 3 : opening.width > 2.5 ? 3 : 1;
      for (let i = 0; i <= columns; i++) box(detail, at(THREE.MathUtils.lerp(x0, x1, i / columns), (sill + head) / 2, .09), new THREE.Vector3(.07, head - sill, .10), 0xd5cfbd, along);
      box(detail, at((x0 + x1) / 2, sill, .09), new THREE.Vector3(x1 - x0, .07, .10), 0xd5cfbd, along);
      if (!opening.arch) box(detail, at((x0 + x1) / 2, head, .09), new THREE.Vector3(x1 - x0, .07, .10), 0xd5cfbd, along);
    }, along);
    if (outward.x > .35) component('metal', 'small-yellow-window-lintel', () => box(detail, at((x0 + x1) / 2, head + .13, .15), new THREE.Vector3(x1 - x0 + .3, .18, .24), 0xc5a137, along), along);
    if (opening.entry) {
      shell.userData.entrance = { x: entry.x, y: base, z: entry.z, outward: outward.toArray(), width: x1 - x0 };
      component('metal', 'entrance-canopy', () => box(detail, at((x0 + x1) / 2, head + .42, .48), new THREE.Vector3(x1 - x0 + 1.3, .16, 1.32), 0xbcc4bb, along), along);
    }
  }
  // 사진에서 보이는 동쪽 낮은 벽에는 작은 창과 문을 드문드문 두고 큰 빈 벽면을 남긴다.
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length], span = Math.hypot(b.x - a.x, b.z - a.z), along = new THREE.Vector3((b.x - a.x) / span, 0, (b.z - a.z) / span), outward = new THREE.Vector3().crossVectors(along, up).multiplyScalar(-signedArea);
    const isEntry = a === entryEdge.a, eastFront = outward.x > .35, n = isEntry ? 1 : Math.max(1, Math.ceil(span / 7));
    for (let j = 0; j < n; j++) {
      const aa = { x: THREE.MathUtils.lerp(a.x, b.x, j / n), z: THREE.MathUtils.lerp(a.z, b.z, j / n) }, bb = { x: THREE.MathUtils.lerp(a.x, b.x, (j + 1) / n), z: THREE.MathUtils.lerp(a.z, b.z, (j + 1) / n) }, bay = span / n;
      const bottom = Math.min(0, ground(aa.x, aa.z), ground(bb.x, bb.z)) - .45;
      const sill = isEntry ? .10 : Math.max(.75, ground((aa.x + bb.x) / 2, (aa.z + bb.z) / 2) + .28), head = isEntry ? 2.75 : sill + (eastFront ? 1.15 : 1.55);
      const arched = eastFront && (aa.z + bb.z) / 2 < minZ + length * .1;
      const opening = (isEntry || eastFront || j % 2 === 0) ? { center: isEntry ? span * .65 : bay * .50, width: isEntry ? 4.3 : arched ? 3.0 : eastFront ? 1.65 : 2.1, sill, head, entry: isEntry, arch: arched } : undefined;
      facade(aa, bb, bottom, lowerTop, 0xbf875b, eastFront ? 'courtyard-brick-wall' : 'estimated-rear-wall', opening);
    }
    component('metal', 'thin-yellow-roof-edge', () => box(detail, world((a.x + b.x) / 2, lowerTop + .035, (a.z + b.z) / 2), new THREE.Vector3(span, .11, .18), 0xc9ad41, along), along);
  }
  function clip(poly: Point[], axis: 'x' | 'z', value: number, greater: boolean) {
    const out: Point[] = []; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], ia = greater ? a[axis] >= value : a[axis] <= value, ib = greater ? b[axis] >= value : b[axis] <= value; if (ia) out.push(a); if (ia !== ib) { const t = (value - a[axis]) / (b[axis] - a[axis]); out.push({ x: THREE.MathUtils.lerp(a.x, b.x, t), z: THREE.MathUtils.lerp(a.z, b.z, t) }); } } return out;
  }
  for (let x = minX; x < maxX; x += 6) for (let z = minZ; z < maxZ; z += 6) {
    let tile = points; for (const [axis, edge, greater] of [['x', x, true], ['x', x + 6, false], ['z', z, true], ['z', z + 6, false]] as const) tile = clip(tile, axis, edge, greater);
    if (tile.length < 3) continue; const faces = THREE.ShapeUtils.triangulateShape(tile.map(p => new THREE.Vector2(p.x, p.z)), []); if (!faces.length) continue;
    component('metal', 'mapped-low-roof', () => { for (const face of faces) { const [a, b, c] = face.map(k => world(tile[k].x, lowerTop, tile[k].z)); triangle(detail, a, b, c, 0x9fa9a0); } });
  }
  const upperA = map(.23, .12), upperB = map(.43, .59), upperOutline = [{ x: upperA.x, z: upperA.z }, { x: upperB.x, z: upperA.z }, { x: upperB.x, z: upperB.z }, { x: upperA.x, z: upperB.z }];
  for (let i = 0; i < 4; i++) {
    const a = upperOutline[i], b = upperOutline[(i + 1) % 4], span = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(span / 5));
    for (let j = 0; j < n; j++) { const aa = { x: THREE.MathUtils.lerp(a.x, b.x, j / n), z: THREE.MathUtils.lerp(a.z, b.z, j / n) }, bb = { x: THREE.MathUtils.lerp(a.x, b.x, (j + 1) / n), z: THREE.MathUtils.lerp(a.z, b.z, (j + 1) / n) }; facade(aa, bb, lowerTop, upperTop, 0x70533d, 'upper-setback-brick', { center: span / n / 2, width: Math.min(3.7, span / n - .45), sill: lowerTop + .65, head: upperTop - .45 }); }
  }
  component('metal', 'upper-white-eaves', () => box(detail, world((upperA.x + upperB.x) / 2, upperTop + .08, (upperA.z + upperB.z) / 2), new THREE.Vector3(upperB.x - upperA.x + .45, .16, upperB.z - upperA.z + .40), 0xc6ccbf));
  // 지도 북쪽 둥근 윤곽 안에 사진의 짙은 벽돌 상부를 둔다. 반지름과 높이는 근사값이다.
  const round = { ...map(.55, .775), radiusX: width * .294, radiusZ: length * .169, bottom: lowerTop, top: height };
  shell.userData.roundUpper = round;
  const count = 24;
  for (let i = 0; i < count; i++) {
    const a = i * Math.PI * 2 / count, b = (i + 1) * Math.PI * 2 / count, p = { x: round.x + Math.cos(a) * round.radiusX, z: round.z + Math.sin(a) * round.radiusZ }, q = { x: round.x + Math.cos(b) * round.radiusX, z: round.z + Math.sin(b) * round.radiusZ }, tangent = new THREE.Vector3(q.x - p.x, 0, q.z - p.z).normalize();
    for (let tier = 0; tier < 2; tier++) component('stone', 'rounded-dark-brick', () => quad(brick, world(p.x, THREE.MathUtils.lerp(lowerTop, height, tier / 2), p.z), world(q.x, THREE.MathUtils.lerp(lowerTop, height, tier / 2), q.z), world(q.x, THREE.MathUtils.lerp(lowerTop, height, (tier + 1) / 2), q.z), world(p.x, THREE.MathUtils.lerp(lowerTop, height, (tier + 1) / 2), p.z), 0x6c5144), tangent);
    component('metal', 'rounded-upper-roof', () => triangle(detail, world(round.x, height - .08, round.z), world(p.x, height - .08, p.z), world(q.x, height - .08, q.z), 0x777e74), tangent);
  }
  // 사진의 작은 옥상 설비와 녹색 격자 차양만 단순화한다. 인접 동의 노란 돌출부는 만들지 않는다.
  for (const v of [.25, .50]) { const p = map(.34, v); component('metal', 'small-rooftop-equipment', () => { box(detail, world(p.x, upperTop + .52, p.z), new THREE.Vector3(.85, .80, .90), 0xc5c8bd); box(detail, world(p.x + .44, upperTop + .52, p.z), new THREE.Vector3(.035, .53, .55), 0x78827c); }); }
  const canopy = { x0: minX + width * .25, x1: minX + width * .57, z0: minZ + length * .035, z1: minZ + length * .16, y: lowerTop + .55 };
  for (let i = 0; i <= 4; i++) { const z = THREE.MathUtils.lerp(canopy.z0, canopy.z1, i / 4); component('metal', 'green-roof-lattice', () => box(detail, world((canopy.x0 + canopy.x1) / 2, canopy.y, z), new THREE.Vector3(canopy.x1 - canopy.x0, .08, .08), 0x528a75)); }
  for (let i = 0; i <= 3; i++) { const x = THREE.MathUtils.lerp(canopy.x0, canopy.x1, i / 3); component('metal', 'green-roof-lattice', () => box(detail, world(x, canopy.y, (canopy.z0 + canopy.z1) / 2), new THREE.Vector3(.08, .08, canopy.z1 - canopy.z0), 0x528a75)); }
  for (const [s, name] of [[brick, 'masonry'], [detail, 'glazing-roofs-trim']] as const) {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(s.positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(s.colors, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(s.uvs, 2));
    (geometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage); geometry.computeVertexNormals(); geometry.computeBoundingSphere(); geometry.computeBoundingBox(); s.geometry = geometry;
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: s === brick ? .9 : .53, metalness: s === brick ? 0 : .13, map: s === brick ? masonryTexture() : null })); mesh.name = `baekhak-${name}`; mesh.receiveShadow = true; shell.add(mesh); s.positions.length = 0; s.colors.length = 0; s.uvs.length = 0;
  }
  function update(_player: THREE.Vector3) {
    const changed = new Set<Surface>();
    for (const part of parts) if (part.shown !== part.proxy.visible) {
      part.shown = part.proxy.visible;
      for (const range of part.ranges) { if (range.start === range.end) continue; const attr = range.surface.geometry!.getAttribute('position') as THREE.BufferAttribute; if (!changed.has(range.surface)) attr.clearUpdateRanges(); changed.add(range.surface); if (part.shown) (attr.array as Float32Array).set(range.original, range.start); else for (let i = range.start; i < range.end; i += 3) { attr.array[i] = part.proxy.position.x; attr.array[i + 1] = part.proxy.position.y; attr.array[i + 2] = part.proxy.position.z; } attr.addUpdateRange(range.start, range.end - range.start); }
    }
    for (const s of changed) s.geometry!.getAttribute('position').needsUpdate = true;
    shell.visible = parts.some(p => p.proxy.visible);
  }
  return { breakables, update };
}
