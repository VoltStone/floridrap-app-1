'use strict';

const path = require('node:path');
const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config();

// Fail fast: if the environment is misconfigured, the app should refuse to
// start rather than run with an insecure default (e.g. a weak/missing
// session secret). This is cheaper to fix in development than in production.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  TRUST_PROXY: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET must be at least 32 characters of random data'),
  DB_PATH: z.string().default('./data/floridrap.sqlite'),
  // Turso/libSQL connection — required in production (e.g. Vercel), since
  // serverless functions have no writable, persistent local disk for a
  // SQLite file. Left optional here so local dev can keep using a plain
  // local file (see src/db/connection.js) with zero setup.
  TURSO_DATABASE_URL: z.string().optional(),
  TURSO_AUTH_TOKEN: z.string().optional(),
  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().min(10).optional(),

  // Email is intentionally all-optional: the app must keep working
  // (emails just get logged instead of sent) if these aren't set yet,
  // rather than refusing to start. See src/utils/mailer.js.
  BREVO_SMTP_USER: z.string().optional(),
  BREVO_SMTP_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),
  EMAIL_FROM_NAME: z.string().default('Floridrap Plus'),
  APP_BASE_URL: z.string().url().default('http://localhost:3000'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Logged once at boot, never inside a request handler, so no risk of
  // leaking secrets to an HTTP response.
  console.error('Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

if (env.NODE_ENV === 'production' && env.SESSION_SECRET.length < 48) {
  console.error('SESSION_SECRET is too short for production use. Generate a new one:');
  console.error("  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
  process.exit(1);
}

if (env.NODE_ENV === 'production' && !env.TURSO_DATABASE_URL) {
  // A local SQLite file cannot work on Vercel (or any stateless/serverless
  // host) — there is no writable, persistent disk. Refusing to start here
  // is deliberate: a silent fallback to a local file would crash on the
  // first write anyway, but later and with a much more confusing error.
  console.error('TURSO_DATABASE_URL is required when NODE_ENV=production.');
  console.error('Create a free database at https://turso.tech and set TURSO_DATABASE_URL / TURSO_AUTH_TOKEN.');
  process.exit(1);
}

module.exports = {
  ...env,
  isProduction: env.NODE_ENV === 'production',
  dbPath: path.resolve(process.cwd(), env.DB_PATH),
};
