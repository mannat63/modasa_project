const mongoose = require('mongoose');

const routeSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    truckId: { type: String, required: true },
    // Ordered list of zone IDs for this day's route
    routeSequence: [{ type: String }],
    status: {
      type: String,
      enum: ['draft', 'deployed', 'completed'],
      default: 'draft',
    },
    approvedBy: { type: String },    // admin user ID or name
    approvedAt: { type: Date },
    totalDistance: { type: Number, default: 0 },  // km
    totalDuration: { type: Number, default: 0 },  // minutes
    specialInstructions: { type: String },
    // System state at the time of route generation
    systemState: {
      type: String,
      enum: ['S0', 'S1', 'S2'],
      default: 'S0',
    },

    // ── Driver acknowledgement ──
    acknowledgedByDriver: { type: Boolean, default: false },
    acknowledgedAt: { type: Date },

    // ── Shift / attendance tracking (driver timer) ──
    // Set when the driver taps "Start Shift" and "End Shift".
    shiftStartedAt: { type: Date },
    shiftEndedAt: { type: Date },
    // One entry per stop the driver checks in at, in order of arrival.
    stopProgress: [
      {
        zoneId: { type: String },
        reachedAt: { type: Date },
      },
    ],
  },
  { timestamps: true }
);

// Compound index: one route snapshot per truck per day
routeSchema.index({ date: 1, truckId: 1 }, { unique: true });

module.exports = mongoose.model('Route', routeSchema);
