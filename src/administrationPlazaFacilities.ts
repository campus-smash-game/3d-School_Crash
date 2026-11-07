import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { CampusData } from './fullCampus';
import type { BreakableSpec } from './scene';

type Part = { proxy: THREE.Mesh; geometry: THREE.BufferGeometry; start: number; count: number; original?: Float32Array; visible: boolean };

/** 2025년 9월 거리뷰의 행정관 서측 안내판과 진입 시설. 위치와 치수는 지도에 맞춘 근사다. */
export function createAdministrationPlazaFacilities(scene: THREE.Scene, data: CampusData, heightAt: (x: number, z: number) => number) {
  const shell = new THREE.Group(); shell.name = 'facilities/administration-west'; scene.add(shell);
  const start = new THREE.Vector3(187.02, 0, -728.95), end = new THREE.Vector3(196.52, 0, -737.88);
  const axis = end.clone().sub(start).normalize(), across = new THREE.Vector3(-axis.z, 0, axis.x);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-axis.z, axis.x));
  const point = (s: number, n: number, h = 0) => { const p = start.clone().addScaledVector(axis, s).addScaledVector(across, n); p.y = heightAt(p.x, p.z) + h; return p; };
  const parts: Part[] = [], breakables: BreakableSpec[] = [];
  const atlas = makeAtlas(data), material = new THREE.MeshStandardMaterial({ map: atlas, vertexColors: true, roughness: .78, metalness: .08, side: THREE.DoubleSide });
  function add(name: string, geometry: THREE.BufferGeometry, center: THREE.Vector3, color: number, kind: BreakableSpec['material'] = 'metal', rotation = q, owner?: THREE.Mesh, uv?: [number, number, number, number]) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone(); geometry.dispose(); g.computeBoundingBox();
    const proxy = owner ?? new THREE.Mesh(g.clone(), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide }));
    if (!owner) {
      proxy.position.copy(center); proxy.quaternion.copy(rotation); proxy.updateMatrixWorld(true);
      Object.assign(proxy.userData, { facilityId: shell.name, component: name, renderProxy: true, dimensionsEstimated: true });
      breakables.push({ mesh: proxy, size: g.boundingBox!.getSize(new THREE.Vector3()), collisionVertices: g.getAttribute('position').array.slice() as Float32Array, toughness: kind === 'stone' ? 10 : 5, material: kind, label: name.startsWith('map') ? '행정관 앞 캠퍼스 안내판' : name.startsWith('notice') ? '행정관 앞 게시판' : name.startsWith('lamp') ? '행정관 앞 가로등' : '행정관 앞 차량 차단기' });
    }
    const count = g.getAttribute('position').count, tint = new THREE.Color(color), colors = new Float32Array(count * 3);
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
    const tex = g.getAttribute('uv');
    for (let i = 0; i < count; i++) { colors.set([tint.r, tint.g, tint.b], i * 3); if (uv) tex.setXY(i, uv[0] + tex.getX(i) * (uv[2] - uv[0]), uv[1] + tex.getY(i) * (uv[3] - uv[1])); else tex.setXY(i, .999, .001); }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); g.applyMatrix4(new THREE.Matrix4().compose(center, rotation, new THREE.Vector3(1, 1, 1)));
    parts.push({ proxy, geometry: g, start: 0, count, visible: true }); return proxy;
  }
  const box = (name: string, p: THREE.Vector3, size: [number, number, number], color: number, kind: BreakableSpec['material'] = 'metal', owner?: THREE.Mesh) => add(name, new THREE.BoxGeometry(...size), p, color, kind, q, owner);
  // 작은 장식면은 본체와 함께 파괴한다.
  function board(name: string, s: number, n: number, width: number, height: number, roof: number, uv: [number, number, number, number]) {
    const p = point(s, n), frame = box(name + '-frame', p.clone().add(new THREE.Vector3(0, .65 + height / 2, 0)), [width, height, .15], 0x373c3a);
    if (name === 'map') box('map-lower-panel', p.clone().add(new THREE.Vector3(0, .34, 0)), [width, .60, .12], 0x333a37);
    for (const side of [-1, 1]) {
      const post = p.clone().addScaledVector(axis, side * (width / 2 - .08)), baseY = heightAt(post.x, post.z) - .035, topY = p.y + .65 + height + .18;
      box(name + '-post', post.setY((baseY + topY) / 2), [.09, topY - baseY, .1], 0x4b504b);
    }
    box(name + '-roof', p.clone().add(new THREE.Vector3(0, .65 + height + .17, 0)), [width + .3, .1, roof], name === 'map' ? 0xd4d6cf : 0x3a4844);
    // 안내판을 도로 쪽으로 향하게 하고 표시 좌표의 반사를 글자에 한 번 보정한다.
    const faceQ = q.clone();
    const face = new THREE.PlaneGeometry(width - .13, height - .15); face.scale(-1, 1, 1);
    add(name + '-face', face, p.clone().addScaledVector(across, .081).add(new THREE.Vector3(0, .65 + height / 2, 0)), 0xffffff, 'metal', faceQ, frame, uv);
    return { s, n, position: p.toArray(), width, height, frame: frame.uuid };
  }
  const map = board('map', 1.7, -3.85, 2.1, 2.8, .8, [0, .25, .5, 1]);
  const notices = [5.4, 8.8, 12.2].map(s => board('notice', s, -3.85, 2.8, 1.45, .65, [.5, .25, 1, 1]));
  const lamps = [2, 11.7].map(s => {
    const p = point(s, 4.75), height = 4.3;
    box('lamp-base', p.clone().add(new THREE.Vector3(0, .09, 0)), [.42, .18, .38], 0x515751);
    for (const side of [-1, 1]) box('lamp-upright', p.clone().addScaledVector(axis, side * .15).add(new THREE.Vector3(0, height / 2, 0)), [.08, height, .10], 0x3b4640);
    const top = box('lamp-top', p.clone().add(new THREE.Vector3(0, height, 0)), [.43, .12, .28], 0x3b4640);
    box('lamp-light', p.clone().add(new THREE.Vector3(0, height - .072, 0)), [.26, .018, .20], 0xe6e8da, 'metal', top);
    return { position: p.toArray(), height };
  });
  const gateGround = point(7.3, 0), groundY = gateGround.y;
  const island = [-1.9, 1.9].flatMap(s => [-.26, .26].flatMap(n => {
    const y = point(7.3 + s, n).y - groundY;
    return [new THREE.Vector3(s, y - .08, n), new THREE.Vector3(s, y + .22, n)];
  }));
  add('gate-yellow-island', new ConvexGeometry(island), gateGround, 0xd9b635, 'stone');
  const gates = [-1, 1].map(side => {
    const p = point(7.3 + side * .9, 0), gateY = p.y, mechanism = box('gate-mechanism', p.clone().setY(gateY + .69), [.5, 1.17, .38], 0xe0e2db);
    box('gate-dark-cap', p.clone().setY(gateY + 1.3), [.52, .09, .41], 0x3b4341, 'metal', mechanism);
    // 게임 차량의 통행을 위해 열린 상태로 둔다. 실제 개폐 제어나 현재 운영 상태를 재현하지 않는다.
    const opening = THREE.MathUtils.degToRad(82), armRotation = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -side * opening));
    const armPoint = (d: number) => p.clone().addScaledVector(across, side * (.15 + d * Math.cos(opening))).setY(gateY + 1.13 + d * Math.sin(opening));
    const arm = add('gate-arm', new THREE.BoxGeometry(.10, .10, 2.25), armPoint(1.125), 0xf0eee3, 'metal', armRotation);
    for (let i = 0; i < 5; i++) add('gate-red-stripe', new THREE.BoxGeometry(.106, .106, .18), armPoint(.2 + i * .43), 0xb9483f, 'metal', armRotation, arm);
    const reader = p.clone().addScaledVector(axis, -side * .8).addScaledVector(across, side * .25);
    box('gate-reader-post', reader.clone().setY(gateY + .65), [.10, 1.3, .1], 0x353e3b);
    box('gate-reader-box', reader.clone().setY(gateY + 1.3), [.22, .27, .18], 0x343b39);
    return { position: p.toArray(), side, arm: arm.uuid, openingDegrees: 82, operation: 'Fixed open for game vehicle access; not real-time gate control.' };
  });
  let offset = 0; for (const part of parts) { part.start = offset; offset += part.count; part.original = part.geometry.getAttribute('position').array.slice() as Float32Array; }
  const geometry = mergeGeometries(parts.map(p => p.geometry), false)!; geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  (geometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  const mesh = new THREE.Mesh(geometry, material); mesh.name = shell.name + '/merged'; mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; shell.add(mesh);
  for (const part of parts) part.geometry.dispose();
  Object.assign(shell.userData, { role: 'campus-facilities', landmark: 'administration-west', facilityId: shell.name, sourceMonth: '2025-09', sourcePanorama: 'NYSrsJIQuCQ8ogVSuOR7aA', mappedRoad: 'way/167597965/24', start: start.toArray(), axis: axis.toArray(), across: across.toArray(), map, notices, lamps, gates, pedestrianChannel: { s: [-2, 17], n: [2.9, 4.1] }, sourceCoordinatesEstimated: true, dimensionsEstimated: true, noticeCountEstimated: true, terrainChanged: false, coordinateConvention: 'D=(east,up,north); parent H once.', parts: breakables.length, triangles: geometry.getAttribute('position').count / 3, atlasContent: 'Map redrawn from game OpenStreetMap geometry. Generic notices. No roadview image texture.' });
  function update(_player: THREE.Vector3) {
    const attr = geometry.getAttribute('position') as THREE.BufferAttribute; let changed = false;
    for (const part of parts) if (part.visible !== part.proxy.visible) {
      if (!changed) attr.clearUpdateRanges(); changed = true; part.visible = part.proxy.visible;
      if (part.visible) (attr.array as Float32Array).set(part.original!, part.start * 3);
      else for (let i = 0; i < part.count; i++) attr.setXYZ(part.start + i, part.original![0], part.original![1], part.original![2]);
      attr.addUpdateRange(part.start * 3, part.count * 3);
    }
    if (changed) attr.needsUpdate = true; shell.visible = parts.some(p => p.proxy.visible);
  }
  return { breakables, shell, update };
}

function makeAtlas(data: CampusData) {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 1024;
  const ctx = canvas.getContext('2d'); if (!ctx) throw Error('Unable to create campus board atlas.');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 1024, 1024);
  ctx.fillStyle = '#23495b'; ctx.fillRect(0, 0, 512, 62); ctx.fillRect(512, 0, 512, 62);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffffff'; ctx.font = '28px sans-serif'; ctx.fillText('Campus Map', 256, 31); ctx.fillText('서울대학교 게시판', 768, 31);
  ctx.fillStyle = '#e9efdf'; ctx.fillRect(18, 76, 476, 405);
  const scale = Math.min(440 / (data.bounds.maxX - data.bounds.minX), 380 / (data.bounds.maxZ - data.bounds.minZ));
  const xy = ([x, z]: [number, number]) => [35 + (x - data.bounds.minX) * scale, 465 - (z - data.bounds.minZ) * scale];
  ctx.strokeStyle = '#aab7b3'; ctx.lineWidth = 1.5;
  for (const road of data.roads) { ctx.beginPath(); road.points.forEach((p, i) => { const [x, y] = xy(p); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke(); }
  ctx.fillStyle = '#8598a8'; for (const b of data.buildings) { ctx.beginPath(); b.points.forEach((p, i) => { const [x, y] = xy(p); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.closePath(); ctx.fill(); }
  ctx.fillStyle = '#263b47'; ctx.textAlign = 'left'; ctx.font = '20px sans-serif'; ctx.fillText('관악캠퍼스', 28, 511);
  const directory = ['60 행정관', '63 학생회관', '62 중앙도서관', '62-1 관정관', '102 정보화본부', '24 자연과학관'];
  ctx.font = '18px sans-serif'; directory.forEach((text, i) => ctx.fillText(text, 28, 550 + i * 31));
  const colors = ['#f2e3d5', '#dce8ef', '#e8e4cd', '#e6dce9', '#dbe9dd', '#eee9de'];
  for (let i = 0; i < 12; i++) { const x = 530 + (i % 4) * 119, y = 95 + Math.floor(i / 4) * 209; ctx.fillStyle = colors[i % colors.length]; ctx.fillRect(x, y, 99, 184); ctx.fillStyle = '#526262'; ctx.fillRect(x + 8, y + 15, 83, 17); for (let r = 0; r < 6; r++) ctx.fillRect(x + 8, y + 52 + r * 15, 68 - (r % 3) * 11, 3); }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.name = 'administration-map-and-notices'; return texture;
}
