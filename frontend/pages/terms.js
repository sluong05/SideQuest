import Link from 'next/link';
import Head from 'next/head';

export default function Terms() {
  return (
    <>
      <Head>
        <title>Terms of Service — SideQuest</title>
      </Head>
      <div className="min-h-screen bg-navy-600 text-navy-50">
        <header className="border-b border-blue-500/20 bg-navy-800/80 backdrop-blur-md sticky top-0 z-50">
          <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
            <Link href="/welcome">
              <img src="/sidequest-logo-navbar.svg" alt="SideQuest" className="h-8 w-auto" />
            </Link>
            <Link href="/signup" className="text-sm text-blue-400 hover:text-blue-300 font-semibold transition-colors">
              Sign Up
            </Link>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-4 py-12">
          <h1 className="text-3xl font-bold text-navy-50 mb-2">Terms of Service</h1>
          <p className="text-slate-400 text-sm mb-10">Last updated: May 13, 2025</p>

          <Section title="1. Acceptance of Terms">
            <p>By accessing or using SideQuest ("the Service"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service. The Service is operated by Steven Luong, an individual based in Washington, United States.</p>
          </Section>

          <Section title="2. Description of Service">
            <p>SideQuest is a free productivity app that lets users set quests with due dates, tracks missed deadlines as quest debt, and lets users pay it off through verified activities such as camera-verified pushups. Features include quest management, leaderboards, friend connections, streaks, and a coin-based shop. The Service is provided free of charge.</p>
          </Section>

          <Section title="3. Eligibility">
            <p>You must be at least 13 years old to use SideQuest. By creating an account, you confirm that you meet this requirement. We reserve the right to terminate accounts found to belong to users under 13.</p>
          </Section>

          <Section title="4. Your Account">
            <ul className="list-disc list-inside space-y-1.5 text-navy-200">
              <li>You are responsible for keeping your login credentials secure.</li>
              <li>You are responsible for all activity that occurs under your account.</li>
              <li>You must provide a valid email address. Accounts created with false information may be removed.</li>
              <li>You may not create multiple accounts to circumvent restrictions or abuse the Service.</li>
            </ul>
          </Section>

          <Section title="5. Acceptable Use">
            <p className="mb-3">You agree not to:</p>
            <ul className="list-disc list-inside space-y-1.5 text-navy-200">
              <li>Use the Service for any unlawful purpose.</li>
              <li>Attempt to access, tamper with, or disrupt the Service's servers or infrastructure.</li>
              <li>Reverse engineer, scrape, or extract data from the Service in an automated manner without permission.</li>
              <li>Harass, abuse, or harm other users through the social features of the Service.</li>
              <li>Upload content (such as profile photos or bios) that is offensive, illegal, or infringes on others' rights.</li>
            </ul>
          </Section>

          <Section title="6. User Content">
            <p>You retain ownership of content you submit (quests, bio, profile photo). By submitting content, you grant us a limited license to store and display it as necessary to operate the Service. We do not claim ownership of your content and will not use it for any purpose beyond operating the Service.</p>
          </Section>

          <Section title="7. Coins and Shop">
            <p>Coins are an in-app reward earned through payoff activity. They have no monetary value, cannot be transferred between accounts, and cannot be exchanged for real currency. We reserve the right to modify, reset, or remove coin balances and shop items at any time without notice.</p>
          </Section>

          <Section title="8. Camera Access">
            <p>The pushup verification feature requests access to your camera. Camera data is processed entirely on your device and is never transmitted to our servers. Granting camera access is optional — you can still use all other features without it.</p>
          </Section>

          <Section title="9. Service Availability">
            <p>We provide the Service on an "as is" and "as available" basis. We do not guarantee that the Service will be uninterrupted, error-free, or available at all times. We may modify, suspend, or discontinue any part of the Service at any time without notice.</p>
          </Section>

          <Section title="10. Termination">
            <p>You may delete your account at any time from your profile settings, which permanently removes all your data. We reserve the right to suspend or terminate accounts that violate these Terms, at our sole discretion.</p>
          </Section>

          <Section title="11. Disclaimer of Warranties">
            <p>THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT. SIDEQUEST DOES NOT WARRANT THAT THE SERVICE WILL BE SECURE, ERROR-FREE, OR FREE OF VIRUSES.</p>
          </Section>

          <Section title="12. Limitation of Liability">
            <p>TO THE FULLEST EXTENT PERMITTED BY LAW, STEVEN LUONG SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE SERVICE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. IN NO EVENT SHALL OUR TOTAL LIABILITY EXCEED $0, AS THE SERVICE IS PROVIDED FREE OF CHARGE.</p>
          </Section>

          <Section title="13. Physical Activity Disclaimer">
            <p>SideQuest encourages physical exercise. By using the Service, you acknowledge that you are responsible for assessing your own physical fitness before performing pushups or any other exercise. We are not liable for any injury resulting from physical activity performed in connection with the Service. If you have any health conditions, consult a medical professional before starting an exercise program.</p>
          </Section>

          <Section title="14. Governing Law">
            <p>These Terms are governed by the laws of the State of Washington, United States, without regard to its conflict of law provisions. Any disputes arising from these Terms or the Service shall be resolved in the courts of Washington State.</p>
          </Section>

          <Section title="15. Changes to These Terms">
            <p>We may update these Terms from time to time. If we make material changes, we will update the date at the top of this page. Continued use of the Service after changes are posted constitutes your acceptance of the updated Terms.</p>
          </Section>

          <Section title="16. Contact">
            <p>Questions about these Terms? Email us at <a href="mailto:stevenluong05@gmail.com" className="text-blue-400 hover:underline">stevenluong05@gmail.com</a>.</p>
          </Section>

          <div className="mt-10 pt-6 border-t border-navy-500 flex gap-6 text-sm text-slate-400">
            <Link href="/privacy" className="hover:text-navy-200 transition-colors">Privacy Policy</Link>
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
