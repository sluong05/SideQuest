import { useState } from 'react';
import { Icon } from '../../components/Icons';
import { usePayoff, PayoffShell, PayoffResult } from '../../components/PayoffShell';

const COLOR = { main: '#fb923c', bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.35)', glow: 'rgba(249,115,22,0.2)' };

const PRESET_CHORES = [
  { id: 'bed',     label: 'Make your bed',            pts: 3 },
  { id: 'trash',   label: 'Take out the trash',       pts: 3 },
  { id: 'dishes',  label: 'Wash the dishes',          pts: 5 },
  { id: 'desk',    label: 'Tidy your desk',           pts: 5 },
  { id: 'plants',  label: 'Water the plants',         pts: 2 },
  { id: 'vacuum',  label: 'Vacuum or sweep a room',   pts: 8 },
  { id: 'laundry', label: 'Do a load of laundry',     pts: 8 },
  { id: 'meal',    label: 'Cook a proper meal',       pts: 8 },
  { id: 'bathroom',label: 'Clean the bathroom',       pts: 10 },
  { id: 'deepclean', label: 'Deep-clean your room',   pts: 12 },
];

export default function ChoresPayoff() {
  const payoff = usePayoff('chores');
  const { submitting, result, setResult, submitPoints } = payoff;

  const [chores, setChores] = useState(PRESET_CHORES);
  const [checked, setChecked] = useState(new Set());
  const [customLabel, setCustomLabel] = useState('');
  const [customPts, setCustomPts] = useState(5);

  const total = chores.filter((c) => checked.has(c.id)).reduce((s, c) => s + c.pts, 0);

  function toggle(id) {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function addCustom() {
    const label = customLabel.trim();
    if (!label) return;
    const id = `custom-${Date.now()}`;
    setChores((prev) => [...prev, { id, label, pts: customPts, custom: true }]);
    setChecked((prev) => new Set(prev).add(id));
    setCustomLabel('');
  }

  function reset() {
    setChecked(new Set());
    setResult(null);
  }

  return (
    <PayoffShell
      {...payoff}
      icon="home"
      color={COLOR}
      title="Chore Payoff"
      subtitle="Check off what you've actually done — honor system."
    >
      {result ? (
        <PayoffResult result={result} onReset={reset} />
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-4">
            {chores.map((chore) => {
              const isChecked = checked.has(chore.id);
              return (
                <button
                  key={chore.id}
                  onClick={() => toggle(chore.id)}
                  className="flex items-center gap-3 px-3.5 py-3 rounded-xl text-left transition-all duration-150"
                  style={isChecked
                    ? { background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.4)', boxShadow: '0 0 10px rgba(249,115,22,0.12)' }
                    : { background: 'rgba(8,21,37,0.65)', border: '1px solid rgba(59,130,246,0.1)' }
                  }
                >
                  <span
                    className="w-[18px] h-[18px] rounded-md flex items-center justify-center flex-shrink-0 transition-all duration-150"
                    style={{
                      border: `1.5px solid ${isChecked ? 'rgba(249,115,22,0.8)' : 'rgba(71,85,105,0.55)'}`,
                      background: isChecked ? 'rgba(249,115,22,0.25)' : 'transparent',
                    }}
                  >
                    {isChecked && <Icon name="check" className="w-2.5 h-2.5" color="#fb923c" strokeWidth={3.2} />}
                  </span>
                  <span className="flex-1 text-sm font-semibold" style={{ color: isChecked ? '#f8fafc' : '#94a3b8' }}>
                    {chore.label}
                  </span>
                  <span className="text-xs font-bold tabular-nums flex-shrink-0" style={{ color: '#fb923c' }}>
                    +{chore.pts}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Add custom chore */}
          <div className="flex items-center gap-2 px-4 pb-4">
            <input
              type="text"
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCustom()}
              placeholder="Add your own chore…"
              className="input flex-1 text-sm py-2"
            />
            <select
              value={customPts}
              onChange={(e) => setCustomPts(Number(e.target.value))}
              className="text-xs font-semibold rounded-lg px-2 py-2.5 focus:outline-none cursor-pointer flex-shrink-0"
              style={{ background: 'rgba(8,21,37,0.95)', border: '1px solid rgba(59,130,246,0.18)', color: '#94a3b8' }}
            >
              {[2, 3, 5, 8, 10, 12, 15].map((p) => <option key={p} value={p}>+{p} pts</option>)}
            </select>
            <button
              onClick={addCustom}
              disabled={!customLabel.trim()}
              className="text-xs font-bold px-4 py-2.5 rounded-lg flex-shrink-0 transition-all duration-150 disabled:opacity-40"
              style={{ background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.35)', color: '#fb923c' }}
            >
              Add
            </button>
          </div>

          {/* Total bar */}
          <div
            className="flex items-center justify-between gap-3 px-4 py-3.5"
            style={{ borderTop: '1px solid rgba(59,130,246,0.1)', background: 'rgba(8,15,32,0.6)' }}
          >
            <div className="leading-tight">
              <p className="text-sm font-bold" style={{ color: total > 0 ? '#f8fafc' : '#475569' }}>
                {checked.size} chore{checked.size !== 1 ? 's' : ''} · <span style={{ color: '#fb923c' }}>+{total} pts</span>
              </p>
              <p className="text-[11px]" style={{ color: '#475569' }}>Only log chores you've genuinely finished.</p>
            </div>
            <button
              onClick={() => submitPoints(total)}
              disabled={total < 1 || submitting}
              className="text-sm font-bold text-white px-6 py-2.5 rounded-xl transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'rgba(37,99,235,0.9)', border: '1px solid rgba(59,130,246,0.55)', boxShadow: total > 0 ? '0 0 14px rgba(37,99,235,0.35)' : 'none' }}
            >
              {submitting ? 'Logging…' : `Pay off ${total} pts`}
            </button>
          </div>
        </div>
      )}
    </PayoffShell>
  );
}
