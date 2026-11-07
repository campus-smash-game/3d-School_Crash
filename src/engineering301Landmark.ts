import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { CampusBuilding } from './fullCampus';
import type { BuildingAppearance } from './buildingAppearance';
import type { BreakableSpec } from './scene';
import { engineering301303Datum, ENGINEERING_CONNECTION_SITE } from './engineering301303Site';
type Point={x:number;z:number};
type Surface={positions:number[];colors:number[];geometry?:THREE.BufferGeometry};
type Range={surface:Surface;start:number;end:number;original:Float32Array};
type Part={proxy:THREE.Mesh;shown:boolean;ranges:Range[]};

// 사진과 지도에 맞춘 부분별 외형이다. 높이와 실내 접속 계단은 측량값이 아니다.
export function createEngineering301Landmark(scene:THREE.Scene,building:CampusBuilding,profile:BuildingAppearance,heightAt:(x:number,z:number)=>number){
 const mapped=building.points.filter((p,i,a)=>i!==a.length-1||p[0]!==a[0][0]||p[1]!==a[0][1]);if(mapped.length<3)throw Error('Engineering 301 requires an outline.');
 const north=mapped.slice().sort((a,b)=>b[1]-a[1]).slice(0,3),origin=north.reduce((a,b)=>a[0]<b[0]?a:b),end=north.reduce((a,b)=>a[0]>b[0]?a:b),len=Math.hypot(end[0]-origin[0],end[1]-origin[1]),ux=(end[0]-origin[0])/len,uz=(end[1]-origin[1])/len;
 const cx=mapped.reduce((s,p)=>s+p[0],0)/mapped.length,cz=mapped.reduce((s,p)=>s+p[1],0)/mapped.length,base=engineering301303Datum(heightAt).base301,axis=new THREE.Vector3(ux,0,uz),across=new THREE.Vector3(-uz,0,ux),up=new THREE.Vector3(0,1,0);
 const world=(x:number,y:number,z:number)=>new THREE.Vector3(origin[0]+ux*x-uz*z,base+y,origin[1]+uz*x+ux*z),ground=(x:number,z:number)=>{const p=world(x,0,z);return heightAt(p.x,p.z)-base;};
 const points=mapped.map(p=>({x:(p[0]-origin[0])*ux+(p[1]-origin[1])*uz,z:-(p[0]-origin[0])*uz+(p[1]-origin[1])*ux}));if(points.reduce((s,a,i)=>{const b=points[(i+1)%points.length];return s+a.x*b.z-b.x*a.z;},0)<0)points.reverse();
 const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minZ=Math.min(...points.map(p=>p.z)),maxZ=Math.max(...points.map(p=>p.z));
 const tower={northZ:-80.9,roof:49.5,crown:52.5,levels:15,storey:3.3,estimated:true},low={southZ:-79.6,frontZ:-8,roof:10.8,estimated:true},atrium={centerX:len/2,radius:5.8,minZ:low.southZ,maxZ:low.frontZ,floor:.24,rim:low.roof,rise:4.4,estimated:true};
 atrium.floor=.30;
 const entry={x:len/2,z:-2,width:5.4,floor:atrium.floor-5.54,height:3.05,officialLevel:'B1',estimated:true};
 const shell=new THREE.Group();shell.name=building.id+':engineering301-landmark';Object.assign(shell.userData,{buildingId:building.id,role:'building-shell',landmark:'engineering-301',appearance:profile,localOrigin:{x:origin[0],y:base,z:origin[1]},baseSample:ENGINEERING_CONNECTION_SITE.anchor,originalCentreSample:{x:cx,z:cz},axis:{x:ux,z:uz},frontFacing:{x:across.x,z:across.z},mappedOutline:mapped.map(p=>p.slice()),mappedOutlinePreserved:true,sourcePointCount:mapped.length,dimensions:{length:maxX-minX,depth:maxZ-minZ,height:52.5},tower,low,atrium,entry,entrance:entry,slots:[],stairs:[],heightEstimated:true,documentedMaximumUseFloor:15,lowWingMaximumFloorsVerified:false,interiorPlanVerified:false,datumSurveyed:false});scene.add(shell);
 const distant=new THREE.Group();distant.visible=false;Object.assign(distant.userData,{buildingId:building.id,role:'distant-building',landmark:'engineering-301'});scene.add(distant);
  const concrete: Surface = { positions: [], colors: [] }, details: Surface = { positions: [], colors: [] }, glass: Surface = { positions: [], colors: [] }, surfaces = [concrete, details, glass];
  const parts: Part[] = [], breakables: BreakableSpec[] = [], cube = new THREE.BoxGeometry(1, 1, 1), cubeVertices = cube.toNonIndexed().getAttribute('position');
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
    Object.assign(proxy.userData, { buildingId: building.id, landmark: 'engineering-301', renderProxy: true, component: name, convex, ...extra }); proxy.updateMatrix(); proxy.updateMatrixWorld(true);
    parts.push({ proxy, shown: true, ranges }); breakables.push({ mesh: proxy, size, collisionVertices, toughness: kind === 'glass' ? 6 : 11, material: kind, label: building.name });
  }
  function wallBox(s: Surface, at: (u: number, y: number, depth?: number) => THREE.Vector3, ex: THREE.Vector3, a: number, b: number, bottom: number, top: number, depth: number, thickness: number, color: number) { if (b - a > .005 && top - bottom > .005) box(s, at((a + b) / 2, (bottom + top) / 2, depth), new THREE.Vector3(b - a, top - bottom, thickness), color, ex); }

  function faceQuad(s:Surface,a:THREE.Vector3,b:THREE.Vector3,c:THREE.Vector3,d:THREE.Vector3,color:number,out:THREE.Vector3){if(b.clone().sub(a).cross(c.clone().sub(a)).dot(out)<0)quad(s,a,d,c,b,color);else quad(s,a,b,c,d,color);}
  function clip(poly:Point[],key:'x'|'z',value:number,greater:boolean){const result:Point[]=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],ia=greater?a[key]>=value:a[key]<=value,ib=greater?b[key]>=value:b[key]<=value;if(ia)result.push(a);if(ia!==ib){const t=(value-a[key])/(b[key]-a[key]);result.push({x:THREE.MathUtils.lerp(a.x,b.x,t),z:THREE.MathUtils.lerp(a.z,b.z,t)});}}return result;}
  function slab(poly:Point[],ys:number[],thickness:number,color:number,name:string,extra:Record<string,unknown>={}){component('stone',name,()=>{const top=poly.map((p,i)=>world(p.x,ys[i],p.z)),bottom=top.map(p=>p.clone().addScaledVector(up,-thickness));for(let i=1;i<poly.length-1;i++){tri(details,top[0],top[i+1],top[i],color);tri(details,bottom[0],bottom[i],bottom[i+1],color);}for(let i=0;i<poly.length;i++){const j=(i+1)%poly.length;quad(details,bottom[i],bottom[j],top[j],top[i],color);}},axis,true,extra);}
  function rectangularSlab(x0:number,x1:number,z0:number,z1:number,y00:number,y10:number,y11:number,y01:number,name:string,color=0xaaa99a,thickness=.20){const p=[{x:x0,z:z0},{x:x1,z:z0},{x:x1,z:z1},{x:x0,z:z1}],ys=[y00,y10,y11,y01];if(Math.max(...ys)-Math.min(...ys)<.0001){slab(p,ys,thickness,color,name);return;}for(const indices of [[0,1,2],[0,2,3]])slab(indices.map(i=>p[i]),indices.map(i=>ys[i]),thickness,color,name);}

  function exposedStrip(surface:Surface,at:(u:number,y:number,d?:number)=>THREE.Vector3,ex:THREE.Vector3,a:number,b:number,y0:number,y1:number,depth:number,thickness:number,color:number,faces:number[]){
    if(b-a<.005||y1-y0<.005)return;const centre=at((a+b)/2,(y0+y1)/2,depth),ez=new THREE.Vector3().crossVectors(ex,up).normalize(),tint=new THREE.Color(color);
    for(let i=0;i<cubeVertices.count;i++){if(!faces.includes(Math.floor(i/6)))continue;const p=centre.clone().addScaledVector(ex,cubeVertices.getX(i)*(b-a)).addScaledVector(up,cubeVertices.getY(i)*(y1-y0)).addScaledVector(ez,cubeVertices.getZ(i)*thickness);surface.positions.push(p.x,p.y,p.z);surface.colors.push(tint.r,tint.g,tint.b);}
  }


  const gray=0xb3c0ba, frame=profile.frameColor, glassColor=profile.glassColor;
  function pane(a:THREE.Vector3,b:THREE.Vector3,c:THREE.Vector3,d:THREE.Vector3,name:string,normal:THREE.Vector3,ex=axis,extra:Record<string,unknown>={}){
    component('glass',name,()=>{const front=[a,b,c,d],back=front.map(p=>p.clone().addScaledVector(normal,-.06));faceQuad(glass,a,b,c,d,glassColor,normal);faceQuad(glass,back[3],back[2],back[1],back[0],glassColor,normal.clone().negate());for(let i=0;i<4;i++){const j=(i+1)%4;quad(glass,front[i],back[i],back[j],front[j],glassColor);}},ex,true,{...extra,outward:normal.toArray(),skylight:true});
  }
  function beam(a:THREE.Vector3,b:THREE.Vector3,width:number,depth:number,name:string,color=gray){
    const ex=b.clone().sub(a).normalize(),ey=up.clone().addScaledVector(ex,-up.dot(ex));if(ey.length()<.01)ey.copy(axis);ey.normalize();
    component('metal',name,()=>box(details,a.clone().add(b).multiplyScalar(.5),new THREE.Vector3(a.distanceTo(b),width,depth),color,ex,ey),axis,true);
  }
  function drawCurtain(at:(u:number,y:number,d?:number)=>THREE.Vector3,tangent:THREE.Vector3,outward:THREE.Vector3,a:number,b:number,bottom:number,top:number){
    if(b-a<.12||top-bottom<.15)return;
      faceQuad(glass,at(a,bottom),at(b,bottom),at(b,top),at(a,top),glassColor,outward);
      const strip=(x0:number,x1:number,y0:number,y1:number,color:number)=>faceQuad(details,at(x0,y0,.027),at(x1,y0,.027),at(x1,y1,.027),at(x0,y1,.027),color,outward);
      const nx=Math.max(1,Math.round((b-a)/1.35)),ny=Math.max(1,Math.round((top-bottom)/.76));
      for(let i=0;i<=nx;i++){const x=a+(b-a)*i/nx;strip(Math.max(a,x-.025),Math.min(b,x+.025),bottom,top,frame);}
      for(let i=0;i<=ny;i++){const y=bottom+(top-bottom)*i/ny;strip(a,b,Math.max(bottom,y-.022),Math.min(top,y+.022),frame);}
      strip(a,b,Math.max(bottom,top-.26),top,.0+0x455e60);
  }
  function curtain(at:(u:number,y:number,d?:number)=>THREE.Vector3,tangent:THREE.Vector3,outward:THREE.Vector3,a:number,b:number,bottom:number,top:number,name:string,extra:Record<string,unknown>={}){if(b-a<.12||top-bottom<.15)return;component('glass',name,()=>drawCurtain(at,tangent,outward,a,b,bottom,top),tangent,false,{...extra,outward:outward.toArray(),closedFacade:true});}
  function solidWall(a:THREE.Vector3,b:THREE.Vector3,height:number,thickness:number,name:string,color=gray){const ex=b.clone().sub(a).normalize(),w=a.distanceTo(b),out=new THREE.Vector3().crossVectors(ex,up).normalize();component('stone',name,()=>{box(concrete,a.clone().add(b).multiplyScalar(.5).addScaledVector(up,height/2),new THREE.Vector3(w,height,thickness),color,ex);if(name==='north-upper-gray-wall'){const at=(x:number,y:number)=>a.clone().addScaledVector(ex,x).addScaledVector(up,y).addScaledVector(out,thickness/2+.004);for(let x=0;x<w;x+=1.1)faceQuad(details,at(x,0),at(Math.min(w,x+.016),0),at(Math.min(w,x+.016),height),at(x,height),0x7d9490,out);for(let y=0;y<height;y+=.78)faceQuad(details,at(0,y),at(w,y),at(w,Math.min(height,y+.016)),at(0,Math.min(height,y+.016)),0x7d9490,out);}},ex);}
  function roofPolygon(poly:Point[],height:number,name:string){const flat=poly.map(p=>new THREE.Vector2(p.x,p.z)),faces=THREE.ShapeUtils.triangulateShape(flat,[]);for(const f of faces){const t=f.map(i=>poly[i]);for(let x=minX;x<maxX;x+=12)for(let z=minZ;z<0;z+=12){let q=t;for(const[k,v,g]of[['x',x,true],['x',x+12,false],['z',z,true],['z',z+12,false]]as const)q=clip(q,k,v,g);if(q.length<3||Math.abs(q.reduce((v,a,i)=>{const b=q[(i+1)%q.length];return v+a.x*b.z-b.x*a.z;},0))<.03)continue;slab(q,q.map(()=>height),.18,gray,name);}}}
  const towerPoly=clip(points,'z',tower.northZ,false),lowPoly=clip(points,'z',low.southZ,true),connector=clip(clip(points,'z',tower.northZ,true),'z',low.southZ,false);
  // 깊은 세로 틈은 뒤쪽 유리와 두 옆면으로 나누며 입면 전체의 상자로 덮지 않는다.
  for(let edge=0;edge<towerPoly.length;edge++){
    const a=towerPoly[edge],b=towerPoly[(edge+1)%towerPoly.length],length=Math.hypot(b.x-a.x,b.z-a.z);if(length<.2)continue;
    const dx=(b.x-a.x)/length,dz=(b.z-a.z)/length,tangent=axis.clone().multiplyScalar(dx).addScaledVector(across,dz),out=axis.clone().multiplyScalar(dz).addScaledVector(across,-dx),at=(u:number,y:number,d=0)=>world(a.x+dx*u,y,a.z+dz*u).addScaledVector(out,d);
    const slotCenters=length>25?[length*.22,length*.78]:[],slotWidth=1.8,depth=1.45,cuts=new Set([0,length]);for(let i=1;i<Math.ceil(length/5.5);i++)cuts.add(length*i/Math.ceil(length/5.5));for(const x of slotCenters){cuts.add(x-slotWidth/2);cuts.add(x+slotWidth/2);}const sorted=[...cuts].filter(u=>!slotCenters.some(c=>Math.abs(u-c)<slotWidth/2-.01)).sort((a,b)=>a-b);
    for(const c of slotCenters)shell.userData.slots.push({center:at(c,0).toArray(),outward:out.toArray(),tangent:tangent.toArray(),width:slotWidth,depth,bottom:0,top:tower.roof,estimated:true});
    for(let k=0;k+1<sorted.length;k++)for(let row=0;row<tower.levels;row++){
      const u0=sorted[k],u1=sorted[k+1],mid=(u0+u1)/2,slot=slotCenters.some(c=>Math.abs(mid-c)<slotWidth/2-.01),bottom=row*tower.storey,top=(row+1)*tower.storey;
      const terrainMax=Math.max(...Array.from({length:Math.ceil((u1-u0)/.25)+1},(_,i)=>u0+(u1-u0)*i/Math.ceil((u1-u0)/.25)).flatMap(u=>(slot?[0,-depth]:[0]).map(d=>{const p=at(u,0,d);return heightAt(p.x,p.z)-base;}))),sill=Math.max(bottom,terrainMax+.14);
      if(!row&&sill>-.1)solidWall(at(u0,Math.min(-1,terrainMax-.3)),at(u1,Math.min(-1,terrainMax-.3)),sill-Math.min(-1,terrainMax-.3),.2,'tower-foundation');
      const panelAt=(u:number,y:number,d=0)=>at(u,y,d-(slot?depth:0));curtain(panelAt,tangent,out,u0,u1,sill,top,slot?'tower-slot-back-glass':'tower-curtain-bay',{level:row,edge,slot});
      if(slot){for(const u of[u0,u1]){const p0=at(u,bottom,-depth),p1=at(u,bottom,0);solidWall(p0,p1,top-bottom,.10,'tower-slot-side',0x52696b);}if(row%3===2)component('metal','tower-slot-cross-band',()=>box(details,at(mid,top-.16,-.08),new THREE.Vector3(u1-u0,.32,.16),0x455b5b,tangent),tangent);}
    }
  }
  roofPolygon(towerPoly,tower.roof,'tower-roof');roofPolygon(connector,low.roof+1.2,'connector-roof');
  const crown={x0:14,x1:33,z:tower.northZ,base:tower.roof,top:tower.crown,cells:6,estimated:true};shell.userData.crown=crown;
  for(const x of[12,35.2])component('stone','tower-crown-end',()=>box(concrete,world(x,51,tower.northZ-1.3),new THREE.Vector3(2.2,3,2.6),gray));
  for(const y of[crown.base+.1,crown.top-.1])beam(world(crown.x0,y,crown.z),world(crown.x1,y,crown.z),.17,.24,'crown-horizontal');
  for(let i=0;i<crown.cells;i++){const x0=crown.x0+(crown.x1-crown.x0)*i/crown.cells,x1=crown.x0+(crown.x1-crown.x0)*(i+1)/crown.cells;beam(world(x0,crown.base+.15,crown.z),world((x0+x1)/2,crown.top-.15,crown.z),.14,.18,'crown-diagonal');beam(world((x0+x1)/2,crown.top-.15,crown.z),world(x1,crown.base+.15,crown.z),.14,.18,'crown-diagonal');}
  // 북쪽 저층부의 세 창 띠는 사진상의 상대 구성이며 공식 최고층 수를 뜻하지 않는다.
  for(let edge=0;edge<lowPoly.length;edge++){
    const a=lowPoly[edge],b=lowPoly[(edge+1)%lowPoly.length],length=Math.hypot(b.x-a.x,b.z-a.z);if(length<.1)continue;
    const dx=(b.x-a.x)/length,dz=(b.z-a.z)/length,tangent=axis.clone().multiplyScalar(dx).addScaledVector(across,dz),out=axis.clone().multiplyScalar(dz).addScaledVector(across,-dx),at=(u:number,y:number,d=0)=>world(a.x+dx*u,y,a.z+dz*u).addScaledVector(out,d);
    for(let k=0;k<Math.ceil(length/5.8);k++){const u0=k*length/Math.ceil(length/5.8),u1=(k+1)*length/Math.ceil(length/5.8),mid=(u0+u1)/2,z=a.z+dz*mid;if(z>low.frontZ+.1)continue;const g=Math.max(...Array.from({length:Math.ceil((u1-u0)/.25)+1},(_,i)=>u0+(u1-u0)*i/Math.ceil((u1-u0)/.25)).map(u=>{const p=at(u,0);return heightAt(p.x,p.z)-base;}));
      for(let row=0;row<3;row++){const floor=row*3.6,top=(row+1)*3.6,sill=Math.max(floor+.65,g+.16),head=top-.62,bottom=row?floor:Math.min(g-.4,-.4);component('glass','low-wing-window-bay',()=>{box(concrete,at(mid,(bottom+sill)/2),new THREE.Vector3(u1-u0,Math.max(.12,sill-bottom),.22),gray,tangent);box(concrete,at(mid,(head+top)/2),new THREE.Vector3(u1-u0,top-head,.22),gray,tangent);drawCurtain(at,tangent,out,u0+.10,u1-.10,sill,head);},tangent,false,{level:row,edge,outward:out.toArray(),closedFacade:head>sill+.15});}
    }
  }
  const left=atrium.centerX-atrium.radius,right=atrium.centerX+atrium.radius;
  const lowBody=clip(lowPoly,'z',low.frontZ,false);roofPolygon(clip(lowBody,'x',left,false),low.roof,'low-wing-side-roof');roofPolygon(clip(lowBody,'x',right,true),low.roof,'low-wing-side-roof');
  // 회랑과 일부 연결 통로만 두고 유리 지붕 아래 중앙은 층마다 비운다.
  const groundMaxInAtrium=Math.max(...Array.from({length:34},(_,iz)=>-16-iz*2).flatMap(z=>Array.from({length:13},(_,ix)=>ground(left+ix*(right-left)/12,z))));atrium.floor=Math.max(.30,groundMaxInAtrium+.20);
  for(let z=low.southZ;z<-16;z+=6)rectangularSlab(left,right,z,Math.min(-16,z+6),atrium.floor,atrium.floor,atrium.floor,atrium.floor,'atrium-ground-floor',0xc6c9bc);
  for(const y of[atrium.floor+3.6,atrium.floor+7.2])for(const side of[-1,1])for(let z=low.southZ;z<low.frontZ;z+=9){const zz=Math.min(low.frontZ,z+9),x0=side<0?left:left+2*atrium.radius-1.85,x1=x0+1.85;rectangularSlab(x0,x1,z,zz,y,y,y,y,'atrium-side-gallery',0xc7c9bc);const edge=side<0?x1:x0;for(const dy of[.45,1.03])beam(world(edge,y+dy,z),world(edge,y+dy,zz),.055,.055,'gallery-rail');for(const z0 of[z,zz])beam(world(edge,y,z0),world(edge,y+1.08,z0),.06,.06,'gallery-rail-post');}
  for(const [z,y]of[[-30,atrium.floor+3.6],[-62,atrium.floor+7.2]]){rectangularSlab(left,right,z-1,z+1,y,y,y,y,'atrium-cross-bridge',0xbec5b9);for(const zz of[z-1,z+1])for(const dy of[.45,1.03])beam(world(left,y+dy,zz),world(right,y+dy,zz),.055,.055,'bridge-rail');}
  const barrelSegments=10,longSegments=Math.ceil((low.frontZ-low.southZ)/5.8),barrel=(angle:number,z:number)=>world(atrium.centerX+atrium.radius*Math.cos(angle),atrium.rim+atrium.rise*Math.sin(angle),z);
  for(let j=0;j<longSegments;j++)for(let i=0;i<barrelSegments;i++){
    const z0=low.southZ+(low.frontZ-low.southZ)*j/longSegments,z1=low.southZ+(low.frontZ-low.southZ)*(j+1)/longSegments,a0=i*Math.PI/barrelSegments,a1=(i+1)*Math.PI/barrelSegments,p=[barrel(a0,z0),barrel(a0,z1),barrel(a1,z1),barrel(a1,z0)],normal=axis.clone().multiplyScalar(Math.cos((a0+a1)/2)).addScaledVector(up,Math.sin((a0+a1)/2)).normalize();
    component('glass','atrium-barrel-glass',()=>{faceQuad(glass,p[0],p[1],p[2],p[3],0x8ab5b1,normal);const back=p.map(a=>a.clone().addScaledVector(normal,-.065));faceQuad(glass,back[3],back[2],back[1],back[0],0x8ab5b1,normal.clone().negate());for(let k=0;k<4;k++){const l=(k+1)%4;quad(glass,p[k],back[k],back[l],p[l],glassColor);}for(const[a,b]of[[p[0],p[3]],[p[0],p[1]]]){const ex=b.clone().sub(a).normalize(),ey=normal.clone().addScaledVector(ex,-normal.dot(ex)).normalize();box(details,a.clone().add(b).multiplyScalar(.5).addScaledVector(normal,.025),new THREE.Vector3(a.distanceTo(b),.055,.055),0xd0d6ca,ex,ey);}},axis,true,{skylight:true,segment:j,arc:i});
  }
  // 북단 세로 곡면과 그 앞의 경사 유리는 서로 다른 형태다.
  for(let i=0;i<barrelSegments;i++){const a0=i*Math.PI/barrelSegments,a1=(i+1)*Math.PI/barrelSegments,p0=barrel(a0,low.frontZ),p1=barrel(a1,low.frontZ),q0=world(atrium.centerX+atrium.radius*Math.cos(a0),3.6,low.frontZ),q1=world(atrium.centerX+atrium.radius*Math.cos(a1),3.6,low.frontZ);pane(q0,q1,p1,p0,'north-vertical-barrel-end',across,axis);}
  for(const[x0,x1]of[[0,left],[right,len]])solidWall(world(x0,3.6,low.frontZ),world(x1,3.6,low.frontZ),low.roof-3.6,.24,'north-upper-gray-wall');
  const northFrontTop=entry.floor+entry.height+.18;
  for(let x=0;x<len;x+=3.6){const x1=Math.min(len,x+3.6),a=world(x,northFrontTop,0),b=world(x1,northFrontTop,0),c=world(x1,3.6,low.frontZ),d=world(x,3.6,low.frontZ),normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize();if(normal.y<0)normal.negate();pane(a,b,c,d,'north-sloped-glass',normal,axis);beam(a,d,.045,.06,'north-slope-frame');}
  const frontCuts=[...new Set([0,2.5,len,entry.x-entry.width/2,entry.x+entry.width/2,...Array.from({length:Math.floor(len/3.5)},(_,i)=>(i+1)*3.5)])].sort((a,b)=>a-b);for(let i=0;i+1<frontCuts.length;i++){const x=frontCuts[i],x1=frontCuts[i+1],mid=(x+x1)/2;if(mid<2.5||Math.abs(mid-entry.x)<entry.width/2-.001)continue;const bottom=Math.max(...[x,mid,x1].map(x=>ground(x,entry.z)))+.14;curtain((u,y,d=0)=>world(u,y,entry.z+d),axis,across,x,x1,bottom,northFrontTop,'north-ground-glass');}
  component('glass','engineering301-entry-door',()=>{box(glass,world(entry.x,entry.floor+entry.height/2,entry.z),new THREE.Vector3(entry.width,entry.height,.065),0x527e83);for(const x of[entry.x-entry.width/2,entry.x,entry.x+entry.width/2])box(details,world(x,entry.floor+entry.height/2,entry.z+.035),new THREE.Vector3(.06,entry.height,.07),gray);},axis,false,{entrance:true,outward:across.toArray()});
  // 현장의 층고가 아니라 보존한 게임 DEM에 맞춘 내부 접속 계단이다.
  const innerWidth=entry.width,innerSteps=20;Object.assign(shell.userData.entry,{lobbyDepth:2,forecourtDepth:2,facadeSetback:2,connectionDepth:10,gameLevelDifference:5.54,connectionIsSurveyedStoreyHeight:false});
  rectangularSlab(entry.x-innerWidth/2,entry.x+innerWidth/2,-4,entry.z,entry.floor,entry.floor,entry.floor,entry.floor,'north-entrance-lobby',0xbec3b6);
  for(let i=0;i<innerSteps;i++){const z0=-4-(i+1)*.5,z1=-4-i*.5,top=THREE.MathUtils.lerp(entry.floor,atrium.floor,(i+1)/innerSteps);rectangularSlab(entry.x-innerWidth/2,entry.x+innerWidth/2,z0,z1,top,top,top,top,'internal-terrain-connection-step',0xbec3b6,.42);shell.userData.stairs.push({kind:'interior',z0,z1,y:top,width:innerWidth});}
  rectangularSlab(left,right,-16,-14,atrium.floor,atrium.floor,atrium.floor,atrium.floor,'atrium-inner-landing',0xbec3b6);
  rectangularSlab(entry.x-innerWidth/2,entry.x+innerWidth/2,entry.z,0,entry.floor,entry.floor,entry.floor,entry.floor,'entry-threshold',gray);
  // 외부 계단과 데크는 두 건물이 공유하는 연결부에서 한 번만 만든다.
  Object.assign(shell.userData,{access:{managedByConnection:true,owner:'connection/engineering301-303',gameTerrainAdjustment:true,measuredConstruction:false},datumPolicy:'shared road centreline; silhouette preserved; estimated game datum'});

  for(const[s,name,roughness]of[[concrete,'solid',.86],[details,'frames',.64],[glass,'glazing',.24]]as const){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(s.positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(s.colors,3));(geometry.getAttribute('position')as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);geometry.computeVertexNormals();geometry.computeBoundingSphere();geometry.computeBoundingBox();s.geometry=geometry;const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness,metalness:s===glass?.18:.02}));mesh.name='engineering301-'+name;mesh.receiveShadow=true;shell.add(mesh);s.positions.length=0;s.colors.length=0;}
  function update(_player:THREE.Vector3){const changed=new Set<Surface>();for(const part of parts)if(part.shown!==part.proxy.visible){part.shown=part.proxy.visible;for(const r of part.ranges){if(r.start===r.end)continue;const attr=r.surface.geometry!.getAttribute('position')as THREE.BufferAttribute;if(!changed.has(r.surface))attr.clearUpdateRanges();changed.add(r.surface);if(part.shown)(attr.array as Float32Array).set(r.original,r.start);else for(let i=r.start;i<r.end;i+=3){attr.array[i]=part.proxy.position.x;attr.array[i+1]=part.proxy.position.y;attr.array[i+2]=part.proxy.position.z;}attr.addUpdateRange(r.start,r.end-r.start);}}for(const s of changed)s.geometry!.getAttribute('position').needsUpdate=true;shell.visible=parts.some(p=>p.proxy.visible);}
  return{breakables,update};
}
