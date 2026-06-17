import { useState } from 'react';
import { updateQuestDescription } from '../lib/api';
import { Icon, CategoryIcon } from './Icons';
import { CATEGORY_COLORS, DIFF_STYLES } from '../lib/questMeta';

function formatFullDue(dateStr) {
  if (!dateStr) return 'No date set';
  return new Date(dateStr).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

const RECURRENCE_LABEL = { none: 'One-time', daily: '↻ Daily', weekly: '↻ Weekly' };

function MetaTile({ label, value, color = '#e2e8f0' }) {
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(13,31,56,0.55)', border: '1px solid rgba(59,130,246,0.12)' }}>
      <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#475569' }}>{label}</p>
      <p className="text-sm font-semibold" style={{ color }}>{value}</p>
    </div>
  );
}

// Read-only quest detail card with an inline description editor.
// Only the description is editable — everything else is display-only.
export default function QuestDetailModal({ quest, onClose, onUpdated }) {
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(quest.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const catBg = CATEGORY_COLORS[quest.category] ?? 'rgba(59,130,246,0.12)';
  const diff = DIFF_STYLES[quest.difficulty] ?? DIFF_STYLES.medium;
  const xp = quest.xpReward ?? 50;
  const debtAmt = quest.debtAmount ?? 5;

  const status = quest.completed ? 'Completed' : 'Active';
  const statusColor = quest.completed ? '#34d399' : '#60a5fa';

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const res = await updateQuestDescription(quest.id, description.trim());
      onUpdated?.(res.data.quest);
      setEditing(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save description');
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    setDescription(quest.description ?? '');
    setError('');
    setEditing(false);
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl"
        style={{ background: '#080F20', border: '1px solid rgba(59,130,246,0.25)' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 py-4" style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: catBg, border: `1px solid ${catBg.replace(/[\d.]+\)$/, '0.4)')}` }}>
              <CategoryIcon category={quest.category} className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className={`text-lg font-bold leading-snug ${quest.completed ? 'line-through text-slate-400' : 'text-navy-50'}`}>
                {quest.title}
              </h2>
              <p className="text-xs mt-0.5 capitalize" style={{ color: '#64748b' }}>{quest.category}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-navy-200 transition-colors p-1 flex-shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Description */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-blue-400 uppercase tracking-widest">Description</p>
              {!editing && (
                <button
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg transition-all"
                  style={{ background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(59,130,246,0.3)', color: '#60a5fa' }}
                >
                  <Icon name="pencil" className="w-3.5 h-3.5" color="#60a5fa" />
                  Edit Quest
                </button>
              )}
            </div>

            {editing ? (
              <div className="space-y-3">
                <textarea
                  className="input resize-none w-full"
                  rows={5}
                  autoFocus
                  placeholder="Add more detail about what this quest means…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={1000}
                />
                {error && (
                  <p className="text-xs text-red-400 px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    {error}
                  </p>
                )}
                <div className="flex gap-3">
                  <button onClick={cancelEdit} className="btn-secondary flex-1" disabled={saving}>Cancel</button>
                  <button onClick={handleSave} className="btn-primary flex-1" disabled={saving}>
                    {saving ? 'Saving…' : 'Save Description'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(13,31,56,0.55)', border: '1px solid rgba(59,130,246,0.12)' }}>
                {quest.description && quest.description.trim() ? (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: '#cbd5e1' }}>{quest.description}</p>
                ) : (
                  <p className="text-sm italic" style={{ color: '#475569' }}>
                    No description yet. Hit “Edit Quest” to add one.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Details grid */}
          <div>
            <p className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-2">Details</p>
            <div className="grid grid-cols-2 gap-2">
              <MetaTile label="Due" value={formatFullDue(quest.dueDate)} />
              <MetaTile label="Status" value={status} color={statusColor} />
              <MetaTile label="Difficulty" value={diff.label} color={diff.color} />
              <MetaTile label="Recurrence" value={RECURRENCE_LABEL[quest.recurrence] ?? 'One-time'} />
              <MetaTile label="XP Reward" value={`+${xp} XP`} color="#fbbf24" />
              <MetaTile label="Debt if skipped" value={`+${debtAmt} pts / day`} color="#fb923c" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
