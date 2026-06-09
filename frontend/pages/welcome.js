import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import ParticleBackground from '../components/ParticleBackground';

function SideQuestLogo() {
  return (
    <div className="flex items-center gap-2">
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 2L17.5 9.5L26 10.5L20 16.5L21.5 25L14 21L6.5 25L8 16.5L2 10.5L10.5 9.5L14 2Z" fill="#3B82F6" opacity="0.9"/>
        <path d="M14 5L16.5 10.5L23 11.3L18.5 15.8L19.5 22L14 19L8.5 22L9.5 15.8L5 11.3L11.5 10.5L14 5Z" fill="#1d4ed8" opacity="0.6"/>
        <circle cx="14" cy="13" r="3" fill="white" opacity="0.9"/>
      </svg>
      <span className="font-bold text-lg tracking-wide text-navy-50">SIDEQUEST</span>
    </div>
  );
}

const CATEGORIES = [
  { icon: '💪', label: 'Fitness' },
  { icon: '📚', label: 'Learning' },
  { icon: '🎯', label: 'Focus' },
  { icon: '⚡', label: 'Productivity' },
  { icon: '🧘', label: 'Wellness' },
  { icon: '🏠', label: 'Chores' },
];

export default function Welcome() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.push('/');
  }, [user, loading]);

  if (loading) {
    return (
      <div className="min-h-screen bg-navy-600 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-navy-600 relative overflow-x-hidden">
      <ParticleBackground />

      {/* Nav */}
      <header className="border-b bg-navy-700/80 backdrop-blur-md sticky top-0 z-50" style={{ borderColor: 'rgba(59,130,246,0.15)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <SideQuestLogo />
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/login" className="btn-ghost text-sm">Sign In</Link>
            <Link href="/signup" className="btn-primary text-xs sm:text-sm py-2 px-3 sm:px-4">Get Started Free</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 pt-28 pb-24 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-8 text-xs font-semibold uppercase tracking-widest text-blue-400" style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          Accountability that actually works
        </div>

        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold text-navy-50 leading-tight mb-4">
          Turn Your Life Into
        </h1>
        <h1
          className="text-4xl sm:text-6xl lg:text-7xl font-bold leading-tight mb-8"
          style={{
            background: 'linear-gradient(135deg, #3B82F6 0%, #60A5FA 50%, #93C5FD 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            textShadow: 'none',
            filter: 'drop-shadow(0 0 40px rgba(59,130,246,0.4))',
          }}
        >
          Side Quests
        </h1>

        <p className="text-lg text-navy-200 max-w-2xl mx-auto mb-10 leading-relaxed">
          Set goals with real deadlines. Miss one and owe debt — pushups, study time, whatever fits.
          Pay it back, earn XP, and level up your life one quest at a time.
        </p>

        <div className="flex flex-wrap gap-2 justify-center mb-10">
          {CATEGORIES.map((c) => (
            <span
              key={c.label}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-navy-200"
              style={{ background: 'rgba(13,31,56,0.8)', border: '1px solid rgba(59,130,246,0.2)' }}
            >
              {c.icon} {c.label}
            </span>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/signup"
            className="btn-primary py-3 px-8 text-base font-semibold"
            style={{ boxShadow: '0 0 32px rgba(59,130,246,0.4)' }}
          >
            Start Your Journey — Free
          </Link>
          <Link href="/login" className="btn-secondary py-3 px-8 text-base">
            Sign In
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="relative z-10 py-20" style={{ borderTop: '1px solid rgba(59,130,246,0.1)', background: 'rgba(6,12,24,0.5)', backdropFilter: 'blur(8px)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-navy-50 mb-2">How SideQuest works</h2>
            <p className="text-navy-300 text-sm">Four steps. No excuses accepted.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                step: '01',
                icon: '🎯',
                title: 'Create a Quest',
                desc: 'Set a goal with a deadline. Pick a category, difficulty, and decide what you owe if you miss it.',
                color: 'rgba(59,130,246,0.3)',
              },
              {
                step: '02',
                icon: '✅',
                title: 'Complete On Time',
                desc: 'Finish before the deadline, earn XP, and keep your streak alive. Every quest builds momentum.',
                color: 'rgba(16,185,129,0.3)',
              },
              {
                step: '03',
                icon: '⚠️',
                title: 'Miss It, Earn Debt',
                desc: 'Every overdue day stacks more debt. The longer you wait, the more you owe. There is no ignoring it.',
                color: 'rgba(239,68,68,0.3)',
              },
              {
                step: '04',
                icon: '⬆️',
                title: 'Pay Off & Level Up',
                desc: 'Do pushups, study, go for a walk — whatever your quest demands. Clear debt, earn XP, advance.',
                color: 'rgba(168,85,247,0.3)',
              },
            ].map(({ step, icon, title, desc, color }) => (
              <div key={step} className="card py-8 px-6 text-center relative overflow-hidden">
                <div className="absolute top-3 right-3 text-xs font-bold text-navy-400 font-mono">{step}</div>
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5 text-2xl"
                  style={{ background: color, border: `1px solid ${color.replace('0.3', '0.5')}` }}
                >
                  {icon}
                </div>
                <h3 className="text-sm font-bold text-navy-50 mb-2">{title}</h3>
                <p className="text-navy-300 text-xs leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Debt formula */}
      <section className="relative z-10 py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-4 text-xs font-semibold text-orange-400" style={{ background: 'rgba(234,88,12,0.1)', border: '1px solid rgba(234,88,12,0.25)' }}>
                ⚡ The Debt System
              </div>
              <h2 className="text-3xl font-bold text-navy-50 mb-4">Consequences are real.</h2>
              <p className="text-navy-200 leading-relaxed mb-6">
                The formula never changes:{' '}
                <span className="font-bold font-mono text-orange-400">
                  5 × days overdue.
                </span>{' '}
                Forget a quest for a week and you owe 35 reps. Let your total hit 250
                and you're locked out of adding new quests until you pay up.
              </p>
              <p className="text-navy-300 text-sm leading-relaxed">
                Unlike a normal to-do list, ignored quests don't quietly disappear.
                They stack up and demand you earn your way back.
              </p>
            </div>

            <div className="card" style={{ background: 'rgba(13,31,56,0.8)' }}>
              <p className="text-xs text-navy-300 uppercase tracking-widest font-medium mb-5">Debt examples</p>
              <div className="space-y-3">
                {[
                  { label: '1 day overdue',     debt: 5,   color: 'text-navy-100' },
                  { label: '3 days overdue',    debt: 15,  color: 'text-yellow-400' },
                  { label: '7 days overdue',    debt: 35,  color: 'text-orange-400' },
                  { label: '50 days — blocked', debt: 250, color: 'text-red-400' },
                ].map(({ label, debt, color }) => (
                  <div key={label} className="flex items-center justify-between py-2.5" style={{ borderBottom: '1px solid rgba(59,130,246,0.08)' }}>
                    <span className="text-navy-300 text-sm">{label}</span>
                    <span className={`font-bold tabular-nums ${color}`}>{debt} reps owed</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-navy-400 mt-5">
                Debt over 250 locks new quest creation until you clear it.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 py-20" style={{ borderTop: '1px solid rgba(59,130,246,0.1)', background: 'rgba(6,12,24,0.5)', backdropFilter: 'blur(8px)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-navy-50 mb-2">Everything you need to stay accountable</h2>
            <p className="text-navy-300 text-sm">Not a to-do list. A game you play with your own life.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              {
                icon: '🎮',
                title: 'Quest Categories',
                desc: 'Fitness, Learning, Focus, Productivity, Wellness, Chores — organize your life into meaningful buckets.',
                accent: 'rgba(59,130,246,0.2)',
              },
              {
                icon: '⬆️',
                title: 'XP & Levels',
                desc: 'Every completed quest earns XP. Level up as you build consistency. Your profile shows your journey.',
                accent: 'rgba(168,85,247,0.2)',
              },
              {
                icon: '🔥',
                title: 'Streak Tracking',
                desc: 'Build a daily streak by finishing every quest and clearing all debt. One miss resets it.',
                accent: 'rgba(234,88,12,0.2)',
              },
              {
                icon: '📷',
                title: 'Camera-Verified Reps',
                desc: 'MediaPipe Pose tracks your form in real time. A rep only counts when your range of motion is legit.',
                accent: 'rgba(16,185,129,0.2)',
              },
              {
                icon: '🏆',
                title: 'Leaderboard',
                desc: 'Compete with everyone or just your friends. Ranked by quests completed this week.',
                accent: 'rgba(234,179,8,0.2)',
              },
              {
                icon: '🔁',
                title: 'Recurring Quests',
                desc: 'Set quests to repeat daily or weekly. They reset automatically — habits stay on your board.',
                accent: 'rgba(59,130,246,0.2)',
              },
            ].map(({ icon, title, desc, accent }) => (
              <div key={title} className="card flex items-start gap-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 text-lg"
                  style={{ background: accent, border: `1px solid ${accent.replace('0.2', '0.4')}` }}
                >
                  {icon}
                </div>
                <div>
                  <h3 className="font-bold text-navy-50 mb-1 text-sm">{title}</h3>
                  <p className="text-navy-300 text-xs leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Install the app */}
      <section className="relative z-10 py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest mb-3 text-blue-400">No download needed</p>
          <h2 className="text-3xl font-bold text-navy-50 mb-3">Add it to your home screen</h2>
          <p className="text-navy-300 text-sm mb-12">
            SideQuest works like a native app — full screen, no browser chrome.
          </p>

          <div className="card mb-4 text-left" style={{ background: 'rgba(13,31,56,0.8)' }}>
            <div className="flex items-center gap-2 mb-5">
              <span className="text-xl"></span>
              <p className="text-sm font-bold text-navy-50">iPhone / iPad — Safari</p>
            </div>
            <div className="space-y-4">
              {[
                { n: '1', text: 'Open the site in Safari (not Chrome or Firefox).' },
                { n: '2', text: 'Tap the Share icon at the bottom of the screen.' },
                { n: '3', text: 'Scroll down and tap "Add to Home Screen".' },
                { n: '4', text: 'Tap "Add" in the top right. Done — it\'s on your home screen.' },
              ].map(({ n, text }) => (
                <div key={n} className="flex items-start gap-4">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-blue-400 mt-0.5" style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)' }}>
                    {n}
                  </span>
                  <p className="text-sm text-navy-200 leading-relaxed">{text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="card text-left" style={{ background: 'rgba(13,31,56,0.5)' }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🤖</span>
              <p className="text-sm font-bold text-navy-50">Android — Chrome</p>
            </div>
            <p className="text-sm text-navy-300 leading-relaxed">
              Tap the <span className="font-mono text-navy-100">⋮</span> menu → <span className="text-navy-100">Add to Home screen</span> → <span className="text-navy-100">Add</span>.
            </p>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative z-10 py-28 text-center">
        <div className="max-w-xl mx-auto px-4">
          <div className="text-6xl mb-6">⚔️</div>
          <h2 className="text-4xl font-bold text-navy-50 mb-4">Ready to start your quests?</h2>
          <p className="text-navy-300 mb-10">Free to use. No excuses accepted.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/signup"
              className="btn-primary py-3 px-8 text-base font-semibold"
              style={{ boxShadow: '0 0 32px rgba(59,130,246,0.4)' }}
            >
              Create a Free Account
            </Link>
            <Link href="/login" className="btn-secondary py-3 px-8 text-base">
              Sign In
            </Link>
          </div>
        </div>
      </section>

      <footer style={{ borderTop: '1px solid rgba(59,130,246,0.1)' }} className="py-6 text-center text-xs text-navy-400">
        <div className="flex items-center justify-center gap-5">
          <Link href="/privacy" className="hover:text-navy-200 transition-colors">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-navy-200 transition-colors">Terms of Service</Link>
          <a href="mailto:stevenluong05@gmail.com" className="hover:text-navy-200 transition-colors">Contact</a>
        </div>
      </footer>
    </div>
  );
}
