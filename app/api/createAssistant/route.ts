import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  const { projectName, assistantType, systemInstructions } = await req.json();

  try {
    const assistant = await openai.beta.assistants.create({
      name: projectName,
      instructions: systemInstructions || `You are a helpful ${assistantType}.`,
      tools: [{ type: 'code_interpreter' }],
      model: 'gpt-4o',
    });

    return NextResponse.json({ assistantId: assistant.id }, { status: 200 });
  } catch (error) {
    console.error('Assistant creation error:', error);
    return NextResponse.json({ error: 'Failed to create assistant' }, { status: 500 });
  }
}
