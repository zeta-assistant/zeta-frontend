'use client';

import React, { useState } from 'react';
import { MainTab } from '@/types/MainTab';

type Props = {
  activeMainTab: MainTab;
  setActiveMainTab: React.Dispatch<React.SetStateAction<MainTab>>;
};

export default function ChatboardTabs({ activeMainTab, setActiveMainTab }: Props) {
  const [open, setOpen] = useState(false);

  const tabs: { key: MainTab; label: string }[] = [
    { key: 'chat', label: 'Chatboard' },
    { key: 'discussions', label: 'Discussions' },
  ];

  return (
    <div className="relative">
      <button
        className="text-sm font-medium px-3 py-1.5 rounded-t-lg bg-blue-800 text-purple-300 hover:bg-purple-600 hover:text-white"
        onClick={() => setOpen(!open)}
      >
        💬 Chatboard
      </button>

      {open && (
        <div className="absolute z-10 mt-1 bg-blue-950 border border-blue-700 rounded-lg shadow-lg w-full min-w-full">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveMainTab(tab.key); // ✅ Fully typed now
                setOpen(false);
              }}
              className={`block w-full text-left text-sm px-4 py-2 hover:bg-purple-700 hover:text-white ${
                activeMainTab === tab.key ? 'bg-purple-600 text-white' : 'text-purple-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}