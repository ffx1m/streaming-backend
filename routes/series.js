import express from 'express';
import Series from '../models/Series.js';
import Episode from '../models/Episode.js';
import Analytics from '../models/Analytics.js';

const router = express.Router();

// @desc    Get all series (with pagination & filters)
// @route   GET /api/series
// @access  Public
router.get('/', async (req, res, next) => {
  try {
    const { category, isPopular, isNewSeries, languageType, search, limit } = req.query;
    let query = {};

    // For backwards compatibility with Category page using thai_dub / thai_sub in the category prop
    if (category && category !== 'all') {
      if (category === 'thai_dub' || category === 'thai_sub') {
        query.languageType = category;
      }
    }
    
    if (languageType) query.languageType = languageType;
    if (isPopular) query.isPopular = isPopular === 'true';
    if (isNewSeries) query.isNewSeries = isNewSeries === 'true';
    if (search) query.title = { $regex: search, $options: 'i' }; // Basic text search

    const limitNum = parseInt(limit, 10) || 24;

    const series = await Series.find(query).sort({ createdAt: -1 }).limit(limitNum);
    res.json({ success: true, data: series });
  } catch (error) {
    next(error);
  }
});

// @desc    Increment view count
// @route   POST /api/series/view
// @access  Public
router.post('/view', async (req, res, next) => {
  try {
    const { seriesId, episodeId } = req.body;
    const today = new Date().toISOString().split('T')[0];

    // Find or create today's analytics
    let analytics = await Analytics.findOne({ date: today });
    if (!analytics) {
      analytics = await Analytics.create({ date: today });
    }

    if (seriesId) {
      await Series.findByIdAndUpdate(seriesId, { $inc: { views: 1 } });
      analytics.seriesViews += 1;
    }
    
    if (episodeId) {
      await Episode.findByIdAndUpdate(episodeId, { $inc: { views: 1 } });
    }

    analytics.pageViews += 1;
    // We assume each call is a distinct visitor action. Real systems use session IDs.
    analytics.activeUsers += 1; 
    
    await analytics.save();

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// @desc    Get single series by slug
// @route   GET /api/series/:slug
// @access  Public
router.get('/:slug', async (req, res, next) => {
  try {
    const series = await Series.findOne({ slug: req.params.slug }).lean();
    if (!series) {
      return res.status(404).json({ success: false, message: 'Series not found' });
    }

    const episodes = await Episode.find({ seriesId: series._id }).sort({ episodeNumber: 1 }).lean();
    series.episodes = episodes;

    res.json({ success: true, data: series });
  } catch (error) {
    next(error);
  }
});

export default router;