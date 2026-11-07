import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
import ts from 'typescript';
import * as THREE from 'three';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'artifacts/geometry-previews');
const modules=path.join(output,'modules');await fs.mkdir(modules,{recursive:true});
for(const file of await fs.readdir(path.join(root,'src'))){
  if(!file.endsWith('.ts'))continue;
  const text=await fs.readFile(path.join(root,'src',file),'utf8');
  const js=ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  await fs.writeFile(path.join(modules,file.replace(/\.ts$/,'.mjs')),js.replace(/from (['"])(\.\/[\w-]+)\1/g,"from '$2.mjs'"));
}
const canvasCalls=new Set(['fillRect','clearRect','beginPath','closePath','moveTo','lineTo','arc','ellipse','stroke','fill','fillText','strokeText','roundRect','save','restore','translate','rotate','scale','quadraticCurveTo','bezierCurveTo','setTransform']);
globalThis.document={createElement(tag){if(tag!=='canvas')throw Error(`Unexpected DOM ${tag}`);const ctx=new Proxy({},{get(o,k){if(k==='measureText')return s=>({width:String(s).length*20});if(k==='createLinearGradient'||k==='createRadialGradient')return()=>({addColorStop(){}});return canvasCalls.has(k)?()=>{}:o[k];},set(o,k,v){o[k]=v;return true;}});return {width:0,height:0,getContext(){return ctx;}};}};
const {createTerrain}=await import(pathToFileURL(path.join(modules,'terrain.mjs')));
const {createCampus}=await import(pathToFileURL(path.join(modules,'scene.mjs')));
const {createFullCampus}=await import(pathToFileURL(path.join(modules,'fullCampus.mjs')));
const {dataToRenderPoint:renderVector}=await import(pathToFileURL(path.join(modules,'coordinates.mjs')));
const data=JSON.parse(await fs.readFile(path.join(root,'public/data/campus.json'),'utf8'));
const elevation=JSON.parse(await fs.readFile(path.join(root,'public/data/terrain.json'),'utf8'));
const scene=new THREE.Scene(),world=new THREE.Scene();scene.add(world);
const terrain=createTerrain(world,elevation,data.buildings);
createCampus(world,{full:true});
const full=createFullCampus(world,data,terrain.heightAt);
// Generate logical geometry first, then apply main's one presentation transform.
world.scale.z=-1;
const libraryId='way/329398175',moaId='way/252233408',mainLibraryId='way/148286730';
const centroid=b=>{const p=b.points.slice(0,-1);return new THREE.Vector3(p.reduce((s,p)=>s+p[0],0)/p.length,0,p.reduce((s,p)=>s+p[1],0)/p.length);};
const countObject=o=>{
  if(o.isSprite)return {calls:1,triangles:2,instances:1};
  if(!o.isMesh||!o.geometry)return {calls:0,triangles:0,instances:0};
  const g=o.geometry,total=g.index?.count??g.attributes.position.count,start=g.drawRange.start??0,end=Math.min(total,start+g.drawRange.count);
  const groups=Array.isArray(o.material)?g.groups:[{start:0,count:total,materialIndex:0}];let calls=0,triangles=0;
  for(const group of groups){const mat=Array.isArray(o.material)?o.material[group.materialIndex]:o.material;if(mat?.visible===false)continue;const count=Math.max(0,Math.min(end,group.start+group.count)-Math.max(start,group.start));if(count>0){calls++;triangles+=Math.floor(count/3)*(o.isInstancedMesh?o.count:1);}}
  return {calls,triangles,instances:o.isInstancedMesh?o.count:1};
};
function inventory(camera){
  const frustum=camera?new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse)):null;
  let calls=0,triangles=0,meshes=0,instancedMeshes=0,instances=0,sprites=0;const categories={};
  scene.traverseVisible(o=>{if(!o.isMesh&&!o.isSprite)return;if(frustum&&o.frustumCulled!==false&&!o.isSprite&&!frustum.intersectsObject(o))return;const c=countObject(o);calls+=c.calls;triangles+=c.triangles;instances+=c.instances;if(o.isSprite)sprites++;else meshes++;if(o.isInstancedMesh)instancedMeshes++;let p=o,key='environment';while(p){if(p.userData.buildingId||p.userData.role==='distant-building-batch'){key='buildings';break;}p=p.parent;}const row=categories[key]??={calls:0,triangles:0};row.calls+=c.calls;row.triangles+=c.triangles;});
  return {estimatedMainPassDrawCalls:calls,submittedTriangles:triangles,meshes,instancedMeshes,submittedInstances:instances,sprites,categories};
}
const stats=[];
const targets=[{name:'gate',position:new THREE.Vector3(0,0,35),target:new THREE.Vector3(0,0,0)},...[
  ['library',libraryId,0],['engineering','way/228476658',0],['library-350m',libraryId,350],['library-900m',libraryId,900]
].map(([name,id,distance])=>{const b=data.buildings.find(b=>b.id===id),target=centroid(b),loc=full.locations.find(l=>l.id===id);return {name,target,position:distance?target.clone().add(new THREE.Vector3(0,0,distance)):new THREE.Vector3(loc.x,0,loc.z)};})];
for(const location of targets){
  const position=location.position.clone();position.y=terrain.heightAt(position.x,position.z)+1.7;
  full.update(position);scene.updateMatrixWorld(true);
  for(const mode of [{name:'desktop',fov:65,aspect:16/9},{name:'mobile-portrait',fov:78,aspect:9/16}]){
    const camera=new THREE.PerspectiveCamera(mode.fov,mode.aspect,.08,7500);camera.position.copy(renderVector(position));const target=location.target.clone();target.y=position.y+2;camera.lookAt(renderVector(target));camera.updateMatrixWorld(true);
    stats.push({location:location.name,mode:mode.name,dataPosition:position.toArray(),dataTarget:target.toArray(),renderPosition:camera.position.toArray(),renderTarget:renderVector(target).toArray(),visible:inventory(camera),sceneVisibleBeforeFrustum:inventory()});
  }
}
await fs.writeFile(path.join(output,'scene-cost-estimates.json'),JSON.stringify({method:'CPU scene visibility and Three.js object bounding-sphere frustum tests. Main pass estimates only. No WebGL renderer, shadow pass, textures, traffic, projectiles, GPU timing or pixel visibility test.',entries:stats},null,2));
console.log(JSON.stringify(stats.map(s=>({location:s.location,mode:s.mode,calls:s.visible.estimatedMainPassDrawCalls,triangles:s.visible.submittedTriangles,environment:s.visible.categories.environment,buildings:s.visible.categories.buildings})),null,2));
if(process.argv.includes('--stats-only'))process.exit(0);

// CPU orthographic rendering uses actual positions, instance matrices and vertex colours.
// Glass is drawn as an opaque colour; Canvas textures, PBR and shadows are not evaluated.
const vector=new THREE.Vector3(),instanceMatrix=new THREE.Matrix4();
function getBuildingId(o){for(let p=o;p;p=p.parent)if(p.userData.buildingId||p.userData.areaId)return p.userData.buildingId??p.userData.areaId;return null;}
function extract(ids){
  const triangles=[],selected=new Set(ids),positions=[];let renderMeshes=0,instanceCount=0;
  const batchRanges=new Map();
  scene.traverseVisible(o=>{const range=o.userData.renderRange;if(!selected.has(o.userData.buildingId)||!range?.indexCount)return;const ranges=batchRanges.get(range.mesh)??[];ranges.push({start:range.indexStart,count:range.indexCount,materialIndex:0});batchRanges.set(range.mesh,ranges);});
  scene.traverseVisible(o=>{
    const id=getBuildingId(o);if(!o.isMesh||(!selected.has(id)&&!batchRanges.has(o)))return;
    const geo=o.geometry,pos=geo.attributes.position,vertexColor=geo.attributes.color,index=geo.index;
    const count=index?.count??pos.count;
    const groups=batchRanges.get(o)??(Array.isArray(o.material)?geo.groups:[{start:0,count,materialIndex:0}]);renderMeshes++;
    for(let instance=0;instance<(o.isInstancedMesh?o.count:1);instance++){
      const matrix=o.matrixWorld.clone();if(o.isInstancedMesh){o.getMatrixAt(instance,instanceMatrix);matrix.multiply(instanceMatrix);}
      if(Math.abs(matrix.determinant())<1e-10)continue;instanceCount++;
      const instanceColor=new THREE.Color(1,1,1);if(o.isInstancedMesh&&o.instanceColor)o.getColorAt(instance,instanceColor);
      for(const group of groups){
        const material=Array.isArray(o.material)?o.material[group.materialIndex]:o.material;if(material?.visible===false)continue;
        const baseColor=material?.color?.clone()??new THREE.Color(1,1,1);
        baseColor.multiply(instanceColor);
        const first=Math.max(group.start,geo.drawRange.start),last=Math.min(count,group.start+group.count,geo.drawRange.start+geo.drawRange.count);
        for(let k=first;k+2<last;k+=3){
          const vertices=[],colors=[];
          for(let j=0;j<3;j++){const vi=index?index.getX(k+j):k+j;vector.fromBufferAttribute(pos,vi).applyMatrix4(matrix);vertices.push(vector.clone());if(material.vertexColors&&vertexColor)colors.push(new THREE.Color().setRGB(vertexColor.getX(vi),vertexColor.getY(vi),vertexColor.getZ(vi)));}
          const normal=new THREE.Vector3().subVectors(vertices[1],vertices[0]).cross(new THREE.Vector3().subVectors(vertices[2],vertices[0]));if(normal.lengthSq()<1e-12)continue;normal.normalize();if(matrix.determinant()<0)normal.negate();
          const color=baseColor.clone();if(colors.length){const c=colors[0].add(colors[1]).add(colors[2]).multiplyScalar(1/3);color.multiply(c);}
          triangles.push({vertices,normal,color,id,ground:false});positions.push(...vertices);
        }
      }
    }
  });
  const bounds=new THREE.Box3().setFromPoints(positions);return {triangles,bounds,renderMeshes,instanceCount};
}
function addGround(geometry){
  const {bounds}=geometry,margin=12,minX=bounds.min.x-margin,maxX=bounds.max.x+margin,minZ=bounds.min.z-margin,maxZ=bounds.max.z+margin;
  for(let i=0;i<terrain.indices.length;i+=3){
    const vertices=[0,1,2].map(j=>renderVector(new THREE.Vector3().fromArray(terrain.vertices,terrain.indices[i+j]*3)));
    if(Math.max(...vertices.map(p=>p.x))<minX||Math.min(...vertices.map(p=>p.x))>maxX||Math.max(...vertices.map(p=>p.z))<minZ||Math.min(...vertices.map(p=>p.z))>maxZ)continue;
    const normal=new THREE.Vector3().subVectors(vertices[1],vertices[0]).cross(new THREE.Vector3().subVectors(vertices[2],vertices[0])).normalize();if(normal.y<0)normal.negate();
    geometry.triangles.push({vertices,normal,color:new THREE.Color(0xb5bea2),id:'terrain',ground:true});
  }
  return geometry;
}
const font={
  A:['01110','10001','10001','11111','10001','10001','10001'],B:['11110','10001','10001','11110','10001','10001','11110'],C:['01111','10000','10000','10000','10000','10000','01111'],D:['11110','10001','10001','10001','10001','10001','11110'],E:['11111','10000','10000','11110','10000','10000','11111'],F:['11111','10000','10000','11110','10000','10000','10000'],G:['01111','10000','10000','10111','10001','10001','01110'],H:['10001','10001','10001','11111','10001','10001','10001'],I:['111','010','010','010','010','010','111'],J:['00111','00010','00010','00010','10010','10010','01100'],K:['10001','10010','10100','11000','10100','10010','10001'],L:['10000','10000','10000','10000','10000','10000','11111'],M:['10001','11011','10101','10101','10001','10001','10001'],N:['10001','11001','10101','10011','10001','10001','10001'],O:['01110','10001','10001','10001','10001','10001','01110'],P:['11110','10001','10001','11110','10000','10000','10000'],Q:['01110','10001','10001','10001','10101','10010','01101'],R:['11110','10001','10001','11110','10100','10010','10001'],S:['01111','10000','10000','01110','00001','00001','11110'],T:['11111','00100','00100','00100','00100','00100','00100'],U:['10001','10001','10001','10001','10001','10001','01110'],V:['10001','10001','10001','10001','10001','01010','00100'],W:['10001','10001','10001','10101','10101','10101','01010'],X:['10001','10001','01010','00100','01010','10001','10001'],Y:['10001','10001','01010','00100','00100','00100','00100'],Z:['11111','00001','00010','00100','01000','10000','11111'],
  '0':['01110','10001','10011','10101','11001','10001','01110'],'1':['010','110','010','010','010','010','111'],'2':['01110','10001','00001','00010','00100','01000','11111'],'3':['11110','00001','00001','01110','00001','00001','11110'],'4':['00010','00110','01010','10010','11111','00010','00010'],'5':['11111','10000','10000','11110','00001','00001','11110'],'6':['01110','10000','10000','11110','10001','10001','01110'],'7':['11111','00001','00010','00100','01000','01000','01000'],'8':['01110','10001','10001','01110','10001','10001','01110'],'9':['01110','10001','10001','01111','00001','00001','01110'],'.':['0','0','0','0','0','1','1'],'-':['000','000','000','111','000','000','000'],':':['0','1','1','0','1','1','0'],'/':['00001','00001','00010','00100','01000','10000','10000'],' ':['000','000','000','000','000','000','000'],'+':['00000','00100','00100','11111','00100','00100','00000']
};
function label(buffer,w,x,y,text,scale=2){
  for(const ch of text.toUpperCase()){const glyph=font[ch]??font[' '];for(let row=0;row<7;row++)for(let col=0;col<glyph[row].length;col++)if(glyph[row][col]==='1')for(let a=0;a<scale;a++)for(let b=0;b<scale;b++){const i=((y+row*scale+b)*w+x+col*scale+a)*4;buffer[i]=34;buffer[i+1]=42;buffer[i+2]=46;buffer[i+3]=255;}x+=(glyph[0].length+1)*scale;}
}
const sunDirection=renderVector(new THREE.Vector3(-.4,.8,.5)).normalize();
function drawView(triangles,bounds,forward,rect,pixels,zbuffer,width){
  forward=forward.clone().normalize();const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),forward).normalize(),up=new THREE.Vector3().crossVectors(forward,right).normalize();
  const center=bounds.getCenter(new THREE.Vector3()),project=p=>{const d=p.clone().sub(center);return [d.dot(right),d.dot(up),d.dot(forward)];};
  const projected=triangles.map(t=>({...t,p:t.vertices.map(project)}));
  const shape=projected.filter(t=>!t.ground).flatMap(t=>t.p);
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(const [x,y] of shape){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
  const scale=Math.min((rect.w-50)/(maxX-minX+16),(rect.h-55)/(maxY-minY+8));
  const sx=rect.x+rect.w/2-(minX+maxX)/2*scale,sy=rect.y+rect.h/2+(minY+maxY)/2*scale;
  for(const triangle of projected){
    const p=triangle.p.map(([x,y,z])=>[sx+x*scale,sy-y*scale,z]);
    const minPX=Math.max(rect.x,Math.floor(Math.min(...p.map(p=>p[0])))),maxPX=Math.min(rect.x+rect.w-1,Math.ceil(Math.max(...p.map(p=>p[0])))),minPY=Math.max(rect.y,Math.floor(Math.min(...p.map(p=>p[1])))),maxPY=Math.min(rect.y+rect.h-1,Math.ceil(Math.max(...p.map(p=>p[1]))));
    const den=(p[1][1]-p[2][1])*(p[0][0]-p[2][0])+(p[2][0]-p[1][0])*(p[0][1]-p[2][1]);if(Math.abs(den)<1e-7)continue;
    const normal=triangle.normal.clone();if(normal.dot(forward)<0)normal.negate();
    const color=triangle.color.clone().multiplyScalar(.68+.32*Math.max(0,normal.dot(sunDirection))),hex=color.getHex(THREE.SRGBColorSpace),rgb=[hex>>16,(hex>>8)&255,hex&255];
    for(let y=minPY;y<=maxPY;y++)for(let x=minPX;x<=maxPX;x++){
      const a=((p[1][1]-p[2][1])*(x+.5-p[2][0])+(p[2][0]-p[1][0])*(y+.5-p[2][1]))/den;
      const b=((p[2][1]-p[0][1])*(x+.5-p[2][0])+(p[0][0]-p[2][0])*(y+.5-p[2][1]))/den,c=1-a-b;if(a<-.00001||b<-.00001||c<-.00001)continue;
      const depth=a*p[0][2]+b*p[1][2]+c*p[2][2],i=y*width+x;if(depth<=zbuffer[i])continue;zbuffer[i]=depth;pixels[i*4]=rgb[0];pixels[i*4+1]=rgb[1];pixels[i*4+2]=rgb[2];pixels[i*4+3]=255;
    }
  }
  return {cameraDirection:forward.toArray(),pixelsPerMetre:scale};
}
function crc32(buffer){let crc=0xffffffff;for(const byte of buffer){crc^=byte;for(let i=0;i<8;i++)crc=crc&1?0xedb88320^(crc>>>1):crc>>>1;}return(crc^0xffffffff)>>>0;}
function pngChunk(name,data){const type=Buffer.from(name),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([type,data])));return Buffer.concat([length,type,data,crc]);}
function png(width,height,pixels){const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;const raw=Buffer.alloc((width*4+1)*height);for(let y=0;y<height;y++)Buffer.from(pixels.buffer,pixels.byteOffset+y*width*4,width*4).copy(raw,y*(width*4+1)+1);return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',header),pngChunk('IDAT',deflateSync(raw,{level:6})),pngChunk('IEND',Buffer.alloc(0))]);}
const previewResults=[];
const previews=[
  {name:'moa',title:'SNU MUSEUM OF ART',id:moaId,ids:[moaId]},
  {name:'gwanjeong',title:'GWANJEONG + MAIN LIBRARY',id:libraryId,ids:[libraryId,mainLibraryId]},
  {name:'main-library',title:'MAIN LIBRARY 62',id:mainLibraryId,ids:[mainLibraryId]},
  {name:'administration',title:'ADMINISTRATION BUILDING 60',id:'way/167609409',ids:['way/167609409']},
  {name:'student-center',title:'STUDENT CENTER 63',id:'way/167607356',ids:['way/167607356']},
  {name:'museum',title:'SNU MUSEUM 70',id:'way/439693757',ids:['way/439693757']},
  {name:'living-science',title:'COLLEGE OF HUMAN ECOLOGY 222',id:'way/386890828',ids:['way/386890828']},
  {name:'gym',title:'GYMNASIUM 71',id:'way/386891006',ids:['way/386891006']},
  {name:'agriculture',title:'AGRICULTURE AND LIFE SCIENCES 200',id:'way/179742149',ids:['way/179742149']},
  {name:'agriculture-roofs',title:'AGRICULTURE 200 ROOFS AND WEST RECESS',id:'way/179742149',ids:['way/179742149']},
  {name:'engineering301',title:'ENGINEERING BUILDING 301',id:'way/228476658',ids:['way/228476658']},
  {name:'engineering301-roofs',title:'ENGINEERING 301 ATRIUM AND CROWN',id:'way/228476658',ids:['way/228476658']},
  {name:'education220',title:'EDUCATION AND RESEARCH BUILDING 220',id:'way/297046999',ids:['way/297046999']},
  {name:'public-health221',title:'PUBLIC HEALTH BUILDING 221',id:'way/297047243',ids:['way/297047243']},
  {name:'education-health-pair',title:'BUILDINGS 220 AND 221 - UPPER WALKWAY',id:'way/297047243',ids:['way/297046999','way/297047243']},
  {name:'science500-north',title:'SCIENCE 500 NORTH BUILDING',id:'way/297047750',ids:['way/297047750']},
  {name:'science500-west',title:'SCIENCE 500 THREE WEST WINGS',id:'way/179742155',ids:['way/179742150','way/179742155','way/179742153']},
  {name:'science500-connector',title:'SCIENCE 500 LOWER GLASS CONNECTOR',id:'way/329398248',ids:['way/329398248']},
  {name:'science500-complex',title:'SCIENCE 500 CONNECTED COMPLEX',id:'way/329398248',ids:['way/179742150','way/179742155','way/179742153','way/329398248','way/297047750']},
  {name:'culture-construction',title:'CULTURE HALL CONSTRUCTION FENCE',id:'way/1485386287',ids:['way/1485386287']},
  {name:'posco-sports',title:'POSCO SPORTS CENTER',id:'way/439687811',ids:['way/439687811']},
  {name:'gyujanggak',title:'GYUJANGGAK',id:'way/238935852',ids:['way/238935852']},
  {name:'poongsan-pavilion',title:'POONGSAN PAVILION',id:'way/193893586',ids:['way/193893586']},
  {name:'engineering-302',title:'ENGINEERING BUILDING 302',id:'way/482207537',ids:['way/482207537']},
  {name:'engineer-house',title:'ENGINEER HOUSE',id:'way/386890466',ids:['way/386890466']},
  {name:'samsung-research',title:'SAMSUNG RESEARCH 944',id:'way/700872151',ids:['way/700872151']},
  {name:'research-park',title:'RESEARCH PARK 940',id:'way/439707875',ids:['way/439707875']},
  {name:'global-engineering',title:'GLOBAL ENGINEERING EDUCATION 38',id:'way/93549089',ids:['way/93549089']},
  {name:'admissions',title:'ADMISSIONS 150',id:'way/386891016',ids:['way/386891016']},
  {name:'neutinamu',title:'NEUTINAMU CHILDCARE 941-1',id:'way/439707878',ids:['way/439707878']},
  {name:'baekhak',title:'BAEKHAK CHILDCARE 941',id:'way/439707877',ids:['way/439707877']},
  ...[['931','way/439707895'],['932','way/439707894'],['933','way/439707893'],['934','way/439707892'],['935','way/409030550']].map(([number,id])=>({name:`family-dorm-${number}`,title:`FAMILY RESIDENCE ${number}`,id,ids:[id]})),
  {name:'main-library-distant',title:'MAIN LIBRARY DISTANT VIEW',id:mainLibraryId,ids:[mainLibraryId],distant:true},
];
const selectedNames=process.argv.find(arg=>arg.startsWith('--only='))?.slice(7).split(',');
previews.push({name:'engineering303',title:'HAEDONG ADVANCED ENGINEERING 303',id:'supplemental/snu-303',ids:['supplemental/snu-303']});
previews.push({name:'faculty-club',title:'FACULTY CLUB 65',id:'way/167659979',ids:['way/167659979']});
previews.push({name:'teaching-center',title:'TEACHING AND LEARNING CENTER 61',id:'way/193893591',ids:['way/193893591']});
previews.push({name:'engineering35',title:'ENGINEERING BUILDING 35',id:'way/892896238',ids:['way/892896238']});
previews.push({name:'engineering31',title:'ENGINEERING BUILDING 31',id:'way/389628348',ids:['way/389628348']});
previews.push({name:'engineering32-construction',title:'BUILDING 32 CONSTRUCTION SITE',id:'way/1530459898',ids:['way/1530459898']});
previews.push({name:'engineering31-32-site',title:'BUILDING 31 AND CONSTRUCTION SITE',id:'way/389628348',ids:['way/389628348','way/1530459898']});
for(const preview of previews.filter(preview=>!selectedNames||selectedNames.includes(preview.name))){
  const building=data.buildings.find(b=>b.id===preview.id)??data.areas.find(a=>a.id===preview.id),player=centroid(building);player.y=terrain.heightAt(player.x,player.z);if(preview.distant)player.set(4500,300,4500);full.update(player);scene.updateMatrixWorld(true);
  const geometry=extract(preview.ids),bounds=geometry.bounds.clone();addGround(geometry);
  let along;const landmark=world.children.find(o=>o.userData.buildingId===preview.id&&o.userData.role==='building-shell');
  if(landmark?.userData.axis)along=new THREE.Vector3(landmark.userData.axis.x,0,landmark.userData.axis.z);
  else{let longest=0;for(let i=1;i<building.points.length;i++){const a=building.points[i-1],b=building.points[i],v=new THREE.Vector3(b[0]-a[0],0,b[1]-a[1]);if(v.length()>longest){longest=v.length();along=v.normalize();}}if(along.z<0)along.negate();}
  const across=new THREE.Vector3(-along.z,0,along.x),declaredFront=landmark?.userData.front??landmark?.userData.frontDirection??landmark?.userData.frontFacing;
  let front=declaredFront?new THREE.Vector3(declaredFront.x,0,declaredFront.z):landmark?.userData.frontSign?across.clone().multiplyScalar(landmark.userData.frontSign):preview.name==='moa'?along.clone():['gwanjeong','main-library-distant','gyujanggak'].includes(preview.name)?across.clone():across.clone().negate(),side=preview.name==='moa'?across.clone().negate():along.clone();
  if(preview.name==='student-center'){front=along.clone().negate();side=across.clone().negate();}
  if(preview.name==='museum'){front=along.clone().negate();side=across.clone();}
  if(preview.name==='agriculture'){front=along.clone();side=across.clone().negate();}
  if(preview.name==='engineering301'){front=across.clone();side=along.clone().negate();}
  if(preview.name==='engineering303'){front=new THREE.Vector3(1,0,0);side=new THREE.Vector3(-1,0,0);}
  if(preview.name==='teaching-center')side=across.clone();
  if(preview.name==='faculty-club')side=along.clone().negate();
  if(['education220','public-health221','education-health-pair'].includes(preview.name)){front=new THREE.Vector3(-.8763074854,0,.4817522092);side=new THREE.Vector3(.4817522092,0,.8763074854);}
  if(preview.name==='education220'){front=new THREE.Vector3(.4817522092,0,.8763074854);side=new THREE.Vector3(-.8763074854,0,.4817522092);}
  if(preview.name.startsWith('science500-')){front=new THREE.Vector3(.98323794,0,.18232708);side=new THREE.Vector3(-.18232708,0,.98323794);}
  if(preview.name==='science500-north'){front=new THREE.Vector3(.96938287,0,-.24555418);side=new THREE.Vector3(.24555418,0,.96938287);}
  const views=[{name:'FRONT',dir:front,rect:{x:20,y:90,w:865,h:325}},{name:'SIDE',dir:side,rect:{x:915,y:90,w:865,h:325}},{name:'OBLIQUE',dir:front.clone().addScaledVector(side,.7).add(new THREE.Vector3(0,.78,0)),rect:{x:20,y:465,w:1760,h:535}}];
  if(preview.name==='agriculture-roofs'){
    views[0].name='ROOF FROM NORTHEAST';views[0].dir=along.clone().addScaledVector(across,.4).add(new THREE.Vector3(0,1.6,0));
    views[1].name='WEST RECESS';views[1].dir=along.clone().negate().add(new THREE.Vector3(0,.5,0));
    views[2].name='HIGH OBLIQUE';views[2].dir=along.clone().multiplyScalar(.4).addScaledVector(across,.3).add(new THREE.Vector3(0,2,0));
  }
  if(preview.name==='engineering301-roofs'){
    views[0].name='ROOF FROM NORTHWEST';views[0].dir=across.clone().addScaledVector(along,-.6).add(new THREE.Vector3(0,1.2,0));
    views[1].name='SOUTH TOWER';views[1].dir=across.clone().negate().addScaledVector(along,-.3);
    views[2].name='HIGH OBLIQUE';views[2].dir=across.clone().multiplyScalar(.3).addScaledVector(along,-.5).add(new THREE.Vector3(0,2,0));
  }
  if(preview.name==='education-health-pair'){
    views[0].name='WEST FACADES';
    views[1].name='EAST ROOFS';views[1].dir=front.clone().negate().add(new THREE.Vector3(0,1.3,0));
    views[2].name='UPPER WALKWAY';views[2].dir=front.clone().multiplyScalar(.4).addScaledVector(side,.2).add(new THREE.Vector3(0,2,0));
  }
  if(preview.name==='science500-complex'){
    views[0].name='EAST ROAD FRONT';
    views[1].name='ROOFS FROM SOUTHEAST';views[1].dir=front.clone().addScaledVector(side,-.5).add(new THREE.Vector3(0,1.3,0));
    views[2].name='FOUR BUILDINGS AND CONNECTOR';views[2].dir=front.clone().addScaledVector(side,.3).add(new THREE.Vector3(0,1.5,0));
  }
  const width=1800,height=1060,pixels=new Uint8Array(width*height*4),zbuffer=new Float64Array(width*height);zbuffer.fill(-Infinity);
  for(let i=0;i<width*height;i++){pixels[i*4]=246;pixels[i*4+1]=247;pixels[i*4+2]=244;pixels[i*4+3]=255;}
  label(pixels,width,24,20,preview.title,3);label(pixels,width,24,51,'CPU ORTHOGRAPHIC GEOMETRY - NO WEBGL / PBR / SHADOWS / TEXTURES',2);
  const viewReports=[];for(const view of views){viewReports.push({name:view.name,dataObserverDirection:view.dir.toArray(),...drawView(geometry.triangles,bounds,renderVector(view.dir),view.rect,pixels,zbuffer,width)});label(pixels,width,view.rect.x+10,view.rect.y+8,view.name,2);}
  label(pixels,width,24,1021,`${geometry.renderMeshes} MESHES / ${geometry.triangles.filter(t=>!t.ground).length} NONDEGENERATE TRIANGLES / ACTUAL TERRAIN PATCH`,2);
  await fs.writeFile(path.join(output,`${preview.name}.png`),png(width,height,pixels));
  previewResults.push({name:preview.name,buildingIds:preview.ids,coordinateTransform:'Data D=(E,U,N); render R=H*D=(E,U,-N). Geometry inherits H once; observer and light vectors receive H once.',renderBounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},renderMeshes:geometry.renderMeshes,instanceCount:geometry.instanceCount,triangles:geometry.triangles.filter(t=>!t.ground).length,views:viewReports,notes:['Current source scene geometry and instance transforms. Model/map coordinates are not rewritten.','Terrain patches use actual terrain triangles in data coordinates and project to render coordinates.','Opaque glass colours, simple normal shading, no texture sampling or lighting simulation.','No actual WebGL renderer, browser screen or mobile-device verification.']});
  console.log(`Created ${preview.name}.png`);
}
await fs.writeFile(path.join(output,'preview-method.json'),JSON.stringify(previewResults,null,2));
