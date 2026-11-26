import assert from 'node:assert/strict';
import http from 'node:http';

process.env.LOG_LEVEL = 'silent';
const { app, pool } = await import('./server.js');

describe('payment service', function () {
  let server;
  let base;
  let calls;

  const send = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json() };
  };

  before(async () => {
    server = http.createServer(app);
    await new Promise((r) => server.listen(0, r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => server.close());

  // Fake DB: records every query, returns no rows unless a test overrides it.
  beforeEach(() => {
    calls = [];
    pool.query = async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [] };
    };
  });

  it('health returns ok when the database answers', async () => {
    const r = await send('GET', '/health');
    assert.equal(r.status, 200);
    assert.equal(r.body.service, 'payment');
  });

  it('health returns 503 when the database is down', async () => {
    pool.query = async () => { throw new Error('db down'); };
    const r = await send('GET', '/health');
    assert.equal(r.status, 503);
  });

  it('intent rejects a missing amount (400) without touching the DB', async () => {
    const r = await send('POST', '/api/v1/payments/intent', { userId: 'u1' });
    assert.equal(r.status, 400);
    assert.equal(calls.length, 0);
  });

  it('intent creates a pending payment and returns id and client secret', async () => {
    pool.query = async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [{ id: 'p1' }] };
    };
    const r = await send('POST', '/api/v1/payments/intent', { userId: 'u1', amount: 49.99, items: [{ courseId: 'c1' }] });
    assert.equal(r.status, 200);
    assert.equal(r.body.paymentId, 'p1');
    assert.match(r.body.clientSecret, /_secret_demo$/);
    assert.equal(r.body.currency, 'USD');
    assert.equal(calls[0].params[0], 'u1');
    assert.equal(calls[0].params[1], 49.99);
    assert.equal(calls[0].params[4], JSON.stringify([{ courseId: 'c1' }]));
  });

  it('confirm returns 404 when the payment does not exist', async () => {
    const r = await send('POST', '/api/v1/payments/p1/confirm');
    assert.equal(r.status, 404);
  });

  it('confirm marks the payment completed', async () => {
    pool.query = async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [{ id: params[0], status: 'completed', amount: '49.99' }] };
    };
    const r = await send('POST', '/api/v1/payments/p1/confirm');
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
    assert.equal(r.body.payment.status, 'completed');
    assert.deepEqual(calls[0].params, ['p1']);
  });

  it('lists payments of a user', async () => {
    pool.query = async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [{ id: 'p1', amount: '49.99', status: 'completed' }] };
    };
    const r = await send('GET', '/api/v1/payments/user/u1');
    assert.equal(r.status, 200);
    assert.equal(r.body.payments.length, 1);
    assert.deepEqual(calls[0].params, ['u1']);
  });

  it('DB error returns 500 through the error handler', async () => {
    pool.query = async () => { throw new Error('boom'); };
    const r = await send('GET', '/api/v1/payments/user/u1');
    assert.equal(r.status, 500);
  });
});
