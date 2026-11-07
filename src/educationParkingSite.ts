/** /659 하강로의 게임용 설계 좌표다. 지형 원자료와 현장 측량값을 바꾸지 않는다. */
export const EDUCATION_PARKING_SITE = {
  id: 'education-220-parking-approach',
  sourceRoad: 'way/1544714433/659',
  sourceParkingNode: '4514838234',
  origin: { x: 518.71, z: -175.51 },
  axis: { x: 0.47894337156742567, z: 0.8778457990055125 },
  across: { x: -0.8778457990055125, z: 0.47894337156742567 },
  originalRoadLength: 99.82390996149167,
  roadHalfWidth: 2.75,
  core: { s0: -5, s1: 45, n0: -3, n1: 3 },
  outer: { s0: -8, s1: 55, n0: -4.8, n1: 4.8 },
  eastCorrectionEdge: -4.2,
  datumStation: 55,
  baselineDatumMeshY: 36.0575638819002,
  portalFloorMeshY: 30.9,
  profileUpperSlope: 0.113865148601064,
  portal: { s: 0, interiorEndS: -5, width: 5.5, clearHeight: 2.6, postedHeightLimit: 2.3 },
  dimensionsEstimated: true,
  heightsSurveyed: false,
  postedLimitIsMeasuredClearance: false,
} as const;

export function educationParkingProject(x: number, z: number) {
  const q = EDUCATION_PARKING_SITE, dx = x - q.origin.x, dz = z - q.origin.z;
  return { s: dx * q.axis.x + dz * q.axis.z, n: dx * q.across.x + dz * q.across.z };
}

export function educationParkingPoint(s: number, n = 0) {
  const q = EDUCATION_PARKING_SITE;
  return { x: q.origin.x + q.axis.x * s + q.across.x * n, z: q.origin.z + q.axis.z * s + q.across.z * n };
}

/** 반환값은 물리 지형의 목표 높이다. heightAt의 3cm 여유는 포함하지 않는다. */
export function educationParkingFloorY(s: number, datumOffset = 0) {
  const q = EDUCATION_PARKING_SITE, t = Math.max(0, Math.min(1, s / q.datumStation));
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * q.portalFloorMeshY
    + (-2 * t3 + 3 * t2) * q.baselineDatumMeshY
    + (t3 - t2) * q.datumStation * q.profileUpperSlope + datumOffset;
}

const smooth = (x: number, a: number, b: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function educationParkingCorrectionWeight(x: number, z: number) {
  const q = EDUCATION_PARKING_SITE, p = educationParkingProject(x, z);
  if (p.s <= q.outer.s0 || p.s >= q.outer.s1 || p.n <= q.outer.n0 || p.n >= q.outer.n1) return 0;
  return smooth(p.s, q.outer.s0, q.core.s0) * (1 - smooth(p.s, q.core.s1, q.outer.s1))
    * smooth(p.n, q.eastCorrectionEdge, q.core.n0) * (1 - smooth(p.n, q.core.n1, q.outer.n1));
}

/** 주변 패드를 유지한 뒤 지정 구역 안에서만 낮춘다. 바깥 경계는 기존 높이와 정확히 같다. */
export function applyEducationParkingCorrection(x: number, z: number, currentY: number, datumOffset = 0) {
  const weight = educationParkingCorrectionWeight(x, z);
  if (!weight) return currentY;
  const target = educationParkingFloorY(educationParkingProject(x, z).s, datumOffset);
  return currentY + Math.min(0, target - currentY) * weight;
}

export function educationParkingCorrectionBounds() {
  const q = EDUCATION_PARKING_SITE.outer;
  const p = [educationParkingPoint(q.s0, q.n0), educationParkingPoint(q.s0, q.n1), educationParkingPoint(q.s1, q.n0), educationParkingPoint(q.s1, q.n1)];
  return { minX: Math.min(...p.map(v => v.x)), maxX: Math.max(...p.map(v => v.x)), minZ: Math.min(...p.map(v => v.z)), maxZ: Math.max(...p.map(v => v.z)) };
}

/** 옹벽의 안쪽과 바깥쪽, 종단 접속점을 실제 삼각형 경계로 넣기 위한 절단선이다. */
export function educationParkingSplitLines() {
  const s = [-8, -7, -6, -5, -2.5, 0, ...Array.from({ length: 27 }, (_, i) => (i + 1) * 2), 45, 55];
  return { s: [...new Set(s)].sort((a, b) => a - b), n: [-4.8, -4.2, -3.6, -3, -2.75, 0, 2.75, 3, 3.6, 4.2, 4.8] };
}
