import assert from 'node:assert/strict';
import http from 'node:http';

process.env.NODE_ENV = 'production';
process.env.LOG_LEVEL = 'silent';
const { default: app } = await import('./server.js');

describe('course-catalog service', function () {
  let server;
  let base;

  before(async () => {
    server = http.createServer(app);
    await new Promise((r) => server.listen(0, r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => server.close());

  it('health returns ok and service name', async () => {
    const res = await fetch(`${base}/health`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'course-catalog');
  });

  it('health reports db as disconnected when MongoDB is not connected', async () => {
    const res = await fetch(`${base}/health`);
    const body = await res.json();
    assert.equal(body.db, 'disconnected');
  });
});
