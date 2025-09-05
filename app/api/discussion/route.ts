import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { AVAILABLE_MODELS } from '@/lib/models';
import { getSharedContext } from '@/lib/onboarding';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY! });

/** Create a new OpenAI thread + rows in `threads` and `discussions`, seed optional messages, and return threadId. */
export async function POST(req: Request) {
  try {
    const {
      projectId,
      title,
      modelId = 'gpt-4o',
      seed,              // optional: string (e.g. from notification)
      kickoff = true,    // optional: whether to ask Zeta to greet & kick off
    }: {
      projectId: string;
      title: string;
      modelId?: string;
      seed?: string;
      kickoff?: boolean;
    } = await req.json();

    if (!projectId || !title) {
      return NextResponse.json({ error: 'Missing required fields: projectId, title' }, { status: 400 });
    }

    const model = AVAILABLE_MODELS.find((m) => m.id === modelId);
    if (!model) {
      // Non-fatal; we still run with the assistant attached to the project
      console.warn('⚠️ /api/discussion: Unrecognized modelId; continuing with project assistant.');
    }

    // Project → assistant
    const { data: projRow, error: projErr } = await supabaseAdmin
      .from('user_projects')
      .select('assistant_id, preferred_user_name')
      .eq('id', projectId)
      .single();
    if (projErr) throw projErr;
    if (!projRow?.assistant_id) throw new Error('No assistant linked to project');

    const assistantId = projRow.assistant_id as string;
    const nowIso = new Date().toISOString();

    // 1) OpenAI thread
    const thread = await openai.beta.threads.create();
    const openaiThreadId = thread.id;

    // 2) DB: threads row (store as openai_thread_id; also mirror to thread_id for compatibility)
    await supabaseAdmin.from('threads').insert({
      project_id: projectId,
      type: 'discussion',
      openai_thread_id: openaiThreadId,
      thread_id: openaiThreadId,
      last_active: nowIso,
      created_at: nowIso,
      expired: false,
    });

    // 3) DB: discussions row
    const { data: discussion, error: discErr } = await supabaseAdmin
      .from('discussions')
      .insert({
        project_id: projectId,
        thread_id: openaiThreadId,
        title,
        last_updated: nowIso,
        file_ids: null,
      })
      .select()
      .single();
    if (discErr) throw discErr;

    // 4) Build shared context; send + persist initial user-side messages
    const { mainframeInfo, recentUserInputs } = await getSharedContext(projectId);
    const userName = projRow?.preferred_user_name || 'there';

    const inputsFormatted =
      (recentUserInputs ?? []).length === 0
        ? 'None'
        : recentUserInputs
            .map((u: { timestamp: string; author?: string | null; content: string; created_at?: string }) => {
              const ts = u.timestamp ?? u.created_at ?? '';
              const who = u.author ?? 'user';
              return `- [${ts}] ${who}: ${u.content}`;
            })
            .join('\n');

    const context = `[CONTEXT]
Now: ${nowIso}
You are Zeta — the AI assistant for this project.
Preferred user name: ${userName}

[MAINFRAME]
${JSON.stringify(mainframeInfo ?? {}, null, 2)}

[RECENT_USER_INPUTS (last 5)]
${inputsFormatted}
— End of context.`;

    // Send to OpenAI thread + persist to discussion_messages
    await openai.beta.threads.messages.create(openaiThreadId, { role: 'user', content: context });
    const firstLine = seed ? 'Discussion created from notification.' : 'Discussion created.';
    await openai.beta.threads.messages.create(openaiThreadId, { role: 'user', content: firstLine });

    await supabaseAdmin.from('discussion_messages').insert([
      { project_id: projectId, thread_id: openaiThreadId, role: 'user', content: context, created_at: nowIso },
      { project_id: projectId, thread_id: openaiThreadId, role: 'user', content: firstLine, created_at: nowIso },
    ]);

    if (seed && seed.trim().length > 0) {
      await openai.beta.threads.messages.create(openaiThreadId, { role: 'user', content: seed });
      await supabaseAdmin.from('discussion_messages').insert({
        project_id: projectId, thread_id: openaiThreadId, role: 'user', content: seed, created_at: new Date().toISOString(),
      });
    }

    const kickoffPrompt = kickoff
      ? 'Please greet me naturally and ask what I would like to talk about to kick off this discussion.'
      : 'Acknowledge the new discussion.';

    await openai.beta.threads.messages.create(openaiThreadId, { role: 'user', content: kickoffPrompt });
    await supabaseAdmin.from('discussion_messages').insert({
      project_id: projectId, thread_id: openaiThreadId, role: 'user', content: kickoffPrompt, created_at: new Date().toISOString(),
    });

    // Let assistant respond once so the chat opens with something
    const run = await openai.beta.threads.runs.create(openaiThreadId, { assistant_id: assistantId });
    // (We won’t block on long tool loops here; lightweight single pass)
    let status = await openai.beta.threads.runs.retrieve(run.id, { thread_id: openaiThreadId });
    for (let i = 0; i < 20 && !['completed', 'failed', 'cancelled', 'expired'].includes(status.status); i++) {
      await new Promise((r) => setTimeout(r, 600));
      status = await openai.beta.threads.runs.retrieve(run.id, { thread_id: openaiThreadId });
    }

    const list = await openai.beta.threads.messages.list(openaiThreadId);
    const assistantMsg = list.data.find((m) => m.role === 'assistant');
    let assistantText = '⚠️ No assistant reply.';
    if (assistantMsg?.content?.length) {
      const chunks: string[] = [];
      for (const c of assistantMsg.content) if (c.type === 'text' && c.text?.value) chunks.push(c.text.value);
      if (chunks.length) assistantText = chunks.join('\n\n');
      await supabaseAdmin.from('discussion_messages').insert({
        project_id: projectId, thread_id: openaiThreadId, role: 'assistant', content: assistantText, created_at: new Date().toISOString(),
      });
    }

    // Touch timestamps
    const touchIso = new Date().toISOString();
    await Promise.all([
      supabaseAdmin.from('threads').update({ last_active: touchIso }).eq('openai_thread_id', openaiThreadId),
      supabaseAdmin.from('discussions').update({ last_updated: touchIso }).eq('thread_id', openaiThreadId),
    ]);

    return NextResponse.json({ projectId, threadId: openaiThreadId, discussion, messageContent: assistantText });
  } catch (err: any) {
    console.error('❌ /api/discussion error:', err?.message || err);
    return NextResponse.json({ error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}
