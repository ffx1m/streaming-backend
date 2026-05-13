import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { errorHandler, notFound } from './middleware/error.js';

// Routes
import seriesRoutes from './routes/series.js';
import adminRoutes from './routes/admin.js';

env.validate();
env.logSummary();

// Connect to Database
connectDB();

const app = express();
app.set('trust proxy', env.trustProxy);

// Security Middleware
app.use(helmet());

// Strict CORS Configuration
const corsOptions = {
  origin(origin, callback) {
    if (!origin || env.corsOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Data sanitization against NoSQL query injection
app.use((req, res, next) => {
  if (req.body) mongoSanitize.sanitize(req.body);
  if (req.query) mongoSanitize.sanitize(req.query);
  if (req.params) mongoSanitize.sanitize(req.params);
  next();
});

// Global Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 5000, 
  message: { success: false, message: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Moderate Rate Limiting for Analytics (Spam protection)
const analyticsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, 
  message: { success: false, message: 'Too many interactions, please slow down.' }
});

// Body parser
app.use(express.json());

// Request logging for debugging
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });
}

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Mount routers
app.use('/api/series/view', analyticsLimiter); // Apply spam protection
app.use('/api/series/check-in', analyticsLimiter); 

app.use('/api/series', seriesRoutes);
app.use('/api/admin', adminRoutes);

// Error handlers
app.use(notFound);
app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${env.port}`);
});
