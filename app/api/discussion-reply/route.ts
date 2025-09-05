// app/api/discussion-reply/route.ts
import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getSharedContext } from '@/lib/onboarding';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY! });

/* ------------------------------------------------------------
   Helpers: thread lookup / resolve / idle guard / fork
-------------------------------------------------------------*/

async function lookupProjectIdByThreadId(threadId: string): Promise<string | null> {
  if (!threadId) return null;

  const { data: t } = await supabaseAdmin
    .from('threads')
    .select('project_id')
    .or(`openai_thread_id.eq.${threadId},thread_id.eq.${threadId}`)
    .maybeSingle();

  if (t?.project_id) return t.project_id as string;

  const { data: d } = await supabaseAdmin
    .from('discussions')
    .select('project_id')
    .eq('thread_id', threadId)
    .maybeSingle();

  return (d?.project_id as string) || null;
}

async function resolveThreadForProject(projectId: string, preferred?: string): Promise<string> {
  if (preferred) return preferred;

  const { data: latest } = await supabaseAdmin
    .from('discussions')
    .select('thread_id')
    .eq('project_id', projectId)
    .order('last_updated', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest?.thread_id) return latest.thread_id as string;

  // Lazily create new discussion/thread
  const nowIso = new Date().toISOString();
  const t = await openai.beta.threads.create();
  const tid = t.id;

  await supabaseAdmin.from('threads').insert({
    project_id: projectId,
    type: 'discussion',
    openai_thread_id: tid,
    thread_id: tid,
    created_at: nowIso,
    last_active: nowIso,
    expired: false,
  });

  await supabaseAdmin.from('discussions').insert({
    project_id: projectId,
    thread_id: tid,
    title: 'New Discussion',
    last_updated: nowIso,
    file_ids: null,
  });

  return tid;
}

/** Return latest run status if available. SDK surfaces vary, so keep this defensive. */
async function getLatestRunStatus(threadId: string): Promise<{ id: string; status: string } | null> {
  try {
    // @ts-ignore older SDKs may not type .list
    const runs = await (openai as any).beta.threads.runs.list(threadId);
    const latest = runs?.data?.[0];
    if (latest?.id && latest?.status) {
      return { id: latest.id, status: String(latest.status) };
    }
  } catch {
    // ignore: not all SDKs have runs.list; we just won't block
  }
  return null;
}

/** Wait until thread has no active run (queued/in_progress/requires_action). */
async function waitForIdle(threadId: string, timeoutMs = 30000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const info = await getLatestRunStatus(threadId);
    const s = info?.status;
    if (!s || ['completed', 'failed', 'cancelled', 'expired'].includes(s)) return true;
    await new Promise((r) => setTimeout(r, 600));
  }
  return false;
}

/** Create a fresh thread seeded with a compact transcript + mainframe snapshot. */
async function forkThreadWithContext(opts: {
  projectId: string;
  fromThreadId: string;
  title?: string;
  maxMessages?: number;
}) {
  const { projectId, fromThreadId, title = 'Forked Discussion', maxMessages = 12 } = opts;

  const now = new Date().toISOString();

  // Pull recent messages from DB
  const { data: msgs } = await supabaseAdmin
    .from('discussion_messages')
    .select('role, content, created_at')
    .eq('thread_id', fromThreadId)
    .order('created_at', { ascending: false })
    .limit(maxMessages);

  const ordered = (msgs ?? []).reverse();
  const transcript = ordered
    .map((m) => `${m.role === 'assistant' ? 'Zeta' : 'User'} [${m.created_at}]: ${m.content}`)
    .join('\n');

  const { data: mf } = await supabaseAdmin
    .from('mainframe_info')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle();

  const context = [
    '[FORK CONTEXT: previous discussion summary]',
    transcript || '(no prior messages)',
    '',
    '[MAINFRAME SNAPSHOT]',
    JSON.stringify(mf ?? {}, null, 2),
    '',
    '— End fork context. Use it as lightweight background; do not rehash it verbosely.',
  ].join('\n');

  // New OpenAI thread + DB rows
  const t = await openai.beta.threads.create();
  const newThreadId = t.id;

  await supabaseAdmin.from('threads').insert({
    project_id: projectId,
    type: 'discussion',
    openai_thread_id: newThreadId,
    thread_id: newThreadId,
    created_at: now,
    last_active: now,
    expired: false,
  });

  await supabaseAdmin.from('discussions').insert({
    project_id: projectId,
    thread_id: newThreadId,
    title,
    last_updated: now,
    file_ids: null,
  });

  await openai.beta.threads.messages.create(newThreadId, { role: 'user', content: context });
  await supabaseAdmin.from('discussion_messages').insert({
    project_id: projectId,
    thread_id: newThreadId,
    role: 'user',
    content: context,
    created_at: now,
  });

  return newThreadId;
}

/* ------------------------------------------------------------
   POST /api/discussion-reply
-------------------------------------------------------------*/
export async function POST(req: Request) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    // Accept both new and legacy shapes
    const message = (body?.message ?? body?.content ?? '').toString().trim();
    const suppliedThreadId: string | undefined =
      body?.discussionThreadId || body?.threadId || undefined;
    let projectId: string | undefined = body?.projectId || undefined;

    const forkFromThreadId: string | undefined = body?.forkFromThreadId;
    const forkTitle: string | undefined = body?.forkTitle;
    const forkDepth: number | undefined = body?.forkDepth;

    if (!message) {
      return NextResponse.json({ error: 'Missing required field: message' }, { status: 400 });
    }

    // If projectId missing but we have a thread id, try to infer it
    if (!projectId && suppliedThreadId) {
      projectId = (await lookupProjectIdByThreadId(suppliedThreadId)) || undefined;
    }

    if (!projectId && !suppliedThreadId && !forkFromThreadId) {
      return NextResponse.json(
        { error: 'Missing required field: projectId (or provide threadId/discussionThreadId/forkFromThreadId).' },
        { status: 400 }
      );
    }

    // If forking, resolve projectId from the source thread when needed
    if (!projectId && forkFromThreadId) {
      projectId = (await lookupProjectIdByThreadId(forkFromThreadId)) || undefined;
    }
    if (!projectId) {
      return NextResponse.json({ error: 'Could not resolve projectId.' }, { status: 400 });
    }

    // Destination thread
    let threadId: string;
    if (forkFromThreadId) {
      threadId = await forkThreadWithContext({
        projectId,
        fromThreadId: forkFromThreadId,
        title: forkTitle || 'Forked Discussion',
        maxMessages: typeof forkDepth === 'number' ? forkDepth : 12,
      });
    } else {
      threadId = await resolveThreadForProject(projectId, suppliedThreadId);
    }

    // Assistant id
    const { data: projRow, error: projErr } = await supabaseAdmin
      .from('user_projects')
      .select('assistant_id')
      .eq('id', projectId)
      .single();
    if (projErr) throw projErr;
    if (!projRow?.assistant_id) throw new Error('Missing assistant ID for project');

    const assistantId = projRow.assistant_id as string;

    // Persist user message (DB)
    const nowIso = new Date().toISOString();
    await supabaseAdmin.from('discussion_messages').insert({
      project_id: projectId,
      thread_id: threadId,
      role: 'user',
      content: message,
      created_at: nowIso,
    });

    // Build turn context from shared context
    const { mainframeInfo, recentUserInputs } = await getSharedContext(projectId);
    const inputsFormatted =
      Array.isArray(recentUserInputs) && recentUserInputs.length > 0
        ? (recentUserInputs as any[]).map((u) => {
            const ts = (u?.timestamp || u?.created_at || '') as string;
            const who = (u?.author ?? 'user') as string;
            return `- [${ts}] ${who}: ${(u?.content ?? '') as string}`;
          }).join('\n')
        : 'None';

    const turnContext = `[TURN CONTEXT]
Now: ${nowIso}

[MAINFRAME]
${JSON.stringify(mainframeInfo ?? {}, null, 2)}

[RECENT USER INPUTS (last 5)]
${inputsFormatted}
— End of context.`;

    // Ensure thread is idle before adding new messages (prevents 400 while run is active)
    await waitForIdle(threadId);

    // Send to OpenAI
    await openai.beta.threads.messages.create(threadId, { role: 'user', content: turnContext });
    await openai.beta.threads.messages.create(threadId, { role: 'user', content: message });

    // Run assistant (short poll)
    let run = await openai.beta.threads.runs.create(threadId, { assistant_id: assistantId });
    for (let i = 0; i < 24; i++) {
      // @ts-ignore (SDK shape)
      run = await openai.beta.threads.runs.retrieve(run.id, { thread_id: threadId });
      if (['completed', 'failed', 'cancelled', 'expired'].includes(run.status)) break;
      await new Promise((r) => setTimeout(r, 700));
    }

    // Fetch assistant reply
    const list = await openai.beta.threads.messages.list(threadId);
    const a = list.data.find((m: any) => m.role === 'assistant');
    let reply = '⚠️ No assistant reply.';
    if (a?.content?.length) {
      const chunks = a.content
        .filter((c: any) => c.type === 'text' && c.text?.value)
        .map((c: any) => c.text.value);
      if (chunks.length) reply = chunks.join('\n\n');
    }

    // Persist assistant reply
    await supabaseAdmin.from('discussion_messages').insert({
      project_id: projectId,
      thread_id: threadId,
      role: 'assistant',
      content: reply,
      created_at: new Date().toISOString(),
    });

    // Touch timestamps
    const touchIso = new Date().toISOString();
    await Promise.all([
      supabaseAdmin
        .from('threads')
        .update({ last_active: touchIso })
        .or(`openai_thread_id.eq.${threadId},thread_id.eq.${threadId}`),
      supabaseAdmin.from('discussions').update({ last_updated: touchIso }).eq('thread_id', threadId),
    ]);

    return NextResponse.json({ reply, threadId, projectId });
  } catch (err: any) {
    console.error('❌ /api/discussion-reply error:', err?.message || err);
    return NextResponse.json({ error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}
