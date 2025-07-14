import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: Request) {
  try {
    const { projectId } = await req.json();

    const { data: project, error } = await supabaseAdmin
      .from('user_projects')
      .select('assistant_id, name, system_instructions, user_id, first_message_sent')
      .eq('id', projectId)
      .single();

    if (error || !project) throw error;

    // ✅ Check if Zeta already replied
    const { data: existingMessages } = await supabaseAdmin
      .from('zeta_conversation_log')
      .select('id')
      .eq('project_id', projectId)
      .eq('role', 'assistant');

    if (existingMessages && existingMessages.length > 0) {
      console.log('🛑 Assistant already introduced. Skipping insert.');
      return NextResponse.json({ success: true });
    }

    const { data: sessionData } = await supabaseAdmin.auth.admin.getUserById(project.user_id);
    const userEmail = sessionData?.user?.email ?? 'User';

    const systemInstructions = project.system_instructions || '';
    const introPrompt = `Hi! I'm Zeta, your assistant for "${project.name}". Here's what I’m here to help with:\n\n${systemInstructions}\n\nWhat would you like to do first?`;

    const { error: insertError } = await supabaseAdmin.from('zeta_conversation_log').insert({
      project_id: projectId,
      role: 'assistant',
      message: introPrompt,
      user_id: project.user_id,
    });

    if (insertError) {
      console.error('❌ Failed to insert assistant message:', insertError);
      throw insertError;
    }

    const { error: updateError } = await supabaseAdmin
      .from('user_projects')
      .update({ first_message_sent: true })
      .eq('id', projectId);

    if (updateError) {
      console.warn('⚠️ Could not update first_message_sent, but message was still inserted.');
    }

    console.log('✅ Zeta welcome message inserted.');
    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error('❌ startConversation error:', err.message || err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}