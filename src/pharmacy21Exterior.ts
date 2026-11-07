import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import type { CampusBuilding } from './fullCampus';
import { humanities23Frame } from './humanities23Site';
import type { Pharmacy21Layout } from './pharmacy21Site';
type XZ=[number,number];type XYZ=[number,number,number];type Frame=ReturnType<typeof humanities23Frame>;type Proxy=THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
export function createPharmacy21Exterior(scene:THREE.Scene,building:CampusBuilding,q:Pharmacy21Layout,heightAt:(x:number,z:number)=>number){
 const shell=new THREE.Group();shell.name='landmark/pharmacy21-exterior';Object.assign(shell.userData,{role:'building-shell',buildingId:building.id,mappedOutline:building.points});scene.add(shell);
 const distant=new THREE.Group();distant.name=building.id+':pharmacy21-distant';distant.visible=false;Object.assign(distant.userData,{role:'distant-building',buildingId:building.id});scene.add(distant);
 const signs:{mesh:THREE.Mesh;owner:Proxy}[]=[],floor=q.floor,roof=q.roof;
  const breakables: BreakableSpec[] = [];
  const batches = [false, true].map(glass => ({ glass, positions: [] as number[], colors: [] as number[], parts: [] as { proxy: Proxy; start: number; end: number; original: Float32Array; colors: Float32Array; base: THREE.Color; color: number; shown: boolean }[] }));
  const at = (f: Frame, s: number, y: number, n = 0) => { const p = f.point(s, n); return new THREE.Vector3(p[0], y, p[1]); };
  function part(name: string, vertices: THREE.Vector3[], color: number, material: BreakableSpec['material'] = 'stone', owner?: Proxy, flat = false) {
    const bounds = new THREE.Box3().setFromPoints(vertices), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const g = flat ? new THREE.BufferGeometry() : new ConvexGeometry(vertices.map(p => p.clone().sub(center)));
    if (flat) { const values: number[] = []; for (let i = 1; i + 1 < vertices.length; i++) for (const p of [vertices[0], vertices[i], vertices[i + 1]]) values.push(...p.clone().sub(center).toArray()); g.setAttribute('position', new THREE.Float32BufferAttribute(values, 3)); }
    const attr = g.attributes.position, proxy = owner ?? new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color }));
    if (!owner) { proxy.position.copy(center); proxy.updateMatrixWorld(true); Object.assign(proxy.userData, { buildingId: building.id, component: name, renderProxy: true, convex: true }); breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attr.array), toughness: material === 'glass' ? 2 : 8, material, label: '21동 외관' }); }
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
 function surface(name:string,a:number,b:number,n0:number,n1:number,y0:number,y1:number,color:number){const top=[at(f,a,y0,n0),at(f,b,y1,n0),at(f,b,y1,n1),at(f,a,y0,n1)];return part(name,[...top,...top.map(p=>p.clone().add(new THREE.Vector3(0,-.22,0)))],color);}
 function pane(name:string,frame:Frame,a:number,b:number,y0:number,y1:number,n:number){const win=box(name,frame,a,b,n-.045,n+.045,y0,y1,0x627d80,'glass');for(const s of[a,b,(a+b)/2])box('window-mullion',frame,s-.025,s+.025,n-.08,n+.08,y0,y1,0x414e4b,'metal',win);box('window-transom',frame,a,b,n-.08,n+.08,y0+(y1-y0)*.42,y0+(y1-y0)*.42+.05,0x56665e,'metal',win);return win;}
 function joints(frame:Frame,owner:Proxy,a:number,b:number,lo:number,hi:number,n:number,brick=false){const dy=brick?.22:.75,dx=brick?.56:.6,color=brick?0xa49b8b:0x747d77;for(let y=lo;y<hi-.02;y+=dy){facet('wall-horizontal-joint',frame,a,b,y,Math.min(y+.009,hi),n,color,owner);for(let s=a+dx+(brick?Math.round(y/dy)%2*dx/2:0);s<b;s+=dx)facet('wall-vertical-joint',frame,s,Math.min(s+.009,b),y,Math.min(y+dy,hi),n-.001,color,owner);}}
 // 보도 무늬는 한 구간의 충돌체에 묶고 줄눈과 짙은 블록은 표면으로만 그린다.
 for(let i=1;i<q.profile.length;i++){const a=q.profile[i-1],b=q.profile[i],owner=surface('front-sidewalk',a.s,b.s,-2.9,-.65,a.y,b.y,0xb4b2a8);
  const top=(s:number,n:number)=>at(f,s,a.y+(b.y-a.y)*(s-a.s)/(b.s-a.s)+.004,n);
  for(let s=Math.ceil(a.s/.4)*.4;s<b.s;s+=.4){part('paving-cross-joint',[top(s,-2.9),top(Math.min(s+.009,b.s),-2.9),top(Math.min(s+.009,b.s),-.65),top(s,-.65)],0x7e8178,'stone',owner,true);for(let n=-2.85;n<-.7;n+=.4)if((Math.round(s/.4)+Math.round((n+2.85)/.4)*3)%11===0){const end=Math.min(s+.38,b.s);if(end>s)part('dark-paving-block',[top(s+.01,n),top(end,n),top(end,n+.38),top(s+.01,n+.38)],0x686f69,'stone',owner,true);}}
  for(let n=-2.9;n<-.65;n+=.4)part('paving-long-joint',[top(a.s,n),top(b.s,n),top(b.s,n+.009),top(a.s,n+.009)],0x7e8178,'stone',owner,true);
  surface('front-curb',a.s,b.s,-3.08,-2.9,a.y-.015,b.y-.015,0x9ea9a3);
  const drain=surface('front-drain',a.s,b.s,-3.42,-3.1,a.y-.1,b.y-.1,0x455852);
  for(let s=a.s;s<b.s;s+=.18){const end=Math.min(s+.025,b.s),h=q.walkHeight(s)-.093;part('drain-grid',[at(f,s,h,-3.42),at(f,end,h,-3.42),at(f,end,h,-3.1),at(f,s,h,-3.1)],0x9aaba1,'metal',drain,true);}
 }
 pavementMasks.push({component:'front-sidewalk',polygon:[f.point(0,-3.45),f.point(f.length,-3.45),f.point(f.length,-.6),f.point(0,-.6)]});
 routes.sidewalk=q.profile.map(p=>xyz(p.s,p.y,-2));
 // 북서면의 낮은 석재와 긴 유리 띠, 흰 창 상자는 2026년 로드뷰를 따른다.
 const divisions=26,bay=f.length/divisions,stairs=[17.5,67.5];
 for(let i=0;i<divisions;i++){const a=i*bay,b=(i+1)*bay,mid=(a+b)/2;
  const stair=stairs.some(s=>Math.abs(s-mid)<2.1),base=Math.min(floor-.4,q.walkHeight(mid)-.4);
  for(const[lo,hi]of[[a,Math.min(b,q.entryS-3.3)],[Math.max(a,q.entryS+3.3),b]])if(hi>lo+.01){const wall=box('gray-stone-plinth',f,lo,hi,-.12,.22,base,floor+3.5,0xa6aba8);joints(f,wall,lo,hi,base,floor+3.5,-.127);for(let s=lo+.65;s<hi-.35;s+=1.45)pane('narrow-plinth-window',f,s-.28,s+.28,Math.max(base+.4,floor+.8),floor+2.65,-.17);}
  if(stair){const owner=pane('stair-tower-glass',f,a,b,floor+3.5,roof-.2,-.1);for(let level=0;level<4;level++){const y=floor+level*3.5;const points=[at(f,a,y+.3,-.21),at(f,b,y+2.8,-.21),at(f,b,y+3.45,-.21),at(f,a,y+.95,-.21)];part('diagonal-stair-band',points,0xd7dcd7,'stone',owner,true);}continue;}
  pane('first-floor-glass-band',f,a+.03,b-.03,floor+3.52,floor+6.88,-.16);
  for(let level=2;level<4;level++){const y=floor+level*3.5,wall=box('upper-brick-bay',f,a,b,-.12,.22,y,y+3.5,0x655346);joints(f,wall,a,b,y,y+3.5,-.127,true);
   const wa=a+.3,wb=b-.3,lo=y+.28,hi=y+3.08,project=(i+level)%3!==1;
   const win=pane(project?'white-box-window':'recessed-upper-window',f,wa,wb,lo,hi,project?-.3:-.17);
   if(project){for(const s of[wa-.1,wb])box('white-window-box-side',f,s,s+.1,-1.05,-.2,lo-.1,hi+.1,0xd5dbd8,'metal',win);for(const h of[lo-.1,hi])box('white-window-box-cap',f,wa-.1,wb+.1,-1.05,-.2,h,h+.1,0xd5dbd8,'metal',win);box('window-box-front-glass',f,wa,wb,-1.03,-.99,lo+.12,lo+1.12,0x91abad,'glass',win);box('window-box-front-rail',f,wa,wb,-1.07,-.97,lo+1.12,lo+1.17,0xc5d0cc,'metal',win);}
  }
 }
 // 나머지 면은 지도 윤곽에 맞춘 간략한 외벽이다. 뒤편의 개별 창 배치는 미확인이다.
 const ring=building.points.slice(0,-1).map(p=>[...p] as XZ),conn=q.connection;
 ring[0]=f.point(f.length);ring[6]=f.point(0);
 for(let edge=0;edge<ring.length-1;edge++){const frame=humanities23Frame(ring[edge],ring[edge+1]);const opening=edge===4?{s:frame.local(conn.door21.point(conn.s21)).s,y0:conn.floor-.2,y1:conn.floor+2.8}:undefined;
  const cuts=[0,frame.length,...(opening?[opening.s-1.25,opening.s+1.25]:[])].filter(s=>s>=0&&s<=frame.length).sort((a,b)=>a-b);
  for(let i=1;i<cuts.length;i++){const a=cuts[i-1],b=cuts[i],mid=(a+b)/2,lo=Math.min(floor-.5,heightAt(...frame.point(mid))-.4),isDoor=opening&&Math.abs(mid-opening.s)<1.25;
   if(isDoor){box('connection-door-foundation',frame,a,b,-.18,.18,lo,opening.y0,0x939a92);box('connection-door-lintel',frame,a,b,-.18,.18,opening.y1,roof,0x806c57);}else{const owner=box('unverified-side-wall',frame,a,b,-.18,.18,lo,roof,0x8b7961);for(let level=1;level<4;level++)facet('estimated-side-band',frame,a,b,floor+level*3.5,floor+level*3.5+.12,-.185,0xb1b7ad,owner);}
  }
 }
 for(const t of THREE.ShapeUtils.triangulateShape(ring.map(p=>new THREE.Vector2(...p)),[])){const top=t.map(i=>new THREE.Vector3(ring[i][0],roof,ring[i][1]));part('estimated-flat-roof',[...top,...top.map(p=>p.clone().add(new THREE.Vector3(0,-.22,0)))],0xa2aaa0);}
 box('front-roof-fascia',f,0,f.length,-.5,.4,roof-.15,roof+.15,0xc4ccc5);
 // 주현관의 세 단 계단, 점자블록과 열린 문은 같은 바닥 높이를 공유한다.
 const e=q.entryS,st=q.stair,ground=q.entryGround,entryRoute:XYZ[]=[xyz(e,ground,-2.25)];
 for(let i=0;i<st.steps;i++){const a=st.n0+(st.n1-st.n0)*i/st.steps,b=st.n0+(st.n1-st.n0)*(i+1)/st.steps,y=ground+(floor-ground)*(i+1)/st.steps,owner=box('entry-stair-tread',f,e-st.width/2,e+st.width/2,a,b,y-.25,y,0x969f97);box('entry-stair-nosing',f,e-st.width/2,e+st.width/2,a,a+.04,y,y+.004,0xc5cec3,'stone',owner);entryRoute.push(xyz(e,y,(a+b)/2));}
 box('entry-landing',f,e-3.3,e+3.3,st.n1,3.7,floor-.22,floor,0x9ea89e);
 for(const s of[e-3.55,e+3.55])box('entry-stair-cheek',f,s-.12,s+.12,-1.3,.5,ground-.12,floor+.55,0xcdd3cc);
 for(const s of[e-3.65,e+3.65]){const pier=box('entry-stone-pier',f,s-.35,s+.35,-.25,1.7,floor, floor+3.65,0xa2a9a3);joints(f,pier,s-.35,s+.35,floor,floor+3.65,-.255);}
 // 열린 문 가운데로 실제 캐릭터가 통과할 수 있는 폭을 남긴다.
 for(const[a,b]of[[e-3.25,e-1.25],[e+1.25,e+3.25]])pane('entry-side-glass',f,a,b,floor,floor+2.75,.3);
 for(const s of[e-1.25,e+1.25]){const jamb=box('entry-door-jamb',f,s-.055,s+.055,.2,.4,floor,floor+2.8,0x34433c,'metal');box('open-entry-door',f,s-.04,s+.04,.4,1.6,floor+.05,floor+2.7,0x67877a,'glass',jamb);}
 box('entry-door-header',f,e-3.3,e+3.3,.2,.45,floor+2.75,floor+3.5,0x3a4741);
 for(const s of[e-3.3,e+3.3])box('vestibule-side',f,s-.08,s+.08,.4,3.7,floor,floor+3.15,0xabb4a8);
 box('vestibule-back',f,e-3.3,e+3.3,3.6,3.8,floor,floor+3.15,0xadb8aa);
 const canopy=box('black-entry-canopy',f,e-4.05,e+4.05,-1.5,1.8,floor+3.15,floor+4.25,0x303d37,'metal');
 for(let y=floor+3.18;y<floor+4.25;y+=.15)box('canopy-front-louver',f,e-4.12,e+4.12,-1.61,-1.49,y,y+.045,0x66736c,'metal',canopy);
 for(let n=-1.4;n<1.8;n+=.16)box('canopy-soffit-louver',f,e-4,e+4,n,n+.045,floor+3.10,floor+3.16,0x1e3027,'metal',canopy);
 label('pharmacy21-college-sign','College of Pharmacy',f,e,-1.64,floor+3.78,7.8,.58,canopy,'#303d37','#f3f4ec');
 function tactile(n0:number,n1:number,y:number){const owner=box('entry-tactile-paving',f,e-3.2,e+3.2,n0,n1,y,y+.008,0xc4a54c);for(let s=e-3.1;s<e+3.2;s+=.16)for(let n=n0+.08;n<n1;n+=.16)box('tactile-stud',f,s-.022,s+.022,n-.022,n+.022,y+.008,y+.02,0xd3bb61,'stone',owner);}
 tactile(-1.85,-1.45,ground+.003);tactile(-.05,.25,floor+.003);
 const board=box('blue-building-board',f,e+4.3,e+6.4,-.6,-.45,ground+.25,ground+1.35,0x18527e,'metal');label('pharmacy21-wayfinding','21 약학관1',f,e+5.35,-.62,ground+.8,2,.65,board,'#18527e','#ffffff');
 for(const s of[e-5.2,e+4.4]){const planter=box('entry-planter',f,s-.3,s+.3,-.55,.1,ground,ground+.65,0xd1d7cc);box('entry-shrub',f,s-.38,s+.38,-.62,.2,ground+.6,ground+1.3,0x5d7950,'wood',planter);}
 const plaque=box('stone-plaque-base',f,e-6.3,e-5.3,-.6,.1,ground,ground+.38,0xafb5a8);box('stone-plaque',f,e-6.15,e-5.45,-.4,-.15,ground+.35,ground+1.15,0x7b8376,'stone',plaque);
 entryRoute.push(xyz(e,floor,.5),xyz(e,floor,2.7));routes.mainEntry=entryRoute;
 routes.connection21=conn.door21?[at(conn.door21,conn.s21,conn.floor,.7).toArray() as XYZ,at(conn.door21,conn.s21,conn.floor,-2.5).toArray() as XYZ]:[];
 pavementMasks.push({component:'entry-forecourt',polygon:[f.point(e-4,-2.9),f.point(e+4,-2.9),f.point(e+4,4),f.point(e-4,4)]});
 const meshes=batches.map(b=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(b.colors,3));g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:b.glass?.27:.78,side:THREE.DoubleSide}));mesh.name=b.glass?'pharmacy21-glass':'pharmacy21-surfaces';mesh.castShadow=!b.glass;mesh.receiveShadow=true;shell.add(mesh);return mesh;});
 shell.userData.pharmacy21Exterior={buildingId:building.id,floor,roof,levels:4,levelsEstimated:true,dimensionsEstimated:true,wholeInteriorImplemented:false,rawOutlinePreserved:true,renderedOutline:ring,northwestFrontOffset:q.frontOffset,routes,pavementMasks,entryS:e,entrySteps:st.steps,observedFaces:['northwest'],unverifiedFaces:['southeast','southwest','roof'],roadviewMonth:'2026-07',geometry:{meshes:meshes.length+signs.length,textures:signs.length,triangles:batches.reduce((n,b)=>n+b.positions.length/9,0)+signs.length*2,colliders:breakables.length}};
 function update(_player:THREE.Vector3){batches.forEach((b,index)=>{const a=meshes[index].geometry.attributes.position as THREE.BufferAttribute,c=meshes[index].geometry.attributes.color as THREE.BufferAttribute;let moved=false,tinted=false;for(const p of b.parts){if(p.shown!==p.proxy.visible){p.shown=p.proxy.visible;moved=true;if(p.shown)(a.array as Float32Array).set(p.original,p.start);else for(let i=p.start;i<p.end;i+=3){a.array[i]=p.proxy.position.x;a.array[i+1]=p.proxy.position.y;a.array[i+2]=p.proxy.position.z;}}if(p.color!==p.proxy.material.color.getHex()){p.color=p.proxy.material.color.getHex();tinted=true;const t=p.proxy.material.color,scale=[t.r/p.base.r,t.g/p.base.g,t.b/p.base.b];for(let i=p.start;i<p.end;i++)c.array[i]=p.colors[i-p.start]*scale[(i-p.start)%3];}}if(moved)a.needsUpdate=true;if(tinted)c.needsUpdate=true;});for(const s of signs)s.mesh.visible=s.owner.visible;shell.visible=batches.some(b=>b.parts.some(p=>p.proxy.visible));}
 // 렌더 버퍼와 복원용 사본을 만든 뒤 조립용 배열을 비운다.
 for(const batch of batches){batch.positions.length=0;batch.colors.length=0;}
 return{shell,breakables,update};
}



