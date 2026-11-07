import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import { humanities23Frame } from './humanities23Site';
import { physics561SurfaceHeight } from './physics561Site';
import { ENGINEERING38_ID, type Engineering38Layout } from './engineering38Site';
type XZ=[number,number];type Frame=ReturnType<typeof humanities23Frame>;type Proxy=THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
export function createEngineering38Access(scene:THREE.Scene,q:Engineering38Layout){
 const shell=new THREE.Group();shell.name='landmark/engineering38-access';Object.assign(shell.userData,{role:'building-shell',buildingId:ENGINEERING38_ID,buildingIds:[ENGINEERING38_ID]});scene.add(shell);


 let partBuilding=ENGINEERING38_ID;
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
    if (!owner) { proxy.position.copy(center); proxy.updateMatrixWorld(true); Object.assign(proxy.userData, { buildingId: partBuilding, component: name, renderProxy: true, convex: true }); breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attr.array), toughness: material === 'glass' ? 2 : 8, material, label: '38동 필로티와 선큰 마당' }); }
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






 function rail(frame:Frame,s0:number,n0:number,s1:number,n1:number,y0:number,y1=y0,name='metal-railing'){
   const owner=beam(name,at(frame,s0,y0+1.02,n0),at(frame,s1,y1+1.02,n1),.027,metal);
   for(const dy of[.45,.7])beam(name+'-middle',at(frame,s0,y0+dy,n0),at(frame,s1,y1+dy,n1),.022,metal,owner);
   const count=Math.max(1,Math.ceil(Math.hypot(s1-s0,n1-n0)/1.2));for(let i=0;i<=count;i++){const t=i/count,s=s0+(s1-s0)*t,n=n0+(n1-n0)*t,y=y0+(y1-y0)*t;beam(name+'-post',at(frame,s,y,n),at(frame,s,y+1.02,n),.025,metal,owner);}return owner;
 }

 const f=q.axis,y=q.floor,low=q.lower,metal=0x8d9995,white=0xc4ccc7,glass=0x557d82;
 const pavementMasks:{component:string;polygon:XZ[]}[]=[];
 for(const a of q.surfaces){
   const h=(s:number,n:number)=>physics561SurfaceHeight(a,s,n),corners=[[a.s0,a.n0],[a.s1,a.n0],[a.s1,a.n1],[a.s0,a.n1]],top=corners.map(([s,n])=>at(a.frame,s,h(s,n),n));
   const step=a.name.includes('stair')&&!a.name.includes('join')&&!a.name.includes('turn'),road=a.name==='north-road-sidewalk',owner=part(a.name,[...top,...top.map(p=>p.clone().add(new THREE.Vector3(0,-.18,0)))],road?0xa69e91:0xa5afa9);
   pavementMasks.push({component:a.name,polygon:corners.map(([s,n])=>a.frame.point(s,n))});
   if(step){const horizontal=a.name.includes('sunken-');const ns=horizontal?a.n0:a.n0+.045,ss=horizontal?a.s0+.045:a.s1;part('stair-nosing',[at(f,a.s0,a.y0+.004,a.n0),at(f,ss,a.y0+.004,a.n0),at(f,ss,a.y0+.004,horizontal?a.n1:ns),at(f,a.s0,a.y0+.004,horizontal?a.n1:ns)],0xd8ddd1,'stone',owner,true);continue;}
   const deck=a.name==='west-piloti-paving',span=deck?.3:road?.5:1.15;
   for(let s=a.s0;s<a.s1-.02;s+=span)for(let n=a.n0;n<a.n1-.02;n+=deck?3.2:span){const e=Math.min(a.s1,s+span-.016),t=Math.min(a.n1,n+(deck?3.2:span)-.016);if(e-s<.02||t-n<.02)continue;part('paving-joint-cell',[at(f,s,h(s,n)+.004,n),at(f,e,h(e,n)+.004,n),at(f,e,h(e,t)+.004,t),at(f,s,h(s,t)+.004,t)],deck?0x817465:road?0xb6afa3:Math.floor(s/2.3)%3===0?0x8c9993:0xb8c0b6,'stone',owner,true);}
 }
 const face=(s0:number,n0:number,s1:number,n1:number)=>humanities23Frame(f.point(s0,n0),f.point(s1,n1));
 function glazing(name:string,frame:Frame,bottom:number,top:number,doorAt=-100){
   const count=Math.max(1,Math.ceil(frame.length/2.3));
   for(let i=0;i<count;i++){const a=frame.length*i/count,b=frame.length*(i+1)/count,door=doorAt>=a&&doorAt<=b,owner=box(door?'entry-glass-door':name,frame,a+.035,b-.035,-.06,.06,bottom+.025,top,glass,'glass');
     for(const s of[a,b])box('silver-glazing-mullion',frame,s-.035,s+.035,-.12,.08,bottom,top,metal,'metal',owner);
     for(const h of[bottom+.05,bottom+1.1,top-.035])box('silver-glazing-transom',frame,a,b,-.12,.08,h,h+.045,metal,'metal',owner);
     if(door)box('entry-door-handle',frame,(a+b)/2-.025,(a+b)/2+.025,-.24,-.12,bottom+.9,bottom+1.4,white,'metal',owner);
   }
 }
 // 서쪽 로비와 카페, 동쪽 소형 코어만 저층을 채우고 가운데 필로티를 비운다.
 const westFaces=[face(24,-5.2,5.2,-5.2),face(5.2,-5.2,5.2,-43),face(5.2,-43,24,-43),face(24,-43,24,-31),face(24,-19,24,-5.2)];
 for(const [i,wall]of westFaces.entries()){
   if(i===0){glazing('west-cafe-ground-glazing',face(14,-5.2,5.2,-5.2),y,y+4.15);glazing('entry-upper-glazing',face(24,-5.2,14,-5.2),y+3.1,y+4.15);}
   else glazing('west-cafe-ground-glazing',wall,y,y+4.15);
   glazing('west-office-upper-glazing',wall,y+4.4,y+9.25);
   box('west-block-floor-band',wall,0,wall.length,-.15,.15,y+4.15,y+4.4,white);
 }
 box('west-office-floor',f,5.2,24,-43,-5.2,y+4.15,y+4.4,white);
 const entry=q.entry,header=box('entry-sign-header',entry,0,10,-.18,.06,y+2.75,y+3.1,0x475955,'metal');
 for(const [a,b,door]of[[0,1.1,0],[1.1,2.8,1],[2.8,4.5,1],[4.5,5.3,0],[5.3,7,1],[7,8.7,1],[8.7,10,0]]){
   const pane=box(door?'entry-glass-door':'entry-fixed-pane',entry,a+.035,b-.035,-.06,.06,y+.025,y+2.75,glass,'glass');
   for(const s of[a,b])box('entry-silver-door-frame',entry,s-.035,s+.035,-.12,.08,y,y+2.75,white,'metal',pane);
   for(const h of[y+.04,y+2.7])box('entry-door-crossbar',entry,a,b,-.12,.08,h,h+.045,white,'metal',pane);
   if(door)box('entry-door-handle',entry,(a+b)/2-.025,(a+b)/2+.025,-.24,-.12,y+.9,y+1.4,white,'metal',pane);
 }
 label('entry-English-sign','Global Education Center for Engineers',entry,5,-.2,y+2.92,9.5,.28,header,'#475955','#f4f4e7');
 const number=box('north-building-number-board',f,1.8,4.8,.02,.14,y+21.3,y+23,0x2a7998,'metal');
 label('north-building-number','38',face(4.8,.15,1.8,.15),1.5,-.02,y+22.15,2.3,1.5,number,'#2a7998','#f5f5ed');
 const cafe=box('cafe-sign-board',westFaces[1],8,14,-.15,-.02,y+2.6,y+3.1,0x233e37,'metal');
 label('cafe-reference-sign','the Café bbq',westFaces[1],11,-.17,y+2.85,5.6,.42,cafe,'#233e37','#f0eee0');
 for(const xx of[62.2,69.5])box('east-core-side',f,xx,xx+.18,-30,-18,y,y+9.4,0x9faeab);
 for(const nn of[-30,-18])box('east-core-end',f,62.2,69.7,nn,nn+.18,y,y+9.4,0xa8b3ae);
 for(const s of[16.2,41.8,49.4,64.6])for(const n of[-17,-33]){
   if(s>60&&n>-30&&n<-18)continue;
   const bottom=s>28&&s<44&&n<=-17?low:y;
   beam('interior-round-column',at(f,s,bottom,n),at(f,s,y+9.4,n),.46,0xd7ddd5);
 }
 const curve:XZ[]=[[24,-31],[26,-29.5],[27,-25.5],[26,-21],[24,-19]];
 for(let i=0;i+1<curve.length;i++){
   const wall=face(...curve[i],...curve[i+1]);glazing('curved-elevator-core-glazing',wall,low,y+4.15);glazing('curved-core-upper-glazing',wall,y+4.4,y+9.25);box('curved-core-concrete-band',wall,0,wall.length,-.16,.16,y+4.15,y+4.4,white);
 }
 // 선큰 바닥을 둘러싼 하부 유리와 위층 보행로를 분리한다.
 for(const wall of[face(28,-17,28,-34),face(28,-34,44,-34),face(44,-34,44,-17)])glazing('sunken-lower-glazing',wall,low,y-.25);
 for(const [s0,n0,s1,n1]of[[28,-17,28,-34],[28,-34,44,-34],[44,-34,44,-17],[37,-17,44,-17],[37,-14.3,37,-17],[27,-11.8,34,-11.8],[27,-16.5,28,-16.5],[34,-14.3,37,-14.3]])rail(f,s0,n0,s1,n1,y,y,'court-upper-railing');
 rail(f,28,-14.15,34,-14.15,low+1.8,y,'stair-inner-upper-rail');
 rail(f,28,-16.6,34,-16.6,low+1.8,low,'stair-lower-side-rail');
 rail(f,27,-11.8,27,-16.5,low+1.8,low+1.8,'stair-turn-rail');
 for(const s of[12.9,23.1])rail(f,s,4.5,s,1,q.entryLow,y,'entry-stair-handrail');
 for(const s of[35.4,43.6])rail(f,s,6.35,s,1,q.surfaces.find(a=>a.name==='mapped-north-central-stair')!.y0-(y-q.routes.centralApproach[0][1]),y,'mapped-stair-handrail');
 for(const [s,n]of[[30.5,-27],[40.5,-30]]){
   const owner=box('sunken-square-planter',f,s-.7,s+.7,n-.7,n+.7,low,low+.5,0x867968);
   box('planter-soil',f,s-.6,s+.6,n-.6,n+.6,low+.5,low+.53,0x555d43,'stone',owner);
   box('planter-shrub',f,s-.45,s+.45,n-.45,n+.45,low+.53,low+1.05,0x637553,'wood',owner);
 }
 const tactile=box('entry-tactile-paving',f,17.7,20.3,-4.6,-4.1,y+.005,y+.025,0xc5ae59);
 for(let s=17.85;s<20.2;s+=.18)for(let n=-4.5;n<-4.15;n+=.15)box('tactile-dot',f,s-.025,s+.025,n-.025,n+.025,y+.025,y+.045,0xd3be6b,'stone',tactile);
 for(const [s,n]of[[3.8,-10],[3.8,-18],[3.8,-28]]){
   const owner=box('cafe-terrace-table',f,s-.65,s+.65,n-.6,n+.6,y+.72,y+.79,0xb2aaa0,'wood');
   for(const ds of[-.5,.5])for(const dn of[-.45,.45])box('table-leg',f,s+ds-.025,s+ds+.025,n+dn-.025,n+dn+.025,y,y+.72,metal,'metal',owner);
   for(const dn of[-1.1,1.1]){
     const chair=box('terrace-white-chair',f,s-.3,s+.3,n+dn-.3,n+dn+.3,y+.42,y+.48,0xe0e0d4,'metal');
     box('chair-back',f,s-.3,s+.3,n+dn+(dn<0?-.3:.25),n+dn+(dn<0?-.25:.3),y+.48,y+.95,0xe0e0d4,'metal',chair);
     for(const ds of[-.25,.25])for(const dz of[-.25,.25])box('chair-leg',f,s+ds-.018,s+ds+.018,n+dn+dz-.018,n+dn+dz+.018,y,y+.42,0xcbd0c8,'metal',chair);
   }
 }
 const meshes=batches.map(b=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(b.colors,3));g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:b.glass?.3:.8,side:THREE.DoubleSide}));mesh.name=b.glass?'engineering38Access-glass':'engineering38Access-surfaces';mesh.castShadow=!b.glass;mesh.receiveShadow=true;shell.add(mesh);return mesh;});



 shell.userData.engineering38Access={buildingId:ENGINEERING38_ID,dimensionsEstimated:true,wholeInteriorImplemented:false,planOrientationEvidence:'south professor wing in 2015 architect article',upperStoreys:3,partialLowerStoreys:2,stairEndpointsEstimated:true,entryFloor:q.floor,sunkenFloor:q.lower,entryFrame:q.entry,routes:q.routes,pavementMasks,bounds:q.bounds,geometry:{meshes:meshes.length+signs.length,textures:signs.length,triangles:batches.reduce((n,b)=>n+b.positions.length/9,0)+signs.length*2,colliders:breakables.length}};
 function update(_player:THREE.Vector3){batches.forEach((b,index)=>{const a=meshes[index].geometry.attributes.position as THREE.BufferAttribute,c=meshes[index].geometry.attributes.color as THREE.BufferAttribute;let moved=false,tinted=false;for(const p of b.parts){if(p.shown!==p.proxy.visible){p.shown=p.proxy.visible;moved=true;if(p.shown)(a.array as Float32Array).set(p.original,p.start);else for(let i=p.start;i<p.end;i+=3){a.array[i]=p.proxy.position.x;a.array[i+1]=p.proxy.position.y;a.array[i+2]=p.proxy.position.z;}}if(p.color!==p.proxy.material.color.getHex()){p.color=p.proxy.material.color.getHex();tinted=true;const t=p.proxy.material.color,scale=[t.r/p.base.r,t.g/p.base.g,t.b/p.base.b];for(let i=p.start;i<p.end;i++)c.array[i]=p.colors[i-p.start]*scale[(i-p.start)%3];}}if(moved)a.needsUpdate=true;if(tinted)c.needsUpdate=true;});for(const s of signs)s.mesh.visible=s.owner.visible;shell.visible=batches.some(b=>b.parts.some(p=>p.proxy.visible));}
 // 렌더 버퍼와 복원용 사본을 만든 뒤 조립용 배열을 비운다.
 for(const batch of batches){batch.positions.length=0;batch.colors.length=0;}
 return{shell,breakables,update};
}
