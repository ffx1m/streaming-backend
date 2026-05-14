import { env } from '../config/env.js';

const weakPasswords = new Set(['password', 'password123', 'admin', 'admin123', '12345678', '123456789']);
const errors = [];
const warnings = [];

const requireValue = (name) => {
  if (!process.env[name]?.trim()) {
    errors.push(`${name} is required`);
  }
};

requireValue('MONGO_URI');
requireValue('JWT_SECRET');
requireValue('ADMIN_USERNAME');
requireValue('ADMIN_PASSWORD');

if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
  errors.push('JWT_SECRET must be at least 32 characters');
}

if (process.env.ADMIN_PASSWORD) {
  if (process.env.ADMIN_PASSWORD.length < 12) {
    errors.push('ADMIN_PASSWORD must be at least 12 characters');
  }
  if (weakPasswords.has(process.env.ADMIN_PASSWORD.toLowerCase())) {
    errors.push('ADMIN_PASSWORD is too weak');
  }
}

if (env.isProduction) {
  if (env.corsOrigins.length === 0) {
    errors.push('CORS_ORIGINS or CORS_ORIGIN is required in production');
  }
  if (env.trustProxy !== 1 && env.trustProxy !== '1') {
    warnings.push('TRUST_PROXY should usually be 1 on Render');
  }
} else if (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN) {
  warnings.push('CORS origin is set in development; verify it matches your frontend URL');
}

console.log('Backend env check');
console.log({
  nodeEnv: process.env.NODE_ENV || 'development',
  hasMongoUri: Boolean(process.env.MONGO_URI),
  hasJwtSecret: Boolean(process.env.JWT_SECRET),
  jwtSecretLength: process.env.JWT_SECRET?.length || 0,
  hasAdminUsername: Boolean(process.env.ADMIN_USERNAME),
  hasAdminPassword: Boolean(process.env.ADMIN_PASSWORD),
  adminPasswordLength: process.env.ADMIN_PASSWORD?.length || 0,
  corsOrigins: env.corsOrigins,
  trustProxy: env.trustProxy,
  analyticsTimeZone: env.analyticsTimeZone,
});

for (const warning of warnings) {
  console.warn(`WARN ${warning}`);
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`FAIL ${error}`);
  }
  process.exit(1);
}

console.log('PASS Backend env is ready');
