// app/api/mini-chat/history/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
    }

    // Prefer the currently active session
    let { data: session, error: activeErr } = await supabaseAdmin
      .from('mini_chat_sessions')
      .select('*')
      .eq('project_id', projectId)
      .eq('is_active', true)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeErr) throw activeErr;

    // If none active, fall back to the most recent session (helps after a reload)
    if (!session) {
      const { data: last, error: lastErr } = await supabaseAdmin
        .from('mini_chat_sessions')
        .select('*')
        .eq('project_id', projectId)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastErr) throw lastErr;
      session = last ?? null;
    }

    if (!session) {
      // No history yet
      return NextResponse.json({ notificationBody: null, messages: [] });
    }

    const { data: messages, error: msgErr } = await supabaseAdmin
      .from('mini_chat_messages')
      .select('role, content, created_at')
      .eq('session_id', session.id)
      .order('created_at', { ascending: true });

    if (msgErr) throw msgErr;

    return NextResponse.json({
      notificationBody: session.notification_body,
      messages: messages ?? [],
    });
  } catch (e: any) {
    console.error('mini-chat/history error:', e?.message || e);
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 });
  }
}
