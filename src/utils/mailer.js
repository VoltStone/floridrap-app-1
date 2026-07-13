'use strict';

const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('./logger');

// Gmail SMTP. Uses its own two env vars read directly from process.env
// (rather than being added to the validated schema in config/env.js) so
// switching providers again later never requires touching that file —
// only this one, plus .env.
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

const isConfigured = Boolean(GMAIL_USER && GMAIL_APP_PASSWORD);

let transporter = null;
if (isConfigured) {
  transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // implicit TLS on 465 (Gmail also supports 587+STARTTLS, but this is simpler)
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_APP_PASSWORD, // a 16-character App Password, NOT your normal Gmail password
    },
  });
} else {
  logger.warn(
    'Email is not configured (GMAIL_USER / GMAIL_APP_PASSWORD missing) — ' +
      'emails will be logged instead of sent. See .env.'
  );
}

/**
 * Sends an email if Gmail is configured; otherwise logs what would have
 * been sent and resolves anyway. Callers should never let a failed send
 * here break the user-facing flow that triggered it (e.g. an order still
 * completes even if the confirmation email fails) — this function
 * throws on real send failures so callers can decide that for
 * themselves via try/catch, rather than silently swallowing errors here.
 */
async function sendMail({ to, subject, html, text }) {
  if (!transporter) {
    logger.info('EMAIL NOT SENT (no SMTP configured) — would have sent:', { to, subject });
    return { simulated: true };
  }

  const info = await transporter.sendMail({
    // Gmail always sends from the authenticated account regardless of what
    // "from" address you provide — it silently rewrites (or rejects) a
    // mismatched one. Using GMAIL_USER here avoids that mismatch; the
    // human-readable name still comes from EMAIL_FROM_NAME.
    from: `"${env.EMAIL_FROM_NAME}" <${GMAIL_USER}>`,
    to,
    subject,
    html,
    text,
  });

  logger.info('Email sent', { to, subject, messageId: info.messageId });
  return info;
}

module.exports = { sendMail, isConfigured };