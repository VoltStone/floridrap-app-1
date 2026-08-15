-- Foreign keys are off by default in SQLite; the connection module turns
-- this on for every connection so referential integrity is enforced.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,      -- argon2id hash, never a plaintext password
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','admin')),
  email_verified INTEGER NOT NULL DEFAULT 0,
  verification_token_hash    TEXT,      -- SHA-256 of the token, never the raw token
  verification_token_expires TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  slug                  TEXT NOT NULL UNIQUE,
  name                  TEXT NOT NULL,
  category              TEXT NOT NULL CHECK (category IN
                          ('draps','taies','housses','parures','couvertures')),
  description           TEXT NOT NULL,
  price_cents           INTEGER NOT NULL CHECK (price_cents > 0),
  compare_at_price_cents INTEGER,
  image_url             TEXT NOT NULL,
  image_data            TEXT,             -- base64-encoded uploaded photo, if any (see below)
  image_mime            TEXT,             -- e.g. 'image/webp'; NULL when image_data is NULL
  material              TEXT NOT NULL,
  care                  TEXT NOT NULL,
  sizes                 TEXT NOT NULL,   -- JSON array, e.g. ["140x190","160x200"]
  colors                TEXT NOT NULL,   -- JSON array, e.g. ["Anthracite","Mauve"]
  size_prices           TEXT,            -- JSON object, e.g. {"180x200": 12900}. Sizes not
                                          -- listed here (or when this is NULL entirely) fall
                                          -- back to price_cents — see productRepository.getPriceForSize.
  in_stock              INTEGER NOT NULL DEFAULT 1,
  is_best_seller        INTEGER NOT NULL DEFAULT 0,
  is_new                INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Admin-uploaded product photos are stored directly in the database
-- (image_data/image_mime above, served back out by GET /media/product/:id)
-- rather than written to local disk. A serverless host like Vercel has no
-- writable, persistent filesystem for the app to save uploaded files to —
-- storing the bytes in the same database as everything else sidesteps
-- that entirely, at the cost of a larger database (acceptable at this
-- catalog size). image_url still holds a plain string either way
-- (either an external https:// URL, or '/media/product/:id' for an
-- uploaded photo) so every view template's <img src="<%= p.image_url %>">
-- keeps working unchanged.

-- Additional gallery photos beyond the one primary image_url above,
-- shown as a cycle-able gallery on the product detail page. Same
-- base64-in-database storage as the primary photo, same reasoning
-- (no persistent disk on a serverless host). ON DELETE CASCADE: a
-- product's gallery photos are only ever meaningful attached to that
-- product, unlike order_items (which deliberately does NOT cascade,
-- since historical order line items must survive a product being
-- discontinued).
CREATE TABLE IF NOT EXISTS product_images (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_data  TEXT NOT NULL,
  image_mime  TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id);

-- Session storage: sessions must survive across serverless invocations
-- (each may be a different, short-lived instance with no shared memory),
-- so — like the data above — they're kept in the same database instead
-- of in-process memory. See src/db/sessionStore.js.
CREATE TABLE IF NOT EXISTS sessions (
  sid        TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);


CREATE TABLE IF NOT EXISTS orders (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number    TEXT NOT NULL UNIQUE,
  user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  full_name       TEXT NOT NULL,
  phone           TEXT NOT NULL,
  email           TEXT NOT NULL,
  address         TEXT NOT NULL,
  city            TEXT NOT NULL,
  governorate     TEXT NOT NULL,
  payment_method  TEXT NOT NULL CHECK (payment_method IN ('cod')),
  subtotal_cents  INTEGER NOT NULL,
  total_cents     INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','completed','cancelled')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id    INTEGER NOT NULL REFERENCES products(id),
  product_name  TEXT NOT NULL,     -- snapshot at time of order
  size          TEXT NOT NULL,
  color         TEXT NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  quantity      INTEGER NOT NULL CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
