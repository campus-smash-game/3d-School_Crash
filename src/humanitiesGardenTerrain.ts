import { applyHumanitiesGardenCorrection, humanitiesGardenCorrectionBounds, humanitiesGardenLocal, humanitiesGardenSplitLines } from './humanitiesGardenSite';

type Vertex = [number, number, number, number, number];
type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };

/** 아방궁 쉼터의 평평한 바닥을 주변 지형에 연결한다. */
export function* cutHumanitiesGardenTerrainSteps(positions: number[], indices: number[], datumOffset: number) {
  let startupWork=0;
  const bounds = humanitiesGardenCorrectionBounds(), lines = humanitiesGardenSplitLines();
  const originalVertexCount = positions.length / 3, originalTriangleCount = indices.length / 3;
  const output: number[] = [], changedTriangles: number[][] = [], vertices = new Map<string, number>();
  // 보정 밖의 기존 정점을 재사용해 이웃 면과 인덱스도 공유한다.
  for(let i=0;i<originalVertexCount;i++){
    if((++startupWork&255)===0)yield '지형과 경사로 준비 중';
    const x=positions[i*3],y=positions[i*3+1],z=positions[i*3+2];
    if(Math.fround(applyHumanitiesGardenCorrection(x,z,y,datumOffset))===y)vertices.set(`${x},${z}`,i);
  }
  let touchedTriangles = 0;
  const insideBounds = (p: Vertex[]) => Math.max(...p.map(v => v[0])) >= bounds.minX && Math.min(...p.map(v => v[0])) <= bounds.maxX && Math.max(...p.map(v => v[2])) >= bounds.minZ && Math.min(...p.map(v => v[2])) <= bounds.maxZ;
  type Projection = (p: Vertex) => number;
  function split(poly: Vertex[], project: Projection, value: number) {
    const halves: Vertex[][] = [[], []];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], da = project(a) - value, db = project(b) - value;
      if (da <= 1e-9) halves[0].push(a);
      if (da >= -1e-9) halves[1].push(a);
      if ((da < -1e-9 && db > 1e-9) || (da > 1e-9 && db < -1e-9)) {
        const t = da / (da - db), p = a.map((v, k) => v + (b[k] - v) * t) as Vertex;
        halves[0].push(p); halves[1].push(p);
      }
    }
    return halves.filter(p => p.length >= 3);
  }
  function add(p: Vertex) {
    const x = Math.fround(p[0]), z = Math.fround(p[2]), y = Math.fround(applyHumanitiesGardenCorrection(x, z, p[1], datumOffset));
    const key = `${x},${z}`, cached = vertices.get(key);
    if (cached !== undefined) return cached;
    const index = positions.length / 3; positions.push(x, y, z); vertices.set(key, index); return index;
  }
  const cuts:{project:Projection;value:number;bounds?:Bounds}[]=[
    ...[bounds.minX,bounds.maxX].map(value=>({project:(p:Vertex)=>p[0],value})),
    ...[bounds.minZ,bounds.maxZ].map(value=>({project:(p:Vertex)=>p[2],value})),
    ...lines.s.map(value=>({project:(p:Vertex)=>p[3],value})),...lines.n.map(value=>({project:(p:Vertex)=>p[4],value}))];

  for (let i = 0; i < indices.length; i += 3) {
    if((++startupWork&255)===0)yield '지형과 경사로 준비 중';
    const ids = indices.slice(i, i + 3), triangle = ids.map(k => {
      const x = positions[k * 3], y = positions[k * 3 + 1], z = positions[k * 3 + 2], p = humanitiesGardenLocal(x, z);
      return [x, y, z, p.s, p.n] as Vertex;
    });
    if (!insideBounds(triangle)) { output.push(...ids); continue; }
    touchedTriangles++;
    let polygons = [triangle];
    for(const {project,value,bounds:q} of cuts)polygons=polygons.flatMap(poly=>{if(q&&(Math.max(...poly.map(p=>p[0]))<q.minX||Math.min(...poly.map(p=>p[0]))>q.maxX||Math.max(...poly.map(p=>p[2]))<q.minZ||Math.min(...poly.map(p=>p[2]))>q.maxZ))return[poly];const values=poly.map(project);return Math.min(...values)<value-1e-9&&Math.max(...values)>value+1e-9?split(poly,project,value):[poly];});
    for (const polygon of polygons) for (let j = 1; j + 1 < polygon.length; j++) {
    if((++startupWork&255)===0)yield '지형과 경사로 준비 중';
      const p = [polygon[0], polygon[j], polygon[j + 1]], area = (p[1][0] - p[0][0]) * (p[2][2] - p[0][2]) - (p[2][0] - p[0][0]) * (p[1][2] - p[0][2]);
      if (Math.abs(area) < 1e-9) continue;
      const next = p.map(add), xyz = next.flatMap(k => positions.slice(k * 3, k * 3 + 3));
      const roundedArea = (xyz[3] - xyz[0]) * (xyz[8] - xyz[2]) - (xyz[6] - xyz[0]) * (xyz[5] - xyz[2]);
      if (Math.abs(roundedArea) < 1e-9) continue;
      output.push(...next);
    }
  }
  // 절단선이 원래 면의 변을 지나면 이웃 면에도 같은 정점을 넣는다.
  // 지형을 바꾸지 않은 면까지 경계 정점을 공유해야 물리 메시의 열린 변이 남지 않는다.
  const edgeKey=(a:number,b:number)=>a<b?`${a},${b}`:`${b},${a}`;
  const edges=new Map<string,{a:number;b:number;count:number}>();
  for(let i=0;i<output.length;i+=3)for(let j=0;j<3;j++){
    if((++startupWork&255)===0)yield '지형과 경사로 준비 중';
    const a=output[i+j],b=output[i+(j+1)%3],key=edgeKey(a,b),edge=edges.get(key);
    if(edge)edge.count++;else edges.set(key,{a,b,count:1});
  }
  const boundaryEdges=[...edges.values()].filter(e=>e.count===1),boundaryVertices=[...new Set(boundaryEdges.flatMap(e=>[e.a,e.b]))];
  const splits=new Map<string,number[]>();
  for(const{a,b}of boundaryEdges){
    if((++startupWork&255)===0)yield '지형과 경사로 준비 중';
    const ax=positions[a*3],az=positions[a*3+2],dx=positions[b*3]-ax,dz=positions[b*3+2]-az,sq=dx*dx+dz*dz;
    if(Math.max(ax,ax+dx)<bounds.minX-25||Math.min(ax,ax+dx)>bounds.maxX+25||Math.max(az,az+dz)<bounds.minZ-25||Math.min(az,az+dz)>bounds.maxZ+25)continue;
    const found:{id:number;t:number}[]=[];
    for(const id of boundaryVertices){
    if((++startupWork&255)===0)yield '지형과 경사로 준비 중';
      if(id===a||id===b)continue;
      const x=positions[id*3],z=positions[id*3+2],t=((x-ax)*dx+(z-az)*dz)/sq;
      if(t<=1e-6||t>=1-1e-6)continue;
      // 국소 분할 끝의 새 정점은 보정 후 높이가 원래 변의 선형 보간과 다를 수 있다.
      // 하나의 높이장인 지형에서는 같은 XZ 변 위의 정점을 양쪽 면이 함께 사용한다.
      const coordinateUlp=2**(Math.floor(Math.log2(Math.max(1,Math.abs(x),Math.abs(z),Math.abs(ax),Math.abs(az))))-23);
      if(Math.hypot(x-ax-t*dx,z-az-t*dz)<coordinateUlp*2)found.push({id,t});
    }
    if(found.length)splits.set(edgeKey(a,b),found.sort((p,q)=>a<b?p.t-q.t:q.t-p.t).map(p=>p.id));
  }
  const conformed:number[]=[];let stitchedTriangles=0;
  for(let i=0;i<output.length;i+=3){
    if((++startupWork&255)===0)yield '지형과 경사로 준비 중';
    const ids=output.slice(i,i+3),polygon:number[]=[];
    for(let j=0;j<3;j++){
    if((++startupWork&255)===0)yield '지형과 경사로 준비 중';const a=ids[j],b=ids[(j+1)%3],extra=splits.get(edgeKey(a,b));polygon.push(a);if(extra)polygon.push(...(a<b?extra:[...extra].reverse()));}
    if(polygon.length===3){conformed.push(...ids);continue;}
    stitchedTriangles++;
    const center=positions.length/3;
    for(let k=0;k<3;k++)positions.push(Math.fround(ids.reduce((sum,id)=>sum+positions[id*3+k],0)/3));
    for(let j=0;j<polygon.length;j++)conformed.push(center,polygon[j],polygon[(j+1)%polygon.length]);
  }
  indices.length = 0; for (const index of conformed) indices.push(index);
  for(let i=0;i<indices.length;i+=3){
    if((++startupWork&255)===0)yield '지형과 경사로 준비 중';
    const xyz=indices.slice(i,i+3).flatMap(k=>positions.slice(k*3,k*3+3));
    if(Math.max(xyz[0],xyz[3],xyz[6])>=bounds.minX-25&&Math.min(xyz[0],xyz[3],xyz[6])<=bounds.maxX+25&&Math.max(xyz[2],xyz[5],xyz[8])>=bounds.minZ-25&&Math.min(xyz[2],xyz[5],xyz[8])<=bounds.maxZ+25)changedTriangles.push(xyz);
  }
  const cellSize = 8, buckets = new Map<string, number[]>();
  changedTriangles.forEach((p, id) => {
    const minX = Math.floor(Math.min(p[0], p[3], p[6]) / cellSize), maxX = Math.floor(Math.max(p[0], p[3], p[6]) / cellSize);
    const minZ = Math.floor(Math.min(p[2], p[5], p[8]) / cellSize), maxZ = Math.floor(Math.max(p[2], p[5], p[8]) / cellSize);
    for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) { const key = `${x},${z}`, list = buckets.get(key) ?? []; list.push(id); buckets.set(key, list); }
  });
  function heightAt(x: number, z: number): number | undefined {
    const candidates = buckets.get(`${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`) ?? [];
    for (const id of candidates) {
      const p = changedTriangles[id], dx = p[3] - p[0], dz = p[5] - p[2], ex = p[6] - p[0], ez = p[8] - p[2], det = dx * ez - dz * ex;
      const u = ((x - p[0]) * ez - (z - p[2]) * ex) / det, v = (dx * (z - p[2]) - dz * (x - p[0])) / det;
      if (u >= -1e-7 && v >= -1e-7 && u + v <= 1 + 1e-7) return p[1] + u * (p[4] - p[1]) + v * (p[7] - p[1]);
    }
    return undefined;
  }
  return { heightAt, bounds: bounds as Bounds, metadata: { originalVertexCount, originalTriangleCount, vertexCount: positions.length / 3, triangleCount: indices.length / 3, touchedTriangles, stitchedTriangles, patchTriangles: changedTriangles.length, datumOffset, rawDEMModified: false, dimensionsEstimated: true } };
}

export function cutHumanitiesGardenTerrain(...args:Parameters<typeof cutHumanitiesGardenTerrainSteps>){
  const steps=cutHumanitiesGardenTerrainSteps(...args);let result=steps.next();
  while(!result.done)result=steps.next();
  return result.value;
}
