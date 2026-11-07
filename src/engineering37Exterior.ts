import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import type { CampusBuilding } from './fullCampus';
import { humanities23Frame } from './humanities23Site';
import { physics561SurfaceHeight } from './physics561Site';
import { ENGINEERING37_ID, type Engineering37Layout } from './engineering37Site';
type XZ=[number,number];type Frame=ReturnType<typeof humanities23Frame>;type Proxy=THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
export function createEngineering37Exterior(scene:THREE.Scene,q:Engineering37Layout){
 const shell=new THREE.Group();shell.name='landmark/engineering37-exterior';Object.assign(shell.userData,{role:'building-shell',buildingId:ENGINEERING37_ID,buildingIds:[ENGINEERING37_ID]});scene.add(shell);
 

 const partBuilding=ENGINEERING37_ID;
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
    if (!owner) { proxy.position.copy(center); proxy.updateMatrixWorld(true); Object.assign(proxy.userData, { buildingId: partBuilding, component: name, renderProxy: true, convex: true }); breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attr.array), toughness: material === 'glass' ? 2 : 8, material, label: '37동 공학관' }); }
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



 const white=0xd5d6cd,brick=0x75604e,glass=0x526964,frameColor=0x505b55,wood=0x796852,f=q.axis,w=q.width;
 const pavementMasks:{component:string;polygon:XZ[]}[]=[];
 const floor=q.floors[0];
 for(const a of q.blocks){
   box(a.name+'-base-floor',f,a.s0,a.s1,a.n0,a.n1,floor-.22,floor,0xaaa99d);
   box(a.name+'-roof',f,a.s0,a.s1,a.n0,a.n1,a.roof-.22,a.roof,0x8c9385);
   pavementMasks.push({component:a.name+'-footprint',polygon:[f.point(a.s0,a.n0),f.point(a.s1,a.n0),f.point(a.s1,a.n1),f.point(a.s0,a.n1)]});
 }
 const ribbon=(face:Frame,s0:number,s1:number,y0:number,y1:number,owner:Proxy,n=-.025)=>{
   facet('dark-window',face,s0,s1,y0,y1,n,glass,owner);
   const count=Math.max(2,Math.round((s1-s0)/.7));
   for(let i=0;i<=count;i++){const s=s0+(s1-s0)*i/count;facet('window-mullion',face,s-.018,s+.018,y0,y1,n-.01,frameColor,owner);}
   for(const y of[y0,y1-.32,y1])facet('window-horizontal-frame',face,s0,s1,y-.018,y+.018,n-.01,frameColor,owner);
 };
 const main=q.blocks.find(a=>a.name==='main')!,faces=[humanities23Frame(f.point(main.s0,0),f.point(main.s1,0)),humanities23Frame(f.point(main.s1,w),f.point(main.s0,w))];
 for(const face of faces){
   const bays=18,span=face.length/bays;
   for(let j=0;j<bays;j++){
     const s0=j*span,s1=(j+1)*span;
     for(let k=0;k<q.floors.length;k++){
       const y=q.floors[k],top=q.floors[k+1]??q.roof,owner=box(k===0?'main-stone-foundation-bay':'main-brick-window-bay',face,s0,s1,0,.2,y,top,k===0?0x979b8e:brick);
       for(let mortar=y+.16;mortar<top-.05;mortar+=k===0?.4:.17)facet('masonry-horizontal-joint',face,s0,s1,mortar,mortar+.014,-.007,k===0?0xb9bcaf:0x9b8873,owner);
       if(k===0){for(let s=s0+.35;s<s1;s+=.55)facet('foundation-vertical-joint',face,s,s+.012,y,y+1.7,-.009,0xb9bcaf,owner);ribbon(face,s0+.15,s1-.15,top-.88,top-.23,owner);}
       else{ribbon(face,s0+.23,s1-.23,y+.95,top-.38,owner);box('white-floor-band',face,s0,s1,-.3,.22,top-.28,top,white,'stone',owner);}
       if(k===1)for(let s=s0+.26;s<s1-.15;s+=.19)facet('low-window-security-bar',face,s,s+.018,y+.95,top-.38,-.055,0x99a299,owner);
     }
     box('main-white-column',face,s0,s0+.22,-.26,.24,floor,q.roof,white);
     for(let k=1;k<4;k++)box('projecting-white-fin',face,s0+.03,s0+.19,-1.05,.14,q.floors[k]+.05,q.floors[k+1]-.22,white);
     const cornice=box('deep-roof-cornice',face,s0,s1,-1.15,.22,q.roof-.22,q.roof+.12,white);
     box('roof-parapet-base',face,s0,s1,-.25,.16,q.roof+.12,q.roof+.4,white,'stone',cornice);
     box('roof-parapet-cap',face,s0,s1,-.27,.18,q.roof+.87,q.roof+1.02,white,'stone',cornice);
     box('roof-parapet-post',face,s0,s0+.18,-.25,.16,q.roof+.4,q.roof+.87,white,'stone',cornice);
     const mid=(s0+s1)/2;part('cornice-support',[at(face,mid-.1,q.roof-.2,.1),at(face,mid+.1,q.roof-.2,.1),at(face,mid-.1,q.roof-.65,.1),at(face,mid+.1,q.roof-.65,.1),at(face,mid-.1,q.roof-.2,-1.0),at(face,mid+.1,q.roof-.2,-1.0)],white,'stone',cornice);
   }
 }
 // 본체 끝벽은 사진의 어두운 벽돌 면에 대응한다.
 for(const [s,reverse]of[[main.s0,true],[main.s1,false]] as const){
   const face=humanities23Frame(f.point(s,reverse?w:0),f.point(s,reverse?0:w));
   const owner=box('main-brick-end-wall',face,0,face.length,0,.22,floor,q.roof,brick);
   for(let y=floor+.2;y<q.roof;y+=.17)facet('end-wall-mortar',face,0,face.length,y,y+.013,-.006,0x9b8873,owner);
   box('end-wall-cornice',face,0,face.length,-.7,.22,q.roof-.22,q.roof+.12,white,'stone',owner);
 }
 for(const a of q.blocks.filter(a=>a.name.endsWith('neck'))){
   for(const side of[-1,1]){
     const face=side<0?humanities23Frame(f.point(a.s0,a.n0),f.point(a.s1,a.n0)):humanities23Frame(f.point(a.s1,a.n1),f.point(a.s0,a.n1));
     for(let k=0;k<q.floors.length;k++){const y=q.floors[k],top=Math.min(q.floors[k+1]??a.roof,a.roof);if(top-y<.2)continue;const owner=box('recessed-neck-brick',face,0,face.length,0,.2,y,top,brick);box('neck-white-band',face,0,face.length,-.08,.2,top-.28,top,white,'stone',owner);ribbon(face,.25,face.length-.25,y+.65,Math.max(y+.75,top-.35),owner);}
   }
 }
 for(const a of q.blocks.filter(a=>a.name.endsWith('tower'))){
   const corners=[f.point(a.s0,0),f.point(a.s1,0),f.point(a.s1,w),f.point(a.s0,w)];
   for(let side=0;side<4;side++){
     const face=humanities23Frame(corners[side],corners[(side+1)%4]),owner=box(a.name+'-white-wall',face,0,face.length,0,.25,floor,a.roof,white);
     for(let y=floor+1;y<a.roof;y+=1.5)facet('tower-panel-seam',face,0,face.length,y,y+.012,-.006,0xb6bcb2,owner);
     if(side===2||(side===0&&a.name==='south-tower')){
       for(const y of[q.floors[1],q.floors[2],q.floors[3],q.floors[4],q.roof]){const narrow=y===q.floors[1]||(a.name==='south-tower'&&side===0&&y===q.floors[2]),low=y+(narrow?.3:.95),high=Math.min(low+(narrow?.7:1.35),a.roof-.45);ribbon(face,face.length*.2,face.length*.78,low,high,owner);}
     }else if(a.name==='north-tower'&&side===0){ribbon(face,face.length*.28,face.length*.72,q.floors[1]+.2,q.floors[1]+1.2,owner);}
   }
 }
 for(const [face,s]of[[faces[0],faces[0].length-1],[faces[1],faces[1].length-1]] as [Frame,number][]){const sign=box('main-building-number',face,s-.7,s+.7,-1.17,-1.14,q.roof-.12,q.roof+.62,white);label('building-number-37','37',face,s,-1.18,q.roof+.25,1.2,.7,sign,'#d5d6cd','#52757a');}
 const south=q.blocks.find(a=>a.name==='south-tower')!,southWest=humanities23Frame(f.point(south.s0,0),f.point(south.s1,0)),towerNumber=box('south-tower-number',southWest,southWest.length*.5-.7,southWest.length*.5+.7,-.035,-.01,q.towerRoof-.9,q.towerRoof-.15,white);
 // 남쪽 탑 상부의 돌출과 경사진 밑면은 사진에 근거하되 치수는 추정한다.
 part('south-tower-angled-overhang',[0,w].flatMap(n=>[at(f,south.s1,q.floors[3]+1.7,n),at(f,south.s1+1.3,q.floors[4],n),at(f,south.s1+1.3,q.towerRoof,n),at(f,south.s1,q.towerRoof,n)]),white);
 label('south-tower-number-text','37',southWest,southWest.length*.5,-.05,q.towerRoof-.5,1.2,.7,towerNumber,'#d5d6cd','#52757a');
 // 건물 쪽 낮은 공간과 광장 사이에 사진에서 확인한 경계 펜스를 둔다.
 const pergolaRoof=q.deck+2.8;
 for(let s=18;s<=64;s+=5.75)box('pergola-white-post',f,s-.12,s+.12,w+2.95,w+3.19,q.loweredStrip,pergolaRoof,white);
 for(const n of[w+.25,w+3.25])box('pergola-long-beam',f,16.8,66.2,n-.12,n+.12,pergolaRoof-.18,pergolaRoof,wood,'wood');
 for(let s=16.8;s<66.2;s+=.45)box('pergola-timber-slat',f,s,s+.1,w+.1,w+3.4,pergolaRoof,pergolaRoof+.12,wood,'wood');
 const fence=(s0:number,s1:number,n:number,y:number)=>{
   const owner=box('deck-boundary-fence-rail',f,s0,s1,n-.035,n+.035,y+.98,y+1.04,0x7b8880,'metal');
   for(let s=s0;s<=s1;s+=1.8)box('deck-boundary-fence-post',f,s-.035,s+.035,n-.035,n+.035,y,y+1.04,0x7b8880,'metal',owner);
   for(let s=s0;s<s1;s+=.16)part('fence-mesh-vertical',[at(f,s,y+.08,n),at(f,s+.012,y+.08,n),at(f,s+.012,y+.96,n),at(f,s,y+.96,n)],0x88978b,'metal',owner,true);
   for(let yy=y+.12;yy<y+.96;yy+=.17)part('fence-mesh-horizontal',[at(f,s0,yy,n),at(f,s1,yy,n),at(f,s1,yy+.012,n),at(f,s0,yy+.012,n)],0x88978b,'metal',owner,true);
 };
 fence(6,q.deckEnd,w+3.4,q.deck);
 for(const a of q.surfaces.filter(a=>a.name==='north-deck-approach'))for(const n of[a.n0-.08,a.n1+.08]){
   const owner=beam('north-approach-handrail',at(f,a.s0,a.y0+.95,n),at(f,a.s1,a.y1+.95,n),.035,0x7b8880);
   for(let s=a.s0;s<a.s1;s+=1.7){const y=physics561SurfaceHeight(a,s,n);box('north-approach-rail-post',f,s-.035,s+.035,n-.035,n+.035,y,y+.95,0x7b8880,'metal',owner);}
 }
 const curveRoof=q.deck+3.65,curveHalf=1.6;
 for(let i=0;i+1<q.eastCanopy.length;i++){
   const a=q.eastCanopy[i],b=q.eastCanopy[i+1],curve=humanities23Frame(f.point(a.s,a.n),f.point(b.s,b.n));
   const vertices=[0,curve.length].flatMap(s=>[-curveHalf,curveHalf].flatMap(n=>[curveRoof,curveRoof+.24].map(y=>at(curve,s,y,n)))),bounds=new THREE.Box3().setFromPoints(vertices),center=bounds.getCenter(new THREE.Vector3());
   const geometry=new ConvexGeometry(vertices.map(v=>v.clone().sub(center))),owner=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0x8b8d7e}));owner.position.copy(center);owner.updateMatrixWorld(true);
   Object.assign(owner.userData,{buildingId:ENGINEERING37_ID,component:'curved-pergola-roof',renderProxy:true,convex:true});breakables.push({mesh:owner,size:bounds.getSize(new THREE.Vector3()),collisionVertices:Float32Array.from(geometry.attributes.position.array),toughness:8,material:'metal',label:'37동 광장 곡선 차양'});
   for(const n of[-curveHalf,curveHalf]){
     box('curved-pergola-rim',curve,0,curve.length,n-.035,n+.035,curveRoof-.08,curveRoof+.38,0x7e8d84,'metal',owner);
     for(let s=0;s<curve.length;s+=.12)box('curved-rim-grid',curve,s,s+.016,n-.045,n+.045,curveRoof-.06,curveRoof+.36,0xa8b2a4,'metal',owner);
   }
   for(let s=0;s<curve.length;s+=.22)box('curved-pergola-wood-slat',curve,s,s+.09,-curveHalf,curveHalf,curveRoof,curveRoof+.14,wood,'wood',owner);
   for(let n=-curveHalf;n<=curveHalf;n+=.4)beam('curved-pergola-cross-grid',at(curve,0,curveRoof+.18,n),at(curve,curve.length,curveRoof+.18,n),.013,0x859389,owner);
   if(i%4===0)for(const n of[-1.35,1.35]){
     const point=f.local(curve.point(.12,n));let base=q.deck;
     for(const surface of q.surfaces)if(point.s>=surface.s0&&point.s<=surface.s1&&point.n>=surface.n0&&point.n<=surface.n1)base=physics561SurfaceHeight(surface,point.s,point.n);
     beam('curved-pergola-round-column',at(curve,.12,base,n),at(curve,.12,curveRoof,n),.12,0x9a9e91);
   }
 }
 // 남쪽 흰 기단과 원형 격자의 용도는 확인하지 못했다. 물이나 작동 효과를 넣지 않는다.
 const p=q.plinth,plinthTop=p.points.map((v,i)=>at(f,v[0],p.top[i],v[1]));
 const plinthOwner=part('south-pale-plinth',[...plinthTop,...p.points.map(v=>at(f,v[0],q.deck-.08,v[1]))],0xc8c9bc);
 for(let i=0;i<3;i++){const a=plinthTop[i],b=plinthTop[(i+1)%3];beam('plinth-edge-joint',a.clone().add(new THREE.Vector3(0,.007,0)),b.clone().add(new THREE.Vector3(0,.007,0)),.012,0x9b9e90,plinthOwner);}
 const ringFloor=p.top[0]+(p.top[1]-p.top[0])*(p.ring.s-37)/8;
 for(let i=0;i<20;i++){
   const a=i/20*Math.PI*2,b=(i+1)/20*Math.PI*2,ring=humanities23Frame(f.point(p.ring.s+Math.cos(a)*p.ring.radius,p.ring.n+Math.sin(a)*p.ring.radius),f.point(p.ring.s+Math.cos(b)*p.ring.radius,p.ring.n+Math.sin(b)*p.ring.radius));
   const owner=box('south-plinth-circular-grille',ring,0,ring.length,-.035,.035,ringFloor,ringFloor+p.ring.height,0x65766d,'metal');
   for(let s=.04;s<ring.length;s+=.08)facet('circular-grille-line',ring,s,s+.012,ringFloor,ringFloor+p.ring.height,-.04,0xa0ad9f,owner);
 }
 for(const n of[54.05,57.95]){
   const y0=q.deck+.72,y1=q.deck,owner=beam('northeast-stair-handrail',at(f,-1,y0+.9,n),at(f,4,y1+.9,n),.035,0x87978b);
   for(let s=-1;s<=4;s+=1){const y=s<0?y0:q.deck+.72-.18*Math.min(4,Math.floor(s)+1);box('northeast-rail-baluster',f,s-.025,s+.025,n-.025,n+.025,y,y+.9,0x87978b,'metal',owner);}
 }
 const end=q.eastCanopy.at(-1)!,screenFrame=humanities23Frame(f.point(end.s,end.n-curveHalf),f.point(end.s,end.n+curveHalf));
 const screenVertices=[0,screenFrame.length].flatMap(s=>[-.12,.12].flatMap(n=>[q.deck,curveRoof+.38].map(y=>at(screenFrame,s,y,n)))),screenBounds=new THREE.Box3().setFromPoints(screenVertices),screenCenter=screenBounds.getCenter(new THREE.Vector3());
 const screenGeometry=new ConvexGeometry(screenVertices.map(v=>v.clone().sub(screenCenter))),screenOwner=new THREE.Mesh(screenGeometry,new THREE.MeshStandardMaterial({color:0x7c877d}));screenOwner.position.copy(screenCenter);screenOwner.updateMatrixWorld(true);
 Object.assign(screenOwner.userData,{buildingId:ENGINEERING37_ID,component:'curved-pergola-lattice-screen',renderProxy:true,convex:true});breakables.push({mesh:screenOwner,size:screenBounds.getSize(new THREE.Vector3()),collisionVertices:Float32Array.from(screenGeometry.attributes.position.array),toughness:8,material:'metal',label:'광장 격자 지지대'});
 for(const s of[0,screenFrame.length]){
   const owner=box('curved-pergola-lattice-post',screenFrame,s-.07,s+.07,-.12,.12,q.deck,curveRoof+.38,0x7c877d,'metal',screenOwner);
   if(s===0){for(let y=q.deck+.25;y<curveRoof;y+=.24)box('lattice-screen-crossbar',screenFrame,0,screenFrame.length,-.055,.055,y,y+.045,0x81755c,'wood',owner);for(let x=.3;x<screenFrame.length;x+=.3)box('lattice-screen-grid',screenFrame,x,x+.018,-.07,.07,q.deck,curveRoof,0xa0aa9d,'metal',owner);}
 }
 for(const t of q.trees){
   const soil=box('deck-tree-bed',f,t.s-.65,t.s+.65,t.n-.65,t.n+.65,q.deck-.02,q.deck+.035,0x665e4d,'wood');
   const trunk=beam('deck-tree-trunk',at(f,t.s,q.deck,t.n),at(f,t.s,q.deck+4.4,t.n),.13,0x625948);
   for(const [ds,dn]of[[-.6,0],[.6,0],[0,-.6],[0,.6]]){
     const face=humanities23Frame(f.point(t.s+ds-(dn===0?0:.55),t.n+dn-(ds===0?0:.55)),f.point(t.s+ds+(dn===0?0:.55),t.n+dn+(ds===0?0:.55)));
     const guard=box('tree-guard-frame',face,0,face.length,-.025,.025,q.deck+.48,q.deck+.53,0x8c9789,'metal');
     for(let s=0;s<face.length;s+=.12)facet('tree-guard-mesh',face,s,s+.012,q.deck+.04,q.deck+.48,-.03,0x8c9789,guard);
   }
   const crown=new THREE.IcosahedronGeometry(1,0),a=crown.attributes.position;
   for(const[dx,dz,r]of[[0,0,1.8],[.6,.4,1.35],[-.5,-.4,1.3]]){const center=at(f,t.s+dx,q.deck+4.3+r*.4,t.n+dz);part('deck-tree-crown',Array.from({length:a.count},(_,i)=>new THREE.Vector3(a.getX(i)*r,a.getY(i)*r*.75,a.getZ(i)*r).add(center)),0x75834e,'wood',trunk);}crown.dispose();
   const seat=box('metal-tree-bench',f,t.s-1.1,t.s+1.1,t.n+.8,t.n+1.24,q.deck+.44,q.deck+.51,0xa5aaa0,'metal');
   for(const s of[t.s-1.02,t.s+1.02])for(let n=t.n+.83;n<t.n+1.23;n+=.075)box('bench-grid-leg',f,s-.025,s+.025,n,n+.022,q.deck,q.deck+.44,0x59675e,'metal',seat);
   for(let n=t.n+.84;n<t.n+1.22;n+=.08)part('bench-top-joint',[at(f,t.s-1.05,q.deck+.515,n),at(f,t.s+1.05,q.deck+.515,n),at(f,t.s+1.05,q.deck+.515,n+.012),at(f,t.s-1.05,q.deck+.515,n+.012)],0x768277,'metal',seat,true);
   soil.name='tree-bed';
 }
 for(const a of q.surfaces.filter(a=>a.name==='north-timber-seating-tier'))for(const n of[36,41,46,51]){
   const s=a.s0+.5,y=a.y0,pot=box('north-tier-planter',f,s-.28,s+.28,n-.28,n+.28,y,y+.55,0x92998c);
   const crown=new THREE.IcosahedronGeometry(.45,0),attr=crown.attributes.position,center=at(f,s,y+.85,n);part('tier-planter-shrub',Array.from({length:attr.count},(_,i)=>new THREE.Vector3(attr.getX(i),attr.getY(i)*1.5,attr.getZ(i)).add(center)),0x7b6652,'wood',pot);crown.dispose();
 }
 // 남서쪽 목재 칸막이는 실내 현관으로 확정하지 않았다. 보이는 작은 공간만 만든다.
 const screen=q.screenFloor,door=68;
 for(const[a,b]of[[66.3,door-.7],[door+.7,71.9]]){
   const owner=box('southwest-timber-screen',f,a,b,1.8,2,screen,screen+2.5,wood,'wood');
   for(let y=screen+.18;y<screen+2.5;y+=.18)facet('screen-horizontal-joint',f,a,b,y,y+.018,1.79,0x4f4b40,owner);
 }
 for(const s of[66.3,71.7])box('screen-side-wall',f,s,s+.2,1.8,6.3,screen,screen+2.5,wood,'wood');
 box('screen-back-wall',f,66.3,71.9,6.1,6.3,screen,screen+2.5,wood,'wood');
 box('screen-open-door',f,door-.73,door-.65,.55,1.95,screen+.03,screen+2.4,0x756856,'wood');
 for(const a of q.surfaces){
   const poly=[f.point(a.s0,a.n0),f.point(a.s1,a.n0),f.point(a.s1,a.n1),f.point(a.s0,a.n1)],height=(s:number,n:number)=>physics561SurfaceHeight(a,s,n),top=poly.map(v=>{const p=f.local(v);return new THREE.Vector3(v[0],height(p.s,p.n),v[1]);});
   const timber=a.name==='east-timber-deck'||a.name==='north-timber-seating-tier'||a.name==='north-seating-top',grid=a.name==='east-grid-paving',owner=part(a.name,[...top,...top.map(v=>v.clone().add(new THREE.Vector3(0,-.22,0)))],timber?0x736b56:grid?0xa49c83:0x969d90,timber?'wood':'stone');pavementMasks.push({component:a.name,polygon:poly});
   if(grid){
     for(let s=Math.ceil(a.s0/.4)*.4;s<a.s1-.012;s+=.4)part('plaza-paver-joint',[at(f,s,a.y0+.003,a.n0),at(f,s+.012,a.y0+.003,a.n0),at(f,s+.012,a.y0+.003,a.n1),at(f,s,a.y0+.003,a.n1)],0x817e69,'stone',owner,true);
     for(let n=Math.ceil(a.n0/.8)*.8;n<a.n1-.012;n+=.8)part('plaza-paver-joint',[at(f,a.s0,a.y0+.003,n),at(f,a.s1,a.y0+.003,n),at(f,a.s1,a.y0+.003,n+.012),at(f,a.s0,a.y0+.003,n+.012)],0x817e69,'stone',owner,true);
   }
   if(timber){for(let s=a.s0;s<a.s1-.01;s+=.18)part('timber-deck-joint',[at(f,s,height(s,a.n0)+.004,a.n0),at(f,s+.012,height(s+.012,a.n0)+.004,a.n0),at(f,s+.012,height(s+.012,a.n1)+.004,a.n1),at(f,s,height(s,a.n1)+.004,a.n1)],0x514e42,'wood',owner,true);}
   else if(grid){for(let s=Math.ceil(a.s0/4)*4;s<a.s1;s+=4)part('plaza-white-grid',[at(f,s,a.y0+.005,a.n0),at(f,Math.min(s+.2,a.s1),a.y0+.005,a.n0),at(f,Math.min(s+.2,a.s1),a.y0+.005,a.n1),at(f,s,a.y0+.005,a.n1)],0xdce0d1,'stone',owner,true);for(let n=w+3.5;n<a.n1;n+=4){if(n<a.n0)continue;part('plaza-white-grid',[at(f,a.s0,a.y0+.005,n),at(f,a.s1,a.y0+.005,n),at(f,a.s1,a.y0+.005,Math.min(n+.2,a.n1)),at(f,a.s0,a.y0+.005,Math.min(n+.2,a.n1))],0xdce0d1,'stone',owner,true);}}
   else if(a.name==='west-paved-walk'||a.name==='west-wall-apron'){
     for(let s=Math.ceil(a.s0/.6)*.6;s<a.s1;s+=.6)part('west-paver-joint',[at(f,s,height(s,a.n0)+.005,a.n0),at(f,Math.min(s+.012,a.s1),height(Math.min(s+.012,a.s1),a.n0)+.005,a.n0),at(f,Math.min(s+.012,a.s1),height(Math.min(s+.012,a.s1),a.n1)+.005,a.n1),at(f,s,height(s,a.n1)+.005,a.n1)],0x697568,'stone',owner,true);
   }
 }
 const meshes=batches.map(b=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(b.colors,3));g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:b.glass?.3:.8,side:THREE.DoubleSide}));mesh.name=b.glass?'engineering37-glass':'engineering37-surfaces';mesh.castShadow=!b.glass;mesh.receiveShadow=true;shell.add(mesh);return mesh;});

 shell.userData.engineering37Exterior={buildingId:ENGINEERING37_ID,rawOsmFootprintPreserved:true,dimensionsEstimated:true,wholeInteriorImplemented:false,visibleWestNorthWindowRows:4,lowFoundationWindowRow:true,bothEndTowers:true,loweredStripDepthEstimated:true,woodScreenUseUnknown:true,eastCanopyFloorEstimated:true,plinthUseUnknown:true,roofIsWalkway:false,routes:q.routes,pavementMasks,bounds:q.bounds,geometry:{meshes:meshes.length+signs.length,textures:signs.length,triangles:batches.reduce((n,b)=>n+b.positions.length/9,0)+signs.length*2,colliders:breakables.length}};
 function update(_player:THREE.Vector3){batches.forEach((b,index)=>{const a=meshes[index].geometry.attributes.position as THREE.BufferAttribute,c=meshes[index].geometry.attributes.color as THREE.BufferAttribute;let moved=false,tinted=false;for(const p of b.parts){if(p.shown!==p.proxy.visible){p.shown=p.proxy.visible;moved=true;if(p.shown)(a.array as Float32Array).set(p.original,p.start);else for(let i=p.start;i<p.end;i+=3){a.array[i]=p.proxy.position.x;a.array[i+1]=p.proxy.position.y;a.array[i+2]=p.proxy.position.z;}}if(p.color!==p.proxy.material.color.getHex()){p.color=p.proxy.material.color.getHex();tinted=true;const t=p.proxy.material.color,scale=[t.r/p.base.r,t.g/p.base.g,t.b/p.base.b];for(let i=p.start;i<p.end;i++)c.array[i]=p.colors[i-p.start]*scale[(i-p.start)%3];}}if(moved)a.needsUpdate=true;if(tinted)c.needsUpdate=true;});for(const s of signs)s.mesh.visible=s.owner.visible;shell.visible=batches.some(b=>b.parts.some(p=>p.proxy.visible));}
 // 렌더 버퍼와 복원용 사본을 만든 뒤 조립용 배열을 비운다.
 for(const batch of batches){batch.positions.length=0;batch.colors.length=0;}
 return{shell,breakables,update};
}
