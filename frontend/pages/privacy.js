import Link from 'next/link';
import Head from 'next/head';

export default function Privacy() {
  return (
    <>
      <Head>
        <title>Privacy Policy — SideQuest</title>
      </Head>
      <div className="min-h-screen bg-navy-600 text-navy-50">
        <header className="border-b border-blue-500/20 bg-navy-800/80 backdrop-blur-md sticky top-0 z-50">
          <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
            <Link href="/welcome">
              <img src="/logo.png" alt="SideQuest" className="h-8 w-auto" />
            </Link>
            <Link href="/signup" className="text-sm text-blue-400 hover:text-blue-300 font-semibold transition-colors">
              Sign Up
            </Link>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-4 py-12">
          <h1 className="text-3xl font-bold text-navy-50 mb-2">Privacy Policy</h1>
          <p className="text-navy-400 text-sm mb-10">Last updated: May 13, 2025</p>

          <Section title="1. Who We Are">
            <p>SideQuest is operated by Steven Luong ("we," "us," or "our"), an individual based in Washington, United States. You can reach us at <a href="mailto:stevenluong05@gmail.com" className="text-blue-400 hover:underline">stevenluong05@gmail.com</a>.</p>
          </Section>

          <Section title="2. What We Collect">
            <p className="mb-3">We collect the following information when you use SideQuest:</p>
            <ul className="list-disc list-inside space-y-1.5 text-navy-200">
              <li><strong className="text-navy-50">Account information</strong> — email address, username, and password (stored as a one-way hash; we never see your plaintext password).</li>
              <li><strong className="text-navy-50">Profile information</strong> — optional profile photo and bio that you choose to provide.</li>
              <li><strong className="text-navy-50">Tasks and activity</strong> — the tasks you create, their due dates, completion status, and pushup session history.</li>
              <li><strong className="text-navy-50">Social data</strong> — friend connections and challenge history between users.</li>
              <li><strong className="text-navy-50">Push notification subscription</strong> — if you opt in, browser-generated keys used to deliver notifications. You can revoke this at any time through your browser settings.</li>
              <li><strong className="text-navy-50">Timezone</strong> — detected automatically from your browser to correctly calculate due dates and streaks.</li>
            </ul>
          </Section>

          <Section title="3. Camera and Video">
            <p>The pushup verification feature uses your device camera. <strong className="text-navy-50">Video is processed entirely on your device</strong> using MediaPipe Pose and is never sent to our servers. We do not record, store, or transmit any video or images from your camera.</p>
          </Section>

          <Section title="4. How We Use Your Information">
            <ul className="list-disc list-inside space-y-1.5 text-navy-200">
              <li>To provide and operate the SideQuest service.</li>
              <li>To send password reset emails when requested.</li>
              <li>To send optional email reminders about overdue tasks (only if you enable this in your settings).</li>
              <li>To show your progress and rank on the leaderboard.</li>
              <li>We do not sell, rent, or share your personal information with third parties for their marketing purposes.</li>
            </ul>
          </Section>

          <Section title="5. Third-Party Services">
            <p className="mb-3">We use the following third-party services to operate SideQuest:</p>
            <ul className="list-disc list-inside space-y-1.5 text-navy-200">
              <li><strong className="text-navy-50">Resend</strong> — used to deliver transactional emails (password reset, reminders). Your email address is passed to Resend solely for this purpose.</li>
              <li><strong className="text-navy-50">Railway</strong> — our backend server and database are hosted on Railway. Your data is stored on Railway's infrastructure.</li>
              <li><strong className="text-navy-50">Vercel</strong> — our frontend is hosted on Vercel.</li>
              <li><strong className="text-navy-50">Google CDN (MediaPipe)</strong> — the pushup detection library is loaded from Google's CDN in your browser. No data is sent to Google from this interaction.</li>
            </ul>
          </Section>

          <Section title="6. Data Retention">
            <p>We retain your data for as long as your account is active. Completed tasks are automatically purged from our system after 7 days. You can permanently delete your account and all associated data at any time from your profile settings.</p>
          </Section>

          <Section title="7. Children's Privacy">
            <p>SideQuest is not directed at children under 13. If we become aware that a child under 13 has created an account, we will delete it promptly. If you believe a child under 13 is using this service, please contact us at <a href="mailto:stevenluong05@gmail.com" className="text-blue-400 hover:underline">stevenluong05@gmail.com</a>.</p>
          </Section>

          <Section title="8. Your Rights">
            <p className="mb-3">You have the right to:</p>
            <ul className="list-disc list-inside space-y-1.5 text-navy-200">
              <li>Access the personal data we hold about you.</li>
              <li>Correct inaccurate data via your profile settings.</li>
              <li>Delete your account and all associated data at any time from your profile settings.</li>
              <li>Opt out of email reminders at any time in your notification settings.</li>
            </ul>
            <p className="mt-3">To make any other data request, email us at <a href="mailto:stevenluong05@gmail.com" className="text-blue-400 hover:underline">stevenluong05@gmail.com</a>.</p>
          </Section>

          <Section title="9. Security">
            <p>Passwords are hashed using bcrypt before storage. All data is transmitted over HTTPS. We take reasonable measures to protect your information, but no internet service can guarantee absolute security.</p>
          </Section>

          <Section title="10. Changes to This Policy">
            <p>We may update this policy occasionally. If we make material changes, we will update the date at the top of this page. Continued use of the service after changes are posted constitutes your acceptance of the updated policy.</p>
          </Section>

          <Section title="11. Contact">
            <p>Questions about this policy? Email us at <a href="mailto:stevenluong05@gmail.com" className="text-blue-400 hover:underline">stevenluong05@gmail.com</a>.</p>
          </Section>

          <div className="mt-10 pt-6 border-t border-navy-500 flex gap-6 text-sm text-navy-400">
            <Link href="/terms" className="hover:text-navy-200 transition-colors">Terms of Service</Link>
            <Link href="/welcome" className="hover:text-navy-200 transition-colors">Back to Home</Link>
          </div>
        </main>
      </div>
    </>
  );
}

function Section({ title, children }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-navy-50 mb-3">{title}</h2>
      <div className="text-navy-200 leading-relaxed text-sm space-y-2">
        {children}
      </div>
    </section>
  );
}
