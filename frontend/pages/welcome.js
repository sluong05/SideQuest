import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';

export default function Welcome() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.push('/');
  }, [user, loading]);

  if (loading) {
    return (
      <div className="min-h-screen bg-navy-600 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-navy-600 relative overflow-hidden"
      style={{ backgroundImage: 'radial-gradient(circle, rgba(148,163,184,0.18) 1px, transparent 1px)', backgroundSize: '28px 28px' }}
    >

      {/* Nav */}
      <header className="border-b border-navy-400 bg-navy-700/90 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <img src="/logo.png" alt="Pushup Debt" className="h-10 w-auto" />
          <div className="flex items-center gap-3">
            <Link href="/login" className="btn-ghost text-sm">Sign In</Link>
            <Link href="/signup" className="btn-primary text-sm py-2 px-4">Get Started</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-24 pb-20 text-center">
        <h1 className="text-5xl sm:text-6xl font-bold text-navy-50 leading-tight mb-6">
          Procrastination has<br />
          <span className="text-amber-400">consequences.</span>
        </h1>
        <p className="text-xl text-navy-200 max-w-2xl mx-auto mb-10 leading-relaxed">
          PushupDebt turns missed deadlines into physical debt. Every task you add has a due date —
          fall behind and you owe pushups. Pay them off on camera or stay blocked.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/signup" className="btn-primary py-3 px-8 text-base font-semibold">
            Create a free account
          </Link>
          <Link href="/login" className="btn-secondary py-3 px-8 text-base">
            Sign in
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-navy-400 bg-navy-700/40 py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="text-center text-2xl font-bold text-navy-50 mb-2">How it works</h2>
          <p className="text-center text-navy-300 text-sm mb-12">Three steps. No way out.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">

            <div className="card text-center py-8 px-6">
              <p className="text-4xl mb-4">📋</p>
              <h3 className="text-base font-bold text-navy-50 mb-2">Add tasks with deadlines</h3>
              <p className="text-navy-200 text-sm leading-relaxed">
                Create one-off or recurring tasks and set a due date. That date is your commitment.
              </p>
            </div>

            <div className="card text-center py-8 px-6">
              <p className="text-4xl mb-4">⏰</p>
              <h3 className="text-base font-bold text-navy-50 mb-2">Miss it, earn debt</h3>
              <p className="text-navy-200 text-sm leading-relaxed">
                Every day a task sits overdue adds 5 pushups to your debt. The longer you wait, the worse it gets.
              </p>
            </div>

            <div className="card text-center py-8 px-6">
              <p className="text-4xl mb-4">💪</p>
              <h3 className="text-base font-bold text-navy-50 mb-2">Pay it off in reps</h3>
              <p className="text-navy-200 text-sm leading-relaxed">
                Do pushups on camera to clear your debt. Reps are tracked automatically — no self-reporting.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* Debt formula */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

          <div>
            <h2 className="text-2xl font-bold text-navy-50 mb-4">Simple, painful math</h2>
            <p className="text-navy-200 leading-relaxed mb-6">
              The formula never changes: <span className="text-amber-400 font-semibold font-mono">5 × days overdue</span>.
              Forget a task for a week and you owe 35 pushups. Let your total debt hit 100 and you're locked
              out of adding new tasks until you pay up.
            </p>
            <p className="text-navy-300 text-sm leading-relaxed">
              Debt resets each night at midnight. Complete the task before then and you owe nothing.
            </p>
          </div>

          <div className="card bg-navy-700/60">
            <p className="text-xs text-navy-300 uppercase tracking-wide font-medium mb-4">Debt examples</p>
            <div className="space-y-3">
              {[
                { days: 1,  pushups: 5,   label: '1 day overdue',   color: 'text-navy-50' },
                { days: 3,  pushups: 15,  label: '3 days overdue',  color: 'text-amber-400' },
                { days: 7,  pushups: 35,  label: '1 week overdue',  color: 'text-orange-400' },
                { days: 20, pushups: 100, label: '20 days — blocked', color: 'text-red-400' },
              ].map(({ days, pushups, label, color }) => (
                <div key={days} className="flex items-center justify-between py-2 border-b border-navy-600 last:border-0">
                  <span className="text-navy-200 text-sm">{label}</span>
                  <span className={`font-bold tabular-nums ${color}`}>{pushups} pushups</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-navy-400 mt-4">
              Debt over 100 total locks you out of adding new tasks.
            </p>
          </div>

        </div>
      </section>

      {/* Features */}
      <section className="border-t border-navy-400 bg-navy-700/40 py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="text-center text-2xl font-bold text-navy-50 mb-2">Built to keep you honest</h2>
          <p className="text-center text-navy-300 text-sm mb-12">No self-reporting. No honor system.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

            <div className="card flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xl">📷</span>
              </div>
              <div>
                <h3 className="font-bold text-navy-50 mb-1">Camera-verified pushups</h3>
                <p className="text-navy-200 text-sm leading-relaxed">
                  MediaPipe Pose tracks your elbow angle and back position in real time. A rep only counts when
                  your form is right — arms past 160° up, below 85° down, body parallel to the floor.
                </p>
              </div>
            </div>

            <div className="card flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xl">🏆</span>
              </div>
              <div>
                <h3 className="font-bold text-navy-50 mb-1">Leaderboard</h3>
                <p className="text-navy-200 text-sm leading-relaxed">
                  See how you rank against friends. Everyone's sorted by lowest outstanding debt —
                  keeping your balance at zero is the only way to stay on top.
                </p>
              </div>
            </div>

            <div className="card flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xl">🔥</span>
              </div>
              <div>
                <h3 className="font-bold text-navy-50 mb-1">Streak tracking</h3>
                <p className="text-navy-200 text-sm leading-relaxed">
                  Earn a streak by finishing every task and clearing all debt each day.
                  One slip resets it — consistency is the whole point.
                </p>
              </div>
            </div>

            <div className="card flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xl">🔄</span>
              </div>
              <div>
                <h3 className="font-bold text-navy-50 mb-1">Recurring tasks</h3>
                <p className="text-navy-200 text-sm leading-relaxed">
                  Set tasks to repeat daily or weekly. They reset automatically after each completion
                  so your habits stay on the list without extra work.
                </p>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 text-center">
        <div className="max-w-xl mx-auto px-4">
          <p className="text-5xl mb-6">💪</p>
          <h2 className="text-3xl font-bold text-navy-50 mb-4">Ready to be held accountable?</h2>
          <p className="text-navy-300 mb-10">Free to use. No excuses accepted.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/signup" className="btn-primary py-3 px-8 text-base font-semibold">
              Create a free account
            </Link>
            <Link href="/login" className="btn-secondary py-3 px-8 text-base">
              Sign in
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
