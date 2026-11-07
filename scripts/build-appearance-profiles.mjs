import {readFile,writeFile} from 'node:fs/promises';

const read=async file=>JSON.parse(await readFile(new URL(`../${file}`,import.meta.url),'utf8'));
const campus=await read('public/data/campus.json');
const review=await read('sources/building-match-review.json');
const reviewed=Array.isArray(review)?review:review.entries;
if(!Array.isArray(reviewed))throw new Error('The building match review must contain entries.');
const observations=(await Promise.all(['001-060','061-199','200-plus'].map(range=>read(`sources/profiles-${range}.json`)))).flatMap(data=>data.entries);
const byNumber=new Map(observations.map(entry=>[entry.buildingNumber,entry]));
const byId=new Map(reviewed.map(entry=>[entry.osmId,entry]));
const supplements=[];
for(const file of ['profiles-supplemental.json','profiles-supplemental-east.json','profiles-supplemental-303.json','profiles-supplemental-561.json']){
  try{const data=await read(`sources/${file}`);supplements.push(...(Array.isArray(data)?data:data.entries));}
  catch(error){if(error.code!=='ENOENT')throw error;}
}
const byFootprint=new Map(supplements.filter(entry=>(entry.buildingId??entry.osmId)&&entry.profile).map(entry=>[entry.buildingId??entry.osmId,entry]));
const colors=['wallColor','roofColor','glassColor','frameColor','accentColor'];
const generated={},coverage=[];
for(const building of campus.buildings){
  const match=byId.get(building.id),supplement=byFootprint.get(building.id);
  const observed=supplement??byNumber.get(match?.buildingNumber);
  const usable=supplement?!!supplement.profile&&supplement.appearanceUsable!==false&&(supplement.identityVerified===true||match?.status==='verified'):
    match?.status==='verified'&&match.appearanceUsable!==false&&!!observed?.profile;
  if(usable){
    const number=observed.numberVerified===false||observed.buildingNumber===null?undefined:observed.buildingNumber??match?.buildingNumber;
    const profile={...observed.profile,buildingNumber:number};
    if(Number.isInteger(observed.documentedLevels)&&observed.documentedLevels>0){
      profile.levels=observed.documentedLevels;profile.levelsEstimated=false;
      if(building.heightEstimated){profile.height=observed.documentedLevels*3.5;profile.heightEstimated=true;}
    }
    const visibleDescription=(observed.observations??[]).join(' ');
    if(!profile.surface){
      if(/벽돌/.test(visibleDescription))profile.surface='brick';
      else if(/패널|금속판/.test(visibleDescription))profile.surface='panel';
      else if(/석재/.test(visibleDescription))profile.surface='stone';
    }
    for(const key of colors)if(typeof profile[key]==='string')profile[key]=parseInt(profile[key].replace('#',''),16);
    for(const key of colors)if(profile[key]!=null&&(!Number.isInteger(profile[key])||profile[key]<0||profile[key]>0xffffff))throw Error(`Invalid ${key}: ${building.id}`);
    if(!['punched','ribbon','curtain'].includes(profile.windowStyle))throw Error(`Invalid window style: ${building.id}`);
    if(!profile.sourceUrls?.length)throw Error(`Missing visual source: ${building.id}`);
    generated[building.id]=profile;
  }
  coverage.push({id:building.id,name:building.name,buildingNumber:observed?.buildingNumber??match?.buildingNumber??null,
    appearance:usable?'photo-reference':'unverified',sourceUrl:usable?observed.sourceUrl:null,
    observations:usable?observed.observations:[],reason:supplement?.identityEvidence??match?.reason??'공식 건물과의 대응 관계를 아직 확인하지 못했다.',
    limitations:usable?['사진에서 보이는 면을 참고한 근사 모델이다. 사진 촬영일과 보이지 않는 면은 각 자료의 한계를 따른다.',...(Array.isArray(observed.limitations)?observed.limitations:observed.limitations?[observed.limitations]:[])]:[]});
}
const text=`// scripts/build-appearance-profiles.mjs가 검토 자료로부터 생성한다.\nimport type {BuildingAppearance} from './buildingAppearance';\nexport const observedAppearances:Record<string,Partial<BuildingAppearance>>=${JSON.stringify(generated,null,2)};\n`;
await writeFile(new URL('../src/observedAppearances.ts',import.meta.url),text);
await writeFile(new URL('../sources/appearance-coverage.json',import.meta.url),JSON.stringify({totalFootprints:coverage.length,referencedFootprints:coverage.filter(e=>e.appearance==='photo-reference').length,entries:coverage},null,2));
console.log(`Applied reviewed photographs to ${coverage.filter(e=>e.appearance==='photo-reference').length}/${coverage.length} footprints.`);
