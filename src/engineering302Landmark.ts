import * as THREE from 'three';
import type { CampusBuilding } from './fullCampus';
import type { BuildingAppearance } from './buildingAppearance';
import type { BreakableSpec } from './scene';

type Point = { x: number; z: number };
type Surface = { positions: number[]; colors: number[]; geometry?: THREE.BufferGeometry };
type Range = { surface: Surface; start: number; end: number; original: Float32Array };
type Part = { proxy: THREE.Mesh; ranges: Range[]; shown: boolean };
type Kind = 'metal' | 'glass' | 'stone';

// 지상 10층은 공식 기록이다. 35m 높이, 전면 후퇴 깊이와 부분 높이는 사진을 따른 근사값이다.
export function createEngineering302Landmark(
  scene: THREE.Scene,
  building: CampusBuilding,
  profile: BuildingAppearance,
  heightAt: (x: number, z: number) => number,
) {
  const points = building.points.filter((p, i, all) => i !== all.length - 1 || p[0] !== all[0][0] || p[1] !== all[0][1]);
  let longest = 0, ux = 0, uz = 1;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const dx = b[0] - a[0], dz = b[1] - a[1], distance = Math.hypot(dx, dz);
    if (distance > longest) { longest = distance; ux = dx / distance; uz = dz / distance; }
  }
  if (points.length < 3 || longest < 1) throw new Error('Engineering 302 requires a valid footprint.');
  if (uz < 0 || (uz === 0 && ux < 0)) { ux = -ux; uz = -uz; }
  const along = points.map(p => p[0] * ux + p[1] * uz), across = points.map(p => -p[0] * uz + p[1] * ux);
  const midX = (Math.min(...along) + Math.max(...along)) / 2, midZ = (Math.min(...across) + Math.max(...across)) / 2;
  const cx = midX * ux - midZ * uz, cz = midX * uz + midZ * ux, base = heightAt(cx, cz);
  const outline = points.map((_, i) => ({ x: along[i] - midX, z: across[i] - midZ }));
  const winding = Math.sign(outline.reduce((area, a, i) => {
    const b = outline[(i + 1) % outline.length]; return area + a.x * b.z - b.x * a.z;
  }, 0)) || 1;
  const length = Math.max(...along) - Math.min(...along), depth = Math.max(...across) - Math.min(...across);
  const top = profile.height ?? 35, storey = top / 10, frontTop = storey * 8, connectorTop = storey * 7;
  const north = new THREE.Vector3(ux, 0, uz), up = new THREE.Vector3(0, 1, 0), west = new THREE.Vector3(-uz, 0, ux);
  const world = (x: number, y: number, z: number) => new THREE.Vector3(cx + ux * x - uz * z, base + y, cz + uz * x + ux * z);
  const ground = (p: Point) => { const q = world(p.x, 0, p.z); return heightAt(q.x, q.z) - base; };
  const mainStart = -length * .103, towerEnd = -length * .222, endCap = length * .432, rearLine = -depth * .185;
  const recess = { x0: length * .214, x1: length * .292, depth: 4.8, z: depth / 2 - 4.8 };
  const shell = new THREE.Group(); shell.name = `${building.id}:engineering302-landmark`;
  Object.assign(shell.userData, {
    buildingId: building.id, role: 'building-shell', landmark: 'engineering-302', appearance: profile,
    localOrigin: { x: cx, y: base, z: cz }, axis: { x: ux, z: uz },
    dimensions: { length, depth, height: top }, dimensionsEstimated: true, documentedLevels: 10,
    frontFacing: { x: west.x, z: west.z }, frontTop, connectorTop, recess,
    orientationEvidence: 'OSM long axis retained; west frontage inferred from college-provided oblique aerial photograph.',
  });
  scene.add(shell);
  const distant = new THREE.Group(); distant.name = `${building.id}:engineering302-landmark-distant`; distant.visible = false;
  Object.assign(distant.userData, { buildingId: building.id, role: 'distant-building', landmark: 'engineering-302' }); scene.add(distant);
  const metal: Surface = { positions: [], colors: [] }, glass: Surface = { positions: [], colors: [] }, stone: Surface = { positions: [], colors: [] };
  const surfaces = [metal, glass, stone], parts: Part[] = [], breakables: BreakableSpec[] = [];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const materials = {
    metal: new THREE.MeshStandardMaterial({ color: 0xaebac2 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x527c97 }),
    stone: new THREE.MeshStandardMaterial({ color: 0xa5a9a5 }),
  };
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
  // 얇은 유리와 기울어진 X자 보마다 별도 OBB를 둔다. 빈 중앙부를 큰 AABB로 막지 않는다.
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
    proxy.scale.set(...highs.map((v, i) => Math.max(.06, v - lows[i]) + .025) as [number, number, number]);
    Object.assign(proxy.userData, { buildingId: building.id, renderProxy: true, landmark: 'engineering-302', component: name });
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
  function lineBeam(name: string, a: THREE.Vector3, b: THREE.Vector3, width: number, depth: number, color: number) {
    const ex = b.clone().sub(a).normalize(), ey = west.clone(), ez = new THREE.Vector3().crossVectors(ex, ey).normalize();
    const corner = (p: THREE.Vector3, s: number, t: number) => p.clone().addScaledVector(ey, s * depth / 2).addScaledVector(ez, t * width / 2);
    component('metal', name, ex, ey, () => {
      for (const side of [-1, 1]) {
        quad(metal, corner(a, side, -1), corner(b, side, -1), corner(b, side, 1), corner(a, side, 1), color);
        quad(metal, corner(a, -1, side), corner(b, -1, side), corner(b, 1, side), corner(a, 1, side), color);
      }
      quad(metal, corner(a, -1, -1), corner(a, 1, -1), corner(a, 1, 1), corner(a, -1, 1), color);
      quad(metal, corner(b, -1, -1), corner(b, 1, -1), corner(b, 1, 1), corner(b, -1, 1), color);
    }, color);
  }
  const height = (p: Point) => p.x < towerEnd ? top : p.x < mainStart ? connectorTop : p.x > endCap || p.z < rearLine ? top : frontTop;
  const lerp = (a: Point, b: Point, t: number): Point => ({ x: THREE.MathUtils.lerp(a.x, b.x, t), z: THREE.MathUtils.lerp(a.z, b.z, t) });
  const facade: Point[] = [];
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length], cuts = [0, 1];
    for (const x of [recess.x0, recess.x1]) if (Math.abs(b.x - a.x) > 1e-6) { const t = (x - a.x) / (b.x - a.x); if (t > 0 && t < 1) cuts.push(t); }
    cuts.sort((a, b) => a - b);
    for (let j = 0; j < cuts.length - 1; j++) {
      const first = lerp(a, b, cuts[j]), last = lerp(a, b, cuts[j + 1]), middle = lerp(first, last, .5);
      if (middle.z > depth * .43 && middle.x > recess.x0 && middle.x < recess.x1) { first.z -= recess.depth; last.z -= recess.depth; }
      for (const p of [first, last]) if (!facade.length || Math.hypot(p.x - facade.at(-1)!.x, p.z - facade.at(-1)!.z) > .001) facade.push(p);
    }
  }
  if (Math.hypot(facade[0].x - facade.at(-1)!.x, facade[0].z - facade.at(-1)!.z) < .001) facade.pop();
  function wall(a: Point, b: Point, bottom: number, ceiling: number, name: string, curtain: boolean, foundations = false) {
    const distance = Math.hypot(b.x - a.x, b.z - a.z), columns = Math.max(1, Math.ceil(distance / 6));
    for (let col = 0; col < columns; col++) {
      const aa = lerp(a, b, col / columns), bb = lerp(a, b, (col + 1) / columns);
      const start = foundations ? Math.min(bottom, ground(aa) - .35, ground(bb) - .35) : bottom;
      const rows = Math.max(1, Math.ceil((ceiling - start) / storey));
      for (let row = 0; row < rows; row++) {
        const y0 = start + (ceiling - start) * row / rows, y1 = start + (ceiling - start) * (row + 1) / rows;
        const corners = [world(aa.x, y0, aa.z), world(bb.x, y0, bb.z), world(bb.x, y1, bb.z), world(aa.x, y1, aa.z)];
        const direction = corners[1].clone().sub(corners[0]);
        const glazed = !foundations && (curtain || row === rows - 1 || row === rows - 2), color = [0x668ca7, 0x6a90aa, 0x6289a4][(row + col) % 3];
        component(foundations ? 'stone' : 'glass', foundations ? 'terrain-foundation' : name, direction, up, () => {
          plate(foundations ? stone : glass, corners, .16, foundations ? 0xa7aaa5 : color);
          if (foundations) return;
          // OSM 점 순서가 바뀌어도 띠와 프레임은 유리의 바깥쪽에 놓인다.
          const normal = new THREE.Vector3().crossVectors(up, direction).normalize().multiplyScalar(.105 * winding);
          const face = corners.map(p => p.clone().add(normal));
          if (!glazed) {
            const band = (y1 - y0) * .34;
            quad(metal, face[0], face[1], face[1].clone().addScaledVector(up, band), face[0].clone().addScaledVector(up, band), 0xb6bdc2);
            ribbon(metal, face[0].clone().addScaledVector(up, band * .5), face[1].clone().addScaledVector(up, band * .5), up, .025, 0x85929a);
          }
          for (let k = 0; k <= 3; k++) {
            const q = face[0].clone().lerp(face[1], k / 3), r = face[3].clone().lerp(face[2], k / 3);
            ribbon(metal, q, r, direction, .055, 0x3c5364);
          }
          for (const t of [0, .5, .97]) ribbon(metal, face[0].clone().lerp(face[3], t), face[1].clone().lerp(face[2], t), up, .055, 0x3c5364);
        });
      }
    }
  }
  // 지도 외곽의 남북 두 몸체와 좁은 연결부를 보존하고 전면 유리만 안으로 물린다.
  for (let i = 0; i < facade.length; i++) {
    const a = facade[i], b = facade[(i + 1) % facade.length], cuts = [0, 1];
    for (const [axis, value] of [['x', towerEnd], ['x', mainStart], ['x', endCap], ['z', rearLine]] as const) {
      if (Math.abs(b[axis] - a[axis]) < 1e-6) continue;
      const t = (value - a[axis]) / (b[axis] - a[axis]); if (t > 0 && t < 1) cuts.push(t);
    }
    cuts.sort((a, b) => a - b);
    for (let j = 0; j < cuts.length - 1; j++) {
      if (cuts[j + 1] - cuts[j] < 1e-6) continue;
      const aa = lerp(a, b, cuts[j]), bb = lerp(a, b, cuts[j + 1]), m = lerp(aa, bb, .5), roof = height(m);
      const inset = m.x > recess.x0 - .01 && m.x < recess.x1 + .01 && m.z > recess.z - .3;
      const curtain = roof === top || m.x < mainStart || inset;
      wall(aa, bb, 0, roof, inset ? 'recessed-glass' : curtain ? 'tower-curtain' : 'ribbon-facade', curtain);
      wall(aa, bb, -.25, .15, 'terrain-foundation', false, true);
    }
  }
  function clip(poly: Point[], axis: 'x' | 'z', value: number, keepGreater: boolean) {
    const out: Point[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], ain = keepGreater ? a[axis] >= value : a[axis] <= value, bin = keepGreater ? b[axis] >= value : b[axis] <= value;
      if (ain) out.push(a);
      if (ain !== bin) out.push(lerp(a, b, (value - a[axis]) / (b[axis] - a[axis])));
    }
    return out;
  }
  // 옥상 단차에 맞춰 벽을 나누고 위쪽 빈 공간을 충돌체로 채우지 않는다.
  const xCuts = [-length / 2 - .01, towerEnd, mainStart, endCap, length / 2 + .01];
  const zCuts = [-depth / 2 - .01, rearLine, depth / 2 + .01];
  for (let ix = 0; ix < xCuts.length - 1; ix++) for (let iz = 0; iz < zCuts.length - 1; iz++) {
    let zone = facade;
    for (const [axis, edge, greater] of [['x', xCuts[ix], true], ['x', xCuts[ix + 1], false], ['z', zCuts[iz], true], ['z', zCuts[iz + 1], false]] as const) zone = clip(zone, axis, edge, greater);
    if (zone.length < 3) continue;
    const roof = height({ x: (xCuts[ix] + xCuts[ix + 1]) / 2, z: (zCuts[iz] + zCuts[iz + 1]) / 2 });
    const countX = Math.ceil((xCuts[ix + 1] - xCuts[ix]) / 7), countZ = Math.ceil((zCuts[iz + 1] - zCuts[iz]) / 7);
    for (let col = 0; col < countX; col++) for (let row = 0; row < countZ; row++) {
      const x0 = THREE.MathUtils.lerp(xCuts[ix], xCuts[ix + 1], col / countX), x1 = THREE.MathUtils.lerp(xCuts[ix], xCuts[ix + 1], (col + 1) / countX);
      const z0 = THREE.MathUtils.lerp(zCuts[iz], zCuts[iz + 1], row / countZ), z1 = THREE.MathUtils.lerp(zCuts[iz], zCuts[iz + 1], (row + 1) / countZ);
      let tile = zone;
      for (const [axis, edge, greater] of [['x', x0, true], ['x', x1, false], ['z', z0, true], ['z', z1, false]] as const) tile = clip(tile, axis, edge, greater);
      if (tile.length < 3) continue;
      const triangles = THREE.ShapeUtils.triangulateShape(tile.map(p => new THREE.Vector2(p.x, p.z)), []);
      if (!triangles.length) continue;
      component('metal', 'stepped-roof', north, up, () => {
        for (const face of triangles) {
          const [a, b, c] = face.map(i => world(tile[i].x, roof, tile[i].z)); triangle(metal, a, b, c, 0xa8b5b7);
          triangle(metal, a.clone().addScaledVector(up, -.18), c.clone().addScaledVector(up, -.18), b.clone().addScaledVector(up, -.18), 0x7c8f94);
        }
        for (let i = 0; i < tile.length; i++) {
          const a = world(tile[i].x, roof, tile[i].z), b = world(tile[(i + 1) % tile.length].x, roof, tile[(i + 1) % tile.length].z);
          quad(metal, a, b, b.clone().addScaledVector(up, -.18), a.clone().addScaledVector(up, -.18), 0x879b9e);
        }
      });
    }
    // 서로 다른 높이의 내부 경계에만 노출 벽을 만든다.
    for (let i = 0; i < zone.length; i++) {
      const a = zone[i], b = zone[(i + 1) % zone.length], m = lerp(a, b, .5);
      const d = Math.hypot(b.x - a.x, b.z - a.z); if (d < .02) continue;
      const normal = { x: -(b.z - a.z) / d * .03, z: (b.x - a.x) / d * .03 };
      const other = Math.min(height({ x: m.x + normal.x, z: m.z + normal.z }), height({ x: m.x - normal.x, z: m.z - normal.z }));
      if (roof > other + .1) wall(a, b, other, roof, 'upper-setback-wall', true);
    }
  }
  const frameZ = depth / 2 - .15, x0 = recess.x0 + .35, x1 = recess.x1 - .35, y0 = top * .57, y1 = frontTop - .6, red = 0xa85e65;
  for (const [a, b] of [
    [world(x0, y0, frameZ), world(x1, y1, frameZ)], [world(x0, y1, frameZ), world(x1, y0, frameZ)],
    [world(x0, y0, frameZ), world(x0, y1, frameZ)], [world(x1, y0, frameZ), world(x1, y1, frameZ)],
    [world(x0, y0, frameZ), world(x1, y0, frameZ)], [world(x0, y1, frameZ), world(x1, y1, frameZ)],
  ]) lineBeam('red-x-frame', a, b, .48, .4, red);
  // 경사진 유리 차양에도 표면 기울기를 따르는 얇은 OBB를 쓴다.
  for (let i = 0; i < 4; i++) {
    const a = THREE.MathUtils.lerp(recess.x0, recess.x1, i / 4), b = THREE.MathUtils.lerp(recess.x0, recess.x1, (i + 1) / 4);
    const corners = [world(a, 1.25, depth / 2 + 2.5), world(b, 1.25, depth / 2 + 2.5), world(b, 7, recess.z), world(a, 7, recess.z)];
    component('glass', 'sloped-entry-canopy', north, corners[3].clone().sub(corners[0]), () => {
      plate(glass, corners, .14, 0x527f8d);
      for (const t of [0, .33, .66, 1]) ribbon(metal, corners[0].clone().lerp(corners[3], t), corners[1].clone().lerp(corners[2], t), up, .065, 0x708e98);
      ribbon(metal, corners[0], corners[3], north, .075, 0x708e98);
    });
  }
  for (const [surface, name, roughness, metalness] of [[metal, 'cladding-and-frame', .5, .42], [glass, 'blue-glazing', .28, .2], [stone, 'foundations', .92, 0]] as const) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(surface.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(surface.colors, 3));
    (geometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
    geometry.computeVertexNormals(); geometry.computeBoundingSphere(); geometry.computeBoundingBox(); surface.geometry = geometry;
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness, metalness }));
    mesh.name = `engineering302-${name}`; mesh.receiveShadow = true; shell.add(mesh);
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
        else for (let i = range.start; i < range.end; i += 3) {
          attribute.array[i] = part.proxy.position.x; attribute.array[i + 1] = part.proxy.position.y; attribute.array[i + 2] = part.proxy.position.z;
        }
        attribute.addUpdateRange(range.start, range.end - range.start);
      }
    }
    for (const surface of changed) surface.geometry!.getAttribute('position').needsUpdate = true;
    shell.visible = parts.some(part => part.proxy.visible);
  }
  return { breakables, update };
}
