'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import DashboardDailyTasks from '@/components/ui/DashboardDailyTasks';
import dynamic from 'next/dynamic';

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

  const PANEL_W = 'w-[320px]';
  const CARD_MIN_H = 'min-h-[220px]'; // baseline for Tasks + Functions

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
    fetchLatestThought();
    const id = setInterval(fetchLatestThought, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [projectId]);

  const thoughtText =
    latestThought ??
    (loadingThought ? 'Loading Zeta’s latest thought…' : 'No thoughts yet. Generate one to kick things off.');

  return (
    <div className="flex flex-col items-center pt-[230px] gap-4 pr-1">
      {/* 🧠 Zeta’s Thoughts — auto height (no min-h) so there’s no empty bottom area */}
      <div
        className={`${PANEL_W} bg-indigo-100 text-indigo-900 px-4 py-3 rounded-2xl shadow border border-indigo-300 text-sm`}
      >
        <p className="font-bold mb-2">🧠 Zeta’s Thoughts</p>
        <p className="text-sm whitespace-pre-wrap">{thoughtText}</p>
      </div>

      {/* 📝 Daily Tasks */}
      <div className={`${PANEL_W}`}>
        <div className={`${CARD_MIN_H} bg-yellow-50 border border-yellow-200 rounded-2xl p-3 shadow`}>
          <DashboardDailyTasks projectId={projectId} />
        </div>
      </div>

      {/* ⚙️ Running Functions (filled teal) */}
      <div className={`${PANEL_W}`}>
        <div className={`${CARD_MIN_H}`}>
          <FunctionsPanel projectId={projectId} variant="compact" />
        </div>
      </div>
    </div>
  );
}