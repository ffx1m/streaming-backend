import mongoose from 'mongoose';

const loginAttemptSchema = new mongoose.Schema({
  ip: { type: String, required: true, unique: true },
  attempts: { type: Number, required: true, default: 0 },
  lockUntil: { type: Date },
  isBlacklisted: { type: Boolean, default: false }
}, { timestamps: true });

// Index to automatically expire documents after some time if needed, 
// but we'll manage lockUntil manually for precision.
// However, let's add an index on IP for fast lookups.
loginAttemptSchema.index({ ip: 1 });

export default mongoose.model('LoginAttempt', loginAttemptSchema);