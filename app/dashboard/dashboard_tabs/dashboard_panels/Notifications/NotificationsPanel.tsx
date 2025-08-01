'use client';

import React from 'react';

export default function NotificationsPanel() {
  return (
    <div className="p-6 overflow-y-auto text-sm text-indigo-200 space-y-6">
      {/* 🔔 Header */}
      <div>
        <h2 className="text-lg text-white font-semibold">🔔 Notification Settings</h2>
        <p className="text-gray-400 text-sm mt-1">
          Manage how and when Zeta sends you alerts, updates, and reminders.
        </p>
      </div>

      {/* 📨 Telegram Notifications */}
      <div className="bg-blue-950 border border-blue-400 rounded-lg p-4 shadow">
        <div className="flex justify-between items-center font-medium">
          <span>📨 Telegram Alerts</span>
          <span className="text-green-400 text-xs">Enabled</span>
        </div>
        <p className="text-gray-400 text-xs mt-1">
          Zeta sends strategy tips, summaries, and time-sensitive prompts via Telegram.
        </p>
      </div>

      {/* 📧 Email Reports */}
      <div className="bg-blue-950 border border-yellow-400 rounded-lg p-4 shadow">
        <div className="flex justify-between items-center font-medium">
          <span>📧 Email Reports</span>
          <span className="text-yellow-300 text-xs">Daily</span>
        </div>
        <p className="text-gray-400 text-xs mt-1">
          Daily summaries include progress logs, reminders, and weekly goals.
        </p>
      </div>

      {/* 🧠 Zeta Suggestions */}
      <div className="bg-blue-950 border border-purple-400 rounded-lg p-4 shadow">
        <div className="flex justify-between items-center font-medium">
          <span>🧠 Smart Suggestions</span>
          <span className="text-purple-300 text-xs">Active</span>
        </div>
        <p className="text-gray-400 text-xs mt-1">
          Zeta will nudge you when it detects unusual patterns, missed tasks, or new insights.
        </p>
      </div>

      {/* 🔕 Do Not Disturb */}
      <div className="bg-blue-950 border border-red-500 rounded-lg p-4 shadow">
        <div className="flex justify-between items-center font-medium">
          <span>🔕 Do Not Disturb</span>
          <span className="text-red-400 text-xs">Off</span>
        </div>
        <p className="text-gray-400 text-xs mt-1">
          Temporarily pause all notifications for focus mode or personal time.
        </p>
      </div>

      {/* ➕ Add Custom Rule */}
      <div className="pt-2">
        <button
          onClick={() => alert('🧪 Soon you’ll be able to create custom notification rules')}
          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg shadow text-sm"
        >
          ➕ Add Custom Notification Rule
        </button>
      </div>
    </div>
  );
}