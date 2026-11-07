import {cutTerrainPatchSteps} from './terrainPatch';
import { humanities23Frame } from './humanities23Site';
import { physics561SurfaceHeight, type Physics561Surface } from './physics561Site';

export const SCIENCE28_ID = 'way/167608115';
type XZ = [number, number];
type Frame = ReturnType<typeof humanities23Frame>;
export type Science28Surface = Physics561Surface & { frame: Frame; elevated?: boolean };

export function getScience28Layout(heightAt: (x: number, z: number) => number) {
  // 재건축 후 항공사진의 외곽을 주변 22동과 27동에 맞춘 근사다. 원본 윤곽은 보존한다.
  const f = humanities23Frame([198, -955], [158, -938]);
  const width = f.length, depth = 39;
  const floor = heightAt(...f.point(26, -4)) + .8;
  const floors = [floor, floor + 4.2, floor + 8.4, floor + 12.6, floor + 16.8], basement = floor - 3.8, roof = floor + 20.8;
  const surfaces: Science28Surface[] = [], routes: Record<string, [number, number, number][]> = {};
  const at = (s: number, n: number, y: number): [number, number, number] => { const p = f.point(s, n); return [p[0], y, p[1]]; };
  const add = (name: string, s0: number, s1: number, n0: number, n1: number, y0: number, y1 = y0, axis: 's' | 'n' = 's', frame = f, elevated = false) => {
    const a = { name, s0, s1, n0, n1, y0, y1, axis, frame, elevated }; surfaces.push(a); return a;
  };
  const flight = (name: string, e: Frame, length: number, width: number, low: number, high: number) => {
    const count = Math.max(1, Math.ceil(Math.abs(high - low) / .16)), route: [number, number, number][] = [];
    for (let i = 0; i < count; i++) {
      const s0 = length * i / count, s1 = length * (i + 1) / count, y = low + (high - low) * (i + 1) / count, p = e.point((s0 + s1) / 2);
      add(name, s0, s1, -width / 2, width / 2, y, y, 's', e); route.push([p[0], y, p[1]]);
    }
    return route;
  };
  const court = floor - .85;
  add('north-court-paving', 5, width - 2, -14, -5.5, court);
  add('north-entry-landing', 8, width - 3, -1.5, 1, floor);
  const front = humanities23Frame(f.point(23, -5.5), f.point(23, -1.5));
  const frontSteps = flight('north-wide-stair', front, front.length, 24, court, floor);
  const north = heightAt(...f.point(23, -18)) + .04;
  add('north-court-approach', 21.5, 24.5, -18, -14, north, court, 'n');
  routes.northEntry = [at(23, -17.8, north + (court - north) * .05), at(23, -8, court), ...frontSteps, at(23, 4, floor)];
  // 현관 옆 완만한 접근로와 양옆 통로는 게임 지형에 맞춘다.
  add('north-west-ramp', width - 2.5, width -.5, -14, -1.5, court, floor, 'n');
  add('north-west-landing', width - 3, width -.5, -1.5, 1, floor);
  routes.northRamp = [at(width - 1.5, -13.8, court + .85 * .2 / 12.5), at(width - 1.5, -.5, floor), at(23, -.5, floor), at(23, 4, floor)];
  const eastLow = heightAt(...f.point(-3, -9)) + .04, eastHigh = heightAt(...f.point(-3, depth + 4)) + .04;
  add('east-side-ramp', -4.3, -1.7, -9, depth + 4, eastLow, eastHigh, 'n');
  routes.eastPassage = [at(-3, -8.8, eastLow + (eastHigh - eastLow) * .2 / (depth + 13)), at(-3, depth + 3.8, eastHigh - (eastHigh - eastLow) * .2 / (depth + 13))];
  const westLow = heightAt(...f.point(width + 2, -5)) + .04, westHigh = heightAt(...f.point(width + 2, depth + 3)) + .04;
  add('west-side-ramp', width + .6, width + 3.4, -5, depth + 3, westLow, westHigh, 'n');
  routes.westPassage = [at(width + 2, -4.8, westLow + (westHigh - westLow) * .2 / (depth + 8)), at(width + 2, depth + 2.8, westHigh - (westHigh - westLow) * .2 / (depth + 8))];
  // 동쪽 긴 계단과 남쪽 짧은 계단은 같은 현관 바닥에 닿는다.
  const eastStreet=(n:number)=>eastLow+(eastHigh-eastLow)*(n+9)/(depth+13);
  const eastSteps: [number,number,number][]=[];
  const eastStepCount=Math.ceil((floors[1]-eastStreet(7))/.16);
  for(let n=5;n<29;n+=4){
    for(let i=0;i<eastStepCount;i++){
      const s0=-1.7+4.2*i/eastStepCount,s1=-1.7+4.2*(i+1)/eastStepCount;
      const y=Math.max(eastStreet(n+2),floors[1]-(eastStepCount-i-1)*(floors[1]-eastStreet(7))/eastStepCount);
      add('east-wide-stair',s0,s1,n,n+4,y);
      if(n===13)eastSteps.push(at((s0+s1)/2,n+2,y));
    }
  }
  add('east-upper-landing',2.5,7,3,depth-4,floors[1],floors[1],'s',f,true);
  routes.eastEntry=[at(-3,15,eastStreet(15)),...eastSteps,at(9,15,floors[1])];
  const south=heightAt(...f.point(4,depth+4))+.04;
  const rear=humanities23Frame(f.point(4,depth+4),f.point(4,depth-1));
  const rearSteps=flight('south-short-stair',rear,rear.length,3.2,south,floors[1]);
  add('south-upper-landing',2.5,width-10,depth-5,depth-1,floors[1],floors[1],'s',f,true);
  routes.southEntry=[...rearSteps,at(4,depth-4.5,floors[1]),at(20,depth-4.5,floors[1]),at(20,depth-8,floors[1])];
  routes.upperSidePassage=[at(4,4,floors[1]),at(4,depth-4.5,floors[1]),at(20,depth-4.5,floors[1])];
  // 남서쪽 선큰의 개구부만 확인했다. 가려진 계단과 아래층 문은 만들지 않는다.
  const footprint = [f.point(0, 0), f.point(width, 0), f.point(width, depth), f.point(0, depth)];
  const points = [...footprint, ...surfaces.flatMap(a => [a.frame.point(a.s0, a.n0), a.frame.point(a.s1, a.n0), a.frame.point(a.s1, a.n1), a.frame.point(a.s0, a.n1)])];
  const bounds = { minX: Math.min(...points.map(p => p[0])) - 1, maxX: Math.max(...points.map(p => p[0])) + 1, minZ: Math.min(...points.map(p => p[1])) - 1, maxZ: Math.max(...points.map(p => p[1])) + 1 };
  return { f, width, depth, floor, floors, roof, basement, court, footprint, surfaces, routes, bounds };
}
export type Science28Layout = ReturnType<typeof getScience28Layout>;

export function* cutScience28TerrainSteps(positions: number[], indices: number[], q: Science28Layout) {
  const areas = q.surfaces.filter(a => !a.elevated);
  const building = { name: 'building-basement', s0: 0, s1: q.width, n0: 0, n1: q.depth, y0: q.basement, y1: q.basement, axis: 's' as const, frame: q.f };
  const all = [...areas, building];
  const weight = (s: number, n: number, a: Physics561Surface) => Math.max(0, 1 - Math.hypot(Math.max(0, a.s0 - s, s - a.s1), Math.max(0, a.n0 - n, n - a.n1)) / .15);
  const segments = all.flatMap(a => { const e = a.frame, p = [e.point(a.s0, a.n0), e.point(a.s1, a.n0), e.point(a.s1, a.n1), e.point(a.s0, a.n1)]; return p.map((b, i) => [b, p[(i + 1) % 4]]); });
  const patch = (yield* cutTerrainPatchSteps(positions, indices, 0, { bounds: q.bounds, local: (x, z) => q.f.local([x, z]), lines: { s: [], n: [] }, boundarySegments: segments, apply: (x, z, y) => {
    let result = y;
    for (const a of all) { const p = a.frame.local([x, z]); result = Math.min(result, y + (physics561SurfaceHeight(a, p.s, p.n) - .25 - y) * weight(p.s, p.n, a)); }
    return result;
  } }));
  return { ...patch, affects: (x: number, z: number) => all.some(a => { const p = a.frame.local([x, z]); return weight(p.s, p.n, a) > 0; }) };
}

export function cutScience28Terrain(...args:Parameters<typeof cutScience28TerrainSteps>){
  const steps=cutScience28TerrainSteps(...args);let result=steps.next();
  while(!result.done)result=steps.next();
  return result.value;
}
