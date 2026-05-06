import { Html, Head, Main, NextScript } from 'next/document';

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
        <meta name="apple-mobile-web-app-title" content="PushupDebt" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

        {/* Theme */}
        <meta name="theme-color" content="#0f172a" />
        <meta name="msapplication-TileColor" content="#0f172a" />

        {/* SEO */}
        <meta name="description" content="Turn procrastination into gains. Miss a task deadline and owe pushups — pay them off with camera-verified reps." />

        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="PushupDebt" />
        <meta property="og:title" content="PushupDebt — Turn procrastination into gains" />
        <meta property="og:description" content="Miss a task deadline and owe pushups. Pay them off with camera-verified reps. Compete with friends on the leaderboard." />
        <meta property="og:image" content="https://pushupdebt.com/og-image.svg" />
        <meta property="og:url" content="https://pushupdebt.com" />

        {/* Twitter / X */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="PushupDebt — Turn procrastination into gains" />
        <meta name="twitter:description" content="Miss a task deadline and owe pushups. Pay them off with camera-verified reps." />
        <meta name="twitter:image" content="https://pushupdebt.com/og-image.svg" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
