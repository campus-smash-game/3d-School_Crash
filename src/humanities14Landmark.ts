import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import type { CampusBuilding } from './fullCampus';
import { humanities23Frame } from './humanities23Site';

type XZ = [number, number];
type Frame = ReturnType<typeof humanities23Frame>;
type Proxy = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
export const HUMANITIES14_ID = 'way/167609164';

/** 공식 캠퍼스 사진의 전면과 지도상의 외곽을 결합한다. 높이와 시설 치수는 근사다. */
export function createHumanities14Landmark(scene: THREE.Scene, building: CampusBuilding, heightAt: (x: number, z: number) => number, blockedPaving: XZ[][] = []) {
  const shell = new THREE.Group(); shell.name = 'landmark/humanities14-exterior';
  Object.assign(shell.userData, { role: 'building-shell', buildingId: building.id, landmark: 'humanities14-exterior', mappedOutline: building.points }); scene.add(shell);
  const distant = new THREE.Group(); distant.name = `${building.id}:humanities14-exterior-distant`; distant.visible = false;
  Object.assign(distant.userData, { role: 'distant-building', buildingId: building.id }); scene.add(distant);
  const ring = building.points.slice(0, -1), frames = ring.map((p, i) => humanities23Frame(p, ring[(i + 1) % ring.length]));
  const breakables: BreakableSpec[] = [], pavementMasks: { component: string; polygon: XZ[] }[] = [];
  const batches = [false, true].map(glass => ({ glass, positions: [] as number[], colors: [] as number[], parts: [] as { proxy: Proxy; start: number; end: number; original: Float32Array; colors: Float32Array; base: THREE.Color; color: number; shown: boolean }[] }));
  const at = (f: Frame, s: number, y: number, n = 0) => { const p = f.point(s, n); return new THREE.Vector3(p[0], y, p[1]); };
  function part(name: string, vertices: THREE.Vector3[], color: number, material: BreakableSpec['material'] = 'stone', owner?: Proxy, flat = false) {
    const bounds = new THREE.Box3().setFromPoints(vertices), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const g = flat ? new THREE.BufferGeometry() : new ConvexGeometry(vertices.map(p => p.clone().sub(center)));
    if (flat) { const values: number[] = []; for (let i = 1; i + 1 < vertices.length; i++) for (const p of [vertices[0], vertices[i], vertices[i + 1]]) values.push(...p.clone().sub(center).toArray()); g.setAttribute('position', new THREE.Float32BufferAttribute(values, 3)); }
    const attr = g.attributes.position, proxy = owner ?? new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color }));
    if (!owner) { proxy.position.copy(center); proxy.updateMatrixWorld(true); Object.assign(proxy.userData, { buildingId: building.id, component: name, renderProxy: true, convex: true }); breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attr.array), toughness: material === 'glass' ? 2 : 8, material, label: '14동 외관과 입구' }); }
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
  for (let i = 0; i < (ti?.count ?? tp.count); i += 3) { const t = [0, 1, 2].map(j => { const k = ti ? ti.getX(i + j) : i + j; return new THREE.Vector3(tp.getX(k), tp.getY(k), tp.getZ(k)); }); if (Math.max(...t.map(v => v.x)) > 540 && Math.min(...t.map(v => v.x)) < 630 && Math.max(...t.map(v => v.z)) > -648 && Math.min(...t.map(v => v.z)) < -577) terrainTriangles.push(t); }
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
        for (const poly of pieces) { if(area(poly)<.002)continue; const top = poly.map(v => v.clone().add(new THREE.Vector3(0, .045 + (lift?.(v) ?? 0), 0))), owner = part(component, [...top, ...top.map(v => v.clone().add(new THREE.Vector3(0, -.12, 0)))], (Math.floor(s / 2.6) + Math.floor(n / 2.6)) % 3 === 0 ? 0x9e9c92 : 0xb5b5ab); pavementMasks.push({ component, polygon: poly.map(v => [v.x, v.z]) });
          for (const axis of ['s', 'n'] as const) for (let t = axis === 's' ? s + .25 : n + .5; t < (axis === 's' ? ss : nn); t += axis === 's' ? .25 : .5) { let joint = clip(poly, v => f.local([v.x, v.z])[axis] - t); joint = clip(joint, v => t + .009 - f.local([v.x, v.z])[axis]); if (joint.length >= 3 && area(joint) > 1e-8) part('paving-joint', joint.map(v => v.clone().add(new THREE.Vector3(0, .047 + (lift?.(v) ?? 0), 0))), 0x81867f, 'stone', owner, true); }
        }
      }
    }
  }

  const front=frames[3],west=frames[2],terrace=frames[0],entryS=14,portal={s0:11,s1:17};
  const floor=Math.max(...masks(front,portal.s0,portal.s1,-.4,5.8).map(ground))+.16,storey=3.3,roof=floor+7*storey;
  const stepSamples: {point:XZ;top:number}[]=[];
  // 지하층 입구와 지상 여섯 층을 구분한다. 층고와 경사지 단면은 실측이 아니다.
  for(const [edge,f] of frames.entries()) {
    const observed=edge===2||edge===3,frontFace=edge===3,westFace=edge===2;
    const bays=Math.ceil(f.length/3.9),limits=frontFace?[0,4,8,11,17,20,24,28,32,36,40,44,48,52,f.length]:Array.from({length:bays+1},(_,i)=>i*f.length/bays);
    for(let level=0;level<7;level++) {
      if(edge===0&&level===6)continue;
      const y=floor+level*storey,recess=observed&&level<2?2.6:level>=4&&observed?.9:0;
      for(let j=1;j<limits.length;j++) {
        const a=limits[j-1],b=limits[j];if(b-a<.01)continue;
        if(frontFace&&level===0&&a===portal.s0)continue;
        const bottom=level?y:Math.min(y-.25,ground(f.point((a+b)/2,recess))-.15);
        const glass=observed&&(frontFace&&level<2||westFace&&level===1||level>=4);
        const wall=box(glass?'recessed-glass-bay':'concrete-facade-bay',f,a,b,recess,recess+.22,bottom,y+storey,glass?0x688888:0xb7b8ae,glass?'glass':'stone');
        if(glass) {
          for(const v of[a,b])box('black-window-mullion',f,v-.035,v+.035,recess-.09,recess-.01,bottom,y+storey,0x364242,'metal',wall);
          for(const h of[y,y+storey])box('black-window-transom',f,a,b,recess-.09,recess-.01,h-.04,h+.04,0x364242,'metal',wall);
        } else {
          if(westFace&&level===3&&j%2===0){
            facet('recessed-balcony-door',f,a+.25,b-.25,y+.13,y+2.9,-.025,0x354540,wall);
            box('balcony-sill',f,a+.22,b-.22,-.6,0,y+.1,y+.2,0xb4b6aa,'stone',wall);
            for(const v of[a+.27,b-.27])beam('balcony-rail-post',at(f,v,y+.2,-.52),at(f,v,y+1.25,-.52),.025,0x313c37,wall);
            for(const h of[.35,.6,.85,1.2])beam('balcony-horizontal-rail',at(f,a+.27,y+h,-.52),at(f,b-.27,y+h,-.52),.02,0x313c37,wall);
          } else if(level>0||!westFace) {
            const low=y+(level===2?1.05:.65),high=y+(level===2?2.0:2.65);
            facet('horizontal-window',f,a+.22,b-.22,low,high,-.025,0x668280,wall);
            for(const v of[a+.22,b-.22])box('window-frame',f,v-.025,v+.025,-.085,-.02,low,high,0x445655,'metal',wall);
          } else if(j%2===0)facet('retaining-wall-vent',f,a+.8,Math.min(b-.3,a+1.4),y+1.6,y+2.1,2.57,0x334442,wall);
          if(observed)for(let h=Math.max(y,bottom)+.35;h<y+storey;h+=.9)for(let v=a+.25;v<b;v+=.9)facet('concrete-form-tie',f,v,v+.035,h,h+.035,recess-.012,0x737a72,wall);
        }
      }
      if(level>=2)box('projecting-floor-band',f,0,f.length,-.24,.45,y-.2,y+.13,0xc5c5b8);
      if(observed&&level>=4)for(let v=.3;v<f.length;v+=1.15)box('vertical-sun-fin',f,v,v+.14,-.45,1.05,y,y+storey,0xc5bca7);
    }
    box('roof-edge',f,0,f.length,-.38,.4,roof-.18,roof+.12,0xc6c7b9);
    if(observed)for(let v=0;v<f.length+.01;v+=7.7)box('concrete-column',f,v-.2,Math.min(f.length+.2,v+.2),-.1,.45,floor+2*storey,roof,0xc7c7bc);
  }
  for(const tri of footprints)for(const [y,name]of[[roof,'footprint-roof'],[floor+2*storey,'cantilever-soffit']] as const){const top=tri.map(([x,z])=>new THREE.Vector3(x,y,z));part(name,[...top,...top.map(p=>p.clone().add(new THREE.Vector3(0,-.25,0)))],0xbfc1b3);}
  // 현관은 짧은 출입 공간까지만 열어 둔다.
  box('entry-floor',front,portal.s0,portal.s1,-.4,5.8,floor-.35,floor,0xa9ada3);
  box('entry-ceiling',front,portal.s0,portal.s1,2.5,5.8,floor+3.02,floor+storey,0xc0c1b4);
  box('vestibule-back',front,portal.s0,portal.s1,5.7,5.9,floor,floor+3.1,0xbdbfb3);
  for(const v of[portal.s0,portal.s1])box('vestibule-side',front,v-.08,v+.08,2.6,5.9,floor,floor+3.1,0xbdbfb3);
  for(const [a,b]of[[11,12.8],[15.2,17]])box('entry-glass-panel',front,a,b,2.6,2.72,floor,floor+2.9,0x74938a,'glass');
  for(const v of[11,12.8,15.2,17])box('entry-frame',front,v-.045,v+.045,2.54,2.76,floor,floor+3.1,0x34413f,'metal');
  for(const v of[12.82,15.18]){const door=box('open-entry-door',front,v-.045,v+.045,2.7,3.9,floor,floor+2.9,0x7b9890,'glass');beam('door-handle',at(front,v,floor+.85,3.55),at(front,v,floor+1.6,3.55),.025,0xc2c9c4,door);}
  const canopy=box('entry-canopy',front,9.8,18.2,-1.15,2.8,floor+3.08,floor+3.32,0x89989a,'metal');
  for(let v=10;v<18;v+=1.2)box('canopy-panel-joint',front,v,v+.016,-1.15,2.8,floor+3.32,floor+3.323,0x4f6668,'metal',canopy);
  const low=Math.max(...masks(front,portal.s0,portal.s1,-5,-4.7).map(ground))+.045,count=Math.max(2,Math.ceil((floor-low)/.15));
  for(let i=0;i<count;i++){const a=-5+4.6*i/count,b=-5+4.6*(i+1)/count,top=low+(floor-low)*(i+1)/count,owner=box('entry-step',front,portal.s0,portal.s1,a,b,low-.2,top,0xb8b9ad);box('step-nosing',front,portal.s0,portal.s1,a,a+.024,top,top+.003,0x7b857b,'stone',owner);stepSamples.push({point:front.point(entryS,(a+b)/2),top});}
  pavementMasks.push({component:'entry-floor',polygon:masks(front,portal.s0,portal.s1,-5,5.9)});
  paving(front,portal.s0,portal.s1,-7.2,-5,'entry-apron',p=>{const q=front.local([p.x,p.z]);return Math.max(0,Math.min(1,(q.n+7.2)/2.2))*Math.max(0,low-ground(front.point(q.s,-5))-.045);});
  const roadJoin:XZ=[576.47,-624.06],stairExit=humanities23Frame([572.8,-630.83],roadJoin).point(Math.hypot(3.67,6.77)+2);
  const approachPoints=[roadJoin,stairExit,front.point(entryS,-7.2)];
  for(let i=1;i<approachPoints.length;i++){const f=humanities23Frame(approachPoints[i-1],approachPoints[i]);paving(f,0,f.length,-1.25,1.25,'entry-approach');}
  const entryRoute=[...approachPoints,front.point(entryS,-5.2),front.point(entryS,0),front.point(entryS,4.5)];
  // 옆 계단은 돌출 상부의 아래에 두어 지도상의 차량 통로를 비워 둔다.
  for(const [a,b]of[[0,11],[17,24]])box('arcade-floor',front,a,b,.05,2.55,floor-.28,floor,0xb3b6aa);
  const stair=humanities23Frame(front.point(24,1.3),front.point(35,1.3)),upper=floor+storey,stairCount=Math.ceil(storey/.15);
  for(let i=0;i<stairCount;i++){const a=stair.length*i/stairCount,b=stair.length*(i+1)/stairCount,top=floor+storey*(i+1)/stairCount,owner=box('side-entry-stair',stair,a,b,-1.15,1.15,floor-.2,top,0xb5b8ac);box('step-nosing',stair,a,a+.025,-1.15,1.15,top,top+.003,0x7d8980,'stone',owner);stepSamples.push({point:stair.point((a+b)/2),top});}
  box('side-stair-landing',front,35,40,.15,2.45,upper-.25,upper,0xb4b8ad);
  for(const n of[-1.24,1.24]){const posts=8;for(let i=0;i<=posts;i++){const v=stair.length*i/posts,y=floor+storey*i/posts;beam('side-stair-post',at(stair,v,y,n),at(stair,v,y+1.05,n),.035,0x879792);}for(const h of[.3,.65,1.02])beam('side-stair-handrail',at(stair,0,floor+h,n),at(stair,stair.length,upper+h,n),.03,0x96a39c);}
  const sideStairRoute=[front.point(entryS,1.3),front.point(22.5,1.3),stair.point(0),stair.point(stair.length),front.point(38.5,1.3)];
  // 서쪽의 암석 화단은 공식 사진을 참고하되 개별 돌과 식재 위치는 근사다.
  for(let v=12;v<west.length-1;v+=2.3){const p=west.point(v,1.2),y=ground(p),geo=new THREE.IcosahedronGeometry(1.2,0),a=geo.attributes.position,vertices=Array.from({length:a.count},(_,i)=>new THREE.Vector3(a.getX(i)*1.1+p[0],a.getY(i)*.7+y+.55,a.getZ(i)*.8+p[1]));const rock=part('rock-garden',vertices,0x999c8d);geo.dispose();for(let k=0;k<4;k++){const d=k*1.4;beam('winter-shrub',at(west,v,y+.8,1.2),at(west,v+Math.cos(d)*.7,y+2.2+k*.18,1.2+Math.sin(d)*.5),.018,0x6e6d4b,rock);}beam('garden-timber-post',at(west,v,y+.5,.1),at(west,v,y+1.5,.1),.06,0x775d42,rock);if(v+2.3<west.length-1)for(const h of[.95,1.35])beam('garden-rope',at(west,v,y+h,.1),at(west,v+2.3,ground(west.point(v+2.3,1.2))+h,.1),.022,0xccc6b1,rock);}
  // 6층 테라스는 사범대 쪽 단면으로 추정했다. 실내 계단 연결은 아직 구현하지 않는다.
  const terraceFloor=floor+6*storey,terraceDepth=4.4;
  box('terrace-floor',terrace,0,terrace.length,0,terraceDepth,terraceFloor-.25,terraceFloor,0x927457,'wood');
  for(let v=.15;v<terrace.length;v+=.24)box('terrace-deck-joint',terrace,v,v+.014,0,terraceDepth,terraceFloor,terraceFloor+.002,0x625e4b,'wood',breakables.at(-1)!.mesh as Proxy);
  box('terrace-back-glass',terrace,.2,terrace.length-.2,terraceDepth,terraceDepth+.16,terraceFloor,roof-.15,0x6f8b81,'glass');
  for(const v of[.25,7.5,15,terrace.length-.25]){const column=box('terrace-column',terrace,v-.22,v+.22,0,.5,terraceFloor,roof,0xc3c4b6);box('terrace-wall-light',terrace,v-.1,v+.1,.5,.58,terraceFloor+1.95,terraceFloor+2.2,0xe6e6ce,'metal',column);}
  for(let v=0;v<terrace.length;v+=1.8)beam('terrace-rail-post',at(terrace,v,terraceFloor,.08),at(terrace,v,terraceFloor+1.12,.08),.022,0x57625b);
  for(const h of[.25,.5,.75,1.05])for(let v=0;v<terrace.length;v+=1.8)beam('terrace-horizontal-rail',at(terrace,v,terraceFloor+h,.08),at(terrace,Math.min(v+1.8,terrace.length),terraceFloor+h,.08),.018,0x637168);
  for(const v of[3,11,19]){const planter=box('terrace-planter',terrace,v-1.5,v+1.5,.7,1.8,terraceFloor,terraceFloor+.45,0xbac0b0);box('terrace-soil',terrace,v-1.35,v+1.35,.85,1.65,terraceFloor+.45,terraceFloor+.48,0x69764e,'wood',planter);for(let k=0;k<4;k++){const d=k*1.7,tip=at(terrace,v+Math.cos(d)*.8,terraceFloor+2+k*.1,1.2+Math.sin(d)*.5);beam('terrace-tree',at(terrace,v,terraceFloor+.45,1.2),tip,.025,0x77815e,planter);const foliage=new THREE.IcosahedronGeometry(.7,1),a=foliage.attributes.position;part('terrace-foliage',Array.from({length:a.count},(_,i)=>new THREE.Vector3(a.getX(i),a.getY(i)*.8,a.getZ(i)).add(tip)),k%2?0x5e804a:0x74965b,'wood',planter);foliage.dispose();}}
  for(const v of[5,13,21]){const table=box('terrace-table',terrace,v-.9,v+.9,2.6,3.5,terraceFloor+.73,terraceFloor+.81,0x877455,'wood');for(const ss of[v-.65,v+.65])box('table-leg',terrace,ss-.04,ss+.04,2.75,3.3,terraceFloor,terraceFloor+.73,0x737e74,'metal',table);box('terrace-bench',terrace,v-.9,v+.9,3.7,4.05,terraceFloor+.4,terraceFloor+.48,0x998163,'wood',table);}
  const meshes = batches.map(b => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(b.positions, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(b.colors, 3)); g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere(); const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: b.glass ? .22 : .68, side: THREE.DoubleSide, transparent: b.glass, opacity: b.glass ? .55 : 1, depthWrite: !b.glass })); mesh.name = b.glass ? 'humanities14-exterior-glass' : 'humanities14-exterior-surfaces'; mesh.castShadow = !b.glass; mesh.receiveShadow = true; shell.add(mesh); return mesh; });
  shell.userData.humanities14Exterior = { buildingId: building.id, floor, roof, physicalLevels: 7, documentedAboveGroundLevels: 6, basementEntry: true, floorArrangementEstimated: true, heightEstimated: true, entryRoute, sideStairRoute, pavementMasks, stepSamples, terraceFloor, terraceDepth, terraceOrientationEstimated: true, wholeInteriorImplemented: false, terraceInteriorAccessImplemented: false, rearAppearanceUnobserved: true, dimensionsEstimated: true, doorsOpenedForGameplay: true, source: 'https://map.snu.ac.kr/api/upload/default/F_BUILD_0000015.jpg', terraceSource: 'https://humanities.snu.ac.kr/community/department?bbsidx=3485&md=v', geometry: {meshes: 2,textures: 0,triangles: batches.reduce((n,b)=>n+b.positions.length/9,0),colliders: breakables.length} };
  function update(_player: THREE.Vector3) { batches.forEach((b, index) => { const a = meshes[index].geometry.attributes.position as THREE.BufferAttribute, c = meshes[index].geometry.attributes.color as THREE.BufferAttribute; let moved = false, tinted = false;
    for (const p of b.parts) { if (p.shown !== p.proxy.visible) { p.shown = p.proxy.visible; moved = true; if (p.shown) (a.array as Float32Array).set(p.original, p.start); else for (let i = p.start; i < p.end; i += 3) { a.array[i] = p.proxy.position.x; a.array[i + 1] = p.proxy.position.y; a.array[i + 2] = p.proxy.position.z; } } if (p.color !== p.proxy.material.color.getHex()) { p.color = p.proxy.material.color.getHex(); tinted = true; const t = p.proxy.material.color, scale = [t.r / p.base.r, t.g / p.base.g, t.b / p.base.b]; for (let i = p.start; i < p.end; i++) c.array[i] = p.colors[i - p.start] * scale[(i - p.start) % 3]; } }
    if (moved) a.needsUpdate = true; if (tinted) c.needsUpdate = true;
  }); shell.visible = batches.some(b => b.parts.some(p => p.proxy.visible)); }
  // 렌더 버퍼와 복원용 사본을 만든 뒤 조립용 배열을 비운다.
 for(const batch of batches){batch.positions.length=0;batch.colors.length=0;}
 return { shell, breakables, update };
}
