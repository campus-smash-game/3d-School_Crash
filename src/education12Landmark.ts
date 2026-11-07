import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { CampusBuilding } from './fullCampus';
import type { BreakableSpec } from './scene';
import type { TerrainHeightSampler } from './terrain';
import { education1112Point } from './education1112Site';

type XZ = [number, number];
type XYZ = [number, number, number];
type Datum = { lower: number; terrace: number };
type Bucket = { positions: number[]; colors: number[]; uvs: number[]; geometry?: THREE.BufferGeometry };
type Range = { bucket: Bucket; start: number; end: number; original: Float32Array };

const ORIGIN: XZ = [577.58, -783.96];
const AXIS: XZ = [.8919035315669203, .4522257073392178];
const INWARD: XZ = [-AXIS[1], AXIS[0]];
const point = (s: number, n: number): XZ => [ORIGIN[0] + AXIS[0] * s + INWARD[0] * n, ORIGIN[1] + AXIS[1] * s + INWARD[1] * n];

/** 문 위치와 두 바닥의 높이는 사진 및 지도에 맞춘 모델 근사다. */
export function getEducation12ModelLayout(heightAt: (x: number, z: number) => number, datum?: Datum) {
  const fallbackOffset = heightAt(...ORIGIN) - 53.34149052429199;
  const terrace = datum?.terrace ?? 59.384 + fallbackOffset, lower = datum?.lower ?? terrace - 3.2;
  const entry = point(-2.2, 3.1);
  const edgeA: XZ = [545.64, -765.16], edgeB: XZ = [547.19, -756.91], length = Math.hypot(edgeB[0] - edgeA[0], edgeB[1] - edgeA[1]);
  const tangent: XZ = [(edgeB[0] - edgeA[0]) / length, (edgeB[1] - edgeA[1]) / length], outward: XZ = [-tangent[1], tangent[0]];
  const lowerEntryEdgeFraction = .24;
  const lowerEntry: XZ = [edgeA[0] + (edgeB[0] - edgeA[0]) * lowerEntryEdgeFraction - outward[0] * .8, edgeA[1] + (edgeB[1] - edgeA[1]) * lowerEntryEdgeFraction - outward[1] * .8];
  const stairJoin: XZ = [549.835, -752.09], stairTop: XZ = [548.5642504122454, -751.3916480219677], stairOutward: XZ = [-.4816220538153825, -.8763790260376231];
  const stairBottom: XZ = [stairTop[0] + stairOutward[0] * 9.6, stairTop[1] + stairOutward[1] * 9.6];
  return { lower, terrace, sourceEntrance: ORIGIN, origin: ORIGIN, axis: AXIS, inward: INWARD, mainEntry: { center: entry, floorY: terrace, width: 3, height: 2.75, outward: [-INWARD[0], -INWARD[1]] as XZ, tangent: AXIS, local: { s: -2.2, n: 3.1 }, interiorDepth: 2.8 }, lowerEntry: { center: lowerEntry, floorY: lower, width: 3, height: 2.65, tangent, outward, interiorDepth: 2.8, sourceEdge: 13, sourceEdgeFraction: lowerEntryEdgeFraction, exactPositionMeasured: false, separatedFromStairFoot: true }, stairs: { bottom: stairBottom, top: stairTop, terraceJoin: stairJoin, width: 2.5, count: 20, lower, upper: terrace }, upperBottom: terrace + 4.2, upperTop: terrace + 11.7, dimensionsEstimated: true };
}

export function createEducation12Landmark(scene: THREE.Scene, building: CampusBuilding, heightAt: (x: number, z: number) => number, datum?: Datum, connected=false) {
  const layout = getEducation12ModelLayout(heightAt, datum), { lower, terrace, upperBottom, upperTop } = layout;
  const outline = building.points.slice(0, -1).map(p => [p[0], p[1]] as XZ);
  if (building.id !== 'way/238936704' || outline.length !== 16) throw new Error('Education12 requires its mapped outline.');
  const shell = new THREE.Group(); shell.name = 'landmark/education12';
  Object.assign(shell.userData, { role: 'building-shell', buildingId: building.id, landmark: 'education12', coordinates: 'D=(east,up,north); parent H applies once.', mappedOutline: building.points.map(p => p.slice()) }); scene.add(shell);
  const distant = new THREE.Group(); distant.name = `${building.id}:education12-distant`; distant.visible = false; Object.assign(distant.userData, { role: 'distant-building', buildingId: building.id, landmark: 'education12' }); scene.add(distant);
  const structure: Bucket = { positions: [], colors: [], uvs: [] }, glass: Bucket = { positions: [], colors: [], uvs: [] }, metal: Bucket = { positions: [], colors: [], uvs: [] }, buckets = [structure, glass, metal];
  const parts: { proxy: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>; ranges: Range[]; visible: boolean; base: number; color: number }[] = [], breakables: BreakableSpec[] = [];
  const floors: { component: string; vertices: XYZ[] }[] = [], pavementMasks: { component: string; polygon: XZ[] }[] = [];
  const nonWalkableRenderRanges: { mesh: string; startVertex: number; endVertex: number; kind: string; component: string }[] = [];
  const up = new THREE.Vector3(0, 1, 0), v = (p: XZ, y: number) => new THREE.Vector3(p[0], y, p[1]);
  const local = (s: number, y: number, n: number) => v(point(s, n), y);
  const orientation = (axis: XZ) => new THREE.Quaternion().setFromAxisAngle(up, -Math.atan2(axis[1], axis[0]));
  const mainRotation = orientation(AXIS);
  function append(bucket: Bucket, geometry: THREE.BufferGeometry, color: number, paving = false) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry, position = g.getAttribute('position'), normal = g.getAttribute('normal'), tint = new THREE.Color(color);
    for (let i = 0; i < position.count; i++) { const x = position.getX(i), y = position.getY(i), z = position.getZ(i); bucket.positions.push(x, y, z); bucket.colors.push(tint.r, tint.g, tint.b); bucket.uvs.push(...(paving && normal.getY(i) > .7 ? [(x * AXIS[0] + z * AXIS[1]) / 1.6, (x * INWARD[0] + z * INWARD[1]) / 1.6] : [.992, .992])); }
    if (g !== geometry) g.dispose();
  }
  function part(component: string, vertices: THREE.Vector3[], color: number, bucket = structure, material: BreakableSpec['material'] = 'stone', paving = false, decoration?: () => void, cuboid?: { center: THREE.Vector3; size: THREE.Vector3; rotation: THREE.Quaternion }) {
    const starts = buckets.map(b => b.positions.length), bounds = new THREE.Box3().setFromPoints(vertices), center = cuboid?.center ?? bounds.getCenter(new THREE.Vector3()), size = cuboid?.size ?? bounds.getSize(new THREE.Vector3());
    const geometry = cuboid ? new THREE.BoxGeometry(size.x, size.y, size.z) : new ConvexGeometry(vertices.map(p => p.clone().sub(center)));
    const proxy = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: .8 })); proxy.position.copy(center); if (cuboid) proxy.quaternion.copy(cuboid.rotation); proxy.updateMatrixWorld(true);
    Object.assign(proxy.userData, { buildingId: building.id, landmark: 'education12', component, renderProxy: true, convex: !cuboid, collisionShape: cuboid ? 'oriented-cuboid' : 'convex-hull' });
    const rendered = geometry.clone();
    const flatPanels: { x0: number; x1: number; z0: number; z1: number; color: number }[] = [];
    // 단 코와 화단의 흙은 충돌 상면을 나눠 칠한다. 얇은 장식을 위에 덧대지 않는다.
    if (cuboid && component === 'education12-west-stair-tread') {
      const x0 = -size.x / 2, x1 = size.x / 2, z0 = -size.z / 2, z1 = size.z / 2;
      flatPanels.push({ x0, x1: x0 + .055, z0, z1, color: 0xc9cfc7 }, { x0: x0 + .055, x1, z0, z1, color });
    } else if (cuboid && component === 'education12-front-planter') {
      const x0 = -size.x / 2, x1 = size.x / 2, z0 = -size.z / 2, z1 = size.z / 2, ix0 = x0 + .075, ix1 = x1 - .075, iz0 = z0 + .12, iz1 = z1 - .12;
      flatPanels.push({ x0, x1, z0, z1: iz0, color }, { x0, x1, z0: iz1, z1, color }, { x0, x1: ix0, z0: iz0, z1: iz1, color }, { x0: ix1, x1, z0: iz0, z1: iz1, color }, { x0: ix0, x1: ix1, z0: iz0, z1: iz1, color: 0x4c5542 });
    }
    if (flatPanels.length) {
      const indices = rendered.index!, normals = rendered.getAttribute('normal'), kept: number[] = [];
      for (let i = 0; i < indices.count; i += 3) if (normals.getY(indices.getX(i)) < .7) kept.push(indices.getX(i), indices.getX(i + 1), indices.getX(i + 2));
      rendered.setIndex(kept);
    }
    rendered.applyMatrix4(proxy.matrixWorld); append(bucket, rendered, color, paving); rendered.dispose();
    for (const patch of flatPanels) {
      const corners = [[patch.x0, patch.z0], [patch.x1, patch.z0], [patch.x1, patch.z1], [patch.x0, patch.z1]].map(([x, z]) => new THREE.Vector3(x, size.y / 2, z).applyMatrix4(proxy.matrixWorld));
      const top = new THREE.BufferGeometry(); top.setAttribute('position', new THREE.Float32BufferAttribute([0, 2, 1, 0, 3, 2].flatMap(i => corners[i].toArray()), 3)); top.computeVertexNormals(); append(bucket, top, patch.color, paving); top.dispose();
    }
    decoration?.();
    parts.push({ proxy, ranges: buckets.map((b, i) => ({ bucket: b, start: starts[i], end: b.positions.length, original: Float32Array.from(b.positions.slice(starts[i])) })), visible: true, base: color, color });
    breakables.push({ mesh: proxy, size, collisionVertices: cuboid ? undefined : Float32Array.from(geometry.getAttribute('position').array), toughness: material === 'glass' ? 5 : 12, material, label: '12동 사범교육협력센터' }); return proxy;
  }
  function box(component: string, center: THREE.Vector3, size: THREE.Vector3, rotation: THREE.Quaternion, color = 0xb0b4af, bucket = structure, material: BreakableSpec['material'] = 'stone', decoration?: () => void, paving = false) {
    const vertices: THREE.Vector3[] = []; for (const x of [-.5, .5]) for (const y of [-.5, .5]) for (const z of [-.5, .5]) vertices.push(new THREE.Vector3(x * size.x, y * size.y, z * size.z).applyQuaternion(rotation).add(center));
    return part(component, vertices, color, bucket, material, paving, decoration, { center, size, rotation });
  }
  function decorationBox(center: THREE.Vector3, size: THREE.Vector3, rotation: THREE.Quaternion, color = 0xc3c9c6, bucket = metal) { const g = new THREE.BoxGeometry(size.x, size.y, size.z); g.applyQuaternion(rotation); g.translate(center.x, center.y, center.z); append(bucket, g, color); g.dispose(); }
  function beam(component: string, a: XZ, b: XZ, y0: number, y1: number, depth: number, color = 0xb0b4af, bucket = structure, material: BreakableSpec['material'] = 'stone', decoration?: () => void) {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]); return box(component, new THREE.Vector3((a[0] + b[0]) / 2, (y0 + y1) / 2, (a[1] + b[1]) / 2), new THREE.Vector3(length, y1 - y0, depth), orientation([(b[0] - a[0]) / length, (b[1] - a[1]) / length]), color, bucket, material, decoration);
  }
  function cylinder(component: string, a: THREE.Vector3, b: THREE.Vector3, radius: number, color = 0xc9cfcb, bucket = structure, material: BreakableSpec['material'] = 'stone', decoration = false) {
    const delta = b.clone().sub(a), g = new THREE.CylinderGeometry(radius, radius, delta.length(), radius > .1 ? 12 : 8); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, delta.clone().normalize())); g.translate(...a.clone().add(b).multiplyScalar(.5).toArray());
    if (decoration) append(bucket, g, color); else { const p = g.getAttribute('position'); part(component, Array.from({ length: p.count }, (_, i) => new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i))), color, bucket, material); } g.dispose();
  }
  function rail(a: XZ, b: XZ, floorA: number, floorB = floorA, component = 'education12-terrace-rail') {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]), count = Math.max(1, Math.ceil(length / 1.7));
    for (let j = 0; j < count; j++) { const t0 = j / count, t1 = (j + 1) / count, p: XZ = [THREE.MathUtils.lerp(a[0], b[0], t0), THREE.MathUtils.lerp(a[1], b[1], t0)], q: XZ = [THREE.MathUtils.lerp(a[0], b[0], t1), THREE.MathUtils.lerp(a[1], b[1], t1)], ya = THREE.MathUtils.lerp(floorA, floorB, t0), yb = THREE.MathUtils.lerp(floorA, floorB, t1);
      cylinder(component, v(p, ya), v(p, ya + 1.04), .025, 0xb8c3c0, metal, 'metal', false);
      for (const h of [.28, .62, 1.04]) cylinder(component, v(p, ya + h), v(q, yb + h), .021, 0xc3cbc7, metal, 'metal', false);
    }
  }
  function glazed(component: string, a: XZ, b: XZ, floor: number, height: number, door = false, louvers = false) {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]), axis: XZ = [(b[0] - a[0]) / length, (b[1] - a[1]) / length], rot = orientation(axis), center = v([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], floor + height / 2);
    return box(component, center, new THREE.Vector3(length, height, .09), rot, 0x658483, glass, 'glass', () => {
      const count = Math.max(1, Math.ceil(length / (door ? 1.5 : 1.7)));
      for (let i = 0; i <= count; i++) decorationBox(v([THREE.MathUtils.lerp(a[0], b[0], i / count), THREE.MathUtils.lerp(a[1], b[1], i / count)], floor + height / 2), new THREE.Vector3(.055, height, .15), rot);
      for (const h of [.045, height - .045]) decorationBox(center.clone().setY(floor + h), new THREE.Vector3(length, .09, .15), rot);
      if (door) for (const t of [.46, .54]) { const p: XZ = [THREE.MathUtils.lerp(a[0], b[0], t) - axis[1] * .13, THREE.MathUtils.lerp(a[1], b[1], t) + axis[0] * .13]; cylinder('education12-door-handle', v(p, floor + .85), v(p, floor + 1.48), .022, 0xd2d8d3, metal, 'metal', true); }
      if (louvers) for (let i = 0; i < 4; i++) decorationBox(center.clone().setY(floor + height - .28 - i * .17), new THREE.Vector3(length, .06, .25), rot, 0x989d90);
    });
  }
  const polygonArea = (p: XZ[]) => Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - a[1] * b[0]; }, 0)) / 2;
  function convexHull(points: XZ[]) { const sorted = [...new Map(points.map(p => [p.join(','), p])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]), cross = (a: XZ, b: XZ, c: XZ) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); const half = (items: XZ[]) => { const result: XZ[] = []; for (const p of items) { while (result.length > 1 && cross(result.at(-2)!, result.at(-1)!, p) <= 1e-8) result.pop(); result.push(p); } return result; }; return [...half(sorted).slice(0, -1), ...half([...sorted].reverse()).slice(0, -1)]; }
  function convexPieces(polygon: XZ[]) {
    const pieces = THREE.ShapeUtils.triangulateShape(polygon.map(p => new THREE.Vector2(...p)), []).map(t => t.map(i => polygon[i]));
    for (let i = 0; i < pieces.length; i++) { let changed = true; while (changed) { changed = false; for (let j = i + 1; j < pieces.length; j++) { if (pieces[i].filter(p => pieces[j].some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6)).length < 2) continue; const h = convexHull([...pieces[i], ...pieces[j]]); if (Math.abs(polygonArea(h) - polygonArea(pieces[i]) - polygonArea(pieces[j])) > .00001) continue; pieces[i] = h; pieces.splice(j, 1); changed = true; break; } } } return pieces;
  }
  function slab(component: string, polygon: XZ[], y: number, depth: number, color: number, paving = false, mask = false) {
    for (const p of convexPieces(polygon)) { part(component, [...p.map(p => v(p, y)), ...p.map(p => v(p, y - depth))], color, structure, 'stone', paving); if (mask) pavementMasks.push({ component, polygon: p }); for (let i = 1; i + 1 < p.length; i++) floors.push({ component, vertices: [p[0], p[i], p[i + 1]].map(p => [p[0], y, p[1]] as XYZ) }); }
  }
  const signedArea = (p: XZ[]) => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - a[1] * b[0]; }, 0) / 2;
  const clip = (polygon: XYZ[], distance: (p: XYZ) => number) => { const result: XYZ[] = []; for (let i = 0; i < polygon.length; i++) { const a = polygon[i], b = polygon[(i + 1) % polygon.length], da = distance(a), db = distance(b); if (da >= -1e-8) result.push(a); if ((da >= -1e-8) !== (db >= -1e-8)) { const t = da / (da - db); result.push(a.map((v, j) => v + (b[j] - v) * t) as XYZ); } } return result; };
  const clipInside = (polygon: XYZ[], mask: XZ[]) => { let result = polygon; const sign = Math.sign(signedArea(mask)); for (let i = 0; i < mask.length; i++) { const a = mask[i], b = mask[(i + 1) % mask.length]; result = clip(result, p => sign * ((b[0] - a[0]) * (p[2] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]))); } return result; };
  const subtract = (polygons: XYZ[][], mask: XZ[]) => polygons.flatMap(polygon => { let inside = polygon; const outside: XYZ[][] = [], sign = Math.sign(signedArea(mask)); for (let i = 0; i < mask.length; i++) { const a = mask[i], b = mask[(i + 1) % mask.length], distance = (p: XYZ) => sign * ((b[0] - a[0]) * (p[2] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])); const p = clip(inside, p => -distance(p)); if (p.length >= 3 && polygonArea(p.map(p => [p[0], p[2]])) > 1e-6) outside.push(p); inside = clip(inside, distance); if (inside.length < 3) break; } return outside; });
  const roadMask = (a: XZ, b: XZ, halfWidth: number): XZ[] => { const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz), n: XZ = [-dz / length * halfWidth, dx / length * halfWidth]; return [[a[0] + n[0], a[1] + n[1]], [b[0] + n[0], b[1] + n[1]], [b[0] - n[0], b[1] - n[1]], [a[0] - n[0], a[1] - n[1]]]; };
  const road330: XZ[] = [[548.92, -778.48], [557.43, -792.65], [564.05, -800.87]], roadClearanceMasks = road330.slice(1).map((b, i) => roadMask(road330[i], b, 3.15));
  roadClearanceMasks.push(Array.from({ length: 16 }, (_, i): XZ => [road330[1][0] + Math.cos(i * Math.PI / 8) * 3.15, road330[1][1] + Math.sin(i * Math.PI / 8) * 3.15]));
  const roadTrimmed = (polygon: XZ[]) => { let pieces = convexPieces(polygon).map(p => p.map(([x, z]): XYZ => [x, 0, z])); for (const mask of roadClearanceMasks) pieces = subtract(pieces, mask); return pieces.map(p => p.map(([x, , z]): XZ => [x, z])); };
  for (const p of roadTrimmed(outline)) slab('education12-lower-floor', p, lower, .24, 0x9caaa7, true, true);
  const hallVoid=[education1112Point(-22,7),education1112Point(-8,7),education1112Point(-8,22),education1112Point(-22,22)];
  for (const p of roadTrimmed(outline)) {
    const pieces=connected?subtract([p.map(([x,z]):XYZ=>[x,terrace,z])],hallVoid).map(q=>q.map(([x,,z]):XZ=>[x,z])):[p];
    for(const q of pieces)slab('education12-open-terrace-floor',q,terrace,.28,0xa2aaa6,true,true);
  }

  // 상층 전면만 곡선으로 보간한다. 보행 바닥과 원본 윤곽은 지도 외곽을 유지한다.
  const curve = new THREE.CatmullRomCurve3([11, 12, 13, 14, 15, 0].map(i => v(outline[i], 0)), false, 'centripetal');
  const curvedFront: XZ[] = Array.from({ length: 31 }, (_, i) => { const p = curve.getPoint(i / 30); return [p.x, p.z]; });
  const upperOutline: XZ[] = [...curvedFront, ...outline.slice(1, 11)];
  slab('education12-upper-soffit', upperOutline, upperBottom + .32, .32, 0x77817d);
  slab('education12-upper-roof', upperOutline, upperTop, .3, 0xaab0aa);
  for (let i = 0; i < upperOutline.length; i++) {
    const a = upperOutline[i], b = upperOutline[(i + 1) % upperOutline.length], length = Math.hypot(b[0] - a[0], b[1] - a[1]); if (length < .05) continue;
    // 중정 끝면은 설계자 사진의 노출 콘크리트 벽과 상부의 깊은 개구부를 따른다.
    if(connected&&i===curvedFront.length-1){
      beam('education12-courtyard-concrete-end',a,b,upperBottom,upperTop-1.9,.42,0xb7b9ac);
      const frameAxis:XZ=[(b[0]-a[0])/length,(b[1]-a[1])/length],inward:XZ=[frameAxis[1],-frameAxis[0]],inset=(p:XZ):XZ=>[p[0]+inward[0]*1.1,p[1]+inward[1]*1.1];
      beam('education12-recessed-upper-wall',inset(a),inset(b),upperTop-1.9,upperTop-.15,.18,0x666e64);
      rail(a,b,upperTop-1.9,upperTop-1.9,'education12-courtyard-upper-rail');
      beam('education12-courtyard-roof-edge',a,b,upperTop-.15,upperTop+.08,.72,0x66716b);
      continue;
    }
    const count = Math.max(1, Math.ceil(length / 2.3));
    for (let j = 0; j < count; j++) { const p: XZ = [THREE.MathUtils.lerp(a[0], b[0], j / count), THREE.MathUtils.lerp(a[1], b[1], j / count)], q: XZ = [THREE.MathUtils.lerp(a[0], b[0], (j + 1) / count), THREE.MathUtils.lerp(a[1], b[1], (j + 1) / count)];
      beam('education12-upper-gray-fascia', p, q, upperBottom, upperBottom + 1.05, .3, 0x8b9390);
      glazed('education12-upper-ribbon-window', p, q, upperBottom + 1.05, 2.55, false, true);
      beam('education12-upper-floor-band', p, q, upperBottom + 3.6, upperBottom + 4.65, .3, 0xc6cac1);
      glazed('education12-top-window', p, q, upperBottom + 4.65, 1.35);
      beam('education12-upper-parapet', p, q, upperBottom + 6, upperTop, .3, 0xcbd0c7);
      const axis: XZ = [(q[0] - p[0]) / Math.hypot(q[0] - p[0], q[1] - p[1]), (q[1] - p[1]) / Math.hypot(q[0] - p[0], q[1] - p[1])];
      box('education12-upper-vertical-fin', v(p, upperBottom + 5.48), new THREE.Vector3(.15, 3.1, .67), orientation(axis), 0xc4c9c0);
    }
  }
  for (const edge of [11, 12, 13, 14, 15]) {
    const a = outline[edge], b = outline[(edge + 1) % outline.length], length = Math.hypot(b[0] - a[0], b[1] - a[1]), t: XZ = [(b[0] - a[0]) / length, (b[1] - a[1]) / length], outward: XZ = [-t[1], t[0]], shifted = (s: number, inset: number): XZ => [a[0] + t[0] * s - outward[0] * inset, a[1] + t[1] * s - outward[1] * inset];
    const doorCenter = edge === 13 ? length * layout.lowerEntry.sourceEdgeFraction : connected&&edge===15?length*.60:undefined, cuts = [0, length, ...(doorCenter === undefined ? [] : [doorCenter - 1.5, doorCenter + 1.5])].sort((a, b) => a - b);
    for (let k = 0; k + 1 < cuts.length; k++) { const s0 = cuts[k], s1 = cuts[k + 1], isDoor = doorCenter !== undefined && Math.abs((s0 + s1) / 2 - doorCenter) < .01; if (isDoor) continue; const count = Math.max(1, Math.ceil((s1 - s0) / 2.3)); for (let j = 0; j < count; j++) glazed('education12-lower-fixed-glass', shifted(s0 + (s1 - s0) * j / count, .8), shifted(s0 + (s1 - s0) * (j + 1) / count, .8), lower, 2.72); }
    beam('education12-lower-fascia', shifted(0, .8), shifted(length, .8), lower + 2.72, terrace - .28, .22, 0x84918a);
    const intervals: [number, number][] = edge === 14 ? [[0, length / 2 - 1.35], [length / 2 + 1.35, length]] : [[0, length]];
    const railPoint = (s: number): XZ => {
      const p = shifted(s, .08);
      for (let j=1;j<road330.length;j++) {
        const a=road330[j-1],b=road330[j],dx=b[0]-a[0],dz=b[1]-a[1],t=THREE.MathUtils.clamp(((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz),0,1);
        const nx=p[0]-a[0]-dx*t,nz=p[1]-a[1]-dz*t,d=Math.hypot(nx,nz);
        if(d>0&&d<3.45){p[0]+=nx*(3.45/d-1);p[1]+=nz*(3.45/d-1);}
      }
      return p;
    };
    for (const [s0, s1] of intervals) if (s1 > s0) {
      const count=Math.ceil((s1-s0)/1.7);
      for(let i=0;i<count;i++)rail(railPoint(s0+(s1-s0)*i/count),railPoint(s0+(s1-s0)*(i+1)/count),terrace);
    }
    const count = Math.max(1, Math.round(length / 6));
    for (let j = 0; j < count; j++) { const p = shifted((j + .5) * length / count, 1.15); if (Math.hypot(p[0] - layout.stairs.top[0], p[1] - layout.stairs.top[1]) < 2.2) continue; cylinder('education12-round-column', v(p, terrace), v(p, upperBottom), .33); }
  }
  // 저층 유리 홀을 쓰는 경우 C자 안쪽의 임시 외벽을 제거한다.
  for (let i = 0; !connected && i < 9; i++) { const a = outline[i], b = outline[i + 1]; beam('education12-lower-rear-wall', a, b, lower, terrace - .28, .28, 0x8f9a92); beam('education12-middle-rear-wall', a, b, terrace, upperBottom, .24, 0x7d8983); }
  for (const edge of [9, 10]) for (const p of roadTrimmed(roadMask(outline[edge], outline[edge + 1], .125))) part('education12-lower-south-wall', [...p.map(p => v(p, lower)), ...p.map(p => v(p, terrace - .28))], 0x8b9790);
  cylinder('education12-south-round-column', local(-13, terrace, 1.3), local(-13, upperBottom, 1.3), .38);
  cylinder('education12-diagonal-column', local(.6, terrace, .6), local(-1.8, upperBottom, 1.6), .3);

  // 2025년 도로 쪽 사진의 낮은 회색 화단과 관목 띠를 근사한다. 현관 앞과 열린층 통행 폭은 비워 둔다.
  const frontPlanting = { component: 'education12-front-planter', s: [-19, -6], n: [-.12, .9], topY: terrace + .38, segmentCount: 8, maximumFoliageN: 1.02, dimensionsEstimated: true };
  for (let i = 0; i < frontPlanting.segmentCount; i++) {
    const s0 = -19 + 13 * i / frontPlanting.segmentCount, s1 = -19 + 13 * (i + 1) / frontPlanting.segmentCount, centerS = (s0 + s1) / 2;
    const baseY = Math.min(terrace - .3, ...[point(s0, -.12), point(s1, -.12), point(s0, .9), point(s1, .9)].map(p => heightAt(...p) - .11));
    box(frontPlanting.component, local(centerS, (baseY + frontPlanting.topY) / 2, .39), new THREE.Vector3(s1 - s0 - .014, frontPlanting.topY - baseY, 1.02), mainRotation, 0x777e79, structure, 'stone', () => {
      for (let j = 0; j < 3; j++) {
        const p = local(centerS + (j - 1) * .45, terrace + .62 + ((i + j) % 3) * .05, .4 + (j === 1 ? .13 : -.03));
        const foliage = new THREE.IcosahedronGeometry(1, 1); foliage.scale(.68, .34 + (i % 3) * .035, .46); foliage.applyQuaternion(mainRotation); foliage.translate(p.x, p.y, p.z);
        const startVertex = structure.positions.length / 3; append(structure, foliage, [0x426445, 0x4d7049, 0x567548][(i + j) % 3]); nonWalkableRenderRanges.push({ mesh: 'education12-structure', startVertex, endVertex: structure.positions.length / 3, kind: 'ornamental-vegetation', component: 'education12-front-planter-shrub' }); foliage.dispose();
      }
    });
  }

  const door = glazed('education12-terrace-entry-door', point(-3.7, 3.1), point(-.7, 3.1), terrace, 2.75, true);
  for (const [s0, s1] of [[-8, -3.7], [-.7, 3]]) glazed('education12-terrace-entry-fixed-glass', point(s0, 3.1), point(s1, 3.1), terrace, 2.75);
  for (const s of [-8, 3]) beam('education12-terrace-vestibule-side', point(s, 3.1), point(s, 6.2), terrace, terrace + 2.92, .16, 0x93a39f);
  if(!connected)beam('education12-terrace-vestibule-back', point(-8, 6.2), point(3, 6.2), terrace, terrace + 2.92, .18, 0x8b9993);
  box('education12-terrace-entry-canopy', local(-2.5, terrace + 2.98, 3.7), new THREE.Vector3(11.4, .17, 2.1), mainRotation, 0x6e7b77);
  const lowerDoor = layout.lowerEntry, lt = lowerDoor.tangent, lo = lowerDoor.outward;
  const lp = (s: number, n: number): XZ => [lowerDoor.center[0] + lt[0] * s + lo[0] * n, lowerDoor.center[1] + lt[1] * s + lo[1] * n];
  const lowerDoorOwner = glazed('education12-lower-entry-door', lp(-1.5, 0), lp(1.5, 0), lower, 2.65, true);
  for (const s of [-2, 2]) beam('education12-lower-vestibule-side', lp(s, 0), lp(s, -3), lower, lower + 2.7, .15, 0x929f99);
  beam('education12-lower-vestibule-back', lp(-2, -3), lp(2, -3), lower, lower + 2.7, .15, 0x8b9791);
  const foot = layout.stairs.bottom, stairBack: XZ = [(foot[0] - layout.stairs.top[0]) / 9.6, (foot[1] - layout.stairs.top[1]) / 9.6], footMask = roadMask([foot[0] + stairBack[0] * 1.5, foot[1] + stairBack[1] * 1.5], foot, layout.stairs.width / 2);
  const lowerApron = [lp(-2, .8), lp(2, .8), lp(2, 3), lp(-2, 3)].map(([x, z]): XYZ => [x, lower, z]);
  for (const p of subtract([lowerApron], footMask)) slab('education12-lower-entry-apron', p.map(([x, , z]): XZ => [x, z]), lower, .25, 0x8f9993, true, true);
  // 외부 계단 위치는 공식 사진과 서측 외곽의 상대 관계에 맞춘 근사다.
  const stairs = layout.stairs, dx = stairs.top[0] - stairs.bottom[0], dz = stairs.top[1] - stairs.bottom[1], stairLength = Math.hypot(dx, dz), stairAxis: XZ = [dx / stairLength, dz / stairLength], stairAcross: XZ = [-stairAxis[1], stairAxis[0]], stairRotation = orientation(stairAxis), steps: { component: string; top: number; center: XYZ; polygon: XZ[] }[] = [];
  const sp = (s: number, n: number): XZ => [stairs.bottom[0] + stairAxis[0] * s + stairAcross[0] * n, stairs.bottom[1] + stairAxis[1] * s + stairAcross[1] * n];
  for (let i = 0; i < stairs.count; i++) { const s0 = stairLength * i / stairs.count, s1 = stairLength * (i + 1) / stairs.count, y = lower + (terrace - lower) * (i + 1) / stairs.count, p = sp((s0 + s1) / 2, 0), polygon = [sp(s0, -stairs.width / 2), sp(s1, -stairs.width / 2), sp(s1, stairs.width / 2), sp(s0, stairs.width / 2)];
    box('education12-west-stair-tread', v(p, y - .12), new THREE.Vector3(s1 - s0, .24, stairs.width), stairRotation, 0xb1b8b0, structure, 'stone', undefined, true);
    pavementMasks.push({ component: 'education12-west-stair-tread', polygon }); for (const t of [[0, 1, 2], [0, 2, 3]]) floors.push({ component: 'education12-west-stair-tread', vertices: t.map(j => [polygon[j][0], y, polygon[j][1]] as XYZ) }); steps.push({ component: 'education12-west-stair-tread', top: y, center: [p[0], y, p[1]], polygon });
  }
  const bottomLanding = [sp(-1.5, -1.25), sp(0, -1.25), sp(0, 1.25), sp(-1.5, 1.25)]; slab('education12-west-stair-bottom-landing', bottomLanding, lower, .22, 0xa7b0a8, true, true);
  const upperLanding = [sp(stairLength, -1.45), sp(stairLength + 1.3, -1.45), sp(stairLength + 1.3, 1.25), sp(stairLength, 1.25)]; slab('education12-west-stair-top-landing', upperLanding, terrace, .22, 0xa7b0a8, true, true);
  for (const n of [-1.3, 1.3]) { const a = sp(0, n), b = sp(stairLength, n); cylinder('education12-west-stair-stringer', v(a, lower - .17), v(b, terrace - .17), .11, 0x7f8c84); rail(a, b, lower, terrace, 'education12-west-stair-rail'); }

  const approachPolygon = [point(-19, -6.2), point(3, -6.2), point(3, 0), point(-19, 0)];
  const approachMasks = [...roadClearanceMasks, roadMask([581.96, -792.18], [564.05, -800.87], 3.0), roadMask([581.96, -792.18], [590.38, -778], 3.0)];
  const query = { minX: Math.min(...approachPolygon.map(p => p[0])), maxX: Math.max(...approachPolygon.map(p => p[0])), minZ: Math.min(...approachPolygon.map(p => p[1])), maxZ: Math.max(...approachPolygon.map(p => p[1])) };
  const originalTriangles = (heightAt as TerrainHeightSampler).roadSurfaceTriangles?.(query);
  const rawTriangles: XYZ[][] = originalTriangles ? originalTriangles.map(t => [[t[0], t[1], t[2]], [t[3], t[4], t[5]], [t[6], t[7], t[8]]]) : [0, 1].map(i => (i ? [0, 2, 3] : [0, 1, 2]).map(j => { const p = approachPolygon[j]; return [p[0], heightAt(...p) - .03, p[1]] as XYZ; }));
  const surfaces: XYZ[][] = [];
  for (const triangle of rawTriangles) {
    let pieces = [clipInside(triangle, approachPolygon)]; for (const mask of approachMasks) pieces = subtract(pieces, mask);
    for (const p of pieces) if (p.length >= 3 && polygonArea(p.map(p => [p[0], p[2]])) > 1e-6) surfaces.push(p.map(([x, y, z]) => [x, y + .15, z]));
  }
  // 같은 평면의 이웃 조각만 합쳐 가는 물리 hull을 줄인다.
  for (let i = 0; i < surfaces.length; i++) { let merged = true; while (merged) { merged = false; const a = surfaces[i], plane = new THREE.Plane().setFromCoplanarPoints(...a.slice(0, 3).map(p => new THREE.Vector3(...p)) as [THREE.Vector3, THREE.Vector3, THREE.Vector3]);
    for (let j = i + 1; j < surfaces.length; j++) { const b = surfaces[j]; if (a.filter(p => b.some(q => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < .0001)).length < 2 || b.some(p => Math.abs(plane.distanceToPoint(new THREE.Vector3(...p))) > .00005)) continue; const h = convexHull([...a, ...b].map(p => [p[0], p[2]])); if (Math.abs(polygonArea(h) - polygonArea(a.map(p => [p[0], p[2]])) - polygonArea(b.map(p => [p[0], p[2]]))) > .00001) continue; surfaces[i] = h.map(([x, z]) => [x, -(plane.normal.x * x + plane.normal.z * z + plane.constant) / plane.normal.y, z]); surfaces.splice(j, 1); merged = true; break; }
  } }
  for (const p of surfaces) { part('education12-front-forecourt', [...p.map(p => new THREE.Vector3(...p)), ...p.map(([x, y, z]) => new THREE.Vector3(x, y - .22, z))], 0x727b78, structure, 'stone', true); pavementMasks.push({ component: 'education12-front-forecourt', polygon: p.map(p => [p[0], p[2]]) }); for (let i = 1; i + 1 < p.length; i++) floors.push({ component: 'education12-front-forecourt', vertices: [p[0], p[i], p[i + 1]] }); }
  const entryApproachY = (n: number) => n >= 0 ? terrace : heightAt(...point(-2.2, n)) + .12;

  // 공식 사진에서 보이는 하부 유리층과 계단 사이만 포장한다. 원본 길의 오르막은 지형을 따라간다.
  const westPavingPolygon: XZ[] = [[545.64, -765.16], [547.19, -756.91], [550.2582, -751.3188], [546.7527, -749.3923], [543.3699, -755.5398], [541.7088, -764.4214]];
  const westMasks = [roadMask([536.37, -759.57], [548.92, -778.48], 4.5), lowerApron.map(([x, , z]): XZ => [x, z]), bottomLanding];
  const westBounds = { minX: Math.min(...westPavingPolygon.map(p => p[0])), maxX: Math.max(...westPavingPolygon.map(p => p[0])), minZ: Math.min(...westPavingPolygon.map(p => p[1])), maxZ: Math.max(...westPavingPolygon.map(p => p[1])) };
  const westTriangles = (heightAt as TerrainHeightSampler).roadSurfaceTriangles?.(westBounds);
  const distanceToSegment = (p: XZ, a: XZ, b: XZ) => { const dx = b[0] - a[0], dz = b[1] - a[1], t = THREE.MathUtils.clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz), 0, 1); return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t); };
  const pavementEdges = [lowerApron.map(([x, , z]): XZ => [x, z]), bottomLanding];
  const westHeight = (_x: number, y: number, _z: number) => Math.max(lower, y+.035);
  const westPieces: XYZ[][] = [];
  for (const triangle of westTriangles ?? []) {
    let pieces = convexPieces(westPavingPolygon).map(poly => clipInside([[triangle[0], triangle[1], triangle[2]], [triangle[3], triangle[4], triangle[5]], [triangle[6], triangle[7], triangle[8]]], poly));
    for (const mask of westMasks) pieces = subtract(pieces, mask);
    for (const p of pieces) if (p.length >= 3 && polygonArea(p.map(p => [p[0], p[2]])) > 1e-6) for (let i = 1; i + 1 < p.length; i++) westPieces.push([p[0], p[i], p[i + 1]].map(([x, y, z]) => [x, westHeight(x, y, z), z]));
  }
  for (let i = 0; i < westPieces.length; i++) { let changed = true; while (changed) { changed = false; const a = westPieces[i], plane = new THREE.Plane().setFromCoplanarPoints(...a.slice(0, 3).map(p => new THREE.Vector3(...p)) as [THREE.Vector3, THREE.Vector3, THREE.Vector3]);
    for (let j = i + 1; j < westPieces.length; j++) { const b = westPieces[j]; if (a.filter(p => b.some(q => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < .0001)).length < 2 || b.some(p => Math.abs(plane.distanceToPoint(new THREE.Vector3(...p))) > .00005)) continue; const h = convexHull([...a, ...b].map(p => [p[0], p[2]])); if (Math.abs(polygonArea(h) - polygonArea(a.map(p => [p[0], p[2]])) - polygonArea(b.map(p => [p[0], p[2]]))) > .00001) continue; westPieces[i] = h.map(([x, z]) => [x, -(plane.normal.x * x + plane.normal.z * z + plane.constant) / plane.normal.y, z]); westPieces.splice(j, 1); changed = true; break; }
  } }
  for (const p of westPieces) { part('education12-west-lower-paving', [...p.map(p => new THREE.Vector3(...p)), ...p.map(([x, y, z]) => new THREE.Vector3(x, y - .18, z))], 0xac7563, structure, 'stone', true); pavementMasks.push({ component: 'education12-west-lower-paving', polygon: p.map(p => [p[0], p[2]]) }); for (let i = 1; i + 1 < p.length; i++) floors.push({ component: 'education12-west-lower-paving', vertices: [p[0], p[i], p[i + 1]] }); }
  const pavingEdges = new Map<string,{a:XYZ;b:XYZ;count:number}>();
  for(const polygon of westPieces)for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length],key=[a,b].map(p=>`${p[0].toFixed(4)},${p[2].toFixed(4)}`).sort().join(':');
    const edge=pavingEdges.get(key);if(edge)edge.count++;else pavingEdges.set(key,{a,b,count:1});
  }
  for(const {a,b,count} of pavingEdges.values())if(count===1){
    const bottomA=Math.min(a[1]-.18,heightAt(a[0],a[2])-.08),bottomB=Math.min(b[1]-.18,heightAt(b[0],b[2])-.08);
    if(Math.max(a[1]-.18-bottomA,b[1]-.18-bottomB)<.15)continue;
    const dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz);if(length<.02)continue;
    const nx=-dz/length*.04,nz=dx/length*.04;
    part('education12-west-paving-edge',[-1,1].flatMap(sign=>[new THREE.Vector3(a[0]+nx*sign,a[1]-.18,a[2]+nz*sign),new THREE.Vector3(b[0]+nx*sign,b[1]-.18,b[2]+nz*sign),new THREE.Vector3(b[0]+nx*sign,bottomB,b[2]+nz*sign),new THREE.Vector3(a[0]+nx*sign,bottomA,a[2]+nz*sign)]),0x929b92);
  }

  const signCenter: XZ = [(545.64 + 547.19) / 2, (-765.16 - 756.91) / 2];
  const signOwner = box('education12-blue-sign-support', v(signCenter, terrace - .22), new THREE.Vector3(5.6, .44, .10), orientation(lt), 0xbfc4bc);
  const signCanvas = document.createElement('canvas'); signCanvas.width = 1024; signCanvas.height = 128;
  const signContext = signCanvas.getContext('2d')!; signContext.clearRect(0, 0, 1024, 128); signContext.fillStyle = '#1349bd'; signContext.font = 'bold 64px Arial'; signContext.textAlign = 'center'; signContext.textBaseline = 'middle'; signContext.fillText('COLLEGE OF EDUCATION 12', 512, 64);
  const signMap = new THREE.CanvasTexture(signCanvas); signMap.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.4, .37).scale(-1, 1, 1), new THREE.MeshStandardMaterial({ map: signMap, transparent: true, side: THREE.DoubleSide, roughness: .75 }));
  sign.name = 'education12-observed-blue-sign'; sign.position.copy(v([signCenter[0] + lo[0] * .058, signCenter[1] + lo[1] * .058], terrace - .22)); sign.quaternion.copy(orientation(lt)); sign.userData.ownerComponent = signOwner.userData.component; shell.add(sign);

  const textureData = new Uint8Array(128 * 128 * 4);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) { const joint = x % 64 < 2 || y % 32 < 2, tint = joint ? .66 : .91 + ((Math.floor(x / 64) * 7 + Math.floor(y / 32) * 3) % 4) * .025, value = x > 124 && y > 124 ? 255 : Math.round(255 * tint), i = (y * 128 + x) * 4; textureData[i] = textureData[i + 1] = textureData[i + 2] = value; textureData[i + 3] = 255; }
  const pavingTexture = new THREE.DataTexture(textureData, 128, 128); pavingTexture.wrapS = pavingTexture.wrapT = THREE.RepeatWrapping; pavingTexture.colorSpace = THREE.SRGBColorSpace; pavingTexture.magFilter = THREE.LinearFilter; pavingTexture.minFilter = THREE.LinearMipmapLinearFilter; pavingTexture.generateMipmaps = true; pavingTexture.needsUpdate = true;
  for (const [bucket, name] of [[structure, 'structure'], [glass, 'glass'], [metal, 'frames-and-rails']] as const) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(bucket.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(bucket.colors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(bucket.uvs, 2));
    geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    (geometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
    (geometry.getAttribute('color') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
    bucket.geometry = geometry;
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, ...(bucket === structure ? { map: pavingTexture } : {}), roughness: bucket === glass ? .3 : .77, metalness: bucket === metal ? .45 : .05, transparent: bucket === glass, opacity: bucket === glass ? .76 : 1 });
    const mesh = new THREE.Mesh(geometry, material); mesh.name = `education12-${name}`;
    mesh.castShadow = bucket !== glass; mesh.receiveShadow = true; mesh.frustumCulled = true; shell.add(mesh);
  }
  const entryRoutes = { main: [-6.0, -3, -.45, 2.3, 3.1, 5.55].map(n => { const p = point(-2.2, n); return [p[0], entryApproachY(n), p[1]] as XYZ; }), lower: [lp(0, 2.5), lp(0, .5), lowerDoor.center, lp(0, -2.55)].map(p => [p[0], lower, p[1]] as XYZ) };
  Object.assign(shell.userData, { renderMeshes: 3, partCount: parts.length, triangles: buckets.reduce((sum, b) => sum + b.positions.length / 9, 0), education12Access: { datum: { lower, terrace }, modelLayout: layout, sourceEntrance: { nodeId: '4564809432', point: ORIGIN, actualDoorCenterMeasured: false }, doors: [{ component: door.userData.component, center: { x: layout.mainEntry.center[0], y: terrace, z: layout.mainEntry.center[1] }, outward: layout.mainEntry.outward, width: 3, height: 2.75, routeWorld: entryRoutes.main }, { component: lowerDoorOwner.userData.component, center: { x: lowerDoor.center[0], y: lower, z: lowerDoor.center[1] }, outward: lowerDoor.outward, width: 3, height: 2.65, routeWorld: entryRoutes.lower }], stairs: { ...stairs, steps, routeWorld: [[...stairs.bottom.slice(0, 1), lower, stairs.bottom[1]] as XYZ, ...steps.map(s => s.center), [stairs.top[0] + stairAxis[0] * .8, terrace, stairs.top[1] + stairAxis[1] * .8] as XYZ] }, floorTriangles: floors, pavementMasks, surfaceComponents: [...new Set(floors.map(f => f.component))], scope: { southOpenMiddleFloorObserved2025: true, recessedGlassAndRoundDiagonalColumnsObserved2025: true, westernStairSource: '../references/buildings/photos/013-12.jpg', westernStairCurrentRoadviewEndpointsObserved: false, westernStairPositionAndStepCountEstimated: true, lowerGlassFloorFromOfficialUndatedPhoto: true, upperCurveInterpolationEstimated: true, northAndRearFacadeEstimated: true, building11ConnectionDoorAdded: false, wholeInteriorModeled: false, currentStoreyCountMeasured: false }, estimates: { terraceClearHeight: upperBottom - terrace, upperBodyHeight: upperTop - upperBottom, vestibuleDepth: 3.1, westStairWidth: stairs.width, westStairCount: stairs.count, dimensionsMeasured: false }, cost: { parts: parts.length, mergedMeshes: 3, triangles: buckets.reduce((sum, b) => sum + b.positions.length / 9, 0), textures: 1 } } });
  const access = shell.userData.education12Access;
  access.entry = { ...layout.mainEntry, door: access.doors[0], routeWorld: entryRoutes.main, approach: { component: 'education12-front-forecourt', polygon: approachPolygon, source: '2025년 사진의 도로 가장자리까지 이어진 짙은 회색 포장', exactBoundaryMeasured: false, terrainTriangleMatched: !!originalTriangles, clearance: .15, insideY: terrace } };
  access.lowerEntry = { ...layout.lowerEntry, door: access.doors[1], routeWorld: entryRoutes.lower };
  access.stairs.routeWorld = [[stairs.bottom[0], lower, stairs.bottom[1]] as XYZ, ...steps.map(s => s.center), ...[sp(stairLength + .65, 0), sp(stairLength + .65, -2.05)].map(p => [p[0], terrace, p[1]] as XYZ)];
  access.externalStairs = { ...access.stairs, routeWorld: [[...sp(-1.15, 0).slice(0, 1), lower, sp(-1.15, 0)[1]] as XYZ, ...access.stairs.routeWorld], originalFootwayPreserved: 'way/456540215/328', alignmentAlongWestFacadeEstimated: true };
  access.nonWalkableRenderRanges = nonWalkableRenderRanges;
  access.roadClearance = { sourceRoad: 'way/456540222/330', halfWidth: 3.15, clippedComponents: ['education12-lower-floor', 'education12-lower-south-wall', 'education12-open-terrace-floor'], originalOutlinePreservedInMetadata: true, upperOutlineUnchanged: true };
  access.westLowerPaving = { component: 'education12-west-lower-paving', polygon: westPavingPolygon, sourceImage: '../references/buildings/photos/013-12.jpg', sourceDateKnown: false, exactBoundaryMeasured: false, terrainTriangleMatched: !!westTriangles, clearance: .035, entryAndStairJoinY: lower, excludesRoad22HalfWidth: 4.5, furnitureAdded: false };
  access.observedBlueSign = { text: 'COLLEGE OF EDUCATION 12', mesh: sign.name, ownerComponent: signOwner.userData.component, sourceImage: '../references/buildings/photos/013-12.jpg', sourceDateKnown: false, placementMeasured: false };
  shell.userData.renderMeshes = 4; shell.userData.triangles += 2; access.cost.signMeshes = 1; access.cost.textures = 2; access.cost.triangles += 2;
  const openRoute: XYZ[] = [local(-15.5, terrace, 2.3).toArray() as XYZ, local(-10, terrace, 2.3).toArray() as XYZ, local(-4, terrace, 2.3).toArray() as XYZ, local(-1.5, terrace, 2.3).toArray() as XYZ];
  access.openTerrace = { routeWorld: openRoute, floorY: terrace, component: 'education12-open-terrace-floor', entirePhotoThroughRouteConfirmed: false };
  access.frontPlanting = { ...frontPlanting, sourceImage: 'artifacts/humanities-east-review/output/playwright/39-building12-open-west-ui.png', grayBoundaryAndShrubStripObserved: true, speciesConfirmed: false, entranceApproachUnobstructed: true, openRouteLocalN: 2.3 };
  function update(_player: THREE.Vector3) { const moved = new Set<Bucket>(), recolored = new Set<Bucket>(); for (const p of parts) { if (p.visible !== p.proxy.visible) { p.visible = p.proxy.visible; for (const r of p.ranges) { if (r.start === r.end) continue; const a = r.bucket.geometry!.getAttribute('position'); if (p.visible) (a.array as Float32Array).set(r.original, r.start); else for (let i = r.start; i < r.end; i += 3) { a.array[i] = p.proxy.position.x; a.array[i + 1] = p.proxy.position.y; a.array[i + 2] = p.proxy.position.z; } moved.add(r.bucket); } } const tint = p.proxy.material.color, color = tint.getHex(); if (p.color !== color) { p.color = color; for (const r of p.ranges) { const a = r.bucket.geometry!.getAttribute('color'); for (let i = r.start; i < r.end; i += 3) { a.array[i] = color === p.base ? r.bucket.colors[i] : tint.r; a.array[i + 1] = color === p.base ? r.bucket.colors[i + 1] : tint.g; a.array[i + 2] = color === p.base ? r.bucket.colors[i + 2] : tint.b; } recolored.add(r.bucket); } } } for (const b of moved) b.geometry!.getAttribute('position').needsUpdate = true; for (const b of recolored) b.geometry!.getAttribute('color').needsUpdate = true; shell.visible = parts.some(p => p.proxy.visible); }
  const updateWithSign = (player: THREE.Vector3) => { update(player); sign.visible = signOwner.visible; };
  return { shell, breakables, update: updateWithSign };
}
