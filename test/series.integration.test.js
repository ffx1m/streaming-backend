import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import test from 'node:test';
import { createApp } from '../app.js';
import Analytics from '../models/Analytics.js';
import Episode from '../models/Episode.js';
import Series from '../models/Series.js';

const withTestServer = async (callback) => {
  const server = http.createServer(createApp({ enableRequestLogging: false }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await callback(baseUrl);
  } finally {
    server.close();
    await once(server, 'close');
  }
};

const createQueryChain = ({ onSort, onLimit, onLean, result }) => ({
  sort(sortSpec) {
    onSort?.(sortSpec);
    return this;
  },
  limit(limitValue) {
    onLimit?.(limitValue);
    return Promise.resolve(result);
  },
  lean() {
    onLean?.();
    return Promise.resolve(result);
  },
});

const withMockedSeriesModels = async (callback, options = {}) => {
  const originalMethods = {
    analyticsFindOneAndUpdate: Analytics.findOneAndUpdate,
    episodeFind: Episode.find,
    episodeFindByIdAndUpdate: Episode.findByIdAndUpdate,
    seriesFind: Series.find,
    seriesFindByIdAndUpdate: Series.findByIdAndUpdate,
    seriesFindOne: Series.findOne,
  };
  const calls = [];

  Series.find = (query) => {
    calls.push(['series.find', query]);
    return createQueryChain({
      onSort: (sortSpec) => calls.push(['series.sort', sortSpec]),
      onLimit: (limitValue) => calls.push(['series.limit', limitValue]),
      result: options.seriesList ?? [{ _id: 'series-1', title: 'Series 1' }],
    });
  };

  Series.findOne = (query) => {
    calls.push(['series.findOne', query]);
    return {
      lean: async () => options.seriesDetail ?? null,
    };
  };

  Episode.find = (query) => {
    calls.push(['episode.find', query]);
    return createQueryChain({
      onSort: (sortSpec) => calls.push(['episode.sort', sortSpec]),
      onLean: () => calls.push(['episode.lean']),
      result: options.episodes ?? [],
    });
  };
  Series.findByIdAndUpdate = async (id, update) => {
    calls.push(['series.findByIdAndUpdate', id, update]);
  };
  Episode.findByIdAndUpdate = async (id, update) => {
    calls.push(['episode.findByIdAndUpdate', id, update]);
  };
  Analytics.findOneAndUpdate = async (query, update, updateOptions) => {
    calls.push(['analytics.findOneAndUpdate', query, update, updateOptions]);
  };

  try {
    await callback(calls);
  } finally {
    Analytics.findOneAndUpdate = originalMethods.analyticsFindOneAndUpdate;
    Episode.find = originalMethods.episodeFind;
    Episode.findByIdAndUpdate = originalMethods.episodeFindByIdAndUpdate;
    Series.find = originalMethods.seriesFind;
    Series.findByIdAndUpdate = originalMethods.seriesFindByIdAndUpdate;
    Series.findOne = originalMethods.seriesFindOne;
  }
};

test('GET /api/series escapes search regex and applies filters', async () => {
  await withMockedSeriesModels(async (calls) => {
    await withTestServer(async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/series?search=a.b%5Btest%5D&languageType=thai_sub&isPopular=true`
      );
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.deepEqual(body, { success: true, data: [{ _id: 'series-1', title: 'Series 1' }] });
      assert.deepEqual(calls[0], [
        'series.find',
        {
          languageType: 'thai_sub',
          isPopular: true,
          title: { $regex: 'a\\.b\\[test\\]', $options: 'i' },
        },
      ]);
    });
  });
});

test('GET /api/series clamps excessive limits to the maximum', async () => {
  await withMockedSeriesModels(async (calls) => {
    await withTestServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/series?limit=999999`);

      assert.equal(response.status, 200);
      assert.deepEqual(calls.find((call) => call[0] === 'series.limit'), ['series.limit', 1000]);
    });
  });
});

test('GET /api/series uses the default limit for invalid limits', async () => {
  await withMockedSeriesModels(async (calls) => {
    await withTestServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/series?limit=-1`);

      assert.equal(response.status, 200);
      assert.deepEqual(calls.find((call) => call[0] === 'series.limit'), ['series.limit', 24]);
    });
  });
});

test('GET /api/series/:slug returns a series with sorted episodes', async () => {
  const seriesDetail = {
    _id: 'series-1',
    slug: 'test-series',
    title: 'Test Series',
  };
  const episodes = [
    { _id: 'episode-1', episodeNumber: 1 },
    { _id: 'episode-2', episodeNumber: 2 },
  ];

  await withMockedSeriesModels(async (calls) => {
    await withTestServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/series/test-series`);
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.deepEqual(body, {
        success: true,
        data: {
          ...seriesDetail,
          episodes,
        },
      });
      assert.deepEqual(calls, [
        ['series.findOne', { slug: 'test-series' }],
        ['episode.find', { seriesId: 'series-1' }],
        ['episode.sort', { episodeNumber: 1 }],
        ['episode.lean'],
      ]);
    });
  }, { seriesDetail, episodes });
});

test('GET /api/series/:slug returns 404 when a series is missing', async () => {
  await withMockedSeriesModels(async () => {
    await withTestServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/series/missing-series`);
      const body = await response.json();

      assert.equal(response.status, 404);
      assert.deepEqual(body, { success: false, message: 'Series not found' });
    });
  });
});

test('POST /api/series/view rejects invalid object IDs', async () => {
  await withMockedSeriesModels(async (calls) => {
    await withTestServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/series/view`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seriesId: 'not-an-id', episodeId: '507f1f77bcf86cd799439011' }),
      });
      const body = await response.json();

      assert.equal(response.status, 400);
      assert.deepEqual(body, { success: false, message: 'Invalid series or episode ID' });
      assert.deepEqual(calls, []);
    });
  });
});

test('POST /api/series/view records views for valid object IDs', async () => {
  const seriesId = '507f1f77bcf86cd799439011';
  const episodeId = '507f1f77bcf86cd799439012';

  await withMockedSeriesModels(async (calls) => {
    await withTestServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/series/view`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seriesId, episodeId }),
      });
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.deepEqual(body, { success: true });
      assert.equal(calls.length, 3);
      assert.deepEqual(calls[0], ['series.findByIdAndUpdate', seriesId, { $inc: { views: 1 } }]);
      assert.deepEqual(calls[1], ['episode.findByIdAndUpdate', episodeId, { $inc: { views: 1 } }]);
      assert.equal(calls[2][0], 'analytics.findOneAndUpdate');
      assert.deepEqual(calls[2][2], { $inc: { pageViews: 1, seriesViews: 1 } });
      assert.deepEqual(calls[2][3], { upsert: true, setDefaultsOnInsert: true });
    });
  });
});
