import mongoose from 'mongoose';

const seriesSchema = new mongoose.Schema({
  title: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  description: { type: String, required: true },
  posterUrl: { type: String, required: true },
  languageType: { type: String, enum: ['thai_dub', 'thai_sub'], required: true },
  totalEpisodes: { type: Number, default: 0 },
  views: { type: Number, default: 0 },
  isPopular: { type: Boolean, default: false },
  isNewSeries: { type: Boolean, default: false }
}, { timestamps: true });

// Optimize search and lookups
seriesSchema.index({ slug: 1 });
seriesSchema.index({ title: 'text' });
seriesSchema.index({ createdAt: -1 });
seriesSchema.index({ isPopular: 1, createdAt: -1 });
seriesSchema.index({ isNewSeries: 1, createdAt: -1 });
seriesSchema.index({ languageType: 1, createdAt: -1 });

export default mongoose.model('Series', seriesSchema);
