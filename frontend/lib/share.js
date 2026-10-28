// Web Share API with clipboard fallback.
import { profileUrl } from './site';

// Returns 'shared' | 'copied' | 'cancelled' | 'failed'
export async function shareOrCopy({ title = 'SideQuest', text = '', url = '' } = {}) {
  if (typeof window === 'undefined') return 'failed';
  const nav = window.navigator;
  if (nav.share) {
    try {
      await nav.share({ title, text, url });
      return 'shared';
    } catch (err) {
      if (err && err.name === 'AbortError') return 'cancelled';
      // otherwise fall through to copy
    }
  }
  const payload = [text, url].filter(Boolean).join(' ');
  try {
    if (nav.clipboard?.writeText) {
      await nav.clipboard.writeText(payload);
      return 'copied';
    }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = payload;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    if (ok) return 'copied';
  } catch { /* ignore */ }
  return 'failed';
}

export function streakShareText(streak) {
  return `I'm on a ${streak}-day streak on SideQuest. Every missed deadline costs me pushups — come keep me honest.`;
}

export function levelShareText(level) {
  return `Just reached level ${level} on SideQuest by actually finishing my quests. Join me?`;
}

export function profileShareText(username, streak = 0) {
  return streak > 0
    ? `${username} is on a ${streak}-day streak on SideQuest. Think you can keep up?`
    : `Follow my side quests on SideQuest — miss a deadline and you owe pushups.`;
}

export function profileLink(username) {
  return username ? profileUrl(username) : '';
}
