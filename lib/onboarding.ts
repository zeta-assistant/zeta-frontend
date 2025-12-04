// app/lib/onboarding.ts
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import OpenAI from 'openai';

/* ──────────────────────────────────────────────────────────
   Steps & Status (0–4)
─────────────────────────────────────────────────────────── */
export const ONBOARDING_STEPS = ['vision', 'long_term_goals', 'short_term_goals', 'telegram'] as const;
export type OnboardingKey = (typeof ONBOARDING_STEPS)[number];
export type OnboardingStatus = 0 | 1 | 2 | 3 | 4;

function maxStatus(a: OnboardingStatus, b: OnboardingStatus): OnboardingStatus {
  return (a >= b ? a : b) as OnboardingStatus;
}

export function getStepIndex(step: OnboardingKey): number {
  return ONBOARDING_STEPS.indexOf(step) + 1;
}
export function getStepByIndex(index: number): OnboardingKey | null {
  return ONBOARDING_STEPS[index - 1] ?? null;
}

export function getCurrentStepPrompt(step: OnboardingKey): string {
  const prompts: Record<OnboardingKey, string> = {
    vision:
      "First up is your project vision. In a couple of sentences, what do you ultimately want this project to achieve? If you're unsure for now, you can type **'skip'** and come back to this later.",
    long_term_goals:
      "Next is your Long-term goals. Over the next few months or years, what would you love this project to achieve? If you're unsure for now, you can type **'skip'** and we’ll move on.",
    short_term_goals:
      "Now let’s set some Short-term goals. What are your priorities for today, this week, or the next few weeks? If you're unsure, you can type **'skip'** and we’ll continue.",
    telegram:
      "Last step: connect your Telegram so I can send you important notifications. Once it’s linked, tell me it’s done — or type **'skip'** if you’d rather set this up later.",
  };
  return prompts[step];
}

/* ──────────────────────────────────────────────────────────
   Log helpers
─────────────────────────────────────────────────────────── */
type LogRow = { created_at: string; actor: 'user' | 'zeta'; event: string; details: any };
type LatestLogOpts = { event?: string; events?: string[]; detailsContains?: Record<string, string> };

async function latestLog(projectId: string, opts: LatestLogOpts): Promise<LogRow | null> {
  let q = supabaseAdmin
    .from('system_logs')
    .select('created_at, actor, event, details')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (opts.event) q = q.eq('event', opts.event);
  if (opts.events?.length) q = q.in('event', opts.events);
  if (opts.detailsContains) q = q.contains('details', opts.detailsContains);

  const { data, error } = await q;
  if (error) {
    console.error('latestLog error', error);
    return null;
  }
  return (data && data[0]) || null;
}

/* If you still need to detect files elsewhere, keep this. Not part of the 0–4 flow. */
export async function checkUploadedFiles(projectId: string): Promise<boolean> {
  const { data: fileLog } = await supabaseAdmin
    .from('system_logs')
    .select('id')
    .eq('project_id', projectId)
    .in('event', ['file.upload', 'file.generate', 'file.convert'])
    .limit(1);
  if (fileLog?.length) return true;

  const { data: docs } = await supabaseAdmin
    .from('documents')
    .select('id')
    .eq('project_id', projectId)
    .limit(1);

  return !!docs?.length;
}

/* ──────────────────────────────────────────────────────────
   Status derivation and syncing
─────────────────────────────────────────────────────────── */
function hasText(v: unknown): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}
function countItems(v: unknown): number {
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string' && x.trim()).length;
  if (typeof v === 'string') {
    return v
      .split(/\n|\\n|•|-|\*/g)
      .map((s) => s.trim().replace(/^[-•*]\s*/, ''))
      .filter(Boolean).length;
  }
  return 0;
}

export async function deriveOnboardingStatus(projectId: string): Promise<OnboardingStatus> {
  const { data: proj, error: projErr } = await supabaseAdmin
    .from('user_projects')
    .select('vision, long_term_goals, short_term_goals, telegram_connected, onboarding_status')
    .eq('id', projectId)
    .single();
  if (projErr) console.error('deriveOnboardingStatus: failed to load project', projErr);

  const prevStatus: OnboardingStatus = (proj?.onboarding_status ?? 0) as OnboardingStatus;

  const [visionLog, ltLog, stLog, telegramLog] = await Promise.all([
    latestLog(projectId, { event: 'project.vision.update' }),
    latestLog(projectId, { event: 'project.goals.long.update' }),
    latestLog(projectId, { event: 'project.goals.short.update' }),
    latestLog(projectId, { event: 'api.connect', detailsContains: { provider: 'Telegram', status: 'connected' } }),
  ]);

  // Start from zero, then layer on what we know.
  let status: OnboardingStatus = 0;

  // ✅ VISION:
  // - Count as done if we have an explicit vision log (user actually set/confirmed it)
  // - OR if a previous run already had status ≥ 1 **and** a non-empty vision saved.
  // - This prevents template-seeded / default vision from auto-skipping step 1.
  if (visionLog || (prevStatus >= 1 && hasText(proj?.vision))) {
    status = 1;
  }

  // ✅ LONG-TERM GOALS:
  if (countItems(proj?.long_term_goals) > 0 || ltLog) {
    status = maxStatus(status, 2);
  }

  // ✅ SHORT-TERM GOALS:
  if (countItems(proj?.short_term_goals) > 0 || stLog) {
    status = maxStatus(status, 3);
  }

  // ✅ TELEGRAM:
  if (proj?.telegram_connected === true || telegramLog) {
    status = 4;
  }

  return status;
}

export async function syncOnboardingStatus(projectId: string): Promise<OnboardingStatus> {
  const status = await deriveOnboardingStatus(projectId);
  const { data: current, error: readErr } = await supabaseAdmin
    .from('user_projects')
    .select('onboarding_status')
    .eq('id', projectId)
    .single();
  if (readErr) console.error('syncOnboardingStatus: read error', readErr);

  if (current?.onboarding_status !== status) {
    const { error: updErr } = await supabaseAdmin
      .from('user_projects')
      .update({ onboarding_status: status })
      .eq('id', projectId);
    if (updErr) console.error('syncOnboardingStatus: update error', updErr);
  }
  return status;
}

export async function shouldUseOnboarding(projectId: string): Promise<boolean> {
  // Prefer the flag if present
  const { data: mf } = await supabaseAdmin
    .from('mainframe_info')
    .select('onboarding_complete')
    .eq('project_id', projectId)
    .maybeSingle();

  if (mf?.onboarding_complete === true) return false;

  const status = await syncOnboardingStatus(projectId);
  return status < 4;
}

export async function getNextOnboardingStep(projectId: string): Promise<OnboardingKey | null> {
  const status = await deriveOnboardingStatus(projectId);
  switch (status) {
    case 0:
      return 'vision';
    case 1:
      return 'long_term_goals';
    case 2:
      return 'short_term_goals';
    case 3:
      return 'telegram';
    default:
      return null;
  }
}

export async function getProgressIndex(projectId: string): Promise<number> {
  return await deriveOnboardingStatus(projectId);
}

/* ──────────────────────────────────────────────────────────
   Shared context (reads user_input_log.timestamp)
─────────────────────────────────────────────────────────── */
export type SharedContext = {
  mainframeInfo: any | null;
  recentUserInputs: { timestamp: string; author?: string | null; content: string }[];
};

export async function getSharedContext(projectId: string): Promise<SharedContext> {
  const [{ data: mf }, { data: inputs }] = await Promise.all([
    supabaseAdmin.from('mainframe_info').select('*').eq('project_id', projectId).single(),
    supabaseAdmin
      .from('user_input_log')
      .select('timestamp, author, content')
      .eq('project_id', projectId)
      .order('timestamp', { ascending: false })
      .limit(5),
  ]);

  return {
    mainframeInfo: mf ?? null,
    recentUserInputs: (inputs ?? []) as SharedContext['recentUserInputs'],
  };
}

/* ──────────────────────────────────────────────────────────
   Handle user replies DURING onboarding
   - Also logs each message into user_input_log
─────────────────────────────────────────────────────────── */
const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

function parseBullets(text: string, maxItems: number): string[] {
  return (text || '')
    .split(/\n|\\n|•|-|\*/g)
    .map((s) => s.trim().replace(/^[-•*]\s*/, ''))
    .filter(Boolean)
    .slice(0, maxItems);
}

const YES_RE = /^(y|ya|ye|yep|yeah|yes|ok|okay|k)$/i;
const DONE_RE = /\b(done|finished|complete(d)?|all\s*set|set\s*up|configured|hooked\s*up)\b/i;
const TELEGRAM_RE = /\b(connected|linked|paired|bound)\b/i;

export async function handleUserResponse(
  projectId: string,
  message: string,
  currentStep: OnboardingKey
): Promise<void> {
  const raw = (message || '').trim();
  const lc = raw.toLowerCase();

  // Log every onboarding message to user_input_log
  try {
    await supabaseAdmin.from('user_input_log').insert({
      project_id: projectId,
      content: raw,
      author: 'user',
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error('user_input_log insert failed', e);
  }

  // Allow skip, but do NOT mark Telegram as connected on skip.
  // (Skipping a step is handled in /api/chat; here we just avoid writing data.)
  if (lc === 'skip') {
    await syncOnboardingStatus(projectId);
    return;
  }

  // Telegram step
  if (currentStep === 'telegram') {
    if (YES_RE.test(lc) || DONE_RE.test(lc) || TELEGRAM_RE.test(lc)) {
      await supabaseAdmin.from('user_projects').update({ telegram_connected: true }).eq('id', projectId);
      // api.connect log should be inserted by your verifier.
    }
    await syncOnboardingStatus(projectId);
    return;
  }

  // Vision / Goals cleanup via LLM (best effort)
  if (currentStep === 'vision' || currentStep === 'long_term_goals' || currentStep === 'short_term_goals') {
    const promptMap: Record<OnboardingKey, string> = {
      vision: 'The user described their project vision. Rephrase it clearly in 1–2 concise sentences.',
      long_term_goals: 'The user described their long-term goals. Reword them as 1–3 clear bullet items (short phrases).',
      short_term_goals: 'The user shared short-term goals. Rewrite them as 1–5 specific bullet items (short phrases).',
      telegram: '',
    };

    let processed = raw;
    try {
      const resp = await openai.chat.completions.create({
        model: 'gpt-4o',
        temperature: 0.4,
        messages: [
          { role: 'system', content: promptMap[currentStep] },
          { role: 'user', content: raw },
        ],
      });
      processed = resp.choices?.[0]?.message?.content?.trim() || raw;
    } catch {
      processed = raw;
    }

    if (currentStep === 'vision') {
      await supabaseAdmin.from('user_projects').update({ vision: processed }).eq('id', projectId);
      await supabaseAdmin.from('system_logs').insert({
        project_id: projectId,
        actor: 'user',
        event: 'project.vision.update',
        details: { excerpt: processed.slice(0, 140) },
      });
      await syncOnboardingStatus(projectId);
      return;
    }

    const max = currentStep === 'short_term_goals' ? 5 : 3;
    const items = parseBullets(processed, max);
    const value = items.join('\n');

    await supabaseAdmin
      .from('user_projects')
      // @ts-ignore dynamic key write
      .update({ [currentStep]: value })
      .eq('id', projectId);

    const goalEvent = currentStep === 'short_term_goals' ? 'project.goals.short.update' : 'project.goals.long.update';
    await supabaseAdmin.from('system_logs').insert({
      project_id: projectId,
      actor: 'user',
      event: goalEvent,
      details: { count: items.length },
    });

    await syncOnboardingStatus(projectId);
    return;
  }
}

/* ──────────────────────────────────────────────────────────
   Utility
─────────────────────────────────────────────────────────── */
export function nextStepFromStatus(status: OnboardingStatus): OnboardingKey | null {
  switch (status) {
    case 0:
      return 'vision';
    case 1:
      return 'long_term_goals';
    case 2:
      return 'short_term_goals';
    case 3:
      return 'telegram';
    default:
      return null;
  }
}
