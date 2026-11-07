import * as THREE from 'three';
import type { EducationNorthPart, EducationNorthTriangle } from './educationNorthApproach';
import type { TerrainHeightSampler } from './terrain';
import { EDUCATION_PARKING_SITE, educationParkingFloorY, educationParkingPoint, educationParkingProject } from './educationParkingSite';

type V = THREE.Vector3;
const up = new THREE.Vector3(0, 1, 0);

/** 관측된 외부 하강로와 짧은 포털만 만든다. 주차장 내부 전체를 뜻하지 않는다. */
export function buildEducationParkingApproach(heightAt: TerrainHeightSampler) {
  const site = EDUCATION_PARKING_SITE, axis = new THREE.Vector3(site.axis.x, 0, site.axis.z), across = new THREE.Vector3(site.across.x, 0, site.across.z);
  const parts: EducationNorthPart[] = [], decorations: EducationNorthTriangle[] = [];
  const concrete = 0xb8b8ac, metal = 0xb5bdb5, dark = 0x404744, soil = 0x697a4c;
  const point = (s: number, n: number, y = 0) => { const p = educationParkingPoint(s, n); return new THREE.Vector3(p.x, y, p.z); };
  const ground = (s: number, n: number) => { const p = point(s, n); return heightAt(p.x, p.z) - .03; };
  const datumOffset = ground(site.datumStation, 0) - site.baselineDatumMeshY;
  const floor = educationParkingFloorY(0, datumOffset) + .01;
  const ceiling = floor + site.portal.clearHeight;
  const uncutGround = (s: number, side: number) => ground(s, side * site.outer.n1);
  const part = (component: string, material: 'stone' | 'metal' | 'glass' = 'stone', extra: Record<string, unknown> = {}) => {
    const p: EducationNorthPart = { component, material, triangles: [], extra: { parkingApproach: true, facilityId: site.id, ...extra } }; parts.push(p); return p;
  };
  const tri = (p: EducationNorthPart, a: V, b: V, c: V, color: number) => p.triangles.push({ vertices: [a.clone(), b.clone(), c.clone()], color, surface: 'details' });
  const quad = (p: EducationNorthPart, a: V, b: V, c: V, d: V, color: number) => { tri(p, a, b, c, color); tri(p, a, c, d, color); };
  function prism(component: string, top: V[], bottom: V[], color: number, extra: Record<string, unknown> = {}) {
    const p = part(component, 'stone', extra);
    for (let i = 1; i + 1 < top.length; i++) { tri(p, top[0], top[i + 1], top[i], color); tri(p, bottom[0], bottom[i], bottom[i + 1], color); }
    for (let i = 0; i < top.length; i++) { const j = (i + 1) % top.length; quad(p, bottom[i], bottom[j], top[j], top[i], color); }
    return p;
  }
  function box(component: string, centre: V, size: V, color: number, ex = axis, ey = up, material: 'stone' | 'metal' | 'glass' = 'stone', extra: Record<string, unknown> = {}) {
    const p = part(component, material, extra), ez = new THREE.Vector3().crossVectors(ex, ey).normalize(), v: V[] = [];
    for (const y of [-1, 1]) for (const z of [-1, 1]) for (const x of [-1, 1]) v.push(centre.clone().addScaledVector(ex, x * size.x / 2).addScaledVector(ey, y * size.y / 2).addScaledVector(ez, z * size.z / 2));
    for (const f of [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]) quad(p, v[f[0]], v[f[1]], v[f[2]], v[f[3]], color);
    return p;
  }
  function beam(component: string, a: V, b: V, thickness: number, color: number) {
    const ex = b.clone().sub(a).normalize(), ey = up.clone().addScaledVector(ex, -up.dot(ex)).normalize();
    return box(component, a.clone().add(b).multiplyScalar(.5), new THREE.Vector3(a.distanceTo(b), thickness, thickness), color, ex, ey, 'metal');
  }
  function cylinder(component: string, centre: V, radius: number, height: number, color: number, material: 'stone' | 'metal' | 'glass' = 'metal') {
    const p = part(component, material), geometry = new THREE.CylinderGeometry(radius, radius, height, 10).toNonIndexed(), v = geometry.getAttribute('position');
    for (let i = 0; i < v.count; i += 3) tri(p, ...[0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(v, i + j).add(centre)) as [V, V, V], color);
    return p;
  }

  // 노면 표시도 실제 지형 삼각형에 자른다. 일반 노면 도색처럼 별도 충돌체는 만들지 않는다.
  let clippedMarkingTriangles = 0, fallbackMarkingTriangles = 0;
  function surfaceTriangles(s0: number, s1: number, n0: number, n1: number) {
    const polygon = [[s0, n0], [s1, n0], [s1, n1], [s0, n1]].map(([s, n]) => point(s, n));
    const bounds = { minX: Math.min(...polygon.map(p => p.x)), maxX: Math.max(...polygon.map(p => p.x)), minZ: Math.min(...polygon.map(p => p.z)), maxZ: Math.max(...polygon.map(p => p.z)) };
    const source = heightAt.roadSurfaceTriangles?.(bounds);
    const result: V[][] = [];
    if (source) {
      for (const face of source) {
        let poly = [0, 3, 6].map(i => new THREE.Vector3(face[i], face[i + 1], face[i + 2]));
        for (const [key, value, sign] of [['s', s0, 1], ['s', s1, -1], ['n', n0, 1], ['n', n1, -1]] as const) {
          const next: V[] = [], distance = (p: V) => (educationParkingProject(p.x, p.z)[key] - value) * sign;
          for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], da = distance(a), db = distance(b); if (da >= -1e-8) next.push(a); if ((da >= -1e-8) !== (db >= -1e-8)) next.push(a.clone().lerp(b, da / (da - db))); }
          poly = next;
        }
        for (let i = 1; i + 1 < poly.length; i++) if (poly[i].clone().sub(poly[0]).cross(poly[i + 1].clone().sub(poly[0])).lengthSq() > 1e-12) result.push([poly[0], poly[i], poly[i + 1]]);
      }
      clippedMarkingTriangles += result.length;
    } else {
      const v = polygon.map(p => p.clone().setY(heightAt(p.x, p.z) - .03));
      result.push([v[0], v[1], v[2]], [v[0], v[2], v[3]]); fallbackMarkingTriangles += 2;
    }
    return result;
  }
  for (let s = 0; s < site.originalRoadLength; s += 1) for (const vertices of surfaceTriangles(s, Math.min(site.originalRoadLength, s + 1), -.065, .065)) decorations.push({ vertices: vertices.map(p => p.clone().addScaledVector(up, .014)) as [V, V, V], color: 0xd8bd55, surface: 'details' });

  // 원본 차도는 s=0에서 끝난다. 그 안쪽 5m 바닥만 별도 부품으로 보충한다.
  const floorComponent = 'education-parking-portal-floor';
  for (let s = -5; s < 0; s += 1.25) for (const face of surfaceTriangles(s, Math.min(0, s + 1.25), -2.75, 2.75)) {
    const top = face.map(p => p.clone().addScaledVector(up, .01));
    prism(floorComponent, top, top.map(p => p.clone().addScaledVector(up, -.14)), 0x303832, { floor: true, floorVertices: top.map(p => p.toArray()) });
  }

  const wallTop = (s: number, side: number) => Math.max(ground(s, side * 3) + .18, uncutGround(s, side) + .12);
  const wallComponents = ['education-parking-retaining-wall', 'education-parking-portal-jamb', 'education-parking-portal-back'];
  for (const side of [-1, 1]) for (let s = -5; s < 45; s += 2.5) {
    const end = Math.min(45, s + 2.5), corners = [[s, side * 3], [end, side * 3], [end, side * 3.3], [s, side * 3.3]];
    const top = corners.map(([u, n]) => point(u, n, wallTop(u, side))), bottom = corners.map(([u, n]) => point(u, n, ground(u, n) - .14));
    const wall = prism('education-parking-retaining-wall', top, bottom, concrete, { wall: true, side, stationRange: [s, end] });
    // 천장 아래의 안쪽 면만 어둡게 표현한다. 외부 옹벽과 실제 충돌 기하는 유지한다.
    if (end <= 0) for (const face of wall.triangles) if (face.vertices.every(v => Math.abs(educationParkingProject(v.x, v.z).n - side * 3) < 1e-6)) face.color = 0x26312a;
    // 221동 기존 현관 앞은 흙받침과 수목을 비워 기존 접근 폭을 보존한다.
    const bankOuter = side < 0 && s < 32.5 && end > 25 ? 4.0 : 4.8;
    const bank = [[s, side * 3.3], [end, side * 3.3], [end, side * bankOuter], [s, side * bankOuter]];
    for (const indices of [[0, 1, 2], [0, 2, 3]]) {
      const points = indices.map(i => bank[i]), a = points.map(([u, n]) => point(u, n, uncutGround(u, side) + .03)), b = points.map(([u, n]) => point(u, n, ground(u, n) - .10));
      prism('education-parking-planted-bank', a, b, soil, { plantingBank: true, side });
    }
  }

  const roofTop = (s: number) => Math.max(ceiling + .42, uncutGround(s, -1), uncutGround(s, 1)) + .08;
  for (const indices of [[0, 1, 2], [0, 2, 3]]) {
    const corners = [[-5, -3.3], [0, -3.3], [0, 3.3], [-5, 3.3]], top = indices.map(i => point(corners[i][0], corners[i][1], roofTop(corners[i][0]))), bottom = indices.map(i => point(corners[i][0], corners[i][1], ceiling));
    const roof = prism('education-parking-portal-roof', top, bottom, concrete, { portalRoof: true, minimumUnderside: ceiling });
    for (const face of roof.triangles) if (face.vertices.every(v => Math.abs(v.y - ceiling) < 1e-6)) face.color = 0x171f1a;
  }
  box('education-parking-portal-back', point(-5, 0, (floor + roofTop(-5)) / 2), new THREE.Vector3(.18, roofTop(-5) - floor, 6.6), 0x101812);
  for (const side of [-1, 1]) box('education-parking-portal-jamb', point(0, side * 3.025, (floor + ceiling) / 2), new THREE.Vector3(.30, ceiling - floor, .55), concrete);
  const header = box('education-parking-portal-header', point(.06, 0, ceiling + .12), new THREE.Vector3(.14, .24, 5.5), 0x303a36);
  for (let n = -2.7; n < 2.7; n += .32) quad(header, point(.135, n, ceiling + .025), point(.135, Math.min(n + .14, 2.75), ceiling + .025), point(.135, Math.min(n + .26, 2.75), ceiling + .215), point(.135, n + .12, ceiling + .215), 0xd2b84b);
  box('education-parking-unreadable-header-board', point(.115, 0, Math.min(roofTop(0) - .7, ceiling + .96)), new THREE.Vector3(.055, 1.08, .82), 0x655a44, axis, up, 'metal', { textObserved: false });

  // 사진 오른쪽인 서측만 수평 난간을 보충한다.
  for (let s = 4; s < 51; s += 2.6) {
    const end = Math.min(51, s + 2.6), y0 = uncutGround(s, 1) + .06, y1 = uncutGround(end, 1) + .06;
    cylinder('education-parking-rail-post', point(s, 3.7, y0 + .48), .045, .96, metal);
    for (const [h, thickness] of [[.30, .035], [.58, .035], [.96, .085]]) beam('education-parking-horizontal-rail', point(s, 3.7, y0 + h), point(end, 3.7, y1 + h), thickness, h > .9 ? 0xc6cbc0 : metal);
  }

  const drainS = 40, drainTop = surfaceTriangles(drainS - .09, drainS + .09, -2.68, 2.68);
  for (const face of drainTop) {
    const top = face.map(p => p.clone().addScaledVector(up, .016)), p = prism('education-parking-transverse-drain', top, top.map(v => v.clone().addScaledVector(up, -.035)), 0x5f6863, { drainageGrating: true });
    // 슬롯은 한 부품에 묶인 표면 무늬다. 별도 구멍이나 깊은 배수로를 주장하지 않는다.
    for (const v of p.triangles) if (v.vertices.every(q => q.y >= Math.min(...top.map(q => q.y)) - .002)) v.color = dark;
  }
  for (let s = 0; s < 44; s += 4) beam('education-parking-side-drain', point(s, 2.87, ground(s, 2.87) + .015), point(s + 4, 2.87, ground(s + 4, 2.87) + .015), .06, 0x5b655e);

  const signS = 42, signN = -3.85, signBase = uncutGround(signS, -1) + .03;
  cylinder('education-parking-height-limit-post', point(signS, signN, signBase + .98), .045, 1.96, metal);
  const signCentre = point(signS, signN, signBase + 1.91), sign = part('education-parking-height-limit-sign', 'metal', { postedHeightLimit: 2.3, text: '2.3m', signOwner: true });
  const face = (x: number, y: number, depth = .028) => signCentre.clone().addScaledVector(across, x).addScaledVector(up, y).addScaledVector(axis, depth);
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI / 12, b = (i + 1) * Math.PI / 12, ring = (angle: number, radius: number, depth = .028) => face(Math.cos(angle) * radius, Math.sin(angle) * radius, depth);
    tri(sign, face(0, 0), ring(a, .36), ring(b, .36), 0xe6e8dc);
    quad(sign, ring(a, .36), ring(a, .41), ring(b, .41), ring(b, .36), 0x313a35);
    quad(sign, ring(a, .41, -.028), ring(a, .41), ring(b, .41), ring(b, .41, -.028), metal);
    tri(sign, face(0, 0, -.028), ring(b, .41, -.028), ring(a, .41, -.028), 0xa7aea5);
  }
  const textRect = (x0: number, x1: number, y0: number, y1: number) => quad(sign, face(x0, y0, .030), face(x1, y0, .030), face(x1, y1, .030), face(x0, y1, .030), 0x293831);
  const digit = (x: number, segments: number[]) => { const rows = [[0, .13, .13, .155], [.11, 0, .135, .145], [.11, -.135, .135, 0], [0, -.155, .13, -.13], [-.005, -.135, .02, 0], [-.005, 0, .02, .145], [0, -.0125, .13, .0125]]; for (const i of segments) { const [a, b, c, d] = rows[i]; textRect(x + a, x + c, b, d); } };
  digit(-.25, [0, 1, 6, 4, 3]); textRect(-.08, -.045, -.15, -.115); digit(0, [0, 1, 6, 2, 3]);
  for (const x of [.18, .23, .28]) textRect(x, x + .018, -.15, -.045); textRect(.18, .298, -.06, -.04);

  const beaconS = 6, beaconN = 3.7, beaconBase = uncutGround(beaconS, 1) + .10;
  cylinder('education-parking-warning-post', point(beaconS, beaconN, beaconBase + .72), .045, 1.44, metal);
  box('education-parking-unreadable-warning-board', point(beaconS, beaconN, beaconBase + 1), new THREE.Vector3(.065, .80, .30), 0x315578, axis, up, 'metal', { textObserved: false });
  cylinder('education-parking-warning-beacon', point(beaconS, beaconN, beaconBase + 1.56), .105, .18, 0xc74735, 'glass');

  const foliage = new THREE.IcosahedronGeometry(1, 1).getAttribute('position');
  for (const [s, side] of [[8, 1], [21, 1], [34, 1], [44, 1], [13, -1], [35, -1], [41, -1]]) {
    const n = side * 4.15, y = uncutGround(s, side) + .05;
    cylinder('education-parking-tree-trunk', point(s, n, y + 1.65), .10, 3.3, 0x796e55, 'stone');
    for (let k = 0; k < 3; k++) {
      const p = part('education-parking-tree-crown', 'stone', { speciesEstimated: true }), c = point(s + (k - 1) * .65, n, y + 3.4 + (k === 1 ? .45 : 0));
      for (let i = 0; i < foliage.count; i += 3) tri(p, ...[0, 1, 2].map(j => { const v = new THREE.Vector3().fromBufferAttribute(foliage, i + j); return c.clone().addScaledVector(axis, v.x * 1.05).addScaledVector(across, v.z * .95).addScaledVector(up, v.y * 1.1); }) as [V, V, V], k === 1 ? 0x647744 : 0x71804b);
    }
  }

  const routePoint = (s: number) => { const p = point(s, 0); return { x: p.x, y: s < 0 ? floor : heightAt(p.x, p.z) - .03 + .01, z: p.z }; };
  return {
    parts, decorations,
    metadata: {
      sourceRoad: site.sourceRoad, sourceParkingNode: site.sourceParkingNode, originalRoadLength: site.originalRoadLength,
      stationOrigin: site.origin, stationAxis: site.axis, stationAcross: site.across,
      correctionStationRange: [site.outer.s0, site.outer.s1], coreStationRange: [site.core.s0, site.core.s1], datumOffset,
      portal: { floorCenter: routePoint(0), outward: { x: axis.x, y: 0, z: axis.z }, clearWidth: 5.5, clearHeight: 2.6, ceilingWorldY: ceiling, postedHeightLimit: 2.3, postedLimitIsMeasuredClearance: false },
      interiorEnd: routePoint(-3.8), routeWorld: [58, 50, 45, 35, 25, 15, 5, 1, 0, -1.5, -3.8].map(routePoint),
      surfaceComponents: [floorComponent], wallComponents, roofComponents: ['education-parking-portal-roof'],
      terrainIsRampCollider: true, renderOnlyRoadMarkings: true, clippedMarkingTriangles, fallbackMarkingTriangles,
      dimensionsEstimated: true, heightsSurveyed: false, originalBuildingOutlineChanged: false, buildingFacadeCut: false,
      shortPortalOnly: true, fullParkingInteriorReproduced: false, highPilotiIsSeparate: true,
      interiorShadeApproximation: true,
      preservedHealthEntranceApproach: { bankSide: -1, stationRange: [25, 32.5], maximumBankLateralExtent: 4.0, estimatedTreeMovedFromStation: 30, estimatedTreeStation: 35 },
      sourcePhotoScope: '2025-07 거리뷰의 하강로, 콘크리트 옹벽, 낮은 포털, 오른쪽 난간과 높이 제한 표지. 정확한 치수와 포털 지도 위치는 게임용 근사다.',
      terrainPreservation: '원본 DEM과 건물 외곽은 보존한다. n=±4.8 경계의 기존 높이를 옹벽과 포털 위 지표의 기준으로 쓴다.',
      visualLimitations: '기존 지형과 연결한 옹벽 및 포털 윗보는 사진보다 높게 보일 수 있다. 안쪽 어두운 색은 사진의 그늘을 단순화한 표현이며 실제 조도나 주차장 전체 깊이를 재현하지 않는다.',
    },
  };
}
