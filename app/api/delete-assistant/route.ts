import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_KEY!,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const assistantId = body?.assistantId || null;
    const projectId = body?.projectId || null;

    if (!projectId) {
      console.warn('❌ No projectId provided in request');
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
    }

    // ✅ Try to delete assistant (non-blocking if fails)
    if (assistantId) {
      try {
        await openai.beta.assistants.delete(assistantId);
        console.log('✅ Assistant deleted from OpenAI:', assistantId);
      } catch (err: any) {
        console.warn('⚠️ Assistant already deleted or not found:', assistantId, '| Continuing anyway.');
        // Continue even if assistant deletion fails
      }
    } else {
      console.log('ℹ️ No assistantId provided — skipping OpenAI deletion');
    }

    // ✅ Always attempt to delete project
    const { error: projectDeleteError } = await supabaseAdmin
      .from('user_projects')
      .delete()
      .eq('id', projectId);

    if (projectDeleteError) {
      console.error('❌ Supabase deletion error:', projectDeleteError.message);
      return NextResponse.json({ error: 'Failed to delete project from Supabase' }, { status: 500 });
    }

    console.log('✅ Project deleted from Supabase:', projectId);
    return NextResponse.json({ success: true }, { status: 200 });

  } catch (err: any) {
    console.error('❌ Uncaught error in delete-assistant route:', err.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}