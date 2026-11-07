type XZ = [number, number];
const origin: XZ = [640.10, -694.36], end: XZ = [649.28, -678.92];
const length = Math.hypot(end[0] - origin[0], end[1] - origin[1]);
const axis = { x: (end[0] - origin[0]) / length, z: (end[1] - origin[1]) / length };
const across = { x: -axis.z, z: axis.x };

export const EDUCATION101_SITE = {
  buildingId: 'way/238937145', sourceRoad: 'way/456540230/333', sourceSegment: 3,
  origin, end, length, axis, across, baselineHeightAt: 57.75110077349312,
  roadHalfWidth: 2.75, rightWallN: -4.7, upperOuterN: 5.15,
  mainCeilingY: 66.8, upperTopY: 79.6, bridgeFloorY: 63.05,
  bridge: { s0: 8.55, s1: 11.35, n0: -7.0, n1: 5.15 },
  stairs: { s0: 4.35, s1: 8.55, n0: 2.85, n1: 5.15, count: 36, flights: 3, landingLength: 1.2 },
  sourceEntrance: { nodeId: '4564750884', point: [647.74, -706.94] as XZ, photoCorrespondenceMeasured: false },
  entry: { s: -6.908681616148666, n: -13.05, floorY: 59.58, forecourtY: 59.10, width: 6, doorWidth: 3, height: 2.7, lobbyDepth: 3, stepCount: 3, stepRise: .16, stepTread: .4 },
};

export function education101Point(s: number, n = 0): XZ { return [origin[0] + axis.x * s + across.x * n, origin[1] + axis.z * s + across.z * n]; }
export function education101Local(x: number, z: number) { return { s: (x - origin[0]) * axis.x + (z - origin[1]) * axis.z, n: (x - origin[0]) * across.x + (z - origin[1]) * across.z }; }

export const EDUCATION10_LINK = {
  buildingId: 'way/180954536', edgeIndex: 5,
  s0: 8.68, s1: 10.99, floorEndN: 8.0,
  groundEntry: { s: 4.1, n: 5.79, width: 2.0, floorY: 56.85, height: 2.6, lobbyEndN: 8.0 },
  canopy: { s0: 8.55, s1: 11.35, n0: 2.65, n1: 6.2, spring: 2.55, rise: .45 },
};

// 연결 위치는 10동 끝벽과 거리뷰를 대조했다. 문턱 높이와 내부 깊이는 게임용 근사다.
export function getEducation10LinkOpening(heightAt: (x: number, z: number) => number, footprint: XZ[]) {
  const a = footprint[EDUCATION10_LINK.edgeIndex], b = footprint[EDUCATION10_LINK.edgeIndex + 1];
  const la = education101Local(...a), lb = education101Local(...b);
  const at = (s: number): XZ => { const t = (s - la.s) / (lb.s - la.s); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
  const floor = getEducation101Layout(heightAt).bridgeFloorY;
  return { buildingId: EDUCATION10_LINK.buildingId, edgeIndex: EDUCATION10_LINK.edgeIndex,
    a: at(EDUCATION10_LINK.s0), b: at(EDUCATION10_LINK.s1), bottom: floor - .30, top: floor + 2.73,
    sourceRoad: EDUCATION101_SITE.sourceRoad };
}

export function getEducation10GroundOpening(heightAt: (x: number, z: number) => number, footprint: XZ[]) {
  const entry = EDUCATION10_LINK.groundEntry, a = footprint[5], b = footprint[6];
  const la = education101Local(...a), lb = education101Local(...b);
  const at = (s: number): XZ => { const t = (s - la.s) / (lb.s - la.s); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
  const floor = entry.floorY + heightAt(...origin) - EDUCATION101_SITE.baselineHeightAt;
  return { buildingId: EDUCATION10_LINK.buildingId, edgeIndex: 5, a: at(entry.s - 1.13), b: at(entry.s + 1.13), bottom: floor - .3, top: floor + 2.75, sourceRoad: EDUCATION101_SITE.sourceRoad };
}

// 좌표는 원본 차도, 치수와 높이는 양쪽 거리뷰의 비례를 따른 게임용 근사다.
export function getEducation101Layout(heightAt: (x: number, z: number) => number, footprint?: XZ[]) {
  const datumOffset = heightAt(...origin) - EDUCATION101_SITE.baselineHeightAt;
  const mainCeilingY = EDUCATION101_SITE.mainCeilingY + datumOffset, upperTopY = EDUCATION101_SITE.upperTopY + datumOffset, bridgeFloorY = EDUCATION101_SITE.bridgeFloorY + datumOffset;
  const points = footprint ?? [[691.03, -706.7], [649.28, -678.92], [640.1, -694.36], [651.21, -701.48]];
  const openings = [0, 1, 2].map(edgeIndex => {
    const a = points[edgeIndex], b = points[edgeIndex + 1];
    const la = education101Local(...a), lb = education101Local(...b);
    const intersection = (n: number): XZ => { const t = (n - la.n) / (lb.n - la.n); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
    const cutA = edgeIndex === 1 ? a : (la.n < -4.95 ? intersection(-4.95) : a), cutB = edgeIndex === 1 ? b : (lb.n < -4.95 ? intersection(-4.95) : b);
    return { buildingId: EDUCATION101_SITE.buildingId, edgeIndex, a: cutA, b: cutB, bottom: 50 + datumOffset, top: mainCeilingY + .34, sourceRoad: EDUCATION101_SITE.sourceRoad };
  });
  if (footprint && footprint.length > 5) for (const edgeIndex of [3, 4]) {
    const a = footprint[edgeIndex], b = footprint[edgeIndex + 1], la = education101Local(...a), lb = education101Local(...b), lo = Math.max(Math.min(la.s, lb.s), EDUCATION101_SITE.entry.s - 4.1), hi = Math.min(Math.max(la.s, lb.s), EDUCATION101_SITE.entry.s + 4.1);
    const at = (s: number): XZ => { const t = (s - la.s) / (lb.s - la.s); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
    if (hi > lo) openings.push({ buildingId: EDUCATION101_SITE.buildingId, edgeIndex, a: at(lo), b: at(hi), bottom: 50 + datumOffset, top: 85 + datumOffset, sourceRoad: EDUCATION101_SITE.sourceRoad });
  }
  const stairsLowerFloor = EDUCATION10_LINK.groundEntry.floorY + datumOffset;
  return { datumOffset, mainCeilingY, upperTopY, bridgeFloorY, openings, stairsLowerFloor, stairRise: (bridgeFloorY - stairsLowerFloor) / EDUCATION101_SITE.stairs.count, entryFloor: EDUCATION101_SITE.entry.floorY + datumOffset, forecourtFloor: EDUCATION101_SITE.entry.forecourtY + datumOffset, dimensionsEstimated: true, measuredStoreyCount: false, observedUpperWindowRows: 4, wholeBuildingFacadeReconstructed: false };
}
