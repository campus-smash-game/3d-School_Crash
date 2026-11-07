import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import type { CampusBuilding } from './fullCampus';
import { humanities23Frame } from './humanities23Site';
import { physics561SurfaceHeight } from './physics561Site';
import { SCIENCE26_ID, type Science26Layout } from './science26Site';
type XZ=[number,number];type Frame=ReturnType<typeof humanities23Frame>;type Proxy=THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
export function createScience26Exterior(scene:THREE.Scene,building:CampusBuilding,q:Science26Layout,heightAt:(x:number,z:number)=>number){
 const shell=new THREE.Group();shell.name='landmark/science26-exterior';Object.assign(shell.userData,{role:'building-shell',buildingId:SCIENCE26_ID,buildingIds:[SCIENCE26_ID]});scene.add(shell);

 const signs:{mesh:THREE.Mesh;owner:Proxy}[]=[];
  const breakables: BreakableSpec[] = [];
  const batches = [false, true].map(glass => ({ glass, positions: [] as number[], colors: [] as number[], parts: [] as { proxy: Proxy; start: number; end: number; original: Float32Array; colors: Float32Array; base: THREE.Color; color: number; shown: boolean }[] }));
  const at = (f: Frame, s: number, y: number, n = 0) => { const p = f.point(s, n); return new THREE.Vector3(p[0], y, p[1]); };
  function part(name: string, vertices: THREE.Vector3[], color: number, material: BreakableSpec['material'] = 'stone', owner?: Proxy, flat = false) {
    const bounds = new THREE.Box3().setFromPoints(vertices), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const g = flat ? new THREE.BufferGeometry() : new ConvexGeometry(vertices.map(p => p.clone().sub(center)));
    if (flat) { const values: number[] = []; for (let i = 1; i + 1 < vertices.length; i++) for (const p of [vertices[0], vertices[i], vertices[i + 1]]) values.push(...p.clone().sub(center).toArray()); g.setAttribute('position', new THREE.Float32BufferAttribute(values, 3)); }
    const attr = g.attributes.position, proxy = owner ?? new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color }));
    if (!owner) { proxy.position.copy(center); proxy.updateMatrixWorld(true); Object.assign(proxy.userData, { buildingId: building.id, component: name, renderProxy: true, convex: true }); breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attr.array), toughness: material === 'glass' ? 2 : 8, material, label: '26동' }); }
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

  function label(name:string,text:string,f:Frame,s:number,n:number,y:number,width:number,height:number,owner:Proxy,background:string,color:string){
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const ctx=canvas.getContext('2d')!;ctx.fillStyle=background;ctx.fillRect(0,0,canvas.width,128);ctx.fillStyle=color;ctx.font='bold 92px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,canvas.width/2,64);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const geometry=new THREE.PlaneGeometry(width,height);geometry.scale(-1,1,1);const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));mesh.name=name;mesh.position.copy(at(f,s,y,n));mesh.lookAt(at(f,s,y,n-1));shell.add(mesh);signs.push({mesh,owner});
  }




 const f = q.f, white = 0xd7d9d5, panel = 0x8e9499, dark = 0x35434b;
 const pavementMasks: {component: string; polygon: XZ[]}[] = [];
 const slabs = [[4,46,20,40],[46,50,25,40],[50,65,18,40]];
 for (const [level,y] of [q.basement,...q.floors,q.roof].entries()) {
   for (const [a,b,c,d] of level === 0 ? slabs.slice(0,1) : slabs) {
     if (level === 1 && a === 50) continue;
     for(let s=a;s<b;s+=6) box('floor-slab-'+level,f,s,Math.min(s+6,b),c,d,y-.24,y,level===6?0xc9cecc:0xa7aeaa);
   }
 }
 function panelWall(name:string,frame:Frame,a:number,b:number,low:number,high:number,color=panel) {
   const owner=box(name,frame,a,b,-.15,.15,low,high,color);
   for(let y=low+.34;y<high;y+=.34)facet('panel-horizontal-joint',frame,a,b,y,y+.012,-.154,0x59666c,owner);
   for(let s=a+2.4;s<b;s+=2.4)facet('panel-vertical-joint',frame,s,s+.012,low,high,-.155,0x59666c,owner);
   return owner;
 }
 function glassWindow(frame:Frame,a:number,b:number,low:number,high:number,ownerName='ribbon-window') {
   const owner=box(ownerName,frame,a,b,-.045,.045,low,high,0x69828b,'glass');
   for(let s=a;s<=b+.01;s+=1.4)box('dark-window-mullion',frame,s-.035,Math.min(s+.035,b+.035),-.12,.10,low,high,dark,'metal',owner);
   for(const y of[low,high])box('dark-window-transom',frame,a,b,-.12,.10,y-.04,y+.04,dark,'metal',owner);
   return owner;
 }
 // 서쪽 띠창과 회색 수평 패널은 재건축 후 공식 사진에 근거한다.
 const westFace=humanities23Frame(f.point(4,20),f.point(46,20));
 const eastFace=humanities23Frame(f.point(65,40),f.point(4,40));
 for(const [face,isWest] of [[westFace,true],[eastFace,false]] as [Frame,boolean][]) {
   for(let level=0;level<5;level++) {
     const low=q.floors[level],high=q.floors[level+1]??q.roof;
     for(let s=0;s<face.length;s+=5.6) {
       const end=Math.min(s+5.6,face.length), local=f.local(face.point((s+end)/2));
       if(!isWest && local.s>49 && level===0)continue;
       panelWall('horizontal-panel-spandrel',face,s,end,low,low+.85);
       glassWindow(face,s,end,low+.85,high-.5);
       const cap=panelWall('horizontal-panel-header',face,s,end,high-.5,high-.05);
       box('ribbon-projecting-sunshade',face,s,end,-.48,.16,high-.53,high-.43,0x9ca3a5,'metal',cap);
       box('dark-ribbon-reveal',face,s,end,-.16,-.155,low+.68,low+.85,dark,'metal',cap);
     }
   }
 }
 // 지하 현관의 방위와 문 중심은 근사이며 짧은 현관까지만 구현한다.
 const door=32.5-4;
 for(const [a,b] of [[0,door-1.4],[door+1.4,westFace.length]]) {
   const count=Math.ceil((b-a)/5.6);
   for(let i=0;i<count;i++)glassWindow(westFace,a+(b-a)*i/count,a+(b-a)*(i+1)/count,q.basement+.08,q.floor-.3,'basement-glazing');
 }
 panelWall('basement-entry-header',westFace,door-1.4,door+1.4,q.basement+2.7,q.floor-.24);
 for(const s of[31.1,33.9])box('entry-metal-jamb',f,s-.05,s+.05,19.82,20.18,q.basement,q.basement+2.7,dark,'metal');
 box('entry-vestibule-back',f,30.9,34.1,22.5,22.7,q.basement,q.basement+2.8,0x97a19e);
 for(const s of[30.9,34.1])box('entry-vestibule-side',f,s-.1,s+.1,20.15,22.7,q.basement,q.basement+2.8,0x97a19e);
 for(const [s0,s1,n0,n1] of [[4,4.3,20,40],[45.7,46,20,25],[46,50,24.7,25],[49.7,50,18,25]])
   box('end-and-recess-wall',f,s0,s1,n0,n1,q.floor,q.roof,white);
 box('north-basement-end',f,4,4.3,20,40,q.basement,q.floor,0x929b98);
 box('east-basement-wall',f,4,46,39.7,40,q.basement,q.floor,0x929b98);
 box('south-basement-end',f,45.7,46,20,40,q.basement,q.floor,0x929b98);
 // 남쪽 흰 돌출 동의 하부는 열린 기둥 공간으로 유지한다.
 for(const s of[50.6,64.4])for(const n of[18.8,39.2])
   beam('piloti-round-column',at(f,s,q.floor,n),at(f,s,q.floors[1],n),.34,white);
 const southFace=humanities23Frame(f.point(65,40),f.point(65,18));
 for(let level=1;level<5;level++) {
   const low=q.floors[level],high=q.floors[level+1]??q.roof;
   const finFace=humanities23Frame(f.point(50,18),f.point(65,18));
   for(let s=0;s<15;s+=3) {
     const pier=box('white-fin-pier',finFace,s,s+.42,-.55,.15,low,high,white);
     box('deep-vertical-fin',finFace,s+.43,s+.53,-.75,.15,low+.15,high-.1,dark,'metal',pier);
     glassWindow(finFace,s+.55,Math.min(s+2.8,15),low+.25,high-.25,'finned-block-glazing');
   }
   panelWall('white-south-end',southFace,0,southFace.length,low,high,white);
   const shaft=box('south-service-window',southFace,2.3,3.8,-.18,-.16,low+.2,high-.25,dark,'glass');
   box('south-service-window-frame',southFace,3.7,3.8,-.24,-.16,low+.2,high-.25,white,'metal',shaft);
   box('recess-balcony-slab',f,46,50,20,25,low-.24,low,white);
   const rail=box('recess-balcony-rail',f,46,50,19.9,20.03,low+.78,low+.85,dark,'metal');
   for(let s=46;s<=50;s+=.5)box('recess-rail-post',f,s-.015,s+.015,19.95,20.02,low,low+.82,dark,'metal',rail);
 }
 // 상부 격자 차양과 낮은 옥상 난간을 병합 기하로 표현한다.
 const canopy=box('white-roof-canopy-frame',f,49.8,65.2,17.65,18.05,q.roof+.2,q.roof+.38,white,'metal');
 for(let s=50;s<=65;s+=.65)box('roof-canopy-grid',f,s,s+.055,17.6,20.1,q.roof+.22,q.roof+.3,white,'metal',canopy);
 for(let n=17.6;n<20.15;n+=.5)box('roof-canopy-grid',f,49.8,65.2,n,n+.055,q.roof+.22,q.roof+.3,white,'metal',canopy);
 for(const [a,b,c,d]of [[4,65,39.8,40],[4,46,20,20.2]]) {
   const parapet=box('roof-parapet',f,a,b,c,d,q.roof,q.roof+.45,0xa3aaa8);
   box('roof-thin-rail',f,a,b,c,c+.05,q.roof+.85,q.roof+.89,dark,'metal',parapet);
   for(let s=a;s<=b;s+=1.5)box('roof-rail-post',f,s,s+.035,c,c+.05,q.roof+.42,q.roof+.88,dark,'metal',parapet);
 }
 for(const a of q.surfaces) {
   const corners=[f.point(a.s0,a.n0),f.point(a.s1,a.n0),f.point(a.s1,a.n1),f.point(a.s0,a.n1)],top=corners.map(p=>{const l=f.local(p);return new THREE.Vector3(p[0],physics561SurfaceHeight(a,l.s,l.n),p[1]);});
   const stair=a.name==='basement-stair',owner=part(a.name,[...top,...top.map(p=>new THREE.Vector3(p.x,Math.min(p.y-.25,heightAt(p.x,p.z)-.22),p.z))],stair?0x755747:0xa0a6a2);
   pavementMasks.push({component:a.name,polygon:corners});
   if(a.name.endsWith('paving'))for(let n=a.n0;n<a.n1;n+=.5)for(let s=a.s0;s<a.s1;s+=.8) {
     const x=Math.min(s+.78,a.s1),z=Math.min(n+.48,a.n1),y=a.y0+.006,colors=[0x949c9a,0xbbc1bc,0x697470];
     part('pavement-block',[at(f,s,y,n),at(f,x,y,n),at(f,x,y,z),at(f,s,y,z)],colors[Math.abs(Math.round(s*5+n*2))%3],'stone',owner,true);
   }
   if(stair) {
     for(let s=a.s0+.15;s<a.s1;s+=.17)box('stair-board-joint',f,s,s+.008,a.n0,a.n1,a.y0+.003,a.y0+.006,0x4f473d,'wood',owner);
     // 계단은 동쪽으로 내려가므로 각 디딤판의 낮은 쪽 앞선에 미끄럼 방지 띠를 둔다.
     part('yellow-green-stair-nosing',[at(f,a.s0,a.y0+.007,a.n1-.035),at(f,a.s1,a.y0+.007,a.n1-.035),at(f,a.s1,a.y0+.007,a.n1),at(f,a.s0,a.y0+.007,a.n1)],0xc4d078,'stone',owner,true);
   }
 }
 pavementMasks.push({component:'rebuilt-building-footprint',polygon:[f.point(4,20),f.point(46,20),f.point(46,40),f.point(4,40)]});
 const cheek:THREE.Vector3[]=[];
 for(const s of[26.75,27])for(const [n,y]of[[11,q.floor],[17,q.basement]])for(const h of[q.basement-.2,y+.12])cheek.push(at(f,s,h,n));
 part('stair-left-retaining-cheek',cheek,0x8d9697);
 const upperRail=beam('west-path-guardrail',at(f,8,q.floor+1,6.1),at(f,40,q.floor+1,6.1),.03,0x879693);
 for(let s=8;s<=40;s+=.8)beam('west-path-rail-post',at(f,s,q.floor,6.1),at(f,s,q.floor+1,6.1),.02,0x879693,upperRail);
 // 사진의 곡선 벽과 금속 난간을 현관 오른쪽에 근사 배치한다.
 const curve: XZ[]=[];
 for(let i=0;i<=12;i++){const angle=-Math.PI/2+Math.PI/2*i/12;curve.push(f.point(38+3*Math.cos(angle),14+3*Math.sin(angle)));}
 curve.push(f.point(41,20));
 for(let i=1;i<curve.length;i++) {
   const frame=humanities23Frame(curve[i-1],curve[i]),owner=panelWall('curved-sunken-retaining-wall',frame,0,frame.length,q.basement-.15,q.floor+.15,0x8d9697);
   beam('curved-guardrail',at(frame,0,q.floor+1),at(frame,frame.length,q.floor+1),.025,0x8f9c9b,owner);
   for(let s=0;s<frame.length;s+=.18)beam('curved-rail-baluster',at(frame,s,q.floor+.16),at(frame,s,q.floor+1),.012,0x8f9c9b,owner);
 }
 // 계단 옆의 낮은 조명과 식재는 이동 폭을 침범하지 않게 둔다.
 for(const n of[12.2,14.5,17.6]) {
   const y=n<17?q.floor-(q.floor-q.basement)*(n-11)/6:q.basement;
   const light=box('low-entry-bollard-light',f,38.3,38.48,n-.09,n+.09,y,y+.55,0x273a38,'metal');
   box('bollard-light-lens',f,38.28,38.5,n-.1,n+.1,y+.43,y+.5,0xd9d5ae,'glass',light);
 }
 const planter=box('entry-planter',f,38.8,40.5,18,19.5,q.basement,q.basement+.45,0x8b9390);
 box('entry-low-shrubs',f,39,40.3,18.2,19.3,q.basement+.42,q.basement+.95,0x596e49,'wood',planter);
 const tactileOwner=breakables.find(b=>b.mesh.userData.component==='west-upper-paving')!.mesh as Proxy;
 for(let s=9;s<26;s+=.6) {
   const tactile=box('upper-path-tactile',f,s,s+.58,8.9,9.5,q.floor+.006,q.floor+.018,0xb9b46f,'stone',tactileOwner);
   // 점자블록은 얇은 표면 하나로 표현한다. 돌기마다 충돌체를 추가하지 않는다.
   for(let n=9;n<9.5;n+=.13)box('tactile-line',f,s+.06,s+.52,n,n+.035,q.floor+.019,q.floor+.025,0xc9c681,'stone',tactile);
 }
 const board=panelWall('26-number-board',westFace,.8,3.2,q.roof-.05,q.roof+.9);
 label('26-building-number','26',westFace,2,-.16,q.roof+.43,1.9,.86,board,'#8e9499','#eff0ec');
 const meshes=batches.map(b=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(b.colors,3));g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:b.glass?.3:.8,side:THREE.DoubleSide}));mesh.name=b.glass?'science26-glass':'science26-surfaces';mesh.castShadow=!b.glass;mesh.receiveShadow=true;shell.add(mesh);return mesh;});
 shell.userData.science26Exterior={buildingIds:[SCIENCE26_ID],floors:q.floors,basement:q.basement,roof:q.roof,footprint:q.footprint,rawOsmFootprintPreserved:true,reconstructionYear:2019,aboveGroundFloors:5,basementFloors:1,dimensionsEstimated:true,footprintEstimated:true,entranceCoordinatesFromOsm:false,entrancePositionEstimated:true,rearFacadeEstimated:true,wholeInteriorImplemented:false,routes:q.routes,pavementMasks,geometry:{meshes:meshes.length+signs.length,textures:signs.length,triangles:batches.reduce((n,b)=>n+b.positions.length/9,0)+signs.length*2,colliders:breakables.length}};
 function update(_player:THREE.Vector3){batches.forEach((b,index)=>{const a=meshes[index].geometry.attributes.position as THREE.BufferAttribute,c=meshes[index].geometry.attributes.color as THREE.BufferAttribute;let moved=false,tinted=false;for(const p of b.parts){if(p.shown!==p.proxy.visible){p.shown=p.proxy.visible;moved=true;if(p.shown)(a.array as Float32Array).set(p.original,p.start);else for(let i=p.start;i<p.end;i+=3){a.array[i]=p.proxy.position.x;a.array[i+1]=p.proxy.position.y;a.array[i+2]=p.proxy.position.z;}}if(p.color!==p.proxy.material.color.getHex()){p.color=p.proxy.material.color.getHex();tinted=true;const t=p.proxy.material.color,scale=[t.r/p.base.r,t.g/p.base.g,t.b/p.base.b];for(let i=p.start;i<p.end;i++)c.array[i]=p.colors[i-p.start]*scale[(i-p.start)%3];}}if(moved)a.needsUpdate=true;if(tinted)c.needsUpdate=true;});for(const s of signs)s.mesh.visible=s.owner.visible;shell.visible=batches.some(b=>b.parts.some(p=>p.proxy.visible));}
 // 렌더 버퍼와 복원용 사본을 만든 뒤 조립용 배열을 비운다.
 for(const batch of batches){batch.positions.length=0;batch.colors.length=0;}
 return{shell,breakables,update};
}
