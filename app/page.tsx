'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const router = useRouter();

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return alert('Login failed: ' + error.message);
    router.push('/dashboard');
  };

  const handleSignup = async () => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) return alert('Signup failed: ' + error.message);
    router.push('/onboarding');
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-white to-gray-100 px-4">
      <div className="bg-white rounded-xl shadow-md p-8 w-full max-w-md text-center">
        <h1 className="text-3xl font-bold mb-2">🏛️ Pantheon</h1>
        <p className="text-sm text-gray-600 mb-6">Home of Zeta AI</p>

        <div className="flex flex-col items-center gap-4">
          <input
            type="email"
            placeholder="Email"
            className="w-72 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            className="w-72 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="flex gap-4 justify-center mt-6">
          <button
            onClick={handleLogin}
            className="w-32 bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition"
          >
            Log In
          </button>
          <button
            onClick={handleSignup}
            className="w-32 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            Sign Up
          </button>
        </div>
      </div>
    </div>
  );
}