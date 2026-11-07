type XZ = [number, number];
export const HUMANITIES_GARDEN_SITE = {
  origin: [399.5, -690.5] as XZ,
  axis: [.935, -.355] as XZ,
  core: { s: 8, n: 3 },
  outer: { s: 12, n: 7.5 },
  dimensionsEstimated: true,
};
export function humanitiesGardenLocal(x: number, z: number) {
  const [ox, oz] = HUMANITIES_GARDEN_SITE.origin, [dx, dz] = HUMANITIES_GARDEN_SITE.axis;
  const lengthSquared = dx * dx + dz * dz;
  return { s: ((x - ox) * dx + (z - oz) * dz) / lengthSquared, n: (-(x - ox) * dz + (z - oz) * dx) / lengthSquared };
}
export function humanitiesGardenPoint(s: number, n: number): XZ {
  const [x, z] = HUMANITIES_GARDEN_SITE.origin, [dx, dz] = HUMANITIES_GARDEN_SITE.axis;
  return [x + dx * s - dz * n, z + dz * s + dx * n];
}
export function humanitiesGardenCorrectionBounds() {
  const {s,n}=HUMANITIES_GARDEN_SITE.outer, points=[humanitiesGardenPoint(-s,-n),humanitiesGardenPoint(s,-n),humanitiesGardenPoint(s,n),humanitiesGardenPoint(-s,n)];
  return {minX:Math.min(...points.map(p=>p[0])),maxX:Math.max(...points.map(p=>p[0])),minZ:Math.min(...points.map(p=>p[1])),maxZ:Math.max(...points.map(p=>p[1]))};
}
export function humanitiesGardenSplitLines() {
  return {s:[-12,-10,-8,-4,0,4,8,10,12],n:[-7.5,-5.25,-3,0,3,5.25,7.5]};
}
// 사진의 평평한 쉼터를 게임 지형에 연결한다. 높이와 경계는 실측값이 아니다.
export function applyHumanitiesGardenCorrection(x:number,z:number,currentMeshY:number,floor:number) {
  const {s,n}=humanitiesGardenLocal(x,z),{core,outer}=HUMANITIES_GARDEN_SITE;
  const t=Math.min(1,Math.max(0,(Math.abs(s)-core.s)/(outer.s-core.s),(Math.abs(n)-core.n)/(outer.n-core.n)));
  if(t===1)return currentMeshY;
  return floor+(currentMeshY-floor)*t;
}
