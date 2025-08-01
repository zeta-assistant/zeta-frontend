'use client';

import React from 'react';

export default function ApisPanel() {
  return (
    <div className="p-6 overflow-y-auto text-sm text-indigo-200 space-y-6">
      {/* 🔌 Header */}
      <div>
        <h2 className="text-lg text-white font-semibold">🔌 API Connections</h2>
        <p className="text-gray-400 text-sm mt-1">
          Manage and review your connected APIs. Zeta uses these to gather and sync data across tools.
        </p>
      </div>

      {/* 📡 API Cards */}
      <div className="grid grid-cols-2 gap-4">
        {/* ✅ Google Sheets */}
        <div className="bg-blue-950 border border-green-500 rounded-lg p-4 shadow">
          <div className="flex justify-between items-center font-medium">
            <span>📊 Google Sheets</span>
            <span className="text-green-400 text-xs">Connected</span>
          </div>
          <p className="text-gray-400 mt-1 text-xs">Used to fetch and write betting data.</p>
        </div>

        {/* ✅ Telegram Bot */}
        <div className="bg-blue-950 border border-blue-400 rounded-lg p-4 shadow">
          <div className="flex justify-between items-center font-medium">
            <span>📨 Telegram Bot</span>
            <span className="text-blue-300 text-xs">Active</span>
          </div>
          <p className="text-gray-400 mt-1 text-xs">Used for sending outreach and notification messages.</p>
        </div>

        {/* ⚠️ Lightspeed */}
        <div className="bg-blue-950 border border-yellow-500 rounded-lg p-4 shadow">
          <div className="flex justify-between items-center font-medium">
            <span>💡 Lightspeed</span>
            <span className="text-yellow-300 text-xs">Not Connected</span>
          </div>
          <p className="text-gray-400 mt-1 text-xs">POS system integration for future restaurant testing.</p>
        </div>

        {/* ⚙️ Zeta Internal */}
        <div className="bg-blue-950 border border-purple-500 rounded-lg p-4 shadow">
          <div className="flex justify-between items-center font-medium">
            <span>🧠 Zeta Custom API</span>
            <span className="text-purple-300 text-xs">Enabled</span>
          </div>
          <p className="text-gray-400 mt-1 text-xs">Internal functions and assistants integrations.</p>
        </div>
      </div>

      {/* ➕ Add New */}
      <div className="pt-4">
        <button
          onClick={() => alert('🧪 Soon you’ll be able to add API tokens or keys manually')}
          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg shadow text-sm"
        >
          ➕ Add New API Connection
        </button>
      </div>
    </div>
  );
}