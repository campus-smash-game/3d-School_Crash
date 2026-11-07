import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { CampusBuilding } from './fullCampus';
import type { BuildingAppearance } from './buildingAppearance';
import type { BreakableSpec } from './scene';
import { LIVING_SCIENCE_COURTYARD, livingScienceCourtyardLocal, livingScienceCourtyardPoint, livingScienceCourtyardDesignFloor } from './livingScienceCourtyardSite';

type Point = { x: number; z: number };
type Surface = { positions: number[]; colors: number[]; geometry?: THREE.BufferGeometry };
type Range = { surface: Surface; start: number; end: number; original: Float32Array };
type Part = { proxy: THREE.Mesh; shown: boolean; ranges: Range[] };

// 7층 사용은 공식 자료로 확인했다. 층고, 창 간격과 입구 깊이는 사진 비례에 따른 근사다.
export function createLivingScienceLandmark(scene: THREE.Scene, building: CampusBuilding, profile: BuildingAppearance, heightAt: (x: number, z: number) => number) {
  const mapped = building.points.filter((p, i, all) => i !== all.length - 1 || p[0] !== all[0][0] || p[1] !== all[0][1]);
  if (mapped.length < 3) throw new Error('Living science needs a mapped footprint.');
  const cx = mapped.reduce((s, p) => s + p[0], 0) / mapped.length, cz = mapped.reduce((s, p) => s + p[1], 0) / mapped.length, base = heightAt(cx, cz);
  const origin = new THREE.Vector3(403.52, base, -231.37), axis = new THREE.Vector3(40.05, 0, -22.23).normalize(), front = new THREE.Vector3(-axis.z, 0, axis.x), up = new THREE.Vector3(0, 1, 0);
  const world = (x: number, y: number, z: number) => origin.clone().addScaledVector(axis, x).addScaledVector(up, y).addScaledVector(front, z);
  const ground = (x: number, z: number) => { const p = world(x, 0, z); return heightAt(p.x, p.z) - base; };
  let points = mapped.map(p => ({ x: (p[0] - origin.x) * axis.x + (p[1] - origin.z) * axis.z, z: (p[0] - origin.x) * front.x + (p[1] - origin.z) * front.z }));
  if (points.reduce((s, p, i) => { const q = points[(i + 1) % points.length]; return s + p.x * q.z - q.x * p.z; }, 0) < 0) points.reverse();
  const first = points.reduce((best, p, i) => p.x * p.x + p.z * p.z < points[best].x ** 2 + points[best].z ** 2 ? i : best, 0);
  points = points.slice(first).concat(points.slice(0, first));
  const entryNode=new THREE.Vector3(LIVING_SCIENCE_COURTYARD.origin.x,0,LIVING_SCIENCE_COURTYARD.origin.z).sub(origin),facadeX=entryNode.dot(axis),entryZ=entryNode.dot(front);
  const roof = 24.5, storey = 3.5, entry = { x: facadeX-1, facadeX, z: entryZ, width: 5.6, floor: 0, height: 2.8, approachX: 27.4, estimated: true };
  // 지도 /524의 중심선을 따른다. 폭과 보 높이는 2026년 8월 거리뷰 비례를 맞춘 게임용 근사다.
  const passageStart = new THREE.Vector3(439.05, 0, -254.28), passageEnd = new THREE.Vector3(449.8, 0, -231.55);
  const passageDirection = passageEnd.clone().sub(passageStart).normalize(), passageSide = new THREE.Vector3(passageDirection.z, 0, -passageDirection.x), passageLength = passageStart.distanceTo(passageEnd);
  const passageWidth = 4.2, passageCeiling = 4.8, passageBeamTop = 5.16, passageFront = 2.7940416431376365, passageRear = 21.25654284359409;
  const passagePoint = (s: number, n: number, y: number) => passageStart.clone().addScaledVector(passageDirection, s).addScaledVector(passageSide, n).setY(y);
  const passageLocal = (s: number, n: number): Point => { const p = passagePoint(s, n, 0).sub(origin); return { x: p.dot(axis), z: p.dot(front) }; };
  const passageCrossGround = (s: number) => Math.max(...Array.from({ length: 19 }, (_, i) => { const p = passagePoint(s, -passageWidth / 2 + passageWidth * i / 18, 0); return heightAt(p.x, p.z); }));
  const passageFloorEnds = [passageCrossGround(passageFront + 1) + .09, passageCrossGround(passageRear - .4) + .09];
  // 중앙 지형을 깎지 않고 양끝을 잇는 보행판만 지표 위에 놓는다.
  let passageLift = 0;
  for (let s = passageFront + 1; s <= passageRear - .4; s += .2) passageLift = Math.max(passageLift, passageCrossGround(s) + .07 - THREE.MathUtils.lerp(passageFloorEnds[0], passageFloorEnds[1], (s - passageFront - 1) / (passageRear - passageFront - 1.4)));
  passageFloorEnds[0] += passageLift; passageFloorEnds[1] += passageLift;
  const passageFloorY = (s: number) => THREE.MathUtils.lerp(passageFloorEnds[0], passageFloorEnds[1], THREE.MathUtils.clamp((s - passageFront - 1) / (passageRear - passageFront - 1.4), 0, 1));
  const passageCuts = new Map([[0, { min: 39.898049790575065, max: 44.10692368317407 }], [2, { min: 2.895490847264909, max: 7.104323822200673 }]]);
  entry.floor=-Infinity;for(let x=entry.x-3.2;x<=entry.facadeX+1.01;x+=.4)for(let z=entry.z-entry.width/2;z<=entry.z+entry.width/2+.01;z+=.4)entry.floor=Math.max(entry.floor,ground(x,z)+.16);
  const canopies = [8.5, 28.5, 48.5].map((z, i) => ({ id: i, minX: 2.5, maxX: 20.5, minZ: z - 7, maxZ: z + 7, underside: roof + 2.1, top: roof + 2.28, estimated: true }));
  const shell = new THREE.Group(); shell.name = building.id + ':living-science-landmark';
  Object.assign(shell.userData, { buildingId: building.id, role: 'building-shell', landmark: 'living-science', appearance: profile, localOrigin: { x: origin.x, y: base, z: origin.z }, baseSample: { x: cx, z: cz }, axis: { x: axis.x, z: axis.z }, frontFacing: { x: (axis.x + front.x) / Math.SQRT2, z: (axis.z + front.z) / Math.SQRT2 }, mappedOutline: mapped.map(p => p.slice()), mappedOutlinePreserved: true, levels: { aboveGround: 7, belowGround: 2 }, wingLevelPlacementEstimated: true, heightEstimated: true, roofHeight: roof + 2.28, mainRoofHeight: roof, floorHeight: storey, entry, canopies, basementInteriorModeled: false, classroomInteriorModeled: false, sourceDatumPreserved: true, detailDimensionsEstimated: true, modelCoordinates: 'D=(east,up,north); parent H is applied once after construction.' });
  scene.add(shell); const distant = new THREE.Group(); distant.visible = false; Object.assign(distant.userData, { buildingId: building.id, role: 'distant-building', landmark: 'living-science' }); scene.add(distant);
  const wall: Surface = { positions: [], colors: [] }, details: Surface = { positions: [], colors: [] }, glass: Surface = { positions: [], colors: [] }, surfaces = [wall, details, glass];
  const parts: Part[] = [], breakables: BreakableSpec[] = [], cube = new THREE.BoxGeometry(1, 1, 1), cubeVertices = cube.toNonIndexed().getAttribute('position'), paverRanges: { start: number; end: number }[] = [],courtyardPaverRanges:{start:number;end:number}[]=[],courtyardWallRanges:{start:number;end:number;direction:THREE.Vector3}[]=[];
  const materials = { stone: new THREE.MeshStandardMaterial({ color: 0xb89983 }), metal: new THREE.MeshStandardMaterial({ color: 0xb8bcb8 }), glass: new THREE.MeshStandardMaterial({ color: 0x6599aa }) };
  function tri(s: Surface, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: number) { const tint = new THREE.Color(color); for (const p of [a, b, c]) { s.positions.push(p.x, p.y, p.z); s.colors.push(tint.r, tint.g, tint.b); } }
  function quad(s: Surface, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, color: number) { tri(s, a, b, c, color); tri(s, a, c, d, color); }
  function box(s: Surface, center: THREE.Vector3, size: THREE.Vector3, color: number, ex = axis) {
    const ez = new THREE.Vector3().crossVectors(ex, up).normalize(), tint = new THREE.Color(color);
    for (let i = 0; i < cubeVertices.count; i++) { const p = center.clone().addScaledVector(ex, cubeVertices.getX(i) * size.x).addScaledVector(up, cubeVertices.getY(i) * size.y).addScaledVector(ez, cubeVertices.getZ(i) * size.z); s.positions.push(p.x, p.y, p.z); s.colors.push(tint.r, tint.g, tint.b); }
  }
  let mergingBay = false;
  function component(kind: keyof typeof materials, name: string, draw: () => void, ex = axis, convex = false, extra: Record<string, unknown> = {}) {
    if (mergingBay) { draw(); return; }
    const starts = surfaces.map(s => s.positions.length); draw();
    const ranges: Range[] = surfaces.map((surface, i) => ({ surface, start: starts[i], end: surface.positions.length, original: new Float32Array(surface.positions.slice(starts[i])) }));
    if (ranges.every(r => r.start === r.end)) return;
    const ez = new THREE.Vector3().crossVectors(ex, up).normalize(), axes = [ex, up, ez], lows = [Infinity, Infinity, Infinity], highs = [-Infinity, -Infinity, -Infinity], p = new THREE.Vector3();
    for (const r of ranges) for (let i = 0; i < r.original.length; i += 3) { p.fromArray(r.original, i); axes.forEach((a, j) => { lows[j] = Math.min(lows[j], p.dot(a)); highs[j] = Math.max(highs[j], p.dot(a)); }); }
    if(extra.destructionUnit==='wall-window-bay') {
      // 유리(-.065), 외벽(.03), 띠(.065) 사이에 충돌 면을 둔다. 뒤쪽도 유리와 벽 뒤(-.19)의 중간으로 맞춘다.
      const plane=new THREE.Vector3().fromArray(extra.surfacePlane as number[]).dot(ez);
      lows[2]=plane; highs[2]=plane+.1275;
    }
    const proxy: THREE.Mesh = new THREE.Mesh(cube, materials[kind]); axes.forEach((a, i) => proxy.position.addScaledVector(a, (lows[i] + highs[i]) / 2));
    proxy.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ex, up, ez)); proxy.scale.set(...highs.map((v, i) => Math.max(.025, v - lows[i]) + .008) as [number, number, number]);
    const size = proxy.scale.clone(); let collisionVertices: Float32Array | undefined;
    if (convex) { const inverse = proxy.quaternion.clone().invert(), unique = new Map<string, THREE.Vector3>(); for (const r of ranges) for (let i = 0; i < r.original.length; i += 3) { const v = new THREE.Vector3().fromArray(r.original, i).sub(proxy.position).applyQuaternion(inverse); unique.set(v.toArray().map(n => n.toFixed(5)).join(','), v); } proxy.geometry = new ConvexGeometry([...unique.values()]); collisionVertices = Float32Array.from(proxy.geometry.getAttribute('position').array); proxy.scale.setScalar(1); }
    Object.assign(proxy.userData, { buildingId: building.id, landmark: 'living-science', renderProxy: true, component: name, convex, ...extra }); proxy.updateMatrix(); proxy.updateMatrixWorld(true);
    parts.push({ proxy, shown: true, ranges }); breakables.push({ mesh: proxy, size, collisionVertices, toughness: kind === 'glass' ? 6 : 11, material: kind, label: building.name });
  }
  function clip(poly: Point[], coordinate: 'x' | 'z', value: number, greater: boolean) { const out: Point[] = []; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], ia = greater ? a[coordinate] >= value : a[coordinate] <= value, ib = greater ? b[coordinate] >= value : b[coordinate] <= value; if (ia) out.push(a); if (ia !== ib) { const t = (value - a[coordinate]) / (b[coordinate] - a[coordinate]); out.push({ x: THREE.MathUtils.lerp(a.x, b.x, t), z: THREE.MathUtils.lerp(a.z, b.z, t) }); } } return out; }
  function slab(poly: Point[], ys: number[], thickness: number, color: number, name: string, extra: Record<string, unknown> = {}) {
    if (poly.length < 3) return;
    component('stone', name, () => { const top = poly.map((p, i) => world(p.x, ys[i], p.z)), bottom = top.map(p => p.clone().addScaledVector(up, -thickness)); for (let i = 1; i < poly.length - 1; i++) { tri(details, top[0], top[i + 1], top[i], color); tri(details, bottom[0], bottom[i], bottom[i + 1], color); } for (let i = 0; i < poly.length; i++) { const j = (i + 1) % poly.length; quad(details, bottom[i], bottom[j], top[j], top[i], color); } }, axis, true, extra);
  }
  const rect = (x0: number, x1: number, z0: number, z1: number): Point[] => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
  const roofTriangles = THREE.ShapeUtils.triangulateShape(points.map(p => new THREE.Vector2(p.x, p.z)), []).map(t => t.map(i => points[i]));
  for (const triangle of roofTriangles) for (let x = -1; x < 47; x += 8) for (let z = -1; z < 60; z += 8) {
    let poly = triangle; for (const [k, v, g] of [['x', x, true], ['x', x + 8, false], ['z', z, true], ['z', z + 8, false]] as const) poly = clip(poly, k, v, g);
    if (poly.length < 3 || Math.abs(poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + p.x * q.z - q.x * p.z; }, 0)) < .015) continue;
    slab(poly, poly.map(() => roof), .22, 0x8c9490, 'mapped-roof-panel');
  }
  const labelSegments: number[][] = [], labelCenters: number[][] = [];
  for (let edge = 0; edge < points.length; edge++) {
    const a = points[edge], b = points[(edge + 1) % points.length], length = Math.hypot(b.x - a.x, b.z - a.z), tangent = axis.clone().multiplyScalar((b.x - a.x) / length).addScaledVector(front, (b.z - a.z) / length), outward = new THREE.Vector3().crossVectors(up, tangent).normalize();
    const at = (u: number, y: number, d = 0) => world(a.x, y, a.z).addScaledVector(tangent, u).addScaledVector(outward, d);
    const strip = (s: Surface, u0: number, u1: number, y0: number, y1: number, d: number, depth: number, color: number) => { if (u1 > u0 + .01 && y1 > y0 + .01) box(s, at((u0 + u1) / 2, (y0 + y1) / 2, d), new THREE.Vector3(u1 - u0, y1 - y0, depth), color, tangent); };
    const face = (u0: number,u1: number,y0: number,y1: number,d: number,color: number) => quad(details,at(u0,y0,d),at(u0,y1,d),at(u1,y1,d),at(u1,y0,d),color);
    const innerNorth = edge === 3 || edge === 4, innerBrick = edge === 2, gray = innerNorth || edge === 1, brick = !gray;
    const cuts = [0, length];
    for (let u = 5.8; u < length; u += 5.8) cuts.push(u);
    if(edge===1||edge===4)cuts.push(length-5.8);
    if (edge === 3||edge===4) for (const z of [entry.z - entry.width / 2, entry.z + entry.width / 2]) {const u=(z-a.z)/(b.z-a.z)*length;if(u>0&&u<length)cuts.push(u);}
    cuts.sort((p, q) => p - q);
    const gap = passageCuts.get(edge);
    const sections = cuts.slice(0, -1).flatMap((u0, j) => { const u1 = cuts[j + 1]; if (!gap) return [{ u0, u1, j, levels: [0, 1, 2, 3, 4, 5, 6], foundation: true, cap: true }]; const lowerCuts = [u0, u1, gap.min, gap.max].filter(u => u >= u0 && u <= u1).sort((p, q) => p - q).filter((u, i, all) => !i || u - all[i - 1] > .001); return [{ u0, u1, j, levels: [2, 3, 4, 5, 6], foundation: false, cap: true }, ...lowerCuts.slice(0, -1).map((u, i) => ({ u0: u, u1: lowerCuts[i + 1], j, levels: [0, 1], foundation: true, cap: false }))]; });
    for (const section of sections) {
      const { u0, u1, j } = section, mid = (u0 + u1) / 2, lz = a.z + (b.z - a.z) * mid / length, entryBay = (edge === 3||edge===4) && Math.abs(lz - entry.z) < entry.width / 2 - .01, passageBay = !!gap && mid > gap.min && mid < gap.max;
      let groundMax = -Infinity, groundMin = Infinity;
      for (let u = u0; u <= u1 + .001; u += Math.min(.4, (u1 - u0) / 8)) for (const d of [-.22, 0, .22]) { const p = at(u, 0, d), g = heightAt(p.x, p.z) - base; groundMax = Math.max(groundMax, g); groundMin = Math.min(groundMin, g); }
      const foundationTop = Math.max(.52, groundMax + .13);
      if (section.foundation && !entryBay && !passageBay) component('stone', 'terrain-following-foundation', () => strip(wall, u0, u1, groundMin - .65, foundationTop, -.08, .28, 0xa8aaa0), tangent);
      for (const level of section.levels) {
        const bottom = level * storey, top = (level + 1) * storey, low = Math.max(bottom, level === 0 ? foundationTop : bottom, passageBay ? passageBeamTop : bottom), opening = (entryBay || passageBay) && level === 0, narrow = innerBrick && level === 6;
        if (opening) continue;
        const bayGray=(gray&&!(edge===4&&u0>=length-5.8-.01))||(edge===0&&mid>=40.6), blindEnd=edge===1&&u1<length-5.8+.01;
        const y0 = Math.max(bottom + .78, groundMax + .18, passageBay ? passageBeamTop : bottom), y1 = blindEnd ? y0 : top - (narrow ? 1.18 : .72), color = passageBay ? 0xbec2bd : bayGray ? 0xbec2bd : 0xb88f74;
        const hasWindow=y1>y0+.15, windowCount=narrow?Math.max(1,Math.round((u1-u0)/1.5)):1;
        // 한 층의 한 창 구획을 함께 파괴해 창마다 여러 물리 몸체를 만들지 않는다.
        component('stone', hasWindow ? narrow ? 'upper-narrow-window' : 'ribbon-window' : 'opaque-wall-bay', () => {
        mergingBay=true;try {
        if (y1 > y0 + .15 && y0 > low) component('stone', brick ? 'brick-lower-spandrel' : 'gray-lower-panel', () => {
          strip(wall,u0,u1,low,y0,-.08,.22,color);
          if(bayGray)for(let y=low+.55;y<y0;y+=.55)face(u0,u1,y,y+.018,.04,0xa8aca7);
        },tangent,false,{edge,level});
        component('stone', brick ? 'brick-upper-spandrel' : 'gray-upper-panel', () => {
          strip(wall, u0, u1, y1 <= y0 + .15 ? low : y1, top, -.08, .22, color);
          if(blindEnd)for(let y=low+.55;y<top;y+=.55)face(u0,u1,y,y+.018,.04,0xa8aca7);
          face(u0,u1,top-.12,top,.065,0xd0d2c9);
          if (innerBrick && level === 6 && j === 0) {
            const color = 0x147eb4, glyphWidth = .72, glyphHeight = .90, start = 1.4, gap = .23, yc = roof - .59;
            for (let digit = 0; digit < 3; digit++) {
              const c = start + digit * (glyphWidth + gap), x0 = c - glyphWidth / 2, x1 = c + glyphWidth / 2, y0 = yc - glyphHeight / 2, y1 = yc + glyphHeight / 2;
              labelCenters.push(at(c, yc, .07).toArray());
              for (const r of [[x0,x1,y1-.11,y1],[x1-.11,x1,yc,y1],[x0,x1,yc-.055,yc+.055],[x0,x0+.11,y0,yc],[x0,x1,y0,y0+.11]]) {
                quad(details, at(r[0],r[2],.075), at(r[0],r[3],.075), at(r[1],r[3],.075), at(r[1],r[2],.075), color); labelSegments.push(at((r[0]+r[1])/2,(r[2]+r[3])/2,.075).toArray());
              }
            }
            shell.userData.numberLabel = { text: '222', glyphCenters: labelCenters, segmentCenters: labelSegments, outward: outward.toArray(), right: tangent.toArray(), color, attachedToWallPart: true };
          }
        }, tangent, false, { edge, level, ...(innerBrick && level === 6 && j === 0 ? { numberLabel: '222' } : {}) });
        if (hasWindow) {
        const windows = narrow ? Math.max(1, Math.round((u1 - u0) / 1.5)) : 1;
        for (let k = 0; k < windows; k++) {
          const cell0 = THREE.MathUtils.lerp(u0, u1, k / windows), cell1 = THREE.MathUtils.lerp(u0, u1, (k + 1) / windows), pad = narrow ? Math.max(.2, (cell1 - cell0 - .6) / 2) : .18, x0 = cell0 + pad, x1 = cell1 - pad;
          component('stone', 'window-side-pier', () => strip(wall, cell0, x0, y0, y1, -.08, .22, color), tangent);
          component('stone', 'window-side-pier', () => strip(wall, x1, cell1, y0, y1, -.08, .22, color), tangent);
          component('glass', narrow ? 'upper-narrow-window' : 'ribbon-window', () => {
            quad(glass, at(x0, y0, -.065), at(x0, y1, -.065), at(x1, y1, -.065), at(x1, y0, -.065), innerNorth ? 0x78a6b3 : 0x739cab);
            const panes = narrow ? 1 : Math.max(1, Math.round((x1 - x0) / 1.35));
            for (let k = 0; k <= panes; k++) { const x = THREE.MathUtils.lerp(x0, x1, k / panes); face(x-.025,x+.025,y0,y1,-.014,0xb8c4c2); }
            for (const y of [y0, y1, y1 - .42]) face(x0,x1,y-.026,y+.026,-.014,0xc1cbc5);
            if (edge === 0 && !narrow && y1 - y0 > 1) {
              for (const y of [y0 + .42, y0 + .7, y0 + .98]) face(x0, x1, y - .018, y + .018, .065, 0xc3ccc7);
              for (let u = x0; u <= x1 + .001; u += (x1 - x0) / Math.max(1, Math.round((x1 - x0) / 1.35))) face(u - .018, u + .018, y0, y0 + 1.02, .065, 0xc3ccc7);
            }
          }, tangent, false, { edge, level, surfaceNormal: outward.toArray(), windowCenter: at((x0 + x1) / 2, (y0 + y1) / 2, -.065).toArray() });
        }
        }
        }finally{mergingBay=false;}
        },tangent,false,{edge,level,destructionUnit:'wall-window-bay',surfaceNormal:outward.toArray(),surfacePlane:at(mid,0).toArray(),...(hasWindow?{windowCenter:at(u0+(u1-u0)/(2*windowCount),(y0+y1)/2,-.065).toArray()}:{}),...(innerBrick&&level===6&&j===0?{numberLabel:'222'}:{})});
      }
      if (section.cap) component('metal', 'roof-edge-cap', () => strip(details, u0, u1, roof, roof + .16, -.02, .38, 0xc0c4b9), tangent);
    }
  }
  const passageSurfaceY = (s: number, n: number) => {
    const p = passagePoint(s, n, 0), terrainY = heightAt(p.x, p.z) + .16;
    if (s < passageFront + 1) return THREE.MathUtils.lerp(terrainY, passageFloorY(s), THREE.MathUtils.clamp((s - 2.95) / (passageFront + 1 - 2.95), 0, 1));
    if (s > passageRear - .4) return THREE.MathUtils.lerp(passageFloorY(s), terrainY, THREE.MathUtils.clamp((s - passageRear + .4) / (passageLength - passageRear + .4), 0, 1));
    return passageFloorY(s);
  };
  const passageStations = [2.95, passageFront + 1, ...Array.from({ length: 8 }, (_, i) => passageFront + 2.8 + i * 2), passageRear - .4, passageRear + .7, passageLength].filter(s => s <= passageLength).sort((a, b) => a - b).filter((s, i, all) => !i || s - all[i - 1] > .05);
  for (let i = 0; i < passageStations.length - 1; i++) for (let k = 0; k < 6; k++) {
    const s0 = passageStations[i], s1 = passageStations[i + 1], n0 = -passageWidth / 2 + k * passageWidth / 6, n1 = n0 + passageWidth / 6;
    const corners = [[s0, n0], [s1, n0], [s1, n1], [s0, n1]], red = s0 >= passageFront + .8 && s1 <= passageRear + .01;
    for (const ids of [[0, 1, 2], [0, 2, 3]]) {
      const start = details.positions.length;
      slab(ids.map(j => passageLocal(...corners[j] as [number, number])), ids.map(j => passageSurfaceY(...corners[j] as [number, number]) - base), .13, red ? 0xa56c50 : 0xa6aaa3, red ? 'passage-red-paving' : 'passage-gray-approach', { passage: true, section: i, northernMaterialEstimated: s0 > passageRear });
      if (red) paverRanges.push({ start, end: details.positions.length });
    }
  }
  for (let s = passageFront; s < passageRear; s += 3) {
    const end = Math.min(s + 3, passageRear), mid = (s + end) / 2, floor = passageFloorY(mid) - base, low = Math.min(...[s, mid, end].map(u => { const p = passagePoint(u, -passageWidth / 2 - .13, 0); return heightAt(p.x, p.z) - base; })) - .2;
    component('stone', 'passage-left-wall', () => box(wall, passagePoint(mid, -passageWidth / 2 - .13, base + (low + passageCeiling) / 2), new THREE.Vector3(end - s, passageCeiling - low, .26), 0xc0beb4, passageDirection), passageDirection, true, { passage: true });
    slab([passageLocal(s, -passageWidth / 2), passageLocal(end, -passageWidth / 2), passageLocal(end, passageWidth / 2), passageLocal(s, passageWidth / 2)], [passageBeamTop, passageBeamTop, passageBeamTop, passageBeamTop], passageBeamTop - passageCeiling, 0xbdbfb7, 'passage-overhead-beam', { passage: true });
    if (s > passageFront + .1 && end < passageRear - .1) component('stone', 'passage-low-brick-planter', () => {
      box(wall, passagePoint(mid, passageWidth / 2 + .24, base + floor + .24), new THREE.Vector3(end - s - .08, .48, .48), 0x9a755b, passageDirection);
      box(details, passagePoint(mid, passageWidth / 2 + .24, base + floor + .49), new THREE.Vector3(end - s - .07, .06, .54), 0xc0b49b, passageDirection);
    }, passageDirection, true, { passage: true });
  }
  for (const s of [passageFront + .16, passageRear - .16]) component('stone', 'passage-right-column', () => {
    const low = passageFloorY(s) - .18;
    box(wall, passagePoint(s, passageWidth / 2 + .17, (low + base + passageCeiling) / 2), new THREE.Vector3(.44, base + passageCeiling - low, .34), 0xbfc2ba, passageDirection);
  }, passageDirection, true, { passage: true });
  // 포스터는 판독되지 않은 무문자 종이 면으로만 표현한다.
  for (let i = 0; i < 4; i++) component('metal', 'passage-poster-panel', () => box(details, passagePoint(passageFront + 1.7 + i * .78, -passageWidth / 2 + .012, passageFloorY(passageFront + 2) + 1.35), new THREE.Vector3(.46, .62, .014), i % 2 ? 0xb9c2c6 : 0xe0dfd3, passageDirection), passageDirection, true, { passage: true, textObserved: false });
  const rail = (s0: number, s1: number, n0: number, n1: number) => {
    for (let i = 0; i <= 4; i++) {
      const p = passagePoint(THREE.MathUtils.lerp(s0, s1, i / 4), THREE.MathUtils.lerp(n0, n1, i / 4), 0), y = heightAt(p.x, p.z);
      component('metal', 'passage-exterior-rail-post', () => box(details, p.clone().setY(y + .5), new THREE.Vector3(.055, 1, .055), 0xb9c2be, passageDirection), passageDirection, true, { passage: true });
    }
    const p0 = passagePoint(s0, n0, 0), p1 = passagePoint(s1, n1, 0), y0 = heightAt(p0.x, p0.z), y1 = heightAt(p1.x, p1.z);
    for (const rise of [.5, .97]) component('metal', 'passage-exterior-rail-bar', () => {
      const a = p0.clone().setY(y0 + rise), b = p1.clone().setY(y1 + rise), ex = b.clone().sub(a).normalize(), across = ex.clone().cross(up).normalize().multiplyScalar(.028), vertical = across.clone().cross(ex).normalize().multiplyScalar(.028);
      const vertices = [a.clone().add(across).add(vertical), a.clone().sub(across).add(vertical), a.clone().sub(across).sub(vertical), a.clone().add(across).sub(vertical), b.clone().add(across).add(vertical), b.clone().sub(across).add(vertical), b.clone().sub(across).sub(vertical), b.clone().add(across).sub(vertical)];
      for (const q of [[0,1,2,3],[4,7,6,5],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0]]) quad(details, ...q.map(j => vertices[j]) as [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3], 0xb9c2be);
    }, passageDirection, true, { passage: true });
  };
  rail(2.2, 2.2, 3.1, 4.55);
  const mirrorS = 2, mirrorN = 3.05, mirrorFoot = passagePoint(mirrorS, mirrorN, 0), mirrorGround = heightAt(mirrorFoot.x, mirrorFoot.z), mirrorCenter = mirrorFoot.clone().setY(mirrorGround + 2.1), mirrorNormal = passageDirection.clone().negate(), mirrorRight = passageSide;
  component('metal', 'passage-convex-mirror', () => {
    box(details, mirrorFoot.clone().setY(mirrorGround + .98), new THREE.Vector3(.055, 1.96, .055), 0xd7ac39, passageDirection);
    const center = mirrorCenter.clone().addScaledVector(mirrorNormal, .07), radius = .31;
    for (let i = 0; i < 24; i++) {
      const point = (angle: number, r: number, d: number) => mirrorCenter.clone().addScaledVector(mirrorRight, Math.cos(angle) * r).addScaledVector(up, Math.sin(angle) * r).addScaledVector(mirrorNormal, d), a = i * Math.PI / 12, b = (i + 1) * Math.PI / 12;
      tri(details, center, point(a, radius - .025, .015), point(b, radius - .025, .015), 0xa5b6bc);
      quad(details, point(a, radius - .025, .015), point(a, radius, 0), point(b, radius, 0), point(b, radius - .025, .015), 0xe0d6bd);
    }
  }, passageDirection, true, { passage: true, reflectionApproximation: true });
  shell.userData.passage = { roadId: 'way/1185265108/524', width: passageWidth, widthEstimated: true, sourceWidthDefault: 2.5, start: passageStart.toArray(), end: passageEnd.toArray(), direction: passageDirection.toArray(), side: passageSide.toArray(), length: passageLength, intersections: [{ edge: 0, s: passageFront }, { edge: 2, s: passageRear }], floorEnds: passageFloorEnds, ceilingWorldY: base + passageCeiling, beamTopWorldY: base + passageBeamTop, mainFloorRange: [passageFront + 1, passageRear - .4], surfaceStations: passageStations, routeWorld: [0, 2.95, passageFront + 1, 9, 15, passageRear - .4, passageRear + .7, passageLength].map(s => { const p = passagePoint(s, 0, s < 2.95 ? heightAt(passagePoint(s, 0, 0).x, passagePoint(s, 0, 0).z) : passageSurfaceY(s, 0)); return { x: p.x, y: p.y, z: p.z }; }), openWithoutDestruction: true, northernApproachMaterialEstimated: true, underpassSurface: 'red-brick-pattern', posterTextObserved: false, endpointGeometryEstimated: true };
  // 원본 현관 노드에 맞춰 문을 후퇴시키고, 공식 사진에 보이는 짧은 진입 공간만 근사한다.
  const entryBottom = entry.floor, entryTop = entryBottom + entry.height;
  component('glass', 'recessed-entry-door', () => {
    const x = entry.x; quad(glass, world(x,entryBottom+.07,entry.z-entry.width/2),world(x,entryTop,entry.z-entry.width/2),world(x,entryTop,entry.z+entry.width/2),world(x,entryBottom+.07,entry.z+entry.width/2),0x497c89);
    for (const z of [entry.z-entry.width/2,entry.z-entry.width/4,entry.z,entry.z+entry.width/4,entry.z+entry.width/2]) box(details,world(x+.04,(entryBottom+entryTop)/2,z),new THREE.Vector3(.07,entry.height,.08),0xc3ccca);
    for (const y of [entryBottom+.07,entryBottom+.65,entryTop-.65,entryTop]) box(details,world(x+.04,y,entry.z),new THREE.Vector3(.07,.08,entry.width),0xc3ccca);
    for(const z of[entry.z-.14,entry.z+.14])box(details,world(x+.05,entryBottom+1.05,z),new THREE.Vector3(.035,.45,.04),0xc9cfca);
  }, front);
  for (const z of [entry.z-entry.width/2,entry.z+entry.width/2]) component('stone','entry-recess-side',()=>box(wall,world((entry.x+entry.facadeX)/2,(entryBottom+entryTop)/2,z),new THREE.Vector3(entry.facadeX-entry.x,entry.height,.18),0xb5bdb7));
  component('stone','entry-recess-lintel',()=>box(wall,world((entry.x+entry.facadeX)/2,(entryTop+storey)/2,entry.z),new THREE.Vector3(entry.facadeX-entry.x,Math.max(.08,storey-entryTop),entry.width),0xb5bdb7));
  slab(rect(entry.x-3.2,entry.facadeX+.45,entry.z-entry.width/2,entry.z+entry.width/2),[entryBottom,entryBottom,entryBottom,entryBottom],.18,0xadb3a8,'entry-lobby-floor');
  const entrySignGroup=new THREE.Group();entrySignGroup.name='living-science-entry-name';
  const signOwner=parts.find(p=>p.proxy.userData.component==='entry-recess-lintel')!.proxy;
  if(typeof document!=='undefined'){const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=128;const ctx=canvas.getContext('2d');if(ctx){ctx.clearRect(0,0,1024,128);ctx.fillStyle='#252724';ctx.font='bold 90px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('생활과학대학',512,64);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const label=new THREE.Mesh(new THREE.PlaneGeometry(5.1,.64),new THREE.MeshBasicMaterial({map:texture,transparent:true,side:THREE.DoubleSide,depthWrite:false}));label.position.copy(world(entry.facadeX+.035,storey+.22,entry.z));label.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(front,up,axis.clone().negate()));label.name='living-science-observed-entry-lettering';entrySignGroup.add(label);}}
  const datumOffset=base+entry.floor-LIVING_SCIENCE_COURTYARD.entryFloor;
  const courtPoint=(s:number,n:number,y:number)=>{const p=livingScienceCourtyardPoint(s,n);return new THREE.Vector3(p.x,y,p.z);};
  // 통과구의 기존 6분할 삼각형 상면을 그대로 보간해 새 포장과 접한다.
  const passageTriangleSurface=(s:number,n:number)=>{s=THREE.MathUtils.clamp(s,passageStations[0],passageLength);n=THREE.MathUtils.clamp(n,-passageWidth/2,passageWidth/2);const i=Math.min(passageStations.length-2,Math.max(0,passageStations.findIndex((v,k)=>k>0&&v>=s)-1)),s0=passageStations[i],s1=passageStations[i+1],k=Math.min(5,Math.max(0,Math.floor((n+passageWidth/2)/(passageWidth/6)))),n0=-passageWidth/2+k*passageWidth/6,n1=n0+passageWidth/6,u=(s-s0)/(s1-s0),v=(n-n0)/(n1-n0),a=passageSurfaceY(s0,n0),b=passageSurfaceY(s1,n0),c=passageSurfaceY(s1,n1),d=passageSurfaceY(s0,n1);return v<=u?a*(1-u)+b*(u-v)+c*v:a*(1-v)+c*u+d*(v-u);};
  const courtFloor=(s:number,n:number)=>{const p=livingScienceCourtyardPoint(s,n);let raw=heightAt(p.x,p.z)+.18,y=livingScienceCourtyardDesignFloor(p.x,p.z,datumOffset);if(Math.abs(s)<entry.width/2+.01&&n<3)y=THREE.MathUtils.lerp(base+entry.floor,y,THREE.MathUtils.smoothstep(n,.45,3));const d=new THREE.Vector3(p.x,0,p.z).sub(passageStart),ps=d.dot(passageDirection),pn=d.dot(passageSide),distance=Math.hypot(Math.max(0,ps-passageLength),Math.max(0,Math.abs(pn)-passageWidth/2));if(ps>passageRear-.5&&distance<1.5){const mix=THREE.MathUtils.smoothstep(distance,0,1.5);y=THREE.MathUtils.lerp(passageTriangleSurface(ps,pn),y,mix);raw-=.18*(1-mix);}return Math.max(raw,y);};
  // 이전 통과구 판의 외곽을 새 포장에서 빼서 같은 자리에 두 바닥을 겹치지 않는다.
  function clipPassage(poly:Point[],value:number,coordinate:'s'|'n',greater:boolean){const valueAt=(p:Point)=>{const d=courtPoint(p.x,p.z,0).sub(passageStart);return d.dot(coordinate==='s'?passageDirection:passageSide);},out:Point[]=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],va=valueAt(a),vb=valueAt(b),ia=greater?va>=value:va<=value,ib=greater?vb>=value:vb<=value;if(ia)out.push(a);if(ia!==ib){const t=(value-va)/(vb-va);out.push({x:THREE.MathUtils.lerp(a.x,b.x,t),z:THREE.MathUtils.lerp(a.z,b.z,t)});}}return out;}
  function withoutPassage(poly:Point[]){const out:Point[][]=[];let inside=poly;for(const[k,v,g]of[['s',2.95,true],['s',passageLength,false],['n',-passageWidth/2,true],['n',passageWidth/2,false]]as const){out.push(clipPassage(inside,v,k,!g));inside=clipPassage(inside,v,k,g);}return out.filter(p=>p.length>=3);}
  function refinePassageBoundary(poly:Point[]){const out:Point[]=[],coordinates=(p:Point)=>{const d=courtPoint(p.x,p.z,0).sub(passageStart);return{s:d.dot(passageDirection),n:d.dot(passageSide)};};let refined=false;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],pa=coordinates(a),pb=coordinates(b),ts:number[]=[];out.push(a);if(Math.abs(pa.s-passageLength)<1e-6&&Math.abs(pb.s-passageLength)<1e-6){for(let k=1;k<6;k++)ts.push((-passageWidth/2+k*passageWidth/6-pa.n)/(pb.n-pa.n));refined=true;}if(Math.abs(Math.abs(pa.n)-passageWidth/2)<1e-6&&Math.abs(pa.n-pb.n)<1e-6){for(const s of passageStations)ts.push((s-pa.s)/(pb.s-pa.s));refined=true;}for(const t of ts.filter(t=>t>1e-6&&t<1-1e-6).sort((a,b)=>a-b))out.push({x:THREE.MathUtils.lerp(a.x,b.x,t),z:THREE.MathUtils.lerp(a.z,b.z,t)});}return{poly:out,refined};}
  const courtTriangles:number[][]=[],courtOwners:Part[]=[],pavingBounds={sMin:-10,sMax:20,nMin:.45,nMax:34};
  // 파괴 구획은 약 3m 간격으로 나누고, 비평면 사각형은 두 삼각기둥으로 분리한다.
  for(let s=pavingBounds.sMin;s<pavingBounds.sMax;s+=3)for(let n=pavingBounds.nMin;n<pavingBounds.nMax;n+=3){
    const s1=Math.min(s+3,pavingBounds.sMax),n1=Math.min(n+3,pavingBounds.nMax),cell=[{x:s,z:n},{x:s1,z:n},{x:s1,z:n1},{x:s,z:n1}];
    for(const rawPoly of withoutPassage(cell)){
      const {poly,refined}=refinePassageBoundary(rawPoly),center={x:poly.reduce((sum,p)=>sum+p.x,0)/poly.length,z:poly.reduce((sum,p)=>sum+p.z,0)/poly.length},triangles=refined?poly.map((p,i)=>[center,p,poly[(i+1)%poly.length]]):poly.slice(1,-1).map((p,i)=>[poly[0],p,poly[i+2]]);
      for(const pp of triangles){
      const area=Math.abs((pp[1].x-pp[0].x)*(pp[2].z-pp[0].z)-(pp[1].z-pp[0].z)*(pp[2].x-pp[0].x));if(area<.00001)continue;
      const top=pp.map(p=>courtPoint(p.x,p.z,courtFloor(p.x,p.z))),bottom=pp.map(p=>{const q=courtPoint(p.x,p.z,0);return q.setY(heightAt(q.x,q.z)-.12);}),name=Math.abs((s+s1)/2)<3&&(n+n1)/2<6?'entry-ground-connection':'courtyard-brick-paving';
      component('stone',name,()=>{const start=details.positions.length;tri(details,top[0],top[2],top[1],0xac795b);courtyardPaverRanges.push({start,end:details.positions.length});tri(details,bottom[0],bottom[1],bottom[2],0xa3a69b);for(let k=0;k<3;k++)quad(details,bottom[k],bottom[(k+1)%3],top[(k+1)%3],top[k],0xa3a69b);},axis,true,{courtyard:true});
      courtTriangles.push(top.flatMap(p=>p.toArray()));courtOwners.push(parts[parts.length-1]);
    }}
  }
  const courtSurface=(s:number,n:number)=>{const p=courtPoint(s,n,0);let y=heightAt(p.x,p.z);for(const t of courtTriangles){const det=(t[3]-t[0])*(t[8]-t[2])-(t[5]-t[2])*(t[6]-t[0]);if(Math.abs(det)<1e-8)continue;const a=((p.x-t[0])*(t[8]-t[2])-(p.z-t[2])*(t[6]-t[0]))/det,b=((t[3]-t[0])*(p.z-t[2])-(t[5]-t[2])*(p.x-t[0]))/det;if(a>=-1e-5&&b>=-1e-5&&a+b<=1.00001)y=Math.max(y,t[1]+a*(t[4]-t[1])+b*(t[7]-t[1]));}return y;};
  const courtRoutePoint=(s:number,n:number)=>courtPoint(s,n,courtSurface(s,n)).toArray();
  // 유도선은 문 앞에서 중앙 길로 직각 분기한다. 폭과 정밀 위치는 사진 비례 근사다.
  const guidance=[{s0:-.3,s1:.3,n0:.5,n1:20.7},{s0:-9.5,s1:19.5,n0:20.7,n1:21.3}];
  // 유도블록 표시는 밑의 포장 부품과 함께 파괴한다. 개별 블록에는 충돌체를 만들지 않는다.
  for(const strip of guidance)for(let ti=0;ti<courtTriangles.length;ti++){
    const t=courtTriangles[ti],source=[0,3,6].map(i=>{const p=livingScienceCourtyardLocal(t[i],t[i+2]);return{x:p.s,z:p.n};}),det=(source[1].x-source[0].x)*(source[2].z-source[0].z)-(source[1].z-source[0].z)*(source[2].x-source[0].x);
    const top=(p:Point,lift:number)=>{const a=((p.x-source[0].x)*(source[2].z-source[0].z)-(p.z-source[0].z)*(source[2].x-source[0].x))/det,b=((source[1].x-source[0].x)*(p.z-source[0].z)-(source[1].z-source[0].z)*(p.x-source[0].x))/det;return courtPoint(p.x,p.z,t[1]+a*(t[4]-t[1])+b*(t[7]-t[1])+lift);};
    const clipped=(s0:number,s1:number,n0:number,n1:number)=>{let p=source;for(const[k,v,g]of[['x',s0,true],['x',s1,false],['z',n0,true],['z',n1,false]]as const)p=clip(p,k,v,g);return p;};
    const patch=clipped(strip.s0,strip.s1,strip.n0,strip.n1);if(patch.length<3)continue;
    const start=details.positions.length,draw=(p:Point[],lift:number,color:number)=>{for(let i=1;i+1<p.length;i++)tri(details,top(p[0],lift),top(p[i+1],lift),top(p[i],lift),color);};draw(patch,.012,0xc2a044);
    const alongS=strip.s1-strip.s0>strip.n1-strip.n0;for(let k=1;k<=3;k++){const r=alongS?THREE.MathUtils.lerp(strip.n0,strip.n1,k/4):THREE.MathUtils.lerp(strip.s0,strip.s1,k/4);draw(alongS?clipped(strip.s0,strip.s1,r,r+.018):clipped(r,r+.018,strip.n0,strip.n1),.014,0xe1bf5f);}
    courtOwners[ti].ranges.push({surface:details,start,end:details.positions.length,original:new Float32Array(details.positions.slice(start))});
  }
  function planterWall(a:{s:number;n:number},b:{s:number;n:number},height:number){const p=courtPoint(a.s,a.n,courtSurface(a.s,a.n)),q=courtPoint(b.s,b.n,courtSurface(b.s,b.n)),ex=q.clone().sub(p).setY(0).normalize(),width=.26,acrossWall=new THREE.Vector3().crossVectors(ex,up),top=[p.clone().addScaledVector(acrossWall,-width/2),q.clone().addScaledVector(acrossWall,-width/2),q.clone().addScaledVector(acrossWall,width/2),p.clone().addScaledVector(acrossWall,width/2)].map(v=>v.addScaledVector(up,height)),bottom=top.map(v=>v.clone().setY(heightAt(v.x,v.z)-.12));component('stone','courtyard-curved-brick-planter',()=>{const start=wall.positions.length;for(let i=0;i<4;i++)quad(wall,bottom[i],bottom[(i+1)%4],top[(i+1)%4],top[i],0xb08b67);courtyardWallRanges.push({start,end:wall.positions.length,direction:ex.clone()});quad(details,top[0],top[3],top[2],top[1],0xc0bdab);},ex,true,{courtyard:true,curveEstimated:true});}
  const plantingCurve=[{s:3.4,n:.35},{s:3.4,n:2.9},{s:6,n:3.3},{s:10,n:3.4},{s:14,n:3.1},{s:17,n:2.3},{s:19,n:.4}];
  for(let i=1;i<plantingCurve.length;i++)planterWall(plantingCurve[i-1],plantingCurve[i],i<3?.78:.43);
  for(const s of[5,8,11,14,17]){const n=1.8,y=courtSurface(s,n)+.7,geometry=new THREE.IcosahedronGeometry(1,1).getAttribute('position');component('stone','courtyard-low-shrub',()=>{const c=courtPoint(s,n,y);for(let i=0;i<geometry.count;i+=3){const v=[0,1,2].map(k=>{const p=new THREE.Vector3().fromBufferAttribute(geometry,i+k);return c.clone().addScaledVector(front,p.x*1.05).addScaledVector(axis,p.z*.75).addScaledVector(up,p.y*.62);});tri(details,v[0],v[1],v[2],0x5b724a);}},axis,true,{courtyard:true,speciesEstimated:true});}
  // 사진에서 확인한 화단 수목을 단순한 가지와 겹친 수관으로 표현한다. 수종과 높이는 추정이다.
  for(const[s,n,height]of[[6.1,1.65,3.6],[12.5,1.6,4.5],[17.3,1.45,3.1]]){
    const y=courtSurface(s,n);component('stone','courtyard-tree-trunk',()=>box(details,courtPoint(s,n,y+height*.4),new THREE.Vector3(.16,height*.8,.16),0x77634e),axis,true,{courtyard:true,speciesEstimated:true});
    for(const[ds,dn,dy,rs,rn,ry]of[[-.8,0,height-.45,1.25,.95,.55],[.7,.25,height,1.25,.85,.65],[0,-.25,height+.5,1.05,.8,.55]]){
      const geometry=new THREE.IcosahedronGeometry(1,1).getAttribute('position'),c=courtPoint(s+ds,n+dn,y+dy);
      component('stone','courtyard-tree-crown',()=>{for(let i=0;i<geometry.count;i+=3){const v=[0,1,2].map(k=>{const p=new THREE.Vector3().fromBufferAttribute(geometry,i+k);return c.clone().addScaledVector(front,p.x*rs).addScaledVector(axis,p.z*rn).addScaledVector(up,p.y*ry);});tri(details,v[0],v[1],v[2],0x4e6943);}},axis,true,{courtyard:true,speciesEstimated:true});
    }
  }
  for(const[s,n]of[[5,3.05],[15,2.8],[2,30],[15,30]]){const y=courtSurface(s,n);component('metal','courtyard-column-light',()=>{box(details,courtPoint(s,n,y+.46),new THREE.Vector3(.13,.92,.13),0x5b6258);box(details,courtPoint(s,n,y+.88),new THREE.Vector3(.15,.25,.15),0xd6d5bb);},axis,false,{courtyard:true,fixtureEstimated:true});}
  component('metal','courtyard-unreadable-information-stand',()=>{const s=entry.width/2+.65,n=.85,y=courtSurface(s,n);box(details,courtPoint(s,n,y+.53),new THREE.Vector3(.18,1.06,.18),0xb9c0b9);const a=courtPoint(s-.43,n-.27,y+1.08),b=courtPoint(s+.43,n-.27,y+1.08),c=courtPoint(s+.43,n+.27,y+.9),d=courtPoint(s-.43,n+.27,y+.9);quad(details,a,d,c,b,0x315d83);},front,true,{courtyard:true,textObserved:false});
  const entryWorld=world(entry.x,entry.floor,entry.z),insideWorld=world(entry.x-2.7,entry.floor,entry.z),junctionWorld=new THREE.Vector3(441.28,0,-218.75),j= livingScienceCourtyardLocal(junctionWorld.x,junctionWorld.z);
  shell.userData.courtyard={entryNode:'4531517992',entryTags:{entrance:'yes',wheelchair:'yes'},sourceEntryWorld:[437.34,-215.85],door:{component:'recessed-entry-door',center:entryWorld.toArray(),outward:axis.toArray(),tangent:front.toArray(),width:entry.width,height:entry.height},insideEnd:insideWorld.toArray(),routeWorld:[infoPassageEndpoint(),courtRoutePoint(-6.7124556408,4.8237577956),courtRoutePoint(j.s,j.n),world(entry.facadeX+.45,entry.floor,entry.z).toArray(),entryWorld.toArray(),insideWorld.toArray()],pavingBounds,pavingTriangles:courtTriangles.length,surfaceComponents:['entry-lobby-floor','entry-ground-connection','courtyard-brick-paving'],guidance,plantingCurve,entrySign:{text:'생활과학대학',parentComponent:'entry-recess-lintel',textureCount:1},floorDatumEstimated:true,facilitiesEstimated:true,photoPublication:'2024-09-20',photoCaptureDate:null,interiorCourtyardRoadviewObserved:false,currentKakaoInteriorCoverageShown:false,passageUnchanged:true};
  function infoPassageEndpoint(){return passagePoint(passageLength,0,passageSurfaceY(passageLength,0)).toArray();}
  // 세 차양은 판과 기둥을 각각 파괴한다. 차양 아래 열린 공간을 상자 하나로 막지 않는다.
  for(const c of canopies) {
    for(let x=c.minX;x<c.maxX;x+=6)for(let z=c.minZ;z<c.maxZ;z+=7)slab(rect(x,Math.min(x+6,c.maxX),z,Math.min(z+7,c.maxZ)),[c.top,c.top,c.top,c.top],c.top-c.underside,0x9a9f96,'floating-canopy-panel',{canopy:c.id});
    for(const x of [c.minX+.7,c.maxX-.7])for(const z of [c.minZ+.7,c.maxZ-.7])component('metal','canopy-support-column',()=>box(details,world(x,(roof+c.underside)/2,z),new THREE.Vector3(.17,c.underside-roof,.17),0xbfc4b9),axis,false,{canopy:c.id});
    for(const x of [c.minX+.7,c.maxX-.7])component('metal','canopy-support-beam',()=>box(details,world(x,c.underside-.09,(c.minZ+c.maxZ)/2),new THREE.Vector3(.14,.18,c.maxZ-c.minZ),0xaeb6ad),axis,false,{canopy:c.id});
  }
  // 줄눈은 한 장의 반복 텍스처로 표시한다. 포장 블록마다 메시나 충돌체를 만들지 않는다.
  const textureSize = 128, texturePixels = new Uint8Array(textureSize * textureSize * 4);
  for (let y = 0; y < textureSize; y++) for (let x = 0; x < textureSize; x++) { const row = y < 64 ? 0 : 1, xx = (x + row * 32) % 64, col=Math.floor(((x+row*32)%128)/64),joint = y % 64 < 3 || xx < 3, shade = joint ? 145 : [255,225,239,211][row*2+col], k = (y * textureSize + x) * 4; texturePixels[k] = shade; texturePixels[k + 1] = shade; texturePixels[k + 2] = shade; texturePixels[k + 3] = 255; }
  const brickTexture = new THREE.DataTexture(texturePixels, textureSize, textureSize); brickTexture.wrapS = brickTexture.wrapT = THREE.RepeatWrapping; brickTexture.magFilter = THREE.LinearFilter; brickTexture.minFilter = THREE.LinearMipmapLinearFilter; brickTexture.generateMipmaps = true; brickTexture.needsUpdate = true;
  const brickTint = new THREE.Color(0xb88f74);
  for(const [s,name,roughness]of [[wall,'brick-and-gray-envelope',.88],[details,'roof-and-frames',.61],[glass,'glazing',.27]]as const){
    const geometry=new THREE.BufferGeometry(), uv = new Float32Array(s.positions.length / 3 * 2).fill(.125);
    if (s === details) {
      for (const range of paverRanges) for (let i = range.start; i < range.end; i += 3) { const p = new THREE.Vector3().fromArray(s.positions, i).sub(passageStart); uv[i / 3 * 2] = p.dot(passageDirection) / .44; uv[i / 3 * 2 + 1] = p.dot(passageSide) / .22; }
      for (const range of courtyardPaverRanges) for (let i = range.start; i < range.end; i += 3) { const p = livingScienceCourtyardLocal(s.positions[i],s.positions[i+2]); uv[i / 3 * 2] = p.s / .56; uv[i / 3 * 2 + 1] = p.n / .28; }
    }
    if (s === wall) for (let i = 0; i < s.positions.length; i += 3) { const p = new THREE.Vector3().fromArray(s.positions, i).sub(origin); if (Math.abs(p.dot(front)) < .23 && Math.abs(s.colors[i] - brickTint.r) < .00001 && Math.abs(s.colors[i + 1] - brickTint.g) < .00001) { uv[i / 3 * 2] = p.dot(axis) / .56; uv[i / 3 * 2 + 1] = p.y / .15; } }
    if(s===wall)for(const range of courtyardWallRanges)for(let i=range.start;i<range.end;i+=3){const p=new THREE.Vector3().fromArray(s.positions,i);uv[i/3*2]=p.dot(range.direction)/.48;uv[i/3*2+1]=p.y/.15;}
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(s.positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(s.colors,3));geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));(geometry.getAttribute('position')as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);geometry.computeVertexNormals();geometry.computeBoundingSphere();geometry.computeBoundingBox();s.geometry=geometry;const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness,metalness:s===details?.16:s===glass?.08:.01,map:s===glass?null:brickTexture}));mesh.name=`living-science-${name}`;mesh.receiveShadow=true;shell.add(mesh);s.positions.length=0;s.colors.length=0;
  }
  shell.add(entrySignGroup);
  function update(_player: THREE.Vector3) { entrySignGroup.visible=signOwner.visible;const changed=new Set<Surface>();for(const part of parts)if(part.shown!==part.proxy.visible){part.shown=part.proxy.visible;for(const r of part.ranges){if(r.start===r.end)continue;const attr=r.surface.geometry!.getAttribute('position')as THREE.BufferAttribute;if(!changed.has(r.surface))attr.clearUpdateRanges();changed.add(r.surface);if(part.shown)(attr.array as Float32Array).set(r.original,r.start);else for(let i=r.start;i<r.end;i+=3){attr.array[i]=part.proxy.position.x;attr.array[i+1]=part.proxy.position.y;attr.array[i+2]=part.proxy.position.z;}attr.addUpdateRange(r.start,r.end-r.start);}}for(const s of changed)s.geometry!.getAttribute('position').needsUpdate=true;shell.visible=parts.some(p=>p.proxy.visible);}
  return { breakables, update };
}
