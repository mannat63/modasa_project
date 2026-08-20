const express = require('express');
const router = express.Router();
const Route = require('../models/Route');
const Truck = require('../models/Truck');
const Zone = require('../models/Zone');
const Flag = require('../models/Flag');
const AuditLog = require('../models/AuditLog');

// GET /api/reports/summary — dashboard top-level stats
router.get('/reports/summary', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalZones, totalTrucks, activeTrucks, pendingFlags, trucks] = await Promise.all([
      Zone.countDocuments(),
      Truck.countDocuments(),
      Truck.countDocuments({ status: 'active' }),
      Flag.countDocuments({ status: 'pending' }),
      Truck.find({ status: 'active' }, 'currentLoadFactor routeSequence'),
    ]);

    // A truck is "deployed today" if it is active and has a non-empty route sequence.
    // Simulation deploys update Truck.routeSequence directly — we don't rely on Route docs.
    const activeRoutes = trucks.filter(
      (t) => t.routeSequence && t.routeSequence.length > 0
    ).length;

    const avgLoadFactor = trucks.length > 0
      ? trucks.reduce((sum, t) => sum + (t.currentLoadFactor || 0), 0) / trucks.length
      : 0;

    res.json({
      success: true,
      data: { totalZones, totalTrucks, activeTrucks, pendingFlags, activeRoutes, avgLoadFactor },
    });
  } catch (err) {
    console.error('GET /reports/summary error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/reports/today — return all trucks with today's deployed routes
router.get('/reports/today', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const routes = await Route.find({
      date: { $gte: today },
      status: 'deployed'
    });

    const routeTruckIds = routes.map(r => r.truckId);

    const trucks = await Truck.find({ truckId: { $in: routeTruckIds } })
      .populate({ path: 'routeSequence', model: 'Zone', localField: 'routeSequence', foreignField: 'zoneId' });

    // Attach route snapshots to the trucks
    const data = trucks.map(truck => {
        const truckObj = truck.toObject();
        truckObj.deployedRoute = routes.find(r => r.truckId === truck.truckId);
        return truckObj;
    });

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/reports/generate — generate today's snapshot for all trucks
router.post('/reports/generate', async (req, res) => {
  try {
    const { actorId } = req.body;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const trucks = await Truck.find({ status: 'active' });
    const generatedRoutes = [];

    for (const truck of trucks) {
      const route = await Route.findOneAndUpdate(
        { truckId: truck.truckId, date: today },
        {
          $setOnInsert: {
            date: today,
            truckId: truck.truckId,
            routeSequence: truck.routeSequence || [],
            status: 'draft',
            totalDistance: 0,
            totalDuration: 0,
          },
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
      );
      generatedRoutes.push(route);
    }

    await AuditLog.create({
      actor: 'admin',
      actorId: actorId || 'system',
      action: 'GENERATE_DAILY_SNAPSHOTS',
      details: { generatedCount: generatedRoutes.length },
      outcome: 'success',
    });

    res.json({ success: true, data: generatedRoutes });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/reports/routes — create or update today's route snapshot for a truck
router.post('/reports/routes', async (req, res) => {
  try {
    const { truckId, date, routeSequence, totalDistance, totalDuration, systemState, actor, actorId } = req.body;

    if (!truckId) {
      return res.status(400).json({ success: false, error: 'truckId is required' });
    }

    // Normalize to midnight so the compound unique index works correctly
    const day = new Date(date || new Date());
    day.setHours(0, 0, 0, 0);

    // Atomic upsert — avoids duplicate key race condition on the compound index
    const route = await Route.findOneAndUpdate(
      { truckId, date: day },
      {
        $set: {
          routeSequence: routeSequence || [],
          totalDistance: totalDistance || 0,
          totalDuration: totalDuration || 0,
          systemState: systemState || 'S1',
          status: 'draft',
        },
        $setOnInsert: { date: day, truckId },
      },
      { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true }
    );

    await AuditLog.create({
      actor: actor || 'admin',
      actorId: actorId || 'system',
      action: 'CREATE_ROUTE_SNAPSHOT',
      details: { truckId, date: day, zones: (routeSequence || []).length },
      outcome: 'success',
    });

    res.status(201).json({ success: true, data: route });
  } catch (err) {
    console.error('POST /reports/routes error:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

// GET /api/audit — return last 100 AuditLog entries, sorted by timestamp desc
router.get('/audit', async (req, res) => {
  try {
    const logs = await AuditLog.find().sort({ timestamp: -1 }).limit(100);
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
// POST /api/reports/distribute — mark today's routes as distributed
router.post('/reports/distribute', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const routes = await Route.find({ date: { $gte: today }, status: 'deployed' });

    const distributed = [];
    for (const route of routes) {
      route.specialInstructions = (route.specialInstructions || '') + ' [DISTRIBUTED]';
      await route.save();
      distributed.push(route.truckId);
    }

    await AuditLog.create({
      actor: 'admin',
      actorId: req.body.adminId || 'system',
      action: 'DISTRIBUTE_ROUTES',
      details: {
        date: today.toISOString(),
        trucksDistributed: distributed.length,
        truckIds: distributed,
      },
      outcome: 'success',
    });

    res.json({
      success: true,
      data: {
        distributed: distributed.length,
        truckIds: distributed,
        message: `${distributed.length} route(s) marked as distributed.`,
      },
    });
  } catch (err) {
    console.error('POST /reports/distribute error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
