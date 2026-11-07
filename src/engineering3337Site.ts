import { humanities23Frame } from './humanities23Site';
import { cutTerrainPatch } from './terrainPatch';
import { physics561SurfaceHeight } from './physics561Site';
import type { Engineering30Surface } from './engineering30Site';
import type { Engineering33Layout } from './engineering33Site';

type XZ = [number, number];
type Frame = ReturnType<typeof humanities23Frame>;
export const ENGINEERING37_ID = 'way/262983332';
export const ENGINEERING3337_ID = 'connection/engineering33-37';

export function getEngineering3337Layout(heightAt: (x: number, z: number) => number, main: Engineering33Layout, footprint37: XZ[]) {
  const northFace = humanities23Frame(main.main[2], main.main[1]);
  const southFace = humanities23Frame(footprint37[0], footprint37[2]);
  // 항공사진의 좁은 지붕 띠를 양쪽 외벽에 대응한 근사 배치다.
  const bridge = humanities23Frame(northFace.point(15.2, 0), southFace.point(9.2, 0));
  const passage = humanities23Frame(bridge.point(bridge.length * .55, -16), bridge.point(bridge.length * .55, 30));
  const upper = main.floor + .55, lower = heightAt(...passage.point(1.2, 2.2)) + .035, eastLow = upper - .56;
  const bridgeFloor = upper + 3.1, middle = bridgeFloor + 3.25, canopyBase = main.roof - .1, canopyTop = canopyBase + .75;
  const surfaces: Engineering30Surface[] = [], routes: Record<string, [number, number, number][]> = {};
  const at = (f: Frame, s: number, n: number, y: number): [number, number, number] => { const p = f.point(s, n); return [p[0], y, p[1]]; };
  const add = (name: string, s0: number, s1: number, n0: number, n1: number, y0: number, y1 = y0) => {
    const a: Engineering30Surface = { name, frame: passage, s0, s1, n0, n1, y0, y1, axis: 's' }; surfaces.push(a); return a;
  };
  const westStart = -2.6, westLow = heightAt(...passage.point(westStart, 2.2)) + .035;
  add('west-parking-approach', westStart, 1.2, -.1, 4.4, westLow, lower);
  add('lower-cover-apron', westStart, 9.2, -4.1, -.15, lower);
  const stairCount = Math.max(4, Math.ceil((upper - lower) / .16)), split = Math.ceil(stairCount / 2), wideSteps: [number, number, number][] = [];
  for (let i = 0; i < stairCount; i++) {
    const s0 = i < split ? 1.2 + 3.3 * i / split : 5.8 + 3.4 * (i - split) / (stairCount - split);
    const s1 = i < split ? 1.2 + 3.3 * (i + 1) / split : 5.8 + 3.4 * (i + 1 - split) / (stairCount - split);
    const y = lower + (upper - lower) * (i + 1) / stairCount;
    add('west-wide-stair', s0, s1, 0, 4.4, y); wideSteps.push(at(passage, (s0 + s1) / 2, 2.2, y));
    if (i === split - 1) { add('west-stair-middle-landing', 4.5, 5.8, 0, 4.4, y); wideSteps.push(at(passage, 5.15, 2.2, y)); }
  }
  for (let s = 9.2; s < 18.8 - .001; s += 2.4) add('upper-gray-landing', s, Math.min(s + 2.4, 18.8), -4.1, 4.4, upper);
  const shortSteps: [number, number, number][] = [];
  for (let i = 0; i < 4; i++) {
    const s0 = 18.8 + .45 * i, s1 = s0 + .45, y = upper - .14 * i;
    add('east-short-stair', s0, s1, -2.8, 1.4, y); shortSteps.push(at(passage, (s0 + s1) / 2, -.7, y));
  }
  add('east-stair-bottom', 20.6, 24.4, -2.8, 1.4, eastLow);
  add('east-access-ramp', 18.8, 24.4, 1.65, 3.65, upper, eastLow);
  const eastEnd = 45, eastRoad = heightAt(...passage.point(eastEnd, .4)) + .035;
  for (let i = 0; i < 5; i++) add('east-red-approach', 24.4 + (eastEnd - 24.4) * i / 5, 24.4 + (eastEnd - 24.4) * (i + 1) / 5, -2.8, 3.65, eastLow + (eastRoad - eastLow) * i / 5, eastLow + (eastRoad - eastLow) * (i + 1) / 5);
  routes.westWideStair = [at(passage, westStart + .1, 2.2, westLow + (lower - westLow) * .1 / (1.2 - westStart)), at(passage, 1.1, 2.2, lower - (lower - westLow) * .1 / (1.2 - westStart)), ...wideSteps, at(passage, 11, 2.2, upper)];
  routes.underBridge = [at(passage, 10, 0, upper), at(passage, 16, 0, upper), at(passage, 18, 0, upper)];
  routes.eastShortStair = [at(passage, 17.8, -.7, upper), ...shortSteps, at(passage, 22, -.7, eastLow), at(passage, 24.4, -.7, eastLow)];
  routes.eastRamp = [at(passage, 17.8, 2.65, upper), at(passage, 18.8, 2.65, upper), at(passage, 24.4, 2.65, eastLow), at(passage, eastEnd - .1, 2.65, eastRoad - (eastRoad - eastLow) * .1 / (eastEnd - 24.4))];
  routes.westToEast = [...routes.westWideStair, at(passage, 17.8, 2.65, upper), ...routes.eastRamp.slice(1)];
  routes.coverApron = [at(passage, -2.3, -2, lower), at(passage, 2, -2, lower), at(passage, 6, -2, lower)];
  const oldPilotiEnd = main.routes.pilotiNorthSouth.at(-1)!;
  const connector = humanities23Frame([oldPilotiEnd[0], oldPilotiEnd[2]], passage.point(westStart + .1, 2.2));
  const midpoint = connector.point(connector.length / 2, 0);
  routes.pilotiToStair = [oldPilotiEnd, [midpoint[0], heightAt(...midpoint) + .03, midpoint[1]], routes.westWideStair[0]];
  const polygons = surfaces.map(a => [a.frame.point(a.s0, a.n0), a.frame.point(a.s1, a.n0), a.frame.point(a.s1, a.n1), a.frame.point(a.s0, a.n1)]);
  const points = polygons.flat(), bounds = { minX: Math.min(...points.map(p => p[0])) - .5, maxX: Math.max(...points.map(p => p[0])) + .5, minZ: Math.min(...points.map(p => p[1])) - .5, maxZ: Math.max(...points.map(p => p[1])) + .5 };
  return { bridge, passage, lower, upper, eastLow, bridgeFloor, middle, canopyBase, canopyTop, stairCount, surfaces, polygons, routes, bounds };
}
export type Engineering3337Layout = ReturnType<typeof getEngineering3337Layout>;

export function cutEngineering3337Terrain(positions: number[], indices: number[], q: Engineering3337Layout) {
  const sample = (x: number, z: number, lowest = false) => {
    let h: number | undefined;
    for (const a of q.surfaces) { const p = a.frame.local([x, z]); if (p.s >= a.s0 - .001 && p.s <= a.s1 + .001 && p.n >= a.n0 - .001 && p.n <= a.n1 + .001) { const y = physics561SurfaceHeight(a, p.s, p.n); h = lowest && h !== undefined ? Math.min(h, y) : y; } }
    return h;
  };
  const surfaceAt = (x: number, z: number) => sample(x, z);
  // 같은 축의 모든 포장 경계에서 자른다. 높은 참과 낮은 덮개 앞 바닥이 만나는
  // 공유 정점은 낮은 면 아래에 두어 옹벽 앞에 지형이 솟지 않게 한다.
  const lines = { s: [...new Set(q.surfaces.flatMap(a => [a.s0, a.s1]))], n: [...new Set(q.surfaces.flatMap(a => [a.n0, a.n1]))] };
  const patch = cutTerrainPatch(positions, indices, 0, { bounds: q.bounds, local: (x, z) => q.passage.local([x, z]), lines, boundarySegments: [], apply: (x, z, y) => { const h = sample(x, z, true); return h === undefined ? y : h - .24; } });
  return { ...patch, surfaceAt, affects: (x: number, z: number) => surfaceAt(x, z) !== undefined };
}
