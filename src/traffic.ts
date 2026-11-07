import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { TransitPlan, TransitRoute } from './transitTypes';

export type TrafficRoad = {
  id: string | number;
  points: [number, number][];
  width: number;
  kind?: string;
  nodeIds?: (string | number)[];
  drivable?: boolean;
  oneway?: boolean;
};

// 2025년 7월 거리뷰에서 확인한 76동의 볼라드 접근로와 계단 상단 참이다.
// 게임 차량의 진입만 제한한다. 원본 지도나 실제 도로의 통행 규정은 바꾸지 않는다.
export const OBSERVED_PEDESTRIAN_SEGMENTS = [
  { roadId: 'way/167597858/21', nodes: ['1789861939', '1966229954'] },
  { roadId: 'way/185937117/85', nodes: ['1966229962', '1966229960'] },
  { roadId: 'way/185937117/85', nodes: ['1966229960', '1966229950'] },
  { roadId: 'way/185937117/85', nodes: ['1966229950', '1966229953'] },
] as const;

export function isObservedPedestrianSegment(road: TrafficRoad, segmentIndex: number) {
  const a = String(road.nodeIds?.[segmentIndex]), b = String(road.nodeIds?.[segmentIndex + 1]);
  return OBSERVED_PEDESTRIAN_SEGMENTS.some(rule => road.id === rule.roadId &&
    (a === rule.nodes[0] && b === rule.nodes[1] || a === rule.nodes[1] && b === rule.nodes[0]));
}

type Node = { id: string; point: THREE.Vector2; edges: Edge[] };
type Edge = { id: number; roadId: string | number; segmentIndex: number; a: Node; b: Node; length: number; width: number; dir: THREE.Vector2; reverse: Edge; allowed: boolean; oneway: boolean };
type Turn = { curve: THREE.CubicBezierCurve; length: number; distance: number; exitDistance: number };
type VehicleKind = 'bus' | 'car';
type Vehicle = {
  id: number; kind: VehicleKind; slot: number; edge: Edge; next: Edge; distance: number;
  service: 'route-bus' | 'shuttle' | 'taxi' | 'private'; route?: string; routeIndex: number;
  turn: Turn | null; waiting: number; stopHandled: boolean; sinceStop: number;
  endOfRoute: boolean; inMap?: boolean; transit?: TransitState;
  speed: number; cruise: number; alive: boolean; position: THREE.Vector3;
  quaternion: THREE.Quaternion; forward: THREE.Vector3; length: number; width: number; height: number;
  color: THREE.Color; stripe: THREE.Color;
};
type RoutePiece = { edge: Edge; next: Edge; start: number; length: number; offset: number; curve?: THREE.CubicBezierCurve; exitDistance?: number };
type CompiledRoute = { definition: TransitRoute; pieces: RoutePiece[]; stops: { stopId: string; progress: number; dwellSeconds: number }[]; narrow: { resource: number; start: number; end: number }[]; length: number; entry: THREE.Vector2; exit: THREE.Vector2 };
type TransitState = { route: CompiledRoute; progress: number; pieceIndex: number; stopIndex: number; phase: 'driving' | 'terminal' | 'outside'; outsideRemaining: number; laps: number; lastStop?: string };
type Fleet = { parts: { mesh: THREE.InstancedMesh; painted?: 'body' | 'stripe'; taxiOnly?: boolean; routeBoard?: boolean }[]; count: number };

const EXCLUDED = new Set(['footway', 'pedestrian', 'path', 'steps', 'cycleway', 'bridleway', 'construction', 'proposed', 'track', 'corridor']);
const CAPACITY = 32;
const GENERIC_CAPACITY = 24;
const OUTSIDE_SECONDS = 12; // 지도 밖 실제 소요시간이 아닌 게임 재진입 간격이다.
export const BUS_ROUTES = ['5511', '5513', '5516', '관악02-1', '관악02-2'] as const;
const ZERO_SCALE = new THREE.Vector3(0, 0, 0);
const UNIT_SCALE = new THREE.Vector3(1, 1, 1);

// 계획이 전달된 버스는 확인된 교내 구간을 따른다. 배차와 지도 밖 시간은 게임용 근사다.
export class Traffic {
  private group = new THREE.Group();
  private edges: Edge[] = [];
  private segmentEdges = new Map<string, Edge>();
  private routes: CompiledRoute[] = [];
  private routeLabels: string[];
  private narrowGroups = new Map<Edge, number>();
  private narrowOwners = new Map<number, number>();
  private vehicles: Vehicle[] = [];
  private fleets: Record<VehicleKind, Fleet>;
  private seed = 761934;
  private matrix = new THREE.Matrix4();
  private inverse = new THREE.Matrix4();
  private localRay = new THREE.Ray();
  private hitPoint = new THREE.Vector3();
  private localPoint = new THREE.Vector3();
  private colliderBox = new THREE.Box3();
  private lastPlayer = new THREE.Vector3();
  private disposed = false;

  constructor(private scene: THREE.Scene, roads: TrafficRoad[], private heightAt: (x: number, z: number) => number, private transitPlan?: TransitPlan) {
    this.group.name = 'campus-traffic';
    this.buildGraph(roads);
    this.buildNarrowGroups();
    this.routes = transitPlan ? this.compileRoutes(transitPlan) : [];
    this.routeLabels = transitPlan ? [...new Set(transitPlan.routes.map(r => r.service === 'shuttle' ? 'SNU 셔틀' : r.label))] : [...BUS_ROUTES];
    if (!this.routeLabels.length) this.routeLabels.push('SNU 셔틀');
    this.fleets = { bus: this.makeFleet('bus'), car: this.makeFleet('car') };
    scene.add(this.group);
    this.reset();
  }

  private random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  private segmentKey(roadId: string | number, index: number, direction: number) {
    return JSON.stringify([String(roadId), index, direction]);
  }

  private buildNarrowGroups() {
    for (const edge of this.edges) {
      if (edge.width < 5.5 || edge.width >= 6 || this.narrowGroups.has(edge)) continue;
      const id = this.narrowGroups.size, queue = [edge];
      while (queue.length) {
        const current = queue.pop()!;
        if (this.narrowGroups.has(current)) continue;
        this.narrowGroups.set(current, id); this.narrowGroups.set(current.reverse, id);
        for (const node of [current.a, current.b]) for (const next of node.edges) if (next.width >= 5.5 && next.width < 6 && !this.narrowGroups.has(next)) queue.push(next);
      }
    }
  }

  private compileRoutes(plan: TransitPlan): CompiledRoute[] {
    if (!Array.isArray(plan.routes)) throw Error('Transit routes must be an array.');
    const ids = new Set<string>(); let vehicles = 19;
    return plan.routes.map(definition => {
      const fail = (message: string): never => { throw Error(`Transit ${definition.id}: ${message}`); };
      if (!definition.id || ids.has(definition.id)) fail('duplicate or empty route ID');
      ids.add(definition.id);
      if (!definition.label || !['route-bus', 'shuttle'].includes(definition.service) || !['loop', 'boundary'].includes(definition.operation)) fail('invalid service metadata');
      if (!Array.isArray(definition.sources) || !definition.sources.length || !definition.sources.every(s => typeof s === 'string' && s.length > 0)) fail('missing sources');
      const count = definition.vehicleCount ?? 1;
      if (!Number.isInteger(count) || count < 0 || (vehicles += count) > CAPACITY) fail(`fleet exceeds ${CAPACITY} vehicles or has invalid count`);
      if (!Array.isArray(definition.segments) || !definition.segments.length) fail('empty path');
      const edges = definition.segments.map(segment => {
        if (!Number.isInteger(segment.segmentIndex) || segment.segmentIndex < 0 || ![1, -1].includes(segment.direction)) fail('invalid segment reference');
        const edge = this.segmentEdges.get(this.segmentKey(segment.roadId, segment.segmentIndex, segment.direction));
        if (!edge || !edge.allowed || edge.width < (segment.allowNarrow === true ? 5.5 : 6)) fail(`unavailable bus segment ${JSON.stringify(segment)}`);
        return edge!;
      });
      const loop = definition.operation === 'loop';
      edges.forEach((edge, i) => { const next = edges[i + 1] ?? (loop ? edges[0] : undefined); if (next && edge.b !== next.a) fail(`disconnected path at segment ${i}`); });
      const pieces: RoutePiece[] = [], straights: { start: number; end: number; offset: number }[] = [];
      let length = 0;
      const trim = (a: Edge, b: Edge) => Math.min(7, a.length * .32, b.length * .32);
      edges.forEach((edge, i) => {
        const previous = edges[i - 1] ?? (loop ? edges.at(-1) : undefined), next = edges[i + 1] ?? (loop ? edges[0] : undefined);
        const start = previous ? trim(previous, edge) : 0, end = edge.length - (next ? trim(edge, next) : 0);
        straights.push({ start, end, offset: length });
        pieces.push({ edge, next: next ?? edge, start, length: end - start, offset: length }); length += end - start;
        if (next) {
          const distance = trim(edge, next), p0 = this.lanePoint(edge, end), p3 = this.lanePoint(next, distance);
          const handle = next === edge.reverse ? Math.max(distance, 2.45 * 1.5) : Math.max(.3, distance * .72);
          const curve = new THREE.CubicBezierCurve(p0, p0.clone().addScaledVector(edge.dir, handle), p3.clone().addScaledVector(next.dir, -handle), p3);
          const curveLength = Math.max(.1, curve.getLength());
          pieces.push({ edge, next, start: 0, length: curveLength, offset: length, curve, exitDistance: distance }); length += curveLength;
        }
      });
      if (!Array.isArray(definition.stops)) fail('missing stop sequence');
      let previousProgress = -Infinity;
      const stops = definition.stops.map(stop => {
        const straight = straights[stop.routeSegmentIndex];
        if (!stop.stopId || !Number.isInteger(stop.routeSegmentIndex) || !straight || !Number.isFinite(stop.distance) || !Number.isFinite(stop.dwellSeconds) || stop.dwellSeconds < 0 || stop.dwellSeconds > 120) fail('invalid stop');
        if (stop.distance < straight.start - 1e-4 || stop.distance > straight.end + 1e-4) fail(`stop ${stop.stopId} lies in a turn; straight range ${straight.start}..${straight.end}`);
        const progress = straight.offset + THREE.MathUtils.clamp(stop.distance, straight.start, straight.end) - straight.start;
        if (progress < previousProgress) fail('stops are not in route order');
        previousProgress = progress;
        return { stopId: stop.stopId, progress, dwellSeconds: stop.dwellSeconds };
      });
      const first = pieces[0], last = pieces.at(-1)!;
      const narrow: CompiledRoute['narrow'] = [];
      for (const piece of pieces) {
        const resources = new Set([this.narrowGroups.get(piece.edge), ...(piece.curve ? [this.narrowGroups.get(piece.next)] : [])]);
        for (const resource of resources) if (resource !== undefined) {
          const start = Math.max(0, piece.offset - 8.5), end = Math.min(length, piece.offset + piece.length + 8.5);
          let previous: CompiledRoute['narrow'][number] | undefined;
          for (let j = narrow.length - 1; j >= 0; j--) if (narrow[j].resource === resource && narrow[j].end >= start) { previous = narrow[j]; break; }
          if (previous) previous.end = Math.max(previous.end, end); else narrow.push({ resource, start, end });
        }
      }
      return { definition, pieces, stops, narrow, length, entry: this.lanePoint(first.edge, first.start), exit: last.curve ? last.curve.getPointAt(1) : this.lanePoint(last.edge, last.start + last.length) };
    });
  }

  private routeVehicle(route: CompiledRoute, slot: number, phase: number): Vehicle {
    const progress = route.length * phase, shuttle = route.definition.service === 'shuttle';
    const vehicle: Vehicle = {
      id: this.vehicles.length, kind: 'bus', slot, edge: route.pieces[0].edge, next: route.pieces[0].next,
      service: route.definition.service, route: route.definition.label, routeIndex: this.routeLabels.indexOf(shuttle ? 'SNU 셔틀' : route.definition.label),
      distance: 0, turn: null, waiting: 0, stopHandled: false, sinceStop: 0, endOfRoute: false, inMap: true,
      transit: { route, progress, pieceIndex: 0, stopIndex: route.stops.findIndex(stop => stop.progress >= progress - 1e-6), phase: 'driving', outsideRemaining: 0, laps: 0 },
      speed: 0, cruise: 7.8, alive: true, position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), forward: new THREE.Vector3(),
      length: 10.4, width: 2.45, height: 3.18, color: new THREE.Color(shuttle ? '#f0f1ed' : '#63bf35'), stripe: new THREE.Color(shuttle ? '#165d9d' : '#63bf35'),
    };
    if (vehicle.transit!.stopIndex < 0) vehicle.transit!.stopIndex = route.stops.length;
    let placed = false;
    for (let attempt = 0; attempt < Math.ceil(route.length / 17) + 1; attempt++) {
      const state = vehicle.transit!;
      state.progress = (progress + attempt * 17) % route.length;
      this.placeTransit(vehicle); this.pose(vehicle);
      const resources = route.narrow.filter(n => state.progress >= n.start && state.progress <= n.end).map(n => n.resource);
      if (this.vehicles.every(other => other.inMap === false || other.position.distanceTo(vehicle.position) > (other.length + vehicle.length) / 2 + 5 && !other.transit?.route.narrow.some(n => resources.includes(n.resource) && other.transit!.progress >= n.start && other.transit!.progress <= n.end))) { placed = true; break; }
    }
    const state = vehicle.transit!;
    state.stopIndex = route.stops.findIndex(stop => stop.progress >= state.progress - 1e-6);
    if (state.stopIndex < 0) state.stopIndex = route.stops.length;
    if (!placed) { state.phase = 'outside'; state.outsideRemaining = 0; state.progress = 0; state.pieceIndex = 0; state.stopIndex = 0; vehicle.inMap = false; this.placeTransit(vehicle); this.pose(vehicle); }
    return vehicle;
  }

  private transitClearance(vehicle: Vehicle, distance: number) {
    const state = vehicle.transit!;
    for (const section of state.route.narrow) {
      if (state.progress > section.end + 1e-6 || state.progress + distance < section.start) continue;
      const owner = this.narrowOwners.get(section.resource);
      if (owner !== undefined && owner !== vehicle.id) { distance = Math.min(distance, Math.max(0, section.start - state.progress)); vehicle.speed = 0; }
      else this.narrowOwners.set(section.resource, vehicle.id);
    }
    return distance;
  }

  private placeTransit(vehicle: Vehicle) {
    const state = vehicle.transit!, pieces = state.route.pieces;
    while (state.pieceIndex + 1 < pieces.length && state.progress >= pieces[state.pieceIndex + 1].offset) state.pieceIndex++;
    while (state.pieceIndex > 0 && state.progress < pieces[state.pieceIndex].offset) state.pieceIndex--;
    const piece = pieces[state.pieceIndex], distance = THREE.MathUtils.clamp(state.progress - piece.offset, 0, piece.length);
    vehicle.edge = piece.edge; vehicle.next = piece.next;
    vehicle.distance = piece.start + distance;
    vehicle.turn = piece.curve ? { curve: piece.curve, length: piece.length, distance, exitDistance: piece.exitDistance! } : null;
  }

  private advanceTransit(vehicle: Vehicle, distance: number) {
    const state = vehicle.transit!, route = state.route;
    for (let iteration = 0; iteration < 12 && distance > 1e-8; iteration++) {
      const stop = route.stops[state.stopIndex], limit = Math.min(stop?.progress ?? Infinity, route.length);
      const advance = Math.min(distance, Math.max(0, limit - state.progress));
      state.progress += advance; distance -= advance;
      if (stop && state.progress >= stop.progress - 1e-7) {
        state.stopIndex++; state.lastStop = stop.stopId; vehicle.waiting = stop.dwellSeconds;
        if (vehicle.waiting > 0) { vehicle.speed = 0; break; }
      } else if (state.progress >= route.length - 1e-7) {
        if (route.definition.operation === 'loop') { state.progress = 0; state.pieceIndex = 0; state.stopIndex = 0; state.laps++; }
        else { state.phase = 'terminal'; vehicle.speed = 0; break; }
      } else break;
    }
    this.placeTransit(vehicle);
  }

  private updateBoundary(vehicle: Vehicle, dt: number, player: THREE.Vector3) {
    const state = vehicle.transit!, route = state.route, radius = 500 + vehicle.length;
    const far = (p: THREE.Vector2) => Math.hypot(player.x - p.x, player.z - p.y) > radius;
    if (state.phase === 'terminal') {
      if (far(route.entry) && far(route.exit)) { state.phase = 'outside'; state.outsideRemaining = OUTSIDE_SECONDS; vehicle.inMap = false; }
      return;
    }
    state.outsideRemaining = Math.max(0, state.outsideRemaining - dt);
    if (state.outsideRemaining || !far(route.entry) || !far(route.exit)) return;
    if (route.narrow.some(section => section.start <= 1e-6 && this.narrowOwners.has(section.resource) && this.narrowOwners.get(section.resource) !== vehicle.id)) return;
    if (this.vehicles.some(other => other !== vehicle && other.alive && other.inMap !== false && Math.hypot(other.position.x - route.entry.x, other.position.z - route.entry.y) < (vehicle.length + other.length) / 2 + 4)) return;
    state.phase = 'driving'; state.progress = 0; state.pieceIndex = 0; state.stopIndex = 0; state.laps++;
    state.lastStop = undefined; vehicle.inMap = true; vehicle.speed = 0; vehicle.waiting = 0;
    this.placeTransit(vehicle); this.pose(vehicle);
  }

  private buildGraph(roads: TrafficRoad[]) {
    const nodes = new Map<string, Node>();
    const connections = new Map<string, Edge>();
    const nodeFor = (road: TrafficRoad, index: number) => {
      const [x, z] = road.points[index];
      const sourceId = road.nodeIds?.[index];
      const id = sourceId === undefined ? `p:${Math.round(x * 2)},${Math.round(z * 2)}` : `n:${sourceId}`;
      let node = nodes.get(id);
      if (!node) { node = { id, point: new THREE.Vector2(x, z), edges: [] }; nodes.set(id, node); }
      return node;
    };
    for (const road of roads) {
      if (road.drivable === false || EXCLUDED.has(road.kind ?? '') || road.width < 4.5 || road.points.length < 2) continue;
      for (let i = 1; i < road.points.length; i++) {
        if (isObservedPedestrianSegment(road, i - 1)) continue;
        if (![...road.points[i - 1], ...road.points[i]].every(Number.isFinite)) continue;
        const a = nodeFor(road, i - 1), b = nodeFor(road, i);
        const length = a.point.distanceTo(b.point);
        if (length < 0.05) continue;
        const key = [a.id, b.id].sort().join('|');
        const existing = connections.get(key);
        if (existing) {
          const forward = existing.a.id === a.id ? existing : existing.reverse;
          this.segmentEdges.set(this.segmentKey(road.id, i - 1, 1), forward);
          if (!road.oneway) this.segmentEdges.set(this.segmentKey(road.id, i - 1, -1), forward.reverse);
          continue;
        }
        const dir = b.point.clone().sub(a.point).normalize();
        const edge = { id: this.edges.length, roadId: road.id, segmentIndex: i - 1, a, b, length, width: road.width, dir, allowed: true, oneway: !!road.oneway } as Edge;
        const reverse = { id: this.edges.length + 1, roadId: road.id, segmentIndex: i - 1, a: b, b: a, length, width: road.width, dir: dir.clone().negate(), reverse: edge, allowed: !road.oneway, oneway: !!road.oneway };
        edge.reverse = reverse; connections.set(key, edge);
        this.segmentEdges.set(this.segmentKey(road.id, i - 1, 1), edge);
        this.segmentEdges.set(this.segmentKey(road.id, i - 1, -1), reverse);
        a.edges.push(edge); this.edges.push(edge);
        if (reverse.allowed) { b.edges.push(reverse); this.edges.push(reverse); }
      }
    }
  }

  private chooseNext(vehicle: Vehicle, current = vehicle.edge): Edge {
    vehicle.endOfRoute = false;
    const eligible = current.b.edges.filter(e => vehicle.kind !== 'bus' || e.width >= 6);
    const alternatives = eligible.filter(e => e !== current.reverse);
    if (!alternatives.length) {
      vehicle.endOfRoute = !current.reverse.allowed;
      return current.reverse;
    }
    const weights = alternatives.map(e => Math.max(0.15, 1.2 + current.dir.dot(e.dir) * 1.5));
    let choice = this.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < alternatives.length; i++) { choice -= weights[i]; if (choice <= 0) return alternatives[i]; }
    return alternatives[alternatives.length - 1];
  }

  private lanePoint(edge: Edge, distance: number): THREE.Vector2 {
    const lane = edge.oneway && edge.width < 7 ? 0 : Math.min(3.1, Math.max(1.05, edge.width * 0.23));
    return edge.a.point.clone().addScaledVector(edge.dir, distance).add(new THREE.Vector2(edge.dir.y, -edge.dir.x).multiplyScalar(lane));
  }

  private trim(vehicle: Vehicle) {
    return Math.min(vehicle.kind === 'bus' ? 7 : 4.8, vehicle.edge.length * 0.32, vehicle.next.length * 0.32);
  }

  private startTurn(vehicle: Vehicle) {
    const distance = this.trim(vehicle);
    const p0 = this.lanePoint(vehicle.edge, vehicle.edge.length - distance);
    const p3 = this.lanePoint(vehicle.next, distance);
    const reverse = vehicle.next === vehicle.edge.reverse;
    const handle = reverse ? Math.max(distance, vehicle.width * 1.5) : Math.max(0.3, distance * 0.72);
    const p1 = p0.clone().addScaledVector(vehicle.edge.dir, handle);
    const p2 = p3.clone().addScaledVector(vehicle.next.dir, -handle);
    const curve = new THREE.CubicBezierCurve(p0, p1, p2, p3);
    vehicle.turn = { curve, length: Math.max(0.1, curve.getLength()), distance: 0, exitDistance: distance };
  }

  private pose(vehicle: Vehicle) {
    let position: THREE.Vector2, tangent: THREE.Vector2;
    if (vehicle.turn) {
      const t = THREE.MathUtils.clamp(vehicle.turn.distance / vehicle.turn.length, 0, 1);
      position = vehicle.turn.curve.getPointAt(t);
      tangent = vehicle.turn.curve.getTangentAt(t).normalize();
    } else {
      position = this.lanePoint(vehicle.edge, vehicle.distance);
      tangent = vehicle.edge.dir;
    }
    const y = this.heightAt(position.x, position.y);
    const aheadY = this.heightAt(position.x + tangent.x * 1.5, position.y + tangent.y * 1.5);
    vehicle.position.set(position.x, Number.isFinite(y) ? y + 0.06 : 0.06, position.y);
    const pitch = Number.isFinite(aheadY - y) ? -Math.atan2(aheadY - y, 1.5) : 0;
    vehicle.quaternion.setFromEuler(new THREE.Euler(pitch, Math.atan2(tangent.x, tangent.y), 0, 'YXZ'));
    if (vehicle.kind === 'car') this.fitLocalRoad(vehicle, tangent);
    vehicle.forward.set(0, 0, 1).applyQuaternion(vehicle.quaternion);
  }

  private fitLocalRoad(vehicle: Vehicle, tangent: THREE.Vector2) {
    const sampler = this.heightAt as typeof this.heightAt & {
      education12CorrectionRegions?: { minX: number; maxX: number; minZ: number; maxZ: number }[];
      engineering30CorrectionRegions?: { minX: number; maxX: number; minZ: number; maxZ: number }[];
    };
    const regions = [...(sampler.education12CorrectionRegions??[]),...(sampler.engineering30CorrectionRegions??[])];
    const { x, z } = vehicle.position;
    const edgeDistance = Math.max(0, ...(regions ?? []).map(r => Math.min(x-r.minX, r.maxX-x, z-r.minZ, r.maxZ-z)));
    if (!edgeDistance) return;
    const northStation = (x-581.96)*.5105667740474061+(z+792.18)*.8598381064123787;
    const northOffset = -(x-581.96)*.8598381064123787+(z+792.18)*.5105667740474061;
    const weight = THREE.MathUtils.smoothstep(edgeDistance, 0, 4);
    if (!weight) return;
    const sample = (side: number, along: number) => this.heightAt(x+tangent.y*side+tangent.x*along, z-tangent.x*side+tangent.y*along);
    // 앞뒤 바퀴와 좌우 바닥으로 종단 경사와 횡단 경사를 함께 구한다.
    const alongSlope = (sample(0, 1.35)-sample(0, -1.35))/2.7;
    const sideSlope = (sample(.87, 0)-sample(-.87, 0))/1.74;
    if (!Number.isFinite(alongSlope+sideSlope)) return;
    const normal = new THREE.Vector3(-tangent.x*alongSlope-tangent.y*sideSlope, 1, -tangent.y*alongSlope+tangent.x*sideSlope).normalize();
    const forward = new THREE.Vector3(tangent.x, alongSlope, tangent.y).normalize();
    const right = new THREE.Vector3().crossVectors(normal, forward).normalize();
    forward.crossVectors(right, normal).normalize();
    const fitted = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, normal, forward));
    // 북쪽 좁은 차도에서는 차체가 옆 건물 쪽으로 기울지 않도록 기존 자세를 유지한다.
    const orientationWeight = Math.abs(northOffset)<7 ? 1-THREE.MathUtils.smoothstep(northStation, 8, 12) : 1;
    vehicle.quaternion.slerp(fitted, weight*orientationWeight);
    // 굽은 접속부에서는 차체 바닥 전폭을 검사해 뒷바퀴와 범퍼가 지형을 뚫지 않게 한다.
    const probe = new THREE.Vector3();
    let floorY = -Infinity;
    for (let side = 0; side <= 4; side++) for (let along = 0; along <= 8; along++) {
      probe.set(vehicle.width*(side/4-.5), 0, vehicle.length*(along/8-.5)).applyQuaternion(vehicle.quaternion);
      const ground = this.heightAt(x+probe.x, z+probe.z);
      if (Number.isFinite(ground)) floorY = Math.max(floorY, ground+.12-probe.y);
    }
    if (Number.isFinite(floorY)) vehicle.position.y += (floorY-vehicle.position.y)*weight;
  }

  private spawnVehicles() {
    const roads = this.edges.filter(e => e.length > 15);
    if (!roads.length && !this.routes.length) return;
    const busRoads = roads.filter(e => e.width >= 6 && e.length >= 22);
    const palette = ['#ecebe4', '#293d54', '#d55f44', '#6e9099', '#c8c9cb', '#e5bd5e'];
    const usableLength = this.edges.reduce((sum, edge) => sum + edge.length, 0) / 2;
    const count = this.transitPlan ? (roads.length ? 19 : 0) : Math.min(GENERIC_CAPACITY, Math.max(2, Math.floor(usableLength / 140)));
    let buses = 0, cars = 0;
    for (const route of this.routes) {
      const number = route.definition.vehicleCount ?? 1;
      for (let i = 0; i < number; i++) this.vehicles.push(this.routeVehicle(route, buses++, i / number));
    }
    for (let i = 0; i < count; i++) {
      const id = this.vehicles.length;
      const kind: VehicleKind = !this.transitPlan && id % 5 === 0 && busRoads.length ? 'bus' : 'car';
      const candidates = kind === 'bus' ? busRoads : roads;
      let selected = candidates[0], distance = 0;
      for (let attempt = 0; attempt < 70; attempt++) {
        const nearby = id < 4 ? candidates.filter(e => e.a.point.length() < 250 || e.b.point.length() < 250) : [];
        const pool = nearby.length ? nearby : candidates;
        const total = pool.reduce((sum, e) => sum + e.length, 0);
        let weighted = this.random() * total;
        selected = pool[pool.length - 1];
        for (const edge of pool) { weighted -= edge.length; if (weighted <= 0) { selected = edge; break; } }
        distance = selected.length * (0.2 + this.random() * 0.55);
        const p = this.lanePoint(selected, distance);
        if (this.vehicles.every(v => Math.hypot(v.position.x - p.x, v.position.z - p.y) > (kind === 'bus' ? 17 : 12))) break;
      }
      const routeIndex = kind === 'bus' ? buses % BUS_ROUTES.length : -1;
      const taxi = kind === 'car' && cars < 18 && cars % 3 !== 2;
      const vehicle: Vehicle = {
        id, kind, slot: kind === 'bus' ? buses++ : cars++, edge: selected, next: selected.reverse,
        service: kind === 'bus' ? 'route-bus' : taxi ? 'taxi' : 'private', route: kind === 'bus' ? BUS_ROUTES[routeIndex] : undefined, routeIndex,
        inMap: true, distance, turn: null, waiting: 0, stopHandled: false, sinceStop: this.random() * 160, endOfRoute: false,
        speed: 0, cruise: kind === 'bus' ? 7.2 + this.random() * 1.2 : 8.8 + this.random() * 2.8,
        alive: true, position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), forward: new THREE.Vector3(),
        length: kind === 'bus' ? 10.4 : 4.3, width: kind === 'bus' ? 2.45 : 1.82, height: kind === 'bus' ? 3.18 : taxi ? 1.86 : 1.53,
        color: new THREE.Color(kind === 'bus' ? '#63bf35' : taxi ? cars % 4 === 0 ? '#cfd3d0' : '#f0f1e9' : palette[id % palette.length]),
        stripe: new THREE.Color('#63bf35'),
      };
      vehicle.next = this.chooseNext(vehicle);
      vehicle.distance = Math.min(vehicle.distance, vehicle.edge.length - this.trim(vehicle));
      this.pose(vehicle); this.vehicles.push(vehicle);
    }
    this.fleets.bus.count = buses; this.fleets.car.count = cars;
    for (const kind of ['bus', 'car'] as const) {
      const fleet = this.fleets[kind];
      for (const part of fleet.parts) part.mesh.count = fleet.count;
    }
    for (const vehicle of this.vehicles) {
      for (const part of this.fleets[vehicle.kind].parts) {
        if (part.routeBoard) { const attribute=part.mesh.geometry.getAttribute('instanceRoute') as THREE.InstancedBufferAttribute;attribute.setX(vehicle.slot,vehicle.routeIndex);attribute.needsUpdate=true; }
        const shuttle = part.mesh.geometry.getAttribute('instanceShuttle') as THREE.InstancedBufferAttribute | undefined;
        if (shuttle) { shuttle.setX(vehicle.slot, vehicle.service === 'shuttle' ? 1 : 0); shuttle.needsUpdate = true; }
        if (part.painted) {
          part.mesh.setColorAt(vehicle.slot, part.painted === 'body' ? vehicle.color : vehicle.stripe);
          part.mesh.instanceColor!.needsUpdate = true;
        }
      }
    }
  }

  update(dt: number, player: THREE.Vector3): void {
    if (this.disposed) return;
    dt = THREE.MathUtils.clamp(dt, 0, 0.1);
    this.lastPlayer.copy(player);
    for (const [resource, id] of this.narrowOwners) {
      const owner = this.vehicles.find(v => v.id === id);
      if (!owner?.alive || owner.inMap === false || !owner.transit?.route.narrow.some(n => n.resource === resource && owner.transit!.progress >= n.start - 1e-6 && owner.transit!.progress <= n.end + 1e-6)) this.narrowOwners.delete(resource);
    }
    for (const vehicle of this.vehicles) {
      if (!vehicle.alive) continue;
      if (vehicle.transit && vehicle.transit.phase !== 'driving') { this.updateBoundary(vehicle, dt, player); continue; }
      let desired = vehicle.turn ? Math.min(4.2, vehicle.cruise) : vehicle.cruise;
      if (vehicle.transit) {
        const stop = vehicle.transit.route.stops[vehicle.transit.stopIndex];
        if (stop) desired = Math.min(desired, Math.max(.4, Math.sqrt(5 * Math.max(0, stop.progress - vehicle.transit.progress))));
      }
      const remaining = vehicle.edge.length - this.trim(vehicle) - vehicle.distance;
      if (!vehicle.turn && remaining < 15) desired = Math.min(desired, 2.5 + Math.max(0, remaining) * 0.55);
      if (vehicle.waiting > 0) { vehicle.waiting = Math.max(0, vehicle.waiting - dt); desired = 0; }
      const isAhead = (position: THREE.Vector3, length: number, width: number) => {
        const dx = position.x - vehicle.position.x, dz = position.z - vehicle.position.z;
        const forward = dx * vehicle.forward.x + dz * vehicle.forward.z;
        const sideways = Math.abs(dx * vehicle.forward.z - dz * vehicle.forward.x);
        return forward > 0 && forward < vehicle.length / 2 + length / 2 + 3.8 && sideways < (vehicle.width + width) / 2;
      };
      if (isAhead(player, 1, 0.8)) desired = 0;
      for (const other of this.vehicles) {
        if (other === vehicle || !other.alive || other.inMap === false) continue;
        if (other.forward.dot(vehicle.forward) > 0.5 && isAhead(other.position, other.length, other.width)) desired = Math.min(desired, other.speed * 0.75);
      }
      const acceleration = desired < vehicle.speed ? 10 : 2.2;
      vehicle.speed = THREE.MathUtils.lerp(vehicle.speed, desired, Math.min(1, acceleration * dt));
      if (vehicle.waiting > 0) vehicle.speed = 0;
      let distance = vehicle.speed * dt;
      vehicle.sinceStop += distance;
      if (vehicle.transit) { this.advanceTransit(vehicle, this.transitClearance(vehicle, distance)); this.pose(vehicle); continue; }
      // 한 프레임에 여러 짧은 도로 구간을 통과하더라도 연결 순서를 유지한다.
      for (let transition = 0; distance > 0.00001 && transition < 12; transition++) {
        if (vehicle.turn) {
          const available = vehicle.turn.length - vehicle.turn.distance;
          const advance = Math.min(distance, available);
          vehicle.turn.distance += advance; distance -= advance;
          if (vehicle.turn.distance + 0.00001 >= vehicle.turn.length) {
            vehicle.distance = vehicle.turn.exitDistance; vehicle.edge = vehicle.next;
            vehicle.next = this.chooseNext(vehicle); vehicle.turn = null; vehicle.stopHandled = false;
            vehicle.distance = Math.min(vehicle.distance, vehicle.edge.length - this.trim(vehicle));
          }
        } else {
          const available = Math.max(0, vehicle.edge.length - this.trim(vehicle) - vehicle.distance);
          const advance = Math.min(distance, available);
          vehicle.distance += advance; distance -= advance;
          if (available <= advance + 0.00001) {
            if (vehicle.endOfRoute) { vehicle.speed = 0; distance = 0; break; }
            const junction = vehicle.edge.b.edges.length > 2;
            const busStop = vehicle.kind === 'bus' && vehicle.sinceStop > 220;
            if (!vehicle.stopHandled && (junction || busStop)) {
              vehicle.stopHandled = true; vehicle.waiting = busStop ? 3.6 : 0.45 + vehicle.id % 3 * 0.2;
              if (busStop) vehicle.sinceStop = 0;
              vehicle.speed = 0; distance = 0;
            } else this.startTurn(vehicle);
          }
        }
      }
      this.pose(vehicle);
    }
    this.syncMeshes();
  }

  private syncMeshes() {
    for (const vehicle of this.vehicles) {
      const visible = vehicle.alive && vehicle.inMap !== false && vehicle.position.distanceToSquared(this.lastPlayer) < 500 * 500;
      for (const part of this.fleets[vehicle.kind].parts) {
        const shown = visible && (!part.taxiOnly || vehicle.service === 'taxi');
        this.matrix.compose(vehicle.position, vehicle.quaternion, shown ? UNIT_SCALE : ZERO_SCALE);part.mesh.setMatrixAt(vehicle.slot, this.matrix);
      }
    }
    for (const fleet of Object.values(this.fleets)) for (const part of fleet.parts) part.mesh.instanceMatrix.needsUpdate = true;
  }

  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDistance: number): { point: THREE.Vector3; vehicleId: number; distance: number } | null {
    if (this.disposed || dir.lengthSq() < 1e-10 || maxDistance < 0) return null;
    let result: { point: THREE.Vector3; vehicleId: number; distance: number } | null = null;
    for (const vehicle of this.vehicles) {
      if (!vehicle.alive || vehicle.inMap === false || vehicle.position.distanceTo(origin) > maxDistance + vehicle.length + 4) continue;
      this.matrix.compose(vehicle.position, vehicle.quaternion, UNIT_SCALE);
      this.inverse.copy(this.matrix).invert();
      this.localRay.set(origin, dir).applyMatrix4(this.inverse);
      this.colliderBox.min.set(-vehicle.width / 2, 0, -vehicle.length / 2);
      this.colliderBox.max.set(vehicle.width / 2, vehicle.height, vehicle.length / 2);
      if (this.colliderBox.containsPoint(this.localRay.origin)) this.hitPoint.copy(this.localRay.origin);
      else if (!this.localRay.intersectBox(this.colliderBox, this.hitPoint)) continue;
      this.hitPoint.applyMatrix4(this.matrix);
      const distance = this.hitPoint.distanceTo(origin);
      if (distance <= maxDistance && (!result || distance < result.distance)) result = { point: this.hitPoint.clone(), vehicleId: vehicle.id, distance };
    }
    return result;
  }

  explode(point: THREE.Vector3, radius: number): number {
    if (this.disposed || radius <= 0) return 0;
    let count = 0;
    for (const vehicle of this.vehicles) {
      if (!vehicle.alive || vehicle.inMap === false || vehicle.position.distanceTo(point) > radius + vehicle.length) continue;
      this.matrix.compose(vehicle.position, vehicle.quaternion, UNIT_SCALE);
      this.localPoint.copy(point).applyMatrix4(this.inverse.copy(this.matrix).invert());
      this.colliderBox.min.set(-vehicle.width / 2, 0, -vehicle.length / 2);
      this.colliderBox.max.set(vehicle.width / 2, vehicle.height, vehicle.length / 2);
      if (this.colliderBox.distanceToPoint(this.localPoint) <= radius) { vehicle.alive = false; count++; }
    }
    if (count) this.syncMeshes();
    return count;
  }

  minimapPositions(): { x: number; z: number; kind: VehicleKind; service: Vehicle['service']; route?: string }[] {
    return this.vehicles.filter(v => v.alive && v.inMap !== false).map(v => ({ x: v.position.x, z: v.position.z, kind: v.kind, service: v.service, route: v.route }));
  }

  get initialVehicleCount(): number { return this.vehicles.length; }

  collisionStates(): {
    id: number;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
    width: number; height: number; length: number;
  }[] {
    return this.vehicles.filter(v => v.alive && v.inMap !== false && v.position.distanceToSquared(this.lastPlayer) < 500 * 500).map(v => ({
      id: v.id,
      position: { x: v.position.x, y: v.position.y, z: v.position.z },
      rotation: { x: v.quaternion.x, y: v.quaternion.y, z: v.quaternion.z, w: v.quaternion.w },
      width: v.width, height: v.height, length: v.length,
    }));
  }

  reset(): void {
    if (this.disposed) return;
    this.seed = 761934; this.vehicles = [];
    this.narrowOwners.clear();
    this.fleets.bus.count = this.fleets.car.count = 0;
    for (const fleet of Object.values(this.fleets)) for (const part of fleet.parts) part.mesh.count = 0;
    this.spawnVehicles(); this.syncMeshes();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.scene.remove(this.group);
    for (const fleet of Object.values(this.fleets)) for (const part of fleet.parts) {
      (part.mesh.material as THREE.MeshBasicMaterial).map?.dispose();
      part.mesh.geometry.dispose(); (part.mesh.material as THREE.Material).dispose(); part.mesh.dispose();
    }
    this.vehicles = []; this.edges = []; this.group.clear();
  }

  private makeFleet(kind: VehicleKind): Fleet {
    const bus = kind === 'bus';
    const sections = new Map<string, THREE.BufferGeometry[]>();
    const add = (section: string, geometry: THREE.BufferGeometry, x: number, y: number, z: number, rotation?: THREE.Euler) => {
      const transform = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(rotation ?? new THREE.Euler()), UNIT_SCALE);
      geometry.applyMatrix4(transform);
      if (!sections.has(section)) sections.set(section, []);
      sections.get(section)!.push(geometry);
    };
    const box = (section: string, x: number, y: number, z: number, w: number, h: number, d: number) => add(section, new THREE.BoxGeometry(w, h, d), x, y, z);
    const width = bus ? 2.45 : 1.82, length = bus ? 10.4 : 4.3;
    if (bus) {
      box('body', 0, 1.06, 0, width, 1.34, length);
      box('body', 0, 2.05, -0.18, width - 0.06, 1.85, length - 0.25);
      box('body', 0, 3.01, -0.08, width - 0.1, 0.23, length - 0.18);
      for (const side of [-1, 1]) box('trim', side * (width / 2 + .006), 2.3, -.18, .025, 1.02, length - .5);
      for (const side of [-1, 1]) for (let i = 0; i < 7; i++) box('glass', side * (width / 2 + 0.008), 2.3, -4.05 + i * 1.28, 0.035, 0.91, 1.13);
      box('glass', 0, 2.24, length / 2 + 0.008, 2.17, 1.2, 0.03);
      box('glass', 0, 2.35, -length / 2 - 0.008, 2.12, 0.9, 0.03);
      for (const z of [3.7, 0.3]) {
        box('trim', width / 2 + 0.025, 1.42, z, 0.04, 2.38, 1.03);
        box('glass', width / 2 + 0.051, 1.8, z, 0.035, 1.42, 0.87);
      }
      box('trim', 0, 2.91, length / 2 + .035, 2.12, .4, .05);
      for (const side of [-1, 1]) {
        box('trim', side * 1.39, 2.42, 4.7, 0.28, 0.45, 0.18);
        box('trim', side * 1.22, 2.6, 4.85, 0.24, 0.06, 0.08);
      }
    } else {
      box('body', 0, 0.66, 0, width, 0.73, length);
      box('body', 0, 1.16, -0.25, 1.62, 0.7, 2.35);
      box('body', 0, 1.52, -0.27, 1.47, 0.09, 1.69);
      box('glass', 0, 1.2, 0.95, 1.5, 0.51, 0.025);
      box('glass', 0, 1.2, -1.45, 1.5, 0.5, 0.025);
      for (const side of [-1, 1]) {
        box('glass', side * 0.82, 1.23, 0.33, 0.025, 0.44, 0.98);
        box('glass', side * 0.82, 1.23, -0.78, 0.025, 0.44, 0.98);
        box('trim', side * 0.98, 1.07, 0.72, 0.18, 0.14, 0.25);
        for (const z of [0.13, -0.93]) box('chrome', side * 0.92, 0.89, z, 0.025, 0.035, 0.2);
      }
      box('trim', 0, 0.57, length / 2 + 0.02, 0.77, 0.2, 0.035);
    }
    const wheelZ = bus ? [-3.1, 3.35] : [-1.35, 1.35];
    const radius = bus ? 0.48 : 0.32;
    for (const side of [-1, 1]) for (const z of wheelZ) {
      add('trim', new THREE.CylinderGeometry(radius, radius, bus ? 0.26 : 0.2, 12), side * (width / 2 - 0.04), radius + 0.03, z, new THREE.Euler(0, 0, Math.PI / 2));
      add('chrome', new THREE.CylinderGeometry(radius * 0.52, radius * 0.52, 0.025, 10), side * (width / 2 + (bus ? 0.1 : 0.07)), radius + 0.03, z, new THREE.Euler(0, 0, Math.PI / 2));
    }
    for (const side of [-1, 1]) {
      box('headlight', side * width * 0.34, bus ? 0.87 : 0.76, length / 2 + 0.025, bus ? 0.4 : 0.42, bus ? 0.17 : 0.14, 0.045);
      box('tail', side * width * 0.36, bus ? 1.02 : 0.76, -length / 2 - 0.025, bus ? 0.22 : 0.37, bus ? 0.38 : 0.14, 0.045);
    }
    box('chrome', 0, bus ? 0.5 : 0.37, length / 2 + 0.015, width * 0.83, 0.08, 0.04);
    box('chrome', 0, bus ? 0.5 : 0.37, -length / 2 - 0.015, width * 0.83, 0.08, 0.04);
    const definitions: Record<string, { color: string; metalness?: number; roughness?: number; emissive?: string; painted?: 'body' | 'stripe' }> = {
      body: { color: '#ffffff', metalness: 0.22, roughness: 0.42, painted: 'body' },
      stripe: { color: '#ffffff', painted: 'stripe' },
      glass: { color: '#263e50', metalness: 0.35, roughness: 0.19 },
      trim: { color: '#22272d', roughness: 0.82 },
      chrome: { color: '#b4c0c5', metalness: 0.8, roughness: 0.28 },
      headlight: { color: '#fff0c2', emissive: '#d1c090' },
      tail: { color: '#e84636', emissive: '#8e1b10' },
      destination: { color: '#e6e6a3', emissive: '#828849' },
    };
    const parts: Fleet['parts'] = [];
    for (const [name, geometries] of sections) {
      const geometry = mergeGeometries(geometries, false)!;
      for (const input of geometries) input.dispose();
      const { painted, ...properties } = definitions[name];
      const material = new THREE.MeshStandardMaterial(properties);
      if (bus && name === 'body') {
        geometry.setAttribute('instanceShuttle', new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY), 1));
        const blue = new THREE.Color('#165d9d');
        material.onBeforeCompile = shader => {
          shader.vertexShader = 'attribute float instanceShuttle; varying float vShuttle; varying float vBodyZ;\n' + shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vShuttle=instanceShuttle; vBodyZ=position.z;');
          shader.fragmentShader = 'varying float vShuttle; varying float vBodyZ;\n' + shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>\n if(vShuttle>0.5 && vBodyZ < -1.6) diffuseColor.rgb=vec3(${blue.r},${blue.g},${blue.b});`);
        };
        material.customProgramCacheKey = () => 'campus-school-bus-paint-v1';
      }
      const mesh = new THREE.InstancedMesh(geometry, material, CAPACITY);
      mesh.name = `traffic-${kind}-${name}`; mesh.count = 0;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false;
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.group.add(mesh); parts.push({ mesh, painted });
    }
    if (bus) {
      const planes: THREE.BufferGeometry[] = [];
      for (const [x,y,z,w,h,rotation] of [[0,2.91,5.27,2.08,.36,0],[0,2.42,-5.225,1.65,.55,Math.PI],[1.273,2.63,-2.4,2.2,.5,Math.PI/2],[-1.253,2.63,-2.4,2.2,.5,-Math.PI/2]]) {
        const g=new THREE.PlaneGeometry(w,h);g.rotateY(rotation);g.translate(x,y,z);
        const uv=g.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setX(i,1-uv.getX(i));planes.push(g);
      }
      const geometry=mergeGeometries(planes,false)!;planes.forEach(g=>g.dispose());
      geometry.setAttribute('instanceRoute',new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY),1));
      const material=new THREE.MeshBasicMaterial({map:makeRouteAtlas(this.routeLabels),side:THREE.DoubleSide,toneMapped:false});
      material.onBeforeCompile=shader=>{shader.vertexShader='attribute float instanceRoute;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv.y=(vMapUv.y+instanceRoute)/'+this.routeLabels.length.toFixed(1)+';\n#endif');};
      material.customProgramCacheKey=()=> 'campus-route-atlas-v2-'+this.routeLabels.length;
      const mesh=new THREE.InstancedMesh(geometry,material,CAPACITY);mesh.name='traffic-bus-route-board';mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.userData.routeLabels=[...this.routeLabels];mesh.userData.textReflectionCompensation='uv-u-reflected-once';this.group.add(mesh);parts.push({mesh,routeBoard:true});
    } else {
      const white=new THREE.BoxGeometry(.59,.23,.31).translate(0,1.7,-.24),blue=new THREE.BoxGeometry(.39,.13,.318).translate(0,1.7,-.24);
      for(const [g,color]of [[white,0xf5f4dd],[blue,0x789ca9]] as const){const tint=new THREE.Color(color),colors=[];for(let i=0;i<g.getAttribute('position').count;i++)colors.push(tint.r,tint.g,tint.b);g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));}
      const geometry=mergeGeometries([white,blue],false)!;white.dispose();blue.dispose();
      const mesh=new THREE.InstancedMesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.6}),CAPACITY);mesh.name='traffic-car-taxi-roof-sign';mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.group.add(mesh);parts.push({mesh,taxiOnly:true});
    }
    return { parts, count: 0 };
  }
}

// 노선번호만 표시한다. 실제 행선판 문구나 개별 노선의 현재 차종을 재현한 표시는 아니다.
function makeRouteAtlas(labels: string[]) {
  const width=256,height=64*labels.length,pixels=new Uint8Array(width*height*4);
  for(let i=0;i<pixels.length;i+=4){pixels[i]=12;pixels[i+1]=19;pixels[i+2]=18;pixels[i+3]=255;}
  const digits:Record<string,string[]>= {
    '0':['01110','10001','10011','10101','11001','10001','01110'],'1':['00100','01100','00100','00100','00100','00100','01110'],
    '2':['01110','10001','00001','00010','00100','01000','11111'],'3':['11110','00001','00001','01110','00001','00001','11110'],
    '4':['00010','00110','01010','10010','11111','00010','00010'],'5':['11111','10000','10000','11110','00001','00001','11110'],
    '6':['01110','10000','10000','11110','10001','10001','01110'],'7':['11111','00001','00010','00100','01000','01000','01000'],
    '8':['01110','10001','10001','01110','10001','10001','01110'],'9':['01110','10001','10001','01111','00001','00001','01110'],
    'S':['01111','10000','10000','01110','00001','00001','11110'],
    'N':['10001','11001','11001','10101','10011','10011','10001'],
    'U':['10001','10001','10001','10001','10001','10001','01110'],
  };
  const glyph=(char:string)=>{
    const g=Array.from({length:16},()=>Array(14).fill(0));const line=(x0:number,y0:number,x1:number,y1:number)=>{for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)g[y][x]=1;};
    if(digits[char]){digits[char].forEach((row,y)=>[...row].forEach((v,x)=>{if(v==='1')line(x*2,y*2,x*2+1,y*2+1);}));return{g,width:12};}
    if(char==='-'){line(1,7,7,8);return{g,width:9};}
    if(char==='관'){line(1,1,6,2);line(5,2,6,6);line(3,6,4,9);line(0,9,7,10);line(10,0,11,10);line(11,4,13,5);line(2,12,3,15);line(2,14,12,15);}
    if(char==='악'){line(2,1,6,2);line(1,2,2,7);line(6,2,7,7);line(2,7,6,8);line(10,0,11,9);line(11,4,13,5);line(2,11,12,12);line(11,12,12,15);}
    if(char==='셔'){for(let y=1;y<10;y++){const x=Math.max(0,3-Math.floor((y-1)/3));line(x,y,x+1,y);line(6-x,y,7-x,y);}line(11,0,12,15);line(8,4,11,5);line(8,9,11,10);}
    if(char==='틀'){line(2,0,12,1);line(2,0,3,6);line(2,3,11,4);line(2,6,12,7);line(1,9,13,10);line(2,12,12,12);line(11,12,12,13);line(2,13,12,13);line(2,13,3,15);line(2,15,12,15);}
    if(char===' ')return{g,width:5};
    return{g,width:15};
  };
  labels.forEach((text,row)=>{const chars=[...text].map(glyph),units=chars.reduce((n,g)=>n+g.width,0),scale=Math.min(4,Math.floor(240/units));let x=Math.floor((width-units*scale)/2);const glyphHeight=/[관악셔틀]/.test(text)?16:14;const top=Math.floor((64-glyphHeight*scale)/2);for(const char of chars){for(let gy=0;gy<16;gy++)for(let gx=0;gx<14;gx++)if(char.g[gy][gx])for(let sy=0;sy<scale;sy++)for(let sx=0;sx<scale;sx++){const px=x+gx*scale+sx,py=row*64+63-(top+gy*scale+sy),i=(py*width+px)*4;pixels[i]=234;pixels[i+1]=245;pixels[i+2]=204;}x+=char.width*scale;}});
  const texture=new THREE.DataTexture(pixels,width,height,THREE.RGBAFormat);texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true;texture.name='campus-bus-route-atlas';return texture;
}
