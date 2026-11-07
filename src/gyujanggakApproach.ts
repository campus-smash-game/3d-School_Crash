import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { gyujanggakDatum } from './gyujanggakLandmark';
import type { BreakableSpec } from './scene';

type Point = [number, number];
type Part = { proxy: THREE.Mesh; surface: Surface; start: number; original: Float32Array; shown: boolean };
type Surface = { positions: number[]; colors: number[]; uv: number[]; geometry?: THREE.BufferGeometry };
const up = new THREE.Vector3(0, 1, 0);

/** 2026년 8월 로드뷰의 규장각 현관 앞마당과 동쪽 보도. 좌표와 치수는 지도에 맞춘 근사다. */
export function createGyujanggakApproach(scene: THREE.Scene, heightAt: (x: number, z: number) => number) {
  const existing = scene.getObjectByName('facilities/gyujanggak-approach');
  if (existing) throw Error('Gyujanggak approach was already added.');
  const datum = gyujanggakDatum(heightAt), entry = datum.entrance;
  const axis = new THREE.Vector3(entry.tangent.x, 0, entry.tangent.z), outward = new THREE.Vector3(entry.outward.x, 0, entry.outward.z);
  const origin = new THREE.Vector3(entry.center.x, 0, entry.center.z);
  const at = (s: number, n: number, h = 0) => { const p = origin.clone().addScaledVector(axis, s).addScaledVector(outward, n); return p.setY(heightAt(p.x, p.z) + h); };
  const orient = new THREE.Quaternion().setFromAxisAngle(up, -Math.atan2(axis.z, axis.x));
  const roadStart = new THREE.Vector3(195.45, 0, -413.29), roadEnd = new THREE.Vector3(211.94, 0, -439.57);
  const roadAxis = roadEnd.clone().sub(roadStart).normalize(), roadInward = new THREE.Vector3(roadAxis.z, 0, -roadAxis.x);
  const roadAt = (s: number, n: number, h = 0) => { const p = roadStart.clone().addScaledVector(roadAxis, s).addScaledVector(roadInward, n); return p.setY(heightAt(p.x, p.z) + h); };
  const shell = new THREE.Group(); shell.name = 'facilities/gyujanggak-approach'; scene.add(shell);
  const solid: Surface = { positions: [], colors: [], uv: [] }, signs: Surface = { positions: [], colors: [], uv: [] };
  const parts: Part[] = [], breakables: BreakableSpec[] = [];
  const point = (p: THREE.Vector3): Point => [p.x, p.z];
  function halfPlane(poly: number[][], distance: (p: number[]) => number) {
    const next: number[][] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], da = distance(a), db = distance(b);
      if (da >= -1e-8) next.push(a);
      if ((da >= -1e-8) !== (db >= -1e-8)) { const t = da / (da - db); next.push(a.map((v, k) => v + (b[k] - v) * t)); }
    }
    return next;
  }
  const signedArea = (poly: number[][], z = 1) => poly.reduce((sum, p, i) => { const q = poly[(i + 1) % poly.length]; return sum + p[0] * q[z] - q[0] * p[z]; }, 0);
  const planes = (polygon: Point[]) => {
    const sign = Math.sign(signedArea(polygon));
    return polygon.map((a, i) => { const b = polygon[(i + 1) % polygon.length]; return (p: number[]) => sign * ((b[0] - a[0]) * (p[2] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])); });
  };
  function clip(poly: number[][], polygon: Point[]) { for (const distance of planes(polygon)) poly = halfPlane(poly, distance); return poly; }
  // 마당은 북쪽과 동쪽 차도 중심선에서 3.05m 이상 떨어진 범위에만 둔다.
  let court = [[-13, 2], [6, 2], [6, 30], [-13, 30]].map(([s, n]) => { const p = at(s, n); return [p.x, 0, p.z]; });
  court = halfPlane(court, p => (p[0] - roadStart.x) * roadInward.x + (p[2] - roadStart.z) * roadInward.z - 3.05);
  const northA = new THREE.Vector3(172.89, 0, -408.67), northB = roadStart, northAxis = northB.clone().sub(northA).normalize();
  const northInward = new THREE.Vector3(northAxis.z, 0, -northAxis.x);
  court = halfPlane(court, p => (p[0] - northA.x) * northInward.x + (p[2] - northA.z) * northInward.z - 3.05);
  const northWest = new THREE.Vector3(139.21, 0, -408.20), northWestAxis = northA.clone().sub(northWest).normalize(), northWestInward = new THREE.Vector3(northWestAxis.z, 0, -northWestAxis.x);
  court = halfPlane(court, p => (p[0] - northWest.x) * northWestInward.x + (p[2] - northWest.z) * northWestInward.z - 3.05);
  const courtPolygon = court.map(p => [p[0], p[2]] as Point);
  const sidewalkPolygon = [roadAt(6, 3.05), roadAt(30, 3.05), roadAt(30, 5.45), roadAt(6, 5.45)].map(point);
  const linkPolygon = [at(5.8, 24), at(5.8, 28), roadAt(6, 3.05), roadAt(6, 5.45)].map(point);
  // 겹친 마당과 보도는 겹침 면을 제거해 같은 높이의 포장 두 장이 깜박이지 않게 한다.
  function subtract(poly: number[][], polygon: Point[]) {
    const kept: number[][][] = []; let remaining = poly;
    for (const distance of planes(polygon)) { const outside = halfPlane(remaining, p => -distance(p)); if (outside.length >= 3 && Math.abs(signedArea(outside, 2)) > 1e-8) kept.push(outside); remaining = halfPlane(remaining, distance); if (remaining.length < 3) break; }
    return kept;
  }
  const terrain = scene.getObjectByName('campus-terrain') as THREE.Mesh;
  if (!terrain) throw Error('Gyujanggak approach requires the actual campus terrain.');
  const ground: Surface = { positions: [], colors: [], uv: [] };
  const polygons = [courtPolygon, sidewalkPolygon, linkPolygon];
  const terrainPosition = terrain.geometry.getAttribute('position'), terrainIndex = terrain.geometry.index;
  const localTerrain: number[][][] = [];
  for (let i = 0; i < (terrainIndex?.count ?? terrainPosition.count); i += 3) {
    const triangle = [0, 1, 2].map(j => { const k = terrainIndex ? terrainIndex.getX(i + j) : i + j; return [terrainPosition.getX(k), terrainPosition.getY(k), terrainPosition.getZ(k)]; });
    if (Math.max(...triangle.map(p => p[0])) >= 145 && Math.min(...triangle.map(p => p[0])) <= 217 && Math.max(...triangle.map(p => p[2])) >= -445 && Math.min(...triangle.map(p => p[2])) <= -403) localTerrain.push(triangle);
  }
  const terrainHeight = (x: number, z: number) => {
    for (const [a, b, c] of localTerrain) {
      const d = (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]);
      if (Math.abs(d) < 1e-9) continue;
      const u = ((x - a[0]) * (c[2] - a[2]) - (z - a[2]) * (c[0] - a[0])) / d, v = ((b[0] - a[0]) * (z - a[2]) - (b[2] - a[2]) * (x - a[0])) / d;
      if (u >= -1e-6 && v >= -1e-6 && u + v <= 1.000001) return a[1] + u * (b[1] - a[1]) + v * (c[1] - a[1]);
    }
    return heightAt(x, z) - .03;
  };
  const distanceToPaving = (p: number[]) => Math.min(...polygons.flatMap(poly => poly.map((a, i) => { const b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dz = b[1] - a[1], t = THREE.MathUtils.clamp(((p[0] - a[0]) * dx + (p[2] - a[1]) * dz) / (dx * dx + dz * dz), 0, 1); return Math.hypot(p[0] - a[0] - t * dx, p[2] - a[1] - t * dz); })));
  const normalizedSurfaces: { name: string; removedTriangles: number }[] = [];
  // 이 구역의 기존 보행로 표시만 잘라 지형과 포장이 일치하게 한다. 차도와 지형은 보존한다.
  for (const mesh of scene.children.filter((o): o is THREE.Mesh => o instanceof THREE.Mesh && (o.name === 'campus-pedestrian-surface' || o.userData.role === 'mapped-area'))) {
    const geometry = mesh.geometry, pos = geometry.getAttribute('position'), index = geometry.index;
    const fields = Object.keys(geometry.attributes).filter(k => k !== 'normal').sort((a, b) => a === 'position' ? -1 : b === 'position' ? 1 : a.localeCompare(b)).map(key => ({ key, attribute: geometry.getAttribute(key), values: [] as number[] }));
    let removedTriangles = 0;
    for (let i = 0; i < (index?.count ?? pos.count); i += 3) {
      const triangle = [0, 1, 2].map(j => { const k = index ? index.getX(i + j) : i + j; return fields.flatMap(f => Array.from({ length: f.attribute.itemSize }, (_, c) => f.attribute.array[k * f.attribute.itemSize + c])); });
      let pieces = [triangle], touched = false;
      for (const polygon of polygons) { const next: number[][][] = []; for (const piece of pieces) { const inside = clip(piece, polygon); if (inside.length >= 3 && Math.abs(signedArea(inside, 2)) > 1e-8) { touched = true; next.push(...subtract(piece, polygon)); } else next.push(piece); } pieces = next; }
      if (touched) removedTriangles++;
      function append(triangle: number[][], depth = 0) {
        const distances = triangle.map(distanceToPaving), lengths = triangle.map((a, i) => { const b = triangle[(i + 1) % 3]; return Math.hypot(a[0] - b[0], a[2] - b[2]); });
        if (Math.min(...distances) < .85 && Math.max(...lengths) > .4 && depth < 9) {
          const [a, b, c] = triangle, ab = a.map((v, k) => (v + b[k]) / 2), bc = b.map((v, k) => (v + c[k]) / 2), ca = c.map((v, k) => (v + a[k]) / 2);
          for (const t of [[a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]]) append(t, depth + 1); return;
        }
        for (let i = 0; i < triangle.length; i++) { const vertex = triangle[i].slice(), weight = 1 - THREE.MathUtils.smoothstep(distances[i], 0, .8);
          if (weight > 0) vertex[1] = THREE.MathUtils.lerp(vertex[1], terrainHeight(vertex[0], vertex[2]) + .035, weight);
          let offset = 0; for (const f of fields) { for (let k = 0; k < f.attribute.itemSize; k++) f.values.push(vertex[offset + k]); offset += f.attribute.itemSize; }
        }
      }
      for (const piece of pieces) for (let j = 1; j + 1 < piece.length; j++) append([piece[0], piece[j], piece[j + 1]]);
    }
    if (removedTriangles) { const replacement = new THREE.BufferGeometry(); for (const f of fields) replacement.setAttribute(f.key, new THREE.Float32BufferAttribute(f.values, f.attribute.itemSize)); replacement.computeVertexNormals(); replacement.computeBoundingBox(); replacement.computeBoundingSphere(); mesh.geometry = replacement; geometry.dispose(); normalizedSurfaces.push({ name: mesh.name, removedTriangles }); }
  }
  const p = terrain.geometry.getAttribute('position'), index = terrain.geometry.index;
  for (let i = 0; i < (index?.count ?? p.count); i += 3) {
    const triangle = [0, 1, 2].map(j => { const k = index ? index.getX(i + j) : i + j; return [p.getX(k), p.getY(k), p.getZ(k)]; });
    for (let region = 0; region < polygons.length; region++) {
      const clipped = clip(triangle, polygons[region]);
      let pieces = [clipped]; for (let previous = 0; previous < region; previous++) pieces = pieces.flatMap(poly => subtract(poly, polygons[previous]));
      for (const poly of pieces) for (let j = 1; j + 1 < poly.length; j++) {
        if (Math.abs(signedArea([poly[0], poly[j], poly[j + 1]], 2)) < 1e-8) continue;
        for (const vertex of [poly[0], poly[j], poly[j + 1]]) {
          ground.positions.push(vertex[0], vertex[1] + .035, vertex[2]); ground.colors.push(...(region === 0 ? [1, 1, 1] : [.91, .84, .67]));
          const dx = vertex[0] - origin.x, dz = vertex[2] - origin.z; ground.uv.push((dx * axis.x + dz * axis.z) / 3.2, (dx * outward.x + dz * outward.z) / 3.2);
        }
      }
    }
  }
  function add(name: string, geometry: THREE.BufferGeometry, color: number, kind: BreakableSpec['material'] = 'stone', owner?: THREE.Mesh, surface = solid, uv?: [number, number, number, number]) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry, pos = g.getAttribute('position'), tex = g.getAttribute('uv');
    const original = Float32Array.from(pos.array), start = surface.positions.length, tint = new THREE.Color(color);
    g.computeBoundingBox(); const box = g.boundingBox!, center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const local = original.slice(); for (let i = 0; i < local.length; i += 3) { local[i] -= center.x; local[i + 1] -= center.y; local[i + 2] -= center.z; }
    let proxy = owner;
    if (!proxy) {
      const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(local, 3)); pg.computeVertexNormals();
      proxy = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide })); proxy.position.copy(center); proxy.updateMatrixWorld(true);
      Object.assign(proxy.userData, { facilityId: shell.name, component: name, renderProxy: true, coordinatesEstimated: true, dimensionsEstimated: true });
      breakables.push({ mesh: proxy, size, collisionVertices: local.slice(), material: kind, toughness: kind === 'stone' ? 10 : 5, label: name.startsWith('directory') ? '규장각 안내판' : name.startsWith('bulletin') ? '규장각 게시판' : name.startsWith('lamp') ? '규장각 앞 가로등' : '규장각 앞 보행 시설' });
    }
    surface.positions.push(...original); for (let i = 0; i < pos.count; i++) { surface.colors.push(tint.r, tint.g, tint.b); surface.uv.push(uv && tex ? THREE.MathUtils.lerp(uv[0], uv[2], tex.getX(i)) : 0, uv && tex ? THREE.MathUtils.lerp(uv[1], uv[3], tex.getY(i)) : 0); }
    parts.push({ proxy, surface, start, original, shown: true }); g.dispose(); if (g !== geometry) geometry.dispose(); return proxy;
  }
  const box = (name: string, center: THREE.Vector3, size: [number, number, number], color: number, kind: BreakableSpec['material'] = 'metal', rotation = orient, owner?: THREE.Mesh) => add(name, new THREE.BoxGeometry(...size).applyQuaternion(rotation).translate(center.x, center.y, center.z), color, kind, owner);
  function beam(name: string, a: THREE.Vector3, b: THREE.Vector3, radius: number, color = 0x35413d) {
    const d = b.clone().sub(a), c = a.clone().add(b).multiplyScalar(.5); return add(name, new THREE.CylinderGeometry(radius, radius, d.length(), 6).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, d.normalize())).translate(c.x, c.y, c.z), color, 'metal');
  }
  const boardRecords: Record<string, unknown>[] = [];
  function board(name: string, s: number, n: number, width: number, height: number, uv: [number, number, number, number]) {
    const p = at(s, n), frame = box(name + '-frame', p.clone().addScaledVector(up, .65 + height / 2), [width, height, .14], 0x465453);
    for (const side of [-1, 1]) { const foot = p.clone().addScaledVector(axis, side * (width / 2 - .10)); foot.y = heightAt(foot.x, foot.z); beam(name + '-post', foot, foot.clone().setY(p.y + height + .75), .05, 0x818d8c); }
    box(name + '-cap', p.clone().addScaledVector(up, height + .7), [width + .18, .08, .35], 0x4b5b5a);
    const face = new THREE.PlaneGeometry(width - .12, height - .1); face.scale(-1, 1, 1); face.applyQuaternion(orient);
    const c = p.clone().addScaledVector(outward, .076).addScaledVector(up, .65 + height / 2); face.translate(c.x, c.y, c.z);
    add(name + '-face', face, 0xffffff, 'metal', frame, signs, uv); boardRecords.push({ name, position: p.toArray(), width, height, front: outward.toArray(), legibleTextOnly: true });
  }
  // 도로에서 봤을 때 왼쪽 안내판과 오른쪽 게시판. 작은 목록과 게시물은 임의로 전사하지 않는다.
  board('directory', 8.1, 10.5, 2.45, 1.55, [0, 0, .5, 1]);
  board('bulletin', -13.8, 12, 4.5, 1.9, [.5, 0, 1, 1]);
  const rock = at(8.6, 4.7, .65); add('landscape-rock', new THREE.IcosahedronGeometry(1, 1).scale(1.5, .92, 1).rotateY(.3).translate(rock.x, rock.y, rock.z), 0x7a817b);
  const curbRecords: number[][] = [];
  // 도로에 보이는 동쪽 보도 구간만 연결한다. 수목에 가린 계단을 새로 추정해 연결하지 않는다.
  for (let s = 6; s < 30; s += 1.2) {
    const end = Math.min(30, s + 1.2), corners = [roadAt(s, 2.75), roadAt(end, 2.75), roadAt(end, 3.05), roadAt(s, 3.05)];
    const top = corners.map(p => p.clone().addScaledVector(up, .12)); add('sidewalk-curb', new ConvexGeometry([...top, ...corners.map(p => p.clone().addScaledVector(up, -.08))]), 0xc4c3b4);
    curbRecords.push([s, end, 2.75, 3.05]);
  }
  for (let s = 12; s < 30; s += 1.5) {
    const end = Math.min(30, s + 1.5), corners = [roadAt(s, 5.5), roadAt(end, 5.5), roadAt(end, 5.9), roadAt(s, 5.9)];
    add('low-stone-boundary', new ConvexGeometry([...corners.map(p => p.clone().addScaledVector(up, .48)), ...corners.map(p => p.clone().addScaledVector(up, -.12))]), 0x939c96);
    beam('railing-top', roadAt(s, 5.7, 1.22), roadAt(end, 5.7, 1.22), .035);
    for (let t = s; t < end - .01; t += .3) beam('railing-picket', roadAt(t, 5.7, .46), roadAt(t, 5.7, 1.22), .022);
  }
  const bollards = [8, 17, 27].map(s => { const p = roadAt(s, 3.35), body = add('black-bollard', new THREE.CylinderGeometry(.10, .14, .72, 8).translate(p.x, p.y + .36, p.z), 0x343b36, 'metal'); add('bollard-yellow-cap', new THREE.CylinderGeometry(.106, .106, .13, 8).translate(p.x, p.y + .66, p.z), 0xd9b945, 'metal', body); return p.toArray(); });
  const lamp = roadAt(20.5, 5.05); beam('lamp-post', lamp, lamp.clone().addScaledVector(up, 4.65), .065, 0x5c6861);
  // 로드뷰의 원형 삿갓과 중앙 등 하나를 단순한 원뿔대로 만든다.
  const lampTop = lamp.clone().addScaledVector(up, 4.85);
  const head = add('lamp-round-shade', new THREE.CylinderGeometry(.10, .46, .13, 12).translate(lampTop.x, lampTop.y, lampTop.z), 0x718078, 'metal');
  add('lamp-light', new THREE.CylinderGeometry(.20, .10, .29, 10).translate(lamp.x, lamp.y + 4.64, lamp.z), 0xd5ddd0, 'metal', head);
  // 판독하지 못한 안내 문구나 부착물의 기능은 추가하지 않는다.
  const attachment = lamp.clone().addScaledVector(up, 3.1); box('lamp-unlabelled-attachment', attachment, [.27, .38, .07], 0x586d78);
  const shrubs = [[9.7, 7], [10.2, 10], [-15, 6], [-15, 9]].map(([s, n], i) => { const p = at(s, n, .40); add('low-shrub', new THREE.IcosahedronGeometry(1, 1).scale(.75, .55, .65).translate(p.x, p.y, p.z), i % 2 ? 0x58704b : 0x627a4c, 'wood'); return p.toArray(); });
  const trees = [10, 19, 28].map((s, i) => {
    const p = roadAt(s, 8.3 + i % 2 * 1.2), height = 5.6 + i * .45;
    const trunk = add('landscape-tree-trunk', new THREE.CylinderGeometry(.14, .24, height * .7, 7).translate(p.x, p.y + height * .35, p.z), 0x716b53, 'wood');
    add('landscape-tree-crown', new THREE.IcosahedronGeometry(1, 1).scale(2.1, 2.5, 1.8).translate(p.x, p.y + height * .75, p.z), [0x536f45, 0x5b784b, 0x607a49][i], 'wood', trunk);
    return { position: p.toArray(), height, countAndSpeciesEstimated: true };
  });
  function merged(surface: Surface, name: string, material: THREE.Material, dynamic = false) {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(surface.positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(surface.colors, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(surface.uv, 2));
    if (dynamic) (geometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage); geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); surface.geometry = geometry;
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.receiveShadow = true; mesh.castShadow = dynamic; mesh.frustumCulled = false; shell.add(mesh); return mesh;
  }
  const paving = merged(ground, 'gyujanggak-block-paving', new THREE.MeshStandardMaterial({ map: pavingTexture(), vertexColors: true, roughness: .95, side: THREE.DoubleSide }));
  Object.assign(paving.userData, { physicalCollider: false, continuousTerrainSurface: true, offset: .035, blockSizeEstimated: [.2, .4] });
  merged(solid, 'gyujanggak-approach-facilities', new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .84, side: THREE.DoubleSide }), true);
  merged(signs, 'gyujanggak-directory-and-bulletin-faces', new THREE.MeshStandardMaterial({ map: boardAtlas(), vertexColors: true, side: THREE.DoubleSide, roughness: .88 }), true);
  Object.assign(shell.userData, { role: 'campus-facilities', facilityId: shell.name, landmark: 'gyujanggak-approach', source: 'sources/gyujanggak-approach-roadview-review.json', sourceMonth: '2026-08', coordinatesEstimated: true, dimensionsEstimated: true, terrainChanged: false, coordinateConvention: 'D=(east,up,north); parent H once.', entry, courtPolygon, sidewalkPolygon, linkPolygon, transitionWidth: .8, roadStart: roadStart.toArray(), roadAxis: roadAxis.toArray(), roadInward: roadInward.toArray(), roadHalfWidth: 2.75, curbs: curbRecords, boards: boardRecords, bollards, lamp: lamp.toArray(), shrubs, trees, normalizedSurfaces, parts: breakables.length, renderMeshes: 3, triangles: (solid.positions.length + signs.positions.length + ground.positions.length) / 9, textureBytes: 512 * 512 * 4 + 1024 * 512 * 4, pavingCollision: 'Existing continuous terrain, not per-block colliders', noticeContent: 'Only 103 and 규장각한국학연구원 transcribed; notice sheets are unlabelled approximations.' });
  function update(_player: THREE.Vector3) {
    const changed = new Set<Surface>();
    for (const part of parts) if (part.shown !== part.proxy.visible) { const attr = part.surface.geometry!.getAttribute('position') as THREE.BufferAttribute; if (!changed.has(part.surface)) attr.clearUpdateRanges(); changed.add(part.surface); part.shown = part.proxy.visible;
      if (part.shown) (attr.array as Float32Array).set(part.original, part.start); else for (let i = 0; i < part.original.length; i += 3) { attr.array[part.start + i] = part.proxy.position.x; attr.array[part.start + i + 1] = part.proxy.position.y; attr.array[part.start + i + 2] = part.proxy.position.z; } attr.addUpdateRange(part.start, part.original.length);
    }
    for (const surface of changed) surface.geometry!.getAttribute('position').needsUpdate = true;
  }
  return { shell, breakables, update };
}

function pavingTexture() {
  const size = 512, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const row = Math.floor(y / 32), offset = row % 2 ? 32 : 0, column = Math.floor((x + offset) / 64), mortar = y % 32 < 2 || (x + offset) % 64 < 2;
    const variation = (row * 11 + column * 7) % 11 - 5, base = mortar ? [130, 133, 125] : [194 + variation, 191 + variation, 177 + variation];
    const k = (y * size + x) * 4; for (let c = 0; c < 3; c++) pixels[k + c] = base[c]; pixels[k + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat); texture.name = 'gyujanggak-generated-block-pattern'; texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter; texture.generateMipmaps = true; texture.needsUpdate = true; return texture;
}
function boardAtlas() {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 512;
  const ctx = canvas.getContext('2d'); if (!ctx) throw Error('Unable to create Gyujanggak sign atlas.');
  ctx.fillStyle = '#234965'; ctx.fillRect(0, 0, 512, 512); ctx.fillStyle = '#b0b8b2'; ctx.fillRect(512, 0, 512, 512);
  ctx.fillStyle = '#82464b'; ctx.fillRect(20, 22, 135, 70); ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 42px sans-serif'; ctx.fillText('103', 88, 58);
  ctx.font = 'bold 34px sans-serif'; ctx.fillText('규장각한국학연구원', 256, 158); ctx.fillStyle = '#a5b6c0'; ctx.fillRect(30, 214, 452, 3);
  for (let i = 0; i < 4; i++) { ctx.fillStyle = '#aab9c4'; ctx.fillRect(45, 265 + i * 42, 23, 5); ctx.fillRect(93, 265 + i * 42, 210 - i * 23, 5); }
  for (let column = 0; column < 6; column++) { const x = 525 + column * 81; ctx.fillStyle = '#e5e5dc'; ctx.fillRect(x, 45, 73, 425); ctx.fillStyle = '#435b6c'; ctx.fillRect(x, 10, 73, 27); ctx.fillStyle = '#a5b2b1'; for (let row = 0; row < 3; row++) { ctx.fillRect(x + 8, 70 + row * 128, 55, 12); for (let line = 0; line < 5; line++) ctx.fillRect(x + 8, 98 + row * 128 + line * 13, 40 + line % 3 * 6, 3); } }
  const texture = new THREE.CanvasTexture(canvas); texture.name = 'gyujanggak-observed-name-and-generic-notices'; texture.colorSpace = THREE.SRGBColorSpace; return texture;
}
