type XZ = [number, number];
const origin: XZ = [640.1, -694.36], end: XZ = [649.28, -678.92];
const length = Math.hypot(end[0] - origin[0], end[1] - origin[1]);
const axis = { x: (end[0] - origin[0]) / length, z: (end[1] - origin[1]) / length };
const across = { x: -axis.z, z: axis.x };
export const EDUCATION101_ENTRY_SITE = {
  buildingId: 'way/238937145', origin, axis, across,
  datumAnchor: origin, baselineDatumMeshY: 57.72110077349312,
  activeFootprintAnchor: [647.74, -706.94] as XZ,
  core: { s0: -14, s1: 0, n0: -18, n1: -5.5 },
  outer: { s0: -18, s1: 3, n0: -21, n1: -2.85 },
  terrainFloor: 58.95, forecourtFloor: 59.10, entryFloor: 59.58,
  preservedRoadHalfWidth: 2.75, sourceRoad: 'way/456540230/333',
  dimensionsEstimated: true,
};
export function education101EntryPoint(s: number, n = 0) { return { x: origin[0] + axis.x * s + across.x * n, z: origin[1] + axis.z * s + across.z * n }; }
export function education101EntryLocal(x: number, z: number) { return { s: (x - origin[0]) * axis.x + (z - origin[1]) * axis.z, n: (x - origin[0]) * across.x + (z - origin[1]) * across.z }; }
export function getEducation101EntryDatum(heightAt: (x: number, z: number) => number) { return heightAt(...origin) - .03 - EDUCATION101_ENTRY_SITE.baselineDatumMeshY; }
const smooth = (v: number) => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t); };
export function applyEducation101EntryCorrection(x: number, z: number, currentMeshY: number, datumOffset = 0) {
  const { core: c, outer: o, terrainFloor } = EDUCATION101_ENTRY_SITE, p = education101EntryLocal(x, z);
  if (p.s <= o.s0 || p.s >= o.s1 || p.n <= o.n0 || p.n >= o.n1) return currentMeshY;
  const w = smooth((p.s - o.s0) / (c.s0 - o.s0)) * smooth((o.s1 - p.s) / (o.s1 - c.s1))
    * smooth((p.n - o.n0) / (c.n0 - o.n0)) * smooth((o.n1 - p.n) / (o.n1 - c.n1));
  // 낮은 차도 옆 지면은 올리지 않는다. 현관의 짧은 계단 아래 높은 지형만 국소적으로 낮춘다.
  return currentMeshY + (Math.min(currentMeshY, terrainFloor + datumOffset) - currentMeshY) * w;
}
export function education101EntryCorrectionBounds() {
  const { s0, s1, n0, n1 } = EDUCATION101_ENTRY_SITE.outer, p = [[s0,n0],[s0,n1],[s1,n0],[s1,n1]].map(([s,n])=>education101EntryPoint(s,n));
  return { minX: Math.min(...p.map(v=>v.x)), maxX: Math.max(...p.map(v=>v.x)), minZ: Math.min(...p.map(v=>v.z)), maxZ: Math.max(...p.map(v=>v.z)) };
}
export function education101EntrySplitLines() {
  return { s: [-18,-17,-16,-15,-14,-12,-10,-8,-6,-4,-2,0,1,2,3], n: [-21,-20,-19,-18,-16,-14,-13.1,-12,-10,-8,-6,-5.5,-5,-4.5,-4,-3.5,-3,-2.85] };
}
