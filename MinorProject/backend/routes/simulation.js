const express = require('express');
const router = express.Router();
const Zone = require('../models/Zone');
const Truck = require('../models/Truck');
const AuditLog = require('../models/AuditLog');
const {
  simulateBinEpoch,
  fleetOptimize,
  calculateRouteMetrics,
  greedyRouteOptimize,
} = require('../utils/routingEngine');
const { buildDistFn } = require('../utils/roadDistance');
const { deployAllActiveRoutes } = require('../utils/routeDeploy');

// Build a road-distance function covering every truck depot + zone centre for
// this request. One cached OSRM matrix call per point-set; Haversine fallback.
async function roadDistFor(trucks, zones) {
  const pts = [
    ...trucks.map((t) => t.depotLocation).filter(Boolean),
    ...zones.map((z) => z.centerPoint || z.center).filter(Boolean),
  ];
  return buildDistFn(pts, { timeoutMs: 4000 });
}

// ─────────────────────────────────────────────────────────
// GET /api/simulation/epoch/:number — Simulate bin placement
// ─────────────────────────────────────────────────────────
router.get('/epoch/:number', async (req, res) => {
  try {
    const epochNumber = parseInt(req.params.number, 10);
    if (![1, 2, 3].includes(epochNumber)) {
      return res.status(400).json({ success: false, error: 'Epoch must be 1, 2, or 3' });
    }

    const allZones = await Zone.find().lean();
    const allTrucks = await Truck.find({ status: 'active' }).lean();

    // ── BASELINE: strip ALL existing bin flags so "before" is always pristine S0
    const baselineZones = allZones.map((z) => ({ ...z, hasBin: false, priorityWeight: 1.0 }));

    // ── SIMULATED: apply cumulative bins up to this epoch
    const { updatedZones, binsPlaced, estimatedStopsReduced } = simulateBinEpoch(baselineZones, epochNumber);

    // Build zone lookups
    const baselineZoneMap = {};
    for (const z of baselineZones) baselineZoneMap[z.zoneId] = z;
    const updatedZoneMap = {};
    for (const z of updatedZones) updatedZoneMap[z.zoneId] = z;

    // Zones that got bins in THIS epoch
    const affectedZones = updatedZones.filter((z) => z.hasBin && z.binEpoch === epochNumber);

    // Road-distance basis for this simulation (OSRM matrix, Haversine fallback)
    const roadDist = await roadDistFor(allTrucks, allZones);

    const truckMetrics = [];
    let totalTimeBefore = 0;
    let totalTimeAfter = 0;

    for (const truck of allTrucks) {
      const seq = truck.routeSequence || [];
      if (seq.length === 0) continue;
      const depot = truck.depotLocation || [23.47, 73.32];

      // Before: pristine zones, no bins
      const beforeZones = seq.map((id) => baselineZoneMap[id]).filter(Boolean);
      // After: zones with cumulative bins up to this epoch
      const afterZones = seq.map((id) => updatedZoneMap[id]).filter(Boolean);

      // Re-optimise the route for the simulated state
      const newSeq = greedyRouteOptimize(afterZones, depot, roadDist);
      const afterZonesOrdered = newSeq.map((id) => updatedZoneMap[id]).filter(Boolean);

      const before = calculateRouteMetrics(beforeZones, depot, roadDist);
      const after  = calculateRouteMetrics(afterZonesOrdered, depot, roadDist);

      totalTimeBefore += before.estimatedDuration;
      totalTimeAfter  += after.estimatedDuration;

      truckMetrics.push({
        truckId: truck.truckId,
        driverName: truck.driverName,
        before,
        after,
        timeSaved: Math.max(0, before.estimatedDuration - after.estimatedDuration),
      });
    }

    const totalTimeSaved = Math.max(0, totalTimeBefore - totalTimeAfter);

    // Cumulative bins = every zone that has a bin at this epoch (phases 1..N combined)
    const cumulativeBins = updatedZones.filter((z) => z.hasBin).length;
    const totalZones = updatedZones.length;
    const pctThresholds = { 1: '20%', 2: '40%', 3: '55%' };
    const explanation =
      `Epoch ${epochNumber} rolls out smart bins to the highest-risk zones. ` +
      `Bins are cumulative: by this phase the top ${pctThresholds[epochNumber]} of zones by risk score ` +
      `(${cumulativeBins} of ${totalZones}) have a bin. Binned zones pre-sort waste, so each stop takes ~1 min ` +
      `instead of ~8 min, and routes are re-optimised — saving ${totalTimeSaved} min across the fleet today.`;

    res.json({
      success: true,
      data: {
        epochNumber,
        binsPlaced,          // NEW bins added in this phase
        cumulativeBins,      // TOTAL bins after phases 1..N
        totalZones,
        explanation,
        estimatedStopsReduced,
        totalTimeSaved,
        totalTimeBefore,
        totalTimeAfter,
        affectedZones: affectedZones.map((z) => ({
          zoneId: z.zoneId,
          name: z.name,
          type: z.type,
          riskScore: z.riskScore,
          newPriorityWeight: z.priorityWeight,
        })),
        truckMetrics,
        updatedZones,
      },
    });
  } catch (err) {
    console.error('GET /simulation/epoch error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/simulation/epoch/:number/deploy — Deploy epoch to live DB
// ─────────────────────────────────────────────────────────
router.post('/epoch/:number/deploy', async (req, res) => {
  try {
    const epochNumber = parseInt(req.params.number, 10);
    if (![1, 2, 3].includes(epochNumber)) {
      return res.status(400).json({ success: false, error: 'Epoch must be 1, 2, or 3' });
    }

    // 1. Fetch zones and apply cumulative bin simulation
    const allZones = await Zone.find().lean();
    // Use pristine baseline to determine which zones get bins THIS epoch
    const baseline = allZones.map((z) => ({ ...z, hasBin: false, priorityWeight: 1.0 }));
    const { updatedZones, binsPlaced } = simulateBinEpoch(baseline, epochNumber);

    // Zones that get bins in this epoch (new ones only)
    const newBinZones = updatedZones.filter((z) => z.hasBin && z.binEpoch === epochNumber);
    let zonesUpdated = 0;

    // Realistic fill level seeding: higher risk/importance zones tend to fill faster
    // Produces varied 15–95% values, weighted by zone characteristics
    function realisticFillLevel(zone) {
      const riskBias = (zone.riskScore || 0.5) * 40;          // 0–40
      const typeBias = {
        Market: 30, Hospital: 20, School: 15,
        Industrial: 25, Residential_High: 18, Residential_Low: 8,
      }[zone.type] || 15;
      const noise = Math.floor(Math.random() * 30) - 10;       // −10 to +20
      return Math.min(95, Math.max(15, Math.round(riskBias + typeBias + noise)));
    }

    for (const z of newBinZones) {
      const fillLevel = realisticFillLevel(z);
      await Zone.findOneAndUpdate(
        { zoneId: z.zoneId },
        { hasBin: true, binEpoch: epochNumber, priorityWeight: z.priorityWeight, binFillLevel: fillLevel },
        { returnDocument: 'after' }
      );
      zonesUpdated++;
    }

    // 2. Fetch fully-updated zones from DB (hasBin=true where deployed)
    const freshZones = await Zone.find().lean();
    const zoneMap = {};
    for (const z of freshZones) zoneMap[z.zoneId] = z;

    // 3. Recalculate ALL active truck routes using the updated zone data
    const allTrucks = await Truck.find({ status: 'active' }).lean();
    const updatedTrucks = [];

    // Road-distance basis (OSRM matrix over active depots + zones, Haversine fallback)
    const roadDist = await roadDistFor(allTrucks, freshZones);

    for (const truck of allTrucks) {
      const seq = truck.routeSequence || truck.assignedZones || [];
      if (seq.length === 0) continue;

      const truckZones = seq.map((id) => zoneMap[id]).filter(Boolean);
      const depot = truck.depotLocation || [23.47, 73.32];

      // Re-optimise route order using updated priority weights
      const newSequenceIds = greedyRouteOptimize(truckZones, depot, roadDist);
      // Calculate metrics on the re-ordered zones so duration uses new hasBin flags
      const newSequenceZones = newSequenceIds.map((id) => zoneMap[id]).filter(Boolean);
      const metrics = calculateRouteMetrics(newSequenceZones, depot, roadDist);

      console.log(`[DEPLOY] Truck ${truck.truckId}: old duration=${truck.estimatedDuration} min → new=${metrics.estimatedDuration} min`);

      await Truck.findOneAndUpdate(
        { truckId: truck.truckId },
        {
          routeSequence: newSequenceIds,
          estimatedDistance: metrics.totalDistance,
          estimatedDuration: metrics.estimatedDuration,
          currentLoadFactor: metrics.loadFactor,
        },
        { returnDocument: 'after' }
      );
      updatedTrucks.push(truck.truckId);
    }

    // Materialize today's deployed routes so drivers can acknowledge & run shifts
    await deployAllActiveRoutes(req.body.adminId || 'system', 'S1');

    await AuditLog.create({
      actor: 'admin',
      actorId: req.body.adminId || 'system',
      action: `DEPLOY_BIN_EPOCH_${epochNumber}`,
      details: {
        epochNumber,
        binsPlaced: zonesUpdated,
        zoneIds: newBinZones.map((z) => z.zoneId),
        trucksRerouted: updatedTrucks,
      },
      outcome: 'success',
    });

    res.json({
      success: true,
      data: {
        epochNumber,
        zonesUpdated,
        binsPlaced: zonesUpdated,
        trucksRerouted: updatedTrucks,
      },
    });
  } catch (err) {
    console.error('POST /simulation/epoch/deploy error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/simulation/fleet — Fleet optimization analysis
// ─────────────────────────────────────────────────────────
router.post('/fleet', async (req, res) => {
  try {
    const { targetFleetSize } = req.body;
    if (!targetFleetSize || targetFleetSize < 1) {
      return res.status(400).json({ success: false, error: 'targetFleetSize is required and must be >= 1' });
    }

    const allTrucks = await Truck.find().lean();
    const allZones = await Zone.find().lean();

    // Road-distance basis (OSRM matrix over all depots + zones, Haversine fallback)
    const roadDist = await roadDistFor(allTrucks, allZones);

    const result = fleetOptimize(allTrucks, allZones, targetFleetSize, roadDist);

    // If not feasible, try to find minimum feasible fleet size
    let minimumFeasible = null;
    if (!result.feasible) {
      for (let size = targetFleetSize + 1; size <= allTrucks.length; size++) {
        const test = fleetOptimize(allTrucks, allZones, size, roadDist);
        if (test.feasible) {
          minimumFeasible = size;
          break;
        }
      }
    }

    // Calculate coverage %
    const totalZoneCount = allZones.length;
    const activeTrucksBefore = result.updatedTrucks.filter((t) => t.status === 'active' || t.status === 'standby');
    const coveredZonesBefore = new Set();
    allTrucks.forEach((t) => (t.assignedZones || []).forEach((z) => coveredZonesBefore.add(z)));
    const coveredZonesAfter = new Set();
    result.updatedTrucks
      .filter((t) => t.status === 'active')
      .forEach((t) => (t.assignedZones || []).forEach((z) => coveredZonesAfter.add(z)));

    res.json({
      success: true,
      data: {
        feasible: result.feasible,
        infeasibleReasons: result.infeasibleReasons,
        minimumFeasible,
        metricsComparison: {
          ...result.metricsComparison,
          before: {
            ...result.metricsComparison.before,
            coverage: parseFloat(((coveredZonesBefore.size / totalZoneCount) * 100).toFixed(1)),
          },
          after: {
            ...result.metricsComparison.after,
            coverage: parseFloat(((coveredZonesAfter.size / totalZoneCount) * 100).toFixed(1)),
          },
        },
        updatedTrucks: result.updatedTrucks.map((t) => ({
          truckId: t.truckId,
          status: t.status,
          assignedZones: t.assignedZones,
          currentLoadFactor: t.currentLoadFactor,
          estimatedDistance: t.estimatedDistance,
          estimatedDuration: t.estimatedDuration,
        })),
      },
    });
  } catch (err) {
    console.error('POST /simulation/fleet error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/simulation/fleet/deploy — Deploy fleet plan to live DB
// ─────────────────────────────────────────────────────────
router.post('/fleet/deploy', async (req, res) => {
  try {
    const { targetFleetSize, adminId } = req.body;
    const allTrucks = await Truck.find().lean();
    const allZones = await Zone.find().lean();

    const roadDist = await roadDistFor(allTrucks, allZones);
    const result = fleetOptimize(allTrucks, allZones, targetFleetSize, roadDist);
    if (!result.feasible) {
      return res.status(400).json({ success: false, error: 'Fleet plan is not feasible', reasons: result.infeasibleReasons });
    }

    // Apply truck updates
    for (const t of result.updatedTrucks) {
      await Truck.findOneAndUpdate(
        { truckId: t.truckId },
        {
          status: t.status,
          assignedZones: t.assignedZones,
          routeSequence: t.routeSequence || t.assignedZones,
          currentLoadFactor: t.currentLoadFactor,
          estimatedDistance: t.estimatedDistance,
          estimatedDuration: t.estimatedDuration,
        },
        { returnDocument: 'after' }
      );
    }

    // Materialize today's deployed routes for the now-active fleet
    await deployAllActiveRoutes(adminId || 'system', 'S2');

    await AuditLog.create({
      actor: 'admin',
      actorId: adminId || 'system',
      action: 'DEPLOY_FLEET_PLAN',
      details: {
        targetFleetSize,
        deactivated: result.updatedTrucks.filter((t) => t.status === 'inactive').map((t) => t.truckId),
      },
      outcome: 'success',
    });

    res.json({
      success: true,
      data: { deployed: true, fleetSize: targetFleetSize },
    });
  } catch (err) {
    console.error('POST /simulation/fleet/deploy error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
