import {createHash} from 'node:crypto';

export function sceneFingerprint(scene){
 const hash=createHash('sha256');
 const text=value=>hash.update(JSON.stringify(value,(_k,v)=>typeof v==='number'&&!Number.isFinite(v)?String(v):Object.is(v,-0)?'-0':v));
 const bytes=attribute=>{if(!attribute)return;const a=attribute.array;text([attribute.itemSize,attribute.normalized,attribute.usage]);hash.update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength));};
 scene.traverse(o=>{
  text([o.type,o.name,o.visible,o.position.toArray(),o.quaternion.toArray(),o.scale.toArray(),o.castShadow,o.receiveShadow,o.frustumCulled,o.renderOrder]);
  if(!o.geometry)return;
  text(o.geometry.drawRange);text(o.geometry.groups);
  for(const [key,a]of Object.entries(o.geometry.attributes)){text(key);bytes(a);}
  bytes(o.geometry.index);bytes(o.instanceMatrix);bytes(o.instanceColor);
  for(const m of Array.isArray(o.material)?o.material:[o.material]){
   const keys=['type','color','emissive','emissiveIntensity','roughness','metalness','opacity','transparent','alphaTest','side','depthWrite','depthTest','vertexColors','flatShading','wireframe','fog','blending','polygonOffset','polygonOffsetFactor','polygonOffsetUnits'];
   text(keys.map(k=>m[k]?.isColor?m[k].toArray():m[k]));
   for(const key of ['map','alphaMap','normalMap','roughnessMap','metalnessMap','emissiveMap']){
    const t=m[key];text(t?[key,t.wrapS,t.wrapT,t.magFilter,t.minFilter,t.anisotropy,t.colorSpace,t.flipY,t.rotation,t.offset.toArray(),t.repeat.toArray(),t.center.toArray(),t.image.width,t.image.height,t.image.__canvasCommands]:null);
   }
  }
 });
 return hash.digest('hex');
}
