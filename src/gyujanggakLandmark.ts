import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import type { CampusBuilding } from './fullCampus';
import type { BuildingAppearance } from './buildingAppearance';
import type { BreakableSpec } from './scene';

type Surface = { positions: number[]; colors: number[]; geometry?: THREE.BufferGeometry };
type Range = { surface: Surface; start: number; end: number; original: Float32Array };
type Part = { proxy: THREE.Mesh; ranges: Range[]; shown: boolean };
type Point = { x: number; z: number };

/** 사진에서 확인한 낮은 현관의 공통 접점이다. 좌표와 높이는 지도와 게임 지형에 맞춘 근사다. */
export function gyujanggakDatum(heightAt: (x:number,z:number)=>number) {
  const origin={x:113.51,z:-447.93},axis={x:.6788714061107982,z:-.7342571851641273},outward={x:.7342571851641273,z:.6788714061107982};
  const at=(u:number,v:number)=>({x:origin.x+axis.x*u+outward.x*v,z:origin.z+axis.z*u+outward.z*v});
  const center=at(23.5,48.4),floorY=heightAt(center.x,center.z)+.18,join=at(23.5,50.4);
  return {origin,axis,outward,entrance:{center,width:3.6,height:2.6,tangent:axis,outward,floorY,forecourtConnection:{...join,y:heightAt(join.x,join.z)+.035},local:{u:23.5,v:48.4},component:'gyujanggak-entry-door'},mainNorthU:35.2,dimensionsEstimated:true};
}

// 건물 윤곽은 지도 좌표다. 높이 배분, 지붕 경사와 기둥 간격은 공식 사진의 비례를 따른다.
export function createGyujanggakLandmark(
  scene: THREE.Scene,
  building: CampusBuilding,
  profile: BuildingAppearance,
  heightAt: (x: number, z: number) => number,
) {
  const points = building.points.filter((p, i, all) => i !== all.length - 1 || p[0] !== all[0][0] || p[1] !== all[0][1]);
  let longest = 0, ux = 1, uz = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length], dx = b[0] - a[0], dz = b[1] - a[1], distance = Math.hypot(dx, dz);
    if (distance > longest) { longest = distance; ux = dx / distance; uz = dz / distance; }
  }
  if (points.length < 3 || longest < 1) throw new Error('Gyujanggak footprint must contain a valid building outline.');
  if (ux < 0) { ux = -ux; uz = -uz; }
  const along = points.map(p => p[0] * ux + p[1] * uz), across = points.map(p => -p[0] * uz + p[1] * ux);
  const minX = Math.min(...along), maxX = Math.max(...along), minZ = Math.min(...across), maxZ = Math.max(...across);
  const length = maxX - minX, depth = maxZ - minZ, cx = minX * ux - minZ * uz, cz = minX * uz + minZ * ux;
  const centerX = (minX + maxX) / 2 * ux - (minZ + maxZ) / 2 * uz, centerZ = (minX + maxX) / 2 * uz + (minZ + maxZ) / 2 * ux;
  const base = heightAt(centerX, centerZ), top = profile.height ?? 18;
  const datum=gyujanggakDatum(heightAt);
  const plinthTop = top * .19, upperBottom = top * .46, wallTop = top * .7, eave = top * .75;
  const mainDepth = length-datum.mainNorthU, ridgeZ = mainDepth / 2;
  let mainFrame=false;
  const orientation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(uz, ux));
  const world = (x: number, y: number, z: number) => {const u=mainFrame?length-z:x,v=mainFrame?x:z;return new THREE.Vector3(cx+ux*u-uz*v,base+y,cz+uz*u+ux*v);};
  const outline: Point[] = points.map(p => ({ x: p[0] * ux + p[1] * uz - minX, z: -p[0] * uz + p[1] * ux - minZ }));
  const shell = new THREE.Group(); shell.name = `${building.id}:gyujanggak-landmark`;
  Object.assign(shell.userData, {
    buildingId: building.id, role: 'building-shell', landmark: 'gyujanggak', appearance: profile,
    dimensions: { length, depth, height: top }, localOrigin: { x: cx, y: base, z: cz }, axis: { x: ux, z: uz },
    plinthTop, upperBottom, mainDepth, eave, ridgeZ, dimensionsEstimated: true, datum, mappedOutline:points.map(p=>p.slice()), mainBody:{northU:datum.mainNorthU,southU:length,v0:0,v1:depth,roofAxis:{x:-uz,z:ux}},
  }); scene.add(shell);
  const distant = new THREE.Group(); distant.name = `${building.id}:gyujanggak-distant`; distant.visible = false;
  Object.assign(distant.userData, { buildingId: building.id, role: 'distant-building', landmark: 'gyujanggak' }); scene.add(distant);
  const stone: Surface = { positions: [], colors: [] }, glass: Surface = { positions: [], colors: [] }, tile: Surface = { positions: [], colors: [] };
  const surfaces = [stone, glass, tile], breakables: BreakableSpec[] = [], parts: Part[] = [];
  const cube = new THREE.BoxGeometry(1, 1, 1), axisX = new THREE.Vector3(1, 0, 0), axisY = new THREE.Vector3(0, 1, 0), axisZ = new THREE.Vector3(0, 0, 1);
  const proxyMaterials = {
    stone: new THREE.MeshStandardMaterial({ color: profile.wallColor }),
    glass: new THREE.MeshStandardMaterial({ color: profile.glassColor }),
    metal: new THREE.MeshStandardMaterial({ color: 0x46504e }),
  };
  function triangle(surface: Surface, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, hex: number) {
    const color = new THREE.Color(hex);
    for (const p of [a, b, c]) { surface.positions.push(p.x, p.y, p.z); surface.colors.push(color.r, color.g, color.b); }
  }
  function quad(surface: Surface, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, hex: number) {
    triangle(surface, a, b, c, hex); triangle(surface, a, c, d, hex);
  }
  function component(x: number, y: number, z: number, sx: number, sy: number, sz: number, kind: keyof typeof proxyMaterials, name: string, draw: () => void, rotation?: THREE.Quaternion) {
    const starts = surfaces.map(surface => surface.positions.length); draw();
    const ranges = surfaces.map((surface, i) => ({ surface, start: starts[i], end: surface.positions.length, original: new Float32Array(surface.positions.slice(starts[i])) }));
    const vertices:THREE.Vector3[]=[],seen=new Set<string>();for(const r of ranges)for(let i=0;i<r.original.length;i+=3){const v=new THREE.Vector3().fromArray(r.original,i),key=v.toArray().join(',');if(!seen.has(key)){seen.add(key);vertices.push(v);}}
    if(vertices.length<3)return;const normal=vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0])).normalize();
    if(normal.lengthSq()>.1&&vertices.every(v=>Math.abs(v.clone().sub(vertices[0]).dot(normal))<.001)){if(normal.y<0)normal.negate();vertices.push(...vertices.map(v=>v.clone().addScaledVector(normal,-.08)));}
    const bounds=new THREE.Box3().setFromPoints(vertices),center=bounds.getCenter(new THREE.Vector3()),geometry=new ConvexGeometry(vertices.map(v=>v.sub(center))),proxy=new THREE.Mesh(geometry,proxyMaterials[kind]);proxy.position.copy(center);proxy.updateMatrixWorld(true);
    Object.assign(proxy.userData,{buildingId:building.id,renderProxy:true,landmark:'gyujanggak',component:name,convex:true});
    parts.push({proxy,ranges,shown:true});breakables.push({mesh:proxy,size:bounds.getSize(new THREE.Vector3()),collisionVertices:Float32Array.from(geometry.getAttribute('position').array),toughness:kind==='glass'?6:12,label:building.name,material:kind});
  }

  function box(x: number, y: number, z: number, sx: number, sy: number, sz: number, hex: number, rotation?: THREE.Quaternion, surface = stone) {
    const p = (a: number, b: number, c: number) => {
      const v = new THREE.Vector3(a * sx / 2, b * sy / 2, c * sz / 2); if (rotation) v.applyQuaternion(rotation);
      return world(x + v.x, y + v.y, z + v.z);
    };
    for (const side of [-1, 1]) {
      quad(surface, p(-1, -1, side), p(1, -1, side), p(1, 1, side), p(-1, 1, side), hex);
      quad(surface, p(side, -1, -1), p(side, -1, 1), p(side, 1, 1), p(side, 1, -1), hex);
      quad(surface, p(-1, side, -1), p(1, side, -1), p(1, side, 1), p(-1, side, 1), hex);
    }
  }
  function solid(x: number, y: number, z: number, sx: number, sy: number, sz: number, name: string, hex: number) {
    component(x, y, z, sx, sy, sz, 'stone', name, () => box(x, y, z, sx, sy, sz, hex));
  }
  function clipped(poly: Point[], axis: 'x' | 'z', value: number, greater: boolean): Point[] {
    const result: Point[] = [], inside = (p: Point) => greater ? p[axis] >= value : p[axis] <= value;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], ai = inside(a), bi = inside(b);
      if (ai) result.push(a);
      if (ai !== bi) { const t = (value - a[axis]) / (b[axis] - a[axis]); result.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }); }
    }
    return result;
  }

  // 낮은 부분은 계단형 지도 윤곽을 그대로 따른다. 꼭짓점 밖의 빈 모서리를 큰 상자로 메우지 않는다.
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length], edgeLength = Math.hypot(b.x - a.x, b.z - a.z), count = Math.ceil(edgeLength / 7);
    const rotation = new THREE.Quaternion().setFromAxisAngle(axisY, -Math.atan2(b.z - a.z, b.x - a.x));
    for (let j = 0; j < count; j++) {
      const start = j / count, end = (j + 1) / count, x = a.x + (b.x - a.x) * (start + end) / 2, z = a.z + (b.z - a.z) * (start + end) / 2;
      const p0 = world(a.x + (b.x - a.x) * start, 0, a.z + (b.z - a.z) * start), p1 = world(a.x + (b.x - a.x) * end, 0, a.z + (b.z - a.z) * end);
      const bottom = Math.min(heightAt(p0.x, p0.z), heightAt(p1.x, p1.z), base) - base - .4;
      const width = edgeLength / count;
      if(i>=5&&i<=8){const lower=datum.entrance.floorY-base+2.7;component(x,(lower+plinthTop)/2,z,width,plinthTop-lower,.55,'stone','entrance-terrace-fascia',()=>box(x,(lower+plinthTop)/2,z,width,plinthTop-lower,.55,0x999d94,rotation),rotation);continue;}
      component(x, (bottom + plinthTop) / 2, z, width, plinthTop - bottom, .55, 'stone', 'stepped-plinth', () => {
        box(x, (bottom + plinthTop) / 2, z, width, plinthTop - bottom, .55, 0x999d94, rotation);
        for (let y = .4; y < plinthTop; y += .38) box(x, y, z, width, .035, .57, 0x7e8882, rotation);

      }, rotation);
    }
  }
  for (let x0 = 0; x0 < length; x0 += 7) for (let z0 = 0; z0 < depth; z0 += 7) {
    const poly = clipped(clipped(clipped(clipped(outline, 'x', x0, true), 'x', x0 + 7, false), 'z', z0, true), 'z', z0 + 7, false);
    if (poly.length < 3) continue;
    const xs = poly.map(p => p.x), zs = poly.map(p => p.z), loX = Math.min(...xs), hiX = Math.max(...xs), loZ = Math.min(...zs), hiZ = Math.max(...zs);
    if (hiX - loX < .08 || hiZ - loZ < .08) continue;
    const indices = THREE.ShapeUtils.triangulateShape(poly.map(p => new THREE.Vector2(p.x, p.z)), []);
    component((loX + hiX) / 2, plinthTop - .2, (loZ + hiZ) / 2, hiX - loX, .4, hiZ - loZ, 'stone', 'terrace-slab', () => {
      for (const face of indices) triangle(stone, ...face.map(i => world(poly[i].x, plinthTop, poly[i].z)) as [THREE.Vector3, THREE.Vector3, THREE.Vector3], 0xb9b9ab);
    });
  }

  function facade(horizontal: boolean, plane: number, a0: number, a1: number, bottom: number, upper: number, name: string, ribbon = false) {
    const count = Math.max(1, Math.ceil((a1 - a0) / 7));
    for (let col = 0; col < count; col++) {
      const lo = a0 + (a1 - a0) * col / count, hi = a0 + (a1 - a0) * (col + 1) / count;
      const x = horizontal ? (lo + hi) / 2 : plane, z = horizontal ? plane : (lo + hi) / 2;
      component(x, (bottom + upper) / 2, z, horizontal ? hi - lo : .5, upper - bottom, horizontal ? .5 : hi - lo, 'glass', name, () => {
        box(x, (bottom + upper) / 2, z, horizontal ? hi - lo : .5, upper - bottom, horizontal ? .5 : hi - lo, ribbon ? 0x949d97 : 0xc1c2b7);
        const windowBottom = ribbon ? upper - (upper - bottom) * .49 : bottom + .2, windowTop = upper - .3;
        for (const side of [-1, 1]) {
          const p = (a: number, y: number) => horizontal ? world(a, y, plane + side * .258) : world(plane + side * .258, y, a);
          quad(glass, p(lo + .09, windowBottom), p(hi - .09, windowBottom), p(hi - .09, windowTop), p(lo + .09, windowTop), profile.glassColor);
          for (let a = lo; a < hi; a += 1.25) {
            if (horizontal) box(a, (windowBottom + windowTop) / 2, plane + side * .27, .06, windowTop - windowBottom, .07, 0xc9c9bb);
            else box(plane + side * .27, (windowBottom + windowTop) / 2, a, .07, windowTop - windowBottom, .06, 0xc9c9bb);
          }
        }
      });
    }
  }
  mainFrame=true;
  { const mainDepth=shell.userData.mainDepth as number, length=depth;
    const ridgeZ=mainDepth/2,roofLeft=-1.7,roofRight=length+1.7,roofHalfDepth=mainDepth/2+2,ridgeInset=length*.085;
  // 본관 아래 벽은 기둥열보다 안쪽에 둔다. 기둥 사이를 지나갈 수 있는 처마 아래 공간을 남긴다.
  for (const z of [5.5, mainDepth - 5.5]) facade(true, z, 5.5, length - 5.5, plinthTop, upperBottom, 'recessed-core');
  for (const x of [5.5, length - 5.5]) facade(false, x, 5.5, mainDepth - 5.5, plinthTop, upperBottom, 'recessed-core');
  for (const z of [1, mainDepth - 1]) facade(true, z, 1, length - 1, upperBottom, wallTop, 'upper-ribbon', true);
  for (const x of [1, length - 1]) facade(false, x, 1, mainDepth - 1, upperBottom, wallTop, 'upper-ribbon', true);
  const columnXs = Array.from({ length: 8 }, (_, i) => 2.3 + (length - 4.6) * i / 7);
  for (const x of columnXs) for (const z of [1.8, mainDepth - 1.8]) {
    const bottom = plinthTop, upper = upperBottom + .1, radius = .62;
    component(x, (bottom + upper) / 2, z, radius * 2, upper - bottom, radius * 2, 'stone', 'colonnade-column', () => {
      for (let segment = 0; segment < 12; segment++) {
        const a = segment * Math.PI / 6, b = (segment + 1) * Math.PI / 6;
        quad(stone, world(x + Math.cos(a) * radius, bottom, z + Math.sin(a) * radius), world(x + Math.cos(b) * radius, bottom, z + Math.sin(b) * radius), world(x + Math.cos(b) * radius, upper, z + Math.sin(b) * radius), world(x + Math.cos(a) * radius, upper, z + Math.sin(a) * radius), 0xc7c5b5);
      }
      box(x, upper - .12, z, 1.5, .3, 1.5, 0xbebfaf);
    });
  }
  for (let i = 0; i < 10; i++) {
    const width = (length - 2) / 10, x = 1 + (i + .5) * width;
    solid(x, upperBottom + .17, mainDepth / 2, width, .34, mainDepth - 2, 'upper-soffit', 0x8e9790);
    solid(x, eave - .23, mainDepth / 2, width + .5, .5, mainDepth + 3.4, 'deep-eave', 0xc4c2b1);
  }

  // 팔작 형태의 큰 지붕과 양끝 박공을 낮은 처마 위에 올린다.
  const roofY = (u: number) => eave + (top - eave) * u * u + .12 * Math.max(0, 1 - u * 7);
  const roofPoint = (side: number, u: number, v: number) => {
    const taper = Math.min(1, u / .55), lo = THREE.MathUtils.lerp(roofLeft, ridgeInset, taper), hi = THREE.MathUtils.lerp(roofRight, length - ridgeInset, taper);
    return { x: THREE.MathUtils.lerp(lo, hi, v), y: roofY(u), z: ridgeZ + side * roofHalfDepth * (1 - u) };
  };
  const roofRows=[0,.15,.30,.45,.55,.7,.85,1];
  for (const side of [-1, 1]) for (let row = 0; row < roofRows.length-1; row++) for (let col = 0; col < 10; col++) {
    const u0 = roofRows[row], u1 = roofRows[row+1], v0 = col / 10, v1 = (col + 1) / 10;
    const a = roofPoint(side, u0, v0), b = roofPoint(side, u0, v1), c = roofPoint(side, u1, v1), d = roofPoint(side, u1, v0);
    const y0 = (a.y + b.y) / 2, y1 = (c.y + d.y) / 2, z0 = a.z, z1 = d.z;
    const tilt = new THREE.Quaternion().setFromAxisAngle(axisX, -Math.atan2(y1 - y0, z1 - z0));
    component((a.x + b.x + c.x + d.x) / 4, (y0 + y1) / 2, (z0 + z1) / 2, Math.max(b.x - a.x, c.x - d.x), .42, Math.hypot(y1 - y0, z1 - z0), 'metal', 'sloped-tile-roof', () => {
      quad(tile, world(a.x, a.y, a.z), world(b.x, b.y, b.z), world(c.x, c.y, c.z), world(d.x, d.y, d.z), [0x3c4948, 0x46524f, 0x414e4b][(row + col) % 3]);
      const tileCount = Math.ceil(Math.max(b.x - a.x, c.x - d.x) / .48);
      for (let i = 0; i < tileCount; i++) {
        const v = v0 + (v1 - v0) * (i + .5) / tileCount, p = roofPoint(side, u0, v), q = roofPoint(side, u1, v);
        quad(tile, world(p.x - .035, p.y + .055, p.z), world(p.x + .035, p.y + .055, p.z), world(q.x + .035, q.y + .055, q.z), world(q.x - .035, q.y + .055, q.z), 0x65706a);
      }
    }, tilt);
  }
  for (const end of [-1, 1]) {
    const edgeX = end < 0 ? roofLeft : roofRight, gableX = end < 0 ? ridgeInset : length - ridgeInset;
    const lowerY = roofY(.55), halfGable = roofHalfDepth * .45;
    const run = gableX - edgeX, rise = lowerY - roofY(0), tilt = new THREE.Quaternion().setFromAxisAngle(axisZ, Math.atan2(rise, run));
    for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
      const t0 = roofRows[row]/.55, t1 = roofRows[row+1]/.55, v0 = col / 4, v1 = (col + 1) / 4;
      const p = (t: number, v: number) => ({ x: THREE.MathUtils.lerp(edgeX, gableX, t), y: roofY(t*.55), z: ridgeZ + (v * 2 - 1) * roofHalfDepth*(1-t*.55) });
      const a = p(t0, v0), b = p(t0, v1), c = p(t1, v1), d = p(t1, v0);
      component((a.x + d.x) / 2, (a.y + d.y) / 2, (a.z + b.z + c.z + d.z) / 4, Math.hypot(run, rise) / 3, .45, Math.max(b.z - a.z, c.z - d.z), 'metal', 'hip-end-roof', () => quad(tile, world(a.x, a.y, a.z), world(b.x, b.y, b.z), world(c.x, c.y, c.z), world(d.x, d.y, d.z), 0x46534e), tilt);
    }
    for(const side of[-1,1])for(let row=4;row+1<roofRows.length;row++){
      const u0=roofRows[row],u1=roofRows[row+1],z0=ridgeZ+side*roofHalfDepth*(1-u0),z1=ridgeZ+side*roofHalfDepth*(1-u1),y0=roofY(u0),y1=roofY(u1);
      component(gableX,(lowerY+Math.max(y0,y1))/2,(z0+z1)/2,.16,Math.max(y0,y1)-lowerY,Math.abs(z1-z0),'stone','raised-gable',()=>{quad(stone,world(gableX,lowerY,z0),world(gableX,lowerY,z1),world(gableX,y1,z1),world(gableX,y0,z0),0xbcbeb1);quad(tile,world(gableX+end*.12,y0+.09,z0),world(gableX+end*.12,y1+.09,z1),world(gableX+end*.12,y1-.09,z1),world(gableX+end*.12,y0-.09,z0),0x4c5a55);});
    }
  }
  for (let i = 0; i < 8; i++) {
    const width = (length - ridgeInset * 2) / 8, x = ridgeInset + (i + .5) * width;
    component(x, top + .12, ridgeZ, width, .28, .5, 'metal', 'tile-ridge', () => box(x, top + .12, ridgeZ, width, .28, .5, 0x384742, undefined, tile));
  }

  } mainFrame=false;

  const pavilionOutline=clipped(clipped(clipped(outline,'x',33.5,false),'z',14,true),'z',44.5,false),pavilionTop=top*.43;
  Object.assign(shell.userData,{pavilion:{outline:pavilionOutline,top:pavilionTop,location:'northwest'},entrance:{...datum.entrance,x:datum.entrance.center.x,z:datum.entrance.center.z,floor:datum.entrance.floorY,world:[datum.entrance.center.x,datum.entrance.floorY,datum.entrance.center.z]}});
  for(let i=0;i<pavilionOutline.length;i++){const a=pavilionOutline[i],b=pavilionOutline[(i+1)%pavilionOutline.length],len=Math.hypot(b.x-a.x,b.z-a.z),count=Math.ceil(len/5),rot=new THREE.Quaternion().setFromAxisAngle(axisY,-Math.atan2(b.z-a.z,b.x-a.x));for(let k=0;k<count;k++){const x=THREE.MathUtils.lerp(a.x,b.x,(k+.5)/count),z=THREE.MathUtils.lerp(a.z,b.z,(k+.5)/count),h=pavilionTop-plinthTop-.4;
    component(x,plinthTop+h/2,z,len/count,h,.22,'glass','low-glass-pavilion',()=>{box(x,plinthTop+h/2,z,len/count,h,.07,profile.glassColor,rot,glass);for(const sign of[-1,1]){const t=(k+(sign+1)/2)/count;box(THREE.MathUtils.lerp(a.x,b.x,t),plinthTop+h/2,THREE.MathUtils.lerp(a.z,b.z,t),.08,h,.2,0xc6c6b6,rot);}box(x,plinthTop+.12,z,len/count,.24,.24,0x9caaa3,rot);box(x,pavilionTop-.52,z,len/count,.24,.24,0xa5aaa1,rot);},rot);}}
  for(let x0=0;x0<34;x0+=5)for(let z0=10;z0<45;z0+=5){const p=clipped(clipped(clipped(clipped(pavilionOutline,'x',x0,true),'x',x0+5,false),'z',z0,true),'z',z0+5,false);if(p.length<3)continue;const faces=THREE.ShapeUtils.triangulateShape(p.map(v=>new THREE.Vector2(v.x,v.z)),[]);component(x0+2.5,pavilionTop-.2,z0+2.5,5,.4,5,'stone','pavilion-flat-roof',()=>{for(const f of faces)triangle(stone,...f.map(i=>world(p[i].x,pavilionTop,p[i].z)) as [THREE.Vector3,THREE.Vector3,THREE.Vector3],0xc3c6b9);});}
  // 현관은 북서쪽 낮은 단부에 후퇴시킨다. 앞 돌출 기단 아래도 실제 통과 공간으로 남긴다.
  const entrance=datum.entrance,front=48.4,floor=entrance.floorY-base,doorL=23.5-entrance.width/2,doorR=23.5+entrance.width/2;
  const floorPiece=(u0:number,u1:number,v0:number,v1:number,y0:number,y1:number,name:string)=>component((u0+u1)/2,(y0+y1)/2,(v0+v1)/2,u1-u0,.16,v1-v0,'stone',name,()=>{const a=world(u0,y0,v0),b=world(u1,y0,v0),c=world(u1,y1,v1),d=world(u0,y1,v1);quad(stone,a,b,c,d,0xbdbdb4);quad(stone,a.clone().addScaledVector(axisY,-.16),d.clone().addScaledVector(axisY,-.16),c.clone().addScaledVector(axisY,-.16),b.clone().addScaledVector(axisY,-.16),0x969b92);});
  floorPiece(10.5,29.5,42.4,front+.25,floor,floor,'entrance-interior-floor');
  floorPiece(doorL-.5,doorR+.5,front+.2,front+2,floor,entrance.forecourtConnection.y-base,'entrance-approach-ramp');
  for(const [l,r]of[[9.72,doorL],[doorR,29.92]]){const n=Math.ceil((r-l)/2);for(let i=0;i<n;i++){const a=THREE.MathUtils.lerp(l,r,i/n),b=THREE.MathUtils.lerp(l,r,(i+1)/n);component((a+b)/2,floor+1.3,front,b-a,2.6,.12,'glass','entrance-fixed-glass',()=>{box((a+b)/2,floor+1.3,front,b-a,2.6,.065,0x567876,undefined,glass);for(const q of[a,b])box(q,floor+1.3,front,.06,2.6,.12,0xa7aea4);box((a+b)/2,floor+.045,front,b-a,.09,.13,0xa7aea4);});}}
  component(23.5,floor+1.3,front,entrance.width,2.6,.1,'glass',entrance.component,()=>{box(23.5,floor+1.3,front,entrance.width,2.6,.065,0x527876,undefined,glass);for(const x of[doorL,23.5,doorR])box(x,floor+1.3,front,.065,2.6,.12,0xc1c6be);for(const x of[23.35,23.65])box(x,floor+1.05,front+.09,.035,.55,.05,0xd8d9d0);});
  solid(19.82,(floor+2.6+plinthTop)/2,front,20.2,plinthTop-floor-2.6,.3,'entrance-stone-lintel',0xa4aaa1);
  solid(19.82,plinthTop-.3,front+.55,21,.22,1.6,'exhibition-canopy',0xc5c7bb);
  for(const u of[10.5,29.5])solid(u,floor+1.4,45.4,.18,2.8,6,'entrance-side-wall',0x929b92);
  solid(20,floor+1.4,42.4,19,2.8,.18,'entrance-inner-divider',0x929b92);
  // 현관 위 테라스의 확인된 전면에 얇은 수평 난간을 둔다. 부재 사이를 충돌로 채우지 않는다.
  for(let edge=5;edge<=9;edge++){const a=outline[edge],b=outline[edge+1],length=Math.hypot(b.x-a.x,b.z-a.z),count=Math.ceil(length/2.4),rot=new THREE.Quaternion().setFromAxisAngle(axisY,-Math.atan2(b.z-a.z,b.x-a.x));for(let k=0;k<count;k++){const t0=k/count,t1=(k+1)/count,x=THREE.MathUtils.lerp(a.x,b.x,(t0+t1)/2),z=THREE.MathUtils.lerp(a.z,b.z,(t0+t1)/2);for(const h of[.22,.58,1.02])component(x,plinthTop+h,z,length/count,.045,.045,'metal','terrace-front-horizontal-rail',()=>box(x,plinthTop+h,z,length/count,.045,.045,0xc1c4b8,rot),rot);const px=THREE.MathUtils.lerp(a.x,b.x,t0),pz=THREE.MathUtils.lerp(a.z,b.z,t0);component(px,plinthTop+.51,pz,.06,1.02,.06,'metal','terrace-front-rail-post',()=>box(px,plinthTop+.51,pz,.06,1.02,.06,0xb5bbb0));}}
  Object.assign(shell.userData,{entranceInterior:{u0:10.5,u1:29.5,v0:42.4,v1:front,floorY:entrance.floorY},access:{routes:[{roadId:'way/456487335/264',points:[[172.89,heightAt(172.89,-408.67)+.035,-408.67],[172.98,heightAt(172.98,-413.23)+.035,-413.23],world(23.5,heightAt(...[world(23.5,0,55).x,world(23.5,0,55).z] as [number,number])-base+.035,55).toArray(),[entrance.forecourtConnection.x,entrance.forecourtConnection.y,entrance.forecourtConnection.z],[entrance.center.x,entrance.floorY,entrance.center.z],world(23.5,floor,44.5).toArray()]}]},wholeInteriorModeled:false});

  for (const [surface, name, roughness, metalness] of [[stone, 'structure', .82, .02], [glass, 'windows', .27, .16], [tile, 'tile-roof', .8, .06]] as const) {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(surface.positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(surface.colors, 3));
    (geometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage); geometry.computeVertexNormals(); geometry.computeBoundingSphere(); geometry.computeBoundingBox(); surface.geometry = geometry;
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness, metalness })); mesh.name = `gyujanggak-${name}`; mesh.receiveShadow = true; shell.add(mesh);
    surface.positions.length = 0; surface.colors.length = 0;
  }
  function update(_player: THREE.Vector3) {
    const changed = new Set<Surface>();
    for (const part of parts) if (part.shown !== part.proxy.visible) {
      part.shown = part.proxy.visible;
      for (const range of part.ranges) {
        if (range.start === range.end) continue;
        const attribute = range.surface.geometry!.getAttribute('position') as THREE.BufferAttribute;
        if (!changed.has(range.surface)) attribute.clearUpdateRanges(); changed.add(range.surface);
        if (part.shown) (attribute.array as Float32Array).set(range.original, range.start);
        else for (let i = range.start; i < range.end; i += 3) { attribute.array[i] = part.proxy.position.x; attribute.array[i + 1] = part.proxy.position.y; attribute.array[i + 2] = part.proxy.position.z; }
        attribute.addUpdateRange(range.start, range.end - range.start);
      }
    }
    for (const surface of changed) surface.geometry!.getAttribute('position').needsUpdate = true;
    shell.visible = parts.some(part => part.proxy.visible);
  }
  Object.assign(shell.userData,{renderMeshes:3,partCount:parts.length,triangles:shell.children.reduce((n,o)=>n+(o as THREE.Mesh).geometry.getAttribute('position').count/3,0)});
  return { shell, breakables, update };
}
