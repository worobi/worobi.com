'use strict';
const validator = require('validator');
const nodemailer = require('nodemailer');
const RECIPIENTS = Object.freeze({ sales: 'notary@worobi.com', support: 'sos@worobi.com' });
const SERVICES = Object.freeze([
  'Mobile notary appointment', 'Office notary appointment', 'Hospital or jail notary inquiry',
  'Wedding officiant inquiry', 'Process serving inquiry (planned service)', 'Loan signing inquiry (planned service)',
  'Printing or scanning inquiry', 'Document pickup or delivery inquiry', 'Apostille coordination inquiry', 'Other / Not sure',
]);
const control = /[\u0000-\u001f\u007f]/;
function validateRequest(body) {
  const errors = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { errors: ['Invalid request.'] };
  const keys = ['requestType', 'name', 'email', 'phone', 'service', 'datetime', 'summary', 'message'];
  if (keys.some(key => body[key] != null && typeof body[key] !== 'string')) return { errors: ['Form fields must be text.'] };
  const data = Object.fromEntries(keys.map(key => [key, (body[key] || '').trim()]));
  if (!Object.hasOwn(RECIPIENTS, data.requestType)) errors.push('Choose an appointment inquiry or support request.');
  // Test the original input too: trimming must not hide a trailing header break.
  if (data.name.length < 2 || data.name.length > 100 || control.test(body.name || '')) errors.push('Enter a valid name between 2 and 100 characters, without control characters.');
  if (data.email.length > 254 || control.test(body.email || '') || !validator.isEmail(data.email)) errors.push('Enter a valid email address.');
  if (data.phone.length > 50 || control.test(body.phone || '')) errors.push('Phone must be at most 50 characters without line breaks.');
  if (data.datetime.length > 160 || control.test(body.datetime || '')) errors.push('Preferred time must be at most 160 characters without line breaks.');
  if (data.message.length > 2000) errors.push('Details must be at most 2,000 characters.');
  if (data.requestType === 'sales' && !SERVICES.includes(data.service)) errors.push('Choose a service from the list.');
  if (data.requestType === 'support') {
    if (data.summary.length < 5 || data.summary.length > 160 || control.test(body.summary || '')) errors.push('Enter an issue summary between 5 and 160 characters without line breaks.');
    if (data.message.length < 10) errors.push('Describe the issue using at least 10 characters.');
    data.service = 'Help desk';
  }
  return { data, errors };
}
function isConfigured(env) {
  return Boolean(env.SMTP_HOST && env.SMTP_PASS && env.SMTP_USER?.toLowerCase() === 'notary@worobi.com' && ['465', '587'].includes(String(env.SMTP_PORT || '587')));
}
function createMailer(env, smtp = nodemailer) {
  return async data => {
    if (!isConfigured(env)) throw new Error('Mail transport is not configured');
    const port = Number(env.SMTP_PORT || 587);
    const transport = smtp.createTransport({
      host: env.SMTP_HOST, port, secure: port === 465, requireTLS: port !== 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    });
    const lines = [
      ['Request type', data.requestType === 'support' ? 'Support request' : 'Appointment inquiry'],
      ['Name', data.name], ['Email', data.email], ['Phone', data.phone || 'Not provided'],
      ['Service', data.service], ['Preferred time', data.datetime || 'Not provided'],
      ['Issue', data.summary || 'Not provided'], ['Details', data.message || 'Not provided'],
    ];
    return transport.sendMail({
      from: { name: data.name, address: 'notary@worobi.com' },
      to: RECIPIENTS[data.requestType],
      replyTo: { name: data.name, address: data.email },
      subject: data.requestType === 'support' ? 'Worobi Notary support: ' + data.summary : 'Worobi Notary appointment inquiry: ' + data.name,
      text: lines.map(([key, value]) => key + ': ' + value).join('\n'),
      html: '<h2>Worobi Notary &amp; Document Services</h2><dl>' + lines.map(([key, value]) =>
        '<dt><strong>' + key + '</strong></dt><dd>' + validator.escape(value).replace(/\n/g, '<br>') + '</dd>'
      ).join('') + '</dl>',
    });
  };
}
module.exports = { validateRequest, createMailer, isConfigured, RECIPIENTS, SERVICES };
