import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import type { CampusBuilding } from './fullCampus';
import { humanities23Frame } from './humanities23Site';
import { physics561SurfaceHeight } from './physics561Site';
import { SCIENCE22_ID,SCIENCE56_ID,type Science2256Layout } from './science2256Site';
type XZ=[number,number];type Frame=ReturnType<typeof humanities23Frame>;type Proxy=THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
export function createScience2256Exterior(scene:THREE.Scene,buildings:CampusBuilding[],q:Science2256Layout,heightAt:(x:number,z:number)=>number){
 const shell=new THREE.Group();shell.name='landmark/science2256-exterior';Object.assign(shell.userData,{role:'building-shell',buildingIds:[SCIENCE22_ID,SCIENCE56_ID]});scene.add(shell);
 let building=buildings.find(b=>b.id===SCIENCE22_ID)!;
 const signs:{mesh:THREE.Mesh;owner:Proxy}[]=[];
  const breakables: BreakableSpec[] = [];
  const batches = [false, true].map(glass => ({ glass, positions: [] as number[], colors: [] as number[], parts: [] as { proxy: Proxy; start: number; end: number; original: Float32Array; colors: Float32Array; base: THREE.Color; color: number; shown: boolean }[] }));
  const at = (f: Frame, s: number, y: number, n = 0) => { const p = f.point(s, n); return new THREE.Vector3(p[0], y, p[1]); };
  function part(name: string, vertices: THREE.Vector3[], color: number, material: BreakableSpec['material'] = 'stone', owner?: Proxy, flat = false) {
    const bounds = new THREE.Box3().setFromPoints(vertices), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const g = flat ? new THREE.BufferGeometry() : new ConvexGeometry(vertices.map(p => p.clone().sub(center)));
    if (flat) { const values: number[] = []; for (let i = 1; i + 1 < vertices.length; i++) for (const p of [vertices[0], vertices[i], vertices[i + 1]]) values.push(...p.clone().sub(center).toArray()); g.setAttribute('position', new THREE.Float32BufferAttribute(values, 3)); }
    const attr = g.attributes.position, proxy = owner ?? new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color }));
    if (!owner) { proxy.position.copy(center); proxy.updateMatrixWorld(true); Object.assign(proxy.userData, { buildingId: building.id, component: name, renderProxy: true, convex: true }); breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attr.array), toughness: material === 'glass' ? 2 : 8, material, label: building.id===SCIENCE22_ID?'22동':'56동과 연결교' }); }
    const b = batches[material === 'glass' ? 1 : 0], start = b.positions.length, tint = new THREE.Color(color);
    for (let i = 0; i < attr.count; i++) { b.positions.push(attr.getX(i) + center.x, attr.getY(i) + center.y, attr.getZ(i) + center.z); b.colors.push(tint.r, tint.g, tint.b); }
    b.parts.push({ proxy, start, end: b.positions.length, original: Float32Array.from(b.positions.slice(start)), colors: Float32Array.from(b.colors.slice(start)), base: proxy.material.color.clone(), color: proxy.material.color.getHex(), shown: true });
    if (owner) g.dispose(); return proxy;
  }
  function box(name: string, f: Frame, s0: number, s1: number, n0: number, n1: number, y0: number, y1: number, color = 0xd9dcd4, material: BreakableSpec['material'] = 'stone', owner?: Proxy) {
    const v: THREE.Vector3[] = []; for (const s of [s0, s1]) for (const n of [n0, n1]) for (const y of [y0, y1]) v.push(at(f, s, y, n)); return part(name, v, color, material, owner);
  }
  function beam(name: string, a: THREE.Vector3, b: THREE.Vector3, radius: number, color: number, owner?: Proxy) {
    const d = b.clone().sub(a), g = new THREE.CylinderGeometry(radius, radius, d.length(), 8), rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), center = a.clone().add(b).multiplyScalar(.5), p = g.attributes.position;
    const result = part(name, Array.from({ length: p.count }, (_, i) => new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).applyQuaternion(rotation).add(center)), color, 'metal', owner); g.dispose(); return result;
  }
  function facet(name: string, f: Frame, s0: number, s1: number, y0: number, y1: number, n: number, color: number, owner: Proxy) { part(name, [at(f, s0, y0, n), at(f, s1, y0, n), at(f, s1, y1, n), at(f, s0, y1, n)], color, 'stone', owner, true); }

  function label(name:string,text:string,f:Frame,s:number,n:number,y:number,width:number,height:number,owner:Proxy,background:string,color:string){
    const canvas=document.createElement('canvas');canvas.width=q.access?128:768;canvas.height=128;const ctx=canvas.getContext('2d')!;ctx.fillStyle=background;ctx.fillRect(0,0,canvas.width,128);ctx.fillStyle=color;ctx.font=q.access?'bold 92px sans-serif':'bold 63px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,canvas.width/2,64);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const geometry=new THREE.PlaneGeometry(width,height);geometry.scale(-1,1,1);const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));mesh.name=name;mesh.position.copy(at(f,s,y,n));mesh.lookAt(at(f,s,y,n-1));shell.add(mesh);signs.push({mesh,owner});
  }



 const f=q.f,white=0xd9d9cf,pavementMasks:{component:string;polygon:XZ[]}[]=[];
 const axis=(s:number,n0=-78,n1=10)=>humanities23Frame(f.point(s,n0),f.point(s,n1));
 function glazing(name:string,frame:Frame,a:number,b:number,n:number,ya:number,yb:number,blue=false){
  const owner=box(name,frame,a,b,n-.05,n+.05,ya,yb,blue?0x638d98:0x70827f,'glass');
  for(let s=a+.05;s<b;s+=1.35)box('window-mullion',frame,s-.025,s+.025,n-.08,n+.08,ya,yb,blue?0x263d50:0x252f30,'metal',owner);
  for(const y of[ya,(ya+yb)/2,yb])box('window-transom',frame,a,b,n-.08,n+.08,y-.03,y+.03,blue?0x304758:0x293533,'metal',owner);
  return owner;
 }
 function wall(name:string,frame:Frame,a:number,b:number,ya:number,yb:number,brick:boolean){
  const owner=box(name,frame,a,b,-.18,.18,ya,yb,brick?0x70533f:0x806657);
  const spacing=brick?.14:.85;
  for(let y=ya+spacing;y<yb;y+=spacing)for(const n of[-.184,.184])facet('cladding-joint',frame,a,b,y,y+.008,n,brick?0xa18a70:0x4c4740,owner);
  if(brick){for(let y=ya;y<yb;y+=.28)for(let s=a+.25;s<b;s+=.55)for(const n of[-.184,.184])facet('brick-head-joint',frame,s,Math.min(s+.008,b),y,Math.min(y+.14,yb),n,0xa18a70,owner);}
  else for(let s=a+.9;s<b;s+=.9)for(const n of[-.184,.184])facet('panel-vertical-joint',frame,s,s+.008,ya,yb,n,0x4c4740,owner);
  return owner;
 }
 function floorPlate(name:string,points:XZ[],y:number,color:number){
  const ring=points.slice(0,-1).map(p=>new THREE.Vector2(...p));
  for(const ids of THREE.ShapeUtils.triangulateShape(ring,[])){const top=ids.map(i=>new THREE.Vector3(ring[i].x,y,ring[i].y));part(name,[...top,...top.map(p=>p.clone().add(new THREE.Vector3(0,-.24,0)))],color);}
 }
 for(const id of[SCIENCE22_ID,SCIENCE56_ID]){
  building=buildings.find(b=>b.id===id)!;const brick=id===SCIENCE22_ID,floors=brick?q.floors22:q.floors56,roof=brick?q.roof22:q.roof56;
  for(const [i,y]of [...floors,roof].entries())floorPlate('floor-slab-'+i,building.points,y,i===floors.length?0x718978:0xb9bcb0);
  for(let edge=0;edge<building.points.length-1;edge++){
   const a=building.points[edge],b=building.points[edge+1],frame=humanities23Frame(a,b);if(frame.length<.2)continue;
   const middle=f.local(frame.point(frame.length/2)),long=Math.abs(f.local(a).n-f.local(b).n)>5,west=!brick&&middle.s<4&&middle.n>-65&&middle.n<-3;
   for(let level=0;level<floors.length;level++){
    const y=floors[level],top=floors[level+1]??roof;
    // 56동 서쪽의 낮은 층은 사진에서 확인한 열린 필로티로 둔다.
    if(west&&level===0)continue;
    const cuts=[0,frame.length];
    for(let s=6;s<frame.length;s+=6)cuts.push(s);
    const endGlass=middle.n<-70?-32.5:-35;
    if(brick&&!long)for(const s of[endGlass-2.7,endGlass+2.7]){const u=frame.local(f.point(s,middle.n)).s;if(u>0&&u<frame.length)cuts.push(u);}
    const openings:{a:number;b:number}[]=[];
    const opening=(point:XZ,width:number)=>{const local=frame.local(point);if(Math.abs(local.n)<.5&&local.s>=-.1&&local.s<=frame.length+.1){const lo=Math.max(0,local.s-width/2),hi=Math.min(frame.length,local.s+width/2);cuts.push(lo,hi);openings.push({a:lo,b:hi});}};
    if(Math.abs(y-q.bridgeFloor)<.02)opening(brick?q.bridge.point(0):q.bridge.point(q.bridge.length),2.9);
    if(q.access)for(const d of q.access.doors.filter(d=>d.buildingId===id&&d.level===level))opening(d.point,d.width);
    else if(brick&&level===1&&middle.s>-26&&long)opening(f.point(-23.5,-41.5),2.6);
    if(!brick&&Math.abs(middle.n)<.2&&(level===1||level===2))opening(f.point(7,0),2.4);
    const sorted=[...new Set(cuts)].sort((a,b)=>a-b);
    for(let i=1;i<sorted.length;i++){
     const lo=sorted[i-1],hi=sorted[i];if(hi-lo<.03)continue;
     if(openings.some(o=>(lo+hi)/2>o.a-1e-5&&(lo+hi)/2<o.b+1e-5)){
      box('entry-header',frame,lo,hi,-.18,.18,y+2.9,top-.24,white);
      for(const s of[...(lo>.01?[lo]:[]),...(hi<frame.length-.01?[hi]:[])])box('door-jamb',frame,s-.035,s+.035,-.2,.2,y,y+2.9,0x3d5156,'metal');continue;
     }
     if(brick&&!long&&Math.abs(f.local(frame.point((lo+hi)/2)).s-endGlass)>2.71){wall('22-solid-brick-end',frame,lo,hi,y,top-.24,true);continue;}
     if(hi-lo<1){wall('narrow-wall-pier',frame,lo,hi,y,top-.24,brick);continue;}
     wall(brick?'brick-spandrel':'brown-panel-spandrel',frame,lo,hi,y,y+.9,brick);
     wall(brick?'brick-head':'brown-panel-head',frame,lo,hi,top-.56,top-.24,brick);
     glazing(brick?'22-blue-window':'56-ribbon-window',frame,lo+.16,hi-.16,0,y+.9,top-.56,brick);
     if(brick)for(const s of[lo,...(i===sorted.length-1?[hi]:[])])box('white-frame-column',frame,s-.12,s+.12,-.24,.24,y,top,white);
    }
    if(brick){const bandCuts=[0,frame.length,...openings.flatMap(o=>[o.a,o.b])].sort((a,b)=>a-b);for(let i=1;i<bandCuts.length;i++){const lo=bandCuts[i-1],hi=bandCuts[i],open=openings.some(o=>(lo+hi)/2>o.a-1e-5&&(lo+hi)/2<o.b+1e-5);if(hi-lo>.03)box('white-floor-band',frame,lo,hi,-.24,.24,y-.35,open?y:y+.16,white);}}
   }
   if(brick){
    box('deep-white-eaves',frame,-.4,frame.length+.4,-.65,.65,roof-.27,roof,white);
    box('open-roof-parapet-base',frame,0,frame.length,-.18,.18,roof,roof+.4,white);
    box('open-roof-parapet-cap',frame,0,frame.length,-.18,.18,roof+.95,roof+1.2,white);
    for(let s=.1;s<frame.length;s+=6)box('roof-parapet-post',frame,s,s+.22,-.18,.18,roof+.35,roof+1.1,white);
   }else{
    box('silver-roof-trim',frame,0,frame.length,-.22,.22,roof-.18,roof+.25,0xc1c5be);
    if(frame.length>5&&Math.hypot(a[0]-q.bridge.point(q.bridge.length)[0],a[1]-q.bridge.point(q.bridge.length)[1])>1.5){const door=q.access?.doors.find(d=>d.buildingId===id&&Math.hypot(a[0]-d.point[0],a[1]-d.point[1])<1.5);beam('rounded-corner-trim',at(frame,0,door?door.floor+3.05:floors[0]),at(frame,0,roof),.27,0xb9c0b9);}
   }
  }
  if(brick){
   const front=axis(q.access?-22.4:-22.9);glazing('22-stair-tower',front,q.access?4.6:25,q.access?8.6:29,-.32,q.floors22[1],roof-.3,true);
   const end=humanities23Frame(f.point(-42.4,-79),f.point(-22.5,-78.5));
   for(const y of q.floors22.slice(1)){
    const slab=box('22-end-balcony',end,7.2,12.6,-1.8,.3,y-.18,y,white);
    box('22-balcony-parapet',end,7.2,12.6,-1.8,-1.6,y+.05,y+.75,white,'stone',slab);
    beam('22-balcony-rail',at(end,7.2,y+1.03,-1.7),at(end,12.6,y+1.03,-1.7),.025,0x8e9d9a,slab);
   }
   beam('22-yellow-service-pipe',at(end,19.4,q.floors22[0],-.25),at(end,19.4,roof+1.3,-.25),.065,0xc3a33c);
   const board=box('22-number-board',end,16.7,18.8,-.25,-.2,roof-1.7,roof-.6,0x70533f);
   label('22-building-number','22',end,17.75,-.26,roof-1.15,1.7,1.1,board,'#70533f','#ffffff');
  }else{
   const rear=axis(5,-65,-2);
   const cuts=q.access?[0,...q.westEntries.flatMap(n=>[n+65-1.4,n+65+1.4]),63]:[0,13.6,16.4,49.6,52.4,63];
   for(let i=1;i<cuts.length;i++)if(i!==2&&i!==4)glazing('56-recessed-lobby',rear,cuts[i-1],cuts[i],0,q.floors56[0]+.1,q.floors56[1]-.3);
   for(const n of[-63,-57,-41,-26,-8]){
    const s=n<-55?.6:-1;beam('56-round-piloti-column',at(f,s,q.floors56[0],n),at(f,s,q.floors56[1],n),.5,0xd3d8cf);
   }
   const end=humanities23Frame(f.point(4.46,-72.98),f.point(19.55,-71.69));
   const board=box('56-number-board',end,1,3.6,-.25,-.2,roof-2.6,roof-1.3,0x806657);
   label('56-building-number','56',end,2.3,-.26,roof-1.95,2,1.2,board,'#806657','#f2f1e5');
  }
 }
 building=buildings.find(b=>b.id===SCIENCE56_ID)!;
 const bridge=q.bridge,bf=q.bridgeFloor;
 box('old-bridge-floor',bridge,-1.8,bridge.length+1.8,-1.25,1.25,bf-.28,bf,0xc1c4ba);
 const roof=box('old-bridge-roof',bridge,0,bridge.length,-1.45,1.45,bf+2.8,bf+3.02,0xc5c9c1);
 box('old-bridge-green-roof',bridge,0,bridge.length,-1.4,1.4,bf+3.02,bf+3.04,0x6e8b76,'metal',roof);
 for(const side of[-1.25,1.25]){
  const parapet=box('old-bridge-parapet',bridge,0,bridge.length,side-.1,side+.1,bf,bf+.7,white);
  beam('old-bridge-rail',at(bridge,0,bf+1.1,side),at(bridge,bridge.length,bf+1.1,side),.025,0x8b9894,parapet);
  for(let s=.15;s<bridge.length;s+=2){beam('old-bridge-baluster',at(bridge,s,bf+.7,side),at(bridge,s,bf+1.1,side),.018,0x899590,parapet);}
  for(const s of[6,bridge.length-6]){
   const ground=q.walk;const pier=box('old-bridge-square-pier',bridge,s-.24,s+.24,side-.24,side+.24,ground,bf+2.8,white);
   if(s===6)for(let i=0;i<12;i++){const a=6+(bridge.length-12)*i/12,b=6+(bridge.length-12)*(i+1)/12,arch=(t:number)=>bf-.35-.8*Math.pow((t-bridge.length/2)/((bridge.length-12)/2),2);beam('old-bridge-orange-arch',at(bridge,a,arch(a),side),at(bridge,b,arch(b),side),.085,0xa95432,pier);}
  }
 }
 // 현관과 연결교 안쪽은 짧은 진입 공간까지만 만든다.
 for(const [end,sign]of[[0,-1],[bridge.length,1]] as const){const back=end+sign*2;box('old-bridge-vestibule-back',bridge,back-.08,back+.08,-1.25,1.25,bf,bf+2.8,white);}
 for(const a of q.surfaces){
  if(q.access)building=buildings.find(b=>b.id===(a.name.startsWith('22-')?SCIENCE22_ID:SCIENCE56_ID))!;
  const frame=a.frame??f,corners=[frame.point(a.s0,a.n0),frame.point(a.s1,a.n0),frame.point(a.s1,a.n1),frame.point(a.s0,a.n1)];
  const top=corners.map(p=>{const l=frame.local(p);return new THREE.Vector3(p[0],physics561SurfaceHeight(a,l.s,l.n),p[1]);});
  const pieces=a.y2!==undefined?[[top[0],top[1],top[2]],[top[0],top[2],top[3]]]:[top];
  const owner=pieces.map(face=>part(a.name,[...face,...face.map(p=>new THREE.Vector3(p.x,Math.min(p.y-.28,heightAt(p.x,p.z)-.25),p.z))],a.name.includes('garden-bank')?0x6c7955:a.name.includes('road-join')?0x56645d:a.name.includes('stair')?0xaeb6ae:0x9a8a76))[0];
  pavementMasks.push({component:a.name,polygon:corners});
  if(a.name==='court-paving'){
   // 보도 줄눈과 색 무늬는 같은 메시로 묶고 충돌체를 추가하지 않는다.
   for(let n=a.n0;n<a.n1;n+=.2)for(let s=a.s0-.2*(Math.round((n-a.n0)/.2)%2);s<a.s1;s+=.4){const y=a.y0+.004,hue=(Math.round(s*5+n*5)%5+5)%5,color=[0x94725e,0x967961,0x8e7460,0x9e8069,0x887260][hue],lo=Math.max(s,a.s0),hi=Math.min(s+.39,a.s1);if(hi>lo)part('court-brick-pattern',[at(f,lo,y,n),at(f,hi,y,n),at(f,hi,y,Math.min(n+.19,a.n1)),at(f,lo,y,Math.min(n+.19,a.n1))],color,'stone',owner,true);}
   box('court-tactile-line',f,-16.23,-15.77,a.n0,a.n1,a.y0+.006,a.y0+.022,0xc8a952,'stone',owner);
   for(let n=a.n0;n<a.n1;n+=1)for(const s of[-16.15,-16,-15.85])box('tactile-rib',f,s,s+.028,n,n+.88,a.y0+.022,a.y0+.032,0xd5bb68,'stone',owner);
   for(const s of[-23,-8])box('court-curb',f,s-.12,s+.12,a.n0,a.n1,a.y0-.15,a.y0+.1,0xb2b8ab,'stone',owner);
  }
  if(a.name==='22-ramp')for(const s of[a.s0,a.s1]){
   beam('22-ramp-handrail',at(f,s,a.y0+.95,a.n0),at(f,s,a.y1+.95,a.n1),.03,0x9da9a4,owner);
   for(let n=a.n0;n<=a.n1;n+=2){const y=physics561SurfaceHeight(a,s,n);beam('22-ramp-post',at(f,s,y,n),at(f,s,y+.95,n),.025,0x9da9a4,owner);}
  }
  if(q.access&&(/22-north-(west|east|entry)-stair|56-east-.*-stair|22-west-entry-ramp|22-east-north-ramp/.test(a.name)))for(const n of[a.n0,a.n1]){
   beam('access-handrail',at(frame,a.s0,a.y0+.95,n),at(frame,a.s1,a.y1+.95,n),.025,0x65736c,owner);
   beam('access-rail-post',at(frame,a.s0,a.y0,n),at(frame,a.s0,a.y0+.95,n),.02,0x65736c,owner);
  }
 }
 building=buildings.find(b=>b.id===SCIENCE56_ID)!;
 for(const name of['56-main','56-north']){
  const steps=q.surfaces.filter(a=>a.name===name+'-stair');for(const [i,a]of steps.entries())for(const n of[a.n0,a.n1]){
   const curb=box('56-stair-edge',f,a.s0,a.s1,n-.08,n+.08,a.y0-.18,a.y0+.08,0xb2b8ab);
   beam('56-stair-handrail',at(f,a.s0,a.y0+.96,n),at(f,a.s1,(steps[i+1]?.y0??a.y0)+.96,n),.03,0xaebbb4,curb);
   if(i%4===0)beam('56-stair-post',at(f,a.s0,a.y0,n),at(f,a.s0,a.y0+.96,n),.025,0xaebbb4,curb);
  }
 }
 const retainingSegments=q.access?[[-74,q.westEntries[0]-4.15],[q.westEntries[0]+4.15,q.westEntries[1]-1.65],[q.westEntries[1]+1.65,-5]]:[[-74,-54.15],[-45.85,-15.65],[-12.35,-5]];
 for(const [n0,n1]of retainingSegments){
  const retaining=box('court-retaining-wall',f,-8.12,-7.72,n0,n1,q.walk-.2,q.walk+2.6,0x8d9587),face=axis(-8.13,n0,n1);
  for(let y=q.walk+.3;y<q.walk+2.6;y+=.4)facet('retaining-stone-joint',face,0,n1-n0,y,y+.015,.01,0x6f786b,retaining);
  box('court-low-hedge',f,-7.65,-6.5,n0,n1,q.walk+2.55,q.walk+3.1,0x62724b,'wood',retaining);
 }
 for(const n of[-69,-60,-28,-19,-8]){
  const y=q.walk,grate=box('tree-pit-grate',f,-11.8,-10.2,n-.8,n+.8,y+.003,y+.025,0x3f4941);
  for(let s=-11.7;s<-10.2;s+=.13)box('tree-grate-slot',f,s,s+.05,n-.68,n+.68,y+.025,y+.029,0x1f3028,'metal',grate);
  const trunk=beam('court-tree-trunk',at(f,-11,y,n),at(f,-11,y+4.4,n),.13,0x685548);
  for(const d of[-1,1])beam('court-tree-branch',at(f,-11,y+2.6,n),at(f,-11+d*1.1,y+4.8,n+d*.65),.055,0x685548,trunk);
  const g=new THREE.IcosahedronGeometry(1.7,0);g.scale(.8,1.15,.8);const p=g.attributes.position;part('court-tree-crown',Array.from({length:p.count},(_,i)=>new THREE.Vector3(p.getX(i),p.getY(i),p.getZ(i)).add(at(f,-11,y+4.5,n))),0x697b50,'wood',trunk);g.dispose();
 }
 if(q.access){
  const d=q.access.doors.find(d=>d.name==='56-east-south')!;
  box('56-east-entry-canopy',f,d.s-.4,d.s+2.1,d.n-2,d.n+2,d.floor+2.85,d.floor+3.02,0xbfc6bc);
  building=buildings.find(b=>b.id===SCIENCE22_ID)!;
  for(const a of q.access.northRetaining){const v:THREE.Vector3[]=[];for(const [s,top]of[[a.s0,a.top0],[a.s1,a.top1]])for(const n of[a.n-.15,a.n+.15])for(const y of[a.bottom,top])v.push(at(a.frame,s,y,n));const owner=part('22-north-entry-retaining',v,0xa9afa2);beam('retaining-top-edge',at(a.frame,a.s0,a.top0,a.n),at(a.frame,a.s1,a.top1,a.n),.06,0xc0c5b9,owner);}
 }
 const meshes=batches.map(b=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(b.colors,3));g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:b.glass?.3:.8,side:THREE.DoubleSide}));mesh.name=b.glass?'science2256-glass':'science2256-surfaces';mesh.castShadow=!b.glass;mesh.receiveShadow=true;shell.add(mesh);return mesh;});
 shell.userData.science2256Exterior={buildingIds:[SCIENCE22_ID,SCIENCE56_ID],floors22:q.floors22,floors56:q.floors56,bridgeFloor:q.bridgeFloor,bridgeWalkLevels:1,dimensionsEstimated:true,bridgeConnectionFloorsVerified:false,wholeInteriorImplemented:false,access:q.access,routes:q.routes,pavementMasks,geometry:{meshes:meshes.length+signs.length,textures:signs.length,triangles:batches.reduce((n,b)=>n+b.positions.length/9,0)+signs.length*2,colliders:breakables.length}};
 function update(_player:THREE.Vector3){batches.forEach((b,index)=>{const a=meshes[index].geometry.attributes.position as THREE.BufferAttribute,c=meshes[index].geometry.attributes.color as THREE.BufferAttribute;let moved=false,tinted=false;for(const p of b.parts){if(p.shown!==p.proxy.visible){p.shown=p.proxy.visible;moved=true;if(p.shown)(a.array as Float32Array).set(p.original,p.start);else for(let i=p.start;i<p.end;i+=3){a.array[i]=p.proxy.position.x;a.array[i+1]=p.proxy.position.y;a.array[i+2]=p.proxy.position.z;}}if(p.color!==p.proxy.material.color.getHex()){p.color=p.proxy.material.color.getHex();tinted=true;const t=p.proxy.material.color,scale=[t.r/p.base.r,t.g/p.base.g,t.b/p.base.b];for(let i=p.start;i<p.end;i++)c.array[i]=p.colors[i-p.start]*scale[(i-p.start)%3];}}if(moved)a.needsUpdate=true;if(tinted)c.needsUpdate=true;});for(const s of signs)s.mesh.visible=s.owner.visible;shell.visible=batches.some(b=>b.parts.some(p=>p.proxy.visible));}
 // 렌더 버퍼와 복원용 사본을 만든 뒤 조립용 배열을 비운다.
 for(const batch of batches){batch.positions.length=0;batch.colors.length=0;}
 return{shell,breakables,update};
}
