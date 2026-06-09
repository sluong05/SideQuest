import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { verifyEmail } from '../lib/api';

export default function VerifyEmail() {
  const router = useRouter();
  const { token } = router.query;
  const [status, setStatus] = useState('loading'); // 'loading' | 'success' | 'error'
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!router.isReady) return;
    if (!token) {
      setStatus('error');
      setMessage('No verification token found. Check that you copied the full link from your email.');
      return;
    }

    verifyEmail(token)
      .then(() => setStatus('success'))
      .catch((err) => {
        setStatus('error');
        setMessage(err.response?.data?.error || 'Verification failed. The link may be invalid or already used.');
      });
  }, [router.isReady, token]);

  return (
    <div className="min-h-screen bg-navy-600 flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <Link href="/" className="inline-block mb-8">
          <div className="flex items-center justify-center gap-2 mb-3"><svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M14 2L17.5 9.5L26 10.5L20 16.5L21.5 25L14 21L6.5 25L8 16.5L2 10.5L10.5 9.5L14 2Z" fill="#3B82F6" opacity="0.9"/><circle cx="14" cy="13" r="3" fill="white" opacity="0.9"/></svg><span style={{fontSize:"1.1rem",fontWeight:"bold",letterSpacing:"0.05em",color:"#F8FAFC"}}>SIDEQUEST</span></div>
        </Link>

        {status === 'loading' && (
          <div className="card py-10">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-navy-200 text-sm">Verifying your email…</p>
          </div>
        )}

        {status === 'success' && (
          <div className="card py-10">
            <p className="text-4xl mb-4">✅</p>
            <h1 className="text-xl font-bold text-navy-50 mb-2">Email verified!</h1>
            <p className="text-navy-300 text-sm mb-6">You're all set. Your account is fully verified.</p>
            <Link href="/" className="btn-primary text-sm py-2.5 px-8">
              Go to Dashboard
            </Link>
          </div>
        )}

        {status === 'error' && (
          <div className="card py-10">
            <p className="text-4xl mb-4">❌</p>
            <h1 className="text-xl font-bold text-navy-50 mb-2">Verification failed</h1>
            <p className="text-navy-300 text-sm mb-6">{message}</p>
            <Link href="/" className="btn-primary text-sm py-2.5 px-8">
              Back to App
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
