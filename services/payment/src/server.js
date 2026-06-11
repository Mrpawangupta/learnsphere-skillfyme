import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import pino from 'pino';
import pg from 'pg';

const { Pool } = pg;
const logger = pino({ level: process.env.LOG_LEVEL || 'info', base: { service: 'payment' } });
const app = express();
const PORT = process.env.PORT || 9107;

const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://skillfyme:skillfyme_secret@localhost:5432/skillfyme' });

app.use(helmet()); app.use(cors()); app.use(express.json()); app.use(pinoHttp({ logger }));

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(100) NOT NULL,
      amount NUMERIC(10,2) NOT NULL,
      currency VARCHAR(10) DEFAULT 'USD',
      status VARCHAR(50) DEFAULT 'pending',
      provider VARCHAR(50) DEFAULT 'stripe',
      provider_payment_id VARCHAR(255),
      items JSONB DEFAULT '[]',
      coupon_code VARCHAR(100),
      discount NUMERIC(10,2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
  `);
}

app.get('/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok', service: 'payment' }); }
  catch { res.status(503).json({ status: 'error' }); }
});

// POST /api/v1/payments/intent — create a payment intent
app.post('/api/v1/payments/intent', async (req, res, next) => {
  try {
    const { userId, amount, currency = 'USD', items = [], couponCode } = req.body;
    if (!userId || !amount) return res.status(400).json({ error: 'userId and amount required' });

    // In production, call Stripe to create a PaymentIntent
    const providerPaymentId = `pi_demo_${Date.now()}`;
    const clientSecret = `${providerPaymentId}_secret_demo`;

    const { rows } = await pool.query(
      `INSERT INTO payments (user_id, amount, currency, status, provider_payment_id, items, coupon_code)
       VALUES ($1,$2,$3,'pending',$4,$5,$6) RETURNING id`,
      [userId, amount, currency, providerPaymentId, JSON.stringify(items), couponCode]
    );

    res.json({ paymentId: rows[0].id, clientSecret, amount, currency });
  } catch (err) { next(err); }
});

// POST /api/v1/payments/:id/confirm
app.post('/api/v1/payments/:id/confirm', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE payments SET status='completed', updated_at=NOW() WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Payment not found' });
    logger.info({ paymentId: req.params.id, amount: rows[0].amount }, 'Payment confirmed');
    res.json({ success: true, payment: rows[0] });
  } catch (err) { next(err); }
});

// GET /api/v1/payments/user/:userId
app.get('/api/v1/payments/user/:userId', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, amount, currency, status, created_at, items FROM payments WHERE user_id=$1 ORDER BY created_at DESC`,
      [req.params.userId]
    );
    res.json({ payments: rows });
  } catch (err) { next(err); }
});

app.use((err, _req, res, _next) => {
  logger.error(err);
  res.status(500).json({ error: err.message });
});

initSchema()
  .then(() => app.listen(PORT, () => logger.info({ port: PORT }, 'Payment service started')))
  .catch((err) => { logger.error(err); process.exit(1); });
