import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { CampusBuilding } from './fullCampus';
import type { BuildingAppearance } from './buildingAppearance';
import type { BreakableSpec } from './scene';
type Point={x:number;z:number};
type Surface={positions:number[];colors:number[];geometry?:THREE.BufferGeometry};
type Range={surface:Surface;start:number;end:number;original:Float32Array};
type Part={proxy:THREE.Mesh;shown:boolean;ranges:Range[]};

// 2015년 재개관 사진과 외관 개선 보고서의 상대 형태를 사용한다. 제안안의 치수를 준공 실측값으로 취급하지 않는다.
export function createFacultyClubLandmark(scene:THREE.Scene,building:CampusBuilding,profile:BuildingAppearance,heightAt:(x:number,z:number)=>number){
 const landmark='faculty-club',mapped=building.points.filter((p,i,a)=>i!==a.length-1||p[0]!==a[0][0]||p[1]!==a[0][1]);
 if(mapped.length<15)throw Error('Faculty club requires its original outline.');
 const origin={x:mapped[0][0],z:mapped[0][1]},axis=new THREE.Vector3(mapped[1][0]-origin.x,0,mapped[1][1]-origin.z).normalize(),across=new THREE.Vector3(-axis.z,0,axis.x),up=new THREE.Vector3(0,1,0);
 const entryX=13,entryZ=33,datumSample={x:origin.x+axis.x*entryX+across.x*entryZ,z:origin.z+axis.z*entryX+across.z*entryZ},base=heightAt(datumSample.x,datumSample.z);
 const world=(x:number,y:number,z:number)=>new THREE.Vector3(origin.x,base+y,origin.z).addScaledVector(axis,x).addScaledVector(across,z),ground=(x:number,z:number)=>{const p=world(x,0,z);return heightAt(p.x,p.z)-base;};
 const points=mapped.map(p=>{const d=new THREE.Vector3(p[0]-origin.x,0,p[1]-origin.z);return{x:d.dot(axis),z:d.dot(across)};});
 const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minZ=Math.min(...points.map(p=>p.z)),maxZ=Math.max(...points.map(p=>p.z));
 const shell=new THREE.Group();shell.name=building.id+':'+landmark;Object.assign(shell.userData,{buildingId:building.id,role:'building-shell',landmark,appearance:profile,localOrigin:{x:origin.x,y:base,z:origin.z},axis:{x:axis.x,z:axis.z},frontFacing:{x:across.x,z:across.z},datum:{sample:datumSample,base,kind:'north-entrance-game-terrain',surveyed:false},mappedOutline:mapped.map(p=>p.slice()),mappedOutlinePreserved:true,sourcePointCount:mapped.length,documentedAboveGroundLevels:2,documentedBasementLevels:1,designHeight:12.6,heightEstimated:true,highestModelPoint:12.6,bounds:{minX,maxX,minZ,maxZ},voids:[]});scene.add(shell);
 const distant=new THREE.Group();distant.visible=false;Object.assign(distant.userData,{buildingId:building.id,role:'distant-building',landmark});scene.add(distant);
  const concrete: Surface = { positions: [], colors: [] }, details: Surface = { positions: [], colors: [] }, glass: Surface = { positions: [], colors: [] }, surfaces = [concrete, details, glass];
  const parts: Part[] = [], breakables: BreakableSpec[] = [], cube = new THREE.BoxGeometry(1, 1, 1), cubeVertices = cube.toNonIndexed().getAttribute('position');
  const materials = { stone: new THREE.MeshStandardMaterial({ color: 0xa8a295 }), metal: new THREE.MeshStandardMaterial({ color: 0x49514e }), glass: new THREE.MeshStandardMaterial({ color: 0x49676f }) };
  function tri(s: Surface, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: number) { const tint = new THREE.Color(color); for (const p of [a, b, c]) { s.positions.push(p.x, p.y, p.z); s.colors.push(tint.r, tint.g, tint.b); } }
  function quad(s: Surface, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, color: number) { tri(s, a, b, c, color); tri(s, a, c, d, color); }
  function box(s: Surface, centre: THREE.Vector3, size: THREE.Vector3, color: number, ex = axis, ey = up) {
    const ez = new THREE.Vector3().crossVectors(ex, ey).normalize(), tint = new THREE.Color(color);
    for (let i = 0; i < cubeVertices.count; i++) { const p = centre.clone().addScaledVector(ex, cubeVertices.getX(i) * size.x).addScaledVector(ey, cubeVertices.getY(i) * size.y).addScaledVector(ez, cubeVertices.getZ(i) * size.z); s.positions.push(p.x, p.y, p.z); s.colors.push(tint.r, tint.g, tint.b); }
  }
  function component(kind: keyof typeof materials, name: string, draw: () => void, ex = axis, convex = false, extra: Record<string, unknown> = {}) {
    const starts = surfaces.map(s => s.positions.length); draw();
    const ranges = surfaces.map((surface, i) => ({ surface, start: starts[i], end: surface.positions.length, original: new Float32Array(surface.positions.slice(starts[i])) }));
    if (ranges.every(r => r.start === r.end)) return;
    const ez = new THREE.Vector3().crossVectors(ex, up).normalize(), axes = [ex, up, ez], lows = [Infinity, Infinity, Infinity], highs = [-Infinity, -Infinity, -Infinity], p = new THREE.Vector3();
    for (const r of ranges) for (let i = 0; i < r.original.length; i += 3) { p.fromArray(r.original, i); axes.forEach((a, j) => { lows[j] = Math.min(lows[j], p.dot(a)); highs[j] = Math.max(highs[j], p.dot(a)); }); }
    const proxy: THREE.Mesh = new THREE.Mesh(cube, materials[kind]); axes.forEach((a, i) => proxy.position.addScaledVector(a, (lows[i] + highs[i]) / 2));
    proxy.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ex, up, ez)); proxy.scale.set(...highs.map((v, i) => Math.max(.025, v - lows[i]) + .008) as [number, number, number]);
    const size = proxy.scale.clone(); let collisionVertices: Float32Array | undefined;
    if (convex) { const inverse = proxy.quaternion.clone().invert(), unique = new Map<string, THREE.Vector3>(); for (const r of ranges) { if (extra.skylight && r.surface !== glass) continue; for (let i = 0; i < r.original.length; i += 3) { const v = new THREE.Vector3().fromArray(r.original, i).sub(proxy.position).applyQuaternion(inverse); unique.set(v.toArray().map(n => n.toFixed(5)).join(','), v); } } proxy.geometry = new ConvexGeometry([...unique.values()]); collisionVertices = Float32Array.from(proxy.geometry.getAttribute('position').array); proxy.scale.setScalar(1); }
    if(extra.closedFacade && ranges[2].original.length && Array.isArray(extra.outward)) {
      const out=new THREE.Vector3().fromArray(extra.outward as number[]);let front=-Infinity,back=Infinity,glassPlane=-Infinity;
      for(const r of ranges)for(let i=0;i<r.original.length;i+=3){const depth=p.fromArray(r.original,i).dot(out);if(r.surface===glass)glassPlane=Math.max(glassPlane,depth);else{front=Math.max(front,depth);back=Math.min(back,depth);}}
      const newFront=(front+glassPlane)/2,newBack=(back+glassPlane)/2;proxy.position.addScaledVector(out,(newFront+newBack)/2-proxy.position.dot(out));proxy.scale.z=size.z=Math.max(.04,newFront-newBack);
      proxy.userData.facadeCollision={method:'balanced-wall-and-glass',front,back,glassPlane,newFront,newBack};
    }
    Object.assign(proxy.userData, { buildingId: building.id, landmark, renderProxy: true, component: name, convex, glazingTriangles: [starts[2]/9,glass.positions.length/9], ...extra }); proxy.updateMatrix(); proxy.updateMatrixWorld(true);
    parts.push({ proxy, shown: true, ranges }); breakables.push({ mesh: proxy, size, collisionVertices, toughness: kind === 'glass' ? 6 : 11, material: kind, label: building.name });
  }
  function wallBox(s: Surface, at: (u: number, y: number, depth?: number) => THREE.Vector3, ex: THREE.Vector3, a: number, b: number, bottom: number, top: number, depth: number, thickness: number, color: number) { if (b - a > .005 && top - bottom > .005) box(s, at((a + b) / 2, (bottom + top) / 2, depth), new THREE.Vector3(b - a, top - bottom, thickness), color, ex); }

  function faceQuad(s:Surface,a:THREE.Vector3,b:THREE.Vector3,c:THREE.Vector3,d:THREE.Vector3,color:number,out:THREE.Vector3){if(b.clone().sub(a).cross(c.clone().sub(a)).dot(out)<0)quad(s,a,d,c,b,color);else quad(s,a,b,c,d,color);}
  function clip(poly:Point[],key:'x'|'z',value:number,greater:boolean){const result:Point[]=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],ia=greater?a[key]>=value:a[key]<=value,ib=greater?b[key]>=value:b[key]<=value;if(ia)result.push(a);if(ia!==ib){const t=(value-a[key])/(b[key]-a[key]);result.push({x:THREE.MathUtils.lerp(a.x,b.x,t),z:THREE.MathUtils.lerp(a.z,b.z,t)});}}return result;}
  function slab(poly:Point[],ys:number[],thickness:number,color:number,name:string,extra:Record<string,unknown>={}){component('stone',name,()=>{const top=poly.map((p,i)=>world(p.x,ys[i],p.z)),bottom=top.map(p=>p.clone().addScaledVector(up,-thickness));for(let i=1;i<poly.length-1;i++){tri(details,top[0],top[i+1],top[i],color);tri(details,bottom[0],bottom[i],bottom[i+1],color);}for(let i=0;i<poly.length;i++){const j=(i+1)%poly.length;quad(details,bottom[i],bottom[j],top[j],top[i],color);}},axis,true,extra);}
  function rectangularSlab(x0:number,x1:number,z0:number,z1:number,y00:number,y10:number,y11:number,y01:number,name:string,color=0xaaa99a,thickness=.20){const p=[{x:x0,z:z0},{x:x1,z:z0},{x:x1,z:z1},{x:x0,z:z1}],ys=[y00,y10,y11,y01];if(Math.max(...ys)-Math.min(...ys)<.0001){slab(p,ys,thickness,color,name);return;}for(const indices of [[0,1,2],[0,2,3]])slab(indices.map(i=>p[i]),indices.map(i=>ys[i]),thickness,color,name);}


 const stone=0xa3a296,brown=0x865443,dark=0x30373a,frame=0x657272,glassColor=0x79918c,timber=dark;
 const floor=.2,mainTop=5.15,annex=points.slice(5,14),main=points.slice(0,5).concat([points[14]]);
 const inward=(poly:Point[],distance:number)=>{const c={x:poly.reduce((a,p)=>a+p.x,0)/poly.length,z:poly.reduce((a,p)=>a+p.z,0)/poly.length};return poly.map(p=>{const l=Math.hypot(p.x-c.x,p.z-c.z);return{x:p.x+(c.x-p.x)*distance/l,z:p.z+(c.z-p.z)*distance/l};});};
 const upperAnnex=inward(annex,1.2),entry={x:entryX,z:entryZ-.15,width:4.6,height:3.2,floor,estimated:true};
 const galleryPoly=[{x:-7.6,z:9.7},{x:7,z:9.7},{x:7,z:24.2},{x:-8.5,z:24.2}];
 Object.assign(shell.userData,{entry,entries:[entry],annex:{poly:annex,upperPoly:upperAnnex,floor,upperFloor:4.95,roof:9.2,estimated:true},main:{poly:main,lowRoof:mainTop,highRoof:12.6,estimated:true},designReport:{date:'2015-03-22',pages:[3,20,22,24],status:'design-proposal-not-as-built'},observedSources:['SNU map 082-65','SNU reopening 2015 photo'],footprintAreaEstimated:true});

 function normalFace(a:Point,b:Point){const length=Math.hypot(b.x-a.x,b.z-a.z),dx=(b.x-a.x)/length,dz=(b.z-a.z)/length,tangent=axis.clone().multiplyScalar(dx).addScaledVector(across,dz),out=axis.clone().multiplyScalar(dz).addScaledVector(across,-dx),at=(u:number,y:number,d=0)=>world(a.x+dx*u,y,a.z+dz*u).addScaledVector(out,d);return{length,dx,dz,tangent,out,at};}
 function beam(a:THREE.Vector3,b:THREE.Vector3,w:number,h:number,name:string,color=timber){if(a.distanceTo(b)<.01)return;const ex=b.clone().sub(a).normalize(),ey=up.clone().addScaledVector(ex,-up.dot(ex));if(ey.length()<.01)ey.copy(axis);ey.normalize();component('metal',name,()=>box(details,a.clone().add(b).multiplyScalar(.5),new THREE.Vector3(a.distanceTo(b),w,h),color,ex,ey),axis,true);}
 function pane(vertices:THREE.Vector3[],normal:THREE.Vector3,name:string,extra:Record<string,unknown>={}){if(vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0])).dot(normal)<0)vertices=vertices.slice().reverse();component('glass',name,()=>{const back=vertices.map(p=>p.clone().addScaledVector(normal,-.055));for(let i=1;i+1<vertices.length;i++){const a=vertices[0],b=vertices[i],c=vertices[i+1];if(b.clone().sub(a).cross(c.clone().sub(a)).dot(normal)<0){tri(glass,a,c,b,glassColor);tri(glass,back[0],back[i],back[i+1],glassColor);}else{tri(glass,a,b,c,glassColor);tri(glass,back[0],back[i+1],back[i],glassColor);}}for(let i=0;i<vertices.length;i++){const k=(i+1)%vertices.length;quad(glass,vertices[i],back[i],back[k],vertices[k],glassColor);}},axis,true,{...extra,outward:normal.toArray(),skylight:true});}
 function polygonSlabs(poly:Point[],y:number,name:string,color=stone){const faces=THREE.ShapeUtils.triangulateShape(poly.map(p=>new THREE.Vector2(p.x,p.z)),[]);for(const face of faces)for(let x=minX;x<maxX;x+=8)for(let z=minZ;z<maxZ;z+=8){let q=face.map(i=>poly[i]);for(const[k,v,g]of[['x',x,true],['x',x+8,false],['z',z,true],['z',z+8,false]]as const)q=clip(q,k,v,g);if(q.length<3||Math.abs(q.reduce((a,p,i)=>{const b=q[(i+1)%q.length];return a+p.x*b.z-b.x*p.z;},0))<.03)continue;slab(q,q.map(()=>y),.22,color,name);}}

 function solidBox(x:number,y:number,z:number,w:number,h:number,d:number,color:number,name:string,kind:'stone'|'metal'='stone'){component(kind,name,()=>box(kind==='stone'?concrete:details,world(x,y,z),new THREE.Vector3(w,h,d),color),axis);}
 function terraceRailing(f:ReturnType<typeof normalFace>,y:number,name:string){for(let u=0;u<f.length;u+=2){const b=Math.min(f.length,u+2);beam(f.at(u,y+1.0,.04),f.at(b,y+1.0,.04),.055,.055,name+'-top',dark);beam(f.at(u,y+.52,.04),f.at(b,y+.52,.04),.045,.045,name+'-mid',dark);beam(f.at(u,y,.04),f.at(u,y+1,.04),.05,.05,name+'-post',dark);}}
 function curtain(f:ReturnType<typeof normalFace>,a:number,b:number,y0:number,y1:number,name:string){if(b-a<.12||y1-y0<.12)return;const n=Math.ceil((b-a)/1.65);for(let i=0;i<n;i++){const l=a+(b-a)*i/n,r=a+(b-a)*(i+1)/n;component('glass',name,()=>{wallBox(glass,f.at,f.tangent,l,r,y0,y1,-.0875,.055,glassColor);for(const u of[i===n-1?l:l,...(i===n-1?[r]:[])])wallBox(details,f.at,f.tangent,u-.0375,u+.0375,y0,y1,.015,.075,frame);wallBox(details,f.at,f.tangent,l,r,y1-.04,y1+.04,.015,.08,frame);},f.tangent,false,{facade:true,closedFacade:true,outward:f.out.toArray()});}}

 function cladding(f:ReturnType<typeof normalFace>,a:number,b:number,y0:number,y1:number,color:number,name:string,thickness=.24,depth=-.02){if(b-a<.05||y1-y0<.05)return;component('stone',name,()=>{wallBox(concrete,f.at,f.tangent,a,b,y0,y1,depth,thickness,color);if(color===stone)for(let y=Math.ceil(y0/.45)*.45;y<y1-.06;y+=.45)faceQuad(details,f.at(a,y,depth+thickness/2+.007),f.at(b,y,depth+thickness/2+.007),f.at(b,y+.014,depth+thickness/2+.007),f.at(a,y+.014,depth+thickness/2+.007),0x72786f,f.out);if(color===brown)for(let y=Math.ceil(y0/.56)*.56;y<y1-.06;y+=.56)faceQuad(details,f.at(a,y,depth+thickness/2+.007),f.at(b,y,depth+thickness/2+.007),f.at(b,y+.014,depth+thickness/2+.007),f.at(a,y+.014,depth+thickness/2+.007),0x66493f,f.out);},f.tangent);}
 function eave(poly:Point[],y:number,depth:number,height:number,name:string){
  const outer=poly.map((p,i)=>{const prev=poly[(i+poly.length-1)%poly.length],next=poly[(i+1)%poly.length],la=Math.hypot(p.x-prev.x,p.z-prev.z),lb=Math.hypot(next.x-p.x,next.z-p.z),a={x:(p.x-prev.x)/la,z:(p.z-prev.z)/la},b={x:(next.x-p.x)/lb,z:(next.z-p.z)/lb},q={x:p.x+a.z*depth,z:p.z-a.x*depth},r={x:p.x+b.z*depth,z:p.z-b.x*depth},det=a.x*b.z-a.z*b.x;if(Math.abs(det)<1e-6)return{x:(q.x+r.x)/2,z:(q.z+r.z)/2};const t=((r.x-q.x)*b.z-(r.z-q.z)*b.x)/det;return{x:q.x+t*a.x,z:q.z+t*a.z};});
  for(let i=0;i<poly.length;i++){const j=(i+1)%poly.length,steps=Math.ceil(Math.hypot(poly[j].x-poly[i].x,poly[j].z-poly[i].z)/5);for(let k=0;k<steps;k++){const mix=(a:Point,b:Point,t:number)=>({x:THREE.MathUtils.lerp(a.x,b.x,t),z:THREE.MathUtils.lerp(a.z,b.z,t)}),a=mix(poly[i],poly[j],k/steps),b=mix(poly[i],poly[j],(k+1)/steps),c=mix(outer[i],outer[j],(k+1)/steps),d=mix(outer[i],outer[j],k/steps),q=[a,b,c,d];if(q.reduce((s,p,n)=>s+p.x*q[(n+1)%4].z-q[(n+1)%4].x*p.z,0)<0)q.reverse();const f=normalFace(d,c);
   component('metal',name,()=>{const top=q.map(p=>world(p.x,y,p.z)),bottom=q.map(p=>world(p.x,y-height,p.z));for(let n=1;n<3;n++){tri(details,top[0],top[n+1],top[n],dark);tri(details,bottom[0],bottom[n],bottom[n+1],dark);}for(let n=0;n<4;n++)quad(details,bottom[n],bottom[(n+1)%4],top[(n+1)%4],top[n],dark);for(let u=0;u<f.length;u+=.45)faceQuad(details,f.at(u,y-height,.008),f.at(Math.min(f.length,u+.035),y-height,.008),f.at(Math.min(f.length,u+.035),y,.008),f.at(u,y,.008),0x525b5a,f.out);},axis,true,{continuousMiteredEave:true});
  }}
 }

 // 원본 외곽의 기초를 유지한다. 창의 하단만 경사지에서 드러나는 높이에 맞춘다.
 for(let i=0;i<points.length;i++){
  const f=normalFace(points[i],points[(i+1)%points.length]);const isAnnex=i>=5&&i<=12;if(isAnnex)continue;
  const north=i===2,doorEdge=north,doorU=(entry.x-points[i].x)/f.dx,door0=doorU-entry.width/2,door1=doorU+entry.width/2,cuts=[0,f.length];for(let u=5;u<f.length;u+=5)cuts.push(u);if(doorEdge)cuts.push(Math.max(0,door0),Math.min(f.length,door1));cuts.sort((a,b)=>a-b);
  for(let k=0;k+1<cuts.length;k++){const a=cuts[k],b=cuts[k+1];if(b-a<.1)continue;const mid=(a+b)/2,insideDoor=doorEdge&&mid>door0&&mid<door1,foot=Math.min(ground(points[i].x+f.dx*a,points[i].z+f.dz*a),ground(points[i].x+f.dx*b,points[i].z+f.dz*b))-.5;
   let clear=-Infinity;for(let u=a;u<=b+.001;u+=(b-a)/10)for(const d of[-.16,.16]){const q=f.at(u,0,d);clear=Math.max(clear,heightAt(q.x,q.z)-base);}
   if(insideDoor){cladding(f,a,b,floor+entry.height,mainTop,stone,'entry-lintel');continue;}
   const sill=Math.max(floor+.18,clear+.18),head=4.75,window=Math.min(1.55,(b-a)*.46),left=mid-window/2,right=mid+window/2;
   if(head>sill+.35){cladding(f,a,left,foot,mainTop,stone,'rough-stone-pier');cladding(f,right,b,foot,mainTop,stone,'rough-stone-pier');cladding(f,left,right,foot,sill,stone,'rough-stone-sill');cladding(f,left,right,head,mainTop,stone,'rough-stone-head');curtain(f,left,right,sill,head,'ground-vertical-glass');}
   else cladding(f,a,b,foot,mainTop,stone,'terrain-exposed-stone');

  }
 }
 // 긴 상부는 갈색 컨벤션 몸체와 낮게 후퇴한 띠창을 구분한다.
 const brownPoly=[{x:18,z:1.4},{x:50.6,z:1.4},{x:50.6,z:30.9},{x:18,z:30.9}],lowPoly=[{x:-1.7,z:1.2},{x:18,z:1.2},{x:18,z:31.4},{x:-1.7,z:31.4}];
 for(let i=0;i<brownPoly.length;i++){const f=normalFace(brownPoly[i],brownPoly[(i+1)%brownPoly.length]);for(let u=0;u<f.length;u+=5){const b=Math.min(f.length,u+5),long=i===0||i===2;cladding(f,u,b,mainTop,8.65,brown,'brown-convention-wall');if(long){curtain(f,u,b,8.65,9.4,'upper-recessed-ribbon');cladding(f,u,b,9.4,11.4,brown,'brown-upper-panel');}else cladding(f,u,b,8.65,11.4,brown,'brown-end-wall');}}
 polygonSlabs(brownPoly,11.4,'convention-roof',0x666c67);eave(brownPoly,9.55,1.5,.28,'deep-upper-eave');
 // 사진에 보이는 높이가 다른 세 사각 상부 덩어리는 별도 파괴 가능한 벽과 지붕으로 나눈다.
 for(const[x0,x1,z0,z1,y]of[[23,38,5,29,11.65],[40,43.5,4,30,12.6],[46,50.3,7,29,12.1]]){const poly=[{x:x0,z:z0},{x:x1,z:z0},{x:x1,z:z1},{x:x0,z:z1}];for(let i=0;i<4;i++){const f=normalFace(poly[i],poly[(i+1)%4]);for(let u=0;u<f.length;u+=5)cladding(f,u,Math.min(f.length,u+5),11.4,y,brown,'raised-roof-wall');}polygonSlabs(poly,y,'raised-roof-top',0x795544);}
 for(let i=0;i<lowPoly.length;i++){const f=normalFace(lowPoly[i],lowPoly[(i+1)%lowPoly.length]);for(let u=0;u<f.length;u+=5){const b=Math.min(f.length,u+5);cladding(f,u,b,mainTop,6.25,0x77746a,'upper-low-spandrel');curtain(f,u,b,6.25,8.35,'upper-low-ribbon');cladding(f,u,b,8.35,8.75,0x77746a,'upper-low-head');}}polygonSlabs(lowPoly,8.75,'low-wing-roof',0x686f69);
 eave(main,5.65,1.9,.72,'main-black-eave');
 // 서쪽 다각형 식당의 두 유리 레벨과 상부 후퇴를 원본 지도 외곽 안에서 재현한다.
 for(const[poly,bottom,top,upper]of[[annex,floor+.12,4.75,false],[upperAnnex,5.1,8.85,true]]as const){for(let i=0;i<poly.length;i++){const f=normalFace(poly[i],poly[(i+1)%poly.length]);const closes=i===poly.length-1;if(closes)continue;let terrain=-Infinity;for(let u=0;u<=f.length+.001;u+=f.length/12){const p=f.at(u,0,-.06);terrain=Math.max(terrain,heightAt(p.x,p.z)-base);}const sill=Math.max(bottom,terrain+.19);curtain(f,0,f.length,sill,top,upper?'restaurant-upper-glass':'restaurant-lower-glass');if(!upper)cladding(f,0,f.length,floor-.25,sill,0x8f9387,'restaurant-floor-edge');if(upper)terraceRailing(normalFace(annex[i],annex[(i+1)%annex.length]),4.96,'restaurant-terrace');}}
 polygonSlabs(annex,floor,'restaurant-floor',0xb3b4aa);polygonSlabs(annex,4.95,'restaurant-upper-floor',0xa3a69c);polygonSlabs(upperAnnex,9.2,'restaurant-roof',0x4d5551);eave(annex,5.12,.55,.23,'restaurant-floor-band');eave(upperAnnex,9.2,2.1,.42,'restaurant-deep-roof');
 for(const[x,z]of[[-19,11],[-20,21],[-12,8],[-12,24]]){const y=ground(x,z)-.1;solidBox(x,(y+floor)/2,z,.65,floor-y,.65,stone,'restaurant-support-column');}
 // 사진의 중앙 유리 접속부를 단순한 빈 홀로 두고 방이나 가구는 만들지 않는다.
 polygonSlabs(galleryPoly,9.7,'central-gallery-roof',0x727b73);for(const z of[9.7,24.2]){const f=normalFace(z===9.7?{x:-7.6,z}:{x:7,z},z===9.7?{x:7,z}:{x:-8.5,z});curtain(f,0,f.length,floor+.1,9.35,'central-tall-glass');for(let u=0;u<f.length;u+=3.2){beam(f.at(u,floor,.15),f.at(u,9.6,.15),.32,.32,'central-gallery-column',0xb7b5a6);}}
 // 북측 출입은 독립 문과 얕은 접근판으로 연결한다. 처마 아래 기둥 사이에는 충돌체가 없다.
 const northEdge=normalFace(points[2],points[3]),doorCenter=northEdge.at((entry.x-points[2].x)/northEdge.dx,0,-.15);entry.z=(doorCenter.clone().sub(new THREE.Vector3(origin.x,base,origin.z))).dot(across);entry.x=(doorCenter.clone().sub(new THREE.Vector3(origin.x,base,origin.z))).dot(axis);
 component('glass','faculty-club-entry-door',()=>box(glass,world(entry.x,floor+entry.height/2,entry.z),new THREE.Vector3(entry.width,entry.height,.07),glassColor),axis,false,{entrance:true,outward:across.toArray()});
 for(const x of[entry.x-entry.width/2,entry.x+entry.width/2])beam(world(x,floor,entry.z+.06),world(x,floor+entry.height,entry.z+.06),.1,.1,'entry-frame',frame);
 const canopy={x0:entry.x-5.8,x1:entry.x+5.8,z0:entry.z-.3,z1:entry.z+4.4,y:4.25};
 for(let x=canopy.x0;x<canopy.x1;x+=4)rectangularSlab(x,Math.min(canopy.x1,x+4),canopy.z0,canopy.z1,canopy.y,canopy.y,canopy.y,canopy.y,'north-entry-canopy',dark,.32);
 for(const x of[canopy.x0+.4,canopy.x1-.4]){const z=canopy.z1-.3,y=ground(x,z);solidBox(x,(y+canopy.y)/2,z,.28,canopy.y-y,.28,0x868d88,'north-canopy-column','metal');}
 const accessZ=entry.z+6,apronStart=entry.z+2.1,accessWidth=3.8,lanes=6,steps=8,accessTops:number[][]=[];
 for(let lane=0;lane<lanes;lane++){const x0=entry.x-accessWidth/2+lane*accessWidth/lanes,x1=x0+accessWidth/lanes,heights:number[]=[];for(let i=0;i<steps;i++){const z1=accessZ-(accessZ-apronStart)*i/steps,z0=accessZ-(accessZ-apronStart)*(i+1)/steps;let terrain=-Infinity;for(const x of[x0,(x0+x1)/2,x1])for(const z of[z0,(z0+z1)/2,z1])terrain=Math.max(terrain,ground(x,z));heights.push(Math.max(terrain+.08,THREE.MathUtils.lerp(ground((x0+x1)/2,accessZ)+.08,floor,i/(steps-1))));}heights[steps-1]=floor;for(let i=steps-2;i>=0;i--)heights[i]=Math.max(heights[i],heights[i+1]-.24);for(let i=0;i<steps;i++){const z1=accessZ-(accessZ-apronStart)*i/steps,z0=accessZ-(accessZ-apronStart)*(i+1)/steps;rectangularSlab(x0,x1,z0,z1,heights[i],heights[i],heights[i],heights[i],'entry-access-step',0xb3b6ad,.13);}accessTops.push(heights);}
 for(let x=entry.x-5.5;x<entry.x+5.5;x+=3)rectangularSlab(x,Math.min(entry.x+5.5,x+3),entry.z-7,apronStart,floor,floor,floor,floor,'entry-apron-floor',0xadafa3);
 const route=[{x:entry.x,z:accessZ+1.4},{x:entry.x,z:entry.z+1.2},{x:entry.x,z:entry.z-5}];
 Object.assign(shell.userData,{entry,entries:[entry],canopy,access:{route,width:accessWidth,steps,tops:accessTops,estimated:true},voids:[{kind:'canopy-gap',x:entry.x,z:entry.z+3,y:2.0,width:8.5,depth:2.3}],dimensions:{height:12.6,width:maxX-minX,depth:maxZ-minZ},materialAssumptions:'사진의 갈색 패널과 검정 금속 띠를 색과 기하로 근사했다. 재질의 제품명은 미확인이다.'});

  for(const[s,name,roughness]of[[concrete,'solid',.86],[details,'frames',.64],[glass,'glazing',.24]]as const){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(s.positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(s.colors,3));(geometry.getAttribute('position')as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);geometry.computeVertexNormals();geometry.computeBoundingSphere();geometry.computeBoundingBox();s.geometry=geometry;const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness,metalness:s===glass?.18:.02}));mesh.name='faculty-club-'+name;mesh.receiveShadow=true;shell.add(mesh);s.positions.length=0;s.colors.length=0;}
  function update(_player:THREE.Vector3){const changed=new Set<Surface>();for(const part of parts)if(part.shown!==part.proxy.visible){part.shown=part.proxy.visible;for(const r of part.ranges){if(r.start===r.end)continue;const attr=r.surface.geometry!.getAttribute('position')as THREE.BufferAttribute;if(!changed.has(r.surface))attr.clearUpdateRanges();changed.add(r.surface);if(part.shown)(attr.array as Float32Array).set(r.original,r.start);else for(let i=r.start;i<r.end;i+=3){attr.array[i]=part.proxy.position.x;attr.array[i+1]=part.proxy.position.y;attr.array[i+2]=part.proxy.position.z;}attr.addUpdateRange(r.start,r.end-r.start);}}for(const s of changed)s.geometry!.getAttribute('position').needsUpdate=true;shell.visible=parts.some(p=>p.proxy.visible);}
  return{breakables,update};
}
