import {cutTerrainPatchSteps} from './terrainPatch';
import { humanities23Frame } from './humanities23Site';
import { physics561SurfaceHeight, type Physics561Surface } from './physics561Site';
import { SCIENCE24_ID, type Science24Layout } from './science24Site';

export const SCIENCE251_ID = 'way/167656591';
type XZ = [number, number];
type Frame = ReturnType<typeof humanities23Frame>;
export type Science251Surface = Physics561Surface & { frame: Frame; elevated?: boolean; buildingId: string; polygon?: XZ[]; cornerHeights?: number[] };

export function getScience251Layout(heightAt: (x: number, z: number) => number, neighbor24: Science24Layout) {
  const f = humanities23Frame([61.77, -805.19], [126.04, -830.44]);
  const floor = heightAt(...f.point(35, -10)) + 1.1, floors = Array.from({ length: 6 }, (_, i) => floor + i * 3.5);
  const garageFloor = heightAt(...f.point(12, -23)) + .04;
  const main: XZ[] = [[53.55, -823.79], [117.7, -851.64], [126.04, -830.44], [61.77, -805.19], [53.55, -823.79]];
  const roundArc: XZ[] = Array.from({ length: 25 }, (_, i) => {
    const t = i / 24, s = 53.02606426246118 - 11.52221669219956 * Math.cos(Math.PI * t);
    const mix = (s - 41.50384757026162) / (64.54828095466075 - 41.50384757026162);
    return f.point(s, -21.384413409408324 - 1.636792592844814 * mix - 14.7 * Math.sin(Math.PI * t));
  });
  const round = [...roundArc, roundArc[0]], roundRoof = floor + 7.3;
  const surfaces: Science251Surface[] = [], routes: Record<string, [number, number, number][]> = {};
  const at = (s: number, n: number, y: number): [number, number, number] => { const p = f.point(s, n); return [p[0], y, p[1]]; };
  const add = (name: string, s0: number, s1: number, n0: number, n1: number, y0: number, y1 = y0, axis: 's' | 'n' = 's', frame = f, elevated = false, buildingId = SCIENCE251_ID) => {
    const a = { name, s0, s1, n0, n1, y0, y1, axis, frame, elevated, buildingId }; surfaces.push(a); return a;
  };
  const flight = (name: string, frame: Frame, length: number, width: number, low: number, high: number, elevated = false, buildingId = SCIENCE251_ID) => {
    const count = Math.max(1, Math.ceil(Math.abs(high - low) / .16)), route: [number, number, number][] = [];
    for (let i = 0; i < count; i++) {
      const s0 = length * i / count, s1 = length * (i + 1) / count, y = low + (high - low) * (i + 1) / count, p = frame.point((s0 + s1) / 2);
      add(name, s0, s1, -width / 2, width / 2, y, y, 's', frame, elevated, buildingId); route.push([p[0], y, p[1]]);
    }
    return route;
  };
  const mappedDoor: XZ = [113.13, -825.37], doorLocal = f.local(mappedDoor), northDoor = f.point(doorLocal.s, 1.6);
  add('north-entry-paving', 31.8, 61, 1.6, 3.4, floor);
  add('north-east-paving', 46.5, 61, 3.4, 5, floor);
  add('north-entry-landing', doorLocal.s - 2, doorLocal.s + 2, -2, 1.6, floor);
  const northRampLow = heightAt(...f.point(69.5, 3.5)) + .04;
  add('north-entry-ramp', 61, 69.5, 2.5, 4.5, floor, northRampLow);
  routes.northRamp = [at(72, 3.5, heightAt(...f.point(72, 3.5))), at(69.4, 3.5, northRampLow + (floor - northRampLow) * .1 / 8.5), at(60.3, 3.5, floor), at(doorLocal.s, 2.5, floor), at(doorLocal.s, -2, floor)];
  const mappedStair = humanities23Frame([95.63, -809.89], [94.05, -814.17]), mappedLow = heightAt(...mappedStair.point(0)) + .04;
  const mappedSteps = flight('north-mapped-stair', mappedStair, mappedStair.length, 2.4, mappedLow, floor);
  add('north-stair-landing', mappedStair.length, mappedStair.length + 2, -1.2, 1.2, floor, floor, 's', mappedStair);
  routes.northStairs = [...mappedSteps, at(33.35, 2.5, floor), at(doorLocal.s, 2.5, floor), at(doorLocal.s, -2, floor)];
  // 기존 24동 남쪽 계단의 낮은 끝에 붙인다. 계단 본체와 위치는 바꾸지 않는다.
  const first24 = neighbor24.surfaces.find(a => a.name === 'south-mapped-stair')!, firstFrame = first24.frame!;
  const joint24 = f.point(45.8, 7.7), jointLow = heightAt(...joint24) + .04, joint = humanities23Frame(joint24, f.point(43, 3.4));
  add('court24-251-ramp', 0, joint.length, -.7, .7, jointLow, floor, 's', joint);
  const center24 = firstFrame.point((first24.s0 + first24.s1) / 2), before24 = firstFrame.point(-.8);
  routes.courtFrom24 = [[center24[0], first24.y0, center24[1]], [before24[0], heightAt(...before24), before24[1]], [joint24[0], jointLow, joint24[1]], at(43, 2.5, floor), at(doorLocal.s, 2.5, floor), at(doorLocal.s, -2, floor)];

  // 주차장 쪽은 높은 기둥 앞 공간과 뒤쪽 유리 로비를 구분한다.
  add('west-parking-paving', -.4, 22, -23, -12, garageFloor);
  add('piloti-paving', 22, 42, -22.5, -12, floor);
  const southStair = humanities23Frame(f.point(36, -29), f.point(36, -22.5)), southLow = heightAt(...southStair.point(0)) + .04;
  const southSteps = flight('south-wide-stair', southStair, southStair.length, 10, southLow, floor);
  const southRampLow = heightAt(...f.point(15, -23)) + .04;
  add('south-entry-ramp', 15, 28, -24, -22, southRampLow, floor);
  add('south-ramp-landing', 28, 31, -24, -22.5, floor);
  routes.southEntry = [...southSteps, at(36, -17, floor), at(36, -10.5, floor), at(50, -5, floor), at(doorLocal.s, -2, floor), at(doorLocal.s, 2.5, floor)];
  routes.southRamp = [at(15.1, -23, southRampLow + (floor - southRampLow) * .1 / 13), at(29.8, -23, floor), at(29.8, -17, floor), at(36, -17, floor), at(36, -10.5, floor)];
  routes.pilotiFront = [at(24.5, -18, floor), at(39.5, -18, floor)];
  routes.westParking = [at(8, -24, heightAt(...f.point(8, -24))), at(8, -17, garageFloor), at(18, -17, garageFloor)];

  // 구름다리의 굽은 지붕은 항공사진을 참고한다. 폭과 상대 높이는 근사한다.
  const bridge24: XZ = [118.57, -811.39], end = f.local(bridge24), bridgeStart = floors[2], bridgeEnd = neighbor24.floors[2];
  const control: XZ[] = [[doorLocal.s, 1.6], [doorLocal.s, 6], [end.s + 3, 12], [end.s, end.n]];
  const bridgePoints = Array.from({ length: 17 }, (_, i) => {
    const t = i / 16, u = 1 - t, s = u ** 3 * control[0][0] + 3 * u * u * t * control[1][0] + 3 * u * t * t * control[2][0] + t ** 3 * control[3][0], n = u ** 3 * control[0][1] + 3 * u * u * t * control[1][1] + 3 * u * t * t * control[2][1] + t ** 3 * control[3][1];
    return { point: f.point(s, n), y: bridgeStart + (bridgeEnd - bridgeStart) * t };
  });
  const bridgeEdges = bridgePoints.map((p, i) => {
    const a = bridgePoints[Math.max(0, i - 1)].point, b = bridgePoints[Math.min(16, i + 1)].point, length = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = -(b[1] - a[1]) / length, nz = (b[0] - a[0]) / length;
    return { ...p, left: [p.point[0] + nx * 1.6, p.point[1] + nz * 1.6] as XZ, right: [p.point[0] - nx * 1.6, p.point[1] - nz * 1.6] as XZ };
  });
  for (let i = 0; i < 16; i++) {
    const a = bridgeEdges[i], b = bridgeEdges[i + 1], frame = humanities23Frame(a.point, b.point), surface = add('curved-bridge-floor', 0, frame.length, -1.6, 1.6, a.y, b.y, 's', frame, true);
    Object.assign(surface, { polygon: [a.right, b.right, b.left, a.left], cornerHeights: [a.y, b.y, b.y, a.y] });
  }
  const bridgeRoute: [number, number, number][] = bridgePoints.map(p => [p.point[0], p.y, p.point[1]]);
  const inside24 = neighbor24.f.point(81.8, -11.37), inside251 = f.point(doorLocal.s, -.8);
  routes.bridge = [[inside251[0], bridgeStart, inside251[1]], ...bridgeRoute, [inside24[0], bridgeEnd, inside24[1]]];
  // 연결교에 접근할 내부 계단은 사진에 없는 게임용 동선이다.
  const f24 = neighbor24.f, low24 = neighbor24.floors[1], high24 = neighbor24.floors[2], middle24 = (low24 + high24) / 2;
  const stairs24a = humanities23Frame(f24.point(68.8, -14.3), f24.point(62, -14.3)), stairs24b = humanities23Frame(f24.point(62, -11.7), f24.point(68.8, -11.7));
  const flight24a = flight('24-interior-stair-lower', stairs24a, stairs24a.length, 1.4, low24, middle24, true, SCIENCE24_ID);
  add('24-interior-mid-landing', 60.8, 62, -15, -11, middle24, middle24, 's', f24, true, SCIENCE24_ID);
  const flight24b = flight('24-interior-stair-upper', stairs24b, stairs24b.length, 1.4, middle24, high24, true, SCIENCE24_ID);
  add('24-interior-upper-landing', 68.8, 70, -12.4, -11, high24, high24, 's', f24, true, SCIENCE24_ID);
  const at24 = (s: number, n: number, y: number): [number, number, number] => { const p = f24.point(s, n); return [p[0], y, p[1]]; };
  const stairRoute24 = [at24(70, -14.3, low24), ...flight24a, at24(61.4, -14.3, middle24), at24(61.4, -11.7, middle24), ...flight24b, at24(69.6, -11.7, high24), at24(81.8, -11.37, high24)];
  routes.bridgeFrom27 = [...neighbor24.routes.bridgeFrom27, at24(74, -14.3, low24), ...stairRoute24, ...bridgeRoute.slice().reverse(), [inside251[0], bridgeStart, inside251[1]]];
  const connection24 = { point: bridge24, floor: bridgeEnd, width: 3.3, stairHole: [[60.8, -15.2], [69.2, -15.2], [69.2, -10.8], [60.8, -10.8]].map(p => f24.point(p[0], p[1])) };
  routes.underBridge = [at(62, 6, heightAt(...f.point(62, 6))), at(53, 6, heightAt(...f.point(53, 6)))];
  const points = surfaces.filter(a => !a.elevated).flatMap(a => [a.frame.point(a.s0, a.n0), a.frame.point(a.s1, a.n0), a.frame.point(a.s1, a.n1), a.frame.point(a.s0, a.n1)]).concat(main, round);
  const bounds = { minX: Math.min(...points.map(p => p[0])) - 2, maxX: Math.max(...points.map(p => p[0])) + 2, minZ: Math.min(...points.map(p => p[1])) - 2, maxZ: Math.max(...points.map(p => p[1])) + 2 };
  return { f, floor, floors, garageFloor, main, round, roundArc, roundRoof, surfaces, routes, bounds, mappedDoor, doorLocal, northDoor, bridgeEdges, bridgeStart, bridgeEnd, connection24, neighbor24 };
}
export type Science251Layout = ReturnType<typeof getScience251Layout>;

export function* cutScience251TerrainSteps(positions: number[], indices: number[], q: Science251Layout) {
  const areas = q.surfaces.filter(a => !a.elevated), rings = [q.main, q.round];
  const inside = (x: number, z: number, ring: XZ[]) => { let hit = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit; } return hit; };
  const segments = areas.flatMap(a => { const e = a.frame, p = [e.point(a.s0, a.n0), e.point(a.s1, a.n0), e.point(a.s1, a.n1), e.point(a.s0, a.n1)]; return p.map((b, i) => [b, p[(i + 1) % 4]]); });
  for (const ring of rings) for (let i = 1; i < ring.length; i++) segments.push([ring[i - 1], ring[i]]);
  const weight = (s: number, n: number, a: Physics561Surface) => Math.max(0, 1 - Math.hypot(Math.max(0, a.s0 - s, s - a.s1), Math.max(0, a.n0 - n, n - a.n1)) / .15);
  const patch = (yield* cutTerrainPatchSteps(positions, indices, 0, { bounds: q.bounds, local: (x, z) => q.f.local([x, z]), lines: { s: [], n: [] }, boundarySegments: segments, apply: (x, z, y) => {
    let result = y;
    for (const a of areas) { const p = a.frame.local([x, z]); result = Math.min(result, y + (physics561SurfaceHeight(a, p.s, p.n) - .25 - y) * weight(p.s, p.n, a)); }
    if (rings.some(r => inside(x, z, r))) result = Math.min(result, q.floor - .25); return result;
  } }));
  return { ...patch, affects: (x: number, z: number) => areas.some(a => { const p = a.frame.local([x, z]); return weight(p.s, p.n, a) > 0; }) || rings.some(r => inside(x, z, r)) };
}

export function cutScience251Terrain(...args:Parameters<typeof cutScience251TerrainSteps>){
  const steps=cutScience251TerrainSteps(...args);let result=steps.next();
  while(!result.done)result=steps.next();
  return result.value;
}
