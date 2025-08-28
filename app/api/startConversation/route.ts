// app/api/startconversation/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import OpenAI from 'openai';

export async function POST(req: Request) {
  try {
    const { projectId } = await req.json();
    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
    }

    // ──────────────────────────────────────────────────────────
    // Fetch project & guard against duplicate intro
    // ──────────────────────────────────────────────────────────
    const { data: project, error: projErr } = await supabaseAdmin
      .from('user_projects')
      .select('assistant_id, name, system_instructions, user_id, first_message_sent')
      .eq('id', projectId)
      .single();

    if (projErr || !project) throw projErr ?? new Error('Project not found');

    const { data: existingMessages } = await supabaseAdmin
      .from('zeta_conversation_log')
      .select('id')
      .eq('project_id', projectId)
      .eq('role', 'assistant')
      .limit(1);

    if (existingMessages && existingMessages.length > 0) {
      // Already introduced—nothing to do.
      return NextResponse.json({ success: true, skipped: true });
    }

    // Optionally pull a little extra context (vision/goals) if you want the intro to feel smarter
    const { data: mainframe } = await supabaseAdmin
      .from('mainframe_info')
      .select('vision, long_term_goals, short_term_goals')
      .eq('project_id', projectId)
      .single();

    const systemInstructions = project.system_instructions || '';
    const projectName = project.name || 'your project';
    const vision = mainframe?.vision?.trim?.();
    const topLongTerm =
      Array.isArray(mainframe?.long_term_goals) && mainframe!.long_term_goals.length
        ? mainframe!.long_term_goals.slice(0, 2).join('; ')
        : undefined;
    const topShortTerm =
      Array.isArray(mainframe?.short_term_goals) && mainframe!.short_term_goals.length
        ? mainframe!.short_term_goals.slice(0, 3).join('; ')
        : undefined;

    // ──────────────────────────────────────────────────────────
    // Generate the intro with OpenAI (varies by temperature)
    // ──────────────────────────────────────────────────────────
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_KEY || process.env.OPENAI_API_KEY,
    });

    const sys = [
      `You are Zeta, a helpful, concise, and upbeat project copilot.`,
      `Write the VERY FIRST message of a conversation.`,
      `Keep it 2–4 short sentences total.`,
      `Structure MUST include:`,
      `1) Friendly "Hey there" style greeting.`,
      `2) Brief self-intro as Zeta + that you're here to help them achieve goals.`,
      `3) One short question asking HOW they'd like you to help, and what goals they'd like to work on.`,
      ,
      `Avoid repeating the project name more than once.`,
      `Vary phrasing each time (don’t be template-y).`,
      ``,
      `Project name: ${projectName}`,
      vision ? `Project vision: ${vision}` : ``,
      topLongTerm ? `Top long-term goals: ${topLongTerm}` : ``,
      topShortTerm ? `Top short-term goals: ${topShortTerm}` : ``,
      ``,
      `These are the system instructions Zeta will follow in this project (do not dump them to user; use them to set tone/context):`,
      systemInstructions,
    ]
      .filter(Boolean)
      .join('\n');

    let introPrompt: string;

    try {
      const resp = await openai.chat.completions.create({
        model: 'gpt-4o-mini', // or 'gpt-4.1-mini' / your preferred model
        temperature: 0.7,
        max_tokens: 160,
        messages: [
          { role: 'system', content: sys },
          {
            role: 'user',
            content:
              `Write the first message to the user for project "${projectName}". ` +
              `Keep it friendly, brief, and follow the structure above.`,
          },
        ],
      });

      introPrompt =
        resp.choices?.[0]?.message?.content?.trim() ||
        `Hey there! I’m Zeta, your assistant for “${projectName}.” I’m here to help you move faster toward your goals. Would you like me to help via quick checklists, proactive suggestions, or step-by-step guidance?`;
    } catch (genErr) {
      console.warn('⚠️ OpenAI intro generation failed, falling back:', genErr);
      introPrompt = `Hey there! I’m Zeta, your assistant for “${projectName}.” I’m here to help you move faster toward your goals. Would you like me to help via quick checklists, proactive suggestions, or step-by-step guidance?`;
    }

    // ──────────────────────────────────────────────────────────
    // Persist message + mark project touched
    // ──────────────────────────────────────────────────────────
    const { error: insertError } = await supabaseAdmin.from('zeta_conversation_log').insert({
      project_id: projectId,
      role: 'assistant',
      message: introPrompt,
      user_id: project.user_id,
    });
    if (insertError) throw insertError;

    await supabaseAdmin
      .from('user_projects')
      .update({
        last_interaction_at: new Date().toISOString(),
        first_message_sent: true,
      })
      .eq('id', projectId);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('❌ startConversation error:', err?.message || err);
    return NextResponse.json({ error: err?.message || 'Unknown error' }, { status: 500 });
  }
}
