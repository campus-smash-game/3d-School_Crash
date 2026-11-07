import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import type { CampusBuilding } from './fullCampus';
import { humanities23Frame } from './humanities23Site';
import { physics561SurfaceHeight } from './physics561Site';
import { ENGINEERING33_ID } from './engineering33Site';
import { ENGINEERING3337_ID, ENGINEERING37_ID, type Engineering3337Layout } from './engineering3337Site';
import { engineering30ClipPolygon } from './engineering30Site';
type XZ=[number,number];type Frame=ReturnType<typeof humanities23Frame>;type Proxy=THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
export function createEngineering3337Access(scene:THREE.Scene,q:Engineering3337Layout){
 const shell=new THREE.Group();shell.name='landmark/engineering3337-access';Object.assign(shell.userData,{role:'building-shell',buildingId:ENGINEERING3337_ID,buildingIds:[ENGINEERING33_ID,ENGINEERING37_ID]});scene.add(shell);
 

 const partBuilding=ENGINEERING3337_ID;
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
    if (!owner) { proxy.position.copy(center); proxy.updateMatrixWorld(true); Object.assign(proxy.userData, { buildingId: partBuilding, component: name, renderProxy: true, convex: true }); breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attr.array), toughness: material === 'glass' ? 2 : 8, material, label: '33동과 37동 사이 연결부' }); }
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



 const white=0xd4d6ca,brick=0x985d49,metal=0x6d7a75;
 const pavementMasks:{component:string;polygon:XZ[]}[]=[];
 const b=q.bridge,p=q.passage,w=2.4;
 // 위층 연결교의 두 바닥 아래로 사람이 지나간다. 실내 층 전체는 만들지 않는다.
 for(const y of[q.bridgeFloor,q.middle])box('bridge-floor',b,0,b.length,-w,w,y-.22,y,white);
 for(const s of[.18,b.length-.18])for(const n of[-w+.2,w-.2])box('bridge-end-pier',b,s-.18,s+.18,n-.2,n+.2,q.upper,q.canopyBase,white);
 const bays=8,step=b.length/bays;
 for(let i=0;i<bays;i++){
   const s0=i*step,s1=(i+1)*step,mid=(s0+s1)/2;
   const owner=box('west-vertical-brick-strip',b,s0,s1,-w-.12,-w+.12,q.bridgeFloor,q.canopyBase,brick);
   for(let y=q.bridgeFloor+.12;y<q.canopyBase;y+=.17)facet('west-brick-joint',b,s0,s1,y,y+.012,-w-.125,0xbf967b,owner);
   const panel=box('west-white-window-strip',b,mid-.22,mid+.22,-w-.15,-w+.1,q.bridgeFloor,q.canopyBase,white,'stone',owner);
   for(const y of[q.bridgeFloor+.8,q.middle+.65]){
     box('west-narrow-window',b,mid-.16,mid+.16,-w-.17,-w-.15,y,Math.min(y+1.35,q.canopyBase-.1),0x465852,'glass',panel);
     facet('west-window-frame',b,mid-.012,mid+.012,y,Math.min(y+1.35,q.canopyBase-.1),-w-.18,metal,panel);
   }
 }
 // 동쪽 옛 사진은 넓은 흰 난간벽과 열린 수평 띠가 보인다.
 for(const y of[q.bridgeFloor,q.middle]){
   const owner=box('east-white-balustrade',b,0,b.length,w-.12,w+.1,y,y+1.15,white);
   for(let s=0;s<b.length;s+=1.8)box('east-panel-joint',b,s,s+.015,w+.101,w+.105,y+.02,y+1.13,0xaeb4aa,'stone',owner);
 }
 box('east-center-post',b,b.length/2-.15,b.length/2+.15,w-.14,w+.12,q.upper,q.canopyBase,white);
 for(const n of[-w,w])box('canopy-eave',b,0,b.length,n-.08,n+.08,q.canopyBase-.12,q.canopyBase,metal,'metal');
 // 청록색 덮개의 곡면을 작은 면으로 나눠 별도 고해상도 텍스처 없이 표현한다.
 box('canopy-end-rib',b,-.04,.04,-w,w,q.canopyBase-.12,q.canopyBase,metal,'metal');
 const arc=(i:number)=>({n:-w+2*w*i/8,y:q.canopyBase+.75*Math.sin(Math.PI*i/8)});
 for(let i=0;i<8;i++){
   const a=arc(i),c=arc(i+1),top=[at(b,0,a.y,a.n),at(b,b.length,a.y,a.n),at(b,b.length,c.y,c.n),at(b,0,c.y,c.n)];
   const roofOwner=part('green-arched-roof',[...top,...top.map(v=>v.clone().add(new THREE.Vector3(0,-.035,0)))],0x668d80,'glass');
   for(let s=0;s<=b.length+.01;s+=b.length/8)beam('roof-curved-rib',at(b,s,a.y+.025,a.n),at(b,s,c.y+.025,c.n),.035,metal,roofOwner);
 }
 const sign=box('west-direction-sign',b,0,b.length,-w-.17,-w-.13,q.bridgeFloor-.17,q.bridgeFloor+.22,white);
 label('west-direction-label','‹33                 37›',b,b.length/2,-w-.19,q.bridgeFloor+.02,b.length-.6,.32,sign,'#d4d6ca','#515954');
 // 계단 옆 흰 옹벽과 녹색 곡면 덮개. 내부 용도와 깊이는 미확인이다.
 const retaining=box('west-white-retaining-wall',p,8.95,9.2,-4.1,-.12,q.lower-.1,q.upper+.6,white);
 for(let n=-4;n<-.2;n+=.75)for(let y=q.lower+.45;y<q.upper+.6;y+=.55){
   part('retaining-stone-joint',[at(p,8.945,y,n),at(p,8.945,y,n+.65),at(p,8.945,y+.014,n+.65),at(p,8.945,y+.014,n)],0x929c91,'stone',retaining,true);
 }
 const curve=(i:number)=>({s:8.95-1.15*Math.sin(Math.PI*i/12),y:q.lower+.2+1.25*Math.cos(Math.PI*i/12)});
 for(let i=0;i<6;i++){
   const a=curve(i),c=curve(i+1),top=[at(p,a.s,a.y,-3.95),at(p,a.s,a.y,-.25),at(p,c.s,c.y,-.25),at(p,c.s,c.y,-3.95)];
   const cover=part('lower-green-curved-cover',[...top,...top.map(v=>v.clone().add(new THREE.Vector3(0,-.04,0)))],0x527e6a,'glass');
   for(let n=-3.95;n<=-.24;n+=.74)beam('lower-cover-rib',at(p,a.s-.015,a.y+.015,n),at(p,c.s-.015,c.y+.015,n),.035,0x53665a,cover);
 }
 for(const n of[-3.35,-2.3,-1.2])part('cover-notice-panel',[at(p,8.22,q.lower+1.12,n),at(p,8.22,q.lower+1.12,n+.42),at(p,8.04,q.lower+.82,n+.42),at(p,8.04,q.lower+.82,n)],0xb8b9a4,'stone',retaining,true);
 for(const n of[-4.25,4.55])box('upper-landing-sidewall',p,9.2,18.8,n-.1,n+.1,q.upper-.22,q.upper+.65,white);
 const mid=q.surfaces.find(a=>a.name==='west-stair-middle-landing')!.y0;
 for(const n of[-.14,4.54]){
   const top=[at(p,5.8,mid+.62,n-.1),at(p,9.2,q.upper+.62,n-.1),at(p,9.2,q.upper+.62,n+.1),at(p,5.8,mid+.62,n+.1)];
   part('upper-stair-white-sidewall',[...top,...top.map(v=>v.clone().add(new THREE.Vector3(0,-.95,0)))],white);
   const owner=beam('lower-stair-handrail',at(p,1.2,q.lower+.98,n),at(p,4.5,mid+.82,n),.035,metal);
   beam('middle-landing-handrail',at(p,4.5,mid+.82,n),at(p,5.8,mid+.82,n),.035,metal,owner);
   for(const a of q.surfaces.filter(a=>(a.name==='west-wide-stair'||a.name==='west-stair-middle-landing')&&a.s0<5.8)){
     const s=(a.s0+a.s1)/2,y=s<4.5?q.lower+.98+(mid-q.lower-.16)*(s-1.2)/3.3:mid+.82;
     beam('lower-stair-rail-post',at(p,s,a.y0,n),at(p,s,y,n),.035,metal,owner);
   }
 }
 const topRail=beam('retaining-top-rail',at(p,9.05,q.upper+1,-4.1),at(p,9.05,q.upper+1,-.12),.035,metal);
 for(let n=-4.05;n<0;n+=.8)beam('retaining-rail-post',at(p,9.05,q.upper+.6,n),at(p,9.05,q.upper+1,n),.035,metal,topRail);
 // 짧은 동쪽 계단과 그 북쪽 경사로를 별도 보행면으로 만든다.
 for(const n of[1.52,3.8]){
   const end=q.eastLow+.86,owner=beam('east-ramp-top-rail',at(p,18.8,q.upper+.86,n),at(p,24.4,end,n),.035,metal);
   for(let s=18.8;s<=24.401;s+=1.4){const y=q.upper+(q.eastLow-q.upper)*(s-18.8)/5.6;beam('east-ramp-rail-post',at(p,s,y,n),at(p,s,y+.86,n),.035,metal,owner);}
   beam('east-ramp-mid-rail',at(p,18.8,q.upper+.43,n),at(p,24.4,q.eastLow+.43,n),.025,metal,owner);
 }
 const stairWall=[at(p,18.8,q.upper+.6,-2.95),at(p,20.6,q.eastLow+.6,-2.95),at(p,20.6,q.eastLow+.6,-3.15),at(p,18.8,q.upper+.6,-3.15)];
 part('east-stair-white-sidewall',[...stairWall,...stairWall.map(v=>v.clone().add(new THREE.Vector3(0,-.85,0)))],white);
 for(const a of q.surfaces){
   const poly=[a.frame.point(a.s0,a.n0),a.frame.point(a.s1,a.n0),a.frame.point(a.s1,a.n1),a.frame.point(a.s0,a.n1)],height=(s:number,n:number)=>physics561SurfaceHeight(a,s,n);
   const top=poly.map(v=>{const local=a.frame.local(v);return new THREE.Vector3(v[0],height(local.s,local.n),v[1]);});
   const stair=a.name==='west-wide-stair'||a.name==='east-short-stair',asphalt=a.name==='west-parking-approach'||a.name==='lower-cover-apron',red=a.name.startsWith('east-');
   const owner=part(a.name,[...top,...top.map(v=>v.clone().add(new THREE.Vector3(0,-.22,0)))],asphalt?0x71756f:stair?0x969c92:red?0x986b54:0x8e968a);pavementMasks.push({component:a.name,polygon:poly});
   if(stair){const s=a.name==='west-wide-stair'?a.s0:a.s1-.045;part('stair-light-nosing',[at(p,s,a.y0+.005,a.n0),at(p,s+.045,a.y0+.005,a.n0),at(p,s+.045,a.y0+.005,a.n1),at(p,s,a.y0+.005,a.n1)],0xc5c8b9,'stone',owner,true);continue;}
   if(asphalt)continue;
   const ds=red?.3:.6;
   for(let s=a.s0;s<a.s1;s+=ds)for(let n=a.n0;n<a.n1;n+=.6){const end=Math.min(s+ds-.015,a.s1),hi=Math.min(n+.585,a.n1);if(hi-n<.01||end-s<.01)continue;const cell=[p.point(s,n),p.point(end,n),p.point(end,hi),p.point(s,hi)];for(const tile of engineering30ClipPolygon(cell,poly,true))part(red?'east-red-paver':'landing-gray-paver',tile.map(v=>{const l=p.local(v);return new THREE.Vector3(v[0],height(l.s,l.n)+.004,v[1]);}),red?0xb17a60:0xb2b8a9,'stone',owner,true);}
 }
 const meshes=batches.map(b=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(b.colors,3));g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:b.glass?.3:.8,side:THREE.DoubleSide}));mesh.name=b.glass?'engineering3337-glass':'engineering3337-surfaces';mesh.castShadow=!b.glass;mesh.receiveShadow=true;shell.add(mesh);return mesh;});

 shell.userData.engineering3337Access={buildingIds:[ENGINEERING33_ID,ENGINEERING37_ID],rawOsmFootprintPreserved:true,dimensionsEstimated:true,wholeInteriorImplemented:false,westPhotoMonth:"2025-09",eastPhotoMonth:"2011-04",eastCurrentStateUnverified:true,bridgeClearance:q.bridgeFloor-.22-q.upper,stairFlights:2,greenCoverUseUnknown:true,routes:q.routes,pavementMasks,bounds:q.bounds,geometry:{meshes:meshes.length+signs.length,textures:signs.length,triangles:batches.reduce((n,b)=>n+b.positions.length/9,0)+signs.length*2,colliders:breakables.length}};
 function update(_player:THREE.Vector3){batches.forEach((b,index)=>{const a=meshes[index].geometry.attributes.position as THREE.BufferAttribute,c=meshes[index].geometry.attributes.color as THREE.BufferAttribute;let moved=false,tinted=false;for(const p of b.parts){if(p.shown!==p.proxy.visible){p.shown=p.proxy.visible;moved=true;if(p.shown)(a.array as Float32Array).set(p.original,p.start);else for(let i=p.start;i<p.end;i+=3){a.array[i]=p.proxy.position.x;a.array[i+1]=p.proxy.position.y;a.array[i+2]=p.proxy.position.z;}}if(p.color!==p.proxy.material.color.getHex()){p.color=p.proxy.material.color.getHex();tinted=true;const t=p.proxy.material.color,scale=[t.r/p.base.r,t.g/p.base.g,t.b/p.base.b];for(let i=p.start;i<p.end;i++)c.array[i]=p.colors[i-p.start]*scale[(i-p.start)%3];}}if(moved)a.needsUpdate=true;if(tinted)c.needsUpdate=true;});for(const s of signs)s.mesh.visible=s.owner.visible;shell.visible=batches.some(b=>b.parts.some(p=>p.proxy.visible));}
 return{shell,breakables,update};
}
