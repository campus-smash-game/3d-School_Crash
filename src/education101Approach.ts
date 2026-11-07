import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import { EDUCATION101_SITE as SITE, EDUCATION10_LINK as LINK, education101Point, education101Local, getEducation101Layout } from './education101Site';

type XZ = [number, number];
type XYZ = [number, number, number];
type Bucket = { positions: number[]; colors: number[]; uvs: number[]; geometry?: THREE.BufferGeometry };
type Range = { bucket: Bucket; start: number; end: number; original: Float32Array };

export function createEducation101Approach(scene: THREE.Scene, heightAt: (x: number, z: number) => number) {
  const layout = getEducation101Layout(heightAt), shell = new THREE.Group(); shell.name = 'approach/education101';
  Object.assign(shell.userData, { role: 'campus-approach', buildingId: SITE.buildingId, landmark: 'education101-approach', coordinates: 'D=(east,up,north); parent H applies once.' }); scene.add(shell);
  const stone: Bucket = { positions: [], colors: [], uvs: [] }, metal: Bucket = { positions: [], colors: [], uvs: [] }, glass: Bucket = { positions: [], colors: [], uvs: [] }, buckets = [stone, metal, glass];
  const parts: { proxy: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>; ranges: Range[]; shown: boolean; base: number; color: number }[] = [], breakables: BreakableSpec[] = [];
  const pavementMasks: { component: string; polygon: XZ[] }[] = [], floorTriangles: { component: string; vertices: XYZ[] }[] = [];
  const up = new THREE.Vector3(0, 1, 0), axis = new THREE.Vector3(SITE.axis.x, 0, SITE.axis.z), across = new THREE.Vector3(SITE.across.x, 0, SITE.across.z);
  const rotation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(axis, up, across));
  const world = (s: number, y: number, n: number) => { const p = education101Point(s, n); return new THREE.Vector3(p[0], y, p[1]); };
  const terrain = scene.getObjectByName('campus-terrain') as THREE.Mesh<THREE.BufferGeometry> | undefined;
  if (!terrain) throw new Error('Education101 approach requires the actual campus terrain.');
  const position = terrain.geometry.getAttribute('position'), index = terrain.geometry.index, terrainTriangles: XYZ[][] = [];
  for (let i = 0; i < (index?.count ?? position.count); i += 3) {
    const triangle: XYZ[] = [0, 1, 2].map(j => { const k = index ? index.getX(i + j) : i + j; return [position.getX(k), position.getY(k), position.getZ(k)]; });
    if (Math.max(...triangle.map(v => v[0])) >= 615 && Math.min(...triangle.map(v => v[0])) <= 680 && Math.max(...triangle.map(v => v[2])) >= -735 && Math.min(...triangle.map(v => v[2])) <= -670) terrainTriangles.push(triangle);
  }
  const planeY = (x: number, z: number, tri: XYZ[]) => { const [a, b, c] = tri, den = (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]), u = ((x - a[0]) * (c[2] - a[2]) - (z - a[2]) * (c[0] - a[0])) / den, v = ((b[0] - a[0]) * (z - a[2]) - (b[2] - a[2]) * (x - a[0])) / den; return { y: a[1] + u * (b[1] - a[1]) + v * (c[1] - a[1]), inside: u >= -1e-7 && v >= -1e-7 && u + v <= 1.0000001 }; };
  const ground = (x: number, z: number) => { for (const t of terrainTriangles) { const q = planeY(x, z, t); if (q.inside) return q.y; } return heightAt(x, z) - .03; };
  const clip = (polygon: XYZ[], distance: (v: XYZ) => number) => { const result: XYZ[] = []; for (let i = 0; i < polygon.length; i++) { const a = polygon[i], b = polygon[(i + 1) % polygon.length], da = distance(a), db = distance(b); if (da >= -1e-8) result.push(a); if ((da >= -1e-8) !== (db >= -1e-8)) { const t = da / (da - db); result.push(a.map((v, j) => v + (b[j] - v) * t) as XYZ); } } return result; };
  function append(bucket: Bucket, geometry: THREE.BufferGeometry, color: number, paving = false) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry, p = g.getAttribute('position'), normals = g.getAttribute('normal'), tint = new THREE.Color(color);
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), q = education101Local(x, z); bucket.positions.push(x, y, z); bucket.colors.push(tint.r, tint.g, tint.b); bucket.uvs.push(...(paving && normals.getY(i) > .7 ? [q.n / 1.2, q.s / 1.2] : [.99, .99])); }
    if (g !== geometry) g.dispose();
  }
  function part(component: string, vertices: THREE.Vector3[], color: number, bucket = stone, material: BreakableSpec['material'] = 'stone', paving = false, decoration?: () => void, cuboid?: { center: THREE.Vector3; size: THREE.Vector3; rotation: THREE.Quaternion }) {
    const starts = buckets.map(b => b.positions.length), bounds = new THREE.Box3().setFromPoints(vertices), center = cuboid?.center ?? bounds.getCenter(new THREE.Vector3()), size = cuboid?.size ?? bounds.getSize(new THREE.Vector3());
    const geometry = cuboid ? new THREE.BoxGeometry(size.x, size.y, size.z) : new ConvexGeometry(vertices.map(v => v.clone().sub(center))), proxy = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: .82 }));
    proxy.position.copy(center); if (cuboid) proxy.quaternion.copy(cuboid.rotation); proxy.updateMatrixWorld(true);
    Object.assign(proxy.userData, { buildingId: SITE.buildingId, landmark: 'education101-approach', component, renderProxy: true, convex: !cuboid, collisionShape: cuboid ? 'oriented-cuboid' : 'convex-hull' });
    const rendered = geometry.clone().applyMatrix4(proxy.matrixWorld); append(bucket, rendered, color, paving); rendered.dispose(); decoration?.();
    parts.push({ proxy, ranges: buckets.map((b, i) => ({ bucket: b, start: starts[i], end: b.positions.length, original: Float32Array.from(b.positions.slice(starts[i])) })), shown: true, base: color, color });
    breakables.push({ mesh: proxy, size, collisionVertices: cuboid ? undefined : Float32Array.from(geometry.getAttribute('position').array), toughness: material === 'metal' ? 10 : 9, material, label: '10-1동 통과구와 현관' }); return proxy;
  }
  function bar(component: string, a: THREE.Vector3, b: THREE.Vector3, radius = .025, color = 0xbec8c2, decoration = false) {
    const delta = b.clone().sub(a), g = new THREE.CylinderGeometry(radius, radius, delta.length(), 8, 1); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, delta.normalize())); g.translate(...a.clone().add(b).multiplyScalar(.5).toArray());
    if (decoration) append(metal, g, color); else { const p = g.getAttribute('position'); part(component, Array.from({ length: p.count }, (_, i) => new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i))), color, metal, 'metal'); } g.dispose();
  }
  function recordFloor(component: string, top: THREE.Vector3[], mask = true) { if (mask) pavementMasks.push({ component, polygon: top.map(v => [v.x, v.z]) }); for (let i = 1; i + 1 < top.length; i++) floorTriangles.push({ component, vertices: [top[0], top[i], top[i + 1]].map(v => v.toArray() as XYZ) }); }
  function floor(component: string, top: THREE.Vector3[], color = 0xa9aaa0, suspended = false, rectangular = false, nosing = false, mask = true, paving = true, material: BreakableSpec['material'] = 'stone') {
    const bottom = top.map(v => v.clone().setY(suspended ? v.y - .25 : Math.min(v.y - .18, ground(v.x, v.z) - .12))), minY = Math.min(...bottom.map(v => v.y));
    const a = education101Local(top[0].x, top[0].z), b = education101Local(top[2].x, top[2].z);
    const cuboid = rectangular ? { center: world((a.s + b.s) / 2, (minY + top[0].y) / 2, (a.n + b.n) / 2), size: new THREE.Vector3(Math.abs(b.s - a.s), top[0].y - minY, Math.abs(b.n - a.n)), rotation } : undefined;
    const owner = part(component, [...top, ...bottom], color, material === 'metal' ? metal : stone, material, paving, nosing ? () => { const g = new THREE.BoxGeometry(.04, .012, Math.abs(b.n - a.n)); g.applyQuaternion(rotation); g.translate(...world(a.s + .022, top[0].y + .006, 0).toArray()); append(stone, g, 0xc7c8bf); g.dispose(); } : undefined, cuboid);
    recordFloor(component, top, mask); return owner;
  }
  function terrainFloor(component: string, polygon: XZ[], target: (x: number, y: number, z: number) => number, color = 0xa9aaa0) {
    const sign = Math.sign(polygon.reduce((sum, a, i) => { const b = polygon[(i + 1) % polygon.length]; return sum + a[0] * b[1] - b[0] * a[1]; }, 0));
    const patches: THREE.Vector3[][] = [];
    for (const t of terrainTriangles) { let p = t; for (let i = 0; i < polygon.length; i++) { const a = polygon[i], b = polygon[(i + 1) % polygon.length]; p = clip(p, v => sign * ((b[0] - a[0]) * (v[2] - a[1]) - (b[1] - a[1]) * (v[0] - a[0]))); } if (p.length >= 3) patches.push(p.map(v => new THREE.Vector3(v[0], target(...v), v[2]))); }
    // 같은 평면의 작은 조각만 합친다. 서로 기울기가 다른 면을 큰 볼록체로 덮지 않는다.
    const area = (p: THREE.Vector3[]) => Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a.x * b.z - b.x * a.z; }, 0)) / 2;
    const hull = (points: THREE.Vector3[]) => { const sorted = [...new Map(points.map(p => [`${p.x.toFixed(6)},${p.z.toFixed(6)}`, p])).values()].sort((a, b) => a.x - b.x || a.z - b.z), cross = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x), half = (items: THREE.Vector3[]) => { const r: THREE.Vector3[] = []; for (const p of items) { while (r.length > 1 && cross(r.at(-2)!, r.at(-1)!, p) <= 1e-8) r.pop(); r.push(p); } return r; }; return [...half(sorted).slice(0, -1), ...half([...sorted].reverse()).slice(0, -1)]; };
    for (let i = 0; i < patches.length; i++) { let changed = true; while (changed) { changed = false; const a = patches[i]; if (area(a) < 1e-7) break; const plane = new THREE.Plane().setFromCoplanarPoints(a[0], a[1], a[2]); for (let j = i + 1; j < patches.length; j++) { const b = patches[j]; if (a.filter(p => b.some(q => p.distanceToSquared(q) < 1e-9)).length < 2 || b.some(p => Math.abs(plane.distanceToPoint(p)) > .00003)) continue; const merged = hull([...a, ...b]); if (Math.abs(area(merged) - area(a) - area(b)) > .00001) continue; patches[i] = merged; patches.splice(j, 1); changed = true; break; } } }
    for (const top of patches) if (area(top) > 1e-6) { const plane = new THREE.Plane().setFromCoplanarPoints(top[0], top[1], top[2]); if (top.some(p => Math.abs(plane.distanceToPoint(p)) > .00001)) { for (let i = 1; i + 1 < top.length; i++) floor(component, [top[0], top[i], top[i + 1]], color); } else floor(component, top, color); }
  }
  const rect = (s0: number, s1: number, n0: number, n1: number, y: number) => [world(s0, y, n0), world(s1, y, n0), world(s1, y, n1), world(s0, y, n1)];

  const box = (component: string, s0: number, s1: number, n0: number, n1: number, y0: number, y1: number, color = 0xd0d3cd, bucket = stone, material: BreakableSpec['material'] = 'stone', decoration?: () => void) => {
    const center = world((s0 + s1) / 2, (y0 + y1) / 2, (n0 + n1) / 2), size = new THREE.Vector3(s1 - s0, y1 - y0, n1 - n0);
    return part(component, [...rect(s0, s1, n0, n1, y0), ...rect(s0, s1, n0, n1, y1)], color, bucket, material, false, decoration, { center, size, rotation });
  };
  const doorDecor = (s0: number, s1: number, n: number, y: number, h: number, facing = 1) => {
    for (const s of [s0 + .08, (s0 + s1) / 2, s1 - .08]) { const g = new THREE.BoxGeometry(.045, h, .06); g.applyQuaternion(rotation); g.translate(...world(s, y + h / 2, n + .06 * facing).toArray()); append(metal, g, 0xb9c5c3); g.dispose(); }
    for (const s of [(s0 + s1) / 2 - .18, (s0 + s1) / 2 + .18]) bar('entry-handle', world(s, y + .82, n + .14 * facing), world(s, y + 1.5, n + .14 * facing), .024, 0xc8cfca, true);
  };
  const cylinder = (component: string, s: number, n: number, y0: number, y1: number, radius: number, color = 0xd0d3cd) => { const g = new THREE.CylinderGeometry(radius, radius, y1 - y0, 16); g.translate(...world(s, (y0 + y1) / 2, n).toArray()); const p = g.getAttribute('position'); const owner = part(component, Array.from({ length: p.count }, (_, i) => new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i))), color); g.dispose(); return owner; };
  const routePoint = (s: number, n: number, y: number) => world(s, y, n).toArray() as XYZ;
  const terrainY = (s: number, n: number) => ground(...education101Point(s, n));
  const rail = (component: string, a: [number, number, number], b: [number, number, number], high = 1.0) => {
    for (const h of [.45, high]) bar(component, world(a[0], a[2] + h, a[1]), world(b[0], b[2] + h, b[1]), .024);
    const distance = Math.hypot(b[0] - a[0], b[1] - a[1]), count = Math.max(1, Math.ceil(distance / .8));
    for (let i = 0; i <= count; i++) { const t = i / count, s = a[0] + (b[0] - a[0]) * t, n = a[1] + (b[1] - a[1]) * t, y = a[2] + (b[2] - a[2]) * t; bar(component, world(s, y, n), world(s, y + high, n), .023); }
  };
  const offset = layout.datumOffset, ceil = layout.mainCeilingY, top = layout.upperTopY, bridge = SITE.bridge, by = layout.bridgeFloorY;
  // 차도에는 새 평탄판을 놓지 않는다. 오른쪽 벽과 낮은 보도만 원본 차도 밖에 둔다.
  for (let s = 0; s < SITE.length; s += 3) { const end = Math.min(SITE.length, s + 3), low = Math.min(terrainY(s, -4.7), terrainY(end, -4.7)) - .3;
    const d0 = 8.75, d1 = 11.15, ranges = [[s, Math.min(end, d0)], [Math.max(s, d1), end]].filter(([a,b]) => b > a + .001);
    for (const [a,b] of ranges) box('education101-lower-sidewall', a,b,-4.9,-4.5,low,ceil);
    if (end > d0 && s < d1) { const a=Math.max(s,d0),b=Math.min(end,d1); box('education101-lower-sidewall',a,b,-4.9,-4.5,low,by-.18); box('education101-lower-sidewall',a,b,-4.9,-4.5,by+2.65,ceil); }
  }
  for (const s of [2, 14.2]) box('education101-side-window',s,s+1.7,-4.48,-4.40,60.3+offset,62.0+offset,0x5e9292,glass,'glass');
  terrainFloor('education101-right-sidewalk',rect(0,SITE.length,-4.48,-2.85,0).map(v=>[v.x,v.z] as XZ),(_x,y,_z)=>y+.15,0xb6b7ad);
  for (const s of [0.5,16.6]) cylinder('education101-round-column',s,4.65,terrainY(s,4.65)-.15,ceil,.46);
  box('education101-main-ceiling',0,SITE.length,-4.7,5.15,ceil,ceil+.32,0xaeb4b2,stone,'stone',()=>{for(let n=-4.45;n<5.0;n+=.20) { const g=new THREE.BoxGeometry(SITE.length,.018,.012);g.applyQuaternion(rotation);g.translate(...world(SITE.length/2,ceil-.008,n).toArray());append(metal,g,0x8b9693);g.dispose(); }});
  box('education101-local-upper-roof',-.18,SITE.length+.18,-4.9,5.33,top-.28,top,0xbfc6bf);
  // 남쪽 네 줄 창은 직접 관측했으며, 북쪽의 같은 배열은 미관측 입면의 근사다.
  for (const s of [0,SITE.length]) {
    const thickness=.30;
    for(let row=0;row<4;row++) { const y0=ceil+.32+row*3.12, y1=Math.min(top-.28,y0+3.12), low=y0+1.0, high=Math.min(y1-.26,y0+2.55);
      box('education101-upper-panel-band',s-.15,s+.15,-4.7,5.15,y0,low);
      box('education101-upper-panel-band',s-.15,s+.15,-4.7,5.15,high,y1);
      const count=5,width=(5.15+4.7)/count;
      for(let j=0;j<count;j++) { const n0=-4.7+j*width,n1=n0+width; box('education101-upper-window',s-.11,s+.11,n0+.055,n1-.055,low+.04,high-.04,0x6eaaa9,glass,'glass'); box('education101-upper-window-frame',s-.19,s+.19,n0,n0+.055,low,high,0xbfc9c7,metal,'metal'); }
      box('education101-upper-window-frame',s-.19,s+.19,-4.7,5.15,low+.33,low+.38,0xbfc9c7,metal,'metal');
    }
  }
  for(const n of [-4.7,5.15]) for(let s=0;s<SITE.length;s+=3) box('education101-upper-side-panel',s,Math.min(SITE.length,s+3),n-.15,n+.15,ceil+.32,top-.28);
  // 외부 계단은 양끝 사진의 위치 관계를 따라 연결한다. 정확한 단수는 실측하지 않았다.

  const stairs=SITE.stairs, flightCount=stairs.count/stairs.flights, tread=(stairs.s1-stairs.s0)/flightCount, stairSteps: {s0:number;s1:number;n0:number;n1:number;top:number;component:string;flight:number}[]=[];
  const groundEntry=LINK.groundEntry, gy=layout.stairsLowerFloor;
  terrainFloor('education10-front-paving',rect(0,16,2.85,5.42,0).map(v=>[v.x,v.z] as XZ),(x,y,z)=>{const p=education101Local(x,z),blend=Math.min(THREE.MathUtils.clamp(p.s/1.8,0,1),THREE.MathUtils.clamp((16-p.s)/3.8,0,1),THREE.MathUtils.clamp((p.n-2.85)/.6,0,1));return(y+.035)*(1-blend)+gy*blend;},0xb8b9b0);
  floor('education101-link-stair-bottom',rect(stairs.s0-stairs.landingLength,stairs.s0,stairs.n0,3.95,gy),0xb8b9b0,false,true);
  for(let i=0;i<stairs.count;i++){
    const flight=Math.floor(i/flightCount),j=i%flightCount,forward=flight!==1,s0=forward?stairs.s0+j*tread:stairs.s1-(j+1)*tread,s1=s0+tread,n0=forward?2.85:4.05,n1=forward?3.95:5.15,y=gy+(i+1)*layout.stairRise;
    floor('education101-link-stair-tread',rect(s0,s1,n0,n1,y),0x8e9b95,true,true,false,false,false,'metal');stairSteps.push({s0,s1,n0,n1,top:y,component:'education101-link-stair-tread',flight});
  }
  for(let flight=0;flight<stairs.flights;flight++){
    const forward=flight!==1,s0=forward?stairs.s0:stairs.s1,s1=forward?stairs.s1:stairs.s0,n0=forward?2.85:4.05,n1=forward?3.95:5.15,y0=gy+flight*flightCount*layout.stairRise,y1=gy+(flight+1)*flightCount*layout.stairRise;
    for(const n of[n0+.005,n1-.005])rail('education101-external-stair-rail',[s0,n,y0],[s1,n,y1]);
    for(const n of[n0+.015,n1-.015]){
      const points=[world(s0,y0-.05,n-.035),world(s1,y1-.05,n-.035),world(s1,y1-.32,n-.035),world(s0,y0-.32,n-.035)];
      part('education101-stair-stringer',[...points,...points.map(p=>p.clone().addScaledVector(across,.07))],0x73837d,metal,'metal');
    }
    if(flight<2){const a=forward?stairs.s1:stairs.s0-stairs.landingLength,b=a+stairs.landingLength,outer=forward?b:a;
      floor('education101-link-stair-landing',rect(a,b,stairs.n0,stairs.n1,y1),0x8e9b95,true,true,false,false,false,'metal');
      rail('education101-external-stair-rail',[outer,2.86,y1],[outer,5.14,y1]);for(const n of[2.86,5.14])rail('education101-external-stair-rail',[a,n,y1],[b,n,y1]);
    }
  }
  floor('education101-low-connecting-bridge',rect(bridge.s0,bridge.s1,bridge.n0,bridge.n1,by),0xa4aaa3,true,true,false,false);
  // 남쪽 난간은 외부 계단이 닿는 폭을 열어 상부참과 이어지게 한다.
  rail('education101-bridge-rail',[bridge.s0,-4.5,by],[bridge.s0,2.60,by]);
  rail('education101-bridge-rail',[bridge.s0,4.2,by],[bridge.s0,5.15,by]);
  rail('education101-bridge-rail',[bridge.s1,-4.5,by],[bridge.s1,bridge.n1,by]);
  floor('education101-upper-lobby',rect(8.65,11.25,-7.4,-4.65,by),0xafb2a8,true,true,false,false);
  box('education101-upper-lobby-back',8.55,11.35,-7.6,-7.4,by,by+2.65,0xc2c8c0);
  for(const s of [8.55,11.35])box('education101-upper-lobby-return',s-.10,s+.10,-7.6,-4.65,by,by+2.65,0xc2c8c0);
  const upperDoor=box('education101-upper-link-door',8.85,11.05,-4.74,-4.66,by,by+2.55,0x56898a,glass,'glass',()=>doorDecor(8.85,11.05,-4.62,by,2.55));
  const gs=groundEntry.s,gn=groundEntry.n,gh=groundEntry.height;
  floor('education10-ground-entry-floor',rect(gs-1.12,gs+1.12,5.42,groundEntry.lobbyEndN,gy),0xb8b9b0,false,true);
  box('education10-ground-entry-back',gs-1.12,gs+1.12,groundEntry.lobbyEndN,groundEntry.lobbyEndN+.15,gy,gy+2.75,0x788079);
  for(const s of[gs-1.12,gs+1.12])box('education10-ground-entry-return',s-.06,s+.06,gn+.25,groundEntry.lobbyEndN,gy,gy+2.75,0xc4c9bf);
  const tenGroundDoor=box('education10-ground-glass-door',gs-1,gs+1,gn-.08,gn+.02,gy,gy+gh,0x486b68,glass,'glass',()=>doorDecor(gs-1,gs+1,gn-.08,gy,gh,-1));
  for(const s of[gs-1.05,gs+1.05])box('education10-ground-door-frame',s-.035,s+.035,gn-.16,gn-.03,gy,gy+gh+.06,0xb4bfba,metal,'metal');
  box('education10-ground-door-frame',gs-1.085,gs+1.085,gn-.16,gn-.03,gy+gh,gy+gh+.06,0xb4bfba,metal,'metal');
  for(const s of[.5,16.6]){const y=terrainY(s,4.65);cylinder('education101-column-dark-base',s,4.65,y-.15,y+.48,.475,0x73756e);}
  // 10동 외벽을 통과하는 짧은 연결참이다. 관측하지 못한 내부 복도는 확장하지 않는다.
  floor('education10-link-landing',rect(bridge.s0,bridge.s1,bridge.n1,LINK.floorEndN,by),0xa4aaa3,true,true,false,false);
  box('education10-link-recess-back',bridge.s0,bridge.s1,LINK.floorEndN,LINK.floorEndN+.16,by,by+2.73,0x767c75);
  for (const s of [bridge.s0,bridge.s1]) box('education10-link-recess-return',s-.07,s+.07,5.85,LINK.floorEndN,by,by+2.73,0xc6c9bf);
  rail('education10-link-edge-rail',[bridge.s0,5.15,by],[bridge.s0,5.52,by]);
  rail('education10-link-edge-rail',[bridge.s1,5.15,by],[bridge.s1,5.52,by]);
  // 연녹색 곡면 유리 차양과 금속 격자는 2025년 7월 북쪽 거리뷰에서 확인했다.
  const canopyLink=LINK.canopy, canopySlices=8, canopyBays=4;
  const canopyY=(s:number)=>by+canopyLink.spring+canopyLink.rise*Math.sqrt(Math.max(0,1-((s-(canopyLink.s0+canopyLink.s1)/2)/((canopyLink.s1-canopyLink.s0)/2))**2));
  for(let k=0;k<canopyBays;k++)for(let j=0;j<canopySlices;j++){
    const a=canopyLink.s0+(canopyLink.s1-canopyLink.s0)*j/canopySlices,b=canopyLink.s0+(canopyLink.s1-canopyLink.s0)*(j+1)/canopySlices;
    const n0=canopyLink.n0+(canopyLink.n1-canopyLink.n0)*k/canopyBays,n1=canopyLink.n0+(canopyLink.n1-canopyLink.n0)*(k+1)/canopyBays;
    const points=[world(a,canopyY(a),n0),world(b,canopyY(b),n0),world(b,canopyY(b),n1),world(a,canopyY(a),n1)];
    part('education10-link-canopy-glass',[...points,...points.map(p=>p.clone().addScaledVector(up,-.035))],0x87b7a2,glass,'glass');
  }
  for(let k=0;k<=canopyBays;k++)for(let j=0;j<canopySlices;j++){
    const a=canopyLink.s0+(canopyLink.s1-canopyLink.s0)*j/canopySlices,b=canopyLink.s0+(canopyLink.s1-canopyLink.s0)*(j+1)/canopySlices,n=canopyLink.n0+(canopyLink.n1-canopyLink.n0)*k/canopyBays;
    bar('education10-link-canopy-rib',world(a,canopyY(a)+.02,n),world(b,canopyY(b)+.02,n),.03,0xabb9af);
  }
  for(let j=0;j<=canopySlices;j+=2){const s=canopyLink.s0+(canopyLink.s1-canopyLink.s0)*j/canopySlices;bar('education10-link-canopy-longitudinal',world(s,canopyY(s)+.02,canopyLink.n0),world(s,canopyY(s)+.02,canopyLink.n1),.027,0xabb9af);}
  for(const s of[canopyLink.s0,canopyLink.s1])bar('education10-link-canopy-post',world(s,by,canopyLink.n0),world(s,canopyY(s),canopyLink.n0),.035,0xabb9af);
  const tenEndPillars=[[2.81,5.85],[11.27,5.63]].map(([s,n])=>box('education10-end-white-pilaster',s-.14,s+.14,n-.51,n-.34,52.5+offset,66.48+offset,0xc7c9bf));
  // 사진의 깊은 현관은 원본 입구 노드와 두 촬영점 방위를 맞춘 근사다.
  const entry=SITE.entry, es=entry.s, ef=layout.entryFloor, ff=layout.forecourtFloor, en=entry.n;
  terrainFloor('education101-entry-forecourt',rect(-16,0,-13.1,-2.85,0).map(v=>[v.x,v.z] as XZ),(_x,y,_z)=>y+.15,0xc1c0b5);
  floor('education101-entry-upper-landing',rect(es-3,es+3,en,-11.85,ef),0xbfc1b7,false,true);
  for(let i=0;i<3;i++){const n1=-10.65-i*.4,n0=n1-.4,y=ff+(i+1)*.16;floor('education101-entry-step',rect(es-3,es+3,n0,n1,y),0xb8bbb1,false,true);}
  const rampS0=-13.2,rampS1=es-3,rampN0=-12.75,rampN1=-11.05;
  floor('education101-entry-ramp',[world(rampS0,ff,rampN0),world(rampS1,ef,rampN0),world(rampS1,ef,rampN1),world(rampS0,ff,rampN1)],0xb6b9b0);
  for(const n of [rampN0,rampN1])rail('education101-entry-ramp-rail',[rampS0,n,ff],[rampS1,n,ef],.92);
  floor('education101-entry-lobby-floor',rect(es-3,es+3,en-3,en,ef),0xb5b9b0,false,true,false,false);
  box('education101-entry-lobby-back',es-3.1,es+3.1,en-3.2,en-3.0,ef,ef+3.4);
  for(const s of [es-3.1,es+3.1])box('education101-entry-lobby-return',s-.1,s+.1,en-3.2,en,ef,ef+3.4);
  box('education101-entry-lobby-ceiling',es-3.1,es+3.1,en-3.2,en,ef+3.4,ef+3.65);
  const mainDoor=box('education101-main-door',es-1.5,es+1.5,en-.055,en+.055,ef,ef+2.7,0x477c7f,glass,'glass',()=>doorDecor(es-1.5,es+1.5,en+.06,ef,2.7));
  for(const [a,b]of[[es-3.0,es-1.54],[es+1.54,es+3]])box('education101-entry-side-glass',a,b,en-.05,en+.05,ef,ef+2.7,0x568e90,glass,'glass');
  for(const [a,b]of[[es-4.05,es-3.08],[es+3.08,es+4.05]])box('education101-entry-outer-fixed-glass',a,b,en-.05,en+.05,ff,ef+3.65,0x568e90,glass,'glass');
  for(const s of[es-4.08,es+4.08])box('education101-entry-core-return',s-.13,s+.13,en-.35,en+.35,ff,75.48+offset,0xcbd0c7);
  box('education101-entry-transom',es-3,es+3,en-.055,en+.055,ef+2.76,ef+3.35,0x609b9b,glass,'glass');
  for(const s of [es-3.05,es-1.53,es+1.53,es+3.05])box('education101-entry-fixed-frame',s-.035,s+.035,en-.09,en+.09,ef,ef+3.4,0xbec9c6,metal,'metal');
  for(const y of [ef+2.72,ef+3.37])box('education101-entry-fixed-frame',es-3.08,es+3.08,en-.09,en+.09,y-.03,y+.03,0xbec9c6,metal,'metal');
  for(const s of [es-3.18,es+3.18])box('education101-entry-canopy-post',s-.12,s+.12,-11.025,-10.775,ff,ef+3.35);
  const canopy=box('education101-entry-canopy',es-3.45,es+3.45,en-.1,-10.68,ef+3.35,ef+3.65,0xd6d6ca);
  const coreTop=75.48+offset;
  for(let row=0,y=ef+3.66;y<coreTop-.01;row++,y+=2.1){const y1=Math.min(coreTop,y+2.1);for(let col=0;col<5;col++){const s0=es-4.0+col*1.6;box('education101-entry-curtain-glass',s0+.045,s0+1.555,en-.03,en+.03,y+.045,y1-.045,0x68a8a6,glass,'glass');box('education101-entry-curtain-mullion',s0,s0+.045,en-.09,en+.09,y,y1,0xb9c6c2,metal,'metal');}box('education101-entry-curtain-transom',es-4,es+4,en-.09,en+.09,y,y+.045,0xb9c6c2,metal,'metal');}
  // 노란 띠는 사진에서 확인된 상하 유도블록 범위에 한정한다.
  for(const [n,y]of[[-10.35,ff+.012],[-12.05,ef+.012]])box('education101-entry-yellow-strip',es-2.95,es+2.95,n-.17,n+.17,y-.012,y+.012,0xd1b548);
  // 문 앞 벤치 두 개와 큰 기둥은 통행 폭 밖에 둔다.
  cylinder('education101-entry-round-column',-13.1,-8.9,terrainY(-13.1,-8.9)-.1,66.4+offset,.48);
  for(const s of [-14.7,-11.8]){const n=-8.8,y=ground(...education101Point(s,n))+.15;box('education101-entry-bench-seat',s-1.05,s+1.05,n-.30,n+.30,y+.40,y+.49,0x665d4b);box('education101-entry-bench-back',s-1.05,s+1.05,n-.34,n-.26,y+.49,y+.95,0x665d4b);for(const a of[s-.75,s+.75])box('education101-entry-bench-leg',a-.04,a+.04,n-.23,n+.23,y,y+.43,0x49534b,metal,'metal');}
  const pixels=new Uint8Array(128*128*4);for(let y=0;y<128;y++)for(let x=0;x<128;x++){const joint=x%32<1||y%32<1,cell=Math.floor(x/32)+Math.floor(y/32)*4,v=x>123&&y>123?255:joint?146:225+(cell*7)%27,i=(y*128+x)*4;pixels[i]=pixels[i+1]=pixels[i+2]=v;pixels[i+3]=255;}
  const texture=new THREE.DataTexture(pixels,128,128);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.NearestFilter;texture.needsUpdate=true;
  const signs: { owner: THREE.Mesh; mesh: THREE.Mesh }[]=[];
  function sign(owner:THREE.Mesh,label:string,s:number,n:number,y:number,width:number,height:number,facing:'north'|'outward'|'inward',numberOnly=false){
    const canvas=document.createElement('canvas');canvas.width=numberOnly?192:1024;canvas.height=160;const ctx=canvas.getContext('2d')!;if(!numberOnly){ctx.fillStyle='#d4d6ce';ctx.fillRect(0,0,1024,160);}ctx.fillStyle='#202a2c';ctx.font=numberOnly?'bold 128px sans-serif':'bold 48px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,canvas.width/2,80,canvas.width-16);const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
    const g=new THREE.PlaneGeometry(width,height);g.scale(-1,1,1);const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({map,roughness:.8,side:THREE.DoubleSide,transparent:numberOnly,alphaTest:numberOnly?.1:0}));const normal=facing==='north'?axis:facing==='inward'?across.clone().negate():across,right=new THREE.Vector3(normal.z,0,-normal.x);mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,normal));mesh.position.copy(world(s,y,n));Object.assign(mesh.userData,{component:'education101-observed-sign',ownerComponent:owner.userData.component,coordinates:'D; parent H applies once.'});shell.add(mesh);signs.push({owner,mesh});
  }
  const bridgeSign=box('education101-college-sign-back',bridge.s1+.01,bridge.s1+.09,-3.5,4.05,by+.18,by+.85,0xc8cfc9);
  sign(bridgeSign,'사범대학  COLLEGE OF EDUCATION',bridge.s1+.095,.275,by+.515,7.45,.62,'north');
  box('education101-unread-display',bridge.s1+.01,bridge.s1+.10,-3.5,4.05,by+.90,by+1.35,0x172024,metal,'metal');
  sign(canopy,'10-1 교육정보관  Education Information Hall',es,-10.665,ef+3.50,6.7,.28,'outward');
  sign(tenEndPillars[0],'10',6.6,5.24,by+2,.95,.65,'inward',true);
  const tenLinkRoute=[-6.4,-3.8,2.6,4.6,5.8,7.25].map(n=>routePoint(9.95,n,by));
  shell.userData.education10Link={buildingId:LINK.buildingId,routeWorld:tenLinkRoute,openingWidth:LINK.s1-LINK.s0,canopy:canopyLink,interiorDepthEstimated:true,interiorReconstructed:false,lowerStairNotYetReconstructed:true,sourcePanoid:'1198671992',photoDate:'2025-07'};
  for(const[i,bucket]of buckets.entries()){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(bucket.positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(bucket.colors,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(bucket.uvs,2));g.computeVertexNormals();g.computeBoundingSphere();g.computeBoundingBox();bucket.geometry=g;const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,map:i?null:texture,roughness:i===2?.28:.82,metalness:i===1?.35:0,transparent:i===2,opacity:i===2?.72:1,side:THREE.DoubleSide}));mesh.name=['education101-stone','education101-metal','education101-glass'][i];mesh.castShadow=mesh.receiveShadow=true;shell.add(mesh);}
  const groundRoute=Array.from({length:25},(_,i)=>{const s=-3+(SITE.length+6)*i/24;return routePoint(s,0,terrainY(s,0));});
  const stairRoute=[routePoint(2.65,3.4,gy),routePoint(3.75,3.4,gy)];
  for(let flight=0;flight<stairs.flights;flight++){
    const n=flight===1?4.6:3.4,y=gy+(flight+1)*flightCount*layout.stairRise;
    stairRoute.push(...stairSteps.filter(t=>t.flight===flight).map(t=>routePoint((t.s0+t.s1)/2,n,t.top)));
    if(flight===0)stairRoute.push(routePoint(9.15,3.4,y),routePoint(9.15,4.6,y));
    if(flight===1)stairRoute.push(routePoint(3.75,4.6,y),routePoint(3.75,3.4,y));
  }
  stairRoute.push(routePoint(9.95,3.4,by),routePoint(9.95,-3.8,by),routePoint(9.95,-6.4,by));
  shell.userData.education10GroundEntry={buildingId:LINK.buildingId,doorComponent:tenGroundDoor.userData.component,routeWorld:[routePoint(gs,2.3,gy),routePoint(gs,3.5,gy),routePoint(gs,5.0,gy),routePoint(gs,gn,gy),routePoint(gs,7.25,gy)],floorY:gy,doorWidth:groundEntry.width,sourcePanoid:'1198671990',photoDate:'2025-07',dimensionsEstimated:true,interiorReconstructed:false};
  const mainRoute=[routePoint(es,-2.9,terrainY(es,-2.9)+.15),routePoint(es,-8.8,ff),routePoint(es,-10.5,ff),routePoint(es,-11.85,ef),routePoint(es,en,ef),routePoint(es,en-2.6,ef)];
  const rampRoute=[routePoint(rampS0-.6,-10.2,terrainY(rampS0-.6,-10.2)+.15),routePoint(rampS0-.6,-11.9,ff),routePoint(rampS0,-11.9,ff),routePoint(rampS1,-11.9,ef),routePoint(es,-12.2,ef),routePoint(es,en-2.6,ef)];
  shell.userData.education101Access={buildingId:SITE.buildingId,sourceRoad:SITE.sourceRoad,layout,portal:{sourceSegment:3,originalEndpoints:[SITE.origin,SITE.end],routeWorld:groundRoute,roadFloorPreserved:true,clearWidth:5.5,mainCeilingY:ceil,lowerBridgeBottom:by-.25},externalStairs:{routeWorld:stairRoute,steps:stairSteps,width:1.1,directionChanges:2,flightCount:3,openUnderside:true,exactStepCountMeasured:false},upperDoor:{component:upperDoor.userData.component,center:routePoint(9.95,-4.7,by),outward:[SITE.across.x,0,SITE.across.z],width:2.2,height:2.55},entry:{sourceNode:SITE.sourceEntrance.nodeId,originalPoint:SITE.sourceEntrance.point,photoAnchorMethod:'원본 입구 노드와 두 촬영점 방위 및 오목한 현관 배치를 대조한 근사',door:{component:mainDoor.userData.component,center:routePoint(es,en,ef),outward:[SITE.across.x,0,SITE.across.z],width:3,height:2.7},routeWorld:mainRoute,rampRouteWorld:rampRoute,lobbyDepth:3,shortSteps:3,stepRise:.16,forecourtFloor:ff,floorY:ef},surfaceComponents:[...new Set(floorTriangles.map(t=>t.component))],wallComponents:['education101-lower-sidewall','education101-round-column','education101-upper-panel-band'],pavementMasks,floorTriangles,scope:{dimensionsEstimated:true,currentRoadviewDate:'2025-07',bothPortalEndsObserved:true,upperWindowRowsObserved:4,upperWindowRowsObservationFace:'south',northUpperWindowsEstimated:true,wholeBuildingStoreysConfirmed:false,upperBridgeAndExternalStairObserved:true,exactUpperInteriorUnobserved:true,wholeBuildingFacadeReconstructed:false,temporaryBannersOrBarriersModelled:false,groundEntranceShortStepsAndRampObserved:true,unreadDisplayContentOmitted:true},geometry:{parts:parts.length,triangles:buckets.reduce((sum,b)=>sum+b.positions.length/9,0),mergedMeshes:3,signMeshes:signs.length,textures:1+signs.length}};
  function maskMappedArea(vertices: number[], areaId: string) {
    const bounds = (p: XYZ[]) => ({ x0: Math.min(...p.map(v => v[0])), x1: Math.max(...p.map(v => v[0])), z0: Math.min(...p.map(v => v[2])), z1: Math.max(...p.map(v => v[2])) });
    const area = (p: XYZ[]) => Math.abs(p.reduce((sum, a, i) => { const b = p[(i + 1) % p.length]; return sum + a[0] * b[2] - b[0] * a[2]; }, 0));
    const region = { x0: 615, x1: 680, z0: -735, z1: -670 };
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < vertices.length; i += 3) { x0 = Math.min(x0, vertices[i]); x1 = Math.max(x1, vertices[i]); z0 = Math.min(z0, vertices[i + 2]); z1 = Math.max(z1, vertices[i + 2]); }
    if (x1 < region.x0 || x0 > region.x1 || z1 < region.z0 || z0 > region.z1) return;
    const masks = pavementMasks.map(m => { const p = m.polygon.map(v => [v[0], 0, v[1]] as XYZ); return { points: p, bounds: bounds(p), sign: Math.sign(p.reduce((sum, a, i) => { const b = p[(i + 1) % p.length]; return sum + a[0] * b[2] - b[0] * a[2]; }, 0)) }; });
    const overlaps = (a: ReturnType<typeof bounds>, b: ReturnType<typeof bounds>) => a.x1 >= b.x0 && a.x0 <= b.x1 && a.z1 >= b.z0 && a.z0 <= b.z1;
    const output: number[] = []; let touched = 0;
    for (let i = 0; i < vertices.length; i += 9) {
      const original = [vertices.slice(i, i + 3), vertices.slice(i + 3, i + 6), vertices.slice(i + 6, i + 9)] as XYZ[], box = bounds(original);
      if (!overlaps(box, region)) { output.push(...vertices.slice(i, i + 9)); continue; }
      const candidates = masks.filter(m => overlaps(box, m.bounds));
      if (!candidates.length) { output.push(...vertices.slice(i, i + 9)); continue; }
      let pieces = [original], changed = false;
      for (const mask of candidates) pieces = pieces.flatMap(piece => {
        const lines = mask.points.map((a, j) => { const b = mask.points[(j + 1) % mask.points.length]; return (p: XYZ) => mask.sign * ((b[0] - a[0]) * (p[2] - a[2]) - (b[2] - a[2]) * (p[0] - a[0])); });
        const intersection = lines.reduce((p, line) => clip(p, line), piece); if (intersection.length < 3 || area(intersection) < 1e-8) return [piece];
        changed = true; let rest = piece; const outside: XYZ[][] = [];
        for (const line of lines) { const p = clip(rest, v => -line(v)); if (p.length >= 3 && area(p) > 1e-8) outside.push(p); rest = clip(rest, line); if (rest.length < 3) break; } return outside;
      });
      if (changed) touched++;
      for (const p of pieces) for (let j = 1; j + 1 < p.length; j++) if (area([p[0], p[j], p[j + 1]]) > 1e-8) output.push(...p[0], ...p[j], ...p[j + 1]);
    }
    if (touched) { (shell.userData.education101Access.maskedAreaOverlays ??= []).push({ areaId, beforeTriangles: vertices.length / 9, afterTriangles: output.length / 9, touchedTriangles: touched, onlyActualPavementFootprints: true, originalTerrainAndAreaDataPreserved: true }); vertices.length = 0; for (const v of output) vertices.push(v); }
  }
  function update(_player: THREE.Vector3) {
    const moved = new Set<Bucket>(), recolored = new Set<Bucket>();
    for (const p of parts) { if (p.shown !== p.proxy.visible) { p.shown = p.proxy.visible; for (const r of p.ranges) { if (r.start === r.end) continue; const a = r.bucket.geometry!.getAttribute('position'); if (p.shown) (a.array as Float32Array).set(r.original, r.start); else for (let j = r.start; j < r.end; j += 3) { a.array[j] = p.proxy.position.x; a.array[j + 1] = p.proxy.position.y; a.array[j + 2] = p.proxy.position.z; } moved.add(r.bucket); } } const tint = p.proxy.material.color, hex = tint.getHex(); if (p.color !== hex) { p.color = hex; for (const r of p.ranges) { const a = r.bucket.geometry!.getAttribute('color'); for (let j = r.start; j < r.end; j += 3) { a.array[j] = hex === p.base ? r.bucket.colors[j] : tint.r; a.array[j + 1] = hex === p.base ? r.bucket.colors[j + 1] : tint.g; a.array[j + 2] = hex === p.base ? r.bucket.colors[j + 2] : tint.b; } recolored.add(r.bucket); } } }
    for (const b of moved) b.geometry!.getAttribute('position').needsUpdate = true; for (const b of recolored) b.geometry!.getAttribute('color').needsUpdate = true; for (const sign of signs) sign.mesh.visible = sign.owner.visible; shell.visible = parts.some(p => p.proxy.visible);
  }
  return { shell, breakables, update, layout, maskMappedArea };
}
