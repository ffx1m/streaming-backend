import assert from 'node:assert/strict';
import test from 'node:test';
import { recordDailyVisitor, recordSeriesView } from '../services/analytics.js';

test('recordDailyVisitor creates one visitor and atomically increments daily visitors', async () => {
  const calls = [];
  const visitorModel = {
    async create(payload) {
      calls.push(['visitor.create', payload]);
    },
    async findOneAndUpdate(query, update) {
      calls.push(['visitor.findOneAndUpdate', query, update]);
    },
  };
  const analyticsModel = {
    async findOneAndUpdate(query, update, options) {
      calls.push(['analytics.findOneAndUpdate', query, update, options]);
    },
  };

  await recordDailyVisitor({
    ipHash: 'hash-1',
    date: '2026-05-14',
    visitorModel,
    analyticsModel,
  });

  assert.deepEqual(calls, [
    ['visitor.create', { ipHash: 'hash-1', date: '2026-05-14' }],
    [
      'analytics.findOneAndUpdate',
      { date: '2026-05-14' },
      { $inc: { visitors: 1 } },
      { upsert: true, setDefaultsOnInsert: true },
    ],
  ]);
});

test('recordDailyVisitor updates lastSeen without incrementing visitors for duplicate visitor records', async () => {
  const calls = [];
  const duplicateError = new Error('duplicate');
  duplicateError.code = 11000;

  const visitorModel = {
    async create() {
      throw duplicateError;
    },
    async findOneAndUpdate(query, update) {
      calls.push(['visitor.findOneAndUpdate', query, update]);
    },
  };
  const analyticsModel = {
    async findOneAndUpdate() {
      calls.push(['analytics.findOneAndUpdate']);
    },
  };

  await recordDailyVisitor({
    ipHash: 'hash-1',
    date: '2026-05-14',
    visitorModel,
    analyticsModel,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'visitor.findOneAndUpdate');
  assert.deepEqual(calls[0][1], { ipHash: 'hash-1', date: '2026-05-14' });
  assert.ok(calls[0][2].lastSeen instanceof Date);
});

test('recordDailyVisitor rethrows non-duplicate visitor errors', async () => {
  const createError = new Error('database unavailable');
  const visitorModel = {
    async create() {
      throw createError;
    },
  };
  const analyticsModel = {
    async findOneAndUpdate() {},
  };

  await assert.rejects(
    () => recordDailyVisitor({
      ipHash: 'hash-1',
      date: '2026-05-14',
      visitorModel,
      analyticsModel,
    }),
    createError
  );
});

test('recordSeriesView atomically increments series, episode, and daily analytics counters', async () => {
  const calls = [];
  const seriesModel = {
    async findByIdAndUpdate(id, update) {
      calls.push(['series.findByIdAndUpdate', id, update]);
    },
  };
  const episodeModel = {
    async findByIdAndUpdate(id, update) {
      calls.push(['episode.findByIdAndUpdate', id, update]);
    },
  };
  const analyticsModel = {
    async findOneAndUpdate(query, update, options) {
      calls.push(['analytics.findOneAndUpdate', query, update, options]);
    },
  };

  await recordSeriesView({
    date: '2026-05-14',
    seriesId: 'series-1',
    episodeId: 'episode-1',
    seriesModel,
    episodeModel,
    analyticsModel,
  });

  assert.deepEqual(calls, [
    ['series.findByIdAndUpdate', 'series-1', { $inc: { views: 1 } }],
    ['episode.findByIdAndUpdate', 'episode-1', { $inc: { views: 1 } }],
    [
      'analytics.findOneAndUpdate',
      { date: '2026-05-14' },
      { $inc: { pageViews: 1, seriesViews: 1 } },
      { upsert: true, setDefaultsOnInsert: true },
    ],
  ]);
});

test('recordSeriesView increments page views without series views when no series ID is provided', async () => {
  const calls = [];
  const analyticsModel = {
    async findOneAndUpdate(query, update, options) {
      calls.push(['analytics.findOneAndUpdate', query, update, options]);
    },
  };

  await recordSeriesView({
    date: '2026-05-14',
    analyticsModel,
    seriesModel: { async findByIdAndUpdate() {} },
    episodeModel: { async findByIdAndUpdate() {} },
  });

  assert.deepEqual(calls, [
    [
      'analytics.findOneAndUpdate',
      { date: '2026-05-14' },
      { $inc: { pageViews: 1 } },
      { upsert: true, setDefaultsOnInsert: true },
    ],
  ]);
});

