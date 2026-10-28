import { useState } from 'react';
import { usePayoff, PayoffShell, PayoffResult, SESSION_CAPS, CUSTOM_DAILY_CAP } from '../../components/PayoffShell';

const COLOR = { main: '#c084fc', bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.35)', glow: 'rgba(168,85,247,0.2)' };
const MAX_PTS = SESSION_CAPS.custom; // server: ≤25 pts per session, ≤100 pts per day

const SUGGESTIONS = [
  { label: 'Read 20 pages',        pts: 10 },
  { label: 'Meditate for 10 min',  pts: 8 },
  { label: '30-minute walk',       pts: 12 },
  { label: 'Journal one page',     pts: 6 },
  { label: 'No phone for 1 hour',  pts: 10 },
  { label: 'Practice an instrument', pts: 10 },
];

export default function CustomPayoff() {
  const payoff = usePayoff('custom', { autoStart: true });
  const { submitting, result, setResult, submitPoints } = payoff;

  const [label, setLabel] = useState('');
  const [pts, setPts] = useState(10);

  function reset() {
    setLabel('');
    setPts(10);
    setResult(null);
  }

  const canSubmit = label.trim().length > 0 && pts >= 1;

  return (
    <PayoffShell
      {...payoff}
      icon="pencil"
      color={COLOR}
      title="Custom Payoff"
      subtitle={`Did something productive? Name it, value it, pay off debt. Up to ${MAX_PTS} pts per session, ${CUSTOM_DAILY_CAP} pts per day.`}
    >
      {result ? (
        <PayoffResult result={result} onReset={reset} />
      ) : (
        <div className="card">
          {/* What did you do */}
          <label className="label" htmlFor="custom-label">What did you do?</label>
          <input
            id="custom-label"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Finished my essay outline"
            maxLength={80}
            className="input mb-5"
          />

          {/* Suggestions */}
          <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: '#94A3B8' }}>Quick picks</p>
          <div className="flex flex-wrap gap-2 mb-6">
            {SUGGESTIONS.map((s) => {
              const active = label === s.label;
              return (
                <button
                  key={s.label}
                  onClick={() => { setLabel(s.label); setPts(s.pts); }}
                  aria-pressed={active}
                  className="text-xs font-semibold px-3 min-h-[40px] rounded-full transition-all duration-150"
                  style={active
                    ? { background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.5)', color: '#c084fc' }
                    : { background: 'rgba(8,21,37,0.7)', border: '1px solid rgba(59,130,246,0.12)', color: '#94A3B8' }
                  }
                >
                  {s.label} <span style={{ color: '#c084fc' }}>+{s.pts}</span>
                </button>
              );
            })}
          </div>

          {/* Points slider */}
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0" htmlFor="custom-pts">How much is it worth?</label>
            <span className="text-lg font-bold tabular-nums" style={{ color: '#c084fc' }}>+{pts} pts</span>
          </div>
          <input
            id="custom-pts"
            type="range"
            min={1}
            max={MAX_PTS}
            value={pts}
            onChange={(e) => setPts(Number(e.target.value))}
            className="w-full mb-1 h-11"
            style={{ accentColor: '#a855f7' }}
          />
          <div className="flex items-center justify-between text-[11px] mb-1" style={{ color: '#94A3B8' }}>
            <span>1 pt · small win</span>
            <span>{MAX_PTS} pts · big effort</span>
          </div>
          <p className="text-[11px] mb-6" style={{ color: '#94A3B8' }}>
            Be honest with yourself — roughly 1 pt per 2–3 minutes of real effort.
            Custom payoffs are capped at {MAX_PTS} pts per session and {CUSTOM_DAILY_CAP} pts per day.
          </p>

          <button
            onClick={() => submitPoints(pts)}
            disabled={!canSubmit || submitting}
            className="w-full text-sm font-bold text-white min-h-[48px] rounded-xl transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'rgba(37,99,235,0.9)', border: '1px solid rgba(59,130,246,0.55)', boxShadow: canSubmit ? '0 0 14px rgba(37,99,235,0.35)' : 'none' }}
          >
            {submitting ? 'Logging…' : canSubmit ? `Complete — pay off ${pts} pts` : 'Describe what you did first'}
          </button>
        </div>
      )}
    </PayoffShell>
  );
}
