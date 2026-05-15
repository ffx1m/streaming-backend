import express from 'express';
import Episode from '../../models/Episode.js';
import Series from '../../models/Series.js';
import { protectAdmin, requireAdminCsrf } from '../../middleware/auth.js';
import { badRequest, validateEpisodePayload, validateParamObjectId } from './validators.js';

const router = express.Router();

router.get('/episodes/:seriesId', protectAdmin, async (req, res, next) => {
  try {
    if (!validateParamObjectId(res, req.params.seriesId, 'series ID')) return;

    const episodes = await Episode.find({ seriesId: req.params.seriesId }).sort({ episodeNumber: 1 });
    res.json({ success: true, data: episodes });
  } catch (error) {
    next(error);
  }
});

router.post('/episodes', protectAdmin, requireAdminCsrf, async (req, res, next) => {
  try {
    const { payload, error } = validateEpisodePayload(req.body);
    if (error) return badRequest(res, error);

    const parentSeries = await Series.findById(payload.seriesId);
    if (!parentSeries) {
      return res.status(404).json({ success: false, message: 'Series not found' });
    }

    const exists = await Episode.findOne({ seriesId: payload.seriesId, episodeNumber: payload.episodeNumber });
    if (exists) {
      return res.status(400).json({ success: false, message: 'Episode number already exists for this series' });
    }

    const newEpisode = await Episode.create(payload);
    const count = await Episode.countDocuments({ seriesId: payload.seriesId });
    await Series.findByIdAndUpdate(payload.seriesId, { totalEpisodes: count });

    res.status(201).json({ success: true, data: newEpisode });
  } catch (error) {
    next(error);
  }
});

router.put('/episodes/:id', protectAdmin, requireAdminCsrf, async (req, res, next) => {
  try {
    if (!validateParamObjectId(res, req.params.id, 'episode ID')) return;

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
        episodeNumber: nextEpisodeNumber,
      });

      if (duplicate) {
        return res.status(400).json({ success: false, message: 'Episode number already exists for this series' });
      }
    }

    const episode = await Episode.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });

    if (payload.seriesId && String(existingEpisode.seriesId) !== String(payload.seriesId)) {
      const oldCount = await Episode.countDocuments({ seriesId: existingEpisode.seriesId });
      const newCount = await Episode.countDocuments({ seriesId: payload.seriesId });
      await Promise.all([
        Series.findByIdAndUpdate(existingEpisode.seriesId, { totalEpisodes: oldCount }),
        Series.findByIdAndUpdate(payload.seriesId, { totalEpisodes: newCount }),
      ]);
    }

    res.json({ success: true, data: episode });
  } catch (error) {
    next(error);
  }
});

router.delete('/episodes/:id', protectAdmin, requireAdminCsrf, async (req, res, next) => {
  try {
    if (!validateParamObjectId(res, req.params.id, 'episode ID')) return;

    const episode = await Episode.findById(req.params.id);
    if (!episode) return res.status(404).json({ success: false, message: 'Episode not found' });

    const seriesId = episode.seriesId;
    await episode.deleteOne();

    const count = await Episode.countDocuments({ seriesId });
    await Series.findByIdAndUpdate(seriesId, { totalEpisodes: count });

    res.json({ success: true, message: 'Episode removed' });
  } catch (error) {
    next(error);
  }
});

export default router;
