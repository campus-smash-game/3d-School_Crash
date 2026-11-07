import * as THREE from 'three';

type V=THREE.Vector3;
type Surface='stone'|'details'|'glass';
export type EducationNorthTriangle={vertices:[V,V,V];color:number;surface:Surface};
export type EducationNorthPart={component:string;material:'stone'|'metal'|'glass';triangles:EducationNorthTriangle[];extra:Record<string,unknown>};
export type EducationNorthDoor={id:string;sourceNode:string;sourceEdges:number[];origin:V;tangent:V;outward:V;width:number;height:number;floor:number;component:string};
const up=new THREE.Vector3(0,1,0),clamp=(x:number)=>THREE.MathUtils.clamp(x,0,1);
const point=(o:V,t:V,n:V,s:number,d:number,y:number)=>o.clone().addScaledVector(t,s).addScaledVector(n,d).setY(y);

/** 원본 입구와 계단선은 보존한다. 문 치수와 바닥 높이는 현재 게임 지형에 맞춘 근사다. */
export function createEducationNorthPlan(heightAt:(x:number,z:number)=>number){
 const door=(id:string,node:string,edges:number[],x:number,z:number,tx:number,tz:number):EducationNorthDoor=>{
  const origin=new THREE.Vector3(x,0,z),tangent=new THREE.Vector3(tx,0,tz).normalize(),outward=new THREE.Vector3(-tangent.z,0,tangent.x);
  let floor=-Infinity;
  for(let s=-1.65;s<=1.66;s+=.3)for(let n=-3;n<=.01;n+=.3){const p=point(origin,tangent,outward,s,n,0);floor=Math.max(floor,heightAt(p.x,p.z)+.18);}
  return{id,sourceNode:node,sourceEdges:edges,origin,tangent,outward,width:2.8,height:2.65,floor,component:`education-north-${id}-door`};
 };
 return{doors:[door('west','4531518011',[0,1],463.42,-182.95,11.73,20.58),door('north','4514838231',[21,22],517.52,-195.77,57.65,-29.08)],stairs:{start:new THREE.Vector3(424.76,0,-172.23),end:new THREE.Vector3(458.06,0,-188.79),width:3.0,sourceRoad:'way/456922959/347'}};
}

/** 부품 삼각형은 기존 건물의 세 병합 표면에 합친다. 바닥 블록마다 객체를 만들지 않는다. */
export function buildEducationNorthApproach(plan:ReturnType<typeof createEducationNorthPlan>,heightAt:(x:number,z:number)=>number){
 const parts:EducationNorthPart[]=[],floors:{component:string;triangle:V[]}[]=[],pavingMasks:{component:string;polygon:number[][]}[]=[],brick=0x9a7561,stone=0xb9b8ac,metal=0xa1aaa5;
 const part=(component:string,material:'stone'|'metal'|'glass',extra:Record<string,unknown>={})=>{const p={component,material,triangles:[] as EducationNorthTriangle[],extra:{northApproach:true,...extra}};parts.push(p);return p;};
 const tri=(p:EducationNorthPart,a:V,b:V,c:V,color:number,surface:Surface='details')=>p.triangles.push({vertices:[a.clone(),b.clone(),c.clone()],color,surface});
 const quad=(p:EducationNorthPart,a:V,b:V,c:V,d:V,color:number,surface:Surface='details')=>{tri(p,a,b,c,color,surface);tri(p,a,c,d,color,surface);};
 function box(component:string,centre:V,size:V,color:number,tangent=new THREE.Vector3(1,0,0),material:'stone'|'metal'|'glass'='stone',extra:Record<string,unknown>={}){
  const p=part(component,material,extra),normal=new THREE.Vector3().crossVectors(tangent,up).normalize(),v:V[]=[];
  for(const y of[-1,1])for(const z of[-1,1])for(const x of[-1,1])v.push(centre.clone().addScaledVector(tangent,x*size.x/2).addScaledVector(up,y*size.y/2).addScaledVector(normal,z*size.z/2));
  for(const f of[[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]])quad(p,v[f[0]],v[f[1]],v[f[2]],v[f[3]],color,material==='glass'?'glass':'details');
  return p;
 }
 function prism(component:string,top:V[],color:number,extra:Record<string,unknown>={},depth?:number){
  const p=part(component,'stone',{floor:true,floorVertices:top.map(p=>p.toArray()),...extra}),lowest=depth!==undefined?Math.min(...top.map(q=>q.y))-depth:Math.min(...top.map(q=>heightAt(q.x,q.z)))-.10,bottom=top.map(q=>q.clone().setY(lowest));
  for(let i=1;i+1<top.length;i++){tri(p,top[0],top[i+1],top[i],color,'stone');tri(p,bottom[0],bottom[i],bottom[i+1],stone);floors.push({component,triangle:[top[0],top[i+1],top[i]].map(q=>q.clone())});}
  for(let i=0;i<top.length;i++){const j=(i+1)%top.length;quad(p,bottom[i],bottom[j],top[j],top[i],stone);}
  return p;
 }
 const topHeight=(x:number,z:number)=>{
  let y=-Infinity;
  for(const f of floors){const[a,b,c]=f.triangle,det=(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);if(Math.abs(det)<1e-9)continue;const u=((x-a.x)*(c.z-a.z)-(z-a.z)*(c.x-a.x))/det,v=((b.x-a.x)*(z-a.z)-(b.z-a.z)*(x-a.x))/det;if(u>=-1e-6&&v>=-1e-6&&u+v<=1.000001)y=Math.max(y,a.y+u*(b.y-a.y)+v*(c.y-a.y));}
  return Number.isFinite(y)?y:heightAt(x,z);
 };
 const routePoint=(p:V)=>({x:p.x,y:topHeight(p.x,p.z),z:p.z});
 function grid(component:string,origin:V,t:V,n:V,s0:number,s1:number,n0:number,n1:number,surface:(s:number,n:number)=>number,color=brick,extra:Record<string,unknown>={}){
  pavingMasks.push({component,polygon:[[s0,n0],[s1,n0],[s1,n1],[s0,n1]].map(([s,d])=>{const p=point(origin,t,n,s,d,0);return[p.x,p.z];})});
  const ns=Math.max(1,Math.ceil((s1-s0)/1.5)),nn=Math.max(1,Math.ceil((n1-n0)/1.5));
  for(let i=0;i<ns;i++)for(let j=0;j<nn;j++){
   const a=s0+(s1-s0)*i/ns,b=s0+(s1-s0)*(i+1)/ns,c=n0+(n1-n0)*j/nn,d=n0+(n1-n0)*(j+1)/nn,poly=[[a,c],[b,c],[b,d],[a,d]].map(([s,nv])=>point(origin,t,n,s,nv,surface(s,nv)));
   for(const ids of[[0,1,2],[0,2,3]])prism(component,ids.map(k=>poly[k]),color,extra);
  }
 }
 const doors=[];
 for(const d of plan.doors){
  const at=(s:number,n:number,y=d.floor)=>point(d.origin,d.tangent,d.outward,s,n,y),g=(s:number,n:number)=>{const p=at(s,n,0);return heightAt(p.x,p.z);};
  const groundTop=(s:number,n:number)=>g(s,n)+.20;
  const floor=(s:number,n:number)=>{
   const influence=(1-clamp((Math.abs(s)-1.65)/2.3))*(1-clamp((n-.25)/4.25));
   return groundTop(s,n)*(1-influence)+d.floor*influence;
  };
  const s0=d.id==='west'?-4:-4.2,s1=d.id==='west'?17.95:4.2;
  grid(`education-north-${d.id}-forecourt`,d.origin,d.tangent,d.outward,s0,s1,.25,4.5,(s,n)=>floor(s,n));
  grid(`education-north-${d.id}-lobby-floor`,d.origin,d.tangent,d.outward,-1.65,1.65,-3,.25,()=>d.floor,stone);
  // 짧은 진입 공간의 뒷면과 양옆만 닫는다.
  box(`education-north-${d.id}-lobby-back`,at(0,-3.07,d.floor+1.6),new THREE.Vector3(3.5,3.2,.18),stone,d.tangent);
  for(const s of[-1.72,1.72])box(`education-north-${d.id}-lobby-side`,at(s,-1.5,d.floor+1.6),new THREE.Vector3(.14,3.2,3.1),stone,d.tangent);
  const panel=box(d.component,at(0,-.045,d.floor+d.height/2),new THREE.Vector3(d.width,d.height,.07),0x4d7778,d.tangent,'glass',{entrance:true,sourceNode:d.sourceNode,outward:d.outward.toArray(),northGroundEntrance:true});
  for(const s of[-d.width/2,0,d.width/2]){
   const center=at(s,.005,d.floor+d.height/2),temporary=box('frame',center,new THREE.Vector3(.05,d.height,.08),0x5e6967,d.tangent,'metal');parts.pop();panel.triangles.push(...temporary.triangles);
  }
  for(const s of[-.16,.16]){const handle=box('handle',at(s,.025,d.floor+1.15),new THREE.Vector3(.035,.46,.035),0xbfc4bc,d.tangent,'metal');parts.pop();panel.triangles.push(...handle.triangles);}
  for(const s of[-1.48,1.48])box(`education-north-${d.id}-frame`,at(s,.025,d.floor+d.height/2),new THREE.Vector3(.12,d.height+.12,.18),metal,d.tangent,'metal');
  box(`education-north-${d.id}-frame`,at(0,.025,d.floor+d.height+.055),new THREE.Vector3(3.08,.11,.18),metal,d.tangent,'metal');
  const outside=at(0,4.4,0),route=[outside,at(0,2,0),at(0,.65,0),at(0,-.65,0),at(0,-2.5,0)];
  doors.push({id:d.id,component:d.component,sourceNode:d.sourceNode,sourceEdges:d.sourceEdges,buildingId:'way/297046999',center:{x:d.origin.x,y:d.floor,z:d.origin.z},outward:{x:d.outward.x,y:0,z:d.outward.z},tangent:d.tangent.toArray(),width:d.width,height:d.height,routeWorld:route.map(routePoint),lobbyDepth:3,shortLobbyOnly:true,fullInteriorConnectionConfirmed:false,dimensionsEstimated:true});
 }
 const west=plan.doors[0],exteriorRouteWorld=[[-4,2.0],[0,2],[8,2],[17.75,2]].map(([s,n])=>routePoint(point(west.origin,west.tangent,west.outward,s,n,0)));
 // /347의 현재 고도차를 디딤판과 계단참으로 나눈다.
 const stair=plan.stairs,direction=stair.end.clone().sub(stair.start).normalize(),side=new THREE.Vector3(-direction.z,0,direction.x),length=stair.start.distanceTo(stair.end),atStair=(s:number,n:number,y=0)=>point(stair.start,direction,side,s,n,y),stairHalf=stair.width/2;
 const groundAcross=(s:number)=>Math.max(...Array.from({length:9},(_,i)=>{const p=atStair(s,-stairHalf+stair.width*i/8);return heightAt(p.x,p.z);}));
 const startY=groundAcross(0)+.15,endY=groundAcross(length)+.15,count=66,landingCount=5,landingLength=1.15,treadLength=(length-landingCount*landingLength)/count,steps:{s0:number;s1:number;top:number;landing:boolean}[]=[];
 let cursor=0;
 for(let i=0;i<count;i++){
  const end=cursor+treadLength,y=Math.max(startY+(endY-startY)*(i+1)/count,...[cursor,(cursor+end)/2,end].map(s=>groundAcross(s)+.12));steps.push({s0:cursor,s1:end,top:y,landing:false});cursor=end;
  if((i+1)%11===0&&i+1<count){steps.push({s0:cursor,s1:cursor+landingLength,top:Math.max(y,groundAcross(cursor+landingLength)+.12),landing:true});cursor+=landingLength;}
 }
 for(let i=steps.length-2;i>=0;i--)steps[i].top=Math.max(steps[i].top,steps[i+1].top-(steps[i+1].landing?0:.24));
 for(let i=1;i<steps.length;i++)steps[i].top=Math.max(steps[i].top,steps[i-1].top);
 for(const [i,s]of steps.entries())prism(s.landing?'education-north-stair-landing':'education-north-stair-tread',[atStair(s.s0,-stairHalf,s.top),atStair(s.s1,-stairHalf,s.top),atStair(s.s1,stairHalf,s.top),atStair(s.s0,stairHalf,s.top)],stone,{sourceRoad:stair.sourceRoad,stepIndex:i,stepTop:s.top});
 pavingMasks.push({component:'education-north-stair-treads',polygon:[[0,-stairHalf],[length,-stairHalf],[length,stairHalf],[0,stairHalf]].map(([s,n])=>{const p=atStair(s,n);return[p.x,p.z];})});
 for(const end of[false]){
  const s0=end?length:-2,s1=end?length+2:0,y=end?steps.at(-1)!.top:steps[0].top-.15;
  grid('education-north-stair-terrain-join',stair.start,direction,side,s0,s1,-stairHalf,stairHalf,(s,n)=>{const p=atStair(s,n),t=end?(s-length)/2:(s+2)/2;return end?THREE.MathUtils.lerp(y,heightAt(p.x,p.z)+.04,t):THREE.MathUtils.lerp(heightAt(p.x,p.z)+.04,y,t);},stone);
 }
 // 계단 상단을 원본 /338의 바깥 꺾임으로 잇는다. 직선 연장으로 흰 외벽에 들어가지 않는다.
 const upperJoin=[atStair(length,-stairHalf,steps.at(-1)!.top),...[.25,.25+4.25/3,.25+8.5/3,4.5].map(n=>{const p=point(west.origin,west.tangent,west.outward,-4,n,0);return p.setY(topHeight(p.x,p.z));}),atStair(length,stairHalf,steps.at(-1)!.top)];
 for(const f of THREE.ShapeUtils.triangulateShape(upperJoin.map(p=>new THREE.Vector2(p.x,p.z)),[]))prism('education-north-stair-upper-join',f.map(i=>upperJoin[i]),stone,{sourceRoad:'way/456922935/338',junctionEstimated:true});
 pavingMasks.push({component:'education-north-stair-upper-join',polygon:upperJoin.map(p=>[p.x,p.z])});
 const exteriorStart=point(west.origin,west.tangent,west.outward,-4,2,0);
 const stairs={sourceRoad:stair.sourceRoad,width:stair.width,start:routePoint(atStair(-2,0)),end:routePoint(exteriorStart),mappedStart:routePoint(stair.start),mappedEnd:routePoint(stair.end),direction:direction.toArray(),stepCount:count,landingCount,steps,routeWorld:[atStair(-2,0),...steps.filter((s,i)=>i%5===0||s.landing).map(s=>atStair((s.s0+s.s1)/2,0)),stair.end,exteriorStart].map(routePoint),surfaceComponents:['education-north-stair-tread','education-north-stair-landing','education-north-stair-terrain-join','education-north-stair-upper-join'],upperJoin:upperJoin.map(p=>p.toArray()),dimensionsEstimated:true,terrainMeasuredInGameOnly:true,wholeStairPhotographed:false};

 function cylinder(name:string,centre:V,radius:number,h:number,color:number,material:'stone'|'metal'='metal',topRadius=radius,extra:Record<string,unknown>={}){
  const p=part(name,material,extra),count=12,low=Array.from({length:count},(_,i)=>new THREE.Vector3(centre.x+Math.cos(i*Math.PI*2/count)*radius,centre.y-h/2,centre.z+Math.sin(i*Math.PI*2/count)*radius)),high=low.map((q,i)=>new THREE.Vector3(centre.x+Math.cos(i*Math.PI*2/count)*topRadius,centre.y+h/2,centre.z+Math.sin(i*Math.PI*2/count)*topRadius));
  for(let i=0;i<count;i++){const j=(i+1)%count;quad(p,low[i],low[j],high[j],high[i],color);tri(p,centre.clone().setY(centre.y-h/2),low[j],low[i],color);tri(p,centre.clone().setY(centre.y+h/2),high[i],high[j],color);}return p;
 }
 const facilities:Record<string,unknown>[]=[];
 function pm(id:number,official:[number,number],centre:V,tangent:V,planter:boolean){
  const normal=new THREE.Vector3(-tangent.z,0,tangent.x),at=(s:number,n:number,y=0)=>point(centre,tangent,normal,s,n,y),ground=(s:number,n:number)=>{const p=at(s,n);return heightAt(p.x,p.z);};
  const floor=(s:number,n:number)=>ground(s,n)+.22;
  const before=floors.length;
  grid(`education-pm-${id}-paving`,centre,tangent,normal,-3.25,3.25,-2.2,2.2,floor,brick,{facilityId:`pm-${id}`});
  // 흰 구획선은 실제 바닥 삼각형에 붙이고 같은 부품에 포함한다.
  const paintStrip=(s0:number,s1:number,n0:number,n1:number)=>{
   for(const f of floors.slice(before)){
    const owner=parts.find(p=>p.component===f.component&&p.triangles.some(t=>t.surface==='stone'&&t.vertices.every((v,i)=>v.distanceTo(f.triangle[i])<1e-6)));if(!owner)continue;
    let poly=f.triangle.map(p=>({s:p.clone().sub(centre).dot(tangent),n:p.clone().sub(centre).dot(normal),p:p.clone()}));
    for(const[k,value,greater]of[['s',s0,true],['s',s1,false],['n',n0,true],['n',n1,false]]as const){const next:typeof poly=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],ia=greater?a[k]>=value:a[k]<=value,ib=greater?b[k]>=value:b[k]<=value;if(ia)next.push(a);if(ia!==ib){const q=(value-a[k])/(b[k]-a[k]);next.push({s:THREE.MathUtils.lerp(a.s,b.s,q),n:THREE.MathUtils.lerp(a.n,b.n,q),p:a.p.clone().lerp(b.p,q)});}}poly=next;}
    for(let i=1;i+1<poly.length;i++)tri(owner,poly[0].p.clone().addScaledVector(up,.004),poly[i].p.clone().addScaledVector(up,.004),poly[i+1].p.clone().addScaledVector(up,.004),0xe5e5dc);
   }
  };
  paintStrip(-2.9,2.9,-1.7,-1.61);paintStrip(-2.9,2.9,1.61,1.7);paintStrip(-2.9,-2.81,-1.7,1.7);paintStrip(2.81,2.9,-1.7,1.7);
  const signXZ=at(1.8,1.9),signFloor=topHeight(signXZ.x,signXZ.z),signId=`education-pm-${id}-sign`;
  cylinder(signId+'-post',signXZ.clone().setY(signFloor+.95),.035,1.9,metal,'metal',.035,{facilityId:`pm-${id}`});
  const sign=box(signId,signXZ.clone().setY(signFloor+1.72),new THREE.Vector3(.65,.62,.045),0x215e9b,tangent,'metal',{facilityId:`pm-${id}`,signOwner:true});
  // 판독한 PM 주차 기능을 P 도형으로 표시하고 작은 문구는 만들지 않는다.
  for(const side of[-1,1]){const face=(s:number,y:number)=>signXZ.clone().addScaledVector(tangent,-s*side).addScaledVector(normal,.026*side).setY(signFloor+1.72+y);
   const pface=(s:number,y:number)=>face(s*.6-.075,y*.6+.10);
   for(const[a,b,c,d]of[[-.23,-.18,-.18,.20],[-.18,.15,.09,.20],[-.18,-.01,.09,.04],[.04,.04,.09,.15]])quad(sign,pface(a,b),pface(c,b),pface(c,d),pface(a,d),0xf3f3e9);
   const stroke=(x0:number,y0:number,x1:number,y1:number,w=.014)=>{const length=Math.hypot(x1-x0,y1-y0),dx=-(y1-y0)/length*w/2,dy=(x1-x0)/length*w/2;quad(sign,face(x0+dx,y0+dy),face(x1+dx,y1+dy),face(x1-dx,y1-dy),face(x0-dx,y0-dy),0xf3f3e9);};
   for(const x of[-.15,.15])for(let i=0;i<12;i++){const a=i*Math.PI/6,b=(i+1)*Math.PI/6;stroke(x+Math.cos(a)*.065,-.15+Math.sin(a)*.065,x+Math.cos(b)*.065,-.15+Math.sin(b)*.065,.010);}
   for(const line of[[-.15,-.15,-.055,-.02],[-.055,-.02,.02,-.15],[.02,-.15,-.15,-.15],[-.055,-.02,.09,-.02],[.09,-.02,.15,-.15],[.09,-.02,.075,.035],[.075,.035,.12,.035]])stroke(...line as[number,number,number,number]);
  }
  if(planter){
   const pcenter=at(-.15,3.5),rx=3.25,rz=1.35;
   for(let i=0;i<14;i++){
    const a=Math.PI+i*Math.PI/14,b=Math.PI+(i+1)*Math.PI/14,ring=[at(-.15+Math.cos(a)*rx,3.5+Math.sin(a)*rz),at(-.15+Math.cos(b)*rx,3.5+Math.sin(b)*rz),at(-.15+Math.cos(b)*(rx-.22),3.5+Math.sin(b)*(rz-.22)),at(-.15+Math.cos(a)*(rx-.22),3.5+Math.sin(a)*(rz-.22))],y=Math.max(...ring.map(p=>heightAt(p.x,p.z)))+.58;
    const p=prism(`education-pm-${id}-curved-planter`,ring.map(q=>q.clone().setY(y)),0x947356,{facilityId:`pm-${id}`,planter:true});
    for(const t of p.triangles)if(Math.abs(t.vertices[0].y-t.vertices[1].y)>.05||Math.abs(t.vertices[1].y-t.vertices[2].y)>.05){t.surface='stone';t.color=0x947356;}
   }
   const lamp=at(-3.4,2.9),lampY=heightAt(lamp.x,lamp.z);
   cylinder(`education-pm-${id}-lamp-column`,lamp.clone().setY(lampY+1.75),.11,3.5,0xb0aaa0,'metal',.09,{facilityId:`pm-${id}`});
   cylinder(`education-pm-${id}-lamp-disc`,lamp.clone().setY(lampY+3.5),.43,.10,0x7e8176,'metal',.40,{facilityId:`pm-${id}`});
   for(let i=0;i<4;i++){const q=pcenter.clone().addScaledVector(tangent,(i-1.5)*1.05),y=heightAt(q.x,q.z);cylinder(`education-pm-${id}-shrub`,q.clone().setY(y+.6),.5,.8,0x687a4d,'stone',.25,{facilityId:`pm-${id}`,speciesEstimated:true});}
   const tree=pcenter.clone().addScaledVector(tangent,-.6),treeY=heightAt(tree.x,tree.z);
   cylinder(`education-pm-${id}-tree-trunk`,tree.clone().setY(treeY+1.65),.11,3.3,0x756653,'stone',.07,{facilityId:`pm-${id}`,speciesEstimated:true});
   for(let i=0;i<3;i++){
    const center=tree.clone().addScaledVector(tangent,(i-1)*.7).setY(treeY+3.25+(i===1?.65:0)),geometry=new THREE.IcosahedronGeometry(1,1),vertices=geometry.getAttribute('position'),p=part(`education-pm-${id}-tree-crown`,'stone',{facilityId:`pm-${id}`,speciesEstimated:true});
    for(let j=0;j<vertices.count;j+=3)tri(p,...[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(vertices,j+k).multiply(new THREE.Vector3(1.05,1.2,.95)).add(center))as[V,V,V],i===1?0x617849:0x6e8052);geometry.dispose();
   }
  }
  facilities.push({facilityId:`pm-${id}`,officialPosition:official,modelCentre:{x:centre.x,y:topHeight(centre.x,centre.z),z:centre.z},signComponent:signId,sourcePhoto:id===972?7:8,placementEstimated:true,officialMarkerUsedAsExactOutdoorCentre:false,smallTextReproduced:false,planter});
 }
 pm(972,[455.556171752,-179.035956000],new THREE.Vector3(453.5,0,-181.7),direction.clone(),true);
 // 973 표지점은 건물 안쪽이다. 시설은 북쪽 코어의 바깥 보도 가장자리로 옮긴 근사다.
 pm(973,[498.673829944,-206.420676000],new THREE.Vector3(491.65,0,-215.0),new THREE.Vector3(4.14,0,8.06).normalize(),false);
 const pavementMasks=parts.filter(p=>p.extra.floor&&!p.extra.planter&&!p.component.includes('lobby-floor')).map(p=>({component:p.component,polygon:(p.extra.floorVertices as number[][]).map(v=>[v[0],v[2]])}));
 const metadata={doors,exteriorRouteWorld,exteriorSourceWays:['way/456922935/338','way/456922957/346','way/455020726/209'],stairs,facilities,pavementMasks,pavingMasks,pavingMaskUse:'remove-only-covered-existing-pedestrian-rendering',surfaceComponents:[...new Set(floors.map(f=>f.component))],terrainModified:false,rawMapPreserved:true,dimensionsEstimated:true,parkingRampImplemented:false,sourcePhotographs:['2025-07 north roadview','2025 official PM photographs 7 and 8'],historical2010UsedForStructureOnly:true};
 return{parts,metadata};
}
