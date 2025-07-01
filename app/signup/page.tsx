'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  const handleSignup = async () => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setAuthError(error.message);
    } else {
      router.push('/onboarding');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white text-black">
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold">🏛️ Pantheon</h1>
        <p className="text-lg">Join the ecosystem</p>

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
            onClick={handleSignup}
            className="bg-black text-white px-4 py-2 rounded w-64 hover:bg-gray-800 transition"
          >
            Sign Up
          </button>
        </div>

        <p className="text-sm">
          Already have an account?{' '}
          <a href="/login" className="text-blue-600 underline">
            Log in
          </a>
        </p>
      </div>
    </div>
  );
}
