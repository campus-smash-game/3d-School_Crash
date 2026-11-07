import {cutTerrainPatchSteps} from './terrainPatch';
import { humanities23Frame } from './humanities23Site';
import { physics561SurfaceHeight } from './physics561Site';
import type { Engineering30Surface } from './engineering30Site';
import { ENGINEERING37_ID, type Engineering3337Layout } from './engineering3337Site';

export { ENGINEERING37_ID };
type XZ = [number, number];

export function getEngineering37Layout(heightAt: (x: number, z: number) => number, footprint: XZ[], connection: Engineering3337Layout) {
  const outline = footprint.slice(0, -1), axis = humanities23Frame(outline[0], outline[7]);
  const width = axis.local(outline[2]).n, length = axis.length;
  // 사진에서 보이는 노출 창줄을 연결교의 게임 높이에 맞춘다. 공식 층 명칭이나 실측 표고가 아니다.
  const floors = [connection.upper - 3.5, connection.upper, connection.bridgeFloor, connection.middle, connection.canopyBase];
  const roof = floors[4] + 3.5, towerRoof = roof + 3.3, deck = floors[2];
  const blocks = [
    { name: 'north-tower', s0: 0, s1: 7.7, n0: 0, n1: width, roof: towerRoof },
    { name: 'north-neck', s0: 7.7, s1: 16.8, n0: 8.8, n1: width - 8.8, roof: roof - 1.2 },
    { name: 'main', s0: 16.8, s1: 66.2, n0: 0, n1: width, roof },
    { name: 'south-neck', s0: 66.2, s1: 72, n0: 8.8, n1: width - 8.8, roof: roof - 1.2 },
    { name: 'south-tower', s0: 72, s1: length, n0: 0, n1: width, roof: towerRoof },
  ];
  const surfaces: Engineering30Surface[] = [], routes: Record<string, [number, number, number][]> = {};
  const at = (s: number, n: number, y: number): [number, number, number] => { const p = axis.point(s, n); return [p[0], y, p[1]]; };
  const add = (name: string, s0: number, s1: number, n0: number, n1: number, y0: number, y1 = y0) => { const a: Engineering30Surface = { name, frame: axis, s0, s1, n0, n1, y0, y1, axis: 's' }; surfaces.push(a); return a; };
  const westWalk: [number, number, number][] = [];
  const connectionEdge = (n: number, edge: number) => {
    const a = connection.passage.local(axis.point(0, n)).n, b = connection.passage.local(axis.point(1, n)).n;
    return (edge - a) / (b - a);
  };
  const westStart = connectionEdge(-2.2, -4.1), deckStart = connectionEdge(width + 5, -2.8), deckEnd = 50;
  const westSouth = heightAt(...axis.point(length - 1, -2.2)) + .035;
  const westHeight = (s: number) => connection.lower + (westSouth - connection.lower) * (s - westStart) / (length - 1 - westStart);
  for (let s = westStart; s < length - 1; s += 3) {
    const end = Math.min(s + 3, length - 1), a = westHeight(s), b = westHeight(end);
    add('west-paved-walk', s, end, -3.4, -1, a, b); if (!westWalk.length) westWalk.push(at(s + .1, -2.2, a + (b - a) * .1 / (end - s))); westWalk.push(at(end - .05, -2.2, b - (b - a) * .05 / (end - s)));
    add('west-wall-apron', s, end, -1, .15, a, b);
  }
  routes.westWalk = westWalk;
  const plazaBreaks=[6,10,14,18,22,26,30,32,36,38,42,44,45,46,deckEnd];
  for (let i=0;i+1<plazaBreaks.length;i++) {
    const s=plazaBreaks[i],end=plazaBreaks[i+1],timber=s<32;
    add('east-grid-paving', s, end, width + 3.5, width + 6, deck);
    add('east-grid-paving', s, end, width + 6, 34, deck);
    if(s<44){add(timber ? 'east-timber-deck' : 'east-grid-paving',s,end,34,52,deck);add('east-grid-paving',s,end,52,67,deck);}
    else if(s<45){add('east-grid-paving',s,45,37,67,deck);}
    if(s>=44)add('east-grid-paving',s,end,34,37,deck);
  }
  const loweredStrip = deck - .9;
  for (let s = 16.8; s < 66.2 - .001; s += 5) add('east-lowered-strip', s, Math.min(s + 5, 66.2), width + .15, width + 3.3, loweredStrip);
  const northJoin = connection.passage.local(axis.point(deckStart, width + 5));
  const northSurface = connection.surfaces.find(a => a.name === 'east-red-approach' && a.s0 <= northJoin.s && a.s1 >= northJoin.s)!;
  const northLow = physics561SurfaceHeight(northSurface, northJoin.s, northJoin.n);
  for (let i = 0; i < 6; i++) add('north-deck-approach', deckStart + (6 - deckStart) * i / 6, deckStart + (6 - deckStart) * (i + 1) / 6, width + 3.5, width + 6.5, northLow + (deck - northLow) * i / 6, northLow + (deck - northLow) * (i + 1) / 6);
  const southHigh = heightAt(...axis.point(length + 1, width + 5)) + .035;
  for (let i = 0; i < 5; i++) add('south-deck-approach', deckEnd + (length + 1 - deckEnd) * i / 5, deckEnd + (length + 1 - deckEnd) * (i + 1) / 5, width + 3.5, width + 6.5, deck + (southHigh - deck) * i / 5, deck + (southHigh - deck) * (i + 1) / 5);
  routes.deckWestEdge = [at(deckStart + .2, width + 5, northLow + (deck - northLow) * .2 / (6 - deckStart)), at(6, width + 5, deck), at(40, width + 5, deck), at(deckEnd - .2, width + 5, deck), at(length + .8, width + 5, southHigh - (southHigh - deck) * .2 / (length + 1 - deckEnd))];
  routes.deckCrossing = [at(18, width + 4, deck), at(18, 42, deck), at(18, 54, deck)];
  const seatSteps: [number, number, number][] = [];
  for (let i = 0; i < 4; i++) { const s0 = 6 - 2 * (i + 1), s1 = 6 - 2 * i, y = deck + .18 * (i + 1); add('north-timber-seating-tier', s0, s1, 34, 54, y); seatSteps.push(at((s0 + s1) / 2,44.7,y)); }
  add('north-seating-top',-4,-2,34,58,deck+.72);
  routes.northSeating=[at(6.5,44.7,deck),...seatSteps,at(-3,44.7,deck+.72)];
  const northSource = connection.passage.point(38, -2.5), sourceSurface = connection.surfaces.find(a => a.name === 'east-red-approach' && a.s0 <= 38 && a.s1 >= 38)!;
  routes.connectionToDeck = [[northSource[0], physics561SurfaceHeight(sourceSurface, 38, -2.5), northSource[1]], routes.deckWestEdge[0], routes.deckWestEdge[1]];
  const cover = connection.routes.coverApron.at(-1)!;
  routes.connectionToWestWalk = [cover, routes.westWalk[0], routes.westWalk[1]];
  const screenFloor = westHeight(68) + .08;
  add('southwest-screen-court', 66.3, 71.9, -1, 8.6, screenFloor);
  const westScreenSurface = surfaces.find(a => a.name === 'west-paved-walk' && a.s0 <= 68 && a.s1 >= 68)!;
  routes.southwestScreen = [at(68, -2.2, physics561SurfaceHeight(westScreenSurface, 68, -2.2)), at(68, 1, screenFloor), at(68, 4, screenFloor)];
  const trees = [8,12,16,20,24,28].flatMap(s => [37,43,49].map(n => ({ s, n })));
  // 동쪽 곡선 차양의 폭과 곡률은 항공사진 비례에 맞춘 근사다.
  // 지붕은 수평 차양이며 보행 데크가 아니다.
  const eastCanopy = Array.from({ length: 17 }, (_, i) => {
    const t = i / 16, s = 31 * t, n = 58.5 + 4 * Math.sin(Math.PI * t);
    return { s, n };
  });
  add('northeast-upper-landing',-2,0,54,58,deck+.72);
  add('northeast-canopy-floor',0,4,58,67,deck);
  const northeastSteps:[number,number,number][]=[];
  for(let i=0;i<4;i++){const y=deck+.72-.18*(i+1);add('northeast-narrow-stair',i,i+1,54,58,y);northeastSteps.push(at(i+.5,56,y));}
  add('northeast-lower-landing',4,6,54,67,deck);
  routes.eastPlazaCrossing=[at(34,49,deck),at(34,58,deck),at(34,66,deck)];
  routes.curvedCanopyWalk=[...eastCanopy.filter(p=>p.s>=6&&p.s<30).map(p=>at(p.s,p.n,deck))];
  routes.northSeatingToEast=[routes.northSeating.at(-1)!,at(-3,56,deck+.72),at(-.1,56,deck+.72),...northeastSteps,at(5,56,deck),at(6.5,56,deck)];
  const southUpper=deck+1.2,southSteps:[number,number,number][]=[];
  for(let i=0;i<8;i++){const a=add('south-plinth-side-stair',38+7*i/8,38+7*(i+1)/8,37,41,deck+1.2*(i+1)/8);southSteps.push(at((a.s0+a.s1)/2,39,a.y0));}
  for(let n=37;n<67;n+=5)add('south-plaza-upper-walk',45,49,n,Math.min(n+5,67),southUpper);
  const exitPoint=axis.point(47,78),exitHeight=heightAt(...exitPoint)+.035;
  const eastExit=add('east-footway-approach',45.5,48.5,67,78,southUpper,exitHeight);eastExit.axis='n';
  routes.southPlazaStair=[at(37.5,39,deck),...southSteps,at(47,39,southUpper),at(47,66,southUpper)];
  routes.eastFootway=[at(47,64,southUpper),at(47,67,southUpper),at(47,77.8,exitHeight+(southUpper-exitHeight)*.2/11)];
  const plinth={points:[[37,52],[45,42],[45,64]] as XZ[],top:[deck+1.65,southUpper,southUpper],ring:{s:42,n:53,radius:1.6,height:.75}};
  const blockPolygons = blocks.map(a => [axis.point(a.s0, a.n0), axis.point(a.s1, a.n0), axis.point(a.s1, a.n1), axis.point(a.s0, a.n1)]);
  const polygons = surfaces.map(a => [axis.point(a.s0, a.n0), axis.point(a.s1, a.n0), axis.point(a.s1, a.n1), axis.point(a.s0, a.n1)]);
  const points = [...blockPolygons.flat(), ...polygons.flat()], bounds = { minX: Math.min(...points.map(p => p[0])) - .5, maxX: Math.max(...points.map(p => p[0])) + .5, minZ: Math.min(...points.map(p => p[1])) - .5, maxZ: Math.max(...points.map(p => p[1])) + .5 };
  return { outline, axis, width, length, floors, roof, towerRoof, deck, deckEnd, loweredStrip, screenFloor, blocks, blockPolygons, surfaces, polygons, routes, trees, eastCanopy, plinth, bounds };
}
export type Engineering37Layout = ReturnType<typeof getEngineering37Layout>;

export function* cutEngineering37TerrainSteps(positions: number[], indices: number[], q: Engineering37Layout) {
  const sample = (x: number, z: number, lowest = false) => {
    const p = q.axis.local([x, z]); let h: number | undefined;
    for (const a of q.surfaces) if (p.s >= a.s0 - .001 && p.s <= a.s1 + .001 && p.n >= a.n0 - .001 && p.n <= a.n1 + .001) { const y = physics561SurfaceHeight(a, p.s, p.n); h = lowest && h !== undefined ? Math.min(h, y) : y; }
    return h;
  };
  const lines = { s: [...new Set([...q.surfaces, ...q.blocks].flatMap(a => [a.s0, a.s1]))], n: [...new Set([...q.surfaces, ...q.blocks].flatMap(a => [a.n0, a.n1]))] };
  const patch = (yield* cutTerrainPatchSteps(positions, indices, 0, { bounds: q.bounds, local: (x, z) => q.axis.local([x, z]), lines, boundarySegments: [], apply: (x, z, y) => { const h = sample(x, z, true); return h !== undefined ? h - .24 : y; } }));
  return { ...patch, surfaceAt: (x: number, z: number) => sample(x, z), affects: (x: number, z: number) => sample(x, z) !== undefined };
}

export function cutEngineering37Terrain(...args:Parameters<typeof cutEngineering37TerrainSteps>){
  const steps=cutEngineering37TerrainSteps(...args);let result=steps.next();
  while(!result.done)result=steps.next();
  return result.value;
}
