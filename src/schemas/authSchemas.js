'use strict';

const { z } = require('zod');

// A short denylist of the most common breached/default passwords. Not a
// substitute for a real breach-corpus check (e.g. Have I Been Pwned's
// k-anonymity API) but demonstrates the principle cheaply for this demo.
const COMMON_PASSWORDS = new Set([
  'password', 'password1', '12345678', '123456789', 'qwerty123',
  'azerty123', 'motdepasse', 'letmein1', 'iloveyou1',
]);

const passwordField = z
  .string()
  .min(10, 'Le mot de passe doit contenir au moins 10 caractères')
  .max(128, 'Le mot de passe est trop long')
  .refine((val) => !COMMON_PASSWORDS.has(val.toLowerCase()), {
    message: 'Ce mot de passe est trop commun, veuillez en choisir un autre',
  });

const nameField = z
  .string()
  .trim()
  .min(2, 'Le nom doit contenir au moins 2 caractères')
  .max(80, 'Le nom est trop long')
  .regex(/^[\p{L}\p{M}' -]+$/u, 'Le nom contient des caractères non autorisés');

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .email("Adresse e-mail invalide")
  .max(254);

const registerSchema = z
  .object({
    name: nameField,
    email: emailField,
    password: passwordField,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  });

const loginSchema = z.object({
  email: emailField,
  // Intentionally no format/complexity constraints on login — the account
  // was created under whatever policy was active at signup time, so login
  // must accept it. Length capped only to reject unreasonably large input.
  password: z.string().min(1, 'Mot de passe requis').max(128),
});

const resendVerificationSchema = z.object({
  email: emailField,
});

module.exports = { registerSchema, loginSchema, resendVerificationSchema };
