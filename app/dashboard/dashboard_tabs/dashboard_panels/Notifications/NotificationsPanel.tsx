'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

type NotificationChannels = {
  email: boolean;
  telegram: boolean;
  inapp: boolean;
};

type RuleType =
  | 'custom'
  | 'relevant_discussion'
  | 'outreach'
  | 'calendar'
  | 'thoughts'
  | 'tasks'
  | 'usage_frequency'; // ← add this

type Frequency =
  | 'off'
  | 'hourly'
  | 'daily'
  | 'weekdays'
  | 'weekly'
  | 'monthly'
  | 'custom';

type Rule = {
  id: string;
  project_id: string;
  user_id?: string | null;
  name: string;
  type: RuleType;
  template?: string | null;
  frequency: Frequency;
  send_time: string; // "HH:MM"
  day_of_week: number | null;
  is_enabled: boolean;
  channels: NotificationChannels | null;
};

type Props = { projectId: string };

const defaultChannels: NotificationChannels = { email: false, telegram: true, inapp: true };

const BUILT_INS: Array<{
  type: Exclude<RuleType, 'custom'>;
  label: string;
  subtitle: string;
  defaults: { frequency: Frequency; send_time: string; template?: string };
}> = [
  { type: 'relevant_discussion', label: 'Relevant Discussion', subtitle: '(relevant_discussion)', defaults: { frequency: 'hourly', send_time: '15:00' } },
  { type: 'calendar', label: 'Calendar Digest', subtitle: '(calendar)', defaults: { frequency: 'daily', send_time: '07:30', template: 'Today’s events and reminders.' } },
  { type: 'outreach', label: 'Outreach Message', subtitle: '(outreach)', defaults: { frequency: 'daily', send_time: '09:00', template: 'Daily outreach touchpoints.' } },
  { type: 'thoughts', label: 'Zeta Thoughts', subtitle: '(thoughts)', defaults: { frequency: 'daily', send_time: '17:00', template: 'End-of-day insights & ideas.' } },
  { type: 'tasks', label: 'Tasks Summary', subtitle: '(tasks)', defaults: { frequency: 'daily', send_time: '08:00', template: 'Your tasks for the day.' } },
  { type: 'usage_frequency', label: 'Usage Frequency (Daily)', subtitle: '(usage_frequency)', defaults: { frequency: 'daily', send_time: '09:15', template: 'Daily feature usage summary.' }
},
];

/* ===== Telegram checker state ===== */
type TgState = {
  connected: boolean;
  pending: boolean;
  chatId?: string | null;
};

export default function NotificationsPanel({ projectId }: Props) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<Partial<Rule>>({});
  const [lastFnResult, setLastFnResult] = useState<any | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [creating, setCreating] = useState(false);

  const [tgState, setTgState] = useState<TgState>({ connected: false, pending: false, chatId: null });

  // function endpoints
  const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

  const URLS = {
    relevantdiscussion: `${SB_URL}/functions/v1/relevantdiscussion`,
    emitThoughts: `${SB_URL}/functions/v1/emit-thoughts`,
    sendTelegram: `${SB_URL}/functions/v1/send-telegram-message`,
  };

  // ---------- data ----------
  async function fetchRules() {
    setLoading(true);
    const { data, error } = await supabase
      .from('notification_rules')
      .select('*')
      .eq('project_id', projectId)
      .order('name', { ascending: true });
    if (error) {
      console.error(error);
      setFeedback('❌ Failed to load rules');
    } else {
      setRules((data || []) as Rule[]);
    }
    setLoading(false);
  }

  // Telegram connection checker
  const refreshTelegramState = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('project_integrations')
        .select('user_chat_id, is_verified')
        .eq('project_id', projectId)
        .eq('type', 'telegram');

      if (error) throw error;

      const rows = Array.isArray(data) ? data : [];
      const verified = rows.find((r: any) => r.is_verified && r.user_chat_id);
      const pending = rows.some((r: any) => !r.is_verified);

      setTgState({
        connected: Boolean(verified),
        pending,
        chatId: verified?.user_chat_id ?? null,
      });
    } catch (e) {
      console.error('refreshTelegramState error:', e);
      setTgState({ connected: false, pending: false, chatId: null });
    }
  }, [projectId]);

  useEffect(() => {
    fetchRules();
    refreshTelegramState();
  }, [projectId, refreshTelegramState]);

  const byType = useMemo(() => {
    const map = new Map<RuleType, Rule>();
    for (const r of rules) map.set(r.type, r);
    return map;
  }, [rules]);

  // ---------- helpers ----------
  const Section = ({ children }: { children: React.ReactNode }) => (
    <div className="rounded-xl border border-slate-200/70 bg-white/80 shadow-sm p-5 space-y-3">{children}</div>
  );

  async function ensureBuiltIn(type: Exclude<RuleType, 'custom'>) {
    setFeedback('');
    try {
      const existing = byType.get(type);
      const preset = BUILT_INS.find((b) => b.type === type)!;

      if (existing) {
        const needsUpdate =
          !existing.is_enabled ||
          !existing.channels ||
          !existing.frequency ||
          !existing.send_time ||
          typeof existing.template === 'undefined';

        if (needsUpdate) {
          const patch: Partial<Rule> = {
            is_enabled: true,
            channels: existing.channels ?? defaultChannels,
            name: existing.name || preset.label,
            frequency: existing.frequency || preset.defaults.frequency,
            send_time: existing.send_time || preset.defaults.send_time,
            template:
              typeof existing.template === 'string'
                ? existing.template
                : (preset.defaults.template ?? ''),
          };

          const { data, error } = await supabase
            .from('notification_rules')
            .update(patch)
            .eq('id', existing.id)
            .select('*')
            .single();

          if (error) throw error;
          setFeedback(`✅ Activated ${preset.label}`);
          await fetchRules();
          return data as Rule;
        }

        setFeedback('ℹ️ Already active');
        return existing;
      }

      const { data: auth } = await supabase.auth.getUser();
      const user_id = auth?.user?.id ?? null;

      const payload: Partial<Rule> = {
        project_id: projectId,
        user_id,
        type,
        name: preset.label,
        frequency: preset.defaults.frequency,
        send_time: preset.defaults.send_time,
        day_of_week: null,
        is_enabled: true,
        channels: defaultChannels,
        template: preset.defaults.template ?? '',
      };

      const { data, error } = await supabase
        .from('notification_rules')
        .insert(payload)
        .select('*')
        .single();

      if (error) throw error;

      setFeedback(`✅ Activated ${preset.label}`);
      await fetchRules();
      return data as Rule;
    } catch (err: any) {
      const msg =
        err?.message ||
        err?.details ||
        err?.hint ||
        err?.code ||
        (typeof err === 'string' ? err : JSON.stringify(err));

      console.error('ensureBuiltIn error:', err);
      setFeedback(`❌ Failed to activate: ${msg}`);
      return null;
    }
  }

  const toggleActive = async (rule: Rule) => {
    setFeedback('');
    const { error } = await supabase
      .from('notification_rules')
      .update({ is_enabled: !rule.is_enabled })
      .eq('id', rule.id);
    if (error) {
      console.error(error);
      setFeedback('❌ Could not update status');
    } else {
      setFeedback(`✅ ${!rule.is_enabled ? 'Activated' : 'Deactivated'}`);
      fetchRules();
    }
  };

  // ---------- edit/create ----------
  const startEdit = (rule: Rule) => {
    setCreating(false);
    setEditingId(rule.id);
    setEditState({
      ...rule,
      channels: rule.channels || defaultChannels,
      template: rule.template ?? '',
    });
    setFeedback('');
    setLastFnResult(null);
  };

  const startCreate = () => {
    setEditingId(null);
    setCreating(true);
    setEditState({
      project_id: projectId,
      name: 'Custom Notification',
      type: 'custom',
      frequency: 'daily',
      send_time: '12:00',
      day_of_week: null,
      is_enabled: true,
      channels: defaultChannels,
      template: '',
    });
    setFeedback('');
    setLastFnResult(null);
  };

  const cancelEditOrCreate = () => {
    setEditingId(null);
    setCreating(false);
    setEditState({});
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const payload: Partial<Rule> = {
      name: editState.name ?? '',
      type: (editState.type as RuleType) ?? 'custom',
      frequency: (editState.frequency as Frequency) ?? 'daily',
      send_time: editState.send_time ?? '12:00',
      day_of_week: (editState.day_of_week as number | null) ?? null,
      is_enabled: (editState.is_enabled as boolean) ?? true,
      channels: (editState.channels as NotificationChannels) ?? defaultChannels,
      template: editState.template ?? '',
    };
    const { error } = await supabase.from('notification_rules').update(payload).eq('id', editingId);
    if (error) {
      console.error('Failed to update:', error);
      setFeedback('❌ Update failed');
      return;
    }
    setFeedback('✅ Saved');
    cancelEditOrCreate();
    fetchRules();
  };

  const saveCreate = async () => {
    const payload: Partial<Rule> = {
      project_id: projectId,
      name: editState.name ?? 'Custom Notification',
      type: (editState.type as RuleType) ?? 'custom',
      frequency: (editState.frequency as Frequency) ?? 'daily',
      send_time: editState.send_time ?? '12:00',
      day_of_week: (editState.day_of_week as number | null) ?? null,
      is_enabled: (editState.is_enabled as boolean) ?? true,
      channels: (editState.channels as NotificationChannels) ?? defaultChannels,
      template: editState.template ?? '',
    };
    const { error } = await supabase.from('notification_rules').insert(payload);
    if (error) {
      console.error('Failed to create:', error);
      setFeedback('❌ Create failed');
      return;
    }
    setFeedback('✅ Notification created');
    cancelEditOrCreate();
    fetchRules();
  };

  // ---------- utilities ----------
  const getVerifiedTelegramChatId = async (pid: string) => {
    const { data, error } = await supabase
      .from('project_integrations')
      .select('user_chat_id')
      .eq('project_id', pid)
      .eq('type', 'telegram')
      .eq('is_verified', true)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const id = data?.user_chat_id?.toString().trim();
    if (!id || !/^[0-9\-@]+$/.test(id)) return null; // allow @channel too
    return id;
  };

  const sendTest = async (rule: Rule) => {
    setFeedback('');
    setLastFnResult(null);
    try {
      const chatId = await getVerifiedTelegramChatId(projectId);
      if (!chatId) {
        throw new Error('No verified Telegram chat_id found. Connect Telegram first (Functions → APIs).');
      }

      const text =
        (rule.template && rule.template.trim()) || `${rule.name} • test message`;

      const res = await fetch(URLS.sendTelegram, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
        },
        body: JSON.stringify({
          projectId,
          chat_id: chatId,
          text,
          subject: `🔔 ${rule.name} (test)`,
        }),
      });

      const data = await res.json().catch(() => ({}));
      setLastFnResult(data);
      if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);

      setFeedback('✅ Test sent to Telegram.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setFeedback(`❌ ${msg}`);
      console.error(e);
    }
  };

  const runNow = async (rule: Rule) => {
  setFeedback('');
  setLastFnResult(null);
  try {
    const chatId = await getVerifiedTelegramChatId(rule.project_id);
    const channels = {
      inapp: rule.channels?.inapp ?? true,
      email: rule.channels?.email ?? false,
      telegram: (rule.channels?.telegram ?? true) && !!chatId,
    };

    const makeSendPayload = (subject: string, text: string) => ({
      // your edge fn requires these:
      id: `${rule.id}:${Date.now()}`,
      projectId: rule.project_id,
      telegramHandle: chatId,
      // explicitly tell the fn this is a *message*, not (re)connect:
      mode: 'message',
      action: 'send_message',
      skipConnectMessage: true,
      subject,
      text,
      // legacy keys for backward-compat:
      message: text,
      chat_id: chatId,
      telegram_chat_id: chatId,
    });

    switch (rule.type) {
      case 'relevant_discussion': {
        const res = await fetch(URLS.relevantdiscussion, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
          body: JSON.stringify({
            project_id: rule.project_id,
            subject: `🔔 ${rule.name}`,
            channels,
            chat_id: chatId ?? null,
            telegram_chat_id: chatId ?? null,
          }),
        });
        const data = await res.json().catch(() => ({}));
        setLastFnResult(data);
        if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
        setFeedback('✅ Triggered.');
        break;
      }

      case 'thoughts': {
        const res = await fetch(URLS.emitThoughts, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
          body: JSON.stringify({
            project_id: rule.project_id,
            subject: '🧠 Zeta Thoughts',
            channels,
            chat_id: chatId ?? null,
            telegram_chat_id: chatId ?? null,
            template: rule.template ?? '',
            since_hours: 48,
            limit: 5,
            generate_if_missing: true,
          }),
        });
        const data = await res.json().catch(() => ({}));
        setLastFnResult(data);
        if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);

        if (data?.ok === false && data?.reason === 'no thoughts') {
          setFeedback('ℹ️ No recent thoughts to send. Try running “generate-thought” or widen the window.');
          return;
        }
        if (channels.telegram && chatId) {
          const tg = data?.telegram;
          if (tg?.ok) { setFeedback('✅ Sent to Telegram.'); return; }
          if (tg && tg.status) { setFeedback(`❌ Telegram send failed (status ${tg.status}). ${tg.text || ''}`); return; }
          setFeedback('⚠️ Ran, but did not attempt Telegram. Check TELEGRAM_BOT_TOKEN on the server.');
          return;
        }
        setFeedback('⚠️ Ran, but Telegram channel/ID not configured.');
        return;
      }

      case 'usage_frequency': {
  const wantsTelegram = rule.channels?.telegram ?? true;
  const chatId = await getVerifiedTelegramChatId(rule.project_id);
  if (!wantsTelegram || !chatId) {
    setFeedback('⚠️ Telegram not selected or not connected. Go to Functions → APIs to link Telegram.');
    return;
  }

  // Read via RPC (bypasses RLS)
  const { data, error } = await supabase.rpc('get_daily_usage_for_project', {
    p_project_id: rule.project_id,
  });
  if (error) throw error;

  const rows: any[] = Array.isArray(data) ? data : [];
  if (!rows.length) {
    setFeedback('ℹ️ No daily usage snapshot yet. Run the daily refresh first.');
    return;
  }

  const latestDate = rows[0].window_date;
  const todays = rows.filter((r) => r.window_date === latestDate);

  const lines = todays.map((r: any) => {
    const d = (r.details ?? {}) as any;
    switch (r.feature) {
      case 'calendar':
        return `• Calendar: next 7d = ${d.next_7d ?? r.metric_count}`;
      case 'chatboard':
        return `• Chatboard (24h): ${d.user_msgs_1d ?? r.metric_count}`;
      case 'tasks':
        return `• Tasks: touched=${d.touched_1d ?? r.metric_count}, done=${d.completed_1d ?? 0}, due_next_7d=${d.due_next_7d ?? 0}`;
      case 'files':
        return `• Files uploaded (24h): ${d.added_1d ?? r.metric_count}`;
      case 'apis':
        return `• APIs connected: ${d.active_connected ?? r.metric_count}/${d.total_connected ?? r.metric_count}`;
      case 'goals':
        return `• Goals (24h): vision=${d.vision_1d ?? 0}, short=${d.short_term_goals_1d ?? 0}, long=${d.long_term_goals_1d ?? 0}`;
      case 'thoughts':
        return `• Thoughts (24h): ${d.entries_1d ?? r.metric_count}`;
      default:
        return `• ${r.feature}: ${r.metric_count}`;
    }
  });

  const text = [`📊 In the last day (${new Date(latestDate).toLocaleDateString()}):`, ...lines].join('\n');

  // Minimal payload ONLY — avoids kicking the “connect” path
  const payload = {
    id: `usagefreq_${rule.id}_${Date.now()}`,
    projectId: rule.project_id,
    telegramHandle: chatId,
    subject: '🔔 Usage Frequency (Daily)',
    text,
  };

  const res = await fetch(URLS.sendTelegram, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const out = await res.json().catch(() => ({}));
  setLastFnResult(out);
  if (!res.ok) throw new Error(out?.error || out?.message || `HTTP ${res.status}`);

  setFeedback('✅ Sent daily usage summary.');
  return;
}


      case 'calendar':
      case 'outreach':
      case 'tasks':
      case 'custom': {
        const wantsTelegram = rule.channels?.telegram ?? true;
        if (!wantsTelegram || !chatId) {
          setFeedback('⚠️ Telegram not selected or not connected.');
          break;
        }
        const text = (rule.template && rule.template.trim()) || rule.name;
        const res = await fetch(URLS.sendTelegram, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
          body: JSON.stringify(makeSendPayload(`🔔 ${rule.name}`, text)),
        });
        const data = await res.json().catch(() => ({}));
        setLastFnResult(data);
        if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
        setFeedback('✅ Triggered.');
        break;
      }

      default:
        throw new Error(`Unsupported type: ${rule.type}`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    setFeedback(`❌ Run Now failed: ${msg}`);
    console.error('runNow error:', e);
  } finally {
    refreshTelegramState();
  }
};




  // ---------- cards ----------
  const BuiltInCard = ({ t }: { t: (typeof BUILT_INS)[number] }) => {
    const rule = byType.get(t.type);
    const telegramSelected = rule?.channels?.telegram ?? defaultChannels.telegram;
    const disableSendTest = telegramSelected && !tgState.connected;

    if (rule && editingId === rule.id) {
      return <EditCard bare />;
    }

    return (
      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
        <div className="min-w-0">
          <div className="font-semibold text-slate-900 truncate">
            {t.label} <span className="text-slate-500 font-normal text-sm">{t.subtitle}</span>
          </div>
          <div className="text-sm text-slate-600">
            {rule ? (
              <>
                ⏰ {rule.frequency} at {rule.send_time} — <span className="italic">{rule.type}</span>
              </>
            ) : (
              <>
                Inactive — <span className="italic">{t.type}</span>
              </>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {rule
              ? (rule.is_enabled ? '🟢 Active' : '⚪ Inactive') +
                ' • 📢 ' +
                (rule.channels
                  ? Object.entries(rule.channels)
                      .filter(([, v]) => v)
                      .map(([k]) => k)
                      .join(', ')
                  : 'No method selected')
              : 'Not configured yet'}
          </div>
          {telegramSelected && !tgState.connected && (
            <div className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 inline-block">
              Telegram selected but not connected. Go to <b>Functions → APIs</b> to connect.
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 justify-end">
          {!rule ? (
            <button
              onClick={() => ensureBuiltIn(t.type)}
              className="text-sm rounded bg-emerald-600 text-white px-3 py-1.5 hover:bg-emerald-700"
            >
              Activate
            </button>
          ) : (
            <>
              <button
                onClick={() => toggleActive(rule)}
                className={`text-sm rounded px-3 py-1.5 ${
                  rule.is_enabled
                    ? 'bg-slate-200 text-slate-900 hover:bg-slate-300'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
              >
                {rule.is_enabled ? 'Deactivate' : 'Activate'}
              </button>
              <button
                onClick={() => sendTest(rule)}
                disabled={disableSendTest}
                className={`text-sm rounded px-3 py-1.5 text-white ${
                  disableSendTest
                    ? 'bg-blue-400 cursor-not-allowed opacity-60'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
                title={disableSendTest ? 'Connect Telegram in Functions → APIs' : 'Send a test message'}
              >
                Send Test
              </button>
              <button
                onClick={() => runNow(rule)}
                className="text-sm rounded bg-slate-600 text-white px-3 py-1.5 hover:bg-slate-700"
              >
                Run Now
              </button>
              <button onClick={() => startEdit(rule)} className="text-sm text-indigo-600 hover:underline">
                Edit
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  // prettier, full-width inline editor
  const EditCard = ({ isCreate, bare }: { isCreate?: boolean; bare?: boolean }) => {
    const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
      bare ? (
        <div className="w-[calc(100%+2.5rem)] -ml-5">
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-4 sm:px-5">
            {children}
          </div>
        </div>
      ) : (
        <Section>{children}</Section>
      );

    const inputCls =
      'w-full rounded-md border border-slate-300 bg-white text-slate-900 placeholder-slate-400 ' +
      'px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500';

    const helpCls = 'text-xs text-slate-500';

    const selectWrap = 'relative';
    const selectCls = inputCls + ' pr-9 appearance-none';
    const Chevron = () => (
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">▾</span>
    );

    const set = (patch: Partial<Rule>) => setEditState((prev) => ({ ...prev, ...patch }));

    const telegramChecked = !!editState.channels?.telegram;

    return (
      <Wrapper>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{isCreate ? 'Create Notification' : 'Edit Notification'}</h3>
          {(editState.type as string) && (
            <span className="inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-700">
              {String(editState.type)}
            </span>
          )}
        </div>

        {/* Name */}
        <div className="grid gap-2">
          <label className="text-sm text-slate-700">Name</label>
          <input
            className={inputCls}
            value={editState.name || ''}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="e.g. Daily Telegram Digest"
          />
        </div>

        {/* Frequency + Time */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
          <div className="grid gap-2">
            <label className="text-sm text-slate-700">Frequency</label>
            <div className={selectWrap}>
              <select
                className={selectCls}
                value={(editState.frequency as Frequency) || 'daily'}
                onChange={(e) => set({ frequency: e.target.value as Frequency })}
              >
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
                <option value="weekdays">Weekdays</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="off">Off</option>
              </select>
              <Chevron />
            </div>
            <p className={helpCls}>How often to send.</p>
          </div>

          <div className="grid gap-2">
            <label className="text-sm text-slate-700">Send Time</label>
            <input
              type="time"
              value={editState.send_time || '12:00'}
              onChange={(e) => set({ send_time: e.target.value })}
              className={inputCls}
            />
            <p className={helpCls}>Local time for this project/user.</p>
          </div>
        </div>

        {/* Day of week (only when weekly) */}
        {editState.frequency === 'weekly' && (
          <div className="grid gap-2 mt-3 sm:max-w-xs">
            <label className="text-sm text-slate-700">Day of week</label>
            <div className={selectWrap}>
              <select
                className={selectCls}
                value={editState.day_of_week ?? 1}
                onChange={(e) => set({ day_of_week: Number(e.target.value) })}
              >
                <option value={0}>Sunday</option>
                <option value={1}>Monday</option>
                <option value={2}>Tuesday</option>
                <option value={3}>Wednesday</option>
                <option value={4}>Thursday</option>
                <option value={5}>Friday</option>
                <option value={6}>Saturday</option>
              </select>
              <Chevron />
            </div>
          </div>
        )}

        {/* Channels */}
        <div className="grid gap-2 mt-3">
          <label className="text-sm text-slate-700">Channels</label>
          <div className="flex gap-6">
            {(['telegram', 'email', 'inapp'] as const).map((field) => {
              const checked = !!editState.channels?.[field];
              return (
                <label key={field} className="flex items-center gap-2 text-sm text-slate-900">
                  <input
                    type="checkbox"
                    className="accent-indigo-600"
                    checked={checked}
                    onChange={(e) =>
                      setEditState((prev) => ({
                        ...prev,
                        channels: {
                          email: prev.channels?.email ?? false,
                          telegram: prev.channels?.telegram ?? false,
                          inapp: prev.channels?.inapp ?? false,
                          [field]: e.target.checked,
                        },
                      }))
                    }
                  />
                  {field === 'inapp' ? 'In-app' : field[0].toUpperCase() + field.slice(1)}
                </label>
              );
            })}
          </div>
          {telegramChecked && !tgState.connected && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 inline-block mt-1">
              Telegram channel selected, but no verified chat_id. Connect it in <b>Functions → APIs</b>.
            </p>
          )}
          <p className={helpCls}>Pick where this notification is delivered.</p>
        </div>

        {/* Template (hidden for relevant_discussion) */}
        {(editState.type as RuleType) !== 'relevant_discussion' && (
          <div className="grid gap-2 mt-3">
            <label className="text-sm text-slate-700">Message Template</label>
            <textarea
              className={inputCls + ' min-h-[110px]'}
              value={editState.template || ''}
              onChange={(e) => set({ template: e.target.value })}
              placeholder="What should this say? e.g., “Today’s events and reminders.”"
            />
            <p className={helpCls}>Used by generic senders (e.g., Telegram). Your Edge functions can override.</p>
          </div>
        )}

        {/* Enabled */}
        <div className="grid gap-2 mt-3">
          <label className="text-sm text-slate-700">Enabled</label>
          <label className="flex items-center gap-2 text-sm text-slate-900">
            <input
              type="checkbox"
              className="accent-indigo-600"
              checked={!!editState.is_enabled}
              onChange={(e) => set({ is_enabled: e.target.checked })}
            />
            Active
          </label>
        </div>

        {/* Buttons */}
        <div className="mt-4 flex gap-2">
          {isCreate ? (
            <button onClick={saveCreate} className="rounded bg-blue-600 text-white px-4 py-2 hover:bg-blue-700">
              Save
            </button>
          ) : (
            <button onClick={saveEdit} className="rounded bg-blue-600 text-white px-4 py-2 hover:bg-blue-700">
              Save
            </button>
          )}
          <button
            onClick={cancelEditOrCreate}
            className="rounded bg-slate-200 text-slate-900 px-4 py-2 hover:bg-slate-300"
          >
            Cancel
          </button>
        </div>
      </Wrapper>
    );
  };

  const BuiltInLikeRuleCard = ({ rule }: { rule: Rule }) => {
    const disableSendTest = (rule.channels?.telegram ?? false) && !tgState.connected;

    if (editingId === rule.id) return <EditCard bare />;

    return (
      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
        <div className="min-w-0">
          <div className="font-semibold text-slate-900 truncate">{rule.name}</div>
          <div className="text-sm text-slate-600">
            ⏰ {rule.frequency} at {rule.send_time} — <span className="italic">{rule.type}</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {rule.is_enabled ? '🟢 Active' : '⚪ Inactive'} • 📢{' '}
            {rule.channels
              ? Object.entries(rule.channels)
                  .filter(([, v]) => v)
                  .map(([k]) => k)
                  .join(', ')
              : 'No method selected'}
          </div>
          {(rule.channels?.telegram ?? false) && !tgState.connected && (
            <div className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 inline-block">
              Telegram selected but not connected. Go to <b>Functions → APIs</b> to connect.
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <button
            onClick={() => toggleActive(rule)}
            className={`text-sm rounded px-3 py-1.5 ${
              rule.is_enabled
                ? 'bg-slate-200 text-slate-900 hover:bg-slate-300'
                : 'bg-emerald-600 text-white hover:bg-emerald-700'
            }`}
          >
            {rule.is_enabled ? 'Deactivate' : 'Activate'}
          </button>
          <button
            onClick={() => sendTest(rule)}
            disabled={disableSendTest}
            className={`text-sm rounded px-3 py-1.5 text-white ${
              disableSendTest
                ? 'bg-blue-400 cursor-not-allowed opacity-60'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
            title={disableSendTest ? 'Connect Telegram in Functions → APIs' : 'Send a test message'}
          >
            Send Test
          </button>
          <button
            onClick={() => runNow(rule)}
            className="text-sm rounded bg-slate-600 text-white px-3 py-1.5 hover:bg-slate-700"
          >
            Run Now
          </button>
          <button onClick={() => startEdit(rule)} className="text-sm text-indigo-600 hover:underline">
            Edit
          </button>
        </div>
      </div>
    );
  };

  // ---------- render ----------

  const editingBuiltIn = useMemo(() => {
    for (const b of BUILT_INS) {
      const r = byType.get(b.type);
      if (r && r.id === editingId) return r;
    }
    return null;
  }, [editingId, byType]);

  const builtInList = (
    <div className="space-y-3">
      {BUILT_INS.map((b) => (
        <BuiltInCard key={b.type} t={b} />
      ))}
    </div>
  );

  const customList = useMemo(() => {
    const customs = rules.filter((r) => r.type === 'custom');
    if (loading) return <p className="text-slate-600">Loading…</p>;
    if (!customs.length) return null;
    return customs.map((r) => <BuiltInLikeRuleCard key={r.id} rule={r} />);
  }, [rules, loading, editingId]); // eslint-disable-line

  return (
    <div className="p-6 overflow-y-auto space-y-4 scroll-smoothbar">
      <div className="rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-3 shadow flex items-center justify-between">
        <h2 className="text-xl sm:text-2xl font-bold text-white">🛎️ Notifications</h2>
        {/* Telegram status pill */}
        <div>
          {tgState.connected ? (
            <span className="text-xs sm:text-sm inline-flex items-center gap-2 bg-green-600/90 text-white px-3 py-1 rounded-full">
              ✓ Telegram connected
              {tgState.chatId && <span className="font-mono bg-white/20 rounded px-1">{tgState.chatId}</span>}
            </span>
          ) : tgState.pending ? (
            <span className="text-xs sm:text-sm inline-flex items-center gap-2 bg-amber-500/90 text-white px-3 py-1 rounded-full">
              ⏳ Telegram pending verification
            </span>
          ) : (
            <span className="text-xs sm:text-sm inline-flex items-center gap-2 bg-slate-600/90 text-white px-3 py-1 rounded-full">
              ⚠️ Telegram not connected
            </span>
          )}
        </div>
      </div>

      {feedback && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
          {feedback}
        </div>
      )}

      {lastFnResult !== null && (
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
          <button
            className="text-xs text-slate-600 hover:underline"
            onClick={() => setShowDebug((s) => !s)}
          >
            {showDebug ? 'Hide details' : 'Show details'}
          </button>
          {showDebug && (
            <pre className="mt-2 max-h-48 overflow-auto text-xs bg-slate-50 border border-slate-200 rounded p-3">
              {JSON.stringify(lastFnResult, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* Built-ins */}
      <Section>
        <h3 className="text-lg font-semibold">Default Notifications</h3>
        {editingBuiltIn ? <EditCard bare /> : builtInList}
      </Section>

      {/* Custom rules */}
      <Section>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Custom Notifications</h3>
          {!creating && editingId === null && (
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
              onClick={startCreate}
            >
              <span className="text-lg leading-none">＋</span> Create
            </button>
          )}
        </div>
        {creating ? (
          <EditCard isCreate />
        ) : (
          customList || <p className="text-slate-600 text-sm">No custom notifications yet.</p>
        )}
      </Section>

      {/* pretty scrollbar */}
      <style jsx global>{`
        .scroll-smoothbar { scrollbar-width: thin; scrollbar-color: #c7d2fe transparent; }
        .scroll-smoothbar::-webkit-scrollbar { width: 8px; }
        .scroll-smoothbar::-webkit-scrollbar-thumb { background: #c7d2fe; border-radius: 6px; }
        .scroll-smoothbar:hover::-webkit-scrollbar-thumb { background: #a5b4fc; }
        .scroll-smoothbar::-webkit-scrollbar-track { background: transparent; }
      `}</style>
    </div>
  );
}
