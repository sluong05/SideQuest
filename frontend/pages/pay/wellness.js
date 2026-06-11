import { useState, useEffect } from 'react';
import { Icon } from '../../components/Icons';
import { usePayoff, PayoffShell, PayoffResult, formatClock } from '../../components/PayoffShell';

const COLOR = { main: '#4ade80', bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.35)', glow: 'rgba(34,197,94,0.2)' };
const PTS_PER_MIN = 1;

const MODES = [
  {
    id: 'breathe', label: 'Breathe', icon: 'wind',
    tips: ['Inhale through your nose for 4 seconds', 'Hold for 4 seconds', 'Exhale slowly for 6 seconds', 'Let your shoulders drop'],
  },
  {
    id: 'stretch', label: 'Stretch', icon: 'star',
    tips: ['Neck rolls — slow circles, both directions', 'Reach overhead and hold 20s', 'Touch your toes, knees soft', 'Open your chest, hands behind back'],
  },
  {
    id: 'walk', label: 'Walk', icon: 'flame',
    tips: ['Leave your phone in your pocket', 'Keep a brisk, steady pace', 'Breathe through your nose', 'Notice five things around you'],
  },
];

export default function WellnessPayoff() {
  const payoff = usePayoff('wellness');
  const { submitting, result, setResult, submitPoints } = payoff;

  const [mode, setMode] = useState(MODES[0]);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [ended, setEnded] = useState(false);

  const earned = Math.floor(elapsed / 60) * PTS_PER_MIN;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  function reset() {
    setRunning(false);
    setStarted(false);
    setEnded(false);
    setElapsed(0);
    setResult(null);
  }

  // 14s breathing loop: 4s in, 4s hold, 6s out
  const phase = elapsed % 14;
  const breathText = phase < 4 ? 'Breathe in…' : phase < 8 ? 'Hold…' : 'Breathe out…';

  return (
    <PayoffShell
      {...payoff}
      icon="heart"
      color={COLOR}
      title="Wellness Session"
      subtitle={`Breathe, stretch, or walk it off — ${PTS_PER_MIN} pt per minute.`}
    >
      {result ? (
        <PayoffResult result={result} onReset={reset} />
      ) : (
        <div className="card flex flex-col items-center py-8">

          {/* Mode picker */}
          <div className="flex items-center gap-2 mb-7">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => !started && setMode(m)}
                disabled={started}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-lg transition-all duration-150 disabled:cursor-not-allowed"
                style={mode.id === m.id
                  ? { background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.45)', color: '#4ade80', boxShadow: '0 0 10px rgba(34,197,94,0.2)' }
                  : { background: 'rgba(8,21,37,0.7)', border: '1px solid rgba(59,130,246,0.12)', color: '#64748b', opacity: started ? 0.5 : 1 }
                }
              >
                <Icon name={m.icon} className="w-3.5 h-3.5" color={mode.id === m.id ? '#4ade80' : '#64748b'} />
                {m.label}
              </button>
            ))}
          </div>

          {/* Breathing circle / timer */}
          <div className="relative mb-7 flex items-center justify-center" style={{ width: 200, height: 200 }}>
            <div
              className="absolute rounded-full"
              style={{
                width: 150,
                height: 150,
                background: 'radial-gradient(circle, rgba(34,197,94,0.22) 0%, rgba(34,197,94,0.05) 70%)',
                border: '1px solid rgba(34,197,94,0.35)',
                boxShadow: '0 0 30px rgba(34,197,94,0.25)',
                animation: mode.id === 'breathe' ? 'sq-breathe 14s ease-in-out infinite' : 'none',
                animationPlayState: running ? 'running' : 'paused',
              }}
            />
            <div className="relative flex flex-col items-center">
              <span className="text-4xl font-bold tabular-nums" style={{ color: '#f8fafc' }}>{formatClock(elapsed)}</span>
              <span className="text-xs mt-1 font-semibold" style={{ color: started ? '#4ade80' : '#475569' }}>
                {!started ? 'ready when you are' : mode.id === 'breathe' && running ? breathText : `+${earned} pts earned`}
              </span>
            </div>
          </div>

          {/* Controls */}
          {!ended ? (
            <div className="flex items-center gap-3">
              {!started ? (
                <button
                  onClick={() => { setStarted(true); setRunning(true); }}
                  className="flex items-center gap-2 text-sm font-bold text-white px-7 py-2.5 rounded-xl transition-all duration-150"
                  style={{ background: 'rgba(34,197,94,0.85)', border: '1px solid rgba(34,197,94,0.5)', boxShadow: '0 0 14px rgba(34,197,94,0.35)' }}
                >
                  <Icon name="play" className="w-4 h-4" color="#fff" />
                  Start {mode.label}
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setRunning((v) => !v)}
                    className="flex items-center gap-2 text-sm font-bold text-white px-6 py-2.5 rounded-xl transition-all duration-150"
                    style={{ background: 'rgba(34,197,94,0.85)', border: '1px solid rgba(34,197,94,0.5)', boxShadow: '0 0 14px rgba(34,197,94,0.35)' }}
                  >
                    <Icon name={running ? 'pause' : 'play'} className="w-4 h-4" color="#fff" />
                    {running ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    onClick={() => { setRunning(false); setEnded(true); }}
                    className="flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl transition-all duration-150"
                    style={{ background: 'rgba(8,21,37,0.8)', border: '1px solid rgba(59,130,246,0.15)', color: '#94a3b8' }}
                  >
                    <Icon name="stop" className="w-4 h-4" color="#94a3b8" />
                    Finish
                  </button>
                </>
              )}
            </div>
          ) : earned >= 1 ? (
            <div className="flex flex-col items-center">
              <p className="text-sm mb-4" style={{ color: '#94a3b8' }}>
                {Math.floor(elapsed / 60)} min of {mode.label.toLowerCase()} — nicely done.
              </p>
              <button
                onClick={() => submitPoints(earned)}
                disabled={submitting}
                className="text-sm font-bold text-white px-7 py-2.5 rounded-xl transition-all duration-150 disabled:opacity-60"
                style={{ background: 'rgba(37,99,235,0.9)', border: '1px solid rgba(59,130,246,0.55)', boxShadow: '0 0 14px rgba(37,99,235,0.35)' }}
              >
                {submitting ? 'Logging…' : `Pay off ${earned} pts`}
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <p className="text-sm mb-4" style={{ color: '#94a3b8' }}>Keep going for at least 1 minute to earn points.</p>
              <button onClick={reset} className="btn-secondary text-sm py-2 px-5">Start Over</button>
            </div>
          )}

          {/* Tips */}
          {!ended && (
            <div className="w-full max-w-sm mt-7 rounded-xl p-4" style={{ background: 'rgba(8,21,37,0.6)', border: '1px solid rgba(34,197,94,0.12)' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#475569' }}>{mode.label} tips</p>
              <ul className="space-y-1.5">
                {mode.tips.map((tip) => (
                  <li key={tip} className="flex items-start gap-2 text-xs" style={{ color: '#64748b' }}>
                    <span className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0" style={{ background: '#4ade80' }} />
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <style jsx global>{`
        @keyframes sq-breathe {
          0%   { transform: scale(0.72); }
          28%  { transform: scale(1); }
          57%  { transform: scale(1); }
          100% { transform: scale(0.72); }
        }
      `}</style>
    </PayoffShell>
  );
}
