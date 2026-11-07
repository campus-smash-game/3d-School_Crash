import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import type { CampusBuilding } from './fullCampus';
import { humanities23Frame } from './humanities23Site';
import { EDUCATION1112, education1112DoorCuts } from './education1112Site';
type XZ = [number, number];
type Frame = ReturnType<typeof humanities23Frame>;
type Proxy = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
export const EDUCATION11_ID = 'way/146155734';

/** 공식 사진과 2025년 7월 동쪽 거리뷰를 대조한 외관. 계단과 현관의 치수는 근사다. */
export function createEducation11Exterior(scene:THREE.Scene,building:CampusBuilding,heightAt:(x:number,z:number)=>number,connected=false){
  const number='11';
  const shell=new THREE.Group();shell.name='landmark/education'+number+'-exterior';
  Object.assign(shell.userData,{role:'building-shell',buildingId:building.id,landmark:'education'+number+'-exterior',mappedOutline:building.points});scene.add(shell);
  const distant=new THREE.Group();distant.name=building.id+':education11-exterior-distant';distant.visible=false;
  Object.assign(distant.userData,{role:'distant-building',buildingId:building.id});scene.add(distant);
  const ring=building.points.slice(0,-1),signedArea=ring.reduce((sum,a,i)=>{const b=ring[(i+1)%ring.length];return sum+a[0]*b[1]-b[0]*a[1]},0);
  // 원본 윤곽을 유지하고 바깥 면의 부호만 통일한다.
  const frames=ring.map((p,i)=>signedArea>0?humanities23Frame(p,ring[(i+1)%ring.length]):humanities23Frame(ring[(i+1)%ring.length],p));
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
  const terrain = scene.getObjectByName('campus-terrain') as THREE.Mesh<THREE.BufferGeometry>;
  const tp=terrain.geometry.attributes.position,ti=terrain.geometry.index,triangles:THREE.Vector3[][]=[];
  for(let i=0;i<(ti?.count??tp.count);i+=3){const t=[0,1,2].map(j=>{const k=ti?ti.getX(i+j):i+j;return new THREE.Vector3(tp.getX(k),tp.getY(k),tp.getZ(k));});if(Math.max(...t.map(p=>p.x))>560&&Math.min(...t.map(p=>p.x))<640&&Math.max(...t.map(p=>p.z))>-780&&Math.min(...t.map(p=>p.z))<-690)triangles.push(t);}
  function ground([x,z]:XZ){for(const[a,b,c]of triangles){const det=(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x),u=((x-a.x)*(c.z-a.z)-(z-a.z)*(c.x-a.x))/det,v=((b.x-a.x)*(z-a.z)-(b.z-a.z)*(x-a.x))/det;if(u>=-1e-7&&v>=-1e-7&&u+v<=1.0000001)return a.y+u*(b.y-a.y)+v*(c.y-a.y);}throw Error('Missing education 11 terrain');}

  const front=frames[2],center=68.51,entryA=center-2.3,entryB=center+2.3;
  const floor=ground(front.point(30,3))+.08,storey=3.5,roof=floor+14;
  const entryFloor=Math.max(...[entryA,center,entryB].map(s=>ground(front.point(s,2.3))))+.09;
  const towerRoof=roof+1.75,foundation=connected?EDUCATION1112.original11Foundation+(floor-EDUCATION1112.original11Floor):Math.min(floor,...ring.map(p=>ground(p)))-.6;
  const observedEdges=[2,3],signs:{mesh:THREE.Mesh;owner:Proxy}[]=[];
  function window(f:Frame,owner:Proxy,s0:number,s1:number,lo:number,hi:number,n=0){
    if(s1-s0<.3||hi-lo<.25)return;
    facet('window-glass',f,s0,s1,lo,hi,n-.354,0x6d8b81,owner);
    for(let i=0;i<=2;i++){const s=s0+(s1-s0)*i/2;box('window-frame',f,s-.035,s+.035,n-.44,n-.36,lo,hi,0xc9cdc2,'metal',owner);}
    for(const y of[lo,hi])box('window-frame',f,s0-.04,s1+.04,n-.44,n-.36,y-.04,y+.04,0xc9cdc2,'metal',owner);
  }
  function brickFace(f:Frame,wall:Proxy,a:number,b:number,lo:number,hi:number,n=0){
    for(let y=lo;y<hi-.012;y+=.22){facet('brick-horizontal-joint',f,a+.006,b-.006,y,Math.min(y+.009,hi),n-.334,0xa69e8e,wall);for(let s=a+.3+(Math.round((y-floor)/.22)%2)*.3;s<b-.03;s+=.6)facet('brick-vertical-joint',f,s,Math.min(s+.009,b-.006),y,Math.min(y+.22,hi),n-.337,0xa69e8e,wall);}
  }
  function label(name:string,text:string,f:Frame,s:number,n:number,y:number,width:number,height:number,owner:Proxy,background:string,color:string){
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=128;const ctx=canvas.getContext('2d')!;ctx.fillStyle=background;ctx.fillRect(0,0,768,128);ctx.fillStyle=color;ctx.font='bold 63px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,384,64);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const geometry=new THREE.PlaneGeometry(width,height);geometry.scale(-1,1,1);const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));mesh.name=name;mesh.position.copy(at(f,s,y,n));mesh.lookAt(at(f,s,y,n-1));shell.add(mesh);signs.push({mesh,owner});
  }
  for(const[edge,f]of frames.entries()){
    const observed=observedEdges.includes(edge),divisions=Math.max(1,Math.ceil(f.length/6.8));
    const doors=connected?education1112DoorCuts(edge,f.length,floor):[];
    const cuts=[...Array.from({length:divisions+1},(_,i)=>i*f.length/divisions),...(edge===2?[entryA-1.35,entryA,entryB]:[]),...doors.flatMap(d=>[d.s-1.4,d.s+1.4])].sort((a,b)=>a-b);
    for(let level=0;level<4;level++)for(let j=1;j<cuts.length;j++){
      const a=cuts[j-1],b=cuts[j],mid=(a+b)/2;if(b-a<.02||edge===2&&mid>entryA&&mid<entryB)continue;
      const recess=edge===2&&mid>entryA-1.35&&mid<entryA,n=recess?1.5:edge===2?1:0,y=floor+level*storey,lo=level===0?Math.min(foundation,ground(f.point(mid))-.5):y,hi=y+storey;
      const door=doors.find(d=>d.level===level&&Math.abs(mid-d.s)<1.4);
      if(door){if(lo<door.lo-.18)box('connection-door-foundation',f,a,b,-.325,.325,lo,door.lo-.18,0x817b6e);box('connection-wall-lintel',f,a,b,-.325,.325,door.hi,hi,0x817b6e);continue;}
      const wall=box(recess?'recess-side-wall':'brick-facade-bay',f,a,b,n-.325,n+.325,lo,hi,observed?0x706155:0x817b6e);
      Object.assign(wall.userData,{facadeEdge:edge,storey:level,range:[a,b],bottom:lo,top:hi});
      if(observed)brickFace(f,wall,a,b,lo,hi,n);
      if(!recess&&b-a>1.5){const small=level>=2,cells=small&&b-a>4?2:1,w=(b-a)/cells;for(let k=0;k<cells;k++)window(f,wall,a+k*w+w*.14,a+(k+1)*w-w*.14,y+(small?.95:.55),y+(small?2.6:2.9),n);}
      box('white-floor-band',f,a,b,n-.58,n+.36,y+storey-.36,hi,0xe0dfd3,'stone',wall);
      if(level===0&&observed)box('white-foundation-band',f,a,b,n-.45,n-.33,Math.max(lo,floor-.2),floor+.32,0xd9d9ce,'stone',wall);
    }
    for(let j=0;j<=divisions;j++){
      const s=j*f.length/divisions;if(edge===2&&s>entryA-1.6&&s<entryB+.3||doors.some(d=>Math.abs(s-d.s)<1.65))continue;
      const n=edge===2?1:0;box('white-concrete-pilaster',f,Math.max(0,s-.15),Math.min(f.length,s+.15),n-.62,n-.33,Math.min(floor-.35,ground(f.point(s))-.35),roof,0xe1e0d6);
    }
    for(let s=0;s<f.length;s+=5.5){const end=Math.min(f.length,s+5.5),eave=box('deep-roof-eave',f,s,end,-1.2,.42,roof-.14,roof+.16,0xdbded2);box('roof-parapet-base',f,s,end,-.27,.28,roof+.16,roof+.4,0xdfe1d5,'stone',eave);beam('roof-rail',at(f,s,roof+1.05,-.05),at(f,end,roof+1.05,-.05),.035,0xa6bba2,eave);for(let v=s;v<end-.1;v+=2.3)beam('roof-rail-post',at(f,v,roof+.4,-.05),at(f,v,roof+1.05,-.05),.035,0xa6bba2,eave);}
  }
  for(const tri of THREE.ShapeUtils.triangulateShape(ring.map(p=>new THREE.Vector2(...p)),[]).map(t=>t.map(i=>ring[i]))){const top=tri.map(([x,z])=>new THREE.Vector3(x,roof+.38,z));part('footprint-roof',[...top,...top.map(p=>p.clone().add(new THREE.Vector3(0,-.48,0)))],0xaeb8a9);}
  // 계단실의 치수는 추정하고, 확인한 도로 쪽 외형을 반영한다.
  for(const s of[entryA,entryB])box('stair-tower-side',front,s-.16,s+.16,.4,6.6,foundation,towerRoof,0xdcded3);
  const header=box('stair-tower-front',front,entryA,entryB,2.2,2.8,entryFloor+2.8,towerRoof,0x726256);
  brickFace(front,header,entryA+.16,entryB-.16,entryFloor+2.8,towerRoof,2.525);
  for(let y=entryFloor+3.3;y<towerRoof-1;y+=3.5){window(front,header,entryA+.24,entryB-.24,y,y+1.85,2.525);box('tower-floor-band',front,entryA,entryB,2.03,2.81,y-.55,y-.2,0xe1e0d5,'stone',header);}
  box('tower-roof',front,entryA-.25,entryB+.25,1.9,6.8,towerRoof,towerRoof+.25,0xd3d7cb);
  const signOwner=box('roof-lettering-board',front,front.length-20,front.length-7.7,-1.21,-1.1,roof+.22,roof+1.05,0xe0e0d3,'metal');
  label('education11-roof-label','COLLEGE OF EDUCATION 11',front,front.length-13.85,-1.225,roof+.65,11.9,.7,signOwner,'#e0e0d3','#205291');

  const stairStart=.7,stairEnd=2.3,approachStart=.1;
  const topY=Math.max(...[entryA,center,entryB].map(s=>ground(front.point(s,stairStart))))+.08;
  const stepCount=Math.max(1,Math.ceil((topY-entryFloor)/.18)),steps:{n0:number;n1:number;y:number}[]=[];
  const approachY=Math.max(...[entryA,center,entryB].map(s=>ground(front.point(s,approachStart))))+.09;
  const approach=[at(front,entryA,approachY,approachStart),at(front,entryB,approachY,approachStart),at(front,entryB,topY,stairStart),at(front,entryA,topY,stairStart)];
  for(const indices of[[0,1,2],[0,2,3]]){const tri=indices.map(i=>approach[i]);part('entry-approach',[...tri,...tri.map(v=>v.clone().add(new THREE.Vector3(0,-.16,0)))],0xc0baaa);}
  for(let i=0;i<stepCount;i++){
    const n0=stairStart+(stairEnd-stairStart)*i/stepCount,n1=stairStart+(stairEnd-stairStart)*(i+1)/stepCount,y=topY+(entryFloor-topY)*i/stepCount;
    const step=box('entry-step',front,entryA,entryB,n0,n1,Math.min(entryFloor,ground(front.point(center,n1)))-.2,y,0xbab7a7);
    box('step-yellow-edge',front,entryA,entryB,n1-.09,n1,y,y+.003,0xc6a82e,'stone',step);
    for(let s=entryA;s<entryB;s+=.55)box('step-dark-mark',front,s,Math.min(s+.24,entryB),n1-.09,n1,y+.003,y+.005,0x343d38,'stone',step);
    steps.push({n0,n1,y});
  }
  const landing=box('entry-floor',front,entryA,entryB,stairEnd,6.1,entryFloor-.2,entryFloor,0xb9b6a8);
  for(let s=entryA;s<entryB;s+=.6)box('landing-joint',front,s,s+.009,stairEnd,6.1,entryFloor,entryFloor+.002,0x8a8f82,'stone',landing);
  for(const side of[-1,1]){
    const s=center+side*2.1,wall=part('entry-stair-side',[...[-.11,.11].flatMap(ds=>[at(front,s+ds,entryFloor-.22,stairStart),at(front,s+ds,entryFloor-.22,stairEnd),at(front,s+ds,entryFloor+.55,stairEnd),at(front,s+ds,topY+.55,stairStart)])],0xc8c5b5);
    beam('entry-handrail',at(front,s,topY+1.0,stairStart),at(front,s,entryFloor+1.0,stairEnd),.045,0x9da99c,wall);
    for(const t of[0,.5,1]){const n=stairStart+(stairEnd-stairStart)*t,y=topY+(entryFloor-topY)*t;beam('entry-handrail-post',at(front,s,y+.55,n),at(front,s,y+1,n),.04,0x9da99c,wall);}
  }
  const canopy=part('sloping-entry-canopy',[...[.4,3.15].flatMap(n=>[at(front,entryA-.25,entryFloor+2.88,n),at(front,entryB+.25,entryFloor+2.88,n),at(front,entryA-.25,entryFloor+3.12+(n-.4)*.12,n),at(front,entryB+.25,entryFloor+3.12+(n+2.6)*.12,n)])],0xdadcd0);
  for(let s=entryA+.5;s<entryB;s+=.9)beam('canopy-seam',at(front,s,entryFloor+3.13,.4),at(front,s,entryFloor+3.46,3.15),.012,0xa8b2a3,canopy);
  for(const s of[entryA,entryB])box('entry-column',front,s-.13,s+.13,2.0,2.3,entryFloor,entryFloor+3,0xd9dbcf);
  const doorHalf=1.18;
  for(const side of[-1,1]){
    const a=side<0?entryA:center+doorHalf,b=side<0?center-doorHalf:entryB;
    const glass=box('entry-sidelight',front,a,b,2.2,2.27,entryFloor+.08,entryFloor+2.75,0x5c7d72,'glass');
    for(const s of[a,b])box('entry-frame',front,s-.035,s+.035,2.1,2.29,entryFloor,entryFloor+2.8,0xbdc5b8,'metal',glass);
  }
  for(const s of[center-doorHalf,center+doorHalf]){const jamb=box('entry-jamb',front,s-.04,s+.04,2.1,2.29,entryFloor,entryFloor+2.8,0xbdc5b8,'metal');box('open-glass-door',front,s-.03,s+.03,2.3,3.5,entryFloor+.08,entryFloor+2.7,0x5c7d72,'glass',jamb);}
  box('entry-header',front,entryA,entryB,2.1,2.29,entryFloor+2.75,entryFloor+2.86,0xbdc5b8,'metal');
  box('entry-back',front,entryA,entryB,6.1,6.25,entryFloor,entryFloor+3,0x7d8377);
  box('entry-ceiling',front,entryA,entryB,2.29,6.25,entryFloor+2.88,entryFloor+3,0xc7cdc0);
  // 안내판의 확인된 동 번호와 건물명만 표시한다.
  for(const [i,text]of['H10 사범관 2','H11 사범관 3'].entries()){
    const s=entryA-2.6+i*1.15,n=.3,y=ground(front.point(s,n)),board=box('wayfinding-board',front,s-.5,s+.5,n-.12,n+.12,y+.3,y+1.9,0x234c79,'metal');
    for(const u of[s-.53,s+.53]){box('wayfinding-leg',front,u-.035,u+.035,n-.15,n+.15,y+.02,y+1.95,0xb8c1b3,'metal',board);box('wayfinding-foot',front,u-.08,u+.08,n-.4,n+.4,y,y+.06,0xa7b5a8,'metal',board);}
    label('education11-wayfinding-'+i,text,front,s,n-.131,y+1.64,.95,.22,board,'#234c79','#f5f5e8');
  }
  const lampS=entryA-4.6,lampN=.35,lampY=ground(front.point(lampS,lampN)),lamp=beam('twin-globe-lamp',at(front,lampS,lampY,lampN),at(front,lampS,lampY+4.4,lampN),.095,0x504d37);
  for(const side of[-1,1]){const s=lampS+side*.64;beam('lamp-arm',at(front,lampS,lampY+4.3,lampN),at(front,s,lampY+4.65,lampN),.055,0x504d37,lamp);const g=new THREE.SphereGeometry(.25,8,6),p=g.attributes.position,c=at(front,s,lampY+4.24,lampN);part('lamp-globe',Array.from({length:p.count},(_,i)=>new THREE.Vector3(p.getX(i),p.getY(i)*1.2,p.getZ(i)).add(c)),0xd4d9c9,'glass',lamp);g.dispose();}
  const entry={edge:2,center:front.point(center),floor:entryFloor,width:doorHalf*2,route:[front.point(center,-2.1),front.point(center,approachStart),front.point(center,stairStart),front.point(center,stairEnd),front.point(center,5.3)],steps,topY,positionEstimated:true,dimensionsEstimated:true,recessedForMappedRoadClearance:true,wholeInteriorImplemented:false};
  shell.userData.education11Exterior={buildingId:building.id,floor,roof,levels:4,levelsEstimated:true,dimensionsEstimated:true,observedEdges,unobservedEdges:[0,1,4],entry,eastFacadeSetbackForRoad:1,tower:{start:entryA,end:entryB,roof:towerRoof,dimensionsEstimated:true},wholeInteriorImplemented:false,connection12Implemented:false,roadviewMonth:'2025-07',sources:['https://map.snu.ac.kr/api/upload/default/F_BUILD_0000012.jpg','https://kko.to/wQwH5_Nx2t']};
  const meshes=batches.map(b=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(b.colors,3));g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:b.glass?.22:.68,side:THREE.DoubleSide}));mesh.name=b.glass?'education11-exterior-glass':'education11-exterior-surfaces';mesh.castShadow=!b.glass;mesh.receiveShadow=true;shell.add(mesh);return mesh;});
  shell.userData.education11Exterior.geometry={meshes:2+signs.length,textures:signs.length,triangles:signs.length*2+batches.reduce((n,b)=>n+b.positions.length/9,0),colliders:breakables.length};
  function update(_player:THREE.Vector3){batches.forEach((b,index)=>{const a=meshes[index].geometry.attributes.position as THREE.BufferAttribute,c=meshes[index].geometry.attributes.color as THREE.BufferAttribute;let moved=false,tinted=false;
    for(const p of b.parts){if(p.shown!==p.proxy.visible){p.shown=p.proxy.visible;moved=true;if(p.shown)(a.array as Float32Array).set(p.original,p.start);else for(let i=p.start;i<p.end;i+=3){a.array[i]=p.proxy.position.x;a.array[i+1]=p.proxy.position.y;a.array[i+2]=p.proxy.position.z;}}if(p.color!==p.proxy.material.color.getHex()){p.color=p.proxy.material.color.getHex();tinted=true;const t=p.proxy.material.color,scale=[t.r/p.base.r,t.g/p.base.g,t.b/p.base.b];for(let i=p.start;i<p.end;i++)c.array[i]=p.colors[i-p.start]*scale[(i-p.start)%3];}}
    if(moved)a.needsUpdate=true;if(tinted)c.needsUpdate=true;
  });for(const s of signs)s.mesh.visible=s.owner.visible;shell.visible=batches.some(b=>b.parts.some(p=>p.proxy.visible));}
  return{shell,breakables,update};
}

