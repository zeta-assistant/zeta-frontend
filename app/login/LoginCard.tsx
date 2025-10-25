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

      const params = new URLSearchParams(window.location.search);
      const next = params.get('next') || '/';
      window.location.assign(next);
    } catch {
      setAuthError('Something went wrong setting up your Pantheon project.');
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
    <div className="mx-auto max-w-lg rounded-3xl overflow-hidden shadow-[0_40px_80px_-20px_rgba(37,85,255,0.25)]">
      <div className="h-40 bg-gradient-to-r from-[#cfe0ff] to-[#e6f0ff]" />
      <div className="bg-white p-10 sm:p-12">
        <div className="flex items-center justify-center -mt-20 mb-6">
          <SmartImg
            alt="Pantheon Logo"
            srcs={['/pantheon.png']}
            size={100}
            className="rounded-3xl bg-white shadow ring-1 ring-black/5 p-4"
          />
        </div>

        <h3 className="text-2xl font-semibold text-[#0f1b3d] text-center">Welcome back</h3>
        <p className="text-base text-[#0f1b3d]/60 mb-8 text-center">
          Sign in to access your projects and agents.
        </p>

        <label className="block text-sm font-medium text-[#0f1b3d]/70 mb-1" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          placeholder="you@example.com"
          className="mb-5 w-full border border-[#c6d3ff] rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-4 focus:ring-[#2555ff]/20 focus:border-[#2555ff] transition"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={onKeyDown}
          autoComplete="email"
        />

        <label className="block text-sm font-medium text-[#0f1b3d]/70 mb-1" htmlFor="password">
          Password
        </label>
        <div className="relative mb-1">
          <input
            id="password"
            type={showPw ? 'text' : 'password'}
            placeholder="••••••••"
            className="w-full border border-[#c6d3ff] rounded-lg px-4 py-3 pr-14 text-base focus:outline-none focus:ring-4 focus:ring-[#2555ff]/20 focus:border-[#2555ff] transition"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={onKeyDown}
            autoComplete="current-password"
          />
          <button
            type="button"
            onClick={() => setShowPw((s) => !s)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[#0f1b3d]/60 hover:text-[#0f1b3d]"
          >
            {showPw ? 'Hide' : 'Show'}
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => { setFpOpen(true); setFpEmail(email || ''); }}
            className="text-sm text-[#2555ff] hover:underline"
          >
            Forgot password?
          </button>
          <a href="/reset-password" className="text-sm text-[#0f1b3d]/60 hover:underline">
            I already have a reset link
          </a>
        </div>

        {authError && (
          <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-4 py-3">
            {authError}
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={loading}
          className={`mt-6 w-full rounded-lg px-5 py-3 text-lg font-medium text-white transition shadow hover:shadow-lg ${
            loading ? 'bg-[#93a8ff] cursor-not-allowed' : 'bg-[#2555ff] hover:bg-[#1e47d9]'
          }`}
        >
          {loading ? 'Logging in…' : 'Log In'}
        </button>

        <div className="mt-6 text-center text-base text-[#0f1b3d]/70">
          Don’t have an account?{' '}
          <a href="/signup" className="text-[#2555ff] hover:underline font-medium">
            Sign up
          </a>
        </div>

        <div className="mt-8 text-center text-sm text-[#0f1b3d]/50">
          © {new Date().getFullYear()} Pantheon
        </div>

        <div className="mt-4 flex justify-center">
          <a
            href="https://www.instagram.com/pnthn.dev/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-base text-[#2555ff] hover:text-[#1e47d9] transition font-medium"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
              fill="currentColor" className="h-6 w-6" aria-hidden="true">
              <path d="M7.75 2h8.5A5.75 5.75 0 0 1 22 7.75v8.5A5.75 5.75 0 0 1 16.25 22h-8.5A5.75 5.75 0 0 1 2 16.25v-8.5A5.75 5.75 0 0 1 7.75 2zm0 1.5A4.25 4.25 0 0 0 3.5 7.75v8.5A4.25 4.25 0 0 0 7.75 20.5h8.5a4.25 4.25 0 0 0 4.25-4.25v-8.5A4.25 4.25 0 0 0 16.25 3.5h-8.5zm4.25 3a5.75 5.75 0 1 1 0 11.5 5.75 5.75 0 0 1 0-11.5zm0 1.5a4.25 4.25 0 1 0 0 8.5 4.25 4.25 0 0 0 0-8.5zm5.25-.88a1.13 1.13 0 1 1-2.25 0 1.13 1.13 0 0 1 2.25 0z"/>
            </svg>
            Follow us on Instagram
          </a>
        </div>
      </div>
    </div>
  );
}
