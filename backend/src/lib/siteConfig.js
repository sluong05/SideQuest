// Single source for public-facing URLs and sender identity. Switching domains
// later is a one-env-var change (SITE_URL / EMAIL_FROM).
const SITE_URL = (process.env.SITE_URL || 'https://www.pushupdebt.com').replace(/\/$/, '');
const EMAIL_FROM = process.env.EMAIL_FROM || 'SideQuest <noreply@pushupdebt.com>';
const API_PUBLIC_URL = (process.env.API_PUBLIC_URL || process.env.RAILWAY_PUBLIC_DOMAIN && `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` || 'https://pushupdebt-production.up.railway.app').replace(/\/$/, '');

const num = (name, def) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : def;
};

module.exports = {
  SITE_URL,
  EMAIL_FROM,
  API_PUBLIC_URL,
  avatarUrl: (userId, hasAvatar) => (hasAvatar ? `${API_PUBLIC_URL}/api/users/${userId}/avatar` : null),
  DEBT_MAX_DAYS: num('DEBT_MAX_DAYS', 7),
  DAILY_SURPLUS_COIN_CAP: num('DAILY_SURPLUS_COIN_CAP', 50),
  DAILY_COMPLETION_CAP: num('DAILY_COMPLETION_CAP', 30),
  MIN_QUEST_AGE_SECONDS: num('MIN_QUEST_AGE_SECONDS', 60),
  FREE_EDIT_MINUTES: num('FREE_EDIT_MINUTES', 15),
  REFERRAL_COINS: num('REFERRAL_COINS', 25),
  LOCKOUT_THRESHOLD: 250,
  REQUIRE_SESSION_TOKEN: process.env.REQUIRE_SESSION_TOKEN === 'true',
};
