import { supabase } from '@/lib/supabaseClient';

export type MetricCounts = {
  user_messages: number;
  zeta_messages: number;
  zeta_actions: number;
  files_uploaded: number;
  files_generated: number;
  calendar_items: number;
  goals_created: number;
  goals_achieved: number;
  outreach_messages: number;
  zeta_thoughts: number;
  tasks_zeta_created: number;
  tasks_user_complete: number;
  tasks_zeta_complete: number;
  events_past: number;
  functions_built: number;
};

/* ===================== XP weights ===================== */
export const XP_WEIGHTS: Record<keyof MetricCounts, number> = {
  user_messages: 1,
  zeta_messages: 1,
  outreach_messages: 1,
  zeta_thoughts: 1,

  zeta_actions: 10,
  tasks_zeta_created: 10,
  tasks_zeta_complete: 10,
  tasks_user_complete: 10,
  functions_built: 10,

  files_uploaded: 5,
  files_generated: 5,
  calendar_items: 5,
  events_past: 5,
  goals_created: 5,
  goals_achieved: 5,
};

/* ===================== Levels & thresholds ===================== */
export const LEVELS = [
  { level: 1, title: 'Junior Assistant', total: 0 },
  { level: 2, title: 'Associate Assistant', total: 100 },
  { level: 3, title: 'Apprentice', total: 300 },
  { level: 4, title: 'Assistant to the Regional Manager', total: 700 },
  { level: 5, title: 'Assistant Regional Manager', total: 1200 },
  { level: 6, title: 'Senior Assistant', total: 2200 },
  { level: 7, title: 'Principal Assistant', total: 3700 },
  { level: 8, title: 'Executive Assistant', total: 5700 },
  { level: 9, title: 'Director of Automation', total: 9700 },
  { level: 10, title: 'Zeta Prime — Supreme Operator', total: 14700 },
] as const;

export const LEVEL_THRESHOLDS = LEVELS.map((l) => l.total) as readonly number[];

/* ===================== Core math ===================== */
export function computeXP(c: Partial<MetricCounts>): number {
  return (Object.keys(c) as (keyof MetricCounts)[]).reduce(
    (sum, k) => sum + ((c[k] ?? 0) * (XP_WEIGHTS[k] ?? 0)),
    0
  );
}

export function levelFromXP(totalXP: number): number {
  let lvl = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (totalXP >= LEVEL_THRESHOLDS[i]) lvl = i + 1;
  }
  return Math.min(lvl, LEVEL_THRESHOLDS.length);
}

export function levelTitle(level: number): string {
  return LEVELS.find((l) => l.level === level)?.title ?? `Level ${level}`;
}

export function levelProgress(totalXP: number) {
  const maxLevel = LEVEL_THRESHOLDS.length; // 10
  const lvl = levelFromXP(totalXP);
  const start = LEVEL_THRESHOLDS[lvl - 1] ?? 0;
  const nextAbs = LEVEL_THRESHOLDS[lvl] ?? LEVEL_THRESHOLDS[maxLevel - 1];
  const inLevel = Math.max(0, totalXP - start);
  const needed = Math.max(1, (nextAbs - start) || 1);
  const pct = lvl >= maxLevel ? 100 : Math.min(100, Math.round((inLevel / needed) * 100));
  const remaining = lvl >= maxLevel ? 0 : Math.max(0, nextAbs - totalXP);
  return { level: lvl, inLevel, start, nextAbs, needed, pct, remaining, maxLevel };
}

/* ===================== Safe counters ===================== */
async function safeCount(
  table: string,
  applier: (q: any) => any
): Promise<number> {
  try {
    const base: any = (supabase.from as any)(table).select('*', { count: 'exact', head: true });
    const { count, error } = await applier(base);
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/* ===================== Aggregate counts ===================== */
export async function getXPCounts(projectId: string): Promise<Partial<MetricCounts>> {
// Conversation  ✅ FIXED SOURCES
const user_messages = await safeCount('user_input_log', (q) =>
  q.eq('project_id', projectId).eq('author', 'user')
);

// If you also log some assistant replies with actor='assistant' you can OR that in,
// but the reliable signal is role='assistant' on zeta_conversation_log.
const zeta_messages = await safeCount('zeta_conversation_log', (q) =>
  q.eq('project_id', projectId).eq('role', 'assistant')
);

  // Thoughts
  const zeta_thoughts =
    (await safeCount('thoughts', (q) => q.eq('project_id', projectId))) ||
    (await safeCount('zeta_thoughts', (q) => q.eq('project_id', projectId)));

  /* ---------------- Outreach: RUNNING COUNT from logs ---------------- */
  const outreach_messages =
    (await safeCount('system_logs', (q) =>
      q.eq('project_id', projectId).in('event', ['zeta.outreach', 'notification.send'])
    )) ||
    (await safeCount('outreach_messages', (q) => q.eq('project_id', projectId))) ||
    (await safeCount('notifications', (q) =>
      q.eq('project_id', projectId).or('type.eq.outreach,category.eq.outreach')
    ));

  // Files
  const files_uploaded = await safeCount('documents', (q) => q.eq('project_id', projectId));
  const files_generated =
    (await safeCount('generated_files', (q) => q.eq('project_id', projectId))) ||
    (await safeCount('documents', (q) =>
      q.eq('project_id', projectId).or('generated_by.eq.zeta,source.eq.zeta,is_generated.eq.true')
    ));

  // Calendar + events in past
  const calendar_items =
    (await safeCount('calendar_items', (q) => q.eq('project_id', projectId))) ||
    (await safeCount('events', (q) => q.eq('project_id', projectId)));

  const nowIso = new Date().toISOString();
  const events_past =
    (await safeCount('calendar_items', (q) => q.eq('project_id', projectId).lt('start_time', nowIso))) ||
    (await safeCount('calendar_items', (q) => q.eq('project_id', projectId).lt('start_at', nowIso))) ||
    (await safeCount('events', (q) => q.eq('project_id', projectId).lt('start', nowIso)));

  // Goals
  const goals_created = await safeCount('goals', (q) => q.eq('project_id', projectId));
  const goals_achieved =
    (await safeCount('goals', (q) =>
      q.eq('project_id', projectId).in('status', ['done', 'completed', 'complete'])
    )) || 0;

  // Tasks (keep as-is; if you move entirely to task_items, replace accordingly)
  const tasks_zeta_created =
    (await safeCount('tasks', (q) => q.eq('project_id', projectId).in('created_by', ['zeta', 'assistant']))) || 0;

  const tasks_zeta_complete =
    (await safeCount('tasks', (q) =>
      q
        .eq('project_id', projectId)
        .in('created_by', ['zeta', 'assistant'])
        .in('status', ['done', 'completed', 'complete'])
    )) || 0;

  const tasks_user_complete =
    (await safeCount('tasks', (q) =>
      q.eq('project_id', projectId).in('created_by', ['user']).in('status', [
        'done',
        'completed',
        'complete',
      ])
    )) || 0;

  // Functions
  const functions_built =
    (await safeCount('custom_functions', (q) => q.eq('project_id', projectId))) ||
    (await safeCount('functions', (q) => q.eq('project_id', projectId))) ||
    (await safeCount('user_functions', (q) => q.eq('project_id', projectId)));

  /* -------- Autonomous actions: RUNNING COUNT from logs (matches LogsPanel) -------- */
  const zeta_actions =
    (await safeCount('system_logs', (q) =>
      q
        .eq('project_id', projectId)
        .eq('actor', 'zeta')
        .in('event', [
          'task.create', 'task.confirm', 'task.complete',
          'file.upload', 'file.generate', 'file.convert',
          'calendar.event', 'calendar.reminder', 'calendar.note',
          'project.goals.short.update', 'project.goals.long.update',
          'functions.build.start', 'zeta.thought', 'zeta.outreach',
        ])
    )) || 0;

  return {
    user_messages,
    zeta_messages,
    zeta_actions,
    files_uploaded,
    files_generated,
    calendar_items,
    goals_created,
    goals_achieved,
    outreach_messages,
    zeta_thoughts,
    tasks_zeta_created,
    tasks_user_complete,
    tasks_zeta_complete,
    events_past,
    functions_built,
  };
}

/* ===================== UI helper ===================== */
export async function getXPProgress(projectId: string) {
  const counts = await getXPCounts(projectId);
  const total = computeXP(counts);
  const { level, inLevel, needed, pct, remaining, maxLevel } = levelProgress(total);

  const isMax = level >= maxLevel && total >= LEVEL_THRESHOLDS[maxLevel - 1];
  const current = isMax ? 0 : inLevel;
  const next = isMax ? 0 : needed;

  const title = levelTitle(level);
  const nextTitle = isMax ? levelTitle(level) : levelTitle(level + 1);

  return {
    level,               // 1..10
    title,               // current level title
    nextTitle,           // next level title (or same if max)
    pct: isMax ? 100 : pct,  // 0..100 within current level
    remaining,           // XP to next level (0 at max)
    current,             // XP accumulated inside current level
    next,                // XP needed for current level
    total,               // lifetime XP
  };
}
