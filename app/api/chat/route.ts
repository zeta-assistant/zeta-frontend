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
    case 'vision': return 'Project vision';
    case 'long_term_goals': return 'Long-term goals';
    case 'short_term_goals': return 'Short-term goals';
    case 'telegram': return 'Connect Telegram';
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
function parseFilesIntent(message?: string) {
  if (!message) return { wantsFiles: false, query: '' };
  const m = message.match(/^\/files(?:\s+(.*))?$/i);
  return m ? { wantsFiles: true, query: (m[1] || '').trim() } : { wantsFiles: false, query: '' };
}
async function fetchProjectFiles(projectId: string, opts?: { search?: string; limit?: number }): Promise<ProjectFileRow[]> {
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
async function readBody(req: Request): Promise<{ message: string; projectId: string; modelId?: string; verbosity?: 'short'|'normal'|'long' }> {
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
      (uil ?? []).map(r => ({ content: r.content, timestamp: r.timestamp, author: r.author ?? 'user' })) as RecentUserInput[];
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
          try { out = await res.json(); } catch { out = { ok: res.ok }; }
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

/* ───────────────── route ───────────────── */
export async function POST(req: Request) {
  try {
    const body = await readBody(req);
    const { message, projectId, modelId = 'gpt-4o', verbosity = 'normal' } = body;

    const now = new Date();
    const nowISO = now.toISOString();

    const model = AVAILABLE_MODELS.find(m => m.id === modelId);
    if (!model) {
      return NextResponse.json({ reply: '⚠️ Invalid model selected.' }, { status: 400 });
    }

    // get project & owner
    const { data: projRow, error: projErr } = await supabaseAdmin
      .from('user_projects')
      .select('assistant_id, preferred_user_name, autonomy_policy, user_id, name')
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

    /* ──────────────────────────────────────────────
       Ensure we ALWAYS have an assistant_id
       If missing, create a minimal fallback assistant,
       save it to user_projects, and keep going.
    ─────────────────────────────────────────────── */
    let assistantId = projRow.assistant_id as string | null;

    if (!assistantId) {
      console.warn('⚠️ /api/chat: no assistant_id for project, creating fallback assistant…');

      const fallback = await openai.beta.assistants.create({
        name: projRow.name ? `${projRow.name} (fallback)` : 'Zeta Fallback',
        model: modelId === 'gpt-4o' ? 'gpt-4o' : 'gpt-4',
        instructions:
          'You are Zeta, an AI assistant for this project. Respond clearly, helpfully, and concisely. If something seems misconfigured, gently mention it.',
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

    // thread
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
        created_at: nowISO,
        last_active: nowISO,
        expired: false,
      });
      await supabaseAdmin.from('user_projects').update({ thread_id: threadId }).eq('id', projectId);
    } else {
      await supabaseAdmin.from('threads').update({ last_active: nowISO }).eq('thread_id', threadId!);
    }

    // onboarding state (prefer mainframe flag)
    const { data: mf } = await supabaseAdmin
      .from('mainframe_info')
      .select('onboarding_complete')
      .eq('project_id', projectId)
      .maybeSingle();

    const mfComplete = mf?.onboarding_complete === true;
    const statusNum = await deriveOnboardingStatus(projectId);
    const onboardingActive = mfComplete ? false : await shouldUseOnboarding(projectId);
    const nextStep = onboardingActive ? await getNextOnboardingStep(projectId) : null;

    if (isOnboardingQuestion(message)) {
      if (nextStep) {
        return NextResponse.json({
          status: 'onboarding',
          onboarding: true,
          step: nextStep,
          onboarding_status: statusNum,
          reply: `You're on onboarding step ${Math.min(Math.max(statusNum + 1, 1), 4)} of 4: **${labelForStep(
            nextStep
          )}**.\n${getCurrentStepPrompt(nextStep)}`,
          threadId,
        });
      }
      return NextResponse.json({
        status: 'onboarding',
        onboarding: false,
        step: 'complete',
        onboarding_status: statusNum,
        reply: 'Onboarding is complete (4/4). ✅',
        threadId,
      });
    }

    // log user input (best-effort)
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

    const { mainframeInfo, recentUserInputs } = await safeGetSharedContext(projectId);

    const { wantsFiles, query } = parseFilesIntent(message);
    let filesContext: ProjectFileRow[] = [];
    if (wantsFiles) {
      const files = await fetchProjectFiles(projectId, { search: query, limit: 20 });
      filesContext = files.map(f => ({ file_name: f.file_name, file_url: f.file_url, created_at: f.created_at }));
    }

    const inputsFormatted =
      !recentUserInputs || (recentUserInputs as RecentUserInput[]).length === 0
        ? 'None'
        : (recentUserInputs as RecentUserInput[])
            .map(u => `- [${u.created_at ?? u.timestamp ?? ''}] ${u.author ?? 'user'}: ${u.content ?? ''}`)
            .join('\n');

    const filesFormatted =
      filesContext.length === 0
        ? wantsFiles
          ? 'No matching files.'
          : 'Not requested.'
        : filesContext.map(f => `- ${f.file_name} — ${f.file_url} (${f.created_at})`).join('\n');

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

    if (onboardingActive && nextStep) {
      textContent += `\n\n—\nWe still need to finish onboarding (status ${statusNum}/4).\nNext step: **${labelForStep(
        nextStep
      )}**.\n${getCurrentStepPrompt(nextStep)}`;
    }
    if (verbosity === 'short' && !/```|\\\[|\\\(|\$\$/.test(textContent)) textContent = clampShort(textContent);

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

        const dupe = (recent ?? []).find(r => (r.message ?? '') === textContent);
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
