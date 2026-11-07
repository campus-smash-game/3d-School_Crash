import * as THREE from 'three';
import type { CampusBuilding } from './fullCampus';
import type { BuildingAppearance } from './buildingAppearance';
import type { BreakableSpec } from './scene';

type Surface = { positions: number[]; colors: number[]; geometry?: THREE.BufferGeometry };
type Range = { surface: Surface; start: number; end: number; original: Float32Array };
type Part = { proxy: THREE.Mesh; ranges: Range[]; shown: boolean };
type MaterialKind = 'metal' | 'glass' | 'stone';

// 공식 소개는 지상 2층이다. 곡률과 높이는 공개 사진과 단면도를 따른 근사값이다.
export function createPavilionLandmark(
  scene: THREE.Scene,
  building: CampusBuilding,
  profile: BuildingAppearance,
  heightAt: (x: number, z: number) => number,
) {
  const points = building.points.filter((p, i, all) => i !== all.length - 1 || p[0] !== all[0][0] || p[1] !== all[0][1]);
  let longest = 0, ux = 0, uz = -1;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const dx = b[0] - a[0], dz = b[1] - a[1], distance = Math.hypot(dx, dz);
    if (distance > longest) { longest = distance; ux = dx / distance; uz = dz / distance; }
  }
  if (points.length < 3 || longest < 1) throw new Error('Pavilion footprint must contain a valid outline.');
  // 이 윤곽의 긴 변은 남북 방향이다. 로컬 +z를 동쪽 객석 방향으로 둔다.
  if (uz > 0 || (uz === 0 && ux < 0)) { ux = -ux; uz = -uz; }
  const along = points.map(p => p[0] * ux + p[1] * uz), across = points.map(p => -p[0] * uz + p[1] * ux);
  const minX = Math.min(...along), maxX = Math.max(...along), minZ = Math.min(...across), maxZ = Math.max(...across);
  const length = maxX - minX, depth = maxZ - minZ;
  const midX = (minX + maxX) / 2, midZ = (minZ + maxZ) / 2;
  const cx = midX * ux - midZ * uz, cz = midX * uz + midZ * ux, base = heightAt(cx, cz);
  const world = (x: number, y: number, z: number) => new THREE.Vector3(cx + ux * x - uz * z, base + y, cz + uz * x + ux * z);
  const localTerrain = (x: number, z: number) => { const p = world(x, 0, z); return heightAt(p.x, p.z) - base; };
  const shell = new THREE.Group(); shell.name = `${building.id}:pavilion-landmark`;
  Object.assign(shell.userData, {
    buildingId: building.id, role: 'building-shell', landmark: 'poongsan-pavilion', appearance: profile,
    localOrigin: { x: cx, y: base, z: cz }, axis: { x: ux, z: uz },
    dimensions: { length, depth, height: 8.65 }, dimensionsEstimated: true, documentedLevels: 2,
    stageFacing: { x: -uz, z: ux },
  });
  scene.add(shell);
  const distant = new THREE.Group(); distant.name = `${building.id}:pavilion-landmark-distant`; distant.visible = false;
  Object.assign(distant.userData, { buildingId: building.id, role: 'distant-building', landmark: 'poongsan-pavilion' }); scene.add(distant);
  const metal: Surface = { positions: [], colors: [] }, glass: Surface = { positions: [], colors: [] }, stone: Surface = { positions: [], colors: [] };
  const surfaces = [metal, glass, stone], parts: Part[] = [], breakables: BreakableSpec[] = [];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const proxyMaterials = {
    metal: new THREE.MeshStandardMaterial({ color: 0xbec8c5 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x76928c }),
    stone: new THREE.MeshStandardMaterial({ color: 0xb8b5a7 }),
  };
  function triangle(surface: Surface, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, hex: number) {
    const color = new THREE.Color(hex);
    for (const p of [a, b, c]) { surface.positions.push(p.x, p.y, p.z); surface.colors.push(color.r, color.g, color.b); }
  }
  function quad(surface: Surface, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, hex: number) {
    triangle(surface, a, b, c, hex); triangle(surface, a, c, d, hex);
  }
  function ribbon(surface: Surface, a: THREE.Vector3, b: THREE.Vector3, toward: THREE.Vector3, width: number, hex: number) {
    const offset = toward.clone().normalize().multiplyScalar(width);
    quad(surface, a, b, b.clone().add(offset), a.clone().add(offset), hex);
  }
  // 각 구간의 렌더링 정점을 감싸는 기울어진 상자를 사용한다. 로드 여부와 관계없이 같은 프록시를 쓴다.
  function component(kind: MaterialKind, name: string, xAxis: THREE.Vector3, yAxis: THREE.Vector3, draw: () => void) {
    const starts = surfaces.map(surface => surface.positions.length); draw();
    const ranges = surfaces.map((surface, i) => ({ surface, start: starts[i], end: surface.positions.length, original: new Float32Array(surface.positions.slice(starts[i])) }));
    const ex = xAxis.clone().normalize(), ey = yAxis.clone().addScaledVector(ex, -yAxis.dot(ex)).normalize();
    const ez = new THREE.Vector3().crossVectors(ex, ey).normalize();
    const axes = [ex, ey, ez], lows = [Infinity, Infinity, Infinity], highs = [-Infinity, -Infinity, -Infinity];
    const p = new THREE.Vector3();
    for (const range of ranges) for (let i = 0; i < range.original.length; i += 3) {
      p.fromArray(range.original, i);
      axes.forEach((axis, j) => { const value = p.dot(axis); lows[j] = Math.min(lows[j], value); highs[j] = Math.max(highs[j], value); });
    }
    const proxy = new THREE.Mesh(cube, proxyMaterials[kind]);
    axes.forEach((axis, j) => proxy.position.addScaledVector(axis, (lows[j] + highs[j]) / 2));
    proxy.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ex, ey, ez));
    proxy.scale.set(...highs.map((v, i) => Math.max(.08, v - lows[i]) + .025) as [number, number, number]);
    Object.assign(proxy.userData, { buildingId: building.id, renderProxy: true, landmark: 'poongsan-pavilion', component: name });
    proxy.updateMatrix(); proxy.updateMatrixWorld(true);
    parts.push({ proxy, ranges, shown: true });
    breakables.push({ mesh: proxy, size: proxy.scale.clone(), toughness: kind === 'glass' ? 5 : kind === 'stone' ? 10 : 8, label: building.name, material: kind });
  }
  const up = new THREE.Vector3(0, 1, 0);
  function panel(surface: Surface, corners: THREE.Vector3[], thickness: number, color: number, seam = false) {
    const [a, b, c, d] = corners;
    const normal = new THREE.Vector3().crossVectors(b.clone().sub(a), d.clone().sub(a)).normalize();
    if (normal.y < 0) normal.negate();
    const top = corners.map(p => p.clone().addScaledVector(normal, thickness / 2));
    const bottom = corners.map(p => p.clone().addScaledVector(normal, -thickness / 2));
    quad(surface, ...top as [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3], color);
    quad(surface, bottom[3], bottom[2], bottom[1], bottom[0], color);
    for (let i = 0; i < 4; i++) quad(surface, top[i], bottom[i], bottom[(i + 1) % 4], top[(i + 1) % 4], color);
    if (seam) {
      const outer = top.map(p => p.clone().addScaledVector(normal, .012));
      ribbon(metal, outer[0], outer[1], outer[3].clone().sub(outer[0]), .035, 0x647975);
      ribbon(metal, outer[0], outer[3], outer[1].clone().sub(outer[0]), .035, 0x647975);
    }
  }
  function roof(theta: number, t: number) {
    const innerX = length * .49 * .72 * Math.sin(theta);
    const innerZ = -depth * .49 * .72 * Math.cos(theta) + depth * .37 * Math.exp(-Math.pow((theta + .3) / .6, 2));
    const x = THREE.MathUtils.lerp(innerX, length * .49 * .97 * Math.sin(theta), t);
    const z = THREE.MathUtils.lerp(innerZ, -depth * .49 * .97 * Math.cos(theta), t);
    const innerY = 6.8 + 1.3 * Math.cos(theta) - .8 * Math.sin(theta);
    const outerY = .6 + 6.4 * Math.pow(Math.max(0, Math.cos(theta)), 1.3) + 2.4 * Math.max(0, -Math.sin(theta));
    const edge = Math.max(outerY, localTerrain(x, z) + .2);
    const y = THREE.MathUtils.lerp(innerY, edge, t * t) + .35 * Math.sin(t * Math.PI);
    return world(x, y, z);
  }
  // 서쪽의 비정형 지붕과 안쪽 돌출 처마를 하나의 연속된 곡면으로 근사한다.
  const angles = 28, radial = 6, limit = Math.PI * .58;
  for (let i = 0; i < angles; i++) for (let j = 0; j < radial; j++) {
    const t0 = -limit + i / angles * limit * 2, t1 = -limit + (i + 1) / angles * limit * 2;
    const a = roof(t0, j / radial), b = roof(t1, j / radial), c = roof(t1, (j + 1) / radial), d = roof(t0, (j + 1) / radial);
    const tangent = b.clone().sub(a), normal = new THREE.Vector3().crossVectors(tangent, d.clone().sub(a)).normalize();
    component('metal', 'swept-roof', tangent, normal, () => panel(metal, [a, b, c, d], .24, [0xc4cecb, 0xbac6c4, 0xcdd3cf][(i + j) % 3], true));
  }
  // 진입 광장 쪽의 유리 입면은 처마 아래로 물려 배치한다.
  for (let i = 0; i < 12; i++) {
    const a0 = -.82 + i * 1.5 / 12, a1 = -.82 + (i + 1) * 1.5 / 12;
    const top = [a0, a1].map(t => roof(t, .87).addScaledVector(up, -.32));
    const bottom = top.map(p => new THREE.Vector3(p.x, Math.min(base, heightAt(p.x, p.z)) - .2, p.z));
    component('glass', 'entry-glass', top[1].clone().sub(top[0]), up, () => {
      quad(glass, bottom[0], bottom[1], top[1], top[0], [0x6f8e89, 0x809a91, 0x587c78][i % 3]);
      ribbon(metal, bottom[0], top[0], bottom[1].clone().sub(bottom[0]), .075, 0x344a45);
      const a = bottom[0].clone().lerp(top[0], .48), b = bottom[1].clone().lerp(top[1], .48);
      ribbon(metal, a, b, up, .065, 0x344a45);
    });
  }
  // 무대 뒤쪽의 낮은 굽은 벽은 앞쪽을 막지 않는다.
  for (let i = 0; i < 12; i++) {
    const a0 = -.98 + i * 1.96 / 12, a1 = -.98 + (i + 1) * 1.96 / 12;
    const wall = (t: number, y: number) => world(length * .27 * Math.sin(t), y, -depth * .25 + depth * .09 * Math.cos(t));
    const high = (t: number) => .8 + 4.2 * Math.sqrt(Math.max(0, 1 - t * t));
    const a = wall(a0, .25), b = wall(a1, .25), c = wall(a1, high(a1)), d = wall(a0, high(a0));
    component('metal', 'stage-backwall', b.clone().sub(a), up, () => {
      quad(metal, a, b, c, d, 0x455351);
      for (let k = 0; k < 4; k++) { const t = k / 4; ribbon(metal, a.clone().lerp(b, t), d.clone().lerp(c, t), b.clone().sub(a), .045, 0x88948d); }
    });
  }
  // 반원형 객석은 열린 동쪽에 놓인다. 바닥 높이는 실제 heightAt에 맞춰 내려 연결한다.
  const rows = 10, sectors = 16;
  for (let row = 0; row < rows; row++) for (let col = 0; col < sectors; col++) {
    const t0 = -Math.PI * .52 + col / sectors * Math.PI * 1.04, t1 = -Math.PI * .52 + (col + 1) / sectors * Math.PI * 1.04;
    const r0 = .37 + row * .056, r1 = r0 + .056;
    const point = (r: number, t: number, y: number) => world(length * .49 * r * Math.sin(t), y, depth * .49 * r * Math.cos(t));
    const corners = [point(r0, t0, 0), point(r0, t1, 0), point(r1, t1, 0), point(r1, t0, 0)];
    const ground = corners.map(p => heightAt(p.x, p.z));
    const top = Math.max(base + .55 + row * .4, ...ground.map(y => y + .12)), bottom = Math.min(base, ...ground) - .35;
    const cap = corners.map(p => new THREE.Vector3(p.x, top, p.z)), foot = corners.map(p => new THREE.Vector3(p.x, bottom, p.z));
    component('stone', 'terrace-step', cap[1].clone().sub(cap[0]), up, () => {
      quad(stone, cap[0], cap[1], cap[2], cap[3], row % 2 ? 0xc5c4b9 : 0xb8b9b0);
      for (let k = 0; k < 4; k++) quad(stone, cap[k], foot[k], foot[(k + 1) % 4], cap[(k + 1) % 4], 0x9fa69d);
    });
  }
  // 낮은 타원형 무대와 객석 사이에는 지붕이나 전면 벽을 만들지 않는다.
  const stageCenter = world(0, .35, -depth * .05);
  for (let i = 0; i < 16; i++) {
    const a0 = i / 16 * Math.PI * 2, a1 = (i + 1) / 16 * Math.PI * 2;
    const a = world(length * .22 * Math.sin(a0), .35, -depth * .05 + depth * .17 * Math.cos(a0));
    const b = world(length * .22 * Math.sin(a1), .35, -depth * .05 + depth * .17 * Math.cos(a1));
    component('stone', 'stage-platform', b.clone().sub(a), up, () => {
      triangle(stone, stageCenter, a, b, 0xa6a89e);
      const aa = a.clone().setY(Math.min(a.y - .3, heightAt(a.x, a.z) - .2)), bb = b.clone().setY(Math.min(b.y - .3, heightAt(b.x, b.z) - .2));
      quad(stone, a, aa, bb, b, 0x818d83);
    });
  }
  for (const [surface, name, roughness, metalness] of [[metal, 'curved-skin', .48, .48], [glass, 'entry-glazing', .25, .22], [stone, 'stage-and-terraces', .9, 0]] as const) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(surface.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(surface.colors, 3));
    (geometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
    geometry.computeVertexNormals(); geometry.computeBoundingSphere(); geometry.computeBoundingBox(); surface.geometry = geometry;
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness, metalness }));
    mesh.name = `poongsan-${name}`; mesh.receiveShadow = true; shell.add(mesh);
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
