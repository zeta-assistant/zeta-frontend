'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type LogRow = {
  id: string;
  project_id: string;
  actor: 'user' | 'zeta';
  event: string;
  message: string | null;
  details: Record<string, any> | null;
  created_at: string;
};

const PAGE_SIZE = 40;

/** Events that move onboarding forward */
const ONBOARDING_EVENTS = new Set<string>([
  'project.vision.update',
  'project.goals.long.update',
  'project.goals.short.update',
  'api.connect', // filtered by details below
]);

/** Debounced sync to avoid spamming the API */
function makeDebounced(fn: () => void, wait = 400) {
  let t: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      t = null;
      fn();
    }, wait);
  };
}

const EVENT_UI: Record<string, { icon: string; border: string }> = {
  'task.create': { icon: '🆕', border: 'border-lime-400' },
  'task.edit': { icon: '✏️', border: 'border-yellow-400' },
  'task.confirm': { icon: '📌', border: 'border-orange-400' },
  'task.complete': { icon: '✅', border: 'border-green-400' },
  'task.verify': { icon: '🧪', border: 'border-amber-400' },
  // files
  'file.upload': { icon: '📎', border: 'border-emerald-400' },
  'file.convert': { icon: '🔁', border: 'border-teal-400' },
  'file.generate': { icon: '🗂️', border: 'border-cyan-400' },
  // discussions
  'discussion.start': { icon: '💬', border: 'border-cyan-400' },
  // integrations
  'api.connect': { icon: '🔌', border: 'border-fuchsia-400' },
  'notification.send': { icon: '📣', border: 'border-pink-400' },
  // calendar
  'calendar.event': { icon: '🗓️', border: 'border-sky-400' },
  'calendar.reminder': { icon: '⏰', border: 'border-sky-400' },
  'calendar.note': { icon: '📝', border: 'border-sky-400' },
  // project meta
  'project.vision.update': { icon: '🎯', border: 'border-indigo-400' },
  'project.goals.short.update': { icon: '🎯', border: 'border-indigo-400' },
  'project.goals.long.update': { icon: '🏁', border: 'border-indigo-400' },
  // zeta thinking/ops
  'zeta.thought': { icon: '🤔', border: 'border-violet-400' },
  'zeta.outreach': { icon: '📨', border: 'border-violet-400' },
  // misc
  'functions.build.start': { icon: '🧩', border: 'border-pink-400' },
  'memory.insight': { icon: '🧠', border: 'border-violet-400' },
};

function formatTime(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return ts;
  }
}

function fallbackMessage(row: LogRow) {
  const d = row.details || {};
  switch (row.event) {
    case 'task.create': return `Task created: ${d.title ?? d.task_id ?? ''}`;
    case 'task.edit': return `Task edited: ${d.title ?? d.task_id ?? ''}`;
    case 'task.confirm': return `Task confirmed: ${d.title ?? d.task_id ?? ''}`;
    case 'task.complete': return `Task completed: ${d.title ?? d.task_id ?? ''}`;
    case 'task.verify': return `Task verified: ${d.title ?? d.task_id ?? ''}`;
    case 'file.upload': return `Uploaded: ${d.file_name ?? d.path ?? ''}`;
    case 'file.convert': return `Converted ${d.from ?? ''} → ${d.to ?? ''} ${d.file_name ? `(${d.file_name})` : ''}`;
    case 'file.generate': return `Generated file: ${d.file_name ?? ''}`;
    case 'discussion.start': return `Started discussion: ${d.title ?? d.discussion_id ?? ''}`;
    case 'api.connect': return `Connected API: ${d.provider ?? ''} ${d.status ? `(${d.status})` : ''}`;
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

/** Decide if the log should trigger an onboarding sync */
function isOnboardingRelevant(row: LogRow): boolean {
  if (!ONBOARDING_EVENTS.has(row.event)) return false;
  if (row.event !== 'api.connect') return true;
  // Only sync for Telegram connections explicitly marked connected
  const provider = String(row.details?.provider ?? '').toLowerCase();
  const status = String(row.details?.status ?? '').toLowerCase();
  return provider === 'telegram' && (status === 'connected' || status === 'ok' || status === 'success');
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

  // debounced POST to /api/onboarding/sync
  const syncRef = useRef(
    makeDebounced(async () => {
      try {
        await fetch('/api/onboarding/sync', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ projectId }),
        });
      } catch (e) {
        console.error('onboarding sync failed', e);
      }
    }, 400)
  );

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setErr(null);
      const { data, error } = await supabase
        .from('system_logs')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);
      if (cancelled) return;
      if (error) setErr(error.message);
      else {
        setRows((data ?? []) as LogRow[]);
        oldest.current = data?.length ? data[data.length - 1].created_at : null;
      }
      setLoading(false);
    };
    if (projectId) run();
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    const channel = supabase
      .channel(`logs_${projectId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'system_logs', filter: `project_id=eq.${projectId}` },
        (payload) => {
          const newLog = payload.new as LogRow;
          setRows((curr) => [newLog, ...curr]);

          if (isOnboardingRelevant(newLog)) {
            // debounce to avoid multiple rapid calls
            syncRef.current();
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId]);

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
    setRows((r) => [...r, ...(data as LogRow[])]);
    oldest.current = data[data.length - 1].created_at;
  };

  const filtered = useMemo(() => {
    const base = filter === 'all' ? rows : rows.filter((r) => r.actor === filter);
    if (!search.trim()) return base;
    const s = search.toLowerCase();
    return base.filter((r) => {
      const msg = (r.message || fallbackMessage(r)).toLowerCase();
      return msg.includes(s) || r.event.toLowerCase().includes(s);
    });
  }, [rows, filter, search]);

  return (
    <div className={`p-6 overflow-y-auto text-${fontSize} text-indigo-200 space-y-4`}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg text-white font-semibold">📄 System Logs</h2>
        <div className="flex gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="bg-blue-950/60 border border-indigo-500/40 rounded-md px-3 py-1 text-indigo-100 placeholder-indigo-300/50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <div className="bg-blue-950/60 border border-indigo-500/40 rounded-md overflow-hidden flex">
            {(['all', 'user', 'zeta'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`px-3 py-1 ${filter === k ? 'bg-indigo-600 text-white' : 'text-indigo-200 hover:bg-indigo-700/30'}`}
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
        <div className="space-y-3">
          {filtered.map((row) => {
            const ui = EVENT_UI[row.event] ?? { icon: '🪵', border: 'border-indigo-400' };
            const msg = row.message || fallbackMessage(row);
            const link =
              (row.details && (row.details.link_url || row.details.url || row.details.file_url)) || null;
            return (
              <div key={row.id} className={`bg-blue-950 border ${ui.border} rounded-lg p-3 shadow`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl leading-none">{ui.icon}</span>
                    <span className="text-indigo-100">{msg}</span>
                    {link ? (
                      <a
                        href={link as string}
                        className="underline text-indigo-300 hover:text-indigo-200 ml-2"
                        target="_blank"
                        rel="noreferrer"
                      >
                        open
                      </a>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full border ${
                        row.actor === 'user'
                          ? 'border-amber-400 text-amber-300'
                          : 'border-indigo-400 text-indigo-300'
                      }`}
                    >
                      {row.actor.toUpperCase()}
                    </span>
                    <span className="opacity-70">{formatTime(row.created_at)}</span>
                  </div>
                </div>
              </div>
            );
          })}
          <div className="pt-2">
            {oldest.current ? (
              <button
                onClick={loadMore}
                className="px-3 py-1 rounded-md bg-indigo-700 hover:bg-indigo-600 text-white border border-indigo-500/60"
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
