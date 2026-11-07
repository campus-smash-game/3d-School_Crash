import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import { ENGINEERING30_ID } from './engineering30Site';
import { ENGINEERING33_ID, type Engineering3033Layout } from './engineering3033Site';
import { humanities23Frame } from './humanities23Site';
import { physics561SurfaceHeight } from './physics561Site';
type XZ=[number,number];type Frame=ReturnType<typeof humanities23Frame>;type Proxy=THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
export function createEngineering3033Access(scene:THREE.Scene,q:Engineering3033Layout){
 const shell=new THREE.Group();shell.name='landmark/engineering3033-access';Object.assign(shell.userData,{role:'building-shell',buildingId:ENGINEERING30_ID,buildingIds:[ENGINEERING30_ID]});scene.add(shell);
 const partBuilding=ENGINEERING30_ID;
  const breakables: BreakableSpec[] = [];
  const batches = [false, true].map(glass => ({ glass, positions: [] as number[], colors: [] as number[], parts: [] as { proxy: Proxy; start: number; end: number; original: Float32Array; colors: Float32Array; base: THREE.Color; color: number; shown: boolean }[] }));
  const at = (f: Frame, s: number, y: number, n = 0) => { const p = f.point(s, n); return new THREE.Vector3(p[0], y, p[1]); };
  function part(name: string, vertices: THREE.Vector3[], color: number, material: BreakableSpec['material'] = 'stone', owner?: Proxy, flat = false) {
    if (flat && vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0])).y < -1e-8) vertices = vertices.slice().reverse();
    const bounds = new THREE.Box3().setFromPoints(vertices), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const g = flat ? new THREE.BufferGeometry() : new ConvexGeometry(vertices.map(p => p.clone().sub(center)));
    if (flat) { const values: number[] = []; for (let i = 1; i + 1 < vertices.length; i++) for (const p of [vertices[0], vertices[i], vertices[i + 1]]) values.push(...p.clone().sub(center).toArray()); g.setAttribute('position', new THREE.Float32BufferAttribute(values, 3)); }
    const attr = g.attributes.position, proxy = owner ?? new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color }));
    if (!owner) { proxy.position.copy(center); proxy.updateMatrixWorld(true); Object.assign(proxy.userData, { buildingId: partBuilding, component: name, renderProxy: true, convex: true }); breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attr.array), toughness: material === 'glass' ? 2 : 8, material, label: '30동과 33동 사이 통로' }); }
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
 const pavementMasks:{component:string;polygon:XZ[]}[]=[];
 for(const a of q.surfaces){
   const f=a.frame,poly=[f.point(a.s0,a.n0),f.point(a.s1,a.n0),f.point(a.s1,a.n1),f.point(a.s0,a.n1)];
   const y=(s:number,n:number)=>physics561SurfaceHeight(a,s,n),top=poly.map(p=>{const l=f.local(p);return new THREE.Vector3(p[0],y(l.s,l.n),p[1]);});
   const red=a.name==='upper-red-court'||a.name.includes('passage'),stair=a.name.includes('stair')&&!a.name.includes('bottom')&&!a.name.includes('top');
   const owner=part(a.name,[...top,...top.map(p=>p.clone().add(new THREE.Vector3(0,-.22,0)))],stair?0xa9aaa0:red?0x877b6a:0x999d91);
   pavementMasks.push({component:a.name,polygon:poly});
   if(stair){const s=a.s0;part('stone-stair-nosing',[at(f,s,y(s,a.n0)+.005,a.n0),at(f,s+.045,y(s+.045,a.n0)+.005,a.n0),at(f,s+.045,y(s+.045,a.n1)+.005,a.n1),at(f,s,y(s,a.n1)+.005,a.n1)],0xd0cbbb,'stone',owner,true);continue;}
   const ds=red?.24:.6,dn=red?.48:.6;
   for(let s=a.s0,row=0;s<a.s1;s+=ds,row++)for(let n=a.n0-(red&&row%2?dn/2:0);n<a.n1;n+=dn){
     const s1=Math.min(s+ds-.015,a.s1),n0=Math.max(n,a.n0),n1=Math.min(n+dn-.015,a.n1);if(n1-n0<.01)continue;
     part(red?'red-brick-paver':'gray-square-paver',[at(f,s,y(s,n0)+.004,n0),at(f,s1,y(s1,n0)+.004,n0),at(f,s1,y(s1,n1)+.004,n1),at(f,s,y(s,n1)+.004,n1)],red?(row%3===0?0xb48977:0xb89a89):0xc0c1b3,'stone',owner,true);
   }
   if(a.name==='east-passage-approach'||a.name==='passage-stair-bottom'){
     const n=-1.7;part('tactile-guidance',[at(f,a.s0,y(a.s0,n)+.012,n),at(f,a.s1,y(a.s1,n)+.012,n),at(f,a.s1,y(a.s1,n+.3)+.012,n+.3),at(f,a.s0,y(a.s0,n+.3)+.012,n+.3)],0xc3aa43,'stone',owner,true);
   }
 }
 for(const a of q.surfaces.filter(a=>a.name==='wide-court-stair'))box('stair-west-stone-border',q.west,a.s0,a.s1,-22.3,-22.02,a.y0-.24,a.y0+.18,0x999e8c);
 for(const a of q.surfaces.filter(a=>a.name==='upper-red-court'))box('court-west-planter-edge',q.west,a.s0,a.s1,-22.3,-22.02,a.y0-.25,a.y0+.25,0x9a8674);

 const ramp=q.surfaces.find(a=>a.name==='passage-access-ramp')!;
 for(const n of[.35,2.3]){
   const f=q.passage,owner=beam('south-ramp-handrail',at(f,ramp.s0,ramp.y0+.92,n),at(f,ramp.s1,ramp.y1+.92,n),.027,0x99a2a0);
   beam('south-ramp-lower-rail',at(f,ramp.s0,ramp.y0+.5,n),at(f,ramp.s1,ramp.y1+.5,n),.019,0x99a2a0,owner);
   for(let s=ramp.s0;s<ramp.s1+.001;s+=1){const y=physics561SurfaceHeight(ramp,s,n);beam('south-ramp-post',at(f,s,y,n),at(f,s,y+.92,n),.023,0x99a2a0,owner);}
 }
 // 사진에서 확인한 두 층의 흰 연결 몸체와 열린 하부를 구분한다. 전체 실내는 만들지 않는다.
 const f=q.bridge,width=2.7;
 for(const y of[q.bridgeFloor,q.bridgeFloor+3.5,q.bridgeRoof])box('south-bridge-floor',f,-.15,f.length+.15,-width,width,y-.2,y,0xd2d2c5);
 for(let s=0;s<f.length;s+=3.8){const end=Math.min(s+3.8,f.length);
   for(const side of[-1,1])for(let level=0;level<2;level++){
     const y=q.bridgeFloor+level*3.5,n=side*width,owner=box('south-bridge-white-spandrel',f,s,end,n-.1,n+.1,y,y+1.0,0xd7d7ca);
     box('south-bridge-upper-band',f,s,end,n-.1,n+.1,y+2.6,y+3.5,0xd7d7ca,'stone',owner);
     box('south-bridge-ribbon-window',f,s+.07,end-.07,n-.07,n+.07,y+1,y+2.6,0x637b7c,'glass');
     for(let u=s+.1;u<end;u+=1.2)box('south-bridge-window-mullion',f,u,u+.055,n-.11,n+.11,y+1,y+2.6,0x464e4d,'metal',owner);
   }
 }
 for(const s of[.25,f.length-.25])for(const n of[-width+.2,width-.2])box('bridge-end-pier',f,s-.2,s+.2,n-.2,n+.2,q.upper-.24,q.bridgeFloor,0xcdcec1);
 for(const [s,n,y] of [[22,-23,q.lower],[49,-2.4,q.upper],[70,-2.4,q.upper]] as const){
   const soil=box('court-tree-planter',q.west,s-1.2,s+1.2,n-.65,n+.65,y-.12,y+.23,0x85745c);
   const trunk=beam('court-tree-trunk',at(q.west,s,y+.23,n),at(q.west,s,y+3.6,n),.13,0x71654d);
   const crown=new THREE.IcosahedronGeometry(1,0),attribute=crown.attributes.position;
   for(const [offset,radius]of [[0,1.35],[1.0,.9]] as const){const center=at(q.west,s,y+3.5+offset,n);part('court-tree-foliage',Array.from({length:attribute.count},(_,i)=>new THREE.Vector3(attribute.getX(i),attribute.getY(i)*.72,attribute.getZ(i)).multiplyScalar(radius).add(center)),0x61744b,'wood',trunk);}
   crown.dispose();soil.name='court-planter';
 }
 const meshes=batches.map(b=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(b.colors,3));g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:b.glass?.3:.85,side:THREE.DoubleSide}));mesh.name=b.glass?'engineering3033-glass':'engineering3033-surfaces';mesh.castShadow=!b.glass;mesh.receiveShadow=true;shell.add(mesh);return mesh;});
 shell.userData.engineering3033Access={buildingIds:[ENGINEERING30_ID,ENGINEERING33_ID],pavementMasks,routes:q.routes,bounds:q.bounds,lower:q.lower,upper:q.upper,bridgeClearance:q.bridgeFloor-q.upper,dimensionsEstimated:true,wholeInteriorImplemented:false,geometry:{meshes:meshes.length,triangles:batches.reduce((n,b)=>n+b.positions.length/9,0),colliders:breakables.length}};
 function update(_player:THREE.Vector3){batches.forEach((b,index)=>{const a=meshes[index].geometry.attributes.position as THREE.BufferAttribute,c=meshes[index].geometry.attributes.color as THREE.BufferAttribute;let moved=false,tinted=false;for(const p of b.parts){if(p.shown!==p.proxy.visible){p.shown=p.proxy.visible;moved=true;if(p.shown)(a.array as Float32Array).set(p.original,p.start);else for(let i=p.start;i<p.end;i+=3){a.array[i]=p.proxy.position.x;a.array[i+1]=p.proxy.position.y;a.array[i+2]=p.proxy.position.z;}}if(p.color!==p.proxy.material.color.getHex()){p.color=p.proxy.material.color.getHex();tinted=true;const t=p.proxy.material.color,scale=[t.r/p.base.r,t.g/p.base.g,t.b/p.base.b];for(let i=p.start;i<p.end;i++)c.array[i]=p.colors[i-p.start]*scale[(i-p.start)%3];}}if(moved)a.needsUpdate=true;if(tinted)c.needsUpdate=true;});shell.visible=batches.some(b=>b.parts.some(p=>p.proxy.visible));}
 return{shell,breakables,update};
}

