import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import test from 'node:test';
import { createApp } from '../app.js';

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

test('GET /api/health returns ok', async () => {
  await withTestServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, { status: 'ok' });
  });
});

test('GET /api/health includes CORS headers for allowed frontend origin', async () => {
  await withTestServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`, {
      headers: {
        Origin: 'http://localhost:3000',
      },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:3000');
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
  });
});

test('unknown API route returns JSON 404', async () => {
  await withTestServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/missing-route`);
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.deepEqual(body, { success: false, message: 'Resource not found' });
  });
});

