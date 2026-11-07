import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import crypto from 'node:crypto';
import ts from 'typescript';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'artifacts/family-terrain-test');
await fs.mkdir(out,{recursive:true});
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
for(const name of ['terrain','physics','buildingAppearance','observedAppearances','familyDormLandmark', 'engineering301303Site', 'livingScienceCourtyardSite', 'educationParkingSite', 'educationParkingTerrain', 'dining76Site', 'dining76Terrain', 'dining76EastSite', 'dining76EastTerrain', 'education101EntrySite', 'education101EntryTerrain', 'education12Site', 'education12Terrain', 'humanitiesGardenSite', 'humanitiesGardenTerrain']){
  let source=await fs.readFile(path.join(root,`src/${name}.ts`),'utf8');
  if(name==='familyDormLandmark'){
    const marker='    parts.push({ proxy, shown: true,';assert.ok(source.includes(marker));
    source=source.replace(marker,"    proxy.userData.auditGlassRange=[starts[2],glass.positions.length];\n"+marker);
  }
  const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/from '(\.\/[\w-]+)'/g,"from '$1.mjs'");
  await fs.writeFile(path.join(out,`${name}.mjs`),compiled);
}
const {createTerrain}=await import(pathToFileURL(path.join(out,'terrain.mjs')));
const {createFamilyDormLandmark}=await import(pathToFileURL(path.join(out,'familyDormLandmark.mjs')));
const {getBuildingAppearance}=await import(pathToFileURL(path.join(out,'buildingAppearance.mjs')));
const {Simulation}=await import(pathToFileURL(path.join(out,'physics.mjs')));
await RAPIER.init();
const rawTerrain=await fs.readFile(path.join(root,'public/data/terrain.json')),grid=JSON.parse(rawTerrain),data=JSON.parse(await fs.readFile(path.join(root,'public/data/campus.json'),'utf8'));
const notes=JSON.parse(await fs.readFile(path.join(root,'sources/family-terrain-refinement.json'),'utf8'));
const terrain=createTerrain(new THREE.Scene(),grid,data.buildings),vertices=terrain.vertices,indices=terrain.indices;
// 가족동 당시 입력에는 보조 303이 없었다. cut만 지우면 새 연결 구역이 켜지므로 건물도 제외한다.
const excludedHistoricalIds=['supplemental/snu-303'];
const noCutBuildings=structuredClone(data.buildings.filter(b=>!excludedHistoricalIds.includes(b.id)));for(const building of noCutBuildings)delete building.terrainCut;
// 가족동 당시에는 이후의 안마당과 주차장, 76동 계단 보정이 없었다. 실제 검사는 모든 보정을 적용한 현재 지형을 쓴다.
const historicalScope=createTerrain(new THREE.Scene(),grid,noCutBuildings,{livingScienceCourtyard:false,educationParking:false,dining76:false,dining76East:false,education101:false,education12:false,humanitiesGarden:false}),regions=historicalScope.heightAt.detailRegions;
const stepX=(grid.bounds.maxX-grid.bounds.minX)/(grid.width-1),stepZ=(grid.bounds.maxZ-grid.bounds.minZ)/(grid.height-1);
const refinedCells=new Set(notes.baseline.refinedCellIds),inDetail=(x,z)=>regions.some(q=>x>=q.minX&&x<=q.maxX&&z>=q.minZ&&z<=q.maxZ);
const ids=['way/439707895','way/439707894','way/439707893','way/439707892','way/409030550'];
const fixtures=ids.map((id,i)=>{
  const building=data.buildings.find(b=>b.id===id),scene=new THREE.Scene(),model=createFamilyDormLandmark(scene,building,getBuildingAppearance(building),terrain.heightAt);
  const shell=scene.children.find(o=>o.userData.role==='building-shell'),glass=shell.children.find(o=>o.name==='family-dorm-glazing').geometry.attributes.position.array;
  return {id,number:String(931+i),building,scene,model,shell,glass};
});
const results=[],metrics={};let failed=false;
function check(name,fn){try{const details=fn();results.push({name,status:'passed',...details});console.log(`PASS ${name}`);}catch(error){failed=true;results.push({name,status:'failed',error:error.message});console.error(`FAIL ${name}: ${error.message}`);}}

check('raw DEM and the no-cut family baseline retain all original exterior hashes',()=>{
  assert.equal(hash(rawTerrain),notes.baseline.terrainDataSha256);
  const masked=historicalScope.vertices.slice(0,notes.baseline.vertices*3);for(const i of notes.baseline.ignoredVertexIndices)masked[i*3+1]=0;
  assert.equal(hash(Buffer.from(masked.buffer)),notes.baseline.maskedOriginalVerticesSha256);
  const samples=[];for(let r=0;r<grid.height-1;r++)for(let c=0;c<grid.width-1;c++)if(!refinedCells.has(r*(grid.width-1)+c))samples.push(historicalScope.heightAt(grid.bounds.minX+(c+.37)*stepX,grid.bounds.minZ+(r+.63)*stepZ));
  assert.equal(samples.length,notes.baseline.outsideApiSampleCount);assert.equal(hash(Buffer.from(Float64Array.from(samples).buffer)),notes.baseline.outsideApiSha256);
  const sortedActual=regions.map(q=>Math.round((q.minZ-grid.bounds.minZ)/stepZ)*(grid.width-1)+Math.round((q.minX-grid.bounds.minX)/stepX)).sort((a,b)=>a-b);
  assert.deepEqual(sortedActual,notes.baseline.refinedCellIds);assert.equal(regions.length,67);
  let maximumFamilyDifference=0;for(const q of regions)for(let x=q.minX+.3;x<q.maxX;x+=1.3)for(let z=q.minZ+.7;z<q.maxZ;z+=1.7)maximumFamilyDifference=Math.max(maximumFamilyDifference,Math.abs(terrain.heightAt(x,z)-historicalScope.heightAt(x,z)));
  assert.equal(maximumFamilyDifference,0,'separate cut changed the existing family region');
  return metrics.exterior={rawDemSha256:hash(rawTerrain),outsideHeightQueries:samples.length,oldVertices:notes.baseline.vertices,noCutVertices:historicalScope.vertices.length/3,newVertices:vertices.length/3,oldTriangles:notes.baseline.triangles,newTriangles:indices.length/3,refinedCells:regions.length,maximumFamilyDifference,excludedHistoricalIds,historicalBuildingRows:noCutBuildings.length,scope:'The unchanged historical hashes use the original building rows without supplemental 303 or explicit terrainCut. Actual terrain must remain identical inside all 67 historical family cells; family glass, doors and physics use actual terrain.'};
});

const boundaryPoints=[];
check('terrain has shared closed edges and height samples follow the rendered triangles',()=>{
  const edges=new Map();let maximumError=0,minimumArea=Infinity,minimumFamilyArea=Infinity,checkedTriangles=0,maximumOffsetError=0;
  for(let i=0;i<indices.length;i+=3){const ids=[indices[i],indices[i+1],indices[i+2]],p=ids.map(id=>new THREE.Vector3().fromArray(vertices,id*3));
    const area=Math.abs((p[1].x-p[0].x)*(p[2].z-p[0].z)-(p[2].x-p[0].x)*(p[1].z-p[0].z))/2;minimumArea=Math.min(minimumArea,area);
    if(p.some(q=>inDetail(q.x,q.z)))minimumFamilyArea=Math.min(minimumFamilyArea,area);
    for(let j=0;j<3;j++){const a=ids[j],b=ids[(j+1)%3],key=a<b?`${a},${b}`:`${b},${a}`;edges.set(key,(edges.get(key)??0)+1);}
    for(const weights of [[1/3,1/3,1/3],[.2,.35,.45]]){const q=p[0].clone().multiplyScalar(weights[0]).addScaledVector(p[1],weights[1]).addScaledVector(p[2],weights[2]);maximumError=Math.max(maximumError,Math.abs(terrain.meshHeightAt(q.x,q.z)-q.y));if(inDetail(q.x,q.z))maximumOffsetError=Math.max(maximumOffsetError,Math.abs(terrain.heightAt(q.x,q.z)-q.y-.03));}
    checkedTriangles++;
  }
  let exteriorEdges=0;for(const[key,count]of edges){assert.ok(count===1||count===2);if(count===1){const[a,b]=key.split(',').map(Number),x=vertices[a*3],z=vertices[a*3+2],xx=vertices[b*3],zz=vertices[b*3+2];assert.ok(x===xx&&(x===grid.bounds.minX||x===grid.bounds.maxX)||z===zz&&(z===grid.bounds.minZ||z===grid.bounds.maxZ),'open interior mesh edge');exteriorEdges++;}}
  for(const cell of refinedCells){const c=cell%(grid.width-1),r=Math.floor(cell/(grid.width-1));for(const[dx,dz]of[[-1,0],[1,0],[0,-1],[0,1]])if(!refinedCells.has((r+dz)*(grid.width-1)+c+dx))boundaryPoints.push({x:grid.bounds.minX+(c+.5+dx*.5)*stepX,z:grid.bounds.minZ+(r+.5+dz*.5)*stepZ,dx,dz});}
  // 가족동의 기존 격자 면적 기준은 유지한다. 주차장 경계의 좁은 절단 면은 별도로 퇴화를 검사한다.
  assert.ok(maximumError<.0001);assert.ok(maximumOffsetError<.0001);assert.ok(minimumFamilyArea>.1);assert.ok(Number.isFinite(minimumArea)&&minimumArea>0);
  return metrics.mesh={checkedTriangles,maximumError,maximumOffsetError,minimumArea,minimumFamilyArea,minimumAreaScope:'All terrain triangles remain nondegenerate. The original 0.1m2 minimum remains required in the unchanged family refinement; the parking correction uses narrower clipped triangles.',exteriorEdges,boundarySegments:boundaryPoints.length};
});

check('Rapier terrain matches the surface and capsules cross local mesh boundaries',()=>{
  const world=new RAPIER.World({x:0,y:-18,z:0});world.createCollider(RAPIER.ColliderDesc.trimesh(vertices,indices));world.step();
  try{
    const points=[];for(const q of regions)for(let x=q.minX+.63;x<q.maxX;x+=3.7)for(let z=q.minZ+.47;z<q.maxZ;z+=3.9)points.push([x,z]);
    for(const p of boundaryPoints)for(const e of[-.001,.001])points.push([p.x+p.dx*e,p.z+p.dz*e]);
    let maximumError=0;for(const[x,z]of points){const y=terrain.meshHeightAt(x,z),hit=world.castRay(new RAPIER.Ray({x,y:y+20,z},{x:0,y:-1,z:0}),40,true);assert.ok(hit);maximumError=Math.max(maximumError,Math.abs(hit.timeOfImpact-20));}assert.ok(maximumError<.0005);
    const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0,1000,0)),shape=world.createCollider(RAPIER.ColliderDesc.capsule(.5,.35),body),controller=world.createCharacterController(.02);
    controller.enableAutostep(.38,.25,false);controller.enableSnapToGround(.25);controller.setMaxSlopeClimbAngle(Math.PI/4);
    const crossings=[];for(const p of boundaryPoints){if(crossings.length>=32)break;let grade=0,previous=null;for(let k=-8;k<=8;k++){const y=terrain.meshHeightAt(p.x+p.dx*k*.5,p.z+p.dz*k*.5);if(previous!==null)grade=Math.max(grade,Math.abs(y-previous)/.5);previous=y;}if(grade>.4)continue;
      for(const sign of[-1,1]){const start={x:p.x-p.dx*4*sign,z:p.z-p.dz*4*sign};body.setTranslation({x:start.x,y:terrain.meshHeightAt(start.x,start.z)+.87,z:start.z},true);body.setNextKinematicTranslation(body.translation());world.step();let stall=0,maximumStall=0;
        for(let i=0;i<80;i++){const pos=body.translation();controller.computeColliderMovement(shape,{x:p.dx*.1*sign,y:-.03,z:p.dz*.1*sign});const move=controller.computedMovement();stall=move.x*p.dx*sign+move.z*p.dz*sign<.005?stall+1:0;maximumStall=Math.max(maximumStall,stall);body.setNextKinematicTranslation({x:pos.x+move.x,y:pos.y+move.y,z:pos.z+move.z});world.step();}
        const end=body.translation(),progress=(end.x-start.x)*p.dx*sign+(end.z-start.z)*p.dz*sign,clearance=end.y-terrain.meshHeightAt(end.x,end.z)-.85;crossings.push({...p,sign,grade,progress,clearance,maximumStall});assert.ok(progress>4.35&&maximumStall<3&&clearance>-.06&&clearance<.25,'capsule stopped or fell at a mesh boundary');
      }
    }assert.equal(crossings.length,32);return metrics.physics={rays:points.length,maximumError,crossings};
  }finally{world.free();}
});

check('all actual family glass triangles and entrance heads clear the terrain',()=>{
  const buildings=[];let totalSamples=0;
  for(const f of fixtures){let samples=0,minimumClearance=Infinity,minimumHeadroom=Infinity,worst=null;const entrances=[];
    for(const part of f.model.breakables){const[start,end]=part.mesh.userData.auditGlassRange;if(start===end)continue;let partMin=Infinity,top=-Infinity,maxTerrain=-Infinity;
      for(let i=start;i<end;i+=9){const p=[0,1,2].map(k=>new THREE.Vector3().fromArray(f.glass,i+k*3));top=Math.max(top,...p.map(v=>v.y));for(let u=0;u<=8;u++)for(let v=0;v<=8-u;v++){const q=p[0].clone().multiplyScalar(1-(u+v)/8).addScaledVector(p[1],u/8).addScaledVector(p[2],v/8),ground=terrain.meshHeightAt(q.x,q.z),clearance=q.y-ground;samples++;partMin=Math.min(partMin,clearance);maxTerrain=Math.max(maxTerrain,ground);if(clearance<minimumClearance){minimumClearance=clearance;worst={x:q.x,y:q.y,z:q.z,ground,component:part.mesh.userData.component};}}}
      if(part.mesh.userData.component==='stair-entry-wall'){const headroom=top-maxTerrain;minimumHeadroom=Math.min(minimumHeadroom,headroom);entrances.push({position:part.mesh.position.toArray(),clearance:partMin,headroom});}
    }
    totalSamples+=samples;buildings.push({number:f.number,samples,minimumClearance,minimumHeadroom,worst,entrances});
  }
  metrics.glass={totalSamples,buildings};assert.equal(totalSamples,134100);for(const b of buildings){assert.ok(b.minimumClearance>=0,`${b.number} glass penetrates the terrain`);assert.ok(b.minimumHeadroom>1.74,`${b.number} visual doorway is shorter than the 1.7 m capsule plus 0.04 m clearance`);}
  return {totalSamples,minimumGlassClearance:Math.min(...buildings.map(b=>b.minimumClearance)),minimumDoorHeadroom:Math.min(...buildings.map(b=>b.minimumHeadroom))};
});

const fullSource=await fs.readFile(path.join(root,'src/fullCampus.ts'),'utf8'),start=fullSource.indexOf('  function ribbon(points:'),roadSource=fullSource.slice(start,fullSource.indexOf('  for (const road of data.roads) {',start));
const roadJS=ts.transpileModule(roadSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const makeRoad=new Function('heightAt','road',`const pathPositions=[],roadPositions=[];${roadJS};const out=road.drivable?roadPositions:pathPositions;ribbon(road.points,Math.max(1.3,road.width),out,road.drivable?.14:.12);return Float32Array.from(out);`);
check('local road triangles clear the terrain without refining distant roads',()=>{
  const familySampler=Object.assign((x,z)=>terrain.heightAt(x,z),{detailRegions:regions,roadDetailRegions:historicalScope.heightAt.roadDetailRegions,sampleStep:terrain.heightAt.sampleStep});
  const familyTriangles=positions=>{const selected=[];for(let i=0;i<positions.length;i+=9)if([0,3,6].some(k=>inDetail(positions[i+k],positions[i+k+2])))selected.push(...positions.slice(i,i+9));return Float32Array.from(selected);};
  let trianglesBefore=0,trianglesAfter=0,changedRoads=0,unchangedRoads=0,samples=0,minimumClearance=Infinity,actualFamilyTriangles=0;const roads=[];
  for(const road of data.roads){if(road.points.length<2)continue;const before=makeRoad((x,z)=>terrain.heightAt(x,z),road),after=makeRoad(familySampler,road),actual=makeRoad(terrain.heightAt,road),actualFamily=familyTriangles(actual);assert.deepEqual(actualFamily,familyTriangles(after),`actual road changed inside historical family cells: ${road.id}`);actualFamilyTriangles+=actualFamily.length/9;trianglesBefore+=before.length/9;trianglesAfter+=after.length/9;if(before.length!==after.length)changedRoads++;else{unchangedRoads++;assert.deepEqual(after,before);}
    let count=0,minimum=Infinity,worst=null;for(let i=0;i<after.length;i+=9){const p=[0,1,2].map(k=>new THREE.Vector3().fromArray(after,i+k*3));if(!p.some(q=>inDetail(q.x,q.z)))continue;for(let u=0;u<=5;u++)for(let v=0;v<=5-u;v++){const q=p[0].clone().multiplyScalar(1-(u+v)/5).addScaledVector(p[1],u/5).addScaledVector(p[2],v/5);if(!inDetail(q.x,q.z))continue;const clearance=q.y-terrain.meshHeightAt(q.x,q.z);count++;if(clearance<minimum){minimum=clearance;worst=q.toArray();}}}
    if(count){roads.push({id:road.id,drivable:road.drivable,samples:count,minimumClearance:minimum,worst});samples+=count;minimumClearance=Math.min(minimumClearance,minimum);}
  }
  metrics.roads={trianglesBefore,trianglesAfter,changedRoads,unchangedRoads,samples,minimumClearance,roads};assert.ok(samples>10000);assert.ok(minimumClearance>0,'road triangle interiors enter the terrain');assert.ok(changedRoads<30,'detail accidentally affects too many roads');
  return {trianglesBefore,trianglesAfter,changedRoads,unchangedRoads,samples,minimumClearance,actualFamilyTriangles,scope:'Family refinement retains the existing road-count limit. Actual rendered road triangles inside all 67 family cells must match this isolated family refinement exactly; the independently audited 301/303 correction is not counted as a family road change.'};
});

check('fine and coarse road ends share actual vertices and transition interiors clear terrain',()=>{
  const auditedRoadJS=roadJS.replaceAll('destination.push(', 'auditPush(destination,{i,a,b,nx,nz,detailed:detailed[i],previousDetailed:detailed[i-1]??false,nextDetailed:detailed[i+1]??false},');
  const auditRoad=new Function('heightAt','road',`const pathPositions=[],roadPositions=[],segments=new Map();function auditPush(destination,meta,...values){let record=segments.get(meta.i);if(!record){record={...meta,start:destination.length,end:0};segments.set(meta.i,record);}destination.push(...values);record.end=destination.length;}${auditedRoadJS};const out=road.drivable?roadPositions:pathPositions;ribbon(road.points,road.centralLine?.15:Math.max(1.3,road.width),out,road.centralLine?.18:road.drivable?.14:.12);return{positions:Float32Array.from(out),segments};`);
  let sharedEnds=0,sharedVertices=0,maximumSeamError=0,transitionSamples=0,minimumClearance=Infinity,worst=null,fineSamples=0,minimumFineClearance=Infinity;
  const surfaces=data.roads.flatMap(road=>road.drivable&&road.width>=6?[road,{...road,centralLine:true}]:[road]);
  for(const road of surfaces){if(road.points.length<2)continue;const {positions,segments}=auditRoad(terrain.heightAt,road);
    for(const segment of segments.values()){
      if(segment.detailed){
        for(let k=segment.start;k<segment.end;k+=9){const p=[0,1,2].map(j=>new THREE.Vector3().fromArray(positions,k+j*3));for(let u=0;u<=5;u++)for(let v=0;v<=5-u;v++){const q=p[0].clone().multiplyScalar(1-(u+v)/5).addScaledVector(p[1],u/5).addScaledVector(p[2],v/5);fineSamples++;minimumFineClearance=Math.min(minimumFineClearance,q.y-terrain.meshHeightAt(q.x,q.z));}}
        continue;
      }
      if(!segment.previousDetailed&&!segment.nextDetailed)continue;
      const dx=segment.b[0]-segment.a[0],dz=segment.b[1]-segment.a[1],length=Math.hypot(dx,dz);
      for(const end of[0,1]){
        if(!(end?segment.nextDetailed:segment.previousDetailed))continue;
        const center=end?segment.b:segment.a,other=segments.get(segment.i+(end?1:-1)),coarse=[];assert.ok(other?.detailed);const edgeDX=other.b[0]-other.a[0],edgeDZ=other.b[1]-other.a[1],edgeLength=Math.hypot(edgeDX,edgeDZ);
        for(let k=segment.start;k<segment.end;k+=3)coarse.push([positions[k],positions[k+1],positions[k+2]]);
        let count=0;for(let k=other.start;k<other.end;k+=3){const x=positions[k],y=positions[k+1],z=positions[k+2];if(Math.abs((x-center[0])*edgeDX+(z-center[1])*edgeDZ)/edgeLength>.0001)continue;
          const match=coarse.find(p=>Math.hypot(p[0]-x,p[2]-z)<.0001);assert.ok(match,'fine road end has no matching coarse vertex');maximumSeamError=Math.max(maximumSeamError,Math.abs(y-match[1]));count++;
        }assert.ok(count>=3,JSON.stringify({road:road.id,segment:segment.i,end,count,coarse:[segment.a,segment.b],fine:[other.a,other.b]}));sharedEnds++;sharedVertices+=count;
      }
      for(let k=segment.start;k<segment.end;k+=9){const p=[0,1,2].map(j=>new THREE.Vector3().fromArray(positions,k+j*3));for(let u=0;u<=10;u++)for(let v=0;v<=10-u;v++){
        const q=p[0].clone().multiplyScalar(1-(u+v)/10).addScaledVector(p[1],u/10).addScaledVector(p[2],v/10),clearance=q.y-terrain.meshHeightAt(q.x,q.z);transitionSamples++;if(clearance<minimumClearance){minimumClearance=clearance;worst={road:road.id,x:q.x,y:q.y,z:q.z};}
      }}
    }
  }
  metrics.roadTransitions={sharedEnds,sharedVertices,maximumSeamError,transitionSamples,minimumClearance,worst,fineSamples,minimumFineClearance};assert.ok(sharedEnds>=4);assert.ok(minimumFineClearance>0,'detailed road triangle enters terrain outside the refined terrain boundary');assert.ok(maximumSeamError<.0001);assert.ok(minimumClearance>0,'road transition triangle enters terrain');
  return metrics.roadTransitions;
});

check('the corrected road centre and both edges avoid the former steep boundary ramp',()=>{
  let samples=0,maximumGrade=0,worst=null;
  for(const road of data.roads){if(!road.drivable)continue;for(let i=0;i<road.points.length-1;i++){
    const a=road.points[i],b=road.points[i+1],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<.01)continue;
    const n=Math.ceil(length),nx=-dz/length*road.width/2,nz=dx/length*road.width/2;
    for(const lateral of[-1,0,1]){let previous=null;for(let j=0;j<=n;j++){
      const x=a[0]+dx*j/n+nx*lateral,z=a[1]+dz*j/n+nz*lateral;if(!inDetail(x,z)){previous=null;continue;}
      const y=terrain.meshHeightAt(x,z);samples++;if(previous!==null){const grade=Math.abs(y-previous)/(length/n);if(grade>maximumGrade){maximumGrade=grade;worst={road:road.id,x,z,lateral};}}previous=y;
    }}
  }}
  metrics.roadGrade={samples,maximumGrade,maximumAngleDegrees:Math.atan(maximumGrade)*180/Math.PI,worst};assert.ok(samples>500);assert.ok(maximumGrade<.45,'localized terrain refinement creates a steep road ramp');return metrics.roadGrade;
});

check('closed entrance walls block walking and destroyed walls allow the actual capsule through',()=>{
  const doors=[];
  for(const f of fixtures){const axis=f.shell.userData.axis,normal=new THREE.Vector3(-axis.z,0,axis.x).multiplyScalar(f.shell.userData.frontSign),sim=new Simulation(f.model.breakables,[],new THREE.Vector3(950,70,60),data.bounds,terrain);
    try{for(const target of sim.targets.filter(t=>t.mesh.userData.component==='stair-entry-wall')){
      sim.reset();const start=target.mesh.position.clone().addScaledVector(normal,2.2),spawn=new THREE.Vector3(start.x,terrain.heightAt(start.x,start.z)+1.7,start.z),direction=normal.clone().negate();
      function walk(){sim.teleport(spawn);for(let j=0;j<120;j++)sim.step(1/60,direction.x*2,direction.z*2,false);const end=sim.player.translation();return {progress:(end.x-start.x)*direction.x+(end.z-start.z)*direction.z,groundGap:end.y-.85-terrain.meshHeightAt(end.x,end.z)};}
      const closed=walk();sim.hit(target,target.toughness+1,direction);const open=walk();doors.push({building:f.number,position:target.mesh.position.toArray(),closed,afterDestruction:open});
      assert.ok(closed.progress<2,'closed entrance wall did not block the capsule');assert.ok(open.progress>3.5&&open.groundGap>-.04&&open.groundGap<.3,'capsule cannot cross the destroyed entrance wall');
    }}finally{sim.world.free();}
  }
  metrics.doors=doors;assert.equal(doors.length,20);return {doors:doors.length,capsuleHeight:1.7,closedWallsBlock:true,destroyedWallsPass:true};
});

const report={scope:'Node geometry and Rapier tests only. No real browser, mobile device, or photo validation.',results,metrics};
await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2)+'\n');
if(failed)process.exitCode=1;else console.log(`${results.length}/${results.length} checks passed`);
