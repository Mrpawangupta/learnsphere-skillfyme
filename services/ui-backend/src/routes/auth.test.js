import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';

process.env.JWT_SECRET = 'test-secret-for-mocha-only-0123456789';

const { createAuthRouter } = await import('./auth.js');

// In-memory user store, same interface as pgUserStore.
function memoryStore({ failCreateWith } = {}) {
  const rows = [];
  return {
    rows,
    async findByEmail(email) {
      if (failCreateWith) return null; // simulate the race: lookup misses
      return rows.find((u) => u.email.toLowerCase() === email.toLowerCase()) || null;
    },
    async create({ name, email, passwordHash }) {
      if (failCreateWith) throw Object.assign(new Error('dup'), { code: failCreateWith });
      const user = { id: String(rows.length + 1), name, email, password_hash: passwordHash, role: 'learner' };
      rows.push(user);
      return user;
    },
  };
}

async function startApp(store) {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', createAuthRouter(store));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => res.status(500).json({ error: 'Internal error' }));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = async (method, path, body, headers = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json() };
  };
  return { server, send };
}

describe('auth routes', function () {
  this.timeout(15000);
  let server;
  let send;
  let store;
  const user = { name: 'Test User', email: 'test@skillfyme.com', password: 'password123' };

  before(async () => {
    store = memoryStore();
    ({ server, send } = await startApp(store));
  });
  after(() => server.close());

  it('registers a new user (201) and returns a token without the hash', async () => {
    const r = await send('POST', '/api/auth/register', user);
    assert.equal(r.status, 201);
    assert.ok(r.body.token);
    assert.equal(r.body.user.email, user.email);
    assert.equal(r.body.user.password_hash, undefined);
  });

  it('stores a bcrypt hash, not the plain password', () => {
    assert.match(store.rows[0].password_hash, /^\$2[aby]\$10\$/);
    assert.notEqual(store.rows[0].password_hash, user.password);
  });

  it('rejects duplicate email (409), case-insensitive', async () => {
    const r = await send('POST', '/api/auth/register', { ...user, email: 'TEST@skillfyme.com' });
    assert.equal(r.status, 409);
  });

  it('rejects short password on register (400)', async () => {
    const r = await send('POST', '/api/auth/register', { ...user, email: 'x@skillfyme.com', password: 'short' });
    assert.equal(r.status, 400);
  });

  it('logs in with correct password (200)', async () => {
    const r = await send('POST', '/api/auth/login', { email: user.email, password: user.password });
    assert.equal(r.status, 200);
    assert.ok(r.body.token);
  });

  it('wrong password returns 401', async () => {
    const r = await send('POST', '/api/auth/login', { email: user.email, password: 'wrong-password-1' });
    assert.equal(r.status, 401);
  });

  it('short wrong password returns 401, not 400', async () => {
    const r = await send('POST', '/api/auth/login', { email: user.email, password: 'x' });
    assert.equal(r.status, 401);
  });

  it('unknown email returns 401 with the same message', async () => {
    const r = await send('POST', '/api/auth/login', { email: 'nobody@skillfyme.com', password: 'password123' });
    assert.equal(r.status, 401);
    assert.equal(r.body.error, 'Invalid email or password');
  });

  it('/me works with a valid token and fails without one', async () => {
    const login = await send('POST', '/api/auth/login', { email: user.email, password: user.password });
    const ok = await send('GET', '/api/auth/me', null, { Authorization: `Bearer ${login.body.token}` });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.user.email, user.email);
    const bad = await send('GET', '/api/auth/me');
    assert.equal(bad.status, 401);
  });

  it('concurrent duplicate (unique-index error 23505) returns 409', async () => {
    const raced = await startApp(memoryStore({ failCreateWith: '23505' }));
    const r = await raced.send('POST', '/api/auth/register', { ...user, email: 'race@skillfyme.com' });
    raced.server.close();
    assert.equal(r.status, 409);
  });
});