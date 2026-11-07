import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { BreakableSpec, StaticSpec } from './scene';

export type Target = BreakableSpec & {body:RAPIER.RigidBody|null; hp:number; originalColor:THREE.Color; flash:number; box:THREE.Box3};
export type Debris = {body:RAPIER.RigidBody; size:THREE.Vector3; color:THREE.Color; age:number};
const WORLD = 0x00010007, PLAYER = 0x00040001, DEBRIS = 0x00020001;
const LOAD_RADIUS=75, UNLOAD_RADIUS=110, FOCUS_STEP=25, CELL_SIZE=100;
type VehicleState={id:number;position:{x:number;y:number;z:number};rotation:{x:number;y:number;z:number;w:number};width:number;height:number;length:number};
type LogicalTarget={position:THREE.Vector3;rotation:THREE.Quaternion;matrix:THREE.Matrix4;geometry:THREE.BufferGeometry;queryMesh?:THREE.Mesh};

export class Simulation {
  world: RAPIER.World;
  targets: Target[];
  debris: Debris[]=[];
  player:RAPIER.RigidBody;
  playerCollider:RAPIER.Collider;
  controller:RAPIER.KinematicCharacterController;
  destroyed=0;
  grounded=false;
  velocityY=0;
  maxDebris=100;
  private focus=new THREE.Vector3(Infinity,0,Infinity);
  private cells=new Map<string,Target[]>();
  private loaded=new Set<Target>();
  private debrisLoaded=new Set<Target>();
  private logicalTargets=new Map<Target,LogicalTarget>();
  private queryOwners=new Map<THREE.Object3D,Target>();
  private vehicles=new Map<number,RAPIER.RigidBody>();
  private terrain?:{vertices:Float32Array;indices:Uint32Array;heightAt:(x:number,z:number)=>number};
  constructor(specs:BreakableSpec[], statics:StaticSpec[], public spawn:THREE.Vector3, public bounds:{minX:number;maxX:number;minZ:number;maxZ:number}, terrain?:{vertices:Float32Array;indices:Uint32Array;heightAt:(x:number,z:number)=>number}) {
    this.terrain=terrain;
    this.world=new RAPIER.World({x:0,y:-18,z:0});
    this.world.timestep=1/60;
    if(terrain)this.world.createCollider(RAPIER.ColliderDesc.trimesh(terrain.vertices,terrain.indices).setCollisionGroups(WORLD));
    else this.world.createCollider(RAPIER.ColliderDesc.cuboid(300,.5,300).setTranslation(0,-.5,0).setCollisionGroups(WORLD));
    for(const s of statics){
      const d=RAPIER.ColliderDesc.cuboid(s.size.x/2,s.size.y/2,s.size.z/2).setTranslation(s.position.x,s.position.y,s.position.z).setCollisionGroups(WORLD);
      if(s.quaternion)d.setRotation(s.quaternion);
      this.world.createCollider(d);
    }
    this.targets=[];
    for(const _ of this.prepareTargets(specs)){ /* 동기 생성도 같은 과정을 따른다. */ }
    this.player=this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x,spawn.y-.82,spawn.z));
    this.playerCollider=this.world.createCollider(RAPIER.ColliderDesc.capsule(.5,.35).setCollisionGroups(PLAYER),this.player);
    this.controller=this.world.createCharacterController(.02);
    // 짧은 발판에서도 다음 단까지의 여유 공간을 확보하면 자동으로 오른다.
    this.controller.enableAutostep(.38,.1,false);
    this.controller.enableSnapToGround(.25);
    this.controller.setMaxSlopeClimbAngle(Math.PI/4);
    this.reset();
  }
  *prepareTargets(specs:BreakableSpec[]){
    const queryGeometries=new Map<THREE.BufferGeometry,THREE.BufferGeometry>();
    if(this.targets.length)throw new Error('Targets are already initialized');
    for(const s of specs){
      if(this.targets.length%128===0)yield '충돌과 파괴 기능 준비 중';
      const source=Array.isArray(s.mesh.material)?s.mesh.material[0]:s.mesh.material;
      const color=(source as THREE.MeshStandardMaterial).color?.clone()??new THREE.Color('#a9b1b7');
      s.mesh.material=source.clone();
      // 렌더 월드가 반사되기 전에 논리 변환을 캡처한다. 비로드 질의에는 렌더 부모를 쓰지 않는다.
      s.mesh.updateWorldMatrix(true,false);
      let geometry=queryGeometries.get(s.mesh.geometry);
      if(!geometry){geometry=s.mesh.geometry.clone();queryGeometries.set(s.mesh.geometry,geometry);}
      if(!geometry.boundingBox)geometry.computeBoundingBox();
      const position=new THREE.Vector3(),rotation=new THREE.Quaternion();
      s.mesh.matrixWorld.decompose(position,rotation,new THREE.Vector3());
      const target:Target={...s,size:s.size.clone(),collisionVertices:s.collisionVertices?.slice(),body:null,hp:s.toughness,originalColor:color,flash:0,box:geometry.boundingBox!.clone().applyMatrix4(s.mesh.matrixWorld)};
      this.logicalTargets.set(target,{position,rotation,geometry,matrix:s.mesh.matrixWorld.clone()});
      this.targets.push(target);
    }
    for(const t of this.targets)for(let x=Math.floor(t.box.min.x/CELL_SIZE);x<=Math.floor(t.box.max.x/CELL_SIZE);x++)for(let z=Math.floor(t.box.min.z/CELL_SIZE);z<=Math.floor(t.box.max.z/CELL_SIZE);z++){
      const key=`${x},${z}`,list=this.cells.get(key)??[];list.push(t);this.cells.set(key,list);
    }
  }
  private addTarget(t:Target){
    const logical=this.logicalTargets.get(t)!;
    const shape=t.collisionVertices?RAPIER.ColliderDesc.convexHull(t.collisionVertices):RAPIER.ColliderDesc.cuboid(t.size.x/2,t.size.y/2,t.size.z/2);
    if(!shape)throw new Error(`Invalid convex collision shape: ${t.label}`);
    t.body=this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(logical.position.x,logical.position.y,logical.position.z).setRotation(logical.rotation));
    this.world.createCollider(shape.setCollisionGroups(WORLD),t.body);
    this.loaded.add(t);
  }
  private queryMesh(t:Target){
    const logical=this.logicalTargets.get(t)!;
    if(!logical.queryMesh){
      const mesh=new THREE.Mesh(logical.geometry,t.mesh.material);
      mesh.matrixAutoUpdate=false;mesh.matrix.copy(logical.matrix);mesh.updateMatrixWorld(true);
      logical.queryMesh=mesh;this.queryOwners.set(mesh,t);
    }
    return logical.queryMesh;
  }
  private candidates(minX:number,maxX:number,minZ:number,maxZ:number){
    const seen=new Set<Target>(),targets:Target[]=[];
    for(let x=Math.floor(minX/CELL_SIZE);x<=Math.floor(maxX/CELL_SIZE);x++)for(let z=Math.floor(minZ/CELL_SIZE);z<=Math.floor(maxZ/CELL_SIZE);z++)for(const t of this.cells.get(`${x},${z}`)??[]){
      if(t.hp>0&&!seen.has(t)){seen.add(t);targets.push(t);}
    }
    return targets;
  }
  nearby(point:THREE.Vector3,radius:number){
    return this.candidates(point.x-radius,point.x+radius,point.z-radius,point.z+radius).filter(t=>t.box.distanceToPoint(point)<radius);
  }
  private removeTarget(t:Target){
    if(t.body)this.world.removeRigidBody(t.body);t.body=null;this.loaded.delete(t);
  }
  setFocus(point:THREE.Vector3,force=false){
    if(!force&&point.distanceTo(this.focus)<FOCUS_STEP)return;
    this.focus.copy(point);
    for(const t of this.loaded)if(t.hp<=0||t.box.distanceToPoint(point)>UNLOAD_RADIUS&&!this.debrisLoaded.has(t))this.removeTarget(t);
    for(const t of this.nearby(point,LOAD_RADIUS))if(!t.body)this.addTarget(t);
  }
  teleport(position:THREE.Vector3){
    this.velocityY=0;this.grounded=false;this.setFocus(position,true);
    const p={x:position.x,y:position.y-.82,z:position.z};
    this.player.setTranslation(p,true);this.player.setNextKinematicTranslation(p);this.syncDebrisCollisions(this.world.timestep);this.world.step();
  }
  explode(point:THREE.Vector3,radius:number,power:number,direction:THREE.Vector3){
    let count=0;
    for(const t of this.nearby(point,radius)){
      const damage=power*(1-.45*t.box.distanceToPoint(point)/radius);
      if(this.hit(t,damage,direction))count++;
    }
    return count;
  }
  castUnloadedTargets(origin:THREE.Vector3,direction:THREE.Vector3,distance:number){
    const ray=new THREE.Raycaster(origin,direction,0,distance),end=origin.clone().addScaledVector(direction,distance),intersection=new THREE.Vector3();
    const candidates=this.candidates(Math.min(origin.x,end.x),Math.max(origin.x,end.x),Math.min(origin.z,end.z),Math.max(origin.z,end.z)).filter(t=>!t.body&&(t.box.containsPoint(origin)||ray.ray.intersectBox(t.box,intersection)!==null&&intersection.distanceToSquared(origin)<=distance*distance)).map(t=>this.queryMesh(t));
    const hit=ray.intersectObjects(candidates,false)[0];
    if(!hit)return null;
    const target=this.queryOwners.get(hit.object)!;
    return {...hit,object:target.mesh,target};
  }
  private syncDebrisCollisions(dt:number){
    if(!this.debris.length&&!this.debrisLoaded.size)return;
    const needed=new Set<Target>(),box=new THREE.Box3(),start=new THREE.Vector3(),end=new THREE.Vector3();
    for(const d of this.debris){
      const p=d.body.translation(),v=d.body.linvel(),reach=d.size.length()/2+.08;
      start.set(p.x,p.y,p.z);end.set(p.x+v.x*dt,p.y+v.y*dt-9*dt*dt,p.z+v.z*dt);
      if(Math.max(start.distanceTo(this.focus),end.distanceTo(this.focus))+reach<LOAD_RADIUS)continue;
      // 파편의 회전을 포함한 반경으로 다음 물리 프레임의 이동 구간만 덮는다.
      box.setFromPoints([start,end]).expandByScalar(reach);
      for(const t of this.candidates(box.min.x,box.max.x,box.min.z,box.max.z))if(t.box.intersectsBox(box)){needed.add(t);if(!t.body)this.addTarget(t);}
    }
    for(const t of this.debrisLoaded)if(!needed.has(t)&&t.box.distanceToPoint(this.focus)>UNLOAD_RADIUS)this.removeTarget(t);
    this.debrisLoaded=needed;
  }
  syncVehicles(states:VehicleState[]){
    const alive=new Set(states.map(s=>s.id));
    for(const [id,body] of this.vehicles)if(!alive.has(id)){this.world.removeRigidBody(body);this.vehicles.delete(id);}
    for(const s of states){
      let body=this.vehicles.get(s.id);
      if(!body){
        body=this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(s.position.x,s.position.y,s.position.z).setRotation(s.rotation));
        this.world.createCollider(RAPIER.ColliderDesc.cuboid(s.width/2,s.height/2,s.length/2).setTranslation(0,s.height/2,0).setCollisionGroups(WORLD),body);this.vehicles.set(s.id,body);
      }
      body.setNextKinematicTranslation(s.position);body.setNextKinematicRotation(s.rotation);
    }
  }
  reset(){
    for(const body of this.vehicles.values())this.world.removeRigidBody(body);this.vehicles.clear();
    for(const d of this.debris)this.world.removeRigidBody(d.body);
    this.debris=[];
    for(const t of this.targets){
      if(t.body)this.world.removeRigidBody(t.body);t.body=null;
      t.mesh.visible=true;t.hp=t.toughness;t.flash=0;
      (t.mesh.material as THREE.MeshStandardMaterial).color.copy(t.originalColor);
    }
    this.loaded.clear();this.debrisLoaded.clear();
    this.destroyed=0;this.velocityY=0;this.grounded=false;
    this.setFocus(this.spawn,true);
    const p={x:this.spawn.x,y:this.spawn.y-.82,z:this.spawn.z};
    this.player.setTranslation(p,true);this.player.setNextKinematicTranslation(p);
    this.world.step();
  }
  step(dt:number,x:number,z:number,jump:boolean){
    const p=this.player.translation();
    this.setFocus(new THREE.Vector3(p.x,p.y,p.z));
    if(this.terrain&&p.y<this.terrain.heightAt(p.x,p.z)-10){this.teleport(new THREE.Vector3(p.x,this.terrain.heightAt(p.x,p.z)+2,p.z));return;}
    if(jump&&this.grounded)this.velocityY=7;
    this.velocityY=Math.max(this.velocityY-18*dt,-25);
    this.controller.computeColliderMovement(this.playerCollider,{x:x*dt,y:this.velocityY*dt,z:z*dt},RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC,PLAYER);
    const m=this.controller.computedMovement();
    this.grounded=this.controller.computedGrounded();
    if(this.grounded&&this.velocityY<0)this.velocityY=-.1;
    if(this.velocityY>0&&m.y<this.velocityY*dt*.5)this.velocityY=0;
    this.player.setNextKinematicTranslation({x:THREE.MathUtils.clamp(p.x+m.x,this.bounds.minX,this.bounds.maxX),y:p.y+m.y,z:THREE.MathUtils.clamp(p.z+m.z,this.bounds.minZ,this.bounds.maxZ)});
    this.syncDebrisCollisions(dt);
    this.world.timestep=dt;this.world.step();
    for(let i=this.debris.length-1;i>=0;i--){
      const d=this.debris[i];d.age+=dt;
      if(d.age>12||d.body.translation().y< -500){this.world.removeRigidBody(d.body);this.debris.splice(i,1);}
    }
    for(const t of this.loaded)if(t.flash>0){
      t.flash=Math.max(0,t.flash-dt*3);
      (t.mesh.material as THREE.MeshStandardMaterial).color.copy(t.originalColor).lerp(new THREE.Color('#b8e8ff'),t.flash*.65);
    }
  }
  hit(t:Target,power:number,direction:THREE.Vector3):boolean{
    if(t.hp<=0)return false;
    t.hp-=power;t.flash=1;
    if(t.hp>0)return false;
    this.removeTarget(t);this.debrisLoaded.delete(t);t.mesh.visible=false;this.destroyed++;
    const divisions=t.size.toArray().map(v=>Math.max(1,Math.min(4,Math.ceil(v/1.15))));
    // Keep each impact bounded even for the longest gate beams.
    while(divisions[0]*divisions[1]*divisions[2]>16){const i=divisions.indexOf(Math.max(...divisions));divisions[i]--;}
    const s=new THREE.Vector3(t.size.x/divisions[0],t.size.y/divisions[1],t.size.z/divisions[2]);
    const logical=this.logicalTargets.get(t)!;
    for(let x=0;x<divisions[0];x++)for(let y=0;y<divisions[1];y++)for(let z=0;z<divisions[2];z++){
      while(this.debris.length>=this.maxDebris){const old=this.debris.shift()!;this.world.removeRigidBody(old.body);}
      const local=new THREE.Vector3((x+.5)*s.x-t.size.x/2,(y+.5)*s.y-t.size.y/2,(z+.5)*s.z-t.size.z/2);
      const pos=local.applyQuaternion(logical.rotation).add(logical.position);
      const body=this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x,pos.y,pos.z).setRotation(logical.rotation).setLinearDamping(.35).setAngularDamping(.7).setCcdEnabled(true));
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(s.x*.46,s.y*.46,s.z*.46).setCollisionGroups(DEBRIS).setFriction(.7).setRestitution(.15),body);
      body.setLinvel({x:direction.x*5+(Math.random()-.5)*5,y:3+Math.random()*5,z:direction.z*5+(Math.random()-.5)*5},true);
      body.setAngvel({x:Math.random()*4-2,y:Math.random()*4-2,z:Math.random()*4-2},true);
      this.debris.push({body,size:s.clone().multiplyScalar(.94),color:t.originalColor.clone(),age:0});
    }
    return true;
  }
}
