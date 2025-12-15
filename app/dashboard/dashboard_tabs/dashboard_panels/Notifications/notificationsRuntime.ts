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
    defaults: { frequency: 'daily', send_time: '15:00' },
  },
  {
    type: 'calendar',
    label: 'Calendar Digest',
    subtitle: ' ',
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

export function buildUrls(projectId: string, sbUrl?: string) {
  // normalize to avoid double slashes
  const baseRoot = (sbUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL!)?.replace(/\/$/, '')
  const base = `${baseRoot}/functions/v1`
  return {
    // existing single-purpose functions
    relevantdiscussion: `${base}/relevantdiscussion`,
    emitThoughts:       `${base}/emit-thoughts`,
    sendTelegram:       `${base}/send-telegram-message`,
    sendEmail:          `${base}/send-email-message`,
    dailyChatMessage:   `${base}/daily-chat-message`,
    calendarDigest:     `${base}/calendar-digest`,

    // ✅ endpoint for re-arming a rule
    rearmNotification:  `${base}/notification-rules`,
  } as const
}

// (optional) export a type if you want strong typing elsewhere
export type UrlMap = ReturnType<typeof buildUrls>

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
   Sanitizer (for outreach text)
─────────────────────────────────────────────────────────── */

function sanitize(text: string): string {
  let t = (text || '').toString()
  // remove any leading agent label lines like "> ZetaAI:" or "ZetaAI:"
  t = t.replace(/^\s*>?\s*ZetaAI:\s*/gmi, '')
  // remove preferred_user_name/Yogi prefixes at line start
  t = t.replace(/^\s*(preferred_user_name|{{\s*preferred_user_name\s*}}|Yogi)\s*[:,\-–]\s*/gmi, '')
  // drop redundant bell header if it’s already in the body
  t = t.replace(/^\s*🔔\s*[^\n]+\n+/g, '')
  // collapse 3+ blank lines
  t = t.replace(/\n{3,}/g, '\n\n')
  return t.trim()
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

// Tries project_integrations first, then falls back to notification_providers
export async function refreshTelegramState(
  supabase: SupabaseClient,
  projectId: string
): Promise<TgState> {
  try {
    const pi = await supabase
      .from('project_integrations')
      .select('user_chat_id, is_verified')
      .eq('project_id', projectId)
      .eq('type', 'telegram')

    if (Array.isArray(pi.data)) {
      const verified = pi.data.find((r: any) => r.is_verified && r.user_chat_id)
      const pending = pi.data.some((r: any) => !r.is_verified)
      if (verified || pending) {
        return {
          connected: Boolean(verified),
          pending,
          chatId: verified?.user_chat_id ?? null,
        }
      }
    }
  } catch {}

  // fallback: notification_providers
  try {
    // get a user_id for this project
    let userId: string | null = null
    const a = await supabase.from('user_projects').select('user_id').eq('id', projectId).maybeSingle()
    if (a.data?.user_id) userId = a.data.user_id as string
    if (!userId) {
      const b = await supabase.from('user_projects').select('user_id').eq('project_id', projectId).maybeSingle()
      if (b.data?.user_id) userId = b.data.user_id as string
    }

    const q = supabase.from('notification_providers').select('telegram_enabled, telegram_chat_id')
    const { data } = userId ? await q.eq('user_id', userId) : await q.limit(1)
    const row = data?.[0]
    const enabled = !!row?.telegram_enabled
    const chatId = (row?.telegram_chat_id ?? null) as string | null
    return { connected: !!(enabled && chatId), pending: !!(enabled && !chatId), chatId }
  } catch {}

  return { connected: false, pending: false, chatId: null }
}

export async function refreshEmailState(
  supabase: SupabaseClient,
  projectId: string
): Promise<EmailState> {
  try {
    const { data } = await supabase
      .from('project_integrations')
      .select('email_address, value, is_verified')
      .eq('project_id', projectId)
      .eq('type', 'email')

    if (Array.isArray(data) && data.length) {
      const list = data
        .filter((r: any) => r.is_verified)
        .map((r: any) => (r.email_address || r.value || '').trim())
        .filter(Boolean)
      if (list.length) return { connected: true, list }
    }
  } catch {}

  // fallback: notification_providers
  try {
    const np = await supabase
      .from('notification_providers')
      .select('email_enabled, emails, email')
      .limit(1)
    const row = np.data?.[0] ?? null
    const list: string[] = Array.isArray(row?.emails)
      ? row.emails.filter(Boolean)
      : row?.email
      ? [String(row.email)]
      : []
    return { connected: !!(row && (row.email_enabled || list.length)), list }
  } catch {}

  return { connected: false, list: [] }
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

/** Calendar digest trigger. Delegates delivery to the edge fn, honoring selected channels.
 *  Also suppresses empty digests for manual runs to avoid noisy "no events" pings. */
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

  // Manual-run suppression for empty calendars
  const text: string = (data?.telegram?.text || data?.email?.message || data?.text || '').toString()
  const hasEvents =
    data?.eventsCount > 0 ||
    data?.has_events === true ||
    (text && !/no upcoming calendar items/i.test(text))

  if (opts?.manual && !hasEvents) {
    return { result: data, feedback: 'ℹ️ No events — digest suppressed.' }
  }

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
      if (!emailRes.ok) throw new Error(emailOut?.error || (emailOut as any)?.message || `HTTP ${emailRes.status}`)
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
    the: {
      // fallthrough scope label placeholder
    }
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
  await assertManualRunAllowed(supabase, rule.project_id, opts);

  // 🔒 Debounce: avoid spamming outreach if one just went out recently
  try {
    const { data: recentRows } = await supabase
      .from('custom_notifications')
      .select('id, sent_at, type')
      .eq('project_id', rule.project_id)
      .eq('type', 'outreach')
      .order('sent_at', { ascending: false })
      .limit(1);

    const recent = Array.isArray(recentRows) ? recentRows[0] : recentRows;
    if (recent?.sent_at) {
      const last = new Date(recent.sent_at).getTime();
      const now = Date.now();
      const diffMinutes = (now - last) / 60000;

      // if we sent an outreach in the last 2 minutes, skip this run
      if (diffMinutes < 2) {
        return {
          result: { skipped: 'recent_outreach', last_sent_at: recent.sent_at },
          feedback: 'ℹ️ Outreach suppressed (recent message already sent).',
        };
      }
    }
  } catch {
    // best-effort; don't crash if this check fails
  }

  // 1) trigger generator (edge fn) — ask it to produce the line
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 25_000);

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;

  let triggerJson: any = null;
  try {
    const res = await fetch(urls.dailyChatMessage, {
      method: 'POST',
      signal: ctl.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        apikey: (process?.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY as string) || '',
      },
      body: JSON.stringify({
        project_id: rule.project_id,
        trigger: opts?.manual ? 'manual' : 'auto',
      }),
      keepalive: true,
    });
    try {
      triggerJson = await res.json();
    } catch {
      triggerJson = null;
    }
    if (!res.ok) {
      clearTimeout(timer);
      return {
        result: { trigger: { status: res.status, body: triggerJson } },
        feedback: `❌ daily-chat-message failed (${res.status}).`,
      };
    }
  } catch (e: any) {
    clearTimeout(timer);
    if (e?.name === 'AbortError') {
      return {
        result: { trigger: 'timeout-local' },
        feedback: '⏳ Processing in the background…',
      };
    }
    return { result: null, feedback: `❌ ${e?.message || String(e)}` };
  } finally {
    clearTimeout(timer);
  }

  // 2) choose freshest text
  const looksReal = (s: any) =>
    typeof s === 'string' &&
    s.trim().length > 5 &&
    s.trim().toLowerCase() !== 'assistant text written to logs';

  let text: string | null =
    (looksReal(triggerJson?.text) && String(triggerJson.text).trim()) ||
    (looksReal(triggerJson?.message) && String(triggerJson.message).trim()) ||
    null;

  // fallback: outreach_chats latest
  if (!text) {
    try {
      const { data: oc } = await supabase
        .from('outreach_chats')
        .select('message, created_at, id')
        .eq('project_id', rule.project_id)
        .order('created_at', { ascending: false })
        .limit(1);
      const msg = oc?.[0]?.message ? String(oc[0].message).trim() : '';
      if (looksReal(msg)) text = msg;
    } catch {}
  }

  // fallback: custom_notifications (type='outreach')
  if (!text) {
    try {
      const { data: cn } = await supabase
        .from('custom_notifications')
        .select('message, type, sent_at, id')
        .eq('project_id', rule.project_id)
        .eq('type', 'outreach')
        .order('sent_at', { ascending: false })
        .limit(1);
      const msg = cn?.[0]?.message ? String(cn[0].message).trim() : '';
      if (looksReal(msg)) text = msg;
    } catch {}
  }

  // fallback: zeta_conversation_log latest assistant line (order by id)
  if (!text) {
    try {
      const { data: zl } = await supabase
        .from('zeta_conversation_log')
        .select('message, role, id, timestamp, inserted_at, updated_at, time, ts')
        .eq('project_id', rule.project_id)
        .eq('role', 'assistant')
        .order('id', { ascending: false })
        .limit(50);

      const pickTs = (r: any): string =>
        String(
          r?.timestamp || r?.inserted_at || r?.updated_at || r?.time || r?.ts || ''
        );

      const latest = (zl ?? [])
        .filter((r: any) => looksReal(r?.message))
        .sort((a: any, b: any) => pickTs(b).localeCompare(pickTs(a)))[0];

      if (latest?.message) text = String(latest.message).trim();
    } catch {}
  }

  const clean = sanitize(text || '');
  if (!clean) {
    return {
      result: { trigger: triggerJson },
      feedback: 'ℹ️ Outreach suppressed (no fresh text).',
    };
  }

  // 3) deliver
  const wantsTelegram = rule.channels?.telegram ?? true;
  const wantsEmail = rule.channels?.email ?? false;
  const result: any = { trigger: triggerJson };

  if (wantsTelegram) {
    const chatId = await getVerifiedTelegramChatId(supabase, rule.project_id);
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
          text: clean,
        }),
      });
      const tgOut = await res.json().catch(() => ({}));
      result.telegram = tgOut;
      if (!res.ok) {
        return { result, feedback: `❌ Telegram send failed (${res.status}).` };
      }
    } else {
      result.telegram = { skipped: 'no verified chat_id' };
    }
  }

  if (wantsEmail) {
    const to = getFirstProjectEmail();
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
          message: clean,
        }),
      });
      const emailOut = await res.json().catch(() => ({}));
      result.email = emailOut;
      if (!res.ok) {
        return { result, feedback: `❌ Email send failed (${res.status}).` };
      }
    } else {
      result.email = { skipped: 'no project email saved' };
    }
  }

  if (!wantsTelegram && !wantsEmail && !(rule.channels?.inapp ?? false)) {
    return {
      result,
      feedback: 'ℹ️ Triggered, but no delivery channel selected.',
    };
  }

  return { result, feedback: '✅ Message sent.' };
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
