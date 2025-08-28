'use client';

import React, { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
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

/* ---------- Helpers (same semantics as your LogsPanel) ---------- */
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
  const [selectedDate, setSelectedDate] = useState<Date>(
    () => new Date(today.getFullYear(), today.getMonth(), today.getDate())
  );

  /* ---------------------- Logs/Activity state ------------- */
  const [latestLog, setLatestLog] = useState<LogRow | null>(null);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [zetaLastActive, setZetaLastActive] = useState<string | null>(null);
  const [userLastActive, setUserLastActive] = useState<string | null>(null);

  /* ------------------ Notifications state ----------------- */
  const [isComposing, setIsComposing] = useState(false);
  const [latestNotification, setLatestNotification] = useState<string | null>(null);
  const DEFAULT_NOTIFICATION =
    'Hey there! Connect to Telegram in Workspace/APIs, and then start receiving notifications! ';
  const [userReply, setUserReply] = useState('');
  const [sentUserMsg, setSentUserMsg] = useState<string | null>(null);
  const [assistantFollowup, setAssistantFollowup] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const userInitials = userEmail?.slice(0, 2).toUpperCase() ?? '??';

  /* -------------------- Fetch Memory ---------------------- */
  useEffect(() => {
    async function fetchMemory() {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        console.error('❌ Auth error:', authError);
        setMemory(null);
        setLoading(false);
        return;
      }

      try {
        if (tab === 'daily') {
          const formattedDate = selectedDate.toISOString().split('T')[0];
          const { data, error } = await supabase
            .from('zeta_daily_memory')
            .select('memory')
            .eq('user_id', user.id)
            .eq('project_id', projectId)
            .eq('date', formattedDate)
            .maybeSingle();
          if (error) throw error;
          setMemory((data as { memory?: string } | null)?.memory ?? null);
        } else if (tab === 'weekly') {
          const { data, error } = await supabase
            .from('zeta_weekly_memory')
            .select('memory')
            .eq('user_id', user.id)
            .eq('project_id', projectId)
            .order('date', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (error) throw error;
          setMemory((data as { memory?: string } | null)?.memory ?? null);
        } else {
          const fromDate = new Date();
          fromDate.setDate(fromDate.getDate() - 29);
          const fromISO = fromDate.toISOString().split('T')[0];
          const { data, error } = await supabase
            .from('zeta_current_memory')
            .select('summary')
            .eq('user_id', user.id)
            .eq('project_id', projectId)
            .gte('created_at', fromISO)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (error) throw error;
          setMemory((data as { summary?: string } | null)?.summary ?? null);
        }
      } catch (err) {
        console.error('❌ Supabase fetch error:', err);
        setMemory(null);
      } finally {
        setLoading(false);
      }
    }

    if (projectId) void fetchMemory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, tab, selectedDate]);

  /* -------------------- Logs + Activity fetchers ---------- */
  async function refreshLatestLog(pid: string) {
    const { data, error } = await supabase
      .from('system_logs')
      .select('id,project_id,actor,event,message,details,created_at')
      .eq('project_id', pid)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error) setLatestLog((data as LogRow) ?? null);
  }

  async function refreshActivityAndUnread(pid: string) {
    // get last-active stamps
    const { data: p } = await supabase
      .from('user_projects')
      .select('user_last_active,zeta_last_active')
      .eq('id', pid)
      .maybeSingle();

    const ula = p?.user_last_active ?? null;
    const zla = p?.zeta_last_active ?? null;

    setUserLastActive(ula);
    setZetaLastActive(zla);

    // compute unread = logs since user_last_active (or all if null)
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

    // realtime bump
    const ch = supabase
      .channel(`logs_rhs_${projectId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'system_logs', filter: `project_id=eq.${projectId}` },
        (payload) => {
          const row = payload.new as LogRow;
          setLatestLog(row);
          setZetaLastActive(row.created_at);
          // optimistic unread increment
          if (!userLastActive || row.created_at > userLastActive) {
            setUnreadCount((n) => n + 1);
          }
        }
      )
      .subscribe();

  return () => {
      clearInterval(t);
      supabase.removeChannel(ch);
    };
  }, [projectId, userLastActive]);

  async function markLogsRead() {
    const nowIso = new Date().toISOString();
    await supabase.from('user_projects').update({ user_last_active: nowIso }).eq('id', projectId);
    setUserLastActive(nowIso);
    setUnreadCount(0);
  }

  /* --------------- Latest Notification -------------------- */
  useEffect(() => {
    async function fetchLatestNotification() {
      if (!projectId) return setLatestNotification(null);
      const { data, error } = await supabase
        .from('custom_notifications')
        .select('message')
        .eq('project_id', projectId)
        .eq('type', 'relevant_discussion')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error('❌ relevant discussion error:', error);
        setLatestNotification(null);
      } else {
        setLatestNotification(data?.message ?? null);
      }
    }
    void fetchLatestNotification();
  }, [projectId]);

  /* --------------- Mini-chat helpers ---------------------- */
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [sentUserMsg, assistantFollowup]);

  function handleReplyKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (userReply.trim() && !sending) void sendMiniReply();
    }
  }

  async function sendMiniReply() {
    if (!userReply.trim() || sending) return;

    const notification = latestNotification ?? DEFAULT_NOTIFICATION;
    setSending(true);
    setError(null);

    const trimmed = userReply.trim();
    setSentUserMsg(trimmed);
    setLocked(true);
    setUserReply('');

    try {
      const res = await fetch('/api/mini-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          userEmail,
          notificationBody: notification,
          userReply: trimmed,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `Mini chat failed: ${res.status}`);

      setAssistantFollowup(json.followup ?? null);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to send reply.');
      setLocked(false);
      setSentUserMsg(null);
      setUserReply(trimmed);
    } finally {
      setSending(false);
    }
  }

  const seed = useMemo(() => {
    const n = latestNotification ?? DEFAULT_NOTIFICATION;
    const u = sentUserMsg ? `\n\nUser reply:\n${sentUserMsg}` : '';
    const a = assistantFollowup ? `\n\nZeta follow-up:\n${assistantFollowup}` : '';
    return `Seeded from dashboard mini-convo.\n\nNotification:\n${n}${u}${a}`;
  }, [latestNotification, sentUserMsg, assistantFollowup]);

  function continueDiscussion() {
    router.push(`/dashboard/${projectId}/discussion/new?seed=${encodeURIComponent(seed)}`);
  }

  /* ------------------------- UI --------------------------- */
  return (
    <div className="h-full w-full flex flex-col bg-indigo-50/60 text-indigo-900">
      {/* ---------- TOP: Memory (33%) ---------- */}
      <section className="basis-1/3 min-h-0 overflow-y-auto p-6 border-b border-indigo-200/60">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">🧠 Memory</h2>
        </div>

        <div className="flex gap-2 mt-3 mb-4">
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

        {tab === 'daily' && (
          <DailyPicker weekDates={weekDates} selectedDate={selectedDate} onPick={(d) => setSelectedDate(d)} />
        )}

        {loading ? (
          <p className="italic text-indigo-800">Loading memory...</p>
        ) : memory ? (
          <p className="leading-relaxed whitespace-pre-wrap">{memory}</p>
        ) : (
          <p className="italic">No memory found for this tab.</p>
        )}
      </section>

      {/* ---------- BOTTOM: Logs + Notifications (66%) ---------- */}
      <section className="basis-2/3 min-h-0 overflow-y-auto p-6">
        {/* Logs header with (N) badge + Mark read */}
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-base flex items-center gap-2">🗒️ Logs</h3>
          <div className="flex items-center gap-2">
            <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5">({unreadCount})</span>
            <button onClick={markLogsRead} className="text-xs text-indigo-700 hover:underline">
              Mark read
            </button>
          </div>
        </div>

        {/* Zeta last active line */}
        <div className="text-[11px] text-slate-600 mb-2">
          Zeta was last active:{' '}
          <span className="font-medium text-slate-700">
            {zetaLastActive ? `${timeAgo(zetaLastActive)} · ${new Date(zetaLastActive).toLocaleString()}` : '—'}
          </span>
        </div>

        {/* Latest log card */}
        <div className="rounded-2xl border border-indigo-200 bg-white/80 p-3 shadow-sm mb-5">
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

        {/* Notifications header — no settings/badge */}
        <h3 className="font-bold text-base flex items-center gap-2 mb-2">🔔 Notifications</h3>

        {/* Mini-chat card */}
        <div className="rounded-2xl border border-indigo-200 bg-white/80 p-3 shadow-sm">
          {/* Zeta bubble */}
          <div className="flex items-start gap-3">
            <img src="/zeta-avatar.jpg" alt="Zeta avatar" className="w-8 h-8 rounded-full object-cover" />
            <div className="bg-white text-indigo-900 rounded-xl px-4 py-2 shadow-sm text-xs w-full border border-indigo-100">
              <p className="font-medium mb-1">Zeta:</p>
              <p className="leading-snug whitespace-pre-wrap">
                {latestNotification ?? DEFAULT_NOTIFICATION}
              </p>
            </div>
          </div>

          {/* Your single (local) reply bubble */}
          {sentUserMsg && (
            <div className="flex items-start gap-3 justify-end mt-3">
              <div className="bg-white border border-indigo-200 rounded-xl px-3 py-2 shadow-sm text-xs max-w-[90%]">
                <div className="font-semibold text-indigo-800 mb-0.5">You</div>
                <div className="text-slate-800 whitespace-pre-wrap">{sentUserMsg}</div>
              </div>
            </div>
          )}

          {/* Zeta follow-up bubble */}
          {assistantFollowup && (
            <div className="flex items-start gap-3 mt-3">
              <img src="/zeta-avatar.jpg" alt="Zeta" className="w-6 h-6 rounded-full object-cover mt-0.5" />
              <div className="bg-white border border-blue-200 rounded-xl px-3 py-2 shadow-sm text-xs max-w-[90%]">
                <div className="font-semibold text-blue-800 mb-0.5">Zeta</div>
                <div className="text-slate-800 whitespace-pre-wrap">{assistantFollowup}</div>
              </div>
            </div>
          )}

          {/* Composer — only BEFORE first send */}
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
                    onClick={sendMiniReply}
                    disabled={!userReply.trim() || sending}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {sending ? 'Sending…' : 'Send'}
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

          {/* After first send — hide composer and show only Continue */}
          {locked && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={continueDiscussion}
                className="px-4 py-2 rounded-lg bg-amber-500 text-white text-xs md:text-sm hover:bg-amber-600"
              >
                Continue discussion →
              </button>
            </div>
          )}

          <div ref={endRef} />
        </div>
      </section>
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
