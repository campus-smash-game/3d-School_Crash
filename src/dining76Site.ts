type XZ = [number, number];
const origin: XZ = [626.18, -656.11], upper: XZ = [634.11, -641.77];
const length = Math.hypot(upper[0] - origin[0], upper[1] - origin[1]);
const axis = { x: (upper[0] - origin[0]) / length, z: (upper[1] - origin[1]) / length };
const across = { x: -axis.z, z: axis.x };

export const DINING76_SITE = {
  buildingId: 'way/167983986', sourceRoad: 'way/185937116/84', originalLowerRoad: 'way/167597858/21', originalUpperRoad: 'way/185937117/85',
  sourceNodeIds: ['1966229954', '1966229960'], entranceNodeId: '4564809430', entry: [636.23, -637.79] as XZ,
  origin, upper, axis, across, length,
  lowerRoadPoints: [[607.83, -644.89], [626.18, -656.11], [641.47, -665.79], [649.8, -670.21]] as XZ[],
  datumAnchor: origin, datumStation: 0, baselineDatumMeshY: 52.73342426577157,
  lowerFloor: 53, upperFloor: 56.4, stairStart: 3.3, stairEnd: 14.3, halfWidth: 9,
  lowerSteps: 11, upperSteps: 9, stepRise: .17, tread: .46, middleStart: 8.36, middleEnd: 10.16,
  terrainBelowFloor: .16, lowerRoadProtectedHalfWidth: 2.8,
  core: { s0: 3.3, s1: 24.1, n0: -10.5, n1: 10.5 },
  outer: { s0: 2.8, s1: 26, n0: -14.5, n1: 14.5 },
  activeFootprintAnchor: [636.23, -637.79] as XZ,
  dimensionsEstimated: true,
};

export function dining76Point(s: number, n = 0) { return { x: origin[0] + axis.x * s + across.x * n, z: origin[1] + axis.z * s + across.z * n }; }
export function dining76Local(x: number, z: number) { return { s: (x - origin[0]) * axis.x + (z - origin[1]) * axis.z, n: (x - origin[0]) * across.x + (z - origin[1]) * across.z }; }
export function dining76CorrectionBounds() {
  const { s0, s1, n0, n1 } = DINING76_SITE.outer, p = [[s0, n0], [s0, n1], [s1, n0], [s1, n1]].map(([s, n]) => dining76Point(s, n));
  return { minX: Math.min(...p.map(q => q.x)), maxX: Math.max(...p.map(q => q.x)), minZ: Math.min(...p.map(q => q.z)), maxZ: Math.max(...p.map(q => q.z)) };
}
export function dining76SplitLines() { return { s: [2.8, 3.05, 3.3, 4.3, 5.3, 6.3, 7.3, 8.36, 9.26, 10.16, 11.3, 12.3, 13.3, 14.3, 15.3, 17, 19, 20.5, 21.2, 22.2, 24.1, 25, 26], n: [-14.5, -13.5, -12, -10.5, -9, -6, -3, -2.4, 0, 2.4, 3, 6, 9, 10.5, 12, 13.5, 14.5] }; }
export function dining76DesignFloor(s: number, datumOffset = 0) {
  const d = DINING76_SITE;
  if (s <= d.stairStart) return d.lowerFloor + datumOffset;
  if (s < d.middleStart) return d.lowerFloor + (s - d.stairStart) / (d.middleStart - d.stairStart) * d.lowerSteps * d.stepRise + datumOffset;
  if (s <= d.middleEnd) return d.lowerFloor + d.lowerSteps * d.stepRise + datumOffset;
  if (s < d.stairEnd) return d.lowerFloor + d.lowerSteps * d.stepRise + (s - d.middleEnd) / (d.stairEnd - d.middleEnd) * d.upperSteps * d.stepRise + datumOffset;
  return d.upperFloor + datumOffset;
}
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
function rectangleWeight(s: number, n: number, core: number[], outer: number[]) {
  return smooth((s - outer[0]) / (core[0] - outer[0])) * smooth((outer[1] - s) / (outer[1] - core[1])) * smooth((n - outer[2]) / (core[2] - outer[2])) * smooth((outer[3] - n) / (outer[3] - core[3]));
}
export function dining76CorrectionWeight(x: number, z: number) {
  const { s, n } = dining76Local(x, z);
  const stairs = rectangleWeight(s, n, [3.3, 14.3, -9, 9], [2.8, 16.5, -12, 12]);
  const terrace = rectangleWeight(s, n, [14.3, 21.2, -10.5, 10.5], [12.5, 23.2, -14.5, 14.5]);
  const lobby = rectangleWeight(s, n, [20.5, 24.1, -2.4, 2.4], [19.5, 26, -3.5, 3.5]);
  const road = DINING76_SITE.lowerRoadPoints;
  let distance = Infinity;
  for (let i = 0; i + 1 < road.length; i++) { const a = road[i], b = road[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz))); distance = Math.min(distance, Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz)); }
  // /21의 원래 차도 폭은 그대로 둔다. 계단 첫 단 앞의 좁은 완충 구간만 잘라 연결한다.
  return Math.max(stairs, terrace, lobby) * smooth((distance - DINING76_SITE.lowerRoadProtectedHalfWidth) / .35);
}
export function applyDining76Correction(x: number, z: number, currentMeshY: number, datumOffset = 0) {
  const weight = dining76CorrectionWeight(x, z); if (!weight) return currentMeshY;
  const { s } = dining76Local(x, z), target = dining76DesignFloor(s, datumOffset) - DINING76_SITE.terrainBelowFloor;
  return currentMeshY + (target - currentMeshY) * weight;
}
export function getDining76Layout(heightAt: (x: number, z: number) => number) {
  const offset = heightAt(...origin) - .03 - DINING76_SITE.baselineDatumMeshY;
  const floor = DINING76_SITE.upperFloor + offset, entry = DINING76_SITE.entry;
  const outward = { x: -axis.x, z: -axis.z }, tangent = across;
  const footprint: XZ[] = [[625.16, -631.03], [636.23, -637.79], [653.13, -648.09]];
  const openings = [0, 1].map(edgeIndex => {
    const a = footprint[edgeIndex], b = footprint[edgeIndex + 1], la = dining76Local(...a), lb = dining76Local(...b);
    const at = (n: number): XZ => { const t = (n - la.n) / (lb.n - la.n); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
    const low = Math.max(Math.min(la.n, lb.n), -4.2), high = Math.min(Math.max(la.n, lb.n), 4.2);
    return { buildingId: DINING76_SITE.buildingId, edgeIndex, a: at(low), b: at(high), bottom: floor - .3, top: floor + 3.2 };
  });
  return { ...DINING76_SITE, datumOffset: offset, lowerFloor: DINING76_SITE.lowerFloor + offset, upperFloor: floor, entrance: { center: { x: entry[0], y: floor, z: entry[1] }, outward, tangent, width: 3.6, height: 2.65, vestibuleDepth: 3 }, openings, correctionBounds: dining76CorrectionBounds() };
}
