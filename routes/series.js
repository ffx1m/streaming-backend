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
const HOME_SECTION_LIMIT = 12;

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isValidObjectId = (value) => !value || mongoose.Types.ObjectId.isValid(value);

const setPublicCache = (res, { maxAge = 60, staleWhileRevalidate = 300 } = {}) => {
  res.set('Cache-Control', `public, max-age=${maxAge}, stale-while-revalidate=${staleWhileRevalidate}`);
};

const getLimit = (value) => {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SERIES_LIMIT;
  return Math.min(parsed, MAX_SERIES_LIMIT);
};

const getPage = (value) => {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return parsed;
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

// @desc    Get home page series sections in one request
// @route   GET /api/series/home
// @access  Public
router.get('/home', async (req, res, next) => {
  try {
    const projection = 'title slug posterUrl languageType totalEpisodes views isPopular isNewSeries';
    const [popular, newSeries, latest] = await Promise.all([
      Series.find({ isPopular: true }, projection).sort({ createdAt: -1 }).limit(HOME_SECTION_LIMIT),
      Series.find({ isNewSeries: true }, projection).sort({ createdAt: -1 }).limit(HOME_SECTION_LIMIT),
      Series.find({}, projection).sort({ createdAt: -1 }).limit(HOME_SECTION_LIMIT),
    ]);

    setPublicCache(res, { maxAge: 300, staleWhileRevalidate: 1200 });
    res.json({
      success: true,
      data: {
        popular,
        newSeries,
        latest,
      },
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get all series (with pagination & filters)
// @route   GET /api/series
// @access  Public
router.get('/', async (req, res, next) => {
  try {
    const { category, isPopular, isNewSeries, languageType, search, limit, page } = req.query;
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
    const pageNum = getPage(page);
    const skip = (pageNum - 1) * limitNum;

    const projection = 'title slug posterUrl languageType totalEpisodes views isPopular isNewSeries';
    const [series, total] = await Promise.all([
      Series.find(query, projection).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      Series.countDocuments(query),
    ]);
    const totalPages = Math.ceil(total / limitNum);

    setPublicCache(res, {
      maxAge: normalizedSearch ? 60 : 300,
      staleWhileRevalidate: normalizedSearch ? 300 : 1200,
    });
    res.json({
      success: true,
      data: series,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
        hasNextPage: pageNum < totalPages,
        hasPreviousPage: pageNum > 1,
      },
    });
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

    setPublicCache(res, { maxAge: 300, staleWhileRevalidate: 1800 });
    res.json({ success: true, data: series });
  } catch (error) {
    next(error);
  }
});

// @desc    Get series episodes (paginated)
// @route   GET /api/series/:slug/episodes
// @access  Public
router.get('/:slug/episodes', async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const series = await Series.findOne({ slug: req.params.slug }).select('_id').lean();
    
    if (!series) {
      return res.status(404).json({ success: false, message: 'Series not found' });
    }

    const limitNum = getLimit(limit || 50);
    const pageNum = getPage(page);
    const skip = (pageNum - 1) * limitNum;

    const [episodes, total] = await Promise.all([
      Episode.find({ seriesId: series._id }).sort({ episodeNumber: 1 }).skip(skip).limit(limitNum).lean(),
      Episode.countDocuments({ seriesId: series._id }),
    ]);

    const signedEpisodes = episodes.map(ep => ({
      ...ep,
      videoUrl: signWorkerUrl(ep.videoUrl)
    }));

    const totalPages = Math.ceil(total / limitNum);

    setPublicCache(res, { maxAge: 600, staleWhileRevalidate: 3600 });
    res.json({
      success: true,
      data: signedEpisodes,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
        hasNextPage: pageNum < totalPages,
        hasPreviousPage: pageNum > 1,
      },
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get data for watch page (series + current/next episode)
// @route   GET /api/series/:slug/watch/:episodeNumber
// @access  Public
router.get('/:slug/watch/:episodeNumber', async (req, res, next) => {
  try {
    const { slug, episodeNumber } = req.params;
    const epNum = parseInt(episodeNumber, 10);

    const series = await Series.findOne({ slug }).lean();
    if (!series) {
      return res.status(404).json({ success: false, message: 'Series not found' });
    }

    const [currentEpisode, nextEpisode] = await Promise.all([
      Episode.findOne({ seriesId: series._id, episodeNumber: epNum }).lean(),
      Episode.findOne({ seriesId: series._id, episodeNumber: epNum + 1 }).lean(),
    ]);

    if (!currentEpisode) {
      return res.json({
        success: true,
        data: {
          seriesId: series._id,
          title: series.title,
          slug: series.slug,
          posterUrl: series.posterUrl,
          totalEpisodes: series.totalEpisodes,
          hasCurrentEpisode: false,
        }
      });
    }

    res.json({
      success: true,
      data: {
        seriesId: series._id,
        title: series.title,
        slug: series.slug,
        posterUrl: series.posterUrl,
        totalEpisodes: series.totalEpisodes,
        currentEpisodeId: currentEpisode._id,
        currentEpisodeUrl: signWorkerUrl(currentEpisode.videoUrl),
        nextEpisodeUrl: nextEpisode ? signWorkerUrl(nextEpisode.videoUrl) : '',
        hasCurrentEpisode: true,
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
