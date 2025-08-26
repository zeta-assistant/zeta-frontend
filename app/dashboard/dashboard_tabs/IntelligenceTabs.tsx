'use client';

import React, { useState } from 'react';
import { MainTab } from '@/types/MainTab';

type Props = {
  activeMainTab: MainTab;
  setActiveMainTab: React.Dispatch<React.SetStateAction<MainTab>>;
};

export default function IntelligenceTabs({ activeMainTab, setActiveMainTab }: Props) {
  const [open, setOpen] = useState(false);

  // Ensure your MainTab union includes 'timeline'
  const tabs: { key: MainTab; label: string; emoji?: string }[] = [
    { key: 'thoughts', label: 'Thoughts', emoji: '💭' },
    { key: 'tasks', label: 'Tasks', emoji: '🗂️' },
    { key: 'timeline', label: 'Timeline', emoji: '📈' },
  ];

  return (
    <div className="relative">
      <button
        className="text-sm font-medium px-3 py-1.5 rounded-t-lg bg-blue-800 text-purple-300 hover:bg-purple-600 hover:text-white"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="listbox"
        type="button"
      >
        🧠 Intelligence
      </button>

      {open && (
        <div className="absolute z-10 mt-1 bg-blue-950 border border-blue-700 rounded-lg shadow-lg w-full min-w-full overflow-hidden">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveMainTab(tab.key);
                setOpen(false);
              }}
              className={`block w-full text-left text-sm px-4 py-2 hover:bg-purple-700 hover:text-white flex items-center gap-2 ${
                activeMainTab === tab.key ? 'bg-purple-600 text-white' : 'text-purple-300'
              }`}
              role="option"
              aria-selected={activeMainTab === tab.key}
              type="button"
            >
              <span aria-hidden>{tab.emoji}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
