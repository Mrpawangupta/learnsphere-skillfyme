import assert from 'node:assert/strict';
import http from 'node:http';

process.env.NODE_ENV = 'production';
process.env.LOG_LEVEL = 'silent';
const { app, redis } = await import('./server.js');

describe('credits-currency service', function () {
  let server;
  let base;
  let store;

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

  // Fake Redis: a plain object instead of a real server.
  beforeEach(() => {
    store = {};
    redis.get = async (k) => (k in store ? String(store[k]) : null);
    redis.incrby = async (k, n) => { store[k] = (parseInt(store[k] || '0') + n); return store[k]; };
    redis.decrby = async (k, n) => { store[k] = (parseInt(store[k] || '0') - n); return store[k]; };
  });

  it('health returns ok', async () => {
    const r = await send('GET', '/health');
    assert.equal(r.status, 200);
    assert.equal(r.body.service, 'credits-currency');
  });

  it('converts USD to EUR using the static rate', async () => {
    const r = await send('GET', '/api/v1/fx/convert?from=USD&to=EUR&amount=100');
    assert.equal(r.status, 200);
    assert.equal(r.body.converted, 92);
  });

  it('rejects an invalid amount (400)', async () => {
    const r = await send('GET', '/api/v1/fx/convert?from=USD&to=EUR&amount=abc');
    assert.equal(r.status, 400);
  });

  it('rejects an unsupported currency (400)', async () => {
    const r = await send('GET', '/api/v1/fx/convert?from=USD&to=XYZ&amount=10');
    assert.equal(r.status, 400);
  });

  it('balance is 0 for a new user', async () => {
    const r = await send('GET', '/api/v1/credits/u1/balance');
    assert.equal(r.status, 200);
    assert.equal(r.body.balance, 0);
  });

  it('convert gives 100 credits per USD', async () => {
    const r = await send('POST', '/api/v1/credits/convert', { userId: 'u1', amountUsd: 5 });
    assert.equal(r.status, 200);
    assert.equal(r.body.creditsAdded, 500);
    assert.equal(r.body.newBalance, 500);
  });

  it('spend deducts credits when the balance is enough', async () => {
    store['credits:u1'] = 500;
    const r = await send('POST', '/api/v1/credits/spend', { userId: 'u1', amount: 200 });
    assert.equal(r.status, 200);
    assert.equal(r.body.newBalance, 300);
  });

  it('spend is refused when credits are insufficient (400)', async () => {
    store['credits:u1'] = 50;
    const r = await send('POST', '/api/v1/credits/spend', { userId: 'u1', amount: 200 });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'Insufficient credits');
    assert.equal(store['credits:u1'], 50);
  });
});
