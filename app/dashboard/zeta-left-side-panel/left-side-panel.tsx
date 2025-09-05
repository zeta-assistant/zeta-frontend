'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import DashboardTasks from '@/components/ui/Tasks';
import dynamic from 'next/dynamic';

// ✅ Shared XP utils
import { getXPProgress } from '@/lib/XP';

const FunctionsPanel = dynamic(
  () => import('@/components/functions/FunctionsPanel').then((m) => m.default),
  { ssr: false }
);

export type ZetaLeftSidePanelProps = {
  projectId: string;
  recentDocs?: { file_name: string; file_url: string }[];
};

type ThoughtRow = {
  content: string | null;
  created_at: string;
};

const PANEL_W = 'w-[320px]';

// ---------- Public function ----------
export async function triggerDailyChatMessage(projectId: string) {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    const res = await fetch(
      'https://inprydzukperccgtxgvx.supabase.co/functions/v1/daily-chat-message',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          ...(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
            ? { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY }
            : {}),
        },
        body: JSON.stringify({ project_id: projectId, trigger: 'manual' }),
      }
    );

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('daily-chat-message failed:', res.status, text);
      alert('Failed to send message. Check logs.');
      return;
    }

    alert('Zeta will send you a message for this project.');
  } catch (err) {
    console.error(err);
    alert('Something went wrong triggering the message.');
  }
}

export default function ZetaLeftSidePanel({ projectId }: ZetaLeftSidePanelProps) {
  const [latestThought, setLatestThought] = useState<string | null>(null);
  const [loadingThought, setLoadingThought] = useState<boolean>(true);

  // XP progress (from shared lib)
  const [prog, setProg] = useState({
    level: 1,
    title: 'Junior Assistant',
    nextTitle: 'Associate Assistant',
    pct: 0,
    remaining: 100,
    current: 0,
    next: 100,
    total: 0,
  });

  // 🧠 Latest thought
  useEffect(() => {
    let cancelled = false;

    async function fetchLatestThought() {
      setLoadingThought(true);
      const { data, error } = await supabase
        .from('thoughts')
        .select('content, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle<ThoughtRow>();

      if (!cancelled) {
        if (error) {
          console.error('Failed to load latest thought:', error);
          setLatestThought(null);
        } else {
          setLatestThought(data?.content ?? null);
        }
        setLoadingThought(false);
      }
    }

    if (projectId) {
      fetchLatestThought();
      const id = setInterval(fetchLatestThought, 60_000);
      return () => {
        cancelled = true;
        clearInterval(id);
      };
    }
  }, [projectId]);

  // ⚡ XP progress (poll lightly)
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    async function loadXP() {
      try {
        const p = await getXPProgress(projectId);
        if (!cancelled && p) setProg(p);
      } catch (e) {
        console.error('XP sidebar load error', e);
      }
    }

    loadXP();
    const id = setInterval(loadXP, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [projectId]);

  const thoughtText =
    latestThought ??
    (loadingThought ? 'Loading Zeta’s latest thought…' : 'No thoughts yet. Generate one to kick things off.');

  const maxed = prog.remaining === 0 && prog.level >= 10;

  return (
    <div className="flex flex-col items-center pt-[230px] gap-4 pr-1">
      {/* ⚡ Zeta XP & Level (compact) */}
      <div className={`${PANEL_W} shrink-0 bg-blue-950 border border-blue-700 rounded-2xl p-3 shadow`}>
        <div className="flex items-center justify-between">
          {/* Left: "Zeta XP ⚡" with title badge right next to it */}
          <div className="flex items-center gap-2">
            <div className="text-sm font-medium text-purple-100">
              Zeta XP <span aria-hidden>⚡</span>
            </div>
            <span className="px-2 py-0.5 rounded-full border border-blue-500/60 text-[11px] font-semibold text-blue-100 bg-blue-900/40">
              {prog.title}
            </span>
          </div>
          {/* Right: Level badge */}
          <div className="px-2 py-0.5 rounded-full border border-purple-400/60 text-[11px] font-semibold text-purple-100">
            LEVEL {prog.level}
          </div>
        </div>

        {/* progress bar */}
        <div className="mt-2 h-2.5 rounded-full bg-blue-900 overflow-hidden">
          <div
            className="h-2.5 bg-gradient-to-r from-amber-300 to-purple-400"
            style={{ width: `${Math.min(100, Math.max(0, prog.pct))}%` }}
          />
        </div>

        {/* helper text */}
        <div className="mt-1 text-[11px] text-purple-300/80">
          {maxed
            ? `Max level reached · Total XP: ${prog.total.toLocaleString()}`
            : `${prog.current} / ${prog.next} XP · ${prog.remaining} XP to ${prog.nextTitle}`}
        </div>
      </div>

      {/* 🧠 Zeta’s Thoughts */}
      <div className={`${PANEL_W} shrink-0 bg-indigo-100 text-indigo-900 px-4 py-3 rounded-2xl shadow border border-indigo-300 text-sm`}>
        <p className="font-bold mb-2">🧠 Zeta’s Thoughts</p>
        <p className="text-sm whitespace-pre-wrap">{thoughtText}</p>
      </div>

      {/* 📝 Daily Tasks */}
<div className={`${PANEL_W} flex-1 self-stretch min-h-0`}>
  <div className="h-full bg-yellow-50 border border-yellow-200 rounded-2xl p-3 shadow overflow-auto">
    <DashboardTasks projectId={projectId} />
  </div>
</div>

      {/* (Optional) Functions panel or other modules */}
      {/* <FunctionsPanel projectId={projectId} /> */}
    </div>
  );
}
