const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    timestamp: { type: Date, default: Date.now },
    actor: {
      type: String,
      enum: ['admin', 'driver', 'system', 'ai'],
      required: true,
    },
    actorId: { type: String },
    action: { type: String, required: true },
    details: { type: mongoose.Schema.Types.Mixed }, // flexible object
    outcome: { type: String },
  },
  {
    // Disable the automatic updatedAt — audit logs are immutable
    timestamps: { createdAt: 'createdAt', updatedAt: false },
  }
);

// Prevent updates to existing audit log documents
auditLogSchema.pre('save', function () {
  if (!this.isNew) throw new Error('AuditLog entries are immutable.');
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
