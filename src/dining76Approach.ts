import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import { DINING76_SITE as SITE, dining76Point, dining76Local, dining76DesignFloor, getDining76Layout } from './dining76Site';

type XZ = [number, number];
type XYZ = [number, number, number];
type Bucket = { positions: number[]; colors: number[]; uvs: number[]; geometry?: THREE.BufferGeometry };
type Range = { bucket: Bucket; start: number; end: number; original: Float32Array };

export function createDining76Approach(scene: THREE.Scene, heightAt: (x: number, z: number) => number, mapData?: { buildings: { points: XZ[] }[]; roads: { points: XZ[] }[] }) {
  const terrain = scene.getObjectByName('campus-terrain') as THREE.Mesh<THREE.BufferGeometry> | undefined;
  if (!terrain) throw new Error('Dining76 approach requires the actual campus terrain mesh.');
  const layout = getDining76Layout(heightAt), shell = new THREE.Group(); shell.name = 'approach/dining76-west';
  Object.assign(shell.userData, { role: 'campus-approach', buildingId: SITE.buildingId, landmark: 'dining76-west-approach', coordinates: 'D=(east,up,north); parent H applies once.' }); scene.add(shell);
  const stone: Bucket = { positions: [], colors: [], uvs: [] }, metal: Bucket = { positions: [], colors: [], uvs: [] }, glass: Bucket = { positions: [], colors: [], uvs: [] }, buckets = [stone, metal, glass];
  const parts: { proxy: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>; ranges: Range[]; shown: boolean; base: number; color: number }[] = [], breakables: BreakableSpec[] = [];
  const pavementMasks: { component: string; polygon: XZ[] }[] = [], floorTriangles: { component: string; vertices: XYZ[] }[] = [];
  const up = new THREE.Vector3(0, 1, 0), axis = new THREE.Vector3(SITE.axis.x, 0, SITE.axis.z), across = new THREE.Vector3(SITE.across.x, 0, SITE.across.z);
  const world = (s: number, y: number, n: number) => { const p = dining76Point(s, n); return new THREE.Vector3(p.x, y, p.z); };
  const local = (v: THREE.Vector3) => dining76Local(v.x, v.z);
  const vertex = terrain.geometry.getAttribute('position'), index = terrain.geometry.index, terrainTriangles: XYZ[][] = [];
  for (let i = 0; i < (index?.count ?? vertex.count); i += 3) {
    const t: XYZ[] = [0, 1, 2].map(j => { const k = index ? index.getX(i + j) : i + j; return [vertex.getX(k), vertex.getY(k), vertex.getZ(k)]; });
    if (Math.max(...t.map(p => p[0])) >= 600 && Math.min(...t.map(p => p[0])) <= 670 && Math.max(...t.map(p => p[2])) >= -675 && Math.min(...t.map(p => p[2])) <= -625) terrainTriangles.push(t);
  }
  const planeY = (p: XZ, t: XYZ[]) => { const [a, b, c] = t, den = (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]), u = ((p[0] - a[0]) * (c[2] - a[2]) - (p[1] - a[2]) * (c[0] - a[0])) / den, v = ((b[0] - a[0]) * (p[1] - a[2]) - (b[2] - a[2]) * (p[0] - a[0])) / den; return { y: a[1] + u * (b[1] - a[1]) + v * (c[1] - a[1]), inside: u >= -1e-7 && v >= -1e-7 && u + v <= 1.0000001 }; };
  const ground = (x: number, z: number) => { for (const t of terrainTriangles) { const q = planeY([x, z], t); if (q.inside) return q.y; } return heightAt(x, z) - .03; };
  function append(bucket: Bucket, geometry: THREE.BufferGeometry, color: number, paving = false) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry, p = g.getAttribute('position'), normals = g.getAttribute('normal'), tint = new THREE.Color(color);
    for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)); bucket.positions.push(v.x, v.y, v.z); bucket.colors.push(tint.r, tint.g, tint.b); const q = local(v); bucket.uvs.push(...(paving && normals.getY(i) > .7 ? [q.n / 1.6, q.s / 1.6] : [.99, .99])); }
    if (g !== geometry) g.dispose();
  }
  function part(component: string, vertices: THREE.Vector3[], color: number, bucket = stone, material: BreakableSpec['material'] = 'stone', paving = false, decoration?: () => void, cuboid?: { center: THREE.Vector3; size: THREE.Vector3; rotation: THREE.Quaternion }) {
    const starts = buckets.map(b => b.positions.length), bounds = new THREE.Box3().setFromPoints(vertices), center = cuboid?.center ?? bounds.getCenter(new THREE.Vector3()), size = cuboid?.size ?? bounds.getSize(new THREE.Vector3());
    const geometry = cuboid ? new THREE.BoxGeometry(size.x, size.y, size.z) : new ConvexGeometry(vertices.map(v => v.clone().sub(center))), proxy = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: .78 })); proxy.position.copy(center); if (cuboid) proxy.quaternion.copy(cuboid.rotation); proxy.updateMatrixWorld(true);
    Object.assign(proxy.userData, { buildingId: SITE.buildingId, landmark: 'dining76-west-approach', component, renderProxy: true, convex: !cuboid, collisionShape: cuboid ? 'oriented-cuboid' : 'convex-hull' });
    const rendered = geometry.clone().applyMatrix4(proxy.matrixWorld); append(bucket, rendered, color, paving); rendered.dispose(); decoration?.();
    parts.push({ proxy, ranges: buckets.map((b, i) => ({ bucket: b, start: starts[i], end: b.positions.length, original: Float32Array.from(b.positions.slice(starts[i])) })), shown: true, base: color, color });
    breakables.push({ mesh: proxy, size, collisionVertices: cuboid ? undefined : Float32Array.from(geometry.getAttribute('position').array), toughness: material === 'glass' ? 5 : 9, material, label: '76동 서측 접근부' }); return proxy;
  }
  function box(component: string, s: number, y: number, n: number, length: number, height: number, width: number, color: number, bucket = stone, material: BreakableSpec['material'] = 'stone') {
    const vertices: THREE.Vector3[] = []; for (const u of [s - length / 2, s + length / 2]) for (const h of [y - height / 2, y + height / 2]) for (const v of [n - width / 2, n + width / 2]) vertices.push(world(u, h, v)); return part(component, vertices, color, bucket, material);
  }
  function bar(component: string, a: THREE.Vector3, b: THREE.Vector3, radius: number, color = 0xcad1cb, ownerDecoration = false) {
    const direction = b.clone().sub(a), g = new THREE.CylinderGeometry(radius, radius, direction.length(), 8, 1); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, direction.normalize())); g.translate(...a.clone().add(b).multiplyScalar(.5).toArray());
    if (ownerDecoration) append(metal, g, color); else { const p = g.getAttribute('position'); part(component, Array.from({ length: p.count }, (_, i) => new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i))), color, metal, 'metal'); } g.dispose();
  }
  function slab(component: string, top: THREE.Vector3[], paving = true, color = 0xb9b6aa, mask = true, nosing = false, rectangular = false) {
    const bottom = top.map(p => new THREE.Vector3(p.x, Math.min(p.y - .2, ground(p.x, p.z) - .12), p.z));
    const lowest = Math.min(...bottom.map(p => p.y)), a = local(top[0]), b = local(top[2]), cuboid = rectangular ? { center: world((a.s + b.s) / 2, (lowest + top[0].y) / 2, (a.n + b.n) / 2), size: new THREE.Vector3(Math.abs(b.s - a.s), top[0].y - lowest, Math.abs(b.n - a.n)), rotation: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(axis, up, across)) } : undefined;
    const owner = part(component, [...top, ...bottom], color, stone, 'stone', paving, nosing ? () => {
      const q = [top[0], top[0].clone().addScaledVector(axis, .025), top[3].clone().addScaledVector(axis, .025), top[3]].map(p => p.clone().addScaledVector(up, .002));
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 1, 2, 0, 2, 3].flatMap(i => q[i].toArray()), 3)); g.computeVertexNormals(); append(stone, g, 0xa4a69c); g.dispose();
    } : undefined, cuboid);
    if (mask) pavementMasks.push({ component, polygon: top.map(p => [p.x, p.z]) });
    for (let j = 1; j + 1 < top.length; j++) floorTriangles.push({ component, vertices: [top[0], top[j], top[j + 1]].map(p => p.toArray() as XYZ) }); return owner;
  }
  const clip = (polygon: XYZ[], distance: (p: XYZ) => number) => { const result: XYZ[] = []; for (let i = 0; i < polygon.length; i++) { const a = polygon[i], b = polygon[(i + 1) % polygon.length], da = distance(a), db = distance(b); if (da >= -1e-8) result.push(a); if ((da >= -1e-8) !== (db >= -1e-8)) { const t = da / (da - db); result.push(a.map((v, j) => v + (b[j] - v) * t) as XYZ); } } return result; };
  function combineCoplanar(pieces: THREE.Vector3[][]) {
    const area = (p: THREE.Vector3[]) => Math.abs(p.reduce((sum, a, i) => { const b = p[(i + 1) % p.length]; return sum + a.x * b.z - b.x * a.z; }, 0)) / 2;
    const hull = (points: THREE.Vector3[]) => { const sorted = [...new Map(points.map(p => [`${p.x.toFixed(5)},${p.z.toFixed(5)}`, p])).values()].sort((a, b) => a.x - b.x || a.z - b.z), cross = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x), half = (items: THREE.Vector3[]) => { const result: THREE.Vector3[] = []; for (const p of items) { while (result.length > 1 && cross(result.at(-2)!, result.at(-1)!, p) <= 1e-8) result.pop(); result.push(p); } return result; }; return [...half(sorted).slice(0, -1), ...half(sorted.reverse()).slice(0, -1)]; };
    for (let i = 0; i < pieces.length; i++) {
      let changed = true;
      while (changed) { changed = false; const a = pieces[i], plane = new THREE.Plane().setFromCoplanarPoints(a[0], a[1], a[2]);
        for (let j = i + 1; j < pieces.length; j++) { const b = pieces[j]; if (a.filter(p => b.some(q => p.distanceToSquared(q) < 1e-8)).length < 2 || b.some(p => Math.abs(plane.distanceToPoint(p)) > .00005)) continue; const merged = hull([...a, ...b]); if (Math.abs(area(merged) - area(a) - area(b)) > .00001) continue; pieces[i] = merged; pieces.splice(j, 1); changed = true; break; }
      }
    }
    return pieces;
  }
  function terrainPaving(component: string, polygon: XZ[], color: number, paving: boolean, topY?: (v: XYZ) => number, excluded: XZ[][] = []) {
    const surfaces: THREE.Vector3[][] = [];
    const signed = Math.sign(polygon.reduce((s, a, i) => { const b = polygon[(i + 1) % polygon.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0));
    for (const tri of terrainTriangles) {
      let p = tri;
      for (let i = 0; i < polygon.length; i++) { const a = polygon[i], b = polygon[(i + 1) % polygon.length]; p = clip(p, q => signed * ((b[0] - a[0]) * (q[2] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]))); }
      let pieces = [p];
      for (const mask of excluded) {
        const sign = Math.sign(mask.reduce((sum, a, i) => { const b = mask[(i + 1) % mask.length]; return sum + a[0] * b[1] - b[0] * a[1]; }, 0));
        pieces = pieces.flatMap(piece => { let inside = piece; const outside: XYZ[][] = []; for (let i = 0; i < mask.length; i++) { const a = mask[i], b = mask[(i + 1) % mask.length], distance = (v: XYZ) => sign * ((b[0] - a[0]) * (v[2] - a[1]) - (b[1] - a[1]) * (v[0] - a[0])); const part = clip(inside, v => -distance(v)); if (part.length >= 3) outside.push(part); inside = clip(inside, distance); if (inside.length < 3) break; } return outside; });
      }
      for (const piece of pieces) for (let i = 1; i + 1 < piece.length; i++) { const t = [piece[0], piece[i], piece[i + 1]], area = Math.abs((t[1][0] - t[0][0]) * (t[2][2] - t[0][2]) - (t[1][2] - t[0][2]) * (t[2][0] - t[0][0])); if (area > 1e-6) surfaces.push(t.map(v => new THREE.Vector3(v[0], topY ? topY(v) : v[1] + .035, v[2]))); }
    }
    for (const surface of combineCoplanar(surfaces)) slab(component, surface, paving, color);
  }
  const steps: { index: number; flight: number; s0: number; s1: number; top: number; component: string; width: number }[] = [];
  for (const [flight, count, start, initial] of [[0, 11, 3.3, layout.lowerFloor], [1, 9, 10.16, layout.lowerFloor + 11 * .17]]) for (let i = 0; i < count; i++) {
    const s0 = start + i * .46, s1 = s0 + .46, y = initial + (i + 1) * .17;
    slab('dining76-stair-tread', [world(s0, y, -9), world(s1, y, -9), world(s1, y, 9), world(s0, y, 9)], true, 0xb9b6aa, true, true, true);
    steps.push({ index: steps.length, flight, s0, s1, top: y, component: 'dining76-stair-tread', width: 18 });
  }
  const middleY = layout.lowerFloor + 11 * .17;
  slab('dining76-middle-landing', [world(8.36, middleY, -9), world(10.16, middleY, -9), world(10.16, middleY, 9), world(8.36, middleY, 9)]);
  const faceS = (n: number) => { const e = layout.openings[n >= .0708261839 ? 0 : 1], a = dining76Local(...e.a), b = dining76Local(...e.b); return a.s + (b.s - a.s) * (n - a.n) / (b.n - a.n); };
  for (const [n0, n1] of [[-10.5, -4.2], [-4.2, 4.2], [4.2, 10.5]]) slab('dining76-upper-landing', [world(14.3, layout.upperFloor, n0), world(faceS(n0), layout.upperFloor, n0), world(faceS(n1), layout.upperFloor, n1), world(14.3, layout.upperFloor, n1)]);
  slab('dining76-entry-floor', [world(faceS(-4.2), layout.upperFloor, -4.2), world(faceS(-4.2) + 3, layout.upperFloor, -4.2), world(faceS(4.2) + 3, layout.upperFloor, 4.2), world(faceS(4.2), layout.upperFloor, 4.2)]);
  const lowerRoadA = SITE.lowerRoadPoints[1], lowerRoadB = SITE.lowerRoadPoints[2], lowerRoadDx = lowerRoadB[0] - lowerRoadA[0], lowerRoadDz = lowerRoadB[1] - lowerRoadA[1], lowerRoadLength = Math.hypot(lowerRoadDx, lowerRoadDz);
  const lowerPolygon = clip([[0, -9], [3.3, -9], [3.3, 9], [0, 9]].map(([s, n]) => { const p = dining76Point(s, n); return [p.x, 0, p.z] as XYZ; }), p => (lowerRoadDx * (p[2] - lowerRoadA[1]) - lowerRoadDz * (p[0] - lowerRoadA[0])) / lowerRoadLength - 2.8).map(p => [p[0], p[2]] as XZ);
  // 하단은 지형 삼각형을 따라 차도와 잇는다. 첫 단 바로 앞의 짧은 구간은 설계 바닥으로 이어진다.
  const lowerPavingY = (v: XYZ) => {
    const { s, n } = dining76Local(v[0], v[2]), blend = Math.max(0, Math.min(1, (s - 1.8) / 1.5)) * Math.max(0, Math.min(1, (11 - Math.abs(n)) / 2));
    return v[1] + .035 + Math.max(0, layout.lowerFloor - v[1] - .035) * blend;
  };
  terrainPaving('dining76-lower-apron', lowerPolygon, 0xb9b6aa, true, lowerPavingY);
  const lowA: XZ = [626.18, -656.11], lowB: XZ = [607.83, -644.89], lowLength = Math.hypot(lowB[0] - lowA[0], lowB[1] - lowA[1]);
  const lowAxis = new THREE.Vector3((lowB[0] - lowA[0]) / lowLength, 0, (lowB[1] - lowA[1]) / lowLength), lowNormal = new THREE.Vector3(-lowAxis.z, 0, lowAxis.x);
  const lowPoint = (u: number, n = 0) => new THREE.Vector3(lowA[0], 0, lowA[1]).addScaledVector(lowAxis, u).addScaledVector(lowNormal, n);
  terrainPaving('dining76-lower-sidewalk', [lowPoint(0, -2.4), lowPoint(lowLength, -2.4), lowPoint(lowLength, 2.4), lowPoint(0, 2.4)].map(p => [p.x, p.z]), 0x545d59, false, lowerPavingY, [lowerPolygon]);
  for (const side of [-1, 1]) for (let s = 3.3; s < 14.3; s += 1.5) {
    const end = Math.min(14.3, s + 1.5), n = side * 9.15, a = dining76DesignFloor(s, layout.datumOffset) + .18, b = dining76DesignFloor(end, layout.datumOffset) + .18;
    part('dining76-stair-sidewall', [world(s, a, n - .12), world(s, a, n + .12), world(end, b, n - .12), world(end, b, n + .12), ...[world(s, a, n - .12), world(s, a, n + .12), world(end, b, n - .12), world(end, b, n + .12)].map(p => new THREE.Vector3(p.x, Math.min(ground(p.x, p.z) - .15, p.y - .25), p.z))], 0xb9b5aa);
  }
  for (const n of [-9.05, 0, 9.05]) {
    const stations = [3.3, 8.36, 10.16, 14.3];
    for (let i = 0; i + 1 < stations.length; i++) { const a = stations[i], b = stations[i + 1]; for (const h of [.55, 1]) bar('dining76-handrail', world(a, dining76DesignFloor(a, layout.datumOffset) + h, n), world(b, dining76DesignFloor(b, layout.datumOffset) + h, n), .027); }
    for (let s = 3.3; s <= 14.31; s += 1.375) { const y = dining76DesignFloor(s, layout.datumOffset); bar('dining76-railing-post', world(s, y, n), world(s, y + 1, n), .027); }
  }
  for (const sign of [-1, 1]) for (let u = 3; u < lowLength; u += 2) {
    const a = lowPoint(u, sign * 2.5), b = lowPoint(Math.min(lowLength, u + 2), sign * 2.5), tangent = b.clone().sub(a).normalize(), normal = new THREE.Vector3(-tangent.z, 0, tangent.x), vertices: THREE.Vector3[] = [];
    for (const p of [a, b]) for (const side of [-.09, .09]) for (const h of [-.08, .15]) vertices.push(p.clone().addScaledVector(normal, side).setY(ground(p.x, p.z) + h)); part('dining76-low-path-curb', vertices, 0xb7b9b1);
  }
  const bollards = [-1, 1].map(side => { const p = lowPoint(5.5, side), y = ground(p.x, p.z) + .035; bar('dining76-low-path-bollard', p.clone().setY(y), p.clone().setY(y + .85), .055, 0xbfc9c6); return { center: [p.x, y + .425, p.z], radius: .055, height: .85 }; });
  const bump = [lowPoint(13.7, -2.3), lowPoint(14.2, -2.3), lowPoint(14.2, 2.3), lowPoint(13.7, 2.3)];
  for (let i = 1; i < 3; i++) slab('dining76-yellow-transverse-strip', [bump[0], bump[i], bump[i + 1]].map(p => p.clone().setY(ground(p.x, p.z) + .07)), false, 0xc6ae56, false);
  const entryFloor = layout.upperFloor, panel = (name: string, n0: number, n1: number, y0: number, y1: number, color: number, bucket: Bucket, material: BreakableSpec['material'], handles = false) => {
    const vertices: THREE.Vector3[] = []; for (const n of [n0, n1]) for (const s of [faceS(n) - .045, faceS(n) + .045]) for (const y of [y0, y1]) vertices.push(world(s, y, n));
    return part(name, vertices, color, bucket, material, false, handles ? () => {
      for (const n of [-.18, .18]) bar('entry-handle', world(faceS(n) - .095, entryFloor + .8, n), world(faceS(n) - .095, entryFloor + 1.35, n), .024, 0xc8d2ce, true);
      bar('entry-door-mullion', world(faceS(0), y0, 0), world(faceS(0), y1, 0), .035, 0xc9d0c9, true);
    } : undefined);
  };
  panel('dining76-entry-door', -1.8, 1.8, entryFloor + .035, entryFloor + 2.65, 0x547c7e, glass, 'glass', true);
  for (const [a, b] of [[-4.13, -1.87], [1.87, 4.13]]) panel('dining76-entry-side-glass', a, b, entryFloor + .08, entryFloor + 2.65, 0x547c7e, glass, 'glass');
  panel('dining76-entry-transom', -4.13, 4.13, entryFloor + 2.72, entryFloor + 3.15, 0x547c7e, glass, 'glass');
  for (const n of [-4.2, -1.84, 1.84, 4.2]) box('dining76-entry-frame', faceS(n), entryFloor + 1.6, n, .19, 3.2, .07, 0xc9d0c9, metal, 'metal');
  for (const y of [entryFloor + .035, entryFloor + 2.685, entryFloor + 3.2]) panel('dining76-entry-frame', -4.2, 4.2, y - .035, y + .035, 0xc9d0c9, metal, 'metal');
  for (const n of [-4.3, 4.3]) box('dining76-vestibule-side', faceS(n) + 1.5, entryFloor + 1.6, n, 3, 3.2, .18, 0xc4c0b4);
  box('dining76-vestibule-back', faceS(0) + 3.1, entryFloor + 1.6, 0, .18, 3.2, 8.6, 0xb3b0a6);
  const ceilingTop = [world(faceS(-4.3), entryFloor + 3.35, -4.3), world(faceS(-4.3) + 3.2, entryFloor + 3.35, -4.3), world(faceS(4.3) + 3.2, entryFloor + 3.35, 4.3), world(faceS(4.3), entryFloor + 3.35, 4.3)];
  part('dining76-vestibule-ceiling', [...ceilingTop, ...ceilingTop.map(p => p.clone().addScaledVector(up, -.15))], 0xc5c1b8);
  const island = [[3.2, -11.5], [3.2, -23.6], [5.5, -24.4], [9.5, -24.2], [12, -20], [12, -11.5]];
  for (let i = 0; i < island.length; i++) {
    const a = island[i], b = island[(i + 1) % island.length], length = Math.hypot(b[0] - a[0], b[1] - a[1]), count = Math.ceil(length / 2), ns = -(b[1] - a[1]) / length, nn = (b[0] - a[0]) / length;
    for (let j = 0; j < count; j++) { const vertices: THREE.Vector3[] = []; for (const t of [j / count, (j + 1) / count]) for (const side of [-.1, .1]) { const s = a[0] + (b[0] - a[0]) * t + ns * side, n = a[1] + (b[1] - a[1]) * t + nn * side, p = dining76Point(s, n), y = ground(p.x, p.z); for (const h of [-.04, .2]) vertices.push(world(s, y + h, n)); } part('dining76-island-curb', vertices, 0xb5b9af); }
  }
  function foliage(s: number, n: number, y: number, scale: [number, number, number], color: number) { const g = new THREE.IcosahedronGeometry(1, 0); g.scale(...scale); const p = dining76Point(s, n); g.translate(p.x, y, p.z); const a = g.getAttribute('position'); part('dining76-planting', Array.from({ length: a.count }, (_, i) => new THREE.Vector3(a.getX(i), a.getY(i), a.getZ(i))), color); g.dispose(); }
  for (const [s, n] of [[4.8, -14.7], [8.5, -17], [10.5, -14]]) { const p = dining76Point(s, n), y = ground(p.x, p.z); bar('dining76-tree-trunk', world(s, y, n), world(s, y + 5.3, n), .16, 0x635c45); for (const [ds, dn, dy, size] of [[0, 0, 5.5, 2.2], [-.6, .6, 6.8, 1.6], [.7, -.4, 4.8, 1.7]]) foliage(s + ds, n + dn, y + dy, [size, size * .8, size], 0x526d47); }
  for (const [s, n] of [[4.5, -12], [6.5, -12.3], [9, -12], [11, -18.8], [5, -21.5], [9, -21]]) { const p = dining76Point(s, n); foliage(s, n, ground(p.x, p.z) + .65, [1.1, .65, 1], 0x64774e); }
  for (const [s, n] of [[6.5, -12.5], [7, 12]]) { const p = dining76Point(s, n), y = ground(p.x, p.z); bar('dining76-disc-lamp-pole', world(s, y, n), world(s, y + 3, n), .05, 0xb8c0b7); const g = new THREE.CylinderGeometry(.35, .35, .09, 12); g.translate(p.x, y + 3.05, p.z); const positions = g.getAttribute('position'); part('dining76-disc-lamp-head', Array.from({ length: positions.count }, (_, i) => new THREE.Vector3(positions.getX(i), positions.getY(i), positions.getZ(i))), 0xd6d7c5, metal, 'metal'); g.dispose(); }
  const boardS = 6.5, boardN = -22, boardPoint = dining76Point(boardS, boardN), boardGround = ground(boardPoint.x, boardPoint.z);
  const board = box('dining76-map-board', boardS, boardGround + 1.25, boardN, .15, 2.5, 1.05, 0x3e5866, metal, 'metal');
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 512; const context = canvas.getContext('2d')!;
  context.fillStyle = '#354b63'; context.fillRect(0, 0, 256, 512);
  if (mapData) { const xy = (p: XZ) => [128 + (p[0] - 640) * 1.4, 256 - (p[1] + 645) * 1.4]; context.strokeStyle = '#e4e7d6'; context.lineWidth = 2; for (const road of mapData.roads) { context.beginPath(); road.points.forEach((p, i) => { const q = xy(p); if (i) context.lineTo(q[0], q[1]); else context.moveTo(q[0], q[1]); }); context.stroke(); } context.fillStyle = '#a7b9ba'; for (const b of mapData.buildings) { context.beginPath(); b.points.forEach((p, i) => { const q = xy(p); if (i) context.lineTo(q[0], q[1]); else context.moveTo(q[0], q[1]); }); context.closePath(); context.fill(); } }
  // 2025년 7월 거리뷰에서 판독한 제목만 반영하고, 내부 그림은 현재 지도 기반 약도로 둔다.
  context.fillStyle = '#35404a'; context.fillRect(0, 0, 256, 52);
  context.fillStyle = '#f3f3ed'; context.font = '600 18px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
  context.fillText('장애인편의시설 안내도', 128, 26, 238);
  const mapTexture = new THREE.CanvasTexture(canvas); mapTexture.colorSpace = THREE.SRGBColorSpace;
  // 상위 장면의 북쪽 축 반사 뒤에도 도로 쪽에서 글자가 바르게 보이도록 UV만 뒤집는다.
  mapTexture.repeat.x = -1; mapTexture.offset.x = 1;
  const mapMesh = new THREE.Mesh(new THREE.PlaneGeometry(.91, 2.3), new THREE.MeshStandardMaterial({ map: mapTexture, roughness: .8, side: THREE.DoubleSide }));
  mapMesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(across, up, axis.clone().negate())); mapMesh.position.copy(world(boardS - .082, boardGround + 1.25, boardN)); mapMesh.name = 'dining76-map-diagram'; shell.add(mapMesh);
  const pixels = new Uint8Array(128 * 128 * 4); for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) { const cell = Math.floor(x / 32) + 4 * Math.floor(y / 64), joint = x % 32 < 1 || y % 64 < 1, shade = joint ? 137 : 221 + (cell * 13 % 27), i = (y * 128 + x) * 4; pixels[i] = pixels[i + 1] = pixels[i + 2] = x > 123 && y > 123 ? 255 : shade; pixels[i + 3] = 255; }
  const texture = new THREE.DataTexture(pixels, 128, 128); texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true; texture.needsUpdate = true;
  for (const [i, bucket] of buckets.entries()) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(bucket.positions, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(bucket.colors, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(bucket.uvs, 2)); g.computeVertexNormals(); g.computeBoundingSphere(); g.computeBoundingBox(); bucket.geometry = g; const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, map: i === 0 ? texture : null, roughness: i === 2 ? .25 : .8, metalness: i === 1 ? .3 : 0, side: THREE.DoubleSide })); mesh.name = ['dining76-stone-and-paving', 'dining76-metal-and-frames', 'dining76-entry-glass'][i]; mesh.castShadow = true; mesh.receiveShadow = true; shell.add(mesh); }
  const routePoint = (s: number, n: number, y: number) => world(s, y, n).toArray();
  const routeWorld = [routePoint(0, -2, ground(...(p => [p.x, p.z] as XZ)(dining76Point(0, -2))) + .035), routePoint(3.3, -2, layout.lowerFloor + .17), routePoint(9.2, -2, middleY), routePoint(14.5, -2, layout.upperFloor), routePoint(18.5, -2, layout.upperFloor), [layout.entrance.center.x, layout.upperFloor, layout.entrance.center.z], routePoint(faceS(0) + 2.5, 0, layout.upperFloor)];
  shell.userData.dining76Access = { sourceRoad: SITE.sourceRoad, buildingId: SITE.buildingId, layout, steps, routeWorld, stairs: { routeWorld: routeWorld.slice(0, 5), steps, width: 18, handrailOffsets: [-9.05, 0, 9.05], surfaceComponents: ['dining76-stair-tread', 'dining76-middle-landing', 'dining76-upper-landing'], originalEndpoints: [SITE.origin, SITE.upper] }, entry: { ...layout.entrance, component: 'dining76-entry-door', interiorEnd: routeWorld.at(-1), routeWorld: routeWorld.slice(-3) }, lowerPath: { sourceRoad: SITE.originalLowerRoad, points: [lowA, lowB], routeWorld: [0, 3, 5.5, 9, 14, lowLength].map(u => { const p = lowPoint(u); return [p.x, ground(p.x, p.z) + .035, p.z]; }), width: 4.8, bollards, transverseYellowStripIsTactile: false }, pavementMasks, floorTriangles, surfaceComponents: ['dining76-stair-tread', 'dining76-middle-landing', 'dining76-upper-landing', 'dining76-entry-floor', 'dining76-lower-apron', 'dining76-lower-sidewalk'], mapBoard: { component: 'dining76-map-board', observedHeading: '장애인편의시설 안내도', headingSource: 'sources/dining76-east-roadview-review.json', currentMapBasedSchematic: true, photographedMapCopied: false, textInvented: false }, scope: { stepCountMeasured: false, dimensionsEstimated: true, currentEntryGlassObserved: true, oldWoodStripAndShopSignsCopied: false, rearFacadeObserved: false, rightStair87Implemented: false, rightStair87Reason: '별도 갈색 계단은 확인했지만 현 지형 고도차와 사진 비례의 정합은 후속 단계로 남긴다.', plantingSpeciesAndPositionsEstimated: true }, geometry: { parts: parts.length, triangles: buckets.reduce((sum, b) => sum + b.positions.length / 9, 0) + 2, mergedMeshes: 3, atlasMeshes: 1, textures: 2 } };
  Object.assign(shell.userData.dining76Access.stairs, { collisionShape: 'oriented-cuboid', cuboidBottomBelowTerrain: true });
  function update(_player: THREE.Vector3) {
    const changed = new Set<Bucket>(), recolored = new Set<Bucket>();
    for (const p of parts) {
      if (p.shown !== p.proxy.visible) { p.shown = p.proxy.visible; for (const r of p.ranges) { if (r.start === r.end) continue; const a = r.bucket.geometry!.getAttribute('position'); if (p.shown) (a.array as Float32Array).set(r.original, r.start); else for (let j = r.start; j < r.end; j += 3) { a.array[j] = p.proxy.position.x; a.array[j + 1] = p.proxy.position.y; a.array[j + 2] = p.proxy.position.z; } changed.add(r.bucket); } }
      const tint = p.proxy.material.color, hex = tint.getHex(); if (p.color !== hex) { p.color = hex; for (const r of p.ranges) { const a = r.bucket.geometry!.getAttribute('color'); for (let j = r.start; j < r.end; j += 3) { const original = r.bucket.colors; a.array[j] = hex === p.base ? original[j] : tint.r; a.array[j + 1] = hex === p.base ? original[j + 1] : tint.g; a.array[j + 2] = hex === p.base ? original[j + 2] : tint.b; } recolored.add(r.bucket); } }
    }
    for (const b of changed) b.geometry!.getAttribute('position').needsUpdate = true; for (const b of recolored) b.geometry!.getAttribute('color').needsUpdate = true;
    mapMesh.visible = board.visible; shell.visible = parts.some(p => p.proxy.visible);
  }
  return { shell, breakables, update, layout };
}
