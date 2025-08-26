// app/api/mini-chat/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Prefer your configured base URL; fall back to Vercel URL or localhost
function baseUrl() {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

// Server-side fallback so mini-chat still works even if the client sends nothing
const DEFAULT_NOTIFICATION =
  'Hey there! Connect to Telegram in Workspace/APIs, and then start receiving notifications! ';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const projectId: string | undefined = body?.projectId;
    const userEmail: string | null | undefined = body?.userEmail ?? null;
    const userReplyRaw: string | undefined = body?.userReply;
    const notificationBodyRaw: string | undefined = body?.notificationBody;

    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
    }
    const userReply = (userReplyRaw ?? '').trim();
    if (!userReply) {
      return NextResponse.json({ error: 'Missing userReply' }, { status: 400 });
    }
    // Accept empty/missing notification & use a sane default
    const notificationBody = (notificationBodyRaw ?? '').trim() || DEFAULT_NOTIFICATION;

    // 1) Get or create an active session for this notification
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
      // Close any existing active session if the notification changed
      if (active) {
        await supabaseAdmin
          .from('mini_chat_sessions')
          .update({
            is_active: false,
            ended_at: new Date().toISOString(),
            closed_reason: 'notification_changed',
          })
          .eq('id', active.id);
      }

      // Create a new session
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

    let followup = 'Got it.';
    try {
      const res = await fetch(`${baseUrl()}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: seedMessage,
          projectId,
          modelId: 'gpt-4o',
          attachments: [],
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `chat route ${res.status}`);
      followup = (data?.reply ?? followup).toString();
    } catch (err) {
      // Degrade gracefully: still persist a lightweight assistant reply
      console.error('mini-chat: /api/chat failed — using fallback reply', err);
      followup =
        'Thanks for the update. Want me to spin this into a new discussion so we can go deeper?';
    }

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
