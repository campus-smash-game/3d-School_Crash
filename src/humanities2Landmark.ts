import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import type { CampusBuilding } from './fullCampus';
import { getHumanities250Openings, getHumanities250Layout } from './humanities250';
import { humanities23Frame, getHumanities23Openings, getHumanities23Layout } from './humanities23Site';

type XZ = [number, number];
type Frame = ReturnType<typeof humanities23Frame>;
type Proxy = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
export const HUMANITIES2_ID = 'way/167983080';

/** 공식 캠퍼스 사진의 전면과 지도상의 외곽을 결합한다. 높이와 시설 치수는 근사다. */
export function createHumanities2Landmark(scene: THREE.Scene, building: CampusBuilding, heightAt: (x: number, z: number) => number, include250 = true, include23 = true) {
  const shell = new THREE.Group(); shell.name = 'landmark/humanities2-exterior';
  Object.assign(shell.userData, { role: 'building-shell', buildingId: building.id, landmark: 'humanities2-exterior', mappedOutline: building.points }); scene.add(shell);
  const distant = new THREE.Group(); distant.name = `${building.id}:humanities2-exterior-distant`; distant.visible = false;
  Object.assign(distant.userData, { role: 'distant-building', buildingId: building.id }); scene.add(distant);
  const ring = building.points.slice(0, -1), frames = ring.map((p, i) => humanities23Frame(p, ring[(i + 1) % ring.length]));
  const breakables: BreakableSpec[] = [];
  const batches = [false, true].map(glass => ({ glass, positions: [] as number[], colors: [] as number[], parts: [] as { proxy: Proxy; start: number; end: number; original: Float32Array; colors: Float32Array; base: THREE.Color; color: number; shown: boolean }[] }));
  const at = (f: Frame, s: number, y: number, n = 0) => { const p = f.point(s, n); return new THREE.Vector3(p[0], y, p[1]); };
  function part(name: string, vertices: THREE.Vector3[], color: number, material: BreakableSpec['material'] = 'stone', owner?: Proxy, flat = false) {
    const bounds = new THREE.Box3().setFromPoints(vertices), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const g = flat ? new THREE.BufferGeometry() : new ConvexGeometry(vertices.map(p => p.clone().sub(center)));
    if (flat) { const values: number[] = []; for (let i = 1; i + 1 < vertices.length; i++) for (const p of [vertices[0], vertices[i], vertices[i + 1]]) values.push(...p.clone().sub(center).toArray()); g.setAttribute('position', new THREE.Float32BufferAttribute(values, 3)); }
    const attr = g.attributes.position, proxy = owner ?? new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color }));
    if (!owner) { proxy.position.copy(center); proxy.updateMatrixWorld(true); Object.assign(proxy.userData, { buildingId: building.id, component: name, renderProxy: true, convex: true }); breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attr.array), toughness: material === 'glass' ? 2 : 8, material, label: '2동 외관' }); }
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
  for (let i = 0; i < (ti?.count ?? tp.count); i += 3) { const t = [0, 1, 2].map(j => { const k = ti ? ti.getX(i + j) : i + j; return new THREE.Vector3(tp.getX(k), tp.getY(k), tp.getZ(k)); }); if (Math.max(...t.map(v => v.x)) > 355 && Math.min(...t.map(v => v.x)) < 445 && Math.max(...t.map(v => v.z)) > -710 && Math.min(...t.map(v => v.z)) < -630) terrainTriangles.push(t); }
  function ground(p: XZ) { const [x, z] = p; for (const [a, b, c] of terrainTriangles) { const det = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x), u = ((x - a.x) * (c.z - a.z) - (z - a.z) * (c.x - a.x)) / det, v = ((b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x)) / det; if (u >= -1e-7 && v >= -1e-7 && u + v <= 1.0000001) return a.y + u * (b.y - a.y) + v * (c.y - a.y); } throw Error('Missing humanities 2 terrain'); }

  const floor = getHumanities250Layout(heightAt).base, storey = 3.5, roof = floor + 14;
  const link = getHumanities23Layout(heightAt);
  const openings = [...(include250 ? getHumanities250Openings(building.id,building.points,heightAt) : []), ...(include23 ? getHumanities23Openings(building.id,building.points,heightAt) : [])];
  // 공식 약도의 자하연 방향은 서쪽 끝에 대응한다. 문 위치와 계단 치수는 근사다.
  const west = frames[12], entryCenter = west.length / 2, entryHalfWidth = 1.5;
  const entryA = entryCenter - entryHalfWidth, entryB = entryCenter + entryHalfWidth;
  openings.push({buildingId: building.id, edgeIndex: 12, a: west.point(entryA), b: west.point(entryB), bottom: floor - .12, top: floor + 3.05});
  // 1동 공식 사진에 함께 보이는 2동 남쪽의 두 개방형 발코니다.
  const recess = {edge: 4, start: 1.1, end: 5.8, depth: 1.5, levels: [1, 2]};
  for (const level of recess.levels) openings.push({buildingId: building.id, edgeIndex: recess.edge, a: frames[4].point(recess.start), b: frames[4].point(recess.end), bottom: floor + level * storey, top: floor + (level + 1) * storey - .38});
  Object.assign(shell.userData,{connectionOpening:openings[0],connectionOpenings:openings});
  const endEdges = include23 ? [5,6] : [];
  const observedEdges = [4,5,6];
  const foundation = Math.min(floor,...ring.map(p=>heightAt(...p)))-.6;
  function window(f:Frame,owner:Proxy,s0:number,s1:number,lo:number,hi:number,grille:boolean){
    if(s1-s0<.3||hi-lo<.25)return;
    part('green-window',[at(f,s0,lo,-.354),at(f,s1,lo,-.354),at(f,s1,hi,-.354),at(f,s0,hi,-.354)],0x6c9891,'glass',owner,true);
    for(const s of[s0,(s0+s1)/2,s1])box('window-frame',f,s-.03,s+.03,-.44,-.36,lo,hi,0xaeb6aa,'metal',owner);
    for(const y of[lo,hi])box('window-frame',f,s0-.04,s1+.04,-.44,-.36,y-.04,y+.04,0xaeb6aa,'metal',owner);
    if(grille){for(let s=s0+.15;s<s1;s+=.17)box('ground-window-grille',f,s,s+.026,-.56,-.48,lo,hi,0x979b89,'metal',owner);for(const y of[lo+.2,hi-.2])box('grille-crossbar',f,s0,s1,-.56,-.48,y-.025,y+.025,0x979b89,'metal',owner);}
  }
  for(const [edge,f]of frames.entries()){
    const existingEnd=endEdges.includes(edge),observed=observedEdges.includes(edge);
    const edgeOpenings=openings.filter(o=>o.edgeIndex===edge).map(o=>({s0:Math.min(f.local(o.a).s,f.local(o.b).s),s1:Math.max(f.local(o.a).s,f.local(o.b).s),bottom:o.bottom,top:o.top}));
    const divisions=Math.max(1,Math.ceil(f.length/7.5));
    const cuts=[...Array.from({length:divisions+1},(_,i)=>i*f.length/divisions),...edgeOpenings.flatMap(o=>[o.s0,o.s1])].sort((a,b)=>a-b);
    for(let level=0;level<4;level++)for(let j=1;j<cuts.length;j++){
      const a=cuts[j-1],b=cuts[j],center=(a+b)/2;if(b-a<.02)continue;
      const y=floor+level*storey,bottom=level===0?Math.min(foundation,ground(f.point(center))-.6):y;
      let spans:number[][]=[[bottom,y+storey]];
      for(const o of edgeOpenings.filter(o=>center>o.s0-1e-6&&center<o.s1+1e-6))spans=spans.flatMap(([lo,hi])=>[[lo,Math.min(hi,o.bottom)],[Math.max(lo,o.top),hi]]).filter(([lo,hi])=>hi-lo>.02);
      for(const[lo,hi]of spans){
        const wall=box('brick-facade-bay',f,a,b,-.325,.325,lo,hi,observed?0x655b56:0x77716a);
        Object.assign(wall.userData,{facadeEdge:edge,storey:level,range:[a,b],bottom:lo,top:hi});
        if(observed)for(let h=lo;h<hi-.012;h+=.22){
          facet('brick-horizontal-joint',f,a+.006,b-.006,h,Math.min(h+.009,hi),-.334,0xaaa498,wall);
          for(let s=a+.3+(Math.round((h-floor)/.22)%2)*.3;s<b-.03;s+=.6)facet('brick-vertical-joint',f,s,Math.min(s+.009,b-.006),h,Math.min(h+.22,hi),-.337,0xaaa498,wall);
        }
        if(!existingEnd&&!(include250&&[0,1,2,3].includes(edge))&&b-a>1.5){
          const cells=level===3&&b-a>4?2:1,width=(b-a)/cells;
          for(let k=0;k<cells;k++){const low=Math.max(lo,y+(level===3?1.05:.58)),high=Math.min(hi,y+(level===3?2.35:2.92));window(f,wall,a+k*width+width*.16,a+(k+1)*width-width*.16,low,high,edge===4&&level===0);}
        }
        if(edge===5&&include23)for(const rise of[3.5,7]){
          const left=Math.max(a,6.4),right=Math.min(b,8.6),low=Math.max(lo,link.entryFloor+rise+.05),high=Math.min(hi,link.entryFloor+rise+2.65);
          if(right-left>.02&&high-low>.02)facet('balcony-door-backing',f,left,right,low,high,-.36,0x304d48,wall);
        }
        if(edge===4&&level===0){const h=Math.min(hi,floor+.55);if(h>lo+.1){box('stone-plinth',f,a,b,-.46,-.34,lo,h,0xa6a295,'stone',wall);for(let yy=lo+.22;yy<h;yy+=.24){facet('plinth-course',f,a,b,yy,Math.min(yy+.013,h),-.467,0x6d756f,wall);for(let s=a+.3;s<b-.03;s+=.6)facet('plinth-joint',f,s,Math.min(s+.012,b-.006),yy,Math.min(yy+.24,h),-.469,0x6d756f,wall);}}}
        const bandLo=Math.max(lo,y+storey-.38),bandHi=Math.min(hi,y+storey);
        if(!existingEnd&&bandHi-bandLo>.02)box('white-floor-band',f,a,b,-.54,.38,bandLo,bandHi,0xdfdfd5,'stone',wall);
      }
    }
    // 동쪽 끝벽의 문, 발코니와 흰 골조는 기존 연결부 모델을 유지한다.
    if(!existingEnd&&edge!==1){
      for(let j=0;j<=divisions;j++){
        const s=j*f.length/divisions;if(edgeOpenings.some(o=>s>o.s0-.2&&s<o.s1+.2))continue;
        box('white-concrete-pilaster',f,Math.max(0,s-.16),Math.min(f.length,s+.16),-.62,-.33,Math.min(floor-.35,ground(f.point(s))-.35),roof,0xdfdfd5);
      }
    }
    if(!(include250&&[0,1,2,3].includes(edge)))for(let s=0;s<f.length;s+=5.5){
      const end=Math.min(f.length,s+5.5),eave=box('deep-roof-eave',f,s,end,-1.3,.4,roof-.12,roof+.15,0xdadcd2);
      box('roof-parapet-base',f,s,end,-.27,.28,roof+.15,roof+.32,0xe0e1d5,'stone',eave);
      box('roof-parapet-cap',f,s,end,-.3,.31,roof+.78,roof+.92,0xe0e1d5,'stone',eave);
      for(let v=s;v<end-.1;v+=2.3)box('roof-parapet-post',f,v,v+.12,-.24,.25,roof+.32,roof+.78,0xe0e1d5,'stone',eave);
      if(edge===4){const ss=(s+end)/2;beam('eave-brace',at(f,ss,roof-.65,-.37),at(f,ss,roof-.14,-1.15),.06,0xa6ada1,eave);}
    }
  }
  const footprints=THREE.ShapeUtils.triangulateShape(ring.map(p=>new THREE.Vector2(...p)),[]).map(tri=>tri.map(i=>ring[i]));
  for(const tri of footprints){const top=tri.map(([x,z])=>new THREE.Vector3(x,roof+.38,z));part('footprint-roof',[...top,...top.map(p=>p.clone().add(new THREE.Vector3(0,-.48,0)))],0xadb7a9);}
  // 소식지에 보이는 흰 2동 번호를 벽 부품에 묶는다. 글자 치수는 근사다.
  const f=frames[6],s0=5.85,s1=6.65,y0=roof-1.8,y1=roof-.5;
  const numberOwner=breakables.find(t=>t.mesh.userData.facadeEdge===6&&t.mesh.userData.storey===3&&t.mesh.userData.range[0]<s0&&t.mesh.userData.range[1]>s1)?.mesh as Proxy|undefined;
  if(numberOwner){for(const y of[y0,y1])box('building-number-two',f,s0,s1,-.43,-.35,y,y+.12,0xe8e8df,'stone',numberOwner);box('building-number-two',f,s1-.12,s1,-.43,-.35,y1-.35,y1+.08,0xe8e8df,'stone',numberOwner);beam('building-number-two',at(f,s1-.06,y1-.3,-.4),at(f,s0+.06,y0+.15,-.4),.06,0xe8e8df,numberOwner);}
  const south=frames[4];
  for(const s of[.5,south.length-.5]){
    const owner=breakables.find(t=>t.mesh.userData.facadeEdge===4&&t.mesh.userData.storey===0&&t.mesh.userData.range[0]<=s&&t.mesh.userData.range[1]>=s)?.mesh as Proxy|undefined;
    if(owner)for(let y=floor+.25;y<roof-.3;y+=3)beam('rainwater-downpipe',at(south,s,y,-.67),at(south,s,Math.min(roof-.3,y+3),-.67),.048,0xb2b7ac,owner);
  }
  for(const level of recess.levels){
    const y=floor+level*storey, f=frames[4], a=recess.start, b=recess.end;
    const slab=box('recess-balcony-floor',f,a,b,-.62,recess.depth,y-.18,y,0xc3c4b8);
    box('recess-balcony-back',f,a,b,recess.depth,recess.depth+.16,y,y+storey-.38,0x77716a);
    for(const s of[a,b])box('recess-balcony-return',f,s-.1,s+.1,-.34,recess.depth,y,y+storey-.38,0xdbddd2);
    // 흰 난간의 두 가로 틈을 실제 빈 공간으로 남긴다.
    for(const [lo,hi]of[[0,.38],[.82,1.02]])box('recess-parapet-band',f,a,b,-.6,-.36,y+lo,y+hi,0xdbddd2,'stone',slab);
    for(const s of[a,(a+b)/2,b])box('recess-parapet-post',f,s-.1,s+.1,-.6,-.36,y+.38,y+.82,0xdbddd2,'stone',slab);
  }

  const entrySteps:{n0:number;n1:number;y:number}[]=[];
  const approachStart=-6.8, stairStart=-5.6, stairEnd=-1.3;
  const footY=Math.max(ground(west.point(entryA,stairStart)),ground(west.point(entryB,stairStart)))+.055;
  const stepCount=Math.max(1,Math.ceil((floor-footY)/.24));
  const approachTop=[at(west,entryA,ground(west.point(entryA,approachStart))+.055,approachStart),at(west,entryB,ground(west.point(entryB,approachStart))+.055,approachStart),at(west,entryB,footY,stairStart),at(west,entryA,footY,stairStart)];
  // 입구 바닥의 두 삼각형을 각각 충돌체로 만들어 표시 높이와 맞춘다.
  for(const indices of[[0,1,2],[0,2,3]]){const top=indices.map(i=>approachTop[i]);part('west-entry-approach',[...top,...top.map(p=>p.clone().add(new THREE.Vector3(0,-.18,0)))],0xb9b9ad);}
  for(let i=0;i<stepCount;i++){
    const n0=stairStart+(stairEnd-stairStart)*i/stepCount,n1=stairStart+(stairEnd-stairStart)*(i+1)/stepCount,y=footY+(floor-footY)*(i+1)/stepCount;
    const step=box('west-entry-step',west,entryA,entryB,n0,n1,Math.min(footY,ground(west.point(entryCenter,n0)))-.2,y,0xb9baaf);
    box('west-step-edge',west,entryA,entryB,n0,n0+.03,y,y+.002,0xd6d4c7,'stone',step);entrySteps.push({n0,n1,y});
  }
  const landing=box('west-entry-floor',west,entryA,entryB,stairEnd,3.2,floor-.22,floor,0xb9baaf);
  for(let n=stairEnd+.5;n<3.2;n+=.55)box('west-entry-floor-joint',west,entryA,entryB,n,n+.008,floor,floor+.002,0x92968a,'stone',landing);
  for(const s of[entryA,entryB]){
    box('west-entry-return',west,s-.11,s+.11,-.34,3.2,floor,floor+3.05,0x91968d);
    const jamb=box('west-entry-jamb',west,s-.055,s+.055,-.44,-.28,floor,floor+2.8,0xb5bdb1,'metal');
    box('west-open-door-leaf',west,s-.035,s+.035,-.2,1.08,floor+.08,floor+2.68,0x6c9891,'glass',jamb);
  }
  box('west-entry-header',west,entryA-.08,entryB+.08,-.44,-.28,floor+2.8,floor+3.05,0xb5bdb1,'metal');
  box('west-entry-back',west,entryA,entryB,3.2,3.35,floor,floor+3.05,0x777f77);
  box('west-entry-ceiling',west,entryA,entryB,-.34,3.35,floor+3.05,floor+3.18,0xc6c9be);
  for(const s of[entryA-.18,entryB+.18]){
    const rail=beam('west-entry-handrail',at(west,s,footY+.95,stairStart),at(west,s,floor+.95,stairEnd),.04,0xaab3a6);
    for(const t of[0,.5,1]){const n=stairStart+(stairEnd-stairStart)*t,y=footY+(floor-footY)*t;beam('west-entry-rail-post',at(west,s,ground(west.point(s,n)),n),at(west,s,y+.95,n),.035,0xaab3a6,rail);}
  }
  const westEntry={direction:'west',edge:12,center:west.point(entryCenter),floor,width:entryHalfWidth*2,route:[west.point(entryCenter,approachStart),west.point(entryCenter,stairStart),west.point(entryCenter,stairEnd),west.point(entryCenter,2.4)],steps:entrySteps,existenceConfirmed:true,directionFromDiagram:true,positionEstimated:true,appearancePhotoConfirmed:false,dimensionsEstimated:true,wholeInteriorImplemented:false};
  shell.userData.humanities2Exterior={buildingId:building.id,floor,roof,levels:4,levelsEstimated:true,dimensionsEstimated:true,photoFaceMappingEstimated:true,openings,observedEdges,unobservedFaces:[0,2,3,7,8,9,10,11,12],wholeInteriorImplemented:false,jahayeonEntranceImplemented:true,westEntry,recessBalconies:recess,existing250And23Preserved:true,entryFloor:link.entryFloor,sources:['https://map.snu.ac.kr/api/upload/default/F_BUILD_0000002.jpg','https://map.snu.ac.kr/api/upload/default/F_BUILD_0000001.jpg','https://humanities.snu.ac.kr/community/newsletter?md=download&seqidx=63','https://humanities.snu.ac.kr/community/notice?bbsidx=3628&fileidx=5839&md=down'],photoCaptureDate:null};
  const meshes = batches.map(b => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(b.positions, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(b.colors, 3)); g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere(); const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: b.glass ? .22 : .68, side: THREE.DoubleSide })); mesh.name = b.glass ? 'humanities2-exterior-glass' : 'humanities2-exterior-surfaces'; mesh.castShadow = !b.glass; mesh.receiveShadow = true; shell.add(mesh); return mesh; });
  shell.userData.humanities2Exterior.geometry = {meshes:2,textures:0,triangles:batches.reduce((n,b)=>n+b.positions.length/9,0),colliders:breakables.length};
  function update(_player: THREE.Vector3) { batches.forEach((b, index) => { const a = meshes[index].geometry.attributes.position as THREE.BufferAttribute, c = meshes[index].geometry.attributes.color as THREE.BufferAttribute; let moved = false, tinted = false;
    for (const p of b.parts) { if (p.shown !== p.proxy.visible) { p.shown = p.proxy.visible; moved = true; if (p.shown) (a.array as Float32Array).set(p.original, p.start); else for (let i = p.start; i < p.end; i += 3) { a.array[i] = p.proxy.position.x; a.array[i + 1] = p.proxy.position.y; a.array[i + 2] = p.proxy.position.z; } } if (p.color !== p.proxy.material.color.getHex()) { p.color = p.proxy.material.color.getHex(); tinted = true; const t = p.proxy.material.color, scale = [t.r / p.base.r, t.g / p.base.g, t.b / p.base.b]; for (let i = p.start; i < p.end; i++) c.array[i] = p.colors[i - p.start] * scale[(i - p.start) % 3]; } }
    if (moved) a.needsUpdate = true; if (tinted) c.needsUpdate = true;
  }); shell.visible = batches.some(b => b.parts.some(p => p.proxy.visible)); }
  return { shell, breakables, update };
}
