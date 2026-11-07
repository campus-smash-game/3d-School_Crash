import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {registerHooks} from 'node:module';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import {recordingDocument} from './campus-snapshot-encode.mjs';
import {sceneFingerprint} from './campus-snapshot-fingerprint.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),prefix=pathToFileURL(path.join(root,'src')+path.sep).href;
registerHooks({resolve(s,c,n){if(c.parentURL?.startsWith(prefix)&&s.startsWith('.')&&!path.extname(s))return{url:new URL(s+'.ts',c.parentURL).href,shortCircuit:true};return n(s,c);},load(u,c,n){if(u.startsWith(prefix)&&u.endsWith('.ts'))return{format:'module',shortCircuit:true,source:ts.transpileModule(fs.readFileSync(fileURLToPath(u),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText};return n(u,c);}});
const source=n=>import(pathToFileURL(path.join(root,'src',n+'.ts')));
const [{decodeCampusSnapshot,campusDecoderReady},{updaters},{Simulation},{Traffic}]=await Promise.all(['campusSnapshot','generated/campusUpdaters','physics','traffic'].map(source));
globalThis.document=recordingDocument();await Promise.all([R.init(),campusDecoderReady]);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'public/baked/manifest.json')));
const start=performance.now(),bytes=gunzipSync(fs.readFileSync(path.join(root,'public/baked',manifest.file)));
const decompressed=performance.now();
const world=decodeCampusSnapshot(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),updaters),decoded=performance.now();
const {scene,terrain,gate,campus,facilities}=world;
if(manifest.expectedScene)assert.equal(sceneFingerprint(scene),manifest.expectedScene,'Geometry, materials, signs and render settings must match the original builders');
for(const [x,z,height]of manifest.heightSamples??[])assert.equal(terrain.heightAt(x,z),height,'Restored terrain sampler differs at '+x+','+z);
const validated=performance.now();
const data=JSON.parse(fs.readFileSync(path.join(root,'public/data/campus.json'))),plan=JSON.parse(fs.readFileSync(path.join(root,'public/data/campus-transit.json')));data.roads.push(...plan.supplementalRoads??[]);
const specs=[...gate.breakables,...campus.breakables,...facilities.flatMap(f=>f.breakables)];
const sim=new Simulation(specs,[...gate.colliders,...campus.colliders],gate.spawn,data.bounds,terrain);
const traffic=new Traffic(scene,data.roads,terrain.heightAt,plan),ready=performance.now();
console.log(JSON.stringify({decompressMs:decompressed-start,decodeMs:decoded-decompressed,physicsMs:ready-validated,totalMs:decoded-start+ready-validated}));
const digest=createHash('sha256');let meshes=0,triangles=0;
scene.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position?.count??0)/3;digest.update(o.name);for(const a of Object.values(o.geometry.attributes))digest.update(new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength));if(o.geometry.index)digest.update(new Uint8Array(o.geometry.index.array.buffer));}});
const geometryHash=digest.digest('hex');
console.log({meshes,triangles,targets:sim.targets.length,geometryHash});
function states(){const map=new Map();scene.traverse(o=>{if(o.isMesh){const h=createHash('sha256');h.update(String(o.visible));for(const a of Object.values(o.geometry.attributes))h.update(new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength));for(const a of[o.instanceMatrix,o.instanceColor])if(a)h.update(new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength));map.set(o,h.digest('hex'));}});return map;}
function renderState(){const h=createHash('sha256');scene.traverse(o=>{h.update(o.name+':'+o.visible);if(!o.isMesh)return;for(const a of Object.values(o.geometry.attributes))h.update(new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength));for(const a of[o.instanceMatrix,o.instanceColor])if(a)h.update(new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength));});return h.digest('hex');}
const update=(p,c)=>{campus.update(p,c);for(const f of facilities)f.update(p);};
const before=[];
for(const p of[gate.spawn,new THREE.Vector3(4000,0,4000)]){
 update(p);const intact=renderState(),original=states();for(const t of sim.targets)t.mesh.visible=false;update(p);assert.notEqual(renderState(),intact);sim.reset();update(p);const after=states();console.log('reset differences',[...after].filter(([o,h])=>h!==original.get(o)).map(([o])=>o.name).slice(0,40));assert.equal(renderState(),intact);before.push(intact);
}
const {createDamageUpdates}=await source('visualUpdates'),facilityUpdates=createDamageUpdates(facilities),incremental=[];
function checkUpdate(name,p,changes=sim.takeVisualChanges()){
 campus.update(p,changes);facilityUpdates.update(p,changes);const expected=renderState();update(p);assert.equal(renderState(),expected,name);incremental.push(name);
}
sim.reset();checkUpdate('reset',gate.spawn);
for(const p of [new THREE.Vector3(310,0,-750),new THREE.Vector3(4000,0,4000),gate.spawn])checkUpdate('travel',p);
const t=sim.targets.find(t=>t.toughness>1&&campus.breakables.some(s=>s.mesh===t.mesh)),p=t.box.getCenter(new THREE.Vector3());p.y=terrain.heightAt(p.x,p.z)+2;
sim.teleport(p);checkUpdate('approach impact',p);sim.hit(t,t.toughness*.1,new THREE.Vector3(0,0,1));
for(let i=0;i<24;i++){sim.step(1/60,0,0,false);checkUpdate('flash '+i,p);}
sim.hit(t,t.toughness,new THREE.Vector3(0,0,1));checkUpdate('destroy',p);
for(const f of facilities){const t=sim.targets.find(t=>t.mesh===f.breakables[0]?.mesh);assert.ok(t);sim.hit(t,t.toughness,new THREE.Vector3(0,0,1));checkUpdate('facility '+t.label,gate.spawn);}
sim.reset();checkUpdate('final reset',gate.spawn);
const result={scope:'Node snapshot decompression, hydration and complete physics/traffic setup. Excludes network, WebGL shaders, phone hardware and fidelity assertion time.',compressedMB:manifest.bytes/1e6,decompressMs:decompressed-start,decodeMs:decoded-decompressed,physicsAndTrafficMs:ready-validated,totalMs:decoded-start+ready-validated,meshes,triangles,targets:sim.targets.length,geometryHash,restored:before,incremental,terrainSamples:manifest.heightSamples?.length};
fs.mkdirSync(path.join(root,'artifacts/performance100'),{recursive:true});fs.writeFileSync(path.join(root,'artifacts/performance100/snapshot.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result));sim.world.free();
