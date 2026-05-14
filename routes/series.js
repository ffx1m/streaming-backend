import express from 'express';
import mongoose from 'mongoose';
import Series from '../models/Series.js';
import Episode from '../models/Episode.js';
import { getClientIp } from '../middleware/clientIp.js';
import { recordDailyVisitor, recordSeriesView } from '../services/analytics.js';
import { getAnalyticsDateKey } from '../utils/dateKey.js';
import { signWorkerUrl } from '../utils/urlSigner.js';
import crypto from 'crypto';

const router = express.Router();
const DEFAULT_SERIES_LIMIT = 24;
const MAX_SERIES_LIMIT = 1000;
const MAX_SEARCH_LENGTH = 80;

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isValidObjectId = (value) => !value || mongoose.Types.ObjectId.isValid(value);

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
    const today = getAnalyticsDateKey();

    await recordDailyVisitor({ ipHash, date: today });

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
    if (!isValidObjectId(seriesId) || !isValidObjectId(episodeId)) {
      return res.status(400).json({ success: false, message: 'Invalid series or episode ID' });
    }

    const today = getAnalyticsDateKey();

    await recordSeriesView({ date: today, seriesId, episodeId });

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
    series.episodes = episodes.map(ep => ({
      ...ep,
      videoUrl: signWorkerUrl(ep.videoUrl)
    }));

    res.json({ success: true, data: series });
  } catch (error) {
    next(error);
  }
});

export default router;
