import type {CampusBuilding} from './fullCampus';
import {observedAppearances} from './observedAppearances';

export type BuildingAppearance = {
  wallColor: number; roofColor: number; glassColor: number; frameColor: number; accentColor: number;
  height?: number; levels?: number;
  heightEstimated?: boolean; levelsEstimated?: boolean;
  windowStyle: 'punched' | 'ribbon' | 'curtain';
  windowWidthRatio: number; windowHeightRatio: number; bayWidth: number;
  horizontalBands: boolean; verticalFins: boolean;
  roofStyle: 'flat' | 'equipment' | 'parapet';
  facadePattern?: 'regular' | 'checker';
  surface?: 'brick' | 'panel' | 'stone';
  landmark?: string;
  confidence: 'reference' | 'typology'; sourceUrls: string[];
  buildingNumber?: string;
};

// 사진에서 확인한 색과 형태를 적용한다. 명시한 높이 외의 치수는 지도 기반 추정치다.
const profiles: Record<string, Partial<BuildingAppearance>> = {
  'way/892896238': {
    height: 17.5, levels: 5, heightEstimated: true, levelsEstimated: false,
    landmark: 'engineering-35', buildingNumber: '35', confidence: 'reference',
    sourceUrls: [...(observedAppearances['way/892896238']?.sourceUrls ?? []), 'https://cuee.snu.ac.kr/bbs/board.php?bo_table=sub6_1&page=4&wr_id=4412'],
  },
  'way/389628348': {
    height: 17.5, levels: 5, heightEstimated: true, levelsEstimated: false,
    landmark: 'engineering-31', buildingNumber: '31', confidence: 'reference',
    sourceUrls: [...(observedAppearances['way/389628348']?.sourceUrls ?? []), 'https://eng.snu.ac.kr/research/research-achievements?bbsidx=6158&md=v'],
  },
  'way/167659979': {
    height: 12.6, levels: 2, heightEstimated: true, levelsEstimated: false,
    landmark: 'faculty-club', buildingNumber: '65', confidence: 'reference',
    sourceUrls: [...(observedAppearances['way/167659979']?.sourceUrls ?? []), 'https://snu.ac.kr/snunow/snu_story?bbsidx=122079&md=v', 'https://www.taal-architects.com/_files/ugd/96bb24_ca38045d753f4858885cfd177a6b3565.pdf'],
  },
  'way/193893591': {
    height: 14, levels: 4, heightEstimated: true, levelsEstimated: true,
    landmark: 'teaching-center', buildingNumber: '61', confidence: 'reference',
    sourceUrls: [...(observedAppearances['way/193893591']?.sourceUrls ?? []), 'https://www.snu.ac.kr/webdata/uploads/kor/file/2020/02/23rd_vision_change.pdf'],
  },
  'supplemental/snu-56-1': {
    wallColor: 0xd5d8d1, roofColor: 0xa8b4a5, glassColor: 0x799b98, frameColor: 0xb3bfb7,
    accentColor: 0x27536d, surface: 'stone', windowStyle: 'curtain',
    height: 14.32, levels: 4, heightEstimated: false, levelsEstimated: false,
    buildingNumber: '56-1', confidence: 'reference',
    sourceUrls: ['https://vmspace.com/project/project_view.html?base_seq=Mzc4Mw%3D%3D', 'https://map.snu.ac.kr/web/facility_detail.action?convinType=N&inst_seq=259'],
  },
  'supplemental/snu-303': {
    wallColor: 0xc8cbca, roofColor: 0x969e9c, glassColor: 0x719197, frameColor: 0x3d484b,
    accentColor: 0x9b7950, surface: 'panel', windowStyle: 'punched',
    height: 28, levels: 7, heightEstimated: true, levelsEstimated: false,
    landmark: 'engineering-303', buildingNumber: '303', confidence: 'reference',
    sourceUrls: ['https://haec.snu.ac.kr/about', 'https://eng.snu.ac.kr/about/support-facilities/haedong-advanced-engineering-center', 'https://rawwrks.kr/works/commissioned/haec'],
  },
  'way/777502176': {
    wallColor: 0x505357, roofColor: 0x64676a, glassColor: 0x546b73, frameColor: 0x30373b,
    accentColor: 0x8a8e90, surface: 'panel', windowStyle: 'curtain', verticalFins: true,
    height: 35.5, levels: 6, heightEstimated: true, levelsEstimated: false,
    landmark: 'engineering-312', buildingNumber: '312', confidence: 'reference',
    sourceUrls: ['https://lkjap.com/', 'https://rawwrks.kr/works/commissioned/haec', 'https://kko.to/WM2ggAMfwa'],
  },
  ...Object.fromEntries(['way/179742155', 'way/179742150', 'way/179742153', 'way/329398248', 'way/297047750'].map(id => [id, {
    height: id === 'way/329398248' ? 9 : id === 'way/297047750' ? 24 : 23.4,
    levels: id === 'way/329398248' ? 2 : 6, heightEstimated: true, levelsEstimated: true,
    landmark: 'science-500', buildingNumber: '500', confidence: 'reference',
    sourceUrls: [...(observedAppearances[id]?.sourceUrls ?? []), 'https://www.snu.ac.kr/snunow/snu_story?bbsidx=75745&md=v', 'https://science.snu.ac.kr/newsroom/view/2/11/790', 'https://lib.snu.ac.kr/vr/indexdata/sky4_9016/html5/3.jpg'],
  }])),
  'way/297046999': {
    height: 27, levels: 7, heightEstimated: true, levelsEstimated: false, landmark: 'education-220', confidence: 'reference',
    sourceUrls: [...(observedAppearances['way/297046999']?.sourceUrls ?? []), 'https://www.snu.ac.kr/webdata/uploads/kor/file/2020/02/24th_vision_change.pdf', 'https://health.snu.ac.kr/일반공지/?mod=document&uid=4103'],
  },
  'way/297047243': {
    height: 24.5, levels: 6, heightEstimated: true, levelsEstimated: false, landmark: 'public-health-221', confidence: 'reference',
    sourceUrls: [...(observedAppearances['way/297047243']?.sourceUrls ?? []), 'https://kiramonthly.com/2623', 'https://health.snu.ac.kr/일반공지/?mod=document&uid=4103'],
  },
  'way/228476658': {
    height: 52.5, levels: 15, heightEstimated: true, levelsEstimated: false, landmark: 'engineering-301', confidence: 'reference',
    sourceUrls: [...(observedAppearances['way/228476658']?.sourceUrls ?? []), 'https://eng.snu.ac.kr/sites/default/files/서울공대 2016년 101호-여름.pdf', 'https://eng.snu.ac.kr/communication/notice/notice?bbsidx=1811&fileidx=2275&md=down'],
  },
  'way/179742149': {
    height: 32.4, levels: 9, heightEstimated: true, levelsEstimated: false, landmark: 'agriculture', confidence: 'reference',
    sourceUrls: [...(observedAppearances['way/179742149']?.sourceUrls ?? []), 'https://www.snu.ac.kr/webdata/uploads/kor/file/2020/02/snu60th.pdf', 'https://cals.snu.ac.kr/academics/undergraduate?deptidx=31&majidx=12', 'https://cals.snu.ac.kr/board/notice?bbsidx=12588&bm=v'],
  },
  'way/386891006': {
    height: 14, levels: 4, heightEstimated: true, levelsEstimated: true, landmark: 'gym', confidence: 'reference',
    sourceUrls: [...(observedAppearances['way/386891006']?.sourceUrls ?? []), 'https://my.snu.ac.kr/ctt/bb/bulletin?a=fd&b=1&fs=1&p=24162', 'https://health.snu.ac.kr/일반공지/?mod=document&uid=5074'],
  },
  'way/386890828': {
    height: 24.5, levels: 7, heightEstimated: true, levelsEstimated: false, landmark: 'living-science', confidence: 'reference',
    sourceUrls: [...(observedAppearances['way/386890828']?.sourceUrls ?? []), 'https://www.snu.ac.kr/webdata/uploads/kor/file/2020/02/24th_vision_change.pdf', 'https://now.snu.ac.kr/category/3/243'],
  },
  'way/439693757': {
    height: 13.8, levels: 2, heightEstimated: true, levelsEstimated: false, landmark: 'museum', confidence: 'reference',
    sourceUrls: ['https://museum.snu.ac.kr/v2/about/construct/', 'https://www.aurum.re.kr/Bits/BuildingDoc.aspx?mm=4&num=168&ss=1'],
  },
  'way/167607356': {
    height: 21.4, levels: 6, heightEstimated: true, levelsEstimated: false, landmark: 'student-center', confidence: 'reference',
    sourceUrls: [...(observedAppearances['way/167607356']?.sourceUrls ?? []), 'https://www.snu.ac.kr/webdata/uploads/kor/file/2020/02/snu70th.pdf', 'https://my.snu.ac.kr/ctt/bb/bulletin?a=fd&b=1&fs=1&p=24404'],
  },
  'way/167609409': {
    height: 20, levels: 5, heightEstimated: true, levelsEstimated: false, landmark: 'administration', confidence: 'reference',
    sourceUrls: [...(observedAppearances['way/167609409']?.sourceUrls ?? []), 'https://snu.ac.kr/snunow/snu_story?bbsidx=123072&md=v'],
  },
  'way/93549089': {
    height: 23.5, levels: 5, heightEstimated: true, levelsEstimated: false, landmark: 'global-engineering', confidence: 'reference',
    sourceUrls: [...(observedAppearances['way/93549089']?.sourceUrls ?? []), 'https://idanu.com/서울대학교-글로벌공학교육센터/', 'https://eng.snu.ac.kr/about/support-facilities/GECE'],
  },
  'way/386891016': {
    height: 17.5, levels: 5, heightEstimated: true, levelsEstimated: false, landmark: 'admissions', confidence: 'reference',
    sourceUrls: ["https://map.snu.ac.kr/web/facility_detail.action?convinType=N&inst_seq=169","https://emeritus.snu.ac.kr/wp-content/uploads/sites/208/migrated/%EC%84%9C%EC%9A%B8%EB%8C%80%ED%95%99%EA%B5%90%20%EB%AA%85%EC%98%88%EA%B5%90%EC%88%98%ED%9A%8C%EB%B3%B4%20%EC%B0%BD%EA%B0%84%ED%98%B8%282005%29%2C%20pdf%ED%8C%8C%EC%9D%BC.pdf","https://www.snu.ac.kr/about/overview/organization/admission_office","https://admission.snu.ac.kr/graduate/general/contacts"],
  },
  'way/439707878': {
    height: 14, levels: 4, heightEstimated: true, levelsEstimated: false, landmark: 'neutinamu', confidence: 'reference',
    sourceUrls: [...(observedAppearances['way/439707878']?.sourceUrls ?? []), 'https://kidshome.snu.ac.kr/시설현황/'],
  },
  'way/439707877': {
    height: 10.5, levels: 3, heightEstimated: true, levelsEstimated: false, landmark: 'baekhak', confidence: 'reference',
    sourceUrls: [...(observedAppearances['way/439707877']?.sourceUrls ?? []), 'https://kidshome.snu.ac.kr/시설현황/'],
  },
  'way/439707875': {
    height: 14, levels: 4, heightEstimated: true, levelsEstimated: true, landmark: 'research-park', confidence: 'reference',
  },
  'way/482207537': {
    height: 35, levels: 10, heightEstimated: true, levelsEstimated: false, landmark: 'engineering-302', confidence: 'reference',
  },
  'way/386890466': {
    height: 10.1, levels: 2, heightEstimated: true, levelsEstimated: true, landmark: 'engineer-house', confidence: 'reference',
  },
  'way/700872151': {
    height: 35, levels: 10, heightEstimated: true, levelsEstimated: false, landmark: 'samsung-research', confidence: 'reference',
  },
  'way/193893586': {
    height: 8.65, levels: 2, heightEstimated: true, levelsEstimated: false, landmark: 'poongsan-pavilion', confidence: 'reference',
    sourceUrls: ['https://snu.ac.kr/snunow/snu_story?bbsidx=122079&md=v'],
  },
  'way/238935852': {
    height: 18, heightEstimated: true, levelsEstimated: true, landmark: 'gyujanggak', confidence: 'reference',
    sourceUrls: ['https://map.snu.ac.kr/web/facility_detail.action?convinType=N&inst_seq=115', 'https://kyu.snu.ac.kr/about/history1/'],
  },
  'way/439687811': {
    wallColor: 0xbec6c5, roofColor: 0xc1c8c8, glassColor: 0x6e999c, frameColor: 0xbac5c3,
    windowStyle: 'ribbon', horizontalBands: true, verticalFins: false,
    height: 23.5, levels: 4, heightEstimated: true, levelsEstimated: false, landmark: 'posco-sports', confidence: 'reference',
    sourceUrls: ['https://spolex.snu.ac.kr/intro/intro01.php', 'https://map.snu.ac.kr/web/facility_detail.action?convinType=N&inst_seq=91'],
  },
  'way/148286730': {
    wallColor: 0xb9b1a2, roofColor: 0xa5a59b, glassColor: 0x477b7d, frameColor: 0x7b807c,
    windowWidthRatio: .72, windowHeightRatio: .4, bayWidth: 3.9, horizontalBands: true,
    height: 28, levels: 6, heightEstimated: true, levelsEstimated: false, landmark: 'main-library', confidence: 'reference',
    sourceUrls: ['https://www.snu.ac.kr/campuslife/facilities/library', 'https://map.snu.ac.kr/web/facility_detail.action?convinType=N&inst_seq=78', 'https://lib.snu.ac.kr/vr/indexdata/index.xml', 'https://my.snu.ac.kr/ctt/bb/bulletin?a=fd&b=1&fs=1&p=22570'],
  },
  'way/329398175': {
    wallColor: 0xc0b6a0, roofColor: 0xa5aaa5, glassColor: 0x6f8b91, frameColor: 0xc9c4b5,
    facadePattern: 'checker', windowWidthRatio: .49, windowHeightRatio: .92, bayWidth: 2.5,
    horizontalBands: false, verticalFins: true, confidence: 'reference', height: 42.75, levels: 7, heightEstimated: false, levelsEstimated: false, landmark: 'gwanjeong',
    sourceUrls: ['https://www.snu.ac.kr/campuslife/facilities/library', 'https://www.aurum.re.kr/Bits/BuildingDoc.aspx?mm=4&num=6114&ss=1', 'https://www.snu.ac.kr/webdata/uploads/kor/file/2020/02/26th_vision_change.pdf'],
  },
  'way/252233408': {
    wallColor: 0xa9bdbb, roofColor: 0xc6d0ca, glassColor: 0x879e9c, frameColor: 0xdde1d4,
    windowStyle: 'curtain', bayWidth: 1.25, horizontalBands: false, verticalFins: true,
    height: 17.575, levels: 3, heightEstimated: false, levelsEstimated: false, landmark: 'moa', confidence: 'reference',
    sourceUrls: ['https://www.oma.com/projects/seoul-national-university-museum-of-art', 'https://science.snu.ac.kr/newsroom/view/2/11/811', 'https://gsep.snu.ac.kr/boards/notice/28473/detail/introduction/news/'],
  },
};

for (const id of ['way/439707895', 'way/439707894', 'way/439707893', 'way/439707892', 'way/409030550']) {
  profiles[id] = {
    height: 17.5, levels: 5, heightEstimated: true, levelsEstimated: false, landmark: 'family-dorm', confidence: 'reference',
    sourceUrls: [...(observedAppearances[id]?.sourceUrls ?? []), 'https://snu.ac.kr/campuslife/facilities/dorm'],
  };
}

export function getBuildingAppearance(building: CampusBuilding): BuildingAppearance {
  return {
    wallColor: 0xc9c4b7, roofColor: 0x9ea59c, glassColor: 0x55747a, frameColor: 0xc3c5bd,
    accentColor: 0xb3b3a8, windowStyle: 'punched', windowWidthRatio: .58, windowHeightRatio: .5,
    bayWidth: 3.4, horizontalBands: false, verticalFins: false, roofStyle: 'flat',
    confidence: 'typology', sourceUrls: [], heightEstimated: building.heightEstimated, levelsEstimated: building.levelsEstimated,
    ...observedAppearances[building.id], ...profiles[building.id],
  };
}
