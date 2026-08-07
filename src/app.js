"use strict";

const path = require("node:path");
const express = require("express");
const session = require("express-session");
const morgan = require("morgan");

const env = require("./config/env");
const logger = require("./utils/logger");
const securityMiddleware = require("./middleware/security");
const { globalLimiter } = require("./middleware/rateLimiters");
const { attachCsrfToken, csrfProtection } = require("./middleware/csrf");
const { attachUser } = require("./middleware/auth");
const { uploadImage, uploadGalleryImages } = require("./middleware/upload");
const { attachFlash } = require("./utils/flash");
const formatDate = require("./utils/formatDate");
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");

const homeRoutes = require("./routes/home");
const shopRoutes = require("./routes/shop");
const productRoutes = require("./routes/product");
const cartRoutes = require("./routes/cart");
const checkoutRoutes = require("./routes/checkout");
const authRoutes = require("./routes/auth");
const accountRoutes = require("./routes/account");
const adminRoutes = require("./routes/admin");
const mediaRoutes = require("./routes/media");
const LibsqlSessionStore = require("./db/sessionStore");

const app = express();

// Required for secure cookies and correct req.ip / rate-limiting when this
// app sits behind a reverse proxy / load balancer that terminates TLS.
// Left off by default so a plain `node src/server.js` in local dev doesn't
// silently trust spoofable X-Forwarded-* headers from nowhere.
if (env.TRUST_PROXY) {
  app.set("trust proxy", 1);
}

app.disable("x-powered-by"); // also done by helmet, but explicit and free
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));

// 1. Security headers apply to every response, including error pages and
//    static files, so this comes before anything else.
app.use(securityMiddleware);

// 2. Access logging. Morgan's default/combined formats never include the
//    request body, so login/register credentials are never written to logs.
app.use(morgan(env.isProduction ? "combined" : "dev"));

// 3. Static assets served before session/body-parsing — they don't need
//    either, and skipping that work for every CSS/image request is free
//    performance.
app.use(
  express.static(path.join(__dirname, "../public"), {
    maxAge: env.isProduction ? "1d" : 0,
    etag: true,
  }),
);

// 4. Baseline abuse throttling for everything else.
app.use(globalLimiter);

// 5. Body parsing with small size limits — this app has no legitimate use
//    case for large request bodies, so capping them early is cheap DoS
//    resistance. `extended: true` is needed for the bracketed
//    `items[0][quantity]` field names used by the cart update form.
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(express.json({ limit: "10kb" }));

// 6. Session must come before anything that reads/writes req.session
//    (CSRF, auth, flash, cart).
app.use(
  session({
    name: "fp.sid", // avoid the default 'connect.sid' fingerprint
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store: new LibsqlSessionStore(),
    cookie: {
      httpOnly: true, // inaccessible to client-side JS — mitigates session-theft via XSS
      secure: env.isProduction, // only sent over HTTPS in production (requires TRUST_PROXY + real TLS termination)
      sameSite: "lax", // sent on top-level navigation but not cross-site POSTs — first line of CSRF defense, backed by csrf-sync as the real control
      maxAge: 1000 * 60 * 60 * 2, // 2 hours
    },
  }),
);

// NOTE ON SESSION STORE: sessions live in the same database as everything
// else (see src/db/sessionStore.js) rather than in-process memory. This
// matters specifically because of how Vercel (and serverless hosts in
// general) run the app: any given request can be handled by a fresh,
// isolated instance with nothing shared from the instance that handled
// the previous one. An in-memory store would mean a shopper's login and
// cart randomly disappearing mid-visit.

app.use(attachUser);
app.use(attachFlash);
app.use(attachCsrfToken);
app.use((req, res, next) => {
  // Safe defaults so shared partials (header/footer) can reference these
  // without every single route remembering to pass them.
  res.locals.activeCategory = null;
  res.locals.searchTerm = "";
  res.locals.formatDate = formatDate;
  next();
});

// The product image upload route uses multipart/form-data, which
// express.urlencoded()/express.json() never parse — so without this,
// req.body._csrf would still be empty when the global CSRF check below
// runs. Multer is mounted here, scoped to exactly the path that needs it,
// so the CSRF token field it parses out of the multipart body is already
// available by the time csrfProtection reads it. uploadImage() itself
// no-ops (calls next() immediately) for any request that isn't a POST to
// this exact path pattern, so it's safe to mount on the parent path.
app.use("/admin/products/:id/image", (req, res, next) => {
  if (req.method !== "POST") return next();
  uploadImage(req, res, next);
});

// Same reasoning as the single-image mount above, for the multi-file
// gallery upload endpoint.
app.use("/admin/products/:id/gallery", (req, res, next) => {
  if (req.method !== "POST") return next();
  uploadGalleryImages(req, res, next);
});

// 7. CSRF protection applies globally and automatically skips safe methods
//    (GET/HEAD/OPTIONS), so it doesn't need to be repeated in every route
//    file — a new POST route is protected by default, not by remembering
//    to add middleware to it.
app.use(csrfProtection);

app.use(homeRoutes);
app.use(shopRoutes);
app.use(productRoutes);
app.use(cartRoutes);
app.use(checkoutRoutes);
app.use(authRoutes);
app.use(accountRoutes);
app.use("/admin", adminRoutes);
app.use(mediaRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

logger.info("Express app configured", { env: env.NODE_ENV });

module.exports = app;
