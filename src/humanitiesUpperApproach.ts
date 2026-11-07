import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import { humanities23Frame } from './humanities23Site';

type XZ = [number, number];
type Frame = ReturnType<typeof humanities23Frame>;
type Proxy = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
export const HUMANITIES_UPPER_ROADS = ['way/456540167/307', 'way/456540170/308', 'way/456540196/319'];

/** 지도상의 계단과 보행로를 연결한다. 마감, 폭과 난간은 사진 미확인 근사다. */
export function createHumanitiesUpperApproach(scene: THREE.Scene, blockedPaving: XZ[][] = []) {
  const building = { id: 'connection/humanities-upper' };
  const ring: XZ[] = [[606.95,-633.97],[618.83,-614.06],[571.45,-585.79],[559.58,-605.7]];
  const shell = new THREE.Group(); shell.name = 'connection/humanities-upper';
  Object.assign(shell.userData, { role: 'campus-connection', connectionId: shell.name }); scene.add(shell);
  const breakables: BreakableSpec[] = [], pavementMasks: { component: string; polygon: XZ[] }[] = [];
  const batches = [false].map(glass => ({ glass, positions: [] as number[], colors: [] as number[], parts: [] as { proxy: Proxy; start: number; end: number; original: Float32Array; colors: Float32Array; base: THREE.Color; color: number; shown: boolean }[] }));
  const at = (f: Frame, s: number, y: number, n = 0) => { const p = f.point(s, n); return new THREE.Vector3(p[0], y, p[1]); };
  function part(name: string, vertices: THREE.Vector3[], color: number, material: BreakableSpec['material'] = 'stone', owner?: Proxy, flat = false) {
    const bounds = new THREE.Box3().setFromPoints(vertices), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const g = flat ? new THREE.BufferGeometry() : new ConvexGeometry(vertices.map(p => p.clone().sub(center)));
    if (flat) { const values: number[] = []; for (let i = 1; i + 1 < vertices.length; i++) for (const p of [vertices[0], vertices[i], vertices[i + 1]]) values.push(...p.clone().sub(center).toArray()); g.setAttribute('position', new THREE.Float32BufferAttribute(values, 3)); }
    const attr = g.attributes.position, proxy = owner ?? new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color }));
    if (!owner) { proxy.position.copy(center); proxy.updateMatrixWorld(true); Object.assign(proxy.userData, { buildingId: building.id, connectionId: shell.name, component: name, renderProxy: true, convex: true }); breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attr.array), toughness: material === 'glass' ? 2 : 8, material, label: '6동과 14동 사이 통로' }); }
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
  const terrain = scene.getObjectByName('campus-terrain') as THREE.Mesh<THREE.BufferGeometry>, tp = terrain.geometry.attributes.position, ti = terrain.geometry.index;
  const terrainTriangles: THREE.Vector3[][] = [];
  for (let i = 0; i < (ti?.count ?? tp.count); i += 3) { const t = [0, 1, 2].map(j => { const k = ti ? ti.getX(i + j) : i + j; return new THREE.Vector3(tp.getX(k), tp.getY(k), tp.getZ(k)); }); if (Math.max(...t.map(v => v.x)) > 539 && Math.min(...t.map(v => v.x)) < 605 && Math.max(...t.map(v => v.z)) > -610 && Math.min(...t.map(v => v.z)) < -574) terrainTriangles.push(t); }
  function ground(p: XZ) { const [x, z] = p; for (const [a, b, c] of terrainTriangles) { const det = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x), u = ((x - a.x) * (c.z - a.z) - (z - a.z) * (c.x - a.x)) / det, v = ((b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x)) / det; if (u >= -1e-7 && v >= -1e-7 && u + v <= 1.0000001) return a.y + u * (b.y - a.y) + v * (c.y - a.y); } throw Error('Missing humanities upper approach terrain'); }
  function clip(poly: THREE.Vector3[], distance: (p: THREE.Vector3) => number) { const out: THREE.Vector3[] = []; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], da = distance(a), db = distance(b); if (da >= -1e-8) out.push(a); if ((da >= -1e-8) !== (db >= -1e-8)) out.push(a.clone().lerp(b, da / (da - db))); } return out; }
  const planes = (poly: XZ[]) => { const sign = Math.sign(poly.reduce((n, a, i) => { const b = poly[(i + 1) % poly.length]; return n + a[0] * b[1] - b[0] * a[1]; }, 0)); return poly.map((a, i) => { const b = poly[(i + 1) % poly.length]; return (p: THREE.Vector3) => sign * ((b[0] - a[0]) * (p.z - a[1]) - (b[1] - a[1]) * (p.x - a[0])); }); };
  const area = (p: THREE.Vector3[]) => Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a.x * b.z - b.x * a.z; }, 0));
  function subtract(poly: THREE.Vector3[], mask: XZ[]) { const ps = planes(mask); if (area(ps.reduce((p, fn) => clip(p, fn), poly)) < 1e-8) return [poly]; let rest = poly; const out: THREE.Vector3[][] = []; for (const fn of ps) { const p = clip(rest, v => -fn(v)); if (p.length >= 3 && area(p) > 1e-8) out.push(p); rest = clip(rest, fn); } return out; }
  const masks = (f: Frame, s0: number, s1: number, n0: number, n1: number) => [f.point(s0, n0), f.point(s1, n0), f.point(s1, n1), f.point(s0, n1)];
  const footprints = THREE.ShapeUtils.triangulateShape(ring.map(p => new THREE.Vector2(...p)), []).map(tri => tri.map(i => ring[i]));
  function paving(f: Frame, s0: number, s1: number, n0: number, n1: number, component: string, lift?: (p: THREE.Vector3) => number) {
    const excluded = [...footprints, ...blockedPaving, ...pavementMasks.map(m => m.polygon)];
    for (let s = s0; s < s1 - .001; s += 2.6) for (let n = n0; n < n1 - .001; n += 2.6) {
      const ss = Math.min(s1, s + 2.6), nn = Math.min(n1, n + 2.6), ps = planes(masks(f, s, ss, n, nn));
      for (const tri of terrainTriangles) { let pieces = [ps.reduce((p, fn) => clip(p, fn), tri)].filter(p => p.length >= 3 && area(p) > 1e-8); for (const mask of excluded) pieces = pieces.flatMap(p => subtract(p, mask));
        for (const poly of pieces) { if(area(poly)<.002)continue; const top = poly.map(v => v.clone().add(new THREE.Vector3(0, .045 + (lift?.(v) ?? 0), 0))), owner = part(component, [...top, ...top.map(v => v.clone().add(new THREE.Vector3(0, -.12, 0)))], (Math.floor(s / 2.6) + Math.floor(n / 2.6)) % 3 === 0 ? 0x9e9c92 : 0xb5b5ab); pavementMasks.push({ component, polygon: poly.map(v => [v.x, v.z]) });
          for (const axis of ['s', 'n'] as const) for (let t = axis === 's' ? s + .25 : n + .5; t < (axis === 's' ? ss : nn); t += axis === 's' ? .25 : .5) { let joint = clip(poly, v => f.local([v.x, v.z])[axis] - t); joint = clip(joint, v => t + .009 - f.local([v.x, v.z])[axis]); if (joint.length >= 3 && area(joint) > 1e-8) part('paving-joint', joint.map(v => v.clone().add(new THREE.Vector3(0, .047 + (lift?.(v) ?? 0), 0))), 0x81867f, 'stone', owner, true); }
        }
      }
    }
  }

  const route: XZ[] = [[545.63,-604.19],[549.34,-596.05],[557.2,-595.06],[565.52,-580.56],[598.94,-593.35]];
  const stepSamples: { point: XZ; top: number }[] = [];
  const routes = route.slice(1).map((p,i)=>humanities23Frame(route[i],p));
  for(const [index,f] of routes.entries()) {
    const half = index===2 ? 1.25 : 1;
    const start=2.8, end=f.length-1.8;
    let firstTop=0,lastTop=0;
    if(index!==2) {
      const count=Math.ceil((end-start)/.4), tread=(end-start)/count;
      let previous=Math.max(...masks(f,start,start+.01,-half,half).map(ground))+.045;
      for(let i=0;i<count;i++) {
        const a=start+i*tread,b=start+(i+1)*tread,quad=masks(f,a,b,-half,half),ps=planes(quad);
        const vertices=terrainTriangles.flatMap(t=>ps.reduce((p,fn)=>clip(p,fn),t));
        const top=Math.max(previous,...vertices.map(v=>v.y+.045)),bottom=Math.min(previous,...vertices.map(v=>v.y))-.15;
        const owner=box('mapped-stair-tread',f,a,b,-half,half,bottom,top,i%2?0xa9aaa0:0xbab9ae);
        box('stair-nosing',f,a,a+.025,-half,half,top,top+.003,0x747b72,'stone',owner);
        stepSamples.push({point:f.point((a+b)/2),top});previous=top;
        if(i===0)firstTop=top;lastTop=top;
      }
      pavementMasks.push({component:'mapped-stair-tread',polygon:masks(f,start,end,-half,half)});
      // 난간 모양은 실측 재현이 아니다. 굽은 길 양끝을 비워 이동을 막지 않는다.
      for(const n of[-1.12,1.12]) {
        const count=Math.ceil((end-start)/2);
        let last: THREE.Vector3|undefined;
        for(let i=0;i<=count;i++) {
          const atS=start+.2+(end-start-.4)*i/count,y=ground(f.point(atS,n))+.15;
          const p=at(f,atS,y+.95,n);beam('estimated-metal-rail-post',at(f,atS,y-.15,n),p,.035,0x485352);
          if(last)beam('estimated-metal-handrail',last,p,.035,0x485352);last=p;
        }
      }
    }
    paving(f,0,f.length,-half,half,'upper-path-paving',p=>{
      if(index===2)return 0;
      const q=f.local([p.x,p.z]);
      if(q.s<start)return Math.max(0,Math.min(1,(q.s-(start-1.8))/1.8))*Math.max(0,firstTop-.12-ground(f.point(start,q.n))-.045);
      if(q.s>end)return Math.max(0,Math.min(1,(f.length-q.s)/1.8))*Math.max(0,lastTop-ground(f.point(end,q.n))-.045);
      return 0;
    });
  }
  for(const p of route.slice(1,-1))paving(humanities23Frame([p[0]-1.5,p[1]],[p[0]+1.5,p[1]]),0,3,-1.5,1.5,'turn-landing');
  const meshes = batches.map(b => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(b.positions, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(b.colors, 3)); g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere(); const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: b.glass ? .22 : .68, side: THREE.DoubleSide, transparent: b.glass, opacity: b.glass ? .55 : 1, depthWrite: !b.glass })); mesh.name = b.glass ? 'humanities-upper-glass' : 'humanities-upper-surfaces'; mesh.castShadow = !b.glass; mesh.receiveShadow = true; shell.add(mesh); return mesh; });
  shell.userData.humanitiesUpperAccess = { route, sourceRoads: HUMANITIES_UPPER_ROADS, pavementMasks, stepSamples, dimensionsEstimated: true, finishesPhotoVerified: false, railDesignEstimated: true, rawTerrainModified: false, geometry: { meshes: 1, textures: 0, triangles: batches.reduce((n,b)=>n+b.positions.length/9,0), colliders: breakables.length } };
  function update(_player: THREE.Vector3) { batches.forEach((b, index) => { const a = meshes[index].geometry.attributes.position as THREE.BufferAttribute, c = meshes[index].geometry.attributes.color as THREE.BufferAttribute; let moved = false, tinted = false;
    for (const p of b.parts) { if (p.shown !== p.proxy.visible) { p.shown = p.proxy.visible; moved = true; if (p.shown) (a.array as Float32Array).set(p.original, p.start); else for (let i = p.start; i < p.end; i += 3) { a.array[i] = p.proxy.position.x; a.array[i + 1] = p.proxy.position.y; a.array[i + 2] = p.proxy.position.z; } } if (p.color !== p.proxy.material.color.getHex()) { p.color = p.proxy.material.color.getHex(); tinted = true; const t = p.proxy.material.color, scale = [t.r / p.base.r, t.g / p.base.g, t.b / p.base.b]; for (let i = p.start; i < p.end; i++) c.array[i] = p.colors[i - p.start] * scale[(i - p.start) % 3]; } }
    if (moved) a.needsUpdate = true; if (tinted) c.needsUpdate = true;
  }); shell.visible = batches.some(b => b.parts.some(p => p.proxy.visible)); }
  return { shell, breakables, update };
}
