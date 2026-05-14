import assert from 'node:assert/strict';
import test from 'node:test';
import { getAnalyticsDateKey } from '../utils/dateKey.js';

test('getAnalyticsDateKey uses the configured analytics timezone', () => {
  assert.equal(getAnalyticsDateKey(new Date('2026-05-13T16:59:59.000Z')), '2026-05-13');
  assert.equal(getAnalyticsDateKey(new Date('2026-05-13T17:00:00.000Z')), '2026-05-14');
});

