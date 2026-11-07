import {cutTerrainPatchSteps} from './terrainPatch';
import { humanities23Frame } from './humanities23Site';
import { physics561SurfaceHeight, type Physics561Surface } from './physics561Site';
import type { Science2527Layout } from './science2527Site';
export const SCIENCE24_ID = 'way/238937635';
type Frame = ReturnType<typeof humanities23Frame>;
export type Science24Surface = Physics561Surface & { frame?: Frame; elevated?: boolean };
export function getScience24Layout(heightAt: (x: number, z: number) => number, neighbor25: Science2527Layout) {
  const f = humanities23Frame([160.39, -738.6], [128.89, -816.2]);
  const floor = heightAt(...f.point(40, -12)) + .35, floors = [floor, floor + 3.5, floor + 7, floor + 10.5], roof = floor + 14;
  const surfaces: Science24Surface[] = [], routes: Record<string, [number, number, number][]> = {};
  const at = (s: number, n: number, y: number): [number, number, number] => { const p = f.point(s, n); return [p[0], y, p[1]]; };
  const add = (name: string, s0: number, s1: number, n0: number, n1: number, y0: number, y1 = y0, axis: 's' | 'n' = 's', frame = f, elevated = false) => surfaces.push({ name, s0, s1, n0, n1, y0, y1, axis, frame, elevated });
  const flight = (name: string, frame: Frame, length: number, width: number, low: number, high: number) => {
    const count = Math.max(1, Math.ceil(Math.abs(high - low) / .16)), route: [number, number, number][] = [];
    for (let i = 0; i < count; i++) {
      const a = length * i / count, b = length * (i + 1) / count, y = low + (high - low) * (i + 1) / count, p = frame.point((a + b) / 2);
      add(name, a, b, -width / 2, width / 2, y, y, 's', frame); route.push([p[0], y, p[1]]);
    }
    return route;
  };
  const doors = [
    { name: 'north', point: [149.86, -734.12] as [number, number], node: '4562088355', width: 2.6 },
    { name: 'east-north', point: [155.31, -751.1] as [number, number], node: '4562088356', width: 3.8 },
    { name: 'east-south', point: [139.39, -790.33] as [number, number], node: '4562088357', width: 3.8 },
    { name: 'south', point: [118.57, -811.39] as [number, number], node: '4562088362', width: 2.6 },
  ];
  const north = f.local(doors[0].point), northStart = f.point(-6.5, north.n), northFrame = humanities23Frame(northStart, doors[0].point), northLow = heightAt(...northStart) + .04;
  const northStair = flight('north-entry-stair', northFrame, northFrame.length - .8, 3.1, northLow, floor);
  add('north-entry-landing', northFrame.length - .8, northFrame.length + 2, -1.55, 1.55, floor, floor, 's', northFrame);
  routes.northEntry = [at(-6.4, north.n, northLow), ...northStair, at(north.s + 1.4, north.n, floor)];
  for (const d of doors.filter(d => d.name.startsWith('east'))) {
    const p = f.local(d.point), outer = 1.65, e = humanities23Frame(f.point(p.s, outer), d.point), low = heightAt(...e.point(0)) + .04;
    const stair = flight(d.name + '-stair', e, e.length - .5, 2, low, floor);
    add(d.name + '-landing', p.s - 1.6, p.s + 2.2, -2, .5, floor);
    routes[d.name + 'Entry'] = [at(p.s, outer - .04, low), ...stair, at(p.s, -1.4, floor)];
    const rampStart = p.s + 11, rampLow = heightAt(...f.point(rampStart, 1)) + .04;
    add(d.name + '-ramp', p.s + 2.2, rampStart, .4, 1.6, floor, rampLow);
    add(d.name + '-ramp-turn', p.s + 1, p.s + 2.2, .5, 1.6, floor);
    routes[d.name + 'Ramp'] = [at(rampStart - .1, 1, rampLow + (floor - rampLow) * .1 / (rampStart - p.s - 2.2)), at(p.s + 1.4, 1, floor), at(p.s + 1.4, .05, floor), at(p.s, .05, floor), at(p.s, -1.4, floor)];
  }
  // 지도에 표시된 남쪽 계단을 따르되 높이는 게임 지형에 맞춘 추정값을 쓴다.
  const southStair = humanities23Frame([108.49, -815.3], [118.88, -818.91]), southLow = heightAt(...southStair.point(0)) + .04;
  const southFlight = flight('south-mapped-stair', southStair, southStair.length, 2.2, southLow, floor);
  add('south-upper-paving', 85.4, 91.4, -8.25, -5.7, floor);
  add('south-entry-landing', 81.5, 85.4, -13, -5.7, floor);
  const southEnd = southStair.point(southStair.length), southLocal = f.local(southEnd);
  // 사선 계단 끝과 보행로 사이에는 틈을 막는 짧은 발판을 둔다.
  add('south-stair-landing', southStair.length, southStair.length + .15, -1.1, 1.1, floor - .006, floor - .006, 's', southStair);
  routes.southStairs = [...southFlight, at(southLocal.s, -7.3, floor), at(84.4, -7.3, floor), at(83.3, -11.37, floor), at(81.9, -11.37, floor)];
  const rampLow = heightAt(...f.point(86.4, -22)) + .04;
  add('south-entry-ramp', 85.4, 87.4, -22, -8.25, rampLow, floor, 'n');
  routes.southRamp = [at(86.4, -21.9, rampLow + (floor - rampLow) * .1 / 13.75), at(86.4, -7.3, floor), at(84.4, -7.3, floor), at(83.3, -11.37, floor), at(81.9, -11.37, floor)];
  // 항공사진의 짧은 연결교를 반영한다. 층 이름과 높이는 미확인이라 양쪽 두 번째 바닥을 연결한다.
  const bridgeA = f.point(74, 0), t = (74 - 68.35045281571752) / (155.31266483797106 - 68.35045281571752);
  const bridgeB: [number, number] = [144.68 + (111.98 - 144.68) * t, -805.99 + (-886.57 + 805.99) * t];
  const bridge = humanities23Frame(bridgeA, bridgeB), bridgeStart = floors[1], bridgeEnd = neighbor25.floors25[1];
  add('24-25-bridge-floor', 0, bridge.length, -1.65, 1.65, bridgeStart, bridgeEnd, 's', bridge, true);
  const bridgeAt = (s: number): [number, number, number] => { const p = bridge.point(s); return [p[0], bridgeStart + (bridgeEnd - bridgeStart) * Math.max(0, Math.min(1, s / bridge.length)), p[1]]; };
  routes.bridge = [bridgeAt(-1.2), bridgeAt(bridge.length / 2), bridgeAt(bridge.length + 1.2)];
  routes.bridgeFrom27 = [...neighbor25.routes.bridgeFromEast, at(140, 20, bridgeEnd), at(74, 20, bridgeEnd), bridgeAt(bridge.length + 1.2), bridgeAt(-1.2)];
  routes.underBridge = [68, 73, 76, 82].map(s => { const p = f.point(s, 5.6); return [p[0], heightAt(...p), p[1]]; });
  const connection25 = { point: bridgeB, floor: bridgeEnd, width: 3.3 };
  const footprint: [number, number][] = [[138.84, -729.45], [149.86, -734.12], [160.39, -738.6], [155.31, -751.1], [139.39, -790.33], [128.89, -816.2], [118.57, -811.39], [108.53, -806.71], [138.84, -729.45]];
  const points = surfaces.flatMap(a => { const e = a.frame ?? f; return [e.point(a.s0, a.n0), e.point(a.s1, a.n0), e.point(a.s1, a.n1), e.point(a.s0, a.n1)]; }).concat(footprint);
  const bounds = { minX: Math.min(...points.map(p => p[0])) - 2, maxX: Math.max(...points.map(p => p[0])) + 2, minZ: Math.min(...points.map(p => p[1])) - 2, maxZ: Math.max(...points.map(p => p[1])) + 2 };
  return { f, floor, floors, roof, doors, surfaces, routes, footprint, bounds, bridge, bridgeStart, bridgeEnd, connection25, neighbor25 };
}
export type Science24Layout = ReturnType<typeof getScience24Layout>;
export function* cutScience24TerrainSteps(positions: number[], indices: number[], q: Science24Layout) {
  const areas = q.surfaces.filter(a => !a.elevated), ring = q.footprint;
  const inside = (x: number, z: number) => { let hit = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit; } return hit; };
  const segments = areas.flatMap(a => { const e = a.frame ?? q.f, p = [e.point(a.s0, a.n0), e.point(a.s1, a.n0), e.point(a.s1, a.n1), e.point(a.s0, a.n1)]; return p.map((b, i) => [b, p[(i + 1) % 4]]); });
  for (let i = 1; i < ring.length; i++) segments.push([ring[i - 1], ring[i]]);
  const weight = (s: number, n: number, a: Physics561Surface) => Math.max(0, 1 - Math.hypot(Math.max(0, a.s0 - s, s - a.s1), Math.max(0, a.n0 - n, n - a.n1)) / .15);
  const patch = (yield* cutTerrainPatchSteps(positions, indices, 0, { bounds: q.bounds, local: (x, z) => q.f.local([x, z]), lines: { s: [], n: [] }, boundarySegments: segments, apply: (x, z, y) => {
    let result = y;
    for (const a of areas) { const p = (a.frame ?? q.f).local([x, z]); result = Math.min(result, y + (physics561SurfaceHeight(a, p.s, p.n) - .25 - y) * weight(p.s, p.n, a)); }
    if (inside(x, z)) result = Math.min(result, q.floor - .25); return result;
  } }));
  return { ...patch, affects: (x: number, z: number) => areas.some(a => { const p = (a.frame ?? q.f).local([x, z]); return weight(p.s, p.n, a) > 0; }) || inside(x, z) };
}

export function cutScience24Terrain(...args:Parameters<typeof cutScience24TerrainSteps>){
  const steps=cutScience24TerrainSteps(...args);let result=steps.next();
  while(!result.done)result=steps.next();
  return result.value;
}
