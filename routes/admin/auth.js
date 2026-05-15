import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import Admin from '../../models/Admin.js';
import LoginAttempt from '../../models/LoginAttempt.js';
import { protectAdmin, requireAdminCsrf } from '../../middleware/auth.js';
import { getClientIp } from '../../middleware/clientIp.js';
import { getAdminCookieOptions, getClearAdminCookieOptions } from './cookies.js';

const router = express.Router();

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const ip = getClientIp(req);
    let attemptRecord = await LoginAttempt.findOne({ ip });

    if (attemptRecord?.isBlacklisted) {
      return res.status(403).json({
        success: false,
        message: 'Your IP has been permanently banned from accessing this system.',
      });
    }

    if (attemptRecord?.lockUntil && attemptRecord.lockUntil > Date.now()) {
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
        message: `Too many failed attempts. Please try again in ${waitTimeMsg}.`,
      });
    }

    const handleFailure = async () => {
      if (!attemptRecord) {
        attemptRecord = new LoginAttempt({ ip, attempts: 1 });
      } else {
        attemptRecord.attempts += 1;
      }

      let lockDuration = 0;
      if (attemptRecord.attempts === 3) {
        lockDuration = 30 * 1000;
      } else if (attemptRecord.attempts === 4) {
        lockDuration = 60 * 1000;
      } else if (attemptRecord.attempts >= 5 && attemptRecord.attempts < 10) {
        lockDuration = 15 * 60 * 1000;
      } else if (attemptRecord.attempts >= 10) {
        lockDuration = 24 * 60 * 60 * 1000;
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

    const adminUser = await Admin.findOne({ username });
    if (!adminUser) {
      return await handleFailure();
    }

    const isMatch = await bcrypt.compare(password, adminUser.passwordHash);
    if (!isMatch) {
      return await handleFailure();
    }

    if (attemptRecord) {
      await LoginAttempt.deleteOne({ ip });
    }

    const csrfToken = crypto.randomBytes(32).toString('hex');
    const token = jwt.sign(
      { id: adminUser._id, username: adminUser.username, csrfToken },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.cookie('admin_token', token, getAdminCookieOptions());
    res.cookie('admin_csrf', csrfToken, getAdminCookieOptions({ httpOnly: false }));
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', protectAdmin, requireAdminCsrf, (req, res) => {
  res.clearCookie('admin_token', getClearAdminCookieOptions());
  res.clearCookie('admin_csrf', getClearAdminCookieOptions({ httpOnly: false }));
  res.json({ success: true });
});

export default router;
