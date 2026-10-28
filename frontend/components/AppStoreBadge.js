import { APP_STORE_URL } from '../lib/site';
import { track } from '../lib/analytics';

// "Download on the App Store" badge. Links to the app when
// NEXT_PUBLIC_APP_STORE_ID is set, otherwise to an App Store search.
export default function AppStoreBadge({ source = 'unknown', size = 'md', className = '' }) {
  const h = size === 'sm' ? 40 : 48;
  return (
    <a
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => track('app_store_click', { source })}
      className={`inline-flex items-center gap-2.5 rounded-xl px-4 transition-transform hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${className}`}
      style={{ height: h, background: '#000', border: '1px solid rgba(255,255,255,0.35)', color: '#fff' }}
      aria-label="Download SideQuest on the App Store"
    >
      <svg viewBox="0 0 24 24" width={size === 'sm' ? 20 : 24} height={size === 'sm' ? 20 : 24} fill="currentColor" aria-hidden="true">
        <path d="M16.37 12.62c-.02-2.3 1.88-3.4 1.97-3.46-1.07-1.57-2.74-1.78-3.33-1.8-1.42-.14-2.77.83-3.49.83-.72 0-1.83-.81-3.01-.79-1.55.02-2.98.9-3.78 2.29-1.61 2.8-.41 6.94 1.16 9.21.77 1.11 1.68 2.36 2.88 2.31 1.16-.05 1.6-.75 3-.75 1.4 0 1.79.75 3.01.73 1.25-.02 2.04-1.13 2.8-2.25.88-1.29 1.24-2.54 1.26-2.6-.03-.01-2.42-.93-2.47-3.72zM14.08 5.87c.64-.78 1.07-1.85.95-2.92-.92.04-2.03.61-2.69 1.38-.59.68-1.11 1.77-.97 2.82 1.03.08 2.07-.52 2.71-1.28z" />
      </svg>
      <span className="flex flex-col leading-none text-left">
        <span className="text-[10px] font-medium tracking-wide opacity-90">Download on the</span>
        <span className={`${size === 'sm' ? 'text-base' : 'text-lg'} font-semibold -mt-0.5`}>App Store</span>
      </span>
    </a>
  );
}
