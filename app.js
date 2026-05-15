import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import { env } from './config/env.js';
import { errorHandler, notFound } from './middleware/error.js';
import seriesRoutes from './routes/series.js';
import adminRoutes from './routes/admin.js';

export const createApp = ({ enableRequestLogging = process.env.NODE_ENV !== 'production' } = {}) => {
  const app = express();
  app.set('trust proxy', env.trustProxy);

  app.use(helmet());
  app.use(compression());

  const corsOptions = {
    origin(origin, callback) {
      if (!origin || env.corsOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    optionsSuccessStatus: 200,
  };
  app.use(cors(corsOptions));

  app.use(express.json());

  app.use((req, res, next) => {
    if (req.body) mongoSanitize.sanitize(req.body);
    if (req.query) mongoSanitize.sanitize(req.query);
    if (req.params) mongoSanitize.sanitize(req.params);
    next();
  });

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 100 : 5000,
    message: { success: false, message: 'Too many requests, please try again later.' },
    validate: { trustProxy: false },
  });
  app.use('/api/', limiter);

  const analyticsLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { success: false, message: 'Too many interactions, please slow down.' },
    validate: { trustProxy: false },
  });

  if (enableRequestLogging) {
    app.use((req, res, next) => {
      console.log(`${req.method} ${req.url}`);
      next();
    });
  }

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  app.use('/api/series/view', analyticsLimiter);
  app.use('/api/series/check-in', analyticsLimiter);
  app.use('/api/series', seriesRoutes);
  app.use('/api/admin', adminRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
};

