import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import { humanities23Frame } from './humanities23Site';
import { EDUCATION1112, education1112Point as point } from './education1112Site';
type XZ=[number,number];
type XYZ=[number,number,number];
type Frame=ReturnType<typeof humanities23Frame>;
type Proxy=THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
/** 설계자 사진의 유리 홀, 내부 단차와 두 층 연결을 지도 좌표에 맞춘 근사다. */
export function createEducation1112Connection(scene:THREE.Scene,datum:{lower:number;terrace:number},floor11:number){
 const shell=new THREE.Group();shell.name='landmark/education1112-connection';Object.assign(shell.userData,{role:'building-shell',buildingId:EDUCATION1112.id});scene.add(shell);
  const breakables: BreakableSpec[] = [];
  const batches = [false, true].map(glass => ({ glass, positions: [] as number[], colors: [] as number[], parts: [] as { proxy: Proxy; start: number; end: number; original: Float32Array; colors: Float32Array; base: THREE.Color; color: number; shown: boolean }[] }));
  const at = (f: Frame, s: number, y: number, n = 0) => { const p = f.point(s, n); return new THREE.Vector3(p[0], y, p[1]); };
  function part(name: string, vertices: THREE.Vector3[], color: number, material: BreakableSpec['material'] = 'stone', owner?: Proxy, flat = false) {
    const bounds = new THREE.Box3().setFromPoints(vertices), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const g = flat ? new THREE.BufferGeometry() : new ConvexGeometry(vertices.map(p => p.clone().sub(center)));
    if (flat) { const values: number[] = []; for (let i = 1; i + 1 < vertices.length; i++) for (const p of [vertices[0], vertices[i], vertices[i + 1]]) values.push(...p.clone().sub(center).toArray()); g.setAttribute('position', new THREE.Float32BufferAttribute(values, 3)); }
    const attr = g.attributes.position, proxy = owner ?? new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color }));
    if (!owner) { proxy.position.copy(center); proxy.updateMatrixWorld(true); Object.assign(proxy.userData, { buildingId: EDUCATION1112.id, component: name, renderProxy: true, convex: true }); breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attr.array), toughness: material === 'glass' ? 2 : 8, material, label: '11동과 12동 연결 홀' }); }
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
 const baseFrame=humanities23Frame(point(0,0),point(1,0)),f={...baseFrame,point},lower=datum.lower,upper=datum.terrace,cafe=lower+.96;
 const floorTriangles:{component:string;vertices:XYZ[]}[]=[],pavementMasks:{component:string;polygon:XZ[]}[]=[],routes:Record<string,XYZ[]>={};
 const rect=(u0:number,u1:number,v0:number,v1:number):XZ[]=>[point(u0,v0),point(u1,v0),point(u1,v1),point(u0,v1)];
 const v3=(p:XZ,y:number)=>new THREE.Vector3(p[0],y,p[1]);
 const xyz=(u:number,v:number,y:number):XYZ=>[point(u,v)[0],y,point(u,v)[1]];
 function slab(name:string,poly:XZ[],y:number,depth=.18,color=0xaaa99d,mask=false){
   for(const t of THREE.ShapeUtils.triangulateShape(poly.map(p=>new THREE.Vector2(...p)),[])){const top=t.map(i=>v3(poly[i],y));part(name,[...top,...top.map(p=>p.clone().add(new THREE.Vector3(0,-depth,0)))],color);floorTriangles.push({component:name,vertices:top.map(p=>p.toArray() as XYZ)});}
   if(mask)pavementMasks.push({component:name,polygon:poly});
 }
 function ramp(name:string,u0:number,u1:number,v0:number,v1:number,y0:number,y1:number){const top=[v3(point(u0,v0),y0),v3(point(u1,v0),y1),v3(point(u1,v1),y1),v3(point(u0,v1),y0)];for(const t of[[0,1,2],[0,2,3]]){const q=t.map(i=>top[i]);part(name,[...q,...q.map(p=>p.clone().add(new THREE.Vector3(0,-.18,0)))],0xa7aaa1);floorTriangles.push({component:name,vertices:q.map(p=>p.toArray() as XYZ)});}}
 function rail(u0:number,u1:number,v:number,y0:number,y1=y0){const owner=beam('hall-rail-post',at(f,u0,y0,v),at(f,u0,y0+1.05,v),.035,0xbfc7be);for(const h of[.25,.62,1.05])beam('hall-horizontal-rail',at(f,u0,y0+h,v),at(f,u1,y1+h,v),.025,0xbfc7be,owner);for(let u=u0+1.5;u<=u1;u+=1.5){const y=y0+(y1-y0)*(u-u0)/(u1-u0);beam('hall-rail-post',at(f,u,y,v),at(f,u,y+1.05,v),.03,0xbfc7be,owner);}}
 function glassWall(a:XZ,b:XZ,y0:number,y1:number){const g=humanities23Frame(a,b),cells=Math.ceil(g.length/2.3);for(let i=0;i<cells;i++){const a=i*g.length/cells,b=(i+1)*g.length/cells,owner=box('hall-curtain-glass',g,a,b,-.04,.04,y0,y1,0x7f9e94,'glass');for(const s of[a,b])box('curtain-mullion',g,s-.035,s+.035,-.08,.08,y0,y1,0xa4b3aa,'metal',owner);for(let y=y0;y<y1;y+=1.3)box('curtain-transom',g,a,b,-.08,.08,y,y+.05,0xa4b3aa,'metal',owner);}}
 slab('hall-ground-floor',EDUCATION1112.hall,lower,.22,0x969b91,true);
 slab('hall-roof',EDUCATION1112.hall,upper+4.2,.22,0xadb3a9);
 glassWall(EDUCATION1112.hall[0],EDUCATION1112.hall[1],lower,upper+4.0);
 // 사진에 가려진 남동쪽 연결실 경계는 장식 없는 벽으로 근사한다.
 const endWall=humanities23Frame(EDUCATION1112.hall[3],EDUCATION1112.hall[4]);
 box('estimated-connection-end-wall',endWall,0,endWall.length,-.12,.12,lower-.2,upper+4.2,0xb0b5a8);
 const front=humanities23Frame(EDUCATION1112.hall[0],EDUCATION1112.hall[1]);
 slab('hall-courtyard-brick-paving',[front.point(0,2.2),front.point(front.length,2.2),front.point(front.length,0),front.point(0,0)],lower-.025,.2,0xa27f65,true);
 const paving=box('paving-edge',front,0,front.length,2.2,2.25,lower-.2,lower-.025,0x969b8b);
 for(let s=0;s<front.length;s+=.6)box('paving-joint',front,s,s+.008,0,2.2,lower-.024,lower-.022,0x6d7265,'stone',paving);
 for(let n=.3;n<2.2;n+=.3)box('paving-cross-joint',front,0,front.length,n,n+.008,lower-.024,lower-.022,0x6d7265,'stone',paving);
 // 1층 내부 단차와 2층 계단을 구분한다. 단수와 치수는 게임 근사다.
 slab('raised-book-cafe',rect(-18.5,-9,8,21),cafe,.20,0x92998d);
 for(let i=0;i<6;i++){const u0=-21.5+i*.5,y=lower+.16*(i+1),owner=box('cafe-step',f,u0,u0+.5,8,21,lower-.16,y,0xabb1a5);box('stair-nosing',f,u0,u0+.055,8,21,y,y+.002,0xc4c6b5,'stone',owner);}
 for(let i=0;i<14;i++){const u0=-16+i*.5,y=cafe+(upper-cafe)*(i+1)/14;box('hall-main-stair',f,u0,u0+.5,4,6.6,y-.18,y,0xa9afa4);}
 slab('stair-lower-landing',rect(-17.4,-16,4,8.5),cafe,.18,0x92998d);
 slab('cafe-stair-link',rect(-18.5,-16,4,8),cafe,.18,0x92998d);
 for(const v of[3.85,6.75])rail(-16,-9,v,cafe,upper);
 slab('hall-upper-corridor',rect(-9,8.8,2.2,6.8),upper,.22,0x9b9f93);
 slab('hall-upper-end-corridor',rect(2.8,8.8,-17,2.2),upper,.22,0x9b9f93);
 rail(-9,8.8,6.9,upper);rail(-9,2.8,2.1,upper);
 ramp('upper-door-ramp',0,2.8,-10.5,-7.5,floor11+3.5,upper);
 slab('upper-11-vestibule',rect(-4,0,-10.5,-7.5),floor11+3.5,.18,0xb5b4a8);
 ramp('lower-end-door-ramp',0,2.8,-15.5,-12.5,floor11,lower);
 slab('lower-end-11-vestibule',rect(-4,0,-15.5,-12.5),floor11,.18,0xb5b4a8);
 slab('lower-side-11-vestibule',rect(-11.5,-8.5,-4,1.2),floor11,.18,0xb5b4a8);
 for(const [u0,u1,v0,v1,y]of[[-4,0,-10.5,-7.5,floor11+3.5],[-4,0,-15.5,-12.5,floor11]]){for(const v of[v0,v1])box('connection-vestibule-side',f,u0,u1,v-.06,v+.06,y,y+2.85,0xc4c6b9);box('connection-vestibule-back',f,u0-.08,u0,v0,v1,y,y+2.85,0xc4c6b9);}
 for(const u of[-11.5,-8.5])box('connection-side-room-wall',f,u-.06,u+.06,-4,0,floor11,floor11+2.85,0xc4c6b9);
 box('connection-side-room-back',f,-11.5,-8.5,-4.1,-4,floor11,floor11+2.85,0xc4c6b9);
 const doors=[{frame:humanities23Frame(point(0,0),point(0,-1)),s:14,y:floor11},{frame:humanities23Frame(point(0,0),point(0,-1)),s:9,y:floor11+3.5},{frame:humanities23Frame(point(-10,0),point(-9,0)),s:0,y:floor11}];
 for(const d of doors){for(const s of[d.s-1.3,d.s+1.3]){const owner=box('connection-door-jamb',d.frame,s-.045,s+.045,-.16,.16,d.y,d.y+2.7,0xbdc5b8,'metal');box('open-connection-leaf',d.frame,s-.025,s+.025,.18,1.2,d.y+.07,d.y+2.6,0x79968c,'glass',owner);}box('connection-door-header',d.frame,d.s-1.34,d.s+1.34,-.16,.16,d.y+2.7,d.y+2.82,0xbdc5b8,'metal');}
 const ea:XZ=[552.48,-747.27],eb:XZ=[562.77,-728.56],ef=humanities23Frame(ea,eb),es=ef.length*.60;
 for(const side of[-1,1]){const s=es+side*1.5,owner=box('north-entry-frame',ef,s-.045,s+.045,-.95,-.65,lower,lower+2.72,0xbcc6b9,'metal');box('north-entry-open-leaf',ef,s-.025,s+.025,-2.3,-.9,lower+.06,lower+2.65,0x79968c,'glass',owner);}
 box('north-entry-header',ef,es-1.55,es+1.55,.65,.95,lower+2.66,lower+2.77,0xbcc6b9,'metal');
 slab('north-entry-paving',[ef.point(es-2,2.5),ef.point(es+2,2.5),ef.point(es+2,-1.2),ef.point(es-2,-1.2)],lower,.22,0xa88168,true);
 for(const [u,v]of[[-12,13],[-12,18]]){const table=box('cafe-table',f,u-.65,u+.65,v-.45,v+.45,cafe+.68,cafe+.75,0x4a5147,'wood');for(const du of[-.52,.52])for(const dv of[-.33,.33])box('table-leg',f,u+du-.025,u+du+.025,v+dv-.025,v+dv+.025,cafe,cafe+.68,0x3a443a,'metal',table);for(const dv of[-.95,.95]){box('cafe-chair',f,u-.22,u+.22,v+dv-.22,v+dv+.22,cafe+.4,cafe+.45,0x4a5147,'wood',table);box('chair-back',f,u-.22,u+.22,v+dv+.18,v+dv+.23,cafe+.45,cafe+.88,0x4a5147,'wood',table);}}
 routes.northEntry=[2,-.2,-1.4,-4].map(n=>{const p=ef.point(es,n);return[p[0],lower,p[1]];});
 routes.lowerSide=[xyz(-10,3,lower),xyz(-10,.8,lower),xyz(-10,-.5,floor11),xyz(-10,-2.6,floor11)];
 routes.lowerEnd=[xyz(5,-14,lower),xyz(2.8,-14,lower),xyz(0,-14,floor11),xyz(-2.7,-14,floor11)];
 routes.upperEnd=[xyz(7,-9,upper),xyz(2.8,-9,upper),xyz(0,-9,floor11+3.5),xyz(-2.7,-9,floor11+3.5)];
 routes.cafeSteps=[xyz(-22,12,lower),...Array.from({length:6},(_,i)=>xyz(-21.25+i*.5,12,lower+.16*(i+1))),xyz(-17.2,12,cafe)];
 routes.mainStair=[xyz(-16.8,5.3,cafe),...Array.from({length:14},(_,i)=>xyz(-15.75+i*.5,5.3,cafe+(upper-cafe)*(i+1)/14)),xyz(-7.8,5.3,upper)];
 routes.upperToEnd=[xyz(-7.8,5.3,upper),xyz(5.6,5.3,upper),xyz(5.6,-9,upper),...routes.upperEnd.slice(1)];
 routes.northToUpper=[...routes.northEntry,xyz(-22,23,lower),xyz(-22,12,lower),...routes.cafeSteps.slice(1),xyz(-17.2,5.3,cafe),...routes.mainStair.slice(1),...routes.upperToEnd.slice(1)];
 const meshes=batches.map(b=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(b.colors,3));g.computeVertexNormals();g.computeBoundingSphere();const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:b.glass?.25:.77,side:THREE.DoubleSide,transparent:b.glass,opacity:b.glass?.46:1}));mesh.name=b.glass?'education1112-glass':'education1112-surfaces';mesh.castShadow=!b.glass;mesh.receiveShadow=true;shell.add(mesh);return mesh;});
 shell.userData.education1112Access={routes,floorTriangles,pavementMasks,lower,upper,cafe,floor11,dimensionsEstimated:true,doorsObserved:3,wholeInteriorModeled:false,geometry:{meshes:meshes.length,triangles:batches.reduce((n,b)=>n+b.positions.length/9,0),colliders:breakables.length,textures:0}};
 function update(_player:THREE.Vector3){batches.forEach((b,index)=>{const a=meshes[index].geometry.attributes.position as THREE.BufferAttribute,c=meshes[index].geometry.attributes.color as THREE.BufferAttribute;let moved=false,tinted=false;for(const p of b.parts){if(p.shown!==p.proxy.visible){p.shown=p.proxy.visible;moved=true;if(p.shown)(a.array as Float32Array).set(p.original,p.start);else for(let i=p.start;i<p.end;i+=3){a.array[i]=p.proxy.position.x;a.array[i+1]=p.proxy.position.y;a.array[i+2]=p.proxy.position.z;}}if(p.color!==p.proxy.material.color.getHex()){p.color=p.proxy.material.color.getHex();tinted=true;const t=p.proxy.material.color,scale=[t.r/p.base.r,t.g/p.base.g,t.b/p.base.b];for(let i=p.start;i<p.end;i++)c.array[i]=p.colors[i-p.start]*scale[(i-p.start)%3];}}if(moved)a.needsUpdate=true;if(tinted)c.needsUpdate=true;});shell.visible=batches.some(b=>b.parts.some(p=>p.proxy.visible));}
 // 렌더 버퍼와 복원용 사본을 만든 뒤 조립용 배열을 비운다.
 for(const batch of batches){batch.positions.length=0;batch.colors.length=0;}
 return {shell,breakables,update};
}
