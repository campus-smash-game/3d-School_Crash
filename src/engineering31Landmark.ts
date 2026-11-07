import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { CampusBuilding } from './fullCampus';
import type { BuildingAppearance } from './buildingAppearance';
import type { BreakableSpec } from './scene';
import { createEngineering3130Connection, getEngineering3130ConnectionLayout } from './engineering3130Connection';
type Point={x:number;z:number};
type Surface={positions:number[];colors:number[];geometry?:THREE.BufferGeometry};
type Range={surface:Surface;start:number;end:number;original:Float32Array};
type Part={proxy:THREE.Mesh;shown:boolean;ranges:Range[]};

// 31동 원본 윤곽과 2024년 거리뷰에서 확인한 동쪽 연결부를 별도로 만든다.
export function createEngineering31Landmark(scene:THREE.Scene,building:CampusBuilding,profile:BuildingAppearance,heightAt:(x:number,z:number)=>number){
  const mapped=building.points.filter((p,i,a)=>i!==a.length-1||p[0]!==a[0][0]||p[1]!==a[0][1]);
  if(mapped.length<3)throw new Error('Engineering 31 needs a mapped footprint.');
  const cx=mapped.reduce((s,p)=>s+p[0],0)/mapped.length,cz=mapped.reduce((s,p)=>s+p[1],0)/mapped.length,base=heightAt(cx,cz);
  const origin=new THREE.Vector3(100.33,base,-1023.2),axis=new THREE.Vector3(59.25,0,6.88).normalize(),front=new THREE.Vector3(-axis.z,0,axis.x),up=new THREE.Vector3(0,1,0);
  const world=(x:number,y:number,z:number)=>origin.clone().addScaledVector(axis,x).addScaledVector(up,y).addScaledVector(front,z);
  const ground=(x:number,z:number)=>{const p=world(x,0,z);return heightAt(p.x,p.z)-base;};
  let points=mapped.map(p=>({x:(p[0]-origin.x)*axis.x+(p[1]-origin.z)*axis.z,z:(p[0]-origin.x)*front.x+(p[1]-origin.z)*front.z}));
  if(points.reduce((s,p,i)=>{const q=points[(i+1)%points.length];return s+p.x*q.z-q.x*p.z;},0)<0)points.reverse();
  const observed=scene.getObjectByName('campus-terrain')?.userData.engineering30Correction?.layout;
  const mainRoof=14,towerRoof=observed?Math.max(17.5,observed.connector.upperFloors.at(-1)+1.0-base):17.5,towerStart=58.8;
  const connectionLayout:ReturnType<typeof getEngineering3130ConnectionLayout>=observed?.connector??getEngineering3130ConnectionLayout(heightAt),connectionOpening=connectionLayout.openings.find(o=>o.buildingId===building.id)!;
  const entry={x:29.5,z:-1.8,width:5.6,height:3.1,floor:0,estimated:true};
  entry.floor=Math.max(...[26.7,29.5,32.3].flatMap(x=>[-6,-3,0,2].map(z=>ground(x,z))))+.13;
  const stair={startZ:4,endZ:0,centerX:entry.x,width:entry.width,bottom:Math.max(...[26.7,29.5,32.3].map(x=>ground(x,4)))+.08,top:entry.floor,steps:6,estimated:true};
  const shell=new THREE.Group();shell.name=building.id+':engineering-31-landmark';
  Object.assign(shell.userData,{buildingId:building.id,role:'building-shell',landmark:'engineering-31',appearance:profile,localOrigin:{x:origin.x,y:base,z:origin.z},axis:{x:axis.x,z:axis.z},frontFacing:{x:-front.x,z:-front.z},mappedOutline:mapped.map(p=>p.slice()),mappedOutlinePreserved:true,baseSample:{x:cx,z:cz},levels:5,levelsEstimated:false,levelSource:'OpenStreetMap',heightEstimated:true,mainRoofHeight:mainRoof,roofHeight:towerRoof,towerStart,entry,stair,frontOrientationEstimated:true,photoFacing:'south face of the eastern white tower',excludedUnmappedConnection:'The white connector and barrel canopy toward building 30 are outside this footprint and are not assigned to building 31.',roomInteriorsModeled:false,detailDimensionsEstimated:true,constructionPhase:'Historic photograph appearance; 2025 phase-one notice concerns neighboring building 32. Present-day facade survival not independently observed.',sourceDatumPreserved:true,modelCoordinates:'D=(east,up,north); parent H is applied once after construction.'});
  scene.add(shell);const distant=new THREE.Group();distant.visible=false;Object.assign(distant.userData,{buildingId:building.id,role:'distant-building',landmark:'engineering-31'});scene.add(distant);
  shell.userData.connectionRevision={captureDate:'2024-02',connection:'white east connector to building 30',greenCanopy:'Separate western structure; not added.',opening:connectionOpening,dimensionsEstimated:true};
  shell.userData.excludedUnmappedConnection='The historic western green barrel canopy is not included. The white east connector is a separate geometry with estimated dimensions.';
  shell.userData.constructionPhase='Building 31 and the east white connector were directly compared with February 2024 street imagery. The 2025 building 32 construction is separate; 2026 survival is not established.';
  const wall:Surface={positions:[],colors:[]},details:Surface={positions:[],colors:[]},glass:Surface={positions:[],colors:[]},surfaces=[wall,details,glass],parts:Part[]=[],breakables:BreakableSpec[]=[];
  const cube=new THREE.BoxGeometry(1,1,1),cubeVertices=cube.toNonIndexed().getAttribute('position');
  const materials={stone:new THREE.MeshStandardMaterial({color:0xc5c4b9}),metal:new THREE.MeshStandardMaterial({color:0x7d837b}),glass:new THREE.MeshStandardMaterial({color:0x577d83})};
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
    // 창 구획의 전면 충돌면은 유리와 돌출 띠의 중간에 둔다. 두 표면의 오차를 함께 줄인다.
    if (name === 'brick-and-white-ribbon-bay' && extra.windowCenter && extra.surfaceNormal) {
      const normal = new THREE.Vector3().fromArray(extra.surfaceNormal as number[]), window = new THREE.Vector3().fromArray(extra.windowCenter as number[]), sign = Math.sign(normal.dot(ez));
      const glassFront = window.dot(normal) + .0175, renderFront = sign > 0 ? highs[2] : -lows[2], balanced = (glassFront + renderFront) / 2;
      if (sign > 0) highs[2] = balanced - .004; else lows[2] = -balanced + .004;
    }
    const proxy: THREE.Mesh = new THREE.Mesh(cube, materials[kind]); axes.forEach((a, i) => proxy.position.addScaledVector(a, (lows[i] + highs[i]) / 2));
    proxy.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ex, up, ez)); proxy.scale.set(...highs.map((v, i) => Math.max(.025, v - lows[i]) + .008) as [number, number, number]);
    const size = proxy.scale.clone(); let collisionVertices: Float32Array | undefined;
    if (convex) { const inverse = proxy.quaternion.clone().invert(), unique = new Map<string, THREE.Vector3>(); for (const r of ranges) for (let i = 0; i < r.original.length; i += 3) { const v = new THREE.Vector3().fromArray(r.original, i).sub(proxy.position).applyQuaternion(inverse); unique.set(v.toArray().map(n => n.toFixed(5)).join(','), v); } proxy.geometry = new ConvexGeometry([...unique.values()]); collisionVertices = Float32Array.from(proxy.geometry.getAttribute('position').array); proxy.scale.setScalar(1); }
    Object.assign(proxy.userData, { buildingId: building.id, landmark: 'engineering-31', renderProxy: true, component: name, convex, glazingTriangles: [starts[2]/9, glass.positions.length/9], ...extra }); proxy.updateMatrix(); proxy.updateMatrixWorld(true);
    parts.push({ proxy, shown: true, ranges }); breakables.push({ mesh: proxy, size, collisionVertices, toughness: kind === 'glass' ? 6 : 11, material: kind, label: building.name });
  }
  function clip(poly: Point[], coordinate: 'x' | 'z', value: number, greater: boolean) { const out: Point[] = []; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], ia = greater ? a[coordinate] >= value : a[coordinate] <= value, ib = greater ? b[coordinate] >= value : b[coordinate] <= value; if (ia) out.push(a); if (ia !== ib) { const t = (value - a[coordinate]) / (b[coordinate] - a[coordinate]); out.push({ x: THREE.MathUtils.lerp(a.x, b.x, t), z: THREE.MathUtils.lerp(a.z, b.z, t) }); } } return out; }
  function slab(poly: Point[], ys: number[], thickness: number, color: number, name: string, extra: Record<string, unknown> = {}) {
    if (poly.length < 3) return;
    component('stone', name, () => { const top = poly.map((p, i) => world(p.x, ys[i], p.z)), bottom = top.map(p => p.clone().addScaledVector(up, -thickness)); for (let i = 1; i < poly.length - 1; i++) { tri(details, top[0], top[i + 1], top[i], color); tri(details, bottom[0], bottom[i], bottom[i + 1], color); } for (let i = 0; i < poly.length; i++) { const j = (i + 1) % poly.length; quad(details, bottom[i], bottom[j], top[j], top[i], color); } }, axis, true, extra);
  }
  const rect = (x0: number, x1: number, z0: number, z1: number): Point[] => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];

  const white=0xd9d9ce,brick=0x985d40,frame=0x535d59,glazing=0x62838a,roofColor=0x71957a;
  function part(kind:keyof typeof materials,name:string,x:number,y:number,z:number,w:number,h:number,d:number,color:number,extra:Record<string,unknown>={}){component(kind,name,()=>box(kind==='glass'?glass:kind==='stone'?wall:details,world(x,y,z),new THREE.Vector3(w,h,d),color),axis,false,extra);}
  const polygonArea=(p:Point[])=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a.x*b.z-b.x*a.z;},0))/2;
  const roofTriangles=THREE.ShapeUtils.triangulateShape(points.map(p=>new THREE.Vector2(p.x,p.z)),[]).map(t=>t.map(i=>points[i]));
  for(const triangle of roofTriangles)for(let x=-1;x<71;x+=7)for(let z=-36;z<1;z+=7){
    let poly=triangle;for(const [k,v,g]of [['x',x,true],['x',x+7,false],['z',z,true],['z',z+7,false]]as const)poly=clip(poly,k,v,g);
    for(const [lo,hi,top]of [[-2,towerStart,mainRoof],[towerStart,72,towerRoof]]){const piece=clip(clip(poly,'x',lo,true),'x',hi,false);if(piece.length>=3&&polygonArea(piece)>.015)slab(piece,piece.map(()=>top),.22,roofColor,'mapped-roof-panel');}
  }
  const towerCrossings=points.flatMap((p,i)=>{const q=points[(i+1)%points.length];return(p.x-towerStart)*(q.x-towerStart)<0?[p.z+(q.z-p.z)*(towerStart-p.x)/(q.x-p.x)]:[];}).sort((a,b)=>a-b);
  for(let z=towerCrossings[0];z<towerCrossings.at(-1)!;z+=4){const end=Math.min(z+4,towerCrossings.at(-1)!);part('stone','tower-roof-step',towerStart,(mainRoof+towerRoof)/2,(z+end)/2,.16,towerRoof-mainRoof,end-z,white);}
  // 긴 몸체의 벽돌과 흰 수평 띠를 같은 창 구획에 묶어 작은 장식의 물리 부하를 줄인다.
  for(let edge=0;edge<points.length;edge++){
    const a=points[edge],b=points[(edge+1)%points.length],length=Math.hypot(b.x-a.x,b.z-a.z),tangent=axis.clone().multiplyScalar((b.x-a.x)/length).addScaledVector(front,(b.z-a.z)/length),outward=new THREE.Vector3().crossVectors(up,tangent).normalize();
    const at=(u:number,y:number,d=0)=>world(a.x,y,a.z).addScaledVector(tangent,u).addScaledVector(outward,d);
    const strip=(s:Surface,u0:number,u1:number,y0:number,y1:number,d:number,depth:number,color:number)=>{if(u1-u0>.008&&y1-y0>.008)box(s,at((u0+u1)/2,(y0+y1)/2,d),new THREE.Vector3(u1-u0,y1-y0,depth),color,tangent);};
    const cuts=[0,length];for(let u=5;u<length;u+=5)cuts.push(u);for(const x of [entry.x-entry.width/2,entry.x+entry.width/2,towerStart,66.8])if((a.x-x)*(b.x-x)<0)cuts.push((x-a.x)/(b.x-a.x)*length);
    const edgeStart=at(0,0),joinPoints=[connectionOpening.a,connectionOpening.b].map(p=>new THREE.Vector3(p[0],base,p[1])),onJoinFace=joinPoints.every(p=>Math.abs(p.clone().sub(edgeStart).dot(outward))<.05);
    const joinCuts=joinPoints.map(p=>p.sub(edgeStart).dot(tangent)).sort((a,b)=>a-b);
    if(onJoinFace)for(const u of joinCuts)if(u>0&&u<length)cuts.push(u);cuts.sort((a,b)=>a-b);
    for(let j=0;j<cuts.length-1;j++){
      const u0=cuts[j],u1=cuts[j+1],mid=(u0+u1)/2,lx=a.x+(b.x-a.x)*mid/length,lz=a.z+(b.z-a.z)*mid/length,isTower=lx>=towerStart-.001,roof=isTower?towerRoof:mainRoof,north=outward.dot(front)>.8,entryBay=north&&lx>entry.x-entry.width/2-.01&&lx<entry.x+entry.width/2+.01, southTower=isTower&&outward.dot(front)<-.8;
      const connectorBay=onJoinFace&&mid>joinCuts[0]&&mid<joinCuts[1];
      let gmin=Infinity,gmax=-Infinity;for(let k=0;k<=12;k++){const p=at(THREE.MathUtils.lerp(u0,u1,k/12),0),g=heightAt(p.x,p.z)-base;gmin=Math.min(gmin,g);gmax=Math.max(gmax,g);}
      if(!entryBay&&!connectorBay)component('stone','terrain-foundation',()=>strip(wall,u0,u1,gmin-.45,gmax+.12,-.055,.18,0xb6b8ac),tangent);
      const rows=isTower&&observed?5:4,spacing=roof/rows;
      for(let level=0;level<rows;level++){
        const bottom=level*spacing,top=(level+1)*spacing,y0=Math.max(bottom,level===0?gmax+.12:bottom,connectorBay?connectionOpening.top-base:-Infinity),openEntry=entryBay&&level===0;
        if(openEntry){component('stone','entry-lintel',()=>strip(wall,u0,u1,entry.floor+entry.height,top,-.035,.18,white),tangent);continue;}
        if(top<=y0)continue;
        if(southTower&&lx>66.8){
          const steps=3;for(let k=0;k<steps;k++){const yA=THREE.MathUtils.lerp(y0,top,k/steps),yB=THREE.MathUtils.lerp(y0,top,(k+1)/steps),recess=(y:number)=>y>5&&y<14?.9*Math.sin((y-5)/9*Math.PI):0;
            component('stone','white-tower-curved-cheek',()=>{const n=outward.clone().multiplyScalar(.12),p0=at(u0,yA,-recess(yA)),p1=at(u1,yA,-recess(yA)),p2=at(u1,yB,-recess(yB)),p3=at(u0,yB,-recess(yB));quad(wall,p0,p1,p2,p3,white);quad(wall,p0.clone().sub(n),p3.clone().sub(n),p2.clone().sub(n),p1.clone().sub(n),white);for(const [aa,bb]of [[p0,p1],[p1,p2],[p2,p3],[p3,p0]])quad(wall,aa,aa.clone().sub(n),bb.clone().sub(n),bb,white);},tangent,true,{edge,level,estimatedCurve:true});
          }continue;
        }
        const low=Math.max(y0,bottom+(isTower?1.05:.72)),high=top-(isTower?1.0:.65),side=Math.min(isTower?.8:.26,(u1-u0)*.24),windowed=high>low&&u1-u0>.75;
        component('stone',isTower?'white-tower-window-bay':'brick-and-white-ribbon-bay',()=>{
          if(!windowed)strip(wall,u0,u1,y0,top,-.055,.16,isTower?white:brick);
          else{strip(wall,u0,u1,y0,low,-.055,.16,isTower?white:brick);strip(wall,u0,u1,high,top,-.055,.16,isTower?white:brick);strip(wall,u0,u0+side,low,high,-.055,.16,white);strip(wall,u1-side,u1,low,high,-.055,.16,white);strip(glass,u0+side,u1-side,low,high,-.045,.035,glazing);
            for(const u of [u0+side,mid,u1-side])strip(details,u-.024,u+.024,low,high,.005,.05,frame);
            for(const y of [low,high])strip(details,u0+side,u1-side,y-.024,y+.024,.005,.05,frame);
            if(!isTower){strip(wall,u0,u1,top-.18,top,.005,.15,white);for(let y=y0+.16;y<low-.05;y+=.22)strip(details,u0,u1,y,y+.012,.029,.008,0xb97e58);}
          }
        },tangent,false,{edge,level,windowCenter:windowed?at(mid,(low+high)/2,-.045).toArray():undefined,surfaceNormal:outward.toArray(),unseenPatternEstimated:!southTower});
      }
      component('stone','roof-parapet',()=>{strip(wall,u0,u1,roof,roof+.28,-.035,.16,white);strip(details,u0,u1,roof+.28,roof+.32,-.035,.23,0x9ea89b);},tangent);
    }
  }
  // 북쪽 현관은 원본 도로에서 접근하는 게임용 근사다. 확인하지 못한 방 배치는 만들지 않는다.
  slab(rect(26.7,32.3,-7,0),[entry.floor,entry.floor,entry.floor,entry.floor],.17,0xb8bdb2,'entry-lobby-floor');
  component('glass','north-recessed-entry-door',()=>{box(glass,world(entry.x,entry.floor+entry.height/2,entry.z),new THREE.Vector3(entry.width,entry.height,.045),0x557a7a);for(const x of [26.7,29.5,32.3])box(details,world(x,entry.floor+entry.height/2,entry.z+.028),new THREE.Vector3(.055,entry.height,.055),frame);},axis,false,{surfaceNormal:front.toArray(),windowCenter:world(entry.x-.7,entry.floor+1.5,entry.z+.0225).toArray()});
  for(const x of [26.7,32.3])part('stone','entry-recess-side',x,entry.floor+entry.height/2,-.9,.15,entry.height,1.8,white);
  for(let i=0;i<stair.steps;i++){const z0=THREE.MathUtils.lerp(stair.startZ,stair.endZ,i/stair.steps),z1=THREE.MathUtils.lerp(stair.startZ,stair.endZ,(i+1)/stair.steps),y=THREE.MathUtils.lerp(stair.bottom,stair.top,(i+1)/stair.steps);slab(rect(26.7,32.3,z1,z0),[y,y,y,y],.18,0xb3b7aa,'north-entry-stair',{step:i});}
  for(let i=0;i<6;i++){const x0=26.7+i*entry.width/6,x1=x0+entry.width/6,z0=stair.startZ,z1=stair.startZ+1.5,p=rect(x0,x1,z0,z1),y0=ground(x0,z1)+.055,y1=ground(x1,z1)+.055;slab([p[0],p[1],p[2]],[stair.bottom,stair.bottom,y1],.13,0xaeb3a6,'ground-to-stair-ramp');slab([p[0],p[2],p[3]],[stair.bottom,y1,y0],.13,0xaeb3a6,'ground-to-stair-ramp');}
  for(let z=-7;z<-1;z+=3)slab(rect(26.7,32.3,z,z+3),[entry.floor+3.35,entry.floor+3.35,entry.floor+3.35,entry.floor+3.35],.18,0xc2c6ba,'entry-ceiling');
  // 옥상 기계열과 낮은 설비실은 항공사진의 위치와 비례를 근사한다.
  for(let x=12;x<52;x+=5)component('metal','roof-equipment-bay',()=>{box(details,world(x,mainRoof+.42,-17),new THREE.Vector3(3.1,.84,1.5),0xa5ada0);for(let u=-1;u<=1;u+=.5)box(details,world(x+u,mainRoof+.86,-17),new THREE.Vector3(.03,.05,1.3),0x687268);},axis);
  for(let x=13;x<51;x+=6)part('stone','low-roof-service-room',x+3,mainRoof+.8,-21,6,1.6,3.4,0xaaa99a);
  // 남쪽에서 H 반사 후 3, 1 순서로 읽히도록 +u 방향으로 획을 놓는다.
  const label={text:'31',glyphCenters:[]as number[][],segmentCenters:[]as number[][],outward:front.clone().negate().toArray(),attachedToWallPart:true};
  const southA=points.reduce((a,b)=>a.z<b.z?a:b),labelZ=southA.z-.055;
  component('metal','building-number-31',()=>{for(let digit=0;digit<2;digit++){const x=64.1+digit*.92,y=observed?towerRoof-1.3:16.2,w=.58,h=1.02;label.glyphCenters.push(world(x,y,labelZ-.02).toArray());const strokes=digit===0?[[0,h/2,w,.11],[0,0,w,.11],[0,-h/2,w,.11],[w/2,h/4,.11,h/2],[w/2,-h/4,.11,h/2]]:[[0,0,.15,h],[0,-h/2,.45,.11],[-.1,h/2-.1,.24,.12]];for(const[dx,dy,sw,sh]of strokes){const c=world(x+dx,y+dy,labelZ-.03);label.segmentCenters.push(c.toArray());box(details,c,new THREE.Vector3(sw,sh,.055),0x7da4ac);}}},axis,false,{numberLabel:'31'});shell.userData.numberLabel=label;
  for(const [s,name,roughness]of [[wall,'walls',.88],[details,'roof-and-frames',.61],[glass,'glazing',.27]]as const){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(s.positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(s.colors,3));(geometry.getAttribute('position')as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);geometry.computeVertexNormals();geometry.computeBoundingSphere();geometry.computeBoundingBox();s.geometry=geometry;const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness,metalness:s===details?.16:s===glass?.08:.01}));mesh.name=`engineering-31-${name}`;mesh.receiveShadow=true;shell.add(mesh);s.positions.length=0;s.colors.length=0;}
  function update(_player: THREE.Vector3) { const changed=new Set<Surface>();for(const part of parts)if(part.shown!==part.proxy.visible){part.shown=part.proxy.visible;for(const r of part.ranges){if(r.start===r.end)continue;const attr=r.surface.geometry!.getAttribute('position')as THREE.BufferAttribute;if(!changed.has(r.surface))attr.clearUpdateRanges();changed.add(r.surface);if(part.shown)(attr.array as Float32Array).set(r.original,r.start);else for(let i=r.start;i<r.end;i+=3){attr.array[i]=part.proxy.position.x;attr.array[i+1]=part.proxy.position.y;attr.array[i+2]=part.proxy.position.z;}attr.addUpdateRange(r.start,r.end-r.start);}}for(const s of changed)s.geometry!.getAttribute('position').needsUpdate=true;shell.visible=parts.some(p=>p.proxy.visible);}
  const connection=createEngineering3130Connection(scene,heightAt);
  return { breakables:[...breakables,...connection.breakables], update:(player:THREE.Vector3)=>{update(player);connection.update(player);} };
}
