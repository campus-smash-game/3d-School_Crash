import {cutTerrainPatchSteps} from './terrainPatch';
import { humanities23Frame } from './humanities23Site';
import { physics561SurfaceHeight, type Physics561Surface } from './physics561Site';

export const SCIENCE23_ID = 'way/161957771';
export const SCIENCE23_DOORS = [
  { name: 'west', node: '4562088379', point: [210.79, -856.17] as [number, number], level: 0 },
  { name: 'south', node: '4562088380', point: [238.23, -880.63] as [number, number], level: 1 },
  { name: 'east', node: '4562088381', point: [256.61, -883.38] as [number, number], level: 0 },
];

export function getScience23Layout(heightAt: (x: number, z: number) => number) {
  const f = humanities23Frame([206.29, -866.06], [254.48, -888.04]);
  // 사진의 높이 관계를 지형에 맞춘 근사다. 실제 층고와 출입구의 공식 층수는 미확인이다.
  const floor = heightAt(...f.point(30, 10)) + .12;
  const floors = [floor, floor + 3.5, floor + 7.05, floor + 10.6], roof = floor + 14.15;
  const court = floor - .75, depth = 21.74, width = f.length;
  const surfaces: Physics561Surface[] = [], routes: Record<string, [number, number, number][]> = {};
  const at = (s: number, n: number, y: number): [number, number, number] => { const p = f.point(s, n); return [p[0], y, p[1]]; };
  const add = (name: string, s0: number, s1: number, n0: number, n1: number, y0: number, y1 = y0, axis: 's' | 'n' = 's') => surfaces.push({ name, s0, s1, n0, n1, y0, y1, axis });
  const flight = (name: string, s0: number, s1: number, n0: number, n1: number, low: number, high: number) => {
    const count = Math.ceil(Math.abs(high - low) / .17), route = [at((s0 + s1) / 2, n0 + .04, low)];
    for (let i = 0; i < count; i++) {
      const a = n0 + (n1 - n0) * i / count, b = n0 + (n1 - n0) * (i + 1) / count, y = low + (high - low) * (i + 1) / count;
      add(name, s0, s1, a, b, y); route.push(at((s0 + s1) / 2, (a + b) / 2, y));
    }
    return route;
  };
  const doors = SCIENCE23_DOORS.map(d => ({ ...d, ...f.local(d.point), floor: floors[d.level], width: 2.8 }));
  const south = doors.find(d => d.name === 'south')!, west = doors.find(d => d.name === 'west')!, east = doors.find(d => d.name === 'east')!;
  add('south-court-paving', -1, south.s + 4.2, -10, -2.4, court);
  add('south-wall-apron', 7.2, south.s - 4.2, -2.4, 0, court);
  add('south-entry-landing', south.s - 4, south.s + 4, -1.3, .4, floors[1]);
  const lower = flight('south-lower-stair', south.s - 4, south.s + 4, -8.8, -5.6, court, court + (floors[1] - court) / 2);
  add('south-stair-middle-landing', south.s - 4, south.s + 4, -5.6, -4.5, court + (floors[1] - court) / 2);
  const upper = flight('south-upper-stair', south.s - 4, south.s + 4, -4.5, -1.3, court + (floors[1] - court) / 2, floors[1]);
  routes.southEntry = [at(south.s, -9.6, court), ...lower, at(south.s, -4.55, court + (floors[1] - court) / 2), ...upper, at(south.s, 2.2, floors[1])];
  const passage = flight('passage-front-stair', .3, 6.8, -2.4, 0, court, floor);
  add('passage-north-landing', .3, 6.8, depth, depth + 2, floor);
  const north = heightAt(...f.point(3.55, depth + 7)) + .04;
  add('passage-north-ramp', .3, 6.8, depth + 2, depth + 7, floor, north, 'n');
  routes.passage = [at(3.55, -5, court), ...passage, at(3.55, depth + 1.5, floor), at(3.55, depth + 6.9, north + (floor - north) * .02)];
  const westGround = heightAt(...f.point(-8, west.n)) + .04;
  add('west-entry-ramp', -8, .3, west.n - 1.4, west.n + 1.4, westGround, floor);
  routes.westEntry = [at(-7.8, west.n, westGround + (floor - westGround) * .2 / 8.3), at(3.55, west.n, floor), at(8.7, west.n, floor)];
  const eastGround = heightAt(...f.point(width + 7, east.n)) + .04;
  add('east-entry-landing', width - .3, width + 2, east.n - 1.4, east.n + 1.4, floor);
  add('east-entry-ramp', width + 2, width + 7, east.n - 1.4, east.n + 1.4, floor, eastGround);
  routes.eastEntry = [at(width + 6.8, east.n, eastGround + (floor - eastGround) * .04), at(width - 2, east.n, floor)];
  const approach = heightAt(...f.point(-8, -5)) + .04;
  add('court-west-approach', -8, -1, -6.4, -3.6, approach, court);
  routes.courtApproach = [at(-7.8, -5, approach + (court - approach) * .2 / 7), at(3.55, -5, court), at(25, -5, court), at(25, -9.6, court), at(south.s, -9.6, court)];
  const points = surfaces.flatMap(a => [f.point(a.s0, a.n0), f.point(a.s1, a.n0), f.point(a.s1, a.n1), f.point(a.s0, a.n1)]).concat([f.point(0, depth), f.point(width, depth)]);
  const bounds = { minX: Math.min(...points.map(p => p[0])) - 2, maxX: Math.max(...points.map(p => p[0])) + 2, minZ: Math.min(...points.map(p => p[1])) - 2, maxZ: Math.max(...points.map(p => p[1])) + 2 };
  return { f, floor, floors, roof, court, depth, width, surfaces, routes, doors, bounds };
}
export type Science23Layout = ReturnType<typeof getScience23Layout>;

export function* cutScience23TerrainSteps(positions: number[], indices: number[], q: Science23Layout) {
  const floor: Physics561Surface = { name: 'building-ground', s0: 0, s1: q.width, n0: 0, n1: q.depth, y0: q.floor, y1: q.floor, axis: 's' };
  const areas = [...q.surfaces, floor];
  const weight = (s: number, n: number, a: Physics561Surface) => Math.max(0, 1 - Math.hypot(Math.max(0, a.s0 - s, s - a.s1), Math.max(0, a.n0 - n, n - a.n1)) / .25);
  const segments = areas.flatMap(a => { const p = [q.f.point(a.s0, a.n0), q.f.point(a.s1, a.n0), q.f.point(a.s1, a.n1), q.f.point(a.s0, a.n1)]; return p.map((b, i) => [b, p[(i + 1) % 4]]); });
  const patch = (yield* cutTerrainPatchSteps(positions, indices, 0, { bounds: q.bounds, local: (x, z) => q.f.local([x, z]), lines: { s: [], n: [] }, boundarySegments: segments, apply: (x, z, y) => {
    const p = q.f.local([x, z]); let result = y;
    for (const a of areas) result = Math.min(result, y + (physics561SurfaceHeight(a, p.s, p.n) - .25 - y) * weight(p.s, p.n, a));
    return result;
  } }));
  return { ...patch, affects: (x: number, z: number) => { const p = q.f.local([x, z]); return areas.some(a => weight(p.s, p.n, a) > 0); } };
}

export function cutScience23Terrain(...args:Parameters<typeof cutScience23TerrainSteps>){
  const steps=cutScience23TerrainSteps(...args);let result=steps.next();
  while(!result.done)result=steps.next();
  return result.value;
}
