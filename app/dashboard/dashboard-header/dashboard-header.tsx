'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import Clock from '@/components/Clock';
import RefreshButton from '../dashboard_buttons/refresh_button/refresh_button';

type Props = {
  projectName: string;
  userEmail: string | null;
  projectId: string;
  threadId: string | null;
  setShowAgentMenu: React.Dispatch<React.SetStateAction<boolean>>;
  showAgentMenu: boolean;
  handleLogout: () => void;
  onRefresh?: () => Promise<void>;   // added
  refreshing?: boolean;              // added
};

export default function DashboardHeader({
  projectName,
  userEmail,
  projectId,
  threadId,
  showAgentMenu,
  setShowAgentMenu,
  handleLogout,
  onRefresh,
  refreshing,
}: Props) {
  const router = useRouter();

  return (
    <>
      {/* 🧠 Dashboard Header */}
      <div className="flex items-center px-6 py-4 border-b border-blue-700">
        <div className="relative flex items-center gap-4 shrink-0">
          <div
            className="relative flex items-center gap-2 cursor-pointer"
            onClick={() => setShowAgentMenu((prev) => !prev)}
          >
            <img
              src="/zeta-letterlogo.png"
              alt="Zeta Letter Logo"
              className="w-8 h-8 rounded-xl shadow-md hover:scale-105 transition-transform"
            />
            <h1 className="text-xl font-semibold whitespace-nowrap hover:underline">
              Zeta Dashboard
            </h1>
          </div>

          <Clock />

          {showAgentMenu && (
            <div className="absolute top-[105%] left-0 w-52 bg-indigo-100 text-indigo-900 border border-indigo-300 rounded-xl shadow-lg text-sm z-50">
              <div className="px-4 py-2 border-b border-indigo-300 font-semibold bg-indigo-200 text-center rounded-t-xl">
                Choose Agent
              </div>
              <div className="hover:bg-indigo-300 px-4 py-2 cursor-pointer text-center font-medium">
                ⚡ Zeta <span className="text-xs text-gray-600 ml-1">(currently selected)</span>
              </div>
              <div className="hover:bg-indigo-300 px-4 py-2 cursor-not-allowed text-center opacity-60">
                📚 Theta <span className="text-xs text-gray-600 ml-1">coming soon...</span>
              </div>
              <div className="hover:bg-indigo-300 px-4 py-2 cursor-not-allowed text-center opacity-60 rounded-b-xl">
                ❤️ Delta <span className="text-xs text-gray-600 ml-1">coming soon...</span>
              </div>
            </div>
          )}
        </div>

        <div className="px-4">
          <h1 className="text-2xl font-bold inline-flex items-center gap-2 whitespace-nowrap truncate max-w-[320px]">
            ⚡ {projectName}
          </h1>
        </div>
      </div>

      {/* 🔐 User Info + Logout */}
      {userEmail && (
        <div className="flex justify-between items-start px-4 pt-1 pb-1 text-[10px] text-gray-400">
          <div className="leading-tight space-y-0.5">
            <p>
              <span className="font-semibold">👤</span> {userEmail}
            </p>
            <p>
              <span className="font-semibold">📁</span>{' '}
              <span className="font-mono">{projectId}</span>
            </p>
            {threadId && (
              <p>
                <span className="font-semibold">🧵</span>{' '}
                <span className="font-mono break-all">{threadId}</span>
              </p>
            )}
          </div>

          <div className="flex gap-2 mt-1 items-center">
            {/* ⟳ Refresh next to Projects */}
            <RefreshButton
              variant="inline"
              onRefresh={onRefresh ?? (async () => {})}
              refreshing={refreshing ?? false}
              className="!text-xs"
            />
            <button
              onClick={() => router.push('/projects')}
              className="text-xs bg-purple-500 hover:bg-purple-600 text-white px-3 py-1 rounded-md"
            >
              Projects
            </button>
            <button
              onClick={handleLogout}
              className="text-xs bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-md"
            >
              Log Out
            </button>
          </div>
        </div>
      )}
    </>
  );
}