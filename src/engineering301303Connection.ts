import * as THREE from 'three';
import type { BreakableSpec } from './scene';
import { engineering301303Datum, ENGINEERING_CONNECTION_SITE } from './engineering301303Site';

export type ConnectionPoint = [number, number, number];
export type ConnectionDeck = {
  id: string;
  a: ConnectionPoint;
  b: ConnectionPoint;
  width: number;
  thickness: number;
  underframe?: { depth: number; bayLength: number; memberWidth: number };
};
export type ConnectionRail = {
  id: string;
  a: ConnectionPoint;
  b: ConnectionPoint;
  screenBottom: number;
  screenTop: number;
  glassTop: number;
  slatWidth: number;
  slatPitch: number;
  panelLength: number;
};
export type ConnectionStair = {
  id: string;
  a: ConnectionPoint;
  b: ConnectionPoint;
  width: number;
  count: number;
  thickness: number;
};
export type Engineering301303ConnectionLayout = {
  decks: ConnectionDeck[];
  rails: ConnectionRail[];
  columns: { id: string; x: number; z: number; bottom: number; top: number; radius: number }[];
  landings?: { id: string; points: ConnectionPoint[]; thickness: number }[];
  lifts?: { id: string; x: number; z: number; bottom: number; top: number; width: number; depth: number }[];
  stairs?: ConnectionStair[];
  handrails?: { id: string; a: ConnectionPoint; b: ConnectionPoint; height: number }[];
  sourceUrls: string[];
  dimensionsEstimated: true;
  siteAlignmentConfirmed: boolean;
};

type Surface = { positions: number[]; colors: number[]; geometry?: THREE.BufferGeometry };
type Part = { proxy: THREE.Mesh; surface: Surface; start: number; end: number; original: Float32Array; shown: boolean };

/** D=(동,위,북) 좌표의 명시적 배치를 받는다. 보행면 높이나 현관 위치를 자동으로 추정하지 않는다. */
export function createEngineering301303Connection(scene: THREE.Scene, layout: Engineering301303ConnectionLayout) {
  const id = 'connection/engineering301-303';
  if (scene.children.some(o => o.userData.connectionId === id)) throw Error('301-303 connection already exists in this world.');
  const finite = (values: number[]) => values.every(Number.isFinite);
  const point = (p: ConnectionPoint) => new THREE.Vector3(...p);
  const horizontalLength = (a: ConnectionPoint, b: ConnectionPoint) => Math.hypot(a[0] - b[0], a[2] - b[2]);
  for (const d of layout.decks) if (!finite([...d.a, ...d.b, d.width, d.thickness]) || horizontalLength(d.a, d.b) < .1 || d.width <= 0 || d.thickness <= 0) throw Error('Invalid connection deck.');
  for (const r of layout.rails) if (!finite([...r.a, ...r.b, r.screenBottom, r.screenTop, r.glassTop, r.slatWidth, r.slatPitch, r.panelLength]) || horizontalLength(r.a, r.b) < .1 || r.screenTop <= r.screenBottom || r.glassTop <= r.screenTop || r.slatWidth <= 0 || r.slatPitch <= r.slatWidth || r.panelLength <= 0) throw Error('Invalid connection railing.');
  for (const c of layout.columns) if (!finite([c.x, c.z, c.bottom, c.top, c.radius]) || c.top <= c.bottom || c.radius <= 0) throw Error('Invalid connection column.');
  for (const s of layout.stairs ?? []) if (!finite([...s.a, ...s.b, s.width, s.count, s.thickness]) || horizontalLength(s.a, s.b) < .1 || s.width <= 0 || !Number.isInteger(s.count) || s.count < 1 || s.thickness <= 0) throw Error('Invalid connection stair.');

  const shell = new THREE.Group();
  shell.name = id;
  Object.assign(shell.userData, {
    buildingId: id, connectionId: id, role: 'campus-connection', landmark: 'engineering301-303-connection',
    coordinates: 'D=(east,up,north); parent H applies once after construction.',
    layout: structuredClone(layout), dimensionsEstimated: true, siteAlignmentConfirmed: layout.siteAlignmentConfirmed,
    joinedBuildingIds: ['way/228476658', 'supplemental/snu-303'],
  });
  const structure: Surface = { positions: [], colors: [] }, fittings: Surface = { positions: [], colors: [] }, glazing: Surface = { positions: [], colors: [] };
  const parts: Part[] = [], breakables: BreakableSpec[] = [];
  const up = new THREE.Vector3(0, 1, 0), cube = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const materials = {
    stone: new THREE.MeshStandardMaterial({ color: 0xbfc2b8 }), metal: new THREE.MeshStandardMaterial({ color: 0x323b3b }),
    wood: new THREE.MeshStandardMaterial({ color: 0xa87862 }), glass: new THREE.MeshStandardMaterial({ color: 0xb4cbd0 }),
  };

  function append(geometry: THREE.BufferGeometry, surface: Surface, material: keyof typeof materials, component: string, color: number, metadata: Record<string, unknown> = {}) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    g.computeBoundingBox();
    const bounds = g.boundingBox!, center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const positions = g.getAttribute('position'), tint = new THREE.Color(color), start = surface.positions.length;
    for (let i = 0; i < positions.count; i++) { surface.positions.push(positions.getX(i), positions.getY(i), positions.getZ(i)); surface.colors.push(tint.r, tint.g, tint.b); }
    // 렌더와 동일한 볼록 부품만 하나의 충돌 형상으로 묶는다. 난간 틈과 다리 밑은 포함하지 않는다.
    const collisionGeometry = g.clone().translate(-center.x, -center.y, -center.z);
    const collisionVertices = Float32Array.from(collisionGeometry.getAttribute('position').array);
    const proxy = new THREE.Mesh(collisionGeometry, materials[material]); proxy.position.copy(center);
    Object.assign(proxy.userData, { buildingId: id, connectionId: id, landmark: 'engineering301-303-connection', component, renderProxy: true, convex: true, ...metadata });
    proxy.updateMatrixWorld(true);
    parts.push({ proxy, surface, start, end: surface.positions.length, original: Float32Array.from(surface.positions.slice(start)), shown: true });
    breakables.push({ mesh: proxy, size, collisionVertices, toughness: material === 'glass' ? 5 : material === 'wood' ? 7 : 15, material, label: '301동과 303동 연결 통로' });
    if (g !== geometry) g.dispose();
    geometry.dispose();
  }
  function beam(a: THREE.Vector3, b: THREE.Vector3, width: number, depth: number, component: string, color = 0x323b3b, material: keyof typeof materials = 'metal', surface = fittings, metadata: Record<string, unknown> = {}, crossSectionUp?: THREE.Vector3) {
    const direction = b.clone().sub(a), length = direction.length(); if (length < .001) return;
    const ex = direction.multiplyScalar(1 / length), ey = up.clone().addScaledVector(ex, -up.dot(ex));
    if (crossSectionUp) ey.copy(crossSectionUp).addScaledVector(ex, -crossSectionUp.dot(ex));
    if (ey.lengthSq() < 1e-8) ey.set(1, 0, 0); ey.normalize(); const ez = new THREE.Vector3().crossVectors(ex, ey).normalize();
    const matrix = new THREE.Matrix4().makeBasis(ex, ey, ez).scale(new THREE.Vector3(length, depth, width)); matrix.setPosition(a.clone().add(b).multiplyScalar(.5));
    append(cube.clone().applyMatrix4(matrix), surface, material, component, color, metadata);
  }
  function trianglePrism(top: THREE.Vector3[], thickness: number, component: string, metadata: Record<string, unknown>) {
    if (top[1].clone().sub(top[0]).cross(top[2].clone().sub(top[0])).y < 0) top = [top[0], top[2], top[1]];
    const bottom = top.map(p => p.clone().addScaledVector(up, -thickness)), values: number[] = [];
    const triangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => values.push(...a.toArray(), ...b.toArray(), ...c.toArray());
    triangle(...top as [THREE.Vector3, THREE.Vector3, THREE.Vector3]); triangle(bottom[0], bottom[2], bottom[1]);
    for (let i = 0; i < 3; i++) { const j = (i + 1) % 3; triangle(top[i], bottom[i], bottom[j]); triangle(top[i], bottom[j], top[j]); }
    append(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(values, 3)), structure, 'stone', component, 0xbfc2b8, metadata);
  }
  function deckTile(a: THREE.Vector3, b: THREE.Vector3, side: THREE.Vector3, left: number, right: number, thickness: number, component: string, metadata: Record<string, unknown>) {
    const v = [a.clone().addScaledVector(side, left), b.clone().addScaledVector(side, left), b.clone().addScaledVector(side, right), a.clone().addScaledVector(side, right)];
    trianglePrism([v[0], v[1], v[2]], thickness, component, metadata); trianglePrism([v[0], v[2], v[3]], thickness, component, metadata);
  }

  for (const d of layout.decks) {
    const a = point(d.a), b = point(d.b), length = horizontalLength(d.a, d.b), forward = b.clone().sub(a).setY(0).normalize(), side = new THREE.Vector3(-forward.z, 0, forward.x);
    const along = Math.ceil(length / 3), across = Math.ceil(d.width / 2.5);
    for (let i = 0; i < along; i++) for (let j = 0; j < across; j++) deckTile(a.clone().lerp(b, i / along), a.clone().lerp(b, (i + 1) / along), side, -d.width / 2 + d.width * j / across, -d.width / 2 + d.width * (j + 1) / across, d.thickness, 'deck-panel', { section: d.id, cell: [i, j] });
    if (d.underframe) {
      const { depth, bayLength, memberWidth } = d.underframe;
      if (!finite([depth, bayLength, memberWidth]) || depth <= 0 || bayLength <= 0 || memberWidth <= 0) throw Error('Invalid underframe.');
      const count = Math.ceil(length / bayLength), drop = -d.thickness - depth / 2;
      for (const offset of [-d.width / 2 + memberWidth, d.width / 2 - memberWidth]) for (let i = 0; i < count; i++) beam(a.clone().lerp(b, i / count).addScaledVector(side, offset).addScaledVector(up, drop), a.clone().lerp(b, (i + 1) / count).addScaledVector(side, offset).addScaledVector(up, drop), memberWidth, depth, 'underframe-edge', 0x252e2f, 'metal', fittings, { section: d.id });
      for (let i = 0; i <= count; i++) { const p = a.clone().lerp(b, i / count).addScaledVector(up, drop); beam(p.clone().addScaledVector(side, -d.width / 2), p.clone().addScaledVector(side, d.width / 2), memberWidth, depth, 'underframe-crossbeam', 0x303839, 'metal', fittings, { section: d.id }); }
      for (let i = 0; i < count; i++) { const p = a.clone().lerp(b, i / count).addScaledVector(up, -d.thickness - depth + .07), q = a.clone().lerp(b, (i + 1) / count).addScaledVector(up, -d.thickness - depth + .07); for (const sign of [-1, 1]) beam(p.clone().addScaledVector(side, sign * d.width / 2), q.clone().addScaledVector(side, -sign * d.width / 2), .11, .10, 'underframe-x-brace', 0x47504c, 'metal', fittings, { section: d.id }); }
    }
  }
  for (const landing of layout.landings ?? []) {
    const points=landing.points.map(point),faces=THREE.ShapeUtils.triangulateShape(points.map(p=>new THREE.Vector2(p.x,p.z)),[]);
    for(const face of faces)trianglePrism(face.map(i=>points[i]),landing.thickness,'landing-panel',{landing:landing.id});
  }
  for (const r of layout.rails) {
    const a = point(r.a), b = point(r.b), length = horizontalLength(r.a, r.b), direction = b.clone().sub(a).setY(0).normalize(), normal = new THREE.Vector3(-direction.z, 0, direction.x);
    const slats = Math.max(1, Math.floor(length / r.slatPitch)), panels = Math.ceil(length / r.panelLength);
    for (let i = 0; i < slats; i++) { const p = a.clone().lerp(b, (i + .5) / slats); beam(p.clone().addScaledVector(up, r.screenBottom), p.clone().addScaledVector(up, r.screenTop), .085, r.slatWidth, 'timber-screen-slat', 0xab7d68, 'wood', fittings, { rail: r.id, index: i }, direction); }
    for (const y of [r.screenBottom, r.screenTop, r.glassTop]) for (let i = 0; i < panels; i++) beam(a.clone().lerp(b, i / panels).addScaledVector(up, y), a.clone().lerp(b, (i + 1) / panels).addScaledVector(up, y), .065, .065, 'rail-horizontal', 0x272f30, 'metal', fittings, { rail: r.id });
    for (let i = 0; i <= panels; i++) { const p = a.clone().lerp(b, i / panels); beam(p.clone().addScaledVector(up, r.screenTop), p.clone().addScaledVector(up, r.glassTop), .05, .05, 'glass-rail-post', 0x272f30, 'metal', fittings, { rail: r.id }); }
    for (let i = 0; i < panels; i++) {
      const p = a.clone().lerp(b, (i + .025) / panels), q = a.clone().lerp(b, (i + .975) / panels), vertices = [p.clone().addScaledVector(up, r.screenTop + .035), q.clone().addScaledVector(up, r.screenTop + .035), q.clone().addScaledVector(up, r.glassTop - .035), p.clone().addScaledVector(up, r.glassTop - .035)], values: number[] = [];
      const back = vertices.map(v => v.clone().addScaledVector(normal, -.025)), t = (x: THREE.Vector3, y: THREE.Vector3, z: THREE.Vector3) => values.push(...x.toArray(), ...y.toArray(), ...z.toArray());
      t(vertices[0], vertices[1], vertices[2]); t(vertices[0], vertices[2], vertices[3]); t(back[0], back[2], back[1]); t(back[0], back[3], back[2]);
      for (let k = 0; k < 4; k++) { const j = (k + 1) % 4; t(vertices[k], back[k], back[j]); t(vertices[k], back[j], vertices[j]); }
      append(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(values, 3)), glazing, 'glass', 'transparent-rail-panel', 0xb7cdd0, { rail: r.id, index: i });
    }
  }
  for (const rail of layout.handrails ?? []) {
    const a=point(rail.a),b=point(rail.b),length=horizontalLength(rail.a,rail.b),count=Math.max(1,Math.ceil(length/1.8));
    for(const h of [.46,rail.height])beam(a.clone().addScaledVector(up,h),b.clone().addScaledVector(up,h),.055,.055,'stair-handrail',0x424e50,'metal',fittings,{handrail:rail.id});
    for(let i=0;i<=count;i++){const p=a.clone().lerp(b,i/count);beam(p,p.clone().addScaledVector(up,rail.height),.065,.065,'stair-handrail-post',0x424e50,'metal',fittings,{handrail:rail.id});}
  }
  for (const c of layout.columns) {
    const count = Math.ceil((c.top - c.bottom) / 3);
    for (let i = 0; i < count; i++) { const low = THREE.MathUtils.lerp(c.bottom, c.top, i / count), high = THREE.MathUtils.lerp(c.bottom, c.top, (i + 1) / count); append(new THREE.CylinderGeometry(c.radius, c.radius, high - low, 16, 1).translate(c.x, (low + high) / 2, c.z), structure, 'stone', 'round-support-column', 0xd0d0c1, { column: c.id, section: i }); }
  }
  for(const lift of layout.lifts??[]){
    const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z])=>new THREE.Vector3(lift.x+x*lift.width/2,lift.bottom,lift.z+z*lift.depth/2));
    for(let i=0;i<4;i++){
      const a=corners[i],b=corners[(i+1)%4],height=lift.top-lift.bottom;
      beam(a,a.clone().addScaledVector(up,height),.11,.11,'lift-frame',0x344444,'metal',fittings,{lift:lift.id});
      for(let y=lift.bottom;y<lift.top;y+=2){const top=Math.min(lift.top,y+2),p=a.clone().setY(y),q=b.clone().setY(y),center=p.clone().add(q).multiplyScalar(.5).setY((y+top)/2),ex=q.clone().sub(p).normalize(),ez=new THREE.Vector3().crossVectors(ex,up),matrix=new THREE.Matrix4().makeBasis(ex,up,ez).scale(new THREE.Vector3(a.distanceTo(b)-.11,top-y-.08,.025));matrix.setPosition(center);append(cube.clone().applyMatrix4(matrix),glazing,'glass','lift-enclosure-glass',0xa1c2c4,{lift:lift.id});beam(p.clone().setY(top),q.clone().setY(top),.08,.08,'lift-horizontal-frame',0x344444,'metal',fittings,{lift:lift.id});}
    }
  }
  for (const s of layout.stairs ?? []) {
    const a = point(s.a), b = point(s.b), direction = b.clone().sub(a).setY(0).normalize(), side = new THREE.Vector3(-direction.z, 0, direction.x);
    for (let i = 0; i < s.count; i++) { const p = a.clone().lerp(b, i / s.count), q = a.clone().lerp(b, (i + 1) / s.count), y = THREE.MathUtils.lerp(a.y, b.y, (i + 1) / s.count); p.y = y; q.y = y; deckTile(p, q, side, -s.width / 2, s.width / 2, s.thickness, 'connection-stair-tread', { stair: s.id, index: i }); }
  }
  for (const [surface, name] of [[structure, 'structure'], [fittings, 'screens-and-frames'], [glazing, 'transparent-railing']] as const) {
    if (!surface.positions.length) continue;
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(surface.positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(surface.colors, 3)); (geometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage); geometry.computeVertexNormals(); geometry.computeBoundingSphere(); geometry.computeBoundingBox(); surface.geometry = geometry;
    const glass = surface === glazing, material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: glass ? .15 : .76, metalness: surface === fittings ? .2 : .02, transparent: glass, opacity: glass ? .30 : 1, depthWrite: !glass });
    const mesh = new THREE.Mesh(geometry, material); mesh.name = `engineering301303-${name}`; mesh.receiveShadow = true; shell.add(mesh); surface.positions.length = 0; surface.colors.length = 0;
  }
  scene.add(shell);
  function update(_player: THREE.Vector3) {
    const changed = new Set<Surface>();
    for (const part of parts) if (part.shown !== part.proxy.visible) {
      part.shown = part.proxy.visible; const attribute = part.surface.geometry!.getAttribute('position') as THREE.BufferAttribute;
      if (!changed.has(part.surface)) attribute.clearUpdateRanges(); changed.add(part.surface);
      if (part.shown) (attribute.array as Float32Array).set(part.original, part.start);
      else for (let i = part.start; i < part.end; i += 3) { attribute.array[i] = part.proxy.position.x; attribute.array[i + 1] = part.proxy.position.y; attribute.array[i + 2] = part.proxy.position.z; }
      attribute.addUpdateRange(part.start, part.end - part.start);
    }
    for (const surface of changed) surface.geometry!.getAttribute('position').needsUpdate = true;
    shell.visible = parts.some(part => part.proxy.visible);
  }
  return { breakables, update, shell };
}

/** 두 건물이 만들어진 뒤 한 번만 호출한다. 상판 높이는 도로 기준점에 대한 게임용 근사다. */
export function createCampusEngineering301303Connection(scene:THREE.Scene,heightAt:(x:number,z:number)=>number){
  const a=scene.children.find(o=>o.userData.buildingId==='way/228476658'&&o.userData.role==='building-shell');
  const b=scene.children.find(o=>o.userData.buildingId==='supplemental/snu-303'&&o.userData.role==='building-shell');
  if(!a||!b)return undefined;
  const datum=engineering301303Datum(heightAt),info=b.userData,origin=info.localOrigin,entry=info.entry;
  const deckEnd=origin.x+info.deck.x1,z=origin.z+entry.z,top=datum.bridge,door=datum.entry301;
  const rail=(id:string,p:ConnectionPoint,q:ConnectionPoint):ConnectionRail=>({id,a:p,b:q,screenBottom:-.48,screenTop:1.02,glassTop:1.85,slatWidth:.15,slatPitch:.34,panelLength:1.8});
  const underframe={depth:.45,bayLength:4,memberWidth:.22};
  const roadLowerX=309.2,lower=datum.lower303,stairTop:ConnectionPoint=[335.3,top,z-4.2];
  const direction=new THREE.Vector3(stairTop[0]-326,0,stairTop[2]+1805).normalize(),side=new THREE.Vector3(-direction.z,0,direction.x);
  const startXZ=new THREE.Vector3(326,0,-1805),startHeight=Math.max(...[-1.5,-.75,0,.75,1.5].map(offset=>{const p=startXZ.clone().addScaledVector(side,offset);return heightAt(p.x,p.z);}))+.10;
  const stairStart:ConnectionPoint=[326,startHeight,-1805],count=Math.max(18,Math.ceil(Math.abs(top-startHeight)/.21)),firstTop=startHeight+(top-startHeight)/count;
  const rampBack=startXZ.clone().addScaledVector(direction,-1.8),rampCorners=[rampBack.clone().addScaledVector(side,-1.5),startXZ.clone().addScaledVector(side,-1.5),startXZ.clone().addScaledVector(side,1.5),rampBack.clone().addScaledVector(side,1.5)];
  const rampPoints=rampCorners.map((p,i)=>[p.x,i===1||i===2?firstTop:heightAt(p.x,p.z)+.06,p.z] as ConnectionPoint);
  const layout:Engineering301303ConnectionLayout={
    decks:[
      {id:'road-crossing',a:[deckEnd,top,z],b:[333,top,z],width:8.4,thickness:.24,underframe},
      {id:'301-north-branch',a:[335.3,top,z-4.2],b:[335.3,top,-1773],width:4.6,thickness:.24,underframe},
      {id:'303-lower-ground-link',a:[deckEnd,lower,z],b:[roadLowerX,lower,z],width:5.8,thickness:.14},
    ],
    landings:[
      {id:'301-stair-ground-ramp',points:rampPoints,thickness:.16},
      {id:'301-upper-turn',points:[[333,top,-1773],[337.6,top,-1773],[343.5,top,-1768.2],[343.5,top,-1765.2],[333,top,-1765.2]],thickness:.24},
      {id:'301-lower-turn',points:[[354,door,-1768.28],[359.4,door,-1768.28],[359.4,door,-1765.2],[354,door,-1765.2]],thickness:.20},
    ],
    rails:[
      rail('crossing-south',[deckEnd,top,z-4.2],[333,top,z-4.2]),rail('crossing-north',[deckEnd,top,z+4.2],[333,top,z+4.2]),
      rail('301-branch-east',[337.6,top,z-4.2],[337.6,top,-1773]),rail('301-branch-west',[333,top,z+4.2],[333,top,-1765.2]),
      rail('301-upper-north',[333,top,-1765.2],[343.5,top,-1765.2]),
    ],
    columns:[[306,z-3.4],[306,z+3.4],[327,z-3.4],[327,z+3.4],[335.3,-1779]].map(([x,zz],i)=>({id:`column-${i}`,x,z:zz,bottom:heightAt(x,zz)-.12,top:top-.69,radius:.45})),
    stairs:[
      {id:'301-road-to-deck',a:stairStart,b:stairTop,width:3,count,thickness:.25},
      {id:'301-deck-to-north-door',a:[343.5,top,-1766.7],b:[354,door,-1766.7],width:3,count:20,thickness:.24},
    ],
    handrails:[
      ...[-1,1].map(sign=>({id:'301-road-stair-'+sign,a:[stairStart[0]+side.x*sign*1.5,firstTop,stairStart[2]+side.z*sign*1.5] as ConnectionPoint,b:[stairTop[0]+side.x*sign*1.5,top,stairTop[2]+side.z*sign*1.5] as ConnectionPoint,height:1.05})),
      ...[-1,1].map(sign=>({id:'301-door-stair-'+sign,a:[343.5,top,-1766.7+sign*1.5] as ConnectionPoint,b:[354,door,-1766.7+sign*1.5] as ConnectionPoint,height:1.05})),
      {id:'301-turn-southeast',a:[337.6,top,-1773],b:[343.5,top,-1768.2],height:1.05},
      {id:'301-lower-north',a:[354,door,-1765.2],b:[359.4,door,-1765.2],height:1.05},
      {id:'301-lower-east',a:[359.4,door,-1765.2],b:[359.4,door,-1768.28],height:1.05},
    ],
    lifts:[{id:'301-glass-lift',x:330.1,z:z-2.2,bottom:heightAt(330.1,z-2.2)+.1,top:top+2.2,width:2.4,depth:2.4}],
    sourceUrls:['https://map.kakao.com/?panoid=1213023453&pan=11.0&zoom=0&map_type=TYPE_MAP&map_attribute=ROADVIEW&urlX=489385.0&urlY=1097507.0','https://rawwrks.kr/works/commissioned/haec'],dimensionsEstimated:true,siteAlignmentConfirmed:false,
  };
  const model=createEngineering301303Connection(scene,layout);
  Object.assign(model.shell.userData,{datum,roadAnchor:ENGINEERING_CONNECTION_SITE.anchor,staticLiftOnly:true,access:{roadStart:stairStart,groundApproach:[rampBack.x-direction.x*.6,rampBack.z-direction.z*.6],upperLanding:stairTop,door301:[356.6818,door,-1770.2948],upperDoor303:[origin.x+entry.x,top,z],lowerDoor303:[origin.x+entry.x,lower,z]}});
  b.userData.bridge={implemented:true,owner:model.shell.userData.connectionId,dimensionsEstimated:true};
  return model;
}
