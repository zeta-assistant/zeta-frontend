import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { AVAILABLE_MODELS } from '@/lib/models';

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

    let threadId: string;
    let messageContent = '';

    if (model.provider === 'openai') {
      // 1️⃣ Create thread
      const newThread = await openai.beta.threads.create();
      threadId = newThread.id;

      // 2️⃣ Add user message
      await openai.beta.threads.messages.create(threadId, {
        role: 'user',
        content: `New discussion started: "${title}"`,
      });

      // 3️⃣ Run assistant
      const { data: projectData } = await supabaseAdmin
      
        .from('user_projects')
        .select('assistant_id')
        .eq('id', projectId)
        .single();

        console.log('📡 Fetched projectData:', projectData);
      if (!projectData?.assistant_id) throw new Error('No assistant linked to project');

      const run = await openai.beta.threads.runs.create(threadId, {
        assistant_id: projectData.assistant_id,
      });

      // 4️⃣ Wait for run to complete
      let runStatus;
      do {
        runStatus = await openai.beta.threads.runs.retrieve(run.id, {
          thread_id: threadId,
        });
        await new Promise((r) => setTimeout(r, 1000));
      } while (runStatus.status !== 'completed');
      console.log('🏃 Assistant run started:', run.id);

      // 5️⃣ Get reply
      const messages = await openai.beta.threads.messages.list(threadId);
      const lastMessage = messages.data.find((msg) => msg.role === 'assistant');

      if (
        lastMessage &&
        Array.isArray(lastMessage.content) &&
        lastMessage.content[0]?.type === 'text'
      ) {
        messageContent = lastMessage.content[0].text.value;
      }
    } else {
      // Local/huggingface fallback
      threadId = `thread_${crypto.randomUUID()}`;
      messageContent = '🧪 Local models not yet supported for Discussions.';
    }
    if (messageContent) {
  await supabaseAdmin.from('discussion_messages').insert({
    thread_id: threadId,
    role: 'assistant',
    content: messageContent,
  });
}

   // 6️⃣ Insert into threads (with error logging)
   console.log('⏳ About to insert thread...');
const { error: threadInsertError } = await supabaseAdmin.from('threads').insert({
  project_id: projectId,
  thread_id: threadId,
  model_id: modelId,
  created_at: now.toISOString(),
  last_active: now.toISOString(),
  expired: false,
});

if (threadInsertError) {
  console.error('❌ THREAD INSERT FAILED:', threadInsertError.message);
  console.error('🧠 With values:', {
    project_id: projectId,
    thread_id: threadId,
    model_id: modelId,
  });
  throw new Error('Failed to insert thread into DB');
}

console.log('✅ Thread inserted successfully:', threadId);

    // 7️⃣ Insert discussion
    const { data: discussion, error: discussionError } = await supabaseAdmin
      .from('discussions')
      .insert({
        project_id: projectId,
        thread_id: threadId,
        title,
        file_ids: fileId ? [fileId] : null,
      })
      .select()
      .single();

    if (discussionError) throw new Error(discussionError.message);

    return NextResponse.json({
      threadId,
      discussion,
      messageContent,
    });
  } catch (err: any) {
    console.error('❌ /api/discussion error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
