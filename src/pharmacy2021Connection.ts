import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
import type { CampusBuilding } from './fullCampus';
import { humanities23Frame } from './humanities23Site';
import type { Pharmacy2021Layout } from './pharmacy2021Site';
type XZ=[number,number];type XYZ=[number,number,number];type Frame=ReturnType<typeof humanities23Frame>;type Proxy=THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
/** 2026년 7월 로드뷰의 연결교, 열린 하부와 계단을 근사한다. */
export function createPharmacy2021Connection(scene:THREE.Scene,building:CampusBuilding,q:Pharmacy2021Layout){
 const shell=new THREE.Group();shell.name='landmark/pharmacy2021-connection';Object.assign(shell.userData,{role:'building-shell',buildingId:building.id,mappedOutline:building.points});scene.add(shell);
 const distant=new THREE.Group();distant.name=building.id+':pharmacy2021-distant';distant.visible=false;Object.assign(distant.userData,{role:'distant-building',buildingId:building.id});scene.add(distant);
  const breakables: BreakableSpec[] = [];
  const batches = [false, true].map(glass => ({ glass, positions: [] as number[], colors: [] as number[], parts: [] as { proxy: Proxy; start: number; end: number; original: Float32Array; colors: Float32Array; base: THREE.Color; color: number; shown: boolean }[] }));
  const at = (f: Frame, s: number, y: number, n = 0) => { const p = f.point(s, n); return new THREE.Vector3(p[0], y, p[1]); };
  function part(name: string, vertices: THREE.Vector3[], color: number, material: BreakableSpec['material'] = 'stone', owner?: Proxy, flat = false) {
    const bounds = new THREE.Box3().setFromPoints(vertices), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const g = flat ? new THREE.BufferGeometry() : new ConvexGeometry(vertices.map(p => p.clone().sub(center)));
    if (flat) { const values: number[] = []; for (let i = 1; i + 1 < vertices.length; i++) for (const p of [vertices[0], vertices[i], vertices[i + 1]]) values.push(...p.clone().sub(center).toArray()); g.setAttribute('position', new THREE.Float32BufferAttribute(values, 3)); }
    const attr = g.attributes.position, proxy = owner ?? new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color }));
    if (!owner) { proxy.position.copy(center); proxy.updateMatrixWorld(true); Object.assign(proxy.userData, { buildingId: building.id, component: name, renderProxy: true, convex: true }); breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attr.array), toughness: material === 'glass' ? 2 : 8, material, label: '20동과 21동 연결부' }); }
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


 const f=q.f,routes:Record<string,XYZ[]>={},pavementMasks:{component:string;polygon:XZ[]}[]=[];
 const xyz=(s:number,y:number,n:number):XYZ=>at(f,s,y,n).toArray() as XYZ;
 const curved=(s:number)=>-1.4*Math.sin(Math.PI*s/f.length);
 function floorPolygon(name:string,polygon:XZ[],y:number,depth=.22,color=0xc2b6a8){for(const t of THREE.ShapeUtils.triangulateShape(polygon.map(p=>new THREE.Vector2(...p)),[])){const top=t.map(i=>new THREE.Vector3(polygon[i][0],y,polygon[i][1]));part(name,[...top,...top.map(p=>p.clone().add(new THREE.Vector3(0,-depth,0)))],color);}}
 function pane(name:string,frame:Frame,a:number,b:number,n:number,y0:number,y1:number,color=0x7c9f9f){const owner=box(name,frame,a,b,n-.04,n+.04,y0,y1,color,'glass');for(let s=a;s<b+.01;s+=1.2)box('glass-mullion',frame,s-.025,s+.025,n-.085,n+.085,y0,y1,0x778c7e,'metal',owner);for(const y of[y0,y0+(y1-y0)*.55,y1])box('glass-transom',frame,a,b,n-.085,n+.085,y-.025,y+.025,0x7b8d7e,'metal',owner);return owner;}
 floorPolygon('lower-corridor-floor',q.lowerPolygon,q.floor);
 const ends=[q.lowerPolygon.slice(0,2),[q.lowerPolygon[3],q.lowerPolygon[2]]];
 for(const[a,b]of ends){const fr=humanities23Frame(a,b);pane('lower-corridor-glass',fr,0,fr.length,0,q.floor+.12,q.pinkFloor-.2);box('lower-corridor-white-band',fr,0,fr.length,-.14,.14,q.floor,q.floor+.16,0xc3ccbd);}
 const upperOutline=[...Array.from({length:17},(_,i)=>f.point(f.length*i/16,curved(f.length*i/16))),q.polygon[2],q.polygon[3]];
 for(const y of[q.pinkFloor,q.pinkFloor+3.5,q.roof])floorPolygon(y===q.roof?'connector-roof':'upper-exhibition-floor',upperOutline,y,.24,0xbbaea3);
 for(let level=0;level<2;level++){const y=q.pinkFloor+level*3.5;
  for(let i=0;i<16;i++){const a=f.length*i/16,b=f.length*(i+1)/16,fr=humanities23Frame(f.point(a,curved(a)),f.point(b,curved(b))),mid=(a+b)/2;
   const pier=mid<1.8||mid>f.length-1.1||(mid>8.5&&mid<9.6);
   if(pier){const owner=box('pink-cladding-pier',fr,0,fr.length,-.13,.22,y,y+3.5,0xc4aa9a);for(let h=y;h<y+3.5;h+=.65)facet('pink-panel-joint',fr,0,fr.length,h,h+.01,-.136,0x8e8d80,owner);}
   else if(mid<8.5){const rail=pane('curved-balcony-glass',fr,0,fr.length,-.05,y+.14,y+1.18,0x94b5b2);beam('balcony-cap',at(fr,0,y+1.2,-.05),at(fr,fr.length,y+1.2,-.05),.035,0xb5c2b0,rail);}
   else pane('upper-front-window',fr,0,fr.length,0,y+.18,y+3.18);
   box('pink-front-band',fr,0,fr.length,-.14,.25,y,y+.18,0xc4aa9a);if(level===1)box('pink-roof-band',fr,0,fr.length,-.14,.25,y+3.18,y+3.5,0xc4aa9a);
  }
  pane('balcony-back-glass',f,1.8,8.5,1.6,y+.16,y+3.25,0x576f68);
  const divider=box('pink-dividing-fin',f,8.65,9.1,-2,1.8,y,y+3.5,0xb5a08e);box('balcony-ceiling-light',f,4.6,5.2,.1,.7,y+3.24,y+3.29,0xd6dfc7,'metal',divider);
 }
 const rear=humanities23Frame(q.polygon[3],q.polygon[2]);
 for(let level=0;level<2;level++){const y=q.pinkFloor+level*3.5;const glass=pane('rear-curtain-glass',rear,0,rear.length,0,y+.08,y+3.46,0x9fbab0);for(let s=.8;s<rear.length;s+=3.6)facet('rear-gold-vent',rear,s,s+.35,y+.5,y+.8,-.09,0xa79866,glass);}
 for(const [fr,side]of[[q.door20,1],[q.door21,-1]] as[Frame,number][])for(let level=0;level<2;level++)box('connector-end-wall',fr,0,fr.length,-.12,.12,q.pinkFloor+level*3.5,q.pinkFloor+(level+1)*3.5,0xb1aaa0);
 // 사진에서 열린 하부와 뒤쪽 계단이 보인다. 실측 높이 대신 주변 게임 지형에 연결한다.
 const pad=box('underpass-paving',f,1,f.length-1,-3,3.8,q.ground-.22,q.ground,0xa9b2a3);
 for(let s=1;s<f.length-1;s+=.6)box('paving-joint',f,s,s+.008,-3,3.8,q.ground,q.ground+.002,0x6e7f6b,'stone',pad);
 for(let n=-3;n<3.8;n+=.6)box('paving-joint',f,1,f.length-1,n,n+.008,q.ground,q.ground+.002,0x6e7f6b,'stone',pad);

 for(const[a,b]of[[1,q.center-q.width/2-.18],[q.center+q.width/2+.18,f.length-1]])box('underpass-retaining-wall',f,a,b,3.65,3.9,q.ground-.2,q.pinkFloor-.24,0x969d90);
 for(const u of[q.center-q.width/2-.18,q.center+q.width/2+.18])for(let n=3.8;n<10;n+=1){const end=Math.min(n+1,10),top=Math.max(q.stairHeight(end)+.14,q.floor-.25);box('stair-retaining-wall',f,u-.09,u+.09,n,end,q.ground-.2,top,0x939c8e);}
 const underpass:XYZ[]=[xyz(q.center,q.roadEnds[0].y,q.roadEnds[0].n),xyz(q.center,q.frontY,-14)];
 for(let k=1;k<q.profile.length;k++){const a=q.profile[k-1],b=q.profile[k];if(a.n===-3&&b.n===4.6){box('stair-lower-landing',f,q.center-q.width/2,q.center+q.width/2,a.n,b.n,q.ground-.22,q.ground,0xaab3a3);underpass.push(xyz(q.center,q.ground,b.n));continue;}
  const rise=b.y-a.y,isStair=a.n>=4.6&&a.n<14.5&&Math.abs(rise)>.01,count=isStair?Math.ceil(Math.abs(rise)/.17):1;
  for(let i=0;i<count;i++){const n0=a.n+(b.n-a.n)*i/count,n1=a.n+(b.n-a.n)*(i+1)/count,y0=isStair?a.y+rise*(i+1)/count:a.y,y1=a.y+rise*(i+1)/count,top=[at(f,q.center-q.width/2,y0,n0),at(f,q.center+q.width/2,y0,n0),at(f,q.center+q.width/2,y1,n1),at(f,q.center-q.width/2,y1,n1)],owner=part(isStair?'rear-stair-tread':'stair-approach',[...top,...top.map(p=>p.clone().add(new THREE.Vector3(0,-.23,0)))],0xabb4a4);
   if(isStair)box('stair-nosing',f,q.center-q.width/2,q.center+q.width/2,n0,n0+.04,y1,y1+.005,0xd5dbc6,'stone',owner);
   underpass.push(xyz(q.center,(y0+y1)/2,(n0+n1)/2));
  }
  underpass.push(xyz(q.center,b.y,b.n));
 }
 underpass.push(xyz(q.center,q.roadEnds[1].y,q.roadEnds[1].n));routes.underpassStairs=underpass;
 for(const s of[q.center-q.width/2-.08,q.center+q.width/2+.08])for(let k=3;k<q.profile.length;k++){const a=q.profile[k-1],b=q.profile[k],owner=beam('rear-stair-handrail',at(f,s,a.y+1,a.n),at(f,s,b.y+1,b.n),.035,0xb8c4b0);for(let n=a.n;n<=b.n;n+=.7){const y=q.stairHeight(n);beam('rear-stair-post',at(f,s,y,n),at(f,s,y+1,n),.025,0xc2cbb7,owner);}}
 for(const s of[3.6,f.length-3.6])for(const n of[-1.1,8.9])beam('white-round-pier',at(f,s,q.ground,n),at(f,s,q.pinkFloor-.1,n),.25,0xd2d9c8);
 for(const [name,fr,s,side]of[['20',q.door20,q.s20,1],['21',q.door21,q.s21,-1]] as[string,Frame,number,number][]){const n0=Math.min(0,side*3.2),n1=Math.max(0,side*3.2);box('corridor-vestibule-floor',fr,s-1.25,s+1.25,n0-.1,n1+.1,q.floor-.2,q.floor,0xc0c8b7);for(const u of[s-1.25,s+1.25]){box('corridor-vestibule-side',fr,u-.07,u+.07,n0,n1,q.floor,q.floor+2.85,0xbec8b4);const owner=box('corridor-door-jamb',fr,u-.05,u+.05,-.4,.4,q.floor,q.floor+2.8,0x9baea0,'metal');box('open-corridor-door',fr,u-.025,u+.025,Math.min(side*.5,side*1.6),Math.max(side*.5,side*1.6),q.floor+.04,q.floor+2.7,0x819e90,'glass',owner);}box('corridor-vestibule-back',fr,s-1.25,s+1.25,side*3.2-.08,side*3.2+.08,q.floor,q.floor+2.85,0xb6c2ac);box('corridor-vestibule-ceiling',fr,s-1.25,s+1.25,n0,n1,q.floor+2.85,q.floor+3,0xc2ccb8);routes['door'+name]=[at(fr,s,q.floor,-side*.7).toArray(),at(fr,s,q.floor,side*2.5).toArray()]as XYZ[];}
 routes.corridor=[routes.door20[1],routes.door20[0],routes.door21[0],routes.door21[1]];
 routes.frontWalk=q.walk.map(v=>[v.p[0],v.y,v.p[1]]);
 for(let i=1;i<q.walk.length-1;i++){const a=q.walk[i-1],b=q.walk[i],fr=humanities23Frame(a.p,b.p),top=[at(fr,0,a.y,-1),at(fr,fr.length,b.y,-1),at(fr,fr.length,b.y,1),at(fr,0,a.y,1)],owner=part('front-sidewalk',[...top,...top.map(p=>p.clone().add(new THREE.Vector3(0,-.22,0)))],0xb0b7a8);for(let s=0;s<fr.length;s+=.5){const y=a.y+(b.y-a.y)*s/fr.length;part('sidewalk-joint',[at(fr,s,y+.003,-1),at(fr,s+.008,y+.003,-1),at(fr,s+.008,y+.003,1),at(fr,s,y+.003,1)],0x778572,'stone',owner,true);}pavementMasks.push({component:'front-sidewalk',polygon:[fr.point(0,-1),fr.point(fr.length,-1),fr.point(fr.length,1),fr.point(0,1)]});}
 pavementMasks.push({component:'underpass-paving',polygon:[f.point(1,-3),f.point(f.length-1,-3),f.point(f.length-1,3.8),f.point(1,3.8)]},{component:'rear-stairs',polygon:[f.point(q.center-1.5,-14),f.point(q.center+1.5,-14),f.point(q.center+1.5,20),f.point(q.center-1.5,20)]});
 const rack=box('bicycle-rack-base',f,.5,4,-3.5,-3.25,q.ground-.02,q.ground+.06,0x7e9683,'metal');for(let s=.7;s<4;s+=.45){beam('bicycle-rack-upright',at(f,s,q.ground,-3.45),at(f,s,q.ground+.6,-3.45),.022,0xafc1ad,rack);beam('bicycle-rack-loop',at(f,s,q.ground+.6,-3.45),at(f,s,q.ground+.6,-2.7),.025,0xafc1ad,rack);beam('bicycle-rack-upright',at(f,s,q.ground+.6,-2.7),at(f,s,q.ground,-2.7),.022,0xafc1ad,rack);}
 const drain=box('front-drain',f,q.center-1.5,q.center+1.5,-3.1,-2.9,q.ground-.03,q.ground+.004,0x4d6555,'metal');for(let s=q.center-1.5;s<q.center+1.5;s+=.15)box('drain-grating',f,s,s+.025,-3.1,-2.9,q.ground+.004,q.ground+.012,0x9daf98,'metal',drain);
 const meshes=batches.map(b=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(b.colors,3));g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:b.glass?.25:.76,side:THREE.DoubleSide,transparent:b.glass,opacity:b.glass?.5:1}));mesh.name=b.glass?'pharmacy2021-glass':'pharmacy2021-surfaces';mesh.castShadow=!b.glass;mesh.receiveShadow=true;shell.add(mesh);return mesh;});
 shell.userData.pharmacy2021Access={buildingId:building.id,routes,pavementMasks,floor:q.floor,ground:q.ground,pinkFloor:q.pinkFloor,roof:q.roof,stairWidth:q.width,profile:q.profile,roadEnds:q.roadEnds,polygon:q.polygon,dimensionsEstimated:true,wholeInteriorImplemented:false,rawOutlinePreserved:true,roadviewMonth:'2026-07',upperBalconyLevels:2,geometry:{meshes:2,textures:0,triangles:batches.reduce((n,b)=>n+b.positions.length/9,0),colliders:breakables.length}};
 function update(_player:THREE.Vector3){batches.forEach((b,index)=>{const a=meshes[index].geometry.attributes.position as THREE.BufferAttribute,c=meshes[index].geometry.attributes.color as THREE.BufferAttribute;let moved=false,tinted=false;for(const p of b.parts){if(p.shown!==p.proxy.visible){p.shown=p.proxy.visible;moved=true;if(p.shown)(a.array as Float32Array).set(p.original,p.start);else for(let i=p.start;i<p.end;i+=3){a.array[i]=p.proxy.position.x;a.array[i+1]=p.proxy.position.y;a.array[i+2]=p.proxy.position.z;}}if(p.color!==p.proxy.material.color.getHex()){p.color=p.proxy.material.color.getHex();tinted=true;const t=p.proxy.material.color,scale=[t.r/p.base.r,t.g/p.base.g,t.b/p.base.b];for(let i=p.start;i<p.end;i++)c.array[i]=p.colors[i-p.start]*scale[(i-p.start)%3];}}if(moved)a.needsUpdate=true;if(tinted)c.needsUpdate=true;});shell.visible=batches.some(b=>b.parts.some(p=>p.proxy.visible));}
 // 렌더 버퍼와 복원용 사본을 만든 뒤 조립용 배열을 비운다.
 for(const batch of batches){batch.positions.length=0;batch.colors.length=0;}
 return {shell,breakables,update};
}
