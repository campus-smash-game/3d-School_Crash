import { createEngineering39Exterior } from './engineering39Exterior';
import { ENGINEERING39_ID } from './engineering39Site';
import { createEngineering3736Access } from './engineering3736Access';
import { createEngineering35Access } from './engineering35Access';
import { createEngineering3334Access } from './engineering3334Access';
import { createEngineering3436Exterior } from './engineering3436Exterior';
import { ENGINEERING34_ID } from './engineering3436Site';
import { createEngineering36Exterior } from './engineering36Exterior';
import { ENGINEERING36_ID } from './engineering36Site';
import { createEngineering37Exterior } from './engineering37Exterior';
import { ENGINEERING37_ID } from './engineering37Site';
import { createEngineering3337Access } from './engineering3337Access';
import { createEngineering33Exterior } from './engineering33Exterior';
import { ENGINEERING33_ID } from './engineering33Site';
import { createEngineering3033Access } from './engineering3033Access';
import { ENGINEERING30_ID } from './engineering30Site';
import { createEngineering30Exterior } from './engineering30Exterior';
import { ENGINEERING30_DINING_ID } from './engineering30DiningSite';
import { createEngineering30DiningExterior } from './engineering30DiningExterior';
import { SCIENCE28_ID } from './science28Site';
import { createScience28Exterior } from './science28Exterior';
import { SCIENCE251_ID } from './science251Site';
import { createScience251Exterior } from './science251Exterior';
import { SCIENCE24_ID } from './science24Site';
import { createScience24Exterior } from './science24Exterior';
import { SCIENCE25_ID, SCIENCE27_ID } from './science2527Site';
import { createScience2527Exterior } from './science2527Exterior';
import { SCIENCE26_ID } from './science26Site';
import { createScience26Exterior } from './science26Exterior';
import { SCIENCE23_ID } from './science23Site';
import { createScience23Exterior } from './science23Exterior';
import { createScience2256Exterior } from './science2256Exterior';
import { SCIENCE22_ID, SCIENCE56_ID } from './science2256Site';
import { createPhysics561Exterior } from './physics561Exterior';
import { PHYSICS561_ID, PHYSICS56_ID } from './physics561Site';
import { createPharmacy143Exterior } from './pharmacy143Exterior';
import { PHARMACY143_ID, PHARMACY143_BRIDGE_ROAD } from './pharmacy143Site';
import { createPharmacy21Exterior } from './pharmacy21Exterior';
import { createPharmacy2021Connection } from './pharmacy2021Connection';
import { PHARMACY2021_ID, PHARMACY21_ID, pharmacy21Opening } from './pharmacy2021Site';
import { createPharmacy20Exterior } from './pharmacy20Exterior';
import { PHARMACY20_ID } from './pharmacy20Site';
import { createEducation1320Connection } from './education1320Connection';
import { EDUCATION1320_ID, EDUCATION20_ID, education1320Opening } from './education1320Site';
import { createEducation13Exterior } from './education13Exterior';
import { EDUCATION13_ID } from './education13Site';
import { createEducation1112Connection } from './education1112Connection';
import { createEducation10Exterior, EDUCATION10_ID } from './education10Exterior';
import { createEducation11Exterior, EDUCATION11_ID } from './education11Exterior';
import { createHumanities2Landmark, HUMANITIES2_ID } from './humanities2Landmark';
import { createHumanities1Landmark, HUMANITIES1_ID } from './humanities1Landmark';
import { createHumanities14Landmark, HUMANITIES14_ID } from './humanities14Landmark';
import { createHumanitiesUpperApproach, HUMANITIES_UPPER_ROADS } from './humanitiesUpperApproach';
import { createHumanities6Landmark, HUMANITIES6_ID } from './humanities6Landmark';
import { createHumanities7Landmark, HUMANITIES7_ID } from './humanities7Landmark';
import * as THREE from 'three';
import type {TerrainCut,TerrainHeightSampler} from './terrain';
import type { BreakableSpec, StaticSpec } from './scene';
import { getBuildingAppearance, type BuildingAppearance } from './buildingAppearance';
import { createLandmarkBuilding } from './landmarkBuildings';
import { createDistantBuildings, createDistantGeometry } from './distantBuildings';
import { createCampusConstruction, createEngineeringConstruction, createConstructionGround } from './campusConstruction';
import { createCampusEngineering301303Connection } from './engineering301303Connection';
import { createCampusEngineering303312Connection } from './engineering303312Connection';
import { ENGINEERING_CONNECTION_SITE } from './engineering301303Site';
import { createEngineeringRoadFacilities } from './engineeringRoadFacilities';
import { getEngineering3130ConnectionLayout } from './engineering3130Connection';
import { shouldRenderMappedBuilding } from './observedBuildingOverrides';
import { createLivingScienceSouthSite } from './livingScienceSouthSite';
import { EDUCATION_PARKING_SITE } from './educationParkingSite';
import { createHumanitiesPassage, getHumanitiesPassageLayout } from './humanitiesPassage';
import { createHumanities14Stair, HUMANITIES14_STAIR } from './humanities14Stair';
import { createHumanitiesGarden, HUMANITIES_GARDEN } from './humanitiesGarden';
import { createHumanities250, getHumanities250Openings, HUMANITIES250 } from './humanities250';
import { createHumanities23Connection } from './humanities23Connection';
import { getHumanities23Openings, HUMANITIES23 } from './humanities23Site';
import { createHumanities4Landmark, HUMANITIES4_ID } from './humanities4Landmark';
import { createHumanities8Landmark, HUMANITIES8_ID } from './humanities8Landmark';
import { createHumanities35Exterior, HUMANITIES35_EXTERIOR_IDS } from './humanities35Exterior';
import { createHumanities35Connection } from './humanities35Connection';
import { getHumanities35Openings, HUMANITIES35 } from './humanities35Site';
import { createDining76Approach } from './dining76Approach';
import { DINING76_SITE, getDining76Layout } from './dining76Site';
import { createDining76EastApproach } from './dining76EastApproach';
import { DINING76_EAST_SITE } from './dining76EastSite';
import { EDUCATION101_SITE, EDUCATION10_LINK, getEducation101Layout, getEducation10LinkOpening, getEducation10GroundOpening } from './education101Site';
import { createEducation101Approach } from './education101Approach';
import { createEducation12Landmark } from './education12Landmark';
import { createPascucci111Landmark, PASCUCCI111_SITE } from './pascucci111Landmark';
import { EDUCATION12_SITE, getEducation12Layout, getEducation12RoadsideStair } from './education12Site';

export type CampusPoint = [number, number];
export type CampusBuilding = {
  id: string; name: string; ref: string; kind: string; points: CampusPoint[]; holes?: CampusPoint[][];
  height: number; levels: number; heightEstimated: boolean; levelsEstimated: boolean; terrainElevation?: number | null;
  footprintEstimated?: boolean; terrainPad?: boolean; terrainCut?: TerrainCut;
  sources?: {url: string; title?: string}[]; provenance?: Record<string, unknown>;
};
export type CampusRoad = { id: string; name: string; kind: string; points: CampusPoint[]; width: number; nodeIds?: string[]; drivable: boolean; oneway?: boolean };
export type CampusData = {
  origin: { lat: number; lon: number };
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  boundary: CampusPoint[][];
  buildings: CampusBuilding[];
  roads: CampusRoad[];
  areas: { id: string; name: string; kind: string; sport: string; points: CampusPoint[] }[];
  stops: { id: string; name: string; point: CampusPoint }[];
};
export type CampusLocation = { id: string; name: string; x: number; z: number };

export function createFullCampus(scene: THREE.Scene, data: CampusData, heightAt: (x: number, z: number) => number, options: { humanities250?: boolean; humanities23?: boolean; humanities4?: boolean; humanities35?: boolean; humanities8?: boolean; humanities7?: boolean; humanities6?: boolean; humanitiesUpper?: boolean; humanities14Exterior?: boolean; humanities1?: boolean; humanities2?: boolean; humanities35Exterior?: boolean; education10Exterior?: boolean; education13?: boolean; education1320?: boolean; pharmacy20?: boolean; pharmacy2021?: boolean; pharmacy21?: boolean; pharmacy143?: boolean; physics561?: boolean; science2256?: boolean; science2256Access?: boolean; science23?: boolean; science26?: boolean; science2527?: boolean; science24?: boolean; science251?: boolean; engineering39?: boolean; engineering3736?: boolean; engineering35Access?: boolean; engineering3334?: boolean; engineering3436?: boolean; engineering36?: boolean; engineering37?: boolean; engineering3337?: boolean; engineering33?: boolean; engineering3033?: boolean; engineering30?: boolean; engineering30Dining?: boolean; science28?: boolean; education1112?: boolean; education11Exterior?: boolean } = {}) {
  const breakables: BreakableSpec[] = [];
  const colliders: StaticSpec[] = [];
  const locations: CampusLocation[] = [];
  const buildingViews: BuildingView[] = [];
  const landmarkViews: { update: (player: THREE.Vector3) => void }[] = [];
  const landmarkLabels: { x: number; z: number; radius: number; label: THREE.Sprite }[] = [];
  const forestViews: { x: number; z: number; group: THREE.Group }[] = [];
  const distantBuildings = createDistantBuildings(scene);
  const renderedBuildings = data.buildings.filter(shouldRenderMappedBuilding);
  const humanities250Active = options.humanities250 !== false && [HUMANITIES250.buildingId, HUMANITIES250.neighborId].every(id => renderedBuildings.some(b => b.id === id));
  const humanities23Active = options.humanities23 !== false && [HUMANITIES23.buildingId, HUMANITIES23.neighborId].every(id => renderedBuildings.some(b => b.id === id)) && data.roads.some(r => r.id === HUMANITIES23.stairRoad);
  const humanities35Active = options.humanities35 !== false && [HUMANITIES35.buildingId, HUMANITIES35.neighborId].every(id => renderedBuildings.some(b => b.id === id)) && data.roads.some(r => r.id === HUMANITIES35.bridgeRoad);
  const mappedAreas = [...data.areas, ...data.buildings.filter(b => b.kind === 'construction' && !data.areas.some(a => a.id === b.id)).map(b => ({ id: b.id, name: b.name, kind: b.kind, sport: '', points: b.points }))];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const glassPlanes = new THREE.BufferGeometry();
  const glassVertices: number[] = [];
  for (const z of [-.51, .51]) for (const [x, y] of [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, -.5], [.5, .5], [-.5, .5]]) glassVertices.push(x, y, z);
  glassPlanes.setAttribute('position', new THREE.Float32BufferAttribute(glassVertices, 3)); glassPlanes.computeVertexNormals();
  const façadeMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .86 });
  const surfaceMaterials = new Map<string, THREE.MeshStandardMaterial>();
  const appearanceMaterials = new Map<string, { glass: THREE.MeshStandardMaterial; roof: THREE.MeshStandardMaterial; frame: THREE.MeshStandardMaterial }>();
  const dummy = new THREE.Object3D();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const buildingBoxes = renderedBuildings.map(building => {
    const xs = building.points.map(p => p[0]), zs = building.points.map(p => p[1]);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
  });

  type WallRecord = { proxy: THREE.Mesh; matrix: THREE.Matrix4; shown: boolean; normalSign: number; color: number; windows: { matrix: THREE.Matrix4; index: number }[]; trims: { matrix: THREE.Matrix4; index: number }[] };
  type BuildingView = {
    x: number; z: number; radius: number; far: THREE.Group; near: THREE.Group; walls: THREE.InstancedMesh;
    glass: THREE.InstancedMesh; distantGlass: THREE.InstancedMesh; trims: THREE.InstancedMesh; pieces: WallRecord[]; roof: THREE.Mesh; roofProxy: THREE.Mesh; rooftop: THREE.Group;
    label?: THREE.Sprite; damaged: boolean;
  };
  const center = (points: CampusPoint[]): CampusPoint => {
    const pts = points.length > 1 && points[0][0] === points.at(-1)![0] && points[0][1] === points.at(-1)![1] ? points.slice(0, -1) : points;
    return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  };
  function footprint(building: CampusBuilding, x: number, z: number, height: number) {
    const shape = new THREE.Shape(building.points.map(p => new THREE.Vector2(p[0] - x, -(p[1] - z))));
    for (const ring of building.holes ?? []) shape.holes.push(new THREE.Path(ring.map(p => new THREE.Vector2(p[0] - x, -(p[1] - z)))));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 1 });
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  }
  function wallSurface(profile: BuildingAppearance, height: number, width: number) {
    if (!profile.surface) return façadeMaterial;
    const key = `${profile.surface}:${height.toFixed(1)}:${width.toFixed(1)}`;
    const cached = surfaceMaterials.get(key); if (cached) return cached;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#b7b9b3';
    if (profile.surface === 'brick') {
      for (let row = 0; row < 2; row++) {
        ctx.fillRect(0, row * 64, 128, 4);
        for (let x = row ? 32 : 0; x < 128; x += 64) ctx.fillRect(x, row * 64, 4, 64);
      }
    } else {
      ctx.fillRect(0, 0, 128, 2); ctx.fillRect(0, 0, 2, 128);
    }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(width / (profile.surface === 'brick' ? 1.2 : 1.4), height / (profile.surface === 'brick' ? .4 : .7));
    texture.anisotropy = 4;
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, map: texture, roughness: profile.surface === 'panel' ? .64 : .88 });
    surfaceMaterials.set(key, material); return material;
  }
  function profileMaterials(profile: BuildingAppearance) {
    const key = JSON.stringify([profile.glassColor, profile.roofColor, profile.accentColor]);
    const cached = appearanceMaterials.get(key); if (cached) return cached;
    const value = {
      glass: new THREE.MeshStandardMaterial({ color: profile.glassColor, roughness: .32, metalness: .2, side: THREE.DoubleSide }),
      roof: new THREE.MeshStandardMaterial({ color: profile.roofColor, roughness: .92 }),
      frame: new THREE.MeshStandardMaterial({ color: profile.accentColor, roughness: .72 }),
    };
    appearanceMaterials.set(key, value); return value;
  }
  function makeLabel(text: string) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
    const context = canvas.getContext('2d')!;
    context.fillStyle = 'rgba(21,43,43,.86)'; context.beginPath(); context.roundRect(2, 5, 508, 82, 20); context.fill();
    context.fillStyle = '#edf3e8'; context.font = '600 31px "Malgun Gothic", sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillText(text, 256, 47, 474);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    // Sprite 셰이더는 행렬 열의 길이로 화면 크기를 구한다. world 반사 뒤에도 UV를 유지한다.
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
    label.userData.worldText = { kind: 'sprite', text, compensation: 'none-screen-aligned-sprite' }; return label;
  }
  const knownRefs: Record<string, string> = { '종합교육연구동': '220', '보건대학원': '221', '행정관': '60', '학생회관': '63', '중앙도서관': '62', '관정도서관': '62-1', '제1공학관': '301', '제2공학관': '302', '농업생명과학대학': '200', '서울대학교 미술관': '151', '서울대학교 박물관': '70', '규장각한국학연구원': '103', '종합체육관': '71', '경영대학 (SK경영관)': '58', '경영전문대학원 (LG경영관)': '59' };
  function arrivalPoint(x: number, z: number): CampusPoint {
    let nearest: CampusPoint = [x, z], best = Infinity;
    for (const road of data.roads) for (let i = 0; i < road.points.length - 1; i++) {
      const a = road.points[i], b = road.points[i + 1];
      const dx = b[0] - a[0], dz = b[1] - a[1], lengthSq = dx * dx + dz * dz;
      if (lengthSq < .01) continue;
      const t = THREE.MathUtils.clamp(((x - a[0]) * dx + (z - a[1]) * dz) / lengthSq, 0, 1);
      for (const fraction of [t, 0, .5, 1]) {
        const point: CampusPoint = [a[0] + dx * fraction, a[1] + dz * fraction];
        const distance = (point[0] - x) ** 2 + (point[1] - z) ** 2;
        if (distance >= best || buildingBoxes.some(box => point[0] > box.minX - 1.5 && point[0] < box.maxX + 1.5 && point[1] > box.minZ - 1.5 && point[1] < box.maxZ + 1.5)) continue;
        best = distance; nearest = point;
      }
    }
    return nearest;
  }
  const scienceComplexNames: Record<string, string> = {
    'way/179742150': '500동 북서쪽 건물', 'way/179742155': '500동 서쪽 가운데 건물',
    'way/179742153': '500동 남서쪽 건물', 'way/329398248': '500동 연결통로', 'way/297047750': '500동 북쪽 건물',
  };
  let education12: ReturnType<typeof createEducation12Landmark> | undefined;
  let cafe111: ReturnType<typeof createPascucci111Landmark> | undefined;
  let humanities6: ReturnType<typeof createHumanities6Landmark> | undefined;
  let humanities7: ReturnType<typeof createHumanities7Landmark> | undefined;
  let humanities8: ReturnType<typeof createHumanities8Landmark> | undefined;
  let humanities4: ReturnType<typeof createHumanities4Landmark> | undefined;
  const engineering39Layout=options.engineering39!==false?scene.getObjectByName('campus-terrain')?.userData.engineering39Correction?.layout:undefined;
  const engineering3736Layout=options.engineering3736!==false?scene.getObjectByName('campus-terrain')?.userData.engineering3736Correction?.layout:undefined;
  const engineering35AccessLayout=options.engineering35Access!==false?scene.getObjectByName('campus-terrain')?.userData.engineering35AccessCorrection?.layout:undefined;
  const engineering3334Layout=options.engineering3334!==false?scene.getObjectByName('campus-terrain')?.userData.engineering3334Correction?.layout:undefined;
  const engineering3436Layout=options.engineering3436!==false?scene.getObjectByName('campus-terrain')?.userData.engineering3436Correction?.layout:undefined;
  const engineering36Layout=options.engineering36!==false?scene.getObjectByName('campus-terrain')?.userData.engineering36Correction?.layout:undefined;
  const engineering37Layout=options.engineering37!==false?scene.getObjectByName('campus-terrain')?.userData.engineering37Correction?.layout:undefined;
  const engineering3337Layout=options.engineering3337!==false?scene.getObjectByName('campus-terrain')?.userData.engineering3337Correction?.layout:undefined;
  const engineering33Layout=options.engineering33!==false?scene.getObjectByName('campus-terrain')?.userData.engineering33Correction?.layout:undefined;
  const engineering3033Layout=options.engineering3033!==false?scene.getObjectByName('campus-terrain')?.userData.engineering3033Correction?.layout:undefined;
  const engineering30Layout=options.engineering30!==false?scene.getObjectByName('campus-terrain')?.userData.engineering30Correction?.layout:undefined;
  const engineering30DiningLayout=options.engineering30Dining!==false?scene.getObjectByName('campus-terrain')?.userData.engineering30DiningCorrection?.layout:undefined;
  const science28Layout=options.science28!==false?scene.getObjectByName('campus-terrain')?.userData.science28Correction?.layout:undefined;
  const science251Layout=options.science251!==false?scene.getObjectByName('campus-terrain')?.userData.science251Correction?.layout:undefined;
  const science24Layout=options.science24!==false?scene.getObjectByName('campus-terrain')?.userData.science24Correction?.layout:undefined;
  const science2527Layout=options.science2527!==false?scene.getObjectByName('campus-terrain')?.userData.science2527Correction?.layout:undefined;
  const science26Layout=options.science26!==false?scene.getObjectByName('campus-terrain')?.userData.science26Correction?.layout:undefined;
  const science23Layout=options.science23!==false?scene.getObjectByName('campus-terrain')?.userData.science23Correction?.layout:undefined;
  const science2256Layout=options.science2256!==false?scene.getObjectByName('campus-terrain')?.userData.science2256Correction?.layout:undefined;
  const physics561Layout=options.physics561!==false?scene.getObjectByName('campus-terrain')?.userData.physics561Correction?.layout:undefined;
  const pharmacy143Layout=options.pharmacy143!==false?scene.getObjectByName('campus-terrain')?.userData.pharmacy143Correction?.layout:undefined;
  const pharmacy21Layout=options.pharmacy21!==false?scene.getObjectByName('campus-terrain')?.userData.pharmacy21Correction?.layout:undefined;
  const pharmacy2021Layout=options.pharmacy2021!==false?scene.getObjectByName('campus-terrain')?.userData.pharmacy2021Correction?.layout:undefined;
  const pharmacy20Layout=options.pharmacy20!==false?scene.getObjectByName('campus-terrain')?.userData.pharmacy20Correction?.layout:undefined;
  const education1320Layout=options.education1320!==false&&options.education13!==false?scene.getObjectByName('campus-terrain')?.userData.education1320Correction?.layout:undefined;
  for (const building of renderedBuildings) {
    const [x, z] = center(building.points);
    const base = heightAt(x, z);
    const originalProfile = getBuildingAppearance(building);
    const profile = building.id === DINING76_SITE.buildingId ? { ...originalProfile, height: 8.8, levels: 2, heightEstimated: true } : humanities35Active && [HUMANITIES35.buildingId, HUMANITIES35.neighborId].includes(building.id) ? { ...originalProfile, wallColor: 0x76716c } : originalProfile;
    const height = Math.max(3, Math.min(85, profile.height ?? building.height));
    const floors = Math.max(1, Math.min(24, profile.levels ?? building.levels ?? Math.round(height / 3.5)));
    const materials = profileMaterials(profile);
    const color = new THREE.Color(profile.wallColor);
    const ref = profile.buildingNumber || building.ref || knownRefs[building.name] || (building.name.match(/^(\d+(?:-\d+)?)동?$/)?.[1] ?? '');
    const displayName = building.id === 'way/1530459898' ? '32동 증개축 공사 구역' : scienceComplexNames[building.id] || building.name || (ref ? `${ref}동` : '교내 건물');
    const displayLabel = ref && !displayName.includes(ref) ? `${ref} ${displayName}` : displayName;
    const showBuildingLabel = ['science-500', 'faculty-club', 'teaching-center', 'engineering-35', 'engineering-31', 'engineering-312'].includes(profile.landmark ?? '') || !!knownRefs[building.name] || /도서관|학생회관|기숙사|미술관|박물관|공학관|연구공원|국제백신/.test(displayName);
    let arrival = arrivalPoint(x, z);
    if (profile.landmark === 'engineering-301') arrival = [323.01, -1804.15];
    if (profile.landmark === 'engineering-303') arrival = [309.7, -1792.902658];
    locations.push({ id: building.id, name: displayLabel, x: arrival[0], z: arrival[1] });
    if (building.kind === 'construction') continue;
    if (engineering3436Layout && building.id===ENGINEERING34_ID) continue;
    if (engineering36Layout && building.id===ENGINEERING36_ID) continue;
    if (engineering39Layout && building.id===ENGINEERING39_ID) continue;
    if (engineering37Layout && building.id===ENGINEERING37_ID) continue;
    if (engineering33Layout && building.id===ENGINEERING33_ID) continue;
    if (engineering30Layout && building.id===ENGINEERING30_ID) continue;
    if (engineering30DiningLayout && building.id===ENGINEERING30_DINING_ID) continue;
    if (science28Layout && building.id===SCIENCE28_ID) continue;
    if (science251Layout && building.id===SCIENCE251_ID) continue;
    if (science24Layout && building.id===SCIENCE24_ID) continue;
    if (science2527Layout && [SCIENCE25_ID,SCIENCE27_ID].includes(building.id)) continue;
    if (science26Layout && building.id===SCIENCE26_ID) continue;
    if (science23Layout && building.id===SCIENCE23_ID) continue;
    if (science2256Layout && [SCIENCE22_ID,SCIENCE56_ID].includes(building.id)) continue;
    if (building.id === PHYSICS561_ID && physics561Layout) continue;
    if (building.id === PHARMACY143_ID && pharmacy143Layout) continue;
    if (building.id === PHARMACY21_ID && pharmacy21Layout) continue;
    if (building.id === PHARMACY2021_ID && pharmacy2021Layout) continue;
    if (building.id === PHARMACY20_ID && pharmacy20Layout) continue;
    if (building.id === EDUCATION1320_ID && education1320Layout) continue;
    if (building.id === EDUCATION10_ID && options.education10Exterior !== false) continue;
    if (building.id === EDUCATION13_ID && options.education13 !== false) continue;
    if (building.id === EDUCATION11_ID && options.education11Exterior !== false) continue;
    if (HUMANITIES35_EXTERIOR_IDS.includes(building.id) && options.humanities35Exterior !== false) continue;
    if (building.id === HUMANITIES2_ID && options.humanities2 !== false) continue;
    if (building.id === HUMANITIES1_ID && options.humanities1 !== false) continue;
    if (building.id === HUMANITIES14_ID && options.humanities14Exterior !== false) continue;
    if (building.id === HUMANITIES6_ID && options.humanities6 !== false) continue;
    if (building.id === HUMANITIES7_ID && options.humanities7 !== false) continue;
    const special = building.id === EDUCATION12_SITE.buildingId
      ? (education12 = createEducation12Landmark(scene, building, heightAt, getEducation12Layout(heightAt), options.education1112!==false && options.education11Exterior!==false))
      : building.id === PASCUCCI111_SITE.buildingId
      ? (cafe111 = createPascucci111Landmark(scene, heightAt, getEducation12Layout(heightAt).cafeFloor, getEducation12RoadsideStair(heightAt)))
      : building.id === HUMANITIES4_ID && options.humanities4 !== false
      ? (humanities4 = createHumanities4Landmark(scene, building, heightAt))
      : building.id === HUMANITIES8_ID && options.humanities8 !== false
      ? (humanities8 = createHumanities8Landmark(scene, building, heightAt))
      : createLandmarkBuilding(scene, building, profile, heightAt);
    if (special) {
      breakables.push(...special.breakables); landmarkViews.push(special);
      if (showBuildingLabel) {
        const label = makeLabel(displayLabel), xs = building.points.map(p => p[0]), zs = building.points.map(p => p[1]);
        const shell = ['science-500', 'engineering-303', 'engineering-312', 'faculty-club', 'teaching-center', 'engineering-35', 'engineering-31'].includes(profile.landmark ?? '') ? scene.children.find(o => o.userData.buildingId === building.id && o.userData.role === 'building-shell') : undefined;
        const top = shell ? new THREE.Box3().setFromObject(shell).max.y : base + height;
        label.position.set(x, top + 5, z); label.scale.set(31, 5.8, 1); label.userData.buildingId = building.id; scene.add(label);
        landmarkLabels.push({ x, z, radius: Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) / 2, label });
      }
      continue;
    }
    const foundationBase = Math.min(base, ...building.points.map(p => heightAt(p[0], p[1]))) - .6;
    const farGeometry = footprint(building, x, z, base + height - foundationBase);
    const far = new THREE.Group();
    far.name = `${building.id}:distant`; far.userData.buildingId = building.id; far.userData.role = 'distant-building'; far.userData.appearance = profile;
    scene.add(far);
    const near = new THREE.Group(); near.name = `${building.id}:shell`; near.userData.buildingId = building.id; near.userData.role = 'building-shell'; scene.add(near);
    const pieces: WallRecord[] = [];
    let windowCount = 0;
    let trimCount = 0;
    const humanitiesLayout = building.id === 'way/167984624' && data.roads.some(road => road.id === 'way/1429747754/540')
      ? getHumanitiesPassageLayout(heightAt, building.points) : undefined;
    const connectionOpenings = [...(building.id==='way/162045723'&&engineering3334Layout?engineering3334Layout.openings431:[]),...(building.id===PHYSICS56_ID&&physics561Layout?physics561Layout.openings:[]),...(building.id===PHARMACY21_ID&&pharmacy2021Layout?[pharmacy21Opening(pharmacy2021Layout)]:[]),...(building.id===EDUCATION20_ID&&education1320Layout?[education1320Opening(education1320Layout)]:[]),...(building.id === 'way/389628347'
      ? getEngineering3130ConnectionLayout(heightAt).openings.filter(opening => opening.buildingId === building.id)
      : humanitiesLayout
        ? humanitiesLayout.openings
        : building.id === DINING76_SITE.buildingId && data.roads.some(road => road.id === DINING76_SITE.sourceRoad)
          ? getDining76Layout(heightAt).openings
          : building.id === EDUCATION101_SITE.buildingId && data.roads.some(road => road.id === EDUCATION101_SITE.sourceRoad)
            ? getEducation101Layout(heightAt, building.points).openings
            : building.id === EDUCATION10_LINK.buildingId && data.roads.some(road => road.id === EDUCATION101_SITE.sourceRoad)
              ? [getEducation10LinkOpening(heightAt, building.points), getEducation10GroundOpening(heightAt, building.points)] : []),
      ...(humanities250Active ? getHumanities250Openings(building.id, building.points, heightAt) : []),
      ...(humanities23Active ? getHumanities23Openings(building.id, building.points, heightAt) : []),
      ...(humanities35Active ? getHumanities35Openings(building.id, building.points, heightAt) : [])];
    if (connectionOpenings.length) { near.userData.connectionOpening = connectionOpenings[0]; near.userData.connectionOpenings = connectionOpenings; }
    const ringList = [building.points, ...(building.holes ?? [])];
    for (const [ringIndex, points] of ringList.entries()) for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
      if (length < .6) continue;
      const divisions = Math.max(1, Math.ceil(length / 11));
      const angle = -Math.atan2(dz, dx);
      const cuts = Array.from({ length: divisions + 1 }, (_, j) => length * j / divisions);
      const edgeOpenings: { range: [number, number]; opening: (typeof connectionOpenings)[number] }[] = [];
      if (ringIndex === 0 && connectionOpenings.length) {
        const project = (p: CampusPoint) => ({
          along: ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / length,
          distance: Math.abs((p[0] - a[0]) * dz - (p[1] - a[1]) * dx) / length,
        });
        const matches = connectionOpenings.filter(opening => {
          const p = project(opening.a), q = project(opening.b);
          return p.distance < .05 && q.distance < .05 && Math.max(p.along, q.along) > 0 && Math.min(p.along, q.along) < length;
        });
        for (const opening of matches) {
          const p = project(opening.a), q = project(opening.b);
          const range: [number, number] = [Math.max(0, Math.min(p.along, q.along)), Math.min(length, Math.max(p.along, q.along))];
          edgeOpenings.push({ range, opening }); cuts.push(...range);
        }
        cuts.sort((u, v) => u - v);
      }
      for (let j = 0; j < cuts.length - 1; j++) {
        const width = cuts[j + 1] - cuts[j];
        if (width < .001) continue;
        const alongCenter = (cuts[j] + cuts[j + 1]) / 2;
        const px = a[0] + dx * alongCenter / length, pz = a[1] + dz * alongCenter / length;
        const wallBottom = Math.min(foundationBase, heightAt(px, pz) - .6);
        const wallTop = base + height;
        const activeOpenings = edgeOpenings.filter(o => alongCenter > o.range[0] && alongCenter < o.range[1]);
        const connectionOpening = edgeOpenings[0]?.opening, open = activeOpenings.length > 0;
        let verticalParts = [[wallBottom, wallTop]];
        for (const { opening } of activeOpenings) verticalParts = verticalParts.flatMap(([bottom, top]) => [[bottom, Math.min(top, opening.bottom)], [Math.max(bottom, opening.top), top]]).filter(([bottom, top]) => top > bottom);
        for (const [bottom, top] of verticalParts) {
          const wallHeight = top - bottom;
          if (wallHeight < .001) continue;
          const proxy = new THREE.Mesh(cube, new THREE.MeshStandardMaterial({ color, roughness: .86 }));
          proxy.position.set(px, bottom + wallHeight / 2, pz); proxy.rotation.y = angle; proxy.scale.set(width + .08, wallHeight, .65);
          proxy.userData.buildingId = building.id; proxy.userData.renderProxy = true;
          if (open) proxy.userData.connectionOpeningEdge = true;
          proxy.updateMatrix(); proxy.updateMatrixWorld(true);
          breakables.push({ mesh: proxy, size: proxy.scale.clone(), toughness: 8, label: displayName, material: 'stone' });
          const signedArea = points.slice(0,-1).reduce((sum,p,k)=>sum+p[0]*points[k+1][1]-points[k+1][0]*p[1],0);
          const normalSign = (ringIndex === 0 ? -1 : 1) * (Math.sign(signedArea) || 1);
          const wall: WallRecord = { proxy, matrix: proxy.matrix.clone(), shown: true, normalSign, color: color.getHex(), windows: [], trims: [] };
          const across = Math.max(1, Math.round(width / profile.bayWidth));
          for (let floor = 0; floor < floors; floor++) for (let col = 0; col < across; col++) {
            // 거리뷰에서 확인한 10동 연결교 쪽 끝벽은 창 없는 벽돌 면이다.
            if (building.id === EDUCATION10_LINK.buildingId && ringIndex === 0 && i === EDUCATION10_LINK.edgeIndex) continue;
            // 소식지의 2동 동쪽 끝벽은 출입문과 발코니 외에 일반 창이 없는 벽돌 면이다.
            if (humanities23Active && building.id === HUMANITIES23.buildingId && ringIndex === 0 && [5, 6].includes(i)) continue;
            if (humanities35Active && building.id === HUMANITIES35.buildingId && ringIndex === 0 && i === 1) continue;
            if (profile.facadePattern === 'checker' && (floor + col + j * across) % 2) continue;
            // 양쪽 면을 한 얇은 상자로 표현해서 방향과 무관하게 창문이 보인다.
            const along = ((col + .5) / across - .5) * width;
            // 사진을 참고해 따로 만든 1동 입구 양옆 창과 일반 창을 겹쳐 표시하지 않는다.
            if (humanitiesLayout && ringIndex === 0 && i === 0) {
              const n = Math.abs(humanitiesLayout.local([px + Math.cos(angle) * along, pz - Math.sin(angle) * along]).n);
              if ((floor === 0 && n < 8) || (floor === 1 && n < 2.6)) continue;
            }
            const ratioX = profile.facadePattern === 'checker' || profile.windowStyle === 'curtain' ? .96 : profile.windowStyle === 'ribbon' ? 1 : profile.windowWidthRatio;
            const ratioY = profile.windowStyle === 'curtain' ? .94 : profile.windowHeightRatio;
            const centerY = base + (floor + .54) * height / floors, windowHeight = height / floors * ratioY;
            const low = connectionOpening ? Math.max(bottom, centerY - windowHeight / 2) : centerY - windowHeight / 2;
            const high = connectionOpening ? Math.min(top, centerY + windowHeight / 2) : centerY + windowHeight / 2;
            if (high - low < .001) continue;
            dummy.position.set(px + Math.cos(angle) * along, (low + high) / 2, pz - Math.sin(angle) * along);
            dummy.rotation.set(0, angle, 0); dummy.scale.set(width / across * ratioX, high - low, .73); dummy.updateMatrix();
            wall.windows.push({ matrix: dummy.matrix.clone(), index: windowCount++ });
            const observedHumanitiesWindows = humanities35Active && ringIndex === 0 && (building.id === HUMANITIES35.neighborId ? [1, 2, 3, 4].includes(i) : building.id === HUMANITIES35.buildingId && [7, 8, 9].includes(i));
            if (observedHumanitiesWindows) {
              const windowWidth = width / across * ratioX;
              const trim = (offset: number, center: number, w: number, h: number) => { dummy.position.set(px + Math.cos(angle) * (along + offset), center, pz - Math.sin(angle) * (along + offset)); dummy.rotation.set(0, angle, 0); dummy.scale.set(w, h, .79); dummy.updateMatrix(); wall.trims.push({ matrix: dummy.matrix.clone(), index: trimCount++ }); };
              for (const offset of [-windowWidth / 2, 0, windowWidth / 2]) trim(offset, (low + high) / 2, .055, high - low);
              for (const h of [low, high]) trim(0, h, windowWidth, .055);
              if (floor === 0) for (let offset = -windowWidth / 2 + .18; offset < windowWidth / 2; offset += .18) trim(offset, (low + high) / 2, .022, high - low);
            }
          }
          if (profile.horizontalBands) for (let floor = 1; floor <= floors; floor++) {
            if (humanities23Active && building.id === HUMANITIES23.buildingId && ringIndex === 0 && [5, 6].includes(i)) continue;
            if (humanities35Active && building.id === HUMANITIES35.buildingId && ringIndex === 0 && i === 1) continue;
            const centerY = base + floor * height / floors - .16, low = Math.max(bottom, centerY - .12), high = Math.min(top, centerY + .12);
            if (high - low < .001) continue;
            dummy.position.set(px, (low + high) / 2, pz); dummy.rotation.set(0, angle, 0); dummy.scale.set(width + .03, high - low, .86); dummy.updateMatrix();
            wall.trims.push({ matrix: dummy.matrix.clone(), index: trimCount++ });
          }
          if (profile.verticalFins) for (let col = 0; col <= across; col++) {
            const along = (col / across - .5) * width;
            const low = Math.max(bottom, base), high = Math.min(top, base + height);
            if (high - low < .001) continue;
            dummy.position.set(px + Math.cos(angle) * along, (low + high) / 2, pz - Math.sin(angle) * along); dummy.rotation.set(0, angle, 0); dummy.scale.set(.14, high - low, .96); dummy.updateMatrix();
            wall.trims.push({ matrix: dummy.matrix.clone(), index: trimCount++ });
          }
          pieces.push(wall);
        }
      }
    }
    const averageWidth = pieces.reduce((sum, piece) => sum + piece.proxy.scale.x, 0) / Math.max(1, pieces.length);
    const walls = new THREE.InstancedMesh(cube, wallSurface(profile, height, averageWidth), pieces.length);
    const glass = new THREE.InstancedMesh(cube, materials.glass, windowCount);
    // 먼 파괴 건물의 유리는 양면 사각형으로 유지해 상자 창문의 삼각형 수를 줄인다.
    const distantGlass = new THREE.InstancedMesh(glassPlanes, materials.glass, windowCount);
    const trims = new THREE.InstancedMesh(cube, materials.frame, trimCount);
    pieces.forEach((piece, i) => {
      walls.setMatrixAt(i, piece.matrix); walls.setColorAt(i, color);
      for (const win of piece.windows) { glass.setMatrixAt(win.index, win.matrix); distantGlass.setMatrixAt(win.index, win.matrix); }
      for (const trim of piece.trims) trims.setMatrixAt(trim.index, trim.matrix);
    });
    let distantShell: THREE.BufferGeometry = farGeometry;
    if (connectionOpenings.length) {
      // 원거리에서도 실제 벽 조각을 써서 연결 입구가 막힌 외벽으로 돌아오지 않게 한다.
      const positions: number[] = [];
      const append = (geometry: THREE.BufferGeometry) => {
        const source = geometry.index ? geometry.toNonIndexed() : geometry;
        const p = source.getAttribute('position');
        for (let i = 0; i < p.count; i++) positions.push(p.getX(i), p.getY(i), p.getZ(i));
        if (source !== geometry) source.dispose();
        geometry.dispose();
      };
      for (const piece of pieces) append(cube.clone().applyMatrix4(piece.matrix).translate(-x, -foundationBase, -z));
      append(footprint(building, x, z, .48).translate(0, base + height - .1 - foundationBase, 0));
      distantShell = new THREE.BufferGeometry();
      distantShell.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); distantShell.computeVertexNormals();
    }
    distantBuildings.add(far, createDistantGeometry(distantShell, new THREE.Vector3(x, foundationBase, z), profile, pieces), x, z, windowCount);
    if (distantShell !== farGeometry) distantShell.dispose();
    farGeometry.dispose();
    walls.castShadow = true; walls.receiveShadow = true; glass.castShadow = false;
    walls.instanceMatrix.setUsage(THREE.DynamicDrawUsage); glass.instanceMatrix.setUsage(THREE.DynamicDrawUsage); distantGlass.instanceMatrix.setUsage(THREE.DynamicDrawUsage); trims.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // 최초의 온전한 경계를 유지하면 원거리 파괴 후 초기화해도 잘못 잘리지 않는다.
    walls.computeBoundingSphere(); glass.computeBoundingSphere(); distantGlass.computeBoundingSphere(); trims.computeBoundingSphere();
    walls.userData.role = 'walls'; glass.userData.role = 'detailed-windows'; distantGlass.userData.role = 'distant-windows'; trims.userData.role = 'facade-trims';
    near.add(walls, glass, distantGlass, trims);
    const roof = new THREE.Mesh(footprint(building, x, z, .48), materials.roof);
    roof.position.set(x, base + height - .1, z); roof.receiveShadow = true; near.add(roof);
    const xs = building.points.map(p => p[0]), zs = building.points.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const roofProxy: THREE.Mesh<THREE.BufferGeometry> = new THREE.Mesh(cube, materials.roof);
    roofProxy.position.set((minX + maxX) / 2, base + height + .12, (minZ + maxZ) / 2); roofProxy.scale.set(maxX - minX, .5, maxZ - minZ);
    roofProxy.userData.buildingId = building.id; roofProxy.userData.renderProxy = true; roofProxy.userData.roof = true;
    roofProxy.updateMatrix(); roofProxy.updateMatrixWorld(true);
    let roofCollisionVertices: Float32Array | undefined;
    const roofSize = roofProxy.scale.clone();
    if (humanities250Active && building.id === HUMANITIES250.neighborId) {
      // 1동 지붕의 큰 직육면체 충돌체가 건물 밖 250동 계단까지 막지 않게 한다.
      roofProxy.geometry = footprint(building, roofProxy.position.x, roofProxy.position.z, .48).translate(0, -.24, 0);
      roofProxy.position.y = base + height + .14; roofProxy.scale.setScalar(1);
      roofProxy.userData.convex = true;
      roofCollisionVertices = Float32Array.from(roofProxy.geometry.attributes.position.array);
      roofProxy.updateMatrix(); roofProxy.updateMatrixWorld(true);
    }
    breakables.push({ mesh: roofProxy, size: roofSize, collisionVertices: roofCollisionVertices, toughness: 12, label: `${displayName} 지붕`, material: 'stone' });
    const radius = Math.hypot(maxX - minX, maxZ - minZ) / 2;
    const rooftop = new THREE.Group(); rooftop.name = `${building.id}:rooftop`; rooftop.userData.buildingId = building.id; rooftop.userData.role = 'rooftop'; scene.add(rooftop);
    if (profile.roofStyle === 'equipment' && maxX - minX > 10 && maxZ - minZ > 10) {
      const plant = new THREE.Mesh(cube, materials.frame); plant.position.set(x, base + height + .85, z); plant.scale.set(Math.min(8, (maxX - minX) * .22), 1.3, Math.min(6, (maxZ - minZ) * .2)); rooftop.add(plant);
    }
    if (profile.roofStyle === 'parapet') {
      const parapetPieces = new THREE.InstancedMesh(cube, materials.frame, pieces.length);
      pieces.forEach((piece, i) => { dummy.position.copy(piece.proxy.position); dummy.position.y = base + height + .26; dummy.quaternion.copy(piece.proxy.quaternion); dummy.scale.set(piece.proxy.scale.x, .6, .45); dummy.updateMatrix(); parapetPieces.setMatrixAt(i, dummy.matrix); });
      rooftop.add(parapetPieces);
    }
    const view: BuildingView = { x, z, radius, far, near, walls, glass, distantGlass, trims, pieces, roof, roofProxy, rooftop, damaged: false };
    if (showBuildingLabel) {
      const label = makeLabel(displayLabel); label.position.set(x, base + height + 5, z); label.scale.set(31, 5.8, 1); scene.add(label); view.label = label;
    }
    buildingViews.push(view);
  }
  distantBuildings.finish();

  const humanities7Building = renderedBuildings.find(b => b.id === HUMANITIES7_ID);
  if (humanities7Building && options.humanities7 !== false) {
    humanities7 = createHumanities7Landmark(scene, humanities7Building, heightAt, (humanities8?.shell.userData.humanities8Access.pavementMasks ?? []).map((m: { polygon: CampusPoint[] }) => m.polygon));
    breakables.push(...humanities7.breakables); landmarkViews.push(humanities7);
    if (humanities8) Object.assign(humanities8.shell.userData.humanities8Access, { northStairTo5Implemented: true, northStairOwner: 'landmark/humanities7' });
  }

  const humanities6Building = renderedBuildings.find(b => b.id === HUMANITIES6_ID);
  if (humanities6Building && options.humanities6 !== false) {
    humanities6 = createHumanities6Landmark(scene, humanities6Building, heightAt, (humanities7?.shell.userData.humanities7Access.pavementMasks ?? []).map((m: { polygon: CampusPoint[] }) => m.polygon));
    breakables.push(...humanities6.breakables); landmarkViews.push(humanities6);
  }

  // 기본 도로는 6m 간격이며, 세분 지형에 닿는 구간만 길이와 너비 방향으로 더 나눈다.
  const roadPositions: number[] = [], pathPositions: number[] = [], linePositions: number[] = [];
  function ribbon(points: CampusPoint[], width: number, destination: number[], offset = .14) {
    const detail = heightAt as TerrainHeightSampler;
    const sampled: CampusPoint[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 6));
      for (let j = 0; j < n; j++) sampled.push([a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n]);
    }
    sampled.push(points.at(-1)!);
    // 기본 구간 두 칸까지 여유를 둬 지형 세분 경계와 도로 연결부가 겹치지 않게 한다.
    const joinMargin = 12;
    const detailed = sampled.slice(0, -1).map((a, i) => {
      const b = sampled[i + 1];
      return (detail.roadDetailRegions ?? detail.detailRegions)?.some(region =>
        Math.max(a[0], b[0]) + width / 2 >= region.minX - joinMargin && Math.min(a[0], b[0]) - width / 2 <= region.maxX + joinMargin &&
        Math.max(a[1], b[1]) + width / 2 >= region.minZ - joinMargin && Math.min(a[1], b[1]) - width / 2 <= region.maxZ + joinMargin) ?? false;
    });
    for (let i = 0; i < sampled.length - 1; i++) {
      const a = sampled[i], b = sampled[i + 1];
      const midX = (a[0] + b[0]) / 2, midZ = (a[1] + b[1]) / 2;
      if (destination === pathPositions && Math.abs(midX) < 24 && midZ > -45 && midZ < 45) continue;
      const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
      if (len < .01) continue;
      const nx = -dz / len * width / 2, nz = dx / len * width / 2;
      if(detail.roadSurfaceTriangles){
        const edge=(index:number):CampusPoint=>{const here=sampled[index],previous=sampled[Math.max(0,index-1)],next=sampled[Math.min(sampled.length-1,index+1)];let ax=here[0]-previous[0],az=here[1]-previous[1],bx=next[0]-here[0],bz=next[1]-here[1];if(index===0){ax=bx;az=bz;}if(index===sampled.length-1){bx=ax;bz=az;}const al=Math.hypot(ax,az),bl=Math.hypot(bx,bz),mx=-az/al-bz/bl,mz=ax/al+bx/bl,ml=Math.hypot(mx,mz),dot=((-bz/bl)*mx+(bx/bl)*mz)/ml,scale=Math.min(width,width/2/Math.max(.5,dot));return[mx/ml*scale,mz/ml*scale];};
        const ea=edge(i),eb=edge(i+1),polygon:CampusPoint[]=[[a[0]+ea[0],a[1]+ea[1]],[a[0]-ea[0],a[1]-ea[1]],[b[0]-eb[0],b[1]-eb[1]],[b[0]+eb[0],b[1]+eb[1]]];
        const q={minX:Math.min(...polygon.map(p=>p[0])),maxX:Math.max(...polygon.map(p=>p[0])),minZ:Math.min(...polygon.map(p=>p[1])),maxZ:Math.max(...polygon.map(p=>p[1]))},terrainTriangles=(destination===roadPositions&&detail.preservedDrivingSurfaceTriangles?detail.preservedDrivingSurfaceTriangles:detail.roadSurfaceTriangles)(q);
        if(terrainTriangles){
          const signedArea=polygon.reduce((sum,p,j)=>{const next=polygon[(j+1)%polygon.length];return sum+p[0]*next[1]-next[0]*p[1];},0),sign=Math.sign(signedArea);
          for(const triangle of terrainTriangles){let clipped:number[][]=[triangle.slice(0,3),triangle.slice(3,6),triangle.slice(6,9)];
            for(let e=0;e<polygon.length&&clipped.length;e++){const u=polygon[e],v=polygon[(e+1)%polygon.length],distance=(p:number[])=>sign*((v[0]-u[0])*(p[2]-u[1])-(v[1]-u[1])*(p[0]-u[0])),next:number[][]=[];
              for(let j=0;j<clipped.length;j++){const p=clipped[j],r=clipped[(j+1)%clipped.length],dp=distance(p),dr=distance(r),pin=dp>=-1e-8,rin=dr>=-1e-8;if(pin)next.push(p);if(pin!==rin){const t=dp/(dp-dr);next.push(p.map((value,k)=>value+(r[k]-value)*t));}}clipped=next;
            }
            for(let j=1;j<clipped.length-1;j++)for(const p of[clipped[0],clipped[j],clipped[j+1]])destination.push(p[0],p[1]+.03+offset,p[2]);
          }
          continue;
        }
      }
      if (detailed[i]) {
        const step = detail.sampleStep ?? 1, along = Math.max(1, Math.ceil(len / step)), across = Math.max(1, Math.ceil(width / step));
        const point = (u: number, v: number): CampusPoint => [a[0] + dx * u + nx * (1 - 2 * v), a[1] + dz * u + nz * (1 - 2 * v)];
        for (let u = 0; u < along; u++) for (let v = 0; v < across; v++) {
          const vertices = [point(u / along, v / across), point(u / along, (v + 1) / across), point((u + 1) / along, v / across), point((u + 1) / along, (v + 1) / across)];
          for (const k of [0, 2, 1, 1, 2, 3]) { const p = vertices[k]; destination.push(p[0], heightAt(p[0], p[1]) + offset, p[1]); }
        }
        continue;
      }
      const vertices = [[a[0] + nx, a[1] + nz], [a[0] - nx, a[1] - nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz]];
      if (detailed[i - 1] || detailed[i + 1]) {
        // 이웃 기본 구간도 같은 횡단선 정점을 사용해 세분 도로와 높이 틈이 생기지 않게 한다.
        for (const end of [0, 1]) {
          if (!(end ? detailed[i + 1] : detailed[i - 1])) continue;
          const before = sampled[end ? i + 1 : i - 1], after = sampled[end ? i + 2 : i], centre = end ? b : a;
          const ex = after[0] - before[0], ez = after[1] - before[1], distance = Math.hypot(ex, ez);
          const ox = -ez / distance * width / 2, oz = ex / distance * width / 2;
          vertices[end * 2] = [centre[0] + ox, centre[1] + oz]; vertices[end * 2 + 1] = [centre[0] - ox, centre[1] - oz];
        }
        const across = Math.max(1, Math.ceil(width / (detail.sampleStep ?? 1))), polygon: number[][] = [];
        for (const [from, to] of [[0, 2], [2, 3], [3, 1], [1, 0]]) {
          const p = vertices[from], q = vertices[to]; polygon.push(p);
          const divided = from === 2 && detailed[i + 1] || from === 1 && detailed[i - 1];
          if (divided) for (let v = 1; v < across; v++) polygon.push([p[0] + (q[0] - p[0]) * v / across, p[1] + (q[1] - p[1]) * v / across]);
        }
        const centre = [midX, midZ];
        for (let v = 0; v < polygon.length; v++) for (const p of [centre, polygon[v], polygon[(v + 1) % polygon.length]]) destination.push(p[0], heightAt(p[0], p[1]) + offset, p[1]);
        continue;
      }
      for (const k of [0, 2, 1, 1, 2, 3]) { const p = vertices[k]; destination.push(p[0], heightAt(p[0], p[1]) + offset, p[1]); }
    }
  }
  for (const road of data.roads) {
    if(engineering3334Layout&&['way/1485386285/565','way/179742152/81'].includes(road.id))continue;
    if (science2256Layout && road.id==='way/167606288/25') continue;
    if (physics561Layout && road.id==='way/248013972/100') continue;
    if (pharmacy143Layout && road.id===PHARMACY143_BRIDGE_ROAD) continue;
    if (humanities23Active && road.id === HUMANITIES23.bridgeRoad) continue;
    if (humanities35Active && road.id === HUMANITIES35.bridgeRoad) continue;
    if (road.points.length < 2) continue;
    // 낮은 주차장 진입로는 실제 지형 면에서 1cm만 띄워 충돌 바닥과 맞춘다.
    const parkingRoad=road.id===EDUCATION_PARKING_SITE.sourceRoad&&!!scene.getObjectByName('campus-terrain')?.userData.educationParkingCorrection;
    ribbon(road.points, Math.max(1.3, road.width), road.drivable ? roadPositions : pathPositions, parkingRoad ? -.02 : road.drivable ? .14 : .12);
    if (road.drivable && road.width >= 6) ribbon(road.points, .15, linePositions, .18);
  }
  // 서로 다른 원본 도로의 직각 끝선 사이에 남는 카페 앞 접합 틈을 채운다.
  // 도로 중심선과 통행 폭은 바꾸지 않고 기존 차도와 같은 높이로 표시한다.
  if (education12 && cafe111) {
    const junction = EDUCATION12_SITE.origin;
    const roads = [EDUCATION12_SITE.road19, EDUCATION12_SITE.road333].map(path => data.roads.find(road => road.drivable && road.points.some(p => Math.hypot(p[0]-path[0][0],p[1]-path[0][1])<.001) && road.points.some(p => Math.hypot(p[0]-path[1][0],p[1]-path[1][1])<.001)));
    if (roads.every(Boolean)) {
      const polygon: CampusPoint[] = [junction, ...[EDUCATION12_SITE.road19, EDUCATION12_SITE.road333].map((path,i):CampusPoint => { const dx=path[1][0]-junction[0],dz=path[1][1]-junction[1],length=Math.hypot(dx,dz),half=roads[i]!.width/2,sign=i===0?1:-1;return[junction[0]-dz/length*half*sign,junction[1]+dx/length*half*sign]; })];
      const bounds={minX:Math.min(...polygon.map(p=>p[0])),maxX:Math.max(...polygon.map(p=>p[0])),minZ:Math.min(...polygon.map(p=>p[1])),maxZ:Math.max(...polygon.map(p=>p[1]))};
      const sampler=(heightAt as TerrainHeightSampler).roadSurfaceTriangles,triangles=sampler?.(bounds)??[polygon.flatMap(p=>[p[0],heightAt(...p)-.03,p[1]])];
      const before=roadPositions.length;
      for(const triangle of triangles){let clipped:number[][]=[triangle.slice(0,3),triangle.slice(3,6),triangle.slice(6,9)];
        for(let e=0;e<polygon.length&&clipped.length;e++){const a=polygon[e],b=polygon[(e+1)%polygon.length],distance=(p:number[])=>(b[0]-a[0])*(p[2]-a[1])-(b[1]-a[1])*(p[0]-a[0]),next:number[][]=[];
          for(let j=0;j<clipped.length;j++){const p=clipped[j],q=clipped[(j+1)%clipped.length],dp=distance(p),dq=distance(q);if(dp>=-1e-8)next.push(p);if((dp>=-1e-8)!==(dq>=-1e-8))next.push(p.map((v,k)=>v+(q[k]-v)*dp/(dp-dq)));}clipped=next;
        }
        for(let j=1;j+1<clipped.length;j++)for(const p of[clipped[0],clipped[j],clipped[j+1]])roadPositions.push(p[0],p[1]+.17,p[2]);
      }
      scene.userData.education12RoadJunction={polygon,sourceRoadIds:roads.map(r=>r!.id),addedTriangles:(roadPositions.length-before)/9,rawRoadDataModified:false,physicalSurface:'existing terrain'};
    }
  }
  const humanitiesBuilding = renderedBuildings.find(b => b.id === 'way/167984624');
  const humanitiesPassage = humanitiesBuilding && data.roads.some(road => road.id === 'way/1429747754/540')
    ? createHumanitiesPassage(scene, heightAt, humanitiesBuilding.points) : undefined;
  if (humanitiesPassage) { breakables.push(...humanitiesPassage.breakables); landmarkViews.push(humanitiesPassage); }
  const humanities14 = renderedBuildings.some(b => b.id === HUMANITIES14_STAIR.buildingId) && data.roads.some(r => r.id === HUMANITIES14_STAIR.roadId)
    ? createHumanities14Stair(scene) : undefined;
  if (humanities14) { breakables.push(...humanities14.breakables); landmarkViews.push(humanities14); }
  const humanitiesUpper = options.humanitiesUpper !== false && humanities6 && humanities14 && HUMANITIES_UPPER_ROADS.every(id=>data.roads.some(r=>r.id===id))
    ? createHumanitiesUpperApproach(scene, [...humanities6.shell.userData.humanities6Access.pavementMasks, ...humanities14.shell.userData.humanities14Access.pavementMasks].map((m: { polygon: CampusPoint[] })=>m.polygon)) : undefined;
  if(humanitiesUpper) { breakables.push(...humanitiesUpper.breakables); landmarkViews.push(humanitiesUpper); }
  const humanities14Building=renderedBuildings.find(b=>b.id===HUMANITIES14_ID);
  const humanities14Exterior=humanities14Building && options.humanities14Exterior !== false ? createHumanities14Landmark(scene,humanities14Building,heightAt,[...(humanities6?.shell.userData.humanities6Access.pavementMasks??[]),...(humanities14?.shell.userData.humanities14Access.pavementMasks??[]),...(humanitiesUpper?.shell.userData.humanitiesUpperAccess.pavementMasks??[])].map((m:{polygon:CampusPoint[]})=>m.polygon)) : undefined;
  if(humanities14Exterior){breakables.push(...humanities14Exterior.breakables);landmarkViews.push(humanities14Exterior);}
  const humanitiesGarden = HUMANITIES_GARDEN.buildingIds.every(id => renderedBuildings.some(b => b.id === id))
    ? createHumanitiesGarden(scene) : undefined;
  if (humanitiesGarden) { breakables.push(...humanitiesGarden.breakables); landmarkViews.push(humanitiesGarden); }
  if (humanities250Active) {
    const connection = createHumanities250(scene, heightAt); breakables.push(...connection.breakables); landmarkViews.push(connection);
  }
  const humanities1 = humanitiesBuilding && options.humanities1 !== false ? createHumanities1Landmark(scene,humanitiesBuilding,heightAt,(humanitiesPassage?.shell.userData.humanitiesPassage.pavementMasks??[]).map((m:{polygon:CampusPoint[]})=>m.polygon),humanities250Active) : undefined;
  if(humanities1){breakables.push(...humanities1.breakables);landmarkViews.push(humanities1);}
  const humanities2Building = renderedBuildings.find(b=>b.id===HUMANITIES2_ID);
  const humanities2 = humanities2Building && options.humanities2 !== false ? createHumanities2Landmark(scene,humanities2Building,heightAt,humanities250Active,humanities23Active) : undefined;
  if(humanities2){breakables.push(...humanities2.breakables);landmarkViews.push(humanities2);}
  const humanities23 = humanities23Active ? createHumanities23Connection(scene, heightAt, renderedBuildings.filter(b => [HUMANITIES23.buildingId, HUMANITIES23.neighborId, 'way/167983611'].includes(b.id)).map(b => b.points)) : undefined;
  if (humanities23) { breakables.push(...humanities23.breakables); landmarkViews.push(humanities23); }
  if(options.humanities35Exterior!==false)for(const building of renderedBuildings.filter(b=>HUMANITIES35_EXTERIOR_IDS.includes(b.id))){const exterior=createHumanities35Exterior(scene,building,heightAt,humanities23Active,humanities35Active);breakables.push(...exterior.breakables);landmarkViews.push(exterior);}
  const humanities35 = humanities35Active ? createHumanities35Connection(scene, heightAt, renderedBuildings.filter(b => [HUMANITIES35.buildingId, HUMANITIES35.neighborId].includes(b.id)).map(b => b.points), (humanities23?.shell.userData.humanities23.pavementMasks ?? []).map((m: { polygon: CampusPoint[] }) => m.polygon)) : undefined;
  if (humanities35) { breakables.push(...humanities35.breakables); landmarkViews.push(humanities35); }
  const dining76 = renderedBuildings.some(b => b.id === DINING76_SITE.buildingId) && data.roads.some(r => r.id === DINING76_SITE.sourceRoad)
    ? createDining76Approach(scene, heightAt, data) : undefined;
  if (dining76) { breakables.push(...dining76.breakables); landmarkViews.push(dining76); }
  const dining76East = renderedBuildings.some(b => b.id === DINING76_EAST_SITE.buildingId) && data.roads.some(r => r.id === DINING76_EAST_SITE.sourceRoad)
    ? createDining76EastApproach(scene, heightAt) : undefined;
  if (dining76East) {
    breakables.push(...dining76East.breakables); landmarkViews.push(dining76East);
    if (dining76) Object.assign(dining76.shell.userData.dining76Access.scope, { rightStair87Implemented: true, rightStair87Reason: '별도 동측 모듈이 계단과 상부 외부 보행 연결을 구현한다. 치수와 가려진 연결 바닥은 근사다.', rightStair87Module: 'dining76EastApproach', rightStair87AccessShell: dining76East.shell.name });
  }
  const education10Building=renderedBuildings.find(b=>b.id===EDUCATION10_ID);
  const education10=education10Building&&options.education10Exterior!==false?createEducation10Exterior(scene,education10Building,heightAt):undefined;
  if(education10){breakables.push(...education10.breakables);landmarkViews.push(education10);}
  const education13Building=renderedBuildings.find(b=>b.id===EDUCATION13_ID),education13Layout=scene.getObjectByName('campus-terrain')?.userData.education13Correction?.layout;
  const education13=education13Building&&education13Layout&&options.education13!==false?createEducation13Exterior(scene,education13Building,education13Layout,heightAt,education1320Layout):undefined;
  const education1320Building=renderedBuildings.find(b=>b.id===EDUCATION1320_ID),education1320=education1320Building&&education1320Layout?createEducation1320Connection(scene,education1320Building,education1320Layout):undefined;
  const engineering30Building=renderedBuildings.find(b=>b.id===ENGINEERING30_ID),engineering30=engineering30Building&&engineering30Layout?createEngineering30Exterior(scene,engineering30Building,engineering30Layout,heightAt):undefined;
  if(engineering30){breakables.push(...engineering30.breakables);landmarkViews.push(engineering30);}
  const engineering39=engineering39Layout?createEngineering39Exterior(scene,engineering39Layout):undefined;
  if(engineering39){breakables.push(...engineering39.breakables);landmarkViews.push(engineering39);}
  const engineering3736=engineering3736Layout?createEngineering3736Access(scene,engineering3736Layout):undefined;
  if(engineering3736){breakables.push(...engineering3736.breakables);landmarkViews.push(engineering3736);}
  const engineering35Access=engineering35AccessLayout?createEngineering35Access(scene,engineering35AccessLayout):undefined;
  if(engineering35Access){breakables.push(...engineering35Access.breakables);landmarkViews.push(engineering35Access);}
  const engineering3334=engineering3334Layout?createEngineering3334Access(scene,engineering3334Layout):undefined;
  if(engineering3334){breakables.push(...engineering3334.breakables);landmarkViews.push(engineering3334);}
  const engineering3436=engineering3436Layout?createEngineering3436Exterior(scene,engineering3436Layout,engineering3334Layout):undefined;
  if(engineering3436){breakables.push(...engineering3436.breakables);landmarkViews.push(engineering3436);}
  const engineering36=engineering36Layout?createEngineering36Exterior(scene,engineering36Layout,engineering3436Layout?.openings36):undefined;
  if(engineering36){breakables.push(...engineering36.breakables);landmarkViews.push(engineering36);}
  const engineering37=engineering37Layout?createEngineering37Exterior(scene,engineering37Layout):undefined;
  if(engineering37){breakables.push(...engineering37.breakables);landmarkViews.push(engineering37);}
  const engineering3337=engineering3337Layout?createEngineering3337Access(scene,engineering3337Layout):undefined;
  if(engineering3337){breakables.push(...engineering3337.breakables);landmarkViews.push(engineering3337);}
  const engineering33Building=renderedBuildings.find(b=>b.id===ENGINEERING33_ID),engineering33=engineering33Building&&engineering33Layout?createEngineering33Exterior(scene,engineering33Building,engineering33Layout,heightAt,engineering3334Layout):undefined;
  if(engineering33){breakables.push(...engineering33.breakables);landmarkViews.push(engineering33);}
  const engineering3033=engineering3033Layout?createEngineering3033Access(scene,engineering3033Layout):undefined;
  if(engineering3033){breakables.push(...engineering3033.breakables);landmarkViews.push(engineering3033);}
  const engineering30DiningBuilding=renderedBuildings.find(b=>b.id===ENGINEERING30_DINING_ID),engineering30Dining=engineering30DiningBuilding&&engineering30DiningLayout?createEngineering30DiningExterior(scene,engineering30DiningBuilding,engineering30DiningLayout,heightAt):undefined;
  if(engineering30Dining){breakables.push(...engineering30Dining.breakables);landmarkViews.push(engineering30Dining);}
  const science28Building=renderedBuildings.find(b=>b.id===SCIENCE28_ID),science28=science28Building&&science28Layout?createScience28Exterior(scene,science28Building,science28Layout,heightAt):undefined;
  if(science28){breakables.push(...science28.breakables);landmarkViews.push(science28);}
  const science251Building=renderedBuildings.find(b=>b.id===SCIENCE251_ID),science251=science251Building&&science251Layout?createScience251Exterior(scene,science251Building,science251Layout,heightAt):undefined;
  if(science251){breakables.push(...science251.breakables);landmarkViews.push(science251);}
  const science24Building=renderedBuildings.find(b=>b.id===SCIENCE24_ID),science24=science24Building&&science24Layout?createScience24Exterior(scene,science24Building,science24Layout,heightAt,science251Layout?.connection24):undefined;
  if(science24){breakables.push(...science24.breakables);landmarkViews.push(science24);}
  const science2527=science2527Layout?createScience2527Exterior(scene,renderedBuildings,science2527Layout,heightAt,science24Layout?.connection25):undefined;
  if(science2527){breakables.push(...science2527.breakables);landmarkViews.push(science2527);}
  const science26Building=renderedBuildings.find(b=>b.id===SCIENCE26_ID);
  const science26=science26Layout&&science26Building?createScience26Exterior(scene,science26Building,science26Layout,heightAt):undefined;
  if(science26){breakables.push(...science26.breakables);landmarkViews.push(science26);}
  const science23Building=renderedBuildings.find(b=>b.id===SCIENCE23_ID);
  const science23=science23Layout&&science23Building?createScience23Exterior(scene,science23Building,science23Layout,heightAt):undefined;
  if(science23){breakables.push(...science23.breakables);landmarkViews.push(science23);}
  const science2256=science2256Layout?createScience2256Exterior(scene,renderedBuildings,science2256Layout,heightAt):undefined;
  if(science2256){breakables.push(...science2256.breakables);landmarkViews.push(science2256);}
  const physics561Building=renderedBuildings.find(b=>b.id===PHYSICS561_ID),physics561=physics561Building&&physics561Layout?createPhysics561Exterior(scene,physics561Building,physics561Layout,heightAt):undefined;
  if(physics561){breakables.push(...physics561.breakables);landmarkViews.push(physics561);}
  const pharmacy143Building=renderedBuildings.find(b=>b.id===PHARMACY143_ID),pharmacy143=pharmacy143Building&&pharmacy143Layout?createPharmacy143Exterior(scene,pharmacy143Building,pharmacy143Layout,heightAt):undefined;
  if(pharmacy143){breakables.push(...pharmacy143.breakables);landmarkViews.push(pharmacy143);}
  const pharmacy21Building=renderedBuildings.find(b=>b.id===PHARMACY21_ID),pharmacy21=pharmacy21Building&&pharmacy21Layout?createPharmacy21Exterior(scene,pharmacy21Building,pharmacy21Layout,heightAt):undefined;
  if(pharmacy21){breakables.push(...pharmacy21.breakables);landmarkViews.push(pharmacy21);}
  const pharmacy20Building=renderedBuildings.find(b=>b.id===PHARMACY20_ID),pharmacy20=pharmacy20Building&&pharmacy20Layout?createPharmacy20Exterior(scene,pharmacy20Building,pharmacy20Layout,heightAt,pharmacy2021Layout,pharmacy143Layout):undefined;
  const pharmacy2021Building=renderedBuildings.find(b=>b.id===PHARMACY2021_ID),pharmacy2021=pharmacy2021Building&&pharmacy2021Layout?createPharmacy2021Connection(scene,pharmacy2021Building,pharmacy2021Layout):undefined;
  if(pharmacy2021){breakables.push(...pharmacy2021.breakables);landmarkViews.push(pharmacy2021);}
  if(pharmacy20){breakables.push(...pharmacy20.breakables);landmarkViews.push(pharmacy20);}
  if(education1320){breakables.push(...education1320.breakables);landmarkViews.push(education1320);}
  if(education13){breakables.push(...education13.breakables);landmarkViews.push(education13);}
  const education11Building=renderedBuildings.find(b=>b.id===EDUCATION11_ID);
  const education11=education11Building&&options.education11Exterior!==false?createEducation11Exterior(scene,education11Building,heightAt,options.education1112!==false):undefined;
  if(education11){breakables.push(...education11.breakables);landmarkViews.push(education11);}
  const education1112=education11&&education12&&options.education1112!==false?createEducation1112Connection(scene,getEducation12Layout(heightAt),education11.shell.userData.education11Exterior.floor):undefined;
  if(education1112){breakables.push(...education1112.breakables);landmarkViews.push(education1112);education11!.shell.userData.education11Exterior.connection12Implemented=true;education12!.shell.userData.education12Access.scope.building11ConnectionDoorAdded=true;}
  const education101 = renderedBuildings.some(b => b.id === EDUCATION101_SITE.buildingId) && data.roads.some(r => r.id === EDUCATION101_SITE.sourceRoad)
    ? createEducation101Approach(scene, heightAt) : undefined;
  if (education101) { breakables.push(...education101.breakables); landmarkViews.push(education101); }
  // 새 포장의 실제 외곽 안에서만 기존 보행 표시를 잘라 두 바닥이 겹치지 않게 한다.
  const northAccess = scene.children.find(o => o.userData.buildingId === 'way/297046999' && o.userData.role === 'building-shell')?.userData.northAccess;
  for (const access of [engineering39?.shell.userData.engineering39Exterior, engineering3736?.shell.userData.engineering3736Access, engineering35Access?.shell.userData.engineering35Access, engineering3334?.shell.userData.engineering3334Access, engineering3436?.shell.userData.engineering3436Exterior, engineering36?.shell.userData.engineering36Exterior, engineering37?.shell.userData.engineering37Exterior, engineering3337?.shell.userData.engineering3337Access, engineering33?.shell.userData.engineering33Exterior, engineering3033?.shell.userData.engineering3033Access, engineering30?.shell.userData.engineering30Exterior, engineering30Dining?.shell.userData.engineering30DiningExterior, science28?.shell.userData.science28Exterior, science251?.shell.userData.science251Exterior, science24?.shell.userData.science24Exterior, science2527?.shell.userData.science2527Exterior, science26?.shell.userData.science26Exterior, science23?.shell.userData.science23Exterior, science2256?.shell.userData.science2256Exterior, physics561?.shell.userData.physics561Exterior, pharmacy143?.shell.userData.pharmacy143Exterior, pharmacy21?.shell.userData.pharmacy21Exterior, scene.getObjectByName('way/329398175:library-landmark')?.userData.southeastSite, pharmacy2021?.shell.userData.pharmacy2021Access, pharmacy20?.shell.userData.pharmacy20Exterior, education1320?.shell.userData.education1320Access, education13?.shell.userData.education13Exterior, education1112?.shell.userData.education1112Access, humanities1?.shell.userData.humanities1Exterior, humanities14Exterior?.shell.userData.humanities14Exterior, humanitiesUpper?.shell.userData.humanitiesUpperAccess, northAccess, humanitiesPassage?.shell.userData.humanitiesPassage, humanities14?.shell.userData.humanities14Access, humanitiesGarden?.shell.userData.humanitiesGarden, humanities23?.shell.userData.humanities23, humanities4?.shell.userData.humanities4Access, humanities8?.shell.userData.humanities8Access, humanities7?.shell.userData.humanities7Access, humanities6?.shell.userData.humanities6Access, humanities35?.shell.userData.humanities35, dining76?.shell.userData.dining76Access, dining76East?.shell.userData.dining76EastAccess, education101?.shell.userData.education101Access, education12?.shell.userData.education12Access, cafe111?.shell.userData.cafeAccess]) {
  for (const destination of access && (access === engineering39?.shell.userData.engineering39Exterior || access === engineering3736?.shell.userData.engineering3736Access || access === engineering35Access?.shell.userData.engineering35Access || access === engineering3334?.shell.userData.engineering3334Access || access === engineering3436?.shell.userData.engineering3436Exterior || access === engineering36?.shell.userData.engineering36Exterior || access === engineering37?.shell.userData.engineering37Exterior || access === engineering3337?.shell.userData.engineering3337Access || access === engineering3033?.shell.userData.engineering3033Access || access === engineering30?.shell.userData.engineering30Exterior || access === humanities14Exterior?.shell.userData.humanities14Exterior || access === dining76?.shell.userData.dining76Access || access === dining76East?.shell.userData.dining76EastAccess || access === humanities23?.shell.userData.humanities23 || access === humanities4?.shell.userData.humanities4Access || access === humanities8?.shell.userData.humanities8Access || access === humanities7?.shell.userData.humanities7Access || access === humanities6?.shell.userData.humanities6Access || access === humanities35?.shell.userData.humanities35) ? [pathPositions, roadPositions] : [pathPositions]) {
  const northMasks = (access?.pavementMasks ?? []) as { component: string; polygon: CampusPoint[] }[];
  if (northMasks.length) {
    const area = (p: number[][], zIndex: number) => p.reduce((sum, a, i) => { const b = p[(i + 1) % p.length]; return sum + a[0] * b[zIndex] - b[0] * a[zIndex]; }, 0);
    const boundsOf = (p: number[][], zIndex: number) => ({ minX: Math.min(...p.map(v => v[0])), maxX: Math.max(...p.map(v => v[0])), minZ: Math.min(...p.map(v => v[zIndex])), maxZ: Math.max(...p.map(v => v[zIndex])) });
    const overlaps = (a: ReturnType<typeof boundsOf>, b: ReturnType<typeof boundsOf>) => a.maxX >= b.minX && a.minX <= b.maxX && a.maxZ >= b.minZ && a.minZ <= b.maxZ;
    const masks = northMasks.filter(m => m.polygon.length >= 3 && Math.abs(area(m.polygon, 1)) > 1e-8).map(m => ({ ...m, bounds: boundsOf(m.polygon, 1), sign: Math.sign(area(m.polygon, 1)) }));
    const allBounds = boundsOf(masks.flatMap(m => m.polygon), 1);
    const halfPlane = (polygon: number[][], distance: (p: number[]) => number, inside: boolean) => {
      const output: number[][] = [];
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i], b = polygon[(i + 1) % polygon.length], da = distance(a), db = distance(b);
        const keepA = inside ? da >= -1e-9 : da <= 1e-9, keepB = inside ? db >= -1e-9 : db <= 1e-9;
        if (keepA) output.push(a);
        if (keepA !== keepB) { const t = da / (da - db); output.push(a.map((v, axis) => v + (b[axis] - v) * t)); }
      }
      return output;
    };
    const kept: number[] = []; let touchedTriangles = 0;
    for (let i = 0; i < destination.length; i += 9) {
      const original = [destination.slice(i, i + 3), destination.slice(i + 3, i + 6), destination.slice(i + 6, i + 9)], bounds = boundsOf(original, 2);
      if (!overlaps(bounds, allBounds)) { kept.push(...destination.slice(i, i + 9)); continue; }
      let pieces = [original], touched = false;
      for (const mask of masks.filter(m => overlaps(bounds, m.bounds))) {
        const planes = mask.polygon.map((a, j) => { const b = mask.polygon[(j + 1) % mask.polygon.length]; return (p: number[]) => mask.sign * ((b[0] - a[0]) * (p[2] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])); });
        pieces = pieces.flatMap(piece => {
          const intersection = planes.reduce((p, distance) => halfPlane(p, distance, true), piece);
          if (intersection.length < 3 || Math.abs(area(intersection, 2)) < 1e-8) return [piece];
          touched = true; let inside = piece; const outside: number[][][] = [];
          for (const distance of planes) {
            const part = halfPlane(inside, distance, false);
            if (part.length >= 3 && Math.abs(area(part, 2)) > 1e-8) outside.push(part);
            inside = halfPlane(inside, distance, true);
            if (inside.length < 3) break;
          }
          return outside;
        });
      }
      if (touched) touchedTriangles++;
      for (const p of pieces) for (let j = 1; j + 1 < p.length; j++) if (Math.abs(area([p[0], p[j], p[j + 1]], 2)) > 1e-8) kept.push(...p[0], ...p[j], ...p[j + 1]);
    }
    access[destination === roadPositions ? 'maskedRoadOverlay' : 'maskedPolylineOverlay'] = { beforeTriangles: destination.length / 9, afterTriangles: kept.length / 9, touchedTriangles, maskCount: masks.length, bounds: allBounds, roadAndTerrainChanged: destination === roadPositions, terrainChanged: false, destroyedPavingRevealsTerrain: true };
    destination.length = 0;
    for (const value of kept) destination.push(value);
  }
  }
  }
  humanitiesPassage?.conformPathOverlay(pathPositions);
  humanities14?.conformPathOverlay(pathPositions);
  function mergedSurface(positions: number[], color: number) {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: .94, side: THREE.DoubleSide }));
    mesh.receiveShadow = true; scene.add(mesh); return mesh;
  }
  mergedSurface(roadPositions, 0x515b5b).name = 'campus-road-surface'; mergedSurface(pathPositions, 0xb5b9a7).name = 'campus-pedestrian-surface'; mergedSurface(linePositions, 0xd3bb65);
  if (data.buildings.some(b => b.id === 'way/386890828') && data.buildings.some(b => b.id === 'way/455025059') && data.roads.some(r => r.id === 'way/455018306/208')) {
    const southSite = createLivingScienceSouthSite(scene, heightAt);
    breakables.push(...southSite.breakables); landmarkViews.push(southSite);
  }
  const engineeringConnection=createCampusEngineering301303Connection(scene,heightAt);
  if(engineeringConnection){
    breakables.push(...engineeringConnection.breakables);landmarkViews.push(engineeringConnection);
    const {layout,access}=engineeringConnection.shell.userData;
    const crossing=layout.decks.find((deck:{id:string})=>deck.id==='road-crossing');
    const facilities=createEngineeringRoadFacilities(scene,heightAt,{
      road:ENGINEERING_CONNECTION_SITE.road,roadWidth:ENGINEERING_CONNECTION_SITE.roadWidth,
      bridgeCrossingZ:crossing.a[2],lowerDoor303:[access.lowerDoor303[0],access.lowerDoor303[2]],
      eastStairApproach:access.groundApproach,
      lowerDeck:layout.decks.find((deck:{id:string})=>deck.id==='303-lower-ground-link'),
    });
    breakables.push(...facilities.breakables);landmarkViews.push(facilities);
  }
  const northEngineeringConnection = createCampusEngineering303312Connection(scene, heightAt);
  if (northEngineeringConnection) {
    breakables.push(...northEngineeringConnection.breakables); landmarkViews.push(northEngineeringConnection);
  }
  for (const create of [createCampusConstruction, createEngineeringConstruction]) {
    const construction = create(scene, mappedAreas, heightAt);
    breakables.push(...construction.breakables); landmarkViews.push(construction);
  }
  const areaColors: Record<string, number> = { water: 0x5c959a, pitch: 0x5d8965, sports_centre: 0x82977b, track: 0xad7561, parking: 0x7b8380, park: 0x75946b, garden: 0x779571, grass: 0x819b70, forest: 0x647f5d, wood: 0x647f5d, construction: 0x9b917c };
  for (const area of mappedAreas) {
    if (Math.hypot(...center(area.points)) < 65) continue;
    if (area.kind === 'construction' && createConstructionGround(scene, area)) continue;
    const shape = new THREE.Shape(area.points.map(p => new THREE.Vector2(p[0], -p[1])));
    const flat = new THREE.ShapeGeometry(shape); flat.rotateX(-Math.PI / 2);
    const flatPositions = flat.attributes.position;
    const indices = flat.index!;
    const vertices: number[] = [];
    const point = (index: number): CampusPoint => [flatPositions.getX(index), flatPositions.getZ(index)];
    function subdivide(a: CampusPoint, b: CampusPoint, c: CampusPoint, depth = 0) {
      const lengths = [Math.hypot(a[0] - b[0], a[1] - b[1]), Math.hypot(b[0] - c[0], b[1] - c[1]), Math.hypot(c[0] - a[0], c[1] - a[1])];
      const longest = Math.max(...lengths);
      if (longest <= 16 || depth > 13) {
        // 낮춘 연결 구역의 잔디와 포장도 지형 삼각형에 맞춰 도로 위로 솟지 않게 한다.
        const polygon = [a, b, c];
        const terrainTriangles = (heightAt as TerrainHeightSampler).roadSurfaceTriangles?.({
          minX: Math.min(a[0], b[0], c[0]), maxX: Math.max(a[0], b[0], c[0]),
          minZ: Math.min(a[1], b[1], c[1]), maxZ: Math.max(a[1], b[1], c[1]),
        });
        if (terrainTriangles) {
          const sign = Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
          for (const triangle of terrainTriangles) {
            let clipped = [triangle.slice(0, 3), triangle.slice(3, 6), triangle.slice(6, 9)];
            for (let edge = 0; edge < 3 && clipped.length; edge++) {
              const u = polygon[edge], v = polygon[(edge + 1) % 3], next: number[][] = [];
              const distance = (p: number[]) => sign * ((v[0] - u[0]) * (p[2] - u[1]) - (v[1] - u[1]) * (p[0] - u[0]));
              for (let j = 0; j < clipped.length; j++) {
                const p = clipped[j], q = clipped[(j + 1) % clipped.length], dp = distance(p), dq = distance(q);
                const pInside = dp >= -1e-8, qInside = dq >= -1e-8;
                if (pInside) next.push(p);
                if (pInside !== qInside) {
                  const t = dp / (dp - dq);
                  next.push(p.map((value, k) => value + (q[k] - value) * t));
                }
              }
              clipped = next;
            }
            for (let j = 1; j < clipped.length - 1; j++) {
              for (const p of [clipped[0], clipped[j], clipped[j + 1]]) vertices.push(p[0], p[1] + .11, p[2]);
            }
          }
          return;
        }
        for (const p of [a, b, c]) vertices.push(p[0], heightAt(p[0], p[1]) + .08, p[1]);
        return;
      }
      const edge = lengths.indexOf(longest);
      if (edge === 0) { const m: CampusPoint = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; subdivide(a, m, c, depth + 1); subdivide(m, b, c, depth + 1); }
      else if (edge === 1) { const m: CampusPoint = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2]; subdivide(a, b, m, depth + 1); subdivide(a, m, c, depth + 1); }
      else { const m: CampusPoint = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2]; subdivide(a, b, m, depth + 1); subdivide(m, b, c, depth + 1); }
    }
    for (let i = 0; i < indices.count; i += 3) subdivide(point(indices.getX(i)), point(indices.getX(i + 1)), point(indices.getX(i + 2)));
    flat.dispose();
    dining76East?.maskMappedArea(vertices, area.id);
    education101?.maskMappedArea(vertices, area.id);
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: areaColors[area.kind] ?? 0x88987c, roughness: area.kind === 'water' ? .2 : .95, metalness: area.kind === 'water' ? .25 : 0, side: THREE.DoubleSide }));
    Object.assign(mesh.userData, { role: 'mapped-area', areaId: area.id, areaKind: area.kind });
    mesh.receiveShadow = true; scene.add(mesh);
  }

  // 수목 영역은 OSM 숲과 공원에 맞추고, 개별 나무 위치는 절차적으로 배치한다.
  const within = (p: CampusPoint, polygon: CampusPoint[]) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  };
  const buildingBounds = renderedBuildings.map(b => {
    const xs = b.points.map(p => p[0]), zs = b.points.map(p => p[1]);
    return { minX: Math.min(...xs) - 4, maxX: Math.max(...xs) + 4, minZ: Math.min(...zs) - 4, maxZ: Math.max(...zs) + 4 };
  });
  const reserved = mappedAreas.filter(a => ['pitch', 'water', 'stadium', 'track', 'construction'].includes(a.kind));
  const trees: { x: number; z: number; height: number; color: THREE.Color }[] = [];
  const roadCells = new Set<string>();
  for (const road of data.roads) for (let i = 0; i < road.points.length - 1; i++) {
    const a = road.points[i], b = road.points[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 5));
    const radius = Math.ceil((road.width / 2 + 2) / 4);
    for (let j = 0; j <= n; j++) {
      const cx = Math.round((a[0] + (b[0] - a[0]) * j / n) / 4), cz = Math.round((a[1] + (b[1] - a[1]) * j / n) / 4);
      for (let ix = -radius; ix <= radius; ix++) for (let iz = -radius; iz <= radius; iz++) roadCells.add(`${cx + ix},${cz + iz}`);
    }
  }
  let randomState = 81763;
  const random = () => { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState / 4294967296; };
  const occupied = new Set<string>();
  const addTree = (x: number, z: number) => {
    if (trees.length > 3600 || Math.hypot(x, z) < 95 || roadCells.has(`${Math.round(x / 4)},${Math.round(z / 4)}`) || buildingBounds.some(b => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ)) return;
    if (reserved.some(a => within([x, z], a.points))) return;
    const cell = `${Math.round(x / 6)},${Math.round(z / 6)}`;
    if (occupied.has(cell)) return;
    occupied.add(cell);
    trees.push({ x, z, height: 5.5 + random() * 5.5, color: new THREE.Color([0x4f7359, 0x72804c, 0x839151, 0xa49a58, 0x5d8163][Math.floor(random() * 5)]) });
  };
  for (const area of data.areas.filter(a => ['forest', 'wood', 'park', 'garden'].includes(a.kind))) {
    const xs = area.points.map(p => p[0]), zs = area.points.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const count = Math.min(1700, Math.ceil((x1 - x0) * (z1 - z0) / (area.kind === 'forest' ? 90 : 230)));
    for (let i = 0; i < count; i++) {
      const x = x0 + random() * (x1 - x0), z = z0 + random() * (z1 - z0);
      if (within([x, z], area.points)) addTree(x, z);
    }
  }
  for (const road of data.roads.filter(r => r.drivable && r.width >= 6)) for (let i = 0; i < road.points.length - 1; i++) {
    const a = road.points[i], b = road.points[i + 1];
    const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
    if (length < 14) continue;
    for (let d = 8; d < length; d += 33) for (const side of [-1, 1]) {
      const x = a[0] + dx * d / length - dz / length * (road.width / 2 + 6) * side;
      const z = a[1] + dz * d / length + dx / length * (road.width / 2 + 6) * side;
      if (data.boundary.some(polygon => within([x, z], polygon))) addTree(x, z);
    }
  }
  const treeBatches = new Map<string, typeof trees>();
  for (const tree of trees) {
    const key = `${Math.floor(tree.x / 450)},${Math.floor(tree.z / 450)}`;
    const list = treeBatches.get(key) ?? []; list.push(tree); treeBatches.set(key, list);
  }
  const trunkGeometry = new THREE.CylinderGeometry(.19, .31, 1, 5);
  const crownGeometry = new THREE.IcosahedronGeometry(1, 0);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x695a43, roughness: 1 });
  const leafMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  for (const list of treeBatches.values()) {
    const group = new THREE.Group(); scene.add(group);
    const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, list.length);
    const crowns = new THREE.InstancedMesh(crownGeometry, leafMaterial, list.length * 2);
    list.forEach((tree, i) => {
      const y = heightAt(tree.x, tree.z);
      dummy.position.set(tree.x, y + tree.height * .23, tree.z); dummy.rotation.set(0, random(), 0); dummy.scale.set(1, tree.height * .46, 1); dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix);
      for (let k = 0; k < 2; k++) {
        dummy.position.set(tree.x + k * .6, y + tree.height * (.6 + k * .15), tree.z - k * .4);
        dummy.scale.set(tree.height * .29, tree.height * .34, tree.height * .27); dummy.rotation.set(.2 * random(), random(), .2 * random()); dummy.updateMatrix();
        crowns.setMatrixAt(i * 2 + k, dummy.matrix); crowns.setColorAt(i * 2 + k, tree.color);
      }
    });
    trunks.receiveShadow = true; crowns.receiveShadow = true; group.add(trunks, crowns);
    forestViews.push({ x: list.reduce((s, t) => s + t.x, 0) / list.length, z: list.reduce((s, t) => s + t.z, 0) / list.length, group });
  }

  function update(player: THREE.Vector3) {
    for (const landmark of landmarkViews) landmark.update(player);
    for (const forest of forestViews) forest.group.visible = Math.hypot(player.x - forest.x, player.z - forest.z) < 1500;
    const nearbyLabels: { label: THREE.Sprite; distance: number }[] = [];
    for (const view of landmarkLabels) {
      const distance = Math.hypot(player.x - view.x, player.z - view.z) - view.radius;
      view.label.visible = false;
      if (distance < 220 && distance > 35) nearbyLabels.push({ label: view.label, distance });
    }
    for (const view of buildingViews) {
      const distance = Math.hypot(player.x - view.x, player.z - view.z) - view.radius;
      view.damaged = !view.roofProxy.visible || view.pieces.some(p => !p.proxy.visible);
      const detailed = distance < 280;
      const hasRemaining = view.roofProxy.visible || view.pieces.some(p => p.proxy.visible);
      view.near.visible = (detailed || view.damaged) && hasRemaining;
      distantBuildings.setVisible(view.far, !detailed && !view.damaged);
      view.glass.visible = detailed;
      view.distantGlass.visible = !detailed;
      view.trims.visible = detailed;
      view.rooftop.visible = view.roofProxy.visible;
      if (view.label) {
        view.label.visible = false;
        if (distance < 220 && distance > 35) nearbyLabels.push({ label: view.label, distance });
      }
      if (!view.near.visible) continue;
      view.roof.visible = view.roofProxy.visible;
      let geometryChanged = false, colorChanged = false;
      view.pieces.forEach((piece, i) => {
        if (piece.shown !== piece.proxy.visible) {
          piece.shown = piece.proxy.visible;
          view.walls.setMatrixAt(i, piece.shown ? piece.matrix : hidden);
          for (const win of piece.windows) {
            view.glass.setMatrixAt(win.index, piece.shown ? win.matrix : hidden);
            view.distantGlass.setMatrixAt(win.index, piece.shown ? win.matrix : hidden);
          }
          for (const trim of piece.trims) view.trims.setMatrixAt(trim.index, piece.shown ? trim.matrix : hidden);
          geometryChanged = true;
        }
        const color = (piece.proxy.material as THREE.MeshStandardMaterial).color;
        if (piece.color !== color.getHex()) {
          piece.color = color.getHex(); view.walls.setColorAt(i, color); colorChanged = true;
        }
      });
      if (geometryChanged) { view.walls.instanceMatrix.needsUpdate = true; view.glass.instanceMatrix.needsUpdate = true; view.distantGlass.instanceMatrix.needsUpdate = true; view.trims.instanceMatrix.needsUpdate = true; }
      if (colorChanged && view.walls.instanceColor) view.walls.instanceColor.needsUpdate = true;
    }
    distantBuildings.flush();
    nearbyLabels.sort((a, b) => a.distance - b.distance).slice(0, 5).forEach(item => { item.label.visible = true; });
  }
  update(new THREE.Vector3(0, 0, 35));
  return { breakables, colliders, bounds: data.bounds, locations, update };
}
