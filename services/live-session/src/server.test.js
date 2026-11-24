import assert from 'node:assert/strict';
import http from 'node:http';

process.env.LOG_LEVEL = 'silent';
const { app } = await import('./server.js');
const { Session } = await import('./models/Session.js');

describe('live-session service', function () {
  let server;
  let base;

  const send = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json() };
  };

  // Fake findById: works with both `.lean()` and plain `await`.
  const fakeFindById = (doc) => () => ({
    lean: async () => doc,
    then: (resolve, reject) => Promise.resolve(doc).then(resolve, reject),
  });

  before(async () => {
    server = http.createServer(app);
    await new Promise((r) => server.listen(0, r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => server.close());

  it('health returns ok and db disconnected without MongoDB', async () => {
    const r = await send('GET', '/health');
    assert.equal(r.status, 200);
    assert.equal(r.body.service, 'live-session');
    assert.equal(r.body.db, 'disconnected');
  });

  it('lists upcoming sessions with pagination info', async () => {
    const docs = [{ title: 'A' }, { title: 'B' }];
    Session.find = () => {
      const chain = { sort: () => chain, skip: () => chain, limit: () => chain, lean: async () => docs };
      return chain;
    };
    Session.countDocuments = async () => 2;
    const r = await send('GET', '/api/v1/sessions?limit=12');
    assert.equal(r.status, 200);
    assert.equal(r.body.sessions.length, 2);
    assert.equal(r.body.total, 2);
    assert.equal(r.body.pages, 1);
  });

  it('GET session returns 404 when not found', async () => {
    Session.findById = fakeFindById(null);
    const r = await send('GET', '/api/v1/sessions/abc');
    assert.equal(r.status, 404);
  });

  it('book returns 404 when the session does not exist', async () => {
    Session.findById = fakeFindById(null);
    const r = await send('POST', '/api/v1/sessions/abc/book', { userId: 'u1' });
    assert.equal(r.status, 404);
  });

  it('book is refused when the session is full (409)', async () => {
    let saved = false;
    Session.findById = fakeFindById({
      _id: 's1', capacity: 2, enrolledCount: 2, enrolledUsers: ['a', 'b'], save: async () => { saved = true; },
    });
    const r = await send('POST', '/api/v1/sessions/s1/book', { userId: 'u1' });
    assert.equal(r.status, 409);
    assert.equal(r.body.error, 'Session is full');
    assert.equal(saved, false);
  });

  it('book confirms a seat and increases the count (201)', async () => {
    const doc = {
      _id: 's1', capacity: 2, enrolledCount: 1, enrolledUsers: ['a'], saved: false,
      async save() { this.saved = true; },
    };
    Session.findById = fakeFindById(doc);
    const r = await send('POST', '/api/v1/sessions/s1/book', { userId: 'u1' });
    assert.equal(r.status, 201);
    assert.equal(doc.enrolledCount, 2);
    assert.ok(doc.enrolledUsers.includes('u1'));
    assert.equal(doc.saved, true);
  });

  it('booking twice by the same user does not take a second seat', async () => {
    const doc = {
      _id: 's1', capacity: 5, enrolledCount: 1, enrolledUsers: ['u1'], save: async () => {},
    };
    Session.findById = fakeFindById(doc);
    const r = await send('POST', '/api/v1/sessions/s1/book', { userId: 'u1' });
    assert.equal(r.status, 201);
    assert.equal(doc.enrolledCount, 1);
  });
});
