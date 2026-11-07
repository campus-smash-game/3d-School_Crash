import * as THREE from 'three';
import type { CampusBuilding } from './fullCampus';
import type { BuildingAppearance } from './buildingAppearance';
import type { BreakableSpec } from './scene';

type Surface = { positions: number[]; colors: number[]; uvs: number[]; geometry?: THREE.BufferGeometry };
type Range = { surface: Surface; start: number; end: number; original: Float32Array };
type Part = { proxy: THREE.Mesh; ranges: Range[]; shown: boolean };
type Point = { x: number; z: number };
type RoofBlock = { x0: number; x1: number; z0: number; z1: number };
let brickTexture: THREE.DataTexture | undefined;
function getBrickTexture() {
  if (brickTexture) return brickTexture;
  const width = 128, height = 64, pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const row = Math.floor(y / 16), bx = (x + (row % 2) * 16) % 32, joint = y % 16 < 1 || bx < 1;
    const variation = ((Math.floor((x + row % 2 * 16) / 32) * 17 + row * 31) % 19) - 9;
    const color = joint ? [158, 148, 126] : [139 + variation, 77 + variation, 54 + variation];
    const i = (y * width + x) * 4; pixels[i] = color[0]; pixels[i + 1] = color[1]; pixels[i + 2] = color[2]; pixels[i + 3] = 255;
  }
  brickTexture = new THREE.DataTexture(pixels, width, height); brickTexture.colorSpace = THREE.SRGBColorSpace;
  brickTexture.wrapS = brickTexture.wrapT = THREE.RepeatWrapping; brickTexture.magFilter = THREE.LinearFilter;
  brickTexture.minFilter = THREE.LinearMipmapLinearFilter; brickTexture.generateMipmaps = true; brickTexture.needsUpdate = true;
  return brickTexture;
}

// 5층은 생활관 공식 현황이다. 층고, 지붕 높이와 계단부 4개의 배분은 사진 비례에 따른 추정이다.
export function createFamilyDormLandmark(scene: THREE.Scene, building: CampusBuilding, profile: BuildingAppearance, heightAt: (x: number, z: number) => number) {
  const points = building.points.filter((p, i, all) => i !== all.length - 1 || p[0] !== all[0][0] || p[1] !== all[0][1]);
  let longest = 0, ux = 1, uz = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length], dx = b[0] - a[0], dz = b[1] - a[1], distance = Math.hypot(dx, dz);
    if (distance > longest) { longest = distance; ux = dx / distance; uz = dz / distance; }
  }
  if (points.length < 3 || longest < 1) throw new Error('Family dormitory footprint must contain a valid outline.');
  if (ux < 0) { ux = -ux; uz = -uz; }
  const xs = points.map(p => p[0] * ux + p[1] * uz), zs = points.map(p => -p[0] * uz + p[1] * ux);
  const minX = Math.min(...xs), minZ = Math.min(...zs), length = Math.max(...xs) - minX, depth = Math.max(...zs) - minZ;
  const cx = minX * ux - minZ * uz, cz = minX * uz + minZ * ux;
  const centre = { x: points.reduce((sum, p) => sum + p[0], 0) / points.length, z: points.reduce((sum, p) => sum + p[1], 0) / points.length };
  const base = heightAt(centre.x, centre.z), top = profile.height ?? 17.5, roofRise = 2, bodyTop = top - roofRise, levels = 5, floorHeight = bodyTop / levels;
  const frontSign = building.id === 'way/439707892' ? 1 : -1, stairWidth = Math.min(2.6, length / 17), stairXs = Array.from({ length: 4 }, (_, i) => length * (i + .5) / 4);
  const outline = points.map(p => ({ x: p[0] * ux + p[1] * uz - minX, z: -p[0] * uz + p[1] * ux - minZ }));
  const winding = Math.sign(outline.reduce((sum, p, i) => { const q = outline[(i + 1) % outline.length]; return sum + p.x * q.z - q.x * p.z; }, 0));
  const orientation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(uz, ux));
  const world = (x: number, y: number, z: number) => new THREE.Vector3(cx + ux * x - uz * z, base + y, cz + uz * x + ux * z);
  const axisX = new THREE.Vector3(1, 0, 0), axisY = new THREE.Vector3(0, 1, 0), axisZ = new THREE.Vector3(0, 0, 1);
  const shell = new THREE.Group(); shell.name = `${building.id}:family-dorm-landmark`;
  Object.assign(shell.userData, {
    buildingId: building.id, role: 'building-shell', landmark: 'family-dorm', appearance: profile,
    dimensions: { length, depth, height: top }, localOrigin: { x: cx, y: base, z: cz }, axis: { x: ux, z: uz }, frontSign,
    levels, bodyTop, roofRise, stairXs, stairWidth, dimensionsEstimated: true, directionEstimated: true,
  }); scene.add(shell);
  const distant = new THREE.Group(); distant.name = `${building.id}:family-dorm-distant`; distant.visible = false;
  Object.assign(distant.userData, { buildingId: building.id, role: 'distant-building', landmark: 'family-dorm' }); scene.add(distant);
  const brick: Surface = { positions: [], colors: [], uvs: [] }, trim: Surface = { positions: [], colors: [], uvs: [] }, glass: Surface = { positions: [], colors: [], uvs: [] };
  const surfaces = [brick, trim, glass], parts: Part[] = [], breakables: BreakableSpec[] = [], cube = new THREE.BoxGeometry(1, 1, 1);
  const proxyMaterials = { stone: new THREE.MeshStandardMaterial({ color: 0x994c39 }), metal: new THREE.MeshStandardMaterial({ color: 0xb9bcb1 }), glass: new THREE.MeshStandardMaterial({ color: 0x4f8f96 }) };
  function triangle(surface: Surface, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, hex: number, uv: number[] = [0, 0, 1, 0, 1, 1]) {
    const color = new THREE.Color(hex); for (const p of [a, b, c]) { surface.positions.push(p.x, p.y, p.z); surface.colors.push(color.r, color.g, color.b); } surface.uvs.push(...uv);
  }
  function quad(surface: Surface, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, hex: number) {
    const width = a.distanceTo(b) / 1.05, height = b.distanceTo(c) / .3;
    triangle(surface, a, b, c, hex, [0, 0, width, 0, width, height]); triangle(surface, a, c, d, hex, [0, 0, width, height, 0, height]);
  }
  function component(x: number, y: number, z: number, sx: number, sy: number, sz: number, kind: keyof typeof proxyMaterials, name: string, draw: () => void, rotation?: THREE.Quaternion) {
    const proxy = new THREE.Mesh(cube, proxyMaterials[kind]); proxy.position.copy(world(x, y, z)); proxy.quaternion.copy(orientation); if (rotation) proxy.quaternion.multiply(rotation);
    proxy.scale.set(sx + .025, sy + .025, sz + .025); Object.assign(proxy.userData, { buildingId: building.id, renderProxy: true, landmark: 'family-dorm', component: name }); proxy.updateMatrix(); proxy.updateMatrixWorld(true);
    const starts = surfaces.map(surface => surface.positions.length); draw();
    if (name === 'front-balcony') {
      const inverse = proxy.quaternion.clone().invert(), bounds = new THREE.Box3(), vertex = new THREE.Vector3();
      for (let s = 0; s < surfaces.length; s++) for (let i = starts[s]; i < surfaces[s].positions.length; i += 3) {
        vertex.fromArray(surfaces[s].positions, i).sub(proxy.position).applyQuaternion(inverse); bounds.expandByPoint(vertex);
      }
      proxy.position.add(bounds.getCenter(new THREE.Vector3()).applyQuaternion(proxy.quaternion));
      proxy.scale.copy(bounds.getSize(new THREE.Vector3())).addScalar(.025); proxy.updateMatrix(); proxy.updateMatrixWorld(true);
    }
    parts.push({ proxy, shown: true, ranges: surfaces.map((surface, i) => ({ surface, start: starts[i], end: surface.positions.length, original: new Float32Array(surface.positions.slice(starts[i])) })) });
    breakables.push({ mesh: proxy, size: proxy.scale.clone(), toughness: kind === 'glass' ? 7 : 11, label: building.name, material: kind });
  }
  function box(surface: Surface, x: number, y: number, z: number, sx: number, sy: number, sz: number, hex: number, rotation?: THREE.Quaternion) {
    const p = (a: number, b: number, c: number) => { const v = new THREE.Vector3(a * sx / 2, b * sy / 2, c * sz / 2); if (rotation) v.applyQuaternion(rotation); return world(x + v.x, y + v.y, z + v.z); };
    for (const side of [-1, 1]) {
      quad(surface, p(-1, -1, side), p(1, -1, side), p(1, 1, side), p(-1, 1, side), hex);
      quad(surface, p(side, -1, -1), p(side, -1, 1), p(side, 1, 1), p(side, 1, -1), hex);
      quad(surface, p(-1, side, -1), p(1, side, -1), p(1, side, 1), p(-1, side, 1), hex);
    }
  }
  const frontSegments: { a: Point; b: Point; nx: number; nz: number }[] = [];
  for (let edge = 0; edge < outline.length; edge++) {
    const a = outline[edge], b = outline[(edge + 1) % outline.length], dx = b.x - a.x, dz = b.z - a.z, edgeLength = Math.hypot(dx, dz);
    const nx = winding * dz / edgeLength, nz = -winding * dx / edgeLength, longFace = Math.abs(dx) > Math.abs(dz) * 3 && edgeLength > 3;
    const front = longFace && nz * frontSign > .7, rotation = new THREE.Quaternion().setFromAxisAngle(axisY, -Math.atan2(dz, dx));
    if (front) frontSegments.push({ a, b, nx, nz });
    const cuts = [0, 1];
    if (longFace) {
      for (const x of [...Array.from({ length: 5 }, (_, i) => i * length / 4), ...stairXs.flatMap(x => [x - stairWidth / 2, x + stairWidth / 2])]) { const t = (x - a.x) / dx; if (t > .001 && t < .999) cuts.push(t); }
    } else for (let i = 1; i < Math.ceil(edgeLength / 5); i++) cuts.push(i / Math.ceil(edgeLength / 5));
    cuts.sort((a, b) => a - b);
    for (let segment = 0; segment < cuts.length - 1; segment++) {
      const t0 = cuts[segment], t1 = cuts[segment + 1], x = a.x + dx * (t0 + t1) / 2, z = a.z + dz * (t0 + t1) / 2, width = edgeLength * (t1 - t0);
      const stair = front && stairXs.some(stairX => Math.abs(stairX - x) < stairWidth / 2 + .01), kind = !longFace || stair ? 'stone' : 'glass';
      const p0 = world(a.x + dx * t0, 0, a.z + dz * t0), p1 = world(a.x + dx * t1, 0, a.z + dz * t1);
      const foundation = Math.min(heightAt(p0.x, p0.z), heightAt(p1.x, p1.z), base) - base - .4;
      const point = (u: number, y: number, offset: number) => world(x + dx / edgeLength * u + nx * offset, y, z + dz / edgeLength * u + nz * offset);
      for (let floor = 0; floor < levels; floor++) {
        const lower = floor === 0 ? foundation : floor * floorHeight - (stair ? .65 : 0), upper = floor === levels - 1 ? bodyTop : (floor + 1) * floorHeight - (stair ? .65 : 0);
        const name = !longFace ? 'blank-end-wall' : stair ? (floor === 0 ? 'stair-entry-wall' : 'round-stair-window') : front ? 'front-balcony' : 'estimated-rear-window';
        component(x, (lower + upper) / 2, z, width, upper - lower, .55, kind, name, () => {
          box(brick, x, (lower + upper) / 2, z, width, upper - lower, .55, 0xffffff, rotation);
          if (!longFace) return;
          if (stair) {
            if (floor === 0) {
              quad(glass, point(-width * .3, .1, .295), point(width * .3, .1, .295), point(width * .3, 1.85, .295), point(-width * .3, 1.85, .295), 0x4d777a);
              return;
            }
            // 사진의 원형창은 5층 발코니 사이에 있는 네 계단참에 보인다.
            const y = floor * floorHeight + .25, radius = Math.min(.68, width * .32), outer = radius + .085;
            for (let i = 0; i < 24; i++) {
              const a = i * Math.PI / 12, b = (i + 1) * Math.PI / 12;
              triangle(glass, point(0, y, .292), point(Math.cos(a) * radius, y + Math.sin(a) * radius, .292), point(Math.cos(b) * radius, y + Math.sin(b) * radius, .292), 0x5d929f);
              quad(trim, point(Math.cos(a) * radius, y + Math.sin(a) * radius, .305), point(Math.cos(b) * radius, y + Math.sin(b) * radius, .305), point(Math.cos(b) * outer, y + Math.sin(b) * outer, .305), point(Math.cos(a) * outer, y + Math.sin(a) * outer, .305), 0xc7c3ad);
            }
            for (const frameY of [y - .38, y + .12]) quad(trim, point(-radius * .79, frameY - .035, .32), point(radius * .79, frameY - .035, .32), point(radius * .79, frameY + .035, .32), point(-radius * .79, frameY + .035, .32), 0xd0d0bf);
            for (const frameX of [-radius * .79, 0, radius * .79]) quad(trim, point(frameX - .035, y - .38, .325), point(frameX + .035, y - .38, .325), point(frameX + .035, y + .12, .325), point(frameX - .035, y + .12, .325), 0xcbd0c3);
            return;
          }
          const w = width * (front ? .86 : .58), bottom = floor * floorHeight + (front ? .25 : .85), upperWindow = upper - (front ? .2 : .65);
          const p = (u: number, y: number, offset = .29) => point(u, y, offset);
          quad(glass, p(-w / 2, bottom), p(w / 2, bottom), p(w / 2, upperWindow), p(-w / 2, upperWindow), [0x559fa6, 0x6ba9ad, 0x478d9b][(floor + segment) % 3]);
          for (const u of [-w / 2, 0, w / 2]) quad(trim, p(u - .05, bottom, .31), p(u + .05, bottom, .31), p(u + .05, upperWindow, .31), p(u - .05, upperWindow, .31), 0xd4d7cb);
          for (const y of [bottom, upperWindow]) quad(trim, p(-w / 2, y - .07, .31), p(w / 2, y - .07, .31), p(w / 2, y + .07, .31), p(-w / 2, y + .07, .31), 0xd4d7cb);
        }, rotation);
        if (front && !stair) {
          const slabY = floor * floorHeight + .15, railTop = slabY + 1.0, w = width * .86;
          component(x + nx * .43, slabY, z + nz * .43, width * .92, .18, .82, 'stone', 'balcony-slab', () => box(trim, x + nx * .43, slabY, z + nz * .43, width * .92, .18, .82, 0xd4d5c8, rotation), rotation);
          component(x + nx * .89, (slabY + railTop) / 2 + .015, z + nz * .89, w + .04, railTop - slabY + .03, .04, 'metal', 'balcony-railing', () => {
            for (let u = -w / 2; u <= w / 2; u += .26) quad(trim, point(u - .02, slabY, .88), point(u + .02, slabY, .88), point(u + .02, railTop, .88), point(u - .02, railTop, .88), 0x849c96);
            quad(trim, point(-w / 2, railTop - .03, .89), point(w / 2, railTop - .03, .89), point(w / 2, railTop + .03, .89), point(-w / 2, railTop + .03, .89), 0x788e85);
          }, rotation);
        }
      }
    }
    component((a.x + b.x) / 2, bodyTop - .09, (a.z + b.z) / 2, edgeLength + .1, .24, .95, 'metal', 'white-eave', () => box(trim, (a.x + b.x) / 2, bodyTop - .09, (a.z + b.z) / 2, edgeLength + .1, .24, .95, 0xe0dfd0, rotation), rotation);
  }

  // 935동의 두 어긋난 몸체를 포함해 평면의 주된 띠를 찾는다. 지붕도 전체 외접 사각형으로 덮지 않는다.
  const xCuts: number[] = [];
  for (const x of outline.map(p => p.x).sort((a, b) => a - b)) { if (!xCuts.length || x - xCuts[xCuts.length - 1] > .1) xCuts.push(x); else if (x > length - .1) xCuts[xCuts.length - 1] = x; }
  function spanAt(x: number) {
    const values: number[] = [];
    for (let i = 0; i < outline.length; i++) { const a = outline[i], b = outline[(i + 1) % outline.length]; if ((a.x <= x && b.x > x) || (b.x <= x && a.x > x)) values.push(a.z + (b.z - a.z) * (x - a.x) / (b.x - a.x)); }
    return { z0: Math.min(...values), z1: Math.max(...values) };
  }
  const strips = xCuts.slice(0, -1).map((x0, i) => ({ x0, x1: xCuts[i + 1], ...spanAt((x0 + xCuts[i + 1]) / 2) }));
  const mainStrips = strips.filter(strip => strip.x1 - strip.x0 > length * .08);
  const roofBlocks: RoofBlock[] = mainStrips.map((strip, i) => ({ ...strip, x0: i ? mainStrips[i - 1].x1 : strip.x0, x1: i + 1 < mainStrips.length ? mainStrips[i + 1].x0 : strip.x1 }));
  shell.userData.roofBlocks = roofBlocks;
  function roofPanel(x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, name: string) {
    const tilt = new THREE.Quaternion().setFromAxisAngle(axisX, -Math.atan2(y1 - y0, z1 - z0));
    component((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, .28, Math.hypot(y1 - y0, z1 - z0), 'stone', name, () => {
      quad(trim, world(x0, y0, z0), world(x1, y0, z0), world(x1, y1, z1), world(x0, y1, z1), 0xa8492c);
      for (let x = Math.ceil(x0 / .34) * .34; x < x1; x += .34) quad(trim, world(x - .035, y0 + .025, z0), world(x + .035, y0 + .025, z0), world(x + .035, y1 + .025, z1), world(x - .035, y1 + .025, z1), 0xc16d48);
    }, tilt);
  }
  for (const block of roofBlocks) {
    const midZ = (block.z0 + block.z1) / 2, half = (block.z1 - block.z0) / 2 + .5, columns = Math.ceil((block.x1 - block.x0) / 6);
    for (const side of [-1, 1]) for (let col = 0; col < columns; col++) for (let row = 0; row < 3; row++) {
      const x0 = block.x0 - .45 + col * (block.x1 - block.x0 + .9) / columns, x1 = block.x0 - .45 + (col + 1) * (block.x1 - block.x0 + .9) / columns;
      roofPanel(x0, x1, midZ + side * half * (1 - row / 3), midZ + side * half * (1 - (row + 1) / 3), bodyTop + roofRise * row / 3, bodyTop + roofRise * (row + 1) / 3, 'sloped-tile-roof');
    }
    for (const x of [block.x0, block.x1]) for (let i = 0; i < 8; i++) {
      const z0 = block.z0 + i * (block.z1 - block.z0) / 8, z1 = block.z0 + (i + 1) * (block.z1 - block.z0) / 8;
      const roofY = (z: number) => bodyTop + roofRise * (1 - Math.abs(z - midZ) / half), h0 = roofY(z0), h1 = roofY(z1), upper = Math.max(h0, h1);
      component(x, (bodyTop + upper) / 2, (z0 + z1) / 2, .38, upper - bodyTop, z1 - z0, 'stone', 'blank-roof-end', () => quad(brick, world(x, bodyTop, z0), world(x, bodyTop, z1), world(x, h1, z1), world(x, h0, z0), 0xffffff));
    }
  }
  for (const x of stairXs) {
    const edge = frontSegments.find(edge => x >= Math.min(edge.a.x, edge.b.x) - .01 && x <= Math.max(edge.a.x, edge.b.x) + .01); if (!edge) continue;
    const z = THREE.MathUtils.lerp(edge.a.z, edge.b.z, (x - edge.a.x) / (edge.b.x - edge.a.x)), half = stairWidth / 2 + .25, ridge = bodyTop + 1.1;
    for (const side of [-1, 1]) {
      const x0 = x + side * half, x1 = x, y0 = bodyTop, y1 = ridge, rotation = new THREE.Quaternion().setFromAxisAngle(axisZ, Math.atan2(y1 - y0, x1 - x0));
      component((x0 + x1) / 2, (y0 + y1) / 2, z - frontSign * 1.1, Math.hypot(x1 - x0, y1 - y0), .25, 3.1, 'stone', 'small-stair-gable-roof', () => quad(trim, world(x0, y0, z + frontSign * .45), world(x1, y1, z + frontSign * .45), world(x1, y1, z - frontSign * 2.65), world(x0, y0, z - frontSign * 2.65), 0xb04e30), rotation);
    }
    for (let i = 0; i < 8; i++) {
      const a = x - half + i * half / 4, b = a + half / 4, y0 = ridge - Math.abs(a - x) / half * 1.1, y1 = ridge - Math.abs(b - x) / half * 1.1, upper = Math.max(y0, y1);
      component((a + b) / 2, (bodyTop + upper) / 2, z + frontSign * .3, b - a, upper - bodyTop, .2, 'stone', 'stair-gable-face', () => quad(brick, world(a, bodyTop, z + frontSign * .3), world(b, bodyTop, z + frontSign * .3), world(b, y1, z + frontSign * .3), world(a, y0, z + frontSign * .3), 0xffffff));
    }
    component(x, 2.12, z + frontSign * .95, stairWidth + .6, .22, 1.8, 'metal', 'entry-canopy', () => box(trim, x, 2.12, z + frontSign * .95, stairWidth + .6, .22, 1.8, 0xd4d3bf));
  }
  for (const [surface, name, roughness, metalness] of [[brick, 'brick-walls', .92, 0], [trim, 'roof-frames-rails', .72, .1], [glass, 'glazing', .24, .15]] as const) {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(surface.positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(surface.colors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(surface.uvs, 2)); (geometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
    geometry.computeVertexNormals(); geometry.computeBoundingSphere(); geometry.computeBoundingBox(); surface.geometry = geometry;
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness, metalness, map: surface === brick ? getBrickTexture() : null });
    const mesh = new THREE.Mesh(geometry, material); mesh.name = `family-dorm-${name}`; mesh.receiveShadow = true; shell.add(mesh);
    surface.positions.length = 0; surface.colors.length = 0; surface.uvs.length = 0;
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
