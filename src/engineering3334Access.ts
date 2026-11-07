import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import { humanities23Frame } from './humanities23Site';
import { physics561SurfaceHeight } from './physics561Site';
import { ENGINEERING3334_ID, type Engineering3334Layout } from './engineering3334Site';
type XZ=[number,number];type Frame=ReturnType<typeof humanities23Frame>;type Proxy=THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
export function createEngineering3334Access(scene:THREE.Scene,q:Engineering3334Layout){
 const shell=new THREE.Group();shell.name='landmark/engineering3334-access';Object.assign(shell.userData,{role:'building-shell',buildingId:ENGINEERING3334_ID,buildingIds:[ENGINEERING3334_ID]});scene.add(shell);
 

 let partBuilding=ENGINEERING3334_ID;
 const signs:{mesh:THREE.Mesh;owner:Proxy}[]=[];
  const breakables: BreakableSpec[] = [];
  const batches = [false, true].map(glass => ({ glass, positions: [] as number[], colors: [] as number[], parts: [] as { proxy: Proxy; start: number; end: number; original: Float32Array; colors: Float32Array; base: THREE.Color; color: number; shown: boolean }[] }));
  const at = (f: Frame, s: number, y: number, n = 0) => { const p = f.point(s, n); return new THREE.Vector3(p[0], y, p[1]); };
  function part(name: string, vertices: THREE.Vector3[], color: number, material: BreakableSpec['material'] = 'stone', owner?: Proxy, flat = false) {
    if (flat && vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0])).y < -1e-8) vertices = vertices.slice().reverse();
    const bounds = new THREE.Box3().setFromPoints(vertices), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const g = flat ? new THREE.BufferGeometry() : new ConvexGeometry(vertices.map(p => p.clone().sub(center)));
    if (flat) { const values: number[] = []; for (let i = 1; i + 1 < vertices.length; i++) for (const p of [vertices[0], vertices[i], vertices[i + 1]]) values.push(...p.clone().sub(center).toArray()); g.setAttribute('position', new THREE.Float32BufferAttribute(values, 3)); }
    const attr = g.attributes.position, proxy = owner ?? new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color }));
    if (!owner) { proxy.position.copy(center); proxy.updateMatrixWorld(true); Object.assign(proxy.userData, { buildingId: partBuilding, component: name, renderProxy: true, convex: true }); breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attr.array), toughness: material === 'glass' ? 2 : 8, material, label: '34동 북쪽 연결부' }); }
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
  function facet(name: string, f: Frame, s0: number, s1: number, y0: number, y1: number, n: number, color: number, owner: Proxy) { part(name, [at(f, s0, y0, n), at(f, s0, y1, n), at(f, s1, y1, n), at(f, s1, y0, n)], color, 'stone', owner, true); }

  function label(name:string,text:string,f:Frame,s:number,n:number,y:number,width:number,height:number,owner:Proxy,background:string,color:string){
    const canvas=document.createElement('canvas');canvas.width=text.length>4?1024:256;canvas.height=128;const ctx=canvas.getContext('2d')!;ctx.fillStyle=background;ctx.fillRect(0,0,canvas.width,128);ctx.fillStyle=color;ctx.font='bold 74px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,canvas.width/2,64,canvas.width-16);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const geometry=new THREE.PlaneGeometry(width,height);geometry.scale(-1,1,1);const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));mesh.name=name;mesh.position.copy(at(f,s,y,n));mesh.lookAt(at(f,s,y,n-1));shell.add(mesh);signs.push({mesh,owner});
  }




 const f=q.axis,white=0xd7d8ce,metal=0x89958f,green=0x4d8d7e;
 const pavementMasks:{component:string;polygon:XZ[]}[]=[];
 for(const a of [...q.surfaces,...q.elevated]){
   const h=(s:number,n:number)=>physics561SurfaceHeight(a,s,n),corners=[[a.s0,a.n0],[a.s1,a.n0],[a.s1,a.n1],[a.s0,a.n1]],top=corners.map(([s,n])=>at(a.frame,s,h(s,n),n));
   const stair=a.name.includes('stair')&&!a.name.endsWith('top'),owner=part(a.name,[...top,...top.map(v=>v.clone().add(new THREE.Vector3(0,-.18,0)))],stair?0x9b9f97:0xb5b8ab);
   if(q.surfaces.includes(a))pavementMasks.push({component:a.name,polygon:corners.map(([s,n])=>a.frame.point(s,n))});
   if(stair){const n=a.axis==='n'?a.n0:a.n0,s=a.axis==='s'?a.s1-.045:a.s0;
     part('stair-light-nosing',[at(a.frame,s,h(s,n)+.004,n),at(a.frame,a.s1,h(a.s1,n)+.004,n),at(a.frame,a.s1,h(a.s1,a.axis==='n'?n+.045:a.n1)+.004,a.axis==='n'?n+.045:a.n1),at(a.frame,s,h(s,a.axis==='n'?n+.045:a.n1)+.004,a.axis==='n'?n+.045:a.n1)],0xd0ccba,'stone',owner,true);continue;}
   const road=a.name==='north-court-east-road';
   if(road)continue;
   for(let s=a.s0;s<a.s1;s+=.8)for(let n=a.n0;n<a.n1;n+=.8){const e=Math.min(s+.785,a.s1),t=Math.min(n+.785,a.n1);if(e-s<.015||t-n<.015)continue;part('gray-paver',[at(a.frame,s,h(s,n)+.004,n),at(a.frame,e,h(e,n)+.004,n),at(a.frame,e,h(e,t)+.004,t),at(a.frame,s,h(s,t)+.004,t)],0xc6c8ba,'stone',owner,true);}
 }
 function rail(frame:Frame,s0:number,n0:number,s1:number,n1:number,y0:number,y1=y0,name='metal-railing'){
   const owner=beam(name,at(frame,s0,y0+1.02,n0),at(frame,s1,y1+1.02,n1),.026,metal);
   beam(name+'-middle',at(frame,s0,y0+.52,n0),at(frame,s1,y1+.52,n1),.022,metal,owner);
   const count=Math.max(1,Math.ceil(Math.hypot(s1-s0,n1-n0)/1.4));for(let i=0;i<=count;i++){const t=i/count,s=s0+(s1-s0)*t,n=n0+(n1-n0)*t,y=y0+(y1-y0)*t;beam(name+'-post',at(frame,s,y,n),at(frame,s,y+1.02,n),.024,metal,owner);}return owner;
 }
 for(const s of[23.4,27.6])rail(f,s,53.2,s,60.4,q.plazaFloor,q.entryFloor,'plaza-descending-stair-rail');
 box('low-court-retaining-wall',f,27.7,q.entry.s,56.5,56.7,q.entryFloor-.2,q.plazaFloor,0xa7aba1);
 const entryFace=humanities23Frame(f.point(q.entry.s,q.entry.n1),f.point(q.entry.s,q.entry.n0)),width=entryFace.length;
 const lintel=box('34-low-entry-white-lintel',entryFace,-.2,width+.2,-.65,1.5,q.entryFloor+2.7,q.entryFloor+3.1,white);
 for(const s of[0,width])box('34-low-entry-side',entryFace,s-.1,s+.1,0,1.5,q.entryFloor,q.entryFloor+2.7,0x9b9e94);
 box('34-low-entry-vestibule-back',entryFace,0,width,1.5,1.7,q.entryFloor,q.entryFloor+2.7,0x747f79);
 for(const [a,b]of[[.1,1.55],[width-1.55,width-.1]]){
   const glass=box('34-low-entry-fixed-glass',entryFace,a,b,.75,.8,q.entryFloor+.12,q.entryFloor+2.64,0x59756d,'glass');
   for(const s of[a,b])box('34-low-entry-frame',entryFace,s-.035,s+.035,.72,.84,q.entryFloor,q.entryFloor+2.7,metal,'metal',glass);
 }
 for(const s of[1.55,width-1.55])box('34-low-entry-open-door',entryFace,s-.035,s+.035,.76,1.48,q.entryFloor+.04,q.entryFloor+2.6,0x617e75,'glass');
 beam('34-north-round-white-column',at(f,q.entry.s-.65,q.entryFloor,q.entry.n1+.55),at(f,q.entry.s-.65,q.greenFloor-.2,q.entry.n1+.55),.25,white);
 label('34-low-entry-number','34',entryFace,width-.55,-.68,q.entryFloor+2.92,.7,.35,lintel,'#d7d8ce','#555f5c');
 // 연결교 끝의 얕은 안쪽 바닥은 이동을 위한 근사다. 확인하지 못한 건물 내부로 확장하지 않는다.
 function vestibule(frame:Frame,s:number,direction:number,floor:number,name:string){
   const a=s,b=s+direction*1.5;
   box(name+'-back',frame,Math.min(b,b+direction*.15),Math.max(b,b+direction*.15),-1.6,1.6,floor,floor+2.72,0x8b9590);
   for(const n of[-1.6,1.45])box(name+'-side',frame,Math.min(a,b),Math.max(a,b),n,n+.15,floor,floor+2.72,white);
   box(name+'-ceiling',frame,Math.min(a,b),Math.max(a,b),-1.6,1.6,floor+2.72,floor+2.86,white);
   for(const n of[-1.35,1.35])box(name+'-open-glass-door',frame,Math.min(a,b)+.18,Math.max(a,b)-.18,n-.035,n+.035,floor+.04,floor+2.55,0x6b8780,'glass');
 }
 vestibule(q.green,0,-1,q.greenFloor,'33-upper-link');
 for(const floor of[q.plazaFloor,q.greenFloor,q.topFloor])vestibule(q.stem,0,-1,floor,'34-north-link');
 for(const floor of[q.plazaFloor,q.greenFloor,q.upperFloor])vestibule(q.stem,q.stem.length,1,floor,'431-link');
 // 사각 기둥을 통로 바깥에 두고 아래 차로를 연다.
 for(const s of[.65,8.6,q.stem.length-.65])for(const n of[-1.85,1.85]){
   box('north-link-white-column',q.stem,s-.18,s+.18,n-.18,n+.18,q.entryFloor-.3,s<2?q.topFloor-.18:q.upperFloor-.18,white);
 }
 for(const floor of[q.plazaFloor,q.greenFloor])for(const n of[-1.62,1.62]){
   // 청록교가 만나는 구간은 난간을 비운다.
   for(const [a,b]of(n>0&&floor===q.greenFloor?[[0,q.junctionS-1.9],[q.junctionS+1.9,q.stem.length]]:[[0,q.stem.length]]))rail(q.stem,a,n,b,n,floor);
 }
 for(const n of[-1.62,1.62]){
   rail(q.stem,0,n,1,n,q.topFloor);rail(q.stem,1,n,8,n,q.topFloor,q.upperFloor,'north-diagonal-stair-rail');
   for(const [a,b]of(n<0?[[8,q.junctionS-1.9],[q.junctionS+1.9,q.stem.length]]:[[8,q.stem.length]]))if(b-a>.1)rail(q.stem,a,n,b,n,q.upperFloor);
 }
 // 청록색 둥근 지붕과 흰 난간벽은 공식 사진의 형태를 참고한다.
 for(const n of[-1.62,1.62]){
   box('33-green-bridge-parapet',q.green,0,q.green.length-1.9,n-.09,n+.09,q.greenFloor,q.greenFloor+.85,white);
   rail(q.green,0,n,q.green.length-1.9,n,q.greenFloor+.05,q.greenFloor+.05,'green-bridge-handrail');
   for(let s=0;s<=q.green.length-1.9;s+=4.5)box('33-green-bridge-roof-post',q.green,s-.055,s+.055,n-.055,n+.055,q.greenFloor+.85,q.greenRoof,green,'metal');
 }
 for(let s=0;s<q.green.length;s+=4.5){const e=Math.min(s+4.5,q.green.length);for(let i=0;i<10;i++){
   const n0=-1.8+3.6*i/10,n1=-1.8+3.6*(i+1)/10,y0=q.greenRoof+.65*Math.sqrt(Math.max(0,1-(n0/1.8)**2)),y1=q.greenRoof+.65*Math.sqrt(Math.max(0,1-(n1/1.8)**2));
   const top=[at(q.green,s,y0,n0),at(q.green,e,y0,n0),at(q.green,e,y1,n1),at(q.green,s,y1,n1)];part('33-curved-green-roof',[...top,...top.map(p=>p.clone().add(new THREE.Vector3(0,-.05,0)))],green,'metal');
 }}
 for(const s of[4,q.green.length-4])for(const n of[-1.55,1.55])box('33-green-bridge-support',q.green,s-.2,s+.2,n-.2,n+.2,q.entryFloor-.4,q.greenFloor-.18,white);
 for(const n of[-1.65,1.65]){
   const top=[at(q.eastBridge,1.8,q.upperFloor+.85,n),at(q.eastBridge,q.eastBridge.length,q.terraceFloor+.85,n),at(q.eastBridge,q.eastBridge.length,q.terraceFloor+.85,n+.16),at(q.eastBridge,1.8,q.upperFloor+.85,n+.16)];
   const wall=part('35-bridge-white-parapet',[...top,...top.map(p=>p.clone().add(new THREE.Vector3(0,-.85,0)))],white);
   for(let s=2;s<q.eastBridge.length;s+=2)box('35-parapet-panel-joint',q.eastBridge,s,s+.018,n-.003,n+.17,q.upperFloor+.12,q.upperFloor+.78,0xa3aaa1,'stone',wall);
 }
 rail(q.wall35,q.terraceStart+2.1,4.4,51.7,4.4,q.terraceFloor,q.terraceFloor,'35-terrace-edge-rail');
 if(!scene.getObjectByName('campus-terrain')?.userData.engineering35AccessCorrection)rail(q.wall35,q.terraceStart-1.8,.12,q.terraceStart-1.8,4.4,q.terraceFloor,q.terraceFloor,'35-terrace-south-rail');
 const meshes=batches.map(b=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(b.colors,3));g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:b.glass?.3:.8,side:THREE.DoubleSide}));mesh.name=b.glass?'engineering3334-glass':'engineering3334-surfaces';mesh.castShadow=!b.glass;mesh.receiveShadow=true;shell.add(mesh);return mesh;});


 shell.userData.engineering3334Access={buildingId:ENGINEERING3334_ID,dimensionsEstimated:true,wholeInteriorImplemented:false,doorDetailsEstimated:true,greenBridgeBelow35Bridge:true,bridge35EndsOnTerrace:true,routes:q.routes,pavementMasks,bounds:q.bounds,geometry:{meshes:meshes.length+signs.length,textures:signs.length,triangles:batches.reduce((n,b)=>n+b.positions.length/9,0)+signs.length*2,colliders:breakables.length}};
 function update(_player:THREE.Vector3){batches.forEach((b,index)=>{const a=meshes[index].geometry.attributes.position as THREE.BufferAttribute,c=meshes[index].geometry.attributes.color as THREE.BufferAttribute;let moved=false,tinted=false;for(const p of b.parts){if(p.shown!==p.proxy.visible){p.shown=p.proxy.visible;moved=true;if(p.shown)(a.array as Float32Array).set(p.original,p.start);else for(let i=p.start;i<p.end;i+=3){a.array[i]=p.proxy.position.x;a.array[i+1]=p.proxy.position.y;a.array[i+2]=p.proxy.position.z;}}if(p.color!==p.proxy.material.color.getHex()){p.color=p.proxy.material.color.getHex();tinted=true;const t=p.proxy.material.color,scale=[t.r/p.base.r,t.g/p.base.g,t.b/p.base.b];for(let i=p.start;i<p.end;i++)c.array[i]=p.colors[i-p.start]*scale[(i-p.start)%3];}}if(moved)a.needsUpdate=true;if(tinted)c.needsUpdate=true;});for(const s of signs)s.mesh.visible=s.owner.visible;shell.visible=batches.some(b=>b.parts.some(p=>p.proxy.visible));}
 return{shell,breakables,update};
}
