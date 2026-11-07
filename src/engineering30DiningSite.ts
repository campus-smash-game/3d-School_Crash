import { humanities23Frame } from './humanities23Site';
import { cutTerrainPatch } from './terrainPatch';
import { physics561SurfaceHeight, type Physics561Surface } from './physics561Site';

export const ENGINEERING30_DINING_ID = 'way/377154957';
type XZ = [number, number];
type Frame = ReturnType<typeof humanities23Frame>;
export type Dining30Surface = Physics561Surface & { frame: Frame };

export function getEngineering30DiningLayout(heightAt: (x: number, z: number) => number, footprint: XZ[]) {
  const outline = footprint.slice(0, -1), west = humanities23Frame(outline[0], outline[2]);
  const east = humanities23Frame(outline[7], outline[9]);
  const westDoor = west.local(outline[1]).s, eastDoor = east.local(outline[8]).s;
  const floor = heightAt(...outline[8]) + .45, roof = floor + 3.8, court = floor - .85;
  const surfaces: Dining30Surface[] = [], routes: Record<string, [number, number, number][]> = {};
  const at = (f: Frame, s: number, n: number, y: number): [number, number, number] => { const p = f.point(s, n); return [p[0], y, p[1]]; };
  const add = (name: string, frame: Frame, s0: number, s1: number, n0: number, n1: number, y0: number, y1 = y0, axis: 's' | 'n' = 's') => { const a = { name, frame, s0, s1, n0, n1, y0, y1, axis }; surfaces.push(a); return a; };
  add('east-entry-landing', east, eastDoor - 2.3, eastDoor + 2.3, -1, .4, floor);
  const steps: [number, number, number][] = [], count = 6;
  for (let i = 0; i < count; i++) {
    const n0 = -3.4 + 2.4 * i / count, n1 = -3.4 + 2.4 * (i + 1) / count, y = court + .85 * (i + 1) / count;
    add('east-entry-stair', east, eastDoor - 2.3, eastDoor + 2.3, n0, n1, y);
    steps.push(at(east, eastDoor, (n0 + n1) / 2, y));
  }
  const eastLow = heightAt(...east.point(eastDoor, -6.5)) + .035;
  add('east-paved-approach', east, eastDoor - 2.3, eastDoor + 2.3, -6.5, -3.4, eastLow, court, 'n');
  routes.eastEntry = [at(east, eastDoor, -6.4, eastLow + (court - eastLow) / 31), ...steps, at(east, eastDoor, 2, floor)];
  // 서쪽 연결 바닥과 양옆 난간은 사진에서 확인했다. 경사는 게임 지형에 맞춘다.
  const westLow = heightAt(...west.point(westDoor, -5.8)) + .035;
  add('west-entry-bridge', west, westDoor - 1.45, westDoor + 1.45, -5.8, -.6, westLow, floor, 'n');
  add('west-entry-landing', west, westDoor - 1.45, westDoor + 1.45, -.6, .6, floor);
  routes.westEntry = [at(west, westDoor, -5.7, westLow + (floor - westLow) * .1 / 5.2), at(west, westDoor, -.3, floor), at(west, westDoor, 2, floor)];
  routes.diningPassage = [at(west, westDoor, 2, floor), [207.5, floor, -1013.7], [214, floor, -1014.6], at(east, eastDoor, 2, floor)];
  // 북쪽 보도는 원래 지형을 따라 나누어 놓는다. 식재대와 보행 폭을 구분한다.
  for (let i = 9; i < outline.length; i++) {
    const f = humanities23Frame(outline[i], outline[(i + 1) % outline.length]), count = Math.ceil(f.length / 3);
    for (let j = 0; j < count; j++) {
      const s0 = f.length * j / count, s1 = f.length * (j + 1) / count;
      add('north-side-paving', f, s0, s1, -4, -2.2, heightAt(...f.point(s0, -3.1)) + .04, heightAt(...f.point(s1, -3.1)) + .04);
    }
  }
  const north = surfaces.filter(a => a.name === 'north-side-paving');
  const pavingJoins: [number, number, number][][] = [];
  for (let i = 1; i < north.length; i++) {
    const a = north[i - 1], b = north[i];
    if (a.frame === b.frame) continue;
    pavingJoins.push([at(a.frame,a.s1,a.n0,a.y1),at(b.frame,b.s0,b.n0,b.y0),at(b.frame,b.s0,b.n1,b.y0),at(a.frame,a.s1,a.n1,a.y1)]);
  }
  routes.northPassage = north.flatMap(a => [at(a.frame,a.s0+.08,-3.1,a.y0+(a.y1-a.y0)*.08/(a.s1-a.s0)),at(a.frame,a.s1-.08,-3.1,a.y1-(a.y1-a.y0)*.08/(a.s1-a.s0))]);
  const points = [...outline, ...surfaces.flatMap(a => [a.frame.point(a.s0, a.n0), a.frame.point(a.s1, a.n0), a.frame.point(a.s1, a.n1), a.frame.point(a.s0, a.n1)])];
  const bounds = { minX: Math.min(...points.map(p => p[0])) - .5, maxX: Math.max(...points.map(p => p[0])) + .5, minZ: Math.min(...points.map(p => p[1])) - .5, maxZ: Math.max(...points.map(p => p[1])) + .5 };
  return { outline, west, east, westDoor, eastDoor, floor, roof, court, surfaces, pavingJoins, routes, bounds };
}
export type Engineering30DiningLayout = ReturnType<typeof getEngineering30DiningLayout>;

export function cutEngineering30DiningTerrain(positions: number[], indices: number[], q: Engineering30DiningLayout) {
  const inside = (x: number, z: number) => { let yes = false; for (let i = 0, j = q.outline.length - 1; i < q.outline.length; j = i++) { const a = q.outline[i], b = q.outline[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) yes = !yes; } return yes; };
  const weight = (s: number, n: number, a: Dining30Surface) => Math.max(0, 1 - Math.hypot(Math.max(0, a.s0 - s, s - a.s1), Math.max(0, a.n0 - n, n - a.n1)) / .08);
  const segments = [...q.outline.map((p, i) => [p, q.outline[(i + 1) % q.outline.length]]), ...q.surfaces.flatMap(a => { const p = [a.frame.point(a.s0, a.n0), a.frame.point(a.s1, a.n0), a.frame.point(a.s1, a.n1), a.frame.point(a.s0, a.n1)]; return p.map((b, i) => [b, p[(i + 1) % 4]]); })];
  const joinTriangles = q.pavingJoins.flatMap(p => [[p[0],p[1],p[2]],[p[0],p[2],p[3]]]);
  const joinHeight = (p: number[][], x: number, z: number) => {
    const [a,b,c]=p,den=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);
    if(Math.abs(den)<1e-8)return undefined;
    const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/den,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/den;
    return u>=-1e-6&&v>=-1e-6&&u+v<=1.000001?u*a[1]+v*b[1]+(1-u-v)*c[1]:undefined;
  };
  for(const p of joinTriangles)for(let i=0;i<3;i++)segments.push([[p[i][0],p[i][2]],[p[(i+1)%3][0],p[(i+1)%3][2]]]);
  const patch = cutTerrainPatch(positions, indices, 0, { bounds: q.bounds, local: (x, z) => ({ s: x, n: z }), lines: { s: [], n: [] }, boundarySegments: segments, apply: (x, z, y) => {
    let result = inside(x, z) ? Math.min(y, q.floor - .25) : y;
    for(const p of joinTriangles){const h=joinHeight(p,x,z);if(h!==undefined)result=Math.min(result,h-.25);}
    for (const a of q.surfaces) { const p = a.frame.local([x, z]); result = Math.min(result, y + (physics561SurfaceHeight(a, p.s, p.n) - .25 - y) * weight(p.s, p.n, a)); }
    return result;
  } });
  return { ...patch, affects: (x: number, z: number) => inside(x, z) || joinTriangles.some(p=>joinHeight(p,x,z)!==undefined) || q.surfaces.some(a => { const p = a.frame.local([x, z]); return weight(p.s, p.n, a) > 0; }) };
}
