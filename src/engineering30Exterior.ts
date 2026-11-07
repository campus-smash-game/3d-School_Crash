import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import type { CampusBuilding } from './fullCampus';
import { humanities23Frame } from './humanities23Site';
import { physics561SurfaceHeight } from './physics561Site';
import { ENGINEERING30_ID, engineering30ClipPolygon, engineering30SurfacePolygons, type Engineering30Layout } from './engineering30Site';
type XZ=[number,number];type Frame=ReturnType<typeof humanities23Frame>;type Proxy=THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
export function createEngineering30Exterior(scene:THREE.Scene,building:CampusBuilding,q:Engineering30Layout,heightAt:(x:number,z:number)=>number){
 const shell=new THREE.Group();shell.name='landmark/engineering30-exterior';Object.assign(shell.userData,{role:'building-shell',buildingId:ENGINEERING30_ID,buildingIds:[ENGINEERING30_ID]});scene.add(shell);
 

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
    if (!owner) { proxy.position.copy(center); proxy.updateMatrixWorld(true); Object.assign(proxy.userData, { buildingId: partBuilding, component: name, renderProxy: true, convex: true }); breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attr.array), toughness: material === 'glass' ? 2 : 8, material, label: '30동 공학관' }); }
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


 const white=0xd7d8ce,brick=0xa45e40,gray=0xa5a9a3,glass=0x65848b,frameColor=0xc3c9bd;
 const pavementMasks:{component:string;polygon:XZ[]}[]=[];
 const slab=(name:string,poly:XZ[],y:number,color:number,thickness=.22)=>part(name,poly.flatMap(p=>[new THREE.Vector3(p[0],y,p[1]),new THREE.Vector3(p[0],y-thickness,p[1])]),color);
 for(const ids of THREE.ShapeUtils.triangulateShape(q.outline.map(p=>new THREE.Vector2(...p)),[])){
   const poly=ids.map(i=>q.outline[i]);slab('main-ground-floor',poly,q.floor,0xbcbcaf);slab('main-roof',poly,q.roof,0x6d8672);
   pavementMasks.push({component:'main-footprint',polygon:poly});
 }
 const opening=q.connector.openings.find(o=>o.buildingId===building.id)!;
 function facade(poly:XZ[],tower=false){
   for(let i=0;i<poly.length;i++){
     if(!tower&&i===1)continue;
     const a=poly[i],b=poly[!tower&&i===0?2:(i+1)%poly.length],f=humanities23Frame(a,b),cuts=[0,f.length];
     const normal=[-(b[1]-a[1])/f.length,(b[0]-a[0])/f.length];
     const isSouth=!tower&&i===0, isWest=!tower&&i===4,east=!tower&&i===2;
     const door=isSouth?f.local(q.south.point(q.southDoor,0)).s:isWest?q.westDoor:undefined;
     const join=[f.local(opening.a),f.local(opening.b)],isJoin=!tower&&join.every(p=>Math.abs(p.n)<.02);
     const joinCuts=join.map(p=>p.s).sort((a,b)=>a-b);
     for(let s=4.8;s<f.length;s+=4.8)cuts.push(s);
     if(door!==undefined)for(const s of[door-1.35,door+1.35])if(s>0&&s<f.length)cuts.push(s);
     if(isJoin)for(const s of joinCuts)if(s>0&&s<f.length)cuts.push(s);
     cuts.sort((a,b)=>a-b);
     for(let j=0;j<cuts.length-1;j++){
       const s0=cuts[j],s1=cuts[j+1],mid=(s0+s1)/2,w=s1-s0;
       const doorBay=door!==undefined&&Math.abs(mid-door)<1.35,joinBay=isJoin&&mid>joinCuts[0]&&mid<joinCuts[1];
       const minGround=Math.min(...[s0,mid,s1].map(s=>heightAt(...f.point(s,0))));
       if(!doorBay&&!joinBay&&minGround<q.floor)box('gray-foundation',f,s0,s1,-.08,.16,minGround-.25,q.floor,gray);
       const columnWidth=Math.min(east?.42:.25,w*.18);
       for(const s of[s0,s1-columnWidth])box('white-facade-column',f,s,s+columnWidth,east?-.55:-.23,.19,joinBay?opening.top:doorBay?q.floor+2.7:q.floor,q.roof,white);
       for(let level=0;level<5;level++){
         const lo=q.floor+level*3.5,hi=lo+3.5;
         if(level===0&&(doorBay||joinBay)){const top=doorBay?q.floor+2.7:opening.top; if(top<hi)box('entry-lintel',f,s0,s1,-.08,.16,top,hi,white);continue;}
         const low=lo+1.1,high=hi-1.0,side=Math.min(east?.42:.25,w*.18),color=tower||level===0?gray:east?0x695447:brick;
         const spandrel=box(tower?'tower-panel':'brick-spandrel',f,s0,s1,-.08,.16,lo,hi,color);
         box('white-horizontal-beam',f,s0,s1,-.15,.18,high,hi,white,'stone',spandrel);
         const wa=tower?Math.max(s0+side,mid-.65):s0+side,wb=tower?Math.min(s1-side,mid+.65):s1-side;
         if(wb-wa>.08){const owner=box('ribbon-window',f,wa,wb,-.095,-.085,low,high,glass,'glass',spandrel);
           for(let s=wa;s<=wb+.001;s+=Math.max(.4,(wb-wa)/4))facet('window-mullion',f,s-.022,s+.022,low,high,-.106,east?0x4e5856:frameColor,owner);
           for(const y of[low,high-.35,high])facet('window-transom',f,wa,wb,y-.022,y+.022,-.106,east?0x4e5856:frameColor,owner);
         }
         if(!tower&&level>0){for(let y=lo+.12;y<low;y+=.16)facet('brick-mortar',f,s0,s1,y,y+.012,-.083,0xd1a079,spandrel);}
       }
       const cornice=box('deep-white-cornice',f,s0,s1,-.8,.18,q.roof-.16,q.roof+.16,white);
       box('slotted-parapet-base',f,s0,s1,-.1,.14,q.roof+.16,q.roof+.52,white,'stone',cornice);
       box('green-roof-rail',f,s0,s1,-.1,.14,q.roof+.88,q.roof+.98,0x648b79,'metal',cornice);
       for(let s=s0+.1;s<s1;s+=2.5)box('parapet-slot-post',f,s,s+.18,-.1,.14,q.roof+.52,q.roof+.88,white,'stone',cornice);
       const bracket=[at(f,mid-.16,q.roof-.15,.1),at(f,mid+.16,q.roof-.15,.1),at(f,mid-.16,q.roof-.7,.1),at(f,mid+.16,q.roof-.7,.1),at(f,mid-.16,q.roof-.15,-.75),at(f,mid+.16,q.roof-.15,-.75)];part('cornice-bracket',bracket,white,'stone',cornice);
     }
   }
 }
 // 원본 윤곽을 그대로 쓰는 긴 몸체와 사진에서 확인한 북쪽 계단실을 구분한다.
 facade(q.outline);facade(q.tower,true);
 for(const ids of THREE.ShapeUtils.triangulateShape(q.tower.map(p=>new THREE.Vector2(...p)),[]))slab('north-stair-tower-roof',ids.map(i=>q.tower[i]),q.roof,0x7b8e7c);
 for(const[name,f,door]of[['south',q.south,q.southDoor],['west',q.west,q.westDoor]] as [string,Frame,number][]){
   for(const s of[door-1.36,door+1.36]){box(name+'-door-frame',f,s-.04,s+.04,-.14,.15,q.floor,q.floor+2.7,frameColor,'metal');box(name+'-open-door-leaf',f,s-.035,s+.035,.18,1.1,q.floor+.03,q.floor+2.55,glass,'glass');}
   box(name+'-entry-canopy',f,door-1.7,door+1.7,-1.0,.25,q.floor+2.85,q.floor+3.03,white);
 }
 const westNumber=box('building-number-panel',q.west,25.5,27.5,-.82,-.8,q.roof-.1,q.roof+.65,white);
 label('building-number-30','30',q.west,26.5,-.83,q.roof+.28,1.6,.7,westNumber,'#d7d8ce','#5f9097');
 // 현관 표시와 문짝은 2026년 북쪽 거리뷰를 따른다. 지나갈 수 있도록 문은 열어 둔다.
 partBuilding='way/389628348';
 const front=humanities23Frame(q.north.point(q.north.length,0),q.north.point(0,0)),entry=front.length-q.entry;
 const sign=box('engineering-entry-sign',front,entry-3.1,entry+3.1,-.18,.04,q.floor+2.72,q.floor+3.65,white);
 label('engineering-direction-sign','‹30  ENGINEERING  31›',front,entry,-.19,q.floor+3.18,5.9,.65,sign,'#d7d8ce','#934c43');
 for(const s of[entry-3,entry+3]){box('connector-door-jamb',front,s-.06,s+.06,-.12,.14,q.floor,q.floor+2.72,0x828b81,'metal');const direction=s<entry?-1:1;box('connector-open-glass-door',front,Math.min(s,s+direction),Math.max(s,s+direction),-.13,-.085,q.floor+.04,q.floor+2.6,glass,'glass');}
 // 항공사진의 격자 덮개를 얕은 곡면으로 근사한다. 정확한 단면은 확인하지 못했다.
 const bridge=humanities23Frame(q.connector.point(0,0),q.connector.point(q.connector.length,0)),top=q.connector.upperFloors.at(-1)!;
 for(let s=0;s<bridge.length;s+=4){const end=Math.min(s+4,bridge.length);
   for(let j=0;j<8;j++){const a=-3+6*j/8,b=-3+6*(j+1)/8,ya=top+.35+.9*Math.sqrt(Math.max(0,1-a*a/9)),yb=top+.35+.9*Math.sqrt(Math.max(0,1-b*b/9));
     const cover=[at(bridge,s,ya,a),at(bridge,end,ya,a),at(bridge,end,yb,b),at(bridge,s,yb,b)];const owner=part('pale-curved-roof-cover',[...cover,...cover.map(p=>p.clone().add(new THREE.Vector3(0,-.05,0)))],0xbbbca0,'metal');
     beam('roof-white-lattice',at(bridge,s,ya,a),at(bridge,s,yb,b),.045,white,owner);
     beam('roof-longitudinal-frame',at(bridge,s,ya,a),at(bridge,end,ya,a),.035,white,owner);
   }
 }
 partBuilding=building.id;
 for(const a of q.surfaces)for(const corners of engineering30SurfacePolygons(a,q)){
   const f=a.frame,top=corners.map(p=>{const l=f.local(p);return new THREE.Vector3(p[0],physics561SurfaceHeight(a,l.s,l.n),p[1]);});
   const owner=part(a.name,[...top,...top.map(p=>p.clone().add(new THREE.Vector3(0,-.2,0)))],a.name.includes('stair')?0xb8bab0:0xa5aaa0);
   pavementMasks.push({component:a.name,polygon:corners});
   if(a.name.includes('paving')||a.name.includes('landing'))for(let s=a.s0;s<a.s1;s+=.6)for(let n=a.n0;n<a.n1;n+=.6){const end=Math.min(s+.57,a.s1),nn=Math.min(n+.57,a.n1),tile=[[s,n],[end,n],[end,nn],[s,nn]].map(([u,v])=>f.point(u,v));for(const poly of engineering30ClipPolygon(tile,corners,true))part('square-court-paver',poly.map(p=>{const l=f.local(p);return new THREE.Vector3(p[0],physics561SurfaceHeight(a,l.s,l.n)+.004,p[1]);}),0xc0c1b4,'stone',owner,true);}
   if(a.name==='north-broad-stair')box('broad-stair-nosing',f,a.s0,a.s0+.035,a.n0,a.n1,a.y0+.003,a.y0+.007,0x7c8479,'stone',owner);
 }
 const ramp=q.surfaces.find(a=>a.name==='connector-access-ramp')!;
 for(const n of[ramp.n0+.08,ramp.n1-.08]){const a=at(q.north,ramp.s0,ramp.y0+1,n),b=at(q.north,ramp.s1,ramp.y1+1,n),owner=beam('entry-ramp-handrail',a,b,.026,0x83908a);
   for(let s=ramp.s0;s<=ramp.s1;s+=.65){const y=physics561SurfaceHeight(ramp,s,n);beam('entry-ramp-baluster',at(q.north,s,y,n),at(q.north,s,y+1,n),.018,0x83908a,owner);}
 }
 for(const n of[-8.65,8.65])for(let i=0;i<q.stairCount-3;i++){const a=q.surfaces.filter(s=>s.name==='north-broad-stair')[i];box('stair-side-curb',q.stair,a.s0,a.s1,n-.12,n+.12,a.y0-.3,a.y0+.16,0x939b8b);}
 const meshes=batches.map(b=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(b.colors,3));g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:b.glass?.3:.8,side:THREE.DoubleSide}));mesh.name=b.glass?'engineering30-glass':'engineering30-surfaces';mesh.castShadow=!b.glass;mesh.receiveShadow=true;shell.add(mesh);return mesh;});

 shell.userData.engineering30Exterior={buildingIds:[ENGINEERING30_ID,'way/389628348','way/377154957'],floor:q.floor,roof:q.roof,court:q.court,aboveGroundFloors:5,rawOsmFootprintPreserved:true,northTowerFootprintEstimated:true,dimensionsEstimated:true,wholeInteriorImplemented:false,routes:q.routes,pavementMasks,geometry:{meshes:meshes.length+signs.length,textures:signs.length,triangles:batches.reduce((n,b)=>n+b.positions.length/9,0)+signs.length*2,colliders:breakables.length}};
 function update(_player:THREE.Vector3){batches.forEach((b,index)=>{const a=meshes[index].geometry.attributes.position as THREE.BufferAttribute,c=meshes[index].geometry.attributes.color as THREE.BufferAttribute;let moved=false,tinted=false;for(const p of b.parts){if(p.shown!==p.proxy.visible){p.shown=p.proxy.visible;moved=true;if(p.shown)(a.array as Float32Array).set(p.original,p.start);else for(let i=p.start;i<p.end;i+=3){a.array[i]=p.proxy.position.x;a.array[i+1]=p.proxy.position.y;a.array[i+2]=p.proxy.position.z;}}if(p.color!==p.proxy.material.color.getHex()){p.color=p.proxy.material.color.getHex();tinted=true;const t=p.proxy.material.color,scale=[t.r/p.base.r,t.g/p.base.g,t.b/p.base.b];for(let i=p.start;i<p.end;i++)c.array[i]=p.colors[i-p.start]*scale[(i-p.start)%3];}}if(moved)a.needsUpdate=true;if(tinted)c.needsUpdate=true;});for(const s of signs)s.mesh.visible=s.owner.visible;shell.visible=batches.some(b=>b.parts.some(p=>p.proxy.visible));}
 // 렌더 버퍼와 복원용 사본을 만든 뒤 조립용 배열을 비운다.
 for(const batch of batches){batch.positions.length=0;batch.colors.length=0;}
 return{shell,breakables,update};
}
