'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Clock from '@/components/Clock';
import RefreshButton from '../dashboard_buttons/refresh_button/refresh_button';
import { getPlanAndUsage } from '@/lib/plan';

type Props = {
  projectName: string;
  userEmail: string | null;
  projectId: string;
  threadId: string | null;
  setShowAgentMenu: React.Dispatch<React.SetStateAction<boolean>>;
  showAgentMenu: boolean;
  handleLogout: () => void;
  onRefresh?: () => Promise<void>;
  refreshing?: boolean;
};

/** Centered, pretty plan pill */
function PlanPill({
  plan,
  onClick,
}: {
  plan: 'free' | 'premium';
  onClick: () => void;
}) {
  const isPremium = plan === 'premium';
  const tone = isPremium
    ? {
        ring: 'ring-amber-300/50',
        border: 'border-amber-300/40',
        hover: 'hover:bg-amber-400/10',
        text: 'text-amber-100',
        ping: 'bg-amber-300',
        dot: 'bg-amber-400',
        emoji: '👑',
        label: 'Premium',
      }
    : {
        ring: 'ring-emerald-300/50',
        border: 'border-emerald-300/40',
        hover: 'hover:bg-emerald-400/10',
        text: 'text-emerald-100',
        ping: 'bg-emerald-300',
        dot: 'bg-emerald-400',
        
        label: 'User Subscription',
      };

  return (
    <button
      onClick={onClick}
      title="Manage plan & billing"
      className={[
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-full',
        'backdrop-blur-sm bg-white/10 shadow-sm border',
        tone.border,
        'ring-1', tone.ring,
        'transition-colors duration-200', tone.hover,
        'text-xs font-semibold', tone.text,
      ].join(' ')}
    >
      {/* animated status dot */}
      <span className="relative flex h-2.5 w-2.5">
        <span className={['absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping', tone.ping].join(' ')} />
        <span className={['relative inline-flex h-2.5 w-2.5 rounded-full', tone.dot].join(' ')} />
      </span>
      <span aria-hidden className="leading-none">{tone.emoji}</span>
      <span>{tone.label}</span>
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        className="h-3.5 w-3.5 opacity-80"
        fill="currentColor"
      >
        <path d="M7.05 5.293a1 1 0 011.414 0L12.172 9l-3.707 3.707a1 1 0 01-1.414-1.414L9.343 9 7.05 6.707a1 1 0 010-1.414z" />
      </svg>
    </button>
  );
}

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

  const [plan, setPlan] = useState<'free' | 'premium'>('free');
  const [limit, setLimit] = useState<number>(3);
  const [used, setUsed] = useState<number>(0);

  useEffect(() => {
    (async () => {
      const usage = await getPlanAndUsage();
      setPlan(usage.plan);
      setLimit(usage.limit);
      setUsed(usage.used);
    })();
  }, []);

  return (
    <>
      {/* 🧠 Top header */}
      <div className="flex items-center px-6 py-4 border-b border-blue-700">
        <div className="relative flex items-center gap-4 shrink-0">
          <div
            className="relative flex items-center gap-2 cursor-pointer"
            onClick={() => setShowAgentMenu((prev) => !prev)}
          >
            <img
              src="/pantheon.png"
              alt="Pantheon Logo"
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

      {/* 🔐 IDs + centered plan pill + right controls */}
      {userEmail && (
        <div className="px-4 pt-1 pb-1 text-[10px] text-gray-400">
          <div className="flex items-center w-full">
            {/* LEFT: IDs */}
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

            {/* MIDDLE: perfectly centered plan pill */}
            <div className="flex-1 flex justify-center">
              <PlanPill plan={plan} onClick={() => router.push('/settings')} />
            </div>

            {/* RIGHT: Refresh / Projects / Logout */}
            <div className="flex gap-2 items-center">
              <RefreshButton
                variant="inline"
                onRefresh={onRefresh ?? (async () => {})}
                refreshing={refreshing ?? false}
                className="!text-xs"
              />
              <button
                onClick={() => router.push('/projects')}
                className="text-xs bg-purple-500 hover:bg-purple-600 text-white px-3 py-1 rounded-md"
                title={`Projects ${used}/${limit}`}
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
        </div>
      )}
    </>
  );
}
