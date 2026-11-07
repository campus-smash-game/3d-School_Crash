import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { CampusBuilding } from './fullCampus';
import type { BuildingAppearance } from './buildingAppearance';
import type { BreakableSpec } from './scene';
type Point={x:number;z:number};
type Surface={positions:number[];colors:number[];geometry?:THREE.BufferGeometry};
type Range={surface:Surface;start:number;end:number;original:Float32Array};
type Part={proxy:THREE.Mesh;shown:boolean;ranges:Range[]};

// 공식 지도 사진과 2026년 외벽 도색 안내 사진의 형태를 사용한다. 치수와 입면 구간의 지도 대응은 추정이다.
export function createEngineering35Landmark(scene:THREE.Scene,building:CampusBuilding,profile:BuildingAppearance,heightAt:(x:number,z:number)=>number){
 const landmark='engineering-35',mapped=building.points.filter((p,i,a)=>i!==a.length-1||p[0]!==a[0][0]||p[1]!==a[0][1]);
 if(mapped.length!==24)throw Error('Engineering 35 requires its original 24 point outline.');
 const origin={x:mapped[18][0],z:mapped[18][1]},axis=new THREE.Vector3(mapped[19][0]-origin.x,0,mapped[19][1]-origin.z).normalize(),across=new THREE.Vector3(-axis.z,0,axis.x),up=new THREE.Vector3(0,1,0);
 const entryX=55,datumSample={x:origin.x+axis.x*entryX-across.x*4,z:origin.z+axis.z*entryX-across.z*4},base=heightAt(datumSample.x,datumSample.z);
 const world=(x:number,y:number,z:number)=>new THREE.Vector3(origin.x,base+y,origin.z).addScaledVector(axis,x).addScaledVector(across,z),ground=(x:number,z:number)=>{const p=world(x,0,z);return heightAt(p.x,p.z)-base;};
 const points=mapped.map(p=>{const d=new THREE.Vector3(p[0]-origin.x,0,p[1]-origin.z);return{x:d.dot(axis),z:d.dot(across)};});
 const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minZ=Math.min(...points.map(p=>p.z)),maxZ=Math.max(...points.map(p=>p.z));
 const shell=new THREE.Group();shell.name=building.id+':'+landmark;Object.assign(shell.userData,{buildingId:building.id,role:'building-shell',landmark,appearance:profile,localOrigin:{x:origin.x,y:base,z:origin.z},axis:{x:axis.x,z:axis.z},frontFacing:{x:across.x,z:across.z},datum:{sample:datumSample,base,surveyed:false,kind:'west-entrance-game-terrain'},mappedOutline:mapped.map(p=>p.slice()),mappedOutlinePreserved:true,sourcePointCount:mapped.length,levels:5,levelsEvidence:'OSM plus official fifth-floor use and five visible levels',designHeight:17.5,heightEstimated:true,highestModelPoint:17.5,bounds:{minX,maxX,minZ,maxZ},orientationEstimated:true});scene.add(shell);
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


 const stone=0xc4c8c3,brown=0x5f5e59,dark=0x414a49,frame=0xc5ceca,glassColor=profile.glassColor??0x668d97,timber=dark;
 function normalFace(a:Point,b:Point){const length=Math.hypot(b.x-a.x,b.z-a.z),dx=(b.x-a.x)/length,dz=(b.z-a.z)/length,tangent=axis.clone().multiplyScalar(dx).addScaledVector(across,dz),out=axis.clone().multiplyScalar(-dz).addScaledVector(across,dx),at=(u:number,y:number,d=0)=>world(a.x+dx*u,y,a.z+dz*u).addScaledVector(out,d);return{length,dx,dz,tangent,out,at};}
 function beam(a:THREE.Vector3,b:THREE.Vector3,w:number,h:number,name:string,color=timber){if(a.distanceTo(b)<.01)return;const ex=b.clone().sub(a).normalize(),ey=up.clone().addScaledVector(ex,-up.dot(ex));if(ey.length()<.01)ey.copy(axis);ey.normalize();component('metal',name,()=>box(details,a.clone().add(b).multiplyScalar(.5),new THREE.Vector3(a.distanceTo(b),w,h),color,ex,ey),axis,true);}
 function pane(vertices:THREE.Vector3[],normal:THREE.Vector3,name:string,extra:Record<string,unknown>={}){if(vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0])).dot(normal)<0)vertices=vertices.slice().reverse();component('glass',name,()=>{const back=vertices.map(p=>p.clone().addScaledVector(normal,-.055));for(let i=1;i+1<vertices.length;i++){const a=vertices[0],b=vertices[i],c=vertices[i+1];if(b.clone().sub(a).cross(c.clone().sub(a)).dot(normal)<0){tri(glass,a,c,b,glassColor);tri(glass,back[0],back[i],back[i+1],glassColor);}else{tri(glass,a,b,c,glassColor);tri(glass,back[0],back[i+1],back[i],glassColor);}}for(let i=0;i<vertices.length;i++){const k=(i+1)%vertices.length;quad(glass,vertices[i],back[i],back[k],vertices[k],glassColor);}},axis,true,{...extra,outward:normal.toArray(),skylight:true});}
 function polygonSlabs(poly:Point[],y:number,name:string,color=stone){const faces=THREE.ShapeUtils.triangulateShape(poly.map(p=>new THREE.Vector2(p.x,p.z)),[]);for(const face of faces)for(let x=minX;x<maxX;x+=8)for(let z=minZ;z<maxZ;z+=8){let q=face.map(i=>poly[i]);for(const[k,v,g]of[['x',x,true],['x',x+8,false],['z',z,true],['z',z+8,false]]as const)q=clip(q,k,v,g);if(q.length<3||Math.abs(q.reduce((a,p,i)=>{const b=q[(i+1)%q.length];return a+p.x*b.z-b.x*p.z;},0))<.03)continue;slab(q,q.map(()=>y),.22,color,name);}}

 function solidBox(x:number,y:number,z:number,w:number,h:number,d:number,color:number,name:string,kind:'stone'|'metal'='stone'){component(kind,name,()=>box(kind==='stone'?concrete:details,world(x,y,z),new THREE.Vector3(w,h,d),color),axis);}
 function terraceRailing(f:ReturnType<typeof normalFace>,y:number,name:string){for(let u=0;u<f.length;u+=2){const b=Math.min(f.length,u+2);beam(f.at(u,y+1.0,.04),f.at(b,y+1.0,.04),.055,.055,name+'-top',dark);beam(f.at(u,y+.52,.04),f.at(b,y+.52,.04),.045,.045,name+'-mid',dark);beam(f.at(u,y,.04),f.at(u,y+1,.04),.05,.05,name+'-post',dark);}}
 function curtain(f:ReturnType<typeof normalFace>,a:number,b:number,y0:number,y1:number,name:string){if(b-a<.12||y1-y0<.12)return;const n=Math.ceil((b-a)/1.65);for(let i=0;i<n;i++){const l=a+(b-a)*i/n,r=a+(b-a)*(i+1)/n;component('glass',name,()=>{wallBox(glass,f.at,f.tangent,l,r,y0,y1,-.0875,.055,glassColor);for(const u of[i===n-1?l:l,...(i===n-1?[r]:[])])wallBox(details,f.at,f.tangent,u-.0375,u+.0375,y0,y1,.015,.075,frame);wallBox(details,f.at,f.tangent,l,r,y1-.04,y1+.04,.015,.08,frame);},f.tangent,false,{facade:true,closedFacade:true,outward:f.out.toArray()});}}

 function cladding(f:ReturnType<typeof normalFace>,a:number,b:number,y0:number,y1:number,color:number,name:string,thickness=.24,depth=-.02){if(b-a<.05||y1-y0<.05)return;component('stone',name,()=>{wallBox(concrete,f.at,f.tangent,a,b,y0,y1,depth,thickness,color);if(color===stone)for(let y=Math.ceil(y0/.45)*.45;y<y1-.06;y+=.45)faceQuad(details,f.at(a,y,depth+thickness/2+.007),f.at(b,y,depth+thickness/2+.007),f.at(b,y+.014,depth+thickness/2+.007),f.at(a,y+.014,depth+thickness/2+.007),0x72786f,f.out);if(color===brown)for(let y=Math.ceil(y0/.56)*.56;y<y1-.06;y+=.56)faceQuad(details,f.at(a,y,depth+thickness/2+.007),f.at(b,y,depth+thickness/2+.007),f.at(b,y+.014,depth+thickness/2+.007),f.at(a,y+.014,depth+thickness/2+.007),0x66493f,f.out);},f.tangent);}

 const floor=.45,rowHeight=3.25,roofY=16.7,frontLength=points[19].x,split=55;
 const entry={x:entryX,z:-.18,width:4.4,height:2.85,floor,estimated:true};
 const front=normalFace(points[18],points[19]);
 const balconySamples:{x:number;z:number;floor:number;railTop:number;glassZ:number;slatY:number;gapY:number}[]=[];
 Object.assign(shell.userData,{entry,entries:[entry],floorLevels:Array.from({length:6},(_,i)=>floor+i*rowHeight),facadeZones:{west:{edge:18,louverX:[0,split],whiteFinX:[split,frontLength],estimated:true},east:{notchedEdges:[0,1,2,3,4,5,6,7,8,9,10,11,12],estimated:true}},balconyDepth:1.15,roof:{y:roofY,railingTop:17.5,roofGardenCurrentLayoutUnknown:true}});
 function terrainClear(f:ReturnType<typeof normalFace>,a:number,b:number,depth:number){let h=-Infinity;const n=Math.max(2,Math.ceil((b-a)/.2));for(let k=0;k<=n;k++)for(const d of[depth-.07,depth,depth+.07]){const p=f.at(a+(b-a)*k/n,0,d);h=Math.max(h,heightAt(p.x,p.z)-base);}return h;}
 function drawGlass(f:ReturnType<typeof normalFace>,a:number,b:number,y0:number,y1:number,depth:number){if(b-a<.1||y1-y0<.15)return;wallBox(glass,f.at,f.tangent,a+.04,b-.04,y0,y1,depth,.055,glassColor);const strip=(l:number,r:number,bottom:number,top:number)=>faceQuad(details,f.at(l,bottom,depth+.065),f.at(r,bottom,depth+.065),f.at(r,top,depth+.065),f.at(l,top,depth+.065),frame,f.out);for(const u of[a,b])strip(u-.035,u+.035,y0,y1);for(const y of[y0,y1,(y0+y1)/2])strip(a,b,y-.035,y+.035);}
 function framedGlass(f:ReturnType<typeof normalFace>,a:number,b:number,y0:number,y1:number,depth:number,name:string,extra:Record<string,unknown>={}){if(b-a<.1||y1-y0<.15)return;component('glass',name,()=>drawGlass(f,a,b,y0,y1,depth),f.tangent,false,{facade:true,closedFacade:true,outward:f.out.toArray(),...extra});}
 function panel(f:ReturnType<typeof normalFace>,a:number,b:number,y0:number,y1:number,depth:number,thick:number,color:number,name:string,extra:Record<string,unknown>={}){if(b-a<.025||y1-y0<.025)return;component('stone',name,()=>wallBox(concrete,f.at,f.tangent,a,b,y0,y1,depth,thick,color),f.tangent,false,extra);}
 function rail(f:ReturnType<typeof normalFace>,a:number,b:number,y:number,name:string){for(const dy of[.58,1.02])component('metal',name+'-bar',()=>wallBox(details,f.at,f.tangent,a,b,y+dy-.025,y+dy+.025,.035,.05,dark),f.tangent);for(const u of[a,b])component('metal',name+'-post',()=>wallBox(details,f.at,f.tangent,u-.035,u+.035,y,y+1.05,.035,.07,dark),f.tangent);}
 function slats(f:ReturnType<typeof normalFace>,a:number,b:number,y0:number,y1:number,name:string){for(const u of[a,b])component('metal',name+'-post',()=>wallBox(details,f.at,f.tangent,u-.045,u+.045,y0,y1,.065,.09,brown),f.tangent);let index=0;for(let y=y0+.12;y<y1-.05;y+=.235){component('metal',name+'-slat',()=>wallBox(details,f.at,f.tangent,a,b,y-.055,y+.055,.055,.17,brown),f.tangent,false,{openLouver:true,index:index++});}}
 // 닫힌 외벽과 열린 발코니의 부재를 나누고 루버 사이를 빈 공간으로 남긴다.
 for(let edge=0;edge<points.length;edge++){
  const f=normalFace(points[edge],points[(edge+1)%points.length]);if(f.length<.05)continue;
  const west=edge===18,east=[2,3,12].includes(edge),stairWall=[6,7,10,11].includes(edge);
  const cuts=[0,f.length];for(let u=4;u<f.length;u+=4)cuts.push(u);if(west)for(const x of[entry.x-entry.width/2,entry.x+entry.width/2,split])cuts.push(x);cuts.sort((a,b)=>a-b);
  for(let k=0;k+1<cuts.length;k++){
   const a=cuts[k],b=cuts[k+1];if(b-a<.05)continue;const mx=points[edge].x+f.dx*(a+b)/2,foot=terrainClear(f,a,b,0)-.55;
   const door=west&&(a+b)/2>entry.x-entry.width/2&&(a+b)/2<entry.x+entry.width/2;
   if(stairWall){for(let row=0;row<5;row++){const bottom=row===0?Math.min(foot,-.4):floor+row*rowHeight;panel(f,a,b,bottom,floor+(row+1)*rowHeight,-.025,.28,0xb2b7b2,'east-stair-panel',{edge,row});}continue;}
   for(let row=0;row<5;row++){
    if(door&&row===0){panel(f,a,b,floor+entry.height,3.7,-.04,.18,stone,'entry-lintel');continue;}
    const bottom=floor+row*rowHeight,top=bottom+rowHeight,louver=row>0&&(west?mx<split:east&&mx<42),fin=row>0&&(west||east)&&!louver;
    const depth=louver?-1.15:fin&&row<3?-.85:-.15;
    const groundTop=terrainClear(f,a,b,depth)+.18,sill=Math.max(bottom+.17,groundTop),head=top-.25;
    if(louver)panel(f,a,b,bottom-.12,Math.max(bottom+.17,sill),depth,.22,stone,'floor-spandrel',{edge,row});
    if(louver){
     component('stone','balcony-floor',()=>box(concrete,f.at((a+b)/2,bottom-.03,-.55),new THREE.Vector3(b-a,.18,1.45),stone,f.tangent),f.tangent,false,{edge,row});
     framedGlass(f,a+.08,b-.08,sill,head,depth,'balcony-recessed-glass',{edge,row});
     const screenEnd=Math.min(b-.13,a+1.05);if(screenEnd-a>.4)slats(f,a+.12,screenEnd,bottom+.16,top-.18,'horizontal-louver');
     if(b-screenEnd>.5)rail(f,screenEnd+.1,b-.08,bottom+.06,'balcony-railing');
     if(west&&b-a>3.5)balconySamples.push({x:a+2.2,z:0,floor:bottom+.06,railTop:bottom+1.08,glassZ:-1.15,slatY:bottom+.28,gapY:bottom+.40});
    }else{
     component('glass',row===0?'ground-glass':fin?'white-fin-glass':'rear-grid-glass',()=>{wallBox(concrete,f.at,f.tangent,a,b,row===0?Math.min(foot,-.5):bottom-.12,Math.max(bottom+.17,sill),depth,.22,stone);wallBox(concrete,f.at,f.tangent,a,b,top-.25,top-.04,depth,.22,stone);const modules=Math.max(1,Math.ceil((b-a)/1.65));for(let j=0;j<modules;j++)drawGlass(f,a+(b-a)*j/modules,b-(b-a)*(modules-j-1)/modules,sill,head,depth);},f.tangent,false,{facade:true,closedFacade:true,outward:f.out.toArray(),edge,row});
     if(fin){const spacing=row<3?2.2:1.1,n=Math.max(1,Math.ceil((b-a)/spacing));for(let j=0;j<n;j++){const u=a+(b-a)*j/n;component('metal',row<3?'deep-white-vertical-fin':'fine-white-vertical-fin',()=>wallBox(details,f.at,f.tangent,u,u+(row<3?.17:.06),bottom+.12,top-.16,row<3?-.22:-.015,row<3?1.26:.25,0xd4d8d1),f.tangent,false,{edge,row});}}
    }
    if(louver)panel(f,a,b,top-.25,top-.04,-.18,1.55,stone,'horizontal-floor-band',{edge,row});
   }
  }
 }
 // 현재 옥상 식재 배치는 미확인이다. 사진에 보이는 평지붕과 얇은 난간만 재현한다.
 polygonSlabs(points,roofY,'original-outline-roof',0x8d9892);
 for(let edge=0;edge<points.length;edge++){const f=normalFace(points[edge],points[(edge+1)%points.length]);for(let a=0;a<f.length;a+=4){const b=Math.min(f.length,a+4);component('metal','roof-railing-bar',()=>wallBox(details,f.at,f.tangent,a,b,17.45,17.5,-.10,.055,frame),f.tangent);component('metal','roof-railing-post',()=>wallBox(details,f.at,f.tangent,a,a+.055,roofY,17.5,-.1,.055,frame),f.tangent);}}
 // 정면 유리 차양과 사선 지지대는 각각 얇은 볼록 충돌 부품으로 만든다.
 component('glass','engineering35-entry-door',()=>box(glass,world(entry.x,floor+entry.height/2,entry.z),new THREE.Vector3(entry.width,entry.height,.065),glassColor),axis,false,{entrance:true,outward:across.toArray()});
 for(const x of[entry.x-entry.width/2,entry.x+entry.width/2])beam(world(x,floor,entry.z+.04),world(x,floor+entry.height,entry.z+.04),.075,.075,'entrance-frame',frame);
 const canopy={x0:entry.x-4.6,x1:entry.x+4.6,z0:-.15,z1:3.2,y:3.45};
 for(let x=canopy.x0;x<canopy.x1;x+=2.3)pane([world(x,canopy.y,canopy.z0),world(Math.min(canopy.x1,x+2.3),canopy.y,canopy.z0),world(Math.min(canopy.x1,x+2.3),canopy.y,canopy.z1),world(x,canopy.y,canopy.z1)],up,'entry-glass-canopy',{canopy:true});
 for(const x of[entry.x-3.6,entry.x+3.6]){beam(world(x,3.46,3.1),world(x,5.15,-.1),.11,.11,'canopy-diagonal-stay',0x8d9b98);beam(world(x,3.4,-.2),world(x,3.4,3.3),.08,.11,'canopy-rail',frame);}
 const accessWidth=3.6,lanes=6,accessZ=5.6,apronZ=1.9,steps=10,tops:number[][]=[];
 for(let lane=0;lane<lanes;lane++){const x0=entry.x-accessWidth/2+lane*accessWidth/lanes,x1=x0+accessWidth/lanes,heights:number[]=[];for(let i=0;i<steps;i++){const z1=accessZ-(accessZ-apronZ)*i/steps,z0=accessZ-(accessZ-apronZ)*(i+1)/steps;let h=-Infinity;for(const x of[x0,(x0+x1)/2,x1])for(const z of[z0,(z0+z1)/2,z1])h=Math.max(h,ground(x,z));heights.push(Math.max(h+.08,THREE.MathUtils.lerp(ground((x0+x1)/2,accessZ)+.08,floor,i/(steps-1))));}heights[steps-1]=floor;for(let i=steps-2;i>=0;i--)heights[i]=Math.max(heights[i],heights[i+1]-.22);for(let i=0;i<steps;i++){const z1=accessZ-(accessZ-apronZ)*i/steps,z0=accessZ-(accessZ-apronZ)*(i+1)/steps;rectangularSlab(x0,x1,z0,z1,heights[i],heights[i],heights[i],heights[i],'entry-access-step',0xb5bcb4,.14);}tops.push(heights);}
 for(let x=entry.x-3.3;x<entry.x+3.3;x+=2.2)rectangularSlab(x,Math.min(entry.x+3.3,x+2.2),-6,apronZ,floor,floor,floor,floor,'entry-apron-floor',0xb5bcb4,.16);
 Object.assign(shell.userData,{balconySamples,canopy,access:{route:[{x:entry.x,z:accessZ+1.4},{x:entry.x,z:1},{x:entry.x,z:-5}],width:accessWidth,lanes,steps,tops,estimated:true},limitations:['입면 구역의 경계와 발코니 깊이는 사진 비례 추정이다.','지형과 출입 바닥을 잇는 접근판은 게임용 추정이다.','2026년 외벽 도색 후 색과 옥상 텃밭의 현황은 확인하지 못했다.']});

  for(const[s,name,roughness]of[[concrete,'solid',.86],[details,'frames',.64],[glass,'glazing',.24]]as const){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(s.positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(s.colors,3));(geometry.getAttribute('position')as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);geometry.computeVertexNormals();geometry.computeBoundingSphere();geometry.computeBoundingBox();s.geometry=geometry;const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness,metalness:s===glass?.18:.02}));mesh.name='engineering-35-'+name;mesh.receiveShadow=true;shell.add(mesh);s.positions.length=0;s.colors.length=0;}
  function update(_player:THREE.Vector3){const changed=new Set<Surface>();for(const part of parts)if(part.shown!==part.proxy.visible){part.shown=part.proxy.visible;for(const r of part.ranges){if(r.start===r.end)continue;const attr=r.surface.geometry!.getAttribute('position')as THREE.BufferAttribute;if(!changed.has(r.surface))attr.clearUpdateRanges();changed.add(r.surface);if(part.shown)(attr.array as Float32Array).set(r.original,r.start);else for(let i=r.start;i<r.end;i+=3){attr.array[i]=part.proxy.position.x;attr.array[i+1]=part.proxy.position.y;attr.array[i+2]=part.proxy.position.z;}attr.addUpdateRange(r.start,r.end-r.start);}}for(const s of changed)s.geometry!.getAttribute('position').needsUpdate=true;shell.visible=parts.some(p=>p.proxy.visible);}
  return{breakables,update};
}
