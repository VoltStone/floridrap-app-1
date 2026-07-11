'use strict';

const multer = require('multer');
const sharp = require('sharp');
const logger = require('../utils/logger');

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_DIMENSION_PX = 6000; // guards against decompression-bomb style images
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

// Memory storage, not disk storage: the raw upload is never written to
// disk as-is — it only ever gets re-encoded (see processProductImage
// below) and then stored as a base64 string in the database, never as a
// file. This was already true before (disk storage was only ever a
// staging step for the security reasons described below), but it's also
// now the only option that works at all: a serverless host like Vercel
// has no writable, persistent local disk to stage files on in the first
// place.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 },
  fileFilter(req, file, cb) {
    // This check is a fast, cheap first filter based on what the client
    // *claims* the content-type is — trivially spoofable, so it is not
    // the real security control. The real control is sharp actually
    // decoding the file content below.
    cb(null, ALLOWED_MIME_TYPES.has(file.mimetype));
  },
}).single('image');

/**
 * Wraps multer so its errors (oversized file, wrong field name, wrong
 * declared type) become a friendly `req.uploadError` string instead of
 * an unhandled exception — the calling route re-renders its form with
 * this message rather than showing a generic error page.
 */
function uploadImage(req, res, next) {
  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      req.uploadError =
        err.code === 'LIMIT_FILE_SIZE'
          ? "L'image dépasse la taille maximale autorisée (5 Mo)."
          : "Le fichier envoyé n'est pas valide.";
    } else if (err) {
      logger.error('Unexpected upload error', err);
      req.uploadError = "Une erreur est survenue lors de l'envoi de l'image.";
    } else if (req.file && !ALLOWED_MIME_TYPES.has(req.file.mimetype)) {
      req.uploadError = 'Formats acceptés : JPEG, PNG, WebP.';
    }
    next();
  });
}

/**
 * The real validation + sanitization step. Attempts to actually decode
 * the uploaded bytes as an image with sharp (which sniffs real file
 * structure, not the claimed content-type) and, on success, re-encodes
 * it from scratch as WebP. Re-encoding is what strips any embedded
 * metadata/payload and guarantees what ends up stored is nothing but
 * pixel data — not a copy of whatever bytes the client actually sent.
 *
 * The result is left on `req` as a base64 string + mime type
 * (`req.uploadedImage`), not written anywhere — the calling route hands
 * that straight to productRepository.updateImage(), which stores it in
 * the database. See src/db/schema.sql for why.
 */
async function processProductImage(req, res, next) {
  if (req.uploadError || !req.file) {
    return next();
  }

  try {
    const image = sharp(req.file.buffer, { failOn: 'error' });
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      req.uploadError = "Le fichier envoyé n'est pas une image valide.";
      return next();
    }
    if (metadata.width > MAX_DIMENSION_PX || metadata.height > MAX_DIMENSION_PX) {
      req.uploadError = 'Image trop grande (dimensions maximales : 6000x6000px).';
      return next();
    }

    const buffer = await image
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer(); // sharp re-encodes fresh bytes here — never the original upload

    req.uploadedImage = { base64: buffer.toString('base64'), mime: 'image/webp' };
    next();
  } catch (err) {
    // sharp throws when the bytes aren't a genuine, decodable image at
    // all — e.g. a renamed .php file, a truncated file, or a crafted
    // polyglot. This is the actual security boundary, not the
    // extension/MIME-type check above.
    logger.security('image_upload_rejected_invalid_content', { ip: req.ip, userId: req.user && req.user.id });
    req.uploadError = "Le fichier envoyé n'est pas une image valide.";
    next();
  }
}

module.exports = { uploadImage, processProductImage };

