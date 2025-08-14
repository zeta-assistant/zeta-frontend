import { NextResponse } from 'next/server';

// Reuse your /api/chat pipeline so assistants/threads logic stays in one place
function baseUrl() {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: Request) {
  try {
    const { projectId, userEmail, notificationBody, userReply } = await req.json();
    if (!projectId || !notificationBody || !userReply) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // 1) Upsert active session for this notification
    const { data: active } = await supabaseAdmin
      .from('mini_chat_sessions')
      .select('*')
      .eq('project_id', projectId)
      .eq('is_active', true)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let sessionId = active?.id ?? null;

    if (!active || active.notification_body !== notificationBody) {
      // close any existing active session
      if (active) {
        await supabaseAdmin
          .from('mini_chat_sessions')
          .update({ is_active: false, ended_at: new Date().toISOString(), closed_reason: 'notification_changed' })
          .eq('id', active.id);
      }
      // create a new session
      const { data: created, error: insErr } = await supabaseAdmin
        .from('mini_chat_sessions')
        .insert({ project_id: projectId, notification_body: notificationBody })
        .select('id')
        .single();
      if (insErr) throw insErr;
      sessionId = created.id;
    }

    // 2) Persist the user's message
    await supabaseAdmin.from('mini_chat_messages').insert({
      session_id: sessionId,
      project_id: projectId,
      role: 'user',
      content: userReply,
    });

    // 3) Ask your existing /api/chat for a concise follow-up
    const seedMessage =
      `Mini-convo from dashboard.\n` +
      `Notification:\n${notificationBody}\n\n` +
      `User reply (${userEmail ?? 'user'}):\n${userReply}\n\n` +
      `Respond in 1-2 sentences that best would engage the user to create a new discussion.`;

    const res = await fetch(`${baseUrl()}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: seedMessage, projectId, modelId: 'gpt-4o', attachments: [] }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `chat route ${res.status}`);

    const followup: string = data.reply ?? 'Got it.';

    // 4) Persist assistant message
    await supabaseAdmin.from('mini_chat_messages').insert({
      session_id: sessionId,
      project_id: projectId,
      role: 'assistant',
      content: followup,
    });

    return NextResponse.json({ followup, sessionId });
  } catch (e: any) {
    console.error('❌ /api/mini-chat error:', e?.message || e);
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 });
  }
}