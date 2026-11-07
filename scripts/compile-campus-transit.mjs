import fs from 'node:fs';
import crypto from 'node:crypto';
const root = new URL('../', import.meta.url);
fs.mkdirSync(new URL('artifacts/bus-route-review/', root), { recursive: true });
const read = p => JSON.parse(fs.readFileSync(new URL(p, root)));
const write = (p, x) => fs.writeFileSync(new URL(p, root), JSON.stringify(x, null, 2) + '\n');
const data = read('public/data/campus.json'), snapshot = read('sources/transit-official-routes.json'), official = snapshot.routes;
if (data.origin.lat !== snapshot.origin.lat || data.origin.lon !== snapshot.origin.lon)
    throw Error('Transit snapshot origin mismatch');
// 원문 OSM을 읽어 경계 필터 때문에 빠졌던 차도만 복원한다. 원본 파일은 변경하지 않는다.
const xml = fs.readFileSync(new URL('sources/campus.osm', root), 'utf8');
const decode = s => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const attrs = s => Object.fromEntries([...s.matchAll(/([\w:]+)="([^"]*)"/g)].map(m => [m[1], decode(m[2])]));
const projectGeo = a => [(+a.lon - data.origin.lon) * 111320 * Math.cos(data.origin.lat * Math.PI / 180), (+a.lat - data.origin.lat) * 111320];
const osmNodes = new Map([...xml.matchAll(/<node\b([^>]*?)(?:\/>|>[\s\S]*?<\/node>)/g)].map(m => { const a = attrs(m[1]); return [a.id, projectGeo(a)]; }));
const raw = [];
for (const m of xml.matchAll(/<way\b([^>]*?)>([\s\S]*?)<\/way>/g)) {
    const id = attrs(m[1]).id, tags = Object.fromEntries([...m[2].matchAll(/<tag\b([^>]*?)\/>/g)].map(x => { const a = attrs(x[1]); return [a.k, a.v]; }));
    if (!tags.highway || ['footway', 'pedestrian', 'path', 'steps', 'cycleway', 'track', 'bridleway', 'construction'].includes(tags.highway))
        continue;
    const nodeIds = [...m[2].matchAll(/<nd\b([^>]*?)\/>/g)].map(x => attrs(x[1]).ref);
    if (nodeIds.some(n => !osmNodes.has(n)))
        continue;
    raw.push({ id: 'way/' + id, nodeIds, points: nodeIds.map(n => osmNodes.get(n)), tags });
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const project = (p, a, b) => { let dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz, t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)) : 0, q = [a[0] + dx * t, a[1] + dz * t]; return { t, q, d: dist(p, q) }; };
const widths = { primary: 20, primary_link: 6, secondary: 14, secondary_link: 6, tertiary: 8, tertiary_link: 5, unclassified: 7, residential: 6, service: 5.5, living_street: 5 };
const roads = [...data.roads], existing = new Set;
for (let r of roads)
    for (let i = 1; i < r.nodeIds.length; i++)
        existing.add([r.nodeIds[i - 1], r.nodeIds[i]].sort().join(':'));
for (let r of raw) {
    let run = [], start = 0;
    const flush = () => { if (run.length < 2)
        return; let t = r.tags, w = +t.width || (+t.lanes ? +t.lanes * 3.2 : widths[t.highway] || 4); roads.push({ id: `transit/osm/${r.id.split('/')[1]}/${start}`, name: t['name:ko'] || t.name || '', kind: t.highway, points: (t.oneway === '-1' ? [...run].reverse() : run).map(i => r.points[i].map(n => Math.round(n * 100) / 100)), nodeIds: (t.oneway === '-1' ? [...run].reverse() : run).map(i => r.nodeIds[i]), width: w, widthEstimated: !t.width, drivable: true, oneway: ['yes', '1', '-1'].includes(t.oneway), access: t.access || '', sourceWay: r.id, sourceUrl: `https://www.openstreetmap.org/${r.id}`, sourceTags: t }); };
    for (let i = 0; i < r.points.length - 1; i++) {
        let p = r.points[i], q = r.points[i + 1], key = [r.nodeIds[i], r.nodeIds[i + 1]].sort().join(':');
        let accept = !existing.has(key) && [p, q].some(p => p[0] > -220 && p[0] < 1170 && p[1] > -2300 && p[1] < 335);
        if (accept) {
            if (!run.length) {
                start = i;
                run = [i];
            }
            run.push(i + 1);
        }
        else {
            flush();
            run = [];
        }
    }
    flush();
}
const edges = [], adj = new Map, seen = new Set;
for (let r of roads) {
    if (!r.drivable || r.width < 5.5 || r.access === 'no')
        continue;
    for (let i = 0; i < r.points.length - 1; i++) {
        let len = dist(r.points[i], r.points[i + 1]);
        if (len < .01)
            continue;
        for (let direction of (r.oneway ? [1] : [1, -1])) {
            let s = direction === 1 ? i : i + 1, t = direction === 1 ? i + 1 : i;
            let a = r.nodeIds[s], b = r.nodeIds[t], k = a + '>' + b;
            if (seen.has(k))
                continue;
            seen.add(k);
            let e = { idx: edges.length, road: r, segmentIndex: i, direction, a, b, p: r.points[s], q: r.points[t], len };
            edges.push(e);
            if (!adj.has(a))
                adj.set(a, []);
            adj.get(a).push(e);
        }
    }
}
class Heap {
    a = [];
    push(x) { let a = this.a, i = a.length; a.push(x); while (i) {
        let p = (i - 1) >> 1;
        if (a[p][0] <= x[0])
            break;
        a[i] = a[p];
        i = p;
    } a[i] = x; }
    pop() { let a = this.a, r = a[0], x = a.pop(); if (a.length) {
        let i = 0;
        while (i * 2 + 1 < a.length) {
            let j = i * 2 + 1;
            if (j + 1 < a.length && a[j + 1][0] < a[j][0])
                j++;
            if (a[j][0] >= x[0])
                break;
            a[i] = a[j];
            i = j;
        }
        a[i] = x;
    } return r; }
}
let routeCache = new Map;
function reachable(start, limit = 400) { let key = start; if (routeCache.has(key))
    return routeCache.get(key); let costs = new Map([[start, 0]]), prev = new Map, q = new Heap; q.push([0, start]); while (q.a.length) {
    let [c, n] = q.pop();
    if (c !== costs.get(n))
        continue;
    for (let e of adj.get(n) || []) {
        let nc = c + e.len;
        if (nc > limit || nc >= (costs.get(e.b) ?? Infinity))
            continue;
        costs.set(e.b, nc);
        prev.set(e.b, e);
        q.push([nc, e.b]);
    }
} let v = { costs, prev }; routeCache.set(key, v); return v; }
function middle(a, b) { if (a === b)
    return []; let r = reachable(a); if (!r.costs.has(b))
    return null; let out = [], n = b; while (n !== a) {
    let e = r.prev.get(n);
    out.push(e);
    n = e.a;
} return out.reverse(); }
function line(points) { let s = 0; return points.map((p, i) => { if (i)
    s += dist(points[i - 1], p); return { p, s }; }); }
function at(g, s) { let i = 1; while (i < g.length - 1 && g[i].s < s)
    i++; let a = g[i - 1], b = g[i], t = (s - a.s) / (b.s - a.s || 1); return [a.p[0] + (b.p[0] - a.p[0]) * t, a.p[1] + (b.p[1] - a.p[1]) * t]; }
function stationProgress(g, stops) { let rows = []; for (let st of stops) {
    let cand = [];
    for (let i = 1; i < g.length; i++) {
        let p = project(st.point, g[i - 1].p, g[i].p);
        if (p.d < 80)
            cand.push({ s: g[i - 1].s + (g[i].s - g[i - 1].s) * p.t, d: p.d });
    }
    cand.sort((a, b) => a.s - b.s);
    if (!cand.length)
        throw Error('No official station path ' + st.name);
    let prev = rows.at(-1);
    for (let c of cand) {
        c.cost = c.d * c.d;
        c.prev = -1;
        if (prev) {
            let best = Infinity;
            for (let j = 0; j < prev.length; j++)
                if (prev[j].s <= c.s + 1 && prev[j].cost < best) {
                    best = prev[j].cost;
                    c.prev = j;
                }
            c.cost += best;
        }
    }
    rows.push(cand);
} let index = rows.at(-1).reduce((a, c, i, v) => c.cost < v[a].cost ? i : a, 0), out = []; for (let i = rows.length - 1; i >= 0; i--) {
    let c = rows[i][index];
    if (!Number.isFinite(c.cost))
        throw Error('Station path order ' + stops[i].name);
    out.push(c);
    index = c.prev;
} return out.reverse(); }
// 공식 GPS 진행 순서와 방향을 함께 대조한다. 연결 비용은 공유 OSM 노드의 합법 방향 경로에서 계산한다.
function match(guide, name) {
    let g = line(guide), obs = [];
    for (let s = 0; s < g.at(-1).s; s += 14)
        obs.push({ p: at(g, s), s });
    obs.push({ p: g.at(-1).p, s: g.at(-1).s });
    let rows = [];
    for (let oi = 0; oi < obs.length; oi++) {
        let o = obs[oi], ahead = obs[Math.min(oi + 1, obs.length - 1)].p, back = obs[Math.max(oi - 1, 0)].p, hd = [ahead[0] - back[0], ahead[1] - back[1]], hl = Math.hypot(...hd) || 1;
        let cs = edges.map(e => { let p = project(o.p, e.p, e.q), dot = ((e.q[0] - e.p[0]) * hd[0] + (e.q[1] - e.p[1]) * hd[1]) / (e.len * hl); return { e, t: p.t, d: p.d, emit: (p.d / 6) ** 2 + 3 * (1 - dot) }; }).filter(c => c.d < 42).sort((a, b) => a.emit - b.emit).slice(0, 9);
        if (!cs.length)
            throw Error(`${name}: no road observation ${oi} ${o.p}`);
        let prev = rows.at(-1);
        for (let c of cs) {
            c.cost = c.emit;
            c.prev = -1;
            c.between = [];
            if (prev) {
                let best = Infinity, expected = o.s - obs[oi - 1].s;
                for (let j = 0; j < prev.length; j++) {
                    let p = prev[j], len, es;
                    if (p.e.idx === c.e.idx && c.t >= p.t - .001) {
                        len = (c.t - p.t) * c.e.len;
                        es = [];
                    }
                    else {
                        es = middle(p.e.b, c.e.a);
                        if (!es)
                            continue;
                        len = (1 - p.t) * p.e.len + es.reduce((n, e) => n + e.len, 0) + c.t * c.e.len;
                    }
                    if (len > expected + 140)
                        continue;
                    let sequence = [p.e, ...es, c.e], reversal = sequence.some((e, k) => k && e.b === sequence[k - 1].a && e.a === sequence[k - 1].b);
                    let score = p.cost + Math.abs(len - expected) / 5 + len * .006 + (reversal ? 1000 : 0);
                    if (score < best) {
                        best = score;
                        c.prev = j;
                        c.between = es;
                    }
                }
                c.cost += best;
            }
        }
        if (cs.every(c => !Number.isFinite(c.cost)))
            throw Error(`${name}: disconnected at ${oi} ${JSON.stringify(o.p)}`);
        rows.push(cs);
    }
    let index = rows.at(-1).reduce((a, c, i, v) => c.cost < v[a].cost ? i : a, 0), chosen = [];
    for (let i = rows.length - 1; i >= 0; i--) {
        let c = rows[i][index];
        chosen.push(c);
        index = c.prev;
    }
    chosen.reverse();
    let route = [chosen[0].e];
    for (let i = 1; i < chosen.length; i++) {
        let c = chosen[i], p = chosen[i - 1];
        if (c.e.idx !== p.e.idx || c.t < p.t - .001) {
            route.push(...c.between, c.e);
        }
    }
    return { route, maxMatch: Math.max(...chosen.map(c => c.d)), meanMatch: chosen.reduce((n, c) => n + c.d, 0) / chosen.length, observations: obs.length };
}
const defs = [['5511', 'out', 5, 20, '1'], ['5511', 'in', 56, 73, '2'], ['5513', 'out', 1, 8, '1'], ['5513', 'in', 37, 44, '2'], ['5516', 'out', 5, 17, '1'], ['5516', 'in', 57, 71, '2'], ['관악02-1', 'campus', 10, 31, null], ['관악02-2', 'campus', 10, 26, null]];
let result = [];
for (let [name, suffix, first, last, flag] of defs) {
    let r = official.find(r => r.name === name), p = r.path.filter(p => !flag || p.flag === flag).map(p => p.point), g = line(p), stops = r.stops.filter(s => s.seq >= first && s.seq <= last), progress = stationProgress(g, stops);
    const entryExtension = name.startsWith('관악') ? 260 : ((name === '5511' && suffix === 'in') || (name === '5516' && suffix === 'out')) ? 380 : name === '5513' && suffix === 'out' ? 80 : 180;
    const exitExtension = name.startsWith('관악') ? 210 : ((name === '5513' && suffix === 'out') || (name === '5516' && suffix === 'in')) ? 400 : (name === '5511' && suffix === 'out') || (name === '5516' && suffix === 'out') ? 110 : 80;
    let start = Math.max(0, progress[0].s - entryExtension), end = Math.min(g.at(-1).s, progress.at(-1).s + exitExtension);
    let guide = [at(g, start), ...g.filter(x => x.s > start && x.s < end).map(x => x.p), at(g, end)];
    let m = match(guide, name + '-' + suffix);
    console.log(name, suffix, 'segments', m.route.length, 'length', m.route.reduce((n, e) => n + e.len, 0).toFixed(0), 'max', m.maxMatch.toFixed(1));
    result.push({ id: name + '-' + suffix, label: name, service: 'route-bus', operation: 'boundary', vehicleCount: 1, sources: r.sources, segments: m.route.map(e => ({ roadId: e.road.id, segmentIndex: e.segmentIndex, direction: e.direction, ...(e.road.width < 6 ? { allowNarrow: true } : {}) })), stops: [], _stops: stops, _guide: guide, _stats: { max: m.maxMatch, mean: m.meanMatch }, _edges: m.route });
}
// 노천강당의 현 정류장과 원형 차도를 우선하고 공식 선형에만 남은 골목 왕복은 보류한다.
for (const r of result.filter(r => r.label === '관악02-1')) {
    const stack = [];
    for (const e of r._edges) {
        const p = stack.at(-1);
        if (p && p.a === e.b && p.b === e.a)
            stack.pop();
        else
            stack.push(e);
    }
    r._edges = stack;
}
const cityLoop = result.find(r => r.id === '5516-in'), shuttle = read('public/data/shuttle-stops.json');
const begin = cityLoop._edges.findIndex(e => e.road.id === 'way/468202819/405' && e.segmentIndex === 2 && e.direction === 1), finish = cityLoop._edges.findIndex(e => e.road.id === 'way/847953679/501' && e.segmentIndex === 18 && e.direction === 1);
const loopBase = { ...cityLoop, _edges: cityLoop._edges.slice(begin, finish) };
const closing = middle(loopBase._edges.at(-1).b, loopBase._edges[0].a);
result.push({ id: 'snu-campus-circular', label: '교내 순환 셔틀', service: 'shuttle', operation: 'boundary', vehicleCount: 2, sources: [shuttle.route.stopSequenceSource, shuttle.route.positionSource], _edges: [...loopBase._edges, ...closing], _stops: [...shuttle.stops, shuttle.stops[0]].map(s => ({ id: s.id, name: s.name, point: [s.officialPosition.x, s.officialPosition.z], seq: s.routeOrder })), _stats: { ...loopBase._stats, closureLength: closing.reduce((n, e) => n + e.len, 0) }, _guide: loopBase._guide });
// 회전 곡선으로 정차점이 밀리지 않도록 직선 구간으로 제한하고 원래 위치와의 차이를 기록한다.
function placeStops(r) {
    let rows = [];
    for (const stop of r._stops) {
        let cs = [];
        for (let i = 0; i < r._edges.length; i++) {
            let e = r._edges[i], prev = r._edges[i - 1] ?? (r.operation === 'loop' ? r._edges.at(-1) : null), next = r._edges[i + 1] ?? (r.operation === 'loop' ? r._edges[0] : null), lo = prev ? Math.min(7, prev.len * .32, e.len * .32) : 0, hi = e.len - (next ? Math.min(7, e.len * .32, next.len * .32) : 0), p = project(stop.point, e.p, e.q), distance = Math.max(lo, Math.min(hi, p.t * e.len)), lane = e.road.oneway && e.road.width < 7 ? 0 : Math.min(3.1, Math.max(1.05, e.road.width * .23)), dx = (e.q[0] - e.p[0]) / e.len, dz = (e.q[1] - e.p[1]) / e.len, q = [e.p[0] + dx * distance + dz * lane, e.p[1] + dz * distance - dx * lane], error = dist(q, stop.point);
            if (error < 90)
                cs.push({ i, distance, point: q, error, cost: error * error, prev: -1 });
        }
        const prev = rows.at(-1);
        if (prev)
            for (const c of cs) {
                let best = Infinity;
                for (let j = 0; j < prev.length; j++) {
                    let p = prev[j];
                    if ((p.i < c.i || (p.i === c.i && p.distance < c.distance - 1)) && p.cost < best) {
                        best = p.cost;
                        c.prev = j;
                    }
                }
                c.cost += best;
            }
        if (!cs.length || cs.every(c => !Number.isFinite(c.cost)))
            throw Error(r.id + ' unmatched ordered stop ' + stop.name);
        rows.push(cs);
    }
    let idx = rows.at(-1).reduce((a, c, i, v) => c.cost < v[a].cost ? i : a, 0), out = [];
    for (let i = rows.length - 1; i >= 0; i--) {
        let c = rows[i][idx];
        out.push({ ...c, official: r._stops[i] });
        idx = c.prev;
    }
    out.reverse();
    r.stops = out.map(c => ({ stopId: c.official.id, routeSegmentIndex: c.i, distance: +c.distance.toFixed(6), dwellSeconds: r.service === 'shuttle' ? 8 : 6 }));
    r._stopMatches = out.map(({ cost, prev, ...c }) => c);
    r.segments = r._edges.map(e => ({ roadId: e.road.id, segmentIndex: e.segmentIndex, direction: e.direction, ...(e.road.width < 6 ? { allowNarrow: true } : {}) }));
}
for (const r of result) {
    placeStops(r);
    console.log(r.id, 'stops', r.stops.length, 'max stop error', Math.max(...r._stopMatches.map(s => s.error)).toFixed(2));
}
// 노선 진행 순서와 원본 공유 노드, 일방통행을 마지막으로 다시 검사한다.
for (const r of result) {
    for (let i = 0; i < r._edges.length; i++) {
        const e = r._edges[i], p = r._edges[i - 1];
        if (p && p.b !== e.a)
            throw Error(r.id + ' disconnected');
        if (p && p.a === e.b)
            throw Error(r.id + ' immediate reversal');
        if (e.road.oneway && e.direction < 0)
            throw Error(r.id + ' forbidden one-way');
    }
}
const used = new Set(result.flatMap(r => r.segments.map(s => s.roadId))), supplementalRoads = roads.filter(r => r.sourceWay && used.has(r.id));
write('artifacts/bus-route-review/draft-plan.json', { routes: result.map(({ _edges, ...r }) => r), supplementalRoads });
const sourceHashes = Object.fromEntries(['public/data/campus.json', 'sources/campus.osm', 'sources/transit-official-routes.json', 'public/data/shuttle-stops.json'].map(p => [p, crypto.createHash('sha256').update(fs.readFileSync(new URL(p, root))).digest('hex')]));
write('public/data/campus-transit.json', { schemaVersion: 1, sourceSnapshot: { date: snapshot.retrieval, hashes: sourceHashes }, routes: result.map(({ _edges, _stops, _guide, _stats, _stopMatches, ...r }) => r), supplementalRoads });
write('artifacts/bus-route-review/compiler-review.json', { sourceHashes, routes: result.map(r => ({ id: r.id, ...r._stats, length: r._edges.reduce((n, e) => n + e.len, 0), stops: r._stopMatches })), supplementalRoads: supplementalRoads.map(r => ({ id: r.id, sourceUrl: r.sourceUrl, sourceTags: r.sourceTags })) });
