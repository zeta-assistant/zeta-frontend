import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { AVAILABLE_MODELS } from '@/lib/models';
import {
  getCurrentStepPrompt,
  shouldUseOnboarding,
  getNextOnboardingStep,
  deriveOnboardingStatus,
  getSharedContext,
  fetchProjectFiles,
  type OnboardingKey,
} from '@/lib/onboarding';

// Deterministic math helpers
import { sum, product, evaluate as evalExpr } from '@/lib/mathEngine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY! });

/* ------------------------- Onboarding helpers ------------------------- */
const PROGRESSION: OnboardingKey[] = ['vision', 'long_term_goals', 'short_term_goals', 'telegram'];

function labelForStep(k: OnboardingKey): string {
  switch (k) {
    case 'vision': return 'Project vision';
    case 'long_term_goals': return 'Long-term goals';
    case 'short_term_goals': return 'Short-term goals';
    case 'telegram': return 'Connect Telegram';
  }
}

function isOnboardingQuestion(input?: string): boolean {
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

function stepReply(step: OnboardingKey, statusNum: number): string {
  const idx = Math.min(Math.max(statusNum + 1, 1), 4);
  return `You're on onboarding step ${idx} of 4: **${labelForStep(step)}**.\n${getCurrentStepPrompt(step)}`;
}

/* --------------------------- Files intent ----------------------------- */
function parseFilesIntent(message: string | undefined): { wantsFiles: boolean; query: string } {
  if (!message) return { wantsFiles: false, query: '' };
  const m = message.match(/^\/files(?:\s+(.*))?$/i);
  if (m) return { wantsFiles: true, query: (m[1] || '').trim() };
  return { wantsFiles: false, query: '' };
}

/* ---------------------- Tool-call handler (Edge Fn) ------------------- */
async function handleRequiredActions(
  threadId: string,
  runId: string,
  run: any,
  projectId: string,
  autonomyPolicy: 'off' | 'shadow' | 'ask' | 'auto'
) {
  const tcalls = run?.required_action?.submit_tool_outputs?.tool_calls ?? [];
  if (!tcalls.length) return;

  const tool_outputs: Array<{ tool_call_id: string; output: string }> = [];

  try {
    console.log('🛠 required tool calls:', tcalls.map((t: any) => t?.function?.name || t?.type));
  } catch {}

  for (const tc of tcalls) {
    if (tc.type !== 'function') continue;

    const name = tc.function?.name;
    try {
      const args = JSON.parse(tc.function?.arguments || '{}');

      if (name === 'compute_math') {
        const mode = String(args.mode || '').toLowerCase();
        let out: any = {};
        if (mode === 'sum') {
          const s = sum(args.numbers || []);
          out = { result: Number(s.toString()) };
        } else if (mode === 'product') {
          const p = product(args.numbers || []);
          out = { result: Number(p.toString()) };
        } else if (mode === 'expression') {
          out = { result: evalExpr(String(args.expression || '0')) };
        } else {
          out = { error: `Unsupported mode: ${mode}` };
        }
        tool_outputs.push({ tool_call_id: tc.id, output: JSON.stringify(out) });

      } else if (name === 'propose_autonomy') {
        // Send the model's plan to the Edge Function to apply/log changes
        const baseUrl =
          process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
        const srk = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!baseUrl || !srk) {
          tool_outputs.push({
            tool_call_id: tc.id,
            output: JSON.stringify({ ok: false, error: 'Missing Supabase URL or Service Role Key in env.' }),
          });
        } else {
          const res = await fetch(`${baseUrl}/functions/v1/apply-autonomy`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: srk,
              Authorization: `Bearer ${srk}`,
            },
            body: JSON.stringify({
              projectId,
              policy: autonomyPolicy,
              plan: args, // raw model proposal (can include delete flags, etc.)
            }),
          });

          let out: any;
          try { out = await res.json(); } catch { out = { ok: res.ok }; }

          tool_outputs.push({
            tool_call_id: tc.id,
            output: JSON.stringify(out),
          });
        }

      } else {
        tool_outputs.push({
          tool_call_id: tc.id,
          output: JSON.stringify({ error: `Unhandled tool: ${name}` }),
        });
      }
    } catch (e: any) {
      tool_outputs.push({
        tool_call_id: tc.id,
        output: JSON.stringify({ error: e?.message || String(e) }),
      });
    }
  }

  await openai.beta.threads.runs.submitToolOutputs(runId, {
    thread_id: threadId,
    tool_outputs,
  });
}

/* ------------------------- Helper: clamp short ------------------------ */
function clampShort(text: string): string {
  // Keep code/math intact; basic sentence clamp otherwise.
  const parts = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const firstTwo = parts.slice(0, 2).join(' ');
  const words = firstTwo.split(/\s+/);
  return words.length <= 60 ? firstTwo : words.slice(0, 60).join(' ') + '…';
}

/* ------------------------------ Route -------------------------------- */
export async function POST(req: Request) {
  try {
    const {
      message,
      projectId,
      modelId = 'gpt-4o',
      verbosity = 'normal', // ✨ accept verbosity
    }: {
      message: string;
      projectId: string;
      modelId?: string;
      verbosity?: 'short' | 'normal' | 'long';
    } = await req.json();

    const now = new Date();

    const model = AVAILABLE_MODELS.find((m) => m.id === modelId);
    if (!model) {
      return NextResponse.json({ reply: '⚠️ Invalid model selected.' }, { status: 400 });
    }

    // Project + assistant + autonomy policy
    const { data: projRow, error: projErr } = await supabaseAdmin
      .from('user_projects')
      .select('assistant_id, preferred_user_name, autonomy_policy')
      .eq('id', projectId)
      .single();
    if (projErr) throw projErr;
    if (!projRow?.assistant_id) throw new Error('Missing assistant ID');

    const autonomyPolicy =
      (projRow?.autonomy_policy as 'off' | 'shadow' | 'ask' | 'auto') ?? 'auto';

    // Thread management (1h expiry)
    const { data: existingThread } = await supabaseAdmin
      .from('threads')
      .select('*')
      .eq('project_id', projectId)
      .order('last_active', { ascending: false })
      .limit(1)
      .maybeSingle();

    const expired =
      existingThread?.expired ||
      (existingThread?.last_active &&
        now.getTime() - new Date(existingThread.last_active).getTime() > 1000 * 60 * 60);

    let threadId = existingThread?.thread_id as string | undefined;

    if (!existingThread || !existingThread.thread_id || expired) {
      const newThread = await openai.beta.threads.create();
      threadId = newThread.id;

      await supabaseAdmin.from('threads').insert({
        project_id: projectId,
        thread_id: threadId,
        created_at: now.toISOString(),
        last_active: now.toISOString(),
        expired: false,
      });

      await supabaseAdmin.from('user_projects').update({ thread_id: threadId }).eq('id', projectId);
    } else {
      await supabaseAdmin
        .from('threads')
        .update({ last_active: now.toISOString() })
        .eq('thread_id', threadId!);
    }

    // Onboarding status
    const statusNum = await deriveOnboardingStatus(projectId);
    const onboardingActive = await shouldUseOnboarding(projectId);
    const nextStep = onboardingActive ? await getNextOnboardingStep(projectId) : null;

    // Direct onboarding Q&A
    if (isOnboardingQuestion(message)) {
      if (nextStep) {
        return NextResponse.json({
          status: 'onboarding',
          onboarding: true,
          step: nextStep,
          onboarding_status: statusNum,
          reply: stepReply(nextStep, statusNum),
          threadId,
        });
      } else {
        return NextResponse.json({
          status: 'onboarding',
          onboarding: false,
          step: 'complete',
          onboarding_status: statusNum,
          reply: `Onboarding is complete (4/4). ✅`,
          threadId,
        });
      }
    }

    // Shared context
    const { mainframeInfo, recentUserInputs } = await getSharedContext(projectId);

    // Files intent
    const { wantsFiles, query } = parseFilesIntent(message);
    let filesContext: Array<{ file_name: string; file_url: string; created_at: string }> = [];
    if (wantsFiles) {
      const files = await fetchProjectFiles(projectId, { search: query, limit: 20 });
      filesContext = files.map(f => ({ file_name: f.file_name, file_url: f.file_url, created_at: f.created_at }));
    }

    const dateISO = now.toISOString();
    const userName = projRow?.preferred_user_name || 'there';
    const inputsFormatted =
      recentUserInputs.length === 0
        ? 'None'
        : recentUserInputs.map((u) => `- [${u.created_at}] ${u.author ?? 'user'}: ${u.content}`).join('\n');

    const filesFormatted =
      filesContext.length === 0
        ? (wantsFiles ? 'No matching files.' : 'Not requested.')
        : filesContext.map((f) => `- ${f.file_name} — ${f.file_url} (${f.created_at})`).join('\n');

    // ✨ Verbosity instruction injected into context
    const verbosityInstruction =
      verbosity === 'short'
        ? 'For THIS reply, keep it to 1–2 sentences (<= ~60 words).'
        : verbosity === 'long'
        ? 'For THIS reply, be thorough: at least 5 sentences with helpful detail.'
        : 'No special length requirement for this reply.';

    const context = `[CONTEXT]
Now: ${dateISO}
You are Zeta — the AI assistant for this project.
Preferred user name: ${userName}

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
Avoid duplicates (prefer updates). Use ISO 8601 and Australia/Brisbane timezone. Keep it concise.
You may also remove goals by including { "delete": true } and an "id" (preferred) or an exact "description".

— End of context.`;

    // Send context then user message
    await openai.beta.threads.messages.create(threadId!, { role: 'user', content: context });
    await openai.beta.threads.messages.create(threadId!, { role: 'user', content: message || ' ' });

    // Run assistant (with tool-call loop)
    let run = await openai.beta.threads.runs.create(threadId!, { assistant_id: projRow.assistant_id });

    while (true) {
      // @ts-ignore SDK surface differences
      run = await openai.beta.threads.runs.retrieve(run.id, { thread_id: threadId! });

      if (run.status === 'requires_action') {
        await handleRequiredActions(threadId!, run.id, run, projectId, autonomyPolicy);
        await new Promise((r) => setTimeout(r, 400));
        continue;
      }

      if (['completed', 'failed', 'cancelled', 'expired'].includes(run.status)) break;

      await new Promise((r) => setTimeout(r, 800));
    }

    const list = await openai.beta.threads.messages.list(threadId!);
    const assistantMsg = list.data.find((m) => m.role === 'assistant');

    const extractText = (msg: any): string => {
      const parts = msg?.content ?? [];
      const chunks: string[] = [];
      for (const p of parts) if (p?.type === 'text' && p.text?.value) chunks.push(p.text.value);
      return chunks.join('\n\n').trim();
    };

    let textContent = extractText(assistantMsg) || '⚠️ No reply.';

    // Onboarding nudge
    if (onboardingActive && nextStep) {
      textContent +=
        `\n\n—\nWe still need to finish onboarding (status ${statusNum}/4).\n` +
        `Next step: **${labelForStep(nextStep)}**.\n${getCurrentStepPrompt(nextStep)}`;
    }

    // ✨ Enforce short verbosity lightly (avoid chopping code/math)
    if (verbosity === 'short') {
      if (!/```|\\\[|\\\(|\$\$/.test(textContent)) {
        textContent = clampShort(textContent);
      }
    }

    return NextResponse.json({
      reply: textContent,
      threadId,
      onboarding: onboardingActive,
      step: nextStep || 'complete',
      onboarding_status: statusNum,
    });
  } catch (err: any) {
    console.error('❌ /api/chat error:', err?.message ?? err);
    return NextResponse.json(
      { reply: '⚠️ Zeta had an internal error.', error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
