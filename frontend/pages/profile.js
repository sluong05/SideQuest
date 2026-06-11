import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { changePassword, setUsername, getStreak, deleteAccount, updateNotifications, updateProfile } from '../lib/api';
import { useNow } from '../lib/hooks';
import { usePush } from '../lib/usePush';
import { Icon } from '../components/Icons';

const BADGES = [
  { days: 3,   label: 'First Steps',  icon: <Icon name="sprout" className="w-6 h-6" color="#4ade80" /> },
  { days: 7,   label: 'One Week',     icon: <Icon name="bolt" className="w-6 h-6" color="#fbbf24" /> },
  { days: 14,  label: 'Two Weeks',    icon: <img src="/Streak.svg" className="w-8 h-8" /> },
  { days: 30,  label: 'One Month',    icon: <img src="/Bicep.svg" className="w-8 h-8" /> },
  { days: 60,  label: 'Two Months',   icon: <Icon name="dumbbell" className="w-6 h-6" color="#60a5fa" /> },
  { days: 100, label: 'Century',      icon: <Icon name="crown" className="w-6 h-6" color="#fbbf24" /> },
];

export default function Profile() {
  const { user, loading: authLoading, updateUser, logoutUser } = useAuth();
  const router = useRouter();
  const [streak, setStreak] = useState(0);
  const now = useNow();

  useEffect(() => {
    if (!authLoading && !user) router.push('/welcome');
  }, [user, authLoading]);

  useEffect(() => {
    if (!user) return;
    getStreak().then((r) => setStreak(r.data.streak)).catch(() => {});
  }, [user]);

  // ── Username form ────────────────────────────────────────────────────────
  const [usernameInput, setUsernameInput] = useState('');
  const [usernameMsg, setUsernameMsg] = useState(null);
  const [usernameSaving, setUsernameSaving] = useState(false);

  async function handleUsername(e) {
    e.preventDefault();
    setUsernameMsg(null);
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(usernameInput)) {
      setUsernameMsg({ type: 'error', text: '3–20 characters: letters, numbers, underscores only' });
      return;
    }
    setUsernameSaving(true);
    try {
      const res = await setUsername(usernameInput);
      updateUser(res.data.user);
      setUsernameMsg({ type: 'success', text: 'Username updated!' });
      setUsernameInput('');
    } catch (err) {
      setUsernameMsg({ type: 'error', text: err.response?.data?.error || 'Failed to save' });
    } finally {
      setUsernameSaving(false);
    }
  }

  // ── Password form ────────────────────────────────────────────────────────
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState(null);
  const [passwordSaving, setPasswordSaving] = useState(false);

  async function handlePassword(e) {
    e.preventDefault();
    setPasswordMsg(null);
    if (newPassword.length < 8) {
      setPasswordMsg({ type: 'error', text: 'Password must be at least 8 characters' });
      return;
    }
    if (!/[a-zA-Z]/.test(newPassword)) {
      setPasswordMsg({ type: 'error', text: 'Password must contain at least one letter' });
      return;
    }
    if (!/[0-9]/.test(newPassword)) {
      setPasswordMsg({ type: 'error', text: 'Password must contain at least one number' });
      return;
    }
    if (!/[^a-zA-Z0-9]/.test(newPassword)) {
      setPasswordMsg({ type: 'error', text: 'Password must contain at least one special character' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'New passwords do not match' });
      return;
    }
    setPasswordSaving(true);
    try {
      await changePassword(oldPassword, newPassword);
      setPasswordMsg({ type: 'success', text: 'Password changed successfully!' });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordMsg({ type: 'error', text: err.response?.data?.error || 'Failed to change password' });
    } finally {
      setPasswordSaving(false);
    }
  }

  // ── Avatar & bio ────────────────────────────────────────────────────────
  const [bioInput, setBioInput] = useState('');
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState(null);

  useEffect(() => {
    if (user) {
      setBioInput(user.bio || '');
      setAvatarPreview(user.avatar || null);
    }
  }, [user]);

  function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (ev) => {
      img.src = ev.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 200;
        const ctx = canvas.getContext('2d');
        const size = Math.min(img.width, img.height);
        const sx = (img.width - size) / 2;
        const sy = (img.height - size) / 2;
        ctx.drawImage(img, sx, sy, size, size, 0, 0, 200, 200);
        setAvatarPreview(canvas.toDataURL('image/jpeg', 0.82));
        setProfileMsg(null);
      };
    };
    reader.readAsDataURL(file);
  }

  async function handleSaveProfile(e) {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMsg(null);
    try {
      const res = await updateProfile(bioInput, avatarPreview);
      updateUser(res.data.user);
      setProfileMsg({ type: 'success', text: 'Profile updated!' });
    } catch (err) {
      setProfileMsg({ type: 'error', text: err.response?.data?.error || 'Failed to save' });
    } finally {
      setProfileSaving(false);
    }
  }

  // ── Push notifications ───────────────────────────────────────────────────
  const push = usePush();

  // ── Notifications ────────────────────────────────────────────────────────
  const [emailReminders, setEmailReminders] = useState(true);
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifMsg, setNotifMsg] = useState(null);

  useEffect(() => {
    if (user) setEmailReminders(user.emailReminders ?? true);
  }, [user]);

  async function handleToggleReminders() {
    const next = !emailReminders;
    setEmailReminders(next);
    setNotifSaving(true);
    setNotifMsg(null);
    try {
      const res = await updateNotifications(next);
      updateUser(res.data.user);
      setNotifMsg({ type: 'success', text: next ? 'Email reminders enabled.' : 'Email reminders disabled.' });
    } catch (err) {
      setEmailReminders(!next);
      setNotifMsg({ type: 'error', text: 'Failed to save preference.' });
    } finally {
      setNotifSaving(false);
    }
  }

  // ── Delete account ───────────────────────────────────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  async function handleDeleteAccount() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount();
      logoutUser();
    } catch (err) {
      setDeleteError(err.response?.data?.error || 'Failed to delete account. Try again.');
      setDeleting(false);
    }
  }

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-navy-600 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Layout streak={streak}>
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-navy-200 hover:text-navy-100 mb-2 transition-colors">
            ← Dashboard
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center flex-shrink-0">
              <span className="text-xl font-bold text-blue-400">
                {(user.username || user.email)[0].toUpperCase()}
              </span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-navy-50">{user.username || user.email}</h1>
              <p className="text-sm text-navy-300">
                Member since {new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6">

          {/* Avatar & bio */}
          <form onSubmit={handleSaveProfile} className="card p-5">
            <p className="text-xs text-navy-200 uppercase tracking-wide font-medium mb-4">Profile</p>
            <div className="flex items-start gap-5">
              {/* Avatar upload */}
              <label className="flex-shrink-0 cursor-pointer group relative">
                <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-navy-600 group-hover:border-blue-500/60 transition-colors">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-blue-500/20 flex items-center justify-center">
                      <span className="text-3xl font-bold text-blue-400">
                        {(user.username || user.email)[0].toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
                <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-white text-xs font-semibold">Change</span>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </label>

              {/* Bio */}
              <div className="flex-1">
                <label className="label">Bio</label>
                <textarea
                  className="input resize-none text-sm"
                  rows={3}
                  placeholder="A short intro — 160 characters max"
                  value={bioInput}
                  maxLength={160}
                  onChange={(e) => { setBioInput(e.target.value); setProfileMsg(null); }}
                />
                <p className="text-xs text-slate-400 mt-1 text-right">{bioInput.length}/160</p>
              </div>
            </div>

            {profileMsg && (
              <p className={`text-sm px-3 py-2 rounded-lg border mt-3 ${
                profileMsg.type === 'success'
                  ? 'text-green-400 bg-green-900/20 border-green-800'
                  : 'text-red-400 bg-red-900/20 border-red-800'
              }`}>
                {profileMsg.text}
              </p>
            )}
            <button type="submit" disabled={profileSaving} className="btn-primary w-full py-2.5 mt-4">
              {profileSaving ? 'Saving…' : 'Save Profile'}
            </button>
          </form>

          {/* Badges */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-navy-200 uppercase tracking-wide font-medium">Streak Badges</p>
              {user.maxStreak > 0 && (
                <span className="text-xs text-slate-400">Best streak: <span className="text-blue-400 font-semibold">{user.maxStreak} days</span></span>
              )}
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {BADGES.map((badge) => {
                const earned = (user.maxStreak ?? 0) >= badge.days;
                return (
                  <div
                    key={badge.days}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${
                      earned
                        ? 'bg-blue-600/10 border-blue-500/40'
                        : 'bg-navy-700/40 border-navy-600 opacity-40'
                    }`}
                  >
                    <span className={earned ? '' : 'grayscale opacity-60'}>{badge.icon}</span>
                    <span className={`text-xs font-bold tabular-nums ${earned ? 'text-blue-400' : 'text-slate-400'}`}>
                      {badge.days}d
                    </span>
                    <span className={`text-xs text-center leading-tight ${earned ? 'text-navy-200' : 'text-slate-500'}`}>
                      {badge.label}
                    </span>
                    {earned && (
                      <span className="text-xs text-green-400 font-bold">✓</span>
                    )}
                  </div>
                );
              })}
            </div>
            {(user.maxStreak ?? 0) === 0 && (
              <p className="text-xs text-slate-400 mt-3 text-center">
                Complete all your tasks today to start earning badges.
              </p>
            )}
            {streak > 0 && (
              <p className="text-xs text-slate-400 mt-3 text-center">
                Current streak: <span className="text-blue-400 font-semibold">{streak} days</span>
              </p>
            )}
          </div>

          {/* Account info */}
          <div className="card p-5">
            <p className="text-xs text-navy-200 uppercase tracking-wide font-medium mb-3">Account</p>
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-navy-300">Email</span>
                <span className="text-navy-100">{user.email}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-navy-300">Username</span>
                <span className={user.username ? 'text-navy-100' : 'text-slate-400 italic'}>
                  {user.username || 'not set'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-navy-300">Timezone</span>
                <span className="text-navy-100">{user.timezone || 'UTC'}</span>
              </div>
              <div className="flex justify-between text-sm items-center">
                <span className="text-navy-300">Local Time</span>
                <span className="text-navy-100 font-mono tabular-nums">
                  {now
                    ? new Intl.DateTimeFormat('en-US', {
                        timeZone: user.timezone || 'UTC',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      }).format(now)
                    : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Notifications */}
          <div className="card p-5">
            <p className="text-xs text-navy-200 uppercase tracking-wide font-medium mb-4">Notifications</p>
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-navy-100">Email reminders</p>
                <p className="text-xs text-navy-300 mt-0.5">
                  Get notified when tasks are due soon and receive a nightly summary of your debt and progress.
                </p>
              </div>
              <button
                role="switch"
                aria-checked={emailReminders}
                onClick={handleToggleReminders}
                disabled={notifSaving}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                  emailReminders ? 'bg-blue-600' : 'bg-navy-600 border border-navy-500'
                } ${notifSaving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                    emailReminders ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            {push.supported && push.permission !== 'denied' && (
              <div className="flex items-center justify-between gap-4 mt-4 pt-4 border-t border-navy-700">
                <div className="flex-1">
                  <p className="text-sm font-medium text-navy-100">Push notifications</p>
                  <p className="text-xs text-navy-300 mt-0.5">
                    {push.permission === 'denied'
                      ? 'Blocked by browser — enable in site settings.'
                      : 'Get alerts even when the tab is closed.'}
                  </p>
                </div>
                <button
                  role="switch"
                  aria-checked={push.subscribed}
                  onClick={push.subscribed ? push.unsubscribe : push.subscribe}
                  disabled={push.loading}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                    push.subscribed ? 'bg-blue-600' : 'bg-navy-600 border border-navy-500'
                  } ${push.loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                      push.subscribed ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            )}
            {notifMsg && (
              <p className={`text-xs mt-3 ${notifMsg.type === 'error' ? 'text-red-400' : 'text-slate-400'}`}>
                {notifMsg.text}
              </p>
            )}
          </div>

          {/* Change username */}
          <div className="card p-5">
            <p className="text-xs text-navy-200 uppercase tracking-wide font-medium mb-4">
              {user.username ? 'Change Username' : 'Set Username'}
            </p>
            <form onSubmit={handleUsername} className="space-y-3">
              <div>
                <label className="label">New username</label>
                <input
                  type="text"
                  className="input"
                  placeholder={user.username || 'e.g. pushup_king'}
                  value={usernameInput}
                  onChange={(e) => { setUsernameInput(e.target.value); setUsernameMsg(null); }}
                  minLength={3}
                  maxLength={20}
                  required
                />
                <p className="text-xs text-navy-300 mt-1">3–20 characters · letters, numbers, underscores</p>
              </div>
              {usernameMsg && (
                <p className={`text-sm px-3 py-2 rounded-lg border ${
                  usernameMsg.type === 'success'
                    ? 'text-green-400 bg-green-900/20 border-green-800'
                    : 'text-red-400 bg-red-900/20 border-red-800'
                }`}>
                  {usernameMsg.text}
                </p>
              )}
              <button type="submit" disabled={usernameSaving} className="btn-primary w-full py-2.5">
                {usernameSaving ? 'Saving…' : 'Save Username'}
              </button>
            </form>
          </div>

          {/* Change password */}
          <div className="card p-5">
            <p className="text-xs text-navy-200 uppercase tracking-wide font-medium mb-4">Change Password</p>
            <form onSubmit={handlePassword} className="space-y-3">
              <div>
                <label className="label">Current password</label>
                <input
                  type="password"
                  className="input"
                  placeholder="••••••••"
                  value={oldPassword}
                  onChange={(e) => { setOldPassword(e.target.value); setPasswordMsg(null); }}
                  required
                />
              </div>
              <div>
                <label className="label">New password</label>
                <input
                  type="password"
                  className="input"
                  placeholder="Min. 6 characters"
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setPasswordMsg(null); }}
                  required
                  minLength={6}
                />
              </div>
              <div>
                <label className="label">Confirm new password</label>
                <input
                  type="password"
                  className="input"
                  placeholder="Repeat new password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setPasswordMsg(null); }}
                  required
                />
              </div>
              {passwordMsg && (
                <p className={`text-sm px-3 py-2 rounded-lg border ${
                  passwordMsg.type === 'success'
                    ? 'text-green-400 bg-green-900/20 border-green-800'
                    : 'text-red-400 bg-red-900/20 border-red-800'
                }`}>
                  {passwordMsg.text}
                </p>
              )}
              <button type="submit" disabled={passwordSaving} className="btn-primary w-full py-2.5">
                {passwordSaving ? 'Saving…' : 'Change Password'}
              </button>
            </form>
          </div>

          {/* Danger zone */}
          <div className="card p-5 border-red-800/40" style={{ borderLeft: '2px solid rgba(239,68,68,0.4)' }}>
            <p className="text-xs text-red-400 uppercase tracking-wide font-medium mb-1">Danger Zone</p>
            <p className="text-sm text-navy-300 mb-4">
              Permanently delete your account and all data. This cannot be undone.
            </p>
            <button onClick={() => setShowDeleteModal(true)} className="btn-danger text-sm py-2 px-4">
              Delete Account
            </button>
          </div>

        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !deleting && setShowDeleteModal(false)}
          />
          <div className="relative bg-navy-800 border border-navy-600 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="mb-3"><Icon name="alert" className="w-6 h-6" color="#f87171" /></div>
            <h2 className="text-lg font-bold text-navy-50 mb-2">Delete your account?</h2>
            <p className="text-sm text-navy-300 mb-6">
              This will permanently delete your account, all tasks, pushup history, and debt records.
              There is no way to recover this data.
            </p>
            {deleteError && (
              <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2 mb-4">
                {deleteError}
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                className="btn-secondary flex-1 py-2.5 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="btn-danger flex-1 py-2.5 text-sm"
              >
                {deleting ? 'Deleting…' : 'Yes, delete forever'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
