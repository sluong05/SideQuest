import { useState } from 'react';
import confetti from 'canvas-confetti';
import { completeTask, uncompleteTask, deleteTask } from '../lib/api';

const CATEGORY_ICONS = {
  fitness: '💪', learning: '📚', focus: '🎯',
  productivity: '⚡', wellness: '🧘', chores: '🏠', other: '✦',
};

const CATEGORY_COLORS = {
  fitness: 'rgba(59,130,246,0.15)',
  learning: 'rgba(168,85,247,0.15)',
  focus: 'rgba(16,185,129,0.15)',
  productivity: 'rgba(234,179,8,0.15)',
  wellness: 'rgba(34,197,94,0.15)',
  chores: 'rgba(251,146,60,0.15)',
  other: 'rgba(59,130,246,0.1)',
};

const DIFFICULTY_STYLES = {
  easy:   { label: 'Easy',   color: '#34d399',  bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.3)' },
  medium: { label: 'Medium', color: '#fbbf24',  bg: 'rgba(234,179,8,0.12)',   border: 'rgba(234,179,8,0.3)' },
  hard:   { label: 'Hard',   color: '#f87171',  bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)' },
};

const DEBT_TYPE_UNITS = {
  pushups: 'reps', study: 'min', walk: 'min', clean: 'min', read: 'pages', custom: '',
};

function formatDueDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const taskDay = new Date(date); taskDay.setHours(0, 0, 0, 0);
  const dayDiff = Math.round((taskDay - today) / (1000 * 60 * 60 * 24));
  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  if (date < now) {
    if (dayDiff === 0) return { label: `Due today at ${timeStr}`, overdue: true };
    const days = Math.abs(dayDiff);
    return { label: `${days}d overdue · ${timeStr}`, overdue: true };
  }
  if (dayDiff === 0) return { label: `Due today at ${timeStr}`, overdue: false };
  if (dayDiff === 1) return { label: `Tomorrow at ${timeStr}`, overdue: false };
  return { label: `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${timeStr}`, overdue: false };
}

function QuestItem({ task, onComplete, onUncomplete, onDelete }) {
  const [completing, setCompleting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const dueInfo = formatDueDate(task.dueDate);

  const categoryIcon = CATEGORY_ICONS[task.category] ?? '✦';
  const categoryBg = CATEGORY_COLORS[task.category] ?? 'rgba(59,130,246,0.1)';
  const diffStyle = DIFFICULTY_STYLES[task.difficulty];
  const xpReward = task.xpReward ?? (task.difficulty === 'hard' ? 100 : task.difficulty === 'easy' ? 25 : 50);
  const debtUnit = DEBT_TYPE_UNITS[task.debtType] ?? '';
  const debtAmount = task.debtAmount ?? 5;
  const hasDebt = task.pushupDebt && !task.pushupDebt.resolved;

  async function handleComplete() {
    setCompleting(true);
    try {
      if (task.completed) await onUncomplete(task.id);
      else await onComplete(task.id);
    } finally { setCompleting(false); }
  }

  async function confirmDelete() {
    setShowConfirm(false);
    setDeleting(true);
    try { await onDelete(task.id); }
    finally { setDeleting(false); }
  }

  const rowBg = task.completed
    ? { background: 'rgba(13,31,56,0.3)', borderColor: 'rgba(59,130,246,0.08)' }
    : dueInfo.overdue
    ? { background: 'rgba(239,68,68,0.04)', borderColor: 'rgba(239,68,68,0.25)' }
    : { background: 'rgba(13,31,56,0.5)', borderColor: 'rgba(59,130,246,0.12)' };

  return (
    <>
      <div
        className={`rounded-xl border transition-all ${task.completed ? 'opacity-60' : ''}`}
        style={rowBg}
      >
        <div className="flex items-center gap-3 px-3 py-3 sm:px-4">
          {/* Category icon box */}
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-base"
            style={{ background: categoryBg }}
          >
            {categoryIcon}
          </div>

          {/* Title + meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={`text-sm font-medium leading-snug ${task.completed ? 'line-through text-navy-400' : 'text-navy-50'}`}>
                {task.title}
              </p>
              {diffStyle && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: diffStyle.bg, border: `1px solid ${diffStyle.border}`, color: diffStyle.color }}>
                  {diffStyle.label}
                </span>
              )}
              {task.completed && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#34d399' }}>
                  Completed
                </span>
              )}
              {dueInfo.overdue && !task.completed && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
                  Overdue
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className={`text-xs ${dueInfo.overdue && !task.completed ? 'text-red-400' : 'text-navy-400'}`}>
                {dueInfo.label}
              </span>
              {task.recurrence !== 'none' && (
                <span className="text-[10px] text-blue-400">↻ {task.recurrence}</span>
              )}
              {hasDebt && (
                <span className="text-[10px] font-medium text-red-400">
                  {Math.ceil(task.pushupDebt.pushupsOwed)} owed
                </span>
              )}
              {!task.completed && (
                <span className="text-[10px] text-navy-500 hidden sm:inline">
                  DEBT IF SKIPPED: <span className="text-orange-400/80">+{debtAmount} {debtUnit}</span>
                </span>
              )}
            </div>
          </div>

          {/* XP */}
          {!task.completed && (
            <span className="text-xs font-bold text-yellow-400 flex-shrink-0 hidden md:block">
              +{xpReward} XP
            </span>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {task.completed ? (
              <button
                onClick={handleComplete}
                disabled={completing}
                className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors text-navy-300 hover:text-navy-100"
                style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)' }}
              >
                Undo
              </button>
            ) : (
              <>
                <button
                  onClick={() => setShowConfirm(true)}
                  disabled={deleting}
                  className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all hidden sm:block"
                  style={{ background: 'rgba(13,31,56,0.8)', border: '1px solid rgba(59,130,246,0.15)', color: '#94a3b8' }}
                >
                  Skip Quest
                </button>
                <button
                  onClick={handleComplete}
                  disabled={completing}
                  className="text-xs px-2.5 py-1.5 rounded-lg font-semibold text-white transition-all"
                  style={{ background: completing ? 'rgba(37,99,235,0.5)' : '#2563eb', border: '1px solid rgba(59,130,246,0.5)', boxShadow: '0 0 10px rgba(59,130,246,0.2)' }}
                >
                  {completing ? '…' : 'Complete'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-sm text-center">
            <p className="text-4xl mb-4">⚠️</p>
            <h2 className="text-lg font-bold text-navy-50 mb-2">Skip This Quest?</h2>
            <p className="text-navy-200 text-sm mb-6">
              Skipping adds <span className="text-red-400 font-bold">5 to your debt</span>.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirm(false)} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={confirmDelete}
                className="flex-1 py-2 px-4 rounded-lg font-semibold text-sm text-white transition-colors"
                style={{ background: 'rgba(239,68,68,0.8)', border: '1px solid rgba(239,68,68,0.5)' }}
              >
                Skip anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function TaskList({ tasks, onTaskUpdated, onAddTask }) {
  async function handleComplete(taskId) {
    try {
      await completeTask(taskId);
      confetti({ particleCount: 80, spread: 55, origin: { y: 0.6 }, colors: ['#3b82f6', '#60a5fa', '#34d399', '#fbbf24', '#ffffff'], scalar: 0.9 });
      onTaskUpdated();
    } catch (err) { console.error(err); }
  }

  async function handleUncomplete(taskId) {
    try { await uncompleteTask(taskId); onTaskUpdated(); }
    catch (err) { console.error(err); }
  }

  async function handleDelete(taskId) {
    try { await deleteTask(taskId); onTaskUpdated(); }
    catch (err) { console.error(err); }
  }

  if (tasks.length === 0) {
    return (
      <div className="py-6">
        <p className="text-center text-navy-100 font-semibold text-base mb-5">Here's how SideQuest works</p>
        <div className="space-y-3 mb-7">
          {[
            { icon: '🎯', title: 'Create a quest', desc: 'Set a title, deadline, category, and difficulty. Make it a real commitment.' },
            { icon: '✅', title: 'Complete it on time', desc: 'Check it off before the due date. Earn XP, build your streak, climb the leaderboard.' },
            { icon: '⚔️', title: 'Miss it? Pay the debt', desc: 'Every missed day costs you. Pay it off with pushups, study sessions, walks — whatever fits.' },
          ].map(({ icon, title, desc }) => (
            <div key={title} className="flex items-start gap-3 rounded-xl px-4 py-3" style={{ background: 'rgba(13,31,56,0.6)' }}>
              <span className="text-xl flex-shrink-0 mt-0.5">{icon}</span>
              <div>
                <p className="text-sm font-semibold text-navy-50">{title}</p>
                <p className="text-xs text-navy-300 mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
        {onAddTask && (
          <div className="text-center">
            <button onClick={onAddTask} className="btn-primary py-2.5 px-8 text-sm">+ Create your first quest</button>
          </div>
        )}
      </div>
    );
  }

  const now = new Date();
  const completed = tasks.filter((t) => t.completed);
  const incomplete = tasks.filter((t) => !t.completed).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  const overdue = incomplete.filter((t) => new Date(t.dueDate) < now);
  const upcoming = incomplete.filter((t) => new Date(t.dueDate) >= now);

  return (
    <div className="space-y-2">
      {overdue.map((task) => (
        <QuestItem key={task.id} task={task} onComplete={handleComplete} onUncomplete={handleUncomplete} onDelete={handleDelete} />
      ))}
      {upcoming.map((task) => (
        <QuestItem key={task.id} task={task} onComplete={handleComplete} onUncomplete={handleUncomplete} onDelete={handleDelete} />
      ))}
      {completed.length > 0 && incomplete.length > 0 && (
        <div style={{ borderTop: '1px solid rgba(59,130,246,0.08)' }} className="my-2" />
      )}
      {completed.map((task) => (
        <QuestItem key={task.id} task={task} onComplete={handleComplete} onUncomplete={handleUncomplete} onDelete={handleDelete} />
      ))}
    </div>
  );
}
