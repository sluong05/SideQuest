import { useState, useEffect } from 'react';
import { updateQuest } from '../lib/api';
import { Icon, CategoryIcon } from './Icons';
import { CATEGORY_COLORS, DIFF_STYLES } from '../lib/questMeta';
import {
  useSheetBehavior, isCoarsePointer, SheetCloseButton, SheetHandle,
  FREE_EDIT_MINUTES, freeWindowMinutesLeft, deletePenalty, canEditSchedule,
} from './SheetModal';

function formatFullDue(dateStr) {
  if (!dateStr) return 'No date set';
  return new Date(dateStr).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function pad(n) { return String(n).padStart(2, '0'); }
function toLocalDate(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function toLocalTime(iso) {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const RECURRENCE_LABEL = { none: 'One-time', daily: '↻ Daily', weekly: '↻ Weekly' };
const DIFF_KEYS = ['easy', 'medium', 'hard'];

function MetaTile({ label, value, color = '#e2e8f0' }) {
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(13,31,56,0.55)', border: '1px solid rgba(59,130,246,0.12)' }}>
      <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94A3B8' }}>{label}</p>
      <p className="text-sm font-semibold" style={{ color }}>{value}</p>
    </div>
  );
}

// Quest detail sheet with an editor. Title/description are always editable
// (until the completion locks); due date, difficulty and penalty only while
// the quest is not completed and either not yet due or inside the free window.
// Optional `onDelete` shows a delete button (caller confirms + performs it).
export default function QuestDetailModal({ quest, onClose, onUpdated, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(quest.title ?? '');
  const [description, setDescription] = useState(quest.description ?? '');
  const [dueDate, setDueDate] = useState(toLocalDate(quest.dueDate));
  const [dueTime, setDueTime] = useState(toLocalTime(quest.dueDate));
  const [difficulty, setDifficulty] = useState(quest.difficulty ?? 'medium');
  const [debtAmount, setDebtAmount] = useState(quest.debtAmount ?? 5);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [scheduleLocked, setScheduleLocked] = useState(false); // server said EDIT_LOCKED
  const [autoFocusFields] = useState(() => !isCoarsePointer());
  const [now, setNow] = useState(() => Date.now());

  useSheetBehavior(onClose);

  // Re-evaluate the free window every 30s while open
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const catBg = CATEGORY_COLORS[quest.category] ?? 'rgba(59,130,246,0.12)';
  const diff = DIFF_STYLES[quest.difficulty] ?? DIFF_STYLES.medium;
  const xp = quest.xpReward ?? 50;
  const debtAmt = quest.debtAmount ?? 5;

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const completionLocked = quest.completed && quest.completedAt && new Date(quest.completedAt) < todayStart;
  const canEditText = !completionLocked;
  const scheduleEditable = canEditSchedule(quest, now) && !scheduleLocked;
  const freeLeft = freeWindowMinutesLeft(quest, now);
  const penaltyNow = deletePenalty(quest, now);

  const status = quest.completed ? 'Completed' : 'Active';
  const statusColor = quest.completed ? '#34d399' : '#60a5fa';

  function startEdit() {
    setTitle(quest.title ?? '');
    setDescription(quest.description ?? '');
    setDueDate(toLocalDate(quest.dueDate));
    setDueTime(toLocalTime(quest.dueDate));
    setDifficulty(quest.difficulty ?? 'medium');
    setDebtAmount(quest.debtAmount ?? 5);
    setError('');
    setEditing(true);
  }

  async function handleSave(e) {
    e?.preventDefault();
    if (!title.trim()) { setError('Quest title is required'); return; }
    const fields = {};
    if (title.trim() !== (quest.title ?? '')) fields.title = title.trim();
    if (description.trim() !== (quest.description ?? '').trim()) fields.description = description.trim();
    if (scheduleEditable) {
      const [y, m, d] = dueDate.split('-').map(Number);
      const [hh, mm] = dueTime.split(':').map(Number);
      const newDue = new Date(y, m - 1, d, hh, mm, 0, 0);
      if (Number.isNaN(newDue.getTime())) { setError('Pick a valid due date'); return; }
      if (newDue.getTime() !== new Date(quest.dueDate).getTime()) fields.dueDate = newDue.toISOString();
      if (difficulty !== (quest.difficulty ?? 'medium')) fields.difficulty = difficulty;
      const pen = Math.round(Number(debtAmount));
      if (!Number.isFinite(pen) || pen < 1 || pen > 999) { setError('Penalty must be between 1 and 999 pts'); return; }
      if (pen !== (quest.debtAmount ?? 5)) fields.debtAmount = pen;
    }
    if (Object.keys(fields).length === 0) { setEditing(false); return; }

    setSaving(true);
    setError('');
    try {
      const res = await updateQuest(quest.id, fields);
      onUpdated?.(res.data.quest);
      setEditing(false);
    } catch (err) {
      const data = err.response?.data;
      if (data?.code === 'EDIT_LOCKED') {
        setScheduleLocked(true);
        setError('Due date, difficulty and penalty are locked now that this quest is past due. You can still edit the title and description.');
        setDueDate(toLocalDate(quest.dueDate));
        setDueTime(toLocalTime(quest.dueDate));
        setDifficulty(quest.difficulty ?? 'medium');
        setDebtAmount(quest.debtAmount ?? 5);
      } else {
        setError(data?.error || 'Failed to save changes');
      }
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    setError('');
    setEditing(false);
  }

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quest-detail-title"
        className="w-full max-w-lg max-h-[92dvh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden"
        style={{ background: '#080F20', border: '1px solid rgba(59,130,246,0.25)' }}
      >
        <SheetHandle />
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 sm:px-6 py-3 sm:py-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: catBg, border: `1px solid ${catBg.replace(/[\d.]+\)$/, '0.4)')}` }}>
              <CategoryIcon category={quest.category} className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 id="quest-detail-title" className={`text-lg font-bold leading-snug break-words ${quest.completed ? 'line-through text-slate-400' : 'text-navy-50'}`}>
                {quest.title}
              </h2>
              <p className="text-xs mt-0.5 capitalize" style={{ color: '#94A3B8' }}>{quest.category}</p>
            </div>
          </div>
          <SheetCloseButton onClose={onClose} label="Close quest details" />
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {editing ? (
            <form id="quest-edit-form" onSubmit={handleSave} className="p-5 sm:p-6 space-y-4">
              <div>
                <label className="label" htmlFor="qd-title">Title</label>
                <input
                  id="qd-title"
                  type="text"
                  className="input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  autoFocus={autoFocusFields}
                  maxLength={200}
                />
              </div>
              <div>
                <label className="label" htmlFor="qd-desc">Description</label>
                <textarea
                  id="qd-desc"
                  className="input resize-none w-full"
                  rows={4}
                  placeholder="Add more detail about what this quest means…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={1000}
                />
              </div>

              {scheduleEditable ? (
                <>
                  <div>
                    <label className="label">Due Date &amp; Time</label>
                    <div className="flex gap-2">
                      <input type="date" aria-label="Due date" className="input flex-1" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                      <input type="time" aria-label="Due time" className="input w-32 sm:w-28" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="label">Difficulty</label>
                    <div className="grid grid-cols-3 gap-2">
                      {DIFF_KEYS.map((k) => {
                        const d = DIFF_STYLES[k];
                        const active = difficulty === k;
                        return (
                          <button
                            key={k}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setDifficulty(k)}
                            className="min-h-[44px] rounded-lg text-xs font-semibold transition-all"
                            style={{
                              background: active ? d.bg : 'rgba(13,31,56,0.8)',
                              border: `1px solid ${active ? d.border : 'rgba(59,130,246,0.12)'}`,
                              color: active ? d.color : '#94a3b8',
                            }}
                          >
                            {d.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[11px] mt-1.5" style={{ color: '#94A3B8' }}>Changing difficulty updates the XP reward.</p>
                  </div>
                  <div>
                    <label className="label" htmlFor="qd-penalty">Penalty if missed</label>
                    <div className="flex items-center gap-2">
                      <input
                        id="qd-penalty"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={999}
                        className="input w-24 text-center"
                        value={debtAmount}
                        onChange={(e) => setDebtAmount(e.target.value)}
                      />
                      <span className="text-xs" style={{ color: '#94a3b8' }}>pts per overdue day (max 7 days)</span>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-[11px] rounded-lg px-3 py-2 flex items-start gap-1.5" style={{ color: '#94A3B8', background: 'rgba(13,31,56,0.55)', border: '1px solid rgba(59,130,246,0.12)' }}>
                  <Icon name="lock" className="w-3.5 h-3.5 flex-shrink-0 mt-px" color="#94A3B8" />
                  Due date, difficulty and penalty can only change before the quest is due (or within {FREE_EDIT_MINUTES} min of creating it).
                </p>
              )}

              {error && (
                <p role="alert" className="text-xs text-red-400 px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  {error}
                </p>
              )}
            </form>
          ) : (
            <div className="p-5 sm:p-6 space-y-5">
              {/* Description */}
              <div>
                <p className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-2">Description</p>
                <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(13,31,56,0.55)', border: '1px solid rgba(59,130,246,0.12)' }}>
                  {quest.description && quest.description.trim() ? (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words" style={{ color: '#cbd5e1' }}>{quest.description}</p>
                  ) : (
                    <p className="text-sm italic" style={{ color: '#94A3B8' }}>
                      No description yet.{canEditText ? ' Tap “Edit” to add one.' : ''}
                    </p>
                  )}
                </div>
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
                  <MetaTile label="Penalty if missed" value={`${debtAmt} pts / day`} color="#fb923c" />
                </div>
              </div>

              {/* Delete cost */}
              {!quest.completed && (
                <div className="rounded-xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap" style={{ background: penaltyNow > 0 ? 'rgba(239,68,68,0.05)' : 'rgba(34,197,94,0.05)', border: `1px solid ${penaltyNow > 0 ? 'rgba(239,68,68,0.18)' : 'rgba(34,197,94,0.2)'}` }}>
                  <p className="text-xs" style={{ color: '#cbd5e1' }}>
                    {penaltyNow > 0
                      ? <>Deleting adds <span className="font-bold text-red-400">{penaltyNow} pts</span> of debt.</>
                      : <><span className="font-bold text-green-400">Free to delete</span> for {FREE_EDIT_MINUTES} min after creating ({freeLeft} min left).</>}
                  </p>
                  {onDelete && (
                    <button
                      type="button"
                      onClick={onDelete}
                      className="min-h-[44px] px-3 rounded-lg text-xs font-semibold sq-row-btn sq-row-btn-danger"
                    >
                      Delete quest
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sticky footer */}
        <div className="sheet-footer flex gap-3 px-5 sm:px-6 pt-3 flex-shrink-0" style={{ borderTop: '1px solid rgba(59,130,246,0.12)', background: '#080F20' }}>
          {editing ? (
            <>
              <button type="button" onClick={cancelEdit} className="btn-secondary flex-1 min-h-[44px]" disabled={saving}>Cancel</button>
              <button type="submit" form="quest-edit-form" className="btn-primary flex-1 min-h-[44px]" disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={onClose} className="btn-secondary flex-1 min-h-[44px]">Close</button>
              {canEditText && (
                <button type="button" onClick={startEdit} className="btn-primary flex-1 min-h-[44px]">
                  <Icon name="pencil" className="w-4 h-4" color="currentColor" />
                  Edit
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
