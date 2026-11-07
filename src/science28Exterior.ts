import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import type { CampusBuilding } from './fullCampus';
import { humanities23Frame } from './humanities23Site';
import { physics561SurfaceHeight } from './physics561Site';
import { SCIENCE28_ID, type Science28Layout } from './science28Site';
type XZ=[number,number];type Frame=ReturnType<typeof humanities23Frame>;type Proxy=THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
export function createScience28Exterior(scene:THREE.Scene,building:CampusBuilding,q:Science28Layout,heightAt:(x:number,z:number)=>number){
 const shell=new THREE.Group();shell.name='landmark/science28-exterior';Object.assign(shell.userData,{role:'building-shell',buildingId:SCIENCE28_ID,buildingIds:[SCIENCE28_ID]});scene.add(shell);
 

 let partBuilding=building.id;
 const signs:{mesh:THREE.Mesh;owner:Proxy}[]=[];
  const breakables: BreakableSpec[] = [];
  const batches = [false, true].map(glass => ({ glass, positions: [] as number[], colors: [] as number[], parts: [] as { proxy: Proxy; start: number; end: number; original: Float32Array; colors: Float32Array; base: THREE.Color; color: number; shown: boolean }[] }));
  const at = (f: Frame, s: number, y: number, n = 0) => { const p = f.point(s, n); return new THREE.Vector3(p[0], y, p[1]); };
  function part(name: string, vertices: THREE.Vector3[], color: number, material: BreakableSpec['material'] = 'stone', owner?: Proxy, flat = false) {
    if (flat && vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0])).y < -1e-8) vertices = vertices.slice().reverse();
    const bounds = new THREE.Box3().setFromPoints(vertices), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const g = flat ? new THREE.BufferGeometry() : new ConvexGeometry(vertices.map(p => p.clone().sub(center)));
    if (flat) { const values: number[] = []; for (let i = 1; i + 1 < vertices.length; i++) for (const p of [vertices[0], vertices[i], vertices[i + 1]]) values.push(...p.clone().sub(center).toArray()); g.setAttribute('position', new THREE.Float32BufferAttribute(values, 3)); }
    const attr = g.attributes.position, proxy = owner ?? new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color }));
    if (!owner) { proxy.position.copy(center); proxy.updateMatrixWorld(true); Object.assign(proxy.userData, { buildingId: partBuilding, component: name, renderProxy: true, convex: true }); breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attr.array), toughness: material === 'glass' ? 2 : 8, material, label: '28동 대형강의동' }); }
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
  function facet(name: string, f: Frame, s0: number, s1: number, y0: number, y1: number, n: number, color: number, owner: Proxy) { part(name, [at(f, s0, y0, n), at(f, s0, y1, n), at(f, s1, y1, n), at(f, s1, y0, n)], color, 'stone', owner, true); }

  function label(name:string,text:string,f:Frame,s:number,n:number,y:number,width:number,height:number,owner:Proxy,background:string,color:string){
    const canvas=document.createElement('canvas');canvas.width=text.length>4?1024:256;canvas.height=128;const ctx=canvas.getContext('2d')!;ctx.fillStyle=background;ctx.fillRect(0,0,canvas.width,128);ctx.fillStyle=color;ctx.font='bold 74px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,canvas.width/2,64,canvas.width-16);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const geometry=new THREE.PlaneGeometry(width,height);geometry.scale(-1,1,1);const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));mesh.name=name;mesh.position.copy(at(f,s,y,n));mesh.lookAt(at(f,s,y,n-1));shell.add(mesh);signs.push({mesh,owner});
  }

 const f=q.f,W=q.width,D=q.depth,white=0xd8d9d4,dark=0x263840,glass=0x436f83;
 const pavementMasks:{component:string;polygon:XZ[]}[]=[];
 function panel(name:string,e:Frame,a:number,b:number,low:number,high:number,color=white){
   const owner=box(name,e,a,b,-.16,.16,low,high,color);
   for(let y=low+.62;y<high;y+=.62)facet('white-panel-horizontal-joint',e,a,b,y,y+.014,-.165,0xb3b8b5,owner);
   for(let s=a+1.8;s<b;s+=1.8)facet('white-panel-vertical-joint',e,s,s+.012,low,high,-.167,0xb3b8b5,owner);
   return owner;
 }
 function window(e:Frame,a:number,b:number,lo:number,hi:number,name='blue-glass-window'){
   const owner=box(name,e,a,b,-.07,.07,lo,hi,glass,'glass');
   for(let s=a;s<=b;s+=1.15)box('window-mullion',e,s-.035,s+.035,-.12,.12,lo,hi,dark,'metal',owner);
   for(const y of[lo,lo+(hi-lo)*.5,hi])box('window-transom',e,a,b,-.12,.12,y-.035,y+.035,dark,'metal',owner);
   return owner;
 }
 const face=(s0:number,n0:number,s1:number,n1:number)=>humanities23Frame(f.point(s0,n0),f.point(s1,n1));
 // 전면 단차, 흰 패널과 유리벽은 2022년 준공 사진을 기준으로 근사한다.
 // 남서쪽 선큰을 지나는 바닥은 비워 두고, 지하 바닥과 계단을 따로 만든다.
 const hole={s0:W-8,s1:W-2,n0:D-10,n1:D};
 function slab(name:string,s0:number,s1:number,n0:number,n1:number,y:number,holeOpen=true){
   const ss=[s0,s1,...(holeOpen?[hole.s0,hole.s1].filter(s=>s>s0&&s<s1):[])].sort((a,b)=>a-b),nn=[n0,n1,...(holeOpen?[hole.n0,hole.n1].filter(n=>n>n0&&n<n1):[])].sort((a,b)=>a-b);
   for(let i=1;i<ss.length;i++)for(let j=1;j<nn.length;j++){
     const a=ss[i-1],b=ss[i],c=nn[j-1],d=nn[j];if(holeOpen&&(a+b)/2>hole.s0&&(a+b)/2<hole.s1&&(c+d)/2>hole.n0&&(c+d)/2<hole.n1)continue;
     for(let s=a;s<b;s+=5)box(name,f,s,Math.min(s+5,b),c,d,y-.25,y,0xb5bbb7);
   }
 }
 slab('basement-floor',0,W,0,D,q.basement,false);
 slab('ground-floor',0,W,0,D,q.floor,false);
 slab('second-floor-terrace',2.5,W,0,D,q.floors[1]);
 slab('upper-floor-2',0,W,7,D,q.floors[2],false);
 slab('upper-floor-3',0,20,7,D,q.floors[3],false);
 slab('upper-floor-3',20,W-8,10,D,q.floors[3],false);
 slab('upper-floor-3',W-8,W,7,D,q.floors[3],false);
 slab('upper-floor-4',0,W-2,10,D,q.floors[4],false);
 slab('roof-slab',0,W-2,10,D,q.roof,false);
 const north=face(0,0,W,0);
 for(const[a,b]of[[0,8],[W-3,W]])panel('ground-front-stone',north,a,b,q.floor,q.floors[1]);
 for(const[a,b]of[[8,21.6],[24.4,W-3]])window(north,a,b,q.floor+.1,q.floors[1]-.42,'ground-entry-glass');
 panel('ground-entry-header',north,21.6,24.4,q.floor+2.8,q.floors[1]);
 for(const s of[21.6,24.4])box('entry-jamb',f,s-.06,s+.06,-.16,.16,q.floor,q.floor+2.8,dark,'metal');
 box('ground-lobby-back',f,20.8,25.2,5.1,5.35,q.floor,q.floor+3,0xc8ceca);
 for(const s of[20.8,25.2])box('ground-lobby-side',f,s-.1,s+.1,.2,5.3,q.floor,q.floor+3,0xc8ceca);
 const frontCap=panel('front-terrace-edge',north,0,W,q.floors[1],q.floors[1]+.42);
 // 2층 곡면 유리 로비는 동쪽과 남쪽의 실제 사진에 맞춰 연결한다.
 const curve:XZ[]=[];curve.push([W-3,7],[13,7]);
 for(let i=1;i<=8;i++){const a=-Math.PI/2-Math.PI/2*i/8;curve.push([13+6*Math.cos(a),13+6*Math.sin(a)]);}
 curve.push([7,28]);
 for(let i=1;i<=8;i++){const a=Math.PI-Math.PI/2*i/8;curve.push([13+6*Math.cos(a),28+6*Math.sin(a)]);}
 curve.push([W-10,34]);
 for(let i=1;i<curve.length;i++){
   const[a,b]=[curve[i-1],curve[i]],e=face(a[0],a[1],b[0],b[1]);
   // 동쪽과 남쪽 출입문은 열린 문 폭을 두어 현관 안으로 들어갈 수 있다.
   const eastDoor=a[0]===7&&b[0]===7,southDoor=a[1]===34&&b[1]===34;
   if(eastDoor||southDoor){const center=eastDoor?15-13:20-a[0];
     if(center>1.5&&center<e.length-1.5){window(e,0,center-1.45,q.floors[1]+.06,q.floors[2]-.3,'curved-lobby-glass');window(e,center+1.45,e.length,q.floors[1]+.06,q.floors[2]-.3,'curved-lobby-glass');panel('upper-entry-header',e,center-1.45,center+1.45,q.floors[1]+2.8,q.floors[2]);continue;}
   }
   window(e,0,e.length,q.floors[1]+.06,q.floors[2]-.3,'curved-lobby-glass');
 }
 // 사진으로 확인하지 못한 로비 안쪽은 짧은 현관만 둔다.
 box('east-lobby-back',f,10.5,10.7,13.4,16.6,q.floors[1],q.floors[1]+3,0xc8ceca);
 for(const n of[13.4,16.6])box('east-lobby-side',f,7,10.7,n-.1,n+.1,q.floors[1],q.floors[1]+3,0xc8ceca);
 box('south-lobby-back',f,18.4,21.6,30.1,30.3,q.floors[1],q.floors[1]+3,0xc8ceca);
 for(const s of[18.4,21.6])box('south-lobby-side',f,s-.1,s+.1,30.1,34,q.floors[1],q.floors[1]+3,0xc8ceca);
 for(const [s,n]of[[1,8],[1,24],[12,37],[27,37]])beam('round-overhang-column',at(f,s,q.floors[1],n),at(f,s,q.floors[2],n),.43,white);
 beam('slanted-corner-column',at(f,1,q.floors[1],37),at(f,.3,q.floors[2],34),.48,white);
 // 3층과 4층의 깊은 전면 창, 5층의 긴 띠창과 세로 창을 구분한다.
 for(const[level,n,end]of[[2,7,W],[3,7,W],[4,10,W-2]]){
   const lo=q.floors[level],hi=q.floors[level+1]??q.roof,e=face(0,n,end,n);
   panel('upper-front-sill',e,0,level===3?20:end,lo,lo+.65);panel('upper-front-header',e,0,level===2?20:end,hi-.55,hi);
   for(let s=0;s<18;s+=1.55){panel('vertical-window-pier',e,s,Math.min(s+.58,18),lo+.65,hi-.55);window(e,s+.58,Math.min(s+1.5,18.1),lo+.65,hi-.55,'narrow-vertical-window');}
   if(level===4)window(e,18,end-2,lo+.65,hi-.55,'top-ribbon-glass');
   else {if(level===2){const recessed=face(20,n+2.9,W-8,n+2.9);window(recessed,0,recessed.length,lo+.65,q.floors[4]-.55,'recessed-front-glass');}panel('recess-side-cheek',face(20,n,20,n+2.9),0,2.9,lo,hi);panel('recess-side-cheek',face(W-8,n+2.9,W-8,n),0,2.9,lo,hi);}
   panel('upper-front-end',e,level===4?end-2:W-8,end,lo,hi);
 }
 // 측면과 뒤쪽은 로드뷰로 확인한 창 배열을 단순화한다. 정확한 창 개수는 근사다.
 for(const[level,n]of[[2,7],[3,7],[4,10]]){
   const lo=q.floors[level],hi=q.floors[level+1]??q.roof;
   for(const e of[face(0,D,0,n),face(W-(level===4?2:0),n,W-(level===4?2:0),D)]){
     panel('side-spandrel',e,0,e.length,lo,lo+.8);panel('side-header',e,0,e.length,hi-.5,hi);
     for(let s=0;s<e.length;s+=2){const end=Math.min(s+2,e.length);panel('side-window-pier',e,s,Math.min(s+.8,end),lo+.8,hi-.5);if(end>s+.84)window(e,s+.8,end,lo+.8,hi-.5,'side-vertical-glass');}
   }
 }
 const southFace=face(W,D,0,D);
 panel('south-wide-stone-wall',southFace,0,W,q.floors[2],q.floors[2]+.65);
 panel('south-wide-stone-header',southFace,0,W,q.floors[3]-.3,q.floors[4]);
 for(const[a,b]of[[0,15],[25,W]])panel('south-wide-stone-field',southFace,a,b,q.floors[2]+.65,q.floors[3]-.3);
 window(southFace,15,25,q.floors[2]+.65,q.floors[3]-.3,'south-large-window');
 panel('south-top-sill',southFace,0,W,q.floors[4],q.floors[4]+.9);
 for(let s=0;s<W-2;s+=1.65){panel('south-upper-pier',southFace,s,s+.65,q.floors[4]+.9,q.roof-.4);window(southFace,s+.65,Math.min(s+1.6,W-2),q.floors[4]+.9,q.roof-.4,'south-upper-window');}
 panel('south-top-header',southFace,0,W,q.roof-.4,q.roof);
 // 도로 아래에 묻히는 하부와 서쪽은 관찰 범위를 넘지 않도록 단순한 벽으로 둔다.
 for(const e of[face(7,D,7,0),face(W,0,W,D),face(W-8,D,0,D)])panel('lower-retaining-wall',e,0,e.length,q.basement,q.floors[1]);
 for(const e of[face(W-8,D-10,W-8,D),face(W-2,D,W-2,D-10),face(W-8,D-10,W-2,D-10)])panel('sunken-retaining-wall',e,0,e.length,q.floor,q.floors[1]+.18);
 // 옥상 태양광 설비는 항공사진에서 확인한 두 묶음으로 만든다.
 for(const[a,b,c,d]of[[2,W-5,25,D-2],[2,17,13,23]])for(let s=a;s<b;s+=2.1)for(let n=c;n<d;n+=3){
   const endS=Math.min(s+1.95,b),endN=Math.min(n+2.7,d),owner=part('roof-solar-panel',[at(f,s,q.roof+.3,n),at(f,endS,q.roof+.3,n),at(f,endS,q.roof+.62,endN),at(f,s,q.roof+.62,endN),at(f,s,q.roof+.24,n),at(f,endS,q.roof+.24,n),at(f,endS,q.roof+.56,endN),at(f,s,q.roof+.56,endN)],0x25404a,'metal');
   for(let u=s+.32;u<endS;u+=.32)beam('solar-cell-grid',at(f,u,q.roof+.31,n),at(f,u,q.roof+.63,endN),.009,0x788a87,owner);
 }
 box('roof-plant-room',f,20,28,17,24,q.roof,q.roof+2,0xa9b0ad);
 for(const[level,n,end]of[[1,0,W],[2,7,W],[4,10,W-2]]){
   const y=q.floors[level];const owner=beam('terrace-rail',at(f,.4,y+1,n+.3),at(f,end-.4,y+1,n+.3),.025,dark,level===1?frontCap:undefined);
   for(let s=.4;s<end;s+=1.1)beam('terrace-baluster',at(f,s,y+.3,n+.3),at(f,s,y+1,n+.3),.018,dark,owner);
 }
 const renderSurfaces=q.surfaces.flatMap(a=>{const axis=a.axis??'s',start=axis==='s'?a.s0:a.n0,end=axis==='s'?a.s1:a.n1,count=Math.max(1,Math.ceil((end-start)/6));if(a.y0===a.y1)return[a];return Array.from({length:count},(_,i)=>({...a,[axis+'0']:start+(end-start)*i/count,[axis+'1']:start+(end-start)*(i+1)/count,y0:a.y0+(a.y1-a.y0)*i/count,y1:a.y0+(a.y1-a.y0)*(i+1)/count}));});
 for(const a of renderSurfaces){
   const e=a.frame,corners=[e.point(a.s0,a.n0),e.point(a.s1,a.n0),e.point(a.s1,a.n1),e.point(a.s0,a.n1)],top=corners.map(p=>{const l=e.local(p);return new THREE.Vector3(p[0],physics561SurfaceHeight(a,l.s,l.n),p[1]);});
   const stair=a.name.includes('stair'),owner=part(a.name,[...top,...top.map(p=>new THREE.Vector3(p.x,a.elevated?p.y-.22:Math.min(p.y-.25,heightAt(p.x,p.z)-.22),p.z))],stair?0xc4c8c3:0xb6bcb6);
   pavementMasks.push({component:a.name,polygon:corners});
   if(!stair)for(let s=a.s0;s<a.s1;s+=.9)for(let n=a.n0;n<a.n1;n+=.6){const ss=Math.min(s+.87,a.s1),nn=Math.min(n+.58,a.n1),ps=[[s,n],[ss,n],[ss,nn],[s,nn]].map(([u,v])=>at(e,u,physics561SurfaceHeight(a,u,v)+.006,v));part('paving-block',ps,(Math.round(s*5+n*3)%3===0)?0xa6ada6:0xc5c9c0,'stone',owner,true);}
   if(stair)box('stair-nosing',e,a.s0,a.s0+.025,a.n0,a.n1,a.y0+.004,a.y0+.009,0x969e99,'stone',owner);
 }
 pavementMasks.push({component:'rebuilt-building-footprint',polygon:q.footprint});
 const courtOwner=breakables.find(b=>b.mesh.userData.component==='north-court-paving')!.mesh as Proxy;
 // 앞마당 퍼걸러, 나무 벤치와 조경 띠는 준공 사진에서 확인했다.
 const pergola=box('pergola-beam',f,W-16,W-4,-12.5,-12.3,q.court+2.5,q.court+2.7,0x9b7850,'wood');
 for(const s of[W-16,W-10,W-4])for(const n of[-12.4,-8])box('pergola-post',f,s-.07,s+.07,n-.07,n+.07,q.court,q.court+2.7,0x92704c,'wood',pergola);
 for(let s=W-16;s<W-4;s+=.32)box('pergola-roof-slat',f,s,s+.08,-12.7,-7.7,q.court+2.65,q.court+2.82,0xb18b58,'wood',pergola);
 for(const s of[W-14,W-8]){const bench=box('pergola-bench-seat',f,s-1.3,s+1.3,-11,-10.55,q.court+.44,q.court+.52,0x9b7850,'wood');for(const x of[s-1,s+1])box('bench-leg',f,x-.08,x+.08,-10.95,-10.6,q.court,q.court+.44,dark,'metal',bench);}
 for(const[a,b]of[[6,13],[W-3.5,W-2.5]])box('front-lawn-strip',f,a,b,-13,-6,q.court+.005,q.court+.04,0x758559,'wood',courtOwner);
 for(const[s,n,y]of[[23,-6,q.court],[4,D+3.8,q.surfaces.find(a=>a.name==='south-short-stair')!.y0],[4,D-1,q.floors[1]]]){
   const tactile=box('tactile-block',f,s-.7,s+.7,n-.25,n+.25,y+.012,y+.025,0xc4b46d,'stone');
   for(let u=s-.6;u<s+.7;u+=.15)for(let v=n-.2;v<n+.25;v+=.15)box('tactile-dot',f,u,u+.045,v,v+.045,y+.025,y+.034,0xd2c47d,'stone',tactile);
 }
 for(let n=5;n<29;n+=1){const a=q.surfaces.find(a=>a.name==='east-side-ramp')!,y=physics561SurfaceHeight(a,-2,n);const owner=box('roadside-drain',f,-1.87,-1.72,n,n+.95,y+.008,y+.025,0x58625b,'metal');for(let u=n;u<n+.95;u+=.13)box('drain-grate',f,-1.87,-1.72,u,u+.035,y+.026,y+.03,0x8e9790,'metal',owner);}
 for(const[s,n]of[[7,D-2],[W-1,-8]]){const y=n>0?q.floors[1]:q.court,post=beam('entry-lamp-post',at(f,s,y,n),at(f,s,y+2.8,n),.045,0x435147);box('entry-lamp-head',f,s-.3,s+.3,n-.3,n+.3,y+2.8,y+2.87,0xc8cdb8,'metal',post);}
 for(const[e,y]of[[face(W-8,D-10,W-8,D),q.floors[1]],[face(W-2,D,W-2,D-10),q.floors[1]],[face(W-8,D-10,W-2,D-10),q.floors[1]]] as [Frame,number][]){const owner=beam('sunken-guardrail',at(e,0,y+1),at(e,e.length,y+1),.03,0x88948b);for(let s=0;s<e.length;s+=.25)beam('sunken-baluster',at(e,s,y+.1),at(e,s,y+1),.016,0x88948b,owner);}
 // 남동쪽 짧은 계단 옆 낮은 식재대는 통행 폭 밖에 둔다.
 for(const[s,n]of[[.3,D+1],[1.3,D+2]]){const base=heightAt(...f.point(s,n)),owner=box('southeast-planter-curb',f,s-.65,s+.65,n-.5,n+.5,base,base+.3,white);const g=new THREE.IcosahedronGeometry(.75,1),a=g.attributes.position;part('southeast-shrubs',Array.from({length:a.count},(_,i)=>new THREE.Vector3(a.getX(i),a.getY(i)*.6,a.getZ(i)).add(at(f,s,base+.65,n))),0x62784c,'wood',owner);g.dispose();}
 const number=panel('28-number-board',face(W-3,D,W-8,D),0,5,q.floors[2]+1,q.floors[2]+2.3);
 label('28-building-number','28',face(W-3,D,W-8,D),2.5,-.18,q.floors[2]+1.65,1.6,1.1,number,'#d8d9d4','#34464a');
 const board=panel('south-entry-name-board',face(11,D-1,8,D-1),0,3,q.floors[1],q.floors[1]+1.2,0x526777);
 label('28-entry-name','자연과학대학 대형강의동',face(11,D-1,8,D-1),1.5,-.18,q.floors[1]+.65,2.8,.65,board,'#526777','#eeeeea');
 const meshes=batches.map(b=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(b.colors,3));g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:b.glass?.3:.8,side:THREE.DoubleSide}));mesh.name=b.glass?'science28-glass':'science28-surfaces';mesh.castShadow=!b.glass;mesh.receiveShadow=true;shell.add(mesh);return mesh;});
 shell.userData.science28Exterior={buildingIds:[SCIENCE28_ID],floors:q.floors,basement:q.basement,roof:q.roof,footprint:q.footprint,rawOsmFootprintPreserved:true,reconstructionYear:2022,aboveGroundFloors:5,basementFloors:1,dimensionsEstimated:true,footprintEstimated:true,entranceCoordinatesFromOsm:false,entrancePositionEstimated:true,rearFacadeEstimated:true,oldOfficialMapPhotoExcluded:true,currentRoadviewDates:["2025-07","2026-08"],wholeInteriorImplemented:false,routes:q.routes,pavementMasks,geometry:{meshes:meshes.length+signs.length,textures:signs.length,triangles:batches.reduce((n,b)=>n+b.positions.length/9,0)+signs.length*2,colliders:breakables.length}};
 function update(_player:THREE.Vector3){batches.forEach((b,index)=>{const a=meshes[index].geometry.attributes.position as THREE.BufferAttribute,c=meshes[index].geometry.attributes.color as THREE.BufferAttribute;let moved=false,tinted=false;for(const p of b.parts){if(p.shown!==p.proxy.visible){p.shown=p.proxy.visible;moved=true;if(p.shown)(a.array as Float32Array).set(p.original,p.start);else for(let i=p.start;i<p.end;i+=3){a.array[i]=p.proxy.position.x;a.array[i+1]=p.proxy.position.y;a.array[i+2]=p.proxy.position.z;}}if(p.color!==p.proxy.material.color.getHex()){p.color=p.proxy.material.color.getHex();tinted=true;const t=p.proxy.material.color,scale=[t.r/p.base.r,t.g/p.base.g,t.b/p.base.b];for(let i=p.start;i<p.end;i++)c.array[i]=p.colors[i-p.start]*scale[(i-p.start)%3];}}if(moved)a.needsUpdate=true;if(tinted)c.needsUpdate=true;});for(const s of signs)s.mesh.visible=s.owner.visible;shell.visible=batches.some(b=>b.parts.some(p=>p.proxy.visible));}
 // 렌더 버퍼와 복원용 사본을 만든 뒤 조립용 배열을 비운다.
 for(const batch of batches){batch.positions.length=0;batch.colors.length=0;}
 return{shell,breakables,update};
}
