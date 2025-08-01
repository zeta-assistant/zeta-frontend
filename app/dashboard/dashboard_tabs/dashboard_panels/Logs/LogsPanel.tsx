'use client';

import React from 'react';

export default function LogsPanel({ fontSize }: { fontSize: 'sm' | 'base' | 'lg' }) {
  return (
    <div className={`p-6 overflow-y-auto text-${fontSize} text-indigo-200 space-y-6`}>
      {/* 📄 Logs Header */}
      <div>
        <h2 className="text-lg text-white font-semibold">📄 System Logs</h2>
      </div>

      {/* 🧠 Memory Insight */}
      <div className="bg-blue-950 border border-indigo-400 rounded-lg p-3 shadow">
        [🧠 6:00 PM] Memory updated with insight: ROI over 10%.
      </div>

      {/* 📌 Goal Added */}
      <div className="bg-blue-950 border border-yellow-400 rounded-lg p-3 shadow">
        [📌 6:15 PM] Goal added: "Enable Telegram notifications."
      </div>

      {/* 📎 File Uploaded */}
      <div className="bg-blue-950 border border-green-400 rounded-lg p-3 shadow">
        [📎 6:30 PM] Uploaded: <code>betting_strategy_2024.xlsx</code>
      </div>
    </div>
  );
}