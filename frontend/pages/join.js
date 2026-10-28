import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import ParticleBackground from '../components/ParticleBackground';
import PublicProfileCard from '../components/PublicProfileCard';
import AppStoreBadge from '../components/AppStoreBadge';
import { Icon } from '../components/Icons';
import { PageMeta, SITE_URL, DEFAULT_DESCRIPTION } from '../lib/site';
import { fetchPublicProfile } from '../lib/publicProfile';
import { track, captureRef, storeInvite } from '../lib/analytics';

const CHALLENGE_RE = /^(pushups|quests)-(\d{1,2})$/;

function describeChallenge(challenge) {
  const m = CHALLENGE_RE.exec(challenge || '');
  if (!m) return null;
  const days = Number(m[2]);
  const what = m[1] === 'pushups' ? 'most pushups' : 'most quests completed';
  return `${what} in ${days} day${days === 1 ? '' : 's'}`;
}

function first(v) {
  return Array.isArray(v) ? v[0] : v;
}

export async function getServerSideProps({ query }) {
  const ref = typeof first(query.ref) === 'string' ? first(query.ref).slice(0, 40) : null;
  const rawChallenge = typeof first(query.challenge) === 'string' ? first(query.challenge).slice(0, 20) : null;
  const challenge = rawChallenge && CHALLENGE_RE.test(rawChallenge) ? rawChallenge : null;
  const inviter = ref ? await fetchPublicProfile(ref) : null;
  return { props: { inviteRef: inviter ? inviter.username : ref, challenge, inviter } };
}

export default function Join({ inviteRef = null, challenge = null, inviter = null }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const challengeText = describeChallenge(challenge);
  const name = inviter?.username || inviteRef;

  useEffect(() => {
    captureRef();
    if (inviteRef) storeInvite(inviteRef, challenge);
    track('invite_landing_view', { ref: inviteRef || undefined, challenge: challenge || undefined, inviterFound: !!inviter });
  }, []);

  const signupQuery = {};
  if (inviteRef) signupQuery.ref = inviteRef;
  if (challenge) signupQuery.challenge = challenge;

  const title = name
    ? (challengeText ? `${name} challenged you on SideQuest` : `${name} invited you to SideQuest`)
    : 'Join SideQuest';
  const description = name
    ? `${name} wants you on SideQuest${challengeText ? ` for a head-to-head: ${challengeText}` : ''}. Miss a deadline, owe pushups. Join free.`
    : DEFAULT_DESCRIPTION;
  const image = inviter ? `${SITE_URL}/api/og?username=${encodeURIComponent(inviter.username)}` : undefined;

  return (
    <div className="min-h-screen bg-navy-600 relative overflow-x-hidden">
      <PageMeta title={title} description={description} path="/join" {...(image ? { image } : {})} />
      <ParticleBackground />

      <header className="border-b bg-navy-700/80 backdrop-blur-md sticky top-0 z-50" style={{ borderColor: 'rgba(59,130,246,0.15)' }}>
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/welcome"><img src="/sidequest-logo-navbar.svg" alt="SideQuest" className="h-8 w-auto" /></Link>
          {!loading && !user && <Link href={{ pathname: '/login', query: signupQuery }} className="btn-ghost text-sm">Sign In</Link>}
        </div>
      </header>

      <main className="relative z-10 max-w-lg mx-auto px-4 py-10">
        <div className="text-center mb-6">
          {challengeText ? (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-4 text-xs font-semibold text-orange-400" style={{ background: 'rgba(234,88,12,0.1)', border: '1px solid rgba(234,88,12,0.3)' }}>
              <Icon name="swords" className="w-3.5 h-3.5" color="#fb923c" /> Challenge: {challengeText}
            </div>
          ) : null}
          <h1 className="text-3xl font-bold text-navy-50 mb-2">
            {name ? <>{name} wants you on SideQuest</> : 'Join SideQuest'}
          </h1>
          <p className="text-navy-200 text-sm leading-relaxed">
            Turn goals into quests with real deadlines. Miss one and you owe a little debt —
            pay it back with pushups, focus time or chores. Keep each other honest.
          </p>
        </div>

        {inviter && <div className="mb-6"><PublicProfileCard profile={inviter} /></div>}

        <div className="card">
          <ul className="space-y-2.5 mb-5 text-sm text-navy-100">
            {[
              { icon: 'users',  color: '#60a5fa', text: name ? `You'll be friends with ${name} automatically` : 'Add friends and see their progress' },
              { icon: 'coins',  color: '#fbbf24', text: name ? 'You both get bonus coins when you join' : 'Earn coins and XP for every quest' },
              { icon: 'swords', color: '#fb923c', text: challengeText ? 'The challenge is waiting for you to accept' : 'Challenge each other head-to-head' },
            ].map(({ icon, color, text }) => (
              <li key={text} className="flex items-center gap-2.5">
                <Icon name={icon} className="w-4 h-4 flex-shrink-0" color={color} /> {text}
              </li>
            ))}
          </ul>

          {user && !loading ? (
            <>
              <p className="text-sm text-navy-300 mb-3 text-center">You're already signed in.</p>
              <Link
                href={name ? `/u/${encodeURIComponent(name)}` : '/friends'}
                className="btn-primary w-full py-3 text-center inline-block font-semibold"
              >
                {name ? `View ${name}'s profile` : 'Go to Friends'}
              </Link>
            </>
          ) : (
            <>
              <Link
                href={{ pathname: '/signup', query: signupQuery }}
                onClick={() => track('invite_cta_clicked', { source: 'join', ref: inviteRef || undefined })}
                className="btn-primary w-full py-3 text-center inline-block font-semibold"
                style={{ boxShadow: '0 0 28px rgba(59,130,246,0.35)' }}
              >
                {challengeText ? 'Accept the challenge — join free' : 'Join free'}
              </Link>
              <p className="text-center text-xs text-slate-400 mt-3">
                Already have an account?{' '}
                <Link href={{ pathname: '/login', query: signupQuery }} className="text-blue-400 hover:text-blue-300">Sign in</Link>
              </p>
            </>
          )}
        </div>

        <div className="flex flex-col items-center gap-2 mt-6">
          <AppStoreBadge source="join" size="sm" />
          <p className="text-[11px] text-slate-500">Prefer the app? Sign up there — invites work in the browser.</p>
        </div>
      </main>
    </div>
  );
}
