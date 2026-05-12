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

const router = express.Router();

// @desc    Admin Login
// @route   POST /api/admin/login
// @access  Public
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;

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
    
    res.json({ success: true, token });
  } catch (error) {
    next(error);
  }
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
    const { title, slug, description, posterUrl, languageType, isPopular, isNewSeries } = req.body;
    
    // Ensure unique slug
    const exists = await Series.findOne({ slug });
    if (exists) {
      return res.status(400).json({ success: false, message: 'Slug already exists' });
    }

    const newSeries = await Series.create({
      title, slug, description, posterUrl, languageType, isPopular, isNewSeries
    });
    
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
    const series = await Series.findByIdAndUpdate(req.params.id, req.body, {
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
    const { seriesId, episodeNumber, title, videoUrl } = req.body;
    
    // Ensure unique episode number for the series
    const exists = await Episode.findOne({ seriesId, episodeNumber });
    if (exists) {
      return res.status(400).json({ success: false, message: 'Episode number already exists for this series' });
    }

    const newEpisode = await Episode.create({ seriesId, episodeNumber, title, videoUrl });
    
    // Update totalEpisodes count in Series
    const count = await Episode.countDocuments({ seriesId });
    await Series.findByIdAndUpdate(seriesId, { totalEpisodes: count });

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
    const episode = await Episode.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    if (!episode) return res.status(404).json({ success: false, message: 'Episode not found' });
    
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