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

  const tabs: { key: MainTab; label: string; locked?: boolean }[] = [
    { key: 'functions', label: 'Custom Functions', locked: true },
    { key: 'newfunction', label: 'New Function', locked: true },
    { key: 'workshop', label: 'Workshop', locked: true },
  ];

  return (
    <div className="relative inline-block align-top flex-shrink-0">
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className={[
          'inline-flex items-center gap-1 whitespace-nowrap flex-shrink-0',
          'text-sm font-medium px-3 py-1.5 rounded-t-lg',
          'bg-blue-800 text-purple-300 hover:bg-purple-600 hover:text-white'
        ].join(' ')}
      >
        <span>🛠 Functions</span>
        <span className="ml-1 text-[9px] leading-none tracking-wide rounded px-1 py-[1px] bg-amber-500/20 text-amber-200 border border-amber-400/40">
          BETA
        </span>
      </button>

      {open && (
        <div
          className="absolute left-0 mt-1 z-50 bg-blue-950 border border-blue-700 rounded-lg shadow-lg"
          style={{ width: btnRef.current?.offsetWidth }}
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
                className={[
                  'block w-full text-left text-sm px-3 py-2 flex items-center gap-2',
                  'hover:bg-purple-700 hover:text-white',
                  isActive ? 'bg-purple-600 text-white' : 'text-purple-300'
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
