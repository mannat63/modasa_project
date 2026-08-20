const mongoose = require('mongoose');

const flagSchema = new mongoose.Schema(
  {
    flagId: { type: String, required: true, unique: true },
    truckId: { type: String, required: true },
    zoneId: { type: String, required: true },
    driverName: { type: String },
    type: {
      type: String,
      enum: ['road_blocked', 'overloaded', 'skipped', 'delay'],
      required: true,
    },
    skipReason: { type: String }, // optional free-text
    timestamp: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ['pending', 'acknowledged', 'actioned'],
      default: 'pending',
    },
    adminNote: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Flag', flagSchema);
