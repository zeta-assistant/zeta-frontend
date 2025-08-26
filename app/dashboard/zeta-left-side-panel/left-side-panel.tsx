'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import DashboardTasks from '@/components/ui/Tasks';
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

// ---------- XP helpers ----------
type MetricCounts = {
  user_messages: number;
  zeta_messages: number;
  zeta_actions: number;
  files_uploaded: number;
  files_generated: number;
  calendar_items: number;
  goals_created: number;
  goals_achieved: number;
  outreach_messages: number;
  zeta_thoughts: number;
  tasks_zeta_created: number;
  tasks_user_complete: number;
  tasks_zeta_complete: number;
  events_past: number;
  functions_built: number; // for XP only
};

const ZERO: MetricCounts = {
  user_messages: 0,
  zeta_messages: 0,
  zeta_actions: 0,
  files_uploaded: 0,
  files_generated: 0,
  calendar_items: 0,
  goals_created: 0,
  goals_achieved: 0,
  outreach_messages: 0,
  zeta_thoughts: 0,
  tasks_zeta_created: 0,
  tasks_user_complete: 0,
  tasks_zeta_complete: 0,
  events_past: 0,
  functions_built: 0,
};

const XP_WEIGHTS: Record<keyof MetricCounts, number> = {
  user_messages: 2,
  zeta_messages: 1,
  zeta_actions: 3,
  files_uploaded: 2,
  files_generated: 4,
  calendar_items: 2,
  goals_created: 5,
  goals_achieved: 10,
  outreach_messages: 2,
  zeta_thoughts: 1,
  tasks_zeta_created: 2,
  tasks_user_complete: 6,
  tasks_zeta_complete: 5,
  events_past: 1,
  functions_built: 8,
};

const LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000] as const;

function computeXP(c: MetricCounts) {
  let xp = 0;
  (Object.keys(c) as (keyof MetricCounts)[]).forEach((k) => {
    xp += (c[k] ?? 0) * (XP_WEIGHTS[k] ?? 0);
  });
  return xp;
}

function levelFromXP(totalXP: number) {
  let lvl = 1;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalXP >= LEVEL_THRESHOLDS[i]) {
      lvl = i + 1;
      break;
    }
  }
  return Math.min(lvl, 5);
}

function levelProgress(totalXP: number) {
  const level = levelFromXP(totalXP);
  const start = LEVEL_THRESHOLDS[level - 1] ?? 0;
  const next = LEVEL_THRESHOLDS[Math.min(level, 4)] ?? LEVEL_THRESHOLDS[4];
  const inLevel = Math.max(0, totalXP - start);
  const needed = Math.max(1, next - start);
  const pct = level >= 5 ? 100 : Math.min(100, Math.round((inLevel / needed) * 100));
  const remaining = level >= 5 ? 0 : Math.max(0, next - totalXP);
  return { level, pct, remaining };
}

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

  // XP state
  const [counts, setCounts] = useState<MetricCounts>(ZERO);
  const totalXP = useMemo(() => computeXP(counts), [counts]);
  const prog = useMemo(() => levelProgress(totalXP), [totalXP]);

  const PANEL_W = 'w-[320px]';
  const CARD_MIN_H = 'min-h-[220px]'; // baseline for Tasks + Functions

  // Latest thought
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

  // Fetch minimal counts used for XP (same style as Timeline)
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    async function loadCounts() {
      try {
        const nowIso = new Date().toISOString();

        const countFrom = async (table: string, apply: (q: any) => any) => {
          try {
            let q = supabase.from(table).select('*', { count: 'exact', head: true });
            q = apply(q);
            const { count, error } = await q;
            if (error) throw error;
            return count ?? 0;
          } catch {
            return 0;
          }
        };
        const tryCount = async (tables: string[], apply: (q: any) => any) => {
          for (const t of tables) {
            const n = await countFrom(t, apply);
            if (n > 0) return n;
          }
          return 0;
        };

        const [
          user_messages,
          zeta_messages,
          zeta_actions,
          files_uploaded,
          files_generated,
          calendar_items,
          goals_created,
          goals_achieved,
          outreach_messages,
          zeta_thoughts,
          tasks_zeta_created,
          tasks_user_complete,
          tasks_zeta_complete,
          events_past,
          functions_built,
        ] = await Promise.all([
          countFrom('zeta_conversation_log', (q) => q.eq('project_id', projectId).eq('role', 'user')),
          countFrom('zeta_conversation_log', (q) => q.eq('project_id', projectId).in('role', ['assistant', 'zeta'])),
          tryCount(['project_logs', 'system_logs'], (q) =>
            q.eq('project_id', projectId).neq('event', 'message').in('actor', ['zeta', 'assistant'])
          ),
          tryCount(['documents', 'project_files'], (q) => q.eq('project_id', projectId)),
          tryCount(['project_logs', 'system_logs'], (q) => q.eq('project_id', projectId).eq('event', 'file.generate')),
          countFrom('calendar_items', (q) => q.eq('project_id', projectId)),
          countFrom('goals', (q) => q.eq('project_id', projectId)),
          countFrom('goals', (q) => q.eq('project_id', projectId).in('status', ['completed', 'done', 'achieved', 'success'])),
          tryCount(['project_logs', 'system_logs'], (q) =>
            q.eq('project_id', projectId).in('event', ['outreach.send', 'notification.send', 'telegram.send'])
          ),
          tryCount(['zeta_thoughts', 'thoughts'], (q) => q.eq('project_id', projectId)),
          countFrom('tasks', (q) => q.eq('project_id', projectId).eq('task_type', 'zeta')),
          countFrom('tasks', (q) => q.eq('project_id', projectId).eq('task_type', 'user').in('status', ['completed', 'done'])),
          countFrom('tasks', (q) => q.eq('project_id', projectId).eq('task_type', 'zeta').in('status', ['completed', 'done'])),
          (async () => {
            let n = await countFrom('calendar_items', (q) => q.eq('project_id', projectId).lt('end_time', nowIso));
            if (n === 0) n = await countFrom('calendar_items', (q) => q.eq('project_id', projectId).lt('start_time', nowIso));
            return n;
          })(),
          tryCount(['custom_functions', 'functions', 'function_specs'], (q) => q.eq('project_id', projectId)),
        ]);

        if (!cancelled) {
          setCounts({
            user_messages,
            zeta_messages,
            zeta_actions,
            files_uploaded,
            files_generated,
            calendar_items,
            goals_created,
            goals_achieved,
            outreach_messages,
            zeta_thoughts,
            tasks_zeta_created,
            tasks_user_complete,
            tasks_zeta_complete,
            events_past,
            functions_built,
          });
        }
      } catch (e) {
        // Silent: sidebar XP is non-critical
        console.error('XP sidebar load error', e);
      }
    }

    loadCounts();
    const id = setInterval(loadCounts, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [projectId]);

  const thoughtText =
    latestThought ??
    (loadingThought ? 'Loading Zeta’s latest thought…' : 'No thoughts yet. Generate one to kick things off.');

  return (
    <div className="flex flex-col items-center pt-[230px] gap-4 pr-1">
      {/* ⚡ XP & Level (compact) */}
      <div className={`${PANEL_W} bg-blue-950 border border-blue-700 rounded-2xl p-3 shadow`}>
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-purple-100">User XP ⚡</div>
          <div className="px-2 py-0.5 rounded-full border border-purple-400/60 text-[11px] font-semibold text-purple-100">
            LEVEL {prog.level}
          </div>
        </div>
        <div className="mt-2 h-2.5 rounded-full bg-blue-900 overflow-hidden">
          <div
            className="h-2.5 bg-gradient-to-r from-amber-300 to-purple-400"
            style={{ width: `${prog.pct}%` }}
          />
        </div>
        <div className="mt-1 text-[11px] text-purple-300/80">
          {prog.level >= 5 ? 'Max level reached' : `${prog.remaining} XP to Level ${prog.level + 1}`}
        </div>
      </div>

      {/* 🧠 Zeta’s Thoughts */}
      <div className={`${PANEL_W} bg-indigo-100 text-indigo-900 px-4 py-3 rounded-2xl shadow border border-indigo-300 text-sm`}>
        <p className="font-bold mb-2">🧠 Zeta’s Thoughts</p>
        <p className="text-sm whitespace-pre-wrap">{thoughtText}</p>
      </div>

      {/* 📝 Daily Tasks */}
      <div className={`${PANEL_W}`}>
        <div className={`min-h-[220px] bg-yellow-50 border border-yellow-200 rounded-2xl p-3 shadow`}>
          <DashboardTasks projectId={projectId} />
        </div>
      </div>

      
      
    </div>
  );
}
