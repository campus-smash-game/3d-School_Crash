import * as THREE from 'three';
import type { CampusBuilding } from './fullCampus';
import type { BuildingAppearance } from './buildingAppearance';
import type { BreakableSpec } from './scene';

type Point = { x: number; z: number };
type Surface = { positions: number[]; colors: number[]; geometry?: THREE.BufferGeometry };
type Range = { surface: Surface; start: number; end: number; original: Float32Array };
type Part = { proxy: THREE.Mesh; ranges: Range[]; shown: boolean };

// 공식 보고서의 두 매스와 옥상 차양을 반영한다. 분할 위치와 높이는 사진 비례 추정이다.
export function createSamsungResearchLandmark(
  scene: THREE.Scene, building: CampusBuilding, profile: BuildingAppearance,
  heightAt: (x: number, z: number) => number,
) {
  const points = building.points.filter((p, i, all) => i !== all.length - 1 || p[0] !== all[0][0] || p[1] !== all[0][1]);
  let ux = 1, uz = 0, longest = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length > longest) { longest = length; ux = (b[0] - a[0]) / length; uz = (b[1] - a[1]) / length; }
  }
  if (points.length < 3 || longest < 1) throw new Error('Samsung research footprint must contain a valid outline.');
  if (ux < 0) { ux = -ux; uz = -uz; }
  const along = points.map(p => p[0] * ux + p[1] * uz), across = points.map(p => -p[0] * uz + p[1] * ux);
  const minX = Math.min(...along), minZ = Math.min(...across), length = Math.max(...along) - minX, depth = Math.max(...across) - minZ;
  const cx = minX * ux - minZ * uz, cz = minX * uz + minZ * ux;
  const centre = points.reduce((sum, p) => ({ x: sum.x + p[0] / points.length, z: sum.z + p[1] / points.length }), { x: 0, z: 0 });
  const base = heightAt(centre.x, centre.z), top = profile.height ?? 35;
  const world = (x: number, y: number, z: number) => new THREE.Vector3(cx + ux * x - uz * z, base + y, cz + uz * x + ux * z);
  const orientation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(uz, ux));
  const outline = points.map(p => ({ x: p[0] * ux + p[1] * uz - minX, z: -p[0] * uz + p[1] * ux - minZ }));
  const shell = new THREE.Group(); shell.name = `${building.id}:samsung-research-landmark`;
  Object.assign(shell.userData, { buildingId: building.id, role: 'building-shell', landmark: 'samsung-research', appearance: profile,
    dimensions: { length, depth, height: top }, localOrigin: { x: cx, y: base, z: cz }, axis: { x: ux, z: uz },
    documentedAboveGroundFloors: 10, heightEstimated: true, dimensionsEstimated: true, frontDirection: { x: -uz, z: ux } });
  scene.add(shell);
  const distant = new THREE.Group(); distant.visible = false; distant.name = `${building.id}:samsung-research-distant`;
  Object.assign(distant.userData, { buildingId: building.id, role: 'distant-building', landmark: 'samsung-research' }); scene.add(distant);
  const structure: Surface = { positions: [], colors: [] }, glass: Surface = { positions: [], colors: [] }, metal: Surface = { positions: [], colors: [] };
  const surfaces = [structure, glass, metal], parts: Part[] = [], breakables: BreakableSpec[] = [];
  const cube = new THREE.BoxGeometry(1, 1, 1), axisY = new THREE.Vector3(0, 1, 0), axisX = new THREE.Vector3(1, 0, 0);
  const materials = { stone: new THREE.MeshStandardMaterial({ color: profile.wallColor }), glass: new THREE.MeshStandardMaterial({ color: profile.glassColor }), metal: new THREE.MeshStandardMaterial({ color: 0x4b5657 }) };
  const orange = profile.accentColor, frame = 0xb9b8a1;
  function triangle(surface: Surface, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, hex: number) {
    const color = new THREE.Color(hex);
    for (const p of [a, b, c]) { surface.positions.push(p.x, p.y, p.z); surface.colors.push(color.r, color.g, color.b); }
  }
  function quad(surface: Surface, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, hex: number) {
    triangle(surface, a, b, c, hex); triangle(surface, a, c, d, hex);
  }
  function box(x: number, y: number, z: number, sx: number, sy: number, sz: number, hex: number, rotation = new THREE.Quaternion(), surface = structure) {
    const p = (a: number, b: number, c: number) => { const v = new THREE.Vector3(a * sx / 2, b * sy / 2, c * sz / 2).applyQuaternion(rotation); return world(x + v.x, y + v.y, z + v.z); };
    for (const side of [-1, 1]) {
      quad(surface, p(-1, -1, side), p(1, -1, side), p(1, 1, side), p(-1, 1, side), hex);
      quad(surface, p(side, -1, -1), p(side, -1, 1), p(side, 1, 1), p(side, 1, -1), hex);
      quad(surface, p(-1, side, -1), p(1, side, -1), p(1, side, 1), p(-1, side, 1), hex);
    }
  }
  function component(x: number, y: number, z: number, sx: number, sy: number, sz: number, kind: keyof typeof materials, name: string, draw: () => void, rotation = new THREE.Quaternion()) {
    const proxy = new THREE.Mesh(cube, materials[kind]); proxy.position.copy(world(x, y, z)); proxy.quaternion.copy(orientation).multiply(rotation); proxy.scale.set(sx + .02, sy + .02, sz + .02);
    Object.assign(proxy.userData, { buildingId: building.id, renderProxy: true, landmark: 'samsung-research', component: name }); proxy.updateMatrix(); proxy.updateMatrixWorld(true);
    const starts = surfaces.map(s => s.positions.length); draw();
    parts.push({ proxy, shown: true, ranges: surfaces.map((surface, i) => ({ surface, start: starts[i], end: surface.positions.length, original: new Float32Array(surface.positions.slice(starts[i])) })) });
    breakables.push({ mesh: proxy, size: proxy.scale.clone(), toughness: kind === 'glass' ? 7 : 12, label: building.name, material: kind });
  }
  function solid(x: number, y: number, z: number, sx: number, sy: number, sz: number, hex: number, name: string, rotation = new THREE.Quaternion(), kind: keyof typeof materials = 'stone') {
    component(x, y, z, sx, sy, sz, kind, name, () => box(x, y, z, sx, sy, sz, hex, rotation, kind === 'metal' ? metal : structure), rotation);
  }
  function clip(poly: Point[], axis: 'x' | 'z', value: number, greater: boolean) {
    const result: Point[] = [], inside = (p: Point) => greater ? p[axis] >= value : p[axis] <= value;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], ai = inside(a), bi = inside(b); if (ai) result.push(a);
      if (ai !== bi) { const t = (value - a[axis]) / (b[axis] - a[axis]); result.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }); }
    }
    return result;
  }
  const masses = [
    { name: 'west-tower', x0: 0, x1: length * .34, top, floors: 10 },
    { name: 'low-connector', x0: length * .34, x1: length * .56, top: top * .43, floors: 4 },
    { name: 'east-tower', x0: length * .56, x1: length, top: top * .88, floors: 9 },
  ].map(m => ({ ...m, polygon: clip(clip(outline, 'x', m.x0, true), 'x', m.x1, false) }));
  Object.assign(shell.userData, { masses: masses.map(m => ({ ...m, floorsEstimated: true })) });
  const recesses: { x0: number; x1: number; y0: number; y1: number; frontZ: number; backZ: number }[] = [];
  for (const mass of masses) {
    const polygon = mass.polygon, floorHeight = mass.top / mass.floors;
    const signedArea = polygon.reduce((sum, p, i) => { const q = polygon[(i + 1) % polygon.length]; return sum + p.x * q.z - q.x * p.z; }, 0);
    const sign = -Math.sign(signedArea || 1), frontZ = Math.max(...polygon.map(p => p.z));
    for (let edge = 0; edge < polygon.length; edge++) {
      const a = polygon[edge], b = polygon[(edge + 1) % polygon.length], dx = b.x - a.x, dz = b.z - a.z, edgeLength = Math.hypot(dx, dz);
      if (edgeLength < .1) continue;
      const count = Math.ceil(edgeLength / 8), width = edgeLength / count, rotation = new THREE.Quaternion().setFromAxisAngle(axisY, -Math.atan2(dz, dx));
      const nx = -dz / edgeLength * sign, nz = dx / edgeLength * sign;
      for (let segment = 0; segment < count; segment++) {
        const x = a.x + dx * (segment + .5) / count, z = a.z + dz * (segment + .5) / count;
        const p0 = world(a.x + dx * segment / count, 0, a.z + dz * segment / count), p1 = world(a.x + dx * (segment + 1) / count, 0, a.z + dz * (segment + 1) / count);
        const foundation = Math.min(base, heightAt(p0.x, p0.z), heightAt(p1.x, p1.z)) - base - .45;
        solid(x, foundation / 2, z, width, -foundation, .48, 0x868f89, `${mass.name}-foundation`, rotation);
        for (let floor = 0; floor < mass.floors; floor += 2) {
          const bottom = floor * floorHeight, upper = Math.min(mass.top, (floor + 2) * floorHeight), panelHeight = upper - bottom;
          const recess = mass.name === 'west-tower' && Math.abs(z - frontZ) < .05 && x > mass.x1 * .15 && x < mass.x1 * .35 && floor === 2;
          const inset = recess ? 2.4 : 0, px = x - nx * inset, pz = z - nz * inset;
          component(px, (bottom + upper) / 2, pz, width, panelHeight, .46, 'glass', recess ? 'recessed-facade' : `${mass.name}-facade`, () => {
            box(px, (bottom + upper) / 2, pz, width, panelHeight, .45, 0x466a6e, rotation, glass);
            const at = (u: number, y: number, depth: number) => world(px + dx / edgeLength * u + nx * depth, y, pz + dz / edgeLength * u + nz * depth);
            const columns = Math.ceil(width / 1.1);
            for (let row = floor; row < Math.min(floor + 2, mass.floors); row++) for (let col = 0; col < columns; col++) {
              const lo = -width / 2 + col * width / columns, hi = lo + width / columns, low = row * floorHeight, high = low + floorHeight;
              const tint = [profile.glassColor, 0x397c87, 0x4a8692, 0x365f70][Math.abs(segment + col + row * 3) % 4];
              quad(glass, at(lo + .10, low + .18, .238), at(hi - .10, low + .18, .238), at(hi - .10, high - .18, .238), at(lo + .10, high - .18, .238), tint);
              quad(structure, at(lo, low, .252), at(lo + .12, low, .252), at(lo + .12, high, .252), at(lo, high, .252), col % 3 ? 0xc59c66 : frame);
              quad(structure, at(lo, high - .18, .254), at(hi, high - .18, .254), at(hi, high, .254), at(lo, high, .254), frame);
              const middle = (low + high) / 2;
              quad(structure, at(lo, middle - .025, .254), at(hi, middle - .025, .254), at(hi, middle + .025, .254), at(lo, middle + .025, .254), 0x74898a);
            }
          }, rotation);
          if (recess) {
            const x0 = x - width / 2, x1 = x + width / 2; recesses.push({ x0, x1, y0: bottom, y1: upper, frontZ: z, backZ: pz });
            for (const edgeX of [x0, x1]) solid(edgeX, (bottom + upper) / 2, z - 1.05, .36, panelHeight, 2.8, orange, 'orange-recess-side');
            for (const edgeY of [bottom, upper]) solid(x, edgeY, z - 1.05, width, .35, 2.8, orange, 'orange-recess-lintel');
          }
        }
      }
    }
    for (let x = mass.x0; x < mass.x1; x += 8) for (let z = 0; z < depth; z += 8) {
      const poly = clip(clip(clip(clip(polygon, 'x', x, true), 'x', x + 8, false), 'z', z, true), 'z', z + 8, false);
      if (poly.length < 3) continue;
      const xs = poly.map(p => p.x), zs = poly.map(p => p.z), x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
      if (x1 - x0 < .1 || z1 - z0 < .1) continue;
      const faces = THREE.ShapeUtils.triangulateShape(poly.map(p => new THREE.Vector2(p.x, p.z)), []);
      component((x0 + x1) / 2, mass.top - .18, (z0 + z1) / 2, x1 - x0, .36, z1 - z0, 'stone', `${mass.name}-roof`, () => {
        for (const face of faces) triangle(structure, ...face.map(i => world(poly[i].x, mass.top, poly[i].z)) as [THREE.Vector3, THREE.Vector3, THREE.Vector3], profile.roofColor);
      });
    }
  }
  Object.assign(shell.userData, { recesses });
  function orangeFrame(x0: number, x1: number, y0: number, y1: number, z: number, name: string) {
    for (const x of [x0, x1]) solid(x, (y0 + y1) / 2, z + .55, .5, y1 - y0 + .5, 1.25, orange, `${name}-frame`);
    for (const y of [y0, y1]) solid((x0 + x1) / 2, y, z + .55, x1 - x0, .5, 1.25, orange, `${name}-frame`);
    const count = Math.ceil((x1 - x0) / 7);
    for (let i = 0; i < count; i++) {
      const lo = x0 + (x1 - x0) * i / count, hi = x0 + (x1 - x0) * (i + 1) / count;
      component((lo + hi) / 2, (y0 + y1) / 2, z + .38, hi - lo, y1 - y0, .16, 'glass', `${name}-glazing`, () => {
        quad(glass, world(lo, y0, z + .48), world(hi, y0, z + .48), world(hi, y1, z + .48), world(lo, y1, z + .48), 0x69858d);
        for (let x = lo; x < hi; x += 2.2) solidVisualFrame(x, y0, y1, z + .51);
      });
    }
  }
  function solidVisualFrame(x: number, y0: number, y1: number, z: number) { box(x, (y0 + y1) / 2, z, .06, y1 - y0, .07, 0x677575); }
  orangeFrame(length * .235, length * .335, top * .73, top * .82, depth * .626, 'west-upper-projecting-window');
  orangeFrame(length * .755, length * .98, top * .66, top * .775, depth, 'east-upper-projecting-window');
  orangeFrame(length * .33, length * .60, top * .20, top * .405, depth * .626, 'connector-orange-window');

  // 차양 두 장은 기둥과 판을 분리한다. 두 매스 사이의 높은 공간에 충돌 상자를 채우지 않는다.
  const east = masses[2], canopySlope = .12, canopies = [
    { x: length * .66, z: depth * .27, width: length * .19, depth: depth * .36 },
    { x: length * .865, z: depth * .49, width: length * .19, depth: depth * .36 },
  ];
  const panelY = east.top + 3.1, tilt = new THREE.Quaternion().setFromAxisAngle(axisX, -Math.atan(canopySlope));
  for (const canopy of canopies) {
    for (let ix = 0; ix < 3; ix++) for (let iz = 0; iz < 3; iz++) {
      const x = canopy.x + (ix - 1) * canopy.width / 3, z = canopy.z + (iz - 1) * canopy.depth / 3, y = panelY + (z - canopy.z) * canopySlope;
      solid(x, y, z, canopy.width / 3 + .02, .3, canopy.depth / 3 * Math.sqrt(1 + canopySlope ** 2) + .02, 0x39494c, 'canopy-panel', tilt, 'metal');
    }
    for (const sideX of [-1, 1]) for (const sideZ of [-1, 1]) {
      const x = canopy.x + sideX * canopy.width * .34, z = canopy.z + sideZ * canopy.depth * .34, upper = panelY + (z - canopy.z) * canopySlope - .14;
      solid(x, (east.top + upper) / 2, z, .35, upper - east.top, .35, 0xb9c3bf, 'canopy-column', undefined, 'metal');
    }
    for (const sideZ of [-1, 1]) {
      const z = canopy.z + sideZ * canopy.depth * .34, y = panelY + (z - canopy.z) * canopySlope - .33;
      solid(canopy.x, y, z, canopy.width * .76, .28, .3, 0x909f9b, 'canopy-beam', undefined, 'metal');
    }
  }
  // 사진에 보이는 밝은 설비실은 차양보다 작은 옥상 구조물이다.
  for (const x of [length * .10, length * .27]) solid(x, top + .7, depth * .22, 5, 1.4, 4, 0xd2d5cd, 'west-roof-plant');
  Object.assign(shell.userData, { canopies: canopies.map(c => ({ ...c, centreHeight: panelY, slope: canopySlope })), floorDistributionEstimated: true });
  for (const [surface, name, roughness, metalness] of [[structure, 'frames-and-structure', .77, .06], [glass, 'glazing', .29, .18], [metal, 'roof-canopies', .64, .35]] as const) {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(surface.positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(surface.colors, 3));
    (geometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage); geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); surface.geometry = geometry;
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness, metalness })); mesh.name = `samsung-research-${name}`; mesh.receiveShadow = true; shell.add(mesh);
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
