import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import ParticleBackground from '../components/ParticleBackground';

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
    <div className="min-h-screen bg-navy-600 relative overflow-x-hidden">
      <ParticleBackground showPushupModel />

      {/* Nav */}
      <header className="border-b border-amber-500/20 bg-navy-800/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <img src="/logo.png" alt="Pushup Debt" className="h-7 sm:h-10 w-auto" />
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/login" className="btn-ghost text-sm">Sign In</Link>
            <Link href="/signup" className="btn-primary text-xs sm:text-sm py-2 px-3 sm:px-4">Get Started</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 pt-28 pb-24 text-center">
        <p className="text-amber-400/80 text-sm font-semibold uppercase tracking-widest mb-6">
          The productivity app that fights back
        </p>
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold text-navy-50 leading-tight mb-4">
          Procrastination has
        </h1>
        <h1
          className="text-4xl sm:text-6xl lg:text-7xl font-bold leading-tight mb-8"
          style={{
            color: '#f59e0b',
            textShadow: '0 0 60px rgba(245,158,11,0.45), 0 0 120px rgba(245,158,11,0.2)',
          }}
        >
          consequences.
        </h1>
        <p className="text-lg text-navy-200 max-w-2xl mx-auto mb-10 leading-relaxed">
          Every task you add has a deadline. Miss it and you owe pushups —
          verified by your camera. Let the debt pile up and you're blocked until you pay it off.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/signup"
            className="btn-primary py-3 px-8 text-base font-semibold"
            style={{ boxShadow: '0 0 24px rgba(245,158,11,0.35)' }}
          >
            Create a free account
          </Link>
          <Link href="/login" className="btn-secondary py-3 px-8 text-base">
            Sign in
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="relative z-10 border-t border-amber-500/10 bg-navy-800/50 backdrop-blur-sm py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="text-center text-3xl font-bold text-navy-50 mb-2">How it works</h2>
          <p className="text-center text-navy-300 text-sm mb-12">Three steps. No way out.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">

            <div className="card py-8 px-6 text-center">
              <p className="text-4xl mb-5">📋</p>
              <h3 className="text-base font-bold text-navy-50 mb-2">Add tasks with deadlines</h3>
              <p className="text-navy-200 text-sm leading-relaxed">
                Create one-off or recurring tasks and set a due date. That date is your commitment.
              </p>
            </div>

            <div className="card py-8 px-6 text-center">
              <p className="text-4xl mb-5">⏰</p>
              <h3 className="text-base font-bold text-navy-50 mb-2">Miss it, earn debt</h3>
              <p className="text-navy-200 text-sm leading-relaxed">
                Every day a task sits overdue adds 5 pushups to your debt. The longer you wait, the worse it gets.
              </p>
            </div>

            <div className="card py-8 px-6 text-center">
              <p className="text-4xl mb-5">💪</p>
              <h3 className="text-base font-bold text-navy-50 mb-2">Pay it off in reps</h3>
              <p className="text-navy-200 text-sm leading-relaxed">
                Do pushups on camera to clear your debt. Reps are tracked automatically — no self-reporting.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* Debt formula */}
      <section className="relative z-10 py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

            <div>
              <h2 className="text-3xl font-bold text-navy-50 mb-4">Simple, painful math</h2>
              <p className="text-navy-200 leading-relaxed mb-6">
                The formula never changes:{' '}
                <span className="font-bold font-mono" style={{ color: '#f59e0b' }}>
                  5 × days overdue.
                </span>{' '}
                Forget a task for a week and you owe 35 pushups. Let your total hit 100
                and you're locked out of adding new tasks until you pay up.
              </p>
              <p className="text-navy-300 text-sm leading-relaxed">
                Debt resets each night at midnight. Complete the task before then and you owe nothing.
              </p>
            </div>

            <div className="card bg-navy-700/60 backdrop-blur-sm">
              <p className="text-xs text-navy-300 uppercase tracking-widest font-medium mb-5">Debt examples</p>
              <div className="space-y-3">
                {[
                  { label: '1 day overdue',      pushups: 5,   color: 'text-navy-100' },
                  { label: '3 days overdue',     pushups: 15,  color: 'text-amber-400' },
                  { label: '1 week overdue',     pushups: 35,  color: 'text-orange-400' },
                  { label: '20 days — blocked',  pushups: 100, color: 'text-red-400' },
                ].map(({ label, pushups, color }) => (
                  <div key={label} className="flex items-center justify-between py-2.5 border-b border-navy-600 last:border-0">
                    <span className="text-navy-300 text-sm">{label}</span>
                    <span className={`font-bold tabular-nums ${color}`}>{pushups} pushups</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-navy-400 mt-5">
                Total debt over 100 locks you out of adding new tasks.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 border-t border-amber-500/10 bg-navy-800/50 backdrop-blur-sm py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="text-center text-3xl font-bold text-navy-50 mb-2">Built to keep you honest</h2>
          <p className="text-center text-navy-300 text-sm mb-12">No self-reporting. No honor system.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

            <div className="card flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xl">📷</span>
              </div>
              <div>
                <h3 className="font-bold text-navy-50 mb-1">Camera-verified pushups</h3>
                <p className="text-navy-200 text-sm leading-relaxed">
                  MediaPipe Pose tracks your elbow angle and back position in real time. A rep only counts when
                  your arms go past 155° up and below 90° down, with your body parallel to the floor.
                </p>
              </div>
            </div>

            <div className="card flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
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
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
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
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
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

      {/* Install the app */}
      <section className="relative z-10 py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-amber-400/80 text-sm font-semibold uppercase tracking-widest mb-3">No download needed</p>
          <h2 className="text-3xl font-bold text-navy-50 mb-3">Add it to your home screen</h2>
          <p className="text-navy-300 text-sm mb-12">
            PushupDebt works like a native app — full screen, no browser chrome. Install it in seconds.
          </p>

          {/* iOS steps */}
          <div className="card bg-navy-700/50 mb-4 text-left">
            <div className="flex items-center gap-2 mb-5">
              <span className="text-xl"></span>
              <p className="text-sm font-bold text-navy-50">iPhone / iPad — Safari</p>
            </div>
            <div className="space-y-4">
              {[
                { n: '1', text: 'Open pushupdebt.com in Safari (not Chrome or Firefox).' },
                {
                  n: '2',
                  text: (
                    <>
                      Tap the{' '}
                      <span className="inline-flex items-center gap-1 bg-navy-600 border border-navy-500 px-2 py-0.5 rounded text-xs font-mono text-navy-100">
                        Share
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                          <path d="M13 4.5a2.5 2.5 0 1 1 .702 1.737L6.97 9.604a2.518 2.518 0 0 1 0 .792l6.733 3.367a2.5 2.5 0 1 1-.671 1.341l-6.733-3.367a2.5 2.5 0 1 1 0-3.474l6.733-3.366A2.52 2.52 0 0 1 13 4.5Z" />
                        </svg>
                      </span>{' '}
                      icon at the bottom of the screen.
                    </>
                  ),
                },
                { n: '3', text: 'Scroll down in the share sheet and tap "Add to Home Screen".' },
                { n: '4', text: 'Tap "Add" in the top right. Done — it\'s on your home screen.' },
              ].map(({ n, text }) => (
                <div key={n} className="flex items-start gap-4">
                  <span className="w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center flex-shrink-0 text-xs font-bold text-amber-400 mt-0.5">
                    {n}
                  </span>
                  <p className="text-sm text-navy-200 leading-relaxed">{text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Android note */}
          <div className="card bg-navy-700/30 text-left">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🤖</span>
              <p className="text-sm font-bold text-navy-50">Android — Chrome</p>
            </div>
            <p className="text-sm text-navy-300 leading-relaxed">
              Tap the <span className="font-mono text-navy-100">⋮</span> menu in the top right → <span className="text-navy-100">Add to Home screen</span> → <span className="text-navy-100">Add</span>.
            </p>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative z-10 py-28 text-center">
        <div className="max-w-xl mx-auto px-4">
          <p className="text-5xl mb-6">💪</p>
          <h2 className="text-4xl font-bold text-navy-50 mb-4">Ready to be held accountable?</h2>
          <p className="text-navy-300 mb-10">Free to use. No excuses accepted.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/signup"
              className="btn-primary py-3 px-8 text-base font-semibold"
              style={{ boxShadow: '0 0 24px rgba(245,158,11,0.35)' }}
            >
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
