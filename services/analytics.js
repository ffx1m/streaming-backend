import Analytics from '../models/Analytics.js';
import Episode from '../models/Episode.js';
import Series from '../models/Series.js';
import Visitor from '../models/Visitor.js';

const analyticsUpsertOptions = { upsert: true, setDefaultsOnInsert: true };

export const recordDailyVisitor = async ({
  ipHash,
  date,
  visitorModel = Visitor,
  analyticsModel = Analytics,
}) => {
  try {
    await visitorModel.create({ ipHash, date });

    await analyticsModel.findOneAndUpdate(
      { date },
      { $inc: { visitors: 1 } },
      analyticsUpsertOptions
    );
  } catch (error) {
    if (error.code === 11000) {
      await visitorModel.findOneAndUpdate({ ipHash, date }, { lastSeen: new Date() });
      return;
    }

    throw error;
  }
};

export const recordSeriesView = async ({
  date,
  seriesId,
  episodeId,
  seriesModel = Series,
  episodeModel = Episode,
  analyticsModel = Analytics,
}) => {
  const analyticsIncrement = { pageViews: 1 };
  const updates = [];

  if (seriesId) {
    updates.push(seriesModel.findByIdAndUpdate(seriesId, { $inc: { views: 1 } }));
    analyticsIncrement.seriesViews = 1;
  }

  if (episodeId) {
    updates.push(episodeModel.findByIdAndUpdate(episodeId, { $inc: { views: 1 } }));
  }

  updates.push(
    analyticsModel.findOneAndUpdate(
      { date },
      { $inc: analyticsIncrement },
      analyticsUpsertOptions
    )
  );

  await Promise.all(updates);
};

