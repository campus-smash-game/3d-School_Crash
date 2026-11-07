import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import * as THREE from 'three';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, 'artifacts');
await mkdir(artifacts, { recursive: true });
const source = await readFile(path.join(root, 'src/traffic.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const compiledPath = path.join(artifacts, 'traffic-test.mjs');
await writeFile(compiledPath, compiled);
const { Traffic } = await import(pathToFileURL(compiledPath).href);
const data = JSON.parse(await readFile(path.join(root, 'public/data/campus.json'), 'utf8'));
const player = new THREE.Vector3(10000, 2, 10000);
const scenes = [];
const results = [];
function setup(roads) {
  const scene = new THREE.Scene();
  const traffic = new Traffic(scene, roads, () => 0);
  scenes.push({ scene, traffic });
  return { scene, traffic };
}
function check(name, run) {
  const details = run();
  results.push({ name, status: 'passed', ...details });
  console.log(`PASS ${name}${details ? ` ${JSON.stringify(details)}` : ''}`);
}

try {
  const { scene, traffic } = setup(data.roads);
  const initial = traffic.minimapPositions();
  check('campus fleet includes buses and cars with a bounded draw-call count', () => {
    assert.equal(initial.length, 24);
    assert.equal(traffic.initialVehicleCount, initial.length);
    assert.ok(initial.some(v => v.kind === 'bus'));
    assert.ok(initial.some(v => v.kind === 'car'));
    assert.deepEqual(initial.filter(v=>v.kind==='bus').map(v=>v.route),['5511','5513','5516','관악02-1','관악02-2']);
    assert.equal(initial.filter(v=>v.service==='taxi').length,12);assert.equal(initial.filter(v=>v.service==='private').length,7);
    let draws = 0;
    scene.traverse(object => { if (object.isInstancedMesh) draws++; });
    assert.ok(draws <= 16);
    return { vehicles: initial.length, buses: initial.filter(v => v.kind === 'bus').length, taxis:12, privateCars:7, instancedDrawCalls: draws };
  });
  check('route atlas stays readable after H and is shared by all five bus instances',()=>{
    const board=traffic.fleets.bus.parts.find(p=>p.routeBoard).mesh,texture=board.material.map,route=board.geometry.attributes.instanceRoute,positions=board.geometry.attributes.position,uv=board.geometry.attributes.uv;
    assert.equal(texture.image.width,256);assert.equal(texture.image.height,320);
    const bus=traffic.vehicles.find(v=>v.kind==='bus'),matrix=new THREE.Matrix4().compose(bus.position,bus.quaternion,new THREE.Vector3(1,1,1)),H=new THREE.Matrix4().makeScale(1,1,-1),views=[];
    for(const v of traffic.vehicles.filter(v=>v.kind==='bus'))assert.equal(route.getX(v.slot),['5511','5513','5516','관악02-1','관악02-2'].indexOf(v.route));
    for(let row=0;row<5;row++){let ink=0;for(let i=row*64*256*4;i<(row+1)*64*256*4;i+=4)if(texture.image.data[i]>100)ink++;assert.ok(ink>1000,'route pixels missing');}
    for(let face=0;face<4;face++)for(const[width,height]of[[390,844],[844,390]]){
      const local=[];for(let i=face*4;i<face*4+4;i++)local.push({p:new THREE.Vector3().fromBufferAttribute(positions,i),u:uv.getX(i),v:uv.getY(i)});
      const center=local.reduce((p,v)=>p.add(v.p),new THREE.Vector3()).multiplyScalar(.25),normal=new THREE.Vector3(face===2?1:face===3?-1:0,0,face===0?1:face===1?-1:0),eye=center.clone().addScaledVector(normal,12).applyMatrix4(matrix).applyMatrix4(H),target=center.clone().applyMatrix4(matrix).applyMatrix4(H),camera=new THREE.PerspectiveCamera(50,width/height,.1,200);camera.position.copy(eye);camera.lookAt(target);camera.updateMatrixWorld(true);
      const projected=local.map(v=>({...v,p:v.p.clone().applyMatrix4(matrix).applyMatrix4(H).project(camera)})),left=projected.filter(v=>v.u===0).reduce((n,v)=>n+v.p.x,0)/2,right=projected.filter(v=>v.u===1).reduce((n,v)=>n+v.p.x,0)/2,top=Math.max(...projected.map(v=>v.p.y)),bottom=Math.min(...projected.map(v=>v.p.y));assert.ok(right>left,'mirrored route text');assert.ok((top-bottom)*height/2>12,'route board too small at 12m');views.push({face,viewport:[width,height],widthPixels:(right-left)*width/2,heightPixels:(top-bottom)*height/2});
    }
    return{routeLabels:board.userData.routeLabels,atlas:[256,320],views,scope:'Actual geometry and camera projection, plus shared CPU texture data; no GPU rasterization or phone validation.'};
  });
  check('only taxis show roof signs and destruction reset restores the correct instances',()=>{
    const taxi=traffic.vehicles.find(v=>v.service==='taxi'),sign=traffic.fleets.car.parts.find(p=>p.taxiOnly).mesh,matrix=new THREE.Matrix4();traffic.update(0,taxi.position);
    for(const v of traffic.vehicles.filter(v=>v.kind==='car')){sign.getMatrixAt(v.slot,matrix);const shown=new THREE.Vector3().setFromMatrixScale(matrix).length()>.1;assert.equal(shown,v.service==='taxi'&&v.position.distanceTo(taxi.position)<500);}
    assert.ok(taxi.height>=1.815);assert.equal(traffic.explode(taxi.position.clone().add(new THREE.Vector3(0,1.7,0)),.03),1);sign.getMatrixAt(taxi.slot,matrix);assert.equal(new THREE.Vector3().setFromMatrixScale(matrix).length(),0);traffic.reset();traffic.update(0,taxi.position);sign.getMatrixAt(taxi.slot,matrix);assert.ok(new THREE.Vector3().setFromMatrixScale(matrix).length()>1);assert.deepEqual(traffic.minimapPositions(),initial);return{taxiRoofTop:1.815,taxiCollisionHeight:taxi.height,restored:true};
  });
  check('real campus road simulation remains continuous and follows legal directed edges', () => {
    let maxStep = 0, movementSamples = 0;
    for (let tick = 0; tick < 1200; tick++) {
      const before = traffic.minimapPositions();
      traffic.update(0.1, player);
      const after = traffic.minimapPositions();
      after.forEach((v, i) => {
        assert.ok(Number.isFinite(v.x + v.z));
        const step = Math.hypot(v.x - before[i].x, v.z - before[i].z);
        maxStep = Math.max(maxStep, step);
        assert.ok(step < 1.5, `position jumped by ${step} metres in 0.1 seconds`);
        if (step > 0.001) movementSamples++;
      });
      assert.ok(traffic.vehicles.every(v => v.edge.allowed), 'vehicle entered a forbidden reverse edge');
    }
    assert.ok(movementSamples > 1000, 'fleet did not keep moving');
    return { secondsSimulated: 120, maxFrameTravel: maxStep, movementSamples };
  });
  check('vehicle raycast, explosion, and reset agree', () => {
    const vehicle = traffic.vehicles[0];
    const inside = vehicle.position.clone().add(new THREE.Vector3(0, 1, 0));
    const hit = traffic.raycast(inside, new THREE.Vector3(0, 0, 1), 100);
    assert.equal(hit.vehicleId, vehicle.id);
    assert.equal(hit.distance, 0);
    const outside = inside.clone().addScaledVector(vehicle.forward, 20);
    const approach = traffic.raycast(outside, vehicle.forward.clone().negate(), 30);
    assert.ok(approach, 'a swept segment should hit the approaching vehicle');
    assert.ok(approach.distance > 0 && approach.distance < 20);
    assert.equal(traffic.explode(inside, 0.25), 1);
    assert.equal(traffic.minimapPositions().length, initial.length - 1);
    assert.equal(traffic.initialVehicleCount, initial.length, 'the destruction goal must retain the initial fleet count');
    assert.equal(traffic.explode(inside, 0.25), 0, 'destroyed vehicles must not count twice');
    traffic.reset();
    assert.deepEqual(traffic.minimapPositions(), initial);
  });
  check('one-way dead ends stop without reversing or teleporting', () => {
    const { traffic: oneWay } = setup([{ id: 'one-way', points: [[0, 0], [0, 500]], width: 5.5, oneway: true, kind: 'service' }]);
    let previous = oneWay.minimapPositions();
    for (let tick = 0; tick < 1800; tick++) {
      oneWay.update(0.1, player);
      const next = oneWay.minimapPositions();
      next.forEach((v, i) => assert.ok(v.z >= previous[i].z - 0.00001));
      previous = next;
    }
    assert.ok(oneWay.vehicles.every(v => v.edge.allowed));
  });
  check('pedestrian paths and non-drivable plazas receive no traffic', () => {
    const { traffic: excluded } = setup([
      { id: 'walk', points: [[0, 0], [0, 500]], width: 8, kind: 'footway' },
      { id: 'plaza', points: [[0, 0], [500, 0]], width: 12, drivable: false },
    ]);
    assert.equal(excluded.minimapPositions().length, 0);
    assert.equal(excluded.initialVehicleCount, 0);
  });
  check('disposing traffic removes its scene objects and live positions', () => {
    traffic.dispose();
    assert.equal(scene.children.length, 0);
    assert.equal(traffic.minimapPositions().length, 0);
  });
  await writeFile(path.join(artifacts, 'traffic-verification.json'), JSON.stringify({ verifiedAt: new Date().toISOString(), tests: results }, null, 2));
  console.log(`Verified ${results.length} traffic regressions.`);
} finally {
  for (const { traffic } of scenes) traffic.dispose();
}
