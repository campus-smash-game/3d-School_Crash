import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { CampusBuilding } from './fullCampus';
import type { BuildingAppearance } from './buildingAppearance';
import type { BreakableSpec } from './scene';
type Point = { x: number; z: number };
type Surface = { positions: number[]; colors: number[]; geometry?: THREE.BufferGeometry };
type Range = { surface: Surface; start: number; end: number; original: Float32Array };
type Part = { proxy: THREE.Mesh; shown: boolean; ranges: Range[] };

// 090 사진과 공식 행사 지도의 상대 배치다. 정확한 차양 변과 높이는 실측하지 않았다.
export function createGymLandmark(scene: THREE.Scene, building: CampusBuilding, profile: BuildingAppearance, heightAt: (x: number, z: number) => number) {
  const mapped = building.points.filter((p, i, all) => i !== all.length - 1 || p[0] !== all[0][0] || p[1] !== all[0][1]);
  if (mapped.length < 3) throw new Error('Gym requires its original mapped outline.');
  const cx = mapped.reduce((s,p)=>s+p[0],0)/mapped.length, cz = mapped.reduce((s,p)=>s+p[1],0)/mapped.length;
  const origin = mapped.reduce((a,b)=>a[0]<b[0]?a:b);
  let longest=0, ux=1, uz=0;
  for(let i=0;i<mapped.length;i++){const a=mapped[i],b=mapped[(i+1)%mapped.length],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(Math.abs(dx)/length>.85&&length>longest){longest=length;ux=dx/length;uz=dz/length;}}
  if(ux<0){ux=-ux;uz=-uz;}
  const axis=new THREE.Vector3(ux,0,uz),across=new THREE.Vector3(-uz,0,ux),up=new THREE.Vector3(0,1,0),base=heightAt(cx,cz);
  const world=(x:number,y:number,z:number)=>new THREE.Vector3(origin[0]+x*ux-z*uz,base+y,origin[1]+x*uz+z*ux);
  const ground=(x:number,z:number)=>{const p=world(x,0,z);return heightAt(p.x,p.z)-base;};
  const points=mapped.map(p=>({x:(p[0]-origin[0])*ux+(p[1]-origin[1])*uz,z:-(p[0]-origin[0])*uz+(p[1]-origin[1])*ux}));
  if(points.reduce((s,p,i)=>{const q=points[(i+1)%points.length];return s+p.x*q.z-q.x*p.z;},0)<0)points.reverse();
  const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minZ=Math.min(...points.map(p=>p.z)),maxZ=Math.max(...points.map(p=>p.z));
  const split=-50.6, high=14, low=8, entry={x:2.4,z:-28,width:5.4,floor:.22,height:4.05};
  const canopy={minX:-8.5,maxX:2.6,minZ:-44,maxZ:-15,top:6.3,bottom:5.0,estimated:true};
  const opening={x0:-7.15,x1:-1.0,bottom:1.55,top:3.85,z:canopy.minZ,thickness:.52};
  const shell=new THREE.Group();shell.name=building.id+':gym-landmark';
  Object.assign(shell.userData,{buildingId:building.id,role:'building-shell',landmark:'gym',appearance:profile,localOrigin:{x:origin[0],y:base,z:origin[1]},axis:{x:ux,z:uz},frontFacing:{x:-ux,z:-uz},dimensions:{length:maxX-minX,depth:maxZ-minZ,height:high},mappedOutline:mapped.map(p=>p.slice()),mappedOutlinePreserved:true,sourcePointCount:mapped.length,highRoof:high,lowRoof:low,bodySplitZ:split,levels:{sourceMap:4,classificationVerified:false,confirmedUseFloor:3,usedAsFacadeRows:false},heightEstimated:true,detailDimensionsEstimated:true,frontDirectionEstimated:true,canopyEdgeCandidate:[8,9],alternativeCanopyEdge:[4,5],courtyardModeled:false,entrance:entry,canopy,supportOpening:opening,interiorPlanVerified:false});scene.add(shell);
  const distant=new THREE.Group();distant.visible=false;Object.assign(distant.userData,{buildingId:building.id,role:'distant-building',landmark:'gym'});scene.add(distant);
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
    if (convex) { const inverse = proxy.quaternion.clone().invert(), unique = new Map<string, THREE.Vector3>(); for (const r of ranges) for (let i = 0; i < r.original.length; i += 3) { const v = new THREE.Vector3().fromArray(r.original, i).sub(proxy.position).applyQuaternion(inverse); unique.set(v.toArray().map(n => n.toFixed(5)).join(','), v); } proxy.geometry = new ConvexGeometry([...unique.values()]); collisionVertices = Float32Array.from(proxy.geometry.getAttribute('position').array); proxy.scale.setScalar(1); }
    // 닫힌 창 구획의 앞면을 외벽과 유리 사이에 두어 두 표면의 오차를 균형 있게 줄인다.
    // 실제 후퇴 기하와 뒤쪽 충돌면은 유지하며 문, 빈 지지 벽과 트러스에는 적용하지 않는다.
    if (name === 'low-wing-window-bay' && !convex && ranges[2].original.length && Array.isArray(extra.outward)) {
      const outward = new THREE.Vector3().fromArray(extra.outward as number[]).normalize();
      let wallFront = -Infinity, glassFront = -Infinity;
      for (const r of ranges) for (let i = 0; i < r.original.length; i += 3) {
        const depth = p.fromArray(r.original, i).dot(outward);
        if (r.surface === glass) glassFront = Math.max(glassFront, depth);
        else wallFront = Math.max(wallFront, depth);
      }
      const previousFront = proxy.position.dot(outward) + size.z / 2, back = proxy.position.dot(outward) - size.z / 2;
      const balancedFront = (wallFront + glassFront) / 2, depth = balancedFront - back;
      if (depth > .025 && balancedFront < previousFront) {
        proxy.position.addScaledVector(outward, (balancedFront - previousFront) / 2);
        proxy.scale.z = size.z = depth;
        proxy.userData.facadeCollision = { method: 'midpoint-of-visible-wall-and-recessed-glass', wallFront, glassFront, previousFront, balancedFront, back, previousGlassLead: previousFront - glassFront, balancedSurfaceError: (wallFront - glassFront) / 2 };
      }
    }
    Object.assign(proxy.userData, { buildingId: building.id, landmark: 'gym', renderProxy: true, component: name, convex, ...extra }); proxy.updateMatrix(); proxy.updateMatrixWorld(true);
    parts.push({ proxy, shown: true, ranges }); breakables.push({ mesh: proxy, size, collisionVertices, toughness: kind === 'glass' ? 6 : 11, material: kind, label: building.name });
  }
  function wallBox(s: Surface, at: (u: number, y: number, depth?: number) => THREE.Vector3, ex: THREE.Vector3, a: number, b: number, bottom: number, top: number, depth: number, thickness: number, color: number) { if (b - a > .005 && top - bottom > .005) box(s, at((a + b) / 2, (bottom + top) / 2, depth), new THREE.Vector3(b - a, top - bottom, thickness), color, ex); }

  function faceQuad(s:Surface,a:THREE.Vector3,b:THREE.Vector3,c:THREE.Vector3,d:THREE.Vector3,color:number,out:THREE.Vector3){if(b.clone().sub(a).cross(c.clone().sub(a)).dot(out)<0)quad(s,a,d,c,b,color);else quad(s,a,b,c,d,color);}
  function clip(poly:Point[],key:'x'|'z',value:number,greater:boolean){const result:Point[]=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],ia=greater?a[key]>=value:a[key]<=value,ib=greater?b[key]>=value:b[key]<=value;if(ia)result.push(a);if(ia!==ib){const t=(value-a[key])/(b[key]-a[key]);result.push({x:THREE.MathUtils.lerp(a.x,b.x,t),z:THREE.MathUtils.lerp(a.z,b.z,t)});}}return result;}
  function slab(poly:Point[],ys:number[],thickness:number,color:number,name:string,extra:Record<string,unknown>={}){component('stone',name,()=>{const top=poly.map((p,i)=>world(p.x,ys[i],p.z)),bottom=top.map(p=>p.clone().addScaledVector(up,-thickness));for(let i=1;i<poly.length-1;i++){tri(details,top[0],top[i+1],top[i],color);tri(details,bottom[0],bottom[i],bottom[i+1],color);}for(let i=0;i<poly.length;i++){const j=(i+1)%poly.length;quad(details,bottom[i],bottom[j],top[j],top[i],color);}},axis,true,extra);}
  function rectangularSlab(x0:number,x1:number,z0:number,z1:number,y00:number,y10:number,y11:number,y01:number,name:string,color=0xaaa99a){const p=[{x:x0,z:z0},{x:x1,z:z0},{x:x1,z:z1},{x:x0,z:z1}],ys=[y00,y10,y11,y01];for(const indices of [[0,1,2],[0,2,3]])slab(indices.map(i=>p[i]),indices.map(i=>ys[i]),.20,color,name);}
  const wall=0xd3cfb9, trim=0xb2b1a2;
  for(let edge=0;edge<points.length;edge++){
    const a=points[edge],b=points[(edge+1)%points.length],length=Math.hypot(b.x-a.x,b.z-a.z),dx=(b.x-a.x)/length,dz=(b.z-a.z)/length,tangent=axis.clone().multiplyScalar(dx).addScaledVector(across,dz),outward=axis.clone().multiplyScalar(dz).addScaledVector(across,-dx);
    const at=(u:number,y:number,depth=0)=>world(a.x+dx*u,y,a.z+dz*u).addScaledVector(outward,depth),cuts=new Set<number>([0,length]);
    for(let i=1;i<Math.ceil(length/6);i++)cuts.add(length*i/Math.ceil(length/6));
    for(const z of [split,-38,entry.z-entry.width/2,entry.z+entry.width/2,-18]){if(Math.abs(dz)>.0001){const u=(z-a.z)/dz;if(u>0&&u<length)cuts.add(u);}}
    const sorted=[...cuts].sort((x,y)=>x-y);
    for(let j=0;j+1<sorted.length;j++){
      const u0=sorted[j],u1=sorted[j+1],mid=(u0+u1)/2,x=a.x+dx*mid,z=a.z+dz*mid,h=z>=split?high:low;
      const west=outward.dot(axis)<-.98&&x<1, lobby=west&&z>-38&&z<-18,door=lobby&&Math.abs(z-entry.z)<entry.width/2-.001;
      const floor=Math.min(-.5,...Array.from({length:7},(_,k)=>{const p=at(u0+(u1-u0)*k/6,0);return heightAt(p.x,p.z)-base-.4;}));
      if(h===high){
        if(lobby){
          component('stone','entry-upper-solid-wall',()=>wallBox(concrete,at,tangent,u0,u1,5.15,high,-.15,.45,wall));
          if(!door) component('glass','recessed-entry-glazing',()=>{const offset=entry.x-x;faceQuad(glass,at(u0+.035,entry.floor,-offset),at(u0+.035,5.10,-offset),at(u1-.035,5.10,-offset),at(u1-.035,entry.floor,-offset),0x365763,outward);for(let u=u0;u<u1;u+=1.4)wallBox(details,at,tangent,u-.035,u+.035,entry.floor,5.12,-offset+.04,.10,0x747e77);wallBox(details,at,tangent,u0,u1,4.18,4.26,-offset+.04,.1,0x747e77);},tangent,false,{outward:outward.toArray()});
          else component('glass','entry-transom',()=>{const offset=entry.x-x;faceQuad(glass,at(u0,entry.floor+entry.height,-offset),at(u0,5.13,-offset),at(u1,5.13,-offset),at(u1,entry.floor+entry.height,-offset),0x45636a,outward);},tangent);
        } else for(const [y0,y1] of [[floor,5.15],[5.15,9.4],[9.4,high]])component('stone','high-windowless-wall',()=>wallBox(concrete,at,tangent,u0,u1,y0,y1,-.15,.45,wall),tangent,false,{outward:outward.toArray()});
        component('metal','high-horizontal-masonry-band',()=>wallBox(details,at,tangent,u0,u1,5.14,5.34,.09,.14,trim),tangent);
      }else{
        for(let row=0;row<2;row++){
          const bottom=row===0?floor:4,top=(row+1)*4,groundMax=Math.max(...Array.from({length:11},(_,k)=>{const p=at(u0+(u1-u0)*k/10,0,-.20);return heightAt(p.x,p.z)-base;})),sill=Math.max(row*4+.8,groundMax+.15),head=top-.65;
          component('glass','low-wing-window-bay',()=>{if(u1-u0<1.0||head<=sill+.3){wallBox(concrete,at,tangent,u0,u1,bottom,top,-.15,.45,wall);return;}const left=u0+.22,right=u1-.22;wallBox(concrete,at,tangent,u0,u1,bottom,sill,-.15,.45,wall);wallBox(concrete,at,tangent,u0,u1,head,top,-.15,.45,wall);wallBox(concrete,at,tangent,u0,left,sill,head,-.15,.45,wall);wallBox(concrete,at,tangent,right,u1,sill,head,-.15,.45,wall);faceQuad(glass,at(left,sill,-.23),at(left,head,-.23),at(right,head,-.23),at(right,sill,-.23),row?0x526d72:0x3c5c66,outward);for(let u=left;u<=right;u+=1.15)wallBox(details,at,tangent,u-.035,u+.035,sill,head,-.15,.12,0x818a80);for(const y of [sill,head])wallBox(details,at,tangent,left,right,y-.035,y+.035,-.15,.12,0x818a80);},tangent,false,{row,outward:outward.toArray(),terrainClipped:true});
        }
      }
    }
  }
  // 원본 다각형의 북쪽과 남쪽을 서로 다른 높이로 자른다. 도면 X에는 추정 중정을 만들지 않는다.
  for(const [north,y] of [[true,high],[false,low]] as const){const region=clip(points,'z',split,north);for(let x=minX;x<maxX;x+=17)for(let z=minZ;z<maxZ;z+=16){let poly=region;for(const [key,value,greater]of[['x',x,true],['x',x+17,false],['z',z,true],['z',z+16,false]]as const)poly=clip(poly,key,value,greater);if(poly.length<3)continue;for(const face of THREE.ShapeUtils.triangulateShape(poly.map(p=>new THREE.Vector2(p.x,p.z)),[])){const triangle=face.map(i=>poly[i]);slab(triangle,[y-.15,y-.15,y-.15],.25,0x8c978c,'mapped-roof-slab',{north,roofHeight:y});}}}
  const crossing:number[]=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];if((a.z<=split&&b.z>split)||(b.z<=split&&a.z>split))crossing.push(a.x+(b.x-a.x)*(split-a.z)/(b.z-a.z));}crossing.sort((a,b)=>a-b);
  for(let i=0;i+1<crossing.length;i+=2)for(let x=crossing[i];x<crossing[i+1];x+=6){const end=Math.min(crossing[i+1],x+6);component('stone','hall-height-transition',()=>box(concrete,world((x+end)/2,(high+low)/2,split),new THREE.Vector3(end-x,high-low,.36),wall));}
  // 지지 벽을 네 조각으로 나누어 사진의 긴 개구부가 충돌에서도 열린다.
  for(const [x0,x1,y0,y1]of[[canopy.minX,opening.x0,0,canopy.top],[opening.x1,canopy.maxX,0,canopy.top],[opening.x0,opening.x1,0,opening.bottom],[opening.x0,opening.x1,opening.top,canopy.top]])component('stone','canopy-support-wall',()=>box(concrete,world((x0+x1)/2,(y0+y1)/2,opening.z),new THREE.Vector3(x1-x0,y1-y0,opening.thickness),wall),axis,false,{supportOpening:true});
  for(const x of [canopy.minX+.35,canopy.maxX-.3])component('stone','canopy-north-support',()=>box(concrete,world(x,canopy.top/2,canopy.maxZ),new THREE.Vector3(.65,canopy.top,.65),wall));
  for(let z=canopy.minZ;z<canopy.maxZ;z+=2.9)component('metal','canopy-roof-panel',()=>box(details,world((canopy.minX+canopy.maxX)/2,canopy.top-.13,Math.min(z+2.9,canopy.maxZ)/2+z/2),new THREE.Vector3(canopy.maxX-canopy.minX,.26,Math.min(2.9,canopy.maxZ-z)),0x8caaa5));
  function beam(a:THREE.Vector3,b:THREE.Vector3,width:number,name:string){const ex=b.clone().sub(a).normalize(),ey=up.clone().addScaledVector(ex,-up.dot(ex)).normalize();component('metal',name,()=>box(details,a.clone().add(b).multiplyScalar(.5),new THREE.Vector3(a.distanceTo(b),width,width),0x887b57,ex,ey),axis,true);}
  const trussRows=[-7.9,-4.4,-.9,2.05],pitch=2.9,lower=5.08,upper=5.99;
  for(const x of trussRows){for(let j=0;j<10;j++){const z0=canopy.minZ+j*pitch,z1=z0+pitch,mid=(z0+z1)/2;beam(world(x,upper,z0),world(x,upper,z1),.12,'truss-upper-chord');beam(world(x,lower,z0),world(x,lower,z1),.12,'truss-lower-chord');beam(world(x,upper,z0),world(x,lower,mid),.105,'truss-diagonal');beam(world(x,lower,mid),world(x,upper,z1),.105,'truss-diagonal');}}
  for(let j=0;j<=10;j++){const z=canopy.minZ+j*pitch;beam(world(trussRows[0],lower,z),world(trussRows.at(-1)!,lower,z),.11,'truss-transverse-chord');if(j<10)beam(world(trussRows[0],lower,z),world(trussRows.at(-1)!,lower,z+pitch),.085,'truss-plan-bracing');}
  shell.userData.truss={rows:trussRows,pitch,lower,upper,bays:10,beamWidth:.105};
  component('glass','gym-entry-door',()=>{box(glass,world(entry.x,entry.floor+entry.height/2,entry.z),new THREE.Vector3(.07,entry.height,entry.width),0x2b4e59);for(const z of [entry.z-entry.width/2,entry.z,entry.z+entry.width/2])box(details,world(entry.x-.05,entry.floor+entry.height/2,z),new THREE.Vector3(.13,entry.height,.065),0x92998d);box(details,world(entry.x-.05,entry.floor+entry.height-.03,entry.z),new THREE.Vector3(.13,.07,entry.width),0x92998d);},axis,false,{entrance:true,outward:axis.clone().negate().toArray()});
  // 광장과 실내 연결부는 현재 DEM에 맞춘 게임용 보행면이다. 원시 지형이나 기준고도를 바꾸지 않는다.
  const approach={startX:-21,endX:-8.5,z0:-42.8,z1:-16.2,platformEndX:5,estimatedGameGroundConnection:true};shell.userData.entrance.approach=approach;
  const floorAt=(x:number,z:number)=>x>=-8.5&&x<=5?Math.max(entry.floor,ground(x,z)+.07):x<-8.5?THREE.MathUtils.lerp(ground(approach.startX,z)+.04,Math.max(entry.floor,ground(-8.5,z)+.07),(x-approach.startX)/(-8.5-approach.startX)):Math.max(entry.floor,ground(x,z)+.07);
  for(let x=approach.startX;x<10;x+=4)for(let z=approach.z0;z<approach.z1;z+=4){const x1=Math.min(10,x+4),z1=Math.min(approach.z1,z+4);rectangularSlab(x,x1,z,z1,floorAt(x,z),floorAt(x1,z),floorAt(x1,z1),floorAt(x,z1),'entrance-plaza');}

  const tileBytes=new Uint8Array(16*32*4);for(let y=0;y<32;y++)for(let x=0;x<16;x++){const at=(y*16+x)*4,value=x===0||y===0?179:242+((x*13+y*7)%11);tileBytes[at]=value;tileBytes[at+1]=value;tileBytes[at+2]=value;tileBytes[at+3]=255;}
  const tileTexture=new THREE.DataTexture(tileBytes,16,32,THREE.RGBAFormat);tileTexture.wrapS=tileTexture.wrapT=THREE.RepeatWrapping;tileTexture.magFilter=THREE.LinearFilter;tileTexture.minFilter=THREE.LinearMipmapLinearFilter;tileTexture.generateMipmaps=true;tileTexture.needsUpdate=true;
  for (const [s, name, roughness] of [[concrete, 'ivory-tiled-walls', .92], [details, 'canopy-and-roofs', .72], [glass, 'glazing', .26]] as const) {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(s.positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(s.colors, 3)); (geometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage); geometry.computeVertexNormals(); geometry.computeBoundingSphere(); geometry.computeBoundingBox(); s.geometry = geometry;
    if(s===concrete){const uv:number[]=[];for(let i=0;i<s.positions.length;i+=9){const a=new THREE.Vector3().fromArray(s.positions,i),b=new THREE.Vector3().fromArray(s.positions,i+3),c=new THREE.Vector3().fromArray(s.positions,i+6),normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize(),useZ=Math.abs(normal.dot(axis))>Math.abs(normal.dot(across));for(const p of[a,b,c])uv.push(p.dot(useZ?across:axis)/.20,p.y/.42);}geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));}
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: s===concrete?tileTexture:null, vertexColors: true, side: THREE.DoubleSide, roughness, metalness: s === glass ? .16 : .02 })); mesh.name = `gym-${name}`; mesh.receiveShadow = true; shell.add(mesh); s.positions.length = 0; s.colors.length = 0;
  }
  function update(_player: THREE.Vector3) { const changed = new Set<Surface>(); for (const part of parts) if (part.shown !== part.proxy.visible) { part.shown = part.proxy.visible; for (const r of part.ranges) { if (r.start === r.end) continue; const attr = r.surface.geometry!.getAttribute('position') as THREE.BufferAttribute; if (!changed.has(r.surface)) attr.clearUpdateRanges(); changed.add(r.surface); if (part.shown) (attr.array as Float32Array).set(r.original, r.start); else for (let i = r.start; i < r.end; i += 3) { attr.array[i] = part.proxy.position.x; attr.array[i + 1] = part.proxy.position.y; attr.array[i + 2] = part.proxy.position.z; } attr.addUpdateRange(r.start, r.end - r.start); } } for (const s of changed) s.geometry!.getAttribute('position').needsUpdate = true; shell.visible = parts.some(p => p.proxy.visible); }
  return { breakables, update };
}
