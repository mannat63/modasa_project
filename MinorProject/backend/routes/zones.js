const express = require('express');
const router = express.Router();
const Zone = require('../models/Zone');
const AuditLog = require('../models/AuditLog');

// GET /api/zones — all zones
router.get('/', async (req, res) => {
  try {
    const zones = await Zone.find();
    res.json({ success: true, data: zones });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/zones/blocked — return all currently blocked zones
router.get('/blocked', async (req, res) => {
  try {
    const zones = await Zone.find({ blockedToday: true });
    res.json({ success: true, data: zones });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/zones/:id — single zone
router.get('/:id', async (req, res) => {
  try {
    const zone = await Zone.findOne({ zoneId: req.params.id });
    if (!zone) return res.status(404).json({ success: false, error: 'Zone not found' });
    res.json({ success: true, data: zone });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/zones/:id/priority — update priorityWeight
router.put('/:id/priority', async (req, res) => {
  try {
    const { weight, actorId } = req.body;
    const zone = await Zone.findOneAndUpdate(
      { zoneId: req.params.id },
      { priorityWeight: weight },
      { returnDocument: 'after' }
    );
    if (!zone) return res.status(404).json({ success: false, error: 'Zone not found' });

    await AuditLog.create({
      actor: 'admin',
      actorId: actorId || 'system',
      action: 'UPDATE_ZONE_PRIORITY',
      details: { zoneId: zone.zoneId, weight },
      outcome: 'success',
    });

    res.json({ success: true, data: zone });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// PUT /api/zones/:id/bin — set hasBin true/false, binEpoch
router.put('/:id/bin', async (req, res) => {
  try {
    const { hasBin, epoch, actorId } = req.body;
    const zone = await Zone.findOneAndUpdate(
      { zoneId: req.params.id },
      { hasBin, binEpoch: epoch },
      { returnDocument: 'after' }
    );
    if (!zone) return res.status(404).json({ success: false, error: 'Zone not found' });

    await AuditLog.create({
      actor: 'admin',
      actorId: actorId || 'system',
      action: 'UPDATE_ZONE_BIN',
      details: { zoneId: zone.zoneId, hasBin, binEpoch: epoch },
      outcome: 'success',
    });

    res.json({ success: true, data: zone });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// PUT /api/zones/:id/block — mark zone as blocked today
router.put('/:id/block', async (req, res) => {
  try {
    const { actorId } = req.body;
    const zone = await Zone.findOneAndUpdate(
      { zoneId: req.params.id },
      { blockedToday: true },
      { returnDocument: 'after' }
    );
    if (!zone) return res.status(404).json({ success: false, error: 'Zone not found' });

    await AuditLog.create({
      actor: 'admin',
      actorId: actorId || 'system',
      action: 'BLOCK_ZONE',
      details: { zoneId: zone.zoneId },
      outcome: 'success',
    });

    res.json({ success: true, data: zone });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// PUT /api/zones/:id/unblock — unblock zone
router.put('/:id/unblock', async (req, res) => {
  try {
    const { actorId } = req.body;
    const zone = await Zone.findOneAndUpdate(
      { zoneId: req.params.id },
      { blockedToday: false },
      { returnDocument: 'after' }
    );
    if (!zone) return res.status(404).json({ success: false, error: 'Zone not found' });

    await AuditLog.create({
      actor: 'admin',
      actorId: actorId || 'system',
      action: 'UNBLOCK_ZONE',
      details: { zoneId: zone.zoneId },
      outcome: 'success',
    });

    res.json({ success: true, data: zone });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
