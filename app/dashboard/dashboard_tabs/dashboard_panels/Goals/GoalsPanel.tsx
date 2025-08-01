'use client';

import React from 'react';

export default function GoalsPanel() {
  return (
    <div className="p-6 overflow-y-auto text-sm text-indigo-200 space-y-6">
      {/* 🎯 Header */}
      <div>
        <h2 className="text-lg text-white font-semibold">🎯 Project Goals</h2>
      </div>

      {/* 📌 Short-Term Goals */}
      <div>
        <h3 className="text-base font-semibold text-indigo-300 mb-2">📌 Short-Term Goals</h3>
        <ul className="space-y-1">
          {['Post daily insights', 'Refactor outreach notes', 'Add telegram webhook'].map((goal, i) => (
            <li key={i} className="flex justify-between items-center bg-blue-950 border border-green-500 rounded-md px-3 py-2">
              <span>{goal}</span>
              <span className="text-green-400">✔</span>
            </li>
          ))}
          {[...Array(2)].map((_, i) => (
            <li
              key={`short-empty-${i}`}
              className="italic text-gray-400 px-3 py-2 border border-dashed border-gray-500 rounded-md"
            >
              Empty slot
            </li>
          ))}
        </ul>
      </div>

      {/* 📈 Long-Term Goals */}
      <div>
        <h3 className="text-base font-semibold text-indigo-300 mt-6 mb-2">📈 Long-Term Goals</h3>
        <ul className="space-y-1">
          {['Refactor entire strategy pipeline', 'Build auto-summary features'].map((goal, i) => (
            <li key={i} className="flex justify-between items-center bg-blue-950 border border-green-500 rounded-md px-3 py-2">
              <span>{goal}</span>
              <span className="text-green-400">✔</span>
            </li>
          ))}
          <li className="italic text-gray-400 px-3 py-2 border border-dashed border-gray-500 rounded-md">
            Empty slot
          </li>
        </ul>
      </div>

      {/* 🧭 Project Vision */}
      <div className="pt-4">
        <h3 className="text-base font-semibold text-indigo-300 mb-2">🧭 Project Vision</h3>
        <div className="bg-blue-950 border border-indigo-500 rounded-lg p-4 flex justify-between items-start">
          <p className="max-w-[90%] leading-relaxed text-indigo-100">
            Build an AI assistant that dynamically integrates with a business’s tools, tasks, and team—adapting daily.
          </p>
          <button
            title="Edit Vision"
            onClick={() => console.log('📝 Edit vision clicked')}
            className="text-yellow-300 hover:text-yellow-400 text-xl"
          >
            ✏️
          </button>
        </div>
      </div>
    </div>
  );
}