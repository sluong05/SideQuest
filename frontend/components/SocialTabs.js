import Link from 'next/link';
import { useRouter } from 'next/router';
import { Icon } from './Icons';

const TABS = [
  { href: '/friends',     label: 'Friends', icon: 'users' },
  { href: '/leaderboard', label: 'Ranks',   icon: 'trophy' },
  { href: '/shop',        label: 'Shop',    icon: 'gift' },
];

// Segmented navigation shared by the social area pages.
export default function SocialTabs({ className = 'mb-5' }) {
  const { pathname } = useRouter();
  return (
    <nav
      aria-label="Social"
      className={`flex gap-1 p-1 rounded-xl max-w-md ${className}`}
      style={{ background: 'rgba(8,21,37,0.7)', border: '1px solid rgba(59,130,246,0.12)' }}
    >
      {TABS.map(({ href, label, icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-semibold rounded-lg transition-colors duration-150"
            style={{
              background: active ? 'rgba(37,99,235,0.85)' : 'transparent',
              color: active ? '#fff' : '#94a3b8',
              border: active ? '1px solid rgba(59,130,246,0.5)' : '1px solid transparent',
            }}
          >
            <Icon name={icon} className="w-4 h-4" color="currentColor" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
