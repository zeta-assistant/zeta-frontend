'use client';

import React from 'react';

export default function CalendarPanel({ fontSize }: { fontSize: 'sm' | 'base' | 'lg' }) {
  return (
    <div className={`p-6 overflow-y-auto text-${fontSize} text-white space-y-6`}>
      {/* 📅 Header */}
      <div>
        <h2 className="text-lg font-semibold">📅 Monthly Planner</h2>
        <p className="text-sm text-gray-300">
          Soon you’ll be able to click days to add events and reminders for Zeta to track.
        </p>
      </div>

      {/* 🗓️ Calendar Box */}
      <div className="bg-blue-950 border border-purple-500 rounded-xl p-4 shadow-md">
        {/* Month Header */}
        <div className="flex justify-between items-center mb-3 text-purple-200">
          <button className="text-sm hover:text-purple-400">&lt;</button>
          <span className="font-semibold">July 2025</span>
          <button className="text-sm hover:text-purple-400">&gt;</button>
        </div>

        {/* Days of Week */}
        <div className="grid grid-cols-7 text-xs text-center text-purple-300 mb-1">
          <div>M</div>
          <div>T</div>
          <div>W</div>
          <div>T</div>
          <div>F</div>
          <div>S</div>
          <div>S</div>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1 text-center text-sm">
          {Array.from({ length: 35 }).map((_, idx) => (
            <div
              key={idx}
              className="h-12 flex items-center justify-center rounded-md hover:bg-purple-600/20 border border-purple-900 cursor-pointer text-purple-200"
            >
              {idx < 2 ? '' : idx - 1}
            </div>
          ))}
        </div>

        {/* Example Hint */}
        <div className="mt-4 text-xs text-purple-300 bg-purple-900/30 p-2 rounded-md">
          Example:{' '}
          <span className="text-purple-100 font-medium">
            “Post outreach 4PM (Mon/Wed)”
          </span>{' '}
          – will appear on selected days.
        </div>
      </div>
    </div>
  );
}