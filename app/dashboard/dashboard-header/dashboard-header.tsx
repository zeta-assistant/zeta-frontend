'use client';

import React, { useEffect, useState, useRef } from 'react';
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

/* ---------------- Help Button (inline) ---------------- */

function HelpButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;

    function handleClick(e: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [open]);

  const goToSupport = () => {
    setOpen(false);
    router.push('/support'); // 🔗 direct link to support page
  };

  return (
    <div className="relative" ref={wrapperRef}>
      {/* ? icon button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-indigo-300 bg-white/90 text-sm font-bold text-indigo-700 shadow-sm hover:bg-indigo-50 hover:text-indigo-900 transition-colors"
        aria-label="Help & support"
      >
        ?
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-3 text-xs shadow-lg z-50">
          <div className="mb-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Need help?
            </div>
            <div className="text-sm font-bold text-slate-900">
              Help & Support
            </div>
          </div>

          <div className="space-y-2 max-h-52 overflow-y-auto">
            <button
              type="button"
              className="w-full rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-left text-[11px] hover:bg-slate-100 transition-colors"
            >
              <div className="font-semibold text-slate-800">FAQ</div>
              <div className="mt-0.5 text-[10px] text-slate-500">
                Common questions about using Zeta & the dashboard.
              </div>
            </button>

            <button
              type="button"
              className="w-full rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-left text-[11px] hover:bg-slate-100 transition-colors"
            >
              <div className="font-semibold text-slate-800">Quick start</div>
              <div className="mt-0.5 text-[10px] text-slate-500">
                How to use chats, files, memory, and tasks.
              </div>
            </button>

            <button
              type="button"
              className="w-full rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-left text-[11px] hover:bg-slate-100 transition-colors"
            >
              <div className="font-semibold text-slate-800">
                Tips & workflows
              </div>
              <div className="mt-0.5 text-[10px] text-slate-500">
                Recommended flows and power-user tricks.
              </div>
            </button>
          </div>

          <div className="mt-3 border-t border-slate-100 pt-2 flex items-center justify-between">
            <span className="text-[10px] text-slate-500">Still stuck?</span>
            <button
              type="button"
              onClick={goToSupport}
              className="rounded-full bg-indigo-600 px-3 py-1 text-[10px] font-semibold text-white hover:bg-indigo-700 transition-colors"
            >
              Open support
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

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
        emoji: '⭐',
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
        'ring-1',
        tone.ring,
        'transition-colors duration-200',
        tone.hover,
        'text-xs font-semibold',
        tone.text,
      ].join(' ')}
    >
      {/* animated status dot */}
      <span className="relative flex h-2.5 w-2.5">
        <span
          className={[
            'absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping',
            tone.ping,
          ].join(' ')}
        />
        <span
          className={[
            'relative inline-flex h-2.5 w-2.5 rounded-full',
            tone.dot,
          ].join(' ')}
        />
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
                ⚡ Zeta{' '}
                <span className="text-xs text-gray-600 ml-1">
                  (currently selected)
                </span>
              </div>
              <div className="hover:bg-indigo-300 px-4 py-2 cursor-not-allowed text-center opacity-60">
                📚 Theta{' '}
                <span className="text-xs text-gray-600 ml-1">
                  coming soon...
                </span>
              </div>
              <div className="hover:bg-indigo-300 px-4 py-2 cursor-not-allowed text-center opacity-60 rounded-b-xl">
                ❤️ Delta{' '}
                <span className="text-xs text-gray-600 ml-1">
                  coming soon...
                </span>
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

            {/* MIDDLE: centered plan pill */}
            <div className="flex-1 flex justify-center">
              <PlanPill
                plan={plan}
                onClick={() => router.push('/settings')}
              />
            </div>

            {/* RIGHT: Refresh / Help / Projects / Logout */}
            <div className="flex gap-2 items-center">
              <RefreshButton
                variant="inline"
                onRefresh={onRefresh ?? (async () => {})}
                refreshing={refreshing ?? false}
                className="!text-xs"
              />
              <HelpButton />
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
