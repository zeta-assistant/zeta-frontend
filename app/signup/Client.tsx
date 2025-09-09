'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

function scorePassword(pw: string) {
  let score = 0;
  if (pw.length >= 10) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (pw.length >= 16 && score < 4) score++;
  return Math.min(score, 4);
}

export default function Client() {
  const router = useRouter();
  const qs = useSearchParams();

  const [email, setEmail] = useState(qs.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [sent, setSent] = useState(false);
  const [resending, setResending] = useState(false);
  const [resentMsg, setResentMsg] = useState<string | null>(null);

  const pwScore = useMemo(() => scorePassword(password), [password]);

  const valid =
    email.trim().length > 5 &&
    password.length >= 10 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password) &&
    password === confirm;

  const redirectTo = useMemo(() => {
    if (typeof window === 'undefined') return undefined;
    return `${window.location.origin}/auth/confirm?next=/onboarding`;
  }, []);

  const handleSignup = async () => {
    setAuthError(null);
    setResentMsg(null);
    if (!valid || loading) return;
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectTo },
    });

    setLoading(false);
    if (error) {
      const msg = error.message?.toLowerCase() || '';
      if (msg.includes('already registered')) {
        setAuthError('That email is already registered. Try logging in instead.');
      } else {
        setAuthError(error.message);
      }
      return;
    }
    setSent(true);
  };

  const resendVerification = async () => {
    if (resending) return;
    setResending(true);
    setResentMsg(null);

    try {
      await fetch('/api/auth/resend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.NEXT_PUBLIC_RESEND_KEY
            ? { 'x-resend-key': process.env.NEXT_PUBLIC_RESEND_KEY as string }
            : {}),
        },
        body: JSON.stringify({ email }),
      });
      setResentMsg('If an account exists for this email, we just sent a new verification link ✅');
    } catch {
      setResentMsg('If an account exists for this email, we just sent a new verification link ✅');
    } finally {
      setResending(false);
    }
  };

  const StrengthBar = () => {
    const labels = ['Very weak', 'Weak', 'OK', 'Strong', 'Excellent'];
    return (
      <div className="space-y-1">
        <div className="flex gap-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`h-1 w-full rounded ${i <= pwScore ? 'bg-black' : 'bg-gray-300'}`}
            />
          ))}
        </div>
        <p className="text-xs text-gray-600">{labels[pwScore]}</p>
      </div>
    );
  };

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-black">
        <div className="w-full max-w-md rounded-2xl border p-8 shadow-sm">
          <h1 className="text-2xl font-bold mb-2">Verify your email</h1>
          <p className="text-sm text-gray-700">
            We’ve sent a verification link to <span className="font-medium">{email}</span>.
            Click it to activate your account. After verifying, you’ll be redirected to onboarding.
          </p>

          <div className="mt-6 space-y-3">
            <button
              onClick={resendVerification}
              disabled={resending}
              className={`w-full border px-4 py-2 rounded ${
                resending ? 'opacity-60 cursor-not-allowed' : 'hover:bg-gray-50'
              }`}
            >
              {resending ? 'Sending…' : 'Resend verification'}
            </button>
            {resentMsg && <p className="text-xs text-gray-600">{resentMsg}</p>}
            <button
              onClick={() => router.push('/login?email=' + encodeURIComponent(email))}
              className="w-full text-sm underline text-blue-600"
            >
              Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white text-black">
      <div className="w-full max-w-md rounded-2xl border p-8 shadow-sm">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold">🏛️ Pantheon</h1>
          <p className="text-sm text-gray-600">Create your account</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Email</label>
            <input
              type="email"
              placeholder="you@company.com"
              className="border px-3 py-2 rounded w-full"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Password</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                placeholder="Minimum 10 characters"
                className="border px-3 py-2 rounded w-full pr-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs underline"
              >
                {showPw ? 'Hide' : 'Show'}
              </button>
            </div>
            <StrengthBar />
            <ul className="text-xs text-gray-600 list-disc pl-5 space-y-0.5">
              <li>≥ 10 characters</li>
              <li>Upper &amp; lower case</li>
              <li>At least one number</li>
              <li>At least one symbol</li>
            </ul>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Confirm password</label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                placeholder="Re-enter your password"
                className="border px-3 py-2 rounded w-full pr-10"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs underline"
              >
                {showConfirm ? 'Hide' : 'Show'}
              </button>
            </div>
            {confirm && confirm !== password && (
              <p className="text-xs text-red-600">Passwords don’t match.</p>
            )}
          </div>

          {authError && <p className="text-sm text-red-600">{authError}</p>}

          <button
            onClick={handleSignup}
            disabled={!valid || loading}
            className={`w-full px-4 py-2 rounded text-white transition ${
              !valid || loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-black hover:bg-gray-800'
            }`}
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </div>

        <p className="text-xs text-center mt-6 text-gray-600">
          Already have an account?{' '}
          <a
            href={`/login${email ? `?email=${encodeURIComponent(email)}` : ''}`}
            className="text-blue-600 underline"
          >
            Log in
          </a>
        </p>
      </div>
    </div>
  );
}
