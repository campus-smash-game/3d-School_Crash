import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { CampusBuilding } from './fullCampus';
import type { BuildingAppearance } from './buildingAppearance';
import type { BreakableSpec } from './scene';
type Point={x:number;z:number};
type Surface={positions:number[];colors:number[];geometry?:THREE.BufferGeometry};
type Range={surface:Surface;start:number;end:number;original:Float32Array};
type Part={proxy:THREE.Mesh;shown:boolean;ranges:Range[]};

// 전체 B2/지상 9층은 공식 준공 기록이다. 날개별 8/9층 배분과 높이, 현관 치수는 사진과 도면에 따른 근사다.
export function createAgricultureLandmark(scene:THREE.Scene,building:CampusBuilding,profile:BuildingAppearance,heightAt:(x:number,z:number)=>number){
  const mapped=building.points.filter((p,i,a)=>i!==a.length-1||p[0]!==a[0][0]||p[1]!==a[0][1]);if(mapped.length<3)throw Error('Agriculture needs its original mapped outline.');
  const cx=mapped.reduce((s,p)=>s+p[0],0)/mapped.length,cz=mapped.reduce((s,p)=>s+p[1],0)/mapped.length,base=heightAt(cx,cz);
  const origin=mapped.reduce((a,b)=>a[0]<b[0]?a:b),northEast=mapped.reduce((a,b)=>a[1]>b[1]?a:b),length=Math.hypot(northEast[0]-origin[0],northEast[1]-origin[1]),ux=(northEast[0]-origin[0])/length,uz=(northEast[1]-origin[1])/length;
  const axis=new THREE.Vector3(ux,0,uz),across=new THREE.Vector3(-uz,0,ux),up=new THREE.Vector3(0,1,0),world=(x:number,y:number,z:number)=>new THREE.Vector3(origin[0]+x*ux-z*uz,base+y,origin[1]+x*uz+z*ux),ground=(x:number,z:number)=>{const p=world(x,0,z);return heightAt(p.x,p.z)-base;};
  const points=mapped.map(p=>({x:(p[0]-origin[0])*ux+(p[1]-origin[1])*uz,z:-(p[0]-origin[0])*uz+(p[1]-origin[1])*ux}));if(points.reduce((s,p,i)=>{const q=points[(i+1)%points.length];return s+p.x*q.z-q.x*p.z;},0)<0)points.reverse();
  const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minZ=Math.min(...points.map(p=>p.z)),maxZ=Math.max(...points.map(p=>p.z)),storey=3.6;
  const wings=[{id:'life',name:'생명관',minX,maxX:63.4,minZ:-33.12,maxZ,levels:8,height:28.8,levelsEstimated:true},{id:'sangnok',name:'상록관',minX:1.0,maxX:63.4,minZ,maxZ:-63.02,levels:9,height:32.4,levelsEstimated:true}];
  const central={minX:15.52,maxX,minZ:-63.02,maxZ:-33.12,lowRoof:7.2,upperMinX:34,upperRoof:10.8,frontStripMinX:63.4,frontStripRoof:10.8,dimensionsEstimated:true};
  // 동쪽 접속판 끝을 원본 순환도로 폭 밖에 두고 현관에서 지면까지의 연결은 유지한다.
  const entry={x:66.25,facadeX:maxX,z:-48,width:6.4,floor:3.6,height:3.05,approachX:77.95,platformX:71,approachWidth:16,estimated:true};
  const oval={x:24.4,z:-48.05,rx:7.45,rz:5.5,base:7.2,rise:2.15,segments:24,rings:3,roofHole:true,estimated:true};
  const shell=new THREE.Group();shell.name=building.id+':agriculture-landmark';Object.assign(shell.userData,{buildingId:building.id,role:'building-shell',landmark:'agriculture',appearance:profile,localOrigin:{x:origin[0],y:base,z:origin[1]},baseSample:{x:cx,z:cz},axis:{x:ux,z:uz},frontFacing:{x:ux,z:uz},mappedOutline:mapped.map(p=>p.slice()),mappedOutlinePreserved:true,sourcePointCount:mapped.length,dimensions:{length:maxX-minX,depth:maxZ-minZ,height:32.4},wings,entry,entrance:entry,central,ovalRoof:oval,levels:{aboveGround:9,belowGround:2,overallClassificationVerified:true,wingMaximumLevelsVerified:false},heightEstimated:true,detailDimensionsEstimated:true,frontDirectionEstimated:true,basementInteriorModeled:false,openCourtyardModeled:false,interiorPlanVerified:false,balconies:[]});scene.add(shell);
  const distant=new THREE.Group();distant.visible=false;Object.assign(distant.userData,{buildingId:building.id,role:'distant-building',landmark:'agriculture'});scene.add(distant);
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
    Object.assign(proxy.userData, { buildingId: building.id, landmark: 'agriculture', renderProxy: true, component: name, convex, ...extra }); proxy.updateMatrix(); proxy.updateMatrixWorld(true);
    parts.push({ proxy, shown: true, ranges }); breakables.push({ mesh: proxy, size, collisionVertices, toughness: kind === 'glass' ? 6 : 11, material: kind, label: building.name });
  }
  function wallBox(s: Surface, at: (u: number, y: number, depth?: number) => THREE.Vector3, ex: THREE.Vector3, a: number, b: number, bottom: number, top: number, depth: number, thickness: number, color: number) { if (b - a > .005 && top - bottom > .005) box(s, at((a + b) / 2, (bottom + top) / 2, depth), new THREE.Vector3(b - a, top - bottom, thickness), color, ex); }

  function faceQuad(s:Surface,a:THREE.Vector3,b:THREE.Vector3,c:THREE.Vector3,d:THREE.Vector3,color:number,out:THREE.Vector3){if(b.clone().sub(a).cross(c.clone().sub(a)).dot(out)<0)quad(s,a,d,c,b,color);else quad(s,a,b,c,d,color);}
  function clip(poly:Point[],key:'x'|'z',value:number,greater:boolean){const result:Point[]=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],ia=greater?a[key]>=value:a[key]<=value,ib=greater?b[key]>=value:b[key]<=value;if(ia)result.push(a);if(ia!==ib){const t=(value-a[key])/(b[key]-a[key]);result.push({x:THREE.MathUtils.lerp(a.x,b.x,t),z:THREE.MathUtils.lerp(a.z,b.z,t)});}}return result;}
  function slab(poly:Point[],ys:number[],thickness:number,color:number,name:string,extra:Record<string,unknown>={}){component('stone',name,()=>{const top=poly.map((p,i)=>world(p.x,ys[i],p.z)),bottom=top.map(p=>p.clone().addScaledVector(up,-thickness));for(let i=1;i<poly.length-1;i++){tri(details,top[0],top[i+1],top[i],color);tri(details,bottom[0],bottom[i],bottom[i+1],color);}for(let i=0;i<poly.length;i++){const j=(i+1)%poly.length;quad(details,bottom[i],bottom[j],top[j],top[i],color);}},axis,true,extra);}
  function rectangularSlab(x0:number,x1:number,z0:number,z1:number,y00:number,y10:number,y11:number,y01:number,name:string,color=0xaaa99a){const p=[{x:x0,z:z0},{x:x1,z:z0},{x:x1,z:z1},{x:x0,z:z1}],ys=[y00,y10,y11,y01];for(const indices of [[0,1,2],[0,2,3]])slab(indices.map(i=>p[i]),indices.map(i=>ys[i]),.20,color,name);}

  function exposedStrip(surface:Surface,at:(u:number,y:number,d?:number)=>THREE.Vector3,ex:THREE.Vector3,a:number,b:number,y0:number,y1:number,depth:number,thickness:number,color:number,faces:number[]){
    if(b-a<.005||y1-y0<.005)return;const centre=at((a+b)/2,(y0+y1)/2,depth),ez=new THREE.Vector3().crossVectors(ex,up).normalize(),tint=new THREE.Color(color);
    for(let i=0;i<cubeVertices.count;i++){if(!faces.includes(Math.floor(i/6)))continue;const p=centre.clone().addScaledVector(ex,cubeVertices.getX(i)*(b-a)).addScaledVector(up,cubeVertices.getY(i)*(y1-y0)).addScaledVector(ez,cubeVertices.getZ(i)*thickness);surface.positions.push(p.x,p.y,p.z);surface.colors.push(tint.r,tint.g,tint.b);}
  }
  const brick=0xb1774e,gray=0xa8afa9,white=0xd4d9cf,frame=0x405b5b;
  const midRoof=(x:number)=>x>=central.upperMinX?central.upperRoof:central.lowRoof;
  function baseGround(a:Point,b:Point){return Math.min(-.3,...Array.from({length:9},(_,i)=>ground(THREE.MathUtils.lerp(a.x,b.x,i/8),THREE.MathUtils.lerp(a.z,b.z,i/8))-.4));}
  function genericBay(at:(u:number,y:number,d?:number)=>THREE.Vector3,tangent:THREE.Vector3,outward:THREE.Vector3,u0:number,u1:number,bottom:number,top:number,level:number,material:number,ribbon:boolean,extra:Record<string,unknown>={}){
    const width=u1-u0,groundMax=Math.max(...Array.from({length:9},(_,i)=>{const p=at(u0+width*i/8,0,-.1);return heightAt(p.x,p.z)-base;})),sill=Math.max(bottom+(ribbon?.24:.85),groundMax+.16),head=top-(ribbon?.56:.72),solid=head<sill+.3||width<1.05;
    component('glass',ribbon?'upper-continuous-glass':'brick-window-bay',()=>{
      const wallStrip=(a:number,b:number,y0:number,y1:number,faces=[0,1,4,5])=>exposedStrip(concrete,at,tangent,a,b,y0,y1,-.09,.22,material,faces); const detailStrip=(a:number,b:number,y0:number,y1:number,d:number,t:number,c:number)=>exposedStrip(details,at,tangent,a,b,y0,y1,d,t,c,(b-a)<(y1-y0)?[0,1,5]:[2,3,5]);
      if(solid){wallStrip(u0,u1,bottom,top,[0,1,2,3,4,5]);return;}
      wallStrip(u0,u1,bottom,sill,[2,4,5]);wallStrip(u0,u1,head,top,[3,4,5]);const count=ribbon?2:Math.max(1,Math.round(width/2.7)),pitch=width/count;
      for(let i=0;i<count;i++){const a=u0+pitch*i,b=a+pitch,pad=ribbon?.10:Math.min(.62,pitch*.24),left=a+pad,right=b-pad;wallStrip(a,left,sill,head);wallStrip(right,b,sill,head);faceQuad(glass,at(left,sill,-.10),at(left,head,-.10),at(right,head,-.10),at(right,sill,-.10),[0x4d7778,0x527f7d,0x446e73][(i+level)%3],outward);for(const u of[left,(left+right)/2,right])detailStrip(u-.03,u+.03,sill,head,-.04,.09,frame);detailStrip(left,right,head-.55,head-.5,-.04,.09,frame);}
      detailStrip(u0,u1,top-.14,top,.06,.10,white);
      if(ribbon){detailStrip(u0,u1,top-.52,top,.07,.16,white);detailStrip(u0,u0+.14,sill,head,.05,.15,white);}
    },tangent,false,{...extra,level,closedFacade:!solid,outward:outward.toArray(),estimated:true});
  }
  function balcony(at:(u:number,y:number,d?:number)=>THREE.Vector3,tangent:THREE.Vector3,outward:THREE.Vector3,a:number,b:number,bottom:number,top:number,wing:string,face:string){
    const d=1.25,w=b-a,center=at((a+b)/2,bottom,0),meta={wing,face,worldCenter:center.toArray(),outward:outward.toArray(),width:w,depth:d,floor:bottom,ceiling:top,estimated:true};shell.userData.balconies.push(meta);
    component('glass','balcony-recessed-glass',()=>{box(glass,at((a+b)/2,(bottom+top)/2,-d),new THREE.Vector3(w-.32,top-bottom-.18,.065),0x365f65,tangent);for(const u of[a+.14,(a+b)/2,b-.14])wallBox(details,at,tangent,u-.03,u+.03,bottom+.1,top-.1,-d+.04,.1,frame);},tangent,false,{balcony:meta,outward:outward.toArray()});
    for(const u of[a+.07,b-.07])component('stone','balcony-side-wall',()=>wallBox(concrete,at,tangent,u-.07,u+.07,bottom,top,-d/2,d+.22,brick),tangent);
    component('stone','balcony-floor',()=>wallBox(details,at,tangent,a,b,bottom-.16,bottom+.05,-d/2,d+.30,white),tangent);
    for(const [y0,y1]of[[bottom+1.02,bottom+1.08],[bottom+.15,bottom+.20]])component('metal','balcony-railing-horizontal',()=>wallBox(details,at,tangent,a+.15,b-.15,y0,y1,.10,.055,0x536663),tangent,false,{balcony:meta});
    for(const u of[a+.2,(a+b)/2,b-.2])component('metal','balcony-railing-vertical',()=>wallBox(details,at,tangent,u-.018,u+.018,bottom+.18,bottom+1.05,.10,.038,0x536663),tangent,false,{balcony:meta});
  }
  const wingPolys:Point[][]=[];
  for(const wing of wings){let poly=clip(clip(clip(points,'z',wing.minZ,true),'z',wing.maxZ,false),'x',wing.maxX,false);wingPolys.push(poly);
    for(let edge=0;edge<poly.length;edge++){const a=poly[edge],b=poly[(edge+1)%poly.length],len=Math.hypot(b.x-a.x,b.z-a.z);if(len<.05)continue;const dx=(b.x-a.x)/len,dz=(b.z-a.z)/len,tangent=axis.clone().multiplyScalar(dx).addScaledVector(across,dz),out=axis.clone().multiplyScalar(dz).addScaledVector(across,-dx),at=(u:number,y:number,d=0)=>world(a.x+dx*u,y,a.z+dz*u).addScaledVector(out,d),horizontal=Math.abs(dx)>.98,east=out.dot(axis)>.99,inner=wing.id==='life'?out.dot(across)<-.99:out.dot(across)>.99,divisions=Math.max(1,Math.ceil(len/5.9)),cuts=new Set<number>([0,len]);
      for(let j=1;j<divisions;j++)cuts.add(j*len/divisions);if(inner&&Math.abs(dx)>.1)for(const x of[central.minX,central.upperMinX]){const u=(x-a.x)/dx;if(u>0&&u<len)cuts.add(u);}if(east)for(const z of[(wing.minZ+wing.maxZ)/2-4.3,(wing.minZ+wing.maxZ)/2+4.3]){const u=(z-a.z)/dz;if(u>0&&u<len)cuts.add(u);}const sorted=[...cuts].sort((a,b)=>a-b);
      for(let j=0;j+1<sorted.length;j++){const u0=sorted[j],u1=sorted[j+1],mid=(u0+u1)/2,x=a.x+dx*mid,z=a.z+dz*mid,width=u1-u0,low=baseGround({x:a.x+dx*u0,z:a.z+dz*u0},{x:a.x+dx*u1,z:a.z+dz*u1});
        for(let level=0;level<wing.levels;level++){const bottom=level?level*storey:low,top=(level+1)*storey;if(east&&top<=central.frontStripRoof+.01)continue;if(inner&&x>central.minX&&top<=midRoof(x)+.01)continue;const ribbon=level===wing.levels-1,core=east&&Math.abs(z-(wing.minZ+wing.maxZ)/2)<4.29&&level<wing.levels-1;
          if(core){component('glass','east-vertical-glass-core',()=>{wallBox(glass,at,tangent,u0,u1,bottom,top,.75,.075,0x4c7c7c);for(let y=bottom+.25;y<top;y+=.48)wallBox(details,at,tangent,u0,u1,y,y+.035,.80,.055,0xc4cebe);for(let u=u0;u<=u1;u+=1.0)wallBox(details,at,tangent,u-.035,u+.035,bottom,top,.80,.055,0x778b80);},tangent,false,{wing:wing.id,level,outward:out.toArray()});continue;}
          // 남쪽 긴 외벽의 서쪽 두 구획은 사진의 높은 세 줄에 맞춘다. 다른 면의 추정 배치는 유지한다.
          const southernPhotoFace=wing.id==='sangnok'&&out.dot(across)<-.99;
          const westernBalcony=southernPhotoFace?(x<12&&level>=5&&level<=7):(x>5&&x<12&&level>=3&&level<=5);
          const bayIndex=Math.floor(x/5.8),balconyBay=horizontal&&width>3.0&&!ribbon&&level>=2&&((x>28&&x<34)||westernBalcony);
          if(balconyBay){balcony(at,tangent,out,u0,u1,bottom,top,wing.id,inner?'inner':'outer');continue;}
          genericBay(at,tangent,out,u0,u1,bottom,top,level,level<2&&x<19?gray:brick,ribbon,{wing:wing.id,edge,bayIndex});
        }
      }
    }
  }
  // 동쪽 저층 띠는 두 날개 앞까지 이어진다. 중앙 3층은 동쪽 절반에만 둔다.
  for(let edge=0;edge<points.length;edge++){const a=points[edge],b=points[(edge+1)%points.length],len=Math.hypot(b.x-a.x,b.z-a.z),dx=(b.x-a.x)/len,dz=(b.z-a.z)/len,tangent=axis.clone().multiplyScalar(dx).addScaledVector(across,dz),out=axis.clone().multiplyScalar(dz).addScaledVector(across,-dx),at=(u:number,y:number,d=0)=>world(a.x+dx*u,y,a.z+dz*u).addScaledVector(out,d),cuts=new Set<number>([0,len]);for(let j=1;j<Math.ceil(len/5.7);j++)cuts.add(len*j/Math.ceil(len/5.7));for(const x of[63.4,central.upperMinX])if(Math.abs(dx)>.001){const u=(x-a.x)/dx;if(u>0&&u<len)cuts.add(u);}for(const z of[central.minZ,central.maxZ,entry.z-entry.width/2,entry.z+entry.width/2])if(Math.abs(dz)>.001){const u=(z-a.z)/dz;if(u>0&&u<len)cuts.add(u);}const ss=[...cuts].sort((a,b)=>a-b);
    for(let j=0;j+1<ss.length;j++){const u0=ss[j],u1=ss[j+1],x=a.x+dx*(u0+u1)/2,z=a.z+dz*(u0+u1)/2,isFront=x>63.399,isCentral=x>central.minX-.01&&z>central.minZ+.01&&z<central.maxZ-.01;if(!isFront&&!isCentral)continue;const roof=isFront?central.frontStripRoof:midRoof(x),east=out.dot(axis)>.99,door=east&&Math.abs(z-entry.z)<entry.width/2-.001;for(let row=0;row<Math.round(roof/storey);row++){if(door&&row===1)continue;const bottom=row?row*storey:baseGround({x:a.x+dx*u0,z:a.z+dz*u0},{x:a.x+dx*u1,z:a.z+dz*u1}),top=(row+1)*storey;genericBay(at,tangent,out,u0,u1,bottom,top,row,gray,true,{central:true,entryFacade:east});}}
  }
  // 3층 연결부의 서쪽 면은 2층 옥상정원에 접한다.
  for(let z=central.minZ;z<central.maxZ;z+=5.9){const next=Math.min(central.maxZ,z+5.9),at=(u:number,y:number,d=0)=>world(central.upperMinX-d,y,z+u);genericBay(at,across,axis.clone().negate(),0,next-z,central.lowRoof,central.upperRoof,2,gray,true,{central:true});}
  function roofs(poly:Point[],height:number,name:string,hole=false){if(poly.length<3)return;const holes=hole?[Array.from({length:oval.segments},(_,i)=>new THREE.Vector2(oval.x+oval.rx*Math.cos(i*Math.PI*2/oval.segments),oval.z+oval.rz*Math.sin(i*Math.PI*2/oval.segments)))]:[],flat=poly.map(p=>new THREE.Vector2(p.x,p.z)),all=flat.concat(...holes),faces=THREE.ShapeUtils.triangulateShape(flat,holes);for(const f of faces){const triPoly=f.map(i=>({x:all[i].x,z:all[i].y}));if(hole){slab(triPoly,triPoly.map(()=>height),.22,0xa5aca1,name);continue;}for(let x=minX;x<maxX;x+=15)for(let z=minZ;z<maxZ;z+=14){let p=triPoly;for(const[k,v,g]of[['x',x,true],['x',x+15,false],['z',z,true],['z',z+14,false]]as const)p=clip(p,k,v,g);if(p.length<3||Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a.x*b.z-b.x*a.z;},0))<.02)continue;slab(p,p.map(()=>height),.22,0xa5aca1,name);}}}
  wings.forEach((w,i)=>roofs(wingPolys[i],w.height,'wing-roof'));
  const centralPoly=clip(clip(points,'z',central.minZ,true),'z',central.maxZ,false),lowPoly=clip(centralPoly,'x',central.upperMinX,false),upperPoly=clip(clip(centralPoly,'x',central.upperMinX,true),'x',63.4,false),frontPoly=clip(points,'x',63.4,true);
  roofs(lowPoly,central.lowRoof,'lower-garden-roof',true);roofs(upperPoly,central.upperRoof,'upper-garden-roof');roofs(frontPoly,central.frontStripRoof,'front-strip-roof');
  // 작은 타원 유리지붕이다. 그 아래 천창만 비우며 지상 관통 중정으로 만들지 않는다.
  const domeNormals=new Map<number,THREE.Vector3>();
  function domePoint(r:number,a:number){return world(oval.x+oval.rx*r*Math.cos(a),oval.base+oval.rise*Math.sqrt(Math.max(0,1-r*r)),oval.z+oval.rz*r*Math.sin(a));}
  function domeTri(a:THREE.Vector3,b:THREE.Vector3,c:THREE.Vector3){const start=glass.positions.length/3;tri(glass,a,b,c,0x8cafad);for(const[p,i]of[[a,0],[b,1],[c,2]]as const){const q=p.clone().sub(world(oval.x,oval.base,oval.z));domeNormals.set(start+i,axis.clone().multiplyScalar(q.dot(axis)/(oval.rx*oval.rx)).addScaledVector(up,q.y/(oval.rise*oval.rise)).addScaledVector(across,q.dot(across)/(oval.rz*oval.rz)).normalize());}}
  for(let ring=0;ring<oval.rings;ring++)for(let k=0;k<oval.segments;k++){const r0=ring/oval.rings,r1=(ring+1)/oval.rings,a0=k*Math.PI*2/oval.segments,a1=(k+1)*Math.PI*2/oval.segments,poly=ring===0?[domePoint(0,a0),domePoint(r1,a1),domePoint(r1,a0)]:[domePoint(r0,a0),domePoint(r0,a1),domePoint(r1,a1),domePoint(r1,a0)];component('glass','oval-glass-roof-panel',()=>{const bottom=poly.map(p=>p.clone().addScaledVector(up,-.075));for(let i=1;i<poly.length-1;i++){domeTri(poly[0],poly[i],poly[i+1]);tri(glass,bottom[0],bottom[i+1],bottom[i],0x76948f);}for(let i=0;i<poly.length;i++){const j=(i+1)%poly.length;quad(glass,poly[i],bottom[i],bottom[j],poly[j],0x819e94);} const frameBeam=(a:THREE.Vector3,b:THREE.Vector3)=>{const ex=b.clone().sub(a).normalize(),ey=up.clone().addScaledVector(ex,-up.dot(ex)).normalize();box(details,a.clone().add(b).multiplyScalar(.5),new THREE.Vector3(a.distanceTo(b),.06,.06),0xcbd4c4,ex,ey);};if(k%2===0)frameBeam(domePoint(r0,a0).addScaledVector(up,.035),domePoint(r1,a0).addScaledVector(up,.035));frameBeam(domePoint(r1,a0).addScaledVector(up,.035),domePoint(r1,a1).addScaledVector(up,.035));},axis,true,{skylight:true,ring,sector:k});}
  // 옥상 설비와 정원은 공식 항공사진에서 확인한 배치 성격만 반영한다.
  for(const w of wings){const z=(w.minZ+w.maxZ)/2;for(const [x,sx]of[[20,14],[42,12]])component('stone','roof-service-room',()=>box(details,world(x,w.height+.7,z),new THREE.Vector3(sx,1.4,5.5),0xc4c9bd));for(const side of[-1,1])for(let x=10;x<57;x+=9)component('metal','rooftop-equipment-cluster',()=>{for(let i=0;i<3;i++)box(details,world(x+i*.95,w.height+.45,z+side*9.2),new THREE.Vector3(.75,.9,.8),0xa7b0a4);});}
  for(const z of[-59,-37])for(let x=38;x<59;x+=7)component('stone','roof-garden-planter',()=>{box(details,world(x,central.upperRoof+.2,z),new THREE.Vector3(5.8,.4,1.25),0xb3b6a2);box(details,world(x,central.upperRoof+.62,z),new THREE.Vector3(5.3,.55,.9),0x6d865c);});
  component('glass','agriculture-entry-door',()=>{box(glass,world(entry.x,entry.floor+entry.height/2,entry.z),new THREE.Vector3(.07,entry.height,entry.width),0x476d73);for(const z of[entry.z-entry.width/2,entry.z,entry.z+entry.width/2])box(details,world(entry.x+.045,entry.floor+entry.height/2,z),new THREE.Vector3(.11,entry.height,.07),0xafbdb4);},axis,false,{entrance:true,outward:axis.toArray()});
  for(const z of[entry.z-entry.width/2-.08,entry.z+entry.width/2+.08])component('stone','entry-recess-side',()=>box(details,world((entry.x+entry.facadeX)/2,entry.floor+entry.height/2,z),new THREE.Vector3(entry.facadeX-entry.x,entry.height,.16),gray));
  component('metal','entry-white-canopy',()=>box(details,world(68.3,7.13,entry.z),new THREE.Vector3(7.4,.28,17.4),white));
  const floorAt=(x:number,z:number)=>x<=entry.platformX?entry.floor:THREE.MathUtils.lerp(entry.floor,ground(entry.approachX,z)+.045,(x-entry.platformX)/(entry.approachX-entry.platformX));
  for(let x=61;x<entry.approachX;x+=5)for(let z=entry.z-8;z<entry.z+8;z+=4){const xx=Math.min(entry.approachX,x+5),zz=Math.min(entry.z+8,z+4);rectangularSlab(x,xx,z,zz,floorAt(x,z),floorAt(xx,z),floorAt(xx,zz),floorAt(x,zz),'entry-ground-connection',0xa6ada1);}
  // 도면에서 확인되지 않은 실내 방 대신 현관 뒤에 짧은 보행면만 연결한다.
  for(let x=53;x<61;x+=2)rectangularSlab(x,x+2,entry.z-4,entry.z+4,entry.floor,entry.floor,entry.floor,entry.floor,'entry-inner-floor',0xb2b7ab);
  const tileBytes=new Uint8Array(32*16*4);for(let y=0;y<16;y++)for(let x=0;x<32;x++){const at=(y*32+x)*4,value=y===0||((x+(y>=8?16:0))%32===0)?179:242+((x*13+y*7)%11);tileBytes[at]=value;tileBytes[at+1]=value;tileBytes[at+2]=value;tileBytes[at+3]=255;}
  const tileTexture=new THREE.DataTexture(tileBytes,32,16,THREE.RGBAFormat);tileTexture.wrapS=tileTexture.wrapT=THREE.RepeatWrapping;tileTexture.magFilter=THREE.LinearFilter;tileTexture.minFilter=THREE.LinearMipmapLinearFilter;tileTexture.generateMipmaps=true;tileTexture.needsUpdate=true;
  for (const [s, name, roughness] of [[concrete, 'brick-walls', .92], [details, 'frames-and-roofs', .72], [glass, 'glazing', .26]] as const) {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(s.positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(s.colors, 3)); (geometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage); geometry.computeVertexNormals(); if(s===glass){const n=geometry.getAttribute('normal') as THREE.BufferAttribute;for(const[i,v]of domeNormals)n.setXYZ(i,v.x,v.y,v.z);} geometry.computeBoundingSphere(); geometry.computeBoundingBox(); s.geometry = geometry;
    if(s===concrete){const uv:number[]=[];for(let i=0;i<s.positions.length;i+=9){const a=new THREE.Vector3().fromArray(s.positions,i),b=new THREE.Vector3().fromArray(s.positions,i+3),c=new THREE.Vector3().fromArray(s.positions,i+6),normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize(),useZ=Math.abs(normal.dot(axis))>Math.abs(normal.dot(across));for(const p of[a,b,c])uv.push(p.dot(useZ?across:axis)/.48,p.y/.24);}geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));}
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: s===concrete?tileTexture:null, vertexColors: true, side: THREE.DoubleSide, roughness, metalness: s === glass ? .16 : .02 })); mesh.name = `agriculture-${name}`; mesh.receiveShadow = true; shell.add(mesh); s.positions.length = 0; s.colors.length = 0;
  }
  function update(_player: THREE.Vector3) { const changed = new Set<Surface>(); for (const part of parts) if (part.shown !== part.proxy.visible) { part.shown = part.proxy.visible; for (const r of part.ranges) { if (r.start === r.end) continue; const attr = r.surface.geometry!.getAttribute('position') as THREE.BufferAttribute; if (!changed.has(r.surface)) attr.clearUpdateRanges(); changed.add(r.surface); if (part.shown) (attr.array as Float32Array).set(r.original, r.start); else for (let i = r.start; i < r.end; i += 3) { attr.array[i] = part.proxy.position.x; attr.array[i + 1] = part.proxy.position.y; attr.array[i + 2] = part.proxy.position.z; } attr.addUpdateRange(r.start, r.end - r.start); } } for (const s of changed) s.geometry!.getAttribute('position').needsUpdate = true; shell.visible = parts.some(p => p.proxy.visible); }
  return { breakables, update };
}
