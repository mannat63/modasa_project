const express = require('express');
const router = express.Router();
const Truck = require('../models/Truck');
const Route = require('../models/Route');
const AuditLog = require('../models/AuditLog');
const { upsertDeployedRoute } = require('../utils/routeDeploy');

// GET /api/trucks — return all trucks with populated zone data
router.get('/', async (req, res) => {
  try {
    const trucks = await Truck.find()
      .populate({ path: 'assignedZones', model: 'Zone', localField: 'assignedZones', foreignField: 'zoneId' })
      .populate({ path: 'routeSequence', model: 'Zone', localField: 'routeSequence', foreignField: 'zoneId' });
    res.json({ success: true, data: trucks });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/trucks/:id — single truck with full route sequence
router.get('/:id', async (req, res) => {
  try {
    const truck = await Truck.findOne({ truckId: req.params.id })
      .populate({ path: 'assignedZones', model: 'Zone', localField: 'assignedZones', foreignField: 'zoneId' })
      .populate({ path: 'routeSequence', model: 'Zone', localField: 'routeSequence', foreignField: 'zoneId' });
    
    if (!truck) return res.status(404).json({ success: false, error: 'Truck not found' });
    res.json({ success: true, data: truck });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/trucks/:id/route — update route sequence (Admin only)
router.put('/:id/route', async (req, res) => {
  try {
    const { routeSequence, approvedBy } = req.body;
    if (!approvedBy) {
      return res.status(400).json({ success: false, error: 'approvedBy is required' });
    }

    const truck = await Truck.findOneAndUpdate(
      { truckId: req.params.id },
      { routeSequence },
      { returnDocument: 'after' }
    );
    if (!truck) return res.status(404).json({ success: false, error: 'Truck not found' });

    // Keep today's deployed route in sync so the driver sees & can acknowledge it
    await upsertDeployedRoute(truck, approvedBy);

    await AuditLog.create({
      actor: 'admin',
      actorId: approvedBy,
      action: 'UPDATE_TRUCK_ROUTE',
      details: { truckId: truck.truckId, newRouteSequence: routeSequence },
      outcome: 'success',
    });

    res.json({ success: true, data: truck });
  } catch (err) {
    console.error('PUT /trucks/:id/route error:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

// GET /api/trucks/:id/today-route — get today's deployed route for this truck
router.get('/:id/today-route', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const route = await Route.findOne({
      truckId: req.params.id,
      date: { $gte: today },
      status: 'deployed',
    });

    if (!route) return res.status(404).json({ success: false, error: "No deployed route found for today" });
    
    res.json({ success: true, data: route });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/trucks/:id/deploy-route — mark route as deployed for today
router.post('/:id/deploy-route', async (req, res) => {
  try {
    const { actorId } = req.body;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let route = await Route.findOne({
      truckId: req.params.id,
      date: { $gte: today }
    });

    if (!route) {
        // If there's no draft snapshot today, we create one and deploy it immediately
        const truck = await Truck.findOne({ truckId: req.params.id });
        if(!truck) return res.status(404).json({ success: false, error: 'Truck not found' });
        
        route = new Route({
            date: new Date(),
            truckId: truck.truckId,
            routeSequence: truck.routeSequence || [],
            status: 'deployed',
            approvedBy: actorId || 'system',
            approvedAt: new Date()
        });
        await route.save();
    } else {
        route.status = 'deployed';
        route.approvedBy = actorId || 'system';
        route.approvedAt = new Date();
        await route.save();
    }

    await AuditLog.create({
      actor: 'admin',
      actorId: actorId || 'system',
      action: 'DEPLOY_TRUCK_ROUTE',
      details: { truckId: req.params.id, routeId: route._id },
      outcome: 'success',
    });

    res.status(201).json({ success: true, data: route });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
