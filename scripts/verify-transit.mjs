import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import * as T from 'three';
import {OBB} from 'three/addons/math/OBB.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');process.chdir(root);
const out=path.join(root,'artifacts/transit-test');await fs.mkdir(out,{recursive:true});
const source=await fs.readFile('src/traffic.ts','utf8'),hash=s=>createHash('sha256').update(s).digest('hex');
const hashes={'src/traffic.ts':hash(source),'src/transitTypes.ts':hash(await fs.readFile('src/transitTypes.ts'))};
await fs.writeFile(path.join(out,'traffic.mjs'),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
const {Traffic}=await import(pathToFileURL(path.join(out,'traffic.mjs')));
const results=[],worlds=[],far=new T.Vector3(5000,0,5000);
const setup=(roads,plan,heightAt=()=>0)=>{const scene=new T.Scene(),traffic=new Traffic(scene,roads,heightAt,plan);worlds.push(traffic);return{scene,traffic};};
const route=(segments,extra={})=>({id:'test',label:'5511',service:'route-bus',segments,stops:[],operation:'boundary',sources:['https://example.invalid/synthetic-fixture'],...extra});
const ref=(roadId,segmentIndex=0,direction=1)=>({roadId,segmentIndex,direction});
const isolate=traffic=>{for(const v of traffic.vehicles)if(v.kind!=='bus')v.alive=false;return traffic.vehicles.find(v=>v.kind==='bus');};
const check=(name,run)=>{try{const details=run();results.push({name,status:'PASS',...details});console.log('PASS '+name);}catch(e){results.push({name,status:'FAIL',error:e.message});console.error('FAIL '+name+' '+e.message);}};
try{
check('ordered stops dwell without overshoot and closed route returns continuously',()=>{
 const roads=[{id:'loop',points:[[0,0],[0,100],[120,100],[120,0],[0,0]],width:10,oneway:true,kind:'service'}],plan={routes:[route([0,1,2,3].map(i=>ref('loop',i)),{operation:'loop',stops:[{stopId:'A',routeSegmentIndex:0,distance:35,dwellSeconds:1.2},{stopId:'B',routeSegmentIndex:2,distance:60,dwellSeconds:.9}]})]};
 const {traffic}=setup(roads,plan),initial=traffic.minimapPositions(),bus=isolate(traffic),visits=[];let oldStop,last=bus.position.clone(),maxStep=0,held=0,stopPoint=null;
 for(let tick=0;tick<3200;tick++){
  traffic.update(.05,far);maxStep=Math.max(maxStep,bus.position.distanceTo(last));last.copy(bus.position);
  if(bus.transit.lastStop!==oldStop){if(oldStop)assert.ok(held>=.8);oldStop=bus.transit.lastStop;held=0;stopPoint=bus.position.clone();if(oldStop)visits.push(oldStop);}
  if(bus.waiting>0){assert.equal(bus.speed,0);assert.ok(bus.position.distanceTo(stopPoint)<1e-7);held+=.05;}
 }
 assert.deepEqual(visits.slice(0,4),['A','B','A','B']);assert.ok(bus.transit.laps>=2);assert.ok(maxStep<.5);traffic.reset();assert.deepEqual(traffic.minimapPositions(),initial);
 return{visits,laps:bus.transit.laps,maxStep,initialFleet:initial.length};
});
check('boundary waits on camera-visible endpoints and off-map buses neither collide nor resurrect',()=>{
 const roads=[{id:'out',points:[[0,0],[0,200]],width:10,oneway:true}],plan={routes:[route([ref('out')])]};const {traffic}=setup(roads,plan),bus=isolate(traffic),nearExit=new T.Vector3(100,0,200),nearEntry=new T.Vector3(100,0,0);
 for(let i=0;i<700;i++)traffic.update(.1,nearExit);
 assert.equal(bus.transit.phase,'terminal');assert.equal(bus.inMap,true);assert.ok(Math.abs(bus.position.z-200)<1e-7);
 traffic.update(.1,far);assert.equal(bus.transit.phase,'outside');assert.equal(bus.inMap,false);assert.equal(traffic.minimapPositions().length,0);assert.equal(traffic.collisionStates().length,0);assert.equal(traffic.raycast(bus.position.clone().add(new T.Vector3(0,1,0)),new T.Vector3(1,0,0),1),null);
 for(let i=0;i<150;i++)traffic.update(.1,nearEntry);assert.equal(bus.transit.phase,'outside');
 traffic.update(.1,far);assert.equal(bus.transit.phase,'driving');assert.equal(bus.inMap,true);assert.ok(bus.position.z<1e-6);
 assert.equal(traffic.explode(bus.position.clone().add(new T.Vector3(0,1,0)),.1),1);for(let i=0;i<1200;i++)traffic.update(.1,far);assert.equal(bus.alive,false);assert.equal(traffic.minimapPositions().length,0);assert.equal(traffic.initialVehicleCount,20);traffic.reset();assert.equal(traffic.minimapPositions().length,20);
 return{outsideIntervalSeconds:12,destroyedStaysAbsent:true};
});
check('invalid direction, disconnected path, stop position, and unapproved width are rejected',()=>{
 const roads=[{id:'one',points:[[0,0],[0,100]],width:10,oneway:true},{id:'apart',points:[[100,0],[100,100]],width:10},{id:'narrow',points:[[0,100],[0,200]],width:5.5}],cases=[route([ref('one',0,-1)]),route([ref('one'),ref('apart')]),route([ref('one')],{stops:[{stopId:'bad',routeSegmentIndex:0,distance:101,dwellSeconds:2}]}),route([ref('narrow')]),route([ref('one')],{operation:'loop'})];
 for(const r of cases)assert.throws(()=>setup(roads,{routes:[r]}),/Transit/);
 const {traffic}=setup(roads,{routes:[route([{...ref('narrow'),allowNarrow:true}])]});assert.ok(traffic.vehicles.some(v=>v.kind==='bus'));
 const {traffic:generic}=setup(roads,undefined);assert.ok(generic.vehicles.filter(v=>v.kind==='bus').every(v=>v.edge.width>=6));
 return{rejected:cases.length,authorizedNarrowWidth:5.5,genericBusMinimumWidth:6};
});
check('duplicate road aliases preserve source segment identity and one-way restrictions',()=>{
 const roads=[{id:'original',points:[[0,0],[0,100]],width:10,nodeIds:[1,2]},{id:'alias',points:[[0,100],[0,0]],width:10,nodeIds:[2,1],oneway:true}];
 const {traffic}=setup(roads,{routes:[route([ref('alias')])]});const bus=isolate(traffic);assert.equal(bus.edge.a.id,'n:2');assert.equal(bus.edge.b.id,'n:1');assert.throws(()=>setup(roads,{routes:[route([ref('alias',0,-1)])]}),/unavailable/);return{sourceRoadAlias:'alias',sharedDirectedEdges:traffic.edges.length};
});
check('shuttle shares bus batches and atlas while taxi and private-car counts remain fixed',()=>{
 const roads=[{id:'road',points:[[0,0],[0,1000]],width:10}],plan={routes:[route([ref('road')]),route([ref('road',0,-1)],{id:'school',label:'교내 순환',service:'shuttle'})]}, {scene,traffic}=setup(roads,plan),positions=traffic.minimapPositions(),parts=[];scene.traverse(o=>{if(o.isInstancedMesh)parts.push(o);});
 assert.equal(positions.filter(v=>v.service==='taxi').length,12);assert.equal(positions.filter(v=>v.service==='private').length,7);assert.equal(positions.filter(v=>v.service==='shuttle').length,1);assert.equal(parts.length,14);
 const board=parts.find(o=>o.name==='traffic-bus-route-board'),body=parts.find(o=>o.name==='traffic-bus-body'),shuttle=traffic.vehicles.find(v=>v.service==='shuttle');assert.deepEqual(board.userData.routeLabels,['5511','SNU 셔틀']);assert.equal(board.material.map.image.height,128);assert.equal(board.geometry.attributes.instanceRoute.getX(shuttle.slot),1);assert.equal(body.geometry.attributes.instanceShuttle.getX(shuttle.slot),1);
 for(const p of parts)assert.equal(p.geometry.attributes.position.count>0,true);
 const shader={vertexShader:'#include <uv_vertex>',fragmentShader:''};board.material.onBeforeCompile(shader);assert.ok(shader.vertexShader.includes('/2.0'));
 let pixels=0;const texture=board.material.map.image;for(let i=256*64*4;i<texture.data.length;i+=4)if(texture.data[i]>100)pixels++;assert.ok(pixels>1000);
 return{drawCalls:parts.length,atlasRows:2,shuttleInkPixels:pixels,fleet:positions.length,taxis:12,privateCars:7};
});
check('confirmed 5.5m segment queues opposing buses without overlapping rendered envelopes',()=>{
 const roads=[{id:'south',points:[[0,0],[0,70]],width:10},{id:'narrow',points:[[0,70],[0,170]],width:5.5},{id:'north',points:[[0,170],[0,240]],width:10}];
 const plan={routes:[route([ref('south'),{...ref('narrow'),allowNarrow:true},ref('north')],{id:'up'}),route([ref('north',0,-1),{...ref('narrow',0,-1),allowNarrow:true},ref('south',0,-1)],{id:'down'})]};
 const {traffic}=setup(roads,plan);for(const v of traffic.vehicles)if(v.kind!=='bus')v.alive=false;
 const buses=traffic.vehicles.filter(v=>v.kind==='bus'),bounds=new T.Box3();for(const part of traffic.fleets.bus.parts){part.mesh.geometry.computeBoundingBox();bounds.union(part.mesh.geometry.boundingBox);}const center=bounds.getCenter(new T.Vector3()),half=bounds.getSize(new T.Vector3()).multiplyScalar(.5),matrix=new T.Matrix4();let paused=0,minimum=Infinity;
 for(let i=0;i<650;i++){
  traffic.update(.1,new T.Vector3(300,0,120));const obbs=buses.map(v=>{matrix.compose(v.position,v.quaternion,new T.Vector3(1,1,1));return new OBB(center.clone(),half.clone()).applyMatrix4(matrix);});assert.equal(obbs[0].intersectsOBB(obbs[1],0),false,'opposing render envelopes overlap');
  if(buses.some(v=>v.transit.phase==='driving'&&v.speed===0&&v.waiting===0))paused++;
  minimum=Math.min(minimum,buses[0].position.distanceTo(buses[1].position));
 }
 assert.ok(paused>10);assert.ok(buses.every(v=>v.transit.phase==='terminal'));
 const waitingPlan={routes:[route([{...ref('single'),allowNarrow:true}],{id:'first',stops:[{stopId:'long-dwell',routeSegmentIndex:0,distance:100,dwellSeconds:60}]}),route([{...ref('single',0,-1),allowNarrow:true}],{id:'opposite'})]};
 const {traffic:queued}=setup([{id:'single',points:[[0,0],[0,250]],width:5.5}],waitingPlan);for(const v of queued.vehicles)if(v.kind!=='bus')v.alive=false;const queuedBuses=queued.vehicles.filter(v=>v.kind==='bus');assert.equal(queuedBuses[1].inMap,false);
 for(let i=0;i<350;i++){queued.update(.1,far);assert.equal(queuedBuses[1].inMap,false,'opposite boundary bus reentered an occupied narrow corridor');}
 assert.ok(queuedBuses[0].waiting>0);return{boundaryQueueHeldSeconds:35,sampledPairs:650,pausedFrames:paused,minimumCentreDistance:minimum,renderEnvelopeWidth:half.x*2,nominalNarrowWidth:5.5,straightBodyEdgeClearance:2.75-1.265-1.225,mirrorOverhangAtNominalEdge:Math.max(0,1.265+half.x-2.75),note:'The source width is approximate. Mirror overhang is recorded, not hidden by changing road data.'};
});
if(!process.argv.includes('--fixtures')){
 for(const f of ['public/data/campus.json','public/data/campus-transit.json','public/data/terrain.json'])hashes[f]=hash(await fs.readFile(f));
 for(const name of ['terrain','engineering301303Site', 'livingScienceCourtyardSite', 'educationParkingSite', 'educationParkingTerrain', 'dining76Site', 'dining76Terrain', 'dining76EastSite', 'dining76EastTerrain', 'education101EntrySite', 'education101EntryTerrain', 'education12Site', 'education12Terrain', 'humanitiesGardenSite', 'humanitiesGardenTerrain']){const file='src/'+name+'.ts',text=await fs.readFile(file,'utf8');hashes[file]=hash(text);await fs.writeFile(path.join(out,name+'.mjs'),ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/from (['"])(\.\/[\w-]+)\1/g,"from '$2.mjs'"));}
 const {createTerrain}=await import(pathToFileURL(path.join(out,'terrain.mjs')));
 const data=JSON.parse(await fs.readFile('public/data/campus.json','utf8')),plan=JSON.parse(await fs.readFile('public/data/campus-transit.json','utf8')),dem=JSON.parse(await fs.readFile('public/data/terrain.json','utf8')),terrain=createTerrain(new T.Scene(),dem,data.buildings);
 check('actual confirmed campus plan compiles and all service vehicles follow it',()=>{
  const {traffic}=setup([...data.roads,...(plan.supplementalRoads??[])],plan,terrain.heightAt),buses=traffic.vehicles.filter(v=>v.kind==='bus');assert.ok(buses.some(v=>v.service==='shuttle'));assert.ok(buses.some(v=>v.service==='route-bus'));const expected=plan.routes.reduce((n,r)=>n+(r.vehicleCount??1),0);assert.equal(buses.length,expected);assert.equal(traffic.initialVehicleCount,19+expected);
  const travel=new Map(buses.map(v=>[v.id,0])),visited=new Map(buses.map(v=>[v.id,[]]));
  const original=traffic.minimapPositions();let minimumInitialSeparation=Infinity;for(let a=0;a<buses.length;a++)for(let b=a+1;b<buses.length;b++){if(buses[a].inMap===false||buses[b].inMap===false)continue;const distance=buses[a].position.distanceTo(buses[b].position);minimumInitialSeparation=Math.min(minimumInitialSeparation,distance);assert.ok(distance>(buses[a].length+buses[b].length)/2+5,'initial buses overlap');}let maxStep=0;for(let tick=0;tick<3000;tick++){const previous=new Map(traffic.vehicles.map(v=>[v.id,{p:v.position.clone(),active:v.inMap!==false,phase:v.transit?.phase}]));traffic.update(.1,far);for(const v of buses){const before=previous.get(v.id);assert.ok(v.edge.allowed);assert.ok(v.edge.width>=5.5);assert.ok(Math.abs(v.position.y-terrain.heightAt(v.position.x,v.position.z)-.06)<1e-7);const visits=visited.get(v.id);if(v.transit.lastStop&&visits.at(-1)!==v.transit.lastStop)visits.push(v.transit.lastStop);if(before.active&&v.inMap!==false&&!(before.phase==='outside')){travel.set(v.id,travel.get(v.id)+v.position.distanceTo(before.p));maxStep=Math.max(maxStep,v.position.distanceTo(before.p));assert.ok(v.position.distanceTo(before.p)<1.1,'planned bus teleported in map');}}}
  for(const bus of buses)assert.ok(travel.get(bus.id)>20,'service bus did not progress: '+bus.transit.route.definition.id);
  traffic.reset();assert.deepEqual(traffic.minimapPositions(),original);return{routeCount:plan.routes.length,buses:buses.length,vehicles:traffic.initialVehicleCount,seconds:300,minimumInitialSeparation,maxFrameTravel:maxStep,services:buses.map(v=>({id:v.transit.route.definition.id,service:v.service,lap:v.transit.laps,lastStop:v.transit.lastStop,travelled:travel.get(v.id),visitedStops:visited.get(v.id)}))};
 });
 check('each actual directed route completes its full ordered stop sequence on the real terrain',()=>{
  const trips=[];
  for(const definition of plan.routes){
   const {traffic}=setup([...data.roads,...(plan.supplementalRoads??[])],{routes:[{...definition,vehicleCount:1}]},terrain.heightAt),bus=isolate(traffic),visits=[];
   const maxFrames=Math.ceil((bus.transit.route.length/1.5+definition.stops.reduce((n,s)=>n+s.dwellSeconds,0)+60)*10);
   let frames=0,maxStep=0;
   for(;frames<maxFrames;frames++){
    const previous=bus.position.clone(),stop=bus.transit.stopIndex;traffic.update(.1,far);maxStep=Math.max(maxStep,bus.position.distanceTo(previous));
    if(bus.transit.stopIndex>stop)for(let i=stop;i<bus.transit.stopIndex;i++)visits.push(bus.transit.route.stops[i].stopId);
    if(bus.transit.phase==='terminal'||bus.transit.laps>0)break;
   }
   assert.ok(frames<maxFrames,'route never reaches its terminal: '+definition.id);assert.deepEqual(visits,definition.stops.map(s=>s.stopId),definition.id+' ordered stops differ');assert.ok(maxStep<1.1,definition.id+' contains a discontinuity');
   trips.push({id:definition.id,stops:visits.length,travelSeconds:frames/10,length:bus.transit.route.length,maxStep});
   traffic.dispose();
  }
  return{trips,scope:'One isolated service bus per confirmed direction, with actual DEM. Mixed-fleet progress is checked separately.'};
 });

}
}finally{for(const traffic of worlds)traffic.dispose();}
const sourceMatches={};for(const[f,h]of Object.entries(hashes))sourceMatches[f]=hash(await fs.readFile(f))===h;const sourceStillMatches=Object.values(sourceMatches).every(Boolean);assert.ok(sourceStillMatches);
await fs.writeFile(path.join(out,process.argv.includes('--fixtures')?'fixture-results.json':'results.json'),JSON.stringify({scope:'Node traffic state and source geometry. No browser GPU, hardware FPS, or real-time timetable validation.',hashes,sourceMatches,sourceStillMatches,results},null,2)+'\n');
if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
