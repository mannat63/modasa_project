const mongoose = require('mongoose');

const driverSchema = new mongoose.Schema(
  {
    driverId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    phone: { type: String },
    truckId: { type: mongoose.Schema.Types.ObjectId, ref: 'Truck' },
    todayRouteAcknowledged: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Driver', driverSchema);
