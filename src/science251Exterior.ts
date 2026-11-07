import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import type { CampusBuilding } from './fullCampus';
import { humanities23Frame } from './humanities23Site';
import { physics561SurfaceHeight } from './physics561Site';
import { SCIENCE251_ID, type Science251Layout } from './science251Site';
import { SCIENCE24_ID } from './science24Site';
type XZ=[number,number];type Frame=ReturnType<typeof humanities23Frame>;type Proxy=THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
export function createScience251Exterior(scene:THREE.Scene,building:CampusBuilding,q:Science251Layout,heightAt:(x:number,z:number)=>number){
 const shell=new THREE.Group();shell.name='landmark/science251-exterior';Object.assign(shell.userData,{role:'building-shell',buildingId:SCIENCE251_ID,buildingIds:[SCIENCE251_ID]});scene.add(shell);
 

 let partBuilding=building.id;
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
    if (!owner) { proxy.position.copy(center); proxy.updateMatrixWorld(true); Object.assign(proxy.userData, { buildingId: partBuilding, component: name, renderProxy: true, convex: true }); breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attr.array), toughness: material === 'glass' ? 2 : 8, material, label: partBuilding===SCIENCE24_ID?'24동 연결교 접근 계단':'25-1동과 연결교' }); }
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
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;const ctx=canvas.getContext('2d')!;ctx.fillStyle=background;ctx.fillRect(0,0,canvas.width,128);ctx.fillStyle=color;ctx.font='bold 74px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,canvas.width/2,64);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const geometry=new THREE.PlaneGeometry(width,height);geometry.scale(-1,1,1);const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));mesh.name=name;mesh.position.copy(at(f,s,y,n));mesh.lookAt(at(f,s,y,n-1));shell.add(mesh);signs.push({mesh,owner});
  }

 const f=q.f,white=0xe0ded3,brick=0x925d46,metal=0x9ba5a3;
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


 const clip=(points:XZ[],axis:'s'|'n',value:number,greater:boolean)=>{
  const polygon=points.slice(0,-1),out:XZ[]=[];
  for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],va=f.local(a)[axis],vb=f.local(b)[axis],ia=greater?va>=value:va<=value,ib=greater?vb>=value:vb<=value;if(ia)out.push(a);if(ia!==ib){const t=(value-va)/(vb-va);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}}
  return out.length>2?[...out,out[0]]:[];
 };
 const strip=(a:number,b:number)=>clip(clip(q.main,'s',a,true),'s',b,false);
 slab('floor-slab-0',clip(q.main,'s',22,true),q.floor-.025,0xb4b7ad);
 slab('floor-slab-0',clip(clip(q.main,'s',22,false),'n',-12,true),q.floor-.025,0xb4b7ad);
 slab('floor-slab-1',clip(q.main,'s',22,false),q.floors[1],0xb4b7ad);slab('floor-slab-1',clip(q.main,'s',42,true),q.floors[1],0xb4b7ad);
 for(let level=2;level<6;level++)slab('floor-slab-'+level,clip(q.main,'s',level>=4?(level-3)*10:-1,true),q.floors[level],0xb4b7ad);
 const roofHeight=(s:number)=>q.floor+(s<10?14:s<20?17.5:21);
 for(const[a,b]of[[-1,10],[10,20],[20,f.length+.1]]){
  const poly=strip(a,b),y=roofHeight((a+b)/2);slab('stepped-roof',poly,y,0xc2c4b6);
  for(let i=0;i<poly.length-1;i++){const e=humanities23Frame(poly[i],poly[i+1]);const owner=box('roof-parapet',e,0,e.length,-.12,.16,y,y+.65,0xb8bdb1);box('parapet-cap',e,0,e.length,-.17,.2,y+.65,y+.75,white,'stone',owner);}
 }
 for(const position of[10,20]){const e=humanities23Frame(f.point(position,0),f.point(position,-21.5));box('stepped-roof-return',e,0,e.length,-.15,.15,roofHeight(position-.1),roofHeight(position+.1),0xc2c8bc);}
 const outline=q.main;
 for(let edge=0;edge<4;edge++){
  const e=humanities23Frame(outline[edge],outline[edge+1]),mid=f.local(e.point(e.length/2)),long=e.length>40,north=long&&mid.n>-5;
  for(let level=0;level<6;level++){
   const low=q.floors[level],high=low+3.5,cuts=[0,e.length];
   for(let s=0;s<e.length;s+=4.6)cuts.push(s);
   if(long)for(const s of[10,20,22,42,49,59]){const a=f.local(outline[edge]).s,b=f.local(outline[edge+1]).s,t=(s-a)/(b-a);if(t>0&&t<1)cuts.push(t*e.length);}
   const sorted=[...new Set(cuts)].sort((a,b)=>a-b);
   for(let i=1;i<sorted.length;i++){
    const a=sorted[i-1],b=sorted[i],m=f.local(e.point((a+b)/2));if(b-a<.04||low>=roofHeight(m.s)-.01)continue;
    if(north&&m.s>49&&m.s<59)continue;
    if(!north&&long&&((level===0&&m.s<42)||(level===1&&m.s>22&&m.s<42)))continue;
    if(!long&&edge===3&&level===0&&m.n<-12)continue;
    if(b-a<.55){wall('narrow-brick-pier',e,a,b,low,high-.08);continue;}
    const glassLower=north&&level<2;
    if(glassLower){window(e,a+.04,b-.04,low+.05,high-.25,'north-lobby-glazing');continue;}
    const sill=.95,head=high-.55,wa=a+.13,wb=b-.13;
    wall('red-brick-spandrel',e,a,b,low,low+sill);wall('red-brick-header',e,a,b,head,high-.08);
    const win=window(e,wa,wb,low+sill,head,'ribbon-window');
    for(let s=wa+.8;s<wb;s+=.8)box('ribbon-mullion',e,s-.025,s+.025,-.13,.04,low+sill,head,metal,'metal',win);
    box('ribbon-transom',e,wa,wb,-.13,.04,head-.38,head-.34,metal,'metal',win);
    for(const s of[a,b])box('light-facade-pier',e,s-.075,s+.075,-.16,.13,low+sill,high-.1,white,'stone',win);
    if(level>1&&i%3===0){const ac=box('facade-air-conditioner',e,a+.4,Math.min(a+1.1,b-.1),-.55,-.13,low+.15,low+.7,0xb8c2ba,'metal',win);for(let y=low+.25;y<low+.65;y+=.1)facet('ac-front-grille',e,a+.46,Math.min(a+1.04,b-.16),y,y+.015,-.556,0x657873,ac);}
   }
  }
  // 외벽 아래의 석재 기단은 높아진 실내 바닥과 지면 사이를 막는다.
  if(north||!long){const base=Math.min(heightAt(...e.point(0)),heightAt(...e.point(e.length)),q.floor-.3)-.2;if(north||edge!==3)box('stone-foundation',e,0,e.length,-.17,.17,base,q.floor,0xa4a99f);}
  if(long){const s=north?27:22,p=f.point(s,north?.2:-21.2),l=e.local(p),y=roofHeight(s)-.7;const owner=box('building-number-board',e,l.s-1.5,l.s+1.5,-.2,-.17,y-.65,y+.5,brick);label('building-number-251-'+edge,'25-1',e,l.s,-.21,y,2.5,.9,owner,'#925d46','#f4f1e8');}
 }
 // 필로티 뒤쪽의 유리벽과 현관은 주차장 쪽 거리뷰를 참고했다.
 const lobby=humanities23Frame(f.point(42,-12),f.point(0,-12));
 for(let s=0;s<lobby.length;s+=3.5){const end=Math.min(s+3.5,lobby.length),mid=f.local(lobby.point((s+end)/2)).s,levelCount=mid<22?1:2;
  for(let level=0;level<levelCount;level++){const low=q.floor+level*3.5,high=low+3.5,door=level===0&&mid>34&&mid<38;
   if(door){box('lobby-entry-header',lobby,s,end,-.1,.1,low+2.8,high,metal,'metal');continue;}
   const pane=window(lobby,s+.04,end-.04,low+.04,high-.05,'piloti-lobby-glass');for(const h of[.8,1.8,2.7])box('lobby-transom',lobby,s,end,-.14,.08,low+h,low+h+.05,metal,'metal',pane);
  }
 }
 for(const s of[0,5.5,11,16.5,22,28.6,34.4,40.2]){
  const low=s<22?q.garageFloor:q.floor,height=s<22?3.5:7;
  const owner=box('piloti-square-column',f,s-.32,s+.32,-21.9,-21.2,low,q.floor+height,white);
  for(let y=low+.75;y<q.floor+height;y+=.75)facet('column-panel-joint',humanities23Frame(f.point(s-.32,-21.9),f.point(s+.32,-21.9)),0,.64,y,y+.014,-.004,0x949d93,owner);
 }
 // 북동쪽 돌출부는 밝은 패널과 세로 유리창으로 구분한다.
 const core=humanities23Frame(f.point(59,1.6),f.point(49,1.6)),coreRoof=q.floor+23.8;
 for(let level=0;level<6;level++){
  const low=q.floors[level],high=low+3.5,door=level===0||level===2,doorS=59-q.doorLocal.s,half=level===0?1.9:1.65,cuts=[0,10,7,9,...(door?[doorS-half,doorS+half]:[])].sort((a,b)=>a-b);
  for(let i=1;i<cuts.length;i++){const a=cuts[i-1],b=cuts[i],m=(a+b)/2;if(b-a<.01)continue;
   if(door&&m>doorS-half&&m<doorS+half){box('core-entry-header',core,a,b,-.15,.15,low+2.8,high,white);for(const v of[a,b])box('core-door-jamb',core,v-.025,v+.025,-.17,.17,low,low+2.8,metal,'metal');continue;}
   if(m>7&&m<9){window(core,a+.03,b-.03,low+.03,high-.08,'core-vertical-glazing');continue;}
   const owner=box('light-core-panel',core,a,b,-.15,.15,low,high,0xc2c8bc);for(let y=low+.7;y<high;y+=.7)facet('core-panel-joint',core,a,b,y,y+.012,-.156,0x8d9c90,owner);
  }
  box('core-floor',f,49,59,0,1.6,low-.24,low,0xb4b7ad);
 }
 for(const s of[49,59])box('core-side-wall',f,s-.1,s+.1,0,1.6,q.floor,coreRoof,0xc2c8bc);
 box('core-roof-box',f,49,59,0,1.6,q.floor+21,coreRoof,0xc2c8bc);box('core-roof',f,48.8,59.2,-.2,1.8,coreRoof,coreRoof+.25,white);
 // 낮은 둥근 돌출부의 윤곽은 원본 꼭짓점을 참고해 부드러운 곡선으로 근사한다.
 slab('round-ground-floor',q.round,q.floor,0xb5b8ad);slab('round-upper-floor',q.round,q.floor+3.5,0xb5b8ad);slab('round-green-roof',q.round,q.roundRoof,0x688d76);
 for(let i=0;i<q.roundArc.length-1;i++){
  const e=humanities23Frame(q.roundArc[i],q.roundArc[i+1]),length=e.length,base=Math.min(heightAt(...q.roundArc[i]),heightAt(...q.roundArc[i+1]))-.2;
  const lower=wall('round-brick-base',e,0,length,base,q.floor+.8);wall('round-brick-middle',e,0,length,q.floor+1.6,q.floor+3.7);
  if(i%3===1){window(e,.12,length-.12,q.floor+.8,q.floor+1.6,'round-small-window');}else wall('round-small-window-spandrel',e,0,length,q.floor+.8,q.floor+1.6);
  if(i%4!==0){const w=window(e,.05,length-.05,q.floor+3.7,q.floor+5.7,'round-upper-window');box('round-window-hood',e,0,length,-.55,.12,q.floor+5.7,q.floor+5.86,0x788d83,'metal',w);}else wall('round-brick-pier',e,0,length,q.floor+3.7,q.floor+5.7);
  wall('round-brick-parapet',e,0,length,q.floor+5.7,q.roundRoof+.55);box('round-parapet-cap',e,0,length,-.22,.2,q.roundRoof+.55,q.roundRoof+.7,white,'stone',lower);
 }
 // 옥상의 격자 구조와 설비 줄은 공식 VR에서 보이는 형태를 근사한다.
 const roof=q.floor+21,roofOwner=box('roof-service-strip',f,22,65,-16,-13,roof,roof+.25,0x9ea99c);
 for(let s=22;s<=65;s+=2.8)box('roof-lattice-cross-beam',f,s,s+.2,-18,-5,roof+1.5,roof+1.75,white,'metal',roofOwner);
 for(const n of[-18,-13,-9,-5])box('roof-lattice-long-beam',f,22,65,n,n+.18,roof+1.5,roof+1.75,white,'metal',roofOwner);
 for(let s=24;s<63;s+=5)box('roof-ac-unit',f,s,s+1.1,-19.5,-18.4,roof,roof+.9,0xc8cdc2,'metal',roofOwner);
 for(const s of[27,51])box('roof-core',f,s,s+7,-9,-3,roof,roof+2.4,0xc5c9bc);

 for(const a of q.surfaces){
  partBuilding=a.buildingId;const e=a.frame,corners=a.polygon??[e.point(a.s0,a.n0),e.point(a.s1,a.n0),e.point(a.s1,a.n1),e.point(a.s0,a.n1)],top=corners.map((p,i)=>{const l=e.local(p);return new THREE.Vector3(p[0],a.cornerHeights?.[i]??physics561SurfaceHeight(a,l.s,l.n),p[1]);});
  const owner=part(a.name,[...top,...top.map(p=>new THREE.Vector3(p.x,a.elevated?p.y-.24:Math.min(p.y-.25,heightAt(p.x,p.z)-.22),p.z))],a.name.includes('stair')?0xa5aaa5:a.name==='west-parking-paving'?0x79837c:0x929c91);
  if(!a.elevated)pavementMasks.push({component:a.name,polygon:corners});
  if(/paving$|landing$/.test(a.name)&&!a.name.includes('parking')&&!a.name.includes('north-stair'))for(let n=a.n0;n<a.n1;n+=.5)for(let s=a.s0;s<a.s1;s+=.75){const endS=Math.min(s+.73,a.s1),endN=Math.min(n+.48,a.n1),y=a.y0+.006;part('pavement-block',[at(e,s,y,n),at(e,endS,y,n),at(e,endS,y,endN),at(e,s,y,endN)],(Math.round(s+n)%3)?0xa8afa4:0x88988b,'stone',owner,true);}
  if(a.name.endsWith('stair'))part('stair-nosing',[at(e,a.s0,a.y0+.007,a.n0),at(e,a.s0+.035,a.y0+.007,a.n0),at(e,a.s0+.035,a.y0+.007,a.n1),at(e,a.s0,a.y0+.007,a.n1)],0x56665c,'stone',owner,true);
  if(a.name==='south-entry-ramp'||a.name==='north-entry-ramp')for(const n of[a.n0-.05,a.n1+.05]){const p=at(e,a.s0,a.y0+.9,n),end=at(e,a.s1,a.y1+.9,n),rail=beam('entry-ramp-handrail',p,end,.025,metal);for(let s=a.s0;s<=a.s1;s+=1.5){const y=physics561SurfaceHeight(a,s,n);beam('entry-ramp-post',at(e,s,y,n),at(e,s,y+.9,n),.02,metal,rail);}}
 }
 partBuilding=SCIENCE251_ID;
 // 2011년 거리뷰에서 지붕과 난간 사이가 열린 모습을 확인했다. 현재 상태와 치수는 미확인이다.
 for(let i=0;i<q.bridgeEdges.length-1;i++){
  const a=q.bridgeEdges[i],b=q.bridgeEdges[i+1],top=[a.right,b.right,b.left,a.left].map((p,k)=>new THREE.Vector3(p[0],(k===0||k===3?a.y:b.y)+2.85,p[1]));
  const roof=part('curved-gray-bridge-roof',[...top,...top.map(p=>p.clone().add(new THREE.Vector3(0,.15,0)))],0x8d9da2,'metal');
  for(const key of['left','right'] as const){const p=new THREE.Vector3(a[key][0],a.y,a[key][1]),end=new THREE.Vector3(b[key][0],b.y,b[key][1]);for(const h of[.4,.8,1.15])beam('bridge-handrail',p.clone().add(new THREE.Vector3(0,h,0)),end.clone().add(new THREE.Vector3(0,h,0)),.022,0x748b8b);if(i%2===0)beam('bridge-roof-post',p,end.clone().copy(p).add(new THREE.Vector3(0,2.85,0)),.035,0x94a4a1,roof);}
  beam('bridge-roof-seam',top[0].clone().add(new THREE.Vector3(0,.16,0)),top[3].clone().add(new THREE.Vector3(0,.16,0)),.012,0x63797e,roof);
 }
 for(const i of[4,14])for(const key of['left','right'] as const){const p=q.bridgeEdges[i],point=p[key],base=heightAt(...point);beam('bridge-ground-support',new THREE.Vector3(point[0],base,point[1]),new THREE.Vector3(point[0],p.y-.24,point[1]),.13,0xa5b5ae);}
 // 낮은 화단과 볼라드, 벤치는 확인한 종류를 반영하고 위치를 근사한다.
 for(const [s,n]of[[25,-30],[29,-30],[41,-30]]){const p=f.point(s,n),y=heightAt(...p),post=box('parking-square-bollard',f,s-.17,s+.17,n-.17,n+.17,y,y+.55,0xb9c0b2);box('bollard-cap',f,s-.18,s+.18,n-.18,n+.18,y+.55,y+.6,white,'stone',post);}
 for(let i=3;i<q.roundArc.length-3;i+=4){const p=q.roundArc[i],l=f.local(p),n=l.n-1.1,y=heightAt(...f.point(l.s,n));const planter=box('round-front-planter',f,l.s-1.25,l.s+1.25,n-.45,n+.45,y,y+.55,0xb8bdae);box('clipped-shrub',f,l.s-1.2,l.s+1.2,n-.4,n+.4,y+.55,y+1.1,0x566c46,'wood',planter);}
 for(const [s,n]of[[39,5.5],[63,-40]]){const p=f.point(s,n),y=heightAt(...p),bench=box('wood-bench',f,s-1,s+1,n-.25,n+.25,y+.4,y+.5,0x795f47,'wood');for(const v of[-.7,.7])box('bench-leg',f,s+v-.06,s+v+.06,n-.2,n+.2,y,y+.4,0x546354,'metal',bench);box('bench-back',f,s-1,s+1,n+.2,n+.28,y+.5,y+.95,0x795f47,'wood',bench);}

 // 주차장 포장과 구획선은 실제 지형 삼각형 위에 놓아 지면과 맞춘다.
 const parkingPolygons:XZ[][]=[[[0,-23],[40,-23],[40,-39],[6,-39]],[[6,-39],[72,-39],[72,-55],[13,-55]]].map(poly=>poly.map(p=>f.point(p[0],p[1])));
 const groundMesh=scene.getObjectByName('campus-terrain') as THREE.Mesh<THREE.BufferGeometry>,groundPositions=groundMesh.geometry.attributes.position,groundIndices=groundMesh.geometry.index;
 const groundTriangles:THREE.Vector3[][]=[];
 if(groundIndices)for(let i=0;i<groundIndices.count;i+=3){const vertices=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(groundPositions,groundIndices.getX(i+k))),locals=vertices.map(v=>f.local([v.x,v.z]));if(Math.max(...locals.map(p=>p.s))>=-1&&Math.min(...locals.map(p=>p.s))<=73&&Math.max(...locals.map(p=>p.n))>=-56&&Math.min(...locals.map(p=>p.n))<=-22)groundTriangles.push(vertices);}
 const paintOwner=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshStandardMaterial({color:0xffffff}));
 function groundPaint(polygon:XZ[],color:number,offset:number){
  const area=polygon.reduce((sum,a,i)=>{const b=polygon[(i+1)%polygon.length];return sum+a[0]*b[1]-b[0]*a[1];},0),sign=Math.sign(area);
  for(const triangle of groundTriangles){let clipped=triangle.map(p=>p.clone());for(let i=0;i<polygon.length&&clipped.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],distance=(p:THREE.Vector3)=>sign*((b[0]-a[0])*(p.z-a[1])-(b[1]-a[1])*(p.x-a[0])),next:THREE.Vector3[]=[];for(let j=0;j<clipped.length;j++){const p=clipped[j],v=clipped[(j+1)%clipped.length],dp=distance(p),dv=distance(v);if(dp>=-1e-7)next.push(p);if((dp>=0)!==(dv>=0))next.push(p.clone().lerp(v,dp/(dp-dv)));}clipped=next;}
   if(clipped.length>=3&&clipped[1].clone().sub(clipped[0]).cross(clipped[2].clone().sub(clipped[0])).lengthSq()>1e-12)part('parking-ground-overlay',clipped.map(p=>p.add(new THREE.Vector3(0,offset,0))),color,'stone',paintOwner,true);
  }
 }
 for(const polygon of parkingPolygons)groundPaint(polygon,0x687570,.025);
 const stripe=(s0:number,s1:number,n0:number,n1:number)=>groundPaint([f.point(s0,n0),f.point(s1,n0),f.point(s1,n1),f.point(s0,n1)],0xd5d8c9,.034);
 for(const[rowStart,rowEnd,n0,n1]of[[15,66,-53,-48],[10,37,-37,-32]]){for(let s=rowStart;s<=rowEnd;s+=3)stripe(s,s+.08,n0,n1);stripe(rowStart,rowEnd,n1-.08,n1);}
 for(const [s,n]of[[18,-30],[66,-42]]){const p=f.point(s,n),base=heightAt(...p),post=beam('globe-lamp-post',at(f,s,base,n),at(f,s,base+3,n),.055,0x5a6550);const g=new THREE.IcosahedronGeometry(.24,1),a=g.attributes.position;part('lamp-globe',Array.from({length:a.count},(_,i)=>new THREE.Vector3(a.getX(i),a.getY(i),a.getZ(i)).add(at(f,s,base+3.2,n))),0xd8debf,'glass',post);g.dispose();}
 const meshes=batches.map(b=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(b.colors,3));g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:b.glass?.3:.8,side:THREE.DoubleSide}));mesh.name=b.glass?'science251-glass':'science251-surfaces';mesh.castShadow=!b.glass;mesh.receiveShadow=true;shell.add(mesh);return mesh;});
 shell.userData.science251Exterior={buildingIds:[SCIENCE251_ID],affectedBuildingIds:[SCIENCE251_ID,SCIENCE24_ID],floor:q.floor,floors:q.floors,routes:q.routes,pavementMasks,rawDataPreserved:true,curvedOutlineEstimated:true,dimensionsEstimated:true,floorCountsEstimated:true,bridge24FloorDocumented:true,bridge251FloorEstimated:true,bridgeSidesObserved2011:true,currentBridgeEnclosureUnverified:true,interiorStairPositionEstimated:true,unobservedFacadesEstimated:true,wholeInteriorImplemented:false,mappedEntranceNodes:['4562088371'],geometry:{meshes:meshes.length+signs.length,textures:signs.length,triangles:batches.reduce((n,b)=>n+b.positions.length/9,0)+signs.length*2,colliders:breakables.length}};
 function update(_player:THREE.Vector3){batches.forEach((b,index)=>{const a=meshes[index].geometry.attributes.position as THREE.BufferAttribute,c=meshes[index].geometry.attributes.color as THREE.BufferAttribute;let moved=false,tinted=false;for(const p of b.parts){if(p.shown!==p.proxy.visible){p.shown=p.proxy.visible;moved=true;if(p.shown)(a.array as Float32Array).set(p.original,p.start);else for(let i=p.start;i<p.end;i+=3){a.array[i]=p.proxy.position.x;a.array[i+1]=p.proxy.position.y;a.array[i+2]=p.proxy.position.z;}}if(p.color!==p.proxy.material.color.getHex()){p.color=p.proxy.material.color.getHex();tinted=true;const t=p.proxy.material.color,scale=[t.r/p.base.r,t.g/p.base.g,t.b/p.base.b];for(let i=p.start;i<p.end;i++)c.array[i]=p.colors[i-p.start]*scale[(i-p.start)%3];}}if(moved)a.needsUpdate=true;if(tinted)c.needsUpdate=true;});for(const s of signs)s.mesh.visible=s.owner.visible;shell.visible=batches.some(b=>b.parts.some(p=>p.proxy.visible));}
 return{shell,breakables,update};
}




