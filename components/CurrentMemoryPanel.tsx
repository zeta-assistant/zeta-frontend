'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type Props = { userEmail: string | null; projectId: string };

export default function CurrentMemoryPanel({ userEmail, projectId }: Props) {
  const router = useRouter();

  // Memory tabs
  const [memory, setMemory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'daily' | 'weekly' | 'monthly'>('weekly');

  // Week picker
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

  // Mini-chat (stateless across refresh)
  const [isComposing, setIsComposing] = useState(false);
  const [latestNotification, setLatestNotification] = useState<string | null>(null);
  const DEFAULT_NOTIFICATION = 'Hey there! Got any new data for me to process?';

  const [userReply, setUserReply] = useState('');
  const [sentUserMsg, setSentUserMsg] = useState<string | null>(null); // shows your bubble (clears on reload)
  const [assistantFollowup, setAssistantFollowup] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [locked, setLocked] = useState(false); // hide composer after first send
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const userInitials = userEmail?.slice(0, 2).toUpperCase() ?? '??';

  // ---- Fetch memory for selected tab
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

      let query:
        | ReturnType<typeof supabase.from<'zeta_daily_memory'>>
        | ReturnType<typeof supabase.from<'zeta_weekly_memory'>>
        | ReturnType<typeof supabase.from<'zeta_current_memory'>>;

      if (tab === 'daily') {
        const formattedDate = selectedDate.toISOString().split('T')[0];
        query = supabase
          .from('zeta_daily_memory')
          .select('memory')
          .eq('user_id', user.id)
          .eq('project_id', projectId)
          .eq('date', formattedDate)
          .maybeSingle();
      } else if (tab === 'weekly') {
        query = supabase
          .from('zeta_weekly_memory')
          .select('memory')
          .eq('user_id', user.id)
          .eq('project_id', projectId)
          .order('date', { ascending: false })
          .limit(1)
          .maybeSingle();
      } else {
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 29);
        const fromISO = fromDate.toISOString().split('T')[0];
        query = supabase
          .from('zeta_current_memory')
          .select('summary')
          .eq('user_id', user.id)
          .eq('project_id', projectId)
          .gte('created_at', fromISO)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
      }

      const { data, error } = (await query) as
        | { data: { memory?: string } | null; error: any }
        | { data: { summary?: string } | null; error: any };

      if (error) {
        console.error('❌ Supabase fetch error:', JSON.stringify(error, null, 2));
        setMemory(null);
      } else {
        const raw =
          tab === 'daily' || tab === 'weekly'
            ? (data as { memory?: string } | null)?.memory
            : (data as { summary?: string } | null)?.summary;
        setMemory(raw ?? null);
      }
      setLoading(false);
    }

    if (projectId) fetchMemory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, tab, selectedDate]);

  // ---- Fetch latest_notification (client)
  useEffect(() => {
    async function fetchLatestNotification() {
      if (!projectId) return setLatestNotification(null);
      const { data, error } = await supabase
        .from('mainframe_info')
        .select('latest_notification')
        .eq('project_id', projectId)
        .maybeSingle();

      if (error) {
        console.error('❌ Error fetching latest_notification:', error);
        setLatestNotification(null);
      } else {
        setLatestNotification(
          (data as { latest_notification?: string } | null)?.latest_notification ?? null
        );
      }
    }
    fetchLatestNotification();
  }, [projectId]);

  // ---- Auto-scroll to bottom when new bubble appears
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [sentUserMsg, assistantFollowup]);

  function handleReplyKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (userReply.trim() && !sending) void sendMiniReply();
    }
  }

  async function sendMiniReply() {
    if (!latestNotification || !userReply.trim() || sending) return;
    setSending(true);
    setError(null);

    const trimmed = userReply.trim();

    // local-only UI state (clears on refresh)
    setSentUserMsg(trimmed);
    setLocked(true);
    setUserReply('');

    try {
      // still persist to DB and get a follow-up, but we won't rehydrate
      const res = await fetch('/api/mini-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          userEmail,
          notificationBody: latestNotification,
          userReply: trimmed,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `Mini chat failed: ${res.status}`);

      setAssistantFollowup(json.followup ?? null);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to send reply.');
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

  return (
    <div className="-m-6 w-[calc(100%+3rem)] min-h-[calc(100%+3rem)] p-6 text-indigo-900 text-sm bg-indigo-50/60">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">🧠 Memory</h2>
      </div>

      {/* Tabs */}
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

      {/* Daily picker / memory */}
      {tab === 'daily' && (
        <DailyPicker weekDates={weekDates} selectedDate={selectedDate} onPick={(d) => setSelectedDate(d)} />
      )}

      {loading ? (
        <p className="italic text-indigo-800 mb-4">Loading memory...</p>
      ) : memory ? (
        <p className="mb-4 leading-relaxed whitespace-pre-wrap">{memory}</p>
      ) : (
        <p className="italic mb-4">No memory found for this tab.</p>
      )}

      {/* Notifications header */}
      <div className="flex justify-between items-center mt-4 mb-2">
        <h3 className="font-bold text-base flex items-center gap-2">🔔 Notifications</h3>
        <div className="flex items-center gap-2">
          <button className="text-xs hover:underline text-indigo-700">Settings</button>
          <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5">(2)</span>
        </div>
      </div>

      {/* Mini-chat card */}
      <div className="rounded-2xl border border-indigo-200 bg-white/80 p-3 shadow-sm">
        {/* Notification bubble */}
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
                placeholder="Reply to Zeta here… (Enter to send, Shift+Enter for newline)"
                rows={3}
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
    </div>
  );
}

/* ---------- small child for the daily picker ---------- */
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