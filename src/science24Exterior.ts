import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import type { CampusBuilding } from './fullCampus';
import { humanities23Frame } from './humanities23Site';
import { physics561SurfaceHeight } from './physics561Site';
import { SCIENCE24_ID, type Science24Layout } from './science24Site';
type XZ=[number,number];type Frame=ReturnType<typeof humanities23Frame>;type Proxy=THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
export function createScience24Exterior(scene:THREE.Scene,building:CampusBuilding,q:Science24Layout,heightAt:(x:number,z:number)=>number,connection251?:{point:XZ;floor:number;width:number;stairHole:XZ[]}){
 const shell=new THREE.Group();shell.name='landmark/science24-exterior';Object.assign(shell.userData,{role:'building-shell',buildingId:SCIENCE24_ID,buildingIds:[SCIENCE24_ID]});scene.add(shell);
 

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
    if (!owner) { proxy.position.copy(center); proxy.updateMatrixWorld(true); Object.assign(proxy.userData, { buildingId: building.id, component: name, renderProxy: true, convex: true }); breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attr.array), toughness: material === 'glass' ? 2 : 8, material, label: '24동과 연결교' }); }
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
 function slab(name:string,points:XZ[],y:number,color:number,holes:XZ[][]=[]){
  const ring=points.slice(0,-1).map(p=>new THREE.Vector2(...p)),hs=holes.map(h=>h.map(p=>new THREE.Vector2(...p))),all=[...ring,...hs.flat()];
  for(const ids of THREE.ShapeUtils.triangulateShape(ring,hs)){const top=ids.map(i=>new THREE.Vector3(all[i].x,y,all[i].y));part(name,[...top,...top.map(p=>p.clone().add(new THREE.Vector3(0,-.24,0)))],color);}
 }

 const points:XZ[]=[[138.84,-729.45],[108.53,-806.71],[128.89,-816.2],[160.39,-738.6],[138.84,-729.45]];
 for(const[i,y]of [...q.floors,q.roof].entries())slab('floor-slab-'+i,building.points,y,i===q.floors.length?0x568777:0xb6b9af,i===2&&connection251?[connection251.stairHole]:[]);
 for(let edge=0;edge<4;edge++){
  const e=humanities23Frame(points[edge],points[edge+1]),mid=f.local(e.point(e.length/2)),long=e.length>40,east=long&&mid.n>-5,north=!long&&mid.s<10;
  for(let level=0;level<q.floors.length;level++){
   const low=q.floors[level],high=q.floors[level+1]??q.roof,openings:{a:number;b:number}[]=[];
   const opening=(p:XZ,width:number)=>{const l=e.local(p);if(Math.abs(l.n)<.2&&l.s>-.1&&l.s<e.length+.1)openings.push({a:Math.max(0,l.s-width/2),b:Math.min(e.length,l.s+width/2)});};
   if(level===0)for(const d of q.doors)opening(d.point,d.width);
   if(level===1)opening(q.bridge.point(0),3.35);
   if(connection251&&Math.abs(low-connection251.floor)<.01)opening(connection251.point,connection251.width);
   const cuts=[0,e.length,...openings.flatMap(o=>[o.a,o.b])];
   if(long)for(let s=0;s<e.length;s+=5.2)cuts.push(s);else if(north)cuts.push(e.length/2-1.5,e.length/2+1.5);
   const sorted=[...new Set(cuts)].sort((a,b)=>a-b);
   for(let i=1;i<sorted.length;i++){
    const a=sorted[i-1],b=sorted[i],m=(a+b)/2;if(b-a<.02)continue;
    if(openings.some(o=>m>o.a-1e-5&&m<o.b+1e-5)){
     wall('entry-header',e,a,b,low+2.8,high-.24,white);
     for(const s of[a,b])box('entry-metal-jamb',e,s-.025,s+.025,-.2,.2,low,low+2.8,metal,'metal');continue;
    }
    if(!long){if(north&&Math.abs(m-e.length/2)<1.51)window(e,a+.05,b-.05,low+.08,high-.25,'north-glazed-shaft');else wall('brick-short-end',e,a,b,low,high-.24);continue;}
    if(b-a<1){wall('brick-pier',e,a,b,low,high-.24);continue;}
    const deep=!east&&(level===1||level===2),shaft=east&&Math.abs(f.local(e.point(m)).s-18)<2.7;
    if(shaft){window(e,a+.08,b-.08,low+.05,high-.25,'blue-entry-curtain-glazing');continue;}
    const wide=deep||(east&&level<2),w=wide?b-a-.42:Math.min(2.5,b-a-.6),wa=m-w/2,wb=m+w/2,sill=wide?.5:.95,head=high-.7;
    wall(level===0?'stone-ground-spandrel':'brick-spandrel',e,a,b,low,low+sill,level===0?0x91958c:brick);
    wall('brick-window-header',e,a,b,head,high-.24);wall('brick-window-side',e,a,wa,low+sill,head);wall('brick-window-side',e,wb,b,low+sill,head);
    const owner=window(e,wa,wb,low+sill,head);
    for(const s of[wa,wb])box(deep?'deep-white-fin':'white-window-frame',e,s-.08,s+.08,deep?-.8:-.24,.1,low+sill-.08,head+.08,white,'stone',owner);
    box(deep?'deep-fin-lintel':'white-window-lintel',e,wa-.08,wb+.08,deep?-.8:-.25,.1,head,head+.16,white,'stone',owner);
    box('white-projecting-sill',e,wa-.08,wb+.08,-.32,.1,low+sill-.12,low+sill,white,'stone',owner);
   }
   if(long||level===0){const bands=[0,e.length,...openings.flatMap(o=>[o.a,o.b])].sort((a,b)=>a-b);
   for(let i=1;i<bands.length;i++){const a=bands[i-1],b=bands[i],open=openings.some(o=>(a+b)/2>o.a-1e-5&&(a+b)/2<o.b+1e-5);if(b-a>.02)box('white-floor-band',e,a,b,-.28,.2,low-.24,open?low:low+.28,white);}}
  }
  box('white-corner-column',e,0,.35,-.35,.25,q.floor,q.roof,white);
  box('deep-white-eaves',e,-.4,e.length+.4,-.8,.4,q.roof-.28,q.roof,white);
  const rail=box('open-roof-parapet',e,0,e.length,-.23,.17,q.roof+.65,q.roof+.87,white);
  for(let s=0;s<e.length;s+=3.8)box('roof-parapet-post',e,s,s+.18,-.23,.17,q.roof,q.roof+.67,white,'stone',rail);
  if(north){const board=wall('building-number-board',e,e.length-4,e.length-2,q.roof-2.2,q.roof-.5);label('building-number-24','24',e,e.length-3,-.18,q.roof-1.3,1.3,1.4,board,'#695044','#f4f1e8');}
 }
 // 지붕의 녹색 방수면과 낮은 중앙 설비 구역은 공식 항공사진을 참고했다.
 const roofOwner=box('roof-central-service-strip',f,12,70,-12.8,-9.4,q.roof,q.roof+.55,0x8c9b8d);
 box('roof-service-room',f,62,69,-14,-8,q.roof+.5,q.roof+1.8,0xb7beb2,'stone',roofOwner);
 for(let s=17;s<61;s+=6){const ac=box('roof-air-conditioner',f,s,s+1.4,-8,-6.9,q.roof,q.roof+.9,0xc5c9bf,'metal',roofOwner);for(let h=.2;h<.8;h+=.13)box('ac-grille',f,s+.08,s+1.32,-6.92,-6.89,q.roof+h,q.roof+h+.025,0x69776f,'metal',ac);}
 for(const d of q.doors){
  const p=f.local(d.point),isEast=d.name.startsWith('east');
  const e=isEast?humanities23Frame(f.point(p.s-2.4,0),f.point(p.s+2.4,0)):humanities23Frame(f.point(p.s,p.n-2.4),f.point(p.s,p.n+2.4));
  const outward=isEast?1:(d.name==='north'?1:-1),n0=outward>0?-.2:-2.1,n1=outward>0?2.1:.2;
  const canopy=box('rectangular-white-entry-canopy',e,0,4.8,n0,n1,q.floor+2.8,q.floor+3.14,white);
  box('recessed-canopy-underside',e,.2,4.6,n0+.15,n1-.15,q.floor+2.78,q.floor+2.8,0x6d7773,'metal',canopy);
  // 출입문 중앙은 열어 두고 양쪽에 유리 고정창을 둔다.
  for(const s of[.2,4.2])box('entry-glazed-side-panel',e,s,s+.4,-.1,.05,q.floor+.1,q.floor+2.75,0x789397,'glass');
 }
 for(const a of q.surfaces){
  const e=a.frame??f,corners=[e.point(a.s0,a.n0),e.point(a.s1,a.n0),e.point(a.s1,a.n1),e.point(a.s0,a.n1)];
  const top=corners.map(p=>{const l=e.local(p);return new THREE.Vector3(p[0],physics561SurfaceHeight(a,l.s,l.n),p[1]);});
  const owner=part(a.name,[...top,...top.map(p=>new THREE.Vector3(p.x,a.elevated?p.y-.24:Math.min(p.y-.25,heightAt(p.x,p.z)-.22),p.z))],a.name.includes('stair')?0xa5aaa5:0x939e98);
  if(!a.elevated)pavementMasks.push({component:a.name,polygon:corners});
  if(/paving$|landing$|ramp-turn$/.test(a.name))for(let n=a.n0;n<a.n1;n+=.5)for(let s=a.s0;s<a.s1;s+=.75){
   const x=Math.min(s+.73,a.s1),z=Math.min(n+.48,a.n1),ys=a.y0+.006,colors=[0xa8afa8,0x838d86,0xbec3b9];
   part('pavement-block',[at(e,s,ys,n),at(e,x,ys,n),at(e,x,ys,z),at(e,s,ys,z)],colors[Math.abs(Math.round(s*4+n*6))%3],'stone',owner,true);
  }
  if(a.name.endsWith('stair'))part('stair-nosing',[at(e,a.s0,a.y0+.007,a.n0),at(e,a.s0+.035,a.y0+.007,a.n0),at(e,a.s0+.035,a.y0+.007,a.n1),at(e,a.s0,a.y0+.007,a.n1)],0x535e59,'stone',owner,true);
  if(a.name.endsWith('ramp')){
   const alongS=a.axis==='s',range=alongS?a.s1-a.s0:a.n1-a.n0;
   for(const side of[0,1]){
    const edge=alongS?(side?a.n1:a.n0):(side?a.s1:a.s0);
    const p0=alongS?at(e,a.s0,a.y0+.9,edge):at(e,edge,a.y0+.9,a.n0),p1=alongS?at(e,a.s1,a.y1+.9,edge):at(e,edge,a.y1+.9,a.n1);
    beam('ramp-handrail',p0,p1,.022,metal,owner);
    for(let d=0;d<=range;d+=1.5){const t=d/range,p=p0.clone().lerp(p1,t);beam('ramp-rail-post',p.clone().add(new THREE.Vector3(0,-.9,0)),p,.02,metal,owner);}
   }
  }
 }
 // 북쪽 현관과 남쪽 계단에 금속 난간을 둔다. 치수는 게임 지형에 맞춘 근사다.
 for(const name of['north-entry-stair','south-mapped-stair']){
  const steps=q.surfaces.filter(a=>a.name===name),first=steps[0],last=steps.at(-1)!,e=first.frame!;
  for(const n of[first.n0-.08,first.n1+.08]){
   const a=at(e,first.s0,first.y0+.92,n),b=at(e,last.s1,last.y0+.92,n);
   const rail=beam('stair-handrail',a,b,.025,metal);
   const length=last.s1-first.s0,count=Math.ceil(length/1.4);
   for(let i=0;i<=count;i++){const p=a.clone().lerp(b,i/count);beam('stair-railing-post',p.clone().add(new THREE.Vector3(0,-.92,0)),p,.025,metal,rail);}
  }
 }
 // 연결교의 기둥은 도로 가장자리 가까이에 두어 아래 통로를 비운다.
 const bridge=q.bridge,by=(s:number)=>q.bridgeStart+(q.bridgeEnd-q.bridgeStart)*s/bridge.length;
 function bridgePart(name:string,s0:number,s1:number,n0:number,n1:number,low:number,high:number,color:number,material:BreakableSpec['material']='stone',owner?:Proxy){return part(name,[s0,s1].flatMap(s=>[n0,n1].flatMap(n=>[low,high].map(y=>at(bridge,s,by(s)+y,n)))),color,material,owner);}
 for(const n of[-1.65,1.65]){
  bridgePart('bridge-white-spandrel',0,bridge.length,n-.12,n+.12,0,.65,white);
  bridgePart('bridge-white-header',0,bridge.length,n-.12,n+.12,2.65,3.05,white);
  const glass=bridgePart('bridge-glass',0,bridge.length,n-.05,n+.05,.65,2.65,0x6e9496,'glass');
  for(let s=0;s<=bridge.length;s+=1.3)bridgePart('bridge-window-frame',s,Math.min(s+.06,bridge.length),n-.12,n+.12,.6,2.7,white,'metal',glass);
 }
 bridgePart('bridge-green-roof',-.18,bridge.length+.18,-1.85,1.85,3.05,3.25,0x4f8874);
 for(const s of[.65,bridge.length-.65])for(const n of[-1.5,1.5]){const p=bridge.point(s,n);box('bridge-square-column',bridge,s-.2,s+.2,n-.2,n+.2,heightAt(...p),by(s)-.24,white);}
 // 사진의 시설 종류를 반영하되 배치와 크기는 통행 폭에 맞춰 근사한다.
 for(const [s,n]of [[-3,-17],[86,-3.8]]){
  const p=f.point(s,n),base=heightAt(...p),seat=box('wood-bench',f,s-.85,s+.85,n-.24,n+.24,base+.4,base+.5,0x75634a,'wood');
  for(const leg of[-.6,.6])box('bench-leg',f,s+leg-.06,s+leg+.06,n-.18,n+.18,base,base+.42,0x46564d,'metal',seat);
  box('bench-back',f,s-.85,s+.85,n+.2,n+.29,base+.5,base+.95,0x75634a,'wood',seat);
 }
 const lampS=-4,lampN=-4,lp=f.point(lampS,lampN),ly=heightAt(...lp),lamp=beam('twin-globe-lamp-post',at(f,lampS,ly,lampN),at(f,lampS,ly+2.9,lampN),.055,0x4b6250);
 beam('twin-globe-lamp-arm',at(f,lampS-.45,ly+2.7,lampN),at(f,lampS+.45,ly+2.7,lampN),.04,0x4b6250,lamp);
 for(const s of[lampS-.45,lampS+.45]){const g=new THREE.IcosahedronGeometry(.23,1),a=g.attributes.position;part('lamp-globe',Array.from({length:a.count},(_,i)=>new THREE.Vector3(a.getX(i),a.getY(i),a.getZ(i)).add(at(f,s,ly+2.95,lampN))),0xd3d9bd,'glass',lamp);g.dispose();}
 const meshes=batches.map(b=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(b.colors,3));g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:b.glass?.3:.8,side:THREE.DoubleSide}));mesh.name=b.glass?'science24-glass':'science24-surfaces';mesh.castShadow=!b.glass;mesh.receiveShadow=true;shell.add(mesh);return mesh;});
 shell.userData.science24Exterior={buildingIds:[SCIENCE24_ID],affectedBuildingIds:[SCIENCE24_ID,'way/161957772'],floor:q.floor,floors:q.floors,routes:q.routes,pavementMasks,rawOsmFootprintsPreserved:true,dimensionsEstimated:true,floorCountsEstimated:true,bridgeFloorAssignmentEstimated:true,unobservedFacadesEstimated:true,wholeInteriorImplemented:false,mappedEntranceNodes:q.doors.map(d=>d.node),geometry:{meshes:meshes.length+signs.length,textures:signs.length,triangles:batches.reduce((n,b)=>n+b.positions.length/9,0)+signs.length*2,colliders:breakables.length}};
 function update(_player:THREE.Vector3){batches.forEach((b,index)=>{const a=meshes[index].geometry.attributes.position as THREE.BufferAttribute,c=meshes[index].geometry.attributes.color as THREE.BufferAttribute;let moved=false,tinted=false;for(const p of b.parts){if(p.shown!==p.proxy.visible){p.shown=p.proxy.visible;moved=true;if(p.shown)(a.array as Float32Array).set(p.original,p.start);else for(let i=p.start;i<p.end;i+=3){a.array[i]=p.proxy.position.x;a.array[i+1]=p.proxy.position.y;a.array[i+2]=p.proxy.position.z;}}if(p.color!==p.proxy.material.color.getHex()){p.color=p.proxy.material.color.getHex();tinted=true;const t=p.proxy.material.color,scale=[t.r/p.base.r,t.g/p.base.g,t.b/p.base.b];for(let i=p.start;i<p.end;i++)c.array[i]=p.colors[i-p.start]*scale[(i-p.start)%3];}}if(moved)a.needsUpdate=true;if(tinted)c.needsUpdate=true;});for(const s of signs)s.mesh.visible=s.owner.visible;shell.visible=batches.some(b=>b.parts.some(p=>p.proxy.visible));}
 return{shell,breakables,update};
}




