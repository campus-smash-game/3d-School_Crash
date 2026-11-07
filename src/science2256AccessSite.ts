import { humanities23Frame } from './humanities23Site';
import { physics561SurfaceHeight, type Physics561Surface, type Physics561Layout } from './physics561Site';
type Frame=ReturnType<typeof humanities23Frame>;
export type Science2256Surface=Physics561Surface&{frame?:Frame};
export const SCIENCE2256_DOORS=[
 {name:'22-east-south',buildingId:'way/167605495',node:'4562088387',point:[222.44,-976.17] as [number,number],level:1},
 {name:'22-east-north',buildingId:'way/167605495',node:'4562088386',point:[243.44,-927.93] as [number,number],level:1},
 {name:'22-west',buildingId:'way/167605495',node:'4562088385',point:[223.73,-921.22] as [number,number],level:1},
 {name:'22-north',buildingId:'way/167605495',node:'4562088384',point:[243.24,-902.53] as [number,number],level:0},
 {name:'56-east-south',buildingId:'way/167595745',node:'4562091894',point:[268.4,-983.66] as [number,number],level:1},
 {name:'56-east-north',buildingId:'way/167595745',node:'4562091893',point:[280.62,-951.07] as [number,number],level:1},
 {name:'56-west-south',buildingId:'way/167595745',node:'4562091892',point:[247.65,-976.89] as [number,number],level:0},
 {name:'56-west-north',buildingId:'way/167595745',node:'4562091891',point:[262.19,-939.91] as [number,number],level:0},
];
export function createScience2256Access(f:Frame,floors22:number[],floors56:number[],heightAt:(x:number,z:number)=>number,surfaces:Science2256Surface[],routes:Record<string,[number,number,number][]>,newBuilding:Physics561Layout){
 const doors=SCIENCE2256_DOORS.map(d=>({...d,...f.local(d.point),floor:(d.buildingId==='way/167605495'?floors22:floors56)[d.level],width:2.6}));
 const at=(frame:Frame,s:number,n:number,y:number):[number,number,number]=>{const p=frame.point(s,n);return[p[0],y,p[1]];};
 const add=(name:string,s0:number,s1:number,n0:number,n1:number,y0:number,y1=y0,axis:'s'|'n'='s',frame=f)=>{const a:Science2256Surface={name,s0,s1,n0,n1,y0,y1,axis,...(frame===f?{}:{frame})};surfaces.push(a);return a;};
 const flight=(name:string,frame:Frame,s0:number,s1:number,n:number,width:number,y0:number,y1:number)=>{
  const count=Math.max(1,Math.ceil(Math.abs(y1-y0)/.15)),route=[at(frame,s0+.05,n,y0)];
  for(let i=0;i<count;i++){const a=s0+(s1-s0)*i/count,b=s0+(s1-s0)*(i+1)/count,y=y0+(y1-y0)*(i+1)/count;add(name,a,b,n-width/2,n+width/2,y,y,'s',frame);route.push(at(frame,(a+b)/2,n,y));}
  route.push(at(frame,s1-.05,n,y1));return route;
 };
 const eastRoadS=(n:number)=>n<-48.536?28.328+(n+48.536)*(29.317-28.328)/(-76.717+48.536):24.864+(n-8.247)*(28.328-24.864)/(-48.536-8.247);
 for(const d of doors.filter(d=>d.name.startsWith('56-east'))){
  const edge=eastRoadS(d.n)-2.5,ground=heightAt(...f.point(edge,d.n))+.03,landing=d.s+1.05;
  add(d.name+'-landing',d.s-2.4,landing,d.n-1.4,d.n+1.4,d.floor);
  const stair=flight(d.name+'-stair',f,landing,edge,d.n,2.8,d.floor,ground);
  const roadEnd=eastRoadS(d.n)+.6;
  add(d.name+'-road-join',edge,roadEnd,d.n-1.4,d.n+1.4,ground,heightAt(...f.point(roadEnd,d.n))+.03);
  routes[d.name]=[at(f,eastRoadS(d.n),d.n,heightAt(...f.point(eastRoadS(d.n),d.n))),...stair.reverse(),at(f,d.s-1.5,d.n,d.floor)];
 }
 // 도로는 유지하고 건물 앞 식재 경사면만 보완한다.
 const eastWall=[[19.55,-71.693],[18.631,-59.047],[22.366,-58.09],[19.256,-18.066],[18.916,-13.668],[16.168,-13.382],[15.148,0]];
 const eastFaceS=(n:number)=>{const i=eastWall.findIndex((p,i)=>i<eastWall.length-1&&n>=p[1]&&n<=eastWall[i+1][1]),a=eastWall[Math.max(0,i)],b=eastWall[Math.max(0,i)+1];return a[0]+(b[0]-a[0])*(n-a[1])/(b[1]-a[1]);};
 const bankCuts=[...new Set([-71.69,-1,...eastWall.slice(1,-1).map(p=>p[1]),...Array.from({length:23},(_,i)=>-70+i*3),...doors.filter(d=>d.name.startsWith('56-east')).flatMap(d=>[d.n-1.45,d.n+1.45])])].sort((a,b)=>a-b);
 for(let i=1;i<bankCuts.length;i++){const n=bankCuts[i-1],end=bankCuts[i];if(doors.some(d=>d.name.startsWith('56-east')&&Math.abs((n+end)/2-d.n)<1.45))continue;
  const inner=Math.min(eastFaceS(n),eastFaceS(end))-.45,outer=Math.min(eastRoadS(n),eastRoadS(end))-2.8;
  if(outer-inner<.4)continue;const a=add('56-east-garden-bank',inner,outer,n,end,floors56[1]-.35,heightAt(...f.point(outer,n))+.025);a.y2=heightAt(...f.point(outer,end))+.025;
 }
 const east22=doors.find(d=>d.name==='22-east-north')!,court=floors22[1]-.3;
 add('22-east-north-landing',east22.s-2.2,-21,east22.n-1.4,east22.n+1.4,east22.floor);
 add('22-east-north-ramp',-21,-17,east22.n-1.2,east22.n+1.2,east22.floor,court);
 routes[east22.name]=[at(f,-16,east22.n,court),at(f,-17,east22.n,court),at(f,-21,east22.n,east22.floor),at(f,east22.s-1.5,east22.n,east22.floor)];
 const west=doors.find(d=>d.name==='22-west')!,roadS=-54.009+(west.n-15.437)*(-51.331+54.009)/(-27.303-15.437),edge=roadS+2.8,ground=heightAt(...f.point(edge,west.n))+.03;
 add('22-west-entry-landing',west.s-1,west.s+2.1,west.n-1.4,west.n+1.4,west.floor);
 add('22-west-entry-ramp',edge,west.s-1,west.n-1.2,west.n+1.2,ground,west.floor);
 routes[west.name]=[at(f,roadS,west.n,heightAt(...f.point(roadS,west.n))),at(f,edge,west.n,ground),at(f,west.s-1,west.n,west.floor),at(f,west.s+1.4,west.n,west.floor)];
 const north=doors.find(d=>d.name==='22-north')!,nf=humanities23Frame([228.37,-889.75],[259.52,-901.96]),project=nf.local(north.point).s;
 const approach561=newBuilding.surfaces.find(a=>a.name==='lower-walk-approach')!;
 const ns=f.local(nf.point(0)).s,ne=f.local(nf.point(nf.length)).s,handoff=(approach561.s0-ns)/(ne-ns)*nf.length;
 const low=heightAt(...nf.point(0))+.03,handoffPoint=f.local(nf.point(handoff)),high=physics561SurfaceHeight(approach561,handoffPoint.s,handoffPoint.n),mid=low+(high-low)*project/handoff;
 const left=flight('22-north-west-stair',nf,0,project-2,0,2.8,low,mid);
 add('22-north-cross-landing',project-2,project+2,-1.4,1.4,mid,mid,'s',nf);
 const right=flight('22-north-east-stair',nf,project+2,handoff,0,2.8,mid,high),endPoint=f.local(nf.point(nf.length));
 routes.northPassage=[...left,at(nf,project+2,0,mid),...right,at(nf,nf.length,0,physics561SurfaceHeight(approach561,endPoint.s,endPoint.n))];
 const crossing=f.local(nf.point(project)),entry=humanities23Frame(north.point,nf.point(project)),top=1.4;
 add('22-north-entry-landing',-2,top,-1.3,1.3,north.floor,north.floor,'s',entry);
 const approach=flight('22-north-entry-stair',entry,top,entry.length,0,2.6,north.floor,mid);
 routes[north.name]=[at(f,crossing.s,crossing.n,mid),...approach.reverse(),at(entry,-1.4,0,north.floor)];
 const wallEnds=[nf.local(f.point(-45.953,10.984)),nf.local(f.point(-24.784,9.333))];
 const wallN=(s:number)=>wallEnds[0].n+(wallEnds[1].n-wallEnds[0].n)*(s-wallEnds[0].s)/(wallEnds[1].s-wallEnds[0].s);
 const stairY=(s:number)=>s<project-2?low+(mid-low)*s/(project-2):s>project+2?mid+(high-mid)*(s-project-2)/(handoff-project-2):mid;
 const gardenCuts=[wallEnds[0].s,project-2.1,project+2.1,Math.min(wallEnds[1].s,handoff),...Array.from({length:22},(_,i)=>wallEnds[0].s+i)].filter(s=>s>=wallEnds[0].s&&s<=Math.min(wallEnds[1].s,handoff)).sort((a,b)=>a-b);
 for(let i=1;i<gardenCuts.length;i++){const s0=gardenCuts[i-1],s1=gardenCuts[i];if(s1-s0<.01||Math.abs((s0+s1)/2-project)<2.1)continue;add('22-north-garden-bank',s0,s1,Math.min(wallN(s0),wallN(s1))-.3,-1.4,north.floor-.05,stairY((s0+s1)/2)-.18,'n',nf);}
 const northRetaining=[];
 for(const n of[-1.5,1.5])for(let s=-.3;s<entry.length-1.5;s+=1){const end=Math.min(s+1,entry.length-1.5),height=(v:number)=>Math.max(north.floor+.45,heightAt(...entry.point(v,n))+.12);northRetaining.push({frame:entry,s0:s,s1:end,n,bottom:north.floor-.3,top0:height(s),top1:height(end)});}
 return{doors,northFrame:nf,northLanding:{s:project,y:mid},northRetaining,eastRoadS,westRoadS:roadS,entranceCoordinatesFromOsm:true,sourceTimestamp:'2016-12-19',floorAssignmentsEstimated:true};
}
