'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import DashboardTasks from '@/components/ui/Tasks';
import dynamic from 'next/dynamic';

// ✅ Shared XP utils
import { getXPProgress, LEVELS } from '@/lib/XP';

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

type TitlesMap = Record<number, string>;
const defaultTitlesMap: TitlesMap = Object.fromEntries(
  LEVELS.map((l) => [l.level, l.title])
) as TitlesMap;

const PANEL_W = 'w-[320px]';

/* ──────────────────────────────────────────────────────────
   Helpers
─────────────────────────────────────────────────────────── */
function getFunctionsBase() {
  const base =
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    'https://inprydzukperccgtxgvx.supabase.co';
  return `${base}/functions/v1`;
}

function safeAlert(msg: string) {
  if (typeof window !== 'undefined') alert(msg);
}

async function refreshSessionIfNeeded() {
  try {
    const { data } = await supabase.auth.getSession();
    if (!data?.session) {
      await supabase.auth.refreshSession();
    }
  } catch {
    /* ignore */
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** ⛏️ Shorten / soften long run-on tokens for the Thoughts bubble */
const MAX_RUN_TOKEN = 40;
function cleanThoughtForDisplay(text: string | null): string {
  if (!text) return '';
  const zws = '\u200b'; // zero-width space so long words can wrap

  return text
    .split(/\s+/)
    .map((token) => {
      // allow wraps on snake_case / file_names
      let t = token.replace(/_/g, `_${zws}`);

      // hard cap truly huge tokens with ellipsis
      if (t.length > MAX_RUN_TOKEN) {
        t = t.slice(0, MAX_RUN_TOKEN - 1) + '…';
      }
      return t;
    })
    .join(' ');
}

/* ──────────────────────────────────────────────────────────
   Public function (call from buttons elsewhere)
─────────────────────────────────────────────────────────── */
export async function triggerDailyChatMessage(projectId: string) {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    const res = await fetch(`${getFunctionsBase()}/daily-chat-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
          ? { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY }
          : {}),
      },
      body: JSON.stringify({ project_id: projectId, trigger: 'manual' }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn('daily-chat-message failed:', res.status, text);
      safeAlert(`Failed to send message (${res.status}). Check logs.`);
      return;
    }

    safeAlert('Zeta will send you a message for this project.');
  } catch (err) {
    console.warn(err);
    safeAlert('Something went wrong triggering the message.');
  }
}

export default function ZetaLeftSidePanel({ projectId }: ZetaLeftSidePanelProps) {
  const [latestThought, setLatestThought] = useState<string | null>(null);
  const [loadingThought, setLoadingThought] = useState<boolean>(true);

  const [titles, setTitles] = useState<TitlesMap>(defaultTitlesMap);

  const [prog, setProg] = useState({
    level: 1,
    title: defaultTitlesMap[1],
    nextTitle: defaultTitlesMap[2],
    pct: 0,
    remaining: 100,
    current: 0,
    next: 100,
    total: 0,
  });

  /* ────────────────────────────────────────────────────────
     Latest thought: realtime + timed refresh (resilient)
  ──────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;
    let pollId: number | undefined;
    let currentAbort: AbortController | null = null;

    const fetchLatestThought = async (attempt = 1): Promise<void> => {
      if (cancelled) return;
      try {
        currentAbort?.abort();
      } catch {}
      currentAbort = new AbortController();

      await refreshSessionIfNeeded();

      try {
        setLoadingThought(true);
        const { data, error } = await supabase
          .from('thoughts')
          .select('content, created_at')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle<ThoughtRow>();

        if (cancelled) return;

        if (error) {
          console.warn('Latest thought fetch warn:', error);
          setLatestThought(null);

          if (attempt === 1) {
            await sleep(800);
            return fetchLatestThought(2);
          }
        } else {
          setLatestThought(data?.content ?? null);
        }
      } catch (e: any) {
        if (cancelled) return;
        if (e?.name !== 'AbortError') {
          console.warn('Latest thought fetch exception:', e?.message || e);
          if (attempt === 1) {
            await sleep(800);
            return fetchLatestThought(2);
          }
        }
        setLatestThought(null);
      } finally {
        if (!cancelled) setLoadingThought(false);
      }
    };

    fetchLatestThought();
    pollId = window.setInterval(fetchLatestThought, 60_000);

    const channel = supabase
      .channel(`thoughts-latest-${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'thoughts', filter: `project_id=eq.${projectId}` },
        () => fetchLatestThought()
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') fetchLatestThought();
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('Realtime channel issue, will auto-retry:', status);
        }
      });

    return () => {
      cancelled = true;
      if (pollId) clearInterval(pollId);
      try {
        supabase.removeChannel(channel);
      } catch {}
      try {
        currentAbort?.abort();
      } catch {}
    };
  }, [projectId]);

  /* ────────────────────────────────────────────────────────
     Load custom level titles (with periodic refresh)
  ──────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    let pollId: number | undefined;

    async function loadTitles() {
      try {
        const { data, error } = await supabase
          .from('level_titles')
          .select('level,title')
          .eq('project_id', projectId);

        if (cancelled) return;

        if (error) {
          setTitles(defaultTitlesMap);
          return;
        }

        const merged: TitlesMap = { ...defaultTitlesMap };
        (data ?? []).forEach((row: any) => {
          const lvl = Number(row?.level);
          if (Number.isFinite(lvl) && row?.title) merged[lvl] = String(row.title);
        });
        setTitles(merged);
      } catch {
        if (!cancelled) setTitles(defaultTitlesMap);
      }
    }

    loadTitles();
    pollId = window.setInterval(loadTitles, 60_000);

    const channel = supabase
      .channel(`level-titles-${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'level_titles', filter: `project_id=eq.${projectId}` },
        () => loadTitles()
      )
      .subscribe();

    return () => {
      if (pollId) clearInterval(pollId);
      try {
        supabase.removeChannel(channel);
      } catch {
        /* no-op */
      }
    };
  }, [projectId]);

  /* ────────────────────────────────────────────────────────
     XP progress — override titles using the loaded map
  ──────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    let pollId: number | undefined;

    async function loadXP() {
      try {
        const p = await getXPProgress(projectId);
        if (cancelled || !p) return;

        const curTitle = titles[p.level] ?? defaultTitlesMap[p.level] ?? `Level ${p.level}`;
        const nextLvl = Math.min(p.level + 1, LEVELS.length);
        const nextTitle = titles[nextLvl] ?? defaultTitlesMap[nextLvl] ?? `Level ${nextLvl}`;

        setProg({ ...p, title: curTitle, nextTitle });
      } catch (e) {
        console.warn('XP sidebar load warn', e);
      }
    }

    loadXP();
    pollId = window.setInterval(loadXP, 60_000);

    return () => {
      cancelled = true;
      if (pollId) clearInterval(pollId);
    };
  }, [projectId, titles]);

  const thoughtText =
    latestThought ??
    (loadingThought
      ? 'Loading Zeta’s latest thought…'
      : 'No thoughts yet. Generate one to kick things off.');

  // 🔍 Final formatted text for display (handles long run-on tokens)
  const displayThought = useMemo(
    () => cleanThoughtForDisplay(thoughtText),
    [thoughtText]
  );

  const maxed = prog.remaining === 0 && prog.level >= LEVELS.length;
  const pct = Math.min(100, Math.max(0, prog.pct));

  return (
    <div className="flex flex-col items-center pt-[230px] gap-4 pr-1">
      {/* ⚡ Zeta XP & Level (compact) */}
      <div className={`${PANEL_W} shrink-0 bg-blue-950 border border-blue-700 rounded-2xl p-3 shadow`}>
        {/* Header row: Zeta name + level badge */}
        <div className="flex items-center gap-2 mb-1">
          <div className="text-sm font-medium text-purple-100">Zeta⚡</div>
          <span className="px-2 py-0.5 rounded-full border border-purple-400/60 text-[10px] font-semibold text-purple-100 whitespace-nowrap">
            LEVEL {prog.level}
          </span>
        </div>

        {/* Assistant title */}
        <div className="mb-2">
          <span className="inline-block px-2 py-0.5 rounded-full border border-blue-500/60 text-[11px] font-semibold text-blue-100 bg-blue-900/40 whitespace-nowrap">
            {prog.title}
          </span>
        </div>

        {/* progress bar */}
        <div className="h-2.5 rounded-full bg-blue-900 overflow-hidden">
          <div
            className="h-2.5 bg-gradient-to-r from-amber-300 to-purple-400"
            style={{ width: `${pct}%` }}
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
      <div
        className={`${PANEL_W} shrink-0 bg-indigo-100 text-indigo-900 px-4 py-3 rounded-2xl shadow border border-indigo-300 text-sm`}
      >
        <p className="font-bold mb-2">💭 Zeta’s Thoughts</p>
        {/* break-words so it wraps nicely even if something sneaks through */}
        <p className="text-sm whitespace-pre-wrap break-words">
          {displayThought}
        </p>
      </div>

      {/* 📝 Daily Tasks */}
      <div className={`${PANEL_W} flex-1 self-stretch min-h-0`}>
        <div className="h-full bg-yellow-50 border border-yellow-200 rounded-2xl p-3 shadow overflow-auto">
          <DashboardTasks projectId={projectId} />
        </div>
      </div>

      {/* <FunctionsPanel projectId={projectId} /> */}
    </div>
  );
}
