import * as THREE from 'three';
import {createHash} from 'node:crypto';
import {deflateRawSync} from 'node:zlib';
import {MeshoptEncoder} from 'meshoptimizer/encoder';
await MeshoptEncoder.ready;

export function recordingDocument(){
 return{createElement(tag){
  if(tag!=='canvas')throw Error('Unsupported build element '+tag);
  const canvas={width:300,height:150,__canvasCommands:[]};let gradient=0;
  const context=new Proxy({},{get(o,key){
   if(key==='measureText')throw Error('Text measurement must remain in the browser');
   if(key in o)return o[key];
   return(...args)=>{
    if(key==='createLinearGradient'||key==='createRadialGradient'){
     const id=gradient++;canvas.__canvasCommands.push(['gradient',id,key,args]);
     return {__gradient:id,addColorStop(...values){canvas.__canvasCommands.push(['stop',id,values]);}};
    }
    canvas.__canvasCommands.push(['call',key,args]);
   };
  },set(o,key,value){o[key]=value;canvas.__canvasCommands.push(['set',key,value?.__gradient!==undefined?{gradient:value.__gradient}:value]);return true;}});
  canvas.getContext=()=>context;return canvas;
 }};
}

export function encodeSnapshot(root,captures){
 const records=[],seen=new Map(),buffers=[],hashes=new Map(),keys=new Set();let byteLength=0;
 const aliases=new WeakMap();
 // Research annotations stay in source/data files. Only these fields are read by runtime updaters.
 const runtimeData=new WeakMap();
 function userData(object){let data=runtimeData.get(object);if(data===undefined){data=Object.fromEntries(['buildingId','renderRange'].filter(k=>k in object.userData).map(k=>[k,object.userData[k]]));if(!Object.keys(data).length)data=null;runtimeData.set(object,data);}return data;}
 const strides=new WeakMap();
 function alias(original,source,start){
  if(!original||!source||original===source||original.length+start>source.length)return;
  const a=Buffer.from(original.buffer,original.byteOffset,original.byteLength),b=Buffer.from(source.buffer,source.byteOffset+start*source.BYTES_PER_ELEMENT,original.byteLength);
  if(a.equals(b))aliases.set(original,{source,start,length:original.length});
 }
 function partAliases(env){
  if(env.batches&&env.meshes)env.batches.forEach((b,i)=>{const g=env.meshes[i]?.geometry;if(g)for(const p of b.parts??[]){alias(p.original,g.attributes.position?.array,p.start);alias(p.colors??p.originalColors,g.attributes.color?.array,p.start);}});
 }
 function mergeParts(items){
  if(items.length<2||!items[0]?.proxy||!items[0]?.original||!('start'in items[0]))return items;
  const out=[];
  for(let i=0;i<items.length;){
   let end=i+1;const a=items[i];
   while(end<items.length){const b=items[end],p=items[end-1];if(b.proxy!==a.proxy||b.start!==p.end||b.color!==a.color||b.shown!==a.shown||b.base&&!b.base.equals(a.base))break;end++;}
   if(end===i+1){out.push(a);i=end;continue;}
   const part={...a,end:items[end-1].end};
   for(const key of ['original','colors','originalColors'])if(a[key]){
    const array=new Float32Array(part.end-part.start);for(let j=i;j<end;j++)array.set(items[j][key],items[j].start-part.start);part[key]=array;
    const source=aliases.get(a[key]);if(source)alias(array,source.source,source.start);
   }
   out.push(part);i=end;
  }
  return out;
 }
 const renderGeometry=new Set(),proxyGeometry=new Map(),proxyMaterial=new Map();root.scene.traverse(o=>{if(o.geometry)renderGeometry.add(o.geometry);});
 const byteHash=a=>createHash('sha256').update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
 const defaultMaterials=new Map();
 function compactMaterial(material){
  let defaults=defaultMaterials.get(material.type);if(!defaults){defaults=new THREE[material.type]();defaultMaterials.set(material.type,defaults);}
  return Object.fromEntries(Object.entries(material).filter(([k,v])=>!['id','uuid','version','_listeners'].includes(k)&&(v?.isTexture||JSON.stringify(v)!==JSON.stringify(defaults[k]))));
 }
 function canonicalProxy(mesh){
  if(mesh.parent||renderGeometry.has(mesh.geometry))return;
  const g=mesh.geometry,hash=JSON.stringify([Object.entries(g.attributes).map(([k,a])=>[k,a.itemSize,a.normalized,byteHash(a.array)]),g.index&&byteHash(g.index.array)]);
  if(proxyGeometry.has(hash))mesh.geometry=proxyGeometry.get(hash);else proxyGeometry.set(hash,g);
  const m=mesh.material;
  if(!Array.isArray(m)&&!m.map){const key=m.type+JSON.stringify(compactMaterial(m));if(proxyMaterial.has(key))mesh.material=proxyMaterial.get(key);else proxyMaterial.set(key,m);}
 }
 for(const owner of [root.gate,root.campus,...root.facilities])for(const spec of owner.breakables)canonicalProxy(spec.mesh);
 function typed(value){
  const stride=strides.get(value)??(value.BYTES_PER_ELEMENT===4&&value.length%3===0?12:4);
  const bytes=Buffer.from(value.buffer,value.byteOffset,value.byteLength),hash=createHash('sha256').update(bytes).update(String(value.BYTES_PER_ELEMENT)+':'+stride).digest('hex');
  let data=hashes.get(hash);
  if(!data){
   let packed=bytes,codec=0,parameter=0;
   if(value.BYTES_PER_ELEMENT===4&&value.length>=64){
    const words=new Uint32Array(value.buffer,value.byteOffset,value.length),palette=new Map(),ids=new Uint16Array(words.length);
    for(let i=0;i<words.length;i++){let id=palette.get(words[i]);if(id===undefined){id=palette.size;palette.set(words[i],id);}if(id>=65536)break;ids[i]=id;}
    if(palette.size<65536){
     const oneByte=palette.size<=256,size=palette.size*4+words.length*(oneByte?1:2);
     if(size<bytes.length*.8){
      const dict=Uint32Array.from(palette.keys()),values=oneByte?Uint8Array.from(ids):ids;
      packed=Buffer.concat([Buffer.from(dict.buffer),Buffer.from(values.buffer)]);codec=oneByte?1:2;parameter=palette.size;
     }
    }
   }
   if(codec===0&&value.BYTES_PER_ELEMENT>1&&value.length>=64){
    const width=value.BYTES_PER_ELEMENT;packed=Buffer.allocUnsafe(bytes.length);
    for(let b=0;b<width;b++)for(let i=0;i<value.length;i++)packed[b*value.length+i]=bytes[i*width+b];codec=3;parameter=width;
   }
   if(value.BYTES_PER_ELEMENT===4&&value.length>=64&&bytes.length%stride===0){
    const encoded=MeshoptEncoder.encodeVertexBufferLevel(bytes,bytes.length/stride,stride,2);
    if(deflateRawSync(encoded,{level:1}).length<deflateRawSync(packed,{level:1}).length){packed=Buffer.from(encoded);codec=4;parameter=stride;}
   }
   if(value.BYTES_PER_ELEMENT===4&&stride===12&&value.length>=300&&value.length%3===0){
    const words=new Uint32Array(value.buffer,value.byteOffset,value.length),unique=new Map(),vertices=[],indices=new Uint32Array(value.length/3);
    for(let i=0;i<words.length;i+=3){const key=words[i]+','+words[i+1]+','+words[i+2];let index=unique.get(key);if(index===undefined){index=unique.size;unique.set(key,index);vertices.push(words[i],words[i+1],words[i+2]);}indices[i/3]=index;}
    if(unique.size<indices.length*.9){
     const dict=Uint32Array.from(vertices),vertexData=MeshoptEncoder.encodeVertexBufferLevel(new Uint8Array(dict.buffer),unique.size,12,2),indexData=MeshoptEncoder.encodeIndexSequence(new Uint8Array(indices.buffer),indices.length,4);
     const header=Buffer.alloc(8);header.writeUInt32LE(unique.size);header.writeUInt32LE(vertexData.length,4);const candidate=Buffer.concat([header,vertexData,indexData]);
     if(deflateRawSync(candidate,{level:1}).length<deflateRawSync(packed,{level:1}).length){packed=candidate;codec=5;parameter=3;}
    }
   }
   byteLength=(byteLength+7)&~7;data=[byteLength,packed.length,codec,parameter];buffers.push({offset:byteLength,bytes:packed});byteLength+=packed.length;hashes.set(hash,data);
  }
  return[value.constructor.name,data[0],data[1],value.length,data[2],data[3]];
 }
 function encode(v){
  if(v===undefined)return{u:1};
  if(typeof v==='number'&&(!Number.isFinite(v)||Object.is(v,-0)))return{n:Object.is(v,-0)?'-0':String(v)};
  if(v===null||typeof v!=='object'&&typeof v!=='function')return v;
  if(seen.has(v))return{r:seen.get(v)};
  const id=records.length;seen.set(v,id);records.push(null);let row;
  const props=(o,omit=[])=>Object.fromEntries(Object.entries(o).filter(([k])=>!omit.includes(k)).map(([k,x])=>{const before=records.length,bytes=byteLength;const result=[k,encode(x)];if(o===root)console.log('snapshot section',k,records.length-before,Math.round((byteLength-bytes)/1e6));return result;}));
  if(v?.original&&v.start!==undefined){const g=(v.surface??v.bucket)?.geometry;if(g){alias(v.original,g.attributes.position?.array,v.start);alias(v.originalColors??v.colors,g.attributes.color?.array,v.start);}}
  if(v===THREE)row=['three'];
  else if(typeof v==='function'){
   const c=captures.get(v);if(!c)throw Error('Uncaptured function '+v.name);
   const env=c.bindings();partAliases(env);keys.add(c.key);row=['function',c.key,encode(env)];
  }
  else if(ArrayBuffer.isView(v)){
   const a=aliases.get(v);
   if(a)row=['copy',encode(a.source),a.start,a.length];
   else row=['typed',...typed(v)];
  }
  else if(Array.isArray(v)){
   if(v.length>=6&&v.every(x=>typeof x==='number')){const ctor=v.every(x=>Math.fround(x)===x)?Float32Array:Float64Array;row=['numeric',...typed(ctor.from(v))];}
   else row=['array',mergeParts(v).map(encode)];
  }
  else if(v instanceof Map)row=['map',[...v].map(([k,x])=>[encode(k),encode(x)])];
  else if(v instanceof Set)row=['set',[...v].map(encode)];
  else if(v.__canvasCommands)row=['canvas',v.width,v.height,v.__canvasCommands];
  else if(v.isVector2||v.isVector3||v.isVector4||v.isQuaternion||v.isEuler||v.isColor||v.isMatrix3||v.isMatrix4)row=['value',v.constructor.name,v.toArray().map(x=>Object.is(x,-0)?'-0':x)];
  else if(v.isBox3)row=['box',encode(v.min),encode(v.max)];
  else if(v.isSphere)row=['sphere',encode(v.center),v.radius];
  else if(v.isInterleavedBufferAttribute)row=['interleavedAttribute',encode(v.data),v.itemSize,v.offset,v.normalized];
  else if(v.isInterleavedBuffer)row=['interleaved',encode(v.array),v.stride,v.usage];
  else if(v.isBufferAttribute){strides.set(v.array,v.itemSize*v.array.BYTES_PER_ELEMENT);row=['attribute',encode(v.array),v.itemSize,v.normalized,v.usage,v.isInstancedBufferAttribute?v.meshPerAttribute:0];}
  else if(v.isBufferGeometry)row=['geometry',props(v.attributes),encode(v.index),encode(v.boundingBox),encode(v.boundingSphere),encode(v.drawRange),encode(v.groups),encode(userData(v))];
  else if(v.isTexture)row=['texture',encode(v.image),props(v,['id','uuid','source','version','_listeners','isTexture','isCanvasTexture','isRenderTargetTexture','isArrayTexture','is3DTexture','isCubeTexture'])];
  else if(v.isMaterial)row=['material',v.type,props(compactMaterial(v))];
  else if(v.isObject3D){
   if(v.isMesh&&!v.parent&&!renderGeometry.has(v.geometry)&&!v.children.length){
    row=['proxy',encode(v.geometry),encode(v.material),v.position.toArray(),v.quaternion.toArray(),v.scale.toArray(),encode(userData(v)),v.name,v.visible];
    records[id]=row;return{r:id};
   }
   const data={name:v.name,position:v.position,quaternion:v.quaternion,scale:v.scale,matrix:v.matrix,matrixAutoUpdate:v.matrixAutoUpdate,visible:v.visible,castShadow:v.castShadow,receiveShadow:v.receiveShadow,frustumCulled:v.frustumCulled,renderOrder:v.renderOrder,userData:userData(v),layers:v.layers.mask};
   if(v.isMesh||v.isSprite||v.isLine||v.isPoints){data.geometry=v.geometry;data.material=v.material;}
   if(v.isInstancedMesh){data.instanceMatrix=v.instanceMatrix;data.instanceColor=v.instanceColor;data.count=v.count;data.boundingBox=v.boundingBox;data.boundingSphere=v.boundingSphere;}
   if(v.isSprite)data.center=v.center;
   row=['object3d',v.isInstancedMesh?'InstancedMesh':v.type,props(data),v.children.map(encode)];
  }else{
   const proto=Object.getPrototypeOf(v);if(proto!==Object.prototype&&proto!==null)throw Error('Unsupported snapshot object '+v.constructor?.name);
   const unused=v.breakables&&typeof v.update==='function'?Object.keys(v).filter(k=>!['breakables','update','colliders','bounds','locations'].includes(k)):typeof v.heightAt==='function'&&v.bounds?Object.keys(v).filter(k=>!['heightAt','surfaceAt','affects','bounds','vertices','indices'].includes(k)):[];
   if(v.geometry?.isBufferGeometry||Array.isArray(v.parts))unused.push('positions','colors','uvs');
   row=['object',props(v,unused)];
  }
  records[id]=row;return{r:id};
 }
 const entry=encode(root),layouts=[],layoutIds=new Map();
 for(const row of records){const slot=row[0]==='object'?1:row[0]==='object3d'||row[0]==='material'?2:-1;if(slot<0)continue;
  const properties=row[slot],names=Object.keys(properties),key=names.join('|');let id=layoutIds.get(key);if(id===undefined){id=layouts.length;layouts.push(names);layoutIds.set(key,id);}row[slot]=[id,Object.values(properties)];
 }
 const header=Buffer.from(JSON.stringify({schema:2,entry,records,layouts}));
 const start=(8+header.length+7)&~7,output=Buffer.alloc(start+byteLength);output.writeUInt32LE(header.length,0);output.writeUInt32LE(start,4);header.copy(output,8);
 for(const {offset,bytes}of buffers)bytes.copy(output,start+offset);
 return{bytes:output,keys,records:records.length,headerBytes:header.length,binaryBytes:byteLength};
}
