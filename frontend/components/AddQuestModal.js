import { useState } from 'react';
import { createQuest } from '../lib/api';
import { Icon, CategoryIcon } from './Icons';
import { CATEGORY_COLORS } from '../lib/questMeta';

const CATEGORIES = [
  { value: 'fitness',      label: 'Fitness'      },
  { value: 'learning',     label: 'Learning'     },
  { value: 'focus',        label: 'Focus'        },
  { value: 'productivity', label: 'Productivity' },
  { value: 'wellness',     label: 'Wellness'     },
  { value: 'chores',       label: 'Chores'       },
  { value: 'other',        label: 'Other'        },
];

const DIFFICULTIES = [
  { value: 'easy',   label: 'Easy',   xp: 25,  color: '#34d399',  activeBg: 'rgba(16,185,129,0.15)',  activeBorder: 'rgba(16,185,129,0.5)' },
  { value: 'medium', label: 'Medium', xp: 50,  color: '#fbbf24',  activeBg: 'rgba(234,179,8,0.15)',   activeBorder: 'rgba(234,179,8,0.5)' },
  { value: 'hard',   label: 'Hard',   xp: 100, color: '#f87171',  activeBg: 'rgba(239,68,68,0.15)',   activeBorder: 'rgba(239,68,68,0.5)' },
];


function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function QuestPreview({ title, category, difficulty, dueDate, dueTime, debtAmount }) {
  const cat = CATEGORIES.find((c) => c.value === category);
  const diff = DIFFICULTIES.find((d) => d.value === difficulty);
  const catBg = CATEGORY_COLORS[category] ?? 'rgba(59,130,246,0.1)';
  const dueFmt = dueDate && dueTime
    ? new Date(`${dueDate}T${dueTime}`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'No date set';

  return (
    <div className="space-y-4">
      {/* Quest card preview */}
      <div className="rounded-xl p-4" style={{ background: 'rgba(13,31,56,0.7)', border: '1px solid rgba(59,130,246,0.2)' }}>
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: catBg }}>
            <CategoryIcon category={category} className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-navy-50 leading-snug">
              {title || <span className="text-slate-500 italic">Quest title…</span>}
            </p>
            <p className="text-xs text-slate-400 mt-1">{dueFmt}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium px-2 py-0.5 rounded-full capitalize" style={{ background: catBg, color: '#60a5fa', border: '1px solid rgba(59,130,246,0.25)' }}>
            {cat?.label ?? 'Other'}
          </span>
          {diff && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: diff.activeBg, border: `1px solid ${diff.activeBorder}`, color: diff.color }}>
              {diff.label}
            </span>
          )}
          {diff && (
            <span className="text-xs font-bold text-yellow-400 px-2 py-0.5 rounded-full" style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.25)' }}>
              +{diff.xp} XP
            </span>
          )}
        </div>
      </div>

      {/* Debt breakdown preview */}
      <div>
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Debt Breakdown Preview</h4>
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(239,68,68,0.2)' }}>
          {[1, 3, 7].map((days) => (
            <div key={days} className="flex items-center justify-between px-3 py-2" style={{ borderBottom: days < 7 ? '1px solid rgba(239,68,68,0.1)' : 'none', background: 'rgba(239,68,68,0.04)' }}>
              <span className="text-xs text-slate-400">Day {days} overdue</span>
              <span className="text-xs font-bold text-red-400">
                {debtAmount * days} pts
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* XP summary */}
      <div>
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">XP Summary</h4>
        <div className="rounded-xl p-3 space-y-1.5" style={{ background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.15)' }}>
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Base XP</span>
            <span className="text-navy-200">{diff?.xp ?? 50}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Difficulty Bonus</span>
            <span className="text-navy-200">0</span>
          </div>
          <div className="h-px" style={{ background: 'rgba(234,179,8,0.2)' }} />
          <div className="flex justify-between text-sm font-bold">
            <span className="text-navy-200">Total XP Reward</span>
            <span className="text-yellow-400">+{diff?.xp ?? 50} XP</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AddQuestModal({ onClose, onQuestAdded }) {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState(todayString());
  const [dueTime, setDueTime] = useState('23:59');
  const [recurrence, setRecurrence] = useState('none');
  const [category, setCategory] = useState('other');
  const [difficulty, setDifficulty] = useState('medium');
  const [debtAmount, setDebtAmount] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedDiff = DIFFICULTIES.find((d) => d.value === difficulty);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) { setError('Quest title is required'); return; }
    setLoading(true);
    setError('');
    try {
      const [year, month, day] = dueDate.split('-').map(Number);
      const [hours, minutes] = dueTime.split(':').map(Number);
      const dueDateTime = new Date(year, month - 1, day, hours, minutes, 0, 0);
      const res = await createQuest(title.trim(), dueDateTime.toISOString(), recurrence, {
        category, difficulty, debtType: 'custom', debtAmount: Number(debtAmount),
      });
      onQuestAdded(res.data.quest);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create quest');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl"
        style={{ background: '#080F20', border: '1px solid rgba(59,130,246,0.25)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
          <div>
            <h2 className="text-lg font-bold text-navy-50">Create Quest</h2>
            <p className="text-xs text-slate-400 mt-0.5">Set a challenge and define the debt if you miss it.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-navy-200 transition-colors p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2">
          {/* Left: Form */}
          <div className="p-6" style={{ borderRight: '1px solid rgba(59,130,246,0.1)' }}>
            <p className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-4">Quest Details</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Title */}
              <div>
                <label className="label">Quest Title</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Complete 30 minutes of focused study"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  autoFocus
                  maxLength={200}
                />
              </div>

              {/* Category */}
              <div>
                <label className="label">Category</label>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map((cat) => {
                    const active = category === cat.value;
                    return (
                      <button
                        key={cat.value}
                        type="button"
                        onClick={() => setCategory(cat.value)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                        style={{
                          background: active ? 'rgba(59,130,246,0.2)' : 'rgba(13,31,56,0.8)',
                          border: `1px solid ${active ? 'rgba(59,130,246,0.6)' : 'rgba(59,130,246,0.12)'}`,
                          color: active ? '#60a5fa' : '#64748b',
                        }}
                      >
                        <CategoryIcon category={cat.value} className="w-3.5 h-3.5" color="currentColor" /> {cat.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Difficulty */}
              <div>
                <label className="label">Difficulty</label>
                <div className="grid grid-cols-3 gap-2">
                  {DIFFICULTIES.map((diff) => {
                    const active = difficulty === diff.value;
                    return (
                      <button
                        key={diff.value}
                        type="button"
                        onClick={() => setDifficulty(diff.value)}
                        className="py-2 rounded-lg text-xs font-semibold transition-all"
                        style={{
                          background: active ? diff.activeBg : 'rgba(13,31,56,0.8)',
                          border: `1px solid ${active ? diff.activeBorder : 'rgba(59,130,246,0.12)'}`,
                          color: active ? diff.color : '#64748b',
                        }}
                      >
                        {diff.label}
                        <span className="block text-[10px] mt-0.5 opacity-70">+{diff.xp} XP</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Due Date & Time */}
              <div>
                <label className="label">Due Date &amp; Time</label>
                <div className="flex gap-2">
                  <input type="date" className="input flex-1" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                  <input type="time" className="input w-28" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
                </div>
              </div>

              {/* Recurrence */}
              <div>
                <label className="label">Recurrence</label>
                <div className="grid grid-cols-3 gap-2">
                  {[{ value: 'none', label: 'None' }, { value: 'daily', label: '↻ Daily' }, { value: 'weekly', label: '↻ Weekly' }].map((opt) => {
                    const active = recurrence === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setRecurrence(opt.value)}
                        className="py-2 rounded-lg text-xs font-medium transition-all"
                        style={{
                          background: active ? 'rgba(59,130,246,0.15)' : 'rgba(13,31,56,0.8)',
                          border: `1px solid ${active ? 'rgba(59,130,246,0.5)' : 'rgba(59,130,246,0.12)'}`,
                          color: active ? '#60a5fa' : '#64748b',
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* IF I FAIL */}
              <div className="rounded-xl p-4" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)' }}>
                <p className="text-xs font-bold text-red-400 uppercase tracking-widest mb-1"><Icon name="alert" className="w-3 h-3 inline -mt-0.5 mr-1" color="#f87171" />If I fail this quest, I owe…</p>
                <p className="text-[11px] mb-3" style={{ color: '#64748b' }}>
                  You can choose how to pay it off (pushups, study, walk, etc.) when paying your debt.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={999}
                    className="input w-20 text-center"
                    value={debtAmount}
                    onChange={(e) => setDebtAmount(e.target.value)}
                  />
                  <span className="text-xs" style={{ color: '#94a3b8' }}>
                    debt points per overdue day
                  </span>
                </div>
              </div>

              {error && (
                <p className="text-xs text-red-400 px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  {error}
                </p>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={onClose} className="btn-secondary flex-1" disabled={loading}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1" disabled={loading}>
                  {loading ? 'Creating…' : <span className="flex items-center justify-center gap-2"><Icon name="swords" className="w-4 h-4" color="currentColor" /> Save Quest</span>}
                </button>
              </div>
            </form>
          </div>

          {/* Right: Preview */}
          <div className="p-6" style={{ background: 'rgba(4,10,20,0.5)' }}>
            <p className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-4">Quest Preview</p>
            <QuestPreview
              title={title}
              category={category}
              difficulty={difficulty}
              dueDate={dueDate}
              dueTime={dueTime}
              debtAmount={Number(debtAmount)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
