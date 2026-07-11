'use strict';

/**
 * Validates req.body against a zod schema. On failure, it does NOT throw —
 * it attaches field-level errors to the request and lets the route handler
 * re-render its own form with those errors (better UX than a generic error
 * page, and keeps field-specific messages next to the relevant input for
 * accessibility). On success, the *parsed and coerced* data is used, never
 * the raw body, so anything not explicitly declared in the schema is
 * dropped (prevents mass-assignment of unexpected fields).
 */
function validateBody(schema) {
  return function validate(req, res, next) {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      req.validationFailed = true;
      req.validationErrors = result.error.flatten().fieldErrors;
      return next();
    }
    req.validatedBody = result.data;
    next();
  };
}

module.exports = { validateBody };
