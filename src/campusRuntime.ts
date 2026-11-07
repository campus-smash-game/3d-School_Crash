import * as THREE from 'three';
import type {createTerrain} from './terrain';
import type {createCampus} from './scene';
import type {createFullCampus} from './fullCampus';
import type {BreakableSpec} from './scene';
import {decodeCampusSnapshot,campusDecoderReady} from './campusSnapshot';
import {updaters,snapshotUrl} from './generated/campusUpdaters';

export type CampusSnapshot = {
  scene:THREE.Scene;
  terrain:Pick<ReturnType<typeof createTerrain>,'heightAt'|'vertices'|'indices'|'bounds'>;
  gate:ReturnType<typeof createCampus>;
  campus:ReturnType<typeof createFullCampus>;
  facilities:{breakables:BreakableSpec[];update:(player:THREE.Vector3)=>void}[];
};

export async function loadCampus(world:THREE.Scene,progress:(message:string)=>void):Promise<CampusSnapshot>{
  progress('캠퍼스 불러오는 중');
  const response=await fetch(snapshotUrl);
  if(!response.ok||!response.body)throw new Error('Campus snapshot: '+response.status);
  const [buffer]=await Promise.all([new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer(),campusDecoderReady]);
  progress('캠퍼스 연결 중');
  const result:CampusSnapshot=decodeCampusSnapshot(buffer,updaters);
  for(const child of [...result.scene.children])world.add(child);
  return result;
}
