import assert from 'node:assert/strict';
import test from 'node:test';
import { errorHandler } from '../middleware/error.js';

const createResponse = () => ({
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
});

const withProductionEnv = (callback) => {
  const previousNodeEnv = process.env.NODE_ENV;
  const originalConsoleError = console.error;

  process.env.NODE_ENV = 'production';
  console.error = () => {};

  try {
    callback();
  } finally {
    console.error = originalConsoleError;
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
};

test('errorHandler hides server error details in production', () => {
  withProductionEnv(() => {
    const res = createResponse();
    errorHandler(new Error('database password leaked in stack'), {}, res, () => {});

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.payload, { success: false, message: 'Server Error' });
  });
});

test('errorHandler keeps client error messages in production', () => {
  withProductionEnv(() => {
    const res = createResponse();
    const error = new Error('Invalid request');
    error.statusCode = 400;

    errorHandler(error, {}, res, () => {});

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.payload, { success: false, message: 'Invalid request' });
  });
});
