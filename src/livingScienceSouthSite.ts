import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';

type Point = [number, number];
type Surface = { positions: number[]; colors: number[]; uv: number[]; geometry?: THREE.BufferGeometry };
type Part = { proxy: THREE.Mesh; surface: Surface; start: number; original: Float32Array; colors: Float32Array; shown: boolean; lastColor: number; baseColor: number };

/** 2026년 8월 거리뷰에서 확인한 낮은 벽과 보도다. 원본 작은 건물의 용도나 정확한 경계로 해석하지 않는다. */
export function createLivingScienceSouthSite(scene: THREE.Scene, heightAt: (x: number, z: number) => number) {
  const origin = new THREE.Vector3(439.05, 0, -254.28), axis = new THREE.Vector3(16.59, 0, -25.31).normalize();
  const across = new THREE.Vector3(-axis.z, 0, axis.x), up = new THREE.Vector3(0, 1, 0);
  const point = (s: number, n: number, y = 0) => origin.clone().addScaledVector(axis, s).addScaledVector(across, n).setY(y);
  const ground = (s: number, n: number) => { const p = point(s, n); return heightAt(p.x, p.z); };
  const shell = new THREE.Group(); shell.name = 'facilities/living-science-south-site'; scene.add(shell);
  const solid: Surface = { positions: [], colors: [], uv: [] }, metal: Surface = { positions: [], colors: [], uv: [] };
  const parts: Part[] = [], breakables: BreakableSpec[] = [];
  const extent: Point[] = [[3.5, 3], [26, 3], [26, 11.3], [3.5, 11.3]].map(([s, n]) => { const p = point(s, n); return [p.x, p.z]; });
  const terrain = scene.getObjectByName('campus-terrain') as THREE.Mesh | undefined;
  const terrainTriangles: number[][] = [];
  if (terrain) {
    const p = terrain.geometry.getAttribute('position'), index = terrain.geometry.index;
    const minX = Math.min(...extent.map(p => p[0])) - 2, maxX = Math.max(...extent.map(p => p[0])) + 2;
    const minZ = Math.min(...extent.map(p => p[1])) - 2, maxZ = Math.max(...extent.map(p => p[1])) + 2;
    for (let i = 0; i < (index?.count ?? p.count); i += 3) {
      const t = [0, 1, 2].flatMap(j => { const k = index ? index.getX(i + j) : i + j; return [p.getX(k), p.getY(k), p.getZ(k)]; });
      if (Math.max(t[0], t[3], t[6]) >= minX && Math.min(t[0], t[3], t[6]) <= maxX && Math.max(t[2], t[5], t[8]) >= minZ && Math.min(t[2], t[5], t[8]) <= maxZ) terrainTriangles.push(t);
    }
  }
  function add(name: string, geometry: THREE.BufferGeometry, color: number, kind: BreakableSpec['material'] = 'stone', extra: Record<string, unknown> = {}, decorative: { geometry: THREE.BufferGeometry; color: number }[] = [], paving = false) {
    const surface = kind === 'metal' ? metal : solid, start = surface.positions.length, tint = new THREE.Color(color);
    const g = geometry.index ? geometry.toNonIndexed() : geometry, p = g.getAttribute('position');
    g.computeBoundingBox(); const center = g.boundingBox!.getCenter(new THREE.Vector3()), size = g.boundingBox!.getSize(new THREE.Vector3());
    const local = Float32Array.from(p.array); for (let i = 0; i < local.length; i += 3) { local[i] -= center.x; local[i + 1] -= center.y; local[i + 2] -= center.z; }
    const proxyGeometry = new THREE.BufferGeometry(); proxyGeometry.setAttribute('position', new THREE.BufferAttribute(local, 3)); proxyGeometry.computeVertexNormals();
    const proxy = new THREE.Mesh(proxyGeometry, new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide })); proxy.position.copy(center); proxy.updateMatrixWorld(true);
    Object.assign(proxy.userData, { facilityId: shell.name, landmark: 'living-science-south-site', component: name, renderProxy: true, coordinatesEstimated: true, dimensionsEstimated: true, ...extra });
    function append(input: THREE.BufferGeometry, shade: THREE.Color, textured: boolean) {
      const geo = input.index ? input.toNonIndexed() : input, pos = geo.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), dx = x - origin.x, dz = z - origin.z;
        surface.positions.push(x, y, z); surface.colors.push(shade.r, shade.g, shade.b);
        surface.uv.push(textured ? (dx * axis.x + dz * axis.z) / 1.6 : .15, textured ? (dx * across.x + dz * across.z) / 1.2 : .15);
      }
      if (geo !== input) geo.dispose();
    }
    append(g, tint, paving); for (const d of decorative) { append(d.geometry, new THREE.Color(d.color), false); d.geometry.dispose(); }
    parts.push({ proxy, surface, start, original: Float32Array.from(surface.positions.slice(start)), colors: Float32Array.from(surface.colors.slice(start)), shown: true, lastColor: tint.getHex(), baseColor: tint.getHex() });
    breakables.push({ mesh: proxy, size, collisionVertices: local.slice(), toughness: kind === 'metal' ? 5 : kind === 'wood' ? 4 : 11, material: kind, label: kind === 'metal' ? '생활과학대학 남쪽 난간과 시설' : kind === 'wood' ? '생활과학대학 남쪽 식재' : '생활과학대학 남쪽 낮은 벽과 보도' });
    g.dispose(); if (g !== geometry) geometry.dispose();
  }
  function boxGeometry(s: number, n: number, y: number, length: number, depth: number, height: number) {
    const p = point(s, n, y), basis = new THREE.Matrix4().makeBasis(axis, up, across);
    return new THREE.BoxGeometry(length, height, depth).applyMatrix4(basis).translate(p.x, p.y, p.z);
  }
  function beam(name: string, a: THREE.Vector3, b: THREE.Vector3, radius: number, color = 0xb9c3bd) {
    const d = b.clone().sub(a), center = a.clone().add(b).multiplyScalar(.5);
    add(name, new THREE.CylinderGeometry(radius, radius, d.length(), 6).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, d.normalize())).translate(center.x, center.y, center.z), color, 'metal');
  }
  function clip(input: number[][], polygon: Point[]) {
    let result = input;
    const sign = Math.sign(polygon.reduce((a, p, i) => { const q = polygon[(i + 1) % polygon.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0));
    for (let e = 0; e < polygon.length && result.length; e++) {
      const a = polygon[e], b = polygon[(e + 1) % polygon.length], next: number[][] = [];
      const distance = (p: number[]) => sign * ((b[0] - a[0]) * (p[2] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
      for (let i = 0; i < result.length; i++) { const p = result[i], q = result[(i + 1) % result.length], dp = distance(p), dq = distance(q); if (dp >= -1e-8) next.push(p); if ((dp >= -1e-8) !== (dq >= -1e-8)) { const t = dp / (dp - dq); next.push(p.map((v, k) => v + (q[k] - v) * t)); } }
      result = next;
    }
    return result;
  }
  const floorTriangles: number[][] = [], floorBounds: { component: string; polygon: Point[] }[] = [];
  function paving(polygon: Point[], component: string) {
    floorBounds.push({ component, polygon });
    const sources = terrainTriangles.length ? terrainTriangles : polygon.slice(1, -1).map((p, i) => [polygon[0], p, polygon[i + 2]].flatMap(([x, z]) => [x, heightAt(x, z) - .03, z]));
    for (const triangle of sources) {
      const piece = clip([triangle.slice(0, 3), triangle.slice(3, 6), triangle.slice(6, 9)], polygon);
      for (let i = 1; i < piece.length - 1; i++) {
        const top = [piece[0], piece[i], piece[i + 1]].map(p => new THREE.Vector3(p[0], p[1] + .19, p[2]));
        if (new THREE.Vector3().subVectors(top[1], top[0]).cross(new THREE.Vector3().subVectors(top[2], top[0])).length() < .00001) continue;
        floorTriangles.push(top.flatMap(p => p.toArray()));
        add(component, new ConvexGeometry([...top, ...top.map(p => p.clone().addScaledVector(up, -.14))]), 0xb1b3a8, 'stone', { paving: true, exactTerrainSurface: !!terrainTriangles.length }, [], true);
      }
    }
  }
  const planar = (s: number, n: number): Point => { const p = point(s, n); return [p.x, p.z]; };
  for (let s = 3.5; s < 23; s += 2) paving([planar(s, 3), planar(Math.min(s + 2, 23), 3), planar(Math.min(s + 2, 23), 4.7), planar(s, 4.7)], 'gray-sidewalk');
  // 남동 끝은 기존 /210 보행로에만 잇는다. 220동 벽에 새 출입구를 만들지 않는다.
  const end = point(23, 3.85), existingPath = new THREE.Vector3(460.54, 0, -269.78), connectionLength = end.distanceTo(existingPath), connectionAxis = existingPath.clone().sub(end).normalize(), connectionSide = new THREE.Vector3(-connectionAxis.z, 0, connectionAxis.x);
  for (let s = 0; s < connectionLength; s += 1.5) {
    const a = end.clone().addScaledVector(connectionAxis, s), b = end.clone().addScaledVector(connectionAxis, Math.min(s + 1.5, connectionLength));
    const vertices = [a.clone().addScaledVector(connectionSide, -.7), b.clone().addScaledVector(connectionSide, -.7), b.clone().addScaledVector(connectionSide, .7), a.clone().addScaledVector(connectionSide, .7)];
    paving(vertices.map(p => [p.x, p.z]), 'east-path-connection');
  }
  // 낮은 벽 두 단과 그 사이 식재 띠를 사진 비례로 나눈다. 벽 뒤 용도나 지하층은 지정하지 않는다.
  const wallSections: Record<string, unknown>[] = [];
  for (let s = 5.4, index = 0; s < 20.8 - .01; s += 2.2, index++) {
    const b = Math.min(s + 2.2, 20.8), m = (s + b) / 2, y0 = ground(s, 5.6), y1 = ground(b, 5.6);
    const front = [point(s, 5.43, y0 - .22), point(b, 5.43, y1 - .22), point(s, 5.43, y0 + 2), point(b, 5.43, y1 + 2)];
    const back = front.map(p => p.clone().addScaledVector(across, .34));
    add('lower-retaining-wall', new ConvexGeometry([...front, ...back]), index % 3 ? 0xb1b1a5 : 0xa8aaa0, 'stone', { section: index, heightAboveGround: 2 });
    const upper0 = Math.max(ground(s, 7), y0 + 1.65), upper1 = Math.max(ground(b, 7), y1 + 1.65);
    const upper = [point(s, 6.83, upper0 - .2), point(b, 6.83, upper1 - .2), point(s, 6.83, upper0 + 1.1), point(b, 6.83, upper1 + 1.1)];
    add('upper-retaining-wall', new ConvexGeometry([...upper, ...upper.map(p => p.clone().addScaledVector(across, .34))]), 0xafb1a4, 'stone', { section: index, heightAboveLocalBase: 1.1 });
    for (const [n0, n1, ys, ye] of [[5.77, 6.83, y0 + 1.88, y1 + 1.88], [7.17, 9.8, upper0 + .98, upper1 + .98]]) {
      const top = [point(s, n0, ys), point(b, n0, ye), point(b, n1, ye), point(s, n1, ys)];
      for (const ids of [[0, 1, 2], [0, 2, 3]]) add('planted-bank-bed', new ConvexGeometry([...ids.map(i => top[i]), ...ids.map(i => top[i].clone().setY(heightAt(top[i].x, top[i].z) - .1))]), 0x64734e, 'stone', { section: index, filledToTerrain: true });
    }
    wallSections.push({ s0: s, s1: b, lowerGround: [y0, y1], lowerTop: [y0 + 2, y1 + 2], upperTop: [upper0 + 1.1, upper1 + 1.1] });
  }
  for (const s of [8.1, 15.4]) {
    const y = ground(s, 5.6) + 1.03, ribs: { geometry: THREE.BufferGeometry; color: number }[] = [];
    for (let row = 0; row < 12; row++) ribs.push({ geometry: boxGeometry(s, 5.395, y - .58 + row * .105, 2.72, .035, .035), color: 0x757f78 });
    for (const side of [-1, 1]) ribs.push({ geometry: boxGeometry(s + side * 1.38, 5.38, y, .05, .05, 1.3), color: 0x858e85 });
    add('vent-grille-panel', boxGeometry(s, 5.41, y, 2.8, .045, 1.32), 0x3b4542, 'metal', { purposeUnconfirmed: true, panelWidthEstimated: 2.8, panelHeightEstimated: 1.32 }, ribs);
  }
  // 은색 난간의 둥근 세로 장식은 부재별로 충돌한다. 양 끝 보도 진입부를 열어 둔다.
  const railN = 3.12, railStart = 6, railEnd = 20.8, railCount = Math.ceil((railEnd - railStart) / 1.85);
  const railPosts = Array.from({ length: railCount + 1 }, (_, i) => { const s = THREE.MathUtils.lerp(railStart, railEnd, i / railCount); return { s, y: ground(s, railN) + .17 }; });
  for (const p of railPosts) beam('silver-railing-post', point(p.s, railN, p.y), point(p.s, railN, p.y + 1.04), .035);
  for (let i = 0; i < railCount; i++) {
    const a = railPosts[i], b = railPosts[i + 1];
    for (const h of [.17, .94, 1.04]) beam('silver-railing-horizontal', point(a.s, railN, a.y + h), point(b.s, railN, b.y + h), .025);
    for (let j = 0; j < 3; j++) {
      const s = THREE.MathUtils.lerp(a.s, b.s, (j + .5) / 3), y = THREE.MathUtils.lerp(a.y, b.y, (j + .5) / 3), radius = .16;
      const loop = Array.from({ length: 9 }, (_, k) => point(s + Math.cos(Math.PI * k / 8) * radius, railN, y + .74 + Math.sin(Math.PI * k / 8) * radius));
      for (let k = 0; k < loop.length - 1; k++) beam('silver-railing-loop', loop[k], loop[k + 1], .012);
      for (const side of [-1, 1]) beam('silver-railing-loop-leg', point(s + side * radius, railN, y + .18), point(s + side * radius, railN, y + .74), .012);
    }
  }
  const lamp = { s: 17.7, n: 4.92, height: 3.65 }, lampBase = ground(lamp.s, lamp.n);
  beam('roadside-lamp-post', point(lamp.s, lamp.n, lampBase), point(lamp.s, lamp.n, lampBase + lamp.height), .055, 0x414d47);
  const lampPoint = point(lamp.s, lamp.n, lampBase + lamp.height);
  add('roadside-lamp-cap', new THREE.CylinderGeometry(.42, .16, .17, 10).translate(lampPoint.x, lampPoint.y, lampPoint.z), 0x737d74, 'metal');
  add('roadside-lamp-diffuser', new THREE.CylinderGeometry(.25, .15, .23, 8).translate(lampPoint.x, lampPoint.y - .18, lampPoint.z), 0xc9d2ba, 'metal');
  const trees = [[7.7, 8.55, 3.8], [12.7, 9.15, 4.3], [18.1, 9.0, 3.7]];
  for (const [s, n, h] of trees) {
    const p = point(s, n), y = Math.max(ground(s, 7), ground(s, 5.6) + 1.65) + .98;
    const trunk = new THREE.CylinderGeometry(.08, .12, h * .7, 6).translate(p.x, y + h * .35, p.z);
    add('tree-trunk', trunk, 0x6d6851, 'wood', { speciesAndCountEstimated: true });
    const crownPositions: number[] = [];
    for (const [ds, dn, dy, radius] of [[0, 0, 0, 1.15], [-.68, .1, -.4, .93], [.65, -.15, -.22, 1.02], [.12, .35, .68, .82]]) {
      const c = point(s + ds, n + dn, y + h - .85 + dy), g = new THREE.IcosahedronGeometry(radius, 1).scale(1, .96, 1).translate(c.x, c.y, c.z);
      crownPositions.push(...g.getAttribute('position').array); g.dispose();
    }
    const crown = new THREE.BufferGeometry(); crown.setAttribute('position', new THREE.Float32BufferAttribute(crownPositions, 3)); crown.computeVertexNormals();
    add('tree-crown', crown, 0x526f41, 'wood', { speciesAndCountEstimated: true, overlappingCrownClusters: 4 });
  }
  for (const s of [6.5, 9.3, 12.1, 14.9, 17.7, 19.8]) {
    const p = point(s, 6.25), y = ground(s, 5.6) + 2.08;
    add('low-bank-shrub', new THREE.IcosahedronGeometry(1, 1).scale(.67, .42, .49).translate(p.x, y, p.z), 0x637e48, 'wood', { speciesAndCountEstimated: true });
  }
  const size = 128, pixels = new Uint8Array(size * size * 4);
  const blockGrays = [255, 213, 238, 174, 225, 192, 247, 216, 180, 235, 204, 249, 227, 168, 240, 208];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const row = Math.floor(y / 32), xx = (x + (row % 2) * 16) % size, column = Math.floor(xx / 32), joint = y % 32 < 1 || xx % 32 < 1, block = row * 4 + column, value = joint ? 145 : block === 0 ? 255 : Math.min(255, blockGrays[block] + ((x * 17 + y * 29) % 5) - 2), i = (y * size + x) * 4; pixels.set([value, value, value, 255], i); }
  const texture = new THREE.DataTexture(pixels, size, size); texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true; texture.needsUpdate = true;
  for (const [surface, name] of [[solid, 'low-walls-paving-and-planting'], [metal, 'railings-grilles-and-lamp']] as const) {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(surface.positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(surface.colors, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(surface.uv, 2));
    (geometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage); (geometry.getAttribute('color') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage); geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); surface.geometry = geometry;
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: surface === metal ? .42 : .9, metalness: surface === metal ? .38 : 0, map: texture })); mesh.name = `living-science-south-${name}`; mesh.receiveShadow = true; shell.add(mesh);
  }
  const surfaceAt = (x: number, z: number) => {
    let y = heightAt(x, z);
    for (const t of floorTriangles) { const d = (t[3] - t[0]) * (t[8] - t[2]) - (t[5] - t[2]) * (t[6] - t[0]); if (Math.abs(d) < 1e-9) continue; const u = ((x - t[0]) * (t[8] - t[2]) - (z - t[2]) * (t[6] - t[0])) / d, v = ((t[3] - t[0]) * (z - t[2]) - (t[5] - t[2]) * (x - t[0])) / d; if (u >= -1e-6 && v >= -1e-6 && u + v <= 1.000001) y = Math.max(y, t[1] + u * (t[4] - t[1]) + v * (t[7] - t[1])); }
    return y;
  };
  const routePoint = (p: THREE.Vector3) => ({ x: p.x, y: surfaceAt(p.x, p.z), z: p.z });
  const route = [new THREE.Vector3(439.905, 0, -252.472), point(2.2, 2), point(4.8, 3.85), point(9, 3.85), point(15, 3.85), point(21, 3.85), end, existingPath].map(routePoint);
  Object.assign(shell.userData, { role: 'observed-ground-only', facilityId: shell.name, landmark: 'living-science-south-site', sourceBuildingIdUnresolved: 'way/455025059', replacesGenericBuildingVolume: false,
    origin: origin.toArray(), axis: axis.toArray(), across: across.toArray(), coordinates: 'D=(east,up,north); parent H applies once.', coordinatesEstimated: true, dimensionsEstimated: true, undergroundUseConfirmed: false, sourceCaptureDate: '2026-08', sourceNotes: 'sources/living-science-adjacent-roadview-review.json',
    sourceImages: ['30-adjacent-oblique-ui.jpg', '30-sky2025-gap-close-ui.jpg', '29-222-threshold-detail-ui.jpg'], terrainChanged: false, rawOutlineChanged: false, roadChanged: false,
    sidewalk: { s: [3.5, 23], n: [3, 4.7], approximateBlockSize: [.4, .3], actualTerrainOffset: .19, bottomDepth: .14 }, floorBounds, wallSections, rail: { s: [railStart, railEnd], n: railN, height: 1.04, roundedLoops: true }, lamp, trees,
    routes: [{ id: 'passage-to-east-footway', routeWorld: route, sourceRoads: ['way/1185265108/524', 'way/455018306/208', 'way/455020727/210'], startUsesExistingGround: true }], routeWorld: route,
    parts: parts.length, triangles: (solid.positions.length + metal.positions.length) / 9, renderMeshes: 2, textureCount: 1, limitations: ['사진의 낮은 시설을 원본 작은 건물과 동일하다고 확정하지 않았다.', '보도와 벽의 치수, 식재 개수와 수종은 게임용 근사다.', '220동 출입문과 높은 보행면까지의 연결은 새로 만들지 않았다.'] });
  function update(_player: THREE.Vector3) {
    const changed = new Set<Surface>(), recolored = new Set<Surface>();
    for (const part of parts) {
      const position = part.surface.geometry!.getAttribute('position') as THREE.BufferAttribute, color = part.surface.geometry!.getAttribute('color') as THREE.BufferAttribute;
      if (part.shown !== part.proxy.visible) {
        if (!changed.has(part.surface)) position.clearUpdateRanges(); changed.add(part.surface); part.shown = part.proxy.visible;
        if (part.shown) (position.array as Float32Array).set(part.original, part.start);
        else for (let i = 0; i < part.original.length; i += 3) { position.array[part.start + i] = part.proxy.position.x; position.array[part.start + i + 1] = part.proxy.position.y; position.array[part.start + i + 2] = part.proxy.position.z; }
        position.addUpdateRange(part.start, part.original.length);
      }
      const tint = (part.proxy.material as THREE.MeshStandardMaterial).color, hex = tint.getHex();
      if (hex !== part.lastColor) {
        part.lastColor = hex; if (!recolored.has(part.surface)) color.clearUpdateRanges(); recolored.add(part.surface);
        if (hex === part.baseColor) (color.array as Float32Array).set(part.colors, part.start);
        else for (let i = 0; i < part.colors.length; i += 3) { color.array[part.start + i] = tint.r; color.array[part.start + i + 1] = tint.g; color.array[part.start + i + 2] = tint.b; }
        color.addUpdateRange(part.start, part.colors.length);
      }
    }
    for (const s of changed) s.geometry!.getAttribute('position').needsUpdate = true;
    for (const s of recolored) s.geometry!.getAttribute('color').needsUpdate = true;
    shell.visible = parts.some(p => p.proxy.visible);
  }
  return { shell, breakables, update };
}
