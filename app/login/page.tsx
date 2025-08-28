'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '@/lib/supabaseClient';

/** fallback-friendly image (tries the next src if the first fails) */
function SmartImg({
  srcs,
  alt,
  size = 64,
  className = '',
}: {
  srcs: string[];
  alt: string;
  size?: number;
  className?: string;
}) {
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

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

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

      router.push('/projects');
    } catch {
      setAuthError('Something went wrong setting up your Zeta project.');
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) handleLogin();
  };

  return (
    <div className="min-h-screen relative bg-[#16133a]">
      {/* soft radial accents */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(900px 400px at 50% -10%, rgba(99,102,241,0.22), transparent), radial-gradient(800px 300px at 80% -20%, rgba(16,185,129,0.12), transparent)',
        }}
      />
      <div className="relative max-w-xl mx-auto px-6 py-12 flex flex-col items-center">
        {/* Centered brand (BIGGER) */}
        <div className="flex flex-col items-center text-center">
          <div className="h-32 w-32 rounded-[28px] bg-white/10 border border-white/20 grid place-items-center overflow-hidden shadow-xl">
            <Image src="/pantheon.png" alt="Pantheon" width={128} height={128} />
          </div>
          <h1 className="mt-5 text-5xl font-extrabold text-white tracking-tight">Pantheon</h1>
          <p className="mt-2 text-indigo-200 text-sm">Many agents. One home.</p>
        </div>

        {/* Auth card */}
        <div className="w-full mt-7 rounded-2xl bg-white shadow-xl border border-gray-200 p-6">
          {/* Agent avatars INSIDE the card (no labels) */}
          <div className="flex items-center justify-center gap-4 mb-5">
            <SmartImg
              alt="Zeta"
              srcs={['/zeta.png']}
              size={56}
              className="rounded-xl bg-white shadow-sm ring-1 ring-black/5 p-2"
            />
            <SmartImg
              alt="Theta"
              srcs={['/theta.png']}
              size={56}
              className="rounded-xl bg-white shadow-sm ring-1 ring-black/5 p-2"
            />
            <SmartImg
              alt="Delta"
              srcs={['/delta.png']}
              size={56}
              className="rounded-xl bg-white shadow-sm ring-1 ring-black/5 p-2"
            />
          </div>

          <h2 className="text-xl font-semibold mb-1">Welcome back</h2>
          <p className="text-gray-500 text-sm mb-5">Sign in to access your projects and agents.</p>

          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            placeholder="you@example.com"
            className="mb-3 w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={onKeyDown}
            autoComplete="email"
          />

          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="password">
            Password
          </label>
          <div className="relative mb-3">
            <input
              id="password"
              type={showPw ? 'text' : 'password'}
              placeholder="••••••••"
              className="w-full border rounded-md px-3 py-2 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={onKeyDown}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700"
              aria-label={showPw ? 'Hide password' : 'Show password'}
            >
              {showPw ? 'Hide' : 'Show'}
            </button>
          </div>

          {authError && (
            <div className="mb-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {authError}
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            className={`w-full rounded-md px-4 py-2.5 text-white font-medium transition ${
              loading ? 'bg-gray-400' : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {loading ? 'Logging in…' : 'Log In'}
          </button>

          <div className="mt-4 text-center text-sm text-gray-600">
            Don’t have an account?{' '}
            <a href="/signup" className="text-indigo-600 hover:text-indigo-700 font-medium">
              Sign up
            </a>
          </div>
        </div>

        {/* footer */}
        <div className="mt-6 text-center text-[11px] text-indigo-200/80">
          © {new Date().getFullYear()} Pantheon · Zeta · Theta · Delta
        </div>
      </div>
    </div>
  );
}
