import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import type { CampusBuilding } from './fullCampus';
import { humanities23Frame } from './humanities23Site';

type XZ = [number, number];
type Frame = ReturnType<typeof humanities23Frame>;
type Proxy = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
export const HUMANITIES4_ID = 'way/167666702';

/** 공식 캠퍼스 사진의 전면과 지도상의 외곽을 결합한다. 높이와 시설 치수는 근사다. */
export function createHumanities4Landmark(scene: THREE.Scene, building: CampusBuilding, heightAt: (x: number, z: number) => number) {
  const shell = new THREE.Group(); shell.name = 'landmark/humanities4';
  Object.assign(shell.userData, { role: 'building-shell', buildingId: building.id, landmark: 'humanities4', mappedOutline: building.points }); scene.add(shell);
  const distant = new THREE.Group(); distant.name = `${building.id}:humanities4-distant`; distant.visible = false;
  Object.assign(distant.userData, { role: 'distant-building', buildingId: building.id }); scene.add(distant);
  const ring = building.points.slice(0, -1), frames = ring.map((p, i) => humanities23Frame(p, ring[(i + 1) % ring.length]));
  const base = heightAt(ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length), floor = base + .39;
  const breakables: BreakableSpec[] = [], pavementMasks: { component: string; polygon: XZ[] }[] = [];
  const batches = [false, true].map(glass => ({ glass, positions: [] as number[], colors: [] as number[], parts: [] as { proxy: Proxy; start: number; end: number; original: Float32Array; colors: Float32Array; base: THREE.Color; color: number; shown: boolean }[] }));
  const at = (f: Frame, s: number, y: number, n = 0) => { const p = f.point(s, n); return new THREE.Vector3(p[0], y, p[1]); };
  function part(name: string, vertices: THREE.Vector3[], color: number, material: BreakableSpec['material'] = 'stone', owner?: Proxy, flat = false) {
    const bounds = new THREE.Box3().setFromPoints(vertices), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const g = flat ? new THREE.BufferGeometry() : new ConvexGeometry(vertices.map(p => p.clone().sub(center)));
    if (flat) { const values: number[] = []; for (let i = 1; i + 1 < vertices.length; i++) for (const p of [vertices[0], vertices[i], vertices[i + 1]]) values.push(...p.clone().sub(center).toArray()); g.setAttribute('position', new THREE.Float32BufferAttribute(values, 3)); }
    const attr = g.attributes.position, proxy = owner ?? new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color }));
    if (!owner) { proxy.position.copy(center); proxy.updateMatrixWorld(true); Object.assign(proxy.userData, { buildingId: building.id, component: name, renderProxy: true, convex: true }); breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attr.array), toughness: material === 'glass' ? 2 : 8, material, label: '4동 신양인문학술정보관' }); }
    const b = batches[material === 'glass' ? 1 : 0], start = b.positions.length, tint = new THREE.Color(color);
    for (let i = 0; i < attr.count; i++) { b.positions.push(attr.getX(i) + center.x, attr.getY(i) + center.y, attr.getZ(i) + center.z); b.colors.push(tint.r, tint.g, tint.b); }
    b.parts.push({ proxy, start, end: b.positions.length, original: Float32Array.from(b.positions.slice(start)), colors: Float32Array.from(b.colors.slice(start)), base: proxy.material.color.clone(), color: proxy.material.color.getHex(), shown: true });
    if (owner) g.dispose(); return proxy;
  }
  function box(name: string, f: Frame, s0: number, s1: number, n0: number, n1: number, y0: number, y1: number, color = 0xd9dcd4, material: BreakableSpec['material'] = 'stone', owner?: Proxy) {
    const v: THREE.Vector3[] = []; for (const s of [s0, s1]) for (const n of [n0, n1]) for (const y of [y0, y1]) v.push(at(f, s, y, n)); return part(name, v, color, material, owner);
  }
  function beam(name: string, a: THREE.Vector3, b: THREE.Vector3, radius: number, color: number, owner?: Proxy) {
    const d = b.clone().sub(a), g = new THREE.CylinderGeometry(radius, radius, d.length(), 8), rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), center = a.clone().add(b).multiplyScalar(.5), p = g.attributes.position;
    const result = part(name, Array.from({ length: p.count }, (_, i) => new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).applyQuaternion(rotation).add(center)), color, 'metal', owner); g.dispose(); return result;
  }
  function facet(name: string, f: Frame, s0: number, s1: number, y0: number, y1: number, n: number, color: number, owner: Proxy) { part(name, [at(f, s0, y0, n), at(f, s1, y0, n), at(f, s1, y1, n), at(f, s0, y1, n)], color, 'stone', owner, true); }
  const terrain = scene.getObjectByName('campus-terrain') as THREE.Mesh<THREE.BufferGeometry>, tp = terrain.geometry.attributes.position, ti = terrain.geometry.index;
  const terrainTriangles: THREE.Vector3[][] = [];
  for (let i = 0; i < (ti?.count ?? tp.count); i += 3) { const t = [0, 1, 2].map(j => { const k = ti ? ti.getX(i + j) : i + j; return new THREE.Vector3(tp.getX(k), tp.getY(k), tp.getZ(k)); }); if (Math.max(...t.map(v => v.x)) > 389 && Math.min(...t.map(v => v.x)) < 452 && Math.max(...t.map(v => v.z)) > -663 && Math.min(...t.map(v => v.z)) < -586) terrainTriangles.push(t); }
  function ground(p: XZ) { const [x, z] = p; for (const [a, b, c] of terrainTriangles) { const det = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x), u = ((x - a.x) * (c.z - a.z) - (z - a.z) * (c.x - a.x)) / det, v = ((b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x)) / det; if (u >= -1e-7 && v >= -1e-7 && u + v <= 1.0000001) return a.y + u * (b.y - a.y) + v * (c.y - a.y); } throw Error('Missing humanities 4 terrain'); }
  function clip(poly: THREE.Vector3[], distance: (p: THREE.Vector3) => number) { const out: THREE.Vector3[] = []; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], da = distance(a), db = distance(b); if (da >= -1e-8) out.push(a); if ((da >= -1e-8) !== (db >= -1e-8)) out.push(a.clone().lerp(b, da / (da - db))); } return out; }
  const planes = (poly: XZ[]) => { const sign = Math.sign(poly.reduce((n, a, i) => { const b = poly[(i + 1) % poly.length]; return n + a[0] * b[1] - b[0] * a[1]; }, 0)); return poly.map((a, i) => { const b = poly[(i + 1) % poly.length]; return (p: THREE.Vector3) => sign * ((b[0] - a[0]) * (p.z - a[1]) - (b[1] - a[1]) * (p.x - a[0])); }); };
  const area = (p: THREE.Vector3[]) => Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a.x * b.z - b.x * a.z; }, 0));
  function subtract(poly: THREE.Vector3[], mask: XZ[]) { const ps = planes(mask); if (area(ps.reduce((p, fn) => clip(p, fn), poly)) < 1e-8) return [poly]; let rest = poly; const out: THREE.Vector3[][] = []; for (const fn of ps) { const p = clip(rest, v => -fn(v)); if (p.length >= 3 && area(p) > 1e-8) out.push(p); rest = clip(rest, fn); } return out; }
  const masks = (f: Frame, s0: number, s1: number, n0: number, n1: number) => [f.point(s0, n0), f.point(s1, n0), f.point(s1, n1), f.point(s0, n1)];
  const footprints = THREE.ShapeUtils.triangulateShape(ring.map(p => new THREE.Vector2(...p)), []).map(tri => tri.map(i => ring[i]));
  function paving(f: Frame, s0: number, s1: number, n0: number, n1: number, component: string) {
    const excluded = [...footprints, ...pavementMasks.map(m => m.polygon)];
    for (let s = s0; s < s1 - .001; s += 2.6) for (let n = n0; n < n1 - .001; n += 2.6) {
      const ss = Math.min(s1, s + 2.6), nn = Math.min(n1, n + 2.6), ps = planes(masks(f, s, ss, n, nn));
      for (const tri of terrainTriangles) { let pieces = [ps.reduce((p, fn) => clip(p, fn), tri)].filter(p => p.length >= 3 && area(p) > 1e-8); for (const mask of excluded) pieces = pieces.flatMap(p => subtract(p, mask));
        for (const poly of pieces) { const top = poly.map(v => v.clone().add(new THREE.Vector3(0, .045, 0))), owner = part(component, [...top, ...top.map(v => v.clone().add(new THREE.Vector3(0, -.12, 0)))], (Math.floor(s / 2.6) + Math.floor(n / 2.6)) % 3 === 0 ? 0x9e9c92 : 0xb5b5ab); pavementMasks.push({ component, polygon: poly.map(v => [v.x, v.z]) });
          for (const axis of ['s', 'n'] as const) for (let t = axis === 's' ? s + .25 : n + .5; t < (axis === 's' ? ss : nn); t += axis === 's' ? .25 : .5) { let joint = clip(poly, v => f.local([v.x, v.z])[axis] - t); joint = clip(joint, v => t + .009 - f.local([v.x, v.z])[axis]); if (joint.length >= 3 && area(joint) > 1e-8) part('paving-joint', joint.map(v => v.clone().add(new THREE.Vector3(0, .047, 0))), 0x81867f, 'stone', owner, true); }
        }
      }
    }
  }
  // 전면 4개 지도 선분을 따라 패널을 배치한다. 사진에 없는 후면은 단순한 벽과 창으로 둔다.
  const palette = [0x9eafb0, 0xc1cbca, 0x9eafb0, 0x73888b, 0xb3c4c1, 0x627a7f, 0xb5c3c0, 0x31849a, 0xa9bfbd, 0x53636a, 0xa6b7b6];
  const stepSamples: { point: XZ; top: number }[] = [];
  for (const [edge, f] of frames.entries()) {
    const front = edge < 4;
    const sections = Math.ceil(f.length / 2.3), bay = f.length / sections;
    for (let j = 0; j < sections; j++) {
      const s = j * bay, end = s + bay;
      if (front) {
        const owner = box('front-panel-bay', f, s, end, -.02, .16, floor + 3.15, floor + 11.55, 0x737f7d);
        for (let row = 0; row < 9; row++) for (let col = 0; col < 2; col++) { const a = s + col * bay / 2 + .023, b = s + (col + 1) * bay / 2 - .023, y0 = floor + 3.18 + row * .93; facet('small-coloured-glass-panel', f, a, b, y0, y0 + .895, -.029, palette[(edge * 17 + j * 7 + col * 3 + row * 5) % palette.length], owner); }
        box('roof-window-strip', f, s, end, .55, .69, floor + 11.55, floor + 13.2, 0x758e91, 'glass');
        box('roof-strip-mullion', f, s, s + .06, .47, .7, floor + 11.55, floor + 13.2, 0xc6cecb);
        // 게임에서는 문을 열어 두며 실내는 짧은 출입 공간까지만 표현한다.
        const doorMin = edge === 2 ? 4.6 : Infinity, doorMax = 7.0;
        for (const [a, b] of [[s, Math.min(end, doorMin)], [Math.max(s, doorMax), end]].filter(([a, b], i) => b - a > .001 && (i === 0 || edge === 2))) {
          box('recessed-ground-glass', f, a + .03, b - .03, 1.08, 1.17, floor + .1, floor + 3.12, 0x647f80, 'glass');
          box('ground-window-frame', f, a, a + .045, 1.01, 1.2, floor, floor + 3.15, 0xbfc5c0);
        }
        if (edge !== 2 || s + .12 < 4.35 || s + .12 > 7.2) beam('round-porch-column', at(f, s + .12, floor, .2), at(f, s + .12, floor + 3.15, .2), .16, 0xbfc1b8);
        box('porch-floor', f, s, end, -.4, 1.3, floor - .22, floor, 0x8d8e83);
        const low = Math.min(ground(f.point(s, -2.2)), ground(f.point(end, -2.2))) + .045, count = Math.max(2, Math.ceil((floor - low) / .16));
        for (let k = 0; k < count; k++) { const n0 = -2.2 + 1.8 * k / count, n1 = -2.2 + 1.8 * (k + 1) / count, top = low + (floor - low) * (k + 1) / count, step = box('front-entrance-step', f, s, end, n0, n1, low - .15, top, 0xa6a69a); box('step-nosing', f, s, end, n0, n0 + .025, top, top + .003, 0xd1cdbb, 'stone', step); stepSamples.push({ point: f.point((s + end) / 2, (n0 + n1) / 2), top }); }
        pavementMasks.push({ component: 'front-entrance-step', polygon: masks(f, s, end, -2.2, 1.3) });
      } else {
        const bottom = Math.min(base - .6, ground(f.point((s + end) / 2))); const owner = box('unobserved-side-wall', f, s, end, -.04, .25, bottom, floor + 13.2, 0xa9afa9);
        for (let level = 0; level < 4; level++) facet('side-window', f, s + .28, end - .28, floor + .9 + level * 3.1, floor + 2.8 + level * 3.1, -.05, 0x71898b, owner);
      }
      const cap = box('white-projecting-roof-edge', f, s, end, -.45, .45, floor + 13.16, floor + 13.48);
      beam('roof-safety-rail', at(f, s, floor + 14.1, .18), at(f, end, floor + 14.1, .18), .025, 0xb3bcb7, cap);
      beam('roof-rail-post', at(f, s, floor + 13.45, .18), at(f, s, floor + 14.1, .18), .022, 0xb3bcb7, cap);
    }
  }
  for (const tri of footprints) { const top = tri.map(([x, z]) => new THREE.Vector3(x, floor + 13.25, z)); part('footprint-roof', [...top, ...top.map(v => v.clone().add(new THREE.Vector3(0, -.24, 0)))], 0xb2b5a8); }
  const entry = frames[2], entryS = 5.8;
  box('entry-vestibule-floor', entry, 4.45, 7.15, 1.3, 4, floor - .22, floor, 0xa3a79e);
  box('entry-vestibule-back', entry, 4.45, 7.15, 3.85, 4, floor, floor + 3.15, 0xaeb7ad);
  for (const s of [4.45, 7.15]) box('entry-vestibule-side', entry, s - .05, s + .05, 1.2, 4, floor, floor + 3.15, 0xaeb7ad);
  box('entry-lintel', entry, 4.45, 7.15, 1.0, 1.23, floor + 2.65, floor + 3.15, 0xcbd0c9);
  for (const s of [4.65, 6.95]) { const door = box('open-glass-door', entry, s - .035, s + .035, 1.2, 2.2, floor + .04, floor + 2.62, 0x668485, 'glass'); beam('door-handle', at(entry, s, floor + .85, 1.8), at(entry, s, floor + 1.5, 1.8), .022, 0xd2d6cf, door); }
  const signs: { mesh: THREE.Mesh; owner: Proxy }[] = [];
  function sign(text: string, f: Frame, s: number, n: number, y: number, width: number, height: number, background: string, color: string) {
    const owner = box('observed-sign', f, s - width / 2, s + width / 2, n, n + .13, y, y + height, Number.parseInt(background.slice(1), 16), 'metal');
    const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 512; const ctx = canvas.getContext('2d')!; ctx.fillStyle = background; ctx.fillRect(0, 0, 128, 512); ctx.fillStyle = color; ctx.font = '600 54px "Malgun Gothic", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; Array.from(text).forEach((letter, i, all) => ctx.fillText(letter, 64, 45 + i * 420 / Math.max(1, all.length - 1), 112));
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
    const origin = f.point(0), outer = f.point(0, -1), normal = new THREE.Vector3(outer[0] - origin[0], 0, outer[1] - origin[1]), right = new THREE.Vector3(normal.z, 0, -normal.x), mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height).scale(-1, 1, 1), new THREE.MeshStandardMaterial({ map, side: THREE.DoubleSide }));
    mesh.position.copy(at(f, s, y + height / 2, n - .01)); mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, new THREE.Vector3(0, 1, 0), normal)); mesh.name = 'humanities4-sign'; mesh.userData.text = text; shell.add(mesh); signs.push({ mesh, owner });
  }
  sign('우리은행', frames[3], 1, -.8, floor, .43, 2.35, '#076ea4', '#ffffff');
  sign('신양인문학술정보관', entry, 4.1, -.8, floor, .37, 2.65, '#deded3', '#294b4b');
  // 흰 곡선 프레임에는 사진에서 확인되지 않은 불투명 지붕을 덮지 않는다.
  for (const [edge, stations] of [[0, [2, 5, 8, 11]], [1, [1.3, 4.2]], [2, [1.1, 3.5]]] as [number, number[]][]) {
    const f = frames[edge]; for (const s of stations.filter(s => s < f.length - .1)) { const pts = Array.from({ length: 9 }, (_, k) => { const t = k / 8; return at(f, s, floor + 2.85 * t, -1.45 - .45 * Math.sin(Math.PI * t)); }); for (let k = 1; k < pts.length; k++) beam('curved-white-frame', pts[k - 1], pts[k], .065, 0xe2e4db); }
    beam('pergola-top-rail', at(f, .3, floor + 2.85, -1.45), at(f, f.length - .3, floor + 2.85, -1.45), .075, 0xe2e4db);
  }
  function bench(f: Frame, s: number, n: number, y: number, width = 2.2) { const owner = box('timber-bench', f, s, s + width, n, n + .48, y + .4, y + .48, 0x6b4d38, 'wood'); box('bench-back', f, s, s + width, n + .42, n + .49, y + .48, y + .95, 0x71523d, 'wood', owner); for (const u of [s + .2, s + width - .2]) box('bench-leg', f, u, u + .07, n + .08, n + .4, y, y + .4, 0x49514a, 'metal', owner); }
  bench(frames[0], 3, .1, floor); bench(frames[1], 1, .1, floor);
  const rf = frames[3], rack = box('bicycle-rack', rf, 1.8, 4.5, -.25, .2, floor, floor + .08, 0xa7b4b0, 'metal');
  for (let s = 2; s < 4.5; s += .5) { beam('rack-loop', at(rf, s, floor, -.1), at(rf, s, floor + .7, .4), .025, 0xb5c1bc, rack); beam('rack-loop', at(rf, s + .25, floor, -.1), at(rf, s + .25, floor + .7, .4), .025, 0xb5c1bc, rack); beam('rack-loop', at(rf, s, floor + .7, .4), at(rf, s + .25, floor + .7, .4), .025, 0xb5c1bc, rack); }
  // 포장면은 원본 지형 삼각면을 잘라 만들며 지도 보행로와 같은 높이로 잇는다.
  for (const f of frames.slice(0, 4)) paving(f, 0, f.length, -6.2, -2.2, 'front-court-paving');
  const paths: XZ[][] = [[[418.88, -659.28], [421.1, -652.49], [431.39, -627.81], [432.88, -625.79]], [[395.33, -609.72], [431.39, -627.81]]];
  for (const path of paths) for (let i = 1; i < path.length; i++) { const f = humanities23Frame(path[i - 1], path[i]); paving(f, -.12, f.length + .12, -1.25, 1.25, 'mapped-approach-paving'); }
  const court = frames[0], gravelY = ground(court.point(6, -7.8)), gravel = box('stone-garden-bed', court, 3.3, 8.1, -8.5, -7.1, gravelY - .2, gravelY + .04, 0x7f8b85);
  for (const [s, n, radius] of [[4, -8, .55], [5.4, -7.7, .65], [6.7, -8, .55], [7.5, -7.7, .44]]) { const p = court.point(s, n), g = new THREE.IcosahedronGeometry(radius, 0), a = g.attributes.position; part('rough-garden-stone', Array.from({ length: a.count }, (_, i) => new THREE.Vector3(a.getX(i) + p[0], a.getY(i) * .8 + gravelY + .42, a.getZ(i) + p[1])), 0xb8bdb4, 'stone', gravel); g.dispose(); }
  bench(frames[2], .2, -8.7, ground(frames[2].point(1.3, -8.5)), 3.1);
  for (const [f, s, n] of [[frames[1], 1, -7], [frames[3], 2.6, -5.2]] as [Frame, number, number][]) { const y = ground(f.point(s, n)); const planter = box('low-planter-edge', f, s - .85, s + .85, n - .65, n + .65, y - .05, y + .28, 0xcbd0c4); box('clipped-hedge', f, s - .76, s + .76, n - .56, n + .56, y + .28, y + .7, 0x647a40, 'wood', planter); }
  // 사진의 앞마당 낙엽수를 참고한다. 수종과 정확한 가지 형태는 미확인이다.
  for (const [f, s, n] of [[frames[0], 9, -6.8], [frames[2], 1, -6.8]] as [Frame, number, number][]) {
    const p = f.point(s, n), y = ground(p), trunk = beam('courtyard-tree-trunk', new THREE.Vector3(p[0], y, p[1]), new THREE.Vector3(p[0] + .2, y + 5.5, p[1] + .25), .19, 0x756b51);
    for (let k = 0; k < 7; k++) { const angle = k * 2.4, start = new THREE.Vector3(p[0] + .1, y + 2.6 + k * .38, p[1] + .13), end = new THREE.Vector3(p[0] + Math.cos(angle) * 2.2, y + 6.4 + k * .23, p[1] + Math.sin(angle) * 2.2); beam('tree-branch', start, end, .055, 0x756b51, trunk); for (let j = 0; j < 3; j++) { const from = start.clone().lerp(end, .45 + j * .2), tip = end.clone().add(new THREE.Vector3(Math.cos(angle + j) * .8, .6 + j * .3, Math.sin(angle + j) * .8)); beam('tree-twig', from, tip, .017, 0x756b51, trunk); } }
  }
  const meshes = batches.map(b => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(b.positions, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(b.colors, 3)); g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere(); const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: b.glass ? .22 : .68, side: THREE.DoubleSide, transparent: b.glass, opacity: b.glass ? .55 : 1, depthWrite: !b.glass })); mesh.name = b.glass ? 'humanities4-glass' : 'humanities4-surfaces'; mesh.castShadow = !b.glass; mesh.receiveShadow = true; shell.add(mesh); return mesh; });
  shell.userData.humanities4Access = { buildingId: building.id, floor, pavementMasks, stepSamples, entryRoute: [entry.point(entryS, -4.8), entry.point(entryS, -2.3), entry.point(entryS, .4), entry.point(entryS, 2.7)], paths, source: 'https://map.snu.ac.kr/api/upload/default/F_BUILD_0000004.jpg', captureDate: null, dimensionsEstimated: true, heightEstimated: true, rearAppearanceUnobserved: true, wholeInteriorImplemented: false, connectionTo3Implemented: false, doorsOpenedForGameplay: true, geometry: { meshes: 2, signMeshes: 2, textures: 2, triangles: batches.reduce((n, b) => n + b.positions.length / 9, 0), colliders: breakables.length } };
  function update(_player: THREE.Vector3) { batches.forEach((b, index) => { const a = meshes[index].geometry.attributes.position as THREE.BufferAttribute, c = meshes[index].geometry.attributes.color as THREE.BufferAttribute; let moved = false, tinted = false;
    for (const p of b.parts) { if (p.shown !== p.proxy.visible) { p.shown = p.proxy.visible; moved = true; if (p.shown) (a.array as Float32Array).set(p.original, p.start); else for (let i = p.start; i < p.end; i += 3) { a.array[i] = p.proxy.position.x; a.array[i + 1] = p.proxy.position.y; a.array[i + 2] = p.proxy.position.z; } } if (p.color !== p.proxy.material.color.getHex()) { p.color = p.proxy.material.color.getHex(); tinted = true; const t = p.proxy.material.color, scale = [t.r / p.base.r, t.g / p.base.g, t.b / p.base.b]; for (let i = p.start; i < p.end; i++) c.array[i] = p.colors[i - p.start] * scale[(i - p.start) % 3]; } }
    if (moved) a.needsUpdate = true; if (tinted) c.needsUpdate = true;
  }); for (const s of signs) s.mesh.visible = s.owner.visible; shell.visible = batches.some(b => b.parts.some(p => p.proxy.visible)); }
  // 렌더 버퍼와 복원용 사본을 만든 뒤 조립용 배열을 비운다.
 for(const batch of batches){batch.positions.length=0;batch.colors.length=0;}
 return { shell, breakables, update };
}
