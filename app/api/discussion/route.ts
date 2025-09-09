// app/api/discussion/route.ts
import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { AVAILABLE_MODELS } from '@/lib/models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY! });
type AutonomyPolicy = 'off' | 'shadow' | 'ask' | 'auto';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      projectId,
      title,
      modelId = 'gpt-4o',
      initialAssistant, // optional now
      initialUser,      // optional now
      runOnCreate = true,
    } = body || {};

    if (!projectId || !title) {
      return NextResponse.json({ error: 'Missing required fields: projectId, title' }, { status: 400 });
    }

    const model = AVAILABLE_MODELS.find((m) => m.id === modelId);
    if (!model) console.warn('⚠️ /api/discussion: unknown modelId; continuing with project assistant.');

    // Project → assistant
    const { data: projRow, error: projErr } = await supabaseAdmin
      .from('user_projects')
      .select('assistant_id, autonomy_policy')
      .eq('id', projectId)
      .single();
    if (projErr) throw projErr;
    if (!projRow?.assistant_id) throw new Error('No assistant linked to project');

    const assistantId = projRow.assistant_id as string;
    const autonomyPolicy: AutonomyPolicy = (projRow?.autonomy_policy as AutonomyPolicy) ?? 'auto';

    // Create OpenAI thread
    const created = await openai.beta.threads.create();
    const threadId = created.id;
    const nowIso = new Date().toISOString();

    // DB: threads + discussions
    await supabaseAdmin.from('threads').insert({
      project_id: projectId,
      type: 'discussion',
      openai_thread_id: threadId,
      thread_id: threadId,
      created_at: nowIso,
      last_active: nowIso,
      expired: false,
    });

    const { data: discussion, error: discErr } = await supabaseAdmin
      .from('discussions')
      .insert({
        project_id: projectId,
        thread_id: threadId,
        title,
        last_updated: nowIso,
        file_ids: null,
      })
      .select()
      .single();
    if (discErr) throw discErr;

    // If no seeding fields, return create-only result
    if (!initialAssistant || !initialUser) {
      return NextResponse.json({ projectId, threadId, discussion, reply: null, seeded: false });
    }

    // ---- Seed exactly two visible messages (assistant → user) ----
    await supabaseAdmin.from('discussion_messages').insert([
      { project_id: projectId, thread_id: threadId, role: 'assistant', content: String(initialAssistant).trim(), created_at: nowIso },
      { project_id: projectId, thread_id: threadId, role: 'user',      content: String(initialUser).trim(),      created_at: new Date().toISOString() },
    ]);

    // Give OpenAI the prior "assistant" + user in one user message
    const composite = [
      '[CONTEXT] Treat the following as if the assistant previously said it:',
      String(initialAssistant).trim(),
      '',
      'User reply:',
      String(initialUser).trim(),
    ].join('\n');

    await openai.beta.threads.messages.create(threadId, { role: 'user', content: composite });

    // Optional first AI reply
    let replyText = '⚠️ No assistant reply.';
    if (runOnCreate) {
      let run = await openai.beta.threads.runs.create(threadId, { assistant_id: assistantId });
      for (let i = 0; i < 30; i++) {
        // @ts-ignore
        run = await openai.beta.threads.runs.retrieve(run.id, { thread_id: threadId });
        if (['completed', 'failed', 'cancelled', 'expired'].includes(run.status)) break;
        await new Promise((r) => setTimeout(r, 700));
      }

      const list = await openai.beta.threads.messages.list(threadId);
      const a = list.data.find((m: any) => m.role === 'assistant');
      if (a?.content?.length) {
        const chunks = a.content
          .filter((c: any) => c.type === 'text' && c.text?.value)
          .map((c: any) => c.text.value);
        if (chunks.length) replyText = chunks.join('\n\n');
      }

      // 3rd message (assistant reply)
      await supabaseAdmin.from('discussion_messages').insert({
        project_id: projectId,
        thread_id: threadId,
        role: 'assistant',
        content: replyText,
        created_at: new Date().toISOString(),
      });

      await Promise.all([
        supabaseAdmin.from('threads').update({ last_active: new Date().toISOString() }).eq('openai_thread_id', threadId),
        supabaseAdmin.from('discussions').update({ last_updated: new Date().toISOString() }).eq('thread_id', threadId),
      ]);
    }

    return NextResponse.json({ projectId, threadId, discussion, reply: replyText, seeded: true });
  } catch (err: any) {
    console.error('❌ /api/discussion error:', err?.message || err);
    return NextResponse.json({ error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}
