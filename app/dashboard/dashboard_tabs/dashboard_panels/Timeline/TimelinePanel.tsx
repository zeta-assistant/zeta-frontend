  'use client';

  import React, { useEffect, useMemo, useState } from 'react';
  import { supabase } from '@/lib/supabaseClient';
  import {
    computeXP,
    levelProgress,
    LEVELS,
    type MetricCounts as XPMetrics,
    getXPCounts, // fallback
  } from '@/lib/XP';

  type Props = { projectId: string };

  type XPProgress = {
    level: number;
    title: string;
    nextTitle: string;
    pct: number;
    remaining: number;
    current: number;
    next: number;
    total: number;
  };

  const ZERO: XPMetrics = {
    user_messages: 0,
    zeta_messages: 0,
    zeta_actions: 0,
    files_uploaded: 0,
    files_generated: 0,
    calendar_items: 0,
    goals_created: 0,
    goals_achieved: 0,
    outreach_messages: 0,
    zeta_thoughts: 0,
    tasks_zeta_created: 0,
    tasks_user_complete: 0,
    tasks_zeta_complete: 0,
    events_past: 0,
    functions_built: 0,
  };

  /** Robust parser for Supabase timestamps */
  function parseSupabaseTS(ts?: string | null): Date | null {
    if (!ts) return null;
    const hasTZ = /[zZ]|[+\-]\d{2}:\d{2}$/.test(ts);
    try {
      return new Date(hasTZ ? ts : `${ts}Z`);
    } catch {
      return null;
    }
  }

  // Fun confidence label
  function confidenceForLevel(lvl: number) {
    switch (lvl) {
      case 1: return 'Warming up';
      case 2: return 'Finding rhythm';
      case 3: return 'Dialed in';
      case 4: return 'Reliable';
      case 5: return 'Sharp';
      case 6: return 'On point';
      case 7: return 'Elite';
      case 8: return 'Executive';
      case 9: return 'Director-grade';
      case 10: return 'Supreme';
      default: return '—';
    }
  }

  const MAX_LEVEL = LEVELS.length;

  /* ---------------- Compact Confidence Gauge ---------------- */
  const ConfidenceGauge: React.FC<{ level: number; maxLevel: number; className?: string }> = ({
    level, maxLevel, className = '',
  }) => {
    const ratio = Math.max(0, Math.min(1, (level - 1) / (maxLevel - 1)));
    const cx = 30, cy = 30, r = 22;
    const angle = Math.PI * (1 - ratio);
    const needleX = cx + Math.cos(angle) * r;
    const needleY = cy - Math.sin(angle) * r;

    return (
      <div className={`rounded-lg border border-blue-800/60 bg-blue-900/40 p-2 ${className}`}>
        <div className="text-[11px] text-purple-200/90 mb-1 text-center">Confidence</div>
        <svg viewBox="0 0 60 40" className="w-[96px] h-[64px]">
          <defs>
            <linearGradient id="gaugeArc" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#ef4444" />
              <stop offset="50%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#f59e0b" />
            </linearGradient>
          </defs>
          <path d="M6,30 A24,24 0 0 1 54,30" fill="none" stroke="url(#gaugeArc)" strokeWidth="6" strokeLinecap="round" />
          <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke="#e5e7eb" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx={cx} cy={cy} r="2.6" fill="#111827" stroke="#e5e7eb" strokeWidth="1" />
        </svg>
        <div className="mt-1 text-center text-[11px] text-blue-100">{confidenceForLevel(level)}</div>
      </div>
    );
  };
  /* ---------------------------------------------------------- */

  type TitlesMap = Record<number, string>;
  const defaultTitlesMap: TitlesMap = Object.fromEntries(LEVELS.map(l => [l.level, l.title])) as TitlesMap;

  const TimelinePanel: React.FC<Props> = ({ projectId }) => {
    const [loading, setLoading] = useState(true);
    const [projectCreatedAt, setProjectCreatedAt] = useState<string>('');
    const [err, setErr] = useState<string | null>(null);

    const [counts, setCounts] = useState<XPMetrics>(ZERO);
    const [prog, setProg] = useState<XPProgress>({
      level: 1,
      title: defaultTitlesMap[1],
      nextTitle: defaultTitlesMap[2],
      pct: 0,
      remaining: 100,
      current: 0,
      next: 100,
      total: 0,
    });

    // Live DB counters
    const [zetaSuggestionsCount, setZetaSuggestionsCount] = useState<number | null>(null);
    const [zetaTasksCompleted, setZetaTasksCompleted] = useState<number | null>(null);
    const [userTasksCompleted, setUserTasksCompleted] = useState<number | null>(null);

    // Customisable titles
    const [titles, setTitles] = useState<TitlesMap>(defaultTitlesMap);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<TitlesMap>(defaultTitlesMap);
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState<string | null>(null);

    const getTitle = (lvl: number) => titles[lvl] ?? defaultTitlesMap[lvl] ?? `Level ${lvl}`;

    function computeProgressFromCounts(c: Partial<XPMetrics>): XPProgress {
      const cFull = { ...ZERO, ...c };
      const total = computeXP(cFull);
      const lp = levelProgress(total);
      const isMax = lp.level >= lp.maxLevel && lp.pct === 100;
      const title = getTitle(lp.level);
      const nextTitle = isMax ? title : getTitle(Math.min(lp.level + 1, LEVELS.length));
      return {
        level: lp.level,
        title,
        nextTitle,
        pct: isMax ? 100 : lp.pct,
        remaining: isMax ? 0 : lp.remaining,
        current: isMax ? 0 : lp.inLevel,
        next: isMax ? 0 : lp.needed,
        total,
      };
    }

    // Load project created_at + titles + XP counters
    useEffect(() => {
      if (!projectId) return;
      let mounted = true;

      (async () => {
        setLoading(true);
        setErr(null);
        setSaveMsg(null);
        try {
          // Project created_at
          const { data: proj, error: pErr } = await supabase
            .from('user_projects')
            .select('created_at')
            .eq('id', projectId)
            .single();
          if (pErr) throw pErr;
          if (!mounted) return;
          setProjectCreatedAt(proj?.created_at ?? '');

          // Load custom titles (if any)
          const { data: rows } = await supabase
            .from('level_titles')
            .select('level,title')
            .eq('project_id', projectId);

          if (mounted) {
            const merged = { ...defaultTitlesMap };
            (rows ?? []).forEach((r: any) => {
              if (r?.level && r?.title) merged[r.level] = String(r.title);
            });
            setTitles(merged);
            setDraft(merged);
          }

         // RPC + fallback metrics (merge)
// 1) Try RPC (may return only some fields, e.g. the two message counts)
// 2) Always get fallback, then override with whatever RPC provided
let rpcCounts: Partial<XPMetrics> | null = null;
try {
  const { data, error } = await supabase.rpc('fetch_xp_counts', { p_project_id: projectId });
  if (!error && data) rpcCounts = typeof data === 'string' ? JSON.parse(data) : data;
} catch {
  rpcCounts = null;
}

// Always compute fallback; merge RPC on top so its fields win.
const fallbackCounts = await getXPCounts(projectId);
const c: Partial<XPMetrics> = { ...fallbackCounts, ...(rpcCounts ?? {}) };

if (!mounted) return;
setCounts({ ...ZERO, ...c });
setProg(computeProgressFromCounts(c));

          // Live counts from DB
          const [sugRes, zDoneRes, uDoneRes] = await Promise.all([
            supabase
              .from('zeta_suggestions')
              .select('id', { count: 'exact', head: true })
              .eq('project_id', projectId)
              .eq('owner', 'zeta'),
            supabase
              .from('task_items')
              .select('id', { count: 'exact', head: true })
              .eq('project_id', projectId)
              .eq('task_type', 'zeta')
              .eq('status', 'completed'),
            supabase
              .from('task_items')
              .select('id', { count: 'exact', head: true })
              .eq('project_id', projectId)
              .eq('task_type', 'user')
              .eq('status', 'completed'),
          ]);

          if (!mounted) return;
          if (sugRes?.count != null) setZetaSuggestionsCount(sugRes.count);
          if (zDoneRes?.count != null) setZetaTasksCompleted(zDoneRes.count);
          if (uDoneRes?.count != null) setUserTasksCompleted(uDoneRes.count);
        } catch (e: any) {
          if (!mounted) return;
          setErr(e?.message || 'Failed to load data');
        } finally {
          if (!mounted) return;
          setLoading(false);
        }
      })();

      return () => {
        mounted = false;
      };
    }, [projectId]);

    // Recompute progress whenever titles or counts change
    useEffect(() => {
      setProg(prev => computeProgressFromCounts(counts));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [titles, counts]);

    // Duration breakdown
    const { months, weeks, days, hours, startDate } = useMemo(() => {
      if (!projectCreatedAt) return { months: 0, weeks: 0, days: 0, hours: 0, startDate: null as Date | null };
      const start = parseSupabaseTS(projectCreatedAt);
      const end = new Date();
      if (!start) return { months: 0, weeks: 0, days: 0, hours: 0, startDate: null };

      let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
      const mAnchor = new Date(start);
      mAnchor.setMonth(start.getMonth() + months);
      if (mAnchor > end) {
        months -= 1; mAnchor.setMonth(mAnchor.getMonth() - 1);
      }
      let ms = end.getTime() - mAnchor.getTime();
      const weeks = Math.floor(ms / (7 * 86_400_000)); ms -= weeks * 7 * 86_400_000;
      const days  = Math.floor(ms / 86_400_000);       ms -= days  * 86_400_000;
      const hours = Math.floor(ms / 3_600_000);

      return { months, weeks, days, hours, startDate: start };
    }, [projectCreatedAt]);

    const RowSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
      <div className="rounded-2xl border border-blue-700 bg-blue-950/50 p-3">
        <h3 className="text-sm font-semibold text-purple-200/90 mb-2">{title}</h3>
        <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
          {children}
        </div>
      </div>
    );

    const Chip: React.FC<{ label: string; value: number; emoji?: string }> = ({ label, value, emoji }) => (
      <div className="rounded-lg border border-blue-700 bg-blue-950/60 px-3 py-2 h-[52px] flex items-center justify-between">
        <div className="text-[12px] text-purple-200/90 flex items-center gap-1">
          {emoji && <span aria-hidden className="text-sm leading-none">{emoji}</span>}
          <span className="leading-tight">{label}</span>
        </div>
        <div className="text-lg font-semibold">{value}</div>
      </div>
    );

    async function saveTitles() {
      setSaving(true);
      setSaveMsg(null);
      try {
        const toDelete: number[] = [];
        const upserts: { project_id: string; level: number; title: string }[] = [];

        for (let lvl = 1; lvl <= MAX_LEVEL; lvl++) {
          const text = (draft[lvl] ?? '').trim();
          if (!text || text === defaultTitlesMap[lvl]) {
            toDelete.push(lvl);
          } else {
            upserts.push({ project_id: projectId, level: lvl, title: text });
          }
        }

        if (toDelete.length) {
          await supabase.from('level_titles')
            .delete()
            .eq('project_id', projectId)
            .in('level', toDelete);
        }

        if (upserts.length) {
          await supabase
            .from('level_titles')
            .upsert(upserts, { onConflict: 'project_id,level' });
        }

        setTitles({ ...defaultTitlesMap, ...draft });
        setEditing(false);
        setSaveMsg('Saved custom level names.');
      } catch (e: any) {
        setSaveMsg(e?.message || 'Failed to save.');
      } finally {
        setSaving(false);
        setProg(prev => computeProgressFromCounts(counts));
      }
    }

    function resetToDefaultsInEditor() {
      setDraft({ ...defaultTitlesMap });
    }

    return (
      <div className="p-3 md:p-4 lg:p-6 pb-10 text-purple-100">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
          {/* Project duration */}
          <div className="rounded-2xl border border-blue-700 bg-blue-950/50 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-purple-200/90 font-semibold">Project duration</div>
              <div className="text-[11px] text-purple-300/80">
                {startDate &&
                  startDate.toLocaleDateString(undefined, {
                    month: 'short', day: 'numeric', year: 'numeric',
                  })}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: 'months', value: isNaN(Number(months)) ? 0 : months },
                { label: 'weeks',  value: isNaN(Number(weeks )) ? 0 : weeks  },
                { label: 'days',   value: isNaN(Number(days  )) ? 0 : days   },
                { label: 'hours',  value: isNaN(Number(hours )) ? 0 : hours  },
              ].map((t) => (
                <div key={t.label} className="rounded-xl border border-blue-700 bg-blue-900/40 p-2 text-center">
                  <div className="text-2xl font-semibold leading-6">{t.value}</div>
                  <div className="text-[11px] text-purple-300/80">{t.label}</div>
                </div>
              ))}
            </div>

            <div className="mt-3 h-px bg-blue-800/60 rounded" />

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="rounded-lg border border-blue-700 bg-blue-900/40 px-3 py-2 flex items-center justify-between">
                <div className="text-[12px] text-purple-200/90 flex items-center gap-1">
                  <span aria-hidden className="text-base">🎯</span>
                  <span>Goals created</span>
                </div>
                <div className="text-lg font-semibold">{counts.goals_created ?? 0}</div>
              </div>

              <div className="rounded-lg border border-blue-700 bg-blue-900/40 px-3 py-2 flex items-center justify-between">
                <div className="text-[12px] text-purple-200/90 flex items-center gap-1">
                  <span aria-hidden className="text-base">✅</span>
                  <span>Goals achieved</span>
                </div>
                <div className="text-lg font-semibold">{counts.goals_achieved ?? 0}</div>
              </div>
            </div>
          </div>

          {/* XP / Level */}
          <div className="rounded-2xl border border-blue-700 bg-blue-950/50 p-3">
            <div className="flex items-center justify-between mb-1">
              {/* Make the title a button too */}
              <button
                type="button"
                onClick={() => { setDraft(titles); setEditing(true); }}
                className="text-sm font-semibold hover:underline underline-offset-2 focus:outline-none focus:ring-2 focus:ring-purple-400/40 rounded"
                title="Edit level names"
              >
                Zeta XP ⚡
              </button>

              <div className="flex items-center gap-2">
                {/* Text button (≥sm) */}
                <button
                  onClick={() => { setDraft(titles); setEditing(true); }}
                  className="hidden sm:inline-flex text-[11px] px-2 py-1 rounded-md border border-purple-400/60 hover:border-purple-300/80 hover:bg-purple-300/10 transition whitespace-nowrap"
                  title="Edit level names"
                >
                  Edit Level Names
                </button>

                {/* Pencil icon (xs) */}
                <button
                  onClick={() => { setDraft(titles); setEditing(true); }}
                  className="inline-flex sm:hidden p-1 rounded-md border border-purple-400/60 hover:bg-purple-300/10"
                  aria-label="Edit level names"
                  title="Edit level names"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" stroke="currentColor" strokeWidth="1.5"/>
                  </svg>
                </button>

                <div className="px-2 py-0.5 rounded-full border border-purple-400/60 text-[11px] font-semibold">
                  LEVEL {prog.level}
                </div>
              </div>
            </div>

            <div className="text-[13px] text-blue-100/90 mb-1">
              <span className="font-medium">{prog.title}</span>
              {(prog.level < MAX_LEVEL || prog.remaining > 0) && (
                <>
                  <span className="mx-2">→</span>
                  <span className="opacity-80">Next:</span> {prog.nextTitle}
                </>
              )}
            </div>

            <div className="grid grid-cols-[auto,1fr] items-center gap-3">
              <div className="shrink-0 w-[120px]">
                <div className="w-20 h-20 rounded-xl border border-blue-700 bg-blue-900/60 overflow-hidden grid place-items-center mx-auto">
                  <img src="/zeta-avatar.svg" alt="Zeta avatar" className="w-full h-full object-contain" />
                </div>

                <div className="mt-2">
                  <div className="h-2 rounded-full bg-blue-900 overflow-hidden">
                    <div
                      className="h-2 bg-gradient-to-r from-amber-300 to-purple-400"
                      style={{ width: `${Math.min(100, Math.max(0, prog.pct))}%` }}
                    />
                  </div>
                  <div className="mt-1 text-[11px] text-purple-300/80 text-center">
                    {prog.level >= MAX_LEVEL && prog.remaining === 0
                      ? `Max level reached · ${prog.total.toLocaleString()} XP`
                      : `${prog.current} / ${prog.next} XP `}
                  </div>
                </div>
              </div>

              <ConfidenceGauge level={prog.level} maxLevel={MAX_LEVEL} className="justify-self-end" />
            </div>
          </div>
        </div>

        {err && (
          <div className="mb-3 rounded-md border border-red-400 bg-red-900/40 p-3 text-sm text-red-200">
            {err}
          </div>
        )}

        {!!saveMsg && (
          <div className="mb-3 rounded-md border border-blue-400 bg-blue-900/40 p-3 text-xs text-blue-100">
            {saveMsg}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mb-2">
          <RowSection title="Messages">
            <Chip label="User messages" value={counts.user_messages ?? 0} emoji="📨" />
            <Chip label="Zeta messages" value={counts.zeta_messages ?? 0} emoji="🤖" />
            <Chip label="Outreach messages" value={counts.outreach_messages ?? 0} emoji="📣" />
            <Chip label="Zeta thoughts" value={counts.zeta_thoughts ?? 0} emoji="🧠" />
          </RowSection>

          <RowSection title="Automation">
            <Chip label="Autonomous actions" value={counts.zeta_actions ?? 0} emoji="⚙️" />
            <Chip
              label="Task suggestions generated by Zeta"
              value={(zetaSuggestionsCount ?? counts.tasks_zeta_created) ?? 0}
              emoji="🗒️"
            />
            <Chip
              label="Zeta tasks completed"
              value={(zetaTasksCompleted ?? counts.tasks_zeta_complete) ?? 0}
              emoji="🤝"
            />
            <Chip
              label="User tasks completed"
              value={(userTasksCompleted ?? counts.tasks_user_complete) ?? 0}
              emoji="🙌"
            />
          </RowSection>

          <RowSection title="Files">
            <Chip label="Files uploaded" value={counts.files_uploaded ?? 0} emoji="📤" />
            <Chip label="Files generated" value={counts.files_generated ?? 0} emoji="🧾" />
          </RowSection>

          <RowSection title="Calendar & Goals">
            <Chip label="Calendar items" value={counts.calendar_items ?? 0} emoji="🗓️" />
            <Chip label="Events past" value={counts.events_past ?? 0} emoji="⏱️" />
          </RowSection>
        </div>

        {loading && <div className="mt-3 text-xs text-purple-300/70">Loading…</div>}

        {/* ─────────── Edit Modal ─────────── */}
        {editing && (
          <div className="fixed inset-0 z-50 grid place-items-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => setEditing(false)} />
            <div className="relative w-[min(720px,92vw)] max-h-[85vh] overflow-auto rounded-2xl border border-purple-400/30 bg-gradient-to-b from-blue-950 to-blue-900 p-4 shadow-2xl">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold text-purple-100">Edit Zeta Level Names</div>
                <button
                  onClick={() => setEditing(false)}
                  className="text-xs px-2 py-1 rounded-md border border-blue-400/50 hover:bg-blue-400/10"
                >
                  Close
                </button>
              </div>

              <p className="text-[12px] text-purple-200/80 mb-3">
                Customise what each level is called for this project. Leave a field blank (or set to default)
                to use the default title.
              </p>

              <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
                {Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).map((lvl) => (
                  <label key={lvl} className="flex flex-col gap-1 rounded-lg border border-blue-700 bg-blue-950/60 p-2">
                    <span className="text-[11px] text-purple-300/90">
                      Level {lvl}
                      <span className="opacity-60"> · default: “{defaultTitlesMap[lvl]}”</span>
                    </span>
                    <input
                      value={draft[lvl] ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, [lvl]: e.target.value }))}
                      placeholder={defaultTitlesMap[lvl]}
                      className="rounded-md bg-blue-900/60 border border-blue-700 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-purple-400/40"
                    />
                  </label>
                ))}
              </div>

              <div className="flex items-center justify-between mt-4">
                <button
                  onClick={resetToDefaultsInEditor}
                  className="text-[12px] px-2 py-1 rounded-md border border-blue-400/60 hover:bg-blue-400/10"
                  title="Reset editor fields to defaults"
                >
                  Reset to defaults
                </button>
                <div className="flex items-center gap-2">
                  <button
                    disabled={saving}
                    onClick={() => setEditing(false)}
                    className="text-[12px] px-3 py-1 rounded-md border border-blue-400/60 hover:bg-blue-400/10 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={saving}
                    onClick={saveTitles}
                    className="text-[12px] px-3 py-1 rounded-md border border-purple-400/80 bg-purple-500/10 hover:bg-purple-500/20 disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* ───────── End Modal ───────── */}
      </div>
    );
  };

  export default TimelinePanel;
