/** @type {import('next').NextConfig} */

// Origin of the backend API the browser talks to (needs to be allowed by CSP
// connect-src). Falls back to local dev.
const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Content Security Policy.
// - script 'unsafe-eval' + jsdelivr: MediaPipe Pose runs WebAssembly from the CDN.
// - 'unsafe-inline' (script/style): required by the Next.js Pages Router (inline
//   hydration bootstrap) and Tailwind's injected styles.
// - img data:/blob:/https:: user avatars are stored as data: URLs; camera frames
//   use blob:.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  `connect-src 'self' ${API_ORIGIN} https://cdn.jsdelivr.net`,
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
