import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';

type HeightAt = (x: number, z: number) => number;
type Part = { proxy: THREE.Mesh; shown: boolean; start: number; original: Float32Array };

/** 공식 도서관 VR의 중앙계단과 화단을 근사한다. 단수와 폭은 실측값이 아니다. */
export function createCentralPlazaFacilities(scene: THREE.Scene, heightAt: HeightAt) {
  const library = scene.children.find(o => o.userData.landmark === 'main-library' && o.userData.role === 'building-shell');
  if (!library) throw new Error('Central plaza requires the main-library entrance anchors.');
  const info = library.userData, origin = new THREE.Vector3(info.localOrigin.x, info.localOrigin.y, info.localOrigin.z);
  const libraryAxis = new THREE.Vector3(info.axis.x, 0, info.axis.z), libraryFront = new THREE.Vector3(-libraryAxis.z, 0, libraryAxis.x);
  const approach = origin.clone().addScaledVector(libraryFront, info.entrance.approach.endZ); approach.y += info.entrance.approach.endY;
  const door = origin.clone().addScaledVector(libraryFront, info.entrance.z); door.y += info.entrance.floor;
  const a = new THREE.Vector3(258.75, 0, -741.31), b = new THREE.Vector3(288.40, 0, -770.03), length = a.distanceTo(b);
  const along = b.clone().sub(a).normalize(), across = new THREE.Vector3(-along.z, 0, along.x), up = new THREE.Vector3(0, 1, 0), halfWidth = 6;
  const world = (s: number, offset: number, y: number) => a.clone().addScaledVector(along, s).addScaledVector(across, offset).setY(y);
  const ground = (s: number, offset: number) => { const p = world(s, offset, 0); return heightAt(p.x, p.z); };
  const shell = new THREE.Group(); shell.name = 'facilities/central-plaza'; scene.add(shell);
  const positions: number[] = [], colors: number[] = [], parts: Part[] = [], breakables: BreakableSpec[] = [];
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .86, side: THREE.DoubleSide });
  function component(name: string, geometry: THREE.BufferGeometry, color: number, kind: BreakableSpec['material'] = 'stone') {
    const g = geometry.index ? geometry.toNonIndexed() : geometry, p = g.getAttribute('position'), original = new Float32Array(p.array), tint = new THREE.Color(color), start = positions.length;
    positions.push(...original); for (let i = 0; i < p.count; i++) colors.push(tint.r, tint.g, tint.b);
    g.computeBoundingBox(); const box = g.boundingBox!, centre = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const local = original.slice(); for (let i = 0; i < local.length; i += 3) { local[i] -= centre.x; local[i + 1] -= centre.y; local[i + 2] -= centre.z; }
    const proxyGeometry = new THREE.BufferGeometry(); proxyGeometry.setAttribute('position', new THREE.Float32BufferAttribute(local, 3)); proxyGeometry.computeVertexNormals();
    const proxy = new THREE.Mesh(proxyGeometry, new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide })); proxy.position.copy(centre); proxy.updateMatrixWorld(true);
    Object.assign(proxy.userData, { facilityId: shell.name, renderProxy: true, landmark: 'central-plaza', component: name, dimensionsEstimated: true });
    breakables.push({ mesh: proxy, size, collisionVertices: local.slice(), toughness: kind === 'glass' ? 3 : kind === 'metal' ? 5 : 10, material: kind, label: name.includes('lamp') ? '중앙계단 가로등' : name.includes('planter') ? '중앙계단 화단 경계' : '중앙계단과 포장' });
    parts.push({ proxy, shown: true, start, original }); g.dispose(); if (g !== geometry) geometry.dispose();
  }
  function prism(name: string, top: THREE.Vector3[], depth: number, color: number) {
    const vertices = [...top, ...top.map(p => p.clone().addScaledVector(up, -depth))];
    component(name, new ConvexGeometry(vertices), color);
  }
  function box(name: string, centre: THREE.Vector3, size: THREE.Vector3, color: number, kind: BreakableSpec['material'] = 'stone', heading = 0) {
    const geometry = new THREE.BoxGeometry(size.x, size.y, size.z).rotateY(heading).translate(centre.x, centre.y, centre.z); component(name, geometry, color, kind);
  }
  function maxGround(s0: number, s1: number, width = halfWidth) { let max = -Infinity; for (let s = s0; s < s1 + .001; s += Math.max(.1, (s1 - s0) / 6)) for (let offset = -width; offset <= width + .001; offset += .5) max = Math.max(max, ground(s, offset)); return max; }
  const intervals: [number, number][] = [];
  for (let s = 0; s < 8; s += 1) intervals.push([s, s + 1]);
  for (let s = 8; s < 24; s += 4) intervals.push([s, s + 4]);
  const upperSteps = Math.ceil((length - 24) / .78); for (let i = 0; i < upperSteps; i++) intervals.push([24 + (length - 24) * i / upperSteps, 24 + (length - 24) * (i + 1) / upperSteps]);
  const steps = intervals.map(([s0, s1], i) => ({ s0, s1, top: maxGround(s0, s1) + .105, kind: s1 - s0 > 2 ? 'landing' : 'step', index: i }));
  // 단의 높이는 전체 폭의 지면을 덮도록 정하며, 지형 데이터 자체는 바꾸지 않는다.
  for (const step of steps) {
    const bottom = Math.min(ground(step.s0, -halfWidth), ground(step.s0, halfWidth), ground(step.s1, -halfWidth), ground(step.s1, halfWidth)) - .15;
    for (let offset = -halfWidth; offset < halfWidth; offset += 3) {
      prism('central-' + step.kind, [world(step.s0, offset, step.top), world(step.s0, offset + 3, step.top), world(step.s1, offset + 3, step.top), world(step.s1, offset, step.top)], step.top - bottom, 0xb1b0a6 + (step.index % 2 ? 0x020202 : 0));
    }
  }
  // 하단은 기존 광장에서 단차 없이 올라오도록 지형을 따르는 짧은 접속면으로 잇는다.
  const lowerStart = -3, firstTop = steps[0].top, lastTop = steps.at(-1)!.top;
  const lowerSamples: { s: number; offset: number; y: number }[] = [];
  for (let offset = -halfWidth; offset < halfWidth; offset += 1.5) for (let s = lowerStart; s < 0; s += .5) {
    const corners = [[s, offset], [s, offset + 1.5], [s + .5, offset + 1.5], [s + .5, offset]].map(([d, n]) => {
      const t = (d - lowerStart) / -lowerStart, y = Math.max(THREE.MathUtils.lerp(ground(lowerStart, n) + .055, firstTop, t), ground(d, n) + .055); lowerSamples.push({ s: d, offset: n, y }); return world(d, n, y);
    });
    for (const ids of [[0, 1, 2], [0, 2, 3]]) prism('lower-ground-connection', ids.map(i => corners[i]), .22, 0xb3b3a8);
  }
  // 상단은 차양 기둥을 피해 기존 현관 경사판의 바깥 중심과 같은 단면에서 끝낸다.
  const startLeft = world(length, -halfWidth, lastTop), startRight = world(length, halfWidth, lastTop);
  const endLeft = approach.clone().addScaledVector(libraryAxis, -2.8), endRight = approach.clone().addScaledVector(libraryAxis, 2.8);
  const upperPoint = (t: number, v: number) => {
    const left = startLeft.clone().lerp(endLeft, t), right = startRight.clone().lerp(endRight, t), p = left.lerp(right, v);
    if (t > 0) p.y = Math.max(p.y, heightAt(p.x, p.z) + .12); return p;
  };
  for (let row = 0; row < 8; row++) for (let col = 0; col < 6; col++) {
    const corners = [upperPoint(row / 8, col / 6), upperPoint(row / 8, (col + 1) / 6), upperPoint((row + 1) / 8, (col + 1) / 6), upperPoint((row + 1) / 8, col / 6)];
    for (const ids of [[0, 1, 2], [0, 2, 3]]) prism('upper-paving-connection', ids.map(i => corners[i]), .25, 0xaeb0a6);
  }
  const surfaceY = (s: number) => steps.find(p => s >= p.s0 && s <= p.s1)?.top ?? lastTop;
  const planterSegments: { side: number; s0: number; s1: number }[] = [];
  // 화단의 낮은 돌 경계만 추가한다. 수목의 종과 정확한 개별 위치는 확정하지 않는다.
  for (const side of [-1, 1]) for (let s = 1; s < length - 2; s += 2) {
    if (s > 18 && s < 23) continue;
    const end = Math.min(s + 1.96, length - 1), n = side * (halfWidth + .24), y0 = Math.max(surfaceY(s), ground(s, n)), y1 = Math.max(surfaceY(end), ground(end, n));
    prism('planter-stone-edge', [world(s, n - .2, y0 + .36), world(s, n + .2, y0 + .36), world(end, n + .2, y1 + .36), world(end, n - .2, y1 + .36)], .54, 0x9da297); planterSegments.push({ side, s0: s, s1: end });
  }
  const lamps: { x: number; z: number; groundY: number }[] = [];
  for (const s of [10.5, 28.5]) {
    const p = world(s, -7.35, 0), y = heightAt(p.x, p.z); lamps.push({ x: p.x, z: p.z, groundY: y });
    const pole = new THREE.CylinderGeometry(.095, .14, 4.0, 8).translate(p.x, y + 2.0, p.z); component('paired-globe-lamp-post', pole, 0x56473b, 'metal');
    box('paired-globe-lamp-base', p.clone().setY(y + .12), new THREE.Vector3(.42, .24, .42), 0x60564b, 'metal');
    box('paired-globe-lamp-crossbar', p.clone().setY(y + 3.75), new THREE.Vector3(1.5, .105, .105), 0x56473b, 'metal', Math.atan2(-across.z, across.x));
    for (const sign of [-1, 1]) {
      const q = p.clone().addScaledVector(across, sign * .66).setY(y + 3.48);
      component('paired-globe-lamp-globe', new THREE.SphereGeometry(.25, 10, 6).translate(q.x, q.y, q.z), 0xe2ded0, 'glass');
    }
  }
  const planting: { kind: string; x: number; z: number; height: number }[] = [];
  // 사진의 오른쪽 수목열과 왼쪽 낮은 식재를 반영하되, 개체 수와 수종은 근사한다.
  for (const s of [7, 16, 29, 37]) {
    const p = world(s, 9.2, 0), y = heightAt(p.x, p.z), height = 7.0 + (s % 3) * .2; planting.push({ kind: 'tree-row', x: p.x, z: p.z, height });
    component('planter-tree-trunk', new THREE.CylinderGeometry(.13, .22, 4.9, 7).translate(p.x, y + 2.45, p.z), 0x686351, 'wood');
    component('planter-tree-crown', new THREE.IcosahedronGeometry(1, 1).scale(2.1, 2.65, 2.0).translate(p.x, y + height - 2.4, p.z), 0x6f8550, 'wood');
  }
  for (const s of [7, 30]) {
    const p = world(s, -9.0, 0), y = heightAt(p.x, p.z); planting.push({ kind: 'low-tree', x: p.x, z: p.z, height: 3.2 });
    component('planter-low-tree-trunk', new THREE.CylinderGeometry(.11, .18, 1.65, 7).translate(p.x, y + .825, p.z), 0x6f6954, 'wood');
    component('planter-low-tree-crown', new THREE.IcosahedronGeometry(1, 1).scale(1.75, 1.0, 1.6).translate(p.x, y + 2.2, p.z), 0x617947, 'wood');
  }
  for (const side of [-1, 1]) for (const s of [4, 12.5, 26, 34, 39]) {
    const p = world(s, side * 7.5, 0), y = heightAt(p.x, p.z); planting.push({ kind: 'low-shrub', x: p.x, z: p.z, height: .75 });
    component('planter-low-shrub', new THREE.IcosahedronGeometry(1, 1).scale(1.1, .45, .8).translate(p.x, y + .4, p.z), 0x637d4c, 'wood');
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); (geometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage); geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material); mesh.name = 'central-plaza-stairs-planters-lamps'; mesh.receiveShadow = true; mesh.frustumCulled = false; shell.add(mesh);
  Object.assign(shell.userData, { role: 'campus-facilities', facilityId: shell.name, landmark: 'central-plaza', sourcePaths: ['way/167985251/70', 'way/847953675/497'], anchors: { lower: a.toArray(), upper: b.toArray(), libraryApproach: approach.toArray(), libraryDoor: door.toArray() }, axis: along.toArray(), across: across.toArray(), stairs: { length, width: 2 * halfWidth, steps, lowerStart, lowerSamples }, upperConnection: { startLeft: startLeft.toArray(), startRight: startRight.toArray(), endLeft: endLeft.toArray(), endRight: endRight.toArray() }, lamps, planterSegments, planting, plantingCountAndSpeciesEstimated: true, dimensionsEstimated: true, fixtureCoordinatesEstimated: true, exactPhotoDate: null, source: 'https://lib.snu.ac.kr/vr/indexdata/pano_11923/html5/0.jpg', terrainChanged: false, inheritedEntranceUnchanged: true, coordinateConvention: 'D=(east,up,north); parent H applies once.' });
  function update(_player: THREE.Vector3) {
    let changed = false; const attr = geometry.getAttribute('position') as THREE.BufferAttribute;
    for (const part of parts) if (part.shown !== part.proxy.visible) { if (!changed) attr.clearUpdateRanges(); changed = true; part.shown = part.proxy.visible; if (part.shown) (attr.array as Float32Array).set(part.original, part.start); else for (let i = 0; i < part.original.length; i += 3) { attr.array[part.start + i] = part.proxy.position.x; attr.array[part.start + i + 1] = part.proxy.position.y; attr.array[part.start + i + 2] = part.proxy.position.z; } attr.addUpdateRange(part.start, part.original.length); }
    if (changed) attr.needsUpdate = true; shell.visible = parts.some(p => p.proxy.visible);
  }
  return { breakables, shell, update };
}
