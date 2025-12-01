'use client';

import React, { useEffect, useRef, useState } from 'react';
import { MainTab } from '@/types/MainTab';

type Props = {
  activeMainTab: MainTab;
  setActiveMainTab: React.Dispatch<React.SetStateAction<MainTab>>;
};

export default function IntelligenceTabs({ activeMainTab, setActiveMainTab }: Props) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // If you ever add emojis back, this guard will handle it.
  const tabs: ReadonlyArray<{ key: MainTab; label: string; emoji?: string }> = [
    { key: 'thoughts', label: 'Thoughts' },
    { key: 'tasks', label: 'Tasks' },
    { key: 'timeline', label: 'Timeline' },
  ];

  // Optional: click-outside to close
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        className="text-sm font-medium px-3 py-1.5 rounded-t-lg bg-blue-800 text-purple-300 hover:bg-purple-600 hover:text-white"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        type="button"
      >
        🧠 Intelligence
      </button>

      {open && (
        <div
          className="absolute z-10 mt-1 bg-blue-950 border border-blue-700 rounded-lg shadow-lg w-full min-w-full overflow-hidden"
          role="listbox"
        >
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
              {/* Only render if an emoji exists */}
              {tab.emoji ? <span aria-hidden="true">{tab.emoji}</span> : null}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
