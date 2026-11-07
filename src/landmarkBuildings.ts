import * as THREE from 'three';
import type {CampusBuilding} from './fullCampus';
import type {BuildingAppearance} from './buildingAppearance';
import type {BreakableSpec} from './scene';
import {createLibraryLandmark} from './libraryLandmark';
import {createMainLibraryLandmark} from './mainLibraryLandmark';
import {createAdministrationLandmark} from './administrationLandmark';
import {createStudentCenterLandmark} from './studentCenterLandmark';
import {createMuseumLandmark} from './museumLandmark';
import {createLivingScienceLandmark} from './livingScienceLandmark';
import {createGymLandmark} from './gymLandmark';
import {createAgricultureLandmark} from './agricultureLandmark';
import {createSportsLandmark} from './sportsLandmark';
import {createGyujanggakLandmark} from './gyujanggakLandmark';
import {createPavilionLandmark} from './pavilionLandmark';
import {createEngineering302Landmark} from './engineering302Landmark';
import {createEngineering301Landmark} from './engineering301Landmark';
import {createEngineering303Landmark} from './engineering303Landmark';
import {createEngineering312Landmark} from './engineering312Landmark';
import {createFacultyClubLandmark} from './facultyClubLandmark';
import {createTeachingCenterLandmark} from './teachingCenterLandmark';
import {createEngineering35Landmark} from './engineering35Landmark';
import {createEngineering31Landmark} from './engineering31Landmark';
import {createEducationHealthLandmark} from './educationHealthLandmark';
import {createScience500Landmark} from './science500Landmark';
import {createEngineerHouseLandmark} from './engineerHouseLandmark';
import {createSamsungResearchLandmark} from './samsungResearchLandmark';
import {createFamilyDormLandmark} from './familyDormLandmark';
import {createResearchParkLandmark} from './researchParkLandmark';
import {createGlobalEngineeringLandmark} from './globalEngineeringLandmark';
import {createAdmissionsLandmark} from './admissionsLandmark';
import {createNeutinamuLandmark} from './neutinamuLandmark';
import {createBaekhakLandmark} from './baekhakLandmark';

// OMA의 외관 사진과 모형을 바탕으로 만든 미술관 외피다. 높이 외의 세부 치수는 사진 비례 추정이다.
export function createLandmarkBuilding(scene: THREE.Scene, building: CampusBuilding, profile: BuildingAppearance, heightAt: (x:number,z:number)=>number) {
  if (profile.landmark === 'gwanjeong') return createLibraryLandmark(scene, building, profile, heightAt);
  if (profile.landmark === 'main-library') return createMainLibraryLandmark(scene, building, profile, heightAt);
  if (profile.landmark === 'administration') return createAdministrationLandmark(scene, building, profile, heightAt);
  if (profile.landmark === 'student-center') return createStudentCenterLandmark(scene, building, profile, heightAt);
  if (profile.landmark === 'museum') return createMuseumLandmark(scene, building, profile, heightAt);
  if (profile.landmark === 'living-science') return createLivingScienceLandmark(scene, building, profile, heightAt);
  if (profile.landmark === 'gym') return createGymLandmark(scene, building, profile, heightAt);
  if (profile.landmark === 'agriculture') return createAgricultureLandmark(scene, building, profile, heightAt);
  if (profile.landmark === 'posco-sports') return createSportsLandmark(scene, building, profile, heightAt);
  if (profile.landmark === 'gyujanggak') return createGyujanggakLandmark(scene, building, profile, heightAt);
  if (profile.landmark === 'poongsan-pavilion') return createPavilionLandmark(scene, building, profile, heightAt);
  if (profile.landmark === 'engineering-302') return createEngineering302Landmark(scene, building, profile, heightAt);
  if (profile.landmark === 'engineering-301') return createEngineering301Landmark(scene, building, profile, heightAt);
  if (profile.landmark === 'engineering-303') return createEngineering303Landmark(scene, building, profile, heightAt);
  if (profile.landmark === 'engineering-312') return createEngineering312Landmark(scene, building, profile, heightAt);
  if (profile.landmark === 'faculty-club') return createFacultyClubLandmark(scene, building, profile, heightAt);
  if (profile.landmark === 'teaching-center') return createTeachingCenterLandmark(scene, building, profile, heightAt);
  if (profile.landmark === 'engineering-35') return createEngineering35Landmark(scene, building, profile, heightAt);
  if (profile.landmark === 'engineering-31') return createEngineering31Landmark(scene, building, profile, heightAt);
  if (profile.landmark === 'education-220' || profile.landmark === 'public-health-221') return createEducationHealthLandmark(scene, building, profile, heightAt);
  if (profile.landmark === 'science-500') return createScience500Landmark(scene, building, profile, heightAt);
  if (profile.landmark === 'engineer-house') return createEngineerHouseLandmark(scene, building, profile, heightAt);
  if (profile.landmark === 'samsung-research') return createSamsungResearchLandmark(scene, building, profile, heightAt);
  if (profile.landmark === 'family-dorm') return createFamilyDormLandmark(scene, building, profile, heightAt);
  if (profile.landmark === 'research-park') return createResearchParkLandmark(scene, building, profile, heightAt);
  if (profile.landmark === 'global-engineering') return createGlobalEngineeringLandmark(scene, building, profile, heightAt);
  if (profile.landmark === 'admissions') return createAdmissionsLandmark(scene, building, profile, heightAt);
  if (profile.landmark === 'neutinamu') return createNeutinamuLandmark(scene, building, profile, heightAt);
  if (profile.landmark === 'baekhak') return createBaekhakLandmark(scene, building, profile, heightAt);
  if (profile.landmark !== 'moa') return undefined;
  const points=building.points.slice(0,-1);
  const cx=points.reduce((s,p)=>s+p[0],0)/points.length,cz=points.reduce((s,p)=>s+p[1],0)/points.length;
  const edges=points.map((p,i)=>{const q=points[(i+1)%points.length];return {dx:q[0]-p[0],dz:q[1]-p[1],length:Math.hypot(q[0]-p[0],q[1]-p[1])};}).sort((a,b)=>b.length-a.length);
  const long=edges[0],length=long.length,width=edges.at(-1)!.length;
  // 현재 지도에서 도로 쪽 짧은 입면은 북쪽이다.
  let lz=new THREE.Vector3(long.dx/length,0,long.dz/length);if(lz.z<0)lz.negate();
  const lx=new THREE.Vector3(lz.z,0,-lz.x),base=heightAt(cx,cz),top=profile.height??17.575;
  const orientation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.atan2(-lx.z,lx.x));
  const world=(x:number,y:number,z:number)=>new THREE.Vector3(cx+lx.x*x+lz.x*z,base+y,cz+lx.z*x+lz.z*z);
  const bottom=(z:number)=>2.2+6.4*(z/length+.5);
  const shell=new THREE.Group();shell.name=`${building.id}:landmark`;
  Object.assign(shell.userData,{buildingId:building.id,role:'building-shell',landmark:'moa',appearance:profile});scene.add(shell);
  const distant=new THREE.Group();distant.name=`${building.id}:landmark-distant`;
  Object.assign(distant.userData,{buildingId:building.id,role:'distant-building',landmark:'moa'});distant.visible=false;scene.add(distant);
  const positions:number[]=[],colors:number[]=[],breakables:BreakableSpec[]=[];
  const records:{proxy:THREE.Mesh;start:number;end:number;original:number[];shown:boolean}[]=[];
  const cube=new THREE.BoxGeometry(1,1,1);
  function append(geometry:THREE.BufferGeometry,color:number){
    const g=geometry.index?geometry.toNonIndexed():geometry;
    const values=g.getAttribute('position'),c=new THREE.Color(color);
    for(let i=0;i<values.count;i++){positions.push(values.getX(i),values.getY(i),values.getZ(i));colors.push(c.r,c.g,c.b);}
    if(g!==geometry)g.dispose();geometry.dispose();
  }
  function appendBox(center:THREE.Vector3,size:THREE.Vector3,color:number,rotation=orientation){
    const matrix=new THREE.Matrix4().compose(center,rotation,size);
    append(new THREE.BoxGeometry(1,1,1).applyMatrix4(matrix),color);
  }
  function appendBeam(a:THREE.Vector3,b:THREE.Vector3,thickness:number,color:number){
    const vector=b.clone().sub(a),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),vector.clone().normalize());
    appendBox(a.clone().add(b).multiplyScalar(.5),new THREE.Vector3(thickness,vector.length(),thickness),color,q);
  }
  function quad(a:THREE.Vector3,b:THREE.Vector3,c:THREE.Vector3,d:THREE.Vector3,color:number){
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([...a.toArray(),...b.toArray(),...c.toArray(),...a.toArray(),...c.toArray(),...d.toArray()],3));append(g,color);
  }
  function component(center:THREE.Vector3,size:THREE.Vector3,color:number,draw:()=>void,rotation=orientation,material:BreakableSpec['material']='glass'){
    const proxy=new THREE.Mesh(cube,new THREE.MeshStandardMaterial({color}));proxy.position.copy(center);proxy.quaternion.copy(rotation);proxy.scale.copy(size);
    Object.assign(proxy.userData,{buildingId:building.id,renderProxy:true,landmark:'moa'});proxy.updateMatrix();proxy.updateMatrixWorld(true);
    const start=positions.length;draw();records.push({proxy,start,end:positions.length,original:positions.slice(start),shown:true});
    breakables.push({mesh:proxy,size:size.clone(),toughness:material==='glass'?6:10,label:building.name,material});
  }
  // 양쪽 긴 외벽은 경사진 밑면을 따라 사다리꼴로 이어진다.
  for(const side of [-1,1])for(let i=0;i<8;i++){
    const za=-length/2+i*length/8,zb=za+length/8,x=side*width/2,y0=bottom((za+zb)/2);
    component(world(x,(top+y0)/2,(za+zb)/2),new THREE.Vector3(.42,top-y0,length/8+.02),profile.glassColor,()=>{
      quad(world(x,bottom(za),za),world(x,bottom(zb),zb),world(x,top,zb),world(x,top,za),profile.glassColor);
      for(let z=za;z<zb;z+=.65)appendBeam(world(x,bottom(z),z),world(x,top,z),.045,profile.frameColor);
      appendBeam(world(x,top,za),world(x,top,zb),.24,profile.frameColor);
      appendBeam(world(x,bottom(za),za),world(x,bottom(zb),zb),.2,profile.frameColor);
    });
  }
  // 도로에서 보이는 짧은 입면에는 노출된 흰 철골 트러스가 있다.
  for(const side of [-1,1])for(let i=0;i<4;i++){
    const xa=-width/2+i*width/4,xb=xa+width/4,z=side*length/2,y0=bottom(z),middle=y0+(top-y0)*.42;
    component(world((xa+xb)/2,(top+y0)/2,z),new THREE.Vector3(width/4+.02,top-y0,.5),profile.glassColor,()=>{
      quad(world(xa,y0,z),world(xb,y0,z),world(xb,top,z),world(xa,top,z),profile.glassColor);
      for(let x=xa;x<xb;x+=.55)appendBeam(world(x,y0,z),world(x,top,z),.045,profile.frameColor);
      for(const y of [y0,middle,top])appendBeam(world(xa,y,z),world(xb,y,z),.2,profile.frameColor);
      appendBeam(world(xa,y0,z),world(xa,top,z),.2,profile.frameColor);
      appendBeam(world(xa,i%2?top:middle,z),world(xb,i%2?middle:top,z),.26,profile.frameColor);
      appendBeam(world(xa,y0,z),world(xb,middle,z),.18,profile.frameColor);
    });
  }
  for(let i=0;i<6;i++){
    const za=-length/2+i*length/6,zb=za+length/6,mid=(za+zb)/2;
    const roofCenter=world(0,top+.12,mid),roofSize=new THREE.Vector3(width+.3,.24,length/6+.03);
    component(roofCenter,roofSize,profile.roofColor,()=>appendBox(roofCenter,roofSize,profile.roofColor),orientation,'metal');
    const slope=6.4/length,q=orientation.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.atan(slope)));
    const underCenter=world(0,bottom(mid),mid),underSize=new THREE.Vector3(width,.35,length/6*Math.sqrt(1+slope*slope));
    component(underCenter,underSize,0x737f77,()=>appendBox(underCenter,underSize,0x737f77,q),q,'metal');
  }
  for(const x of [-3.5,3.5]){
    const center=world(x,4,-3),size=new THREE.Vector3(7,8,12);
    component(center,size,0x9a9c90,()=>appendBox(center,size,0x9a9c90),orientation,'stone');
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();geometry.computeBoundingSphere();
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.52,metalness:.15,side:THREE.DoubleSide}));mesh.name='moa-cantilever-and-truss';mesh.receiveShadow=true;shell.add(mesh);
  function update(_player:THREE.Vector3){
    const attribute=geometry.getAttribute('position') as THREE.BufferAttribute;let changed=false;
    for(const r of records)if(r.shown!==r.proxy.visible){
      r.shown=r.proxy.visible;changed=true;
      for(let k=r.start;k<r.end;k++)attribute.array[k]=r.shown?r.original[k-r.start]:0;
    }
    if(changed)attribute.needsUpdate=true;
    shell.visible=records.some(r=>r.proxy.visible);
  }
  return {breakables,update};
}
