'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import EditTasksWindow from './EditTasksWindow';
import { useParams, useSearchParams } from 'next/navigation';

/** ---------- Types ---------- */
type Frequency = 'hourly' | 'daily' | 'weekly' | 'monthly';

type TaskSettings = {
  project_id: string;
  zeta_task_frequency: Frequency;
  user_task_frequency: Frequency;
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

type Props = {
  projectId?: string;
  preferredUserName?: string; // unused now, kept for API compatibility
  fontSize?: 'sm' | 'base' | 'lg';
userName?: string;
};

const FREQS: Frequency[] = ['hourly', 'daily', 'weekly', 'monthly'];
const freqIndex = (f?: Frequency) => Math.max(0, FREQS.indexOf(f || 'daily'));

/** ---------- UI helpers ---------- */
function statusPillCls(status: TaskItem['status']) {
  switch (status) {
    case 'under_construction':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'in_progress':
      return 'bg-sky-100 text-sky-800 border-sky-200';
    case 'completed':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'cancelled':
      return 'bg-rose-100 text-rose-800 border-rose-200';
    case 'confirmed':
      return 'bg-violet-100 text-violet-800 border-violet-200';
    default:
      return 'bg-slate-100 text-slate-800 border-slate-200';
  }
}
function statusLabel(status: TaskItem['status']) {
  if (status === 'under_construction') return 'Under construction';
  if (status === 'in_progress') return 'In progress';
  if (status === 'completed') return 'Completed';
  if (status === 'cancelled') return 'Cancelled';
  if (status === 'confirmed') return 'Confirmed';
  return 'Draft';
}

/** ---------- Component ---------- */
export default function TasksPanel({ projectId: propProjectId }: Props) {
  // Resolve projectId: prop → /[projectId] → ?projectId= → localStorage
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId =
    propProjectId ??
    (params?.projectId as string | undefined) ??
    searchParams?.get('projectId') ??
    (typeof window !== 'undefined'
      ? localStorage.getItem('currentProjectId') ?? undefined
      : undefined);

  const [settings, setSettings] = useState<TaskSettings | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // modal state
  const [editTask, setEditTask] = useState<TaskItem | null>(null);

  const cardCls =
    'w-[92%] max-w-6xl mx-auto mt-6 md:mt-8 bg-violet-50/90 text-violet-900 ' +
    'border border-violet-200 ring-1 ring-violet-100 rounded-2xl shadow-md';

  /** ----- Load settings + last 3 per type from task_items only ----- */
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!projectId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setErr(null);

      try {
        // Settings (task_settings)
        const { data: s, error: sErr } = await supabase
          .from('task_settings')
          .select('*')
          .eq('project_id', projectId)
          .maybeSingle();
        if (sErr) throw sErr;

        if (!cancelled) {
          if (s) setSettings(s as TaskSettings);
          else
            setSettings({
              project_id: projectId,
              zeta_task_frequency: 'daily',
              user_task_frequency: 'daily',
            });
        }

        // Last 3 per type from task_items
        const [{ data: z3, error: ez }, { data: u3, error: eu }] = await Promise.all([
          supabase
            .from('task_items')
            .select('*')
            .eq('project_id', projectId)
            .eq('task_type', 'zeta')
            .order('created_at', { ascending: false })
            .limit(3),
          supabase
            .from('task_items')
            .select('*')
            .eq('project_id', projectId)
            .eq('task_type', 'user')
            .order('created_at', { ascending: false })
            .limit(3),
        ]);
        if (ez) throw ez;
        if (eu) throw eu;

        let fetched: TaskItem[] = [...(z3 ?? []), ...(u3 ?? [])];

        // Normalize: null/draft → under_construction
        const toFix = fetched.filter((t) => !t.status || t.status === 'draft').map((t) => t.id);
        if (toFix.length > 0) {
          const { error: updErr } = await supabase
            .from('task_items')
            .update({ status: 'under_construction' })
            .in('id', toFix);
          if (updErr) throw updErr;
          fetched = fetched.map((t) =>
            toFix.includes(t.id) ? { ...t, status: 'under_construction' } : t
          );
        }

        if (!cancelled) {
          setTasks(fetched); // ← no legacy fallback, even if empty
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || 'Failed to load tasks.');
        console.error('TasksPanel error:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // newest→oldest, 3 each
  const zetaTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.task_type === 'zeta')
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        .slice(0, 3),
    [tasks]
  );
  const userTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.task_type === 'user')
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        .slice(0, 3),
    [tasks]
  );

  /** ----- Settings handlers (sliders) ----- */
  async function updateFrequency(which: 'zeta' | 'user', idx: number) {
    if (!projectId) return;
    const val = FREQS[idx] as Frequency;
    const next: TaskSettings = {
      project_id: projectId,
      zeta_task_frequency: which === 'zeta' ? val : settings?.zeta_task_frequency || 'daily',
      user_task_frequency: which === 'user' ? val : settings?.user_task_frequency || 'daily',
    };
    setSettings(next);
    await supabase.from('task_settings').upsert(next, { onConflict: 'project_id' });
  }

  /** ----- Modal helpers ----- */
  function openEditModal(t: TaskItem) {
    setEditTask(t);
  }
  function closeEditModal() {
    setEditTask(null);
  }

  async function handleSaveFromModal(patch: {
    title: string;
    created_at: string | null;
    due_at: string | null;
  }) {
    if (!editTask) return;
    const id = editTask.id;

    const payload: Partial<TaskItem> = {
      title: patch.title,
      created_at: patch.created_at ?? editTask.created_at,
      due_at: patch.due_at ?? null,
    };

    const { data, error } = await supabase
      .from('task_items')
      .update(payload)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (!error && data) {
      setTasks((arr) => arr.map((t) => (t.id === id ? (data as TaskItem) : t)));
      await supabase.from('system_logs').insert({
        project_id: projectId!,
        actor: editTask.task_type === 'zeta' ? 'zeta' : 'user',
        event: 'task.edit',
        details: {
          task_id: id,
          title: patch.title,
          type: editTask.task_type,
        },
      });
    }
  }

  async function confirmTaskFromModal() {
    if (!editTask) return;
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('task_items')
      .update({ status: 'in_progress', verified_at: now })
      .eq('id', editTask.id)
      .select()
      .maybeSingle();

    if (!error && data) {
      setTasks((arr) => arr.map((t) => (t.id === editTask.id ? (data as TaskItem) : t)));
    }
    closeEditModal();
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

  /** ----- Rendering ----- */
  if (!projectId) return null; // don’t render until we know the project
  if (loading) {
    return (
      <div className={cardCls}>
        <div className="px-6 py-5">
          <p className="italic text-sm text-slate-500">Loading tasks…</p>
        </div>
      </div>
    );
  }
  if (err) {
    return (
      <div className={cardCls}>
        <div className="px-6 py-5">
          <p className="text-sm text-red-600">Error: {err}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cardCls}>
      <div className="px-6 py-5 max-h-[72vh] overflow-y-auto">
        {/* Columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <TaskColumn
            label="🤖 Zeta’s Tasks"
            items={zetaTasks}
            onEdit={openEditModal}
            onDelete={deleteTask}
          />
          <TaskColumn
            label="👤 Your Tasks"
            items={userTasks}
            onEdit={openEditModal}
            onDelete={deleteTask}
          />
        </div>

        {/* Divider */}
        <div className="mt-10 pt-8 border-t border-violet-200">
          <h3 className="font-semibold mb-4 text-[15px]">⚙️ Automation cadence</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FreqSlider
              title="How often should Zeta generate Zeta tasks?"
              valueIndex={freqIndex(settings?.zeta_task_frequency)}
              onChange={(i) => updateFrequency('zeta', i)}
            />
            <FreqSlider
              title="How often should Zeta assign YOU tasks?"
              valueIndex={freqIndex(settings?.user_task_frequency)}
              onChange={(i) => updateFrequency('user', i)}
            />
          </div>
          <p className="text-xs text-slate-500 mt-3">
            Saved per project in <code>task_settings</code>. Your scheduler can read the cadence and decide
            hourly/daily/weekly/monthly runs.
          </p>
        </div>
      </div>

      {/* -------- Modal Editor -------- */}
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
          onConfirm={editTask.status === 'under_construction' ? confirmTaskFromModal : undefined}
        />
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
    <div className="bg-white/80 border border-violet-200 rounded-xl p-4 shadow-sm">
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
        <span className="text-xs font-semibold px-2 py-1 rounded bg-violet-100 text-violet-800 border border-violet-200 whitespace-nowrap">
          {FREQS[valueIndex]}
        </span>
      </div>
      <div className="flex justify-between text-[11px] text-slate-500 mt-1">
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
  items,
  onEdit,
  onDelete,
}: {
  label: string;
  items: TaskItem[];
  onEdit: (t: TaskItem) => void | Promise<void>;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="bg-white/70 border border-violet-200 rounded-2xl p-4 shadow-sm">
      <h3 className="font-semibold text-[15px] mb-3">{label}</h3>

      {items.length === 0 ? (
  <div className="text-xs italic">
    {label.includes('Zeta') 
      ? 'Setup your project vision, goals, and Telegram for Zeta to start working on tasks!' 
      : 'None yet'}
  </div>
) : (
        <ul className="space-y-4">
          {items.map((t) => (
            <li key={t.id} className="bg-white/90 border border-violet-200 rounded-xl p-4 shadow-sm">
              <p className="font-semibold text-[15px] leading-5 whitespace-pre-wrap break-words tracking-tight">
                {t.title}
              </p>

              {/* STATUS */}
              <div className="mt-2">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] ${statusPillCls(
                    t.status
                  )}`}
                  title={`Status: ${statusLabel(t.status)}`}
                >
                  {statusLabel(t.status)}
                </span>
              </div>

              {/* META */}
              <div className="mt-3 text-[12px] text-slate-700 flex flex-wrap gap-x-6 gap-y-1">
                <span>
                  <span className="font-semibold">Created:</span>{' '}
                  {new Date(t.created_at).toLocaleString()}
                </span>
                <span>
                  <span className="font-semibold">Deadline:</span>{' '}
                  {t.due_at ? new Date(t.due_at).toLocaleString() : '—'}
                </span>
              </div>

              {/* ACTIONS */}
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button
                  onClick={() => onEdit(t)}
                  className="text-xs px-3 py-1 rounded bg-violet-100 border border-violet-200 hover:bg-violet-200"
                  title="Edit"
                >
                  ✏️ Edit
                </button>
                <button
                  onClick={() => onDelete(t.id)}
                  className="text-xs px-3 py-1 rounded bg-rose-100 border border-rose-200 hover:bg-rose-200"
                  title="Delete"
                >
                  🗑️ Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
