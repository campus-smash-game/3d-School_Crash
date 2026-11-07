import * as THREE from 'three';

type Position = Readonly<{x:number;y:number;z:number}>;

// 논리 좌표는 동/위/북, 렌더 좌표는 동/위/남이다. H의 역변환도 H다.
export function dataToRenderPoint(value:Position,out=new THREE.Vector3()):THREE.Vector3 {
  return out.set(value.x,value.y,-value.z);
}

export function renderToDataPoint(value:Position,out=new THREE.Vector3()):THREE.Vector3 {
  return out.set(value.x,value.y,-value.z);
}

export function dataToRenderDirection(value:Position,out=new THREE.Vector3()):THREE.Vector3 {
  return out.set(value.x,value.y,-value.z);
}

export function renderToDataDirection(value:Position,out=new THREE.Vector3()):THREE.Vector3 {
  return out.set(value.x,value.y,-value.z);
}

// 지리 방위각은 북쪽이 0이며, 동쪽으로 돌 때 증가한다.
export function bearingForward(bearing:number,out=new THREE.Vector3()):THREE.Vector3 {
  return out.set(Math.sin(bearing),0,Math.cos(bearing));
}

export function bearingRight(bearing:number,out=new THREE.Vector3()):THREE.Vector3 {
  return out.set(Math.cos(bearing),0,-Math.sin(bearing));
}

export function bearingMovement(bearing:number,moveX:number,moveZ:number,out=new THREE.Vector3()):THREE.Vector3 {
  const sin=Math.sin(bearing),cos=Math.cos(bearing);
  return out.set(moveX*cos+moveZ*sin,0,-moveX*sin+moveZ*cos);
}
