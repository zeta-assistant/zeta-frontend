import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SERVICE_ROLE!);

export async function POST(req: Request) {
  const { projectName, assistantType, systemInstructions, projectId } = await req.json();

  try {
    // Create new assistant
    const assistant = await openai.beta.assistants.create({
      name: projectName,
      instructions: systemInstructions || `You are a helpful ${assistantType}.`,
      tools: [{ type: 'code_interpreter' }],
      model: 'gpt-4o',
    });

    // Store the assistant ID in Supabase
    const { error: updateError } = await supabase
      .from('user_projects')
      .update({ assistant_id: assistant.id }) // ✅ match naming across app
      .eq('id', projectId);

    if (updateError) {
      console.error('Failed to update project with assistant ID:', updateError);
      return NextResponse.json({ error: 'DB update failed' }, { status: 500 });
    }

    return NextResponse.json({ assistantId: assistant.id }, { status: 200 });
  } catch (error) {
    console.error('Assistant creation error:', error);
    return NextResponse.json({ error: 'Failed to create assistant' }, { status: 500 });
  }
}