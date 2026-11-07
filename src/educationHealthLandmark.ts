import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { CampusBuilding } from './fullCampus';
import type { BuildingAppearance } from './buildingAppearance';
import type { BreakableSpec } from './scene';
import { addHealthCourtyard } from './healthCourtyard';
import { createEducationNorthPlan, buildEducationNorthApproach } from './educationNorthApproach';
import { buildEducationParkingApproach } from './educationParkingApproach';
type Point={x:number;z:number};
type Surface={positions:number[];colors:number[];geometry?:THREE.BufferGeometry};
type Range={surface:Surface;start:number;end:number;original:Float32Array};
type Part={proxy:THREE.Mesh;shown:boolean;ranges:Range[]};

// 두 동은 같은 지도 축과 상층 데크 높이를 사용한다. 높이와 접속 치수는 모델 근사다.
export function createEducationHealthLandmark(scene:THREE.Scene,building:CampusBuilding,profile:BuildingAppearance,heightAt:(x:number,z:number)=>number){
 const health=building.id==='way/297047243',landmark=health?'public-health-221':'education-220';
 const mapped=building.points.filter((p,i,a)=>i!==a.length-1||p[0]!==a[0][0]||p[1]!==a[0][1]);
 const origin={x:530.39,z:-177.03},ux=.8763074853936069,uz=-.48175220917307,axis=new THREE.Vector3(ux,0,uz),across=new THREE.Vector3(-uz,0,ux),up=new THREE.Vector3(0,1,0);
 const cx=mapped.reduce((s,p)=>s+p[0],0)/mapped.length,cz=mapped.reduce((s,p)=>s+p[1],0)/mapped.length,base=heightAt(cx,cz),sharedDatum=heightAt(559.5275,-168.73875),deck=sharedDatum+21-base,canopyTop=sharedDatum+24.5-base;
 const walkFloor=sharedDatum+17.7-base,walkCanopy=walkFloor+3.5,upperDoorWidth=3.4,upperDoorHeight=2.7;
 const world=(x:number,y:number,z:number)=>new THREE.Vector3(origin.x+ux*x-uz*z,base+y,origin.z+uz*x+ux*z),ground=(x:number,z:number)=>{const p=world(x,0,z);return heightAt(p.x,p.z)-base;};
 const points=mapped.map(p=>({x:(p[0]-origin.x)*ux+(p[1]-origin.z)*uz,z:-(p[0]-origin.x)*uz+(p[1]-origin.z)*ux}));if(points.reduce((s,a,i)=>{const b=points[(i+1)%points.length];return s+a.x*b.z-b.x*a.z;},0)<0)points.reverse();
 const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minZ=Math.min(...points.map(p=>p.z)),maxZ=Math.max(...points.map(p=>p.z));
 const shell=new THREE.Group();shell.name=building.id+':'+landmark;Object.assign(shell.userData,{buildingId:building.id,role:'building-shell',landmark,appearance:profile,localOrigin:{x:origin.x,y:base,z:origin.z},baseSample:{x:cx,z:cz},axis:{x:ux,z:uz},frontFacing:health?{x:-ux,z:-uz}:{x:across.x,z:across.z},mappedOutline:mapped.map(p=>p.slice()),mappedOutlinePreserved:true,sourcePointCount:mapped.length,sharedDatum:{sampleX:559.5275,sampleZ:-168.73875,height:sharedDatum,surveyed:false},sharedDeckWorldY:sharedDatum+21,sharedCanopyWorldY:sharedDatum+24.5,deck,canopyTop,entries:[],canopies:[],numbers:[],heightEstimated:true,levels:health?6:7,levelsEstimated:false});scene.add(shell);
 Object.assign(shell.userData,{sharedRoofWorldY:sharedDatum+21,sharedDeckWorldY:sharedDatum+17.7,sharedConnectionCanopyWorldY:sharedDatum+21.2,upperConnection:{floorWorldY:sharedDatum+17.7,canopyWorldY:sharedDatum+21.2,doors:[],routeLocal:[],routeWorld:[],estimated:true,surveyed:false}});
 const distant=new THREE.Group();distant.visible=false;Object.assign(distant.userData,{buildingId:building.id,role:'distant-building',landmark});scene.add(distant);
  const concrete: Surface = { positions: [], colors: [] }, details: Surface = { positions: [], colors: [] }, glass: Surface = { positions: [], colors: [] }, surfaces = [concrete, details, glass];
  const parts: Part[] = [], breakables: BreakableSpec[] = [], translucentRanges:{start:number;end:number}[] = [], boardRanges:{start:number;end:number}[] = [], cube = new THREE.BoxGeometry(1, 1, 1), cubeVertices = cube.toNonIndexed().getAttribute('position');
  const materials = { stone: new THREE.MeshStandardMaterial({ color: 0xa8a295 }), metal: new THREE.MeshStandardMaterial({ color: 0x49514e }), glass: new THREE.MeshStandardMaterial({ color: 0x49676f }) };
  function tri(s: Surface, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: number) { const tint = new THREE.Color(color); for (const p of [a, b, c]) { s.positions.push(p.x, p.y, p.z); s.colors.push(tint.r, tint.g, tint.b); } }
  function quad(s: Surface, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, color: number) { tri(s, a, b, c, color); tri(s, a, c, d, color); }
  function box(s: Surface, centre: THREE.Vector3, size: THREE.Vector3, color: number, ex = axis, ey = up) {
    const ez = new THREE.Vector3().crossVectors(ex, ey).normalize(), tint = new THREE.Color(color);
    for (let i = 0; i < cubeVertices.count; i++) { const p = centre.clone().addScaledVector(ex, cubeVertices.getX(i) * size.x).addScaledVector(ey, cubeVertices.getY(i) * size.y).addScaledVector(ez, cubeVertices.getZ(i) * size.z); s.positions.push(p.x, p.y, p.z); s.colors.push(tint.r, tint.g, tint.b); }
  }
  function component(kind: keyof typeof materials, name: string, draw: () => void, ex = axis, convex = false, extra: Record<string, unknown> = {}) {
    const starts = surfaces.map(s => s.positions.length); draw();
    const ranges = surfaces.map((surface, i) => ({ surface, start: starts[i], end: surface.positions.length, original: new Float32Array(surface.positions.slice(starts[i])) }));
    if(extra.translucent)translucentRanges.push({start:starts[2],end:glass.positions.length});
    if(extra.deckBoards)boardRanges.push({start:starts[0],end:concrete.positions.length});
    if (ranges.every(r => r.start === r.end)) return;
    const ez = new THREE.Vector3().crossVectors(ex, up).normalize(), axes = [ex, up, ez], lows = [Infinity, Infinity, Infinity], highs = [-Infinity, -Infinity, -Infinity], p = new THREE.Vector3();
    for (const r of ranges) for (let i = 0; i < r.original.length; i += 3) { p.fromArray(r.original, i); axes.forEach((a, j) => { lows[j] = Math.min(lows[j], p.dot(a)); highs[j] = Math.max(highs[j], p.dot(a)); }); }
    const proxy: THREE.Mesh = new THREE.Mesh(cube, materials[kind]); axes.forEach((a, i) => proxy.position.addScaledVector(a, (lows[i] + highs[i]) / 2));
    proxy.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ex, up, ez)); proxy.scale.set(...highs.map((v, i) => Math.max(.025, v - lows[i]) + .008) as [number, number, number]);
    const size = proxy.scale.clone(); let collisionVertices: Float32Array | undefined;
    if (convex) { const inverse = proxy.quaternion.clone().invert(), unique = new Map<string, THREE.Vector3>(); for (const r of ranges) { if (extra.skylight && r.surface !== glass) continue; for (let i = 0; i < r.original.length; i += 3) { const v = new THREE.Vector3().fromArray(r.original, i).sub(proxy.position).applyQuaternion(inverse); unique.set(v.toArray().map(n => n.toFixed(5)).join(','), v); } } proxy.geometry = new ConvexGeometry([...unique.values()]); collisionVertices = Float32Array.from(proxy.geometry.getAttribute('position').array); proxy.scale.setScalar(1); }
    if(extra.closedFacade && ranges[2].original.length && Array.isArray(extra.outward)) {
      const out=new THREE.Vector3().fromArray(extra.outward as number[]);let front=-Infinity,back=Infinity,glassPlane=-Infinity;
      for(const r of ranges)for(let i=0;i<r.original.length;i+=3){const depth=p.fromArray(r.original,i).dot(out);if(r.surface===glass)glassPlane=Math.max(glassPlane,depth);else{front=Math.max(front,depth);back=Math.min(back,depth);}}
      const newFront=(front+glassPlane)/2,newBack=(back+glassPlane)/2;proxy.position.addScaledVector(out,(newFront+newBack)/2-proxy.position.dot(out));proxy.scale.z=size.z=Math.max(.04,newFront-newBack);
      proxy.userData.facadeCollision={method:'balanced-wall-and-glass',front,back,glassPlane,newFront,newBack};
    }
    Object.assign(proxy.userData, { buildingId: building.id, landmark, renderProxy: true, component: name, convex, ...extra }); proxy.updateMatrix(); proxy.updateMatrixWorld(true);
    parts.push({ proxy, shown: true, ranges }); breakables.push({ mesh: proxy, size, collisionVertices, toughness: kind === 'glass' ? 6 : 11, material: kind, label: building.name });
  }
  function wallBox(s: Surface, at: (u: number, y: number, depth?: number) => THREE.Vector3, ex: THREE.Vector3, a: number, b: number, bottom: number, top: number, depth: number, thickness: number, color: number) { if (b - a > .005 && top - bottom > .005) box(s, at((a + b) / 2, (bottom + top) / 2, depth), new THREE.Vector3(b - a, top - bottom, thickness), color, ex); }

  function faceQuad(s:Surface,a:THREE.Vector3,b:THREE.Vector3,c:THREE.Vector3,d:THREE.Vector3,color:number,out:THREE.Vector3){if(b.clone().sub(a).cross(c.clone().sub(a)).dot(out)<0)quad(s,a,d,c,b,color);else quad(s,a,b,c,d,color);}
  function clip(poly:Point[],key:'x'|'z',value:number,greater:boolean){const result:Point[]=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],ia=greater?a[key]>=value:a[key]<=value,ib=greater?b[key]>=value:b[key]<=value;if(ia)result.push(a);if(ia!==ib){const t=(value-a[key])/(b[key]-a[key]);result.push({x:THREE.MathUtils.lerp(a.x,b.x,t),z:THREE.MathUtils.lerp(a.z,b.z,t)});}}return result;}
  function slab(poly:Point[],ys:number[],thickness:number,color:number,name:string,extra:Record<string,unknown>={}){component(extra.translucent?'glass':'stone',name,()=>{const surface=extra.translucent?glass:extra.paving||extra.deckBoards?concrete:details,sideSurface=extra.paving||extra.deckBoards?details:surface,sideColor=extra.paving?0xaaa89d:color,top=poly.map((p,i)=>world(p.x,ys[i],p.z)),bottom=top.map(p=>p.clone().addScaledVector(up,-thickness));for(let i=1;i<poly.length-1;i++){tri(surface,top[0],top[i+1],top[i],color);tri(sideSurface,bottom[0],bottom[i],bottom[i+1],sideColor);}for(let i=0;i<poly.length;i++){const j=(i+1)%poly.length;quad(sideSurface,bottom[i],bottom[j],top[j],top[i],sideColor);}},axis,true,extra);}
  function rectangularSlab(x0:number,x1:number,z0:number,z1:number,y00:number,y10:number,y11:number,y01:number,name:string,color=0xaaa99a,thickness=.20){const extra={deckBoards:['health-upper-terrace-deck','education-upper-bridge-approach','education-upper-deck-turn','upper-connecting-bridge-floor'].includes(name)},p=[{x:x0,z:z0},{x:x1,z:z0},{x:x1,z:z1},{x:x0,z:z1}],ys=[y00,y10,y11,y01];if(Math.max(...ys)-Math.min(...ys)<.0001){slab(p,ys,thickness,color,name,extra);return;}for(const indices of [[0,1,2],[0,2,3]])slab(indices.map(i=>p[i]),indices.map(i=>ys[i]),thickness,color,name,extra);}

  function exposedStrip(surface:Surface,at:(u:number,y:number,d?:number)=>THREE.Vector3,ex:THREE.Vector3,a:number,b:number,y0:number,y1:number,depth:number,thickness:number,color:number,faces:number[]){
    if(b-a<.005||y1-y0<.005)return;const centre=at((a+b)/2,(y0+y1)/2,depth),ez=new THREE.Vector3().crossVectors(ex,up).normalize(),tint=new THREE.Color(color);
    for(let i=0;i<cubeVertices.count;i++){if(!faces.includes(Math.floor(i/6)))continue;const p=centre.clone().addScaledVector(ex,cubeVertices.getX(i)*(b-a)).addScaledVector(up,cubeVertices.getY(i)*(y1-y0)).addScaledVector(ez,cubeVertices.getZ(i)*thickness);surface.positions.push(p.x,p.y,p.z);surface.colors.push(tint.r,tint.g,tint.b);}
  }



 const brick=0xb7926b,gray=0xb6bdb6,white=0xd8dcd2,frame=profile.frameColor,glassColor=profile.glassColor;
 function curtain(a:number,b:number,bottom:number,top:number,at:(u:number,y:number,d?:number)=>THREE.Vector3,tangent:THREE.Vector3,outward:THREE.Vector3,name:string,extra:Record<string,unknown>={}){
  if(b-a<.1||top-bottom<.1)return;component('glass',name,()=>{faceQuad(glass,at(a,bottom,-.04),at(b,bottom,-.04),at(b,top,-.04),at(a,top,-.04),typeof extra.glassColor==='number'?extra.glassColor:glassColor,outward);const strip=(x0:number,x1:number,y0:number,y1:number)=>faceQuad(details,at(x0,y0,.012),at(x1,y0,.012),at(x1,y1,.012),at(x0,y1,.012),frame,outward);const count=Math.max(1,Math.round((b-a)/1.4));for(let i=0;i<=count;i++){const x=a+(b-a)*i/count;strip(Math.max(a,x-.03),Math.min(b,x+.03),bottom,top);}for(let y=bottom;y<top;y+=1.1)strip(a,b,y,Math.min(top,y+.05));},tangent,false,{...extra,outward:outward.toArray(),closedFacade:true});
 }
 function solid(a:number,b:number,bottom:number,top:number,at:(u:number,y:number,d?:number)=>THREE.Vector3,tangent:THREE.Vector3,name:string,color=gray,thickness=.20){if(b-a<.02||top-bottom<.02)return;component('stone',name,()=>wallBox(details,at,tangent,a,b,bottom,top,0,thickness,color),tangent);}
 function beam(a:THREE.Vector3,b:THREE.Vector3,width:number,depth:number,name:string,color=gray){const ex=b.clone().sub(a).normalize(),ey=up.clone().addScaledVector(ex,-up.dot(ex));if(ey.length()<.01)ey.copy(axis);ey.normalize();component('metal',name,()=>box(details,a.clone().add(b).multiplyScalar(.5),new THREE.Vector3(a.distanceTo(b),width,depth),color,ex,ey),axis,true);}
 function column(x:number,z:number,bottom:number,top:number,radius:number,name:string){for(let y=bottom;y<top;y+=4){const h=Math.min(4,top-y),geometry=new THREE.CylinderGeometry(radius,radius,h,10,1),p=geometry.toNonIndexed().getAttribute('position'),center=world(x,y+h/2,z);component('stone',name,()=>{for(let i=0;i<p.count;i+=3)tri(details,new THREE.Vector3().fromBufferAttribute(p,i).add(center),new THREE.Vector3().fromBufferAttribute(p,i+1).add(center),new THREE.Vector3().fromBufferAttribute(p,i+2).add(center),white);},axis,true);}}
 function roofPolygon(poly:Point[],height:number,name:string,openings:{x0:number;x1:number;z0:number;z1:number}[]=[]){const faces=THREE.ShapeUtils.triangulateShape(poly.map(p=>new THREE.Vector2(p.x,p.z)),[]);for(const f of faces){const tri=f.map(i=>poly[i]);for(let x=minX;x<maxX;x+=10)for(let z=minZ;z<maxZ;z+=10){let p=tri;for(const[k,v,g]of[['x',x,true],['x',x+10,false],['z',z,true],['z',z+10,false]]as const)p=clip(p,k,v,g);let pieces=[p];for(const r of openings)pieces=pieces.flatMap(part=>{let inside=part;const outside:Point[][]=[];for(const[k,v,g]of[['x',r.x0,true],['x',r.x1,false],['z',r.z0,true],['z',r.z1,false]]as const){outside.push(clip(inside,k,v,!g));inside=clip(inside,k,v,g);}return outside;});for(const piece of pieces){if(piece.length<3||Math.abs(piece.reduce((s,a,i)=>{const b=piece[(i+1)%piece.length];return s+a.x*b.z-b.x*a.z;},0))<.02)continue;slab(piece,piece.map(()=>height),.22,gray,name);}}}}
 function upperDoor(x:number,z:number,tangent:THREE.Vector3,outward:THREE.Vector3,name:string){
  const center=world(x,walkFloor+upperDoorHeight/2,z),at=(u:number,y:number,d=0)=>world(x,y,z).addScaledVector(tangent,u).addScaledVector(outward,d);
  component('glass',name,()=>{box(glass,center,new THREE.Vector3(upperDoorWidth,upperDoorHeight,.065),glassColor,tangent);for(const u of[-upperDoorWidth/2,0,upperDoorWidth/2])wallBox(details,at,tangent,u-.035,u+.035,walkFloor,walkFloor+upperDoorHeight,.025,.07,frame);},tangent,false,{entrance:true,connectionEntrance:true,outward:outward.toArray()});
  for(const u of[-upperDoorWidth/2,upperDoorWidth/2])solid(u-.08,u+.08,walkFloor,walkFloor+upperDoorHeight,at,tangent,name+'-jamb',white,.15);
  const floor=world(x,walkFloor,z);shell.userData.upperConnection.doors.push({component:name,buildingId:building.id,center:{x:floor.x,y:floor.y,z:floor.z},panelCenter:{x:center.x,y:center.y,z:center.z},floor:{x:floor.x,y:floor.y,z:floor.z},outward:{x:outward.x,y:outward.y,z:outward.z},tangent:tangent.toArray(),width:upperDoorWidth,height:upperDoorHeight,estimated:true});
 }
 function connectionCanopy(x0:number,x1:number,z0:number,z1:number,name:string){for(let z=z0;z<z1;z+=3.8){const end=Math.min(z1,z+3.8);slab([{x:x0,z},{x:x1,z},{x:x1,z:end},{x:x0,z:end}],[walkCanopy,walkCanopy,walkCanopy,walkCanopy],.055,0xc6cec8,name+'-panel',{translucent:true});beam(world(x0,walkCanopy-.08,z),world(x1,walkCanopy-.08,z),.12,.14,name+'-rib',0x9caba5);}for(const x of[x0+.3,x1-.3])for(let z=z0+.8;z<z1;z+=5.8){if(health&&x>10&&z<4.2)continue;column(x,z,walkFloor,walkCanopy-.08,.17,name+'-column');}shell.userData.canopies.push({name,x0,x1,z0,z1,bottom:walkFloor,top:walkCanopy,slatted:false,estimated:true});}
 function overhead(x0:number,x1:number,z0:number,z1:number,bottom:number,top:number,name:string,slatted=false){
  shell.userData.canopies.push({name,x0,x1,z0,z1,bottom,top,slatted,estimated:true});
  if(!slatted)for(let x=x0;x<x1;x+=6)rectangularSlab(x,Math.min(x1,x+6),z0,z1,top,top,top,top,name+'-roof',white,.24);
  else {for(const z of[z0,z1])beam(world(x0,top,z),world(x1,top,z),.24,.25,name+'-edge');for(let x=x0;x<=x1;x+=2)beam(world(x,top,z0),world(x,top,z1),.18,.26,name+'-slat');}
  for(const x of[x0+.6,x1-.6])for(let z=z0+.8;z<z1;z+=5.8)column(x,z,bottom,top,.17,name+'-column');
 }
 function numberLabel(text:string,x:number,z:number,y:number,tangent:THREE.Vector3,out:THREE.Vector3,part:string){const patterns:Record<string,number[]>={'0':[0,1,2,3,4,5],'1':[1,2],'2':[0,1,6,4,3]};const segments=[[-.36,.65,.36,.65],[.36,.65,.36,0],[.36,0,.36,-.65],[-.36,-.65,.36,-.65],[-.36,0,-.36,-.65],[-.36,.65,-.36,0],[-.36,0,.36,0]],center=world(x,y,z);const glyphs:THREE.Vector3[][]=[];for(let k=0;k<text.length;k++)for(const seg of patterns[text[k]]){const[a,b,c,d]=segments[seg],offset=(k-(text.length-1)/2)*1.05,p=center.clone().addScaledVector(tangent,offset+a).addScaledVector(up,b).addScaledVector(out,.115),q=center.clone().addScaledVector(tangent,offset+c).addScaledVector(up,d).addScaledVector(out,.115),ex=q.clone().sub(p).normalize(),ey=out.clone().cross(ex).normalize();box(details,p.clone().add(q).multiplyScalar(.5),new THREE.Vector3(p.distanceTo(q),.13,.06),0x116ab7,ex,ey);glyphs.push([p,q]);}shell.userData.numbers.push({text,center:center.toArray(),tangent:tangent.toArray(),outward:out.toArray(),part,segments:glyphs.map(g=>g.map(p=>p.toArray())),estimated:true});}
 function entrance(x:number,z:number,width:number,floor:number,name:string,frontSteps=true){
  const at=(u:number,y:number,d=0)=>world(x-d,y,z-u),tangent=across.clone().negate(),out=axis.clone().negate();
  component('glass',name+'-door',()=>{box(glass,world(x,floor+1.48,z),new THREE.Vector3(width,2.96,.065),glassColor,tangent);for(const u of[-width/2,0,width/2])wallBox(details,at,tangent,u-.035,u+.035,floor,floor+2.96,.03,.075,frame);},tangent,false,{entrance:true,outward:out.toArray()});
  rectangularSlab(x-.8,x+4,z-width/2-.2,z+width/2+.2,floor,floor,floor,floor,name+'-lobby',gray,.22);
  const start=x-5;let startHeight=Math.max(...[-width/2,width/2,0].map(v=>ground(start,z+v)))+.11,steps=Math.max(1,Math.ceil(Math.abs(floor-startHeight)/.24)),pitch=(x-.8-start)/steps;
  if(frontSteps){const z0=z-width/2-.2,z1=z+width/2+.2;rectangularSlab(start-1.25,start,z0,z1,ground(start-1.25,z0)+.06,startHeight,startHeight,ground(start-1.25,z1)+.06,name+'-terrain-approach',gray,.16);}
  for(let i=0;frontSteps&&i<steps;i++){const a=start+i*pitch,b=start+(i+1)*pitch,y=THREE.MathUtils.lerp(startHeight,floor,(i+1)/steps);rectangularSlab(a,b,z-width/2-.2,z+width/2+.2,y,y,y,y,name+'-approach-step',gray,.34);}
  shell.userData.entries.push({name,x,z,width,floor,height:2.96,startX:start,startHeight,steps:frontSteps?steps:0,pitch,approach:frontSteps?'front-steps':'north-deck-apron',estimated:true});
 }
  function genericBay(at:(u:number,y:number,d?:number)=>THREE.Vector3,tangent:THREE.Vector3,outward:THREE.Vector3,u0:number,u1:number,bottom:number,top:number,level:number,material:number,ribbon:boolean,extra:Record<string,unknown>={}){
    const width=u1-u0,groundMax=Math.max(...Array.from({length:9},(_,i)=>{const p=at(u0+width*i/8,0,-.1);return heightAt(p.x,p.z)-base;})),sill=Math.max(bottom+(material===brick?1.22:ribbon?.24:.85),groundMax+.16),head=top-(material===brick?.48:ribbon?.56:.72),solid=head<sill+.3||width<1.05;
    component('glass',String(extra.component??(ribbon?'brick-ribbon-window':'brick-window-bay')),()=>{
      const wallStrip=(a:number,b:number,y0:number,y1:number,faces=[0,1,4,5])=>exposedStrip(concrete,at,tangent,a,b,y0,y1,-.09,.22,material,faces); const detailStrip=(a:number,b:number,y0:number,y1:number,d:number,t:number,c:number)=>exposedStrip(details,at,tangent,a,b,y0,y1,d,t,c,(b-a)<(y1-y0)?[0,1,5]:[2,3,5]);
      if(solid){wallStrip(u0,u1,bottom,top,[0,1,2,3,4,5]);return;}
      wallStrip(u0,u1,bottom,sill,[2,4,5]);wallStrip(u0,u1,head,top,[3,4,5]);const count=ribbon?2:Math.max(1,Math.round(width/2.7)),pitch=width/count;
      for(let i=0;i<count;i++){const a=u0+pitch*i,b=a+pitch,pad=ribbon?.10:Math.min(.62,pitch*.24),left=a+pad,right=b-pad;wallStrip(a,left,sill,head);wallStrip(right,b,sill,head);faceQuad(glass,at(left,sill,-.10),at(left,head,-.10),at(right,head,-.10),at(right,sill,-.10),[0x4d7778,0x527f7d,0x446e73][(i+level)%3],outward);for(const u of[left,(left+right)/2,right])detailStrip(u-.03,u+.03,sill,head,-.04,.09,frame);detailStrip(left,right,head-.55,head-.5,-.04,.09,frame);}
      detailStrip(u0,u1,top-.14,top,.06,.10,white);
      if(ribbon){detailStrip(u0,u1,top-(material===brick?.10:.52),top,.07,.16,white);detailStrip(u0,u0+.14,sill,head,.05,.15,white);}
    },tangent,false,{...extra,level,closedFacade:!solid,outward:outward.toArray(),estimated:true});
  }

 if(health){
  const floors=[0,4.5,7.8,11.1,14.4,17.7,21],core={z0:21,z1:29},entryZ=44,entryWidth=6;
  let entryFloor=-Infinity;for(let i=0;i<=16;i++)for(let j=0;j<=110;j++)entryFloor=Math.max(entryFloor,ground(-3.3+3.8*i/16,31+27.5*j/110)+.18);
  const northDeckFloor=Math.max(.1,entryFloor),porchTop=entryFloor+3.05;
  Object.assign(shell.userData,{remodel:{yearRange:'2024-2025',northExtentZ:[31,58.5],groundLevelGlass:true,secondLevelLouvers:true,historicOpenPilotisRestored:false},floors,core,roofHeight:deck});
  // 서쪽 정면은 새 하부와 유리 계단실, 남쪽 막힌 벽돌 면을 따로 만든다.
  const west=(v:number,y:number,d=0)=>world(-d,y,-v),westTangent=across.clone().negate(),westOut=axis.clone().negate();
  for(let edge=0;edge<points.length;edge++){
   const a=points[edge],b=points[(edge+1)%points.length],length=Math.hypot(b.x-a.x,b.z-a.z);if(length<.1||(Math.abs(a.x)<.02&&Math.abs(b.x)<.02))continue;const dx=(b.x-a.x)/length,dz=(b.z-a.z)/length,tangent=axis.clone().multiplyScalar(dx).addScaledVector(across,dz),out=axis.clone().multiplyScalar(dz).addScaledVector(across,-dx),at=(u:number,y:number,d=0)=>world(a.x+dx*u,y,a.z+dz*u).addScaledVector(out,d);
   const cuts=new Set(Array.from({length:Math.ceil(length/5.5)+1},(_,k)=>k*length/Math.ceil(length/5.5)));if(Math.abs(a.z)<.02&&Math.abs(b.z)<.02&&Math.abs(dx)>.01){const cut=(14-a.x)/dx;if(cut>0&&cut<length)cuts.add(cut);}const ordered=[...cuts].sort((a,b)=>a-b);
   for(let k=0;k+1<ordered.length;k++){const a0=ordered[k],a1=ordered[k+1],mid=(a0+a1)/2,z=a.z+dz*mid,x=a.x+dx*mid;for(let row=0;row<6;row++){if(row===5&&Math.abs(z)<.02&&x<14)continue;const bottom=row?floors[row]:Math.min(-.5,ground(x,z)-.3),top=floors[row+1];genericBay(at,tangent,out,a0,a1,bottom,top,row,row<2?gray:brick,true,{component:row<2&&z>31?'remodeled-side-window':'health-brick-ribbon',edge});}}
  }
  for(let z=31;z<58.49;z+=4.6){const z1=Math.min(58.49,z+4.6),bottom=Math.max(entryFloor,...[z,(z+z1)/2,z1].map(v=>ground(0,v)+.15));
   for(const[a,b]of[[z,Math.min(z1,36.5)],[Math.max(z,51.5),z1]])if(b>a)curtain(-b,-a,bottom,4.5,west,westTangent,westOut,'remodeled-ground-glass');
   curtain(-z1,-z,4.5,7.8,west,westTangent,westOut,'remodeled-second-glass');
   for(let v=z;v<z1;v+=.38)component('metal','remodeled-vertical-louver',()=>box(details,world(-.27,5.3,v),new THREE.Vector3(.10,1.65,.42),0xc1c8c3,westTangent),westTangent);
   for(let row=2;row<6;row++)genericBay(west,westTangent,westOut,-z1,-z,floors[row],floors[row+1],row,brick,true,{component:'north-upper-brick-ribbon'});
  }
  // 옛 필로티를 다시 열지 않고 현재 접이식 문과 처마의 빈 아래 공간을 구분한다.
  for(const[a,b]of[[36.5,entryZ-entryWidth/2],[entryZ+entryWidth/2,51.5]])curtain(-b,-a,entryFloor,porchTop,(u,y,d=0)=>world(-1.4-d,y,-u),westTangent,westOut,'brown-porch-fixed-glass');
  for(const v of[36.5,41,47,51.5])solid(-.16,.16,entryFloor,porchTop,(u,y,d=0)=>world(-1.4-d,y,v-u),westTangent,'brown-porch-post',0x594837,.45);
  rectangularSlab(-1.7,.15,36.35,51.65,porchTop,porchTop,porchTop,porchTop,'brown-porch-canopy',0x594837,.25);
  rectangularSlab(-1.7,.8,36.35,51.65,entryFloor,entryFloor,entryFloor,entryFloor,'brown-porch-floor',gray,.20);
  entrance(-1.4,entryZ,entryWidth,entryFloor,'remodeled-west-entrance',false);
  curtain(-51.5,-36.5,porchTop,4.5,west,westTangent,westOut,'remodeled-porch-clerestory');
  shell.userData.courtyard=addHealthCourtyard(slab,ground,entryFloor,northDeckFloor);
  // 북서쪽 지도 보행로와 앞마당을 잇는 계단은 원시 지형을 유지하기 위한 게임용 근사다.
  const accessA={x:-4.56718612199,z:66},accessB={x:-2,z:58},accessLength=Math.hypot(accessB.x-accessA.x,accessB.z-accessA.z),direction={x:(accessB.x-accessA.x)/accessLength,z:(accessB.z-accessA.z)/accessLength},side={x:-direction.z,z:direction.x},accessWidth=2,transition=1.4;
  const accessPoint=(distance:number,lateral:number)=>({x:accessA.x+direction.x*distance+side.x*lateral,z:accessA.z+direction.z*distance+side.z*lateral});
  const groundAcross=(d:number)=>Math.max(...Array.from({length:11},(_,i)=>{const p=accessPoint(d,-1+i/5);return ground(p.x,p.z);}));
  const startHeight=groundAcross(0)+.10,stepCount=Math.max(1,Math.ceil((entryFloor-startHeight)/.26)),stepLength=accessLength/stepCount,stepHeights:number[]=[];
  for(let i=0;i<stepCount;i++){let y=startHeight+(entryFloor-startHeight)*(i+1)/stepCount;for(let j=0;j<=4;j++)y=Math.max(y,groundAcross((i+j/4)*stepLength)+.1);stepHeights.push(Math.min(entryFloor,y));}
  for(let i=stepCount-2;i>=0;i--)stepHeights[i]=Math.max(stepHeights[i],stepHeights[i+1]-.28);
  const firstPlate=Math.max(startHeight,stepHeights[0]-.26);
  for(let i=0;i<4;i++){const d0=-transition+transition*i/4,d1=-transition+transition*(i+1)/4,poly=[accessPoint(d0,-1),accessPoint(d1,-1),accessPoint(d1,1),accessPoint(d0,1)],ys=poly.map((p,k)=>{const d=k===0||k===3?d0:d1,t=(d+transition)/transition;return THREE.MathUtils.lerp(ground(p.x,p.z)+.045,firstPlate,t);});for(const ids of[[0,1,2],[0,2,3]])slab(ids.map(k=>poly[k]),ids.map(k=>ys[k]),.15,gray,'remodeled-northwest-terrain-connection');}
  for(let i=0;i<stepCount;i++){const poly=[accessPoint(i*stepLength,-1),accessPoint((i+1)*stepLength,-1),accessPoint((i+1)*stepLength,1),accessPoint(i*stepLength,1)];slab(poly,poly.map(()=>stepHeights[i]),.31,gray,'remodeled-northwest-access-step');}
  shell.userData.remodelAccess={apron:{x0:-3.3,x1:.5,z0:31,z1:58.5},northDeck:{x0:1,x1:20.6,z0:58.5,z1:65.5,floor:northDeckFloor},floor:entryFloor,sourceWay:'way/455018302/204',path:[accessPoint(-transition,0),accessA,accessB,{x:-2.5,z:54},{x:-2.5,z:44},{x:2,z:44}],direction,width:accessWidth,transition,stepCount,stepLength,stepHeights,firstPlate,startGround:ground(accessA.x,accessA.z),gameTerrainAdjustment:true,estimated:true};
  for(let z=0;z<21;z+=5.25)for(let row=0;row<6;row++){const z1=z+5.25,bottom=row?floors[row]:Math.min(-1,ground(0,(z+z1)/2)-.3),top=floors[row+1];if(row===5&&z1<=19)continue;if(z>=15)genericBay(west,westTangent,westOut,-z1,-(row===5?Math.max(z,19):z),bottom,top,row,gray,true,{component:'south-core-side-glass'});else component('stone','health-number-wall',()=>{wallBox(concrete,west,westTangent,-z1,-z,bottom,top,0,.24,brick);wallBox(details,west,westTangent,-z1,-z,top-.12,top,.03,.07,white);if(z===5.25&&row===4)numberLabel('221',0,7.875,(bottom+top)/2,westTangent,westOut,'health-number-wall');},westTangent);}
  const coreFloor=Math.max(...[0,2,4].flatMap(x=>[23,25,27].map(z=>ground(x,z)+.14)));
  for(let row=0;row<6;row++){const bottom=row?floors[row]:coreFloor,top=floors[row+1];for(const[a,b]of[[21,23.1],[26.9,29]])curtain(-b,-a,bottom,top,west,westTangent,westOut,'stair-core-glass');if(row)curtain(-26.9,-23.1,bottom,top,west,westTangent,westOut,'stair-core-glass');else curtain(-26.9,-23.1,coreFloor+2.96,top,west,westTangent,westOut,'stair-core-door-header');}
  entrance(0,25,3.8,coreFloor,'existing-core-entrance');
  for(const z of[20.7,29.3])solid(-.28,.28,-.1,canopyTop,(u,y,d=0)=>world(-d,y,z-u),westTangent,'stair-core-pale-frame',white,.28);
  for(let row=1;row<6;row++){const y=floors[row];rectangularSlab(.3,4.3,21.4,28.6,y,y,y,y,'visible-core-landing',gray,.16);beam(world(.8,y-2.9,21.5),world(.8,y,28.5),.18,1.1,'visible-core-stair-flight',gray);}
  roofPolygon(points,deck-.035,'health-mapped-roof',[{x0:-1,x1:12,z0:-1,z1:19},{x0:12,x1:14,z0:-1,z1:4}]);
  // 6층 바닥의 외부 통로와 안쪽 유리 입면을 구분한다. 문 위치와 폭은 도면 관계를 맞춘 근사다.
  for(let z=0;z<19;z+=4)for(let x=0;x<12;x+=4)rectangularSlab(x,x+4,z,Math.min(19,z+4),walkFloor,walkFloor,walkFloor,walkFloor,'health-upper-terrace-deck',0x936d53,.16);
  rectangularSlab(12,14,0,4,walkFloor,walkFloor,walkFloor,walkFloor,'health-upper-terrace-deck',0x936d53,.16);
  rectangularSlab(12,20,13,19,walkFloor,walkFloor,walkFloor,walkFloor,'health-upper-connection-interior-floor',gray,.20);
  const upperWest=(v:number,y:number,d=0)=>world(12-d,y,-v);
  for(const[a,b]of[[4,8],[8,12],[12,14.3],[17.7,19]]){curtain(-b,-a,walkFloor+.25,walkFloor+1.65,upperWest,westTangent,westOut,'health-upper-connection-window');solid(-b,-a,walkFloor,walkFloor+.25,upperWest,westTangent,'health-upper-connection-sill',white);solid(-b,-a,walkFloor+1.65,deck,upperWest,westTangent,'health-upper-connection-panel',white);}
  solid(-17.7,-14.3,walkFloor+upperDoorHeight,deck,upperWest,westTangent,'health-upper-connection-header',white);
  upperDoor(12,16,westTangent,westOut,'health-upper-connection-door');
  solid(0,12,walkFloor,deck,(u,y,d=0)=>world(u,y,19+d),axis,'health-upper-terrace-end-wall',white);
  solid(0,4,walkFloor,deck,(u,y,d=0)=>world(14-d,y,u),across,'health-upper-transition-side',white);
  solid(12,14,walkFloor,deck,(u,y,d=0)=>world(u,y,4-d),axis,'health-upper-transition-return',white);
  for(let z=0;z<19;z+=3.8){const end=Math.min(19,z+3.8);for(const y of[walkFloor+.45,walkFloor+.85,walkFloor+1.15])beam(world(.16,y,z),world(.16,y,end),.055,.055,'health-upper-terrace-rail',0xaebbb7);column(.16,z,walkFloor,walkFloor+1.2,.055,'health-upper-terrace-post');}
  for(const[x0,x1]of[[.16,10],[14,14.1]])if(x1-x0>.2)for(const y of[walkFloor+.45,walkFloor+.85,walkFloor+1.15])beam(world(x0,y,.16),world(x1,y,.16),.055,.055,'health-upper-terrace-end-rail',0xaebbb7);
  shell.userData.upperTerrace={x0:0,x1:12,z0:0,z1:19,transition:{x0:12,x1:14,z0:0,z1:4},floor:walkFloor,worldFloor:sharedDatum+17.7,estimated:true};
  for(let row=0;row<6;row++)genericBay(west,westTangent,westOut,-31,-29,row?floors[row]:Math.min(-.4,ground(0,30)-.3),floors[row+1],row,row<2?gray:brick,true,{component:'west-core-remodel-transition'});
  connectionCanopy(0,12,0,19,'south-roof-canopy');connectionCanopy(12,14,0,4,'south-connection-canopy');overhead(1,5,31,58,deck,canopyTop,'north-roof-pergola',true);
 }


 if(!health){
  const northPlan=createEducationNorthPlan(heightAt);
  const under={x0:-49,x1:-18,z0:-48.3,z1:-24.5,ceiling:deck-10.5,estimated:true},wingFloors=[0,(deck-10.5)/3,2*(deck-10.5)/3,deck-10.5,deck-7,deck-3.5,deck];
  // 원본 entrance 노드 p7과 /337 끝점을 현관 중심으로 쓴다. 문 치수와 보행면 높이는 사진과 게임 지형을 맞춘 근사다.
  const entryOrigin=new THREE.Vector3(464.33,0,-272.09),entryTangent=new THREE.Vector3(17.23,0,33.54).normalize(),entryOut=new THREE.Vector3(-entryTangent.z,0,entryTangent.x);
  const entryPoint=(s:number,n:number,y=0)=>entryOrigin.clone().addScaledVector(entryTangent,s).addScaledVector(entryOut,n).setY(base+y);
  const entryGround=(s:number,n:number)=>{const p=entryPoint(s,n);return heightAt(p.x,p.z)-base;};
  const entryLocal=(p:THREE.Vector3):Point=>({x:(p.x-origin.x)*ux+(p.z-origin.z)*uz,z:-(p.x-origin.x)*uz+(p.z-origin.z)*ux});
  let entryFloor=entryGround(0,0)+.74;
  for(let s=-1.6;s<=1.61;s+=.2)for(let n=-3;n<=.01;n+=.2)entryFloor=Math.max(entryFloor,entryGround(s,n)+.16);
  const entryWidth=2.8,entryHeight=2.7,entryCoreWidth=3.4;
  const northFloor=(s:number)=>Math.max(entryFloor,entryGround(s,.35)+.18);
  Object.assign(shell.userData,{underpass:under,northwestWingPhotoMatch:{sourceEdges:[0,22,21],front:'local +v',status:'inferred-from-official-photos-and-map'},roofHeight:deck,wingFloors});
  for(let edge=0;edge<points.length;edge++){
   const a=points[edge],b=points[(edge+1)%points.length],length=Math.hypot(b.x-a.x,b.z-a.z);if(length<.1)continue;const dx=(b.x-a.x)/length,dz=(b.z-a.z)/length,tangent=axis.clone().multiplyScalar(dx).addScaledVector(across,dz),out=axis.clone().multiplyScalar(dz).addScaledVector(across,-dx),at=(u:number,y:number,d=0)=>world(a.x+dx*u,y,a.z+dz*u).addScaledVector(out,d),cuts=new Set([0,length]);for(let k=1;k<Math.ceil(length/5.5);k++)cuts.add(k*length/Math.ceil(length/5.5));if(Math.abs(dx)>.01)for(const x of[under.x0,under.x1,-14]){const u=(x-a.x)/dx;if(u>0&&u<length)cuts.add(u);}
   const northDoors=northPlan.doors.filter(d=>{const start=at(0,0).setY(0),end=at(length,0).setY(0),v=end.clone().sub(start),t=THREE.MathUtils.clamp(d.origin.clone().sub(start).dot(v)/v.lengthSq(),0,1);return start.addScaledVector(v,t).distanceTo(d.origin)<.03&&out.dot(d.outward)>.99;});
   for(const d of northDoors){const start=at(0,0).sub(d.origin).dot(d.tangent),slope=tangent.dot(d.tangent);for(const side of[-1,1]){const cut=(side*(d.width/2+.13)-start)/slope;if(cut>0&&cut<length)cuts.add(cut);}}
   const connectionEdge=Math.min(a.x,b.x)>9&&Math.min(a.z,b.z)>-4.1&&Math.max(a.z,b.z)<-3.3,doorAt=connectionEdge?(12-a.x)/dx:0;
   const southwestFace=out.dot(entryOut)>.999&&Math.abs(at(0,0).sub(entryOrigin).dot(entryOut))<.02,entryS0=at(0,0).sub(entryOrigin).dot(entryTangent),entryStep=tangent.dot(entryTangent),southEndFace=Math.min(at(0,0).setY(0).distanceTo(new THREE.Vector3(461.01,0,-278.56)),at(length,0).setY(0).distanceTo(new THREE.Vector3(461.01,0,-278.56)))<.04&&!southwestFace,southCornerU=at(0,0).setY(0).distanceTo(new THREE.Vector3(461.01,0,-278.56))<.04?0:length;
   if(southwestFace)for(const s of[-1.7,-1.4,1.4,1.7,10.4,25]){const u=(s-entryS0)/entryStep;if(u>0&&u<length)cuts.add(u);}
   if(southEndFace)cuts.add(southCornerU===0?5.5:length-5.5);
   if(connectionEdge){cuts.add(doorAt-upperDoorWidth/2);cuts.add(doorAt+upperDoorWidth/2);upperDoor(12,a.z+dz*doorAt,tangent,out,'education-upper-connection-door');}
   const ordered=[...cuts].sort((a,b)=>a-b);
   for(let k=0;k+1<ordered.length;k++){const u0=ordered[k],u1=ordered[k+1],mid=(u0+u1)/2,x=a.x+dx*mid,z=a.z+dz*mid,northwest=z>-50&&x<9.2,open=northwest&&x>under.x0+.01&&x<under.x1-.01,whiteEnd=northwest&&x<under.x0+.02,frontFace=northwest&&out.dot(across)>.8,levels=northwest?wingFloors:Array.from({length:8},(_,i)=>deck*i/7),g=Math.max(...[u0,mid,u1].map(u=>ground(a.x+dx*u,a.z+dz*u)));
    if(!northwest)levels[6]=walkFloor;
    for(let row=0;row+1<levels.length;row++){let bottom=levels[row],top=levels[row+1];if(!row)bottom=Math.min(-.3,g-.4);if(open&&top<=under.ceiling+.01)continue;
     const northDoor=northDoors.find(d=>Math.abs(at(mid,0).sub(d.origin).dot(d.tangent))<d.width/2+.129);
     if(northDoor&&bottom<northDoor.floor-base+northDoor.height+.10&&top>northDoor.floor-base-.05){const floor=northDoor.floor-base,head=floor+northDoor.height+.10;solid(u0,u1,bottom,Math.min(top,floor-.025),at,tangent,'education-north-entry-foundation',white,.25);if(top>head){if(whiteEnd)solid(u0,u1,head,top,at,tangent,'education-north-entry-header',white,.28);else curtain(u0,u1,head,top,at,tangent,out,'education-north-entry-header-glass');}continue;}
     const entryS=entryS0+mid*entryStep;
     if(southwestFace&&Math.abs(entryS)<entryCoreWidth/2-.0001){
      if(!row){solid(u0,u1,bottom,entryFloor-.025,at,tangent,'education-southwest-entry-foundation',gray,.24);if(Math.abs(entryS)>entryWidth/2)solid(u0,u1,entryFloor,entryFloor+entryHeight,at,tangent,'education-southwest-entry-jamb',brick,.28);}
      curtain(u0,u1,row?bottom:entryFloor+entryHeight,top,at,tangent,out,'education-southwest-vertical-glass',{sourceEdges:[6,7],row,glassColor:0x4d7778});continue;
     }
     if(southwestFace&&entryS<-1.7){component('stone','education-southwest-blind-brick',()=>{wallBox(concrete,at,tangent,u0,u1,bottom,top,-.09,.22,brick);wallBox(details,at,tangent,u0,u1,top-.11,top+.02,.015,.24,white);
      if(row<3)for(let j=0,u=u0+.18;u<u1;u+=.43,j++){const low=Math.max(bottom+.16,g+.2),height=Math.max(0,top-.25-low)*(.67+.23*Math.sin(j*1.17+row*.7));for(let layer=0,y=low+.2;y<low+height;y+=.52,layer++){const radius=.37+.07*Math.sin(j+layer*1.6),depth=.037+(j*8+layer)*.0005,ring=Array.from({length:8},(_,k)=>{const angle=k*Math.PI/4,r=radius*(.84+.16*Math.sin(k*2.3+j));return at(THREE.MathUtils.clamp(u+Math.cos(angle)*r,u0+.015,u1-.015),THREE.MathUtils.clamp(y+Math.sin(angle)*r*1.43,low,top-.16),depth);}),centre=at(u,y,depth);for(let k=0;k<ring.length;k++)tri(details,centre,ring[k],ring[(k+1)%ring.length],(j+layer)%3?0x506743:0x65794d);}}
     },tangent,false,{sourceEdges:[7],row,ivyShapeEstimated:true});continue;}
     if(southEndFace&&Math.abs(mid-southCornerU)<5.5){const centre=southCornerU===0?2.25:length-2.25,sill=Math.max(bottom+.85,g+.18),head=top-.45,w0=centre-.42,w1=centre+.42;component('glass','education-south-corner-vertical-window',()=>{wallBox(concrete,at,tangent,u0,Math.min(u1,w0),bottom,top,-.09,.22,brick);wallBox(concrete,at,tangent,Math.max(u0,w1),u1,bottom,top,-.09,.22,brick);const a0=Math.max(u0,w0),a1=Math.min(u1,w1);if(a1>a0){wallBox(concrete,at,tangent,a0,a1,bottom,sill,-.09,.22,brick);wallBox(concrete,at,tangent,a0,a1,head,top,-.09,.22,brick);if(head>sill){faceQuad(glass,at(a0,sill,-.05),at(a1,sill,-.05),at(a1,head,-.05),at(a0,head,-.05),0x4d7778,out);for(const x of[a0,a1])wallBox(details,at,tangent,x-.025,x+.025,sill,head,.01,.06,frame);}}wallBox(details,at,tangent,u0,u1,top-.11,top+.02,.015,.24,white);},tangent,false,{closedFacade:true,outward:out.toArray(),sourceEdges:[8],row,observedAreaWidthEstimated:5.5});continue;}
     if(connectionEdge&&row===6&&mid>doorAt-upperDoorWidth/2-.001&&mid<doorAt+upperDoorWidth/2+.001){solid(u0,u1,walkFloor+upperDoorHeight,top,at,tangent,'education-upper-connection-header',white,.22);continue;}
     if(whiteEnd){component('stone','education-pale-number-wall',()=>{wallBox(details,at,tangent,u0,u1,bottom,top,0,.28,white);for(let y=Math.ceil(bottom/.9)*.9;y<top;y+=.9)faceQuad(details,at(u0,y,.145),at(u1,y,.145),at(u1,y+.012,.145),at(u0,y+.012,.145),0xadb7b3,out);if(frontFace&&x<-51&&row===levels.length-2){const labelX=-52.2,labelU=(labelX-a.x)/dx;if(labelU>=u0&&labelU<u1)numberLabel('220',labelX,a.z+dz*labelU,(bottom+top)/2,tangent,out,'education-pale-number-wall');}},tangent);}
     else if(northwest){curtain(u0,u1,Math.max(bottom,g+.16),top,at,tangent,out,'education-glass-connecting-body',{edge,row,upperBody:bottom>=under.ceiling-.01});solid(u0,u1,top-.13,top+.02,at,tangent,'education-glass-horizontal-band',white,.22);}
     else {const observedLower=southwestFace&&entryS>1.7&&entryS<10.4&&row<2,walkSide=southwestFace&&entryS>1.7&&entryS<25;
      if(!row&&walkSide){const floor=northFloor(entryS);solid(u0,u1,bottom,floor+.32,at,tangent,'education-southwest-walk-sill',observedLower?gray:brick,.24);bottom=Math.max(bottom,floor+.32);}
      genericBay(at,tangent,out,u0,u1,bottom,top,row,observedLower?gray:brick,true,{component:observedLower?'education-southwest-lower-panel-window':'education-brick-wing-window',edge});}
    }
   }
  }
  function southwestEntry(){
   const doorName='education-southwest-entry-door',doorAt=(s:number,y:number,n=0)=>entryPoint(s,n-.12,y);
   component('glass',doorName,()=>{box(glass,entryPoint(0,-.12,entryFloor+entryHeight/2),new THREE.Vector3(entryWidth,entryHeight,.065),0x4d7778,entryTangent);for(const s of[-entryWidth/2,0,entryWidth/2])wallBox(details,doorAt,entryTangent,s-.035,s+.035,entryFloor,entryFloor+entryHeight,.025,.075,frame);for(const s of[-.16,.16])wallBox(details,doorAt,entryTangent,s-.025,s+.025,entryFloor+.9,entryFloor+1.45,.09,.04,0xbfc7c1);},entryTangent,false,{entrance:true,groundEntrance:true,outward:entryOut.toArray()});
   const floorTriangles:number[][]=[];
   const rect=(s0:number,s1:number,n0:number,n1:number)=>[{s:s0,n:n0},{s:s1,n:n0},{s:s1,n:n1},{s:s0,n:n1}];
   const junction={s:.3229044251,n:4.4267293493},junctionY=entryGround(junction.s,junction.n)+.16;
   const southStart={s:-6.0,n:4.35},southEnd={s:-1.5,n:1.6},southLength=Math.hypot(southEnd.s-southStart.s,southEnd.n-southStart.n),ds=(southEnd.s-southStart.s)/southLength,dn=(southEnd.n-southStart.n)/southLength;
   // 갈라지는 두 길과 문 앞을 하나의 면으로 나눈다. 각 삼각형은 지면까지 채워 틈과 겹친 판을 만들지 않는다.
   const footprint:Point[]=[{x:-1.7,z:-3},{x:1.7,z:-3},{x:1.7,z:.35},{x:27,z:.35},{x:27,z:3.15},{x:3.5,z:3.15},{x:junction.s+1.25,z:junction.n},{x:junction.s-1.25,z:junction.n},{x:-5.32,z:5.46},{x:-6.68,z:3.24},{x:-2.18,z:.49},{x:-1.7,z:.35}];
   const pavementY=(s:number,n:number)=>{const raw=entryGround(s,n)+.16,approach=THREE.MathUtils.lerp(raw,entryFloor,THREE.MathUtils.smoothstep(s,-5.3,-1.7)),main=s>=2?northFloor(s):Math.max(raw,approach),junctionBlend=(1-THREE.MathUtils.smoothstep(Math.abs(s-junction.s),1.25,3.5))*THREE.MathUtils.smoothstep(n,1.1,junction.n),endBlend=THREE.MathUtils.smoothstep(s,25,27);return s<=1.7&&s>=-1.7&&n<=.75?entryFloor:Math.max(raw,THREE.MathUtils.lerp(THREE.MathUtils.lerp(main,raw,junctionBlend),raw,endBlend));};
   const surfaceName=(s:number,n:number)=>n<.35?'education-southwest-lobby-floor':s<-1.5?'education-southwest-south-paving':s>2?'education-southwest-north-walk':n>1.6?'education-southwest-junction-ramp':'education-southwest-door-landing';
   const faces=THREE.ShapeUtils.triangulateShape(footprint.map(p=>new THREE.Vector2(p.x,p.z)),[]),sCuts=[-7,-6,-5.3,-4,-3,-2.18,-1.7,-1.5,-.9270955749,0,.3229044251,1.4,1.5729044251,1.7,2,3.5,5,6.5,8,9.5,11,12.5,14,15.5,17,18.5,20,21.5,23,24,25,26,27],nCuts=[-3,-2,-1,0,.35,.75,1.1,1.6,2.3,3.15,3.8,junction.n,5,5.46];
   for(const f of faces)for(let i=0;i+1<sCuts.length;i++)for(let j=0;j+1<nCuts.length;j++){
    let polygon=f.map(k=>footprint[k]);for(const[key,value,greater]of[['x',sCuts[i],true],['x',sCuts[i+1],false],['z',nCuts[j],true],['z',nCuts[j+1],false]]as const)polygon=clip(polygon,key,value,greater);
    for(let k=1;k+1<polygon.length;k++){const p=[polygon[0],polygon[k],polygon[k+1]];if(Math.abs((p[1].x-p[0].x)*(p[2].z-p[0].z)-(p[1].z-p[0].z)*(p[2].x-p[0].x))<1e-6)continue;const top=p.map(q=>entryPoint(q.x,q.z,pavementY(q.x,q.z))),bottom=p.map(q=>entryPoint(q.x,q.z,entryGround(q.x,q.z)-.12)),s=p.reduce((sum,q)=>sum+q.x,0)/3,n=p.reduce((sum,q)=>sum+q.z,0)/3,name=surfaceName(s,n);component('stone',name,()=>{tri(concrete,top[0],top[2],top[1],n<.35?gray:0xb58b68);tri(details,bottom[0],bottom[1],bottom[2],gray);for(let e=0;e<3;e++)quad(details,bottom[e],bottom[(e+1)%3],top[(e+1)%3],top[e],gray);},entryTangent,true,{paving:true,groundEntrance:true,terrainFilled:true});floorTriangles.push(top.flatMap(q=>q.toArray()));}
   }
   // 높은 길 끝의 2m는 실사에서 끝을 확인한 구간이 아니라 기존 지면에 잇는 게임용 접속이다.
   for(let s=3.5;s<25;s+=1.5){const end=Math.min(25,s+1.5),y0=pavementY(s,3.15),y1=pavementY(end,3.15);
    for(const h of[.16,.92,1.05])beam(entryPoint(s,3.15,y0+h),entryPoint(end,3.15,y1+h),.035,.035,'education-southwest-walk-rail',0x7f8c7e);
    for(let u=s+.18;u<end;u+=.22)beam(entryPoint(u,3.15,THREE.MathUtils.lerp(y0,y1,(u-s)/(end-s))+.16),entryPoint(u,3.15,THREE.MathUtils.lerp(y0,y1,(u-s)/(end-s))+.93),.022,.022,'education-southwest-walk-baluster',0x7f8c7e);
   }
   const canopy=rect(-2,2,-.22,1.65);slab(canopy.map(p=>entryLocal(entryPoint(p.s,p.n))),Array(4).fill(entryFloor+3.05),.18,white,'education-southwest-entry-canopy');
   for(const s of[-1.9,1.9])beam(entryPoint(s,.08,entryFloor+2.8),entryPoint(s,1.55,entryFloor+2.87),.09,.09,'education-southwest-canopy-edge',0xaab3aa);
   // 낮은 벽돌 화단은 문 남쪽에만 둔다. 표지의 읽히지 않는 글자는 재현하지 않는다.
   for(let s=-6;s<-2.1;s+=1.3){const end=Math.min(-2.1,s+1.3),middle=(s+end)/2,y=Math.max(entryFloor-.22,entryGround(middle,.5)+.18);component('stone','education-southwest-brick-planter',()=>{const corners=rect(s,end,.17,.87),top=corners.map(p=>entryPoint(p.s,p.n,y+.76)),bottom=corners.map(p=>entryPoint(p.s,p.n,entryGround(p.s,p.n)-.12));quad(concrete,top[0],top[3],top[2],top[1],brick);quad(concrete,bottom[0],bottom[1],bottom[2],bottom[3],brick);for(let i=0;i<4;i++)quad(concrete,bottom[i],bottom[(i+1)%4],top[(i+1)%4],top[i],brick);box(details,entryPoint(middle,.52,y+.77),new THREE.Vector3(end-s,.07,.74),0xad8d71,entryTangent);box(details,entryPoint(middle,.52,y+.78),new THREE.Vector3(end-s-.1,.05,.55),0x586c47,entryTangent);},entryTangent,true,{groundEntrance:true,plantingSpeciesEstimated:true,terrainFilled:true});
    const foliage=new THREE.IcosahedronGeometry(1,1).getAttribute('position');for(const offset of[-.35,.27])component('stone','education-southwest-planter-shrub',()=>{const c=entryPoint(middle+offset,.52,y+1.03);for(let i=0;i<foliage.count;i+=3){const leaf=[0,1,2].map(k=>{const p=new THREE.Vector3().fromBufferAttribute(foliage,i+k);return c.clone().addScaledVector(entryTangent,p.x*.48).addScaledVector(entryOut,p.z*.27).addScaledVector(up,p.y*.34);});tri(details,leaf[0],leaf[1],leaf[2],offset<0?0x566b42:0x65784b);}},entryTangent,true,{groundEntrance:true,plantingSpeciesEstimated:true});
   }
   for(const s of[-1.7,1.7])component('metal','education-southwest-unreadable-blue-plaque',()=>box(details,entryPoint(s,.17,entryFloor+1.55),new THREE.Vector3(.30,.48,.035),0x2476a0,entryTangent),entryTangent,false,{textObserved:false});
   const bollards=[-.98,.98].map(lateral=>({s:southStart.s-dn*lateral,n:southStart.n+ds*lateral,width:.12,height:.82}));
   for(const b of bollards)component('metal','education-southwest-bollard',()=>box(details,entryPoint(b.s,b.n,entryGround(b.s,b.n)+.16+b.height/2),new THREE.Vector3(b.width,b.height,b.width),0x3d4742,entryTangent),entryTangent,false,{groundEntrance:true});
   const surfaceY=(s:number,n:number)=>{const p=entryPoint(s,n);let highest=heightAt(p.x,p.z);for(const t of floorTriangles){const d=(t[3]-t[0])*(t[8]-t[2])-(t[5]-t[2])*(t[6]-t[0]);if(Math.abs(d)<1e-9)continue;const u=((p.x-t[0])*(t[8]-t[2])-(p.z-t[2])*(t[6]-t[0]))/d,v=((t[3]-t[0])*(p.z-t[2])-(t[5]-t[2])*(p.x-t[0]))/d;if(u>=-1e-6&&v>=-1e-6&&u+v<=1.000001)highest=Math.max(highest,t[1]+u*(t[4]-t[1])+v*(t[7]-t[1]));}return highest;};
   const routePoint=(s:number,n:number)=>{const p=entryPoint(s,n);return{x:p.x,y:surfaceY(s,n),z:p.z};};
   const doorFloor=entryPoint(0,-.12,entryFloor),groundEntry={door:{component:doorName,buildingId:building.id,center:{x:doorFloor.x,y:doorFloor.y,z:doorFloor.z},outward:{x:entryOut.x,y:0,z:entryOut.z},tangent:entryTangent.toArray(),width:entryWidth,height:entryHeight},floorWorldY:base+entryFloor,origin:entryOrigin.toArray(),tangent:entryTangent.toArray(),outward:entryOut.toArray(),sourceNode:'4531515085',sourceWays:['way/455020727/210','way/456922931/337','way/455018305/207'],sourceFrontEdges:[6,7],coreWidth:entryCoreWidth,canopy:{width:4,depth:1.65,topWorldY:base+entryFloor+3.05},lobbyBounds:{s:[-1.7,1.7],n:[-3,.75]},routeWorld:[routePoint(junction.s,junction.n),routePoint(0,1.6),routePoint(0,-.6),routePoint(0,-2.6)],southRouteWorld:[routePoint(-8,4.32),routePoint(southStart.s,southStart.n),routePoint(southEnd.s,southEnd.n),routePoint(0,.75),routePoint(0,-2.6)],northWalkRouteWorld:[routePoint(2.2,1.6),routePoint(10,1.6),routePoint(20,1.6),routePoint(24,1.6)],northWalk:{s:[2,25],n:[.35,3.15],farEndUnconfirmed:true},bollards:bollards.map(b=>({...b,center:routePoint(b.s,b.n)})),surfaceComponents:['education-southwest-lobby-floor','education-southwest-door-landing','education-southwest-junction-ramp','education-southwest-south-paving','education-southwest-north-walk'],coordinatesEstimated:true,dimensionsEstimated:true,sourceEntranceTag:true,shortLobbyOnly:true,fullInteriorReproduced:false,terrainModified:false};
   Object.assign(groundEntry.northWalk,{transitionStartS:25,transitionEndS:27,endConnection:'terrain-following-game-approximation'});
   Object.assign(groundEntry,{pavingOutline:footprint.map(p=>({s:p.x,n:p.z})),pavingTriangleCount:floorTriangles.length,pavingMethod:'continuous-shared-height-triangulation-with-terrain-filled-sides',observedFacade:{blindBrickSourceEdge:7,ivyApproximate:true,southVerticalWindowSourceEdge:8,southVerticalWindowWidthEstimated:5.5,lowerGrayPanelRange:[1.7,10.4],blueGlassColor:0x4d7778},northEndWorld:routePoint(27,1.6)});
   shell.userData.groundEntry=groundEntry;
  }
  southwestEntry();
  const northApproach=buildEducationNorthApproach(northPlan,heightAt);
  for(const p of northApproach.parts)component(p.material,p.component,()=>{for(const t of p.triangles)tri(t.surface==='stone'?concrete:t.surface==='glass'?glass:details,...t.vertices,t.color);},axis,true,p.extra);
  shell.userData.northAccess=northApproach.metadata;
  const parkingApproach=buildEducationParkingApproach(heightAt);
  for(const p of parkingApproach.parts)component(p.material,p.component,()=>{for(const t of p.triangles)tri(t.surface==='stone'?concrete:t.surface==='glass'?glass:details,...t.vertices,t.color);},axis,true,p.extra);
  for(const t of parkingApproach.decorations)tri(details,...t.vertices,t.color);
  shell.userData.parkingAccess=parkingApproach.metadata;
  const northwest=clip(clip(points,'z',-50,true),'x',-14,false);roofPolygon(northwest,under.ceiling,'underpass-upper-floor');
  for(const x of[-43,-32,-21])for(const z of[-46.8,-25.8])column(x,z,ground(x,z)-.2,under.ceiling,.48,'underpass-round-support');
  roofPolygon(points,deck-.035,'education-mapped-roof');for(let z=-8;z<-3.8;z+=2.1)rectangularSlab(10,14,z,Math.min(-3.8,z+2.1),walkFloor,walkFloor,walkFloor,walkFloor,'education-upper-bridge-approach',0x936d53,.16);for(let x=14;x<22;x+=4)rectangularSlab(x,x+4,-8,-4,walkFloor,walkFloor,walkFloor,walkFloor,'education-upper-deck-turn',0x936d53,.16);
  rectangularSlab(10,14,-4,-3.2,walkFloor-.01,walkFloor-.01,walkFloor-.01,walkFloor-.01,'education-upper-door-threshold',gray,.18);
  for(const z of[-7.85,-4.15])for(let x=z===-7.85?10:14;x<22;x+=4){const end=Math.min(22,x+4);for(const y of[walkFloor+.45,walkFloor+.85,walkFloor+1.15])beam(world(x,y,z),world(end,y,z),.055,.055,'education-upper-deck-turn-rail',0xaebbb7);column(x,z,walkFloor,walkFloor+1.2,.055,'education-upper-deck-turn-post');}
  shell.userData.upperWalkway={path:[{x:15,z:16},{x:8,z:16},{x:8,z:4},{x:12,z:0},{x:12,z:-6},{x:21,z:-6}],width:4,floor:walkFloor,worldFloor:sharedDatum+17.7,estimated:true};overhead(-47,-7,-29,-24.8,deck,canopyTop,'education-open-roof-canopy');
  // 원본 두 외곽 사이를 잇고 220 북측 외벽의 문 개구부에 맞춘다.
  const bridge={x0:10,x1:14,z0:-3.8,z1:.15,floor:walkFloor,worldFloor:sharedDatum+17.7,canopy:walkCanopy,fromLevel:'220 7F',toLevel:'221 6F',estimated:true};shell.userData.bridge=bridge;
  rectangularSlab(bridge.x0,bridge.x1,bridge.z0,bridge.z1,walkFloor,walkFloor,walkFloor,walkFloor,'upper-connecting-bridge-floor',0x936d53,.24);
  for(const x of[bridge.x0+.15,bridge.x1-.15]){for(const y of[walkFloor+.45,walkFloor+.85,walkFloor+1.15])beam(world(x,y,bridge.z0),world(x,y,bridge.z1),.055,.055,'upper-bridge-rail',0xaebbb7);for(const z of[bridge.z0,bridge.z1])column(x,z,walkFloor,walkFloor+1.2,.055,'upper-bridge-rail-post');}
  connectionCanopy(bridge.x0-.2,bridge.x1+.2,bridge.z0,bridge.z1,'upper-bridge-light-canopy');
 }
  const tileBytes=new Uint8Array(32*16*4);for(let y=0;y<16;y++)for(let x=0;x<32;x++){const at=(y*32+x)*4,value=y%8===0||((x+(y>=8?16:0))%32===0)?179:242+((x*13+y*7)%11);tileBytes[at]=value;tileBytes[at+1]=value;tileBytes[at+2]=value;tileBytes[at+3]=255;}
  const upperRoute=[{x:15,z:16},{x:8,z:16},{x:8,z:4},{x:12,z:0},{x:12,z:-6},{x:21,z:-6}];
  Object.assign(shell.userData.upperConnection,{routeLocal:upperRoute,routeWorld:upperRoute.map(p=>{const q=world(p.x,walkFloor,p.z);return{x:q.x,y:q.y,z:q.z};}),interiorBounds:health?{x0:12,x1:20,z0:13,z1:19}:{x0:10,x1:22,z0:-8,z1:-4},doorCenterMeaning:'floor',layoutSource:'2024 bridge plan and photograph; dimensions and door placement estimated'});
  const tileTexture=new THREE.DataTexture(tileBytes,32,16,THREE.RGBAFormat);tileTexture.wrapS=tileTexture.wrapT=THREE.RepeatWrapping;tileTexture.magFilter=THREE.LinearFilter;tileTexture.minFilter=THREE.LinearMipmapLinearFilter;tileTexture.generateMipmaps=true;tileTexture.needsUpdate=true;
  for (const [s, name, roughness] of [[concrete, 'brick-walls', .92], [details, 'frames-and-roofs', .72], [glass, 'glazing', .26]] as const) {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(s.positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(s.colors, 3)); (geometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage); geometry.computeVertexNormals(); geometry.computeBoundingSphere(); geometry.computeBoundingBox(); s.geometry = geometry;
    if(s===concrete){const uv:number[]=[];for(let i=0;i<s.positions.length;i+=9){const a=new THREE.Vector3().fromArray(s.positions,i),b=new THREE.Vector3().fromArray(s.positions,i+3),c=new THREE.Vector3().fromArray(s.positions,i+6),normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize(),useZ=Math.abs(normal.dot(axis))>Math.abs(normal.dot(across)),boards=boardRanges.some(r=>i>=r.start&&i<r.end);for(const p of[a,b,c])uv.push(boards?p.dot(axis)/3.2:Math.abs(normal.y)>.5?p.dot(axis)/.24:p.dot(useZ?across:axis)/.48,boards?p.dot(across)/.28:Math.abs(normal.y)>.5?p.dot(across)/.24:p.y/.24);}geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));}
    if(s===glass){const rgba:number[]=[];for(let i=0;i<s.colors.length;i+=3){const alpha=translucentRanges.some(r=>i>=r.start&&i<r.end)?.3:1;rgba.push(s.colors[i],s.colors[i+1],s.colors[i+2],alpha);}geometry.setAttribute('color',new THREE.Float32BufferAttribute(rgba,4));}
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: s===concrete?tileTexture:null, vertexColors: true, transparent:s===glass&&translucentRanges.length>0, side: THREE.DoubleSide, roughness, metalness: s === glass ? .16 : .02 })); mesh.name = `${landmark}-${name}`; mesh.receiveShadow = true; shell.add(mesh); s.positions.length = 0; s.colors.length = 0;
  }
  function update(_player: THREE.Vector3) { const changed = new Set<Surface>(); for (const part of parts) if (part.shown !== part.proxy.visible) { part.shown = part.proxy.visible; for (const r of part.ranges) { if (r.start === r.end) continue; const attr = r.surface.geometry!.getAttribute('position') as THREE.BufferAttribute; if (!changed.has(r.surface)) attr.clearUpdateRanges(); changed.add(r.surface); if (part.shown) (attr.array as Float32Array).set(r.original, r.start); else for (let i = r.start; i < r.end; i += 3) { attr.array[i] = part.proxy.position.x; attr.array[i + 1] = part.proxy.position.y; attr.array[i + 2] = part.proxy.position.z; } attr.addUpdateRange(r.start, r.end - r.start); } } for (const s of changed) s.geometry!.getAttribute('position').needsUpdate = true; shell.visible = parts.some(p => p.proxy.visible); }
  return { breakables, update };
}
