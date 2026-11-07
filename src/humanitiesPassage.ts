import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';

type XZ = [number, number];
type XYZ = [number, number, number];
const BUILDING = 'way/167984624';
const ROAD = 'way/1429747754/540';
const A: XZ = [343.78, -690.70], B: XZ = [353.58, -662.89];
const OUTLINE: XZ[] = [[316.42, -678.38], [371.99, -699.61], [378.51, -688.29], [379.48, -680], [323.91, -658.76], [320.14, -666.29], [316.42, -678.38]];
const PHOTO_SOURCE = 'https://humanities.snu.ac.kr/community/newsletter?md=download&seqidx=63';

// 지도 통과선을 유지하고 공식 소식지 62호 25쪽의 입구 마감을 참고한다. 치수와 남쪽 면 대응은 근사다.
export function getHumanitiesPassageLayout(heightAt: (x: number, z: number) => number, footprint: XZ[] = OUTLINE) {
  const length = Math.hypot(B[0] - A[0], B[1] - A[1]);
  const axis = { x: (B[0] - A[0]) / length, z: (B[1] - A[1]) / length };
  const across = { x: -axis.z, z: axis.x };
  const point = (s: number, n = 0): XZ => [A[0] + axis.x * s + across.x * n, A[1] + axis.z * s + across.z * n];
  const local = (p: XZ) => ({ s: (p[0] - A[0]) * axis.x + (p[1] - A[1]) * axis.z, n: (p[0] - A[0]) * across.x + (p[1] - A[1]) * across.z });
  const unique = footprint.slice(0, -1), centre: XZ = [unique.reduce((a, p) => a + p[0], 0) / unique.length, unique.reduce((a, p) => a + p[1], 0) / unique.length];
  const base = heightAt(...centre), width = 5, ceilingY = base + 3.2;
  const openings = [0, 3].map(edgeIndex => {
    const a = footprint[edgeIndex], b = footprint[edgeIndex + 1], la = local(a), lb = local(b);
    const at = (n: number): XZ => { const t = (n - la.n) / (lb.n - la.n); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
    const p = at(-2.6), q = at(2.6), center = at(0);
    return { buildingId: BUILDING, edgeIndex, a: p, b: q, bottom: Math.min(heightAt(...p), heightAt(...q), base) - .45, top: ceilingY, center, station: local(center).s };
  });
  const stationAtFace = (face: number, n: number) => {
    const a = local(openings[face].a), b = local(openings[face].b);
    return a.s + (b.s - a.s) * (n - a.n) / (b.n - a.n);
  };
  return { buildingId: BUILDING, sourceRoad: ROAD, sourceWay: '1429747754', sourceNodeIds: ['1793018816', '1793018821'], origin: A, end: B, length, axis, across, base, width, ceilingY, openings, point, local, stationAtFace };
}

export function createHumanitiesPassage(scene: THREE.Scene, heightAt: (x: number, z: number) => number, footprint: XZ[] = OUTLINE) {
  const layout = getHumanitiesPassageLayout(heightAt, footprint);
  const terrain = scene.getObjectByName('campus-terrain') as THREE.Mesh<THREE.BufferGeometry> | undefined;
  if (!terrain?.geometry) throw new Error('Humanities passage requires the actual campus terrain mesh.');
  const shell = new THREE.Group(); shell.name = 'connection/humanities-1-passage';
  Object.assign(shell.userData, { role: 'campus-connection', connectionId: shell.name, buildingId: BUILDING, landmark: 'humanities-1-passage', coordinates: 'D=(east,up,north); parent H applies once.' });
  scene.add(shell);
  const positions: number[] = [], colors: number[] = [], breakables: BreakableSpec[] = [];
  const parts: { proxy: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>; start: number; end: number; original: Float32Array; originalColors: Float32Array; baseTint: THREE.Color; shown: boolean; color: number }[] = [];
  const pavementMasks: { component: string; polygon: XZ[] }[] = [];
  const floorTriangles: XYZ[][] = [];
  const overlayTerrain: XYZ[][] = [];
  const world = (s: number, y: number, n: number) => { const p = layout.point(s, n); return new THREE.Vector3(p[0], y, p[1]); };
  function component(name: string, vertices: THREE.Vector3[], color: number, owner?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>) {
    const bounds = new THREE.Box3().setFromPoints(vertices), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const geometry = new ConvexGeometry(vertices.map(p => p.clone().sub(center))), attribute = geometry.getAttribute('position');
    const proxy = owner ?? new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: .86 }));
    if (!owner) {
      proxy.position.copy(center); proxy.updateMatrixWorld(true);
      Object.assign(proxy.userData, { buildingId: BUILDING, connectionId: shell.name, landmark: 'humanities-1-passage', component: name, renderProxy: true, convex: true, sourceRoad: ROAD });
    }
    const start = positions.length, tint = new THREE.Color(color);
    for (let i = 0; i < attribute.count; i++) { positions.push(attribute.getX(i) + center.x, attribute.getY(i) + center.y, attribute.getZ(i) + center.z); colors.push(tint.r, tint.g, tint.b); }
    if (name === 'passage-floor') decorateFloor(vertices.slice(0, 3).map(p => p.toArray() as XYZ));
    parts.push({ proxy, start, end: positions.length, original: Float32Array.from(positions.slice(start)), originalColors: Float32Array.from(colors.slice(start)), baseTint: proxy.material.color.clone(), shown: true, color: proxy.material.color.getHex() });
    if (!owner) breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attribute.array), toughness: name === 'passage-floor' ? 12 : 9, material: name.includes('window') ? 'glass' : name.startsWith('noticeboard') ? 'wood' : 'stone', label: '1동 통과길' });
    else geometry.dispose();
    return proxy;
  }
  function clip(polygon: XYZ[], distance: (p: XYZ) => number): XYZ[] {
    const result: XYZ[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length], da = distance(a), db = distance(b), ka = da >= -1e-8, kb = db >= -1e-8;
      if (ka) result.push(a);
      if (ka !== kb) { const t = da / (da - db); result.push(a.map((v, axis) => v + (b[axis] - v) * t) as XYZ); }
    }
    return result;
  }
  // 줄눈과 점자 무늬는 기존 바닥 부품에 묶는다. 블록별 충돌체나 별도 메시를 만들지 않는다.
  function decorateFloor(triangle: XYZ[]) {
    const local = triangle.map(p => layout.local([p[0], p[2]]));
    const rect = (s0: number, s1: number, n0: number, n1: number, color: number, lift = .003) => {
      let polygon = triangle;
      for (const plane of [(p: XYZ) => layout.local([p[0], p[2]]).s - s0, (p: XYZ) => s1 - layout.local([p[0], p[2]]).s, (p: XYZ) => layout.local([p[0], p[2]]).n - n0, (p: XYZ) => n1 - layout.local([p[0], p[2]]).n]) polygon = clip(polygon, plane);
      const tint = new THREE.Color(color);
      for (let i = 1; i + 1 < polygon.length; i++) {
        const [a, b, c] = [polygon[0], polygon[i], polygon[i + 1]];
        if (Math.abs((b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0])) < 1e-8) continue;
        for (const p of [a, b, c]) { positions.push(p[0], p[1] + lift, p[2]); colors.push(tint.r, tint.g, tint.b); }
      }
    };
    const minS = Math.min(...local.map(p => p.s)), maxS = Math.max(...local.map(p => p.s));
    const minN = Math.min(...local.map(p => p.n)), maxN = Math.max(...local.map(p => p.n));
    for (let row = Math.floor(minS / .32); row <= Math.floor(maxS / .32); row++) {
      const offset = (row % 2) * .30;
      for (let col = Math.floor((minN - offset) / .60); col <= Math.floor((maxN - offset) / .60); col++) {
        const interior = row * .32 >= layout.openings[0].station - .6 && row * .32 <= layout.openings[1].station;
        const palette = interior ? [0x997c65, 0xa38b73, 0x8d7564, 0x9c8571] : [0xa7a69f, 0xb5b2a9, 0xbab6aa, 0xaaa99e];
        rect(row * .32 + .012, (row + 1) * .32 - .012, col * .60 + offset + .012, (col + 1) * .60 + offset - .012, palette[((row * 17 + col * 7) % 4 + 4) % 4]);
      }
    }
    // 사진에서 보이는 입구의 짧은 노란 유도블록만 표현한다. 통로 전체의 설치 여부는 미확인이다.
    const guideEnd = layout.openings[0].station + 2.1;
    for (let s = 0; s < guideEnd; s += .30) {
      rect(s + .008, Math.min(s + .292, guideEnd), .73, 1.03, 0xc6a13f, .007);
      for (const n of [.78, .86, .94]) rect(s + .035, Math.min(s + .265, guideEnd), n, n + .022, 0xe4be51, .009);
    }
  }
  const corners = [layout.point(0, -2.5), layout.point(layout.length, -2.5), layout.point(layout.length, 2.5), layout.point(0, 2.5)];
  const bounds = { minX: Math.min(...corners.map(p => p[0])), maxX: Math.max(...corners.map(p => p[0])), minZ: Math.min(...corners.map(p => p[1])), maxZ: Math.max(...corners.map(p => p[1])) };
  const source = terrain.geometry.getAttribute('position'), indices = terrain.geometry.index;
  const vertex = (index: number): XYZ => { const i = indices ? indices.getX(index) : index; return [source.getX(i), source.getY(i), source.getZ(i)]; };
  let sourceTriangleCount = 0;
  // 원본 지형 삼각형의 평면을 그대로 잘라 사용한다. 높이 함수의 다른 보간면을 덮어 씌우지 않는다.
  for (let i = 0; i < (indices?.count ?? source.count); i += 3) {
    const original = [vertex(i), vertex(i + 1), vertex(i + 2)];
    if (Math.max(...original.map(p => p[0])) >= bounds.minX - 4 && Math.min(...original.map(p => p[0])) <= bounds.maxX + 4 && Math.max(...original.map(p => p[2])) >= bounds.minZ - 4 && Math.min(...original.map(p => p[2])) <= bounds.maxZ + 4) overlayTerrain.push(original);
    if (Math.max(...original.map(p => p[0])) < bounds.minX || Math.min(...original.map(p => p[0])) > bounds.maxX || Math.max(...original.map(p => p[2])) < bounds.minZ || Math.min(...original.map(p => p[2])) > bounds.maxZ) continue;
    let polygon = original;
    for (const distance of [(p: XYZ) => layout.local([p[0], p[2]]).s, (p: XYZ) => layout.length - layout.local([p[0], p[2]]).s, (p: XYZ) => layout.local([p[0], p[2]]).n + 2.5, (p: XYZ) => 2.5 - layout.local([p[0], p[2]]).n]) polygon = clip(polygon, distance);
    if (polygon.length < 3) continue;
    let used = false;
    for (let j = 1; j + 1 < polygon.length; j++) {
      const tri = [polygon[0], polygon[j], polygon[j + 1]];
      const area = Math.abs((tri[1][0] - tri[0][0]) * (tri[2][2] - tri[0][2]) - (tri[1][2] - tri[0][2]) * (tri[2][0] - tri[0][0]));
      if (area < 1e-7) continue;
      const top = tri.map(p => [p[0], p[1] + .035, p[2]] as XYZ);
      component('passage-floor', [...top.map(p => new THREE.Vector3(...p)), ...top.map(p => new THREE.Vector3(p[0], p[1] - .12, p[2]))], 0xb4b1a6);
      pavementMasks.push({ component: 'passage-floor', polygon: top.map(p => [p[0], p[2]]) }); floorTriangles.push(top); used = true;
    }
    if (used) sourceTriangleCount++;
  }
  if (!floorTriangles.length) throw new Error('Humanities passage terrain clipping produced no floor.');
  const floorAt = (s: number, n = 0) => {
    const p = layout.point(s, n);
    for (const [a, b, c] of floorTriangles) {
      const det = (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]);
      const u = ((p[0] - a[0]) * (c[2] - a[2]) - (p[1] - a[2]) * (c[0] - a[0])) / det;
      const v = ((b[0] - a[0]) * (p[1] - a[2]) - (b[2] - a[2]) * (p[0] - a[0])) / det;
      if (u >= -1e-6 && v >= -1e-6 && u + v <= 1.000001) return a[1] + u * (b[1] - a[1]) + v * (c[1] - a[1]);
    }
    throw new Error(`Humanities passage floor outside clipped triangles: ${s}, ${n}`);
  };
  const sideStations = [layout.openings[0].station, 6, 10, 14, 18, layout.openings[1].station];
  for (const sign of [-1, 1]) for (let i = 0; i + 1 < sideStations.length; i++) {
    const vertices: THREE.Vector3[] = [];
    for (const n of [sign * 2.5, sign * 2.72]) {
      const a = i === 0 ? layout.stationAtFace(0, n) - .3 : sideStations[i];
      const b = i + 1 === sideStations.length - 1 ? layout.stationAtFace(1, n) + .3 : sideStations[i + 1];
      const bottom = Math.min(floorAt(a, sign * 2.5), floorAt(b, sign * 2.5)) - .25;
      for (const s of [a, b]) for (const y of [bottom, layout.ceilingY + .14]) vertices.push(world(s, y, n));
    }
    component('passage-sidewall', vertices, 0xc5c1b6);
  }
  for (let i = 0; i + 1 < sideStations.length; i++) {
    const vertices: THREE.Vector3[] = [];
    for (const n of [-2.72, 2.72]) {
      const a = i === 0 ? layout.stationAtFace(0, n) - .3 : sideStations[i];
      const b = i + 1 === sideStations.length - 1 ? layout.stationAtFace(1, n) + .3 : sideStations[i + 1];
      for (const s of [a, b]) for (const y of [layout.ceilingY, layout.ceilingY + .14]) vertices.push(world(s, y, n));
    }
    component('passage-ceiling', vertices, 0xbdbbae);
  }
  for (const face of [0, 1]) for (const sign of [-1, 1]) {
    const vertices: THREE.Vector3[] = [];
    for (const n of [sign * 2.5, sign * 2.72]) {
      const s = layout.stationAtFace(face, n), y0 = floorAt(s, sign * 2.5) - .12;
      for (const u of [s - .39, s + .39]) for (const y of [y0, layout.ceilingY]) vertices.push(world(u, y, n));
    }
    component('passage-portal-jamb', vertices, face === 0 ? 0xe0ddd0 : 0xd3cec2);
  }
  function box(name: string, s: number, n: number, y: number, depth: number, width: number, height: number, color: number, owner?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>) {
    const vertices: THREE.Vector3[] = [];
    for (const ds of [-depth / 2, depth / 2]) for (const dn of [-width / 2, width / 2]) for (const dy of [-height / 2, height / 2]) vertices.push(world(s + ds, y + dy, n + dn));
    return component(name, vertices, color, owner);
  }
  const entryStation = layout.openings[0].station;
  box('entry-concrete-lintel', entryStation - .34, 0, layout.ceilingY + .25, .38, 5.72, .5, 0xe0ddd0);
  for (const n of [-5, 5]) {
    const s = layout.stationAtFace(0, n) - .43, p = layout.point(s, n), base = heightAt(...p);
    box('entry-stone-sill', s, n, base + .35, .20, 3.25, .55, 0xa49e87);
    const pane = box('entry-green-window', s, n, base + 1.60, .16, 3.05, 1.95, 0x416e67);
    for (const side of [-1, 0, 1]) box('entry-window-frame', s - .09, n + side * 1.5, base + 1.60, .12, .09, 2.12, 0xd2d1bf);
    for (const y of [base + .56, base + 2.64]) box('entry-window-frame', s - .09, n, y, .12, 3.15, .09, 0xd2d1bf);
    for (let i = 1; i < 10; i++) box('entry-window-blind', s - .085, n, base + .62 + i * .18, .025, 2.95, .014, 0x527c73, pane);
  }
  const upperWindow = box('entry-upper-window', entryStation - .43, 0, layout.base + 5.25, .16, 4.75, 2.05, 0x41665f);
  for (let n = -2.32; n <= 2.33; n += .155) box('entry-window-grille', entryStation - .52, n, layout.base + 5.25, .025, .028, 2.05, 0x8e9388, upperWindow);
  for (const dy of [-.8, .8]) box('entry-grille-crossbar', entryStation - .52, 0, layout.base + 5.25 + dy, .025, 4.75, .045, 0x8e9388, upperWindow);
  for (const n of [-2.67, 2.67]) box('entry-concrete-pilaster', layout.stationAtFace(0, n) - .40, n, layout.base + 8.6, .18, .34, 10.6, 0xdedbcf);
  // 문구를 판독하지 못한 붉은 표지와 게시물은 색과 틀만 표현한다.
  box('entry-red-notice', entryStation - .45, -2.66, layout.ceilingY - .25, .035, .24, .26, 0xa52925);
  const boardS = -.5, boardN = -5.0, boardPoint = layout.point(boardS, boardN), boardBase = heightAt(...boardPoint);
  for (const n of [boardN - 1.35, boardN + 1.35]) box('noticeboard-post', boardS, n, boardBase + 1.15, .18, .18, 2.3, 0x655038);
  const board = box('noticeboard-backing', boardS, boardN, boardBase + 1.55, .12, 2.9, 1.35, 0x685a43);
  for (const y of [boardBase + .87, boardBase + 2.23]) box('noticeboard-frame', boardS - .01, boardN, y, .18, 3.05, .12, 0x735839);
  for (const n of [-.99, -.33, .33, .99]) {
    box('noticeboard-paper', boardS - .075, boardN + n, boardBase + 1.56, .018, .58, 1.16, 0xe4e3d5, board);
    box('noticeboard-paper-header', boardS - .09, boardN + n, boardBase + 1.99, .012, .51, .11, n < 0 ? 0x3b7187 : 0x847254, board);
    for (const dy of [-.3, -.12, .06]) box('noticeboard-paper-lines', boardS - .09, boardN + n, boardBase + 1.56 + dy, .012, .45, .025, 0x9b9e98, board);
  }
  const roofVertices: THREE.Vector3[] = [];
  for (const n of [boardN - 1.7, boardN + 1.7]) for (const [ds, y] of [[-.65, 2.34], [0, 2.64], [.65, 2.34], [-.65, 2.27], [.65, 2.27]]) roofVertices.push(world(boardS + ds, boardBase + y, n));
  component('noticeboard-tiled-roof', roofVertices, 0x333b3d);
  const directoryS = entryStation - .65, directoryN = -3.25, directoryP = layout.point(directoryS, directoryN), directoryBase = heightAt(...directoryP);
  const directory = box('entry-blue-directory', directoryS, directoryN, directoryBase + 1.35, .13, .65, 1.10, 0x315d77);
  for (const dy of [-.3, -.05, .20]) box('entry-directory-lines', directoryS - .075, directoryN, directoryBase + 1.35 + dy, .018, .43, .035, 0xc8d5d6, directory);
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  (geometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .86, side: THREE.DoubleSide }));
  mesh.name = 'humanities-passage-surfaces'; mesh.castShadow = true; mesh.receiveShadow = true; shell.add(mesh);
  const routeWorld = [0, layout.openings[0].station, 8, 15, layout.openings[1].station, layout.length].map(s => { const p = layout.point(s); return [p[0], floorAt(s), p[1]] as XYZ; });
  const portals = layout.openings.map((o, i) => ({ edgeIndex: o.edgeIndex, center: [o.center[0], floorAt(o.station), o.center[1]], outward: [layout.axis.x * (i ? 1 : -1), 0, layout.axis.z * (i ? 1 : -1)], width: layout.width, floorY: floorAt(o.station), ceilingY: layout.ceilingY, clearHeight: layout.ceilingY - floorAt(o.station), frameComponent: 'passage-portal-jamb', noDoorObserved: true }));
  shell.userData.humanitiesPassage = {
    sourceRoad: ROAD, sourceWay: layout.sourceWay, sourceNodeIds: layout.sourceNodeIds, buildingId: BUILDING,
    rawTags: { covered: 'yes', highway: 'pedestrian', tunnel: 'building_passage' }, origin: A, end: B, axis: layout.axis, across: layout.across,
    width: layout.width, length: layout.length, ceilingY: layout.ceilingY, genericBase: layout.base, openings: layout.openings, portals, routeWorld,
    surfaceComponents: ['passage-floor'], wallComponents: ['passage-sidewall'], ceilingComponent: 'passage-ceiling', frameComponent: 'passage-portal-jamb', pavementMasks,
    floorTriangles, floorClearance: .035, floorThickness: .12, actualTerrainTriangles: true, sourceTerrainTriangleCount: sourceTriangleCount,
    originalFootprintAndHeightUnchanged: true, firstStoreyBandBottom: layout.base + 3.22, firstStoreyBandPreserved: true,
    directPassagePhotoObserved: true, photoSource: PHOTO_SOURCE, photoIssue: 62, photoPrintedPage: 25, photoPublished: '2026-04-20', photoCaptureDate: null,
    observedEntryFeatures: ['cream concrete portal and pilasters', 'green ground-floor windows', 'upper window grille', 'brown rectangular paving', 'short yellow tactile guide', 'blue directory', 'roofed wooden noticeboard'],
    photoFaceMappingEstimated: true, photoDetailFace: 0, dimensionsEstimated: true, widthFromProcessedDefault: true, innerFinishEstimated: true, wholeFacadeReconstructed: false,
    floorDecoration: { separateColliders: 0, separateMeshes: 0, maximumSurfaceLift: .009, owner: 'passage-floor', dimensionsEstimated: true },
    geometry: { parts: parts.length, triangles: positions.length / 9, meshes: 1, textures: 0 },
  };
  function conformPathOverlay(input: number[]) {
    const rectangles = [{ s0: -2, s1: 0, n0: -4.5, n1: 4.5 }, { s0: layout.length, s1: layout.length + 2, n0: -4.5, n1: 4.5 }];
    const crossArea = (p: XYZ[]) => p.reduce((sum, a, i) => { const b = p[(i + 1) % p.length]; return sum + a[0] * b[2] - b[0] * a[2]; }, 0);
    const local = (p: XYZ) => layout.local([p[0], p[2]]);
    const groundY = (p: XYZ, tri: XYZ[]) => {
      const [a, b, c] = tri, det = (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]);
      const u = ((p[0] - a[0]) * (c[2] - a[2]) - (p[2] - a[2]) * (c[0] - a[0])) / det, v = ((b[0] - a[0]) * (p[2] - a[2]) - (b[2] - a[2]) * (p[0] - a[0])) / det;
      return a[1] + u * (b[1] - a[1]) + v * (c[1] - a[1]);
    };
    const output: number[] = []; let touchedTriangles = 0, maximumHeightChange = 0;
    const emit = (p: XYZ[]) => { for (let j = 1; j + 1 < p.length; j++) if (Math.abs(crossArea([p[0], p[j], p[j + 1]])) > 1e-8) output.push(...p[0], ...p[j], ...p[j + 1]); };
    for (let i = 0; i < input.length; i += 9) {
      const original: XYZ[] = [input.slice(i, i + 3) as XYZ, input.slice(i + 3, i + 6) as XYZ, input.slice(i + 6, i + 9) as XYZ];
      let remaining = [original], touched = false;
      for (const r of rectangles) {
        const planes = [(p: XYZ) => local(p).s - r.s0, (p: XYZ) => r.s1 - local(p).s, (p: XYZ) => local(p).n - r.n0, (p: XYZ) => r.n1 - local(p).n];
        remaining = remaining.flatMap(piece => {
          const inside = planes.reduce((p, distance) => clip(p, distance), piece);
          if (inside.length < 3 || Math.abs(crossArea(inside)) < 1e-8) return [piece];
          touched = true; let rest = piece; const outside: XYZ[][] = [];
          for (const distance of planes) { const p = clip(rest, q => -distance(q)); if (p.length >= 3 && Math.abs(crossArea(p)) > 1e-8) outside.push(p); rest = clip(rest, distance); }
          for (const terrainTri of overlayTerrain) {
            const sign = Math.sign(crossArea(terrainTri));
            let projected = inside;
            for (let k = 0; k < 3; k++) { const a = terrainTri[k], b = terrainTri[(k + 1) % 3]; projected = clip(projected, p => sign * ((b[0] - a[0]) * (p[2] - a[2]) - (b[2] - a[2]) * (p[0] - a[0]))); }
            if (projected.length < 3 || Math.abs(crossArea(projected)) < 1e-8) continue;
            let patches = [projected];
            const divisions = [...[.5, 1, 1.5].map(ds => (p: XYZ) => local(p).s - r.s0 - ds), ...[-3.5, -2.5, 2.5, 3.5].map(n => (p: XYZ) => local(p).n - n)];
            for (const line of divisions) patches = patches.flatMap(p => [clip(p, line), clip(p, q => -line(q))].filter(q => q.length >= 3 && Math.abs(crossArea(q)) > 1e-8));
            for (const patch of patches) emit(patch.map(p => {
              const q = local(p), along = r.s1 === 0 ? (q.s + 2) / 2 : (layout.length + 2 - q.s) / 2;
              const lateral = 1 - Math.max(0, Math.abs(q.n) - 2.5) / 2, weight = THREE.MathUtils.clamp(along * lateral, 0, 1);
              const y = THREE.MathUtils.lerp(p[1], groundY(p, terrainTri) + .035, weight);
              maximumHeightChange = Math.max(maximumHeightChange, Math.abs(y - p[1])); return [p[0], y, p[2]] as XYZ;
            }));
          }
          return outside;
        });
      }
      if (touched) { touchedTriangles++; for (const piece of remaining) emit(piece); }
      else output.push(...input.slice(i, i + 9));
    }
    shell.userData.humanitiesPassage.endpointOverlay = {
      rectangles, distanceFromEachEnd: 2, innerClearance: .035, originalOuterBoundaryPreserved: true,
      beforeTriangles: input.length / 9, afterTriangles: output.length / 9, touchedTriangles, maximumHeightChange,
      terrainAndRoadUnchanged: true, collisionUnchanged: true, existingPedestrianDisplayOnly: true,
    };
    input.length = 0; for (const value of output) input.push(value);
  }
  function update(_player: THREE.Vector3) {
    const a = geometry.getAttribute('position') as THREE.BufferAttribute, c = geometry.getAttribute('color') as THREE.BufferAttribute;
    let changed = false, recolored = false;
    for (const part of parts) {
      if (part.shown !== part.proxy.visible) {
        part.shown = part.proxy.visible; changed = true;
        if (part.shown) (a.array as Float32Array).set(part.original, part.start);
        else for (let i = part.start; i < part.end; i += 3) { a.array[i] = part.proxy.position.x; a.array[i + 1] = part.proxy.position.y; a.array[i + 2] = part.proxy.position.z; }
      }
      const tint = part.proxy.material.color, color = tint.getHex();
      if (part.color !== color) {
        part.color = color; recolored = true;
        const scale = [tint.r / part.baseTint.r, tint.g / part.baseTint.g, tint.b / part.baseTint.b];
        for (let i = part.start; i < part.end; i++) c.array[i] = part.originalColors[i - part.start] * scale[(i - part.start) % 3];
      }
    }
    if (changed) a.needsUpdate = true; if (recolored) c.needsUpdate = true;
    shell.visible = parts.some(p => p.proxy.visible);
  }
  return { shell, breakables, update, layout, conformPathOverlay };
}
