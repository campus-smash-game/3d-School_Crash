import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import type { CampusBuilding } from './fullCampus';
import { humanities23Frame } from './humanities23Site';
import { getEducation10LinkOpening, getEducation10GroundOpening } from './education101Site';
type XZ = [number, number];
type Frame = ReturnType<typeof humanities23Frame>;
type Proxy = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
export const EDUCATION10_ID = 'way/180954536';

/** 중정 쪽 공식 사진과 동쪽 및 북쪽 거리뷰를 대조한 외관. 치수와 사진의 방위 대응은 근사다. */
export function createEducation10Exterior(scene:THREE.Scene,building:CampusBuilding,heightAt:(x:number,z:number)=>number){
  const number='10';
  const shell=new THREE.Group();shell.name='landmark/education'+number+'-exterior';
  Object.assign(shell.userData,{role:'building-shell',buildingId:building.id,landmark:'education'+number+'-exterior',mappedOutline:building.points});scene.add(shell);
  const distant=new THREE.Group();distant.name=building.id+':education10-exterior-distant';distant.visible=false;
  Object.assign(distant.userData,{role:'distant-building',buildingId:building.id});scene.add(distant);
  const ring=building.points.slice(0,-1),signedArea=ring.reduce((sum,a,i)=>{const b=ring[(i+1)%ring.length];return sum+a[0]*b[1]-b[0]*a[1]},0);
  // 원본 윤곽을 유지하고 바깥 면의 부호만 통일한다.
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
  const terrain = scene.getObjectByName('campus-terrain') as THREE.Mesh<THREE.BufferGeometry>;
  const tp=terrain.geometry.attributes.position,ti=terrain.geometry.index,triangles:THREE.Vector3[][]=[];
  for(let i=0;i<(ti?.count??tp.count);i+=3){const t=[0,1,2].map(j=>{const k=ti?ti.getX(i+j):i+j;return new THREE.Vector3(tp.getX(k),tp.getY(k),tp.getZ(k));});if(Math.max(...t.map(p=>p.x))>580&&Math.min(...t.map(p=>p.x))<650&&Math.max(...t.map(p=>p.z))>-712&&Math.min(...t.map(p=>p.z))<-645)triangles.push(t);}
  function ground([x,z]:XZ){for(const[a,b,c]of triangles){const det=(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x),u=((x-a.x)*(c.z-a.z)-(z-a.z)*(c.x-a.x))/det,v=((b.x-a.x)*(z-a.z)-(b.z-a.z)*(x-a.x))/det;if(u>=-1e-7&&v>=-1e-7&&u+v<=1.0000001)return a.y+u*(b.y-a.y)+v*(c.y-a.y);}throw Error('Missing education 10 terrain');}

  const front=frames[3], center=front.length*.46, entryA=center-2.35,entryB=center+2.35;
  const floor=Math.max(...[entryA,center,entryB].map(s=>ground(front.point(s,-4))))+.54,storey=3.5,roof=floor+14;
  const balcony={edge:3,start:entryA,end:entryB,depth:1.65,levels:[1,2]};
  const existingOpenings=[getEducation10LinkOpening(heightAt,building.points),getEducation10GroundOpening(heightAt,building.points)];
  const openings=[...existingOpenings,{buildingId:building.id,edgeIndex:3,a:front.point(entryA),b:front.point(entryB),bottom:floor-.22,top:floor+3.08},...balcony.levels.map(level=>({buildingId:building.id,edgeIndex:3,a:front.point(entryA),b:front.point(entryB),bottom:floor+level*storey,top:floor+(level+1)*storey-.36}))];
  Object.assign(shell.userData,{connectionOpening:existingOpenings[0],connectionOpenings:existingOpenings});
  const observedEdges=[2,3,4,5,6],foundation=Math.min(floor,...ring.map(p=>heightAt(...p)))-.6;
  function window(f:Frame,owner:Proxy,s0:number,s1:number,lo:number,hi:number){
    if(s1-s0<.3||hi-lo<.25)return;
    facet('window-glass',f,s0,s1,lo,hi,-.354,0x678b83,owner);
    const divisions=hi-lo>1.9?3:2;
    for(let i=0;i<=divisions;i++){const s=s0+(s1-s0)*i/divisions;box('window-frame',f,s-.035,s+.035,-.44,-.36,lo,hi,0xc2c9bd,'metal',owner);}
    for(const y of[lo,hi])box('window-frame',f,s0-.04,s1+.04,-.44,-.36,y-.04,y+.04,0xc2c9bd,'metal',owner);
  }
  for(const [edge,f]of frames.entries()){
    const observed=observedEdges.includes(edge),south=[2,3].includes(edge),existingEnd=edge===5;
    const localOpenings=openings.filter(o=>o.edgeIndex===edge).map(o=>({s0:Math.min(f.local(o.a).s,f.local(o.b).s),s1:Math.max(f.local(o.a).s,f.local(o.b).s),bottom:o.bottom,top:o.top}));
    const divisions=Math.max(1,Math.ceil(f.length/6.8)),cuts=[...Array.from({length:divisions+1},(_,i)=>i*f.length/divisions),...localOpenings.flatMap(o=>[o.s0,o.s1])].sort((a,b)=>a-b);
    for(let level=0;level<4;level++)for(let j=1;j<cuts.length;j++){
      const a=cuts[j-1],b=cuts[j],mid=(a+b)/2;if(b-a<.02)continue;
      const y=floor+level*storey,bottom=level===0?Math.min(foundation,ground(f.point(mid))-.6):y;
      let spans:number[][]=[[bottom,y+storey]];
      for(const o of localOpenings.filter(o=>mid>o.s0-1e-6&&mid<o.s1+1e-6))spans=spans.flatMap(([lo,hi])=>[[lo,Math.min(hi,o.bottom)],[Math.max(lo,o.top),hi]]).filter(([lo,hi])=>hi-lo>.02);
      for(const[lo,hi]of spans){
        const wall=box('brick-facade-bay',f,a,b,-.325,.325,lo,hi,observed?0x665d59:0x827a70);
        Object.assign(wall.userData,{facadeEdge:edge,storey:level,range:[a,b],bottom:lo,top:hi});
        if(observed)for(let h=lo;h<hi-.012;h+=.22){facet('brick-horizontal-joint',f,a+.006,b-.006,h,Math.min(h+.009,hi),-.334,0xa6a092,wall);for(let s=a+.3+(Math.round((h-floor)/.22)%2)*.3;s<b-.03;s+=.6)facet('brick-vertical-joint',f,s,Math.min(s+.009,b-.006),h,Math.min(h+.22,hi),-.337,0xa6a092,wall);}
        if(!existingEnd&&b-a>1.5){const small=level===3||(!south&&level>=2),cells=small&&b-a>4?2:1,w=(b-a)/cells;for(let k=0;k<cells;k++)window(f,wall,a+k*w+w*.13,a+(k+1)*w-w*.13,Math.max(lo,y+(small?.9:.55)),Math.min(hi,y+(small?2.55:2.9)));}
        if(south&&level===0){const top=Math.min(hi,floor+.55);if(top>lo+.02){box('square-stone-plinth',f,a,b,-.46,-.34,lo,top,0xaaa897,'stone',wall);for(let yy=lo;yy<top;yy+=.34){facet('plinth-joint',f,a,b,yy,Math.min(yy+.014,top),-.47,0x6a746a,wall);for(let s=a;s<b;s+=.48)facet('plinth-joint',f,s,Math.min(b,s+.012),yy,Math.min(top,yy+.34),-.471,0x6a746a,wall);}}}
        const bandLo=Math.max(lo,y+storey-.36),bandHi=Math.min(hi,y+storey);if(!existingEnd&&bandHi-bandLo>.02)box('white-floor-band',f,a,b,-.58,.36,bandLo,bandHi,0xdfdfd3,'stone',wall);
      }
    }
    if(!existingEnd)for(let j=0;j<=divisions;j++){
      const s=j*f.length/divisions;if(localOpenings.some(o=>s>o.s0-.3&&s<o.s1+.3))continue;
      const pillar=box('white-concrete-pilaster',f,Math.max(0,s-.17),Math.min(f.length,s+.17),-.66,-.33,Math.min(floor-.35,ground(f.point(s))-.35),roof,0xe0e0d5);
      if(south)box('projecting-window-fin',f,Math.max(0,s-.12),Math.min(f.length,s+.12),-1.52,-.34,floor+storey+.4,floor+2*storey-.1,0xdfdfd3,'stone',pillar);
    }
    for(let s=0;s<f.length;s+=5.5){const end=Math.min(f.length,s+5.5),eave=box('deep-roof-eave',f,s,end,-1.4,.42,roof-.12,roof+.16,0xdadcd1);box('roof-parapet-base',f,s,end,-.27,.28,roof+.16,roof+.35,0xe0e1d5,'stone',eave);beam('roof-rail',at(f,s,roof+1.03,-.05),at(f,end,roof+1.03,-.05),.035,0xa7b4a5,eave);for(let v=s;v<end-.1;v+=2.3)beam('roof-rail-post',at(f,v,roof+.35,-.05),at(f,v,roof+1.03,-.05),.035,0xa7b4a5,eave);}
  }
  for(const tri of THREE.ShapeUtils.triangulateShape(ring.map(p=>new THREE.Vector2(...p)),[]).map(t=>t.map(i=>ring[i]))){const top=tri.map(([x,z])=>new THREE.Vector3(x,roof+.38,z));part('footprint-roof',[...top,...top.map(p=>p.clone().add(new THREE.Vector3(0,-.48,0)))],0xadb7a9);}
  for(const level of balcony.levels){const y=floor+level*storey,a=entryA,b=entryB,f=front;
    const slab=box('recess-balcony-floor',f,a,b,-.62,balcony.depth,y-.2,y,0xc3c4b8);
    box('recess-balcony-back',f,a,b,balcony.depth,balcony.depth+.16,y,y+storey-.36,0x655e57);
    for(const s of[a,b])box('recess-balcony-return',f,s-.12,s+.12,-.34,balcony.depth,y,y+storey-.36,0xdbddd2);
    for(const[lo,hi]of[[0,.38],[.86,1.06]])box('balcony-parapet',f,a,b,-.62,-.36,y+lo,y+hi,0xdfdfd3,'stone',slab);
    for(let s=a;s<=b;s+=(b-a)/6)box('balcony-parapet-post',f,s-.08,s+.08,-.62,-.36,y+.38,y+.86,0xdfdfd3,'stone',slab);
    const door=box('balcony-door',f,a+.32,b-.32,balcony.depth-.07,balcony.depth,y+.06,y+2.7,0x54736c,'glass');
    for(const s of[a+.32,center,b-.32])box('balcony-door-frame',f,s-.03,s+.03,balcony.depth-.13,balcony.depth-.07,y+.06,y+2.7,0xb6bfb3,'metal',door);
  }
  const approachStart=-5.6,stairStart=-3.6,stairEnd=-1.25,entrySteps:{n0:number;n1:number;y:number}[]=[];
  const footY=Math.max(...[entryA,center,entryB].map(s=>ground(front.point(s,stairStart))))+.055;
  const stepCount=Math.max(1,Math.ceil((floor-footY)/.20));
  const top=[at(front,entryA,ground(front.point(entryA,approachStart))+.055,approachStart),at(front,entryB,ground(front.point(entryB,approachStart))+.055,approachStart),at(front,entryB,footY,stairStart),at(front,entryA,footY,stairStart)];
  for(const indices of[[0,1,2],[0,2,3]]){const tri=indices.map(i=>top[i]);part('entry-approach',[...tri,...tri.map(v=>v.clone().add(new THREE.Vector3(0,-.16,0)))],0xb6afa2);}
  for(let i=0;i<stepCount;i++){const n0=stairStart+(stairEnd-stairStart)*i/stepCount,n1=stairStart+(stairEnd-stairStart)*(i+1)/stepCount,y=footY+(floor-footY)*(i+1)/stepCount;const step=box('entry-step',front,entryA,entryB,n0,n1,Math.min(footY,ground(front.point(center,n0)))-.2,y,0xbcbcaf);box('step-edge',front,entryA,entryB,n0,n0+.03,y,y+.002,0xd7d4c6,'stone',step);entrySteps.push({n0,n1,y});}
  const landing=box('entry-floor',front,entryA,entryB,stairEnd,3.15,floor-.22,floor,0xbab9ae);
  for(let n=stairEnd+.45;n<3.15;n+=.5)box('entry-floor-joint',front,entryA,entryB,n,n+.009,floor,floor+.002,0x94958b,'stone',landing);
  for(const s of[entryA,entryB])box('entry-return',front,s-.11,s+.11,-.34,3.15,floor,floor+3.08,0x90938a);
  box('entry-back',front,entryA,entryB,3.15,3.3,floor,floor+3.08,0x757d73);
  box('entry-ceiling',front,entryA,entryB,-.34,3.3,floor+3.08,floor+3.2,0xc8cbc0);
  const canopy=box('entry-canopy',front,entryA-.4,entryB+.4,-2.15,.1,floor+2.95,floor+3.3,0xe0dfd2);
  box('canopy-front',front,entryA-.4,entryB+.4,-2.15,-1.98,floor+2.95,floor+3.65,0xe0dfd2,'stone',canopy);
  const doorHalf=1.2;
  for(const side of[-1,1]){const a=side<0?entryA:center+doorHalf,b=side<0?center-doorHalf:entryB;const glass=box('entry-sidelight',front,a,b,-.37,-.31,floor+.08,floor+2.8,0x567b72,'glass');for(const s of[a,b])box('entry-frame',front,s-.035,s+.035,-.44,-.31,floor,floor+2.82,0xb6c0b2,'metal',glass);}
  box('entry-header',front,entryA,entryB,-.44,-.28,floor+2.8,floor+2.95,0xb6c0b2,'metal');
  // 통행 폭을 확보한 열린 유리문으로 표현한다. 실내는 짧은 현관까지만 만든다.
  for(const s of[center-doorHalf,center+doorHalf]){const jamb=box('entry-jamb',front,s-.04,s+.04,-.44,-.28,floor,floor+2.8,0xb6c0b2,'metal');box('open-glass-door',front,s-.03,s+.03,-.25,.95,floor+.08,floor+2.7,0x567b72,'glass',jamb);}
  const boardS=center-8.5,boardN=-1.8,boardY=ground(front.point(boardS,boardN));
  const board=box('noticeboard-panel',front,boardS-2.4,boardS+2.4,boardN-.13,boardN+.13,boardY+1.05,boardY+2.65,0xc2c2b2,'metal');
  for(const s of[boardS-2.3,boardS+2.3])box('noticeboard-leg',front,s-.055,s+.055,boardN-.06,boardN+.06,boardY,boardY+2.85,0x9eaaa2,'metal',board);
  box('noticeboard-cap',front,boardS-2.55,boardS+2.55,boardN-.3,boardN+.3,boardY+2.8,boardY+2.9,0xb9c2b7,'metal',board);
  for(let i=0;i<9;i++){const x=boardS-2.08+(i%5)*.82,y=boardY+1.17+Math.floor(i/5)*.66;box('blank-notice-sheet',front,x,x+.67,boardN-.145,boardN-.133,y,y+.54,i%3===0?0xe3ddc6:0xe3e3d9,'stone',board);}
  const canvas=document.createElement('canvas');canvas.width=384;canvas.height=64;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#d9dbce';ctx.fillRect(0,0,384,64);ctx.fillStyle='#20466c';ctx.font='bold 34px sans-serif';ctx.textAlign='center';ctx.fillText('게시판',192,45);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const signGeometry=new THREE.PlaneGeometry(1.15,.22);signGeometry.scale(-1,1,1);const sign=new THREE.Mesh(signGeometry,new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));sign.name='education10-noticeboard-title';sign.position.copy(at(front,boardS,boardY+2.7,boardN-.16));const outward=at(front,boardS,boardY+2.7,boardN-1);sign.lookAt(outward);shell.add(sign);
  const entry={edge:3,floor,center:front.point(center),width:doorHalf*2,route:[front.point(center,approachStart-.7),front.point(center,approachStart),front.point(center,stairStart),front.point(center,stairEnd),front.point(center,2.4)],steps:entrySteps,positionEstimated:true,photoFaceMappingEstimated:true,dimensionsEstimated:true,wholeInteriorImplemented:false};
  shell.userData.education10Exterior={buildingId:building.id,floor,roof,levels:4,levelsEstimated:true,dimensionsEstimated:true,photoFaceMappingEstimated:true,observedEdges,unobservedEdges:[0,1],openings,entry,balcony,existingConnectionsPreserved:true,wholeInteriorImplemented:false,photoCaptureDate:null,sources:['https://map.snu.ac.kr/api/upload/default/F_BUILD_0000010.jpg','https://kko.to/cnm-2mtd_j']};
  const meshes = batches.map(b => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(b.positions, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(b.colors, 3)); g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere(); const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: b.glass ? .22 : .68, side: THREE.DoubleSide })); mesh.name = b.glass ? 'education10-exterior-glass' : 'education10-exterior-surfaces'; mesh.castShadow = !b.glass; mesh.receiveShadow = true; shell.add(mesh); return mesh; });
  shell.userData.education10Exterior.geometry = {meshes:3,textures:1,triangles:2+batches.reduce((n,b)=>n+b.positions.length/9,0),colliders:breakables.length};
  function update(_player: THREE.Vector3) { batches.forEach((b, index) => { const a = meshes[index].geometry.attributes.position as THREE.BufferAttribute, c = meshes[index].geometry.attributes.color as THREE.BufferAttribute; let moved = false, tinted = false;
    for (const p of b.parts) { if (p.shown !== p.proxy.visible) { p.shown = p.proxy.visible; moved = true; if (p.shown) (a.array as Float32Array).set(p.original, p.start); else for (let i = p.start; i < p.end; i += 3) { a.array[i] = p.proxy.position.x; a.array[i + 1] = p.proxy.position.y; a.array[i + 2] = p.proxy.position.z; } } if (p.color !== p.proxy.material.color.getHex()) { p.color = p.proxy.material.color.getHex(); tinted = true; const t = p.proxy.material.color, scale = [t.r / p.base.r, t.g / p.base.g, t.b / p.base.b]; for (let i = p.start; i < p.end; i++) c.array[i] = p.colors[i - p.start] * scale[(i - p.start) % 3]; } }
    if (moved) a.needsUpdate = true; if (tinted) c.needsUpdate = true;
  }); sign.visible=board.visible; shell.visible = batches.some(b => b.parts.some(p => p.proxy.visible)); }
  // 렌더 버퍼와 복원용 사본을 만든 뒤 조립용 배열을 비운다.
 for(const batch of batches){batch.positions.length=0;batch.colors.length=0;}
 return { shell, breakables, update };
}
