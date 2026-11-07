import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import { DINING76_EAST_SITE as SITE, dining76EastPoint, dining76EastLocal, dining76EastDesignFloor, getDining76EastLayout } from './dining76EastSite';

type XZ = [number, number];
type XYZ = [number, number, number];
type Bucket = { positions: number[]; colors: number[]; uvs: number[]; geometry?: THREE.BufferGeometry };
type Range = { bucket: Bucket; start: number; end: number; original: Float32Array };

export function createDining76EastApproach(scene: THREE.Scene, heightAt: (x: number, z: number) => number) {
  const layout = getDining76EastLayout(heightAt), shell = new THREE.Group(); shell.name = 'approach/dining76-east';
  Object.assign(shell.userData, { role: 'campus-approach', buildingId: SITE.buildingId, landmark: 'dining76-east-approach', coordinates: 'D=(east,up,north); parent H applies once.' }); scene.add(shell);
  const stone: Bucket = { positions: [], colors: [], uvs: [] }, metal: Bucket = { positions: [], colors: [], uvs: [] }, buckets = [stone, metal];
  const parts: { proxy: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>; ranges: Range[]; shown: boolean; base: number; color: number }[] = [], breakables: BreakableSpec[] = [];
  const pavementMasks: { component: string; polygon: XZ[] }[] = [], floorTriangles: { component: string; vertices: XYZ[] }[] = [];
  const up = new THREE.Vector3(0, 1, 0), axis = new THREE.Vector3(SITE.axis.x, 0, SITE.axis.z), across = new THREE.Vector3(SITE.across.x, 0, SITE.across.z);
  const rotation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(axis, up, across));
  const world = (s: number, y: number, n: number) => { const p = dining76EastPoint(s, n); return new THREE.Vector3(p.x, y, p.z); };
  const terrain = scene.getObjectByName('campus-terrain') as THREE.Mesh<THREE.BufferGeometry> | undefined;
  if (!terrain) throw new Error('Dining76 east approach requires the actual campus terrain.');
  const position = terrain.geometry.getAttribute('position'), index = terrain.geometry.index, terrainTriangles: XYZ[][] = [];
  for (let i = 0; i < (index?.count ?? position.count); i += 3) {
    const triangle: XYZ[] = [0, 1, 2].map(j => { const k = index ? index.getX(i + j) : i + j; return [position.getX(k), position.getY(k), position.getZ(k)]; });
    if (Math.max(...triangle.map(v => v[0])) >= 644 && Math.min(...triangle.map(v => v[0])) <= 705 && Math.max(...triangle.map(v => v[2])) >= -675 && Math.min(...triangle.map(v => v[2])) <= -610) terrainTriangles.push(triangle);
  }
  const planeY = (x: number, z: number, tri: XYZ[]) => { const [a, b, c] = tri, den = (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]), u = ((x - a[0]) * (c[2] - a[2]) - (z - a[2]) * (c[0] - a[0])) / den, v = ((b[0] - a[0]) * (z - a[2]) - (b[2] - a[2]) * (x - a[0])) / den; return { y: a[1] + u * (b[1] - a[1]) + v * (c[1] - a[1]), inside: u >= -1e-7 && v >= -1e-7 && u + v <= 1.0000001 }; };
  const ground = (x: number, z: number) => { for (const t of terrainTriangles) { const q = planeY(x, z, t); if (q.inside) return q.y; } return heightAt(x, z) - .03; };
  const clip = (polygon: XYZ[], distance: (v: XYZ) => number) => { const result: XYZ[] = []; for (let i = 0; i < polygon.length; i++) { const a = polygon[i], b = polygon[(i + 1) % polygon.length], da = distance(a), db = distance(b); if (da >= -1e-8) result.push(a); if ((da >= -1e-8) !== (db >= -1e-8)) { const t = da / (da - db); result.push(a.map((v, j) => v + (b[j] - v) * t) as XYZ); } } return result; };
  function append(bucket: Bucket, geometry: THREE.BufferGeometry, color: number, paving = false) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry, p = g.getAttribute('position'), normals = g.getAttribute('normal'), tint = new THREE.Color(color);
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), q = dining76EastLocal(x, z); bucket.positions.push(x, y, z); bucket.colors.push(tint.r, tint.g, tint.b); bucket.uvs.push(...(paving && normals.getY(i) > .7 ? [q.n / 1.2, q.s / 1.2] : [.99, .99])); }
    if (g !== geometry) g.dispose();
  }
  function part(component: string, vertices: THREE.Vector3[], color: number, bucket = stone, material: BreakableSpec['material'] = 'stone', paving = false, decoration?: () => void, cuboid?: { center: THREE.Vector3; size: THREE.Vector3; rotation: THREE.Quaternion }) {
    const starts = buckets.map(b => b.positions.length), bounds = new THREE.Box3().setFromPoints(vertices), center = cuboid?.center ?? bounds.getCenter(new THREE.Vector3()), size = cuboid?.size ?? bounds.getSize(new THREE.Vector3());
    const geometry = cuboid ? new THREE.BoxGeometry(size.x, size.y, size.z) : new ConvexGeometry(vertices.map(v => v.clone().sub(center))), proxy = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: .82 }));
    proxy.position.copy(center); if (cuboid) proxy.quaternion.copy(cuboid.rotation); proxy.updateMatrixWorld(true);
    Object.assign(proxy.userData, { buildingId: SITE.buildingId, landmark: 'dining76-east-approach', component, renderProxy: true, convex: !cuboid, collisionShape: cuboid ? 'oriented-cuboid' : 'convex-hull' });
    const rendered = geometry.clone().applyMatrix4(proxy.matrixWorld); append(bucket, rendered, color, paving); rendered.dispose(); decoration?.();
    parts.push({ proxy, ranges: buckets.map((b, i) => ({ bucket: b, start: starts[i], end: b.positions.length, original: Float32Array.from(b.positions.slice(starts[i])) })), shown: true, base: color, color });
    breakables.push({ mesh: proxy, size, collisionVertices: cuboid ? undefined : Float32Array.from(geometry.getAttribute('position').array), toughness: material === 'metal' ? 10 : 9, material, label: '76동 동측 계단과 상부 보행로' }); return proxy;
  }
  function bar(component: string, a: THREE.Vector3, b: THREE.Vector3, radius = .025, color = 0xbec8c2, decoration = false) {
    const delta = b.clone().sub(a), g = new THREE.CylinderGeometry(radius, radius, delta.length(), 8, 1); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, delta.normalize())); g.translate(...a.clone().add(b).multiplyScalar(.5).toArray());
    if (decoration) append(metal, g, color); else { const p = g.getAttribute('position'); part(component, Array.from({ length: p.count }, (_, i) => new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i))), color, metal, 'metal'); } g.dispose();
  }
  function recordFloor(component: string, top: THREE.Vector3[]) { pavementMasks.push({ component, polygon: top.map(v => [v.x, v.z]) }); for (let i = 1; i + 1 < top.length; i++) floorTriangles.push({ component, vertices: [top[0], top[i], top[i + 1]].map(v => v.toArray() as XYZ) }); }
  function floor(component: string, top: THREE.Vector3[], color = 0xa9aaa0, suspended = false, rectangular = false, nosing = false) {
    const bottom = top.map(v => v.clone().setY(suspended ? v.y - .25 : Math.min(v.y - .18, ground(v.x, v.z) - .12))), minY = Math.min(...bottom.map(v => v.y));
    const a = dining76EastLocal(top[0].x, top[0].z), b = dining76EastLocal(top[2].x, top[2].z);
    const cuboid = rectangular ? { center: world((a.s + b.s) / 2, (minY + top[0].y) / 2, (a.n + b.n) / 2), size: new THREE.Vector3(Math.abs(b.s - a.s), top[0].y - minY, Math.abs(b.n - a.n)), rotation } : undefined;
    const owner = part(component, [...top, ...bottom], color, stone, 'stone', true, nosing ? () => { const g = new THREE.BoxGeometry(.04, .012, SITE.halfWidth * 2); g.applyQuaternion(rotation); g.translate(...world(a.s + .022, top[0].y + .006, 0).toArray()); append(stone, g, 0xc7c8bf); g.dispose(); } : undefined, cuboid);
    recordFloor(component, top); return owner;
  }
  function terrainFloor(component: string, polygon: XZ[], target: (x: number, y: number, z: number) => number, color = 0xa9aaa0) {
    const sign = Math.sign(polygon.reduce((sum, a, i) => { const b = polygon[(i + 1) % polygon.length]; return sum + a[0] * b[1] - b[0] * a[1]; }, 0));
    const patches: THREE.Vector3[][] = [];
    for (const t of terrainTriangles) { let p = t; for (let i = 0; i < polygon.length; i++) { const a = polygon[i], b = polygon[(i + 1) % polygon.length]; p = clip(p, v => sign * ((b[0] - a[0]) * (v[2] - a[1]) - (b[1] - a[1]) * (v[0] - a[0]))); } if (p.length >= 3) patches.push(p.map(v => new THREE.Vector3(v[0], target(...v), v[2]))); }
    // 같은 평면의 작은 조각만 합친다. 서로 기울기가 다른 면을 큰 볼록체로 덮지 않는다.
    const area = (p: THREE.Vector3[]) => Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a.x * b.z - b.x * a.z; }, 0)) / 2;
    const hull = (points: THREE.Vector3[]) => { const sorted = [...new Map(points.map(p => [`${p.x.toFixed(6)},${p.z.toFixed(6)}`, p])).values()].sort((a, b) => a.x - b.x || a.z - b.z), cross = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x), half = (items: THREE.Vector3[]) => { const r: THREE.Vector3[] = []; for (const p of items) { while (r.length > 1 && cross(r.at(-2)!, r.at(-1)!, p) <= 1e-8) r.pop(); r.push(p); } return r; }; return [...half(sorted).slice(0, -1), ...half([...sorted].reverse()).slice(0, -1)]; };
    for (let i = 0; i < patches.length; i++) { let changed = true; while (changed) { changed = false; const a = patches[i]; if (area(a) < 1e-7) break; const plane = new THREE.Plane().setFromCoplanarPoints(a[0], a[1], a[2]); for (let j = i + 1; j < patches.length; j++) { const b = patches[j]; if (a.filter(p => b.some(q => p.distanceToSquared(q) < 1e-9)).length < 2 || b.some(p => Math.abs(plane.distanceToPoint(p)) > .00003)) continue; const merged = hull([...a, ...b]); if (Math.abs(area(merged) - area(a) - area(b)) > .00001) continue; patches[i] = merged; patches.splice(j, 1); changed = true; break; } } }
    for (const top of patches) if (area(top) > 1e-6) { const plane = new THREE.Plane().setFromCoplanarPoints(top[0], top[1], top[2]); if (top.some(p => Math.abs(plane.distanceToPoint(p)) > .00001)) { for (let i = 1; i + 1 < top.length; i++) floor(component, [top[0], top[i], top[i + 1]], color); } else floor(component, top, color); }
  }
  const rect = (s0: number, s1: number, n0: number, n1: number, y: number) => [world(s0, y, n0), world(s1, y, n0), world(s1, y, n1), world(s0, y, n1)];
  const steps: { index: number; s0: number; s1: number; top: number; width: number; component: string }[] = [];
  for (let i = 0; i < SITE.stepCount; i++) { const s0 = SITE.stairStart + i * SITE.tread, s1 = s0 + SITE.tread, top = layout.lowerFloor + (i + 1) * SITE.stepRise; floor('dining76-east-tread', rect(s0, s1, -2.4, 2.4, top), 0x737770, false, true, true); steps.push({ index: i, s0, s1, top, width: 4.8, component: 'dining76-east-tread' }); }
  const apronPolygon = rect(0, SITE.stairStart, -2.4, 2.4, 0).map(v => [v.x, v.z] as XZ);
  terrainFloor('dining76-east-lower-apron', apronPolygon, (x, y, z) => { const { s } = dining76EastLocal(x, z), t = THREE.MathUtils.clamp((s - 1.3) / .9, 0, 1); return Math.max(y + .035, (y + .035) * (1 - t) + layout.lowerFloor * t); });
  floor('dining76-east-upper-landing', rect(11.72, SITE.length, -2.4, 2.4, layout.upperFloor), 0x9a9d93, false, true);
  floor('dining76-east-upper-path', rect(SITE.length, 19.15, -1.6, 1.6, layout.upperFloor), 0xa9aaa0, true, true);
  const platform = SITE.sidePlatform;
  floor('dining76-east-side-platform', rect(platform.s0, platform.s1, platform.n0, platform.n1, layout.upperFloor), 0xa9aaa0, true, true);
  // 북쪽 길은 원래 /33 선형을 따라 높은 참에서 기존 지면까지 연결한다.
  const c = SITE.junction, d = SITE.northBend, e = SITE.northEnd, startLocal = dining76EastLocal(...c), startT = (19.15 - startLocal.s) / (dining76EastLocal(...d).s - startLocal.s);
  const northStart: XZ = [c[0] + (d[0] - c[0]) * startT, c[1] + (d[1] - c[1]) * startT];
  const northPoints = [northStart, d, e], northSections: { point: XZ; left: XZ; right: XZ; s: number }[] = [];
  for (let i = 0; i < northPoints.length; i++) { const p = northPoints[i], prev = northPoints[Math.max(0, i - 1)], next = northPoints[Math.min(northPoints.length - 1, i + 1)], dx = next[0] - prev[0], dz = next[1] - prev[1], l = Math.hypot(dx, dz), nx = -dz / l, nz = dx / l; northSections.push({ point: p, left: [p[0] + nx * 1.6, p[1] + nz * 1.6], right: [p[0] - nx * 1.6, p[1] - nz * 1.6], s: dining76EastLocal(...p).s }); }
  // 처음 단면은 평탄 참과 같은 선을 공유해 삼각형 틈을 남기지 않는다.
  const startCenter = dining76EastPoint(19.15); northSections[0] = { point: [startCenter.x, startCenter.z], left: (p => [p.x, p.z] as XZ)(dining76EastPoint(19.15, 1.6)), right: (p => [p.x, p.z] as XZ)(dining76EastPoint(19.15, -1.6)), s: 19.15 };
  const northFloorY = (p: XZ) => { const s = dining76EastLocal(...p).s, blend = THREE.MathUtils.clamp((s - (SITE.outer.s1 - 2)) / 2, 0, 1); return dining76EastDesignFloor(s, layout.datumOffset) * (1 - blend) + (ground(...p) + .035) * blend; };
  for (let i = 0; i + 1 < northSections.length; i++) { const a = northSections[i], b = northSections[i + 1], count = Math.ceil(Math.hypot(b.point[0] - a.point[0], b.point[1] - a.point[1]) / 2); for (let j = 0; j < count; j++) {
    const at = (t: number, side: 'left' | 'right') => { const p: XZ = [a[side][0] + (b[side][0] - a[side][0]) * t, a[side][1] + (b[side][1] - a[side][1]) * t]; return new THREE.Vector3(p[0], northFloorY(p), p[1]); }, top = [at(j / count, 'right'), at((j + 1) / count, 'right'), at((j + 1) / count, 'left'), at(j / count, 'left')];
    const coordinates = top.map(v => v.toArray() as XYZ), cutoff = SITE.outer.s1 - 2;
    const solid = clip(coordinates, v => cutoff - dining76EastLocal(v[0], v[2]).s), join = clip(coordinates, v => dining76EastLocal(v[0], v[2]).s - cutoff);
    for (let k = 1; k + 1 < solid.length; k++) floor('dining76-east-north-walk', [solid[0], solid[k], solid[k + 1]].map(v => new THREE.Vector3(...v)), 0xa9aaa0);
    if (join.length >= 3) terrainFloor('dining76-east-north-walk', join.map(v => [v[0], v[2]]), (x, y, z) => Math.max(y + .035, northFloorY([x, z])));
  } }
  for (const side of [-1, 1]) {
    const n0 = side < 0 ? -2.95 : 2.4, n1 = side < 0 ? -2.4 : 2.95;
    for (let s = 2.2; s < SITE.length; s += 1.4) { const end = Math.min(SITE.length, s + 1.4), y0 = dining76EastDesignFloor(s, layout.datumOffset), y1 = dining76EastDesignFloor(end, layout.datumOffset), top = [world(s, y0 + .95, n0), world(end, y1 + .95, n0), world(end, y1 + .95, n1), world(s, y0 + .95, n1)]; part('dining76-east-brown-sidewall', [...top, ...top.map(v => v.clone().setY(Math.min(v.y - 1.1, ground(v.x, v.z) - .1)))], 0x805a48); }
    for (const [s0, s1] of [[2.2, 11.72], [11.72, SITE.length]]) { bar('dining76-east-inner-handrail', world(s0, dining76EastDesignFloor(s0, layout.datumOffset) + .78, side * 2.31), world(s1, dining76EastDesignFloor(s1, layout.datumOffset) + .78, side * 2.31), .028); }
    for (let s = 2.3; s < SITE.length; s += 1.5) { const y = dining76EastDesignFloor(s, layout.datumOffset); bar('dining76-east-handrail-bracket', world(s, y + .7, side * 2.32), world(s, y + .7, side * 2.55), .022); }
  }
  // 사진의 흰 보와 난간은 높은 외부 참의 도로 쪽에만 둔다.
  const beamS = platform.s0 + .08, beamTop = layout.upperFloor - .03, beamBottom = beamTop - .55;
  part('dining76-east-white-beam', [...rect(beamS - .19, beamS + .19, platform.n0, platform.n1, beamTop), ...rect(beamS - .19, beamS + .19, platform.n0, platform.n1, beamBottom)], 0xd2d3c8);
  for (const n of [platform.n0 + .3, platform.n1 - .3]) { const p = dining76EastPoint(beamS, n), y = ground(p.x, p.z); part('dining76-east-white-support', [...rect(beamS - .2, beamS + .2, n - .2, n + .2, beamBottom), ...rect(beamS - .2, beamS + .2, n - .2, n + .2, y - .1)], 0xc5c7bc); }
  const railLine = (s0: number, n0: number, s1: number, n1: number) => { const length = Math.hypot(s1 - s0, n1 - n0); for (const h of [.48, 1.05]) bar('dining76-east-upper-railing', world(s0, layout.upperFloor + h, n0), world(s1, layout.upperFloor + h, n1), .026); for (let u = 0; u <= length + .01; u += .65) { const t = Math.min(1, u / length); bar('dining76-east-upper-rail-post', world(s0 + (s1 - s0) * t, layout.upperFloor, n0 + (n1 - n0) * t), world(s0 + (s1 - s0) * t, layout.upperFloor + 1.05, n0 + (n1 - n0) * t), .022); } };
  railLine(platform.s0, platform.n0, platform.s0, platform.n1); railLine(platform.s1, platform.n0, platform.s1, platform.n1); railLine(platform.s0, platform.n1, platform.s1, platform.n1);
  for (const side of [-1, 1]) railLine(SITE.length, side * 1.6, platform.s0, side * 1.6);
  railLine(platform.s0, -1.6, platform.s1, -1.6);
  const underPolygon = rect(13.5, platform.s1, 3.2, 9.1, 0).map(v => [v.x, v.z] as XZ);
  terrainFloor('dining76-east-open-lower-floor', underPolygon, (_x, y, _z) => y + .035, 0xb4b8ab);
  // 계단 옆의 낮은 흰 경계와 식재는 관측된 범위의 비례만 근사한다.
  const planter = { s0: 3.5, s1: 7.2, n0: 3.5, n1: 6.5 }, planterTop = Math.max(...rect(planter.s0, planter.s1, planter.n0, planter.n1, 0).map(v => ground(v.x, v.z))) + .65;
  for (const [s0, s1, n0, n1] of [[planter.s0, planter.s0 + .2, planter.n0, planter.n1], [planter.s0, planter.s1, planter.n0, planter.n0 + .2], [planter.s0, planter.s1, planter.n1 - .2, planter.n1]]) { const top = rect(s0, s1, n0, n1, planterTop); part('dining76-east-low-white-planter', [...top, ...top.map(v => v.clone().setY(ground(v.x, v.z) - .1))], 0xd0d2c5); }
  for (const [s, n] of [[4.5, 4.5], [6, 5.2]]) { const p = dining76EastPoint(s, n), y = Math.max(ground(p.x, p.z) + .7, planterTop); const g = new THREE.IcosahedronGeometry(1, 0); g.scale(.85, .65, .9); g.translate(p.x, y, p.z); const a = g.getAttribute('position'); part('dining76-east-planting', Array.from({ length: a.count }, (_, i) => new THREE.Vector3(a.getX(i), a.getY(i), a.getZ(i))), 0x536c45); g.dispose(); }
  const pixels = new Uint8Array(128 * 128 * 4); for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) { const joint = x % 64 < 1 || y % 32 < 1, cell = Math.floor(x / 64) + Math.floor(y / 32) * 2, value = x > 123 && y > 123 ? 255 : joint ? 148 : 226 + cell * 11 % 25, i = (y * 128 + x) * 4; pixels[i] = pixels[i + 1] = pixels[i + 2] = value; pixels[i + 3] = 255; }
  const texture = new THREE.DataTexture(pixels, 128, 128); texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.generateMipmaps = true; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.NearestFilter; texture.needsUpdate = true;
  for (const [i, bucket] of buckets.entries()) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(bucket.positions, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(bucket.colors, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(bucket.uvs, 2)); g.computeVertexNormals(); g.computeBoundingSphere(); g.computeBoundingBox(); bucket.geometry = g; const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, map: i ? null : texture, roughness: i ? .5 : .88, metalness: i ? .3 : 0, side: THREE.DoubleSide })); mesh.name = i ? 'dining76-east-metal' : 'dining76-east-stone-and-paving'; mesh.castShadow = mesh.receiveShadow = true; shell.add(mesh); }
  const routePoint = (s: number, n: number, y: number) => world(s, y, n).toArray() as XYZ;
  const stairRoute = [routePoint(0, 0, ground(...SITE.origin) + .035), routePoint(2.19, 0, layout.lowerFloor), ...steps.map(step => routePoint((step.s0 + step.s1) / 2, 0, step.top)), routePoint(SITE.length, 0, layout.upperFloor), routePoint(17.4, 0, layout.upperFloor)];
  const northRoute = [routePoint(17.4, 0, layout.upperFloor), routePoint(19.15, 0, layout.upperFloor), ...[d, e].map(p => [p[0], northFloorY(p), p[1]] as XYZ)];
  const sideRoute = [routePoint(17.4, 0, layout.upperFloor), [SITE.sideEnd[0], layout.upperFloor, SITE.sideEnd[1]] as XYZ];
  shell.userData.dining76EastAccess = { buildingId: SITE.buildingId, sourceRoad: SITE.sourceRoad, layout, steps, routeWorld: [...stairRoute, ...northRoute.slice(1)], stairs: { originalEndpoints: [SITE.origin, SITE.upper], routeWorld: stairRoute, steps, width: 4.8, handrailOffsets: [-2.31, 2.31], centralRail: false, surfaceComponents: ['dining76-east-tread', 'dining76-east-lower-apron', 'dining76-east-upper-landing'] }, northWalk: { sourceRoad: SITE.upperRoad, routeWorld: northRoute, originalPoints: SITE.upperPath, width: 3.2 }, sideWalk: { sourceRoad: SITE.sideRoad, routeWorld: sideRoute, originalPoints: [SITE.junction, SITE.sideEnd], width: 3.5, belowTerrainFilled: false, buildingDoorAdded: false, originalEndToBuildingVertexDistance: 2.331222855 }, pavementMasks, floorTriangles, surfaceComponents: [...new Set(floorTriangles.map(t => t.component))], wallComponents: ['dining76-east-brown-sidewall', 'dining76-east-white-beam', 'dining76-east-white-support'], scope: { dimensionsEstimated: true, stepCountMeasured: false, upperConnectionContinuousPhotoAvailable: false, sidePlatformAndWhiteBeamRelationEstimated: true, stairSidewallsAndInnerRailsObserved: true, upperWhiteBeamAndRailingObserved: true, rearFacadeOrInteriorImplemented: false, newSigns: false }, geometry: { parts: parts.length, triangles: buckets.reduce((sum, b) => sum + b.positions.length / 9, 0), mergedMeshes: 2, textures: 1 } };
  Object.assign(shell.userData.dining76EastAccess, { upperRouteWorld: northRoute, sideRouteWorld: sideRoute, lowRouteWorld: [[...SITE.origin.slice(0, 1), ground(...SITE.origin) + .035, SITE.origin[1]], routePoint(1.3, 0, ground(...(p => [p.x, p.z] as XZ)(dining76EastPoint(1.3))) + .035)], sidewallComponents: ['dining76-east-brown-sidewall'], lowerOpeningPurposeConfirmed: false, actualThroughPassageObserved: false });
  shell.userData.eastAccess = shell.userData.dining76EastAccess;
  function maskMappedArea(vertices: number[], areaId: string) {
    const bounds = (p: XYZ[]) => ({ x0: Math.min(...p.map(v => v[0])), x1: Math.max(...p.map(v => v[0])), z0: Math.min(...p.map(v => v[2])), z1: Math.max(...p.map(v => v[2])) });
    const area = (p: XYZ[]) => Math.abs(p.reduce((sum, a, i) => { const b = p[(i + 1) % p.length]; return sum + a[0] * b[2] - b[0] * a[2]; }, 0));
    const region = { x0: 647, x1: 698, z0: -664, z1: -615 };
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < vertices.length; i += 3) { x0 = Math.min(x0, vertices[i]); x1 = Math.max(x1, vertices[i]); z0 = Math.min(z0, vertices[i + 2]); z1 = Math.max(z1, vertices[i + 2]); }
    if (x1 < region.x0 || x0 > region.x1 || z1 < region.z0 || z0 > region.z1) return;
    const masks = pavementMasks.map(m => { const p = m.polygon.map(v => [v[0], 0, v[1]] as XYZ); return { points: p, bounds: bounds(p), sign: Math.sign(p.reduce((sum, a, i) => { const b = p[(i + 1) % p.length]; return sum + a[0] * b[2] - b[0] * a[2]; }, 0)) }; });
    const overlaps = (a: ReturnType<typeof bounds>, b: ReturnType<typeof bounds>) => a.x1 >= b.x0 && a.x0 <= b.x1 && a.z1 >= b.z0 && a.z0 <= b.z1;
    const output: number[] = []; let touched = 0;
    for (let i = 0; i < vertices.length; i += 9) {
      const original = [vertices.slice(i, i + 3), vertices.slice(i + 3, i + 6), vertices.slice(i + 6, i + 9)] as XYZ[], box = bounds(original);
      if (!overlaps(box, region)) { output.push(...vertices.slice(i, i + 9)); continue; }
      const candidates = masks.filter(m => overlaps(box, m.bounds));
      if (!candidates.length) { output.push(...vertices.slice(i, i + 9)); continue; }
      let pieces = [original], changed = false;
      for (const mask of candidates) pieces = pieces.flatMap(piece => {
        const lines = mask.points.map((a, j) => { const b = mask.points[(j + 1) % mask.points.length]; return (p: XYZ) => mask.sign * ((b[0] - a[0]) * (p[2] - a[2]) - (b[2] - a[2]) * (p[0] - a[0])); });
        const intersection = lines.reduce((p, line) => clip(p, line), piece); if (intersection.length < 3 || area(intersection) < 1e-8) return [piece];
        changed = true; let rest = piece; const outside: XYZ[][] = [];
        for (const line of lines) { const p = clip(rest, v => -line(v)); if (p.length >= 3 && area(p) > 1e-8) outside.push(p); rest = clip(rest, line); if (rest.length < 3) break; } return outside;
      });
      if (changed) touched++;
      for (const p of pieces) for (let j = 1; j + 1 < p.length; j++) if (area([p[0], p[j], p[j + 1]]) > 1e-8) output.push(...p[0], ...p[j], ...p[j + 1]);
    }
    if (touched) { (shell.userData.eastAccess.maskedAreaOverlays ??= []).push({ areaId, beforeTriangles: vertices.length / 9, afterTriangles: output.length / 9, touchedTriangles: touched, onlyActualPavementFootprints: true, originalTerrainAndAreaDataPreserved: true }); vertices.length = 0; for (const v of output) vertices.push(v); }
  }
  function update(_player: THREE.Vector3) {
    const moved = new Set<Bucket>(), recolored = new Set<Bucket>();
    for (const p of parts) { if (p.shown !== p.proxy.visible) { p.shown = p.proxy.visible; for (const r of p.ranges) { if (r.start === r.end) continue; const a = r.bucket.geometry!.getAttribute('position'); if (p.shown) (a.array as Float32Array).set(r.original, r.start); else for (let j = r.start; j < r.end; j += 3) { a.array[j] = p.proxy.position.x; a.array[j + 1] = p.proxy.position.y; a.array[j + 2] = p.proxy.position.z; } moved.add(r.bucket); } } const tint = p.proxy.material.color, hex = tint.getHex(); if (p.color !== hex) { p.color = hex; for (const r of p.ranges) { const a = r.bucket.geometry!.getAttribute('color'); for (let j = r.start; j < r.end; j += 3) { a.array[j] = hex === p.base ? r.bucket.colors[j] : tint.r; a.array[j + 1] = hex === p.base ? r.bucket.colors[j + 1] : tint.g; a.array[j + 2] = hex === p.base ? r.bucket.colors[j + 2] : tint.b; } recolored.add(r.bucket); } } }
    for (const b of moved) b.geometry!.getAttribute('position').needsUpdate = true; for (const b of recolored) b.geometry!.getAttribute('color').needsUpdate = true; shell.visible = parts.some(p => p.proxy.visible);
  }
  return { shell, breakables, update, layout, maskMappedArea };
}
