import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import axios from 'axios';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      projectName,
      assistantType,
      systemInstructions,
      projectId,
      privacyLevel,
    } = body;

    if (!projectName || !assistantType || !projectId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const OPENAI_API_KEY = process.env.OPENAI_KEY;
    if (!OPENAI_API_KEY) {
      return NextResponse.json({ error: 'Missing OpenAI API Key' }, { status: 500 });
    }

    // ✅ Step 1: Create Assistant using OpenAI API
    console.log("📋 Final systemInstructions being sent:", systemInstructions);
    const createRes = await axios.post(
      'https://api.openai.com/v1/assistants',
      {
        name: projectName,
        instructions: systemInstructions || 'You are Zeta, a time-aware AI assistant designed to help users with strategic thinking, memory, and business tasks. Never refer to yourself as ChatGPT. Always refer to yourself as Zeta.',
        tools: [{ type: 'file_search' }],
        model: 'gpt-4o',
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v2',
        },
      }
    );

    const assistantId = createRes.data.id;
    console.log('🧠 Assistant created:', assistantId);

    // 🔍 Step 1.5: Confirm assistant instructions actually embedded
    const verifyRes = await axios.get(
      `https://api.openai.com/v1/assistants/${assistantId}`,
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'OpenAI-Beta': 'assistants=v2',
        },
      }
    );

    console.log('📝 Instructions stored in OpenAI:', verifyRes.data.instructions);

    // ✅ Step 2: Save Assistant ID and system instructions to Supabase
    const { error: updateError } = await supabaseAdmin
      .from('user_projects')
      .update({
        assistant_id: assistantId,
        system_instructions: systemInstructions || 'You are Zeta, a time-aware AI assistant designed to help users with strategic thinking, memory, and business tasks. Never refer to yourself as ChatGPT. Always refer to yourself as Zeta.',
      })
      .eq('id', projectId);

    if (updateError) throw updateError;

    return NextResponse.json({ assistantId }, { status: 200 });
  } catch (err: any) {
    console.error('❌ Assistant creation error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
