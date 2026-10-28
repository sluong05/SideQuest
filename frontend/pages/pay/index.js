import Link from 'next/link';
import Layout from '../../components/Layout';
import { Icon } from '../../components/Icons';
import { usePayoff, PAYOFF_METHODS } from '../../components/PayoffShell';

export default function PayDebtChooser() {
  const { user, authLoading, totalOwed, streak } = usePayoff();

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#050A14' }}>
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Layout streak={streak}>
      <div className="max-w-xl mx-auto">
        <Link
          href="/debt"
          className="sq-link-muted inline-flex items-center gap-1.5 min-h-[44px] text-xs font-semibold transition-colors mb-2"
        >
          <Icon name="arrowLeft" className="w-3.5 h-3.5" color="currentColor" />
          Back to Debt Hub
        </Link>

        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#f8fafc' }}>Pay Off Debt</h1>
          <p className="text-sm mt-1" style={{ color: '#94A3B8' }}>
            {totalOwed > 0 ? (
              <>You have <span className="font-bold" style={{ color: '#f87171' }}>{totalOwed} debt points</span> to pay off. Every 5 pts you repay earns a <span className="font-bold" style={{ color: '#fbbf24' }}>coin</span>.</>
            ) : (
              <>You're debt-free — but you can still log work. Every point becomes a <span className="font-bold" style={{ color: '#fbbf24' }}>coin</span>.</>
            )}
          </p>
        </div>

        <div className="space-y-2.5">
          {PAYOFF_METHODS.map((m) => (
            <Link
              key={m.id}
              href={m.href}
              className="sq-method-card group flex items-center gap-3.5 px-4 py-3.5 min-h-[64px] rounded-2xl transition-all duration-150"
              style={{
                '--m-bg-base': 'rgba(8,21,37,0.75)',
                '--m-border-base': 'rgba(59,130,246,0.14)',
                '--m-bg-hover': 'rgba(11,27,45,0.9)',
                '--m-border-hover': m.border.replace('0.3)', '0.55)'),
                '--m-glow': m.bg,
              }}
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: m.bg, border: `1px solid ${m.border}` }}
              >
                <Icon name={m.icon} className="w-5 h-5" color={m.color} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold" style={{ color: '#f8fafc' }}>{m.label}</p>
                  <span
                    className="text-[11px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: m.bg, color: m.color, border: `1px solid ${m.border}` }}
                  >
                    {m.rate}
                  </span>
                </div>
                <p className="text-[11px] mt-0.5" style={{ color: '#94A3B8' }}>{m.desc}</p>
              </div>
              <svg className="w-4 h-4 flex-shrink-0 transition-transform duration-150 group-hover:translate-x-0.5" style={{ color: '#475569' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>

        <p className="text-center text-[11px] mt-5" style={{ color: '#94A3B8' }}>
          All methods pay down your oldest debt first. Every point repaid also earns 1 XP.
        </p>
      </div>
    </Layout>
  );
}
