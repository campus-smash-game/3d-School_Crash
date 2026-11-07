import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';

type Point = [number, number];
type HeightAt = (x: number, z: number) => number;
type Part = { proxy: THREE.Mesh; start: number; original: Float32Array; shown: boolean };

export type InformationCourtApproachLayout = {
  lower: Point;
  upper: Point;
  width: number;
  source: string;
};

// 사진의 24동 북서쪽 약 20 m 구간을 원본 외곽과 맞춘 후보다. 사진에서 측량한 좌표가 아니다.
export const informationCourtApproachLayout: InformationCourtApproachLayout = {
  lower: [123, -740], upper: [129, -746], width: 2.2,
  source: 'Naver Streetview 2025-09, panorama 8JWKc-rpjNS64cpqPGQVUA; sources/central-plaza-roadview-notes.json',
};

/** 102동 맞은편 돌계단의 관찰 형태를 지정한 두 지면 접점에 맞춘다. 치수는 게임용 근사다. */
export function createInformationCourtApproach(scene: THREE.Scene, heightAt: HeightAt, layout: InformationCourtApproachLayout = informationCourtApproachLayout) {
  const lower = new THREE.Vector3(layout.lower[0], 0, layout.lower[1]);
  const upper = new THREE.Vector3(layout.upper[0], 0, layout.upper[1]);
  const length = lower.distanceTo(upper), along = upper.clone().sub(lower).normalize();
  const across = new THREE.Vector3(along.z, 0, -along.x), up = new THREE.Vector3(0, 1, 0);
  const halfWidth = layout.width / 2, shell = new THREE.Group();
  shell.name = 'facilities/information-court-approach'; scene.add(shell);
  const positions: number[] = [], colors: number[] = [], parts: Part[] = [], breakables: BreakableSpec[] = [];
  const world = (s: number, n: number, y = 0) => lower.clone().addScaledVector(along, s).addScaledVector(across, n).setY(y);
  const ground = (s: number, n: number) => { const p = world(s, n); return heightAt(p.x, p.z); };
  function component(name: string, geometry: THREE.BufferGeometry, color: number, material: BreakableSpec['material'] = 'stone', extra: Record<string, unknown> = {}) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry, p = g.getAttribute('position');
    const original = Float32Array.from(p.array), start = positions.length, tint = new THREE.Color(color);
    for (const value of original) positions.push(value);
    for (let i = 0; i < p.count; i++) colors.push(tint.r, tint.g, tint.b);
    g.computeBoundingBox(); const bounds = g.boundingBox!, center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const local = original.slice(); for (let i = 0; i < local.length; i += 3) { local[i] -= center.x; local[i + 1] -= center.y; local[i + 2] -= center.z; }
    const proxyGeometry = new THREE.BufferGeometry(); proxyGeometry.setAttribute('position', new THREE.Float32BufferAttribute(local, 3)); proxyGeometry.computeVertexNormals();
    const proxy = new THREE.Mesh(proxyGeometry, new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide }));
    proxy.position.copy(center); proxy.updateMatrixWorld(true);
    Object.assign(proxy.userData, { facilityId: shell.name, landmark: 'information-court-approach', component: name, renderProxy: true, dimensionsEstimated: true, ...extra });
    parts.push({ proxy, start, original, shown: true });
    breakables.push({ mesh: proxy, size, collisionVertices: local.slice(), toughness: material === 'metal' ? 5 : 10, material, label: material === 'metal' ? '정보화본부 맞은편 계단 난간' : '정보화본부 맞은편 돌계단' });
    g.dispose(); if (g !== geometry) geometry.dispose();
  }
  function prism(name: string, top: THREE.Vector3[], depth: number, color: number, extra: Record<string, unknown> = {}) {
    component(name, new ConvexGeometry([...top, ...top.map(p => p.clone().addScaledVector(up, -depth))]), color, 'stone', extra);
  }
  function beam(name: string, a: THREE.Vector3, b: THREE.Vector3, radius: number) {
    const center = a.clone().add(b).multiplyScalar(.5), direction = b.clone().sub(a);
    const geometry = new THREE.CylinderGeometry(radius, radius, direction.length(), 6);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, direction.normalize())).translate(center.x, center.y, center.z);
    component(name, geometry, 0x303a39, 'metal');
  }
  function maximumGround(s0: number, s1: number) {
    let highest = -Infinity;
    for (let i = 0; i <= 6; i++) for (let j = 0; j <= 8; j++) highest = Math.max(highest, ground(THREE.MathUtils.lerp(s0, s1, i / 6), THREE.MathUtils.lerp(-halfWidth, halfWidth, j / 8)));
    return highest;
  }
  const count = Math.max(4, Math.ceil(length / .48));
  const steps = Array.from({ length: count }, (_, i) => ({ s0: length * i / count, s1: length * (i + 1) / count, top: maximumGround(length * i / count, length * (i + 1) / count) + .09 }));
  // 각 단 전체 폭을 지면 위에 두고 갑작스러운 높이 차는 앞쪽 단에 나눠 반영한다.
  for (let i = 1; i < steps.length; i++) steps[i].top = Math.max(steps[i].top, steps[i - 1].top);
  for (let i = steps.length - 2; i >= 0; i--) steps[i].top = Math.max(steps[i].top, steps[i + 1].top - .27);
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i], bottom = Math.min(ground(step.s0, -halfWidth), ground(step.s1, halfWidth), ground(step.s1, -halfWidth), ground(step.s0, halfWidth)) - .14;
    for (let j = 0; j < 3; j++) {
      const a = -halfWidth + layout.width * j / 3, b = -halfWidth + layout.width * (j + 1) / 3;
      prism('stone-step', [world(step.s0, a, step.top), world(step.s0, b, step.top), world(step.s1, b, step.top), world(step.s1, a, step.top)], step.top - bottom, [0xa8a494, 0xb8b09b, 0xa5a697][(i + j) % 3], { stepIndex: i, blockIndex: j });
    }
  }
  const approachStart = -2.4, landingEnd = length + .8;
  const firstTop = steps[0].top, lastTop = steps.at(-1)!.top;
  function paving(s0: number, s1: number, name: string, height: (s: number, n: number) => number) {
    const rows = Math.ceil((s1 - s0) / .4);
    for (let i = 0; i < rows; i++) for (let j = 0; j < 4; j++) {
      const a = THREE.MathUtils.lerp(s0, s1, i / rows), b = THREE.MathUtils.lerp(s0, s1, (i + 1) / rows);
      const n0 = THREE.MathUtils.lerp(-halfWidth, halfWidth, j / 4), n1 = THREE.MathUtils.lerp(-halfWidth, halfWidth, (j + 1) / 4);
      const points = [[a, n0], [a, n1], [b, n1], [b, n0]].map(([s, n]) => world(s, n, height(s, n)));
      for (const ids of [[0, 1, 2], [0, 2, 3]]) prism(name, ids.map(k => points[k]), .18, (i + j) % 2 ? 0xb5ae9b : 0xa7a89c);
    }
  }
  paving(approachStart, 0, 'lower-stone-paving', (s, n) => Math.max(ground(s, n) + .045, THREE.MathUtils.lerp(ground(approachStart, n) + .045, firstTop, (s - approachStart) / -approachStart)));
  paving(length, landingEnd, 'upper-ground-connection', (s, n) => Math.max(ground(s, n) + .045, THREE.MathUtils.lerp(lastTop, ground(landingEnd, n) + .045, (s - length) / (landingEnd - length))));
  const topAt = (s: number) => steps.find(step => s <= step.s1)?.top ?? lastTop;
  // 사진에서 확인한 올라가는 방향 오른쪽 난간만 둔다. 가로대 사이 빈 공간은 개별 부재로 남긴다.
  const postCount = Math.max(2, Math.ceil(length / 1.5));
  const posts = Array.from({ length: postCount + 1 }, (_, i) => { const s = length * i / postCount; return { s, y: topAt(s) }; });
  for (const post of posts) beam('right-railing-post', world(post.s, halfWidth + .08, post.y - .06), world(post.s, halfWidth + .08, post.y + 1.02), .035);
  for (let i = 0; i + 1 < posts.length; i++) for (const h of [.35, .67, 1.0]) {
    const a = posts[i], b = posts[i + 1]; beam('right-railing-bar', world(a.s, halfWidth + .08, a.y + h), world(b.s, halfWidth + .08, b.y + h), .025);
  }
  // 사진의 왼쪽 낮은 관목만 소수 추가한다. 수종과 개별 위치는 근사다.
  const shrubs = [.13, .38, .63, .88].map((t, i) => {
    const s = length * t, n = -halfWidth - .70, p = world(s, n), y = heightAt(p.x, p.z);
    component('left-low-shrub', new THREE.IcosahedronGeometry(1, 1).scale(.55, .48, .50).translate(p.x, y + .29, p.z), i % 2 ? 0x657a4d : 0x597147, 'wood');
    return { s, n, x: p.x, z: p.z, groundY: y, height: .77 };
  });
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  (geometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage); geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .87 })); mesh.name = 'information-court-stone-steps-and-railing'; mesh.receiveShadow = true; shell.add(mesh);
  Object.assign(shell.userData, { role: 'campus-facilities', facilityId: shell.name, landmark: 'information-court-approach', source: layout.source,
    adjacentBuildings: ['way/193893590', 'way/238937635'], sourceBuildingIdentification: '102동과 24동의 지도 배치에 맞춘 사진 대응', coordinatesEstimated: true, dimensionsEstimated: true, stepCountMeasured: false, terrainChanged: false,
    lower: lower.toArray(), upper: upper.toArray(), axis: along.toArray(), across: across.toArray(), width: layout.width, length, steps, posts, shrubs, plantingCountAndSpeciesEstimated: true,
    route: { start: world(approachStart - .8, 0, ground(approachStart - .8, 0)).toArray(), lower: world(0, 0, firstTop).toArray(), upper: world(length, 0, lastTop).toArray(), end: world(landingEnd + .8, 0, ground(landingEnd + .8, 0)).toArray() },
    originalBuildingGeometryUnchanged: true, coordinateConvention: 'D=(east,up,north); parent H applies once.', parts: parts.length, triangles: positions.length / 9, renderMeshes: 1 });
  function update(_player: THREE.Vector3) {
    const attribute = geometry.getAttribute('position') as THREE.BufferAttribute; let changed = false;
    for (const part of parts) if (part.shown !== part.proxy.visible) {
      if (!changed) attribute.clearUpdateRanges(); changed = true; part.shown = part.proxy.visible;
      if (part.shown) (attribute.array as Float32Array).set(part.original, part.start);
      else for (let i = 0; i < part.original.length; i += 3) { attribute.array[part.start + i] = part.proxy.position.x; attribute.array[part.start + i + 1] = part.proxy.position.y; attribute.array[part.start + i + 2] = part.proxy.position.z; }
      attribute.addUpdateRange(part.start, part.original.length);
    }
    if (changed) attribute.needsUpdate = true; shell.visible = parts.some(part => part.proxy.visible);
  }
  return { breakables, shell, update };
}
