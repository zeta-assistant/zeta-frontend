/* No React hooks here; pure helpers + types + per-notification runners */

import type { SupabaseClient } from '@supabase/supabase-js'

/* ──────────────────────────────────────────────────────────
   Types
─────────────────────────────────────────────────────────── */

export type NotificationChannels = {
  email: boolean
  telegram: boolean
  inapp: boolean
}

export type RuleType =
  | 'custom'
  | 'relevant_discussion'
  | 'outreach'
  | 'calendar'
  | 'thoughts'
  | 'tasks'
  | 'usage_frequency'

export type Frequency =
  | 'off'
  | 'hourly'
  | 'daily'
  | 'weekdays'
  | 'weekly'
  | 'monthly'
  | 'custom'

export type Rule = {
  id: string
  project_id: string
  user_id?: string | null
  name: string
  type: RuleType
  template?: string | null
  frequency: Frequency
  send_time: string // "HH:MM" (accepts HH:MM:SS; seconds ignored in UI)
  day_of_week: number | null
  is_enabled: boolean
  channels: NotificationChannels | null
}

export type TgState = { connected: boolean; pending: boolean; chatId?: string | null }
export type EmailState = { connected: boolean; list: string[] }

/* ──────────────────────────────────────────────────────────
   Constants
─────────────────────────────────────────────────────────── */

export const defaultChannels: NotificationChannels = { email: false, telegram: true, inapp: true }

// Premium-gated built-ins (kept here so runtime can also enforce)
export const PREMIUM_TYPES: Array<Exclude<RuleType, 'custom'>> = ['thoughts', 'usage_frequency']

export const BUILT_INS: Array<{
  type: Exclude<RuleType, 'custom'>
  label: string
  subtitle: string
  defaults: { frequency: Frequency; send_time: string; template?: string }
}> = [
  {
    type: 'relevant_discussion',
    label: 'Relevant Discussion',
    subtitle: ' ',
    defaults: { frequency: 'hourly', send_time: '15:00' },
  },
  {
    type: 'calendar',
    label: 'Calendar Digest',
    subtitle: ' ',
    // default is daily
    defaults: { frequency: 'daily', send_time: '07:30', template: 'Today’s events and reminders.' },
  },
  {
    type: 'outreach',
    label: 'Outreach Message',
    subtitle: ' ',
    defaults: { frequency: 'daily', send_time: '09:00', template: 'Daily outreach touchpoints.' },
  },
  {
    type: 'thoughts',
    label: 'Zeta Thoughts',
    subtitle: ' ',
    defaults: { frequency: 'daily', send_time: '17:00', template: 'End-of-day insights & ideas.' },
  },
  {
    type: 'usage_frequency',
    label: 'Usage Frequency',
    subtitle: ' ',
    defaults: { frequency: 'daily', send_time: '09:15', template: 'Daily feature usage summary.' },
  },
]

/* ──────────────────────────────────────────────────────────
   URL helpers
─────────────────────────────────────────────────────────── */

// notificationsRuntime.ts

export function buildUrls(projectId: string, sbUrl?: string) {
  // Prefer explicit arg, fallback to env var
  const base = sbUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  return {
    // existing single-purpose functions
    relevantdiscussion: `${base}/functions/v1/relevantdiscussion`,
    emitThoughts:        `${base}/functions/v1/emit-thoughts`,
    sendTelegram:        `${base}/functions/v1/send-telegram-message`,
    sendEmail:           `${base}/functions/v1/send-email-message`,
    dailyChatMessage:    `${base}/functions/v1/daily-chat-message`,
    calendarDigest:      `${base}/functions/v1/calendar-digest`,

    // ✅ new endpoint for re-arming a rule
    rearmNotification:   `${base}/functions/v1/notification-rules`,
  } as const;
}

// (optional) export a type if you want strong typing elsewhere
export type UrlMap = ReturnType<typeof buildUrls>;

/* ──────────────────────────────────────────────────────────
   Errors
─────────────────────────────────────────────────────────── */

function toError(err: any): Error {
  if (err instanceof Error) return err
  const msg =
    err?.message ??
    err?.details ??
    err?.hint ??
    err?.code ??
    (typeof err === 'string' ? err : JSON.stringify(err || {}))
  return new Error(String(msg || 'Unknown error'))
}

/* ──────────────────────────────────────────────────────────
   Plan helpers (runtime-side gating safety)
─────────────────────────────────────────────────────────── */

export type Plan = 'loading' | 'free' | 'premium' | 'pro'

export function normalizePlanRow(row: any): Plan {
  if (!row) return 'loading'
  if (row.is_premium === true) return 'premium'
  const raw = (row.plan ?? '').toString().trim().toLowerCase()
  if (raw === 'pro') return 'pro'
  if (['premium', 'plus', 'paid', 'trial_premium'].includes(raw)) return 'premium'
  return 'free'
}

/** Checks project premium using user_projects(id OR project_id) then mainframe_info.capabilities.plan */
export async function isPremiumProject(
  supabase: SupabaseClient,
  projectId: string
): Promise<boolean> {
  const { data: proj } = await supabase
    .from('user_projects')
    .select('is_premium, plan')
    .or(`id.eq.${projectId},project_id.eq.${projectId}`)
    .maybeSingle()

  const plan = normalizePlanRow(proj)
  if (plan === 'premium' || plan === 'pro') return true

  const { data: mf } = await supabase
    .from('mainframe_info')
    .select('capabilities')
    .eq('project_id', projectId)
    .maybeSingle()

  const capPlan = normalizePlanRow({ plan: (mf as any)?.capabilities?.plan })
  return capPlan === 'premium' || capPlan === 'pro'
}

/** Throws a readable error if a type is premium and project is not premium */
async function assertPremiumForType(
  supabase: SupabaseClient,
  projectId: string,
  type: RuleType
) {
  if (!PREMIUM_TYPES.includes(type as any)) return
  const ok = await isPremiumProject(supabase, projectId)
  if (!ok) {
    const err = new Error('This is a Premium feature.')
    ;(err as any).code = 'PREMIUM_REQUIRED'
    throw err
  }
}

/* ──────────────────────────────────────────────────────────
   Data fetchers / integrations state
─────────────────────────────────────────────────────────── */

export async function fetchRules(
  supabase: SupabaseClient,
  projectId: string
): Promise<{ data: Rule[]; error?: any }> {
  const { data, error } = await supabase
    .from('notification_rules')
    .select('*')
    .eq('project_id', projectId)
    .order('name', { ascending: true })

  return { data: (data || []) as Rule[], error }
}

export async function refreshTelegramState(
  supabase: SupabaseClient,
  projectId: string
): Promise<TgState> {
  try {
    const { data, error } = await supabase
      .from('project_integrations')
      .select('user_chat_id, is_verified')
      .eq('project_id', projectId)
      .eq('type', 'telegram')
    if (error) throw toError(error)

    const rows = Array.isArray(data) ? data : []
    const verified = rows.find((r: any) => r.is_verified && r.user_chat_id)
    const pending = rows.some((r: any) => !r.is_verified)

    return {
      connected: Boolean(verified),
      pending,
      chatId: verified?.user_chat_id ?? null,
    }
  } catch {
    return { connected: false, pending: false, chatId: null }
  }
}

export async function refreshEmailState(
  supabase: SupabaseClient,
  projectId: string
): Promise<EmailState> {
  try {
    const { data, error } = await supabase
      .from('project_integrations')
      .select('email_address, value, is_verified')
      .eq('project_id', projectId)
      .eq('type', 'email')
    if (error) throw toError(error)

    const list = (data ?? [])
      .filter((r: any) => r.is_verified)
      .map((r: any) => (r.email_address || r.value || '').trim())
    return { connected: list.length > 0, list: list.filter(Boolean) }
  } catch {
    return { connected: false, list: [] }
  }
}

/* ──────────────────────────────────────────────────────────
   CRUD helpers
─────────────────────────────────────────────────────────── */

export async function toggleActive(
  supabase: SupabaseClient,
  rule: Rule
): Promise<{ ok: boolean; error?: any }> {
  const { error } = await supabase
    .from('notification_rules')
    .update({ is_enabled: !rule.is_enabled })
    .eq('id', rule.id)
  return { ok: !error, error }
}

export async function ensureBuiltIn(
  supabase: SupabaseClient,
  projectId: string,
  type: Exclude<RuleType, 'custom'>
): Promise<{ ok: boolean; rule?: Rule; created?: boolean; message?: string; error?: any }> {
  try {
    // Gate premium-only built-ins
    await assertPremiumForType(supabase, projectId, type)

    const preset = BUILT_INS.find((b) => b.type === type)!
    const { data: existingRows, error: selErr } = await supabase
      .from('notification_rules')
      .select('*')
      .eq('project_id', projectId)
      .eq('type', type)
      .limit(1)
    if (selErr) throw toError(selErr)

    const existing = (existingRows?.[0] as Rule | undefined) ?? null

    if (existing) {
      const needsUpdate =
        !existing.is_enabled ||
        !existing.channels ||
        !existing.frequency ||
        !existing.send_time ||
        typeof existing.template === 'undefined'

      if (needsUpdate) {
        const patch: Partial<Rule> = {
          is_enabled: true,
          channels: existing.channels ?? defaultChannels,
          name: existing.name || preset.label,
          frequency: existing.frequency || preset.defaults.frequency,
          send_time: existing.send_time || preset.defaults.send_time,
          template:
            typeof existing.template === 'string' ? existing.template : preset.defaults.template ?? '',
        }
        const { data: upd, error: updErr } = await supabase
          .from('notification_rules')
          .update(patch)
          .eq('id', existing.id)
          .select('*')
          .single()
        if (updErr) throw toError(updErr)
        return { ok: true, rule: upd as Rule, created: false, message: `Activated ${preset.label}` }
      }
      return { ok: true, rule: existing, created: false, message: 'Already active' }
    }

    const { data: auth } = await supabase.auth.getUser()
    const user_id = (auth as any)?.user?.id ?? null

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
    }

    const { data: ins, error: insErr } = await supabase
      .from('notification_rules')
      .insert(payload)
      .select('*')
      .single()
    if (insErr) throw toError(insErr)

    return { ok: true, rule: ins as Rule, created: true, message: `Activated ${preset.label}` }
  } catch (error) {
    const code = (error as any)?.code
    const baseMsg =
      (error as any)?.message ||
      (error as any)?.details ||
      (error as any)?.hint ||
      (error as any)?.code ||
      'Unknown error'
    const message = code === 'PREMIUM_REQUIRED' ? 'Premium feature' : `Failed to activate: ${baseMsg}`
    return { ok: false, error, message }
  }
}

/* ──────────────────────────────────────────────────────────
   Channel helpers
─────────────────────────────────────────────────────────── */

export async function getVerifiedTelegramChatId(
  supabase: SupabaseClient,
  pid: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('project_integrations')
    .select('user_chat_id')
    .eq('project_id', pid)
    .eq('type', 'telegram')
    .eq('is_verified', true)
    .maybeSingle()
  if (error) throw toError(error)

  const id = (data as any)?.user_chat_id?.toString().trim()
  if (!id || !/^[0-9\-@A-Za-z_]+$/.test(id)) return null
  return id
}

async function fetchLatestUsageSnapshot(
  supabase: SupabaseClient,
  projectId: string
): Promise<{ sys_events_total?: number; user_inputs_total?: number; recent_inputs?: any[] } | null> {
  const baseCols = 'sys_events_total, user_inputs_total, recent_inputs'
  const candidates = ['window_date', 'date', 'window_start', 'created_at', 'inserted_at', 'ts', 'timestamp', 'id'] as const

  for (const col of candidates) {
    try {
      const cols = col === 'id' ? `${baseCols}, id` : `${baseCols}, ${col}`
      const { data, error } = await supabase
        .from('daily_feature_usage_checker')
        .select(cols)
        .eq('project_id', projectId)
        .order(col as any, { ascending: false })
        .limit(1)

      if (!error && Array.isArray(data) && data.length) return data[0] as any
    } catch {}
  }

  const { data } = await supabase
    .from('daily_feature_usage_checker')
    .select(baseCols)
    .eq('project_id', projectId)
    .limit(1)

  return (Array.isArray(data) && data[0]) || null
}

/* ──────────────────────────────────────────────────────────
   Helpers for usage-frequency message generation
─────────────────────────────────────────────────────────── */

function normalizeGoals(raw: any): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean)
  if (typeof raw === 'object') {
    const vals = Object.values(raw as any).flat()
    return vals.map(String).filter(Boolean)
  }
  const s = String(raw).trim()
  try {
    const parsed = JSON.parse(s)
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean)
  } catch {}
  return s.split(/[\n,]/g).map(v => v.trim()).filter(Boolean)
}

function pickNextStep(goals: string[], level: 'low' | 'mid' | 'high', recentInputs?: any): string {
  const primary = goals[0] || ''
  const arr = Array.isArray(recentInputs) ? recentInputs : []
  const last = arr[0] || arr[arr.length - 1] || null
  const hint = (() => {
    if (!last) return ''
    if (typeof last === 'string') return last.slice(0, 60)
    if (typeof last === 'object') {
      const t = (last.text || last.title || last.content || '').toString()
      return t.slice(0, 60)
    }
    return ''
  })()

  const goalBit = primary ? `on “${primary}”` : 'on one of your goals'
  const hintBit = hint ? ` (e.g., “${hint}…”)` : ''

  if (level === 'low') {
    return `Try one quick win ${goalBit}: add a subtask or schedule a 25-minute focus block${hintBit}.`
  }
  if (level === 'mid') {
    return `Great momentum — ship the next unit ${goalBit}: capture 3 concrete TODOs and plan the next session${hintBit}.`
  }
  return `You’re leveling up — set a small milestone ${goalBit} for the next 2–3 days and jot 1 learning${hintBit}.`
}

/* ──────────────────────────────────────────────────────────
   Per-notification runners + test sender
─────────────────────────────────────────────────────────── */

type Urls = ReturnType<typeof buildUrls>

/** If this is a manual run (Run Now), require Premium for ALL types. */
async function assertManualRunAllowed(
  supabase: SupabaseClient,
  projectId: string,
  opts?: { manual?: boolean }
) {
  if (!opts?.manual) return
  const ok = await isPremiumProject(supabase, projectId)
  if (!ok) {
    const err = new Error('Premium required to use Run Now.')
    ;(err as any).code = 'PREMIUM_REQUIRED'
    throw err
  }
}

/** Calendar digest trigger. Delegates delivery to the edge fn, honoring selected channels. */
export async function runCalendarDigest(
  supabase: any,
  rule: Rule,
  urls: Urls,
  sbKey: string,
  opts?: { manual?: boolean }
): Promise<{ result: any; feedback: string }> {
  await assertManualRunAllowed(supabase, rule.project_id, opts)

  const chatRow = await supabase
    .from('project_integrations')
    .select('user_chat_id,is_verified')
    .eq('project_id', rule.project_id)
    .eq('type', 'telegram')
    .maybeSingle()
  const canTelegram = !!(chatRow?.data?.is_verified && chatRow?.data?.user_chat_id)

  const channels = {
    inapp: rule.channels?.inapp ?? true,
    telegram: (rule.channels?.telegram ?? true) && canTelegram,
    email: rule.channels?.email ?? false,
  }

  const res = await fetch(urls.calendarDigest, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: sbKey, Authorization: `Bearer ${sbKey}` },
    body: JSON.stringify({ project_id: rule.project_id, channels }),
  })

  let data: any = null
  try {
    data = await res.json()
  } catch {
    try { data = { text: await res.text() } } catch { data = {} }
  }

  if (!res.ok) throw new Error(data?.error || data?.message || data?.text || `HTTP ${res.status}`)

  let fb = '✅ Calendar digest sent.'
  if (channels.telegram && data?.telegram?.ok === false) fb = '⚠️ Digest ran, Telegram failed.'
  if (!channels.telegram && !channels.email && !channels.inapp) fb = 'ℹ️ Ran, but no delivery channel selected.'
  return { result: data, feedback: fb }
}

export async function sendTest(
  supabase: SupabaseClient,
  rule: Rule,
  urls: Urls,
  sbKey: string,
  getFirstProjectEmail: () => string | null,
  projectIdForTelegram: string
): Promise<{ result: any; feedback: string }> {
  const wantTg = rule.channels?.telegram ?? true
  const wantEmail = rule.channels?.email ?? false

  await assertPremiumForType(supabase, rule.project_id, rule.type)

  let tgResult: any = null
  if (wantTg) {
    const chatId = await getVerifiedTelegramChatId(supabase, projectIdForTelegram)
    if (!chatId) {
      if (!wantEmail) {
        return {
          result: null,
          feedback:
            '❌ No verified Telegram chat_id found. Connect Telegram first (Functions → APIs) or enable Email.',
        }
      }
    } else {
      const text = (rule.template && rule.template.trim()) || `${rule.name} • test message`
      const res = await fetch(urls.sendTelegram, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: sbKey, Authorization: `Bearer ${sbKey}` },
        body: JSON.stringify({
          id: `test_${rule.id}_${Date.now()}`,
          projectId: projectIdForTelegram,
          telegramHandle: chatId,
          subject: `🔔 ${rule.name} (test)`,
          text,
        }),
      })
      tgResult = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(tgResult?.error || tgResult?.message || `HTTP ${res.status}`)
    }
  }

  let emailResult: any = null
  if (wantEmail) {
    const to = getFirstProjectEmail()
    if (!to) {
      return {
        result: { telegram: tgResult, email: emailResult },
        feedback: '⚠️ No email saved. Add one in Functions → APIs.',
      }
    } else {
      const text = (rule.template && rule.template.trim()) || `${rule.name} • test message`
      const res = await fetch(urls.sendEmail, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: sbKey, Authorization: `Bearer ${sbKey}` },
        body: JSON.stringify({ to, subject: `🔔 ${rule.name} (test)`, message: text }),
      })
      emailResult = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(emailResult?.error || emailResult?.message || `HTTP ${res.status}`)
    }
  }

  const channelsSent = [
    wantTg ? (tgResult ? 'Telegram' : null) : null,
    wantEmail ? (emailResult ? 'Email' : null) : null,
  ].filter(Boolean)

  return {
    result: { telegram: tgResult, email: emailResult },
    feedback: channelsSent.length ? `✅ Test sent via ${channelsSent.join(' & ')}.` : 'ℹ️ No channel selected.',
  }
}

export async function runRelevantDiscussion(
  supabase: SupabaseClient,
  rule: Rule,
  urls: Urls,
  sbKey: string,
  getFirstProjectEmail: () => string | null,
  opts?: { manual?: boolean }
): Promise<{ result: any; feedback: string }> {
  await assertManualRunAllowed(supabase, rule.project_id, opts)

  const wantsEmail = rule.channels?.email ?? false
  const chatId = await getVerifiedTelegramChatId(supabase, rule.project_id)

  const channelsForFn = {
    inapp: rule.channels?.inapp ?? true,
    telegram: (rule.channels?.telegram ?? true) && !!chatId,
    email: false,
  }

  const res = await fetch(urls.relevantdiscussion, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: sbKey, Authorization: `Bearer ${sbKey}` },
    body: JSON.stringify({
      project_id: rule.project_id,
      subject: `🔔 ${rule.name}`,
      channels: channelsForFn,
      chat_id: chatId ?? null,
      telegram_chat_id: chatId ?? null,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`)

  if (wantsEmail) {
    const to = getFirstProjectEmail()
    if (to) {
      const emailText =
        data?.email?.text ||
        data?.text ||
        data?.message ||
        (rule.template && rule.template.trim()) ||
        'Relevant discussion digest from Zeta.'

      const emailRes = await fetch(urls.sendEmail, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: sbKey, Authorization: `Bearer ${sbKey}` },
        body: JSON.stringify({ to, subject: `🔔 ${rule.name}`, message: emailText }),
      })
      const emailOut = await emailRes.json().catch(() => ({}))
      if (!res.ok) throw new Error(emailOut?.error || (emailOut as any)?.message || `HTTP ${res.status}`)
      return { result: { relevantdiscussion: data, email: emailOut }, feedback: '✅ Triggered.' }
    }
    return {
      result: { relevantdiscussion: data },
      feedback: '✅ Triggered. ⚠️ Email selected but none saved (Functions → APIs).',
    }
  }

  return { result: { relevantdiscussion: data }, feedback: '✅ Triggered.' }
}

export async function runThoughts(
  supabase: SupabaseClient,
  rule: Rule,
  urls: Urls,
  sbKey: string,
  opts?: { manual?: boolean }
): Promise<{ result: any; feedback: string }> {
  await assertManualRunAllowed(supabase, rule.project_id, opts)
  await assertPremiumForType(supabase, rule.project_id, 'thoughts')

  const chatId = await getVerifiedTelegramChatId(supabase, rule.project_id)
  const channelsSelected = {
    inapp: rule.channels?.inapp ?? true,
    email: false,
    telegram: (rule.channels?.telegram ?? true) && !!chatId,
  }

  const res = await fetch(urls.emitThoughts, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: sbKey, Authorization: `Bearer ${sbKey}` },
    body: JSON.stringify({
      project_id: rule.project_id,
      subject: '🧠 Zeta Thoughts',
      channels: { ...channelsSelected, telegram: channelsSelected.telegram, email: false },
      chat_id: chatId ?? null,
      telegram_chat_id: chatId ?? null,
      template: rule.template ?? '',
      since_hours: 48,
      limit: 5,
      generate_if_missing: true,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`)

  if (data?.ok === false && data?.reason === 'no thoughts') {
    return { result: data, feedback: 'ℹ️ No recent thoughts to send. Try running “generate-thought”.' }
  }

  if (channelsSelected.telegram && chatId) {
    const tg = data?.telegram
    if (tg?.ok) return { result: data, feedback: '✅ Sent to Telegram.' }
    if (tg && tg.status)
      return { result: data, feedback: `❌ Telegram send failed (status ${tg.status}). ${tg.text || ''}` }
    return {
      result: data,
      feedback: '⚠️ Ran, but did not attempt Telegram. Check TELEGRAM_BOT_TOKEN on the server.',
    }
  }

  return { result: data, feedback: '⚠️ Ran, but Telegram channel/ID not configured.' }
}

export async function runUsageFrequency(
  supabase: SupabaseClient,
  rule: Rule,
  urls: ReturnType<typeof buildUrls>,
  sbKey: string,
  getFirstProjectEmail: () => string | null,
  opts?: { manual?: boolean }
): Promise<{ result: any; feedback: string }> {
  await assertManualRunAllowed(supabase, rule.project_id, opts)
  await assertPremiumForType(supabase, rule.project_id, 'usage_frequency')

  const { data: mfRow, error: mfErr } = await supabase
    .from('mainframe_info')
    .select('short_term_goals, current_date')
    .eq('project_id', rule.project_id)
    .maybeSingle()
  if (mfErr) throw toError(mfErr)

  const snapshot = await fetchLatestUsageSnapshot(supabase, rule.project_id)
  if (!snapshot) {
    return { result: null, feedback: 'ℹ️ No daily usage snapshot yet.' }
  }

  const sys = Number(snapshot.sys_events_total ?? 0)
  const user = Number(snapshot.user_inputs_total ?? 0)
  const total = sys + user

  const goals = normalizeGoals(mfRow?.short_term_goals)
  const recentInputs = Array.isArray(snapshot.recent_inputs) ? snapshot.recent_inputs : []

  const coerceTs = (v: any): number | null => {
    if (!v) return null
    const candidate =
      (typeof v === 'object' && (v.timestamp || v.ts || v.created_at)) ||
      (typeof v === 'string' ? v : null)
    if (!candidate) return null
    const t = Date.parse(String(candidate))
    return Number.isFinite(t) ? t : null
  }
  let lastInteractionMs: number | null = null
  for (const item of recentInputs) {
    const ts = coerceTs(item)
    if (ts && (!lastInteractionMs || ts > lastInteractionMs)) lastInteractionMs = ts
  }
  if (!lastInteractionMs) {
    const { data: lastMsgRows } = await supabase
      .from('zeta_conversation_log')
      .select('timestamp')
      .eq('project_id', rule.project_id)
      .order('timestamp', { ascending: false })
      .limit(1)
    const lastMsg = Array.isArray(lastMsgRows) ? lastMsgRows[0] : lastMsgRows
    if (lastMsg?.timestamp) {
      const t = Date.parse(String(lastMsg.timestamp))
      if (Number.isFinite(t)) lastInteractionMs = t
    }
  }
  const lastInteraction = lastInteractionMs ? new Date(lastInteractionMs).toLocaleString() : '—'
  const headerDate = mfRow?.current_date
    ? new Date(mfRow.current_date).toLocaleDateString()
    : new Date().toLocaleDateString()

  const level: 'low' | 'mid' | 'high' = total < 5 ? 'low' : total < 20 ? 'mid' : 'high'

  const pickNextStepLocal = (goalsList: string[], lvl: 'low'|'mid'|'high', ri?: any[]): string => {
    const primary = goalsList[0] || ''
    const arr = Array.isArray(ri) ? ri : []
    const last = arr[0] || arr[arr.length - 1] || null
    const hint = (() => {
      if (!last) return ''
      if (typeof last === 'string') return last.slice(0, 60)
      if (typeof last === 'object') {
        const t = (last.text || last.title || last.content || '').toString()
        return t.slice(0, 60)
      }
      return ''
    })()
    const goalBit = primary ? `on “${primary}”` : 'on one of your goals'
    const hintBit = hint ? ` (e.g., “${hint}…”)` : ''

    if (lvl === 'low') return `Try one quick win ${goalBit}: add a subtask or schedule a 25-minute focus block${hintBit}.`
    if (lvl === 'mid') return `Great momentum — ship the next unit ${goalBit}: capture 3 concrete TODOs and plan the next session${hintBit}.`
    return `You’re leveling up — set a small milestone ${goalBit} for the next 2–3 days and jot 1 learning${hintBit}.`
  }

  const text = [
    `📈 Daily Usage Check (${headerDate}):`,
    '',
    `• Your inputs: ${user} • System events: ${sys} • Total: ${total}`,
    `• Last interaction: ${lastInteraction}`,
    goals.length ? `• Focus: ${goals.slice(0, 3).join(' · ')}` : '',
    '',
    level === 'low'
      ? `Not much activity yet — ${total} total interactions today.\nLet’s nudge things forward. ${pickNextStepLocal(goals, 'low', recentInputs)}`
      : level === 'mid'
      ? `Nice momentum — ${total} interactions today.\nGreat work using Zeta to move your goals. ${pickNextStepLocal(goals, 'mid', recentInputs)}`
      : `You're on fire — ${total} interactions today.\nLeveling up fast. ${pickNextStepLocal(goals, 'high', recentInputs)}`
  ].filter(Boolean).join('\n')

  const result: any = {}
  const wantsTelegram = rule.channels?.telegram ?? true
  const wantsEmail = rule.channels?.email ?? false
  const chatId = await getVerifiedTelegramChatId(supabase, rule.project_id)

  if (wantsTelegram && chatId) {
    const res = await fetch(urls.sendTelegram, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: sbKey, Authorization: `Bearer ${sbKey}` },
      body: JSON.stringify({
        id: `usagefreq_${rule.id}_${Date.now()}`,
        projectId: rule.project_id,
        telegramHandle: chatId,
        subject: '🔔 Usage Frequency (Daily)',
        text,
      }),
    })
    const out = await res.json().catch(() => ({}))
    result.telegram = out
    if (!res.ok) throw new Error(out?.error || out?.message || `HTTP ${res.status}`)
  }

  if (wantsEmail) {
    const to = getFirstProjectEmail()
    if (!to) return { result, feedback: '✅ Sent usage message. • ⚠️ No email saved. Add one in Functions → APIs.' }
    const res = await fetch(urls.sendEmail, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: sbKey, Authorization: `Bearer ${sbKey}` },
      body: JSON.stringify({ to, subject: '🔔 Usage Frequency (Daily)', message: text }),
    })
    const outEmail = await res.json().catch(() => ({}))
    result.email = outEmail
    if (!res.ok) throw new Error(outEmail?.error || outEmail?.message || `HTTP ${res.status}`)
  }

  return { result, feedback: '✅ Sent usage message.' }
}

export async function runOutreach(
  supabase: any,
  rule: Rule,
  urls: ReturnType<typeof buildUrls>,
  sbKey: string,
  getFirstProjectEmail: () => string | null,
  opts?: { manual?: boolean }
): Promise<{ result: any; feedback: string }> {
  await assertManualRunAllowed(supabase, rule.project_id, opts)

  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 25_000)

  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData?.session?.access_token

  let triggerJson: any = null
  try {
    const res = await fetch(urls.dailyChatMessage, {
      method: 'POST',
      signal: ctl.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        apikey: (process?.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY as string) || '',
      },
      body: JSON.stringify({ project_id: rule.project_id, trigger: 'manual' }),
      keepalive: true,
    })

    try { triggerJson = await res.json() } catch { triggerJson = null }

    if (!res.ok) {
      clearTimeout(timer)
      return {
        result: { trigger: { status: res.status, body: triggerJson } },
        feedback: `❌ daily-chat-message failed (${res.status}).`,
      }
    }
  } catch (e: any) {
    clearTimeout(timer)
    if (e?.name === 'AbortError') {
      return { result: { trigger: 'timeout-local' }, feedback: '⏳ Processing in the background…' }
    }
    return { result: null, feedback: `❌ ${e?.message || String(e)}` }
  } finally {
    clearTimeout(timer)
  }

  const { data: msgRows, error: msgErr } = await supabase
    .from('zeta_conversation_log')
    .select('message,timestamp')
    .eq('project_id', rule.project_id)
    .eq('role', 'assistant')
    .order('timestamp', { ascending: false })
    .limit(1)

  if (msgErr || !msgRows?.length) {
    return {
      result: { trigger: triggerJson, deliver: null },
      feedback: '✅ Triggered. (No new message fetched yet.)',
    }
  }

  const latest = msgRows[0]
  const text: string = (latest?.message || '').trim() || rule.template || 'New outreach message'

  const wantsTelegram = rule.channels?.telegram ?? true
  const wantsEmail = rule.channels?.email ?? false

  const result: any = { trigger: triggerJson }

  if (wantsTelegram) {
    const chatId = await getVerifiedTelegramChatId(supabase, rule.project_id)
    if (chatId) {
      const res = await fetch(urls.sendTelegram, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: sbKey,
          Authorization: `Bearer ${sbKey}`,
        },
        body: JSON.stringify({
          id: `outreach_${rule.id}_${Date.now()}`,
          projectId: rule.project_id,
          telegramHandle: chatId,
          subject: '🔔 Outreach Message',
          text,
        }),
      })
      const tgOut = await res.json().catch(() => ({}))
      result.telegram = tgOut
      if (!res.ok) {
        return { result, feedback: `❌ Telegram send failed (${res.status}).` }
      }
    } else {
      result.telegram = { skipped: 'no verified chat_id' }
    }
  }

  if (wantsEmail) {
    const to = getFirstProjectEmail()
    if (to) {
      const res = await fetch(urls.sendEmail, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: sbKey,
          Authorization: `Bearer ${sbKey}`,
        },
        body: JSON.stringify({
          to,
          subject: '🔔 Outreach Message',
          message: text,
        }),
      })
      const emailOut = await res.json().catch(() => ({}))
      result.email = emailOut
      if (!res.ok) {
        return { result, feedback: `❌ Email send failed (${res.status}).` }
      }
    } else {
      result.email = { skipped: 'no project email saved' }
    }
  }

  if (!wantsTelegram && !wantsEmail && !(rule.channels?.inapp ?? false)) {
    return { result, feedback: 'ℹ️ Triggered, but no delivery channel selected.' }
  }

  return { result, feedback: '✅ Message sent.' }
}

export async function runGeneric(
  supabase: SupabaseClient,
  rule: Rule,
  urls: Urls,
  sbKey: string,
  getFirstProjectEmail: () => string | null,
  opts?: { manual?: boolean }
): Promise<{ result: any; feedback: string }> {
  await assertManualRunAllowed(supabase, rule.project_id, opts)
  await assertPremiumForType(supabase, rule.project_id, rule.type)

  const wantsTelegram = rule.channels?.telegram ?? true
  const wantsEmail = rule.channels?.email ?? false
  const chatId = await getVerifiedTelegramChatId(supabase, rule.project_id)
  const text = (rule.template && rule.template.trim()) || rule.name

  const makeSendPayload = (subject: string, textMsg: string) => ({
    id: `${rule.id}:${Date.now()}`,
    projectId: rule.project_id,
    telegramHandle: chatId,
    mode: 'message',
    action: 'send_message',
    skipConnectMessage: true,
    subject,
    text: textMsg,
    message: textMsg,
    chat_id: chatId,
    telegram_chat_id: chatId,
  })

  const result: any = {}

  if (wantsTelegram && chatId) {
    const res = await fetch(urls.sendTelegram, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: sbKey, Authorization: `Bearer ${sbKey}` },
      body: JSON.stringify(makeSendPayload(`🔔 ${rule.name}`, text)),
    })
    const data = await res.json().catch(() => ({}))
    result.telegram = data
    if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`)
  }

  if (wantsEmail) {
    const to = getFirstProjectEmail()
    if (!to) {
      return { result, feedback: 'ℹ️ Ran, but Email selected and no address saved (Functions → APIs).' }
    }
    const res = await fetch(urls.sendEmail, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: sbKey, Authorization: `Bearer ${sbKey}` },
      body: JSON.stringify({ to, subject: `🔔 ${rule.name}`, message: text }),
    })
    const email = await res.json().catch(() => ({}))
    result.email = email
    if (!res.ok) throw new Error(email?.error || email?.message || `HTTP ${res.status}`)
  }

  if (!wantsTelegram && !wantsEmail && !(rule.channels?.inapp ?? false)) {
    return { result, feedback: 'ℹ️ Ran, but no delivery channel selected.' }
  }
  return { result, feedback: '✅ Triggered.' }
}

// keep all the named exports already present
const _default = {
  BUILT_INS,
  defaultChannels,
  buildUrls,
  fetchRules,
  refreshTelegramState,
  refreshEmailState,
  ensureBuiltIn,
  toggleActive,
  sendTest,
  runRelevantDiscussion,
  runThoughts,
  runUsageFrequency,
  runOutreach,
  runGeneric,
  runCalendarDigest,

  // new helpers
  PREMIUM_TYPES,
  normalizePlanRow,
  isPremiumProject,
}
export default _default
