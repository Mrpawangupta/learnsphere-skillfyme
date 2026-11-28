import express from 'express';
import client from 'prom-client';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import pinoHttp from 'pino-http';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { logger } from './utils/logger.js';
import { coursesRouter } from './routes/courses.js';
import { categoriesRouter } from './routes/categories.js';

const app = express();
const PORT = process.env.PORT || 9101;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/skillfyme';

app.use(helmet());
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(pinoHttp({ logger }));

// Prometheus metrics
const register = new client.Registry();
client.collectDefaultMetrics({ register });
const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});
app.use((req, res, next) => {
  const end = httpDuration.startTimer();
  res.on('finish', () => {
    const route = req.route ? `${req.baseUrl}${req.route.path}` : 'unmatched';
    end({ method: req.method, route, status: res.statusCode });
  });
  next();
});
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Health
app.get('/health', (_req, res) => res.json({
  status: 'ok', service: 'course-catalog',
  db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
}));

// Routes
app.use('/api/v1/courses', coursesRouter);
app.use('/api/v1/categories', categoriesRouter);

// Error handler
app.use((err, _req, res, _next) => {
  logger.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

// Connect DB then start (only when run directly, not when imported by tests)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mongoose.connect(MONGODB_URI)
    .then(() => {
      logger.info('MongoDB connected');
      app.listen(PORT, () => logger.info({ port: PORT }, 'Course Catalog service started'));
    })
    .catch((err) => {
      logger.error({ err }, 'Failed to connect MongoDB');
      process.exit(1);
    });
}

export default app;
