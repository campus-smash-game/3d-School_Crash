import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import * as THREE from 'three';
import {ConvexGeometry} from 'three/examples/jsm/geometries/ConvexGeometry.js';
import RAPIER from '@dimforge/rapier3d-compat';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'artifacts/coordinate-test'),sourceHashes=[];await mkdir(out,{recursive:true});
for(const name of ['coordinates','physics','scene']){
  const source=await readFile(path.join(root,`src/${name}.ts`),'utf8'),compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  sourceHashes.push({file:`src/${name}.ts`,sha256:createHash('sha256').update(source).digest('hex')});
  await writeFile(path.join(out,`${name}.mjs`),compiled.replace(/from (['"])(\.\/[\w-]+)\1/g,"from '$2.mjs'"));
}
const coordinates=await import(pathToFileURL(path.join(out,'coordinates.mjs'))),{Simulation}=await import(pathToFileURL(path.join(out,'physics.mjs'))),{createCampus}=await import(pathToFileURL(path.join(out,'scene.mjs')));
const {dataToRenderPoint,renderToDataPoint,dataToRenderDirection,renderToDataDirection,bearingForward,bearingRight,bearingMovement}=coordinates;
await RAPIER.init();
// The real gate factory needs texture-drawing calls; this stub does not render a browser or validate text.
const canvasMethods=new Set(['fillRect','clearRect','beginPath','closePath','moveTo','lineTo','arc','ellipse','stroke','fill','fillText','strokeText','roundRect','save','restore','translate','rotate','scale','quadraticCurveTo','bezierCurveTo','setTransform']);
globalThis.document={createElement(tag){assert.equal(tag,'canvas');const context=new Proxy({},{get(object,key){if(key==='measureText')return text=>({width:String(text).length*20});if(key==='createLinearGradient'||key==='createRadialGradient')return()=>({addColorStop(){}});return canvasMethods.has(key)?()=>{}:object[key];},set(object,key,value){object[key]=value;return true;}});return{width:0,height:0,getContext(){return context;}};}};

const results=[],simulations=[],world=new THREE.Scene(),renderScene=new THREE.Scene();renderScene.add(world);
function check(name,run){const details=run();results.push({name,status:'passed',...details});console.log(`PASS ${name}${details?` ${JSON.stringify(details)}`:''}`);}
const close=(a,b,tolerance=1e-9)=>assert.ok(a.distanceTo(b)<tolerance,`vector error ${a.distanceTo(b)}`);
const gate=createCampus(world,{full:true});
const material=new THREE.MeshStandardMaterial({color:0xb8bca5});
function boxSpec(mesh,size,label){return{mesh,size,toughness:3,label,material:'stone'};}
const parent=new THREE.Group();parent.position.set(145,0,42);parent.rotation.y=.4;world.add(parent);
const ordinary=new THREE.Mesh(new THREE.BoxGeometry(6,4,1),material);ordinary.position.set(4,3,9);ordinary.rotation.y=-.2;parent.add(ordinary);
const ordinarySpec=boxSpec(ordinary,new THREE.Vector3(6,4,1),'nested ordinary wall');
const detached=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),material);detached.position.set(205,3,55);detached.rotation.y=.65;detached.scale.set(6,4,1);detached.updateMatrixWorld(true);
const detachedVisual=detached.clone();world.add(detachedVisual);const detachedSpec=boxSpec(detached,new THREE.Vector3(6,4,1),'detached landmark proxy');
const hullPoints=[];for(const y of[-2,2])for(const[x,z]of[[-4,-4],[4,-4],[-4,4]])hullPoints.push(new THREE.Vector3(x,y,z));
const convex=new THREE.Mesh(new ConvexGeometry(hullPoints),material);convex.position.set(250,4,75);convex.rotation.set(.12,.43,.08);world.add(convex);
const convexSpec={...boxSpec(convex,new THREE.Vector3(8,4,8),'convex triangular prism'),collisionVertices:Float32Array.from(hullPoints.flatMap(p=>p.toArray()))};
world.updateMatrixWorld(true);
const sim=new Simulation([...gate.breakables,ordinarySpec,detachedSpec,convexSpec],gate.colliders,gate.spawn,{minX:-100,maxX:500,minZ:-150,maxZ:500});simulations.push(sim);
const snapshots=new Map(sim.targets.map(target=>{const position=new THREE.Vector3(),rotation=new THREE.Quaternion();target.mesh.matrixWorld.decompose(position,rotation,new THREE.Vector3());return[target,{position,rotation,box:target.box.clone(),vertices:target.collisionVertices?.slice()}];}));
const gateTargets=sim.targets.filter(t=>t.label==='샤 정문'),ordinaryTarget=sim.targets.find(t=>t.mesh===ordinary),detachedTarget=sim.targets.find(t=>t.mesh===detached),convexTarget=sim.targets.find(t=>t.mesh===convex);
const selected=[gateTargets[0],gateTargets[4],gateTargets[9],ordinaryTarget,detachedTarget,convexTarget];assert.ok(selected.every(Boolean));
const visualFor=new Map([[detachedTarget,detachedVisual]]),far=new THREE.Vector3(2000,100,2000);
const originalBodyCount=sim.world.bodies.len(),originalLoadedTargets=new Set(sim.targets.filter(t=>t.body));
function assertSpawnLoadState(){assert.equal(sim.world.bodies.len(),originalBodyCount);assert.deepEqual(new Set(sim.targets.filter(t=>t.body)),originalLoadedTargets);}
function loadedCast(origin,direction,distance,only){
  // Load the actual query area explicitly instead of relying on a campus-wide spawn radius.
  sim.setFocus(origin,true);sim.world.step();if(only)assert.ok(only.body,'the selected loaded-path target must have a Rapier body');
  const lookup=new Map(sim.targets.filter(t=>t.body&&(!only||t===only)).map(t=>[t.body.handle,t]));const hit=sim.world.castRay(new RAPIER.Ray(origin,direction),distance,true,undefined,undefined,sim.playerCollider,undefined,c=>lookup.has(c.parent()?.handle));return hit?{object:lookup.get(hit.collider.parent().handle).mesh,distance:hit.timeOfImpact}:null;
}
const rays=selected.map(target=>{const pose=snapshots.get(target),normal=new THREE.Vector3(0,0,1).applyQuaternion(pose.rotation),local=target===convexTarget?new THREE.Vector3(-2,0,10):new THREE.Vector3(0,0,target.size.z/2+2),origin=local.applyQuaternion(pose.rotation).add(pose.position),direction=normal.clone().negate(),distance=target===convexTarget?20:target.size.z+4;const hit=loadedCast(origin,direction,distance);assert.ok(hit);return{target:sim.targets.find(t=>t.mesh===hit.object),origin,direction,distance,expected:hit.distance};});

try{
  check('coordinate transforms round-trip points and directions without changing input vectors',()=>{
    let count=0;for(const value of[new THREE.Vector3(1,2,3),new THREE.Vector3(-875,16.8,55),new THREE.Vector3(0,0,0),new THREE.Vector3(950,20,-2100)]){
      const original=value.clone(),render=dataToRenderPoint(value);close(render,new THREE.Vector3(value.x,value.y,-value.z));close(value,original);close(renderToDataPoint(render),value);
      const direction=value.clone().multiplyScalar(.2),reflected=dataToRenderDirection(direction);assert.equal(reflected.lengthSq(),direction.lengthSq());close(renderToDataDirection(reflected),direction);
      const inplace=value.clone();assert.equal(dataToRenderPoint(inplace,inplace),inplace);renderToDataPoint(inplace,inplace);close(inplace,value);count++;
    }
    const plain={x:4,y:5,z:6},out=new THREE.Vector3();assert.equal(dataToRenderPoint(plain,out),out);close(out,new THREE.Vector3(4,5,-6));return{points:count,inPlaceAndRapierStyleObjects:true};
  });

  check('cardinal geography projects to the correct camera side and bearing movement matches the view',()=>{
    const fixtures=[{bearing:0,f:[0,0,1],r:[1,0,0]},{bearing:Math.PI/2,f:[1,0,0],r:[0,0,-1]},{bearing:Math.PI,f:[0,0,-1],r:[-1,0,0]},{bearing:Math.PI*1.5,f:[-1,0,0],r:[0,0,1]}];let minimumRightX=Infinity;
    for(const fixture of fixtures){const f=new THREE.Vector3(...fixture.f),right=new THREE.Vector3(...fixture.r);close(bearingForward(fixture.bearing),f);close(bearingRight(fixture.bearing),right);
      const camera=new THREE.PerspectiveCamera(65,16/9,.08,7500);camera.rotation.order='YXZ';camera.rotation.set(0,-fixture.bearing,0);camera.updateMatrixWorld(true);assert.ok(Math.abs(camera.matrixWorld.determinant()-1)<1e-12);
      const point=f.clone().multiplyScalar(20).addScaledVector(right,5),screen=dataToRenderPoint(point).project(camera);assert.ok(screen.x>.2);minimumRightX=Math.min(minimumRightX,screen.x);
      close(renderToDataDirection(camera.getWorldDirection(new THREE.Vector3())),f);close(bearingMovement(fixture.bearing,.3,.8),right.clone().multiplyScalar(.3).addScaledVector(f,.8));
    }
    for(let i=0;i<72;i++){const bearing=i*Math.PI/36,camera=new THREE.PerspectiveCamera();camera.rotation.order='YXZ';camera.rotation.set(.35,-bearing,0);camera.updateMatrixWorld(true);
      const forward=renderToDataDirection(camera.getWorldDirection(new THREE.Vector3())),expected=bearingForward(bearing).multiplyScalar(Math.cos(.35));expected.y=Math.sin(.35);close(forward,expected);
      close(dataToRenderDirection(bearingRight(bearing)),new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0));assert.ok(Math.abs(bearingMovement(bearing,.6,.8).length()-1)<1e-12);
    }return{cardinalViews:4,angledViews:72,minimumRightNdcX:minimumRightX};
  });

  check('real gate and nested, detached and convex targets retain logical bounds after render reflection',()=>{
    world.scale.z=-1;renderScene.updateMatrixWorld(true);
    for(const target of sim.targets){const pose=snapshots.get(target);sim.setFocus(pose.position,true);sim.world.step();assert.deepEqual(target.box,pose.box);assert.ok(target.body);close(new THREE.Vector3().copy(target.body.translation()),pose.position,.0001);assert.ok(sim.nearby(pose.position,.1).includes(target));}
    for(const target of[ordinaryTarget,detachedTarget,convexTarget]){const p=snapshots.get(target).position;assert.ok(!sim.nearby(dataToRenderPoint(p),.1).includes(target));}
    assert.equal(detached.parent,null);assert.ok(ordinary.parent===parent&&parent.parent===world);return{actualGateTargets:gateTargets.length,totalTargets:sim.targets.length,reflectedRootDeterminant:world.matrixWorld.determinant()};
  });

  check('loaded physical shots and transformed render shots hit the same surfaces after reflection',()=>{
    let maximumError=0;for(const ray of rays){const loaded=loadedCast(ray.origin,ray.direction,ray.distance);assert.equal(loaded?.object,ray.target.mesh);assert.ok(Math.abs(loaded.distance-ray.expected)<.0001);
      const rendered=new THREE.Raycaster(dataToRenderPoint(ray.origin),dataToRenderDirection(ray.direction),0,ray.distance).intersectObject(visualFor.get(ray.target)??ray.target.mesh,false)[0];assert.ok(rendered);maximumError=Math.max(maximumError,Math.abs(rendered.distance-loaded.distance));
    }assert.ok(maximumError<.0002);return{rays:rays.length,maximumRenderPhysicsError:maximumError};
  });

  check('streamed-out shots use frozen logical proxies and return original target objects and data points',()=>{
    sim.setFocus(far,true);assert.ok(sim.targets.every(t=>!t.body));let maximumError=0;
    for(const ray of rays){const hit=sim.castUnloadedTargets(ray.origin,ray.direction,ray.distance);assert.equal(hit?.object,ray.target.mesh);maximumError=Math.max(maximumError,Math.abs(hit.distance-ray.expected));close(hit.point,ray.origin.clone().addScaledVector(ray.direction,hit.distance),.00001);}
    assert.ok(maximumError<.0002);sim.setFocus(gate.spawn,true);sim.world.step();assertSpawnLoadState();return{rays:rays.length,maximumLoadedUnloadedError:maximumError,restoredSpawnLoadedTargets:originalLoadedTargets.size};
  });

  check('the convex empty bounding-box corner stays empty in both loaded and unloaded query paths',()=>{
    const pose=snapshots.get(convexTarget),origin=new THREE.Vector3(3,8,3).applyQuaternion(pose.rotation).add(pose.position),direction=new THREE.Vector3(0,-1,0).applyQuaternion(pose.rotation);
    assert.equal(loadedCast(origin,direction,20,convexTarget),null);sim.setFocus(far,true);assert.equal(sim.castUnloadedTargets(origin,direction,20),null);assert.deepEqual(convexTarget.collisionVertices,snapshots.get(convexTarget).vertices);sim.setFocus(gate.spawn,true);sim.world.step();return{convexCornerRemainsEmpty:true};
  });

  check('partial damage, logical explosions and debris stay in data space after the parent reflection',()=>{
    const target=ordinaryTarget,pose=snapshots.get(target),ray=rays.find(r=>r.target===target);assert.ok(ray);
    sim.setFocus(pose.position,true);sim.world.step();assert.ok(target.body);
    assert.equal(sim.hit(target,1,ray.direction),false);assert.equal(target.mesh.visible,true);assert.ok(loadedCast(ray.origin,ray.direction,ray.distance,target));
    const wrongSpace=sim.explode(dataToRenderPoint(pose.position),1,100,ray.direction);assert.equal(wrongSpace,0);assert.equal(sim.explode(pose.position,1,100,ray.direction),1);assert.equal(target.mesh.visible,false);assert.equal(target.body,null);
    assert.equal(sim.castUnloadedTargets(ray.origin,ray.direction,ray.distance),null);assert.ok(sim.debris.length>0);
    for(const debris of sim.debris){const p=new THREE.Vector3().copy(debris.body.translation());assert.ok(p.distanceTo(pose.position)<5);assert.ok(p.distanceTo(dataToRenderPoint(pose.position))>30);}
    const retained=rays.find(r=>r.target===detachedTarget);assert.ok(loadedCast(retained.origin,retained.direction,retained.distance,detachedTarget));return{destroyed:sim.destroyed,debris:sim.debris.length};
  });

  check('repeated reset restores logical collision shapes, ray identity and render visibility without leaks',()=>{
    for(let cycle=0;cycle<4;cycle++){
      sim.reset();assert.equal(sim.destroyed,0);assert.equal(sim.debris.length,0);assertSpawnLoadState();assert.equal(world.scale.z,-1);
      for(const ray of rays){assert.equal(ray.target.mesh.visible,true);const hit=loadedCast(ray.origin,ray.direction,ray.distance);assert.equal(hit?.object,ray.target.mesh);assert.ok(Math.abs(hit.distance-ray.expected)<.0002);}
      sim.setFocus(far,true);assert.ok(sim.targets.every(t=>!t.body));for(const ray of rays){const hit=sim.castUnloadedTargets(ray.origin,ray.direction,ray.distance);assert.equal(hit?.object,ray.target.mesh);assert.ok(Math.abs(hit.distance-ray.expected)<.0002);}sim.setFocus(gate.spawn,true);sim.world.step();assertSpawnLoadState();
      sim.hit(convexTarget,100,new THREE.Vector3(0,0,-1));sim.hit(detachedTarget,100,new THREE.Vector3(0,0,-1));
    }sim.reset();assertSpawnLoadState();return{resetCycles:5,restoredBodyCount:sim.world.bodies.len(),restoredLoadedTargets:originalLoadedTargets.size,convexAndDetachedDamage:true};
  });

  check('query geometry and convex vertices are immutable snapshots of the authored targets',()=>{
    const points=hullPoints.map(p=>p.clone()),mesh=new THREE.Mesh(new ConvexGeometry(points),material);mesh.position.set(0,3,8);mesh.updateMatrixWorld(true);
    const input={...boxSpec(mesh,new THREE.Vector3(8,4,8),'snapshot fixture'),collisionVertices:Float32Array.from(points.flatMap(p=>p.toArray()))},test=new Simulation([input],[],new THREE.Vector3(0,1.7,0),{minX:-20,maxX:20,minZ:-20,maxZ:20});simulations.push(test);
    const origin=new THREE.Vector3(-2,3,20),direction=new THREE.Vector3(0,0,-1);test.setFocus(far,true);const initial=test.castUnloadedTargets(origin,direction,30);assert.ok(initial);
    mesh.geometry.getAttribute('position').array.fill(0);input.collisionVertices.fill(0);input.size.setScalar(99);mesh.position.z=-300;mesh.updateMatrixWorld(true);
    const hit=test.castUnloadedTargets(origin,direction,30);assert.equal(hit?.object,mesh);assert.ok(Math.abs(hit.distance-initial.distance)<1e-10);test.reset();const target=test.targets[0];assert.equal(target.size.x,8);assert.ok(target.collisionVertices.some(v=>v!==0));assert.ok(Math.abs(target.body.translation().z-8)<.0001);
    return{geometryCaptured:true,convexVerticesCaptured:true,logicalPoseCaptured:true};
  });
  await writeFile(path.join(out,'results.json'),JSON.stringify({scope:'Node geometry, actual gate generation and Rapier tests. Loaded casts explicitly focus near their query origins; unloaded casts keep all targets streamed out. Reset body and loaded-target sets are compared with the initial spawn state. No browser, texture-rendering or physical-device validation.',sourceHashes,results},null,2)+'\n');
  console.log(`Coordinate checks: ${results.length}/${results.length} passed.`);
}finally{for(const simulation of simulations){simulation.world.removeCharacterController(simulation.controller);simulation.world.free();}}
