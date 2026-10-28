import { ImageResponse } from 'next/og';

// Dynamic Open Graph image: /api/og?username=<name>
// Falls back to a generic SideQuest card when no username or the lookup fails.
export const config = { runtime: 'edge' };

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/+$/, '');

async function loadProfile(username) {
  if (!username) return null;
  try {
    const res = await fetch(`${API_URL}/api/users/public/${encodeURIComponent(username)}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.user || data || null;
  } catch {
    return null;
  }
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const username = (searchParams.get('username') || '').slice(0, 40);
  const p = await loadProfile(username);

  const name = p?.username || null;
  const streak = p?.currentStreak ?? 0;
  const quests = p?.totalQuestsCompleted ?? 0;
  const level = p?.level ?? 1;

  const stat = (value, label, color) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginRight: 64 }}>
      <div style={{ display: 'flex', fontSize: 72, fontWeight: 800, color }}>{String(value)}</div>
      <div style={{ display: 'flex', fontSize: 28, color: '#94a3b8' }}>{label}</div>
    </div>
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          justifyContent: 'space-between', padding: 72,
          background: 'linear-gradient(135deg, #050A14 0%, #0A1628 55%, #0d1f38 100%)',
          color: '#f8fafc', fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', fontSize: 34, fontWeight: 700, color: '#60a5fa', letterSpacing: 2 }}>SIDEQUEST</div>
        {name ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontSize: 84, fontWeight: 800 }}>{name}</div>
            <div style={{ display: 'flex', marginTop: 36 }}>
              {stat(streak, 'day streak', '#fb923c')}
              {stat(quests, 'quests done', '#4ade80')}
              {stat(`Lv ${level}`, 'level', '#60a5fa')}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontSize: 80, fontWeight: 800 }}>Miss a deadline?</div>
            <div style={{ display: 'flex', fontSize: 80, fontWeight: 800, color: '#60a5fa' }}>You owe pushups.</div>
          </div>
        )}
        <div style={{ display: 'flex', fontSize: 30, color: '#94a3b8' }}>
          {name ? `Join SideQuest to challenge ${name}` : 'Quests with real deadlines. Pay missed ones back with reps, focus or chores.'}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400' },
    }
  );
}
