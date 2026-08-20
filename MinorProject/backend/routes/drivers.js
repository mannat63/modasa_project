const express = require('express');
const router = express.Router();
const Flag = require('../models/Flag');
const Truck = require('../models/Truck');
const AuditLog = require('../models/AuditLog');
const Route = require('../models/Route');
const { upsertDeployedRoute, todayMidnight } = require('../utils/routeDeploy');

// GET /api/drivers/:id — look up driver by truck ID
// Since drivers are embedded in trucks, we look up the truck
router.get('/drivers/:id', async (req, res) => {
  try {
    const truck = await Truck.findOne({ truckId: req.params.id });
    if (!truck) return res.status(404).json({ success: false, error: 'Driver/Truck not found' });

    // Check today's route acknowledgement
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayRoute = await Route.findOne({
      truckId: truck.truckId,
      date: { $gte: today },
      status: 'deployed',
    });

    const driverData = {
      driverId: truck.truckId,
      name: truck.driverName || truck.truckId,
      phone: truck.driverPhone || '',
      truckId: truck.truckId,
      routeSequence: truck.routeSequence || [],
      todayRouteAcknowledged: todayRoute?.acknowledgedByDriver || false,
      todayRoute: todayRoute || null,
    };

    res.json({ success: true, data: driverData });
  } catch (err) {
    console.error('GET /drivers/:id error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/drivers/:id/flags — get flags submitted by this driver/truck
router.get('/drivers/:id/flags', async (req, res) => {
  try {
    const flags = await Flag.find({ truckId: req.params.id }).sort({ timestamp: -1 });
    res.json({ success: true, data: flags });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/drivers/:id/acknowledge — acknowledge today's route
// Tolerant: if no deployed route exists yet, materialize one from the truck's
// current route so the driver can always acknowledge what they've been assigned.
router.patch('/drivers/:id/acknowledge', async (req, res) => {
  try {
    const truck = await Truck.findOne({ truckId: req.params.id });
    if (!truck) return res.status(404).json({ success: false, error: 'Truck not found' });

    // Ensure a deployed route exists for today (idempotent)
    await upsertDeployedRoute(truck, 'system');

    const today = todayMidnight();
    const route = await Route.findOneAndUpdate(
      { truckId: req.params.id, date: { $gte: today }, status: 'deployed' },
      { $set: { acknowledgedByDriver: true, acknowledgedAt: new Date() } },
      { returnDocument: 'after' }
    );

    await AuditLog.create({
      actor: 'driver',
      actorId: req.params.id,
      action: 'ACKNOWLEDGE_ROUTE',
      details: { truckId: req.params.id, routeId: route?._id },
      outcome: 'success',
    });

    res.json({ success: true, data: { todayRouteAcknowledged: true } });
  } catch (err) {
    console.error('PATCH /drivers/:id/acknowledge error:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

// ── Driver shift / timer / attendance ─────────────────────
// POST /api/drivers/:id/shift/start — begin the shift (attendance clock-in)
router.post('/drivers/:id/shift/start', async (req, res) => {
  try {
    const truck = await Truck.findOne({ truckId: req.params.id });
    if (!truck) return res.status(404).json({ success: false, error: 'Truck not found' });

    const route = await upsertDeployedRoute(truck, 'system');
    if (!route.shiftStartedAt) {
      route.shiftStartedAt = new Date();
      route.stopProgress = [];
      route.shiftEndedAt = null;
      await route.save();
    }

    await AuditLog.create({
      actor: 'driver', actorId: req.params.id, action: 'START_SHIFT',
      details: { truckId: req.params.id, at: route.shiftStartedAt }, outcome: 'success',
    });

    res.json({ success: true, data: route });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/drivers/:id/shift/checkin — mark arrival at a stop { zoneId }
router.post('/drivers/:id/shift/checkin', async (req, res) => {
  try {
    const { zoneId } = req.body;
    if (!zoneId) return res.status(400).json({ success: false, error: 'zoneId is required' });

    const today = todayMidnight();
    const route = await Route.findOne({ truckId: req.params.id, date: { $gte: today }, status: 'deployed' });
    if (!route) return res.status(404).json({ success: false, error: 'No deployed route for today' });
    if (!route.shiftStartedAt) return res.status(400).json({ success: false, error: 'Start your shift first' });

    // Avoid duplicate check-ins for the same stop
    if (!route.stopProgress.some((s) => s.zoneId === zoneId)) {
      route.stopProgress.push({ zoneId, reachedAt: new Date() });
      await route.save();
    }

    res.json({ success: true, data: route });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/drivers/:id/shift/end — end the shift (attendance clock-out)
router.post('/drivers/:id/shift/end', async (req, res) => {
  try {
    const today = todayMidnight();
    const route = await Route.findOne({ truckId: req.params.id, date: { $gte: today }, status: 'deployed' });
    if (!route) return res.status(404).json({ success: false, error: 'No deployed route for today' });

    route.shiftEndedAt = new Date();
    await route.save();

    await AuditLog.create({
      actor: 'driver', actorId: req.params.id, action: 'END_SHIFT',
      details: { truckId: req.params.id, at: route.shiftEndedAt, stopsReached: route.stopProgress.length }, outcome: 'success',
    });

    res.json({ success: true, data: route });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// GET /api/attendance — today's shift/attendance summary for all trucks (admin)
router.get('/attendance', async (req, res) => {
  try {
    const today = todayMidnight();
    const routes = await Route.find({ date: { $gte: today } });
    const byTruck = {};
    for (const r of routes) byTruck[r.truckId] = r;

    const trucks = await Truck.find();
    const data = trucks.map((t) => {
      const r = byTruck[t.truckId];
      const started = r?.shiftStartedAt || null;
      const ended = r?.shiftEndedAt || null;
      const durationMin = started ? Math.round(((ended || new Date()) - new Date(started)) / 60000) : 0;
      return {
        truckId: t.truckId,
        driverName: t.driverName,
        status: t.status,
        acknowledged: r?.acknowledgedByDriver || false,
        shiftStartedAt: started,
        shiftEndedAt: ended,
        onDuty: !!started && !ended,
        attendance: started ? 'present' : 'absent',
        durationMin,
        stopsReached: r?.stopProgress?.length || 0,
        totalStops: (t.routeSequence || []).length,
        stopProgress: r?.stopProgress || [],
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/drivers/:id/flag — driver submits a flag
router.post('/drivers/:id/flag', async (req, res) => {
  try {
    const { type, zoneId, skipReason } = req.body;
    const flagId = `FLG-${Date.now()}`;
    
    const truck = await Truck.findOne({ truckId: req.params.id });

    const flag = new Flag({
      flagId,
      truckId: req.params.id,
      driverName: truck?.driverName || req.params.id,
      zoneId: zoneId,
      type: type,
      skipReason: skipReason,
      status: 'pending'
    });

    await flag.save();

    await AuditLog.create({
      actor: 'driver',
      actorId: req.params.id,
      action: 'SUBMIT_FLAG',
      details: { flagId: flag.flagId, type, zoneId, skipReason },
      outcome: 'success',
    });

    res.status(201).json({ success: true, data: { flagId: flag.flagId } });
  } catch (err) {
    console.error('POST /drivers/:id/flag error:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

// GET /api/flags — all flags, optionally filtered by status
router.get('/flags', async (req, res) => {
  try {
    const query = {};
    if (req.query.status) query.status = req.query.status;
    const flags = await Flag.find(query).sort({ timestamp: -1 });
    res.json({ success: true, data: flags });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/flags/:id/acknowledge — admin acknowledges flag
router.put('/flags/:id/acknowledge', async (req, res) => {
  try {
    const { adminNote, actorId } = req.body;
    const flag = await Flag.findOneAndUpdate(
      { flagId: req.params.id },
      { status: 'acknowledged', adminNote },
      { returnDocument: 'after' }
    );
    if (!flag) return res.status(404).json({ success: false, error: 'Flag not found' });

    await AuditLog.create({
      actor: 'admin',
      actorId: actorId || 'system',
      action: 'ACKNOWLEDGE_FLAG',
      details: { flagId: flag.flagId, adminNote },
      outcome: 'success',
    });

    res.json({ success: true, data: flag });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
