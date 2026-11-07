import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
// Main runs with explicit Node test doubles for DOM, Controls, renderer, scene, terrain and facilities.
// Physics, traffic, cannon, minimap and the main control flow are the actual source modules.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), folder = path.join(root, 'artifacts/runtime-coordinates'), modules = path.join(folder, 'modules');
await mkdir(modules, { recursive: true });
const sourceHashes = [];
for (const name of ['main', 'physics', 'cannon', 'traffic', 'coordinates', 'minimap', 'observedBuildingOverrides']) {
    const source = await readFile(path.join(root, 'src', name + '.ts'), 'utf8');
    sourceHashes.push({ file: 'src/' + name + '.ts', sha256: createHash('sha256').update(source).digest('hex') });
    let code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/from (['"])(\.\/[\w-]+)\1/g, "from '$2.mjs'");
    if (name === 'main')
        code = code.replace(/import ['"]\.\/style\.css['"];?/, '').replace(/from ['"]three['"]/g, "from './three-adapter.mjs'").replace("from './physics.mjs'", "from './physics-adapter.mjs'").replace("from './cannon.mjs'", "from './cannon-adapter.mjs'").replace("from './traffic.mjs'", "from './traffic-adapter.mjs'");
    await writeFile(path.join(modules, name + '.mjs'), code);
}
await writeFile(path.join(modules, 'three-adapter.mjs'), `export * from 'three';export class WebGLRenderer{shadowMap={};pixelRatio=1;constructor(){globalThis.audit.renderer=this;}setPixelRatio(n){this.pixelRatio=n}getPixelRatio(){return this.pixelRatio}setSize(){}render(scene,camera){scene.updateMatrixWorld(true);globalThis.audit.scene=scene;globalThis.audit.camera=camera;}}`);
await writeFile(path.join(modules, 'physics-adapter.mjs'), `import{Simulation as Original}from'./physics.mjs';export class Simulation extends Original{constructor(...args){super(...args);globalThis.audit.sim=this;}}`);
await writeFile(path.join(modules, 'cannon-adapter.mjs'), `import{Cannon as Original}from'./cannon.mjs';export class Cannon extends Original{constructor(...args){super(...args);globalThis.audit.cannon=this;this.setSound(false);}}`);
await writeFile(path.join(modules, 'traffic-adapter.mjs'), `import{Traffic as Original}from'./traffic.mjs';export class Traffic extends Original{constructor(...args){super(...args);globalThis.audit.traffic=this;}}`);
await writeFile(path.join(modules, 'controls.mjs'), `export class Controls{active=false;moveX=0;moveZ=0;sprint=false;look={x:0,y:0};attack=false;pulse=false;jump=false;constructor(){globalThis.audit.controls=this;}setShuttleStops(l){this.shuttleStops=l;}setReady(){this.ready=true;}setError(e){this.error=e;}notify(){}updateLocation(n){this.location=n;}updateHud(...args){this.hud=args;this.targetLabel=args[3];}consumeLook(){const l=this.look;this.look={x:0,y:0};return l;}consumeJump(){let v=this.jump;this.jump=false;return v;}consumeAttack(){let v=this.attack;this.attack=false;return v;}consumePulse(){let v=this.pulse;this.pulse=false;return v;}pause(){this.active=false;}}`);
await writeFile(path.join(modules, 'terrain.mjs'), `import *as THREE from'three';export function createTerrain(scene){
const base=(x,z)=>10+x*.01+z*.02,h=(x,z)=>base(x,z)+(x>=-315&&x<=-285&&z>=330&&z<=350?16*(1-Math.abs(z-340)/10):0),a=1200;
const values=[-a,base(-a,-a),-a,a,base(a,-a),-a,-a,base(-a,a),a,a,base(a,a),a];
for(const z of [330,340,350])for(const x of [-315,-285])values.push(x,h(x,z),z);
const vertices=new Float32Array(values),indices=new Uint32Array([0,2,1,1,2,3,4,6,5,5,6,7,6,8,7,7,8,9]);
const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(vertices,3));geometry.setIndex(new THREE.BufferAttribute(indices,1));scene.add(new THREE.Mesh(geometry,new THREE.MeshBasicMaterial()));globalThis.audit.terrainSampler=h;return {vertices,indices,heightAt:h};}`);
await writeFile(path.join(modules, 'scene.mjs'), `import *as THREE from'three';export function createCampus(scene){
const h=(x,z)=>10+x*.01+z*.02,breakables=[];
function target(x,z,sx,sy,sz,label){const mesh=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),new THREE.MeshStandardMaterial());mesh.position.set(x,h(x,z)+sy/2,z);scene.add(mesh);breakables.push({mesh,size:new THREE.Vector3(sx,sy,sz),toughness:3,label,material:'stone'});return mesh;}
globalThis.audit.wall=target(120,200,6,12,1,'off-origin wall');
for(const [x,label]of [[-600,'unloaded remote building'],[-450,'static-hidden remote building'],[-300,'terrain-hidden remote building'],[-900,'shield-hidden remote building']])target(x,200,12,30,1,label);
target(-750,80,12,30,1,'beyond aim range building');target(100,157.7,1,20,16,'traffic-shadow building');
return {breakables,colliders:[{position:new THREE.Vector3(-450,h(-450,340)+15,340),size:new THREE.Vector3(10,30,2)},{position:new THREE.Vector3(-900,h(-900,201.2)+15,201.2),size:new THREE.Vector3(10,30,.2)}],spawn:new THREE.Vector3(120,h(120,240)+1.7,240)};}`);
await writeFile(path.join(modules, 'fullCampus.mjs'), `export function createFullCampus(){return{breakables:[],colliders:[],locations:[{id:'north',name:'north fixture',x:220,z:360},{id:'south',name:'south fixture',x:-180,z:-260}],update(p){globalThis.audit.campusCalls.push(p.clone());}};}`);
// Distinct fixture parts verify main registration without duplicating facility geometry tests.
for (const [name, factory, z, planArgument] of [['transitFacilities','createTransitFacilities',650,true],['centralPlazaFacilities','createCentralPlazaFacilities',-650,false],['administrationPlazaFacilities','createAdministrationPlazaFacilities',750,true],['informationCourtApproach','createInformationCourtApproach',-750,false],['administrationPlazaGround','createAdministrationPlazaGround',850,false],['gyujanggakApproach','createGyujanggakApproach',-850,false]]) {
    await writeFile(path.join(modules, name + '.mjs'), `import *as THREE from'three';export function ${factory}(scene,${planArgument ? 'plan,' : ''}heightAt){
const record={scene,heightAt,plan:${planArgument ? 'plan' : 'null'},initialWorldScaleZ:scene.scale.z,updates:[]};globalThis.audit.facilities['${name}']=record;
const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,2,1),new THREE.MeshStandardMaterial());mesh.position.set(650,heightAt(650,${z})+1,${z});scene.add(mesh);record.mesh=mesh;
return{shell:mesh,breakables:[{mesh,size:new THREE.Vector3(1,2,1),toughness:3,label:'${name} fixture',material:'stone'}],update(p){record.updates.push(p.clone());}};}`);
}
const audit = globalThis.audit = { campusCalls: [], facilities: {}, fetches: [], listeners: {}, now: 0 };
const ctx = () => new Proxy({ rotate(n) { audit.mapBearing = n; } }, { get(o, k) {
        if (k in o)
            return o[k];
        return () => { };
    }, set(o, k, v) { o[k] = v; return true; } });
const canvas = () => ({ width: 192, height: 192, addEventListener(name, fn) { audit.listeners[name] = fn; }, getContext() { return ctx(); } });
const game = canvas(), map = canvas();
globalThis.document = { hidden: false, querySelector(sel) { return sel === '#game' ? game : map; }, createElement() { return canvas(); }, addEventListener(name, fn) { audit.listeners[name] = fn; } };
globalThis.matchMedia = () => ({ matches: false });
globalThis.devicePixelRatio = 1;
globalThis.innerWidth = 1280;
globalThis.innerHeight = 720;
globalThis.addEventListener = (name, fn) => audit.listeners[name] = fn;
globalThis.requestAnimationFrame = fn => { audit.frame = fn; };
Object.defineProperty(globalThis, 'performance', { value: { now: () => audit.now }, configurable: true });
const data = { bounds: { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 }, buildings: [], roads: [{ id: 'r1', points: [[-100, 160], [300, 160]], width: 10, kind: 'service', drivable: true }, { id: 'r2', points: [[300, 160], [300, 600]], width: 10, kind: 'service', drivable: true }] };
const facilitiesPlan={facilities:[{id:'synthetic-facility-plan-input'}]};
globalThis.fetch = async (url) => { audit.fetches.push(url); return { ok: true, json: async () => url.endsWith('campus.json') ? data : url.endsWith('shuttle-stops.json') ? {stops:[{id:'stop-south',name:'south start fixture',x:120,z:240,bearing:Math.PI},{id:'stop-north',name:'north start fixture',x:220,z:360,bearing:0},{id:'stop-west',name:'west shuttle fixture',x:-180,z:-260,bearing:Math.PI}]} : url.endsWith('campus-transit.json') ? undefined : url.endsWith('transit-facilities.json') ? facilitiesPlan : {} }; };
await import(pathToFileURL(path.join(modules, 'main.mjs')).href);
for (let i = 0; i < 300 && !audit.frame && !audit.controls?.error; i++)
    await new Promise(resolve => setTimeout(resolve, 10));
assert.ok(audit.frame, audit.controls?.error ?? 'main boot did not complete');
function frames(count = 1) {
    for (let i = 0; i < count; i++) {
        audit.now += 1000 / 60;
        audit.frame(audit.now);
    }
}
const H = p => new THREE.Vector3(p.x, p.y, -p.z), close = (a, b, e = 1e-4) => assert.ok(a.distanceTo(b) < e, JSON.stringify({ actual: a.toArray(), expected: b.toArray() }));
const results = [];
function check(name, run) {
    try {
        const details = run() ?? {};
        results.push({ name, status: 'passed', ...details });
        console.log('PASS ' + name + ' ' + JSON.stringify(details));
    }
    catch (error) {
        results.push({ name, status: 'failed', message: error.message });
        throw error;
    }
}
try {
    frames();
    const c = audit.controls, sim = audit.sim, cannon = audit.cannon;
    check('actual main keeps the camera and weapon outside the reflected logical world', () => { const world = audit.wall.parent; assert.equal(world.scale.z, -1); assert.notEqual(audit.camera.parent, world); assert.equal(cannon.tool.parent, audit.camera); assert.equal(cannon.tool.position.x, .32); assert.ok(audit.camera.matrixWorld.determinant() > 0); close(audit.wall.getWorldPosition(new THREE.Vector3()), H(audit.wall.position)); return { cameraDeterminant: audit.camera.matrixWorld.determinant(), worldDeterminant: world.matrixWorld.determinant() }; });
    check('actual main loads facility data and registers all facility parts before reflecting the world',()=>{
        assert.equal(audit.fetches.filter(url=>url==='data/transit-facilities.json').length,1);
        for(const base of ['https://example.test/','https://example.test/3d-School_Crash/']){
            for(const url of audit.fetches)assert.ok(new URL(url,base).href.startsWith(base+'data/'),'data must stay under the deployment directory');
        }
        assert.deepEqual(Object.keys(audit.facilities).sort(),['administrationPlazaFacilities','administrationPlazaGround','centralPlazaFacilities','gyujanggakApproach','informationCourtApproach','transitFacilities']);
        assert.equal(audit.facilities.transitFacilities.plan,facilitiesPlan);
        for(const fixture of Object.values(audit.facilities)){
            assert.equal(fixture.scene,audit.wall.parent);assert.equal(fixture.initialWorldScaleZ,1);
            assert.equal(fixture.heightAt,audit.terrainSampler);
            const target=sim.targets.find(t=>t.mesh===fixture.mesh);assert.ok(target,'facility part omitted from Simulation');
            close(target.box.getCenter(new THREE.Vector3()),fixture.mesh.position);
            close(fixture.mesh.getWorldPosition(new THREE.Vector3()),H(fixture.mesh.position));
            assert.equal(fixture.updates.length,1);close(fixture.updates.at(-1),H(audit.camera.position));
        }
        return{facilityFactories:Object.keys(audit.facilities).length,registeredFixtureParts:Object.keys(audit.facilities).length,planIdentityPreserved:true,updatesInDataCoordinates:true};
    });
    c.active = true;
    c.onStart();
    frames(15);
    check('off-origin camera position, initial south bearing and real projectile stay in the correct frames', () => { assert.match(c.targetLabel, /^off-origin wall  /, 'main aim must hit the data-space wall from an off-origin render camera'); const p = sim.player.translation(); close(audit.camera.position, H(new THREE.Vector3(p.x, p.y + .82, p.z))); const forward = audit.camera.getWorldDirection(new THREE.Vector3()); assert.ok(H(forward).z < -.99); c.attack = true; frames(); assert.equal(cannon.shells.length, 1); const shell = cannon.shells[0]; assert.ok(shell.p.z > 230 && shell.velocity.z < 0); close(shell.mesh.getWorldPosition(new THREE.Vector3()), H(shell.p)); const projected = cannon.tool.getWorldPosition(new THREE.Vector3()).project(audit.camera); assert.ok(projected.x > 0); return { initialAimLabel: c.targetLabel, shellData: shell.p.toArray(), shellRender: shell.mesh.getWorldPosition(new THREE.Vector3()).toArray(), weaponNdcX: projected.x }; });
    check('paused actual main freezes projectile simulation and continues campus range queries in data coordinates', () => { c.active = false; const before = JSON.stringify(cannon.shells.map(s => ({ p: s.p, v: s.velocity, age: s.age }))),facilityUpdates=Object.values(audit.facilities).map(f=>f.updates.length); frames(30); assert.equal(JSON.stringify(cannon.shells.map(s => ({ p: s.p, v: s.velocity, age: s.age }))), before); close(audit.campusCalls.at(-1), H(audit.camera.position)); for(const [i,fixture]of Object.values(audit.facilities).entries()){assert.equal(fixture.updates.length,facilityUpdates[i]+30);close(fixture.updates.at(-1),H(audit.camera.position));} assert.equal(cannon.tool.visible, false); c.active = true; c.onStart(); frames(); for(const [i,fixture]of Object.values(audit.facilities).entries()){assert.equal(fixture.updates.length,facilityUpdates[i]+31);close(fixture.updates.at(-1),H(audit.camera.position));} return { frozenFrames: 30,facilityUpdatesWhilePaused:30,facilityUpdateAfterResume:true }; });
    check('off-origin impact, flash, particles and physical fragments agree after one world reflection', () => {
        for (let i = 0; i < 60 && sim.destroyed === 0; i++)
            frames();
        assert.equal(sim.destroyed, 1);
        assert.ok(cannon.flashes.length > 0);
        for (const flash of cannon.flashes)
            close(flash.mesh.getWorldPosition(new THREE.Vector3()), H(flash.mesh.position));
        assert.equal(cannon.shells.length, 0);
        assert.ok(sim.debris.length > 0);
        const debrisMesh = audit.scene.children.flatMap(o => o.children).find(o => o.isInstancedMesh && o.geometry.type === 'BoxGeometry');
        assert.ok(debrisMesh);
        const matrix = new THREE.Matrix4();
        debrisMesh.getMatrixAt(0, matrix);
        const rendered = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().multiplyMatrices(debrisMesh.matrixWorld, matrix));
        close(rendered, H(sim.debris[0].body.translation()), .001);
        for (const cloud of [cannon.smoke, cannon.sparks])
            if (cloud.particles.length) {
                cloud.mesh.getMatrixAt(0, matrix);
                close(new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().multiplyMatrices(cloud.mesh.matrixWorld, matrix)), H(cloud.particles[0].p), .001);
            }
        return { destroyed: sim.destroyed, fragments: sim.debris.length };
    });
    check('fast travel while paused updates data-based campus range and render camera without moving the destination', () => { c.active = false; c.onTravel('stop-west'); frames(15); const p = sim.player.translation(); assert.ok(Math.abs(p.x + 180) < .001 && Math.abs(p.z + 260) < .001); close(audit.camera.position, H(new THREE.Vector3(p.x, p.y + .82, p.z))); close(audit.campusCalls.at(-1), new THREE.Vector3(p.x, p.y + .82, p.z)); for(const fixture of Object.values(audit.facilities))close(fixture.updates.at(-1),H(audit.camera.position)); assert.equal(c.location, 'west shuttle fixture'); close(audit.traffic.lastPlayer, H(audit.camera.position)); assert.equal(cannon.shells.length, 0); return { playerData: [p.x, p.y, p.z], cameraRender: audit.camera.position.toArray(),facilityDestinationUpdated:true }; });
    check('right turn and forward plus strafe controls match geographic heading at a nonzero destination', () => {
        c.active = true;
        c.onStart();
        let currentBearing = Math.PI;
        const mapBearings = [];
        for (const bearing of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
            c.look = { x: (bearing - currentBearing) / .0024, y: 0 };
            currentBearing = bearing;
            frames(15);
            assert.ok(Math.abs(Math.sin(audit.mapBearing) - Math.sin(bearing)) < 1e-6 && Math.abs(Math.cos(audit.mapBearing) - Math.cos(bearing)) < 1e-6, 'actual minimap rotation reverses the geographic heading');
            mapBearings.push(audit.mapBearing);
        }
        const before = new THREE.Vector3().copy(sim.player.translation()), forwardD = H(audit.camera.getWorldDirection(new THREE.Vector3())).setY(0).normalize();
        assert.ok(forwardD.x < -.999);
        c.moveZ = 1;
        frames(30);
        c.moveZ = 0;
        const after = new THREE.Vector3().copy(sim.player.translation());
        assert.ok(after.clone().sub(before).dot(forwardD) > 2.5);
        c.moveX = 1;
        const beforeStrafe = after.clone();
        frames(30);
        c.moveX = 0;
        const shift = new THREE.Vector3().copy(sim.player.translation()).sub(beforeStrafe);
        assert.ok(shift.z > 2.5);
        return { mapBearings, forwardData: forwardD.toArray(), forwardTravel: after.sub(before).toArray(), rightStrafe: shift.toArray() };
    });
    check('reset restores data spawn and effects, then off-origin vehicle aiming reports the real target', () => {
        c.active = false;
        c.onReset();
        frames(15);
        const p = sim.player.translation();
        assert.ok(Math.abs(p.x + 180) < .001 && Math.abs(p.z + 260) < .001);
        assert.equal(sim.destroyed, 0);
        assert.equal(sim.debris.length, 0);
        assert.equal(cannon.shells.length, 0);
        assert.equal(cannon.smoke.particles.length, 0);
        assert.equal(cannon.sparks.particles.length, 0);
        assert.ok(audit.wall.visible);
        for(const fixture of Object.values(audit.facilities))close(fixture.updates.at(-1),H(audit.camera.position));
        close(audit.traffic.lastPlayer, H(audit.camera.position));
        close(audit.camera.position, H(new THREE.Vector3(p.x, p.y + .82, p.z)));
        assert.ok(audit.camera.matrixWorld.determinant() > 0);
        assert.ok(Math.abs(Math.sin(audit.mapBearing)) < 1e-6);
        assert.ok(Math.cos(audit.mapBearing) < -.99);
        const resetBearing = audit.mapBearing, bus = audit.traffic.vehicles.find(v => v.kind === 'bus');
        assert.ok(bus);
        for (const vehicle of audit.traffic.vehicles) {
            vehicle.waiting = 30;
            vehicle.speed = 0;
        }
        const aimOrigin = bus.position.clone().addScaledVector(bus.forward, -20).add(new THREE.Vector3(0, 1.8, 0)), aimDirection = bus.position.clone().add(new THREE.Vector3(0, 1.6, 0)).sub(aimOrigin).normalize(), aimBearing = Math.atan2(aimDirection.x, aimDirection.z), aimPitch = Math.asin(aimDirection.y);
        sim.teleport(aimOrigin);
        c.look = { x: (aimBearing - Math.PI) / .0024, y: (.06 - aimPitch) / .0024 };
        c.active = true;
        c.onStart();
        frames(15);
        const probeOrigin = H(audit.camera.position), probeDirection = H(audit.camera.getWorldDirection(new THREE.Vector3())), probePhysics = sim.world.castRay(new RAPIER.Ray(probeOrigin, probeDirection), 300, true, undefined, 0x00040001, sim.playerCollider), probeTraffic = audit.traffic.raycast(probeOrigin, probeDirection, 300);
        assert.match(c.targetLabel, /^차량  /, 'main aim failed to label an actual off-origin vehicle: ' + JSON.stringify({ origin: probeOrigin.toArray(), direction: probeDirection.toArray(), physicsDistance: probePhysics?.timeOfImpact, vehicleDistance: probeTraffic?.distance, vehicleId: probeTraffic?.vehicleId, bus: bus.position.toArray() }));
        return { playerData: [p.x, p.y, p.z], mapBearing: resetBearing, offOriginVehicleAim: c.targetLabel };
    });
    // These fixtures exercise actual main aim(), not a reimplementation of its priority rules.
    // Scene geometry and vehicle starting state are synthetic; ray and HUD calculations are real.
    const fixtureHeight = (x, z) => 10 + x * .01 + z * .02;
    function aimFrom(origin, bearing = Math.PI, pitch = 0, prepare) {
        c.active = false;
        c.onReset();
        sim.teleport(origin);
        prepare?.();
        c.look = { x: (bearing - Math.PI) / .0024, y: (.06 - pitch) / .0024 };
        c.active = true;
        c.onStart();
        frames(15);
        const eye = H(audit.camera.position), direction = H(audit.camera.getWorldDirection(new THREE.Vector3()));
        return {
            eye, direction, label: c.targetLabel,
            loaded: sim.world.castRay(new RAPIER.Ray(eye, direction), 300, true, undefined, 0x00040001, sim.playerCollider),
            remote: sim.castUnloadedTargets(eye, direction, 300),
            vehicle: audit.traffic.raycast(eye, direction, 300),
        };
    }
    check('actual main labels a visible unloaded building inside its 300 m aim range', () => {
        const probe = aimFrom(new THREE.Vector3(-600, fixtureHeight(-600, 400) + 1.8, 400));
        assert.ok(probe.remote);
        assert.equal(probe.remote.target.label, 'unloaded remote building');
        assert.ok(!(probe.remote.target.body), 'the distant fixture must not be loaded into Rapier');
        assert.ok(probe.remote.target.hp > 0 && probe.remote.target.mesh.visible);
        assert.ok(probe.remote.target.box.distanceToPoint(probe.eye) > 110 && probe.remote.distance < 300);
        assert.ok(!(probe.loaded));
        assert.match(probe.label, /^unloaded remote building  200m$/);
        close(probe.remote.object.getWorldPosition(new THREE.Vector3()), H(probe.remote.object.position));
        return { label: probe.label, distance: probe.remote.distance, loadedBody: false };
    });
    check('actual main hides a distant building label behind an unlabelled static wall', () => {
        const probe = aimFrom(new THREE.Vector3(-450, fixtureHeight(-450, 400) + 1.8, 400));
        assert.equal(probe.remote?.target.label, 'static-hidden remote building');
        assert.ok(!(probe.remote.target.body));
        assert.ok(probe.loaded && probe.loaded.timeOfImpact < probe.remote.distance);
        assert.equal(probe.loaded.collider.shapeType(), RAPIER.ShapeType.Cuboid);
        assert.ok(!(probe.loaded.collider.parent()), 'the occluder is a static fixture, not a named building');
        assert.equal(probe.label, '', 'HUD leaked the building name through a nearer static surface');
        return { label: probe.label, staticDistance: probe.loaded.timeOfImpact, remoteDistance: probe.remote.distance };
    });
    check('actual main hides a distant building label behind the terrain triangle mesh', () => {
        const probe = aimFrom(new THREE.Vector3(-300, fixtureHeight(-300, 400) + 1.8, 400));
        assert.equal(probe.remote?.target.label, 'terrain-hidden remote building');
        assert.ok(!(probe.remote.target.body));
        assert.ok(probe.loaded && probe.loaded.timeOfImpact < probe.remote.distance);
        assert.equal(probe.loaded.collider.shapeType(), RAPIER.ShapeType.TriMesh);
        assert.equal(probe.label, '', 'HUD leaked the building name through terrain');
        return { label: probe.label, terrainDistance: probe.loaded.timeOfImpact, remoteDistance: probe.remote.distance };
    });
    check('actual main does not confuse an unloaded wall with a body-less shield less than one metre ahead', () => {
        const probe = aimFrom(new THREE.Vector3(-900, fixtureHeight(-900, 400) + 1.8, 400));
        assert.equal(probe.remote?.target.label, 'shield-hidden remote building');
        assert.ok(!probe.remote.target.body && probe.loaded);
        assert.ok(!probe.loaded.collider.parent());
        assert.equal(probe.loaded.collider.shapeType(), RAPIER.ShapeType.Cuboid);
        const gap = probe.remote.distance - probe.loaded.timeOfImpact;
        assert.ok(gap > .5 && gap < 1, 'the shield must be closer while remaining inside the nearby-target search radius');
        const shieldPoint = probe.eye.clone().addScaledVector(probe.direction, probe.loaded.timeOfImpact);
        assert.ok(sim.nearby(shieldPoint, 1).includes(probe.remote.target), 'fixture must expose the missing-body handle comparison');
        assert.equal(probe.label, '', 'a static collider without a parent was misidentified as the nearby unloaded wall');
        return { label: probe.label, shieldDistance: probe.loaded.timeOfImpact, remoteDistance: probe.remote.distance, gap };
    });
    check('actual main does not label an unloaded building beyond the 300 m aim cutoff', () => {
        const probe = aimFrom(new THREE.Vector3(-750, fixtureHeight(-750, 400) + 1.8, 400));
        const beyond = sim.castUnloadedTargets(probe.eye, probe.direction, 400);
        assert.equal(beyond?.target.label, 'beyond aim range building');
        assert.ok(beyond.distance > 300 && beyond.distance < 400);
        assert.ok(!(beyond.target.body));
        assert.ok(!(probe.remote));
        assert.ok(!(probe.loaded));
        assert.equal(probe.label, '');
        return { label: probe.label, beyondDistance: beyond.distance };
    });
    function placeStoppedBus(distance) {
        const traffic = audit.traffic, bus = traffic.vehicles.find(vehicle => vehicle.kind === 'bus');
        const edge = traffic.edges.find(edge => Math.abs(edge.a.point.x + 100) < 1e-6 && Math.abs(edge.a.point.y - 160) < 1e-6 && Math.abs(edge.b.point.x - 300) < 1e-6);
        assert.ok(bus && edge, 'the existing traffic fixture needs an eastbound bus road');
        for (const vehicle of traffic.vehicles) {
            vehicle.alive = vehicle === bus;
            vehicle.waiting = 60;
            vehicle.speed = 0;
        }
        bus.edge = edge;
        bus.next = edge.reverse;
        bus.distance = distance;
        bus.turn = null;
        traffic.update(0, new THREE.Vector3(-100, 14, 157.7));
        sim.syncVehicles(traffic.collisionStates());
        return bus;
    }
    for (const front of [true, false])
        check(front ? 'actual main gives a nearer stopped bus priority over an unloaded building' : 'actual main keeps an unloaded building label when the stopped bus is behind it', () => {
            let bus;
            const origin = new THREE.Vector3(-100, fixtureHeight(-100, 157.7) + 1.8, 157.7);
            const probe = aimFrom(origin, Math.PI / 2, Math.atan(.01), () => { bus = placeStoppedBus(front ? 150 : 250); });
            assert.equal(probe.remote?.target.label, 'traffic-shadow building');
            assert.ok(!(probe.remote.target.body));
            assert.ok(probe.remote.distance > 110 && probe.remote.distance < 300);
            assert.equal(probe.vehicle?.vehicleId, bus.id);
            assert.ok(probe.loaded, 'the actual kinematic vehicle collider must also be in Rapier');
            assert.ok(Math.abs(probe.loaded.timeOfImpact - probe.vehicle.distance) < .001);
            if (front) {
                assert.ok(probe.vehicle.distance < probe.remote.distance);
                assert.match(probe.label, /^차량  /);
            }
            else {
                assert.ok(probe.vehicle.distance > probe.remote.distance);
                assert.match(probe.label, /^traffic-shadow building  200m$/);
            }
            return { label: probe.label, vehicleDistance: probe.vehicle.distance, remoteDistance: probe.remote.distance, vehicleId: bus.id };
        });
    const { Simulation } = await import(pathToFileURL(path.join(modules, 'physics.mjs')).href), { Cannon } = await import(pathToFileURL(path.join(modules, 'cannon.mjs')).href), { Traffic } = await import(pathToFileURL(path.join(modules, 'traffic.mjs')).href);
    for (const mode of ['data', 'render'])
        check(mode + ' camera mode preserves projectile and explosion frames away from the origin', () => {
            let cases = 0, maximumShotError = 0, maximumEffectError = 0;
            for (let heading = 0; heading < 8; heading++)
                for (const pitch of [-.7, 0, .8]) {
                    const outer = new THREE.Scene(), world = new THREE.Scene();
                    outer.add(world);
                    const originD = new THREE.Vector3(70, 45, heading % 2 ? 240 : -180), psi = heading * Math.PI / 4, forwardD = new THREE.Vector3(Math.sin(psi) * Math.cos(pitch), Math.sin(pitch), Math.cos(psi) * Math.cos(pitch));
                    const camera = new THREE.PerspectiveCamera(65, 1, .1, 1500);
                    outer.add(camera);
                    camera.position.copy(mode === 'render' ? H(originD) : originD);
                    camera.lookAt(mode === 'render' ? H(originD.clone().add(forwardD)) : originD.clone().add(forwardD));
                    const physics = new Simulation([], [], originD.clone(), { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 }), traffic = new Traffic(world, [], () => 0), tool = new Cannon(world, camera, physics, traffic, mode);
                    tool.setSound(false);
                    world.scale.z = mode === 'render' ? -1 : 1;
                    outer.updateMatrixWorld(true);
                    try {
                        assert.equal(tool.fire(false), true);
                        const shot = tool.shells[0];
                        maximumShotError = Math.max(maximumShotError, shot.p.distanceTo(originD), shot.velocity.clone().normalize().distanceTo(forwardD));
                        tool.update(1 / 60, true);
                        outer.updateMatrixWorld(true);
                        close(shot.mesh.getWorldPosition(new THREE.Vector3()), mode === 'render' ? H(shot.p) : shot.p);
                        const impact = originD.clone().addScaledVector(forwardD, 60);
                        tool.shake = 0;
                        tool.explode(impact, false, forwardD);
                        assert.ok(Math.abs(tool.shake - .25 / 3) < 1e-10, 'blast distance mixed render and data coordinates');
                        outer.updateMatrixWorld(true);
                        maximumEffectError = Math.max(maximumEffectError, tool.flashes[0].mesh.getWorldPosition(new THREE.Vector3()).distanceTo(mode === 'render' ? H(impact) : impact));
                        assert.equal(tool.tool.parent, camera);
                        assert.ok(camera.matrixWorld.determinant() > 0);
                        cases++;
                    }
                    finally {
                        tool.reset();
                        traffic.dispose();
                        physics.world.free();
                    }
                }
            assert.ok(maximumShotError < 1e-10 && maximumEffectError < 1e-10);
            return { cameraPoses: cases, maximumShotError, maximumEffectError };
        });
    check('actual vehicle lane, right-side door, render instances and collision states share one reflection', () => {
        const outer = new THREE.Scene(), world = new THREE.Scene();
        outer.add(world);
        const traffic = new Traffic(world, [{ id: 'east', points: [[100, 240], [500, 240]], width: 10, kind: 'service', drivable: true }, { id: 'north', points: [[500, 240], [500, 640]], width: 10, kind: 'service', drivable: true }], () => 3), focus = new THREE.Vector3(300, 5, 400);
        traffic.update(0, focus);
        world.scale.z = -1;
        outer.updateMatrixWorld(true);
        let checked = 0, doorSurfaceTriangles = 0;
        try {
            const bus = traffic.vehicles.find(v => v.kind === 'bus');
            assert.ok(bus);
            const glazing = traffic.fleets.bus.parts.find(part => part.mesh.name === 'traffic-bus-glass').mesh.geometry, p = glazing.attributes.position, index = glazing.index;
            let wrongSideDoors = 0;
            for (let i = 0; i < (index?.count ?? p.count); i += 3) {
                const vertices = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(p, index ? index.getX(i + j) : i + j));
                if (Math.min(...vertices.map(v => v.y)) >= 1.2)
                    continue;
                if (vertices.every(v => v.x > bus.width / 2 + .03))
                    doorSurfaceTriangles++;
                if (vertices.every(v => v.x < -bus.width / 2 - .03))
                    wrongSideDoors++;
            }
            assert.ok(doorSurfaceTriangles >= 4, 'actual low door glass is absent from the physical right side');
            assert.equal(wrongSideDoors, 0, 'door glazing was placed on the left side');
            for (const vehicle of traffic.vehicles) {
                const state = traffic.collisionStates().find(s => s.id === vehicle.id);
                assert.ok(state);
                close(new THREE.Vector3().copy(state.position), vehicle.position);
                const mesh = traffic.fleets[vehicle.kind].parts[0].mesh, m = new THREE.Matrix4();
                mesh.getMatrixAt(vehicle.slot, m);
                const instanceWorld = new THREE.Matrix4().multiplyMatrices(mesh.matrixWorld, m);
                close(new THREE.Vector3().setFromMatrixPosition(instanceWorld), H(vehicle.position), .0001);
                assert.ok(m.determinant() > 0 && instanceWorld.determinant() < 0);
                const rightD = new THREE.Vector3(vehicle.forward.z, 0, -vehicle.forward.x).normalize(), doorD = new THREE.Vector3(1, 0, 0).applyQuaternion(vehicle.quaternion);
                close(doorD, rightD);
                const roadRight = new THREE.Vector2(vehicle.edge.dir.y, -vehicle.edge.dir.x), centerline = vehicle.edge.a.point.clone().addScaledVector(vehicle.edge.dir, vehicle.distance), lane = new THREE.Vector2(vehicle.position.x, vehicle.position.z).sub(centerline);
                assert.ok(lane.dot(roadRight) > 0);
                const camera = new THREE.PerspectiveCamera(65, 1, .1, 100);
                camera.position.copy(H(vehicle.position.clone().add(new THREE.Vector3(0, 1, 0))));
                camera.lookAt(camera.position.clone().add(H(vehicle.forward)));
                camera.updateMatrixWorld(true);
                const rightTarget = H(vehicle.position.clone().add(new THREE.Vector3(0, 1, 0)).addScaledVector(vehicle.forward, 10).add(rightD));
                assert.ok(rightTarget.project(camera).x > 0);
                checked++;
            }
            const vehicle = traffic.vehicles[0], origin = vehicle.position.clone().add(new THREE.Vector3(0, vehicle.height / 2, 0)).addScaledVector(vehicle.forward, vehicle.length / 2 + 8), dir = vehicle.forward.clone().negate(), hit = traffic.raycast(origin, dir, 20);
            assert.ok(hit);
            assert.equal(hit.vehicleId, vehicle.id);
            assert.ok(traffic.explode(hit.point, 1) >= 1);
            assert.ok(!traffic.collisionStates().some(s => s.id === vehicle.id));
            traffic.reset();
            traffic.update(0, focus);
            assert.ok(traffic.collisionStates().some(s => s.id === vehicle.id));
            return { vehiclesChecked: checked, actualDoorSurfaceTriangles: doorSurfaceTriangles, correctLaneAndDoorSide: true, rayExplosionReset: true };
        }
        finally {
            traffic.dispose();
        }
    });
    check('main starts at the selected shuttle stop, resumes in place and resets to that stop',()=>{
        c.active=true;c.onStart('stop-north');frames(30);
        let p=sim.player.translation();
        assert.ok(Math.hypot(p.x-220,p.z-360)<.001);
        assert.ok(Math.hypot(sim.spawn.x-220,sim.spawn.z-360)<.001);
        assert.ok(H(audit.camera.getWorldDirection(new THREE.Vector3())).z>.99);
        assert.deepEqual(c.shuttleStops.map(stop=>stop.id),['stop-south','stop-north','stop-west']);
        c.onTravel('stop-south');frames(30);
        p=sim.player.translation();assert.ok(Math.hypot(p.x-120,p.z-240)<.001);
        assert.ok(H(audit.camera.getWorldDirection(new THREE.Vector3())).z<-.99,'travel did not use stop bearing');
        c.moveX=1;frames(30);c.moveX=0;
        const before=new THREE.Vector3().copy(sim.player.translation());
        assert.ok(Math.hypot(before.x-120,before.z-240)>2.5);
        c.active=false;c.onTravel('south');frames();
        p=sim.player.translation();assert.ok(Math.hypot(p.x-before.x,p.z-before.z)<.001,'building destination was accepted');
        c.active=true;c.onStart();frames();
        p=sim.player.translation();assert.ok(Math.hypot(p.x-before.x,p.z-before.z)<.001,'resume teleported');
        c.onReset();frames(30);p=sim.player.translation();
        assert.ok(Math.hypot(p.x-120,p.z-240)<.001,'reset forgot last selected stop');
        assert.ok(H(audit.camera.getWorldDirection(new THREE.Vector3())).z<-.99,'reset did not restore stop bearing');
        return{initialStop:'stop-north',travelStop:'stop-south',resetXZ:[p.x,p.z],resumePreservedPosition:true,buildingTravelRejected:true};
    });
    console.log('Runtime coordinate checks: ' + results.length + '/' + results.length + ' passed. Node fixtures only; no WebGL or phone validation.');
}
finally {
    audit.sim?.world.free();
    await writeFile(path.join(folder, 'results.json'), JSON.stringify({ scope: 'Actual main control flow and actual Cannon, Traffic, Simulation and Minimap, plus standalone data/render camera modes. Includes main HUD queries for unloaded buildings within 300 m, static wall and terrain occlusion, range cutoff and vehicle/building priority. Explicit facility doubles verify data loading, all six factory calls, Simulation registration and per-frame data-space updates during pause, resume, travel and reset; they do not verify actual facility geometry. Synthetic scene/terrain fixtures, controlled vehicle starting states and explicit Controls/DOM/renderer test doubles. No browser, WebGL or phone validation.', sourceHashes, results }, null, 2) + '\n');
}
