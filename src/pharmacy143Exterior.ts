import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import type { CampusBuilding } from './fullCampus';
import { humanities23Frame } from './humanities23Site';
import { pharmacy143BridgeCut, type Pharmacy143Layout } from './pharmacy143Site';
type XZ=[number,number];type XYZ=[number,number,number];type Frame=ReturnType<typeof humanities23Frame>;type Proxy=THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
export function createPharmacy143Exterior(scene:THREE.Scene,building:CampusBuilding,q:Pharmacy143Layout,heightAt:(x:number,z:number)=>number){
 const shell=new THREE.Group();shell.name='landmark/pharmacy143-exterior';Object.assign(shell.userData,{role:'building-shell',buildingId:building.id,mappedOutline:building.points});scene.add(shell);
 const distant=new THREE.Group();distant.name=building.id+':pharmacy143-distant';distant.visible=false;Object.assign(distant.userData,{role:'distant-building',buildingId:building.id});scene.add(distant);
 const signs:{mesh:THREE.Mesh;owner:Proxy}[]=[],floor=q.floor,roof=q.roof;
  const breakables: BreakableSpec[] = [];
  const batches = [false, true].map(glass => ({ glass, positions: [] as number[], colors: [] as number[], parts: [] as { proxy: Proxy; start: number; end: number; original: Float32Array; colors: Float32Array; base: THREE.Color; color: number; shown: boolean }[] }));
  const at = (f: Frame, s: number, y: number, n = 0) => { const p = f.point(s, n); return new THREE.Vector3(p[0], y, p[1]); };
  function part(name: string, vertices: THREE.Vector3[], color: number, material: BreakableSpec['material'] = 'stone', owner?: Proxy, flat = false) {
    const bounds = new THREE.Box3().setFromPoints(vertices), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const g = flat ? new THREE.BufferGeometry() : new ConvexGeometry(vertices.map(p => p.clone().sub(center)));
    if (flat) { const values: number[] = []; for (let i = 1; i + 1 < vertices.length; i++) for (const p of [vertices[0], vertices[i], vertices[i + 1]]) values.push(...p.clone().sub(center).toArray()); g.setAttribute('position', new THREE.Float32BufferAttribute(values, 3)); }
    const attr = g.attributes.position, proxy = owner ?? new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color }));
    if (!owner) { proxy.position.copy(center); proxy.updateMatrixWorld(true); Object.assign(proxy.userData, { buildingId: building.id, component: name, renderProxy: true, convex: true }); breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attr.array), toughness: material === 'glass' ? 2 : 8, material, label: '143동과 연결교' }); }
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

 const routes:Record<string,XYZ[]>={},pavementMasks:{component:string;polygon:XZ[]}[]=[];
 const vec=(p:XZ,y:number)=>new THREE.Vector3(p[0],y,p[1]);
 // 곡선 보행면의 양 끝은 같은 모서리를 공유해 계단과 보도 사이 틈을 막는다.
 function frontAt(frame:Frame,s:number,y:number,n:number){const i=q.frames.indexOf(frame);if(i<0)return at(frame,s,y,n);const joint=(k:number)=>{const prev=q.frames[Math.max(0,k-1)],next=q.frames[Math.min(q.frames.length-1,k)],pa=prev.point(0,1),pb=prev.point(0),na=next.point(0,1),nb=next.point(0),a=[pa[0]-pb[0],pa[1]-pb[1]],b=[na[0]-nb[0],na[1]-nb[1]],divisor=1+a[0]*b[0]+a[1]*b[1];return new THREE.Vector3(q.front[k][0]+n*(a[0]+b[0])/divisor,y,q.front[k][1]+n*(a[1]+b[1])/divisor);};return joint(i).lerp(joint(i+1),s/frame.length);}
 function paving(name:string,frame:Frame,a:number,b:number,n0:number,n1:number,y0:number,y1:number,color=0xa3aaa1,owner?:Proxy,depth=.22){const top=[frontAt(frame,a,y0,n0),frontAt(frame,b,y1,n0),frontAt(frame,b,y1,n1),frontAt(frame,a,y0,n1)];return part(name,[...top,...top.map(p=>p.clone().add(new THREE.Vector3(0,-depth,0)))],color,'stone',owner);}
 function panel(name:string,frame:Frame,a:number,b:number,n:number,y0:number,y1:number,color=0x688584){const owner=box(name,frame,a,b,n-.04,n+.04,y0,y1,color,'glass');for(const s of[a,b,(a+b)/2])box('glazing-mullion',frame,s-.025,s+.025,n-.085,n+.085,y0,y1,0x9b9d74,'metal',owner);for(const y of[y0,y1,y0+(y1-y0)*.47])box('glazing-transom',frame,a,b,n-.085,n+.085,y-.025,y+.025,0x65756a,'metal',owner);return owner;}
 const bf=q.bridge,bridgeFloor=q.bridgeFloor;
 // 지도에 표시된 연결교를 높여 설치하고 도로 위 통과 공간을 남긴다.
 for(let s=-3;s<bf.length+6;s+=3){const end=Math.min(s+3,bf.length+6);box('bridge-floor',bf,s,end,-.96,.96,bridgeFloor-.27,bridgeFloor,0xaeb9ad);box('bridge-roof',bf,s,end,-1.02,1.02,bridgeFloor+2.95,bridgeFloor+3.18,0xbcc5b9);}
 for(const n of[-.83,.83])for(let s=0;s<bf.length+3.5;s+=2.5){const end=Math.min(s+2.5,bf.length+3.5),glass=panel('bridge-glass',bf,s,end,n,bridgeFloor+.13,bridgeFloor+2.95,0x86a69b);box('bridge-bottom-band',bf,s,end,n-.09,n+.09,bridgeFloor-.18,bridgeFloor+.14,0xc0c9bf,'metal',glass);beam('bridge-diagonal-brace',at(bf,s,bridgeFloor+.18,n),at(bf,end,bridgeFloor+2.87,n),.035,0x9aa482,glass);}
 for(const s of[2.2,bf.length-2.4])for(const n of[-1.12,1.12]){const ground=heightAt(...bf.point(s,n)),foot=box('bridge-pier-foot',bf,s-.45,s+.45,n-.45,n+.45,ground-.15,ground+.24,0xa3ad9d);if(s<5)beam('round-bridge-pier',at(bf,s,ground+.24,n),at(bf,s,bridgeFloor-.27,n),.25,0xaebbb2,foot);else{box('steel-bridge-pier',bf,s-.12,s+.12,n-.16,n+.16,ground+.24,bridgeFloor+3.5,0xa1b2a4,'metal',foot);for(const v of[-.14,.14])box('steel-pier-flange',bf,s-.2,s+.2,n+v-.035,n+v+.035,ground+.24,bridgeFloor+3.5,0xbdc7bd,'metal',foot);}}
 for(const side of[-1,1]){const s=side<0?-3:bf.length+5.8;box('bridge-vestibule-back',bf,s-.08,s+.08,-.97,.97,bridgeFloor,bridgeFloor+2.95,0xb5bfb0);for(const n of[-.96,.96])box('bridge-vestibule-side',bf,side<0?-3:bf.length+3.5,side<0?0:bf.length+5.8,n-.04,n+.04,bridgeFloor,bridgeFloor+2.95,0xaeb9aa);}
 routes.bridge=[at(bf,-2.2,bridgeFloor).toArray(),at(bf,0,bridgeFloor).toArray(),at(bf,bf.length/2,bridgeFloor).toArray(),at(bf,bf.length+4.8,bridgeFloor).toArray()] as XYZ[];

 // 곡면은 짧은 평면으로 나누고 돌출된 위층과 후퇴한 하부 유리를 구분한다.
 for(let i=0;i<q.frames.length;i++){const f=q.frames[i],lower=q.lowerFrames[i],len=f.length;
  for(let level=2;level<5;level++){const y=floor+level*3.5,win=panel('upper-front-window',f,.04,len-.04,.1,y+.15,y+3.36),brick=i<11;
   for(const s of[0,len*.33,len*.67]){box(brick?'brick-front-pier':'silver-front-fin',f,s-.07,s+.07,-.48,.2,y,y+3.5,brick?0x9b6d52:0xc4c6ad,'stone',win);if(brick)for(let h=y;h<y+3.5;h+=.22)facet('brick-pier-joint',f,s-.07,s+.07,h,h+.009,-.485,0xbca88e,win);}
   box('upper-floor-band',f,0,len,-.5,.3,y,y+.13,0xbcbca8,'stone',win);
  }
  box('front-roof-edge',f,0,len,-.5,.3,roof-.16,roof+.18,0xbbbba8);
  const canopy=box('upper-front-soffit',f,0,len,-.4,3.4,floor+6.8,floor+7,0x4e5b51);
  for(let n=0;n<3.4;n+=.28)box('soffit-joint',f,0,len,n,n+.018,floor+6.78,floor+6.81,0x293e30,'metal',canopy);
  if(i%3===0){const behindRamp=i>=5&&i<8;box('front-square-column',f,-.25,.25,behindRamp?2.4:.35,behindRamp?2.95:.9,floor-.1,floor+7,0xacae9b);}
  const bridgeCut=pharmacy143BridgeCut(q,lower),entry=q.entries.find(e=>e.index===i),cuts=[0,lower.length,...(bridgeCut?[bridgeCut.a,bridgeCut.b]:[]),...(entry?[Math.max(0,entry.s-1.1),Math.min(lower.length,entry.s+1.1)]:[])].sort((a,b)=>a-b);
  for(let level=0;level<2;level++)for(let c=1;c<cuts.length;c++){const a=cuts[c-1],b=cuts[c],mid=(a+b)/2,y=floor+level*3.5;if(b-a<.01)continue;const openBridge=level===1&&bridgeCut&&mid>bridgeCut.a-.01&&mid<bridgeCut.b+.01,openEntry=level===0&&entry&&Math.abs(mid-entry.s)<1.1;
   if(openBridge||openEntry){box('entry-glass-header',lower,a,b,-.08,.1,y+2.9,y+3.5,0x586b5c);continue;}
   const glass=panel('lower-curtain-glass',lower,a,b,0,y+.04,y+3.45,i<8?0x80aaa3:0x6c8980);
   if(i<8)for(let s=a;s<b;s+=.18)box('channel-glass-rib',lower,s,Math.min(s+.025,b),-.08,.04,y+.05,y+3.43,0xb0c6ba,'glass',glass);
  }
  const frontFloor=box('lower-curtain-floor-band',f,0,len,-.25,3.4,bridgeFloor-.22,bridgeFloor,0xb8beb2);
  for(let s=0;s<len;s+=1.4)box('lower-balcony-glass-mullion',f,s,s+.025,-.3,-.2,bridgeFloor,bridgeFloor+1.03,0x8d9f90,'metal',frontFloor);
  // 연결교의 통행 폭에 맞춰 앞쪽 유리 난간을 끊는다.
  const frontCut=pharmacy143BridgeCut(q,f);for(const[a,b]of[[0,frontCut?.a??len],[frontCut?.b??len,len]])if(b-a>.02)box('lower-front-glass-rail',f,a,b,-.27,-.23,bridgeFloor+.05,bridgeFloor+1.0,0x92aca0,'glass',frontFloor);
 }
 const ring:XZ[]=[...q.front,...building.points.slice(3,14)];
 for(let i=q.front.length-1;i<ring.length;i++){const f=humanities23Frame(ring[i],ring[(i+1)%ring.length]);for(let level=0;level<5;level++){const y=floor+level*3.5,base=level===0?Math.min(floor-.5,heightAt(...f.point(f.length/2))-.4):y;box('unverified-rear-wall',f,0,f.length,-.18,.18,base,y+3.5,0xb2af98);}}
 for(const t of THREE.ShapeUtils.triangulateShape(ring.map(p=>new THREE.Vector2(...p)),[])){const top=t.map(i=>vec(ring[i],roof));part('roof-deck',[...top,...top.map(p=>p.clone().add(new THREE.Vector3(0,-.23,0)))],0xa9b1a0);}
 // 옥상의 흰 곡면 덮개와 경사진 골조는 사진에서 보이는 외형만 근사한다.
 const roofFrame=humanities23Frame([397,-909],[425,-883]);
 for(let s=0;s<roofFrame.length;s+=3){const end=Math.min(s+3,roofFrame.length),a=at(roofFrame,s,roof+.5,0),b=at(roofFrame,end,roof+.5,0),c=at(roofFrame,end,roof+3.6,5),d=at(roofFrame,s,roof+3.6,5);const owner=beam('sloping-roof-frame',a,d,.06,0x99aa9a);beam('sloping-roof-frame',b,c,.06,0x99aa9a,owner);beam('roof-frame-top',c,d,.06,0x99aa9a,owner);beam('roof-frame-diagonal',a,c,.04,0x99aa9a,owner);}
 const roofHood=humanities23Frame([402,-888],[416,-875]);for(let i=0;i<12;i++){const a=i/12*Math.PI,b=(i+1)/12*Math.PI,ra=roofHood.point(0,3*Math.cos(a)),rb=roofHood.point(0,3*Math.cos(b)),ea=roofHood.point(roofHood.length,3*Math.cos(a)),eb=roofHood.point(roofHood.length,3*Math.cos(b));const top=[vec(ra,roof+1+3*Math.sin(a)),vec(ea,roof+1+3*Math.sin(a)),vec(eb,roof+1+3*Math.sin(b)),vec(rb,roof+1+3*Math.sin(b))];part('curved-roof-hood',[...top,...top.map(p=>p.clone().add(new THREE.Vector3(0,-.15,0)))],0xc4cec1);}

 // 넓은 계단과 북쪽 경사로를 같은 상부 바닥으로 잇는다.
 for(const w of q.walk){const f=w.f,owner=paving('front-sidewalk',f,0,f.length,-4.7,-2,w.y0,w.y1);for(let s=0;s<f.length;s+=.55){const y=w.y0+(w.y1-w.y0)*s/f.length;part('pavement-cross-joint',[frontAt(f,s,y+.004,-4.7),frontAt(f,Math.min(s+.009,f.length),y+.004,-4.7),frontAt(f,Math.min(s+.009,f.length),y+.004,-2),frontAt(f,s,y+.004,-2)],0x65796a,'stone',owner,true);}for(let n=-4.7;n<-2;n+=.55){const top=[frontAt(f,0,w.y0+.004,n),frontAt(f,f.length,w.y1+.004,n),frontAt(f,f.length,w.y1+.004,n+.009),frontAt(f,0,w.y0+.004,n+.009)];part('pavement-long-joint',top,0x65796a,'stone',owner,true);}pavementMasks.push({component:'front-sidewalk',polygon:[f.point(0,-4.7),f.point(f.length,-4.7),f.point(f.length,7),f.point(0,7)]});
  if(w.i>=9){for(let j=0;j<q.steps;j++){const n0=-2+j*3.5/q.steps,n1=-2+(j+1)*3.5/q.steps,y=q.apronFloor+(floor-q.apronFloor)*(j+1)/q.steps;const step=paving('wide-front-stair',f,0,f.length,n0,n1,y,y,0x89988b);paving('stair-nosing',f,0,f.length,n0,n0+.035,y+.005,y+.005,0xbfcabd,step,.005);}paving('entry-upper-landing',f,0,f.length,1.5,3.4,floor,floor,0x9eac9b);}
 }
 const rampStart=5,rampEnd=8;
 for(let i=rampStart;i<rampEnd;i++){const f=q.frames[i],a=(i-rampStart)/(rampEnd-rampStart),b=(i+1-rampStart)/(rampEnd-rampStart),ya=q.apronFloor+(floor-q.apronFloor)*a,yb=q.apronFloor+(floor-q.apronFloor)*b,slab=paving('entry-access-ramp',f,0,f.length,-.6,1.5,ya,yb);for(const n of[-.6,1.5]){beam('ramp-handrail',at(f,0,ya+1,n),at(f,f.length,yb+1,n),.035,0xbac8b7,slab);for(let s=0;s<f.length;s+=1.5){const y=ya+(yb-ya)*s/f.length;beam('ramp-railing-post',at(f,s,y,n),at(f,s,y+1,n),.025,0xbac8b7,slab);}}}
 paving('ramp-bottom-approach',q.frames[rampStart],0,1.6,-3.7,-.6,q.apronFloor,q.apronFloor);
 paving('ramp-turn-landing',q.frames[rampEnd],0,q.frames[rampEnd].length,-.6,3.4,floor,floor,0x9eac9b,undefined,floor-q.apronFloor+.22);
 const rampRoute:XYZ[]=[at(q.frames[rampStart],.8,q.apronFloor,-3.6).toArray() as XYZ,at(q.frames[rampStart],.8,q.apronFloor,.45).toArray() as XYZ];
 for(let i=rampStart;i<rampEnd;i++){const f=q.frames[i],a=(i-rampStart)/(rampEnd-rampStart),b=(i+1-rampStart)/(rampEnd-rampStart);rampRoute.push(at(f,f.length/2,q.apronFloor+(floor-q.apronFloor)*(a+b)/2,.45).toArray() as XYZ,at(f,f.length,q.apronFloor+(floor-q.apronFloor)*b,.45).toArray() as XYZ);}
 rampRoute.push(at(q.frames[rampEnd],1,floor,.45).toArray() as XYZ,at(q.frames[rampEnd],1,floor,2.3).toArray() as XYZ,at(q.frames[9],q.frames[9].length/2,floor,2.3).toArray() as XYZ,at(q.entries[0].f,q.entries[0].s,floor,2.4).toArray() as XYZ);routes.rampToMain=rampRoute;
 // 서쪽 계단 접속부를 비켜 도로 동쪽 안에서 연결교 아래를 지난다.
 const underRoad:XZ[]=[[369.7,-917.56],[374.66,-904.0],[383.06,-895.61]];
 routes.underBridge=underRoad.map(p=>[p[0],heightAt(...p),p[1]]);
 routes.frontWalk=[...q.walk.map(w=>at(w.f,0,w.y0,-3.6).toArray() as XYZ),at(q.walk.at(-1)!.f,q.walk.at(-1)!.f.length,q.walk.at(-1)!.y1,-3.6).toArray() as XYZ];
 for(const e of q.entries){const f=e.f,a=e.s-1.1,b=e.s+1.1;box('entry-vestibule-floor',f,a,b,-.1,3.2,floor-.22,floor,0xa7b4a1);for(const s of[a,b]){const jamb=box('gold-entry-jamb',f,s-.045,s+.045,-.1,.12,floor,floor+2.9,0xb6a85c,'metal');box('open-entry-leaf',f,s-.035,s+.035,.15,1.3,floor+.05,floor+2.8,0x668775,'glass',jamb);box('entry-vestibule-side',f,s-.06,s+.06,.12,3.2,floor,floor+3,0xa7b4a1);}box('entry-vestibule-back',f,a,b,3.1,3.25,floor,floor+3,0xb2bba7);
  const st=q.frames[e.index],route:XYZ[]=[at(st,st.length*.5,q.apronFloor,-3.6).toArray() as XYZ];for(let j=0;j<q.steps;j++)route.push(at(st,st.length*.5,q.apronFloor+(floor-q.apronFloor)*(j+1)/q.steps,-2+(j+.5)*3.5/q.steps).toArray() as XYZ);route.push(at(st,st.length*.5,floor,2.2).toArray() as XYZ,at(f,e.s,floor,.3).toArray() as XYZ,at(f,e.s,floor,2.4).toArray() as XYZ);routes[e.id]=route;
 }
 const main=q.entries[0],sign=box('college-name-band',main.f,-1,main.f.length+1,-3.5,-3.3,floor+3.18,floor+3.62,0xbec3b1);label('pharmacy143-college-sign','College of Pharmacy',main.f,main.f.length/2,-3.52,floor+3.4,main.f.length+1.8,.35,sign,'#bec3b1','#244c67');
 const near=q.frames[17],board=box('143-wayfinding-board',near,0,1.4,-3.1,-2.9,q.apronFloor+.3,q.apronFloor+1.5,0x245d78,'metal');label('pharmacy143-number','143 신약개발센터',near,.7,-3.12,q.apronFloor+.95,1.35,.5,board,'#245d78','#ffffff');
 for(const i of[9,16]){const f=q.frames[i],tactile=box('entry-tactile-paving',f,.25,f.length-.25,-2.6,-2.15,q.apronFloor+.005,q.apronFloor+.015,0xc5a64a);for(let s=.35;s<f.length-.25;s+=.16)for(let n=-2.5;n<-2.15;n+=.16)box('tactile-stud',f,s-.02,s+.02,n-.02,n+.02,q.apronFloor+.015,q.apronFloor+.03,0xd9bd61,'stone',tactile);}
 const meshes=batches.map(b=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(b.colors,3));g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:b.glass?.26:.77,side:THREE.DoubleSide}));mesh.name=b.glass?'pharmacy143-glass':'pharmacy143-surfaces';mesh.castShadow=!b.glass;mesh.receiveShadow=true;shell.add(mesh);return mesh;});
 shell.userData.pharmacy143Exterior={buildingId:building.id,floor,roof,bridgeFloor,aboveGroundFloors:5,basementFloors:1,basementImplemented:false,dimensionsEstimated:true,wholeInteriorImplemented:false,rawOutlinePreserved:true,renderedOutline:ring,routes,pavementMasks,bridgeRoad:'way/435329616/178',bridgeWidth:q.bridgeWidth,observedFaces:['northwest'],unverifiedFaces:['rear'],roadviewMonth:'2026-07',geometry:{meshes:meshes.length+signs.length,textures:signs.length,triangles:batches.reduce((n,b)=>n+b.positions.length/9,0)+signs.length*2,colliders:breakables.length}};
 function update(_player:THREE.Vector3){batches.forEach((b,index)=>{const a=meshes[index].geometry.attributes.position as THREE.BufferAttribute,c=meshes[index].geometry.attributes.color as THREE.BufferAttribute;let moved=false,tinted=false;for(const p of b.parts){if(p.shown!==p.proxy.visible){p.shown=p.proxy.visible;moved=true;if(p.shown)(a.array as Float32Array).set(p.original,p.start);else for(let i=p.start;i<p.end;i+=3){a.array[i]=p.proxy.position.x;a.array[i+1]=p.proxy.position.y;a.array[i+2]=p.proxy.position.z;}}if(p.color!==p.proxy.material.color.getHex()){p.color=p.proxy.material.color.getHex();tinted=true;const t=p.proxy.material.color,scale=[t.r/p.base.r,t.g/p.base.g,t.b/p.base.b];for(let i=p.start;i<p.end;i++)c.array[i]=p.colors[i-p.start]*scale[(i-p.start)%3];}}if(moved)a.needsUpdate=true;if(tinted)c.needsUpdate=true;});for(const s of signs)s.mesh.visible=s.owner.visible;shell.visible=batches.some(b=>b.parts.some(p=>p.proxy.visible));}
 // 렌더 버퍼와 복원용 사본을 만든 뒤 조립용 배열을 비운다.
 for(const batch of batches){batch.positions.length=0;batch.colors.length=0;}
 return{shell,breakables,update};
}



