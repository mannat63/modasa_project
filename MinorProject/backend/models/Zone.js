const mongoose = require('mongoose');

const priorityWeightMap = {
  Market: 1.5,
  School: 1.4,
  Hospital: 1.4,
  Industrial: 1.2,
  Residential_High: 1.0,
  Residential_Low: 0.7,
};

const zoneSchema = new mongoose.Schema(
  {
    zoneId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    type: {
      type: String,
      enum: ['Market', 'Residential_High', 'Residential_Low', 'School', 'Hospital', 'Industrial'],
      required: true,
    },
    riskScore: { type: Number, min: 0, max: 1 },
    priorityWeight: {
      type: Number,
      default: function () {
        return priorityWeightMap[this.type] ?? 1.0;
      },
    },
    // Polygon: array of [lat, lng] pairs
    coordinates: {
      type: [[Number]],
      default: [],
    },
    // Single center point: [lat, lng]
    centerPoint: {
      type: [Number],
      validate: {
        validator: (v) => v.length === 2,
        message: 'centerPoint must be [lat, lng]',
      },
    },
    pickupFrequency: {
      type: String,
      enum: ['daily', 'alternate'],
      required: true,
    },
    hasBin: { type: Boolean, default: false },
    // 0 = no bin, 1/2/3 = epoch when bin was placed
    binEpoch: { type: Number, default: 0 },
    wasteProfile: {
      type: String,
      enum: ['Mixed', 'Organic', 'Dry'],
      required: true,
    },
    visualSeverity: { type: Number, min: 1, max: 5 },
    illegalDumping: { type: Boolean, default: false },
    sensitiveInstitution: { type: Boolean, default: false },
    healthRiskLevel: { type: Number, min: 1, max: 3 },
    blockedToday: { type: Boolean, default: false },
    roadBlocked: { type: Boolean, default: false },
    highPriorityToday: { type: Boolean, default: false },
    // Bin fill level: 0–100 (percentage). Only meaningful when hasBin=true.
    binFillLevel: { type: Number, min: 0, max: 100, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Zone', zoneSchema);
