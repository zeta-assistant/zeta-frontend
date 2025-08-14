'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type FnStatus = 'idle' | 'running' | 'error' | 'disabled' | 'queued';
type FnTrigger = 'manual' | 'scheduled' | 'webhook';

type ZetaFunction = {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  status: FnStatus;
  trigger: FnTrigger;
  cron: string | null;
  last_run_at: string | null;
  last_result_summary: string | null;
  created_at: string;
  updated_at: string;
};

type FnRun = {
  id: string;
  function_id: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'success' | 'failed';
  output_preview: string | null;
};

type Props = {
  projectId: string;
  fontSize?: 'sm' | 'base' | 'lg';
  /** compact = left panel summary (teal); full = builder/CRUD (teal buttons) */
  variant?: 'compact' | 'full';
  className?: string;
};

export default function FunctionsPanel({
  projectId,
  fontSize = 'base',
  variant = 'compact',
  className = '',
}: Props) {
  const sizeClass =
    fontSize === 'sm' ? 'text-sm' : fontSize === 'lg' ? 'text-lg' : 'text-base';

  const [loading, setLoading] = useState(true);
  const [hadError, setHadError] = useState(false);
  const [fns, setFns] = useState<ZetaFunction[]>([]);

  // Full variant state
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newTrigger, setNewTrigger] = useState<FnTrigger>('manual');
  const [newCron, setNewCron] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [runs, setRuns] = useState<Record<string, FnRun[]>>({});

  const running = fns.filter((f) => f.status === 'running' || f.status === 'queued');

  async function load() {
    setLoading(true);
    setHadError(false);
    try {
      const { data, error } = await supabase
        .from('zeta_functions')
        .select('*')
        .eq('project_id', projectId)
        .order('updated_at', { ascending: false });

      if (error) {
        console.warn('FunctionsPanel.load: DB error (showing placeholder)');
        setHadError(true);
        setFns([]);
      } else {
        setFns((data as ZetaFunction[]) ?? []);
      }
    } catch {
      console.warn('FunctionsPanel.load: exception (showing placeholder)');
      setHadError(true);
      setFns([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [projectId]);

  // ===== Compact (left panel, teal card) =====
  if (variant === 'compact') {
    return (
      <div
        className={[
          'rounded-2xl p-4 shadow border',
          'bg-teal-900/35 border-teal-400',
          sizeClass,
          className,
        ].join(' ')}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-white">⚙️ Running Functions</h3>
          <span className="text-[11px] px-2 py-0.5 rounded-full border bg-teal-600/60 border-teal-300 text-white">
            {running.length}
          </span>
        </div>

        <p className="text-teal-100/90 text-xs mt-1">
          Live view of currently running or queued automations.
        </p>

        {hadError && (
          <div className="mt-2 text-xs bg-amber-900/30 border border-amber-500/40 rounded-md p-2 text-amber-100">
            Temporarily unable to read functions. Showing placeholder view.
          </div>
        )}

        <div className="mt-3">
          {loading ? (
            <div className="text-sm text-white/75">Loading…</div>
          ) : running.length === 0 ? (
            <div className="text-sm text-white/75">None running right now.</div>
          ) : (
            <ul className="space-y-2">
              {running.map((fn) => (
                <li
                  key={fn.id}
                  className="bg-teal-950/40 border border-teal-500/50 rounded-xl p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-teal-50 font-medium">{fn.name}</div>
                      {fn.description && (
                        <div className="text-xs text-teal-100/80 mt-0.5 line-clamp-2">
                          {fn.description}
                        </div>
                      )}
                      <div className="text-[11px] text-teal-100/80 mt-1">
                        {fn.status === 'queued' ? 'Queued' : 'Running'} • {fn.trigger}
                        {fn.trigger === 'scheduled' && fn.cron ? ` • ${fn.cron}` : ''}
                      </div>
                    </div>
                    <span
                      className={
                        'text-[11px] px-2 py-0.5 rounded-full border ' +
                        (fn.status === 'queued'
                          ? 'bg-amber-900/40 border-amber-400 text-amber-200'
                          : 'bg-sky-900/40 border-sky-400 text-sky-200')
                      }
                    >
                      {fn.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // ===== Full variant (builder/CRUD) =====
  async function handleCreate() {
    if (!newName.trim()) return;
    const payload = {
      project_id: projectId,
      name: newName.trim(),
      description: newDesc.trim() || null,
      status: 'idle' as FnStatus,
      trigger: newTrigger,
      cron: newTrigger === 'scheduled' ? (newCron.trim() || null) : null,
      last_run_at: null,
      last_result_summary: null,
    };
    const { error } = await supabase.from('zeta_functions').insert(payload);
    if (error) {
      console.warn('FunctionsPanel.create: DB error');
      setHadError(true);
      return;
    }
    setNewName(''); setNewDesc(''); setNewTrigger('manual'); setNewCron('');
    setCreating(false);
    load();
  }

  async function handleRun(fn: ZetaFunction) {
    await supabase.from('zeta_functions').update({ status: 'queued' }).eq('id', fn.id);
    const { data: runRows, error: runErr } = await supabase
      .from('zeta_function_runs')
      .insert({ function_id: fn.id, started_at: new Date().toISOString(), status: 'running' })
      .select('id')
      .limit(1);
    if (runErr) {
      await supabase.from('zeta_functions').update({ status: 'idle' }).eq('id', fn.id);
      setHadError(true);
      return;
    }
    const runId = runRows?.[0]?.id as string;
    setTimeout(async () => {
      const finished = new Date().toISOString();
      await supabase
        .from('zeta_function_runs')
        .update({ finished_at: finished, status: 'success', output_preview: 'Completed (demo executor).' })
        .eq('id', runId);
      await supabase
        .from('zeta_functions')
        .update({ status: 'idle', last_run_at: finished, last_result_summary: 'Completed (demo executor).' })
        .eq('id', fn.id);
      void load();
    }, 1200);
  }

  async function handleToggle(fn: ZetaFunction) {
    const next = fn.status === 'disabled' ? 'idle' : 'disabled';
    await supabase.from('zeta_functions').update({ status: next }).eq('id', fn.id);
    load();
  }

  async function handleDelete(fn: ZetaFunction) {
    if (!confirm(`Delete “${fn.name}”? This will remove its run history.`)) return;
    await supabase.from('zeta_function_runs').delete().eq('function_id', fn.id);
    await supabase.from('zeta_functions').delete().eq('id', fn.id);
    load();
  }

  async function loadRuns(fnId: string) {
    const { data, error } = await supabase
      .from('zeta_function_runs')
      .select('*')
      .eq('function_id', fnId)
      .order('started_at', { ascending: false })
      .limit(5);
    if (!error) setRuns((r) => ({ ...r, [fnId]: (data as FnRun[]) ?? [] }));
  }

  function toggleExpand(fnId: string) {
    setExpanded((e) => {
      const next = !e[fnId];
      if (next) void loadRuns(fnId);
      return { ...e, [fnId]: next };
    });
  }

  function statusChip(s: FnStatus) {
    const base = 'text-[11px] px-2 py-0.5 rounded-full border';
    switch (s) {
      case 'running':  return `${base} bg-blue-900/40 border-blue-400 text-blue-200`;
      case 'error':    return `${base} bg-red-900/40 border-red-400 text-red-200`;
      case 'disabled': return `${base} bg-slate-900/40 border-slate-400 text-slate-300`;
      case 'queued':   return `${base} bg-amber-900/40 border-amber-400 text-amber-200`;
      default:         return `${base} bg-emerald-900/40 border-emerald-400 text-emerald-200`;
    }
  }

  const empty = !loading && fns.length === 0;

  return (
    <div className={`p-6 overflow-y-auto text-indigo-200 space-y-6 ${sizeClass} ${className}`}>
      <div>
        <h2 className="text-lg text-white font-semibold">🛠️ Custom Functions</h2>
        <p className="text-gray-400 text-sm mt-1">
          Build or manage the automation tools Zeta uses to handle your data and logic.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setCreating((v) => !v)}
          className="bg-teal-500 hover:bg-teal-600 text-white px-4 py-2 rounded-lg shadow text-sm"
        >
          ➕ New Function
        </button>
      </div>

      {creating && (
        <div className="bg-blue-950/60 border border-indigo-500 rounded-lg p-4 space-y-3">
          <div className="grid gap-2 md:grid-cols-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Function name"
              className="w-full bg-transparent border border-indigo-500/50 rounded-md p-2 text-indigo-100 placeholder-indigo-300 text-sm"
            />
            <select
              value={newTrigger}
              onChange={(e) => setNewTrigger(e.target.value as FnTrigger)}
              className="bg-transparent border border-indigo-500/50 rounded-md p-2 text-indigo-100 text-sm"
            >
              <option value="manual">Manual</option>
              <option value="scheduled">Scheduled</option>
              <option value="webhook">Webhook</option>
            </select>
          </div>
          {newTrigger === 'scheduled' && (
            <input
              value={newCron}
              onChange={(e) => setNewCron(e.target.value)}
              placeholder="CRON (e.g. 0 9 * * *)"
              className="w-full bg-transparent border border-indigo-500/50 rounded-md p-2 text-indigo-100 placeholder-indigo-300 text-sm"
            />
          )}
          <textarea
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="What does it do?"
            className="w-full bg-transparent border border-indigo-500/50 rounded-md p-2 text-indigo-100 placeholder-indigo-300 text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              className="bg-teal-500 hover:bg-teal-600 text-white px-4 py-2 rounded-lg shadow text-sm"
            >
              Create
            </button>
            <button
              onClick={() => setCreating(false)}
              className="border border-slate-500/60 text-slate-200 hover:bg-slate-900/40 px-4 py-2 rounded-lg text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {loading && <div className="text-sm text-slate-300">Loading…</div>}
        {hadError && !loading && (
          <div className="text-xs bg-amber-900/30 border border-amber-500/40 rounded-md p-2 text-amber-100">
            Functions unavailable. Placeholder shown.
          </div>
        )}
        {empty && !hadError && (
          <div className="text-sm text-slate-300">No functions yet. Create your first.</div>
        )}

        {fns.map((fn) => (
          <div key={fn.id} className="bg-blue-950/60 border border-indigo-500 rounded-lg p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <div className="font-medium text-indigo-50">{fn.name}</div>
                  <span className={statusChip(fn.status)}>{fn.status}</span>
                </div>
                {fn.description && (
                  <div className="text-xs text-indigo-200/80 mt-1 line-clamp-2">{fn.description}</div>
                )}
                <div className="text-[11px] text-indigo-300/80 mt-1">
                  trigger: <b>{fn.trigger}</b>
                  {fn.trigger === 'scheduled' && fn.cron ? ` • ${fn.cron}` : ''}
                  {fn.last_run_at ? ` • last run ${new Date(fn.last_run_at).toLocaleString()}` : ''}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleRun(fn)}
                  disabled={fn.status === 'running' || fn.status === 'disabled'}
                  className="px-3 py-1 rounded-full border border-indigo-500 bg-indigo-900/40 hover:bg-indigo-900 text-indigo-100 text-sm disabled:opacity-50"
                  title="Run now"
                >
                  ▶ Run
                </button>
                <button
                  onClick={() => handleToggle(fn)}
                  className="px-3 py-1 rounded-full border border-slate-500 bg-slate-900/40 hover:bg-slate-900 text-slate-100 text-sm"
                >
                  {fn.status === 'disabled' ? 'Enable' : 'Disable'}
                </button>
                <button
                  onClick={() => handleDelete(fn)}
                  className="px-3 py-1 rounded-full border border-red-500 bg-red-900/30 hover:bg-red-900 text-red-100 text-sm"
                >
                  Delete
                </button>
              </div>
            </div>

            {/* recent runs */}
            <div className="mt-2 flex items-center justify-between">
              <button
                onClick={() =>
                  setExpanded((e) => {
                    const next = !e[fn.id];
                    if (next) void loadRuns(fn.id);
                    return { ...e, [fn.id]: next };
                  })
                }
                className="text-xs text-purple-300 hover:underline"
              >
                {expanded[fn.id] ? 'Hide runs' : 'View recent runs'}
              </button>
              {fn.last_result_summary && (
                <div className="text-[11px] text-indigo-300/80">{fn.last_result_summary}</div>
              )}
            </div>

            {expanded[fn.id] && (
              <div className="mt-2 border-t border-indigo-500/40 pt-2">
                {(runs[fn.id] ?? []).length === 0 ? (
                  <div className="text-xs text-slate-300">No recent runs.</div>
                ) : (
                  <ul className="space-y-1">
                    {(runs[fn.id] ?? []).map((r) => (
                      <li key={r.id} className="text-xs text-indigo-100 flex justify-between">
                        <span>
                          {new Date(r.started_at).toLocaleString()} →{' '}
                          {r.finished_at ? new Date(r.finished_at).toLocaleTimeString() : '—'}
                        </span>
                        <span
                          className={
                            r.status === 'success'
                              ? 'text-emerald-300'
                              : r.status === 'failed'
                              ? 'text-red-300'
                              : 'text-blue-300'
                          }
                        >
                          {r.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}