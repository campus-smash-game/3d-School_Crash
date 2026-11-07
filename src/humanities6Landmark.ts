import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import type { CampusBuilding } from './fullCampus';
import { humanities23Frame } from './humanities23Site';

type XZ = [number, number];
type Frame = ReturnType<typeof humanities23Frame>;
type Proxy = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
export const HUMANITIES6_ID = 'way/238936948';

/** 공식 캠퍼스 사진의 전면과 지도상의 외곽을 결합한다. 높이와 시설 치수는 근사다. */
export function createHumanities6Landmark(scene: THREE.Scene, building: CampusBuilding, heightAt: (x: number, z: number) => number, blockedPaving: XZ[][] = []) {
  const shell = new THREE.Group(); shell.name = 'landmark/humanities6';
  Object.assign(shell.userData, { role: 'building-shell', buildingId: building.id, landmark: 'humanities6', mappedOutline: building.points }); scene.add(shell);
  const distant = new THREE.Group(); distant.name = `${building.id}:humanities6-distant`; distant.visible = false;
  Object.assign(distant.userData, { role: 'distant-building', buildingId: building.id }); scene.add(distant);
  const ring = building.points.slice(0, -1).filter((_, i) => ![1, 3, 4, 6].includes(i)), frames = ring.map((p, i) => humanities23Frame(p, ring[(i + 1) % ring.length]));
  const base = heightAt(ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length);
  const breakables: BreakableSpec[] = [], pavementMasks: { component: string; polygon: XZ[] }[] = [];
  const batches = [false, true].map(glass => ({ glass, positions: [] as number[], colors: [] as number[], parts: [] as { proxy: Proxy; start: number; end: number; original: Float32Array; colors: Float32Array; base: THREE.Color; color: number; shown: boolean }[] }));
  const at = (f: Frame, s: number, y: number, n = 0) => { const p = f.point(s, n); return new THREE.Vector3(p[0], y, p[1]); };
  function part(name: string, vertices: THREE.Vector3[], color: number, material: BreakableSpec['material'] = 'stone', owner?: Proxy, flat = false) {
    const bounds = new THREE.Box3().setFromPoints(vertices), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const g = flat ? new THREE.BufferGeometry() : new ConvexGeometry(vertices.map(p => p.clone().sub(center)));
    if (flat) { const values: number[] = []; for (let i = 1; i + 1 < vertices.length; i++) for (const p of [vertices[0], vertices[i], vertices[i + 1]]) values.push(...p.clone().sub(center).toArray()); g.setAttribute('position', new THREE.Float32BufferAttribute(values, 3)); }
    const attr = g.attributes.position, proxy = owner ?? new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color }));
    if (!owner) { proxy.position.copy(center); proxy.updateMatrixWorld(true); Object.assign(proxy.userData, { buildingId: building.id, component: name, renderProxy: true, convex: true }); breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attr.array), toughness: material === 'glass' ? 2 : 8, material, label: '6동과 북쪽 보행로' }); }
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
  for (let i = 0; i < (ti?.count ?? tp.count); i += 3) { const t = [0, 1, 2].map(j => { const k = ti ? ti.getX(i + j) : i + j; return new THREE.Vector3(tp.getX(k), tp.getY(k), tp.getZ(k)); }); if (Math.max(...t.map(v => v.x)) > 488 && Math.min(...t.map(v => v.x)) < 585 && Math.max(...t.map(v => v.z)) > -657 && Math.min(...t.map(v => v.z)) < -587) terrainTriangles.push(t); }
  function ground(p: XZ) { const [x, z] = p; for (const [a, b, c] of terrainTriangles) { const det = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x), u = ((x - a.x) * (c.z - a.z) - (z - a.z) * (c.x - a.x)) / det, v = ((b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x)) / det; if (u >= -1e-7 && v >= -1e-7 && u + v <= 1.0000001) return a.y + u * (b.y - a.y) + v * (c.y - a.y); } throw Error('Missing humanities 6 terrain'); }
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
        for (const poly of pieces) { const top = poly.map(v => v.clone().add(new THREE.Vector3(0, .045 + (lift?.(v) ?? 0), 0))), owner = part(component, [...top, ...top.map(v => v.clone().add(new THREE.Vector3(0, -.12, 0)))], (Math.floor(s / 2.6) + Math.floor(n / 2.6)) % 3 === 0 ? 0x9e9c92 : 0xb5b5ab); pavementMasks.push({ component, polygon: poly.map(v => [v.x, v.z]) });
          for (const axis of ['s', 'n'] as const) for (let t = axis === 's' ? s + .25 : n + .5; t < (axis === 's' ? ss : nn); t += axis === 's' ? .25 : .5) { let joint = clip(poly, v => f.local([v.x, v.z])[axis] - t); joint = clip(joint, v => t + .009 - f.local([v.x, v.z])[axis]); if (joint.length >= 3 && area(joint) > 1e-8) part('paving-joint', joint.map(v => v.clone().add(new THREE.Vector3(0, .047 + (lift?.(v) ?? 0), 0))), 0x81867f, 'stone', owner, true); }
        }
      }
    }
  }
  const front = humanities23Frame([527.04, -604.79], [516.13, -623.75]);
  const entryS = 10.63, portal = { s0: 8.7, s1: 12.7 }, floor = 45.12, roof = floor + 13.4;
  const stepSamples: { point: XZ; top: number }[] = [];
  // 지상 4층은 2024년 설계공모 영상에서 확인했다. 층고와 개구부 치수는 근사다.
  for (const [edge, f] of frames.entries()) {
    const isFront = edge === 0, long = edge === 1 || edge === 3, observed = isFront || edge === 3;
    const bays = Math.ceil(f.length / 5.7), bay = f.length / bays;
    const limits = isFront ? [0, 8.7, 12.7, 16.5, f.length] : Array.from({ length: bays + 1 }, (_, i) => bay * i);
    for (let level = 0; level < 4; level++) for (let j = 1; j < limits.length; j++) {
      const s0 = limits[j - 1], s1 = limits[j], y = floor + level * 3.35;
      if (isFront && level === 0 && s0 === portal.s0) continue;
      const bottom = level ? y : Math.min(floor - .2, ground(f.point((s0 + s1) / 2)) - .15);
      const wall = box('brick-facade-bay', f, s0, s1, 0, .25, bottom, y + 3.35, observed ? 0x695846 : 0x746859);
      if (observed) for (let h = Math.max(bottom, floor); h < y + 3.3; h += .22) {
        facet('brick-horizontal-joint', f, s0 + .01, s1 - .01, h, h + .009, -.01, 0xa79d89, wall);
        for (let s = s0 + .3 + (Math.round((h - floor) / .22) % 2) * .31; s < s1 - .02; s += .62) facet('brick-vertical-joint', f, s, Math.min(s1 - .01, s + .009), h, Math.min(y + 3.35, h + .22), -.014, 0xa79d89, wall);
      }
      // 251동과 맞닿는 면은 가까운 사진이 없어 일반 벽으로 남긴다.
      if ((long && !(edge === 1 && j >= bays - 2)) || (isFront && s0 >= 12.7)) {
        const cells = level === 3 ? 2 : 3, a = s0 + .42, b = s1 - .42;
        const low = y + (level === 3 ? 1.1 : .62), high = y + (level === 3 ? 2.35 : 2.8);
        for (let k = 0; k < cells; k++) {
          const left = a + (b - a) * k / cells + (level === 3 ? .28 : .03), right = a + (b - a) * (k + 1) / cells - (level === 3 ? .28 : .03);
          if (right <= left) continue;
          facet('window-pane', f, left, right, low, high, -.026, 0x516b61, wall);
          for (const s of [left, right]) box('window-frame', f, s - .035, s + .035, -.1, -.025, low, high, 0xb2b8aa, 'metal', wall);
          for (const h of [low, high]) box('window-frame', f, left, right, -.1, -.025, h - .035, h + .035, 0xb2b8aa, 'metal', wall);
          if (level === 0) for (let s = left; s < right; s += .19) box('ground-window-grille', f, s, s + .02, -.14, -.10, low, high, 0x8f9b8e, 'metal', wall);
        }
      }
    }
    for (let level = 1; level <= 4; level++) box('white-floor-band', f, 0, f.length, -.24, .36, floor + level * 3.35 - .28, floor + level * 3.35 + .06, 0xdbd8c6);
    for (const s of isFront ? [0, 8.7, 12.7, f.length] : Array.from({length:bays+1},(_,i)=>i*bay)) box('white-facade-pier', f, s - .16, s + .16, -.26, .3, floor - .2, roof, 0xdbd8c6);
    box('wide-roof-overhang', f, 0, f.length, -.95, .35, roof - .12, roof + .13, 0xd9d6c3);
    box('roof-parapet', f, 0, f.length, -.77, -.53, roof + .13, roof + .53, 0xd4d0bb);
    if (observed) for (let s = 2.2; s < f.length; s += 6.5) beam('diagonal-eave-bracket', at(f,s,roof-1.2,-.08),at(f,s,roof-.16,-.85),.035,0x515c55);
  }
  for (const tri of footprints) { const top = tri.map(([x,z])=>new THREE.Vector3(x,roof,z)); part('footprint-roof',[...top,...top.map(p=>p.clone().add(new THREE.Vector3(0,-.2,0)))],0xb3b5a8); }
  box('roof-equipment-room', front, 3.5, 9.5, 12, 20, roof, roof + 1.9, 0xb7b9ac);
  box('roof-equipment-cap', front, 3.2, 9.8, 11.7, 20.3, roof + 1.8, roof + 2.05, 0xd2d2c0);
  for (let s=4;s<9;s+=1.4) { const ac=box('roof-air-conditioner',front,s,s+1,23,24.4,roof,roof+1.1,0xb8bdb2,'metal'); for(let n=23.15;n<24.3;n+=.15) box('roof-air-conditioner-louvre',front,s+.08,s+.92,n,n+.035,roof+1.1,roof+1.13,0x616b61,'metal',ac); }
  for (let level=1;level<=2;level++) {
    const y=floor+level*3.35, s0=9.3,s1=12.4;
    box('end-balcony-floor',front,s0,s1,-1.1,.12,y-.18,y,0xc7c7b3);
    box('end-balcony-front',front,s0,s1,-1.1,-.92,y,y+.92,0xd8d6c2);
    for(const s of[s0,s1]) box('end-balcony-side',front,s-.06,s+.06,-1.1,.1,y,y+.92,0xd8d6c2);
    const panel=box('balcony-door',front,10.1,11.9,-.09,0,y,y+2.7,0x557168,'glass');
    for(const s of[10.1,11,11.9])box('balcony-door-frame',front,s-.035,s+.035,-.13,-.1,y,y+2.7,0xb9bdad,'metal',panel);
  }
  box('entry-floor',front,portal.s0,portal.s1,-.3,5.5,floor-.25,floor,0xa5a396);
  box('entry-ceiling',front,portal.s0,portal.s1,-.3,5.5,floor+2.85,floor+3.1,0xc1c2b5);
  for(const s of[portal.s0,portal.s1])box('entry-side-wall',front,s-.1,s+.1,0,5.5,floor,floor+2.9,0xa29c89);
  box('vestibule-back',front,portal.s0,portal.s1,5.4,5.6,floor,floor+2.9,0xc6c4b1);
  for(const [a,b]of[[portal.s0,entryS-1.1],[entryS+1.1,portal.s1]])box('entry-glass-panel',front,a,b,2.6,2.7,floor,floor+2.8,0x678578,'glass');
  for(const s of[portal.s0,entryS-1.12,entryS+1.12,portal.s1])box('entry-metal-frame',front,s-.04,s+.04,2.58,2.72,floor,floor+2.85,0xb8bcae,'metal');
  for(const s of[entryS-1.1,entryS+1.1]) {const door=box('open-entry-door',front,s-.04,s+.04,2.7,3.8,floor,floor+2.8,0x678578,'glass');beam('entry-door-handle',at(front,s,floor+.85,3.5),at(front,s,floor+1.6,3.5),.025,0xc1c6b8,door);}
  const step=box('entry-step',front,portal.s0,portal.s1,-1.05,-.3,44.6,floor-.15,0xbab7a6);
  box('entry-step-nosing',front,portal.s0,portal.s1,-1.05,-1.02,floor-.15,floor-.147,0xd0cbb9,'stone',step);
  stepSamples.push({point:front.point(entryS,-.7),top:floor-.15});
  pavementMasks.push({component:'entry-floor',polygon:masks(front,portal.s0,portal.s1,-1.05,5.6)});
  const entryRoute=[front.point(entryS,-1.85),front.point(entryS,-.7),front.point(entryS,1.5),front.point(entryS,4.3)];

  function handrail(f:Frame,n:number,y0:number,y1:number){
    const count=Math.ceil(f.length/1.8);for(let k=0;k<=count;k++){const s=f.length*k/count,y=y0+(y1-y0)*k/count;box('stair-rail-post',f,s-.035,s+.035,n-.035,n+.035,y,y+.98,0x5e6b63,'metal');}
    for(const h of[.42,.96])beam('stair-handrail',at(f,0,y0+h,n),at(f,f.length,y1+h,n),.035,0x87968c);
  }
  function steps(a:XZ,b:XZ,width:number,name:string,startY?:number,endY?:number){
    const f=humanities23Frame(a,b),half=width/2;
    const low=startY??Math.max(...masks(f,0,.3,-half,half).map(ground))+.06,high=endY??Math.max(...masks(f,f.length-.3,f.length,-half,half).map(ground))+.06;
    const count=Math.max(2,Math.ceil(Math.abs(high-low)/.15)),tops:number[]=[];
    for(let k=0;k<count;k++){
      const a=f.length*k/count,b=f.length*(k+1)/count,top=Math.max(low+(high-low)*(k+1)/count,...masks(f,a,b,-half,half).map(p=>ground(p)+.045));
      const owner=box(name,f,a,b,-half,half,Math.min(...masks(f,a,b,-half,half).map(ground))-.15,top,0xb8b6a5);
      box('stair-nosing',f,a,a+.022,-half,half,top,top+.003,0xd3ceba,'stone',owner);stepSamples.push({point:f.point((a+b)/2),top});tops.push(top);
    }
    pavementMasks.push({component:name,polygon:masks(f,0,f.length,-half,half)});
    handrail(f,-half-.12,tops[0],tops.at(-1)!);handrail(f,half+.12,tops[0],tops.at(-1)!);
    for(const first of[true,false])paving(f,first?-1.8:f.length,first?0:f.length+1.8,-half,half,name+'-apron',p=>{const q=f.local([p.x,p.z]),weight=first?(q.s+1.8)/1.8:(f.length+1.8-q.s)/1.8,y=first?low:tops.at(-1)!;return Math.max(0,Math.min(1,weight))*Math.max(0,y-ground(f.point(first?0:f.length,q.n))-.045);});
    return f;
  }
  function walkway(points:XZ[],width:number,name:string){for(let i=1;i<points.length;i++){const f=humanities23Frame(points[i-1],points[i]);paving(f,-.05,f.length+.05,-width/2,width/2,name);}}
  const west=steps([502.99,-598.32],[520.65,-608.34],2.3,'west-approach-stair',undefined,44.88);
  walkway([[490.65,-599.63],[502.99,-598.32]],2.5,'west-approach-paving');
  const westRoute:XZ[]=[[490.65,-599.63],west.point(-1.5),west.point(0),west.point(west.length),[522.56,-609.42],[520.1,-613],entryRoute[0]];
  const northRoute:XZ[]=[[526.82,-602.07],[559.06,-622.23],[566.14,-626.66],[572.8,-630.83],[563.17,-647.9],[570.82,-653.53]];
  steps(northRoute[1],northRoute[2],2.3,'north-approach-stair');
  steps(northRoute[4],northRoute[5],2.3,'east-road-stair');
  const upperAxis=humanities23Frame([572.8,-630.83],[576.47,-624.06]);
  const upper=steps(upperAxis.point(2),upperAxis.point(upperAxis.length),2.3,'northeast-stair');
  walkway(northRoute.slice(0,2),2.5,'north-front-paving');walkway(northRoute.slice(2,5),2.5,'east-side-paving');
  const eastRoute=[upperAxis.point(0),upper.point(0),upper.point(upper.length),upper.point(upper.length+1.5)];
  // 북쪽 바깥 보행로는 원본 지형 높이를 따른다.
  walkway([[492.25,-596.84],[505.21,-594.37],[515.84,-598.58],[526.82,-602.07],[545.63,-604.19],[576.47,-624.06],[587.86,-631.4]],2.5,'north-outer-paving');
  const north=frames[3];
  for(const s of[11,24,36]){
    const n=-4.2,p=north.point(s,n),y=ground(p),tree=beam('north-tree-trunk',at(north,s,y,n),at(north,s,y+5.8,n),.17,0x6b5943);
    for(let k=0;k<5;k++){const a=k*2.4;beam('north-tree-branch',at(north,s,y+3,n),at(north,s+Math.cos(a)*1.9,y+5.3+k*.22,n+Math.sin(a)*1.9),.035,0x6b5943,tree);}
  }

  const signs: { mesh: THREE.Mesh; owner: Proxy }[] = [];
  function sign(text: string, s: number, y: number, width: number, height: number, background: string, color: string, f = front, n = -.3) {
    const owner = box('observed-sign', f, s - width / 2, s + width / 2, n, n + .1, y, y + height, Number.parseInt(background.slice(1), 16), 'metal');
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = Math.round(512 * height / width); const ctx = canvas.getContext('2d')!; ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = color; ctx.font = `600 ${canvas.height * .78}px "Malgun Gothic", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width * .92);
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; const a = f.point(0), b = f.point(0, -1), normal = new THREE.Vector3(b[0] - a[0], 0, b[1] - a[1]), right = new THREE.Vector3(normal.z, 0, -normal.x), mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height).scale(-1, 1, 1), new THREE.MeshStandardMaterial({ map, side: THREE.DoubleSide }));
    mesh.position.copy(at(f, s, y + height / 2, n - .01)); mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, new THREE.Vector3(0, 1, 0), normal)); mesh.userData.text = text; shell.add(mesh); signs.push({ mesh, owner });
  }
  sign('6', 3.6, floor + 10.8, .75, 1, '#695846', '#f0edce');
  const meshes = batches.map(b => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(b.positions, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(b.colors, 3)); g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere(); const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: b.glass ? .22 : .68, side: THREE.DoubleSide, transparent: b.glass, opacity: b.glass ? .55 : 1, depthWrite: !b.glass })); mesh.name = b.glass ? 'humanities6-glass' : 'humanities6-surfaces'; mesh.castShadow = !b.glass; mesh.receiveShadow = true; shell.add(mesh); return mesh; });
  shell.userData.humanities6Access = { buildingId: building.id, floor, base, visibleLevels: 4, levelsEstimated: false, height: roof-floor, heightEstimated: true, pavementMasks, stepSamples, entryRoute, westRoute, northRoute, eastRoute, source: 'https://map.snu.ac.kr/api/upload/default/F_BUILD_0000006.jpg', film: 'https://www.youtube.com/watch?v=jIMJe65t6gs', filmYear: 2024, captureDate: null, dimensionsEstimated: true, currentConstructionStateVerified: false, wholeInteriorImplemented: false, rearAppearanceUnobserved: true, connection251: { officialSeq: 182, name: '사회관연결동(6동-7동)', sharesMappedOutline: true, partitionVerified: false, wholeInteriorImplemented: false }, doorsOpenedForGameplay: true, geometry: { meshes: 2, signMeshes: signs.length, textures: signs.length, triangles: batches.reduce((n,b)=>n+b.positions.length/9,0), colliders: breakables.length } };
  function update(_player: THREE.Vector3) { batches.forEach((b, index) => { const a = meshes[index].geometry.attributes.position as THREE.BufferAttribute, c = meshes[index].geometry.attributes.color as THREE.BufferAttribute; let moved = false, tinted = false;
    for (const p of b.parts) { if (p.shown !== p.proxy.visible) { p.shown = p.proxy.visible; moved = true; if (p.shown) (a.array as Float32Array).set(p.original, p.start); else for (let i = p.start; i < p.end; i += 3) { a.array[i] = p.proxy.position.x; a.array[i + 1] = p.proxy.position.y; a.array[i + 2] = p.proxy.position.z; } } if (p.color !== p.proxy.material.color.getHex()) { p.color = p.proxy.material.color.getHex(); tinted = true; const t = p.proxy.material.color, scale = [t.r / p.base.r, t.g / p.base.g, t.b / p.base.b]; for (let i = p.start; i < p.end; i++) c.array[i] = p.colors[i - p.start] * scale[(i - p.start) % 3]; } }
    if (moved) a.needsUpdate = true; if (tinted) c.needsUpdate = true;
  }); for (const s of signs) s.mesh.visible = s.owner.visible; shell.visible = batches.some(b => b.parts.some(p => p.proxy.visible)); }
  return { shell, breakables, update };
}
