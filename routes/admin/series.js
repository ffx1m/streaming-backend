import express from 'express';
import Episode from '../../models/Episode.js';
import Series from '../../models/Series.js';
import { protectAdmin, requireAdminCsrf } from '../../middleware/auth.js';
import { badRequest, validateParamObjectId, validateSeriesPayload } from './validators.js';

const router = express.Router();

router.get('/series', protectAdmin, async (req, res, next) => {
  try {
    const series = await Series.find().sort({ createdAt: -1 });
    res.json({ success: true, data: series });
  } catch (error) {
    next(error);
  }
});

router.post('/series', protectAdmin, requireAdminCsrf, async (req, res, next) => {
  try {
    const { payload, error } = validateSeriesPayload(req.body);
    if (error) return badRequest(res, error);

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

router.put('/series/:id', protectAdmin, requireAdminCsrf, async (req, res, next) => {
  try {
    if (!validateParamObjectId(res, req.params.id, 'series ID')) return;

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
      runValidators: true,
    });
    if (!series) return res.status(404).json({ success: false, message: 'Series not found' });

    res.json({ success: true, data: series });
  } catch (error) {
    next(error);
  }
});

router.delete('/series/:id', protectAdmin, requireAdminCsrf, async (req, res, next) => {
  try {
    if (!validateParamObjectId(res, req.params.id, 'series ID')) return;

    const series = await Series.findById(req.params.id);
    if (!series) return res.status(404).json({ success: false, message: 'Series not found' });

    await series.deleteOne();
    await Episode.deleteMany({ seriesId: series._id });

    res.json({ success: true, message: 'Series removed' });
  } catch (error) {
    next(error);
  }
});

export default router;
