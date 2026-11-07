import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import ts from 'typescript';
import * as THREE from 'three';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),output=path.join(root,'artifacts/distant-test');
await fs.mkdir(output,{recursive:true});
for(const file of await fs.readdir(path.join(root,'src'))){
  if(!file.endsWith('.ts'))continue;
  const source=await fs.readFile(path.join(root,'src',file),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  await fs.writeFile(path.join(output,file.replace(/\.ts$/,'.mjs')),compiled.replace(/from (['"])(\.\/[\w-]+)\1/g,"from '$2.mjs'"));
}
const calls=new Set(['fillRect','clearRect','beginPath','closePath','moveTo','lineTo','arc','ellipse','stroke','fill','fillText','strokeText','roundRect','save','restore','translate','rotate','scale','quadraticCurveTo','bezierCurveTo','setTransform']);
globalThis.document={createElement(tag){assert.equal(tag,'canvas');const context=new Proxy({},{get(o,k){if(k==='measureText')return s=>({width:String(s).length*20});if(k==='createLinearGradient'||k==='createRadialGradient')return()=>({addColorStop(){}});return calls.has(k)?()=>{}:o[k];},set(o,k,v){o[k]=v;return true;}});return{width:0,height:0,getContext(){return context;}};}};
const {createFullCampus}=await import(pathToFileURL(path.join(output,'fullCampus.mjs')));
const {createTerrain}=await import(pathToFileURL(path.join(output,'terrain.mjs')));
const results=[];
const check=(name,run)=>{const detail=run();results.push({name,status:'passed',...detail});console.log(`PASS ${name} ${JSON.stringify(detail??{})}`);};
const inside=([x,z],points)=>{let yes=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
const bodyContains=(point,b)=>inside(point,b.points)&&!b.holes.some(h=>inside(point,h));
const baseRing=[[-32,-24],[32,-24],[32,24],[-32,24],[-32,-24]],hole=[[-12,-10],[12,-10],[12,10],[-12,10],[-12,-10]];
const rotate=(p,cx,cz)=>{const a=.47;return[cx+p[0]*Math.cos(a)-p[1]*Math.sin(a),cz+p[0]*Math.sin(a)+p[1]*Math.cos(a)];};
const buildings=[0,1,2,3].map(i=>{const cx=302+(i%2)*75,cz=1000+Math.floor(i/2)*100;return{id:`synthetic/${i}`,name:`Fixture ${i}`,ref:'',kind:'yes',points:(i&1?baseRing.toReversed():baseRing).map(p=>rotate(p,cx,cz)),holes:[(i&2?hole.toReversed():hole).map(p=>rotate(p,cx,cz))],height:12,levels:3,heightEstimated:true,levelsEstimated:true};});
const data={origin:{lat:0,lon:0},bounds:{minX:-200,maxX:1000,minZ:700,maxZ:1400},boundary:[],buildings,roads:[],areas:[],stops:[]};
const scene=new THREE.Scene(),campus=createFullCampus(scene,data,()=>0),observer=new THREE.Vector3(3000,40,3000);
campus.update(observer);scene.updateMatrixWorld(true);
const farFor=id=>scene.children.find(o=>o.userData.role==='distant-building'&&o.userData.buildingId===id);
const nearFor=id=>scene.children.find(o=>o.userData.role==='building-shell'&&o.userData.buildingId===id);
const batches=scene.children.filter(o=>o.userData.role==='distant-building-batch');

check('outer and courtyard glazing faces the air for every ring winding',()=>{
  let rays=0;
  for(const building of buildings){
    const far=farFor(building.id),range=far.userData.renderRange,mesh=range.mesh,glass=nearFor(building.id).children.find(o=>o.userData.role==='detailed-windows');
    const expected=new THREE.Color(far.userData.appearance.glassColor),colors=mesh.geometry.getAttribute('color'),matrix=new THREE.Matrix4();
    for(let i=0;i<glass.count;i++){
      glass.getMatrixAt(i,matrix);const centre=new THREE.Vector3().setFromMatrixPosition(matrix),normal=new THREE.Vector3(0,0,1).transformDirection(matrix);
      if(bodyContains([centre.x+normal.x,centre.z+normal.z],building))normal.negate();
      assert.equal(bodyContains([centre.x+normal.x,centre.z+normal.z],building),false);
      const hit=new THREE.Raycaster(centre.clone().addScaledVector(normal,1),normal.clone().negate(),0,2).intersectObject(mesh)[0];
      assert.ok(hit,`missing facade at ${building.id}/${i}`);
      assert.ok(hit.face.a>=range.vertexStart&&hit.face.a<range.vertexStart+range.vertexCount);
      const actual=new THREE.Color().fromBufferAttribute(colors,hit.face.a);
      assert.ok(Math.abs(actual.r-expected.r)<1e-5&&Math.abs(actual.g-expected.g)<1e-5&&Math.abs(actual.b-expected.b)<1e-5,`wall hides glass at ${building.id}/${i}`);
      rays++;
    }
  }
  return {ringWindingCombinations:4,facadeRays:rays};
});

check('distant roofs preserve courtyard openings',()=>{
  for(const building of buildings){
    const points=building.holes[0].slice(0,-1),x=points.reduce((s,p)=>s+p[0],0)/points.length,z=points.reduce((s,p)=>s+p[1],0)/points.length;
    const hits=new THREE.Raycaster(new THREE.Vector3(x,100,z),new THREE.Vector3(0,-1,0),0,200).intersectObject(farFor(building.id).userData.renderRange.mesh);
    assert.equal(hits.length,0,`courtyard capped in ${building.id}`);
  }
  return {courtyards:buildings.length};
});

check('active index ranges exclude damaged buildings and survive complete hiding and reset',()=>{
  const snapshots=batches.map(mesh=>({mesh,position:Float32Array.from(mesh.geometry.getAttribute('position').array),color:Float32Array.from(mesh.geometry.getAttribute('color').array)}));
  const assertRanges=()=>{
    for(const mesh of batches){
      const index=mesh.geometry.getIndex().array,drawCount=mesh.geometry.drawRange.count;
      const active=buildings.map(b=>farFor(b.id).userData.renderRange).filter(r=>r.mesh===mesh&&r.shown);
      const expected=active.reduce((n,r)=>n+r.vertexCount,0);assert.equal(drawCount,expected);assert.equal(mesh.visible,expected>0);
      for(let i=0;i<drawCount;i++)assert.ok(active.some(r=>index[i]>=r.vertexStart&&index[i]<r.vertexStart+r.vertexCount));
      assert.equal(new Set(index.slice(0,drawCount)).size,drawCount);
    }
  };
  assertRanges();
  const target=campus.breakables.find(t=>t.mesh.userData.buildingId===buildings[0].id&&!t.mesh.userData.roof);
  target.mesh.visible=false;campus.update(observer);assertRanges();
  assert.equal(farFor(buildings[0].id).userData.renderRange.shown,false);assert.equal(nearFor(buildings[0].id).visible,true);
  for(const target of campus.breakables)target.mesh.visible=false;
  campus.update(observer);assertRanges();assert.ok(batches.every(m=>!m.visible));
  for(const target of campus.breakables)target.mesh.visible=true;
  campus.update(observer);assertRanges();assert.ok(buildings.every(b=>farFor(b.id).userData.renderRange.shown));
  for(const s of snapshots){assert.deepEqual(s.mesh.geometry.getAttribute('position').array,s.position);assert.deepEqual(s.mesh.geometry.getAttribute('color').array,s.color);}
  campus.update(new THREE.Vector3(300,2,1000));assertRanges();
  campus.update(observer);assertRanges();
  return {batches:batches.length,buildings:buildings.length};
});

check('world-space bounds include buildings that cross chunk edges and remain valid after reset',()=>{
  let vertices=0;
  for(const mesh of batches){
    const sphere=mesh.geometry.boundingSphere.clone().applyMatrix4(mesh.matrixWorld),bounds=mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld),positions=mesh.geometry.getAttribute('position');
    for(let i=0;i<positions.count;i++){
      const p=new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);
      assert.ok(bounds.clone().expandByScalar(.00001).containsPoint(p));assert.ok(p.distanceTo(sphere.center)<=sphere.radius+.00001);vertices++;
    }
    const point=bounds.min.clone().lerp(bounds.max,.08),camera=new THREE.PerspectiveCamera(8,9/16,.08,7500);
    camera.position.copy(point).add(new THREE.Vector3(0,0,80));camera.lookAt(point);camera.updateMatrixWorld(true);
    const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    assert.ok(frustum.containsPoint(point));assert.ok(frustum.intersectsObject(mesh),'batch rejected while its geometry bounds enter the frustum');
    assert.equal(mesh.frustumCulled,true);assert.equal(mesh.material.transparent,false);assert.equal(Array.isArray(mesh.material),false);
  }
  return {batches:batches.length,vertices,mainPassCallsPerVisibleBatch:1};
});

const actualData=JSON.parse(await fs.readFile(path.join(root,'public/data/campus.json'),'utf8'));
const elevation=JSON.parse(await fs.readFile(path.join(root,'public/data/terrain.json'),'utf8'));
check('actual campus far ranges cover every generic footprint exactly once',()=>{
  const actualScene=new THREE.Scene(),terrain=createTerrain(actualScene,elevation,actualData.buildings),full=createFullCampus(actualScene,actualData,terrain.heightAt);
  full.update(new THREE.Vector3(5000,200,5000));actualScene.updateMatrixWorld(true);
  const markers=actualScene.children.filter(o=>o.userData.role==='distant-building'&&o.userData.renderRange),meshes=actualScene.children.filter(o=>o.userData.role==='distant-building-batch');
  const shells=actualScene.children.filter(o=>o.userData.role==='building-shell'&&!o.userData.landmark);
  const constructionRows=actualData.buildings.filter(b=>b.kind==='construction');
  const groundOnlyRows=actualData.buildings.filter(b=>b.id==='way/455025059');
  assert.equal(groundOnlyRows.length,1,'the raw ground-only OSM row was deleted');
  const groundObjects=[];actualScene.traverse(o=>{if(o.userData.buildingId==='way/455025059')groundObjects.push(o);});
  assert.equal(groundObjects.length,0,'ground-only body retains a shell or distant batch range');
  assert.equal(full.breakables.some(p=>p.mesh.userData.buildingId==='way/455025059'),false);
  assert.equal(full.locations.some(p=>p.id==='way/455025059'),false);
  assert.equal(markers.length,shells.length);assert.equal(markers.length+actualScene.children.filter(o=>o.userData.role==='building-shell'&&o.userData.landmark).length+constructionRows.length+groundOnlyRows.length,actualData.buildings.length);
  for(const b of constructionRows){assert.ok(actualScene.children.some(o=>o.userData.role==='construction-fence'&&o.userData.areaId===b.id&&o.visible));assert.equal(markers.some(o=>o.userData.buildingId===b.id),false);}
  const rangesByMesh=new Map();
  for(const marker of markers){const range=marker.userData.renderRange;assert.equal(range.shown,true);assert.ok(range.windowCount>0);const list=rangesByMesh.get(range.mesh)??[];list.push(range);rangesByMesh.set(range.mesh,list);}
  let triangles=0,attributeBytes=0,indexBytes=0,largestBatchTriangles=0;
  for(const mesh of meshes){
    const list=rangesByMesh.get(mesh),sorted=list.toSorted((a,b)=>a.vertexStart-b.vertexStart);let end=0;
    for(const range of sorted){assert.equal(range.vertexStart,end);end+=range.vertexCount;}
    assert.equal(end,mesh.geometry.getAttribute('position').count);assert.equal(mesh.geometry.drawRange.count,end);triangles+=end/3;
    largestBatchTriangles=Math.max(largestBatchTriangles,end/3);
    attributeBytes+=Object.values(mesh.geometry.attributes).reduce((sum,a)=>sum+a.array.byteLength,0);
    indexBytes+=mesh.geometry.getIndex().array.byteLength;
  }
  return {sourceBuildingRows:actualData.buildings.length,observedGroundOnlyIds:groundOnlyRows.map(b=>b.id),genericFootprints:markers.length,batches:meshes.length,formerShellMaterialGroups:markers.length*2,submittedTrianglesBeforeFrustum:triangles,largestBatchTriangles,attributeBytes,indexBytes,limitations:'Shell main pass only. Rooftop equipment, landmarks, environment, shadows and actual GPU timing are excluded.'};
});
await fs.writeFile(path.join(root,'artifacts/distant-verification.json'),JSON.stringify({verifiedAt:new Date().toISOString(),tests:results,limitations:'CPU geometry, ray intersection, index range and frustum checks. No WebGL frame or GPU timing.'},null,2));
console.log(`Verified ${results.length} distant rendering regressions.`);
