import * as THREE from 'three';
import type { CampusBuilding } from './fullCampus';
import type { BuildingAppearance } from './buildingAppearance';
import type { BreakableSpec } from './scene';

type Surface = { positions: number[]; colors: number[]; geometry?: THREE.BufferGeometry };
type Range = { surface: Surface; start: number; end: number; original: Float32Array };
type Part = { proxy: THREE.Mesh; ranges: Range[]; shown: boolean };
type Point = { x: number; z: number };

// 공식 자료는 지상 5층을 확인한다. 높이, 하부 후퇴 폭과 기둥 간격은 외관 사진의 비례로 추정했다.
export function createGlobalEngineeringLandmark(scene: THREE.Scene, building: CampusBuilding, profile: BuildingAppearance, heightAt: (x: number, z: number) => number) {
  const access=scene.getObjectByName('campus-terrain')?.userData.engineering38Correction?.layout;
  let points = building.points.filter((p, i, all) => i !== all.length - 1 || p[0] !== all[0][0] || p[1] !== all[0][1]);
  let longest = 0, ux = 1, uz = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
    if (length > longest) { longest = length; ux = dx / length; uz = dz / length; }
  }
  if (points.length < 3 || longest < 1) throw new Error('Global Engineering footprint must contain a valid outline.');
  if (ux < 0 || (ux === 0 && uz < 0)) { ux = -ux; uz = -uz; }
  const winding = points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0);
  if (winding < 0) points = points.slice().reverse();
  const first = points.reduce((best, p, i) => p[0] < points[best][0] || (p[0] === points[best][0] && p[1] < points[best][1]) ? i : best, 0);
  points = points.slice(first).concat(points.slice(0, first));
  const xs = points.map(p => p[0] * ux + p[1] * uz), zs = points.map(p => -p[0] * uz + p[1] * ux);
  const length = Math.max(...xs) - Math.min(...xs), depth = Math.max(...zs) - Math.min(...zs);
  const mx = (Math.min(...xs) + Math.max(...xs)) / 2, mz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const cx = mx * ux - mz * uz, cz = mx * uz + mz * ux, base = access?.floor ?? heightAt(cx, cz);
  const outline = points.map(p => ({ x: p[0] * ux + p[1] * uz - mx, z: -p[0] * uz + p[1] * ux - mz }));
  const top = profile.height ?? 23.5, scale = top / 23.5, soffit = (access ? 9.4 : 6.2) * scale, roofY = top - .32, upperRows = access ? 3 : 4, upperFloor = (roofY - soffit) / upperRows;
  const core = { minX: -length / 2 + 5.2, maxX: length / 2 - 2.4, minZ: -depth / 2 + 2.4, maxZ: depth / 2 - 5.2 };
  const orientation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(uz, ux));
  const world = (x: number, y: number, z: number) => new THREE.Vector3(cx + ux * x - uz * z, base + y, cz + uz * x + ux * z);
  const outwardWorld = (nx: number, nz: number) => new THREE.Vector3(ux * nx - uz * nz, 0, uz * nx + ux * nz);
  const shell = new THREE.Group(); shell.name = `${building.id}:global-engineering-landmark`;
  Object.assign(shell.userData, {
    buildingId: building.id, role: 'building-shell', landmark: 'global-engineering', appearance: profile,
    dimensions: { length, depth, height: top }, localOrigin: { x: cx, y: base, z: cz }, axis: { x: ux, z: uz },
    front: { x: -uz, z: ux }, levels: 5, upperRows, lowerStoreys: access ? 2 : 1, soffit, core, upperFloor, outline, dimensionsEstimated: true, directionEstimated: true,
  }); scene.add(shell);
  const distant = new THREE.Group(); distant.name = `${building.id}:global-engineering-distant`; distant.visible = false;
  Object.assign(distant.userData, { buildingId: building.id, role: 'distant-building', landmark: 'global-engineering' }); scene.add(distant);
  const opaque: Surface = { positions: [], colors: [] }, glass: Surface = { positions: [], colors: [] };
  const surfaces = [opaque, glass], parts: Part[] = [], breakables: BreakableSpec[] = [];
  const cube = new THREE.BoxGeometry(1, 1, 1), boxGeometry = cube.toNonIndexed(), cylinder = new THREE.CylinderGeometry(.48, .48, 1, 20).toNonIndexed();
  const proxyMaterials = { stone: new THREE.MeshStandardMaterial({ color: 0xcbd1cb }), metal: new THREE.MeshStandardMaterial({ color: 0xaab9b9 }), glass: new THREE.MeshStandardMaterial({ color: 0x257ea3 }) };
  function triangle(surface: Surface, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, hex: number, normal?: THREE.Vector3) {
    if (normal && b.clone().sub(a).cross(c.clone().sub(a)).dot(normal) < 0) [b, c] = [c, b];
    const color = new THREE.Color(hex);
    for (const p of [a, b, c]) { surface.positions.push(p.x, p.y, p.z); surface.colors.push(color.r, color.g, color.b); }
  }
  function quad(surface: Surface, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, hex: number, normal?: THREE.Vector3) {
    triangle(surface, a, b, c, hex, normal); triangle(surface, a, c, d, hex, normal);
  }
  function appendGeometry(geometry: THREE.BufferGeometry, x: number, y: number, z: number, sx: number, sy: number, sz: number, hex: number, rotation = new THREE.Quaternion()) {
    const attribute = geometry.getAttribute('position');
    for (let i = 0; i < attribute.count; i += 3) {
      const vs = [0, 1, 2].map(j => { const p = new THREE.Vector3().fromBufferAttribute(attribute, i + j).multiply(new THREE.Vector3(sx, sy, sz)).applyQuaternion(rotation); return world(x + p.x, y + p.y, z + p.z); });
      triangle(opaque, vs[0], vs[1], vs[2], hex);
    }
  }
  const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, hex: number, rotation?: THREE.Quaternion) => appendGeometry(boxGeometry, x, y, z, sx, sy, sz, hex, rotation);
  function component(x: number, y: number, z: number, kind: keyof typeof proxyMaterials, name: string, draw: () => void, rotation = new THREE.Quaternion(), extra: Record<string, unknown> = {}) {
    const proxy = new THREE.Mesh(cube, proxyMaterials[kind]); proxy.position.copy(world(x, y, z)); proxy.quaternion.copy(orientation).multiply(rotation);
    const starts = surfaces.map(surface => surface.positions.length); draw();
    // 창틀과 돌출 부재까지 실제 기하의 회전된 경계에 포함한다.
    const inverse = proxy.quaternion.clone().invert(), bounds = new THREE.Box3(), p = new THREE.Vector3();
    for (let s = 0; s < surfaces.length; s++) for (let i = starts[s]; i < surfaces[s].positions.length; i += 3) bounds.expandByPoint(p.fromArray(surfaces[s].positions, i).sub(proxy.position).applyQuaternion(inverse));
    const centre = bounds.getCenter(new THREE.Vector3()); proxy.position.add(centre.applyQuaternion(proxy.quaternion));
    proxy.scale.copy(bounds.getSize(new THREE.Vector3())).addScalar(.025);
    Object.assign(proxy.userData, { buildingId: building.id, renderProxy: true, landmark: 'global-engineering', component: name, ...extra }); proxy.updateMatrix(); proxy.updateMatrixWorld(true);
    const ranges = surfaces.map((surface, i) => ({ surface, start: starts[i], end: surface.positions.length, original: new Float32Array(surface.positions.slice(starts[i])) }));
    parts.push({ proxy, ranges, shown: true }); breakables.push({ mesh: proxy, size: proxy.scale.clone(), toughness: kind === 'glass' ? 7 : 12, label: building.name, material: kind });
  }
  const frameColor = 0xd3dbd6;
  function curtain(a: Point, b: Point, bottom: number, upper: number, name: string, row: number, bay: number, entry = false) {
    const dx = b.x - a.x, dz = b.z - a.z, width = Math.hypot(dx, dz), tx = dx / width, tz = dz / width, nx = tz, nz = -tx;
    const x = (a.x + b.x) / 2, z = (a.z + b.z) / 2, rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(dz, dx));
    const normal = outwardWorld(nx, nz), p = (u: number, y: number, offset: number) => world(x + tx * u + nx * offset, y, z + tz * u + nz * offset);
    component(x, (bottom + upper) / 2, z, 'glass', name, () => {
      const palette = [0x2186ad, 0x3d91b2, 0x327b9b, 0x5aadc0, 0x397f99], color = palette[(bay * 7 + row * 3) % palette.length];
      quad(glass, p(-width / 2, bottom, 0), p(width / 2, bottom, 0), p(width / 2, upper, 0), p(-width / 2, upper, 0), color, normal);
      const crossYs = entry ? [bottom + (upper - bottom) * .42, bottom + (upper - bottom) * .76] : [bottom + (upper - bottom) * .24];
      for (const u of [-width / 2, width / 2]) box(x + tx * u + nx * .095, (bottom + upper) / 2, z + tz * u + nz * .095, .085, upper - bottom, .19, frameColor, rotation);
      for (const y of [bottom + .045, ...crossYs, upper - .045]) box(x + nx * .095, y, z + nz * .095, width, .09, .19, frameColor, rotation);
      // 사진에 보이는 작은 개폐창과 은색 패널은 일부 칸에만 배치한다.
      if (!entry && (bay + row) % 4 === 1) {
        const wl = -width * .27, wr = width * .27, low = bottom + (upper - bottom) * .31, high = upper - .36;
        for (const u of [wl, wr]) box(x + tx * u + nx * .12, (low + high) / 2, z + tz * u + nz * .12, .055, high - low, .09, 0xb5c6c6, rotation);
        for (const y of [low, high]) box(x + nx * .12, y, z + nz * .12, wr - wl, .055, .09, 0xb5c6c6, rotation);
      }
      if (!entry && bay % 11 === 5 && row !== 1) quad(opaque, p(-width * .46, bottom + .12, .025), p(-width * .12, bottom + .12, .025), p(-width * .12, upper - .12, .025), p(-width * .46, upper - .12, .025), 0xc7d2cd, normal);
    }, rotation, { outward: normal.toArray(), facadeMidpoint: world(x, (bottom + upper) / 2, z).toArray(), paneBottom: base + bottom, paneTop: base + upper });
  }
  for (let edge = 0; edge < outline.length; edge++) {
    const a = outline[edge], b = outline[(edge + 1) % outline.length], columns = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 2.6);
    for (let col = 0; col < columns; col++) {
      const p = (t: number) => ({ x: THREE.MathUtils.lerp(a.x, b.x, t), z: THREE.MathUtils.lerp(a.z, b.z, t) });
      for (let row = 0; row < upperRows; row++) curtain(p(col / columns), p((col + 1) / columns), soffit + .12 + row * upperFloor, soffit + .12 + (row + 1) * upperFloor, 'upper-curtain', row, col + edge * 13);
    }
  }
  const coreOutline: Point[] = [{ x: core.minX, z: core.minZ }, { x: core.maxX, z: core.minZ }, { x: core.maxX, z: core.maxZ }, { x: core.minX, z: core.maxZ }];
  for (let edge = 0; !access && edge < coreOutline.length; edge++) {
    const a = coreOutline[edge], b = coreOutline[(edge + 1) % coreOutline.length], dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz), columns = Math.ceil(len / 3.1), nx = dz / len, nz = -dx / len;
    for (let col = 0; col < columns; col++) {
      const p = (t: number) => ({ x: THREE.MathUtils.lerp(a.x, b.x, t), z: THREE.MathUtils.lerp(a.z, b.z, t) }), p0 = p(col / columns), p1 = p((col + 1) / columns);
      let highGround = -Infinity, lowGround = Infinity;
      for (let i = 0; i <= 12; i++) for (const offset of [-.24, 0, .24]) {
        const v = world(THREE.MathUtils.lerp(p0.x, p1.x, i / 12) + nx * offset, 0, THREE.MathUtils.lerp(p0.z, p1.z, i / 12) + nz * offset), y = heightAt(v.x, v.z) - base;
        highGround = Math.max(highGround, y); lowGround = Math.min(lowGround, y);
      }
      const bottom = Math.max(.14, highGround + .16), x = (p0.x + p1.x) / 2, z = (p0.z + p1.z) / 2, rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(dz, dx));
      component(x, (lowGround - .45 + bottom) / 2, z, 'stone', 'core-foundation', () => box(x, (lowGround - .45 + bottom) / 2, z, len / columns, bottom - lowGround + .45, .32, 0xb9c1bd, rotation), rotation);
      curtain(p0, p1, bottom, soffit - .12, edge === 2 && col >= columns / 2 - 1 && col <= columns / 2 + 1 ? 'recessed-entry' : 'recessed-glazing', 0, col + edge * 7, true);
    }
  }
  // 외곽 기둥과 후퇴한 벽을 별도 부품으로 나눠 기둥 사이와 처마 밑 통로를 비운다.
  const columns: Point[] = [];
  const addColumn = (x: number, z: number) => { if (!columns.some(p => Math.hypot(p.x - x, p.z - z) < 1.2)) columns.push({ x, z }); };
  const xCount = Math.round((length - 1.8) / 7.8), zCount = Math.round((depth - 1.8) / 7.8);
  for (const z of [-depth / 2 + .9, depth / 2 - .9]) for (let i = 0; i <= xCount; i++) addColumn(-length / 2 + .9 + i * (length - 1.8) / xCount, z);
  for (const x of [-length / 2 + .9, length / 2 - .9]) for (let i = 1; i < zCount; i++) addColumn(x, -depth / 2 + .9 + i * (depth - 1.8) / zCount);
  for (const { x, z } of columns) {
    const p = world(x, 0, z), lower = Math.min(heightAt(p.x, p.z) - base - .35, soffit - 2.8), h = soffit - lower;
    component(x, (lower + soffit) / 2, z, 'stone', 'round-pilotis-column', () => appendGeometry(cylinder, x, (lower + soffit) / 2, z, 1, h, 1, 0xe0e2d9), new THREE.Quaternion(), { radius: .48 });
  }
  shell.userData.columns = columns;
  function clip(poly: Point[], axis: 'x' | 'z', threshold: number, greater: boolean) {
    const out: Point[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], ia = greater ? a[axis] >= threshold : a[axis] <= threshold, ib = greater ? b[axis] >= threshold : b[axis] <= threshold;
      if (ia) out.push(a);
      if (ia !== ib) { const t = (threshold - a[axis]) / (b[axis] - a[axis]); out.push({ x: THREE.MathUtils.lerp(a.x, b.x, t), z: THREE.MathUtils.lerp(a.z, b.z, t) }); }
    }
    return out;
  }
  // 지도 윤곽으로 바닥판을 자르고 노출 밑면과 지붕을 독립된 파괴 부품으로 만든다.
  const tilesX = Math.ceil(length / 9), tilesZ = Math.ceil(depth / 9);
  for (let i = 0; i < tilesX; i++) for (let j = 0; j < tilesZ; j++) {
    const x0 = -length / 2 + i * length / tilesX, x1 = -length / 2 + (i + 1) * length / tilesX, z0 = -depth / 2 + j * depth / tilesZ, z1 = -depth / 2 + (j + 1) * depth / tilesZ;
    let poly = clip(clip(clip(clip(outline, 'x', x0, true), 'x', x1, false), 'z', z0, true), 'z', z1, false); if (poly.length < 3) continue;
    for (const roof of [false, true]) {
      const low = roof ? top - .2 : soffit - .2, high = roof ? top : soffit + .12, color = roof ? 0xa7b6b2 : 0x758888;
      component((x0 + x1) / 2, (low + high) / 2, (z0 + z1) / 2, 'metal', roof ? 'roof-slab' : 'exposed-soffit', () => {
        for (let k = 1; k < poly.length - 1; k++) {
          triangle(opaque, world(poly[0].x, high, poly[0].z), world(poly[k].x, high, poly[k].z), world(poly[k + 1].x, high, poly[k + 1].z), color, new THREE.Vector3(0, 1, 0));
          triangle(opaque, world(poly[0].x, low, poly[0].z), world(poly[k].x, low, poly[k].z), world(poly[k + 1].x, low, poly[k + 1].z), color, new THREE.Vector3(0, -1, 0));
        }
        for (let k = 0; k < poly.length; k++) { const a = poly[k], b = poly[(k + 1) % poly.length]; quad(opaque, world(a.x, low, a.z), world(b.x, low, b.z), world(b.x, high, b.z), world(a.x, high, a.z), color, outwardWorld(b.z - a.z, a.x - b.x)); }
        if (!roof) for (let x = Math.ceil(x0 / 1.5) * 1.5; x < x1 - .1; x += 1.5) box(x, low - .012, (z0 + z1) / 2, .018, .012, z1 - z0 - .1, 0x8b9997);
      });
    }
  }
  for (const [surface, name, roughness, metalness] of [[opaque, 'frames-columns-slabs', .62, .16], [glass, 'blue-glazing', .23, .28]] as const) {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(surface.positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(surface.colors, 3));
    (geometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage); geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); surface.geometry = geometry;
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness, metalness })); mesh.name = `global-engineering-${name}`; mesh.receiveShadow = true; shell.add(mesh);
    surface.positions.length = 0; surface.colors.length = 0;
  }
  boxGeometry.dispose(); cylinder.dispose();
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
