import { pharmacy143BridgeCut, type Pharmacy143Layout } from './pharmacy143Site';
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import type { CampusBuilding } from './fullCampus';
import { humanities23Frame } from './humanities23Site';
import type { Pharmacy2021Layout } from './pharmacy2021Site';
import type { Pharmacy20Layout } from './pharmacy20Site';
type XZ=[number,number];type XYZ=[number,number,number];type Frame=ReturnType<typeof humanities23Frame>;type Proxy=THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
export function createPharmacy20Exterior(scene:THREE.Scene,building:CampusBuilding,q:Pharmacy20Layout,heightAt:(x:number,z:number)=>number,connection?:Pharmacy2021Layout,pharmacy143?:Pharmacy143Layout){
 const shell=new THREE.Group();shell.name='landmark/pharmacy20-exterior';Object.assign(shell.userData,{role:'building-shell',buildingId:building.id,mappedOutline:building.points});scene.add(shell);
 const distant=new THREE.Group();distant.name=building.id+':pharmacy20-distant';distant.visible=false;Object.assign(distant.userData,{role:'distant-building',buildingId:building.id});scene.add(distant);
 const signs:{mesh:THREE.Mesh;owner:Proxy}[]=[],floor=q.floor,roof=q.roof;
  const breakables: BreakableSpec[] = [];
  const batches = [false, true].map(glass => ({ glass, positions: [] as number[], colors: [] as number[], parts: [] as { proxy: Proxy; start: number; end: number; original: Float32Array; colors: Float32Array; base: THREE.Color; color: number; shown: boolean }[] }));
  const at = (f: Frame, s: number, y: number, n = 0) => { const p = f.point(s, n); return new THREE.Vector3(p[0], y, p[1]); };
  function part(name: string, vertices: THREE.Vector3[], color: number, material: BreakableSpec['material'] = 'stone', owner?: Proxy, flat = false) {
    const bounds = new THREE.Box3().setFromPoints(vertices), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const g = flat ? new THREE.BufferGeometry() : new ConvexGeometry(vertices.map(p => p.clone().sub(center)));
    if (flat) { const values: number[] = []; for (let i = 1; i + 1 < vertices.length; i++) for (const p of [vertices[0], vertices[i], vertices[i + 1]]) values.push(...p.clone().sub(center).toArray()); g.setAttribute('position', new THREE.Float32BufferAttribute(values, 3)); }
    const attr = g.attributes.position, proxy = owner ?? new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color }));
    if (!owner) { proxy.position.copy(center); proxy.updateMatrixWorld(true); Object.assign(proxy.userData, { buildingId: building.id, component: name, renderProxy: true, convex: true }); breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attr.array), toughness: material === 'glass' ? 2 : 8, material, label: '20동 외관' }); }
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
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=128;const ctx=canvas.getContext('2d')!;ctx.fillStyle=background;ctx.fillRect(0,0,768,128);ctx.fillStyle=color;ctx.font='bold 63px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,384,64);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const geometry=new THREE.PlaneGeometry(width,height);geometry.scale(-1,1,1);const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));mesh.name=name;mesh.position.copy(at(f,s,y,n));mesh.lookAt(at(f,s,y,n-1));shell.add(mesh);signs.push({mesh,owner});
  }



 const f=q.f,routes:Record<string,XYZ[]>={},pavementMasks:{component:string;polygon:XZ[]}[]=[];
 const xyz=(s:number,y:number,n:number):XYZ=>at(f,s,y,n).toArray() as XYZ;
 function brick(frame:Frame,owner:Proxy,a:number,b:number,lo:number,hi:number,n:number){for(let y=lo;y<hi-.01;y+=.2){facet('brick-horizontal-joint',frame,a,b,y,Math.min(y+.008,hi),n,0xa69c88,owner);for(let s=a+.3+(Math.round((y-floor)/.2)%2)*.3;s<b-.02;s+=.6)facet('brick-vertical-joint',frame,s,s+.008,y,Math.min(y+.2,hi),n-.002,0xa69c88,owner);}}
 function glazing(name:string,frame:Frame,a:number,b:number,lo:number,hi:number,n:number,project=.08){const owner=box(name,frame,a,b,n-project,n+.04,lo,hi,0x658384,'glass');for(const s of[a,b,(a+b)/2])box('window-mullion',frame,s-.025,s+.025,n-project-.04,n+.06,lo,hi,0x65716c,'metal',owner);for(const y of[lo,hi,(lo+hi)/2])box('window-transom',frame,a,b,n-project-.04,n+.06,y-.03,y+.03,0x89958b,'metal',owner);return owner;}
 function slab(name:string,frame:Frame,a:number,b:number,n0:number,n1:number,y0:number,y1:number,color=0xbabdb3){const top=[at(frame,a,y0,n0),at(frame,b,y0,n0),at(frame,b,y1,n1),at(frame,a,y1,n1)];return part(name,[...top,...top.map(p=>p.clone().add(new THREE.Vector3(0,-.2,0)))],color);}
 function sidewalk(a:number,b:number){const y0=q.walkHeight(a),y1=q.walkHeight(b),top=[at(f,a,y0,-.6),at(f,b,y1,-.6),at(f,b,y1,1.2),at(f,a,y0,1.2)],owner=part('northwest-sidewalk',[...top,...top.map(p=>p.clone().add(new THREE.Vector3(0,-.2,0)))],0xb0b6ae);
  for(let s=a;s<b;s+=.4){const end=Math.min(s+.008,b),h=q.walkHeight(s)+.003,h1=q.walkHeight(end)+.003;part('sidewalk-cross-joint',[at(f,s,h,-.6),at(f,end,h1,-.6),at(f,end,h1,1.2),at(f,s,h,1.2)],0x737e75,'stone',owner,true);}
  for(let n=-.6;n<1.2;n+=.4){const h0=y0+.003,h1=y1+.003;part('sidewalk-long-joint',[at(f,a,h0,n),at(f,b,h1,n),at(f,b,h1,n+.008),at(f,a,h0,n+.008)],0x737e75,'stone',owner,true);}
  const curbTop=[at(f,a,y0-.02,-.75),at(f,b,y1-.02,-.75),at(f,b,y1-.02,-.6),at(f,a,y0-.02,-.6)];part('sidewalk-curb',[...curbTop,...curbTop.map(p=>p.clone().add(new THREE.Vector3(0,-.18,0)))],0x959e93);
  const drainTop=[at(f,a,y0-.06,-.88),at(f,b,y1-.06,-.88),at(f,b,y1-.06,-.77),at(f,a,y0-.06,-.77)];part('sidewalk-drain',drainTop,0x4c6056,'metal',owner,true);return owner;
 }
 for(let i=1;i<q.profile.length;i++)sidewalk(q.profile[i-1].s,q.profile[i].s);
 pavementMasks.push({component:'northwest-sidewalk',polygon:[f.point(0,-.9),f.point(f.length,-.9),f.point(f.length,1.3),f.point(0,1.3)]});

 // 현관 주변의 후퇴한 공간을 보도와 잇는다. 높이는 기존 통행 바닥에 맞춘 근사다.
 for(const[a,b]of[[18,26],[44,46.2],[49.8,67]])for(let u=a;u<b;u+=2){const v=Math.min(u+2,b),top=[at(f,u,q.walkHeight(u),1.2),at(f,v,q.walkHeight(v),1.2),at(f,v,floor,6.5),at(f,u,floor,6.5)],owner=part('covered-forecourt',[...top,...top.map(p=>p.clone().add(new THREE.Vector3(0,-.2,0)))],0xb0b6ae);for(let n=1.2;n<6.5;n+=.4){const t=(n-1.2)/5.3,ta=(n+.008-1.2)/5.3;part('forecourt-paving-joint',[at(f,u,q.walkHeight(u)*(1-t)+floor*t+.003,n),at(f,v,q.walkHeight(v)*(1-t)+floor*t+.003,n),at(f,v,q.walkHeight(v)*(1-ta)+floor*ta+.003,n+.008),at(f,u,q.walkHeight(u)*(1-ta)+floor*ta+.003,n+.008)],0x738372,'stone',owner,true);}}
 // 앞면의 위층은 세로 벽돌 띠와 돌출 창을 배치한다.
 const count=26;
 for(let level=2;level<5;level++)for(let i=0;i<count;i++){const a=f.length*i/count,b=f.length*(i+1)/count,y=floor+level*3.5,owner=box('northwest-brick-bay',f,a,b,3.0,3.4,y,y+3.5,0x725640);brick(f,owner,a,b,y,y+3.5,2.994);
  if(i===13){facet('central-dark-slot',f,a,b,y,y+3.5,2.99,0x303c3a,owner);continue;}
  const projecting=(i%4===(level-2)%3)||i===0||i===25,wide=i===0||i===25||projecting,wa=a+(wide?.2:.38)*(b-a),wb=b-.15*(b-a),lo=y+.32,hi=y+3.03;
  const win=box(projecting?'projecting-window':'vertical-window',f,wa,wb,projecting?2.0:2.93,3.0,lo,hi,0x637f85,'glass');for(const s of[wa,wb,(wa+wb)/2])box('upper-window-mullion',f,s-.028,s+.028,projecting?1.96:2.89,3.01,lo,hi,0x51645e,'metal',win);box('upper-window-transom',f,wa,wb,projecting?1.96:2.89,3.01,lo+1.3,lo+1.36,0x819086,'metal',win);
  box('gray-spandrel',f,wa,wb,2.92,2.99,hi,y+3.45,0x9ca69f,'metal',owner);if(projecting)for(const h of[lo-.12,hi])box('projected-silver-cap',f,wa-.08,wb+.08,1.86,3.03,h,h+.12,0xb7c4bd,'metal',win);
 }
 const lowCuts=[0,18,20.3,23.7,26,44.5,46.4,49.6,52,58.3,61.7,66,91,f.length];
 for(let level=0;level<2;level++)for(let i=1;i<lowCuts.length;i++){const a=lowCuts[i-1],b=lowCuts[i],mid=(a+b)/2,y=floor+level*3.5,door=q.entries.find(e=>Math.abs(e.s-mid)<1.7&&e.floor===y);
  if(door){box('entry-lintel',f,a,b,6.35,6.65,y+2.8,y+3.5,0x475a52);continue;}
  const pane=glazing('lower-curtain-glass',f,a,b,y+.05,y+3.43,6.5);for(let s=a+1.5;s<b;s+=1.5)box('lower-curtain-mullion',f,s-.025,s+.025,6.36,6.62,y,y+3.5,0x4c6256,'metal',pane);
 }
 // 남동쪽의 가로 띠와 북동쪽 끝벽을 각각 로드뷰에 맞춘다.
 const frames=q.renderRing.map((p,i)=>humanities23Frame(p,q.renderRing[(i+1)%q.renderRing.length]));
 for(const[edge,frame]of frames.entries()){
  if([9,10].includes(edge))continue;
  const southeast=[3,4,5,6].includes(edge),endNE=[7,8].includes(edge),divisions=Math.max(1,Math.ceil(frame.length/5));
  const bridgeS=edge===7?frame.local(q.bridge.door20.point(q.bridge.s20)).s:edge===1&&connection?frame.local(connection.door20.point(connection.s20)).s:undefined;
  const bridge143=pharmacy143?pharmacy143BridgeCut(pharmacy143,frame):undefined;
  const baseCuts=[...Array.from({length:divisions+1},(_,i)=>frame.length*i/divisions),...(bridgeS!==undefined?[bridgeS-1.4,bridgeS+1.4]:[])].filter(s=>s>=0&&s<=frame.length).sort((a,b)=>a-b);
  for(let level=0;level<5;level++){const cuts=[...baseCuts,...(bridge143&&level===3?[bridge143.a,bridge143.b]:[])].sort((a,b)=>a-b);for(let i=1;i<cuts.length;i++){const a=cuts[i-1],b=cuts[i],mid=(a+b)/2,y=floor+level*3.5,lo=level===0?Math.min(floor-.4,heightAt(...frame.point(mid))-.5):y,open=level===0&&bridgeS!==undefined&&Math.abs(mid-bridgeS)<1.4;
   if(b-a<.02)continue;
   if(bridge143&&level===3&&mid>bridge143.a-.01&&mid<bridge143.b+.01){box('bridge143-door-lintel',frame,a,b,-.32,.32,bridge143.top,y+3.5,0x76583f);continue;}
   if(open){if(lo<floor-.2)box('bridge-door-foundation',frame,a,b,-.32,.32,lo,floor-.2,0x72786b);box('bridge-door-lintel',frame,a,b,-.32,.32,floor+2.8,y+3.5,0x76583f);continue;}
   if(southeast&&level>0){const owner=box('southeast-brick-band',frame,a,b,-.32,.32,y,y+1.05,0x9a7a50);brick(frame,owner,a,b,y,y+1.05,-.326);box('silver-horizontal-band',frame,a,b,-.36,.7,y+1.05,y+1.18,0xbfc6b9,'metal',owner);glazing('southeast-recessed-window',frame,a+.08,b-.08,y+1.2,y+3.2,.65);box('southeast-canopy',frame,a,b,-1.0,.8,y+3.2,y+3.38,0xc2c8bc);for(const s of(i===cuts.length-1?[a,b]:[a]))box('southeast-recess-pier',frame,s-.08,s+.08,-.3,.72,y+1.1,y+3.25,0xabb4a6);continue;}
   const owner=box(endNE?'northeast-brick-wall':'estimated-end-wall',frame,a,b,-.32,.32,lo,y+3.5,level===0?0x6b7569:0x896a4b);if(level>0)brick(frame,owner,a,b,lo,y+3.5,-.326);
   if((southeast||edge===8||!endNE)&&b-a>1.2){const win=box('end-window',frame,a+.25,b-.25,-.39,-.335,y+.45,y+3.05,0x59796e,'glass');for(const s of[a+.25,b-.25])box('end-window-frame',frame,s-.03,s+.03,-.45,-.33,y+.45,y+3.05,0x7d9285,'metal',win);}
  }
 }}
 for(const t of THREE.ShapeUtils.triangulateShape(q.renderRing.map(p=>new THREE.Vector2(...p)),[])){const top=t.map(i=>new THREE.Vector3(q.renderRing[i][0],roof,q.renderRing[i][1]));part('roof-deck',[...top,...top.map(p=>p.clone().add(new THREE.Vector3(0,-.25,0)))],0xa2aaa0);}
 const roofEdge=box('roof-edge',f,0,f.length,2.8,3.5,roof-.1,roof+.2,0xcbd2c6);
 for(let s=2;s<f.length-2;s+=5.5){const owner=box('roof-equipment',f,s,s+1.4,4.0,4.8,roof,roof+1.25,0xd5dfd1,'metal');facet('roof-equipment-grille',f,s+.12,s+1.28,roof+.17,roof+1.1,3.99,0x5c7268,owner);}
 for(let s=6;s<f.length-4;s+=6){const owner=slab('inclined-roof-panel',f,s,s+5.6,9,15,roof+2.0,roof+3.0,0x899b94);for(const u of[s,s+5.6])beam('roof-panel-support',at(f,u,roof,10),at(f,u,roof+2.2,10),.055,0xc0cabe,owner);}
 for(let s=0;s<f.length;s+=3)beam('roof-railing-post',at(f,s,roof,3.3),at(f,s,roof+.9,3.3),.03,0xb7c4b8,roofEdge);beam('roof-railing',at(f,0,roof+.9,3.3),at(f,f.length,roof+.9,3.3),.03,0xb7c4b8,roofEdge);

 // 낮은 곡면 외벽은 짧은 평면 조각으로, 상부 금속 덮개는 경사면으로 표현한다.
 for(let a=0;a<18;a+=2){const b=Math.min(a+2,18),n0=1+2.2*Math.max(0,1-a/5),n1=1+2.2*Math.max(0,1-b/5),frame=humanities23Frame(f.point(a,n0),f.point(b,n1)),base=Math.min(floor-1,heightAt(...frame.point(frame.length/2))-.4),owner=box('dark-curved-plinth',frame,0,frame.length,-.12,.12,base,floor+2.25,0x48544c);
  for(let y=base;y<floor+2.25;y+=.6)facet('plinth-panel-joint',frame,0,frame.length,y,y+.012,-.126,0x283a30,owner);
  const cap=slab('sloping-plinth-cap',frame,0,frame.length,-.13,1.0,floor+2.25,floor+2.8,0x8c9d90);for(let u=0;u<frame.length;u+=.6)beam('plinth-cap-seam',at(frame,u,floor+2.26,-.13),at(frame,u,floor+2.81,1),.015,0x3a5145,cap);
  if(a<12)facet('plinth-slot-window',frame,.05,frame.length-.05,floor+.62,floor+.95,-.132,0x283f32,owner);
 }
 for(const[a,b]of[[26,44],[67,91]])for(let u=a;u<b;u+=3){const end=Math.min(u+3,b),owner=box('stone-podium-panel',f,u,end,.9,1.2,floor-.8,q.terrace-.18,0xa8afa4);
  for(let y=floor-.8;y<q.terrace-.18;y+=.55)facet('podium-horizontal-joint',f,u,end,y,y+.01,.894,0x657363,owner);
  const c=(u+end)/2;facet('podium-slit-window',f,c-.25,c+.25,floor+.1,q.terrace-.65,.888,0x3e5a4a,owner);for(const h of[q.terrace-.55,q.terrace-.35])facet('podium-vent',f,c-.24,c+.24,h,h+.08,.886,0x344a3a,owner);
 }
 for(const[a,b,n0,n1]of[[26,46.2,1,6.5],[49.8,91,1,6.5],[46.2,49.8,5.5,6.5]])box('terrace-floor',f,a,b,n0,n1,q.terrace-.2,q.terrace,0xb2baad);
 for(const[a,b]of[[26,44],[52,91]]){const planter=box('terrace-planter',f,a,b,1.15,1.85,q.terrace,q.terrace+.35,0xb2b8a7);box('terrace-shrubs',f,a+.1,b-.1,1.25,1.75,q.terrace+.34,q.terrace+.65,0x71864e,'wood',planter);for(let u=a;u<=b;u+=2){beam('terrace-railing-post',at(f,u,q.terrace,1.95),at(f,u,q.terrace+1.05,1.95),.025,0xaab9a6,planter);}beam('terrace-handrail',at(f,a,q.terrace+1.05,1.95),at(f,b,q.terrace+1.05,1.95),.03,0xb9c5b2,planter);}
 const canopy=box('terrace-canopy-edge',f,28,89,1.0,1.16,q.terrace+2.8,q.terrace+3.0,0xc4cec0,'metal');
 for(let u=28;u<=89;u+=7.5){beam('terrace-canopy-post',at(f,u,q.terrace,1.08),at(f,u,q.terrace+2.9,1.08),.075,0xc5cfc1,canopy);box('terrace-canopy-support',f,u-.055,u+.055,1.0,6.65,q.terrace+2.8,q.terrace+2.91,0x9bad9b,'metal',canopy);}
 for(let n=1.2;n<6.6;n+=.35)box('terrace-canopy-slat',f,28,89,n,n+.05,q.terrace+2.83,q.terrace+2.89,0xa9b9a8,'metal',canopy);
 for(const u of[44.1,53,67])beam('ground-white-column',at(f,u,floor,1.1),at(f,u,q.terrace-.1,1.1),.22,0xd4dacb);
 const st=q.stair,steps=21,stairRoute:XYZ[]=[xyz(48,q.walkHeight(48),.3)];
 slab('stair-bottom-approach',f,st.s0,st.s1,.3,st.n0,q.walkHeight(48),floor);
 for(let i=0;i<steps;i++){const a=st.n0+(st.n1-st.n0)*i/steps,b=st.n0+(st.n1-st.n0)*(i+1)/steps,y=floor+(q.terrace-floor)*(i+1)/steps,owner=box('central-stair-tread',f,st.s0,st.s1,a,b,y-.3,y,0x929e8f);box('stair-nosing',f,st.s0,st.s1,a,a+.04,y,y+.005,0xc7ceba,'stone',owner);stairRoute.push(xyz(48,y,(a+b)/2));}
 stairRoute.push(xyz(48,q.terrace,6.0));routes.centralStair=stairRoute;
 for(const u of[st.s0,st.s1]){const rail=beam('central-stair-handrail',at(f,u,floor+.95,st.n0),at(f,u,q.terrace+.95,st.n1),.04,0xa7b7a0);for(let n=st.n0;n<=st.n1;n+=.8){const y=floor+(q.terrace-floor)*(n-st.n0)/(st.n1-st.n0);beam('central-stair-baluster',at(f,u,y,n),at(f,u,y+.95,n),.025,0xb5c0a8,rail);}}
 function tactile(s0:number,s1:number,n0:number,n1:number,y:number){const owner=box('tactile-paving',f,s0,s1,n0,n1,y,y+.008,0xc2a743);for(let u=s0+.08;u<s1;u+=.16)for(let n=n0+.08;n<n1;n+=.16)box('tactile-stud',f,u-.025,u+.025,n-.025,n+.025,y+.008,y+.025,0xcdb657,'stone',owner);}
 tactile(st.s0,st.s1,.35,.75,q.walkHeight(48)+.008);
 for(const e of q.entries){const a=e.s-1.6,b=e.s+1.6,y=e.floor;
  if(e.id!=='terrace'){slab('entry-approach',f,a,b,1.2,6.5,q.walkHeight(e.s),y);pavementMasks.push({component:'entry-approach',polygon:[f.point(a,1.2),f.point(b,1.2),f.point(b,10),f.point(a,10)]});tactile(e.s-.65,e.s+.65,5.9,6.4,y+.008);}
  const landing=box('entry-vestibule-floor',f,a,b,6.45,10,y-.2,y,0xb6bdaf);
  for(const u of[a,b]){const jamb=box('entry-door-jamb',f,u-.05,u+.05,6.35,6.65,y,y+2.8,0x667f6c,'metal');box('open-entry-leaf',f,u-.03,u+.03,6.65,7.9,y+.05,y+2.68,0x648974,'glass',jamb);box('entry-vestibule-side',f,u-.08,u+.08,6.65,10,y,y+2.85,0xb0bca8);}
  box('entry-door-header',f,a,b,6.35,6.65,y+2.7,y+2.82,0x6d856f,'metal');box('entry-vestibule-back',f,a,b,9.95,10.1,y,y+2.85,0xa5b39e);box('entry-vestibule-ceiling',f,a,b,6.65,10,y+2.85,y+2.98,0xc0cbb6);
  for(let u=a;u<b;u+=.6)box('vestibule-paving-joint',f,u,u+.008,6.5,10,y,y+.002,0x7f8b78,'stone',landing);
  routes[e.id]=(e.id==='terrace'?[xyz(e.s,y,5.8),xyz(e.s,y,8.8)]:[xyz(e.s,q.walkHeight(e.s),.3),xyz(e.s,q.walkHeight(e.s),1.2),xyz(e.s,y,6.5),xyz(e.s,y,8.8)]);
 }
 routes.sidewalk=q.profile.map(p=>xyz(p.s,p.y,.3));
 routes.stairToTerrace=[...routes.centralStair,xyz(42,q.terrace,6),xyz(42,q.terrace,3.0),xyz(28,q.terrace,3.0)];
 const sign=box('college-sign-board',f,54,66,.82,1.03,q.terrace-.85,q.terrace-.15,0xaab5a1);label('college-pharmacy-label','College of Pharmacy',f,60,.80,q.terrace-.5,11.6,.6,sign,'#aab5a1','#244e75');
 const ne=frames[7],num=box('building-number-board',ne,2,6,-.37,-.33,roof-3,roof-1.5,0x896a4b);label('pharmacy20-number','20',ne,4,-.39,roof-2.25,3,1.25,num,'#896a4b','#f0f1dc');
 const info=box('wayfinding-board',f,63,64.8,2.9,3.02,floor+.5,floor+1.5,0x37556c,'metal');label('pharmacy20-wayfinding','20 약학관3',f,63.9,2.88,floor+1,1.7,.65,info,'#37556c','#ffffff');
 const meshes=batches.map(b=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(b.colors,3));g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:b.glass?.25:.76,side:THREE.DoubleSide}));mesh.name=b.glass?'pharmacy20-glass':'pharmacy20-surfaces';mesh.castShadow=!b.glass;mesh.receiveShadow=true;shell.add(mesh);return mesh;});
 shell.userData.pharmacy20Exterior={buildingId:building.id,floor,roof,terrace:q.terrace,levels:5,levelsEstimated:true,dimensionsEstimated:true,wholeInteriorImplemented:false,rawOutlinePreserved:true,renderedOutline:q.renderRing,northwestUpperInset:3.2,northwestGlassInset:6.5,routes,pavementMasks,entries:q.entries,observedFaces:['northwest','southeast','northeast'],southwestConnectionModeled:false,roadviewMonth:'2026-07',geometry:{meshes:meshes.length+signs.length,textures:signs.length,triangles:batches.reduce((n,b)=>n+b.positions.length/9,0)+signs.length*2,colliders:breakables.length}};
  function update(_player:THREE.Vector3){batches.forEach((b,index)=>{const a=meshes[index].geometry.attributes.position as THREE.BufferAttribute,c=meshes[index].geometry.attributes.color as THREE.BufferAttribute;let moved=false,tinted=false;
    for(const p of b.parts){if(p.shown!==p.proxy.visible){p.shown=p.proxy.visible;moved=true;if(p.shown)(a.array as Float32Array).set(p.original,p.start);else for(let i=p.start;i<p.end;i+=3){a.array[i]=p.proxy.position.x;a.array[i+1]=p.proxy.position.y;a.array[i+2]=p.proxy.position.z;}}if(p.color!==p.proxy.material.color.getHex()){p.color=p.proxy.material.color.getHex();tinted=true;const t=p.proxy.material.color,scale=[t.r/p.base.r,t.g/p.base.g,t.b/p.base.b];for(let i=p.start;i<p.end;i++)c.array[i]=p.colors[i-p.start]*scale[(i-p.start)%3];}}
    if(moved)a.needsUpdate=true;if(tinted)c.needsUpdate=true;
  });for(const s of signs)s.mesh.visible=s.owner.visible;shell.visible=batches.some(b=>b.parts.some(p=>p.proxy.visible));}
  return{shell,breakables,update};
}
