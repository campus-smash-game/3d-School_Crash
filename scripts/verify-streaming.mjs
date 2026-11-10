import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),folder=path.join(root,'artifacts/streaming-test');
await fs.mkdir(folder,{recursive:true});
const hashes=[];
for(const name of ['coordinates','physics','cannon']){
  const source=await fs.readFile(path.join(root,'src',name+'.ts'),'utf8');
  hashes.push({file:'src/'+name+'.ts',sha256:createHash('sha256').update(source).digest('hex')});
  await fs.writeFile(path.join(folder,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/from (['"])(\.\/[\w-]+)\1/g,"from '$2.mjs'"));
}
const {Simulation}=await import(pathToFileURL(path.join(folder,'physics.mjs'))),{Cannon}=await import(pathToFileURL(path.join(folder,'cannon.mjs')));
await RAPIER.init();
const dt=1/60,bounds={minX:-2000,maxX:2000,minZ:-2000,maxZ:2000},fixtures=[],results=[];
function spec(x,y,z,w=1,h=4,d=8,toughness=3){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial());mesh.position.set(x,y,z);return{mesh,size:new THREE.Vector3(w,h,d),toughness,label:'stream fixture',material:'stone'};}
function simulation(specs=[],spawn=new THREE.Vector3(0,1.7,0),statics=[],terrain){const sim=new Simulation(specs,statics,spawn,bounds,terrain);fixtures.push(sim);return sim;}
function advance(sim,n,x=0,z=0){for(let i=0;i<n;i++)sim.step(dt,x,z,false);}
function check(name,run){try{const details=run()??{};results.push({name,status:'passed',...details});console.log('PASS '+name+' '+JSON.stringify(details));}catch(error){results.push({name,status:'failed',message:error.message});throw error;}}
function plane(){const h=(x,z)=>8+x*.02+z*.01,a=1000,vertices=new Float32Array([-a,h(-a,-a),-a,a,h(a,-a),-a,-a,h(-a,a),a,a,h(a,a),a]);return{vertices,indices:new Uint32Array([0,2,1,1,2,3]),heightAt:h};}

try{
  check('long proxies crossing cells remain hittable and take explosion damage once',()=>{
    const sim=simulation([spec(99.9,2,0,170.58,4,1)],new THREE.Vector3(-1000,1.7,0)),target=sim.targets[0],origin=new THREE.Vector3(186,2,0),direction=new THREE.Vector3(-1,0,0);
    assert.equal(target.body,null);
    const hit=sim.castUnloadedTargets(origin,direction,2);assert.ok(hit);assert.equal(hit.object,target.mesh);assert.equal(hit.target,target);assert.ok(Math.abs(hit.distance-.81)<.00001);
    assert.equal(sim.nearby(new THREE.Vector3(99.9,2,0),200).filter(t=>t===target).length,1);
    const point=new THREE.Vector3(185,2,0);assert.equal(sim.explode(point,1,1,direction),0);assert.equal(target.hp,2);
    assert.equal(sim.explode(point,1,5,direction),1);assert.equal(sim.destroyed,1);assert.equal(sim.castUnloadedTargets(origin,direction,2),null);
    sim.reset();assert.equal(sim.castUnloadedTargets(origin,direction,2)?.target,target);assert.equal(target.hp,3);
    return{rayDistance:hit.distance,oneTargetAcrossMultipleCells:true};
  });
  check('loading and unloading use surface distance for a long body and vertical focus movement',()=>{
    const sim=simulation([spec(180,2,0,240,4,8)]),target=sim.targets[0];assert.ok(target.body,'near surface is 60 m away');
    sim.setFocus(new THREE.Vector3(-10,1.7,0),true);assert.ok(target.body,'center distance must not unload a close surface');
    sim.setFocus(new THREE.Vector3(-60,1.7,0),true);assert.equal(target.body,null);
    sim.setFocus(new THREE.Vector3(-5,1.7,0),true);assert.ok(target.body);
    const vertical=simulation([spec(0,2,0,6,4,6)],new THREE.Vector3(0,160,0));assert.equal(vertical.targets[0].body,null);vertical.setFocus(new THREE.Vector3(0,70,0));assert.ok(vertical.targets[0].body);
    return{nearSurfaceLoadedAtCenterDistance:180,verticalFocusReload:true};
  });
  check('sprinting across a streaming boundary loads the wall before contact',()=>{
    const sim=simulation([spec(92,2,0)]),target=sim.targets[0];assert.equal(target.body,null);advance(sim,30);let firstLoadX=null;
    for(let i=0;i<600;i++){sim.step(dt,13,0,false);if(target.body&&firstLoadX===null)firstLoadX=sim.player.translation().x;}
    const p=sim.player.translation();assert.ok(firstLoadX>20&&firstLoadX<30,JSON.stringify({firstLoadX}));assert.ok(p.x>90&&p.x<91.2);assert.ok(sim.grounded);
    advance(sim,1000,-13,0);assert.equal(target.body,null);sim.teleport(new THREE.Vector3(90,1.7,0));assert.ok(target.body);advance(sim,60,13,0);assert.ok(sim.player.translation().x<91.2);
    return{firstLoadX,blockedAtX:p.x,unloadAndReturn:true};
  });
  check('teleport preserves terrain altitude and close collision bodies away from the origin',()=>{
    const terrain=plane(),x=450,z=200,ground=terrain.heightAt(x,z),sim=simulation([spec(455,terrain.heightAt(455,z)+2,z)],new THREE.Vector3(0,terrain.heightAt(0,0)+1.7,0),[],terrain),target=sim.targets[0];
    assert.equal(target.body,null);sim.teleport(new THREE.Vector3(x,ground+1.7,z));assert.ok(target.body);advance(sim,90);const settled=sim.player.translation();assert.ok(Math.abs(settled.y-ground-.87)<.08);advance(sim,120,6,0);const blocked=sim.player.translation();assert.ok(blocked.x>452&&blocked.x<454.2);assert.ok(sim.grounded);
    sim.teleport(new THREE.Vector3(-400,terrain.heightAt(-400,-200)+1.7,-200));assert.equal(target.body,null);sim.reset();assert.equal(sim.world.bodies.len(),1);
    return{ground,settledY:settled.y,blockedX:blocked.x,resetBodies:sim.world.bodies.len()};
  });
  check('actual cannon hits an unloaded 300 m target after travel and respects nearer static cover',()=>{
    const cases=[];
    for(const blocked of[false,true]){
      const outer=new THREE.Scene(),world=new THREE.Scene();outer.add(world);const wall=spec(80,15,300,20,30,1);world.add(wall.mesh);
      const statics=blocked?[{position:new THREE.Vector3(80,15,150),size:new THREE.Vector3(20,30,1)}]:[];
      const sim=simulation([wall],new THREE.Vector3(80,1.7,0),statics),target=sim.targets[0],camera=new THREE.PerspectiveCamera(65,1,.1,1500);camera.position.set(80,15,0);camera.lookAt(80,15,-1);outer.add(camera);
      const traffic={raycast:()=>null,explode:()=>0},cannon=new Cannon(world,camera,sim,traffic,'render');cannon.setSound(false);world.scale.z=-1;outer.updateMatrixWorld(true);assert.equal(target.body,null);assert.ok(cannon.fire());cannon.update(dt,true);assert.equal(target.hp,3);let frames=1;
      while(cannon.shells.length&&frames<300){cannon.update(dt,true);frames++;}
      assert.equal(cannon.shells.length,0);assert.ok(frames>60);assert.equal(sim.destroyed,blocked?0:1);assert.equal(target.hp>0,blocked);cannon.reset();sim.reset();assert.equal(sim.destroyed,0);assert.equal(sim.debris.length,0);assert.equal(target.body,null);assert.ok(sim.castUnloadedTargets(new THREE.Vector3(80,15,0),new THREE.Vector3(0,0,1),310));
      cases.push({blocked,flightFrames:frames});
    }return{cases};
  });
  check('remote debris gets swept collision coverage on its first physics step and releases it',()=>{
    const sim=simulation([spec(250,3,0,1,1,1),spec(251.1,3,0,.4,8,8),spec(270,3,0,.4,8,8)]),[source,wall,distant]=sim.targets;assert.ok(sim.targets.every(t=>!t.body));
    sim.hit(source,10,new THREE.Vector3(1,0,0));assert.equal(sim.debris.length,1);const shard=sim.debris[0];shard.body.setLinvel({x:120,y:0,z:0},true);shard.body.setAngvel({x:0,y:0,z:0},true);
    assert.equal(wall.body,null);sim.step(dt,0,0,false);assert.ok(wall.body,'collision target must exist for the first CCD step');assert.equal(distant.body,null,'remote coverage must stay local to the moving fragment');let maximumX=shard.body.translation().x;
    for(let i=0;i<30;i++){sim.step(dt,0,0,false);maximumX=Math.max(maximumX,shard.body.translation().x);}assert.ok(maximumX<250.7,JSON.stringify({maximumX}));
    shard.age=12.1;advance(sim,2);assert.equal(sim.debris.length,0);assert.equal(wall.body,null);assert.equal(sim.world.bodies.len(),1);return{maximumX,remainingBodies:sim.world.bodies.len(),distantTargetStayedUnloaded:true};
  });
  check('remote fragment coverage also precedes teleport stepping and reset leaves no bodies',()=>{
    const sim=simulation([spec(250,3,0,1,1,1),spec(251.1,3,0,.4,8,8)]);let maximumBodies=0;
    for(let cycle=0;cycle<8;cycle++){
      sim.hit(sim.targets[0],10,new THREE.Vector3(1,0,0));const shard=sim.debris[0];shard.body.setLinvel({x:120,y:0,z:0},true);shard.body.setAngvel({x:0,y:0,z:0},true);
      sim.teleport(new THREE.Vector3(-100,1.7,0));assert.ok(sim.targets[1].body);assert.ok(shard.body.translation().x<250.7);maximumBodies=Math.max(maximumBodies,sim.world.bodies.len());sim.reset();assert.equal(sim.world.bodies.len(),1);assert.equal(sim.world.colliders.len(),2);assert.equal(sim.debris.length,0);assert.equal(sim.destroyed,0);assert.ok(sim.targets.every(t=>t.hp===t.toughness&&!t.body&&t.mesh.visible));
    }return{resetCycles:8,maximumBodies,finalBodies:sim.world.bodies.len()};
  });
  check('dense remote fragments query only their swept neighborhood across cell boundaries',()=>{
    const unrelated=Array.from({length:1200},(_,i)=>spec(270+i%20,2,20+Math.floor(i/20),.3,3,.3));
    const sim=simulation([spec(255,3,0,1,1,1),spec(256.1,3,0,.4,8,8),...unrelated]);
    sim.hit(sim.targets[0],10,new THREE.Vector3(1,0,0));const shard=sim.debris[0];
    shard.body.setLinvel({x:120,y:0,z:0},true);shard.body.setAngvel({x:0,y:0,z:0},true);
    let boxChecks=0;const intersects=THREE.Box3.prototype.intersectsBox;
    THREE.Box3.prototype.intersectsBox=function(other){boxChecks++;return intersects.call(this,other);};
    try{sim.step(dt,0,0,false);}finally{THREE.Box3.prototype.intersectsBox=intersects;}
    assert.ok(sim.targets[1].body);assert.ok(shard.body.translation().x<255.7);
    assert.ok(boxChecks<20,`unrelated targets reached the fragment narrow phase: ${boxChecks}`);
    assert.ok(sim.targets.slice(2).every(t=>!t.body));
    return{boxChecks,unrelatedTargets:unrelated.length,cellBoundaryCollision:true};
  });
  check('sleeping remote fragments retain support without searching and resume when awakened',()=>{
    const sim=simulation([spec(250,4,0,1,1,1),spec(250,1,0,40,2,40)]);
    sim.hit(sim.targets[0],10,new THREE.Vector3());const shard=sim.debris[0];
    shard.body.setLinvel({x:0,y:0,z:0},true);shard.body.setAngvel({x:0,y:0,z:0},true);
    advance(sim,420);assert.ok(shard.body.isSleeping());assert.ok(sim.targets[1].body);
    const candidates=sim.candidates;let queries=0;
    sim.candidates=function(...args){queries++;return candidates.apply(this,args);};
    advance(sim,30);assert.equal(queries,0);assert.ok(sim.targets[1].body);
    shard.body.setLinvel({x:2,y:3,z:0},true);advance(sim,2);assert.ok(queries>0);
    sim.candidates=candidates;
    sim.hit(sim.targets[1],100,new THREE.Vector3());advance(sim,2);
    assert.equal(sim.targets[1].body,null,'destroyed cached supports must not reload');
    sim.reset();assert.equal(sim.world.bodies.len(),1);
    return{sleepingQueries:0,wakeResumesSearch:true,resetBodies:sim.world.bodies.len()};
  });
  check('one explosion allocates only retained fragments and preserves their full initial state',()=>{
    const make=()=>simulation(Array.from({length:40},(_,i)=>spec(240+i%8*2,3,Math.floor(i/8)*2,2,3,2)));
    const optimized=make(),reference=make(),point=new THREE.Vector3(248,3,4),direction=new THREE.Vector3(.7,.1,-.5);
    optimized.maxDebris=reference.maxDebris=64;
    const seeded=run=>{const old=Math.random;let seed=1234;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};try{return run();}finally{Math.random=old;}};
    let allocations=0;const create=optimized.world.createRigidBody;
    optimized.world.createRigidBody=function(...args){allocations++;return create.apply(this,args);};
    seeded(()=>optimized.explode(point,18,12,direction));
    seeded(()=>{for(const t of reference.nearby(point,18))reference.hit(t,12*(1-.45*t.box.distanceToPoint(point)/18),direction);});
    assert.equal(optimized.destroyed,40);assert.equal(optimized.destroyed,reference.destroyed);assert.equal(allocations,64);
    const state=sim=>sim.debris.map(d=>({p:d.body.translation(),q:d.body.rotation(),v:d.body.linvel(),w:d.body.angvel(),size:d.size.toArray(),color:d.color.toArray()}));
    assert.deepEqual(state(optimized),state(reference));
    optimized.reset();optimized.maxDebris=0;seeded(()=>optimized.explode(point,18,12,direction));
    assert.equal(optimized.destroyed,40);assert.equal(optimized.debris.length,0);
    return{destroyed:40,retainedFragments:64,allocatedBodies:allocations,identicalInitialFragmentState:true};
  });
  check('vehicle colliders keep their independent lifecycle outside the building load radius',()=>{
    const sim=simulation(),state={id:7,position:{x:250,y:0,z:0},rotation:{x:0,y:0,z:0,w:1},width:2,height:3,length:10};sim.syncVehicles([state]);sim.world.step();const hit=sim.world.castRay(new RAPIER.Ray({x:250,y:1,z:20},{x:0,y:0,z:-1}),30,true,undefined,0x00040001,sim.playerCollider);assert.ok(hit&&Math.abs(hit.timeOfImpact-15)<.0001);sim.syncVehicles([]);sim.world.step();assert.equal(sim.world.bodies.len(),1);sim.syncVehicles([state]);sim.reset();assert.equal(sim.world.bodies.len(),1);return{rayDistance:hit.timeOfImpact,resetBodies:sim.world.bodies.len()};
  });
  console.log(`Streaming checks: ${results.length}/${results.length} passed. Node/Rapier only.`);
}finally{
  for(const sim of fixtures)sim.world.free();
  await fs.writeFile(path.join(folder,'results.json'),JSON.stringify({scope:'Actual Simulation and Cannon in Node with geometric fixtures and a Traffic query double for the cannon test. No browser, GPU, mobile FPS or phone validation.',hashes,results},null,2)+'\n');
}
