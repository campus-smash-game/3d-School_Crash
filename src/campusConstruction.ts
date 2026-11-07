import * as THREE from 'three';
import type { CampusData } from './fullCampus';
import type { BreakableSpec } from './scene';

// 지형 삼각형을 공사 윤곽에 잘라 색을 덮는다. 큰 삼각형이 지면을 가로지르는 틈을 피한다.
export function createConstructionGround(scene: THREE.Scene, area: CampusData['areas'][number]) {
  const terrain = scene.getObjectByName('campus-terrain') as THREE.Mesh | undefined;
  if (!terrain?.isMesh || !terrain.geometry.index) return null;
  const ring = area.points.map(p => new THREE.Vector2(p[0], p[1]));
  if (ring[0].equals(ring.at(-1)!)) ring.pop();
  const faces = THREE.ShapeUtils.triangulateShape(ring, []), position = terrain.geometry.getAttribute('position'), index = terrain.geometry.index, output: number[] = [];
  const minX = Math.min(...ring.map(p => p.x)), maxX = Math.max(...ring.map(p => p.x)), minZ = Math.min(...ring.map(p => p.y)), maxZ = Math.max(...ring.map(p => p.y));
  for (let i = 0; i < index.count; i += 3) {
    const points = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(position, index.getX(i + j)));
    if (Math.max(...points.map(p => p.x)) < minX || Math.min(...points.map(p => p.x)) > maxX || Math.max(...points.map(p => p.z)) < minZ || Math.min(...points.map(p => p.z)) > maxZ) continue;
    for (const face of faces) {
      const clip = face.map(j => ring[j]), sign = Math.sign((clip[1].x - clip[0].x) * (clip[2].y - clip[0].y) - (clip[1].y - clip[0].y) * (clip[2].x - clip[0].x));
      let polygon = points;
      for (let edge = 0; edge < 3 && polygon.length; edge++) {
        const a = clip[edge], b = clip[(edge + 1) % 3], side = (p: THREE.Vector3) => sign * ((b.x - a.x) * (p.z - a.y) - (b.y - a.y) * (p.x - a.x)), next: THREE.Vector3[] = [];
        for (let k = 0; k < polygon.length; k++) {
          const p = polygon[k], q = polygon[(k + 1) % polygon.length], dp = side(p), dq = side(q);
          if (dp >= -1e-7) next.push(p);
          if ((dp >= 0) !== (dq >= 0)) next.push(p.clone().lerp(q, dp / (dp - dq)));
        }
        polygon = next;
      }
      for (let k = 1; k + 1 < polygon.length; k++) for (const p of [polygon[0], polygon[k], polygon[k + 1]]) output.push(p.x, p.y + .025, p.z);
    }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(output, 3)); geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x9b917c, roughness: .95, side: THREE.DoubleSide }));
  Object.assign(mesh.userData, { role: 'mapped-area', areaId: area.id, areaKind: area.kind, terrainTriangleOverlay: true }); mesh.receiveShadow = true; scene.add(mesh); return mesh;
}

// 2025년 문화관 가설계획의 높이를 OSM 공사 구역에 대응한 근사다.
// 현재 공정, 울타리 재료와 출입문 위치는 실측하지 않았다.
export function createCampusConstruction(scene: THREE.Scene, areas: CampusData['areas'], heightAt: (x: number, z: number) => number) {
  return createFence(scene, areas, heightAt, { id: 'way/1485386287', name: 'culture-hall-construction', prefix: 'culture-fence', label: '문화관 공사 울타리', sourceDate: '2025-05-20', heights: [8, 8, 10, 10, 10, 8, 4, 4, 4, 4, 4], inset: 0, netHeight: 0 });
}

// 2025년 계획의 RPP 8m와 방진망 1m를 일반 규격으로 적용한다.
// 각 변의 높이와 현재 공정은 미확인이다. 도로 폭을 보존하도록 경계 안쪽으로 1m 옮긴다.
export function createEngineeringConstruction(scene: THREE.Scene, areas: CampusData['areas'], heightAt: (x: number, z: number) => number) {
  return createFence(scene, areas, heightAt, { id: 'way/1530459898', name: 'engineering32-construction', prefix: 'engineering32-fence', label: '32동 공사 울타리', sourceDate: '2025-05-09', heights: [8, 8, 8, 8, 8], inset: 1, netHeight: 1 });
}

type FencePlan = { id: string; name: string; prefix: string; label: string; sourceDate: string; heights: number[]; inset: number; netHeight: number };
function createFence(scene: THREE.Scene, areas: CampusData['areas'], heightAt: (x: number, z: number) => number, plan: FencePlan) {
  const area = areas.find(a => a.id === plan.id && a.kind === 'construction');
  const breakables: BreakableSpec[] = [];
  if (!area) return { breakables, update: (_player: THREE.Vector3) => {} };
  const mappedRing = area.points.filter((p, i, all) => i !== all.length - 1 || p[0] !== all[0][0] || p[1] !== all[0][1]);
  const sign = Math.sign(mappedRing.reduce((sum, p, i) => { const q = mappedRing[(i + 1) % mappedRing.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0));
  const ring = mappedRing.map((p, i): [number, number] => {
    if (!plan.inset) return [p[0], p[1]];
    const prev = mappedRing[(i + mappedRing.length - 1) % mappedRing.length], next = mappedRing[(i + 1) % mappedRing.length];
    const a = new THREE.Vector2(p[0] - prev[0], p[1] - prev[1]).normalize(), b = new THREE.Vector2(next[0] - p[0], next[1] - p[1]).normalize();
    const n1 = new THREE.Vector2(-a.y * sign, a.x * sign), n2 = new THREE.Vector2(-b.y * sign, b.x * sign);
    const offset = n1.add(n2).multiplyScalar(plan.inset / Math.max(.1, 1 + a.dot(b)));
    return [p[0] + offset.x, p[1] + offset.y];
  });
  const group = new THREE.Group(); group.name = plan.name;
  Object.assign(group.userData, { role: 'construction-fence', areaId: area.id, mappedOutline: mappedRing.map(p => [...p]), renderOutline: ring,
    sourceDate: plan.sourceDate, heightsFromPlan: true, heightsByEdgeVerified: !plan.inset, inset: plan.inset, netHeight: plan.netHeight, alignmentEstimated: true, materialEstimated: true,
    constructionProgressVerified: false });
  scene.add(group);
  const cube = new THREE.BoxGeometry(1, 1, 1), material = new THREE.MeshStandardMaterial({ color: 0xb5bcb8, roughness: .86 });
  const pieces: { proxy: THREE.Mesh; panel: THREE.Matrix4; posts: THREE.Matrix4[]; rail: THREE.Matrix4; net?: THREE.Matrix4; shown: boolean }[] = [];
  const dummy = new THREE.Object3D();
  const heights = plan.heights;
  for (let edge = 0; edge < ring.length; edge++) {
    const a = ring[edge], b = ring[(edge + 1) % ring.length], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
    const count = Math.max(1, Math.ceil(length / 4)), width = length / count, yaw = -Math.atan2(dz, dx), height = heights[edge];
    if (!height) throw new Error('Construction outline needs a reviewed height mapping.');
    for (let i = 0; i < count; i++) {
      const t = (i + .5) / count, x = a[0] + dx * t, z = a[1] + dz * t;
      const ground = [0, .25, .5, .75, 1].map(s => heightAt(a[0] + dx * (i + s) / count, a[1] + dz * (i + s) / count));
      const bottom = Math.min(...ground) - .3, bodyTop = Math.max(...ground) + height, top = bodyTop + plan.netHeight, actualHeight = top - bottom;
      const proxy = new THREE.Mesh(cube, material.clone()); proxy.position.set(x, (bottom + top) / 2, z); proxy.rotation.y = yaw; proxy.scale.set(width, actualHeight, .2); proxy.updateMatrix(); proxy.updateMatrixWorld(true);
      Object.assign(proxy.userData, { areaId: area.id, role: 'construction-panel', edge, panel: i, plannedHeight: height, netHeight: plan.netHeight, materialEstimated: true });
      const place = (along: number, y: number, w: number, h: number, depth: number) => {
        dummy.position.set(x + dx / length * along, y, z + dz / length * along); dummy.rotation.set(0, yaw, 0); dummy.scale.set(w, h, depth); dummy.updateMatrix(); return dummy.matrix.clone();
      };
      pieces.push({ proxy, panel: place(0, (bottom + bodyTop) / 2, width, bodyTop - bottom, .18), posts: [-1, 1].map(sign => place(sign * (width / 2 - .045), (bottom + top) / 2, .09, actualHeight, .2)), rail: place(0, top - .075, width, .15, .2), net: plan.netHeight ? place(0, bodyTop + plan.netHeight / 2, width, plan.netHeight, .06) : undefined, shown: true });
      breakables.push({ mesh: proxy, size: proxy.scale.clone(), toughness: 6, material: 'metal', label: plan.label });
    }
  }
  const panels = new THREE.InstancedMesh(cube, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .86 }), pieces.length), posts = new THREE.InstancedMesh(cube, new THREE.MeshStandardMaterial({ color: 0x8a9591, roughness: .75 }), pieces.length * 2), rails = new THREE.InstancedMesh(cube, posts.material, pieces.length);
  const nets = plan.netHeight ? new THREE.InstancedMesh(cube, new THREE.MeshStandardMaterial({ color: 0x60776a, transparent: true, opacity: .38, depthWrite: false, roughness: .9 }), pieces.length) : undefined;
  panels.name = `${plan.prefix}-panels`; posts.name = `${plan.prefix}-seams`; rails.name = `${plan.prefix}-top-rails`; if (nets) nets.name = `${plan.prefix}-dust-net`;
  const surfaces = nets ? [panels, posts, rails, nets] : [panels, posts, rails];
  for (const mesh of surfaces) { mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.receiveShadow = true; group.add(mesh); }
  pieces.forEach((p, i) => { panels.setMatrixAt(i, p.panel); panels.setColorAt(i, material.color); p.posts.forEach((m, j) => posts.setMatrixAt(i * 2 + j, m)); rails.setMatrixAt(i, p.rail); if (p.net) nets!.setMatrixAt(i, p.net); });
  panels.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  for (const mesh of surfaces) { mesh.computeBoundingBox(); mesh.computeBoundingSphere(); }
  group.userData.panels = pieces.length;
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const currentColor = new THREE.Color();
  function update(_player: THREE.Vector3) {
    let changed = false;
    pieces.forEach((p, i) => {
      const color = (p.proxy.material as THREE.MeshStandardMaterial).color;
      panels.getColorAt(i, currentColor);
      if (Math.abs(currentColor.r - color.r) + Math.abs(currentColor.g - color.g) + Math.abs(currentColor.b - color.b) > 1e-6) { panels.setColorAt(i, color); panels.instanceColor!.needsUpdate = true; }
      if (p.shown === p.proxy.visible) return;
      changed = true; p.shown = p.proxy.visible;
      panels.setMatrixAt(i, p.shown ? p.panel : hidden); p.posts.forEach((m, j) => posts.setMatrixAt(i * 2 + j, p.shown ? m : hidden)); rails.setMatrixAt(i, p.shown ? p.rail : hidden);
      if (p.net) nets!.setMatrixAt(i, p.shown ? p.net : hidden);
    });
    if (changed) for (const mesh of surfaces) mesh.instanceMatrix.needsUpdate = true;
    group.visible = pieces.some(p => p.proxy.visible);
  }
  return { breakables, update };
}
