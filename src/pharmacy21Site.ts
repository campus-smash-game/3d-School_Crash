import { humanities23Frame } from './humanities23Site';
import { cutTerrainPatch } from './terrainPatch';
import type { Pharmacy2021Layout } from './pharmacy2021Site';
export const PHARMACY21_BOUNDS={minX:303,maxX:368,minZ:-1003,maxZ:-900};
export function getPharmacy21Layout(heightAt:(x:number,z:number)=>number,connection:Pharmacy2021Layout){
 const mappedFront=humanities23Frame([345.66,-905.91],[311.09,-990.56]),frontOffset=-4.8;
 const f=humanities23Frame(mappedFront.point(0,frontOffset),mappedFront.point(mappedFront.length,frontOffset)),entryS=62;
 const entryGround=heightAt(...f.point(entryS,-1.9))+.08,floor=entryGround+.51,roof=floor+14;
 const stations=[...Array.from({length:33},(_,i)=>f.length*i/32),entryS-5,entryS+5].sort((a,b)=>a-b);
 const profile=stations.map(s=>({s,y:Math.abs(s-entryS)<=5?entryGround:heightAt(...f.point(s,-1.9))+.08}));
 const walkHeight=(s:number)=>{const i=profile.findIndex(p=>p.s>=s);if(i<=0)return i<0?profile.at(-1)!.y:profile[0].y;const a=profile[i-1],b=profile[i];return a.y+(b.y-a.y)*(s-a.s)/(b.s-a.s);};
 return {f,frontOffset,entryS,entryGround,floor,roof,profile,walkHeight,connection,stair:{n0:-1.25,n1:-.2,width:6.6,steps:3},dimensionsEstimated:true};
}
export type Pharmacy21Layout=ReturnType<typeof getPharmacy21Layout>;
export function cutPharmacy21Terrain(positions:number[],indices:number[],q:Pharmacy21Layout){
 const f=q.f,zones=[{s0:1,s1:f.length-1,n0:-2.9,n1:-.55,y:(s:number)=>q.walkHeight(s)},
 {s0:q.entryS-3.8,s1:q.entryS+3.8,n0:-1.4,n1:4,y:()=>q.entryGround}];
 const weight=(s:number,n:number,a:typeof zones[number])=>Math.max(0,1-Math.hypot(Math.max(0,a.s0-s,s-a.s1),Math.max(0,a.n0-n,n-a.n1))/.4);
 const segments=zones.flatMap(a=>{const p=[f.point(a.s0,a.n0),f.point(a.s1,a.n0),f.point(a.s1,a.n1),f.point(a.s0,a.n1)];return p.map((b,i)=>[b,p[(i+1)%4]]);});
 for(const p of q.profile)segments.push([f.point(p.s,-2.9),f.point(p.s,-.55)]);
 const patch=cutTerrainPatch(positions,indices,0,{bounds:PHARMACY21_BOUNDS,local:(x,z)=>f.local([x,z]),lines:{s:[],n:[]},boundarySegments:segments,apply:(x,z,y)=>{const p=f.local([x,z]);let result=y;for(const a of zones)result=Math.min(result,y+(a.y(p.s)-.23-y)*weight(p.s,p.n,a));return result;}});
 return {...patch,affects:(x:number,z:number)=>{const p=f.local([x,z]);return zones.some(a=>weight(p.s,p.n,a)>0);}};
}
