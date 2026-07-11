'use strict';

const argon2 = require('argon2');
const db = require('./connection');
const env = require('../config/env');
const logger = require('../utils/logger');

const products = [
  {
    slug: 'parure-satin-graphique-4-pieces',
    name: 'Parure satin graphique 4 pièces',
    category: 'parures',
    description:
      "Parure en satin de coton doux et lustré, motif graphique contemporain. Comprend housse de couette, drap plat et deux taies assorties.",
    price_cents: 13900,
    compare_at_price_cents: 16000,
    image_url: 'https://images.pexels.com/photos/7591040/pexels-photo-7591040.jpeg?auto=compress&cs=tinysrgb&w=900',
    material: '100% coton, satin 300 fils',
    care: 'Lavage machine 40°C, repassage doux',
    sizes: JSON.stringify(['140x190', '160x200', '180x200', '220x240']),
    colors: JSON.stringify(['Anthracite', 'Mauve', 'Rose poudré', 'Perle']),
    is_best_seller: 1,
    is_new: 0,
  },
  {
    slug: 'drap-plat-percale-beige',
    name: 'Drap plat percale de coton',
    category: 'draps',
    description: 'Drap plat en percale de coton respirante, fini mat et doux, coloris beige intemporel.',
    price_cents: 5500,
    compare_at_price_cents: null,
    image_url: 'https://images.pexels.com/photos/18038118/pexels-photo-18038118.jpeg?auto=compress&cs=tinysrgb&w=900',
    material: '100% coton percale',
    care: 'Lavage machine 40°C',
    sizes: JSON.stringify(['140x190', '160x200', '180x200']),
    colors: JSON.stringify(['Beige', 'Blanc']),
    is_best_seller: 1,
    is_new: 0,
  },
  {
    slug: 'housse-couette-microfibre-grise',
    name: 'Housse de couette unie microfibre',
    category: 'housses',
    description: 'Housse de couette en microfibre unie, légère et facile d’entretien, fermeture à boutons pression.',
    price_cents: 7900,
    compare_at_price_cents: null,
    image_url: 'https://images.pexels.com/photos/8583631/pexels-photo-8583631.jpeg?auto=compress&cs=tinysrgb&w=900',
    material: '100% microfibre',
    care: 'Lavage machine 30°C',
    sizes: JSON.stringify(['140x200', '200x200', '220x240']),
    colors: JSON.stringify(['Gris', 'Anthracite']),
    is_best_seller: 1,
    is_new: 0,
  },
  {
    slug: 'lot-taies-unies-coton',
    name: 'Lot de 2 taies unies coton',
    category: 'taies',
    description: 'Lot de deux taies d’oreiller en coton uni, finition bord franc, coloris assortis à nos parures.',
    price_cents: 2900,
    compare_at_price_cents: null,
    image_url: 'https://images.pexels.com/photos/6297081/pexels-photo-6297081.jpeg?auto=compress&cs=tinysrgb&w=900',
    material: '100% coton',
    care: 'Lavage machine 40°C',
    sizes: JSON.stringify(['65x65']),
    colors: JSON.stringify(['Rose poudré', 'Blanc', 'Mauve']),
    is_best_seller: 0,
    is_new: 1,
  },
  {
    slug: 'plaid-lin-lave-vert-sauge',
    name: 'Plaid lin lavé vert sauge',
    category: 'couvertures',
    description: 'Plaid en lin lavé, texture légèrement froissée et respirante, pour les soirées fraîches.',
    price_cents: 6500,
    compare_at_price_cents: null,
    image_url: 'https://images.pexels.com/photos/20801059/pexels-photo-20801059.jpeg?auto=compress&cs=tinysrgb&w=900',
    material: '100% lin lavé',
    care: 'Lavage machine 30°C, à plat pour sécher',
    sizes: JSON.stringify(['Unique']),
    colors: JSON.stringify(['Vert sauge']),
    is_best_seller: 0,
    is_new: 1,
  },
  {
    slug: 'drap-housse-carreaux-bleu',
    name: 'Drap housse à carreaux',
    category: 'draps',
    description: 'Drap housse à motif carreaux, coton doux, bonnet renforcé jusqu’à 30cm d’épaisseur.',
    price_cents: 4500,
    compare_at_price_cents: 5400,
    image_url: 'https://images.pexels.com/photos/7765000/pexels-photo-7765000.jpeg?auto=compress&cs=tinysrgb&w=900',
    material: '100% coton',
    care: 'Lavage machine 40°C',
    sizes: JSON.stringify(['90x190', '140x190', '160x200']),
    colors: JSON.stringify(['Bleu']),
    is_best_seller: 0,
    is_new: 0,
  },
  {
    slug: 'parure-exception-coton-peigne',
    name: "Parure d'exception coton peigné",
    category: 'parures',
    description: 'Parure haut de gamme en coton peigné, blanc immaculé, pour une chambre lumineuse et raffinée.',
    price_cents: 16900,
    compare_at_price_cents: null,
    image_url: 'https://images.pexels.com/photos/6035359/pexels-photo-6035359.jpeg?auto=compress&cs=tinysrgb&w=900',
    material: '100% coton peigné',
    care: 'Lavage machine 40°C',
    sizes: JSON.stringify(['160x200', '180x200', '220x240']),
    colors: JSON.stringify(['Blanc']),
    is_best_seller: 1,
    is_new: 0,
  },
  {
    slug: 'drap-housse-jersey-extensible',
    name: 'Drap housse jersey extensible',
    category: 'draps',
    description: 'Drap housse en jersey extensible, s’adapte parfaitement aux matelas épais, toucher tee-shirt.',
    price_cents: 4200,
    compare_at_price_cents: null,
    image_url: 'https://images.pexels.com/photos/10099311/pexels-photo-10099311.jpeg?auto=compress&cs=tinysrgb&w=900',
    material: '95% coton, 5% élasthanne',
    care: 'Lavage machine 40°C',
    sizes: JSON.stringify(['90x190', '140x190', '160x200']),
    colors: JSON.stringify(['Anthracite']),
    is_best_seller: 0,
    is_new: 1,
  },
];

async function seedProducts() {
  const tx = await db.transaction('write');
  try {
    for (const p of products) {
      await tx.execute({
        sql: `INSERT INTO products
                (slug, name, category, description, price_cents, compare_at_price_cents,
                 image_url, material, care, sizes, colors, is_best_seller, is_new)
              VALUES
                (:slug, :name, :category, :description, :price_cents, :compare_at_price_cents,
                 :image_url, :material, :care, :sizes, :colors, :is_best_seller, :is_new)
              ON CONFLICT(slug) DO NOTHING`,
        args: p,
      });
    }
    await tx.commit();
    logger.info('Seeded products', { count: products.length });
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

async function seedAdmin() {
  if (!env.SEED_ADMIN_EMAIL || !env.SEED_ADMIN_PASSWORD) {
    logger.info('Skipping admin seed (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set)');
    return;
  }

  const { rows } = await db.execute({
    sql: 'SELECT id FROM users WHERE email = ?',
    args: [env.SEED_ADMIN_EMAIL],
  });

  if (rows[0]) {
    logger.info('Admin user already exists, skipping');
    return;
  }

  // argon2id (the default in this library) with strong defaults: resistant
  // to both GPU-cracking (memory-hard) and side-channel timing attacks.
  const passwordHash = await argon2.hash(env.SEED_ADMIN_PASSWORD, { type: argon2.argon2id });

  await db.execute({
    sql: 'INSERT INTO users (email, password_hash, name, role, email_verified) VALUES (?, ?, ?, ?, 1)',
    args: [env.SEED_ADMIN_EMAIL, passwordHash, 'Admin', 'admin'],
  });

  logger.info('Seeded admin user', { email: env.SEED_ADMIN_EMAIL });
}

seedProducts()
  .then(() => seedAdmin())
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error('Seeding failed', err);
    process.exit(1);
  });
