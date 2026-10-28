import { Html, Head, Main, NextScript } from 'next/document';
import { SITE_NAME, APP_STORE_ID } from '../lib/site';

// Site-wide tags only. Page-specific title / description / OG / canonical are
// set per page via <PageMeta> (lib/site.js) so they never duplicate here.
export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* Fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="true" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />

        {/* PWA manifest */}
        <link rel="manifest" href="/manifest.json" />

        {/* Favicon */}
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <link rel="icon" type="image/svg+xml" href="/icon.svg" />

        {/* iOS / Apple PWA */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="SideQuest" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

        {/* Smart App Banner (Safari on iOS) — only once the App Store id is configured */}
        {APP_STORE_ID && <meta name="apple-itunes-app" content={`app-id=${APP_STORE_ID}`} />}

        {/* Theme */}
        <meta name="theme-color" content="#080F20" />
        <meta name="msapplication-TileColor" content="#080F20" />

        {/* Open Graph / Twitter — site-wide constants */}
        <meta property="og:site_name" content={SITE_NAME} />
        <meta property="og:locale" content="en_US" />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
