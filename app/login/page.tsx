'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { checkOrCreateUserProject } from '@/lib/CheckOrCreateUserProject';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    console.log("🧪 handleLogin triggered");
    setAuthError(null);
    setLoading(true);

    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error("❌ Login error:", error.message);
      setAuthError(error.message);
      setLoading(false);
      return;
    }

    const session = authData.session;
    if (!session) {
      setAuthError("Login succeeded but no session found.");
      setLoading(false);
      return;
    }

    try {
      const userId = session.user.id;
      const project = await checkOrCreateUserProject(userId);
      const hasOnboarded = !!project.name && project.name !== 'New Zeta Project';

      router.push(hasOnboarded ? '/dashboard' : '/onboarding');
    } catch (err: any) {
      console.error('❌ Project setup failed:', err.message || err);
      setAuthError('Something went wrong setting up your Zeta project.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white text-black">
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold">🏛️ Pantheon</h1>
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
            disabled={loading}
          >
            {loading ? 'Logging in...' : 'Log In'}
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
