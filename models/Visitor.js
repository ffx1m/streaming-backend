import mongoose from 'mongoose';

const visitorSchema = new mongoose.Schema({
  ipHash: { type: String, required: true },
  date: { type: String, required: true }, // YYYY-MM-DD
  lastSeen: { type: Date, default: Date.now }
}, { timestamps: true });

// Ensure one entry per IP per day
visitorSchema.index({ ipHash: 1, date: 1 }, { unique: true });

export default mongoose.model('Visitor', visitorSchema);