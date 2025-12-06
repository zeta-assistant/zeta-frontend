'use client';

import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasRecoverySession, setHasRecoverySession] = useState<boolean | null>(null);

  // On mount, check if we actually have a session from the recovery link
  useEffect(() => {
    const checkSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error('getSession error', error);
        setHasRecoverySession(false);
        return;
      }
      setHasRecoverySession(!!data.session);
    };

    checkSession();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatus(null);

    if (!password || !confirm) {
      setError('Please enter and confirm your new password.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    // Make sure we really have a recovery session
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      setLoading(false);
      setError(sessionError.message);
      return;
    }
    if (!sessionData.session) {
      setLoading(false);
      setError(
        'Auth session missing. Please open the password reset link directly from your email (in the same browser) and try again.'
      );
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    setLoading(false);

    if (updateError) {
      setError(updateError.message);
    } else {
      setStatus('Password updated. You can now log in with your new password.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white/5 border border-white/10 p-8 shadow-xl">
        <h1 className="text-2xl font-semibold text-white text-center mb-2">
          Reset your password
        </h1>
        <p className="text-sm text-slate-300 text-center mb-8">
          Enter a new password for your Pantheon account.
        </p>

        {hasRecoverySession === false && (
          <div className="mb-4 rounded-md border border-amber-400/60 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
            This page must be opened from the password reset link we emailed you.
            Go back to your email, click the link again, and make sure it opens in
            this browser.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-100 mb-1"
            >
              New password
            </label>
            <input
              id="password"
              type="password"
              className="w-full rounded-lg border border-slate-500/60 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/40"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <div>
            <label
              htmlFor="confirm"
              className="block text-sm font-medium text-slate-100 mb-1"
            >
              Confirm password
            </label>
            <input
              id="confirm"
              type="password"
              className="w-full rounded-lg border border-slate-500/60 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/40"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          {error && (
            <div className="rounded-md border border-red-400/60 bg-red-400/10 px-3 py-2 text-xs text-red-100">
              {error}
            </div>
          )}

          {status && (
            <div className="rounded-md border border-emerald-400/60 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-100">
              {status}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? 'Updating…' : 'Update password'}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-slate-300">
          <Link href="/login" className="text-blue-400 hover:underline">
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
