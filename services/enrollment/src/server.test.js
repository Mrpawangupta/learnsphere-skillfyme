import assert from 'node:assert/strict';
import http from 'node:http';

process.env.LOG_LEVEL = 'silent';
const { app, pool } = await import('./server.js');

describe('enrollment service', function () {
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
    assert.equal(r.body.status, 'ok');
  });

  it('health returns 503 when the database is down', async () => {
    pool.query = async () => { throw new Error('db down'); };
    const r = await send('GET', '/health');
    assert.equal(r.status, 503);
  });

  it('POST rejects a missing courseId (400)', async () => {
    const r = await send('POST', '/api/v1/enrollments', { userId: 'u1' });
    assert.equal(r.status, 400);
    assert.equal(calls.length, 0);
  });

  it('POST enrolls the user and passes userId/courseId as parameters (201)', async () => {
    pool.query = async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [{ id: 'e1', user_id: params[0], course_id: params[1], status: 'active' }] };
    };
    const r = await send('POST', '/api/v1/enrollments', { userId: 'u1', courseId: 'c1' });
    assert.equal(r.status, 201);
    assert.deepEqual(calls[0].params, ['u1', 'c1']);
    assert.equal(r.body.status, 'active');
  });

  it('GET user enrollments maps rows to the frontend shape', async () => {
    pool.query = async () => ({
      rows: [{ id: 'e1', user_id: 'u1', course_id: 'c1', status: 'active', progress: 40, enrolled_at: null, completed_at: null }],
    });
    const r = await send('GET', '/api/v1/enrollments/user/u1');
    assert.equal(r.status, 200);
    assert.equal(r.body.enrollments[0].userId, 'u1');
    assert.equal(r.body.enrollments[0].courseId, 'c1');
    assert.equal(r.body.enrollments[0].progress, 40);
  });

  it('PATCH rejects progress above 100 (400)', async () => {
    const r = await send('PATCH', '/api/v1/enrollments/e1/progress', { progress: 150, userId: 'u1' });
    assert.equal(r.status, 400);
  });

  it('PATCH returns 404 when the enrollment is not found', async () => {
    const r = await send('PATCH', '/api/v1/enrollments/e1/progress', { progress: 50, userId: 'u1' });
    assert.equal(r.status, 404);
  });

  it('DB error returns 500 through the error handler', async () => {
    pool.query = async () => { throw new Error('boom'); };
    const r = await send('GET', '/api/v1/enrollments/user/u1');
    assert.equal(r.status, 500);
  });
});