import dotenv from 'dotenv';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

const getCorsOrigins = () => {
  return (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || (isProduction ? '' : 'http://localhost:3000'))
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const getTrustProxy = () => {
  const value = process.env.TRUST_PROXY || (isProduction ? '1' : 'false');
  return value === 'false' ? false : Number(value) || value;
};

const validateEnv = () => {
  const errors = [];
  const corsOrigins = getCorsOrigins();

  if (!process.env.MONGO_URI) {
    errors.push('MONGO_URI is required');
  }

  if (!process.env.JWT_SECRET) {
    errors.push('JWT_SECRET is required');
  } else if (isProduction && process.env.JWT_SECRET.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters in production');
  }

  if (isProduction && corsOrigins.length === 0) {
    errors.push('CORS_ORIGINS or CORS_ORIGIN is required in production');
  }

  if (process.env.ADMIN_COOKIE_SAMESITE?.toLowerCase() === 'none' && !isProduction) {
    errors.push('ADMIN_COOKIE_SAMESITE=none requires NODE_ENV=production so cookies are Secure');
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n- ${errors.join('\n- ')}`);
  }
};

const logEnvSummary = () => {
  const corsOrigins = getCorsOrigins();

  console.log('Environment configuration loaded', {
    nodeEnv: process.env.NODE_ENV || 'development',
    corsOrigins,
    trustProxy: getTrustProxy(),
    adminCookieSameSite: process.env.ADMIN_COOKIE_SAMESITE || (isProduction ? 'none' : 'lax'),
  });
};

export const env = {
  isProduction,
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGO_URI,
  corsOrigins: getCorsOrigins(),
  trustProxy: getTrustProxy(),
  validate: validateEnv,
  logSummary: logEnvSummary,
};
