import express from 'express';
import Series from '../models/Series.js';
import Episode from '../models/Episode.js';
import Analytics from '../models/Analytics.js';
import Visitor from '../models/Visitor.js';
import { getClientIp } from '../middleware/clientIp.js';
import crypto from 'crypto';

const router = express.Router();
const DEFAULT_SERIES_LIMIT = 24;
const MAX_SERIES_LIMIT = 1000;
const MAX_SEARCH_LENGTH = 80;

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getLimit = (value) => {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SERIES_LIMIT;
  return Math.min(parsed, MAX_SERIES_LIMIT);
};

// @desc    Check-in unique visitor
// @route   POST /api/series/check-in
// @access  Public
router.post('/check-in', async (req, res, next) => {
  try {
    const ip = getClientIp(req);
    const ipHash = crypto.createHash('sha256').update(ip).digest('hex');
    const today = new Date().toISOString().split('T')[0];

    // Try to record a unique visit for today
    try {
      await Visitor.create({ ipHash, date: today });
      
      // If successful (new visitor today), increment total daily visitors in Analytics
      let analytics = await Analytics.findOne({ date: today });
      if (!analytics) {
        analytics = await Analytics.create({ date: today });
      }
      analytics.visitors += 1;
      await analytics.save();
    } catch (err) {
      // If E11000 duplicate key error, it means this IP already visited today
      if (err.code === 11000) {
        // Just update lastSeen for active user estimation
        await Visitor.findOneAndUpdate({ ipHash, date: today }, { lastSeen: new Date() });
      } else {
        throw err;
      }
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// @desc    Get all series (with pagination & filters)
// @route   GET /api/series
// @access  Public
router.get('/', async (req, res, next) => {
  try {
    const { category, isPopular, isNewSeries, languageType, search, limit } = req.query;
    let query = {};

    if (category && category !== 'all') {
      if (category === 'thai_dub' || category === 'thai_sub') {
        query.languageType = category;
      }
    }
    
    if (languageType) query.languageType = languageType;
    if (isPopular) query.isPopular = isPopular === 'true';
    if (isNewSeries) query.isNewSeries = isNewSeries === 'true';

    const normalizedSearch = typeof search === 'string' ? search.trim().slice(0, MAX_SEARCH_LENGTH) : '';
    if (normalizedSearch) {
      query.title = { $regex: escapeRegex(normalizedSearch), $options: 'i' };
    }

    const limitNum = getLimit(limit);

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

    // Find or create today's analytics record
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

    // Record page view in analytics
    analytics.pageViews += 1;
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
