import type { Education1320Layout } from './education1320Site';
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import type { CampusBuilding } from './fullCampus';
import { humanities23Frame } from './humanities23Site';
import { education13Frames, type Education13Layout } from './education13Site';
type XZ=[number,number];type Frame=ReturnType<typeof humanities23Frame>;type Proxy=THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
/** 공식 사진과 로드뷰로 외관을 대조하고 조사 좌표에 현관을 대응한다. */
export function createEducation13Exterior(scene:THREE.Scene,building:CampusBuilding,q:Education13Layout,heightAt:(x:number,z:number)=>number,connection?:Education1320Layout){
 const number='13',shell=new THREE.Group();shell.name='landmark/education13-exterior';Object.assign(shell.userData,{role:'building-shell',buildingId:building.id,landmark:'education13-exterior',mappedOutline:building.points});scene.add(shell);
 const distant=new THREE.Group();distant.name=building.id+':education13-exterior-distant';distant.visible=false;Object.assign(distant.userData,{role:'distant-building',buildingId:building.id});scene.add(distant);
 const frames=education13Frames,ring=building.points.slice(0,-1),floor=q.floor,roof=q.roof,signs:{mesh:THREE.Mesh;owner:Proxy}[]=[];
  const breakables: BreakableSpec[] = [];
  const batches = [false, true].map(glass => ({ glass, positions: [] as number[], colors: [] as number[], parts: [] as { proxy: Proxy; start: number; end: number; original: Float32Array; colors: Float32Array; base: THREE.Color; color: number; shown: boolean }[] }));
  const at = (f: Frame, s: number, y: number, n = 0) => { const p = f.point(s, n); return new THREE.Vector3(p[0], y, p[1]); };
  function part(name: string, vertices: THREE.Vector3[], color: number, material: BreakableSpec['material'] = 'stone', owner?: Proxy, flat = false) {
    const bounds = new THREE.Box3().setFromPoints(vertices), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const g = flat ? new THREE.BufferGeometry() : new ConvexGeometry(vertices.map(p => p.clone().sub(center)));
    if (flat) { const values: number[] = []; for (let i = 1; i + 1 < vertices.length; i++) for (const p of [vertices[0], vertices[i], vertices[i + 1]]) values.push(...p.clone().sub(center).toArray()); g.setAttribute('position', new THREE.Float32BufferAttribute(values, 3)); }
    const attr = g.attributes.position, proxy = owner ?? new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color }));
    if (!owner) { proxy.position.copy(center); proxy.updateMatrixWorld(true); Object.assign(proxy.userData, { buildingId: building.id, component: name, renderProxy: true, convex: true }); breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attr.array), toughness: material === 'glass' ? 2 : 8, material, label: number+'동 외관' }); }
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


  const pavementMasks:{component:string;polygon:XZ[]}[]=[],routes:Record<string,number[][]>={};
  const mask=(name:string,f:Frame,s0:number,s1:number,n0:number,n1:number)=>pavementMasks.push({component:name,polygon:[f.point(s0,n0),f.point(s1,n0),f.point(s1,n1),f.point(s0,n1)]});
  function brick(f:Frame,owner:Proxy,a:number,b:number,lo:number,hi:number,n=0,color=0x9c9388){
    for(let y=lo;y<hi-.01;y+=.22){facet('brick-horizontal-joint',f,a+.005,b-.005,y,Math.min(y+.008,hi),n-.334,color,owner);for(let s=a+.3+(Math.round((y-floor)/.22)%2)*.3;s<b-.02;s+=.6)facet('brick-vertical-joint',f,s,Math.min(s+.008,b-.005),y,Math.min(y+.22,hi),n-.336,color,owner);}
  }
  function window(f:Frame,owner:Proxy,a:number,b:number,lo:number,hi:number,bars=false){
    facet('window-glass',f,a,b,lo,hi,-.355,0x668078,owner);
    for(const s of[a,(a+b)/2,b])box('window-frame',f,s-.035,s+.035,-.44,-.36,lo,hi,0xb5c2b9,'metal',owner);
    for(const y of[lo,hi])box('window-frame',f,a-.04,b+.04,-.44,-.36,y-.04,y+.04,0xb5c2b9,'metal',owner);
    if(bars){for(let s=a+.1;s<b;s+=.16)box('lower-window-grille',f,s-.014,s+.014,-.51,-.48,lo,hi,0xa7afa3,'metal',owner);for(const y of[lo+.27,hi-.27])box('grille-horizontal',f,a,b,-.515,-.48,y-.025,y+.025,0xa7afa3,'metal',owner);}
  }
  for(const[edge,f]of frames.entries()){
    const long=[2,3,6,7].includes(edge),north=[6,7].includes(edge),south=[2,3].includes(edge),count=Math.ceil(f.length/6.8),doors=[...q.entries,...(connection?[{edge:4,s:connection.s13,level:1,floor:connection.floor}]:[])].filter(e=>e.edge===edge);
    const cuts=[...Array.from({length:count+1},(_,i)=>i*f.length/count),...doors.flatMap(e=>[e.s-1.6,e.s+1.6])].filter(s=>s>=0&&s<=f.length).sort((a,b)=>a-b);
    for(let level=0;level<4;level++)for(let j=1;j<cuts.length;j++){
      const a=cuts[j-1],b=cuts[j],mid=(a+b)/2;if(b-a<.02)continue;const y=floor+level*3.5,upperDoor=doors.find(e=>e.level===level+1&&Math.abs(mid-e.s)<1.6),hi=y+3.5-(upperDoor?.2:0),lo=level===0?Math.min(floor-.4,heightAt(...f.point(mid))-.6):y;
      const door=doors.find(e=>e.level===level&&Math.abs(mid-e.s)<1.6);
      if(door){if(lo<door.floor-.2)box('door-foundation',f,a,b,-.325,.325,lo,door.floor-.2,0xa4aaa0);box('door-lintel',f,a,b,-.325,.325,door.floor+2.8,hi,0x645a53);continue;}
      const wall=box('brick-facade-bay',f,a,b,-.325,.325,lo,hi,long?0x5b514b:0x6b625b);Object.assign(wall.userData,{facadeEdge:edge,storey:level,range:[a,b]});
      if(long)brick(f,wall,a,b,lo,hi);
      if(long&&b-a>1.4){const cells=level>=2&&b-a>4?2:1,w=(b-a)/cells;for(let k=0;k<cells;k++)window(f,wall,a+k*w+w*.15,a+(k+1)*w-w*.15,y+(level>=2?1.0:.65),y+(level>=2?2.65:2.94),north&&level===0);}
      box('white-floor-band',f,a,b,-.55,.34,hi-.35,hi,0xdfdfd5,'stone',wall);
      if(north&&level===0){facet('stone-plinth',f,a,b,lo,floor+.65,-.34,0xa3aba0,wall);brick(f,wall,a,b,lo,floor+.65,-.012,0x758276);}
    }
    for(let j=0;j<=count;j++){const s=j*f.length/count;if(doors.some(e=>Math.abs(s-e.s)<1.9))continue;const post=box('white-concrete-column',f,Math.max(0,s-.16),Math.min(f.length,s+.16),-.6,.32,Math.min(floor-.3,heightAt(...f.point(s))-.3),roof,0xe0e0d5);if((south||edge===6&&s>24)&&j>0&&j<count){box('projecting-white-fin',f,s-.14,s+.14,-1.05,-.3,floor+3.5,floor+7,0xdfdfd5,'stone',post);box('fin-top',f,s-.14,Math.min(s+3.1,f.length),-1.05,-.3,floor+6.65,floor+7,0xdfdfd5,'stone',post);}}
    for(let s=0;s<f.length;s+=5.5){const b=Math.min(f.length,s+5.5),owner=box('deep-roof-eave',f,s,b,-1.2,.4,roof-.16,roof+.18,0xe1e2d7);for(const y of[roof+.18,roof+1.0])box('slotted-concrete-parapet',f,s,b,-.24,.24,y,y+.26,0xe0e0d6,'stone',owner);for(const u of[s,b])box('parapet-pier',f,u-.11,u+.11,-.24,.24,roof+.4,roof+1.04,0xe0e0d6,'stone',owner);}
  }
  for(const t of THREE.ShapeUtils.triangulateShape(ring.map(p=>new THREE.Vector2(...p)),[])){const top=t.map(i=>new THREE.Vector3(ring[i][0],roof+.2,ring[i][1]));part('footprint-roof',[...top,...top.map(p=>p.clone().add(new THREE.Vector3(0,-.35,0)))],0xa5b0a2);}
  // 끝면과 세로 유리 공간은 사진 형태를 참고하되 치수와 방향은 지도에 맞춘 근사다.
  const end=frames[4];
  const towerParts=connection?[[1.5,5.7,floor,connection.floor-.2],[1.5,5.7,connection.floor+2.85,roof+2.4],[1.5,Math.max(1.5,connection.s13-1.6),connection.floor-.2,connection.floor+2.85],[Math.min(5.7,connection.s13+1.6),5.7,connection.floor-.2,connection.floor+2.85]]:[[1.5,5.7,floor,roof+2.4]];
  for(const[a,b,lo,hi]of towerParts){if(b-a<.02)continue;const tower=box('stair-tower',end,a,b,.5,5,lo,hi,0x665e54);brick(end,tower,a,b,lo,hi,.825);}
  const glass=box('vertical-green-glass',end,5.9,8.2,-.65,-.5,floor,roof+1.8,0x3c8f7b,'glass');
  for(const s of[5.9,8.2])box('vertical-glass-edge',end,s-.06,s+.06,-.74,-.48,floor,roof+1.85,0xc8d2c4,'metal',glass);
  for(let y=floor;y<roof+1.8;y+=2.2)box('vertical-glass-mullion',end,5.9,8.2,-.74,-.48,y,y+.07,0xb5cabc,'metal',glass);
  const sf=frames[3],signOwner=box('roof-lettering-board',sf,3,24,-1.21,-1.12,roof+.16,roof+1.08,0xe0e0d5,'metal');
  label('education13-roof-label','13 College of Education',sf,13.5,-1.225,roof+.61,20.5,.82,signOwner,'#e0e0d5','#204e80');
  function slab(name:string,f:Frame,s0:number,s1:number,n0:number,n1:number,y0:number,y1:number){
    const top=[at(f,s0,y0,n0),at(f,s1,y0,n0),at(f,s1,y1,n1),at(f,s0,y1,n1)],owner=part(name,[...top,...top.map(p=>p.clone().add(new THREE.Vector3(0,-.16,0)))],0xb5b3a6);
    const y=(n:number)=>y0+(y1-y0)*(n-n0)/(n1-n0)+.003;
    for(let n=n0;n<n1;n+=.5){const b=Math.min(n+.009,n1);part('approach-cross-joint',[at(f,s0,y(n),n),at(f,s1,y(n),n),at(f,s1,y(b),b),at(f,s0,y(b),b)],0x899184,'stone',owner,true);}
    for(let s=s0;s<s1;s+=.5){const b=Math.min(s+.009,s1);part('approach-long-joint',[at(f,s,y(n0),n0),at(f,b,y(n0),n0),at(f,b,y(n1),n1),at(f,s,y(n1),n1)],0x899184,'stone',owner,true);}
    return owner;
  }
  for(const e of q.entries){const f=e.f,a=e.s-1.6,b=e.s+1.6,y=e.floor;
    slab('entry-paved-approach',f,a,b,-7,-3,e.outer,e.top);mask('entry-paved-approach',f,a,b,-7,5);
    if(e.stairs){const count=Math.max(1,Math.ceil((e.top-y)/.17));for(let i=0;i<count;i++){const n0=-3+2.7*i/count,n1=-3+2.7*(i+1)/count,top=e.top+(y-e.top)*i/count;const step=box('rear111-step',f,a,b,n0,n1,Math.min(y-.18,top-.18),top,0xbab8aa);box('stair-nosing',f,a,b,n1-.045,n1,top,top+.006,0xe0d9c8,'stone',step);}for(const s of[a,b]){const rail=beam('entry-handrail',at(f,s,e.top+.95,-3),at(f,s,y+.95,-.3),.045,0x9aa99b);for(const[n,h]of[[-3,e.top],[-.3,y]])beam('entry-handrail-post',at(f,s,h,n),at(f,s,h+.95,n),.04,0x9aa99b,rail);}}
    else slab('entry-outer-landing',f,a,b,-3,-.3,y,y);
    const landing=box('entry-floor',f,a,b,-.3,5,y-.18,y,0xc3c1b5);
    for(let s=a;s<b;s+=.5)box('paving-long-joint',f,s,s+.008,-.3,5,y,y+.002,0x8b9185,'stone',landing);
    for(let n=-.3;n<5;n+=.5)box('paving-cross-joint',f,a,b,n,n+.008,y,y+.002,0x8b9185,'stone',landing);
    for(const s of[a,b]){const jamb=box('door-jamb',f,s-.07,s+.07,-.42,.43,y,y+2.8,0xbcc7bd,'metal');box('open-glass-door',f,s-.035,s+.035,.42,1.65,y+.08,y+2.7,0x5d8a7d,'glass',jamb);box('vestibule-side',f,s-.1,s+.1,.45,5.1,y,y+2.9,0xc8cbbf);}
    box('door-header',f,a,b,-.45,.5,y+2.72,y+2.84,0xbac6bb,'metal');box('entry-canopy',f,a-.15,b+.15,-1.1,.6,y+2.87,y+3.06,0xd9dcd1);box('vestibule-ceiling',f,a,b,.6,5.1,y+2.9,y+3.03,0xd0d4c9);box('vestibule-back',f,a,b,5,5.15,y,y+2.9,0xc3c7bb);
    routes[e.id]=[[-7,e.outer],[-3,e.top],[-.3,y],[3.6,y]].map(([n,h])=>at(f,e.s,h,n).toArray());
  }
  for(const st of q.stairs){const f=st.f,count=Math.max(1,Math.ceil((st.hi-st.lo)/.17)),length=f.length-.8,steps:{s:number;y:number}[]=[];
    for(let i=0;i<count;i++){const a=.4+length*i/count,b=.4+length*(i+1)/count,y=st.lo+(st.hi-st.lo)*(i+1)/count,owner=box('mapped-stair-tread',f,a,b,-st.width/2,st.width/2,y-.3,y,0xb5b3a6);box('mapped-stair-nosing',f,a,a+.035,-st.width/2,st.width/2,y,y+.006,0xd5d4c6,'stone',owner);steps.push({s:a,y});}
    const lo=box('mapped-stair-bottom',f,0,.4,-st.width/2,st.width/2,st.lo-.18,st.lo,0xb5b3a6),hi=box('mapped-stair-top',f,f.length-.4,f.length,-st.width/2,st.width/2,st.hi-.18,st.hi,0xb5b3a6);
    for(const n of[-st.width/2,st.width/2]){beam('mapped-stair-rail',at(f,.1,st.lo+.95,n),at(f,f.length-.1,st.hi+.95,n),.045,0x9eaa9c);for(let s=.1;s<f.length;s+=2.4){const y=st.lo+(st.hi-st.lo)*s/f.length;beam('mapped-stair-post',at(f,s,y,n),at(f,s,y+.95,n),.04,0x9eaa9c,s<f.length/2?lo:hi);}}
    mask('mapped-stair',f,0,f.length,-st.width/2,st.width/2);routes[st.id+':'+st.segment]=[at(f,0,st.lo),...steps.map(t=>at(f,t.s+.03,t.y)),at(f,f.length,st.hi)].map(p=>p.toArray());
  }
  const lf=frames[3],ls=14,ln=-2.9,ly=heightAt(...lf.point(ls,ln)),lamp=beam('twin-globe-lamp',at(lf,ls,ly,ln),at(lf,ls,ly+4.3,ln),.09,0x796548);
  for(const side of[-1,1]){beam('lamp-arm',at(lf,ls,ly+4.2,ln),at(lf,ls+side*.6,ly+4.5,ln),.05,0x796548,lamp);const g=new THREE.SphereGeometry(.25,8,6),p=g.attributes.position,c=at(lf,ls+side*.6,ly+4.23,ln);part('lamp-globe',Array.from({length:p.count},(_,i)=>new THREE.Vector3(p.getX(i),p.getY(i)*1.2,p.getZ(i)).add(c)),0xd9decf,'glass',lamp);g.dispose();}
  shell.userData.education13Exterior={buildingId:building.id,floor,roof,levels:4,levelsEstimated:true,dimensionsEstimated:true,wholeInteriorImplemented:false,connection20Implemented:!!connection,officialPhotoDirectionEstimated:true,roadviewMonth:'2026-07',entries:q.entries.map(({f,...e})=>({...e,route:routes[e.id],positionEstimated:true,appearanceEstimated:true})),routes,pavementMasks,mappedStairs:q.stairs.map(({f,...s})=>({...s,length:f.length})),observedEdges:[2,3,6,7],unobservedEdges:[0,1],sources:['https://map.snu.ac.kr/api/upload/default/F_BUILD_0000014.jpg','https://kko.to/SrylOCyHsj']};

  const meshes=batches.map(b=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(b.colors,3));g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:b.glass?.22:.68,side:THREE.DoubleSide}));mesh.name=b.glass?'education13-exterior-glass':'education13-exterior-surfaces';mesh.castShadow=!b.glass;mesh.receiveShadow=true;shell.add(mesh);return mesh;});
  shell.userData.education13Exterior.geometry={meshes:2+signs.length,textures:signs.length,triangles:signs.length*2+batches.reduce((n,b)=>n+b.positions.length/9,0),colliders:breakables.length};
  function update(_player:THREE.Vector3){batches.forEach((b,index)=>{const a=meshes[index].geometry.attributes.position as THREE.BufferAttribute,c=meshes[index].geometry.attributes.color as THREE.BufferAttribute;let moved=false,tinted=false;
    for(const p of b.parts){if(p.shown!==p.proxy.visible){p.shown=p.proxy.visible;moved=true;if(p.shown)(a.array as Float32Array).set(p.original,p.start);else for(let i=p.start;i<p.end;i+=3){a.array[i]=p.proxy.position.x;a.array[i+1]=p.proxy.position.y;a.array[i+2]=p.proxy.position.z;}}if(p.color!==p.proxy.material.color.getHex()){p.color=p.proxy.material.color.getHex();tinted=true;const t=p.proxy.material.color,scale=[t.r/p.base.r,t.g/p.base.g,t.b/p.base.b];for(let i=p.start;i<p.end;i++)c.array[i]=p.colors[i-p.start]*scale[(i-p.start)%3];}}
    if(moved)a.needsUpdate=true;if(tinted)c.needsUpdate=true;
  });for(const s of signs)s.mesh.visible=s.owner.visible;shell.visible=batches.some(b=>b.parts.some(p=>p.proxy.visible));}
  // 렌더 버퍼와 복원용 사본을 만든 뒤 조립용 배열을 비운다.
 for(const batch of batches){batch.positions.length=0;batch.colors.length=0;}
 return{shell,breakables,update};
}

