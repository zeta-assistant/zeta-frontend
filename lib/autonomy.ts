// lib/autonomy.ts
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/* ───────────────────────── TYPES (aligned to your schema) ───────────────────────── */
export type Plan = {
  rationale?: string;

  vision?: { new_text?: string; confidence?: number };

  long_term_goals?: Array<{
    id?: string;                 // if present ⇒ update/delete this row
    description?: string;        // used for create OR delete-by-description
    delete?: boolean;            // NEW: when true → delete (by id preferred)
  }>;

  short_term_goals?: Array<{
    id?: string;
    description?: string;
    delete?: boolean;            // NEW
    due_date?: string;           // optional (future use)
  }>;

  tasks?: Array<{
    id?: string;
    title: string;               // task_items.title
    details?: string;            // task_items.details
    assignee?: 'zeta' | 'user';  // maps to task_items.task_type
    status?: 'under_construction' | 'in_progress' | 'todo' | 'doing' | 'done';
    due_at?: string;             // ISO8601 -> task_items.due_at (timestamptz)
    procedure?: string;          // task_items.procedure
    improvement_note?: string;   // task_items.improvement_note
  }>;

  calendar_items?: Array<{
    id?: string;
    title: string;               // calendar_items.title
    type?: string;               // calendar_items.type (e.g., 'event' | 'reminder')
    notes?: string;              // -> calendar_items.details
    start_time?: string;         // ISO8601 (used to derive date + time columns)
    all_day?: boolean;           // if true, time is null
  }>;

  files?: Array<{
    filename: string;
    mime: 'text/markdown' | 'text/plain' | 'application/json';
    content: string;
    description?: string;
  }>;
};

/* ───────────────────────────── HELPERS ───────────────────────────── */
function slug(s: string) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

/** Insert an event row into public.autonomy_events.
 * Columns in your DB: project_id, category, action, payload, applied, created_at
 */
export async function logAutonomy(
  projectId: string,
  category: 'vision' | 'long_goals' | 'short_goals' | 'tasks' | 'calendar' | 'files',
  action: 'create' | 'update' | 'delete' | 'generate' | 'preview',
  payload: any,
  applied: boolean
) {
  const { error } = await supabaseAdmin.from('autonomy_events').insert({
    project_id: projectId,
    category,
    action,
    payload,
    applied,
  });
  if (error) console.warn('⚠️ logAutonomy insert failed:', error.message);
}

/** ISO8601 → { date: 'YYYY-MM-DD', time: 'HH:MM:SS' | null } */
function splitISOToDateTime(
  iso?: string,
  allDay?: boolean
): { date: string | null; time: string | null } {
  if (!iso) return { date: null, time: null };
  const tIndex = iso.indexOf('T');
  if (tIndex === -1) {
    const d = iso.slice(0, 10);
    return { date: /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null, time: null };
  }
  const date = iso.substring(0, 10);
  if (allDay) return { date, time: null };
  const rest = iso.substring(tIndex + 1);
  const cut = rest.search(/[Z+ -]/);
  const raw = cut === -1 ? rest : rest.substring(0, cut);
  const [hh = '00', mm = '00', ssRaw = '00'] = raw.split(':');
  const ss = ssRaw.slice(0, 2);
  return { date, time: `${hh.padStart(2, '0')}:${mm.padStart(2, '0')}:${ss.padStart(2, '0')}` };
}

async function saveGeneratedFile(
  projectId: string,
  f: { filename: string; mime: string; content: string }
) {
  const path = `projects/${projectId}/ai/${Date.now()}-${slug(f.filename)}`;
  const blob = new Blob([f.content], { type: f.mime || 'text/plain' });

  const { error: upErr } = await supabaseAdmin.storage
    .from('project-docs')
    .upload(path, blob, { upsert: false });
  if (upErr) throw upErr;

  const { data: pub } = await supabaseAdmin.storage
    .from('project-docs')
    .getPublicUrl(path);

  const file_url = pub?.publicUrl || path;

  const { error: insErr } = await supabaseAdmin.from('documents').insert({
    project_id: projectId,
    file_name: f.filename,
    file_url,
  });
  if (insErr) throw insErr;

  return { file_url };
}

/* ───────────────────────────── APPLY PLAN ─────────────────────────────
 * autonomyPolicy:
 *  - 'off'    : ignore (no logs)
 *  - 'shadow' : log preview only (no writes)
 *  - 'ask'    : log + write
 *  - 'auto'   : log + write immediately
 */
export async function applyAutonomyPlan(
  projectId: string,
  plan: Plan,
  autonomyPolicy: 'off' | 'shadow' | 'ask' | 'auto' = 'shadow'
) {
  const willApply = autonomyPolicy === 'auto' || autonomyPolicy === 'ask';
  if (autonomyPolicy === 'off') return;

  /* VISION → user_projects.vision */
  if (plan.vision?.new_text) {
    await logAutonomy(
      projectId,
      'vision',
      willApply ? 'update' : 'preview',
      plan.vision,
      !!willApply
    );
    if (willApply) {
      const { error } = await supabaseAdmin
        .from('user_projects')
        .update({ vision: plan.vision.new_text })
        .eq('id', projectId);
      if (error) console.warn('⚠️ vision update failed:', error.message);
    }
  }

  /* LONG-TERM GOALS → goals (goal_type='long_term') */
  for (const g of plan.long_term_goals ?? []) {
    const isDelete = !!g.delete;
    const description = g.description ?? '';
    const payload = { id: g.id, description, goal_type: 'long_term' as const, delete: isDelete };

    if (isDelete) {
      await logAutonomy(projectId, 'long_goals', 'delete', payload, !!willApply);
      if (!willApply) continue;

      if (g.id) {
        const { error } = await supabaseAdmin
          .from('goals')
          .delete()
          .eq('id', g.id)
          .eq('project_id', projectId)
          .eq('goal_type', 'long_term');
        if (error) console.warn('⚠️ long goal delete by id failed:', error.message);
      } else if (description) {
        const { error } = await supabaseAdmin
          .from('goals')
          .delete()
          .eq('project_id', projectId)
          .eq('goal_type', 'long_term')
          .eq('description', description);
        if (error) console.warn('⚠️ long goal delete by description failed:', error.message);
      }
      continue;
    }

    // create/update
    if (g.id) {
      await logAutonomy(projectId, 'long_goals', 'update', payload, !!willApply);
      if (!willApply) continue;
      const { error } = await supabaseAdmin
        .from('goals')
        .update({ goal_type: 'long_term', description })
        .eq('id', g.id)
        .eq('project_id', projectId);
      if (error) console.warn('⚠️ long goal update failed:', error.message);
    } else if (description) {
      await logAutonomy(projectId, 'long_goals', 'create', payload, !!willApply);
      if (!willApply) continue;

      // de-dupe on (project_id, goal_type, description)
      const { data: existing } = await supabaseAdmin
        .from('goals')
        .select('id')
        .eq('project_id', projectId)
        .eq('goal_type', 'long_term')
        .eq('description', description)
        .maybeSingle();
      if (!existing?.id) {
        const { error } = await supabaseAdmin
          .from('goals')
          .insert({ project_id: projectId, goal_type: 'long_term', description });
        if (error) console.warn('⚠️ long goal insert failed:', error.message);
      }
    }
  }

  /* SHORT-TERM GOALS → goals (goal_type='short_term') */
  for (const g of plan.short_term_goals ?? []) {
    const isDelete = !!g.delete;
    const description = g.description ?? '';
    const payload = { id: g.id, description, goal_type: 'short_term' as const, delete: isDelete };

    if (isDelete) {
      await logAutonomy(projectId, 'short_goals', 'delete', payload, !!willApply);
      if (!willApply) continue;

      if (g.id) {
        const { error } = await supabaseAdmin
          .from('goals')
          .delete()
          .eq('id', g.id)
          .eq('project_id', projectId)
          .eq('goal_type', 'short_term');
        if (error) console.warn('⚠️ short goal delete by id failed:', error.message);
      } else if (description) {
        const { error } = await supabaseAdmin
          .from('goals')
          .delete()
          .eq('project_id', projectId)
          .eq('goal_type', 'short_term')
          .eq('description', description);
        if (error) console.warn('⚠️ short goal delete by description failed:', error.message);
      }
      continue;
    }

    // create/update
    if (g.id) {
      await logAutonomy(projectId, 'short_goals', 'update', payload, !!willApply);
      if (!willApply) continue;
      const { error } = await supabaseAdmin
        .from('goals')
        .update({ goal_type: 'short_term', description })
        .eq('id', g.id)
        .eq('project_id', projectId);
      if (error) console.warn('⚠️ short goal update failed:', error.message);
    } else if (description) {
      await logAutonomy(projectId, 'short_goals', 'create', payload, !!willApply);
      if (!willApply) continue;

      const { data: existing } = await supabaseAdmin
        .from('goals')
        .select('id')
        .eq('project_id', projectId)
        .eq('goal_type', 'short_term')
        .eq('description', description)
        .maybeSingle();
      if (!existing?.id) {
        const { error } = await supabaseAdmin
          .from('goals')
          .insert({ project_id: projectId, goal_type: 'short_term', description });
        if (error) console.warn('⚠️ short goal insert failed:', error.message);
      }
    }
  }

  /* TASKS → task_items (unchanged) */
  for (const t of plan.tasks ?? []) {
    const row = {
      project_id: projectId,
      task_type: t.assignee ?? 'zeta',
      title: t.title,
      details: t.details ?? null,
      procedure: t.procedure ?? null,
      status: t.status ?? 'under_construction',
      due_at: t.due_at ?? null,
      improvement_note: t.improvement_note ?? null,
      source: 'autonomy',
    };

    await logAutonomy(projectId, 'tasks', t.id ? 'update' : 'create', { ...t, row }, !!willApply);
    if (!willApply) continue;

    if (t.id) {
      const { error } = await supabaseAdmin
        .from('task_items')
        .update(row)
        .eq('id', t.id)
        .eq('project_id', projectId);
      if (error) console.warn('⚠️ task update failed:', error.message);
    } else {
      const { data: existing } = await supabaseAdmin
        .from('task_items')
        .select('id')
        .eq('project_id', projectId)
        .eq('task_type', row.task_type)
        .eq('title', row.title)
        .limit(1);
      if (!existing?.length) {
        const { error } = await supabaseAdmin.from('task_items').insert(row);
        if (error) console.warn('⚠️ task insert failed:', error.message);
      }
    }
  }

  /* CALENDAR → calendar_items (unchanged) */
  for (const c of plan.calendar_items ?? []) {
    const { date, time } = splitISOToDateTime(c.start_time, c.all_day);
    const row = {
      project_id: projectId,
      type: c.type || 'event',
      title: c.title,
      details: c.notes ?? null,
      date,
      time,
      notified: false,
    };

    await logAutonomy(projectId, 'calendar', c.id ? 'update' : 'create', { ...c, row }, !!willApply);
    if (!willApply) continue;

    if (c.id) {
      const { error } = await supabaseAdmin
        .from('calendar_items')
        .update(row)
        .eq('id', c.id)
        .eq('project_id', projectId);
      if (error) console.warn('⚠️ calendar update failed:', error.message);
    } else {
      let q = supabaseAdmin
        .from('calendar_items')
        .select('id')
        .eq('project_id', projectId)
        .eq('title', row.title)
        .eq('date', row.date);
      if (row.time) q = q.eq('time', row.time);
      const { data: existing } = await q;
      if (!existing?.length) {
        const { error } = await supabaseAdmin.from('calendar_items').insert(row);
        if (error) console.warn('⚠️ calendar insert failed:', error.message);
      }
    }
  }

  /* FILES → storage + documents (unchanged) */
  for (const f of plan.files ?? []) {
    await logAutonomy(projectId, 'files', 'generate', { filename: f.filename, mime: f.mime }, !!willApply);
    if (willApply) {
      try {
        await saveGeneratedFile(projectId, f);
      } catch (e: any) {
        console.warn('⚠️ file generate failed:', e?.message || e);
      }
    }
  }
}
