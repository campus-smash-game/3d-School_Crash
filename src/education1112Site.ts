type XZ = [number, number];
const origin: XZ = [574.01, -761.62];
const length = Math.hypot(38.4, 62.64);
export const education1112Point = (u: number, v=0): XZ => [origin[0] - 38.4 / length * u - 62.64 / length * v, origin[1] - 62.64 / length * u + 38.4 / length * v];
export function education1112Local(x: number, z: number) { return { u: -(x-origin[0])*38.4/length-(z-origin[1])*62.64/length, v: -(x-origin[0])*62.64/length+(z-origin[1])*38.4/length }; }
export const EDUCATION1112 = {
  id: 'education-11-12-hall',
  // 건축 도면과 지도 윤곽을 맞춘 저층 부피다. 상층 C자 윤곽은 보존한다.
  hall: [[562.77,-728.56],education1112Point(-23,0),[574.01,-761.62],[590.99,-772.04],[581.44,-776.23],[575.77,-772.1],[572.42,-779.06],[570.37,-780.35],[565.47,-770.3],[565.21,-763.87],[568.05,-758.2],[577.32,-744.03],[574.95,-741.84]] as XZ[],
  lower:56.184, upper:59.384, raisedCafe:57.144,
  original11Floor:56.0916653286814,
  original11Foundation:53.45077881887586,
  dimensionsEstimated:true,
};
export function education1112DoorCuts(edge:number,length:number,floor:number) {
  return edge===3 ? [{s:14,lo:floor,hi:floor+2.7,level:0},{s:9,lo:floor+3.5,hi:floor+6.25,level:1}] : edge===4 ? [{s:length-10,lo:floor,hi:floor+2.7,level:0}] : [];
}
function inside(x:number,z:number,p:XZ[]) {let hit=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
function distance(x:number,z:number,a:XZ,b:XZ){const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);}
const p=education1112Point;
export const education1112GroundPolygons:XZ[][]=[EDUCATION1112.hall,[p(-24,0),p(-24,28),p(-20,28),p(-20,0)], [p(-12,-4.2),p(-8,-4.2),p(-8,1),p(-12,1)], [p(-4,-16.5),p(2,-16.5),p(2,-11.5),p(-4,-11.5)]];
// 1층 정문 앞의 좁은 포장과 유리 전면의 포장을 기존 마당에 잇는다.
const entryA:XZ=[552.48,-747.27],entryB:XZ=[562.77,-728.56],entryLength=Math.hypot(entryB[0]-entryA[0],entryB[1]-entryA[1]);
const ep=(s:number,n:number):XZ=>[entryA[0]+(entryB[0]-entryA[0])/entryLength*s-(entryB[1]-entryA[1])/entryLength*n,entryA[1]+(entryB[1]-entryA[1])/entryLength*s+(entryB[0]-entryA[0])/entryLength*n];
education1112GroundPolygons.push([ep(entryLength*.6-2.2,-1.4),ep(entryLength*.6+2.2,-1.4),ep(entryLength*.6+2.2,2.7),ep(entryLength*.6-2.2,2.7)]);
export function applyEducation1112Correction(x:number,z:number,y:number,offset:number){
  // 연결실과 문 앞만 기존 바닥 아래로 맞춘다. 도로와 원본 DEM은 바꾸지 않는다.
  let weight=0;
  for(const polygon of education1112GroundPolygons){const d=inside(x,z,polygon)?0:Math.min(...polygon.map((a,i)=>distance(x,z,a,polygon[(i+1)%polygon.length])));const t=Math.max(0,Math.min(1,1-d/1.8));weight=Math.max(weight,t*t*(3-2*t));}
  const boundary=Math.max(0,Math.min(1,(-723-z)/2));
  return y+(EDUCATION1112.original11Floor-.18+offset-y)*weight*boundary;
}
export const education1112BoundarySegments=()=>education1112GroundPolygons.flatMap(p=>p.map((a,i)=>[a,p[(i+1)%p.length]]));
