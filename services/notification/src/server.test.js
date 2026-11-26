import assert from 'node:assert/strict';
import http from 'node:http';

process.env.LOG_LEVEL = 'silent';
const { app, transporter } = await import('./server.js');

describe('notification service', function () {
  let server;
  let base;
  let sent;

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

  // Fake mailer: records the mail instead of sending it.
  beforeEach(() => {
    sent = [];
    transporter.sendMail = async (mail) => { sent.push(mail); return {}; };
  });

  it('health returns ok', async () => {
    const r = await send('GET', '/health');
    assert.equal(r.status, 200);
    assert.equal(r.body.service, 'notification');
  });

  it('email rejects missing fields (400) and sends nothing', async () => {
    const r = await send('POST', '/api/v1/notifications/email', { to: 'a@b.com' });
    assert.equal(r.status, 400);
    assert.equal(sent.length, 0);
  });

  it('email sends the enrollment template with course title and user name', async () => {
    const r = await send('POST', '/api/v1/notifications/email', {
      to: 'a@b.com',
      subject: 'Welcome',
      template: 'enrollment_confirmation',
      data: { courseTitle: 'Docker 101', userName: 'Pawan' },
    });
    assert.equal(r.status, 200);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, 'a@b.com');
    assert.equal(sent[0].subject, 'Welcome');
    assert.match(sent[0].html, /Docker 101/);
    assert.match(sent[0].html, /Pawan/);
  });

  it('email sends the payment receipt with amount and order id', async () => {
    await send('POST', '/api/v1/notifications/email', {
      to: 'a@b.com',
      subject: 'Receipt',
      template: 'payment_receipt',
      data: { currency: 'USD', amount: '49.99', orderId: 'p1' },
    });
    assert.match(sent[0].html, /USD 49\.99/);
    assert.match(sent[0].html, /p1/);
  });

  it('unknown template falls back to the default template', async () => {
    await send('POST', '/api/v1/notifications/email', {
      to: 'a@b.com',
      subject: 'Hi',
      template: 'does_not_exist',
      data: { title: 'Hello there' },
    });
    assert.match(sent[0].html, /Hello there/);
  });

  it('send endpoint queues a notification on the requested channels', async () => {
    const r = await send('POST', '/api/v1/notifications/send', { userId: 'u1', type: 'info', channels: ['email', 'push'] });
    assert.equal(r.status, 200);
    assert.equal(r.body.queued, true);
    assert.deepEqual(r.body.channels, ['email', 'push']);
  });

  it('mail failure returns 500 through the error handler', async () => {
    transporter.sendMail = async () => { throw new Error('smtp down'); };
    const r = await send('POST', '/api/v1/notifications/email', { to: 'a@b.com', subject: 'Hi', template: 'default' });
    assert.equal(r.status, 500);
  });
});
