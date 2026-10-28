const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

const TOKEN_TTL = '7d';
const LAST_ACTIVE_INTERVAL_MS = 60 * 60 * 1000; // write lastActiveAt at most hourly

// Issue a session JWT. `tv` (tokenVersion) lets the server revoke every
// outstanding token for a user by bumping User.tokenVersion.
function signAuthToken(user) {
  return jwt.sign(
    { userId: user.id, tv: user.tokenVersion ?? 0 },
    process.env.JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

// Other JWTs are signed with the same secret (payoff-session start tokens carry
// `type`, unsubscribe tokens carry `purpose`). Those must never authenticate.
function isAuthTokenPayload(decoded) {
  return !!decoded && typeof decoded === 'object' &&
    Number.isInteger(decoded.userId) &&
    decoded.type === undefined && decoded.purpose === undefined;
}

// Tokens issued before the `tv` claim existed are treated as version 0.
function tokenVersionMatches(decoded, user) {
  return (decoded.tv ?? 0) === (user.tokenVersion ?? 0);
}

function shouldTouchLastActive(lastActiveAt, now = new Date()) {
  if (!lastActiveAt) return true;
  return now.getTime() - new Date(lastActiveAt).getTime() >= LAST_ACTIVE_INTERVAL_MS;
}

// Verifies signature/expiry and the payload shape only (no DB). Returns the
// decoded payload or null.
function decodeBearer(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    return isAuthTokenPayload(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const decoded = decodeBearer(req);
  if (!decoded) return res.status(401).json({ error: 'Invalid or expired token' });

  let user;
  try {
    user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, tokenVersion: true, lastActiveAt: true },
    });
  } catch (err) {
    console.error('[Auth] user lookup failed:', err.message);
    return res.status(500).json({ error: 'Server error' });
  }

  if (!user || !tokenVersionMatches(decoded, user)) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const now = new Date();
  if (shouldTouchLastActive(user.lastActiveAt, now)) {
    // Fire-and-forget; updateMany so a concurrently deleted user can't throw.
    prisma.user
      .updateMany({ where: { id: user.id }, data: { lastActiveAt: now } })
      .catch((err) => console.error('[Auth] lastActiveAt update failed:', err.message));
  }

  req.userId = decoded.userId;
  return next();
}

// Attaches req.userId when a valid Bearer token is present; never rejects.
// Signature-only (no tokenVersion check) — use only where identity is a hint.
function optionalAuth(req, res, next) {
  const decoded = decodeBearer(req);
  if (decoded) req.userId = decoded.userId;
  next();
}

module.exports = authMiddleware;
module.exports.signAuthToken = signAuthToken;
module.exports.optionalAuth = optionalAuth;
module.exports.decodeBearer = decodeBearer;
module.exports.isAuthTokenPayload = isAuthTokenPayload;
module.exports.tokenVersionMatches = tokenVersionMatches;
module.exports.shouldTouchLastActive = shouldTouchLastActive;
