import * as THREE from 'three';
import type { CampusBuilding } from './fullCampus';
import type { BuildingAppearance } from './buildingAppearance';
import type { BreakableSpec } from './scene';

type Surface = { positions: number[]; colors: number[]; geometry?: THREE.BufferGeometry };
type Range = { surface: Surface; start: number; end: number; original: Float32Array };
type Part = { proxy: THREE.Mesh; ranges: Range[]; shown: boolean };
type Point2 = { z: number; y: number };

// 지상 4층은 공식 소개에 명시돼 있다. 높이와 곡률은 공식 사진의 비례를 따른 근사값이다.
export function createSportsLandmark(
  scene: THREE.Scene,
  building: CampusBuilding,
  profile: BuildingAppearance,
  heightAt: (x: number, z: number) => number,
) {
  const points = building.points.filter((p, i, all) => i !== all.length - 1 || p[0] !== all[0][0] || p[1] !== all[0][1]);
  let longest = 0, ux = 1, uz = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const dx = b[0] - a[0], dz = b[1] - a[1], distance = Math.hypot(dx, dz);
    if (distance > longest) { longest = distance; ux = dx / distance; uz = dz / distance; }
  }
  if (points.length < 3 || longest < 1) throw new Error('Sports centre footprint must contain a valid building outline.');
  if (ux < 0) { ux = -ux; uz = -uz; }
  const along = points.map(p => p[0] * ux + p[1] * uz), across = points.map(p => -p[0] * uz + p[1] * ux);
  const minX = Math.min(...along), maxX = Math.max(...along), minZ = Math.min(...across), maxZ = Math.max(...across);
  const length = maxX - minX, depth = maxZ - minZ;
  const midX = (minX + maxX) / 2, midZ = (minZ + maxZ) / 2;
  const cx = midX * ux - midZ * uz, cz = midX * uz + midZ * ux, base = heightAt(cx, cz);
  const top = profile.height ?? 23.5, podiumTop = 4, radiusZ = depth / 2;
  const radiusY = (top - podiumTop) / (1 + Math.SQRT1_2), centerY = top - radiusY;
  const thetaLimit = Math.PI * .75, podiumDepth = depth * Math.SQRT1_2;
  const orientation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(uz, ux));
  const world = (x: number, y: number, z: number) => new THREE.Vector3(cx + ux * x - uz * z, base + y, cz + uz * x + ux * z);
  const curve = (theta: number, lift = 0): Point2 => ({ z: (radiusZ + lift) * Math.sin(theta), y: centerY + (radiusY + lift) * Math.cos(theta) });
  const shell = new THREE.Group(); shell.name = `${building.id}:sports-landmark`;
  Object.assign(shell.userData, {
    buildingId: building.id, role: 'building-shell', landmark: 'posco-sports', appearance: profile,
    dimensions: { length, depth, height: top }, localOrigin: { x: cx, y: base, z: cz },
    axis: { x: ux, z: uz }, podiumTop, radiusY, radiusZ, curveCenterY: centerY,
    dimensionsEstimated: true,
  });
  scene.add(shell);
  const distant = new THREE.Group(); distant.name = `${building.id}:sports-landmark-distant`; distant.visible = false;
  Object.assign(distant.userData, { buildingId: building.id, role: 'distant-building', landmark: 'posco-sports' }); scene.add(distant);

  const metal: Surface = { positions: [], colors: [] }, glass: Surface = { positions: [], colors: [] };
  const surfaces = [metal, glass], parts: Part[] = [], breakables: BreakableSpec[] = [];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const proxyMaterials = {
    metal: new THREE.MeshStandardMaterial({ color: 0xbec6c5 }),
    glass: new THREE.MeshStandardMaterial({ color: profile.glassColor }),
    stone: new THREE.MeshStandardMaterial({ color: 0xc7c6b7 }),
  };
  function vertex(surface: Surface, p: THREE.Vector3, color: THREE.Color) {
    surface.positions.push(p.x, p.y, p.z); surface.colors.push(color.r, color.g, color.b);
  }
  function quad(surface: Surface, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, hex: number) {
    const color = new THREE.Color(hex);
    for (const p of [a, b, c, a, c, d]) vertex(surface, p, color);
  }
  function box(x: number, y: number, z: number, sx: number, sy: number, sz: number, hex: number) {
    const p = (a: number, b: number, c: number) => world(x + a * sx / 2, y + b * sy / 2, z + c * sz / 2);
    for (const side of [-1, 1]) {
      quad(metal, p(-1, -1, side), p(1, -1, side), p(1, 1, side), p(-1, 1, side), hex);
      quad(metal, p(side, -1, -1), p(side, -1, 1), p(side, 1, 1), p(side, 1, -1), hex);
      quad(metal, p(-1, side, -1), p(1, side, -1), p(1, side, 1), p(-1, side, 1), hex);
    }
  }
  function component(x: number, y: number, z: number, sx: number, sy: number, sz: number, kind: keyof typeof proxyMaterials, name: string, draw: () => void, tilt = 0) {
    const proxy = new THREE.Mesh(cube, proxyMaterials[kind]);
    proxy.position.copy(world(x, y, z)); proxy.quaternion.copy(orientation);
    if (tilt) proxy.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), tilt));
    proxy.scale.set(sx + .025, sy + .025, sz + .025);
    Object.assign(proxy.userData, { buildingId: building.id, renderProxy: true, landmark: 'posco-sports', component: name });
    proxy.updateMatrix(); proxy.updateMatrixWorld(true);
    const starts = surfaces.map(surface => surface.positions.length); draw();
    const ranges = surfaces.map((surface, i) => ({ surface, start: starts[i], end: surface.positions.length, original: new Float32Array(surface.positions.slice(starts[i])) }));
    parts.push({ proxy, ranges, shown: true });
    breakables.push({ mesh: proxy, size: proxy.scale.clone(), toughness: kind === 'glass' ? 6 : 11, label: building.name, material: kind });
  }
  function curvedStrip(surface: Surface, x0: number, x1: number, t0: number, t1: number, color: number, lift = 0) {
    for (let i = 0; i < 2; i++) {
      const a = curve(t0 + (t1 - t0) * i / 2, lift), b = curve(t0 + (t1 - t0) * (i + 1) / 2, lift);
      quad(surface, world(x0, a.y, a.z), world(x1, a.y, a.z), world(x1, b.y, b.z), world(x0, b.y, b.z), color);
    }
  }

  // 타원 단면의 현에 맞춰 충돌체도 기울인다. 긴 건물 전체를 직육면체 충돌체로 채우지 않는다.
  const longitudinal = 10, angular = 18;
  for (let col = 0; col < longitudinal; col++) for (let row = 0; row < angular; row++) {
    const x0 = -length / 2 + col * length / longitudinal, x1 = x0 + length / longitudinal;
    const t0 = -thetaLimit + row * thetaLimit * 2 / angular, t1 = t0 + thetaLimit * 2 / angular;
    const a = curve(t0), b = curve(t1), mid = (t0 + t1) / 2;
    const sideGlass = Math.abs(mid) > Math.PI / 3 && Math.abs(mid) < Math.PI * 2 / 3;
    const skylight = col === 4 && Math.abs(mid) < Math.PI / 3;
    const isGlass = sideGlass || skylight;
    component((x0 + x1) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, x1 - x0, .58, Math.hypot(b.y - a.y, b.z - a.z), isGlass ? 'glass' : 'metal', isGlass ? 'curved-glass' : 'barrel-roof', () => {
      curvedStrip(isGlass ? glass : metal, x0, x1, t0, t1, isGlass ? profile.glassColor : [0xbac2c1, 0xc6ccca, 0xb5bdbd][(row + col) % 3]);
      // 좁은 은색 이음선과 유리 수직 프레임을 같은 금속 메시 안에 합친다.
      const spacing = isGlass ? 1.6 : .82;
      for (let x = Math.ceil(x0 / spacing) * spacing; x < x1; x += spacing) curvedStrip(metal, Math.max(x0, x - .035), Math.min(x1, x + .035), t0, t1, 0xaab5b2, .035);
      curvedStrip(metal, x0, x1, t0 - .003, t0 + .003, 0x98a5a2, .035);
      // 양 끝의 깊은 은색 테두리가 유리 끝면보다 앞으로 돌출한다.
      for (const end of [-1, 1]) {
        const lip0 = end < 0 ? -length / 2 : length / 2 - 1.8, lip1 = lip0 + 1.8;
        if (Math.min(x1, lip1) > Math.max(x0, lip0)) curvedStrip(metal, Math.max(x0, lip0), Math.min(x1, lip1), t0, t1, 0xcad0ca, .045);
      }
    }, -Math.atan2(b.y - a.y, b.z - a.z));
  }

  // 타원형 끝면을 격자로 자른다. 바깥 모서리의 빈 하늘에 큰 사각 충돌벽이 생기지 않게 한다.
  const outline: Point2[] = [];
  for (let i = 0; i <= 36; i++) outline.push(curve(-thetaLimit + thetaLimit * 2 * i / 36));
  function clip(poly: Point2[], axis: 'z' | 'y', value: number, greater: boolean): Point2[] {
    const result: Point2[] = [], inside = (p: Point2) => greater ? p[axis] >= value : p[axis] <= value;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], ai = inside(a), bi = inside(b);
      if (ai) result.push(a);
      if (ai !== bi) { const t = (value - a[axis]) / (b[axis] - a[axis]); result.push({ z: a.z + (b.z - a.z) * t, y: a.y + (b.y - a.y) * t }); }
    }
    return result;
  }
  for (const end of [-1, 1]) for (let iz = 0; iz < Math.ceil(depth / 3.5); iz++) for (let iy = 0; iy < Math.ceil((top - podiumTop) / 3.5); iy++) {
    const z0 = -depth / 2 + iz * 3.5, y0 = podiumTop + iy * 3.5;
    let polygon = clip(clip(clip(clip(outline, 'z', z0, true), 'z', z0 + 3.5, false), 'y', y0, true), 'y', Math.min(top, y0 + 3.5), false);
    if (polygon.length < 3) continue;
    const lowZ = Math.min(...polygon.map(p => p.z)), highZ = Math.max(...polygon.map(p => p.z));
    const lowY = Math.min(...polygon.map(p => p.y)), highY = Math.max(...polygon.map(p => p.y));
    if (highZ - lowZ < .04 || highY - lowY < .04) continue;
    const x = end * (length / 2 - 1.85);
    component(x, (lowY + highY) / 2, (lowZ + highZ) / 2, .45, highY - lowY, highZ - lowZ, 'glass', 'oval-end-glass', () => {
      const color = new THREE.Color([0x739a8e, profile.glassColor, 0x688f85][(iz + iy) % 3]);
      for (let i = 1; i < polygon.length - 1; i++) for (const p of [polygon[0], polygon[i], polygon[i + 1]]) vertex(glass, world(x, p.y, p.z), color);
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i], b = polygon[(i + 1) % polygon.length];
        const dz = b.z - a.z, dy = b.y - a.y, distance = Math.hypot(dz, dy);
        if (distance < .01) continue;
        const py = -dz / distance * .045, pz = dy / distance * .045;
        quad(metal, world(x + end * .03, a.y + py, a.z + pz), world(x + end * .03, b.y + py, b.z + pz), world(x + end * .03, b.y - py, b.z - pz), world(x + end * .03, a.y - py, a.z - pz), 0xc7cec5);
      }
    });
  }

  const podiumLength = length - 3.7;
  function podiumWall(horizontal: boolean, side: number, lo: number, hi: number) {
    const x = horizontal ? (lo + hi) / 2 : side * podiumLength / 2, z = horizontal ? side * podiumDepth / 2 : (lo + hi) / 2;
    const pa = world(horizontal ? lo : x, 0, horizontal ? z : lo), pb = world(horizontal ? hi : x, 0, horizontal ? z : hi);
    const bottom = Math.min(heightAt(pa.x, pa.z), heightAt(pb.x, pb.z), base) - base - .45;
    component(x, (bottom + podiumTop) / 2, z, horizontal ? hi - lo : .6, podiumTop - bottom, horizontal ? .6 : hi - lo, 'stone', 'low-podium', () => {
      box(x, (bottom + podiumTop) / 2, z, horizontal ? hi - lo : .6, podiumTop - bottom, horizontal ? .6 : hi - lo, 0xc7c6b7);
      if (horizontal) {
        const plane = z + side * .31;
        quad(glass, world(lo + .6, 1.25, plane), world(hi - .6, 1.25, plane), world(hi - .6, 3.2, plane), world(lo + .6, 3.2, plane), 0x66877f);
        box(x, 3.7, plane, hi - lo, .16, .3, 0xd2d2c6);
      }
    });
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 10; i++) podiumWall(true, side, -podiumLength / 2 + i * podiumLength / 10, -podiumLength / 2 + (i + 1) * podiumLength / 10);
    for (let i = 0; i < 4; i++) podiumWall(false, side, -podiumDepth / 2 + i * podiumDepth / 4, -podiumDepth / 2 + (i + 1) * podiumDepth / 4);
  }
  component(0, 3.4, -podiumDepth / 2 - 1.1, 8, .25, 3, 'metal', 'entry-canopy', () => box(0, 3.4, -podiumDepth / 2 - 1.1, 8, .25, 3, 0xaeb9b4));

  for (const [surface, name, roughness, metalness] of [[metal, 'metal-and-podium', .48, .48], [glass, 'curved-glazing', .22, .2]] as const) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(surface.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(surface.colors, 3));
    (geometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
    geometry.computeVertexNormals(); geometry.computeBoundingSphere(); geometry.computeBoundingBox(); surface.geometry = geometry;
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness, metalness }));
    mesh.name = `posco-sports-${name}`; mesh.receiveShadow = true; shell.add(mesh);
    surface.positions.length = 0; surface.colors.length = 0;
  }
  function update(_player: THREE.Vector3) {
    const changed = new Set<Surface>();
    for (const part of parts) if (part.shown !== part.proxy.visible) {
      part.shown = part.proxy.visible;
      for (const range of part.ranges) {
        if (range.start === range.end) continue;
        const attribute = range.surface.geometry!.getAttribute('position') as THREE.BufferAttribute;
        if (!changed.has(range.surface)) attribute.clearUpdateRanges();
        changed.add(range.surface);
        if (part.shown) (attribute.array as Float32Array).set(range.original, range.start);
        else for (let i = range.start; i < range.end; i += 3) {
          attribute.array[i] = part.proxy.position.x; attribute.array[i + 1] = part.proxy.position.y; attribute.array[i + 2] = part.proxy.position.z;
        }
        attribute.addUpdateRange(range.start, range.end - range.start);
      }
    }
    for (const surface of changed) surface.geometry!.getAttribute('position').needsUpdate = true;
    shell.visible = parts.some(part => part.proxy.visible);
  }
  return { breakables, update };
}
