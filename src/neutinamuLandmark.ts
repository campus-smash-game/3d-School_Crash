import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { CampusBuilding } from './fullCampus';
import type { BuildingAppearance } from './buildingAppearance';
import type { BreakableSpec } from './scene';

type Point = { x: number; z: number };
type Surface = { positions: number[]; colors: number[]; geometry?: THREE.BufferGeometry };
type Range = { surface: Surface; start: number; end: number; original: Float32Array };
type Part = { proxy: THREE.Mesh; ranges: Range[]; shown: boolean };

// 공식 자료는 본체의 지상 4층을 확인한다. 노란 부분의 높이, 방위와 낮은 남쪽 부분은 사진에 따른 추정이다.
export function createNeutinamuLandmark(scene: THREE.Scene, building: CampusBuilding, profile: BuildingAppearance, heightAt: (x: number, z: number) => number) {
  // 지도 윤곽을 북쪽 끝점부터 시계 방향으로 정렬해 입력 순서에 따른 부분 변경을 막는다.
  const ring = building.points.map(([x, z]) => [x, z]);
  if (ring.length > 1 && Math.hypot(ring[0][0] - ring.at(-1)![0], ring[0][1] - ring.at(-1)![1]) < 1e-7) ring.pop();
  if (ring.length !== 8 || ring.some(p => !p.every(Number.isFinite))) throw new Error('Neutinamu requires the reviewed eight-corner C-shaped footprint.');
  const area = ring.reduce((sum, p, i) => { const q = ring[(i + 1) % ring.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0);
  if (area > 0) ring.reverse();
  const first = ring.reduce((best, p, i) => p[1] > ring[best][1] || (p[1] === ring[best][1] && p[0] < ring[best][0]) ? i : best, 0);
  const points = [...ring.slice(first), ...ring.slice(0, first)];
  const cx = points.reduce((s, p) => s + p[0], 0) / points.length, cz = points.reduce((s, p) => s + p[1], 0) / points.length, base = heightAt(cx, cz);
  const v = points.map(p => ({ x: p[0] - cx, z: p[1] - cz }));
  const top = profile.height ?? 14, scale = top / 14, podBottom = 5.5 * scale, podTop = 10.8 * scale, southTop = 7.2 * scale;
  const body = [v[1], v[2], v[5], v[6]], south = [v[2], v[3], v[4], v[5]], pod = [v[0], v[1], v[6], v[7]];
  const fa = v[0], fb = v[1], fdx = fb.x - fa.x, fdz = fb.z - fa.z, width = Math.hypot(fdx, fdz), tx = fdx / width, tz = fdz / width;
  const nx = -tz, nz = tx, frontNormal = new THREE.Vector3(nx, 0, nz), yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(tz, tx));
  const world = (x: number, y: number, z: number) => new THREE.Vector3(cx + x, base + y, cz + z);
  const front = (u: number, y: number, offset = 0) => world(fa.x + tx * u + nx * offset, y, fa.z + tz * u + nz * offset);
  const shell = new THREE.Group(); shell.name = `${building.id}:neutinamu-landmark`;
  Object.assign(shell.userData, { buildingId: building.id, role: 'building-shell', landmark: 'neutinamu', appearance: profile, localOrigin: { x: cx, y: base, z: cz },
    axis: { x: tx, z: tz }, front: { x: nx, z: nz }, dimensions: { height: top }, levels: 4, podBottom, podTop, pod, body, south, frontEdge: { a: fa, b: fb, width }, estimated: true }); scene.add(shell);
  const distant = new THREE.Group(); distant.name = `${building.id}:neutinamu-distant`; distant.visible = false; Object.assign(distant.userData, { buildingId: building.id, role: 'distant-building', landmark: 'neutinamu' }); scene.add(distant);
  const opaque: Surface = { positions: [], colors: [] }, glass: Surface = { positions: [], colors: [] }, surfaces = [opaque, glass];
  const parts: Part[] = [], breakables: BreakableSpec[] = [], cube = new THREE.BoxGeometry(1, 1, 1), cubeDraw = cube.toNonIndexed(), cylinder = new THREE.CylinderGeometry(1, 1, 1, 16).toNonIndexed();
  const materials = { stone: new THREE.MeshStandardMaterial({ color: 0xb4b8b0 }), metal: new THREE.MeshStandardMaterial({ color: 0xe5a52e }), glass: new THREE.MeshStandardMaterial({ color: 0x54878f }) };
  function triangle(surface: Surface, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: number, normal?: THREE.Vector3) {
    if (normal && b.clone().sub(a).cross(c.clone().sub(a)).dot(normal) < 0) [b, c] = [c, b];
    const rgb = new THREE.Color(color); for (const p of [a, b, c]) { surface.positions.push(p.x, p.y, p.z); surface.colors.push(rgb.r, rgb.g, rgb.b); }
  }
  function quad(surface: Surface, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, color: number, normal?: THREE.Vector3) { triangle(surface, a, b, c, color, normal); triangle(surface, a, c, d, color, normal); }
  function drawGeometry(geometry: THREE.BufferGeometry, center: THREE.Vector3, size: THREE.Vector3, color: number, rotation = new THREE.Quaternion()) {
    const p = geometry.getAttribute('position');
    for (let i = 0; i < p.count; i += 3) { const q = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(p, i + j).multiply(size).applyQuaternion(rotation).add(center)); triangle(opaque, q[0], q[1], q[2], color); }
  }
  const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, rotation?: THREE.Quaternion) => drawGeometry(cubeDraw, world(x, y, z), new THREE.Vector3(sx, sy, sz), color, rotation);
  function component(name: string, kind: keyof typeof materials, draw: () => void, rotation = new THREE.Quaternion(), extra: Record<string, unknown> = {}, convex = false) {
    const starts = surfaces.map(surface => surface.positions.length), proxy: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> = new THREE.Mesh(cube, materials[kind]); proxy.quaternion.copy(rotation); draw();
    const inverse = rotation.clone().invert(), bounds = new THREE.Box3(), p = new THREE.Vector3(), worldVertices: THREE.Vector3[] = [];
    for (let s = 0; s < surfaces.length; s++) for (let i = starts[s]; i < surfaces[s].positions.length; i += 3) {
      p.fromArray(surfaces[s].positions, i).applyQuaternion(inverse); bounds.expandByPoint(p); if (convex) worldVertices.push(p.clone());
    }
    const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    proxy.position.copy(center.clone().applyQuaternion(rotation));
    let collisionVertices: Float32Array | undefined;
    if (convex) {
      const unique = new Map<string, THREE.Vector3>();
      for (const vertex of worldVertices) { vertex.sub(center); unique.set(vertex.toArray().map(n => n.toFixed(7)).join(','), vertex); }
      proxy.geometry = new ConvexGeometry([...unique.values()]);
      collisionVertices = new Float32Array(proxy.geometry.getAttribute('position').array);
      proxy.scale.set(1, 1, 1);
    } else { size.addScalar(.02); proxy.scale.copy(size); }
    Object.assign(proxy.userData, { buildingId: building.id, landmark: 'neutinamu', renderProxy: true, component: name, convex, renderRanges: surfaces.map((surface, i) => ({ surface: i, start: starts[i], end: surface.positions.length })), ...extra }); proxy.updateMatrix(); proxy.updateMatrixWorld(true);
    parts.push({ proxy, shown: true, ranges: surfaces.map((surface, i) => ({ surface, start: starts[i], end: surface.positions.length, original: new Float32Array(surface.positions.slice(starts[i])) })) });
    breakables.push({ mesh: proxy, size, collisionVertices, toughness: kind === 'glass' ? 7 : 11, label: building.name, material: kind });
  }
  function signedArea(poly: Point[]) { return poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + p.x * q.z - q.x * p.z; }, 0); }
  function bodyWalls(poly: Point[], height: number, levels: number, yellow: boolean) {
    const winding = Math.sign(signedArea(poly));
    for (let edge = 0; edge < poly.length; edge++) {
      const a = poly[edge], b = poly[(edge + 1) % poly.length], dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz), ex = dx / len, ez = dz / len, ox = winding * ez, oz = -winding * ex;
      const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(ez, ex)), normal = new THREE.Vector3(ox, 0, oz), cols = Math.ceil(len / 3.2);
      for (let col = 0; col < cols; col++) for (let floor = 0; floor < levels; floor++) {
        const x = a.x + dx * (col + .5) / cols, z = a.z + dz * (col + .5) / cols, w = len / cols;
        let minGround = base, maxGround = -Infinity;
        for (let j = 0; j <= 8; j++) for (const offset of [-.32, .32]) { const s = (col + j / 8) / cols, ground = heightAt(cx + a.x + dx * s + ox * offset, cz + a.z + dz * s + oz * offset); minGround = Math.min(minGround, ground); maxGround = Math.max(maxGround, ground); }
        const low = floor ? floor * height / levels : minGround - base - .4, high = (floor + 1) * height / levels, bottom = Math.max(floor * height / levels + .55, maxGround - base + .18);
        const blank = !yellow && edge === 3;
        component(yellow ? 'estimated-south-wall' : blank ? 'blank-concrete-end' : 'concrete-window-wall', 'stone', () => {
          box(x, (low + high) / 2, z, w, high - low, .42, yellow ? 0xe6b250 : 0xb9bcb6, rotation);
          const point = (u: number, y: number, offset: number) => world(x + ex * u + ox * offset, y, z + ez * u + oz * offset);
          if (!blank && bottom < high - .45) {
            const half = w * .38, upper = high - .36;
            quad(glass, point(-half, bottom, .225), point(half, bottom, .225), point(half, upper, .225), point(-half, upper, .225), yellow ? 0x456f72 : 0x6c9393, normal);
            for (const u of [-half, 0, half]) box(x + ex * u + ox * .25, (bottom + upper) / 2, z + ez * u + oz * .25, .055, upper - bottom, .085, 0xd2b46f, rotation);
            for (const y of [bottom, upper]) box(x + ox * .25, y, z + oz * .25, half * 2, .065, .085, 0xb2b6a7, rotation);
          }
          if (blank) for (let y = low + .8; y < high; y += 1.1) for (const u of [-w * .28, w * .28]) box(x + ex * u + ox * .218, y, z + ez * u + oz * .218, .045, .045, .02, 0x747f7a, rotation);
        }, rotation);
      }
    }
  }
  bodyWalls(body, top, 4, false); bodyWalls(south, southTop, 2, true);
  function horizontalSlab(poly: Point[], height: number, name: string, color: number, thickness = .24) {
    const triangles = THREE.ShapeUtils.triangulateShape(poly.map(p => new THREE.Vector2(p.x, p.z)), []);
    for (const face of triangles) {
      const p = face.map(i => poly[i]);
      // 삼각형 프리즘별로 파괴와 충돌을 처리해 지붕의 실제 경계와 C자 안쪽 공간을 보존한다.
      const subdivide = (a: Point, b: Point, c: Point, depth: number) => {
        if (depth > 0) { const ab = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }, bc = { x: (b.x + c.x) / 2, z: (b.z + c.z) / 2 }, ca = { x: (c.x + a.x) / 2, z: (c.z + a.z) / 2 }; subdivide(a, ab, ca, depth - 1); subdivide(ab, b, bc, depth - 1); subdivide(ca, bc, c, depth - 1); subdivide(ab, bc, ca, depth - 1); return; }
        component(name, 'metal', () => {
          for (const side of [-1, 1]) triangle(opaque, world(a.x, height + side * thickness / 2, a.z), world(b.x, height + side * thickness / 2, b.z), world(c.x, height + side * thickness / 2, c.z), color, new THREE.Vector3(0, side, 0));
          for (const [s, t] of [[a, b], [b, c], [c, a]]) quad(opaque, world(s.x, height - thickness / 2, s.z), world(t.x, height - thickness / 2, t.z), world(t.x, height + thickness / 2, t.z), world(s.x, height + thickness / 2, s.z), color, new THREE.Vector3(t.z - s.z, 0, s.x - t.x).multiplyScalar(Math.sign(signedArea([a, b, c]))));
        }, new THREE.Quaternion(), {}, true);
      };
      subdivide(p[0], p[1], p[2], 2);
    }
  }
  horizontalSlab(body, top, 'concrete-roof', 0xacb3ac); horizontalSlab(south, southTop, 'south-roof', 0xe7b63c); horizontalSlab(pod, podBottom, 'yellow-pod-soffit', 0xefb92d, .32); horizontalSlab(pod, podTop, 'yellow-pod-roof', 0xe0aa2c, .22);
  const height = podTop - podBottom;
  const windowDefs = [
    { u: width * .32, y: podBottom + height * .64, sx: width * .18, sy: height * .57, shape: [[-.5,.35],[-.27,.5],[.3,.48],[.5,.25],[.28,-.2],[0,-.5],[-.25,-.25]] },
    { u: width * .51, y: podBottom + height * .66, sx: width * .11, sy: height * .37, shape: [[-.48,-.28],[-.32,.12],[0,.5],[.3,.2],[.5,-.22],[.12,-.45],[-.23,-.5]] },
    { u: width * .70, y: podBottom + height * .31, sx: width * .19, sy: height * .52, shape: [[-.48,-.25],[-.30,.19],[.05,.5],[.42,.22],[.5,-.22],[.2,-.48],[-.24,-.43]] },
  ];
  const rings = windowDefs.map(def => new THREE.CatmullRomCurve3(def.shape.map(([x, y]) => new THREE.Vector3(def.u + x * def.sx, def.y + y * def.sy, 0)), true, 'catmullrom', .35).getPoints(48).slice(0, -1).map(p => ({ x: p.x, y: p.y })));
  shell.userData.windows = windowDefs.map((def, i) => ({ index: i, center: front(def.u, def.y).toArray(), outline: rings[i] }));
  function span(ring: { x: number; y: number }[], u: number) {
    const values: number[] = [];
    for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; if ((a.x <= u && b.x > u) || (b.x <= u && a.x > u)) values.push(a.y + (b.y - a.y) * (u - a.x) / (b.x - a.x)); }
    return values.length ? [Math.min(...values), Math.max(...values)] : null;
  }
  // 창 둘레를 실제 48개 선분으로 잘라 각 벽 조각의 렌더와 볼록 프리즘 경계를 일치시킨다.
  const contour = [new THREE.Vector2(0, podBottom), new THREE.Vector2(width, podBottom), new THREE.Vector2(width, podTop), new THREE.Vector2(0, podTop)];
  const holes = rings.map(ring => ring.map(p => new THREE.Vector2(p.x, p.y)));
  const wallFaces = THREE.ShapeUtils.triangulateShape(contour, holes), wallPoints = [...contour, ...holes.flat()];
  for (const face of wallFaces) component('yellow-window-surround', 'metal', () => {
    const vertices = face.map(i => wallPoints[i]);
    for (const offset of [0, -.28]) triangle(opaque, front(vertices[0].x, vertices[0].y, offset), front(vertices[1].x, vertices[1].y, offset), front(vertices[2].x, vertices[2].y, offset), 0xe6ad40, frontNormal.clone().multiplyScalar(offset === 0 ? 1 : -1));
    for (let i = 0; i < 3; i++) {
      const a = vertices[i], b = vertices[(i + 1) % 3];
      const edge = front(b.x, b.y).sub(front(a.x, a.y)), normal = edge.cross(frontNormal);
      const middle = front((a.x + b.x) / 2, (a.y + b.y) / 2), center = front(vertices.reduce((s, p) => s + p.x, 0) / 3, vertices.reduce((s, p) => s + p.y, 0) / 3);
      if (normal.dot(middle.sub(center)) < 0) normal.negate();
      quad(opaque, front(a.x, a.y, 0), front(b.x, b.y, 0), front(b.x, b.y, -.28), front(a.x, a.y, -.28), 0xe6ad40, normal);
    }
  }, yaw, {}, true);
  // 창 세 개를 독립된 파괴 부품으로 나눠 파괴 후 창 중심에 노란 벽 충돌체가 남지 않게 한다.
  rings.forEach((ring, index) => {
    const def = windowDefs[index], normal = frontNormal;
    component('organic-pod-window', 'glass', () => {
      const shape = ring.map(p => new THREE.Vector2(p.x, p.y));
      for (const face of THREE.ShapeUtils.triangulateShape(shape, [])) triangle(glass, front(ring[face[0]].x, ring[face[0]].y, .02), front(ring[face[1]].x, ring[face[1]].y, .02), front(ring[face[2]].x, ring[face[2]].y, .02), 0x527d87, normal);
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length], aOuter = { x: def.u + (a.x - def.u) * 1.035, y: def.y + (a.y - def.y) * 1.035 }, bOuter = { x: def.u + (b.x - def.u) * 1.035, y: def.y + (b.y - def.y) * 1.035 };
        quad(opaque, front(a.x, a.y, .065), front(b.x, b.y, .065), front(bOuter.x, bOuter.y, .065), front(aOuter.x, aOuter.y, .065), 0x526e6f, normal);
      }
      for (const fraction of [-.15, .2]) { const u = def.u + def.sx * fraction, range = span(ring, u); if (range) { const c = front(u, (range[0] + range[1]) / 2, .07); drawGeometry(cubeDraw, c, new THREE.Vector3(.055, range[1] - range[0], .065), 0x394d50, yaw); } }
      const middleY = def.y - def.sy * .12; quad(opaque, front(def.u - def.sx * .30, middleY - .025, .075), front(def.u + def.sx * .30, middleY - .025, .075), front(def.u + def.sx * .30, middleY + .025, .075), front(def.u - def.sx * .30, middleY + .025, .075), 0x394d50, normal);
    }, yaw, { windowIndex: index, center: front(def.u, def.y, .02).toArray(), outward: normal.toArray() }, true);
  });
  for (let edge = 1; edge < pod.length; edge++) {
    const a = pod[edge], b = pod[(edge + 1) % pod.length], dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz), rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(dz, dx));
    for (let i = 0; i < Math.ceil(len / 3); i++) { const cols = Math.ceil(len / 3), x = a.x + dx * (i + .5) / cols, z = a.z + dz * (i + .5) / cols; component('yellow-pod-side', 'metal', () => box(x, (podTop + podBottom) / 2, z, len / cols, height, .28, 0xe7b035, rotation), rotation); }
  }
  // 사진의 둥근 아래 테두리와 세로 모서리를 얇은 몰딩으로 근사한다. 반지름은 실측값이 아니다.
  const horizontalTrimRotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(tx, 0, tz));
  const trimRadius = .13 * scale, trimInset = .12 * scale, trimBottom = podBottom + .10 * scale;
  const trimSegments = Math.ceil((width - trimInset * 2) / 2.5);
  for (let i = 0; i < trimSegments; i++) {
    const span = (width - trimInset * 2) / trimSegments, center = front(trimInset + (i + .5) * span, trimBottom, -.03 * scale);
    component('rounded-pod-lower-trim', 'metal', () => drawGeometry(cylinder, center, new THREE.Vector3(trimRadius, span, trimRadius), 0xf0bb45, horizontalTrimRotation), horizontalTrimRotation, { estimatedRadius: trimRadius }, true);
  }
  for (const u of [trimInset, width - trimInset]) {
    const low = trimBottom + trimRadius, high = podTop - .12 * scale, count = Math.ceil((high - low) / 2.5);
    for (let i = 0; i < count; i++) {
      const span = (high - low) / count, center = front(u, low + (i + .5) * span, -.03 * scale);
      component('rounded-pod-vertical-trim', 'metal', () => drawGeometry(cylinder, center, new THREE.Vector3(trimRadius, span, trimRadius), 0xeab23a), new THREE.Quaternion(), { estimatedRadius: trimRadius }, true);
    }
  }
  const westFront = v[0], westBack = v[7], leftSpan = new THREE.Vector2(westBack.x - westFront.x, westBack.z - westFront.z);
  for (const [index, fraction] of [0.24, 0.72].entries()) {
    const topX = westFront.x + leftSpan.x * fraction + tx * 1.25, topZ = westFront.z + leftSpan.y * fraction + tz * 1.25;
    const footX = topX + (index ? tx * 1.4 : 0), footZ = topZ + (index ? tz * 1.4 : 0), footY = heightAt(cx + footX, cz + footZ) - base - .25;
    const a = world(footX, footY, footZ), b = world(topX, podBottom - .1, topZ), delta = b.clone().sub(a), rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize());
    component(index ? 'inclined-yellow-column' : 'vertical-yellow-column', 'metal', () => drawGeometry(cylinder, a.clone().add(b).multiplyScalar(.5), new THREE.Vector3(.25, delta.length(), .25), 0xeeb329, rotation), rotation);
  }
  for (const [surface, name] of [[opaque, 'concrete-yellow-frames'], [glass, 'glazing']] as const) {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(surface.positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(surface.colors, 3)); geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); surface.geometry = geometry;
    (geometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: surface === glass ? .28 : .77, metalness: surface === glass ? .15 : .06 })); mesh.name = `neutinamu-${name}`; shell.add(mesh); surface.positions.length = 0; surface.colors.length = 0;
  }
  cubeDraw.dispose(); cylinder.dispose();
  function update(_player: THREE.Vector3) {
    const changed = new Set<Surface>();
    for (const part of parts) if (part.shown !== part.proxy.visible) {
      part.shown = part.proxy.visible;
      for (const range of part.ranges) {
        if (range.start === range.end) continue; const attribute = range.surface.geometry!.getAttribute('position') as THREE.BufferAttribute;
        if (!changed.has(range.surface)) attribute.clearUpdateRanges(); changed.add(range.surface);
        if (part.shown) (attribute.array as Float32Array).set(range.original, range.start);
        else for (let i = range.start; i < range.end; i += 3) { attribute.array[i] = part.proxy.position.x; attribute.array[i + 1] = part.proxy.position.y; attribute.array[i + 2] = part.proxy.position.z; }
        attribute.addUpdateRange(range.start, range.end - range.start);
      }
    }
    for (const surface of changed) surface.geometry!.getAttribute('position').needsUpdate = true; shell.visible = parts.some(part => part.proxy.visible);
  }
  return { breakables, update };
}
