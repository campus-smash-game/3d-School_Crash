import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import { humanities23Frame } from './humanities23Site';
import { physics561SurfaceHeight } from './physics561Site';
import { ENGINEERING35_ACCESS_ID, type Engineering35AccessLayout } from './engineering35AccessSite';
type XZ=[number,number];type Frame=ReturnType<typeof humanities23Frame>;type Proxy=THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
export function createEngineering35Access(scene:THREE.Scene,q:Engineering35AccessLayout){
 const shell=new THREE.Group();shell.name='landmark/engineering35-west-access';Object.assign(shell.userData,{role:'building-shell',buildingId:ENGINEERING35_ACCESS_ID,buildingIds:[ENGINEERING35_ACCESS_ID]});scene.add(shell);
 

 let partBuilding=ENGINEERING35_ACCESS_ID;
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
    if (!owner) { proxy.position.copy(center); proxy.updateMatrixWorld(true); Object.assign(proxy.userData, { buildingId: partBuilding, component: name, renderProxy: true, convex: true }); breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attr.array), toughness: material === 'glass' ? 2 : 8, material, label: '35동 서쪽 실험실과 테라스' }); }
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





 const f=q.axis,white=0xc8cdc4,metal=0x78857e,glass=0x536661;
 const pavementMasks:{component:string;polygon:XZ[]}[]=[];
 const slab=(a:typeof q.surfaces[number])=>{
   const h=(s:number,n:number)=>physics561SurfaceHeight(a,s,n),corners=[[a.s0,a.n0],[a.s1,a.n0],[a.s1,a.n1],[a.s0,a.n1]],top=corners.map(([s,n])=>at(a.frame,s,h(s,n),n)),road=a.name==='west-living-street'||a.name==='lab-vehicle-apron'||a.name==='lab-south-road-link',stair=a.name==='north-map-stair';
   const owner=part(a.name,[...top,...top.map(p=>p.clone().add(new THREE.Vector3(0,-.18,0)))],road?0x777d76:0xb3b8ae);
   if(q.surfaces.includes(a))pavementMasks.push({component:a.name,polygon:corners.map(([s,n])=>a.frame.point(s,n))});
   if(road){if(a.name==='west-living-street')for(const n of[a.n0+.1,a.n1-.16])part('road-white-edge',[at(a.frame,a.s0,h(a.s0,n)+.006,n),at(a.frame,a.s1,h(a.s1,n)+.006,n),at(a.frame,a.s1,h(a.s1,n+.06)+.006,n+.06),at(a.frame,a.s0,h(a.s0,n+.06)+.006,n+.06)],0xd9dbce,'stone',owner,true);return;}
   if(stair){part('stair-light-nosing',[at(a.frame,a.s0,a.y0+.004,a.n0),at(a.frame,a.s0+.045,a.y0+.004,a.n0),at(a.frame,a.s0+.045,a.y0+.004,a.n1),at(a.frame,a.s0,a.y0+.004,a.n1)],0xd6d1b9,'stone',owner,true);return;}
   for(let s=a.s0;s<a.s1;s+=.8)for(let n=a.n0;n<a.n1;n+=.8){const e=Math.min(a.s1,s+.785),t=Math.min(a.n1,n+.785);if(e-s<.015||t-n<.015)continue;part('pavement-joint-cell',[at(a.frame,s,h(s,n)+.004,n),at(a.frame,e,h(e,n)+.004,n),at(a.frame,e,h(e,t)+.004,t),at(a.frame,s,h(s,t)+.004,t)],0xc2c5b9,'stone',owner,true);}
 };
 for(const a of[...q.surfaces,...q.elevated])slab(a);
 function rail(frame:Frame,s0:number,n0:number,s1:number,n1:number,y0:number,y1=y0,name='metal-railing'){
   const owner=beam(name,at(frame,s0,y0+1.03,n0),at(frame,s1,y1+1.03,n1),.025,metal);
   beam(name+'-middle',at(frame,s0,y0+.52,n0),at(frame,s1,y1+.52,n1),.02,metal,owner);
   const count=Math.max(1,Math.ceil(Math.hypot(s1-s0,n1-n0)/1.5));for(let i=0;i<=count;i++){const t=i/count,s=s0+(s1-s0)*t,n=n0+(n1-n0)*t,y=y0+(y1-y0)*t;beam(name+'-post',at(frame,s,y,n),at(frame,s,y+1.03,n),.024,metal,owner);}return owner;
 }
 const cuts=[0,11,17,28,38,51,57,70];
 for(let i=0;i<cuts.length-1;i++){
   const s0=cuts[i],s1=cuts[i+1],door=q.garages.some(s=>(s0+s1)/2>s-3&&(s0+s1)/2<s+3);
   const lintel=box('lab-concrete-lintel',f,s0,s1,4.24,4.5,q.terraceFloor-.7,q.terraceFloor,white);
   for(let s=s0+.3;s<s1;s+=.43)box('concrete-weathering-streak',f,s,s+.025,4.502,4.508,q.terraceFloor-.65,q.terraceFloor-.12-(s%3)*.04,0x929b8e,'stone',lintel);
   if(door){
     const panel=box('lab-tall-closed-door',f,s0+.12,s1-.12,4.3,4.42,q.labFloor+.04,q.terraceFloor-.72,0xa8ada7,'metal');
     for(let s=s0+.12;s<s1;s+=.78)box('lab-door-vertical-seam',f,s,s+.014,4.424,4.43,q.labFloor+.08,q.terraceFloor-.76,0x89938b,'metal',panel);
     box('lab-door-crossbar',f,s0+.15,s1-.15,4.43,4.5,q.terraceFloor-1.85,q.terraceFloor-1.74,0x69776e,'metal',panel);
     box('lab-door-bottom-safety-strip',f,s0+.12,s1-.12,4.43,4.47,q.labFloor+.05,q.labFloor+.16,0xafa45e,'metal',panel);
   }else{
     box('lab-lower-plinth',f,s0,s1,4.24,4.5,q.labFloor-.15,q.labFloor+.4,0xb4baac);
     const modules=Math.max(1,Math.round((s1-s0)/1.8));
     for(let j=0;j<modules;j++){const a=s0+(s1-s0)*j/modules,b=s0+(s1-s0)*(j+1)/modules;
       const pane=box('lab-tall-grid-glazing',f,a+.04,b-.04,4.28,4.35,q.labFloor+.4,q.terraceFloor-.72,glass,'glass');
       for(const s of[a,b])box('lab-glazing-mullion',f,s-.035,s+.035,4.36,4.43,q.labFloor+.35,q.terraceFloor-.7,0xc8cec4,'metal',pane);
       for(const y of[q.labFloor+.4,q.labFloor+2.1,q.terraceFloor-.72])box('lab-glazing-transom',f,a,b,4.36,4.43,y-.035,y+.035,0xc8cec4,'metal',pane);
     }
   }
   for(const s of[s0,s1])box('lab-facade-square-column',f,s-.11,s+.11,4.2,4.55,q.labFloor-.15,q.terraceFloor-.7,white);
 }
 for(const s of[0,70])box('lab-side-wall',f,s-.12,s+.12,.3,4.4,q.labFloor,q.terraceFloor,0xb0b8ab);
 for(const[a,b]of[[0,q.q90.terraceStart-1.8],[51.7,q.crosswalk.s0],[q.crosswalk.s1,96]])rail(f,a,4.4,b,4.4,q.terraceFloor,q.terraceFloor,'terrace-edge-rail');
 for(const s of[0,96])rail(f,s,0,s,4.4,q.terraceFloor,q.terraceFloor,'terrace-end-rail');
 for(const n of[-1.22,1.22])rail(q.stair,0,n,q.stair.length,n,q.stairBottom,q.stairTop,'north-stair-handrail');
 for(const s of[q.crosswalk.s0,q.crosswalk.s1])rail(f,s,4.4,s,q.stairEnd.n-1.4,q.terraceFloor,q.terraceFloor,'upper-approach-rail');
 // 교각은 기존 도로 양옆에 두어 차로와 보행로를 비운다.
 for(const n of[9.8,18.3])for(const s of[25.9,30.2])box('east-bridge-white-support',f,s-.2,s+.2,n-.2,n+.2,q.roadAt(28).y-.25,q.q90.upperFloor-.2,white);
 for(const[a,b]of[[2,10.5],[17.5,25.5],[30.5,50.5],[57.5,68]])box('front-garden-curb',f,a,b,7.3,7.48,q.labFloor-.08,q.labFloor+.12,0xbac0b1);
 const boardFace=humanities23Frame(f.point(30.6,9.2),f.point(26.6,9.2)),board=box('E35-sign-board',boardFace,0,2.1,-.08,.08,q.labFloor+.55,q.labFloor+1.5,0x38576b,'metal');
 for(const s of[.2,1.9])box('E35-sign-post',boardFace,s-.035,s+.035,-.04,.04,q.labFloor,q.labFloor+.6,metal,'metal',board);
 label('E35-sign-text','E35  공학관 6',boardFace,1.05,-.1,q.labFloor+1.15,1.9,.42,board,'#38576b','#eeeeea');
 const cabinet=box('brown-service-cabinet',f,19,20.5,8,9.15,q.labFloor,q.labFloor+2.05,0x776e5d,'metal');
 box('cabinet-overhang',f,18.85,20.65,7.85,9.3,q.labFloor+2.05,q.labFloor+2.15,0x7d8075,'metal',cabinet);
 for(let y=q.labFloor+1.55;y<q.labFloor+2;y+=.09)box('cabinet-vent-slat',f,19.05,20.45,9.16,9.19,y,y+.03,0x4d5b51,'metal',cabinet);
 box('cabinet-yellow-notice',f,20.51,20.53,8.25,8.9,q.labFloor+.85,q.labFloor+1.45,0xb2a761,'metal',cabinet);
 const lamp=beam('west-walk-lamp',at(f,42,q.labFloor,9),at(f,42,q.labFloor+4.5,9),.05,metal);
 const shade=[];for(let i=0;i<12;i++){const a=i*Math.PI/6;shade.push(at(f,42+.55*Math.cos(a),q.labFloor+4.6,9+.55*Math.sin(a)));}shade.push(at(f,42,q.labFloor+4.15,9));part('lamp-dish',shade,0x616e61,'metal',lamp);
 const meshes=batches.map(b=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(b.colors,3));g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:b.glass?.3:.8,side:THREE.DoubleSide}));mesh.name=b.glass?'engineering35Access-glass':'engineering35Access-surfaces';mesh.castShadow=!b.glass;mesh.receiveShadow=true;shell.add(mesh);return mesh;});



 shell.userData.engineering35Access={buildingId:ENGINEERING35_ACCESS_ID,dimensionsEstimated:true,wholeInteriorImplemented:false,terraceOfficialFloor:2,labFloor:q.labFloor,terraceFloor:q.terraceFloor,routes:q.routes,pavementMasks,bounds:q.bounds,geometry:{meshes:meshes.length+signs.length,textures:signs.length,triangles:batches.reduce((n,b)=>n+b.positions.length/9,0)+signs.length*2,colliders:breakables.length}};
 function update(_player:THREE.Vector3){batches.forEach((b,index)=>{const a=meshes[index].geometry.attributes.position as THREE.BufferAttribute,c=meshes[index].geometry.attributes.color as THREE.BufferAttribute;let moved=false,tinted=false;for(const p of b.parts){if(p.shown!==p.proxy.visible){p.shown=p.proxy.visible;moved=true;if(p.shown)(a.array as Float32Array).set(p.original,p.start);else for(let i=p.start;i<p.end;i+=3){a.array[i]=p.proxy.position.x;a.array[i+1]=p.proxy.position.y;a.array[i+2]=p.proxy.position.z;}}if(p.color!==p.proxy.material.color.getHex()){p.color=p.proxy.material.color.getHex();tinted=true;const t=p.proxy.material.color,scale=[t.r/p.base.r,t.g/p.base.g,t.b/p.base.b];for(let i=p.start;i<p.end;i++)c.array[i]=p.colors[i-p.start]*scale[(i-p.start)%3];}}if(moved)a.needsUpdate=true;if(tinted)c.needsUpdate=true;});for(const s of signs)s.mesh.visible=s.owner.visible;shell.visible=batches.some(b=>b.parts.some(p=>p.proxy.visible));}
 // 렌더 버퍼와 복원용 사본을 만든 뒤 조립용 배열을 비운다.
 for(const batch of batches){batch.positions.length=0;batch.colors.length=0;}
 return{shell,breakables,update};
}
