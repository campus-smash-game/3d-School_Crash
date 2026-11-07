import {cutTerrainPatchSteps} from './terrainPatch';
import { humanities23Frame } from './humanities23Site';
import { physics561SurfaceHeight, type Physics561Surface } from './physics561Site';

export const SCIENCE25_ID = 'way/161957772', SCIENCE27_ID = 'way/161950628';
type Frame = ReturnType<typeof humanities23Frame>;
export type Science2527Surface = Physics561Surface & { frame?: Frame; elevated?: boolean; buildingId: string };
export function getScience2527Layout(heightAt: (x: number, z: number) => number) {
  const f = humanities23Frame([164.11, -813.1], [131.88, -894.17]);
  // 2008년 공식 문서의 25동 1층과 27동 지하층 높이 관계를 적용한다. 층고와 현재 접속층은 근사다.
  const floor = heightAt(...f.point(87.387, -10.219)) + .38;
  const floors25 = [floor, floor + 3.5, floor + 7, floor + 10.5], roof25 = floor + 14;
  const floors27 = [floor, floor + 3.5, floor + 7, floor + 10.5, floor + 14], roof27 = floor + 17.5;
  const bridge = humanities23Frame([134.97, -886.41], [146.95, -889.83]), bridgeFloor = floors27[1];
  const surfaces: Science2527Surface[] = [], routes: Record<string, [number, number, number][]> = {};
  const at = (s: number, n: number, y: number): [number, number, number] => { const p = f.point(s, n); return [p[0], y, p[1]]; };
  const add = (name: string, s0: number, s1: number, n0: number, n1: number, y0: number, y1 = y0, axis: 's' | 'n' = 's', frame = f, buildingId = SCIENCE27_ID, elevated = false) => surfaces.push({ name, s0, s1, n0, n1, y0, y1, axis, frame, buildingId, elevated });
  const north = heightAt(...f.point(67, 6)) + .04, south = heightAt(...f.point(102, 6)) + .04;
  add('court-north-ramp', 67, 72, 3.5, 8.5, north, floor);
  add('lower-court-paving', 72, 95, 1, 12, floor);
  add('court-south-ramp', 95, 102, 3.5, 8.5, floor, south);
  routes.underBridge = [at(67.2, 6, north + (floor - north) * .04), at(73, 6, floor), at(94, 6, floor), at(101.8, 6, south + (floor - south) * .2 / 7)];
  const doors = [
    { name: '25-north', buildingId: SCIENCE25_ID, point: [153.97, -809.39], outside: f.point(-3.4, -10.793), level: 0, width: 2.8, node: '4562088370', ramp: true },
    { name: '25-south', buildingId: SCIENCE25_ID, point: [122.33, -890.53], outside: f.point(94, -10.219), level: 0, width: 3, node: '4562088374', ramp: false },
    { name: '25-west', buildingId: SCIENCE25_ID, point: f.point(50, -21.03), outside: f.point(50, -23.15), level: 0, width: 4, node: null, ramp: false },
    { name: '27-lower', buildingId: SCIENCE27_ID, point: [144.79, -894.97], outside: f.point(83.216, 6), level: 0, width: 3.1, node: '4562088375', ramp: true },
    { name: '27-west', buildingId: SCIENCE27_ID, point: [127.05, -937.21], outside: f.point(129.021, 5.8), level: 1, width: 3.1, node: '4562088376', ramp: false },
    { name: '27-east', buildingId: SCIENCE27_ID, point: [160.47, -911.27], outside: f.point(92.57, 39.388), level: 1, width: 3.8, node: '1790388362', ramp: true },
    { name: '27-south', buildingId: SCIENCE27_ID, point: [128.15, -964.45], outside: f.point(159.5, 22.498), level: 1, width: 3, node: '4562088378', ramp: false },
  ].map(d => ({ ...d, point: d.point as [number, number], frame: humanities23Frame(d.outside as [number, number], d.point as [number, number]), floor: (d.buildingId === SCIENCE25_ID ? floors25 : floors27)[d.level] }));
  for (const d of doors) {
    if (d.name === '27-lower') {
      // 마당과 같은 높이인 현관 앞에는 포장을 겹치지 않고 경계부터 연결한다.
      const start = d.frame.length - (f.local(d.point).n - 12);
      add('27-lower-landing', start, d.frame.length + 2.1, -1.85, 1.85, floor, floor, 's', d.frame);
      routes[d.name] = [at(83.216, 6, floor), at(83.216, 14, floor)];
      continue;
    }
    const e = d.frame, end = Math.max(.5, e.length - .7), low = d.name === '27-lower' ? floor : heightAt(...e.point(0)) + .04, width = d.width + .6;
    const p = (s: number, y: number): [number, number, number] => { const v = e.point(s); return [v[0], y, v[1]]; };
    const route = [p(.08, low + (d.floor - low) * .08 / end)];
    if (d.ramp || Math.abs(low - d.floor) < .15) add(d.name + '-ramp', 0, end, -width / 2, width / 2, low, d.floor, 's', e, d.buildingId);
    else {
      const count = Math.ceil(Math.abs(d.floor - low) / .16);
      for (let i = 0; i < count; i++) {
        const a = end * i / count, b = end * (i + 1) / count, y = low + (d.floor - low) * (i + 1) / count;
        add(d.name + '-stair', a, b, -width / 2, width / 2, y, y, 's', e, d.buildingId); route.push(p((a + b) / 2, y));
      }
    }
    add(d.name + '-landing', end, e.length + 2.1, -width / 2, width / 2, d.floor, d.floor, 's', e, d.buildingId);
    route.push(p(e.length + 1.4, d.floor)); routes[d.name] = route;
  }
  add('enclosed-bridge-floor', -.6, bridge.length + .6, -1.8, 1.8, bridgeFloor, bridgeFloor, 's', bridge, SCIENCE25_ID, true);
  const bridgeAt = (s: number): [number, number, number] => { const p = bridge.point(s); return [p[0], bridgeFloor, p[1]]; };
  routes.bridgeFromEast = [...routes['27-east'], at(92.57, 23, bridgeFloor), at(77.64, 23, bridgeFloor), bridgeAt(bridge.length + 1.3), bridgeAt(-1.3)];
  const points = surfaces.flatMap(a => { const e = a.frame ?? f; return [e.point(a.s0, a.n0), e.point(a.s1, a.n0), e.point(a.s1, a.n1), e.point(a.s0, a.n1)]; });
  points.push(...[[144.68, -805.99], [111.98, -886.57], [131.88, -894.17], [164.11, -813.1], [117.67, -959.58], [138.04, -969.06], [168.38, -890.85], [149.9, -882.79]] as [number, number][]);
  const bounds = { minX: Math.min(...points.map(p => p[0])) - 2, maxX: Math.max(...points.map(p => p[0])) + 2, minZ: Math.min(...points.map(p => p[1])) - 2, maxZ: Math.max(...points.map(p => p[1])) + 2 };
  return { f, floor, floors25, floors27, roof25, roof27, bridge, bridgeFloor, doors, surfaces, routes, bounds };
}
export type Science2527Layout = ReturnType<typeof getScience2527Layout>;
export function* cutScience2527TerrainSteps(positions: number[], indices: number[], q: Science2527Layout, buildings: { id: string; points: [number, number][] }[]) {
  const rings = buildings.filter(b => [SCIENCE25_ID, SCIENCE27_ID].includes(b.id)).map(b => b.points);
  const inside = (x: number, z: number, points: [number, number][]) => { let hit = false; for (let i = 0, j = points.length - 1; i < points.length; j = i++) { const a = points[i], b = points[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit; } return hit; };
  const areas = q.surfaces.filter(a => !a.elevated);
  const segments = areas.flatMap(a => { const f = a.frame ?? q.f, p = [f.point(a.s0, a.n0), f.point(a.s1, a.n0), f.point(a.s1, a.n1), f.point(a.s0, a.n1)]; return p.map((v, i) => [v, p[(i + 1) % 4]]); });
  for (const ring of rings) for (let i = 1; i < ring.length; i++) segments.push([ring[i - 1], ring[i]]);
  const weight = (s: number, n: number, a: Physics561Surface) => Math.max(0, 1 - Math.hypot(Math.max(0, a.s0 - s, s - a.s1), Math.max(0, a.n0 - n, n - a.n1)) / .2);
  const patch = (yield* cutTerrainPatchSteps(positions, indices, 0, { bounds: q.bounds, local: (x, z) => q.f.local([x, z]), lines: { s: [], n: [] }, boundarySegments: segments, apply: (x, z, y) => {
    let result = y;
    for (const a of areas) { const p = (a.frame ?? q.f).local([x, z]); result = Math.min(result, y + (physics561SurfaceHeight(a, p.s, p.n) - .25 - y) * weight(p.s, p.n, a)); }
    if (rings.some(r => inside(x, z, r))) result = Math.min(result, q.floor - .25);
    return result;
  } }));
  return { ...patch, affects: (x: number, z: number) => areas.some(a => { const p = (a.frame ?? q.f).local([x, z]); return weight(p.s, p.n, a) > 0; }) || rings.some(r => inside(x, z, r)) };
}

export function cutScience2527Terrain(...args:Parameters<typeof cutScience2527TerrainSteps>){
  const steps=cutScience2527TerrainSteps(...args);let result=steps.next();
  while(!result.done)result=steps.next();
  return result.value;
}
