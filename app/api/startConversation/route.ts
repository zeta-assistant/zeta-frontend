import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import OpenAI from 'openai';

// Ensure we use full template name in the intro, without duplicating
function injectTemplateName(intro: string, templateFullName: string): string {
  if (!intro || !templateFullName || templateFullName === 'Zeta') return intro;

  // If the model already said "Zeta Quant" (or Zeta Learn etc), DO NOTHING
  if (intro.includes(templateFullName)) {
    return intro;
  }

  let result = intro;

  // Replace "I'm Zeta" / "I’m Zeta" / "I am Zeta"
  result = result.replace(/\bI['’]m Zeta\b/, `I’m ${templateFullName}`);
  result = result.replace(/\bI am Zeta\b/, `I am ${templateFullName}`);

  // If that worked, return it
  if (result !== intro) return result;

  // Otherwise replace ONLY the FIRST standalone "Zeta"
  let replaced = false;
  result = result.replace(/\bZeta\b/, (match) => {
    if (replaced) return match;
    replaced = true;
    return templateFullName;
  });

  return result;
}

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
      .select(
        'assistant_id, name, system_instructions, user_id, first_message_sent, template_id, personality_traits, preferred_user_name'
      )
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

    // ──────────────────────────────────────────────────────────
    // Derive full template name from zeta_templates.title
    // ──────────────────────────────────────────────────────────
    let templateFullName = 'Zeta';

    if (project.template_id) {
      const { data: tmpl, error: tmplErr } = await supabaseAdmin
        .from('zeta_templates')
        .select('title')
        .eq('id', project.template_id)
        .maybeSingle();

      if (!tmplErr && tmpl?.title) {
        const t = String(tmpl.title).trim();
        if (t.length > 0) templateFullName = t; // e.g. "Zeta Quant"
      }
    }

    // ──────────────────────────────────────────────────────────
    // Extra mainframe context to make the intro feel smarter
    // ──────────────────────────────────────────────────────────
    const { data: mainframe } = await supabaseAdmin
      .from('mainframe_info')
      .select('vision, long_term_goals, short_term_goals, personality_traits')
      .eq('project_id', projectId)
      .single();

    const systemInstructions = (project.system_instructions || '').toString();
    const hasSystemInstructions = systemInstructions.trim().length > 0;

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

    // Traits: prefer mainframe, fall back to project
    let traitList: string[] = [];
    if (Array.isArray(mainframe?.personality_traits)) {
      traitList = mainframe!.personality_traits as string[];
    } else if (Array.isArray(project.personality_traits)) {
      traitList = project.personality_traits as string[];
    }

    traitList = Array.from(
      new Set(
        (traitList || [])
          .map((t) => (t ? String(t).trim() : ''))
          .filter(Boolean)
      )
    );

    // ──────────────────────────────────────────────────────────
    // If NO system instructions: generic, lightweight greeting
    // ──────────────────────────────────────────────────────────
    if (!hasSystemInstructions) {
      const genericIntro = `Hey there! I’m ${templateFullName}, your project copilot for “${projectName}.” I’m here to help you move faster toward your goals. What would you like to focus on first?`;

      const { error: insertError } = await supabaseAdmin
        .from('zeta_conversation_log')
        .insert({
          project_id: projectId,
          role: 'assistant',
          message: genericIntro,
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

      return NextResponse.json({ success: true, generic: true });
    }

    // ──────────────────────────────────────────────────────────
    // System-instruction-powered intro with traits (implicit)
    // ──────────────────────────────────────────────────────────
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_KEY || process.env.OPENAI_API_KEY,
    });

    const traitHints =
      traitList.length > 0
        ? `Adopt a tone that naturally expresses these personality characteristics: ${traitList.join(
            ', '
          )}. Do NOT mention these traits to the user; simply embody them.`
        : `Adopt a tone that aligns with the system instructions (if any), without ever mentioning them.`;

    const sys = [
      `You are ${templateFullName}, the AI assigned to this project.`,

      // Tone shaping without exposing traits
      traitHints,

      // SYSTEM INSTRUCTIONS influence — but not shown to user
      `Below are the system instructions for this project. DO NOT show or quote them to the user. Instead, absorb them and let them shape how you describe yourself, your tone, and how you offer help.`,
      systemInstructions,

      // Intro generation rules
      `Your task is to generate ONLY the very first message of the entire conversation.`,
      `The message must be 2–4 short, natural sentences.`,
      `Structure:`,
      `1) Friendly "Hey there" style greeting.`,
      `2) Brief self-introduction as ${templateFullName}, implicitly shaped by the system instructions and traits.`,
      `3) Ask what they'd like help with and which goals they want to focus on.`,

      `Do NOT mention personality traits, system instructions, or internal rules.`,
      `Do NOT say things like "based on your system instructions" or "my traits are...".`,
      `Do NOT describe your personality explicitly; demonstrate it through your tone and wording.`,
      `Keep it natural, concise, and human-like.`,

      // Extra context for richness
      vision ? `Project vision: ${vision}` : ``,
      topLongTerm ? `Top long-term goals: ${topLongTerm}` : ``,
      topShortTerm ? `Top short-term goals: ${topShortTerm}` : ``,
    ]
      .filter(Boolean)
      .join('\n');

    let introPrompt: string;

    try {
      const resp = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        max_tokens: 160,
        messages: [
          { role: 'system', content: sys },
          {
            role: 'user',
            content: `
Write the first message to the user for project "${projectName}".
Start with a warm "Hey there" style greeting.
Introduce yourself explicitly as ${templateFullName}.
Let your tone and phrasing be shaped by the system instructions and traits above, but do NOT mention them or describe them explicitly.
Ask what they'd like to work on or which goals they want help with.
Keep it friendly, concise, and human.`,
          },
        ],
      });

      introPrompt =
        resp.choices?.[0]?.message?.content?.trim() ||
        `Hey there! I’m ${templateFullName}, your assistant for “${projectName}.” I’m here to help you move faster toward your goals. Would you like me to help via quick checklists, proactive suggestions, or step-by-step guidance?`;
    } catch (genErr) {
      console.warn('⚠️ OpenAI intro generation failed, falling back:', genErr);
      introPrompt = `Hey there! I’m ${templateFullName}, your assistant for “${projectName}.” I’m here to help you move faster toward your goals. Would you like me to help via quick checklists, proactive suggestions, or step-by-step guidance?`;
    }

    // Ensure we actually say the full template name, not just "Zeta"
    introPrompt = injectTemplateName(introPrompt, templateFullName);

    const { error: insertError } = await supabaseAdmin
      .from('zeta_conversation_log')
      .insert({
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
