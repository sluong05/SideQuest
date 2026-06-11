// Quest styling + small formatting helpers shared across pages.
// Category icon metadata lives in components/Icons.js (CategoryIcon).

export const CATEGORY_COLORS = {
  fitness:      'rgba(59,130,246,0.18)',
  learning:     'rgba(168,85,247,0.18)',
  focus:        'rgba(16,185,129,0.18)',
  productivity: 'rgba(234,179,8,0.18)',
  wellness:     'rgba(34,197,94,0.18)',
  chores:       'rgba(251,146,60,0.18)',
  other:        'rgba(59,130,246,0.12)',
};

export const DIFF_STYLES = {
  easy:   { label: 'Easy',   color: '#34d399', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)' },
  medium: { label: 'Medium', color: '#fbbf24', bg: 'rgba(234,179,8,0.12)',  border: 'rgba(234,179,8,0.3)' },
  hard:   { label: 'Hard',   color: '#f87171', bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)' },
};

export const DIFF_DURATION = { easy: '~20 min', medium: '~45 min', hard: '~60 min' };

export function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return `${Math.floor(s / 604800)}w ago`;
}
