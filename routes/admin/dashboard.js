import express from 'express';
import Episode from '../../models/Episode.js';
import Series from '../../models/Series.js';
import Visitor from '../../models/Visitor.js';
import { protectAdmin } from '../../middleware/auth.js';
import { getAnalyticsDateKey } from '../../utils/dateKey.js';

const router = express.Router();

router.get('/dashboard', protectAdmin, async (req, res, next) => {
  try {
    const totalSeries = await Series.countDocuments();
    const totalEpisodes = await Episode.countDocuments();
    const seriesAggregation = await Series.aggregate([
      { $group: { _id: null, totalViews: { $sum: '$views' } } },
    ]);
    const totalViews = seriesAggregation.length > 0 ? seriesAggregation[0].totalViews : 0;

    const today = getAnalyticsDateKey();
    const dailyUsers = await Visitor.countDocuments({ date: today });
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const activeUsers = await Visitor.countDocuments({
      date: today,
      lastSeen: { $gte: fifteenMinutesAgo },
    });

    res.json({
      success: true,
      data: {
        totalSeries,
        totalEpisodes,
        activeUsers,
        dailyUsers,
        totalViews,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
