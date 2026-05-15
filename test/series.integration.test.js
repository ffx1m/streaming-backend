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

const createQueryChain = ({ onSort, onSkip, onLimit, onLean, result }) => ({
  sort(sortSpec) {
    onSort?.(sortSpec);
    return this;
  },
  skip(skipValue) {
    onSkip?.(skipValue);
    return this;
  },
  limit(limitValue) {
    onLimit?.(limitValue);
    return this;
  },
  lean() {
    onLean?.();
    return Promise.resolve(result);
  },
  then(resolve, reject) {
    return Promise.resolve(result).then(resolve, reject);
  },
});

const withMockedSeriesModels = async (callback, options = {}) => {
  const originalMethods = {
    analyticsFindOneAndUpdate: Analytics.findOneAndUpdate,
    episodeFind: Episode.find,
    episodeCountDocuments: Episode.countDocuments,
    episodeFindByIdAndUpdate: Episode.findByIdAndUpdate,
    seriesFind: Series.find,
    seriesFindByIdAndUpdate: Series.findByIdAndUpdate,
    seriesFindOne: Series.findOne,
    seriesCountDocuments: Series.countDocuments,
  };
  const calls = [];

  Series.find = (query) => {
    calls.push(['series.find', query]);
    return createQueryChain({
      onSort: (sortSpec) => calls.push(['series.sort', sortSpec]),
      onSkip: (skipValue) => calls.push(['series.skip', skipValue]),
      onLimit: (limitValue) => calls.push(['series.limit', limitValue]),
      result: options.seriesList ?? [{ _id: '507f1f77bcf86cd799439011', title: 'Series 1' }],
    });
  };
  Series.countDocuments = async (query) => {
    calls.push(['series.countDocuments', query]);
    return options.seriesTotal ?? (options.seriesList ?? [{ _id: '507f1f77bcf86cd799439011', title: 'Series 1' }]).length;
  };

  Series.findOne = (query) => {
    calls.push(['series.findOne', query]);
    return {
      select: () => ({
        lean: async () => options.seriesDetail ?? null,
      }),
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
  Episode.countDocuments = async (query) => {
    calls.push(['episode.countDocuments', query]);
    return options.episodes?.length ?? 0;
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
    Episode.countDocuments = originalMethods.episodeCountDocuments;
    Episode.findByIdAndUpdate = originalMethods.episodeFindByIdAndUpdate;
    Series.find = originalMethods.seriesFind;
    Series.findByIdAndUpdate = originalMethods.seriesFindByIdAndUpdate;
    Series.findOne = originalMethods.seriesFindOne;
    Series.countDocuments = originalMethods.seriesCountDocuments;
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
      assert.equal(response.headers.get('cache-control'), 'public, max-age=60, stale-while-revalidate=300');
      assert.deepEqual(body, {
        success: true,
        data: [{ _id: '507f1f77bcf86cd799439011', title: 'Series 1' }],
        pagination: {
          page: 1,
          limit: 24,
          total: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      });
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

test('GET /api/series/home returns home sections in one response', async () => {
  await withMockedSeriesModels(async (calls) => {
    await withTestServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/series/home`);
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'public, max-age=300, stale-while-revalidate=1200');
      assert.deepEqual(body, {
        success: true,
        data: {
          popular: [{ _id: '507f1f77bcf86cd799439011', title: 'Series 1' }],
          newSeries: [{ _id: '507f1f77bcf86cd799439011', title: 'Series 1' }],
          latest: [{ _id: '507f1f77bcf86cd799439011', title: 'Series 1' }],
        },
      });
      assert.deepEqual(calls.filter((call) => call[0] === 'series.find'), [
        ['series.find', { isPopular: true }],
        ['series.find', { isNewSeries: true }],
        ['series.find', {}],
      ]);
      assert.deepEqual(calls.filter((call) => call[0] === 'series.limit'), [
        ['series.limit', 12],
        ['series.limit', 12],
        ['series.limit', 12],
      ]);
    });
  });
});

test('GET /api/series applies page offset and returns pagination metadata', async () => {
  await withMockedSeriesModels(async (calls) => {
    await withTestServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/series?page=3&limit=10`);
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.deepEqual(calls.find((call) => call[0] === 'series.skip'), ['series.skip', 20]);
      assert.deepEqual(calls.find((call) => call[0] === 'series.limit'), ['series.limit', 10]);
      assert.deepEqual(calls.find((call) => call[0] === 'series.countDocuments'), ['series.countDocuments', {}]);
      assert.deepEqual(body.pagination, {
        page: 3,
        limit: 10,
        total: 35,
        totalPages: 4,
        hasNextPage: true,
        hasPreviousPage: true,
      });
    });
  }, { seriesTotal: 35 });
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

test('GET /api/series/:slug returns a series without episodes', async () => {
  const seriesDetail = {
    _id: '507f1f77bcf86cd799439011',
    slug: 'test-series',
    title: 'Test Series',
  };

  await withMockedSeriesModels(async (calls) => {
    await withTestServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/series/test-series`);
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'public, max-age=300, stale-while-revalidate=1800');
      assert.deepEqual(body, {
        success: true,
        data: seriesDetail,
      });
      assert.deepEqual(calls, [
        ['series.findOne', { slug: 'test-series' }],
      ]);
    });
  }, { seriesDetail });
});

test('GET /api/series/:slug/episodes returns paginated episodes', async () => {
  const seriesDetail = { _id: '507f1f77bcf86cd799439011' };
  const episodes = [
    { _id: 'episode-1', episodeNumber: 1, videoUrl: 'https://series.film01-thirx.workers.dev/video1.m3u8' },
    { _id: 'episode-2', episodeNumber: 2, videoUrl: 'https://series.film01-thirx.workers.dev/video2.m3u8' },
  ];

  await withMockedSeriesModels(async (calls) => {
    await withTestServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/series/test-series/episodes`);
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'public, max-age=600, stale-while-revalidate=3600');
      assert.equal(body.success, true);
      assert.equal(body.data.length, 2);
      assert.ok(body.data[0].videoUrl.includes('sig='));
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
