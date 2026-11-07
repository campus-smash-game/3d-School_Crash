/** 로드뷰와 준공 사진에 맞춘 게임용 기준이다. 지도 좌표와 높이를 현장 측량값으로 보지 않는다. */
export const ENGINEERING_CONNECTION_SITE = {
  road: [[321.83,-2018.04],[321.1,-1981.61],[319.69,-1949.6],[319.64,-1944.08],[319.21,-1925.07],[318.13,-1903],[317.28,-1872.78],[316.5,-1825.11],[315.76,-1789.99],[317.24,-1772.64],[317.83,-1768.96],[324.77,-1754.5],[336.86,-1732.7],[345.15,-1714.68],[346.31,-1711.34],[349.59,-1704.36]] as [number, number][],
  roadWidth: 12.8,
  anchor: { x: 315.8214, z: -1792.902658 },
  bridgeAboveRoad: 6.1,
  door301BelowBridge: 3.2,
  atrium301AboveDoor: 5.54,
  atrium301AboveDatum: .30,
  entry303AboveDatum: 3.8,
  southLimit: -1982,
  northLimit: -1694,
  roadProfileSouth: -1944.08,
  roadProfileNorth: -1740,
};

export function engineering301303Datum(heightAt: (x: number, z: number) => number) {
  const p = ENGINEERING_CONNECTION_SITE, road = heightAt(p.anchor.x, p.anchor.z), bridge = road + p.bridgeAboveRoad;
  const entry301 = bridge - p.door301BelowBridge, atrium301 = entry301 + p.atrium301AboveDoor;
  return { road, bridge, entry301, atrium301, base301: atrium301 - p.atrium301AboveDatum, base303: bridge - p.entry303AboveDatum, lower303: road + .12 };
}

export function engineeringRoadProjection(x: number, z: number) {
  let best = { x: 0, z: 0, distance: Infinity, signed: 0 };
  const points = ENGINEERING_CONNECTION_SITE.road;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dx = b[0] - a[0], dz = b[1] - a[1], sq = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / sq));
    const px = a[0] + t * dx, pz = a[1] + t * dz, distance = Math.hypot(x - px, z - pz);
    if (distance < best.distance) best = { x: px, z: pz, distance, signed: ((x - px) * dz - (z - pz) * dx) / Math.sqrt(sq) };
  }
  return best;
}
