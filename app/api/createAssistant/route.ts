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
      message = 'Hello Zeta, let’s begin.',
      projectId,
      modelId,
      projectName,
      assistantType,
      systemInstructions,
    } = await req.json();

    const now = new Date();

    const model = AVAILABLE_MODELS.find((m) => m.id === modelId);
    if (!model) throw new Error('Invalid modelId');

    // ✅ OPENAI FLOW
    if (model.provider === 'openai') {
      // 1️⃣ Create Assistant
      const assistant = await openai.beta.assistants.create({
        name: `${projectName} (${assistantType})`,
        instructions:
          systemInstructions ||
          `You are Zeta, an intelligent, adaptable AI assistant designed to help with any project the user is working on — from betting to business to development. You refer to yourself as Zeta by default. If the user gives you a different name, adopt that name instead. Be clear, helpful, and adjust your tone and advice to match the user's current project and communication style.`,
        model: modelId === 'gpt-4o' ? 'gpt-4o' : 'gpt-4',
      });

      const assistantId = assistant.id;

      // 2️⃣ Save assistant_id to project
      const { data: projectData, error: projectError } = await supabaseAdmin
        .from('user_projects')
        .update({ assistant_id: assistantId })
        .eq('id', projectId)
        .select('assistant_id')
        .single();

      if (projectError || !projectData?.assistant_id) {
        console.error('❌ Failed to save assistant_id:', projectError);
        throw new Error('Missing or invalid assistant ID');
      }

      // 3️⃣ Create Thread
      const newThread = await openai.beta.threads.create();
      const threadId = newThread.id;

      // 4️⃣ Insert into threads table
      await supabaseAdmin.from('threads').insert({
        project_id: projectId,
        thread_id: threadId,
        created_at: now.toISOString(),
        last_active: now.toISOString(),
        expired: false,
      });

      // 5️⃣ Update project with thread ID
      await supabaseAdmin
        .from('user_projects')
        .update({ thread_id: threadId })
        .eq('id', projectId);

      // 6️⃣ Add initial user message
      if (!message || message.trim() === '') {
        throw new Error('Missing initial message. Cannot start thread without content.');
      }

      await openai.beta.threads.messages.create(threadId, {
        role: 'user',
        content: message,
      });

      // 6.5️⃣ Add Zeta's intro message with rename option
      await openai.beta.threads.messages.create(threadId, {
        role: 'assistant',
        content: `Hey there! I'm Zeta — your AI assistant for this project 🤖  
If you'd prefer to call me something else, just let me know and I’ll go by that name from now on.  
So… what are we working on today?`,
      });

      // 7️⃣ Run assistant
      const run = await openai.beta.threads.runs.create(threadId, {
        assistant_id: assistantId,
      });

      // 8️⃣ Wait for completion
      let runStatus;
      do {
        runStatus = await openai.beta.threads.runs.retrieve(run.id, {
          thread_id: threadId,
        });
        await new Promise((res) => setTimeout(res, 1000));
      } while (runStatus.status !== 'completed');

      // 9️⃣ Get assistant reply
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

      return NextResponse.json({ reply: textContent, threadId });
    }

    // 🔧 LOCAL or OTHER MODEL PLACEHOLDER
    if (['local', 'huggingface', 'anthropic'].includes(model.provider)) {
      console.log(`⚠️ Placeholder: skipping assistant setup for ${model.provider}`);
      return NextResponse.json({
        reply: `🧪 Placeholder: ${model.label} support coming soon.`,
        threadId: null,
      });
    }

    throw new Error('Unsupported model provider');
  } catch (err) {
    console.error('❌ Final catch block:', err);
    return NextResponse.json(
      { reply: '⚠️ Zeta had a setup issue. Try again later.' },
      { status: 500 }
    );
  }
}