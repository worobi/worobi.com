'use strict';
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('node:path');
const { validateRequest, createMailer, isConfigured, RECIPIENTS } = require('./mail');

function createApp({ env = process.env, sendMail = createMailer(env), rateLimitMax = 5 } = {}) {
  const app = express();
  const hops = Number(env.TRUST_PROXY_HOPS || 0);
  if (!Number.isInteger(hops) || hops < 0 || hops > 3) throw new Error('Invalid TRUST_PROXY_HOPS');
  app.set('trust proxy', hops);
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"], formAction: ["'self'"],
  } } }));
  app.use(express.json({ limit: '12kb' }));
  const limit = rateLimit({
    windowMs: 60 * 60 * 1000, max: rateLimitMax,
    standardHeaders: true, legacyHeaders: false,
    message: { success: false, error: 'Too many requests. Please wait before trying again, or email us directly.' },
  });
  app.post('/api/requests', limit, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const origin = req.get('origin');
    if (origin && origin !== (env.SITE_URL || 'https://notary.worobi.com')) {
      return res.status(403).json({ success: false, error: 'Please submit the form from the Worobi Notary website.' });
    }
    if (!req.is('application/json')) return res.status(415).json({ success: false, error: 'This form requires JSON.' });
    const { data, errors } = validateRequest(req.body);
    if (errors.length) return res.status(400).json({ success: false, errors });
    const recipient = RECIPIENTS[data.requestType];
    if (!isConfigured(env)) return res.status(503).json({
      success: false, error: 'The form is temporarily unavailable. Your entries are still here. Please email ' + recipient + ' directly.',
    });
    try {
      const result = await sendMail(data);
      if (!Array.isArray(result?.accepted) || !result.accepted.some(address => String(address).toLowerCase() === recipient)) {
        throw new Error('Recipient acceptance unconfirmed');
      }
      return res.json({
        success: true, submissionStatus: 'accepted_for_sending',
        message: 'Your request was accepted for sending. This does not confirm inbox delivery or an appointment.',
      });
    } catch (error) {
      // Never log submitted personal details, credentials, or raw SMTP responses.
      console.error('[MAIL]', error.code || 'ACCEPTANCE_UNCONFIRMED');
      return res.status(502).json({
        success: false, error: 'We could not confirm whether your request was sent. Your entries are still here. Please email ' + recipient + ' before submitting again.',
      });
    }
  });
  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
  // Never expose the repository root: only these three pages and public assets.
  const publicRoot = env.PUBLIC_DIR || path.join(__dirname, '..');
  app.use('/assets', express.static(path.join(publicRoot, 'assets'), { dotfiles: 'deny', index: false, maxAge: '1h' }));
  for (const page of ['index', 'privacy', 'support']) {
    const urls = page === 'index' ? ['/', '/index.html'] : ['/' + page + '.html'];
    app.get(urls, (_req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(publicRoot, page + '.html'));
    });
  }
  app.use((_req, res) => res.status(404).type('text').send('Not found'));
  app.use((error, _req, res, _next) => {
    const status = error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : 500;
    res.status(status).json({ success: false, error: status === 413 ? 'Request is too large.' : status === 400 ? 'Invalid request format.' : 'The request could not be completed.' });
  });
  return app;
}
module.exports = { createApp };
