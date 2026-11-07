type XZ = [number, number];
const origin: XZ = [655.56, -659.95], upper: XZ = [663.63, -649.29];
const length = Math.hypot(upper[0] - origin[0], upper[1] - origin[1]);
const axis = { x: (upper[0] - origin[0]) / length, z: (upper[1] - origin[1]) / length };
const across = { x: -axis.z, z: axis.x };
const junction: XZ = [666.17, -645.97], northBend: XZ = [675.96, -633.17], northEnd: XZ = [694.13, -618.84], sideEnd: XZ = [659.53, -641.3];
export const DINING76_EAST_SITE = {
  buildingId: 'way/167983986', sourceRoad: 'way/185937119/87', upperRoad: 'way/167609545/33', sideRoad: 'way/185937115/83',
  sourceNodeIds: ['1966229953', '1789931904'], origin, upper, axis, across, length, junction, northBend, northEnd, sideEnd,
  datumAnchor: origin, baselineDatumMeshY: 56.86780990097431, activeFootprintAnchor: [636.23, -637.79] as XZ,
  lowerRoadPoints: [[649.8, -670.21], origin] as XZ[], lowerRoadProtectedHalfWidth: 2.8, lowerRoadProtectedExtension: 1.3,
  preservedWestRoadPoints: [[607.83, -644.89], [626.18, -656.11], [641.47, -665.79], [649.8, -670.21]] as XZ[],
  lowerFloor: 56.9, upperFloor: 61.38, stairStart: 2.2, stairEnd: 11.72, stepCount: 28, stepRise: .16, tread: .34,
  halfWidth: 2.4, sidewallWidth: .55, upperPathWidth: 3.2, sidePathWidth: 3.2, terrainBelowFloor: .18,
  upperPath: [upper, junction, northBend, northEnd] as XZ[], upperPathFloors: [61.38, 61.38, 62.1, 63.900274],
  sidePlatform: { s0: 15.65, s1: 19.15, n0: 1.6, n1: 9.3, terrainUnfilled: true },
  outer: { s0: 1.3, s1: 56.057214, n0: -10.8, n1: 5.2 },
  dimensionsEstimated: true, upperConnectionsObservedContinuously: false, buildingDoorAdded: false,
};
export function dining76EastPoint(s: number, n = 0) { return { x: origin[0] + axis.x * s + across.x * n, z: origin[1] + axis.z * s + across.z * n }; }
export function dining76EastLocal(x: number, z: number) { return { s: (x - origin[0]) * axis.x + (z - origin[1]) * axis.z, n: (x - origin[0]) * across.x + (z - origin[1]) * across.z }; }
const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
export function dining76EastDesignFloor(s: number, datumOffset = 0) {
  const d = DINING76_EAST_SITE;
  if (s <= d.stairStart) return d.lowerFloor + datumOffset;
  if (s < d.stairEnd) return d.lowerFloor + (s - d.stairStart) * d.stepRise / d.tread + datumOffset;
  const stations = d.upperPath.map(p => dining76EastLocal(...p).s); stations[1] = d.sidePlatform.s1;
  if (s <= stations[1]) return d.upperFloor + datumOffset;
  for (let i = 1; i + 1 < stations.length; i++) if (s <= stations[i + 1]) { const t = (s - stations[i]) / (stations[i + 1] - stations[i]); return d.upperPathFloors[i] + (d.upperPathFloors[i + 1] - d.upperPathFloors[i]) * t + datumOffset; }
  return d.upperPathFloors.at(-1)! + datumOffset;
}
function segmentProjection(x: number, z: number, a: XZ, b: XZ) {
  const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz), u = ((x - a[0]) * dx + (z - a[1]) * dz) / length;
  return { u, length, n: ((x - a[0]) * -dz + (z - a[1]) * dx) / length };
}
export function dining76EastCorrectionWeight(x: number, z: number) {
  const d = DINING76_EAST_SITE, { s, n } = dining76EastLocal(x, z), platform = d.sidePlatform;
  if (s < d.outer.s0 || s > d.outer.s1 || n < d.outer.n0 || n > d.outer.n1) return 0;
  // 흰 보 아래는 열린 공간이다. 건물 쪽 외부 참의 밑을 높은 지형으로 채우지 않는다.
  if (s >= platform.s0 && s <= platform.s1 && n >= platform.n0) return 0;
  if (s >= 2.2 && s <= platform.s1 && n >= 3) return 0;
  const road = segmentProjection(x, z, d.lowerRoadPoints[0], d.lowerRoadPoints[1]);
  if (road.u >= 0 && road.u <= road.length + d.lowerRoadProtectedExtension && Math.abs(road.n) <= d.lowerRoadProtectedHalfWidth) return 0;
  const stairs = smooth((s - 1.3) / .9) * smooth((15.37 - s) / 2) * smooth((5.2 + n) / 2.2) * smooth((3 - n) / .6);
  let path = 0;
  for (let i = 0; i + 1 < d.upperPath.length; i++) {
    const p = segmentProjection(x, z, d.upperPath[i], d.upperPath[i + 1]);
    const along = smooth((p.u + 2) / 2) * smooth((p.length + 2 - p.u) / 2), width = smooth((4.8 - Math.abs(p.n)) / 2.8);
    path = Math.max(path, along * width);
  }
  // 북쪽 원래 길의 마지막 2m에서는 전체 횡단면을 원지형으로 돌려 놓는다.
  return Math.max(stairs, path) * smooth((d.outer.s1 - s) / 2);
}
export function applyDining76EastCorrection(x: number, z: number, currentMeshY: number, datumOffset = 0) {
  const w = dining76EastCorrectionWeight(x, z); if (!w) return currentMeshY;
  const target = dining76EastDesignFloor(dining76EastLocal(x, z).s, datumOffset) - DINING76_EAST_SITE.terrainBelowFloor;
  return currentMeshY + (target - currentMeshY) * w;
}
export function dining76EastCorrectionBounds() {
  const { s0, s1, n0, n1 } = DINING76_EAST_SITE.outer, p = [[s0, n0], [s0, n1], [s1, n0], [s1, n1]].map(([s, n]) => dining76EastPoint(s, n));
  return { minX: Math.min(...p.map(v => v.x)), maxX: Math.max(...p.map(v => v.x)), minZ: Math.min(...p.map(v => v.z)), maxZ: Math.max(...p.map(v => v.z)) };
}
export function dining76EastSplitLines() {
  const stations = [1.3, 2.2, 11.72, length, 15.65, 17.550272, 19.15, 33.664792, 54.057214, 56.057214];
  for (let s = 3.2; s < 56; s += 2) stations.push(s);
  return { s: [...new Set(stations)].sort((a, b) => a - b), n: [-10.8, -8.7, -6.7, -4.8, -3, -2.4, -2, -1.6, 0, 1.6, 2, 2.4, 3, 4, 5.2] };
}
export function getDining76EastLayout(heightAt: (x: number, z: number) => number) {
  const d = DINING76_EAST_SITE, datumOffset = heightAt(...origin) - .03 - d.baselineDatumMeshY;
  return { ...d, datumOffset, lowerFloor: d.lowerFloor + datumOffset, upperFloor: d.upperFloor + datumOffset, correctionBounds: dining76EastCorrectionBounds(), sourceScope: { stairMaterialAndSidewallsObserved: true, whiteBeamAndUpperRailingObserved: true, actualStepCountKnown: false, upperFloorConnectionHiddenByTrees: true, source83EndIsEntrance: false, rearFacadeComplete: false } };
}
