import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import type { CampusBuilding } from './fullCampus';
import { humanities23Frame } from './humanities23Site';
import { physics561SurfaceHeight, type Physics561Layout } from './physics561Site';
type XZ=[number,number];type XYZ=[number,number,number];type Frame=ReturnType<typeof humanities23Frame>;type Proxy=THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
export function createPhysics561Exterior(scene:THREE.Scene,building:CampusBuilding,q:Physics561Layout,heightAt:(x:number,z:number)=>number){
 const shell=new THREE.Group();shell.name='landmark/physics561-exterior';Object.assign(shell.userData,{role:'building-shell',buildingId:building.id,mappedOutline:building.points});scene.add(shell);
 const distant=new THREE.Group();distant.name=building.id+':physics561-distant';distant.visible=false;Object.assign(distant.userData,{role:'distant-building',buildingId:building.id});scene.add(distant);
 const signs:{mesh:THREE.Mesh;owner:Proxy}[]=[],floor=q.floor,roof=q.roof;
  const breakables: BreakableSpec[] = [];
  const batches = [false, true].map(glass => ({ glass, positions: [] as number[], colors: [] as number[], parts: [] as { proxy: Proxy; start: number; end: number; original: Float32Array; colors: Float32Array; base: THREE.Color; color: number; shown: boolean }[] }));
  const at = (f: Frame, s: number, y: number, n = 0) => { const p = f.point(s, n); return new THREE.Vector3(p[0], y, p[1]); };
  function part(name: string, vertices: THREE.Vector3[], color: number, material: BreakableSpec['material'] = 'stone', owner?: Proxy, flat = false) {
    const bounds = new THREE.Box3().setFromPoints(vertices), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const g = flat ? new THREE.BufferGeometry() : new ConvexGeometry(vertices.map(p => p.clone().sub(center)));
    if (flat) { const values: number[] = []; for (let i = 1; i + 1 < vertices.length; i++) for (const p of [vertices[0], vertices[i], vertices[i + 1]]) values.push(...p.clone().sub(center).toArray()); g.setAttribute('position', new THREE.Float32BufferAttribute(values, 3)); }
    const attr = g.attributes.position, proxy = owner ?? new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color }));
    if (!owner) { proxy.position.copy(center); proxy.updateMatrixWorld(true); Object.assign(proxy.userData, { buildingId: building.id, component: name, renderProxy: true, convex: true }); breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attr.array), toughness: material === 'glass' ? 2 : 8, material, label: '56-1동과 연결교' }); }
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
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=128;const ctx=canvas.getContext('2d')!;ctx.fillStyle=background;ctx.fillRect(0,0,768,128);ctx.fillStyle=color;ctx.font='bold 63px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,384,64);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const geometry=new THREE.PlaneGeometry(width,height);geometry.scale(-1,1,1);const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));mesh.name=name;mesh.position.copy(at(f,s,y,n));mesh.lookAt(at(f,s,y,n-1));shell.add(mesh);signs.push({mesh,owner});
  }


 const f=q.f,white=0xd5d8d1,glassColor=0x799b98,pavementMasks:{component:string;polygon:XZ[]}[]=[];
 const polygon=(s0:number,s1:number,n0:number,n1:number)=>[f.point(s0,n0),f.point(s1,n0),f.point(s1,n1),f.point(s0,n1)];
 const mask=(component:string,s0:number,s1:number,n0:number,n1:number)=>pavementMasks.push({component,polygon:polygon(s0,s1,n0,n1)});
 const axis=(s:number)=>humanities23Frame(f.point(s,3),f.point(s,21.5));
 function glazing(name:string,frame:Frame,a:number,b:number,n:number,ya:number,yb:number){
  const owner=box(name,frame,a,b,n-.04,n+.04,ya,yb,glassColor,'glass');
  for(let s=a;s<=b+.01;s+=1.5)box('silver-mullion',frame,s-.025,s+.025,n-.08,n+.08,ya,yb,0xaebcb5,'metal',owner);
  for(const y of[ya,yb])box('silver-transom',frame,a,b,n-.08,n+.08,y-.035,y+.035,0xb3bfb7,'metal',owner);return owner;
 }
 function granite(name:string,frame:Frame,a:number,b:number,n0:number,n1:number,ya:number,yb:number){
  const owner=box(name,frame,a,b,n0,n1,ya,yb,white);
  for(let y=ya+.4;y<yb;y+=.4)facet('granite-horizontal-joint',frame,a,b,y,y+.008,n0-.004,0xadb7ad,owner);
  for(let s=a+.9;s<b;s+=.9)facet('granite-vertical-joint',frame,s,s+.008,ya,yb,n0-.004,0xb2bbb2,owner);return owner;
 }
 // 단면도의 층별 후퇴와 사진의 흰 테라스 띠를 근사한다.
 const slabs=[[-13,12.4],[-13,16.3],[-10.5,16.3],[-9.5,16.3],[-7.6,20.5],[-3.4,20.5]],bodies=[[-12.1,12.1],[-10.5,15.7],[-8.4,15.7],[-6.3,15.7],[-3.3,19.8]];
 for(let level=0;level<6;level++){
  const y=level<5?q.floors[level]:roof,[s0,s1]=slabs[level];
  for(let s=s0;s<s1;s+=5)box('floor-slab-'+level,f,s,Math.min(s+5,s1),3,21.5,y-.24,y,0xc4cdc2);
  if(level>0){const back=axis(s1);granite('east-white-floor-band',back,0,18.5,-.3,.05,y-.75,y+.08);if(level===4)glazing('east-balcony-glass-rail',back,.45,18.05,-.05,y+.08,y+1.03);const front=axis(s0);granite('terrace-white-band',front,0,18.5,-.05,.3,y-.75,y+.08);
   if(level<5){glazing('terrace-glass-rail',front,.45,18.05,-.09,y+.08,y+1.03);for(const n of[3,21.2])granite('terrace-end-wall',f,s0,bodies[level][0]+.3,n,n+.3,y,y+1.05);}
  }
  if(level===5)continue;
  const [west,east]=bodies[level],top=level===4?roof:q.floors[level+1];
  for(const [side,s]of[['west',west],['east',east]] as const){const face=axis(s),entry=level===0&&side==='west'?4:level===3&&side==='east'?15.5:undefined;
   const cuts=[.4,18.1,...(entry!==undefined?[entry-1.15,entry+1.15]:[])].sort((a,b)=>a-b);
   for(let i=1;i<cuts.length;i++){const a=cuts[i-1],b=cuts[i],open=entry!==undefined&&Math.abs((a+b)/2-entry)<1.16;if(open){box('entry-lintel',face,a,b,-.1,.1,y+2.9,top-.24,white);for(const v of[a,b])box('entry-door-jamb',face,v-.04,v+.04,-.1,.12,y,y+2.9,0x939f95,'metal');}else glazing(side+'-curtain-glass',face,a,b,0,y+.03,top-.24);}
  }
  for(const n of[3.35,21.15]){
   const bridge=level===2||level===3?7:undefined,cuts=[west,east,...(n<4&&bridge!==undefined?[bridge-1.2,bridge+1.2]:[])].sort((a,b)=>a-b);
   for(let i=1;i<cuts.length;i++){const a=cuts[i-1],b=cuts[i],open=n<4&&bridge!==undefined&&Math.abs((a+b)/2-bridge)<1.21;
    if(open)granite('bridge-door-header',f,a,b,n-.15,n+.15,y+2.9,top-.24);else{const wall=granite('white-side-wall',f,a,b,n-.15,n+.15,y,top-.24);if(n>20&&b-a>4)facet('side-wall-panel-joint',f,a,b,y+1.1,y+1.11,n-.155,0xb2bbb2,wall);}
   }
  }
 }
 mask('new-building',-13,20.5,3,21.5);
 // 사진에서 확인하지 못한 실내는 짧은 현관까지만 구현한다.
 for(const [side,s,n,y,direction]of[['lower',-12.1,7,q.floors[0],1],['upper',15.7,18.5,q.floors[3],-1]] as const){
  const rear=s+direction*3,lo=Math.min(s,rear),hi=Math.max(s,rear);
  box(side+'-vestibule-floor',f,lo,hi,n-1.15,n+1.15,y-.24,y,0xbfc9bd);
  box(side+'-vestibule-back',f,rear-.07,rear+.07,n-1.15,n+1.15,y,y+2.9,0xc6cfc2);
  for(const edge of[n-1.2,n+1.2])box(side+'-vestibule-side',f,lo,hi,edge-.05,edge+.05,y,y+2.9,white);
 }
 for(const b of q.bridges){
  box(b.name+'-floor',f,b.s-1.2,b.s+1.2,-3,6,b.floor-.24,b.floor,0xc0cabe);
  box(b.name+'-roof',f,b.s-1.3,b.s+1.3,0,3.4,b.floor+2.9,b.floor+3.1,white);
  for(const s of[b.s-1.2,b.s+1.2]){const frame=humanities23Frame(f.point(s,-3),f.point(s,6));glazing(b.name+'-glass',frame,0,9,0,b.floor+.1,b.floor+2.9);}
  for(const n of[-3,6])box(b.name+'-vestibule-back',f,b.s-1.2,b.s+1.2,n-.06,n+.06,b.floor,b.floor+2.9,white);
 }
 for(const a of q.surfaces){
  const top=polygon(a.s0,a.s1,a.n0,a.n1).map(p=>{const local=f.local(p);return new THREE.Vector3(p[0],physics561SurfaceHeight(a,local.s,local.n),p[1]);});
  const pieces=a.y2!==undefined?[[top[0],top[1],top[2]],[top[0],top[2],top[3]]]:[top];
  const owner=pieces.map(face=>part(a.name,[...face,...face.map(p=>new THREE.Vector3(p.x,Math.min(p.y-.28,heightAt(p.x,p.z)-.25),p.z))],a.name.includes('stair')?0xb2bdb0:0xa6b3a3))[0];
  mask(a.name,a.s0,a.s1,a.n0,a.n1);
  if(a.name.includes('apron')||a.name==='lower-walk-approach'){
   for(let s=a.s0;s<a.s1;s+=.6)for(let n=a.n0;n<a.n1;n+=.6){const end=Math.min(s+.6,a.s1),far=Math.min(n+.6,a.n1),dark=(Math.round(s/.6)*7+Math.round(n/.6)*3)%17===0;
    const y=physics561SurfaceHeight(a,s,n)+.006;
    if(dark)box('dark-paving-inset',f,s,Math.min(s+.22,end),n,Math.min(n+.22,far),y,y+.004,0x6f7e70,'stone',owner);
    box('paving-joint',f,s,end,n,Math.min(n+.008,far),y,y+.003,0x738371,'stone',owner);
   }
  }
  if(a.name==='switchback-ramp')for(const s of[a.s0,a.s1]){const ya=physics561SurfaceHeight(a,s,a.n0),yb=physics561SurfaceHeight(a,s,a.n1);beam('ramp-handrail',at(f,s,ya+.95,a.n0),at(f,s,yb+.95,a.n1),.03,0xa3b3a3,owner);for(let n=a.n0;n<=a.n1;n+=2){const y=physics561SurfaceHeight(a,s,n);beam('ramp-post',at(f,s,y,n),at(f,s,y+.95,n),.025,0xa3b3a3,owner);}}
 }
 for(const [name,n,width]of[['south-gap',1.5,2.2],['north-garden',24,2.6]] as const){
  const steps=q.surfaces.filter(s=>s.name.startsWith(name));for(const [index,a]of steps.entries())for(const edge of[n-width/2,n+width/2]){
   const owner=box('flank-stair-curb',f,a.s0,a.s1,edge-.08,edge+.08,a.y0-.25,a.y0+.16,white);
   beam('flank-stair-rail',at(f,a.s0,a.y0+.95,edge),at(f,a.s1,(steps[index+1]?.y0??a.y1)+.95,edge),.03,0xb1bdb0,owner);
   if(index%4===0||index===steps.length-1)beam('flank-rail-post',at(f,a.s0,a.y0,edge),at(f,a.s0,a.y0+.95,edge),.025,0xa2b39e,owner);
  }
 }
 const tactile=box('lower-tactile-path',f,-20,-12.2,6.76,7.24,q.floors[0]+.005,q.floors[0]+.02,0xc5a342);
 for(let s=-19.9;s<-12.2;s+=.17)for(const n of[6.84,7,7.16])box('tactile-stud',f,s,s+.035,n,n+.035,q.floors[0]+.02,q.floors[0]+.033,0xdcc16b,'stone',tactile);
 box('upper-tactile-strip',f,27.1,27.55,17.1,19.9,q.apron+.004,q.apron+.019,0xc8a951);
 for(let s=-1;s<15;s+=2)for(const n of[6,10,14]){
  const top=[at(f,s,roof+.6,n),at(f,s+1.8,roof+.6,n),at(f,s+1.8,roof+1.4,n+3),at(f,s,roof+1.4,n+3)];const panel=part('solar-panel',[...top,...top.map(p=>p.clone().add(new THREE.Vector3(0,-.07,0)))],0x344958,'metal');
  beam('solar-frame',at(f,s,roof,n),at(f,s,roof+1.4,n+3),.04,0xaab8b0,panel);
 }
 const signFrame=axis(27.15),board=box('561-number-board',signFrame,17.1,18.4,-.12,.05,q.apron+.55,q.apron+1.35,0x27536d,'metal');
 label('561-number-sign','56-1 김철수물리관',signFrame,17.75,-.14,q.apron+.95,1.45,.55,board,'#27536d','#ffffff');
 const plaqueFrame=axis(15.75),plaque=box('upper-entry-nameplate',plaqueFrame,17,18.3,-.13,.02,q.floors[3]+1.4,q.floors[3]+1.85,0xb6b9ac,'metal');
 label('561-nameplate','김철수물리관',plaqueFrame,17.65,-.15,q.floors[3]+1.63,1.25,.38,plaque,'#b6b9ac','#314636');
 const meshes=batches.map(b=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(b.colors,3));g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:b.glass?.26:.77,side:THREE.DoubleSide}));mesh.name=b.glass?'physics561-glass':'physics561-surfaces';mesh.castShadow=!b.glass;mesh.receiveShadow=true;shell.add(mesh);return mesh;});
 shell.userData.physics561Exterior={buildingId:building.id,floor,roof,floors:q.floors,aboveGroundFloors:4,basementFloors:1,basementImplemented:true,dimensionsEstimated:true,wholeInteriorImplemented:false,footprintEstimated:true,routes:q.routes,pavementMasks,bridges:q.bridges,observedFaces:['west','east','north','south'],geometry:{meshes:meshes.length+signs.length,textures:signs.length,triangles:batches.reduce((n,b)=>n+b.positions.length/9,0)+signs.length*2,colliders:breakables.length}};
 function update(_player:THREE.Vector3){batches.forEach((b,index)=>{const a=meshes[index].geometry.attributes.position as THREE.BufferAttribute,c=meshes[index].geometry.attributes.color as THREE.BufferAttribute;let moved=false,tinted=false;for(const p of b.parts){if(p.shown!==p.proxy.visible){p.shown=p.proxy.visible;moved=true;if(p.shown)(a.array as Float32Array).set(p.original,p.start);else for(let i=p.start;i<p.end;i+=3){a.array[i]=p.proxy.position.x;a.array[i+1]=p.proxy.position.y;a.array[i+2]=p.proxy.position.z;}}if(p.color!==p.proxy.material.color.getHex()){p.color=p.proxy.material.color.getHex();tinted=true;const t=p.proxy.material.color,scale=[t.r/p.base.r,t.g/p.base.g,t.b/p.base.b];for(let i=p.start;i<p.end;i++)c.array[i]=p.colors[i-p.start]*scale[(i-p.start)%3];}}if(moved)a.needsUpdate=true;if(tinted)c.needsUpdate=true;});for(const s of signs)s.mesh.visible=s.owner.visible;shell.visible=batches.some(b=>b.parts.some(p=>p.proxy.visible));}
 return{shell,breakables,update};
}



