import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import { humanities23Frame } from './humanities23Site';
import { physics561SurfaceHeight } from './physics561Site';
import { ENGINEERING36_ID, type Engineering36Layout } from './engineering36Site';
type XZ=[number,number];type Frame=ReturnType<typeof humanities23Frame>;type Proxy=THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
export function createEngineering36Exterior(scene:THREE.Scene,q:Engineering36Layout,openings:{s0:number;s1:number;bottom:number;top:number}[]=[]){
 const shell=new THREE.Group();shell.name='landmark/engineering36-exterior';Object.assign(shell.userData,{role:'building-shell',buildingId:ENGINEERING36_ID,buildingIds:[ENGINEERING36_ID]});scene.add(shell);
 

 const partBuilding=ENGINEERING36_ID;
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
    if (!owner) { proxy.position.copy(center); proxy.updateMatrixWorld(true); Object.assign(proxy.userData, { buildingId: partBuilding, component: name, renderProxy: true, convex: true }); breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attr.array), toughness: material === 'glass' ? 2 : 8, material, label: '36동 공학관' }); }
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



 const white=0xd6d7ce,brick=0x746251,glass=0x526b67,metal=0x929d94,f=q.axis,L=q.length,d=q.depth,base=q.floors[0];
 const pavementMasks:{component:string;polygon:XZ[]}[]=[{component:'engineering36-footprint',polygon:[f.point(0,0),f.point(L,0),f.point(L,-d),f.point(0,-d)]}];
 const ribbon=(face:Frame,s0:number,s1:number,y0:number,y1:number,owner:Proxy,n=-.03)=>{
   facet('window-glass',face,s0,s1,y0,y1,n,glass,owner);
   const count=Math.max(3,Math.round((s1-s0)/.75));
   for(let i=0;i<=count;i++){const s=s0+(s1-s0)*i/count;facet('window-mullion',face,s-.025,s+.025,y0,y1,n-.012,0xb3bab0,owner);}
   for(const y of[y0,y1-.35,y1])facet('window-transom',face,s0,s1,y-.025,y+.025,n-.012,0x616d67,owner);
 };
 for(const face of[humanities23Frame(f.point(L,0),f.point(0,0)),humanities23Frame(f.point(0,-d),f.point(L,-d))]){
   const bays=14,span=face.length/bays;
   for(let j=0;j<bays;j++){
     const s0=j*span,s1=(j+1)*span;
     for(let k=0;k<q.floors.length;k++){
       const y=q.floors[k],top=q.floors[k+1]??q.roof;
       const opening=Math.abs(f.local(face.point(0)).n)<.01?openings.find(o=>Math.abs(o.bottom-y)<.01&&L-o.s1>=s0&&L-o.s0<=s1):undefined;
       if(opening){
         const left=L-opening.s1,right=L-opening.s0;
         for(const [a,b,lo,hi]of[[s0,left,y,top],[right,s1,y,top],[left,right,opening.top,top]])if(b-a>.001&&hi-lo>.001){const piece=box('north-link-door-wall',face,a,b,0,.22,lo,hi,brick);if(b-a>.6&&lo===y)ribbon(face,a+.12,b-.12,y+.9,top-.55,piece);}
         const header=box('north-link-door-lintel',face,left,right,-.15,.23,opening.top-.12,opening.top,white);
         for(const side of[left-.08,right])box('north-link-door-jamb',face,side,side+.08,-.15,.23,y,opening.top,white,'stone',header);
         box('white-floor-band',face,s0,s1,-.26,.22,top-.3,top,white,'stone',header);
         continue;
       }
       const owner=box(k===0?'low-stone-window-bay':'brick-window-bay',face,s0,s1,0,.22,y,top,k===0?0x929a91:brick);
       for(let yy=y+.15;yy<top-.04;yy+=k===0?.36:.18)facet('masonry-joint',face,s0,s1,yy,yy+.012,-.007,k===0?0xb7bdb1:0x9c8c77,owner);
       for(let row=0,yy=y+.15;yy<top-.04;row++,yy+=k===0?.36:.18)for(let ss=s0+(row%2?.28:.56);ss<s1-.02;ss+=.56){if(ss>s0+.22&&ss<s1-.22&&yy>=y+.9&&yy<(k===0?y+2.05:top-.55))continue;facet('masonry-vertical-joint',face,ss,ss+.012,yy,Math.min(yy+(k===0?.36:.18),top-.03),-.008,k===0?0xb7bdb1:0x9c8c77,owner);}
       const low=y+.9,high=k===0?y+2.05:top-.55;ribbon(face,s0+.22,s1-.22,low,high,owner);
       if(k===0)for(let s=s0+.3;s<s1-.2;s+=.18)facet('low-window-security-bar',face,s,s+.018,low,high,-.075,0x737f76,owner);
       box('white-floor-band',face,s0,s1,-.26,.22,top-.3,top,white,'stone',owner);
       if(k>0)box('deep-white-fin',face,s0+.02,s0+.18,-1.04,.2,y+.03,top-.3,white);
     }
     box('white-column',face,s0,s0+.22,-.32,.25,base,q.roof,white);
     const cornice=box('projecting-cornice',face,s0,s1,-1.15,.23,q.roof-.22,q.roof+.12,white);
     box('parapet-bottom',face,s0,s1,-.3,.18,q.roof+.12,q.roof+.42,white,'stone',cornice);
     box('parapet-top',face,s0,s1,-.3,.18,q.roof+.94,q.roof+1.1,white,'stone',cornice);
     box('parapet-post',face,s0,s0+.23,-.3,.18,q.roof+.42,q.roof+.94,white,'stone',cornice);
     const mid=(s0+s1)/2;part('cornice-bracket',[at(face,mid-.1,q.roof-.22,.1),at(face,mid+.1,q.roof-.22,.1),at(face,mid-.1,q.roof-.7,.1),at(face,mid+.1,q.roof-.7,.1),at(face,mid-.1,q.roof-.22,-1.03),at(face,mid+.1,q.roof-.22,-1.03)],white,'stone',cornice);
   }
   const numberPosition=Math.abs(f.local(face.point(0)).n+d)<.01?face.length-1.2:face.length/2;
   const number=box('building-number',face,numberPosition-.7,numberPosition+.7,-1.18,-1.15,q.roof-.03,q.roof+.62,white);
   label('building-number-36','36',face,numberPosition,-1.19,q.roof+.28,1.3,.65,number,'#d6d7ce','#526f74');
 }
 box('main-roof',f,0,L,-d,0,q.roof-.24,q.roof,0x919787);
 const west=humanities23Frame(f.point(0,0),f.point(0,-d)),east=humanities23Frame(f.point(L,-d),f.point(L,0));
 const endWall=(face:Frame,s0:number,s1:number,y0:number,y1:number)=>{
   const owner=box('brick-end-wall',face,s0,s1,0,.22,y0,y1,brick);
   for(let y=y0+.18;y<y1;y+=.18)facet('end-wall-mortar',face,s0,s1,y,y+.012,-.006,0x9c8c77,owner);return owner;
 };
 endWall(west,0,d,base,q.roof);
 const door0=d-11,door1=d-8;
 endWall(east,0,door0,base,q.roof);endWall(east,door1,d,base,q.roof);endWall(east,door0,door1,base,q.entryFloor);
 endWall(east,door0,door1,q.entryFloor+2.8,q.floors[3]);endWall(east,door0,door1,q.floors[3]+2.8,q.roof);
 for(const face of[west,east]){
   const cap=box('end-wall-cornice',face,0,d,-.8,.22,q.roof-.22,q.roof+.12,white);
   box('end-parapet-bottom',face,0,d,-.25,.16,q.roof+.12,q.roof+.42,white,'stone',cap);
   box('end-parapet-top',face,0,d,-.25,.16,q.roof+.94,q.roof+1.1,white,'stone',cap);
   for(let s=0;s<d;s+=2.3)box('end-parapet-post',face,s,s+.2,-.25,.16,q.roof+.42,q.roof+.94,white,'stone',cap);
 }
 for(const y of[q.entryFloor,q.floors[3]]){
   const frame=box('east-door-lintel',east,door0-.12,door1+.12,-.18,.1,y+2.6,y+2.8,white);
   for(const s of[door0-.12,door1])box('east-door-jamb',east,s,s+.12,-.18,.1,y,y+2.8,white,'stone',frame);
   box('east-vestibule-back',f,L-1.4,L-1.2,-11,-8,y,y+2.8,0x969e91);
   for(const n of[-11,-8])box('east-vestibule-side',f,L-1.4,L,n-.06,n+.06,y,y+2.8,0xaaaFA2);
   // 사진의 문틀을 유지하면서 게임에서는 얕은 현관에 접근하도록 문짝을 열어 둔다.
   const leaf=box('east-open-glass-door',f,L-.04,L+1.15,-11.02,-10.96,y+.08,y+2.55,glass,'glass');
   for(const s of[L,L+1.1])box('east-door-leaf-frame',f,s,s+.045,-11.05,-10.93,y+.08,y+2.55,metal,'metal',leaf);
   for(const yy of[y+.08,y+1.1,y+2.5])box('east-door-leaf-transom',f,L,L+1.15,-11.05,-10.93,yy,yy+.05,metal,'metal',leaf);
   box('east-vestibule-ceiling',f,L-1.4,L,-11,-8,y+2.8,y+2.96,white);
   if(y===q.entryFloor)label('east-entry-engineering36','ENGINEERING 36',east,(door0+door1)/2,-.2,y+2.7,2.9,.3,frame,'#d6d7ce','#9d4f3b');
 }
 const vent=box('east-ventilation-box',f,L,L+.8,-10.9,-10.1,q.floors[3]+2.25,q.floors[3]+2.9,0x9ca69b,'metal');
 for(let n=-10.85;n<-10.15;n+=.09)box('vent-grille',f,L+.805,L+.82,n,n+.025,q.floors[3]+2.3,q.floors[3]+2.85,0x626f66,'metal',vent);
 // 동쪽 옥상 사진에 보이는 낮은 돌출부의 폭과 깊이는 추정이다.
 const penthouse=box('east-rooftop-structure',f,L-6,L-1.5,-11.5,-6,q.roof,q.roof+2,0xc3c9bb);
 box('rooftop-dark-inset',f,L-1.49,L-1.45,-10.7,-6.8,q.roof+.5,q.roof+1.6,0x637264,'glass',penthouse);
 for(const a of [...q.surfaces,...q.elevated]){
   const elevated=q.elevated.includes(a),poly=[f.point(a.s0,a.n0),f.point(a.s1,a.n0),f.point(a.s1,a.n1),f.point(a.s0,a.n1)],height=(s:number,n:number)=>physics561SurfaceHeight(a,s,n),top=poly.map(p=>{const l=f.local(p);return new THREE.Vector3(p[0],height(l.s,l.n),p[1]);});
   const owner=part(a.name,[...top,...top.map(v=>v.clone().add(new THREE.Vector3(0,elevated?-.1:-.22,0)))],elevated?metal:a.name==='east-entry-pavers'?0x9b9180:0x929b8c,elevated?'metal':'stone');
   if(!elevated)pavementMasks.push({component:a.name,polygon:poly});
   const step=elevated?.28:.6;
   for(let n=Math.ceil(a.n0/step)*step;n<a.n1-.015;n+=step)part(elevated?'steel-tread-groove':'paving-joint',[at(f,a.s0,height(a.s0,n)+.004,n),at(f,a.s1,height(a.s1,n)+.004,n),at(f,a.s1,height(a.s1,n+.012)+.004,n+.012),at(f,a.s0,height(a.s0,n+.012)+.004,n+.012)],elevated?0x65746b:0x6f7466,'stone',owner,true);
   if(!elevated)for(let s=Math.ceil(a.s0/.6)*.6;s<a.s1-.015;s+=.6)part('paving-joint',[at(f,s,height(s,a.n0)+.005,a.n0),at(f,s+.012,height(s+.012,a.n0)+.005,a.n0),at(f,s+.012,height(s+.012,a.n1)+.005,a.n1),at(f,s,height(s,a.n1)+.005,a.n1)],0x6f7466,'stone',owner,true);
 }
 for(const flight of q.flights)for(const s of[L+1.12,L+3.18]){
   const stringer=beam('east-stair-stringer',at(f,s,flight.y0-.06,flight.n0),at(f,s,flight.y1-.06,flight.n1),.075,metal);
   for(const dy of[.45,.72,1.02])beam('east-stair-handrail',at(f,s,flight.y0+dy,flight.n0),at(f,s,flight.y1+dy,flight.n1),.025,metal,stringer);
   for(let n=flight.n0;n<=flight.n1+.001;n+=1){const y=flight.y0+(flight.y1-flight.y0)*(n-flight.n0)/(flight.n1-flight.n0);beam('east-stair-baluster',at(f,s,y,n),at(f,s,y+1.02,n),.025,metal,stringer);}
 }
 for(const a of q.elevated.filter(a=>a.name.endsWith('landing'))){
   for(const s of[L+1.12,L+3.18]){
     // 위층 문 앞의 안쪽 난간은 출입구를 가리지 않는다.
     if(a.name==='east-upper-door-landing'&&s<L+2)continue;
     const owner=beam('east-landing-railing',at(f,s,a.y0+1,a.n0),at(f,s,a.y0+1,a.n1),.03,metal);
     for(const n of[a.n0,a.n1])beam('east-landing-post',at(f,s,a.y0,n),at(f,s,a.y0+1,n),.035,metal,owner);
     for(const dy of[.45,.7])beam('east-landing-rail',at(f,s,a.y0+dy,a.n0),at(f,s,a.y0+dy,a.n1),.025,metal,owner);
   }
   for(const n of[a.n0,a.n1])beam('east-stair-support',at(f,L+3.18,q.entryFloor,n),at(f,L+3.18,a.y0,n),.06,metal);
 }
 // 서쪽 연결교는 사진의 위쪽 두 창줄과 곡면 지붕을 따른다. 아래 통로는 막지 않는다.
 const b=q.bridge;
 for(const y of[b.floors[0],b.floors[1],b.roof])box('west-bridge-floor',f,b.s0,b.s1,b.n-b.halfWidth,b.n+b.halfWidth,y-.22,y,white);
 for(const side of[-1,1]){
   const face=side<0?humanities23Frame(f.point(b.s0,b.n-b.halfWidth),f.point(0,b.n-b.halfWidth)):humanities23Frame(f.point(0,b.n+b.halfWidth),f.point(b.s0,b.n+b.halfWidth));
   for(let k=0;k<2;k++){
     const y=b.floors[k],top=k===0?b.floors[1]:b.roof,owner=box('west-bridge-white-wall',face,0,face.length,0,.2,y,top,white);
     for(let yy=y+.2;yy<top;yy+=.22)facet('bridge-cladding-joint',face,0,face.length,yy,yy+.011,-.008,0xb4bdb1,owner);
     ribbon(face,.25,face.length-.25,y+1.1,y+2.2,owner);
     for(let s=0;s<face.length;s+=4)box('bridge-white-pier',face,s,s+.2,-.13,.2,y,top,white,'stone',owner);
   }
 }
 const roofSections=10;
 for(let i=0;i<roofSections;i++){
   const a=Math.PI*i/roofSections,c=Math.PI*(i+1)/roofSections,n0=b.n-Math.cos(a)*b.halfWidth,n1=b.n-Math.cos(c)*b.halfWidth,y0=b.roof+.25+Math.sin(a)*1.1,y1=b.roof+.25+Math.sin(c)*1.1;
   const owner=part('west-bridge-curved-roof',[at(f,b.s0,y0,n0),at(f,0,y0,n0),at(f,0,y1,n1),at(f,b.s0,y1,n1),at(f,b.s0,y0+.08,n0),at(f,0,y0+.08,n0),at(f,0,y1+.08,n1),at(f,b.s0,y1+.08,n1)],0xb5bc9e,'glass');
   for(let s=b.s0;s<=.01;s+=1.5)beam('bridge-roof-rib',at(f,s,y0+.08,n0),at(f,s,y1+.08,n1),.03,white,owner);
 }

 const meshes=batches.map(b=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(b.colors,3));g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:b.glass?.3:.8,side:THREE.DoubleSide}));mesh.name=b.glass?'engineering36-glass':'engineering36-surfaces';mesh.castShadow=!b.glass;mesh.receiveShadow=true;shell.add(mesh);return mesh;});

 shell.userData.engineering36Exterior={buildingId:ENGINEERING36_ID,rawOsmFootprintPreserved:true,dimensionsEstimated:true,wholeInteriorImplemented:false,largeWindowRows:3,lowFoundationWindowRow:true,eastEntryAtSecondHighestWindowRow:true,doorLeavesOpenedForGameplay:true,westBridgeUpperTwoWindowRowsEstimated:true,northLinkPending:openings.length===0,routes:q.routes,pavementMasks,bounds:q.bounds,geometry:{meshes:meshes.length+signs.length,textures:signs.length,triangles:batches.reduce((n,b)=>n+b.positions.length/9,0)+signs.length*2,colliders:breakables.length}};
 function update(_player:THREE.Vector3){batches.forEach((b,index)=>{const a=meshes[index].geometry.attributes.position as THREE.BufferAttribute,c=meshes[index].geometry.attributes.color as THREE.BufferAttribute;let moved=false,tinted=false;for(const p of b.parts){if(p.shown!==p.proxy.visible){p.shown=p.proxy.visible;moved=true;if(p.shown)(a.array as Float32Array).set(p.original,p.start);else for(let i=p.start;i<p.end;i+=3){a.array[i]=p.proxy.position.x;a.array[i+1]=p.proxy.position.y;a.array[i+2]=p.proxy.position.z;}}if(p.color!==p.proxy.material.color.getHex()){p.color=p.proxy.material.color.getHex();tinted=true;const t=p.proxy.material.color,scale=[t.r/p.base.r,t.g/p.base.g,t.b/p.base.b];for(let i=p.start;i<p.end;i++)c.array[i]=p.colors[i-p.start]*scale[(i-p.start)%3];}}if(moved)a.needsUpdate=true;if(tinted)c.needsUpdate=true;});for(const s of signs)s.mesh.visible=s.owner.visible;shell.visible=batches.some(b=>b.parts.some(p=>p.proxy.visible));}
 return{shell,breakables,update};
}
