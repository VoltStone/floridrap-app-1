'use strict';

// A minimal structured logger. In a real production deployment, swap this
// for pino/winston shipping to a log aggregator with access controls —
// but the *interface* (info/warn/error with structured metadata, never the
// raw request body of auth endpoints) should stay the same.

function timestamp() {
  return new Date().toISOString();
}

function serializeMeta(meta) {
  if (!meta) return '';
  try {
    return JSON.stringify(meta);
  } catch {
    return '[unserializable meta]';
  }
}

const logger = {
  info(message, meta) {
    console.log(`[${timestamp()}] INFO  ${message} ${serializeMeta(meta)}`.trim());
  },
  warn(message, meta) {
    console.warn(`[${timestamp()}] WARN  ${message} ${serializeMeta(meta)}`.trim());
  },
  error(message, err, meta) {
    const errInfo = err instanceof Error ? { message: err.message, stack: err.stack } : err;
    console.error(
      `[${timestamp()}] ERROR ${message} ${serializeMeta({ ...meta, error: errInfo })}`.trim()
    );
  },
  /**
   * Use for security-relevant events (failed logins, rate-limit hits,
   * CSRF failures, authorization denials) so they can be routed to a
   * dedicated audit stream / alerting pipeline later.
   */
  security(event, meta) {
    console.warn(`[${timestamp()}] SECURITY ${event} ${serializeMeta(meta)}`.trim());
  },
};

module.exports = logger;
