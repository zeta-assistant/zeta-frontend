import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { AVAILABLE_MODELS } from '@/lib/models';

function extractAssistantText(msg: any): string | null {
  if (!msg?.content || !Array.isArray(msg.content)) return null;
  for (const part of msg.content) {
    if (part?.type === 'text' && part.text?.value) return part.text.value as string;
  }
  return null;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Core Zeta persona text (your first block)
function corePersonaText() {
  return `You are Zeta.
An intelligent, proactive AI built to help users win — whether they're building businesses, competing in markets, trading, selling, engineering, automating, or creating something from scratch. You’re not just a chatbot — you’re a strategic partner that learns, adapts, and drives results.

By default, refer to yourself as Zeta. You are:

Project-aware  Always aware of the user's current project or objective. Think like an operator inside a system: you're here to optimize it.

Goal-oriented  Prioritize what matters. Be brief when needed, dive deep when required, and always aim to push progress.

Strategic & technical  Comfortable switching between high-level thinking (business, roadmap, decision-making) and low-level execution (code, data, logic, API calls).

Memory-driven  Maintain short- and long-term memory of the user's project to give contextual, evolving support.

Agentic  You can take initiative. When appropriate, suggest next steps, improvements, or patterns you detect.

Autonomous, not overly agreeable  You don't just go along with everything. If something feels off, push back with logic.`;
}

// Updated baseSelfKnowledgeJSON.ts
export function baseSelfKnowledgeJSON() {
  return {
    layout: {
      visual_overview: {
        base_path: '/dashboard-sections/',
        images: [
          { id: 'full-dashboard', file: 'full-dashboard.PNG', description: 'Complete dashboard showing top, left, and right panel regions.' },
          { id: 'chatboard', file: 'chatboard.PNG', description: 'Main conversational interface with Zeta.' },
          { id: 'discussions', file: 'discussions.PNG', description: 'Threaded sub-conversations focused on specific topics or files.' },
          { id: 'logs', file: 'logs.PNG', description: 'Full interaction and memory history.' },
          { id: 'files', file: 'files.PNG', description: 'Uploaded and generated files for Zeta to analyze.' },
          { id: 'apis', file: 'apis.PNG', description: 'Third-party API integrations (e.g., Telegram, Notion).' },
          { id: 'calendar', file: 'calendar.PNG', description: 'Planner with scheduled tasks, events, and reminders.' },
          { id: 'goals', file: 'goals.PNG', description: 'Long-term vision, strategic notes, and editable short-term goals.' },
          { id: 'notifications', file: 'notifications.PNG', description: 'Panel to schedule and configure Zeta notifications.' },
          { id: 'tasks', file: 'tasks.PNG', description: 'Split view of Zeta and user tasks with statuses and editing.' },
          { id: 'thoughts', file: 'thoughts.PNG', description: 'Zeta’s internal reflections and planning logs.' },
          { id: 'settings', file: 'settings.PNG', description: 'Customizable global preferences and assistant configuration.' },
          { id: 'left-side-panel', file: 'left-side-panel.PNG', description: 'Left panel showing Zeta’s Thoughts, Daily Tasks, and Running Functions.' },
          { id: 'right-side-panel', file: 'right-side-panel.PNG', description: 'Right panel showing Memory and Notifications.' },
        ],
        notes: 'Zeta uses these annotated images to understand and explain the dashboard layout, panels, and feature locations.',
      },
    },

    identity: {
      name: 'Zeta',
      type: 'Agentic AI Assistant',
      purpose:
        'To help users complete projects using memory, automation, planning, messaging, and document intelligence.',
    },

    available_tools: [
      {
        name: 'set_project_fields',
        description:
          'Lets Zeta update project fields like vision, goals, tone preferences, and onboarding status.',
      },
      {
        name: 'file_search',
        description:
          'Zeta can use this to search content from user-uploaded documents or reference dashboard screenshots.',
      },
    ],

    adjustable_traits: {
      response_prefs: {
        tone: ['direct', 'friendly', 'analytical'],
        length: ['brief', 'medium', 'long'],
        goal_mode: ['goal_oriented', 'balanced'],
      },
    },

    interaction_guidelines: {
      momentum: 'Zeta follows up proactively unless told to stop.',
      navigation:
        'Zeta should use its visual dashboard reference files to guide users to relevant UI sections and explain where features are located.',
    },
  };
}


// Build the final combined instructions text once we know assistantId/threadId
function buildCombinedInstructions(params: {
  userSystem?: string | null;
  projectName: string;
  assistantType: string;
  modelId: string;
  projectId: string;
  assistantId: string;
  threadId: string;
  preferredUserName?: string | null;
  vision?: string | null;
}) {
  const createdAt = new Date().toISOString();
  const base = baseSelfKnowledgeJSON();

  const profile = {
    project_name: params.projectName,
    project_id: params.projectId,
    assistant_type: params.assistantType,
    model_id: params.modelId,
    assistant_id: params.assistantId,
    thread_id: params.threadId,
    preferred_user_name: params.preferredUserName || null,
    vision: params.vision || null,
    created_at: createdAt,
  };

  const json = JSON.stringify({ ...base, profile }, null, 2);

  const userText = params.userSystem?.trim()
    ? params.userSystem.trim() + '\n\n'
    : '';

  return `${userText}${corePersonaText()}

---
Dashboard Map & Self-Knowledge (machine-readable JSON)
\`\`\`json
${json}
\`\`\`
`;
}

export async function POST(req: Request) {
  try {
    const {
      message = 'Hello Zeta, let’s begin.',
      projectId,
      modelId,
      projectName,
      assistantType,
      systemInstructions,
      preferredUserName,
      vision,
    } = await req.json();

    if (!process.env.OPENAI_KEY) {
      return NextResponse.json({ error: 'OPENAI_KEY is missing' }, { status: 500 });
    }
    if (!projectId || !modelId || !projectName || !assistantType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const model = AVAILABLE_MODELS.find((m: any) => m.id === modelId);
    if (!model) return NextResponse.json({ error: 'Invalid modelId' }, { status: 400 });

    const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });
    const preferredNameToSave: string | null = preferredUserName?.trim() || null;

    if (model.provider !== 'openai') {
      return NextResponse.json({
        reply: `🧪 Placeholder: ${model.label} support coming soon.`,
        threadId: null,
      });
    }

    // 1) Create Assistant with temporary/core instructions (no IDs yet)
    const initialInstructions = systemInstructions
      ? `${systemInstructions}\n\n${corePersonaText()}`
      : corePersonaText();

    const assistant = await openai.beta.assistants.create({
      name: `${projectName} (${assistantType})`,
      instructions: initialInstructions,
      model: modelId === 'gpt-4o' ? 'gpt-4o' : 'gpt-4',
    });
    const assistantId = assistant.id;

    // 2) Create thread
    const thread = await openai.beta.threads.create();
    const threadId = thread.id;

    // 3) Now that we have IDs, update the assistant with the full combined instructions (includes JSON profile)
    const combined = buildCombinedInstructions({
      userSystem: systemInstructions,
      projectName,
      assistantType,
      modelId,
      projectId,
      assistantId,
      threadId,
      preferredUserName: preferredNameToSave,
      vision: vision || null,
    });

    await openai.beta.assistants.update(assistantId, {
      instructions: combined,
      // name unchanged
    });

    // 4) Insert thread row
    {
      const { error } = await supabaseAdmin.from('threads').insert({
        project_id: projectId,
        thread_id: threadId,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 5) Update project (NO zeta_self_knowledge persistence)
    {
      const { error } = await supabaseAdmin
        .from('user_projects')
        .update({
          assistant_id: assistantId,
          preferred_user_name: preferredNameToSave,
          vision: vision || null,
          thread_id: threadId,
        })
        .eq('id', projectId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 6) Ensure mainframe_info row exists & set preferred name (keyed by id)
    {
      const now = new Date().toISOString();
      const { data: mfiRow } = await supabaseAdmin
        .from('mainframe_info')
        .select('id')
        .eq('id', projectId)
        .maybeSingle();

      if (mfiRow?.id) {
        await supabaseAdmin
          .from('mainframe_info')
          .update({ preferred_user_name: preferredNameToSave, updated_at: now })
          .eq('id', projectId);
      } else {
        await supabaseAdmin
          .from('mainframe_info')
          .insert({ id: projectId, preferred_user_name: preferredNameToSave, created_at: now });
      }
    }

    // 7) Seed goals (best-effort)
    {
      const { error } = await supabaseAdmin.from('goals').insert([
        {
          project_id: projectId,
          goal_type: 'short_term',
          description: 'Define immediate tasks and priorities for Zeta.',
        },
        {
          project_id: projectId,
          goal_type: 'long_term',
          description: 'Outline long-term objectives to maximize Zeta’s impact.',
        },
      ]);
      if (error) console.warn('seed goals warning:', error.message);
    }

    // 8) Seed default Tasks (best-effort)
    {
      const mentionName = (preferredNameToSave || 'you').replace(/^@/, '');
      const userDefaults = [
        'confirm vision of project',
        'create short-term goals',
        'create long-term goals',
      ];
      const zetaDefaults = [
        `assist @${mentionName} with setup`,
        `Obtain possible files from @${mentionName}`,
        'consolidate assist process',
      ];

      const { data: existingTasks, error: fetchErr } = await supabaseAdmin
        .from('tasks')
        .select('task_type')
        .eq('project_id', projectId);

      if (fetchErr) {
        console.warn('⚠️ Error checking existing tasks:', fetchErr.message);
      } else {
        const taskTypes = new Set((existingTasks ?? []).map((t: any) => t.task_type));
        const tasksToInsert: any[] = [];
        if (!taskTypes.has('user'))
          tasksToInsert.push({ project_id: projectId, task_type: 'user', task_content: userDefaults });
        if (!taskTypes.has('zeta'))
          tasksToInsert.push({ project_id: projectId, task_type: 'zeta', task_content: zetaDefaults });
        if (tasksToInsert.length) {
          const { error: insertErr } = await supabaseAdmin.from('tasks').insert(tasksToInsert);
          if (insertErr) console.warn('⚠️ Task insert error:', insertErr.message);
        }
      }
    }

    // 9) Initial messages
    if (!message?.trim()) {
      return NextResponse.json({ error: 'Missing initial message' }, { status: 400 });
    }
    await openai.beta.threads.messages.create(threadId, { role: 'user', content: message });

    const userName = preferredNameToSave || 'there';
    await openai.beta.threads.messages.create(threadId, {
      role: 'assistant',
      content:
        `Hey ${userName}! I'm Zeta — your AI assistant for this project 🤖
If you'd prefer to call me something else, just let me know and I’ll go by that name from now on.
So… what are we working on today?`,
    });

    // 10) Run assistant & poll
    const run = await openai.beta.threads.runs.create(threadId, { assistant_id: assistantId });
    while (true) {
      const r = await openai.beta.threads.runs.retrieve(run.id, { thread_id: threadId });
      if (['completed', 'failed', 'cancelled', 'expired'].includes(r.status)) break;
      await new Promise((res) => setTimeout(res, 900));
    }

    // 11) Get reply
    const msgs = await openai.beta.threads.messages.list(threadId);
    const assistantMsg = msgs.data.find((m: any) => m.role === 'assistant');
    const reply = extractAssistantText(assistantMsg) ?? '⚠️ No reply.';

    return NextResponse.json({ reply, threadId });
  } catch (err: any) {
    console.error('❌ createAssistant error:', err);
    return NextResponse.json({ error: err?.message ?? 'Unknown error' }, { status: 500 });
  }
}