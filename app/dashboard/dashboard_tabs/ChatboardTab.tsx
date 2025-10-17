'use client';

import React, { useState } from 'react';
import { MainTab } from '@/types/MainTab';

type MenuKey = 'chatboard' | 'workspace' | 'planner' | 'intelligence' | 'functions' | null;

type Props = {
  activeMainTab: MainTab;
  setActiveMainTab: React.Dispatch<React.SetStateAction<MainTab>>;
  openMenu?: MenuKey;
  setOpenMenu?: React.Dispatch<React.SetStateAction<MenuKey>>;
};

export default function ChatboardTab({
  activeMainTab,
  setActiveMainTab,
  openMenu,
  setOpenMenu,
}: Props) {
  const MENU_ID: MenuKey = 'chatboard';

  // Support both controlled and uncontrolled dropdown usage
  const controlled = typeof setOpenMenu === 'function';
  const [localOpen, setLocalOpen] = useState(false);
  const isOpen = controlled ? openMenu === MENU_ID : localOpen;

  const toggleOpen = () => {
    if (controlled) {
      setOpenMenu?.((prev) => (prev === MENU_ID ? null : MENU_ID));
    } else {
      setLocalOpen((v) => !v);
    }
  };

  const closeMenu = () => {
    if (controlled) setOpenMenu?.(null);
    else setLocalOpen(false);
  };

  const tabs: ReadonlyArray<{ key: MainTab; label: string }> = [
    { key: 'chat',        label: 'Chat' },
    { key: 'discussions', label: 'Discussions' },
    { key: 'connections', label: 'Connections' },
  ];

  return (
    // IMPORTANT: let this component fill the column it's placed in
    <div className="relative w-full min-w-0">
      <button
        type="button"
        onClick={toggleOpen}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className={[
          // fill width in grids, center content; on large screens it still fills its slot
          'inline-flex w-full items-center justify-center',
          // consistent sizing with other tabs
          'px-4 py-1.5 rounded-t-lg text-sm font-medium whitespace-nowrap',
          'bg-blue-800 text-purple-300 hover:bg-purple-600 hover:text-white',
        ].join(' ')}
      >
        <span className="mr-1">💬</span>
        <span>Chat</span>
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute left-0 z-[9999] mt-1 w-full bg-blue-950 border border-blue-700 rounded-lg shadow-lg overflow-hidden"
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setActiveMainTab(tab.key);
                closeMenu();
              }}
              className={[
                'block w-full text-left text-sm px-4 py-2',
                'hover:bg-purple-700 hover:text-white',
                activeMainTab === tab.key ? 'bg-purple-600 text-white' : 'text-purple-300',
              ].join(' ')}
              role="menuitem"
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
