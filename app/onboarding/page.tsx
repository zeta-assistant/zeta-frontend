'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function Onboarding() {
  const router = useRouter();
  const [selectedAI, setSelectedAI] = useState('Zeta');

  const handleContinue = () => {
    if (selectedAI === 'Zeta') {
      router.push('/zetasetup'); // ✅ Redirects to Zeta setup page
    } else {
      router.push('/dashboard'); // Future fallback
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-lg p-8 flex flex-col items-center">
        <h1 className="text-3xl font-bold text-center mb-4">Pantheon</h1>

        <p className="text-gray-600 text-center mb-8 w-[820px]">
          Pantheon is a collection of specialized AI assistants, each designed to empower a different part of your life.
          Together, they form a powerful ecosystem for organization, automation, and meaningful interaction — tailored to
          your personal and professional goals. Each assistant in the Pantheon has a distinct personality and purpose:
        </p>

        <div className="space-y-4 w-[320px]">
          <button
            onClick={() => setSelectedAI('Zeta')}
            className={`w-full h-16 text-lg font-semibold rounded-xl border-2 transition ${
              selectedAI === 'Zeta'
                ? 'border-black bg-gray-50 shadow-sm'
                : 'border-gray-300 bg-white hover:border-black'
            }`}
          >
            🧠 Zeta (Executive/Business Assistant)
          </button>

          <button
            disabled
            className="w-full h-16 text-lg font-medium rounded-xl border-2 border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed"
          >
            📘 Theta (Learning/Teaching Assistant) 🚧 Coming Soon...
          </button>

          <button
            disabled
            className="w-full h-16 text-lg font-medium rounded-xl border-2 border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed"
          >
            ❤️ Delta (Emotional/Motivational Assistant) 🚧 Coming Soon...
          </button>
        </div>

        <button
          onClick={handleContinue}
          className="mt-8 w-[320px] bg-black text-white py-3 rounded-xl text-lg hover:bg-gray-800 transition"
        >
          Continue
        </button>
      </div>
    </div>
  );
}