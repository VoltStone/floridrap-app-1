'use strict';

const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('./logger');

const isConfigured = Boolean(env.BREVO_SMTP_USER && env.BREVO_SMTP_KEY && env.EMAIL_FROM);

let transporter = null;
if (isConfigured) {
  transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false, // STARTTLS on port 587, not implicit TLS
    auth: {
      user: env.BREVO_SMTP_USER,
      pass: env.BREVO_SMTP_KEY,
    },
  });
} else {
  logger.warn(
    'Email is not configured (BREVO_SMTP_USER / BREVO_SMTP_KEY / EMAIL_FROM missing) — ' +
      'emails will be logged instead of sent. See .env.example.'
  );
}

/**
 * Sends an email if Brevo is configured; otherwise logs what would have
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
    from: `"${env.EMAIL_FROM_NAME}" <${env.EMAIL_FROM}>`,
    to,
    subject,
    html,
    text,
  });

  logger.info('Email sent', { to, subject, messageId: info.messageId });
  return info;
}

module.exports = { sendMail, isConfigured };
