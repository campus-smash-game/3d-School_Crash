import { applyEducation12Correction, education12CorrectionBounds, education12Local, education12SplitLines, education12BoundarySegments } from './education12Site';
import { applyEducation1112Correction, education1112BoundarySegments } from './education1112Site';
import { cutTerrainPatch } from './terrainPatch';
/** 12동의 두 보행 높이와 카페 앞 차도를 기존 삼각형 경계에 연결한다. */
export function cutEducation12Terrain(positions:number[],indices:number[],datumOffset:number,connected=false){
  return cutTerrainPatch(positions,indices,datumOffset,{
    apply:(x,z,y,offset)=>{const base=applyEducation12Correction(x,z,y,offset);return connected?applyEducation1112Correction(x,z,base,offset):base;},
    bounds:education12CorrectionBounds(),lines:education12SplitLines(),local:education12Local,
    boundarySegments:[...education12BoundarySegments(),...(connected?education1112BoundarySegments():[])]
  });
}
