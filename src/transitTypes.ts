import type { CampusRoad } from './fullCampus';

export type TransitSegment = {
  roadId: string | number;
  /** 원본 road.points[i]에서 road.points[i + 1]로 이어지는 구간의 i. */
  segmentIndex: number;
  direction: 1 | -1;
  /** 공식 노선과 대조한 구간만 5.5m 하한을 허용한다. 기본값은 6m다. */
  allowNarrow?: boolean;
};

export type TransitStop = {
  stopId: string;
  routeSegmentIndex: number;
  /** 방향을 적용한 구간 시작점에서의 거리(m). */
  distance: number;
  /** 실제 운행 시간표가 아닌 게임의 정차 시간. */
  dwellSeconds: number;
};

export type TransitRoute = {
  id: string;
  label: string;
  service: 'route-bus' | 'shuttle';
  segments: TransitSegment[];
  stops: TransitStop[];
  operation: 'loop' | 'boundary';
  sources: string[];
  vehicleCount?: number;
};

export type TransitPlan = { routes: TransitRoute[]; supplementalRoads?: CampusRoad[] };
