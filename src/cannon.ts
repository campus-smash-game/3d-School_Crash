import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type {Simulation} from './physics';
import type {Traffic} from './traffic';
import {renderToDataPoint, renderToDataDirection} from './coordinates';

type Particle={p:THREE.Vector3;v:THREE.Vector3;age:number;life:number;size:number;color:THREE.Color};
class ParticleCloud{
  particles:Particle[]=[];
  mesh:THREE.InstancedMesh;
  private dummy=new THREE.Object3D();
  constructor(scene:THREE.Scene,private limit:number,private smoke:boolean){
    this.mesh=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),new THREE.MeshBasicMaterial({transparent:smoke,opacity:smoke?.46:1,depthWrite:!smoke}),limit);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.mesh.frustumCulled=false;this.mesh.count=0;scene.add(this.mesh);
  }
  emit(p:THREE.Vector3,v:THREE.Vector3,size:number,life:number,color:THREE.Color){
    if(this.particles.length>=this.limit)this.particles.shift();
    this.particles.push({p:p.clone(),v:v.clone(),age:0,life,size,color:color.clone()});
  }
  update(dt:number){
    for(let i=this.particles.length-1;i>=0;i--){const p=this.particles[i];p.age+=dt;if(p.age>p.life){this.particles.splice(i,1);continue;}p.v.y+=(this.smoke?.9:-8)*dt;p.v.multiplyScalar(Math.exp(-dt*(this.smoke?1.1:.3)));p.p.addScaledVector(p.v,dt);}
    this.mesh.count=this.particles.length;
    this.particles.forEach((p,i)=>{
      const progress=p.age/p.life,fade=Math.min(1,(1-progress)*4);
      this.dummy.position.copy(p.p);this.dummy.scale.setScalar(p.size*(this.smoke?.4+progress*2:1)*fade);this.dummy.updateMatrix();this.mesh.setMatrixAt(i,this.dummy.matrix);
      this.mesh.setColorAt(i,p.color.clone().lerp(new THREE.Color(this.smoke?'#596466':'#d34515'),progress*.7));
    });
    this.mesh.instanceMatrix.needsUpdate=true;if(this.mesh.instanceColor)this.mesh.instanceColor.needsUpdate=true;
  }
  clear(){this.particles=[];this.mesh.count=0;}
}
type Shell={mesh:THREE.Mesh;p:THREE.Vector3;velocity:THREE.Vector3;age:number;strong:boolean;trail:number};

export class Cannon{
  readonly tool=new THREE.Group();
  readonly shells:Shell[]=[];
  onExplosion?:(count:number,vehicles:number)=>void;
  private smoke:ParticleCloud;
  private sparks:ParticleCloud;
  private cooldown=0;
  private heavyCooldown=0;
  private recoil=0;
  private audio:AudioContext|null=null;
  private audioEnabled=true;
  private flash:THREE.PointLight;
  private flashes:{mesh:THREE.Mesh;age:number;radius:number}[]=[];
  private shellGeometry=new THREE.SphereGeometry(.18,8,6);
  private shellMaterial=new THREE.MeshStandardMaterial({color:'#f4bd62',emissive:'#db691c',emissiveIntensity:1.8,roughness:.4,metalness:.5});
  private flashGeometry=new THREE.SphereGeometry(1,12,8);
  shake=0;
  constructor(private scene:THREE.Scene,private camera:THREE.Camera,private sim:Simulation,private traffic:Traffic,private cameraSpace:'data'|'render'='data'){
    this.smoke=new ParticleCloud(scene,180,true);this.sparks=new ParticleCloud(scene,220,false);
    const dark=new THREE.MeshStandardMaterial({color:'#263c48',metalness:.75,roughness:.32});
    const bronze=new THREE.MeshStandardMaterial({color:'#b88445',metalness:.7,roughness:.3});
    const grip=new THREE.MeshStandardMaterial({color:'#15252b',roughness:.8});
    const cyan=new THREE.MeshStandardMaterial({color:'#83e9ff',emissive:'#18bfe2',emissiveIntensity:2});
    const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.11,.16,.65,16,1,true),dark);barrel.rotation.x=Math.PI/2;barrel.position.z=-.22;this.tool.add(barrel);
    for(const z of [-.51,-.38,.03]){const band=new THREE.Mesh(new THREE.TorusGeometry(z<-.4?.12:.15,.025,6,20),bronze);band.position.z=z;this.tool.add(band);}
    const hollow=new THREE.Mesh(new THREE.CircleGeometry(.095,16),new THREE.MeshBasicMaterial({color:'#050d12',side:THREE.DoubleSide}));hollow.position.z=-.45;this.tool.add(hollow);
    const chamber=new THREE.Mesh(new THREE.BoxGeometry(.34,.3,.3),dark);chamber.position.z=.13;this.tool.add(chamber);
    const handle=new THREE.Mesh(new THREE.BoxGeometry(.12,.28,.13),grip);handle.position.set(0,-.23,.13);handle.rotation.x=-.2;this.tool.add(handle);
    for(const x of [-.17,.17]){const strip=new THREE.Mesh(new THREE.BoxGeometry(.02,.035,.22),cyan);strip.position.set(x,.07,.12);this.tool.add(strip);}
    const sight=new THREE.Mesh(new THREE.BoxGeometry(.025,.07,.04),bronze);sight.position.set(0,.16,-.27);this.tool.add(sight);
    this.tool.position.set(.32,-.29,-.55);camera.add(this.tool);this.tool.visible=false;
    this.flash=new THREE.PointLight('#ffb74a',0,9,2);this.flash.position.set(.25,-.12,-1);camera.add(this.flash);
  }
  get charge(){return 1-this.heavyCooldown/4;}
  private cameraDataPosition(){const point=this.camera.getWorldPosition(new THREE.Vector3());return this.cameraSpace==='render'?renderToDataPoint(point,point):point;}
  setSound(enabled:boolean){this.audioEnabled=enabled;if(enabled)this.unlockAudio();}
  unlockAudio(){if(!this.audioEnabled)return;try{this.audio??=new AudioContext();void this.audio.resume();}catch{/* Sound is optional. */}}
  private boom(strong:boolean,distance=0){
    if(!this.audioEnabled||!this.audio)return;
    const t=this.audio.currentTime,g=this.audio.createGain(),o=this.audio.createOscillator(),volume=(strong?.16:.1)/Math.max(1,distance/35);
    o.type='triangle';o.frequency.setValueAtTime(strong?85:120,t);o.frequency.exponentialRampToValueAtTime(24,t+.45);g.gain.setValueAtTime(volume,t);g.gain.exponentialRampToValueAtTime(.001,t+.55);o.connect(g);g.connect(this.audio.destination);o.start();o.stop(t+.56);
    const length=Math.floor(this.audio.sampleRate*.45),b=this.audio.createBuffer(1,length,this.audio.sampleRate),a=b.getChannelData(0);for(let i=0;i<length;i++)a[i]=(Math.random()*2-1)*(1-i/length)**2;
    const noise=this.audio.createBufferSource(),filter=this.audio.createBiquadFilter(),ng=this.audio.createGain();filter.type='lowpass';filter.frequency.value=strong?1200:1800;ng.gain.value=volume*1.5;noise.buffer=b;noise.connect(filter);filter.connect(ng);ng.connect(this.audio.destination);noise.start();
  }
  fire(strong:boolean){
    if(this.cooldown>0||strong&&this.heavyCooldown>0)return false;
    this.cooldown=strong?.8:.55;if(strong)this.heavyCooldown=4;
    this.camera.updateMatrixWorld();const dir=this.camera.getWorldDirection(new THREE.Vector3()),p=this.cameraDataPosition();
    if(this.cameraSpace==='render')renderToDataDirection(dir,dir);
    const mesh=new THREE.Mesh(this.shellGeometry,this.shellMaterial);mesh.position.copy(p);mesh.scale.setScalar(strong?1.6:1);this.scene.add(mesh);
    this.shells.push({mesh,p,velocity:dir.multiplyScalar(strong?105:130),age:0,strong,trail:0});
    this.recoil=1;this.shake=strong?.16:.08;this.flash.intensity=strong?18:10;this.boom(strong);
    for(let i=0;i<8;i++)this.sparks.emit(p,new THREE.Vector3((Math.random()-.5)*3,(Math.random()-.5)*3,(Math.random()-.5)*3),.05,.15,new THREE.Color('#ffe8a1'));
    return true;
  }
  private explode(point:THREE.Vector3,strong:boolean,dir:THREE.Vector3){
    const radius=strong?18:9,count=this.sim.explode(point,radius,strong?12:5,dir),vehicles=this.traffic.explode(point,radius);
    this.onExplosion?.(count,vehicles);
    const distance=point.distanceTo(this.cameraDataPosition());this.shake=Math.max(this.shake,(strong?.45:.25)/Math.max(1,distance/20));this.boom(strong,distance);
    const sphere=new THREE.Mesh(this.flashGeometry,new THREE.MeshBasicMaterial({color:'#ffc85c',transparent:true,opacity:.9,depthWrite:false,blending:THREE.AdditiveBlending}));sphere.position.copy(point);this.scene.add(sphere);this.flashes.push({mesh:sphere,age:0,radius});
    for(let i=0;i<(strong?48:28);i++){
      const v=new THREE.Vector3(Math.random()-.5,Math.random()*.9,Math.random()-.5).normalize().multiplyScalar((strong?16:10)*(Math.random()*.8+.2));
      this.sparks.emit(point,v,.06+Math.random()*.15,.7+Math.random()*.7,new THREE.Color(Math.random()>.5?'#ffce68':'#ff7930'));
    }
    for(let i=0;i<(strong?22:13);i++){
      const v=new THREE.Vector3(Math.random()-.5,Math.random()*.7+.15,Math.random()-.5).multiplyScalar(strong?8:5);
      this.smoke.emit(point.clone().addScaledVector(v,.12),v,.8+Math.random()*1.5,2+Math.random()*2,new THREE.Color(i%3?'#b6ad95':'#6b7678'));
    }
  }
  update(dt:number,active:boolean){
    this.tool.visible=active;
    if(!active)return;
    this.cooldown=Math.max(0,this.cooldown-dt);this.heavyCooldown=Math.max(0,this.heavyCooldown-dt);
    this.recoil=Math.max(0,this.recoil-dt*4);this.tool.position.z=-.55+Math.sin(this.recoil*Math.PI)*.16;this.tool.rotation.x=Math.sin(this.recoil*Math.PI)*.12;
    this.flash.intensity*=Math.exp(-dt*25);this.shake=Math.max(0,this.shake-dt);
    for(let i=this.shells.length-1;i>=0;i--){
      const s=this.shells[i];s.age+=dt;s.velocity.y-=3*dt;
      const delta=s.velocity.clone().multiplyScalar(dt),length=delta.length(),direction=delta.clone().normalize();
      const hit=this.sim.world.castRayAndGetNormal(new RAPIER.Ray(s.p,direction),length,true,undefined,0x00040001,this.sim.playerCollider);
      const trafficHit=this.traffic.raycast(s.p,direction,length);
      const remoteHit=this.sim.castUnloadedTargets(s.p,direction,length);
      const distance=Math.min(hit?.timeOfImpact??Infinity,remoteHit?.distance??Infinity);
      const vehicleFirst=trafficHit&&trafficHit.distance<distance;
      if(hit||trafficHit||remoteHit){
        const point=vehicleFirst?trafficHit.point:s.p.clone().addScaledVector(direction,distance);
        this.explode(point,s.strong,direction);this.scene.remove(s.mesh);this.shells.splice(i,1);continue;
      }
      s.p.add(delta);s.mesh.position.copy(s.p);s.trail+=dt;
      if(s.trail>.035){s.trail=0;this.sparks.emit(s.p,s.velocity.clone().multiplyScalar(-.03),s.strong?.1:.06,.22,new THREE.Color('#ffd173'));}
      if(s.age>5||s.p.y< -150){this.scene.remove(s.mesh);this.shells.splice(i,1);}
    }
    for(let i=this.flashes.length-1;i>=0;i--){const f=this.flashes[i];f.age+=dt;f.mesh.scale.setScalar(.5+f.age*f.radius*4);(f.mesh.material as THREE.MeshBasicMaterial).opacity=Math.max(0,.7-f.age*2.5);if(f.age>.3){this.scene.remove(f.mesh);(f.mesh.material as THREE.Material).dispose();this.flashes.splice(i,1);}}
    this.smoke.update(dt);this.sparks.update(dt);
  }
  reset(){
    for(const s of this.shells)this.scene.remove(s.mesh);this.shells.length=0;
    for(const f of this.flashes){this.scene.remove(f.mesh);(f.mesh.material as THREE.Material).dispose();}this.flashes=[];
    this.smoke.clear();this.sparks.clear();this.cooldown=this.heavyCooldown=this.recoil=this.shake=0;this.flash.intensity=0;
  }
}
