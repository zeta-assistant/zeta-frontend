// app/reset-password/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function ResetPasswordPage() {
  const router = useRouter();
  const params = useSearchParams();

  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Supabase creates a temporary session from the magic link.
  // If URL contains type=recovery we show the form; in practice supabase-js
  // already handles session from the hash, so we can just set ready=true.
  useEffect(() => {
    const t = params.get('type');
    if (t === 'recovery' || true) setReady(true);
  }, [params]);

  const updatePassword = async () => {
    setErr(null);
    setMsg(null);

    if (!password || password.length < 8) {
      setErr('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setErr('Passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setMsg('Your password has been updated. Redirecting to login…');
      setTimeout(() => router.push('/login'), 1200);
    } catch (e: any) {
      setErr(e?.message || 'Failed to update password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen grid place-items-center bg-gradient-to-b from-sky-100 to-indigo-100 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow p-6">
        <h1 className="text-lg font-semibold text-[#0f1b3d]">Set a new password</h1>
        <p className="text-sm text-[#0f1b3d]/70 mt-1">
          {ready ? 'Enter a new password for your account.' : 'Preparing your session…'}
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-xs text-[#0f1b3d]/70 mb-1">New password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-[#c6d3ff] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-4 focus:ring-[#2555ff]/20 focus:border-[#2555ff]"
              placeholder="••••••••"
              disabled={!ready}
            />
          </div>

          <div>
            <label className="block text-xs text-[#0f1b3d]/70 mb-1">Confirm password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full border border-[#c6d3ff] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-4 focus:ring-[#2555ff]/20 focus:border-[#2555ff]"
              placeholder="••••••••"
              disabled={!ready}
            />
          </div>

          {err && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</div>}
          {msg && <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">{msg}</div>}

          <button
            onClick={updatePassword}
            disabled={!ready || busy}
            className={`w-full rounded-lg px-4 py-2.5 text-white font-medium transition ${
              !ready || busy ? 'bg-[#93a8ff] cursor-not-allowed' : 'bg-[#2555ff] hover:bg-[#1e47d9]'
            }`}
          >
            {busy ? 'Updating…' : 'Update password'}
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-[#0f1b3d]/60">
          Having trouble? Return to{' '}
          <a href="/login" className="text-[#2555ff] hover:underline">Log in</a>.
        </p>
      </div>
    </main>
  );
}

/** Force TS to treat this file as a module sdsdsdsdd (fixes Vercel isolatedModules error). */ 
export {};
