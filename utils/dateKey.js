import { env } from '../config/env.js';

const getDateParts = (date, timeZone) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
};

export const getAnalyticsDateKey = (date = new Date()) => {
  const parts = getDateParts(date, env.analyticsTimeZone);

  return `${parts.year}-${parts.month}-${parts.day}`;
};
