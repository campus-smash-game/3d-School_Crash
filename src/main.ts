import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {createCampus} from './scene';
import {createFullCampusSteps, type CampusData} from './fullCampus';
import {createTerrainSteps, type TerrainData} from './terrain';
import {runStartupSteps,yieldToBrowser} from './startup';
import {Controls} from './controls';
import {Simulation} from './physics';
import {Traffic} from './traffic';
import {createTransitFacilities,type TransitFacilitiesPlan} from './transitFacilities';
import {createCentralPlazaFacilities} from './centralPlazaFacilities';
import {createAdministrationPlazaFacilities} from './administrationPlazaFacilities';
import {createInformationCourtApproach} from './informationCourtApproach';
import {createAdministrationPlazaGround} from './administrationPlazaGround';
import {createGyujanggakApproach} from './gyujanggakApproach';
import type {TransitPlan} from './transitTypes';
import {Cannon} from './cannon';
import {Minimap} from './minimap';
import {dataToRenderPoint, renderToDataDirection, bearingMovement} from './coordinates';
import './style.css';

const canvas=document.querySelector<HTMLCanvasElement>('#game')!;
const controls=new Controls(canvas);
const mobile=matchMedia('(pointer: coarse)').matches;
type ShuttleStart={id:string;name:string;x:number;z:number;bearing:number};
async function load<T>(path:string):Promise<T>{
  const response=await fetch(path);if(!response.ok)throw new Error(`${path}: ${response.status}`);return response.json();
}
async function boot(){
  const progress=(message:string)=>controls.setLoading(message);
  const stage=async<T>(message:string,build:()=>T)=>{progress(message);await yieldToBrowser();return build();};
  progress('캠퍼스 자료 불러오는 중');
  await yieldToBrowser();
  const renderer=new THREE.WebGLRenderer({canvas,antialias:!mobile,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,mobile?1.25:1.6));renderer.setSize(innerWidth,innerHeight);
  renderer.shadowMap.enabled=!mobile;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#bbd5e3');scene.fog=new THREE.Fog('#ccdde0',1200,6500);
  const world=new THREE.Scene();world.name='campus-world';scene.add(world);
  world.add(new THREE.HemisphereLight('#e1efff','#899477',2.4));
  const sun=new THREE.DirectionalLight('#fff0ce',3.1);sun.position.set(-35,70,30);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-85,right:85,top:85,bottom:-85,near:1,far:250});sun.shadow.camera.updateProjectionMatrix();sun.shadow.normalBias=.08;sun.shadow.bias=-.0002;world.add(sun,sun.target);
  const camera=new THREE.PerspectiveCamera(innerWidth<innerHeight?78:65,innerWidth/innerHeight,.08,7500);camera.rotation.order='YXZ';scene.add(camera);
  const [data,terrainData,transitPlan,shuttleStops,facilitiesPlan]=await Promise.all([load<CampusData>('data/campus.json'),load<TerrainData>('data/terrain.json'),load<TransitPlan>('data/campus-transit.json'),load<{stops:ShuttleStart[]}>('data/shuttle-stops.json'),load<TransitFacilitiesPlan>('data/transit-facilities.json'),RAPIER.init()]);
  data.roads=[...data.roads,...(transitPlan?.supplementalRoads??[])];
  const terrain=await runStartupSteps(createTerrainSteps(world,terrainData,data.buildings),progress);
  const gate=await stage('정문 준비 중',()=>createCampus(world,{full:true}));
  const campus=await runStartupSteps(createFullCampusSteps(world,data,terrain.heightAt),progress);
  const transitFacilities=await stage('버스 정류장 준비 중',()=>createTransitFacilities(world,facilitiesPlan,terrain.heightAt));
  const centralPlaza=await stage('중앙광장 준비 중',()=>createCentralPlazaFacilities(world,terrain.heightAt));
  const administrationPlaza=await stage('행정관 주변 준비 중',()=>createAdministrationPlazaFacilities(world,data,terrain.heightAt));
  const informationCourt=await stage('보행로 준비 중',()=>createInformationCourtApproach(world,terrain.heightAt));
  const administrationGround=await stage('광장 보도 준비 중',()=>createAdministrationPlazaGround(world,terrain.heightAt));
  const gyujanggakApproach=await stage('규장각 주변 준비 중',()=>createGyujanggakApproach(world,terrain.heightAt));
  const updateFacilities=(player:THREE.Vector3)=>{transitFacilities.update(player);centralPlaza.update(player);administrationPlaza.update(player);informationCourt.update(player);administrationGround.update(player);gyujanggakApproach.update(player);};
  const bounds={minX:data.bounds.minX-100,maxX:data.bounds.maxX+100,minZ:data.bounds.minZ-100,maxZ:data.bounds.maxZ+100};
  const firstStop=shuttleStops.stops[0];
  if(!firstStop)throw new Error('No campus shuttle starting stops');
  let selectedStart=firstStop;
  const startPoint=new THREE.Vector3(firstStop.x,terrain.heightAt(firstStop.x,firstStop.z)+1.8,firstStop.z);
  const sim=await stage('충돌과 파괴 기능 준비 중',()=>new Simulation([],[...gate.colliders,...campus.colliders],startPoint,bounds,terrain));
  await runStartupSteps(sim.prepareTargets([...gate.breakables,...campus.breakables,...transitFacilities.breakables,...centralPlaza.breakables,...administrationPlaza.breakables,...informationCourt.breakables,...administrationGround.breakables,...gyujanggakApproach.breakables]),progress);
  sim.reset();
  sim.maxDebris=mobile?64:120;
  const traffic=await stage('버스와 자동차 준비 중',()=>new Traffic(world,data.roads,terrain.heightAt,transitPlan)),cannon=new Cannon(world,camera,sim,traffic,'render');
  const minimap=new Minimap(document.querySelector<HTMLCanvasElement>('#minimap')!,data);
  const locationLabels=[...shuttleStops.stops,{id:'gate',name:'정문 광장',x:gate.spawn.x,z:gate.spawn.z},...campus.locations.filter(l=>l.id!=='gate')];
  controls.setShuttleStops(shuttleStops.stops);
  const debrisMesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({roughness:.75}),160);
  debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);debrisMesh.frustumCulled=false;debrisMesh.castShadow=!mobile;debrisMesh.count=0;world.add(debrisMesh);
  // 데이터와 물리는 동/위/북 좌표를 유지하고, 표시 계층만 동/위/남으로 바꾼다.
  world.scale.z=-1;
  const dummy=new THREE.Object3D(),direction=new THREE.Vector3(),movement=new THREE.Vector3(),dataEye=gate.spawn.clone();
  let bearing=Math.PI,pitch=.06,accumulator=0,prev=performance.now(),fps=60,frames=0,frameTime=0,mapTime=0;
  let quality:'auto'|'low'|'high'='auto',adaptiveTime=0,started=false,pendingJump=false,vehicleScore=0,targetLabel='',pickTime=0;
  const total=sim.targets.length+traffic.initialVehicleCount;
  cannon.onExplosion=(count,vehicles)=>{vehicleScore+=vehicles;if(count||vehicles)controls.notify(`${count+vehicles}개 파괴!${vehicles?` 차량 ${vehicles}대 포함`:''}`);};
  function syncCamera(){const p=sim.player.translation();dataEye.set(p.x,p.y+.82,p.z);dataToRenderPoint(dataEye,camera.position);camera.rotation.set(pitch,-bearing,0);camera.updateMatrixWorld();}
  function teleport(x:number,z:number){cannon.reset();pendingJump=false;accumulator=0;pitch=.02;sim.teleport(new THREE.Vector3(x,terrain.heightAt(x,z)+1.8,z));syncCamera();traffic.update(0,dataEye);sim.syncVehicles(traffic.collisionStates());campus.update(dataEye);}
  function selectShuttleStop(id:string){
    const stop=shuttleStops.stops.find(stop=>stop.id===id);if(!stop)return;
    selectedStart=stop;started=true;bearing=stop.bearing;
    sim.spawn.set(stop.x,terrain.heightAt(stop.x,stop.z)+1.8,stop.z);
    teleport(stop.x,stop.z);controls.updateLocation(stop.name);
  }
  controls.onTravel=selectShuttleStop;
  controls.onStart=id=>{
    if(id)selectShuttleStop(id);
    cannon.unlockAudio();prev=performance.now();accumulator=0;
  };
  controls.onReset=()=>{sim.reset();traffic.reset();cannon.reset();vehicleScore=0;bearing=selectedStart.bearing;pitch=.06;pendingJump=false;accumulator=0;syncCamera();traffic.update(0,dataEye);sim.syncVehicles(traffic.collisionStates());campus.update(dataEye);};
  controls.onSound=enabled=>cannon.setSound(enabled);
  controls.onQuality=value=>{
    quality=value;renderer.setPixelRatio(Math.min(devicePixelRatio,value==='low'?1:value==='high'?2:mobile?1.25:1.6));
    renderer.shadowMap.enabled=value==='high'||value==='auto'&&!mobile;sim.maxDebris=value==='low'?48:value==='high'?150:mobile?64:120;
    while(sim.debris.length>sim.maxDebris){const d=sim.debris.shift()!;sim.world.removeRigidBody(d.body);}
    renderer.setSize(innerWidth,innerHeight);adaptiveTime=0;
  };
  addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.fov=innerWidth<innerHeight?78:65;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);pendingJump=false;});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)controls.pause();prev=performance.now();accumulator=0;pendingJump=false;});
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();controls.pause();controls.setError('그래픽 연결이 끊겼어요. 새로고침해 주세요.');});
  function drawMap(){
    camera.getWorldDirection(direction);renderToDataDirection(direction,direction);
    minimap.update(dataEye.x,dataEye.z,Math.atan2(direction.x,direction.z),traffic);let nearest=locationLabels[0],distance=Infinity;
    for(const l of locationLabels){const d=Math.hypot(l.x-dataEye.x,l.z-dataEye.z);if(d<distance){nearest=l;distance=d;}}controls.updateLocation(nearest.name);
  }
  function aim(){
    camera.getWorldDirection(direction);renderToDataDirection(direction,direction);
    const hit=sim.world.castRay(new RAPIER.Ray(dataEye,direction),300,true,undefined,0x00040001,sim.playerCollider),remote=sim.castUnloadedTargets(dataEye,direction,300),vehicle=traffic.raycast(dataEye,direction,300);
    const distance=Math.min(hit?.timeOfImpact??Infinity,remote?.distance??Infinity);
    if(vehicle&&vehicle.distance<=distance+1e-3){targetLabel=`차량  ${Math.round(vehicle.distance)}m`;return;}
    if(remote&&remote.distance<=(hit?.timeOfImpact??Infinity)){targetLabel=`${remote.target.label}  ${Math.round(remote.distance)}m`;return;}
    if(hit){const p=dataEye.clone().addScaledVector(direction,hit.timeOfImpact),target=sim.nearby(p,1).find(t=>t.body&&t.body.handle===hit.collider.parent()?.handle);targetLabel=target?`${target.label}  ${Math.round(hit.timeOfImpact)}m`:'';}else targetLabel='';
  }
  const tick=(now:number)=>{
    requestAnimationFrame(tick);const dt=Math.min((now-prev)/1000,.05);prev=now;
    frames++;frameTime+=dt;if(frameTime>.75){fps=Math.round(frames/frameTime);frames=0;frameTime=0;}
    if(controls.active){
      started=true;const look=controls.consumeLook();bearing+=look.x*.0024;pitch=THREE.MathUtils.clamp(pitch-look.y*.0024,-1.35,1.35);
      let mx=controls.moveX,mz=controls.moveZ;const norm=Math.max(1,Math.hypot(mx,mz));mx/=norm;mz/=norm;
      const speed=controls.sprint?13:mobile?10.4:7.8;bearingMovement(bearing,mx,mz,movement).multiplyScalar(speed);
      traffic.update(dt,dataEye);sim.syncVehicles(traffic.collisionStates());
      pendingJump=controls.consumeJump()||pendingJump;accumulator+=dt;
      while(accumulator>=1/60){sim.step(1/60,movement.x,movement.z,pendingJump);pendingJump=false;accumulator-=1/60;}
      syncCamera();
      if(controls.consumeAttack())cannon.fire(false);if(controls.consumePulse())cannon.fire(true);cannon.update(dt,true);
      if(cannon.shake>0)camera.rotation.z=(Math.random()-.5)*cannon.shake*.08;
      if(quality==='auto'&&fps<32){adaptiveTime+=dt;if(adaptiveTime>4&&renderer.getPixelRatio()>1){renderer.setPixelRatio(1);renderer.shadowMap.enabled=false;renderer.setSize(innerWidth,innerHeight);adaptiveTime=0;}}
      pickTime+=dt;if(pickTime>.1){aim();pickTime=0;}
    }else{
      accumulator=0;pendingJump=false;controls.consumeLook();controls.consumeJump();controls.consumeAttack();controls.consumePulse();cannon.update(0,false);
      if(!started){dataEye.copy(gate.spawn).add(new THREE.Vector3(0,.9,0));dataToRenderPoint(dataEye,camera.position);camera.lookAt(dataToRenderPoint(new THREE.Vector3(0,5,0)));traffic.update(dt,dataEye);}
    }
    campus.update(dataEye);updateFacilities(dataEye);sun.position.copy(dataEye).add(new THREE.Vector3(-35,80,30));sun.target.position.set(dataEye.x,dataEye.y-2,dataEye.z);
    debrisMesh.count=sim.debris.length;
    sim.debris.forEach((d,i)=>{const p=d.body.translation(),q=d.body.rotation();dummy.position.set(p.x,p.y,p.z);dummy.quaternion.set(q.x,q.y,q.z,q.w);dummy.scale.copy(d.size).multiplyScalar(Math.min(1,(12-d.age)/1.5));dummy.updateMatrix();debrisMesh.setMatrixAt(i,dummy.matrix);debrisMesh.setColorAt(i,d.color);});
    debrisMesh.instanceMatrix.needsUpdate=true;if(debrisMesh.instanceColor)debrisMesh.instanceColor.needsUpdate=true;
    mapTime+=dt;if(mapTime>.2){drawMap();mapTime=0;}
    controls.updateHud(sim.destroyed+vehicleScore,total,fps,targetLabel,cannon.charge);renderer.render(scene,camera);
  };
  dataEye.copy(gate.spawn).add(new THREE.Vector3(0,.9,0));
  dataToRenderPoint(dataEye,camera.position);camera.lookAt(dataToRenderPoint(new THREE.Vector3(0,5,0)));
  campus.update(dataEye);updateFacilities(dataEye);
  await stage('첫 화면 준비 중',()=>renderer.compileAsync(scene,camera));
  controls.setReady();prev=performance.now();
  requestAnimationFrame(tick);
}
boot().catch(error=>{console.error(error);controls.setError('게임을 불러오지 못했어요. 연결 상태를 확인하고 최신 브라우저에서 새로고침해 주세요.');});
