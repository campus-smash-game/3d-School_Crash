import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { CampusBuilding } from './fullCampus';
import type { BuildingAppearance } from './buildingAppearance';
import type { BreakableSpec } from './scene';

type Point = { x: number; z: number };
type Surface = { positions: number[]; colors: number[]; geometry?: THREE.BufferGeometry };
type Range = { surface: Surface; start: number; end: number; original: Float32Array };
type Part = { proxy: THREE.Mesh; shown: boolean; ranges: Range[] };

// 2025년 층별 도면의 북쪽 후퇴 상층과 남쪽 4층 몸체를 구분한다. 층고와 세부 치수는 추정이다.
export function createStudentCenterLandmark(scene: THREE.Scene, building: CampusBuilding, profile: BuildingAppearance, heightAt: (x: number, z: number) => number) {
  const mapped = building.points.filter((p, i, all) => i !== all.length - 1 || p[0] !== all[0][0] || p[1] !== all[0][1]);
  if (mapped.length < 3) throw new Error('Student center needs a mapped footprint.');
  const cx = mapped.reduce((s, p) => s + p[0], 0) / mapped.length, cz = mapped.reduce((s, p) => s + p[1], 0) / mapped.length, base = heightAt(cx, cz);
  // 원본 지도 남쪽 변 0→2의 방향이다. 입력 윤곽 순서를 바꿔도 방위와 기준고도는 유지한다.
  const axis = new THREE.Vector3(54.87, 0, -22.5).normalize(), front = new THREE.Vector3(-axis.z, 0, axis.x), up = new THREE.Vector3(0, 1, 0);
  const points = mapped.map(p => ({ x: (p[0] - cx) * axis.x + (p[1] - cz) * axis.z, z: (p[0] - cx) * front.x + (p[1] - cz) * front.z }));
  if (points.reduce((s, p, i) => { const q = points[(i + 1) % points.length]; return s + p.x * q.z - q.x * p.z; }, 0) < 0) points.reverse();
  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x)), minZ = Math.min(...points.map(p => p.z)), maxZ = Math.max(...points.map(p => p.z));
  const floors = [.2, 3.7, 7.2, 10.7, 14.4], lowRoof = 14.4, highRoof = 21.4, upperSetback = 13.1, southFrontX = -10.371, northFrontZ = -6.1;
  const world = (x: number, y: number, z: number) => new THREE.Vector3(cx, base + y, cz).addScaledVector(axis, x).addScaledVector(front, z);
  const ground = (x: number, z: number) => { const p = world(x, 0, z); return heightAt(p.x, p.z) - base; };
  const shell = new THREE.Group(); shell.name = `${building.id}:student-center-landmark`;
  Object.assign(shell.userData, { buildingId: building.id, role: 'building-shell', landmark: 'student-center', appearance: profile,
    localOrigin: { x: cx, y: base, z: cz }, axis: { x: axis.x, z: axis.z }, frontFacing: { x: -axis.x - front.x, z: -axis.z - front.z },
    mappedOutline: mapped.map(p => p.slice()), mappedOutlinePreserved: true, dimensions: { length: maxX - minX, depth: maxZ - minZ, height: highRoof },
    levels: { northMaximum: 6, south: 4, sixFloorExtension: 2007, floorNamesFrom2025Plan: true, uniformSixFloors: false },
    roofHeight: highRoof, southRoofHeight: lowRoof, upperSetback, upperSetbackEstimated: true, heightEstimated: true, floorHeightsEstimated: true,
    floorDatum: floors.slice(), planLevelStaggerReproduced: false, planLevelOffsetNotation: 1.815, currentExteriorStairVerified: false,
    photographedFront: 'southwest', photoOrientationEvidence: 'Photo choir sign matches room 407 in the official fourth-floor plan.',
    lowerInteriorLayoutEstimated: true, currentLedEntrancePositionVerified: false, modelCoordinates: 'D=(east,up,north); parent H is applied once after construction.' });
  scene.add(shell);
  const distant = new THREE.Group(); distant.visible = false; Object.assign(distant.userData, { buildingId: building.id, role: 'distant-building', landmark: 'student-center' }); scene.add(distant);
  const wall: Surface = { positions: [], colors: [] }, details: Surface = { positions: [], colors: [] }, glass: Surface = { positions: [], colors: [] }, surfaces = [wall, details, glass];
  const parts: Part[] = [], breakables: BreakableSpec[] = [], cube = new THREE.BoxGeometry(1, 1, 1), cubeVertices = cube.toNonIndexed().getAttribute('position');
  const materials = { stone: new THREE.MeshStandardMaterial({ color: 0xcac9bd }), metal: new THREE.MeshStandardMaterial({ color: 0x414c4c }), glass: new THREE.MeshStandardMaterial({ color: 0x49777f }) };
  const labelPositions: number[] = [], labelUVs: number[] = [];
  const labels: { owner: THREE.Mesh; start: number; original: Float32Array; shown: boolean; text: string }[] = [];
  function tri(s: Surface, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: number) { const tint = new THREE.Color(color); for (const p of [a, b, c]) { s.positions.push(p.x, p.y, p.z); s.colors.push(tint.r, tint.g, tint.b); } }
  function quad(s: Surface, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, color: number) { tri(s, a, b, c, color); tri(s, a, c, d, color); }
  function box(s: Surface, center: THREE.Vector3, size: THREE.Vector3, color: number, ex = axis, ey = up) {
    const ez = new THREE.Vector3().crossVectors(ex, ey).normalize(), tint = new THREE.Color(color);
    for (let i = 0; i < cubeVertices.count; i++) { const p = center.clone().addScaledVector(ex, cubeVertices.getX(i) * size.x).addScaledVector(ey, cubeVertices.getY(i) * size.y).addScaledVector(ez, cubeVertices.getZ(i) * size.z); s.positions.push(p.x, p.y, p.z); s.colors.push(tint.r, tint.g, tint.b); }
  }
  function component(kind: keyof typeof materials, name: string, draw: () => void, ex = axis, convex = false, extra: Record<string, unknown> = {}) {
    const starts = surfaces.map(s => s.positions.length); draw();
    const ranges = surfaces.map((surface, i) => ({ surface, start: starts[i], end: surface.positions.length, original: new Float32Array(surface.positions.slice(starts[i])) }));
    if (ranges.every(r => r.start === r.end)) return;
    const ez = new THREE.Vector3().crossVectors(ex, up).normalize(), axes = [ex, up, ez], lows = [Infinity, Infinity, Infinity], highs = [-Infinity, -Infinity, -Infinity], p = new THREE.Vector3();
    for (const r of ranges) for (let i = 0; i < r.original.length; i += 3) { p.fromArray(r.original, i); axes.forEach((a, j) => { lows[j] = Math.min(lows[j], p.dot(a)); highs[j] = Math.max(highs[j], p.dot(a)); }); }
    const proxy: THREE.Mesh = new THREE.Mesh(cube, materials[kind]); axes.forEach((a, i) => proxy.position.addScaledVector(a, (lows[i] + highs[i]) / 2));
    proxy.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ex, up, ez)); proxy.scale.set(...highs.map((v, i) => Math.max(.025, v - lows[i]) + .008) as [number, number, number]);
    const size = proxy.scale.clone(); let collisionVertices: Float32Array | undefined;
    if (convex) { const inverse = proxy.quaternion.clone().invert(), unique = new Map<string, THREE.Vector3>(); for (const r of ranges) for (let i = 0; i < r.original.length; i += 3) { const v = new THREE.Vector3().fromArray(r.original, i).sub(proxy.position).applyQuaternion(inverse); unique.set(v.toArray().map(n => n.toFixed(5)).join(','), v); } proxy.geometry = new ConvexGeometry([...unique.values()]); collisionVertices = Float32Array.from(proxy.geometry.getAttribute('position').array); proxy.scale.setScalar(1); }
    Object.assign(proxy.userData, { buildingId: building.id, landmark: 'student-center', renderProxy: true, component: name, convex, ...extra }); proxy.updateMatrix(); proxy.updateMatrixWorld(true);
    parts.push({ proxy, shown: true, ranges }); breakables.push({ mesh: proxy, size, collisionVertices, toughness: kind === 'glass' ? 6 : 11, material: kind, label: building.name });
    return proxy;
  }
  function clip(poly: Point[], coordinate: 'x' | 'z', value: number, greater: boolean) { const out: Point[] = []; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], ia = greater ? a[coordinate] >= value : a[coordinate] <= value, ib = greater ? b[coordinate] >= value : b[coordinate] <= value; if (ia) out.push(a); if (ia !== ib) { const t = (value - a[coordinate]) / (b[coordinate] - a[coordinate]); out.push({ x: THREE.MathUtils.lerp(a.x, b.x, t), z: THREE.MathUtils.lerp(a.z, b.z, t) }); } } return out; }
  function slab(poly: Point[], ys: number[], thickness: number, color: number, name: string, extra: Record<string, unknown> = {}) {
    if (poly.length < 3) return;
    component('stone', name, () => { const top = poly.map((p, i) => world(p.x, ys[i], p.z)), bottom = top.map(p => p.clone().addScaledVector(up, -thickness)); for (let i = 1; i < poly.length - 1; i++) { tri(details, top[0], top[i + 1], top[i], color); tri(details, bottom[0], bottom[i], bottom[i + 1], color); } for (let i = 0; i < poly.length; i++) { const j = (i + 1) % poly.length; quad(details, bottom[i], bottom[j], top[j], top[i], color); } }, axis, true, extra);
  }
  function wallBox(s: Surface, at: (u: number, y: number, depth?: number) => THREE.Vector3, tangent: THREE.Vector3, a: number, b: number, bottom: number, top: number, depth: number, thickness: number, color: number) { if (b - a > .005 && top - bottom > .005) box(s, at((a + b) / 2, (bottom + top) / 2, depth), new THREE.Vector3(b - a, top - bottom, thickness), color, tangent); }
  function ribbon(at: (u: number, y: number, depth?: number) => THREE.Vector3, tangent: THREE.Vector3, a: number, b: number, bottom: number, top: number, depth: number, horizontalPanes: number, tint: number) {
    if (b - a < .08 || top - bottom < .08) return;
    quad(glass, at(a, bottom, depth), at(a, top, depth), at(b, top, depth), at(b, bottom, depth), tint);
    const n = Math.max(2, Math.round((b - a) / 1.25));
    for (let k = 0; k <= n; k++) { const u = THREE.MathUtils.lerp(a, b, k / n); quad(details, at(u - .034, bottom, depth + .065), at(u - .034, top, depth + .065), at(u + .034, top, depth + .065), at(u + .034, bottom, depth + .065), 0x293f43); }
    for (let k = 0; k <= horizontalPanes; k++) { const y = THREE.MathUtils.lerp(bottom, top, k / horizontalPanes); wallBox(details, at, tangent, a, b, y - .035, y + .035, depth + .055, .065, 0x314b50); }
  }
  const upperPoly = clip(points, 'z', upperSetback, true);
  // 사진의 돌출 창은 원본 외곽 안쪽에 몸체를 물려 표현한다. 그 아래 통로는 별도 기둥과 바닥만 둔다.
  const opening = { x: southFrontX, z: -15.7, depth: 4.2, width: 8.5, floor: floors[1], ceiling: floors[2], estimated: true };
  const lowerDoorGround = Math.max(ground(southFrontX + 2.2, -24), ground(southFrontX + 2.2, -22), ground(southFrontX + 2.2, -26)) + .12;
  const lowerDoor = { x: southFrontX + 2.2, z: -24.0, width: 3.2, floor: Math.max(.2, lowerDoorGround), height: 3.0 };
  shell.userData.openUndercroft = opening; shell.userData.lowerEntrance = lowerDoor;
  // 공식 사진의 낮은 검은 전면을 북쪽 날개 남서면에 맞춘다. 문 위치와 깊이는 지도 정합 근사다.
  const bank = { minX: -29, maxX: -18, doorX: -26, doorWidth: 3, setback: -.85, doorHeight: 2.6, floor: .2, top: 3.4 };
  function facade(poly: Point[], low: number, high: number, isUpper: boolean) {
    for (let edge = 0; edge < poly.length; edge++) {
      const a = poly[edge], b = poly[(edge + 1) % poly.length], length = Math.hypot(b.x - a.x, b.z - a.z); if (length < .01) continue;
      const dx = (b.x - a.x) / length, dz = (b.z - a.z) / length, tangent = axis.clone().multiplyScalar(dx).addScaledVector(front, dz), outward = new THREE.Vector3().crossVectors(tangent, up).negate();
      const localOut = { x: dz, z: -dx }, mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      const southPhoto = !isUpper && localOut.x < -.9 && mid.x > -12 && mid.z < -6;
      const northPhoto = !isUpper && localOut.z < -.9 && mid.x < -9 && mid.z > -8;
      const photographed = southPhoto || northPhoto;
      const at = (u: number, y: number, d = 0) => world(a.x + dx * u, y, a.z + dz * u).addScaledVector(outward, d);
      const count = Math.max(1, Math.round(length / (photographed ? 6.8 : 7.2))), regularCuts = Array.from({ length: count + 1 }, (_, k) => length * k / count), cuts = new Set<number>(regularCuts);
      if (southPhoto) for (const z of [opening.z - opening.width / 2, opening.z + opening.width / 2, lowerDoor.z - lowerDoor.width / 2, lowerDoor.z + lowerDoor.width / 2]) { const u = (z - a.z) / dz; if (u > 0 && u < length) cuts.add(u); }
      if (northPhoto) for (const x of [bank.doorX - bank.doorWidth / 2, bank.doorX + bank.doorWidth / 2]) { const u = (x - a.x) / dx; if (u > 0 && u < length) cuts.add(u); }
      const lowerCuts = [...cuts].sort((x, y) => x - y), levels = isUpper ? [low, (low + high) / 2, high] : floors;
      for (let row = 0; row + 1 < levels.length; row++) {
        const sorted = !isUpper && (row === 0 || row === 1 && southPhoto) ? lowerCuts : regularCuts;
        for (let j = 0; j + 1 < sorted.length; j++) {
          const u0 = sorted[j], u1 = sorted[j + 1], middle = (u0 + u1) / 2, z = a.z + dz * middle, width = u1 - u0;
          const bottom = levels[row], top = levels[row + 1], projection = photographed && row === 2, open = photographed && row === 1;
          const depth = isUpper ? -.35 : projection ? -.10 : photographed ? open ? -opening.depth : row === 0 ? -2.2 : -1.25 : -.3;
          const doorway = southPhoto && ((row === 1 && Math.abs(z - opening.z) < opening.width / 2 - .005) || (row === 0 && Math.abs(z - lowerDoor.z) < lowerDoor.width / 2 - .005))
            || northPhoto && row === 0 && Math.abs(a.x + dx * middle - bank.doorX) < bank.doorWidth / 2 - .005;
          if (doorway) continue;
          const sampleCount = Math.max(2, Math.ceil(width / .7)), groundMax = Math.max(...Array.from({ length: sampleCount + 1 }, (_, k) => { const p = at(THREE.MathUtils.lerp(u0, u1, k / sampleCount), 0, depth); return heightAt(p.x, p.z) - base; }));
          const sill = Math.max(bottom + (projection ? .8 : row === 0 && !isUpper ? .30 : .55), groundMax + .13), head = top - (projection ? .45 : .5);
          component('glass', projection ? 'projecting-window-body' : open ? 'undercroft-back-glazing' : isUpper ? 'setback-upper-ribbon' : 'ribbon-window-bay', () => {
            wallBox(wall, at, tangent, u0, u1, row === 0 && !isUpper ? Math.min(-.4, groundMax - .3) : bottom, Math.min(sill, top), depth - .17, .34, 0xd0cfc5);
            wallBox(wall, at, tangent, u0, u1, Math.max(head, bottom), top, depth - .17, .34, 0xd9d8ce);
            if (head > sill + .12 && width > .38) {
              ribbon(at, tangent, u0 + .15, u1 - .15, sill, head, depth - .10, projection ? 1 : row === 3 || isUpper ? 3 : 1, [0x48717b, 0x517b80, 0x567d7d][(j + row) % 3]);
              for (const u of [u0 + .06, u1 - .06]) wallBox(wall, at, tangent, u - .06, u + .06, sill, head, depth - .13, .36, 0xc7c8be);
            }
            if (projection) {
              for (const u of [u0 + .10, u1 - .10]) wallBox(wall, at, tangent, u - .1, u + .1, bottom, top, -.73, 1.46, 0xc8c8bc);
              wallBox(wall, at, tangent, u0, u1, bottom, bottom + .19, -.73, 1.46, 0xb6b7aa);
              wallBox(wall, at, tangent, u0, u1, top - .15, top, -.73, 1.46, 0xe0dfd3);
            }
          }, tangent, false, { row: isUpper ? row + 4 : row, outward: outward.toArray(), photographed, projectionDepth: projection ? 1.46 : 0, bayWidth: width, terrainClipped: !isUpper && row === 0, surfaceEdge: [a.x, a.z, b.x, b.z] });
        }
      }
      if (photographed) for (const u0 of regularCuts) { const bottom = Math.min(-.4, ground(a.x + dx * u0, a.z + dz * u0) - .3); component('stone', 'undercroft-column', () => box(wall, at(u0, (bottom + floors[2]) / 2, -.40), new THREE.Vector3(.48, floors[2] - bottom, .66), 0xc5c5b8, tangent), tangent); }
      if (!isUpper) component('stone', 'fourth-floor-parapet', () => wallBox(wall, at, tangent, 0, length, lowRoof - .45, lowRoof, photographed ? -1.23 : -.3, .35, 0xd3d2c7), tangent);
    }
  }
  const facadePoints = points.filter((p, i) => { const a = points[(i + points.length - 1) % points.length], b = points[(i + 1) % points.length]; return Math.abs((p.x - a.x) * (b.z - a.z) - (p.z - a.z) * (b.x - a.x)) / Math.hypot(b.x - a.x, b.z - a.z) > .015; });
  facade(facadePoints, .2, lowRoof, false); facade(upperPoly, lowRoof, highRoof, true);
  // 오목한 지도 윤곽을 먼저 삼각분할한 뒤 구역별로 잘라 빈 모서리를 채우지 않는다.
  const outlineTriangles = THREE.ShapeUtils.triangulateShape(points.map(p => new THREE.Vector2(p.x, p.z)), []).map(face => face.map(i => points[i]));
  for (const triangle of outlineTriangles) for (let x = minX; x < maxX; x += 16) for (let z = minZ; z < maxZ; z += 16) {
    let poly = triangle; for (const [key, value, greater] of [['x', x, true], ['x', x + 16, false], ['z', z, true], ['z', z + 16, false]] as const) poly = clip(poly, key, value, greater);
    if (poly.length < 3 || Math.abs(poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + p.x * q.z - q.x * p.z; }, 0)) < .001) continue;
    const lowPoly = clip(poly, 'z', upperSetback, false), highPoly = clip(poly, 'z', upperSetback, true);
    if (lowPoly.length >= 3) slab(lowPoly, lowPoly.map(() => lowRoof - .22), .22, 0x939c96, 'mapped-low-roof', { height: lowRoof });
    if (highPoly.length >= 3) slab(highPoly, highPoly.map(() => highRoof - .22), .22, 0x9b9f96, 'mapped-high-roof', { height: highRoof });
    slab(poly, poly.map(() => floors[1]), .24, 0xaeb4ab, 'second-level-floor');
    slab(poly, poly.map(() => floors[2]), .25, 0xbfc2b7, 'projecting-level-floor');
  }
  // 남쪽 처마는 사진에서 보이는 얇은 돌출판이다. 지붕 높이와 돌출 폭은 사진 비례 추정이다.
  const southCanopy = clip(points, 'z', .05, false);
  for (let i = 0; i < southCanopy.length; i++) { const a = southCanopy[i], b = southCanopy[(i + 1) % southCanopy.length], length = Math.hypot(b.x - a.x, b.z - a.z); if (length < .02) continue; const dx = (b.x - a.x) / length, dz = (b.z - a.z) / length, tangent = axis.clone().multiplyScalar(dx).addScaledVector(front, dz); component('stone', 'thin-south-roof-overhang', () => box(wall, world((a.x + b.x) / 2 + dz * .10, lowRoof + .29, (a.z + b.z) / 2 - dx * .10), new THREE.Vector3(length + .12, .22, 1.8), 0xc7c8bb, tangent), tangent); }
  // 후퇴 상층의 옥상 난간과 작은 흰 옥상실은 사진에서 확인한 형태이며 위치와 치수는 추정이다.
  for (let x = -38; x < 10; x += 6) component('metal', 'north-setback-roof-railing', () => { box(details, world(x + 3, lowRoof + .48, northFrontZ + .5), new THREE.Vector3(5.9, .07, .07), 0x596661); for (const u of [x, x + 3, x + 5.9]) box(details, world(u, lowRoof + .24, northFrontZ + .5), new THREE.Vector3(.055, .48, .055), 0x69716c); });
  component('stone', 'white-roof-room', () => { box(wall, world(6.1, highRoof + 1.5, 22.5), new THREE.Vector3(5.5, 3, 5.8), 0xd8d8cd); box(details, world(6.1, highRoof + 3.03, 22.5), new THREE.Vector3(5.7, .14, 6), 0xaaaFA6); }, axis, false, { dimensionsEstimated: true, roomUseUnknown: true });
  // 주황 루버는 남쪽 몸체의 서남 모서리다. 최신 LED 입구의 위치와 동일하다고 가정하지 않는다.
  const orange = { minZ: -27.0, maxZ: -21.0, x: southFrontX + .05, bottom: lowerDoor.floor, top: floors[2] - .25 };
  for (let z = orange.minZ; z < orange.maxZ; z += .30) {
    const bottom = z > lowerDoor.z - lowerDoor.width / 2 && z < lowerDoor.z + lowerDoor.width / 2 ? lowerDoor.floor + lowerDoor.height + .15 : orange.bottom;
    component('metal', 'orange-vertical-louver', () => box(details, world(orange.x, (bottom + orange.top) / 2, z), new THREE.Vector3(.22, orange.top - bottom, .08), z % .6 < .3 ? 0xb56c2d : 0xcc7b32));
  }
  for (let x = southFrontX + .4; x < southFrontX + 4.2; x += .30) component('metal', 'orange-corner-return', () => box(details, world(x, (orange.bottom + orange.top) / 2, minZ + .1), new THREE.Vector3(.08, orange.top - orange.bottom, .22), 0xbc722f));
  component('glass', 'lower-orange-entrance-door', () => {
    box(glass, world(lowerDoor.x, lowerDoor.floor + lowerDoor.height / 2, lowerDoor.z), new THREE.Vector3(.08, lowerDoor.height, lowerDoor.width), 0x416d71);
    for (const z of [lowerDoor.z - lowerDoor.width / 2, lowerDoor.z, lowerDoor.z + lowerDoor.width / 2]) box(details, world(lowerDoor.x - .06, lowerDoor.floor + lowerDoor.height / 2, z), new THREE.Vector3(.12, lowerDoor.height, .07), 0x8c9d93);
    // 사진에서 보이는 어두운 상하 문틀과 고정창 구획을 근사한다.
    for (const y of [.055, lowerDoor.height - .055, lowerDoor.height - .62]) box(details, world(lowerDoor.x - .065, lowerDoor.floor + y, lowerDoor.z), new THREE.Vector3(.13, .09, lowerDoor.width), 0x64746e);
  }, axis, false, { entrance: true, floor: lowerDoor.floor, frameDimensionsEstimated: true });
  component('glass', 'upper-stair-entrance-door', () => {
    box(glass, world(opening.x + opening.depth, opening.floor + 1.55, opening.z), new THREE.Vector3(.08, 3.1, opening.width - .2), 0x3e656c);
    for (const z of [opening.z - opening.width / 2 + .1, opening.z, opening.z + opening.width / 2 - .1]) box(details, world(opening.x + opening.depth - .06, opening.floor + 1.55, z), new THREE.Vector3(.12, 3.1, .09), 0x707f78);
    for (const y of [.055, 2.48, 3.045]) box(details, world(opening.x + opening.depth - .065, opening.floor + y, opening.z), new THREE.Vector3(.13, .10, opening.width - .2), 0x566760);
  }, axis, false, { entrance: true, floor: opening.floor, frameDimensionsEstimated: true });
  const stair = { startX: southFrontX - 15.2, endX: southFrontX + .12, centerZ: opening.z, width: opening.width, bottom: 0, top: opening.floor, steps: 24, estimated: true, historicalPhoto: true };
  stair.bottom = Math.max(...[-.5, 0, .5].map(k => ground(stair.startX, stair.centerZ + k * stair.width))) + .08;
  // 좌우 지면 높이가 다른 첫 단 앞에 짧은 연결판을 둔다. 원본 지형은 그대로 유지한다.
  for (let j = 0; j < 6; j++) { const z0 = stair.centerZ - stair.width / 2 + stair.width * j / 6, z1 = stair.centerZ - stair.width / 2 + stair.width * (j + 1) / 6, x0 = stair.startX - 2.4;
    const poly = [{ x: x0, z: z0 }, { x: stair.startX, z: z0 }, { x: stair.startX, z: z1 }, { x: x0, z: z1 }], y0 = ground(x0, z0) + .045, y1 = ground(x0, z1) + .045;
    slab([poly[0], poly[1], poly[2]], [y0, stair.bottom, stair.bottom], .16, 0xaeb2a7, 'stair-terrain-approach');
    slab([poly[0], poly[2], poly[3]], [y0, stair.bottom, y1], .16, 0xaeb2a7, 'stair-terrain-approach');
  }
  for (let i = 0; i < stair.steps; i++) { const x0 = THREE.MathUtils.lerp(stair.startX, stair.endX, i / stair.steps), x1 = THREE.MathUtils.lerp(stair.startX, stair.endX, (i + 1) / stair.steps), y = THREE.MathUtils.lerp(stair.bottom, stair.top, (i + 1) / stair.steps); slab([{ x: x0, z: stair.centerZ - stair.width / 2 }, { x: x1, z: stair.centerZ - stair.width / 2 }, { x: x1, z: stair.centerZ + stair.width / 2 }, { x: x0, z: stair.centerZ + stair.width / 2 }], [y, y, y, y], .23, 0xb9b9ab, 'external-stair-step', { stairIndex: i }); }
  shell.userData.stair = stair; shell.userData.orangeLouvers = orange;
  const entryPlatform = [{ x: lowerDoor.x - 3.7, z: lowerDoor.z - 2.2 }, { x: lowerDoor.x + .6, z: lowerDoor.z - 2.2 }, { x: lowerDoor.x + .6, z: lowerDoor.z + 2.2 }, { x: lowerDoor.x - 3.7, z: lowerDoor.z + 2.2 }];
  slab(entryPlatform, entryPlatform.map(() => lowerDoor.floor), .22, 0xa4aaa0, 'lower-entrance-platform');
  const entryRamp = [{ x: lowerDoor.x - 8, z: lowerDoor.z - 2.2 }, { x: lowerDoor.x - 3.7, z: lowerDoor.z - 2.2 }, { x: lowerDoor.x - 3.7, z: lowerDoor.z + 2.2 }, { x: lowerDoor.x - 8, z: lowerDoor.z + 2.2 }], rampBase = Math.max(ground(lowerDoor.x - 8, lowerDoor.z - 2.2), ground(lowerDoor.x - 8, lowerDoor.z + 2.2)) + .04;
  slab(entryRamp, [rampBase, lowerDoor.floor, lowerDoor.floor, rampBase], .18, 0xa7afa4, 'lower-entrance-ground-connection');
  shell.userData.lowerEntrance.approachX = lowerDoor.x - 8; shell.userData.maximumHeightWithRoofRoom = highRoof + 3.1;

  const bankEdge = points.map((a, i) => [a, points[(i + 1) % points.length]]).find(([a, b]) => a.x < -29 && b.x > -11 && a.z > -7 && b.z < -5);
  if (!bankEdge) throw new Error('Student center bank facade does not match the mapped wing.');
  const [bankA, bankB] = bankEdge, bankLength = Math.hypot(bankB.x - bankA.x, bankB.z - bankA.z);
  const bankDX = (bankB.x - bankA.x) / bankLength, bankDZ = (bankB.z - bankA.z) / bankLength;
  const bankTangent = axis.clone().multiplyScalar(bankDX).addScaledVector(front, bankDZ), bankOutward = new THREE.Vector3().crossVectors(up, bankTangent);
  const bankAt = (x: number, y: number, depth: number) => world(x, y, bankA.z + (x - bankA.x) * bankDZ / bankDX).addScaledVector(bankOutward, -depth);
  const bankLocal = (x: number, depth: number): Point => {
    const p = bankAt(x, 0, depth).sub(world(0, 0, 0)); return { x: p.dot(axis), z: p.dot(front) };
  };
  const bankPoly = (x0: number, x1: number, d0: number, d1: number) => [bankLocal(x0, d0), bankLocal(x1, d0), bankLocal(x1, d1), bankLocal(x0, d1)];
  const bankBox = (s: Surface, x0: number, x1: number, y0: number, y1: number, depth: number, thickness: number, color: number) => box(s, bankAt((x0 + x1) / 2, (y0 + y1) / 2, depth), new THREE.Vector3((x1 - x0) / bankDX, y1 - y0, thickness), color, bankTangent);
  const doorLeft = bank.doorX - bank.doorWidth / 2, doorRight = bank.doorX + bank.doorWidth / 2;
  bank.floor = Math.max(bank.floor, ...[doorLeft, bank.doorX, doorRight].map(x => {
    const p = bankAt(x, 0, 2.2); return heightAt(p.x, p.z) - base + .04;
  }));
  // 문 좌우와 상부를 각각 만든다. 전체 전면을 하나의 충돌 상자로 막지 않는다.
  for (const [left, right] of [[bank.minX, doorLeft], [doorRight, bank.maxX]]) {
    const divisions = Math.ceil((right - left) / 3.4);
    for (let i = 0; i < divisions; i++) {
      const x0 = THREE.MathUtils.lerp(left, right, i / divisions), x1 = THREE.MathUtils.lerp(left, right, (i + 1) / divisions);
      component('metal', 'bank-dark-front-panel', () => {
        bankBox(details, x0, x1, bank.floor - .1, bank.top, bank.setback + .09, .18, 0x303b3d);
        for (let x = x0 + .32; x < x1; x += .42) bankBox(details, x - .012, x + .012, bank.floor, bank.top - .05, bank.setback - .012, .025, 0x485153);
      }, bankTangent, false, { bankFront: true });
    }
  }
  component('metal', 'bank-entrance-header', () => bankBox(details, doorLeft, doorRight, bank.floor + bank.doorHeight, bank.top, bank.setback + .09, .18, 0x303b3d), bankTangent);
  const bankDoor = component('glass', 'bank-entrance-door', () => {
    bankBox(glass, doorLeft, doorRight, bank.floor, bank.floor + bank.doorHeight, bank.setback + .02, .07, 0x3c646a);
    for (const x of [doorLeft + .035, bank.doorX, doorRight - .035]) bankBox(details, x - .035, x + .035, bank.floor, bank.floor + bank.doorHeight, bank.setback, .13, 0x9ca9a3);
    for (const y of [bank.floor + .045, bank.floor + bank.doorHeight - .5, bank.floor + bank.doorHeight - .045]) bankBox(details, doorLeft, doorRight, y - .045, y + .045, bank.setback, .13, 0x788a84);
  }, bankTangent, false, { entrance: true, bankFront: true, floor: bank.floor, sourcePhotoDateUnknown: true })!;
  component('metal', 'bank-entry-thin-canopy', () => bankBox(details, doorLeft - .22, doorRight + .22, bank.floor + bank.doorHeight + .02, bank.floor + bank.doorHeight + .10, bank.setback - .40, 1.05, 0xb6c2bb), bankTangent);
  // 사진의 검은 전면은 흰 기둥 앞에 있다. 깊이는 기둥을 보존하면서 맞춘 근사값이다.
  const frontFloorEdge = bank.setback - .95, approachEdge = frontFloorEdge - 1.5;
  const bankFloor = bankPoly(doorLeft - .25, doorRight + .25, frontFloorEdge, 3.3);
  slab(bankFloor, bankFloor.map(() => bank.floor), .18, 0x919c94, 'bank-entrance-floor');
  const bankApproach = bankPoly(doorLeft - .25, doorRight + .25, approachEdge, frontFloorEdge);
  const bankApproachY = bankApproach.map((p, i) => i < 2 ? ground(p.x, p.z) + .035 : bank.floor);
  slab(bankApproach, bankApproachY, .16, 0xadb3a8, 'bank-entrance-approach');

  const signText = ['신한은행', 'NH Bank', 'NH농협은행'];
  const signPositions = [-27.4, -25.0, -22.6];
  for (let i = 0; i < signText.length; i++) {
    const x = signPositions[i], width = 2.32, bottom = 2.93, top = 3.35;
    const owner = component('metal', 'bank-sign-frame', () => bankBox(details, x - width / 2, x + width / 2, bottom - .045, top + .045, bank.setback - .05, .08, 0x687776), bankTangent, false, { signText: signText[i], bankFront: true })!;
    const corners = [bankAt(x - width / 2 + .025, bottom, bank.setback - .096), bankAt(x - width / 2 + .025, top, bank.setback - .096), bankAt(x + width / 2 - .025, top, bank.setback - .096), bankAt(x + width / 2 - .025, bottom, bank.setback - .096)];
    const start = labelPositions.length, uv = [[i / 3, 0], [i / 3, 1], [(i + 1) / 3, 1], [(i + 1) / 3, 0]];
    for (const k of [0, 1, 2, 0, 2, 3]) { labelPositions.push(...corners[k].toArray()); labelUVs.push(...uv[k]); }
    labels.push({ owner, start, original: new Float32Array(labelPositions.slice(start)), shown: true, text: signText[i] });
  }
  Object.assign(shell.userData, { bankFront: { ...bank, sourcePhoto: '../references/buildings/photos/080-63.jpg', sourcePhotoDateUnknown: true, referencePlanDate: '2025-11', locationEstimated: true, dimensionsEstimated: true, frontDepthEstimated: true, interiorLayoutReproduced: false,
    mappedEdge: [bankA.x, bankA.z, bankB.x, bankB.z], outward: bankOutward.toArray(), tangent: bankTangent.toArray(), door: bankAt(bank.doorX, bank.floor, bank.setback).toArray(), doorOwner: bankDoor.uuid,
    approach: bankAt(bank.doorX, ground(bankApproach[0].x, bankApproach[0].z), approachEdge).toArray(), inside: bankAt(bank.doorX, bank.floor, 3.05).toArray(), originalBackWallOpening: { minX: doorLeft, maxX: doorRight, row: 0, setback: 2.2 }, signTexts: signText, signs: labels.map(l => ({ text: l.text, owner: l.owner.uuid, position: l.owner.position.toArray(), start: l.start / 3, count: 6 })) } });

  for (const [s, name, roughness] of [[wall, 'light-panel-envelope', .83], [details, 'frames-stairs-and-louvers', .69], [glass, 'ribbon-glazing', .27]] as const) {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(s.positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(s.colors, 3)); (geometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage); geometry.computeVertexNormals(); geometry.computeBoundingSphere(); geometry.computeBoundingBox(); s.geometry = geometry;
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness, metalness: s === glass ? .16 : .02 })); mesh.name = `student-center-${name}`; mesh.receiveShadow = true; shell.add(mesh); s.positions.length = 0; s.colors.length = 0;
  }
  const labelGeometry = new THREE.BufferGeometry(); labelGeometry.setAttribute('position', new THREE.Float32BufferAttribute(labelPositions, 3)); labelGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(labelUVs, 2)); labelGeometry.computeVertexNormals(); labelGeometry.computeBoundingBox(); labelGeometry.computeBoundingSphere();
  (labelGeometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  const canvas = document.createElement('canvas'); canvas.width = 3072; canvas.height = 192;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Unable to create student-center bank sign atlas.');
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 148px sans-serif';
  for (let i = 0; i < signText.length; i++) { ctx.fillStyle = i === 2 ? '#268b45' : '#1266a4'; ctx.fillRect(i * 1024, 0, 1024, 192); ctx.fillStyle = '#ffffff'; ctx.fillText(signText[i], i * 1024 + 512, 96, 944); }
  const signAtlas = new THREE.CanvasTexture(canvas); signAtlas.colorSpace = THREE.SRGBColorSpace; signAtlas.name = 'student-center-bank-signs';
  const labelMesh = new THREE.Mesh(labelGeometry, new THREE.MeshBasicMaterial({ map: signAtlas, side: THREE.DoubleSide, toneMapped: false })); labelMesh.name = 'student-center-bank-labels'; labelMesh.userData.labels = shell.userData.bankFront.signs; shell.add(labelMesh);
  function update(_player: THREE.Vector3) {
    const changed = new Set<Surface>();
    for (const part of parts) if (part.shown !== part.proxy.visible) { part.shown = part.proxy.visible; for (const r of part.ranges) { if (r.start === r.end) continue; const attr = r.surface.geometry!.getAttribute('position') as THREE.BufferAttribute; if (!changed.has(r.surface)) attr.clearUpdateRanges(); changed.add(r.surface); if (part.shown) (attr.array as Float32Array).set(r.original, r.start); else for (let i = r.start; i < r.end; i += 3) { attr.array[i] = part.proxy.position.x; attr.array[i + 1] = part.proxy.position.y; attr.array[i + 2] = part.proxy.position.z; } attr.addUpdateRange(r.start, r.end - r.start); } }
    for (const s of changed) s.geometry!.getAttribute('position').needsUpdate = true;
    const attr = labelGeometry.getAttribute('position') as THREE.BufferAttribute; let labelChanged = false;
    for (const label of labels) if (label.shown !== label.owner.visible) {
      if (!labelChanged) attr.clearUpdateRanges(); labelChanged = true; label.shown = label.owner.visible;
      if (label.shown) (attr.array as Float32Array).set(label.original, label.start);
      else for (let i = label.start; i < label.start + label.original.length; i += 3) { attr.array[i] = label.owner.position.x; attr.array[i + 1] = label.owner.position.y; attr.array[i + 2] = label.owner.position.z; }
      attr.addUpdateRange(label.start, label.original.length);
    }
    if (labelChanged) attr.needsUpdate = true; shell.visible = parts.some(p => p.proxy.visible);
  }
  return { breakables, update };
}
