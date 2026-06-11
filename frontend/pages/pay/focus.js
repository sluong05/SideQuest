import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Icon } from '../../components/Icons';
import { usePayoff, PayoffShell, PayoffResult, formatClock } from '../../components/PayoffShell';
import { getTasks, completeTask } from '../../lib/api';

const COLOR = { main: '#34d399', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.35)', glow: 'rgba(16,185,129,0.2)' };
const DURATIONS = [10, 25, 45];
const PTS_PER_MIN = 1;

export default function FocusPayoff() {
  const payoff = usePayoff('focus');
  const { submitting, result, setResult, submitPoints } = payoff;
  const router = useRouter();

  const [durationMin, setDurationMin] = useState(25);
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [ended, setEnded] = useState(false);

  // Optional quest context (?quest=<id>) — e.g. from the dashboard's Daily Focus card
  const [quest, setQuest] = useState(null);
  const [questDone, setQuestDone] = useState(false);
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    const qid = router.query.quest;
    if (!qid || !payoff.user) return;
    getTasks()
      .then((r) => {
        const t = (r.data.tasks || []).find((task) => String(task.id) === String(qid));
        if (t && !t.completed) setQuest(t);
      })
      .catch(() => {});
  }, [router.query.quest, payoff.user]);

  async function handleCompleteQuest() {
    if (!quest || questDone || completing) return;
    setCompleting(true);
    try {
      await completeTask(quest.id);
      setQuestDone(true);
    } catch (err) {
      console.error(err);
    } finally {
      setCompleting(false);
    }
  }

  const totalSeconds = durationMin * 60;
  const elapsed = totalSeconds - secondsLeft;
  const earned = Math.floor(elapsed / 60) * PTS_PER_MIN;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          setRunning(false);
          setEnded(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  function pickDuration(min) {
    setDurationMin(min);
    setSecondsLeft(min * 60);
  }

  function reset() {
    setRunning(false);
    setStarted(false);
    setEnded(false);
    setSecondsLeft(durationMin * 60);
    setResult(null);
  }

  // Timer ring geometry
  const r = 84, c = 2 * Math.PI * r;
  const progress = started ? elapsed / totalSeconds : 0;

  return (
    <PayoffShell
      {...payoff}
      icon="target"
      color={COLOR}
      title="Focus Session"
      subtitle={`Deep work pays off debt — ${PTS_PER_MIN} pt per minute of focus.`}
    >
      {result ? (
        <PayoffResult result={result} onReset={reset} />
      ) : (
        <div className="card flex flex-col items-center py-8">

          {/* Quest context banner */}
          {quest && (
            <div
              className="flex items-center gap-2 mb-6 px-4 py-2 rounded-xl max-w-full"
              style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.28)' }}
            >
              <Icon name="target" className="w-3.5 h-3.5 flex-shrink-0" color="#34d399" />
              <span className="text-xs font-semibold truncate" style={{ color: '#94a3b8' }}>
                Focusing on: <span style={{ color: '#f8fafc' }}>{quest.title}</span>
              </span>
              <span className="text-[10px] flex-shrink-0" style={{ color: '#475569' }}>
                +{quest.xpReward ?? 50} XP if completed
              </span>
            </div>
          )}

          {/* Duration picker (before starting) */}
          {!started && (
            <div className="flex items-center gap-2 mb-7">
              {DURATIONS.map((min) => (
                <button
                  key={min}
                  onClick={() => pickDuration(min)}
                  className="px-4 py-1.5 text-xs font-bold rounded-lg transition-all duration-150"
                  style={durationMin === min
                    ? { background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.45)', color: '#34d399', boxShadow: '0 0 10px rgba(16,185,129,0.2)' }
                    : { background: 'rgba(8,21,37,0.7)', border: '1px solid rgba(59,130,246,0.12)', color: '#64748b' }
                  }
                >
                  {min} min · +{min * PTS_PER_MIN} pts
                </button>
              ))}
            </div>
          )}

          {/* Timer ring */}
          <div className="relative mb-7">
            <svg width="200" height="200" viewBox="0 0 200 200">
              <circle cx="100" cy="100" r={r} fill="none" stroke="rgba(16,185,129,0.1)" strokeWidth={8} />
              <circle
                cx="100" cy="100" r={r}
                fill="none"
                stroke="#10b981"
                strokeWidth={8}
                strokeDasharray={c}
                strokeDashoffset={c * (1 - progress)}
                strokeLinecap="round"
                transform="rotate(-90 100 100)"
                style={{ filter: 'drop-shadow(0 0 10px rgba(16,185,129,0.55))', transition: 'stroke-dashoffset 0.5s linear' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-bold tabular-nums" style={{ color: '#f8fafc' }}>{formatClock(secondsLeft)}</span>
              <span className="text-xs mt-1 font-semibold" style={{ color: started ? '#34d399' : '#475569' }}>
                {started ? `+${earned} pts earned` : 'ready to focus'}
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
                  style={{ background: 'rgba(16,185,129,0.85)', border: '1px solid rgba(16,185,129,0.5)', boxShadow: '0 0 14px rgba(16,185,129,0.35)' }}
                >
                  <Icon name="play" className="w-4 h-4" color="#fff" />
                  Start Focusing
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setRunning((v) => !v)}
                    className="flex items-center gap-2 text-sm font-bold text-white px-6 py-2.5 rounded-xl transition-all duration-150"
                    style={{ background: 'rgba(16,185,129,0.85)', border: '1px solid rgba(16,185,129,0.5)', boxShadow: '0 0 14px rgba(16,185,129,0.35)' }}
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
                    End Session
                  </button>
                </>
              )}
            </div>
          ) : earned >= 1 ? (
            <div className="flex flex-col items-center">
              <p className="text-sm mb-4" style={{ color: '#94a3b8' }}>
                You focused for <span className="font-bold" style={{ color: '#34d399' }}>{Math.floor(elapsed / 60)} min</span> — claim your payoff.
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
              <p className="text-sm mb-4" style={{ color: '#94a3b8' }}>Focus for at least 1 minute to earn points.</p>
              <button onClick={reset} className="btn-secondary text-sm py-2 px-5">Start Over</button>
            </div>
          )}

          {!ended && (
            <p className="text-[11px] mt-6" style={{ color: '#334155' }}>
              Stay on this page while the timer runs. Pausing doesn't lose progress.
            </p>
          )}
        </div>
      )}

      {/* Quest completion offer — once the session is over */}
      {quest && (ended || (result && !result.error)) && (
        <div className="card mt-4 flex items-center justify-between gap-3 flex-wrap">
          {questDone ? (
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.4)' }}
              >
                <Icon name="check" className="w-4 h-4" color="#4ade80" strokeWidth={2.2} />
              </div>
              <p className="text-sm font-bold" style={{ color: '#4ade80' }}>
                "{quest.title}" completed — +{quest.xpReward ?? 50} XP earned!
              </p>
            </div>
          ) : (
            <>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold truncate" style={{ color: '#f8fafc' }}>
                  Did you finish "{quest.title}"?
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: '#64748b' }}>
                  Mark it complete to earn +{quest.xpReward ?? 50} XP and avoid debt.
                </p>
              </div>
              <button
                onClick={handleCompleteQuest}
                disabled={completing}
                className="text-xs font-bold text-white px-5 py-2 rounded-lg flex-shrink-0 transition-all duration-150 disabled:opacity-60"
                style={{ background: 'rgba(34,197,94,0.8)', border: '1px solid rgba(34,197,94,0.5)', boxShadow: '0 0 12px rgba(34,197,94,0.25)' }}
              >
                {completing ? 'Saving…' : 'Complete Quest'}
              </button>
            </>
          )}
        </div>
      )}
    </PayoffShell>
  );
}
