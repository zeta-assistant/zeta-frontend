// app/api/chat/route.ts
import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { AVAILABLE_MODELS } from '@/lib/models';
import {
  getCurrentStepPrompt,
  shouldUseOnboarding,
  getSharedContext,
  type OnboardingKey,
} from '@/lib/onboarding';
import { sum, product, evaluate as evalExpr } from '@/lib/mathEngine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY! });

type AutonomyPolicy = 'off' | 'shadow' | 'ask' | 'auto';
type ProjectFileRow = { file_name: string; file_url: string; created_at: string };
type RecentUserInput = { timestamp?: string; created_at?: string; author?: string | null; content: string };

/* ───────────────── helpers ───────────────── */

function labelForStep(k: OnboardingKey) {
  switch (k) {
    case 'vision':
      return 'Project vision';
    case 'long_term_goals':
      return 'Long-term goals';
    case 'short_term_goals':
      return 'Short-term goals';
    case 'telegram':
      return 'Connect Telegram';
  }
}

function stepIndexFromKey(step: OnboardingKey): number {
  switch (step) {
    case 'vision': return 1;
    case 'long_term_goals': return 2;
    case 'short_term_goals': return 3;
    case 'telegram': return 4;
    default: return 0;
  }
}

// 🔹 map numeric onboarding_status (0–3) → logical step
function stepFromStatus(status: number): OnboardingKey | null {
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
      return null; // 4+ ⇒ complete
  }
}

function isOnboardingQuestion(input?: string) {
  if (!input) return false;
  const s = input.toLowerCase();
  return (
    /\bonboarding\b/.test(s) &&
    (/\bwhat\b.*\bstep\b/.test(s) ||
      /\bwhich\b.*\bstep\b/.test(s) ||
      /\bwhere\b.*\bam i\b/.test(s) ||
      /\bstatus\b/.test(s) ||
      /\bprogress\b/.test(s))
  );
}

function isSkipOnboardingRequest(input?: string) {
  if (!input) return false;
  const s = input.trim().toLowerCase();
  return (
    s === 'skip' ||
    s === 'skip this' ||
    s === 'skip for now' ||
    s === 'skip step' ||
    s === 'idk' ||
    s === "i don't know" ||
    s === "i dont know"
  );
}

// 🔧 NEW: fuzzy "done" detector so phrases like "ok should be done now" work
function isDoneOnboardingRequest(input?: string) {
  if (!input) return false;
  const s = input.toLowerCase();
  return /\b(done|finished|complete(d)?|all\s*done|all\s*set|set\s*up|configured|hooked\s*up)\b/.test(s);
}

function parseFilesIntent(message?: string) {
  if (!message) return { wantsFiles: false, query: '' };
  const m = message.match(/^\/files(?:\s+(.*))?$/i);
  return m ? { wantsFiles: true, query: (m[1] || '').trim() } : { wantsFiles: false, query: '' };
}

async function fetchProjectFiles(
  projectId: string,
  opts?: { search?: string; limit?: number }
): Promise<ProjectFileRow[]> {
  const { search = '', limit = 20 } = opts || {};
  let q = supabaseAdmin
    .from('documents')
    .select('file_name, file_url, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (search) q = q.ilike('file_name', `%${search}%`);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ProjectFileRow[];
}

async function readBody(
  req: Request
): Promise<{ message: string; projectId: string; modelId?: string; verbosity?: 'short' | 'normal' | 'long' }> {
  try {
    if (req.headers.get('content-type')?.includes('application/json')) {
      return await req.json();
    }
  } catch {}
  const text = await req.text();
  try {
    return JSON.parse(text);
  } catch {
    const params = new URLSearchParams(text);
    return {
      message: params.get('message') || '',
      projectId: params.get('projectId') || '',
      modelId: params.get('modelId') || 'gpt-4o',
      verbosity: (params.get('verbosity') as any) || 'normal',
    };
  }
}

async function safeGetSharedContext(projectId: string): Promise<{ mainframeInfo: any; recentUserInputs: RecentUserInput[] }> {
  try {
    const ctx = await getSharedContext(projectId);
    return {
      mainframeInfo: ctx?.mainframeInfo ?? {},
      recentUserInputs: Array.isArray(ctx?.recentUserInputs) ? ctx.recentUserInputs : [],
    };
  } catch (e: any) {
    console.error('⚠️ getSharedContext failed; fallback:', e?.message ?? e);
    const { data: uil } = await supabaseAdmin
      .from('user_input_log')
      .select('content, timestamp, author')
      .eq('project_id', projectId)
      .order('timestamp', { ascending: false })
      .limit(5);
    const recentUserInputs =
      (uil ?? []).map((r) => ({ content: r.content, timestamp: r.timestamp, author: r.author ?? 'user' })) as RecentUserInput[];
    return { mainframeInfo: {}, recentUserInputs };
  }
}

async function handleRequiredActions(
  threadId: string,
  runId: string,
  run: any,
  projectId: string,
  autonomyPolicy: AutonomyPolicy
) {
  const tcalls = run?.required_action?.submit_tool_outputs?.tool_calls ?? [];
  if (!tcalls.length) return;
  const tool_outputs: Array<{ tool_call_id: string; output: string }> = [];
  for (const tc of tcalls) {
    if (tc.type !== 'function') continue;
    const name = tc.function?.name ?? '';
    try {
      const args = JSON.parse(tc.function?.arguments || '{}');
      if (name === 'compute_math') {
        const mode = String(args.mode || '').toLowerCase();
        let out: any;
        if (mode === 'sum') out = { result: Number(sum(args.numbers || []).toString()) };
        else if (mode === 'product') out = { result: Number(product(args.numbers || []).toString()) };
        else if (mode === 'expression') out = { result: evalExpr(String(args.expression || '0')) };
        else out = { error: `Unsupported mode: ${mode}` };
        tool_outputs.push({ tool_call_id: tc.id, output: JSON.stringify(out) });
      } else if (name === 'propose_autonomy') {
        const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
        const srk = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!baseUrl || !srk) {
          tool_outputs.push({
            tool_call_id: tc.id,
            output: JSON.stringify({ ok: false, error: 'Missing Supabase URL or Service Role Key in env.' }),
          });
        } else {
          const res = await fetch(`${baseUrl}/functions/v1/apply-autonomy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: srk, Authorization: `Bearer ${srk}` },
            body: JSON.stringify({ projectId, policy: autonomyPolicy, plan: args }),
          });
          let out: any;
          try {
            out = await res.json();
          } catch {
            out = { ok: res.ok };
          }
          tool_outputs.push({ tool_call_id: tc.id, output: JSON.stringify(out) });
        }
      } else {
        tool_outputs.push({ tool_call_id: tc.id, output: JSON.stringify({ error: `Unhandled tool: ${name}` }) });
      }
    } catch (e: any) {
      tool_outputs.push({ tool_call_id: tc.id, output: JSON.stringify({ error: e?.message || String(e) }) });
    }
  }
  await openai.beta.threads.runs.submitToolOutputs(runId, { thread_id: threadId, tool_outputs });
}

function clampShort(text: string) {
  const parts = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const firstTwo = parts.slice(0, 2).join(' ');
  const words = firstTwo.split(/\s+/);
  return words.length <= 60 ? firstTwo : words.slice(0, 60).join(' ') + '…';
}

/**
 * Normalise vision text so we *don't* store stuff like
 * "The project aims to learn..." and instead just:
 * "Learn all of ancient history."
 */
function normalizeVisionText(raw: string): string {
  let v = raw.trim();

  // strip surrounding quotes
  v = v.replace(/^["']+|["']+$/g, '');

  // strip leading boilerplate phrases
  v = v
    .replace(/^the project aims to\s*/i, '')
    .replace(/^the project aim is to\s*/i, '')
    .replace(/^the aim of this project is to\s*/i, '')
    .replace(/^the goal is to\s*/i, '')
    .replace(/^my (project )?vision is to\s*/i, '')
    .replace(/^i (?:want|would like) to\s*/i, '')
    .replace(/^to\s+/i, '')
    .trim();

  if (!v) return '';

  // Capitalise first letter
  v = v.charAt(0).toUpperCase() + v.slice(1);

  // Ensure it ends with basic punctuation
  if (!/[.!?]$/.test(v)) v += '.';

  return v;
}

/**
 * Strip legacy assistant disclaimers about not being able
 * to save goals/vision, plus old 📌 blocks.
 */
function stripLegacyGoalWarning(text: string) {
  const cleaned = text
    // Old 📌 blocks
    .replace(/📌[\s\S]*?(?=\n—|$)/g, '')
    // "It looks like I can't save your project vision directly..."
    .replace(
      /It looks like I (?:currently )?can't save your project vision directly[\s\S]*?(?=\n—|$)/gi,
      ''
    )
    // "It seems there was/is an issue with updating your X goals..."
    .replace(
      /It seems there (?:was|is) an issue with updating your (?:long-term|short-term) goals[\s\S]*?(?=\n—|$)/gi,
      ''
    )
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return cleaned;
}

/* ───────────────── route ───────────────── */

export async function POST(req: Request) {
  try {
    const body = await readBody(req);
    const { message, projectId, modelId = 'gpt-4o', verbosity = 'normal' } = body;

    const now = new Date();
    const nowISO = now.toISOString();

    const model = AVAILABLE_MODELS.find((m) => m.id === modelId);
    if (!model) {
      return NextResponse.json({ reply: '⚠️ Invalid model selected.' }, { status: 400 });
    }

    // get project & owner (also grabbing onboarding_status)
    const { data: projRow, error: projErr } = await supabaseAdmin
      .from('user_projects')
      .select('assistant_id, preferred_user_name, autonomy_policy, user_id, name, onboarding_status')
      .eq('id', projectId)
      .single();

    if (projErr) {
      console.error('❌ /api/chat: failed to load project', projErr.message);
      return NextResponse.json(
        { reply: '⚠️ Could not load this project.', error: projErr.message },
        { status: 500 }
      );
    }

    if (!projRow?.user_id) {
      return NextResponse.json(
        {
          reply: '⚠️ This project is missing its owner (user_id).',
          error: 'Missing user_id on project',
        },
        { status: 400 }
      );
    }

    const ownerUserId: string = projRow.user_id as string;
    const autonomyPolicy: AutonomyPolicy = (projRow?.autonomy_policy as AutonomyPolicy) ?? 'auto';
    const projectOnboardingStatus: number = (projRow as any).onboarding_status ?? 0;

    /* ──────────────────────────────────────────────
       Ensure we ALWAYS have an assistant_id
    ─────────────────────────────────────────────── */
    let assistantId = projRow.assistant_id as string | null;

    if (!assistantId) {
      console.warn('⚠️ /api/chat: no assistant_id for project, creating fallback assistant…');

      const fallback = await openai.beta.assistants.create({
        name: projRow.name ? `${projRow.name} (fallback)` : 'Zeta Fallback',
        model: modelId === 'gpt-4o' ? 'gpt-4o' : 'gpt-4',
        instructions:
          'You are Zeta, an AI assistant for this project. Respond clearly, helpfully, and concisely.',
        tools: [{ type: 'file_search' }],
      });

      assistantId = fallback.id;

      const { error: upErr } = await supabaseAdmin
        .from('user_projects')
        .update({ assistant_id: assistantId })
        .eq('id', projectId);

      if (upErr) {
        console.error('❌ /api/chat: failed to save fallback assistant_id', upErr.message);
        return NextResponse.json(
          {
            reply: '⚠️ Failed to attach an assistant to this project.',
            error: upErr.message,
          },
          { status: 500 }
        );
      }
    }

    // thread management
    const { data: existingThread } = await supabaseAdmin
      .from('threads')
      .select('*')
      .eq('project_id', projectId)
      .order('last_active', { ascending: false })
      .limit(1)
      .maybeSingle();

    const expired =
      existingThread?.expired ||
      (existingThread?.last_active && now.getTime() - new Date(existingThread.last_active).getTime() > 1000 * 60 * 60);

    let threadId = existingThread?.thread_id as string | undefined;
    if (!existingThread || !existingThread.thread_id || expired) {
      const newThread = await openai.beta.threads.create();
      threadId = newThread.id;
      await supabaseAdmin.from('threads').insert({
        project_id: projectId,
        thread_id: threadId,
        created_at: nowISO,
        last_active: nowISO,
        expired: false,
      });
      await supabaseAdmin.from('user_projects').update({ thread_id: threadId }).eq('id', projectId);
    } else {
      await supabaseAdmin.from('threads').update({ last_active: nowISO }).eq('thread_id', threadId!);
    }

    // onboarding state (prefer mainframe flag + status 0–4)
    const { data: mf } = await supabaseAdmin
      .from('mainframe_info')
      .select('onboarding_complete')
      .eq('project_id', projectId)
      .maybeSingle();

    const mfComplete = mf?.onboarding_complete === true;

    // keep mainframe flag in sync if status already 4+
    if (projectOnboardingStatus >= 4 && !mfComplete) {
      try {
        await supabaseAdmin
          .from('mainframe_info')
          .update({ onboarding_complete: true })
          .eq('project_id', projectId);
      } catch (e) {
        console.error('⚠️ failed to sync onboarding_complete from status>=4:', e);
      }
    }

    const onboardingComplete = mfComplete || projectOnboardingStatus >= 4;
    const onboardingActive =
      !onboardingComplete && (await shouldUseOnboarding(projectId));
    const nextStep: OnboardingKey | null = onboardingActive
      ? stepFromStatus(projectOnboardingStatus)
      : null;

    // ✅ log user input ASAP so even early-return flows (skip, "what step") have a server-side timestamp
    try {
      await supabaseAdmin.from('user_input_log').insert({
        project_id: projectId,
        author: 'user',
        content: message,
        timestamp: nowISO,
        meta: { source: 'chat_tab' },
      });
    } catch (e) {
      console.error('⚠️ user_input_log insert failed (continuing):', e);
    }

    // ─────────────────────────────
    // "skip" only skips the CURRENT step
    // plus "done" can finish Telegram step
    // ─────────────────────────────
    if (
      onboardingActive &&
      nextStep &&
      (isSkipOnboardingRequest(message) ||
        (nextStep === 'telegram' && isDoneOnboardingRequest(message)))
    ) {
      const skippedStep = nextStep;
      const skippedLabel = labelForStep(skippedStep);
      const skippedIndex = stepIndexFromKey(skippedStep);

      // New status: mark this step as complete (or keep higher status if already ahead)
      let newStatus = projectOnboardingStatus;
      if (newStatus < skippedIndex) newStatus = skippedIndex;

      // Determine what comes after the skipped step
      let nextAfterSkip: OnboardingKey | 'complete';
      switch (skippedStep) {
        case 'vision':
          nextAfterSkip = 'long_term_goals';
          break;
        case 'long_term_goals':
          nextAfterSkip = 'short_term_goals';
          break;
        case 'short_term_goals':
          nextAfterSkip = 'telegram';
          break;
        case 'telegram':
        default:
          nextAfterSkip = 'complete';
          break;
      }

      const onboardingNowComplete = nextAfterSkip === 'complete' || newStatus >= 4;

      try {
        // Update onboarding_status (+ onboarding_complete in user_projects when fully done)
        const updatePayload: any = {
          onboarding_status: onboardingNowComplete ? 4 : newStatus,
        };
        if (onboardingNowComplete) {
          updatePayload.onboarding_complete = true;
        }

        await supabaseAdmin
          .from('user_projects')
          .update(updatePayload)
          .eq('id', projectId);

        // Only mark fully complete if we skipped the last step
        if (onboardingNowComplete) {
          await supabaseAdmin
            .from('mainframe_info')
            .update({ onboarding_complete: true, updated_at: nowISO })
            .eq('project_id', projectId);
        }

        // Log the skipped step
        await supabaseAdmin.from('system_logs').insert({
          project_id: projectId,
          actor: 'user',
          event: 'onboarding.skip_step',
          details: {
            skipped_step: skippedStep,
            new_status: onboardingNowComplete ? 4 : newStatus,
            via: 'chat',
            message,
          },
        });

        // Build conversational reply
        let reply: string;
        if (onboardingNowComplete) {
          reply =
            "All good — we’ll skip the Telegram step and call setup done. " +
            "You can always connect Telegram later from the APIs panel if you’d like.";
        } else {
          const nextLabel = labelForStep(nextAfterSkip as OnboardingKey);
          reply =
            `No worries, we can skip **${skippedLabel}** for now.\n` +
            `Next up, let’s talk about **${nextLabel}**.\n` +
            getCurrentStepPrompt(nextAfterSkip as OnboardingKey);
        }

        // Append assistant row so it shows in chat history
        let appended: any = null;
        try {
          const { data, error } = await supabaseAdmin
            .from('zeta_conversation_log')
            .insert({
              id: crypto.randomUUID(),
              user_id: ownerUserId,
              project_id: projectId,
              thread_id: threadId,
              role: 'assistant',
              message: reply,
              timestamp: new Date().toISOString(),
              content_type: 'plain',
              metadata: { source: 'onboarding-skip-step', skipped_step: skippedStep },
            })
            .select()
            .single();
          if (error) throw error;
          appended = data;
        } catch (e) {
          console.error('❌ Failed to insert assistant row for onboarding skip-step:', e);
        }

        return NextResponse.json({
          reply,
          threadId,
          appended,
          onboarding: !onboardingNowComplete,
          step: onboardingNowComplete ? 'complete' : nextAfterSkip,
          onboarding_status: onboardingNowComplete ? 4 : newStatus,
        });
      } catch (e) {
        console.error('❌ Failed to apply onboarding skip-step:', e);
        // fall through to normal flow on error
      }
    }

    // If user explicitly asks "what onboarding step am I on?"
    if (isOnboardingQuestion(message)) {
      const displayStep = Math.min(Math.max(projectOnboardingStatus + 1, 1), 4);

      if (nextStep) {
        return NextResponse.json({
          status: 'onboarding',
          onboarding: true,
          step: nextStep,
          onboarding_status: projectOnboardingStatus,
          reply: `We’re still in the setup flow — you’re around step ${displayStep} of 4.\nRight now we’re on **${labelForStep(
            nextStep
          )}**.\n${getCurrentStepPrompt(nextStep)}`,
          threadId,
        });
      }
      return NextResponse.json({
        status: 'onboarding',
        onboarding: false,
        step: 'complete',
        onboarding_status: projectOnboardingStatus,
        reply: 'Setup is all done (4/4). ✅',
        threadId,
      });
    }

    const { mainframeInfo, recentUserInputs } = await safeGetSharedContext(projectId);

    const { wantsFiles, query } = parseFilesIntent(message);
    let filesContext: ProjectFileRow[] = [];
    if (wantsFiles) {
      const files = await fetchProjectFiles(projectId, { search: query, limit: 20 });
      filesContext = files.map((f) => ({ file_name: f.file_name, file_url: f.file_url, created_at: f.created_at }));
    }

    const inputsFormatted =
      !recentUserInputs || (recentUserInputs as RecentUserInput[]).length === 0
        ? 'None'
        : (recentUserInputs as RecentUserInput[])
            .map((u) => `- [${u.created_at ?? u.timestamp ?? ''}] ${u.author ?? 'user'}: ${u.content ?? ''}`)
            .join('\n');

    const filesFormatted =
      filesContext.length === 0
        ? wantsFiles
          ? 'No matching files.'
          : 'Not requested.'
        : filesContext.map((f) => `- ${f.file_name} — ${f.file_url} (${f.created_at})`).join('\n');

    const verbosityInstruction =
      body.verbosity === 'short'
        ? 'For THIS reply, keep it to 1–2 sentences (<= ~60 words).'
        : body.verbosity === 'long'
        ? 'For THIS reply, be thorough: at least 5 sentences with helpful detail.'
        : 'No special length requirement for this reply.';

    const context = `[CONTEXT]
Now: ${nowISO}
You are Zeta — the AI assistant for this project.
Preferred user name: ${projRow?.preferred_user_name || 'there'}

[VERBOSITY]
${verbosityInstruction}

[MAINFRAME]
${JSON.stringify(mainframeInfo ?? {}, null, 2)}

[RECENT_USER_INPUTS (last 5)]
${inputsFormatted}

[PROJECT_FILES] — included only when the user calls /files
${filesFormatted}
(If the user asks to search files, ask them to use "/files <keywords>" and then base your response on the provided list.)

[AUTONOMY]
If appropriate, call the function "propose_autonomy" ONCE with the minimal, high-confidence changes that would help now.
Cover only what is needed among: vision, long_term_goals, short_term_goals, tasks (create/update), calendar_items (create/update), files (generate).
Avoid duplicates (prefer updates). Keep it concise.
You may also remove goals by including { "delete": true } and an "id" (preferred) or an exact "description".

— End of context.`;

    await openai.beta.threads.messages.create(threadId!, { role: 'user', content: context });
    await openai.beta.threads.messages.create(threadId!, { role: 'user', content: message || ' ' });

    let run = await openai.beta.threads.runs.createAndPoll(threadId!, { assistant_id: assistantId! });
    if (run.status === 'requires_action') {
      await handleRequiredActions(threadId!, run.id, run, projectId, autonomyPolicy);
      run = await openai.beta.threads.runs.poll(run.id, { thread_id: threadId! });
    }

    const list = await openai.beta.threads.messages.list(threadId!, { order: 'desc', limit: 50 });
    const extractText = (msg: any) => {
      const parts = msg?.content ?? [];
      const chunks: string[] = [];
      for (const p of parts) if (p?.type === 'text' && p.text?.value) chunks.push(p.text.value);
      return chunks.join('\n\n').trim();
    };
    const produced = list.data.filter((m: any) => m.role === 'assistant' && m.run_id === run.id);
    let textContent = produced.map(extractText).filter(Boolean).join('\n\n').trim();
    if (!textContent) {
      const anyAssistant = list.data.find((m: any) => m.role === 'assistant');
      textContent = anyAssistant ? extractText(anyAssistant) : '⚠️ No reply.';
    }

    /* ──────────────────────────────────────────────
       SPECIAL: auto-capture vision / goals
    ─────────────────────────────────────────────── */

    let visionCaptured = false;
    let longTermGoalsCaptured = false;
    let shortTermGoalsCaptured = false;

    // STEP 1: VISION (onboarding_status === 0)
    if (projectOnboardingStatus === 0 && message?.trim()) {
      const trimmed = message.trim();

      // ⛔ Don't auto-complete vision on tiny / vague messages.
      const minLenForAutoVision = 40;
      const hasVisionKeywords = /\b(vision|goal|aim|plan|project|want to|would like to|my focus is|my aim is)\b/i.test(
        trimmed
      );

      if (trimmed.length < minLenForAutoVision || !hasVisionKeywords) {
        // Not clearly a full vision statement -> leave onboarding at step 1 (Vision)
      } else {
        try {
          const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content:
                  'You are a strict JSON parser. Given the user message, decide if it clearly states the VISION for their project. ' +
                  'Return JSON with two keys: "has_vision" (boolean) and "vision" (string). ' +
                  '"vision" should be a single clear sentence or short paragraph summarising what they want this project to achieve overall.',
              },
              {
                role: 'user',
                content: `User's latest message:\n"""${message}"""`,
              },
            ],
          });

          const raw = completion.choices?.[0]?.message?.content || '{}';
          let parsed: any = {};
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = {};
          }

          if (parsed.has_vision && typeof parsed.vision === 'string' && parsed.vision.trim().length > 0) {
            const normalized = normalizeVisionText(parsed.vision);
            if (normalized) {
              const isoNowVision = new Date().toISOString();
              const todayVision = isoNowVision.slice(0, 10);

              // user_projects
              try {
                await supabaseAdmin
                  .from('user_projects')
                  .update({ vision: normalized, onboarding_status: 1 })
                  .eq('id', projectId);
              } catch (e: any) {
                console.error('⚠️ vision user_projects update error:', e?.message ?? e);
              }

              // mainframe_info
              try {
                await supabaseAdmin
                  .from('mainframe_info')
                  .update({
                    vision: normalized,
                    updated_at: isoNowVision,
                    current_date: todayVision,
                  })
                  .eq('project_id', projectId);
              } catch (e: any) {
                console.error('⚠️ vision mainframe_info update error:', e?.message ?? e);
              }

              visionCaptured = true;
              textContent = "Nice — I’ve saved that as your project vision.";
            }
          }
        } catch (e: any) {
          console.error('⚠️ vision extraction failed:', e?.message ?? e);
        }
      }
    }

    // STEP 2: LONG-TERM GOALS (onboarding_status === 1)
    if (projectOnboardingStatus === 1 && message?.trim()) {
      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'You are a strict JSON parser. Given the user message, decide if it clearly states one or more LONG-TERM goals for their project ' +
                '(goals that describe what they want to achieve over months or years, not today or this week). ' +
                'Return JSON with two keys: "has_long_term_goals" (boolean) and "goals" (array of strings). ' +
                '"goals" should be short, clear sentences in the user\'s voice.',
            },
            {
              role: 'user',
              content: `User's latest message:\n"""${message}"""`,
            },
          ],
        });

        const raw = completion.choices?.[0]?.message?.content || '{}';
        let parsed: any = {};
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = {};
        }

        const goalsRaw = Array.isArray(parsed.goals) ? parsed.goals : [];
        const goals: string[] = goalsRaw
          .map((g: any) => String(g || '').trim())
          .filter((g: string) => g.length > 0);

        if (parsed.has_long_term_goals && goals.length > 0) {
          const isoNowLT = new Date().toISOString();

          try {
            await supabaseAdmin
              .from('long_term_goals')
              .insert(
                goals.map((g) => ({
                  project_id: projectId,
                  description: g,
                }))
              );
          } catch (e: any) {
            console.error('⚠️ long_term_goals insert error:', e?.message ?? e);
          }

          try {
            await supabaseAdmin
              .from('mainframe_info')
              .update({
                long_term_goals: goals,
                updated_at: isoNowLT,
              })
              .eq('project_id', projectId);
          } catch (e: any) {
            console.error('⚠️ mainframe_info long_term_goals update error:', e?.message ?? e);
          }

          try {
            await supabaseAdmin
              .from('user_projects')
              .update({
                long_term_goals: goals,
                onboarding_status: 2,
              })
              .eq('id', projectId);
          } catch (e: any) {
            console.error('⚠️ user_projects long_term_goals/update(2) error:', e?.message ?? e);
          }

          longTermGoalsCaptured = true;
          textContent = 'Great — I’ve saved those as your long-term goals.';
        }
      } catch (e: any) {
        console.error('⚠️ long-term goals extraction failed:', e?.message ?? e);
      }
    }

    // STEP 3: SHORT-TERM GOALS (onboarding_status === 2)
    if (projectOnboardingStatus === 2 && message?.trim()) {
      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'You are a strict JSON parser. Given the user message, decide if it clearly states one or more SHORT-TERM goals for their project ' +
                '(goals for today, this week, or the next few weeks). ' +
                'Return JSON with two keys: "has_short_term_goals" (boolean) and "goals" (array of strings). ' +
                '"goals" should be short, clear sentences in the user\'s voice.',
            },
            {
              role: 'user',
              content: `User's latest message:\n"""${message}"""`,
            },
          ],
        });

        const raw = completion.choices?.[0]?.message?.content || '{}';
        let parsed: any = {};
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = {};
        }

        const goalsRaw = Array.isArray(parsed.goals) ? parsed.goals : [];
        const goals: string[] = goalsRaw
          .map((g: any) => String(g || '').trim())
          .filter((g: string) => g.length > 0);

        if (parsed.has_short_term_goals && goals.length > 0) {
          const isoNowST = new Date().toISOString();

          try {
            await supabaseAdmin
              .from('short_term_goals')
              .insert(
                goals.map((g) => ({
                  project_id: projectId,
                  description: g,
                }))
              );
          } catch (e: any) {
            console.error('⚠️ short_term_goals insert error:', e?.message ?? e);
          }

          try {
            await supabaseAdmin
              .from('mainframe_info')
              .update({
                short_term_goals: goals,
                updated_at: isoNowST,
              })
              .eq('project_id', projectId);
          } catch (e: any) {
            console.error('⚠️ mainframe_info short_term_goals update error:', e?.message ?? e);
          }

          try {
            await supabaseAdmin
              .from('user_projects')
              .update({
                short_term_goals: goals,
                onboarding_status: 3,
              })
              .eq('id', projectId);
          } catch (e: any) {
            console.error('⚠️ user_projects short_term_goals/update(3) error:', e?.message ?? e);
          }

          shortTermGoalsCaptured = true;
          textContent = 'Awesome — I’ve saved those as your short-term goals.';
        }
      } catch (e: any) {
        console.error('⚠️ short-term goals extraction failed:', e?.message ?? e);
      }
    }

    // Effective onboarding display status for THIS reply
    let effectiveStatusNum: number = projectOnboardingStatus;
    let effectiveNextStep: OnboardingKey | null = onboardingActive
      ? stepFromStatus(projectOnboardingStatus)
      : null;

    if (projectOnboardingStatus === 0 && effectiveNextStep === 'vision') {
      if (visionCaptured) {
        effectiveStatusNum = Math.max(effectiveStatusNum, 1);
        effectiveNextStep = 'long_term_goals';
      } else {
        effectiveStatusNum = Math.max(effectiveStatusNum, 0);
        effectiveNextStep = 'vision';
      }
    }

    if (projectOnboardingStatus === 1 && effectiveNextStep === 'long_term_goals') {
      if (longTermGoalsCaptured) {
        effectiveStatusNum = Math.max(effectiveStatusNum, 2);
        effectiveNextStep = 'short_term_goals';
      } else {
        effectiveStatusNum = Math.max(effectiveStatusNum, 1);
        effectiveNextStep = 'long_term_goals';
      }
    }

    if (projectOnboardingStatus === 2 && effectiveNextStep === 'short_term_goals') {
      if (shortTermGoalsCaptured) {
        effectiveStatusNum = Math.max(effectiveStatusNum, 3);
        effectiveNextStep = 'telegram';
      } else {
        effectiveStatusNum = Math.max(effectiveStatusNum, 2);
        effectiveNextStep = 'short_term_goals';
      }
    }

    // Add generic onboarding hint if still active
    if (onboardingActive && effectiveNextStep) {
      textContent += `\n\n—\nWe’re still finishing setup (roughly step ${effectiveStatusNum + 1} of 4).\n` +
        `Next up is **${labelForStep(effectiveNextStep)}**.\n` +
        getCurrentStepPrompt(effectiveNextStep);
    }

    // Strip any old “can’t save your goals/vision” disclaimers
    textContent = stripLegacyGoalWarning(textContent);

    if (verbosity === 'short' && !/```|\\\[|\\\(|\$\$/.test(textContent)) {
      textContent = clampShort(textContent);
    }

    // ─── Idempotent assistant insert to avoid duplicates ───
    let appended: any = null;
    if (textContent && textContent !== '⚠️ No reply.') {
      try {
        const threeMinAgoISO = new Date(Date.now() - 3 * 60 * 1000).toISOString();
        const { data: recent } = await supabaseAdmin
          .from('zeta_conversation_log')
          .select('id, message, timestamp')
          .eq('project_id', projectId)
          .eq('thread_id', threadId)
          .eq('role', 'assistant')
          .gte('timestamp', threeMinAgoISO)
          .order('timestamp', { ascending: false })
          .limit(10);

        const dupe = (recent ?? []).find((r) => (r.message ?? '') === textContent);
        if (dupe) {
          appended = dupe;
        } else {
          const { data, error } = await supabaseAdmin
            .from('zeta_conversation_log')
            .insert({
              id: crypto.randomUUID(),
              user_id: ownerUserId,
              project_id: projectId,
              thread_id: threadId,
              role: 'assistant',
              message: textContent,
              timestamp: new Date().toISOString(),
              content_type: 'plain',
              metadata: {},
            })
            .select()
            .single();
          if (error) throw error;
          appended = data;
        }
      } catch (e) {
        console.error('❌ Failed to insert assistant row (continuing with fallback):', e);
        appended = {
          id: `temp-assistant-${Date.now()}`,
          user_id: ownerUserId,
          project_id: projectId,
          thread_id: threadId,
          role: 'assistant',
          message: textContent,
          timestamp: new Date().toISOString(),
          content_type: 'plain',
          metadata: { source: 'append-fallback' },
        };
      }
    }

    return NextResponse.json({
      reply: textContent,
      threadId,
      appended,
      onboarding: onboardingActive,
      step: effectiveNextStep || 'complete',
      onboarding_status: effectiveStatusNum,
    });
  } catch (err: any) {
    console.error('❌ /api/chat error:', err?.message ?? err);
    return NextResponse.json(
      { reply: '⚠️ Zeta had an internal error.', error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
