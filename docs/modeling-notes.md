# 모델링과 검증 기록

건물별 관찰 내용과 추정 범위를 모은 기록입니다. 아래 코드와 자료의 경로는 저장소 루트를 기준으로 합니다. 일부 항목은 이후 보완으로 달라졌으므로, 건물별 최신 근거는 [sources](../sources/)의 관찰 기록과 함께 확인해 주세요.

## 재현 범위와 출처

35동은 [공식 지도 사진](https://map.snu.ac.kr/web/facility_detail.action?convinType=N&inst_seq=44)과 [2026년 외벽 도색 안내의 사진](https://cuee.snu.ac.kr/bbs/board.php?bo_table=sub6_1&page=4&wr_id=4412)을 참고해 후퇴한 발코니, 가로 루버와 흰 수직 차양, 유리 현관 차양을 구분했다. 5층 사용은 공식 안내로 확인했으며 높이 17.5m, 각 부재의 치수와 방위는 추정이다. 도색 후의 정확한 색은 확인하지 못했다.

31동은 [공식 지도 사진](https://map.snu.ac.kr/web/facility_detail.action?convinType=N&inst_seq=38), 지도 윤곽과 [2024년 2월 네이버 거리뷰](https://map.naver.com/p/search/서울대학교%2031동?c=17.00,0,0,0,adh&p=TURX4WPkOhQYBKE5YlD6lw,28.59,10,80,Float)를 대조해 서쪽 본체와 동쪽 흰 탑, 30동으로 이어지는 흰 연결부를 구분했다. 본체 14m와 탑 17.5m, 연결부의 폭과 층고, 사진에서 보이지 않는 하부 통로는 추정이며 5층은 OSM 분류를 따른다. 2014년 사진의 초록 반원형 지붕은 서쪽 옛 32동 방향의 별도 구조물이다. 공사 이후 현존 여부를 확인하지 못해 추가하지 않았다. [2025년 공대 재건축 안내](https://eng.snu.ac.kr/research/research-achievements?bbsidx=6158&md=v)의 미래 건물을 현재 모습으로 대신 넣지 않았다.

32동 공사 부지는 2025년 가설 계획의 RPP 울타리 8m와 방진망 1m를 일반 규격으로 적용했다. 개별 변의 높이와 실제 공정, 출입구 위치는 미확인이다. 지도 도로의 차량 폭을 보존하기 위해 울타리를 원본 경계 안쪽으로 1m 옮겼으며, 이는 실측한 위치가 아니다. 원본 지도와 DEM은 유지하고 실제 게임 지형 위에 공사 바닥을 덮었다. 근거와 한계는 `sources/engineering-construction-notes.json`에 기록한다.

기본 건물 평면과 도로 연결은 [OpenStreetMap 관악캠퍼스 자료](https://www.openstreetmap.org/relation/11917142)를 사용한다. © OpenStreetMap contributors, [ODbL 1.0](https://www.openstreetmap.org/copyright). 내려받은 원본은 `sources/campus.osm`, 게임용 자료는 `public/data/campus.json`에 있다. 별도로 작성한 303동의 근사 외곽과 출처는 `sources/campus-supplemental-buildings.json`에 구분해 저장한다. 먼 건물도 외벽과 창문을 표시하며, 부서진 건물은 거리에 관계없이 남은 벽과 지붕을 유지한다. 주요 건물의 이름 안내는 일반 모델과 전용 모델에서 같은 기준으로 표시하며 화면에 최대 5개를 띄운다.

먼 일반 건물은 320m 구역별로 외벽, 창문과 지붕을 하나의 메시로 묶는다. 건물별 색과 창 배치는 가까운 모델과 공유한다. 가까워지거나 파괴된 건물은 개별 부품 표현으로 전환한다. 이 방식은 브라우저의 다중 그리기 확장 지원에 의존하지 않으며, 가까운 모델의 벽돌 줄눈처럼 작은 재질 무늬는 원거리에서 생략한다. 실제 기기의 프레임 속도는 아직 측정하지 않았다.

건물 충돌체는 표면까지의 거리 75m를 기준으로 불러오고 110m를 넘으면 해제한다. 기준 위치는 플레이어가 25m 움직일 때 갱신하며 높이 변화도 포함한다. 먼 건물의 사격과 조준은 별도 기하 질의로 처리한다. 파편은 다음 이동 구간에 필요한 충돌체를 잠시 불러온다. 지도상의 큰 건물도 셀 경계에서 사격이나 폭발 대상이 누락되지 않도록 실제 경계 상자가 겹치는 모든 셀에 등록한다.

[서울대학교 공식 캠퍼스 지도](https://map.snu.ac.kr/web/main.action)의 건물별 외관 사진을 직접 보고 벽의 색, 개별 창과 연속 창, 유리 외벽, 수직 살과 수평 띠를 구분했다. `sources/building-match-review.json`은 공식 건물과 게임 윤곽의 대응 검토, `sources/profiles-*.json`은 사진 관찰 기록이다. `node scripts/build-appearance-profiles.mjs`로 적용 가능한 사진만 모델에 연결하며 결과와 미확인 항목은 `sources/appearance-coverage.json`에 기록된다.

관정관은 [서울대 공식 보고서](https://www.snu.ac.kr/webdata/uploads/kor/file/2020/02/26th_vision_change.pdf) 인쇄 104쪽의 전체 치수와 [설계 설명](https://www.aurum.re.kr/Bits/BuildingDoc.aspx?mm=4&num=6114&ss=1)을 참고해 상부 구조와 양끝 지지부를 만들었다. 미술관은 [OMA의 사진과 설계 설명](https://www.oma.com/projects/seoul-national-university-museum-of-art)을 참고해 지면에서 뜬 외피, 경사 밑면과 노출 철골을 구분했다.

중앙도서관 본관은 [공식 지도 사진](https://map.snu.ac.kr/web/facility_detail.action?convinType=N&inst_seq=78), [도서관 공식 VR](https://lib.snu.ac.kr/vr/)과 [2025년 층별 평면도](https://my.snu.ac.kr/ctt/bb/bulletin?a=fd&b=1&fs=1&p=22570)를 참고해 상부 네 줄의 깊은 창틀, 후퇴한 아래 두 층, 기둥과 출입구, 두 옥상 구조물을 만들었다. 현행 1~6층 안내와 과거 지하 2층 및 지상 4층 표기는 구분한다. 본체 높이 28m와 세부 치수는 추정이며 법적 층수 분류를 확인한 것은 아니다. 지붕 위 두 사각 부분은 공식 VR 항공사진에서 닫힌 구조물로 확인했으며 열린 중정으로 만들지 않았다.

행정관은 [공식 지도 사진](https://map.snu.ac.kr/web/facility_detail.action?convinType=N&inst_seq=76)과 [공식 리모델링 안내](https://snu.ac.kr/snunow/snu_story?bbsidx=123072&md=v)를 참고해 깊은 격자 창 세 줄, 뒤로 들어간 하부 외벽과 열린 통로를 구분했다. 지상 5층과 지하 1층은 공식 자료를 따르며 본체 높이 20m와 세부 치수는 사진 비례에 따른 추정이다.

학생회관은 [공식 지도 사진](https://map.snu.ac.kr/web/facility_detail.action?convinType=N&inst_seq=80)과 [2025년 공사 평면도](https://my.snu.ac.kr/ctt/bb/bulletin?a=fd&b=1&fs=1&p=24404)를 대조했다. 도면의 실 배치와 사진의 합창단 표기를 연결해 북쪽의 후퇴한 5~6층 몸체와 남쪽의 4층 몸체를 구분한다. 남서쪽 면의 돌출 창, 열린 하부, 계단과 주황색 루버는 사진에 근거하며 세부 위치와 치수는 근사했다. 2026년에 바뀐 LED 입구와 테라스의 정확한 위치, 외부 계단 공사 이후의 형상은 아직 확인하지 못했다.

박물관은 [공식 건축 설명과 사진](https://museum.snu.ac.kr/v2/about/construct/) 및 [설계사 제공 도면](https://www.aurum.re.kr/Bits/BuildingDoc.aspx?mm=4&num=168&ss=1)을 참고해 낮은 북측 전시실, 높은 남측 전시실, 서쪽 곡면 계단실과 유리 현관, 열린 중정과 사분원 천창 네 개를 구분했다. 공식 규모는 지상 2층, 지하 1층이며 벽 높이 5.8m와 10.8m, 천창 최고 높이 13.8m는 도면 비례 추정이다. 도면과 지도 외곽이 완전히 일치하지 않아 중정과 출입계단의 세부 위치도 근사했다. 2026년 내부 시설 공사 이후의 외관과 실내 전체는 확인하지 못했다.

종합체육관 71동은 [공식 지도 사진](https://map.snu.ac.kr/web/facility_detail.action?convinType=N&inst_seq=90), [공사 평면도](https://my.snu.ac.kr/ctt/bb/bulletin?a=fd&b=1&fs=1&p=24162)와 [공식 행사 배치도](https://health.snu.ac.kr/일반공지/?mod=document&uid=5074)를 대조했다. 북쪽의 높은 무창 몸체, 남쪽의 낮은 날개, 얇은 차양과 노출 트러스, 후퇴한 유리 현관과 지지 벽의 구멍을 구분했다. 71-1동은 별도 건물로 유지한다. 높이 14m와 8m, 현관의 정확한 지도 변과 세부 치수는 추정이다. 공식 자료에서 3층 사용은 확인했으나 원본 지도에 있는 최고 4층 분류는 확인하지 못했다.

생활과학대학 222동은 [공식 지도 사진](https://map.snu.ac.kr/web/facility_detail.action?convinType=N&inst_seq=180)과 [박물관 안내 사진](https://museum.snu.ac.kr/v2/information/guide/)을 대조해 L자 몸체의 벽돌 면과 회색 면, 최상층 세로창, 넓은 무창 끝면과 옥상 차양 세 개를 만들었다. [서울대 공식 보고서](https://www.snu.ac.kr/webdata/uploads/kor/file/2020/02/24th_vision_change.pdf)와 [7층 행사 안내](https://now.snu.ac.kr/category/3/243)를 참고해 기존 5층 분류를 바로잡았다. 높이 24.5m와 날개별 층 배치는 추정이다. 각 층의 창과 주변 벽은 작은 구획으로 함께 파괴되며, 출입구와 열린 차양 아래 공간의 충돌은 별도로 처리한다.

주현관과 동측 안마당은 [2026년 8월 로드뷰](https://kko.to/F5a4MjhGts)를 먼저 확인하고, 내부 촬영선이 표시되지 않은 부분을 [2024년 공식 행사 사진과 위치도](https://health.snu.ac.kr/?kboard_content_redirect=3872)로 보완했다. 원본 OSM의 출입구 노드 `4531517992`(p4)와 보행로 `/339`에 현관을 맞추고, 그 앞 벽돌 포장, 노란 유도선, 곡선 화단, 기둥등과 안내대를 추가했다. 남쪽 통과구부터 현관까지 바닥 높이를 연결했으며 원시 DEM은 보존했다. [관측 기록](sources/living-science-courtyard-roadview-review.json)과 [구현 범위](sources/living-science-courtyard-model-notes.json)에 확인한 부분과 추정을 구분했다. 시설 좌표와 치수는 게임용 근사다. 공식 사진은 2024년에 게시됐으나 촬영일은 알 수 없고, 가게 간판과 안마당 내부 로드뷰, `/209` 계단 및 220동 전체 연결은 확인하지 못했다.

농업생명과학대학 200동은 [공식 지도 사진](https://map.snu.ac.kr/web/facility_detail.action?convinType=N&inst_seq=174), [2024년 공사 평면도](https://my.snu.ac.kr/ctt/bb/bulletin?a=fd&b=1&fs=1&p=16168)와 [도서관 공식 VR](https://lib.snu.ac.kr/vr/) 항공사진을 대조했다. 높은 두 날개, 동쪽 전면의 낮은 유리 띠, 중앙의 낮은 옥상과 타원 천창, 후퇴한 발코니를 구분한다. [서울대학교 60년사](https://www.snu.ac.kr/webdata/uploads/kor/file/2020/02/snu60th.pdf) 인쇄 111쪽은 전체 지상 9층과 지하 2층을 명시한다. 상록관 9층과 생명관 8층의 실제 사용도 확인했으나 날개별 최고층 분류를 모두 확인한 것은 아니다. 남쪽 32.4m와 북쪽 28.8m, 중앙부 높이 7.2m와 10.8m는 사진과 도면에 따른 근사다. 2층 중앙현관을 실제 게임 지형에 연결했으며 지하층과 실내 전체는 재현하지 않았다.

문화관은 [2025년 공사 안내와 가설계획](https://gsep.snu.ac.kr/boards/notice/37547/detail/news/notice/) 및 OSM 공사 구역을 참고해 울타리와 공사 부지를 표시한다. 울타리 높이 4m, 8m와 10m는 계획도에 근거하며, 경계의 세부 굴곡과 재료는 근사했다. 현재 공정과 출입문 위치는 확인하지 못했다.

포스코스포츠센터는 [센터 공식 소개](https://spolex.snu.ac.kr/intro/intro01.php)와 [공식 캠퍼스 지도 사진](https://map.snu.ac.kr/web/facility_detail.action?convinType=N&inst_seq=91)을 참고해 은색 통형 지붕, 곡면 띠창과 뒤로 들어간 유리 끝면을 만들었다. 공식 소개의 층수는 지하 1층, 지상 4층이다. 게임의 높이 23.5m와 지붕 곡률은 사진을 바탕으로 추정했고, 길이와 폭은 지도 윤곽에서 계산했다. 이들 건물도 세부 배치, 출입구와 실내 전체를 정밀 복제한 모델은 아니다.

규장각은 [공식 연혁의 전경 사진](https://kyu.snu.ac.kr/about/history1/)과 공식 캠퍼스 지도 사진을 참고해 높은 본관, 기와지붕과 깊은 처마, 기둥열과 낮은 전시실을 구분했다. 능선 높이 18m와 세부 배치는 사진에 따른 근사다.

버들골 풍산마당은 [서울대학교 공식 소개](https://snu.ac.kr/snunow/snu_story?bbsidx=122079&md=v), [시공 참여 업체의 사진과 구조 모델](https://www.withworks.kr/portfolio-collections/my-portfolio/seoul-national-university-amphitheater), [설계 소개의 평면도와 단면도](https://www.designwhos.com/projects/100)를 참고해 서쪽의 곡면 지붕과 유리 입구, 열린 무대, 동쪽 반원형 객석을 분리했다. 공식 층수는 지상 2층이며, 높이 8.65m와 곡률은 추정값이다.

301동은 [공식 지도 사진](https://map.snu.ac.kr/web/facility_detail.action?convinType=N&inst_seq=187), [2016년 공대 소식지](https://eng.snu.ac.kr/sites/default/files/서울공대%202016년%20101호-여름.pdf) 80쪽과 [2023년 데크 공사 안내의 항공사진](https://eng.snu.ac.kr/communication/notice/notice?bbsidx=1811&fileidx=2275&md=down)을 대조해 남쪽 고층 탑과 북쪽 저층부를 나눴다. 탑의 후퇴한 세로 홈과 열린 상부 가새, 낮은 날개의 곡면 유리 지붕과 그 아래 아트리움 공간을 구현한다. 15층 사용은 [2012년 공대상상](https://eng.snu.ac.kr/sites/default/files/gongdaesangsang1ho-seouldaegongdae_iyagi-2012-9.pdf) 5쪽에서, 북문 B1 표시는 [2022년 항공우주전 안내](https://eng.snu.ac.kr/sites/default/files/notice/제35회%20항공우주전%20초대장.pdf)에서 확인했다. 지상 높이 52.5m, 저층부 높이와 세부 치수는 추정이다. 북문에서 아트리움으로 이어지는 계단은 현재 게임 지형에 맞춘 근사이며 실제 층고를 재현한 것이 아니다. [2009년 기록](https://www.snu.ac.kr/snunow/snu_story?bbsidx=75736&md=v)의 73.4m는 지하층을 포함하므로 지상 높이로 적용하지 않았다.

303동 해동첨단공학관은 [공식 소개의 준공 사진](https://haec.snu.ac.kr/about)과 [Rawwrks의 2024년 촬영](https://rawwrks.kr/works/commissioned/haec)을 참고했다. 높이가 다른 남북 몸체, 접힌 유리면, 목재 기둥과 대각선 부재, 위층까지 열린 아트리움과 좁은 회랑, 서쪽 주차 필로티와 동쪽 데크를 구분한다. 공식 규모는 7층이며, 높이 28m와 부분별 치수는 추정이다.

303동은 원본 OSM에 없어 공식 약도를 주변 네 건물에 맞춰 근사 외곽을 만들었다. 약도의 별도 검증점 오차는 약 8~19m이며, 도로와 하층 공간을 확보하려고 남쪽 정점 일부를 최대 약 6m 보정했다. 기존 건물 외곽과 도로 좌표, 원시 DEM은 보존하고 301동과 303동 연결 구역의 게임 지형을 보정했다. 이 보정은 실제 측량이나 토목 설계를 복원한 결과가 아니다.

[2026년 8월 카카오 로드뷰](https://map.kakao.com/?panoid=1213023453&pan=11.0&zoom=0&map_type=TYPE_MAP&map_attribute=ROADVIEW&urlX=489385.0&urlY=1097507.0)를 직접 확인해 상부 다리, 목재 띠와 유리 난간, 원형 기둥, 301동 쪽 계단과 엘리베이터, 303동 하부 출입구를 구분했다. 다리와 북쪽 가지, 301동 북문과 내부 아트리움, 303동 상부와 하부 문을 게임용 높이에 맞춰 연결했다. 사진에서 확인한 접속 관계와 추정한 치수 및 바닥 높이는 구분한다.

다리 남쪽의 횡단보도, 노란 볼라드, 포장과 점자블록, 하부 출입구의 돌 경계와 식재도 같은 로드뷰를 참고했다. 위치와 치수는 게임의 도로 및 출입구에 맞춘 근사다. 볼라드와 낮은 경계는 파괴하고 복원할 수 있다.

303동 도로 쪽 남쪽 날개의 흰 패널, 줄눈과 창 비율은 [같은 달의 남쪽 촬영 지점](https://map.kakao.com/?map_type=TYPE_MAP&map_attribute=ROADVIEW&panoid=1213023449&pan=180.0&tilt=0.0&zoom=0&urlLevel=3&urlX=489380&urlY=1097455)을 추가로 대조했다. 중앙 유리면의 세부 창틀과 반사 표현, 흰 몸체와 유리면의 경계 위치는 추가 보완이 필요하다.

교수회관 65동은 [공식 지도 사진](https://map.snu.ac.kr/web/facility_detail.action?convinType=N&inst_seq=82), [2015년 재개관 기사](https://snu.ac.kr/snunow/snu_story?bbsidx=122079&md=v)와 [설계사의 외관 개선 보고서](https://www.taal-architects.com/_files/ugd/96bb24_ca38045d753f4858885cfd177a6b3565.pdf)를 대조했다. 지상 2층에 맞춰 낮은 석재 부분, 갈색 상부, 깊은 검정 처마와 서쪽 다각형 식당을 구분한다. 높이 12.6m는 보고서의 설계안 수치이며 준공 실측값으로 확인하지 못했다. 창 간격, 처마 깊이와 현관 접근 바닥은 사진 및 게임 지형에 따른 근사다.

61동 교수학습개발센터는 [공식 지도 사진](https://map.snu.ac.kr/web/facility_detail.action?convinType=N&inst_seq=77)과 [서울대 공식 기록](https://www.snu.ac.kr/webdata/uploads/kor/file/2020/02/23rd_vision_change.pdf) PDF 11쪽의 전경을 참고했다. 흰 외벽, 청록색 돌출 유리면, 후퇴한 현관, 열린 상층 테라스와 긴 차양, 유리 아래의 기둥 공간을 나눈다. 본체 높이 14m와 옥탑을 포함한 15.2m, 전체 4층, 건물 방위 및 부분 치수는 추정이다. 공식 층별 사용 안내와 사진만으로 전체 층수를 확정하지 않았다.

220동 종합교육연구동과 221동 보건대학원은 공식 외관 사진과 [상층 연결통로 도면 및 사진](https://health.snu.ac.kr/일반공지/?mod=document&uid=4103)을 함께 참고했다. 220동의 큰 하부 통로와 상부 유리 몸체, 밝은 끝벽과 열린 차양을 구분한다. 사진의 전면을 북서쪽 날개에 배치한 것은 지도와 사진 비례에 따른 추정이며 촬영점은 확인하지 못했다. 연결통로의 220동 7층과 221동 6층 표기는 공식 자료에 근거하지만 두 건물의 높이, 데크 폭과 바닥 고도는 게임 모델의 근사값이다.

220동 서측 지상 현관은 [2026년 8월 근접 로드뷰](https://kko.to/-A9iPN8ZDC)와 [남쪽 보도 시점](https://kko.to/ki8wQVMrBh)을 먼저 확인했다. 지도에 표시된 출입점과 보행로를 기준으로 세로 유리 띠, 짧은 차양과 후퇴한 문, 벽돌 접근로, 금속 난간, 낮은 화단과 검은 볼라드 두 개를 구분한다. 현관 오른쪽은 담쟁이가 있는 벽돌 면으로, 모서리를 돌아간 남쪽 첫 구획은 작은 세로창으로 보완했다. 문 치수, 포장 규격과 바닥 높이, 작은창 구획의 폭은 사진 및 게임 지형에 맞춘 근사다. 입구의 층수와 파란 표지 문구, 북쪽 보행로 전체는 확인하지 못했다.

221동의 북쪽 하부는 [2026년 증축 설계 사례](https://kiramonthly.com/2623)의 최근 사진을 우선한다. 기존 필로티를 채운 1층 유리면과 갈색 처마, 2층 회색 루버, 그 위 벽돌과 띠창을 나누며 중앙 유리 계단실과 남쪽 번호벽을 표현한다. 문헌에 명시된 기존 1층 층고 4.5m를 다른 층이나 전체 높이에 일률적으로 적용하지 않는다. 앞마당과 문턱 연결은 게임 지형에 맞춘 근사이며 실제 측량값은 아니다.

자연과학대 500동은 [학교의 단지 소개](https://www.snu.ac.kr/snunow/snu_story?bbsidx=75745&md=v), [자연대 건물 안내](https://science.snu.ac.kr/newsroom/view/2/11/790), 공식 외관 사진과 항공사진을 대조해 네 건물과 낮은 연결통로로 나눴다. 북쪽 건물에는 큰 유리면, 후퇴한 곡선 발코니, SCIENCE 글자 벽과 하늘이 보이는 상부 틀을 두고, 서쪽 세 건물의 끝면은 중앙 유리와 양옆 벽돌로 구분했다. 긴 연결통로의 유리, 원형 기둥, 돌출 차양과 세로 부재도 따로 표현한다.

공식 자료의 지상 6층과 지하 2층은 500동 단지 전체에 대한 설명이다. 각 몸체의 층 배분과 북쪽 24m, 서쪽 23.4m, 연결통로 9m의 모델 높이는 추정이며, 연결통로의 바닥은 게임 지형에 맞춰 구간별로 조정했다. 501~504동의 정확한 개별 외곽 대응은 확인하지 못해 이동 목록에는 500동 안에서의 방향을 표시한다. 발코니 곡률과 창 분할, 출입구 치수는 실측값이 아니다.

302동은 [공식 지도 사진](https://map.snu.ac.kr/web/facility_detail.action?convinType=N&inst_seq=188)을 참고해 높이가 다른 부분, 회색 띠창, 뒤로 들어간 유리 면과 붉은 X자 골조를 구분했다. 공식 지상 10층을 적용했으며 전체 높이 35m, 부분 높이와 후퇴 깊이는 추정값이다. 지도에 있는 북쪽 본체, 좁은 연결부와 남쪽 동의 윤곽을 유지한다.

엔지니어하우스 310동은 [공식 지도 사진](https://map.snu.ac.kr/web/facility_detail.action?convinType=N&inst_seq=190)과 [공과대학 소개](https://eng.snu.ac.kr/about/support-facilities/engineering-house)를 참고해 낮은 몸체, 넓은 경사 금속 지붕, 중앙 채광창과 흰 골조를 만들었다. 2000년 5월 21일 준공은 공식 기록이며, 게임의 최고 높이 10.1m와 2층은 사진에 따른 추정이다.

삼성전자연구동 944동은 [서울대 공식 보고서](https://www.snu.ac.kr/webdata/uploads/kor/file/2020/02/26th_vision_change.pdf#page=58) 인쇄 112쪽을 참고해 두 높은 부분, 낮은 연결부, 주황색 테두리와 기둥이 받치는 옥상 차양을 구분했다. 지상 10층은 공식 건축 규모이며, 몸체 높이 35m와 부분별 높이, 차양 경사는 추정값이다.

가족생활관 931~935동은 각 동의 공식 지도 사진과 [생활관 현황](https://snu.ac.kr/campuslife/facilities/dorm)을 참고했다. 공식 지상 5층을 적용하고, 발코니와 원형 계단창, 창이 없는 측벽, 붉은 경사지붕과 작은 박공을 구분했다. 최고 높이 17.5m, 계단부 배분과 전면 방위는 추정이다. 935동은 어긋난 두 부분의 지도 윤곽을 유지한다.

연구공원지원시설 940동은 [공식 지도 사진](https://map.snu.ac.kr/web/facility_detail.action?convinType=N&inst_seq=223)을 참고해 중앙의 세 접힌 유리 면, 단계적으로 낮아지는 양옆 부분과 넓은 경사 유리 차양을 만들었다. 높이 14m와 4층은 추정이며, 사진의 유리 격자 수를 실제 층수로 간주하지 않았다.

글로벌공학교육센터 38동은 [공식 지도 사진](https://map.snu.ac.kr/web/facility_detail.action?convinType=N&inst_seq=47)과 [설계사 사진](https://idanu.com/서울대학교-글로벌공학교육센터/)을 참고해 청색 유리 본체, 후퇴한 하부와 흰 원형 기둥을 구분했다. [공과대학의 층별 안내](https://eng.snu.ac.kr/about/support-facilities/GECE)와 설계사 자료에서 지상 5층을 확인해 기존 4층 추정을 바로잡았다. 최고 높이 23.5m와 기둥 간격은 사진에 따른 추정이다.

입학본부 150동은 [공식 지도 사진](https://map.snu.ac.kr/web/facility_detail.action?convinType=N&inst_seq=169)을 참고해 얕은 곡면 지붕 두 개, 그 아래 유리 공간, 중앙 유리벽과 양옆 후퇴부, 구멍이 모인 벽돌 구간을 만들었다. 서울대학교 명예교수회보 창간호(2005년) 인쇄 16쪽은 지상 5층을 명시한다. 최고 높이 17.5m와 지붕 곡률, 보이지 않는 면의 창 배치는 추정이다.

백학어린이집은 [공식 지도 사진](https://map.snu.ac.kr/web/facility_detail.action?convinType=N&inst_seq=224)을 참고해 낮은 벽돌 몸체, 뒤로 물러난 상층부, 북쪽의 둥근 상부와 얇은 노란 테두리를 구분했다. 느티나무어린이집은 [공식 지도 사진](https://map.snu.ac.kr/web/facility_detail.action?convinType=N&inst_seq=225)을 참고해 회색 본체, 공중으로 돌출된 노란 부분, 불규칙한 창 세 개와 수직 및 사선 기둥을 만들었다. 두 사진의 인접 건물을 대조해 백학 사진 앞에 보이는 큰 노란 구조가 느티나무에 속함을 구분했다. [어린이보육지원센터 시설현황](https://kidshome.snu.ac.kr/시설현황/)에서 확인한 지상 층수는 백학 3층, 느티나무 4층이다. 높이 10.5m와 14m, 부분별 치수와 보이지 않는 면은 추정했다.

지형은 [Mapzen Terrain Tiles](https://registry.opendata.aws/terrain-tiles/)의 공개 DEM 자료를 약 20m 간격의 게임 격자로 옮긴 뒤 정문광장과 건물 바닥을 조정했다. 건물 주변 보정에는 실제 평면 윤곽과 중정을 사용하며, 겹치는 구간을 배열 순서에 따라 덮어쓰지 않는다. 원자료는 USGS의 SRTM과 GMTED2010에 기반하며, 출처 표기는 [Tilezen 지형 자료 안내](https://github.com/tilezen/joerd/blob/master/docs/attribution.md)를 따른다. 게임용 높이 자료는 `public/data/terrain.json`에 있다.

엔지니어하우스 주변은 낮은 창과 처마가 격자 사이의 경사면에 묻히지 않도록 평탄 영역을 조금 넓혔다. 이는 거친 DEM과 게임 모델을 연결하기 위한 보정이며, 실제 절토나 성토를 복원한 결과는 아니다.

2022년 광장 정비 이후의 공식 사진을 참고했다. 정문 조형물 아래의 보행광장, 광장 오른쪽 차도, 주변 숲, 삼각형 수경시설과 석조 의자가 주요 참고 요소다.

- [서울대사람들: 모두에게 열린 캠퍼스로 새롭게 단장한 정문 광장](https://people.snu.ac.kr/70/10)
- [스누새: 샤샤샤, 정문 탄생기](https://bird.snu.ac.kr/story/67)
- [서울대학교 대학상징](https://snu.ac.kr/about/symbol/symbol)

실측 모델은 아니다. 공개 지도에 높이와 층수 정보가 없으면 추정값을 사용한다. 창문과 외벽 재질, 정문의 정확한 치수, 도로 폭, 수목과 가구 위치도 단순화하거나 추정했다. 전체 건물의 실내와 실제 출입구를 재현한 버전은 아니다. 차량 경로와 정차 시간은 실제 버스 시간표가 아닌 게임용 동작이다.

버스는 [서울대 교통 안내](https://www.snu.ac.kr/about/gwanak/transportation/public)의 5511, 5513, 5516, 관악02-1, 관악02-2 번호를 표시한다. [2021년 서울시 매체의 5511 사진](https://mediahub.seoul.go.kr/archives/2000558)에서 초록 차체와 검은 창띠를, 2025년 9월 32동 앞 네이버 거리뷰에서 흰 택시와 지붕 표시를 확인했다. 나머지 노선의 현재 차종과 세부 도색은 미확인이라 공통 버스 모델을 사용한다. 차량 수와 택시 비율은 게임 배치이며 실제 교통량을 재현한 수치가 아니다.

공식 사진과 거리뷰는 형태를 관찰하는 데 사용했으며 게임 텍스처로 포함하지 않았다. 촬영일을 알 수 없는 사진은 최신 모습이라고 확정하지 않았다. 카카오맵과 네이버지도 거리뷰에서 정문, 301동과 303동 연결 구역, 31동과 30동 사이, 32동 서쪽 공사 울타리를 직접 확인했다. 촬영 시점은 위치마다 다르며 전체 캠퍼스의 거리뷰 대조를 마친 것은 아니다.

지도와 물리는 동쪽을 +X, 북쪽을 +Z로 저장한다. 화면에서는 Z축을 반사하고 카메라를 그 계층 밖에 두어 실제 지리의 좌우와 맞춘다. 이동과 미니맵은 북쪽이 0인 방위각을 사용하며, 사격과 차량 계산에는 원래 지도 좌표를 전달한다. 정문 조형물의 높은 기둥과 삼각 수경시설의 긴 변은 공식 사진 및 인접 차도를 대조해 서쪽에 놓았다. 초기 시제품의 임의 정류장은 전체 캠퍼스에서 제외했다. 지도에 저장된 정류장 위치별 시설 외형은 아직 구현하지 않았다.

143동 신약개발센터는 [2026년 7월 로드뷰](https://kko.to/mr_-BnA1sn), [공식 개관 보도자료와 현관 사진](https://www.snu.ac.kr/snunow/press?bbsidx=120305&md=v), 공식 캠퍼스 사진을 대조했다. 북서쪽 곡면과 세로 핀, 벽돌 기둥, 후퇴한 하부 유리면과 짙은 천장, 넓은 계단과 북쪽 경사로를 구분했다. 금색 문틀, 건물명과 안내판, 점자블록과 보도 줄눈을 추가하고 20동으로 이어지는 유리 연결교와 교각, 양쪽 개구부를 연결했다. 지도에 교량으로 표시된 길을 지상 도로와 구분했다. 지하 1층과 지상 5층은 공식 규모지만 게임 높이와 층고, 연결교 표고와 문 위치, 계단 단수와 경사로 치수는 근사다. 뒤편은 간략한 형태이며 지하층, 전체 실내와 지상에서 연결교로 올라가는 실내 동선은 구현하지 않았다. 원본 지도와 DEM은 보존했다. 근거와 한계는 `sources/pharmacy143-exterior-photo-notes.json`에 기록했다.

## 검증

```sh
npm test
node scripts/verify-physics.mjs
node scripts/verify-streaming.mjs
node scripts/verify-cannon.mjs
node scripts/verify-traffic.mjs
node scripts/verify-campus.mjs
node scripts/verify-construction.mjs
node scripts/verify-engineering-construction.mjs
node scripts/verify-engineering35.mjs
node scripts/verify-engineering31.mjs
node scripts/verify-terrain.mjs
node scripts/verify-family-terrain.mjs
node scripts/verify-distant.mjs
node scripts/verify-library.mjs
node scripts/verify-main-library.mjs
node scripts/verify-administration.mjs
node scripts/verify-student-center.mjs
node scripts/verify-museum.mjs
node scripts/verify-gym.mjs
node scripts/verify-living-science.mjs
node scripts/verify-living-science-courtyard.mjs
node scripts/verify-agriculture.mjs
node scripts/verify-sports.mjs
node scripts/verify-gyujanggak.mjs
node scripts/verify-pavilion.mjs
node scripts/verify-engineering301.mjs
node scripts/verify-education-health.mjs
node scripts/verify-science500.mjs
node scripts/verify-engineering302.mjs
node scripts/verify-engineer-house.mjs
node scripts/verify-engineer-house-site.mjs
node scripts/verify-samsung-research.mjs
node scripts/verify-family-dorm.mjs
node scripts/verify-research-park.mjs
node scripts/verify-global-engineering.mjs
node scripts/verify-admissions.mjs
node scripts/verify-neutinamu.mjs
node scripts/verify-baekhak.mjs
node scripts/verify-controls.mjs
node scripts/verify-coordinates.mjs
node scripts/verify-runtime-coordinates.mjs
node scripts/verify-world-presentation.mjs
```

자동 검사는 다음 범위를 다룬다. `npm run build`는 TypeScript 검사와 배포 빌드를 함께 수행한다. 물리, 대포, 교통, 캠퍼스와 입력 검사 결과는 각 검증 스크립트가 출력한다.

1. 중력에 따른 낙하와 지면 정착
2. 벽의 이동 차단과 파괴 후 통과
3. 점프, 공중 재점프 방지와 착지
4. 회전한 벽의 충돌 판정
5. 고정 장애물의 이동 차단
6. 초기화 후 충돌, 체력, 점수와 위치 복구 및 물리 객체 누수 확인
7. 파편 수 제한, 지면 충돌과 수명 종료 후 제거
8. 차량의 이동 차단과 파괴 후 충돌체 제거
9. 플레이 영역 경계 유지

물리 검사는 위 9개 항목과 볼록 충돌체의 빈 모서리 보행, 회전한 형상의 근거리 및 원거리 사격 일치, 파괴 후 초기화를 합성 장면에서 확인한다. 대포 검사는 포탄 이동, 중력, 가림막 충돌, 강화탄 충전, 차량 명중, 폭발 범위, 효과 수 제한과 초기화를 다룬다. 교통 검사는 실제 도로 자료로 120초간 주행하면서 경로 연속성, 일방통행, 차량 명중과 파괴, 초기화와 보행로 제외를 확인한다. 입력 검사는 Node의 DOM 대역으로 이동, 시점, 점프와 발사의 동시 입력, 동적 조이스틱, 취소, 화면 회전 후 입력 해제, 일시정지, 빠른 이동과 PC 입력을 확인한다.

캠퍼스 검사는 실제 장면을 생성해 건물과 도로의 유한 좌표, 정점 색인과 파괴 부품을 확인한다. 중앙도서관, 행정관, 301동, 302동과 919A의 좌표는 원본 OSM 노드와 대조한다. 건물별 도착 후보가 표시하는 건물 밖의 도로 또는 보행로 위에 있는지도 확인한다. 지상 체적을 제외한 무명 윤곽은 도착 후보와 미니맵 건물 표시에서도 제외한다. 실제 시작 및 일시정지 메뉴의 이동 목적지는 교내 셔틀 정류장 15곳이다. 301동 도착 후보의 지면에 안착한 뒤에는 플레이어가 계단이나 다른 구조물에 끼지 않는지 검사한다. 지형 표본 31곳의 높이와 물리 충돌면을 비교하고, 정문과 주요 건물 근처 도로 5곳에서 경사 보행을 검사한다.

관정관과 포스코스포츠센터는 별도 검사에서 실제 지형 위의 배치, 부분 파괴, 원거리 잔존과 사격 판정, 전체 파괴 후 초기화를 확인한다. 관정관은 상부 구조가 본관 지붕을 통과하지 않는지와 양끝 지지부 사이의 빈 공간을 검사한다. 포스코스포츠센터는 곡면 지붕을 따라 충돌 높이가 바뀌는지, 둥근 외피 바깥의 빈 모서리를 충돌체가 막지 않는지, 유리 끝면과 낮은 하부가 충돌하는지를 확인한다. 이 검사는 사진 전체와의 일치나 실측 정확성을 보증하지 않는다.

302동, 엔지니어하우스와 삼성전자연구동도 실제 지도 좌표와 지형에서 별도로 검사한다. 후퇴한 입면, 골조와 차양 사이의 빈 공간, 경사 지붕의 충돌, 부분 파괴 후 원거리 사격과 초기화를 확인한다. 전체 캠퍼스 검사에서는 이 모델들이 공통 건물 생성 경로에 연결됐는지와 확인된 층수, 추정 높이의 구분을 대조한다.

결과는 Git에서 제외되는 `artifacts/*-verification.json`과 `artifacts/library-test/results.json`, `artifacts/sports-test/results.json`에 저장된다. 캠퍼스 검사의 CanvasTexture 부분은 글자와 패턴 생성용 최소 객체로 대체하므로 실제 글꼴, 화면 배치와 렌더링을 검증하지 않는다.

데스크톱과 모바일 크기의 브라우저에서 보완 구역의 화면과 시작, 발사, 점프, 일시정지 메뉴를 확인했다. 실제 휴대폰의 터치 동시 입력, 화면 회전, 모든 지역의 통행과 반복 파괴 시 프레임 속도는 별도 기기 검증이 필요하다. 모바일 성능 수치는 아직 측정하지 않았다.

좌표 검사는 네 방위의 화면 투영과 이동, 반사된 표시 계층에서의 근거리 및 원거리 사격, 초기화와 볼록 충돌체를 확인한다. 실행 흐름 검사는 실제 `main`, 물리, 차량, 대포와 미니맵 코드를 사용하되 DOM, 입력과 WebGLRenderer 및 시험 장면을 Node 대역으로 바꾼다. 따라서 실행 흐름을 검사한 결과를 실제 GPU 화면 검증으로 해석하지 않는다. 표지 글자와 건물 번호는 수치 투영 및 설치된 Sprite 셰이더의 계산 방식을 확인했다.

가족생활관 주변은 약 20m 지형 격자가 서로 가까운 건물의 바닥 높이를 섞어, 일부 하층 유리를 최대 약 1.33m까지 덮었다. 해당 구역만 약 2m 격자로 세분하고 외곽 20m에서 기존 지형에 연결했다. 유리 표면 134,100개 표본에서 지형 침범이 사라졌으며, 20개 출입구는 문이 포함된 벽을 파괴한 뒤 캡슐이 통과했다. 주변 도로도 길이와 너비 방향으로 세분해 지면 위에 이어지도록 보정했다. 원래 DEM과 세분 영역 밖 높이 계산은 유지한다. 근거와 검사 범위는 `sources/family-terrain-refinement.json`에 있으며, 실제 지형 측량이나 전체 건물 외관의 일치를 보증하는 검사는 아니다.

13동과 20동 연결교는 [2026년 7월 로드뷰](https://kko.to/wm4dZK24bn)를 참고해 흰 외장과 띠창, 열린 하부, 앞계단과 뒤쪽 긴 계단으로 나눴다. 연결문은 2024년 공개 조사에 맞춰 13동 2층에 대응하고 짧은 현관까지만 연결했다. 원본 지도와 표고 데이터는 보존했다. 연결교 깊이 4.8m와 계단 폭 7.2m, 단수와 높이는 게임 근사이며 전체 실내는 별도 보완 대상이며 20동 외관은 아래 후속 보완을 참고한다. 근거와 한계는 `sources/education1320-connection-photo-notes.json`에 기록했다.

20동 약학관3은 [2026년 7월 로드뷰](https://kko.to/lwLoYKoIpS)와 [약학대학의 2025년 고사장 안내 사진](https://snupharm.snu.ac.kr/공지사항/?mod=document&uid=8527)을 대조했다. 앞면의 벽돌과 돌출 유리창, 어두운 곡면 하부, 밝은 석재와 좁은 창, 두 지상 현관과 중앙 계단을 보완했다. 뒤쪽은 가로 창과 차양으로 구분하고 테라스, 난간, 보도 줄눈과 점자블록, 안내판을 추가했다. 높이 17.5m와 5개 층 구획, 현관 위치와 치수는 게임 근사다. 원본 지도는 보존하며 북서쪽 외벽은 도로와 보도 폭에 맞춰 안쪽으로 배치했다. 전체 실내는 별도 보완 대상이며 20동과 21동 사이 연결부는 아래 후속 보완을 참고한다. 근거는 `sources/pharmacy20-exterior-photo-notes.json`에 기록했다.

20동과 21동 사이 연결부는 [2026년 7월 정면 로드뷰](https://kko.to/6GQzzNC7rO)와 [뒤쪽 계단 시점](https://kko.to/83yvgUQ6c2)을 대조했다. 두 층의 곡선 유리 발코니, 분홍색 외장, 후퇴한 낮은 유리 연결통로, 흰 원형 기둥과 열린 하부를 구분했다. 양쪽 짧은 현관, 앞뒤 도로에서 이어지는 접근로와 뒤쪽 계단, 난간과 옹벽, 자전거 거치대 및 배수로를 추가했다. 원본 지도는 보존했다. 층고, 곡률, 문 위치와 계단 치수는 게임 근사이며 전체 실내와 전시실은 재현하지 않았다. 143동 방향 연결교는 아래 후속 보완을 참고한다. 20동 뒤쪽 현관과 도서관 방향 계단의 기존 배치는 추가 확인이 필요하다. 근거는 `sources/pharmacy2021-connection-photo-notes.json`에 기록했다.

관정관 남동쪽은 [상승 계단 로드뷰](https://kko.to/qAyahwe_1x)와 [하강 통로 로드뷰](https://kko.to/IAoLNaYoLi)의 촬영 좌표를 대조했다. 기존에 같은 계단으로 연결한 배치를 고쳐 상승 계단과 열린 하강 통로를 구분했다. 테라스와 석재 벽, 난간, 점자블록, 볼라드와 가로등도 보완했다. [공식 5층 안내도](https://lib.snu.ac.kr/about/floor-guide/central-lib-facility/kwanjeongbuilding/5f/)와 공식 VR은 편의시설 위 통로와 아래쪽 보행 공간을 구분하는 데 참고했다. 원본 지도와 DEM, 상부 건물 치수는 보존했다. 계단 높이, 단수와 지지부 폭은 근사다. 편의시설 앞 통로와 옥상 연결교는 아래 후속 보완을 참고한다. 근거는 `sources/library-stair-alignment-photo-notes.json`에 기록했다.

관정관 편의시설 앞은 [공식 VR](https://lib.snu.ac.kr/vr/index.html)과 [AURUM 배치도 및 단면도](https://www.aurum.re.kr/Bits/BuildingDoc.aspx?mm=4&num=6114&ss=1), [2025년 게시 사진](https://snumall.tistory.com/entry/쉼이-있는-서울대-대형-카페-추천-베스트5)을 대조했다. 본체와 편의시설 사이의 열린 통로를 만들고, 편의시설 지붕과 좁은 중앙 연결교를 분리했다. 석재 보도 줄눈, 유리문과 손잡이, 차양과 출입 경사판, 화분과 사진에서 읽은 간판을 추가했다. 파스쿠찌는 공식 매장 목록 등록을 확인했고, 다른 점포는 사진 속 모습이며 현재 영업 상태는 확인하지 않았다. 표고와 폭, 문 위치 및 동쪽 접속로의 경사는 게임용 근사다. 근거와 한계는 `sources/library-amenities-photo-notes.json`에 기록했다.

21동 약학관1은 [2026년 7월 현관 로드뷰](https://kko.to/s5nITNk51P)와 [2023년 개관식 사진](https://now.snu.ac.kr/category/3/284)을 대조했다. 북서면의 회색 석재와 긴 유리 띠, 벽돌과 흰 창 상자, 유리 계단실을 구분하고 현관의 검은 루버 차양과 글자, 세 단 계단, 점자블록과 파란 안내판을 추가했다. 보도의 밝고 짙은 블록, 경계석과 배수 격자도 반영했다. 원본 지도와 DEM은 보존했다. 4개 층 구획과 높이 14m, 현관 위치와 바닥 표고, 창과 보도 무늬의 반복은 게임 근사다. 게임에 표시하는 북서쪽 전면을 도로 쪽으로 4.8m 옮겨 보도를 맞췄으며 이 이동량은 측량값이 아니다. 뒤편 외벽과 옥상은 간략한 형태이며 전체 실내는 추가 보완 대상이다. 143동 방향 연결교는 아래 후속 보완을 참고한다. 근거와 한계는 `sources/pharmacy21-exterior-photo-notes.json`에 기록했다.


30동 서쪽 중정은 [2024년 2월 네이버 거리뷰](https://map.naver.com/p?c=17.00,0,0,0,adh&p=ev88w2lLIl87yGs1bK6oFw,141.76,5,80,Float)를 대조해 회색 하단 마당, 남쪽으로 오르는 넓은 계단과 붉은 상단 마당을 연결했다. 30동과 33동 사이에는 창 두 줄의 연결교와 열린 하부 통로를 만들고, [2011년 4월 카카오 로드뷰](https://kko.to/MqH2M4AdVd)를 참고해 난간 경사로와 그 북쪽 짧은 계단, 점자블록을 추가했다. 2024년 사진은 상부 연결 형태를 뒷받침하지만 하부가 가려 현재 경사로와 계단의 상태는 확인하지 못했다. 높이, 폭과 단수는 게임 근사다. 32동 공사 경계와 원본 OSM 및 DEM은 보존했다. 30동 남쪽 계단탑의 세부는 추가 보완 대상이다. 33동 서쪽 필로티와 중정 남서쪽 계단은 아래 후속 보완을 참고한다. [사진 관찰 및 추정 기록](../sources/engineering3033-access-photo-notes.json)에 근거를 구분했다.


33동은 [2025년 9월 남쪽 거리뷰](https://map.naver.com/p?c=17.00,0,0,0,adh&p=osLMizMDYwRVrgxRLogQuA,-48.27,10,80,Float)와 [2024년 2월 북쪽 거리뷰](https://map.naver.com/p?c=17.00,0,0,0,adh&p=Wbk0_vuCSOy6Yr4AsqF8wQ,155,24.87,80,Float)를 대조했다. 본체 창 세 줄과 벽돌, 흰 기둥과 깊은 처마를 구분하고, 서쪽 날개에는 검은 남쪽 외장과 밝은 북쪽 상단 벽, 낮은 유리띠와 현관 표지, 열린 필로티를 추가했다. 기둥 아래 보도와 천장, 조명, 30동 중정에서 내려오는 계단도 연결했다. [2011년 4월 동쪽 E33 현관](https://kko.to/0fKwzZZtJo)은 깊은 입구와 계단, 흰 난간벽과 점자블록을 참고했지만 현재 상태는 미확인이다. 원본 지도 5층 표기는 보존하고 게임에서는 사진에 보이는 창줄을 따랐다. 높이와 기둥 간격, 계단 치수는 근사이며 전체 실내는 구현하지 않았다. 37동 방향 연결부와 큰 계단, 동쪽 청록 연결교는 추가 보완 대상이다. [사진 관찰 및 추정 기록](../sources/engineering33-exterior-photo-notes.json)에 근거를 구분했다.
