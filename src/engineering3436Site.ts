import {cutTerrainPatchSteps} from './terrainPatch';
import { physics561SurfaceHeight } from './physics561Site';
import type { Engineering30Surface } from './engineering30Site';
import type { Engineering36Layout } from './engineering36Site';

export const ENGINEERING34_ID = 'way/347806720';
export const ENGINEERING3436_ID = 'connection/engineering34-36';
type XZ = [number, number];
export function getEngineering3436Layout(heightAt: (x: number, z: number) => number, south: Engineering36Layout, footprint: XZ[]) {
  const axis = south.axis, local = footprint.map(p => axis.local(p));
  const west = local[6].s, east = local[4].s, southEdge = local[5].n, mainStart = local[3].n, north = (local[0].n + local[2].n) / 2;
  const walkFloor = south.entryFloor, courtFloor = walkFloor + .6, bridgeFloor = south.floors[3], roof = south.roof;
  const bridgeCenter = (axis.local([274.23, -1193.72]).s + local[5].s) / 2, bridgeWest = bridgeCenter - 1.5, bridgeEast = bridgeCenter + 1.5;
  const surfaces: Engineering30Surface[] = [], elevated: Engineering30Surface[] = [], routes: Record<string, [number, number, number][]> = {};
  const at = (s: number, n: number, y: number): [number, number, number] => { const p = axis.point(s, n); return [p[0], y, p[1]]; };
  const add = (list: Engineering30Surface[], name: string, s0: number, s1: number, n0: number, n1: number, y0: number, y1 = y0, direction: 's' | 'n' = 's') => { const a: Engineering30Surface = { name, frame: axis, s0, s1, n0, n1, y0, y1, axis: direction }; list.push(a); return a; };
  const roadInner = south.length + 4.5, roadOuter = south.length + 10;
  add(surfaces, 'east-corner-apron', south.length, roadInner, 0, 5.6, walkFloor);
  const oldEdge = south.surfaces.find(a => a.name === 'east-road-approach' && a.n1 === 0)!;
  add(surfaces, 'east-corner-road-join', roadInner, roadOuter, 0, 5.6, walkFloor, oldEdge.y1);
  for (const [n0, n1] of [[5.6, 9.2], [9.2, 16], [16, mainStart]]) {
    const far = heightAt(...axis.point(roadOuter, (n0 + n1) / 2)) + .035;
    add(surfaces, 'east-court-road-join', roadInner, roadOuter, n0, n1, walkFloor, far);
  }
  for (let s = bridgeEast; s < roadInner - 2; s += 4) for (const [n0, n1] of [[9.2, 14], [14, mainStart]]) add(surfaces, 'raised-gray-court', s, Math.min(s + 4, roadInner - 2), n0, n1, courtFloor);
  const short: [number, number, number][] = [];
  for (let i = 0; i < 4; i++) {
    const a = add(surfaces, 'east-wide-court-step', roadInner - .5 * (i + 1), roadInner - .5 * i, 9.2, mainStart, walkFloor + .15 * (i + 1));
    short.push(at((a.s0 + a.s1) / 2, 12, a.y0));
  }
  add(elevated, 'narrow-raised-walk', 51.5, roadInner, 5.6, 8.4, walkFloor);
  const long: [number, number, number][] = [];
  for (let i = 0; i < 20; i++) {
    const a = add(elevated, 'long-bridge-stair', 51.5 - (51.5 - bridgeEast) * (i + 1) / 20, 51.5 - (51.5 - bridgeEast) * i / 20, 5.8, 8.2, walkFloor + (bridgeFloor - walkFloor) * (i + 1) / 20);
    long.push(at((a.s0 + a.s1) / 2, 7, a.y0));
  }
  const linkFloors = south.floors.slice(1), plazaFloor = south.floors[0] + 1.2;
  for (const floor of linkFloors) {
    add(elevated, 'link-floor', bridgeWest, bridgeEast, 0, southEdge, floor);
    add(elevated, '36-link-door-threshold', bridgeCenter - 1, bridgeCenter + 1, -1.2, 0, floor);
    add(elevated, '34-link-door-threshold', bridgeCenter - 1, bridgeCenter + 1, southEdge, southEdge + 1.2, floor);
  }
  // 서쪽 사진의 사선 계단을 반영하되 맨 아래 광장 접속과 폭은 게임 근사다.
  const westFlights = [
    { s0: 33.5, s1: 35.5, n0: 3, n1: 12, y0: plazaFloor, y1: linkFloors[0], reverse: false },
  ];
  const westSteps: [number, number, number][][] = [];
  for (const flight of westFlights) {
    const points: [number, number, number][] = [], count = Math.ceil((flight.y1 - flight.y0) / .175);
    for (let i = 0; i < count; i++) {
      const start = flight.reverse ? flight.n1 - (flight.n1 - flight.n0) * (i + 1) / count : flight.n0 + (flight.n1 - flight.n0) * i / count;
      const end = start + (flight.n1 - flight.n0) / count, y = flight.y0 + (flight.y1 - flight.y0) * (i + 1) / count;
      add(elevated, 'west-link-stair', flight.s0, flight.s1, start, end, y); points.push(at((flight.s0 + flight.s1) / 2, (start + end) / 2, y));
    }
    westSteps.push(points);
  }
  add(elevated, 'west-north-landing', 33.5, bridgeWest, 12, southEdge, linkFloors[0]);
  const rearDoor = { s0: east - 4.3, s1: east - 1.3, n: mainStart };
  add(surfaces, '34-piloti-door-threshold', rearDoor.s0, rearDoor.s1, mainStart, mainStart + 1.2, courtFloor);
  routes.eastCorner = [at(south.length + 4, -.3, walkFloor), at(south.length + 4, 3, walkFloor), at(64.52, 7, walkFloor)];
  routes.narrowWalk = [at(64.52, 7, walkFloor), at(51.7, 7, walkFloor)];
  routes.longStair = [at(55, 7, walkFloor), at(51.6, 7, walkFloor), ...long, at(bridgeCenter, 7, bridgeFloor)];
  routes.upperLink = [at(bridgeCenter, -1, bridgeFloor), at(bridgeCenter, 2, bridgeFloor), at(bridgeCenter, southEdge - 1, bridgeFloor), at(bridgeCenter, southEdge + .9, bridgeFloor)];
  routes.wideCourtStair = [at(64.52, 12, walkFloor), ...short, at(61.5, 12, courtFloor), at(44, 12, courtFloor)];
  routes.pilotiEntrance = [at(61.5, 12, courtFloor), at(east - 2.8, 12, courtFloor), at(east - 2.8, mainStart + .8, courtFloor)];
  const road = surfaces.find(a => a.name === 'east-court-road-join' && a.n0 === 5.6)!;
  routes.roadToLongStair = [at(roadOuter - .2, 7, physics561SurfaceHeight(road, roadOuter - .2, 7)), at(roadInner, 7, walkFloor), ...routes.longStair];
  routes.plazaToLowerLink = [at(34.5, 1.8, plazaFloor), at(34.5, 2.8, plazaFloor), ...westSteps[0], at(34.5, 13, linkFloors[0]), at(bridgeCenter, 13, linkFloors[0]), at(bridgeCenter, 2, linkFloors[0])];
  routes.lowerLink = [at(bridgeCenter, -1, linkFloors[0]), at(bridgeCenter, southEdge + .9, linkFloors[0])];
  routes.middleLink = [at(bridgeCenter, -1, linkFloors[1]), at(bridgeCenter, southEdge + .9, linkFloors[1])];
  routes.lowerPlazaBypass = [at(26, 5.5, plazaFloor), at(30, 5.5, plazaFloor), at(30, 1.8, plazaFloor), at(39.4, 1.8, plazaFloor), at(39.4, 5.6, plazaFloor)];
  const points = [...surfaces, ...elevated].flatMap(a => [axis.point(a.s0, a.n0), axis.point(a.s1, a.n1)]);
  const bounds = { minX: Math.min(...points.map(p => p[0])) - .5, maxX: Math.max(...points.map(p => p[0])) + .5, minZ: Math.min(...points.map(p => p[1])) - .5, maxZ: Math.max(...points.map(p => p[1])) + .5 };
  return { axis, footprint, local, west, east, southEdge, mainStart, north, walkFloor, courtFloor, bridgeFloor, roof, bridgeCenter, bridgeWest, bridgeEast, rearDoor, surfaces, elevated, routes, bounds, westFlights, linkFloors, plazaFloor, floors: [south.floors[0] - 3.1, ...south.floors], openings36: linkFloors.map(floor => ({ s0: bridgeCenter - 1, s1: bridgeCenter + 1, bottom: floor, top: floor + 2.9 })) };
}
export type Engineering3436Layout = ReturnType<typeof getEngineering3436Layout>;
export function* cutEngineering3436TerrainSteps(positions: number[], indices: number[], q: Engineering3436Layout) {
  const sample = (x: number, z: number, lowest = false) => {
    const p = q.axis.local([x, z]); let h: number | undefined;
    for (const a of q.surfaces) if (p.s >= a.s0 - .001 && p.s <= a.s1 + .001 && p.n >= a.n0 - .001 && p.n <= a.n1 + .001) { const y = physics561SurfaceHeight(a, p.s, p.n); h = lowest && h !== undefined ? Math.min(h, y) : y; }
    return h;
  };
  const lines = { s: [...new Set(q.surfaces.flatMap(a => [a.s0, a.s1]))], n: [...new Set(q.surfaces.flatMap(a => [a.n0, a.n1]))] };
  const patch = (yield* cutTerrainPatchSteps(positions, indices, 0, { bounds: q.bounds, local: (x, z) => q.axis.local([x, z]), lines, boundarySegments: [], apply: (x, z, y) => { const h = sample(x, z, true); return h !== undefined ? h - .24 : y; } }));
  return { ...patch, surfaceAt: (x: number, z: number) => sample(x, z), affects: (x: number, z: number) => sample(x, z) !== undefined };
}

export function cutEngineering3436Terrain(...args:Parameters<typeof cutEngineering3436TerrainSteps>){
  const steps=cutEngineering3436TerrainSteps(...args);let result=steps.next();
  while(!result.done)result=steps.next();
  return result.value;
}
