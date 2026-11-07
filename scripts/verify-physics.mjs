import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import RAPIER from '@dimforge/rapier3d-compat';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactDirectory = path.join(root, 'artifacts');
await mkdir(artifactDirectory, { recursive: true });
const source = await readFile(path.join(root, 'src/physics.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  fileName: 'physics.ts',
});
const compiledPath = path.join(artifactDirectory, 'physics-test.mjs');
await writeFile(compiledPath, compiled.outputText);
const { Simulation } = await import(pathToFileURL(compiledPath).href);
await RAPIER.init();

const dt = 1 / 60;
const bounds = { minX: -60, maxX: 60, minZ: -60, maxZ: 60 };
const direction = new THREE.Vector3(0, 0, -1);
const results = [];
const fixtures = [];

function target(x, y, z, width = 8, height = 4, depth = 1, angle = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshStandardMaterial({ color: '#9baca1' }));
  mesh.position.set(x, y, z);
  mesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
  return { mesh, size: new THREE.Vector3(width, height, depth), toughness: 3, label: 'fixture', material: 'stone' };
}

function simulation(targets = [], statics = [], spawn = new THREE.Vector3(0, 1.7, 2)) {
  const sim = new Simulation(targets, statics, spawn, bounds);
  fixtures.push(sim);
  return sim;
}

function triangularTarget(angle = 0) {
  const vertices = [];
  for (const y of [-2, 2]) for (const [x, z] of [[-4,-4],[4,-4],[-4,4]]) vertices.push(new THREE.Vector3(x,y,z));
  const mesh = new THREE.Mesh(new ConvexGeometry(vertices), new THREE.MeshStandardMaterial({color:'#b7b890'}));
  mesh.position.set(0,2,-6); mesh.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),angle); mesh.updateMatrixWorld(true);
  return {mesh,size:new THREE.Vector3(8,4,8),collisionVertices:Float32Array.from(vertices.flatMap(v=>v.toArray())),toughness:3,label:'triangular prism',material:'stone'};
}

function step(sim, frames, x = 0, z = 0) {
  for (let i = 0; i < frames; i++) sim.step(dt, x, z, false);
}

function check(name, run) {
  const details = run();
  results.push({ name, status: 'passed', ...details });
  console.log(`PASS ${name}${details ? ` ${JSON.stringify(details)}` : ''}`);
}

try {
  check('gravity settles the player on the ground', () => {
    const sim = simulation([], [], new THREE.Vector3(0, 8, 0));
    step(sim, 180);
    const p = sim.player.translation();
    assert.ok(sim.grounded, 'player must be grounded after falling');
    assert.ok(p.y >= 0.84 && p.y <= 0.92, `capsule center is ${p.y}`);
    assert.ok(Math.abs(p.x) < 0.001 && Math.abs(p.z) < 0.001, 'idle input must not drift');
    return { centerY: p.y };
  });

  check('intact wall blocks movement and destruction opens the route', () => {
    const sim = simulation([target(0, 2, -3)]);
    step(sim, 30);
    step(sim, 120, 0, -5);
    const blocked = sim.player.translation().z;
    assert.ok(blocked >= -2.16 && blocked <= -2.05, `front of wall was not respected: z=${blocked}`);
    assert.equal(sim.hit(sim.targets[0], 1, direction), false, 'a partial hit should not destroy the wall');
    assert.equal(sim.targets[0].mesh.visible, true);
    assert.equal(sim.destroyed, 0);
    assert.equal(sim.hit(sim.targets[0], 2, direction), true);
    assert.equal(sim.targets[0].mesh.visible, false);
    assert.equal(sim.targets[0].body, null);
    assert.equal(sim.destroyed, 1);
    assert.equal(sim.hit(sim.targets[0], 10, direction), false, 'destroyed targets must not score twice');
    step(sim, 120, 0, -5);
    const passed = sim.player.translation().z;
    assert.ok(passed < -10, `destroyed wall still blocks the route: z=${passed}`);
    return { blockedZ: blocked, afterDestructionZ: passed };
  });

  check('jump rises, rejects an airborne extra jump, and lands', () => {
    const sim = simulation();
    step(sim, 60);
    const floor = sim.player.translation().y;
    sim.step(dt, 0, 0, true);
    let peak = sim.player.translation().y;
    for (let i = 0; i < 120; i++) {
      sim.step(dt, 0, 0, i === 15);
      peak = Math.max(peak, sim.player.translation().y);
    }
    assert.ok(peak > floor + 1 && peak < floor + 1.5, `jump height must stay within one jump: ${peak - floor}`);
    assert.ok(sim.grounded);
    assert.ok(Math.abs(sim.player.translation().y - floor) < 0.03);
    return { rise: peak - floor };
  });

  check('rotated walls collide in their rotated frame', () => {
    const angle = Math.PI / 4;
    const spec = target(0, 2, 0, 10, 4, 1, angle);
    const sim = simulation([spec], [], new THREE.Vector3(3, 1.7, 3));
    step(sim, 30);
    step(sim, 120, -5 / Math.sqrt(2), -5 / Math.sqrt(2));
    const p = sim.player.translation();
    const local = new THREE.Vector3(p.x, p.y, p.z).applyQuaternion(spec.mesh.quaternion.clone().invert());
    assert.ok(local.z >= 0.85 && local.z <= 0.95, `rotated wall normal clearance is ${local.z}`);
    assert.ok(Math.abs(local.x) < 0.05, 'normal approach must not slide along the rotated wall');
    return { localNormalDistance: local.z };
  });

  check('static obstacles also block the player', () => {
    const sim = simulation([], [{ position: new THREE.Vector3(0, 2, -3), size: new THREE.Vector3(8, 4, 1) }]);
    step(sim, 120, 0, -5);
    const z = sim.player.translation().z;
    assert.ok(z >= -2.16 && z <= -2.05, `static obstacle was crossed: ${z}`);
    return { blockedZ: z };
  });

  check('reset restores targets, collisions, player position, and counts', () => {
    const sim = simulation([target(0, 2, -3)]);
    const originalBodyCount = sim.world.bodies.len();
    sim.hit(sim.targets[0], 100, direction);
    step(sim, 60, 3, -5);
    assert.ok(sim.debris.length > 0);
    sim.reset();
    assert.equal(sim.destroyed, 0);
    assert.equal(sim.debris.length, 0);
    assert.equal(sim.targets[0].mesh.visible, true);
    assert.equal(sim.targets[0].hp, sim.targets[0].toughness);
    assert.ok(sim.targets[0].body);
    assert.equal(sim.world.bodies.len(), originalBodyCount, 'reset must not leak rigid bodies');
    assert.ok(Math.abs(sim.player.translation().x) < 0.001);
    assert.ok(Math.abs(sim.player.translation().z - 2) < 0.001);
    step(sim, 120, 0, -5);
    assert.ok(sim.player.translation().z >= -2.16, 'reset must restore collision');
    for (let i = 0; i < 8; i++) {
      sim.hit(sim.targets[0], 100, direction);
      sim.reset();
      assert.equal(sim.world.bodies.len(), originalBodyCount, `body leak after reset ${i}`);
    }
    return { bodyCount: originalBodyCount };
  });

  check('debris stays bounded and expires from physics', () => {
    const targets = Array.from({ length: 12 }, (_, i) => target((i % 4) * 4 - 6, 4, -10 - Math.floor(i / 4) * 4, 3, 3, 3));
    const sim = simulation(targets);
    sim.maxDebris = 12;
    let peak = 0;
    for (const t of sim.targets) {
      assert.equal(sim.hit(t, 100, direction), true);
      peak = Math.max(peak, sim.debris.length);
      assert.ok(sim.debris.length <= 12);
    }
    assert.equal(sim.destroyed, targets.length);
    assert.equal(sim.world.bodies.len(), 1 + sim.debris.length, 'removed debris must also leave the physics world');
    step(sim, 360);
    for (const debris of sim.debris) {
      assert.ok(debris.body.translation().y > -0.1, 'debris fell through the ground');
      assert.ok(Math.abs(debris.body.linvel().y) < 0.5, 'debris should settle after six seconds');
    }
    step(sim, 370);
    assert.equal(sim.debris.length, 0, 'debris must expire after its lifetime');
    assert.equal(sim.world.bodies.len(), 1, 'expired debris must not retain physics bodies');
    return { peakDebris: peak, finalBodies: sim.world.bodies.len() };
  });

  check('nearby traffic blocks walking and removed vehicles clear their colliders', () => {
    const sim=simulation();
    const bus={id:7,position:{x:0,y:0,z:-7},rotation:{x:0,y:0,z:0,w:1},width:2.5,height:3,length:9};
    sim.syncVehicles([bus]);step(sim,120,0,-5);
    assert.ok(sim.player.translation().z>-2.2,'player entered a stopped bus');
    const stoppedZ=sim.player.translation().z;
    sim.syncVehicles([]);step(sim,120,0,-5);
    assert.ok(sim.player.translation().z<-10,'removed vehicle left an invisible obstacle');
    sim.syncVehicles([bus]);sim.reset();assert.equal(sim.world.bodies.len(),1,'reset leaked a vehicle body');
    return {stoppedZ,remainingBodies:sim.world.bodies.len()};
  });

  check('world bounds prevent leaving the playable area', () => {
    const sim = simulation();
    step(sim, 180, 200, -200);
    const p = sim.player.translation();
    assert.equal(p.x, bounds.maxX);
    assert.equal(p.z, bounds.minZ);
    return { x: p.x, z: p.z };
  });
  check('convex collision leaves the empty bounding-box corner walkable', () => {
    const sim=simulation([triangularTarget()],[],new THREE.Vector3(3,1.7,1));
    step(sim,180,0,-2);
    const emptyCornerZ=sim.player.translation().z;
    assert.ok(emptyCornerZ < -4.8,'an invisible box wall blocks the empty corner');
    step(sim,180,-1.4,-1.4);
    const wallPosition=sim.player.translation();
    assert.ok(wallPosition.x+wallPosition.z+6>.45 && wallPosition.x<2,'the real triangular wall must still block walking');
    return {emptyCornerZ,wallPosition};
  });
  check('rotated convex target rays agree when loaded and streamed out', () => {
    const spec=triangularTarget(.43),sim=simulation([spec]);
    const records=[];
    for(const x of [-3,0,3]){
      const origin=new THREE.Vector3(x,0,10).applyQuaternion(spec.mesh.quaternion).add(spec.mesh.position);
      const direction=new THREE.Vector3(0,0,-1).applyQuaternion(spec.mesh.quaternion);
      const targetHit=sim.world.castRay(new RAPIER.Ray(origin,direction),20,true,undefined,undefined,sim.playerCollider,undefined,c=>c.parent()?.handle===sim.targets[0].body.handle);
      assert.ok(targetHit);records.push({origin,direction,distance:targetHit.timeOfImpact});
    }
    sim.setFocus(new THREE.Vector3(2000,0,2000),true);
    for(const r of records){const hit=sim.castUnloadedTargets(r.origin,r.direction,20);assert.ok(hit);assert.ok(Math.abs(hit.distance-r.distance)<.0001);}
    return {rays:records.length,unloadedShapePreserved:true};
  });
  check('convex target damage and reset restore the same shape without body leaks', () => {
    const sim=simulation([triangularTarget()]);const before=sim.world.bodies.len();
    const origin=new THREE.Vector3(3,2,4),direction=new THREE.Vector3(0,0,-1);
    const cast=()=>sim.world.castRay(new RAPIER.Ray(origin,direction),20,true,undefined,undefined,sim.playerCollider);
    const initial=cast();assert.ok(initial);
    sim.hit(sim.targets[0],1,direction);assert.ok(cast());
    sim.hit(sim.targets[0],3,direction);assert.equal(sim.targets[0].body,null);
    assert.equal(sim.castUnloadedTargets(origin,direction,20),null);
    sim.reset();assert.equal(sim.world.bodies.len(),before);assert.equal(sim.debris.length,0);
    assert.ok(Math.abs(cast().timeOfImpact-initial.timeOfImpact)<.0001);
    return {restoredBodyCount:before,shapeRestored:true};
  });
  await writeFile(path.join(artifactDirectory, 'physics-verification.json'), JSON.stringify({ verifiedAt: new Date().toISOString(), tests: results }, null, 2));
  console.log(`Verified ${results.length} physics regressions.`);
} finally {
  for (const sim of fixtures) {
    sim.world.removeCharacterController(sim.controller);
    sim.world.free();
  }
}
