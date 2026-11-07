import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import type { CampusBuilding } from './fullCampus';
import { humanities23Frame } from './humanities23Site';
import type { Education1320Layout } from './education1320Site';
type XZ=[number,number];type XYZ=[number,number,number];type Frame=ReturnType<typeof humanities23Frame>;type Proxy=THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
/** 2026년 7월 로드뷰의 연결교, 열린 하부와 계단을 근사한다. */
export function createEducation1320Connection(scene:THREE.Scene,building:CampusBuilding,q:Education1320Layout){
 const shell=new THREE.Group();shell.name='landmark/education1320-connection';Object.assign(shell.userData,{role:'building-shell',buildingId:building.id,mappedOutline:building.points});scene.add(shell);
 const distant=new THREE.Group();distant.name=building.id+':education1320-distant';distant.visible=false;Object.assign(distant.userData,{role:'distant-building',buildingId:building.id});scene.add(distant);
  const breakables: BreakableSpec[] = [];
  const batches = [false, true].map(glass => ({ glass, positions: [] as number[], colors: [] as number[], parts: [] as { proxy: Proxy; start: number; end: number; original: Float32Array; colors: Float32Array; base: THREE.Color; color: number; shown: boolean }[] }));
  const at = (f: Frame, s: number, y: number, n = 0) => { const p = f.point(s, n); return new THREE.Vector3(p[0], y, p[1]); };
  function part(name: string, vertices: THREE.Vector3[], color: number, material: BreakableSpec['material'] = 'stone', owner?: Proxy, flat = false) {
    const bounds = new THREE.Box3().setFromPoints(vertices), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const g = flat ? new THREE.BufferGeometry() : new ConvexGeometry(vertices.map(p => p.clone().sub(center)));
    if (flat) { const values: number[] = []; for (let i = 1; i + 1 < vertices.length; i++) for (const p of [vertices[0], vertices[i], vertices[i + 1]]) values.push(...p.clone().sub(center).toArray()); g.setAttribute('position', new THREE.Float32BufferAttribute(values, 3)); }
    const attr = g.attributes.position, proxy = owner ?? new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color }));
    if (!owner) { proxy.position.copy(center); proxy.updateMatrixWorld(true); Object.assign(proxy.userData, { buildingId: building.id, component: name, renderProxy: true, convex: true }); breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attr.array), toughness: material === 'glass' ? 2 : 8, material, label: '13동과 20동 연결교' }); }
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

 const routes:Record<string,XYZ[]>={},pavementMasks:{component:string;polygon:XZ[]}[]=[],f=q.stair;
 const xyz=(s:number,y:number,n=0):XYZ=>at(f,s,y,n).toArray() as XYZ;
 function floorPolygon(name:string,polygon:XZ[],y:number,depth=.2,color=0xb4b6ad){for(const t of THREE.ShapeUtils.triangulateShape(polygon.map(p=>new THREE.Vector2(...p)),[])){const top=t.map(i=>new THREE.Vector3(polygon[i][0],y,polygon[i][1]));part(name,[...top,...top.map(p=>p.clone().add(new THREE.Vector3(0,-depth,0)))],color);}}
 floorPolygon('bridge-floor',q.polygon,q.floor,.28);floorPolygon('bridge-roof',q.polygon,q.roof,.2,0xd0d4cb);
 for(const [a,b] of [[q.polygon[0],q.polygon[1]],[q.polygon[2],q.polygon[3]]] as [XZ,XZ][]){const frame=humanities23Frame(a,b),count=Math.ceil(frame.length/1.6);
  for(let i=0;i<count;i++){const s0=i*frame.length/count,s1=(i+1)*frame.length/count,lower=box('bridge-white-panel',frame,s0,s1,-.12,.12,q.floor,q.floor+.72,0xd3d8cf),upper=box('bridge-white-header',frame,s0,s1,-.14,.14,q.floor+2.7,q.roof,0xd8dcd3);
   for(const n of[-.126,.126])for(const y of[q.floor+.28,q.floor+.7])facet('cladding-horizontal-seam',frame,s0+.01,s1-.01,y,y+.009,n,0x8f9d92,lower);
   const glass=box('bridge-window',frame,s0+.04,s1-.04,-.055,.055,q.floor+.77,q.floor+2.65,0x7a9a8f,'glass');
   for(const s of[s0,s1,(s0+s1)/2])box('bridge-window-mullion',frame,s-.03,s+.03,-.14,.14,q.floor+.72,q.floor+2.7,0xa4b8aa,'metal',glass);
   for(const y of[q.floor+.75,q.floor+1.4,q.floor+2.15,q.floor+2.68])box('bridge-window-transom',frame,s0,s1,-.14,.14,y-.03,y+.03,0xb4c3b6,'metal',glass);
   box('cladding-vertical-seam',frame,s0,s0+.012,-.15,.15,q.floor+2.75,q.roof-.04,0x9ba99b,'stone',upper);
  }
 }
 // 양쪽 짧은 현관까지만 연결한다. 나머지 실내는 모델링하지 않는다.
 for(const [name,frame,s,side] of [['13',q.door13,q.s13,1],['20',q.door20,q.s20,-1]] as [string,Frame,number,number][]){const n0=Math.min(0,side*3.2),n1=Math.max(0,side*3.2);
  box('bridge-vestibule-floor',frame,s-1.4,s+1.4,n0-.1,n1+.1,q.floor-.2,q.floor,0xc0c2b7);
  for(const u of[s-1.4,s+1.4]){box('bridge-vestibule-side',frame,u-.08,u+.08,n0,n1,q.floor,q.floor+2.85,0xc8cdc1);const owner=box('bridge-door-jamb',frame,u-.05,u+.05,-.4,.4,q.floor,q.floor+2.8,0xb2c0b3,'metal');box('bridge-open-door',frame,u-.028,u+.028,Math.min(side*.45,side*1.5),Math.max(side*.45,side*1.5),q.floor+.06,q.floor+2.68,0x6f9687,'glass',owner);}
  box('bridge-door-header',frame,s-1.45,s+1.45,-.4,.4,q.floor+2.72,q.floor+2.82,0xb3c0b3,'metal');
  box('bridge-vestibule-back',frame,s-1.4,s+1.4,side*3.2-.08,side*3.2+.08,q.floor,q.floor+2.85,0xc3c9bd);
  box('bridge-vestibule-ceiling',frame,s-1.4,s+1.4,n0,n1,q.floor+2.85,q.floor+3,0xd4d9ce);
  routes['door'+name]=[at(frame,s,q.floor,-side*1.1).toArray(),at(frame,s,q.floor,side*2.5).toArray()] as XYZ[];
 }
 routes.bridge=[routes.door20[1],routes.door20[0],routes.door13[0],routes.door13[1]];
 const samples:XYZ[]=[xyz(0,q.lo)];
 for(let k=1;k<q.profile.length;k++){const a=q.profile[k-1],b=q.profile[k],rise=b.y-a.y,steps=Math.abs(rise)<.001?1:Math.ceil(Math.abs(rise)/.17);
  for(let i=0;i<steps;i++){const s0=a.s+(b.s-a.s)*i/steps,s1=a.s+(b.s-a.s)*(i+1)/steps,y=a.y+rise*(i+1)/steps,half=k===1?1.1:q.width/2,component=Math.abs(rise)<.001?'underpass-paving':k===2?'front-step':'rear-stair-tread',owner=box(component,f,s0,s1,-half,half,y-.22,y,0xb6b9ad);
   if(steps>1)box('stair-nosing',f,s0,s0+.04,-half,half,y,y+.005,0xd9dbcc,'stone',owner);
   else{for(let s=s0;s<s1;s+=.6)box('paving-joint',f,s,s+.008,-half,half,y,y+.002,0x899385,'stone',owner);for(let n=-half;n<half;n+=.6)box('paving-joint',f,s0,s1,n,n+.008,y,y+.002,0x899385,'stone',owner);}
   samples.push(xyz((s0+s1)/2,y));
  }
 }
 samples.push(xyz(f.length,q.hi));routes.underpassStairs=samples;
 pavementMasks.push({component:'underpass-stairs',polygon:[f.point(0,-1.1),f.point(6.3,-1.1),f.point(6.3,-q.width/2),f.point(f.length,-q.width/2),f.point(f.length,q.width/2),f.point(6.3,q.width/2),f.point(6.3,1.1),f.point(0,1.1)]});
 for(const side of[-1,1]){const n=side*(q.width/2+.1);for(let s=18.2;s<f.length-.6;s+=2.2){const end=Math.min(s+2.2,f.length-.6),y0=q.ground(s),y1=q.ground(end),post=beam('rear-stair-rail-post',at(f,s,y0,n),at(f,s,y0+.95,n),.04,0xa7b2a4);beam('rear-stair-handrail',at(f,s,y0+.95,n),at(f,end,y1+.95,n),.04,0xa7b2a4,post);}
  const n0=side<0?-q.width/2-.4:q.width/2,n1=n0+.4;box('underpass-white-pier',f,12.1,12.65,n0,n1,q.landing-.1,q.floor,0xd0d7ca);
 }
 const drain=box('front-drain',f,6.0,6.22,-q.width/2,q.width/2,q.lo-.03,q.lo+.003,0x526359,'metal');for(let n=-q.width/2;n<q.width/2;n+=.15)box('drain-grating',f,6.0,6.22,n,n+.025,q.lo+.004,q.lo+.012,0x9eafa1,'metal',drain);
 const meshes=batches.map(b=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(b.colors,3));g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:b.glass?.25:.76,side:THREE.DoubleSide,transparent:b.glass,opacity:b.glass?.5:1}));mesh.name=b.glass?'education1320-glass':'education1320-surfaces';mesh.castShadow=!b.glass;mesh.receiveShadow=true;shell.add(mesh);return mesh;});
 shell.userData.education1320Access={buildingId:building.id,routes,pavementMasks,floor:q.floor,roof:q.roof,ground:q.profile,polygon:q.polygon,depth:q.depth,stairWidth:q.width,underpassHeadroom:q.floor-.28-q.landing,dimensionsEstimated:true,depthEstimated:true,wholeInteriorImplemented:false,rawOutlinePreserved:true,roadviewMonth:'2026-07',geometry:{meshes:2,textures:0,triangles:batches.reduce((n,b)=>n+b.positions.length/9,0),colliders:breakables.length}};
 function update(_player:THREE.Vector3){batches.forEach((b,index)=>{const a=meshes[index].geometry.attributes.position as THREE.BufferAttribute,c=meshes[index].geometry.attributes.color as THREE.BufferAttribute;let moved=false,tinted=false;for(const p of b.parts){if(p.shown!==p.proxy.visible){p.shown=p.proxy.visible;moved=true;if(p.shown)(a.array as Float32Array).set(p.original,p.start);else for(let i=p.start;i<p.end;i+=3){a.array[i]=p.proxy.position.x;a.array[i+1]=p.proxy.position.y;a.array[i+2]=p.proxy.position.z;}}if(p.color!==p.proxy.material.color.getHex()){p.color=p.proxy.material.color.getHex();tinted=true;const t=p.proxy.material.color,scale=[t.r/p.base.r,t.g/p.base.g,t.b/p.base.b];for(let i=p.start;i<p.end;i++)c.array[i]=p.colors[i-p.start]*scale[(i-p.start)%3];}}if(moved)a.needsUpdate=true;if(tinted)c.needsUpdate=true;});shell.visible=batches.some(b=>b.parts.some(p=>p.proxy.visible));}
 // 렌더 버퍼와 복원용 사본을 만든 뒤 조립용 배열을 비운다.
 for(const batch of batches){batch.positions.length=0;batch.colors.length=0;}
 return {shell,breakables,update};
}
