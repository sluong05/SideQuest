import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import ParticleBackground from '../components/ParticleBackground';
import { Icon } from '../components/Icons';
import { PAYOFF_METHODS } from '../components/PayoffShell';

function SideQuestLogo() {
  return (
    <img src="/sidequest-logo-navbar.svg" alt="SideQuest" className="h-8 w-auto" />
  );
}

function Hexagon({ size = 48, fill = 'rgba(37,99,235,0.15)', border = '#3b82f6', glow = false, children }) {
  const clip = 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)';
  return (
    <div
      className="relative flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size, filter: glow ? 'drop-shadow(0 0 10px rgba(59,130,246,0.55))' : 'none' }}
    >
      <div className="absolute inset-0" style={{ clipPath: clip, background: border }} />
      <div className="absolute" style={{ inset: 2, clipPath: clip, background: '#081525' }} />
      <div className="absolute" style={{ inset: 2, clipPath: clip, background: fill }} />
      <div className="relative flex flex-col items-center justify-center leading-none">{children}</div>
    </div>
  );
}

/* ── hero product mock — a miniature of the real dashboard ────────────────── */

function ProductMock() {
  const quests = [
    { icon: 'dumbbell', color: '#60a5fa', title: 'Morning run — 30 min',  status: 'done',    note: '+50 XP' },
    { icon: 'book',     color: '#c084fc', title: 'Read 20 pages',          status: 'due',     note: 'Due 9:00 PM' },
    { icon: 'target',   color: '#34d399', title: 'Deep work — 90 min',     status: 'overdue', note: '5 pts debt' },
  ];

  return (
    <div className="relative">
      {/* Floating chips */}
      <div className="absolute -top-5 -right-3 z-20 float-slow">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-emerald-400" style={{ background: 'rgba(8,21,37,0.95)', border: '1px solid rgba(34,197,94,0.4)', boxShadow: '0 0 18px rgba(34,197,94,0.25)' }}>
          <Icon name="check" className="w-3.5 h-3.5" color="#4ade80" /> +50 XP
        </div>
      </div>
      <div className="absolute -bottom-4 -left-4 z-20 float-slower">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-orange-400" style={{ background: 'rgba(8,21,37,0.95)', border: '1px solid rgba(249,115,22,0.4)', boxShadow: '0 0 18px rgba(249,115,22,0.25)' }}>
          <Icon name="flame" className="w-3.5 h-3.5" color="#fb923c" /> 7 day streak
        </div>
      </div>

      {/* Card */}
      <div
        className="relative z-10 rounded-2xl p-5"
        style={{
          background: 'rgba(8,21,37,0.92)',
          border: '1px solid rgba(59,130,246,0.3)',
          boxShadow: '0 0 50px rgba(37,99,235,0.2), 0 24px 60px rgba(0,0,0,0.5)',
          transform: 'rotate(1.5deg)',
        }}
      >
        {/* Mock header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Today's Quests</p>
            <p className="text-sm font-bold text-white mt-0.5">2 of 3 complete</p>
          </div>
          <Hexagon size={42} glow>
            <span className="text-xs font-extrabold text-white">Lv 7</span>
          </Hexagon>
        </div>

        {/* Quest rows */}
        <div className="space-y-2 mb-4">
          {quests.map((q) => (
            <div key={q.title} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(13,31,56,0.6)', border: `1px solid ${q.status === 'overdue' ? 'rgba(239,68,68,0.3)' : 'rgba(59,130,246,0.12)'}` }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${q.color}1f`, border: `1px solid ${q.color}45` }}>
                <Icon name={q.icon} className="w-3.5 h-3.5" color={q.color} />
              </div>
              <p className={`flex-1 text-xs font-semibold truncate ${q.status === 'done' ? 'line-through text-slate-500' : 'text-navy-100'}`}>{q.title}</p>
              <span
                className="text-[10px] font-bold flex-shrink-0"
                style={{ color: q.status === 'done' ? '#4ade80' : q.status === 'overdue' ? '#f87171' : '#94a3b8' }}
              >
                {q.note}
              </span>
            </div>
          ))}
        </div>

        {/* XP bar */}
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-bold text-slate-400">320 / 500 XP</span>
          <span className="text-[10px] text-slate-500">Level 8 soon</span>
        </div>
        <div className="w-full h-1.5 rounded-full mb-4" style={{ background: 'rgba(59,130,246,0.12)' }}>
          <div className="h-1.5 rounded-full" style={{ width: '64%', background: 'linear-gradient(90deg,#2563eb,#60a5fa)', boxShadow: '0 0 8px rgba(59,130,246,0.5)' }} />
        </div>

        {/* Debt strip */}
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(234,179,8,0.07)', border: '1px solid rgba(234,179,8,0.25)' }}>
          <Icon name="coins" className="w-4 h-4" color="#fbbf24" />
          <div className="flex-1 leading-tight">
            <p className="text-xs font-bold text-yellow-400">5 pts of debt — Light Burden</p>
            <p className="text-[10px] text-slate-500">Pay it back with reps, minutes, or chores</p>
          </div>
          <span className="text-[10px] font-bold text-blue-400">Pay →</span>
        </div>
      </div>
    </div>
  );
}

/* ── data ─────────────────────────────────────────────────────────────────── */

const STEPS = [
  { n: 1, icon: 'pencil', color: '#60a5fa', title: 'Create a Quest',   desc: 'Pick a category, set a real deadline, and choose the stakes if you miss it.' },
  { n: 2, icon: 'check',  color: '#4ade80', title: 'Complete On Time', desc: 'Earn XP and coins, keep your streak alive, and climb the weekly leaderboard.' },
  { n: 3, icon: 'clock',  color: '#fb923c', title: 'Miss It? Debt.',   desc: '5 pts per day overdue — and it keeps stacking until you do something about it.' },
  { n: 4, icon: 'bolt',   color: '#c084fc', title: 'Pay It Back',      desc: 'Reps, focused minutes, chores — clear your debt with real effort and level up anyway.' },
];

const DEBT_LADDER = [
  { range: '1–25',  label: 'Light Burden',     color: '#fbbf24' },
  { range: '26–75', label: 'Quest Debt',       color: '#fb923c' },
  { range: '76–125', label: 'Debt Spiral',     color: '#f87171' },
  { range: '126–175', label: 'Quest Bankruptcy', color: '#f87171' },
  { range: '176–249', label: 'Critical Mass',  color: '#c084fc' },
  { range: '250+', label: 'Beyond Recovery — quests locked', color: '#c084fc' },
];

const FEATURES = [
  { icon: 'bolt',     color: '#60a5fa', title: 'XP, Levels & Leagues', desc: 'Every quest pays XP. Climb from Bronze to Diamond as your total grows — ranked weekly against everyone.' },
  { icon: 'flame',    color: '#fb923c', title: 'Streak Tracking',      desc: 'Finish your quests and stay debt-free to build a daily streak. One lazy day resets it.' },
  { icon: 'coins',    color: '#fbbf24', title: 'Coins & The Shop',     desc: 'Quests completed debt-free earn coins. Spend them on power-ups — or drop a debt bomb on a friend.' },
  { icon: 'dumbbell', color: '#4ade80', title: 'Camera-Verified Reps', desc: 'MediaPipe pose tracking watches your form. A rep only counts when the range of motion is legit.' },
  { icon: 'heart',    color: '#f87171', title: 'Friends & Challenges', desc: 'Add friends, see their activity feed, and challenge them head-to-head on streaks or quests.' },
  { icon: 'list',     color: '#c084fc', title: 'Recurring Quests',     desc: 'Daily and weekly quests reset automatically, so your habits never fall off the board.' },
];

/* ── page ─────────────────────────────────────────────────────────────────── */

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
      <section className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pt-20 sm:pt-28 pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-12 lg:gap-16 items-center">
          <div>
            <div className="rise rise-1 inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-7 text-xs font-semibold uppercase tracking-widest text-blue-400" style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              Accountability that actually works
            </div>

            <h1 className="rise rise-2 text-4xl sm:text-5xl lg:text-6xl font-bold text-navy-50 leading-[1.08] mb-2">
              Your life is the main quest.
            </h1>
            <h1
              className="rise rise-2 text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.08] mb-7"
              style={{
                background: 'linear-gradient(135deg, #3B82F6 0%, #60A5FA 50%, #93C5FD 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                filter: 'drop-shadow(0 0 40px rgba(59,130,246,0.4))',
              }}
            >
              These are your side quests.
            </h1>

            <p className="rise rise-3 text-base sm:text-lg text-navy-200 max-w-xl mb-8 leading-relaxed">
              Set quests with real deadlines. Miss one and you take on debt —
              paid back in pushups, focused minutes, or chores. Complete quests
              to earn XP, keep your streak, and climb the leagues.
            </p>

            <div className="rise rise-4 flex flex-col sm:flex-row gap-3">
              <Link
                href="/signup"
                className="btn-primary py-3 px-8 text-base font-semibold text-center"
                style={{ boxShadow: '0 0 32px rgba(59,130,246,0.4)' }}
              >
                Start Your First Quest — Free
              </Link>
              <Link href="/login" className="btn-secondary py-3 px-8 text-base text-center">
                Sign In
              </Link>
            </div>

            <div className="rise rise-5 flex items-center gap-4 mt-8 flex-wrap">
              {[
                { icon: 'bolt',  color: '#60a5fa', text: 'Earn XP' },
                { icon: 'flame', color: '#fb923c', text: 'Build streaks' },
                { icon: 'coins', color: '#fbbf24', text: 'Pay your debts' },
              ].map(({ icon, color, text }) => (
                <span key={text} className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Icon name={icon} className="w-3.5 h-3.5" color={color} /> {text}
                </span>
              ))}
            </div>
          </div>

          <div className="rise rise-4 max-w-md w-full mx-auto lg:mx-0">
            <ProductMock />
          </div>
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
            {STEPS.map(({ n, icon, color, title, desc }, i) => (
              <div key={n} className="card py-8 px-6 text-center relative">
                {/* connector */}
                {i < STEPS.length - 1 && (
                  <div className="hidden lg:block absolute top-1/2 -right-5 w-5 h-px" style={{ background: 'rgba(59,130,246,0.25)' }} />
                )}
                <div className="mx-auto mb-5 w-fit">
                  <Hexagon size={56} fill={`${color}1c`} border={`${color}70`}>
                    <Icon name={icon} className="w-5 h-5" color={color} />
                  </Hexagon>
                </div>
                <p className="text-[10px] font-bold font-mono mb-1.5" style={{ color }}>STEP 0{n}</p>
                <h3 className="text-sm font-bold text-navy-50 mb-2">{title}</h3>
                <p className="text-navy-300 text-xs leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Debt system */}
      <section className="relative z-10 py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-4 text-xs font-semibold text-orange-400" style={{ background: 'rgba(234,88,12,0.1)', border: '1px solid rgba(234,88,12,0.25)' }}>
                <Icon name="flame" className="w-3.5 h-3.5" color="#fb923c" /> The Debt System
              </div>
              <h2 className="text-3xl font-bold text-navy-50 mb-4">Consequences are real.</h2>
              <p className="text-navy-200 leading-relaxed mb-6">
                The formula never changes:{' '}
                <span className="font-bold font-mono text-orange-400">5 pts × days overdue.</span>{' '}
                Forget a quest for a week and you owe 35 points of effort. Let your
                total hit 250 and new quests are locked until you pay up.
              </p>
              <p className="text-navy-300 text-sm leading-relaxed">
                Unlike a normal to-do list, ignored quests don't quietly disappear.
                They sink you deeper into the ladder — and the only way out is real effort.
              </p>
            </div>

            <div className="card" style={{ background: 'rgba(13,31,56,0.8)' }}>
              <p className="text-xs text-navy-300 uppercase tracking-widest font-medium mb-5">The debt ladder</p>
              <div className="space-y-1">
                {DEBT_LADDER.map(({ range, label, color }, i) => (
                  <div
                    key={label}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg"
                    style={{ background: `${color}${i >= 4 ? '14' : '0d'}`, border: `1px solid ${color}${i >= 4 ? '40' : '26'}` }}
                  >
                    <span className="text-sm font-bold" style={{ color }}>{label}</span>
                    <span className="text-xs font-mono text-slate-400 tabular-nums flex-shrink-0">{range} pts</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Payoff methods */}
      <section className="relative z-10 py-20" style={{ borderTop: '1px solid rgba(59,130,246,0.1)', background: 'rgba(6,12,24,0.5)', backdropFilter: 'blur(8px)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-navy-50 mb-2">Pay your debt your way</h2>
            <p className="text-navy-300 text-sm">Every point of debt is paid with real effort — you choose the currency.</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {PAYOFF_METHODS.map((m) => (
              <div key={m.id} className="card py-6 px-4 text-center flex flex-col items-center" style={{ borderColor: m.border }}>
                <Hexagon size={50} fill={m.bg} border={m.color}>
                  <Icon name={m.icon} className="w-5 h-5" color={m.color} />
                </Hexagon>
                <h3 className="text-sm font-bold text-navy-50 mt-3 mb-1">{m.label}</h3>
                <p className="text-[11px] text-slate-500 leading-snug mb-2">{m.desc}</p>
                <span className="mt-auto text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: m.color, background: m.bg, border: `1px solid ${m.border}` }}>
                  {m.rate}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-navy-50 mb-2">Everything you need to stay accountable</h2>
            <p className="text-navy-300 text-sm">Not a to-do list. A game you play with your own life.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map(({ icon, color, title, desc }) => (
              <div key={title} className="card flex items-start gap-4 glow-hover">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: `${color}1c`, border: `1px solid ${color}40` }}
                >
                  <Icon name={icon} className="w-5 h-5" color={color} />
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
      <section className="relative z-10 py-20" style={{ borderTop: '1px solid rgba(59,130,246,0.1)', background: 'rgba(6,12,24,0.5)', backdropFilter: 'blur(8px)' }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest mb-3 text-blue-400">Mobile app</p>
          <h2 className="text-3xl font-bold text-navy-50 mb-3">Coming to the App Store soon</h2>
          <p className="text-navy-300 text-sm">
            A native SideQuest app is on the way. In the meantime, sign up and start your first quest right here in the browser.
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative z-10 py-28 text-center">
        <div className="max-w-xl mx-auto px-4 flex flex-col items-center">
          <Hexagon size={72} glow>
            <Icon name="bolt" className="w-7 h-7" color="#60a5fa" />
          </Hexagon>
          <h2 className="text-4xl font-bold text-navy-50 mt-6 mb-4">Your first quest is waiting.</h2>
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

      <footer style={{ borderTop: '1px solid rgba(59,130,246,0.1)' }} className="py-6 text-center text-xs text-slate-400">
        <div className="flex items-center justify-center gap-5">
          <Link href="/privacy" className="hover:text-navy-200 transition-colors">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-navy-200 transition-colors">Terms of Service</Link>
          <a href="mailto:stevenluong05@gmail.com" className="hover:text-navy-200 transition-colors">Contact</a>
        </div>
      </footer>

      <style jsx global>{`
        @keyframes rise {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: none; }
        }
        .rise   { animation: rise 0.6s ease both; }
        .rise-1 { animation-delay: 0.05s; }
        .rise-2 { animation-delay: 0.15s; }
        .rise-3 { animation-delay: 0.3s; }
        .rise-4 { animation-delay: 0.45s; }
        .rise-5 { animation-delay: 0.6s; }

        @keyframes floaty {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-7px); }
        }
        .float-slow   { animation: floaty 4s ease-in-out infinite; }
        .float-slower { animation: floaty 5.5s ease-in-out 0.8s infinite; }
      `}</style>
    </div>
  );
}
