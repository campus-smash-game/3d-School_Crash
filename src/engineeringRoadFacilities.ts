import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { BreakableSpec } from './scene';

type Point = [number, number];
type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };
type Sampler = ((x: number, z: number) => number) & { roadSurfaceTriangles?: (bounds: Bounds) => number[][] | undefined };
export type EngineeringRoadFacilityAnchors = {
  road: Point[];
  roadWidth: number;
  bridgeCrossingZ: number;
  lowerDoor303: Point;
  eastStairApproach: Point;
  lowerDeck?: { a: [number, number, number]; b: [number, number, number]; width: number };
};
type Item = { proxy: THREE.Mesh; matrix: THREE.Matrix4; baseColor: THREE.Color; lastColor: number; shown: boolean };
type Batch = { mesh: THREE.InstancedMesh; items: Item[] };

/** 2026년 8월 거리뷰의 고정시설을 근사한다. 임시 연등과 사진의 인물, 차량은 포함하지 않는다. */
export function createEngineeringRoadFacilities(scene: THREE.Scene, heightAt: Sampler, anchors: EngineeringRoadFacilityAnchors) {
  if (anchors.road.length < 2 || anchors.roadWidth < 4 || !Number.isFinite(anchors.bridgeCrossingZ)) throw Error('Invalid engineering road facility anchors.');
  const shell = new THREE.Group(); shell.name = 'facilities/engineering301-303';
  const breakables: BreakableSpec[] = [], batches: Batch[] = [], positions: number[] = [], colors: number[] = [];
  const zero = new THREE.Matrix4().makeScale(0, 0, 0), white = new THREE.Color(0xffffff);
  const patches: { kind: string; polygon: Point[]; offset: number; exactTerrain: boolean }[] = [];
  Object.assign(shell.userData, { role: 'campus-facilities', facilityId: shell.name, landmark: 'engineering-road-facilities', anchors: structuredClone(anchors), dimensionsEstimated: true, captureDate: '2026-08', temporaryLanternsIncluded: false, originalDataChanged: false, sourceImages: ['301-303-bridge-south-face.png', '301-bridge-east-elevator-stairs.png', '303-east-lower-entrance.png', '301-303-road-south-ui.jpg'], coordinates: 'D=(east,up,north); parent H applies once.' });
  scene.add(shell);
  function station(z: number) {
    let found = anchors.road.length - 2, distance = Infinity;
    for (let i = 0; i < anchors.road.length - 1; i++) { const a = anchors.road[i], b = anchors.road[i + 1], d = Math.max(Math.min(a[1], b[1]) - z, z - Math.max(a[1], b[1]), 0); if (d < distance) { found = i; distance = d; } }
    const a = anchors.road[found], b = anchors.road[found + 1], t = THREE.MathUtils.clamp((z - a[1]) / (b[1] - a[1]), 0, 1), dz = b[1] - a[1], dx = b[0] - a[0], length = Math.hypot(dx, dz);
    return { x: THREE.MathUtils.lerp(a[0], b[0], t), z: THREE.MathUtils.lerp(a[1], b[1], t), tx: dx / length, tz: dz / length, nx: dz / length, nz: -dx / length };
  }
  const point = (z: number, offset: number): Point => { const p = station(z); return [p.x + p.nx * offset, p.z + p.nz * offset]; };
  function renderHeight(x: number, z: number, y: number, offset: number) {
    let value = y + .03 + offset;
    const deck = anchors.lowerDeck;
    if (deck) { const dx = deck.b[0] - deck.a[0], dz = deck.b[2] - deck.a[2], length = Math.hypot(dx, dz), along = ((x - deck.a[0]) * dx + (z - deck.a[2]) * dz) / length, across = Math.abs((x - deck.a[0]) * dz - (z - deck.a[2]) * dx) / length; if (along >= 0 && along <= length && across <= deck.width / 2) value = Math.max(value, THREE.MathUtils.lerp(deck.a[1], deck.b[1], along / length) + .018 + (offset - .15)); }
    return value;
  }
  function surface(polygon: Point[], color: number, offset: number, kind: string) {
    const bounds = { minX: Math.min(...polygon.map(p => p[0])), maxX: Math.max(...polygon.map(p => p[0])), minZ: Math.min(...polygon.map(p => p[1])), maxZ: Math.max(...polygon.map(p => p[1])) };
    const terrainTriangles = heightAt.roadSurfaceTriangles?.(bounds), sign = Math.sign(polygon.reduce((sum, p, i) => { const q = polygon[(i + 1) % polygon.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0)), tint = new THREE.Color(color);
    patches.push({ kind, polygon, offset, exactTerrain: !!terrainTriangles });
    const emit = (a: number[], b: number[], c: number[]) => { for (const p of [a, b, c]) { positions.push(p[0], renderHeight(p[0], p[2], p[1], offset), p[2]); colors.push(tint.r, tint.g, tint.b); } };
    if (terrainTriangles) {
      for (const triangle of terrainTriangles) {
        let clipped = [triangle.slice(0, 3), triangle.slice(3, 6), triangle.slice(6, 9)];
        for (let e = 0; e < polygon.length && clipped.length; e++) { const a = polygon[e], b = polygon[(e + 1) % polygon.length], next: number[][] = [], distance = (p: number[]) => sign * ((b[0] - a[0]) * (p[2] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])); for (let i = 0; i < clipped.length; i++) { const p = clipped[i], q = clipped[(i + 1) % clipped.length], dp = distance(p), dq = distance(q); if (dp >= -1e-8) next.push(p); if ((dp >= -1e-8) !== (dq >= -1e-8)) { const t = dp / (dp - dq); next.push(p.map((v, k) => v + (q[k] - v) * t)); } } clipped = next; }
        for (let i = 1; i < clipped.length - 1; i++) emit(clipped[0], clipped[i], clipped[i + 1]);
      }
    } else {
      const vertices = polygon.map(p => [p[0], heightAt(...p) - .03, p[1]]);
      for (let i = 1; i < vertices.length - 1; i++) emit(vertices[0], vertices[i], vertices[i + 1]);
    }
  }
  function strip(z0: number, z1: number, n0: number, n1: number, color: number, offset: number, kind: string) { surface([point(z0, n0), point(z0, n1), point(z1, n1), point(z1, n0)], color, offset, kind); }
  function path(a: Point, b: Point, width: number, color: number, offset: number, kind: string) { const length = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = -(b[1] - a[1]) / length * width / 2, nz = (b[0] - a[0]) / length * width / 2; surface([[a[0] + nx, a[1] + nz], [a[0] - nx, a[1] - nz], [b[0] - nx, b[1] - nz], [b[0] + nx, b[1] + nz]], color, offset, kind); }
  const half = anchors.roadWidth / 2, crossingZ = anchors.bridgeCrossingZ - 8.5, crossingDepth = 3.8;
  // 도로 위 횡단보도는 실제 도로 삼각형보다 3cm 높게 표시한다.
  for (let n = -half + .3; n < half - .3; n += 1.05) strip(crossingZ - crossingDepth / 2, crossingZ + crossingDepth / 2, n, Math.min(n + .53, half - .3), 0xe8e6d8, .17, 'crosswalk');
  const south = anchors.bridgeCrossingZ - 31, north = anchors.bridgeCrossingZ + 6;
  for (let z = south; z < north; z += 3) strip(z, Math.min(z + 3, north), half + .28, half + 2.9, 0x8d9189, .15, 'east-paving');
  for (let z = south; z < north; z += .8) strip(z, Math.min(z + .025, north), half + .28, half + 2.9, 0x72776e, .155, 'paving-joint');
  for (let z = south; z < north; z += 3) {
    const end = Math.min(z + 3, north);
    strip(z, end, half + 1.12, half + 1.48, 0xd2ad36, .18, 'tactile-guidance');
    for (const n of [1.18, 1.29, 1.4]) strip(z, end, half + n, half + n + .035, 0xf0cb4c, .184, 'tactile-ridge');
    strip(z, end, -half + .08, -half + .18, 0xd7b443, .17, 'west-yellow-road-edge');
  }
  const westCrossing = point(crossingZ, -half - .5), westDoorApproach: Point = [anchors.lowerDoor303[0] + 1, anchors.lowerDoor303[1]], westTurn: Point = [westCrossing[0], anchors.lowerDoor303[1]];
  path(westCrossing, westTurn, 2.8, 0x92968d, .15, 'west-entry-paving'); path(westTurn, westDoorApproach, 2.8, 0x92968d, .15, 'lower-entry-paving');
  path(westCrossing, westTurn, .34, 0xd3b042, .18, 'west-entry-tactile'); path(westTurn, westDoorApproach, .34, 0xd3b042, .18, 'lower-entry-tactile');
  for (const n of [-half - .65, half + 1.3]) {
    const c = point(crossingZ, n), radius = .035;
    surface([[c[0] - .55, c[1] - .55], [c[0] + .55, c[1] - .55], [c[0] + .55, c[1] + .55], [c[0] - .55, c[1] + .55]], 0xd3b042, .185, 'tactile-warning');
    for (let x = -.4; x <= .41; x += .2) for (let z = -.4; z <= .41; z += .2) surface(Array.from({ length: 8 }, (_, i) => [c[0] + x + Math.cos(i * Math.PI / 4) * radius, c[1] + z + Math.sin(i * Math.PI / 4) * radius]), 0xf1cd55, .191, 'tactile-dot');
  }
  const markings = new THREE.BufferGeometry(); markings.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); markings.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); markings.computeVertexNormals(); markings.computeBoundingSphere();
  const ground = new THREE.Mesh(markings, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .94 })); ground.name = 'engineering-facility-ground-surfaces'; ground.receiveShadow = true; shell.add(ground);

  function colored(g: THREE.BufferGeometry, color: number) { const tint = new THREE.Color(color), values = []; for (let i = 0; i < g.getAttribute('position').count; i++) values.push(tint.r, tint.g, tint.b); g.setAttribute('color', new THREE.Float32BufferAttribute(values, 3)); return g; }
  function batch(name: string, geometry: THREE.BufferGeometry, placements: { p: Point; size: THREE.Vector3; heading?: number }[], material: BreakableSpec['material'], color: number, toughness: number) {
    const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .83 }), placements.length), items: Item[] = [];
    mesh.name = 'engineering-facility-' + name; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.receiveShadow = true; mesh.frustumCulled = false;
    for (let i = 0; i < placements.length; i++) {
      const { p, size, heading = 0 } = placements[i], y = heightAt(...p) + .15, proxy = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color }));
      proxy.position.set(p[0], y + size.y / 2, p[1]); proxy.rotation.y = heading; proxy.scale.copy(size); proxy.updateMatrixWorld(true);
      Object.assign(proxy.userData, { facilityId: shell.name, renderProxy: true, component: name, dimensionsEstimated: true });
      const matrix = proxy.matrix.clone(); mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, white); items.push({ proxy, matrix, baseColor: new THREE.Color(color), lastColor:color, shown: true });
      breakables.push({ mesh: proxy, size: size.clone(), toughness, material, label: name === 'bollards' ? '노란 탄성 볼라드' : name === 'curbs' ? '낮은 연석' : name === 'stones' ? '돌 경계' : '낮은 식재' });
    }
    shell.add(mesh); batches.push({ mesh, items });
  }
  const passageGap = (z: number) => Math.abs(z - crossingZ) < 3.2 || Math.abs(z - anchors.eastStairApproach[1]) < 2.7;
  const bollards: { p: Point; size: THREE.Vector3 }[] = [], curbs: { p: Point; size: THREE.Vector3; heading: number }[] = [];
  for (let z = south + 1.5; z < anchors.bridgeCrossingZ + 1; z += 3.4) if (!passageGap(z)) bollards.push({ p: point(z, half + .35), size: new THREE.Vector3(.19, .9, .19) });
  for (let z = south; z < north - 1; z += 1.8) if (!passageGap(z + .85)) { const p = station(z + .85); curbs.push({ p: point(z + .85, half + .2), size: new THREE.Vector3(.16, .13, 1.65), heading: Math.atan2(p.tx, p.tz) }); }
  const post = colored(new THREE.CylinderGeometry(.34, .4, .94, 8).translate(0, .03, 0), 0xd8a51f), rings = [-.15, .08, .29].map(y => colored(new THREE.CylinderGeometry(.345, .345, .075, 8).translate(0, y, 0), 0xefead6)), base = colored(new THREE.BoxGeometry(1, .055, 1).translate(0, -.47, 0), 0xe2ad25), postGeometry = mergeGeometries([post, ...rings, base], false)!;
  [post, ...rings, base].forEach(g => g.dispose()); batch('bollards', postGeometry, bollards, 'metal', 0xe2ad25, 3);
  batch('curbs', colored(new THREE.BoxGeometry(1, 1, 1), 0xa7aaa1), curbs, 'stone', 0xa7aaa1, 4);
  const stones: { p: Point; size: THREE.Vector3; heading: number }[] = [], shrubs: { p: Point; size: THREE.Vector3; heading: number }[] = [];
  for (const sign of [-1, 1]) for (let i = 0; i < 6; i++) {
    const p: Point = [anchors.lowerDoor303[0] + 1.8 + i * .72, anchors.lowerDoor303[1] + sign * 3.3];
    stones.push({ p, size: new THREE.Vector3(.65, .28 + i % 2 * .05, .48), heading: i * .73 });
    if (i % 2 === 0) shrubs.push({ p: [p[0], p[1] + sign * .65], size: new THREE.Vector3(.95, .64 + i * .025, .85), heading: i });
  }
  batch('stones', colored(new THREE.IcosahedronGeometry(.5, 0), 0x9b9e91), stones, 'stone', 0x9b9e91, 4);
  batch('shrubs', colored(new THREE.IcosahedronGeometry(.5, 1), 0x547844), shrubs, 'wood', 0x547844, 2);
  Object.assign(shell.userData, { crossing: { center: point(crossingZ, 0), depth: crossingDepth, width: anchors.roadWidth - .6 }, patches, bollards: bollards.map(p => p.p), curbs: curbs.map(p => p.p), entranceClearWidth: 5.6, groundSurfaceOffsetFromHeightAt: .15, roadPaintOffsetFromHeightAt: .17, siteGeometryEstimated: true });
  function update(_player: THREE.Vector3) {
    for (const batch of batches) { let changed = false,colorChanged=false; for (let i = 0; i < batch.items.length; i++) { const item = batch.items[i]; if (item.shown !== item.proxy.visible) { item.shown = item.proxy.visible; batch.mesh.setMatrixAt(i, item.shown ? item.matrix : zero); changed = true; } const color = (item.proxy.material as THREE.MeshStandardMaterial).color,hex=color.getHex();if(hex!==item.lastColor){item.lastColor=hex;batch.mesh.setColorAt(i,color.equals(item.baseColor)?white:color);colorChanged=true;} } if (changed) batch.mesh.instanceMatrix.needsUpdate = true; if (colorChanged&&batch.mesh.instanceColor) batch.mesh.instanceColor.needsUpdate = true; }
  }
  return { breakables, update, shell };
}
