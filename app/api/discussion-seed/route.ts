// app/api/discussion-seed/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Body = {
  projectId: string;
  threadId: string;
  systemText?: string;
  assistantText?: string; // first visible
  userText?: string;      // second visible
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const projectId = String(body.projectId ?? '').trim();
    const threadId = String(body.threadId ?? '').trim();
    const systemText = String(body.systemText ?? '').trim();
    const assistantText = String(body.assistantText ?? '').trim();
    const userText = String(body.userText ?? '').trim();

    if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
    if (!threadId) return NextResponse.json({ error: 'Missing threadId' }, { status: 400 });
    if (!systemText && !assistantText && !userText) {
      return NextResponse.json({ error: 'Nothing to seed' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const rows: any[] = [];
    if (systemText)    rows.push({ project_id: projectId, thread_id: threadId, role: 'system',    content: systemText,    created_at: now });
    if (assistantText) rows.push({ project_id: projectId, thread_id: threadId, role: 'assistant', content: assistantText, created_at: new Date().toISOString() });
    if (userText)      rows.push({ project_id: projectId, thread_id: threadId, role: 'user',      content: userText,      created_at: new Date().toISOString() });

    const { error: insErr } = await supabaseAdmin.from('discussion_messages').insert(rows);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    const { error: updErr } = await supabaseAdmin
      .from('discussions')
      .update({ last_updated: new Date().toISOString() })
      .eq('thread_id', threadId);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'seed failed' }, { status: 500 });
  }
}
