import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import test from 'node:test';
import bcrypt from 'bcrypt';
import { createApp } from '../app.js';
import Admin from '../models/Admin.js';
import Episode from '../models/Episode.js';
import LoginAttempt from '../models/LoginAttempt.js';
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

const getSetCookieHeaders = (response) => {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie();
  }

  const header = response.headers.get('set-cookie');
  return header ? [header] : [];
};

const toCookieHeader = (setCookieHeaders) => {
  return setCookieHeaders
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
};

const readCookie = (cookieHeader, name) => {
  return cookieHeader
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.slice(name.length + 1);
};

const withMockedModels = async (callback, options = {}) => {
  const originalMethods = {
    adminFindOne: Admin.findOne,
    episodeCountDocuments: Episode.countDocuments,
    episodeCreate: Episode.create,
    episodeDeleteMany: Episode.deleteMany,
    episodeFind: Episode.find,
    episodeFindById: Episode.findById,
    episodeFindByIdAndUpdate: Episode.findByIdAndUpdate,
    episodeFindOne: Episode.findOne,
    loginAttemptFindByIdAndDelete: LoginAttempt.findByIdAndDelete,
    loginAttemptFindByIdAndUpdate: LoginAttempt.findByIdAndUpdate,
    loginAttemptFindOne: LoginAttempt.findOne,
    seriesFindById: Series.findById,
    seriesFindByIdAndUpdate: Series.findByIdAndUpdate,
    seriesFindOne: Series.findOne,
    seriesCreate: Series.create,
  };
  const calls = [];

  const passwordHash = await bcrypt.hash('correct-password', 4);

  Admin.findOne = async ({ username }) => {
    if (username !== 'admin') return null;
    return {
      _id: '507f1f77bcf86cd799439011',
      username: 'admin',
      passwordHash,
    };
  };
  LoginAttempt.findOne = async () => null;
  Series.findOne = async () => (options.duplicateSlug ? { _id: 'existing-series' } : null);
  Series.create = async (payload) => ({ _id: 'series-1', ...payload });
  Series.findById = async (id) => {
    if (options.missingSeries) return null;
    return {
      _id: id,
      async deleteOne() {
        calls.push(['series.deleteOne', id]);
      },
    };
  };
  Series.findByIdAndUpdate = async (id, update) => {
    calls.push(['series.findByIdAndUpdate', id, update]);
  };
  Episode.findOne = async () => (options.duplicateEpisode ? { _id: 'existing-episode' } : null);
  Episode.find = () => ({
    sort: async () => options.episodes ?? [],
  });
  Episode.findById = async (id) => {
    if (options.missingEpisode) return null;
    return {
      _id: id,
      seriesId: validEpisodePayload.seriesId,
      async deleteOne() {
        calls.push(['episode.deleteOne', id]);
      },
    };
  };
  Episode.findByIdAndUpdate = async (id, update) => {
    calls.push(['episode.findByIdAndUpdate', id, update]);
    return { _id: id, ...update };
  };
  Episode.create = async (payload) => ({ _id: 'episode-1', ...payload });
  Episode.countDocuments = async () => options.episodeCount ?? 1;
  Episode.deleteMany = async (query) => {
    calls.push(['episode.deleteMany', query]);
    return { deletedCount: options.deletedEpisodes ?? 2 };
  };
  LoginAttempt.findByIdAndUpdate = async (id, update) => ({ _id: id, ...update });
  LoginAttempt.findByIdAndDelete = async (id) => ({ _id: id });

  try {
    await callback(calls);
  } finally {
    Admin.findOne = originalMethods.adminFindOne;
    Episode.countDocuments = originalMethods.episodeCountDocuments;
    Episode.create = originalMethods.episodeCreate;
    Episode.deleteMany = originalMethods.episodeDeleteMany;
    Episode.find = originalMethods.episodeFind;
    Episode.findById = originalMethods.episodeFindById;
    Episode.findByIdAndUpdate = originalMethods.episodeFindByIdAndUpdate;
    Episode.findOne = originalMethods.episodeFindOne;
    LoginAttempt.findByIdAndDelete = originalMethods.loginAttemptFindByIdAndDelete;
    LoginAttempt.findByIdAndUpdate = originalMethods.loginAttemptFindByIdAndUpdate;
    LoginAttempt.findOne = originalMethods.loginAttemptFindOne;
    Series.findById = originalMethods.seriesFindById;
    Series.findByIdAndUpdate = originalMethods.seriesFindByIdAndUpdate;
    Series.findOne = originalMethods.seriesFindOne;
    Series.create = originalMethods.seriesCreate;
  }
};

const loginAsAdmin = async (baseUrl) => {
  const response = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'correct-password' }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });

  const cookieHeader = toCookieHeader(getSetCookieHeaders(response));
  assert.match(cookieHeader, /admin_token=/);
  assert.match(cookieHeader, /admin_csrf=/);

  return {
    cookieHeader,
    csrfToken: decodeURIComponent(readCookie(cookieHeader, 'admin_csrf')),
  };
};

const validSeriesPayload = {
  title: 'Test Series',
  slug: 'test-series',
  description: 'A test series description',
  posterUrl: 'https://example.com/poster.jpg',
  languageType: 'thai_sub',
  isPopular: false,
  isNewSeries: true,
};

const validEpisodePayload = {
  seriesId: '507f1f77bcf86cd799439011',
  episodeNumber: 1,
  title: 'Episode 1',
  videoUrl: 'https://example.com/video.mp4',
};

const authHeaders = ({ cookieHeader, csrfToken }) => ({
  'Content-Type': 'application/json',
  Cookie: cookieHeader,
  'X-CSRF-Token': csrfToken,
});

test('admin login sets auth and csrf cookies', async () => {
  await withMockedModels(async () => {
    await withTestServer(async (baseUrl) => {
      await loginAsAdmin(baseUrl);
    });
  });
});

test('admin mutation without auth token returns 401', async () => {
  await withMockedModels(async () => {
    await withTestServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/admin/series`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validSeriesPayload),
      });
      const body = await response.json();

      assert.equal(response.status, 401);
      assert.deepEqual(body, { message: 'Not authorized to access this route' });
    });
  });
});

test('admin mutation with auth cookie but without csrf header returns 403', async () => {
  await withMockedModels(async () => {
    await withTestServer(async (baseUrl) => {
      const { cookieHeader } = await loginAsAdmin(baseUrl);

      const response = await fetch(`${baseUrl}/api/admin/series`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookieHeader,
        },
        body: JSON.stringify(validSeriesPayload),
      });
      const body = await response.json();

      assert.equal(response.status, 403);
      assert.deepEqual(body, { success: false, message: 'Invalid CSRF token' });
    });
  });
});

test('admin mutation with matching auth cookie and csrf header succeeds', async () => {
  await withMockedModels(async () => {
    await withTestServer(async (baseUrl) => {
      const { cookieHeader, csrfToken } = await loginAsAdmin(baseUrl);

      const response = await fetch(`${baseUrl}/api/admin/series`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookieHeader,
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify(validSeriesPayload),
      });
      const body = await response.json();

      assert.equal(response.status, 201);
      assert.equal(body.success, true);
      assert.deepEqual(body.data, { _id: 'series-1', ...validSeriesPayload });
    });
  });
});

test('create series rejects invalid slugs', async () => {
  await withMockedModels(async () => {
    await withTestServer(async (baseUrl) => {
      const auth = await loginAsAdmin(baseUrl);

      const response = await fetch(`${baseUrl}/api/admin/series`, {
        method: 'POST',
        headers: authHeaders(auth),
        body: JSON.stringify({ ...validSeriesPayload, slug: 'ชื่อไทย' }),
      });
      const body = await response.json();

      assert.equal(response.status, 400);
      assert.deepEqual(body, {
        success: false,
        message: 'Slug must contain lowercase letters, numbers, and hyphens only',
      });
    });
  });
});

test('create series rejects duplicate slugs', async () => {
  await withMockedModels(async () => {
    await withTestServer(async (baseUrl) => {
      const auth = await loginAsAdmin(baseUrl);

      const response = await fetch(`${baseUrl}/api/admin/series`, {
        method: 'POST',
        headers: authHeaders(auth),
        body: JSON.stringify(validSeriesPayload),
      });
      const body = await response.json();

      assert.equal(response.status, 400);
      assert.deepEqual(body, { success: false, message: 'Slug already exists' });
    });
  }, { duplicateSlug: true });
});

test('create episode rejects duplicate episode numbers for the same series', async () => {
  await withMockedModels(async () => {
    await withTestServer(async (baseUrl) => {
      const auth = await loginAsAdmin(baseUrl);

      const response = await fetch(`${baseUrl}/api/admin/episodes`, {
        method: 'POST',
        headers: authHeaders(auth),
        body: JSON.stringify(validEpisodePayload),
      });
      const body = await response.json();

      assert.equal(response.status, 400);
      assert.deepEqual(body, {
        success: false,
        message: 'Episode number already exists for this series',
      });
    });
  }, { duplicateEpisode: true });
});

test('create episode succeeds and refreshes the parent series episode count', async () => {
  await withMockedModels(async (calls) => {
    await withTestServer(async (baseUrl) => {
      const auth = await loginAsAdmin(baseUrl);

      const response = await fetch(`${baseUrl}/api/admin/episodes`, {
        method: 'POST',
        headers: authHeaders(auth),
        body: JSON.stringify(validEpisodePayload),
      });
      const body = await response.json();

      assert.equal(response.status, 201);
      assert.equal(body.success, true);
      assert.deepEqual(body.data, { _id: 'episode-1', ...validEpisodePayload });
      assert.deepEqual(calls, [
        ['series.findByIdAndUpdate', validEpisodePayload.seriesId, { totalEpisodes: 1 }],
      ]);
    });
  });
});

test('delete series deletes the series and its episodes', async () => {
  await withMockedModels(async (calls) => {
    await withTestServer(async (baseUrl) => {
      const auth = await loginAsAdmin(baseUrl);
      const seriesId = '507f1f77bcf86cd799439011';

      const response = await fetch(`${baseUrl}/api/admin/series/${seriesId}`, {
        method: 'DELETE',
        headers: authHeaders(auth),
      });
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.deepEqual(body, { success: true, message: 'Series removed' });
      assert.deepEqual(calls, [
        ['series.deleteOne', seriesId],
        ['episode.deleteMany', { seriesId }],
      ]);
    });
  });
});

test('admin series routes reject invalid series IDs', async () => {
  await withMockedModels(async () => {
    await withTestServer(async (baseUrl) => {
      const auth = await loginAsAdmin(baseUrl);

      const updateResponse = await fetch(`${baseUrl}/api/admin/series/not-an-id`, {
        method: 'PUT',
        headers: authHeaders(auth),
        body: JSON.stringify({ title: 'Updated Series' }),
      });
      assert.equal(updateResponse.status, 400);
      assert.deepEqual(await updateResponse.json(), { success: false, message: 'Invalid series ID' });

      const deleteResponse = await fetch(`${baseUrl}/api/admin/series/not-an-id`, {
        method: 'DELETE',
        headers: authHeaders(auth),
      });
      assert.equal(deleteResponse.status, 400);
      assert.deepEqual(await deleteResponse.json(), { success: false, message: 'Invalid series ID' });
    });
  });
});

test('admin episode routes reject invalid IDs', async () => {
  await withMockedModels(async () => {
    await withTestServer(async (baseUrl) => {
      const auth = await loginAsAdmin(baseUrl);

      const listResponse = await fetch(`${baseUrl}/api/admin/episodes/not-an-id`, {
        headers: { Cookie: auth.cookieHeader },
      });
      assert.equal(listResponse.status, 400);
      assert.deepEqual(await listResponse.json(), { success: false, message: 'Invalid series ID' });

      const updateResponse = await fetch(`${baseUrl}/api/admin/episodes/not-an-id`, {
        method: 'PUT',
        headers: authHeaders(auth),
        body: JSON.stringify({ title: 'Updated Episode' }),
      });
      assert.equal(updateResponse.status, 400);
      assert.deepEqual(await updateResponse.json(), { success: false, message: 'Invalid episode ID' });

      const deleteResponse = await fetch(`${baseUrl}/api/admin/episodes/not-an-id`, {
        method: 'DELETE',
        headers: authHeaders(auth),
      });
      assert.equal(deleteResponse.status, 400);
      assert.deepEqual(await deleteResponse.json(), { success: false, message: 'Invalid episode ID' });
    });
  });
});

test('admin security routes reject invalid lockout IDs', async () => {
  await withMockedModels(async () => {
    await withTestServer(async (baseUrl) => {
      const auth = await loginAsAdmin(baseUrl);

      const blacklistResponse = await fetch(`${baseUrl}/api/admin/security/blacklist/not-an-id`, {
        method: 'PUT',
        headers: authHeaders(auth),
      });
      assert.equal(blacklistResponse.status, 400);
      assert.deepEqual(await blacklistResponse.json(), { success: false, message: 'Invalid ID' });

      const deleteResponse = await fetch(`${baseUrl}/api/admin/security/lockouts/not-an-id`, {
        method: 'DELETE',
        headers: authHeaders(auth),
      });
      assert.equal(deleteResponse.status, 400);
      assert.deepEqual(await deleteResponse.json(), { success: false, message: 'Invalid ID' });
    });
  });
});
