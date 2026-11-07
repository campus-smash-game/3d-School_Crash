import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import type { CampusBuilding } from './fullCampus';
import { humanities23Frame } from './humanities23Site';
import { physics561SurfaceHeight } from './physics561Site';
import { ENGINEERING33_ID, type Engineering33Layout } from './engineering33Site';
import { engineering30ClipPolygon } from './engineering30Site';
type XZ=[number,number];type Frame=ReturnType<typeof humanities23Frame>;type Proxy=THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
export function createEngineering33Exterior(scene:THREE.Scene,building:CampusBuilding,q:Engineering33Layout,heightAt:(x:number,z:number)=>number){
 const shell=new THREE.Group();shell.name='landmark/engineering33-exterior';Object.assign(shell.userData,{role:'building-shell',buildingId:ENGINEERING33_ID,buildingIds:[ENGINEERING33_ID]});scene.add(shell);
 

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
    if (!owner) { proxy.position.copy(center); proxy.updateMatrixWorld(true); Object.assign(proxy.userData, { buildingId: partBuilding, component: name, renderProxy: true, convex: true }); breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attr.array), toughness: material === 'glass' ? 2 : 8, material, label: '33동 공학관' }); }
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


 const white=0xd5d5cb,brick=0xa56748,lightBrick=0xb6a687,glass=0x758d8c,frameColor=0xc6cec7,dark=0x404044;
 const pavementMasks:{component:string;polygon:XZ[]}[]=[];
 const slab=(name:string,poly:XZ[],y:number,color:number,thickness=.22)=>part(name,poly.flatMap(p=>[new THREE.Vector3(p[0],y,p[1]),new THREE.Vector3(p[0],y-thickness,p[1])]),color);
 for(const ids of THREE.ShapeUtils.triangulateShape(q.main.map(p=>new THREE.Vector2(...p)),[])){
   const poly=ids.map(i=>q.main[i]);slab('main-ground-floor',poly,q.floor,0xb6b5a8);slab('main-roof',poly,q.roof,0x7e8c7b);pavementMasks.push({component:'main-footprint',polygon:poly});
 }
 const ribbon=(f:Frame,s0:number,s1:number,n:number,y0:number,y1:number,owner:Proxy,color=glass)=>{
   box('window-glass',f,s0,s1,n-.018,n,y0,y1,color,'glass',owner);
   for(let s=s0;s<s1+.001;s+=Math.max(.5,(s1-s0)/4))facet('window-mullion',f,s-.024,s+.024,y0,y1,n-.025,frameColor,owner);
   for(const y of[y0,y1-.35,y1])facet('window-transom',f,s0,s1,y-.024,y+.024,n-.025,frameColor,owner);
 };
 // 공식 사진의 기존 본체는 창 세 줄과 붉은 하부 벽돌, 창 사이의 밝은 벽돌을 구분한다.
 const main=[...q.main].reverse();
 for(let i=0;i<main.length;i++){
   if(i===2)continue;
   const f=humanities23Frame(main[i],main[(i+1)%main.length]),bays=Math.max(1,Math.round(f.length/6)),step=f.length/bays;
   for(let j=0;j<bays;j++){
     const s0=j*step,s1=(j+1)*step,mid=(s0+s1)/2;
     const low=Math.min(...[s0,mid,s1].map(s=>heightAt(...f.point(s,0))))-.25;
     if(low<q.floor)box('main-foundation',f,s0,s1,-.05,.17,low,q.floor,0xa8aaa1);
     box('main-white-column',f,s0,s0+.3,-.3,.2,q.floor,q.roof,white);
     for(let level=0;level<3;level++){
       const y=q.floor+level*3.5,owner=box('main-brick-bay',f,s0+.3,s1,-.05,.18,y,y+3.5,lightBrick);
       box('red-brick-spandrel',f,s0+.3,s1,-.08,.17,y,y+1.05,brick,'stone',owner);
       box('white-floor-band',f,s0,s1,-.23,.2,y+3.16,y+3.5,white,'stone',owner);
       for(let mortar=y+.12;mortar<y+1.0;mortar+=.15)facet('brick-mortar',f,s0+.3,s1,mortar,mortar+.012,-.087,0xc8ac8c,owner);
       if(i===1&&j===Math.floor(bays*.5))ribbon(f,s0+.42,s1-.12,-.095,y+.08,y+3.12,owner,0x75a69d);
       else{
         const width=step*.28;
         for(const center of[s0+step*.32,s0+step*.75])ribbon(f,center-width/2,center+width/2,-.095,y+1.12,y+2.92,owner);
       }
     }
     const edge=box('main-deep-cornice',f,s0,s1,-.8,.18,q.roof-.18,q.roof+.18,white);
     box('main-parapet-base',f,s0,s1,-.16,.14,q.roof+.18,q.roof+.52,white,'stone',edge);
     box('main-parapet-cap',f,s0,s1,-.18,.16,q.roof+.92,q.roof+1.04,white,'stone',edge);
     for(let s=s0+.12;s<s1;s+=2.6)box('main-parapet-post',f,s,s+.18,-.16,.14,q.roof+.52,q.roof+.92,white,'stone',edge);
     const v=[at(f,mid-.16,q.roof-.18,.1),at(f,mid+.16,q.roof-.18,.1),at(f,mid-.16,q.roof-.75,.1),at(f,mid+.16,q.roof-.75,.1),at(f,mid-.16,q.roof-.18,-.75),at(f,mid+.16,q.roof-.18,-.75)];part('main-cornice-bracket',v,white,'stone',edge);
   }
 }
 const numberFace=humanities23Frame(q.main[2],q.main[1]),number=box('building-number-panel',numberFace,.7,2.6,-.82,-.79,q.roof-.08,q.roof+.68,white);
 label('building-number-33','33',numberFace,1.65,-.84,q.roof+.3,1.35,.7,number,'#d5d5cb','#548086');
 const east=q.east,door=q.eastDoor;
 for(const [a,b]of[[0,door-1.6],[door+1.6,east.length]]){
   const low=Math.min(...[a,b].map(s=>heightAt(...east.point(s,0))))-.25,owner=box('east-dark-brick-wall',east,a,b,-.08,.24,Math.min(low,q.floor),q.roof,0x716252);
   for(let y=q.floor+.1;y<q.roof;y+=.16)facet('east-brick-mortar',east,a,b,y,y+.012,-.09,0xa0927b,owner);
 }
 for(const s of[door-1.6,door+1.45])box('east-recess-side',east,s,s+.15,-.08,1.3,q.floor,q.roof,0x716252);
 for(let level=0;level<3;level++)box('east-recess-panel',east,door-1.6,door+1.6,1.1,1.28,q.floor+(level===0?2.7:level*3.5),q.floor+(level+1)*3.5,level===0?white:0x535c57);
 for(const s of[door-1.3,door+1.3]){box('east-door-jamb',east,s-.05,s+.05,1.05,1.3,q.floor,q.floor+2.7,0x7a827b,'metal');box('east-open-door',east,s-.035,s+.035,1.25,2.15,q.floor+.03,q.floor+2.6,0x576f69,'glass');}
 box('east-cornice',east,0,east.length,-.8,.18,q.roof-.18,q.roof+.18,white);
 for(const s of[door-1.9,door+1.65]){const top=[at(east,s,q.eastBottom+.65,-3.3),at(east,s+.25,q.eastBottom+.65,-3.3),at(east,s,q.floor+.65,-.3),at(east,s+.25,q.floor+.65,-.3)];part('east-stair-white-sidewall',[...top,...top.map(v=>v.clone().add(new THREE.Vector3(0,-.9,0)))],white);}
 const board=box('east-E33-board',east,door+2.4,door+4.4,-3.6,-3.4,q.eastBottom+.45,q.eastBottom+1.55,0x42556c,'metal');
 for(const s of[door+2.6,door+4.2])box('east-E33-board-post',east,s-.035,s+.035,-3.54,-3.46,heightAt(...east.point(s,-3.5))-.05,q.eastBottom+.5,0x626962,'metal',board);
 label('east-E33-board-text','E33  공학관 4',east,door+3.4,-3.62,q.eastBottom+1.15,1.85,.36,board,'#42556c','#eeeeea');

 // 2025년 남면의 검은 외장과 후퇴한 맨 아래 창줄을 북면의 흰 처마와 구분한다.
 const f=q.annex,length=f.length,core=14;
 box('wing-upper-floor',f,0,length,-8.03,0,q.floor-.24,q.floor,0x777c76);
 box('wing-roof',f,0,length,-8.03,0,q.roof-.22,q.roof,0x818777);
 const northFace=humanities23Frame(f.point(length,0),f.point(0,0));
 for(const [face,start,end,n,side]of[[f,6,length,-8.03,'south'],[northFace,0,length,0,'north']] as [Frame,number,number,number,string][]){
   const cuts=side==='south'?[6,14,22,30,length]:[0,length-30,length-22,length-14,length-6,length];
   for(let i=0;i<cuts.length-1;i++){const s=Math.max(start,cuts[i]),e=Math.min(end,cuts[i+1]);
     box('wing-white-column',face,s,s+.32,n-.24,n+.18,q.floor,q.roof,white);
     for(let level=0;level<3;level++){
       const y=q.floor+level*3.5,recess=side==='south'&&level===0?.65:0;
       const owner=box('wing-brick-spandrel',face,s+.32,e,n+recess,n+.22+recess,y,y+3.5,side==='south'&&level===0?0x616866:brick);
       box('wing-white-floor-band',face,s,e,n-.15,n+.2,y+3.18,y+3.5,white,'stone',owner);
       ribbon(face,s+.45,e-.13,n-.02+recess,y+.95,y+2.95,owner,side==='south'&&level===0?0x3c5356:glass);
       for(let y0=y+.12;y0<y+.9;y0+=.15)facet('wing-brick-mortar',face,s+.32,e,y0,y0+.012,n-.005+recess,0xd1aa88,owner);
     }
     box(side==='south'?'wing-black-parapet':'wing-white-parapet',face,s,e,n-.18,n+.2,q.roof,q.roof+1.1,side==='south'?dark:white);
   }
 }
 // 서쪽의 검은 외장과 현관은 닫힌 부분이며, 동쪽 기둥 사이는 남북으로 통과할 수 있다.
 box('west-dark-core',f,0,6,-8.03,0,q.pilotiFloor,q.roof+1.1,dark);
 for(let s=.15;s<6;s+=1.5)for(let y=q.pilotiFloor+.2;y<q.roof+1.1;y+=1.2)facet('black-panel-joint',f,s,s+.025,y,Math.min(y+1.18,q.roof+1.1),-8.045,0x656469,breakables.find(b=>b.mesh.userData.component==='west-dark-core')!.mesh as Proxy);
 box('entry-north-wall',f,6,core,-.18,0,q.pilotiFloor,q.floor,0x9b9c91);
 box('entry-east-wall',f,core-.2,core,-8,0,q.pilotiFloor,q.floor,0x9b9c91);
 for(const [a,b]of[[6,q.entry-1.3],[q.entry+1.3,core]]){const owner=box('entry-glazed-side',f,a,b,-8.04,-7.9,q.entryFloor,q.floor,0x929a91);ribbon(f,a+.06,b-.06,-8.06,q.entryFloor+.12,q.floor-.2,owner,0x5e7877);}
 for(const s of[q.entry-1.3,q.entry+1.3]){box('entry-door-jamb',f,s-.045,s+.045,-8.12,-7.88,q.entryFloor,q.entryFloor+2.7,frameColor,'metal');box('entry-open-door',f,s-.035,s+.035,-7.9,-6.9,q.entryFloor+.03,q.entryFloor+2.6,0x658782,'glass');}
 const sign=box('west-engineering-sign',f,6,core,-8.18,-7.88,q.entryFloor+2.7,q.floor-.04,white);
 label('west-engineering-sign-text','‹32  ENGINEERING  33›',f,10,-8.2,(q.entryFloor+2.7+q.floor-.04)/2,7.5,.65,sign,'#d5d5cb','#985a43');
 for(let s=14;s<length;s+=8)for(const n of[-7.73,-.3])box('piloti-square-column',f,s-.28,s+.28,n-.28,n+.28,q.pilotiFloor,q.floor,0xaaa99f);
 for(let s=14;s<length;s+=.6){const owner=breakables.find(b=>b.mesh.userData.component==='wing-upper-floor')!.mesh as Proxy;part('piloti-ceiling-seam',[at(f,s,q.floor-.245,-7.9),at(f,s+.016,q.floor-.245,-7.9),at(f,s+.016,q.floor-.245,-.1),at(f,s,q.floor-.245,-.1)],0x494d49,'stone',owner,true);}
 const ceilingOwner=breakables.find(b=>b.mesh.userData.component==='wing-upper-floor')!.mesh as Proxy;
 for(const s of[19,27,35])part('piloti-round-ceiling-light',Array.from({length:12},(_,i)=>at(f,s+.18*Math.cos(i*Math.PI/6),q.floor-.25,-4+.18*Math.sin(i*Math.PI/6))),0xe1dfc8,'metal',ceilingOwner,true);

 for(const a of q.surfaces){
   const rectangle=[a.frame.point(a.s0,a.n0),a.frame.point(a.s1,a.n0),a.frame.point(a.s1,a.n1),a.frame.point(a.s0,a.n1)],height=(s:number,n:number)=>physics561SurfaceHeight(a,s,n);
   // 기존 붉은 마당과 겹치는 상단 참은 잘라 줄눈이 겹쳐 깜빡이지 않게 한다.
   const polygons=a.name==='court-stair-top'?engineering30ClipPolygon(rectangle,q.oldCourtMask):[rectangle];
   for(const poly of polygons){
   const top=poly.map(p=>{const l=a.frame.local(p);return new THREE.Vector3(p[0],height(l.s,l.n),p[1]);});
   const stair=a.name==='court-southwest-stair'||a.name==='east-entry-stair',asphalt=a.name==='piloti-south-approach'||a.name==='west-entry-approach',owner=part(a.name,[...top,...top.map(p=>p.clone().add(new THREE.Vector3(0,-.22,0)))],stair?0x969b91:asphalt?0x737572:0x96988e);pavementMasks.push({component:a.name,polygon:poly});
   if(stair){const corners=a.name==='east-entry-stair'?[a.frame.point(a.s0,a.n0),a.frame.point(a.s1,a.n0),a.frame.point(a.s1,a.n0+.045),a.frame.point(a.s0,a.n0+.045)]:[a.frame.point(a.s1-.045,a.n0),a.frame.point(a.s1,a.n0),a.frame.point(a.s1,a.n1),a.frame.point(a.s1-.045,a.n1)];part('stair-light-nosing',corners.map(p=>new THREE.Vector3(p[0],a.y0+.005,p[1])),0xc4c1ad,'stone',owner,true);continue;}
   if(asphalt)continue;
   const red=a.name.startsWith('east-entry'),ds=red?.3:.6;
   for(let s=a.s0;s<a.s1;s+=ds)for(let n=a.n0;n<a.n1;n+=.6){const end=Math.min(s+ds-.015,a.s1),hi=Math.min(n+.585,a.n1);if(hi-n<.01)continue;const cell=[a.frame.point(s,n),a.frame.point(end,n),a.frame.point(end,hi),a.frame.point(s,hi)];for(const tile of engineering30ClipPolygon(cell,poly,true)){part(red?'entry-red-paver':'gray-square-paver',tile.map(p=>{const local=a.frame.local(p);return new THREE.Vector3(p[0],height(local.s,local.n)+.004,p[1]);}),red?0xb29b7d:0xb7b9ac,'stone',owner,true);}}
   if(a.name==='east-entry-approach'){const n=a.n1-.4;part('east-entry-tactile-block',[at(a.frame,a.s0+.1,height(a.s0+.1,n)+.012,n),at(a.frame,a.s1-.1,height(a.s1-.1,n)+.012,n),at(a.frame,a.s1-.1,height(a.s1-.1,a.n1)+.012,a.n1),at(a.frame,a.s0+.1,height(a.s0+.1,a.n1)+.012,a.n1)],0xc4b156,'stone',owner,true);}
   if(a.name==='west-entry-landing')part('west-entry-tactile-block',[at(a.frame,a.s0+.15,a.y0+.012,a.n0+.05),at(a.frame,a.s1-.15,a.y0+.012,a.n0+.05),at(a.frame,a.s1-.15,a.y0+.012,a.n1-.05),at(a.frame,a.s0+.15,a.y0+.012,a.n1-.05)],0xc4b156,'stone',owner,true);
   }
 }
 // 계단 양옆 붉은 경계와 낮은 회색 옹벽은 2024년 중정 사진을 참고한다.
 for(const a of q.surfaces.filter(a=>a.name==='court-southwest-stair'))for(const n of[-1.82,1.62])box('court-stair-brick-side',q.stair,a.s0,a.s1,n,n+.2,a.y0-.24,a.y0+.24,0x8e6150);
 const meshes=batches.map(b=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(b.colors,3));g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:b.glass?.3:.8,side:THREE.DoubleSide}));mesh.name=b.glass?'engineering33-glass':'engineering33-surfaces';mesh.castShadow=!b.glass;mesh.receiveShadow=true;shell.add(mesh);return mesh;});

 shell.userData.engineering33Exterior={buildingId:ENGINEERING33_ID,buildingIds:[ENGINEERING33_ID],rawOsmFootprintPreserved:true,dimensionsEstimated:true,wholeInteriorImplemented:false,visibleMainWindowRows:3,wingSouthWindowRows:3,wingNorthBrickWindowRows:3,pilotiClearance:q.pilotiCeiling-q.pilotiFloor,routes:q.routes,pavementMasks,bounds:q.bounds,geometry:{meshes:meshes.length+signs.length,textures:signs.length,triangles:batches.reduce((n,b)=>n+b.positions.length/9,0)+signs.length*2,colliders:breakables.length}};
 function update(_player:THREE.Vector3){batches.forEach((b,index)=>{const a=meshes[index].geometry.attributes.position as THREE.BufferAttribute,c=meshes[index].geometry.attributes.color as THREE.BufferAttribute;let moved=false,tinted=false;for(const p of b.parts){if(p.shown!==p.proxy.visible){p.shown=p.proxy.visible;moved=true;if(p.shown)(a.array as Float32Array).set(p.original,p.start);else for(let i=p.start;i<p.end;i+=3){a.array[i]=p.proxy.position.x;a.array[i+1]=p.proxy.position.y;a.array[i+2]=p.proxy.position.z;}}if(p.color!==p.proxy.material.color.getHex()){p.color=p.proxy.material.color.getHex();tinted=true;const t=p.proxy.material.color,scale=[t.r/p.base.r,t.g/p.base.g,t.b/p.base.b];for(let i=p.start;i<p.end;i++)c.array[i]=p.colors[i-p.start]*scale[(i-p.start)%3];}}if(moved)a.needsUpdate=true;if(tinted)c.needsUpdate=true;});for(const s of signs)s.mesh.visible=s.owner.visible;shell.visible=batches.some(b=>b.parts.some(p=>p.proxy.visible));}
 return{shell,breakables,update};
}
