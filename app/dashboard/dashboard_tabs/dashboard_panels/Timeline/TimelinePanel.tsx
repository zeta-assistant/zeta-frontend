'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Props = { projectId: string };

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
  functions_built: number; // used for XP only (not shown)
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

// XP weights + levels
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
  let level = 1;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalXP >= LEVEL_THRESHOLDS[i]) {
      level = i + 1;
      break;
    }
  }
  return Math.min(level, 5);
}
function levelProgress(totalXP: number) {
  const lvl = levelFromXP(totalXP);
  const start = LEVEL_THRESHOLDS[lvl - 1] ?? 0;
  const next = LEVEL_THRESHOLDS[Math.min(lvl, 4)] ?? LEVEL_THRESHOLDS[4];
  const inLevel = Math.max(0, totalXP - start);
  const needed = Math.max(1, next - start);
  const pct = lvl >= 5 ? 100 : Math.min(100, Math.round((inLevel / needed) * 100));
  const remaining = lvl >= 5 ? 0 : Math.max(0, next - totalXP);
  return { level: lvl, inLevel, start, next, pct, remaining };
}
function confidenceForLevel(lvl: number) {
  switch (lvl) {
    case 1: return 'Weak';
    case 2: return 'Medium';
    case 3: return 'Strong';
    case 4: return 'Very Strong';
    case 5: return 'True Companion';
    default: return 'Weak';
  }
}

export default function TimelinePanel({ projectId }: Props) {
  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState<string>('');
  const [projectCreatedAt, setProjectCreatedAt] = useState<string>('');
  const [err, setErr] = useState<string | null>(null);
  const [counts, setCounts] = useState<MetricCounts>(ZERO);

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const { data: proj, error: pErr } = await supabase
          .from('user_projects')
          .select('name, created_at')
          .eq('id', projectId)
          .single();
        if (pErr) throw pErr;
        setProjectName(proj?.name ?? 'Project');
        setProjectCreatedAt(proj?.created_at ?? '');

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
          countFrom('goals', (q) =>
            q.eq('project_id', projectId).in('status', ['completed', 'done', 'achieved', 'success'])
          ),
          tryCount(['project_logs', 'system_logs'], (q) =>
            q.eq('project_id', projectId).in('event', ['outreach.send', 'notification.send', 'telegram.send'])
          ),
          tryCount(['zeta_thoughts', 'thoughts'], (q) => q.eq('project_id', projectId)),
          countFrom('tasks', (q) => q.eq('project_id', projectId).eq('task_type', 'zeta')),
          countFrom('tasks', (q) =>
            q.eq('project_id', projectId).eq('task_type', 'user').in('status', ['completed', 'done'])
          ),
          countFrom('tasks', (q) =>
            q.eq('project_id', projectId).eq('task_type', 'zeta').in('status', ['completed', 'done'])
          ),
          (async () => {
            let n = await countFrom('calendar_items', (q) => q.eq('project_id', projectId).lt('end_time', nowIso));
            if (n === 0) n = await countFrom('calendar_items', (q) => q.eq('project_id', projectId).lt('start_time', nowIso));
            return n;
          })(),
          tryCount(['custom_functions', 'functions', 'function_specs'], (q) => q.eq('project_id', projectId)),
        ]);

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
      } catch (e: any) {
        setErr(e?.message || 'Failed to load data');
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId]);

  // Duration breakdown (months / weeks / days / hours)
  const { daysSince, months, weeks, days, hours } = useMemo(() => {
    if (!projectCreatedAt) return { daysSince: 0, months: 0, weeks: 0, days: 0, hours: 0 };
    const start = new Date(projectCreatedAt);
    const end = new Date();

    const daysSince = Math.max(0, Math.ceil((end.getTime() - start.getTime()) / 86_400_000));

    let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    const mAnchor = new Date(start);
    mAnchor.setMonth(start.getMonth() + months);
    if (mAnchor > end) {
      months -= 1;
      mAnchor.setMonth(mAnchor.getMonth() - 1);
    }
    let ms = end.getTime() - mAnchor.getTime();
    const weeks = Math.floor(ms / (7 * 86_400_000));
    ms -= weeks * 7 * 86_400_000;
    const days = Math.floor(ms / 86_400_000);
    ms -= days * 86_400_000;
    const hours = Math.floor(ms / 3_600_000);

    return { daysSince, months, weeks, days, hours };
  }, [projectCreatedAt]);

  const totalXP = useMemo(() => computeXP(counts), [counts]);
  const prog = useMemo(() => levelProgress(totalXP), [totalXP]);
  const confidence = useMemo(() => confidenceForLevel(prog.level), [prog.level]);

  // --- Small components ---
  const RowSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="rounded-2xl border border-blue-700 bg-blue-950/50 p-3">
      <h3 className="text-sm font-semibold text-purple-200/90 mb-2">{title}</h3>
      <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
        {children}
      </div>
    </div>
  );

  const Chip: React.FC<{ label: string; value: number; emoji?: string }> = ({ label, value, emoji }) => (
    <div className="rounded-lg border border-blue-700 bg-blue-950/60 px-3 py-2 h-[52px] flex items-center justify-between">
      <div className="text-[12px] text-purple-200/90 flex items-center gap-1">
        {emoji && <span aria-hidden className="text-sm leading-none">{emoji}</span>}
        <span className="leading-tight">{label}</span>
      </div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );

  return (
    <div className="p-3 md:p-4 lg:p-6 text-purple-100">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="min-w-0">
          <h2 className="text-lg md:text-xl font-semibold truncate">📈 Timeline</h2>
          <p className="text-xs md:text-sm text-purple-300/80 truncate">
            {projectName
              ? `${projectName} · started ${projectCreatedAt ? new Date(projectCreatedAt).toLocaleDateString() : '—'}`
              : '—'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => location.reload()}
            className="px-3 py-1.5 rounded-md border border-blue-600 bg-blue-800 hover:bg-blue-700 text-sm"
            type="button"
          >
            Refresh
          </button>
          <div className="rounded-xl border border-blue-600 bg-blue-900/30 px-3 py-2 text-right">
            <div className="text-[11px] text-purple-300/80">Days since start</div>
            <div className="text-xl font-semibold leading-tight">{daysSince}</div>
          </div>
        </div>
      </div>

      {/* Top row (compact) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
        {/* Duration */}
        <div className="rounded-2xl border border-blue-700 bg-blue-950/50 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-purple-200/90">Project duration</div>
            <div className="text-[11px] text-purple-300/80">
              {projectCreatedAt &&
                new Date(projectCreatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { label: 'months', value: months },
              { label: 'weeks', value: weeks },
              { label: 'days', value: days },
              { label: 'hours', value: hours },
            ].map((t) => (
              <div key={t.label} className="rounded-xl border border-blue-700 bg-blue-900/40 p-2 text-center">
                <div className="text-2xl font-semibold leading-6">{t.value}</div>
                <div className="text-[11px] text-purple-300/80">{t.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* XP / Level */}
        <div className="rounded-2xl border border-blue-700 bg-blue-950/50 p-3">
          <div className="flex items-center justify-between mb-1">
            <div className="text-sm font-semibold">User XP ⚡</div>
            <div className="px-2 py-0.5 rounded-full border border-purple-400/60 text-[11px] font-semibold">
              LEVEL {prog.level}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="shrink-0">
              <div className="w-24 h-24 rounded-xl border border-blue-700 bg-blue-900/60 overflow-hidden grid place-items-center">
                <img src="/zeta-avatar.svg" alt="Zeta avatar" className="w-full h-full object-contain" />
              </div>
              <div className="mt-1 text-center text-[11px] text-purple-300/80">Zeta</div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="h-2.5 rounded-full bg-blue-900 overflow-hidden">
                <div
                  className="h-2.5 bg-gradient-to-r from-amber-300 to-purple-400"
                  style={{ width: `${prog.pct}%` }}
                />
              </div>
              <div className="mt-1 text-[11px] text-purple-300/80">
                {prog.level >= 5 ? 'Max level reached' : `${prog.remaining} XP to Level ${prog.level + 1}`}
              </div>
              <div className="mt-2 text-[12px] text-purple-200/90 leading-snug">
                <span className="font-semibold">Level {prog.level}:</span>{' '}
                How confident is Zeta in understanding your goals?{' '}
                <span className="font-semibold">{confidence}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Error */}
      {err && (
        <div className="mb-3 rounded-md border border-red-400 bg-red-900/40 p-3 text-sm text-red-200">
          {err}
        </div>
      )}

      {/* Thin rows of chips (fits on one page) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-1">
        <RowSection title="Messages">
          <Chip label="User messages" value={counts.user_messages} emoji="📨" />
          <Chip label="Zeta messages" value={counts.zeta_messages} emoji="🤖" />
          <Chip label="Outreach messages" value={counts.outreach_messages} emoji="📣" />
          <Chip label="Zeta thoughts" value={counts.zeta_thoughts} emoji="🧠" />
        </RowSection>

        <RowSection title="Automation">
          <Chip label="Autonomous actions" value={counts.zeta_actions} emoji="⚙️" />
          <Chip label="Tasks by Zeta" value={counts.tasks_zeta_created} emoji="🗒️" />
          <Chip label="Zeta tasks complete" value={counts.tasks_zeta_complete} emoji="🤝" />
          <Chip label="User tasks complete" value={counts.tasks_user_complete} emoji="🙌" />
        </RowSection>

        <RowSection title="Files">
          <Chip label="Files uploaded" value={counts.files_uploaded} emoji="📤" />
          <Chip label="Files generated" value={counts.files_generated} emoji="🧾" />
        </RowSection>

        <RowSection title="Calendar & Goals">
          <Chip label="Calendar items" value={counts.calendar_items} emoji="🗓️" />
          <Chip label="Events past" value={counts.events_past} emoji="⏱️" />
          <Chip label="Goals created" value={counts.goals_created} emoji="🎯" />
          <Chip label="Goals achieved" value={counts.goals_achieved} emoji="✅" />
        </RowSection>
      </div>

      {loading && <div className="mt-3 text-xs text-purple-300/70">Loading…</div>}
    </div>
  );
}
