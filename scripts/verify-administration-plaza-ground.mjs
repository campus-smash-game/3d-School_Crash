import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import * as T from 'three';
import R from '@dimforge/rapier3d-compat';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), out = path.join(root, 'artifacts/administration-plaza-ground-test');
await fs.mkdir(out, { recursive: true });
const hashes = {}, hash = value => createHash('sha256').update(value).digest('hex');
for (const file of (await fs.readdir(path.join(root, 'src'))).filter(p => p.endsWith('.ts'))) {
  const source = await fs.readFile(path.join(root, 'src', file), 'utf8'); hashes['src/' + file] = hash(source);
  await fs.writeFile(path.join(out, file.replace('.ts', '.mjs')), ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/from (['"])(\.\/[\w-]+)\1/g, "from '$2.mjs'"));
}
globalThis.document = { createElement() { return { width: 0, height: 0, getContext() { return new Proxy({}, { get(o, k) { if (k === 'measureText') return s => ({ width: String(s).length * 20 }); if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} }); return o[k] ?? (() => {}); }, set(o, k, v) { o[k] = v; return true; } }); } }; } };
const [{ createTerrain }, { createFullCampus }, { createAdministrationPlazaGround }, { createAdministrationPlazaFacilities }, { Simulation }] = await Promise.all(['terrain', 'fullCampus', 'administrationPlazaGround', 'administrationPlazaFacilities', 'physics'].map(n => import(pathToFileURL(path.join(out, n + '.mjs')))));
await R.init();
async function dataFile(file) { const buffer = await fs.readFile(path.join(root, file)); hashes[file] = hash(buffer); return JSON.parse(buffer); }
const raw = await dataFile('public/data/campus.json'), transit = await dataFile('public/data/campus-transit.json'), dem = await dataFile('public/data/terrain.json');
const data = { ...raw, roads: [...raw.roads, ...transit.supplementalRoads] }, scene = new T.Scene(), terrain = createTerrain(scene, dem, data.buildings), campus = createFullCampus(scene, data, terrain.heightAt);
const road = scene.getObjectByName('campus-road-surface'), roadHash = hash(road.geometry.attributes.position.array), terrainHash = hash(terrain.vertices), buildings = scene.children.filter(o => o.userData.role === 'building-shell').map(o => ({ o, hashes: o.children.filter(m => m.isMesh).map(m => hash(m.geometry.attributes.position.array)) }));
const groundSources = scene.children.filter(o => o.isMesh && (['campus-terrain', 'campus-road-surface', 'campus-pedestrian-surface'].includes(o.name) || o.userData.role === 'mapped-area'));
const originalDisplays = groundSources.filter(o => o.name === 'campus-pedestrian-surface' || o.userData.role === 'mapped-area').map(o => ({ current: o, original: new T.Mesh(o.geometry.clone(),o.material) }));
const boards = createAdministrationPlazaFacilities(scene, data, terrain.heightAt), model = createAdministrationPlazaGround(scene, terrain.heightAt), info = model.shell.userData;
const paint = model.shell.children.find(m => m.name === 'administration-paving-surface'), plants = model.shell.children.find(m => m.name === 'administration-notice-back-planting'), plantOriginal = plants.geometry.attributes.position.array.slice(), paintOriginal = paint.geometry.attributes.position.array.slice();
const pedestrian = model.shell.getObjectByName('administration-pedestrian-paving');
const axis = new T.Vector3().fromArray(info.axis), across = new T.Vector3().fromArray(info.across), origin = new T.Vector3().fromArray(info.start), near = origin.clone().setY(terrain.heightAt(origin.x, origin.z) + 1.7), far = new T.Vector3(10000, 500, 10000);
const sim = new Simulation([...campus.breakables, ...boards.breakables, ...model.breakables], campus.colliders, near, data.bounds, terrain), targets = sim.targets.filter(t => t.mesh.userData.facilityId === model.shell.name), results = [];
function expect(value, message, details) { if (!value) throw Object.assign(Error(message), { details }); }
function check(name, fn) { try { const details = fn(); results.push({ name, status: 'PASS', ...details }); console.log('PASS ' + name); } catch (e) { results.push({ name, status: 'FAIL', error: e.message, details: e.details }); console.log('FAIL ' + name + ': ' + e.message + ' ' + JSON.stringify(e.details ?? {})); } }
function update(p) { campus.update(p); boards.update(p); model.update(p); scene.updateMatrixWorld(true); }
function reset() { sim.reset(); sim.setFocus(near, true); sim.world.step(); update(near); }
const world = (s, n) => origin.clone().addScaledVector(axis, s).addScaledVector(across, n);
function walk(goal) { let frames = 0, stalled = 0; for (; frames < 800; frames++) { const before = new T.Vector3().copy(sim.player.translation()), d = goal.clone().sub(before).setY(0); if (d.length() < .13) break; d.normalize(); sim.step(1 / 60, d.x * 6, d.z * 6, false); stalled = new T.Vector3().copy(sim.player.translation()).sub(before).setY(0).length() < .001 ? stalled + 1 : 0; if (stalled > 90) break; } const end = new T.Vector3().copy(sim.player.translation()); return { end: end.toArray(), remaining: end.clone().sub(goal).setY(0).length(), frames }; }
try {
  reset();
  check('photo-limited pavement shrubs curbs and bollards preserve existing geometry', () => {
    expect(hash(road.geometry.attributes.position.array) === roadHash && hash(terrain.vertices) === terrainHash, 'road or terrain changed');
    for (const b of buildings) expect(b.o.children.filter(m => m.isMesh).every((m, i) => hash(m.geometry.attributes.position.array) === b.hashes[i]), 'building changed');
    expect(model.shell.children.length === 3 && targets.filter(t => t.mesh.userData.component === 'notice-back-shrub').length === 5 && targets.filter(t => t.mesh.userData.component === 'stone-bollard').length === 2 && targets.filter(t => t.mesh.userData.component === 'sidewalk-curb').length > 0, 'unexpected draw calls or paving collision');
    const kinds = new Set(paint.userData.regions.map(r => r.kind)); expect(['dark-block', 'light-cross-band', 'yellow-edge'].every(k => kinds.has(k)), 'observed surface pattern missing');
    return { renderMeshes: 3, breakableParts: targets.length, triangles: info.triangles, shrubs: info.shrubs.length, localBounds: info.localBounds, roadTrianglesRead: info.sourceRoadTriangles, physicalPavingCollider: false };
  });
  check('every paving triangle follows the visible production road surface at three centimetres', () => {
    const actual = road.geometry.attributes.position, index = road.geometry.index, localPositions = [];
    paint.geometry.computeBoundingBox(); const bounds = paint.geometry.boundingBox.clone().expandByScalar(.05);
    for (let i = 0; i < (index?.count ?? actual.count); i += 3) { const v = [0, 1, 2].map(j => new T.Vector3().fromBufferAttribute(actual, index ? index.getX(i + j) : i + j)); if (new T.Box3().setFromPoints(v).intersectsBox(bounds)) v.forEach(p => localPositions.push(p.x, p.y, p.z)); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(localPositions, 3)); const localRoad = new T.Mesh(g, new T.MeshBasicMaterial({ side: T.DoubleSide })); localRoad.updateMatrixWorld(true);
    let samples = 0, minimum = Infinity, maximum = -Infinity;
    const p = paint.geometry.attributes.position;
    for (let i = 0; i < p.count; i += 3) { const v = [0, 1, 2].map(j => new T.Vector3().fromBufferAttribute(p, i + j));
      for (const [a, b, c] of [[1/3,1/3,1/3],[.8,.1,.1],[.1,.8,.1],[.1,.1,.8]]) { const q = v[0].clone().multiplyScalar(a).addScaledVector(v[1], b).addScaledVector(v[2], c); const hit = new T.Raycaster(q.clone().add(new T.Vector3(0, 3, 0)), new T.Vector3(0, -1, 0), 0, 5).intersectObject(localRoad, false)[0]; expect(hit, 'paving leaves the real road', { q: q.toArray() }); const clearance = q.y - hit.point.y; minimum = Math.min(minimum, clearance); maximum = Math.max(maximum, clearance); const delta = q.clone().sub(origin), s = delta.dot(axis), n = delta.dot(across); expect(s > -.001 && s < 13.001 && Math.abs(n) < 2.601, 'paving expanded beyond reviewed bounds'); samples++; }
    }
    expect(samples > 1000 && minimum > .029 && maximum < .031, 'paint surface differs from actual road triangles', { samples, minimum, maximum }); g.dispose(); return { samples, minimumRoadClearance: minimum, maximumRoadClearance: maximum, source: 'Read-only local subset of actual fullCampus road triangles, including overlapping road surfaces.' };
  });
  check('low planting does not intersect the existing boards buildings or pedestrian channel', () => {
    sim.setFocus(world(6.5, -3), true); sim.world.step(); let contacts = 0;
    for (const target of targets.filter(t => t.mesh.userData.component === 'notice-back-shrub')) { expect(target.body, 'shrub not loaded'); for (const other of sim.nearby(target.mesh.position, 4)) { if (other === target || !other.body || other.mesh.userData.facilityId === model.shell.name) continue; const contact = target.body.collider(0).contactCollider(other.body.collider(0), 0); if (contact && contact.distance < -.005) { contacts++; throw Object.assign(Error('shrub overlaps existing geometry'), { details: { point: target.mesh.position.toArray(), other: other.mesh.userData.component, building: other.buildingId, distance: contact.distance } }); } }
    }
    const start = world(-1, 3.45), end = world(14, 3.45); sim.teleport(start.clone().setY(terrain.heightAt(start.x, start.z) + 1.7)); for (let i = 0; i < 30; i++) sim.step(1/60,0,0,false); const forward = walk(end), back = walk(start); expect(forward.remaining < .2 && back.remaining < .2, 'existing pedestrian channel blocked', { forward, back }); return { contacts, forward, back, speed: 6 };
  });
  check('photo sidewalk follows continuous terrain with limited perimeter blending', () => {
    const vertices = [], bounds = new T.Box3().setFromObject(pedestrian).expandByScalar(.1);
    for (const source of [terrain.mesh]) { const p = source.geometry.attributes.position, index = source.geometry.index;
      for (let i = 0; i < (index?.count ?? p.count); i += 3) { const v = [0,1,2].map(j=>new T.Vector3().fromBufferAttribute(p,index?index.getX(i+j):i+j)); if(new T.Box3().setFromPoints(v).intersectsBox(bounds)) v.forEach(q=>vertices.push(...q.toArray())); }
    }
    const geometry = new T.BufferGeometry(); geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3)); const sourceMesh = new T.Mesh(geometry,new T.MeshBasicMaterial({side:T.DoubleSide})); sourceMesh.updateMatrixWorld(true);
    let samples=0,minimum=Infinity,maximum=-Infinity,worst=null;const p=pedestrian.geometry.attributes.position;
    for(let i=0;i<pedestrian.userData.topVertexCount;i+=3){const v=[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(p,i+j));if(new T.Triangle(...v).getArea()<1e-8)continue;for(const weights of [[1/3,1/3,1/3],[.8,.1,.1],[.1,.8,.1],[.1,.1,.8]]){const q=v[0].clone().multiplyScalar(weights[0]).addScaledVector(v[1],weights[1]).addScaledVector(v[2],weights[2]),hit=new T.Raycaster(q.clone().add(new T.Vector3(0,3,0)),new T.Vector3(0,-1,0),0,6).intersectObject(sourceMesh,false)[0];expect(hit,'sidewalk leaves ground');const gap=q.y-hit.point.y;if(gap<minimum)worst={q:q.toArray(),hit:hit.point.toArray(),i};minimum=Math.min(minimum,gap);maximum=Math.max(maximum,gap);const d=q.clone().sub(origin),u=d.dot(axis),n=d.dot(across);expect(u>=-.001&&u<=13.001&&n>=2.899&&n<=8.001,'sidewalk outside photo scope');samples++;}}
    expect(samples>20&&minimum>.029&&maximum<.185,'sidewalk height exceeds its terrain and perimeter bounds',{samples,minimum,maximum,worst});
    let coverageSamples=0;for(let u=.1;u<13;u+=.2)for(let n=3;n<8;n+=.2){const q=world(u,n).setY(100),ray=new T.Raycaster(q,new T.Vector3(0,-1,0),0,100),base=ray.intersectObject(sourceMesh,false)[0],cover=ray.intersectObject(pedestrian,false)[0];expect(base&&cover&&cover.point.y-base.point.y>.029&&cover.point.y-base.point.y<.185&&(!(u>.85&&u<12.15&&n>3.75&&n<7.15)||Math.abs(cover.point.y-base.point.y-.03)<.001),'paving has a gap or raised interior',{u,n,base:base?.point.toArray(),cover:cover?.point.toArray()});coverageSamples++;}
    geometry.dispose();return {samples,coverageSamples,minimum,maximum,readOnlySourceMeshes:groundSources.length};
  });
  check('sidewalk has no internal height steps and normalization leaves outside displays intact',()=>{
    const p=pedestrian.geometry.attributes.position;let maximumStep=0,samples=0;
    for(let u=.1;u<13;u+=.25){let previous=null;for(let n=3;n<8;n+=.025){const q=world(u,n).setY(100),hit=new T.Raycaster(q,new T.Vector3(0,-1,0),0,100).intersectObject(pedestrian,false)[0];expect(hit,'cross section has a gap',{u,n});if(previous!==null)maximumStep=Math.max(maximumStep,Math.abs(hit.point.y-previous));previous=hit.point.y;samples++;}}
    expect(maximumStep<.025,'sidewalk has an internal height step',{maximumStep,samples});
    let unchangedTriangles=0;const triangleKeys=geometry=>{const p=geometry.attributes.position,index=geometry.index,out=[];for(let i=0;i<(index?.count??p.count);i+=3){const vertices=[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(p,index?index.getX(i+j):i+j));out.push({vertices,key:vertices.map(v=>v.toArray().join(',')).join(';')});}return out;};
    for(const pair of originalDisplays){const currentKeys=new Set(triangleKeys(pair.current.geometry).map(v=>v.key));for(const t of triangleKeys(pair.original.geometry)){const local=t.vertices.map(v=>v.clone().sub(origin)).map(v=>[v.dot(axis),v.dot(across)]);if(Math.max(...local.map(p=>p[0]))<0||Math.min(...local.map(p=>p[0]))>13||Math.max(...local.map(p=>p[1]))<2.9||Math.min(...local.map(p=>p[1]))>8){expect(currentKeys.has(t.key),'unrelated display triangle changed',{name:pair.current.name,area:pair.current.userData.areaId});unchangedTriangles++;}}}
    const old=originalDisplays.map(p=>p.original),current=originalDisplays.map(p=>p.current);old.forEach(o=>o.updateMatrixWorld(true));let outsideSamples=0;
    for(let u=-2;u<=15;u+=.25)for(let n=.9;n<=10;n+=.25){if(u>-.001&&u<13.001&&n>2.899&&n<8.001)continue;const q=world(u,n).setY(100),ray=new T.Raycaster(q,new T.Vector3(0,-1,0),0,100),firstOld=ray.intersectObjects(old,false)[0],firstCurrent=ray.intersectObjects(current,false)[0];let a=firstOld,b=firstCurrent;if(!!a!==!!b){const heights=meshes=>[-.0001,0,.0001].flatMap(dx=>[-.0001,0,.0001].flatMap(dz=>new T.Raycaster(q.clone().add(new T.Vector3(dx,0,dz)),new T.Vector3(0,-1,0),0,100).intersectObjects(meshes,false))).sort((a,b)=>a.distance-b.distance)[0];a=heights(old);b=heights(current);}expect(!!a===!!b&&(!a||Math.abs(a.point.y-b.point.y)<.0002),'outside display height changed',{u,n,before:a?.point.y,after:b?.point.y});outsideSamples++;}
    return{crossSectionSamples:samples,maximumStepPer2_5Centimetres:maximumStep,unchangedTriangles,outsideSamples,boundaryFloat32ProbeRadius:.0001,normalization:pedestrian.userData.normalizedSurfaces,approvedBounds:info.pedestrianBounds};
  });
  check('one procedural texture retains joints dark inlays and tactile T with no per-block colliders', () => {
    const texture=pedestrian.material.map,uv=pedestrian.geometry.attributes.uv,p=pedestrian.geometry.attributes.position;expect(texture?.isDataTexture&&texture.image.width===512&&texture.image.height===512,'texture budget changed');expect(texture.generateMipmaps&&texture.minFilter===T.LinearMipmapLinearFilter,'minification filter missing');expect(uv.count===p.count&&targets.every(t=>!t.mesh.userData.component.includes('paving')),'paving collider or UV missing');
    const pixel=(s,n)=>{const x=Math.min(511,Math.floor(s/13*512)),y=Math.min(511,Math.floor((n-2.9)/5.1*512)),i=(y*512+x)*4;return Array.from(texture.image.data.slice(i,i+3));};
    const bright=pixel(3.12,4.02),dark=pixel(4.8,4.02),head=pixel(.9,3.2),stem=pixel(1.5,4.3);expect(bright[0]>160&&dark[0]<110,'light blocks or broad bands missing',{bright,dark});expect(head[0]>170&&head[2]<80&&stem[0]>170&&stem[2]<80,'tactile T missing',{head,stem});
    const row=[];for(let j=0;j<50;j++)row.push(pixel(3+j*.005,4.02)[0]);expect(Math.max(...row)-Math.min(...row)>35,'grout contrast missing');
    for(let i=0;i<p.count;i++){const d=new T.Vector3().fromBufferAttribute(p,i).sub(origin);expect(Math.abs(uv.getX(i)-d.dot(axis)/13)<.00001&&Math.abs(uv.getY(i)-(d.dot(across)-2.9)/5.1)<.00001,'metric UV differs');}
    return {textureCount:1,textureBytes:texture.image.data.byteLength,additionalDrawCalls:1,groutContrast:Math.max(...row)-Math.min(...row),bright,dark,head,stem};
  });
  check('lowered curb permits road to tactile approach and sidewalk crossings at six metres per second', () => {
    const journeys=[];for(const s of [1,1.5,2]){reset();const a=world(s,1.8),b=world(s,4);sim.teleport(a.clone().setY(terrain.heightAt(a.x,a.z)+1.7));for(let i=0;i<30;i++)sim.step(1/60,0,0,false);const forward=walk(b),back=walk(a);expect(forward.remaining<.2&&back.remaining<.2,'lowered curb blocks capsule',{s,forward,back});journeys.push({s,forward,back});}
    for(const n of [3.45,5.7,7.2]){reset();const a=world(-1,n),b=world(14,n);sim.teleport(a.clone().setY(terrain.heightAt(a.x,a.z)+1.7));for(let i=0;i<30;i++)sim.step(1/60,0,0,false);const forward=walk(b),back=walk(a);expect(forward.remaining<.2&&back.remaining<.2,'sidewalk route blocked',{n,forward,back});journeys.push({n,forward,back});}return{speed:6,journeys};
  });
  check('stone curbs and bollards use their actual visible convex shapes and restore after damage',()=>{
    reset();const stones=targets.filter(t=>t.mesh.userData.component!=='notice-back-shrub');let sampled=0,maximum=0;
    for(const t of stones){const p=t.mesh.geometry.attributes.position;let v;for(let i=0;i<p.count;i+=3){const a=new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(t.mesh.matrixWorld),b=new T.Vector3().fromBufferAttribute(p,i+1).applyMatrix4(t.mesh.matrixWorld),c=new T.Vector3().fromBufferAttribute(p,i+2).applyMatrix4(t.mesh.matrixWorld),normal=new T.Triangle(a,b,c).getNormal(new T.Vector3());if(normal.y>.5){v=a.add(b).add(c).multiplyScalar(1/3);break;}}if(!v)continue;sim.setFocus(v,true);sim.world.step();const start=v.clone().add(new T.Vector3(0,1,0)),direction=new T.Vector3(0,-1,0),hit=sim.world.castRay(new R.Ray(start,direction),2,true,undefined,undefined,undefined,undefined,c=>!!t.body&&c.parent()?.handle===t.body.handle);expect(hit,'stone collider missing',{position:v.toArray(),body:!!t.body,component:t.mesh.userData.component,size:t.size.toArray(),vertices:p.count});maximum=Math.max(maximum,Math.abs(hit.timeOfImpact-1));sampled++;}
    expect(sampled===stones.length&&maximum<.003,'stone surface differs',{sampled,stones:stones.length,maximum});const target=stones.find(t=>t.mesh.userData.component==='stone-bollard');sim.hit(target,100,new T.Vector3(0,-1,0));update(far);sim.setFocus(far,true);sim.world.step();expect(!target.mesh.visible,'bollard remains after destruction');reset();expect(plants.geometry.attributes.position.array.every((v,i)=>v===plantOriginal[i]),'curb or bollard reset differs');return{sampled,maximum,stoneParts:stones.length};
  });
  check('lowered curb transitions and sloped bollard tops match visible stone surfaces',()=>{
    reset();const curbs=targets.filter(t=>t.mesh.userData.component==='sidewalk-curb'),owners=new Set(curbs.map(t=>t.body?.handle).filter(h=>h!==undefined));let maximumStep=0,samples=0;
    for(const [a,b]of [[.025,.475],[2.525,3.475]]){let previous=null;for(let s=a;s<=b+.0001;s+=.05){const p=world(s,2.8).setY(100),hit=sim.world.castRay(new R.Ray(p,new T.Vector3(0,-1,0)),100,true,undefined,undefined,undefined,undefined,c=>owners.has(c.parent()?.handle));expect(hit,'curb transition missing');const y=100-hit.timeOfImpact;if(previous!==null)maximumStep=Math.max(maximumStep,Math.abs(y-previous));previous=y;samples++;}}
    expect(maximumStep<.025,'curb lowering has a vertical discontinuity',{maximumStep});
    const slopes=[];for(const t of targets.filter(t=>t.mesh.userData.component==='stone-bollard')){const p=t.mesh.geometry.attributes.position,faces=[];for(let i=0;i<p.count;i+=3){const v=[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(p,i+j).applyMatrix4(t.mesh.matrixWorld)),normal=new T.Triangle(...v).getNormal(new T.Vector3());if(normal.y>.5)faces.push(normal.y);}expect(faces.length&&faces.every(y=>y<.99&&y>.8),'bollard top is not visibly inclined');slopes.push(...faces);}
    return{samples,maximumStep,bollardTopNormalY:slopes};
  });
  check('shrub surfaces and destruction agree before and after the single world reflection', () => {
    const target = targets[0], p = target.mesh.position.clone().addScaledVector(across, 2), d = across.clone().negate(), owners = () => new Map(targets.filter(t => t.body).map(t => [t.body.handle, t]));
    sim.setFocus(p, true); sim.world.step(); const visual = new T.Raycaster(p,d,0,3).intersectObject(plants,false)[0], map=owners(), physical=sim.world.castRay(new R.Ray(p,d),3,true,undefined,undefined,undefined,undefined,c=>map.has(c.parent()?.handle)); expect(visual && physical && Math.abs(visual.distance-physical.timeOfImpact)<.003,'shrub surface mismatch');
    scene.scale.z=-1;scene.updateMatrixWorld(true);const hit=new T.Raycaster(new T.Vector3(p.x,p.y,-p.z),new T.Vector3(d.x,d.y,-d.z),0,3).intersectObject(plants,false)[0];expect(hit&&Math.abs(hit.distance-visual.distance)<.001,'H mismatch');scene.scale.z=1;scene.updateMatrixWorld(true);
    sim.hit(target,100,d);update(far);sim.setFocus(far,true);sim.world.step();expect(!target.mesh.visible && sim.castUnloadedTargets(p,d,2.8)?.target !== target,'destroyed shrub remains in distant query');expect(paint.geometry.attributes.position.array.every((v,i)=>v===paintOriginal[i]),'plant destruction alters paving');
    reset();expect(plants.geometry.attributes.position.array.every((v,i)=>v===plantOriginal[i]),'shrub reset differs');for(const t of targets)sim.hit(t,100,d);update(far);expect(!plants.visible&&paint.visible,'ground should retain its existing nonbreakable surface');reset();expect(plants.visible,'plant reset visibility missing');return{surfaceError:Math.abs(visual.distance-physical.timeOfImpact),restoredParts:targets.length,pavingRemainsVisible:true};
  });
} finally {
  sim.world.removeCharacterController(sim.controller);sim.world.free();const sourceStillMatches={};for(const [file,value]of Object.entries(hashes))sourceStillMatches[file]=hash(await fs.readFile(path.join(root,file)))===value;
  await fs.writeFile(path.join(out,'results.json'),JSON.stringify({scope:'Node actual fullCampus roads, buildings, terrain, administration boards and Rapier. No browser or mobile performance claim.',hashes,sourceStillMatches,results},null,2)+'\n');
}
if(results.some(r=>r.status!=='PASS'))process.exitCode=1;
