import {cutTerrainPatchSteps} from './terrainPatch';
import { humanities23Frame } from './humanities23Site';
import { physics561SurfaceHeight } from './physics561Site';
import type { Engineering30Surface } from './engineering30Site';
import type { Engineering33Layout } from './engineering33Site';
import type { Engineering3436Layout } from './engineering3436Site';

type XZ=[number,number];
export const ENGINEERING3334_ID='connection/engineering33-34';
export function getEngineering3334Layout(heightAt:(x:number,z:number)=>number,building34:Engineering3436Layout,building33:Engineering33Layout,footprint35:XZ[],footprint431:XZ[]){
 const axis=building34.axis,entryFloor=building34.floors[0],plazaFloor=building34.floors[1];
 const entry={n:building34.north-5,n0:building34.north-8,n1:building34.north-2,s:building34.west,depth:1.5};
 const surfaces:Engineering30Surface[]=[],elevated:Engineering30Surface[]=[],routes:Record<string,[number,number,number][]>={};
 const at=(s:number,n:number,y:number):[number,number,number]=>{const p=axis.point(s,n);return[p[0],y,p[1]];};
 const add=(list:Engineering30Surface[],name:string,s0:number,s1:number,n0:number,n1:number,y0:number,y1=y0,direction:'s'|'n'='s',frame=axis)=>{const a:Engineering30Surface={name,frame,s0,s1,n0,n1,y0,y1,axis:direction};list.push(a);return a;};
 add(surfaces,'plaza-stair-top',23.5,27.5,52.45,53.2,plazaFloor);
 const steps:[number,number,number][]=[];
 for(let i=0;i<20;i++){const a=add(surfaces,'plaza-to-low-entry-stair',23.5,27.5,53.2+7.2*i/20,53.2+7.2*(i+1)/20,plazaFloor-(plazaFloor-entryFloor)*(i+1)/20);steps.push(at(25.5,(a.n0+a.n1)/2,a.y0));}
 for(let s=22;s<entry.s;s+=3)for(const[n0,n1]of[[60.4,65],[65,70]])add(surfaces,'low-entry-court',s,Math.min(s+3,entry.s),n0,n1,entryFloor);
 add(surfaces,'low-entry-side-apron',27.5,entry.s,entry.n0,60.4,entryFloor);
 add(surfaces,'low-entry-threshold',entry.s,entry.s+entry.depth,entry.n0,entry.n1,entryFloor);
 const old33=building33.routes.eastEntry[0],approach=humanities23Frame([old33[0],old33[2]],axis.point(22,68));
 for(let i=0;i<4;i++)add(surfaces,'33-east-to-low-court',approach.length*i/4,approach.length*(i+1)/4,-1.3,1.3,old33[1]+(entryFloor-old33[1])*i/4,old33[1]+(entryFloor-old33[1])*(i+1)/4,'s',approach);
 const northOuter=heightAt(...axis.point(25.5,78))+.035;
 for(let i=0;i<4;i++)add(surfaces,'low-court-north-approach',22,29,70+2*i,72+2*i,entryFloor+(northOuter-entryFloor)*i/4,entryFloor+(northOuter-entryFloor)*(i+1)/4,'n');
 const eastRoadS=70,eastRoadFloor=heightAt(...axis.point(eastRoadS,70.5))+.035;
 const roadRampStart=49,roadHeight=(s:number)=>entryFloor+(eastRoadFloor-entryFloor)*Math.max(0,(s-roadRampStart)/(eastRoadS-roadRampStart));
 add(surfaces,'north-court-east-road',entry.s,roadRampStart,67,74,entryFloor);
 for(let i=0;i<7;i++){const s0=roadRampStart+(eastRoadS-roadRampStart)*i/7,s1=roadRampStart+(eastRoadS-roadRampStart)*(i+1)/7;add(surfaces,'north-court-east-road',s0,s1,67,74,roadHeight(s0),roadHeight(s1));}
 routes.underNorthLinks=[at(eastRoadS-.2,70.5,roadHeight(eastRoadS-.2)),at(roadRampStart,70.5,entryFloor),at(entry.s+1,70.5,entryFloor),at(entry.s,69,entryFloor),at(29,69,entryFloor),at(29,entry.n,entryFloor),at(entry.s+1.1,entry.n,entryFloor)];
 routes.plazaToEntry=[at(25.5,51.7,plazaFloor),at(25.5,53.05,plazaFloor),...steps,at(25.5,61.5,entryFloor),at(29,61.5,entryFloor),at(29,entry.n,entryFloor),at(entry.s+1.1,entry.n,entryFloor)];
 routes.lowCourtNorthSouth=[at(25.5,77.8,entryFloor+(northOuter-entryFloor)*7.8/8),at(25.5,70,entryFloor),at(25.5,61,entryFloor)];
 routes.from33Entry=[...building33.routes.eastEntry].reverse();routes.from33Entry.push(at(22,68,entryFloor),at(29,68,entryFloor),at(29,entry.n,entryFloor),at(entry.s+1.1,entry.n,entryFloor));
 const junction:[number,number]=[269.92,-1117.57],stem=humanities23Frame(axis.point(43.6,building34.north),[268.5,-1106.34]),junctionS=stem.local(junction).s;
 const greenFloor=building33.floor+7,upperFloor=building34.floors[3],topFloor=building34.floors[4],halfWidth=1.6;
 const bridge33Start=building33.east.point(13.2,0),green=humanities23Frame(bridge33Start,stem.point(junctionS,0));
 const wall35=humanities23Frame(footprint35[18],footprint35[19]),terraceStart=wall35.local([313.25,-1112]).s,end35=wall35.point(terraceStart,2.8),eastBridge=humanities23Frame(stem.point(junctionS,0),end35);
 const terraceFloor=heightAt(...wall35.point(55,-4))+.45;
 const wall431=humanities23Frame(footprint431[2],footprint431[4]),end431=wall431.point(wall431.local(stem.point(stem.length,0)).s,0);
 const point=(frame:typeof axis,s:number,n:number,y:number):[number,number,number]=>{const p=frame.point(s,n);return[p[0],y,p[1]];};
 // 지도 보행선과 사진의 다층 골조를 구분한다. 높이와 문 위치는 게임 근사다.
 for(const floor of[plazaFloor,greenFloor])add(elevated,'north-stem-floor',0,stem.length,-halfWidth,halfWidth,floor,floor,'s',stem);
 add(elevated,'upper-junction-floor',8,stem.length,-halfWidth,halfWidth,upperFloor,upperFloor,'s',stem);
 add(elevated,'34-north-stair-top',-1.4,1,-halfWidth,halfWidth,topFloor,topFloor,'s',stem);
 const northSteps:[number,number,number][]=[];
 for(let i=0;i<20;i++){const a=add(elevated,'34-north-upper-stair',1+7*i/20,1+7*(i+1)/20,-halfWidth,halfWidth,topFloor-(topFloor-upperFloor)*(i+1)/20,topFloor-(topFloor-upperFloor)*(i+1)/20,'s',stem);northSteps.push(point(stem,(a.s0+a.s1)/2,0,a.y0));}
 add(elevated,'33-green-bridge-floor',-1.4,green.length,-halfWidth,halfWidth,greenFloor,greenFloor,'s',green);
 add(elevated,'35-concrete-bridge-floor',0,eastBridge.length,-halfWidth,halfWidth,upperFloor,terraceFloor,'s',eastBridge);
 add(elevated,'35-west-outdoor-terrace',terraceStart-1.8,51.7,.12,4.4,terraceFloor,terraceFloor,'s',wall35);
 for(const floor of[plazaFloor,greenFloor])add(elevated,'34-north-link-threshold',-1.4,0,-halfWidth,halfWidth,floor,floor,'s',stem);
 for(const floor of[plazaFloor,greenFloor,upperFloor])add(elevated,'431-link-threshold',stem.length,stem.length+1.4,-halfWidth,halfWidth,floor,floor,'s',stem);
 routes.greenBridge33to34=[point(green,-1,0,greenFloor),point(green,green.length-1,0,greenFloor),point(stem,junctionS,0,greenFloor),point(stem,-1,0,greenFloor)];
 routes.greenBridge33to431=[point(green,-1,0,greenFloor),point(green,green.length-1,0,greenFloor),point(stem,junctionS,0,greenFloor),point(stem,stem.length+1,0,greenFloor)];
 routes.lowerNorthLink=[point(stem,-1,0,plazaFloor),point(stem,stem.length+1,0,plazaFloor)];
 routes.northUpperStair=[point(stem,-1,0,topFloor),point(stem,.8,0,topFloor),...northSteps,point(stem,junctionS,0,upperFloor),point(stem,stem.length+1,0,upperFloor)];
 routes.upperLink35=[point(stem,stem.length+1,0,upperFloor),point(stem,junctionS,0,upperFloor),point(eastBridge,2,0,upperFloor+(terraceFloor-upperFloor)*2/eastBridge.length),point(eastBridge,eastBridge.length,0,terraceFloor),point(wall35,terraceStart+2.5,2.8,terraceFloor),point(wall35,50.7,1.2,terraceFloor),point(wall35,55,1.2,terraceFloor)];
 const openings431=[plazaFloor,greenFloor,upperFloor].map(floor=>({buildingId:'way/162045723',edgeIndex:2,a:wall431.point(wall431.local(end431).s-1.45,0),b:wall431.point(wall431.local(end431).s+1.45,0),bottom:floor-.03,top:floor+2.7}));
 const openings34=[plazaFloor,greenFloor,topFloor].map(floor=>({s0:42.15,s1:45.05,bottom:floor,top:floor+2.7}));
 const opening33={s0:11.75,s1:14.65,bottom:greenFloor,top:greenFloor+2.65};
 const polygons=surfaces.map(a=>[a.frame.point(a.s0,a.n0),a.frame.point(a.s1,a.n0),a.frame.point(a.s1,a.n1),a.frame.point(a.s0,a.n1)]);
 const points=polygons.flat(),bounds={minX:Math.min(...points.map(p=>p[0]))-.5,maxX:Math.max(...points.map(p=>p[0]))+.5,minZ:Math.min(...points.map(p=>p[1]))-.5,maxZ:Math.max(...points.map(p=>p[1]))+.5};
 return{axis,entryFloor,plazaFloor,entry,surfaces,elevated,routes,polygons,bounds,approach,stem,junctionS,green,greenFloor,greenRoof:greenFloor+2.3,upperFloor,topFloor,eastBridge,wall35,wall431,end431,halfWidth,openings431,openings34,opening33,terraceFloor,terraceStart};
}
export type Engineering3334Layout=ReturnType<typeof getEngineering3334Layout>;
export function* cutEngineering3334TerrainSteps(positions:number[],indices:number[],q:Engineering3334Layout){
 const sample=(x:number,z:number,lowest=false)=>{let h:number|undefined;for(const a of q.surfaces){const p=a.frame.local([x,z]);if(p.s>=a.s0-.001&&p.s<=a.s1+.001&&p.n>=a.n0-.001&&p.n<=a.n1+.001){const y=physics561SurfaceHeight(a,p.s,p.n);h=lowest&&h!==undefined?Math.min(h,y):y;}}return h;};
 const patch=(yield* cutTerrainPatchSteps(positions,indices,0,{bounds:q.bounds,local:(x,z)=>({s:x,n:z}),lines:{s:[],n:[]},boundarySegments:q.polygons.flatMap(p=>p.map((a,i)=>[a,p[(i+1)%p.length]])),apply:(x,z,y)=>{const h=sample(x,z,true);return h===undefined?y:h-.24;}}));
 return{...patch,surfaceAt:(x:number,z:number)=>sample(x,z),affects:(x:number,z:number)=>sample(x,z)!==undefined};
}

export function cutEngineering3334Terrain(...args:Parameters<typeof cutEngineering3334TerrainSteps>){
  const steps=cutEngineering3334TerrainSteps(...args);let result=steps.next();
  while(!result.done)result=steps.next();
  return result.value;
}
