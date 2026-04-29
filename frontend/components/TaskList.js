import { useState } from 'react';
import { completeTask, uncompleteTask, deleteTask } from '../lib/api';

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
    return { label: `${days} ${days === 1 ? 'day' : 'days'} overdue · ${timeStr}`, overdue: true };
  }
  if (dayDiff === 0) return { label: `Due today at ${timeStr}`, overdue: false };
  if (dayDiff === 1) return { label: `Due tomorrow at ${timeStr}`, overdue: false };
  return {
    label: `Due ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${timeStr}`,
    overdue: false,
  };
}

const colorStyles = {
  red:     'border-red-700/50 bg-red-900/10',
  yellow:  'border-yellow-600/50 bg-yellow-900/10',
  green:   'border-green-700/50 bg-green-900/10',
  default: 'border-navy-400 bg-navy-600/60 hover:border-navy-300',
};

function TaskItem({ task, onComplete, onUncomplete, onDelete, color = 'default' }) {
  const [completing, setCompleting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const dueInfo = formatDueDate(task.dueDate);

  async function handleComplete() {
    setCompleting(true);
    try {
      if (task.completed) {
        await onUncomplete(task.id);
      } else {
        await onComplete(task.id);
      }
    } finally {
      setCompleting(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await onDelete(task.id);
    } finally {
      setDeleting(false);
    }
  }

  const hasDebt = task.pushupDebt && !task.pushupDebt.resolved;

  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-xl border transition-all ${
        task.completed ? 'border-navy-400 bg-navy-600/40 opacity-60' : colorStyles[color]
      }`}
    >
      {/* Checkbox */}
      <button
        onClick={handleComplete}
        disabled={completing}
        title={task.completed ? 'Mark incomplete' : undefined}
        className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
          task.completed
            ? 'bg-green-500 border-green-500 hover:bg-red-500 hover:border-red-500'
            : 'border-navy-300 hover:border-amber-400'
        }`}
      >
        {task.completed && (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
        {completing && <span className="w-2.5 h-2.5 border border-navy-200 rounded-full animate-spin border-t-transparent" />}
      </button>

      {/* Task content */}
      <div className="flex-1 min-w-0">
        <p className={`font-medium text-sm ${task.completed ? 'line-through text-navy-300' : 'text-navy-50'}`}>
          {task.title}
        </p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className={`text-xs ${dueInfo.overdue && !task.completed ? 'text-red-400 font-medium' : 'text-navy-200'}`}>
            {dueInfo.label}
          </span>
          {task.recurrence !== 'none' && (
            <span className="text-xs bg-navy-700 text-navy-200 px-2 py-0.5 rounded-full">
              {task.recurrence === 'daily' ? '🔄 Daily' : '📅 Weekly'}
            </span>
          )}
          {hasDebt && (
            <span className="text-xs bg-red-900/40 text-red-400 px-2 py-0.5 rounded-full font-medium">
              {Math.ceil(task.pushupDebt.pushupsOwed)} pushups owed
            </span>
          )}
        </div>
      </div>

      {/* Delete */}
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="text-navy-300 hover:text-red-400 transition-colors p-1 flex-shrink-0"
        title="Delete task"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
}

export default function TaskList({ tasks, onTaskUpdated }) {
  async function handleComplete(taskId) {
    try {
      await completeTask(taskId);
      onTaskUpdated();
    } catch (err) {
      console.error(err);
    }
  }

  async function handleUncomplete(taskId) {
    try {
      await uncompleteTask(taskId);
      onTaskUpdated();
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDelete(taskId) {
    try {
      await deleteTask(taskId);
      onTaskUpdated();
    } catch (err) {
      console.error(err);
    }
  }

  if (tasks.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-4xl mb-3">✅</p>
        <p className="text-navy-100 font-medium">No tasks yet</p>
        <p className="text-navy-300 text-sm mt-1">Add a task to get started</p>
      </div>
    );
  }

  const now = new Date();

  const completed = tasks.filter((t) => t.completed);
  const incomplete = tasks
    .filter((t) => !t.completed)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  const overdue  = incomplete.filter((t) => new Date(t.dueDate) < now);
  const upcoming = incomplete.filter((t) => new Date(t.dueDate) >= now);

  const half    = Math.ceil(upcoming.length / 2);
  const soonest = upcoming.slice(0, half);
  const later   = upcoming.slice(half);

  return (
    <div className="space-y-2">
      {overdue.map((task) => (
        <TaskItem key={task.id} task={task} onComplete={handleComplete} onUncomplete={handleUncomplete} onDelete={handleDelete} color="red" />
      ))}
      {soonest.map((task) => (
        <TaskItem key={task.id} task={task} onComplete={handleComplete} onUncomplete={handleUncomplete} onDelete={handleDelete} color="yellow" />
      ))}
      {later.map((task) => (
        <TaskItem key={task.id} task={task} onComplete={handleComplete} onUncomplete={handleUncomplete} onDelete={handleDelete} color="green" />
      ))}
      {completed.length > 0 && incomplete.length > 0 && (
        <div className="border-t border-navy-400 my-3" />
      )}
      {completed.map((task) => (
        <TaskItem key={task.id} task={task} onComplete={handleComplete} onUncomplete={handleUncomplete} onDelete={handleDelete} color="default" />
      ))}
    </div>
  );
}
