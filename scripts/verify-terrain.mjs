import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import ts from 'typescript';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'artifacts/terrain-test');
await fs.mkdir(output,{recursive:true});
for(const file of await fs.readdir(path.join(root,'src'))){
  if(!file.endsWith('.ts'))continue;
  const name=file.slice(0,-3);
  const source=await fs.readFile(path.join(root,`src/${name}.ts`),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  await fs.writeFile(path.join(output,`${name}.mjs`),compiled.replace(/from (['"])(\.\/[\w-]+)\1/g,"from '$2.mjs'"));
}
const {createTerrain}=await import(pathToFileURL(path.join(output,'terrain.mjs')));
const {createLandmarkBuilding}=await import(pathToFileURL(path.join(output,'landmarkBuildings.mjs')));
const {getBuildingAppearance}=await import(pathToFileURL(path.join(output,'buildingAppearance.mjs')));
const {Simulation}=await import(pathToFileURL(path.join(output,'physics.mjs')));
const data=JSON.parse(await fs.readFile(path.join(root,'public/data/campus.json'),'utf8'));
const elevation=JSON.parse(await fs.readFile(path.join(root,'public/data/terrain.json'),'utf8'));
const originalHeights=structuredClone(elevation.heights);
const scene=new THREE.Scene(),terrain=createTerrain(scene,elevation,data.buildings),results=[];
const check=async(name,run)=>{const details=await run();results.push({name,status:'passed',...details});console.log(`PASS ${name} ${JSON.stringify(details??{})}`);};
const centre=b=>{const p=b.points.slice(0,-1);return [p.reduce((s,v)=>s+v[0],0)/p.length,p.reduce((s,v)=>s+v[1],0)/p.length];};
const synthetic={bounds:{minX:1000,maxX:1120,minZ:1000,maxZ:1120},width:61,height:61,heights:[]};
for(let z=0;z<=120;z+=2)for(let x=0;x<=120;x+=2)synthetic.heights.push(x*.15+z*.07+7*Math.exp(-((x-60)**2+(z-60)**2)/90));

await check('source elevation is preserved and reversed building order gives identical terrain',()=>{
  const reverse=createTerrain(new THREE.Scene(),elevation,data.buildings.toReversed());
  assert.deepEqual(elevation.heights,originalHeights);
  assert.deepEqual(terrain.vertices,reverse.vertices);
  assert.deepEqual(terrain.indices,reverse.indices);
  return {vertices:terrain.vertices.length/3,buildings:data.buildings.length};
});

await check('rotated footprints do not flatten empty AABB corners and courtyards retain their terrain',()=>{
  const baseline=createTerrain(new THREE.Scene(),synthetic,[]);
  const diagonal={points:[[1020,1020],[1080,1080],[1086,1074],[1026,1014],[1020,1020]]};
  const slanted=createTerrain(new THREE.Scene(),synthetic,[diagonal]);
  for(const [x,z] of [[1020,1080],[1080,1020],[1010,1090]])assert.equal(slanted.heightAt(x,z),baseline.heightAt(x,z));
  assert.ok(Math.abs(slanted.heightAt(1030,1024)-baseline.heightAt(1030,1024))>1);
  const courtyard={points:[[1006,1006],[1114,1006],[1114,1114],[1006,1114],[1006,1006]],holes:[[[1030,1030],[1090,1030],[1090,1090],[1030,1090],[1030,1030]]]};
  const holed=createTerrain(new THREE.Scene(),synthetic,[courtyard]);
  assert.equal(holed.heightAt(1060,1060),baseline.heightAt(1060,1060));
  assert.ok(Math.abs(holed.heightAt(1010,1010)-baseline.heightAt(1010,1010))>1);
  return {outsideSamples:3,preservedCourtyardHeight:holed.heightAt(1060,1060)};
});

await check('buildings that preserve terrain do not flatten or refine the rendered and physical surface',()=>{
  const building={id:'supplemental/snu-303',points:[[1020,1020],[1100,1020],[1100,1100],[1020,1100],[1020,1020]]};
  const baseline=createTerrain(new THREE.Scene(),synthetic,[]);
  const enabled=createTerrain(new THREE.Scene(),synthetic,[building]);
  assert.notDeepEqual(enabled.vertices,baseline.vertices,'the sample must actually exercise a terrain pad');
  for(const id of [building.id,'way/439707895']){
    const preserved=createTerrain(new THREE.Scene(),synthetic,[{...building,id,terrainPad:false}]);
    assert.deepEqual(preserved.vertices,baseline.vertices);
    assert.deepEqual(preserved.indices,baseline.indices);
    assert.deepEqual(preserved.heightAt.detailRegions,baseline.heightAt.detailRegions);
    for(let x=1000;x<=1120;x+=5)for(let z=1000;z<=1120;z+=5)assert.equal(preserved.heightAt(x,z),baseline.heightAt(x,z));
  }
  return {excludedPadCases:2,heightSamplesPerCase:625,renderAndPhysicsArraysIdentical:true};
});

await check('overlapping pads blend symmetrically and mapped library centre is not covered by the bridge AABB',()=>{
  const a={id:'a',points:[[1010,1010],[1080,1010],[1080,1080],[1010,1080],[1010,1010]]};
  const b={id:'b',points:[[1050,1050],[1110,1050],[1110,1110],[1050,1110],[1050,1050]]};
  const ab=createTerrain(new THREE.Scene(),synthetic,[a,b]),ba=createTerrain(new THREE.Scene(),synthetic,[b,a]);
  assert.deepEqual(ab.vertices,ba.vertices);
  const aa=createTerrain(new THREE.Scene(),synthetic,[a]).heightAt(1060,1060),bb=createTerrain(new THREE.Scene(),synthetic,[b]).heightAt(1060,1060),both=ab.heightAt(1060,1060);
  assert.ok(both>Math.min(aa,bb)&&both<Math.max(aa,bb));
  const main=data.buildings.find(b=>b.id==='way/148286730'),[x,z]=centre(main);
  const withoutBridge=createTerrain(new THREE.Scene(),elevation,data.buildings.filter(b=>b.id!=='way/329398175'));
  assert.equal(terrain.heightAt(x,z),withoutBridge.heightAt(x,z));
  assert.ok(terrain.heightAt(x,z)<40&&terrain.heightAt(x,z)>35);
  return {mainLibraryHeight:terrain.heightAt(x,z),overlapHeight:both};
});

await RAPIER.init();
await check('heightAt matches rendered triangles and Rapier collision height',()=>{
  scene.updateMatrixWorld(true);
  const world=new RAPIER.World({x:0,y:-9.81,z:0});
  world.createCollider(RAPIER.ColliderDesc.trimesh(terrain.vertices,terrain.indices));world.step();
  const samples=[[0,0],[116.575,7.91],[322.9407692307692,-791.5776923076924]];
  for(let i=1;i<=64;i++)samples.push([data.bounds.minX+(data.bounds.maxX-data.bounds.minX)*(i*17%67)/67,data.bounds.minZ+(data.bounds.maxZ-data.bounds.minZ)*(i*23%71)/71]);
  let largestPhysicsDifference=0,largestRenderDifference=0;
  try{
    for(const [x,z] of samples){
      const expected=terrain.heightAt(x,z)-.03,origin=new THREE.Vector3(x,expected+800,z),direction=new THREE.Vector3(0,-1,0);
      const rendered=new THREE.Raycaster(origin,direction,0,1600).intersectObject(terrain.mesh)[0];assert.ok(rendered);
      const hit=world.castRay(new RAPIER.Ray(origin,direction),1600,true);assert.ok(hit);
      const physical=origin.y-hit.timeOfImpact;
      largestRenderDifference=Math.max(largestRenderDifference,Math.abs(rendered.point.y-expected));
      largestPhysicsDifference=Math.max(largestPhysicsDifference,Math.abs(physical-expected));
      assert.ok(Math.abs(rendered.point.y-expected)<.002);assert.ok(Math.abs(physical-expected)<.015);
    }
  }finally{world.free();}
  return {samples:samples.length,largestRenderDifference,largestPhysicsDifference,documentedGroundOffset:.03};
});

await check('museum sloped underside clears the actual terrain without changing model height',()=>{
  const building=data.buildings.find(b=>b.id==='way/252233408'),localScene=new THREE.Scene();
  const model=createLandmarkBuilding(localScene,building,getBuildingAppearance(building),terrain.heightAt);
  assert.ok(model);localScene.updateMatrixWorld(true);
  const shell=localScene.children.find(o=>o.userData.role==='building-shell'),mesh=shell.children[0];
  const vertices=mesh.geometry.getAttribute('position'),[cx,cz]=centre(building),base=terrain.heightAt(cx,cz);
  let minimum=Infinity,where=null,samples=0,triangles=0;
  for(let i=0;i<vertices.count;i+=3){
    const a=new THREE.Vector3().fromBufferAttribute(vertices,i),b=new THREE.Vector3().fromBufferAttribute(vertices,i+1),c=new THREE.Vector3().fromBufferAttribute(vertices,i+2);
    const normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    if(normal.y>=-.98||Math.hypot(normal.x,normal.z)<.02||Math.max(a.y,b.y,c.y)>base+10)continue;
    triangles++;
    for(let u=0;u<=12;u++)for(let v=0;v<=12-u;v++){
      const p=a.clone().multiplyScalar(1-(u+v)/12).addScaledVector(b,u/12).addScaledVector(c,v/12),clearance=p.y-terrain.heightAt(p.x,p.z);
      samples++;if(clearance<minimum){minimum=clearance;where=p.toArray();}
    }
  }
  assert.equal(triangles,12);assert.ok(samples>1000);assert.ok(minimum>.05,`museum underside enters terrain: ${minimum}m at ${where}`);
  const bounds=new THREE.Box3().setFromObject(mesh);assert.ok(Math.abs(bounds.max.y-base-17.815)<.1);
  return {minimumClearance:minimum,where,samples,undersideTriangles:triangles,base,height:bounds.max.y-base};
});

await check('library bridge maintains roof separation and its rear supports remain above terrain',()=>{
  const building=data.buildings.find(b=>b.id==='way/329398175'),main=data.buildings.find(b=>b.id==='way/148286730'),localScene=new THREE.Scene();
  const model=createLandmarkBuilding(localScene,building,getBuildingAppearance(building),terrain.heightAt),shell=localScene.children.find(o=>o.userData.role==='building-shell');
  const [x,z]=centre(main),mainBase=terrain.heightAt(x,z),mainRoof=mainBase+(getBuildingAppearance(main).height??main.height),meta=shell.userData;
  const bridgeUnderside=meta.localOrigin.y+meta.bridgeBottom,roofGap=bridgeUnderside-mainRoof;
  assert.ok(Math.abs(roofGap-2.25)<.001);assert.equal(meta.elevationReference.surveyed,false);
  assert.ok(Math.hypot(meta.elevationReference.x-x,meta.elevationReference.z-z)<.001);
  const {x:ux,z:uz}=meta.axis,origin=meta.localOrigin;
  let minimumTopClearance=Infinity,minimumSupportExposure=Infinity;
  for(const end of [-1,1])for(let i=0;i<=4;i++){
    const along=end*(meta.dimensions.length/2-meta.supportWidth*i/4),across=-meta.dimensions.depth/2;
    const wx=origin.x+ux*along-uz*across,wz=origin.z+uz*along+ux*across,ground=terrain.heightAt(wx,wz);
    minimumTopClearance=Math.min(minimumTopClearance,origin.y+meta.dimensions.height-ground);
    minimumSupportExposure=Math.min(minimumSupportExposure,bridgeUnderside-ground);
  }
  assert.ok(minimumTopClearance>12);assert.ok(minimumSupportExposure>1,'rear support swallowed by terrain');
  let frontApproachMaxGrade=0;
  for(let across=80;across<110;across+=2){
    const sample=d=>terrain.heightAt(origin.x-uz*d,origin.z+ux*d);
    frontApproachMaxGrade=Math.max(frontApproachMaxGrade,Math.abs(sample(across+2)-sample(across))/2);
  }
  assert.ok(frontApproachMaxGrade<.45,'northwest library approach has an abrupt terrain step');
  assert.ok(model.breakables.some(p=>p.mesh.userData.component==='support-base'));
  return {mainBase,mainRoof,bridgeUnderside,roofGap,minimumTopClearance,minimumSupportExposure,frontApproachMaxGrade};
});
await check('player capsule traverses the library northwest approach on the corrected terrain',()=>{
  const building=data.buildings.find(b=>b.id==='way/329398175'),localScene=new THREE.Scene();
  const model=createLandmarkBuilding(localScene,building,getBuildingAppearance(building),terrain.heightAt);
  const meta=localScene.children.find(o=>o.userData.role==='building-shell').userData,dx=-meta.axis.z,dz=meta.axis.x;
  const x=meta.localOrigin.x+dx*80,z=meta.localOrigin.z+dz*80;
  const sim=new Simulation(model.breakables,[],new THREE.Vector3(x,terrain.heightAt(x,z)+2,z),data.bounds,terrain);
  try{
    for(let i=0;i<120;i++)sim.step(1/60,0,0,false);
    const start=sim.player.translation();
    for(let i=0;i<120;i++)sim.step(1/60,dx*4,dz*4,false);
    const finish=sim.player.translation(),walkedMetres=Math.hypot(finish.x-start.x,finish.z-start.z),clearance=finish.y-terrain.heightAt(finish.x,finish.z);
    assert.ok(walkedMetres>7);assert.ok(clearance>.6&&clearance<1.2);
    return {walkedMetres,clearance,start,finish,note:'Exterior approach only; this fixture does not include the main-library facade.'};
  }finally{sim.world.removeCharacterController(sim.controller);sim.world.free();}
});
await fs.writeFile(path.join(root,'artifacts/terrain-verification.json'),JSON.stringify({verifiedAt:new Date().toISOString(),tests:results,limitations:'Numeric source geometry and Rapier checks. No WebGL, real-device test or surveyed elevation. Ground surface is heightAt minus 0.03m by the existing convention.'},null,2));
console.log(`Verified ${results.length} terrain regressions.`);
