import express from 'express';
import LoginAttempt from '../../models/LoginAttempt.js';
import { protectAdmin, requireAdminCsrf } from '../../middleware/auth.js';
import { getClientIp } from '../../middleware/clientIp.js';
import { validateParamObjectId } from './validators.js';

const router = express.Router();

router.get('/check-lockout', async (req, res, next) => {
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
        remainingMs: attemptRecord.lockUntil - Date.now(),
      });
    }

    res.json({ success: true, locked: false });
  } catch (error) {
    next(error);
  }
});

router.get('/lockouts', protectAdmin, async (req, res, next) => {
  try {
    const lockouts = await LoginAttempt.find({
      $or: [
        { lockUntil: { $gt: new Date() } },
        { isBlacklisted: true },
      ],
    }).sort({ updatedAt: -1 });

    res.json({ success: true, data: lockouts });
  } catch (error) {
    next(error);
  }
});

router.put('/blacklist/:id', protectAdmin, requireAdminCsrf, async (req, res, next) => {
  try {
    if (!validateParamObjectId(res, req.params.id)) return;

    const record = await LoginAttempt.findByIdAndUpdate(req.params.id, {
      isBlacklisted: true,
      lockUntil: new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000),
    }, { new: true });

    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
    res.json({ success: true, message: 'IP permanently blacklisted', data: record });
  } catch (error) {
    next(error);
  }
});

router.delete('/lockouts/:id', protectAdmin, requireAdminCsrf, async (req, res, next) => {
  try {
    if (!validateParamObjectId(res, req.params.id)) return;

    const record = await LoginAttempt.findByIdAndDelete(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
    res.json({ success: true, message: 'IP whitelisted / Record removed' });
  } catch (error) {
    next(error);
  }
});

export default router;
