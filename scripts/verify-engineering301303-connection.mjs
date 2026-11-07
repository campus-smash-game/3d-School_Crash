import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts/engineering301303-connection-test');
await mkdir(out, { recursive: true });
const hashes = {};
for (const name of ['engineering301303Connection', 'engineering301303Site', 'livingScienceCourtyardSite', 'educationParkingSite', 'educationParkingTerrain', 'dining76Site', 'dining76Terrain', 'dining76EastSite', 'dining76EastTerrain', 'education101EntrySite', 'education101EntryTerrain', 'education12Site', 'education12Terrain', 'humanitiesGardenSite', 'humanitiesGardenTerrain', 'engineering301Landmark', 'engineering303Landmark', 'terrain', 'physics', 'coordinates', 'traffic']) {
  const file = `src/${name}.ts`, source = await readFile(path.join(root, file), 'utf8');
  hashes[file] = createHash('sha256').update(source).digest('hex');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  await writeFile(path.join(out, name + '.mjs'), js.replace(/from (['"])(\.\/[\w-]+)\1/g, "from '$2.mjs'"));
}
const { createEngineering301303Connection: create } = await import(pathToFileURL(path.join(out, 'engineering301303Connection.mjs')));
const { Simulation } = await import(pathToFileURL(path.join(out, 'physics.mjs')));
const { dataToRenderPoint: H } = await import(pathToFileURL(path.join(out, 'coordinates.mjs')));
await RAPIER.init();

// 이 배치는 부품 계약 검사용이다. 캠퍼스의 최종 위치나 높이로 사용하지 않는다.
const fixture = {
  decks: [{ id: 'test-crossing', a: [-10, 6, 0], b: [10, 6, 0], width: 8, thickness: .25, underframe: { depth: .5, bayLength: 4, memberWidth: .22 } }],
  rails: [-4, 4].map(z => ({ id: `test-rail-${z}`, a: [-10, 6, z], b: [10, 6, z], screenBottom: -.4, screenTop: .9, glassTop: 1.9, slatWidth: .14, slatPitch: .4, panelLength: 2 })),
  columns: [-7, 7].flatMap(x => [-3.4, 3.4].map(z => ({ id: `test-column-${x}-${z}`, x, z, bottom: 0, top: 5.25, radius: .5 }))),
  stairs: [{ id: 'test-stair', a: [-22, 0, 0], b: [-10, 6, 0], width: 3, count: 30, thickness: .22 }],
  sourceUrls: [], dimensionsEstimated: true, siteAlignmentConfirmed: false,
};
const scene = new THREE.Scene(), model = create(scene, fixture), meshes = model.shell.children, original = meshes.map(m => m.geometry.attributes.position.array.slice());
const near = new THREE.Vector3(0, 8, 0), far = new THREE.Vector3(10000, 100, 10000), up = new THREE.Vector3(0, 1, 0);
const sim = new Simulation(model.breakables, [], near, { minX: -300, maxX: 300, minZ: -300, maxZ: 300 });
const results = [];
function check(name, fn) { if(process.argv[2]&&!name.includes(process.argv[2]))return;try { const details = fn(); results.push({ name, status: 'PASS', ...details }); console.log('PASS ' + name + ' ' + JSON.stringify(details)); } catch (error) { results.push({ name, status: 'FAIL', error: String(error) }); console.error('FAIL ' + name + ': ' + error); } }
function visual(p, d, distance) { scene.updateMatrixWorld(true); return new THREE.Raycaster(p, d, 0, distance).intersectObjects(meshes, false)[0] ?? null; }
function cast(p, d, distance) { const owners = new Map(sim.targets.filter(t => t.body).map(t => [t.body.handle, t])); const h = sim.world.castRay(new RAPIER.Ray(p, d), distance, true, undefined, undefined, undefined, undefined, c => owners.has(c.parent()?.handle)); return h ? { object: owners.get(h.collider.parent().handle).mesh, distance: h.timeOfImpact } : null; }
function reset() { sim.reset(); sim.setFocus(near, true); sim.world.step(); model.update(near); }
function triangles() { if (!model.shell.visible) return 0; let count = 0; for (const m of meshes) { const p = m.geometry.attributes.position; for (let i = 0; i < p.count; i += 3) { const a = new THREE.Vector3().fromBufferAttribute(p, i), b = new THREE.Vector3().fromBufferAttribute(p, i + 1), c = new THREE.Vector3().fromBufferAttribute(p, i + 2); if (b.sub(a).cross(c.sub(a)).lengthSq() > 1e-12) count++; } } return count; }
const initialTriangles = triangles();
try {
  check('explicit layout creates three surfaces and rejects duplicate registration', () => {
    assert.equal(meshes.length, 3); assert.ok(model.breakables.length < 500);
    assert.ok(meshes.every(m => [...m.geometry.attributes.position.array].every(Number.isFinite)));
    assert.throws(() => create(scene, fixture), /already exists/);
    assert.equal(meshes.find(m => m.name.endsWith('transparent-railing')).material.transparent, true);
    return { parts: model.breakables.length, triangles: initialTriangles, renderMeshes: meshes.length, fixtureOnly: true };
  });
  check('road space and real screen gaps remain empty with loaded and unloaded targets', () => {
    const rays = [
      { p: new THREE.Vector3(0, 2, -8), d: new THREE.Vector3(0, 0, 1), length: 16 },
      { p: new THREE.Vector3(0, 6.4, -5), d: new THREE.Vector3(0, 0, 1), length: 10 },
      { p: new THREE.Vector3(7.45, 1, 3.85), d: up, length: 3 },
    ];
    for (const r of rays) { assert.equal(visual(r.p, r.d, r.length), null); sim.setFocus(r.p, true); sim.world.step(); assert.equal(cast(r.p, r.d, r.length), null); }
    sim.setFocus(far, true); for (const r of rays) assert.equal(sim.castUnloadedTargets(r.p, r.d, r.length), null);
    reset(); return { openRays: rays.length };
  });
  check('deck timber glass braces and round columns use the visible convex surfaces', () => {
    const rays = [
      [new THREE.Vector3(.37, 7, .73), up.clone().negate(), 2],
      [new THREE.Vector3(.2, 6.4, 5), new THREE.Vector3(0, 0, -1), 2],
      [new THREE.Vector3(.3, 7.4, 5), new THREE.Vector3(0, 0, -1), 2],
      [new THREE.Vector3(7, 2, 5), new THREE.Vector3(0, 0, -1), 2],
    ];
    const records = []; let maxSurfaceDifference = 0, maxLoadedDifference = 0;
    for (const [p, d, length] of rays) { const render = visual(p, d, length); assert.ok(render); sim.setFocus(p, true); sim.world.step(); const hit = cast(p, d, length); assert.ok(hit); maxSurfaceDifference = Math.max(maxSurfaceDifference, Math.abs(render.distance - hit.distance)); records.push({ p, d, length, hit }); }
    sim.setFocus(far, true); for (const r of records) { const hit = sim.castUnloadedTargets(r.p, r.d, r.length); assert.ok(hit); assert.equal(hit.object, r.hit.object); maxLoadedDifference = Math.max(maxLoadedDifference, Math.abs(hit.distance - r.hit.distance)); }
    assert.ok(maxSurfaceDifference < .002); assert.ok(maxLoadedDifference < .002); reset(); return { rays: records.length, maxSurfaceDifference, maxLoadedDifference };
  });
  check('rotated screen geometry preserves its narrow slats and true gaps', () => {
    const angle = Math.PI / 5, transform = p => [Math.cos(angle) * p[0] - Math.sin(angle) * p[2], p[1], Math.sin(angle) * p[0] + Math.cos(angle) * p[2]];
    const other = new THREE.Scene(), rotated = structuredClone(fixture); rotated.decks = rotated.decks.map(d => ({ ...d, a: transform(d.a), b: transform(d.b) })); rotated.rails = rotated.rails.map(d => ({ ...d, a: transform(d.a), b: transform(d.b) })); rotated.columns = []; rotated.stairs = [];
    const model2 = create(other, rotated); other.updateMatrixWorld(true);
    const normal = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle)), origin = new THREE.Vector3(...transform([0, 6.4, -5]));
    assert.equal(new THREE.Raycaster(origin, normal, 0, 10).intersectObjects(model2.shell.children, false).length, 0);
    const slatOrigin = new THREE.Vector3(...transform([.2, 6.4, -5])); assert.ok(new THREE.Raycaster(slatOrigin, normal, 0, 2).intersectObjects(model2.shell.children, false).length > 0);
    return { angle, rotatedGapOpen: true };
  });
  check('test stairs and deck support centre and edge return trips at six metres per second', () => {
    const paths = [];
    for (const z of [-.8, 0, .8]) {
      reset(); sim.teleport(new THREE.Vector3(-23, 1.7, z));
      for (let i = 0; i < 300; i++) sim.step(1 / 60, 6, 0, false);
      const forward = { ...sim.player.translation() }; assert.ok(forward.x > 1, JSON.stringify(forward)); assert.ok(forward.y > 6.7);
      for (let i = 0; i < 300; i++) sim.step(1 / 60, -6, 0, false);
      const backward = { ...sim.player.translation() }; assert.ok(backward.x < -22, JSON.stringify(backward)); paths.push({ z, forward, backward });
    }
    reset(); return { paths, actualCampusAccessTested: false };
  });
  check('one H transform changes presentation once while logical collision queries stay fixed', () => {
    const p = new THREE.Vector3(.3, 7.4, 5), d = new THREE.Vector3(0, 0, -1), before = visual(p, d, 2); assert.ok(before);
    sim.setFocus(p, true); sim.world.step(); const loaded = cast(p, d, 2); assert.ok(loaded);
    scene.scale.z = -1; scene.updateMatrixWorld(true); const after = new THREE.Raycaster(H(p), H(d), 0, 2).intersectObjects(meshes, false)[0]; assert.ok(after); assert.ok(Math.abs(before.distance - after.distance) < .001);
    sim.setFocus(far, true); const unloaded = sim.castUnloadedTargets(p, d, 2); assert.ok(unloaded && unloaded.object === loaded.object);
    scene.scale.z = 1; scene.updateMatrixWorld(true); reset(); return { reflectedDistanceDifference: Math.abs(before.distance - after.distance) };
  });
  check('partial and total destruction persist at distance and reset restores exact geometry', () => {
    for (const kind of ['deck-panel', 'timber-screen-slat', 'transparent-rail-panel', 'round-support-column', 'underframe-x-brace']) { const target = sim.targets.find(t => t.mesh.userData.component === kind); assert.ok(target); sim.hit(target, 100, up); }
    model.update(near); const remaining = triangles(); assert.ok(remaining < initialTriangles);
    for (const distance of [279, 281, 900]) { model.update(new THREE.Vector3(distance, 10, 0)); assert.equal(triangles(), remaining); }
    for (let cycle = 0; cycle < 3; cycle++) { reset(); meshes.forEach((m, i) => assert.deepEqual(m.geometry.attributes.position.array, original[i])); }
    for (const target of sim.targets) sim.hit(target, 100, up); model.update(far); assert.equal(triangles(), 0); reset(); return { remaining, restored: triangles(), resetCycles: 3 };
  });
} finally { sim.world.free(); }
const fsFullCampus=await readFile(path.join(root,'src/fullCampus.ts'),'utf8');hashes['src/fullCampus.ts']=createHash('sha256').update(fsFullCampus).digest('hex');
const campusData=JSON.parse(await readFile(path.join(root,'public/data/campus.json'),'utf8')),demData=JSON.parse(await readFile(path.join(root,'public/data/terrain.json'),'utf8'));
for(const file of ['public/data/campus.json','public/data/terrain.json'])hashes[file]=createHash('sha256').update(await readFile(path.join(root,file))).digest('hex');
const {Traffic}=await import(pathToFileURL(path.join(out,'traffic.mjs')));
const {createTerrain}=await import(pathToFileURL(path.join(out,'terrain.mjs'))),{createEngineering301Landmark}=await import(pathToFileURL(path.join(out,'engineering301Landmark.mjs'))),{createEngineering303Landmark}=await import(pathToFileURL(path.join(out,'engineering303Landmark.mjs'))),{createCampusEngineering301303Connection}=await import(pathToFileURL(path.join(out,'engineering301303Connection.mjs')));
const campusScene=new THREE.Scene(),terrain=createTerrain(campusScene,demData,campusData.buildings),profile={glassColor:0x7299c4,frameColor:0x999999,wallColor:0xaaaaaa};
const campus301=createEngineering301Landmark(campusScene,campusData.buildings.find(b=>b.id==='way/228476658'),profile,terrain.heightAt),campus303=createEngineering303Landmark(campusScene,campusData.buildings.find(b=>b.id==='supplemental/snu-303'),profile,terrain.heightAt),connection=createCampusEngineering301303Connection(campusScene,terrain.heightAt),campusModels=[campus301,campus303,connection];
const campusShells=campusScene.children.filter(o=>o.userData.role==='building-shell'||o.userData.role==='campus-connection'),campusMeshes=campusShells.flatMap(o=>o.children.filter(m=>m.isMesh)),access=connection.shell.userData.access,datum=connection.shell.userData.datum;
const campusSim=new Simulation(campusModels.flatMap(m=>m.breakables),[],new THREE.Vector3(323.01,terrain.heightAt(323.01,-1804.15)+1.7,-1804.15),campusData.bounds,terrain);
const resetCampus=()=>{campusSim.reset();for(const m of campusModels)m.update(new THREE.Vector3());},destroyDoor=kind=>{const targets=campusSim.targets.filter(t=>t.mesh.userData.component===kind);assert.ok(targets.length);for(const t of targets)campusSim.hit(t,100,up);for(const m of campusModels)m.update(new THREE.Vector3());};
const campusVisual=(p,d,range)=>{campusScene.updateMatrixWorld(true);return new THREE.Raycaster(p,d,0,range).intersectObjects(campusMeshes,false)[0]??null;};
const campusCast=(p,d,range)=>{const owners=new Map(campusSim.targets.filter(t=>t.body).map(t=>[t.body.handle,t]));const h=campusSim.world.castRay(new RAPIER.Ray(p,d),range,true,undefined,undefined,undefined,undefined,c=>owners.has(c.parent()?.handle));return h?{object:owners.get(h.collider.parent().handle).mesh,distance:h.timeOfImpact}:null;};
function moveCampus(x,z,max=1600){let frames=0,stalled=0,remaining=Infinity,maxPenetration=0;for(;frames<max;frames++){const p=campusSim.player.translation(),dx=x-p.x,dz=z-p.z;remaining=Math.hypot(dx,dz);if(remaining<.13)break;campusSim.step(1/60,dx/remaining*6,dz/remaining*6,false);const q=campusSim.player.translation();stalled=Math.hypot(q.x-p.x,q.z-p.z)<.001?stalled+1:0;if(frames%5===0)for(const t of campusSim.nearby(new THREE.Vector3(q.x,q.y,q.z),1.4)){if(!t.body)continue;const c=campusSim.playerCollider.contactCollider(t.body.collider(0),.03);if(c)maxPenetration=Math.max(maxPenetration,-c.distance);}if(stalled>100)break;}const p=campusSim.player.translation();return{target:[x,z],frames,remaining:Math.hypot(x-p.x,z-p.z),end:{...p},grounded:campusSim.grounded,maxPenetration};}
function walkCampus(points,spawn=true,spawnHeight){if(spawn){const p=points[0];campusSim.teleport(new THREE.Vector3(p[0],(spawnHeight??terrain.heightAt(...p))+1.7,p[1]));for(let i=0;i<20;i++)campusSim.step(1/60,0,0,false);}const segments=[];for(const p of points.slice(1)){const result=moveCampus(...p);segments.push(result);if(result.remaining>.2)break;}return{reached:segments.length===points.length-1&&segments.at(-1).remaining<.2,maxPenetration:Math.max(0,...segments.map(r=>r.maxPenetration)),segments};}
const aStart=access.roadStart,aTop=access.upperLanding,dir=new THREE.Vector2(aTop[0]-aStart[0],aTop[2]-aStart[2]).normalize(),side=new THREE.Vector2(-dir.y,dir.x),dz=access.upperDoor303[2],doorX=access.upperDoor303[0];
const externalRoute=offset=>[[323.01,-1804.15],access.groundApproach,[aStart[0]+side.x*offset,aStart[2]+side.y*offset],[aTop[0]+side.x*offset,aTop[2]+side.y*offset],[335.3,dz]];
try{
check('processed road output has bounded longitudinal and transverse grades',()=>{const road=campusData.roads.find(r=>r.id==='way/481787202/411');let maximumCenter=0,maximumEdge=0,maximumCross=0,sumCenter=0,centerSamples=0;const worst={};for(let i=1;i<road.points.length;i++){const a=road.points[i-1],b=road.points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),ux=dx/length,uz=dz/length,nx=uz,nz=-ux;for(let q=1;q<length-1;q+=.5){const x=a[0]+ux*q,z=a[1]+uz*q;if(z<-1944||z>-1740)continue;const ys=[-6.4,0,6.4].map(k=>terrain.heightAt(x+nx*k,z+nz*k)),cross=Math.atan2(Math.abs(ys[2]-ys[0]),12.8)*180/Math.PI;maximumCross=Math.max(maximumCross,cross);for(const[k,j]of[[-6.4,0],[0,1],[6.4,2]]){const next=terrain.heightAt(x+nx*k+ux*.5,z+nz*k+uz*.5),grade=Math.atan2(Math.abs(next-ys[j]),.5)*180/Math.PI;if(j===1){maximumCenter=Math.max(maximumCenter,grade);sumCenter+=grade;centerSamples++;}else if(grade>maximumEdge){maximumEdge=grade;Object.assign(worst,{x:x+nx*k,z:z+nz*k,grade});}}}}assert.ok(maximumCenter<16&&maximumEdge<23&&maximumCross<3,JSON.stringify({maximumCenter,maximumEdge,maximumCross,worst}));return{maximumCenter,meanCenter:sumCenter/centerSamples,maximumEdge,maximumCross,worst,centerSamples,limitsAreGameQualityChecksNotSurvey:true};});
check('road polygons use the same terrain triangles without hidden green intersections',()=>{const source=fsFullCampus,ribbonSource=source.slice(source.indexOf('  function ribbon('),source.indexOf('\n  for (const road of data.roads)',source.indexOf('  function ribbon('))),vertices=[],ribbon=new Function('heightAt','pathPositions','roadPositions',ts.transpileModule(ribbonSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText+';return ribbon;')(terrain.heightAt,[],vertices),road=campusData.roads.find(r=>r.id==='way/481787202/411');ribbon(road.points,road.width,vertices,.14);let samples=0,minimum=Infinity,maximum=0;for(let i=0;i<vertices.length;i+=9){const v=[vertices.slice(i,i+3),vertices.slice(i+3,i+6),vertices.slice(i+6,i+9)],x=v.reduce((s,q)=>s+q[0],0)/3,z=v.reduce((s,q)=>s+q[2],0)/3;if(z<-1944||z>-1740)continue;for(const weights of[[1/3,1/3,1/3],[.6,.2,.2],[.2,.6,.2],[.2,.2,.6]]){const q=[0,1,2].map(k=>v.reduce((sum,p,j)=>sum+p[k]*weights[j],0)),clear=q[1]-terrain.meshHeightAt(q[0],q[2]);minimum=Math.min(minimum,clear);maximum=Math.max(maximum,clear);samples++;}}assert.ok(samples>1000&&minimum>.16&&maximum<.18,JSON.stringify({samples,minimum,maximum}));return{samples,minimum,maximum,triangles:vertices.length/9};});

check('all mapped pedestrian paths and roads avoid new steep grades in the corrected area',()=>{
 const baseline=createTerrain(new THREE.Scene(),demData,campusData.buildings.filter(b=>b.id!=='supplemental/snu-303')),regions=terrain.heightAt.connectionCorrectionRegions,inside=(x,z)=>regions.some(q=>x>=q.minX&&x<=q.maxX&&z>=q.minZ&&z<=q.maxZ),rows=[],regressions=[];
 let outsideChanged=0,maximum=0,selectedRoads=0,totalSamples=0;
 for(const road of campusData.roads){let gradeMax=0,baselineGradeMax=0,changed=0,samples=0,maximumIncrease=0,worst;
  for(let i=1;i<road.points.length;i++){const a=road.points[i-1],b=road.points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(!length)continue;const n=Math.ceil(length/.5),step=length/n;
   for(const offset of new Set([-road.width/2,-.5,0,.5,road.width/2])){let previous;for(let k=0;k<=n;k++){const x=a[0]+dx*k/n-dz/length*offset,z=a[1]+dz*k/n+dx/length*offset,q={x,z,before:baseline.heightAt(x,z),after:terrain.heightAt(x,z)};
    if(previous){const delta=Math.max(Math.abs(q.after-q.before),Math.abs(previous.after-previous.before));if(inside(x,z)||inside(previous.x,previous.z)){samples++;totalSamples++;const before=Math.atan2(Math.abs(q.before-previous.before),step)*180/Math.PI,after=Math.atan2(Math.abs(q.after-previous.after),step)*180/Math.PI;gradeMax=Math.max(gradeMax,after);baselineGradeMax=Math.max(baselineGradeMax,before);if(delta>1e-4){changed++;if(after-before>maximumIncrease){maximumIncrease=after-before;worst={a:previous,b:q,offset,step,before,after};}if(after>45&&after>before+.25)regressions.push({id:road.id,a:previous,b:q,offset,step,before,after});}}else if(delta>1e-4)outsideChanged++;}previous=q;
   }}
  }
  if(samples){selectedRoads++;rows.push({id:road.id,kind:road.kind,drivable:road.drivable,width:road.width,samples,changed,gradeMax,baselineGradeMax,maximumIncrease,worst});maximum=Math.max(maximum,gradeMax);}
 }
 assert.equal(outsideChanged,0,'a changed original route was omitted by the declared correction cells');assert.equal(regressions.length,0,JSON.stringify(regressions.slice(0,8)));
 const originalPaths=['418','423','424','425','426','427','428','432','433','488','492'];for(const suffix of originalPaths){const row=rows.find(r=>r.id.endsWith('/'+suffix));assert.ok(row&&row.samples>0,'previously verified path was omitted: '+suffix);assert.ok(row.gradeMax<44.5,JSON.stringify(row));}
 const routes=[[[319.21,-1925.07],[325.71,-1925.65],[333.02,-1925.71],[333.2,-1905.36],[334.06,-1873.57],[333.94,-1851.83],[331.71,-1768.36]],[[319.69,-1949.6],[327.24,-1949.28],[333.38,-1951.31],[335.6,-1955.1]],[[334.24,-1992.62],[333.62,-1974.65],[333.38,-1951.31],[332.8,-1948.21],[333.02,-1925.71]]],paths=[];
 for(let routeIndex=0;routeIndex<routes.length;routeIndex++)for(const offset of[-.45,0,.45]){resetCampus();const points=routes[routeIndex].map(p=>[p[0]+offset,p[1]]),forward=walkCampus(points),backward=walkCampus(points.toReversed(),false);assert.ok(forward.reached&&backward.reached,JSON.stringify({routeIndex,offset,forward,backward}));assert.ok(Math.max(forward.maxPenetration,backward.maxPenetration)<.025);paths.push({routeIndex,offset,forward,backward});}
 resetCampus();return{maximum,rows,selectedRoads,changedRoads:rows.filter(r=>r.changed).length,originalRoadsExamined:campusData.roads.length,totalSamples,outsideChanged,newSteepRegressions:regressions.length,paths,speed:6,scope:'All original routes: <=0.5 m intervals including endpoints, centre, +/-0.5 m and both mapped edges. Existing steep slopes are recorded separately. Three terrain approach routes have centre/edge capsule return trips; not every campus route is fully traversed.'};
});
check('the exposed west notch remains below the low wing roof without changing the mapped outline',()=>{
 const building=campusData.buildings.find(b=>b.id==='way/228476658'),shell=campusShells.find(s=>s.userData.landmark==='engineering-301'),poly=building.points.slice(11,15),roof=datum.base301+shell.userData.low.roof;
 let maximum=-Infinity,samples=0;for(let v=0;v<=1;v+=.05)for(let u=0;u<=1;u+=.05){const a=[poly[0][0]+(poly[1][0]-poly[0][0])*u,poly[0][1]+(poly[1][1]-poly[0][1])*u],b=[poly[3][0]+(poly[2][0]-poly[3][0])*u,poly[3][1]+(poly[2][1]-poly[3][1])*u],x=a[0]+(b[0]-a[0])*v,z=a[1]+(b[1]-a[1])*v;maximum=Math.max(maximum,terrain.meshHeightAt(x,z));samples++;}
 assert.ok(maximum<datum.base301+3.3,JSON.stringify({maximum,datum:datum.base301,roof}));assert.equal(shell.userData.mappedOutlinePreserved,true);return{samples,maximum,roof,clearanceBelowRoof:roof-maximum,sourceOutlineUnchanged:true};
});
check('actual road bus and service-road car poses clear the connection structure',()=>{
 const traffic={heightAt:terrain.heightAt,lanePoint:Traffic.prototype.lanePoint},records=[];let minimumRoofClearance=Infinity,poses=0,roofRays=0;
 for(const [id,kind,width,height,length]of[['way/481787202/411','bus',2.45,3.18,10.4],['way/356701921/132','car',1.82,1.86,4.3]]){const road=campusData.roads.find(r=>r.id===id);for(let i=1;i<road.points.length;i++)for(const reverse of[false,true]){const a=new THREE.Vector2(...road.points[reverse?i:i-1]),b=new THREE.Vector2(...road.points[reverse?i-1:i]),dir=b.clone().sub(a).normalize(),edge={a:{point:a},b:{point:b},dir,length:a.distanceTo(b),width:road.width,oneway:false};for(let distance=0;distance<edge.length;distance+=.5){const vehicle={edge,distance,turn:null,kind,width,height,length,position:new THREE.Vector3(),quaternion:new THREE.Quaternion(),forward:new THREE.Vector3()};Traffic.prototype.pose.call(traffic,vehicle);const p=vehicle.position;if(p.z<dz-11||p.z>-1760||p.x>365)continue;poses++;campusSim.setFocus(p,true);campusSim.world.step();const centre=p.clone().add(new THREE.Vector3(0,height/2,0).applyQuaternion(vehicle.quaternion)),collisions=[];campusSim.world.intersectionsWithShape(centre,vehicle.quaternion,new RAPIER.Cuboid(width/2,height/2,length/2),c=>{const body=c.parent(),target=body?campusSim.targets.find(t=>t.body?.handle===body.handle):undefined;if(target?.mesh.userData.connectionId)collisions.push(target.mesh.userData.component);return true;});assert.equal(collisions.length,0,JSON.stringify({id,p:p.toArray(),distance,reverse,collisions}));for(const x of[-width/2,0,width/2])for(const z of[-length/2,0,length/2]){const q=new THREE.Vector3(x,height,z).applyQuaternion(vehicle.quaternion).add(p),hit=new THREE.Raycaster(q,up,0,10).intersectObjects(connection.shell.children,false)[0];if(hit){minimumRoofClearance=Math.min(minimumRoofClearance,hit.distance);roofRays++;}}}records.push({id,kind,reverse});}}
 assert.ok(poses>100&&roofRays>100&&minimumRoofClearance>.3,JSON.stringify({poses,roofRays,minimumRoofClearance}));resetCampus();return{poses,roofRays,minimumRoofClearance,records,scope:'Actual Traffic.pose on both straight lanes; this does not claim every future traffic turn.'};
});
check('actual campus creates one connection and preserves separate upper and lower door levels',()=>{assert.equal(campusShells.filter(s=>s.userData.connectionId).length,1);assert.equal(campusMeshes.length,9);assert.ok(Math.abs(datum.bridge-datum.road-6.1)<1e-8);assert.ok(Math.abs(datum.entry301-datum.bridge+3.2)<1e-8);assert.ok(Math.abs(datum.lower303-datum.road-.12)<1e-8);assert.equal(campusShells.find(s=>s.userData.landmark==='engineering-303').userData.bridge.implemented,true);return{parts:campusSim.targets.length,connectionParts:connection.breakables.length,renderMeshes:campusMeshes.length,datum,dimensionsAreEstimates:true};});
check('both buildings actual glazing clears the corrected rendered terrain',()=>{const records=[];for(const shell of campusShells.filter(s=>s.userData.role==='building-shell')){const p=shell.children.find(m=>m.name.endsWith('glazing')).geometry.attributes.position;let minimum=Infinity,samples=0,worst;for(let i=0;i<p.count;i+=3){const v=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,i+k));for(const w of[[1,0,0],[0,1,0],[0,0,1],[1/3,1/3,1/3],[.5,.5,0],[.5,0,.5],[0,.5,.5]]){const q=v[0].clone().multiplyScalar(w[0]).addScaledVector(v[1],w[1]).addScaledVector(v[2],w[2]),clear=q.y-terrain.meshHeightAt(q.x,q.z);if(clear<minimum){minimum=clear;worst=q.toArray();}samples++;}}assert.ok(minimum>.03,JSON.stringify({id:shell.userData.buildingId,minimum,worst}));records.push({id:shell.userData.buildingId,samples,minimum,worst});}return{records};});
check('actual lower 303 entrance blocks when closed and allows centre and edge return trips after destruction',()=>{resetCampus();const closed=walkCampus([[309.7,dz],[doorX-3.8,dz]]);assert.ok(!closed.reached&&closed.segments.at(-1).end.x>doorX);const paths=[];for(const offset of[-.85,0,.85]){resetCampus();destroyDoor('engineering303-lower-entry-door');const route=[[309.7,dz+offset],[doorX-3.8,dz+offset]],forward=walkCampus(route),backward=walkCampus(route.toReversed(),false);assert.ok(forward.reached&&backward.reached,JSON.stringify({offset,forward,backward}));assert.ok(Math.max(forward.maxPenetration,backward.maxPenetration)<.025);paths.push({offset,forward,backward});}resetCampus();return{closed,paths,speed:6};});
check('actual road stair both sides reach the upper 303 door and return to the original ground',()=>{const paths=[];for(const offset of[-.85,0,.85]){resetCampus();const route=[...externalRoute(offset),[doorX+.8,dz+offset],[doorX-3.8,dz+offset]];if(offset===0){const closed=walkCampus(route);assert.ok(!closed.reached&&closed.segments.at(-1).end.x>doorX);resetCampus();}destroyDoor('engineering303-entry-door');const forward=walkCampus(route),backward=walkCampus(route.toReversed(),false);assert.ok(forward.reached&&backward.reached,JSON.stringify({offset,forward,backward}));assert.ok(Math.max(forward.maxPenetration,backward.maxPenetration)<.025,JSON.stringify({offset,forward:forward.maxPenetration,backward:backward.maxPenetration}));paths.push({offset,forward,backward});}resetCampus();return{paths,speed:6};});
check('actual deck branch and 301 descending stair reach the door and internal atrium with return trips',()=>{const paths=[];for(const offset of[-.85,0,.85]){resetCampus();const route=[...externalRoute(offset),[335.3,-1773.5],[335.3,-1766.7],[343.5,-1766.7+offset],[354,-1766.7+offset],[356.68,-1766.7],[356.68,-1769.6],[356.87,-1784.29]];if(offset===0){const closed=walkCampus(route);assert.ok(!closed.reached&&closed.segments.at(-1).end.z>-1771);resetCampus();}destroyDoor('engineering301-entry-door');const forward=walkCampus(route),backward=walkCampus(route.toReversed(),false);assert.ok(forward.reached&&backward.reached,JSON.stringify({offset,forward,backward}));assert.ok(Math.max(forward.maxPenetration,backward.maxPenetration)<.025);paths.push({offset,forward,backward});}resetCampus();return{paths,speed:6};});
check('actual sloped ramps stair treads and both railing faces match visible convex geometry',()=>{let selected=0,occluded=0,insideStarts=0,maxSurface=0,maxLoad=0;const records=[];
const insideRenderedConvex=(mesh,origin)=>{const p=mesh.geometry.attributes.position;mesh.updateMatrixWorld(true);for(let i=0;i<p.count;i+=3){const v=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,i+k).applyMatrix4(mesh.matrixWorld)),n=v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0]));if(n.lengthSq()>1e-10&&n.normalize().dot(origin.clone().sub(v[0]))>1e-5)return false;}return true;};for(const t of campusSim.targets.filter(t=>t.mesh.userData.connectionId)){const kind=t.mesh.userData.component;if(!['landing-panel','connection-stair-tread','transparent-rail-panel','stair-handrail'].includes(kind))continue;const p=t.mesh.geometry.attributes.position;t.mesh.updateMatrixWorld(true);let largest;for(let i=0;i<p.count;i+=3){const v=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,i+k).applyMatrix4(t.mesh.matrixWorld)),n=v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])),area=n.length();if(kind==='transparent-rail-panel'?area<.1:n.y<.001)continue;if(!largest||area>largest.area)largest={area,n:n.normalize(),q:v[0].add(v[1]).add(v[2]).multiplyScalar(1/3)};}if(!largest)continue;for(const sign of kind==='transparent-rail-panel'?[-1,1]:[1]){const d=largest.n.clone().multiplyScalar(-sign),p=largest.q.clone().addScaledVector(d,-.4),render=campusVisual(p,d,.8);if(!render||Math.abs(render.distance-.4)>.035){occluded++;continue;}campusSim.setFocus(p,true);campusSim.world.step();const loaded=campusCast(p,d,.8);assert.ok(loaded);if(loaded.distance<.001&&insideRenderedConvex(loaded.object,p)){insideStarts++;continue;}maxSurface=Math.max(maxSurface,Math.abs(render.distance-loaded.distance));records.push({p,d,loaded});selected++;}}campusSim.setFocus(far,true);for(const r of records){const u=campusSim.castUnloadedTargets(r.p,r.d,.8);assert.ok(u);maxLoad=Math.max(maxLoad,Math.abs(u.distance-r.loaded.distance));assert.ok(u.object===r.loaded.object||Math.abs(u.distance-r.loaded.distance)<.002,JSON.stringify({p:r.p.toArray(),d:r.d.toArray(),loaded:r.loaded.distance,unloaded:u.distance,loadedKind:r.loaded.object.userData,unloadedKind:u.object.userData}));}assert.ok(selected>120&&maxSurface<.003&&maxLoad<.003,JSON.stringify({selected,occluded,maxSurface,maxLoad}));resetCampus();return{selected,occluded,insideStarts,maxSurface,maxLoad};});
check('actual bridge damage stays missing at distance and reset restores the three doors and surfaces',()=>{const arrays=campusMeshes.map(m=>m.geometry.attributes.position.array.slice()),targets=campusSim.targets.filter(t=>t.mesh.userData.connectionId),hit=targets.find(t=>t.mesh.userData.component==='deck-panel');campusSim.hit(hit,100,up);connection.update(far);const changed=connection.shell.children.some(m=>m.geometry.attributes.position.array.some((v,i)=>v!==arrays[campusMeshes.indexOf(m)][i]));assert.ok(changed);for(const distance of[279,281,900]){connection.update(new THREE.Vector3(330+distance,150,dz));assert.equal(hit.mesh.visible,false);}for(const kind of['engineering301-entry-door','engineering303-entry-door','engineering303-lower-entry-door'])destroyDoor(kind);resetCampus();campusMeshes.forEach((m,i)=>assert.deepEqual(m.geometry.attributes.position.array,arrays[i]));return{damagedPart:hit.mesh.userData.component,restoredArrays:arrays.length};});
}finally{campusSim.world.removeCharacterController(campusSim.controller);campusSim.world.free();}

const sourceStillMatches = Object.fromEntries(await Promise.all(Object.entries(hashes).map(async ([file, hash]) => [file, createHash('sha256').update(await readFile(path.join(root, file))).digest('hex') === hash])));
await writeFile(path.join(out, 'results.json'), JSON.stringify({ scope: 'Component fixtures and actual 301/303 terrain, rendered surfaces, Rapier access and damage. Browser review is performed separately.', hashes, sourceStillMatches, results }, null, 2));
if (results.some(r => r.status !== 'PASS') || Object.values(sourceStillMatches).some(v => !v)) process.exitCode = 1;
