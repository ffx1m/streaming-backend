import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { createApp } from './app.js';

env.validate();
env.logSummary();

// Connect to Database
connectDB();

const app = createApp();

app.listen(env.port, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${env.port}`);
});
