import * as THREE from 'three';
import type { CampusBuilding } from './fullCampus';
import type { BuildingAppearance } from './buildingAppearance';
import type { BreakableSpec } from './scene';

type Surface = { positions: number[]; colors: number[]; geometry?: THREE.BufferGeometry };
type Range = { surface: Surface; start: number; end: number; original: Float32Array };
type Part = { proxy: THREE.Mesh; ranges: Range[]; shown: boolean };

// 최고 높이와 지붕 비례는 공식 외관 사진에 따른 추정이다. 1998년 계획의 층수를 준공 층수로 확정하지 않는다.
export function createEngineerHouseLandmark(
  scene: THREE.Scene,
  building: CampusBuilding,
  profile: BuildingAppearance,
  heightAt: (x: number, z: number) => number,
) {
  const points = building.points.filter((p, i, all) => i !== all.length - 1 || p[0] !== all[0][0] || p[1] !== all[0][1]);
  let longest = 0, ux = 1, uz = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length], dx = b[0] - a[0], dz = b[1] - a[1], distance = Math.hypot(dx, dz);
    if (distance > longest) { longest = distance; ux = dx / distance; uz = dz / distance; }
  }
  if (points.length < 3 || longest < 1) throw new Error('Engineer House footprint must contain a valid building outline.');
  if (ux < 0) { ux = -ux; uz = -uz; }
  const along = points.map(p => p[0] * ux + p[1] * uz), across = points.map(p => -p[0] * uz + p[1] * ux);
  const length = Math.max(...along) - Math.min(...along), mappedDepth = Math.max(...across) - Math.min(...across);
  const mx = (Math.min(...along) + Math.max(...along)) / 2, mz = (Math.min(...across) + Math.max(...across)) / 2;
  const cx = mx * ux - mz * uz, cz = mx * uz + mz * ux, base = heightAt(cx, cz);
  const top = profile.height ?? 10.1, scale = top / 10.1, wallTop = 4.3 * scale, metalRidge = 8.3 * scale;
  const depth = mappedDepth - 5.6, roofHalfDepth = depth / 2 + .9, skylightHalf = length * .17;
  const frontZ = depth / 2, porchFront = mappedDepth / 2 + .1, centralCanopyTop = 5.5 * scale, sideCanopyTop = 4.25 * scale;
  const orientation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(uz, ux));
  const world = (x: number, y: number, z: number) => new THREE.Vector3(cx + ux * x - uz * z, base + y, cz + uz * x + ux * z);
  const shell = new THREE.Group(); shell.name = `${building.id}:engineer-house-landmark`;
  Object.assign(shell.userData, {
    buildingId: building.id, role: 'building-shell', landmark: 'engineer-house', appearance: profile,
    dimensions: { length, depth: mappedDepth, height: top }, localOrigin: { x: cx, y: base, z: cz },
    axis: { x: ux, z: uz }, front: { x: -uz, z: ux }, bodyDepth: depth, wallTop, metalRidge, skylightHalf,
    dimensionsEstimated: true,
  }); scene.add(shell);
  const distant = new THREE.Group(); distant.name = `${building.id}:engineer-house-distant`; distant.visible = false;
  Object.assign(distant.userData, { buildingId: building.id, role: 'distant-building', landmark: 'engineer-house' }); scene.add(distant);
  const opaque: Surface = { positions: [], colors: [] }, glass: Surface = { positions: [], colors: [] };
  const surfaces = [opaque, glass], parts: Part[] = [], breakables: BreakableSpec[] = [], cube = new THREE.BoxGeometry(1, 1, 1);
  const axisX = new THREE.Vector3(1, 0, 0), axisY = new THREE.Vector3(0, 1, 0);
  const proxyMaterials = {
    stone: new THREE.MeshStandardMaterial({ color: 0xa5afa8 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xd3d0b9 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x607d8b }),
  };
  function triangle(surface: Surface, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, hex: number) {
    const color = new THREE.Color(hex); for (const p of [a, b, c]) { surface.positions.push(p.x, p.y, p.z); surface.colors.push(color.r, color.g, color.b); }
  }
  function quad(surface: Surface, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, hex: number) {
    triangle(surface, a, b, c, hex); triangle(surface, a, c, d, hex);
  }
  function component(x: number, y: number, z: number, sx: number, sy: number, sz: number, kind: keyof typeof proxyMaterials, name: string, draw: () => void, rotation?: THREE.Quaternion) {
    const proxy = new THREE.Mesh(cube, proxyMaterials[kind]); proxy.position.copy(world(x, y, z)); proxy.quaternion.copy(orientation);
    if (rotation) proxy.quaternion.multiply(rotation); proxy.scale.set(sx + .025, sy + .025, sz + .025);
    Object.assign(proxy.userData, { buildingId: building.id, renderProxy: true, landmark: 'engineer-house', component: name }); proxy.updateMatrix(); proxy.updateMatrixWorld(true);
    const starts = surfaces.map(surface => surface.positions.length); draw();
    const ranges = surfaces.map((surface, i) => ({ surface, start: starts[i], end: surface.positions.length, original: new Float32Array(surface.positions.slice(starts[i])) }));
    parts.push({ proxy, ranges, shown: true });
    breakables.push({ mesh: proxy, size: proxy.scale.clone(), toughness: kind === 'glass' ? 6 : 11, label: building.name, material: kind });
  }
  function box(x: number, y: number, z: number, sx: number, sy: number, sz: number, hex: number, rotation?: THREE.Quaternion) {
    const p = (a: number, b: number, c: number) => {
      const v = new THREE.Vector3(a * sx / 2, b * sy / 2, c * sz / 2); if (rotation) v.applyQuaternion(rotation); return world(x + v.x, y + v.y, z + v.z);
    };
    for (const side of [-1, 1]) {
      quad(opaque, p(-1, -1, side), p(1, -1, side), p(1, 1, side), p(-1, 1, side), hex);
      quad(opaque, p(side, -1, -1), p(side, -1, 1), p(side, 1, 1), p(side, 1, -1), hex);
      quad(opaque, p(-1, side, -1), p(1, side, -1), p(1, side, 1), p(-1, side, 1), hex);
    }
  }
  function beam(a: THREE.Vector3, b: THREE.Vector3, width: number, name: string, hex = 0xe1dfcb) {
    const delta = b.clone().sub(a), midpoint = a.clone().add(b).multiplyScalar(.5), rotation = new THREE.Quaternion().setFromUnitVectors(axisY, delta.clone().normalize());
    component(midpoint.x, midpoint.y, midpoint.z, width, delta.length(), width, 'metal', name, () => box(midpoint.x, midpoint.y, midpoint.z, width, delta.length(), width, hex, rotation), rotation);
  }
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  function panel(horizontal: boolean, plane: number, lo: number, hi: number, front: boolean) {
    const x = horizontal ? (lo + hi) / 2 : plane, z = horizontal ? plane : (lo + hi) / 2;
    const p0 = world(horizontal ? lo : x, 0, horizontal ? z : lo), p1 = world(horizontal ? hi : x, 0, horizontal ? z : hi);
    const bottom = Math.min(heightAt(p0.x, p0.z), heightAt(p1.x, p1.z), base) - base - .4;
    component(x, (bottom + wallTop) / 2, z, horizontal ? hi - lo : .5, wallTop - bottom, horizontal ? .5 : hi - lo, 'stone', front && Math.abs(x) < skylightHalf ? 'entry-glazing' : 'low-body-wall', () => {
      box(x, (bottom + wallTop) / 2, z, horizontal ? hi - lo : .5, wallTop - bottom, horizontal ? .5 : hi - lo, 0x83918a);
      const windowWide = front && Math.abs(x) < skylightHalf;
      const opening = windowWide ? .94 : .42, windowBottom = .35, windowTop = wallTop - .4;
      for (const side of [-1, 1]) {
        const p = (a: number, y: number) => horizontal ? world(a, y, plane + side * .26) : world(plane + side * .26, y, a);
        const wl = (lo + hi) / 2;
        const left = wl - (hi - lo) * opening / 2, right = wl + (hi - lo) * opening / 2;
        quad(glass, p(left, windowBottom), p(right, windowBottom), p(right, windowTop), p(left, windowTop), 0x536f78);
        for (let a = left; a <= right + .01; a += 1.15) {
          if (horizontal) box(a, (windowTop + windowBottom) / 2, plane + side * .28, .075, windowTop - windowBottom, .08, 0xd5d4be);
          else box(plane + side * .28, (windowTop + windowBottom) / 2, a, .08, windowTop - windowBottom, .075, 0xd5d4be);
        }
        for (const y of [1.55, 2.85]) {
          if (horizontal) box((left + right) / 2, y * scale, plane + side * .28, right - left, .07, .08, 0xc8cdbb);
          else box(plane + side * .28, y * scale, (left + right) / 2, .08, .07, right - left, 0xc8cdbb);
        }
      }
      if (horizontal && !windowWide) {
        const width = (hi - lo) * (1 - opening) / 2;
        for (let y = .25; y < wallTop; y += .18) for (const middle of [lo + width / 2, hi - width / 2]) box(middle, y, z, width, .028, .53, 0xa6b2a8);
      }
    });
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 12; i++) panel(true, side * depth / 2, -length / 2 + i * length / 12, -length / 2 + (i + 1) * length / 12, side > 0);
    for (let i = 0; i < 6; i++) panel(false, side * length / 2, -depth / 2 + i * depth / 6, -depth / 2 + (i + 1) * depth / 6, false);
  }

  // 중앙 채광부만 흰 골조의 상단까지 올라오고, 양옆 금속 지붕은 더 낮게 이어진다.
  const xCuts = [-length / 2, -skylightHalf, skylightHalf, length / 2];
  for (const side of [-1, 1]) for (let region = 0; region < 3; region++) {
    const glazing = region === 1, from = xCuts[region], to = xCuts[region + 1], columns = Math.ceil((to - from) / 5), apex = glazing ? top - .15 : metalRidge;
    for (let col = 0; col < columns; col++) for (let row = 0; row < 4; row++) {
      const x0 = from + (to - from) * col / columns, x1 = from + (to - from) * (col + 1) / columns;
      const t0 = row / 4, t1 = (row + 1) / 4, z0 = side * roofHalfDepth * (1 - t0), z1 = side * roofHalfDepth * (1 - t1);
      const y0 = wallTop + (apex - wallTop) * t0, y1 = wallTop + (apex - wallTop) * t1;
      const tilt = new THREE.Quaternion().setFromAxisAngle(axisX, -Math.atan2(y1 - y0, z1 - z0));
      component((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, .36, Math.hypot(y1 - y0, z1 - z0), glazing ? 'glass' : 'metal', glazing ? 'central-skylight' : 'sloped-metal-roof', () => {
        quad(glazing ? glass : opaque, world(x0, y0, z0), world(x1, y0, z0), world(x1, y1, z1), world(x0, y1, z1), glazing ? 0x698394 : [0xc0c3a9, 0xb3bda5, 0xc9cab2][col % 3]);
        const spacing = glazing ? 1.3 : .29;
        for (let x = Math.ceil(x0 / spacing) * spacing; x < x1; x += spacing) quad(opaque, world(x - .025, y0 + .035, z0), world(x + .025, y0 + .035, z0), world(x + .025, y1 + .035, z1), world(x - .025, y1 + .035, z1), glazing ? 0xe0dcc8 : 0x8eaa9f);
        if (glazing) {
          const t = Math.min(t1, t0 + .011), z = side * roofHalfDepth * (1 - t), y = wallTop + (apex - wallTop) * t;
          quad(opaque, world(x0, y0 + .04, z0), world(x1, y0 + .04, z0), world(x1, y + .04, z), world(x0, y + .04, z), 0xc6cbbd);
        }
      }, tilt);
    }
  }
  // 중앙 유리와 낮은 금속 지붕의 높이 차를 얇은 유리 측면으로 닫는다.
  for (const x of [-skylightHalf, skylightHalf]) for (const side of [-1, 1]) for (let row = 0; row < 5; row++) {
    const z0 = side * roofHalfDepth * (1 - row / 5), z1 = side * roofHalfDepth * (1 - (row + 1) / 5);
    const low0 = wallTop + (metalRidge - wallTop) * row / 5, low1 = wallTop + (metalRidge - wallTop) * (row + 1) / 5;
    const high0 = wallTop + (top - .15 - wallTop) * row / 5, high1 = wallTop + (top - .15 - wallTop) * (row + 1) / 5;
    component(x, (Math.min(low0, low1) + Math.max(high0, high1)) / 2, (z0 + z1) / 2, .3, Math.max(high0, high1) - Math.min(low0, low1), Math.abs(z1 - z0), 'glass', 'skylight-cheek', () => quad(glass, world(x, low0, z0), world(x, low1, z1), world(x, high1, z1), world(x, high0, z0), 0x5f7b86));
  }
  // 작은 세로 구간으로 박공을 나눠 경사 지붕 위의 빈 모서리를 막지 않는다.
  for (const end of [-1, 1]) for (let i = 0; i < 12; i++) {
    const z0 = -depth / 2 + i * depth / 12, z1 = z0 + depth / 12;
    const h = (z: number) => wallTop + (metalRidge - wallTop) * (1 - Math.abs(z) / roofHalfDepth);
    const upper = Math.max(h(z0), h(z1));
    component(end * length / 2, (wallTop + upper) / 2, (z0 + z1) / 2, .4, upper - wallTop, z1 - z0, 'metal', 'end-gable', () => quad(opaque, world(end * length / 2, wallTop, z0), world(end * length / 2, wallTop, z1), world(end * length / 2, h(z1), z1), world(end * length / 2, h(z0), z0), 0xa8b1a3));
  }

  const trusses = Array.from({ length: 11 }, (_, i) => -length / 2 + i * length / 10);
  for (const x of trusses) {
    if (Math.abs(x) < skylightHalf) continue;
    for (const side of [-1, 1]) beam(v(x, wallTop + (metalRidge - wallTop) * .4 - .08, side * roofHalfDepth * .6), v(x, top - .15, 0), .3, 'exposed-truss');
  }
  for (let i = 0; i < 12; i++) {
    const a = -length / 2 + i * length / 12, b = -length / 2 + (i + 1) * length / 12;
    beam(v(a, top - .15, 0), v(b, top - .15, 0), .3, 'white-ridge-beam');
  }
  const canopyHalf = length * .28;
  for (let i = 0; i < 12; i++) {
    const x0 = -length / 2 + i * length / 12, x1 = x0 + length / 12, central = Math.abs((x0 + x1) / 2) < canopyHalf;
    const height = central ? centralCanopyTop : sideCanopyTop, z0 = frontZ - .3, z1 = porchFront + (central ? .7 : 0);
    component((x0 + x1) / 2, height - .12, (z0 + z1) / 2, x1 - x0, .24, z1 - z0, 'metal', central ? 'entry-canopy' : 'side-canopy', () => {
      box((x0 + x1) / 2, height - .12, (z0 + z1) / 2, x1 - x0, .24, z1 - z0, 0xd5d6be);
      box((x0 + x1) / 2, height, z1, x1 - x0, .22, .18, 0xe5dfca);
    });
  }
  for (const x of [-length * .095, length * .095]) beam(v(x, .15, porchFront + .25), v(x + .3, centralCanopyTop - .2, porchFront + .25), .42, 'entrance-post');
  for (const x of [-length * .43, -length * .3, length * .3, length * .43]) for (const side of [-1, 1]) {
    beam(v(x, .15, porchFront - .15), v(x + side * 1.8, sideCanopyTop - .15, porchFront - .15), .42, 'diagonal-porch-post');
  }
  // 바깥 계단과 경사로의 정확한 형태는 미확인이므로 입구 바닥만 낮게 연결한다.
  for (let i = 0; i < 4; i++) {
    const width = canopyHalf * 2 / 4, x = -canopyHalf + (i + .5) * width;
    component(x, .02, (frontZ + porchFront) / 2, width, .18, porchFront - frontZ, 'stone', 'entry-platform', () => box(x, .02, (frontZ + porchFront) / 2, width, .18, porchFront - frontZ, 0xa8ada3));
  }

  for (const [surface, name, roughness, metalness] of [[opaque, 'metal-and-frame', .66, .24], [glass, 'glazing', .25, .17]] as const) {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(surface.positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(surface.colors, 3));
    (geometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage); geometry.computeVertexNormals(); geometry.computeBoundingSphere(); geometry.computeBoundingBox(); surface.geometry = geometry;
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness, metalness })); mesh.name = `engineer-house-${name}`; mesh.receiveShadow = true; shell.add(mesh);
    surface.positions.length = 0; surface.colors.length = 0;
  }
  function update(_player: THREE.Vector3) {
    const changed = new Set<Surface>();
    for (const part of parts) if (part.shown !== part.proxy.visible) {
      part.shown = part.proxy.visible;
      for (const range of part.ranges) {
        if (range.start === range.end) continue;
        const attribute = range.surface.geometry!.getAttribute('position') as THREE.BufferAttribute;
        if (!changed.has(range.surface)) attribute.clearUpdateRanges(); changed.add(range.surface);
        if (part.shown) (attribute.array as Float32Array).set(range.original, range.start);
        else for (let i = range.start; i < range.end; i += 3) { attribute.array[i] = part.proxy.position.x; attribute.array[i + 1] = part.proxy.position.y; attribute.array[i + 2] = part.proxy.position.z; }
        attribute.addUpdateRange(range.start, range.end - range.start);
      }
    }
    for (const surface of changed) surface.geometry!.getAttribute('position').needsUpdate = true;
    shell.visible = parts.some(part => part.proxy.visible);
  }
  return { breakables, update };
}
