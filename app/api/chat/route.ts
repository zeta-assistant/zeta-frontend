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

    const zetaName = 'Zeta';
    const date = now.toISOString().split('T')[0];
    const time = now.toISOString();

    // Get assistant_id
    const { data: projectData, error: projectError } = await supabaseAdmin
      .from('user_projects')
      .select('assistant_id')
      .eq('id', projectId)
      .single();

    if (projectError) {
      console.error('❌ Error fetching project data:', projectError);
      throw projectError;
    }

    const assistantId = projectData?.assistant_id;
    if (!assistantId) throw new Error('Missing assistant ID');

    // Get thread data for project
    const { data: threadData } = await supabaseAdmin
      .from('threads')
      .select('*')
      .eq('project_id', projectId)
      .order('last_active', { ascending: false })
      .limit(1)
      .single();

    let threadId = threadData?.thread_id;

    const expired =
      threadData?.expired ||
      (threadData?.last_active &&
        now.getTime() - new Date(threadData.last_active).getTime() > 1000 * 60 * 60);

    if (!threadId || expired) {
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
      await supabaseAdmin
        .from('threads')
        .update({ last_active: now.toISOString() })
        .eq('thread_id', threadId);
    }

    // Fetch mainframe info context fields including preferred_user_name
    const { data: mainframeInfo, error: contextError } = await supabaseAdmin
      .from('mainframe_info')
      .select(
        `
        latest_notification,
        latest_thought,
        vision,
        short_term_goals,
        long_term_goals,
        preferred_user_name
      `
      )
      .eq('project_id', projectId)
      .single();

    if (contextError) {
      console.error('❌ Error fetching mainframe info:', contextError);
    }

    // Fetch latest outreach chat message from conversation log
    const { data: latestOutreachMessages } = await supabaseAdmin
      .from('zeta_conversation_log')
      .select('message')
      .eq('project_id', projectId)
      .eq('role', 'assistant')
      // If you have a flag like is_outreach, filter here: .eq('is_outreach', true)
      .order('timestamp', { ascending: false })
      .limit(1);

    const latestOutreachChat = latestOutreachMessages?.[0]?.message ?? 'No outreach chat available.';

    const userName = mainframeInfo?.preferred_user_name || 'there';

    // Build full context string with all info including outreach chat and user name
    const context = `Today is ${date}, and the time is ${time}.
You are ${zetaName} — the AI assistant for this project.

The user’s preferred name is: ${userName}.

Latest notification: ${mainframeInfo?.latest_notification ?? 'None'}
Latest thought: ${mainframeInfo?.latest_thought ?? 'None'}
Latest outreach chat: ${latestOutreachChat}
Vision: ${mainframeInfo?.vision ?? 'None'}
Short term goals: ${mainframeInfo?.short_term_goals ?? 'None'}
Long term goals: ${mainframeInfo?.long_term_goals ?? 'None'}

Do not refer to yourself as ChatGPT or Assistant, refer to yourself as Zeta.
`;

    // Inject context before user message
    await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: `[CONTEXT]\n${context}`,
    });

    // Inject actual user message
    await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: message,
    });

    // Run assistant
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
    });

    let runStatus;
    do {
      runStatus = await openai.beta.threads.runs.retrieve(run.id, {
        thread_id: threadId,
      });
      await new Promise((res) => setTimeout(res, 1000));
    } while (runStatus.status !== 'completed');

    // Get assistant reply
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

    // Get session for user_id
    const {
      data: { session },
    } = await supabaseAdmin.auth.getSession();

    // Call update-mainframe endpoint
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
        preferred_user_name: userName,
      }),
    });

    return NextResponse.json({ reply: textContent, threadId });
  } catch (err) {
    console.error('❌ Zeta GPT error:', err);
    return NextResponse.json({ reply: '⚠️ Zeta had a GPT issue.' }, { status: 500 });
  }
}