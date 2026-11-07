import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';

type XZ = [number, number];
type Surface = { positions: number[]; colors: number[]; geometry?: THREE.BufferGeometry };
type Range = { surface: Surface; start: number; end: number; original: Float32Array };
type Part = { proxy: THREE.Mesh; ranges: Range[]; shown: boolean };

export function getEngineering3130ConnectionLayout(heightAt: (x: number, z: number) => number, observedFloor?: number) {
  const northA: XZ = [170.6, -1024.34], northB: XZ = [203.19, -1029.83];
  const length = Math.hypot(northB[0] - northA[0], northB[1] - northA[1]);
  const axis = { x: (northB[0] - northA[0]) / length, z: (northB[1] - northA[1]) / length };
  const normal = { x: -axis.z, z: axis.x }, width = 6;
  const origin: XZ = [northA[0] - normal.x * width / 2, northA[1] - normal.z * width / 2];
  const point = (u: number, v: number): XZ => [origin[0] + axis.x * u + normal.x * v, origin[1] + axis.z * u + normal.z * v];
  const start = -1.7, end = length + 2.5;
  const floorStations: { u: number; y: number }[] = [];
  const count = Math.ceil((end - start) / 1.5);
  for (let i = 0; i <= count; i++) {
    const u = THREE.MathUtils.lerp(start, end, i / count);
    const y = observedFloor ?? Math.max(...[-3, -1.5, 0, 1.5, 3].map(v => { const p = point(u, v); return heightAt(...p); })) + .11;
    floorStations.push({ u, y });
  }
  const floorAt = (u: number) => {
    const index = Math.max(0, Math.min(count - 1, Math.floor((u - start) / (end - start) * count)));
    const a = floorStations[index], b = floorStations[index + 1];
    return THREE.MathUtils.lerp(a.y, b.y, THREE.MathUtils.clamp((u - a.u) / (b.u - a.u), 0, 1));
  };
  const local = (p: XZ) => ({ u: (p[0] - origin[0]) * axis.x + (p[1] - origin[1]) * axis.z, v: (p[0] - origin[0]) * normal.x + (p[1] - origin[1]) * normal.z });
  const ceiling = Math.max(...floorStations.map(p => p.y)) + 2.7;
  // 창띠와 접속 관계는 2024년 거리뷰에 근거한다. 폭, 층고와 하부 보행 바닥은 게임용 근사다.
  const upperFloors = observedFloor === undefined ? [ceiling + .2, ceiling + 3.5, ceiling + 6.8] : [ceiling + .2, ceiling + 3.5, ceiling + 6.8, ceiling + 10.1];
  const openings = [
    { buildingId: 'way/389628348', a: [170.6, -1024.34] as XZ, b: [172.85, -1049.27] as XZ },
    { buildingId: 'way/389628347', a: [203.19, -1029.83] as XZ, b: [210.46, -1090.32] as XZ },
  ].map(face => {
    const av = local(face.a).v, bv = local(face.b).v;
    const interpolate = (v: number): XZ => { const t = (v - av) / (bv - av); return [THREE.MathUtils.lerp(face.a[0], face.b[0], t), THREE.MathUtils.lerp(face.a[1], face.b[1], t)]; };
    const a = interpolate(2.45), b = interpolate(-2.45);
    return { buildingId: face.buildingId, a, b, bottom: Math.min(floorAt(local(a).u), floorAt(local(b).u)) - .25, top: ceiling - .05, floor: floorAt((local(a).u + local(b).u) / 2) };
  });
  const crossing = local([192.8, -1031]).u;
  return { origin, axis, normal, length, width, start, end, floorStations, floorAt, point, local, ceiling, upperFloors, openings, crossing, crossingWidth: 4.8, dimensionsEstimated: true as const, sourceCaptureDate: observedFloor === undefined ? '2024-02' : '2026-08', ...(observedFloor===undefined?{}:{observedNorthEntry:true}) };
}

export function createEngineering3130Connection(scene: THREE.Scene, heightAt: (x: number, z: number) => number) {
  const observed = scene.getObjectByName('campus-terrain')?.userData.engineering30Correction?.layout;
  const layout: ReturnType<typeof getEngineering3130ConnectionLayout> = observed?.connector ?? getEngineering3130ConnectionLayout(heightAt);
  const shell = new THREE.Group(); shell.name = 'connection/engineering31-30';
  const { floorAt, point, local, ...serializable } = layout;
  Object.assign(shell.userData, { role: 'campus-connection', connectionId: shell.name, landmark: 'engineering31-30-connection', joinedBuildingIds: ['way/389628348', 'way/389628347'], layout: serializable, originalFootprintsUnchanged: true, historicGreenCanopyIncluded: false, hiddenLowerPassageEstimated: true, coordinates: 'D=(east,up,north); parent H applies once.' });
  scene.add(shell);
  const wall: Surface = { positions: [], colors: [] }, trim: Surface = { positions: [], colors: [] }, glass: Surface = { positions: [], colors: [] }, surfaces = [wall, trim, glass];
  const parts: Part[] = [], breakables: BreakableSpec[] = [], up = new THREE.Vector3(0, 1, 0);
  const axis = new THREE.Vector3(layout.axis.x, 0, layout.axis.z), normal = new THREE.Vector3(layout.normal.x, 0, layout.normal.z);
  const cube = new THREE.BoxGeometry(1, 1, 1).toNonIndexed(), cv = cube.getAttribute('position');
  const endPlanes=layout.openings.map(o=>({a:local(o.a),b:local(o.b)}));
  let clipBody=false;
  const world = (u: number, y: number, v: number) => {
    if(clipBody){const limits=endPlanes.map(e=>THREE.MathUtils.lerp(e.a.u,e.b.u,(v-e.a.v)/(e.b.v-e.a.v)));u=THREE.MathUtils.clamp(u,limits[0]-.01,limits[1]+.01);}
    const p = point(u, v); return new THREE.Vector3(p[0], y, p[1]);
  };
  function tri(s: Surface, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: number) { const tint = new THREE.Color(color); for (const p of [a, b, c]) { s.positions.push(p.x, p.y, p.z); s.colors.push(tint.r, tint.g, tint.b); } }
  function quad(s: Surface, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, color: number) { tri(s, a, b, c, color); tri(s, a, c, d, color); }
  function box(s: Surface, u: number, y: number, v: number, w: number, h: number, depth: number, color: number) { const tint = new THREE.Color(color); for (let i = 0; i < cv.count; i++) { const p = world(u+cv.getX(i)*w,y+cv.getY(i)*h,v+cv.getZ(i)*depth); s.positions.push(p.x, p.y, p.z); s.colors.push(tint.r, tint.g, tint.b); } }
  function component(name: string, draw: () => void, material: 'stone' | 'glass' = 'stone', convex = false) {
    const starts = surfaces.map(s => s.positions.length);clipBody=name!=='continuous-ground-corridor'&&name!=='mapped-step-crossing-apron';draw();clipBody=false;
    const ranges = surfaces.map((surface, i) => ({ surface, start: starts[i], end: surface.positions.length, original: new Float32Array(surface.positions.slice(starts[i])) }));
    const vertices: THREE.Vector3[] = []; for (const r of ranges) for (let i = r.start; i < r.end; i += 3) vertices.push(new THREE.Vector3(r.surface.positions[i], r.surface.positions[i + 1], r.surface.positions[i + 2]));
    const rotation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(axis, up, normal)), inverse = rotation.clone().invert();
    const bounds = new THREE.Box3().setFromPoints(vertices.map(p => p.clone().applyQuaternion(inverse))), center = bounds.getCenter(new THREE.Vector3()).applyQuaternion(rotation), size = bounds.getSize(new THREE.Vector3());
    const proxy: THREE.Mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: material === 'glass' ? 0x465b5e : 0xd5d4c9 }));
    proxy.position.copy(center); proxy.quaternion.copy(rotation); proxy.scale.copy(size); let collisionVertices: Float32Array | undefined;
    if (convex) { proxy.geometry.dispose(); proxy.geometry = new ConvexGeometry(vertices.map(p => p.clone().sub(center).applyQuaternion(inverse))); proxy.scale.setScalar(1); collisionVertices = Float32Array.from(proxy.geometry.getAttribute('position').array); }
    Object.assign(proxy.userData, { buildingId: 'way/389628348', connectionId: shell.name, landmark: 'engineering31-30-connection', component: name, renderProxy: true, convex, glazingTriangles: [starts[2] / 9, glass.positions.length / 9] }); proxy.updateMatrixWorld(true);
    parts.push({ proxy, ranges, shown: true }); breakables.push({ mesh: proxy, size, collisionVertices, toughness: material === 'glass' ? 5 : 9, material, label: '31동과 30동 연결부' });
  }
  function slab(u0: number, u1: number, v0: number, v1: number, y0: number, y1: number, name: string, thickness = .16) {
    component(name, () => { const p = [world(u0, y0, v0), world(u1, y1, v0), world(u1, y1, v1), world(u0, y0, v1)], b = p.map(q => q.clone().addScaledVector(up, -thickness)); quad(wall, p[0], p[3], p[2], p[1], 0xc9c9bd); quad(wall, b[0], b[1], b[2], b[3], 0xb9bcb2); for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(wall, p[i], p[j], b[j], b[i], 0xbfc2b7); } }, 'stone', true);
  }
  for (let i = 0; i < layout.floorStations.length - 1; i++) { const a = layout.floorStations[i], b = layout.floorStations[i + 1]; slab(a.u, b.u, -2.8, 2.8, a.y, b.y, 'continuous-ground-corridor'); }
  // 남쪽 계단에만 접속판을 둔다. 북쪽 서비스 도로의 회차 공간은 원래 지면으로 유지한다.
  for (const sign of observed ? [] : [-1]) for (let j = 0; j < 4; j++) {
    const u0 = layout.crossing - 2.3 + j * 1.15, u1 = u0 + 1.15, v0 = sign * 2.8, v1 = sign * 4.4;
    const p0 = point(u0, v1), p1 = point(u1, v1), a = world(u0, floorAt(u0), v0), b = world(u1, floorAt(u1), v0), c = world(u1, heightAt(...p1) + .06, v1), d = world(u0, heightAt(...p0) + .06, v1);
    component('mapped-step-crossing-apron', () => { const top = [a, b, c, d], bottom = top.map(p => p.clone().addScaledVector(up, -.13)); quad(wall, a, b, c, d, 0xbfc2b6); quad(wall, bottom[3], bottom[2], bottom[1], bottom[0], 0xbfc2b6); for (let k = 0; k < 4; k++) { const n = (k + 1) % 4; quad(wall, top[k], bottom[k], bottom[n], top[n], 0xbfc2b6); } }, 'stone', true);
  }
  const cuts = [layout.start, layout.end, layout.crossing - layout.crossingWidth / 2, layout.crossing + layout.crossingWidth / 2, ...(observed?[5,11]:[])]; for (let u = 4.5; u < layout.length; u += 4.5) cuts.push(u); cuts.sort((a, b) => a - b);
  for (let i = 0; i < cuts.length - 1; i++) {
    const u0 = cuts[i], u1 = cuts[i + 1], u = (u0 + u1) / 2, width = u1 - u0, crossing = Math.abs(u - layout.crossing) < layout.crossingWidth / 2;
    for (const v of [-3, 3]) {
      const levels = [[Math.min(floorAt(u0), floorAt(u1)), layout.ceiling], ...layout.upperFloors.slice(0,-1).map((y:number,j:number)=>[y,layout.upperFloors[j+1]])];
      for (let level = 0; level < levels.length; level++) {
        if (level === 0 && (crossing || (observed&&v>0&&u>5&&u<11))) continue;
        const [bottom, top] = levels[level], low = (level === 0 ? Math.max(floorAt(u0), floorAt(u1)) : bottom) + .75, high = top - .65;
        component('white-horizontal-window-bay', () => {
          const strip = (s: Surface, x: number, w: number, y0: number, y1: number, d: number, color: number) => { if (y1 > y0) box(s, x, (y0 + y1) / 2, v, w, y1 - y0, d, color); };
          strip(wall, u, width, bottom, low, .14, 0xdadacf); strip(wall, u, width, high, top, .14, 0xdadacf);
          strip(wall, u0 + .09, .18, low, high, .14, 0xdadacf); strip(wall, u1 - .09, .18, low, high, .14, 0xdadacf);
          strip(glass, u, Math.max(.01, width - .36), low, high, .035, 0x485a5b);
          for (let x = u0 + .18; x < u1; x += 1.05) strip(trim, x, .045, low, high, .15, 0x4c5754);
          for (const y of [low, high]) box(trim, u, y, v, width, .045, .15, 0x4c5754);
        });
      }
    }
    for (const y of layout.upperFloors) slab(u0, u1, -3.08, 3.08, y, y, y === layout.upperFloors.at(-1) ? 'flat-connector-roof' : 'upper-floor-slab', .2);
    for (const v of [-3.05, 3.05]) component('flat-roof-parapet', () => box(trim, u, layout.upperFloors.at(-1)! + .18, v, width, .36, .16, 0xd5d5ca));
  }
  for (const [s, name, roughness] of [[wall, 'walls-and-decks', .86], [trim, 'frames-and-parapet', .65], [glass, 'glazing', .3]] as const) { const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(s.positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(s.colors, 3)); (geometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage); geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); s.geometry = geometry; const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness })); mesh.name = 'engineering31-30-' + name; mesh.receiveShadow = true; shell.add(mesh); }
  function update(_player: THREE.Vector3) { const changed = new Set<Surface>(); for (const p of parts) if (p.shown !== p.proxy.visible) { p.shown = p.proxy.visible; for (const r of p.ranges) { if (r.start === r.end) continue; const a = r.surface.geometry!.getAttribute('position') as THREE.BufferAttribute; if (!changed.has(r.surface)) a.clearUpdateRanges(); changed.add(r.surface); if (p.shown) (a.array as Float32Array).set(r.original, r.start); else for (let i = r.start; i < r.end; i += 3) { a.array[i] = p.proxy.position.x; a.array[i + 1] = p.proxy.position.y; a.array[i + 2] = p.proxy.position.z; } a.addUpdateRange(r.start, r.end - r.start); } } for (const s of changed) s.geometry!.getAttribute('position').needsUpdate = true; shell.visible = parts.some(p => p.proxy.visible); }
  return { breakables, update, layout };
}
