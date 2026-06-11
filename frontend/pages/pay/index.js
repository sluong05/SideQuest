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
          className="inline-flex items-center gap-1.5 text-xs font-semibold transition-colors mb-4"
          style={{ color: '#64748b' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#94a3b8'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#64748b'; }}
        >
          <Icon name="arrowLeft" className="w-3.5 h-3.5" color="currentColor" />
          Back to Debt Hub
        </Link>

        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#f8fafc' }}>Pay Off Debt</h1>
          <p className="text-sm mt-1" style={{ color: '#64748b' }}>
            {totalOwed > 0 ? (
              <>You have <span className="font-bold" style={{ color: '#f87171' }}>{totalOwed} debt points</span> to pay off. Choose how you want to clear them.</>
            ) : (
              <>You're debt-free — but you can still log work. Surplus points become <span className="font-bold" style={{ color: '#fbbf24' }}>coins</span>.</>
            )}
          </p>
        </div>

        <div className="space-y-2.5">
          {PAYOFF_METHODS.map((m) => (
            <Link
              key={m.id}
              href={m.href}
              className="group flex items-center gap-3.5 px-4 py-3.5 rounded-2xl transition-all duration-150"
              style={{ background: 'rgba(8,21,37,0.75)', border: '1px solid rgba(59,130,246,0.14)' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = m.border.replace('0.3)', '0.55)'); e.currentTarget.style.boxShadow = `0 0 16px ${m.bg}`; e.currentTarget.style.background = 'rgba(11,27,45,0.9)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(59,130,246,0.14)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.background = 'rgba(8,21,37,0.75)'; }}
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
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: m.bg, color: m.color, border: `1px solid ${m.border}` }}
                  >
                    {m.rate}
                  </span>
                </div>
                <p className="text-[11px] mt-0.5" style={{ color: '#64748b' }}>{m.desc}</p>
              </div>
              <svg className="w-4 h-4 flex-shrink-0 transition-transform duration-150 group-hover:translate-x-0.5" style={{ color: '#475569' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>

        <p className="text-center text-[11px] mt-5" style={{ color: '#334155' }}>
          All methods pay down your oldest debt first.
        </p>
      </div>
    </Layout>
  );
}
