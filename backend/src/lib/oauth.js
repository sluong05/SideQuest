// Sign in with Apple / Google: verify the provider's ID token against its
// published JWKS, then find-or-create the local user by email.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const prisma = require('./prisma');

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

class OAuthError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// jose v6 is ESM-only; dynamic import works from CommonJS on every Node version
// (require(esm) only on newer ones).
let josePromise;
function loadJose() {
  if (!josePromise) josePromise = import('jose');
  return josePromise;
}

const jwksCache = new Map();
async function getJwks(url) {
  if (!jwksCache.has(url)) {
    const { createRemoteJWKSet } = await loadJose();
    jwksCache.set(url, createRemoteJWKSet(new URL(url)));
  }
  return jwksCache.get(url);
}

function appleAudiences() {
  return [process.env.APPLE_BUNDLE_ID || 'com.steventracy.sidequest', process.env.APPLE_SERVICES_ID]
    .filter(Boolean);
}

// GOOGLE_CLIENT_ID may list several client ids (web, iOS) separated by commas.
function googleAudiences() {
  return String(process.env.GOOGLE_CLIENT_ID || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function isAppleEnabled() {
  return process.env.APPLE_SIGNIN_ENABLED === 'true';
}
function isGoogleEnabled() {
  return googleAudiences().length > 0;
}

// Apple sends email_verified as the string "true"; Google as a boolean.
function claimTrue(v) {
  return v === true || v === 'true';
}

async function verifyIdToken(token, { jwksUrl, issuer, audience }) {
  if (typeof token !== 'string' || token.length === 0 || token.length > 8192) {
    throw new OAuthError(400, 'Missing or malformed identity token');
  }
  const { jwtVerify } = await loadJose();
  try {
    const { payload } = await jwtVerify(token, await getJwks(jwksUrl), { issuer, audience });
    return payload;
  } catch (err) {
    throw new OAuthError(401, 'Invalid identity token');
  }
}

async function verifyAppleToken(identityToken) {
  const p = await verifyIdToken(identityToken, {
    jwksUrl: APPLE_JWKS_URL, issuer: APPLE_ISSUER, audience: appleAudiences(),
  });
  // Apple relay addresses (is_private_email) are real, deliverable, Apple-verified addresses.
  return { email: p.email, emailVerified: claimTrue(p.email_verified) || claimTrue(p.is_private_email), sub: p.sub };
}

async function verifyGoogleToken(credential) {
  const p = await verifyIdToken(credential, {
    jwksUrl: GOOGLE_JWKS_URL, issuer: GOOGLE_ISSUERS, audience: googleAudiences(),
  });
  return { email: p.email, emailVerified: claimTrue(p.email_verified), sub: p.sub };
}

// A random password nobody knows; the account can later set one via reset.
async function unusablePasswordHash() {
  return bcrypt.hash(`oauth:${crypto.randomBytes(32).toString('hex')}`, 10);
}

/**
 * Finds the user for a verified provider identity, or creates one.
 * Linking to an EXISTING account requires the provider to vouch for the email
 * (otherwise anyone could claim an address at a lax provider and take over).
 * Returns { user, isNew }.
 */
async function findOrCreateOAuthUser({ email, emailVerified }, { timezone } = {}) {
  if (typeof email !== 'string' || !email.includes('@')) {
    throw new OAuthError(400, 'The provider did not share an email address');
  }
  const normalizedEmail = email.trim().toLowerCase();

  const existing = await prisma.user.findFirst({
    where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
  });

  if (existing) {
    if (!emailVerified) {
      throw new OAuthError(409, 'An account with this email already exists — log in with your password', 'EMAIL_NOT_VERIFIED');
    }
    const data = { loginAttempts: 0, lockedUntil: null };
    if (!existing.emailVerified) {
      data.emailVerified = true;
      data.emailVerificationToken = null;
    }
    if (timezone && timezone !== existing.timezone) data.timezone = timezone;
    const user = await prisma.user.update({ where: { id: existing.id }, data });
    return { user, isNew: false };
  }

  try {
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        password: await unusablePasswordHash(),
        emailVerified: !!emailVerified,
        timezone: timezone || 'UTC',
      },
    });
    return { user, isNew: true };
  } catch (err) {
    // Lost a race with a concurrent sign-in for the same email.
    if (err.code === 'P2002') {
      const user = await prisma.user.findFirst({ where: { email: { equals: normalizedEmail, mode: 'insensitive' } } });
      if (user) return { user, isNew: false };
    }
    throw err;
  }
}

module.exports = {
  OAuthError,
  isAppleEnabled,
  isGoogleEnabled,
  verifyAppleToken,
  verifyGoogleToken,
  findOrCreateOAuthUser,
  claimTrue,
  appleAudiences,
  googleAudiences,
};
