import * as THREE from 'three';
import { createEngineering312Assembly, engineering312Datum } from './engineering312Landmark';

/** 준공 사진의 꺾인 접근과 설계도의 5층 통로를 잇는다. 절대고도와 평면 끝점은 게임용 근사다. */
export function createCampusEngineering303312Connection(scene: THREE.Scene, heightAt: (x: number, z: number) => number) {
  const source = scene.children.find(o => o.userData.buildingId === 'supplemental/snu-303' && o.userData.role === 'building-shell');
  const target = scene.children.find(o => o.userData.buildingId === 'way/777502176' && o.userData.role === 'building-shell');
  if (!source || !target) return undefined;
  const id = 'connection/engineering303-312'; if (scene.children.some(o => o.userData.connectionId === id && o.userData.role === 'campus-connection')) throw Error('303-312 connection already exists.');
  const datum = engineering312Datum(heightAt), entry = target.userData.entrance, inward = new THREE.Vector3().fromArray(entry.inward), up = new THREE.Vector3(0, 1, 0), end = new THREE.Vector3(entry.x, datum.bridge, entry.z), start = end.clone().addScaledVector(inward, -21.5);
  const northEdge = source.userData.localOrigin.z + source.userData.deck.z1;
  const path = [new THREE.Vector3(304.2, datum.deck303, northEdge), new THREE.Vector3(304.2, datum.deck303, -1767.4), new THREE.Vector3(300.4, datum.bridge, -1760.1), start, end.clone().addScaledVector(inward, .1)];
  const assembly = createEngineering312Assembly(scene, id, 'engineering303-312-connection', '303동과 312동 연결 통로'), { shell, box, part, prism, beam } = assembly;
  Object.assign(shell.userData, { role: 'campus-connection', connectionId: id, joinedBuildingIds: ['supplemental/snu-303', 'way/777502176'], datum, sourceRoad: 'way/777510058/486', sourceRoadUsedFor: '수평 위치와 진행 방향의 보조 근거', mappedRoadModified: false, sourceUrls: ['https://lkjap.com/', 'https://rawwrks.kr/works/commissioned/haec'], coveredConnectionFloor: 5, siteAlignmentSurveyed: false });
  const half = 1.6, directions = path.slice(1).map((p, i) => p.clone().sub(path[i]).setY(0).normalize()), sides = directions.map(d => new THREE.Vector3(-d.z, 0, d.x));
  const offsets = path.map((_, i) => { if (i === 0) return sides[0].clone().multiplyScalar(half); if (i === path.length - 1) return sides.at(-1)!.clone().multiplyScalar(half); const average = sides[i - 1].clone().add(sides[i]).normalize(); return average.multiplyScalar(half / Math.max(.45, average.dot(sides[i]))); });
  const left = path.map((p, i) => p.clone().add(offsets[i])), right = path.map((p, i) => p.clone().sub(offsets[i]));
  function tile(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, name: string, metadata: Record<string, unknown>, thickness = .22, color = 0xadb0a7) { prism([a, b, c], thickness, name, color, 'stone', metadata); prism([a, c, d], thickness, name, color, 'stone', metadata); }
  for (let i = 0; i < path.length - 1; i++) { const stairs = i === 1, count = stairs ? 10 : Math.ceil(path[i].distanceTo(path[i + 1]) / 3), name = stairs ? 'approach-stair-tread' : i === 3 ? 'covered-bridge-floor' : 'approach-deck-panel';
    for (let k = 0; k < count; k++) { const a = left[i].clone().lerp(left[i + 1], k / count), b = left[i].clone().lerp(left[i + 1], (k + 1) / count), c = right[i].clone().lerp(right[i + 1], (k + 1) / count), d = right[i].clone().lerp(right[i + 1], k / count);
      if (stairs) { const y = THREE.MathUtils.lerp(path[i].y, path[i + 1].y, k / count); for (const p of [a, b, c, d]) p.y = y; }
      // 문 안쪽의 겹친 판은 1cm 낮춰 같은 높이의 두 바닥이 깜박이지 않게 한다.
      if(i===3&&k===count-1){const endDistance=path[i+1].distanceTo(path[i]),t=(endDistance-.3)/endDistance;
        const p=left[i].clone().lerp(left[i+1],t),q=right[i].clone().lerp(right[i+1],t);tile(a,p,q,d,name,{section:i,cell:k});tile(p.clone().addScaledVector(up,-.01),b.clone().addScaledVector(up,-.01),c.clone().addScaledVector(up,-.01),q.clone().addScaledVector(up,-.01),name,{section:i,cell:k,threshold:true});
      }else tile(a, b, c, d, name, { section: i, cell: k }); }
  }
  // 짧은 접근 덱의 경계만 난간으로 막고 시작과 끝의 통과 폭은 남긴다.
  for (let i = 0; i < 3; i++) for (const boundary of [left, right]) { const a = boundary[i], b = boundary[i + 1], count = Math.ceil(a.distanceTo(b) / 1.7); for (let k = 0; k < count; k++) { const p = a.clone().lerp(b, k / count), q = a.clone().lerp(b, (k + 1) / count); beam(p.clone().addScaledVector(up, 1.08), q.clone().addScaledVector(up, 1.08), .07, .07, 'approach-rail'); beam(p, p.clone().addScaledVector(up, 1.08), .07, .07, 'approach-post'); beam(p.clone().addScaledVector(up, .22), q.clone().addScaledVector(up, .22), .045, .045, 'approach-lower-rail'); } }
  const coveredStart=start.clone().addScaledVector(inward,1.8),length = coveredStart.distanceTo(end), forward = end.clone().sub(coveredStart).normalize(), side = new THREE.Vector3(-forward.z, 0, forward.x), bayCount = 6, height = 4.3, at = (t: number, across: number, y: number) => coveredStart.clone().lerp(end, t).addScaledVector(side, across).addScaledVector(up, y);
  // 꺾인 참에서 몸을 돌릴 폭을 남기고, 그 뒤부터 유리와 X 가새를 시작한다.
  for(const sign of[-1,1]){const p=(sign===1?left:right)[3],q=coveredStart.clone().addScaledVector(side,sign*half);beam(p.clone().addScaledVector(up,1.08),q.clone().addScaledVector(up,1.08),.06,.06,'turn-landing-rail');}
  for (let k = 0; k < bayCount; k++) { const t0 = k / bayCount, t1 = (k + 1) / bayCount;
    for (const sign of [-1, 1]) { const n = sign * half; beam(at(t0, n, -.17), at(t1, n, -.17), .16, .28, 'truss-lower-chord'); beam(at(t0, n, height), at(t1, n, height), .15, .18, 'truss-upper-chord'); beam(at(t0, n, .12), at(t1, n, height - .1), .055, .055, 'truss-x-brace'); beam(at(t0, n, height - .1), at(t1, n, .12), .055, .055, 'truss-x-brace');
      const center = at((t0 + t1) / 2, n, height / 2), span = length / bayCount - .18; part('glass', 'covered-bridge-side-glass', () => box('glass', center, new THREE.Vector3(span, height - .24, .045), 0xa2bdc0, forward), { side: sign, bay: k, outward: side.clone().multiplyScalar(sign).toArray() }); }
    beam(at(t0, -half, height), at(t0, half, height), .14, .16, 'truss-roof-crossbeam');
    part('glass', 'covered-bridge-roof-glass', () => box('glass', at((t0 + t1) / 2, 0, height + .08), new THREE.Vector3(length / bayCount - .04, .055, half * 2), 0xaac1c1, forward));
    for (const sign of [-1, 1]) beam(at(t0, sign * half, -.26), at(t0, sign * half, height + .08), .16, .16, 'truss-upright');
  }
  for (const sign of [-1, 1]) beam(at(1, sign * half, -.26), at(1, sign * half, height + .08), .16, .16, 'truss-upright'); beam(at(1, -half, height), at(1, half, height), .14, .16, 'truss-roof-crossbeam');
  // 지붕과 바닥을 지지하는 두 끝의 기둥만 둔다. 통로 아래 전체를 기초 상자로 채우지 않는다.
  for (const t of [.03, .93]) for (const sign of [-1, 1]) { const p = at(t, sign * (half - .12), -.31), q = p.clone().setY(heightAt(p.x, p.z) - .2); beam(q, p, .22, .22, 'bridge-ground-support'); }
  for (const [i, p] of path.slice(0, 3).entries()) { const q = p.clone().setY(heightAt(p.x, p.z) - .16); beam(q, p.clone().addScaledVector(up, -.3), .32, .32, 'approach-ground-column', 0x717a76, 'stone', { index: i }); }
  const walk = [new THREE.Vector3(source.userData.localOrigin.x + source.userData.entry.x + 3.2, datum.deck303, source.userData.localOrigin.z + source.userData.entry.z), path[0].clone().addScaledVector(directions[0], -1.5), ...path, end.clone().addScaledVector(inward, 4)];
  Object.assign(shell.userData, { layout: { path: path.map(p => p.toArray()), width: half * 2, bridgeStart: coveredStart.toArray(), bridgeEnd: end.toArray(), bridgeLength: length, turnLandingLength:1.8, roofHeight: height, bayCount, stairCount: 10, stairs: [{ a: path[1].toArray(), b: path[2].toArray(), count: 10, width: 3.2 }] }, access: { route: walk.map(p => p.toArray()), speed: 6, doorComponent: 'engineering312-connection-door', sourceDoorComponent: 'engineering303-entry-door', startOnExisting303Deck: true, verified: false } });
  source.userData.northConnection = { implemented: true, owner: id, endpoint: path[0].toArray() }; target.userData.connection = { implemented: true, owner: id, entryFloor: 5 };
  return assembly.finish();
}
