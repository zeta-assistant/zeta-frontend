'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

import runtimeDefault, {
  BUILT_INS,
  defaultChannels,
  type NotificationChannels,
  type RuleType,
  type Frequency,
  type Rule,
  type TgState,
  type EmailState,
  buildUrls,
  fetchRules as runtimeFetchRules,
  refreshTelegramState as runtimeRefreshTelegram,
  refreshEmailState as runtimeRefreshEmail,
  ensureBuiltIn as runtimeEnsureBuiltIn,
  toggleActive as runtimeToggleActive,
  sendTest as runtimeSendTest,
  runRelevantDiscussion,
  runThoughts,
  runUsageFrequency,
  runGeneric,
  runOutreach,
} from './notificationsRuntime';

/* ──────────────────────────────────────────────────────────
   Plan gating
─────────────────────────────────────────────────────────── */
type Plan = 'loading' | 'free' | 'premium' | 'pro';

function normalizePlanRow(row: any): Plan {
  if (!row) return 'free';
  if (row.is_premium === true) return 'premium';
  const raw = (row.plan ?? '').toString().trim().toLowerCase();
  if (raw === 'pro') return 'pro';
  if (['premium', 'plus', 'paid', 'trial_premium'].includes(raw)) return 'premium';
  return 'free';
}

const PREMIUM_TYPES: Array<Exclude<RuleType, 'custom'>> = ['thoughts', 'usage_frequency'];

const PremiumPill = ({ className = '' }: { className?: string }) => (
  <span className={`ml-2 inline-flex text-[11px] items-center gap-1 rounded-full bg-indigo-100 px-2 py-[2px] font-medium text-indigo-700 ${className}`}>
    🔒 Premium
  </span>
);

/* ──────────────────────────────────────────────────────────
   TZ helpers
─────────────────────────────────────────────────────────── */
async function fetchProjectTimezone(projectId: string): Promise<string | null> {
  try {
    const byId = await supabase.from('user_projects').select('timezone').eq('id', projectId).maybeSingle();
    if (byId.data?.timezone) return String(byId.data.timezone).trim() || null;
  } catch {}
  try {
    const byPid = await supabase.from('user_projects').select('timezone').eq('project_id', projectId).maybeSingle();
    if (byPid.data?.timezone) return String(byPid.data.timezone).trim() || null;
  } catch {}
  try {
    const mf = await supabase.from('mainframe_info').select('timezone').eq('project_id', projectId).maybeSingle();
    if (mf.data?.timezone) return String(mf.data.timezone).trim() || null;
  } catch {}
  return null;
}

function tzOffsetLabel(timeZone: string, at = new Date()): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'shortOffset',
    hour12: false,
  }).formatToParts(at);
  return parts.find((p) => p.type === 'timeZoneName')?.value || '';
}
function nowInTzLabels(timeZone: string) {
  const now = new Date();
  const time = new Intl.DateTimeFormat(undefined, { timeZone, hour: 'numeric', minute: '2-digit' }).format(now);
  const date = new Intl.DateTimeFormat(undefined, { timeZone, weekday: 'short', month: 'short', day: '2-digit', year: 'numeric' }).format(now);
  const offset = tzOffsetLabel(timeZone, now);
  return { time, date, offset };
}
function getTzParts(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour12: false,
  }).formatToParts(new Date());

  const pick = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const hour = Number(pick('hour'));
  const minute = Number(pick('minute'));
  const second = Number(pick('second'));
  const weekdayStr = pick('weekday');
  const d = `${pick('year')}-${pick('month')}-${pick('day')}`;
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekdayStr);
  return { hour, minute, second, weekday, ymd: d };
}
function parseSendTimeHHMM(ruleTime: string | null | undefined): { h: number; m: number } {
  const raw = String(ruleTime ?? '00:00').trim();
  const [hStr, mStr] = raw.split(':');
  const h = Math.max(0, Math.min(23, Number(hStr || 0)));
  const m = Math.max(0, Math.min(59, Number((mStr || '0').slice(0, 2))));
  return { h, m };
}
function isWeekday(idx: number) { return idx >= 1 && idx <= 5; }

/* ──────────────────────────────────────────────────────────
   Types for jobs
─────────────────────────────────────────────────────────── */
type JobRow = { rule_id: string; next_run_at: string | null; status?: string | null };

/* ──────────────────────────────────────────────────────────
   Props
─────────────────────────────────────────────────────────── */
type Props = { projectId: string };

/* ──────────────────────────────────────────────────────────
   Component
─────────────────────────────────────────────────────────── */
export default function NotificationsPanel({ projectId }: Props) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [feedback, setFeedback] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<Partial<Rule>>({});

  const [tgState, setTgState] = useState<TgState>({ connected: false, pending: false, chatId: null });
  const [emailState, setEmailState] = useState<EmailState>({ connected: false, list: [] });

  const [plan, setPlan] = useState<Plan>('loading');
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const force = sp.get('forcePremium') === '1' || localStorage.getItem('zeta_force_premium') === '1';
    if (force) setPlan('premium');
  }, []);
  const isPremium = plan === 'premium' || plan === 'pro';
  const premiumLocked = !isPremium;

  // Project/User timezone display state
  const [projectTz, setProjectTz] = useState<string | null>(null);
  const browserTz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', []);
  const effectiveTz = projectTz || browserTz || 'UTC';

  // live ticking for countdowns
  const [nowTs, setNowTs] = useState<number>(Date.now());
  useEffect(() => {
    if (editingId) return;
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [editingId]);

  // slow tick to refresh header clock lines
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
  const URLS = buildUrls(projectId, SB_URL);

  /* ---------- data ---------- */
  const fetchRules = useCallback(async () => {
    const { data } = await runtimeFetchRules(supabase, projectId);
    setRules(data || []);
  }, [projectId]);

  const refreshTelegramState = useCallback(async () => {
    setTgState(await runtimeRefreshTelegram(supabase, projectId));
  }, [projectId]);

  const refreshEmailState = useCallback(async () => {
    setEmailState(await runtimeRefreshEmail(supabase, projectId));
  }, [projectId]);

  const fetchPlan = useCallback(async () => {
    try {
      const { data: projById } = await supabase.from('user_projects').select('is_premium, plan').eq('id', projectId).limit(1);
      if (projById && projById.length) { setPlan(normalizePlanRow(projById[0])); return; }

      const { data: projByPid } = await supabase.from('user_projects').select('is_premium, plan').eq('project_id', projectId).limit(1);
      if (projByPid && projByPid.length) { setPlan(normalizePlanRow(projByPid[0])); return; }

      const { data: mfRow } = await supabase.from('mainframe_info').select('capabilities').eq('project_id', projectId).limit(1);
      const capPlan = (mfRow?.[0] as any)?.capabilities?.plan ?? 'free';
      setPlan(normalizePlanRow({ plan: capPlan }));
    } catch { setPlan('free'); }
  }, [projectId]);

  // map rule_id -> job row
  const [jobMap, setJobMap] = useState<Record<string, JobRow>>({});
  const fetchNextRuns = useCallback(async (ruleIds?: string[]) => {
    const ids = (ruleIds && ruleIds.length ? ruleIds : rules.map(r => r.id)).filter(Boolean);
    if (!ids.length) return;
    const { data, error } = await supabase
      .from('notification_jobs')
      .select('rule_id,next_run_at,status')
      .in('rule_id', ids);
    if (error) return;
    const map: Record<string, JobRow> = {};
    (data || []).forEach((r: any) => { map[r.rule_id] = r as JobRow; });
    setJobMap(map);
  }, [rules]);

  useEffect(() => {
    fetchRules();
    refreshTelegramState();
    refreshEmailState();
    fetchPlan();
    (async () => {
      try {
        const tz = await fetchProjectTimezone(projectId);
        setProjectTz(tz);
      } catch { setProjectTz(null); }
    })();
  }, [projectId, fetchRules, refreshTelegramState, refreshEmailState, fetchPlan]);

  // refresh job next-run whenever rules change, and every 60s thereafter
  useEffect(() => {
    if (!rules.length) return;
    fetchNextRuns();
    if (editingId) return;
    const id = setInterval(() => fetchNextRuns(), 60_000);
    return () => clearInterval(id);
  }, [rules, fetchNextRuns, editingId]);

  const byType = useMemo(() => {
    const m = new Map<RuleType, Rule>();
    for (const r of rules) m.set(r.type, r);
    return m;
  }, [rules]);

  /* ---------- helpers ---------- */
  const Section = ({ children }: { children: React.ReactNode }) => (
    <div className="rounded-xl border border-slate-200/70 bg-white/80 shadow-sm p-5 space-y-3">{children}</div>
  );

  const getFirstProjectEmail = () => emailState.list[0] || null;

  function fmtCountdown(ms: number): string {
    if (ms <= 0) return 'due now';
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (d > 0) return `in ${d}d ${h}h`;
    if (h > 0) return `in ${h}h ${m}m`;
    if (m > 0) return `in ${m}m ${sec}s`;
    return `in ${sec}s`;
  }

  function getNextRunDisplay(rule: Rule): { rel: string; local: string } | null {
    if (!rule.is_enabled) return null;
    if (PREMIUM_TYPES.includes(rule.type as any) && !isPremium) return null;

    const row = jobMap[rule.id];
    const iso = row?.next_run_at;
    if (!iso) return { rel: 'scheduling…', local: '' };

    const targetMs = Date.parse(iso);
    const rel = fmtCountdown(targetMs - nowTs);
    const local = new Intl.DateTimeFormat(undefined, {
      timeZone: effectiveTz,
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(targetMs));
    return { rel, local };
  }

  async function ensureBuiltIn(type: Exclude<RuleType, 'custom'>) {
    setFeedback('');
    const res = await runtimeEnsureBuiltIn(supabase, projectId, type);
    if (!res.ok) { console.error(res.error); setFeedback(`❌ ${res.message || 'Failed to activate'}`); return null; }
    setFeedback(res.message || '✅ Done');
    await fetchRules();
    if (res.rule) fetchNextRuns([res.rule.id]);
    return res.rule ?? null;
  }

  const toggleActive = async (rule: Rule) => {
    setFeedback('');
    const res = await runtimeToggleActive(supabase, rule);
    if (!res.ok) { console.error(res.error); setFeedback('❌ Could not update status'); }
    else {
      setFeedback(`✅ ${!rule.is_enabled ? 'Activated' : 'Deactivated'}`);
      fetchRules();
      fetchNextRuns([rule.id]);
    }
  };

  /* ---------- edit ---------- */
  const startEdit = (rule: Rule) => {
    setEditingId(rule.id);
    setEditState({ ...rule, channels: rule.channels || defaultChannels, template: rule.template ?? '' });
    setFeedback('');
  };
  const cancelEdit = () => { setEditingId(null); setEditState({}); };
  const saveEdit = async () => {
    if (!editingId) return;
    const normalizeTime = (t?: string | null) => {
      const { h, m } = parseSendTimeHHMM(t || '12:00');
      const hh = String(h).padStart(2, '0');
      const mm = String(m).padStart(2, '0');
      return `${hh}:${mm}:00`;
    };

    const coercedFreq: Frequency =
      (!isPremium ? 'daily' : ((editState.frequency as Frequency) ?? 'daily'));

    const payload: Partial<Rule> = {
      name: editState.name ?? '',
      type: (editState.type as RuleType) ?? 'custom',
      frequency: coercedFreq,
      send_time: normalizeTime(editState.send_time),
      day_of_week: (coercedFreq === 'weekly') ? ((editState.day_of_week as number | null) ?? 1) : null,
      is_enabled: (editState.is_enabled as boolean) ?? true,
      channels: (editState.channels as NotificationChannels) ?? defaultChannels,
      template: editState.template ?? '',
    };

    const { error } = await supabase.from('notification_rules').update(payload).eq('id', editingId);
    if (error) { console.error('Failed to update:', error); setFeedback('❌ Update failed'); return; }
    setFeedback('✅ Saved');

    try {
      await fetch(URLS.rearmNotification, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
        body: JSON.stringify({ rule_id: editingId }),
      });
    } catch {}
    cancelEdit();
    fetchRules();
    fetchNextRuns([editingId]);
  };

  /* ---------- run/test ---------- */
  const sendTest = async (rule: Rule) => {
    setFeedback('');
    try {
      const { feedback } = await runtimeSendTest(
        supabase, rule, URLS, SB_KEY, getFirstProjectEmail, projectId
      );
      setFeedback(feedback);
    } catch (e: any) {
      setFeedback(`❌ ${e?.message ?? String(e)}`);
    }
  };

  const runNow = async (rule: Rule) => {
    setFeedback('');
    try {
      let out;
      switch (rule.type) {
        case 'relevant_discussion':
          out = await runRelevantDiscussion(supabase, rule, URLS, SB_KEY, getFirstProjectEmail, { manual: true });
          break;
        case 'thoughts':
          out = await runThoughts(supabase, rule, URLS, SB_KEY, { manual: true });
          break;
        case 'usage_frequency':
          out = await runUsageFrequency(supabase, rule, URLS, SB_KEY, getFirstProjectEmail, { manual: true });
          break;
        case 'outreach':
          out = await runOutreach(supabase, rule, URLS, SB_KEY, getFirstProjectEmail, { manual: true });
          break;
        case 'calendar': {
          const fn = (runtimeDefault as any).runCalendarDigest;
          if (!fn) throw new Error('runCalendarDigest missing from notificationsRuntime default export');
          out = await fn(supabase, rule, URLS, SB_KEY, { manual: true });
          break;
        }
        default:
          out = await runGeneric(supabase, rule, URLS, SB_KEY, getFirstProjectEmail, { manual: true });
      }
      setFeedback(out.feedback ?? '✅ Triggered.');
    } catch (e: any) {
      setFeedback(`❌ Run Now failed: ${e?.message ?? String(e)}`);
    } finally {
      refreshTelegramState();
      refreshEmailState();
      fetchNextRuns([rule.id]);
    }
  };

  /* ---------- client-side failsafe (backup tick) ---------- */
  useEffect(() => {
    if (!rules.length) return;

    const storageKey = (id: string) => `notif_last_slot_${id}`;
    const markFired = (id: string, slot: string) => localStorage.setItem(storageKey(id), slot);
    const lastFired = (id: string) => localStorage.getItem(storageKey(id)) || '';

    function isDue(rule: Rule, tz: string): { due: boolean; slotKey: string } {
      if (!rule.is_enabled) return { due: false, slotKey: '' };

      const { h: tgtH, m: tgtM } = parseSendTimeHHMM(rule.send_time);
      const now = getTzParts(tz);
      const curMins = now.hour * 60 + now.minute;
      const tgtMins = tgtH * 60 + tgtM;

      const GRACE = 10; // minutes
      let activeToday = true;
      let slotKey = `${now.ymd}@${String(tgtH).padStart(2, '0')}:${String(tgtM).padStart(2, '0')}`;

      switch (rule.frequency) {
        case 'off': return { due: false, slotKey: '' };
        case 'hourly': {
          const minuteReached = now.minute >= tgtM && (now.minute - tgtM) <= GRACE;
          slotKey = `${now.ymd}@${String(now.hour).padStart(2, '0')}:${String(tgtM).padStart(2, '0')}`;
          return { due: minuteReached, slotKey };
        }
        case 'weekdays': activeToday = isWeekday(now.weekday); break;
        case 'weekly':   activeToday = typeof rule.day_of_week === 'number' ? rule.day_of_week === now.weekday : true; break;
        case 'monthly': {
          const dom = 1; const today = Number(now.ymd.split('-')[2]); activeToday = today === dom; break;
        }
      }

      const minuteReached = curMins >= tgtMins && (curMins - tgtMins) <= GRACE;
      return { due: activeToday && minuteReached, slotKey };
    }

    const autoRun = async (rule: Rule) => {
      try {
        switch (rule.type) {
          case 'relevant_discussion': await runRelevantDiscussion(supabase, rule, URLS, SB_KEY, getFirstProjectEmail); break;
          case 'thoughts':            await runThoughts(supabase, rule, URLS, SB_KEY); break;
          case 'usage_frequency':     await runUsageFrequency(supabase, rule, URLS, SB_KEY, getFirstProjectEmail); break;
          case 'outreach':            await runOutreach(supabase, rule, URLS, SB_KEY, getFirstProjectEmail); break;
          case 'calendar': {
            const fn = (runtimeDefault as any).runCalendarDigest; if (fn) await fn(supabase, rule, URLS, SB_KEY); break;
          }
          default:                    await runGeneric(supabase, rule, URLS, SB_KEY, getFirstProjectEmail);
        }
      } catch (e) { console.warn('[auto scheduler] run failed', e); }
    };

    const tick = () => {
      for (const rule of rules) {
        const { due, slotKey } = isDue(rule, effectiveTz);
        if (!due) continue;
        const last = lastFired(rule.id);
        if (last === slotKey) continue;
        markFired(rule.id, slotKey);
        autoRun(rule);
      }
    };

    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [rules, effectiveTz, URLS, SB_KEY]);

  /* ---------- cards ---------- */
  const EditCard = ({ bare }: { bare?: boolean }) => {
    const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
      bare ? (
        <div className="w-[calc(100%+2.5rem)] -ml-5">
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-4 sm:px-5">{children}</div>
        </div>
      ) : (
        <Section>{children}</Section>
      );

    const inputCls = 'w-full rounded-md border border-slate-300 bg-white text-slate-900 placeholder-slate-400 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500';
    const helpCls = 'text-xs text-slate-500';
    const selectWrap = 'relative';
    const selectCls = inputCls + ' pr-9 appearance-none';
    const Chevron = () => (<span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">▾</span>);

    const set = (patch: Partial<Rule>) => setEditState((prev) => ({ ...prev, ...patch }));
    const telegramChecked = !!editState.channels?.telegram;

    const NowLine = () => {
      const { time, date, offset } = nowInTzLabels(effectiveTz);
      return (
        <p className="text-xs text-slate-500">
          Now in <span className="font-medium">{effectiveTz}</span>: {time} · {date}
          {offset ? ` (${offset})` : ''}{projectTz ? '' : ' • using your browser timezone'}
        </p>
      );
    };

    return (
      <Wrapper>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Edit Notification</h3>
          {(editState.type as string) && (
            <span className="inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-700">
              {String(editState.type)}
            </span>
          )}
        </div>

        {/* Name */}
        <div className="grid gap-2">
          <label className="text-sm text-slate-700">Name</label>
          <input className={inputCls} value={editState.name || ''} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Telegram Digest" />
        </div>

        {/* Frequency + Time */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
          <div className="grid gap-2">
            <label className="text-sm text-slate-700 flex items-center gap-2">
              Frequency {!isPremium && <PremiumPill />}
            </label>
            <div className={selectWrap}>
              <select
                className={selectCls}
                value={(editState.frequency as Frequency) || 'daily'}
                onChange={(e) => set({ frequency: e.target.value as Frequency })}
                disabled={!isPremium}
                title={!isPremium ? 'Premium feature' : 'How often to send'}
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

          {/* Send Time */}
          <div className="grid gap-2">
            <label className="text-sm text-slate-700">Send Time</label>
            <input type="time" value={(editState.send_time || '12:00').slice(0, 5)} onChange={(e) => set({ send_time: e.target.value })} className={inputCls} />
            <p className={helpCls}>Local time for this project/user.</p>
            <NowLine />
          </div>
        </div>

        {/* Day of week (only when weekly) */}
        {editState.frequency === 'weekly' && (
          <div className="grid gap-2 mt-3 sm:max-w-xs">
            <label className="text-sm text-slate-700">Day of week</label>
            <div className={selectWrap}>
              <select className={selectCls} value={editState.day_of_week ?? 1} onChange={(e) => set({ day_of_week: Number(e.target.value) })}>
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
          {!!editState.channels?.telegram && !tgState.connected && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 inline-block mt-1">
              Telegram channel selected, but no verified chat_id. Connect it in <b>Functions → APIs</b>.
            </p>
          )}
        </div>

        {/* Template */}
        {(editState.type as RuleType) !== 'relevant_discussion' && (
          <div className="grid gap-2 mt-3">
            <label className="text-sm text-slate-700">Message Template</label>
            <textarea
              className={inputCls + ' min-h-[110px]'}
              value={editState.template || ''}
              onChange={(e) => set({ template: e.target.value })}
              placeholder="What should this say? e.g., “Today’s events and reminders.”"
            />
          </div>
        )}

        {/* Enabled */}
        <div className="grid gap-2 mt-3">
          <label className="text-sm text-slate-700">Enabled</label>
          <label className="flex items-center gap-2 text-sm text-slate-900">
            <input type="checkbox" className="accent-indigo-600" checked={!!editState.is_enabled} onChange={(e) => set({ is_enabled: e.target.checked })} />
            Active
          </label>
        </div>

        {/* Buttons */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={saveEdit} className="rounded bg-blue-600 text-white px-4 py-2 hover:bg-blue-700">Save</button>
          <button onClick={cancelEdit} className="rounded bg-slate-200 text-slate-900 px-4 py-2 hover:bg-slate-300">Cancel</button>
        </div>
      </Wrapper>
    );
  };

  const BuiltInCard = ({ t }: { t: (typeof BUILT_INS)[number] }) => {
    const rule = byType.get(t.type);
    const telegramSelected = rule?.channels?.telegram ?? defaultChannels.telegram;
    const disableSendTest = telegramSelected && !tgState.connected;

    const isGated = PREMIUM_TYPES.includes(t.type) && !isPremium;
    const runLocked = premiumLocked;

    const nextInfo = rule ? getNextRunDisplay(rule) : null;

    const CardBody = (
      <div className={`relative flex items-center justify-between rounded-lg border bg-white px-4 py-3 ${isGated ? 'border-indigo-200' : 'border-slate-200'}`}>
        <div className={`min-w-0 ${isGated ? 'relative z-20' : ''}`}>
          <div className="font-semibold text-slate-900 truncate">
            {t.label}{' '} <span className="text-slate-500 font-normal text-sm">{t.subtitle}</span>
            {isGated && (<span className="ml-2 inline-flex text-xs text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">Premium</span>)}
          </div>
          <div className="text-sm text-slate-600">
            {rule ? <>⏰ {rule.frequency} at {(rule.send_time || '').slice(0, 8)}</> : <>Inactive — <span className="italic">{t.type}</span></>}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {rule
              ? (rule.is_enabled ? '🟢 Active' : '⚪ Inactive') +
                ' • 📢 ' +
                (rule.channels
                  ? Object.entries(rule.channels).filter(([, v]) => v).map(([k]) => k).join(', ')
                  : 'No method selected')
              : 'Not configured yet'}
          </div>

          {rule && !isGated && rule.is_enabled && (
            <div className="text-xs text-slate-600 mt-1">
              {nextInfo
                ? (nextInfo.local
                    ? <>🕒 Next: <span className="font-medium">{nextInfo.rel}</span> — {nextInfo.local} <span className="text-slate-400">({effectiveTz})</span></>
                    : <>🕒 Next: <span className="text-slate-500">scheduling…</span></>)
                : null}
            </div>
          )}

          {telegramSelected && !tgState.connected && !isGated && (
            <div className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 inline-block">
              Telegram selected but not connected. Go to <b>Functions → APIs</b> to connect.
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 justify-end">
          {!rule ? (
            <button onClick={() => !isGated && ensureBuiltIn(t.type)} disabled={isGated}
              className={`text-sm rounded px-3 py-1.5 ${isGated ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>
              Activate
            </button>
          ) : (
            <>
              <button onClick={() => !isGated && toggleActive(rule)} disabled={isGated}
                className={`text-sm rounded px-3 py-1.5 ${
                  rule.is_enabled
                    ? isGated ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-slate-200 text-slate-900 hover:bg-slate-300'
                    : isGated ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-700'
                }`}>
                {rule.is_enabled ? 'Deactivate' : 'Activate'}
              </button>

              <button onClick={() => !isGated && sendTest(rule)} disabled={isGated || disableSendTest}
                className={`text-sm rounded px-3 py-1.5 text-white ${isGated || disableSendTest ? 'bg-blue-400 cursor-not-allowed opacity-60' : 'bg-blue-600 hover:bg-blue-700'}`}
                title={isGated ? 'Premium feature' : disableSendTest ? 'Connect Telegram in Functions → APIs' : 'Send a test message'}>
                Send Test
              </button>

              <button onClick={() => !runLocked && runNow(rule)} disabled={runLocked}
                className={`text-sm rounded px-3 py-1.5 text-white relative ${runLocked ? 'bg-slate-400 cursor-not-allowed opacity-70' : 'bg-slate-600 hover:bg-slate-700'}`}
                title={runLocked ? 'Premium feature' : 'Run this notification now'}>
                Run Now {runLocked && <PremiumPill className="ml-1" />}
              </button>
              <button onClick={() => !isGated && startEdit(rule)} disabled={isGated}
                className={`text-sm ${isGated ? 'text-slate-400 cursor-not-allowed' : 'text-indigo-600 hover:underline'}`}>
                Edit
              </button>
            </>
          )}
        </div>

        {isGated && (
          <div className="absolute inset-0 z-10 rounded-lg bg-white/60 backdrop-blur-sm flex items-center justify-center pointer-events-auto">
            <div className="flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-indigo-700 text-sm">
              🔒 Premium feature
            </div>
          </div>
        )}
      </div>
    );

    if (rule && editingId === rule.id) {
      return <EditCard bare />;
    }
    return CardBody;
  };

  const editingBuiltIn = useMemo(() => {
    for (const b of BUILT_INS) {
      const r = byType.get(b.type);
      if (r && r.id === editingId) return r;
    }
    return null;
  }, [editingId, byType]);

  const builtInList = (
    <div className="space-y-3">
      {BUILT_INS.map((b) => (<BuiltInCard key={b.type} t={b} />))}
    </div>
  );

  return (
    <div className="p-6 overflow-y-auto space-y-4 scroll-smoothbar">
      <div className="rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-3 shadow flex items-center justify-between">
        <h2 className="text-xl sm:text-2xl font-bold text-white">🛎️ Notifications</h2>

        {/* Status pills */}
        <div className="flex items-center gap-2">
          {tgState.connected ? (
            <span className="text-xs sm:text-sm inline-flex items-center gap-2 bg-green-600/90 text-white px-3 py-1 rounded-full">
              ✓ Telegram connected {tgState.chatId && <span className="font-mono bg-white/20 rounded px-1">{tgState.chatId}</span>}
            </span>
          ) : tgState.pending ? (
            <span className="text-xs sm:text-sm inline-flex items-center gap-2 bg-amber-500/90 text-white px-3 py-1 rounded-full">⏳ Telegram pending verification</span>
          ) : (
            <span className="text-xs sm:text-sm inline-flex items-center gap-2 bg-slate-600/90 text-white px-3 py-1 rounded-full">⚠️ Telegram not connected</span>
          )}

          {emailState.connected ? (
            <span className="text-xs sm:text-sm inline-flex items-center gap-2 bg-emerald-600/90 text-white px-3 py-1 rounded-full">
              ✓ Email connected <span className="font-mono bg-white/20 rounded px-1">{emailState.list[0]}</span>
            </span>
          ) : (
            <span className="text-xs sm:text-sm inline-flex items-center gap-2 bg-slate-600/90 text-white px-3 py-1 rounded-full">✉️ No email saved</span>
          )}
        </div>
      </div>

      {feedback && (<div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">{feedback}</div>)}

      <Section>{editingBuiltIn ? <EditCard bare /> : builtInList}</Section>

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
