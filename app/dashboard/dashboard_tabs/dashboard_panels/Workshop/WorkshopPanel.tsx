'use client';

import React from 'react';

type Props = {
  fontSize: 'sm' | 'base' | 'lg';
};

export default function WorkshopPanel({ fontSize }: Props) {
  return (
    <div className={`p-6 overflow-y-auto text-${fontSize} text-indigo-200 space-y-6`}>
      {/* 🧪 Header */}
      <div>
        <h2 className="text-lg text-white font-semibold">🧪 Zeta Workshop</h2>
        <p className="text-gray-400 text-sm mt-1">
          Test ideas, refine prompts, and iterate AI behavior before saving anything permanent.
        </p>
      </div>

      {/* 🔬 Test Area */}
      <div className="bg-blue-950 border border-yellow-400 rounded-xl p-4 shadow space-y-4">
        <div>
          <label htmlFor="test-input" className="block mb-1 text-yellow-200 font-medium">
            🛠 Try a one-off function idea:
          </label>
          <input
            id="test-input"
            type="text"
            placeholder="e.g., Fetch last 5 bets & summarize"
            className="w-full bg-blue-900 text-white px-3 py-2 rounded-md border border-yellow-600 focus:outline-none"
          />
        </div>

        <button className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded shadow text-sm">
          🚀 Run Test
        </button>
      </div>

      {/* ℹ️ Note */}
      <div className="text-xs text-gray-400">
        Results won't be saved — this is a safe space for experiments.
      </div>
    </div>
  );
}