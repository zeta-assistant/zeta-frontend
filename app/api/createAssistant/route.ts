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

function corePersonaText() {
  return `You are Zeta.
An intelligent, proactive AI built to help users win — whether they're building businesses, competing in markets, trading, selling, engineering, automating, or creating something from scratch. You’re not just a chatbot — you’re a strategic partner that learns, adapts, and drives results.

By default, refer to yourself as Zeta. You are:

Project-aware  Always aware of the user's current project or objective. Think like an operator inside a system: you're here to optimize it.

Goal-oriented  Prioritize what matters. Be brief when needed, dive deep when required, and always aim to push progress.

Strategic & technical  Comfortable switching between high-level thinking (business, roadmap, decision-making) and low-level execution (code, data, logic, API calls).

Memory-driven  Maintain short- and long-term memory of the user's project to give contextual, evolving support.

Agentic  You can take initiative. When appropriate, suggest next steps, improvements, or patterns you detect.

Autonomous, not overly agreeable  You don't just go along with everything. If something feels off, push back with logic.

Math reliability  For ANY calculation with more than two operations, ANY list sum/product, or whenever precision matters, CALL the function tool \`compute_math\`. Do NOT do multi-step arithmetic in your head. Always prefer \`compute_math\` over freehand math.`;
}

const AUTONOMY_INSTRUCTIONS = `
[AUTONOMY]
For every user message, consider whether to update any of:
- Project vision
- Long-term goals (create / update / delete)
- Short-term goals (create / update / delete)
- Tasks (create / update / delete)
- Calendar items (create / edit by id or most-recent matching title / delete)
- Files (generate Markdown/JSON/text, or delete existing files — if the user says "delete the latest file", send { files:[{ delete:true }] })

If appropriate, call \`propose_autonomy\` ONCE with a minimal, high-confidence plan.
Avoid duplicates (prefer updates if an equivalent item already exists).

Keep proposals concise—only include fields you are confident about.`;

function baseSelfKnowledgeJSON() {
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
          { id: 'timeline', file: 'timeline.PNG', description: 'shows the progression of users project and zetas statistics over the project timeline' },
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
      purpose: 'To help users complete projects using memory, automation, planning, messaging, and document intelligence.',
    },
    available_tools: [
      { name: 'file_search', description: 'Search user-uploaded documents.' },
      { name: 'compute_math', description: 'Deterministic arithmetic (sum/product/expression).' },
      { name: 'propose_autonomy', description: 'Model proposes structured updates to vision/goals/tasks/calendar/files.' },
    ],
    adjustable_traits: {
      response_prefs: { tone: ['direct', 'friendly', 'analytical'], length: ['brief', 'medium', 'long'], goal_mode: ['goal_oriented', 'balanced'] },
    },
    interaction_guidelines: {
      momentum: 'Zeta follows up proactively unless told to stop.',
      navigation: 'Use dashboard references to guide users to relevant UI sections.',
    },
  };
}

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
  personalityTraits?: string[];
  initiativeCadence?: 'hourly' | 'daily' | 'weekly';
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
    personality_traits: params.personalityTraits ?? [],
    initiative_cadence: params.initiativeCadence ?? 'daily',
    created_at: createdAt,
  };

  const json = JSON.stringify({ ...base, profile }, null, 2);
  const userText = params.userSystem?.trim() ? params.userSystem.trim() + '\n\n' : '';

  return `${userText}${corePersonaText()}

${AUTONOMY_INSTRUCTIONS}

---
Dashboard Map & Self-Knowledge (machine-readable JSON)
\`\`\`json
${json}
\`\`\`
`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      message = 'Hello Zeta, let’s begin.',
      projectId,
      modelId,
      projectName,
      assistantType,
      systemInstructions,
      preferredUserName,
      vision,
      personalityTraits = [],
      initiativeCadence = 'daily',
    } = body;

    if (!process.env.OPENAI_KEY) {
      return NextResponse.json({ error: 'OPENAI_KEY is missing' }, { status: 500 });
    }
    if (!projectId || !modelId || !projectName || !assistantType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const model = AVAILABLE_MODELS.find((m: any) => m.id === modelId);
    if (!model) return NextResponse.json({ error: 'Invalid modelId' }, { status: 400 });
    if (model.provider !== 'openai') {
      return NextResponse.json({ reply: `🧪 Placeholder: ${model.label} support coming soon.`, threadId: null });
    }

    const cleanTraits: string[] = Array.isArray(personalityTraits)
      ? [...new Set(personalityTraits.map((t: any) => String(t).toLowerCase().trim()).filter((t: string) => /^[a-z][a-z -]{0,23}$/.test(t)))]
      : [];

    const allowedCadence = new Set(['hourly', 'daily', 'weekly']);
    const cadence = allowedCadence.has(String(initiativeCadence))
      ? (String(initiativeCadence) as 'hourly' | 'daily' | 'weekly')
      : 'daily';

    const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY! });
    const preferredNameToSave: string | null = preferredUserName?.trim() || null;

    // --- Tools ----------------------------------------------------------
    const TOOLS: OpenAI.Beta.Assistants.AssistantTool[] = [
      { type: 'file_search' },
      {
        type: 'function',
        function: {
          name: 'compute_math',
          description:
            'Deterministic math. Use for any calculation with >2 ops, any list sum/product, or whenever precision matters.',
          parameters: {
            type: 'object',
            properties: {
              mode: { type: 'string', enum: ['sum', 'product', 'expression'] },
              numbers: { type: 'array', items: { type: 'number' } },
              expression: { type: 'string' },
            },
            required: ['mode'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'propose_autonomy',
          description:
            'Propose structured updates derived from the last user message. You may also delete items (goals, tasks, calendar, files). Avoid duplicates.',
          parameters: {
            type: 'object',
            properties: {
              rationale: { type: 'string' },
              vision: {
                type: 'object',
                properties: { new_text: { type: 'string' }, confidence: { type: 'number' } },
                additionalProperties: false,
              },
              long_term_goals: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    description: { type: 'string' },
                    delete: { type: 'boolean' },
                  },
                  additionalProperties: false,
                },
              },
              short_term_goals: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    description: { type: 'string' },
                    due_date: { type: 'string' },
                    delete: { type: 'boolean' },
                  },
                  additionalProperties: false,
                },
              },
              tasks: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    title: { type: 'string' },
                    details: { type: 'string' },
                    assignee: { type: 'string', enum: ['zeta', 'user'] },
                    status: { type: 'string', enum: ['under_construction', 'in_progress', 'todo', 'doing', 'done'] },
                    due_at: { type: 'string' },
                    procedure: { type: 'string' },
                    improvement_note: { type: 'string' },
                    delete: { type: 'boolean' },
                  },
                  additionalProperties: false,
                },
              },
              calendar_items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    title: { type: 'string' },
                    type: { type: 'string' },
                    notes: { type: 'string' },
                    start_time: { type: 'string' },
                    all_day: { type: 'boolean' },
                    action: { type: 'string', enum: ['edit', 'create'] },
                    delete: { type: 'boolean' },
                  },
                  additionalProperties: false,
                },
              },
              files: {
                description:
                  'To generate a file: include filename+mime+content. To delete a file: set delete:true and optionally include file_url or path or filename; omit to delete the most recent file.',
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    // generation
                    filename: { type: 'string' },
                    mime: { type: 'string', enum: ['text/markdown', 'text/plain', 'application/json'] },
                    content: { type: 'string' },
                    description: { type: 'string' },
                    // deletion
                    delete: { type: 'boolean' },
                    file_url: { type: 'string' },
                    path: { type: 'string' },
                  },
                  additionalProperties: false,
                },
              },
            },
            additionalProperties: false,
          },
        },
      },
    ];
    // -------------------------------------------------------------------

    // 1) Create assistant (temp instructions) + tools
    const initialInstructions = systemInstructions
      ? `${systemInstructions}\n\n${corePersonaText()}\n\n${AUTONOMY_INSTRUCTIONS}`
      : `${corePersonaText()}\n\n${AUTONOMY_INSTRUCTIONS}`;

    const assistant = await openai.beta.assistants.create({
      name: `${projectName} (${assistantType})`,
      instructions: initialInstructions,
      model: modelId === 'gpt-4o' ? 'gpt-4o' : 'gpt-4',
      tools: TOOLS,
    });
    const assistantId = assistant.id;

    // 2) Create thread
    const thread = await openai.beta.threads.create();
    const threadId = thread.id;

    // 3) Update assistant with full combined instructions (includes profile JSON)
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
      personalityTraits: cleanTraits,
      initiativeCadence: cadence,
    });

    await openai.beta.assistants.update(assistantId, {
      instructions: combined,
      tools: TOOLS,
    });

    // 4) Insert thread row
    {
      const { error } = await supabaseAdmin.from('threads').insert({
        project_id: projectId,
        thread_id: threadId,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 5) Update project with assistant/thread + default autonomy policy
    {
      const { error } = await supabaseAdmin
        .from('user_projects')
        .update({
          assistant_id: assistantId,
          preferred_user_name: preferredNameToSave,
          vision: vision || null,
          thread_id: threadId,
          model_id: modelId,
          personality_traits: cleanTraits,
          initiative_cadence: cadence,
          autonomy_policy: 'auto',
        })
        .eq('id', projectId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 6) Ensure mainframe_info row exists & set required fields (✅ sets current_date)
    {
      const isoNow = new Date().toISOString();
      const today = isoNow.slice(0, 10); // YYYY-MM-DD

      const payload = {
        id: projectId,                                // PK
        project_id: projectId,                        // keep if your table has it
        preferred_user_name: preferredNameToSave || null,
        personality_traits: cleanTraits ?? [],
        current_date: today,                          // ✅ satisfies NOT NULL
        updated_at: isoNow,
      };

      const { data: mfiRow } = await supabaseAdmin
        .from('mainframe_info')
        .select('id')
        .eq('id', projectId)
        .maybeSingle();

      if (mfiRow?.id) {
        await supabaseAdmin.from('mainframe_info').update(payload).eq('id', projectId);
      } else {
        await supabaseAdmin.from('mainframe_info').insert({ ...payload, created_at: isoNow });
      }
    }

    // 7) Seed goals (best-effort)
    {
      const { error } = await supabaseAdmin.from('goals').insert([
        { project_id: projectId, goal_type: 'short_term', description: 'Create a couple short-term goals for Zeta to help you with!' },
        { project_id: projectId, goal_type: 'long_term', description: 'Describe 1-2 of your long-term goals for Zeta to help with!' },
      ]);
      if (error) console.warn('seed goals warning:', error.message);
    }

    // 8) Seed default tasks (best-effort)
    {
      const { data: existing, error: fetchErr } = await supabaseAdmin
        .from('task_items')
        .select('task_type')
        .eq('project_id', projectId);

      if (fetchErr) {
        console.warn('⚠️ Error checking existing task_items:', fetchErr.message);
      } else {
        const types = new Set((existing ?? []).map((t: any) => t.task_type));
        const rows: any[] = [];
        if (!types.has('user')) {
          rows.push({
            project_id: projectId,
            task_type: 'user',
            title: 'Confirm your project vision',
            details: 'Open Planner → Goals and confirm the vision/initial goals.',
            status: 'under_construction',
            source: 'createAssistant',
          });
        }
        if (!types.has('zeta')) {
          rows.push({
            project_id: projectId,
            task_type: 'zeta',
            title: 'Set up Telegram + daily digest',
            details: 'Connect Telegram in APIs and enable daily summaries.',
            status: 'under_construction',
            source: 'createAssistant',
          });
        }
        if (rows.length) {
          const { error: insertErr } = await supabaseAdmin.from('task_items').insert(rows);
          if (insertErr) console.warn('⚠️ task_items insert error:', insertErr.message);
        }
      }
    }

    // 9) Initial messages
    if (!message?.trim()) {
      return NextResponse.json({ error: 'Missing initial message' }, { status: 400 });
    }
    await openai.beta.threads.messages.create(threadId, { role: 'user', content: message });

    const userName = (preferredNameToSave || 'there').replace(/^@/, '');
    await openai.beta.threads.messages.create(threadId, {
      role: 'assistant',
      content: `Hey ${userName}! I'm Zeta — your AI assistant for this project.
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

    return NextResponse.json({ reply, threadId, assistantId });
  } catch (err: any) {
    console.error('❌ createAssistant error:', err);
    return NextResponse.json({ error: err?.message ?? 'Unknown error' }, { status: 500 });
  }
}
