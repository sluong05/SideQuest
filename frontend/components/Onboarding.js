import { useState, useEffect } from 'react';
import { Icon } from './Icons';

export const ONBOARDED_KEY = 'sq_onboarded';

const CARDS = [
  {
    icon: 'target',
    color: '#60a5fa',
    title: 'Turn goals into quests',
    body: 'Give each quest a real deadline. Finish on time to earn XP, coins and keep your streak going.',
  },
  {
    icon: 'clock',
    color: '#fb923c',
    title: 'Miss it? You owe debt',
    body: 'A missed deadline adds a few points of debt for each day it stays overdue. No shame — it just means there is something to pay back.',
  },
  {
    icon: 'bolt',
    color: '#4ade80',
    title: 'Pay it back your way',
    body: 'Pushups are optional. Clear debt with camera-verified reps, focused work time, wellness breaks or chores — and earn XP while you do.',
  },
];

export function hasOnboarded() {
  if (typeof window === 'undefined') return true;
  try { return !!localStorage.getItem(ONBOARDED_KEY); } catch { return true; }
}

export function markOnboarded() {
  try { localStorage.setItem(ONBOARDED_KEY, '1'); } catch { /* ignore */ }
}

// Three short intro cards for first-time users, ending with a guided
// "Create your first quest" button.
export default function Onboarding({ onCreateQuest, onClose }) {
  const [step, setStep] = useState(0);
  const card = CARDS[step];
  const last = step === CARDS.length - 1;

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') finish(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function finish() {
    markOnboarded();
    onClose?.();
  }

  function create() {
    markOnboarded();
    onClose?.();
    onCreateQuest?.();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={finish} />
      <div
        className="relative w-full max-w-sm rounded-2xl p-6 shadow-2xl"
        style={{ background: 'rgba(8,21,37,0.98)', border: '1px solid rgba(59,130,246,0.3)', boxShadow: '0 0 40px rgba(37,99,235,0.2)' }}
      >
        <button onClick={finish} className="absolute top-3 right-3 text-xs text-slate-400 hover:text-navy-100 px-2 py-1">
          Skip
        </button>

        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: `${card.color}1f`, border: `1px solid ${card.color}55` }}
        >
          <Icon name={card.icon} className="w-7 h-7" color={card.color} />
        </div>
        <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: card.color }}>
          Step {step + 1} of {CARDS.length}
        </p>
        <h2 id="onboarding-title" className="text-xl font-bold text-navy-50 mb-2">{card.title}</h2>
        <p className="text-sm text-navy-200 leading-relaxed mb-6">{card.body}</p>

        <div className="flex items-center gap-1.5 mb-5" aria-hidden="true">
          {CARDS.map((_, i) => (
            <span
              key={i}
              className="h-1.5 rounded-full transition-all"
              style={{ width: i === step ? 22 : 8, background: i === step ? '#3b82f6' : 'rgba(59,130,246,0.25)' }}
            />
          ))}
        </div>

        <div className="flex gap-3">
          {step > 0 && (
            <button onClick={() => setStep(step - 1)} className="btn-secondary flex-1 py-2.5 text-sm">Back</button>
          )}
          {last ? (
            <button onClick={create} className="btn-primary flex-1 py-2.5 text-sm font-semibold">
              Create your first quest
            </button>
          ) : (
            <button onClick={() => setStep(step + 1)} className="btn-primary flex-1 py-2.5 text-sm font-semibold">
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
