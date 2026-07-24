import { createMiddleware } from 'hono/factory';
import type { Env } from '../bindings';

/**
 * Security headers middleware (replaces helmet).
 * Equivalent CSP directives to the Express app.
 */
export const securityHeaders = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  await next();

  c.res.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "frame-src https://accounts.google.com",
      "connect-src 'self'",
    ].join('; '),
  );
  c.res.headers.set('X-Content-Type-Options', 'nosniff');
  c.res.headers.set('X-Frame-Options', 'DENY');
  c.res.headers.set('X-XSS-Protection', '0');
  c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
});
