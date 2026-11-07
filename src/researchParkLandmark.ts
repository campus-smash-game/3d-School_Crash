import * as THREE from 'three';
import type { CampusBuilding } from './fullCampus';
import type { BuildingAppearance } from './buildingAppearance';
import type { BreakableSpec } from './scene';
type Point = { x: number; z: number };
type Surface = { positions: number[]; colors: number[]; geometry?: THREE.BufferGeometry };
type Range = { surface: Surface; start: number; end: number; original: Float32Array };
type Part = { proxy: THREE.Mesh; ranges: Range[]; shown: boolean };
type Kind = 'metal' | 'glass' | 'stone';

// 4층과 14m는 기존 추정값이다. 유리 격자 개수를 층수로 해석하지 않는다.
export function createResearchParkLandmark(scene: THREE.Scene, building: CampusBuilding, profile: BuildingAppearance, heightAt: (x: number, z: number) => number) {
  const points = building.points.filter((p, i, all) => i !== all.length - 1 || p[0] !== all[0][0] || p[1] !== all[0][1]);
  let longest = 0, ux = 1, uz = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length], dx = b[0] - a[0], dz = b[1] - a[1], distance = Math.hypot(dx, dz);
    if (distance > longest) { longest = distance; ux = dx / distance; uz = dz / distance; }
  }
  if (points.length < 3 || longest < 1) throw new Error('Research park requires a valid footprint.');
  if (ux < 0) { ux = -ux; uz = -uz; }
  const along = points.map(p => p[0] * ux + p[1] * uz), across = points.map(p => -p[0] * uz + p[1] * ux);
  const midX = (Math.min(...along) + Math.max(...along)) / 2, midZ = (Math.min(...across) + Math.max(...across)) / 2;
  const cx = midX * ux - midZ * uz, cz = midX * uz + midZ * ux, base = heightAt(cx, cz);
  const outline = points.map((_, i) => ({ x: along[i] - midX, z: across[i] - midZ }));
  const winding = Math.sign(outline.reduce((area, a, i) => { const b = outline[(i + 1) % outline.length]; return area + a.x * b.z - b.x * a.z; }, 0)) || 1;
  const length = Math.max(...along) - Math.min(...along), depth = Math.max(...across) - Math.min(...across), top = profile.height ?? 14;
  const right = new THREE.Vector3(ux, 0, uz), up = new THREE.Vector3(0, 1, 0), front = new THREE.Vector3(-uz, 0, ux);
  const world = (x: number, y: number, z: number) => new THREE.Vector3(cx + ux * x - uz * z, base + y, cz + uz * x + ux * z);
  const ground = (p: Point) => { const q = world(p.x, 0, p.z); return heightAt(q.x, q.z) - base; };
  const lerp = (a: Point, b: Point, t: number): Point => ({ x: THREE.MathUtils.lerp(a.x, b.x, t), z: THREE.MathUtils.lerp(a.z, b.z, t) });
  const frontZ = depth / 2;
  const frontEnds = outline.filter(p => p.z > frontZ - .1).sort((a, b) => a.x - b.x);
  if (frontEnds.length < 2) throw new Error('Research park frontage must follow the long map edge.');
  const left = frontEnds[0].x, rightEnd = frontEnds.at(-1)!.x, frontWidth = rightEnd - left, center = (left + rightEnd) / 2;
  const canopy = { left, right: rightEnd, frontZ, backZ: frontZ - 7, lowY: top * .16, highY: top * .34 };
  const foldWidth = frontWidth * .22, foldDepth = 1.8;
  const foldPoints: Point[] = Array.from({ length: 7 }, (_, i) => ({ x: center - foldWidth / 2 + i * foldWidth / 6, z: canopy.backZ + (i % 2 ? foldDepth : 0) }));
  const frontLine: Point[] = [{ x: left, z: canopy.backZ }, ...foldPoints, { x: rightEnd, z: canopy.backZ }];
  const canopyY = (z: number) => THREE.MathUtils.lerp(canopy.highY, canopy.lowY, (z - canopy.backZ) / (canopy.frontZ - canopy.backZ));
  const height = (x: number) => Math.abs(x - center) < frontWidth * .30 ? top : Math.abs(x - center) < frontWidth * .58 ? top * .77 : top * .56;
  const shell = new THREE.Group(); shell.name = building.id + ':research-park-landmark';
  Object.assign(shell.userData, { buildingId: building.id, role: 'building-shell', landmark: 'research-park', appearance: profile,
    localOrigin: { x: cx, y: base, z: cz }, axis: { x: ux, z: uz }, frontFacing: { x: front.x, z: front.z },
    dimensions: { length, depth, height: top }, dimensionsEstimated: true, levelsEstimated: true, estimatedLevels: profile.levels ?? 4,
    canopy, foldPoints, orientationEvidence: 'Northwest frontage inferred from the longest map edge and the photographed arrangement; camera bearing is unverified.' });
  scene.add(shell);
  const distant = new THREE.Group(); distant.name = building.id + ':research-park-landmark-distant'; distant.visible = false;
  Object.assign(distant.userData, { buildingId: building.id, role: 'distant-building', landmark: 'research-park' }); scene.add(distant);
  const metal: Surface = { positions: [], colors: [] }, glass: Surface = { positions: [], colors: [] }, stone: Surface = { positions: [], colors: [] };
  const surfaces = [metal, glass, stone], parts: Part[] = [], breakables: BreakableSpec[] = [], cube = new THREE.BoxGeometry(1, 1, 1);
  const materials = { metal: new THREE.MeshStandardMaterial({ color: 0x8097a0 }), glass: new THREE.MeshStandardMaterial({ color: 0x4b91b4 }), stone: new THREE.MeshStandardMaterial({ color: 0x929b98 }) };
  function triangle(surface: Surface, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, hex: number) {
    const color = new THREE.Color(hex);
    for (const p of [a, b, c]) { surface.positions.push(p.x, p.y, p.z); surface.colors.push(color.r, color.g, color.b); }
  }
  function quad(surface: Surface, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, hex: number) {
    triangle(surface, a, b, c, hex); triangle(surface, a, c, d, hex);
  }
  function ribbon(surface: Surface, a: THREE.Vector3, b: THREE.Vector3, toward: THREE.Vector3, width: number, hex: number) {
    const offset = toward.clone().normalize().multiplyScalar(width);
    quad(surface, a, b, b.clone().add(offset), a.clone().add(offset), hex);
  }
  // 접힌 유리와 경사진 차양마다 별도 OBB를 둔다. 사이의 빈 공간을 큰 AABB로 막지 않는다.
  function component(kind: Kind, name: string, xAxis: THREE.Vector3, yAxis: THREE.Vector3, draw: () => void, color?: number) {
    const starts = surfaces.map(surface => surface.positions.length); draw();
    const ranges = surfaces.map((surface, i) => ({ surface, start: starts[i], end: surface.positions.length, original: new Float32Array(surface.positions.slice(starts[i])) }));
    const ex = xAxis.clone().normalize(), ey = yAxis.clone().addScaledVector(ex, -yAxis.dot(ex)).normalize();
    const ez = new THREE.Vector3().crossVectors(ex, ey).normalize(), axes = [ex, ey, ez];
    const lows = [Infinity, Infinity, Infinity], highs = [-Infinity, -Infinity, -Infinity], p = new THREE.Vector3();
    for (const range of ranges) for (let i = 0; i < range.original.length; i += 3) {
      p.fromArray(range.original, i);
      axes.forEach((axis, j) => { const value = p.dot(axis); lows[j] = Math.min(lows[j], value); highs[j] = Math.max(highs[j], value); });
    }
    const proxy = new THREE.Mesh(cube, color === undefined ? materials[kind] : new THREE.MeshStandardMaterial({ color }));
    axes.forEach((axis, i) => proxy.position.addScaledVector(axis, (lows[i] + highs[i]) / 2));
    proxy.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ex, ey, ez));
    // 지붕과 옆벽의 윗면이 맞닿는 곳에서는 지붕 충돌면에 1cm 여유를 더 둔다.
    // 같은 사격선의 표적이 부동소수점 오차 때문에 로드 여부에 따라 바뀌지 않게 한다.
    proxy.scale.set(...highs.map((v, i) => Math.max(.06, v - lows[i]) + (name === 'stepped-roof' && i === 1 ? .045 : .025)) as [number, number, number]);
    Object.assign(proxy.userData, { buildingId: building.id, renderProxy: true, landmark: 'research-park', component: name });
    proxy.updateMatrix(); proxy.updateMatrixWorld(true);
    parts.push({ proxy, ranges, shown: true });
    breakables.push({ mesh: proxy, size: proxy.scale.clone(), toughness: kind === 'glass' ? 5 : kind === 'stone' ? 12 : 9, label: building.name, material: kind });
  }
  function plate(surface: Surface, corners: THREE.Vector3[], thickness: number, hex: number) {
    const normal = new THREE.Vector3().crossVectors(corners[1].clone().sub(corners[0]), corners[3].clone().sub(corners[0])).normalize();
    const a = corners.map(p => p.clone().addScaledVector(normal, thickness / 2)), b = corners.map(p => p.clone().addScaledVector(normal, -thickness / 2));
    quad(surface, a[0], a[1], a[2], a[3], hex); quad(surface, b[3], b[2], b[1], b[0], hex);
    for (let i = 0; i < 4; i++) quad(surface, a[i], b[i], b[(i + 1) % 4], a[(i + 1) % 4], hex);
  }
  const body: Point[] = [];
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length]; body.push(a);
    if (a.z > frontZ - .1 && b.z > frontZ - .1) body.push(...(a.x < b.x ? frontLine : [...frontLine].reverse()));
  }
  const heightCuts = [center - frontWidth * .58, center - frontWidth * .30, center + frontWidth * .30, center + frontWidth * .58];
  function wall(a: Point, b: Point, y0a: number, y0b: number, roof: number, name: string, foundation = false) {
    const distance = Math.hypot(b.x - a.x, b.z - a.z), columns = Math.max(1, Math.ceil(distance / 4.5));
    for (let col = 0; col < columns; col++) {
      const aa = lerp(a, b, col / columns), bb = lerp(a, b, (col + 1) / columns);
      const bottomA = foundation ? Math.min(-.25, ground(aa) - .3) : THREE.MathUtils.lerp(y0a, y0b, col / columns);
      const bottomB = foundation ? Math.min(-.25, ground(bb) - .3) : THREE.MathUtils.lerp(y0a, y0b, (col + 1) / columns);
      const rows = Math.max(1, Math.ceil((roof - Math.min(bottomA, bottomB)) / 3));
      for (let row = 0; row < rows; row++) {
        const lowerA = THREE.MathUtils.lerp(bottomA, roof, row / rows), lowerB = THREE.MathUtils.lerp(bottomB, roof, row / rows);
        const upperA = THREE.MathUtils.lerp(bottomA, roof, (row + 1) / rows), upperB = THREE.MathUtils.lerp(bottomB, roof, (row + 1) / rows);
        const corners = [world(aa.x, lowerA, aa.z), world(bb.x, lowerB, bb.z), world(bb.x, upperB, bb.z), world(aa.x, upperA, aa.z)];
        // 기울어진 밑변도 같은 수직 평면 안에 있다. 수평 변과 위쪽 축을 OBB 기준으로 삼는다.
        const direction = world(bb.x, 0, bb.z).sub(world(aa.x, 0, aa.z));
        const color = name === 'folded-front' ? (b.z - a.z) / (b.x - a.x) > 0 ? 0x3d7d9e : 0x5b9ebc : name === 'entry-glass' ? 0x345d68 : [0x639bb7, 0x669db8, 0x6097b2][(row + col) % 3];
        component(foundation ? 'stone' : 'glass', name, direction, up, () => {
          plate(foundation ? stone : glass, corners, .12, foundation ? 0x929b98 : color);
          if (foundation) return;
          const normal = new THREE.Vector3().crossVectors(up, direction).normalize().multiplyScalar(.087 * winding);
          const face = corners.map(p => p.clone().add(normal));
          for (const t of [0, .5, .98]) ribbon(metal, face[0].clone().lerp(face[1], t), face[3].clone().lerp(face[2], t), direction, .065, 0x485d69);
          const subdivisions = name === 'entry-glass' ? 2 : 4;
          for (let k = 0; k <= subdivisions; k++) {
            const t = Math.min(1 - .075 / Math.min(upperA - lowerA, upperB - lowerB), k / subdivisions);
            ribbon(metal, face[0].clone().lerp(face[3], t), face[1].clone().lerp(face[2], t), up, .075, 0x405a68);
          }
        });
      }
    }
  }
  // 높이 단차는 사진 비례를 따른다. 뒤쪽의 오목한 지도 윤곽은 그대로 남긴다.
  for (let i = 0; i < body.length; i++) {
    const a = body[i], b = body[(i + 1) % body.length], cuts = [0, 1];
    for (const x of heightCuts) if (Math.abs(b.x - a.x) > 1e-6) { const t = (x - a.x) / (b.x - a.x); if (t > 0 && t < 1) cuts.push(t); }
    cuts.sort((a, b) => a - b);
    for (let j = 0; j < cuts.length - 1; j++) {
      const aa = lerp(a, b, cuts[j]), bb = lerp(a, b, cuts[j + 1]), middle = lerp(aa, bb, .5);
      if (Math.hypot(bb.x - aa.x, bb.z - aa.z) < .001) continue;
      const frontage = aa.x >= left - .01 && aa.x <= rightEnd + .01 && bb.x >= left - .01 && bb.x <= rightEnd + .01 && aa.z >= canopy.backZ - .01 && bb.z >= canopy.backZ - .01;
      const folded = frontage && Math.abs(middle.x - center) < foldWidth / 2 + .01;
      wall(aa, bb, frontage ? canopyY(aa.z) : 0, frontage ? canopyY(bb.z) : 0, height(middle.x), folded ? 'folded-front' : 'curtain-wall');
      if (!frontage) wall(aa, bb, -.25, -.25, .1, 'terrain-foundation', true);
    }
  }
  // 입구 유리는 차양 앞쪽의 낮은 면이다. 그 위를 수직 상자로 막지 않는다.
  const entryA = { x: winding > 0 ? rightEnd : left, z: frontZ }, entryB = { x: winding > 0 ? left : rightEnd, z: frontZ };
  wall(entryA, entryB, 0, 0, canopy.lowY, 'entry-glass');
  wall(entryA, entryB, -.25, -.25, .1, 'terrain-foundation', true);
  const canopyColumns = Math.ceil(frontWidth / 4.5), canopyRows = 3;
  for (let i = 0; i < canopyColumns; i++) for (let row = 0; row < canopyRows; row++) {
    const x0 = THREE.MathUtils.lerp(left, rightEnd, i / canopyColumns), x1 = THREE.MathUtils.lerp(left, rightEnd, (i + 1) / canopyColumns);
    const z0 = THREE.MathUtils.lerp(canopy.backZ, canopy.frontZ, row / canopyRows), z1 = THREE.MathUtils.lerp(canopy.backZ, canopy.frontZ, (row + 1) / canopyRows);
    const corners = [world(x0, canopyY(z0), z0), world(x1, canopyY(z0), z0), world(x1, canopyY(z1), z1), world(x0, canopyY(z1), z1)];
    component('glass', 'sloped-canopy', right, corners[3].clone().sub(corners[0]), () => {
      plate(glass, corners, .13, 0x92b4bd);
      const normal = new THREE.Vector3().crossVectors(corners[1].clone().sub(corners[0]), corners[3].clone().sub(corners[0])).normalize();
      if (normal.y < 0) normal.negate();
      const face = corners.map(p => p.clone().addScaledVector(normal, .09));
      for (const t of [0, .5, .985]) ribbon(metal, face[0].clone().lerp(face[1], t), face[3].clone().lerp(face[2], t), right, .06, 0xb8c5c8);
      for (const t of [0, .5, .97]) ribbon(metal, face[0].clone().lerp(face[3], t), face[1].clone().lerp(face[2], t), face[3].clone().sub(face[0]), .06, 0xb8c5c8);
    });
  }
  function clip(poly: Point[], axis: 'x' | 'z', edge: number, greater: boolean) {
    const out: Point[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], ain = greater ? a[axis] >= edge : a[axis] <= edge, bin = greater ? b[axis] >= edge : b[axis] <= edge;
      if (ain) out.push(a);
      if (ain !== bin) out.push(lerp(a, b, (edge - a[axis]) / (b[axis] - a[axis])));
    }
    return out;
  }
  const zones = [-length / 2 - .01, ...heightCuts, length / 2 + .01];
  for (let zone = 0; zone < zones.length - 1; zone++) {
    const zonePoly = clip(clip(body, 'x', zones[zone], true), 'x', zones[zone + 1], false), roof = height((zones[zone] + zones[zone + 1]) / 2);
    if (zonePoly.length < 3) continue;
    const columns = Math.ceil((zones[zone + 1] - zones[zone]) / 4), rows = Math.ceil(depth / 4);
    for (let col = 0; col < columns; col++) for (let row = 0; row < rows; row++) {
      const x0 = THREE.MathUtils.lerp(zones[zone], zones[zone + 1], col / columns), x1 = THREE.MathUtils.lerp(zones[zone], zones[zone + 1], (col + 1) / columns);
      const z0 = -depth / 2 + row / rows * depth, z1 = -depth / 2 + (row + 1) / rows * depth;
      let tile = zonePoly;
      for (const [axis, edge, greater] of [['x', x0, true], ['x', x1, false], ['z', z0, true], ['z', z1, false]] as const) tile = clip(tile, axis, edge, greater);
      if (tile.length < 3) continue;
      const faces = THREE.ShapeUtils.triangulateShape(tile.map(p => new THREE.Vector2(p.x, p.z)), []); if (!faces.length) continue;
      component('metal', 'stepped-roof', right, up, () => {
        for (const face of faces) {
          const [a, b, c] = face.map(i => world(tile[i].x, roof, tile[i].z)); triangle(metal, a, b, c, 0x819aa1);
          triangle(metal, a.clone().addScaledVector(up, -.14), c.clone().addScaledVector(up, -.14), b.clone().addScaledVector(up, -.14), 0x607980);
        }
        for (let i = 0; i < tile.length; i++) {
          const a = world(tile[i].x, roof, tile[i].z), b = world(tile[(i + 1) % tile.length].x, roof, tile[(i + 1) % tile.length].z);
          quad(metal, a, b, b.clone().addScaledVector(up, -.14), a.clone().addScaledVector(up, -.14), 0x6d858d);
        }
      });
    }
    for (let i = 0; i < zonePoly.length; i++) {
      const a = zonePoly[i], b = zonePoly[(i + 1) % zonePoly.length], m = lerp(a, b, .5), d = Math.hypot(b.x - a.x, b.z - a.z);
      if (d < .01) continue;
      const nx = -(b.z - a.z) / d * .03;
      const lower = Math.min(height(m.x + nx), height(m.x - nx));
      if (roof > lower + .1) wall(a, b, lower, lower, roof, 'upper-step-wall');
    }
  }
  for (const [surface, name, roughness, metalness] of [[metal, 'frames-and-roof', .5, .4], [glass, 'blue-glazing', .25, .23], [stone, 'foundations', .92, 0]] as const) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(surface.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(surface.colors, 3));
    (geometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
    geometry.computeVertexNormals(); geometry.computeBoundingSphere(); geometry.computeBoundingBox(); surface.geometry = geometry;
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness, metalness }));
    mesh.name = 'research-park-' + name; mesh.receiveShadow = true; shell.add(mesh);
    surface.positions.length = 0; surface.colors.length = 0;
  }
  function update(_player: THREE.Vector3) {
    const changed = new Set<Surface>();
    for (const part of parts) if (part.shown !== part.proxy.visible) {
      part.shown = part.proxy.visible;
      for (const range of part.ranges) {
        if (range.start === range.end) continue;
        const attribute = range.surface.geometry!.getAttribute('position') as THREE.BufferAttribute;
        if (!changed.has(range.surface)) attribute.clearUpdateRanges(); changed.add(range.surface);
        if (part.shown) (attribute.array as Float32Array).set(range.original, range.start);
        else for (let i = range.start; i < range.end; i += 3) { attribute.array[i] = part.proxy.position.x; attribute.array[i + 1] = part.proxy.position.y; attribute.array[i + 2] = part.proxy.position.z; }
        attribute.addUpdateRange(range.start, range.end - range.start);
      }
    }
    for (const surface of changed) surface.geometry!.getAttribute('position').needsUpdate = true;
    shell.visible = parts.some(part => part.proxy.visible);
  }
  return { breakables, update };
}
