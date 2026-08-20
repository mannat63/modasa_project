/**
 * Compute straight-line distance (km) between two [lat, lng] points.
 */
export function haversine([lat1, lng1], [lat2, lng2]) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Nearest-neighbour greedy route from depot through zones.
 * Returns ordered array of zone objects.
 */
export function greedyRoute(depot, zones) {
  if (!zones.length) return [];
  const remaining = [...zones];
  const ordered = [];
  let current = depot;

  while (remaining.length) {
    let minDist = Infinity;
    let nearest = null;
    let nearestIdx = -1;

    remaining.forEach((z, i) => {
      if (!z.centerPoint?.length) return;
      const d = haversine(current, z.centerPoint);
      if (d < minDist) { minDist = d; nearest = z; nearestIdx = i; }
    });

    if (!nearest) break;
    ordered.push(nearest);
    current = nearest.centerPoint;
    remaining.splice(nearestIdx, 1);
  }
  return ordered;
}

/**
 * Total route distance in km (depot -> zones in order -> back to depot).
 */
export function totalRouteDistance(depot, orderedZones) {
  if (!orderedZones.length) return 0;
  let dist = 0;
  let prev = depot;
  for (const z of orderedZones) {
    if (!z.centerPoint?.length) continue;
    dist += haversine(prev, z.centerPoint);
    prev = z.centerPoint;
  }
  dist += haversine(prev, depot);
  return +dist.toFixed(2);
}

/**
 * Estimate duration in minutes at average 30 km/h + 10 min per stop.
 */
export function estimateDuration(distanceKm, stopCount) {
  return Math.round((distanceKm / 30) * 60 + stopCount * 10);
}

/**
 * Sort zones by priority score descending.
 * Score = priorityWeight * (riskScore ?? 0) * (visualSeverity ?? 1) / 5
 */
export function sortByPriority(zones) {
  return [...zones].sort((a, b) => {
    const scoreA = (a.priorityWeight ?? 1) * (a.riskScore ?? 0) * ((a.visualSeverity ?? 1) / 5);
    const scoreB = (b.priorityWeight ?? 1) * (b.riskScore ?? 0) * ((b.visualSeverity ?? 1) / 5);
    return scoreB - scoreA;
  });
}

/**
 * Return a colour hex for a zone based on riskScore.
 */
export function riskColour(score) {
  if (score == null) return '#6b7280';
  if (score >= 0.75) return '#ef4444';
  if (score >= 0.5)  return 'var(--warn)';
  if (score >= 0.25) return 'var(--warn)';
  return '#22c55e';
}

/**
 * Return status badge colour for truck status.
 */
export function truckStatusColour(status) {
  switch (status) {
    case 'active':   return '#22c55e';
    case 'standby':  return 'var(--warn)';
    case 'inactive': return '#ef4444';
    default:         return '#6b7280';
  }
}
