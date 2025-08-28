'use client';

import React, { useState } from 'react';
import { MainTab } from '@/types/MainTab';

type Props = {
  activeMainTab: MainTab;
  setActiveMainTab: React.Dispatch<React.SetStateAction<MainTab>>;
};

export default function ChatboardTab({ activeMainTab, setActiveMainTab }: Props) {
  const [open, setOpen] = useState(false);

  const tabs = [
    { key: 'chat', label: 'Chatboard' },
    { key: 'discussions', label: 'Discussions' },
    { key: 'connections', label: 'Connections' },
  ] as const;

  return (
    // keep wrapper inline-block so width = button width
    <div className="relative inline-block">
      <button
        className="text-sm font-medium px-6 py-1.5 min-w-[100px] text-center rounded-t-lg bg-blue-800 text-purple-300 hover:bg-purple-600 hover:text-white"
        onClick={() => setOpen(!open)}
      >
        Chatboard
      </button>

      {open && (
        <div className="absolute left-0 z-10 mt-1 bg-blue-950 border border-blue-700 rounded-lg shadow-lg w-full">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveMainTab(tab.key as MainTab);
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
