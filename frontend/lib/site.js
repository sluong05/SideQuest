import Head from 'next/head';

// Site-wide constants. Everything public-facing (OG tags, share links, contact
// email, App Store links) derives from NEXT_PUBLIC_SITE_URL so the production
// domain can change without touching code.

const RAW_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://pushupdebt.com';

export const SITE_URL = RAW_SITE_URL.replace(/\/+$/, '');

export const SITE_HOST = (() => {
  try {
    return new URL(SITE_URL).hostname.replace(/^www\./, '');
  } catch {
    return 'pushupdebt.com';
  }
})();

export const SITE_NAME = 'SideQuest';
export const SUPPORT_EMAIL = `support@${SITE_HOST}`;

export const DEFAULT_TITLE = 'SideQuest — Miss a deadline? You owe pushups.';
export const DEFAULT_DESCRIPTION =
  'SideQuest turns your goals into quests with real deadlines. Miss one and you owe debt — pay it off with pushups, focus time or chores. Earn XP, keep your streak and compete with friends.';

export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;

// App Store
export const APP_STORE_ID = String(process.env.NEXT_PUBLIC_APP_STORE_ID || '')
  .trim()
  .replace(/^id/i, '');
export const APP_STORE_URL = APP_STORE_ID
  ? `https://apps.apple.com/app/id${APP_STORE_ID}`
  : 'https://apps.apple.com/us/search?term=sidequest%20pushups';

export function absoluteUrl(path = '/') {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export function profileUrl(username) {
  return absoluteUrl(`/u/${encodeURIComponent(username)}`);
}

export function joinUrl({ ref, challenge } = {}) {
  const params = new URLSearchParams();
  if (ref) params.set('ref', ref);
  if (challenge) params.set('challenge', challenge);
  const qs = params.toString();
  return absoluteUrl(`/join${qs ? `?${qs}` : ''}`);
}

// ── Per-page meta ───────────────────────────────────────────────────────────
// Rendered through next/head with stable keys so later instances override
// earlier ones (e.g. a default in _app could be overridden by a page).

export function PageMeta({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  path,
  image = DEFAULT_OG_IMAGE,
  noindex = false,
  type = 'website',
}) {
  const fullTitle = title === DEFAULT_TITLE || /SideQuest/.test(title) ? title : `${title} — SideQuest`;
  const url = path ? absoluteUrl(path) : null;
  const img = absoluteUrl(image);
  return (
    <Head>
      <title key="title">{fullTitle}</title>
      <meta key="description" name="description" content={description} />
      {noindex && <meta key="robots" name="robots" content="noindex, nofollow" />}
      {url && <link key="canonical" rel="canonical" href={url} />}
      <meta key="og:type" property="og:type" content={type} />
      <meta key="og:title" property="og:title" content={fullTitle} />
      <meta key="og:description" property="og:description" content={description} />
      <meta key="og:image" property="og:image" content={img} />
      <meta key="og:image:width" property="og:image:width" content="1200" />
      <meta key="og:image:height" property="og:image:height" content="630" />
      {url && <meta key="og:url" property="og:url" content={url} />}
      <meta key="twitter:title" name="twitter:title" content={fullTitle} />
      <meta key="twitter:description" name="twitter:description" content={description} />
      <meta key="twitter:image" name="twitter:image" content={img} />
    </Head>
  );
}
