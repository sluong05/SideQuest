import { useState } from 'react';
import { createTask } from '../lib/api';

export default function AddTaskModal({ onClose, onTaskAdded }) {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState(todayString());
  const [recurrence, setRecurrence] = useState('none');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function todayString() {
    return new Date().toISOString().split('T')[0];
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Task title is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Convert YYYY-MM-DD to local end-of-day so the deadline respects the user's timezone
      const [year, month, day] = dueDate.split('-').map(Number);
      const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);
      const res = await createTask(title.trim(), endOfDay.toISOString(), recurrence);
      onTaskAdded(res.data.task);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create task');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-navy-50">New Task</h2>
          <button onClick={onClose} className="btn-ghost p-1 text-lg leading-none">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Task Title</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. Finish project proposal"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              maxLength={200}
            />
          </div>

          <div>
            <label className="label">Due Date</label>
            <input
              type="date"
              className="input"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
            <p className="text-xs text-navy-300 mt-1">
              Incomplete tasks past this date generate pushup debt.
            </p>
          </div>

          <div>
            <label className="label">Recurrence</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'none',   label: 'None' },
                { value: 'daily',  label: '🔄 Daily' },
                { value: 'weekly', label: '📅 Weekly' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRecurrence(opt.value)}
                  className={`py-2 rounded-lg border text-sm font-medium transition-colors ${
                    recurrence === opt.value
                      ? 'bg-amber-500 border-amber-500 text-white'
                      : 'border-navy-400 text-navy-200 hover:border-navy-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {recurrence !== 'none' && (
              <p className="text-xs text-navy-300 mt-1">
                Task resets automatically each {recurrence === 'daily' ? 'day' : 'week'} after completion.
              </p>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1"
              disabled={loading}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1" disabled={loading}>
              {loading ? 'Adding...' : 'Add Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
