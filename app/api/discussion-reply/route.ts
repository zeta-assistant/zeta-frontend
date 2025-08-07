import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_KEY!,
});

export async function POST(req: Request) {
  try {
    const { message, threadId } = await req.json(); // threadId = OpenAI string

    // 🔁 Look up project and confirm thread exists
    const { data: threadData, error: threadError } = await supabaseAdmin
      .from('threads')
      .select('project_id')
      .eq('openai_thread_id', threadId)
      .single();

    if (threadError || !threadData?.project_id) {
      throw new Error('Thread lookup failed');
    }

    // 🧠 Get assistant_id from user_projects
    const { data: projectData, error: projectError } = await supabaseAdmin
      .from('user_projects')
      .select('assistant_id')
      .eq('id', threadData.project_id)
      .single();

    const assistantId = projectData?.assistant_id;
    if (projectError || !assistantId) {
      throw new Error('Missing assistant ID');
    }

    // ✉️ Send user message to OpenAI
    await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: message,
    });

    // 💾 Save user message to Supabase
    await supabaseAdmin.from('discussion_messages').insert({
      thread_id: threadId, // ✅ OpenAI thread ID as TEXT
      role: 'user',
      content: message,
    });

    // 🏃 Start assistant run
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
    });

    // ⏳ Poll until complete
    let runStatus;
    do {
      runStatus = await openai.beta.threads.runs.retrieve(run.id, {
        thread_id: threadId,
      });
      await new Promise((r) => setTimeout(r, 1000));
    } while (runStatus.status !== 'completed');

    // 📬 Get assistant reply
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

    // 💾 Save assistant reply to Supabase
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
