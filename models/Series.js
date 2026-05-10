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

export default mongoose.model('Series', seriesSchema);