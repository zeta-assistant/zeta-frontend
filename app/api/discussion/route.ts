import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { AVAILABLE_MODELS } from '@/lib/models';
import { randomUUID } from 'crypto';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_KEY!,
});

export async function POST(req: Request) {
  try {
    const {
      title,
      projectId,
      modelId = 'gpt-4o',
      fileId = null,
    } = await req.json();

    const now = new Date();
    const model = AVAILABLE_MODELS.find((m) => m.id === modelId);
    if (!model) throw new Error('Invalid modelId');

    // ✅ 1. Create OpenAI thread
    const openaiThread = await openai.beta.threads.create();
    const openaiThreadId = openaiThread.id;

    // ✅ 2. Add user message
    await openai.beta.threads.messages.create(openaiThreadId, {
      role: 'user',
      content: `New discussion started: "${title}"`,
    });

    // ✅ 3. Get assistant
    const { data: projectData } = await supabaseAdmin
      .from('user_projects')
      .select('assistant_id')
      .eq('id', projectId)
      .single();

    if (!projectData?.assistant_id) throw new Error('No assistant linked to project');

    // ✅ 4. Run assistant
    const run = await openai.beta.threads.runs.create(openaiThreadId, {
      assistant_id: projectData.assistant_id,
    });

    let runStatus;
    do {
      runStatus = await openai.beta.threads.runs.retrieve(run.id, {
        thread_id: openaiThreadId,
      });
      await new Promise((r) => setTimeout(r, 1000));
    } while (runStatus.status !== 'completed');

    // ✅ 5. Get assistant reply
    const messages = await openai.beta.threads.messages.list(openaiThreadId);
    const lastMessage = messages.data.find((msg) => msg.role === 'assistant');

    let messageContent = '⚠️ No assistant reply.';
    if (
      lastMessage &&
      Array.isArray(lastMessage.content) &&
      lastMessage.content[0]?.type === 'text'
    ) {
      messageContent = lastMessage.content[0].text.value;
    }

    // ✅ 6. Insert into Supabase `threads`
    const threadUUID = randomUUID();
    const { error: threadInsertError } = await supabaseAdmin.from('threads').insert({
      id: threadUUID,
      project_id: projectId,
      type: 'discussion',
      last_active: now.toISOString(),
      openai_thread_id: openaiThreadId,
    });

    if (threadInsertError) {
      console.error('❌ THREAD INSERT FAILED:', threadInsertError.message);
      throw new Error('Failed to insert thread');
    }

    // ✅ 7. Save assistant message
    await supabaseAdmin.from('discussion_messages').insert({
      thread_id: openaiThreadId,
      role: 'assistant',
      content: messageContent,
    });

    // ✅ 8. Insert into `discussions`
    const { data: discussion, error: discussionError } = await supabaseAdmin
      .from('discussions')
      .insert({
        project_id: projectId,
        thread_id: openaiThreadId,
        title,
        file_ids: fileId ? [fileId] : null,
      })
      .select()
      .single();

    if (discussionError) throw new Error(discussionError.message);

    // ✅ 9. Return OpenAI threadId for frontend usage
    return NextResponse.json({
      threadId: openaiThreadId,
      discussion,
      messageContent,
    });
  } catch (err: any) {
    console.error('❌ /api/discussion error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}