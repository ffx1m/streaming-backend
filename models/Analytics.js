import mongoose from 'mongoose';

const analyticsSchema = new mongoose.Schema({
  date: { type: String, required: true, unique: true }, // YYYY-MM-DD
  visitors: { type: Number, default: 0 },
  activeUsers: { type: Number, default: 0 },
  pageViews: { type: Number, default: 0 },
  seriesViews: { type: Number, default: 0 }
}, { timestamps: true });

export default mongoose.model('Analytics', analyticsSchema);