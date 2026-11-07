import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import type { CampusBuilding } from './fullCampus';
import { humanities23Frame } from './humanities23Site';

type XZ = [number, number];
type Frame = ReturnType<typeof humanities23Frame>;
type Proxy = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
export const HUMANITIES8_ID = 'way/238937058';

/** 공식 캠퍼스 사진의 전면과 지도상의 외곽을 결합한다. 높이와 시설 치수는 근사다. */
export function createHumanities8Landmark(scene: THREE.Scene, building: CampusBuilding, heightAt: (x: number, z: number) => number) {
  const shell = new THREE.Group(); shell.name = 'landmark/humanities8';
  Object.assign(shell.userData, { role: 'building-shell', buildingId: building.id, landmark: 'humanities8', mappedOutline: building.points }); scene.add(shell);
  const distant = new THREE.Group(); distant.name = `${building.id}:humanities8-distant`; distant.visible = false;
  Object.assign(distant.userData, { role: 'distant-building', buildingId: building.id }); scene.add(distant);
  const ring = building.points.slice(0, -1).reverse(), frames = ring.map((p, i) => humanities23Frame(p, ring[(i + 1) % ring.length]));
  const base = heightAt(ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length), floor = Math.max(heightAt(480.4, -701.47), heightAt(485.2, -704.75)) + .35;
  const breakables: BreakableSpec[] = [], pavementMasks: { component: string; polygon: XZ[] }[] = [];
  const batches = [false, true].map(glass => ({ glass, positions: [] as number[], colors: [] as number[], parts: [] as { proxy: Proxy; start: number; end: number; original: Float32Array; colors: Float32Array; base: THREE.Color; color: number; shown: boolean }[] }));
  const at = (f: Frame, s: number, y: number, n = 0) => { const p = f.point(s, n); return new THREE.Vector3(p[0], y, p[1]); };
  function part(name: string, vertices: THREE.Vector3[], color: number, material: BreakableSpec['material'] = 'stone', owner?: Proxy, flat = false) {
    const bounds = new THREE.Box3().setFromPoints(vertices), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const g = flat ? new THREE.BufferGeometry() : new ConvexGeometry(vertices.map(p => p.clone().sub(center)));
    if (flat) { const values: number[] = []; for (let i = 1; i + 1 < vertices.length; i++) for (const p of [vertices[0], vertices[i], vertices[i + 1]]) values.push(...p.clone().sub(center).toArray()); g.setAttribute('position', new THREE.Float32BufferAttribute(values, 3)); }
    const attr = g.attributes.position, proxy = owner ?? new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color }));
    if (!owner) { proxy.position.copy(center); proxy.updateMatrixWorld(true); Object.assign(proxy.userData, { buildingId: building.id, component: name, renderProxy: true, convex: true }); breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attr.array), toughness: material === 'glass' ? 2 : 8, material, label: '8동 두산인문관' }); }
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
  for (let i = 0; i < (ti?.count ?? tp.count); i += 3) { const t = [0, 1, 2].map(j => { const k = ti ? ti.getX(i + j) : i + j; return new THREE.Vector3(tp.getX(k), tp.getY(k), tp.getZ(k)); }); if (Math.max(...t.map(v => v.x)) > 438 && Math.min(...t.map(v => v.x)) < 531 && Math.max(...t.map(v => v.z)) > -739 && Math.min(...t.map(v => v.z)) < -665) terrainTriangles.push(t); }
  function ground(p: XZ) { const [x, z] = p; for (const [a, b, c] of terrainTriangles) { const det = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x), u = ((x - a.x) * (c.z - a.z) - (z - a.z) * (c.x - a.x)) / det, v = ((b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x)) / det; if (u >= -1e-7 && v >= -1e-7 && u + v <= 1.0000001) return a.y + u * (b.y - a.y) + v * (c.y - a.y); } throw Error('Missing humanities 4 terrain'); }
  function clip(poly: THREE.Vector3[], distance: (p: THREE.Vector3) => number) { const out: THREE.Vector3[] = []; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], da = distance(a), db = distance(b); if (da >= -1e-8) out.push(a); if ((da >= -1e-8) !== (db >= -1e-8)) out.push(a.clone().lerp(b, da / (da - db))); } return out; }
  const planes = (poly: XZ[]) => { const sign = Math.sign(poly.reduce((n, a, i) => { const b = poly[(i + 1) % poly.length]; return n + a[0] * b[1] - b[0] * a[1]; }, 0)); return poly.map((a, i) => { const b = poly[(i + 1) % poly.length]; return (p: THREE.Vector3) => sign * ((b[0] - a[0]) * (p.z - a[1]) - (b[1] - a[1]) * (p.x - a[0])); }); };
  const area = (p: THREE.Vector3[]) => Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a.x * b.z - b.x * a.z; }, 0));
  function subtract(poly: THREE.Vector3[], mask: XZ[]) { const ps = planes(mask); if (area(ps.reduce((p, fn) => clip(p, fn), poly)) < 1e-8) return [poly]; let rest = poly; const out: THREE.Vector3[][] = []; for (const fn of ps) { const p = clip(rest, v => -fn(v)); if (p.length >= 3 && area(p) > 1e-8) out.push(p); rest = clip(rest, fn); } return out; }
  const masks = (f: Frame, s0: number, s1: number, n0: number, n1: number) => [f.point(s0, n0), f.point(s1, n0), f.point(s1, n1), f.point(s0, n1)];
  const footprints = THREE.ShapeUtils.triangulateShape(ring.map(p => new THREE.Vector2(...p)), []).map(tri => tri.map(i => ring[i]));
  function paving(f: Frame, s0: number, s1: number, n0: number, n1: number, component: string, lift?: (p: THREE.Vector3) => number) {
    const excluded = [...footprints, ...pavementMasks.map(m => m.polygon)];
    for (let s = s0; s < s1 - .001; s += 2.6) for (let n = n0; n < n1 - .001; n += 2.6) {
      const ss = Math.min(s1, s + 2.6), nn = Math.min(n1, n + 2.6), ps = planes(masks(f, s, ss, n, nn));
      for (const tri of terrainTriangles) { let pieces = [ps.reduce((p, fn) => clip(p, fn), tri)].filter(p => p.length >= 3 && area(p) > 1e-8); for (const mask of excluded) pieces = pieces.flatMap(p => subtract(p, mask));
        for (const poly of pieces) { const top = poly.map(v => v.clone().add(new THREE.Vector3(0, .045 + (lift?.(v) ?? 0), 0))), owner = part(component, [...top, ...top.map(v => v.clone().add(new THREE.Vector3(0, -.12, 0)))], (Math.floor(s / 2.6) + Math.floor(n / 2.6)) % 3 === 0 ? 0x9e9c92 : 0xb5b5ab); pavementMasks.push({ component, polygon: poly.map(v => [v.x, v.z]) });
          for (const axis of ['s', 'n'] as const) for (let t = axis === 's' ? s + .25 : n + .5; t < (axis === 's' ? ss : nn); t += axis === 's' ? .25 : .5) { let joint = clip(poly, v => f.local([v.x, v.z])[axis] - t); joint = clip(joint, v => t + .009 - f.local([v.x, v.z])[axis]); if (joint.length >= 3 && area(joint) > 1e-8) part('paving-joint', joint.map(v => v.clone().add(new THREE.Vector3(0, .047 + (lift?.(v) ?? 0), 0))), 0x81867f, 'stone', owner, true); }
        }
      }
    }
  }
  const front = humanities23Frame([477.87, -694.89], [498.59, -709.08]), portal = { s0: 5.8, s1: 11.6, top: floor + 6.55 }, roof = floor + 20.4;
  const stepSamples: { point: XZ; top: number }[] = [];
  // 2012년 준공 자료와 현재 학교 안내에서 지상 6층을 확인했다. 층고는 근사다.
  for (const [edge, f] of frames.entries()) {
    const isFront = Math.hypot(...f.point(0).map((v, i) => v - front.point(0)[i]) as XZ) < .01;
    const observed = isFront || edge === 0 || edge === 1;
    const sections = Math.ceil(f.length / 2.5), bay = f.length / sections;
    const limits = [...new Set([0, f.length, ...Array.from({ length: sections + 1 }, (_, k) => k * bay), ...(isFront ? [portal.s0, portal.s1] : [])])].sort((a, b) => a - b);
    for (let j = 1; j < limits.length; j++) {
      const s = limits[j - 1], end = limits[j]; if (end - s < .01) continue;
      const insidePortal = isFront && s >= portal.s0 - .001 && end <= portal.s1 + .001;
      const bottom = insidePortal ? portal.top : Math.min(floor - .4, ground(f.point((s + end) / 2)) - .2);
      const wall = box('brick-facade-bay', f, s, end, -.03, .25, bottom, roof, observed ? 0xa4876e : 0x978776);
      // 벽돌 줄눈은 벽과 함께 표시하고 파괴한다.
      if (observed) for (let y = Math.max(bottom, floor - .2); y < roof; y += .22) {
        facet('brick-horizontal-joint', f, s + .01, end - .01, y, y + .012, -.038, 0xc0b3a0, wall);
        for (let ss = s + .31 + ((Math.round((y - floor) / .22) % 2) * .3); ss < end - .03; ss += .62) facet('brick-vertical-joint', f, ss, Math.min(end - .01, ss + .012), y, Math.min(roof, y + .22), -.039, 0xc0b3a0, wall);
      }
      for (let level = 0; level < 6; level++) {
        const y = floor + level * 3.35; if (y < bottom - .01 || end - s < 1.1) continue;
        if (edge === 0 && s > f.length - 7.5) continue;
        if (isFront && level < 2 && (s < portal.s1 + 1 || s > 20)) continue;
        const panelS = s + (level % 2 ? .12 : .32), panelW = Math.min(end - panelS - .12, observed ? 1.12 + (j % 3) * .14 : 1.3);
        if (panelW < .5) continue;
        box('black-window-panel', f, panelS, panelS + panelW, -.18, -.07, y + .14, y + 3.25, 0x343d40, 'metal', wall);
        facet('tall-window-glazing', f, panelS + .1, panelS + panelW - .1, y + .4, y + 2.88, -.19, 0x64818a, wall);
        for (const u of [panelS + .09, panelS + panelW - .13]) box('window-metal-frame', f, u, u + .045, -.22, -.17, y + .38, y + 2.91, 0xa9b3b4, 'metal', wall);
        box('window-horizontal-frame', f, panelS + .09, panelS + panelW - .09, -.22, -.17, y + 2.89, y + 2.94, 0xa9b3b4, 'metal', wall);
      }
      for (let level = 1; level <= 6; level++) { const y = floor + level * 3.35; if (y < bottom) continue; box('black-floor-band', f, s, end, -.2, -.04, y - .09, y + .05, 0x333b3d, 'metal', wall); }
    }
  }
  for (const tri of footprints) { const top = tri.map(([x, z]) => new THREE.Vector3(x, roof, z)); part('footprint-roof', [...top, ...top.map(v => v.clone().add(new THREE.Vector3(0, -.23, 0)))], 0x7d8580); }
  // 왼쪽의 돌출 창 상자는 공식 사진에서 보이는 위치를 근사했다.
  const oriel = box('projecting-black-window-box', front, 2.4, 4.8, -.82, -.12, floor + 10.2, floor + 17.9, 0x354145, 'metal');
  for (let y = floor + 10.55; y < floor + 17.5; y += 3.35) { facet('projecting-window', front, 2.58, 4.62, y, y + 2.7, -.83, 0x78969c, oriel); box('projecting-window-frame', front, 3.45, 3.51, -.88, -.82, y, y + 2.7, 0x9dadaf, 'metal', oriel); }
  box('recessed-entry-floor', front, portal.s0, portal.s1, -.3, 5.8, floor - .22, floor, 0x9a9e93);
  box('recessed-entry-ceiling', front, portal.s0, portal.s1, -.02, 5.8, portal.top - .18, portal.top, 0x373e3d);
  for (const s of [portal.s0, portal.s1]) box('recessed-entry-side', front, s - .06, s + .06, 0, 5.8, floor, portal.top, 0x9c816d);
  const entryS = (portal.s0 + portal.s1) / 2;
  box('vestibule-floor', front, entryS - 1.4, entryS + 1.4, 5.8, 8, floor - .22, floor, 0xa9aea2);
  box('vestibule-back', front, entryS - 1.45, entryS + 1.45, 7.9, 8.05, floor, floor + 3.1, 0x828d83);
  for (const s of [entryS - 1.4, entryS + 1.4]) box('vestibule-side', front, s - .06, s + .06, 5.6, 8, floor, floor + 3.1, 0xa9aea2);
  for (const [s0, s1] of [[portal.s0, entryS - 1.25], [entryS + 1.25, portal.s1]]) box('recessed-entry-glass', front, s0, s1, 5.65, 5.75, floor, portal.top - .2, 0x56737b, 'glass');
  box('entry-upper-glass', front, entryS - 1.3, entryS + 1.3, 5.65, 5.75, floor + 2.8, portal.top - .2, 0x56737b, 'glass');
  for (const s of [portal.s0 + .06, entryS - 1.3, entryS + 1.3, portal.s1 - .06]) box('entry-metal-frame', front, s - .035, s + .035, 5.58, 5.78, floor, portal.top, 0x4a5c5b, 'metal');
  for (const s of [entryS - 1.2, entryS + 1.2]) { const door = box('open-glass-door', front, s - .04, s + .04, 5.7, 6.8, floor + .03, floor + 2.78, 0x69888a, 'glass'); beam('door-handle', at(front, s, floor + .9, 6.5), at(front, s, floor + 1.6, 6.5), .022, 0xd0d4cc, door); }
  const approachStart = -4, approachEnd = -.3;
  const low = Math.max(ground(front.point(portal.s0, approachStart)), ground(front.point(portal.s1, approachStart))) + .045;
  const count = Math.max(2, Math.ceil((floor - low) / .16));
  for (let k = 0; k < count; k++) { const n0 = approachStart + (approachEnd - approachStart) * k / count, n1 = approachStart + (approachEnd - approachStart) * (k + 1) / count, top = low + (floor - low) * (k + 1) / count; box('entrance-step', front, portal.s0, portal.s1, n0, n1, low - .25, top, 0xaba99d); stepSamples.push({ point: front.point(entryS, (n0 + n1) / 2), top }); }
  pavementMasks.push({ component: 'entrance-step', polygon: masks(front, portal.s0, portal.s1, approachStart, 8.1) });
  const paths: XZ[][] = [[[458, -686.62], [469.75, -695.45], [493.48, -713.28], [521.02, -730.68]]];
  // 지도에 표시된 계단축을 따라 수평 디딤판을 만든다. 단수와 폭은 근사다.
  for (const points of paths) for (let i = 1; i < points.length; i++) {
    const f = humanities23Frame(points[i - 1], points[i]), width = 3.2;
    for (let s0 = 0, k = 0; s0 < f.length - .001; k++) { const s1 = Math.min(f.length, s0 + (k % 12 === 11 ? 1.3 : .65)), corners = masks(f, s0, s1, -width / 2, width / 2), y = Math.max(...corners.map(p => ground(p))) + .045;
      const owner = box('mapped-stair-tread', f, s0, s1, -width / 2, width / 2, Math.min(...corners.map(p => ground(p))) - .15, y, 0xb2afa0); box('stair-nosing', f, s0, s0 + .025, -width / 2, width / 2, y, y + .003, 0xdbd5bd, 'stone', owner); stepSamples.push({ point: f.point((s0 + s1) / 2), top: y });
      s0 = s1;
    }
    pavementMasks.push({ component: 'mapped-stairs', polygon: masks(f, 0, f.length, -width / 2, width / 2) });
  }
  for (const points of paths) {
    const first = humanities23Frame(points[0], points[1]), last = humanities23Frame(points[points.length - 2], points[points.length - 1]);
    for (const [f, start] of [[first, true], [last, false]] as [Frame, boolean][]) {
      const count = Math.ceil(f.length / .65), tread = f.length / count, anchor = start ? 0 : f.length;
      const top = Math.max(...masks(f, start ? 0 : f.length - tread, start ? tread : f.length, -1.6, 1.6).map(p => ground(p))) + .045;
      paving(f, start ? -2 : f.length, start ? 0 : f.length + 2, -1.6, 1.6, 'stair-end-apron', p => {
        const t = f.local([p.x, p.z]), weight = start ? (t.s + 2) / 2 : (f.length + 2 - t.s) / 2;
        return Math.max(0, Math.min(1, weight)) * Math.max(0, top - ground(f.point(anchor, t.n)) - .045);
      });
    }
    points.unshift(first.point(-2)); points.push(last.point(last.length + 2));
  }
  const blend = (p: THREE.Vector3) => { const t = front.local([p.x, p.z]); return Math.max(0, Math.min(1, (t.n + 7.5) / 3.5)) * Math.max(0, low - ground(front.point(t.s, -4)) - .045); };
  paving(front, 0, front.length, -8.5, -.3, 'front-court-paving', blend);
  const entryRoute = [front.point(entryS, -7.5), front.point(entryS, -4.15), front.point(entryS, .5), front.point(entryS, 4.9), front.point(entryS, 7.1)];
  const signs: { mesh: THREE.Mesh; owner: Proxy }[] = [];
  function sign(text: string, s: number, y: number, width: number, height: number, background: string, color: string, f = front, n = -.3) {
    const owner = box('observed-sign', f, s - width / 2, s + width / 2, n, n + .1, y, y + height, Number.parseInt(background.slice(1), 16), 'metal');
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128; const ctx = canvas.getContext('2d')!; ctx.fillStyle = background; ctx.fillRect(0, 0, 512, 128); ctx.fillStyle = color; ctx.font = '600 80px "Malgun Gothic", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 256, 68, 492);
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; const a = f.point(0), b = f.point(0, -1), normal = new THREE.Vector3(b[0] - a[0], 0, b[1] - a[1]), right = new THREE.Vector3(normal.z, 0, -normal.x), mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height).scale(-1, 1, 1), new THREE.MeshStandardMaterial({ map, side: THREE.DoubleSide }));
    mesh.position.copy(at(f, s, y + height / 2, n - .01)); mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, new THREE.Vector3(0, 1, 0), normal)); mesh.userData.text = text; shell.add(mesh); signs.push({ mesh, owner });
  }
  sign('두산인문관', 2.8, floor + 1.25, 3.6, .6, '#9c816b', '#e2e4dd');
  sign('Doosan Humanities Hall', 2.8, floor + .88, 3.6, .27, '#9c816b', '#e2e4dd');
  sign('8', 15.8, floor + 6.75, .65, .85, '#9c816b', '#f0eee2');
  sign('8', frames[0].length - 2.2, floor + 9.8, .65, .85, '#9c816b', '#f0eee2', frames[0]);
  const lampS = 4.5, lampN = -2.5, lampY = ground(front.point(lampS, lampN));
  const lamp = beam('double-globe-lamp-post', at(front, lampS, lampY, lampN), at(front, lampS, lampY + 4.9, lampN), .09, 0x7e663f);
  beam('lamp-cross-arm', at(front, lampS - .65, lampY + 4.65, lampN), at(front, lampS + .65, lampY + 4.65, lampN), .055, 0x7e663f, lamp);
  for (const s of [lampS - .65, lampS + .65]) { const g = new THREE.IcosahedronGeometry(.24, 1), a = g.attributes.position, c = at(front, s, lampY + 4.38, lampN); part('lamp-globe', Array.from({ length: a.count }, (_, k) => new THREE.Vector3(a.getX(k), a.getY(k) * 1.2, a.getZ(k)).add(c)), 0xc6d2c9, 'glass', lamp); g.dispose(); }
  for (let s = 17; s < front.length - .3; s += 2) { const y = ground(front.point(s, -2.2)); const bed = box('low-hedge-bed', front, s, Math.min(front.length, s + 1.8), -2.7, -1.8, y, y + .18, 0x8f9781); box('clipped-hedge', front, s + .05, Math.min(front.length - .05, s + 1.75), -2.64, -1.86, y + .18, y + .65, 0x6b7d3d, 'wood', bed); }
  // 사진의 벚나무는 낙엽수 형태로 근사한다. 계절별 개화 상태는 재현하지 않는다.
  for (const [s, n] of [[-.4, -3.4], [2.1, -6.1]]) { const y = ground(front.point(s, n)), trunk = beam('courtyard-tree-trunk', at(front, s, y, n), at(front, s + .25, y + 5.8, n), .16, 0x665846); for (let k = 0; k < 6; k++) { const angle = k * 2.4, end = at(front, s + Math.cos(angle) * 2.3, y + 6 + k * .35, n + Math.sin(angle) * 2.3); beam('courtyard-tree-branch', at(front, s + .15, y + 3 + k * .3, n), end, .045, 0x665846, trunk); } }
  const meshes = batches.map(b => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(b.positions, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(b.colors, 3)); g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere(); const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: b.glass ? .22 : .68, side: THREE.DoubleSide, transparent: b.glass, opacity: b.glass ? .55 : 1, depthWrite: !b.glass })); mesh.name = b.glass ? 'humanities8-glass' : 'humanities8-surfaces'; mesh.castShadow = !b.glass; mesh.receiveShadow = true; shell.add(mesh); return mesh; });
  shell.userData.humanities8Access = { buildingId: building.id, floor, base, levels: 6, levelsEstimated: false, height: roof - floor, heightEstimated: true, pavementMasks, stepSamples, entryRoute, paths, source: 'https://map.snu.ac.kr/api/upload/default/F_BUILD_0000008.jpg', captureDate: null, dimensionsEstimated: true, rearAppearanceUnobserved: true, wholeInteriorImplemented: false, connectionTo7Implemented: false, northStairTo5Implemented: false, doorsOpenedForGameplay: true, geometry: { meshes: 2, signMeshes: signs.length, textures: signs.length, triangles: batches.reduce((n, b) => n + b.positions.length / 9, 0), colliders: breakables.length } };
  function update(_player: THREE.Vector3) { batches.forEach((b, index) => { const a = meshes[index].geometry.attributes.position as THREE.BufferAttribute, c = meshes[index].geometry.attributes.color as THREE.BufferAttribute; let moved = false, tinted = false;
    for (const p of b.parts) { if (p.shown !== p.proxy.visible) { p.shown = p.proxy.visible; moved = true; if (p.shown) (a.array as Float32Array).set(p.original, p.start); else for (let i = p.start; i < p.end; i += 3) { a.array[i] = p.proxy.position.x; a.array[i + 1] = p.proxy.position.y; a.array[i + 2] = p.proxy.position.z; } } if (p.color !== p.proxy.material.color.getHex()) { p.color = p.proxy.material.color.getHex(); tinted = true; const t = p.proxy.material.color, scale = [t.r / p.base.r, t.g / p.base.g, t.b / p.base.b]; for (let i = p.start; i < p.end; i++) c.array[i] = p.colors[i - p.start] * scale[(i - p.start) % 3]; } }
    if (moved) a.needsUpdate = true; if (tinted) c.needsUpdate = true;
  }); for (const s of signs) s.mesh.visible = s.owner.visible; shell.visible = batches.some(b => b.parts.some(p => p.proxy.visible)); }
  // 렌더 버퍼와 복원용 사본을 만든 뒤 조립용 배열을 비운다.
 for(const batch of batches){batch.positions.length=0;batch.colors.length=0;}
 return { shell, breakables, update };
}
