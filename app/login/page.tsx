'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) router.replace('/dashboard');
    };
    checkSession();
  }, [router]);

  const handleLogin = async () => {
    setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setAuthError(error.message);
    } else {
      router.push('/dashboard');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white text-black">
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold">🏛️ Pantheon Nigga</h1>
        <p className="text-lg">Home of Zeta AI</p>

        <div className="space-y-2">
          <input
            type="email"
            placeholder="Email"
            className="border px-3 py-2 rounded w-64"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            className="border px-3 py-2 rounded w-64"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {authError && <p className="text-red-500 text-sm">{authError}</p>}

          <button
            onClick={handleLogin}
            className="bg-black text-white px-4 py-2 rounded w-64 hover:bg-gray-800 transition"
          >
            Log In
          </button>
        </div>

        <p className="text-sm">
          Don’t have an account?{' '}
          <a href="/signup" className="text-blue-600 underline">
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
}
