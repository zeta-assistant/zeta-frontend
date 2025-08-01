'use client';

import React from 'react';

export default function TasksPanel() {
  return (
    <div className="p-6 overflow-y-auto text-sm text-indigo-200 space-y-6">
      {/* 📋 Header */}
      <div>
        <h2 className="text-lg text-white font-semibold">📋 Task Tracker</h2>
        <p className="text-gray-400 text-sm mt-1">
          Daily priorities from both you and Zeta.
        </p>
      </div>

      {/* 🗂️ Task Cards */}
      <div className="space-y-3">
        <div className="bg-blue-950 border border-purple-500 rounded-lg p-4 shadow">
          ✅ Upload this week’s memory summary
        </div>
        <div className="bg-blue-950 border border-yellow-500 rounded-lg p-4 shadow">
          🔍 Zeta analysis pending: last 3 week ROI trends
        </div>
        <div className="bg-blue-950 border border-blue-400 rounded-lg p-4 shadow">
          📨 Outreach setup: Telegram webhook for 4PM alerts
        </div>
      </div>
    </div>
  );
}
