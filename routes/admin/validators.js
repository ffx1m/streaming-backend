import mongoose from 'mongoose';

const allowedLanguages = new Set(['thai_dub', 'thai_sub']);
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const trimString = (value) => (typeof value === 'string' ? value.trim() : '');
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

const isValidUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

export const badRequest = (res, message) => res.status(400).json({ success: false, message });

export const validateParamObjectId = (res, value, label = 'ID') => {
  if (mongoose.Types.ObjectId.isValid(value)) return true;

  badRequest(res, `Invalid ${label}`);
  return false;
};

export const validateSeriesPayload = (body, { partial = false } = {}) => {
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

export const validateEpisodePayload = (body, { partial = false } = {}) => {
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
