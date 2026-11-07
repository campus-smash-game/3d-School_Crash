import {cutTerrainPatchSteps} from './terrainPatch';
import { humanities23Frame } from './humanities23Site';
import type { Pharmacy20Layout } from './pharmacy20Site';
type XZ=[number,number];
export const PHARMACY2021_ID='way/435329614';
export const PHARMACY21_ID='way/167598052';
export const PHARMACY2021_BOUNDS={minX:338,maxX:380,minZ:-922,maxZ:-882};
export function getPharmacy2021Layout(heightAt:(x:number,z:number)=>number,e20:Pharmacy20Layout){
 const f=humanities23Frame([357.97,-891.16],[350.40,-907.85]);
 const door20=humanities23Frame([357.97,-891.16],[364.87,-898.76]),door21=humanities23Frame([350.40,-907.85],[360.03,-911.78]);
 const edgePoint=(frame:typeof f,n:number)=>frame.point(n/f.local(frame.point(1)).n);
 const floor=e20.floor,ground=floor-3.5,pinkFloor=floor+3.5,roof=floor+10.5;
 const lowerPolygon=[edgePoint(door20,.2),edgePoint(door21,.2),edgePoint(door21,3.4),edgePoint(door20,3.4)];
 const polygon:XZ[]=[[357.97,-891.16],[350.40,-907.85],[360.03,-911.78],[364.87,-898.76]];
 const center=f.length/2,frontY=heightAt(...f.point(center,-14))+.06,topY=heightAt(...f.point(center,14.5))+.08;
 const profile=[{n:-14,y:frontY},{n:-3,y:ground},{n:4.6,y:ground},{n:8.8,y:ground+2.7},{n:9.6,y:ground+2.7},{n:14.5,y:topY},{n:20,y:heightAt(...f.point(center,20))+.06}];
 const stairHeight=(n:number)=>{const k=profile.findIndex(p=>p.n>=n);if(k<0)return profile[profile.length-1].y;if(k===0)return profile[0].y;const a=profile[k-1],b=profile[k];return a.y+(b.y-a.y)*(n-a.n)/(b.n-a.n);};
 const walk=[{p:e20.f.point(e20.f.length,.3),y:e20.walkHeight(e20.f.length)},{p:f.point(-.5,-3.8),y:heightAt(...f.point(-.5,-3.8))+.06},{p:f.point(center,-8.5),y:stairHeight(-8.5)},{p:f.point(center,-6),y:stairHeight(-6)}];
 const roadEnds=[{n:-15.5,y:heightAt(...f.point(center,-15.5))+.06},{n:22,y:heightAt(...f.point(center,22))+.06}];
 return{f,roadEnds,door20,door21,s20:door20.local(edgePoint(door20,1.8)).s,s21:door21.local(edgePoint(door21,1.8)).s,floor,ground,pinkFloor,roof,lowerPolygon,polygon,center,frontY,topY,profile,stairHeight,walk,width:2.6,dimensionsEstimated:true};
}
export type Pharmacy2021Layout=ReturnType<typeof getPharmacy2021Layout>;
export function pharmacy21Opening(q:Pharmacy2021Layout){return{buildingId:PHARMACY21_ID,edgeIndex:4,a:q.door21.point(q.s21-1.25),b:q.door21.point(q.s21+1.25),bottom:q.floor-.2,top:q.floor+2.8};}
export function* cutPharmacy2021TerrainSteps(positions:number[],indices:number[],q:Pharmacy2021Layout){
  let startupWork=0;
 const f=q.f,zones=[{f,s0:1,s1:f.length-1,n0:-3,n1:3.8,y:()=>q.ground},{f,s0:q.center-1.6,s1:q.center+1.6,n0:-14,n1:20,y:(_s:number,n:number)=>q.stairHeight(n)},
 {f:q.door20,s0:q.s20-1.5,s1:q.s20+1.5,n0:-.5,n1:3.4,y:()=>q.floor},{f:q.door21,s0:q.s21-1.5,s1:q.s21+1.5,n0:-3.4,n1:.5,y:()=>q.floor}];
 for(let i=1;i<q.walk.length;i++){
    if((++startupWork&255)===0)yield '지형과 경사로 준비 중';const a=q.walk[i-1],b=q.walk[i],frame=humanities23Frame(a.p,b.p);zones.push({f:frame,s0:0,s1:frame.length,n0:-1,n1:1,y:s=>a.y+(b.y-a.y)*s/frame.length});}
 const segments=zones.flatMap(a=>[0,.5].flatMap(m=>{const p=[a.f.point(a.s0-m,a.n0-m),a.f.point(a.s1+m,a.n0-m),a.f.point(a.s1+m,a.n1+m),a.f.point(a.s0-m,a.n1+m)];return p.map((b,i)=>[b,p[(i+1)%4]]);}));
 for(const p of q.profile)segments.push([f.point(q.center-1.6,p.n),f.point(q.center+1.6,p.n)]);
 const weight=(x:number,z:number,a:typeof zones[number])=>{const p=a.f.local([x,z]);return Math.max(0,1-Math.hypot(Math.max(0,a.s0-p.s,p.s-a.s1),Math.max(0,a.n0-p.n,p.n-a.n1))/.5);};
 const affects=(x:number,z:number)=>zones.some(a=>weight(x,z,a)>0);
 const patch=(yield* cutTerrainPatchSteps(positions,indices,0,{bounds:PHARMACY2021_BOUNDS,local:(x,z)=>({s:x,n:z}),lines:{s:[],n:[]},boundarySegments:segments,apply:(x,z,y)=>{let result=y;for(const a of zones){const p=a.f.local([x,z]);result=Math.min(result,y+(a.y(p.s,p.n)-.23-y)*weight(x,z,a));}return result;}}));
 return{...patch,affects};
}

export function cutPharmacy2021Terrain(...args:Parameters<typeof cutPharmacy2021TerrainSteps>){
  const steps=cutPharmacy2021TerrainSteps(...args);let result=steps.next();
  while(!result.done)result=steps.next();
  return result.value;
}
