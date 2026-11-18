// Comeback amnesty: a user who returns after being away COMEBACK_AWAY_DAYS or
// more gets COMEBACK_WINDOW_DAYS to wipe their debt for free (no Fresh Start
// cooldown used, streak untouched). Punishment that piles up while someone is
// away is the main reason people never come back to accountability apps, so
// re-entry should cost nothing.
const { COMEBACK_AWAY_DAYS, COMEBACK_WINDOW_DAYS } = require('./siteConfig');

const DAY_MS = 24 * 60 * 60 * 1000;

// Returns the end of a new comeback window when this activity follows a long
// absence, else null. Users with no recorded activity (pre-tracking) get none.
function comebackUntilFor(lastActiveAt, now = new Date(), awayDays = COMEBACK_AWAY_DAYS, windowDays = COMEBACK_WINDOW_DAYS) {
  if (!lastActiveAt || awayDays <= 0 || windowDays <= 0) return null;
  const away = new Date(now).getTime() - new Date(lastActiveAt).getTime();
  if (away < awayDays * DAY_MS) return null;
  return new Date(new Date(now).getTime() + windowDays * DAY_MS);
}

function comebackActive(comebackUntil, now = new Date()) {
  return Boolean(comebackUntil && new Date(comebackUntil).getTime() > new Date(now).getTime());
}

module.exports = { comebackUntilFor, comebackActive };
