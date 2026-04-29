import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { changePassword, setUsername, getStreak, deleteAccount } from '../lib/api';

export default function Settings() {
  const { user, loading: authLoading, updateUser, logoutUser } = useAuth();
  const router = useRouter();
  const [streak, setStreak] = useState(0);
  const [now, setNow] = useState(null);

  useEffect(() => {
    if (!authLoading && !user) router.push('/welcome');
  }, [user, authLoading]);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!user) return;
    getStreak().then((r) => setStreak(r.data.streak)).catch(() => {});
  }, [user]);

  // ── Username form ────────────────────────────────────────────────────────
  const [usernameInput, setUsernameInput] = useState('');
  const [usernameMsg, setUsernameMsg]     = useState(null); // { type: 'success'|'error', text }
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

  // ── Password form ────────────────────────────────────────────────────────
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg]   = useState(null);
  const [passwordSaving, setPasswordSaving] = useState(false);

  async function handlePassword(e) {
    e.preventDefault();
    setPasswordMsg(null);
    if (newPassword.length < 6) {
      setPasswordMsg({ type: 'error', text: 'New password must be at least 6 characters' });
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

  if (authLoading || (!user && !authLoading)) {
    return (
      <div className="min-h-screen bg-navy-600 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Layout streak={streak}>
      <div className="max-w-lg mx-auto">
        <div className="mb-6">
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-navy-200 hover:text-navy-100 mb-2 transition-colors">
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-navy-50">Settings</h1>
        </div>

        <div className="space-y-6">

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
                <span className={user.username ? 'text-navy-100' : 'text-navy-400 italic'}>
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
            <button
              onClick={() => setShowDeleteModal(true)}
              className="btn-danger text-sm py-2 px-4"
            >
              Delete Account
            </button>
          </div>

        </div>
      </div>

      {/* Confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !deleting && setShowDeleteModal(false)}
          />
          <div className="relative bg-navy-800 border border-navy-600 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <p className="text-2xl mb-3">⚠️</p>
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
