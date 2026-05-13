import express from 'express';
import Admin from '../models/Admin.js';
import Series from '../models/Series.js';
import Episode from '../models/Episode.js';
import Analytics from '../models/Analytics.js';
import Visitor from '../models/Visitor.js';
import LoginAttempt from '../models/LoginAttempt.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { protectAdmin } from '../middleware/auth.js';
import { getClientIp } from '../middleware/clientIp.js';

const router = express.Router();

const getAdminCookieOptions = () => {
  const sameSite = process.env.ADMIN_COOKIE_SAMESITE || (process.env.NODE_ENV === 'production' ? 'none' : 'lax');
  const secure = process.env.NODE_ENV === 'production' || sameSite.toLowerCase() === 'none';

  return {
    httpOnly: true,
    secure,
    sameSite,
    maxAge: 24 * 60 * 60 * 1000,
    path: '/',
  };
};

const getClearAdminCookieOptions = () => {
  const { maxAge, ...options } = getAdminCookieOptions();
  return options;
};

const allowedLanguages = new Set(['thai_dub', 'thai_sub']);
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const trimString = (value) => (typeof value === 'string' ? value.trim() : '');

const isValidUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const badRequest = (res, message) => res.status(400).json({ success: false, message });
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

const validateSeriesPayload = (body, { partial = false } = {}) => {
  const payload = {};

  if (!partial || hasOwn(body, 'title')) {
    payload.title = trimString(body.title);
    if (!payload.title) return { error: 'Title is required' };
  }

  if (!partial || hasOwn(body, 'slug')) {
    payload.slug = trimString(body.slug).toLowerCase();
    if (!payload.slug) return { error: 'Slug is required' };
    if (!slugPattern.test(payload.slug)) return { error: 'Slug must contain lowercase letters, numbers, and hyphens only' };
  }

  if (!partial || hasOwn(body, 'description')) {
    payload.description = trimString(body.description);
    if (!payload.description) return { error: 'Description is required' };
  }

  if (!partial || hasOwn(body, 'posterUrl')) {
    payload.posterUrl = trimString(body.posterUrl);
    if (!payload.posterUrl) return { error: 'Poster URL is required' };
    if (!isValidUrl(payload.posterUrl)) return { error: 'Poster URL must be a valid http(s) URL' };
  }

  if (!partial || hasOwn(body, 'languageType')) {
    payload.languageType = trimString(body.languageType);
    if (!allowedLanguages.has(payload.languageType)) return { error: 'Invalid language type' };
  }

  if (hasOwn(body, 'isPopular')) {
    payload.isPopular = Boolean(body.isPopular);
  } else if (!partial) {
    payload.isPopular = false;
  }

  if (hasOwn(body, 'isNewSeries')) {
    payload.isNewSeries = Boolean(body.isNewSeries);
  } else if (!partial) {
    payload.isNewSeries = false;
  }

  return { payload };
};

const validateEpisodePayload = (body, { partial = false } = {}) => {
  const payload = {};

  if (!partial || hasOwn(body, 'seriesId')) {
    payload.seriesId = trimString(body.seriesId);
    if (!payload.seriesId) return { error: 'Series ID is required' };
    if (!payload.seriesId.match(/^[a-f\d]{24}$/i)) return { error: 'Invalid series ID' };
  }

  if (!partial || hasOwn(body, 'episodeNumber')) {
    payload.episodeNumber = Number(body.episodeNumber);
    if (!Number.isInteger(payload.episodeNumber) || payload.episodeNumber < 1) {
      return { error: 'Episode number must be a positive integer' };
    }
  }

  if (!partial || hasOwn(body, 'title')) {
    payload.title = trimString(body.title);
    if (!payload.title) return { error: 'Episode title is required' };
  }

  if (!partial || hasOwn(body, 'videoUrl')) {
    payload.videoUrl = trimString(body.videoUrl);
    if (!payload.videoUrl) return { error: 'Video URL is required' };
    if (!isValidUrl(payload.videoUrl)) return { error: 'Video URL must be a valid http(s) URL' };
  }

  return { payload };
};

// @desc    Check current IP lockout status
// @route   GET /api/admin/security/check-lockout
// @access  Public
router.get('/security/check-lockout', async (req, res, next) => {
  try {
    const ip = getClientIp(req);
    const attemptRecord = await LoginAttempt.findOne({ ip });

    if (!attemptRecord) {
      return res.json({ success: true, locked: false });
    }

    if (attemptRecord.isBlacklisted) {
      return res.json({ success: true, locked: true, permanent: true });
    }

    if (attemptRecord.lockUntil && attemptRecord.lockUntil > Date.now()) {
      return res.json({ 
        success: true, 
        locked: true, 
        lockUntil: attemptRecord.lockUntil,
        remainingMs: attemptRecord.lockUntil - Date.now()
      });
    }

    res.json({ success: true, locked: false });
  } catch (error) {
    next(error);
  }
});

// @desc    Admin Login
// @route   POST /api/admin/login
// @access  Public
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const ip = getClientIp(req);

    // 1. Check for existing login attempts/lockout/blacklist for this IP
    let attemptRecord = await LoginAttempt.findOne({ ip });

    // Check Blacklist first
    if (attemptRecord && attemptRecord.isBlacklisted) {
      return res.status(403).json({ 
        success: false, 
        message: 'Your IP has been permanently banned from accessing this system.' 
      });
    }

    if (attemptRecord && attemptRecord.lockUntil && attemptRecord.lockUntil > Date.now()) {
      const remainingMs = attemptRecord.lockUntil - Date.now();
      let waitTimeMsg = '';
      
      if (remainingMs > 60 * 60 * 1000) {
        waitTimeMsg = `${Math.ceil(remainingMs / (60 * 60 * 1000))} hours`;
      } else if (remainingMs > 60 * 1000) {
        waitTimeMsg = `${Math.ceil(remainingMs / (60 * 1000))} minutes`;
      } else {
        waitTimeMsg = `${Math.ceil(remainingMs / 1000)} seconds`;
      }

      return res.status(403).json({ 
        success: false, 
        message: `Too many failed attempts. Please try again in ${waitTimeMsg}.` 
      });
    }

    // Function to handle failed attempt
    const handleFailure = async () => {
      if (!attemptRecord) {
        attemptRecord = new LoginAttempt({ ip, attempts: 1 });
      } else {
        attemptRecord.attempts += 1;
      }

      let lockDuration = 0;
      if (attemptRecord.attempts === 3) {
        lockDuration = 30 * 1000; // 30 seconds
      } else if (attemptRecord.attempts === 4) {
        lockDuration = 60 * 1000; // 1 minute
      } else if (attemptRecord.attempts >= 5 && attemptRecord.attempts < 10) {
        lockDuration = 15 * 60 * 1000; // 15 minutes
      } else if (attemptRecord.attempts >= 10) {
        lockDuration = 24 * 60 * 60 * 1000; // 24 hours
      }

      if (lockDuration > 0) {
        attemptRecord.lockUntil = new Date(Date.now() + lockDuration);
      }

      await attemptRecord.save();
      
      const message = lockDuration > 0 
        ? `Invalid credentials. Account locked for ${lockDuration >= 3600000 ? (lockDuration / 3600000) + ' hours' : (lockDuration / 60000) + ' minutes'}.`
        : 'Invalid credentials';
      
      return res.status(401).json({ success: false, message });
    };

    // 2. Find admin user
    const adminUser = await Admin.findOne({ username });
    if (!adminUser) {
      return await handleFailure();
    }

    // 3. Check password
    const isMatch = await bcrypt.compare(password, adminUser.passwordHash);
    
    if (!isMatch) {
      return await handleFailure();
    }

    // 4. Successful login: Reset attempts for this IP
    if (attemptRecord) {
      await LoginAttempt.deleteOne({ ip });
    }

    // Generate JWT
    const token = jwt.sign({ id: adminUser._id, username: adminUser.username }, process.env.JWT_SECRET, { expiresIn: '1d' });
    
    res.cookie('admin_token', token, getAdminCookieOptions());
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// @desc    Admin Logout
// @route   POST /api/admin/logout
// @access  Public
router.post('/logout', (req, res) => {
  res.clearCookie('admin_token', getClearAdminCookieOptions());
  res.json({ success: true });
});

// ==========================================
// SECURITY MANAGEMENT
// ==========================================

// @desc    Get all locked out or blacklisted IPs
// @route   GET /api/admin/security/lockouts
// @access  Private
router.get('/security/lockouts', protectAdmin, async (req, res, next) => {
  try {
    // Show only currently locked out OR blacklisted
    const lockouts = await LoginAttempt.find({
      $or: [
        { lockUntil: { $gt: new Date() } },
        { isBlacklisted: true }
      ]
    }).sort({ updatedAt: -1 });

    res.json({ success: true, data: lockouts });
  } catch (error) {
    next(error);
  }
});

// @desc    Permanently blacklist an IP
// @route   PUT /api/admin/security/blacklist/:id
// @access  Private
router.put('/security/blacklist/:id', protectAdmin, async (req, res, next) => {
  try {
    const record = await LoginAttempt.findByIdAndUpdate(req.params.id, {
      isBlacklisted: true,
      lockUntil: new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000) // 100 years lockout just in case
    }, { new: true });

    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
    res.json({ success: true, message: 'IP permanently blacklisted', data: record });
  } catch (error) {
    next(error);
  }
});

// @desc    Whitelist / Reset attempts for an IP
// @route   DELETE /api/admin/security/lockouts/:id
// @access  Private
router.delete('/security/lockouts/:id', protectAdmin, async (req, res, next) => {
  try {
    const record = await LoginAttempt.findByIdAndDelete(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
    res.json({ success: true, message: 'IP whitelisted / Record removed' });
  } catch (error) {
    next(error);
  }
});

// @desc    Get Dashboard Data
// @route   GET /api/admin/dashboard
// @access  Private
router.get('/dashboard', protectAdmin, async (req, res, next) => {
  try {
    const totalSeries = await Series.countDocuments();
    const totalEpisodes = await Episode.countDocuments();
    
    // Calculate total views across all series from Database
    const seriesAggregation = await Series.aggregate([
      { $group: { _id: null, totalViews: { $sum: '$views' } } }
    ]);
    const totalViews = seriesAggregation.length > 0 ? seriesAggregation[0].totalViews : 0;

    // Accurate Unique Visitors for Today
    const today = new Date().toISOString().split('T')[0];
    const dailyUsers = await Visitor.countDocuments({ date: today });

    // Active Users (People seen in the last 15 minutes)
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const activeUsers = await Visitor.countDocuments({ 
      date: today,
      lastSeen: { $gte: fifteenMinutesAgo } 
    });

    res.json({ 
      success: true, 
      data: {
        totalSeries,
        totalEpisodes,
        activeUsers, 
        dailyUsers, 
        totalViews 
      } 
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// SERIES MANAGEMENT
// ==========================================

// @desc    Get all series for admin
// @route   GET /api/admin/series
// @access  Private
router.get('/series', protectAdmin, async (req, res, next) => {
  try {
    const series = await Series.find().sort({ createdAt: -1 });
    res.json({ success: true, data: series });
  } catch (error) {
    next(error);
  }
});

// @desc    Create a series
// @route   POST /api/admin/series
// @access  Private
router.post('/series', protectAdmin, async (req, res, next) => {
  try {
    const { payload, error } = validateSeriesPayload(req.body);
    if (error) return badRequest(res, error);
    
    // Ensure unique slug
    const exists = await Series.findOne({ slug: payload.slug });
    if (exists) {
      return res.status(400).json({ success: false, message: 'Slug already exists' });
    }

    const newSeries = await Series.create(payload);
    
    res.status(201).json({ success: true, data: newSeries });
  } catch (error) {
    next(error);
  }
});

// @desc    Update a series
// @route   PUT /api/admin/series/:id
// @access  Private
router.put('/series/:id', protectAdmin, async (req, res, next) => {
  try {
    const { payload, error } = validateSeriesPayload(req.body, { partial: true });
    if (error) return badRequest(res, error);

    if (Object.keys(payload).length === 0) {
      return badRequest(res, 'No valid fields provided');
    }

    if (payload.slug) {
      const exists = await Series.findOne({ slug: payload.slug, _id: { $ne: req.params.id } });
      if (exists) {
        return res.status(400).json({ success: false, message: 'Slug already exists' });
      }
    }

    const series = await Series.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true
    });
    if (!series) return res.status(404).json({ success: false, message: 'Series not found' });
    
    res.json({ success: true, data: series });
  } catch (error) {
    next(error);
  }
});

// @desc    Delete a series
// @route   DELETE /api/admin/series/:id
// @access  Private
router.delete('/series/:id', protectAdmin, async (req, res, next) => {
  try {
    const series = await Series.findById(req.params.id);
    if (!series) return res.status(404).json({ success: false, message: 'Series not found' });
    
    await series.deleteOne();
    // Also delete associated episodes
    await Episode.deleteMany({ seriesId: series._id });

    res.json({ success: true, message: 'Series removed' });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// EPISODE MANAGEMENT
// ==========================================

// @desc    Get episodes by series ID
// @route   GET /api/admin/episodes/:seriesId
// @access  Private
router.get('/episodes/:seriesId', protectAdmin, async (req, res, next) => {
  try {
    const episodes = await Episode.find({ seriesId: req.params.seriesId }).sort({ episodeNumber: 1 });
    res.json({ success: true, data: episodes });
  } catch (error) {
    next(error);
  }
});

// @desc    Create an episode
// @route   POST /api/admin/episodes
// @access  Private
router.post('/episodes', protectAdmin, async (req, res, next) => {
  try {
    const { payload, error } = validateEpisodePayload(req.body);
    if (error) return badRequest(res, error);

    const parentSeries = await Series.findById(payload.seriesId);
    if (!parentSeries) {
      return res.status(404).json({ success: false, message: 'Series not found' });
    }
    
    // Ensure unique episode number for the series
    const exists = await Episode.findOne({ seriesId: payload.seriesId, episodeNumber: payload.episodeNumber });
    if (exists) {
      return res.status(400).json({ success: false, message: 'Episode number already exists for this series' });
    }

    const newEpisode = await Episode.create(payload);
    
    // Update totalEpisodes count in Series
    const count = await Episode.countDocuments({ seriesId: payload.seriesId });
    await Series.findByIdAndUpdate(payload.seriesId, { totalEpisodes: count });

    res.status(201).json({ success: true, data: newEpisode });
  } catch (error) {
    next(error);
  }
});

// @desc    Update an episode
// @route   PUT /api/admin/episodes/:id
// @access  Private
router.put('/episodes/:id', protectAdmin, async (req, res, next) => {
  try {
    const { payload, error } = validateEpisodePayload(req.body, { partial: true });
    if (error) return badRequest(res, error);

    if (Object.keys(payload).length === 0) {
      return badRequest(res, 'No valid fields provided');
    }

    if (payload.seriesId) {
      const parentSeries = await Series.findById(payload.seriesId);
      if (!parentSeries) {
        return res.status(404).json({ success: false, message: 'Series not found' });
      }
    }

    const existingEpisode = await Episode.findById(req.params.id);
    if (!existingEpisode) return res.status(404).json({ success: false, message: 'Episode not found' });

    const nextSeriesId = payload.seriesId || existingEpisode.seriesId;
    const nextEpisodeNumber = payload.episodeNumber || existingEpisode.episodeNumber;
    if (payload.seriesId || payload.episodeNumber) {
      const duplicate = await Episode.findOne({
        _id: { $ne: req.params.id },
        seriesId: nextSeriesId,
        episodeNumber: nextEpisodeNumber
      });

      if (duplicate) {
        return res.status(400).json({ success: false, message: 'Episode number already exists for this series' });
      }
    }

    const episode = await Episode.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true
    });

    if (payload.seriesId && String(existingEpisode.seriesId) !== String(payload.seriesId)) {
      const oldCount = await Episode.countDocuments({ seriesId: existingEpisode.seriesId });
      const newCount = await Episode.countDocuments({ seriesId: payload.seriesId });
      await Promise.all([
        Series.findByIdAndUpdate(existingEpisode.seriesId, { totalEpisodes: oldCount }),
        Series.findByIdAndUpdate(payload.seriesId, { totalEpisodes: newCount })
      ]);
    }
    
    res.json({ success: true, data: episode });
  } catch (error) {
    next(error);
  }
});

// @desc    Delete an episode
// @route   DELETE /api/admin/episodes/:id
// @access  Private
router.delete('/episodes/:id', protectAdmin, async (req, res, next) => {
  try {
    const episode = await Episode.findById(req.params.id);
    if (!episode) return res.status(404).json({ success: false, message: 'Episode not found' });
    
    const seriesId = episode.seriesId;
    await episode.deleteOne();
    
    // Update totalEpisodes count in Series
    const count = await Episode.countDocuments({ seriesId });
    await Series.findByIdAndUpdate(seriesId, { totalEpisodes: count });

    res.json({ success: true, message: 'Episode removed' });
  } catch (error) {
    next(error);
  }
});

export default router;
