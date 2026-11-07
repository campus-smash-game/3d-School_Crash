import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import { EDUCATION12_SITE, education12RoadsideSection } from './education12Site';

type XZ = [number, number];
export type Education12RoadsideStairLayout = { points: XZ[]; bottomY: number; topY: number; width: number; count: number; upperEnd: XZ };
type Bucket = { positions: number[]; colors: number[]; uvs: number[]; geometry?: THREE.BufferGeometry };
type Part = { mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>; ranges: { bucket: Bucket; start: number; end: number; original: Float32Array }[]; shown: boolean; base: number; tint: number };
const A: XZ = [595.48, -787.47], B: XZ = [586.86, -800.7];
const length = Math.hypot(B[0] - A[0], B[1] - A[1]);
export const PASCUCCI111_SITE = { buildingId: 'way/439707885', origin: A, axis: [(B[0] - A[0]) / length, (B[1] - A[1]) / length] as XZ, length, depth: 8.66, dimensionsEstimated: true };
export function pascucci111Point(u: number, v: number): XZ { const [ax, az] = PASCUCCI111_SITE.axis; return [A[0] + ax * u - az * v, A[1] + az * u + ax * v]; }

/** 2025년 7월 로드뷰 전면과 촬영일 미상의 공식 사진을 구분해 반영한다. */
export function createPascucci111Landmark(scene: THREE.Scene, heightAt: (x: number, z: number) => number, floorY?: number, roadside?: Education12RoadsideStairLayout) {
  const y = floorY ?? heightAt(...pascucci111Point(length / 2, 0)), shell = new THREE.Group();
  shell.name = 'landmark/pascucci111'; Object.assign(shell.userData, { buildingId: PASCUCCI111_SITE.buildingId, role: 'building-shell', landmark: 'pascucci111', coordinates: 'D; parent H applies once.' }); scene.add(shell);
  const distant = new THREE.Group(); distant.name = `${PASCUCCI111_SITE.buildingId}:pascucci111-distant`; distant.visible = false; Object.assign(distant.userData, { buildingId: PASCUCCI111_SITE.buildingId, role: 'distant-building', landmark: 'pascucci111' }); scene.add(distant);
  const buckets: Bucket[] = Array.from({ length: 3 }, () => ({ positions: [], colors: [], uvs: [] })), [stone, metal, glass] = buckets;
  const parts: Part[] = [], breakables: BreakableSpec[] = [], pavementMasks: { component: string; polygon: XZ[] }[] = [];
  const axis = new THREE.Vector3(...[PASCUCCI111_SITE.axis[0], 0, PASCUCCI111_SITE.axis[1]]), up = new THREE.Vector3(0, 1, 0), across = new THREE.Vector3(-axis.z, 0, axis.x);
  const rotation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(axis, up, across));
  const point = (u: number, h: number, v: number) => { const p = pascucci111Point(u, v); return new THREE.Vector3(p[0], h, p[1]); };
  function append(bucket: Bucket, geometry: THREE.BufferGeometry, color: number, paving = false) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry, p = g.getAttribute('position'), norm = g.getAttribute('normal'), c = new THREE.Color(color);
    for (let i = 0; i < p.count; i++) { const dx = p.getX(i) - A[0], dz = p.getZ(i) - A[1]; bucket.positions.push(p.getX(i), p.getY(i), p.getZ(i)); bucket.colors.push(c.r, c.g, c.b); bucket.uvs.push(...(paving && norm.getY(i) > .7 ? [(dx * axis.x + dz * axis.z) / 1.2, (dx * across.x + dz * across.z) / 1.2] : [.995, .995])); }
    if (g !== geometry) g.dispose();
  }
  function part(component: string, geometry: THREE.BufferGeometry, center: THREE.Vector3, quaternion: THREE.Quaternion, size: THREE.Vector3, color: number, bucket = stone, material: BreakableSpec['material'] = 'stone', convex = false, paving = false, decor?: () => void) {
    const starts = buckets.map(b => b.positions.length), mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color })); mesh.position.copy(center); mesh.quaternion.copy(quaternion); mesh.updateMatrixWorld(true);
    Object.assign(mesh.userData, { buildingId: PASCUCCI111_SITE.buildingId, landmark: 'pascucci111', component, renderProxy: true, convex, collisionShape: convex ? 'convex-hull' : 'oriented-cuboid' });
    const g = geometry.clone().applyMatrix4(mesh.matrixWorld); append(bucket, g, color, paving); g.dispose(); decor?.();
    parts.push({ mesh, ranges: buckets.map((b, i) => ({ bucket: b, start: starts[i], end: b.positions.length, original: Float32Array.from(b.positions.slice(starts[i])) })), shown: true, base: color, tint: color });
    breakables.push({ mesh, size, collisionVertices: convex ? Float32Array.from(geometry.getAttribute('position').array) : undefined, toughness: material === 'glass' ? 2 : 8, material, label: '111동 카페' }); return mesh;
  }
  function box(component: string, u0: number, u1: number, v0: number, v1: number, h0: number, h1: number, color: number, bucket = stone, material: BreakableSpec['material'] = 'stone', paving = false, decor?: () => void) {
    const size = new THREE.Vector3(u1 - u0, h1 - h0, v1 - v0);
    return part(component, new THREE.BoxGeometry(size.x, size.y, size.z), point((u0 + u1) / 2, (h0 + h1) / 2, (v0 + v1) / 2), rotation, size, color, bucket, material, false, paving, decor);
  }
  function bar(component: string, a: THREE.Vector3, b: THREE.Vector3, radius: number, color: number, decoration = false) {
    const delta = b.clone().sub(a), q = new THREE.Quaternion().setFromUnitVectors(up, delta.clone().normalize()), center = a.clone().add(b).multiplyScalar(.5), geometry = new THREE.CylinderGeometry(radius, radius, delta.length(), 10);
    if (decoration) { geometry.applyQuaternion(q).translate(center.x, center.y, center.z); append(metal, geometry, color); geometry.dispose(); return; }
    part(component, geometry, center, q, new THREE.Vector3(radius * 2, delta.length(), radius * 2), color, metal, 'metal', true);
  }
  function slab(component: string, u0: number, u1: number, v0: number, v1: number, top: number, paving = false) { return box(component, u0, u1, v0, v1, top - .22, top, paving ? 0x8e9695 : 0xb4b6ac, stone, 'stone', paving); }
  const door = { u0: 10.4, u1: 12.4, v: .04, height: 2.65 };
  // 전면 오른쪽은 지붕 아래의 야외 공간이므로 유리벽으로 막지 않는다.
  slab('cafe-lower-floor', 0, length, 0, 8.66, y, true);
  slab('cafe-upper-floor', -.12, length + .12, -.1, 8.8, y + 3.55);
  const roof = slab('cafe-flat-roof', -.45, length + .45, -.42, 9.0, y + 7.45);
  for (let u = 0; u < length; u += 2.7) box('cafe-roof-edge', u, Math.min(u + 2.7, length), -.43, -.27, y + 7.22, y + 7.62, 0x9ba8ac, metal, 'metal');
  for (let u = 0; u < length; u += 2.6) { const end = Math.min(length, u + 2.6); box('cafe-back-wall', u, end, 8.51, 8.76, y, y + 7.23, 0x998c7c); }
  for (const u of [0, length]) for (let v = 0; v < 8.5; v += 2.8) {
    if (u === length && v < 5.5) continue;
    box('cafe-side-wall', u - .12, u + .12, v, Math.min(v + 2.8, 8.66), y, y + 3.33, 0x94796c);
  }
  box('cafe-front-brick', -.1, 2.5, -.1, .18, y, y + 3.33, 0x8c786a, stone, 'stone', false, () => {
    for(let row=0;row<35;row++){
      const h=y+row*.095,g=new THREE.BoxGeometry(2.6,.008,.012).applyQuaternion(rotation);g.translate(...point(1.2,h,-.107).toArray());append(stone,g,0xc4bbab);g.dispose();
      for(let u=-.1+(row%2)*.16;u<2.5;u+=.32){const joint=new THREE.BoxGeometry(.008,.087,.012).applyQuaternion(rotation);joint.translate(...point(u,h+.047,-.107).toArray());append(stone,joint,0xb9b19f);joint.dispose();}
    }
  });
  for (let u = 2.5; u < 10.4; u += 1.55) {
    box('cafe-ground-glass', u + .035, Math.min(u + 1.515, 10.4), -.015, .055, y + .10, y + 3.3, 0x567376, glass, 'glass');
    box('cafe-ground-mullion', u, u + .035, -.08, .10, y + .05, y + 3.33, 0xabb9b7, metal, 'metal');
  }
  const entry = box('cafe-glass-door', door.u0, door.u1, door.v - .04, door.v + .04, y, y + door.height, 0x557b7a, glass, 'glass', false, () => {
    for (const u of [door.u0 + .04, (door.u0 + door.u1) / 2, door.u1 - .04]) { const g = new THREE.BoxGeometry(.045, door.height, .09).applyQuaternion(rotation); g.translate(...point(u, y + door.height / 2, -.025).toArray()); append(metal, g, 0xabb9b7); g.dispose(); }
    for (const u of [11.25, 11.55]) bar('cafe-door-handle', point(u, y + .85, -.13), point(u, y + 1.5, -.13), .022, 0xd2d6c9, true);
  });
  box('cafe-entry-transom', door.u0, door.u1, -.035, .07, y + door.height + .05, y + 3.33, 0x6d8c8b, glass, 'glass');
  // 오른쪽 기둥 아래 공간은 공식 사진에서도 확인된다. 내부 배치는 확인하지 못했다.
  for (const v of [.35, 5.2]) bar('cafe-porch-column', point(length - .25, y, v), point(length - .25, y + 3.33, v), .16, 0xb9c1ba);
  for (const v of [0, 8.66]) for (let u = 0; u < length; u += 1.32) {
    const end = Math.min(length, u + 1.32);
    box('cafe-upper-glass', u + .055, end - .055, v - .035, v + .035, y + 3.67, y + 7.2, 0x668d90, glass, 'glass');
    box('cafe-timber-fin', u, u + .09, v - .19, v + .12, y + 3.6, y + 7.23, 0x706451, metal, 'wood');
  }
  for (const u of [0, length]) for (let v = 0; v < 8.65; v += 1.3) box('cafe-upper-side-glass', u - .035, u + .035, v + .035, Math.min(v + 1.265, 8.65), y + 3.67, y + 7.2, 0x618387, glass, 'glass');
  for (let h = 6.10; h < 6.85; h += .14) for (let u = 0; u < length; u += 2.64) box('cafe-horizontal-louvre', u, Math.min(length, u + 2.64), -.24, -.10, y + h, y + h + .055, 0x8d8069, metal, 'wood');
  const signOwner = box('cafe-sign-beam', 2.7, 12.5, -.14, .02, y + 2.82, y + 3.37, 0x343d38, metal, 'metal');
  const canvas = document.createElement('canvas'); canvas.width = 1536; canvas.height = 160;
  const ctx = canvas.getContext('2d')!; ctx.clearRect(0, 0, 1536, 160); ctx.font = '500 140px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.strokeStyle = '#efeddc'; ctx.lineWidth = 3.5; ctx.strokeText('CAFFE PASCUCCI', 768, 80, 1480);
  const signMap = new THREE.CanvasTexture(canvas); signMap.colorSpace = THREE.SRGBColorSpace;
  const normal = across.clone().negate(), right = new THREE.Vector3(normal.z, 0, -normal.x), sign = new THREE.Mesh(new THREE.PlaneGeometry(9.65, .64).scale(-1, 1, 1), new THREE.MeshStandardMaterial({ map: signMap, transparent: true, side: THREE.DoubleSide, roughness: .65 }));
  sign.position.copy(point(7.6, y + 3.09, -.17)); sign.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, normal)); sign.name = 'pascucci-observed-outline-sign'; sign.userData.text = 'CAFFE PASCUCCI'; shell.add(sign);
  // 개별 보도블록을 충돌체로 만들지 않고 한 포장면에 반복 무늬를 쓴다.
  const forecourt = slab('cafe-grey-paved-forecourt', -.2, length + .3, -3.1, 0, y, true);
  pavementMasks.push({ component: forecourt.userData.component, polygon: [[-.2,-3.1],[length+.3,-3.1],[length+.3,0],[-.2,0]].map(([u,v]) => pascucci111Point(u,v)) });
  for (const u of [3.1, 4.2, 5.3]) bar('cafe-front-bollard', point(u,y,-1.0),point(u,y+.85,-1.0),.07,0x6e7974);
  box('cafe-door-tactile',11.22,11.58,-2.65,-.42,y+.002,y+.02,0xccb551);
  box('cafe-door-tactile',10.1,12.7,-2.65,-2.3,y+.002,y+.02,0xccb551);
  const stairSteps: {polygon:XZ[];top:number}[] = [], stairRoute:number[][]=[];
  const roadA=EDUCATION12_SITE.road19[0],roadB=EDUCATION12_SITE.road19[1],roadLength=Math.hypot(roadB[0]-roadA[0],roadB[1]-roadA[1]);
  const roadClearance=(p:THREE.Vector3)=>((p.x-roadA[0])*(roadA[1]-roadB[1])+(p.z-roadA[1])*(roadB[0]-roadA[0]))/roadLength;
  function outsideRoad(polygon:THREE.Vector3[],clearance=2.8){const result:THREE.Vector3[]=[];for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],da=roadClearance(a)-clearance,db=roadClearance(b)-clearance;if(da>=0)result.push(a);if((da>=0)!==(db>=0))result.push(a.clone().lerp(b,da/(da-db)));}return result;}
  function worldFloor(component:string,top:THREE.Vector3[],bottomY:number){
    if(component.startsWith('education12-roadside'))top=outsideRoad(top);
    if(top.length<3)return undefined;
    const vertices=[...top,...top.map(p=>p.clone().setY(Math.min(bottomY,p.y-.18)))],bounds=new THREE.Box3().setFromPoints(vertices),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3()),geometry=new ConvexGeometry(vertices.map(p=>p.clone().sub(center)));
    const owner=part(component,geometry,center,new THREE.Quaternion(),size,component.startsWith('cafe-')?0x8e9695:0xadb1aa,stone,'stone',true,true);
    pavementMasks.push({component,polygon:top.map(p=>[p.x,p.z])});return owner;
  }
  // 관측된 전면 포장은 차도 경계까지 이어진다. 경계 좌표와 턱 높이는 지도에 맞춘 근사다.
  const apronRoads=[EDUCATION12_SITE.road19,EDUCATION12_SITE.road333];
  const roadDistance=(p:THREE.Vector3)=>Math.min(...apronRoads.flatMap(path=>path.slice(1).map((b,i)=>{const a=path[i],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((p.x-a[0])*dx+(p.z-a[1])*dz)/(dx*dx+dz*dz)));return Math.hypot(p.x-a[0]-dx*t,p.z-a[1]-dz*t);}))); 
  const apronEdge=(u:number)=>{let low=3.1,high=3.1;while(high<16&&roadDistance(point(u,y,-high))>3.0)high+=.2;for(let i=0;i<20;i++){const mid=(low+high)/2;if(roadDistance(point(u,y,-mid))>3.0)low=mid;else high=mid;}const p=point(u,y,-(low+high)/2);p.y=heightAt(p.x,p.z)+.12;return p;};
  const apronSegments=Math.ceil((length+.5)/.65),apronBoundary:THREE.Vector3[]=[];
  for(let i=0;i<=apronSegments;i++)apronBoundary.push(apronEdge(-.2+(length+.5)*i/apronSegments));
  for(let i=0;i<apronSegments;i++){
    const u0=-.2+(length+.5)*i/apronSegments,u1=-.2+(length+.5)*(i+1)/apronSegments;
    const polygon=[point(u0,y,-3.1),point(u1,y,-3.1),apronBoundary[i+1],apronBoundary[i]];
    for(const ids of[[0,1,2],[0,2,3]])worldFloor('cafe-grey-roadside-apron',ids.map(k=>polygon[k]),Math.min(...polygon.map(p=>p.y))-.22);
    const a=apronBoundary[i],b=apronBoundary[i+1],delta=b.clone().sub(a),curbCenter=a.clone().add(b).multiplyScalar(.5).addScaledVector(up,-.045),curbRotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1,0,0),delta.clone().normalize()),curbSize=new THREE.Vector3(delta.length(),.09,.12);
    part('cafe-low-pink-roadside-curb',new THREE.BoxGeometry(curbSize.x,curbSize.y,curbSize.z),curbCenter,curbRotation,curbSize,0xa99e96,stone,'stone');
  }
  if(roadside){
    const q=roadside, lengths=q.points.slice(1).map((p,i)=>Math.hypot(p[0]-q.points[i][0],p[1]-q.points[i][1])),total=lengths.reduce((a,b)=>a+b,0);
    const station=(s:number)=>education12RoadsideSection(q.points,q.upperEnd,s);
    const edge=(s:number,side:number,h:number)=>{const p=station(s);return new THREE.Vector3(p.x+p.nx*q.width*side/2,h,p.z+p.nz*q.width*side/2);};
    const center=(s:number,h:number)=>{const p=station(s);return[p.x,h,p.z];};
    // 경계가 완만하게 꺾이는 넓은 계단이다. 단수와 높이는 사진에 맞춘 근사다.
    worldFloor('education12-roadside-bottom-landing',[edge(-.55,-1,q.bottomY),edge(0,-1,q.bottomY),edge(0,1,q.bottomY),edge(-.55,1,q.bottomY)],q.bottomY-.25);
    stairRoute.push(center(-1.6,q.bottomY));
    for(let i=0;i<q.count;i++){const s0=total*i/q.count,s1=total*(i+1)/q.count,h=q.bottomY+(q.topY-q.bottomY)*(i+1)/q.count,top=[edge(s0,-1,h),edge(s1,-1,h),edge(s1,1,h),edge(s0,1,h)];worldFloor('education12-roadside-step',top,q.bottomY-.25);stairSteps.push({polygon:outsideRoad(top).map(p=>[p.x,p.z]),top:h});stairRoute.push(center((s0+s1)/2,h));}
    worldFloor('education12-roadside-top-landing',[edge(total,-1,q.topY),edge(total+.9,-1,q.topY),edge(total+.9,1,q.topY),edge(total,1,q.topY)],q.topY-.25);
    stairRoute.push(center(total+.65,q.topY));
    // 숲 쪽 경계석만 두고 계단 위 보행 폭을 확보한다.
    for(let i=0;i<q.count;i++){const s0=total*i/q.count,s1=total*(i+1)/q.count,h0=q.bottomY+(q.topY-q.bottomY)*i/q.count,h1=q.bottomY+(q.topY-q.bottomY)*(i+1)/q.count;for(const side of[-1,1]){let a=edge(s0,side,h0+.12),b=edge(s1,side,h1+.12);const da=roadClearance(a)-2.9,db=roadClearance(b)-2.9;if(da<0&&db<0)continue;if(da<0)a=a.clone().lerp(b,da/(da-db));else if(db<0)b=a.clone().lerp(b,da/(da-db));bar('education12-roadside-stone-edge',a,b,.10,0x969f96);}}
    const end=q.upperEnd,upperLength=Math.hypot(end[0]-q.points.at(-1)![0],end[1]-q.points.at(-1)![1]),endY=heightAt(...end)+.12;
    const upper=[edge(total+.9,-1,q.topY),edge(total+upperLength,-1,endY),edge(total+upperLength,1,endY),edge(total+.9,1,q.topY)];
    // 길게 이어지는 상부 보도는 두 삼각면으로 나눠 실제 충돌면과 일치시킨다.
    for(const ids of[[0,1,2],[0,2,3]])worldFloor('education12-roadside-upper-walk',ids.map(i=>upper[i]),Math.min(q.topY,endY)-.3);
    stairRoute.push([end[0],endY,end[1]]);
    for(const side of[-.75,.75]){const p=edge(total+.75,side,q.topY);bar('education12-roadside-silver-bollard',p,p.clone().addScaledVector(up,.85),.07,0xc3ccc8);}
  }
  const pixels = new Uint8Array(128*128*4);
  for(let v=0;v<128;v++)for(let u=0;u<128;u++){const row=Math.floor(v/16),shifted=(u+(row%2)*16)%128,column=Math.floor(shifted/32),seam=shifted%32===0||v%16===0,value=u>124&&v>124?255:seam?173:216+((column*3+row*5)%7),i=(v*128+u)*4;pixels[i]=pixels[i+1]=pixels[i+2]=value;pixels[i+3]=255;}
  const paving = new THREE.DataTexture(pixels,128,128); paving.colorSpace=THREE.SRGBColorSpace;paving.wrapS=paving.wrapT=THREE.RepeatWrapping;paving.generateMipmaps=true;paving.minFilter=THREE.LinearMipmapLinearFilter;paving.needsUpdate=true;
  for(const [i,b]of buckets.entries()){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(b.colors,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(b.uvs,2));g.computeVertexNormals();g.computeBoundingSphere();g.computeBoundingBox();b.geometry=g;const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,map:i===0?paving:null,side:THREE.DoubleSide,roughness:i===2?.3:.82,metalness:i===1?.15:0,transparent:i===2,opacity:i===2?.72:1}));mesh.name=['cafe-stone','cafe-frames','cafe-glazing'][i];mesh.castShadow=mesh.receiveShadow=true;shell.add(mesh);}
  shell.userData.cafeAccess={buildingId:PASCUCCI111_SITE.buildingId,floorY:y,roofY:y+7.62,entry:{center:point(11.4,y,.04).toArray(),outward:normal.toArray(),width:2,height:door.height,component:entry.userData.component,routeWorld:[point(11.4,y,-2.5),point(11.4,y,.7),point(11.4,y,2)].map(p=>p.toArray())},porch:{routeWorld:[point(length-1.4,y,-2.5),point(length-1.4,y,1.5),point(length+1,y,1.5)].map(p=>p.toArray())},roadsideApron:{boundary:apronBoundary.map(p=>p.toArray()),roadCenterClearance:3,dimensionsEstimated:true},roadsideStair:roadside?{...roadside,steps:stairSteps,routeWorld:stairRoute,exactStepCountMeasured:false,endpointAlignmentEstimated:true}:undefined,pavementMasks,scope:{roadviewDate:'2025-07',buildingNumber:'111',separateFrom12:true,dimensionsEstimated:true,upperAndLowerGlazingObserved:true,largeOutlineSignObserved:true,smallRedOldSignNotUsed:true,interiorPlanUnobserved:true,wholeBuildingReconstructed:false,currentBusinessStatusUnverified:true},geometry:{parts:parts.length,triangles:buckets.reduce((n,b)=>n+b.positions.length/9,0),mergedMeshes:3,signMeshes:1,textures:2},roofOwner:roof.userData.component};
  function update(_player:THREE.Vector3){const moved=new Set<Bucket>(),colored=new Set<Bucket>();for(const p of parts){if(p.shown!==p.mesh.visible){p.shown=p.mesh.visible;for(const r of p.ranges){const a=r.bucket.geometry!.getAttribute('position');if(p.shown)(a.array as Float32Array).set(r.original,r.start);else for(let j=r.start;j<r.end;j+=3){a.array[j]=p.mesh.position.x;a.array[j+1]=p.mesh.position.y;a.array[j+2]=p.mesh.position.z;}moved.add(r.bucket);}}const c=p.mesh.material.color,hex=c.getHex();if(p.tint!==hex){p.tint=hex;for(const r of p.ranges){const a=r.bucket.geometry!.getAttribute('color');for(let j=r.start;j<r.end;j+=3){a.array[j]=hex===p.base?r.bucket.colors[j]:c.r;a.array[j+1]=hex===p.base?r.bucket.colors[j+1]:c.g;a.array[j+2]=hex===p.base?r.bucket.colors[j+2]:c.b;}colored.add(r.bucket);}}}for(const b of moved)b.geometry!.getAttribute('position').needsUpdate=true;for(const b of colored)b.geometry!.getAttribute('color').needsUpdate=true;sign.visible=signOwner.visible;shell.visible=parts.some(p=>p.mesh.visible);}
  return {shell,breakables,update};
}
