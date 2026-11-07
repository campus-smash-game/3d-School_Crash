import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { CampusBuilding } from './fullCampus';
import type { BuildingAppearance } from './buildingAppearance';
import type { BreakableSpec } from './scene';
import { engineering301303Datum, ENGINEERING_CONNECTION_SITE } from './engineering301303Site';
type Point={x:number;z:number};
type Surface={positions:number[];colors:number[];geometry?:THREE.BufferGeometry};
type Range={surface:Surface;start:number;end:number;original:Float32Array};
type Part={proxy:THREE.Mesh;shown:boolean;ranges:Range[]};

export type Engineering303Layout = { datumSample?: {x:number;z:number}; entryOffset?:number; deckDepth?:number; bridge?:{points:[number,number][];width:number;relativeHeight:number} };

// 공식 사진의 상대 형태와 별도 근사 외곽을 사용한다. 높이와 접속 치수는 측량값이 아니다.
export function createEngineering303Landmark(scene:THREE.Scene,building:CampusBuilding,profile:BuildingAppearance,heightAt:(x:number,z:number)=>number,layout:Engineering303Layout={}){
 const landmark='engineering-303',mapped=building.points.filter((p,i,a)=>i!==a.length-1||p[0]!==a[0][0]||p[1]!==a[0][1]);if(mapped.length<3)throw Error('Engineering 303 requires an outline.');
 let twiceArea=0,cx=0,cz=0;for(let i=0;i<mapped.length;i++){const a=mapped[i],b=mapped[(i+1)%mapped.length],cross=a[0]*b[1]-b[0]*a[1];twiceArea+=cross;cx+=(a[0]+b[0])*cross;cz+=(a[1]+b[1])*cross;}const origin=Math.abs(twiceArea)>1e-6?{x:cx/(3*twiceArea),z:cz/(3*twiceArea)}:{x:mapped[0][0],z:mapped[0][1]},axis=new THREE.Vector3(1,0,0),across=new THREE.Vector3(0,0,1),up=new THREE.Vector3(0,1,0);
 const sample=layout.datumSample??ENGINEERING_CONNECTION_SITE.anchor,base=layout.datumSample?heightAt(sample.x,sample.z):engineering301303Datum(heightAt).base303,world=(x:number,y:number,z:number)=>new THREE.Vector3(origin.x+x,base+y,origin.z+z),ground=(x:number,z:number)=>heightAt(origin.x+x,origin.z+z)-base;
 const points=mapped.map(p=>({x:p[0]-origin.x,z:p[1]-origin.z}));if(points.reduce((s,a,i)=>{const b=points[(i+1)%points.length];return s+a.x*b.z-b.x*a.z;},0)<0)points.reverse();
 const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minZ=Math.min(...points.map(p=>p.z)),maxZ=Math.max(...points.map(p=>p.z)),depth=maxZ-minZ,width=maxX-minX;
 const shell=new THREE.Group();shell.name=building.id+':'+landmark;Object.assign(shell.userData,{buildingId:building.id,role:'building-shell',landmark,appearance:profile,localOrigin:{x:origin.x,y:base,z:origin.z},axis:{x:1,z:0},frontFacing:{x:1,z:0},baseSample:sample,mappedOutline:mapped.map(p=>p.slice()),mappedOutlinePreserved:true,sourcePointCount:mapped.length,footprintEstimated:true,terrainPad:false,heightEstimated:true,documentedAboveGroundLevels:7,basementLevels:null,entryLevel:2,pilotiLevel:1,datumSurveyed:false,entries:[],stairs:[],galleries:[],voids:[]});scene.add(shell);
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

  function exposedStrip(surface:Surface,at:(u:number,y:number,d?:number)=>THREE.Vector3,ex:THREE.Vector3,a:number,b:number,y0:number,y1:number,depth:number,thickness:number,color:number,faces:number[]){
    if(b-a<.005||y1-y0<.005)return;const centre=at((a+b)/2,(y0+y1)/2,depth),ez=new THREE.Vector3().crossVectors(ex,up).normalize(),tint=new THREE.Color(color);
    for(let i=0;i<cubeVertices.count;i++){if(!faces.includes(Math.floor(i/6)))continue;const p=centre.clone().addScaledVector(ex,cubeVertices.getX(i)*(b-a)).addScaledVector(up,cubeVertices.getY(i)*(y1-y0)).addScaledVector(ez,cubeVertices.getZ(i)*thickness);surface.positions.push(p.x,p.y,p.z);surface.colors.push(tint.r,tint.g,tint.b);}
  }





 const stone=0xd1d0c8,frame=0x45545b,glassColor=0x769299,timber=0xb58653,dark=0x485052,roadWhite=0xe1e5e2;
 const az0=minZ+depth*.29,az1=maxZ-depth*.31,span=az1-az0,entryFloor=3.8+(layout.entryOffset??0);
 const southPoly=clip(points,'z',az0,false),northPoly=clip(points,'z',az1,true),centralPoly=clip(clip(points,'z',az0,true),'z',az1,false);
 const backX=Math.min(...centralPoly.map(p=>p.x)),frontX=Math.max(...centralPoly.map(p=>p.x)),entryZ=az0+span*.66;
 const bounds={minX,maxX,minZ,maxZ},south={poly:southPoly,roof:28,largeWindowRows:5,estimated:true},north={poly:northPoly,roof:24,largeWindowRows:3,shortWindowRows:1,estimated:true};
 const entry={x:frontX-1.8,z:entryZ,width:4.8,floor:entryFloor,height:3.1,officialLevel:2,estimated:true};
 const atrium={minX:backX,maxX:frontX,minZ:az0,maxZ:az1,floor:entryFloor,roofMin:22.2,roofMax:27,estimated:true};
 Object.assign(shell.userData,{bounds,dimensions:{width,depth,height:28},south,north,atrium,entry,entrance:entry,datum:{sample,base,kind:'shared-road-centreline-game-datum',surveyed:false},bridge:{implemented:false,reason:'공유 연결부에서 한 번만 생성한다.',owner:'connection/engineering301-303'}});
 function normalFace(a:Point,b:Point){const length=Math.hypot(b.x-a.x,b.z-a.z),dx=(b.x-a.x)/length,dz=(b.z-a.z)/length,tangent=new THREE.Vector3(dx,0,dz),out=new THREE.Vector3(dz,0,-dx),at=(u:number,y:number,d=0)=>world(a.x+dx*u,y,a.z+dz*u).addScaledVector(out,d);return{length,dx,dz,tangent,out,at};}
 function beam(a:THREE.Vector3,b:THREE.Vector3,w:number,h:number,name:string,color=timber){if(a.distanceTo(b)<.01)return;const ex=b.clone().sub(a).normalize(),ey=up.clone().addScaledVector(ex,-up.dot(ex));if(ey.length()<.01)ey.copy(axis);ey.normalize();component('metal',name,()=>box(details,a.clone().add(b).multiplyScalar(.5),new THREE.Vector3(a.distanceTo(b),w,h),color,ex,ey),axis,true);}
 function pane(vertices:THREE.Vector3[],normal:THREE.Vector3,name:string,extra:Record<string,unknown>={}){if(vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0])).dot(normal)<0)vertices=vertices.slice().reverse();component('glass',name,()=>{const back=vertices.map(p=>p.clone().addScaledVector(normal,-.055));for(let i=1;i+1<vertices.length;i++){const a=vertices[0],b=vertices[i],c=vertices[i+1];if(b.clone().sub(a).cross(c.clone().sub(a)).dot(normal)<0){tri(glass,a,c,b,glassColor);tri(glass,back[0],back[i],back[i+1],glassColor);}else{tri(glass,a,b,c,glassColor);tri(glass,back[0],back[i+1],back[i],glassColor);}}for(let i=0;i<vertices.length;i++){const k=(i+1)%vertices.length;quad(glass,vertices[i],back[i],back[k],vertices[k],glassColor);}},axis,true,{...extra,outward:normal.toArray(),skylight:true});}
 function polygonSlabs(poly:Point[],y:number,name:string,color=stone){const faces=THREE.ShapeUtils.triangulateShape(poly.map(p=>new THREE.Vector2(p.x,p.z)),[]);for(const face of faces)for(let x=minX;x<maxX;x+=8)for(let z=minZ;z<maxZ;z+=8){let q=face.map(i=>poly[i]);for(const[k,v,g]of[['x',x,true],['x',x+8,false],['z',z,true],['z',z+8,false]]as const)q=clip(q,k,v,g);if(q.length<3||Math.abs(q.reduce((a,p,i)=>{const b=q[(i+1)%q.length];return a+p.x*b.z-b.x*p.z;},0))<.03)continue;slab(q,q.map(()=>y),.22,color,name);}}
 function windowBay(f:ReturnType<typeof normalFace>,a:number,b:number,bottom:number,top:number,short:boolean,name:string,extra:Record<string,unknown>={}){
  if(extra.roadviewFacade){
   const east=extra.roadviewFacade==='east-pairs',sill=bottom+.86,head=top-.68,transom=head-.30,at=f.at;
   component('glass',name,()=>{
    const strip=(l:number,r:number,y0:number,y1:number)=>wallBox(concrete,at,f.tangent,l,r,y0,y1,-.03,.24,roadWhite);
    strip(a,b,bottom,sill);strip(a,b,head,top);
    const groups=east?1:3,pitch=(b-a)/groups;
    for(let i=0;i<groups;i++){
     const l=a+i*pitch,r=l+pitch,ratio=i===0?.46:.30;
     const openings=east?[[l+pitch*.16,l+pitch*.46],[l+pitch*.67,l+pitch*.82]]:[[l+pitch*(1-ratio)/2,r-pitch*(1-ratio)/2]];
     let cursor=l;
     for(const[left,right]of openings){
      strip(cursor,left,sill,head);cursor=right;
      faceQuad(glass,at(left,sill,-.20),at(right,sill,-.20),at(right,transom-.025,-.20),at(left,transom-.025,-.20),0x8fa8ac,f.out);
      faceQuad(glass,at(left,transom+.025,-.20),at(right,transom+.025,-.20),at(right,head,-.20),at(left,head,-.20),0x71858a,f.out);
      for(const x of[left,right])wallBox(details,at,f.tangent,x-.035,x+.035,sill,head,-.15,.08,0x98a4a1);
      wallBox(details,at,f.tangent,left,right,transom-.025,transom+.025,-.15,.08,0x98a4a1);
      for(const y of[head-.10,head-.20])wallBox(details,at,f.tangent,left,right,y-.012,y+.012,-.15,.03,0x98a4a1);
      faceQuad(details,at(left,sill,-.20),at(left,sill,.09),at(left,head,.09),at(left,head,-.20),0xcbd2cf,f.out.clone().add(f.tangent).normalize());
      faceQuad(details,at(right,sill,.09),at(right,sill,-.20),at(right,head,-.20),at(right,head,.09),0xecf0ed,f.out.clone().sub(f.tangent).normalize());
     }
     strip(cursor,r,sill,head);
     for(const x of[l,r])for(const[y0,y1]of[[bottom,sill],[head,top]])faceQuad(details,at(x-.006,y0,.092),at(x+.006,y0,.092),at(x+.006,y1,.092),at(x-.006,y1,.092),0xb7c0bc,f.out);
    }
    for(const y of[bottom+.25,bottom+.56,head+.30,top-.025])faceQuad(details,at(a,y-.006,.092),at(b,y-.006,.092),at(b,y+.006,.092),at(a,y+.006,.092),0xb7c0bc,f.out);
   },f.tangent,false,{...extra,closedFacade:true,outward:f.out.toArray()});
   return;
  }
  if(b-a<.3)return;const sill=bottom+(short?1.72:.8),head=short?Math.min(top-.5,sill+.85):top-.65;
  component('glass',name,()=>{const at=f.at,strip=(a:number,b:number,y0:number,y1:number,d=-.03,t=.24)=>wallBox(concrete,at,f.tangent,a,b,y0,y1,d,t,stone);strip(a,b,bottom,sill);strip(a,b,head,top);const count=Math.max(1,Math.round((b-a)/2.6)),pitch=(b-a)/count;
   for(let i=0;i<count;i++){const l=a+i*pitch,r=l+pitch,left=l+pitch*.28,right=r-pitch*.28;strip(l,left,sill,head);strip(right,r,sill,head);const vertices=[at(left,sill,-.20),at(right,sill,-.20),at(right,head,-.20),at(left,head,-.20)];faceQuad(glass,...vertices as [THREE.Vector3,THREE.Vector3,THREE.Vector3,THREE.Vector3],glassColor,f.out);
    for(const x of[left,right])wallBox(details,at,f.tangent,x-.035,x+.035,sill,head,-.15,.08,frame);wallBox(details,at,f.tangent,left,right,head-.38,head-.33,-.15,.08,frame);
    faceQuad(details,at(left,sill,-.20),at(left,sill,.09),at(left,head,.09),at(left,head,-.20),0xc0c1bc,f.out.clone().add(f.tangent).normalize());faceQuad(details,at(right,sill,.09),at(right,sill,-.20),at(right,head,-.20),at(right,head,.09),0xe1dfd4,f.out.clone().sub(f.tangent).normalize());
   }
   wallBox(details,f.at,f.tangent,a,b,top-.025,top+.005,.10,.018,0xbbbcb7);
  },f.tangent,false,{...extra,closedFacade:true,outward:f.out.toArray()});
 }
 function curtain(f:ReturnType<typeof normalFace>,a:number,b:number,y0:number,y1:number,name:string){if(b-a<.1||y1-y0<.1)return;const n=Math.ceil((b-a)/2);for(let i=0;i<n;i++){const l=a+(b-a)*i/n,r=a+(b-a)*(i+1)/n;pane([f.at(l,y0),f.at(r,y0),f.at(r,y1),f.at(l,y1)],f.out,name);for(const u of(i===n-1?[l,r]:[l]))beam(f.at(u,y0,.04),f.at(u,y1,.04),.075,.075,'curtain-mullion',frame);}}
 function wing(poly:Point[],which:'south'|'north'){
  const southWing=which==='south',roof=southWing?28:24,levels=southWing?[7.2,11,14.8,18.6,22.4,26.2]:[7.2,10.8,14.6,18.4,22.2];
  for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],f=normalFace(a,b);if(f.length<.1)continue;const eastRoadFace=southWing&&f.out.x>.8,bays=eastRoadFace?3:Math.max(1,Math.ceil(f.length/5.6));for(let k=0;k<bays;k++){const l=f.length*k/bays,r=f.length*(k+1)/bays,mid=(l+r)/2;
    // 로드뷰에서 보인 동쪽 면과 아트리움에 가까운 모서리 한 구획만 보완한다.
    const roadviewFacade=eastRoadFace?'east-pairs':southWing&&f.out.z>.8&&a.x+f.dx*mid>Math.max(...southPoly.map(p=>p.x))-6?'atrium-corner':undefined;
    for(let row=0;row+1<levels.length;row++)windowBay(f,l,r,levels[row],levels[row+1],!southWing&&row===0,which+'-punched-window',{wing:which,row,...(roadviewFacade?{roadviewFacade}: {})});
    component('stone',which+'-roof-parapet',()=>wallBox(concrete,f.at,f.tangent,l,r,levels.at(-1)!,roof,-.03,.25,roadviewFacade?roadWhite:stone),f.tangent,false,roadviewFacade?{roadviewFacade}:{});
    const piloti=!southWing&&(f.out.x<-.3||f.out.z>.45);if(!piloti){if(!eastRoadFace)curtain(f,l,r,entryFloor+.1,7.2,which+'-lower-glass');if(southWing&&f.out.x<-.6)curtain(f,l,r,.16,entryFloor-.2,which+'-western-first-floor-glass');}
    else shell.userData.voids.push({kind:'piloti',edge:i,center:f.at(mid,3),width:r-l-.6,outward:f.out.toArray()});
  }if(eastRoadFace){const lowerBays=Math.max(1,Math.ceil(f.length/5.6));for(let k=0;k<lowerBays;k++)curtain(f,f.length*k/lowerBays,f.length*(k+1)/lowerBays,entryFloor+.1,7.2,which+'-lower-glass');}}
  if(!southWing){const sites:THREE.Vector3[]=[];for(let i=0;i<poly.length;i++){const f=normalFace(poly[i],poly[(i+1)%poly.length]);if(!(f.out.x<-.3||f.out.z>.45))continue;const columns=Math.max(1,Math.round(f.length/7.5));for(let j=0;j<columns;j++){const p=f.at(f.length*(j+.5)/columns,0,-.4);if(sites.some(q=>Math.hypot(q.x-p.x,q.z-p.z)<3))continue;sites.push(p);const bottom=heightAt(p.x,p.z)-base-.1;beam(new THREE.Vector3(p.x,base+bottom,p.z),new THREE.Vector3(p.x,base+7.2,p.z),.6,.6,'piloti-column',0xc4c8c4);}}shell.userData.pilotiColumns={nominalSpacing:7.5,minimumCornerSpacing:3,estimated:true,positions:sites.map(p=>p.toArray())};}
  polygonSlabs(poly,roof-.30,which+'-roof');polygonSlabs(poly,7.2,which+'-first-upper-floor');
 }
 wing(southPoly,'south');wing(northPoly,'north');
 // 서측 사진의 북쪽 열린 하부는 중간 테라스 판 아래 주차 기둥층과 위쪽 빈 층으로 나뉜다.
 const terracePoly=northPoly.map(p=>({...p}));
 polygonSlabs(terracePoly,entryFloor,'north-west-open-terrace',0xb8b9af);
 for(let i=0;i<northPoly.length;i++){const f=normalFace(northPoly[i],northPoly[(i+1)%northPoly.length]);if(f.out.x>-.5)continue;for(let u=0;u<f.length;u+=4){const v=Math.min(f.length,u+4);for(const h of[.55,1.05])beam(f.at(u,entryFloor+h,-.12),f.at(v,entryFloor+h,-.12),.06,.06,'north-terrace-rail',dark);beam(f.at(u,entryFloor,-.12),f.at(u,entryFloor+1.05,-.12),.06,.06,'north-terrace-post',dark);}}
 shell.userData.northTerrace={poly:terracePoly,y:entryFloor,estimated:true,source:'서측 공식 사진의 중간 테라스 판을 북쪽 몸체 안쪽으로 이어 두 층을 나눴다. 안쪽 깊이와 높이는 게임용 근사다.'};

 // 가운데는 한 장의 바닥과 좁은 회랑만 두며 층 전체를 채우지 않는다.
 const entryFloorPoly=centralPoly.map(p=>({x:p.x>(backX+frontX)/2?Math.max(p.x,entry.x+.15):p.x,z:p.z}));
 polygonSlabs(entryFloorPoly,entryFloor,'atrium-entry-floor',0xc0c1ba);
 const galleryWidth=1.9,galleryX0=backX+1.1,galleryX1=frontX-3.1,entryX=entry.x;
 for(const y of[7.6,11.4,15.2,19])for(const z of[az0,az1-galleryWidth])for(let x=galleryX0;x<galleryX1;x+=7){const x1=Math.min(galleryX1,x+7);rectangularSlab(x,x1,z,z+galleryWidth,y,y,y,y,'atrium-side-gallery',0xb6b7b1);const railZ=z===az0?z+galleryWidth:z;for(const h of[.5,1.05])beam(world(x,y+h,railZ),world(x1,y+h,railZ),.05,.05,'gallery-rail',dark);for(const xx of[x,x1])beam(world(xx,y,railZ),world(xx,y+1.05,railZ),.05,.05,'gallery-post',dark);shell.userData.galleries.push({x0:x,x1,z0:z,z1:z+galleryWidth,y});}
 for(const[y,t]of[[11.4,.30],[19,.66]]){const x=THREE.MathUtils.lerp(galleryX0,galleryX1,t);for(let z=az0+galleryWidth;z<az1-galleryWidth;z+=6){const z1=Math.min(az1-galleryWidth,z+6);rectangularSlab(x,x+1.8,z,z1,y,y,y,y,'atrium-crossing-gallery',0xb8b9b1);for(const xx of[x,x+1.8]){beam(world(xx,y+1,z),world(xx,y+1,z1),.055,.055,'gallery-rail',dark);for(const zz of[z,z1])beam(world(xx,y,zz),world(xx,y+1,zz),.05,.05,'gallery-post',dark);}}}
 for(const x of[backX+2.4,frontX-4.0])for(const z of[az0+2.1,(az0+az1)/2,az1-2.1]){beam(world(x,entryFloor,z),world(x,23,z),.62,.62,'glulam-column');for(const y of[7.5,15.1]){const zz=z<entryZ?Math.min(az1-2,z+4.2):Math.max(az0+2,z-4.2);beam(world(x,y,z),world(x,y+7.2,zz),.46,.62,'glulam-diagonal');}}
 for(const z of[az0+2.1,(az0+az1)/2,az1-2.1])for(const y of[7.6,15.2,22.4])beam(world(backX+2.4,y,z),world(frontX-4,y,z),.5,.72,'glulam-horizontal');
 // 사진에서 보이는 파형 목재 보는 낮은 분할 수로 표현하며 사이 공간을 비운다.
 for(let z=az0+4;z<az1-3;z+=4.4)for(let k=0;k<10;k++){const x0=galleryX0+(galleryX1-galleryX0)*k/10,x1=galleryX0+(galleryX1-galleryX0)*(k+1)/10,y=(x:number)=>7.8+1.15*Math.sin((x-galleryX0)/(galleryX1-galleryX0)*Math.PI*2);beam(world(x0,y(x0),z),world(x1,y(x1),z),.28,.44,'hall-wave-beam');}
 const frontDepth=(z:number,y:number)=>{const t=(z-az0)/span,fold=t<.5?-.7+2.8*t:.7-1.4*(t-.5);const lower=THREE.MathUtils.clamp((y-entryFloor)/(13-entryFloor),0,1);return frontX-1.8+(1.8+fold)*lower;};
 const roofAt=(x:number,z:number)=>THREE.MathUtils.lerp(25.3,22.2,THREE.MathUtils.clamp((z-az0)/span,0,1))+(x<(backX+frontX)/2?1.5:0);
 const zCuts=[az0,az0+span*.25,az0+span*.5,az0+span*.75,az1,entryZ-entry.width/2,entryZ+entry.width/2].sort((a,b)=>a-b);
 for(const east of[true,false])for(let k=0;k+1<zCuts.length;k++){const z0=zCuts[k],z1=zCuts[k+1];if(z1-z0<.1)continue;for(let y=entryFloor;y<27;y+=2.8){const maxY=Math.min(roofAt(east?frontX:backX,z0),roofAt(east?frontX:backX,z1)),top=Math.min(y+2.8,maxY);if(top-y<.1)continue;const door=east&&z0>=entryZ-entry.width/2-.001&&z1<=entryZ+entry.width/2+.001;if(door&&y<entryFloor+entry.height-.001){if(top<=entryFloor+entry.height+.01)continue;y=entryFloor+entry.height;}
   const xAt=(z:number,yy:number)=>east?frontDepth(z,yy):backX+.6+1.1*Math.sin((z-az0)/span*Math.PI),v=[world(xAt(z0,y),y,z0),world(xAt(z1,y),y,z1),world(xAt(z1,top),top,z1),world(xAt(z0,top),top,z0)],normal=east?axis:axis.clone().negate();
   // 높이와 가로 접힘이 함께 있는 패널은 실제 렌더 삼각형별 얇은 판으로 나눈다.
   for(const idx of[[0,1,2],[0,2,3]])pane(idx.map(i=>v[i]),normal,east?'atrium-east-folded-glass':'atrium-west-folded-glass');for(const[a,b]of[[v[0],v[1]],[v[1],v[2]]])beam(a,b,.065,.065,'atrium-glass-frame',frame);
 }}
 // 중앙 지붕의 서쪽은 불투명, 동쪽은 경사진 유리로 나눈다.
 for(let x=backX;x<frontX;x+=4)for(let z=az0;z<az1;z+=4){const x1=Math.min(frontX,x+4),z1=Math.min(az1,z+4),poly=[{x,z},{x:x1,z},{x:x1,z:z1},{x,z:z1}],ys=poly.map(p=>roofAt(p.x,p.z));for(const idx of[[0,1,2],[0,2,3]]){const p=idx.map(i=>poly[i]),yy=idx.map(i=>ys[i]);if(x<(backX+frontX)/2)slab(p,yy,.18,0xb4aba0,'atrium-opaque-roof');else{pane(p.map((p,i)=>world(p.x,yy[i],p.z)),up,'atrium-sloped-roof-glass');beam(world(p[0].x,yy[0]+.04,p[0].z),world(p[1].x,yy[1]+.04,p[1].z),.09,.09,'roof-glass-frame',frame);}}}
 // 현관은 동측 2층 데크와 같은 높이에 둔다. 외부 다리는 이번 모델에 포함하지 않는다.
 component('glass','engineering303-entry-door',()=>{box(glass,world(entry.x,entry.floor+entry.height/2,entry.z),new THREE.Vector3(.065,entry.height,entry.width),glassColor);for(const z of[entry.z-entry.width/2,entry.z,entry.z+entry.width/2])box(details,world(entry.x+.035,entry.floor+entry.height/2,z),new THREE.Vector3(.075,entry.height,.06),frame);},across,false,{entrance:true,outward:axis.toArray()});

 const deckX1=frontX+(layout.deckDepth??5),deckZ0=az0-1,deckZ1=az1+3;
 for(let x=entry.x-.4;x<deckX1;x+=4)for(let z=deckZ0;z<deckZ1;z+=5){const xx=Math.min(deckX1,x+4),zz=Math.min(deckZ1,z+5);rectangularSlab(x,xx,z,zz,entryFloor,entryFloor,entryFloor,entryFloor,'east-deck',0xc8c8bd);}
 const deck={x0:entry.x-.4,x1:deckX1,z0:deckZ0,z1:deckZ1,y:entryFloor,bridge:false,estimated:true};shell.userData.deck=deck;
 for(const [z0,z1] of [[deckZ0,entry.z-4.2],[entry.z+4.2,deckZ1]])for(let z=z0;z<z1;z+=2){const zz=Math.min(z1,z+2);beam(world(deckX1,entryFloor+1.05,z),world(deckX1,entryFloor+1.05,zz),.06,.06,'deck-rail',dark);beam(world(deckX1,entryFloor,z),world(deckX1,entryFloor+1.05,z),.06,.06,'deck-post',dark);}
 for(const z of[deckZ0,deckZ1]){
  // 준공 사진의 북쪽 연결 덱에 맞춰 이 구간만 연다. 기존 덱과 현관의 높이는 유지한다.
  const spans=z===deckZ1?[[entry.x,302.6-origin.x],[305.8-origin.x,deckX1]]:[[entry.x,deckX1]];
  for(const[a,b]of spans)if(b>a)beam(world(a,entryFloor+1.05,z),world(b,entryFloor+1.05,z),.07,.07,'deck-end-rail',dark);
 }
 shell.userData.northConnectionOpening={x0:302.6,x1:305.8,z:origin.z+deckZ1,floor:base+entryFloor,owner:'connection/engineering303-312',estimated:true};
 // 로드뷰에서 확인한 하부 문은 상부 현관과 구분한다. 내부는 짧은 전실까지만 만든다.
 const lowerFloor=engineering301303Datum(heightAt).lower303-base,lower={x:entry.x,z:entry.z,width:4.2,height:2.8,floor:lowerFloor,levelNameVerified:false,estimated:true};
 rectangularSlab(entry.x-5,deckX1,entry.z-3.1,entry.z+3.1,lowerFloor,lowerFloor,lowerFloor,lowerFloor,'lower-entrance-floor',0xb7b9af);
 component('glass','engineering303-lower-entry-door',()=>{box(glass,world(lower.x,lower.floor+lower.height/2,lower.z),new THREE.Vector3(.065,lower.height,lower.width),glassColor);for(const z of[lower.z-lower.width/2,lower.z,lower.z+lower.width/2])box(details,world(lower.x+.035,lower.floor+lower.height/2,z),new THREE.Vector3(.075,lower.height,.06),frame);},across,false,{entrance:true,lowerEntrance:true,outward:axis.toArray()});
 for(const sign of[-1,1]){const z=entry.z+sign*(lower.width/2+.45);component('stone','lower-entry-recess-wall',()=>box(concrete,world(entry.x-2.45,lowerFloor+1.55,z),new THREE.Vector3(5.1,3.1,.18),stone),axis);}
 component('stone','lower-entry-lintel',()=>box(concrete,world(entry.x,lowerFloor+3.05,entry.z),new THREE.Vector3(.24,.5,lower.width+.9),stone),axis);
 component('stone','lower-mechanical-wall',()=>{box(concrete,world(entry.x,lowerFloor+1.6,entry.z-7),new THREE.Vector3(.2,3.2,8.9),0xc9ccc7);for(const z of[entry.z-4.4,entry.z-7.2,entry.z-9.8]){box(details,world(entry.x+.12,lowerFloor+1.5,z),new THREE.Vector3(.055,2.25,1.6),0xb2bbb8);for(let y=lowerFloor+.45;y<lowerFloor+2.6;y+=.18)box(details,world(entry.x+.16,y,z),new THREE.Vector3(.025,.035,1.5),0x8f9995);}},across);
 Object.assign(shell.userData,{lowerEntrance:lower,entries:[entry,lower],access:{managedByConnection:true,owner:'connection/engineering301-303',speed:6,estimated:true}});

  for(const[s,name,roughness]of[[concrete,'solid',.86],[details,'frames',.64],[glass,'glazing',.24]]as const){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(s.positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(s.colors,3));(geometry.getAttribute('position')as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);geometry.computeVertexNormals();geometry.computeBoundingSphere();geometry.computeBoundingBox();s.geometry=geometry;const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness,metalness:s===glass?.18:.02}));mesh.name='engineering303-'+name;mesh.receiveShadow=true;shell.add(mesh);s.positions.length=0;s.colors.length=0;}
  function update(_player:THREE.Vector3){const changed=new Set<Surface>();for(const part of parts)if(part.shown!==part.proxy.visible){part.shown=part.proxy.visible;for(const r of part.ranges){if(r.start===r.end)continue;const attr=r.surface.geometry!.getAttribute('position')as THREE.BufferAttribute;if(!changed.has(r.surface))attr.clearUpdateRanges();changed.add(r.surface);if(part.shown)(attr.array as Float32Array).set(r.original,r.start);else for(let i=r.start;i<r.end;i+=3){attr.array[i]=part.proxy.position.x;attr.array[i+1]=part.proxy.position.y;attr.array[i+2]=part.proxy.position.z;}attr.addUpdateRange(r.start,r.end-r.start);}}for(const s of changed)s.geometry!.getAttribute('position').needsUpdate=true;shell.visible=parts.some(p=>p.proxy.visible);}
  return{breakables,update};
}
