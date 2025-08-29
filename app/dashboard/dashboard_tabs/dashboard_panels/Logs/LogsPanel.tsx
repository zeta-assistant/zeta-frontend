'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { XP_WEIGHTS } from '@/lib/XP';

type LogRow = {
  id: string;
  project_id: string;
  actor: 'user' | 'zeta';
  event: string;
  message: string | null;
  details: Record<string, any> | null;
  created_at: string;
};

type TaskRow = {
  id: string;
  project_id: string;
  task_type: 'zeta' | 'user'; // who it's for, not creator
  title: string;
  status:
    | 'draft'
    | 'under_construction'
    | 'in_progress'
    | 'confirmed'
    | 'completed'
    | 'cancelled';
  created_at: string;
  updated_at: string | null;
};

const PAGE_SIZE = 40;

/** Onboarding triggers */
const ONBOARDING_EVENTS = new Set<string>([
  'project.vision.update',
  'project.goals.long.update',
  'project.goals.short.update',
  'api.connect',
]);

/** debounce helper */
function makeDebounced(fn: () => void, wait = 400) {
  let t: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      t = null; fn();
    }, wait);
  };
}

const EVENT_ICON: Record<string, string> = {
  'task.create': '🆕',
  'task.edit': '✏️',
  'task.confirm': '📌',
  'task.complete': '✅',
  'task.verify': '🧪',
  'task.delete': '🗑️',         // NEW
  'goal.delete': '🗑️',         // NEW
  'calendar.delete': '🗑️',     // NEW
  'file.upload': '📎',
  'file.convert': '🔁',
  'file.generate': '🗂️',
  'discussion.start': '💬',
  'api.connect': '🔌',
  'notification.send': '📣',
  'calendar.event': '🗓️',
  'calendar.reminder': '⏰',
  'calendar.note': '📝',
  'project.vision.update': '🎯',
  'project.goals.short.update': '🎯',
  'project.goals.long.update': '🏁',
  'zeta.thought': '🤔',
  'zeta.outreach': '📨',
  'functions.build.start': '🧩',
  'memory.insight': '🧠',
};

function formatTime(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch { return ts; }
}

function fallbackMessage(row: LogRow) {
  const d = row.details || {};
  switch (row.event) {
    case 'task.create': return `Task created: ${d.title ?? d.task_id ?? ''}`;
    case 'task.edit': return `Task edited: ${d.title ?? d.task_id ?? ''}`;
    case 'task.confirm': return `Task confirmed: ${d.title ?? d.task_id ?? ''}`;
    case 'task.complete': return `Task completed: ${d.title ?? d.task_id ?? ''}`;
    case 'task.verify': return `Task verified: ${d.title ?? d.task_id ?? ''}`;
    case 'task.delete': return `Task deleted: ${d.title ?? d.task_id ?? ''}`;                 // NEW
    case 'goal.delete': return `Goal deleted: ${d.title ?? d.goal_id ?? ''}`;                 // NEW
    case 'calendar.delete': {                                                                 // NEW
      const when = d.when ?? d.start ?? d.start_time ?? d.start_at ?? '';
      return `Calendar item deleted: ${d.title ?? d.calendar_id ?? ''}${when ? ` on ${when}` : ''}`;
    }
    case 'file.upload': return `Uploaded: ${d.file_name ?? d.path ?? ''}`;
    case 'file.convert': return `Converted ${d.from ?? ''} → ${d.to ?? ''}${d.file_name ? ` (${d.file_name})` : ''}`;
    case 'file.generate': return `Generated file: ${d.file_name ?? ''}`;
    case 'discussion.start': return `Started discussion: ${d.title ?? d.discussion_id ?? ''}`;
    case 'api.connect': return `Connected API: ${d.provider ?? ''}${d.status ? ` (${d.status})` : ''}`;
    case 'notification.send': return `Notification sent: ${d.channel ?? ''}${d.title ? ` – ${d.title}` : ''}`;
    case 'calendar.event': return `Event created: ${d.title ?? ''} on ${d.when ?? ''}`;
    case 'calendar.reminder': return `Reminder created: ${d.title ?? ''} on ${d.when ?? ''}`;
    case 'calendar.note': return `Calendar note added: ${d.title ?? ''} on ${d.when ?? ''}`;
    case 'project.vision.update': return `Vision updated`;
    case 'project.goals.short.update': return `Short-term goals updated`;
    case 'project.goals.long.update': return `Long-term goals updated`;
    case 'zeta.thought': return `Zeta thought: ${d.summary ?? ''}`;
    case 'zeta.outreach': return `Zeta outreach: ${d.recipient ?? d.channel ?? ''}`;
    case 'functions.build.start': return `Function build started: ${d.name ?? ''}`;
    case 'memory.insight': return `Memory updated: ${d.summary ?? ''}`;
    default: return row.message || row.event;
  }
}

function isOnboardingRelevant(row: LogRow): boolean {
  if (!ONBOARDING_EVENTS.has(row.event)) return false;
  if (row.event !== 'api.connect') return true;
  const provider = String(row.details?.provider ?? '').toLowerCase();
  const status = String(row.details?.status ?? '').toLowerCase();
  return provider === 'telegram' && (status === 'connected' || status === 'ok' || status === 'success');
}

/* ---------- synthetic task logs ---------- */
function toCreateLog(t: TaskRow): LogRow {
  return {
    id: `task-create:${t.id}:${t.created_at}`,
    project_id: t.project_id,
    actor: 'zeta',
    event: 'task.create',
    message: null,
    details: { task_id: t.id, title: t.title, type: t.task_type, status: t.status },
    created_at: t.created_at,
  };
}
function eventFromStatus(s: TaskRow['status']) {
  if (s === 'completed') return 'task.complete';
  if (s === 'in_progress' || s === 'confirmed') return 'task.confirm';
  return 'task.edit';
}
function toUpdateLog(t: TaskRow): LogRow {
  const evt = eventFromStatus(t.status);
  const ts = t.updated_at ?? t.created_at;
  return {
    id: `task-update:${t.id}:${ts}:${evt}`,
    project_id: t.project_id,
    actor: t.task_type === 'user' ? 'user' : 'zeta',
    event: evt,
    message: null,
    details: { task_id: t.id, title: t.title, type: t.task_type, status: t.status },
    created_at: ts,
  };
}
/* NEW: synthetic delete logs */
function toTaskDeleteLog(oldRow: any): LogRow {
  const now = new Date().toISOString();
  return {
    id: `task-delete:${oldRow.id}:${now}`,
    project_id: oldRow.project_id,
    actor: (oldRow.task_type === 'user') ? 'user' : 'zeta',
    event: 'task.delete',
    message: null,
    details: { task_id: oldRow.id, title: oldRow.title ?? '', type: oldRow.task_type ?? 'zeta' },
    created_at: now,
  };
}
function toGoalDeleteLog(oldRow: any): LogRow {
  const now = new Date().toISOString();
  const createdBy = (oldRow.created_by ?? '').toLowerCase();
  return {
    id: `goal-delete:${oldRow.id}:${now}`,
    project_id: oldRow.project_id,
    actor: (createdBy === 'zeta' || createdBy === 'assistant') ? 'zeta' : 'user',
    event: 'goal.delete',
    message: null,
    details: { goal_id: oldRow.id, title: oldRow.title ?? oldRow.name ?? '', status: oldRow.status ?? null },
    created_at: now,
  };
}
function toCalendarDeleteLog(oldRow: any): LogRow {
  const now = new Date().toISOString();
  const createdBy = (oldRow.created_by ?? '').toLowerCase();
  const when = oldRow.when ?? oldRow.start ?? oldRow.start_time ?? oldRow.start_at ?? null;
  return {
    id: `calendar-delete:${oldRow.id}:${now}`,
    project_id: oldRow.project_id,
    actor: (createdBy === 'zeta' || createdBy === 'assistant') ? 'zeta' : 'user',
    event: 'calendar.delete',
    message: null,
    details: { calendar_id: oldRow.id, title: oldRow.title ?? oldRow.name ?? '', when },
    created_at: now,
  };
}

/* de-dupe (expanded key to handle goal/calendar ids) */
function dedupeRows(rows: LogRow[]) {
  const seen = new Set<string>(); const out: LogRow[] = [];
  for (const r of rows) {
    const d: any = r.details || {};
    const entityId = d.task_id || d.goal_id || d.calendar_id || '';
    const key = `${r.event}:${entityId}:${r.created_at}:${r.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/** XP per log */
function xpFor(row: LogRow): number | null {
  const d = row.details || {};
  switch (row.event) {
    case 'task.create': return XP_WEIGHTS.tasks_zeta_created;
    case 'task.complete': return d.type === 'user' ? XP_WEIGHTS.tasks_user_complete : XP_WEIGHTS.tasks_zeta_complete;
    case 'notification.send':
    case 'zeta.outreach': return XP_WEIGHTS.outreach_messages;
    case 'zeta.thought': return XP_WEIGHTS.zeta_thoughts;
    case 'file.upload': return XP_WEIGHTS.files_uploaded;
    case 'file.generate': return XP_WEIGHTS.files_generated;
    case 'calendar.event':
    case 'calendar.reminder':
    case 'calendar.note': return XP_WEIGHTS.calendar_items;
    case 'project.goals.short.update':
    case 'project.goals.long.update': return XP_WEIGHTS.goals_created;
    case 'functions.build.start': return XP_WEIGHTS.functions_built;
    // deletions: neutral XP
    case 'task.delete':
    case 'goal.delete':
    case 'calendar.delete':
      return null;
    default: return null;
  }
}

export default function LogsPanel({
  fontSize,
  projectId,
}: { fontSize: 'sm' | 'base' | 'lg'; projectId: string }) {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'user' | 'zeta'>('all');
  const [search, setSearch] = useState('');
  const oldest = useRef<string | null>(null);

  const syncRef = useRef(
    makeDebounced(async () => {
      try {
        await fetch('/api/onboarding/sync', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ projectId }),
        });
      } catch (e) { console.error('onboarding sync failed', e); }
    }, 400)
  );

  // initial load
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true); setErr(null);
      try {
        const [{ data: sys, error: sysErr }, { data: tasks, error: tErr }] = await Promise.all([
          supabase.from('system_logs').select('*').eq('project_id', projectId)
            .order('created_at', { ascending: false }).limit(PAGE_SIZE),
          supabase.from('task_items')
            .select('id,project_id,task_type,title,status,created_at,updated_at')
            .eq('project_id', projectId).order('created_at', { ascending: false }).limit(20),
        ]);
        if (sysErr) throw sysErr;
        if (tErr) throw tErr;

        const sysRows = (sys ?? []) as LogRow[];
        const taskRows = (tasks ?? []) as unknown as TaskRow[];

        const synthetic: LogRow[] = [];
        for (const t of taskRows) {
          synthetic.push(toCreateLog(t));
          if (t.updated_at && t.updated_at !== t.created_at) synthetic.push(toUpdateLog(t));
        }

        const merged = dedupeRows([...sysRows, ...synthetic]).sort(
          (a, b) => (a.created_at < b.created_at ? 1 : -1)
        );

        if (!cancelled) {
          setRows(merged);
          oldest.current = sysRows.length ? sysRows[sysRows.length - 1].created_at : null;
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || 'Failed to load logs.');
        console.error('LogsPanel load error:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    if (projectId) run();
    return () => { cancelled = true; };
  }, [projectId]);

  // realtime
  useEffect(() => {
    if (!projectId) return;

    const logsChannel = supabase
      .channel(`logs_${projectId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'system_logs', filter: `project_id=eq.${projectId}` },
        (payload) => {
          const newLog = payload.new as LogRow;
          setRows((curr) => dedupeRows([newLog, ...curr]));
          if (isOnboardingRelevant(newLog)) syncRef.current();
        })
      .subscribe();

    const tasksChannel = supabase
      .channel(`tasks_${projectId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'task_items', filter: `project_id=eq.${projectId}` },
        (payload) => setRows((curr) => dedupeRows([toCreateLog(payload.new as any), ...curr])))
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'task_items', filter: `project_id=eq.${projectId}` },
        (payload) => setRows((curr) => dedupeRows([toUpdateLog(payload.new as any), ...curr])))
      // NEW: deletions
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'task_items', filter: `project_id=eq.${projectId}` },
        (payload) => setRows((curr) => dedupeRows([toTaskDeleteLog(payload.old as any), ...curr])))
      .subscribe();

    // NEW: goal deletions
    const goalsChannel = supabase
      .channel(`goals_${projectId}`)
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'goals', filter: `project_id=eq.${projectId}` },
        (payload) => setRows((curr) => dedupeRows([toGoalDeleteLog(payload.old as any), ...curr])))
      .subscribe();

    // NEW: calendar deletions
    const calChannel = supabase
      .channel(`calendar_${projectId}`)
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'calendar_items', filter: `project_id=eq.${projectId}` },
        (payload) => setRows((curr) => dedupeRows([toCalendarDeleteLog(payload.old as any), ...curr])))
      .subscribe();

    return () => {
      supabase.removeChannel(logsChannel);
      supabase.removeChannel(tasksChannel);
      supabase.removeChannel(goalsChannel);
      supabase.removeChannel(calChannel);
    };
  }, [projectId]);

  // pagination for system_logs
  const loadMore = async () => {
    if (!projectId || !oldest.current) return;
    const { data, error } = await supabase
      .from('system_logs')
      .select('*')
      .eq('project_id', projectId)
      .lt('created_at', oldest.current)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    if (error) return;
    if (!data?.length) { oldest.current = null; return; }
    setRows((r) =>
      dedupeRows([...r, ...(data as LogRow[])]).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    );
    oldest.current = data[data.length - 1].created_at;
  };

  const filtered = useMemo(() => {
    const base = filter === 'all' ? rows : rows.filter((r) => r.actor === filter);
    if (!search.trim()) return base;
    const s = search.toLowerCase();
    return base.filter((r) => {
      const msg = (r.message || fallbackMessage(r)).toLowerCase();
      const title = String(r.details?.title ?? '').toLowerCase();
      return msg.includes(s) || title.includes(s) || r.event.toLowerCase().includes(s);
    });
  }, [rows, filter, search]);

  return (
    <div className={`p-4 overflow-y-auto text-${fontSize} text-blue-100 bg-blue-950/60 space-y-3 rounded-xl`}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg text-white font-semibold">📄 System Logs</h2>
        <div className="flex gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="bg-blue-900/60 border border-blue-400/40 rounded-md px-3 py-1 text-blue-100 placeholder-blue-200/60 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <div className="bg-blue-900/60 border border-blue-400/40 rounded-md overflow-hidden flex">
            {(['all', 'user', 'zeta'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`px-3 py-1 ${filter === k ? 'bg-blue-600 text-white' : 'text-blue-100 hover:bg-blue-700/40'}`}
              >
                {k === 'all' ? 'All' : k === 'user' ? 'User' : 'Zeta'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {err && <div className="bg-red-900/40 border border-red-500 rounded-lg p-3">Error: {err}</div>}

      {loading && !rows.length ? (
        <div className="opacity-70">Loading logs…</div>
      ) : filtered.length ? (
        <div className="space-y-2">
          {filtered.map((row) => {
            const icon = EVENT_ICON[row.event] ?? '🪵';
            const msg = row.message || fallbackMessage(row);
            const xp = xpFor(row);
            const link =
              (row.details && (row.details.link_url || row.details.url || row.details.file_url)) || null;

            return (
              <div
                key={row.id}
                className="rounded-lg bg-blue-900/50 border border-yellow-400/70 ring-1 ring-yellow-300/30 shadow hover:shadow-md transition-shadow"
              >
                {/* COMPACT SINGLE-LINE ROW */}
                <div className="flex items-center gap-3 px-3 h-10">
                  <span className="text-base leading-none">{icon}</span>

                  {/* message: single line + ellipsis; cuts off near right chips */}
                  <div className="flex-1 min-w-0 whitespace-nowrap overflow-hidden text-ellipsis text-blue-50">
                    {msg}
                    {link ? (
                      <a
                        href={link as string}
                        className="underline text-yellow-300 hover:text-yellow-200 ml-2"
                        target="_blank"
                        rel="noreferrer"
                      >
                        open
                      </a>
                    ) : null}
                  </div>

                  {/* XP */}
                  {typeof xp === 'number' && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full border border-yellow-300/70 bg-yellow-200/20 text-yellow-200 shrink-0">
                      ⚡ +{xp} XP
                    </span>
                  )}

                  {/* actor */}
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0
                      ${row.actor === 'user'
                        ? 'border-amber-300/70 text-amber-200'
                        : 'border-blue-300/70 text-blue-200'}`}
                  >
                    {row.actor.toUpperCase()}
                  </span>

                  {/* time */}
                  <span className="opacity-80 text-blue-200 text-xs shrink-0">
                    {formatTime(row.created_at)}
                  </span>
                </div>
              </div>
            );
          })}
          <div className="pt-1">
            {oldest.current ? (
              <button
                onClick={loadMore}
                className="px-3 py-1 rounded-md bg-blue-700 hover:bg-blue-600 text-white border border-blue-500/60"
              >
                Load older
              </button>
            ) : (
              <div className="opacity-60 text-sm">No more logs.</div>
            )}
          </div>
        </div>
      ) : (
        <div className="opacity-70">No logs yet — go do stuff 😄</div>
      )}
    </div>
  );
}
