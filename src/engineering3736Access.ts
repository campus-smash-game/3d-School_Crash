import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import { humanities23Frame } from './humanities23Site';
import { physics561SurfaceHeight } from './physics561Site';
import { ENGINEERING3736_ID, type Engineering3736Layout } from './engineering3736Site';
type XZ=[number,number];type Frame=ReturnType<typeof humanities23Frame>;type Proxy=THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
export function createEngineering3736Access(scene:THREE.Scene,q:Engineering3736Layout){
 const shell=new THREE.Group();shell.name='landmark/engineering3736-access';Object.assign(shell.userData,{role:'building-shell',buildingId:ENGINEERING3736_ID,buildingIds:[ENGINEERING3736_ID]});scene.add(shell);


 let partBuilding=ENGINEERING3736_ID;
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
    if (!owner) { proxy.position.copy(center); proxy.updateMatrixWorld(true); Object.assign(proxy.userData, { buildingId: partBuilding, component: name, renderProxy: true, convex: true }); breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attr.array), toughness: material === 'glass' ? 2 : 8, material, label: '36동과 37동 사이 현관' }); }
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






 const f=q.axis,front=q.front,white=0xbfc1b8,metal=0x838f87,glass=0x536861;
 const pavementMasks:{component:string;polygon:XZ[]}[]=q.oldPolygons.map(polygon=>({component:'removed-straight-approach',polygon}));
 for(const a of q.surfaces){
   const h=(s:number,n:number)=>physics561SurfaceHeight(a,s,n),corners=[[a.s0,a.n0],[a.s1,a.n0],[a.s1,a.n1],[a.s0,a.n1]],top=corners.map(([s,n])=>at(a.frame,s,h(s,n),n));
   const road=a.name.includes('court')||a.name==='south-footway-approach',step=a.name.includes('stair'),red=a.name==='red-side-landing'||a.name==='under-bridge-upper-walk';
   const owner=part(a.name,[...top,...top.map(p=>p.clone().add(new THREE.Vector3(0,-.18,0)))],road?0x8c7c73:red?0xa36e57:0xb3b7ab);
   pavementMasks.push({component:a.name,polygon:corners.map(([s,n])=>a.frame.point(s,n))});
   if(step){part('light-stair-nosing',[at(a.frame,a.s0,a.y0+.004,a.n0),at(a.frame,a.s1,a.y0+.004,a.n0),at(a.frame,a.s1,a.y0+.004,a.n0+.045),at(a.frame,a.s0,a.y0+.004,a.n0+.045)],0xd9d5c4,'stone',owner,true);continue;}
   const span=road?1.0:.6;
   for(let s=a.s0;s<a.s1-.02;s+=span)for(let n=a.n0;n<a.n1-.02;n+=span){const e=Math.min(a.s1,s+span-.012),t=Math.min(a.n1,n+span-.012);if(e-s<.02||t-n<.02)continue;part('paver-joint-cell',[at(a.frame,s,h(s,n)+.004,n),at(a.frame,e,h(e,n)+.004,n),at(a.frame,e,h(e,t)+.004,t),at(a.frame,s,h(s,t)+.004,t)],road?0x928277:red?0xac7b62:0xbec0b5,'stone',owner,true);}
 }
 const L=front.length,y=q.entryFloor;
 const header=box('entry-gray-sign-header',front,0,L,-.18,.18,y+2.65,y+3.5,0xb7b7ad);
 for(const s of[0,L-.16])box('entry-gray-jamb',front,s,s+.16,-.18,.18,y,y+2.65,0xa6aaa0,'stone',header);
 for(let i=0;i<8;i++){
   const a=.16+(L-.32)*i/8,b=.16+(L-.32)*(i+1)/8,door=i===3||i===4;
   const pane=box(door?'entry-glass-door':'entry-fixed-glazing',front,a+.025,b-.025,-.075,-.02,y+.04,y+2.65,glass,'glass');
   for(const s of[a,b])box('entry-panel-vertical-frame',front,s-.025,s+.025,-.12,-.015,y+.02,y+2.65,metal,'metal',pane);
   for(const yy of[y+.04,y+1.08,y+2.62])box('entry-panel-transom',front,a,b,-.12,-.015,yy,yy+.035,metal,'metal',pane);
   if(door)box('entry-door-handle',front,(a+b)/2-.025,(a+b)/2+.025,-.21,-.12,y+.9,y+1.35,0xc9cec5,'metal',pane);
 }
 label('engineering-entry-sign','ENGINEERING',front,L/2,-.195,y+3.08,L*.48,.4,header,'#b7b7ad','#a14c39');
 label('engineering-entry-arrow37','<37',front,L*.15,-.195,y+3.08,L*.16,.35,header,'#b7b7ad','#373d36');
 label('engineering-entry-arrow36','36>',front,L*.86,-.195,y+3.08,L*.16,.35,header,'#b7b7ad','#373d36');
 box('entry-vestibule-back',front,.1,L-.1,1.6,1.8,y,y+2.7,0xa5afa2);
 for(const s of[.1,L-.1])box('entry-vestibule-side',front,s-.06,s+.06,0,1.8,y,y+2.7,white);
 box('entry-vestibule-ceiling',front,.1,L-.1,0,1.8,y+2.7,y+2.83,white);
 const roof=part('annex-green-roof',q.roofPolygon.flatMap(p=>[at(f,p[0],y+3.5,p[1]),at(f,p[0],y+3.65,p[1])]),0x6e8a6c);
 for(let i=0;i<q.roofPolygon.length;i++){
   const a=q.roofPolygon[i],b=q.roofPolygon[(i+1)%q.roofPolygon.length],face=humanities23Frame(f.point(...a),f.point(...b));
   box('annex-roof-coping',face,0,face.length,-.1,.1,y+3.62,y+3.8,white,'stone',roof);
   if(i!==2)box('annex-side-wall',face,0,face.length,-.1,.1,y,y+3.5,white);
 }
 const camera=box('entry-security-camera',front,.75,.95,-.5,-.26,y+3.45,y+3.65,0xedece2,'metal');
 box('camera-dark-lens',front,.78,.92,-.51,-.5,y+3.48,y+3.59,0x414e47,'metal',camera);
 function rail(frame:Frame,s0:number,n0:number,s1:number,n1:number,y0:number,y1=y0,name='metal-railing'){
   const owner=beam(name,at(frame,s0,y0+1.02,n0),at(frame,s1,y1+1.02,n1),.027,metal);
   for(const dy of[.45,.7])beam(name+'-middle',at(frame,s0,y0+dy,n0),at(frame,s1,y1+dy,n1),.022,metal,owner);
   const count=Math.max(1,Math.ceil(Math.hypot(s1-s0,n1-n0)/1.2));for(let i=0;i<=count;i++){const t=i/count,s=s0+(s1-s0)*t,n=n0+(n1-n0)*t,y=y0+(y1-y0)*t;beam(name+'-post',at(frame,s,y,n),at(frame,s,y+1.02,n),.025,metal,owner);}return owner;
 }
 for(const s of[-3.8,-2.0])rail(f,s,-26.5,s,-17.8,q.courtFloor,q.entryFloor,'ramp-handrail');
 for(const s of[-1.8,-.05]){rail(f,s,-25.3,s,-23.7,q.courtFloor,q.entryFloor,'short-stair-handrail');rail(f,s,-23.7,s,-19,q.entryFloor,q.entryFloor,'upper-stair-walk-rail');}
 for(const s of[.25,L-1.35])rail(front,s,-3.4,s,-1.5,q.courtFloor,q.entryFloor,'entry-stair-side-rail');
 rail(front,.25,-1.5,.25,-.1,q.entryFloor,q.entryFloor,'entry-front-landing-rail');
 // 현관 앞의 공개 게시물은 판독하지 않고 일반 안내판만 둔다.
 const notice=box('entry-notice-board',front,1.25,1.9,-.14,-.1,y+.8,y+1.6,0xd1d3c4,'metal');
 for(let yy=y+.95;yy<y+1.5;yy+=.15)box('notice-neutral-line',front,1.35,1.8,-.145,-.14,yy,yy+.015,0x83907f,'metal',notice);
 const lamp=beam('court-dish-lamp',at(f,-12.8,q.courtFloor,-31),at(f,-12.8,q.courtFloor+4.5,-31),.06,metal);
 const shade=[];for(let i=0;i<12;i++){const a=i*Math.PI/6;shade.push(at(f,-12.8+.55*Math.cos(a),q.courtFloor+4.6,-31+.55*Math.sin(a)));}shade.push(at(f,-12.8,q.courtFloor+4.15,-31));part('lamp-shade',shade,0x626f61,'metal',lamp);
 const meshes=batches.map(b=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(b.colors,3));g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:b.glass?.3:.8,side:THREE.DoubleSide}));mesh.name=b.glass?'engineering3736Access-glass':'engineering3736Access-surfaces';mesh.castShadow=!b.glass;mesh.receiveShadow=true;shell.add(mesh);return mesh;});



 shell.userData.engineering3736Access={buildingId:ENGINEERING3736_ID,dimensionsEstimated:true,wholeInteriorImplemented:false,entryFloor:q.entryFloor,courtFloor:q.courtFloor,annexPlacementEstimated:true,officialEntryFloorUnknown:true,routes:q.routes,pavementMasks,bounds:q.bounds,geometry:{meshes:meshes.length+signs.length,textures:signs.length,triangles:batches.reduce((n,b)=>n+b.positions.length/9,0)+signs.length*2,colliders:breakables.length}};
 function update(_player:THREE.Vector3){batches.forEach((b,index)=>{const a=meshes[index].geometry.attributes.position as THREE.BufferAttribute,c=meshes[index].geometry.attributes.color as THREE.BufferAttribute;let moved=false,tinted=false;for(const p of b.parts){if(p.shown!==p.proxy.visible){p.shown=p.proxy.visible;moved=true;if(p.shown)(a.array as Float32Array).set(p.original,p.start);else for(let i=p.start;i<p.end;i+=3){a.array[i]=p.proxy.position.x;a.array[i+1]=p.proxy.position.y;a.array[i+2]=p.proxy.position.z;}}if(p.color!==p.proxy.material.color.getHex()){p.color=p.proxy.material.color.getHex();tinted=true;const t=p.proxy.material.color,scale=[t.r/p.base.r,t.g/p.base.g,t.b/p.base.b];for(let i=p.start;i<p.end;i++)c.array[i]=p.colors[i-p.start]*scale[(i-p.start)%3];}}if(moved)a.needsUpdate=true;if(tinted)c.needsUpdate=true;});for(const s of signs)s.mesh.visible=s.owner.visible;shell.visible=batches.some(b=>b.parts.some(p=>p.proxy.visible));}
 // 렌더 버퍼와 복원용 사본을 만든 뒤 조립용 배열을 비운다.
 for(const batch of batches){batch.positions.length=0;batch.colors.length=0;}
 return{shell,breakables,update};
}
