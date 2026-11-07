import * as THREE from 'three';

export type BreakableSpec = {
  mesh: THREE.Mesh;
  size: THREE.Vector3;
  // 몸체 위치와 회전을 기준으로 한 미터 단위 볼록 형상 정점이다.
  collisionVertices?: Float32Array;
  toughness: number;
  label: string;
  material: 'stone' | 'metal' | 'wood' | 'glass';
};
export type StaticSpec = { position: THREE.Vector3; size: THREE.Vector3; quaternion?: THREE.Quaternion };

// 정문 사진과 2022년 광장 정비 자료를 참고했다. 치수와 주변 배치는 게임용 추정값이다.
export function createCampus(scene: THREE.Scene, options: { full?: boolean } = {}) {
  const breakables: BreakableSpec[] = [];
  const colliders: StaticSpec[] = [];
  let seed = 6382;
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const material = (color: number, roughness = 0.82, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const silver = material(0xc5cecc, 0.35, 0.62);
  const granite = material(0xb6b5a9);
  const darkStone = material(0x525d58);
  const wood = material(0x9e6234);
  const steel = material(0x314747, 0.47, 0.55);
  const white = material(0xe7e4ce);
  const paint = material(0xf1cc58);
  const orange = material(0xe9803a);
  const glass = new THREE.MeshStandardMaterial({ color: 0x92c9cb, roughness: 0.2, metalness: 0.12, transparent: true, opacity: 0.53 });

  function box(x: number, y: number, z: number, sx: number, sy: number, sz: number, mat: THREE.Material, shadow = true) {
    const mesh = new THREE.Mesh(boxGeometry, mat);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }
  function solid(x: number, y: number, z: number, sx: number, sy: number, sz: number, mat: THREE.Material) {
    const mesh = box(x, y, z, sx, sy, sz, mat);
    colliders.push({ position: mesh.position.clone(), size: mesh.scale.clone() });
    return mesh;
  }
  function destructible(x: number, y: number, z: number, sx: number, sy: number, sz: number, mat: THREE.Material, label: string, kind: BreakableSpec['material'], toughness = 2) {
    const mesh = box(x, y, z, sx, sy, sz, mat);
    breakables.push({ mesh, size: new THREE.Vector3(sx, sy, sz), toughness, label, material: kind });
    return mesh;
  }

  function groundTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#c8c7b7'; ctx.fillRect(0, 0, 512, 512);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const n = Math.floor(193 + rand() * 16);
        ctx.fillStyle = `rgb(${n + 9},${n + 8},${n})`;
        ctx.fillRect(col * 128 + 1, row * 128 + 1, 126, 126);
      }
    }
    for (let i = 0; i < 10000; i++) {
      ctx.fillStyle = rand() > .5 ? 'rgba(255,255,255,.13)' : 'rgba(30,36,26,.07)';
      ctx.fillRect(rand() * 512, rand() * 512, 1.6, 1.6);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(15, 25);
    tex.anisotropy = 4;
    return tex;
  }
  const plazaMat = new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: .93 });
  box(0, -.11, -6, 49, .2, 108, plazaMat, false);
  if (!options.full) {
  box(0, -.27, 0, 280, .25, 280, material(0x788154), false);
  box(36, -.04, -10, 19, .1, 130, material(0x434c4c), false);
  box(26.1, .055, -8, 1.3, .15, 125, granite, false);
  box(47, .04, -8, 3, .15, 130, plazaMat, false);
  // 차도는 조형물 오른쪽을 지나며, 정문 아래는 보행 광장이다.
  for (let z = -68; z < 50; z += 7) {
    box(36, .025, z, .13, .025, 4, paint, false);
    box(36.3, .025, z, .13, .025, 4, paint, false);
    box(31.3, .025, z, .1, .025, 3.5, white, false);
    box(41.1, .025, z, .1, .025, 3.5, white, false);
  }
  for (let x = 27.5; x < 45; x += 1.4) box(x, .04, 24, .7, .035, 5.5, white, false);
  }

  // 광장 패턴은 원본 사진을 복사하지 않고 월계수 형상을 직접 그렸다.
  const plazaPattern = document.createElement('canvas');
  plazaPattern.width = plazaPattern.height = 1024;
  const pc = plazaPattern.getContext('2d')!;
  pc.translate(512, 512);
  pc.strokeStyle = 'rgba(107,118,108,.26)'; pc.fillStyle = 'rgba(107,118,108,.23)'; pc.lineWidth = 4;
  pc.beginPath(); pc.arc(0, 0, 230, 0, Math.PI * 2); pc.stroke();
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 14; i++) {
      const a = .25 + i * .125;
      const px = side * Math.sin(a) * 330;
      const py = Math.cos(a) * 330;
      pc.save(); pc.translate(px, py); pc.rotate(side * (-a - .5));
      pc.beginPath(); pc.ellipse(0, 0, 16 + i * .6, 54, 0, 0, Math.PI * 2); pc.fill(); pc.restore();
    }
  }
  pc.font = '600 40px sans-serif'; pc.textAlign = 'center'; pc.fillText('VERITAS LUX MEA', 0, 25);
  const patternMap = new THREE.CanvasTexture(plazaPattern); patternMap.colorSpace = THREE.SRGBColorSpace;
  function readableWorldTextPlane(width: number, height: number) {
    const geometry = new THREE.PlaneGeometry(width, height), uv = geometry.getAttribute('uv');
    // 지도 좌표는 그대로 두고 world의 Z 반사로 뒤집히는 글자 U축만 보정한다.
    for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
    geometry.userData.worldTextUReflection = true; return geometry;
  }
  const pattern = new THREE.Mesh(readableWorldTextPlane(33, 33), new THREE.MeshBasicMaterial({ map: patternMap, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
  pattern.name = 'gate-plaza-emblem'; pattern.userData.worldText = { kind: 'plane', text: 'VERITAS LUX MEA', compensation: 'u-reflection-for-world-z-reflection' };
  pattern.rotation.x = -Math.PI / 2; pattern.position.set(0, .017, -17); scene.add(pattern);

  function gateBeam(a: THREE.Vector3, b: THREE.Vector3, thickness: number, depth: number, parts: number) {
    // 공식 사진의 높은 기둥은 차도 쪽 서편이다. 조형물 안의 X 배치만 바로잡는다.
    a = a.clone().setX(-a.x); b = b.clone().setX(-b.x);
    const dir = b.clone().sub(a);
    const length = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    for (let i = 0; i < parts; i++) {
      const pos = a.clone().lerp(b, (i + .5) / parts);
      const piece = destructible(pos.x, pos.y, pos.z, thickness, length / parts + .015, depth, silver, '샤 정문', 'metal', 4);
      piece.quaternion.copy(q);
      piece.userData.gate = true; piece.userData.gatePlacement = 'tall-column-west-road-side';
    }
  }
  const v = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);
  // 낮은 삼각 아치와 서쪽 열쇠 모양 기둥이 정문의 특징이다.
  for (const z of [-.84, 0, .84]) {
    gateBeam(v(-13.2, .65, z), v(0, 13.2, z), 1.28, .34, 5);
    gateBeam(v(0, 13.2, z), v(13.2, .65, z), 1.28, .34, 5);
  }
  gateBeam(v(12.8, .4, -.25), v(12.8, 21.4, -.25), 1.65, 2.05, 7);
  gateBeam(v(12.8, 21.0, -.25), v(9.1, 21.0, -.25), 1.2, 2.05, 2);
  gateBeam(v(9.15, 21.0, -.25), v(9.15, 19.75, -.25), .8, 2.05, 1);
  gateBeam(v(13.0, 17.9, -.25), v(14.7, 17.9, -.25), 1.0, 2.05, 1);
  gateBeam(v(13.0, 15.65, -.25), v(14.7, 15.65, -.25), 1.0, 2.05, 1);
  solid(13.2, .2, 0, 2.6, .4, 3.2, granite).userData.gateFoundation = 'east-arch';
  solid(-13, .2, 0, 3.0, .4, 3.2, granite).userData.gateFoundation = 'west-column';

  // 석조 의자와 낮은 경계석은 가까운 거리에서 시험할 수 있는 파괴 대상이다.
  for (const [x, z] of [[-16, 17], [-16, 23], [16, 16], [16, 23], [-18, -12], [18, -12]]) {
    destructible(x, .42, z, 2.6, .84, 1.15, granite, '석조 의자', 'stone', 2);
  }
  for (let z = -28; z < 34; z += 8) {
    destructible(24.8, .48, z, .48, .96, .48, granite, '경계석', 'stone', 1);
  }
  for (let x = -19; x < 21; x += 5) {
    if (Math.abs(x) < 4) continue;
    destructible(x, .48, 43, .5, .96, .5, granite, '경계석', 'stone', 1);
  }

  // 뒤쪽 삼각 수경시설은 공식 소개에서 확인한 형태를 단순화했다.
  const triangle = new THREE.Shape(); triangle.moveTo(3.7, 0); triangle.lineTo(-3.7, 0); triangle.lineTo(-3.7, 13); triangle.closePath();
  for (let i = 0; i < 3; i++) {
    const geometry = new THREE.ExtrudeGeometry(triangle, { depth: .22, bevelEnabled: false });
    const step = new THREE.Mesh(geometry, darkStone);
    step.rotation.x = -Math.PI / 2;
    const s = 1 - i * .16; step.scale.set(s, s, 1);
    step.position.set(1, .06 + i * .22, -24 - i * .4); step.userData.gateWaterFeature = 'long-side-west-road';
    step.castShadow = true; step.receiveShadow = true; scene.add(step);
  }
  const water = new THREE.Mesh(new THREE.ShapeGeometry(triangle), new THREE.MeshStandardMaterial({ color: 0x6d9c9c, metalness: .35, roughness: .2 }));
  water.rotation.x = -Math.PI / 2; water.scale.set(.6, .6, 1); water.position.set(1, .73, -25); water.userData.gateWaterFeature = 'long-side-west-road'; scene.add(water);
  colliders.push({ position: v(1, .31, -27), size: v(6, .62, 5) });

  function labelMap(lines: { text: string; size: number; y: number; color?: string }[], bg: string, w = 1024, h = 256) {
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const line of lines) { ctx.fillStyle = line.color ?? '#eef0e7'; ctx.font = `600 ${line.size}px "Malgun Gothic", sans-serif`; ctx.fillText(line.text, w / 2, line.y); }
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; return tex;
  }
  const nameStone = solid(-19, .95, 6, 7.4, 1.9, .9, darkStone);
  const nameFace = new THREE.Mesh(readableWorldTextPlane(6.9, 1.55), new THREE.MeshStandardMaterial({ map: labelMap([{ text: '서울대학교', size: 99, y: 95 }, { text: 'SEOUL NATIONAL UNIVERSITY', size: 29, y: 192 }], '#525d58'), roughness: .85 }));
  nameFace.name = 'gate-name-sign'; nameFace.userData.worldText = { kind: 'plane', text: '서울대학교 / SEOUL NATIONAL UNIVERSITY', compensation: 'u-reflection-for-world-z-reflection' };
  nameFace.position.set(nameStone.position.x, 1, 6.46); scene.add(nameFace);

  // 보행 광장 주변 시설.
  for (const z of [13, -17]) {
    for (const x of [-22.8, 22.8]) {
      solid(x, .22, z, 2.6, .44, 4.8, granite);
      box(x, .46, z, 2.2, .05, 4.4, material(0x545342), false);
    }
  }
  const bench = (x: number, z: number) => {
    destructible(x, .58, z, 3.0, .22, .8, wood, '나무 벤치', 'wood', 1);
    destructible(x, 1.05, z - .35, 3.0, .65, .15, wood, '벤치 등받이', 'wood', 1);
    box(x - 1.05, .25, z, .12, .5, .65, steel);
    box(x + 1.05, .25, z, .12, .5, .65, steel);
  };
  bench(-20, 30); bench(19, 31); bench(-20, -20);

  // 단독 정문 시제품의 정류장이다. 실제 위치가 아니므로 전체 캠퍼스에서는 만들지 않는다.
  if (!options.full) {
  for (const z of [-5, -12]) solid(48.9, 1.5, z, .14, 3, .14, steel);
  solid(48.4, 3.05, -8.5, 3.4, .22, 8.5, steel);
  destructible(49.3, 1.65, -8.5, .09, 2.4, 6.8, glass, '정류장 유리', 'glass', 1);
  const busLabel = new THREE.Mesh(readableWorldTextPlane(5.5, .65), new THREE.MeshBasicMaterial({ map: labelMap([{ text: '서울대학교 정문', size: 78, y: 128 }], '#244c50') }));
  busLabel.name = 'gate-bus-stop-sign'; busLabel.userData.worldText = { kind: 'plane', text: '서울대학교 정문', compensation: 'u-reflection-for-world-z-reflection' };
  busLabel.position.set(48.4, 2.68, -4.75); busLabel.rotation.y = -.5; scene.add(busLabel);
  solid(48.0, .5, -8.5, .7, 1, 5, wood);
  }

  // 작은 관리 부스.
  solid(22, 1.25, -44, 3.5, 2.5, 3.3, white);
  box(22, 2.64, -44, 4.2, .28, 4, steel);
  destructible(22, 1.8, -42.32, 2.8, .85, .06, glass, '관리 부스 유리', 'glass', 1);
  for (let i = 0; i < 4; i++) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(.23, .75, 8), orange);
    cone.position.set(28.4, .4, -36 + i * 2.8); cone.castShadow = true; scene.add(cone);
  }

  // 인스턴스로 나무와 가로등을 묶어 모바일의 그리기 호출을 줄인다.
  const treePoints: { x: number; z: number; h: number; color: THREE.Color }[] = [];
  const leafColors = [0x527453, 0x68793e, 0x8c8d43, 0xb59a4f, 0xc4924c, 0x477565];
  for (let i = 0; i < (options.full ? 0 : 145); i++) {
    const left = i % 2 === 0;
    const x = left ? -29 - rand() * 50 : 54 + rand() * 45;
    treePoints.push({ x, z: -95 + rand() * 150, h: 5.5 + rand() * 5.5, color: new THREE.Color(leafColors[i % leafColors.length]) });
  }
  if (!options.full) for (let i = 0; i < 50; i++) treePoints.push({ x: -50 + rand() * 110, z: -70 - rand() * 45, h: 6 + rand() * 6, color: new THREE.Color(leafColors[i % 6]) });
  for (const x of [-22.8, 22.8]) for (const z of [13, -17]) treePoints.push({ x, z, h: 5.6, color: new THREE.Color(0xab924c) });
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.18, .32, 1, 6), material(0x655746), treePoints.length);
  const foliage = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), material(0xffffff), treePoints.length * 3);
  const dummy = new THREE.Object3D();
  treePoints.forEach((t, i) => {
    dummy.position.set(t.x, t.h * .31, t.z); dummy.rotation.set(0, rand(), 0); dummy.scale.set(1, t.h * .62, 1); dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix);
    for (let j = 0; j < 3; j++) {
      dummy.position.set(t.x + (j - 1) * .9, t.h * (.66 + j * .09), t.z + (j % 2 ? .7 : -.35));
      dummy.scale.set(t.h * .24, t.h * .29, t.h * .23); dummy.rotation.set(rand(), rand(), rand()); dummy.updateMatrix();
      foliage.setMatrixAt(i * 3 + j, dummy.matrix); foliage.setColorAt(i * 3 + j, t.color);
    }
  });
  trunks.castShadow = true; trunks.receiveShadow = true; foliage.castShadow = true; foliage.receiveShadow = true;
  scene.add(trunks, foliage);

  const lampParts: { pos: THREE.Vector3; size: THREE.Vector3 }[] = [];
  if (!options.full) for (const x of [-24.5, 25.1, 47]) for (const z of [-39, -16, 8, 34]) {
    lampParts.push({ pos: v(x, 3.5, z), size: v(.11, 7, .11) });
    lampParts.push({ pos: v(x, 7, z), size: v(2.4, .16, .42) });
  }
  const lampMesh = new THREE.InstancedMesh(boxGeometry, steel, lampParts.length);
  lampParts.forEach((part, i) => { dummy.position.copy(part.pos); dummy.rotation.set(0, 0, 0); dummy.scale.copy(part.size); dummy.updateMatrix(); lampMesh.setMatrixAt(i, dummy.matrix); });
  lampMesh.castShadow = true; scene.add(lampMesh);

  // 관악산의 능선을 단순한 입체로 표현한다.
  if (!options.full) {
  const hillMat = material(0x617d70);
  for (let i = 0; i < 11; i++) {
    const hill = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), hillMat);
    hill.position.set(-130 + i * 26, 3 + rand() * 5, -153 - rand() * 40);
    hill.scale.set(35 + rand() * 20, 27 + rand() * 26, 34 + rand() * 15);
    hill.rotation.y = rand() * 2; hill.receiveShadow = true; scene.add(hill);
  }
  const distantBuilding = material(0xc5cabb);
  const windowMat = material(0x70999c, .4, .2);
  for (let i = 0; i < 3; i++) {
    const x = -8 + i * 16; const h = 12 + i * 3;
    box(x, h / 2, -91 - i * 7, 9, h, 7, distantBuilding);
    for (let j = 0; j < 4; j++) box(x, 3 + j * 3, -87.45 - i * 7, 7.5, 1.3, .05, windowMat, false);
  }
  }
  // 반복되는 정적 상자는 재질별 인스턴스로 묶는다. 파괴 대상은 개별 메시를 유지한다.
  const dynamicMeshes = new Set(breakables.map((item) => item.mesh));
  const batches = new Map<THREE.Material, THREE.Mesh[]>();
  for (const child of [...scene.children]) {
    if (!(child instanceof THREE.Mesh) || child.geometry !== boxGeometry || dynamicMeshes.has(child)) continue;
    const mat = child.material as THREE.Material;
    const list = batches.get(mat) ?? [];
    list.push(child); batches.set(mat, list);
  }
  for (const [mat, list] of batches) {
    const batch = new THREE.InstancedMesh(boxGeometry, mat, list.length);
    const gateFoundations = list.flatMap((mesh, index) => mesh.userData.gateFoundation ? [{ index, side: mesh.userData.gateFoundation }] : []);
    if (gateFoundations.length) batch.userData.gateFoundations = gateFoundations;
    list.forEach((mesh, i) => { mesh.updateMatrix(); batch.setMatrixAt(i, mesh.matrix); scene.remove(mesh); });
    batch.castShadow = list.some((mesh) => mesh.castShadow);
    batch.receiveShadow = true;
    scene.add(batch);
  }
  // 개방된 잔디 경계는 통행 가능하고, 장면 밖 이동만 게임에서 제한한다.
  return { breakables, colliders, spawn: new THREE.Vector3(0, 1.7, 35), bounds: { minX: -50, maxX: 53, minZ: -58, maxZ: 48 } };
}
