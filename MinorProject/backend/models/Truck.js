const mongoose = require('mongoose');

const truckSchema = new mongoose.Schema(
  {
    truckId: { type: String, required: true, unique: true },
    driverName: { type: String },
    driverPhone: { type: String },
    // 0-1 normalized capacity
    capacity: { type: Number, min: 0, max: 1, default: 1.0 },
    currentLoadFactor: { type: Number, min: 0, max: 1, default: 0 },
    status: {
      type: String,
      enum: ['active', 'inactive', 'standby'],
      default: 'standby',
    },
    // References to Zone documents by zoneId string
    assignedZones: [{ type: String, ref: 'Zone' }],
    // Ordered sequence of zoneIds for the route
    routeSequence: [{ type: String, ref: 'Zone' }],
    estimatedDistance: { type: Number, default: 0 },   // km
    estimatedDuration: { type: Number, default: 0 },   // minutes
    // Depot starting location: [lat, lng]
    depotLocation: {
      type: [Number],
      validate: {
        validator: (v) => v.length === 2,
        message: 'depotLocation must be [lat, lng]',
      },
    },
    // Precomputed road-following polyline (array of [lat, lng]) for the full
    // depot -> stops -> depot loop. Used to draw routes instantly and to animate
    // the live-moving truck. Falls back to straight segments if OSRM is unavailable.
    routeGeometry: { type: [[Number]], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Truck', truckSchema);
