import { humanities23Frame } from './humanities23Site';
type XZ = [number, number];
export const HUMANITIES35 = {
  buildingId: 'way/167983611', neighborId: 'way/167983609', bridgeRoad: 'way/167983610/59', groundRoad: 'way/456540180/312',
  bridgeA: [458.58, -644.78] as XZ, bridgeB: [470.59, -652.28] as XZ,
  groundPath: [[446, -677.6], [490.65, -599.63], [492.25, -596.84]] as XZ[],
};
export function getHumanities35Layout(heightAt: (x: number, z: number) => number) {
  const bridge = humanities23Frame(HUMANITIES35.bridgeA, HUMANITIES35.bridgeB), entry = humanities23Frame([464.16, -668.1], [477.81, -679.36]);
  const base3 = heightAt(458.34, -622.3714285714286), base5 = heightAt(489.583, -639.253);
  const entryFloor = Math.max(heightAt(...entry.point(1, -1)), heightAt(...entry.point(11, -1))) + .3;
  return { bridge, entry, base3, base5, bridgeFloor: base3 + 10.5, bridgeRoof: base3 + 13.35, entryFloor, bridgeWidth: 2.8 };
}
export function getHumanities35Openings(buildingId: string, points: XZ[], heightAt: (x: number, z: number) => number) {
  if (![HUMANITIES35.buildingId, HUMANITIES35.neighborId].includes(buildingId)) return [];
  const q = getHumanities35Layout(heightAt), openings: { buildingId: string; edgeIndex: number; a: XZ; b: XZ; bottom: number; top: number }[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i], b = points[i + 1], pa = q.bridge.local(a), pb = q.bridge.local(b); let low = 0, high = 1;
    for (const [start, end, min, max] of [[pa.s, pb.s, -1.6, q.bridge.length + 1.6], [pa.n, pb.n, -1.4, 1.4]]) {
      if (Math.abs(end - start) < 1e-9) { if (start < min || start > max) high = -1; }
      else { const t = [(min - start) / (end - start), (max - start) / (end - start)].sort((x, y) => x - y); low = Math.max(low, t[0]); high = Math.min(high, t[1]); }
    }
    if (high > low) { const p = (t: number): XZ => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; openings.push({ buildingId, edgeIndex: i, a: p(low), b: p(high), bottom: q.bridgeFloor - .12, top: q.bridgeRoof - .18 }); }
  }
  if (buildingId === HUMANITIES35.buildingId) openings.push({ buildingId, edgeIndex: 1, a: q.entry.point(2), b: q.entry.point(11), bottom: q.entryFloor - .2, top: q.entryFloor + 3.2 });
  return openings;
}
