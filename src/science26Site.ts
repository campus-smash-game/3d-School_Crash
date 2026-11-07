import { humanities23Frame } from './humanities23Site';
import { cutTerrainPatch } from './terrainPatch';
import { physics561SurfaceHeight, type Physics561Surface } from './physics561Site';

export const SCIENCE26_ID = 'way/179742151';

export function getScience26Layout(heightAt: (x: number, z: number) => number) {
  const f = humanities23Frame([164.11, -813.1], [131.88, -894.17]);
  // 재건축 후 항공사진의 장축과 주변 건물을 대조한 근사다. 원본 OSM 윤곽은 수정하지 않는다.
  const footprintLocal = [[4, 20], [46, 20], [46, 25], [50, 25], [50, 18], [65, 18], [65, 40], [4, 40]];
  const footprint = footprintLocal.map(([s, n]) => f.point(s, n));
  const floor = heightAt(...f.point(32, 35)) + .15, basement = floor - 3.3;
  const floors = [floor, floor + 4.2, floor + 7.8, floor + 11.4, floor + 15], roof = floor + 18.6;
  const surfaces: Physics561Surface[] = [], routes: Record<string, [number, number, number][]> = {};
  const at = (s: number, n: number, y: number): [number, number, number] => { const p = f.point(s, n); return [p[0], y, p[1]]; };
  const add = (name: string, s0: number, s1: number, n0: number, n1: number, y0: number, y1 = y0, axis: 's' | 'n' = 's') => surfaces.push({ name, s0, s1, n0, n1, y0, y1, axis });
  const north = heightAt(...f.point(1.5, 8)) + .04;
  add('west-north-ramp', 1.5, 8, 6, 10, north, floor);
  add('west-upper-paving', 8, 40, 6, 10, floor);
  add('basement-stair-top-landing', 27, 38, 10, 11, floor);
  const steps = Math.ceil((floor - basement) / .165), stairRoute = [at(32.5, 10.5, floor)];
  for (let i = 0; i < steps; i++) {
    const n0 = 11 + 6 * i / steps, n1 = 11 + 6 * (i + 1) / steps, y = floor - (floor - basement) * (i + 1) / steps;
    add('basement-stair', 27, 38, n0, n1, y);
    stairRoute.push(at(32.5, (n0 + n1) / 2, y));
  }
  add('sunken-court-paving', 27, 41, 17, 20, basement);
  add('basement-entry-landing', 31.1, 33.9, 19.7, 22.5, basement);
  routes.basementEntry = [...stairRoute, at(32.5, 18, basement), at(32.5, 21.8, basement)];
  routes.westApproach = [at(1.7, 8, north + (floor - north) * .2 / 6.5), at(9, 8, floor), at(32.5, 8, floor), at(32.5, 10.5, floor)];
  const westSouth = heightAt(...f.point(52, 8)) + .04;
  add('west-south-ramp', 40, 52, 6, 10, floor, westSouth);
  routes.westPassage = [at(1.7, 8, north + (floor - north) * .2 / 6.5), at(9, 8, floor), at(39, 8, floor), at(51.8, 8, westSouth + (floor - westSouth) * .2 / 12)];
  add('piloti-paving', 50, 65, 18, 40, floor);
  const south = heightAt(...f.point(69, 29)) + .04;
  add('piloti-south-ramp', 65, 69, 26.8, 31.2, floor, south);
  const west = heightAt(...f.point(57, 11)) + .04, east = heightAt(...f.point(57, 47)) + .04;
  add('piloti-west-ramp', 54.8, 59.2, 11, 18, west, floor, 'n');
  add('piloti-east-ramp', 54.8, 59.2, 40, 47, floor, east, 'n');
  routes.pilotiCrossing = [at(57, 11.2, west + (floor - west) * .2 / 7), at(57, 20, floor), at(57, 38, floor), at(57, 46.8, east + (floor - east) * .2 / 7)];
  routes.pilotiSouth = [at(68.8, 29, south + (floor - south) * .2 / 4), at(63, 29, floor), at(57, 29, floor)];
  // 현재 출입문 좌표는 확보하지 못했다. 사진으로 확인한 지하 현관만 짧게 열고 내부는 생략한다.
  const points = surfaces.flatMap(a => [f.point(a.s0, a.n0), f.point(a.s1, a.n0), f.point(a.s1, a.n1), f.point(a.s0, a.n1)]).concat(footprint);
  const bounds = { minX: Math.min(...points.map(p => p[0])) - 2, maxX: Math.max(...points.map(p => p[0])) + 2, minZ: Math.min(...points.map(p => p[1])) - 2, maxZ: Math.max(...points.map(p => p[1])) + 2 };
  return { f, floor, floors, roof, basement, footprint, footprintLocal, surfaces, routes, bounds };
}
export type Science26Layout = ReturnType<typeof getScience26Layout>;

export function cutScience26Terrain(positions: number[], indices: number[], q: Science26Layout) {
  const areas: Physics561Surface[] = [...q.surfaces,
    { name: 'north-building-basement', s0: 4, s1: 46, n0: 20, n1: 40, y0: q.basement, y1: q.basement, axis: 's' },
    { name: 'recess-building-ground', s0: 46, s1: 50, n0: 25, n1: 40, y0: q.floor, y1: q.floor, axis: 's' },
  ];
  const weight = (s: number, n: number, a: Physics561Surface) => Math.max(0, 1 - Math.hypot(Math.max(0, a.s0 - s, s - a.s1), Math.max(0, a.n0 - n, n - a.n1)) / .25);
  const segments = areas.flatMap(a => { const p = [q.f.point(a.s0, a.n0), q.f.point(a.s1, a.n0), q.f.point(a.s1, a.n1), q.f.point(a.s0, a.n1)]; return p.map((b, i) => [b, p[(i + 1) % 4]]); });
  const patch = cutTerrainPatch(positions, indices, 0, { bounds: q.bounds, local: (x, z) => q.f.local([x, z]), lines: { s: [], n: [] }, boundarySegments: segments, apply: (x, z, y) => {
    const p = q.f.local([x, z]); let result = y;
    for (const a of areas) result = Math.min(result, y + (physics561SurfaceHeight(a, p.s, p.n) - .25 - y) * weight(p.s, p.n, a));
    return result;
  } });
  return { ...patch, affects: (x: number, z: number) => { const p = q.f.local([x, z]); return areas.some(a => weight(p.s, p.n, a) > 0); } };
}
