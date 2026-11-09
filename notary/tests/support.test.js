'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'assets/forms.js'), 'utf8');
function harness(type, fetch) {
  const handlers = {};
  const field = value => ({ value, setCustomValidity(message) { this.error = message; } });
  const elements = {
    name: field('Test Person'), email: field('test+support@example.com'), summary: field('Appointment question'), details: field('Please help with the appointment time.'),
    first_name: field('Test'), last_name: field('Person'), phone: field(''), service: field('Mobile notary appointment'), datetime: field(''), message: field(''),
  };
  const button = { disabled: true, textContent: 'Send request' }, status = { hidden: true, focus() { this.focused = true; } };
  const form = {
    elements, dataset: { requestType: type }, resets: 0,
    querySelector: selector => selector === 'button[type="submit"]' ? button : status,
    reportValidity: () => Object.values(elements).every(field => !field.error),
    addEventListener(name, fn) { handlers[name] = fn; },
    setAttribute() {}, removeAttribute() {}, reset() { this.resets++; handlers.reset?.(); },
  };
  vm.runInNewContext(code, { document: { querySelectorAll: () => [form] }, fetch, AbortController, setTimeout, clearTimeout });
  return { elements, button, status, form, submit: () => handlers.submit({ preventDefault() {} }) };
}
test('both forms submit only their defined routing and preserve full customer names', async () => {
  for (const type of ['sales','support']) {
    let payload;
    const h = harness(type, async (url, options) => {
      assert.equal(url, '/api/requests'); payload = JSON.parse(options.body);
      return { ok: true, json: async () => ({ success: true, submissionStatus: 'accepted_for_sending' }) };
    });
    await h.submit();
    assert.equal(payload.requestType, type);
    assert.equal(payload.name, 'Test Person');
    assert.equal(payload.email, 'test+support@example.com');
    assert.equal(h.form.resets, 1);
    assert.match(h.status.textContent, /does not confirm inbox delivery or an appointment/);
  }
});
test('failure keeps inputs, surfaces the right SOS or appointment email, and never retries', async () => {
  for (const type of ['sales','support']) for (const mode of ['503','json','network','unconfirmed']) {
    let calls = 0;
    const h = harness(type, async () => {
      calls++;
      if (mode === 'network') throw new Error('timeout');
      return { ok: mode !== '503', json: async () => {
        if (mode === 'json') throw new Error('invalid JSON');
        return mode === '503' ? { error: 'Form unavailable. Email ' + (type === 'sales' ? 'notary' : 'sos') + '@worobi.com.' } : { success: true };
      } };
    });
    await h.submit();
    assert.equal(calls, 1);
    assert.equal(h.form.resets, 0);
    assert.equal(h.elements.name.value, 'Test Person');
    assert.equal(h.status.focused, true);
    assert.equal(h.button.disabled, false);
    assert.match(h.status.textContent, type === 'sales' ? /notary@worobi.com/ : /sos@worobi.com/);
  }
});
test('a repeated click sends once and whitespace-only details do not send', async () => {
  let calls = 0, release;
  const h = harness('support', () => { calls++; return new Promise(resolve => { release = resolve; }); });
  const first = h.submit(); await h.submit();
  assert.equal(calls, 1);
  release({ ok: true, json: async () => ({ success: true, submissionStatus: 'accepted_for_sending' }) }); await first;
  h.elements.details.value = ' ';
  await h.submit();
  assert.equal(calls, 1);
});
test('both pages use same-origin forms, email fallback, accessible status, and no Formspree', () => {
  for (const page of ['index', 'support']) {
    const html = fs.readFileSync(path.join(root, page + '.html'), 'utf8');
    assert.match(html, /action="\/api\/requests" method="post"/);
    assert.match(html, /role="status" aria-live="polite"/);
    assert.match(html, /assets\/forms.js\?v=helpdesk20261109/);
    assert.match(html, /type="submit"[^>]*disabled/);
    assert.doesNotMatch(html, /formspree|supportDraft|Nothing has been sent/);
  }
  for (const page of ['index', 'privacy', 'support']) {
    const html = fs.readFileSync(path.join(root, page + '.html'), 'utf8');
    assert.match(html.split('<footer>')[1], /href="support.html">Help desk/);
    assert.match(html.split('<footer>')[1], /mailto:sos@worobi.com/);
  }
  const privacy = fs.readFileSync(path.join(root, 'privacy.html'), 'utf8');
  assert.doesNotMatch(privacy, /Formspree/);
  assert.match(privacy, /sos@worobi.com/);
});
