import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import type { CampusBuilding } from './fullCampus';
import { humanities23Frame } from './humanities23Site';
import { physics561SurfaceHeight } from './physics561Site';
import { SCIENCE25_ID, SCIENCE27_ID, type Science2527Layout } from './science2527Site';
type XZ=[number,number];type Frame=ReturnType<typeof humanities23Frame>;type Proxy=THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
export function createScience2527Exterior(scene:THREE.Scene,buildings:CampusBuilding[],q:Science2527Layout,heightAt:(x:number,z:number)=>number,connection24?:{point:XZ;floor:number;width:number}){
 const shell=new THREE.Group();shell.name='landmark/science2527-exterior';Object.assign(shell.userData,{role:'building-shell',buildingIds:[SCIENCE25_ID,SCIENCE27_ID]});scene.add(shell);
 
 let building=buildings.find(b=>b.id===SCIENCE25_ID)!;
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
    if (!owner) { proxy.position.copy(center); proxy.updateMatrixWorld(true); Object.assign(proxy.userData, { buildingId: building.id, component: name, renderProxy: true, convex: true }); breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attr.array), toughness: material === 'glass' ? 2 : 8, material, label: building.id===SCIENCE25_ID?'25동과 연결교':'27동' }); }
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
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const ctx=canvas.getContext('2d')!;ctx.fillStyle=background;ctx.fillRect(0,0,canvas.width,128);ctx.fillStyle=color;ctx.font='bold 92px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,canvas.width/2,64);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const geometry=new THREE.PlaneGeometry(width,height);geometry.scale(-1,1,1);const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));mesh.name=name;mesh.position.copy(at(f,s,y,n));mesh.lookAt(at(f,s,y,n-1));shell.add(mesh);signs.push({mesh,owner});
  }

 const f=q.f,white=0xe0ded3,brick=0x695044,metal=0x9ba5a3;
 const pavementMasks:{component:string;polygon:XZ[]}[]=[];
 function wall(name:string,e:Frame,a:number,b:number,low:number,high:number,color=brick){
  const owner=box(name,e,a,b,-.17,.17,low,high,color);
  if(color===brick){
   for(let y=low+.16;y<high;y+=.16)facet('brick-horizontal-joint',e,a,b,y,y+.008,-.174,0x938475,owner);
   for(let y=low;y<high;y+=.32)for(let s=a+.28;s<b;s+=.6)facet('brick-head-joint',e,s,Math.min(s+.008,b),y,Math.min(y+.16,high),-.175,0x938475,owner);
  }
  return owner;
 }
 function window(e:Frame,a:number,b:number,low:number,high:number,name='paired-window'){
  const owner=box(name,e,a,b,-.08,.03,low,high,0x6d8a8c,'glass');
  for(const s of[a,(a+b)/2,b])box('silver-window-mullion',e,s-.025,s+.025,-.14,.05,low,high,metal,'metal',owner);
  for(const y of[low,high])box('window-transom',e,a,b,-.14,.05,y-.035,y+.035,white,'metal',owner);
  return owner;
 }
 function slab(name:string,points:XZ[],y:number,color:number){
  const ring=points.slice(0,-1).map(p=>new THREE.Vector2(...p));
  for(const ids of THREE.ShapeUtils.triangulateShape(ring,[])){const top=ids.map(i=>new THREE.Vector3(ring[i].x,y,ring[i].y));part(name,[...top,...top.map(p=>p.clone().add(new THREE.Vector3(0,-.24,0)))],color);}
 }
 const outlines:Record<string,XZ[]>={
  [SCIENCE25_ID]:[[144.68,-805.99],[111.98,-886.57],[131.88,-894.17],[164.11,-813.1],[144.68,-805.99]],
  [SCIENCE27_ID]:[[117.67,-959.58],[138.04,-969.06],[168.38,-890.85],[149.9,-882.79],[117.67,-959.58]],
 };
 for(const id of[SCIENCE25_ID,SCIENCE27_ID]){
  building=buildings.find(b=>b.id===id)!;
  const is25=id===SCIENCE25_ID,floors=is25?q.floors25:q.floors27,roof=is25?q.roof25:q.roof27,points=outlines[id];
  for(const [i,y]of [...floors,roof].entries())slab('floor-slab-'+i,building.points,y,i===floors.length?0xa6aaa0:0xb6b9af);
  for(let edge=0;edge<points.length-1;edge++){
   const e=humanities23Frame(points[edge],points[edge+1]),mid=f.local(e.point(e.length/2)),long=Math.abs(f.local(points[edge]).s-f.local(points[edge+1]).s)>40,south=(mid.s>(is25?85:152)||(is25&&!!connection24))&&!long;
   const endCenter=e.length/2;
   for(let level=0;level<floors.length;level++){
    const low=floors[level],high=floors[level+1]??roof,openings:{a:number;b:number}[]=[];
    const opening=(p:XZ,width:number)=>{const l=e.local(p);if(Math.abs(l.n)<.15&&l.s>-.1&&l.s<e.length+.1)openings.push({a:Math.max(0,l.s-width/2),b:Math.min(e.length,l.s+width/2)});};
    for(const d of q.doors.filter(d=>d.buildingId===id&&d.level===level))opening(d.point,d.width);
    if(Math.abs(low-q.bridgeFloor)<.01)opening(q.bridge.point(is25?0:q.bridge.length),3.65);
    if(is25&&connection24&&Math.abs(low-connection24.floor)<.01)opening(connection24.point,connection24.width);
    const cuts=[0,e.length,...openings.flatMap(o=>[o.a,o.b])];
    if(long)for(let s=0;s<e.length;s+=5.4)cuts.push(s);else if(south)cuts.push(endCenter-1.6,endCenter+1.6);
    const sorted=[...new Set(cuts)].sort((a,b)=>a-b);
    for(let i=1;i<sorted.length;i++){
     const a=sorted[i-1],b=sorted[i],m=(a+b)/2;if(b-a<.02)continue;
     if(openings.some(o=>m>o.a-1e-5&&m<o.b+1e-5)){
      wall('entry-header',e,a,b,low+2.8,high-.24,white);
      for(const s of[a,b])box('entry-metal-jamb',e,s-.025,s+.025,-.2,.2,low,low+2.8,metal,'metal');continue;
     }
     if(!long){
      if(south&&Math.abs(m-endCenter)<1.61&&(is25?level>0:level>1)){
       window(e,a+.07,b-.07,low+.03,high-.3,'balcony-glazed-door');
      }else wall('solid-brick-end',e,a,b,low,high-.24);
      continue;
     }
     if(b-a<1.1){wall('brick-pier',e,a,b,low,high-.24);continue;}
     const deep=level===(is25?1:2),shaft=Math.abs(mid.n-(is25?-21:33))<1.2&&Math.abs(f.local(e.point(m)).s-(is25?50:92.57))<3;
     if(shaft){window(e,a+.12,b-.12,low+.05,high-.25,'entry-curtain-glazing');continue;}
     const wide=is25||deep,winWidth=wide?b-a-.42:Math.min(2.5,b-a-.55),center=(a+b)/2,wa=center-winWidth/2,wb=center+winWidth/2;
     const sill=deep?.36:.95,head=high-.65;
     wall(level===0?'stone-ground-spandrel':'brick-spandrel',e,a,b,low,low+sill,level===0?0x8e918c:brick);
     wall('brick-window-header',e,a,b,head,high-.24);
     wall('brick-window-side',e,a,wa,low+sill,head);wall('brick-window-side',e,wb,b,low+sill,head);
     const owner=window(e,wa,wb,low+sill,head);
     for(const s of[wa,wb])box(deep?'deep-white-fin':'white-window-frame',e,s-.08,s+.08,deep?-.95:-.24,.1,low+sill-.08,head+.08,white,'stone',owner);
     if(deep)box('deep-fin-lintel',e,wa-.08,wb+.08,-.95,.1,head,head+.16,white,'stone',owner);
     if(!deep)box('white-projecting-sill',e,wa-.08,wb+.08,-.32,.1,low+sill-.12,low+sill,white,'stone',owner);
    }
    if(long){
     const bandCuts=[0,e.length,...openings.flatMap(o=>[o.a,o.b])].sort((a,b)=>a-b);
     for(let i=1;i<bandCuts.length;i++){const a=bandCuts[i-1],b=bandCuts[i],open=openings.some(o=>(a+b)/2>o.a-1e-5&&(a+b)/2<o.b+1e-5);if(b-a>.02)box('white-floor-band',e,a,b,-.3,.2,low-.24,open?low:low+.1,white);}
    }
   }
   box('white-corner-column',e,0,.35,-.35,.25,floors[0],roof,white);
   box('deep-white-eaves',e,-.4,e.length+.4,-.85,.4,roof-.28,roof,white);
   const rail=box('open-roof-parapet',e,0,e.length,-.23,.17,roof+.65,roof+.87,white);
   for(let s=0;s<e.length;s+=3.8)box('roof-parapet-post',e,s,s+.18,-.23,.17,roof,roof+.67,white,'stone',rail);
   if(south){
    for(const y of floors.slice(is25?1:2)){
     const owner=box('short-end-balcony',e,endCenter-1.85,endCenter+1.85,-1.55,.2,y-.25,y,white);
     for(const n of[-1.48]){for(const h of[.48,1])beam('balcony-handrail',at(e,endCenter-1.78,y+h,n),at(e,endCenter+1.78,y+h,n),.025,metal,owner);for(let s=endCenter-1.78;s<=endCenter+1.78;s+=.5)beam('balcony-baluster',at(e,s,y,n),at(e,s,y+1,n),.018,metal,owner);}
     for(const s of[endCenter-1.78,endCenter+1.78])beam('balcony-side-rail',at(e,s,y+1,-1.48),at(e,s,y+1,-.15),.025,metal,owner);
    }
    const board=wall('building-number-board',e,e.length-3.2,e.length-1.2,roof-2.2,roof-.55);
    label('building-number-'+(is25?'25':'27'),is25?'25':'27',e,e.length-2.2,-.18,roof-1.35,1.3,1.35,board,'#695044','#f4f1e8');
   }
  }
 }
 // 두 건물의 지도상 연결선을 따라 유리 연결교를 놓고 하부 통행 공간을 비운다.
 building=buildings.find(b=>b.id===SCIENCE25_ID)!;
 const bridge=q.bridge,y=q.bridgeFloor;
 for(const n of[-1.8,1.8]){
  box('bridge-white-spandrel',bridge,0,bridge.length,n-.12,n+.12,y,y+.65,white);
  box('bridge-white-header',bridge,0,bridge.length,n-.12,n+.12,y+2.7,y+3.2,white);
  const owner=box('bridge-glass',bridge,0,bridge.length,n-.055,n+.055,y+.65,y+2.7,0x779296,'glass');
  for(let s=0;s<=bridge.length;s+=1.3)box('bridge-window-frame',bridge,s,s+.055,n-.12,n+.12,y+.6,y+2.75,white,'metal',owner);
  box('bridge-window-transom',bridge,0,bridge.length,n-.12,n+.12,y+1.75,y+1.8,white,'metal',owner);
 }
 box('bridge-roof',bridge,-.15,bridge.length+.15,-1.95,1.95,y+3.2,y+3.42,white);
 for(const s of[.65,bridge.length-.65])for(const n of[-1.6,1.6])box('bridge-square-column',bridge,s-.2,s+.2,n-.2,n+.2,q.floor,y-.24,white);
 for(const a of q.surfaces){
  building=buildings.find(b=>b.id===a.buildingId)!;const e=a.frame??f,corners=[e.point(a.s0,a.n0),e.point(a.s1,a.n0),e.point(a.s1,a.n1),e.point(a.s0,a.n1)];
  const top=corners.map(p=>{const l=e.local(p);return new THREE.Vector3(p[0],physics561SurfaceHeight(a,l.s,l.n),p[1]);});
  const owner=part(a.name,[...top,...top.map(p=>new THREE.Vector3(p.x,a.elevated?p.y-.24:Math.min(p.y-.25,heightAt(p.x,p.z)-.22),p.z))],a.name.includes('stair')?0xa5aaa5:0x939e98);
  pavementMasks.push({component:a.name,polygon:corners});
  if(a.name.endsWith('paving')||a.name.endsWith('landing'))for(let n=a.n0;n<a.n1;n+=.5)for(let s=a.s0;s<a.s1;s+=.75){
   const x=Math.min(s+.73,a.s1),z=Math.min(n+.48,a.n1),ys=a.y0+.006,colors=[0xa8afa8,0x838d86,0xbec3b9];
   part('pavement-block',[at(e,s,ys,n),at(e,x,ys,n),at(e,x,ys,z),at(e,s,ys,z)],colors[Math.abs(Math.round(s*4+n*6))%3],'stone',owner,true);
  }
  if(a.name.endsWith('stair')){
   const edge=a.s0;part('stair-nosing',[at(e,edge,a.y0+.007,a.n0),at(e,edge+.035,a.y0+.007,a.n0),at(e,edge+.035,a.y0+.007,a.n1),at(e,edge,a.y0+.007,a.n1)],0x535e59,'stone',owner,true);
  }
  if(a.name.endsWith('landing'))for(let n=-1.2;n<1.2;n+=.3)box('entry-tactile-block',e,a.s0+.08,a.s0+.38,n,n+.28,a.y0+.007,a.y0+.022,0xcac083,'stone',owner);
 }
 for(const d of q.doors){
  building=buildings.find(b=>b.id===d.buildingId)!;const e=d.frame;
  // 현관 사진의 문틀과 차양을 적용한다. 27동 사진의 정확한 출입문 대응은 미확인이다.
  if(['25-west','27-east'].includes(d.name)){
   const canopy=box('glass-entry-canopy',e,e.length-1.8,e.length+.1,-d.width/2-.35,d.width/2+.35,d.floor+2.85,d.floor+2.94,0x91a6a3,'glass');
   for(const n of[-d.width/2,d.width/2])box('canopy-cantilever-beam',e,e.length-1.9,e.length+.2,n-.06,n+.06,d.floor+2.76,d.floor+2.85,white,'metal',canopy);
  }
  if(d.name==='27-lower'){
   box('lower-entry-vestibule-back',e,e.length+2.15,e.length+2.35,-d.width/2-.2,d.width/2+.2,d.floor,d.floor+2.8,0x9ba29a);
   for(const n of[-d.width/2-.12,d.width/2+.12])box('lower-entry-vestibule-side',e,e.length+.2,e.length+2.35,n-.08,n+.08,d.floor,d.floor+2.8,0x9ba29a);
  }
 }
 building=buildings.find(b=>b.id===SCIENCE25_ID)!;
 // 25동 서쪽의 초록색 곡면 덮개는 공식 사진과 2011년 로드뷰에서 확인했다.
 const coverFrame=humanities23Frame(f.point(54,-21.1),f.point(83,-21.1));
 const coverOwner=box('green-lightwell-cover-base',coverFrame,0,coverFrame.length,-1.1,0,q.floor-.65,q.floor-.5,0x365f56,'metal');
 for(let i=0;i<8;i++){
  const angle=i*Math.PI/2/8,next=(i+1)*Math.PI/2/8,points=[0,coverFrame.length].flatMap(s=>[at(coverFrame,s,q.floor-.05+.8*Math.sin(angle),-1.1*Math.cos(angle)),at(coverFrame,s,q.floor-.05+.8*Math.sin(next),-1.1*Math.cos(next))]);
  part('green-curved-lightwell-cover',[points[0],points[2],points[3],points[1]],0x386e63,'metal',coverOwner,true);
 }
 for(let s=0;s<=coverFrame.length;s+=2.4)for(let i=0;i<8;i++){const a=i*Math.PI/16,b=(i+1)*Math.PI/16;beam('lightwell-cover-rib',at(coverFrame,s,q.floor-.04+.81*Math.sin(a),-1.11*Math.cos(a)),at(coverFrame,s,q.floor-.04+.81*Math.sin(b),-1.11*Math.cos(b)),.016,0x78978e,coverOwner);}
 // 사진의 게시판은 형태만 반영하고 읽히지 않는 게시 내용은 만들지 않는다.
 const boardFrame=humanities23Frame(f.point(89,-7),f.point(89,-1.5));
 const board=box('wood-notice-board',boardFrame,0,5.5,-.12,.12,q.floor+.35,q.floor+1.8,0x76614a,'wood');
 for(const s of[.15,5.35])box('notice-board-post',boardFrame,s-.09,s+.09,-.16,.16,q.floor-.1,q.floor+2.1,0x65513d,'wood',board);
 facet('blank-notice-panel',boardFrame,.28,5.2,q.floor+.5,q.floor+1.65,-.126,0xd4d1bb,board);
 for(const side of[-1,1])part('notice-board-pitched-roof',[at(boardFrame,-.2,q.floor+1.95,side*.7),at(boardFrame,5.7,q.floor+1.95,side*.7),at(boardFrame,5.7,q.floor+2.2,0),at(boardFrame,-.2,q.floor+2.2,0)],0x65533e,'wood',board,true);
 for(const s of[73.5,86,93])for(const n of[1.5,11.2]){
  const shrub=box('court-planter',f,s-.55,s+.55,n-.35,n+.35,q.floor,q.floor+.24,0xa8ada2);
  box('court-clipped-shrub',f,s-.5,s+.5,n-.3,n+.3,q.floor+.2,q.floor+.8,0x536d43,'wood',shrub);
 }
 for(const n of[-7.3,-3,1,10.5]){
  const s=94.4,p=f.point(s,n),base=heightAt(...p),post=beam('court-bollard',at(f,s,base,n),at(f,s,base+.85,n),.075,0x636e69);
  box('bollard-reflector',f,s-.075,s+.075,n-.077,n+.077,base+.65,base+.73,0xc7bd86,'metal',post);
 }
 const meshes=batches.map(b=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(b.colors,3));g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:b.glass?.3:.8,side:THREE.DoubleSide}));mesh.name=b.glass?'science2527-glass':'science2527-surfaces';mesh.castShadow=!b.glass;mesh.receiveShadow=true;shell.add(mesh);return mesh;});
 shell.userData.science2527Exterior={buildingIds:[SCIENCE25_ID,SCIENCE27_ID],floor:q.floor,floors25:q.floors25,floors27:q.floors27,bridgeFloor:q.bridgeFloor,routes:q.routes,pavementMasks,rawOsmFootprintsPreserved:true,dimensionsEstimated:true,floorCountsEstimated:true,bridgeFloorAssignmentEstimated:true,unobservedFacadesEstimated:true,west25EntrancePositionEstimated:true,east27CanopyLocationEstimated:true,wholeInteriorImplemented:false,mappedEntranceNodes:q.doors.flatMap(d=>d.node?[d.node]:[]),geometry:{meshes:meshes.length+signs.length,textures:signs.length,triangles:batches.reduce((n,b)=>n+b.positions.length/9,0)+signs.length*2,colliders:breakables.length}};
 function update(_player:THREE.Vector3){batches.forEach((b,index)=>{const a=meshes[index].geometry.attributes.position as THREE.BufferAttribute,c=meshes[index].geometry.attributes.color as THREE.BufferAttribute;let moved=false,tinted=false;for(const p of b.parts){if(p.shown!==p.proxy.visible){p.shown=p.proxy.visible;moved=true;if(p.shown)(a.array as Float32Array).set(p.original,p.start);else for(let i=p.start;i<p.end;i+=3){a.array[i]=p.proxy.position.x;a.array[i+1]=p.proxy.position.y;a.array[i+2]=p.proxy.position.z;}}if(p.color!==p.proxy.material.color.getHex()){p.color=p.proxy.material.color.getHex();tinted=true;const t=p.proxy.material.color,scale=[t.r/p.base.r,t.g/p.base.g,t.b/p.base.b];for(let i=p.start;i<p.end;i++)c.array[i]=p.colors[i-p.start]*scale[(i-p.start)%3];}}if(moved)a.needsUpdate=true;if(tinted)c.needsUpdate=true;});for(const s of signs)s.mesh.visible=s.owner.visible;shell.visible=batches.some(b=>b.parts.some(p=>p.proxy.visible));}
 // 렌더 버퍼와 복원용 사본을 만든 뒤 조립용 배열을 비운다.
 for(const batch of batches){batch.positions.length=0;batch.colors.length=0;}
 return{shell,breakables,update};
}




