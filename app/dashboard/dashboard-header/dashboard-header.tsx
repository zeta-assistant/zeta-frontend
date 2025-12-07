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
  const [view, setView] = useState<'root' | 'faq' | 'privacy'>('root');
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

  // When popup closes, reset to root
  useEffect(() => {
    if (!open) setView('root');
  }, [open]);

  const goToSupport = () => {
    setOpen(false);
    setView('root');
    router.push('/support');
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
          {/* Header */}
          <div className="mb-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Need help?
            </div>
            <div className="text-sm font-bold text-slate-900">
              {view === 'root'
                ? 'Help & Support'
                : view === 'faq'
                ? 'FAQ'
                : 'Privacy & Data'}
            </div>
          </div>

          {/* BODY: ROOT VIEW */}
          {view === 'root' && (
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {/* FAQ card */}
              <button
                type="button"
                onClick={() => setView('faq')}
                className="w-full rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-left text-[11px] hover:bg-slate-100 transition-colors"
              >
                <div className="font-semibold text-slate-800 flex items-center justify-between">
                  <span>FAQ</span>
                  <span className="text-[10px] text-slate-500">View all</span>
                </div>
                <div className="mt-0.5 text-[10px] text-slate-500">
                  Common questions about using Zeta & the dashboard.
                </div>
              </button>

              {/* Quick start */}
              <button
                type="button"
                className="w-full rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-left text-[11px] hover:bg-slate-100 transition-colors"
              >
                <div className="font-semibold text-slate-800">Quick start</div>
                <div className="mt-0.5 text-[10px] text-slate-500">
                  How to use chats, files, memory, and tasks.
                </div>
              </button>

              {/* Tips */}
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

              {/* Privacy & Data card */}
              <button
                type="button"
                onClick={() => setView('privacy')}
                className="w-full rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-left text-[11px] hover:bg-indigo-100 transition-colors"
              >
                <div className="font-semibold text-slate-800 flex items-center justify-between">
                  <span>Privacy & Data</span>
                  <span className="text-[10px] text-indigo-600">How it works</span>
                </div>
                <div className="mt-0.5 text-[10px] text-slate-600">
                  How your chats, files, and project data are stored & protected.
                </div>
              </button>
            </div>
          )}

          {/* BODY: FAQ VIEW */}
          {view === 'faq' && (
            <div className="max-h-52 overflow-y-auto">
              {/* Back row */}
              <div className="flex items-center justify-between mb-2">
                <button
                  type="button"
                  onClick={() => setView('root')}
                  className="inline-flex items-center gap-1 text-[10px] text-slate-600 hover:text-slate-900"
                >
                  <span aria-hidden>←</span>
                  <span>Back</span>
                </button>
                <span className="text-[10px] text-slate-400">
                  Zeta dashboard FAQ
                </span>
              </div>

              <p className="text-[10px] text-slate-500 mb-2">
                A few common questions to get you started. Detailed answers live on
                the full support page.
              </p>

              <div className="space-y-2 text-[11px] text-slate-800">
                <div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5">
                  <div className="font-semibold">
                    1. How do I start a new chat with Zeta?
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-600">
                    Use the main chat box on the Chatboard tab. Each project has
                    its own thread(s) and memory.
                  </div>
                </div>

                <div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5">
                  <div className="font-semibold">
                    2. Where do I upload files for this project?
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-600">
                    Go to the Files panel and drag &amp; drop documents. Zeta will
                    index them for search and context.
                  </div>
                </div>

                <div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5">
                  <div className="font-semibold">
                    3. What does “memory” mean here?
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-600">
                    Memory is what Zeta remembers for this project over time:
                    goals, decisions, and important notes.
                  </div>
                </div>

                <div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5">
                  <div className="font-semibold">
                    4. How do I reset a conversation or thread?
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-600">
                    Use the &quot;Clear chat&quot; or new-thread controls in the
                    Chatboard. This starts fresh without deleting logs.
                  </div>
                </div>

                <div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5 mb-1">
                  <div className="font-semibold">
                    5. How do I report a bug or request a feature?
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-600">
                    Click &quot;Open support&quot; below to jump to the support
                    page, or contact us via the site footer.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* BODY: PRIVACY VIEW */}
          {view === 'privacy' && (
            <div className="max-h-52 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <button
                  type="button"
                  onClick={() => setView('root')}
                  className="inline-flex items-center gap-1 text-[10px] text-slate-600 hover:text-slate-900"
                >
                  <span aria-hidden>←</span>
                  <span>Back</span>
                </button>
                <span className="text-[10px] text-slate-400">
                  Privacy overview
                </span>
              </div>

              <p className="text-[10px] text-slate-500 mb-2">
                High-level summary of how your data is handled inside Zeta. For full
                details, see the Privacy Policy.
              </p>

              <ul className="space-y-1.5 text-[10px] text-slate-700">
                <li>
                  <span className="font-semibold">• Your data belongs to you.</span>{' '}
                  Projects, chats, and files are never sold or shared with advertisers.
                </li>
                <li>
                  <span className="font-semibold">• Stored securely.</span> Data is
                  stored in Supabase with row-level security and encrypted storage.
                </li>
                <li>
                  <span className="font-semibold">• Encrypted in transit.</span> All
                  traffic uses HTTPS (TLS).
                </li>
                <li>
                  <span className="font-semibold">
                    • AI model access is processing-only.
                  </span>{' '}
                  Data is sent to the model provider only to generate responses, not to
                  train models.
                </li>
                <li>
                  <span className="font-semibold">• You control deletion.</span> You
                  can delete files, chats, or whole projects from inside the app.
                </li>
              </ul>

              <button
                type="button"
                onClick={() => router.push('/privacy')}
                className="mt-3 inline-flex items-center justify-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-100"
              >
                View full Privacy Policy
              </button>
            </div>
          )}

          {/* FOOTER */}
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
    {/* Brand → redirect to root "/" */}
    <button
      type="button"
      className="relative flex items-center gap-2 cursor-pointer focus:outline-none"
      onClick={() => router.push('/')}   // 👈 root of pnthn.dev or localhost:3000
    >
      <img
        src="/zeta-letterlogo.png"
        alt="Zeta Letter Logo"
        className="w-8 h-8 rounded-xl shadow-md hover:scale-105 transition-transform"
      />
      <h1 className="text-xl font-semibold whitespace-nowrap hover:underline">
        Zeta Dashboard
      </h1>
    </button>

    <Clock />
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
