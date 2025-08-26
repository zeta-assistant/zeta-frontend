// app/api/chat/route.ts
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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

/* ------------------------- Onboarding helpers ------------------------- */

const PROGRESSION: OnboardingKey[] = [
  'vision',            // 1
  'long_term_goals',   // 2
  'short_term_goals',  // 3
  'telegram',          // 4 (complete after)
];

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
  // statusNum is 0–4, steps are 4 total
  const idx = Math.min(Math.max(statusNum + 1, 1), 4); // friendly 1–4 view for “current/next”
  return `You're on onboarding step ${idx} of 4: **${labelForStep(step)}**.\n${getCurrentStepPrompt(step)}`;
}

/* --------------------------- Files intent ----------------------------- */
/** Users can ask for files with:
 *   /files
 *   /files <search terms>
 */
function parseFilesIntent(message: string | undefined): { wantsFiles: boolean; query: string } {
  if (!message) return { wantsFiles: false, query: '' };
  const m = message.match(/^\/files(?:\s+(.*))?$/i);
  if (m) return { wantsFiles: true, query: (m[1] || '').trim() };
  return { wantsFiles: false, query: '' };
}

/* ------------------------------ Route -------------------------------- */
export async function POST(req: Request) {
  try {
    const {
      message,
      projectId,
      modelId = 'gpt-4o',
    }: { message: string; projectId: string; modelId?: string } = await req.json();

    const now = new Date();

    const model = AVAILABLE_MODELS.find((m) => m.id === modelId);
    if (!model) {
      return NextResponse.json({ reply: '⚠️ Invalid model selected.' }, { status: 400 });
    }

    // Project + assistant
    const { data: projRow, error: projErr } = await supabaseAdmin
      .from('user_projects')
      .select('assistant_id, preferred_user_name')
      .eq('id', projectId)
      .single();
    if (projErr) throw projErr;
    if (!projRow?.assistant_id) throw new Error('Missing assistant ID');

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

      // optional: mirror on user_projects for convenience if you still use it in UI
      await supabaseAdmin.from('user_projects').update({ thread_id: threadId }).eq('id', projectId);
    } else {
      await supabaseAdmin
        .from('threads')
        .update({ last_active: now.toISOString() })
        .eq('thread_id', threadId!);
    }

    // Onboarding status (0–4) + decide if we should nudge onboarding
    const statusNum = await deriveOnboardingStatus(projectId); // 0..4
    const onboardingActive = await shouldUseOnboarding(projectId); // status < 4
    const nextStep = onboardingActive ? await getNextOnboardingStep(projectId) : null;

    // Direct “what step am I on?” answer
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

    // Shared context: mainframe + last 5 user_input_log
    const { mainframeInfo, recentUserInputs } = await getSharedContext(projectId);

    // Optional files intent
    const { wantsFiles, query } = parseFilesIntent(message);
    let filesContext: Array<{ file_name: string; file_url: string; created_at: string }> = [];
    if (wantsFiles) {
      const files = await fetchProjectFiles(projectId, {
        search: query,
        limit: 20,
      });
      filesContext = files.map(f => ({
        file_name: f.file_name,
        file_url: f.file_url,
        created_at: f.created_at,
      }));
    }

    // Build assistant context message
    const dateISO = now.toISOString();
    const userName = projRow?.preferred_user_name || 'there';
    const inputsFormatted =
      recentUserInputs.length === 0
        ? 'None'
        : recentUserInputs
            .map((u) => `- [${u.created_at}] ${u.author ?? 'user'}: ${u.content}`)
            .join('\n');

    const filesFormatted =
      filesContext.length === 0
        ? (wantsFiles ? 'No matching files.' : 'Not requested.')
        : filesContext
            .map((f) => `- ${f.file_name} — ${f.file_url} (${f.created_at})`)
            .join('\n');

    const context = `[CONTEXT]
Now: ${dateISO}
You are Zeta — the AI assistant for this project.
Preferred user name: ${userName}

[MAINFRAME]
${JSON.stringify(mainframeInfo ?? {}, null, 2)}

[RECENT_USER_INPUTS (last 5)]
${inputsFormatted}

[PROJECT_FILES] — included only when the user calls /files
${filesFormatted}
(If the user asks to search files, ask them to use "/files <keywords>" and then base your response on the provided list.)

— End of context.`;

    // Send context then the user message
    await openai.beta.threads.messages.create(threadId!, {
      role: 'user',
      content: context,
    });

    await openai.beta.threads.messages.create(threadId!, {
      role: 'user',
      content: message || ' ',
    });

    // Run assistant
    const run = await openai.beta.threads.runs.create(threadId!, {
      assistant_id: projRow.assistant_id,
    });

    let runStatus;
    do {
      // Some SDKs use (threadId, runId); keeping your previous pattern for compatibility
      // @ts-ignore SDK surface differences
      runStatus = await openai.beta.threads.runs.retrieve(run.id, { thread_id: threadId! });
      await new Promise((r) => setTimeout(r, 800));
    } while (runStatus.status !== 'completed');

    const list = await openai.beta.threads.messages.list(threadId!);
    const assistantReply = list.data.find((m) => m.role === 'assistant');

    function extractTextFromAssistantMessage(msg: unknown): string {
      const parts = (msg as any)?.content ?? [];
      const chunks: string[] = [];
      for (const p of parts) {
        if (p && p.type === 'text' && p.text && typeof p.text.value === 'string') {
          chunks.push(p.text.value);
        }
      }
      return chunks.join('\n\n').trim();
    }

    let textContent = extractTextFromAssistantMessage(assistantReply) || '⚠️ No reply.';

    // Append onboarding nudge if still incomplete
    if (onboardingActive && nextStep) {
      const nudge =
        `\n\n—\nWe still need to finish onboarding (status ${statusNum}/4).\n` +
        `Next step: **${labelForStep(nextStep)}**.\n${getCurrentStepPrompt(nextStep)}`;
      textContent += nudge;
    }

    return NextResponse.json({
      reply: textContent,
      threadId,
      onboarding: onboardingActive,
      step: nextStep || 'complete',
      onboarding_status: statusNum, // 0–4
    });
  } catch (err: any) {
    console.error('❌ /api/chat error:', err?.message ?? err);
    return NextResponse.json(
      { reply: '⚠️ Zeta had an internal error.', error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
