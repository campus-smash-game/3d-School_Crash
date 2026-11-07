import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactDirectory = path.join(root, 'artifacts');
await mkdir(artifactDirectory, { recursive: true });
const modules = {};
for (const name of ['coordinates', 'physics', 'cannon']) {
  const source = await readFile(path.join(root, `src/${name}.ts`), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    fileName: `${name}.ts`,
  });
  const destination = path.join(artifactDirectory, `${name}-cannon-test.mjs`);
  await writeFile(destination, compiled.outputText.replace(/from ['"]\.\/coordinates['"]/g, "from './coordinates-cannon-test.mjs'"));
  modules[name] = await import(pathToFileURL(destination).href);
}
const { Simulation } = modules.physics;
const { Cannon } = modules.cannon;
await RAPIER.init();

const dt = 1 / 60;
const bounds = { minX: -800, maxX: 800, minZ: -800, maxZ: 800 };
const fixtures = [];
const results = [];

function target(x, y, z, width = 5, height = 5, depth = 1, toughness = 3) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshStandardMaterial({ color: '#a3b5ad' }));
  mesh.position.set(x, y, z);
  return { mesh, size: new THREE.Vector3(width, height, depth), toughness, label: 'test wall', material: 'stone' };
}

function fixture(specs = [], statics = [], cameraY = 3, vehiclePlane = null) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(65, 1, .1, 1200);
  camera.position.set(0, cameraY, 0);
  scene.add(camera);
  for (const spec of specs) scene.add(spec.mesh);
  const sim = new Simulation(specs, statics, new THREE.Vector3(0, 1.7, 0), bounds);
  const traffic = {
    explosions: [],
    raycast(origin, direction, maxDistance) {
      if (vehiclePlane === null || direction.z === 0) return null;
      const distance = (vehiclePlane - origin.z) / direction.z;
      if (distance < 0 || distance > maxDistance) return null;
      return { point: origin.clone().addScaledVector(direction, distance), distance, vehicleId: 1 };
    },
    explode(point, radius) {
      this.explosions.push({ point: point.clone(), radius });
      return vehiclePlane !== null && Math.abs(point.z - vehiclePlane) < radius ? 1 : 0;
    },
  };
  const cannon = new Cannon(scene, camera, sim, traffic);
  cannon.setSound(false);
  const fixture = { scene, camera, sim, cannon, traffic };
  fixtures.push(fixture);
  return fixture;
}

function step(fixture, frames) {
  for (let i = 0; i < frames; i++) {
    fixture.sim.step(dt, 0, 0, false);
    fixture.cannon.update(dt, true);
  }
}

function check(name, run) {
  try {
    const details = run() ?? {};
    results.push({ name, status: 'passed', ...details });
    console.log(`PASS ${name} ${JSON.stringify(details)}`);
  } catch (error) {
    results.push({ name, status: 'failed', message: error.message });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

try {
  check('a fired shell travels before damaging a distant wall', () => {
    const f = fixture([target(0, 2.5, -65)]);
    assert.equal(f.cannon.fire(false), true);
    assert.equal(f.sim.destroyed, 0, 'fire must not apply hitscan damage');
    assert.equal(f.cannon.shells.length, 1);
    const initialZ = f.cannon.shells[0].p.z;
    step(f, 12);
    assert.equal(f.sim.destroyed, 0, 'the shell must not damage the wall before reaching it');
    assert.equal(f.cannon.shells.length, 1);
    assert.ok(f.cannon.shells[0].p.z < initialZ - 20);
    step(f, 24);
    assert.equal(f.sim.destroyed, 1);
    assert.equal(f.cannon.shells.length, 0);
    assert.equal(f.traffic.explosions.length, 1);
    assert.ok(Math.abs(f.traffic.explosions[0].point.z + 64.5) < .01);
    return { flightSecondsBeforeCheck: 12 * dt, impactZ: f.traffic.explosions[0].point.z };
  });

  check('static cover intercepts the shell before a distant wall behind it', () => {
    const cover = { position: new THREE.Vector3(0, 3, -12), size: new THREE.Vector3(12, 6, 1) };
    const f = fixture([target(0, 3, -40, 6, 6)], [cover]);
    f.cannon.fire(false);
    step(f, 40);
    assert.equal(f.traffic.explosions.length, 1);
    assert.ok(Math.abs(f.traffic.explosions[0].point.z + 11.5) < .01, 'first collision must be the cover');
    assert.equal(f.sim.targets[0].hp, 3);
    assert.equal(f.sim.destroyed, 0);
    return { coverImpactZ: f.traffic.explosions[0].point.z, wallHp: f.sim.targets[0].hp };
  });

  check('near cover between the camera and muzzle cannot be skipped', () => {
    const cover = { position: new THREE.Vector3(0, 3, -.7), size: new THREE.Vector3(12, 6, .2) };
    const f = fixture([target(0, 3, -30, 6, 6)], [cover]);
    f.cannon.fire(false);
    step(f, 30);
    assert.equal(f.sim.destroyed, 0, 'muzzle placement must not put the shell beyond nearby cover');
    assert.equal(f.traffic.explosions.length, 1);
    assert.ok(Math.abs(f.traffic.explosions[0].point.z + .6) < .02);
    return { coverImpactZ: f.traffic.explosions[0].point.z };
  });

  check('shell trajectory drops under gravity while moving forward', () => {
    const f = fixture([], [], 50);
    f.cannon.fire(false);
    const initial = f.cannon.shells[0].p.clone();
    step(f, 30);
    assert.equal(f.cannon.shells.length, 1);
    const shell = f.cannon.shells[0];
    const fall = initial.y - shell.p.y;
    assert.ok(fall > .3 && fall < .5, `unexpected half-second ballistic drop ${fall}`);
    assert.ok(shell.velocity.y < -1.4);
    assert.ok(initial.z - shell.p.z > 60);
    return { halfSecondFall: fall, forwardDistance: initial.z - shell.p.z };
  });

  check('a visible target beyond the player collision neighborhood can be hit', () => {
    const f = fixture([target(0, 30, -450, 12, 60, 2)], [], 50);
    f.cannon.fire(false);
    step(f, 240);
    assert.equal(f.sim.destroyed, 1, 'a shell must not pass through a target within its five-second flight range');
    assert.equal(f.cannon.shells.length, 0);
    assert.ok(Math.abs(f.traffic.explosions[0].point.z + 449) < .02);
    return { impactZ: f.traffic.explosions[0].point.z };
  });

  check('heavy ammunition requires recharge while ordinary fire stays available', () => {
    const f = fixture([], [], 50);
    assert.equal(f.cannon.fire(true), true);
    assert.equal(f.cannon.fire(true), false);
    assert.equal(f.cannon.fire(false), false, 'global firing interval must apply');
    assert.equal(f.cannon.charge, 0);
    step(f, 60);
    assert.ok(f.cannon.charge > .24 && f.cannon.charge < .26);
    assert.equal(f.cannon.fire(true), false, 'one second must not fully recharge a heavy shell');
    assert.equal(f.cannon.fire(false), true, 'heavy recharge must not block an ordinary shell');
    step(f, 190);
    assert.equal(f.cannon.charge, 1);
    assert.equal(f.cannon.fire(true), true);
    return { rechargeSeconds: 4, ordinaryFireDuringRecharge: true };
  });

  check('a nearer vehicle collision takes precedence over a wall', () => {
    const f = fixture([target(0, 3, -40, 6, 6)], [], 3, -14);
    let vehicles = 0;
    f.cannon.onExplosion = (_count, count) => { vehicles += count; };
    f.cannon.fire(false);
    step(f, 30);
    assert.equal(vehicles, 1);
    assert.equal(f.sim.destroyed, 0);
    assert.equal(f.traffic.explosions[0].point.z, -14);
    return { vehiclesHit: vehicles, impactZ: -14 };
  });

  check('an explosion destroys nearby targets and bounds debris and particles', () => {
    const specs = [target(0, 3, -28, 2, 6, 1)];
    for (let i = 0; i < 10; i++) specs.push(target((i % 5) * 3 - 6, 3, -32 - Math.floor(i / 5) * 3, 2, 5, 2));
    specs.push(target(60, 3, -32));
    const f = fixture(specs);
    f.sim.maxDebris = 24;
    f.cannon.fire(true);
    step(f, 30);
    assert.equal(f.sim.destroyed, 11);
    assert.equal(f.sim.targets.at(-1).hp, 3, 'targets outside the blast radius must survive');
    assert.ok(f.sim.debris.length > 0 && f.sim.debris.length <= 24);
    assert.ok(f.cannon.smoke.particles.length <= 180);
    assert.ok(f.cannon.sparks.particles.length <= 220);
    for (let i = 0; i < 20; i++) {
      f.cannon.explode(new THREE.Vector3(0, 3, -28), true, new THREE.Vector3(0, 0, -1));
      assert.ok(f.cannon.smoke.particles.length <= 180);
      assert.ok(f.cannon.sparks.particles.length <= 220);
      assert.ok(f.sim.debris.length <= 24);
    }
    return { destroyed: f.sim.destroyed, debris: f.sim.debris.length, smoke: f.cannon.smoke.particles.length, sparks: f.cannon.sparks.particles.length };
  });

  check('pause freezes shells, particles, cooldown, recoil, and impact callbacks', () => {
    const f = fixture([], [], 50);
    f.cannon.fire(true);
    step(f, 10);
    const shell = f.cannon.shells[0];
    const before = JSON.stringify({ p: shell.p, velocity: shell.velocity, age: shell.age, charge: f.cannon.charge, recoil: f.cannon.recoil, shake: f.cannon.shake, sparks: f.cannon.sparks.particles });
    for (let i = 0; i < 120; i++) f.cannon.update(dt, false);
    const after = JSON.stringify({ p: shell.p, velocity: shell.velocity, age: shell.age, charge: f.cannon.charge, recoil: f.cannon.recoil, shake: f.cannon.shake, sparks: f.cannon.sparks.particles });
    assert.equal(after, before);
    assert.equal(f.traffic.explosions.length, 0);
    assert.equal(f.cannon.tool.visible, false);
    f.cannon.update(dt, true);
    assert.ok(shell.age > JSON.parse(before).age);
    return { frozenForSeconds: 120 * dt };
  });

  check('reset removes active shells and all effects without scene leaks', () => {
    const f = fixture([target(0, 3, -28, 6, 6)]);
    const baseChildren = f.scene.children.length;
    f.cannon.fire(true);
    step(f, 18);
    assert.ok(f.cannon.flashes.length > 0);
    step(f, 32);
    assert.equal(f.cannon.fire(false), true);
    assert.ok(f.cannon.shells.length > 0);
    assert.ok(f.cannon.smoke.particles.length > 0);
    f.cannon.reset();
    assert.equal(f.cannon.shells.length, 0);
    assert.equal(f.cannon.flashes.length, 0);
    assert.equal(f.cannon.smoke.particles.length, 0);
    assert.equal(f.cannon.sparks.particles.length, 0);
    assert.equal(f.cannon.smoke.mesh.count, 0);
    assert.equal(f.cannon.sparks.mesh.count, 0);
    assert.equal(f.cannon.flash.intensity, 0);
    assert.equal(f.cannon.charge, 1);
    assert.equal(f.scene.children.length, baseChildren);
    for (let i = 0; i < 8; i++) {
      assert.equal(f.cannon.fire(false), true);
      f.cannon.reset();
      assert.equal(f.scene.children.length, baseChildren);
    }
    return { sceneChildren: baseChildren, repeatedResets: 8 };
  });

  await writeFile(path.join(artifactDirectory, 'cannon-verification.json'), JSON.stringify({ verifiedAt: new Date().toISOString(), tests: results }, null, 2));
  const failures = results.filter((result) => result.status === 'failed');
  console.log(`Cannon checks: ${results.length - failures.length} passed, ${failures.length} failed.`);
  if (failures.length) process.exitCode = 1;
} finally {
  for (const fixture of fixtures) {
    fixture.cannon.reset();
    fixture.sim.world.removeCharacterController(fixture.sim.controller);
    fixture.sim.world.free();
  }
}
