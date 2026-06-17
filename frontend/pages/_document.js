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
        <meta name="apple-mobile-web-app-title" content="SideQuest" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

        {/* Theme */}
        <meta name="theme-color" content="#080F20" />
        <meta name="msapplication-TileColor" content="#080F20" />

        {/* SEO */}
        <meta name="description" content="Turn your life into side quests. Set goals with deadlines, build debt when you miss them, and pay it back to level up." />

        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="SideQuest" />
        <meta property="og:title" content="SideQuest — Turn Your Life Into Side Quests" />
        <meta property="og:description" content="Create quests, miss deadlines and owe debt, pay it back, earn XP and level up. Accountability that actually works." />
        <meta property="og:image" content="https://pushupdebt.com/og-image.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:url" content="https://pushupdebt.com" />

        {/* Twitter / X */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="SideQuest — Turn Your Life Into Side Quests" />
        <meta name="twitter:description" content="Create quests, miss deadlines and owe debt, pay it back, earn XP and level up." />
        <meta name="twitter:image" content="https://pushupdebt.com/og-image.png" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
