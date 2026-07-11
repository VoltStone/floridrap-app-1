# Floridrap Plus — secure e-commerce demo

A real, runnable Node.js/Express/EJS store for bedding products, built with
security treated as a first-class requirement rather than an add-on.

## Stack

- **Runtime**: Node.js 22.x
- **Server**: Express 5
- **Views**: EJS (server-rendered, auto-escaping by default)
- **Database**: SQLite/libSQL (via `@libsql/client`) — a local file with
  zero setup in development, and [Turso](https://turso.tech) (managed,
  serverless-friendly, free tier with no credit card) in production. See
  "Deploying to Vercel" below. Swappable for Postgres/MySQL without
  touching route code, since all queries live in `src/db/repositories/`
- **Auth**: argon2id password hashing, cookie sessions (stored in the
  same database — see "Deploying to Vercel")
- **CSRF**: `csrf-sync` (synchronizer token pattern)
- **Validation**: `zod`
- **Headers**: `helmet` with an explicit CSP
- **Rate limiting**: `express-rate-limit`

## Setup

```bash
npm install
cp .env.example .env
# edit .env — set a real SESSION_SECRET:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

npm run setup      # creates tables + seeds sample products and an admin user
npm run dev         # http://localhost:3000, auto-restarts on file changes
```

Local development needs no database account at all — leaving
`TURSO_DATABASE_URL` blank in `.env` makes the app use a plain local
SQLite file (`./data/floridrap.sqlite`), exactly as before.

## Deploying to Vercel

This app now runs on Vercel. Two things changed to make that possible,
both invisible from the UI/route/template side — nothing above this
section changed behavior:

1. **Database**: Vercel serverless functions have no writable, persistent
   local disk, so a local SQLite file can't survive between requests
   there. The database layer (`src/db/connection.js` and every file in
   `src/db/repositories/`) now goes through
   [`@libsql/client`](https://github.com/tursodatabase/libsql-client-ts),
   which talks to a remote [Turso](https://turso.tech) database (a
   managed, SQLite-compatible database with a genuinely free tier — no
   credit card, no trial expiry) over HTTP instead of opening a local
   file. Every repository function is now `async` as a result.
2. **Sessions**: for the same reason, sessions can no longer live in
   in-process memory (`memorystore`) — a serverless host can hand
   consecutive requests to completely separate instances with nothing
   shared between them, which would mean a shopper's login/cart randomly
   disappearing mid-visit. Sessions now live in a `sessions` table in the
   same database (`src/db/sessionStore.js`).

Uploaded product photos are stored as bytes directly in the database too
(`products.image_data`/`image_mime`, served back out by
`GET /media/product/:id`), for the same underlying reason — there's
nowhere on Vercel to save an uploaded file to disk either.

### One-time setup

1. **Create a free Turso database** (no credit card required):
   ```bash
   curl -sSfL https://get.tur.so/install.sh | bash   # installs the turso CLI
   turso auth signup                                  # or: turso auth login
   turso db create floridrap-plus
   turso db show floridrap-plus --url                 # → TURSO_DATABASE_URL
   turso db tokens create floridrap-plus               # → TURSO_AUTH_TOKEN
   ```
2. **Run migrations against it once, from your machine** (not from
   Vercel itself — a migration should run once, not on every cold start):
   ```bash
   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... NODE_ENV=production \
     SESSION_SECRET=... SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... \
     npm run setup
   ```
3. **In the Vercel project settings**, add the same environment
   variables: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `SESSION_SECRET`
   (a real 64-char random value — the app refuses to boot in production
   with a short one), and optionally the Brevo/email vars from
   `.env.example`. Set `NODE_ENV=production`.
4. **Deploy** — `vercel.json` + `api/index.js` already route every
   request to the Express app (`src/app.js`) as a serverless function;
   there's nothing else to configure.

If `TURSO_DATABASE_URL` isn't set, the app refuses to start when
`NODE_ENV=production` (see `src/config/env.js`) rather than silently
falling back to a local file that would fail on first write — this is
deliberate, so a missing env var is a clear boot-time error instead of a
confusing runtime crash on the first order placed.

## Email (Brevo)

Two things send real email: account registration (verification link) and
checkout (order confirmation). Both work fine with **no email configured
at all** — the app logs what it would have sent instead of sending it,
which is exactly what you'll see in local development. Nothing crashes or
blocks waiting on email.

To send real emails:

1. Sign up free at [brevo.com](https://www.brevo.com) (300 emails/day,
   forever, no card required).
2. In the dashboard: **Settings → SMTP & API → SMTP tab**. Copy the login
   shown there (looks like an email ending in `@smtp-brevo.com`) and
   generate an **SMTP key** (not your account password, not the separate
   "API key" — the SMTP key specifically).
3. In `.env`:
   ```
   BREVO_SMTP_USER=your-login@smtp-brevo.com
   BREVO_SMTP_KEY=the-smtp-key-you-generated
   EMAIL_FROM=contact@yourdomain.tn
   APP_BASE_URL=https://your-real-domain.tn
   ```
   `APP_BASE_URL` matters specifically for the verification link — it's
   used to build the clickable URL inside the email, so it must be your
   real public address once deployed, not `localhost`.

### How email verification works

- New accounts are created **unverified** and are **not logged in
  immediately** — a verification link (valid 24 hours) is emailed, and
  login is blocked until it's clicked.
- The link is single-use: the token is cleared from the database the
  moment it's used, and only its SHA-256 hash is ever stored (never the
  raw token — same principle as password hashing).
- `/resend-verification` lets someone request a new link. Its response
  wording is identical whether the email exists, doesn't exist, or is
  already verified — this endpoint can't be used to discover which
  emails have accounts on the site.
- Accounts that existed **before** this feature was added (including the
  seeded admin) are automatically grandfathered in as verified by the
  migration — nobody who could already log in gets locked out
  retroactively by a requirement that didn't exist when they signed up.

The seed script also creates an admin account from `SEED_ADMIN_EMAIL` /
`SEED_ADMIN_PASSWORD` in your `.env` (defaults to
`admin@floridrapplus.tn` / `ChangeThisPassword123!` — **change this
password in `.env` before running `npm run setup` on anything but your own
machine**, and change it again immediately if you ever seed a real
deployment with the placeholder). Log in with that account and you'll be
sent to `/admin` automatically.

## Admin panel

Everything under `/admin` requires an authenticated session with
`role = 'admin'` (enforced once, in `src/routes/admin/index.js`, inherited
by every sub-route — see the Access Control section of the security review
below).

- **Dashboard** (`/admin`) — order/product counts at a glance, recent orders.
- **Products** (`/admin/products`) — list, create, edit, delete. Price and
  "prix barré" (compare-at price) are how discounts are set — enter a
  compare-at price higher than the current price and the storefront shows
  it struck through automatically.
- **Sizes/colors** are edited as a comma-separated text field rather than
  a dynamic add/remove widget — deliberately, to avoid JavaScript for
  something a plain input handles fine, consistent with the storefront's
  "avoid unnecessary JS" approach.
- **Product images** are uploaded separately from the main edit form (see
  the security review below for why) — JPEG/PNG/WebP, 5MB max, and the
  app re-encodes every upload to WebP server-side rather than storing the
  original file.
- **Orders** (`/admin/orders`) — every order in the system (unlike the
  customer-facing `/account`, which only ever shows the logged-in
  shopper's own orders). Status can be moved between
  `pending` / `confirmed` / `cancelled`.
- **Deleting a product** that appears in any past order is blocked at the
  database level (a foreign key constraint, not just a UI check) — you'll
  be told to mark it out of stock instead, which removes it from the
  storefront while keeping historical order data intact.

For production: `npm start` (sets `NODE_ENV=production`). Run this behind a
reverse proxy that terminates TLS (nginx, Caddy, a cloud load balancer) and
set `TRUST_PROXY=true` in `.env` — this is required for secure cookies and
correct client IPs to work.

## Project layout

```
src/
  config/env.js          env var loading + validation (fails fast if misconfigured)
  db/                     schema, connection, migrations, seed, repositories
  middleware/             security headers, CSRF, auth, rate limiting, validation, errors
  routes/                 one file per feature area
  schemas/                zod schemas — the single source of truth for valid input
  utils/                  cart (session-based), password hashing, logger, flash messages
views/                    EJS templates (auto-escaped by default)
public/                   static CSS + logo
```

---

## Security review

This section documents the threats considered and how each is mitigated,
organized around the OWASP Top 10 (2021) plus the specific controls
requested.

### A03:2021 — Injection

**SQL injection.** Every single query in `src/db/repositories/` uses
parameterized statements (`db.prepare(...).run(params)` /
`.get(params)` / `.all(params)`). No user input is ever concatenated into
SQL text. The one place a dynamic identifier is needed — the `ORDER BY`
clause in `productRepository.listByCategory` — is built from a hard-coded
allow-list keyed by a validated enum value, never from the raw query
string, since parameter binding cannot parameterize identifiers/column
names.

A secondary, lower-severity issue was also handled: `%` and `_` are SQL
`LIKE` wildcards. A search for a literal `%` or `_` is escaped
(`escapeLike()` in `productRepository.js`) so a user's search text can't
accidentally (or deliberately) broaden a pattern match.

**Verified**: a crafted search string (`' OR '1'='1` inside a `LIKE`
pattern) was tested against a running instance and correctly returned zero
results rather than the whole catalog or an error.

### A07:2021 — Identification and Authentication Failures

- Passwords are hashed with **argon2id** (`src/utils/password.js`), OWASP's
  currently recommended algorithm, with explicit memory/time/parallelism
  cost parameters rather than library defaults. Argon2 generates a unique
  random salt per hash automatically — there's no shared or reused salt to
  manage.
- **Login** returns the exact same generic message
  (`E-mail ou mot de passe incorrect`) whether the account doesn't exist or
  the password is wrong, and always runs an argon2 verify (against a
  constant dummy hash when no user is found) so both code paths pay a
  similar time cost. This is what stops the login form from being usable
  as an account-enumeration oracle.
- **Registration**, by contrast, does confirm when an email is already
  taken. This is a deliberate, documented trade-off: the alternative
  (silently doing nothing) mainly confuses legitimate users, and the same
  fact is already inferable from most password-reset flows. Login is the
  higher-value target for enumeration (it's the direct path to a credential
  stuffing check), so it gets the stricter treatment.
- **Session fixation**: the session ID is regenerated on both login and
  registration (`regenerateSession()` in `src/routes/auth.js`), so a
  session ID an attacker obtained before authentication is worthless
  afterwards.
- **Rate limiting**: `/login` and `/register` are limited to 10 requests
  per 15 minutes per IP (`src/middleware/rateLimiters.js`). Verified live:
  the 11th rapid login attempt returned `429`.
- Password policy follows **NIST 800-63B** guidance: length (minimum 10,
  maximum 128) over forced complexity rules, plus a small denylist of
  common passwords. No arbitrary "must contain a symbol" rules that push
  people toward predictable substitutions.
- **Email verification is required before login.** New accounts are
  created unverified and no session is issued at registration time — a
  verification link must be clicked first. The token itself follows the
  same principle as password storage: only its **SHA-256 hash** is ever
  persisted (`src/utils/verificationToken.js`), it's **single-use** (cleared
  the moment it's consumed — verified live by reusing a spent token and
  getting a 400), and **time-limited** (24 hours, enforced in the SQL
  query itself via `verification_token_expires > datetime('now')`, not
  just checked in application code). `/resend-verification` returns
  byte-identical responses whether the email exists, is already verified,
  or doesn't exist at all — verified live — so it can't be used as an
  enumeration oracle either. Pre-existing accounts (including the seeded
  admin) are grandfathered in as verified by the migration, so this
  requirement never retroactively locks out someone who could already log in.

### A01:2021 — Broken Access Control

- **Least privilege by default**: routes must explicitly opt in to
  `requireAuth` / `requireRole('admin')` (`src/middleware/auth.js`) —
  access isn't something bolted on after the fact.
- **IDOR prevention**: `/account` only ever queries orders
  `WHERE user_id = ?` using the ID from the server-side session — never
  from a URL parameter — so there is no way to request another shopper's
  order history. The order confirmation page
  (`/checkout/confirmation/:orderNumber`) uses random, non-sequential order
  numbers and additionally requires the requester to either be the logged
  in owner or (for guest checkout) hold a session that just completed that
  exact order — knowing/guessing an order number alone isn't sufficient.
- **Open redirect prevention**: the only user-influenced redirect target
  in the app (`returnTo` after add-to-cart / login) is validated against a
  strict same-site relative-path pattern before use.

### A01:2021 — Broken Access Control (admin panel specifics)

The admin panel is the highest-privilege part of this app, so it gets
extra scrutiny beyond what's described above for customer accounts:

- **Single choke point**: `router.use(requireAuth); router.use(requireRole('admin'))`
  sits at the top of `src/routes/admin/index.js`, before the products and
  orders sub-routers are even required. Every current and future route
  nested under `/admin` inherits both checks automatically — a new admin
  route can't accidentally ship unprotected, because there's no code path
  into that router that skips them.
- **Verified live**: an unauthenticated request to `/admin` redirects to
  `/login` (302); a request from a logged-in *customer* account gets a
  `403` rendered page, not a silent redirect that might be mistaken for
  "page doesn't exist" — deliberate rather than ambiguous.
- **Admin sees all orders, customers see only their own** — this is the
  one place in the app where an unscoped `SELECT * FROM orders` is
  intentional (`orderRepository.listAllOrders()`), and it's called from
  exactly one place gated by `requireRole('admin')`. The function has a
  code comment calling this out explicitly so a future refactor doesn't
  accidentally reuse it from an unprotected route.
- **Referential-integrity as an access-control backstop**: deleting a
  product referenced by `order_items` is blocked by the database's
  foreign-key constraint, not just a UI confirmation step. Verified live:
  a raw POST straight to the delete endpoint for a product with an order
  history still returns the product untouched — the guard holds even if
  someone bypassed the confirmation page entirely.

### File upload security (product images)

This is the single largest new attack surface added by the admin panel,
so it got the most dedicated design attention:

1. **Type checking that can't be spoofed by a filename or declared
   Content-Type.** `fileFilter` in `src/middleware/upload.js` does a
   cheap first-pass check on the client-declared MIME type, but that is
   explicitly *not* the real control (a `.jpg` extension and a spoofed
   `Content-Type: image/jpeg` header are trivial for an attacker to set on
   literally any file). The actual control is `sharp(buffer).metadata()`
   — it has to genuinely decode the bytes as one of the supported image
   codecs or it throws, which is what a crafted non-image file (verified
   live with a PHP script renamed to `.jpg`) cannot get past.
2. **Re-encoding, not pass-through storage.** The uploaded file is never
   written to disk as-is. `processProductImage` decodes it and
   *re-encodes it from scratch* as WebP via sharp before `toFile()` ever
   touches the filesystem. This is what neutralizes polyglot files
   (bytes that are simultaneously a valid image and a valid script in
   another interpreter) and strips any embedded metadata (EXIF, XMP,
   ICC profiles) that might otherwise carry a payload through untouched —
   because the output bytes are a fresh encoding of decoded pixel data,
   not a copy of anything the client sent.
3. **Bounded on every axis that matters for resource exhaustion**: file
   size is capped by multer (5MB) before the buffer is even fully
   received; pixel dimensions are capped separately (6000×6000) after
   decoding, since a small file can still decompress into a huge bitmap
   ("decompression bomb") — multer's size limit alone doesn't catch that.
4. **Unguessable, extension-less-input filenames.** Output filenames are
   `crypto.randomBytes(16)` hex strings with a hard-coded `.webp`
   extension chosen by the server — never derived from the client's
   original filename, which could otherwise be used to attempt path
   traversal (`../../…`) or to overwrite another file by name collision.
5. **Storage location has no execution path.** Files land in
   `public/uploads/products/`, served only through `express.static` as
   static content — there's no server-side interpreter (PHP, CGI, etc.)
   configured anywhere near that directory, so even in a hypothetical
   world where an unencoded file slipped through, there's nothing that
   would execute it.
6. **Upload is its own CSRF-protected endpoint**, separate from the main
   product edit form, specifically so a plain text-field edit never has
   to pass through multipart parsing, and so the CSRF token plumbing for
   multipart bodies (documented in `src/app.js`, since
   `express.urlencoded`/`express.json` don't parse `multipart/form-data`)
   stays isolated to exactly the one route that needs it.

**Remaining risk, stated plainly**: this pipeline defends against
malicious *file content*. It does not include virus/malware scanning
(e.g. ClamAV) as a separate layer, and sharp's own decoders — like any
image library — are themselves a piece of software that could have a
future vulnerability. For a higher-assurance deployment, consider
offloading storage to a provider like S3 with server-side scanning, and/or
processing uploads in an isolated worker process rather than in the main
web server.



- Cookies are `HttpOnly` (inaccessible to JS, so XSS can't read the session
  cookie directly), `SameSite=Lax`, and `Secure` when `NODE_ENV=production`
  (confirmed absent in dev, present in prod — see cookie config in
  `src/app.js`).
- HSTS is sent with a one-year max-age and `includeSubDomains`. It only
  takes effect once real HTTPS is in front of the app — see the deployment
  note above about running behind a TLS-terminating proxy.
- No secrets are ever hardcoded. `SESSION_SECRET` and seed credentials come
  from environment variables, validated at boot by
  `src/config/env.js` — the process refuses to start rather than fall back
  to an insecure default.

### A05:2021 — Security Misconfiguration

Explicit secure headers via `helmet` (`src/middleware/security.js`):
Content-Security-Policy, Strict-Transport-Security, X-Content-Type-Options,
X-Frame-Options, Referrer-Policy — all verified present on a live response.
`X-Powered-By` is removed. The CSP has no `'unsafe-inline'` on
`script-src` — every view is either plain HTML/CSS or a `<form>` post; the
one `<select onchange="this.form.submit()">` progressive enhancement
degrades gracefully (a `<noscript>` submit button is provided) and is an
inline event **handler attribute**, which CSP's `script-src` (without
`'unsafe-inline'` covering attributes) still blocks in strict browsers —
kept as a documented, low-risk exception rather than pretended away.

### A08:2021 — Software and Data Integrity Failures (CSRF)

Every state-changing route (add/update/remove cart, checkout, login,
register, logout) is protected by `csrf-sync`'s synchronizer token
pattern, applied **globally** in `src/app.js` rather than per-route — a
new POST route is protected automatically, not by remembering to add
middleware to it. Verified live: an add-to-cart POST without the `_csrf`
field is rejected with `403`.

### Business-logic integrity: price tampering

This doesn't map cleanly to a single OWASP category but is arguably the
most important control specific to an e-commerce app: **the client never
sends a price, and no client-sent price is ever trusted.** The cart
(`src/utils/cart.js`) stores only `productId/size/color/quantity` in the
session; every render and the checkout total are computed by re-reading
today's price from the `products` table. Verified live: a checkout POST
that additionally included `total=0.001` and `price=0.001` fields produced
an order with the correct full price in the database — the extra fields
were simply never read.

### A09:2021 — Security Logging and Monitoring Failures

`src/utils/logger.js` provides a `security()` level used for
authentication events, rate-limit hits, and CSRF failures — all tagged for
easy routing to an alerting pipeline later. The central error handler
(`src/middleware/errorHandler.js`) logs full stack traces and context
**server-side only**; every client-facing error response is a generic,
pre-written message. Verified: a triggered 500 in testing produced a full
stack trace in the server log and a plain "Une erreur est survenue..."
page in the browser.

### A03/A07 supporting control: input validation

Every form and query-string input is validated with `zod` schemas
(`src/schemas/`) before use: types are coerced and checked, lengths are
bounded (defense against oversized-payload DoS as well as data quality),
and enums (governorate, category, sort, payment method) are checked
against allow-lists rather than accepted as free text. Validated data
(`req.validatedBody`), not the raw body, is what's used from that point
on — undeclared fields are silently dropped, which also prevents
mass-assignment of unexpected columns.

### Accessibility & frontend quality notes

- Semantic landmarks (`header`, `nav`, `main`, `footer`), a skip-to-content
  link, and `lang="fr"` throughout.
- The product image "gallery" pattern, size/color pickers, and quantity
  input are implemented with native radio buttons, labels, and a number
  input — fully keyboard-operable and functional with JavaScript disabled,
  per the CSP's restrictive `script-src`.
- Form errors are associated with their field via `aria-describedby` and
  `aria-invalid`, not conveyed by color alone.
- The brand's mauve accent (`#a37797`) is used for backgrounds, borders,
  and large elements, but body-sized text/links use a darkened variant
  (`--color-5-text: #6e4d67`) chosen to clear WCAG AA's 4.5:1 contrast
  ratio for normal text — the raw brand mauve on white only reaches
  ~3.7:1, sufficient for large text/UI components but not small text.
- A visible focus ring (`--focus-ring`, a color deliberately distinct from
  the brand palette) is applied to every interactive element and is never
  suppressed.

---

## Remaining risks / production TODOs

Being direct about what this demo does **not** fully solve:

1. **Session store**: uses `memorystore` (in-process memory). Fine for a
   single instance; sessions are lost on restart and won't work across
   multiple app instances behind a load balancer. Swap for `connect-redis`
   or similar for real production — no route code needs to change.
2. **`node:sqlite` is experimental** in this Node version. It was chosen
   deliberately to avoid a native-compiled dependency, but pin your Node
   version carefully or migrate to Postgres (`pg`) for a production
   deployment where the schema and query shape would carry over almost
   unchanged since all access goes through the repository layer.
3. **Email verification exists; password reset does not.** Registration
   now requires clicking a verification link (see above) using the same
   token pattern (hashed, single-use, time-limited) a password reset flow
   would need — so most of the groundwork is there, but there's currently
   no way for someone to recover a forgotten password themselves. That's
   the natural next feature to add, reusing `src/utils/verificationToken.js`.
4. **No CAPTCHA/behavioral bot defense** in front of registration or
   checkout — rate limiting alone slows scripted abuse but doesn't stop a
   patient or distributed attacker.
5. **Cash on delivery only, by design** — this shop doesn't take card
   payments at all; `paymentMethod` is hardcoded server-side to `'cod'`
   and isn't something the client can choose or submit. If that ever
   changes, integrating a real payment gateway (a hosted checkout page
   from a PCI-compliant provider) would be the way to add it back — card
   data should never touch this server directly.
6. **Logging is console-based.** Fine for this demo; production should
   ship structured logs to a system with access controls and retention
   policy (and the `security()` log level routed to alerting).
7. **No automated test suite** (unit/integration) is included yet — the
   flows above were verified manually against a running instance during
   development, but there's no regression safety net for future changes.
8. **Dependency hygiene** is a point-in-time guarantee: `npm audit`
   reports zero known vulnerabilities as of this build, but that needs to
   be re-checked continuously (Dependabot/Renovate + CI `npm audit`) as
   new CVEs are disclosed.
9. **Default seed admin credentials.** `npm run setup` creates an admin
   account from whatever is in `.env` — fine for local development, but
   this must never be left at a known/default password in any deployment
   reachable from the internet. There's also no 2FA on admin accounts;
   given they can rewrite pricing and view every customer's order/contact
   details, that's a reasonable next hardening step before going live.
10. **No malware/antivirus scanning layer** on uploaded images — see the
    File Upload Security section above for what *is* covered (content
    validation, re-encoding, size/dimension limits) and what a
    higher-assurance deployment would add on top.
11. **Email sending has no retry queue or bounce handling.** A failed send
    (Brevo outage, hit the 300/day free-tier cap, typo'd customer email)
    is logged server-side and otherwise silently accepted — the
    checkout/registration itself still succeeds, but nobody automatically
    notices or retries a failed send. Fine at this scale; worth watching
    the logs for `Failed to send` entries, and worth a proper email queue
    (or upgrading past the free tier) if order volume grows.
