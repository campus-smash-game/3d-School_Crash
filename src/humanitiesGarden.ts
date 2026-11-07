import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { BreakableSpec } from './scene';
type XZ = [number, number];
type XYZ = [number, number, number];
export const HUMANITIES_GARDEN = {
  buildingIds: ['way/167984624', 'way/167983080'],
  route: [[397.1,-726.88],[394,-720],[389,-712],[386.5,-704],[387.5,-696],[389.6825,-686.7725],[399.5,-690.5],[407.915,-693.695],[411,-696],[421.5,-702.25]] as XZ[],
  pergola: [399.5,-690.5] as XZ,
  routeWidth: 2.8,
};
export function createHumanitiesGarden(scene: THREE.Scene) {
  const at = (x: number, y: number, z = 0) => new THREE.Vector3(x,y,z);
  const area = (p: XYZ[]) => p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a[0]*b[2]-b[0]*a[2];},0);
  const clip = (p: XYZ[], distance: (p:XYZ)=>number) => {
    const out: XYZ[]=[];
    for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],da=distance(a),db=distance(b);if(da>=-1e-8)out.push(a);if((da>=-1e-8)!==(db>=-1e-8))out.push(a.map((v,k)=>v+(b[k]-v)*da/(da-db)) as XYZ);}return out;
  };
  const planes=(p:XZ[])=>{const sign=Math.sign(area(p.map(q=>[q[0],0,q[1]])));return p.map((a,i)=>{const b=p[(i+1)%p.length];return(q:XYZ)=>sign*((b[0]-a[0])*(q[2]-a[1])-(b[1]-a[1])*(q[0]-a[0]));});};
  const bounds=(p:XYZ[])=>({x0:Math.min(...p.map(q=>q[0])),x1:Math.max(...p.map(q=>q[0])),z0:Math.min(...p.map(q=>q[2])),z1:Math.max(...p.map(q=>q[2]))});
  const overlaps=(a:ReturnType<typeof bounds>,b:ReturnType<typeof bounds>)=>a.x1>=b.x0&&a.x0<=b.x1&&a.z1>=b.z0&&a.z0<=b.z1;
  const terrain=scene.getObjectByName('campus-terrain') as THREE.Mesh<THREE.BufferGeometry>;if(!terrain)throw Error('Garden requires actual terrain.');
  const triangles:XYZ[][]=[],attr=terrain.geometry.attributes.position,index=terrain.geometry.index;
  for(let i=0;i<(index?.count??attr.count);i+=3){const tri=[0,1,2].map(j=>{const k=index?index.getX(i+j):i+j;return[attr.getX(k),attr.getY(k),attr.getZ(k)] as XYZ;});if(overlaps(bounds(tri),{x0:375,x1:432,z0:-735,z1:-675}))triangles.push(tri);}
  const ground=(x:number,z:number)=>{for(const[a,b,c]of triangles){const det=(b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]),u=((x-a[0])*(c[2]-a[2])-(z-a[2])*(c[0]-a[0]))/det,v=((b[0]-a[0])*(z-a[2])-(b[2]-a[2])*(x-a[0]))/det;if(u>=-1e-7&&v>=-1e-7&&u+v<=1.0000001)return a[1]+u*(b[1]-a[1])+v*(c[1]-a[1]);}throw Error(`Garden sample outside terrain: ${x},${z}`);};
  const shell=new THREE.Group();shell.name='connection/humanities-garden';Object.assign(shell.userData,{role:'campus-connection',connectionId:shell.name,buildingId:'way/167983080'});scene.add(shell);
  const positions: number[] = [], colors: number[] = [], breakables: BreakableSpec[] = [];
  type Proxy = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  const parts: { proxy: Proxy; start: number; end: number; original: Float32Array; originalColors: Float32Array; base: THREE.Color; color: number; shown: boolean }[] = [];
  function component(name: string, vertices: THREE.Vector3[], color: number, material: BreakableSpec['material'] = 'stone', owner?: Proxy) {
    const bounds = new THREE.Box3().setFromPoints(vertices), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const geometry = new ConvexGeometry(vertices.map(p => p.clone().sub(center))), attribute = geometry.getAttribute('position');
    const proxy = owner ?? new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: .9 }));
    if (!owner) {
      proxy.position.copy(center); proxy.updateMatrixWorld(true);
      Object.assign(proxy.userData, { buildingId: 'way/167983080', connectionId: shell.name, component: name, convex: true, renderProxy: true });
      breakables.push({ mesh: proxy, size, collisionVertices: Float32Array.from(attribute.array), material, label: '아방궁 쉼터', toughness: material === 'wood' ? 4 : 8 });
    }
    const start = positions.length, tint = new THREE.Color(color);
    for (let i = 0; i < attribute.count; i++) { positions.push(attribute.getX(i) + center.x, attribute.getY(i) + center.y, attribute.getZ(i) + center.z); colors.push(tint.r, tint.g, tint.b); }
    parts.push({ proxy, start, end: positions.length, original: Float32Array.from(positions.slice(start)), originalColors: Float32Array.from(colors.slice(start)), base: proxy.material.color.clone(), color: proxy.material.color.getHex(), shown: true });
    if (owner) geometry.dispose(); return proxy;
  }
  function box(name: string, s0: number, s1: number, n0: number, n1: number, y0: number, y1: number, color: number, material: BreakableSpec['material'] = 'stone', owner?: Proxy) {
    const vertices: THREE.Vector3[] = [];
    for (const s of [s0, s1]) for (const n of [n0, n1]) for (const y of [y0, y1]) vertices.push(at(s, y, n));
    return component(name, vertices, color, material, owner);
  }
  function beam(name: string, a: THREE.Vector3, b: THREE.Vector3, w: number, d: number, color: number, material: BreakableSpec['material'] = 'wood') {
    const direction = b.clone().sub(a), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize()), center = a.clone().add(b).multiplyScalar(.5), vertices: THREE.Vector3[] = [];
    for (const x of [-w / 2, w / 2]) for (const y of [-direction.length() / 2, direction.length() / 2]) for (const z of [-d / 2, d / 2]) vertices.push(new THREE.Vector3(x, y, z).applyQuaternion(q).add(center));
    return component(name, vertices, color, material);
  }

  const {route,routeWidth,pergola}=HUMANITIES_GARDEN,axis:XZ=[.935,-.355],side:XZ=[.355,.935];
  const gp=(u:number,v:number):XZ=>[pergola[0]+axis[0]*u+side[0]*v,pergola[1]+axis[1]*u+side[1]*v];
  const strip=(a:XZ,b:XZ,width:number):XZ[]=>{const l=Math.hypot(b[0]-a[0],b[1]-a[1]),nx=-(b[1]-a[1])/l*width/2,nz=(b[0]-a[0])/l*width/2;return[[a[0]+nx,a[1]+nz],[a[0]-nx,a[1]-nz],[b[0]-nx,b[1]-nz],[b[0]+nx,b[1]+nz]];};
  const zones=route.slice(0,-1).map((a,i)=>strip(a,route[i+1],routeWidth));
  for(const p of route.slice(1,-1))zones.push(Array.from({length:12},(_,i)=>[p[0]+Math.cos(i*Math.PI/6)*routeWidth/2,p[1]+Math.sin(i*Math.PI/6)*routeWidth/2] as XZ));
  zones.push([gp(-7.5,-2.55),gp(7.5,-2.55),gp(7.5,2.55),gp(-7.5,2.55)]);
  const zones3=zones.map(p=>p.map(q=>[q[0],0,q[1]] as XYZ));
  const subtract=(polygon:XYZ[],mask:XZ[])=>{const ps=planes(mask),inside=ps.reduce((p,f)=>clip(p,f),polygon);if(inside.length<3||Math.abs(area(inside))<1e-8)return[polygon];const out:XYZ[][]=[];let rest=polygon;for(const f of ps){const piece=clip(rest,p=>-f(p));if(piece.length>=3&&Math.abs(area(piece))>1e-8)out.push(piece);rest=clip(rest,f);}return out;};
  // 불규칙한 돌 무늬는 한 바닥 충돌체에 묶는다. 사진을 텍스처로 복제하지 않는다.
  const seed=(x:number,z:number)=>{let n=Math.imul(x+10731,374761393)^Math.imul(z-3389,668265263);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967295;};
  const sites: {x:number;z:number;ix:number;iz:number}[]=[];
  for(let ix=378;ix<=427;ix++)for(let iz=-730;iz<=-680;iz++)sites.push({x:ix+(seed(ix,iz)-.5)*.5,z:iz+(seed(iz,ix)-.5)*.5,ix,iz});
  const cells=sites.map(site=>{let p:XYZ[]=[[site.x-1.4,0,site.z-1.4],[site.x+1.4,0,site.z-1.4],[site.x+1.4,0,site.z+1.4],[site.x-1.4,0,site.z+1.4]];for(const other of sites){if(other===site||Math.abs(other.ix-site.ix)>2||Math.abs(other.iz-site.iz)>2)continue;const mx=(site.x+other.x)/2,mz=(site.z+other.z)/2,dx=other.x-site.x,dz=other.z-site.z;p=clip(p,q=>-(q[0]-mx)*dx-(q[2]-mz)*dz);}p=p.map(q=>[site.x+(q[0]-site.x)*.89,0,site.z+(q[2]-site.z)*.89] as XYZ);return{p,b:bounds(p),color:[0xb4b4aa,0xc7bfab,0xaaaead,0xc1c2b7][Math.floor(seed(site.ix+4,site.iz+7)*4)%4]};});
  let pavingParts=0;
  zones.forEach((zone,zi)=>{
    const zb=bounds(zones3[zi]);
    for(const tri of triangles){if(!overlaps(bounds(tri),zb))continue;const initial=planes(zone).reduce((p,f)=>clip(p,f),tri);if(initial.length<3||Math.abs(area(initial))<1e-7)continue;let patches=[initial];for(let i=0;i<zi;i++)patches=patches.flatMap(p=>subtract(p,zones[i]));
      for(const p of patches){if(p.length<3||Math.abs(area(p))<1e-7)continue;const top=p.map(q=>at(q[0],q[1]+.045,q[2])),owner=component('garden-paving',[...top,...top.map(q=>q.clone().add(new THREE.Vector3(0,-.12,0)))],0xb99c6f);pavingParts++;const pb=bounds(p),outline=p.map(q=>[q[0],q[2]] as XZ);
        for(const cell of cells){if(!overlaps(pb,cell.b))continue;const cut=planes(outline).reduce((q,f)=>clip(q,f),cell.p);if(cut.length<3||Math.abs(area(cut))<1e-7)continue;const stone=cut.map(q=>at(q[0],ground(q[0],q[2])+.049,q[2]));component('flagstone-pattern',[...stone,...stone.map(q=>q.clone().add(new THREE.Vector3(0,-.002,0)))],cell.color,'stone',owner);}
      }
    }
  });
  function obox(name:string,u:number,v:number,w:number,d:number,y0:number,y1:number,color:number,material:BreakableSpec['material']='wood',owner?:Proxy){const vertices:THREE.Vector3[]=[];for(const du of[-w/2,w/2])for(const dv of[-d/2,d/2])for(const y of[y0,y1]){const p=gp(u+du,v+dv);vertices.push(at(p[0],y,p[1]));}return component(name,vertices,color,material,owner);}
  function cylinder(name:string,p:XZ,y:number,h:number,r:number,color:number,material:BreakableSpec['material']='metal',owner?:Proxy){const g=new THREE.CylinderGeometry(r,r,h,8),a=g.attributes.position,center=at(p[0],y+h/2,p[1]);const value=component(name,Array.from({length:a.count},(_,i)=>new THREE.Vector3(a.getX(i),a.getY(i),a.getZ(i)).add(center)),color,material,owner);g.dispose();return value;}
  const pergolaFloor=(u:number,v:number)=>{const p=gp(u,v);return ground(...p)+.045;};
  // 사진의 평평한 쉼터 바닥을 따른다. 기둥과 등나무 틀의 높이, 간격은 실측값이 아니다.
  const postUs=[-7,-2.35,2.35,7];
  for(const u of postUs)for(const v of[-2.2,2.2]){const y=pergolaFloor(u,v),post=obox('pergola-brick-pier',u,v,.4,.4,y-.14,y+2.75,0x945542,'stone');for(let dy=.18;dy<2.75;dy+=.18)obox('pier-mortar',u,v,.405,.405,y+dy,y+dy+.012,0xc1b69d,'stone',post);}
  for(const v of[-2.2,2.2])for(let i=1;i<postUs.length;i++){const a=gp(postUs[i-1]-.12,v),b=gp(postUs[i]+.12,v);beam('pergola-long-beam',at(a[0],pergolaFloor(postUs[i-1],v)+2.74,a[1]),at(b[0],pergolaFloor(postUs[i],v)+2.74,b[1]),.20,.20,0x484a3f);}
  for(let u=-7.25;u<=7.26;u+=.8){
    const a=gp(u,-2.5),b=gp(u,2.5),owner=beam('pergola-cross-beam',at(a[0],pergolaFloor(u,-2.2)+2.89,a[1]),at(b[0],pergolaFloor(u,2.2)+2.89,b[1]),.12,.12,0x595649);
    for(let v=-2.1;v<2.2;v+=.7){const p=gp(u+.12*Math.sin(v*3+u),v),leaf=new THREE.IcosahedronGeometry(1,0),a=leaf.attributes.position;component('pergola-vine',Array.from({length:a.count},(_,i)=>at(p[0]+a.getX(i)*.4,pergolaFloor(u,v)+3.02+a.getY(i)*.13,p[1]+a.getZ(i)*.44)),0x6f8150,'wood',owner);leaf.dispose();}
  }
  const benches=[];
  for(const u of[-4.6,0,4.6]){const v=1.65,y=pergolaFloor(u,v);const seat=obox('garden-bench-seat',u,v,3.8,.52,y+.43,y+.53,0x78533d);for(let j=0;j<4;j++)obox('bench-seat-slat',u,v+(j-1.5)*.13,3.8,.11,y+.53,y+.54,0x9b6a43,'wood',seat);const back=obox('garden-bench-back',u,v+.28,3.8,.1,y+.55,y+1.10,0x78533d);for(let j=0;j<4;j++)obox('bench-back-slat',u,v+.34,3.8,.025,y+.59+j*.125,y+.68+j*.125,0x976643,'wood',back);for(const du of[-1.35,1.35])obox('garden-bench-leg',u+du,v,.12,.44,pergolaFloor(u+du,v),y+.46,0x45493c,'metal');benches.push(gp(u,v));}
  const distanceToRoute=(p:XZ)=>Math.min(...route.slice(0,-1).map((a,i)=>{const b=route[i+1],dx=b[0]-a[0],dz=b[1]-a[1],t=THREE.MathUtils.clamp(((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz),0,1);return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz);}));
  const bollards:XZ[]=[[390.2,-720.5],[385.5,-715],[382.9,-707],[383.8,-700],[385.2,-692.2],[389.4,-686.6],[405.6,-696.2],[414.1,-700.7]];
  for(const p of bollards){const y=ground(...p),post=cylinder('garden-bollard',p,y,.78,.075,0x50524c);cylinder('bollard-diffuser',p,y+.62,.14,.078,0xe2e4d4,'glass',post);}
  const lp:XZ=[384,-715.5],ly=ground(...lp),lamp=cylinder('garden-dish-lamp',lp,ly,3.25,.075,0x4c3a30);const dish=new THREE.ConeGeometry(.36,.15,12),da=dish.attributes.position;component('lamp-dish',Array.from({length:da.count},(_,i)=>at(lp[0]+da.getX(i),ly+3.25+da.getY(i),lp[1]+da.getZ(i))),0x555c55,'metal',lamp);dish.dispose();
  const shrubs:XZ[]=[[385.7,-719],[382.8,-709.5],[382.6,-698],[393,-699],[400,-700.2],[408.4,-688.1]];
  for(let i=0;i<shrubs.length;i++){const p=shrubs[i];if(distanceToRoute(p)<1.7)continue;const y=ground(...p),h=i<2?2.2:.7,shape=new THREE.ConeGeometry(i<2?.85:1.15,h,7),a=shape.attributes.position;component('garden-shrub',Array.from({length:a.count},(_,k)=>at(p[0]+a.getX(k),y+h/2+a.getY(k),p[1]+a.getZ(k))),i<2?0x4b703c:0x87935b,'wood');shape.dispose();}
  const rocks:XZ[]=[[392,-717],[390.5,-707.5],[390,-702],[407,-704],[413,-691],[393,-684]];
  for(let i=0;i<rocks.length;i++){const p=rocks[i];if(distanceToRoute(p)<2)continue;const y=ground(...p),rock=new THREE.IcosahedronGeometry(1,0),a=rock.attributes.position;component('garden-rock',Array.from({length:a.count},(_,k)=>at(p[0]+a.getX(k)*(.65+i%2*.35),y+.3+a.getY(k)*.45,p[1]+a.getZ(k)*.75)),0x9c9985);rock.dispose();}
  const trees:XZ[]=[[381.5,-706],[392,-702],[412,-686.8],[405,-705.5]];
  for(let i=0;i<trees.length;i++){const p=trees[i];if(distanceToRoute(p)<2)continue;const y=ground(...p),trunk=cylinder('garden-tree',p,y,5.2,.16,0x655139,'wood');for(let j=0;j<3;j++){const shape=new THREE.IcosahedronGeometry(1,1),a=shape.attributes.position,offset=j-1;component('garden-tree-crown',Array.from({length:a.count},(_,k)=>at(p[0]+offset*1.1+a.getX(k)*1.8,y+4.7+(j%2)*1.1+a.getY(k)*1.55,p[1]+offset*.45+a.getZ(k)*1.8)),[0x718350,0x7d8c56,0x687d48][j],'wood',trunk);shape.dispose();}}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();(geometry.attributes.position as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:.94}));mesh.name='humanities-garden-surfaces';mesh.receiveShadow=true;mesh.castShadow=true;shell.add(mesh);
  shell.userData.humanitiesGarden={...HUMANITIES_GARDEN,routeEstimated:true,terrainChanged:true,rawDEMChanged:false,rawRoadsChanged:false,pergolaFloorFollowsGameSlope:false,pavementMasks:zones.map((polygon,i)=>({component:'garden-paving-'+i,polygon})),benches,bollards,geometry:{parts:parts.length,colliders:breakables.length,triangles:positions.length/9,meshes:1,textures:0},pavingParts,photoSource:'https://humanities.snu.ac.kr/community/newsletter?md=download&seqidx=63',printedPage:29,wholeBuildingReconstructed:false};
  function update(_player: THREE.Vector3) {
    const a = geometry.attributes.position as THREE.BufferAttribute, c = geometry.attributes.color as THREE.BufferAttribute; let changed = false, recolored = false;
    for (const part of parts) {
      if (part.shown !== part.proxy.visible) { part.shown = part.proxy.visible; changed = true; if (part.shown) (a.array as Float32Array).set(part.original, part.start); else for (let i = part.start; i < part.end; i += 3) { a.array[i] = part.proxy.position.x; a.array[i + 1] = part.proxy.position.y; a.array[i + 2] = part.proxy.position.z; } }
      const tint = part.proxy.material.color;
      if (part.color !== tint.getHex()) { part.color = tint.getHex(); recolored = true; const scale = [tint.r / part.base.r, tint.g / part.base.g, tint.b / part.base.b]; for (let i = part.start; i < part.end; i++) c.array[i] = part.originalColors[i - part.start] * scale[(i - part.start) % 3]; }
    }
    if (changed) a.needsUpdate = true; if (recolored) c.needsUpdate = true; shell.visible = parts.some(p => p.proxy.visible);
  }


  return { shell, breakables, update };
}
