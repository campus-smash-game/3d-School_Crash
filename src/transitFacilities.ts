import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';

type Point = [number, number];
type HeightSampler = ((x: number, z: number) => number) & { roadSurfaceTriangles?: (bounds: { minX: number; maxX: number; minZ: number; maxZ: number }) => number[][] | undefined };
export type TransitFacilityStop = {
  id: string; stopIds: string[]; label: string; names: string[]; routes: string[];
  services: string[]; position: Point; forward: Point; outward: Point;
  roadId: string; roadWidth: number; signStyle: 'city-pole' | 'shuttle-pole';
  shelter: 'yes' | 'no' | 'unknown'; shelterModel: string;
  placement: { estimated: boolean; basis: string; along: number; outsideRoad: number };
  [key: string]: unknown;
};
export type TransitFacilitiesPlan = {
  schemaVersion: number; stops: TransitFacilityStop[]; fixtures: TransitFixture[];
  sourceHashes: Record<string, string>; summary: Record<string, number>;
};
type SiteRef = { id: string; label: string; stopIds: string[]; position: Point };
export type TransitFixture = SiteRef & {
  kind: 'standard-shelter' | 'arched-shelter' | 'double-lamp' | 'cantilever-signal' | 'crosswalk';
  forward: Point; outward: Point; height: number; length?: number; width?: number; ribs?: number; armLength?: number;
  points?: Point[]; roadPolygons?: Point[][];
  [key: string]: unknown;
};
type Part = {
  proxy: THREE.Mesh; geometry: THREE.BufferGeometry; kind: 'opaque' | 'glass' | 'label';
  baseColor: THREE.Color; ownerBaseColor: THREE.Color; start: number; count: number; visible: boolean; lastColor: number;
  batch?: THREE.Mesh; original?: Float32Array; originalColors?: Float32Array;
};

/** 운행 정차점에 대응한 시설을 만든다. 형상 치수와 도로 바깥 배치는 추정값이다. */
export function createTransitFacilities(scene: THREE.Scene, plan: TransitFacilitiesPlan, heightAt: HeightSampler) {
  if (plan.schemaVersion !== 1 || !Array.isArray(plan.stops)) throw Error('Invalid transit facilities plan.');
  const shell = new THREE.Group(); shell.name = 'facilities/transit';
  const breakables: BreakableSpec[] = [], parts: Part[] = [];
  const batchGroups = new Map<string, Part[]>(), labelTexture = createLabelAtlas(plan.stops);
  const materials = {
    opaque: new THREE.MeshStandardMaterial({ vertexColors: true, map: labelTexture, roughness: .72, metalness: .12 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .3, metalness: .05, transparent: true, opacity: .32, depthWrite: false, side: THREE.DoubleSide }),
    label: new THREE.MeshStandardMaterial({ map: labelTexture, vertexColors: true, roughness: .72, metalness: .12 }),
  };
  Object.assign(shell.userData, { role: 'campus-facilities', facilityId: shell.name, landmark: 'transit-facilities',
    coordinateSystem: 'D=(east,up,north); parent H once.', sourceHashes: plan.sourceHashes, stopSites: [],
    dimensionsEstimated: true, tileSize: 240, signalCount: 0, streetLampCount: 0, fixtures: [], sourceSummary: plan.summary,
    limits: ['정류장 표지의 치수와 글자 배치는 게임용 근사다.', '쉘터 미기록을 쉘터 없음으로 해석하지 않는다.'] });
  scene.add(shell);

  function add(geometry: THREE.BufferGeometry, center: THREE.Vector3, quaternion: THREE.Quaternion, color: number,
    site: SiteRef, component: string, kind: Part['kind'], material: BreakableSpec['material'], toughness: number, owner?: THREE.Mesh) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    g.computeBoundingBox(); const size = g.boundingBox!.getSize(new THREE.Vector3());
    const proxy = owner ?? new THREE.Mesh(g.clone(), new THREE.MeshStandardMaterial({ color }));
    if (!owner) {
      proxy.position.copy(center); proxy.quaternion.copy(quaternion); proxy.updateMatrixWorld(true);
      Object.assign(proxy.userData, { facilityId: shell.name, siteId: site.id, stopIds: site.stopIds, renderProxy: true, component, dimensionsEstimated: true });
      breakables.push({ mesh: proxy, size, collisionVertices: g.getAttribute('position').array.slice() as Float32Array, toughness, material, label: `${site.label} ${component}` });
    }
    const baseColor = new THREE.Color(color), colors = new Float32Array(g.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = baseColor.r; colors[i + 1] = baseColor.g; colors[i + 2] = baseColor.b; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.applyMatrix4(new THREE.Matrix4().compose(center, quaternion, new THREE.Vector3(1, 1, 1)));
    if (kind !== 'label') {
      const uv = new Float32Array(g.getAttribute('position').count * 2);
      for (let i = 0; i < uv.length; i += 2) { uv[i] = .5; uv[i + 1] = 1 / labelTexture.image.height; }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    }
    const ownerBaseColor = (proxy.material as THREE.MeshStandardMaterial).color.clone();
    const part: Part = { proxy, geometry: g, kind, baseColor, ownerBaseColor, start: 0, count: g.getAttribute('position').count, visible: true, lastColor: ownerBaseColor.getHex() };
    const key = `${Math.floor(site.position[0] / 240)},${Math.floor(site.position[1] / 240)}/${kind === 'glass' ? 'glass' : 'solid'}`;
    const group = batchGroups.get(key) ?? []; group.push(part); batchGroups.set(key, group); parts.push(part);
    geometry.dispose();
    return proxy;
  }
  for (let index = 0; index < plan.stops.length; index++) {
    const site = plan.stops[index], [x, z] = site.position;
    if (![x, z, ...site.forward, ...site.outward].every(Number.isFinite) || Math.abs(Math.hypot(...site.forward) - 1) > 1e-4) throw Error(`Invalid facility placement: ${site.id}`);
    const yaw = Math.atan2(-site.forward[1], site.forward[0]), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    // 각 부재는 지면에 닿으며 쉘터의 빈 공간 전체를 감싸는 충돌 상자는 만들지 않는다.
    const ground = heightAt(x, z) - .02, origin = new THREE.Vector3(x, ground, z);
    const world = (a: number, y: number, b: number) => new THREE.Vector3(a, y, b).applyQuaternion(q).add(origin);
    const box = (component: string, a: number, y: number, b: number, sx: number, sy: number, sz: number, color: number, kind: Part['kind'] = 'opaque', owner?: THREE.Mesh) =>
      add(new THREE.BoxGeometry(sx, sy, sz), world(a, y, b), q, color, site, component, kind, kind === 'glass' ? 'glass' : 'metal', kind === 'glass' ? 2 : 4, owner);
    const blue = site.signStyle === 'shuttle-pole', panelColor = blue ? 0x245b96 : 0x39865b;
    const pole = add(new THREE.CylinderGeometry(.065, .075, 2.05, 10), world(0, 1.005, -.085), q, 0x424b4b, site, 'stop-pole', 'opaque', 'metal', 4);
    const panel = box('stop-panel', 0, 2.38, 0, .72, .92, .11, panelColor);
    // 번호와 이름은 같은 표지 부품에 묶어 파괴와 초기화 때 함께 바뀐다.
    const atlasHeight = labelTexture.image.height, cellHeight = 64;
    for (const side of [-1, 1]) {
      const g = new THREE.PlaneGeometry(.655, .80), uv = g.getAttribute('uv');
      if (side < 0) g.rotateY(Math.PI);
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, 1 - uv.getX(i), 1 - (index * cellHeight + (1 - uv.getY(i)) * cellHeight) / atlasHeight);
      }
      add(g, world(0, 2.38, side * .057), q, 0xffffff, site, 'stop-label', 'label', 'metal', 4, panel);
    }
    const pad = box('stop-post-base', 0, .045, 0, .30, .12, .30, 0x8d9391);
    shell.userData.stopSites.push({ id: site.id, stopIds: site.stopIds, position: [x, ground, z], forward: site.forward, outward: site.outward,
      sign: { pole: pole.uuid, panel: panel.uuid, pad: pad.uuid }, shelter: site.shelter, shelterModel: site.shelterModel, placement: site.placement });
  }
  for (const site of plan.fixtures) {
    if (site.kind === 'crosswalk') {
      const positions: number[] = [], stripePolygons: Point[][] = [];
      const roadMesh = scene.getObjectByName('campus-road-surface') as THREE.Mesh | undefined;
      if (!roadMesh) throw Error('Crosswalk requires the actual campus-road-surface mesh.');
      const roadPosition = roadMesh.geometry.getAttribute('position'), roadIndex = roadMesh.geometry.index, surface: number[][] = [];
      const footprint = site.points!, minX = Math.min(...footprint.map(p => p[0])) - site.width!, maxX = Math.max(...footprint.map(p => p[0])) + site.width!, minZ = Math.min(...footprint.map(p => p[1])) - site.width!, maxZ = Math.max(...footprint.map(p => p[1])) + site.width!;
      for (let i = 0; i < (roadIndex?.count ?? roadPosition.count); i += 3) {
        const triangle = [0, 1, 2].flatMap(j => { const k = roadIndex ? roadIndex.getX(i + j) : i + j; return [roadPosition.getX(k), roadPosition.getY(k), roadPosition.getZ(k)]; });
        if (Math.max(triangle[0], triangle[3], triangle[6]) >= minX && Math.min(triangle[0], triangle[3], triangle[6]) <= maxX && Math.max(triangle[2], triangle[5], triangle[8]) >= minZ && Math.min(triangle[2], triangle[5], triangle[8]) <= maxZ) surface.push(triangle);
      }
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
      // 차도 메시가 겹치는 경계에서는 실제로 보이는 높은 면에만 페인트를 남긴다.
      const upperSurface: number[][] = [];
      for (let source = 0; source < surface.length; source++) {
        const triangle = surface[source]; let pieces = [[triangle.slice(0, 3), triangle.slice(3, 6), triangle.slice(6, 9)]];
        for (let j = 0; j < surface.length && pieces.length; j++) {
          if (j === source) continue;
          const t = surface[j], a = t.slice(0, 3), b = t.slice(3, 6), c = t.slice(6, 9), det = (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]);
          if (Math.abs(det) < 1e-8 || Math.max(t[0], t[3], t[6]) <= Math.min(triangle[0], triangle[3], triangle[6]) || Math.min(t[0], t[3], t[6]) >= Math.max(triangle[0], triangle[3], triangle[6]) || Math.max(t[2], t[5], t[8]) <= Math.min(triangle[2], triangle[5], triangle[8]) || Math.min(t[2], t[5], t[8]) >= Math.max(triangle[2], triangle[5], triangle[8])) continue;
          const above = (p: number[]) => {
            const u = ((p[0] - a[0]) * (c[2] - a[2]) - (p[2] - a[2]) * (c[0] - a[0])) / det;
            const v = ((b[0] - a[0]) * (p[2] - a[2]) - (b[2] - a[2]) * (p[0] - a[0])) / det;
            return a[1] + u * (b[1] - a[1]) + v * (c[1] - a[1]) - p[1] - 1e-5;
          };
          const sign = Math.sign(det), edges = [[a, b], [b, c], [c, a]];
          const planes = edges.map(([p, q]) => (r: number[]) => sign * ((q[0] - p[0]) * (r[2] - p[2]) - (q[2] - p[2]) * (r[0] - p[0])));
          planes.push(above);
          const kept: number[][][] = [];
          for (const piece of pieces) {
            if (piece.every(p => above(p) <= 0) || clip(piece, [[a[0], a[2]], [b[0], b[2]], [c[0], c[2]]]).length < 3) { kept.push(piece); continue; }
            let remaining = piece;
            for (const plane of planes) {
              const outside = halfPlane(remaining, p => -plane(p)); if (outside.length >= 3) kept.push(outside);
              remaining = halfPlane(remaining, plane); if (remaining.length < 3) break;
            }
          }
          pieces = kept;
        }
        for (const piece of pieces) for (let i = 1; i < piece.length - 1; i++) upperSurface.push([...piece[0], ...piece[i], ...piece[i + 1]]);
      }
      const path = site.points!; let station = 0, stripes = 0;
      for (let segment = 0; segment < path.length - 1; segment++) {
        const a = path[segment], b = path[segment + 1], length = Math.hypot(b[0] - a[0], b[1] - a[1]), u = [(b[0] - a[0]) / length, (b[1] - a[1]) / length], n = [u[1], -u[0]];
        for (let distance = Math.ceil(station / 1.1) * 1.1 - station; distance < length; distance += 1.1) {
          const end = Math.min(distance + .57, length), w = site.width! / 2;
          const polygon: Point[] = [[distance, -w], [end, -w], [end, w], [distance, w]].map(([s, t]) => [a[0] + u[0] * s + n[0] * t, a[1] + u[1] * s + n[1] * t]);
          const bounds = { minX: Math.min(...polygon.map(p => p[0])), maxX: Math.max(...polygon.map(p => p[0])), minZ: Math.min(...polygon.map(p => p[1])), maxZ: Math.max(...polygon.map(p => p[1])) };
          const triangles = upperSurface.filter(t => Math.max(t[0], t[3], t[6]) >= bounds.minX && Math.min(t[0], t[3], t[6]) <= bounds.maxX && Math.max(t[2], t[5], t[8]) >= bounds.minZ && Math.min(t[2], t[5], t[8]) <= bounds.maxZ);
          let emitted = false;
          for (const road of site.roadPolygons!) {
            const roadClipped = clip(polygon.map(p => [p[0], 0, p[1]]), road); if (roadClipped.length < 3) continue;
            const roadPolygon = roadClipped.map(p => [p[0], p[2]] as Point);
            for (const triangle of triangles) {
              const exact = clip([triangle.slice(0, 3), triangle.slice(3, 6), triangle.slice(6, 9)], roadPolygon);
              for (let i = 1; i < exact.length - 1; i++) {
                const a = exact[0], b = exact[i], c = exact[i + 1];
                if (Math.abs((b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0])) < 1e-5) continue;
                if ([[a, b], [b, c], [c, a]].some(([p, q]) => Math.hypot(p[0] - q[0], p[2] - q[2]) < .0001)) continue;
                for (const p of [a, b, c]) positions.push(p[0], p[1] + .035, p[2]); emitted = true;
              }
            }
          }
          if (emitted) { stripes++; stripePolygons.push(polygon); }
        }
        station += length;
      }
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xe7e7db, side: THREE.DoubleSide, roughness: .94 }));
      mesh.name = 'transit-facilities/gate-crosswalk'; mesh.userData.labelRanges = []; shell.add(mesh);
      shell.userData.fixtures.push({ ...site, stripes, stripePolygons, actualRoadTriangles: true, roadOffset: .035, physicalCollider: false });
      continue;
    }
    const [x, z] = site.position, q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-site.forward[1], site.forward[0]));
    const origin = new THREE.Vector3(x, heightAt(x, z) - .02, z);
    const world = (u: number, y: number, v: number) => new THREE.Vector3(u, y, v).applyQuaternion(q).add(origin);
    const ground = (u: number, v: number) => { const p = world(u, 0, v); return heightAt(p.x, p.z) - origin.y - .02; };
    const box = (name: string, u: number, y: number, v: number, sx: number, sy: number, sz: number, color = 0x394345, kind: Part['kind'] = 'opaque', owner?: THREE.Mesh) =>
      add(new THREE.BoxGeometry(sx, sy, sz), world(u, y, v), q, color, site, name, kind, kind === 'glass' ? 'glass' : 'metal', kind === 'glass' ? 2 : 5, owner);
    const beam = (name: string, a: number[], b: number[], radius = .05, color = 0x485254, owner?: THREE.Mesh) => {
      const start = world(a[0], a[1], a[2]), end = world(b[0], b[1], b[2]), vector = end.clone().sub(start);
      return add(new THREE.CylinderGeometry(radius, radius, vector.length(), 8), start.clone().add(end).multiplyScalar(.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vector.normalize()), color, site, name, 'opaque', 'metal', 5, owner);
    };
    const panel = (name: string, corners: number[][], color: number, kind: Part['kind'] = 'opaque') => {
      const points = corners.map(p => world(p[0], p[1], p[2])), center = points.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / points.length);
      return add(new ConvexGeometry(points.map(p => p.sub(center))), center, new THREE.Quaternion(), color, site, name, kind, kind === 'glass' ? 'glass' : 'metal', kind === 'glass' ? 2 : 4);
    };
    const bench = (centerU: number, length: number, v: number) => {
      const y = Math.max(ground(centerU - length / 2, v), ground(centerU + length / 2, v)) + .48;
      box('shelter-bench-seat', centerU, y, v, length, .085, .42, 0x706451);
      box('shelter-bench-back', centerU, y + .32, v - .16, length, .30, .065, 0x625e52);
      for (const u of [centerU - length * .35, centerU + length * .35]) {
        const bottom = ground(u, v) - .02; box('shelter-bench-leg', u, (bottom + y) / 2, v, .07, y - bottom, .32, 0x394345);
      }
    };
    const meta: Record<string, unknown> = { ...site, groundY: origin.y };
    if (site.kind === 'standard-shelter') {
      const length = site.length!, width = site.width!, h = Math.max(...[-length / 2, 0, length / 2].flatMap(u => [-width / 2, 0, width / 2].map(v => ground(u, v)))) + site.height;
      box('shelter-roof', 0, h, 0, length, .14, width, 0x596465);
      for (const u of [-length / 2 + .12, length / 2 - .12]) for (const v of [-width / 2 + .10, width / 2 - .10]) {
        const bottom = ground(u, v) - .04; beam('shelter-post', [u, bottom, v], [u, h, v], .055);
      }
      for (let i = 0; i < 3; i++) {
        const u = (i - 1) * (length - .30) / 3, lo = Math.max(ground(u - .7, -.96), ground(u + .7, -.96)) + .22;
        box('shelter-back-glass', u, (lo + h - .13) / 2, -width / 2 + .12, (length - .30) / 3 - .055, h - .13 - lo, .035, 0x92a6a4, 'glass');
      }
      bench(0, 2.65, -.62);
      Object.assign(meta, { roofTop: origin.y + h + .07, openFront: true, walkChannel: { u: [-1.7, 1.7], v: [.15, .75] } });
    } else if (site.kind === 'arched-shelter') {
      const length = site.length!, half = site.width! / 2, bays = (site.ribs ?? 13) - 1, rise = site.height - half;
      const section: Point[] = [[-.0 - half, .35], [-half, rise], ...Array.from({ length: 8 }, (_, i) => { const a = Math.PI - (i + 1) / 8 * Math.PI; return [Math.cos(a) * half, rise + Math.sin(a) * half] as Point; }), [half, .35]];
      const floor = (u: number) => Math.max(ground(u, -.85), ground(u, .85));
      for (let bay = 0; bay < bays; bay++) {
        const a = -length / 2 + length * bay / bays, b = -length / 2 + length * (bay + 1) / bays;
        for (let j = 0; j < section.length - 1; j++) {
          const [v0, y0] = section[j], [v1, y1] = section[j + 1], dy = y1 - y0, dv = v1 - v0, l = Math.hypot(dy, dv), ny = dv / l * .045, nv = -dy / l * .045;
          const corners = [[a, floor(a) + y0, v0], [b, floor(b) + y0, v0], [b, floor(b) + y1, v1], [a, floor(a) + y1, v1]];
          panel('arched-shelter-cover', [...corners, ...corners.map(p => [p[0], p[1] + ny, p[2] + nv])], 0x343d40);
        }
      }
      for (let rib = 0; rib <= bays; rib++) {
        const u = -length / 2 + length * rib / bays;
        for (let j = 0; j < section.length - 1; j++) beam('arched-shelter-rib', [u, floor(u) + section[j][1], section[j][0]], [u, floor(u) + section[j + 1][1], section[j + 1][0]], .042, 0x929b9b);
        for (const v of [-half, half]) beam('arched-shelter-foot', [u, ground(u, v) - .025, v], [u, floor(u) + .4, v], .055, 0x465052);
      }
      for (const u of [-4.8, -1.6, 1.6, 4.8]) bench(u, 2.75, -.82);
      Object.assign(meta, { openEnds: true, section, ribs: bays + 1, entranceLocalU: [-length / 2, length / 2], walkChannel: { v: [-.25, .55] }, shellMaterialUncertain: true });
    } else if (site.kind === 'double-lamp') {
      beam('street-lamp-pole', [0, -.045, 0], [0, site.height, 0], .085, 0x3c484a);
      box('street-lamp-crossbar', 0, site.height - .05, 0, 1.55, .10, .13, 0x394547);
      for (const u of [-.58, .58]) {
        const head = box('street-lamp-head', u, site.height - .09, 0, .59, .095, .28, 0x3a4548);
        box('street-lamp-diffuser', u, site.height - .143, 0, .49, .015, .23, 0xd8dfd8, 'opaque', head);
      }
      shell.userData.streetLampCount++;
    } else if (site.kind === 'cantilever-signal') {
      const h = site.height - 1.05, arm = site.armLength!;
      beam('signal-mast', [0, -.10, 0], [0, site.height, 0], .17, 0x3b4648);
      beam('signal-cantilever', [0, h, 0], [0, h, arm], .075, 0x424d4e);
      beam('signal-diagonal-brace', [0, site.height - .12, 0], [0, h, arm * .65], .028, 0x65706d);
      for (const v of [arm * .39, arm * .82]) {
        const head = box('vehicle-signal-head', -.03, h - .32, v, .25, .40, 1.32, 0x202c2c);
        for (let light = 0; light < 3; light++) {
          const lens = new THREE.CylinderGeometry(.135, .135, .018, 12); lens.rotateZ(Math.PI / 2);
          add(lens, world(-.166, h - .32, v + (light - 1) * .40), q, light === 0 ? 0x36b27c : light === 2 ? 0x4b2525 : 0x4e4327, site, 'vehicle-signal-lens', 'opaque', 'metal', 5, head);
        }
      }
      const pedestrian = box('pedestrian-signal-box', 0, 2.25, .27, .28, .67, .22, 0x232d2e);
      for (const [y, color] of [[2.43, 0xb64943], [2.08, 0x1c3430]]) box('pedestrian-signal-display', 0, y, .387, .22, .25, .018, color, 'opaque', pedestrian);
      Object.assign(meta, { operation: 'static visual state; no traffic or real-time signal control', minimumArmCenterY: origin.y + h });
      shell.userData.signalCount++;
    }
    shell.userData.fixtures.push(meta);
  }
  for (const [key, group] of batchGroups) {
    let offset = 0;
    for (const part of group) { part.start = offset; offset += part.count; }
    const geometry = mergeGeometries(group.map(p => p.geometry), false)!;
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, materials[group[0].kind]);
    mesh.name = `transit-facilities/${key}`; mesh.castShadow = group[0].kind === 'opaque'; mesh.receiveShadow = true;
    mesh.userData.partCount = new Set(group.map(p => p.proxy)).size;
    mesh.userData.labelRanges = group.filter(p => p.kind === 'label').map(p => ({ start: p.start, count: p.count }));
    mesh.userData.parts = group.map(p => ({ start: p.start, count: p.count, owner: p.proxy.uuid, component: p.proxy.userData.component, baseColor: p.baseColor.getHex(), ownerBaseColor: p.ownerBaseColor.getHex() }));
    shell.add(mesh);
    for (const part of group) {
      part.batch = mesh;
      part.original = part.geometry.getAttribute('position').array.slice() as Float32Array;
      part.originalColors = part.geometry.getAttribute('color').array.slice() as Float32Array;
      part.geometry.dispose();
    }
  }
  Object.assign(shell.userData, { parts: breakables.length, renderMeshes: shell.children.length,
    triangles: shell.children.reduce((n, m) => n + ((m as THREE.Mesh).geometry.getAttribute('position').count / 3), 0), rendering: '240m regional merged surfaces; original bounds retained after destruction.' });
  function update(_player: THREE.Vector3) {
    for (const part of parts) {
      const mesh = part.batch!, positions = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      if (part.visible !== part.proxy.visible) {
        part.visible = part.proxy.visible;
        if (part.visible) (positions.array as Float32Array).set(part.original!, part.start * 3);
        else for (let i = 0; i < part.count; i++) positions.setXYZ(part.start + i, part.original![0], part.original![1], part.original![2]);
        positions.needsUpdate = true;
      }
      const tint = (part.proxy.material as THREE.MeshStandardMaterial).color, color = tint.getHex();
      if (color !== part.lastColor) {
        const attr = mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
        if (tint.equals(part.ownerBaseColor)) {
          // 정상 상태에서는 렌즈, 등갓과 글자의 고유 색을 부모 부품 색과 구분한다.
          (attr.array as Float32Array).set(part.originalColors!, part.start * 3);
        } else for (let i = 0; i < part.count; i++) attr.setXYZ(part.start + i, tint.r, tint.g, tint.b);
        part.lastColor = color; attr.needsUpdate = true;
      }
    }
  }
  return { breakables, update, shell };
}

function createLabelAtlas(stops: TransitFacilityStop[]) {
  const canvas = document.createElement('canvas'); canvas.width = 256;
  canvas.height = THREE.MathUtils.ceilPowerOfTwo(Math.max(64, (stops.length + 1) * 64));
  const ctx = canvas.getContext('2d'); if (!ctx) throw Error('Unable to create transit label atlas.');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i], y = i * 64;
    ctx.fillStyle = '#f3f4eb'; ctx.fillRect(0, y, 256, 64);
    ctx.fillStyle = stop.signStyle === 'shuttle-pole' ? '#245b96' : '#22683c';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 19px sans-serif'; ctx.fillText(stop.label, 128, y + 21, 246);
    ctx.font = '14px sans-serif'; ctx.fillText(stop.routes.join('  '), 128, y + 47, 244);
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter; texture.generateMipmaps = false;
  texture.name = 'transit-stop-name-atlas'; return texture;
}
