'use strict';

const express = require('express');
const userRepository = require('../db/repositories/userRepository');
const { hashPassword, verifyPassword } = require('../utils/password');
const { validateBody } = require('../middleware/validate');
const { registerSchema, loginSchema, resendVerificationSchema } = require('../schemas/authSchemas');
const { authLimiter } = require('../middleware/rateLimiters');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');
const { setFlash } = require('../utils/flash');
const { generateVerificationToken, hashToken } = require('../utils/verificationToken');
const { sendMail } = require('../utils/mailer');
const { verificationEmail } = require('../utils/emailTemplates');
const env = require('../config/env');

const router = express.Router();

/**
 * Regenerates the session ID while preserving the shopping cart, which
 * would otherwise live in the old session and be lost. Regenerating on
 * every privilege change (login, register) prevents session fixation —
 * an attacker who tricked a victim into using a known session ID before
 * login gains nothing, because that ID is discarded the moment
 * authentication succeeds.
 */
function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    const cart = req.session.cart;
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.cart = cart;
      resolve();
    });
  });
}

async function sendVerificationEmailForToken(user, token) {
  const verifyUrl = `${env.APP_BASE_URL}/verify-email?token=${token}`;
  const { subject, html, text } = verificationEmail({ name: user.name, verifyUrl });

  try {
    await sendMail({ to: user.email, subject, html, text });
  } catch (err) {
    // A failed send shouldn't break registration/resend — the account
    // still exists and a fresh link can always be requested again via
    // /resend-verification. Full detail goes to the server log only.
    logger.error('Failed to send verification email', err, { userId: user.id });
  }
}

async function sendVerificationEmail(user) {
  // Used by the resend flow: this user has no currently-known raw token
  // (only its hash was ever stored), so a fresh one is generated here.
  const { token, tokenHash, expiresAt } = generateVerificationToken();
  await userRepository.setVerificationToken(user.id, tokenHash, expiresAt);
  await sendVerificationEmailForToken(user, token);
}

router.get('/register', (req, res) => {
  if (req.user) return res.redirect('/account');
  res.render('register', { title: 'Créer un compte — Floridrap Plus', errors: {}, values: {} });
});

router.post(
  '/register',
  authLimiter,
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    if (req.validationFailed) {
      return res.status(400).render('register', {
        title: 'Créer un compte — Floridrap Plus',
        errors: req.validationErrors,
        values: { name: req.body.name, email: req.body.email },
      });
    }

    const { name, email, password } = req.validatedBody;

    const existing = await userRepository.findByEmail(email);
    if (existing) {
      // Registration (unlike login) commonly does reveal that an email is
      // already taken, since the alternative — silently doing nothing —
      // is confusing for a legitimate user who forgot they have an
      // account, and the same information is already inferable via the
      // "forgot password" flow. Login, further down, intentionally does
      // NOT make this same trade-off.
      return res.status(400).render('register', {
        title: 'Créer un compte — Floridrap Plus',
        errors: { email: ['Cette adresse e-mail est déjà utilisée'] },
        values: { name, email },
      });
    }

    const passwordHash = await hashPassword(password);
    const { token, tokenHash, expiresAt } = generateVerificationToken();
    const user = await userRepository.create({
      email,
      passwordHash,
      name,
      verificationTokenHash: tokenHash,
      verificationTokenExpires: expiresAt,
    });

    await sendVerificationEmailForToken(user, token);

    logger.security('user_registered', { userId: user.id });

    // Deliberately NOT logged in yet — the account exists but is
    // unverified until the link is clicked. No session is created here.
    res.render('register-check-email', {
      title: 'Vérifiez votre e-mail — Floridrap Plus',
      email: user.email,
    });
  })
);

router.get(
  '/verify-email',
  asyncHandler(async (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    if (!token) {
      return res.status(400).render('verify-email-result', {
        title: 'Lien invalide — Floridrap Plus',
        success: false,
        message: 'Ce lien de vérification est invalide.',
      });
    }

    const tokenHash = hashToken(token);
    const user = await userRepository.findByVerificationTokenHash(tokenHash);

    if (!user) {
      return res.status(400).render('verify-email-result', {
        title: 'Lien invalide ou expiré — Floridrap Plus',
        success: false,
        message: 'Ce lien de vérification est invalide ou a expiré. Vous pouvez en demander un nouveau.',
      });
    }

    await userRepository.markVerified(user.id);
    logger.security('email_verified', { userId: user.id });

    res.render('verify-email-result', {
      title: 'E-mail vérifié — Floridrap Plus',
      success: true,
      message: 'Votre adresse e-mail a été vérifiée. Vous pouvez maintenant vous connecter.',
    });
  })
);

router.get('/resend-verification', (req, res) => {
  res.render('resend-verification', {
    title: 'Renvoyer le lien de vérification — Floridrap Plus',
    values: {},
  });
});

router.post(
  '/resend-verification',
  authLimiter,
  validateBody(resendVerificationSchema),
  asyncHandler(async (req, res) => {
    if (!req.validationFailed) {
      const { email } = req.validatedBody;
      const user = await userRepository.findByEmail(email);
      // Only actually send if the account exists AND is still
      // unverified — but the message shown to the visitor is identical
      // in every case (exists+verified / exists+unverified / doesn't
      // exist), so this endpoint can't be used to discover which emails
      // have accounts.
      if (user && !user.email_verified) {
        await sendVerificationEmail(user);
        logger.security('verification_email_resent', { userId: user.id });
      }
    }

    res.render('resend-verification-sent', {
      title: 'Vérifiez votre e-mail — Floridrap Plus',
    });
  })
);

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/account');
  res.render('login', { title: 'Connexion — Floridrap Plus', errors: {}, values: {} });
});

router.post(
  '/login',
  authLimiter,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const genericError = { form: ['E-mail ou mot de passe incorrect'] };

    if (req.validationFailed) {
      return res.status(400).render('login', {
        title: 'Connexion — Floridrap Plus',
        errors: req.validationErrors,
        values: { email: req.body.email },
      });
    }

    const { email, password } = req.validatedBody;
    const user = await userRepository.findByEmail(email);

    // Same generic message and (as close to) the same response time
    // whether the account doesn't exist or the password is wrong — this
    // is the control that stops an attacker from using the login form to
    // discover which emails have accounts. verifyPassword() is still run
    // against a dummy hash when there's no user, so both branches pay a
    // similar argon2 cost.
    const DUMMY_HASH =
      '$argon2id$v=19$m=19456,t=2,p=1$wMwgkog0z1a+mT3hEyZwhQ$6HItjE+AmDa2Z2tVHMaOXjWo8tS9dYM/PfnhLTP9aCo';
    const passwordValid = await verifyPassword(user ? user.password_hash : DUMMY_HASH, password);

    if (!user || !passwordValid) {
      logger.security('login_failed', { emailAttempted: email, ip: req.ip });
      return res.status(400).render('login', {
        title: 'Connexion — Floridrap Plus',
        errors: genericError,
        values: { email },
      });
    }

    if (!user.email_verified) {
      logger.security('login_blocked_unverified', { userId: user.id });
      return res.status(403).render('login', {
        title: 'Connexion — Floridrap Plus',
        errors: {
          form: [
            "Veuillez vérifier votre adresse e-mail avant de vous connecter. " +
              "Vous pouvez demander un nouveau lien de vérification.",
          ],
        },
        values: { email },
        showResendLink: true,
      });
    }

    await regenerateSession(req);
    req.session.userId = user.id;
    logger.security('login_succeeded', { userId: user.id });

    const returnTo = req.session.returnTo;
    delete req.session.returnTo;
    setFlash(req, 'success', `Bon retour, ${user.name} !`);
    const fallback = user.role === 'admin' ? '/admin' : '/account';
    res.redirect(returnTo && returnTo.startsWith('/') ? returnTo : fallback);
  })
);

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('fp.sid');
    res.redirect('/');
  });
});

module.exports = router;
