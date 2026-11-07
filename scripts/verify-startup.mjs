import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {registerHooks} from 'node:module';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sourceRoot=pathToFileURL(path.join(root,'src')+path.sep).href;
const sourceHashes={};
registerHooks({resolve(s,c,n){if(c.parentURL?.startsWith(sourceRoot)&&s.startsWith('.')&&!path.extname(s))return{url:new URL(s+'.ts',c.parentURL).href,shortCircuit:true};return n(s,c);},load(u,c,n){if(u.startsWith(sourceRoot)&&u.endsWith('.ts')){let file=fileURLToPath(u);sourceHashes[path.relative(root,file).replaceAll('\\','/')]=createHash('sha256').update(fs.readFileSync(file)).digest('hex');return{format:'module',shortCircuit:true,source:ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText};}return n(u,c);}});
globalThis.document={createElement(){const canvas={width:0,height:0};canvas.getContext=()=>new Proxy({},{get(o,k){if(k==='measureText')return s=>({width:String(s).length*20});if(k==='createLinearGradient'||k==='createRadialGradient')return()=>({addColorStop(){}});return o[k]??(()=>{});},set(o,k,v){o[k]=v;return true;}});return canvas;}};
const source=n=>import(pathToFileURL(path.join(root,'src',n+'.ts')));
const timings=[];
async function time(name,fn){console.log('START',name);const t=performance.now();const value=await fn();const row={name,ms:Math.round(performance.now()-t),heapMB:Math.round(process.memoryUsage().heapUsed/1e6)};timings.push(row);console.log(JSON.stringify(row));return value;}
await time('imports',async()=>{await R.init();});
const names=['terrain','scene','fullCampus','physics','traffic','transitFacilities','centralPlazaFacilities','administrationPlazaFacilities','informationCourtApproach','administrationPlazaGround','gyujanggakApproach'];
const [terrainModule,gateModule,campusModule,physicsModule,trafficModule,...facilityModules]=await time('modules',()=>Promise.all(names.map(source)));
const json=f=>JSON.parse(fs.readFileSync(path.join(root,'public/data',f+'.json')));
const data=json('campus'),dem=json('terrain'),plan=json('campus-transit'),facilitiesPlan=json('transit-facilities');
data.roads.push(...plan.supplementalRoads??[]);
const scene=new THREE.Scene();
const asyncMode=true;
const startup=await source('startup');
let ticks=0,cleaned=false;
const pending=setInterval(()=>ticks++,0);
const value=await startup.runStartupSteps((function*(){for(let i=0;i<24;i++){const end=performance.now()+2;while(performance.now()<end){}yield 'loading';}return 42;})());
clearInterval(pending);assert.equal(value,42);assert.ok(ticks>1,'Startup must allow timer/input tasks before finishing');
await assert.rejects(startup.runStartupSteps((function*(){try{yield 'first';throw new Error('expected');}finally{cleaned=true;}})()),/expected/);assert.ok(cleaned);
console.log('PASS startup returns control to the event loop and closes failed generators');
const longSteps=[];let longestStep=0,heartbeats=0,lastHeartbeat=performance.now(),maxHeartbeatGap=0;
const heartbeat=setInterval(()=>{const now=performance.now();maxHeartbeatGap=Math.max(maxHeartbeatGap,now-lastHeartbeat);lastHeartbeat=now;heartbeats++;},10);
async function asyncBuild(name,steps){function* tracked(){while(true){const start=performance.now(),r=steps.next(),ms=performance.now()-start;longestStep=Math.max(longestStep,ms);if(ms>200)longSteps.push({name,ms:Math.round(ms)});if(r.done)return r.value;yield r.value;}}return startup.runStartupSteps(tracked());}
const terrain=await time('terrain',()=>asyncMode?asyncBuild('terrain',terrainModule.createTerrainSteps(scene,dem,data.buildings)):terrainModule.createTerrain(scene,dem,data.buildings));
const gate=await time('gate',()=>gateModule.createCampus(scene,{full:true}));
const campus=await time('campus',()=>asyncMode?asyncBuild('campus',campusModule.createFullCampusSteps(scene,data,terrain.heightAt)):campusModule.createFullCampus(scene,data,terrain.heightAt));
const facilities=[];
for(const [i,m]of facilityModules.entries()){const fn=Object.values(m).find(v=>typeof v==='function');await startup.yieldToBrowser();facilities.push(await time(names[i+5],()=>i===0?fn(scene,facilitiesPlan,terrain.heightAt):i===2?fn(scene,data,terrain.heightAt):fn(scene,terrain.heightAt)));}
const spawn=gate.spawn.clone();
const specs=[...gate.breakables,...campus.breakables,...facilities.flatMap(f=>f.breakables)];
await startup.yieldToBrowser();
const sim=await time('physics',async()=>{const sim=new physicsModule.Simulation(asyncMode?[]:specs,[...gate.colliders,...campus.colliders],spawn,data.bounds,terrain);if(asyncMode){await asyncBuild('physics',sim.prepareTargets(specs));sim.reset();}return sim;});
await startup.yieldToBrowser();
await time('traffic',()=>new trafficModule.Traffic(scene,data.roads,terrain.heightAt,plan));
let meshes=0,triangles=0;scene.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position?.count??0)/3;}});
const digest=createHash('sha256');scene.traverse(o=>{if(o.isMesh){digest.update(o.name);for(const a of Object.values(o.geometry.attributes))digest.update(new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength));if(o.geometry.index)digest.update(new Uint8Array(o.geometry.index.array.buffer));}});
const hash=a=>createHash('sha256').update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
await startup.yieldToBrowser();
const result={scope:'Actual campus startup in Node with a Canvas 2D text double. No browser, GPU or phone verification.',timings,meshes,triangles,targets:sim.targets.length,terrainPositions:hash(terrain.vertices),terrainIndices:hash(terrain.indices),geometryHash:digest.digest('hex')};
clearInterval(heartbeat);if(globalThis.gc)globalThis.gc();Object.assign(result,{retainedHeapMB:Math.round(process.memoryUsage().heapUsed/1e6),longestStep,longSteps,heartbeats,maxHeartbeatGap});
function renderState(){
 const digest=createHash('sha256');let objects=0;
 scene.traverse(o=>{
  digest.update(o.name+':'+o.visible);objects++;
  if(!o.isMesh)return;
  for(const a of Object.values(o.geometry.attributes))digest.update(new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength));
  for(const a of [o.instanceMatrix,o.instanceColor])if(a)digest.update(new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength));
 });
 return{hash:digest.digest('hex'),objects};
}
const restored=[];
for(const point of [spawn,new THREE.Vector3(4000,0,4000)]){
 const update=()=>{campus.update(point);for(const f of facilities)f.update(point);};
 update();const intact=renderState();
 for(const target of sim.targets)target.mesh.visible=false;
 update();const damaged=renderState();assert.notEqual(damaged.hash,intact.hash,'Hiding destruction proxies must change the rendered campus');
 sim.reset();update();const reset=renderState();assert.deepEqual(reset,intact,'Reset must recover every visible surface and instanced transform');
 restored.push({point:point.toArray(),targets:sim.targets.length,exactRestore:true});
}
Object.assign(result,{restored,sourceHashes});
console.log('PASS every campus target restores the same geometry and visibility nearby and far away');
fs.mkdirSync(path.join(root,'artifacts/startup-test'),{recursive:true});
fs.writeFileSync(path.join(root,'artifacts/startup-test/results.json'),JSON.stringify(result,null,2));
assert.ok(heartbeats>20,'The complete campus must not initialize in one blocking task');
assert.ok(maxHeartbeatGap<5000,'A startup task blocked the event loop for '+maxHeartbeatGap+'ms');
assert.ok(sim.targets.length>50000,'The test must include the complete campus');
assert.ok(terrain.indices.length>500000,'The test must include the detailed terrain');
console.log('PASS full campus startup keeps processing queued tasks');
console.log(JSON.stringify(result));sim.world.free();
