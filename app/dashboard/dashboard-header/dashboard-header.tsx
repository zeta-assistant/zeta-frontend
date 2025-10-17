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

/** Centered, pretty plan pill (hidden on mobile by parent) */
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
        emoji: '🟢',
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
      <span className="relative flex h-2.5 w-2.5">
        <span className={['absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping', tone.ping].join(' ')} />
        <span className={['relative inline-flex h-2.5 w-2.5 rounded-full', tone.dot].join(' ')} />
      </span>
      <span aria-hidden className="leading-none">{tone.emoji}</span>
      <span className="whitespace-nowrap">{tone.label}</span>
      <svg aria-hidden viewBox="0 0 20 20" className="h-3.5 w-3.5 opacity-80" fill="currentColor">
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
      {/* Top header */}
      <div className="flex flex-wrap items-center gap-3 border-b border-blue-700 px-4 py-3 md:px-6 md:py-4">
        {/* Brand + menu */}
        <div className="relative flex min-w-0 items-center gap-2">
          <button
            className="flex items-center gap-2"
            onClick={() => setShowAgentMenu((prev) => !prev)}
            aria-expanded={showAgentMenu}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/pantheon.png"
              alt="Pantheon Logo"
              className="h-8 w-8 rounded-xl shadow-md transition-transform hover:scale-105"
            />
            <h1 className="truncate text-xl font-semibold hover:underline">Zeta Dashboard</h1>
          </button>

        {/* Hide the live clock on very small screens to save space */}
          <div className="ml-2 hidden sm:block">
            <Clock />
          </div>

          {showAgentMenu && (
            <div className="absolute left-0 top-[105%] z-50 w-52 rounded-xl border border-indigo-300 bg-indigo-100 text-sm text-indigo-900 shadow-lg">
              <div className="rounded-t-xl border-b border-indigo-300 px-4 py-2 text-center font-semibold bg-indigo-200">
                Choose Agent
              </div>
              <div className="cursor-pointer px-4 py-2 text-center font-medium hover:bg-indigo-300">
                ⚡ Zeta <span className="ml-1 text-xs text-gray-600">(currently selected)</span>
              </div>
              <div className="cursor-not-allowed px-4 py-2 text-center opacity-60 hover:bg-indigo-300">
                📚 Theta <span className="ml-1 text-xs text-gray-600">coming soon...</span>
              </div>
              <div className="cursor-not-allowed rounded-b-xl px-4 py-2 text-center opacity-60 hover:bg-indigo-300">
                ❤️ Delta <span className="ml-1 text-xs text-gray-600">coming soon...</span>
              </div>
            </div>
          )}
        </div>

        {/* Project title (wraps nicely) */}
        <h1 className="min-w-0 flex-1 truncate text-2xl font-bold">
          ⚡ {projectName}
        </h1>

        {/* Controls (always visible) */}
        <div className="flex items-center gap-2">
          <RefreshButton
            variant="inline"
            onRefresh={onRefresh ?? (async () => {})}
            refreshing={refreshing ?? false}
            className="!text-xs"
          />
          <button
            onClick={() => router.push('/projects')}
            className="rounded-md bg-purple-500 px-3 py-1 text-xs text-white hover:bg-purple-600"
            title={`Projects ${used}/${limit}`}
          >
            Projects
          </button>
          <button
            onClick={handleLogout}
            className="rounded-md bg-red-500 px-3 py-1 text-xs text-white hover:bg-red-600"
          >
            Log Out
          </button>
        </div>
      </div>

      {/* IDs + Plan pill row */}
      {userEmail && (
        <div className="px-4 pb-2 pt-1 text-[10px] text-gray-400 md:px-6">
          <div className="grid grid-cols-1 items-center gap-2 md:grid-cols-3">
            {/* LEFT: IDs */}
            <div className="space-y-0.5 leading-tight">
              <p>
                <span className="font-semibold">👤</span> {userEmail}
              </p>
              <p className="truncate">
                <span className="font-semibold">📁</span>{' '}
                <span className="font-mono break-all">{projectId}</span>
              </p>
              {threadId && (
                <p className="truncate">
                  <span className="font-semibold">🧵</span>{' '}
                  <span className="font-mono break-all">{threadId}</span>
                </p>
              )}
            </div>

            {/* MIDDLE: Plan pill (hidden on mobile) */}
            <div className="hidden items-center justify-center md:flex">
              <PlanPill plan={plan} onClick={() => router.push('/settings')} />
            </div>

            {/* RIGHT: (empty spacer on md to keep symmetry) */}
            <div className="hidden md:block" />
          </div>
        </div>
      )}
    </>
  );
}
