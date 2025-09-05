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
    <div className="min-h-screen relative overflow-hidden bg-[#0f0c29]">
      {/* decorative background */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(1100px 500px at 50% -10%, rgba(99,102,241,0.18), transparent), radial-gradient(900px 400px at 90% -10%, rgba(16,185,129,0.12), transparent), radial-gradient(900px 500px at 10% 110%, rgba(168,85,247,0.12), transparent)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.15] mix-blend-screen"
        style={{
          background:
            'repeating-linear-gradient( -12deg, rgba(255,255,255,0.04), rgba(255,255,255,0.04) 2px, transparent 2px, transparent 10px )',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27100%27 height=%27100%27 viewBox=%270 0 100 100%27%3E%3Ccircle cx=%275%27 cy=%275%27 r=%271%27 fill=%27white%27/%3E%3C/svg%3E")',
        }}
      />

      {/* header */}
      <div className="relative max-w-7xl mx-auto px-5 pt-10 md:pt-14">
        <div className="flex items-center justify-center mb-8">
          <div className="flex flex-col items-center text-center">
            <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-3xl bg-white/10 border border-white/20 grid place-items-center overflow-hidden shadow-2xl">
              <Image src="/pantheon.png" alt="Pantheon" width={112} height={112} />
            </div>
            <h1 className="mt-4 text-4xl sm:text-5xl font-extrabold text-white tracking-tight">
              Pantheon
            </h1>
            <p className="mt-1 text-indigo-200 text-sm">Create your own Assistant to build smarter</p>
          </div>
        </div>
      </div>

      {/* 3-column layout with matched card sizing */}
      <div className="relative max-w-7xl mx-auto px-5 pb-10 md:pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
          {/* LEFT CARD */}
          <aside className="h-full">
            <div className="h-full rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm p-6 flex flex-col">
              <h2 className="text-white text-lg font-semibold">What it’s great for</h2>
              <ul className="mt-3 text-[13px] text-indigo-100/90 space-y-2">
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-400" />
                  Personal projects & side hustles
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-400" />
                  Work projects & team follow-ups
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-400" />
                  Workout routines & daily accountability
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-400" />
                  Study plans, roadmaps, spaced review
                </li>
              </ul>

              {/* Agents row image */}
              <div className="mt-6">
                <div className="text-indigo-200 text-xs uppercase tracking-wider mb-2">
                  Zeta Build • Theta Learn • Delta Grow
                </div>
                <div className="flex items-center gap-4">
                  <SmartImg
                    alt="Zeta Build"
                    srcs={['/zeta.png']}
                    size={56}
                    className="rounded-xl bg-white shadow-sm ring-1 ring-black/5 p-2"
                  />
                  <SmartImg
                    alt="Theta Learn"
                    srcs={['/theta.png']}
                    size={56}
                    className="rounded-xl bg-white shadow-sm ring-1 ring-black/5 p-2"
                  />
                  <SmartImg
                    alt="Delta Grow"
                    srcs={['/delta.png']}
                    size={56}
                    className="rounded-xl bg-white shadow-sm ring-1 ring-black/5 p-2"
                  />
                </div>
              </div>
            </div>
          </aside>

          {/* CENTER AUTH CARD */}
          <main className="h-full">
            <div className="h-full w-full rounded-2xl bg-white shadow-2xl border border-gray-200 p-6">
              <div className="flex items-center justify-center gap-4 mb-5">
                <SmartImg
                  alt="Zeta Build"
                  srcs={['/zeta.png']}
                  size={56}
                  className="rounded-xl bg-white shadow-sm ring-1 ring-black/5 p-2"
                />
                <SmartImg
                  alt="Theta Learn"
                  srcs={['/theta.png']}
                  size={56}
                  className="rounded-xl bg-white shadow-sm ring-1 ring-black/5 p-2"
                />
                <SmartImg
                  alt="Delta Grow"
                  srcs={['/delta.png']}
                  size={56}
                  className="rounded-xl bg-white shadow-sm ring-1 ring-black/5 p-2"
                />
              </div>

              <h3 className="text-xl font-semibold mb-1">Welcome back</h3>
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

              <div className="mt-6 text-center text-[11px] text-gray-400">
                © {new Date().getFullYear()} Pantheon · Zeta Build · Theta Learn · Delta Grow
              </div>
            </div>
          </main>

          {/* RIGHT CARD: What you can do */}
          <aside className="h-full">
            <div className="h-full rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm p-6 flex flex-col">
              <h2 className="text-white text-lg font-semibold">What you can do</h2>
              <p className="mt-1 text-[13px] text-indigo-100/80">
                With <span className="font-semibold text-white">Zeta Build</span>, your AI teammate helps you move from
                idea to execution:
              </p>
              <ul className="mt-3 text-[13px] text-indigo-100/90 space-y-2">
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-400" />
                  Discuss with your assistant about your project and goals
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-400" />
                  Generate, convert, and interpret files
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-400" />
                  Set your calendar and plan events
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-400" />
                  Reminders & customizable notifications
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-400" />
                  Daily outreach & conversation starters
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-400" />
                  Generate thoughts about your project & goals
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-400" />
                  Suggest task ideas to achieve goals
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-400" />
                  Provide ideas & suggestions to move your project forward
                </li>
              </ul>

              {/* Optional tiny caption */}
              <div className="mt-4 text-[11px] text-indigo-200/80">
                Tip: Start simple — add one goal and let Zeta Build propose the first three tasks.
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
