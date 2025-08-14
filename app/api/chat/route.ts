import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { AVAILABLE_MODELS } from '@/lib/models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

type Uploaded = { file_name: string; file_url: string };

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const DOC_EXTS = new Set([
  '.pdf', '.txt', '.md', '.csv', '.tsv', '.json',
  '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx',
]);

function extOf(name: string) {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

export async function POST(req: Request) {
  try {
    const {
      message,
      projectId,
      modelId = 'gpt-4o',
      attachments = [],
    }: { message: string; projectId: string; modelId?: string; attachments?: Uploaded[] } = await req.json();

    const now = new Date();

    const model = AVAILABLE_MODELS.find((m) => m.id === modelId);
    if (!model) {
      return NextResponse.json({ reply: '⚠️ Invalid model selected.' }, { status: 400 });
    }

    // —— fetch assistant id ——
    const { data: projectData, error: projectError } = await supabaseAdmin
      .from('user_projects')
      .select('assistant_id')
      .eq('id', projectId)
      .single();
    if (projectError) throw projectError;
    const assistantId = projectData?.assistant_id;
    if (!assistantId) throw new Error('Missing assistant ID');

    // —— thread mgmt ——
    const { data: threadData } = await supabaseAdmin
      .from('threads')
      .select('*')
      .eq('project_id', projectId)
      .order('last_active', { ascending: false })
      .limit(1)
      .single();

    let threadId = threadData?.thread_id;
    const expired =
      threadData?.expired ||
      (threadData?.last_active && now.getTime() - new Date(threadData.last_active).getTime() > 1000 * 60 * 60);

    if (!threadId || expired) {
      const newThread = await openai.beta.threads.create();
      threadId = newThread.id;

      await supabaseAdmin.from('threads').insert({
        project_id: projectId,
        thread_id: threadId,
        created_at: now.toISOString(),
        last_active: now.toISOString(),
        expired: false,
      });

      await supabaseAdmin.from('user_projects').update({ thread_id: threadId }).eq('id', projectId);
    } else {
      await supabaseAdmin.from('threads').update({ last_active: now.toISOString() }).eq('thread_id', threadId);
    }

    // —— context ——
    const { data: mainframeInfo } = await supabaseAdmin
      .from('mainframe_info')
      .select('latest_notification, latest_thought, vision, short_term_goals, long_term_goals, preferred_user_name')
      .eq('project_id', projectId)
      .single();

    const { data: latestOutreachMessages } = await supabaseAdmin
      .from('zeta_conversation_log')
      .select('message')
      .eq('project_id', projectId)
      .eq('role', 'assistant')
      .order('timestamp', { ascending: false })
      .limit(1);

    const userName = mainframeInfo?.preferred_user_name || 'there';
    const latestOutreachChat = latestOutreachMessages?.[0]?.message ?? 'No outreach chat available.';
    const date = now.toISOString().split('T')[0];
    const time = now.toISOString();

    const context = `Today is ${date}, and the time is ${time}.
You are Zeta — the AI assistant for this project.
User’s preferred name: ${userName}
Latest notification: ${mainframeInfo?.latest_notification ?? 'None'}
Latest thought: ${mainframeInfo?.latest_thought ?? 'None'}
Latest outreach chat: ${latestOutreachChat}
Vision: ${mainframeInfo?.vision ?? 'None'}
Short term goals: ${mainframeInfo?.short_term_goals ?? 'None'}
Long term goals: ${mainframeInfo?.long_term_goals ?? 'None'}
Do not refer to yourself as ChatGPT or Assistant; refer to yourself as Zeta.`;

    await openai.beta.threads.messages.create(threadId!, {
      role: 'user',
      content: `[CONTEXT]\n${context}`,
    });

    // ===== Upload Supabase files to OpenAI; split images vs docs =====
    const imageFileIds: string[] = [];
    const docFileIds: string[] = [];

    if (Array.isArray(attachments) && attachments.length > 0) {
      for (const a of attachments) {
        try {
          const res = await fetch(a.file_url);
          if (!res.ok) throw new Error(`Fetch failed ${res.status} ${res.statusText}`);
          const ab = await res.arrayBuffer();
          const mime = res.headers.get('content-type') || 'application/octet-stream';

          // Node runtime supports File/Blob
          const file = new File([new Blob([ab], { type: mime })], a.file_name, { type: mime });
          const upload = await openai.files.create({ file, purpose: 'assistants' });

          const ext = extOf(a.file_name);
          if (IMAGE_EXTS.has(ext) || (mime.startsWith('image/'))) {
            imageFileIds.push(upload.id);
          } else {
            // treat everything else as a doc (only file_search supports retrieval)
            docFileIds.push(upload.id);
          }
        } catch (e) {
          console.error('OpenAI file upload failed:', a.file_name, e);
        }
      }
    }

    // Build the user message:
    // - text content (if any)
    // - each image as an image_file content block (vision)
    // - docs attached with file_search tool (retrieval)
    const contentBlocks: any[] = [];
    const userText =
      (message && message.length > 0 ? message : '') ||
      (imageFileIds.length || docFileIds.length ? 'Please review the attached file(s).' : '');

    if (userText) {
      contentBlocks.push({ type: 'text', text: userText });
    }

    for (const imgId of imageFileIds) {
      contentBlocks.push({ type: 'image_file', image_file: { file_id: imgId } });
    }

    const docAttachments =
      docFileIds.length > 0
        ? docFileIds.map((id) => ({
            file_id: id,
            tools: [{ type: 'file_search' as const }], // required for retrieval
          }))
        : undefined;

    await openai.beta.threads.messages.create(threadId!, {
      role: 'user',
      content: contentBlocks.length > 0 ? contentBlocks : [{ type: 'text', text: ' ' }],
      attachments: docAttachments,
    });

    // Run assistant
    const run = await openai.beta.threads.runs.create(threadId!, { assistant_id: assistantId });

    // Poll until complete
    let runStatus;
    do {
      runStatus = await openai.beta.threads.runs.retrieve(run.id, { thread_id: threadId! });
      await new Promise((r) => setTimeout(r, 1000));
    } while (runStatus.status !== 'completed');

    // Read reply
    const list = await openai.beta.threads.messages.list(threadId!);
    const assistantReply = list.data.find((m) => m.role === 'assistant');

    function extractTextFromAssistantMessage(msg: unknown): string {
      const parts = (msg as any)?.content ?? [];
      const chunks: string[] = [];
      for (const p of parts) {
        if (p && p.type === 'text' && p.text && typeof p.text.value === 'string') {
          chunks.push(p.text.value);
        }
      }
      return chunks.join('\n\n');
    }

    let textContent = extractTextFromAssistantMessage(assistantReply) || '⚠️ No reply.';

    // optional: update-mainframe (non-fatal if it fails)
    try {
      const {
        data: { session },
      } = await supabaseAdmin.auth.getSession();

      await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/update-mainframe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          user_id: session?.user?.id ?? null,
          project_id: projectId,
          zeta_name: 'Zeta',
          preferred_user_name: userName,
        }),
      });
    } catch (e) {
      console.warn('update-mainframe call failed (non-fatal):', e);
    }

    return NextResponse.json({ reply: textContent, threadId });
  } catch (err: any) {
    console.error('❌ /api/chat error:', err?.message ?? err);
    return NextResponse.json(
      { reply: '⚠️ Zeta had a GPT issue.', error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}