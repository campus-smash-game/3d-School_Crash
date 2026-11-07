import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { CampusBuilding } from './fullCampus';
import type { BuildingAppearance } from './buildingAppearance';
import type { BreakableSpec } from './scene';
type Point = { x: number; z: number };
type Surface = { positions: number[]; colors: number[]; geometry?: THREE.BufferGeometry };
type Range = { surface: Surface; start: number; end: number; original: Float32Array };
type Part = { proxy: THREE.Mesh; shown: boolean; ranges: Range[] };

// 공식 사진의 열린 기둥층과 테라스를 분리한다. 전체 층수, 높이와 세부 배치는 추정이다.
export function createTeachingCenterLandmark(scene: THREE.Scene, building: CampusBuilding, profile: BuildingAppearance, heightAt: (x: number, z: number) => number) {
  const mapped = building.points.filter((p, i, a) => i !== a.length - 1 || p[0] !== a[0][0] || p[1] !== a[0][1]);
  if (mapped.length < 3) throw new Error('Teaching center needs a mapped footprint.');
  const cx = mapped.reduce((s,p)=>s+p[0],0)/mapped.length, cz = mapped.reduce((s,p)=>s+p[1],0)/mapped.length, base = heightAt(cx,cz);
  const origin = new THREE.Vector3(459.1,base,-700.82), axis = new THREE.Vector3(32.94,0,-20.61).normalize(), front = new THREE.Vector3(-axis.z,0,axis.x), up = new THREE.Vector3(0,1,0);
  const world = (x:number,y:number,z:number) => origin.clone().addScaledVector(axis,x).addScaledVector(up,y).addScaledVector(front,z);
  const ground = (x:number,z:number) => {const p=world(x,0,z);return heightAt(p.x,p.z)-base;};
  let points=mapped.map(p=>({x:(p[0]-origin.x)*axis.x+(p[1]-origin.z)*axis.z,z:(p[0]-origin.x)*front.x+(p[1]-origin.z)*front.z}));
  if(points.reduce((s,p,i)=>{const q=points[(i+1)%points.length];return s+p.x*q.z-q.x*p.z;},0)<0)points.reverse();
  const mainRoof=14, glassRoof=10.2, glassBottom=5.1, galleryFloor=1.9, terraceFloor=4.3;
  const entry={x:2.3,z:-20.5,width:6,floor:0,height:3.15,approachX:-5,estimated:true};
  entry.floor=Math.max(...[0,2.3,5,8].flatMap(x=>[-23.5,-20.5,-17.5].map(z=>ground(x,z))))+.12;
  const stair={startX:-5,endX:0,centerZ:entry.z,width:entry.width,bottom:Math.max(...[-23.5,-20.5,-17.5].map(z=>ground(-5,z)))+.08,top:entry.floor,steps:8,estimated:true};
  const canopy={minX:-1.1,maxX:6,minZ:-25,maxZ:-13.5,floor:terraceFloor,underside:9.8,top:10.04,estimated:true};
  const gallery={minX:0,maxX:3.6,minZ:-41,maxZ:-26,floor:galleryFloor,ceiling:glassBottom-.2,estimated:true};
  const shell=new THREE.Group();shell.name=building.id+':teaching-center-landmark';
  Object.assign(shell.userData,{buildingId:building.id,role:'building-shell',landmark:'teaching-center',appearance:profile,localOrigin:{x:origin.x,y:base,z:origin.z},axis:{x:axis.x,z:axis.z},frontFacing:{x:-axis.x,z:-axis.z},mappedOutline:mapped.map(p=>p.slice()),mappedOutlinePreserved:true,baseSample:{x:cx,z:cz},levels:4,levelsEstimated:true,officialFloorUses:[2,3],heightEstimated:true,mainRoofHeight:mainRoof,glassRoofHeight:glassRoof,glassBottom,roofHeight:15.2,entry,stair,canopy,gallery,frontOrientationEstimated:true,roomInteriorsModeled:false,detailDimensionsEstimated:true,sourceDatumPreserved:true,modelCoordinates:'D=(east,up,north); parent H is applied once after construction.'});
  scene.add(shell);const distant=new THREE.Group();distant.visible=false;Object.assign(distant.userData,{buildingId:building.id,role:'distant-building',landmark:'teaching-center'});scene.add(distant);
  const wall:Surface={positions:[],colors:[]},details:Surface={positions:[],colors:[]},glass:Surface={positions:[],colors:[]},surfaces=[wall,details,glass],parts:Part[]=[],breakables:BreakableSpec[]=[];
  const cube=new THREE.BoxGeometry(1,1,1),cubeVertices=cube.toNonIndexed().getAttribute('position');
  const materials={stone:new THREE.MeshStandardMaterial({color:0xd7dddb}),metal:new THREE.MeshStandardMaterial({color:0x687d79}),glass:new THREE.MeshStandardMaterial({color:0x57968e})};
  function tri(s: Surface, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: number) { const tint = new THREE.Color(color); for (const p of [a, b, c]) { s.positions.push(p.x, p.y, p.z); s.colors.push(tint.r, tint.g, tint.b); } }
  function quad(s: Surface, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, color: number) { tri(s, a, b, c, color); tri(s, a, c, d, color); }
  function box(s: Surface, center: THREE.Vector3, size: THREE.Vector3, color: number, ex = axis) {
    const ez = new THREE.Vector3().crossVectors(ex, up).normalize(), tint = new THREE.Color(color);
    for (let i = 0; i < cubeVertices.count; i++) { const p = center.clone().addScaledVector(ex, cubeVertices.getX(i) * size.x).addScaledVector(up, cubeVertices.getY(i) * size.y).addScaledVector(ez, cubeVertices.getZ(i) * size.z); s.positions.push(p.x, p.y, p.z); s.colors.push(tint.r, tint.g, tint.b); }
  }
  function component(kind: keyof typeof materials, name: string, draw: () => void, ex = axis, convex = false, extra: Record<string, unknown> = {}) {
    const starts = surfaces.map(s => s.positions.length); draw();
    const ranges: Range[] = surfaces.map((surface, i) => ({ surface, start: starts[i], end: surface.positions.length, original: new Float32Array(surface.positions.slice(starts[i])) }));
    if (ranges.every(r => r.start === r.end)) return;
    const ez = new THREE.Vector3().crossVectors(ex, up).normalize(), axes = [ex, up, ez], lows = [Infinity, Infinity, Infinity], highs = [-Infinity, -Infinity, -Infinity], p = new THREE.Vector3();
    for (const r of ranges) for (let i = 0; i < r.original.length; i += 3) { p.fromArray(r.original, i); axes.forEach((a, j) => { lows[j] = Math.min(lows[j], p.dot(a)); highs[j] = Math.max(highs[j], p.dot(a)); }); }
    const proxy: THREE.Mesh = new THREE.Mesh(cube, materials[kind]); axes.forEach((a, i) => proxy.position.addScaledVector(a, (lows[i] + highs[i]) / 2));
    proxy.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ex, up, ez)); proxy.scale.set(...highs.map((v, i) => Math.max(.025, v - lows[i]) + .008) as [number, number, number]);
    const size = proxy.scale.clone(); let collisionVertices: Float32Array | undefined;
    if (convex) { const inverse = proxy.quaternion.clone().invert(), unique = new Map<string, THREE.Vector3>(); for (const r of ranges) for (let i = 0; i < r.original.length; i += 3) { const v = new THREE.Vector3().fromArray(r.original, i).sub(proxy.position).applyQuaternion(inverse); unique.set(v.toArray().map(n => n.toFixed(5)).join(','), v); } proxy.geometry = new ConvexGeometry([...unique.values()]); collisionVertices = Float32Array.from(proxy.geometry.getAttribute('position').array); proxy.scale.setScalar(1); }
    Object.assign(proxy.userData, { buildingId: building.id, landmark: 'teaching-center', renderProxy: true, component: name, convex, glazingTriangles: [starts[2]/9, glass.positions.length/9], ...extra }); proxy.updateMatrix(); proxy.updateMatrixWorld(true);
    parts.push({ proxy, shown: true, ranges }); breakables.push({ mesh: proxy, size, collisionVertices, toughness: kind === 'glass' ? 6 : 11, material: kind, label: building.name });
  }
  function clip(poly: Point[], coordinate: 'x' | 'z', value: number, greater: boolean) { const out: Point[] = []; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], ia = greater ? a[coordinate] >= value : a[coordinate] <= value, ib = greater ? b[coordinate] >= value : b[coordinate] <= value; if (ia) out.push(a); if (ia !== ib) { const t = (value - a[coordinate]) / (b[coordinate] - a[coordinate]); out.push({ x: THREE.MathUtils.lerp(a.x, b.x, t), z: THREE.MathUtils.lerp(a.z, b.z, t) }); } } return out; }
  function slab(poly: Point[], ys: number[], thickness: number, color: number, name: string, extra: Record<string, unknown> = {}) {
    if (poly.length < 3) return;
    component('stone', name, () => { const top = poly.map((p, i) => world(p.x, ys[i], p.z)), bottom = top.map(p => p.clone().addScaledVector(up, -thickness)); for (let i = 1; i < poly.length - 1; i++) { tri(details, top[0], top[i + 1], top[i], color); tri(details, bottom[0], bottom[i], bottom[i + 1], color); } for (let i = 0; i < poly.length; i++) { const j = (i + 1) % poly.length; quad(details, bottom[i], bottom[j], top[j], top[i], color); } }, axis, true, extra);
  }
  const rect = (x0: number, x1: number, z0: number, z1: number): Point[] => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
  const white=0xd8dedb, seam=0xa9b5b1, teal=0x78aca1, frame=0x436c64;
  const polygonArea=(p:Point[])=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a.x*b.z-b.x*a.z;},0))/2;
  const roofTriangles=THREE.ShapeUtils.triangulateShape(points.map(p=>new THREE.Vector2(p.x,p.z)),[]).map(t=>t.map(i=>points[i]));
  for(const triangle of roofTriangles)for(let x=-4;x<64;x+=7)for(let z=-56;z<1;z+=7){
    let poly=triangle;for(const [k,v,g]of [['x',x,true],['x',x+7,false],['z',z,true],['z',z+7,false]]as const)poly=clip(poly,k,v,g);
    for(const [z0,z1,top]of [[-56,-25,glassRoof],[-25,-13.5,glassRoof],[-13.5,1,mainRoof]]){let piece=clip(clip(poly,'z',z0,true),'z',z1,false);if(z0===-25)piece=clip(piece,'x',6,true);if(piece.length<3||polygonArea(piece)<.015)continue;if(z0===-25){for(const [min,max,y]of [[6,15,glassRoof],[15,64,mainRoof]]){const split=clip(clip(piece,'x',min,true),'x',max,false);if(split.length>=3&&polygonArea(split)>.015)slab(split,split.map(()=>y),.22,0xa3aca7,'mapped-roof-panel');}}else slab(piece,piece.map(()=>top),.22,0xa3aca7,'mapped-roof-panel');}
  }
  function frontBox(s:Surface,x:number,y:number,z:number,w:number,h:number,d:number,color:number){box(s,world(x,y,z),new THREE.Vector3(w,h,d),color);}
  function localPart(kind:keyof typeof materials,name:string,x:number,y:number,z:number,w:number,h:number,d:number,color:number,extra:Record<string,unknown>={}){component(kind,name,()=>frontBox(kind==='glass'?glass:kind==='stone'?wall:details,x,y,z,w,h,d,color),axis,false,extra);}
  const pane=(x:number,z0:number,z1:number,y0:number,y1:number,name:string,color=teal)=>component('glass',name,()=>{
    quad(glass,world(x,y0,z1),world(x,y1,z1),world(x,y1,z0),world(x,y0,z0),color);
    for(let z=z0;z<z1+.01;z+=Math.min(1.3,(z1-z0)/Math.max(1,Math.round((z1-z0)/1.3))))frontBox(details,x-.026,(y0+y1)/2,Math.min(z,z1),.052,y1-y0,.045,frame);
    for(const y of [y0,y1,(y0+y1)/2])frontBox(details,x-.026,y,(z0+z1)/2,.052,.048,z1-z0,frame);
  },front,false,{windowCenter:world(x,(y0+y1)/2,(z0+z1)/2).toArray(),surfaceNormal:axis.clone().negate().toArray()});
  // 윤곽의 각 변을 짧게 나누고 유리창과 패널을 얇은 한 부품으로 만든다.
  for(let edge=0;edge<points.length;edge++){
    const a=points[edge],b=points[(edge+1)%points.length],length=Math.hypot(b.x-a.x,b.z-a.z),tangent=axis.clone().multiplyScalar((b.x-a.x)/length).addScaledVector(front,(b.z-a.z)/length),outward=new THREE.Vector3().crossVectors(up,tangent).normalize();
    const at=(u:number,y:number,d=0)=>world(a.x,y,a.z).addScaledVector(tangent,u).addScaledVector(outward,d);
    const strip=(s:Surface,u0:number,u1:number,y0:number,y1:number,d:number,depth:number,color:number)=>{if(u1-u0>.01&&y1-y0>.01)box(s,at((u0+u1)/2,(y0+y1)/2,d),new THREE.Vector3(u1-u0,y1-y0,depth),color,tangent);};
    const cuts=[0,length];for(let u=4.8;u<length;u+=4.8)cuts.push(u);for(const z of [-25,-23.5,-17.5,-13.5])if((a.z-z)*(b.z-z)<0)cuts.push((z-a.z)/(b.z-a.z)*length);cuts.sort((a,b)=>a-b);
    for(let j=0;j<cuts.length-1;j++){
      const u0=cuts[j],u1=cuts[j+1],mid=(u0+u1)/2,lx=a.x+(b.x-a.x)*mid/length,lz=a.z+(b.z-a.z)*mid/length,isFront=lx<1&&outward.dot(axis)<-.8,isEntry=isFront&&lz>-23.5&&lz<-17.5,isTerrace=isFront&&lz>-25&&lz<-13.5,isGlassFront=(isFront&&lz<=-25)||(lz<-44&&lx<8),roof=lz<-25?glassRoof:mainRoof;
      let gmin=Infinity,gmax=-Infinity;for(let k=0;k<=12;k++){const p=at(THREE.MathUtils.lerp(u0,u1,k/12),0);const g=heightAt(p.x,p.z)-base;gmin=Math.min(gmin,g);gmax=Math.max(gmax,g);}
      if(isGlassFront){
        component('stone','low-louver-base',()=>{strip(wall,u0,u1,gmin-.4,galleryFloor-.18,-.08,.2,0x899a90);for(let y=Math.max(gmin+.12,-.4);y<galleryFloor-.18;y+=.19)strip(details,u0,u1,y,y+.055,.048,.055,0x596f65);},tangent);
        component('glass','projecting-teal-glass-bay',()=>{strip(glass,u0,u1,glassBottom,roof-.2,-.035,.045,teal);for(let k=0;k<=3;k++){const u=THREE.MathUtils.lerp(u0,u1,k/3);strip(details,u-.025,u+.025,glassBottom,roof-.2,.005,.065,frame);}for(const y of [glassBottom,glassBottom+1.6,glassBottom+3.3,roof-.2])strip(details,u0,u1,y-.025,y+.025,.005,.065,frame);strip(wall,u0,u1,roof-.2,roof,-.035,.15,white);},tangent,false,{surfaceNormal:outward.toArray(),windowCenter:at(mid,7.5,-.035).toArray()});
        component('metal','glass-body-underside-edge',()=>strip(details,u0,u1,glassBottom-.2,glassBottom,-.06,.22,0x78948a),tangent);
        continue;
      }
      if(isTerrace)continue;
      component('stone','terrain-following-foundation',()=>strip(wall,u0,u1,gmin-.5,Math.max(.25,gmax+.12),-.07,.24,0xb4bcb6),tangent);
      for(let level=0;level<(roof===mainRoof?4:3);level++){
        const bottom=level*(roof/ (roof===mainRoof?4:3)),top=(level+1)*(roof/(roof===mainRoof?4:3)),y0=Math.max(bottom,level===0?gmax+.12:bottom),blind=isFront;
        if(top<=y0)continue;
        component('stone',blind?'white-vertical-panel-bay':'estimated-side-window-bay',()=>{
          if(blind){strip(wall,u0,u1,y0,top,-.06,.18,white);for(let u=u0+.8;u<u1;u+=.8)strip(details,u,u+.018,y0,top,.035,.015,seam);}
          else{const lo=Math.max(y0,bottom+.8),hi=top-.5;strip(wall,u0,u1,y0,lo,-.06,.18,white);strip(wall,u0,u1,hi,top,-.06,.18,white);strip(wall,u0,u0+.28,lo,hi,-.06,.18,white);strip(wall,u1-.28,u1,lo,hi,-.06,.18,white);if(hi>lo){strip(glass,u0+.28,u1-.28,lo,hi,-.035,.04,0x739f99);for(const u of [u0+.28,mid,u1-.28])strip(details,u-.025,u+.025,lo,hi,.005,.055,frame);}}
        },tangent,false,{edge,level,unseenPatternEstimated:!blind});
      }
    }
  }
  // 현관 뒤 짧은 로비만 만든다. 실제 실내 강의실 배치를 재현한다고 보지 않는다.
  slab(rect(0,8,-23.5,-17.5),[entry.floor,entry.floor,entry.floor,entry.floor],.18,0xc1c4ba,'entry-lobby-floor');
  pane(entry.x,-23.5,-17.5,entry.floor+.06,entry.floor+entry.height,'recessed-entry-door',0x4a7974);
  for(const z of [-23.5,-17.5])localPart('stone','recessed-entry-cheek',1.1,(entry.floor+entry.floor+entry.height)/2,z,2.2,entry.height,.16,0xc9cfca);
  localPart('stone','entry-stone-fascia',.3,(entry.floor+entry.height+terraceFloor)/2,-20.5,.55,terraceFloor-entry.floor-entry.height,9.4,0xb5bdb7);
  for(let i=0;i<stair.steps;i++){const x0=THREE.MathUtils.lerp(stair.startX,stair.endX,i/stair.steps),x1=THREE.MathUtils.lerp(stair.startX,stair.endX,(i+1)/stair.steps),y=THREE.MathUtils.lerp(stair.bottom,stair.top,(i+1)/stair.steps);slab(rect(x0,x1,-23.5,-17.5),[y,y,y,y],.24,0xb5b8ae,'entrance-stair-tread',{step:i});}
  for(let j=0;j<6;j++){const z0=-23.5+j,z1=z0+1,x0=stair.startX-1.5,x1=stair.startX,p=rect(x0,x1,z0,z1),y0=ground(x0,z0)+.055,y1=ground(x0,z1)+.055;slab([p[0],p[1],p[2]],[y0,stair.bottom,stair.bottom],.14,0xaeb4a9,'stair-ground-connection');slab([p[0],p[2],p[3]],[y0,stair.bottom,y1],.14,0xaeb4a9,'stair-ground-connection');}
  // 열린 테라스의 지붕, 지지대와 난간을 개별 부품으로 두어 빈 공간을 보존한다.
  for(let z=-25;z<-13.5;z+=3.8){const end=Math.min(z+3.8,-13.5);slab(rect(-.2,6,z,end),[terraceFloor,terraceFloor,terraceFloor,terraceFloor],.2,0xc2c7bf,'terrace-floor');slab(rect(canopy.minX,canopy.maxX,z,end),[canopy.top,canopy.top,canopy.top,canopy.top],.24,0xb6c2b7,'projecting-terrace-canopy');pane(5.9,z,end,terraceFloor+.1,9.65,'terrace-recessed-glass');}
  for(const z of [-24.8,-20.5,-16.2,-13.7])localPart('metal','canopy-steel-column',-.6,(terraceFloor+canopy.underside)/2,z,.15,canopy.underside-terraceFloor,.15,0x5a7469);
  for(let z=-24.8;z<-13.5;z+=1.3)localPart('metal','terrace-rail-post',-.3,terraceFloor+.51,z,.055,1.02,.055,0x8eaaa0);
  for(const y of [terraceFloor+.4,terraceFloor+.73,terraceFloor+1.05])localPart('metal','terrace-horizontal-rail',-.3,y,-19.2,.055,.05,11.4,0x9bb3a8);
  for(let z=-25;z<-13.5;z+=1.1)localPart('metal','canopy-visible-rib',2.4,canopy.underside-.08,z,6.9,.16,.08,0x6d8277);
  pane(6,-17,-13.5,10.2,13.65,'upper-setback-glass');
  const southStepEnd=Math.max(...points.flatMap((p,i)=>{const q=points[(i+1)%points.length];return(p.z+25)*(q.z+25)<0?[p.x+(q.x-p.x)*(-25-p.z)/(q.z-p.z)]:[];}));
  for(let x=15;x<southStepEnd;x+=4){const end=Math.min(x+4,southStepEnd);localPart('stone','roof-height-step',(x+end)/2,12.1,-25,end-x,3.8,.16,white);}
  for(let z=-25;z<-13.5;z+=3.8)localPart('stone','roof-height-step',15,12.1,(z+Math.min(z+3.8,-13.5))/2,.16,3.8,Math.min(3.8,-13.5-z),white);
  for(let x=0;x<15;x+=3.75)localPart('stone','roof-height-step',x+1.875,12.1,-13.5,3.75,3.8,.16,white);
  // 유리 몸체 아래 통로와 뒤쪽 유리는 별도 형상이다. 낮은 루버면이 기둥층을 막지 않는다.
  for(let z=-41;z<-25;z+=4){slab(rect(-.1,4,z,Math.min(z+4,-25)),[galleryFloor,galleryFloor,galleryFloor,galleryFloor],.18,0xa9b5a8,'open-gallery-floor');pane(4,z,Math.min(z+4,-25),galleryFloor+.12,glassBottom-.24,'gallery-setback-glass',0x587f73);}
  for(const z of [-40.5,-35.5,-30.5,-25.5])localPart('metal','open-gallery-column',.25,(galleryFloor+glassBottom-.2)/2,z,.23,glassBottom-.2-galleryFloor,.23,0x739784);
  // 분홍 옥탑은 관찰된 둥근 끝을 16개 얇은 면으로 근사한다.
  const tower={x:10,z:-19,rx:3.1,rz:4.8,bottom:10.2,top:15.2,estimated:true};shell.userData.roofTower=tower;
  for(let i=0;i<16;i++){const a=i/16*Math.PI*2,b=(i+1)/16*Math.PI*2,p0={x:tower.x+Math.cos(a)*tower.rx,z:tower.z+Math.sin(a)*tower.rz},p1={x:tower.x+Math.cos(b)*tower.rx,z:tower.z+Math.sin(b)*tower.rz};component('stone','rounded-pink-roof-tower',()=>{const top0=world(p0.x,tower.top,p0.z),top1=world(p1.x,tower.top,p1.z),bot0=world(p0.x,tower.bottom,p0.z),bot1=world(p1.x,tower.bottom,p1.z);quad(wall,bot0,top0,top1,bot1,0xbda5ae);quad(wall,bot1,top1,top1.clone().addScaledVector(axis,.08),bot1.clone().addScaledVector(axis,.08),0xbda5ae);},axis,true);slab([{x:tower.x,z:tower.z},p0,p1],[tower.top,tower.top,tower.top],.1,0xbcaeb2,'pink-tower-roof');}
  for(const z of [-31,-37,-43])localPart('metal','roof-service-equipment',7,glassRoof+.55,z,1.8,1.1,1.6,0xa7b1a7);
  // 숫자는 H 반사 뒤 관찰자 기준 왼쪽부터 6, 1로 읽히도록 -v 순서로 놓는다.
  const label={text:'61',glyphCenters:[] as number[][],segmentCenters:[] as number[][],outward:axis.clone().negate().toArray(),attachedToWallPart:true,color:0xf4f6e7};
  component('metal','building-number-61',()=>{
    frontBox(details,-.12,glassRoof+.74,-27.5,.12,1.35,1.9,0x25618b);
    for(let digit=0;digit<2;digit++){const z=-27.1-digit*.85,y=glassRoof+.74,w=.5,h=.86;label.glyphCenters.push(world(-.19,y,z).toArray());const strips=digit===0?[[0,h/2,w,.09],[0,0,w,.09],[0,-h/2,w,.09],[w/2,h/4,.09,h/2],[w/2,-h/4,.09,h/2],[-w/2,-h/4,.09,h/2]]:[[0,0,.15,h],[0,-h/2,.44,.1],[.1,h/2-.1,.22,.12]];for(const [dz,dy,sw,sh]of strips){const c=world(-.192,y+dy,z+dz);label.segmentCenters.push(c.toArray());quad(details,world(-.193,y+dy-sh/2,z+dz+sw/2),world(-.193,y+dy+sh/2,z+dz+sw/2),world(-.193,y+dy+sh/2,z+dz-sw/2),world(-.193,y+dy-sh/2,z+dz-sw/2),label.color);}}
  },front,false,{numberLabel:'61'});shell.userData.numberLabel=label;
  for(const [s,name,roughness]of [[wall,'white-panels',.88],[details,'roof-and-frames',.61],[glass,'glazing',.27]]as const){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(s.positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(s.colors,3));(geometry.getAttribute('position')as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);geometry.computeVertexNormals();geometry.computeBoundingSphere();geometry.computeBoundingBox();s.geometry=geometry;const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness,metalness:s===details?.16:s===glass?.08:.01}));mesh.name=`teaching-center-${name}`;mesh.receiveShadow=true;shell.add(mesh);s.positions.length=0;s.colors.length=0;}
  function update(_player: THREE.Vector3) { const changed=new Set<Surface>();for(const part of parts)if(part.shown!==part.proxy.visible){part.shown=part.proxy.visible;for(const r of part.ranges){if(r.start===r.end)continue;const attr=r.surface.geometry!.getAttribute('position')as THREE.BufferAttribute;if(!changed.has(r.surface))attr.clearUpdateRanges();changed.add(r.surface);if(part.shown)(attr.array as Float32Array).set(r.original,r.start);else for(let i=r.start;i<r.end;i+=3){attr.array[i]=part.proxy.position.x;attr.array[i+1]=part.proxy.position.y;attr.array[i+2]=part.proxy.position.z;}attr.addUpdateRange(r.start,r.end-r.start);}}for(const s of changed)s.geometry!.getAttribute('position').needsUpdate=true;shell.visible=parts.some(p=>p.proxy.visible);}
  return { breakables, update };
}
