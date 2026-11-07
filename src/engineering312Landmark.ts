import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import type { CampusBuilding } from './fullCampus';
import type { BuildingAppearance } from './buildingAppearance';
import type { BreakableSpec } from './scene';
import { engineering301303Datum } from './engineering301303Site';

type Point = { x: number; z: number };
type Kind = 'stone' | 'metal' | 'glass';
type Surface = { positions: number[]; colors: number[]; geometry?: THREE.BufferGeometry };
type Range = { surface: Surface; start: number; end: number; original: Float32Array };
type Part = { proxy: THREE.Mesh; ranges: Range[]; shown: boolean };

/** 새 통로와 312동은 같은 보행면을 사용한다. 모든 수직 치수는 단면 비례에 맞춘 게임용 근사다. */
export function engineering312Datum(heightAt: (x: number, z: number) => number) {
  const deck303 = engineering301303Datum(heightAt).bridge, bridge = deck303 - 1.8;
  return { deck303, bridge, base: bridge - 23.3, floors: [-23.3, -15.9, -10.5, -5, 0, 5.2].map(y => bridge + y), lowRoof: bridge + 5.2, roof: bridge + 12.2, height: 35.5 };
}

/** 서로 떨어진 부재는 별도 볼록체로 만든다. 난간과 트러스의 빈 공간은 충돌에 포함하지 않는다. */
export function createEngineering312Assembly(scene: THREE.Scene, id: string, landmark: string, label: string) {
  const shell = new THREE.Group(); shell.name = id + ':' + landmark;
  Object.assign(shell.userData, { buildingId: id, landmark, role: 'building-shell', dimensionsEstimated: true }); scene.add(shell);
  const surfaces: Record<Kind, Surface> = { stone: { positions: [], colors: [] }, metal: { positions: [], colors: [] }, glass: { positions: [], colors: [] } };
  const kinds: Kind[] = ['stone', 'metal', 'glass'], parts: Part[] = [], breakables: BreakableSpec[] = [];
  const materials = { stone: new THREE.MeshStandardMaterial({ color: 0x888d8c }), metal: new THREE.MeshStandardMaterial({ color: 0x374042 }), glass: new THREE.MeshStandardMaterial({ color: 0x69858a }) };
  const cube = new THREE.BoxGeometry(1, 1, 1).toNonIndexed(), up = new THREE.Vector3(0, 1, 0);
  function append(kind: Kind, geometry: THREE.BufferGeometry, color: number) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry, p = g.getAttribute('position'), c = new THREE.Color(color), s = surfaces[kind];
    for (let i = 0; i < p.count; i++) { s.positions.push(p.getX(i), p.getY(i), p.getZ(i)); s.colors.push(c.r, c.g, c.b); }
    if (g !== geometry) g.dispose(); geometry.dispose();
  }
  function box(kind: Kind, center: THREE.Vector3, size: THREE.Vector3, color: number, ex = new THREE.Vector3(1, 0, 0), ey = up) {
    const ez = new THREE.Vector3().crossVectors(ex, ey).normalize(), m = new THREE.Matrix4().makeBasis(ex, ey, ez).scale(size); m.setPosition(center); append(kind, cube.clone().applyMatrix4(m), color);
  }
  function part(kind: Kind, component: string, draw: () => void, metadata: Record<string, unknown> = {}) {
    const starts = kinds.map(k => surfaces[k].positions.length); draw();
    const ranges = kinds.map((k, i) => ({ surface: surfaces[k], start: starts[i], end: surfaces[k].positions.length, original: Float32Array.from(surfaces[k].positions.slice(starts[i])) }));
    if (ranges.every(r => r.original.length === 0)) return;
    const vertices: THREE.Vector3[] = [], seen = new Set<string>(), bounds = new THREE.Box3();
    for (const r of ranges) for (let i = 0; i < r.original.length; i += 3) { const p = new THREE.Vector3().fromArray(r.original, i), key = p.toArray().map(v => v.toFixed(5)).join(','); bounds.expandByPoint(p); if (!seen.has(key)) { seen.add(key); vertices.push(p); } }
    if(metadata.closedFacade&&Array.isArray(metadata.outward)&&ranges[2].original.length){
      const out=new THREE.Vector3().fromArray(metadata.outward as number[]);let front=-Infinity,back=Infinity,glassPlane=-Infinity;
      for(const v of vertices){const d=v.dot(out);front=Math.max(front,d);back=Math.min(back,d);}for(let i=0;i<ranges[2].original.length;i+=3)glassPlane=Math.max(glassPlane,new THREE.Vector3().fromArray(ranges[2].original,i).dot(out));
      const newFront=(front+glassPlane)/2,newBack=(back+glassPlane)/2;for(const v of vertices)v.addScaledVector(out,THREE.MathUtils.clamp(v.dot(out),newBack,newFront)-v.dot(out));
      metadata.facadeCollision={method:'balanced-fin-and-glass',front,back,glassPlane,newFront,newBack};
    }
    const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const geometry = new ConvexGeometry(vertices.map(p => p.sub(center))), collisionVertices = Float32Array.from(geometry.getAttribute('position').array), proxy = new THREE.Mesh(geometry, materials[kind]); proxy.position.copy(center);
    Object.assign(proxy.userData, { buildingId: id, landmark, component, renderProxy: true, convex: true, glazingTriangles: [ranges[2].start / 9, ranges[2].end / 9], ...metadata }); proxy.updateMatrixWorld(true);
    parts.push({ proxy, ranges, shown: true }); breakables.push({ mesh: proxy, size, collisionVertices, material: kind, toughness: kind === 'glass' ? 5 : 12, label });
    return proxy;
  }
  function beam(a: THREE.Vector3, b: THREE.Vector3, width: number, depth: number, component: string, color = 0x303a3b, kind: Kind = 'metal', metadata: Record<string, unknown> = {}) {
    const ex = b.clone().sub(a), length = ex.length(); if (length < .002) return; ex.multiplyScalar(1 / length);
    const ey = up.clone().addScaledVector(ex, -up.dot(ex)); if (ey.lengthSq() < 1e-8) ey.set(1, 0, 0); ey.normalize();
    return part(kind, component, () => box(kind, a.clone().add(b).multiplyScalar(.5), new THREE.Vector3(length, depth, width), color, ex, ey), metadata);
  }
  function prism(top: THREE.Vector3[], thickness: number, component: string, color = 0xa3a6a0, kind: Kind = 'stone', metadata: Record<string, unknown> = {}) {
    if (top[1].clone().sub(top[0]).cross(top[2].clone().sub(top[0])).y < 0) top = top.slice().reverse();
    const bottom = top.map(p => p.clone().addScaledVector(up, -thickness)), values: number[] = [], tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => values.push(...a.toArray(), ...b.toArray(), ...c.toArray());
    for (let i = 1; i + 1 < top.length; i++) { tri(top[0], top[i], top[i + 1]); tri(bottom[0], bottom[i + 1], bottom[i]); }
    for (let i = 0; i < top.length; i++) { const j = (i + 1) % top.length; tri(top[i], bottom[i], bottom[j]); tri(top[i], bottom[j], top[j]); }
    return part(kind, component, () => append(kind, new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(values, 3)), color), metadata);
  }
  function finish() {
    for (const kind of kinds) { const s = surfaces[kind], geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(s.positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(s.colors, 3)); (geometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage); geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); s.geometry = geometry;
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: kind === 'glass' ? .25 : .78, metalness: kind === 'glass' ? .2 : .05, transparent: kind === 'glass', opacity: kind === 'glass' ? landmark === 'engineering303-312-connection' ? .26 : .74 : 1, depthWrite: kind !== 'glass' })); mesh.name = landmark + '-' + kind; mesh.receiveShadow = true; shell.add(mesh); s.positions.length = 0; s.colors.length = 0; }
    Object.assign(shell.userData, { renderMeshes: 3, partCount: parts.length, triangles: shell.children.reduce((n, o) => n + (o as THREE.Mesh).geometry.getAttribute('position').count / 3, 0) });
    const update = (_player: THREE.Vector3) => { const changed = new Set<Surface>(); for (const p of parts) if (p.shown !== p.proxy.visible) { p.shown = p.proxy.visible; for (const r of p.ranges) { if (r.start === r.end) continue; const a = r.surface.geometry!.getAttribute('position') as THREE.BufferAttribute; if (!changed.has(r.surface)) a.clearUpdateRanges(); changed.add(r.surface); if (p.shown) (a.array as Float32Array).set(r.original, r.start); else for (let i = r.start; i < r.end; i += 3) { a.array[i] = p.proxy.position.x; a.array[i + 1] = p.proxy.position.y; a.array[i + 2] = p.proxy.position.z; } a.addUpdateRange(r.start, r.end - r.start); } } for (const s of changed) s.geometry!.getAttribute('position').needsUpdate = true; shell.visible = parts.some(p => p.proxy.visible); };
    return { shell, breakables, update };
  }
  return { shell, breakables, box, part, beam, prism, finish };
}

function clip(poly: Point[], key: 'x' | 'z', value: number, greater: boolean) { const result: Point[] = []; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], ia = greater ? a[key] >= value : a[key] <= value, ib = greater ? b[key] >= value : b[key] <= value; if (ia) result.push(a); if (ia !== ib) { const t = (value - a[key]) / (b[key] - a[key]); result.push({ x: THREE.MathUtils.lerp(a.x, b.x, t), z: THREE.MathUtils.lerp(a.z, b.z, t) }); } } return result; }

export function createEngineering312Landmark(scene: THREE.Scene, building: CampusBuilding, profile: BuildingAppearance, heightAt: (x: number, z: number) => number) {
  const distant = new THREE.Group(); distant.visible = false; Object.assign(distant.userData, { buildingId: building.id, role: 'distant-building', landmark: 'engineering-312' }); scene.add(distant);
  const mapped = building.points.filter((p, i, a) => i !== a.length - 1 || p[0] !== a[0][0] || p[1] !== a[0][1]);
  if (mapped.length !== 11) throw Error('Engineering 312 requires its eleven original outline points.');
  const origin = new THREE.Vector3(mapped[9][0], 0, mapped[9][1]), north = new THREE.Vector3(mapped[10][0] - origin.x, 0, mapped[10][1] - origin.z).normalize(), east = new THREE.Vector3(north.z, 0, -north.x), up = new THREE.Vector3(0, 1, 0), datum = engineering312Datum(heightAt);
  const world = (x: number, y: number, z: number) => origin.clone().addScaledVector(east, x).addScaledVector(north, z).setY(y), local = (p: THREE.Vector3) => ({ x: p.clone().sub(origin).dot(east), z: p.clone().sub(origin).dot(north) });
  const poly = mapped.map(p => local(new THREE.Vector3(p[0], 0, p[1]))); if (poly.reduce((n, a, i) => { const b = poly[(i + 1) % poly.length]; return n + a.x * b.z - b.x * a.z; }, 0) < 0) poly.reverse();
  const assembly = createEngineering312Assembly(scene, building.id, 'engineering-312', building.name), { shell, box, part, beam, prism } = assembly;
  const high = clip(clip(poly, 'x', 18.4, true), 'z', 18.7, false), facadeColor = 0x424b4d, finColor = 0x626c6b, glassColor = 0x64868c;
  const p6 = new THREE.Vector3(mapped[6][0], 0, mapped[6][1]), p7 = new THREE.Vector3(mapped[7][0], 0, mapped[7][1]), tangent = p7.clone().sub(p6).normalize(), inward = new THREE.Vector3(tangent.z, 0, -tangent.x), door = p6.clone().lerp(p7, .77).setY(datum.bridge), doorLocal = local(door), doorWidth = 2.8;
  Object.assign(shell.userData, { appearance: profile, localOrigin: { x: origin.x, y: datum.base, z: origin.z }, axis: { x: east.x, z: east.z }, north: { x: north.x, z: north.z }, mappedOutline: mapped.map(p => p.slice()), mappedOutlinePreserved: true, sourcePointCount: 11, datum, documentedAboveGroundLevels: 6, levelsEstimated: false, heightEstimated: true, highFloorPolygon: high, entrance: { x: door.x, z: door.z, floor: datum.bridge, width: doorWidth, height: 3.25, level: 5, inward: inward.toArray(), estimated: true }, connectionId: 'connection/engineering303-312' });
  const polygonSlabs = (p: Point[], y: number, name: string, holes: { x0: number; x1: number; z0: number; z1: number }[] = []) => {
    const faces = THREE.ShapeUtils.triangulateShape(p.map(v => new THREE.Vector2(v.x, v.z)), []);
    for (const face of faces) for (let x = 0; x < 40; x += 5) for (let z = 0; z < 40; z += 5) { let pieces = [face.map(i => p[i])]; for (const [key, value, greater] of [['x', x, true], ['x', x + 5, false], ['z', z, true], ['z', z + 5, false]] as const) pieces = pieces.map(q => clip(q, key, value, greater)).filter(q => q.length >= 3);
      for (const h of holes) { const next: Point[][] = []; for (const q of pieces) { let rest = q; for (const [key, value, greater] of [['x', h.x0, true], ['x', h.x1, false], ['z', h.z0, true], ['z', h.z1, false]] as const) { const outside = clip(rest, key, value, !greater); if (outside.length >= 3) next.push(outside); rest = clip(rest, key, value, greater); if (rest.length < 3) break; } } pieces = next; }
      for (const q of pieces) if (Math.abs(q.reduce((n, a, i) => { const b = q[(i + 1) % q.length]; return n + a.x * b.z - b.x * a.z; }, 0)) > .01) prism(q.map(v => world(v.x, y, v.z)), .22, name); }
  };
  function facade(p: Point[], bottom: number, top: number, row: number, upper = false) {
    for (let edge = 0; edge < p.length; edge++) { const a = p[edge], b = p[(edge + 1) % p.length], aw = world(a.x, 0, a.z), bw = world(b.x, 0, b.z), ex = bw.clone().sub(aw).normalize(), out = new THREE.Vector3(ex.z, 0, -ex.x), length = aw.distanceTo(bw), at = (u: number, y: number, d = 0) => aw.clone().addScaledVector(ex, u).addScaledVector(out, d).setY(y);
      const doorOn = row === 4 && Math.abs(out.dot(inward) + 1) < .02 && Math.abs(door.clone().sub(aw).dot(out)) < .02, du = door.clone().sub(aw).dot(ex), cuts = [0, length]; for (let u = 2.2; u < length; u += 2.2) cuts.push(u); if (doorOn) cuts.push(Math.max(0, du - doorWidth / 2), Math.min(length, du + doorWidth / 2)); cuts.sort((x, y) => x - y);
      for (let i = 0; i + 1 < cuts.length; i++) { const l = cuts[i], r = cuts[i + 1]; if (r - l < .025) continue; const aperture = doorOn && l >= du - doorWidth / 2 - .01 && r <= du + doorWidth / 2 + .01;
        const ground = Math.max(...Array.from({ length: Math.max(3, Math.ceil((r - l) / .3) + 1) }, (_, k) => { const q = at(l + (r - l) * k / (Math.max(3, Math.ceil((r - l) / .3) + 1) - 1), 0, .12); return heightAt(q.x, q.z); }));
        const core = !upper && Math.abs(a.z - 17) < 1 && Math.abs(b.z - 17) < 1;
        const low = row === 0 ? Math.min(bottom, ground - .2) : bottom, sill = Math.max(bottom + (core ? .35 : [.85, 1.45, 1.05][i % 3]), ground + .2), head = top - (core ? .35 : [1.15, .62, .9][i % 3]);
        part('glass', aperture ? 'fifth-floor-door-surround' : 'vertical-window-bay', () => {
          const wb = (kind: Kind, x0: number, x1: number, y0: number, y1: number, depth: number, thick: number, color: number) => { if (x1 > x0 && y1 > y0) box(kind, at((x0 + x1) / 2, (y0 + y1) / 2, depth), new THREE.Vector3(x1 - x0, y1 - y0, thick), color, ex); };
          if (aperture) { wb('stone', l, r, datum.bridge + 3.25, top, 0, .16, facadeColor); return; }
          const wl = l + (core ? .10 : (r - l) * .18), wr = r - (core ? .10 : (r - l) * .25), s = Math.min(sill, top);
          wb('stone', l, r, low, s, 0, .16, row === 0 && s > bottom + 2 ? 0x858c89 : facadeColor); wb('stone', l, r, Math.max(s, head), top, 0, .16, facadeColor);
          if (head > s + .1) { wb('stone', l, wl, s, head, 0, .16, facadeColor); wb('stone', wr, r, s, head, 0, .16, facadeColor); wb('glass', wl, wr, s, head, -.035, .055, glassColor);
            for (const u of [wl, wr]) wb('metal', u - .025, u + .025, s, head, .02, .05, 0x222d30); wb('metal', wl, wr, s + (head - s) * .58, s + (head - s) * .58 + .045, .02, .05, 0x222d30); }
          wb('metal', l + .015, l + .075, Math.max(bottom, ground - .1), top, .11, .22, finColor); wb('metal', l, r, top - .075, top, .08, .17, 0x262f31);
        }, { row, edge, upper, closedFacade: !aperture, outward: out.toArray() });
      }
    }
  }
  for (let row = 0; row < 5; row++) facade(poly, datum.floors[row], datum.floors[row + 1], row);
  facade(high, datum.floors[5], datum.roof, 5, true);
  const lobbyHole = { x0: doorLocal.x - 1.6, x1: doorLocal.x + 4.8, z0: doorLocal.z + .15, z1: doorLocal.z + 11.1 };
  polygonSlabs(poly, datum.bridge, 'fifth-floor-lobby'); polygonSlabs(poly, datum.lowRoof, 'sixth-floor-and-roof-terrace', [lobbyHole]); polygonSlabs(high, datum.roof - .16, 'sixth-floor-roof');
  // 옥상 테라스는 평면에서 확인한 후퇴 구간에 둔다. 실내의 방 배치는 만들지 않는다.
  for (const [a, b] of [[{ x: 18.4, z: 18.7 }, { x: 37.1, z: 18.7 }], [{ x: 37.1, z: 18.7 }, { x: 37.1, z: 29.7 }], [{ x: 37.1, z: 29.7 }, { x: 18.7, z: 29.7 }]] as [Point, Point][]) { const length = Math.hypot(a.x - b.x, a.z - b.z), count = Math.ceil(length / 2.2); for (let k = 0; k < count; k++) { const p = world(THREE.MathUtils.lerp(a.x, b.x, k / count), datum.lowRoof + 1.05, THREE.MathUtils.lerp(a.z, b.z, k / count)), q = world(THREE.MathUtils.lerp(a.x, b.x, (k + 1) / count), datum.lowRoof + 1.05, THREE.MathUtils.lerp(a.z, b.z, (k + 1) / count)); beam(p, q, .06, .06, 'roof-terrace-rail'); beam(p.clone().addScaledVector(up, -1.05), p, .06, .06, 'roof-terrace-post'); } }
  const stairX = doorLocal.x + 3.3, stairZ0 = doorLocal.z + 1.4, stairZ1 = doorLocal.z + 10.4, count = 26;
  for (let k = 0; k < count; k++) { const z0 = THREE.MathUtils.lerp(stairZ0, stairZ1, k / count), z1 = THREE.MathUtils.lerp(stairZ0, stairZ1, (k + 1) / count), y = datum.bridge + (k + 1) / count * 5.2; prism([world(stairX - 1.2, y, z0), world(stairX + 1.2, y, z0), world(stairX + 1.2, y, z1), world(stairX - 1.2, y, z1)], .24, 'internal-sixth-floor-stair'); }
  for (const sign of [-1, 1]) beam(world(stairX + sign * 1.2, datum.bridge + 1.05, stairZ0), world(stairX + sign * 1.2, datum.lowRoof + 1.05, stairZ1), .065, .065, 'internal-stair-handrail');
  prism([world(stairX-1.2,datum.lowRoof,stairZ1),world(stairX+1.2,datum.lowRoof,stairZ1),world(stairX+1.2,datum.lowRoof,lobbyHole.z1+.25),world(stairX-1.2,datum.lowRoof,lobbyHole.z1+.25)],.22,'internal-stair-upper-landing');
  part('glass', 'engineering312-connection-door', () => { box('glass', door.clone().addScaledVector(up, 1.625), new THREE.Vector3(doorWidth, 3.25, .065), glassColor, tangent); for (const x of [-doorWidth / 2, 0, doorWidth / 2]) box('metal', door.clone().addScaledVector(tangent, x).addScaledVector(up, 1.625), new THREE.Vector3(.055, 3.25, .08), 0x273437, tangent); }, { entrance: true, level: 5, outward: inward.clone().negate().toArray() });
  Object.assign(shell.userData, { internalStair: { a: world(stairX, datum.bridge, stairZ0).toArray(), b: world(stairX, datum.lowRoof, stairZ1).toArray(), width: 2.4, count }, lobby: { door: door.toArray(), inside: door.clone().addScaledVector(inward, 4).toArray(), hole: lobbyHole }, wholeInteriorModeled: false });
  return assembly.finish();
}

