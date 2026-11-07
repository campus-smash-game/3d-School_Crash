import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { CampusBuilding } from './fullCampus';
import type { BuildingAppearance } from './buildingAppearance';
import type { BreakableSpec } from './scene';

type Point = { x: number; z: number };
type Surface = { positions: number[]; colors: number[]; geometry?: THREE.BufferGeometry };
type Range = { surface: Surface; start: number; end: number; original: Float32Array };
type Part = { proxy: THREE.Mesh; shown: boolean; ranges: Range[] };

// 공식 도면의 열린 중정과 북측 1층/남측 2층을 구분한다. 높이와 상세 좌표는 도면 비례 추정이다.
export function createMuseumLandmark(scene: THREE.Scene, building: CampusBuilding, profile: BuildingAppearance, heightAt: (x: number, z: number) => number) {
  const mapped = building.points.filter((p, i, all) => i !== all.length - 1 || p[0] !== all[0][0] || p[1] !== all[0][1]);
  if (mapped.length < 3) throw new Error('Museum needs a mapped footprint.');
  const cx = mapped.reduce((s, p) => s + p[0], 0) / mapped.length, cz = mapped.reduce((s, p) => s + p[1], 0) / mapped.length, base = heightAt(cx, cz);
  const origin = new THREE.Vector3(303.21, base, -178.95), axis = new THREE.Vector3(79.0, 0, -6.09).normalize(), front = new THREE.Vector3(-axis.z, 0, axis.x), up = new THREE.Vector3(0, 1, 0);
  const world = (x: number, y: number, z: number) => origin.clone().addScaledVector(axis, x).addScaledVector(up, y).addScaledVector(front, z);
  const atES = (e: number, y: number, s: number) => world(e, y, -s);
  const ground = (x: number, z: number) => { const p = world(x, 0, z); return heightAt(p.x, p.z) - base; };
  const points = mapped.map(p => ({ x: (p[0] - origin.x) * axis.x + (p[1] - origin.z) * axis.z, z: (p[0] - origin.x) * front.x + (p[1] - origin.z) * front.z }));
  if (points.reduce((s,p,i)=>{const q=points[(i+1)%points.length];return s+p.x*q.z-q.x*p.z;},0)<0) points.reverse();
  const lowRoof = 5.8, highRoof = 10.8, courtyard = { minX:20.14, maxX:32.45, minZ:-37.15, maxZ:-22.99, estimated:true }, groundFloor=.18;
  const entry = { x:.38,z:-26,width:5.4,floor:groundFloor,height:4.1 }, courtyardDoor={x:courtyard.minX,z:-26,width:3.2,floor:groundFloor,height:4.1};
  const skylights = [{id:'north-1',eastStart:4,eastEnd:54,south:3,roof:lowRoof,radius:3},{id:'north-2',eastStart:4,eastEnd:54,south:10.2,roof:lowRoof,radius:3},{id:'south-1',eastStart:4,eastEnd:54,south:39.8,roof:highRoof,radius:3},{id:'south-2',eastStart:4,eastEnd:54,south:47,roof:highRoof,radius:3}];
  const auditorium={minX:42,maxX:61,minZ:-37.3,maxZ:-22,height:6.45,estimated:true};
  const shell = new THREE.Group(); shell.name = building.id+':museum-landmark';
  Object.assign(shell.userData,{buildingId:building.id,role:'building-shell',landmark:'museum',appearance:profile,localOrigin:{x:origin.x,y:base,z:origin.z},baseSample:{x:cx,z:cz},axis:{x:axis.x,z:axis.z},frontFacing:{x:-axis.x,z:-axis.z},mappedOutline:mapped.map(p=>p.slice()),mappedOutlinePreserved:true,levels:{aboveGround:2,belowGround:1,northExhibition:1,southExhibition:2},heightEstimated:true,detailDimensionsEstimated:true,roofHeight:13.8,lowRoofHeight:lowRoof,highRoofHeight:highRoof,courtyard,entry,courtyardDoor,skylights,auditorium,basementInteriorModeled:false,sourceDatumPreserved:true,skylightGlassFaces:'north',skylightCopperDescends:'south',stairOutlineMismatchDocumented:true,modelCoordinates:'D=(east,up,north); parent H is applied once after construction.'});
  scene.add(shell); const distant=new THREE.Group();distant.visible=false;Object.assign(distant.userData,{buildingId:building.id,role:'distant-building',landmark:'museum'});scene.add(distant);
  const wall: Surface = { positions: [], colors: [] }, details: Surface = { positions: [], colors: [] }, glass: Surface = { positions: [], colors: [] }, surfaces = [wall, details, glass];
  const parts: Part[] = [], breakables: BreakableSpec[] = [], cube = new THREE.BoxGeometry(1, 1, 1), cubeVertices = cube.toNonIndexed().getAttribute('position');
  const materials = { stone: new THREE.MeshStandardMaterial({ color: 0xcac9bd }), metal: new THREE.MeshStandardMaterial({ color: 0x414c4c }), glass: new THREE.MeshStandardMaterial({ color: 0x49777f }) };
  function tri(s: Surface, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: number) { const tint = new THREE.Color(color); for (const p of [a, b, c]) { s.positions.push(p.x, p.y, p.z); s.colors.push(tint.r, tint.g, tint.b); } }
  function quad(s: Surface, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, color: number) { tri(s, a, b, c, color); tri(s, a, c, d, color); }
  function box(s: Surface, center: THREE.Vector3, size: THREE.Vector3, color: number, ex = axis, ey = up) {
    const ez = new THREE.Vector3().crossVectors(ex, ey).normalize(), tint = new THREE.Color(color);
    for (let i = 0; i < cubeVertices.count; i++) { const p = center.clone().addScaledVector(ex, cubeVertices.getX(i) * size.x).addScaledVector(ey, cubeVertices.getY(i) * size.y).addScaledVector(ez, cubeVertices.getZ(i) * size.z); s.positions.push(p.x, p.y, p.z); s.colors.push(tint.r, tint.g, tint.b); }
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
    Object.assign(proxy.userData, { buildingId: building.id, landmark: 'museum', renderProxy: true, component: name, convex, ...extra }); proxy.updateMatrix(); proxy.updateMatrixWorld(true);
    parts.push({ proxy, shown: true, ranges }); breakables.push({ mesh: proxy, size, collisionVertices, toughness: kind === 'glass' ? 6 : 11, material: kind, label: building.name });
  }
  function clip(poly: Point[], coordinate: 'x' | 'z', value: number, greater: boolean) { const out: Point[] = []; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], ia = greater ? a[coordinate] >= value : a[coordinate] <= value, ib = greater ? b[coordinate] >= value : b[coordinate] <= value; if (ia) out.push(a); if (ia !== ib) { const t = (value - a[coordinate]) / (b[coordinate] - a[coordinate]); out.push({ x: THREE.MathUtils.lerp(a.x, b.x, t), z: THREE.MathUtils.lerp(a.z, b.z, t) }); } } return out; }
  function slab(poly: Point[], ys: number[], thickness: number, color: number, name: string, extra: Record<string, unknown> = {}) {
    if (poly.length < 3) return;
    component('stone', name, () => { const top = poly.map((p, i) => world(p.x, ys[i], p.z)), bottom = top.map(p => p.clone().addScaledVector(up, -thickness)); for (let i = 1; i < poly.length - 1; i++) { tri(details, top[0], top[i + 1], top[i], color); tri(details, bottom[0], bottom[i], bottom[i + 1], color); } for (let i = 0; i < poly.length; i++) { const j = (i + 1) % poly.length; quad(details, bottom[i], bottom[j], top[j], top[i], color); } }, axis, true, extra);
  }
  function wallBox(s: Surface, at: (u: number, y: number, depth?: number) => THREE.Vector3, tangent: THREE.Vector3, a: number, b: number, bottom: number, top: number, depth: number, thickness: number, color: number) { if (b - a > .005 && top - bottom > .005) box(s, at((a + b) / 2, (bottom + top) / 2, depth), new THREE.Vector3(b - a, top - bottom, thickness), color, tangent); }
  function ribbon(at: (u: number, y: number, depth?: number) => THREE.Vector3, tangent: THREE.Vector3, a: number, b: number, bottom: number, top: number, depth: number, horizontalPanes: number, tint: number) {
    if (b - a < .08 || top - bottom < .08) return;
    quad(glass, at(a, bottom, depth), at(a, top, depth), at(b, top, depth), at(b, bottom, depth), tint);
    const n = Math.max(2, Math.round((b - a) / 1.25));
    for (let k = 0; k <= n; k++) { const u = THREE.MathUtils.lerp(a, b, k / n); quad(details, at(u - .034, bottom, depth + .065), at(u - .034, top, depth + .065), at(u + .034, top, depth + .065), at(u + .034, bottom, depth + .065), 0x293f43); }
    for (let k = 0; k <= horizontalPanes; k++) { const y = THREE.MathUtils.lerp(bottom, top, k / horizontalPanes); wallBox(details, at, tangent, a, b, y - .035, y + .035, depth + .055, .065, 0x314b50); }
  }
  const rect = (minX:number,maxX:number,minZ:number,maxZ:number):Point[] => [{x:minX,z:minZ},{x:maxX,z:minZ},{x:maxX,z:maxZ},{x:minX,z:maxZ}];
  const yardRing=rect(courtyard.minX,courtyard.maxX,courtyard.minZ,courtyard.maxZ);
  const skylightHoles=skylights.map(s=>rect(s.eastStart,s.eastEnd,-s.south-s.radius,-s.south));
  const roofHeightAt=(x:number,z:number)=> z < -38.3129 || (x < .03 && z < -30.82) ? highRoof : x>auditorium.minX&&x<auditorium.maxX&&z>auditorium.minZ&&z<auditorium.maxZ ? auditorium.height : lowRoof;
  function triangulate(holes:Point[][]) { const all=points.concat(...holes); return THREE.ShapeUtils.triangulateShape(points.map(p=>new THREE.Vector2(p.x,p.z)),holes.map(h=>h.map(p=>new THREE.Vector2(p.x,p.z)))).map(t=>t.map(i=>all[i])); }
  // 중정과 천창 아래는 지붕과 물리 형상에서 함께 뺀다. 기존 지도와 지형 원문은 보존한다.
  const roofTriangles=triangulate([yardRing,...skylightHoles]), cutsX=[-9,.03,42,61,80],cutsZ=[-61,-38.3129,-37.3,-30.82,-22,1];
  for(const triangle of roofTriangles)for(let ix=0;ix<cutsX.length-1;ix++)for(let iz=0;iz<cutsZ.length-1;iz++){
    let poly=triangle;for(const [key,value,greater]of [['x',cutsX[ix],true],['x',cutsX[ix+1],false],['z',cutsZ[iz],true],['z',cutsZ[iz+1],false]]as const)poly=clip(poly,key,value,greater);
    if(poly.length<3||Math.abs(poly.reduce((s,p,i)=>{const q=poly[(i+1)%poly.length];return s+p.x*q.z-q.x*p.z;},0))<.015)continue;
    const x=poly.reduce((s,p)=>s+p.x,0)/poly.length,z=poly.reduce((s,p)=>s+p.z,0)/poly.length,y=roofHeightAt(x,z);
    slab(poly,poly.map(()=>y),.26,y>10?0x929b85:0x6b9b87,'mapped-roof-panel',{roofHeight:y});
  }
  for(const poly of triangulate([yardRing])) slab(poly,poly.map(()=>groundFloor),.24,0xb6b6a5,'ground-floor-panel');
  // 높은 남측 전시실의 중간 바닥이다. 서쪽 계단실은 뚫어 둔다.
  for(const triangle of triangulate([yardRing])){
    let poly=clip(triangle,'z',-38.3129,false);poly=clip(poly,'x',1.0,true);if(poly.length<3)continue;
    if(Math.abs(poly.reduce((s,p,i)=>{const q=poly[(i+1)%poly.length];return s+p.x*q.z-q.x*p.z;},0))>.02)slab(poly,poly.map(()=>5.55),.23,0xb2b5a8,'south-upper-floor');
  }
  function stoneSeams(at:(u:number,y:number,d?:number)=>THREE.Vector3,tangent:THREE.Vector3,a:number,b:number,bottom:number,top:number,depth:number){
    for(let y=Math.ceil(bottom/.65)*.65;y<top;y+=.65)quad(details,at(a,y-.008,depth),at(a,y+.008,depth),at(b,y+.008,depth),at(b,y-.008,depth),0xa9aa9b);
    for(let u=a+1.2;u<b;u+=1.2)quad(details,at(u-.008,bottom,depth),at(u-.008,top,depth),at(u+.008,top,depth),at(u+.008,bottom,depth),0xa8aa9b);
  }
  // 서쪽 전시 벽은 무창 석재이며 동쪽과 남쪽 후면은 입면도에 맞춰 두 행의 창을 둔다.
  for(let edge=0;edge<points.length;edge++){
    const a=points[edge],b=points[(edge+1)%points.length],length=Math.hypot(b.x-a.x,b.z-a.z),dx=(b.x-a.x)/length,dz=(b.z-a.z)/length;
    const tangent=axis.clone().multiplyScalar(dx).addScaledVector(front,dz),outward=new THREE.Vector3().crossVectors(tangent,up).negate();
    const localOut={x:dz,z:-dx},at=(u:number,y:number,d=0)=>world(a.x+dx*u,y,a.z+dz*u).addScaledVector(outward,d);
    const segments=new Set<number>([0,length]),count=Math.max(1,Math.ceil(length/7.2));for(let i=1;i<count;i++)segments.add(length*i/count);
    if(Math.abs(dz)>.02)for(const z of [-38.3129,-30.82,-20.36]){const u=(z-a.z)/dz;if(z===-38.3129&&Math.max(a.x,b.x)<.03)continue;if(u>0&&u<length)segments.add(u);}
    const sorted=[...segments].sort((x,y)=>x-y);
    for(let j=0;j<sorted.length-1;j++){
      const u0=sorted[j],u1=sorted[j+1],m=(u0+u1)/2,x=a.x+dx*m,z=a.z+dz*m;if(u1-u0<.04)continue;
      if(localOut.x<-.95&&Math.abs(x)<.1&&z> -30.82&&z< -20.36)continue;
      const height=roofHeightAt(x,z),groundMin=Math.min(...[u0,m,u1].map(u=>{const p=at(u,0);return heightAt(p.x,p.z)-base;})),foundation=Math.min(-.45,groundMin-.35),rows=height>8?2:1;
      const rear=(localOut.x>.7&&x>55)||(localOut.z<-.7&&x>14)||(localOut.z>.7&&x>56);
      for(let row=0;row<rows;row++){
        const bottom=row?5.55:foundation,top=rows===2&&row===0?5.55:height-.34;
        if(rear&&u1-u0>.9){const samples=Math.max(2,Math.ceil((u1-u0)/.7)),groundMax=Math.max(...Array.from({length:samples+1},(_,k)=>{const p=at(THREE.MathUtils.lerp(u0,u1,k/samples),0,-.24);return heightAt(p.x,p.z)-base;}));const sill=Math.max(row?6.3:1.0,groundMax+.14),head=Math.min(top-.5,row?9.1:4.05);
          component('glass','rear-window-bay',()=>{
            wallBox(wall,at,tangent,u0,u1,bottom,Math.min(sill,top),-.22,.44,0xc8c7b7);wallBox(wall,at,tangent,u0,u1,Math.max(head,bottom),top,-.22,.44,0xcecdbc);
            const inset=Math.min(.6,(u1-u0)*.18);for(const [v0,v1]of [[u0,u0+inset],[u1-inset,u1]])wallBox(wall,at,tangent,v0,v1,sill,head,-.22,.44,0xc8c7b7);
            if(head>sill+.12)ribbon(at,tangent,u0+inset,u1-inset,sill,head,-.25,1,0x577c7c);
            stoneSeams(at,tangent,u0,u1,bottom,Math.min(sill,top),.004);stoneSeams(at,tangent,u0,u1,Math.max(head,bottom),top,.004);
          },tangent,false,{row,outward:outward.toArray(),terrainClipped:row===0});
        }else { const label=row===1&&x< -7.5&&z> -40&&z< -36;
          component('stone',x<0&&z< -30.8?'curved-stair-stone-wall':'exhibition-stone-wall',()=>{
            wallBox(wall,at,tangent,u0,u1,bottom,top,-.25,.5,0xcfccbc);stoneSeams(at,tangent,u0,u1,bottom,top,.007);
            if(label){const middle=(u0+u1)/2,centers=[middle-.47,middle+.47],digitWidth=.66,digitBottom=9.15,digitTop=10.05,midY=(digitBottom+digitTop)/2,stroke=.085;const segmentsByDigit=[[0,1,2],[0,1,2,3,4,5]];
              for(let digit=0;digit<2;digit++){const left=centers[digit]-digitWidth/2,right=centers[digit]+digitWidth/2;const bars=[[left,right,digitTop-stroke,digitTop],[right-stroke,right,midY,digitTop],[right-stroke,right,digitBottom,midY],[left,right,digitBottom,digitBottom+stroke],[left,left+stroke,digitBottom,midY],[left,left+stroke,midY,digitTop]];for(const k of segmentsByDigit[digit]){const [a,b,c,d]=bars[k];quad(details,at(a,c,.026),at(a,d,.026),at(b,d,.026),at(b,c,.026),0x397d7c);}}
              shell.userData.numberLabel={text:'70',glyphCenters:centers.map(u=>at(u,midY,.026).toArray()),horizontal:tangent.toArray(),outward:outward.toArray(),segments:9,attachedToWallPart:true};
            }
          },tangent,false,{row,outward:outward.toArray(),sourceOutlineEdge:[a.x,a.z,b.x,b.z],numberLabel:label?'70':undefined});
        }
      }
      component('metal','dark-wall-coping',()=>wallBox(details,at,tangent,u0,u1,height-.34,height+.10,-.14,.62,0x4b5145),tangent);
    }
  }
  // 강당 지붕은 사진과 단면에서 보이는 낮은 단차만 반영한다. 정확한 높이는 미확인이다.
  for(const [a,b]of [[{x:auditorium.minX,z:auditorium.minZ},{x:auditorium.maxX,z:auditorium.minZ}],[{x:auditorium.maxX,z:auditorium.minZ},{x:auditorium.maxX,z:auditorium.maxZ}],[{x:auditorium.maxX,z:auditorium.maxZ},{x:auditorium.minX,z:auditorium.maxZ}],[{x:auditorium.minX,z:auditorium.maxZ},{x:auditorium.minX,z:auditorium.minZ}]]){
    const ex=axis.clone().multiplyScalar(b.x-a.x).addScaledVector(front,b.z-a.z),length=ex.length();ex.normalize();component('stone','auditorium-roof-upstand',()=>box(wall,world((a.x+b.x)/2,(lowRoof+auditorium.height)/2,(a.z+b.z)/2),new THREE.Vector3(length,auditorium.height-lowRoof,.22),0xc5c4b3,ex),ex);
  }
  const smoothNormals:{surface:Surface;vertex:number;normal:THREE.Vector3}[]=[];
  function smoothQuad(s:Surface,vertices:THREE.Vector3[],normals:THREE.Vector3[],color:number){const start=s.positions.length/3;quad(s,vertices[0],vertices[1],vertices[2],vertices[3],color);[0,1,2,0,2,3].forEach((k,i)=>smoothNormals.push({surface:s,vertex:start+i,normal:normals[k]}));}
  // 곡면을 얇은 사분원 판으로 나눈다. 각 판의 볼록 충돌체는 천창의 빈 안쪽을 가로막지 않는다.
  for(const sky of skylights){
    const length=sky.eastEnd-sky.eastStart,along=7,radial=24,chunks=8,arc=(e:number,t:number,r=sky.radius)=>atES(e,sky.roof+r*Math.cos(t),sky.south+r*Math.sin(t)),normal=(t:number)=>front.clone().multiplyScalar(-Math.sin(t)).addScaledVector(up,Math.cos(t));
    for(let j=0;j<along;j++){
      const e0=sky.eastStart+length*j/along,e1=sky.eastStart+length*(j+1)/along;
      for(let chunk=0;chunk<chunks;chunk++)component('metal','quarter-circle-copper-panel',()=>{
        for(let k=chunk*radial/chunks;k<(chunk+1)*radial/chunks;k++){
          const t0=k*Math.PI/2/radial,t1=(k+1)*Math.PI/2/radial,verts=[arc(e0,t0),arc(e1,t0),arc(e1,t1),arc(e0,t1)],normals=[normal(t0),normal(t0),normal(t1),normal(t1)];smoothQuad(details,verts,normals,j%2?0x72978a:0x6b9183);
          const inner=[arc(e0,t0,sky.radius-.09),arc(e0,t1,sky.radius-.09),arc(e1,t1,sky.radius-.09),arc(e1,t0,sky.radius-.09)];smoothQuad(details,inner,[normal(t0).negate(),normal(t1).negate(),normal(t1).negate(),normal(t0).negate()],0x526d61);
          for(const e of [e0,e1])quad(details,arc(e,t0),arc(e,t1),arc(e,t1,sky.radius-.09),arc(e,t0,sky.radius-.09),0x4b7062);
        }
        for(const t of [chunk*Math.PI/2/chunks,(chunk+1)*Math.PI/2/chunks])quad(details,arc(e0,t),arc(e0,t,sky.radius-.09),arc(e1,t,sky.radius-.09),arc(e1,t),0x668677);
      },axis,true,{skylightId:sky.id,angularChunk:chunk,alongChunk:j,quarterCircle:true,thickness:.09});
      component('glass','skylight-north-glass',()=>{
        const y0=sky.roof+.07,y1=sky.roof+sky.radius-.04;
        quad(glass,atES(e0,y0,sky.south),atES(e1,y0,sky.south),atES(e1,y1,sky.south),atES(e0,y1,sky.south),0x587b75);
        const n=Math.max(2,Math.round((e1-e0)/1.1));for(let k=0;k<=n;k++)box(details,atES(THREE.MathUtils.lerp(e0,e1,k/n),(y0+y1)/2,sky.south-.035),new THREE.Vector3(.055,y1-y0,.08),0x3c5b51);
        for(const y of [y0,y1])box(details,atES((e0+e1)/2,y,sky.south-.035),new THREE.Vector3(e1-e0,.065,.08),0x36564d);
      },axis,false,{skylightId:sky.id,outward:front.toArray()});
    }
    for(const [e,sign]of [[sky.eastStart,-1],[sky.eastEnd,1]])component('metal','skylight-quarter-endcap',()=>{
      const center=atES(e,sky.roof,sky.south),ring=Array.from({length:radial+1},(_,k)=>arc(e,k*Math.PI/2/radial));
      for(let k=0;k<radial;k++){const a=ring[k],b=ring[k+1],c=center;const desired=axis.clone().multiplyScalar(sign);if(b.clone().sub(a).cross(c.clone().sub(a)).dot(desired)>0)tri(details,a,b,c,0x4e7364);else tri(details,a,c,b,0x4e7364);}
      const inset=.07*sign,other=ring.map(p=>p.clone().addScaledVector(axis,inset)),otherCenter=center.clone().addScaledVector(axis,inset);
      for(let k=0;k<radial;k++){tri(details,otherCenter,other[k],other[k+1],0x4a6a5e);quad(details,ring[k],other[k],other[k+1],ring[k+1],0x577968);}quad(details,center,ring[0],other[0],otherCenter,0x577968);quad(details,center,otherCenter,other[radial],ring[radial],0x577968);
    },axis,true,{skylightId:sky.id});
  }
  // 현관과 중정 유리는 서로 다른 파괴 부품이다. 현관을 연 뒤 로비와 중정에 접근할 수 있다.
  function westGlazing(x:number,z0:number,z1:number,bottom:number,top:number,name:string,door=false){
    const width=z1-z0;if(width<.08)return;
    component('glass',name,()=>{box(glass,world(x,(bottom+top)/2,(z0+z1)/2),new THREE.Vector3(.07,top-bottom,width),0x547773);for(let z=z0;z<=z1+.01;z+=door?width/2:Math.max(.7,width/Math.ceil(width/1.3)))box(details,world(x-.055,(bottom+top)/2,Math.min(z,z1)),new THREE.Vector3(.12,top-bottom,.055),0x77877e);for(const y of [bottom,top])box(details,world(x-.055,y,(z0+z1)/2),new THREE.Vector3(.12,.07,width),0x687e73);},axis,false,{entrance:door});
  }
  westGlazing(entry.x,-30.82,entry.z-entry.width/2,groundFloor,4.3,'front-lobby-glazing');westGlazing(entry.x,entry.z+entry.width/2,-20.36,groundFloor,4.3,'front-lobby-glazing');
  westGlazing(entry.x,entry.z-entry.width/2,entry.z+entry.width/2,entry.floor,entry.floor+entry.height,'west-main-entrance-door',true);
  component('stone','entrance-stone-fascia',()=>{box(wall,world(.10,5.03,-25.59),new THREE.Vector3(.65,1.54,10.46),0xcfcab6);box(details,world(-.08,5.69,-25.59),new THREE.Vector3(.76,.22,10.70),0x4c584a);});
  for(const [a,b]of [[yardRing[0],yardRing[1]],[yardRing[1],yardRing[2]],[yardRing[2],yardRing[3]],[yardRing[3],yardRing[0]]]){
    const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz),tangent=axis.clone().multiplyScalar(dx/length).addScaledVector(front,dz/length),out=new THREE.Vector3().crossVectors(tangent,up).normalize(),at=(u:number,y:number,d=0)=>world(a.x+dx*u/length,y,a.z+dz*u/length).addScaledVector(out,d);
    const west=Math.abs(a.x-courtyard.minX)<.001&&Math.abs(b.x-courtyard.minX)<.001;
    if(west){westGlazing(courtyard.minX,courtyard.minZ,courtyardDoor.z-courtyardDoor.width/2,groundFloor,4.4,'courtyard-west-glazing');westGlazing(courtyard.minX,courtyardDoor.z+courtyardDoor.width/2,courtyard.maxZ,groundFloor,4.4,'courtyard-west-glazing');westGlazing(courtyardDoor.x,courtyardDoor.z-courtyardDoor.width/2,courtyardDoor.z+courtyardDoor.width/2,groundFloor,4.4,'courtyard-entry-door',true);}
    else for(let u=0;u<length;u+=4.5){const end=Math.min(length,u+4.5);component('glass','courtyard-glass-wall',()=>ribbon(at,tangent,u,end,groundFloor+.08,4.4,.02,1,0x668c7f),tangent,false,{outward:out.toArray()});}
    component('stone','courtyard-roof-edge',()=>wallBox(wall,at,tangent,0,length,4.4,lowRoof,.02,.32,0xc8c7b4),tangent);
  }
  // 앞마당의 긴 낮은 경사는 현재 게임 DEM에 맞춘 접근면이다. 사진에서 확인한 계단과 평면 비례는 추정이다.
  const plaza={startX:-22,endX:.65,minZ:-36,maxZ:-15,startY:-1.50,endY:groundFloor,estimatedGameGroundConnection:true};
  for(let x=plaza.startX;x<plaza.endX;x+=4.5){const end=Math.min(plaza.endX,x+4.5),y0=THREE.MathUtils.lerp(plaza.startY,plaza.endY,(x-plaza.startX)/(plaza.endX-plaza.startX)),y1=THREE.MathUtils.lerp(plaza.startY,plaza.endY,(end-plaza.startX)/(plaza.endX-plaza.startX));for(let z=plaza.minZ;z<plaza.maxZ;z+=7){const endZ=Math.min(plaza.maxZ,z+7);slab(rect(x,end,z,endZ),[y0,y1,y1,y0],.24,0xb0b3a0,'front-plaza-panel');}}
  const stair={startX:-34,endX:plaza.startX,centerZ:-25.5,width:21,bottom:0,top:plaza.startY,steps:14,estimated:true};stair.bottom=Math.max(...[-.5,0,.5].map(k=>ground(stair.startX,stair.centerZ+stair.width*k)))+.06;
  for(let i=0;i<stair.steps;i++){const x0=THREE.MathUtils.lerp(stair.startX,stair.endX,i/stair.steps),x1=THREE.MathUtils.lerp(stair.startX,stair.endX,(i+1)/stair.steps),y=THREE.MathUtils.lerp(stair.bottom,stair.top,(i+1)/stair.steps);slab(rect(x0,x1,stair.centerZ-stair.width/2,stair.centerZ+stair.width/2),[y,y,y,y],.22,0xb9bbaa,'front-wide-stair-step',{stairIndex:i});}
  for(let j=0;j<7;j++){const z0=stair.centerZ-stair.width/2+stair.width*j/7,z1=z0+stair.width/7,x0=stair.startX-3;const poly=rect(x0,stair.startX,z0,z1),y0=ground(x0,z0)+.04,y1=ground(x0,z1)+.04;slab([poly[0],poly[1],poly[2]],[y0,stair.bottom,stair.bottom],.17,0xa6ad9a,'front-stair-ground-connection');slab([poly[0],poly[2],poly[3]],[y0,stair.bottom,y1],.17,0xa6ad9a,'front-stair-ground-connection');}
  Object.assign(shell.userData,{stair,plaza,entranceToCourtyardPath:[{x:-1,z:entry.z},{x:4,z:entry.z},{x:courtyard.minX-1,z:courtyardDoor.z},{x:courtyard.minX+2,z:courtyardDoor.z}],roofHoles:[courtyard,...skylights.map(s=>({minX:s.eastStart,maxX:s.eastEnd,minZ:-s.south-s.radius,maxZ:-s.south}))]});
  for (const [s, name, roughness] of [[wall, 'stone-envelope', .88], [details, 'copper-and-frames', .58], [glass, 'glazing', .25]] as const) {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(s.positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(s.colors, 3)); (geometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage); geometry.computeVertexNormals();
    const normals=geometry.getAttribute('normal')as THREE.BufferAttribute;for(const n of smoothNormals)if(n.surface===s)normals.setXYZ(n.vertex,n.normal.x,n.normal.y,n.normal.z);
    geometry.computeBoundingSphere(); geometry.computeBoundingBox(); s.geometry = geometry;
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness, metalness: s === details ? .24 : s===glass?.12:.01 })); mesh.name = `museum-${name}`; mesh.receiveShadow = true; shell.add(mesh); s.positions.length = 0; s.colors.length = 0;
  }
  function update(_player: THREE.Vector3) { const changed = new Set<Surface>(); for (const part of parts) if (part.shown !== part.proxy.visible) { part.shown = part.proxy.visible; for (const r of part.ranges) { if (r.start === r.end) continue; const attr = r.surface.geometry!.getAttribute('position') as THREE.BufferAttribute; if (!changed.has(r.surface)) attr.clearUpdateRanges(); changed.add(r.surface); if (part.shown) (attr.array as Float32Array).set(r.original, r.start); else for (let i = r.start; i < r.end; i += 3) { attr.array[i] = part.proxy.position.x; attr.array[i + 1] = part.proxy.position.y; attr.array[i + 2] = part.proxy.position.z; } attr.addUpdateRange(r.start, r.end - r.start); } } for (const s of changed) s.geometry!.getAttribute('position').needsUpdate = true; shell.visible = parts.some(p => p.proxy.visible); }
  return {breakables,update};
}
