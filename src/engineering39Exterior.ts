import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import { humanities23Frame } from './humanities23Site';
import { physics561SurfaceHeight } from './physics561Site';
import { ENGINEERING39_ID, type Engineering39Layout } from './engineering39Site';
type XZ=[number,number];type Frame=ReturnType<typeof humanities23Frame>;type Proxy=THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
export function createEngineering39Exterior(scene:THREE.Scene,q:Engineering39Layout){
 const shell=new THREE.Group();shell.name='landmark/engineering39-exterior';Object.assign(shell.userData,{role:'building-shell',buildingId:ENGINEERING39_ID,buildingIds:[ENGINEERING39_ID]});scene.add(shell);


 let partBuilding=ENGINEERING39_ID;
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
    if (!owner) { proxy.position.copy(center); proxy.updateMatrixWorld(true); Object.assign(proxy.userData, { buildingId: partBuilding, component: name, renderProxy: true, convex: true }); breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attr.array), toughness: material === 'glass' ? 2 : 8, material, label: '39동 대학원연구동' }); }
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







 const f=q.axis,concrete=0xb9b9ad,metal=0x9ca7a1,glass=0x57736d,wood=0x867454;
 const pavementMasks=q.polygons.map(polygon=>({component:'engineering39-ground',polygon}));
 for(const a of q.surfaces){
  const h=(s:number,n:number)=>physics561SurfaceHeight(a,s,n),corners=[[a.s0,a.n0],[a.s1,a.n0],[a.s1,a.n1],[a.s0,a.n1]],top=corners.map(([s,n])=>at(f,s,h(s,n),n)),step=a.name.includes('stair'),road=a.name.includes('road');
  const owner=part(a.name,[...top,...top.map(p=>p.clone().add(new THREE.Vector3(0,-.18,0)))],step?0xb4b6ae:road?0x777d74:0x9f9f91);
  if(step){const c=a.axis==='s'?[[a.s0,a.n0],[a.s0+.04,a.n0],[a.s0+.04,a.n1],[a.s0,a.n1]]:[[a.s0,a.n1-.04],[a.s1,a.n1-.04],[a.s1,a.n1],[a.s0,a.n1]];part('stair-light-nosing',c.map(([s,n])=>at(f,s,a.y0+.006,n)),0xd8d7cb,'stone',owner,true);continue;}
  if(road)continue;
  for(let s=a.s0;s<a.s1-.02;s+=1.2)for(let n=a.n0;n<a.n1-.02;n+=1.2){const e=Math.min(a.s1,s+1.18),t=Math.min(a.n1,n+1.18);if(e-s<.02||t-n<.02)continue;const red=Math.floor((s+96)/3.6)%5===0||Math.floor((n+108)/3.6)%5===0;part('gray-red-paving-grid',[[s,n],[e,n],[e,t],[s,t]].map(([s,n])=>at(f,s,h(s,n)+.005,n)),red?0xa26f5b:0xb5b5a9,'stone',owner,true);}
 }
 function face(s0:number,n0:number,s1:number,n1:number){return humanities23Frame(f.point(s0,n0),f.point(s1,n1));}
 function facade(name:string,frame:Frame,y:number,rows:number,louvers=false){
  const count=Math.max(1,Math.round(frame.length/3.3)),bay=frame.length/count;
  for(let row=0;row<rows;row++)for(let i=0;i<count;i++){
   const a=i*bay,b=(i+1)*bay,base=y+row*3.5;
   const pane=box(name+'-glass',frame,a+.09,b-.09,.12,.22,base+.3,base+3.17,glass,'glass');
   for(const s of[a,a+bay/2,b])box(name+'-mullion',frame,s-.025,s+.025,.04,.24,base+.3,base+3.2,metal,'metal',pane);
   for(const yy of[base+.3,base+1.1,base+2.8,base+3.18])box(name+'-transom',frame,a,b,.04,.24,yy,yy+.035,metal,'metal',pane);
   box(name+'-opaque-spandrel',frame,a+.1,b-.1,.06,.1,base+.32,base+1.05,0x869b94,'metal',pane);
   if(louvers){const left=(i+row)%3===0,a0=left?a+.12:a+bay/2+.05,b0=left?a+bay/2-.05:b-.12;
    const shutter=box('north-louver-frame',frame,a0,b0,-.16,-.08,base+.45,base+3.08,wood,'wood');
    // 단면이 얇은 루버는 창틀 소유 메시로 합친다. 별도 물리 물체를 만들지 않는다.
    for(let yy=base+.5;yy<base+3.04;yy+=.14)box('north-horizontal-louver',frame,a0,b0,-.24,-.09,yy,yy+.045,0x9b8460,'wood',shutter);
   }
  }
  for(let row=0;row<=rows;row++)box(name+'-concrete-band',frame,0,frame.length,-.05,.35,y+row*3.5-.07,y+row*3.5+.28,concrete);
  for(const s of[0,frame.length])box(name+'-end-frame',frame,s-.13,s+.13,-.08,.35,y,y+rows*3.5+.28,concrete);
 }
 // 수정 평면도의 네 연구동과 두 연결 복도를 OSM 외곽 안에서 근사한다.
 for(let i=0;i<q.bars.length;i++){
  const b=q.bars[i],e=q.eastWings[i];
  for(let floor=0;floor<=4;floor++){
   const y=q.researchFloor+floor*3.5;
   box('research-wing-slab',f,b.s0,36,b.n0,b.n1,y-.3,y,concrete);
   box('research-east-slab',f,36,e.s1,e.n0,e.n1,y-.3,y,concrete);
  }
  facade(i===0?'north-front':'west-court-north',face(36,b.n1,0,b.n1),q.researchFloor,4,i===0);
  facade('west-court-south',face(0,b.n0,36,b.n0),q.researchFloor,4);
  facade('east-wing-north',face(e.s1,e.n1,36,e.n1),q.researchFloor,4,i===0);
  facade('east-wing-south',face(36,e.n0,e.s1,e.n0),q.researchFloor,4);
  const end=face(e.s1,e.n0,e.s1,e.n1),L=end.length;
  const screen=box('east-vertical-screen-backing',end,.2,L-.2,.08,.18,q.researchFloor,q.roof,0x52625b,'metal');
  for(let s=.25;s<L-.2;s+=.23)box('east-vertical-louver',end,s,s+.045,-.2,.15,q.researchFloor+.2,q.roof-.2,wood,'wood',screen);
  for(const s of[0,L])box('east-end-concrete-frame',end,s-.15,s+.15,-.25,.3,q.researchFloor-.3,q.roof+.3,concrete);
  for(let floor=0;floor<=4;floor++)box('east-screen-crossbar',end,0,L,-.26,.3,q.researchFloor+floor*3.5-.16,q.researchFloor+floor*3.5+.12,concrete,'stone',screen);
  if(i===0)label('east-building-number','39',end,L*.78,-.29,q.roof-1.5,1.4,1.4,screen,'#52625b','#ffffff');
  // 서쪽 끝면은 직접 확인한 사진이 부족해 단순 창과 콘크리트로 남긴다.
  facade('west-estimated-end',face(0,b.n1,0,b.n0),q.researchFloor,4);
 }
 for(const [s0,s1,n0,n1,rows]of[[36,42,-84,-9.2,4],[10,12.5,-84,-9.2,2]]){
  const bottom=q.roof-rows*3.5;
  for(let row=0;row<=rows;row++)box('connecting-gallery-slab',f,s0,s1,n0,n1,bottom+row*3.5-.25,bottom+row*3.5,concrete);
  facade('connecting-gallery-west',face(s0,n1,s0,n0),bottom,rows);
  facade('connecting-gallery-east',face(s1,n0,s1,n1),bottom,rows);
 }
 // 열린 1층 앞부분 아래를 별도 차양으로 나눠 낮은 현관과 큰 계단을 드러낸다.
 for(const s of[4,15,26,44,55])for(const n of[-.1,-8]){
  beam('round-piloti-column',at(f,s,q.lower,n),at(f,s,q.researchFloor-.3,n),.48,concrete);
 }
 // 큰 계단 위쪽 차양은 보행 머리 공간을 확보한다.
 for(const [s0,s1]of[[0,28],[43,58.5]]){const c=box('north-canopy-side',f,s0,s1,-9,1.8,q.lower+4.1,q.lower+4.32,0xa3aaa0);box('north-canopy-soffit',f,s0,s1,-9,1.8,q.lower+4.07,q.lower+4.1,0x65736b,'metal',c);}
 box('north-canopy-front-lip',f,28,43,.8,1.8,q.lower+4.1,q.lower+4.32,0xa3aaa0);
 // 북쪽 상부의 열린 층은 얇은 테두리와 유리 후면으로 구분한다.
 const entry=face(23,-8.6,10,-8.6),entryWidth=entry.length;
 const header=box('entry-sign-header',entry,0,entryWidth,-.12,.15,q.lower+2.65,q.lower+3.25,0xaaa99c);
 label('entry-engineering-sign','39 ENGINEERING',entry,entryWidth/2,-.14,q.lower+2.95,7.7,.48,header,'#aaa99c','#9a583c');
 for(let i=0;i<8;i++){const a=i*entryWidth/8,b=(i+1)*entryWidth/8,door=i===3||i===4,pane=box(door?'entry-glass-door':'entry-fixed-window',entry,a+.035,b-.035,.02,.10,q.lower+.03,q.lower+2.64,glass,'glass');for(const s of[a,b])box('entry-door-frame',entry,s-.025,s+.025,-.03,.12,q.lower,q.lower+2.65,metal,'metal',pane);if(door)box('entry-door-handle',entry,(a+b)/2-.025,(a+b)/2+.025,-.16,-.08,q.lower+.9,q.lower+1.35,0xc5cbc0,'metal',pane);}
 box('entry-shallow-floor',entry,0,entryWidth,0,1.4,q.lower-.18,q.lower,concrete);
 box('entry-back-wall',entry,0,entryWidth,1.4,1.55,q.lower,q.lower+2.65,concrete);
 for(const s of[0,entryWidth])box('entry-side-wall',entry,s-.05,s+.05,0,1.5,q.lower,q.lower+2.65,concrete);
 // 중정의 화단, 벤치와 지주목은 사진의 유형을 참고한 근사 배치다.
 for(const [s,n,y]of[[31.5,-20,q.upper],[31.5,-46,q.second],[28,-79,q.third]]){
  const planter=box('court-brick-planter',f,s-1.5,s+1.5,n-1.6,n+1.6,y,y+.48,0x8c6853);
  box('court-planter-soil',f,s-1.35,s+1.35,n-1.45,n+1.45,y+.48,y+.5,0x526447,'stone',planter);
  for(const edge of[-1.5,1.5])box('court-wood-bench',f,s-1.7,s+1.7,n+edge-.18,n+edge+.18,y+.48,y+.59,0x8c7850,'wood',planter);
  const trunk=beam('court-tree-trunk',at(f,s,y+.5,n),at(f,s,y+3.6,n),.13,0x6b6848);
  const vertices=[];for(const yy of[y+2.5,y+4.1])for(let i=0;i<8;i++){const a=i*Math.PI/4;vertices.push(at(f,s+1.2*Math.cos(a),yy,n+1.2*Math.sin(a)));}part('court-tree-crown',vertices,0x647953,'wood',trunk);
  for(let i=0;i<3;i++){const a=i*Math.PI*2/3;beam('court-tree-brace',at(f,s+1.1*Math.cos(a),y,n+1.1*Math.sin(a)),at(f,s,y+2,n),.04,0x9e8562,trunk);}
  const lamp=box('court-bollard-lamp',f,s-2.4,s-2.2,n-.1,n+.1,y,y+.8,0x485a4a,'metal');box('court-lamp-white-lens',f,s-2.41,s-2.19,n-.11,n+.11,y+.6,y+.74,0xe1dec5,'metal',lamp);
 }
 function rail(s0:number,n0:number,s1:number,n1:number,y0:number,y1=y0){const owner=beam('stair-handrail',at(f,s0,y0+1,n0),at(f,s1,y1+1,n1),.03,metal);const count=Math.max(1,Math.ceil(Math.hypot(s1-s0,n1-n0)/1.5));for(let i=0;i<=count;i++){const t=i/count,s=s0+(s1-s0)*t,n=n0+(n1-n0)*t,y=y0+(y1-y0)*t;beam('stair-rail-post',at(f,s,y,n),at(f,s,y+1,n),.025,metal,owner);}beam('stair-rail-middle',at(f,s0,y0+.5,n0),at(f,s1,y1+.5,n1),.02,metal,owner);}
 for(const s of[29.2,41.8])rail(s,-9,s,-1,q.upper,q.lower);
 for(const s of[21.6,24.4])rail(s,-33,s,-24,q.second,q.upper);
 for(const s of[15.9,18.7])rail(s,-65,s,-55,q.third,q.second);
 rail(57,-7.8,61.5,-7.8,q.lower,q.lower-1.44);
 for(const n of[-18.7,-46.3,-74.9]){const a=q.surfaces.filter(a=>a.name.startsWith('east-court-stair')&&Math.abs((a.n0+a.n1)/2-n)<.1),first=a[0],last=a.at(-1)!;rail(first.s0,n+1.2,last.s1,n+1.2,first.y0,last.y0);}
 const notice=box('north-blue-information-board',f,51,53,1.5,1.65,q.lower+.6,q.lower+1.65,0x46647e,'metal');
 for(const s of[51.2,52.8])beam('information-board-post',at(f,s,q.lower,1.6),at(f,s,q.lower+.7,1.6),.04,metal,notice);
 const northSign=box('north-roof-number-panel',f,1,3.5,.05,.2,q.roof-1.4,q.roof+.05,concrete);
 label('north-building-number','39',face(3.5,.21,1,.21),1.25,-.02,q.roof-.67,1.7,1.35,northSign,'#b9b9ad','#f3f1e6');
 const meshes=batches.map(b=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(b.colors,3));g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:b.glass?.3:.8,side:THREE.DoubleSide}));mesh.name=b.glass?'engineering39Exterior-glass':'engineering39Exterior-surfaces';mesh.castShadow=!b.glass;mesh.receiveShadow=true;shell.add(mesh);return mesh;});



 shell.userData.engineering39Exterior={buildingId:ENGINEERING39_ID,dimensionsEstimated:true,wholeInteriorImplemented:false,officialAboveGroundFloors:5,officialBasementFloors:3,upperWindowRows:4,courtyardFurniturePlacementEstimated:true,westSouthFacadesApproximate:true,entryFrame:entry,entryFloor:q.lower,routes:q.routes,pavementMasks,bounds:q.bounds,geometry:{meshes:meshes.length+signs.length,textures:signs.length,triangles:batches.reduce((n,b)=>n+b.positions.length/9,0)+signs.length*2,colliders:breakables.length}};
 function update(_player:THREE.Vector3){batches.forEach((b,index)=>{const a=meshes[index].geometry.attributes.position as THREE.BufferAttribute,c=meshes[index].geometry.attributes.color as THREE.BufferAttribute;let moved=false,tinted=false;for(const p of b.parts){if(p.shown!==p.proxy.visible){p.shown=p.proxy.visible;moved=true;if(p.shown)(a.array as Float32Array).set(p.original,p.start);else for(let i=p.start;i<p.end;i+=3){a.array[i]=p.proxy.position.x;a.array[i+1]=p.proxy.position.y;a.array[i+2]=p.proxy.position.z;}}if(p.color!==p.proxy.material.color.getHex()){p.color=p.proxy.material.color.getHex();tinted=true;const t=p.proxy.material.color,scale=[t.r/p.base.r,t.g/p.base.g,t.b/p.base.b];for(let i=p.start;i<p.end;i++)c.array[i]=p.colors[i-p.start]*scale[(i-p.start)%3];}}if(moved)a.needsUpdate=true;if(tinted)c.needsUpdate=true;});for(const s of signs)s.mesh.visible=s.owner.visible;shell.visible=batches.some(b=>b.parts.some(p=>p.proxy.visible));}
 return{shell,breakables,update};
}
