import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';

type XZ = [number, number];
type XYZ = [number, number, number];
export const HUMANITIES14_STAIR = { buildingId: 'way/167609164', roadId: 'way/167609407/28', lower: [598.94, -593.35] as XZ, upper: [626.81, -556.44] as XZ, width: 2 };

export function createHumanities14Stair(scene: THREE.Scene) {
  const { lower, upper, width } = HUMANITIES14_STAIR, length = Math.hypot(upper[0] - lower[0], upper[1] - lower[1]);
  const axis: XZ = [(upper[0] - lower[0]) / length, (upper[1] - lower[1]) / length], side: XZ = [-axis[1], axis[0]];
  const point = (s: number, n = 0): XZ => [lower[0] + axis[0] * s + side[0] * n, lower[1] + axis[1] * s + side[1] * n];
  const local = (p: XYZ) => ({ s: (p[0] - lower[0]) * axis[0] + (p[2] - lower[1]) * axis[1], n: (p[0] - lower[0]) * side[0] + (p[2] - lower[1]) * side[1] });
  const at = (s: number, y: number, n = 0) => { const p = point(s, n); return new THREE.Vector3(p[0], y, p[1]); };
  const clip = (polygon: XYZ[], distance: (p: XYZ) => number) => {
    const output: XYZ[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length], da = distance(a), db = distance(b);
      if (da >= -1e-8) output.push(a);
      if ((da >= -1e-8) !== (db >= -1e-8)) output.push(a.map((v, k) => v + (b[k] - v) * da / (da - db)) as XYZ);
    }
    return output;
  };
  const area = (p: XYZ[]) => p.reduce((sum, a, i) => { const b = p[(i + 1) % p.length]; return sum + a[0] * b[2] - b[0] * a[2]; }, 0);
  const terrain = scene.getObjectByName('campus-terrain') as THREE.Mesh<THREE.BufferGeometry>;
  if (!terrain) throw Error('Humanities 14 stair requires the actual terrain mesh.');
  const terrainTriangles: XYZ[][] = [], attr = terrain.geometry.getAttribute('position'), index = terrain.geometry.index;
  for (let i = 0; i < (index?.count ?? attr.count); i += 3) {
    const tri = [0, 1, 2].map(j => { const k = index ? index.getX(i + j) : i + j; return [attr.getX(k), attr.getY(k), attr.getZ(k)] as XYZ; });
    const q = tri.map(local);
    if (Math.max(...q.map(p => p.s)) >= -8 && Math.min(...q.map(p => p.s)) <= length + 8 && Math.max(...q.map(p => p.n)) >= -9 && Math.min(...q.map(p => p.n)) <= 9) terrainTriangles.push(tri);
  }
  const ground = (s: number, n = 0) => {
    const p = point(s, n);
    for (const [a, b, c] of terrainTriangles) {
      const det = (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]);
      const u = ((p[0] - a[0]) * (c[2] - a[2]) - (p[1] - a[2]) * (c[0] - a[0])) / det;
      const v = ((b[0] - a[0]) * (p[1] - a[2]) - (b[2] - a[2]) * (p[0] - a[0])) / det;
      if (u >= -1e-7 && v >= -1e-7 && u + v <= 1.0000001) return a[1] + u * (b[1] - a[1]) + v * (c[1] - a[1]);
    }
    throw Error(`Humanities 14 terrain sample outside retained triangles: ${s}, ${n}`);
  };
  const patches = (s0: number, s1: number, n0 = -width / 2, n1 = width / 2) => terrainTriangles.map(tri => {
    let p = tri;
    for (const plane of [(q: XYZ) => local(q).s - s0, (q: XYZ) => s1 - local(q).s, (q: XYZ) => local(q).n - n0, (q: XYZ) => n1 - local(q).n]) p = clip(p, plane);
    return p;
  }).filter(p => p.length >= 3 && Math.abs(area(p)) > 1e-7);
  const shell = new THREE.Group(); shell.name = 'connection/humanities-14-stair';
  Object.assign(shell.userData, { role: 'campus-connection', buildingId: HUMANITIES14_STAIR.buildingId, connectionId: shell.name }); scene.add(shell);
  const positions: number[] = [], colors: number[] = [], breakables: BreakableSpec[] = [];
  type Proxy = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  const parts: { proxy: Proxy; start: number; end: number; original: Float32Array; originalColors: Float32Array; base: THREE.Color; color: number; shown: boolean }[] = [];
  function component(name: string, vertices: THREE.Vector3[], color: number, material: BreakableSpec['material'] = 'stone', owner?: Proxy) {
    const bounds = new THREE.Box3().setFromPoints(vertices), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const geometry = new ConvexGeometry(vertices.map(p => p.clone().sub(center))), attribute = geometry.getAttribute('position');
    const proxy = owner ?? new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: .9 }));
    if (!owner) {
      proxy.position.copy(center); proxy.updateMatrixWorld(true);
      Object.assign(proxy.userData, { buildingId: HUMANITIES14_STAIR.buildingId, connectionId: shell.name, component: name, convex: true, renderProxy: true });
      breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attribute.array), material, label: '14동 뒤 계단', toughness: material === 'wood' ? 4 : 8 });
    }
    const start = positions.length, tint = new THREE.Color(color);
    for (let i = 0; i < attribute.count; i++) { positions.push(attribute.getX(i) + center.x, attribute.getY(i) + center.y, attribute.getZ(i) + center.z); colors.push(tint.r, tint.g, tint.b); }
    parts.push({ proxy, start, end: positions.length, original: Float32Array.from(positions.slice(start)), originalColors: Float32Array.from(colors.slice(start)), base: proxy.material.color.clone(), color: proxy.material.color.getHex(), shown: true });
    if (owner) geometry.dispose(); return proxy;
  }
  function box(name: string, s0: number, s1: number, n0: number, n1: number, y0: number, y1: number, color: number, material: BreakableSpec['material'] = 'stone', owner?: Proxy) {
    const vertices: THREE.Vector3[] = [];
    for (const s of [s0, s1]) for (const n of [n0, n1]) for (const y of [y0, y1]) vertices.push(at(s, y, n));
    return component(name, vertices, color, material, owner);
  }
  function beam(name: string, a: THREE.Vector3, b: THREE.Vector3, w: number, d: number, color: number, material: BreakableSpec['material'] = 'wood') {
    const direction = b.clone().sub(a), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize()), center = a.clone().add(b).multiplyScalar(.5), vertices: THREE.Vector3[] = [];
    for (const x of [-w / 2, w / 2]) for (const y of [-direction.length() / 2, direction.length() / 2]) for (const z of [-d / 2, d / 2]) vertices.push(new THREE.Vector3(x, y, z).applyQuaternion(q).add(center));
    return component(name, vertices, color, material);
  }
  const stairEnd = length - 2, count = Math.ceil(stairEnd / .44), tread = stairEnd / count, steps: { s0: number; s1: number; y: number }[] = [];
  const lowerY = Math.max(ground(0, -1), ground(0, 0), ground(0, 1)) + .035;
  let previousY = lowerY;
  for (let i = 0; i < count; i++) {
    const s0 = i * tread, s1 = (i + 1) * tread, vertices = patches(s0, s1).flat(), y = Math.max(previousY, ...vertices.map(p => p[1] + .035));
    const owner = box('stair-tread', s0, s1, -1, 1, Math.min(previousY, ...vertices.map(p => p[1])) - .15, y, i % 2 ? 0x94795b : 0x9b8060);
    // 사진의 갈색 미끄럼 방지 마감은 가는 무늬로 표현하고 바닥 부품과 함께 파괴한다.
    for (const ds of [.08, .20, .32]) box('tread-mat-ridge', s0 + ds, s0 + ds + .015, -.96, .96, y, y + .003, 0xa88d6a, 'stone', owner);
    steps.push({ s0, s1, y }); previousY = y;
  }
  const floorAt = (s: number) => s <= 0 ? lowerY : steps[Math.min(steps.length - 1, Math.floor(s / tread))].y;
  function apron(s0: number, s1: number, anchor: number, anchorY: number) {
    for (let s = s0; s < s1 - 1e-6; s += .4) for (let n = -1; n < .99; n += .5) for (const polygon of patches(s, Math.min(s1, s + .4), n, n + .5)) {
      const top = polygon.map(p => { const q = local(p), weight = anchor === s0 ? (s1 - q.s) / (s1 - s0) : (q.s - s0) / (s1 - s0); return new THREE.Vector3(p[0], p[1] + .035 + weight * Math.max(0, anchorY - ground(anchor, q.n) - .035), p[2]); });
      for (let i = 1; i + 1 < top.length; i++) { const tri = [top[0], top[i], top[i + 1]]; if (new THREE.Triangle(...tri).getArea() < 1e-7) continue; component('stair-apron', [...tri, ...tri.map(p => p.clone().add(new THREE.Vector3(0, -.12, 0)))], 0xaaa9a1); }
    }
  }
  apron(-2, 0, 0, lowerY); apron(stairEnd, length, stairEnd, previousY);
  // 아래를 바라볼 때 오른쪽에 있는 네 줄 난간만 사진으로 확인했다.
  const posts = Array.from({ length: Math.ceil((stairEnd - 1) / 2.1) + 1 }, (_, i) => i);
  for (let i = 0; i < posts.length; i++) {
    const s = 1 + (stairEnd - 2) * i / (posts.length - 1), y = floorAt(s), n = 1.16;
    const post = box('timber-rail-post', s - .08, s + .08, n - .08, n + .08, ground(s, n) - .12, y + 1.14, 0x74523c, 'wood');
    box('post-cap', s - .084, s + .084, n - .084, n + .084, y + 1.14, y + 1.17, 0xaaa99d, 'metal', post);
    if (i) {
      const previousS = 1 + (stairEnd - 2) * (i - 1) / (posts.length - 1);
      for (const h of [.26, .50, .74, .98]) beam('timber-handrail', at(previousS, floorAt(previousS) + h, n), at(s, y + h, n), .075, .12, 0x90694c);
    }
  }
  // 소식지에서 확인한 아래쪽 대나무 구간이다. 줄기마다 물리 객체를 만들지 않는다.
  for (const sign of [-1, 1]) for (let cluster = 0; cluster < 7; cluster++) {
    const s = 2.4 + cluster * 1.9, n = sign * (1.9 + (cluster % 2) * .45), y = ground(s, n), h = 2.8 + (cluster % 3) * .35;
    const root = box('bamboo-root', s - .12, s + .12, n - .12, n + .12, y - .1, y + .12, 0x727249, 'wood');
    for (let stem = 0; stem < 4; stem++) {
      const ss = s + (stem - 1.5) * .17, nn = n + (stem % 2 ? .22 : -.22);
      box('bamboo-culm', ss - .025, ss + .025, nn - .025, nn + .025, y, y + h, stem % 2 ? 0x8a8653 : 0x777b43, 'wood', root);
      for (let tier = 0; tier < 4; tier++) {
        const hh = y + 1.15 + tier * .43, leafN = nn + (tier % 2 ? -.28 : .28), vertices = [at(ss - .28, hh, leafN), at(ss + .36, hh + .18, nn), at(ss + .12, hh + .22, leafN + .16), at(ss, hh + .01, leafN)];
        component('bamboo-leaves', vertices, tier % 2 ? 0x647b3e : 0x809547, 'wood', root);
      }
    }
  }
  // 상단 로드뷰의 숲을 근사한다. 개별 나무의 위치와 수종은 확인하지 못했다.
  for (const sign of [-1, 1]) for (let i = 0; i < 6; i++) {
    const s = 17 + i * 4.6, n = sign * (3.9 + (i % 2) * 1.2), y = ground(s, n), h = 6.5 + (i % 3) * .7;
    const trunk = box('stair-woodland-trunk', s - .16, s + .16, n - .16, n + .16, y, y + h * .8, 0x61533d, 'wood');
    for (const tier of [0, 1]) {
      const canopy = new THREE.IcosahedronGeometry(1, 1), p = canopy.getAttribute('position'), center = at(s + tier * .45, y + h * (.69 + tier * .18), n);
      component('stair-woodland-canopy', Array.from({ length: p.count }, (_, k) => new THREE.Vector3(p.getX(k) * 2.35, p.getY(k) * 2.3, p.getZ(k) * 2.35).add(center)), tier ? 0x70864f : 0x54714b, 'wood', trunk); canopy.dispose();
    }
  }
  const lampS = .7, lampN = 1.88, lampBase = ground(lampS, lampN);
  box('garden-lamp-post', lampS - .065, lampS + .065, lampN - .065, lampN + .065, lampBase, lampBase + 2.8, 0x4b4234, 'metal');
  beam('garden-lamp-arm', at(lampS, lampBase + 2.55, lampN - .33), at(lampS, lampBase + 2.55, lampN + .33), .065, .065, 0x4b4234, 'metal');
  for (const n of [lampN - .33, lampN + .33]) {
    const sphere = new THREE.IcosahedronGeometry(.20, 1), p = sphere.getAttribute('position'), center = at(lampS, lampBase + 2.48, n);
    component('garden-lamp-globe', Array.from({ length: p.count }, (_, i) => new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).add(center)), 0xd9d8be, 'glass'); sphere.dispose();
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); (geometry.attributes.position as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .9 })); mesh.name = 'humanities-14-stair-surfaces'; mesh.castShadow = true; mesh.receiveShadow = true; shell.add(mesh);
  const pavementMasks = [{ component: 'stair-corridor', polygon: [point(-2, -1), point(length, -1), point(length, 1), point(-2, 1)] }];
  const access = { ...HUMANITIES14_STAIR, length, axis, side, lowerY, steps, upperY: ground(length), tread, widthEstimated: true, stepCountEstimated: true, heightFromGameTerrain: true, pavementMasks, terrainChanged: false, photoSource: 'https://humanities.snu.ac.kr/community/newsletter?md=download&seqidx=63', photoPrintedPage: 29, photoCaptureDate: null, roadviewSource: 'https://kko.to/bVHZrMraPV', wholeBuildingReconstructed: false, geometry: { parts: parts.length, colliders: breakables.length, triangles: positions.length / 9, meshes: 1, textures: 0 } };
  shell.userData.humanities14Access = access;
  function conformPathOverlay(input: number[]) {
    const output: number[] = []; let changedTriangles = 0;
    const corners = [point(-4, -3), point(-4, 3), point(length + 2, -3), point(length + 2, 3)];
    const bounds = { minX: Math.min(...corners.map(p => p[0])), maxX: Math.max(...corners.map(p => p[0])), minZ: Math.min(...corners.map(p => p[1])), maxZ: Math.max(...corners.map(p => p[1])) };
    const distance = (p: XYZ) => { const q = local(p); return Math.hypot(Math.max(-2 - q.s, q.s - length, 0), Math.max(Math.abs(q.n) - 1, 0)); };
    function append(tri: XYZ[], depth = 0) {
      if (Math.max(...tri.map(p => p[0])) < bounds.minX || Math.min(...tri.map(p => p[0])) > bounds.maxX || Math.max(...tri.map(p => p[2])) < bounds.minZ || Math.min(...tri.map(p => p[2])) > bounds.maxZ) { output.push(...tri.flat()); return; }
      const q = tri.map(local), outside = Math.max(...q.map(p => p.s)) < -4 || Math.min(...q.map(p => p.s)) > length + 2 || Math.max(...q.map(p => p.n)) < -3 || Math.min(...q.map(p => p.n)) > 3;
      if (outside) { output.push(...tri.flat()); return; }
      const lengths = tri.map((p, i) => { const b = tri[(i + 1) % 3]; return Math.hypot(p[0] - b[0], p[2] - b[2]); });
      if (Math.max(...lengths) > .45 && depth < 9) {
        const [a, b, c] = tri, mid = (u: XYZ, v: XYZ) => u.map((n, i) => (n + v[i]) / 2) as XYZ, ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
        for (const p of [[a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]]) append(p, depth + 1); return;
      }
      changedTriangles++;
      for (const p of tri) { const q = local(p), weight = Math.max(0, 1 - distance(p) / 2); output.push(p[0], weight > 0 ? THREE.MathUtils.lerp(p[1], ground(q.s, q.n) + .035, weight) : p[1], p[2]); }
    }
    for (let i = 0; i < input.length; i += 9) append([input.slice(i, i + 3) as XYZ, input.slice(i + 3, i + 6) as XYZ, input.slice(i + 6, i + 9) as XYZ]);
    shell.userData.humanities14Overlay = { before: input.length / 9, after: output.length / 9, changedTriangles, blendDistance: 2, terrainChanged: false, roadChanged: false };
    input.length = 0; for (const n of output) input.push(n);
  }
  function update(_player: THREE.Vector3) {
    const a = geometry.attributes.position as THREE.BufferAttribute, c = geometry.attributes.color as THREE.BufferAttribute; let changed = false, recolored = false;
    for (const part of parts) {
      if (part.shown !== part.proxy.visible) { part.shown = part.proxy.visible; changed = true; if (part.shown) (a.array as Float32Array).set(part.original, part.start); else for (let i = part.start; i < part.end; i += 3) { a.array[i] = part.proxy.position.x; a.array[i + 1] = part.proxy.position.y; a.array[i + 2] = part.proxy.position.z; } }
      const tint = part.proxy.material.color;
      if (part.color !== tint.getHex()) { part.color = tint.getHex(); recolored = true; const scale = [tint.r / part.base.r, tint.g / part.base.g, tint.b / part.base.b]; for (let i = part.start; i < part.end; i++) c.array[i] = part.originalColors[i - part.start] * scale[(i - part.start) % 3]; }
    }
    if (changed) a.needsUpdate = true; if (recolored) c.needsUpdate = true; shell.visible = parts.some(p => p.proxy.visible);
  }
  return { shell, breakables, update, conformPathOverlay };
}
