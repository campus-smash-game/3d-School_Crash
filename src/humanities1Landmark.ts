import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import type { CampusBuilding } from './fullCampus';
import { getHumanitiesPassageLayout } from './humanitiesPassage';
import { getHumanities250Openings } from './humanities250';
import { humanities23Frame } from './humanities23Site';

type XZ = [number, number];
type Frame = ReturnType<typeof humanities23Frame>;
type Proxy = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
export const HUMANITIES1_ID = 'way/167984624';

/** 공식 캠퍼스 사진의 전면과 지도상의 외곽을 결합한다. 높이와 시설 치수는 근사다. */
export function createHumanities1Landmark(scene: THREE.Scene, building: CampusBuilding, heightAt: (x: number, z: number) => number, blockedPaving: XZ[][] = [], include250 = true) {
  const shell = new THREE.Group(); shell.name = 'landmark/humanities1-exterior';
  Object.assign(shell.userData, { role: 'building-shell', buildingId: building.id, landmark: 'humanities1-exterior', mappedOutline: building.points }); scene.add(shell);
  const distant = new THREE.Group(); distant.name = `${building.id}:humanities1-exterior-distant`; distant.visible = false;
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
    if (!owner) { proxy.position.copy(center); proxy.updateMatrixWorld(true); Object.assign(proxy.userData, { buildingId: building.id, component: name, renderProxy: true, convex: true }); breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attr.array), toughness: material === 'glass' ? 2 : 8, material, label: '1동 외관과 진입로' }); }
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
  for (let i = 0; i < (ti?.count ?? tp.count); i += 3) { const t = [0, 1, 2].map(j => { const k = ti ? ti.getX(i + j) : i + j; return new THREE.Vector3(tp.getX(k), tp.getY(k), tp.getZ(k)); }); if (Math.max(...t.map(v => v.x)) > 290 && Math.min(...t.map(v => v.x)) < 390 && Math.max(...t.map(v => v.z)) > -715 && Math.min(...t.map(v => v.z)) < -640) terrainTriangles.push(t); }
  function ground(p: XZ) { const [x, z] = p; for (const [a, b, c] of terrainTriangles) { const det = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x), u = ((x - a.x) * (c.z - a.z) - (z - a.z) * (c.x - a.x)) / det, v = ((b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x)) / det; if (u >= -1e-7 && v >= -1e-7 && u + v <= 1.0000001) return a.y + u * (b.y - a.y) + v * (c.y - a.y); } throw Error('Missing humanities 1 terrain'); }
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


  const passage = getHumanitiesPassageLayout(heightAt, building.points), floor = passage.base, storey = 3.5, roof = floor + 14;
  const front = frames[0], frontPortal = front.local(passage.openings[0].center).s;
  const openings = [...passage.openings, ...(include250 ? getHumanities250Openings(building.id, building.points, heightAt) : [])];
  Object.assign(shell.userData, {connectionOpening: openings[0], connectionOpenings: openings});
  const balcony = { s0: frontPortal - 10.6, s1: frontPortal - 3.2, floor: floor + 7, depth: 1.5 };
  const roofParts: Proxy[] = [];
  function faceRect(f: Frame, name: string, s0: number, s1: number, y0: number, y1: number, n: number, color: number, owner: Proxy, material: BreakableSpec['material'] = 'stone') {
    part(name, [at(f,s0,y0,n),at(f,s1,y0,n),at(f,s1,y1,n),at(f,s0,y1,n)], color, material, owner, true);
  }
  function finishWall(f: Frame, edge: number, s0: number, s1: number, bottom: number, top: number, level: number) {
    const y = floor + level * storey, observed = edge === 0 || edge === 1 || edge === 2;
    const wall = box('brick-facade-bay',f,s0,s1,-.32,.32,bottom,top,observed?0x66584c:0x74695b);
    Object.assign(wall.userData, {facadeEdge: edge, storey: level});
    if (observed) for (let h = Math.max(bottom,floor); h < top-.012; h += .22) {
      facet('brick-horizontal-joint',f,s0+.008,s1-.008,h,Math.min(h+.009,top),-.333,0xa49c88,wall);
      for (let s=s0+.3+(Math.round((h-floor)/.22)%2)*.31;s<s1-.02;s+=.62) facet('brick-vertical-joint',f,s,Math.min(s+.009,s1-.008),h,Math.min(h+.22,top),-.336,0xa49c88,wall);
    }
    const center=(s0+s1)/2,width=s1-s0;
    // 통과길에 따로 만든 창을 유지한다.
    const existingWindow=edge===0&&((level===0&&Math.abs(center-frontPortal)<8)||(level===1&&Math.abs(center-frontPortal)<2.6));
    if (!existingWindow && width>1.2) {
      const low=Math.max(bottom,y+(level>=2?1.0:.55)),high=Math.min(top,y+(level>=2?2.4:2.85));
      if(high-low>.3){
        const cells=level>=2&&width>4?2:1;
        for(let k=0;k<cells;k++){
          const cell=width/cells,left=s0+k*cell+cell*.18,right=s0+(k+1)*cell-cell*.18;
          faceRect(f,'green-window',left,right,low,high,-.35,level===0?0x49786d:0x618d83,wall,'glass');
          for(const s of[left,(left+right)/2,right])box('window-frame',f,s-.027,s+.027,-.43,-.36,low,high,0xc1c7b5,'metal',wall);
          for(const h of[low,high])box('window-frame',f,left-.035,right+.035,-.43,-.36,h-.035,h+.035,0xc1c7b5,'metal',wall);
          if(edge===0&&level===1){for(let s=left+.15;s<right;s+=.16)box('window-grille',f,s,s+.024,-.49,-.44,low,high,0x929a8b,'metal',wall);for(const h of[low+.22,high-.22])box('window-grille-crossbar',f,left,right,-.49,-.44,h-.022,h+.022,0x929a8b,'metal',wall);}
        }
      }
    }
    if(edge===0&&level===0&&Math.abs(center-frontPortal)>8&&top>floor+.25){
      const high=Math.min(top,floor+.55);box('stone-plinth',f,s0,s1,-.45,-.33,bottom,high,0xa29b87,'stone',wall);
      for(let h=bottom+.22;h<high;h+=.24){facet('stone-course',f,s0,s1,h,h+.015,-.456,0x6d7368,wall);for(let s=s0+.35;s<s1;s+=.64)facet('stone-joint',f,s,s+.015,h,Math.min(h+.24,high),-.459,0x6d7368,wall);}
    }
    return wall;
  }
  for(const [edge,f] of frames.entries()){
    const edgeOpenings=openings.filter(o=>o.edgeIndex===edge).map(o=>({s0:Math.min(f.local(o.a).s,f.local(o.b).s),s1:Math.max(f.local(o.a).s,f.local(o.b).s),bottom:o.bottom,top:o.top}));
    const divisions=Math.ceil(f.length/7.4),cuts=[...Array.from({length:divisions+1},(_,i)=>i*f.length/divisions),...edgeOpenings.flatMap(o=>[o.s0,o.s1]),...(edge===0?[balcony.s0,balcony.s1]:[])].sort((a,b)=>a-b);
    for(let level=0;level<4;level++)for(let j=1;j<cuts.length;j++){
      const a=cuts[j-1],b=cuts[j],center=(a+b)/2;if(b-a<.02)continue;
      const y=floor+level*storey,bottom=level===0?Math.min(floor-.6,ground(f.point(center))-.6):y;
      const isBalcony=edge===0&&level===2&&center>balcony.s0&&center<balcony.s1;
      let spans:[[number,number]]|number[][]=[[bottom,y+storey]];
      for(const o of edgeOpenings.filter(o=>center>o.s0&&center<o.s1))spans=spans.flatMap(([lo,hi])=>[[lo,Math.min(hi,o.bottom)],[Math.max(lo,o.top),hi]]).filter(([lo,hi])=>hi-lo>.02);
      for(const [lo,hi]of spans){
        if(isBalcony){box('balcony-recess-back',f,a,b,balcony.depth,balcony.depth+.18,lo,hi,0x334d45);continue;}
        finishWall(f,edge,a,b,lo,hi,level);
      }
      const bandY=y+storey-.28;
      // 층별 띠가 연결 개구부를 막지 않게 한다.
      if(!edgeOpenings.some(o=>center>o.s0&&center<o.s1&&bandY<o.top&&y+storey>o.bottom))box('white-floor-band',f,a,b,-.56,.38,bandY,y+storey,0xdbdacb);
    }
    if(edge===0||edge===1||edge===2){
      for(let j=0;j<=divisions;j++){
        const s=j*f.length/divisions;
        if(edge===0&&Math.abs(s-frontPortal)<3.1)continue;
        if(edgeOpenings.some(o=>s>o.s0-.25&&s<o.s1+.25))continue;
        box('white-concrete-pilaster',f,Math.max(0,s-.17),Math.min(f.length,s+.17),-.62,-.28,Math.min(floor-.4,ground(f.point(s))-.4),roof,0xdbdacb);
      }
    }
    for(let s=0;s<f.length;s+=6){
      const end=Math.min(f.length,s+6),soffit=box('wide-roof-eave',f,s,end,-.9,.4,roof-.12,roof+.12,0xd5d6c8);roofParts.push(soffit);
      box('roof-parapet-base',f,s,end,-.28,.25,roof+.12,roof+.3,0xdadbcf,'stone',soffit);
      box('roof-parapet-cap',f,s,end,-.3,.27,roof+.75,roof+.85,0xdadbcf,'stone',soffit);
      for(let v=s;v<end;v+=2.2)box('roof-parapet-post',f,v,v+.12,-.25,.22,roof+.3,roof+.75,0xdadbcf,'stone',soffit);
    }
  }
  for(const tri of footprints){const top=tri.map(([x,z])=>new THREE.Vector3(x,roof+.38,z));roofParts.push(part('footprint-roof',[...top,...top.map(p=>p.clone().add(new THREE.Vector3(0,-.48,0)))],0xadb7a9));}
  const balconyFloor=box('balcony-floor',front,balcony.s0,balcony.s1,-.45,balcony.depth,balcony.floor-.2,balcony.floor,0xb8bcad);
  for(const s of[balcony.s0,balcony.s1])box('balcony-recess-side',front,s-.12,s+.12,-.32,balcony.depth,balcony.floor,balcony.floor+storey,0xc8cabb);
  box('balcony-balustrade-base',front,balcony.s0,balcony.s1,-.48,-.2,balcony.floor,balcony.floor+.35,0xd8d6c6,'stone',balconyFloor);
  box('balcony-balustrade-cap',front,balcony.s0,balcony.s1,-.49,-.19,balcony.floor+.9,balcony.floor+1.12,0xd8d6c6,'stone',balconyFloor);
  for(let i=0;i<=3;i++){const s=balcony.s0+(balcony.s1-balcony.s0)*i/3;box('balcony-balustrade-post',front,s-.12,s+.12,-.48,-.2,balcony.floor+.35,balcony.floor+.9,0xd8d6c6,'stone',balconyFloor);}
  const planter=box('balcony-planter',front,balcony.s0+.4,balcony.s1-.4,.15,.6,balcony.floor+.22,balcony.floor+.5,0x8a7052);
  for(let s=balcony.s0+.6;s<balcony.s1-.3;s+=.55)beam('balcony-vine',at(front,s,balcony.floor+.5,.35),at(front,s+.17,balcony.floor+1.25,.25),.016,0x737954,planter);
  // 1동 번호는 공식 사진에 보이는 동쪽 끝벽에 표시한다. 위치와 글자 크기는 근사다.
  const numberWall=breakables.find(t=>t.mesh.userData.component==='brick-facade-bay'&&t.mesh.userData.facadeEdge===1&&t.mesh.userData.storey===3)?.mesh as Proxy;
  if(numberWall){const f=frames[1],s=2.5;box('building-number-one',f,s,s+.16,-.47,-.39,floor+10.9,floor+12.55,0xe4e3d6,'stone',numberWall);box('building-number-one',f,s-.15,s+.32,-.47,-.39,floor+10.9,floor+11.02,0xe4e3d6,'stone',numberWall);beam('building-number-one',at(f,s-.22,floor+12.25,-.45),at(f,s+.05,floor+12.53,-.45),.06,0xe4e3d6,numberWall);}
  const approachPoints:XZ[]=[[340.45,-702.43],[343.78,-690.7]],approach=humanities23Frame(...approachPoints as [XZ,XZ]);
  paving(approach,0,approach.length,-1.3,1.3,'front-approach');
  for(const [s0,s1]of[[frontPortal-11,frontPortal-8],[frontPortal+6.8,frontPortal+9.8]]){
    const ys=[s0,s1].map(s=>ground(front.point(s,-1.15))),bottom=Math.min(...ys),top=Math.max(...ys)+.42;
    const hedge=box('low-entry-hedge',front,s0,s1,-1.5,-.85,bottom-.1,top,0x64794b,'wood');
    for(let s=s0+.3;s<s1;s+=.6){const p=at(front,s,top-.1,-1.17),g=new THREE.IcosahedronGeometry(.46,0),a=g.attributes.position;part('hedge-leaves',Array.from({length:a.count},(_,i)=>new THREE.Vector3(a.getX(i),a.getY(i)*.55,a.getZ(i)*.8).add(p)),0x748853,'wood',hedge);g.dispose();}
  }
  const route=[...approachPoints,passage.openings[0].center,passage.openings[1].center,passage.point(passage.length)];
  shell.userData.humanities1Exterior={buildingId:building.id,floor,roof,levels:4,levelsEstimated:true,dimensionsEstimated:true,photoFaceMappingEstimated:true,openings,pavementMasks,route,balcony,wholeInteriorImplemented:false,balconyInteriorAccessImplemented:false,unobservedFaces:[3,4,5],source:'https://humanities.snu.ac.kr/community/newsletter?md=download&seqidx=63',photoPrintedPage:25,photoPublished:'2026-04-20',photoCaptureDate:null,existingPassageAnd250Preserved:true,approachRoad:'way/167982833/52'};
  const meshes = batches.map(b => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(b.positions, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(b.colors, 3)); g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere(); const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: b.glass ? .22 : .68, side: THREE.DoubleSide })); mesh.name = b.glass ? 'humanities1-exterior-glass' : 'humanities1-exterior-surfaces'; mesh.castShadow = !b.glass; mesh.receiveShadow = true; shell.add(mesh); return mesh; });
  shell.userData.humanities1Exterior.geometry = {meshes:2,textures:0,triangles:batches.reduce((n,b)=>n+b.positions.length/9,0),colliders:breakables.length};
  function update(_player: THREE.Vector3) { batches.forEach((b, index) => { const a = meshes[index].geometry.attributes.position as THREE.BufferAttribute, c = meshes[index].geometry.attributes.color as THREE.BufferAttribute; let moved = false, tinted = false;
    for (const p of b.parts) { if (p.shown !== p.proxy.visible) { p.shown = p.proxy.visible; moved = true; if (p.shown) (a.array as Float32Array).set(p.original, p.start); else for (let i = p.start; i < p.end; i += 3) { a.array[i] = p.proxy.position.x; a.array[i + 1] = p.proxy.position.y; a.array[i + 2] = p.proxy.position.z; } } if (p.color !== p.proxy.material.color.getHex()) { p.color = p.proxy.material.color.getHex(); tinted = true; const t = p.proxy.material.color, scale = [t.r / p.base.r, t.g / p.base.g, t.b / p.base.b]; for (let i = p.start; i < p.end; i++) c.array[i] = p.colors[i - p.start] * scale[(i - p.start) % 3]; } }
    if (moved) a.needsUpdate = true; if (tinted) c.needsUpdate = true;
  }); shell.visible = batches.some(b => b.parts.some(p => p.proxy.visible)); }
  return { shell, breakables, update };
}
