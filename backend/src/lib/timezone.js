// True if `tz` is an IANA timezone the runtime can actually use. Client-supplied
// timezones must be validated before storage — an invalid one makes every
// Intl.DateTimeFormat call below throw RangeError, which would otherwise abort
// the nightly debt cron for all users.
function isValidTimeZone(tz) {
  if (typeof tz !== 'string' || tz.length === 0 || tz.length > 64) return false;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Returns the UTC timestamp corresponding to midnight in the given timezone
// for the given local date string "YYYY-MM-DD".
// Uses iterative refinement so DST transition days (where noon/midnight differ
// in UTC offset) are handled correctly.
function localMidnightUTC(localDateStr, timezone) {
  const [y, mo, d] = localDateStr.split('-').map(Number);
  let candidate = new Date(Date.UTC(y, mo - 1, d, 0, 0, 0));

  for (let iter = 0; iter < 3; iter++) {
    const hms = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(candidate).split(':').map(n => parseInt(n, 10));
    const h = hms[0] % 24;
    const secondsOff = h * 3600 + hms[1] * 60 + hms[2];
    if (secondsOff === 0) break;
    candidate = new Date(candidate.getTime() + (h < 12 ? -secondsOff : 86400 - secondsOff) * 1000);
  }

  return candidate;
}

// Formats a Date as "YYYY-MM-DD" in the given timezone (uses the sv locale,
// which naturally produces ISO date strings without extra formatting).
function localDateString(date, timezone) {
  return new Intl.DateTimeFormat('sv', { timeZone: timezone }).format(date);
}

// Returns the UTC timestamp of 23:59:59.999 in the given timezone on the given
// local date string. Computed as (start of next local day) - 1ms.
function localEndOfDayUTC(localDateStr, timezone) {
  const todayMidnight = localMidnightUTC(localDateStr, timezone);
  // Add 25h to clear any DST spring-forward, then format to get tomorrow's date
  const approxTomorrow = new Date(todayMidnight.getTime() + 25 * 3600 * 1000);
  const tomorrowStr = localDateString(approxTomorrow, timezone);
  return new Date(localMidnightUTC(tomorrowStr, timezone).getTime() - 1);
}

module.exports = { localMidnightUTC, localDateString, localEndOfDayUTC, isValidTimeZone };
