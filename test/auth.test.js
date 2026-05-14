import assert from 'node:assert/strict';
import test from 'node:test';
import { getCookieValue, requireAdminCsrf } from '../middleware/auth.js';

const createResponse = () => {
  const response = {
    statusCode: 200,
    payload: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };

  return response;
};

const createRequest = ({ method = 'POST', headerToken, cookieToken, claimToken } = {}) => ({
  method,
  headers: {
    cookie: cookieToken ? `other=value; admin_csrf=${cookieToken}` : '',
  },
  admin: claimToken ? { csrfToken: claimToken } : {},
  get(name) {
    return name.toLowerCase() === 'x-csrf-token' ? headerToken : undefined;
  },
});

test('getCookieValue reads a named cookie from a cookie header', () => {
  assert.equal(getCookieValue('foo=bar; admin_csrf=token-123; theme=dark', 'admin_csrf'), 'token-123');
});

test('requireAdminCsrf skips safe methods', () => {
  const req = createRequest({ method: 'GET' });
  const res = createResponse();
  let nextCalled = false;

  requireAdminCsrf(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});

test('requireAdminCsrf rejects unsafe requests without matching tokens', () => {
  const req = createRequest({ headerToken: 'one', cookieToken: 'two', claimToken: 'one' });
  const res = createResponse();
  let nextCalled = false;

  requireAdminCsrf(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.payload, { success: false, message: 'Invalid CSRF token' });
});

test('requireAdminCsrf allows unsafe requests with matching header, cookie, and JWT claim', () => {
  const req = createRequest({ headerToken: 'csrf-token', cookieToken: 'csrf-token', claimToken: 'csrf-token' });
  const res = createResponse();
  let nextCalled = false;

  requireAdminCsrf(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});

