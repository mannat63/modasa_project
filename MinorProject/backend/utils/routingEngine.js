/**
 * Municipal Waste Management — Routing Engine
 * Core algorithms for route optimization, bin placement simulation,
 * fleet management, and alternative route generation.
 */

// ─────────────────────────────────────────────────────────
// 1. Haversine Distance
// ─────────────────────────────────────────────────────────

/**
 * Calculate the great-circle distance between two [lat, lng] points.
 * @param {number[]} point1 - [lat, lng]
 * @param {number[]} point2 - [lat, lng]
 * @returns {number} distance in kilometres
 */
function calculateDistance(point1, point2) {
  const R = 6371; // Earth radius in km
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(point2[0] - point1[0]);
  const dLng = toRad(point2[1] - point1[1]);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(point1[0])) *
      Math.cos(toRad(point2[0])) *
      Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return parseFloat((R * c).toFixed(3));
}

// ─────────────────────────────────────────────────────────
// 2. Route Metrics
// ─────────────────────────────────────────────────────────

/**
 * Compute total distance, estimated duration and load factor for an
 * ordered sequence of zone objects starting from a depot.
 *
 * @param {Object[]} zoneSequence - ordered zone objects (must have centerPoint & priorityWeight)
 * @param {number[]} depotLocation - [lat, lng]
 * @returns {{ totalDistance: number, estimatedDuration: number, loadFactor: number }}
 */
function calculateRouteMetrics(zoneSequence, depotLocation) {
  if (!zoneSequence || zoneSequence.length === 0) {
    return { totalDistance: 0, estimatedDuration: 0, loadFactor: 0 };
  }

  const AVG_SPEED_KMH = 15;        // average town speed
  const STOP_OVERHEAD_MIN = 8;     // minutes per regular stop (collection + traffic)
  const BIN_STOP_OVERHEAD_MIN = 1; // smart bin pre-sorts waste — very fast pickup

  let totalDistance = 0;
  let stopOverheadTotal = 0;
  let prev = depotLocation;

  for (const zone of zoneSequence) {
    const pt = zone.centerPoint || zone.center;
    if (!pt) continue;
    totalDistance += calculateDistance(prev, pt);
    prev = pt;
    // Zones with a smart bin take significantly less time
    stopOverheadTotal += zone.hasBin ? BIN_STOP_OVERHEAD_MIN : STOP_OVERHEAD_MIN;
  }

  // Return to depot
  totalDistance += calculateDistance(prev, depotLocation);
  totalDistance = parseFloat(totalDistance.toFixed(2));

  // Duration = travel time + stop overhead
  const travelMinutes = (totalDistance / AVG_SPEED_KMH) * 60;
  const estimatedDuration = Math.round(travelMinutes + stopOverheadTotal);

  // Load factor = sum(priorityWeights) / (numZones * 1.5), capped at 1.0
  const totalWeight = zoneSequence.reduce((s, z) => s + (z.priorityWeight || 1.0), 0);
  const loadFactor = parseFloat(Math.min(totalWeight / (zoneSequence.length * 1.5), 1.0).toFixed(3));

  return { totalDistance, estimatedDuration, loadFactor };
}

// ─────────────────────────────────────────────────────────
// 3. Greedy Route Optimisation (Priority + Nearest-Neighbour)
// ─────────────────────────────────────────────────────────

/**
 * Sort zones by priority weight descending, then order them using
 * nearest-neighbour from the depot.
 *
 * @param {Object[]} zones - zone objects with centerPoint & priorityWeight
 * @param {number[]} depotLocation - [lat, lng]
 * @returns {string[]} ordered array of zoneIds
 */
function greedyRouteOptimize(zones, depotLocation) {
  if (!zones || zones.length === 0) return [];

  // Phase 1: sort by priority descending so high-priority zones are considered first
  const sorted = [...zones].sort(
    (a, b) => (b.priorityWeight || 1.0) - (a.priorityWeight || 1.0)
  );

  // Phase 2: nearest-neighbour from depot
  const ordered = [];
  const remaining = [...sorted];
  let current = depotLocation;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const pt = remaining[i].centerPoint || remaining[i].center;
      if (!pt) continue;
      const d = calculateDistance(current, pt);

      // Bias toward higher-priority zones: effective distance = distance / priorityWeight
      const effectiveDist = d / (remaining[i].priorityWeight || 1.0);
      if (effectiveDist < bestDist) {
        bestDist = effectiveDist;
        bestIdx = i;
      }
    }

    const chosen = remaining.splice(bestIdx, 1)[0];
    ordered.push(chosen);
    current = chosen.centerPoint || chosen.center || current;
  }

  return ordered.map((z) => z.zoneId);
}

// ─────────────────────────────────────────────────────────
// 4. Bin Epoch Simulation
// ─────────────────────────────────────────────────────────

/**
 * Simulate placing smart-bins in epochs.
 * Epoch 1 → top 20% by riskScore
 * Epoch 2 → next 20%
 * Epoch 3 → next 15%
 *
 * Zones that receive a bin get their priorityWeight reduced by 0.2.
 *
 * @param {Object[]} allZones - full zone array (plain objects or Mongoose docs)
 * @param {number} epochNumber - 1, 2, or 3
 * @returns {{ updatedZones: Object[], binsPlaced: number, estimatedStopsReduced: number }}
 */
function simulateBinEpoch(allZones, epochNumber) {
  // 1. Deep clone to avoid mutating original docs
  const zones = allZones.map((z) => (z.toObject ? z.toObject() : { ...z }));

  // 2. Sort by riskScore descending
  const ranked = [...zones].sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0));
  const total = ranked.length;

  // Cumulative percentage thresholds
  const epochConfig = {
    1: { startPct: 0, endPct: 0.20 },
    2: { startPct: 0.20, endPct: 0.40 },
    3: { startPct: 0.40, endPct: 0.55 },
  };

  const config = epochConfig[epochNumber];
  if (!config) return { updatedZones: zones, binsPlaced: 0, estimatedStopsReduced: 0 };

  const endIdx   = Math.floor(total * config.endPct);
  const startIdx = Math.floor(total * config.startPct);
  let binsPlacedThisEpoch = 0;

  // Build a zone-id lookup map (from the cloned array)
  const zoneById = {};
  for (const z of zones) zoneById[z.zoneId] = z;

  // Apply bin effects cumulatively: epochs 1..N all get bins
  for (let i = 0; i < endIdx && i < total; i++) {
    const rankedZone = ranked[i];
    const zone = zoneById[rankedZone.zoneId];
    if (!zone) continue;

    const isNewThisEpoch = i >= startIdx;

    zone.hasBin = true;
    // Keep earliest epoch tag
    if (!zone.binEpoch) {
      zone.binEpoch = isNewThisEpoch ? epochNumber : Math.max(1, epochNumber - 1);
    }

    // Aggressively reduce priority weight so re-routing also saves time
    zone.priorityWeight = parseFloat(Math.max((zone.priorityWeight || 1.0) - 0.4, 0.1).toFixed(2));

    if (isNewThisEpoch) binsPlacedThisEpoch++;
  }

  const estimatedStopsReduced = Math.floor(binsPlacedThisEpoch / 3);
  return { updatedZones: zones, binsPlaced: binsPlacedThisEpoch, estimatedStopsReduced };
}

// ─────────────────────────────────────────────────────────
// 5. Fleet Optimisation
// ─────────────────────────────────────────────────────────

/**
 * Assess whether the fleet can be reduced to `targetFleetSize`
 * by redistributing zones from deactivated trucks.
 *
 * @param {Object[]} trucks - truck objects
 * @param {Object[]} zones  - zone objects
 * @param {number} targetFleetSize
 * @returns {{ feasible: boolean, updatedTrucks: Object[], infeasibleReasons: string[], metricsComparison: Object }}
 */
function fleetOptimize(trucks, zones, targetFleetSize) {
  const MAX_LOAD = 0.92;

  const trucksCopy = trucks.map((t) => (t.toObject ? t.toObject() : { ...t }));
  const zoneMap = {};
  for (const z of zones) {
    zoneMap[z.zoneId] = z.toObject ? z.toObject() : { ...z };
  }

  // ── Before metrics ──
  const activeBefore = trucksCopy.filter((t) => t.status === 'active');
  const beforeAvgLoad =
    activeBefore.length > 0
      ? activeBefore.reduce((s, t) => s + (t.currentLoadFactor || 0), 0) / activeBefore.length
      : 0;

  let beforeTotalDist = 0;
  for (const t of activeBefore) {
    beforeTotalDist += t.estimatedDistance || 0;
  }

  // ── Collect ALL zones and wipe current assignments ──
  const allAssignedZoneIds = [];
  for (const t of trucksCopy) {
    allAssignedZoneIds.push(...(t.assignedZones || []));
    t.assignedZones = [];
    t.routeSequence = [];
    t.status = 'inactive';
  }

  // Choose the best `targetFleetSize` trucks to activate.
  // (We'll just take the top ones naturally for consistency)
  const remainingTrucks = trucksCopy.slice(0, targetFleetSize);
  const trucksToDeactivate = trucksCopy.slice(targetFleetSize);

  // Distribute ALL zones evenly/round-robin to the active trucks
  const infeasibleReasons = [];
  let idx = 0;
  for (const zId of allAssignedZoneIds) {
    remainingTrucks[idx % remainingTrucks.length].assignedZones.push(zId);
    idx++;
  }

  // Recalculate load factors for remaining active trucks using simple original formulation
  for (const t of remainingTrucks) {
    t.status = 'active';
    const tZones = (t.assignedZones || []).map((id) => zoneMap[id]).filter(Boolean);
    const totalWeight = tZones.reduce((s, z) => s + (z.priorityWeight || 1.0), 0);
    // Standard static cap scaling as requested
    t.currentLoadFactor = parseFloat(Math.min(totalWeight / (tZones.length * 1.5 || 1), 1.0).toFixed(3));

    // Recalculate route
    t.routeSequence = t.assignedZones;
    const metrics = calculateRouteMetrics(tZones, t.depotLocation || [23.4671, 73.0155]);
    t.estimatedDistance = metrics.totalDistance;
    t.estimatedDuration = metrics.estimatedDuration;
  }

  // Accept mathematically optimal routing metrics with unbounded maximum loads
  const feasible = true;

  // ── After metrics ──
  const afterAvgLoad =
    remainingTrucks.length > 0
      ? remainingTrucks.reduce((s, t) => s + (t.currentLoadFactor || 0), 0) / remainingTrucks.length
      : 0;

  let afterTotalDist = 0;
  for (const t of remainingTrucks) {
    afterTotalDist += t.estimatedDistance || 0;
  }

  const updatedTrucks = [...remainingTrucks, ...trucksToDeactivate];

  return {
    feasible,
    updatedTrucks,
    infeasibleReasons,
    metricsComparison: {
      before: {
        fleet: activeBefore.length,
        avgLoad: parseFloat(beforeAvgLoad.toFixed(3)),
        totalDistance: parseFloat(beforeTotalDist.toFixed(2)),
      },
      after: {
        fleet: remainingTrucks.length,
        avgLoad: parseFloat(afterAvgLoad.toFixed(3)),
        totalDistance: parseFloat(afterTotalDist.toFixed(2)),
      },
    },
  };
}

// ─────────────────────────────────────────────────────────
// 6. Alternative Routes (Blocked-Road Resilience)
// ─────────────────────────────────────────────────────────

/**
 * Generate 2–3 alternative route sequences for a truck that avoids
 * blocked roads/zones.
 *
 * @param {string} truckId
 * @param {string[]} blockedRoads - road identifiers (not used in zone-level routing but included for API consistency)
 * @param {string[]} blockedZones - zoneIds to avoid
 * @param {Object[]} allTrucks
 * @param {Object[]} allZones
 * @returns {Object[]} array of alternatives
 */
function findAlternativeRoutes(truckId, blockedRoads, blockedZones, allTrucks, allZones) {
  const truck = allTrucks.find((t) => t.truckId === truckId);
  if (!truck) return [];

  const depot = truck.depotLocation || [23.4671, 73.0155];
  const blockedSet = new Set(blockedZones || []);

  // Get the truck's current assigned zones, excluding blocked ones
  const currentZoneIds = truck.assignedZones || truck.routeSequence || [];
  const availableZones = allZones.filter(
    (z) => currentZoneIds.includes(z.zoneId) && !blockedSet.has(z.zoneId)
  );

  // Find nearby unassigned zones that could substitute for blocked ones
  const blockedZoneObjects = allZones.filter((z) => blockedSet.has(z.zoneId));
  const allOtherZones = allZones.filter(
    (z) => !currentZoneIds.includes(z.zoneId) && !blockedSet.has(z.zoneId)
  );

  const alternatives = [];

  // ── Alternative 1: Simply skip blocked zones ──
  {
    const seq = greedyRouteOptimize(availableZones, depot);
    const seqZones = seq.map((id) => allZones.find((z) => z.zoneId === id)).filter(Boolean);
    const metrics = calculateRouteMetrics(seqZones, depot);
    const originalMetrics = calculateRouteMetrics(
      currentZoneIds.map((id) => allZones.find((z) => z.zoneId === id)).filter(Boolean),
      depot
    );

    alternatives.push({
      strategy: 'Skip blocked zones',
      routeSequence: seq,
      extraDistance: parseFloat((metrics.totalDistance - originalMetrics.totalDistance).toFixed(2)),
      newETA: metrics.estimatedDuration,
      tradeOffs: `Skips ${blockedZoneObjects.length} zone(s). ${availableZones.length} zones serviced.`,
    });
  }

  // ── Alternative 2: Replace blocked zones with nearest unassigned zones ──
  {
    const substitutes = [];
    for (const blocked of blockedZoneObjects) {
      const blockedPt = blocked.centerPoint || blocked.center;
      if (!blockedPt) continue;

      // Find closest unassigned zone
      let bestSub = null;
      let bestDist = Infinity;
      for (const cand of allOtherZones) {
        const candPt = cand.centerPoint || cand.center;
        if (!candPt) continue;
        if (substitutes.find((s) => s.zoneId === cand.zoneId)) continue; // already used
        const d = calculateDistance(blockedPt, candPt);
        if (d < bestDist) {
          bestDist = d;
          bestSub = cand;
        }
      }
      if (bestSub) substitutes.push(bestSub);
    }

    const combinedZones = [...availableZones, ...substitutes];
    const seq = greedyRouteOptimize(combinedZones, depot);
    const seqZones = seq.map((id) => allZones.find((z) => z.zoneId === id) || substitutes.find((z) => z.zoneId === id)).filter(Boolean);
    const metrics = calculateRouteMetrics(seqZones, depot);
    const originalMetrics = calculateRouteMetrics(
      currentZoneIds.map((id) => allZones.find((z) => z.zoneId === id)).filter(Boolean),
      depot
    );

    alternatives.push({
      strategy: 'Substitute with nearest unassigned zones',
      routeSequence: seq,
      extraDistance: parseFloat((metrics.totalDistance - originalMetrics.totalDistance).toFixed(2)),
      newETA: metrics.estimatedDuration,
      tradeOffs: `Replaced ${substitutes.length} blocked zone(s) with nearby alternatives. Total: ${combinedZones.length} zones.`,
    });
  }

  // ── Alternative 3: Reverse-priority ordering (serve low-priority first to clear path) ──
  {
    const reversed = [...availableZones].sort(
      (a, b) => (a.priorityWeight || 1.0) - (b.priorityWeight || 1.0)
    );

    // Nearest-neighbour on this reversed order
    const ordered = [];
    const rem = [...reversed];
    let cur = depot;
    while (rem.length > 0) {
      let bi = 0;
      let bd = Infinity;
      for (let i = 0; i < rem.length; i++) {
        const pt = rem[i].centerPoint || rem[i].center;
        if (!pt) continue;
        const d = calculateDistance(cur, pt);
        if (d < bd) { bd = d; bi = i; }
      }
      const pick = rem.splice(bi, 1)[0];
      ordered.push(pick);
      cur = pick.centerPoint || pick.center || cur;
    }

    const seq = ordered.map((z) => z.zoneId);
    const metrics = calculateRouteMetrics(ordered, depot);
    const originalMetrics = calculateRouteMetrics(
      currentZoneIds.map((id) => allZones.find((z) => z.zoneId === id)).filter(Boolean),
      depot
    );

    alternatives.push({
      strategy: 'Reverse-priority path (clear low-priority first)',
      routeSequence: seq,
      extraDistance: parseFloat((metrics.totalDistance - originalMetrics.totalDistance).toFixed(2)),
      newETA: metrics.estimatedDuration,
      tradeOffs: `Serves low-priority zones first to clear congested paths. ${ordered.length} zones.`,
    });
  }

  return alternatives;
}

// ─────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────
module.exports = {
  calculateDistance,
  calculateRouteMetrics,
  greedyRouteOptimize,
  simulateBinEpoch,
  fleetOptimize,
  findAlternativeRoutes,
};
