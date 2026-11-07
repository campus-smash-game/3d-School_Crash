import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {registerHooks} from 'node:module';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import * as THREE from 'three';
import {createSnapshotCompiler} from './campus-snapshot-compiler.mjs';
import {recordingDocument,encodeSnapshot} from './campus-snapshot-encode.mjs';
import {sceneFingerprint} from './campus-snapshot-fingerprint.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),src=path.join(root,'src');
const out=path.join(root,'public/baked'),generated=path.join(src,'generated');
const sourceFiles=fs.readdirSync(src).filter(f=>f.endsWith('.ts')).sort();
const hash=createHash('sha256');
for(const f of [...sourceFiles.map(f=>'src/'+f),...fs.readdirSync(path.join(root,'public/data')).filter(f=>f.endsWith('.json')).map(f=>'public/data/'+f),'scripts/bake-campus.mjs','scripts/campus-snapshot-compiler.mjs','scripts/campus-snapshot-encode.mjs','package-lock.json'])hash.update(f).update(fs.readFileSync(path.join(root,f),'utf8').replaceAll('\r\n','\n'));
const fingerprint=hash.digest('hex');fs.mkdirSync(out,{recursive:true});fs.mkdirSync(generated,{recursive:true});
const manifestFile=path.join(out,'manifest.json'),codeFile=path.join(generated,'campusUpdaters.ts');
if(!process.argv.includes('--force')&&fs.existsSync(manifestFile)&&fs.existsSync(codeFile)){
 const manifest=JSON.parse(fs.readFileSync(manifestFile));if(manifest.fingerprint===fingerprint&&fs.existsSync(path.join(out,manifest.file))){console.log('Campus snapshot is current');process.exit(0);}
}
const compiler=createSnapshotCompiler(root),prefix=pathToFileURL(src+path.sep).href;
registerHooks({resolve(s,c,n){if(c.parentURL?.startsWith(prefix)&&s.startsWith('.')&&!path.extname(s))return{url:new URL(s+'.ts',c.parentURL).href,shortCircuit:true};return n(s,c);},load(u,c,n){if(u.startsWith(prefix)&&u.endsWith('.ts'))return{format:'module',shortCircuit:true,source:compiler.compile(fileURLToPath(u))};return n(u,c);}});
globalThis.document=recordingDocument();
const source=n=>import(pathToFileURL(path.join(src,n+'.ts')).href),json=n=>JSON.parse(fs.readFileSync(path.join(root,'public/data',n+'.json')));
const data=json('campus'),dem=json('terrain'),plan=json('campus-transit');data.roads.push(...plan.supplementalRoads??[]);
const scene=new THREE.Scene();const started=performance.now();
console.log('Baking terrain');const tm=await source('terrain'),terrain=tm.createTerrain(scene,dem,data.buildings);
console.log('Baking campus');const gate=(await source('scene')).createCampus(scene,{full:true}),campus=(await source('fullCampus')).createFullCampus(scene,data,terrain.heightAt);
const facilities=[];
for(const [module,factory,args]of [
 ['transitFacilities','createTransitFacilities',[json('transit-facilities'),terrain.heightAt]],
 ['centralPlazaFacilities','createCentralPlazaFacilities',[terrain.heightAt]],
 ['administrationPlazaFacilities','createAdministrationPlazaFacilities',[data,terrain.heightAt]],
 ['informationCourtApproach','createInformationCourtApproach',[terrain.heightAt]],
 ['administrationPlazaGround','createAdministrationPlazaGround',[terrain.heightAt]],
 ['gyujanggakApproach','createGyujanggakApproach',[terrain.heightAt]],
])facilities.push((await source(module))[factory](scene,...args));
async function writeSnapshot(){
console.log('Encoding exact geometry and update state');
const expectedScene=sceneFingerprint(scene),heightSamples=[];
for(let x=data.bounds.minX;x<=data.bounds.maxX;x+=87)for(let z=data.bounds.minZ;z<=data.bounds.maxZ;z+=93)heightSamples.push([x,z,terrain.heightAt(x,z)]);
const encoder=process.argv.includes('--watch')?(await import('./campus-snapshot-encode.mjs?retry='+Date.now())).encodeSnapshot:encodeSnapshot;
const snapshot=encoder({scene,terrain:{heightAt:terrain.heightAt,vertices:terrain.vertices,indices:terrain.indices,bounds:terrain.bounds},gate,campus,facilities},compiler.captures);
console.log(JSON.stringify({records:snapshot.records,headerMB:snapshot.headerBytes/1e6,binaryMB:snapshot.binaryBytes/1e6,functions:snapshot.keys.size}));
const compressed=gzipSync(snapshot.bytes,{level:9}),digest=createHash('sha256').update(compressed).digest('hex'),file='campus-'+digest.slice(0,16)+'.bin.gz';
fs.writeFileSync(path.join(out,file),compressed);
fs.writeFileSync(codeFile,compiler.emit(snapshot.keys)+`export const snapshotUrl = ${JSON.stringify('baked/'+file)};\n`);
const manifest={fingerprint,file,sha256:digest,bytes:compressed.length,decodedBytes:snapshot.bytes.length,records:snapshot.records,functions:snapshot.keys.size,buildMs:Math.round(performance.now()-started),expectedScene,heightSamples};
fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2));console.log(JSON.stringify({...manifest,heightSamples:heightSamples.length}));
for(const old of fs.readdirSync(out))if(/^campus-[a-f0-9]{16}\.bin\.gz$/.test(old)&&old!==file)fs.unlinkSync(path.join(out,old));
}
if(process.argv.includes('--watch')){
 const {createInterface}=await import('node:readline/promises'),input=createInterface({input:process.stdin,output:process.stdout});
 while(true){try{await writeSnapshot();}catch(error){console.error(error);}if((await input.question('Snapshot encoding: Enter to retry, quit to exit. ')).trim()==='quit')break;}
 input.close();
}else await writeSnapshot();
