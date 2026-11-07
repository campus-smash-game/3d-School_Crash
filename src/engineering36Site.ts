import { humanities23Frame } from './humanities23Site';
import { cutTerrainPatch } from './terrainPatch';
import { physics561SurfaceHeight } from './physics561Site';
import type { Engineering30Surface } from './engineering30Site';
import type { Engineering37Layout } from './engineering37Site';

export const ENGINEERING36_ID = 'way/347806719';
type XZ = [number, number];
export function getEngineering36Layout(heightAt: (x: number, z: number) => number, footprint: XZ[], neighbor: Engineering37Layout) {
  const axis = humanities23Frame(footprint[0], footprint[5]), length = axis.length, depth = -axis.local(footprint[3]).n;
  // 노출 창줄과 이웃 연결교를 맞춘 게임 높이다. 공식 층 명칭과 실측 표고가 아니다.
  const floors = [neighbor.deck, neighbor.floors[3], neighbor.floors[4], neighbor.roof], roof = floors[3] + 3.5;
  const entryFloor = floors[2], surfaces: Engineering30Surface[] = [], steps: Engineering30Surface[] = [];
  const at = (s: number, n: number, y: number): [number, number, number] => { const p = axis.point(s, n); return [p[0], y, p[1]]; };
  const add = (name: string, s0: number, s1: number, n0: number, n1: number, y0: number, y1 = y0, direction: 's' | 'n' = 's') => { const a: Engineering30Surface = { name, frame: axis, s0, s1, n0, n1, y0, y1, axis: direction }; surfaces.push(a); return a; };
  const northFloor = neighbor.deck + 1.2;
  for (let s = 0; s < 40; s += 5) add('north-wall-apron', s, s + 5, 0, 3, northFloor);
  for (let n = -26; n < 0; n += 4) {
    const end = Math.min(n + 4, 0);
    add('east-entry-pavers', length, length + 4.5, n, end, entryFloor);
    const outer = heightAt(...axis.point(length + 10, (n + end) / 2)) + .035;
    add('east-road-approach', length + 4.5, length + 10, n, end, entryFloor, outer);
  }
  // 문 안쪽은 문턱과 얕은 현관만 만든다. 강의실과 복도는 재현하지 않는다.
  add('east-door-threshold', length - 1.2, length, -11, -8, entryFloor);
  const southRoad = heightAt(...axis.point(length + 2.4, -31)) + .035;
  add('southeast-road-join', length, length + 4.5, -31, -26, southRoad, entryFloor, 'n');
  const flights = [
    { n0: -24, n1: -19, y0: entryFloor, y1: entryFloor + 1.75 },
    { n0: -17, n1: -11, y0: entryFloor + 1.75, y1: floors[3] },
    { n0: -8, n1: -.5, y0: floors[3], y1: roof },
  ];
  const elevated: Engineering30Surface[] = [];
  const upper = (name: string, n0: number, n1: number, y: number) => { const a: Engineering30Surface = { name, frame: axis, s0: length + 1.1, s1: length + 3.2, n0, n1, y0: y, y1: y, axis: 'n' }; elevated.push(a); return a; };
  for (const flight of flights) {
    const count = Math.round((flight.y1 - flight.y0) / .175);
    for (let i = 0; i < count; i++) steps.push(upper('east-steel-stair-tread', flight.n0 + (flight.n1 - flight.n0) * i / count, flight.n0 + (flight.n1 - flight.n0) * (i + 1) / count, flight.y0 + (flight.y1 - flight.y0) * (i + 1) / count));
  }
  upper('east-stair-middle-landing', -19, -17, entryFloor + 1.75);
  upper('east-upper-door-landing', -11, -8, floors[3]);
  upper('east-roof-landing', -.5, 1.4, roof);
  elevated.push({ name: 'east-upper-door-threshold', frame: axis, s0: length - 1.2, s1: length + 1.1, n0: -11, n1: -8, y0: floors[3], y1: floors[3], axis: 'n' });
  const routeSteps = (flight: typeof flights[number]) => steps.filter(a => a.n0 >= flight.n0 - .001 && a.n1 <= flight.n1 + .001).map(a => at(length + 2.15, (a.n0 + a.n1) / 2, a.y0));
  const firstApproach = surfaces.find(a => a.name === 'east-road-approach' && a.n0 <= -9.5 && a.n1 >= -9.5)!;
  const routes: Record<string, [number, number, number][]> = {
    northWallWalk: [at(1, 1.8, northFloor), at(39, 1.8, northFloor)],
    plazaToNorthWall: [neighbor.routes.eastFootway[0], at(20, 4.5, northFloor), at(20, 1.8, northFloor)],
    eastEntrance: [at(length + 9.8, -9.5, physics561SurfaceHeight(firstApproach, length + 9.8, -9.5)), at(length + 4.5, -9.5, entryFloor), at(length + .2, -9.5, entryFloor), at(length - .8, -9.5, entryFloor)],
    eastGroundWalk: [at(length + 4, -25.5, entryFloor), at(length + 4, -.3, entryFloor)],
    southeastApproach: [at(length + 2.15, -30.8, southRoad + (entryFloor - southRoad) * .2 / 5), at(length + 2.15, -26, entryFloor), at(length + 2.15, -24.5, entryFloor)],
    eastStairToUpperDoor: [at(length + 2.15, -24.5, entryFloor), ...routeSteps(flights[0]), at(length + 2.15, -18, entryFloor + 1.75), ...routeSteps(flights[1]), at(length + 2.15, -9.5, floors[3]), at(length - .8, -9.5, floors[3])],
    eastStairToRoof: [at(length + 2.15, -9, floors[3]), ...routeSteps(flights[2]), at(length + 2.15, .6, roof)],
  };
  const bridge = { s0: axis.local([224.32, -1212.85]).s, s1: 0, n: axis.local(footprint[1]).n, halfWidth: 2.4, floors: [floors[2], floors[3]], roof };
  const points = [...surfaces, ...elevated].flatMap(a => [axis.point(a.s0, a.n0), axis.point(a.s1, a.n1)]);
  const bounds = { minX: Math.min(...points.map(p => p[0])) - .5, maxX: Math.max(...points.map(p => p[0])) + .5, minZ: Math.min(...points.map(p => p[1])) - .5, maxZ: Math.max(...points.map(p => p[1])) + .5 };
  return { axis, length, depth, floors, roof, entryFloor, surfaces, elevated, flights, routes, bridge, bounds };
}
export type Engineering36Layout = ReturnType<typeof getEngineering36Layout>;
export function cutEngineering36Terrain(positions: number[], indices: number[], q: Engineering36Layout) {
  const sample = (x: number, z: number, lowest = false) => {
    const p = q.axis.local([x, z]); let h: number | undefined;
    for (const a of q.surfaces) if (p.s >= a.s0 - .001 && p.s <= a.s1 + .001 && p.n >= a.n0 - .001 && p.n <= a.n1 + .001) { const y = physics561SurfaceHeight(a, p.s, p.n); h = lowest && h !== undefined ? Math.min(h, y) : y; }
    return h;
  };
  const lines = { s: [...new Set(q.surfaces.flatMap(a => [a.s0, a.s1]))], n: [...new Set(q.surfaces.flatMap(a => [a.n0, a.n1]))] };
  const patch = cutTerrainPatch(positions, indices, 0, { bounds: q.bounds, local: (x, z) => q.axis.local([x, z]), lines, boundarySegments: [], apply: (x, z, y) => { const h = sample(x, z, true); return h !== undefined ? h - .24 : y; } });
  return { ...patch, surfaceAt: (x: number, z: number) => sample(x, z), affects: (x: number, z: number) => sample(x, z) !== undefined };
}
