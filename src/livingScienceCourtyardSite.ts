// 안마당의 높이와 경계는 공식 사진, 원본 현관 노드와 기존 통과구를 맞춘 게임용 근사다.
// 원시 DEM과 다른 건물의 기준고를 바꾸지 않는다. 모든 좌표는 반사 전 D 좌표다.
const origin={x:437.34,z:-215.85};
const outward={x:.8743425723321923,z:-.4853092480135989};
const tangent={x:.4853092480135989,z:.8743425723321923};
const passageStart={x:439.05,z:-254.28},passageEnd={x:449.8,z:-231.55};
const entryFloor=30.616582416844743,passageFloor=31.919134530320942;
const passageN=(passageEnd.x-origin.x)*outward.x+(passageEnd.z-origin.z)*outward.z;
const acrossSlope=(passageFloor-entryFloor)/passageN;
const smooth=(x:number,a:number,b:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
export const LIVING_SCIENCE_COURTYARD={
 origin,outward,tangent,entryFloor,baselineEntryHeightAt:30.43645901016042,
 passageEnd:{...passageEnd,floorY:passageFloor},acrossSlope,northSlope:.02,pavingClearance:.20,
 correction:{sMin:-12,sMax:24,nMin:0,nMax:42,coreSMin:-8,coreSMax:18,coreNMin:1,coreNMax:34,loweringOnly:true,passageProtectedRadius:5.2,passageBlendRadius:6.4},
 paving:{sMin:-10,sMax:20,nMin:.2,nMax:34},
 surveyed:false,photoCaptureDate:null,photoPublicationDate:'2024-09-20',
};
export function livingScienceCourtyardLocal(x:number,z:number){return{s:(x-origin.x)*tangent.x+(z-origin.z)*tangent.z,n:(x-origin.x)*outward.x+(z-origin.z)*outward.z};}
export function livingScienceCourtyardPoint(s:number,n:number){return{x:origin.x+tangent.x*s+outward.x*n,z:origin.z+tangent.z*s+outward.z*n};}
export function livingScienceCourtyardDesignFloor(x:number,z:number,datumOffset=0){const p=livingScienceCourtyardLocal(x,z);return entryFloor+datumOffset+acrossSlope*p.n+.02*Math.max(0,p.s);}
export function livingScienceCourtyardCorrectionWeight(x:number,z:number){
 const p=livingScienceCourtyardLocal(x,z),c=LIVING_SCIENCE_COURTYARD.correction;
 if(p.s<=c.sMin||p.s>=c.sMax||p.n<=c.nMin||p.n>=c.nMax)return 0;
 const dx=passageEnd.x-passageStart.x,dz=passageEnd.z-passageStart.z,t=Math.max(0,Math.min(1,((x-passageStart.x)*dx+(z-passageStart.z)*dz)/(dx*dx+dz*dz))),distance=Math.hypot(x-passageStart.x-dx*t,z-passageStart.z-dz*t);
 return smooth(p.s,c.sMin,c.coreSMin)*(1-smooth(p.s,c.coreSMax,c.sMax))*smooth(p.n,c.nMin,c.coreNMin)*(1-smooth(p.n,c.coreNMax,c.nMax))*smooth(distance,c.passageProtectedRadius,c.passageBlendRadius);
}
export function applyLivingScienceCourtyardCorrection(x:number,z:number,currentHeight:number,datumOffset=0){const weight=livingScienceCourtyardCorrectionWeight(x,z),target=livingScienceCourtyardDesignFloor(x,z,datumOffset)-LIVING_SCIENCE_COURTYARD.pavingClearance;return currentHeight-Math.max(0,currentHeight-target)*weight;}
export function livingScienceCourtyardCorrectionBounds(){const c=LIVING_SCIENCE_COURTYARD.correction,p=[livingScienceCourtyardPoint(c.sMin,c.nMin),livingScienceCourtyardPoint(c.sMin,c.nMax),livingScienceCourtyardPoint(c.sMax,c.nMin),livingScienceCourtyardPoint(c.sMax,c.nMax)];return{minX:Math.min(...p.map(q=>q.x)),maxX:Math.max(...p.map(q=>q.x)),minZ:Math.min(...p.map(q=>q.z)),maxZ:Math.max(...p.map(q=>q.z))};}
