import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import ts from 'typescript';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'artifacts/shuttle-starts');
await mkdir(out,{recursive:true});
for(const file of (await readdir(path.join(root,'src'))).filter(f=>f.endsWith('.ts'))){
  const source=await readFile(path.join(root,'src',file),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/from (['"])(\.\/[\w-]+)\1/g,"from '$2.mjs'");
  await writeFile(path.join(out,file.replace('.ts','.mjs')),code);
}
// Only canvas text is stubbed. Terrain, buildings and player collision use production modules.
globalThis.document={createElement(){return{width:0,height:0,getContext(){return new Proxy({},{get(o,k){if(k==='measureText')return s=>({width:String(s).length*20});if(k==='createLinearGradient'||k==='createRadialGradient')return()=>({addColorStop(){}});return o[k]??(()=>{});},set(o,k,v){o[k]=v;return true;}});}};}};
const [{createTerrain},{createCampus},{createFullCampus},{Simulation}]=await Promise.all(['terrain','scene','fullCampus','physics'].map(n=>import(pathToFileURL(path.join(out,n+'.mjs')))));
await RAPIER.init();
const readJSON=async f=>JSON.parse(await readFile(path.join(root,f),'utf8'));
const [data,dem,{stops}]=await Promise.all(['public/data/campus.json','public/data/terrain.json','public/data/shuttle-stops.json'].map(readJSON));
const plan=await readJSON('public/data/campus-transit.json');
data.roads.push(...(plan?.supplementalRoads??[]));
function roadClearance(stop){
  let clearance=Infinity;
  for(const road of data.roads.filter(r=>r.drivable))for(let i=1;i<road.points.length;i++){
    const a=road.points[i-1],b=road.points[i],dx=b[0]-a[0],dz=b[1]-a[1],len2=dx*dx+dz*dz;
    if(!len2)continue;
    const t=Math.max(0,Math.min(1,((stop.x-a[0])*dx+(stop.z-a[1])*dz)/len2));
    clearance=Math.min(clearance,Math.hypot(stop.x-a[0]-dx*t,stop.z-a[1]-dz*t)-road.width/2);
  }
  return clearance;
}
assert.equal(stops.length,15);
assert.equal(new Set(stops.map(s=>s.id)).size,stops.length);
const scene=new THREE.Scene(),terrain=createTerrain(scene,dem,data.buildings),gate=createCampus(scene,{full:true}),campus=createFullCampus(scene,data,terrain.heightAt);
const point=s=>new THREE.Vector3(s.x,terrain.heightAt(s.x,s.z)+1.8,s.z);
const sim=new Simulation([...gate.breakables,...campus.breakables],[...gate.colliders,...campus.colliders],point(stops[0]),data.bounds,terrain);
const results=[];
try{
  for(const stop of stops){
    try {
    assert.ok([stop.x,stop.z,stop.bearing,stop.stopX,stop.stopZ].every(Number.isFinite),`${stop.name}: invalid coordinates`);
    assert.ok(stop.x>data.bounds.minX&&stop.x<data.bounds.maxX&&stop.z>data.bounds.minZ&&stop.z<data.bounds.maxZ,`${stop.name}: outside campus map`);
    const clearance=roadClearance(stop);
    assert.ok(clearance>=.7,`${stop.name}: player is too close to the road edge (${clearance}m)`);
    const origin=point(stop);
    sim.teleport(origin);
    for(let frame=0;frame<90;frame++)sim.step(1/60,0,0,false);
    const settled=new THREE.Vector3().copy(sim.player.translation());
    const bottom=settled.y-.85,ground=terrain.heightAt(settled.x,settled.z);
    assert.ok(Math.hypot(settled.x-stop.x,settled.z-stop.z)<.15,`${stop.name}: idle spawn slid sideways`);
    assert.ok(bottom>=ground-.08&&bottom<=ground+.55,`${stop.name}: floating, buried or standing on an obstacle (${bottom-ground}m)`);
    const hit=sim.nearby(settled,1).filter(t=>t.box.containsPoint(settled));
    assert.equal(hit.length,0,`${stop.name}: inside ${hit.map(t=>t.label).join(', ')}`);
    const perpendicular=new THREE.Vector3(Math.cos(stop.bearing),0,-Math.sin(stop.bearing));
    const walked=[];
    for(const sign of [-1,1]){
      sim.teleport(origin);
      for(let frame=0;frame<90;frame++)sim.step(1/60,0,0,false);
      for(let frame=0;frame<30;frame++)sim.step(1/60,perpendicular.x*sign*4,perpendicular.z*sign*4,false);
      const p=sim.player.translation(),distance=Math.hypot(p.x-stop.x,p.z-stop.z);
      assert.ok(distance>1.5,`${stop.name}: sidewalk exit ${sign} blocked after ${distance}m`);
      walked.push(distance);
    }
    sim.spawn.copy(origin);sim.reset();
    assert.ok(Math.hypot(sim.player.translation().x-stop.x,sim.player.translation().z-stop.z)<.001,`${stop.name}: reset changed stop`);
    results.push({id:stop.id,name:stop.name,status:'passed',position:[stop.x,stop.z],roadEdgeClearance:clearance,bottomAboveTerrain:bottom-ground,sidewalkWalks:walked});
    console.log('PASS '+stop.name+' spawn, walking and reset');
    }catch(error){results.push({id:stop.id,name:stop.name,status:'failed',message:error.message});console.error('FAIL '+error.message);}
  }
}finally{
  await writeFile(path.join(out,'results.json'),JSON.stringify({scope:'Actual full campus terrain, buildings and Rapier player. Node checks; not a roadview position survey or device performance test.',results},null,2));
  sim.world.free();
}
assert.equal(results.filter(r=>r.status==='failed').length,0,'Some shuttle starts are obstructed');
