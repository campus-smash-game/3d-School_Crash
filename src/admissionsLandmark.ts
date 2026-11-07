import * as THREE from 'three';
import type { CampusBuilding } from './fullCampus';
import type { BuildingAppearance } from './buildingAppearance';
import type { BreakableSpec } from './scene';

type Point = { x: number; z: number };
type Surface = { positions: number[]; colors: number[]; uvs: number[]; geometry?: THREE.BufferGeometry };
type Range = { surface: Surface; start: number; end: number; original: Float32Array };
type Part = { proxy: THREE.Mesh; shown: boolean; ranges: Range[] };
let brickTexture: THREE.DataTexture | undefined;
function masonryTexture() {
  if (brickTexture) return brickTexture;
  const width = 128, height = 64, pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const row = Math.floor(y / 16), joint = y % 16 < 1 || (x + (row % 2) * 16) % 32 < 1;
    const variation = ((Math.floor((x + row % 2 * 16) / 32) * 13 + row * 19) % 17) - 8;
    const c = joint ? [190, 168, 130] : [185 + variation, 105 + variation, 66 + variation];
    const i = (y * width + x) * 4; pixels.set([...c, 255], i);
  }
  brickTexture = new THREE.DataTexture(pixels, width, height); brickTexture.colorSpace = THREE.SRGBColorSpace;
  brickTexture.wrapS = brickTexture.wrapT = THREE.RepeatWrapping; brickTexture.magFilter = THREE.LinearFilter;
  brickTexture.minFilter = THREE.LinearMipmapLinearFilter; brickTexture.generateMipmaps = true; brickTexture.needsUpdate = true;
  return brickTexture;
}

// 공식 지상 5층을 유지한다. 17.5m와 지붕 곡률, 후퇴 깊이는 사진과 지도에 따른 추정이다.
export function createAdmissionsLandmark(scene: THREE.Scene, building: CampusBuilding, profile: BuildingAppearance, heightAt: (x: number, z: number) => number) {
  const points = building.points.filter((p, i, all) => i !== all.length - 1 || p[0] !== all[0][0] || p[1] !== all[0][1]);
  if (points.length < 3) throw new Error('Admissions landmark needs a valid footprint.');
  // 사진 오른쪽의 98동과 지도 배치를 대조해 남쪽 짧은 입면을 전면으로 추정한다.
  const edges = points.map((a, i) => ({ a, b: points[(i + 1) % points.length] })).filter(({ a, b }) => Math.hypot(b[0] - a[0], b[1] - a[1]) > 5);
  edges.sort((a, b) => (a.a[1] + a.b[1]) - (b.a[1] + b.b[1]));
  let ux = edges[0].b[0] - edges[0].a[0], uz = edges[0].b[1] - edges[0].a[1];
  const edgeLength = Math.hypot(ux, uz); ux /= edgeLength; uz /= edgeLength; if (ux < 0) { ux = -ux; uz = -uz; }
  const xs = points.map(p => p[0] * ux + p[1] * uz), zs = points.map(p => -p[0] * uz + p[1] * ux);
  const midX = (Math.min(...xs) + Math.max(...xs)) / 2, minZ = Math.min(...zs);
  const width = Math.max(...xs) - Math.min(...xs), depth = Math.max(...zs) - minZ;
  const cx = midX * ux - minZ * uz, cz = midX * uz + minZ * ux;
  const centre = { x: points.reduce((s, p) => s + p[0], 0) / points.length, z: points.reduce((s, p) => s + p[1], 0) / points.length };
  const base = heightAt(centre.x, centre.z), top = profile.height ?? 17.5, scale = top / 17.5;
  const bodyTop = 14.6 * scale, levels = 5, storey = bodyTop / levels;
  const outline = points.map((_, i) => ({ x: xs[i] - midX, z: zs[i] - minZ }));
  const centralHalf = width * .065, pierWidth = width * .027, recessWidth = width * .075;
  const recessInner = centralHalf + pierWidth, recessOuter = recessInner + recessWidth, recessDepth = 2.2;
  const right = new THREE.Vector3(ux, 0, uz), up = new THREE.Vector3(0, 1, 0), back = new THREE.Vector3(-uz, 0, ux), front = back.clone().negate();
  const world = (x: number, y: number, z: number) => new THREE.Vector3(cx + ux * x - uz * z, base + y, cz + uz * x + ux * z);
  const ground = (x: number, z: number) => { const p = world(x, 0, z); return heightAt(p.x, p.z) - base; };
  const shell = new THREE.Group(); shell.name = `${building.id}:admissions-landmark`;
  Object.assign(shell.userData, { buildingId: building.id, role: 'building-shell', landmark: 'admissions', appearance: profile,
    localOrigin: { x: cx, y: base, z: cz }, elevationReference: { ...centre, kind: 'mapped-footprint-vertex-mean', surveyed: false },
    axis: { x: ux, z: uz }, frontFacing: { x: front.x, z: front.z }, dimensions: { length: width, depth, height: top },
    levels, levelsEstimated: false, heightEstimated: true, bodyTop, centralHalf, recessInner, recessOuter, recessDepth,
    roofBays: [] as { x0: number; x1: number; z0: number; z1: number }[], directionEstimated: true }); scene.add(shell);
  const distant = new THREE.Group(); distant.name = `${building.id}:admissions-distant`; distant.visible = false;
  Object.assign(distant.userData, { buildingId: building.id, role: 'distant-building', landmark: 'admissions' }); scene.add(distant);
  const brick: Surface = { positions: [], colors: [], uvs: [] }, metal: Surface = { positions: [], colors: [], uvs: [] }, glass: Surface = { positions: [], colors: [], uvs: [] };
  const surfaces = [brick, metal, glass], parts: Part[] = [], breakables: BreakableSpec[] = [], cube = new THREE.BoxGeometry(1, 1, 1);
  const materials = { stone: new THREE.MeshStandardMaterial({ color: 0xb96d47 }), metal: new THREE.MeshStandardMaterial({ color: 0xa6b7b5 }), glass: new THREE.MeshStandardMaterial({ color: 0x649397 }) };
  function triangle(s: Surface, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: number, uv = [0, 0, 1, 0, 1, 1]) {
    const tint = new THREE.Color(color); for (const p of [a, b, c]) { s.positions.push(p.x, p.y, p.z); s.colors.push(tint.r, tint.g, tint.b); } s.uvs.push(...uv);
  }
  function quad(s: Surface, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, color: number) {
    const w = a.distanceTo(b) / 1.1, h = b.distanceTo(c) / .33;
    triangle(s, a, b, c, color, [0, 0, w, 0, w, h]); triangle(s, a, c, d, color, [0, 0, w, h, 0, h]);
  }
  function box(s: Surface, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number) {
    const p = (a: number, b: number, c: number) => world(x + a * sx / 2, y + b * sy / 2, z + c * sz / 2);
    for (const k of [-1, 1]) {
      quad(s, p(-1, -1, k), p(1, -1, k), p(1, 1, k), p(-1, 1, k), color);
      quad(s, p(k, -1, -1), p(k, -1, 1), p(k, 1, 1), p(k, 1, -1), color);
      quad(s, p(-1, k, -1), p(1, k, -1), p(1, k, 1), p(-1, k, 1), color);
    }
  }
  function component(kind: keyof typeof materials, name: string, draw: () => void, xAxis = right, yAxis = up) {
    const starts = surfaces.map(s => s.positions.length); draw();
    const ranges = surfaces.map((surface, i) => ({ surface, start: starts[i], end: surface.positions.length, original: new Float32Array(surface.positions.slice(starts[i])) }));
    const ex = xAxis.clone().normalize(), ey = yAxis.clone().addScaledVector(ex, -yAxis.dot(ex)).normalize(), ez = new THREE.Vector3().crossVectors(ex, ey).normalize();
    const axes = [ex, ey, ez], lows = [Infinity, Infinity, Infinity], highs = [-Infinity, -Infinity, -Infinity], p = new THREE.Vector3();
    for (const range of ranges) for (let i = 0; i < range.original.length; i += 3) {
      p.fromArray(range.original, i); axes.forEach((a, j) => { lows[j] = Math.min(lows[j], p.dot(a)); highs[j] = Math.max(highs[j], p.dot(a)); });
    }
    const proxy = new THREE.Mesh(cube, materials[kind]); axes.forEach((a, i) => proxy.position.addScaledVector(a, (lows[i] + highs[i]) / 2));
    proxy.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ex, ey, ez));
    proxy.scale.set(...highs.map((v, i) => Math.max(.04, v - lows[i]) + .015) as [number, number, number]);
    Object.assign(proxy.userData, { buildingId: building.id, landmark: 'admissions', renderProxy: true, component: name }); proxy.updateMatrix(); proxy.updateMatrixWorld(true);
    parts.push({ proxy, shown: true, ranges }); breakables.push({ mesh: proxy, size: proxy.scale.clone(), material: kind, toughness: kind === 'glass' ? 6 : kind === 'metal' ? 9 : 12, label: building.name });
  }
  const brickRect = (x0: number, x1: number, y0: number, y1: number, z = 0, name = 'front-brick-panel') => {
    if (x1 - x0 < .01 || y1 - y0 < .01) return;
    component('stone', name, () => box(brick, (x0 + x1) / 2, (y0 + y1) / 2, z + .16, x1 - x0, y1 - y0, .32, 0xffffff));
  };
  function glazing(x0: number, x1: number, y0: number, y1: number, z: number, name: string, columns: number, rows: number, outward = -1) {
    component('glass', name, () => {
      quad(glass, world(x0, y0, z), world(x1, y0, z), world(x1, y1, z), world(x0, y1, z), 0x64989a);
      for (let i = 0; i <= columns; i++) box(metal, THREE.MathUtils.lerp(x0, x1, i / columns), (y0 + y1) / 2, z + outward * .065, .065, y1 - y0 + .06, .08, 0xbbc8c2);
      for (let i = 0; i <= rows; i++) box(metal, (x0 + x1) / 2, THREE.MathUtils.lerp(y0, y1, i / rows), z + outward * .065, x1 - x0, .065, .08, 0xc5ccc4);
    });
  }
  // 일반 건물의 반복 창 대신, 넓은 벽돌 면 안의 작은 투공 벽돌 구역을 따로 만든다.
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? -width / 2 : recessOuter, x1 = side < 0 ? -recessOuter : width / 2, middle = (x0 + x1) / 2;
    const bottom = Math.min(0, ground(x0, 0), ground(x1, 0)) - .45;
    brickRect(x0, x1, bottom, 0, 0, 'terrain-foundation');
    for (let floor = 0; floor < levels; floor++) {
      const y0 = floor * storey, y1 = (floor + 1) * storey, openingWidth = floor ? 1.48 : 1.45;
      const low = y0 + (floor ? .98 : .15), high = y0 + (floor ? 2.40 : 2.45), left = middle - openingWidth / 2, end = middle + openingWidth / 2;
      brickRect(x0, left, y0, y1); brickRect(end, x1, y0, y1); brickRect(left, end, y0, low); brickRect(left, end, high, y1);
      if (!floor) glazing(left + .04, end - .04, low + .04, high - .04, .11, 'ground-wing-window', 5, 1);
      else component('stone', 'perforated-brick-screen', () => {
        box(metal, middle, (low + high) / 2, .22, openingWidth, high - low, .10, 0x53483a);
        const n = 7, w = openingWidth / n, h = (high - low) / n;
        for (let c = 0; c <= n; c++) box(brick, left + c * w, (low + high) / 2, -.025, .065, high - low + .045, .17, 0xffffff);
        for (let r = 0; r <= n; r++) box(brick, middle, low + r * h, -.025, openingWidth, .065, .17, 0xffffff);
      });
      for (const x of [x0 + .58, x1 - .58]) component('metal', 'short-stone-band', () => box(metal, x, y1 - .035, -.045, 1.16, .09, .09, 0x91b2ad));
    }
  }
  // 중앙 유리와 좌우 깊은 홈을 분리한다. 홈 앞에 벽 충돌체를 놓지 않는다.
  for (const side of [-1, 1]) {
    const pi0 = side < 0 ? -recessInner : centralHalf, pi1 = side < 0 ? -centralHalf : recessInner;
    brickRect(pi0, pi1, Math.min(0, ground((pi0 + pi1) / 2, 0)) - .45, 0, 0, 'terrain-foundation');
    for (let floor = 0; floor < levels; floor++) brickRect(pi0, pi1, floor * storey, (floor + 1) * storey, 0, 'central-brick-pier');
    const left = side < 0 ? -recessOuter : recessInner, end = side < 0 ? -recessInner : recessOuter;
    for (let floor = 0; floor < levels; floor++) {
      const y0 = floor * storey, y1 = (floor + 1) * storey;
      for (const x of [left, end]) component('stone', 'recess-side-wall', () => box(brick, x, (y0 + y1) / 2, recessDepth / 2, .14, storey, recessDepth, 0xffffff));
      component('stone', 'recess-floor', () => box(metal, (left + end) / 2, y0 + .04, recessDepth / 2, end - left, .12, recessDepth, 0x9faaa2));
      glazing(left + .08, end - .08, y0 + .16, y1 - .28, recessDepth, 'recess-back-glazing', 1, 2);
      if (floor) {
        brickRect(left, end, y0, y0 + .42, 0, 'recess-parapet');
        component('metal', 'recess-railing', () => {
          for (const y of [.56, .91, 1.10]) box(metal, (left + end) / 2, y0 + y, .10, end - left, .045, .045, 0xc6d1c9);
          for (const x of [left + .08, end - .08]) box(metal, x, y0 + .75, .10, .045, .75, .045, 0xc6d1c9);
        });
      }
    }
  }
  glazing(-centralHalf + .05, centralHalf - .05, .12, storey - .38, recessDepth, 'entry-glazing', 2, 1);
  // DEM 경계 보간으로 생긴 전면 단차는 전실 안의 짧은 경사 바닥으로 잇는다. 실제 경사로 실측값은 아니다.
  const entryStart = Math.min(.08, ground(0, 0) + .12), entryEnd = .08, entrySlope = (entryEnd - entryStart) / recessDepth;
  shell.userData.entryRamp = { start: entryStart, end: entryEnd, length: recessDepth, estimatedForTerrainAccess: true };
  component('stone', 'entry-floor', () => {
    const a = world(-centralHalf, entryStart, 0), b = world(centralHalf, entryStart, 0), c = world(centralHalf, entryEnd, recessDepth), d = world(-centralHalf, entryEnd, recessDepth), down = new THREE.Vector3(0, -.10, 0);
    quad(metal, a, b, c, d, 0xa7ada6); quad(metal, a.clone().add(down), d.clone().add(down), c.clone().add(down), b.clone().add(down), 0x9da39c);
    for (const [p, q] of [[a, b], [b, c], [c, d], [d, a]]) quad(metal, p, q, q.clone().add(down), p.clone().add(down), 0xa7ada6);
  }, right, up.clone().addScaledVector(back, -entrySlope).normalize());
  for (let floor = 1; floor < levels; floor++) {
    const low = floor * storey;
    brickRect(-centralHalf, centralHalf, low - .38, low + .04, 0, 'central-spandrel');
    glazing(-centralHalf + .05, centralHalf - .05, low + .08, low + storey - .40, .13, 'central-curtain', 3, 3);
  }
  brickRect(-centralHalf, centralHalf, bodyTop - .35, bodyTop, 0, 'central-spandrel');
  // 지도에 있는 북쪽 꺾임을 포함해 측면과 후면의 외곽을 유지한다. 이 창 배치는 추정이다.
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    if (a.z < .02 && b.z < .02) continue;
    const length = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(length / 5));
    const tangent = right.clone().multiplyScalar((b.x - a.x) / length).addScaledVector(back, (b.z - a.z) / length);
    const signed = Math.sign(outline.reduce((s, p, k) => { const q = outline[(k + 1) % outline.length]; return s + p.x * q.z - q.x * p.z; }, 0));
    const outward = new THREE.Vector3().crossVectors(tangent, up).multiplyScalar(-signed);
    for (let col = 0; col < n; col++) for (let floor = 0; floor < levels; floor++) {
      const aa = { x: THREE.MathUtils.lerp(a.x, b.x, col / n), z: THREE.MathUtils.lerp(a.z, b.z, col / n) }, bb = { x: THREE.MathUtils.lerp(a.x, b.x, (col + 1) / n), z: THREE.MathUtils.lerp(a.z, b.z, (col + 1) / n) };
      const y0 = floor ? floor * storey : Math.min(0, ground(aa.x, aa.z), ground(bb.x, bb.z)) - .45, y1 = (floor + 1) * storey;
      component('stone', 'estimated-side-wall', () => {
        quad(brick, world(aa.x, y0, aa.z), world(bb.x, y0, bb.z), world(bb.x, y1, bb.z), world(aa.x, y1, aa.z), 0xffffff);
        const m = world((aa.x + bb.x) / 2, floor * storey + storey * .58, (aa.z + bb.z) / 2).addScaledVector(outward, .055), halfW = Math.min(.7, length / n * .22), halfH = storey * .24;
        const p = (x: number, y: number, o = 0) => m.clone().addScaledVector(tangent, x).addScaledVector(up, y).addScaledVector(outward, o);
        quad(glass, p(-halfW, -halfH), p(halfW, -halfH), p(halfW, halfH), p(-halfW, halfH), 0x5b8589);
        for (const x of [-halfW, 0, halfW]) quad(metal, p(x - .025, -halfH, .025), p(x + .025, -halfH, .025), p(x + .025, halfH, .025), p(x - .025, halfH, .025), 0xb3c5c0);
        for (const y of [-halfH, halfH]) quad(metal, p(-halfW, y - .025, .025), p(halfW, y - .025, .025), p(halfW, y + .025, .025), p(-halfW, y + .025, .025), 0xb3c5c0);
      }, tangent, up);
    }
  }
  // 후퇴부 위를 포함한 평지붕은 실제 외곽을 잘라 작은 구획으로 만든다.
  function clip(poly: Point[], axis: 'x' | 'z', value: number, greater: boolean) {
    const out: Point[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], ia = greater ? a[axis] >= value : a[axis] <= value, ib = greater ? b[axis] >= value : b[axis] <= value;
      if (ia) out.push(a);
      if (ia !== ib) { const t = (value - a[axis]) / (b[axis] - a[axis]); out.push({ x: THREE.MathUtils.lerp(a.x, b.x, t), z: THREE.MathUtils.lerp(a.z, b.z, t) }); }
    } return out;
  }
  for (let x = -width / 2; x < width / 2; x += 5) for (let z = 0; z < depth; z += 5) {
    let tile = outline;
    for (const [axis, edge, greater] of [['x', x, true], ['x', Math.min(width / 2, x + 5), false], ['z', z, true], ['z', Math.min(depth, z + 5), false]] as const) tile = clip(tile, axis, edge, greater);
    if (tile.length < 3) continue;
    const faces = THREE.ShapeUtils.triangulateShape(tile.map(p => new THREE.Vector2(p.x, p.z)), []); if (!faces.length) continue;
    component('metal', 'mapped-flat-roof', () => { for (const f of faces) { const [a, b, c] = f.map(j => world(tile[j].x, bodyTop - .04, tile[j].z)); triangle(metal, a, b, c, 0xadb5ae); } });
  }
  // 정면 사진의 두 얕은 곡면 지붕을 만든다. 깊이 방향 곡률과 상부실 길이는 추정한다.
  const roofDepth = Math.min(12, depth * .24);
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? -width / 2 + .22 : recessOuter - .12, x1 = side < 0 ? -recessOuter + .12 : width / 2 - .22;
    const bay = { x0: x0 - .35, x1: x1 + .35, z0: -.48, z1: roofDepth + .35 }; shell.userData.roofBays.push(bay);
    const roofY = (x: number, z: number) => { const tx = (x - (bay.x0 + bay.x1) / 2) / ((bay.x1 - bay.x0) / 2), tz = (z - (bay.z0 + bay.z1) / 2) / ((bay.z1 - bay.z0) / 2); return top - .16 * scale - .52 * scale * tx * tx + .10 * scale * tz * tz; };
    const roomLow = bodyTop + .10, roomHigh = top - 1.25 * scale;
    glazing(x0 + .13, x1 - .13, roomLow, roomHigh, .22, 'upper-glass-room-front', 3, 1);
    glazing(x0 + .13, x1 - .13, roomLow, roomHigh, roofDepth - .1, 'upper-glass-room-back', 3, 1, 1);
    for (const x of [x0, x1]) for (let i = 0; i < 3; i++) {
      const z0 = roofDepth * i / 3, z1 = roofDepth * (i + 1) / 3;
      component('glass', 'upper-glass-room-side', () => {
        quad(glass, world(x, roomLow, z0), world(x, roomLow, z1), world(x, roomHigh, z1), world(x, roomHigh, z0), 0x709ca0);
        for (const z of [z0, z1]) box(metal, x, (roomLow + roomHigh) / 2, z, .075, roomHigh - roomLow, .075, 0xc0cec7);
      }, back, up);
    }
    component('metal', 'upper-room-louvres', () => { for (let i = 0; i < 5; i++) box(metal, (x0 + x1) / 2, roomHigh - .42 * scale + i * .09 * scale, .08, x1 - x0, .035, .09, 0xc0c9bf); });
    for (let col = 0; col < 6; col++) {
      const xa = THREE.MathUtils.lerp(bay.x0, bay.x1, col / 6), xb = THREE.MathUtils.lerp(bay.x0, bay.x1, (col + 1) / 6);
      component('metal', 'curved-roof-front-fascia', () => quad(metal, world(xa, roomHigh, .20), world(xb, roomHigh, .20), world(xb, roofY(xb, .20) - .09, .20), world(xa, roofY(xa, .20) - .09, .20), 0xc5ccc6));
      for (let row = 0; row < 4; row++) {
        const za = THREE.MathUtils.lerp(bay.z0, bay.z1, row / 4), zb = THREE.MathUtils.lerp(bay.z0, bay.z1, (row + 1) / 4);
        const a = world(xa, roofY(xa, za), za), b = world(xb, roofY(xb, za), za), c = world(xb, roofY(xb, zb), zb), d = world(xa, roofY(xa, zb), zb);
        const tangent = b.clone().sub(a).normalize(), normal = new THREE.Vector3().crossVectors(d.clone().sub(a), tangent).normalize();
        component('metal', 'curved-metal-roof', () => {
          quad(metal, a, b, c, d, 0x809d9d); const down = new THREE.Vector3(0, -.12 * scale, 0);
          quad(metal, a.clone().add(down), d.clone().add(down), c.clone().add(down), b.clone().add(down), 0x526968);
          for (const [p, q] of [[a, b], [b, c], [c, d], [d, a]]) quad(metal, p, q, q.clone().add(down), p.clone().add(down), 0x9bb3af);
        }, tangent, normal);
      }
    }
  }
  // 건물 번호는 사진 텍스처 없이 작은 입체 선분으로 쓴다.
  component('metal', 'building-number-150', () => {
    const digits = [[1, 2], [0, 5, 6, 2, 3], [0, 1, 2, 3, 4, 5]], x0 = -width * .37, y0 = bodyTop - .58;
    for (let d = 0; d < 3; d++) for (const segment of digits[d]) {
      const x = x0 + d * .40, w = .28, h = .50;
      if ([0, 3, 6].includes(segment)) box(metal, x, y0 + (segment === 0 ? h / 2 : segment === 3 ? -h / 2 : 0), -.13, w, .055, .065, 0xcce1d9);
      else box(metal, x + ([1, 2].includes(segment) ? w / 2 : -w / 2), y0 + ([1, 5].includes(segment) ? h / 4 : -h / 4), -.13, .055, h / 2, .065, 0xcce1d9);
    }
  });
  for (const [s, name, roughness, metalness] of [[brick, 'brick-walls', .91, 0], [metal, 'roofs-and-frames', .56, .28], [glass, 'glazing', .25, .18]] as const) {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(s.positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(s.colors, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(s.uvs, 2));
    (geometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage); geometry.computeVertexNormals(); geometry.computeBoundingSphere(); geometry.computeBoundingBox(); s.geometry = geometry;
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness, metalness, map: s === brick ? masonryTexture() : null })); mesh.name = `admissions-${name}`; mesh.receiveShadow = true; shell.add(mesh);
    s.positions.length = 0; s.colors.length = 0; s.uvs.length = 0;
  }
  function update(_player: THREE.Vector3) {
    const changed = new Set<Surface>();
    for (const part of parts) if (part.shown !== part.proxy.visible) {
      part.shown = part.proxy.visible;
      for (const r of part.ranges) {
        if (r.start === r.end) continue;
        const attr = r.surface.geometry!.getAttribute('position') as THREE.BufferAttribute;
        if (!changed.has(r.surface)) attr.clearUpdateRanges(); changed.add(r.surface);
        if (part.shown) (attr.array as Float32Array).set(r.original, r.start);
        else for (let i = r.start; i < r.end; i += 3) { attr.array[i] = part.proxy.position.x; attr.array[i + 1] = part.proxy.position.y; attr.array[i + 2] = part.proxy.position.z; }
        attr.addUpdateRange(r.start, r.end - r.start);
      }
    }
    for (const s of changed) s.geometry!.getAttribute('position').needsUpdate = true;
    shell.visible = parts.some(p => p.proxy.visible);
  }
  return { breakables, update };
}
