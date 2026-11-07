import { humanities23Frame } from './humanities23Site';
import { cutTerrainPatch } from './terrainPatch';
type XZ=[number,number];
export const LIBRARY_ACCESS_ID='way/329398175';
export const LIBRARY_ACCESS_BOUNDS={minX:287,maxX:380,minZ:-894,maxZ:-835};
/** 촬영점은 좌표 변환으로 대조했고, 계단 폭과 높이 및 참 길이는 근사했다. */
export function getLibrarySoutheastLayout(heightAt:(x:number,z:number)=>number){
 const cx=349.7984527899485,cz=-821.4313323764842,ux=.726226362557497,uz=.6874556497160431;
 const point=(x:number,n:number):XZ=>[cx+ux*x-uz*n,cz+uz*x+ux*n];
 const f=humanities23Frame(point(0,0),point(1,0));
 const stairX=-10,width=6,approachStart=-41.6,lowerStart=-36.5,lowerEnd=-34.9,mainStart=-29,mainEnd=-20.9,terraceFront=-20;
 const firstFloor=Math.max(...Array.from({length:13},(_,i)=>heightAt(...point(stairX-width/2+i*width/12,approachStart))))+.1;
 const landingFloor=firstFloor+.68,terraceFloor=landingFloor+3.06;
 const mapped:XZ[]=[[343.17,-889.08],[334.53,-879.72],[324.3,-872.75],[300.01,-856.71],[292.32,-850.95]];
 const down=mapped.slice(1).map((p,i)=>{const frame=humanities23Frame(mapped[i],p),start=i===0?3.2:0,y0=heightAt(...frame.point(start))+.06,y1=heightAt(...p)+.06;
  const profile=[{s:start,y:y0},{s:start+.8,y:y0},{s:frame.length-.8,y:y1},{s:frame.length,y:y1}];
  const height=(s:number)=>{const k=profile.findIndex(p=>p.s>=s);if(k<0)return y1;if(k===0)return y0;const a=profile[k-1],b=profile[k];return a.y+(b.y-a.y)*(s-a.s)/(b.s-a.s);};
  return{frame,start,y0,y1,profile,height,width:i<2?3.6:2.4};
 });
 const approach={frame:down[0].frame,start:0,end:3.2,y0:heightAt(...mapped[0])+.06,y1:down[0].y0};
 return{f,point,stairX,width,approachStart,lowerStart,lowerEnd,mainStart,mainEnd,terraceFront,firstFloor,landingFloor,terraceFloor,down,approach,mapped,dimensionsEstimated:true};
}
export type LibrarySoutheastLayout=ReturnType<typeof getLibrarySoutheastLayout>;
export function cutLibrarySoutheastTerrain(positions:number[],indices:number[],q:LibrarySoutheastLayout){
 const zones=q.down.map(a=>({f:a.frame,s0:a.start,s1:a.frame.length,n0:-a.width/2-.15,n1:a.width/2+.15,y:(s:number)=>a.height(s)-.26,raise:false}));
 zones.push({f:q.f,s0:q.stairX-3.4,s1:q.stairX+3.4,n0:q.approachStart,n1:q.lowerEnd,y:()=>q.firstFloor-.25,raise:true});
 const segments=zones.flatMap(a=>[0,.6].flatMap(m=>{const p=[a.f.point(a.s0-m,a.n0-m),a.f.point(a.s1+m,a.n0-m),a.f.point(a.s1+m,a.n1+m),a.f.point(a.s0-m,a.n1+m)];return p.map((b,i)=>[b,p[(i+1)%4]]);}));
 for(const a of q.down)for(const p of a.profile)segments.push([a.frame.point(p.s,-a.width/2-.15),a.frame.point(p.s,a.width/2+.15)]);
 const weight=(x:number,z:number,a:typeof zones[number])=>{const p=a.f.local([x,z]);return Math.max(0,1-Math.hypot(Math.max(0,a.s0-p.s,p.s-a.s1),Math.max(0,a.n0-p.n,p.n-a.n1))/.6);};
 const patch=cutTerrainPatch(positions,indices,0,{bounds:LIBRARY_ACCESS_BOUNDS,local:(x,z)=>({s:x,n:z}),lines:{s:[],n:[]},boundarySegments:segments,apply:(x,z,y)=>{let out=y;for(const a of zones){const w=weight(x,z,a);if(w<=0)continue;const p=a.f.local([x,z]),t=a.y(p.s),candidate=y+(t-y)*w;out=a.raise?Math.max(out,candidate):Math.min(out,candidate);}return out;}});
 return{...patch,affects:(x:number,z:number)=>zones.some(a=>weight(x,z,a)>0)};
}
