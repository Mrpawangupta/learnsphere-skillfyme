import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import pinoHttp from 'pino-http';
import rateLimit from 'express-rate-limit';
import { logger } from './utils/logger.js';
import { redis, connectRedis } from './utils/redis.js';
import { authRouter } from './routes/auth.js';
import { coursesRouter } from './routes/courses.js';
import { learningPathsRouter } from './routes/learningPaths.js';
import { sessionsRouter } from './routes/sessions.js';
import { enrollmentsRouter } from './routes/enrollments.js';
import { cartRouter } from './routes/cart.js';
import { paymentsRouter } from './routes/payments.js';
import { creditsRouter } from './routes/credits.js';
import { healthRouter } from './routes/health.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authMiddleware } from './middleware/auth.js';
import { getJwtSecret } from './utils/config.js';
import client from 'prom-client';

export { redis };

const app = express();
const PORT = process.env.PORT || 4000;
// Fail fast if required secrets are missing
getJwtSecret();

// ─── Security & Performance ─────────────────────────────────────────────────
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
}));

// ─── Rate Limiting ───────────────────────────────────────────────────────────
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true }));
app.use('/api', rateLimit({ windowMs: 60 * 1000, max: 200, standardHeaders: true }));

// ─── Body Parsing & Logging ──────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(pinoHttp({ logger }));

// ─── Prometheus Metrics ──────────────────────────────────────────────────────
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

// ─── Redis Session Cache ─────────────────────────────────────────────────────
await connectRedis();

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/courses', coursesRouter);
app.use('/api/learning-paths', learningPathsRouter);
app.use('/api/live-sessions', sessionsRouter);
app.use('/api/enrollments', authMiddleware, enrollmentsRouter);
app.use('/api/cart', authMiddleware, cartRouter);
app.use('/api/payments', authMiddleware, paymentsRouter);
app.use('/api/credits', authMiddleware, creditsRouter);

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info({ port: PORT, env: process.env.NODE_ENV }, 'Skillfyme UI Backend started');
});

export default app;
