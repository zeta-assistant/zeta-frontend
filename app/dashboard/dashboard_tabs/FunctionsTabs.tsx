'use client';

import React, { useState, useRef } from 'react';
import { MainTab } from '@/types/MainTab';

type Props = {
  activeMainTab: MainTab;
  setActiveMainTab: React.Dispatch<React.SetStateAction<MainTab>>;
};

export default function FunctionsTabs({ activeMainTab, setActiveMainTab }: Props) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const tabs: { key: MainTab; label: string }[] = [
    { key: 'functions',   label: 'Custom Functions' },
    { key: 'newfunction', label: 'New Function' },
    { key: 'workshop',    label: 'Workshop' },
  ];

  return (
    // ✅ unified wrapper with full width for grid alignment
    <div className="relative w-full min-w-0">
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        className={[
          // full-width consistent sizing
          'inline-flex items-center justify-center w-full',
          // uniform text + padding across all tabs
          'text-sm font-medium px-4 py-1.5 rounded-t-lg whitespace-nowrap',
          // consistent colors and hover states
          'bg-blue-800 text-purple-300 hover:bg-purple-600 hover:text-white',
        ].join(' ')}
      >
        <span className="mr-1">🛠️</span>
        <span>Functions</span>
      </button>

      {open && (
        <div
          className="absolute left-0 z-[9999] mt-1 w-full bg-blue-950 border border-blue-700 rounded-lg shadow-lg overflow-hidden"
        >
          {tabs.map((tab) => {
            const isActive = activeMainTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveMainTab(tab.key as MainTab);
                  setOpen(false);
                }}
                type="button"
                className={[
                  'block w-full text-left text-sm px-4 py-2 flex items-center gap-2',
                  'hover:bg-purple-700 hover:text-white',
                  isActive ? 'bg-purple-600 text-white' : 'text-purple-300',
                ].join(' ')}
              >
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
