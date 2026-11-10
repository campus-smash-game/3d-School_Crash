import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {registerHooks} from 'node:module';
import {gunzipSync} from 'node:zlib';
import ts from 'typescript';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {recordingDocument} from './campus-snapshot-encode.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const prefix=pathToFileURL(path.join(root,'src')+path.sep).href;
registerHooks({resolve(s,c,n){if(c.parentURL?.startsWith(prefix)&&s.startsWith('.')&&!path.extname(s))return{url:new URL(s+'.ts',c.parentURL).href,shortCircuit:true};return n(s,c);},load(u,c,n){if(u.startsWith(prefix)&&u.endsWith('.ts'))return{format:'module',shortCircuit:true,source:ts.transpileModule(fs.readFileSync(fileURLToPath(u),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText};return n(u,c);}});
const source=n=>import(pathToFileURL(path.join(root,'src',n+'.ts')));
const [{decodeCampusSnapshot,campusDecoderReady},{updaters},{Simulation}]=await Promise.all(['campusSnapshot','generated/campusUpdaters','physics'].map(source));
globalThis.document=recordingDocument();await Promise.all([RAPIER.init(),campusDecoderReady]);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'public/baked/manifest.json')));
const bytes=gunzipSync(fs.readFileSync(path.join(root,'public/baked',manifest.file)));
const {terrain,gate,campus,facilities}=decodeCampusSnapshot(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),updaters);
const specs=[...gate.breakables,...campus.breakables,...facilities.flatMap(f=>f.breakables)];
const sim=new Simulation(specs,[...gate.colliders,...campus.colliders],gate.spawn,terrain.bounds,terrain);
const selected=sim.targets.filter(t=>{const d=t.box.distanceToPoint(gate.spawn);return d>180&&d<400;}).sort((a,b)=>b.size.lengthSq()-a.size.lengthSq()).slice(0,30);
const centers=selected.map(t=>({label:t.label,point:t.box.getCenter(new THREE.Vector3()),count:sim.nearby(t.box.getCenter(new THREE.Vector3()),18).length})).sort((a,b)=>b.count-a.count).slice(0,2);
const output=[];
for(const cap of [64,120])for(const center of centers){
 sim.reset();sim.maxDebris=cap;let seed=123456789;const random=Math.random;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 let created=0,removed=0,queries=0,candidates=0,syncMs=0,worldMs=0;
 const wrap=(obj,key,fn)=>{const old=obj[key];obj[key]=function(...args){return fn(old.bind(this),args);};return()=>obj[key]=old;};
 const restore=[wrap(sim.world,'createRigidBody',(f,a)=>{created++;return f(...a);}),wrap(sim.world,'removeRigidBody',(f,a)=>{removed++;return f(...a);}),wrap(sim,'candidates',(f,a)=>{queries++;const r=f(...a);candidates+=r.length;return r;}),wrap(sim,'syncDebrisCollisions',(f,a)=>{const t=performance.now();const r=f(...a);syncMs+=performance.now()-t;return r;}),wrap(sim.world,'step',(f,a)=>{const t=performance.now();const r=f(...a);worldMs+=performance.now()-t;return r;})];
 const start=performance.now(),destroyed=sim.explode(center.point,18,12,new THREE.Vector3(0,0,1)),impactMs=performance.now()-start;
 const times=[];let peakBodies=0;
 for(let i=0;i<180;i++){const t=performance.now();sim.step(1/60,0,0,false);times.push(performance.now()-t);peakBodies=Math.max(peakBodies,sim.world.bodies.len());}
 for(const f of restore)f();Math.random=random;times.sort((a,b)=>a-b);
 const row={cap,label:center.label,point:center.point.toArray(),destroyed,impactMs,stepMedianMs:times[90],stepP95Ms:times[171],stepMaxMs:times.at(-1),syncMs,worldMs,created,removed,queries,candidates,peakBodies};output.push(row);console.log(JSON.stringify(row));
}
sim.world.free();
const directory=path.join(root,'artifacts/destruction-performance');fs.mkdirSync(directory,{recursive:true});
fs.writeFileSync(path.join(directory,(process.argv[2]??'latest')+'.json'),JSON.stringify({scope:'Deterministic Node/Rapier CPU benchmark using the shipped campus. Excludes GPU rendering, browser FPS and phone hardware.',results:output},null,2));
