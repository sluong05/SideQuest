// Server-side helper for public (no-auth) profile lookups used by
// getServerSideProps in /u/[username] and /join.
const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/+$/, '');

export async function fetchPublicProfile(username, { timeoutMs = 4000 } = {}) {
  if (!username || typeof username !== 'string' || username.length > 40) return null;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(`${API_URL}/api/users/public/${encodeURIComponent(username)}`, {
      headers: { Accept: 'application/json' },
      signal: controller?.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const p = data?.user || data;
    if (!p || !p.username) return null;
    return {
      username: p.username,
      bio: p.bio ?? null,
      avatarUrl: p.avatarUrl ?? null,
      level: p.level ?? 1,
      xp: p.xp ?? 0,
      currentStreak: p.currentStreak ?? 0,
      maxStreak: p.maxStreak ?? 0,
      totalQuestsCompleted: p.totalQuestsCompleted ?? 0,
      joinedAt: p.joinedAt ?? null,
    };
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function profileMetaTitle(p) {
  return `${p.username} — ${p.currentStreak}-day streak, ${p.totalQuestsCompleted} quests on SideQuest`;
}

export function profileMetaDescription(p) {
  const bio = p.bio ? `${p.bio} · ` : '';
  return `${bio}Level ${p.level} on SideQuest. Join free to add ${p.username} as a friend and challenge them head-to-head.`;
}
