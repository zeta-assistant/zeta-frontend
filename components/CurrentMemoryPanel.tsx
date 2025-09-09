'use client';

import React, { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type Props = { userEmail: string | null; projectId: string };

type LogRow = {
  id: string;
  project_id: string;
  actor?: 'user' | 'zeta';
  event: string;
  message: string | null;
  details: Record<string, any> | null;
  created_at: string;
};

/* ---------- Helpers ---------- */
const EVENT_UI: Record<string, { icon: string; border: string }> = {
  'task.create': { icon: '🆕', border: 'border-lime-400' },
  'task.edit': { icon: '✏️', border: 'border-yellow-400' },
  'task.confirm': { icon: '📌', border: 'border-orange-400' },
  'task.complete': { icon: '✅', border: 'border-green-400' },
  'task.verify': { icon: '🧪', border: 'border-amber-400' },
  'file.upload': { icon: '📎', border: 'border-emerald-400' },
  'file.convert': { icon: '🔁', border: 'border-teal-400' },
  'file.generate': { icon: '🗂️', border: 'border-cyan-400' },
  'discussion.start': { icon: '💬', border: 'border-cyan-400' },
  'api.connect': { icon: '🔌', border: 'border-fuchsia-400' },
  'notification.send': { icon: '📣', border: 'border-pink-400' },
  'calendar.event': { icon: '🗓️', border: 'border-sky-400' },
  'calendar.reminder': { icon: '⏰', border: 'border-sky-400' },
  'calendar.note': { icon: '📝', border: 'border-sky-400' },
  'project.vision.update': { icon: '🎯', border: 'border-indigo-400' },
  'project.goals.short.update': { icon: '🎯', border: 'border-indigo-400' },
  'project.goals.long.update': { icon: '🏁', border: 'border-indigo-400' },
  'zeta.thought': { icon: '🤔', border: 'border-violet-400' },
  'zeta.outreach': { icon: '📨', border: 'border-violet-400' },
  'functions.build.start': { icon: '🧩', border: 'border-pink-400' },
  'memory.insight': { icon: '🗂️', border: 'border-violet-400' },
};

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

function timeAgo(ts?: string | null) {
  if (!ts) return '—';
  const d = new Date(ts).getTime();
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

/* ---------- newest timestamp helper (prevents stale overwrite) ---------- */
function newestTs(...vals: Array<string | null | undefined>) {
  const ms = vals.map(v => (v ? Date.parse(v) : NaN)).filter(n => Number.isFinite(n)) as number[];
  if (!ms.length) return null;
  return new Date(Math.max(...ms)).toISOString();
}

/* ---------- pick newest across MF + logs ---------- */
type BadgeKind = 'NOTIFICATION' | 'THOUGHT' | 'MESSAGE';

function chooseLatestAny(opts: {
  mf: any | null;
  logs: Array<{ event: string; details?: any; message?: string | null; created_at: string }>;
}): { text: string | null; kind: BadgeKind | null; at: string | null } {
  const mf = opts.mf ?? {};
  const candidates: Array<{ text: string; at: string | null; kind: BadgeKind }> = [];

  // Prefer the authoritative snapshot in mainframe_info (with timestamps)
  if (mf.latest_outreach_chat && mf.latest_outreach_chat_at) {
    candidates.push({ text: String(mf.latest_outreach_chat), at: String(mf.latest_outreach_chat_at), kind: 'MESSAGE' });
  }
  if (mf.latest_thought && mf.latest_thought_at) {
    candidates.push({ text: String(mf.latest_thought), at: String(mf.latest_thought_at), kind: 'THOUGHT' });
  }
  if (mf.latest_notification && mf.latest_notification_at) {
    candidates.push({ text: String(mf.latest_notification), at: String(mf.latest_notification_at), kind: 'NOTIFICATION' });
  }

  // Fallback to recent logs (kept for resilience)
  for (const r of opts.logs ?? []) {
    let kind: BadgeKind | null = null;
    if (r.event === 'zeta.outreach') kind = 'MESSAGE';
    else if (r.event === 'zeta.thought') kind = 'THOUGHT';
    else if (r.event === 'notification.send') kind = 'NOTIFICATION';
    if (!kind) continue;

    const text = (r.details?.summary ?? r.details?.text ?? r.message ?? '').toString().trim();
    if (!text) continue;

    candidates.push({ text, at: r.created_at ?? null, kind });
  }

  if (candidates.length === 0) return { text: null, kind: null, at: null };

  candidates.sort((a, b) => {
    const ta = a.at ? Date.parse(a.at) : -Infinity;
    const tb = b.at ? Date.parse(b.at) : -Infinity;
    return tb - ta;
  });

  const top = candidates[0];
  return { text: top.text, kind: top.kind, at: top.at };
}

/* ---------- date helpers ---------- */
function ymd(d = new Date()) {
  return d.toISOString().slice(0, 10);
}
function ymdNDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return ymd(d);
}

export default function CurrentMemoryPanel({ userEmail, projectId }: Props) {
  const router = useRouter();

  /* --------------------- Memory state --------------------- */
  const [memory, setMemory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'daily' | 'weekly' | 'monthly'>('weekly');

  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d;
  });
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date(today.getFullYear(), today.getMonth(), today.getDate()));

  /* ---------------------- Logs/Activity state ------------- */
  const [latestLog, setLatestLog] = useState<LogRow | null>(null);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [zetaLastActive, setZetaLastActive] = useState<string | null>(null);
  const [userLastActive, setUserLastActive] = useState<string | null>(null);

  /* ------------------ Notifications state ----------------- */
  const [isComposing, setIsComposing] = useState(false);
  const [latestNotification, setLatestNotification] = useState<string | null>(null);
  const [latestKind, setLatestKind] = useState<BadgeKind | null>(null);
  const [latestAt, setLatestAt] = useState<string | null>(null);

  const [userReply, setUserReply] = useState('');
  const [sentUserMsg, setSentUserMsg] = useState<string | null>(null);
  const [sending] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const userInitials = userEmail?.slice(0, 2).toUpperCase() ?? '??';

  /* -------------------- Fetch Memory ---------------------- */
  useEffect(() => {
    async function fetchMemory() {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) {
        console.error('❌ No authed user.');
        setMemory(null);
        setLoading(false);
        return;
      }

      try {
        if (tab === 'daily') {
          const dateStr = selectedDate.toISOString().split('T')[0];
          const { data, error } = await supabase
            .from('zeta_daily_memory')
            .select('memory')
            .eq('user_id', user.id)
            .eq('project_id', projectId)
            .eq('date', dateStr)
            .maybeSingle();

          if (error) throw error;
          setMemory((data as { memory?: string } | null)?.memory ?? null);
        } else if (tab === 'weekly') {
          const { data: wk, error: wkErr } = await supabase
            .from('zeta_weekly_memory')
            .select('memory, date')
            .eq('user_id', user.id)
            .eq('project_id', projectId)
            .order('date', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (wkErr) throw wkErr;

          if (wk?.memory) {
            setMemory(wk.memory as string);
          } else {
            const { data: daily7, error: dErr } = await supabase
              .from('zeta_daily_memory')
              .select('date, memory')
              .eq('user_id', user.id)
              .eq('project_id', projectId)
              .gte('date', ymdNDaysAgo(6))
              .lte('date', ymd())
              .order('date', { ascending: true });

            if (dErr) throw dErr;

            if (daily7 && daily7.length > 0) {
              const joined = daily7.map((r: any) => `${r.date}: ${r.memory}`).join('\n');
              setMemory(joined);
            } else {
              setMemory(null);
            }
          }
        } else {
          const { data: mo, error: moErr } = await supabase
            .from('zeta_monthly_memory')
            .select('memory, date')
            .eq('user_id', user.id)
            .eq('project_id', projectId)
            .order('date', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (moErr) throw moErr;
          setMemory((mo as { memory?: string } | null)?.memory ?? null);
        }
      } catch (err: any) {
        console.error('❌ Supabase fetch error:', err?.message ?? err);
        setMemory(null);
      } finally {
        setLoading(false);
      }
    }

    if (projectId) void fetchMemory();
  }, [projectId, tab, selectedDate]);

  /* -------------------- Logs + Activity fetchers ---------- */
  async function refreshLatestLog(pid: string) {
    const { data } = await supabase
      .from('system_logs')
      .select('id,project_id,actor,event,message,details,created_at')
      .eq('project_id', pid)
      .order('created_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    const row = (data as LogRow) ?? null;
    setLatestLog(row);
    if (row?.created_at) setZetaLastActive(prev => newestTs(prev, row.created_at));
  }

  async function refreshActivityAndUnread(pid: string) {
    const { data: p } = await supabase
      .from('user_projects')
      .select('user_last_active,zeta_last_active')
      .eq('id', pid)
      .maybeSingle();

    const ula = p?.user_last_active ?? null;
    const zlaDb = p?.zeta_last_active ?? null;

    setUserLastActive(ula);
    setZetaLastActive(prev => newestTs(prev, zlaDb, latestLog?.created_at ?? null));

    let unread = 0;
    if (ula) {
      const { count } = await supabase
        .from('system_logs')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', pid)
        .gt('created_at', ula);
      unread = count ?? 0;
    } else {
      const { count } = await supabase
        .from('system_logs')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', pid);
      unread = count ?? 0;
    }
    setUnreadCount(unread);
  }

  useEffect(() => {
    if (!projectId) return;
    const run = () => {
      void refreshLatestLog(projectId);
      void refreshActivityAndUnread(projectId);
    };
    run();

    const t = setInterval(run, 30_000);

    // ── Realtime: logs (as before)
    const chLogs = supabase
      .channel(`logs_rhs_${projectId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'system_logs', filter: `project_id=eq.${projectId}` },
        async (payload) => {
          const row = payload.new as LogRow;
          setLatestLog(row);
          setZetaLastActive(prev => newestTs(prev, row.created_at));
          if (!userLastActive || row.created_at > userLastActive) {
            setUnreadCount((n) => n + 1);
          }
        }
      )
      .subscribe();

    // ── Realtime: custom_notifications → update local "latest" immediately
    const chNotifications = supabase
      .channel(`custom_notifications_${projectId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'custom_notifications', filter: `project_id=eq.${projectId}` },
        async (payload) => {
          const row = payload.new as any;
          const text = (row.message || '').toString().trim();
          if (!text) return;
          const at = (row.sent_at || row.created_at || new Date().toISOString()).toString();
          const kind: BadgeKind = row.type === 'outreach' ? 'MESSAGE' : 'NOTIFICATION';
          // only replace if it’s newer
          const curTs = latestAt ? Date.parse(latestAt) : -Infinity;
          const newTs = Date.parse(at);
          if (newTs > curTs) {
            setLatestNotification(text);
            setLatestKind(kind);
            setLatestAt(at);
          }
        }
      )
      .subscribe();

    // ── Realtime: thoughts inserts
    const chThoughts = supabase
      .channel(`thoughts_${projectId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'thoughts', filter: `project_id=eq.${projectId}` },
        (payload) => {
          const row = payload.new as any;
          const text = (row.content || '').toString().trim();
          const at = (row.created_at || new Date().toISOString()).toString();
          if (!text) return;
          const curTs = latestAt ? Date.parse(latestAt) : -Infinity;
          const newTs = Date.parse(at);
          if (newTs > curTs) {
            setLatestNotification(text);
            setLatestKind('THOUGHT');
            setLatestAt(at);
          }
        }
      )
      .subscribe();

    // ── Realtime: mainframe_info updates (authoritative snapshot)
    const chMF = supabase
      .channel(`mf_${projectId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'mainframe_info', filter: `project_id=eq.${projectId}` },
        async (payload) => {
          const mf = payload.new as any;
          const { text, kind, at } = chooseLatestAny({ mf, logs: [] });
          if (text) {
            setLatestNotification(text);
            setLatestKind(kind);
            setLatestAt(at);
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(t);
      supabase.removeChannel(chLogs);
      supabase.removeChannel(chNotifications);
      supabase.removeChannel(chThoughts);
      supabase.removeChannel(chMF);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, userLastActive, latestAt]);

  async function markLogsRead() {
    const nowIso = new Date().toISOString();
    await supabase.from('user_projects').update({ user_last_active: nowIso }).eq('id', projectId);
    setUserLastActive(nowIso);
    setUnreadCount(0);
  }

  /* --------------- Latest Notification (MF + logs) ---------- */
  useEffect(() => {
    async function fetchFromMainframe() {
      if (!projectId) return;

      try {
        const mfQ = supabase
          .from('mainframe_info')
          .select('latest_notification, latest_notification_at, latest_thought, latest_thought_at, latest_outreach_chat, latest_outreach_chat_at')
          .eq('project_id', projectId)
          .limit(1)
          .maybeSingle<any>();

        const logsQ = supabase
          .from('system_logs')
          .select('event, message, details, created_at')
          .eq('project_id', projectId)
          .in('event', ['notification.send', 'zeta.thought', 'zeta.outreach'])
          .order('created_at', { ascending: false, nullsFirst: false })
          .limit(20);

        const [mfRes, logsRes] = await Promise.all([mfQ, logsQ]);

        const { text, kind, at } = chooseLatestAny({
          mf: mfRes.data ?? null,
          logs: (logsRes.data as any[]) ?? [],
        });

        setLatestNotification(text ?? null);
        setLatestKind(kind ?? null);
        setLatestAt(at ?? null);
      } catch (err) {
        console.error('❌ mainframe_info/logs fetch threw:', err);
        setLatestNotification(null);
        setLatestKind(null);
        setLatestAt(null);
      }
    }

    void fetchFromMainframe();
  }, [projectId]);

  /* --------------- Mini-chat helpers ---------------------- */
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [sentUserMsg]);

  function handleReplyKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const trimmed = userReply.trim();
      if (!trimmed) return;
      setSentUserMsg(trimmed);
      setUserReply('');
      setLocked(true);
    }
  }

  function buildInitialAssistantText(): string {
    return (latestNotification ?? '').trim();
  }

  function buildTitle(from: string, fallback: string): string {
    const base = (from || fallback || '').replace(/\s+/g, ' ').trim();
    if (!base) return 'Follow-up';
    const head = base.length > 64 ? `${base.slice(0, 64)}…` : base;
    return `Follow-up: ${head}`;
  }

  async function createDiscussion() {
    if (!projectId) { setError('Missing projectId'); return; }
    const userMsg = (sentUserMsg || '').trim();
    if (!userMsg) { setError('Please type your reply first.'); return; }

    setCreating(true);
    setStatus('Creating discussion…');
    setError(null);

    const initialAssistant = buildInitialAssistantText();
    const title = buildTitle(initialAssistant, userMsg);

    try {
      if (initialAssistant) {
        const res = await fetch('/api/discussion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: String(projectId),
            title,
            modelId: 'gpt-4o',
            initialAssistant,
            initialUser: userMsg,
            runOnCreate: true,
          }),
        });

        const txt = await res.text();
        let json: any = {};
        try { json = JSON.parse(txt); } catch {}
        if (!res.ok) throw new Error(json?.error || txt || `Failed to create discussion (HTTP ${res.status})`);

        const threadId: string | undefined = json?.threadId;
        if (!threadId) throw new Error('Discussion created but no threadId returned');

        setStatus('Opening…');
        router.push(`/dashboard/${projectId}?open=${encodeURIComponent(threadId)}`);
      } else {
        const res = await fetch('/api/discussion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: String(projectId), title }),
        });
        const txt = await res.text();
        let json: any = {};
        try { json = JSON.parse(txt); } catch {}
        if (!res.ok) throw new Error(json?.error || txt || `Failed to create discussion (HTTP ${res.status})`);

        const threadId: string | undefined = json?.threadId;
        if (!threadId) throw new Error('Create-only succeeded but no threadId returned');

        const seed = await fetch('/api/discussion-seed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: String(projectId), threadId, userText: userMsg }),
        });
        const seedTxt = await seed.text();
        let seedJson: any = {};
        try { seedJson = JSON.parse(seedTxt); } catch {}
        if (!seed.ok) throw new Error(seedJson?.error || seedTxt || `Seed failed (HTTP ${seed.status})`);

        setStatus('Opening…');
        router.push(`/dashboard/${projectId}?open=${encodeURIComponent(threadId)}`);
      }
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create discussion.');
      setLocked(false);
      setSentUserMsg(null);
    } finally {
      setCreating(false);
      setTimeout(() => setStatus(null), 1200);
    }
  }

  /* ------------------------- UI --------------------------- */
  const zetaDisplayTs = newestTs(zetaLastActive, latestLog?.created_at ?? null);

  return (
    <div className="h-full w-full flex flex-col bg-indigo-50/60 text-indigo-900 overflow-hidden">
      <header className="sticky top-0 z-20 border-b border-indigo-200/60 bg-indigo-50/80 backdrop-blur supports-[backdrop-filter]:bg-indigo-50/60">
        <div className="px-6 pt-4 pb-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">🧠 Memory</h2>
          </div>

          <div className="flex gap-2 mt-3">
            {(['daily', 'weekly', 'monthly'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1 rounded text-sm font-semibold capitalize ${
                  tab === t ? 'bg-white shadow' : 'bg-indigo-200 hover:bg-indigo-300'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-6">
        {tab === 'daily' && (
          <DailyPicker weekDates={weekDates} selectedDate={selectedDate} onPick={(d) => setSelectedDate(d)} />
        )}

        {/* Memory body */}
        <div className="rounded-2xl border border-indigo-200 bg-white/70 p-4 shadow-sm">
          {loading ? (
            <p className="italic text-indigo-800">Loading memory...</p>
          ) : memory ? (
            <p className="leading-relaxed whitespace-pre-wrap">{memory}</p>
          ) : (
            <p className="italic">No memory found for this tab.</p>
          )}
        </div>

        {/* Logs */}
        <section>
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-bold text-base flex items-center gap-2">🗂️ Logs</h3>
            <div className="flex items-center gap-2">
              <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5">({unreadCount})</span>
              <button onClick={markLogsRead} className="text-xs text-indigo-700 hover:underline">
                Mark read
              </button>
            </div>
          </div>

          <div className="text-[11px] text-slate-600 mb-2">
            Zeta was last active:{' '}
            <span className="font-medium text-slate-700">
              {zetaDisplayTs ? `${timeAgo(zetaDisplayTs)} · ${new Date(zetaDisplayTs).toLocaleString()}` : '—'}
            </span>
          </div>

          <div className="rounded-2xl border border-indigo-200 bg-white/80 p-3 shadow-sm">
            {latestLog ? (
              <div className="text-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg leading-none">
                      {(EVENT_UI[latestLog.event] ?? { icon: '🪵' }).icon}
                    </span>
                    <span className="font-semibold text-indigo-800">
                      {latestLog.event}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    {new Date(latestLog.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="mt-1 text-slate-800 whitespace-pre-wrap">
                  {fallbackMessage(latestLog)}
                </div>
              </div>
            ) : (
              <div className="text-sm italic text-slate-600">No logs yet.</div>
            )}
          </div>
        </section>

        {/* Notifications / Mini-chat */}
        <section>
          <h3 className="font-bold text-base flex items-center gap-2 mb-2">🔔 Notifications</h3>

          <div className="rounded-2xl border border-indigo-200 bg-white/80 p-3 shadow-sm">
            {/* Zeta bubble */}
            <div className="flex items-start gap-3">
              <img src="/zeta-avatar.jpg" alt="Zeta avatar" className="w-8 h-8 rounded-full object-cover" />
              <div className="bg-white text-indigo-900 rounded-xl px-4 py-2 shadow-sm text-xs w-full border border-indigo-100">
                <p className="font-medium mb-1 flex items-center gap-2">
                  <span>Zeta:</span>
                  {latestKind && (
                    <span
                      className={`uppercase tracking-wide rounded-full px-2 py-[2px] text-[10px] font-bold
                      ${latestKind === 'MESSAGE' ? 'bg-blue-100 text-blue-700 border border-blue-200'
                        : latestKind === 'THOUGHT' ? 'bg-violet-100 text-violet-700 border border-violet-200'
                        : 'bg-amber-100 text-amber-700 border border-amber-200'}`}
                    >
                      {latestKind}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-500 ml-1">
                    {latestAt ? `${timeAgo(latestAt)}` : '—'}
                  </span>
                </p>
                <p className="leading-snug whitespace-pre-wrap">
                  {latestNotification ?? '—'}
                </p>
              </div>
            </div>

            {/* Your local reply */}
            {sentUserMsg && (
              <div className="flex items-start gap-3 justify-end mt-3">
                <div className="bg-white border border-indigo-200 rounded-xl px-3 py-2 shadow-sm text-xs max-w-[90%]">
                  <div className="font-semibold text-indigo-800 mb-0.5">You</div>
                  <div className="text-slate-800 whitespace-pre-wrap">{sentUserMsg}</div>
                </div>
              </div>
            )}

            {/* Composer (before first send) */}
            {!locked && (
              <div className="flex items-start gap-3 mt-4">
                <div className="w-8 h-8 rounded-full bg-indigo-200 text-indigo-800 font-bold text-xs flex items-center justify-center border">
                  {userInitials}
                </div>
                <div className="flex-1">
                  <textarea
                    value={userReply}
                    onChange={(e) => setUserReply(e.target.value)}
                    onKeyDown={handleReplyKeyDown}
                    onCompositionStart={() => setIsComposing(true)}
                    onCompositionEnd={() => setIsComposing(false)}
                    placeholder="Reply to Zeta here…"
                    rows={1}
                    className="bg-white text-indigo-900 text-xs px-3 py-2 rounded-xl shadow-sm w-full focus:outline-none border border-indigo-200"
                    disabled={sending}
                  />
                  <div className="mt-2">
                    <button
                      onClick={() => {
                        const trimmed = userReply.trim();
                        if (!trimmed) return;
                        setSentUserMsg(trimmed);
                        setUserReply('');
                        setLocked(true);
                      }}
                      disabled={!userReply.trim()}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs hover:bg-indigo-700 disabled:opacity-50"
                    >
                      Send
                    </button>
                  </div>

                  {error && (
                    <div className="mt-2 text-[11px] text-red-600">
                      {typeof error === 'string' ? error : JSON.stringify(error)}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* After first send — Create Discussion */}
            {locked && (
              <div className="mt-4 flex flex-col items-center gap-2">
                <button
                  onClick={createDiscussion}
                  disabled={creating}
                  className="px-4 py-2 rounded-lg bg-amber-500 text-white text-xs md:text-sm hover:bg-amber-600 disabled:opacity-60"
                >
                  {creating ? 'Creating…' : 'Create discussion'}
                </button>
                {status && <div className="text-[11px] text-slate-600">{status}</div>}
              </div>
            )}

            <div ref={endRef} />
          </div>
        </section>
      </div>
    </div>
  );
}

/* ---------- Daily picker ---------- */
function DailyPicker({
  weekDates,
  selectedDate,
  onPick,
}: {
  weekDates: Date[];
  selectedDate: Date;
  onPick: (d: Date) => void;
}) {
  return (
    <div className="mb-4">
      <div className="grid grid-cols-7 text-xs text-center font-bold mb-1">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={`weekday-${i}`}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {weekDates.map((date, i) => {
          const isSelected = selectedDate.toDateString() === date.toDateString();
          return (
            <button
              key={i}
              onClick={() => onPick(date)}
              className={`rounded-full py-1 text-xs transition-all duration-200 ${
                isSelected
                  ? 'bg-white text-indigo-900 font-bold border border-indigo-500'
                  : 'bg-indigo-300 text-white hover:bg-indigo-400'
              }`}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
