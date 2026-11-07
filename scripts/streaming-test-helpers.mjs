import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

export function captureLoadedState(sim) {
  return { bodies: sim.world.bodies.len(), targets: sim.targets.flatMap((target, index) => target.body ? [index] : []) };
}

export function castLoaded(sim, origin, direction, distance, buildingOnly = true) {
  // These fixture rays fit within one loaded neighborhood. Centre it on the segment.
  assert.ok(distance < 150, 'longer geometry probes need explicit segment coverage');
  sim.setFocus(origin.clone().addScaledVector(direction, distance / 2), true);
  sim.world.step();
  return sim.world.castRay(new RAPIER.Ray(origin, direction), distance, true,
    undefined, undefined, sim.playerCollider, undefined,
    buildingOnly ? collider => sim.targets.some(target => target.body && target.body.handle === collider.parent()?.handle) : undefined);
}

export function assertRestoredTargets(sim, initial) {
  assert.equal(sim.destroyed, 0);
  assert.equal(sim.debris.length, 0);
  assert.equal(sim.world.bodies.len(), initial.bodies, 'reset changed the spawn body count');
  assert.deepEqual(sim.targets.flatMap((target, index) => target.body ? [index] : []), initial.targets, 'reset changed the spawn loaded set');
  for (const target of sim.targets) {
    assert.ok(target.mesh.visible && target.hp === target.toughness);
    sim.setFocus(target.box.getCenter(new THREE.Vector3()), true);
    sim.world.step();
    assert.ok(target.body, 'restored target did not load at its own bounds');
    assert.equal(target.body.numColliders(), 1);
    const position = target.mesh.getWorldPosition(new THREE.Vector3());
    assert.ok(position.distanceTo(new THREE.Vector3().copy(target.body.translation())) < .001);
    const rotation = target.mesh.getWorldQuaternion(new THREE.Quaternion());
    assert.ok(Math.abs(rotation.dot(new THREE.Quaternion().copy(target.body.rotation()))) > .99999);
    assert.equal(target.body.collider(0).shapeType(), RAPIER.ShapeType.Cuboid);
    const half = target.body.collider(0).halfExtents();
    assert.ok(new THREE.Vector3(half.x, half.y, half.z).distanceTo(target.size.clone().multiplyScalar(.5)) < .001);
  }
  sim.setFocus(new THREE.Vector3(1000000, 1000000, 1000000), true);
  assert.ok(sim.targets.every(target => !target.body), 'restored colliders leaked after streaming out');
  sim.setFocus(sim.spawn, true); sim.world.step();
  assert.equal(sim.world.bodies.len(), initial.bodies);
  assert.deepEqual(sim.targets.flatMap((target, index) => target.body ? [index] : []), initial.targets);
}
