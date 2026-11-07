import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import type { CampusBuilding } from './fullCampus';
import { humanities23Frame, getHumanities23Openings } from './humanities23Site';
import { HUMANITIES35, getHumanities35Layout, getHumanities35Openings } from './humanities35Site';
type XZ = [number, number];
type Frame = ReturnType<typeof humanities23Frame>;
type Proxy = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
export const HUMANITIES35_EXTERIOR_IDS = [HUMANITIES35.neighborId, HUMANITIES35.buildingId];

/** 두 건물의 공식 사진에서 확인한 면을 구분한다. 치수와 사진의 방위 대응은 근사다. */
export function createHumanities35Exterior(scene:THREE.Scene,building:CampusBuilding,heightAt:(x:number,z:number)=>number,include23=true,include35=true){
  const is3=building.id===HUMANITIES35.neighborId, number=is3?'3':'5';
  const shell=new THREE.Group();shell.name='landmark/humanities'+number+'-exterior';
  Object.assign(shell.userData,{role:'building-shell',buildingId:building.id,landmark:'humanities'+number+'-exterior',mappedOutline:building.points});scene.add(shell);
  const distant=new THREE.Group();distant.name=building.id+':humanities35-exterior-distant';distant.visible=false;
  Object.assign(distant.userData,{role:'distant-building',buildingId:building.id});scene.add(distant);
  const ring=building.points.slice(0,-1),signedArea=ring.reduce((sum,a,i)=>{const b=ring[(i+1)%ring.length];return sum+a[0]*b[1]-b[0]*a[1]},0);
  // 3동과 5동의 원본 윤곽 방향이 반대이므로 바깥 면의 부호를 통일한다.
  const frames=ring.map((p,i)=>signedArea>0?humanities23Frame(p,ring[(i+1)%ring.length]):humanities23Frame(ring[(i+1)%ring.length],p));
  const breakables: BreakableSpec[] = [];
  const batches = [false, true].map(glass => ({ glass, positions: [] as number[], colors: [] as number[], parts: [] as { proxy: Proxy; start: number; end: number; original: Float32Array; colors: Float32Array; base: THREE.Color; color: number; shown: boolean }[] }));
  const at = (f: Frame, s: number, y: number, n = 0) => { const p = f.point(s, n); return new THREE.Vector3(p[0], y, p[1]); };
  function part(name: string, vertices: THREE.Vector3[], color: number, material: BreakableSpec['material'] = 'stone', owner?: Proxy, flat = false) {
    const bounds = new THREE.Box3().setFromPoints(vertices), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const g = flat ? new THREE.BufferGeometry() : new ConvexGeometry(vertices.map(p => p.clone().sub(center)));
    if (flat) { const values: number[] = []; for (let i = 1; i + 1 < vertices.length; i++) for (const p of [vertices[0], vertices[i], vertices[i + 1]]) values.push(...p.clone().sub(center).toArray()); g.setAttribute('position', new THREE.Float32BufferAttribute(values, 3)); }
    const attr = g.attributes.position, proxy = owner ?? new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color }));
    if (!owner) { proxy.position.copy(center); proxy.updateMatrixWorld(true); Object.assign(proxy.userData, { buildingId: building.id, component: name, renderProxy: true, convex: true }); breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attr.array), toughness: material === 'glass' ? 2 : 8, material, label: number+'동 외관' }); }
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
  for (let i = 0; i < (ti?.count ?? tp.count); i += 3) { const t = [0, 1, 2].map(j => { const k = ti ? ti.getX(i + j) : i + j; return new THREE.Vector3(tp.getX(k), tp.getY(k), tp.getZ(k)); }); if (Math.max(...t.map(v => v.x)) > 415 && Math.min(...t.map(v => v.x)) < 535 && Math.max(...t.map(v => v.z)) > -695 && Math.min(...t.map(v => v.z)) < -580) terrainTriangles.push(t); }
  function ground(p: XZ) { const [x, z] = p; for (const [a, b, c] of terrainTriangles) { const det = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x), u = ((x - a.x) * (c.z - a.z) - (z - a.z) * (c.x - a.x)) / det, v = ((b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x)) / det; if (u >= -1e-7 && v >= -1e-7 && u + v <= 1.0000001) return a.y + u * (b.y - a.y) + v * (c.y - a.y); } throw Error('Missing humanities 3/5 terrain'); }


  const layout=getHumanities35Layout(heightAt),floor=is3?layout.base3:layout.base5,storey=3.5,roof=floor+14;
  const openings=[...(include23?getHumanities23Openings(building.id,building.points,heightAt):[]),...(include35?getHumanities35Openings(building.id,building.points,heightAt):[])];
  Object.assign(shell.userData,{connectionOpening:openings[0],connectionOpenings:openings});
  const observedEdges=is3?[1,2,3,4]:[1,7,8,9],foundation=Math.min(floor,...ring.map(p=>heightAt(...p)))-.6;
  const eaves: {edge:number;s0:number;s1:number;owner:Proxy}[]=[];
  function window(f:Frame,owner:Proxy,s0:number,s1:number,lo:number,hi:number,grille:boolean){
    if(s1-s0<.3||hi-lo<.25)return;
    part('green-window',[at(f,s0,lo,-.354),at(f,s1,lo,-.354),at(f,s1,hi,-.354),at(f,s0,hi,-.354)],0x5e8c85,'glass',owner,true);
    for(const s of[s0,(s0+s1)/2,s1])box('window-frame',f,s-.03,s+.03,-.44,-.36,lo,hi,0xaeb7ac,'metal',owner);
    for(const y of[lo,hi])box('window-frame',f,s0-.04,s1+.04,-.44,-.36,y-.04,y+.04,0xaeb7ac,'metal',owner);
    if(grille){for(let s=s0+.15;s<s1;s+=.17)box('ground-window-grille',f,s,s+.026,-.56,-.48,lo,hi,0x9ca58d,'metal',owner);for(const y of[lo+.2,hi-.2])box('grille-crossbar',f,s0,s1,-.56,-.48,y-.025,y+.025,0x9ca58d,'metal',owner);}
  }
  for(const [edge,f]of frames.entries()){
    const observed=observedEdges.includes(edge),blankEnd=is3?[3,4].includes(edge):edge===1,existingEnd=!is3&&edge===1&&include35;
    const edgeOpenings=openings.filter(o=>o.edgeIndex===edge).map(o=>({s0:Math.min(f.local(o.a).s,f.local(o.b).s),s1:Math.max(f.local(o.a).s,f.local(o.b).s),bottom:o.bottom,top:o.top}));
    const divisions=Math.max(1,Math.ceil(f.length/7.5)),cuts=[...Array.from({length:divisions+1},(_,i)=>i*f.length/divisions),...edgeOpenings.flatMap(o=>[o.s0,o.s1])].sort((a,b)=>a-b);
    for(let level=0;level<4;level++)for(let j=1;j<cuts.length;j++){
      const a=cuts[j-1],b=cuts[j],center=(a+b)/2;if(b-a<.02)continue;
      const y=floor+level*storey,bottom=level===0?Math.min(foundation,ground(f.point(center))-.6):y;
      let spans:number[][]=[[bottom,y+storey]];
      for(const o of edgeOpenings.filter(o=>center>o.s0-1e-6&&center<o.s1+1e-6))spans=spans.flatMap(([lo,hi])=>[[lo,Math.min(hi,o.bottom)],[Math.max(lo,o.top),hi]]).filter(([lo,hi])=>hi-lo>.02);
      for(const [lo,hi]of spans){
        const wall=box('brick-facade-bay',f,a,b,-.325,.325,lo,hi,observed?(is3?0x595b59:0x655d58):0x79766f);
        Object.assign(wall.userData,{facadeEdge:edge,storey:level,range:[a,b],bottom:lo,top:hi});
        if(observed)for(let h=lo;h<hi-.012;h+=.22){facet('brick-horizontal-joint',f,a+.006,b-.006,h,Math.min(h+.009,hi),-.334,0xa5a297,wall);for(let s=a+.3+(Math.round((h-floor)/.22)%2)*.3;s<b-.03;s+=.6)facet('brick-vertical-joint',f,s,Math.min(s+.009,b-.006),h,Math.min(h+.22,hi),-.337,0xa5a297,wall);}
        if(!blankEnd&&b-a>1.5){const small=level>=2,cells=small&&b-a>4?2:1,width=(b-a)/cells;for(let k=0;k<cells;k++)window(f,wall,a+k*width+width*.17,a+(k+1)*width-width*.17,Math.max(lo,y+(small?.9:.55)),Math.min(hi,y+(small?2.55:2.9)),observed&&level===0);}
        if(!blankEnd&&observed&&level===0){const h=Math.min(hi,floor+.52);if(h>lo+.1){box('stone-plinth',f,a,b,-.46,-.34,lo,h,0xa29e92,'stone',wall);for(let yy=lo+.22;yy<h;yy+=.24)facet('plinth-course',f,a,b,yy,Math.min(yy+.013,h),-.467,0x72786d,wall);}}
        const bandLo=Math.max(lo,y+storey-.38),bandHi=Math.min(hi,y+storey);if(!existingEnd&&bandHi-bandLo>.02)box('white-floor-band',f,a,b,-.54,.38,bandLo,bandHi,0xdfdfd5,'stone',wall);
      }
    }
    if(!existingEnd)for(let j=0;j<=divisions;j++){const s=j*f.length/divisions;if(edgeOpenings.some(o=>s>o.s0-.2&&s<o.s1+.2))continue;box('white-concrete-pilaster',f,Math.max(0,s-.16),Math.min(f.length,s+.16),-.62,-.33,Math.min(floor-.35,ground(f.point(s))-.35),roof,0xdfdfd5);}
    for(let s=0;s<f.length;s+=5.5){const end=Math.min(f.length,s+5.5),eave=box('deep-roof-eave',f,s,end,-1.35,.4,roof-.12,roof+.15,0xdadcd2);eaves.push({edge,s0:s,s1:end,owner:eave});box('roof-parapet-base',f,s,end,-.27,.28,roof+.15,roof+.32,0xe0e1d5,'stone',eave);box('roof-parapet-cap',f,s,end,-.3,.31,roof+.78,roof+.92,0xe0e1d5,'stone',eave);for(let v=s;v<end-.1;v+=2.3)box('roof-parapet-post',f,v,v+.12,-.24,.25,roof+.32,roof+.78,0xe0e1d5,'stone',eave);if(observed&&!blankEnd){const ss=(s+end)/2;beam('eave-brace',at(f,ss,roof-.65,-.37),at(f,ss,roof-.14,-1.18),.055,0xa5b0a3,eave);}}
  }
  const footprints=THREE.ShapeUtils.triangulateShape(ring.map(p=>new THREE.Vector2(...p)),[]).map(tri=>tri.map(i=>ring[i]));
  for(const tri of footprints){const top=tri.map(([x,z])=>new THREE.Vector3(x,roof+.38,z));part('footprint-roof',[...top,...top.map(p=>p.clone().add(new THREE.Vector3(0,-.48,0)))],is3?0x70978c:0xaeb8aa);}
  if(is3){
    // 4동의 상대 위치를 대조해 공식 3동 사진의 끝벽을 북쪽에 대응한다.
    const f=frames[4],a=1.8,b=5;
    for(const level of[1,2]){const y=floor+level*storey,slab=box('end-balcony-floor',f,a,b,-1.2,.05,y-.2,y,0xd7d9cf);box('end-balcony-parapet',f,a,b,-1.2,-1.02,y,y+.74,0xdfdfd4,'stone',slab);for(const s of[a,b])box('end-balcony-side',f,s-.08,s+.08,-1.2,.05,y,y+.74,0xdfdfd4,'stone',slab);beam('end-balcony-rail',at(f,a,y+.97,-1.1),at(f,b,y+.97,-1.1),.04,0xaaa99b,slab);for(const s of[a,b])beam('end-balcony-post',at(f,s,y+.74,-1.1),at(f,s,y+.97,-1.1),.035,0xaaa99b,slab);const door=box('balcony-door',f,a+.3,b-.3,-.42,-.35,y+.06,y+2.65,0x53756f,'glass');for(const s of[a+.3,(a+b)/2,b-.3])box('balcony-door-frame',f,s-.035,s+.035,-.47,-.42,y+.06,y+2.65,0xb6bfb3,'metal',door);}
    const front=frames[2],s=.8,owner=eaves.find(e=>e.edge===2&&s>e.s0&&s<e.s1)?.owner;
    if(owner){box('number-fascia',front,s-.16,s+.64,-1.35,-1.17,roof-.4,roof+.36,0xdadcd2,'stone',owner);for(const y of[roof-.3,roof-.04,roof+.22])box('building-number-three',front,s,s+.48,-1.365,-1.34,y,y+.07,0x708f97,'stone',owner);box('building-number-three',front,s+.41,s+.48,-1.365,-1.34,roof-.3,roof+.29,0x708f97,'stone',owner);}
  }
  for(const edge of(is3?[1,2]:[8,9])){const f=frames[edge],s=.45;const owner=breakables.find(t=>t.mesh.userData.facadeEdge===edge&&t.mesh.userData.storey===0&&t.mesh.userData.range[0]<=s&&t.mesh.userData.range[1]>=s)?.mesh as Proxy|undefined;if(owner)for(let y=floor+.25;y<roof-.3;y+=3)beam('rainwater-downpipe',at(f,s,y,-.69),at(f,s,Math.min(roof-.3,y+3),-.69),.048,0xb1b8ad,owner);}
  shell.userData.humanities35Exterior={buildingId:building.id,number,floor,roof,levels:4,levelsEstimated:true,dimensionsEstimated:true,photoFaceMappingEstimated:true,observedEdges,unobservedEdges:frames.map((_,i)=>i).filter(i=>!observedEdges.includes(i)),wholeInteriorImplemented:false,openings,existingConnectionsPreserved:true,photoCaptureDate:null,sources:['https://map.snu.ac.kr/api/upload/default/F_BUILD_000000'+number+'.jpg']};
  const meshes = batches.map(b => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(b.positions, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(b.colors, 3)); g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere(); const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: b.glass ? .22 : .68, side: THREE.DoubleSide })); mesh.name = b.glass ? 'humanities35-exterior-glass' : 'humanities35-exterior-surfaces'; mesh.castShadow = !b.glass; mesh.receiveShadow = true; shell.add(mesh); return mesh; });
  shell.userData.humanities35Exterior.geometry = {meshes:2,textures:0,triangles:batches.reduce((n,b)=>n+b.positions.length/9,0),colliders:breakables.length};
  function update(_player: THREE.Vector3) { batches.forEach((b, index) => { const a = meshes[index].geometry.attributes.position as THREE.BufferAttribute, c = meshes[index].geometry.attributes.color as THREE.BufferAttribute; let moved = false, tinted = false;
    for (const p of b.parts) { if (p.shown !== p.proxy.visible) { p.shown = p.proxy.visible; moved = true; if (p.shown) (a.array as Float32Array).set(p.original, p.start); else for (let i = p.start; i < p.end; i += 3) { a.array[i] = p.proxy.position.x; a.array[i + 1] = p.proxy.position.y; a.array[i + 2] = p.proxy.position.z; } } if (p.color !== p.proxy.material.color.getHex()) { p.color = p.proxy.material.color.getHex(); tinted = true; const t = p.proxy.material.color, scale = [t.r / p.base.r, t.g / p.base.g, t.b / p.base.b]; for (let i = p.start; i < p.end; i++) c.array[i] = p.colors[i - p.start] * scale[(i - p.start) % 3]; } }
    if (moved) a.needsUpdate = true; if (tinted) c.needsUpdate = true;
  }); shell.visible = batches.some(b => b.parts.some(p => p.proxy.visible)); }
  // 렌더 버퍼와 복원용 사본을 만든 뒤 조립용 배열을 비운다.
 for(const batch of batches){batch.positions.length=0;batch.colors.length=0;}
 return { shell, breakables, update };
}
