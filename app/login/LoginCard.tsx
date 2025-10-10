// app/login/LoginCard.tsx
'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

function SmartImg({
  srcs, alt, size = 64, className = '',
}: { srcs: string[]; alt: string; size?: number; className?: string }) {
  const [i, setI] = useState(0);
  const src = srcs[Math.min(i, srcs.length - 1)];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={className}
      onError={() => setI((prev) => Math.min(prev + 1, srcs.length - 1))}
    />
  );
}

export default function LoginCard() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  // forgot-password dialog state
  const [fpOpen, setFpOpen] = useState(false);
  const [fpEmail, setFpEmail] = useState('');
  const [fpMsg, setFpMsg] = useState<string | null>(null);
  const [fpErr, setFpErr] = useState<string | null>(null);
  const [fpBusy, setFpBusy] = useState(false);

  const handleLogin = async () => {
    setAuthError(null);
    setLoading(true);

    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setAuthError(error.message);
      setLoading(false);
      return;
    }

    const session = authData.session;
    if (!session) {
      setAuthError('Login succeeded but no session found.');
      setLoading(false);
      return;
    }

    try {
      // ensure project exists (your existing endpoint)
      const userId = session.user.id;
      const res = await fetch('/api/check-or-create-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      const contentType = res.headers.get('content-type');
      const data = contentType?.includes('application/json') ? await res.json() : null;

      if (!res.ok) {
        setAuthError(data?.error || 'Failed to create or fetch project.');
        setLoading(false);
        return;
      }

      // respect ?next=
      const params = new URLSearchParams(window.location.search);
      const next = params.get('next') || '/';
      window.location.assign(next);
    } catch {
      setAuthError('Something went wrong setting up your Zeta project.');
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) handleLogin();
  };

  const sendResetEmail = async () => {
    setFpMsg(null);
    setFpErr(null);
    setFpBusy(true);

    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(fpEmail.trim(), { redirectTo });
      if (error) {
        setFpErr(error.message);
      } else {
        setFpMsg('If an account exists for this email, a reset link has been sent.');
      }
    } catch (e: any) {
      setFpErr(e?.message || 'Failed to send reset email.');
    } finally {
      setFpBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md rounded-3xl overflow-hidden shadow-[0_30px_60px_-15px_rgba(37,85,255,0.25)]">
      <div className="h-28 bg-gradient-to-r from-[#cfe0ff] to-[#e6f0ff]" />
      <div className="bg-white p-6 sm:p-8">
        <div className="flex items-center justify-center gap-3 -mt-14 mb-4">
          <SmartImg alt="Zeta Build" srcs={['/zeta.png']} size={56} className="rounded-xl bg-white shadow ring-1 ring-black/5 p-2" />
          <SmartImg alt="Theta Learn" srcs={['/theta.png']} size={56} className="rounded-xl bg-white shadow ring-1 ring-black/5 p-2" />
          <SmartImg alt="Delta Grow" srcs={['/delta.png']} size={56} className="rounded-xl bg-white shadow ring-1 ring-black/5 p-2" />
        </div>

        <h3 className="text-xl font-semibold text-[#0f1b3d]">Welcome back</h3>
        <p className="text-sm text-[#0f1b3d]/60 mb-5">Sign in to access your projects and agents.</p>

        <label className="block text-xs font-medium text-[#0f1b3d]/70 mb-1" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          placeholder="you@example.com"
          className="mb-3 w-full border border-[#c6d3ff] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-4 focus:ring-[#2555ff]/20 focus:border-[#2555ff] transition"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={onKeyDown}
          autoComplete="email"
        />

        <label className="block text-xs font-medium text-[#0f1b3d]/70 mb-1" htmlFor="password">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPw ? 'text' : 'password'}
            placeholder="••••••••"
            className="w-full border border-[#c6d3ff] rounded-lg px-3 py-2 pr-12 text-sm focus:outline-none focus:ring-4 focus:ring-[#2555ff]/20 focus:border-[#2555ff] transition"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={onKeyDown}
            autoComplete="current-password"
          />
          <button
            type="button"
            onClick={() => setShowPw((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#0f1b3d]/60 hover:text-[#0f1b3d]"
            aria-label={showPw ? 'Hide password' : 'Show password'}
          >
            {showPw ? 'Hide' : 'Show'}
          </button>
        </div>

        {/* <- Clear, always-visible reset row */}
        <div className="mt-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => { setFpOpen(true); setFpEmail(email || ''); }}
            className="text-xs text-[#2555ff] hover:underline"
          >
            Forgot password?
          </button>
          {/* Fallback: takes users to the page they’ll land on after clicking the email link */}
          <a href="/reset-password" className="text-xs text-[#0f1b3d]/60 hover:underline">
            I already have a reset link
          </a>
        </div>

        {authError && (
          <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {authError}
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={loading}
          className={`mt-3 w-full rounded-lg px-4 py-2.5 text-white font-medium transition shadow hover:shadow-md ${
            loading ? 'bg-[#93a8ff] cursor-not-allowed' : 'bg-[#2555ff] hover:bg-[#1e47d9]'
          }`}
        >
          {loading ? 'Logging in…' : 'Log In'}
        </button>

        <div className="mt-4 text-center text-sm text-[#0f1b3d]/70">
          Don’t have an account?{' '}
          <a href="/signup" className="text-[#2555ff] hover:underline font-medium">
            Sign up
          </a>
        </div>

        <div className="mt-6 text-center text-[11px] text-[#0f1b3d]/50">
          © {new Date().getFullYear()} Pantheon · Zeta Build · Theta Learn · Delta Grow
        </div>

        <div className="mt-3 flex justify-center">
          <a
            href="https://www.instagram.com/pnthn.dev/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-[#2555ff] hover:text-[#1e47d9] transition font-medium"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                 fill="currentColor" className="h-5 w-5" aria-hidden="true">
              <path d="M7.75 2h8.5A5.75 5.75 0 0 1 22 7.75v8.5A5.75 5.75 0 0 1 16.25 22h-8.5A5.75 5.75 0 0 1 2 16.25v-8.5A5.75 5.75 0 0 1 7.75 2zm0 1.5A4.25 4.25 0 0 0 3.5 7.75v8.5A4.25 4.25 0 0 0 7.75 20.5h8.5a4.25 4.25 0 0 0 4.25-4.25v-8.5A4.25 4.25 0 0 0 16.25 3.5h-8.5zm4.25 3a5.75 5.75 0 1 1 0 11.5 5.75 5.75 0 0 1 0-11.5zm0 1.5a4.25 4.25 0 1 0 0 8.5 4.25 4.25 0 0 0 0-8.5zm5.25-.88a1.13 1.13 0 1 1-2.25 0 1.13 1.13 0 0 1 2.25 0z"/>
            </svg>
            Follow us on Instagram
          </a>
        </div>
      </div>

      {/* Simple Forgot Password dialog */}
      {fpOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-lg">
            <h4 className="text-sm font-semibold text-[#0f1b3d]">Reset your password</h4>
            <p className="text-xs text-[#0f1b3d]/70 mt-1">
              Enter your email and we’ll send a reset link.
            </p>
            <input
              type="email"
              value={fpEmail}
              onChange={(e) => setFpEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-3 w-full border border-[#c6d3ff] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-4 focus:ring-[#2555ff]/20 focus:border-[#2555ff]"
            />
            {fpErr && <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{fpErr}</div>}
            {fpMsg && <div className="mt-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">{fpMsg}</div>}

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setFpOpen(false)}
                className="flex-1 rounded-lg border border-[#c6d3ff] px-3 py-2 text-sm text-[#0f1b3d]"
              >
                Close
              </button>
              <button
                onClick={sendResetEmail}
                disabled={fpBusy || !fpEmail}
                className={`flex-1 rounded-lg px-3 py-2 text-sm text-white ${
                  fpBusy ? 'bg-[#93a8ff] cursor-not-allowed' : 'bg-[#2555ff] hover:bg-[#1e47d9]'
                }`}
              >
                {fpBusy ? 'Sending…' : 'Send link'}
              </button>
            </div>

            <p className="mt-3 text-[11px] text-[#0f1b3d]/60">
              Or go to{' '}
              <a href="/reset-password" className="text-[#2555ff] hover:underline">
                /reset-password
              </a>{' '}
              after clicking the email link.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
