'use strict';

const helmet = require('helmet');

// Every directive below is deliberate rather than left at helmet's default:
//  - default-src 'self'      : deny-by-default baseline
//  - script-src 'self'       : no inline <script>, no third-party JS. All
//                              interactivity in the views is done with
//                              small external .js files (or plain HTML),
//                              specifically to keep this directive free of
//                              'unsafe-inline'.
//  - style-src               : Google Fonts stylesheet is external, so it
//                              must be allow-listed by origin; inline
//                              <style> attributes are still avoided in the
//                              views, but a few view partials use minimal
//                              inline swatch colors, hence 'unsafe-inline'
//                              only on style-src (not script-src, which is
//                              the higher-risk directive for XSS).
//  - img-src                 : self, data URIs (for inline SVG icons), and
//                              the Pexels CDN used for placeholder product
//                              photography. Replace with your real CDN.
//  - object-src 'none'       : blocks Flash/plugins entirely.
//  - frame-ancestors 'none'  : equivalent to X-Frame-Options: DENY, stops
//                              this site being framed for clickjacking.
//  - form-action 'self'      : forms can only submit back to this origin.
//  - base-uri 'self'         : blocks <base> tag injection attacks.
//  - upgrade-insecure-requests: browser rewrites any accidental http:// to https://
const cspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
  fontSrc: ["'self'", 'https://fonts.gstatic.com'],
  imgSrc: ["'self'", 'data:', 'https://images.pexels.com'],
  objectSrc: ["'none'"],
  frameAncestors: ["'none'"],
  formAction: ["'self'"],
  baseUri: ["'self'"],
  upgradeInsecureRequests: [],
};

const securityMiddleware = [
  helmet({
    contentSecurityPolicy: { directives: cspDirectives },
    // HSTS only has an effect over HTTPS, but is safe to always send; a
    // reverse proxy or platform load balancer is expected to terminate TLS
    // in front of this app (see TRUST_PROXY in src/config/env.js).
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: false },
    // Explicit even though these match helmet's own defaults, so the
    // intent is visible in the codebase rather than implicit:
    frameguard: { action: 'deny' },          // X-Frame-Options: DENY
    noSniff: true,                            // X-Content-Type-Options: nosniff
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginResourcePolicy: { policy: 'same-site' },
  }),
];

module.exports = securityMiddleware;
