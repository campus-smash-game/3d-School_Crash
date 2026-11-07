import * as THREE from 'three';
import type {BuildingAppearance} from './buildingAppearance';

export type DistantWall = {
  normalSign: number;
  windows: {matrix: THREE.Matrix4}[];
  trims: {matrix: THREE.Matrix4}[];
};
export type DistantRange = {
  mesh?: THREE.Mesh;
  vertexStart: number;
  vertexCount: number;
  indexStart: number;
  indexCount: number;
  shown: boolean;
  windowCount: number;
};
type Entry = {marker: THREE.Group; geometry?: THREE.BufferGeometry; range: DistantRange};
type Chunk = {x: number; z: number; entries: Entry[]; geometry?: THREE.BufferGeometry; mesh?: THREE.Mesh; dirty: boolean};

// 반복 창문을 실제 사각형으로 만들면 별도 셰이더나 확장 없이 여러 건물을 한 번에 그릴 수 있다.
export function createDistantGeometry(
  footprint: THREE.BufferGeometry, origin: THREE.Vector3, profile: BuildingAppearance, walls: DistantWall[],
) {
  const positions: number[] = [], colors: number[] = [];
  const color = new THREE.Color(), point = new THREE.Vector3();
  const push = (x: number, y: number, z: number, hex: number) => {
    positions.push(x, y, z); color.setHex(hex); colors.push(color.r, color.g, color.b);
  };
  const shell = footprint.index ? footprint.toNonIndexed() : footprint;
  const p = shell.getAttribute('position'), n = shell.getAttribute('normal');
  for (let i = 0; i < p.count; i++) push(p.getX(i) + origin.x, p.getY(i) + origin.y, p.getZ(i) + origin.z, Math.abs(n.getY(i)) > .5 ? profile.roofColor : profile.wallColor);
  if (shell !== footprint) shell.dispose();
  function plane(matrix: THREE.Matrix4, sign: number, hex: number, expansion: number, offset: number) {
    const scale = new THREE.Vector3().setFromMatrixScale(matrix);
    const halfX = .5 + expansion / Math.max(.001, scale.x), halfY = .5 + expansion / Math.max(.001, scale.y);
    for (const [x,y] of [[-halfX,-halfY],[halfX,-halfY],[halfX,halfY],[-halfX,-halfY],[halfX,halfY],[-halfX,halfY]]) {
      point.set(x,y,sign * (.5 + offset / Math.max(.001,scale.z))).applyMatrix4(matrix);
      push(point.x,point.y,point.z,hex);
    }
  }
  for (const wall of walls) {
    for (const win of wall.windows) {
      plane(win.matrix, wall.normalSign, profile.frameColor, .055, .008);
      plane(win.matrix, wall.normalSign, profile.glassColor, 0, .025);
    }
    for (const trim of wall.trims) plane(trim.matrix, wall.normalSign, profile.accentColor, 0, .025);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors,3));
  geometry.computeVertexNormals();
  return geometry;
}

// 320m 구역마다 일반 Mesh 하나를 쓴다. WEBGL_multi_draw 지원 여부에 의존하지 않는다.
export function createDistantBuildings(scene: THREE.Scene, chunkSize = 320) {
  const chunks = new Map<string,Chunk>();
  const material = new THREE.MeshStandardMaterial({vertexColors:true,roughness:.78,side:THREE.DoubleSide});
  const byMarker = new Map<THREE.Group,Chunk>();
  function add(marker: THREE.Group, geometry: THREE.BufferGeometry, x: number, z: number, windowCount: number) {
    const col = Math.floor(x/chunkSize), row = Math.floor(z/chunkSize), key = `${col}:${row}`;
    let chunk = chunks.get(key);
    if (!chunk) {chunk={x:(col+.5)*chunkSize,z:(row+.5)*chunkSize,entries:[],dirty:true};chunks.set(key,chunk);}
    const range: DistantRange={vertexStart:0,vertexCount:geometry.getAttribute('position').count,indexStart:-1,indexCount:0,shown:true,windowCount};
    marker.userData.renderRange=range;
    chunk.entries.push({marker,geometry,range});byMarker.set(marker,chunk);
  }
  function finish() {
    for (const [key,chunk] of chunks) {
      const count=chunk.entries.reduce((sum,e)=>sum+e.range.vertexCount,0);
      const positions=new Float32Array(count*3),colors=new Float32Array(count*3),normals=new Float32Array(count*3);
      let cursor=0;
      for (const entry of chunk.entries) {
        entry.range.vertexStart=cursor;
        const source=entry.geometry!;
        const p=source.getAttribute('position');
        for(let i=0;i<p.count;i++)positions.set([p.getX(i)-chunk.x,p.getY(i),p.getZ(i)-chunk.z],(cursor+i)*3);
        colors.set(source.getAttribute('color').array,cursor*3);
        normals.set(source.getAttribute('normal').array,cursor*3);
        cursor+=p.count;source.dispose();entry.geometry=undefined;
      }
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
      geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
      geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));
      geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(count),1).setUsage(THREE.DynamicDrawUsage));
      geometry.computeBoundingBox();geometry.computeBoundingSphere();
      const mesh=new THREE.Mesh(geometry,material);mesh.position.set(chunk.x,0,chunk.z);mesh.receiveShadow=true;
      mesh.name=`distant-buildings:${key}`;
      Object.assign(mesh.userData,{role:'distant-building-batch',buildingIds:chunk.entries.map(e=>e.marker.userData.buildingId)});
      chunk.geometry=geometry;chunk.mesh=mesh;
      for(const entry of chunk.entries)entry.range.mesh=mesh;
      scene.add(mesh);
    }
    flush();
  }
  function setVisible(marker: THREE.Group, shown: boolean) {
    marker.visible=shown;
    const range=marker.userData.renderRange as DistantRange;
    if(range.shown===shown)return;
    range.shown=shown;byMarker.get(marker)!.dirty=true;
  }
  function flush() {
    for(const chunk of chunks.values()) {
      if(!chunk.dirty||!chunk.geometry)continue;
      const index=chunk.geometry.getIndex()!, values=index.array as Uint32Array;
      let cursor=0;
      for(const {range} of chunk.entries) {
        range.indexStart=range.shown?cursor:-1;range.indexCount=range.shown?range.vertexCount:0;
        if(!range.shown)continue;
        for(let i=0;i<range.vertexCount;i++)values[cursor++]=range.vertexStart+i;
      }
      chunk.geometry.setDrawRange(0,cursor);chunk.mesh!.visible=cursor>0;
      index.clearUpdateRanges();index.addUpdateRange(0,cursor);index.needsUpdate=true;
      chunk.dirty=false;
    }
  }
  return {add,finish,setVisible,flush};
}
