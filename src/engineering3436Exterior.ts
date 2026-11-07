import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import { humanities23Frame } from './humanities23Site';
import { physics561SurfaceHeight } from './physics561Site';
import { ENGINEERING34_ID, ENGINEERING3436_ID, type Engineering3436Layout } from './engineering3436Site';
type XZ=[number,number];type Frame=ReturnType<typeof humanities23Frame>;type Proxy=THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
export function createEngineering3436Exterior(scene:THREE.Scene,q:Engineering3436Layout){
 const shell=new THREE.Group();shell.name='landmark/engineering3436-exterior';Object.assign(shell.userData,{role:'building-shell',buildingId:ENGINEERING34_ID,buildingIds:[ENGINEERING34_ID]});scene.add(shell);
 

 let partBuilding=ENGINEERING34_ID;
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
    if (!owner) { proxy.position.copy(center); proxy.updateMatrixWorld(true); Object.assign(proxy.userData, { buildingId: partBuilding, component: name, renderProxy: true, convex: true }); breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attr.array), toughness: material === 'glass' ? 2 : 8, material, label: '34동과 36동 사이' }); }
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



 const f=q.axis, white=0xd7d5c9, panel=0x838b88, dark=0x3d4546, glass=0x526663, brick=0x775d4b;
 const pavementMasks:{component:string;polygon:XZ[]}[]=[{component:'engineering34-footprint',polygon:q.footprint}];
 const face=(s0:number,n0:number,s1:number,n1:number)=>humanities23Frame(f.point(s0,n0),f.point(s1,n1));
 const window=(wall:Frame,s0:number,s1:number,y0:number,y1:number,owner:Proxy)=>{
   facet('window-glass',wall,s0,s1,y0,y1,-.025,glass,owner);
   for(const y of[y0,y1])facet('window-horizontal-frame',wall,s0,s1,y-.035,y+.035,-.045,0xabb3ac,owner);
   const count=Math.max(2,Math.round((s1-s0)/.9));
   for(let i=0;i<=count;i++){const s=s0+(s1-s0)*i/count;facet('window-frame',wall,s-.025,s+.025,y0,y1,-.045,0xabb3ac,owner);}
 };
 const gridWall=(wall:Frame,westSide:boolean)=>{
   const bays=Math.max(3,Math.round(wall.length/4.8)),width=wall.length/bays;
   for(let i=0;i<bays;i++){
     const s0=i*width,s1=(i+1)*width;
     for(let k=0;k<q.floors.length;k++){
       const y=q.floors[k],top=q.floors[k+1]??q.roof,upper=k>=3,color=upper?panel:(westSide&&k===2?panel:brick);
       const wallPart=box(upper?'large-square-window-bay':'lower-small-window-bay',wall,s0,s1,0,.25,y,top,color);
       if(upper){
         window(wall,s0+.38,s1-.38,y+.75,top-.5,wallPart);
         box('deep-square-frame-pier',wall,s0,s0+.26,-.65,.25,y,top,white,'stone',wallPart);
         box('deep-square-frame-band',wall,s0,s1,-.65,.25,top-.24,top,white,'stone',wallPart);
       }else{
         const low=y+1.1,high=Math.min(y+2,top-.3);
         if(color===brick)for(let yy=y+.18;yy<top-.04;yy+=.18)facet('brick-horizontal-joint',wall,s0,s1,yy,yy+.012,-.008,0xa08e79,wallPart);
         window(wall,s0+.55,s1-.55,low,high,wallPart);
         if(color===panel)for(let s=s0+.8;s<s1;s+=.8)facet('gray-panel-joint',wall,s,s+.018,y,top,-.01,0x5c6662,wallPart);
       }
     }
   }
 };
 gridWall(face(q.west,q.north,q.west,q.mainStart),true);
 gridWall(face(q.east,q.mainStart,q.east,q.north),false);
 // 북쪽은 나무와 연결교에 가려진 부분을 단순화한다.
 const northFace=face(q.east,q.north,q.west,q.north),northWall=box('north-partly-observed-wall',northFace,0,northFace.length,0,.25,q.floors[0],q.roof,brick);
 facet('north-pale-cladding',northFace,0,northFace.length,q.floors[3],q.roof,-.015,white,northWall);
 box('main-roof',f,q.west,q.east,q.mainStart,q.north,q.roof-.22,q.roof,0x90998d);
 const guard=(s0:number,n0:number,s1:number,n1:number,y0:number,y1=y0,color=0x929b95,name='railing')=>{
   const owner=beam(name,at(f,s0,y0+1.02,n0),at(f,s1,y1+1.02,n1),.027,color);
   beam(name+'-middle',at(f,s0,y0+.52,n0),at(f,s1,y1+.52,n1),.022,color,owner);
   const count=Math.max(1,Math.ceil(Math.hypot(s1-s0,n1-n0)/1.25));
   for(let i=0;i<=count;i++){const u=i/count,s=s0+(s1-s0)*u,n=n0+(n1-n0)*u,y=y0+(y1-y0)*u;beam(name+'-post',at(f,s,y,n),at(f,s,y+1.02,n),.027,color,owner);}return owner;
 };
 for(const [s0,n0,s1,n1]of[[q.west,q.mainStart,q.west,q.north],[q.east,q.mainStart,q.east,q.north],[q.west,q.north,q.east,q.north]])guard(s0,n0,s1,n1,q.roof,q.roof,0xaab1a8,'roof-rail');
 const towerEast=q.bridgeWest-.35;
 for(const wall of[face(q.west,q.mainStart,q.west,q.southEdge),face(q.west,q.southEdge,towerEast,q.southEdge)]){
   const owner=box('southwest-gray-tower',wall,0,wall.length,0,.3,q.floors[0],q.roof,panel);
   for(let s=.28;s<wall.length;s+=.28)facet('vertical-metal-seam',wall,s,s+.012,q.floors[0],q.roof,-.01,0x596460,owner);
   for(const y of q.floors.slice(1))window(wall,wall.length*.44,wall.length*.44+.6,y+1.5,y+2.15,owner);
 }
 box('southwest-tower-roof',f,q.west,towerEast,q.southEdge,q.mainStart,q.roof-.2,q.roof,0x90998d);
 const southFace=face(towerEast,q.southEdge,q.east,q.southEdge),eastFace=face(q.east,q.southEdge,q.east,q.mainStart);
 let numberOwner:Proxy|undefined;
 for(const wall of[southFace,eastFace]){
   const lo=q.bridgeCenter-1-towerEast,hi=q.bridgeCenter+1-towerEast;
   const pieces=wall===southFace?[[0,lo,q.bridgeFloor,q.roof],[hi,wall.length,q.bridgeFloor,q.roof],[lo,hi,q.bridgeFloor+2.9,q.roof]]:[[0,wall.length,q.bridgeFloor,q.roof]];
   for(const [s0,s1,y0,y1]of pieces){
     if(s1-s0<.001)continue;
     const owner=box('charcoal-pavilion-wall',wall,s0,s1,0,.28,y0,y1,dark);numberOwner??=owner;
     for(let s=s0+.2;s<s1;s+=.2)facet('charcoal-vertical-seam',wall,s,s+.012,y0,y1,-.01,0x2e3837,owner);
     if(wall===southFace&&s1-s0>1&&y0===q.bridgeFloor)window(wall,s0+.35,s1-.35,q.bridgeFloor+.65,q.roof-.55,owner);
     else if(wall===eastFace)window(wall,wall.length*.4,wall.length*.4+1.2,q.bridgeFloor+1.05,q.roof-.65,owner);
   }
 }
 box('pavilion-floor',f,towerEast,q.east,q.southEdge,q.mainStart,q.bridgeFloor-.24,q.bridgeFloor,dark);
 box('pavilion-roof',f,towerEast,q.east,q.southEdge,q.mainStart,q.roof-.2,q.roof,dark);
 guard(towerEast,q.southEdge,q.east,q.southEdge,q.roof,q.roof,0xaab1a8,'pavilion-roof-rail');
 guard(q.east,q.southEdge,q.east,q.mainStart,q.roof,q.roof,0xaab1a8,'pavilion-roof-rail');
 label('building-number-34','34',southFace,southFace.length-1.1,-.045,q.roof-.36,1.35,.75,numberOwner!,'#3d4546','#e3e5da');
 for(const s of[q.bridgeEast+.65,49.5,q.east-.6])beam('round-white-piloti-column',at(f,s,q.courtFloor,q.southEdge+.5),at(f,s,q.bridgeFloor-.24,q.southEdge+.5),.24,white);
 const rear=face(towerEast,q.mainStart,q.east,q.mainStart),door0=q.rearDoor.s0-towerEast,door1=q.rearDoor.s1-towerEast;
 for(const [a,b,lo,hi]of[[0,door0,q.courtFloor,q.bridgeFloor],[door1,rear.length,q.courtFloor,q.bridgeFloor],[door0,door1,q.courtFloor+2.65,q.bridgeFloor]])box('piloti-rear-wall',rear,a,b,0,.25,lo,hi,panel);
 const doorTop=box('piloti-entry-lintel',f,q.rearDoor.s0-.12,q.rearDoor.s1+.12,q.mainStart-.15,q.mainStart+.15,q.courtFloor+2.5,q.courtFloor+2.65,white);
 for(const s of[q.rearDoor.s0-.12,q.rearDoor.s1])box('piloti-entry-jamb',f,s,s+.12,q.mainStart-.15,q.mainStart+.15,q.courtFloor,q.courtFloor+2.65,white,'stone',doorTop);
 box('piloti-vestibule-back',f,q.rearDoor.s0,q.rearDoor.s1,q.mainStart+1.2,q.mainStart+1.4,q.courtFloor,q.courtFloor+2.65,panel);
 for(const s of[q.rearDoor.s0,q.rearDoor.s1])box('piloti-vestibule-side',f,s-.05,s+.05,q.mainStart,q.mainStart+1.4,q.courtFloor,q.courtFloor+2.65,panel);
 box('piloti-open-glass-door',f,q.rearDoor.s0,q.rearDoor.s0+.07,q.mainStart-1.05,q.mainStart,q.courtFloor+.1,q.courtFloor+2.5,glass,'glass');
 // 연결교의 낮은 현관은 열린 문턱까지만 만든다.
 for(const floor of q.linkFloors){
   const lo=q.bridgeCenter-1,hi=q.bridgeCenter+1;
   const lintel=box('34-link-door-lintel',f,lo-.12,hi+.12,q.southEdge-.1,q.southEdge+.2,floor+2.7,floor+2.9,white);
   for(const s of[lo-.12,hi])box('34-link-door-jamb',f,s,s+.12,q.southEdge-.1,q.southEdge+.2,floor,floor+2.9,white,'stone',lintel);
   box('34-link-vestibule-back',f,lo,hi,q.southEdge+1.2,q.southEdge+1.4,floor,floor+2.7,panel);
   for(const s of[lo,hi])box('34-link-vestibule-side',f,s-.04,s+.04,q.southEdge,q.southEdge+1.4,floor,floor+2.7,panel);
 }
 partBuilding=ENGINEERING3436_ID;
 for(const a of[...q.surfaces,...q.elevated]){
   const elevated=q.elevated.includes(a),poly=[f.point(a.s0,a.n0),f.point(a.s1,a.n0),f.point(a.s1,a.n1),f.point(a.s0,a.n1)],height=(s:number,n:number)=>physics561SurfaceHeight(a,s,n),top=poly.map(p=>{const l=f.local(p);return new THREE.Vector3(p[0],height(l.s,l.n),p[1]);});
   const owner=part(a.name,[...top,...top.map(v=>v.clone().add(new THREE.Vector3(0,-.18,0)))],elevated?0xa6aaa1:0x93978d);
   if(!elevated)pavementMasks.push({component:a.name,polygon:poly});
   for(let n=Math.ceil(a.n0/.6)*.6;n<a.n1-.015;n+=.6)part('paving-joint',[at(f,a.s0,height(a.s0,n)+.004,n),at(f,a.s1,height(a.s1,n)+.004,n),at(f,a.s1,height(a.s1,n+.012)+.004,n+.012),at(f,a.s0,height(a.s0,n+.012)+.004,n+.012)],0x686f66,'stone',owner,true);
   for(let s=Math.ceil(a.s0/.6)*.6;s<a.s1-.015;s+=.6)part('paving-joint',[at(f,s,height(s,a.n0)+.005,a.n0),at(f,s+.012,height(s+.012,a.n0)+.005,a.n0),at(f,s+.012,height(s+.012,a.n1)+.005,a.n1),at(f,s,height(s,a.n1)+.005,a.n1)],0x686f66,'stone',owner,true);
 }
 const lowWall=box('court-low-white-wall',f,q.bridgeEast+.2,62.45,8.55,9.15,q.walkFloor,q.courtFloor+.42,white);
 box('court-west-retaining-wall',f,q.bridgeEast+.06,q.bridgeEast+.24,9.2,q.mainStart,q.plazaFloor,q.courtFloor,0x9ca295);
 box('court-black-wall-cap',f,q.bridgeEast+.2,62.45,8.52,9.18,q.courtFloor+.42,q.courtFloor+.52,dark,'stone',lowWall);
 guard(51.5,5.55,62.8,5.55,q.walkFloor,q.walkFloor,0x8b9690,'narrow-walk-rail');
 for(const n of[5.7,8.3])guard(q.bridgeEast,n,51.5,n,q.bridgeFloor,q.walkFloor,0x8b9690,'long-stair-rail');
 for(const flight of q.westFlights)for(const s of[flight.s0-.05,flight.s1+.05])guard(s,flight.n0,s,flight.n1,flight.y0,flight.y1,0x919d92,'west-stair-rail');
 guard(33.45,12,33.45,q.southEdge,q.linkFloors[0]);
 guard(33.45,q.southEdge,q.bridgeWest,q.southEdge,q.linkFloors[0]);
 guard(35.6,12,q.bridgeWest,12,q.linkFloors[0]);
 for(const s of[q.bridgeWest-.15,q.bridgeEast+.15])for(const n of[.4,4.2,9.6,q.southEdge-.4])box('white-link-column',f,s-.12,s+.12,n-.12,n+.12,q.plazaFloor,q.bridgeFloor,white);
 for(const floor of q.linkFloors){
   for(const s of[q.bridgeWest-.2,q.bridgeEast])box('white-link-edge-beam',f,s,s+.2,0,q.southEdge,floor-.18,floor,white);
   for(const side of[-1,1]){
     const s=side<0?q.bridgeWest:q.bridgeEast;
     const gaps=side<0&&floor===q.linkFloors[0]?[[0,12]]:side>0&&floor===q.bridgeFloor?[[0,5.6],[8.4,q.southEdge]]:[[0,q.southEdge]];
     for(const [n0,n1]of gaps){
       if(floor===q.bridgeFloor){
         const wall=box('upper-link-glazing',f,s-.035,s+.035,n0,n1,floor+.1,q.roof-.15,glass,'glass');
         for(let n=n0;n<=n1+.001;n+=1.15)box('upper-link-mullion',f,s-.07,s+.07,n-.025,n+.025,floor,q.roof-.12,dark,'metal',wall);
       }else guard(s,n0,s,n1,floor,floor,0x919d92,'lower-link-rail');
     }
   }
   const lo=q.bridgeCenter-1,hi=q.bridgeCenter+1;
   box('36-link-vestibule-back',f,lo,hi,-1.4,-1.2,floor,floor+2.8,panel);
   for(const s of[lo,hi])box('36-link-vestibule-side',f,s-.04,s+.04,-1.4,0,floor,floor+2.8,panel);
 }
 box('black-link-roof',f,q.bridgeWest-.2,q.bridgeEast+.2,0,q.southEdge,q.roof-.16,q.roof,dark);
 const meshes=batches.map(b=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(b.colors,3));g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:b.glass?.3:.8,side:THREE.DoubleSide}));mesh.name=b.glass?'engineering3436-glass':'engineering3436-surfaces';mesh.castShadow=!b.glass;mesh.receiveShadow=true;shell.add(mesh);return mesh;});

 shell.userData.engineering3436Exterior={buildingId:ENGINEERING34_ID,connectionId:ENGINEERING3436_ID,rawOsmFootprintPreserved:true,dimensionsEstimated:true,wholeInteriorImplemented:false,mainLargeWindowRows:2,pavilionWindowRows:1,lowerWestStairObserved:true,upperWestStairsUnconfirmed:true,plazaApproachEstimated:true,northFacadePartial:true,roofAlignmentEstimated:true,doorLeavesOpenedForGameplay:true,routes:q.routes,pavementMasks,bounds:q.bounds,geometry:{meshes:meshes.length+signs.length,textures:signs.length,triangles:batches.reduce((n,b)=>n+b.positions.length/9,0)+signs.length*2,colliders:breakables.length}};
 function update(_player:THREE.Vector3){batches.forEach((b,index)=>{const a=meshes[index].geometry.attributes.position as THREE.BufferAttribute,c=meshes[index].geometry.attributes.color as THREE.BufferAttribute;let moved=false,tinted=false;for(const p of b.parts){if(p.shown!==p.proxy.visible){p.shown=p.proxy.visible;moved=true;if(p.shown)(a.array as Float32Array).set(p.original,p.start);else for(let i=p.start;i<p.end;i+=3){a.array[i]=p.proxy.position.x;a.array[i+1]=p.proxy.position.y;a.array[i+2]=p.proxy.position.z;}}if(p.color!==p.proxy.material.color.getHex()){p.color=p.proxy.material.color.getHex();tinted=true;const t=p.proxy.material.color,scale=[t.r/p.base.r,t.g/p.base.g,t.b/p.base.b];for(let i=p.start;i<p.end;i++)c.array[i]=p.colors[i-p.start]*scale[(i-p.start)%3];}}if(moved)a.needsUpdate=true;if(tinted)c.needsUpdate=true;});for(const s of signs)s.mesh.visible=s.owner.visible;shell.visible=batches.some(b=>b.parts.some(p=>p.proxy.visible));}
 return{shell,breakables,update};
}
