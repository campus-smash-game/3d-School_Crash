import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import type { CampusBuilding } from './fullCampus';
import { humanities23Frame } from './humanities23Site';
import { physics561SurfaceHeight } from './physics561Site';
import { ENGINEERING30_DINING_ID, type Engineering30DiningLayout } from './engineering30DiningSite';
type XZ=[number,number];type Frame=ReturnType<typeof humanities23Frame>;type Proxy=THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
export function createEngineering30DiningExterior(scene:THREE.Scene,building:CampusBuilding,q:Engineering30DiningLayout,heightAt:(x:number,z:number)=>number){
 const shell=new THREE.Group();shell.name='landmark/engineering30-dining-exterior';Object.assign(shell.userData,{role:'building-shell',buildingId:ENGINEERING30_DINING_ID,buildingIds:[ENGINEERING30_DINING_ID]});scene.add(shell);
 

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
    if (!owner) { proxy.position.copy(center); proxy.updateMatrixWorld(true); Object.assign(proxy.userData, { buildingId: partBuilding, component: name, renderProxy: true, convex: true }); breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attr.array), toughness: material === 'glass' ? 2 : 8, material, label: '30-2동 공대간이식당' }); }
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

 const white=0xd8d9d4,gray=0x9b9fa0,glass=0x668d94,metal=0x66716e;
 const pavementMasks:{component:string;polygon:XZ[]}[]=[];
 function panel(name:string,e:Frame,a:number,b:number,lo:number,hi:number,color=gray){
   if(b-a<.02)return;
   const owner=box(name,e,a,b,-.12,.12,lo,hi,color,'metal');
   for(let y=lo+.55;y<hi;y+=.55)facet('horizontal-panel-joint',e,a,b,y,y+.015,-.126,0x72797a,owner);
   return owner;
 }
 function window(e:Frame,a:number,b:number){
   if(b-a<.02)return;
   const owner=box('curved-dining-glass',e,a,b,-.065,.065,q.floor+.48,q.floor+2.9,glass,'glass');
   for(let s=a;s<b;s+=1.35)box('white-window-mullion',e,s-.03,s+.03,-.1,.1,q.floor+.48,q.floor+2.9,white,'metal',owner);
   for(const y of[.48,.85,2.5,2.9])box('white-window-transom',e,a,b,-.1,.1,q.floor+y-.025,q.floor+y+.025,white,'metal',owner);
   return owner;
 }
 // 원본의 좁은 곡면 윤곽을 유지하고, 사진에 보이는 단층 몸체를 만든다.
 const triangles=THREE.ShapeUtils.triangulateShape(q.outline.map(p=>new THREE.Vector2(...p)),[]);
 for(const ids of triangles){
   const points=ids.map(i=>q.outline[i]);
   for(const[name,y,h,color]of[['dining-floor',q.floor,.22,0xb5b8ae],['flat-roof',q.roof,.22,0xd8d9d4]] as [string,number,number,number][]){
     part(name,points.flatMap(p=>[new THREE.Vector3(p[0],y,p[1]),new THREE.Vector3(p[0],y-h,p[1])]),color);
   }
 }
 for(let i=0;i<q.outline.length;i++){
   if([0,1,7,8].includes(i))continue;
   const e=humanities23Frame(q.outline[i],q.outline[(i+1)%q.outline.length]);
   if(i>=9){
     panel('north-panel-base',e,0,e.length,q.floor-.2,q.floor+.48);
     window(e,0,e.length);
     panel('north-panel-fascia',e,0,e.length,q.floor+2.9,q.roof);
     box('thin-window-canopy',e,0,e.length,-.5,.16,q.floor+2.95,q.floor+3.03,metal,'metal');
   }else panel('south-panel-wall',e,0,e.length,q.floor-.2,q.roof);
 }
 for(const[name,e,door,broad]of[['west',q.west,q.westDoor,false],['east',q.east,q.eastDoor,true]] as [string,Frame,number,boolean][]){
   const half=broad?1.35:1.1;
   panel(name+'-entry-side',e,0,Math.max(0,door-half),q.floor,q.roof,broad?gray:0x737b7a);
   panel(name+'-entry-side',e,Math.min(e.length,door+half),e.length,q.floor,q.roof,broad?gray:0x737b7a);
   panel(name+'-entry-header',e,door-half,door+half,q.floor+2.65,q.roof);
   for(const s of[door-half,door+half])box('entry-white-jamb',e,s-.04,s+.04,-.17,.15,q.floor,q.floor+2.65,white,'metal');
   // 양쪽 문은 열린 상태로 두고 문짝을 안쪽 옆면에 배치한다.
   for(const s of[door-half-.05,door+half+.05])box('open-glass-door',e,s-.045,s+.045,.16,1.06,q.floor+.04,q.floor+2.4,glass,'glass');
   const canopy=box(name+'-entry-canopy',e,door-half-.4,door+half+.4,-1.0,.2,q.floor+2.8,q.floor+2.96,broad?gray:0xad563b,'metal');
   if(!broad)label('gonggan-west-sign','공간 工簡',e,door,-1.01,q.floor+2.88,2.7,.4,canopy,'#ad563b','#fff7e8');
   else{
     const board=box('east-gonggan-window-board',e,door-half-1.05,door-half-.15,-.135,-.12,q.floor+.6,q.floor+2.6,0xe5e4d3);
     label('gonggan-east-board','공간',e,door-half-.6,-.15,q.floor+1.6,.82,.8,board,'#e5e4d3','#a34b3e');
     const vend=box('pink-vending-machine',e,door-half-2.0,door-half-1.18,-.68,.12,q.floor,q.floor+2.2,0xc66399,'metal');
     box('vending-display',e,door-half-1.9,door-half-1.29,-.69,-.68,q.floor+.9,q.floor+1.8,0x3c5358,'glass',vend);
     for(let x=door-half-1.85;x<door-half-1.35;x+=.12)for(let y=q.floor+1.05;y<q.floor+1.7;y+=.2)box('vending-product',e,x,x+.07,-.7,-.69,y,y+.1,0xb4b9a3,'metal',vend);
   }
 }
 // 내부 사진에서 보이는 밝은 상판과 의자를 제한된 수량으로 배치한다.
 const axis=humanities23Frame([0,0],[1,0]);
 for(const[x,z]of[[202,-1012.1],[205.5,-1011.8]]){
   const owner=box('dining-table',axis,x-.75,x+.75,z-.38,z+.38,q.floor+.72,q.floor+.79,0xb89961,'wood');
   for(const xx of[x-.55,x+.55])for(const zz of[z-.26,z+.26])box('table-leg',axis,xx-.035,xx+.035,zz-.035,zz+.035,q.floor,q.floor+.72,metal,'metal',owner);
   for(const xx of[x-.45,x+.45]){const seat=box('dining-chair',axis,xx-.22,xx+.22,z-.9,z-.5,q.floor+.42,q.floor+.48,0xd6d4bc,'wood');box('chair-back',axis,xx-.22,xx+.22,z-.95,z-.89,q.floor+.43,q.floor+.93,0xd6d4bc,'wood',seat);}
 }
 for(const a of q.surfaces){
   const e=a.frame,corners=[e.point(a.s0,a.n0),e.point(a.s1,a.n0),e.point(a.s1,a.n1),e.point(a.s0,a.n1)],top=corners.map(p=>{const l=e.local(p);return new THREE.Vector3(p[0],physics561SurfaceHeight(a,l.s,l.n),p[1]);});
   const stair=a.name.includes('stair'),owner=part(a.name,[...top,...top.map(p=>new THREE.Vector3(p.x,Math.min(p.y-.22,heightAt(p.x,p.z)-.2),p.z))],stair?0xc4c5bb:0xa9afa8);
   pavementMasks.push({component:a.name,polygon:corners});
   if(!stair)for(let s=a.s0;s<a.s1;s+=.45)for(let n=a.n0;n<a.n1;n+=.45){const ss=Math.min(s+.43,a.s1),nn=Math.min(n+.43,a.n1),ps=[[s,n],[ss,n],[ss,nn],[s,nn]].map(([u,v])=>at(e,u,physics561SurfaceHeight(a,u,v)+.005,v));part('square-paving-block',ps,Math.abs(Math.round(s*10+n*10))%5===0?0x777f79:0xc3c6ba,'stone',owner,true);}
   else box('step-nosing',e,a.s0,a.s1,a.n1-.025,a.n1,a.y0+.003,a.y0+.008,0x8e978d,'stone',owner);
 }
 for(const p of q.pavingJoins){
   pavementMasks.push({component:'north-paving-join',polygon:p.map(v=>[v[0],v[2]])});
   for(const ids of[[0,1,2],[0,2,3]]){
     const top=ids.map(i=>new THREE.Vector3(...p[i]));
     const area=top[1].clone().sub(top[0]).cross(top[2].clone().sub(top[0])).length();if(area<1e-6)continue;
     part('north-corner-paving',[...top,...top.map(v=>v.clone().add(new THREE.Vector3(0,-.25,0)))],0xc3c6ba);
   }
 }
 pavementMasks.push({component:'dining-footprint',polygon:q.outline});
 const bridge=q.surfaces.find(a=>a.name==='west-entry-bridge')!;
 for(const s of[bridge.s0+.08,bridge.s1-.08]){
   const a=at(q.west,s,bridge.y0+1.0,bridge.n0),b=at(q.west,s,q.floor+1.0,bridge.n1),owner=beam('west-bridge-handrail',a,b,.025,metal);
   for(let n=bridge.n0;n<bridge.n1;n+=.65){const y=physics561SurfaceHeight(bridge,s,n);beam('bridge-baluster',at(q.west,s,y,n),at(q.west,s,y+1,n),.018,metal,owner);}
   for(const dy of[-.3,-.6])beam('bridge-horizontal-rail',a.clone().add(new THREE.Vector3(0,dy,0)),b.clone().add(new THREE.Vector3(0,dy,0)),.014,metal,owner);
 }
 for(const[e,s,n,y]of[[q.east,q.eastDoor,-1,q.floor],[q.east,q.eastDoor,-3.45,q.court],[q.west,q.westDoor,-.4,q.floor]] as [Frame,number,number,number][]){
   const owner=box('tactile-block',e,s-.72,s+.72,n-.22,n+.22,y+.012,y+.023,0xc0ad5f);
   for(let u=s-.63;u<s+.7;u+=.16)for(let v=n-.15;v<n+.2;v+=.14)box('tactile-dot',e,u,u+.045,v,v+.045,y+.023,y+.035,0xd4c175,'stone',owner);
 }
 for(let i=9;i<q.outline.length;i++){
   const e=humanities23Frame(q.outline[i],q.outline[(i+1)%q.outline.length]);
   for(let s=.5;s<e.length;s+=1.2){const y=heightAt(...e.point(s,-1.15)),owner=box('north-planter-edge',e,s-.5,Math.min(s+.5,e.length),-1.8,-1.65,y,y+.18,0x8c9683);
     const g=new THREE.IcosahedronGeometry(.62,1),p=g.attributes.position;part('north-shrub',Array.from({length:p.count},(_,j)=>new THREE.Vector3(p.getX(j),p.getY(j)*.65,p.getZ(j)).add(at(e,s,y+.55,-.9))),0x64774e,'wood',owner);g.dispose();
   }
 }
 const meshes=batches.map(b=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(b.colors,3));g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:b.glass?.3:.8,side:THREE.DoubleSide}));mesh.name=b.glass?'engineering30-dining-glass':'engineering30-dining-surfaces';mesh.castShadow=!b.glass;mesh.receiveShadow=true;shell.add(mesh);return mesh;});
 shell.userData.engineering30DiningExterior={buildingIds:[ENGINEERING30_DINING_ID],floor:q.floor,roof:q.roof,aboveGroundFloors:1,rawOsmFootprintPreserved:true,dimensionsEstimated:true,entranceCoordinatesFromOsm:true,entranceShapeEstimated:true,currentName:'공간',oldToogoodSignExcluded:true,wholeInteriorImplemented:false,routes:q.routes,pavementMasks,geometry:{meshes:meshes.length+signs.length,textures:signs.length,triangles:batches.reduce((n,b)=>n+b.positions.length/9,0)+signs.length*2,colliders:breakables.length}};

 function update(_player:THREE.Vector3){batches.forEach((b,index)=>{const a=meshes[index].geometry.attributes.position as THREE.BufferAttribute,c=meshes[index].geometry.attributes.color as THREE.BufferAttribute;let moved=false,tinted=false;for(const p of b.parts){if(p.shown!==p.proxy.visible){p.shown=p.proxy.visible;moved=true;if(p.shown)(a.array as Float32Array).set(p.original,p.start);else for(let i=p.start;i<p.end;i+=3){a.array[i]=p.proxy.position.x;a.array[i+1]=p.proxy.position.y;a.array[i+2]=p.proxy.position.z;}}if(p.color!==p.proxy.material.color.getHex()){p.color=p.proxy.material.color.getHex();tinted=true;const t=p.proxy.material.color,scale=[t.r/p.base.r,t.g/p.base.g,t.b/p.base.b];for(let i=p.start;i<p.end;i++)c.array[i]=p.colors[i-p.start]*scale[(i-p.start)%3];}}if(moved)a.needsUpdate=true;if(tinted)c.needsUpdate=true;});for(const s of signs)s.mesh.visible=s.owner.visible;shell.visible=batches.some(b=>b.parts.some(p=>p.proxy.visible));}
 // 렌더 버퍼와 복원용 사본을 만든 뒤 조립용 배열을 비운다.
 for(const batch of batches){batch.positions.length=0;batch.colors.length=0;}
 return{shell,breakables,update};
}
