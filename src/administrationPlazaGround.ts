import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';

type Point = [number, number];
type Part = { proxy: THREE.Mesh; start: number; original: Float32Array; shown: boolean };

/** 2025년 9월 거리뷰의 블록 포장과 게시판 뒤 식재를 근사한다. 원본 도로와 지형은 바꾸지 않는다. */
export function* createAdministrationPlazaGroundSteps(scene: THREE.Scene, heightAt: (x: number, z: number) => number) {
  let startupWork=0;
  yield '광장 보도 준비 중';
  const start = new THREE.Vector3(187.02, 0, -728.95), end = new THREE.Vector3(196.52, 0, -737.88);
  const axis = end.clone().sub(start).normalize(), across = new THREE.Vector3(-axis.z, 0, axis.x);
  const point = (s: number, n: number): Point => [start.x + axis.x * s + across.x * n, start.z + axis.z * s + across.z * n];
  const shell = new THREE.Group(); shell.name = 'facilities/administration-plaza-ground'; scene.add(shell);
  const road = scene.getObjectByName('campus-road-surface') as THREE.Mesh | undefined;
  if (!road) throw Error('Administration paving requires the actual campus-road-surface mesh.');
  const clip = (input: number[][], polygon: Point[]) => {
    let result = input;
    const sign = Math.sign(polygon.reduce((s, a, i) => { const b = polygon[(i + 1) % polygon.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0));
    for (let j = 0; j < polygon.length && result.length; j++) {
      const a = polygon[j], b = polygon[(j + 1) % polygon.length], next: number[][] = [];
      const distance = (p: number[]) => sign * ((b[0] - a[0]) * (p[2] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
      for (let i = 0; i < result.length; i++) {
        const p = result[i], q = result[(i + 1) % result.length], dp = distance(p), dq = distance(q);
        if (dp >= -1e-8) next.push(p);
        if ((dp >= -1e-8) !== (dq >= -1e-8)) { const t = dp / (dp - dq); next.push(p.map((v, k) => v + (q[k] - v) * t)); }
      }
      result = next;
    }
    return result;
  };
  const halfPlane = (input: number[][], distance: (p: number[]) => number) => {
    const result: number[][] = [];
    for (let i = 0; i < input.length; i++) {
      const p = input[i], q = input[(i + 1) % input.length], a = distance(p), b = distance(q);
      if (a >= 0) result.push(p);
      if ((a >= 0) !== (b >= 0)) { const t = a / (a - b); result.push(p.map((v, k) => v + (q[k] - v) * t)); }
    }
    return result;
  };
  function* visibleSurface(meshes: THREE.Mesh[], footprint: Point[]) {
  const minX = Math.min(...footprint.map(p => p[0])), maxX = Math.max(...footprint.map(p => p[0]));
  const minZ = Math.min(...footprint.map(p => p[1])), maxZ = Math.max(...footprint.map(p => p[1]));
  const surface: number[][] = [];
  for (const mesh of meshes) {
    if((++startupWork&127)===0)yield '광장 보도 준비 중';
  const p = mesh.geometry.getAttribute('position'), index = mesh.geometry.index;
  for (let i = 0; i < (index?.count ?? p.count); i += 3) {
    if((++startupWork&127)===0)yield '광장 보도 준비 중';
    const triangle = [0, 1, 2].flatMap(j => { const k = index ? index.getX(i + j) : i + j; return [p.getX(k), p.getY(k), p.getZ(k)]; });
    if (Math.max(triangle[0], triangle[3], triangle[6]) >= minX && Math.min(triangle[0], triangle[3], triangle[6]) <= maxX && Math.max(triangle[2], triangle[5], triangle[8]) >= minZ && Math.min(triangle[2], triangle[5], triangle[8]) <= maxZ) surface.push(triangle);
  }
  }
  // 교차로의 도로 삼각형이 겹치면 낮은 면을 잘라 실제 보이는 상면에만 포장을 남긴다.
  const upperSurface: number[][] = [];
  for (let source = 0; source < surface.length; source++) {
    if((++startupWork&127)===0)yield '광장 보도 준비 중';
    const triangle = surface[source]; let pieces = [clip([triangle.slice(0, 3), triangle.slice(3, 6), triangle.slice(6, 9)], footprint)].filter(p => p.length >= 3);
    for (let j = 0; j < surface.length && pieces.length; j++) {
      if((++startupWork&127)===0)yield '광장 보도 준비 중';
      if (j === source) continue;
      const t = surface[j], a = t.slice(0, 3), b = t.slice(3, 6), c = t.slice(6, 9), det = (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]);
      if (Math.abs(det) < 1e-8 || Math.max(t[0], t[3], t[6]) <= Math.min(triangle[0], triangle[3], triangle[6]) || Math.min(t[0], t[3], t[6]) >= Math.max(triangle[0], triangle[3], triangle[6]) || Math.max(t[2], t[5], t[8]) <= Math.min(triangle[2], triangle[5], triangle[8]) || Math.min(t[2], t[5], t[8]) >= Math.max(triangle[2], triangle[5], triangle[8])) continue;
      const above = (p: number[]) => {
        const u = ((p[0] - a[0]) * (c[2] - a[2]) - (p[2] - a[2]) * (c[0] - a[0])) / det, v = ((b[0] - a[0]) * (p[2] - a[2]) - (b[2] - a[2]) * (p[0] - a[0])) / det;
        return a[1] + u * (b[1] - a[1]) + v * (c[1] - a[1]) - p[1] - 1e-5;
      };
      const sign = Math.sign(det), planes = [[a, b], [b, c], [c, a]].map(([p, q]) => (r: number[]) => sign * ((q[0] - p[0]) * (r[2] - p[2]) - (q[2] - p[2]) * (r[0] - p[0])));
      planes.push(above); const kept: number[][][] = [];
      for (const piece of pieces) {
        if((++startupWork&127)===0)yield '광장 보도 준비 중';
        if (piece.every(p => above(p) <= 0) || clip(piece, [[a[0], a[2]], [b[0], b[2]], [c[0], c[2]]]).length < 3) { kept.push(piece); continue; }
        let remaining = piece;
        for (const plane of planes) {
          if((++startupWork&127)===0)yield '광장 보도 준비 중'; const outside = halfPlane(remaining, p => -plane(p)); if (outside.length >= 3) kept.push(outside); remaining = halfPlane(remaining, plane); if (remaining.length < 3) break; }
      }
      pieces = kept;
    }
    for (const piece of pieces) for (let i = 1; i < piece.length - 1; i++) upperSurface.push([...piece[0], ...piece[i], ...piece[i + 1]]);
  }
    return { surface, upperSurface };
  }
  const { surface, upperSurface } = yield* visibleSurface([road], [point(0, -2.6), point(13, -2.6), point(13, 2.6), point(0, 2.6)]);
  const paintPositions: number[] = [], paintColors: number[] = [], regions: { start: number; count: number; kind: string }[] = [];
  function paint(s0: number, s1: number, n0: number, n1: number, color: number, kind: string) {
    const polygon = [point(s0, n0), point(s1, n0), point(s1, n1), point(s0, n1)], start = paintPositions.length / 3, tint = new THREE.Color(color);
    for (const triangle of upperSurface) {
      const exact = clip([triangle.slice(0, 3), triangle.slice(3, 6), triangle.slice(6, 9)], polygon);
      for (let i = 1; i < exact.length - 1; i++) {
        const a = exact[0], b = exact[i], c = exact[i + 1];
        if (Math.abs((b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0])) < 1e-5 || [[a, b], [b, c], [c, a]].some(([p, q]) => Math.hypot(p[0] - q[0], p[2] - q[2]) < .0001)) continue;
        for (const p of [a, b, c]) { paintPositions.push(p[0], p[1] + .03, p[2]); paintColors.push(tint.r, tint.g, tint.b); }
      }
    }
    if (paintPositions.length / 3 > start) regions.push({ start, count: paintPositions.length / 3 - start, kind });
  }
  // 겹친 색 면을 쌓지 않고 작은 블록, 가로 띠와 양측 노란 선을 같은 높이의 구획으로 나눈다.
  for (let row = 0; row < 52; row++) {
    if((++startupWork&127)===0)yield '광장 보도 준비 중';
    const s0 = row * .25, s1 = s0 + .25, band = row % 13 < 2;
    paint(s0, s1, -2.6, -2.45, 0xcdb451, 'yellow-edge'); paint(s0, s1, 2.45, 2.6, 0xcdb451, 'yellow-edge');
    for (let column = 0; column < 14; column++) {
      if((++startupWork&127)===0)yield '광장 보도 준비 중';
      const n0 = -2.45 + 4.9 * column / 14, n1 = -2.45 + 4.9 * (column + 1) / 14;
      const color = band ? (row + column) % 3 ? 0xb7b7a9 : 0xc1c0b2 : [0x4b5154, 0x53585a, 0x5b5e5f, 0x626564][(row * 7 + column * 11) % 4];
      paint(s0, s1, n0, n1, color, band ? 'light-cross-band' : 'dark-block');
    }
  }
  function merged(name: string, positions: number[], colors: number[], dynamic = false) {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    if (dynamic) (geometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
    geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .93 })); mesh.name = name; mesh.receiveShadow = true; shell.add(mesh); return mesh;
  }
  const paving = merged('administration-paving-surface', paintPositions, paintColors); paving.userData.physicalCollider = false; paving.userData.regions = regions;

  // 사진에서 확인한 밝은 보도만 별도로 덮는다. 건물과 시설의 표면은 바닥 원본에 포함하지 않는다.
  const groundSources = scene.children.filter((o): o is THREE.Mesh => o instanceof THREE.Mesh && (['campus-terrain', 'campus-road-surface', 'campus-pedestrian-surface'].includes(o.name) || o.userData.role === 'mapped-area'));
  const pedestrianBounds = { s: [0, 13], n: [2.9, 8] }, pedestrianPolygon = [point(0, 2.9), point(13, 2.9), point(13, 8), point(0, 8)];
  const terrainMesh = scene.getObjectByName('campus-terrain') as THREE.Mesh;
  if (!terrainMesh) throw Error('Administration sidewalk requires the actual campus-terrain mesh.');
  const pedestrianSurface = (yield* visibleSurface([terrainMesh], pedestrianPolygon)).upperSurface;
  const oldVisibleSurface = (yield* visibleSurface(groundSources, pedestrianPolygon)).upperSurface;
  const sampledHeight = (triangles: number[][], x: number, z: number) => {
    let y = -Infinity;
    for (const t of triangles) { const d = (t[3] - t[0]) * (t[8] - t[2]) - (t[5] - t[2]) * (t[6] - t[0]); if (Math.abs(d) < 1e-10) continue;
      const u = ((x - t[0]) * (t[8] - t[2]) - (z - t[2]) * (t[6] - t[0])) / d, v = ((t[3] - t[0]) * (z - t[2]) - (t[5] - t[2]) * (x - t[0])) / d;
      if (u >= -1e-7 && v >= -1e-7 && u + v <= 1.0000001) y = Math.max(y, t[1] + u * (t[4] - t[1]) + v * (t[7] - t[1]));
    }
    return y;
  };
  // 보도 구역 안에서만 기존 보행로와 지도 표시 면을 걷어낸다. 차도와 지형은 그대로 둔다.
  const normalizedSurfaces: { name: string; role?: string; areaId?: string; removedTriangles: number; beforeTriangles: number; afterTriangles: number }[] = [];
  for (const mesh of groundSources.filter(m => m.name === 'campus-pedestrian-surface' || m.userData.role === 'mapped-area')) {
    if((++startupWork&127)===0)yield '광장 보도 준비 중';
    const geometry = mesh.geometry, position = geometry.getAttribute('position'), index = geometry.index, keys = Object.keys(geometry.attributes).filter(k => k !== 'position' && k !== 'normal');
    const fields = ['position', ...keys].map(key => ({ key, attribute: geometry.getAttribute(key), values: [] as number[] }));
    let removedTriangles = 0;
    for (let i = 0; i < (index?.count ?? position.count); i += 3) {
      if((++startupWork&127)===0)yield '광장 보도 준비 중';
      const triangle = [0, 1, 2].map(j => { const k = index ? index.getX(i + j) : i + j; return fields.flatMap(f => Array.from({ length: f.attribute.itemSize }, (_, c) => f.attribute.array[k * f.attribute.itemSize + c])); });
      const inside = clip(triangle, pedestrianPolygon), hasArea = inside.length >= 3 && Math.abs(inside.reduce((area, p, j) => { const q = inside[(j + 1) % inside.length]; return area + p[0] * q[2] - q[0] * p[2]; }, 0)) > 1e-7;
      const kept: number[][][] = [];
      if (!hasArea) kept.push(triangle);
      else {
        removedTriangles++; let remaining = triangle;
        const sign = Math.sign(pedestrianPolygon.reduce((area, p, j) => { const q = pedestrianPolygon[(j + 1) % pedestrianPolygon.length]; return area + p[0] * q[1] - q[0] * p[1]; }, 0));
        for (let j = 0; j < pedestrianPolygon.length && remaining.length >= 3; j++) {
          if((++startupWork&127)===0)yield '광장 보도 준비 중';
          const p = pedestrianPolygon[j], q = pedestrianPolygon[(j + 1) % pedestrianPolygon.length], distance = (r: number[]) => sign * ((q[0] - p[0]) * (r[2] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
          const outside = halfPlane(remaining, p => -distance(p)); if (outside.length >= 3) kept.push(outside); remaining = halfPlane(remaining, distance);
        }
      }
      for (const piece of kept) for (let j = 1; j < piece.length - 1; j++) for (const vertex of [piece[0], piece[j], piece[j + 1]]) {
        if((++startupWork&127)===0)yield '광장 보도 준비 중';
        let offset = 0; for (const f of fields) {
          if((++startupWork&127)===0)yield '광장 보도 준비 중'; for (let k = 0; k < f.attribute.itemSize; k++) f.values.push(vertex[offset + k]); offset += f.attribute.itemSize; }
      }
    }
    if (!removedTriangles) continue;
    const replacement = new THREE.BufferGeometry(); for (const f of fields) replacement.setAttribute(f.key, new THREE.Float32BufferAttribute(f.values, f.attribute.itemSize));
    replacement.computeVertexNormals(); replacement.computeBoundingBox(); replacement.computeBoundingSphere(); mesh.geometry = replacement; geometry.dispose();
    normalizedSurfaces.push({ name: mesh.name, role: mesh.userData.role, areaId: mesh.userData.areaId, removedTriangles, beforeTriangles: (index?.count ?? position.count) / 3, afterTriangles: replacement.getAttribute('position').count / 3 });
  }
  const pedestrianPositions: number[] = [], pedestrianColors: number[] = [], pedestrianUv: number[] = [];
  // 가장자리 0.8m만 기존 표시 높이에 완만히 접속하고 중앙에는 인위적인 단차를 두지 않는다.
  const rimWidth = .8;
  const boundaryLift = (s: number, n: number) => {
    const candidates = [[s, 2.9, n - 2.9], [s, 8, 8 - n], [0, n, s], [13, n, 13 - s]]; let lift = 0;
    for (const [u, v, distance] of candidates) {
      if (distance >= rimWidth) continue;
      let edgeLift = 0;
      for (const offset of [-.15, 0, .15]) {
        const p = point(THREE.MathUtils.clamp(u + (u === 0 || u === 13 ? 0 : offset), .0001, 12.9999), THREE.MathUtils.clamp(v + (v === 2.9 || v === 8 ? 0 : offset), 2.9001, 7.9999));
        edgeLift = Math.max(edgeLift, sampledHeight(oldVisibleSurface, ...p) - sampledHeight(pedestrianSurface, ...p));
      }
      const weight = 1 - THREE.MathUtils.smoothstep(Math.max(0, distance), 0, rimWidth); lift = Math.max(lift, Math.max(0, edgeLift) * weight);
    }
    return lift;
  };
  // 같은 격자 경계를 사용해 이웃 삼각형의 접점 높이가 서로 달라지지 않게 한다.
  const sCuts = [...Array.from({ length: 53 }, (_, i) => i * .25), .8, 12.2].sort((a, b) => a - b), nCuts = [...Array.from({ length: 22 }, (_, i) => 2.9 + i * 5.1 / 21), 3.7, 7.2].sort((a, b) => a - b);
  for (let row = 0; row < sCuts.length - 1; row++) for (let column = 0; column < nCuts.length - 1; column++) {
    if((++startupWork&127)===0)yield '광장 보도 준비 중';
    const s0 = sCuts[row], s1 = sCuts[row + 1], n0 = nCuts[column], n1 = nCuts[column + 1];
    const region = [point(s0, n0), point(s1, n0), point(s1, n1), point(s0, n1)];
    for (const t of pedestrianSurface) {
      if((++startupWork&127)===0)yield '광장 보도 준비 중';
      const piece = clip([t.slice(0, 3), t.slice(3, 6), t.slice(6, 9)], region);
      for (let i = 1; i < piece.length - 1; i++) {
        if((++startupWork&127)===0)yield '광장 보도 준비 중';
        const triangle = [piece[0], piece[i], piece[i + 1]], a = triangle[0], b = triangle[1], c = triangle[2];
        if (Math.abs((b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0])) < .000001) continue;
        for (const p of triangle) {
          if((++startupWork&127)===0)yield '광장 보도 준비 중'; const dx = p[0] - start.x, dz = p[2] - start.z, s = dx * axis.x + dz * axis.z, n = dx * across.x + dz * across.z;
          pedestrianPositions.push(p[0], p[1] + .03 + boundaryLift(s, n), p[2]); pedestrianColors.push(1, 1, 1); pedestrianUv.push(s / 13, (n - 2.9) / 5.1);
        }
      }
    }
  }
  const pedestrianTopVertices = pedestrianPositions.length / 3;
  const pedestrian = merged('administration-pedestrian-paving', pedestrianPositions, pedestrianColors);
  pedestrian.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(pedestrianUv, 2));
  const textureSize = 512, pixels = new Uint8Array(textureSize * textureSize * 4);
  // 줄눈, 블록 색 편차와 점자 무늬를 한 장에 계산한다. 사진 자체는 텍스처로 쓰지 않는다.
  for (let y = 0; y < textureSize; y++) for (let x = 0; x < textureSize; x++) {
    if((++startupWork&127)===0)yield '광장 보도 준비 중';
    const s = (x + .5) / textureSize * 13, n = 2.9 + (y + .5) / textureSize * 5.1;
    const row = Math.floor(s / .2), column = Math.floor((n - 2.9) / .3);
    const band = s < .75 || (s >= 4.5 && s < 5.25) || (s >= 9 && s < 9.75) || s >= 12.25;
    const dot = row % 5 === 2 && column % 5 === 2;
    const variation = ((row * 13 + column * 7) % 9 - 4) * 2 + ((x * 17 + y * 31) % 7 - 3);
    let rgb = (band || dot ? [76, 81, 81] : [198, 198, 186]).map(c => c + variation);
    const tactileHead = s >= .45 && s <= 2.55 && n < 3.5, tactileStem = s >= 1.2 && s <= 1.8 && n >= 3.5 && n <= 4.7;
    if (tactileHead || tactileStem) {
      const rounded = tactileHead ? Math.hypot((s / .1 % 1) - .5, (n / .1 % 1) - .5) < .24 : Math.abs((s / .1 % 1) - .5) < .18;
      rgb = rounded ? [235, 195, 58] : [204, 164, 37];
    } else {
      const ds = Math.min(s % .2, .2 - s % .2), dn = Math.min((n - 2.9) % .3, .3 - (n - 2.9) % .3);
      const coverage = (d: number, pixel: number) => THREE.MathUtils.clamp((.004 + pixel / 2 - d) / pixel, 0, Math.min(1, .008 / pixel));
      const grout = Math.max(coverage(ds, 13 / textureSize), coverage(dn, 5.1 / textureSize));
      rgb = rgb.map(c => c * (1 - grout * .82));
    }
    const offset = (y * textureSize + x) * 4; for (let c = 0; c < 3; c++) pixels[offset + c] = Math.max(0, Math.min(255, rgb[c])); pixels[offset + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, textureSize, textureSize, THREE.RGBAFormat); texture.name = 'administration-photo-paving-pattern'; texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true; texture.needsUpdate = true;
  (pedestrian.material as THREE.MeshStandardMaterial).map = texture;
  Object.assign(pedestrian.userData, { physicalCollider: false, topVertexCount: pedestrianTopVertices, normalizedSurfaces, rimWidth, continuousTerrainSurface: true, source: 'Actual continuous terrain triangles with a bounded perimeter transition to existing path display', offset: .03, localBounds: pedestrianBounds, blockSizeEstimated: [.2, .3], tactile: { head: { s: [.45, 2.55], n: [2.9, 3.5] }, stem: { s: [1.2, 1.8], n: [3.5, 4.7] }, locationEstimated: true } });

  const positions: number[] = [], colors: number[] = [], parts: Part[] = [], breakables: BreakableSpec[] = [];
  const shrubs = [1.2, 3.7, 6.2, 8.7, 11.2].map((s, i) => {
    const [x, z] = point(s, -5.3), y = heightAt(x, z), radii = [.87, .65 + (i % 2) * .09, .78];
    const source = new THREE.IcosahedronGeometry(1, 1).scale(...radii as [number, number, number]), geometry = source.index ? source.toNonIndexed() : source;
    const local = Float32Array.from(geometry.getAttribute('position').array), center = new THREE.Vector3(x, y + .52, z), color = [0x566c43, 0x5d7448, 0x657b4c][i % 3], tint = new THREE.Color(color), start = positions.length, original = local.slice();
    for (let j = 0; j < original.length; j += 3) { original[j] += center.x; original[j + 1] += center.y; original[j + 2] += center.z; positions.push(original[j], original[j + 1], original[j + 2]); colors.push(tint.r, tint.g, tint.b); }
    const proxy = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color })); proxy.position.copy(center); proxy.updateMatrixWorld(true);
    Object.assign(proxy.userData, { facilityId: shell.name, component: 'notice-back-shrub', renderProxy: true, speciesEstimated: true });
    parts.push({ proxy, original, start, shown: true }); breakables.push({ mesh: proxy, size: new THREE.Vector3(...radii).multiplyScalar(2), collisionVertices: local, toughness: 3, material: 'wood', label: '행정관 게시판 뒤 낮은 식재' });
    return { s, n: -5.3, x, z, groundY: y, radii };
  });

  function hardPart(component: string, vertices: THREE.Vector3[]) {
    const center = new THREE.Box3().setFromPoints(vertices).getCenter(new THREE.Vector3());
    const convex = new ConvexGeometry(vertices.map(p => p.clone().sub(center))), local = Float32Array.from(convex.getAttribute('position').array), original = local.slice(), tint = new THREE.Color(0x969b97), offset = positions.length;
    for (let i = 0; i < original.length; i += 3) { original[i] += center.x; original[i + 1] += center.y; original[i + 2] += center.z; positions.push(original[i], original[i + 1], original[i + 2]); colors.push(tint.r, tint.g, tint.b); }
    const proxy = new THREE.Mesh(convex, new THREE.MeshStandardMaterial({ color: 0x969b97 })); proxy.position.copy(center); proxy.updateMatrixWorld(true); convex.computeBoundingBox();
    Object.assign(proxy.userData, { facilityId: shell.name, component, renderProxy: true, dimensionsEstimated: true });
    parts.push({ proxy, original, start: offset, shown: true }); breakables.push({ mesh: proxy, size: convex.boundingBox!.getSize(new THREE.Vector3()), collisionVertices: local, toughness: 10, material: 'stone', label: component === 'stone-bollard' ? '행정관 보도 돌 볼라드' : '행정관 보도 경계석' });
  }
  const edgeSurface = (yield* visibleSurface(groundSources, [point(0, 2.75), point(13, 2.75), point(13, 2.95), point(0, 2.95)])).upperSurface;
  const curbs: { s: number[]; raised: number; raisedEnds: number[]; parts: number }[] = [];
  const surfaceY = (s: number, n: number) => {
    const [x, z] = point(s, n); let y = -Infinity;
    for (const t of edgeSurface) { const d = (t[3] - t[0]) * (t[8] - t[2]) - (t[5] - t[2]) * (t[6] - t[0]); if (Math.abs(d) < 1e-10) continue;
      const u = ((x - t[0]) * (t[8] - t[2]) - (z - t[2]) * (t[6] - t[0])) / d, v = ((t[3] - t[0]) * (z - t[2]) - (t[5] - t[2]) * (x - t[0])) / d;
      if (u >= -1e-6 && v >= -1e-6 && u + v <= 1.000001) y = Math.max(y, t[1] + u * (t[4] - t[1]) + v * (t[7] - t[1]));
    }
    return Number.isFinite(y) ? y : heightAt(x, z);
  };
  const joints = [0, .5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 13];
  const curbRise = (s: number) => s < .5 ? THREE.MathUtils.lerp(.12, .025, s / .5) : s <= 2.5 ? .025 : s < 3.5 ? THREE.MathUtils.lerp(.025, .12, s - 2.5) : .12;
  for (let j = 0; j < joints.length - 1; j++) {
    if((++startupWork&127)===0)yield '광장 보도 준비 중';
    const s0 = joints[j], s1 = joints[j + 1], raisedEnds = [curbRise(s0), curbRise(s1)], raised = Math.max(...raisedEnds);
    const vertices = [[s0, 2.75], [s1, 2.75], [s1, 2.95], [s0, 2.95]].map(([s, n]) => { const [x, z] = point(s, n); return new THREE.Vector3(x, surfaceY(s, n), z); });
    for (const ids of [[0, 1, 2], [0, 2, 3]]) hardPart('sidewalk-curb', ids.flatMap(i => [vertices[i].clone().add(new THREE.Vector3(0, -.08, 0)), vertices[i].clone().add(new THREE.Vector3(0, raisedEnds[i === 0 || i === 3 ? 0 : 1], 0))]));
    curbs.push({ s: [s0, s1], raised, raisedEnds, parts: 2 });
  }
  const bollards = [.2, 2.8].map(s => {
    const n = 2.84, [x, z] = point(s, n), ground = heightAt(x, z);
    hardPart('stone-bollard', [-.26, .26].flatMap(ds => [-.21, .21].flatMap(dn => { const p = point(s + ds, n + dn); return [new THREE.Vector3(p[0], ground - .04, p[1]), new THREE.Vector3(p[0], ground + .58 + dn / .21 * .07, p[1])]; })));
    return { s, n, x, z, height: [.51, .65], size: [.52, .42], slopedTopEstimated: true };
  });

  const planting = merged('administration-notice-back-planting', positions, colors, true);
  Object.assign(shell.userData, { role: 'campus-facilities', landmark: 'administration-plaza-ground', facilityId: shell.name, sourceMonth: '2025-09', sourcePanorama: 'NYSrsJIQuCQ8ogVSuOR7aA', roadId: 'way/167597965/24', start: start.toArray(), axis: axis.toArray(), across: across.toArray(), localBounds: { s: [0, 13], n: [-2.6, 2.6] }, roadOffset: .03, actualRoadTriangles: true, pavingPhysicalCollider: false, sourceRoadTriangles: surface.length, visibleRoadTriangles: upperSurface.length, shrubs, plantingCountAndSpeciesEstimated: true, patternDimensionsEstimated: true, coordinateConvention: 'D=(east,up,north); parent H applies once.', terrainChanged: false, parts: parts.length, triangles: (paintPositions.length + positions.length + pedestrianPositions.length) / 9, renderMeshes: 3, pedestrianBounds, pedestrianSurfaceTriangles: pedestrianSurface.length, textureBytes: pixels.byteLength, textureCount: 1, curbs, bollards, curbLowering: { s: [.5, 2.5], n: [2.75, 2.95], raised: .025, transitions: [[0, .5], [2.5, 3.5]] } });
  function update(_player: THREE.Vector3) {
    const attribute = planting.geometry.getAttribute('position') as THREE.BufferAttribute; let changed = false;
    for (const part of parts) if (part.shown !== part.proxy.visible) {
      if (!changed) attribute.clearUpdateRanges(); changed = true; part.shown = part.proxy.visible;
      if (part.shown) (attribute.array as Float32Array).set(part.original, part.start);
      else for (let i = 0; i < part.original.length; i += 3) { attribute.array[part.start + i] = part.proxy.position.x; attribute.array[part.start + i + 1] = part.proxy.position.y; attribute.array[part.start + i + 2] = part.proxy.position.z; }
      attribute.addUpdateRange(part.start, part.original.length);
    }
    if (changed) attribute.needsUpdate = true; planting.visible = parts.some(part => part.proxy.visible);
  }
  // 렌더 버퍼와 복원용 사본에 옮긴 조립 배열은 비운다.
  for(const values of [paintPositions,paintColors,positions,colors,pedestrianPositions,pedestrianColors,pedestrianUv])values.length=0;
  return { breakables, shell, update };
}

export function createAdministrationPlazaGround(...args:Parameters<typeof createAdministrationPlazaGroundSteps>){
  const steps=createAdministrationPlazaGroundSteps(...args);let result=steps.next();
  while(!result.done)result=steps.next();
  return result.value;
}
