'use client';

import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import EditTasksWindow from './EditTasksWindow';
import { useParams, useSearchParams } from 'next/navigation';

/** ---------- Types ---------- */
type Frequency = 'hourly' | 'daily' | 'weekly' | 'monthly';
type TaskSettings = {
  project_id: string;
  zeta_task_frequency: Frequency;
  user_task_frequency: Frequency;
  created_at?: string | null;
  updated_at?: string | null;
};
type TaskItem = {
  id: string;
  project_id: string;
  task_type: 'zeta' | 'user';
  title: string;
  details: string | null;
  procedure: string | null;
  status: 'draft' | 'under_construction' | 'in_progress' | 'confirmed' | 'completed' | 'cancelled';
  due_at: string | null;
  improvement_note: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
};
type GoalDBRow = { goal_type?: string | null; description?: string | null };

type Props = {
  projectId?: string;
  preferredUserName?: string;
  fontSize?: 'sm' | 'base' | 'lg';
  userName?: string;
};

const FREQS: Frequency[] = ['hourly', 'daily', 'weekly', 'monthly'];
const freqIndex = (f?: Frequency) => Math.max(0, FREQS.indexOf(f || 'daily'));

type SType = 'zeta' | 'user';
type Suggestion = { title: string; selectedType: SType };

/* ---------- utils ---------- */
const dedupeByTitle = <T extends { title: string }>(arr: T[]) => {
  const seen = new Set<string>();
  return arr.filter((s) => {
    const key = s.title.trim().toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
};

const logErr = (tag: string, err: unknown) => {
  try {
    const e: any = err;
    console.error(tag, {
      message: e?.message ?? String(err),
      code: e?.code,
      details: e?.details,
      status: e?.status,
      context: e?.context,
    });
  } catch {
    console.error(tag, err);
  }
};

/** Promise timeout helper so UI never hangs */
function withTimeout<T>(p: PromiseLike<T>, ms = 12000): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('timeout')), ms);
    Promise.resolve(p)
      .then((v) => {
        clearTimeout(id);
        resolve(v as T);
      })
      .catch((e: any) => {
        clearTimeout(id);
        reject(e);
      });
  });
}

/** ---------- cadence (always one function name) ---------- */
const GENERATE_FN = 'generate-daily-tasks'; // <- always this function
const FREQ_MS: Record<Frequency, number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000, // coarse; server should handle idempotency/time windows
};
const lastRunKey = (pid: string, f: Frequency) => `zeta:lastGen:${pid}:${f}`;

function shouldRunNow(pid: string, f: Frequency): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const key = lastRunKey(pid, f);
    const prev = Number(localStorage.getItem(key) || '0');
    const now = Date.now();
    return now - prev >= FREQ_MS[f];
  } catch { 
    return true;
  }
}
function markRan(pid: string, f: Frequency) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(lastRunKey(pid, f), String(Date.now()));
  } catch {}
}

export default function TasksPanel({ projectId: propProjectId }: Props) {
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

  // suggestions state
  const [suggLoading, setSuggLoading] = useState(false);
  const [suggOffset, setSuggOffset] = useState(0);
  const [seenSuggestionTitles, setSeenSuggestionTitles] = useState<Set<string>>(new Set());
  const [allSuggestions, setAllSuggestions] = useState<Suggestion[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggIndex, setSuggIndex] = useState(0);

  // plan
  const [plan, setPlan] = useState<'free' | 'premium'>('free');
  const isPremium = plan === 'premium';

  // modals
  const [editTask, setEditTask] = useState<TaskItem | null>(null);
  const [completeId, setCompleteId] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);

  const cancelledRef = useRef(false);
  const genTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cardCls =
    'w-full max-w-screen-2xl mx-auto mt-6 md:mt-8 bg-amber-100 text-violet-900 ' +
    'border border-amber-200 ring-1 ring-amber-200 rounded-2xl shadow-md overflow-visible';

  const windowOfThree = <T,>(pool: T[], start: number) =>
    pool.length <= 3 ? pool : [0, 1, 2].map((i) => pool[(start + i) % pool.length]);

  /** settings: ensure default row exists (daily) */
  async function ensureSettings(pid: string): Promise<TaskSettings> {
    const { data: existing } = await supabase
      .from('task_settings')
      .select('project_id,zeta_task_frequency,user_task_frequency,created_at,updated_at')
      .eq('project_id', pid)
      .maybeSingle();

    if (existing) {
      const z = (existing.zeta_task_frequency as Frequency) || 'daily';
      const u = (existing.user_task_frequency as Frequency) || 'daily';
      return { ...existing, zeta_task_frequency: z, user_task_frequency: u };
    }

    const now = new Date().toISOString();
    const fresh: TaskSettings = {
      project_id: pid,
      zeta_task_frequency: 'daily',
      user_task_frequency: 'daily',
      created_at: now,
      updated_at: now,
    };
    await supabase.from('task_settings').insert(fresh);
    return fresh;
  }

  /** fetch latest 3+3 tasks */
  async function fetchTasks(pid: string) {
    const [{ data: z3 }, { data: u3 }] = await Promise.all([
      withTimeout(
        supabase
          .from('task_items')
          .select('*')
          .eq('project_id', pid)
          .eq('task_type', 'zeta')
          .order('created_at', { ascending: false })
          .limit(3),
        8000
      ),
      withTimeout(
        supabase
          .from('task_items')
          .select('*')
          .eq('project_id', pid)
          .eq('task_type', 'user')
          .order('created_at', { ascending: false })
          .limit(3),
        8000
      ),
    ]);
    let fetched: TaskItem[] = [...(z3 ?? []), ...(u3 ?? [])];

    const toFix = fetched.filter((t) => !t.status || t.status === 'draft').map((t) => t.id);
    if (toFix.length) {
      await withTimeout(supabase.from('task_items').update({ status: 'under_construction' }).in('id', toFix), 8000);
      fetched = fetched.map((t) => (toFix.includes(t.id) ? { ...t, status: 'under_construction' } : t));
    }
    if (!cancelledRef.current) setTasks(fetched);
  }

  /** load suggestions; time-bounded; never blocks main loading */
  async function loadSuggestions(pid: string, offset = 0) {
    if (cancelledRef.current) return;
    setSuggLoading(true);

    const exclude = new Set<string>();
    try {
      const { data: allExisting } = await withTimeout(
        supabase.from('task_items').select('title').eq('project_id', pid),
        8000
      );
      (allExisting ?? []).forEach((r: any) => exclude.add(String(r.title || '').trim().toLowerCase()));
    } catch (e: any) {
      logErr('tasks: exclude fetch', e);
    }
    for (const t of Array.from(seenSuggestionTitles)) exclude.add(t);

    let usedFallback = false;
    try {
      const { data, error } = await withTimeout(
        supabase.functions.invoke('suggest-tasks', {
          body: {
            project_id: pid,
            limit: 12,
            offset,
            default_owner: 'zeta',
            exclude_titles: Array.from(exclude),
            hint:
              'Generate novel next actions across research, automation, outreach, experiments, instrumentation, and docs. ' +
              'Do not restate goals; avoid quotes; keep titles punchy and specific; vary verbs.',
          },
        }),
        12000
      );

      if ((data as any)?.error === 'premium_required') {
        usedFallback = true;
      } else if (error) {
        throw error;
      } else {
        const fromFn: Suggestion[] = Array.isArray(data?.suggestions)
          ? (data.suggestions as Array<{ title: string; owner: 'zeta' | 'user' }>).map((s) => ({
              title: s.title,
              selectedType: s.owner,
            }))
          : [];
        const clean = dedupeByTitle(fromFn);
        if (clean.length) {
          if (cancelledRef.current) return;
          setAllSuggestions(clean);
          setSuggIndex(0);
          setSuggestions(windowOfThree(clean, 0));
          setSeenSuggestionTitles((prev) => {
            const next = new Set(prev);
            clean.forEach((s) => next.add(s.title.trim().toLowerCase()));
            return next;
          });
          setSuggLoading(false);
          return;
        }
      }
    } catch (e: any) {
      logErr('suggest-tasks invoke failed; using fallback', e);
      usedFallback = true;
    }

    // Fallback (local)
    try {
      const { data: goals } = await withTimeout(
        supabase.from('goals').select('goal_type, description').eq('project_id', pid),
        8000
      );
      const short: string[] = [];
      const long: string[] = [];
      (goals ?? []).forEach((r: GoalDBRow) => {
        const desc = (r.description || '').trim();
        const type = (r.goal_type || '').toLowerCase();
        if (!desc) return;
        if (type.includes('short')) short.push(desc);
        else if (type.includes('long')) long.push(desc);
      });

      const seeds = (short.length ? short : long).slice(0, 4);
      const baseline = [
        'Draft 5 outreach messages to test hook A',
        'Prototype weekly KPI mini-dashboard',
        'Scrape 30 target prospects from 2 forums',
        'Set up event tracking for ROI funnel',
      ];
      const extra = seeds.map(() => 'Design A/B test for onboarding copy');

      const pool = dedupeByTitle(
        baseline.concat(extra).map((t) => ({ title: t, selectedType: 'user' as const }))
      ).filter((s) => !exclude.has(s.title.trim().toLowerCase()));

      const start = offset % Math.max(1, pool.length);
      const rotated = pool.slice(start).concat(pool.slice(0, start));

      if (cancelledRef.current) return;
      setAllSuggestions(rotated);
      setSuggIndex(0);
      setSuggestions(windowOfThree(rotated, 0));
      setSeenSuggestionTitles((prev) => {
        const next = new Set(prev);
        rotated.forEach((s) => next.add(s.title.trim().toLowerCase()));
        return next;
      });
    } finally {
      if (!cancelledRef.current) setSuggLoading(false);
    }
  }

  /** ---- auto-generation loop (premium) ---- */
 async function callGenerator(pid: string) {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  try {
    const { data, error } = await withTimeout(
      // your Edge Function reads project_id from the URL's search params
      supabase.functions.invoke(`${GENERATE_FN}?project_id=${encodeURIComponent(pid)}`),
      20000
    );
    if (error) throw error;
    await fetchTasks(pid);
    return data;
  } catch (e) {
    logErr('generate-tasks failed', e);
    return null;
  }
}

  // boot + data
  useEffect(() => {
    cancelledRef.current = false;
    (async () => {
      if (!projectId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setErr(null);

      try {
        const { data: p } = await withTimeout(
          supabase.from('user_projects').select('plan').eq('id', projectId).maybeSingle(),
          8000
        );
        setPlan((p?.plan ?? 'free') as 'free' | 'premium');
      } catch (_) {}

      try {
        const ensured = await withTimeout(ensureSettings(projectId), 8000);
        if (!cancelledRef.current) setSettings(ensured);

        await fetchTasks(projectId);

        // load suggestions in the background
        loadSuggestions(projectId).catch((e: any) => logErr('suggestions-bg', e));
      } catch (e: any) {
        if (!cancelledRef.current) setErr(e?.message || 'Failed to load tasks.');
      } finally {
        if (!cancelledRef.current) setLoading(false);
      }
    })();
    return () => {
      cancelledRef.current = true;
    };
  }, [projectId]);

  // schedule auto-calls whenever premium + projectId + zeta freq changes
  useEffect(() => {
    if (!projectId || !isPremium || !settings?.zeta_task_frequency) return;

    const freq = settings.zeta_task_frequency;
    const period = FREQ_MS[freq];

    // clear any previous timer
    if (genTimerRef.current) {
      clearInterval(genTimerRef.current);
      genTimerRef.current = null;
    }

    
    

    // set interval loop (check a few times per window; only runs when shouldRunNow passes)
    genTimerRef.current = setInterval(() => {
      if (shouldRunNow(projectId, freq)) {
        callGenerator(projectId).then(() => markRan(projectId, freq));
      }
    }, Math.max(60_000, Math.floor(period / 6)));

    return () => {
      if (genTimerRef.current) {
        clearInterval(genTimerRef.current);
        genTimerRef.current = null;
      }
    };
  }, [projectId, isPremium, settings?.zeta_task_frequency]);

  const zetaTasks = useMemo(
    () => tasks.filter((t) => t.task_type === 'zeta').sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 3),
    [tasks]
  );
  const userTasks = useMemo(
    () => tasks.filter((t) => t.task_type === 'user').sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 3),
    [tasks]
  );

  async function updateFrequency(which: 'zeta' | 'user', idx: number) {
    if (!projectId) return;
    if (which === 'zeta' && !isPremium) return;
    const val = FREQS[idx] as Frequency;
    const next: TaskSettings = {
      project_id: projectId,
      zeta_task_frequency: which === 'zeta' ? val : (settings?.zeta_task_frequency || 'daily'),
      user_task_frequency: which === 'user' ? val : (settings?.user_task_frequency || 'daily'),
      updated_at: new Date().toISOString(),
    };
    setSettings((curr) => ({ ...(curr || ({} as TaskSettings)), ...next }));
    await supabase.from('task_settings').upsert(next, { onConflict: 'project_id' });
    if (which === 'zeta') {
  try { localStorage.setItem(lastRunKey(projectId, FREQS[idx] as Frequency), String(Date.now())); } catch {}
}

  }

  function openEditModal(t: TaskItem) {
    if (t.task_type === 'zeta' && !isPremium) return;
    setEditTask(t);
  }
  function closeEditModal() {
    setEditTask(null);
  }

  async function handleSaveFromModal(patch: { title: string; created_at: string | null; due_at: string | null }) {
    if (!editTask) return;
    const { data } = await supabase
      .from('task_items')
      .update({ title: patch.title, created_at: patch.created_at ?? editTask.created_at, due_at: patch.due_at ?? null })
      .eq('id', editTask.id)
      .select()
      .maybeSingle();
    if (data) setTasks((arr) => arr.map((t) => (t.id === editTask.id ? (data as TaskItem) : t)));
  }

  async function confirmTask(id: string) {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    if (t.task_type === 'zeta' && !isPremium) return;
    const now = new Date().toISOString();
    const { data } = await supabase
      .from('task_items')
      .update({ status: 'in_progress', verified_at: now })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (data) setTasks((arr) => arr.map((x) => (x.id === id ? (data as TaskItem) : x)));
  }

  async function deleteTask(id: string) {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    if (t.task_type === 'zeta' && !isPremium) return;
    const prev = tasks;
    setTasks((arr) => arr.filter((x) => x.id !== id));
    const { error } = await supabase.from('task_items').delete().eq('id', id);
    if (error) {
      console.error(error);
      setTasks(prev);
    }
  }

  async function createTaskFromSuggestion(s: Suggestion, taskType: SType) {
    if (!projectId) return;
    if (taskType === 'zeta' && !isPremium) return;
    const title = s.title.trim();

    const { data: existing } = await supabase
      .from('task_items')
      .select('*')
      .eq('project_id', projectId)
      .eq('title', title)
      .maybeSingle();

    if (existing) {
      const { data: updated } = await supabase
        .from('task_items')
        .update({ task_type: taskType })
        .eq('id', (existing as TaskItem).id)
        .select()
        .maybeSingle();
      if (updated) {
        setTasks((arr) => [updated as TaskItem, ...arr.filter((t) => t.id !== (updated as TaskItem).id)]);
        setAllSuggestions((pool) => pool.filter((x) => x.title !== title));
        setSuggestions((list) => list.filter((x) => x.title !== title));
      }
      return;
    }

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
    const { data, error } = await supabase.from('task_items').insert(payload).select().maybeSingle();
    if ((error as any)?.code === '23505') {
      const { data: afterRace } = await supabase
        .from('task_items')
        .select('*')
        .eq('project_id', projectId)
        .eq('title', title)
        .maybeSingle();
      if (afterRace) {
        setTasks((arr) => [afterRace as TaskItem, ...arr.filter((t) => t.id !== (afterRace as TaskItem).id)]);
        setAllSuggestions((pool) => pool.filter((x) => x.title !== title));
        setSuggestions((list) => list.filter((x) => x.title !== title));
      }
      return;
    }
    if (data) {
      setTasks((arr) => [data as TaskItem, ...arr]);
      setAllSuggestions((pool) => pool.filter((x) => x.title !== title));
      setSuggestions((list) => list.filter((x) => x.title !== title));
    }
  }

  async function createEmptyTask(taskType: SType) {
    if (!projectId) return;
    if (taskType === 'zeta' && !isPremium) return;
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

  async function rotateSuggestions() {
    if (!projectId || suggLoading) return;
    const next = (suggOffset + 3) % 100000;
    setSuggOffset(next);
    loadSuggestions(projectId, next).catch((e: any) => logErr('suggestions-rotate', e));
  }

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
      const { data: pre } = await supabase
        .from('task_items')
        .select('id, project_id, status, task_type, title, improvement_note')
        .eq('id', completeId)
        .eq('project_id', projectId)
        .maybeSingle();
      if (!pre) return;
      if (pre.task_type === 'zeta' && !isPremium) return;

      const nowIso = new Date().toISOString();
      const payload: Partial<TaskItem> = {
        status: 'completed',
        verified_at: nowIso,
        improvement_note: pre.improvement_note ?? 'Marked complete via UI',
      };
      const { data: updated } = await supabase
        .from('task_items')
        .update(payload)
        .eq('id', completeId)
        .eq('project_id', projectId)
        .select('id, status')
        .maybeSingle();
      if (!updated) return;

      setTasks((arr) => arr.filter((x) => x.id !== completeId));
      const actor = pre.task_type === 'zeta' ? 'zeta' : 'user';
      await supabase
        .from('system_logs')
        .insert({ project_id: projectId, actor, event: 'task.complete', details: { task_id: completeId, title: pre.title ?? '' } });
    } finally {
      setCompleting(false);
      setCompleteId(null);
    }
  }

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
    if (targetType === 'zeta' && !isPremium) return;
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
      payload = { title: raw as unknown as string, selectedType: targetType };
    }
    await createTaskFromSuggestion({ title: payload.title, selectedType: targetType }, targetType);
  }

  if (!projectId) return null;
  if (loading)
    return (
      <div className={cardCls}>
        <div className="px-4 py-5">
          <p className="italic text-sm text-slate-700">Loading tasks…</p>
        </div>
      </div>
    );
  if (err)
    return (
      <div className={cardCls}>
        <div className="px-4 py-5">
          <p className="text-sm text-red-600">Error: {err}</p>
        </div>
      </div>
    );

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
                disabled={suggLoading}
                className="text-[11px] px-2 py-0.5 rounded border border-amber-300 bg-amber-100 hover:bg-amber-200 disabled:opacity-60"
                title="Refresh"
              >
                {suggLoading ? '⟳' : '↻'}
              </button>
            </div>

            {suggestions.length === 0 ? (
              <div className="text-xs italic text-slate-700">
                Suggestions shown here. Add to “Your Tasks”. Upgrade to add to Zeta.
              </div>
            ) : (
              <ul className="space-y-3">
                {suggestions.map((s, idx) => {
                  const zetaLocked = s.selectedType === 'zeta' && !isPremium;
                  return (
                    <li
                      key={`${s.title}-${idx}`}
                      className="bg-white/95 border border-amber-200 rounded-xl p-3 shadow-sm"
                      draggable
                      onDragStart={(e) => onDragStartSuggestion(e, s)}
                      title={s.title}
                    >
                      <p className="font-semibold text-[14px] leading-5 line-clamp-3 break-words">{s.title}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <button
                          onClick={() =>
                            setSuggestions((list) =>
                              list.map((x) =>
                                x.title === s.title ? { ...x, selectedType: x.selectedType === 'zeta' ? 'user' : 'zeta' } : x
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
                          className="text-[11px] px-2.5 py-0.5 rounded bg-amber-100 border border-amber-200 hover:bg-amber-200 disabled:opacity-60"
                          disabled={zetaLocked}
                          title={zetaLocked ? 'Upgrade to add to Zeta' : 'Create task'}
                        >
                          ➕ Add
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <p className="mt-3 text-[11px] text-slate-700">
              Drag into “Your Tasks”. {isPremium ? 'You can also drag into Zeta’s column.' : 'Upgrade to drag into Zeta’s column.'}
            </p>
          </div>

          {/* Columns */}
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
              onDragOver={(e) => isPremium && e.preventDefault()}
              onDrop={(e) => onDropCreate(e, 'zeta')}
              locked={!isPremium}
              upgradeHref="/upgrade"
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
              locked={false}
            />
          </div>
        </div>

        {/* Zeta cadence only (gated) */}
        <div className="mt-3 pt-3 border-t border-amber-200">
          <FreqSlider
            title="How often should Zeta generate tasks?"
            valueIndex={freqIndex(settings?.zeta_task_frequency)}
            onChange={(i) => updateFrequency('zeta', i)}
            disabled={!isPremium}
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

      {completeId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30">
          <div className="w-[min(92vw,28rem)] rounded-2xl border border-amber-200 bg-white p-4 shadow-xl">
            <h4 className="mb-2 text-base font-semibold text-violet-900">Mark task as complete?</h4>
            <p className="text-sm text-slate-700">
              Are you sure you want to mark this as complete? Make sure your achievement criteria has been met.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={closeCompleteModal}
                className="text-[12px] px-2.5 py-1 rounded border border-slate-300 bg-slate-100 hover:bg-amber-200/40"
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
  disabled,
}: {
  title: string;
  valueIndex: number;
  onChange: (i: number) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`bg-white/90 border-2 border-amber-300 ring-1 ring-amber-200 rounded-xl p-3 shadow-sm w-full ${
        disabled ? 'opacity-60' : ''
      }`}
    >
      <p className="text-sm font-medium mb-2">{title}</p>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={3}
          step={1}
          value={valueIndex}
          onChange={(e) => !disabled && onChange(parseInt(e.target.value, 10))}
          className="w-full accent-violet-600"
          disabled={disabled}
        />
        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-200 whitespace-nowrap">
          {['hourly', 'daily', 'weekly', 'monthly'][valueIndex]}
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
  locked,
  upgradeHref,
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
  locked?: boolean;
  upgradeHref?: string;
}) {
  return (
    <div
      className="flex-1 bg-amber-50/60 border border-amber-200 rounded-2xl p-4 shadow-sm min-h-[480px]"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-[15px]">{label}</h3>
        <div className="flex items-center gap-2">
          {locked && upgradeHref && (
            <a href={upgradeHref} className="text-[11px] px-2 py-0.5 rounded bg-amber-500 text-white hover:bg-amber-600">
              Upgrade
            </a>
          )}
          <button
            onClick={onPlus}
            className="text-[11px] px-2 py-0.5 rounded bg-amber-100 border border-amber-200 hover:bg-amber-200 disabled:opacity-60"
            title={`Create a new ${type === 'zeta' ? 'Zeta' : 'User'} task`}
            disabled={!!locked}
          >
            ➕
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="text-xs text-slate-700">
          {locked ? (
            <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-white/90 p-3">
              <span>Upgrade to add Zeta tasks.</span>
              {upgradeHref && (
                <a href={upgradeHref} className="text-[11px] px-2 py-0.5 rounded bg-amber-500 text-white hover:bg-amber-600">
                  Upgrade
                </a>
              )}
            </div>
          ) : (
            <span className="italic">Drop a suggestion here or click + to add a new task.</span>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((t) => (
            <li key={t.id} className="relative w-full bg-white/95 border border-amber-200 rounded-xl p-4 shadow-sm">
              <button
                onClick={() => onDelete(t.id)}
                className="absolute right-1.5 top-1.5 text-[10px] px-1.5 py-0.5 rounded border border-rose-200 bg-rose-50 hover:bg-rose-100 disabled:opacity-60"
                title="Delete task"
                disabled={!!locked}
              >
                ×
              </button>
              <p className="font-semibold text-[14px] leading-5 whitespace-pre-wrap break-words tracking-tight line-clamp-4 pr-6">
                {t.title}
              </p>
              {t.status !== 'under_construction' && (
                <div className="mt-2 text-[12px] text-slate-700">
                  <span className="font-semibold">Created:</span> {fmtDate(t.created_at)}
                </div>
              )}
              <div className="mt-2 flex items-center gap-1">
                <button
                  onClick={() => onEdit(t)}
                  className="text-[10px] px-1.5 py-[2px] rounded bg-amber-100 border border-amber-200 hover:bg-amber-200 disabled:opacity-60"
                  title="Edit"
                  disabled={!!locked}
                >
                  ✏️ Edit
                </button>
                {t.status === 'under_construction' && (
                  <button
                    onClick={() => onConfirm(t.id)}
                    className="text-[10px] px-1.5 py-[2px] rounded bg-emerald-100 text-emerald-900 border border-emerald-200 hover:bg-emerald-200 disabled:opacity-60"
                    title="Confirm (move to In progress)"
                    disabled={!!locked}
                  >
                    ✅ Confirm
                  </button>
                )}
                {(t.status === 'in_progress' || t.status === 'confirmed') && (
                  <button
                    onClick={() => onComplete(t.id)}
                    className="text-[10px] px-1.5 py-[2px] rounded bg-violet-100 text-violet-900 border border-violet-200 hover:bg-violet-200 disabled:opacity-60"
                    title="Mark as complete"
                    disabled={!!locked}
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
