type XZ = [number, number];
export const HUMANITIES23 = {
  buildingId: 'way/167983080', neighborId: 'way/167983609', stairRoad: 'way/456540177/311', bridgeRoad: 'way/167983607/58',
  lower: [428.4, -658.45] as XZ, upper: [446, -677.6] as XZ,
  bridgeA: [429.99, -663.21] as XZ, bridgeB: [436.14, -658.9] as XZ,
};
export function humanities23Frame(a: XZ, b: XZ) {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / length, dz = (b[1] - a[1]) / length;
  return { length, point: (s: number, n = 0): XZ => [a[0] + dx * s - dz * n, a[1] + dz * s + dx * n], local: (p: XZ) => ({ s: (p[0] - a[0]) * dx + (p[1] - a[1]) * dz, n: -(p[0] - a[0]) * dz + (p[1] - a[1]) * dx }) };
}
export function getHumanities23Layout(heightAt: (x: number, z: number) => number) {
  const stair = humanities23Frame(HUMANITIES23.lower, HUMANITIES23.upper), bridge = humanities23Frame(HUMANITIES23.bridgeA, HUMANITIES23.bridgeB);
  const entry = humanities23Frame([425.94, -687.77], [429.27, -676.47]);
  const base = heightAt(397.36, -668.1492307692308), entryFloor = heightAt(...entry.point(7.5, -1.2)) + .46;
  return { stair, bridge, entry, base, bridgeFloor: base + 7, bridgeRoof: base + 10.25, entryFloor, bridgeWidth: 3.2 };
}
export function getHumanities23Openings(buildingId: string, points: XZ[], heightAt: (x: number, z: number) => number) {
  if (![HUMANITIES23.buildingId, HUMANITIES23.neighborId].includes(buildingId)) return [];
  const q = getHumanities23Layout(heightAt), openings: { buildingId: string; edgeIndex: number; a: XZ; b: XZ; bottom: number; top: number }[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i], b = points[i + 1], pa = q.bridge.local(a), pb = q.bridge.local(b);
    let low = 0, high = 1;
    for (const [start, end, min, max] of [[pa.s, pb.s, -3.7, q.bridge.length + 2.5], [pa.n, pb.n, -1.6, 1.6]]) {
      if (Math.abs(end - start) < 1e-9) { if (start < min || start > max) high = -1; }
      else { const t = [(min - start) / (end - start), (max - start) / (end - start)].sort((x, y) => x - y); low = Math.max(low, t[0]); high = Math.min(high, t[1]); }
    }
    if (high > low) { const at = (t: number): XZ => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; openings.push({ buildingId, edgeIndex: i, a: at(low), b: at(high), bottom: q.bridgeFloor - .12, top: q.bridgeRoof }); }
  }
  if (buildingId === HUMANITIES23.buildingId) openings.push({ buildingId, edgeIndex: 5, a: q.entry.point(6.25), b: q.entry.point(8.75), bottom: q.entryFloor - .15, top: q.entryFloor + 2.9 });
  return openings;
}
