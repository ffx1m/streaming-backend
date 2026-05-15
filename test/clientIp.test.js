import assert from 'node:assert/strict';
import test from 'node:test';
import { getClientIp } from '../middleware/clientIp.js';

test('getClientIp uses the Express-resolved IP address', () => {
  const req = {
    ip: '203.0.113.10',
    headers: {
      'x-forwarded-for': '198.51.100.99',
    },
    socket: {
      remoteAddress: '127.0.0.1',
    },
  };

  assert.equal(getClientIp(req), '203.0.113.10');
});

test('getClientIp falls back to the socket address', () => {
  const req = {
    headers: {
      'x-forwarded-for': '198.51.100.99',
    },
    socket: {
      remoteAddress: '127.0.0.1',
    },
  };

  assert.equal(getClientIp(req), '127.0.0.1');
});

test('getClientIp returns unknown when no address is available', () => {
  assert.equal(getClientIp({ headers: {} }), 'unknown');
});
