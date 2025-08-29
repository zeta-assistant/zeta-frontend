'use client';

import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import EditTasksWindow from './EditTasksWindow';
import { useParams, useSearchParams } from 'next/navigation';

/** ---------- Types ---------- */
type Frequency = 'hourly' | 'daily' | 'weekly' | 'monthly';

type TaskSettings = {
  project_id: string;
  zeta_task_frequency: Frequency;
  user_task_frequency: Frequency; // kept for compatibility
};

type TaskItem = {
  id: string;
  project_id: string;
  task_type: 'zeta' | 'user';
  title: string;
  details: string | null;
  procedure: string | null;
  status:
    | 'draft'
    | 'under_construction'
    | 'in_progress'
    | 'confirmed'
    | 'completed'
    | 'cancelled';
  due_at: string | null;
  improvement_note: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
};

type GoalDBRow = { goal_type?: string | null; description?: string | null };
type MainframeInfo = { project_id: string; short_term_goals?: string[] | null; long_term_goals?: string[] | null };
type FuncSpec = { id: string; project_id: string; name: string; description?: string | null };

type Props = {
  projectId?: string;
  preferredUserName?: string;
  fontSize?: 'sm' | 'base' | 'lg';
  userName?: string;
};

/** ---------- Helpers ---------- */
const FREQS: Frequency[] = ['hourly', 'daily', 'weekly', 'monthly'];
const freqIndex = (f?: Frequency) => Math.max(0, FREQS.indexOf(f || 'daily'));

type SType = 'zeta' | 'user';
type Suggestion = { title: string; selectedType: SType };

function sentence(s: string) {
  const t = s.trim().replace(/\s+/g, ' ');
  return /[.!?]$/.test(t) ? t : `${t}.`;
}
function dedupeByTitle<T extends { title: string }>(arr: T[]) {
  const seen = new Set<string>();
  return arr.filter((s) => {
    const key = s.title.trim().toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}
function logErr(tag: string, err: unknown) {
  // Safely stringify Supabase/PostgREST errors (often not enumerable)
  try {
    // Many Supabase errors expose message/code/details/hint
    const anyErr = err as any;
    console.error(tag, {
      message: anyErr?.message ?? String(err),
      code: anyErr?.code,
      details: anyErr?.details,
      hint: anyErr?.hint,
      name: anyErr?.name,
      status: anyErr?.status,
    });
  } catch {
    console.error(tag, err);
  }
}

/** ---------- Component ---------- */
export default function TasksPanel({ projectId: propProjectId }: Props) {
  // Resolve projectId
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId =
    propProjectId ??
    (params?.projectId as string | undefined) ??
    (searchParams?.get('projectId') as string | null) ??
    (typeof window !== 'undefined' ? (localStorage.getItem('currentProjectId') as string | null) : null) ??
    undefined;

  const [settings, setSettings] = useState<TaskSettings | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // suggestions pool + visible 3
  const [allSuggestions, setAllSuggestions] = useState<Suggestion[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggIndex, setSuggIndex] = useState(0);

  // modals
  const [editTask, setEditTask] = useState<TaskItem | null>(null);
  const [completeId, setCompleteId] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);

  // Container chrome
  const cardCls =
    'w-[98%] max-w-[95rem] mx-auto mt-6 md:mt-8 bg-amber-100 text-violet-900 ' +
    'border border-amber-200 ring-1 ring-amber-200 rounded-2xl shadow-md';

  /** ----- Helpers ----- */
  async function softSelect<T>(fn: () => Promise<T>): Promise<T | null> {
    try {
      // @ts-ignore
      return await fn();
    } catch {
      return null;
    }
  }
  function windowOfThree<T>(pool: T[], start: number) {
    if (pool.length <= 3) return pool;
    return [0, 1, 2].map((i) => pool[(start + i) % pool.length]);
  }

  async function loadSuggestions(projectId: string) {
    // goals (goal_type + description)
    let shortGoals: string[] = [];
    let longGoals: string[] = [];
    const goalsResp = await softSelect(
      async () => await supabase.from('goals').select('goal_type, description').eq('project_id', projectId)
    );
    if (goalsResp && 'data' in goalsResp && goalsResp.data) {
      const rows = goalsResp.data as GoalDBRow[];
      for (const r of rows) {
        const desc = (r.description || '').trim();
        const type = (r.goal_type || '').toLowerCase();
        if (!desc) continue;
        if (type.includes('short')) shortGoals.push(desc);
        else if (type.includes('long')) longGoals.push(desc);
      }
    }
    if (shortGoals.length === 0 && longGoals.length === 0) {
      const { data: mfi } = await supabase
        .from('mainframe_info')
        .select('short_term_goals, long_term_goals')
        .eq('project_id', projectId)
        .maybeSingle();
      if (mfi) {
        const a = (mfi as MainframeInfo).short_term_goals || [];
        const b = (mfi as MainframeInfo).long_term_goals || [];
        shortGoals = Array.isArray(a) ? a.filter((x: string) => x && x.trim()) : [];
        longGoals = Array.isArray(b) ? b.filter((x: string) => x && x.trim()) : [];
      }
    }

    const seeds = (shortGoals.length > 0 ? shortGoals : longGoals).slice(0, 4);
    const generated: Suggestion[] = seeds.flatMap((g) => ([
      { title: sentence(`Draft the build steps for a function that accelerates "${g}"`), selectedType: 'zeta' },
      { title: sentence(`Schedule a daily "Generate Thoughts" run (e.g., 5/day) to unblock "${g}"`), selectedType: 'zeta' },
      { title: sentence(`Define 3–5 success metrics (KPIs) for "${g}"`), selectedType: 'user' },
      { title: sentence(`List required datasets/APIs/files to support "${g}"`), selectedType: 'user' },
    ]));
    const fsResp = await softSelect(
      async () => await supabase.from('function_specs').select('id, name').eq('project_id', projectId)
    );
    if (fsResp && 'data' in fsResp && fsResp.data) {
      for (const f of fsResp.data as FuncSpec[]) {
        if (!f.name) continue;
        generated.push({ title: sentence(`Break down "${f.name}" into 3–7 concrete build steps`), selectedType: 'zeta' });
      }
    }
    const combined = dedupeByTitle(generated);
    setAllSuggestions(combined);
    setSuggIndex(0);
    setSuggestions(windowOfThree(combined, 0));
  }

  /** ----- Load settings + tasks + suggestions ----- */
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!projectId) { setLoading(false); return; }
      setLoading(true); setErr(null);
      try {
        const { data: s } = await supabase.from('task_settings').select('*').eq('project_id', projectId).maybeSingle();
        if (!cancelled) {
          setSettings((s as TaskSettings) ?? { project_id: projectId, zeta_task_frequency: 'daily', user_task_frequency: 'daily' });
        }
        const [{ data: z3 }, { data: u3 }] = await Promise.all([
          supabase.from('task_items').select('*').eq('project_id', projectId).eq('task_type', 'zeta').order('created_at', { ascending: false }).limit(3),
          supabase.from('task_items').select('*').eq('project_id', projectId).eq('task_type', 'user').order('created_at', { ascending: false }).limit(3),
        ]);
        let fetched: TaskItem[] = [...(z3 ?? []), ...(u3 ?? [])];
        const toFix = fetched.filter((t) => !t.status || t.status === 'draft').map((t) => t.id);
        if (toFix.length > 0) {
          await supabase.from('task_items').update({ status: 'under_construction' }).in('id', toFix);
          fetched = fetched.map((t) => (toFix.includes(t.id) ? { ...t, status: 'under_construction' } : t));
        }
        if (!cancelled) setTasks(fetched);
        if (!cancelled) await loadSuggestions(projectId);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || 'Failed to load tasks.');
        console.error('TasksPanel error:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [projectId]);

  // newest→oldest, 3 each
  const zetaTasks = useMemo(
    () => tasks.filter((t) => t.task_type === 'zeta').sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 3),
    [tasks]
  );
  const userTasks = useMemo(
    () => tasks.filter((t) => t.task_type === 'user').sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 3),
    [tasks]
  );

  /** ----- Data ops ----- */
  async function updateFrequency(which: 'zeta' | 'user', idx: number) {
    if (!projectId) return;
    const val = FREQS[idx] as Frequency;
    const next: TaskSettings = {
      project_id: projectId,
      zeta_task_frequency: which === 'zeta' ? val : settings?.zeta_task_frequency || 'daily',
      user_task_frequency: settings?.user_task_frequency || 'daily',
    };
    setSettings(next);
    await supabase.from('task_settings').upsert(next, { onConflict: 'project_id' });
  }

  function openEditModal(t: TaskItem) { setEditTask(t); }
  function closeEditModal() { setEditTask(null); }

  async function handleSaveFromModal(patch: { title: string; created_at: string | null; due_at: string | null; }) {
    if (!editTask) return;
    const id = editTask.id;
    const payload: Partial<TaskItem> = {
      title: patch.title,
      created_at: patch.created_at ?? editTask.created_at,
      due_at: patch.due_at ?? null,
    };
    const { data } = await supabase.from('task_items').update(payload).eq('id', id).select().maybeSingle();
    if (data) setTasks((arr) => arr.map((t) => (t.id === id ? (data as TaskItem) : t)));
  }

  async function confirmTask(id: string) {
    const now = new Date().toISOString();
    const { data } = await supabase
      .from('task_items')
      .update({ status: 'in_progress', verified_at: now })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (data) setTasks((arr) => arr.map((t) => (t.id === id ? (data as TaskItem) : t)));
  }

  async function deleteTask(id: string) {
    const prev = tasks;
    setTasks((arr) => arr.filter((t) => t.id !== id));
    const { error } = await supabase.from('task_items').delete().eq('id', id);
    if (error) {
      console.error(error);
      setTasks(prev);
    }
  }

  async function createTaskFromSuggestion(s: Suggestion, taskType: SType) {
    if (!projectId) return;

    const title = s.title.trim();

    // 1) Does a task with this (project_id, title) already exist?
    const { data: existing, error: findErr } = await supabase
      .from('task_items')
      .select('*')
      .eq('project_id', projectId)
      .eq('title', title)
      .maybeSingle();

    if (findErr) {
      console.error('find existing task error:', findErr);
    }

    // 2) If it exists, just update its owner (task_type). Do NOT insert.
    if (existing) {
      const { data: updated, error: updErr } = await supabase
        .from('task_items')
        .update({ task_type: taskType })
        .eq('id', (existing as TaskItem).id)
        .select()
        .maybeSingle();

      if (updErr) {
        console.error('update existing task owner error:', updErr);
        return;
      }

      if (updated) {
        setTasks(arr => [updated as TaskItem, ...arr.filter(t => t.id !== (updated as TaskItem).id)]);
        setAllSuggestions(pool => pool.filter(x => x.title !== title));
        setSuggestions(list => list.filter(x => x.title !== title));
      }
      return;
    }

    // 3) Otherwise insert a fresh task
    const payload = {
      project_id: projectId,
      task_type: taskType,
      title,
      details: null,
      procedure: null,
      status: 'under_construction' as const,
      due_at: null,
      improvement_note: null,
      verified_at: null,
    };

    const { data, error } = await supabase
      .from('task_items')
      .insert(payload)
      .select()
      .maybeSingle();

    // 4) Handle race on unique (project_id, title)
    if (error && (error as any)?.code === '23505') {
      const { data: afterRace } = await supabase
        .from('task_items')
        .select('*')
        .eq('project_id', projectId)
        .eq('title', title)
        .maybeSingle();

      if (afterRace) {
        setTasks(arr => [afterRace as TaskItem, ...arr.filter(t => t.id !== (afterRace as TaskItem).id)]);
        setAllSuggestions(pool => pool.filter(x => x.title !== title));
        setSuggestions(list => list.filter(x => x.title !== title));
      }
      return;
    }

    if (error) {
      console.error('insert new task error:', error);
      return;
    }

    if (data) {
      setTasks(arr => [data as TaskItem, ...arr]);
      setAllSuggestions(pool => pool.filter(x => x.title !== title));
      setSuggestions(list => list.filter(x => x.title !== title));
    }
  }

  async function createEmptyTask(taskType: SType) {
    if (!projectId) return;
    const payload = {
      project_id: projectId,
      task_type: taskType,
      title: 'Untitled task',
      details: null,
      procedure: null,
      status: 'under_construction' as const,
      due_at: null,
      improvement_note: null,
      verified_at: null,
    };
    const { data } = await supabase.from('task_items').insert(payload).select().maybeSingle();
    if (data) setTasks((arr) => [data as TaskItem, ...arr]);
  }

  function rotateSuggestions() {
    if (allSuggestions.length === 0) return;
    const nextIndex = (suggIndex + 3) % Math.max(1, allSuggestions.length);
    setSuggIndex(nextIndex);
    setSuggestions(windowOfThree(allSuggestions, nextIndex));
  }

  // Complete modal controls
  function openCompleteModal(id: string) {
    setCompleteId(id);
  }
  function closeCompleteModal() {
    setCompleteId(null);
  }

 async function markTaskComplete() {
  if (!completeId || !projectId) return;
  setCompleting(true);

  try {
    // 1) Preflight: can we SEE this row? (RLS visibility)
    const { data: pre, error: preErr } = await supabase
      .from('task_items')
      .select('id, project_id, status, task_type, title')
      .eq('id', completeId)
      .eq('project_id', projectId)
      .maybeSingle();

    if (preErr) {
      logErr('complete preflight select error:', preErr);
      return;
    }

    if (!pre) {
      // If you can’t see it, update will also no-op due to RLS.
      console.warn('complete preflight: row not visible (RLS or wrong filters)', {
        completeId, projectId
      });
      return;
    }

    // 2) Update with RETURNING and throwOnError for *actual* error surfaces
    const { data: updated } = await supabase
      .from('task_items')
      .update({ status: 'completed' })
      .eq('id', completeId)
      .eq('project_id', projectId)
      .select('id, status')
      .maybeSingle()
      .throwOnError();

    if (!updated) {
      // Re-check visibility: if this logs null again, RLS WITH CHECK probably failed.
      console.warn('complete update returned no row; likely RLS WITH CHECK prevented change', {
        completeId, projectId
      });
      return;
    }

    // 3) Update UI
    setTasks(arr => arr.filter(x => x.id !== completeId));

    // 4) Log for XP pipeline (best effort)
    const actor = pre.task_type === 'zeta' ? 'zeta' : 'user';
    await supabase.from('system_logs').insert({
      project_id: projectId,
      actor,
      event: 'task.complete',
      details: { task_id: completeId, title: pre.title ?? '' },
    }).throwOnError?.(); // ignore if your client doesn't have throwOnError on insert

  } catch (e) {
    logErr('complete task error (exception):', e);
  } finally {
    setCompleting(false);
    setCompleteId(null);
  }
}



  /** ----- DnD handlers (must be BEFORE return) ----- */
  const DND_MIME = 'application/x-zeta-suggestion';
  function onDragStartSuggestion(e: React.DragEvent, s: Suggestion) {
    try {
      e.dataTransfer?.setData(DND_MIME, JSON.stringify({ title: s.title, selectedType: s.selectedType }));
    } catch {
      e.dataTransfer?.setData('text/plain', s.title);
    }
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copyMove';
  }
  async function onDropCreate(e: React.DragEvent, targetType: SType) {
    e.preventDefault();
    const dt = e.dataTransfer;
    if (!dt) return;
    let raw = dt.getData(DND_MIME);
    if (!raw) {
      const txt = dt.getData('text/plain');
      if (txt) raw = JSON.stringify({ title: txt, selectedType: targetType });
    }
    if (!raw) return;
    let payload: { title: string; selectedType: SType };
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = { title: raw, selectedType: targetType };
    }
    await createTaskFromSuggestion({ title: payload.title, selectedType: targetType }, targetType);
  }

  /** ----- Rendering ----- */
  if (!projectId) return null;
  if (loading) {
    return (
      <div className={cardCls}>
        <div className="px-4 py-5"><p className="italic text-sm text-slate-700">Loading tasks…</p></div>
      </div>
    );
  }
  if (err) {
    return (
      <div className={cardCls}>
        <div className="px-4 py-5"><p className="text-sm text-red-600">Error: {err}</p></div>
      </div>
    );
  }

  return (
    <div className={cardCls}>
      <div className="px-4 pt-5 pb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Suggested */}
          <div className="md:col-span-1 bg-amber-50/60 border border-amber-200 rounded-2xl p-4 shadow-sm min-h-[480px]">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-[15px]">Suggested</h3>
              <button
                onClick={rotateSuggestions}
                className="text-[11px] px-2 py-0.5 rounded border border-amber-300 bg-amber-100 hover:bg-amber-200"
                title="Refresh"
              >
                ↻
              </button>
            </div>

            {suggestions.length === 0 ? (
              <div className="text-xs italic text-slate-700">
                No suggestions yet. Add short-term goals in Goals or mainframe_info.
              </div>
            ) : (
              <ul className="space-y-3">
                {suggestions.map((s, idx) => (
                  <li
                    key={`${s.title}-${idx}`}
                    className="bg-white/95 border border-amber-200 rounded-xl p-3 shadow-sm"
                    draggable
                    onDragStart={(e) => onDragStartSuggestion(e, s)}
                    title="Drag me to a column"
                  >
                    <p className="font-semibold text-[14px] leading-5 line-clamp-4 max-w-[60ch]">
                      {s.title}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <button
                        onClick={() =>
                          setSuggestions((list) =>
                            list.map((x) =>
                              x.title === s.title
                                ? { ...x, selectedType: x.selectedType === 'zeta' ? 'user' : 'zeta' }
                                : x
                            )
                          )
                        }
                        className={`text-[11px] px-2 py-0.5 rounded-full border ${
                          s.selectedType === 'zeta'
                            ? 'bg-violet-100 text-violet-800 border-violet-200'
                            : 'bg-slate-100 text-slate-700 border-slate-300'
                        }`}
                        title="Toggle owner (Zeta/User)"
                      >
                        {s.selectedType === 'zeta' ? 'Zeta' : 'User'}
                      </button>

                      <button
                        onClick={() => createTaskFromSuggestion(s, s.selectedType)}
                        className="text-[11px] px-2.5 py-0.5 rounded bg-amber-100 border border-amber-200 hover:bg-amber-200"
                        title="Create task"
                      >
                        ➕ Add
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-3 text-[11px] text-slate-700">
              Tip: drag a suggestion onto “Zeta’s Tasks” or “Your Tasks”.
            </p>
          </div>

          {/* Real Zeta & User columns */}
          <div className="md:col-span-2 flex gap-4">
            <TaskColumn
              label="🤖 Zeta’s Tasks"
              type="zeta"
              items={zetaTasks}
              onEdit={openEditModal}
              onDelete={deleteTask}
              onConfirm={confirmTask}
              onComplete={openCompleteModal}
              onPlus={() => createEmptyTask('zeta')}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDropCreate(e, 'zeta')}
            />
            <TaskColumn
              label="👤 Your Tasks"
              type="user"
              items={userTasks}
              onEdit={openEditModal}
              onDelete={deleteTask}
              onConfirm={confirmTask}
              onComplete={openCompleteModal}
              onPlus={() => createEmptyTask('user')}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDropCreate(e, 'user')}
            />
          </div>
        </div>

        {/* Cadence — stronger outline */}
        <div className="mt-3 pt-3 border-t border-amber-200">
          <FreqSlider
            title="How often should Zeta generate tasks?"
            valueIndex={freqIndex(settings?.zeta_task_frequency)}
            onChange={(i) => updateFrequency('zeta', i)}
          />
        </div>
      </div>

      {editTask && (
        <EditTasksWindow
          open={!!editTask}
          task={{
            id: editTask.id,
            title: editTask.title,
            status: editTask.status,
            created_at: editTask.created_at,
            due_at: editTask.due_at,
          }}
          onClose={closeEditModal}
          onSave={handleSaveFromModal}
          onConfirm={editTask.status === 'under_construction' ? () => confirmTask(editTask.id) : undefined}
        />
      )}

      {/* -------- Mark Complete Modal -------- */}
      {completeId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30">
          <div className="w-[min(92vw,28rem)] rounded-2xl border border-amber-200 bg-white p-4 shadow-xl">
            <h4 className="mb-2 text-base font-semibold text-violet-900">
              Mark task as complete?
            </h4>
            <p className="text-sm text-slate-700">
              Are you sure you want to mark this as complete? Make sure your achievement criteria has been met.
            </p>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={closeCompleteModal}
                className="text-[12px] px-2.5 py-1 rounded border border-slate-300 bg-slate-100 hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={markTaskComplete}
                disabled={completing}
                className="text-[12px] px-2.5 py-1 rounded border border-emerald-200 bg-emerald-100 text-emerald-900 hover:bg-emerald-200 disabled:opacity-60"
              >
                {completing ? 'Completing…' : 'Yes, complete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** ---------- Subcomponents ---------- */
function FreqSlider({
  title,
  valueIndex,
  onChange,
}: {
  title: string;
  valueIndex: number;
  onChange: (i: number) => void;
}) {
  return (
    <div className="bg-white/90 border-2 border-amber-300 ring-1 ring-amber-200 rounded-xl p-3 shadow-sm w-full">
      <p className="text-sm font-medium mb-2">{title}</p>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={3}
          step={1}
          value={valueIndex}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          className="w-full accent-violet-600"
        />
        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-200 whitespace-nowrap">
          {FREQS[valueIndex]}
        </span>
      </div>
      <div className="flex justify-between text-[11px] text-slate-700 mt-2">
        <span>hourly</span>
        <span>daily</span>
        <span>weekly</span>
        <span>monthly</span>
      </div>
    </div>
  );
}

function TaskColumn({
  label,
  type,
  items,
  onEdit,
  onDelete,
  onConfirm,
  onComplete,
  onPlus,
  onDragOver,
  onDrop,
}: {
  label: string;
  type: 'zeta' | 'user';
  items: TaskItem[];
  onEdit: (t: TaskItem) => void | Promise<void>;
  onDelete: (id: string) => void;
  onConfirm: (id: string) => void | Promise<void>;
  onComplete: (id: string) => void;
  onPlus: () => void | Promise<void>;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void | Promise<void>;
}) {
  return (
    <div
      className="flex-1 bg-amber-50/60 border border-amber-200 rounded-2xl p-4 shadow-sm min-h-[480px]"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-[15px]">{label}</h3>
        <button
          onClick={onPlus}
          className="text-[11px] px-2 py-0.5 rounded bg-amber-100 border border-amber-200 hover:bg-amber-200"
          title={`Create a new ${type === 'zeta' ? 'Zeta' : 'User'} task`}
        >
          ➕
        </button>
      </div>

      {items.length === 0 ? (
        <div className="text-xs italic text-slate-700">
          Drop a suggestion here or click + to add a new task.
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((t) => (
            <li
              key={t.id}
              className="relative w-full bg-white/95 border border-amber-200 rounded-xl p-4 shadow-sm"
            >
              {/* small X in corner */}
              <button
                onClick={() => onDelete(t.id)}
                className="absolute right-1.5 top-1.5 text-[10px] px-1.5 py-0.5 rounded border border-rose-200 bg-rose-50 hover:bg-rose-100"
                title="Delete task"
              >
                ×
              </button>

              {/* Title — slightly narrower to wrap nicely */}
              <p className="font-semibold text-[14px] leading-5 whitespace-pre-wrap break-words tracking-tight line-clamp-4 max-w-[42ch] pr-6">
                {t.title}
              </p>

              {/* Meta: show Created ONLY when not under construction */}
              {t.status !== 'under_construction' && (
                <div className="mt-2 text-[12px] text-slate-700">
                  <span className="font-semibold">Created:</span> {fmtDate(t.created_at)}
                </div>
              )}

              {/* Actions */}
              <div className="mt-2 flex items-center gap-1">
                <button
                  onClick={() => onEdit(t)}
                  className="text-[10px] px-1.5 py-[2px] rounded bg-amber-100 border border-amber-200 hover:bg-amber-200"
                  title="Edit"
                >
                  ✏️ Edit
                </button>

                {t.status === 'under_construction' && (
                  <button
                    onClick={() => onConfirm(t.id)}
                    className="text-[10px] px-1.5 py-[2px] rounded bg-emerald-100 text-emerald-900 border border-emerald-200 hover:bg-emerald-200"
                    title="Confirm (move to In progress)"
                  >
                    ✅ Confirm
                  </button>
                )}

                {(t.status === 'in_progress' || t.status === 'confirmed') && (
                  <button
                    onClick={() => onComplete(t.id)}
                    className="text-[10px] px-1.5 py-[2px] rounded bg-violet-100 text-violet-900 border border-violet-200 hover:bg-violet-200"
                    title="Mark as complete"
                  >
                    ✔️ Mark complete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
