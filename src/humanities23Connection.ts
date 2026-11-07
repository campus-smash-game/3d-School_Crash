import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import { HUMANITIES23, getHumanities23Layout, humanities23Frame } from './humanities23Site';

type XZ = [number, number];
type Proxy = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
type Frame = ReturnType<typeof humanities23Frame>;
export function createHumanities23Connection(scene: THREE.Scene, heightAt: (x: number, z: number) => number, footprints: XZ[][] = []) {
  const q = getHumanities23Layout(heightAt), shell = new THREE.Group(); shell.name = 'connection/humanities-2-3';
  Object.assign(shell.userData, { role: 'campus-connection', connectionId: shell.name, buildingId: HUMANITIES23.buildingId }); scene.add(shell);
  const breakables: BreakableSpec[] = [], pavementMasks: { component: string; polygon: XZ[] }[] = [];
  const batches = [false, true].map(glass => ({ glass, positions: [] as number[], colors: [] as number[], parts: [] as { proxy: Proxy; start: number; end: number; original: Float32Array; colors: Float32Array; base: THREE.Color; color: number; shown: boolean }[] }));
  const at = (f: Frame, s: number, y: number, n = 0) => { const p = f.point(s, n); return new THREE.Vector3(p[0], y, p[1]); };
  function component(name: string, vertices: THREE.Vector3[], color: number, material: BreakableSpec['material'] = 'stone', owner?: Proxy, flat = false) {
    const bounds = new THREE.Box3().setFromPoints(vertices), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const geometry = flat ? new THREE.BufferGeometry() : new ConvexGeometry(vertices.map(p => p.clone().sub(center)));
    if (flat) { const positions: number[] = []; for (let i = 1; i + 1 < vertices.length; i++) for (const p of [vertices[0], vertices[i], vertices[i + 1]]) positions.push(...p.clone().sub(center).toArray()); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); }
    const attr = geometry.attributes.position;
    const proxy = owner ?? new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color }));
    if (!owner) { proxy.position.copy(center); proxy.updateMatrixWorld(true); Object.assign(proxy.userData, { buildingId: HUMANITIES23.buildingId, connectionId: shell.name, component: name, renderProxy: true, convex: true }); breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attr.array), material, label: '2동 3동 연결부', toughness: material === 'glass' ? 2 : 8 }); }
    const batch = batches[material === 'glass' ? 1 : 0], start = batch.positions.length, tint = new THREE.Color(color);
    for (let i = 0; i < attr.count; i++) { batch.positions.push(attr.getX(i) + center.x, attr.getY(i) + center.y, attr.getZ(i) + center.z); batch.colors.push(tint.r, tint.g, tint.b); }
    batch.parts.push({ proxy, start, end: batch.positions.length, original: Float32Array.from(batch.positions.slice(start)), colors: Float32Array.from(batch.colors.slice(start)), base: proxy.material.color.clone(), color: proxy.material.color.getHex(), shown: true });
    if (owner) geometry.dispose(); return proxy;
  }
  function box(name: string, f: Frame, s0: number, s1: number, n0: number, n1: number, y0: number, y1: number, color = 0xdbdcd2, material: BreakableSpec['material'] = 'stone', owner?: Proxy) {
    const vertices: THREE.Vector3[] = []; for (const s of [s0, s1]) for (const n of [n0, n1]) for (const y of [y0, y1]) vertices.push(at(f, s, y, n)); return component(name, vertices, color, material, owner);
  }
  function beam(name: string, a: THREE.Vector3, b: THREE.Vector3, width: number, color: number, owner?: Proxy) {
    const delta = b.clone().sub(a), g = new THREE.BoxGeometry(width, width, delta.length()), rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), delta.normalize()), center = a.clone().add(b).multiplyScalar(.5), p = g.attributes.position;
    const result = component(name, Array.from({ length: p.count }, (_, i) => new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).applyQuaternion(rotation).add(center)), color, 'metal', owner); g.dispose(); return result;
  }
  const terrain = scene.getObjectByName('campus-terrain') as THREE.Mesh<THREE.BufferGeometry>, p = terrain.geometry.attributes.position, index = terrain.geometry.index;
  const terrainTriangles: THREE.Vector3[][] = [];
  for (let i = 0; i < (index?.count ?? p.count); i += 3) {
    const tri = [0, 1, 2].map(j => { const k = index ? index.getX(i + j) : i + j; return new THREE.Vector3(p.getX(k), p.getY(k), p.getZ(k)); });
    if (Math.max(...tri.map(v => v.x)) >= 415 && Math.min(...tri.map(v => v.x)) <= 460 && Math.max(...tri.map(v => v.z)) >= -697 && Math.min(...tri.map(v => v.z)) <= -648) terrainTriangles.push(tri);
  }
  const clip = (polygon: THREE.Vector3[], distance: (p: THREE.Vector3) => number) => {
    const output: THREE.Vector3[] = [];
    for (let i = 0; i < polygon.length; i++) { const a = polygon[i], b = polygon[(i + 1) % polygon.length], da = distance(a), db = distance(b); if (da >= -1e-8) output.push(a); if ((da >= -1e-8) !== (db >= -1e-8)) output.push(a.clone().lerp(b, da / (da - db))); } return output;
  };
  const patches = (f: Frame, s0: number, s1: number, n0: number, n1: number) => terrainTriangles.map(tri => {
    let polygon = tri; const local = (v: THREE.Vector3) => f.local([v.x, v.z]);
    for (const plane of [(v: THREE.Vector3) => local(v).s - s0, (v: THREE.Vector3) => s1 - local(v).s, (v: THREE.Vector3) => local(v).n - n0, (v: THREE.Vector3) => n1 - local(v).n]) polygon = clip(polygon, plane);
    return polygon;
  }).filter(p => p.length >= 3 && new THREE.Triangle(p[0], p[1], p[2]).getArea() > 1e-7);
  function ground(f: Frame, s: number, n = 0) {
    const [x, z] = f.point(s, n);
    for (const [a, b, c] of terrainTriangles) { const det = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x), u = ((x - a.x) * (c.z - a.z) - (z - a.z) * (c.x - a.x)) / det, v = ((b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x)) / det; if (u >= -1e-7 && v >= -1e-7 && u + v <= 1.0000001) return a.y + u * (b.y - a.y) + v * (c.y - a.y); }
    throw Error('Missing humanities 2/3 terrain sample');
  }
  const planes = (ring: XZ[]) => {
    const sign = Math.sign(ring.reduce((sum, a, i) => { const b = ring[(i + 1) % ring.length]; return sum + a[0] * b[1] - b[0] * a[1]; }, 0));
    return ring.map((a, i) => { const b = ring[(i + 1) % ring.length]; return (p: THREE.Vector3) => sign * ((b[0] - a[0]) * (p.z - a[1]) - (b[1] - a[1]) * (p.x - a[0])); });
  };
  const area = (p: THREE.Vector3[]) => Math.abs(p.reduce((sum, a, i) => { const b = p[(i + 1) % p.length]; return sum + a.x * b.z - b.x * a.z; }, 0));
  function subtract(poly: THREE.Vector3[], mask: XZ[]) {
    const ps = planes(mask); if (area(ps.reduce((p, plane) => clip(p, plane), poly)) < 1e-8) return [poly];
    const output: THREE.Vector3[][] = []; let rest = poly;
    for (const plane of ps) { const outside = clip(rest, p => -plane(p)); if (outside.length >= 3 && area(outside) > 1e-8) output.push(outside); rest = clip(rest, plane); } return output;
  }
  function paving(f: Frame, s0: number, s1: number, n0: number, n1: number, name = 'paved-apron', lift?: (s: number, n: number) => number, filter?: (p: THREE.Vector3[]) => THREE.Vector3[][]) {
    if (!filter) pavementMasks.push({ component: name, polygon: [f.point(s0, n0), f.point(s1, n0), f.point(s1, n1), f.point(s0, n1)] });
    const cell = name === 'haebang-court' ? 2.4 : 1.2;
    for (let s = s0; s < s1 - .001; s += cell) for (let n = n0; n < n1 - .001; n += cell) for (const raw of patches(f, s, Math.min(s1, s + cell), n, Math.min(n1, n + cell))) for (const poly of filter ? filter(raw) : [raw]) {
      if (filter) pavementMasks.push({ component: name, polygon: poly.map(p => [p.x, p.z]) });
      const top = poly.map(v => { const t = f.local([v.x, v.z]); return new THREE.Vector3(v.x, v.y + .045 + (lift?.(t.s, t.n) ?? 0), v.z); });
      const frame = Math.floor((s - s0) / 1.2) % 8 === 0 || Math.floor((n - n0) / 1.2) % 8 === 0;
      const owner = component(name, [...top, ...top.map(v => v.clone().add(new THREE.Vector3(0, -.12, 0)))], frame ? 0x9d8c81 : 0xb6b5aa);
      // 줄눈은 바닥 부품에 묶어 표시한다. 보도블록마다 충돌체를 만들지 않는다.
      const joints: THREE.Vector3[][] = [];
      for (let ss = s + .2; ss < Math.min(s1, s + cell); ss += .2) joints.push(...patches(f, ss, Math.min(s1, ss + .008), n, Math.min(n1, n + cell)));
      for (let nn = n + .4; nn < Math.min(n1, n + cell); nn += .4) joints.push(...patches(f, s, Math.min(s1, s + cell), nn, Math.min(n1, nn + .008)));
      for (const part of joints) { const joint = planes(poly.map(p => [p.x, p.z])).reduce((p, plane) => clip(p, plane), part); if (joint.length < 3 || area(joint) < 1e-8) continue; const points = joint.map(v => { const t = f.local([v.x, v.z]); return new THREE.Vector3(v.x, v.y + .047 + (lift?.(t.s, t.n) ?? 0), v.z); }); component('paver-joint', points, 0x8e9087, 'stone', owner, true); }
    }
  }
  const f = q.stair, length = f.length, steps: { s0: number; s1: number; y: number }[] = [];
  // 원본 지도의 계단 방향을 따른다. DEM에서 거의 평평한 아래쪽은 보행 바닥으로 연결한다.
  paving(f, -2, 11.5, -1.35, 1.35, 'lower-passage');
  let previousY = Math.max(ground(f, 11.5, -1.35), ground(f, 11.5, 1.35)) + .045;
  const count = 30, end = length - 1.5, tread = (end - 11.5) / count;
  for (let i = 0; i < count; i++) {
    const s0 = 11.5 + i * tread, s1 = s0 + tread, vertices = patches(f, s0, s1, -1.35, 1.35).flat(), y = Math.max(previousY, ...vertices.map(v => v.y + .045));
    const owner = box('stair-tread', f, s0, s1, -1.35, 1.35, Math.min(previousY, ...vertices.map(v => v.y)) - .15, y, 0xaaa99e);
    box('step-edge', f, s0, s0 + .032, -1.32, 1.32, y, y + .002, 0xc8c5b7, 'stone', owner); steps.push({ s0, s1, y }); previousY = y;
    if (i === 0 || i === count - 1) for (let n = -1.2; n < 1.2; n += .12) box('tactile-step-mark', f, s0 + .04, s1 - .04, n, n + .035, y + .002, y + .006, 0xc7ad53, 'stone', owner);
  }
  pavementMasks.push({ component: 'stair-tread', polygon: [f.point(11.5, -1.35), f.point(end, -1.35), f.point(end, 1.35), f.point(11.5, 1.35)] });
  paving(f, end, length + 1.5, -1.35, 1.35, 'upper-apron', (s, n) => Math.max(0, previousY - ground(f, end, n) - .045) * Math.max(0, (length + 1.5 - s) / 3));
  const floorAt = (s: number, n: number) => s < 11.5 ? ground(f, s, n) + .045 : steps[Math.min(count - 1, Math.floor((s - 11.5) / tread))].y;
  for (const n of [-1.5, 1.5]) for (let s = 12; s < end; s += 2) {
    const y = floorAt(s, n), next = Math.min(end, s + 2), yy = floorAt(next, n);
    const rail = beam('stair-rail', at(f, s, y + .95, n), at(f, next, yy + .95, n), .06, 0xaaa99c);
    beam('rail-post', at(f, s, ground(f, s, n), n), at(f, s, y + .95, n), .055, 0xaaa99c, rail);
  }
  // 사진에서 확인하지 못한 실내 전체는 만들지 않고 연결 입구 안쪽까지만 표현한다.
  const b = q.bridge, start = -3.7, finish = b.length + 2.5, y = q.bridgeFloor;
  box('bridge-floor', b, start, finish, -1.6, 1.6, y - .3, y);
  box('bridge-roof', b, start, finish, -1.8, 1.8, q.bridgeRoof - .2, q.bridgeRoof);
  for (const n of [-1.6, 1.6]) {
    box('bridge-white-panel', b, start, finish, n - .1, n + .1, y, y + 1.05);
    box('bridge-window-band', b, start, finish, n - .12, n + .12, y + 2.45, q.bridgeRoof, 0xe0e0d6);
    const pane = box('bridge-glazing', b, start, finish, n - .035, n + .035, y + 1.05, y + 2.45, 0x68b6aa, 'glass');
    for (let s = start; s <= finish; s += 1.35) box('bridge-window-mullion', b, s, s + .045, n - .07, n + .07, y + 1.05, y + 2.45, 0xa4b3a8, 'metal', pane);
    box('roof-parapet', b, start, finish, n - .1, n + .1, q.bridgeRoof + .63, q.bridgeRoof + .84);
    for (let s = start; s <= finish; s += 2.6) box('parapet-post', b, s, s + .13, n - .1, n + .1, q.bridgeRoof, q.bridgeRoof + .84);
  }
  for (const s of [start, finish]) box('vestibule-end', b, s - .08, s + .08, -1.6, 1.6, y, q.bridgeRoof);
  // 양쪽 기둥은 계단 유효 폭 밖에 놓는다.
  for (const s of [1.9, 5.5]) for (const n of [-1.72, 1.72]) {
    const world = b.point(s, n), local = f.local(world); if (Math.abs(local.n) < 1.8) continue;
    box('bridge-support', b, s - .15, s + .15, n - .15, n + .15, ground(b, s, n) - .1, y, 0xe0e0d7);
  }
  const e = q.entry, ey = q.entryFloor;
  box('entry-floor', e, 6.25, 8.75, -1.35, 1.9, ey - .2, ey, 0xbabbb0);
  box('entry-back', e, 6.25, 8.75, 1.8, 1.95, ey, ey + 2.85, 0x8d938a);
  for (const s of [6.25, 8.75]) box('door-jamb', e, s - .06, s + .06, -.38, 1.85, ey, ey + 2.85, 0xa9b8b1, 'metal');
  box('door-header', e, 6.18, 8.82, -.4, -.2, ey + 2.7, ey + 2.9, 0xa6b5ae, 'metal');
  // 열린 문짝을 옆벽 쪽에 두어 모바일 캐릭터가 문턱에 걸리지 않게 한다.
  for (const s of [6.32, 8.68]) box('open-door-leaf', e, s - .035, s + .035, -.22, 1.05, ey + .08, ey + 2.68, 0x8fb4b0, 'glass');
  const foot = ground(e, 7.5, -2.55), entrySteps = 4;
  for (let i = 0; i < entrySteps; i++) box('entry-step', e, 6.25, 8.75, -2.55 + i * .3, -2.55 + (i + 1) * .3, foot - .1, foot + (ey - foot) * (i + 1) / entrySteps, 0xb8b8ac);
  paving(e, 4.6, 10.4, -6, -2.55, 'entry-court');
  // 사진의 두 발코니와 출입문 창을 끝벽에 배치한다. 수치는 실측값이 아니다.
  for (const rise of [3.5, 7]) {
    const floor = ey + rise, balcony = box('balcony-slab', e, 6.1, 8.9, -1.35, .05, floor - .2, floor);
    box('balcony-parapet', e, 6.1, 8.9, -1.35, -1.18, floor, floor + .75, 0xdfdfd4, 'stone', balcony);
    box('balcony-door', e, 6.4, 8.6, -.42, -.38, floor + .05, floor + 2.65, 0x83a59e, 'glass');
    for (const s of [6.18, 8.82]) beam('balcony-rail-post', at(e, s, floor + .75, -1.25), at(e, s, floor + 1, -1.25), .06, 0xaaa99b, balcony);
    beam('balcony-rail', at(e, 6.18, floor + 1, -1.25), at(e, 8.82, floor + 1, -1.25), .065, 0xaaa99b, balcony);
  }
  const endFace = humanities23Frame([429.27, -676.47], [433.28, -668.97]);
  const notice = box('noticeboard', endFace, .5, 6.7, -.48, -.35, ey + .5, ey + 1.9, 0x335b60, 'metal');
  for (let i = 0; i < 32; i++) { const s = .6 + (i % 16) * .38, h = ey + .6 + Math.floor(i / 16) * .6; box('notice-sheet', endFace, s, s + .35, -.495, -.485, h, h + .54, [0xe5ddbe, 0xa8c6cd, 0xbb9cb0, 0xb8c99d][i % 4], 'stone', notice); }
  for (const frame of [e, endFace]) {
    for (const level of [ey - .1, ey + 3.4, ey + 6.9, q.base + 14]) {
      const ranges = frame === e && level < ey + 2.9 ? [[0, 6.15], [8.85, frame.length]] : [[0, frame.length]];
      for (const [a, b] of ranges) box('end-wall-white-band', frame, a, b, -.5, -.34, level - .2, level + .2, 0xe0e0d7);
    }
    for (const s of [0, frame.length]) box('end-wall-white-pier', frame, s - .18, s + .18, -.5, -.34, ground(frame, s, -.4), q.base + 14.35, 0xe0e0d7);
  }
  for (const s of [6.15, 8.85]) box('balcony-white-pier', e, s - .11, s + .11, -.49, -.36, ey, q.base + 14.35, 0xe0e0d7);
  // 게시물 내용과 현재 공유 이동수단 업체는 확인하지 못해 문구와 상표를 복사하지 않는다.
  const rackY = ground(e, 2.9, -1.5), rack = box('bicycle-rack-base', e, .4, 4.2, -1.7, -1.5, rackY, rackY + .08, 0x9fa6a0, 'metal');
  for (let i = 0; i < 6; i++) { const s = .65 + i * .6; for (const side of [-.13, .13]) { beam('bicycle-rack-loop', at(e, s + side, rackY + .05, -1.6), at(e, s + side, rackY + .65, -1.1), .04, 0xadb5ac, rack); } beam('rack-loop-top', at(e, s - .13, rackY + .65, -1.1), at(e, s + .13, rackY + .65, -1.1), .04, 0xadb5ac, rack); }
  const benchY = ground(e, 1.8, -.8), bench = box('bench-seat', e, .5, 3.5, -1.1, -.6, benchY + .4, benchY + .48, 0x775748, 'wood');
  box('bench-back', e, .5, 3.5, -.65, -.57, benchY + .55, benchY + .95, 0x775748, 'wood', bench);
  for (const s of [.8, 3.2]) box('bench-leg', e, s, s + .08, -1, -.65, benchY, benchY + .4, 0x545950, 'metal', bench);
  // 소식지와 위성 사진에 보이는 포장 광장이다. 경계와 무늬 치수는 근사다.
  const court: XZ[] = [[430, -690], [449, -690], [460, -677], [447, -663], [433.5, -668]];
  const exclusions = pavementMasks.map(m => m.polygon);
  exclusions.push([e.point(6.2, -2.55), e.point(8.8, -2.55), e.point(8.8, 2), e.point(6.2, 2)]);
  for (const footprint of footprints) {
    const ring = footprint.slice(0, -1), vertices = ring.map(p => new THREE.Vector2(...p));
    for (const tri of THREE.ShapeUtils.triangulateShape(vertices, [])) exclusions.push(tri.map(i => ring[i]));
  }
  paving(f, 7, 37, -12, 13, 'haebang-court', undefined, poly => {
    const inside = planes(court).reduce((p, plane) => clip(p, plane), poly); if (inside.length < 3 || area(inside) < 1e-8) return [];
    let pieces = [inside]; for (const mask of exclusions) pieces = pieces.flatMap(p => subtract(p, mask)); return pieces;
  });
  const meshes = batches.map(batch => {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(batch.positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(batch.colors, 3)); geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); (geometry.attributes.position as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: batch.glass ? .22 : .86, transparent: batch.glass, opacity: batch.glass ? .46 : 1, depthWrite: !batch.glass, side: THREE.DoubleSide })); mesh.name = batch.glass ? 'humanities-23-glass' : 'humanities-23-surfaces'; mesh.castShadow = !batch.glass; mesh.receiveShadow = true; shell.add(mesh); return mesh;
  });
  shell.userData.humanities23 = { ...HUMANITIES23, bridgeFloor: y, bridgeRoof: q.bridgeRoof, entryFloor: ey, pavementMasks, steps, stairWidth: 2.7, stairLength: length, bridgeRoute: [b.point(start + .7), b.point(finish - .7)], entryRoute: [e.point(7.5, -5.5), e.point(7.5, -2.8), e.point(7.5, .9)], observed: ['white glazed bridge', 'open lower passage', 'building 2 entrance and balconies', 'noticeboard', 'bicycle rack', 'bench', 'pattern paving'], source: 'https://humanities.snu.ac.kr/community/newsletter?md=download&seqidx=63', printedPage: 27, captureDate: null, dimensionsEstimated: true, bridgeHeightEstimated: true, upperBridgeAccessFromGroundImplemented: false, wholeInteriorImplemented: false, rawTerrainChanged: false, geometry: { meshes: 2, triangles: batches.reduce((n, b) => n + b.positions.length / 9, 0), colliders: breakables.length, textures: 0 } };
  function update(_player: THREE.Vector3) {
    batches.forEach((batch, index) => {
      const a = meshes[index].geometry.attributes.position as THREE.BufferAttribute, c = meshes[index].geometry.attributes.color as THREE.BufferAttribute; let changed = false, recolored = false;
      for (const part of batch.parts) {
        if (part.shown !== part.proxy.visible) { part.shown = part.proxy.visible; changed = true; if (part.shown) (a.array as Float32Array).set(part.original, part.start); else for (let i = part.start; i < part.end; i += 3) { a.array[i] = part.proxy.position.x; a.array[i + 1] = part.proxy.position.y; a.array[i + 2] = part.proxy.position.z; } }
        const tint = part.proxy.material.color; if (part.color !== tint.getHex()) { part.color = tint.getHex(); recolored = true; const scale = [tint.r / part.base.r, tint.g / part.base.g, tint.b / part.base.b]; for (let i = part.start; i < part.end; i++) c.array[i] = part.colors[i - part.start] * scale[(i - part.start) % 3]; }
      }
      if (changed) a.needsUpdate = true; if (recolored) c.needsUpdate = true;
    }); shell.visible = batches.some(b => b.parts.some(p => p.proxy.visible));
  }
  return { shell, breakables, update };
}
