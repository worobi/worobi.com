'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp } = require('../server/app');
const { createMailer, validateRequest } = require('../server/mail');
const env = { SMTP_HOST: 'smtp.example.invalid', SMTP_PORT: '587', SMTP_USER: 'notary@worobi.com', SMTP_PASS: 'TEST-ONLY-NOT-A-CREDENTIAL', SITE_URL: 'https://notary.worobi.com' };
const valid = { requestType: 'sales', name: 'Test Person', email: 'Case.Name+crm@example.com', service: 'Mobile notary appointment', phone: '', datetime: 'Tuesday afternoon', message: 'Test only. No appointment requested.' };
const support = { requestType: 'support', name: 'Test Person', email: 'Case.Name+help@example.com', summary: 'Appointment question', message: 'Test only. Please do not send.' };
async function withApp(options, run) {
  const server = createApp({ env, ...options }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  const post = (body, headers = {}) => fetch(base + '/api/requests', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  try { await run({ post, base }); } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
test('both request types preserve values and report transport acceptance only', async () => {
  const seen = [];
  await withApp({ sendMail: async data => { seen.push(data); return { accepted: [data.requestType === 'support' ? 'sos@worobi.com' : 'notary@worobi.com'] }; } }, async ({ post }) => {
    for (const data of [valid, support]) {
      const res = await post(data);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.submissionStatus, 'accepted_for_sending');
      assert.match(body.message, /does not confirm inbox delivery/);
    }
    assert.equal(seen[0].name, valid.name);
    assert.equal(seen[0].email, valid.email);
    assert.equal(seen[1].email, support.email);
  });
});
test('transport fixes recipients, structured visitor headers, TLS, and escaped HTML', async () => {
  for (const [type, port] of [['sales','465'],['support','587']]) {
    let config, mail;
    const send = createMailer({ ...env, SMTP_PORT: port }, { createTransport(options) { config = options; return { async sendMail(payload) { mail = payload; return { accepted: [payload.to] }; } }; } });
    const name = 'Alex "AJ" O\'Neil & <Co>';
    const input = { ...(type === 'sales' ? valid : support), name, to: 'attacker@example.com' };
    const { data, errors } = validateRequest(input);
    assert.deepEqual(errors, []);
    await send(data);
    assert.equal(mail.to, type === 'sales' ? 'notary@worobi.com' : 'sos@worobi.com');
    assert.deepEqual(mail.from, { name, address: 'notary@worobi.com' });
    assert.deepEqual(mail.replyTo, { name, address: input.email });
    assert.equal(config.secure, port === '465');
    assert.equal(config.requireTLS, port !== '465');
    assert.equal(config.auth.user, 'notary@worobi.com');
    assert.doesNotMatch(mail.html, /<Co>/);
    assert.match(mail.html, /&amp; &lt;Co&gt;/);
    const nodemailer = require('nodemailer');
    const result = await nodemailer.createTransport({ streamTransport: true, buffer: true }).sendMail(mail);
    assert.match(result.message.toString(), /From: "Alex \\"AJ\\" O'Neil & <Co>" <notary@worobi.com>/);
  }
});
test('invalid input cannot reach mail transport', async () => {
  const bodies = [
    null, [], { ...valid, requestType: '__proto__' }, { ...valid, requestType: {} },
    { ...valid, name: ' ' }, { ...valid, name: 'Test\r\nBcc: x@example.com' },
    { ...valid, name: 'Test\n' }, { ...valid, email: 'bad' }, { ...valid, email: 'test@example.com\n' },
    { ...valid, email: [] }, { ...valid, service: 'unapproved' }, { ...valid, message: 'x'.repeat(2001) },
    { ...support, summary: 'x' }, { ...support, summary: 'Test\nHeader' }, { ...support, message: 'short' },
  ];
  for (const body of bodies) {
    const result = validateRequest(body);
    assert.ok(result.errors.length, JSON.stringify(body));
  }
  let calls = 0;
  await withApp({ sendMail: async () => { calls++; } }, async ({ post }) => {
    const res = await post({ ...support, summary: 'short\nheader' });
    assert.equal(res.status, 400);
    assert.equal(calls, 0);
  });
});
test('missing SMTP and wrong sender fail closed before any send', async () => {
  for (const configuration of [{ ...env, SMTP_PASS: '' }, { ...env, SMTP_USER: 'other@example.com' }, { ...env, SMTP_PORT: '25' }]) {
    let calls = 0;
    await withApp({ env: configuration, sendMail: async () => { calls++; } }, async ({ post }) => {
      const res = await post(support);
      assert.equal(res.status, 503);
      assert.match((await res.json()).error, /sos@worobi.com/);
      assert.equal(calls, 0);
    });
  }
});
test('SMTP failures and wrong acceptance retain uncertainty and never retry', async () => {
  for (const result of ['throw', 'empty', 'wrong']) {
    let calls = 0;
    await withApp({ sendMail: async () => { calls++; if (result === 'throw') throw new Error('TEST timeout'); return { accepted: result === 'empty' ? [] : ['wrong@example.com'] }; } }, async ({ post }) => {
      const res = await post(support);
      assert.equal(res.status, 502);
      const body = await res.json();
      assert.equal(body.success, false);
      assert.match(body.error, /before submitting again/);
      assert.equal(calls, 1);
    });
  }
});
test('rate limits, foreign origins, and malformed JSON are rejected', async () => {
  await withApp({ rateLimitMax: 1, sendMail: async () => ({ accepted: ['notary@worobi.com'] }) }, async ({ post }) => {
    assert.equal((await post(valid)).status, 200);
    assert.equal((await post(valid)).status, 429);
  });
  let calls = 0;
  await withApp({ sendMail: async () => { calls++; } }, async ({ post, base }) => {
    assert.equal((await post(valid, { Origin: 'https://unrelated.example' })).status, 403);
    const bad = await fetch(base + '/api/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{invalid' });
    assert.equal(bad.status, 400);
    const large = await post({ ...valid, message: 'x'.repeat(13000) });
    assert.equal(large.status, 413);
    assert.equal(calls, 0);
  });
});
test('only public Notary pages and assets are served, never source or secrets', async () => {
  await withApp({ sendMail: async () => { throw new Error('Must not send'); } }, async ({ base }) => {
    for (const route of ['/', '/index.html', '/support.html', '/privacy.html', '/assets/forms.js', '/healthz']) {
      const res = await fetch(base + route);
      assert.equal(res.status, 200, route);
      assert.ok(res.headers.get('content-security-policy'));
    }
    const health = await fetch(base + '/healthz');
    assert.deepEqual(await health.json(), { status: 'ok' });
    for (const route of ['/server/mail.js', '/package.json', '/.env', '/.env.example', '/Dockerfile', '/brandon/', '/assets/../server/mail.js']) {
      assert.equal((await fetch(base + route)).status, 404, route);
    }
  });
});
