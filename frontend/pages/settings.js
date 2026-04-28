import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { changePassword, setUsername, getStreak } from '../lib/api';

export default function Settings() {
  const { user, loading: authLoading, updateUser } = useAuth();
  const router = useRouter();
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    if (!authLoading && !user) router.push('/welcome');
  }, [user, authLoading]);

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

        </div>
      </div>
    </Layout>
  );
}
