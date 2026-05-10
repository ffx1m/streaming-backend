import mongoose from 'mongoose';

const episodeSchema = new mongoose.Schema({
  seriesId: { type: mongoose.Schema.Types.ObjectId, ref: 'Series', required: true },
  episodeNumber: { type: Number, required: true },
  title: { type: String, required: true },
  videoUrl: { type: String, required: true },
  views: { type: Number, default: 0 }
}, { timestamps: true });

// Prevent duplicate episodes for same series
episodeSchema.index({ seriesId: 1, episodeNumber: 1 }, { unique: true });

export default mongoose.model('Episode', episodeSchema);