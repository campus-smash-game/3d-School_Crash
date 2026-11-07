import type { LibraryAmenitiesLayout } from './libraryAmenitiesSite';
import type { LibrarySoutheastLayout } from './librarySoutheastSite';
import * as THREE from 'three';
import type { CampusBuilding } from './fullCampus';
import type { BuildingAppearance } from './buildingAppearance';
import type { BreakableSpec } from './scene';

type Surface = { positions: number[]; colors: number[]; geometry?: THREE.BufferGeometry; uvs?: number[]; map?: THREE.Texture };
type Range = { surface: Surface; start: number; end: number; original: Float32Array };
type Part = { proxy: THREE.Mesh; ranges: Range[]; shown: boolean };

// 전체 치수와 패널 단위는 공개 자료의 값이다. 배치와 지지부 치수는 사진과 도면 비례에 따른 근사값이다.
export function createLibraryLandmark(
  scene: THREE.Scene,
  building: CampusBuilding,
  profile: BuildingAppearance,
  heightAt: (x: number, z: number) => number,
) {
  const amenities=scene.getObjectByName('campus-terrain')?.userData.libraryAmenitiesCorrection?.layout as LibraryAmenitiesLayout|undefined;
  const access=amenities?.access??scene.getObjectByName('campus-terrain')?.userData.librarySoutheastCorrection?.layout as LibrarySoutheastLayout|undefined;
  const points = building.points.filter((p, i, all) => i !== all.length - 1 || p[0] !== all[0][0] || p[1] !== all[0][1]);
  let longest = 0, ux = 1, uz = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
    if (length > longest) { longest = length; ux = dx / length; uz = dz / length; }
  }
  if (points.length < 3 || longest < 1) throw new Error('Library footprint must contain a valid building outline.');
  if (ux < 0) { ux = -ux; uz = -uz; }
  const along = points.map(p => p[0] * ux + p[1] * uz);
  const across = points.map(p => -p[0] * uz + p[1] * ux);
  const alongCenter = (Math.min(...along) + Math.max(...along)) / 2;
  // 관정관의 북서쪽이 본관 방향이다. 뒤쪽 경계를 유지하고 폭을 본관 쪽으로 넓힌다.
  const depthCenter = Math.min(...across) + 15;
  const cx = alongCenter * ux - depthCenter * uz, cz = alongCenter * uz + depthCenter * ux;
  // 지도상 본관 외곽점의 평균 중심을 공통 기준층으로 삼는다. 이 좌표는 실측 고도가 아니다.
  // 본관의 실제 배치 높이는 같은 heightAt을 쓰며, 관정관 상부 밑면은 본관 지붕보다 2.25m 높다.
  const mainLibraryAnchor = { x: 322.9407692307692, z: -791.5776923076924 };
  const base = heightAt(mainLibraryAnchor.x, mainLibraryAnchor.z);
  const length = 165, depth = 30, top = 42.75, bridgeBottom = 30.25, supportWidth = 22;
  const orientation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(uz, ux));
  const world = (x: number, y: number, z: number) => new THREE.Vector3(cx + ux * x - uz * z, base + y, cz + uz * x + ux * z);
  const shell = new THREE.Group(); shell.name = `${building.id}:library-landmark`;
  Object.assign(shell.userData, {
    buildingId: building.id, role: 'building-shell', landmark: 'gwanjeong', appearance: profile,
    dimensions: { length, depth, height: top }, localOrigin: { x: cx, y: base, z: cz },
    axis: { x: ux, z: uz }, bridgeBottom, supportWidth, placementEstimated: true,
    elevationReference: { ...mainLibraryAnchor, kind: 'mapped-main-library-centre', surveyed: false },
  });
  scene.add(shell);
  const distant = new THREE.Group(); distant.name = `${building.id}:library-landmark-distant`;
  Object.assign(distant.userData, { buildingId: building.id, role: 'distant-building', landmark: 'gwanjeong' });
  distant.visible = false; scene.add(distant);

  const metal: Surface = { positions: [], colors: [] }, glass: Surface = { positions: [], colors: [] }, railing: Surface = { positions: [], colors: [] };
  const signage:Surface={positions:[],colors:[],uvs:[]};
  const surfaces = [metal, glass, railing, signage], parts: Part[] = [], breakables: BreakableSpec[] = [];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const proxyMaterials = {
    glass: new THREE.MeshStandardMaterial({ color: profile.glassColor }),
    metal: new THREE.MeshStandardMaterial({ color: profile.wallColor }),
    stone: new THREE.MeshStandardMaterial({ color: 0x737a74 }),
  };
  const metalColors = [profile.wallColor, 0xc5bda9, 0xb4ad9c, 0xd0c6b0];
  const glassColors = [profile.glassColor, 0x728d95, 0x526d78];
  function vertex(surface: Surface, p: THREE.Vector3, color: THREE.Color) {
    surface.positions.push(p.x, p.y, p.z); surface.colors.push(color.r, color.g, color.b);
  }
  function quad(surface: Surface, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, hex: number) {
    const color = new THREE.Color(hex);
    for (const p of [a, b, c, a, c, d]) vertex(surface, p, color);
  }
  function box(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number) {
    const v = (a: number, b: number, c: number) => world(x + a * sx / 2, y + b * sy / 2, z + c * sz / 2);
    for (const side of [-1, 1]) {
      quad(metal, v(-1, -1, side), v(1, -1, side), v(1, 1, side), v(-1, 1, side), color);
      quad(metal, v(side, -1, -1), v(side, -1, 1), v(side, 1, 1), v(side, 1, -1), color);
      quad(metal, v(-1, side, -1), v(1, side, -1), v(1, side, 1), v(-1, side, 1), color);
    }
  }
  function component(x: number, y: number, z: number, sx: number, sy: number, sz: number, kind: keyof typeof proxyMaterials, name: string, draw: () => void) {
    const proxy = new THREE.Mesh(cube, proxyMaterials[kind]);
    proxy.position.copy(world(x, y, z)); proxy.quaternion.copy(orientation);
    // 회전된 인접 충돌체의 반올림 오차로 이음부 광선이 통과하지 않도록 2cm 겹친다.
    proxy.scale.set(sx + .02, sy + .02, sz + .02);
    Object.assign(proxy.userData, { buildingId: building.id, renderProxy: true, landmark: 'gwanjeong', component: name });
    proxy.updateMatrix(); proxy.updateMatrixWorld(true);
    const starts = surfaces.map(surface => surface.positions.length); draw();
    const ranges = surfaces.map((surface, i) => ({ surface, start: starts[i], end: surface.positions.length, original: new Float32Array(surface.positions.slice(starts[i])) }));
    parts.push({ proxy, ranges, shown: true });
    breakables.push({ mesh: proxy, size: proxy.scale.clone(), toughness: kind === 'glass' ? 7 : 11, label: building.name, material: kind });
  }
  // 유리와 금속판은 사진을 붙이지 않고 1.25×2.5m 격자와 12.5도 접힘을 직접 만든다.
  function facade(horizontal: boolean, plane: number, side: number, a0: number, a1: number, y0: number, y1: number) {
    const point = (a: number, y: number, protrusion: number) => horizontal ? world(a, y, plane + side * protrusion) : world(plane + side * protrusion, y, a);
    const cellW = 1.25, cellH = 2.5, fold = Math.tan(THREE.MathUtils.degToRad(12.5));
    for (let row = Math.floor(y0 / cellH); row < Math.ceil(y1 / cellH); row++) {
      const bottom = Math.max(y0, row * cellH), upper = Math.min(y1, (row + 1) * cellH);
      for (let col = Math.floor(a0 / cellW); col < Math.ceil(a1 / cellW); col++) {
        const left = Math.max(a0, col * cellW), right = Math.min(a1, (col + 1) * cellW);
        if (right - left < .02 || upper - bottom < .02) continue;
        const glazing = (row + col) % 2 === 0;
        const colors = glazing ? glassColors : metalColors;
        const color = colors[Math.abs(col * 7 + row * 3) % colors.length];
        const p0 = .04 + (left - col * cellW) * fold, p1 = .04 + (right - col * cellW) * fold;
        quad(glazing ? glass : metal, point(left + .025, bottom + .025, p0), point(right - .025, bottom + .025, p1), point(right - .025, upper - .025, p1), point(left + .025, upper - .025, p0), color);
        // 접힌 판 사이의 좁은 면을 닫아 가까이서도 빈 틈이 과하게 보이지 않게 한다.
        quad(metal, point(right, bottom, 0), point(right, bottom, p1), point(right, upper, p1), point(right, upper, 0), profile.frameColor);
      }
    }
    quad(metal, point(a0, y0, -.035), point(a1, y0, -.035), point(a1, y1, -.035), point(a0, y1, -.035), 0x414c4e);
  }
  function wall(horizontal: boolean, plane: number, side: number, a0: number, a1: number, y0: number, y1: number, name: string) {
    const mid = (a0 + a1) / 2, x = horizontal ? mid : plane, z = horizontal ? plane : mid;
    component(x, (y0 + y1) / 2, z, horizontal ? a1 - a0 : .72, y1 - y0, horizontal ? .72 : a1 - a0, 'glass', name, () => facade(horizontal, plane, side, a0, a1, y0, y1));
  }
  const upperBands = [bridgeBottom, 37.75, top];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 11; i++) for (let floor = 0; floor < 2; floor++) {
      wall(true, side * depth / 2, side, -length / 2 + i * 15, -length / 2 + (i + 1) * 15, upperBands[floor], upperBands[floor + 1], 'bridge-facade');
    }
    for (let i = 0; i < 2; i++) for (let floor = 0; floor < 2; floor++) {
      wall(false, side * length / 2, side, -depth / 2 + i * 15, -depth / 2 + (i + 1) * 15, upperBands[floor], upperBands[floor + 1], 'bridge-end');
    }
  }
  for (const end of [-1, 1]) {
    const endWidth=access&&end<0?18.5:supportWidth;
    const x0 = end < 0 ? -length / 2 : length / 2 - endWidth, x1 = x0 + endWidth;
    const foundation = Math.min(...[x0, x1].flatMap(x => [-depth / 2, depth / 2].map(z => { const p = world(x, 0, z); return heightAt(p.x, p.z) - base; }))) - .45;
    const bands = [foundation, 7.5, 15, 22.5, bridgeBottom].filter((y, i, all) => i === 0 || y > all[0] + .1);
    for (let floor = 0; floor < bands.length - 1; floor++) for (const side of [-1, 1]) for (let i = 0; i < 2; i++) {
      wall(true, side * depth / 2, side, x0 + i * endWidth / 2, x0 + (i + 1) * endWidth / 2, bands[floor], bands[floor + 1], 'support-facade');
      wall(false, side < 0 ? x0 : x1, side, -depth / 2 + i * 15, -depth / 2 + (i + 1) * 15, bands[floor], bands[floor + 1], 'support-side');
    }
    component((x0 + x1) / 2, foundation + .25, 0, endWidth, .5, depth, 'stone', 'support-base', () => box((x0 + x1) / 2, foundation + .25, 0, endWidth, .5, depth, 0x737a74));
  }
  // 지붕과 상부 구조의 밑면도 나누어 파괴와 초기화 때 벽과 함께 갱신한다.
  for (let i = 0; i < 11; i++) for (let row = 0; row < 2; row++) {
    const x = -length / 2 + (i + .5) * 15, z = -depth / 2 + (row + .5) * 15;
    component(x, top - .2, z, 15, .4, 15, 'metal', 'bridge-roof', () => box(x, top - .2, z, 15, .4, 15, profile.roofColor));
    component(x, bridgeBottom + .22, z, 15, .44, 15, 'metal', 'bridge-soffit', () => box(x, bridgeBottom + .22, z, 15, .44, 15, 0x747a73));
  }
  createSoutheastSite();

  // 2026년 7월 남동측 로드뷰에서 확인한 배면 몸체와 계단만 추가한다.
  // 상층 치수와 본관 공통 기준고는 유지하며, 보행층 높이와 세부 폭은 게임용 근사다.
  function createSoutheastSite() {
    const terrain = (x: number, z: number) => { const p = world(x, 0, z); return heightAt(p.x, p.z) - base; };
    const stairX=access?.stairX??-51.2,width=6,lowerStartZ=access?.lowerStart??-40.5,lowerEndZ=access?.lowerEnd??-38.9,mainStartZ=access?.mainStart??-30.6,mainEndZ=access?.mainEnd??-22.5;
    const firstFloor = access ? access.firstFloor-base : Math.max(...Array.from({ length: 13 }, (_, i) => terrain(stairX - width / 2 + i * width / 12, lowerStartZ))) + .10;
    const landingFloor = firstFloor + .68, terraceFloor = landingFloor + 3.06;
    const voidCeiling=access?29.4:28.3,glazingBottom=access?29.5:28.75,terraceFrontZ=access?.terraceFront??-21,terraceBackZ=amenities?.roof.back??-2;
    if (terraceFloor + 2.3 > voidCeiling) throw new Error('Library southeast terrace has insufficient clearance below the retained upper mass.');
    const metadata = {
      sourceDate: '2026-07', dimensionsEstimated: true, surveyed: false,
      photographedFace: 'southeast', localCoordinates: 'x follows the existing library axis; negative z faces southeast',
      terrace: { minX: amenities?.roof.minX??-60.5, maxX: amenities?.roof.maxX??60.5, frontZ: terraceFrontZ, backZ: terraceBackZ, floor: terraceFloor },
      openBay: { minX: access?-13.2:-54.2, maxX: 48, frontZ: -15, backZ: -2, floor: terraceFloor, ceiling: voidCeiling },
      stairs: { x: stairX, width, lowerStartZ, lowerEndZ, lowerSteps: 4, firstFloor, landingFloor, mainStartZ, mainEndZ, mainSteps: 18, top: terraceFloor },
      approach: { x: stairX, startZ: access?.approachStart??-41.6, endZ: lowerStartZ, width, sourceRoad: 'way/457001557/376', sourceSteps: access?null:'way/167597860/23' },
      gate: { x: stairX, z: amenities?-30.65:access?-20.45:-21.7, width: 6, height: 1.18, floor: terraceFloor, initiallyClosed: true, permanentAccessVerified: false },
      cafeDoor: { x: -57.25, z: -14.85, floor: terraceFloor, width: 3.3, height: 2.65, implemented:!access },
      correctedStairAlignment:!!access,upperStairDestination:access?'amenity-roof-terrace':'legacy-cafe-terrace',southwestSupportWidth:access?18.5:22,
      mainLibraryConnectionVerified: false,
      sourceUrls: ['https://kko.to/KD6aVfZMaS', 'https://kko.to/31Rtajq3u8', 'https://kko.to/qAyahwe_1x'],
    };
    shell.userData.southeastSite = metadata;
    const up = new THREE.Vector3(0, 1, 0), axis = new THREE.Vector3(ux, 0, uz), across = new THREE.Vector3(-uz, 0, ux);
    const unit = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
    function append(geometry: THREE.BufferGeometry, surface: Surface, kind: keyof typeof proxyMaterials, name: string, color: number, extra: Record<string, unknown> = {}) {
      const p = geometry.getAttribute('position'), start = surface.positions.length, tint = new THREE.Color(color);
      geometry.computeBoundingBox(); const center = geometry.boundingBox!.getCenter(new THREE.Vector3()), size = geometry.boundingBox!.getSize(new THREE.Vector3());
      for (let i = 0; i < p.count; i++) { surface.positions.push(p.getX(i), p.getY(i), p.getZ(i)); surface.colors.push(tint.r, tint.g, tint.b); }
      const collision = geometry.clone().translate(-center.x, -center.y, -center.z), collisionVertices = Float32Array.from(collision.getAttribute('position').array);
      const proxy = new THREE.Mesh(collision, proxyMaterials[kind]); proxy.position.copy(center);
      Object.assign(proxy.userData, { buildingId: building.id, renderProxy: true, landmark: 'gwanjeong', component: name, southeastSite: true, ...extra }); proxy.updateMatrixWorld(true);
      parts.push({ proxy, shown: true, ranges: [{ surface, start, end: surface.positions.length, original: Float32Array.from(surface.positions.slice(start)) }] });
      breakables.push({ mesh: proxy, size, collisionVertices, toughness: kind === 'glass' ? 6 : 12, label: `${building.name} 남동측 ${name.includes('gate') ? '격자문' : '구조'}`, material: kind }); geometry.dispose();
    }
    function block(x: number, y: number, z: number, sx: number, sy: number, sz: number, name: string, color = 0x858c86, surface = metal, kind: keyof typeof proxyMaterials = 'stone') {
      const m = new THREE.Matrix4().makeBasis(axis, up, across).scale(new THREE.Vector3(sx, sy, sz)); m.setPosition(world(x, y, z)); append(unit.clone().applyMatrix4(m), surface, kind, name, color);
      if(access&&(name==='southeast-stone-pier'||name==='descending-stone-sidewall')){
        const start=metal.positions.length,lo=y-sy/2,hi=y+sy/2;
        if(name==='southeast-stone-pier'){
          for(let h=Math.ceil(lo/1.2)*1.2;h<hi;h+=1.2)quad(metal,world(x-sx/2,h,z-sz/2-.003),world(x+sx/2,h,z-sz/2-.003),world(x+sx/2,h+.012,z-sz/2-.003),world(x-sx/2,h+.012,z-sz/2-.003),0x687568);
          for(let a=Math.ceil((x-sx/2)/2.4)*2.4;a<x+sx/2;a+=2.4)quad(metal,world(a,lo,z-sz/2-.003),world(a+.012,lo,z-sz/2-.003),world(a+.012,hi,z-sz/2-.003),world(a,hi,z-sz/2-.003),0x748071);
        }else{
          for(let h=Math.ceil(lo/1.2)*1.2;h<hi;h+=1.2)quad(metal,world(x-sx/2-.003,h,z-sz/2),world(x-sx/2-.003,h,z+sz/2),world(x-sx/2-.003,h+.012,z+sz/2),world(x-sx/2-.003,h+.012,z-sz/2),0x687568);
        }
        parts.at(-1)!.ranges.push({surface:metal,start,end:metal.positions.length,original:Float32Array.from(metal.positions.slice(start))});
      }
    }
    function beam(a: THREE.Vector3, b: THREE.Vector3, thickness: number, name: string, color = 0xd3d8d1) {
      const delta = b.clone().sub(a), ex = delta.clone().normalize(), ey = up.clone().addScaledVector(ex, -up.dot(ex));
      if (ey.lengthSq() < 1e-8) ey.copy(axis); ey.normalize(); const ez = new THREE.Vector3().crossVectors(ex, ey).normalize();
      const m = new THREE.Matrix4().makeBasis(ex, ey, ez).scale(new THREE.Vector3(delta.length(), thickness, thickness)); m.setPosition(a.clone().add(b).multiplyScalar(.5)); append(unit.clone().applyMatrix4(m), metal, 'metal', name, color);
    }
    function prism(top: THREE.Vector3[], thickness: number, name: string) {
      if (top[1].clone().sub(top[0]).cross(top[2].clone().sub(top[0])).y < 0) top = [top[0], top[2], top[1]];
      const bottom = top.map(p => p.clone().addScaledVector(up, -thickness)), values: number[] = [];
      const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => values.push(...a.toArray(), ...b.toArray(), ...c.toArray());
      tri(top[0], top[1], top[2]); tri(bottom[0], bottom[2], bottom[1]);
      for (let i = 0; i < 3; i++) { const j = (i + 1) % 3; tri(top[i], bottom[i], bottom[j]); tri(top[i], bottom[j], top[j]); }
      append(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(values, 3)), metal, 'stone', name, 0xb8b6a6);
    }
    function tile(x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, name: string, thickness = .22) {
      const p = [world(x0, y0, z0), world(x1, y0, z0), world(x1, y1, z1), world(x0, y1, z1)]; prism([p[0], p[1], p[2]], thickness, name); prism([p[0], p[2], p[3]], thickness, name);
    }
    // 정차 차도는 덮지 않는다. 차도 북서쪽 가장자리에서 시작하는 얇은 접속판만 지면을 따른다.
    for (let j = 0; j < 6; j++) {
      const x0 = stairX - 3 + j, x1 = x0 + 1, z0 = metadata.approach.startZ, z1 = lowerStartZ;
      const p = [world(x0, terrain(x0, z0) + .035, z0), world(x1, terrain(x1, z0) + .035, z0), world(x1, firstFloor, z1), world(x0, firstFloor, z1)];
      prism([p[0], p[1], p[2]], .14, 'southeast-ground-connection'); prism([p[0], p[2], p[3]], .14, 'southeast-ground-connection');
    }
    function stairs(z0: number, z1: number, y0: number, y1: number, count: number, name: string) {
      for (let i = 0; i < count; i++) { const lo = THREE.MathUtils.lerp(z0, z1, i / count), hi = THREE.MathUtils.lerp(z0, z1, (i + 1) / count), y = THREE.MathUtils.lerp(y0, y1, (i + 1) / count); tile(stairX - 3, stairX + 3, lo, hi, y, y, name, .24); }
    }
    stairs(lowerStartZ, lowerEndZ, firstFloor, landingFloor, 4, 'southeast-lower-step');
    for (let z = lowerEndZ; z < mainStartZ - .01; z += 2) tile(stairX - 3.4, stairX + 3.4, z, Math.min(z + 2, mainStartZ), landingFloor, landingFloor, 'southeast-paved-landing');
    stairs(mainStartZ, mainEndZ, landingFloor, terraceFloor, 18, 'southeast-main-step');
    tile(stairX - 3, stairX + 3, mainEndZ, terraceFrontZ, terraceFloor, terraceFloor, 'southeast-top-landing');
    if(amenities){createAmenities(amenities);createDescendingAccess(access!);unit.dispose();return;}
    for (let x = -60.5; x < 60.49; x += 6) for (let z = terraceFrontZ; z < terraceBackZ - .01; z += 4) tile(x, Math.min(x + 6, 60.5), z, Math.min(z + 4, terraceBackZ), terraceFloor, terraceFloor, 'southeast-terrace-floor');
    // 로드뷰의 테라스 아래 기단은 남동쪽 앞면의 얇은 띠로만 닫는다.
    // 현재 DEM과 보행층 차이로 실사진보다 높은 부분이 남으며, 내부 전체를 채우지는 않는다.
    let maximumPlinthExposure = 0;
    for (let x = -60.5; x < 60.49; x += 4) {
      if(access&&x< -48.5&&x+4> -57)continue;
      const end = Math.min(x + 4, 60.5), samples = Array.from({ length: 9 }, (_, i) => terrain(THREE.MathUtils.lerp(x, end, i / 8), terraceFrontZ));
      const bottom = Math.min(...samples) - .22, top = terraceFloor - .22;
      maximumPlinthExposure = Math.max(maximumPlinthExposure, top - Math.min(...samples));
      for (let y = bottom; y < top - .01; y += 2.5) block((x + end) / 2, (y + Math.min(y + 2.5, top)) / 2, terraceFrontZ + .22, end - x, Math.min(y + 2.5, top) - y, .44, 'southeast-retaining-plinth', 0x818981);
    }
    Object.assign(metadata, { retainingPlinth: { frontZ: terraceFrontZ, thickness: .44, maximumExposure: maximumPlinthExposure, gameTerrainMismatch: true } });
    // 개방부 양옆과 위쪽 보를 분리한다. 큰 상자 하나로 테라스 빈 공간을 막지 않는다.
    if(access){
      for(const[lo,hi]of[[-46,-13.2],[48,60.5]]){
        const bottom=Math.min(terrain(lo,-15),terrain(hi,-15))-.3;
        const cuts=lo<0?[lo,-41.5,-32.5,hi]:[lo,hi];
        for(let i=1;i<cuts.length;i++){const a=cuts[i-1],b=cuts[i],opening=lo<0&&a===-41.5;
          if(opening){
            block((a+b)/2,(bottom+landingFloor)/2,-14.6,b-a,landingFloor-bottom,.55,'southeast-stone-pier');
            block((a+b)/2,(landingFloor+2.65+voidCeiling)/2,-14.6,b-a,voidCeiling-landingFloor-2.65,.55,'southeast-stone-pier');
            block((a+b)/2,landingFloor+1.325,-14.85,b-a,2.65,.06,'southeast-recessed-glazing',0x556c6c,glass,'glass');
            for(let x=a;x<=b;x+=1.5)block(x,landingFloor+1.325,-14.91,.07,2.65,.1,'southeast-glazing-frame',0xaeb6ab,metal,'metal');
          }else block((a+b)/2,(bottom+voidCeiling)/2,-14.6,b-a,voidCeiling-bottom,.55,'southeast-stone-pier');
        }
      }
    }else{
    for (const [lo, hi] of [[-60.5, -54.2], [48, 60.5]]) {
      const door = lo < 0, bottom = Math.min(...[lo, hi].map(x => terrain(x, -15))) - .3;
      for (let y = bottom; y < terraceFloor - .01; y += 3) block((lo + hi) / 2, (y + Math.min(y + 3, terraceFloor)) / 2, -14.6, hi - lo, Math.min(y + 3, terraceFloor) - y, .55, 'southeast-stone-pier');
      if (door) {
        const d = metadata.cafeDoor;
        for (const [a, b] of [[lo, d.x - d.width / 2], [d.x + d.width / 2, hi]]) block((a + b) / 2, (terraceFloor + voidCeiling) / 2, -14.6, b - a, voidCeiling - terraceFloor, .55, 'southeast-cafe-side');
        block(d.x, terraceFloor + d.height / 2, d.z, d.width, d.height, .06, 'southeast-cafe-door', 0x91b0ad, glass, 'glass');
        block(d.x, (terraceFloor + d.height + voidCeiling) / 2, -14.6, d.width, voidCeiling - terraceFloor - d.height, .55, 'southeast-cafe-lintel');
      } else block((lo + hi) / 2, (terraceFloor + voidCeiling) / 2, -14.6, hi - lo, voidCeiling - terraceFloor, .55, 'southeast-stone-pier');
    }
    }
    for (let x = -60.5; x < 60.49; x += 6) {
      const end = Math.min(x + 6, 60.5), mid = (x + end) / 2;
      block(mid, (voidCeiling + glazingBottom) / 2, -8.5, end - x, glazingBottom - voidCeiling, 13, 'southeast-open-bay-beam');
      block(mid, (glazingBottom + bridgeBottom) / 2, -14.83, end - x - .07, bridgeBottom - glazingBottom - .05, .05, 'southeast-upper-dark-glass', 0x41565b, glass, 'glass');
      block(x, (glazingBottom + bridgeBottom) / 2, -14.85, .065, bridgeBottom - glazingBottom, .09, 'southeast-glass-mullion', 0x303d40, metal, 'metal');
    }
    function rail(x0: number, x1: number, z: number) {
      const count = Math.ceil((x1 - x0) / 2.1);
      for (let i = 0; i < count; i++) { const a = THREE.MathUtils.lerp(x0, x1, i / count), b = THREE.MathUtils.lerp(x0, x1, (i + 1) / count); block((a + b) / 2, terraceFloor + .6, z, b - a - .04, 1.12, .028, 'southeast-glass-balustrade', 0xb6cecd, railing, 'glass'); beam(world(a, terraceFloor + 1.2, z), world(b, terraceFloor + 1.2, z), .055, 'southeast-rail-cap'); block(a, terraceFloor + .6, z, .055, 1.2, .055, 'southeast-rail-post', 0xaeb8b5, metal, 'metal'); }
    }
    rail(-60.5, stairX - 3.15, terraceFrontZ); rail(stairX + 3.15, 60.5, terraceFrontZ);
    for (const x of [stairX - 3.1, stairX + 3.1]) { beam(world(x, landingFloor + 1.1, mainStartZ), world(x, terraceFloor + 1.1, mainEndZ), .065, 'southeast-stair-handrail'); for (let i = 0; i <= 6; i++) { const k = i / 6, z = THREE.MathUtils.lerp(mainStartZ, mainEndZ, k), y = THREE.MathUtils.lerp(landingFloor, terraceFloor, k); beam(world(x, y, z), world(x, y + 1.1, z), .06, 'southeast-stair-post'); } }
    // 사진 속 격자문은 닫힌 상태로 둔다. 부재 사이 빈틈을 큰 충돌 상자로 채우지 않는다.
    for (let i = 0; i < 12; i++) { const x = stairX - 3 + i * .5, z = metadata.gate.z, y = terraceFloor; beam(world(x, y + .06, z), world(x + .5, y + 1.18, z), .055, 'southeast-folding-gate'); beam(world(x + .5, y + .06, z), world(x, y + 1.18, z), .055, 'southeast-folding-gate'); }
    if(access)createDescendingAccess(access);
    function createAmenities(q:LibraryAmenitiesLayout){
      const floor=q.courtFloor-base,roof=terraceFloor,middle=(floor+roof)/2;
      const masks:{component:string;polygon:[number,number][]}[]=[];
      const ownDecor=(draw:()=>void)=>{const start=metal.positions.length;draw();parts.at(-1)!.ranges.push({surface:metal,start,end:metal.positions.length,original:Float32Array.from(metal.positions.slice(start))});};
      function pavement(x0:number,x1:number,z0:number,z1:number,y:number,name:string){
        tile(x0,x1,z0,z1,y,y,name);
        masks.push({component:name,polygon:[[x0,z0],[x1,z0],[x1,z1],[x0,z1]].map(([x,z])=>{const p=world(x,0,z);return[p.x,p.z];})});
        ownDecor(()=>{
          for(let x=Math.ceil(x0/.8)*.8;x<x1-.1;x+=.8)for(let z=Math.ceil(z0/.4)*.4;z<z1-.1;z+=.4){const hash=Math.abs(Math.round(x*10)*17+Math.round(z*10)*31);if(hash%5!==0)continue;const a=Math.min(x+.78,x1),b=Math.min(z+.38,z1);quad(metal,world(x+.01,y+.002,z+.01),world(a,y+.002,z+.01),world(a,y+.002,b),world(x+.01,y+.002,b),hash%2?0xaaa99a:0xc0beb0);}
          for(let x=Math.ceil(x0/.8)*.8;x<x1;x+=.8)quad(metal,world(x,y+.004,z0),world(x+.012,y+.004,z0),world(x+.012,y+.004,z1),world(x,y+.004,z1),0x8d938c);
          for(let z=Math.ceil(z0/.4)*.4;z<z1;z+=.4)quad(metal,world(x0,y+.004,z),world(x1,y+.004,z),world(x1,y+.004,z+.012),world(x0,y+.004,z+.012),0x959b94);
        });
      }
      for(let x=q.court.minX;x<q.court.maxX;x+=6)pavement(x,Math.min(x+6,q.court.maxX),q.court.front,q.court.back,floor,'amenity-courtyard-paving');
      for(let x=q.roof.minX;x<q.roof.maxX;x+=6)for(let z=q.roof.front;z<q.roof.back;z+=3)pavement(x,Math.min(x+6,q.roof.maxX),z,Math.min(z+3,q.roof.back),roof,'amenity-roof-paving');
      pavement(q.bridge.minX,q.bridge.maxX,q.bridge.front,q.bridge.back,roof,'amenity-central-bridge');
      const ep=q.east.frame,ends=[ep.point(0,-2.4),ep.point(ep.length,-2.4),ep.point(ep.length,2.4),ep.point(0,2.4)],ev=ends.map((p,i)=>new THREE.Vector3(p[0],i===0||i===3?q.east.y0:q.east.y1,p[1]));
      prism([ev[0],ev[1],ev[2]],.24,'amenity-east-approach');prism([ev[0],ev[2],ev[3]],.24,'amenity-east-approach');masks.push({component:'amenity-east-approach',polygon:ends});
      // 편의시설의 지붕과 본체 사이를 비워 보행로 위로 하늘이 보이게 한다.
      function guard(a:THREE.Vector3,b:THREE.Vector3,name:string){
        const length=a.distanceTo(b),count=Math.ceil(length/2.2);
        for(let i=0;i<count;i++){
          const p=a.clone().lerp(b,i/count),r=a.clone().lerp(b,(i+1)/count),delta=r.clone().sub(p),along=delta.clone().normalize(),normal=new THREE.Vector3().crossVectors(along,up).normalize();
          const m=new THREE.Matrix4().makeBasis(along,up,normal).scale(new THREE.Vector3(delta.length()-.025,1.1,.035));m.setPosition(p.clone().add(r).multiplyScalar(.5).addScaledVector(up,.57));
          append(unit.clone().applyMatrix4(m),railing,'glass',name,0xc0d2cf);
          ownDecor(()=>{quad(metal,p.clone().addScaledVector(up,1.13),r.clone().addScaledVector(up,1.13),r.clone().addScaledVector(up,1.18),p.clone().addScaledVector(up,1.18),0xbfc6bc);});
        }
      }
      for(const[a,b]of[[q.roof.minX,stairX-3.1],[stairX+3.1,q.roof.maxX]])guard(world(a,roof,q.roof.front),world(b,roof,q.roof.front),'amenity-roof-glass-guard');
      for(const[a,b]of[[q.roof.minX,q.bridge.minX],[q.bridge.maxX,q.roof.maxX]])guard(world(a,roof,q.roof.back),world(b,roof,q.roof.back),'amenity-roof-glass-guard');
      for(const x of[q.roof.minX,q.roof.maxX])guard(world(x,roof,q.roof.front),world(x,roof,q.roof.back),'amenity-roof-glass-guard');
      for(const x of[q.bridge.minX,q.bridge.maxX])guard(world(x,roof,q.bridge.front),world(x,roof,q.bridge.back),'amenity-bridge-glass-guard');
      for(const x of[stairX-3.1,stairX+3.1]){beam(world(x,landingFloor+1.1,mainStartZ),world(x,roof+1.1,mainEndZ),.065,'southeast-stair-handrail');for(let i=0;i<=6;i++){const t=i/6,z=THREE.MathUtils.lerp(mainStartZ,mainEndZ,t),y=THREE.MathUtils.lerp(landingFloor,roof,t);beam(world(x,y,z),world(x,y+1.1,z),.06,'southeast-stair-post');}}
      for(let i=0;i<12;i++){const x=stairX-3+i*.5,z=metadata.gate.z;beam(world(x,roof+.06,z),world(x+.5,roof+1.18,z),.055,'southeast-folding-gate');beam(world(x+.5,roof+.06,z),world(x,roof+1.18,z),.055,'southeast-folding-gate');}
      // 점포 안쪽은 출입문 뒤의 얕은 공간만 만든다. 확인하지 못한 내부 평면은 확장하지 않는다.
      const shops=[{name:'롯데관광',x:-37,w:11,color:'#ffffff',bg:'#183b66',awning:0x254966},{name:'CAFFÈ PASCUCCI',x:-17,w:21,color:'#b72425',bg:'#9a9e92',awning:0xa92828},{name:'PARIS BAGUETTE',x:6,w:19,color:'#ffffff',bg:'#20394c',awning:0x20394c},{name:'休김밥',x:29,w:13,color:'#f3f4df',bg:'#465a42',awning:0x34483d},{name:'CU',x:45,w:12,color:'#96cc43',bg:'#664593',awning:0x664593}];
      for(let x=q.roof.minX;x<q.roof.maxX;x+=4){const end=Math.min(x+4,q.roof.maxX),mid=(x+end)/2,bottom=Math.min(floor-.2,terrain(mid,q.roof.front)-.3);
        block(mid,(bottom+roof)/2,q.roof.front+.2,end-x,roof-bottom,.4,'amenity-outer-stone-wall',0x858980);
        block(mid,middle,q.roof.back-.12,end-x,.32,.24,'amenity-floor-band',0x727b73);
        block(mid,(middle+roof)/2,q.roof.back-.12,end-x-.08,roof-middle-.16,.07,'amenity-upper-strip-glazing',0x536761,glass,'glass');
        block(mid,middle+.6,q.roof.back-.05,end-x,1.2,.18,'amenity-upper-stone-spandrel',0x69756c);
        const mullionBottom=shops.some(s=>Math.abs(s.x-x)<1.3)?floor+2.85:floor;block(x,(mullionBottom+roof)/2,q.roof.back,.07,roof-mullionBottom,.12,'amenity-mullion',0xb2b8af,metal,'metal');
        const cuts=[x,end,...shops.flatMap(s=>[s.x-1.3,s.x+1.3]).filter(v=>v>x&&v<end)].sort((a,b)=>a-b);
        for(let j=1;j<cuts.length;j++){const a=cuts[j-1],b=cuts[j],center=(a+b)/2;if(shops.some(s=>Math.abs(center-s.x)<1.3))continue;block(center,floor+1.62,q.roof.back-.1,b-a-.02,3,.065,'amenity-shop-glazing',0x6c8982,glass,'glass');}
        block(mid,floor+3.45,q.roof.back-.04,end-x,.55,.2,'amenity-sign-band',0x606d62);
      }
      for(const x of[q.roof.minX,q.roof.maxX])block(x,(floor+roof)/2,(q.roof.front+q.roof.back)/2,.3,roof-floor,q.roof.back-q.roof.front,'amenity-side-stone-wall',0x7d867a);

      const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=512;const ctx=canvas.getContext('2d')!;
      for(let i=0;i<shops.length;i++){const shop=shops[i],y=i*100;ctx.fillStyle=shop.bg;ctx.fillRect(0,y,2048,100);ctx.fillStyle=shop.color;ctx.font='600 68px "Malgun Gothic", sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(shop.name,1024,y+50,1960);}
      signage.map=new THREE.CanvasTexture(canvas);signage.map.colorSpace=THREE.SRGBColorSpace;
      for(let i=0;i<shops.length;i++){const shop=shops[i],x=shop.x,doorX=x,z=q.roof.back+.08;
        block(x,floor+3.2,z+.48,Math.min(shop.w,8),.15,1,'amenity-shop-awning',shop.awning,metal,'metal');
        const owner=parts.at(-1)!,start=signage.positions.length,p=[world(x-shop.w/2,floor+3.3,z+.04),world(x+shop.w/2,floor+3.3,z+.04),world(x+shop.w/2,floor+3.94,z+.04),world(x-shop.w/2,floor+3.94,z+.04)];
        // 보행로에서 남동쪽을 볼 때 글자 왼쪽은 로컬 x의 양수 쪽이다.
        quad(signage,p[1],p[0],p[3],p[2],0xffffff);const v0=1-(i*100+100)/512,v1=1-i*100/512;signage.uvs!.push(0,v0,1,v0,1,v1,0,v0,1,v1,0,v1);
        owner.ranges.push({surface:signage,start,end:signage.positions.length,original:Float32Array.from(signage.positions.slice(start))});
        // 문 앞 유리판도 개별 파괴할 수 있고 문틀은 별도 구조로 남는다.
        for(const side of[-1,1]){block(doorX+side*.62,floor+1.45,z+.055,1.21,2.6,.07,'amenity-shop-door',0x8aa59a,glass,'glass');beam(world(doorX+side*.08,floor+.95,z+.13),world(doorX+side*.08,floor+1.7,z+.13),.045,'amenity-door-pull',0xd2d4c8);block(doorX+side*1.28,floor+1.5,z+.08,.06,2.8,.09,'amenity-door-frame',0xb9bfb3,metal,'metal');}
        tile(doorX-1.4,doorX+1.4,z+.15,z+1.7,floor+.15,floor,'amenity-entry-ramp',.08);
        for(const side of[-1,1]){const rx=doorX+side*1.46;beam(world(rx,floor+1,z+.15),world(rx,floor+.85,z+1.7),.05,'amenity-ramp-handrail',0x29382d);for(const rz of[z+.15,z+1.7])beam(world(rx,floor+.06,rz),world(rx,floor+.92,rz),.05,'amenity-ramp-post',0x29382d);}
        pavement(doorX-1.5,doorX+1.5,-24.3,q.roof.back,floor+.15,'amenity-shop-vestibule-floor');
        block(doorX,floor+1.5,-24.3,3,3,.15,'amenity-shop-vestibule-back',0x4e6054);
      }
      // 본체의 남동쪽 벽과 출입문을 분리해 통로와 연결교를 막지 않는다.
      const cuts=[-52.2,-51.8,-48.2,-30,-12,-8,12,36,60.5];
      for(let i=1;i<cuts.length;i++){const a=cuts[i-1],b=cuts[i],x=(a+b)/2,isLower=a===-51.8,isUpper=a===-12,bottom=Math.min(floor-.3,terrain(x,-10)-.3);
        const spans=isLower?[[bottom,floor+.32],[floor+3.1,bridgeBottom]]:isUpper?[[bottom,roof],[roof+2.7,bridgeBottom]]:[[bottom,a>=-8?floor+.7:bridgeBottom],...(a>=-8?[[floor+3.5,floor+4.3],[floor+7.5,bridgeBottom]]:[])];
        if(a>=-8)for(let x=a;x<b;x+=4){const end=Math.min(x+4,b);for(const[lo,hi]of[[floor+.7,floor+3.5],[floor+4.3,floor+7.5]]){block((x+end)/2,(lo+hi)/2,-9.9,end-x-.06,hi-lo,.065,'amenity-library-recessed-glazing',0x6d8b84,glass,'glass');block(x,(lo+hi)/2,-10,.065,hi-lo,.1,'amenity-library-window-frame',0xa5b0a4,metal,'metal');}}
        for(const[lo,hi]of spans)for(let y=lo;y<hi-.01;y+=1.2){const top=Math.min(y+1.2,hi);block(x,(y+top)/2,-9.8,b-a-.012,top-y-.012,.38,'amenity-library-stone-wall',0x8d9389);ownDecor(()=>{for(let c=a+1.2;c<b;c+=2.4)quad(metal,world(c,y,-9.994),world(c+.015,y,-9.994),world(c+.015,top,-9.994),world(c,top,-9.994),0x748071);});}
      }
      for(const d of[{x:-50,y:floor+.32,width:3.6,name:'lower'},{x:-10,y:roof,width:4,name:'upper'}]){
        block(d.x,d.y+1.35,-10.025,d.width-.08,2.7,.065,'amenity-library-'+d.name+'-door',0x93afa3,glass,'glass');
        for(const side of[-1,1])beam(world(d.x+side*.1,d.y+1,-10.1),world(d.x+side*.1,d.y+1.7,-10.1),.045,'amenity-library-door-pull');
        pavement(d.x-d.width/2,d.x+d.width/2,-10,-7,d.y,'amenity-library-entry-floor');block(d.x,d.y+1.4,-7,d.width,2.8,.16,'amenity-library-entry-back',0x75877a);
      }
      pavement(-52,-48,-11.2,-10,floor+.32,'amenity-lower-entry-landing');
      tile(-51.8,-48.2,-14.4,-11.2,floor,floor+.32,'amenity-lower-entry-ramp');
      for(const x of[-52,-48])guard(world(x,floor,-14.4),world(x,floor+.32,-11.2),'amenity-entry-glass-guard');
      for(const x of[-35,-3,20,42]){
        const p=world(x,floor+.36,-13.5),g=new THREE.CylinderGeometry(.68,.4,.7,12).toNonIndexed().applyMatrix4(new THREE.Matrix4().makeTranslation(p.x,p.y,p.z));append(g,metal,'stone','amenity-bowl-planter',0xa58f70);
        ownDecor(()=>{for(let i=0;i<14;i++){const a=i*2.4,r=.45*Math.sqrt((i+.5)/14),px=x+Math.cos(a)*r,pz=-13.5+Math.sin(a)*r;quad(metal,world(px-.03,floor+.65,pz),world(px+.03,floor+.65,pz),world(px+.12,floor+1.25+(i%3)*.07,pz),world(px+.07,floor+1.25+(i%3)*.07,pz),0xa7a87b);}});
      }
      Object.assign(metadata,{openBay:null,amenities:{court:{...q.court,floor},roof:q.roof,bridge:q.bridge,storeSigns:shops.map(s=>({text:s.name,x:s.x})),photoPublicationDate:'2025-02-22',currentStoreOperationsVerified:false,dimensionsEstimated:true},pavementMasks:masks});
    }
    function createDescendingAccess(q:LibrarySoutheastLayout){
      const routes:number[][]=[];
      const masks:{component:string;polygon:[number,number][]}[]=[];
      const pos=(f:typeof q.f,s:number,y:number,n=0)=>{const p=f.point(s,n);return new THREE.Vector3(p[0],y,p[1]);};
      function paving(f:typeof q.f,s0:number,s1:number,y0:number,y1:number,width:number,name:string){
        const p=[pos(f,s0,y0,-width/2),pos(f,s1,y1,-width/2),pos(f,s1,y1,width/2),pos(f,s0,y0,width/2)];
        prism([p[0],p[1],p[2]],.24,name);prism([p[0],p[2],p[3]],.24,name);
        masks.push({component:name,polygon:p.map(v=>[v.x,v.z])});
      }
      const approach=q.approach;
      paving(approach.frame,0,approach.end,approach.y0,approach.y1,3.6,'descending-road-approach');
      routes.push(pos(approach.frame,0,approach.y0).toArray(),pos(approach.frame,approach.end,approach.y1).toArray());
      for(const flight of q.down){
        const f=flight.frame;
        for(let k=1;k<flight.profile.length;k++){
          const a=flight.profile[k-1],b=flight.profile[k],rise=b.y-a.y,count=k===2?Math.max(1,Math.ceil(Math.abs(rise)/.17)):1;
          for(let i=0;i<count;i++){
            const s0=a.s+(b.s-a.s)*i/count,s1=a.s+(b.s-a.s)*(i+1)/count,y=a.y+rise*(i+1)/count;
            paving(f,s0,s1,y,y,flight.width,k===2?'descending-stair-tread':'descending-landing');
            routes.push(pos(f,(s0+s1)/2,y).toArray());
          }
          routes.push(pos(f,b.s,b.y).toArray());
          for(const side of[-1,1]){
            if(amenities&&(Math.abs(flight.y1-flight.y0)<.001||(flight===q.down[2]&&k===1)))continue;
            const n=side*(flight.width/2+.08);
            beam(pos(f,a.s,a.y+1,n),pos(f,b.s,b.y+1,n),.055,'descending-handrail');
            for(let s=a.s;s<b.s;s+=1.2){const y=flight.height(s);beam(pos(f,s,y,n),pos(f,s,y+1,n),.045,'descending-rail-post');}
          }
        }
      }
      // 사진에서 통로 오른쪽을 따라 이어지는 석재 측벽을 별도로 세운다.
      for(let z=-39;z<(amenities?-22:-15);z+=3){const end=Math.min(z+3,amenities?-22:-15),bottom=Math.min(terrain(-48,z),terrain(-48,end))-.3;
        block(-48,(bottom+terraceFloor)/2,(z+end)/2,.45,terraceFloor-bottom,end-z,'descending-stone-sidewall',0x858b80);
      }
      function roundColumn(p:THREE.Vector3,r:number,height:number,name:string,color:number){
        const g=new THREE.CylinderGeometry(r,r,height,10).toNonIndexed().translate(p.x,p.y+height/2,p.z);append(g,metal,'stone',name,color);
      }
      const first=q.down[0],f=first.frame,tactileS=first.start+.35,tactileY=first.y0;
      const board=[pos(f,tactileS-.18,tactileY+.003,-1.75),pos(f,tactileS+.18,tactileY+.003,-1.75),pos(f,tactileS+.18,tactileY+.003,1.75),pos(f,tactileS-.18,tactileY+.003,1.75)];
      const tactileStart=metal.positions.length;
      quad(metal,board[0],board[1],board[2],board[3],0xe0b937);
      for(let n=-1.65;n<1.7;n+=.14)for(const s of[tactileS-.08,tactileS+.08]){
        const p=pos(f,s,tactileY+.007,n),r=.023;
        quad(metal,p.clone().add(new THREE.Vector3(-r,0,-r)),p.clone().add(new THREE.Vector3(r,0,-r)),p.clone().add(new THREE.Vector3(r,0,r)),p.clone().add(new THREE.Vector3(-r,0,r)),0xf1cb49);
      }
      const owner=parts.find(p=>p.proxy.userData.component==='descending-landing')!;
      owner.ranges.push({surface:metal,start:tactileStart,end:metal.positions.length,original:Float32Array.from(metal.positions.slice(tactileStart))});
      for(const side of[-1,1]){const p=pos(f,first.start-.55,first.y0,side*1.1);p.y=Math.max(p.y,heightAt(p.x,p.z)+.02);roundColumn(p,.21,.6,'descending-bollard',0x969e91);}
      const lamp=pos(f,first.start+1,first.y0,3.3);lamp.y=Math.max(lamp.y,heightAt(lamp.x,lamp.z)+.02);roundColumn(lamp,.055,4.4,'descending-lamp-pole',0x6e7e71);roundColumn(lamp.clone().add(new THREE.Vector3(0,4.3,0)),.32,.12,'descending-lamp-head',0xc8d0bd);
      Object.assign(metadata,{descending:{sourceSteps:['way/167597860/23','way/1185902269/526'],mapped:q.mapped,route:routes,upperRoadY:approach.y0,lowerY:q.down.at(-1)!.y1,widths:q.down.map(s=>s.width),dimensionsEstimated:true},pavementMasks:[...((metadata as unknown as {pavementMasks?:typeof masks}).pavementMasks??[]),...masks],frontGlazingUseVerified:false,rawDEMModified:false});
    }
    unit.dispose();
  }
  for (const [surface, name, roughness, metalness] of [[metal, 'metal-and-structure', .58, .34], [glass, 'glazing', .26, .18], [railing, 'transparent-balustrade', .16, .08], ...(amenities?[[signage,'amenity-signage',.8,0] as const]:[])] as const) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(surface.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(surface.colors, 3));
    if(surface.uvs)geometry.setAttribute('uv',new THREE.Float32BufferAttribute(surface.uvs,2));
    (geometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
    geometry.computeVertexNormals(); geometry.computeBoundingSphere(); geometry.computeBoundingBox(); surface.geometry = geometry;
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ ...(surface.map?{map:surface.map}:{}), vertexColors: true, side: THREE.DoubleSide, roughness, metalness, transparent: surface === railing, opacity: surface === railing ? .32 : 1, depthWrite: surface !== railing }));
    mesh.name = `gwanjeong-${name}`; mesh.receiveShadow = true; shell.add(mesh);
    surface.positions.length = 0; surface.colors.length = 0;
  }
  function update(_player: THREE.Vector3) {
    const changed = new Set<Surface>();
    for (const part of parts) if (part.shown !== part.proxy.visible) {
      part.shown = part.proxy.visible;
      for (const range of part.ranges) {
        if (range.start === range.end) continue;
        const attribute = range.surface.geometry!.getAttribute('position') as THREE.BufferAttribute;
        if (!changed.has(range.surface)) attribute.clearUpdateRanges();
        changed.add(range.surface);
        if (part.shown) (attribute.array as Float32Array).set(range.original, range.start);
        else for (let k = range.start; k < range.end; k += 3) {
          attribute.array[k] = part.proxy.position.x; attribute.array[k + 1] = part.proxy.position.y; attribute.array[k + 2] = part.proxy.position.z;
        }
        attribute.addUpdateRange(range.start, range.end - range.start);
      }
    }
    for (const surface of changed) surface.geometry!.getAttribute('position').needsUpdate = true;
    shell.visible = parts.some(part => part.proxy.visible);
  }
  return { breakables, update };
}
