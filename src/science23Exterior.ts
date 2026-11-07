import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import type { CampusBuilding } from './fullCampus';
import { humanities23Frame } from './humanities23Site';
import { physics561SurfaceHeight } from './physics561Site';
import { SCIENCE23_ID, type Science23Layout } from './science23Site';
type XZ=[number,number];type Frame=ReturnType<typeof humanities23Frame>;type Proxy=THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
export function createScience23Exterior(scene:THREE.Scene,building:CampusBuilding,q:Science23Layout,heightAt:(x:number,z:number)=>number){
 const shell=new THREE.Group();shell.name='landmark/science23-exterior';Object.assign(shell.userData,{role:'building-shell',buildingId:SCIENCE23_ID,buildingIds:[SCIENCE23_ID]});scene.add(shell);

 const signs:{mesh:THREE.Mesh;owner:Proxy}[]=[];
  const breakables: BreakableSpec[] = [];
  const batches = [false, true].map(glass => ({ glass, positions: [] as number[], colors: [] as number[], parts: [] as { proxy: Proxy; start: number; end: number; original: Float32Array; colors: Float32Array; base: THREE.Color; color: number; shown: boolean }[] }));
  const at = (f: Frame, s: number, y: number, n = 0) => { const p = f.point(s, n); return new THREE.Vector3(p[0], y, p[1]); };
  function part(name: string, vertices: THREE.Vector3[], color: number, material: BreakableSpec['material'] = 'stone', owner?: Proxy, flat = false) {
    const bounds = new THREE.Box3().setFromPoints(vertices), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const g = flat ? new THREE.BufferGeometry() : new ConvexGeometry(vertices.map(p => p.clone().sub(center)));
    if (flat) { const values: number[] = []; for (let i = 1; i + 1 < vertices.length; i++) for (const p of [vertices[0], vertices[i], vertices[i + 1]]) values.push(...p.clone().sub(center).toArray()); g.setAttribute('position', new THREE.Float32BufferAttribute(values, 3)); }
    const attr = g.attributes.position, proxy = owner ?? new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color }));
    if (!owner) { proxy.position.copy(center); proxy.updateMatrixWorld(true); Object.assign(proxy.userData, { buildingId: building.id, component: name, renderProxy: true, convex: true }); breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attr.array), toughness: material === 'glass' ? 2 : 8, material, label: '23동' }); }
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
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const ctx=canvas.getContext('2d')!;ctx.fillStyle=background;ctx.fillRect(0,0,canvas.width,128);ctx.fillStyle=color;ctx.font='bold 92px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,canvas.width/2,64);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const geometry=new THREE.PlaneGeometry(width,height);geometry.scale(-1,1,1);const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));mesh.name=name;mesh.position.copy(at(f,s,y,n));mesh.lookAt(at(f,s,y,n-1));shell.add(mesh);signs.push({mesh,owner});
  }




 const f=q.f, white=0xd9d8cd, brick=0x695342, stone=0x909b98, pavementMasks:{component:string;polygon:XZ[]}[]=[];
 function wall(name:string,frame:Frame,a:number,b:number,ya:number,yb:number,cladding:'brick'|'stone'){
  const owner=box(name,frame,a,b,-.17,.17,ya,yb,cladding==='brick'?brick:stone);
  const row=cladding==='brick'?.15:.36, unit=cladding==='brick'?.45:.6;
  for(let y=ya+row;y<yb;y+=row)for(const n of[-.174])facet('masonry-bed-joint',frame,a,b,y,Math.min(y+.009,yb),n,cladding==='brick'?0x9a866b:0x526360,owner);
  for(let y=ya;y<yb;y+=row)for(let s=a+unit/2*(Math.round((y-ya)/row)%2);s<b;s+=unit)for(const n of[-.174])facet('masonry-head-joint',frame,s,Math.min(s+.009,b),y,Math.min(y+row,yb),n,cladding==='brick'?0x9a866b:0x526360,owner);
  return owner;
 }
 function window(name:string,frame:Frame,a:number,b:number,ya:number,yb:number,barred=false){
  const owner=box(name,frame,a,b,-.045,.045,ya,yb,0x7d9da7,'glass');
  for(const s of[a,(a+b)/2,b])box('blue-window-mullion',frame,s-.035,s+.035,-.09,.09,ya,yb,0x244555,'metal',owner);
  for(const y of[ya,yb-.34,yb])box('blue-window-transom',frame,a,b,-.09,.09,y-.035,y+.035,0x244555,'metal',owner);
  if(!barred){box('window-vent-panel',frame,b-.32,b-.02,-.095,-.09,yb-.31,yb-.03,0x243f46,'metal',owner);for(let y=yb-.28;y<yb;y+=.06)box('vent-louver',frame,b-.32,b-.02,-.105,-.095,y,y+.015,0x627371,'metal',owner);}
  if(barred)for(let s=a+.12;s<b;s+=.17)beam('ground-window-bars',at(frame,s,ya,-.21),at(frame,s,yb,-.21),.017,0x63776d,owner);
 }
 const ring=[building.points[2],building.points[4],building.points[6],building.points[0],building.points[2]];
 for(const [i,y]of [...q.floors,q.roof].entries()){
  const points=ring.slice(0,-1).map(p=>new THREE.Vector2(...p));
  for(const ids of THREE.ShapeUtils.triangulateShape(points,[])){const top=ids.map(id=>new THREE.Vector3(points[id].x,y,points[id].y));part('floor-slab-'+i,[...top,...top.map(p=>p.clone().add(new THREE.Vector3(0,-.24,0)))],i===q.floors.length?0x738875:0xb9beb3);}
 }
 for(let edge=0;edge<4;edge++){
  const frame=humanities23Frame(ring[edge],ring[edge+1]),isLong=edge===0||edge===2,south=edge===0;
  for(let level=0;level<q.floors.length;level++){
   const y=q.floors[level],top=q.floors[level+1]??q.roof,cladding=level===0?'stone':'brick',cuts=[0,frame.length],openings:{a:number;b:number}[]=[];
   const opening=(lo:number,hi:number)=>{const a=Math.max(0,lo),b=Math.min(frame.length,hi);if(b>a){cuts.push(a,b);openings.push({a,b});}};
   for(let s=6.6;s<frame.length;s+=6.6)cuts.push(s);
   for(const d of q.doors.filter(d=>d.level===level)){const p=frame.local(d.point);if(Math.abs(p.n)<.1&&p.s>=0&&p.s<=frame.length)opening(p.s-d.width/2,p.s+d.width/2);}
   if(level===0){
    if(edge===0)opening(0,7.2);
    if(edge===2)opening(frame.length-7.2,frame.length);
    if(edge===3)opening(0,frame.length);
   }
   const sorted=[...new Set(cuts)].sort((a,b)=>a-b);
   for(let i=1;i<sorted.length;i++){
    const a=sorted[i-1],b=sorted[i];if(b-a<.02)continue;
    if(openings.some(o=>(a+b)/2>o.a-1e-5&&(a+b)/2<o.b+1e-5)){
     box('entry-header',frame,a,b,-.18,.18,y+2.9,top-.24,white);
     continue;
    }
    if(b-a<1.1){wall('narrow-pier',frame,a,b,y,top-.24,cladding);continue;}
    if(!isLong){
     // 동쪽 끝의 중앙 창은 로드뷰에서 확인했다. 서쪽과 북쪽의 가려진 세부는 근사다.
     const middle=frame.length/2,lo=Math.max(a,middle-1.25),hi=Math.min(b,middle+1.25);
     if(hi-lo>.2){if(lo>a)wall('end-masonry',frame,a,lo,y,top-.24,cladding);if(hi<b)wall('end-masonry',frame,hi,b,y,top-.24,cladding);wall('end-window-sill',frame,lo,hi,y,y+.9,cladding);wall('end-window-head',frame,lo,hi,top-.55,top-.24,cladding);window('end-blue-window',frame,lo,hi,y+.9,top-.55,level===0);}
     else wall('end-masonry',frame,a,b,y,top-.24,cladding);
     continue;
    }
    const large=level<=1,winWidth=large?(b-a-.35)/2:Math.min(2.05,(b-a-.8)/2),gap=large?.12:(b-a-2*winWidth)/3;
    const positions=large?[a+.12,(a+b)/2+.05]:[a+gap,a+2*gap+winWidth];
    const bottom=y+(level===0?.85:large?.85:1.05),windowTop=large?top-.55:top-.85;
    wall('masonry-spandrel',frame,a,b,y,bottom,cladding);wall('masonry-head',frame,a,b,windowTop,top-.24,cladding);
    let last=a;
    for(const lo of positions){const hi=Math.min(b-.08,lo+winWidth);if(lo>last)wall('window-side-masonry',frame,last,lo,bottom,windowTop,cladding);window(level===0?'barred-stone-window':large?'large-blue-window':'paired-blue-window',frame,lo,hi,bottom,windowTop,level===0);last=hi;}
    if(last<b)wall('window-side-masonry',frame,last,b,bottom,windowTop,cladding);
    if(south&&level===1)box('deep-white-window-fin',frame,a-.07,a+.07,-.65,.17,y+.1,top-.2,white);
   }
   for(let s=0;s<=frame.length;s+=6.6)if(!(level===0&&f.local(frame.point(s)).s<7.1))box('white-frame-column',frame,s-.12,s+.12,-.25,.25,y,top,white);
   box('white-floor-band',frame,0,frame.length,-.25,.25,top-.35,top+.08,white);
  }
  box('deep-white-eaves',frame,-.35,frame.length+.35,-.75,.45,q.roof-.22,q.roof,white);
  box('roof-parapet-base',frame,0,frame.length,-.17,.17,q.roof,q.roof+.35,white);
  box('roof-parapet-cap',frame,0,frame.length,-.17,.17,q.roof+.88,q.roof+1.12,white);
  for(let s=.1;s<frame.length;s+=6.6)box('roof-parapet-post',frame,s,s+.2,-.17,.17,q.roof+.3,q.roof+1,white);
 }
 // 서쪽 하부를 관통 공간으로 열고 안쪽 벽의 출입구는 지도 좌표에 맞춘다.
 const west=q.doors.find(d=>d.name==='west')!,south=q.doors.find(d=>d.name==='south')!,east=q.doors.find(d=>d.name==='east')!;
 const passageWall=humanities23Frame(f.point(7.2,0),f.point(7.2,q.depth));
 for(const [a,b]of [[0,west.n-1.4],[west.n+1.4,q.depth]])box('passage-inner-wall',passageWall,a,b,-.14,.14,q.floor,q.floors[1]-.24,0xa2a9a0);
 box('passage-inner-header',passageWall,west.n-1.4,west.n+1.4,-.14,.14,q.floor+2.8,q.floors[1]-.24,white);
 for(const s of[.18,7.1])for(const n of[.2,q.depth-.2])box('passage-white-column',f,s-.16,s+.16,n-.16,n+.16,q.floor,q.floors[1],white);
 for(const d of[south,east]){
  const frame=d.name==='south'?f:humanities23Frame(ring[1],ring[2]),p=frame.local(d.point),back=3;
  // 출입구 안쪽은 짧은 현관으로만 구현한다.
  box('entry-vestibule-back',frame,p.s-1.6,p.s+1.6,back-.12,back+.12,d.floor,d.floor+2.8,0xaeb5ad);
  for(const s of[p.s-1.6,p.s+1.6])box('entry-vestibule-side',frame,s-.12,s+.12,.2,back,d.floor,d.floor+2.8,0xaeb5ad);
  for(const s of[p.s-1.4,p.s+1.4])box('entry-metal-jamb',frame,s-.045,s+.045,-.19,.19,d.floor,d.floor+2.8,0x334e55,'metal');
 }
 for(const a of q.surfaces){
  const corners=[f.point(a.s0,a.n0),f.point(a.s1,a.n0),f.point(a.s1,a.n1),f.point(a.s0,a.n1)],top=corners.map(p=>{const l=f.local(p);return new THREE.Vector3(p[0],physics561SurfaceHeight(a,l.s,l.n),p[1]);});
  const owner=part(a.name,[...top,...top.map(p=>new THREE.Vector3(p.x,Math.min(p.y-.25,heightAt(p.x,p.z)-.22),p.z))],a.name.includes('stair')?0x909f9d:0xa8a692);
  pavementMasks.push({component:a.name,polygon:corners});
  if(a.name==='south-court-paving'||a.name==='south-wall-apron'){
   for(let n=a.n0;n<a.n1;n+=.25)for(let s=a.s0;s<a.s1;s+=.5){const hi=Math.min(s+.48,a.s1),nn=Math.min(n+.23,a.n1),color=[0x93998b,0xaaa996,0x9c9e8c][Math.abs(Math.round(s*2+n*4))%3];part('paving-block-joints',[at(f,s,a.y0+.006,n),at(f,hi,a.y0+.006,n),at(f,hi,a.y0+.006,nn),at(f,s,a.y0+.006,nn)],color,'stone',owner,true);}
  }
  if(a.name.includes('stair')&&!a.name.includes('landing'))part('stair-bright-nosing',[at(f,a.s0,a.y0+.004,a.n0),at(f,a.s1,a.y0+.004,a.n0),at(f,a.s1,a.y0+.004,a.n0+.035),at(f,a.s0,a.y0+.004,a.n0+.035)],0xc8cdc1,'stone',owner,true);
  if(a.name==='south-lower-stair'||a.name==='south-upper-stair'||a.name==='south-stair-middle-landing'||a.name==='south-entry-landing')for(const s of[a.s0,a.s1]){
   const next=q.surfaces.find(b=>b.name===a.name&&Math.abs(b.n0-a.n1)<1e-5),endHeight=next?.y0??a.y0,vertices:THREE.Vector3[]=[];
   for(const x of[s-.14,s+.14])for(const [n,y]of[[a.n0,a.y0],[a.n1,endHeight]])for(const h of[q.court-.15,y+.8])vertices.push(at(f,x,h,n));
   const cheek=part('white-stair-cheek',vertices,white);
   if(a.name.includes('landing'))for(let n=a.n0+.2;n<a.n1-.2;n+=.8){const face=humanities23Frame(f.point(s-.145,n),f.point(s-.145,n+.45));for(const y of[a.y0+.25,a.y0+.58])facet('cheek-square-relief',face,0,.45,y,y+.025,0,0xa4aba3,cheek);for(const x of[0,.43])facet('cheek-square-relief',face,x,x+.025,a.y0+.25,a.y0+.6,0,0xa4aba3,cheek);}
  }
 }
 // 벤치와 낮은 식재대는 공식 사진에서 확인한 형태를 가까운 앞마당에 근사 배치한다.
 for(const s of[14,22]){
  const n=-6.8,y=q.court,seat=box('wood-bench-seat',f,s-1,s+1,n-.3,n+.3,y+.42,y+.52,0x976139,'wood');
  for(const x of[s-.8,s+.8])box('bench-black-leg',f,x-.05,x+.05,n-.25,n+.25,y,y+.43,0x303f3a,'metal',seat);
  for(let v=0;v<3;v++)box('bench-back-slat',f,s-1,s+1,n+.24,n+.32,y+.65+v*.13,y+.74+v*.13,0x9c663a,'wood',seat);
 }
 for(const [s0,s1]of[[9,18],[21,28]]){
  const planter=box('south-low-planter',f,s0,s1,-2.3,-.4,q.court,q.court+.45,0x939e91);
  box('low-hedge',f,s0+.2,s1-.2,-2.1,-.6,q.court+.4,q.court+.95,0x63714a,'wood',planter);
  beam('planter-front-rail',at(f,s0,q.court+1.1,-2.3),at(f,s1,q.court+1.1,-2.3),.025,0x83968b,planter);
  for(let s=s0;s<=s1;s+=1.5)beam('planter-rail-post',at(f,s,q.court+.4,-2.3),at(f,s,q.court+1.1,-2.3),.022,0x83968b,planter);
 }
 const board=box('23-number-board',f,34,36,-.78,-.75,q.roof-.17,q.roof+.65,white);
 label('23-building-number','23',f,35,-.785,q.roof+.25,1.5,.85,board,'#d9d8cd','#394f4b');
 const meshes=batches.map(b=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(b.colors,3));g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:b.glass?.3:.8,side:THREE.DoubleSide}));mesh.name=b.glass?'science23-glass':'science23-surfaces';mesh.castShadow=!b.glass;mesh.receiveShadow=true;shell.add(mesh);return mesh;});
 shell.userData.science23Exterior={buildingIds:[SCIENCE23_ID],floors:q.floors,doors:q.doors,dimensionsEstimated:true,floorAssignmentsEstimated:true,rearFacadeEstimated:true,wholeInteriorImplemented:false,passagePathEstimated:true,entranceCoordinatesFromOsm:true,routes:q.routes,pavementMasks,geometry:{meshes:meshes.length+signs.length,textures:signs.length,triangles:batches.reduce((n,b)=>n+b.positions.length/9,0)+signs.length*2,colliders:breakables.length}};
 function update(_player:THREE.Vector3){batches.forEach((b,index)=>{const a=meshes[index].geometry.attributes.position as THREE.BufferAttribute,c=meshes[index].geometry.attributes.color as THREE.BufferAttribute;let moved=false,tinted=false;for(const p of b.parts){if(p.shown!==p.proxy.visible){p.shown=p.proxy.visible;moved=true;if(p.shown)(a.array as Float32Array).set(p.original,p.start);else for(let i=p.start;i<p.end;i+=3){a.array[i]=p.proxy.position.x;a.array[i+1]=p.proxy.position.y;a.array[i+2]=p.proxy.position.z;}}if(p.color!==p.proxy.material.color.getHex()){p.color=p.proxy.material.color.getHex();tinted=true;const t=p.proxy.material.color,scale=[t.r/p.base.r,t.g/p.base.g,t.b/p.base.b];for(let i=p.start;i<p.end;i++)c.array[i]=p.colors[i-p.start]*scale[(i-p.start)%3];}}if(moved)a.needsUpdate=true;if(tinted)c.needsUpdate=true;});for(const s of signs)s.mesh.visible=s.owner.visible;shell.visible=batches.some(b=>b.parts.some(p=>p.proxy.visible));}
 // 렌더 버퍼와 복원용 사본을 만든 뒤 조립용 배열을 비운다.
 for(const batch of batches){batch.positions.length=0;batch.colors.length=0;}
 return{shell,breakables,update};
}
