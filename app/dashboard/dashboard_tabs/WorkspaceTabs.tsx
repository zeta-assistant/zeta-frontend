'use client';

import React, { useState } from 'react';
import { MainTab } from '@/types/MainTab';

type Props = {
  activeMainTab: MainTab;
  setActiveMainTab: React.Dispatch<React.SetStateAction<MainTab>>;
};

export default function WorkspaceTabs({ activeMainTab, setActiveMainTab }: Props) {
  const [open, setOpen] = useState(false);

  // NOTE: keys match MainTab values / parent switch
  const workspaceTabs = [
    { key: 'logs', label: 'Logs' },
    { key: 'files', label: 'Desktop' }, // 👈 key stays 'files', label is 'Desktop'
    { key: 'apis', label: 'APIs' },
  ];

  return (
    <div className="relative">
      <button
        className="text-sm font-medium px-4 py-1.5 rounded-t-lg bg-blue-800 text-purple-300 hover:bg-purple-600 hover:text-white"
        onClick={() => setOpen(!open)}
      >
        🧰 Workspace
      </button>

      {open && (
        <div className="absolute z-10 mt-1 bg-blue-950 border border-blue-700 rounded-lg shadow-lg w-full min-w-full">
          {workspaceTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveMainTab(tab.key as MainTab);
                setOpen(false);
              }}
              className={`block w-full text-left text-sm px-4 py-2 hover:bg-purple-700 hover:text-white ${
                activeMainTab === tab.key
                  ? 'bg-purple-600 text-white'
                  : 'text-purple-300'
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
