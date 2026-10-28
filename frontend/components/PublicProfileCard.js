import { Icon } from './Icons';

// Read-only profile card built from GET /api/users/public/:username.
export default function PublicProfileCard({ profile, children }) {
  if (!profile) return null;
  const joined = profile.joinedAt
    ? new Date(profile.joinedAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;
  const stats = [
    { label: 'day streak',  value: profile.currentStreak ?? 0, color: '#fb923c', icon: 'flame' },
    { label: 'best streak', value: profile.maxStreak ?? 0, color: '#60a5fa', icon: 'trophy' },
    { label: 'quests done', value: profile.totalQuestsCompleted ?? 0, color: '#4ade80', icon: 'checkCircle' },
    { label: 'level',       value: profile.level ?? 1, color: '#c084fc', icon: 'arrowUpCircle' },
  ];
  return (
    <div className="card">
      <div className="flex items-start gap-4">
        <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-navy-600 flex-shrink-0">
          {profile.avatarUrl ? (
            <img src={profile.avatarUrl} alt={profile.username} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-blue-500/20 flex items-center justify-center">
              <span className="text-2xl font-bold text-blue-400">{profile.username[0].toUpperCase()}</span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-navy-50 truncate">{profile.username}</h1>
          {profile.bio && <p className="text-sm text-navy-300 mt-0.5 leading-relaxed">{profile.bio}</p>}
          {joined && <p className="text-xs text-slate-400 mt-1">Questing since {joined}</p>}
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5">
        {stats.map(({ label, value, color, icon }) => (
          <div key={label} className="rounded-xl py-3 px-2 text-center" style={{ background: 'rgba(13,31,56,0.6)', border: '1px solid rgba(59,130,246,0.12)' }}>
            <div className="flex items-center justify-center gap-1">
              <Icon name={icon} className="w-3.5 h-3.5" color={color} />
              <span className="text-xl font-bold tabular-nums" style={{ color }}>{value}</span>
            </div>
            <p className="text-[11px] text-navy-300 mt-0.5">{label}</p>
          </div>
        ))}
      </div>
      {children}
    </div>
  );
}
