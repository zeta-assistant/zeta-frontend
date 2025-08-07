import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { AVAILABLE_MODELS } from '@/lib/models';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_KEY,
});

export async function POST(req: Request) {
  try {
    const { message, projectId, modelId = 'gpt-4o' } = await req.json();
    const now = new Date();

    const model = AVAILABLE_MODELS.find((m) => m.id === modelId);
    if (!model) {
      console.error(`❌ Invalid modelId received: ${modelId}`);
      return NextResponse.json({ reply: '⚠️ Invalid model selected.' }, { status: 400 });
    }

    // 🧠 Fixed identity
    const zetaName = 'Zeta';
    const date = new Date().toISOString().split('T')[0];
    const time = new Date().toISOString();

    // ✅ Get assistant_id
    const { data: projectData } = await supabaseAdmin
      .from('user_projects')
      .select('assistant_id')
      .eq('id', projectId)
      .single();

    const assistantId = projectData?.assistant_id;
    if (!assistantId) throw new Error('Missing assistant ID');

    const { data: threadData } = await supabaseAdmin
  .from('threads')
  .select('*')
  .eq('project_id', projectId)
  .order('last_active', { ascending: false })
  .limit(1)
  .single();

let threadId = threadData?.thread_id;

// Check if thread expired (e.g., 1hr inactivity or marked expired)
const expired =
  threadData?.expired ||
  (threadData?.last_active &&
    new Date().getTime() - new Date(threadData.last_active).getTime() > 1000 * 60 * 60);

if (!threadId || expired) {
  // Create new thread
  const newThread = await openai.beta.threads.create();
  threadId = newThread.id;

  await supabaseAdmin.from('threads').insert({
    project_id: projectId,
    thread_id: threadId,
    created_at: now.toISOString(),
    last_active: now.toISOString(),
    expired: false,
  });

  await supabaseAdmin
    .from('user_projects')
    .update({ thread_id: threadId })
    .eq('id', projectId);
} else {
  // Update last_active timestamp
  await supabaseAdmin
    .from('threads')
    .update({ last_active: now.toISOString() })
    .eq('thread_id', threadId);
}

    // ✅ Inject awareness context
    const context = `Today is ${date}, and the time is ${time}. You are ${zetaName} — the AI assistant for this project. Do not refer to yourself as ChatGPT or Assistant.`;
    await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: `[CONTEXT]\n${context}`,
    });

    // ✅ Add user message
    await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: message,
    });

    // ✅ Run assistant
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
    });

    // ⏳ Poll until complete
    let runStatus;
    do {
      runStatus = await openai.beta.threads.runs.retrieve(run.id, {
        thread_id: threadId,
      });
      await new Promise((res) => setTimeout(res, 1000));
    } while (runStatus.status !== 'completed');

    // ✅ Get reply
    const messages = await openai.beta.threads.messages.list(threadId);
    const assistantReply = messages.data.find((msg) => msg.role === 'assistant');

    let textContent = '⚠️ No reply.';
    if (
      assistantReply &&
      Array.isArray(assistantReply.content) &&
      assistantReply.content[0]?.type === 'text'
    ) {
      textContent = assistantReply.content[0].text.value;
    }

    // ✅ Get session (for user_id)
    const {
      data: { session },
    } = await supabaseAdmin.auth.getSession();

    // ✅ Call update-mainframe with fixed name
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/update-mainframe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        user_id: session?.user?.id ?? null,
        project_id: projectId,
        zeta_name: zetaName,
      }),
    });

    return NextResponse.json({ reply: textContent, threadId });
  } catch (err) {
    console.error('❌ Zeta GPT error:', err);
    return NextResponse.json({ reply: '⚠️ Zeta had a GPT issue.' }, { status: 500 });
  }
}