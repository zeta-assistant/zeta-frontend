import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_KEY!,
});

export async function POST(req: Request) {
  try {
    const { message, threadId } = await req.json();

    // 🧠 Get assistant_id
    const { data: threadData } = await supabaseAdmin
      .from('threads')
      .select('project_id')
      .eq('thread_id', threadId)
      .single();

    if (!threadData?.project_id) throw new Error('Thread not linked to project');

    const { data: projectData } = await supabaseAdmin
      .from('user_projects')
      .select('assistant_id')
      .eq('id', threadData.project_id)
      .single();

    const assistantId = projectData?.assistant_id;
    if (!assistantId) throw new Error('Missing assistant ID');

    // ✉️ Send message to thread
    await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: message,
    });

    // 💾 Save user message to discussion_messages
    await supabaseAdmin.from('discussion_messages').insert({
      thread_id: threadId,
      role: 'user',
      content: message,
    });

    // 🏃 Run assistant
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
    });

    // ⏳ Poll until done
    let runStatus;
    do {
      runStatus = await openai.beta.threads.runs.retrieve(run.id, {
        thread_id: threadId,
      });
      await new Promise((r) => setTimeout(r, 1000));
    } while (runStatus.status !== 'completed');

    // 📬 Fetch reply
    const messages = await openai.beta.threads.messages.list(threadId);
    const replyMsg = messages.data.find((msg) => msg.role === 'assistant');

    let textContent = '⚠️ No assistant reply.';
    if (
      replyMsg &&
      Array.isArray(replyMsg.content) &&
      replyMsg.content[0]?.type === 'text'
    ) {
      textContent = replyMsg.content[0].text.value;
    }

    // 💾 Save assistant reply to discussion_messages
    await supabaseAdmin.from('discussion_messages').insert({
      thread_id: threadId,
      role: 'assistant',
      content: textContent,
    });

    return NextResponse.json({ reply: textContent });
  } catch (err: any) {
    console.error('❌ discussion-reply error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}