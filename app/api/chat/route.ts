import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_KEY,
});

export async function POST(req: Request) {
  try {
    const { message, assistantId } = await req.json();

    // 1. Create a new thread
    const thread = await openai.beta.threads.create();

    // 2. Add user message to the thread
    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: message,
    });

    // 3. Run the assistant on that thread
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: assistantId,
    });

    // 4. Poll until the run completes
    let runStatus;
    do {
      runStatus = await openai.beta.threads.runs.retrieve(run.id, {
        thread_id: thread.id,
      });
      await new Promise((res) => setTimeout(res, 1000));
    } while (runStatus.status !== 'completed');

    // 5. Retrieve the messages from the thread
    const messages = await openai.beta.threads.messages.list(thread.id);
    const assistantReply = messages.data.find((msg) => msg.role === 'assistant');

    let textContent = '⚠️ No reply.';
    if (
      assistantReply &&
      Array.isArray(assistantReply.content) &&
      assistantReply.content[0]?.type === 'text'
    ) {
      textContent = assistantReply.content[0].text.value;
    }

    return NextResponse.json({ reply: textContent });
  } catch (err) {
    console.error('❌ Zeta GPT error:', err);
    return NextResponse.json({ reply: '⚠️ Zeta had a GPT issue.' }, { status: 500 });
  }
}
