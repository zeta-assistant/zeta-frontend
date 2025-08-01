'use client';

import React from 'react';

export default function ThoughtsPanel() {
  return (
    <div className="p-6 overflow-y-auto text-sm text-indigo-200 space-y-6">
      {/* 💭 Header */}
      <div>
        <h2 className="text-lg text-white font-semibold">💭 Thoughts</h2>
        <p className="text-gray-400 text-sm mt-1">
          Ongoing reflections and strategy ideas — both yours and Zeta’s.
        </p>
      </div>

      {/* 🧠 Thought Bubbles */}
      <div className="space-y-3">
        <div className="bg-blue-950 border border-yellow-500 rounded-lg p-4 shadow">
          🔄 “Could Zeta prompt for weekly summaries if none exist by Sunday night?”
        </div>
        <div className="bg-blue-950 border border-yellow-500 rounded-lg p-4 shadow">
          🧠 “Strategy performance feels weaker after losing streaks — should we flag this?”
        </div>
        <div className="bg-blue-950 border border-yellow-500 rounded-lg p-4 shadow">
          💡 “Auto-prioritize goals based on previous week’s outcomes?”
        </div>
      </div>
    </div>
  );
}