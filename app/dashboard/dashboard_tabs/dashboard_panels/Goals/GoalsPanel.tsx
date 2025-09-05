'use client';

import React, { JSX, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import dayjs from 'dayjs';

type Goal = {
  id: string;
  description: string;
  created_at?: string | null;
};

const MAX_SHORT = 5;
const MAX_LONG = 3;

const VISION_MIN = 1;
const VISION_MAX = 50;

/** ─────────────────────────────────────────────────────────
 * Auto-resizing textarea (no scrollbar, no resize handle)
 * ───────────────────────────────────────────────────────── */
function AutoTextarea({
  value,
  onChange,
  placeholder,
  className = '',
  minRows = 1,
  disabled = false,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  className?: string;
  minRows?: number;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    resize();
  }, [value]);

  useEffect(() => {
    // initial mount
    resize();
  }, []);

  return (
    <textarea
      ref={ref}
      value={value}
      placeholder={placeholder}
      onChange={(e) => {
        onChange(e);
        // next tick to allow value to update
        requestAnimationFrame(resize);
      }}
      rows={minRows}
      disabled={disabled}
      className={[
        // kill resize handle + scrollbars
        'resize-none overflow-hidden',
        // preserve your styling
        className,
      ].join(' ')}
      style={{ height: 'auto' }}
    />
  );
}

export default function GoalsPanel({
  fontSize,
  projectId,
}: {
  fontSize: 'sm' | 'base' | 'lg';
  projectId: string;
}) {
  const [vision, setVision] = useState('');
  const [visionEditing, setVisionEditing] = useState(false);
  const [visionSaving, setVisionSaving] = useState(false);

  const [shortTermGoals, setShortTermGoals] = useState<Goal[]>([]);
  const [longTermGoals, setLongTermGoals] = useState<Goal[]>([]);

  const [loading, setLoading] = useState(true);
  const [savingGoals, setSavingGoals] = useState(false);
  const [newGoalCounter, setNewGoalCounter] = useState(0);

  // Report modal state
  const [reportOpen, setReportOpen] = useState(false);
  const [reportSaving, setReportSaving] = useState(false);
  const [selectedShortIds, setSelectedShortIds] = useState<Set<string>>(new Set());
  const [selectedLongIds, setSelectedLongIds] = useState<Set<string>>(new Set());
  const [zetaLevel, setZetaLevel] = useState<string>('');
  const [reportNotes, setReportNotes] = useState<string>('');

  // Portfolio preview modal (after save)
  const [portfolioPreview, setPortfolioPreview] = useState<{
    title: string;
    text: string;
    url: string | null;
  } | null>(null);

  const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

  function coerceArray(raw: unknown): string[] {
    if (Array.isArray(raw)) return raw.map(String);
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.map(String);
      } catch {}
      return [raw];
    }
    return [];
  }

  function parseGoals(raw: unknown, limit: number): string[] {
    const asArray = coerceArray(raw);
    if (asArray.length > 1) {
      return Array.from(
        new Set(
          asArray
            .map((v) => v.trim())
            .filter(Boolean)
            .map((v) => v.replace(/^[-•*]\s*/, '')),
        ),
      ).slice(0, limit);
    }
    const txt = (asArray[0] ?? '') as string;
    return txt
      .split(/\n|\\n|•|-|\*/g)
      .map((s) => s.trim().replace(/^[-•*]\s*/, ''))
      .filter(Boolean)
      .slice(0, limit);
  }

  async function seedGoalsFromUserProjectsIfEmpty(pid: string) {
    const { data: existing } = await supabase
      .from('goals')
      .select('id')
      .eq('project_id', pid)
      .limit(1);
    if (existing?.length) return;

    const { data: projectData } = await supabase
      .from('user_projects')
      .select('short_term_goals, long_term_goals')
      .eq('id', pid)
      .single();

    const rows: any[] = [];
    for (const d of parseGoals(projectData?.short_term_goals, MAX_SHORT)) {
      rows.push({ project_id: pid, goal_type: 'short_term', description: d });
    }
    for (const d of parseGoals(projectData?.long_term_goals, MAX_LONG)) {
      rows.push({ project_id: pid, goal_type: 'long_term', description: d });
    }
    if (rows.length) await supabase.from('goals').insert(rows);
  }

  async function fetchVision(pid: string) {
    const { data } = await supabase
      .from('user_projects')
      .select('vision')
      .eq('id', pid)
      .single();
    setVision(data?.vision || '');
  }

  async function fetchGoalsForDisplay(pid: string) {
    const { data: stGoals } = await supabase
      .from('goals')
      .select('id, description, created_at')
      .eq('project_id', pid)
      .eq('goal_type', 'short_term')
      .order('created_at', { ascending: true });

    const seenST = new Set<string>();
    const dedupedST = (stGoals || []).filter((g) => {
      const key = normalize(g.description || '');
      if (!key || seenST.has(key)) return false;
      seenST.add(key);
      return true;
    });
    setShortTermGoals(dedupedST as Goal[]);

    const { data: ltGoals } = await supabase
      .from('goals')
      .select('id, description, created_at')
      .eq('project_id', pid)
      .eq('goal_type', 'long_term')
      .order('created_at', { ascending: true });

    const seenLT = new Set<string>();
    const dedupedLT = (ltGoals || []).filter((g) => {
      const key = normalize(g.description || '');
      if (!key || seenLT.has(key)) return false;
      seenLT.add(key);
      return true;
    });
    setLongTermGoals(dedupedLT as Goal[]);
  }

  useEffect(() => {
    if (!projectId) return;

    (async () => {
      setLoading(true);
      try {
        await seedGoalsFromUserProjectsIfEmpty(projectId);
        await fetchVision(projectId);
        await fetchGoalsForDisplay(projectId);
      } catch (err) {
        console.error('❌ Failed to load goals/vision:', err);
      } finally {
        setLoading(false);
      }
    })();

    const ch = supabase
      .channel(`realtime-goals-${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'goals', filter: `project_id=eq.${projectId}` },
        () => fetchGoalsForDisplay(projectId)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'user_projects', filter: `id=eq.${projectId}` },
        () => fetchVision(projectId)
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(ch);
    };
  }, [projectId]);

  async function saveVision() {
    setVisionSaving(true);
    try {
      const trimmed = (vision ?? '').trim();
      let toSave = trimmed;
      if (trimmed.length > VISION_MAX) {
        toSave = trimmed.slice(0, VISION_MAX);
        setVision(toSave);
      }
      if (toSave.length < VISION_MIN) {
        alert(`Vision must be at least ${VISION_MIN} character.`);
        return;
      }
      const { error } = await supabase
        .from('user_projects')
        .update({ vision: toSave })
        .eq('id', projectId);
      if (error) throw error;
      setVisionEditing(false);
    } catch (e) {
      console.error(e);
      alert('Error saving vision.');
    } finally {
      setVisionSaving(false);
    }
  }

  async function saveGoals() {
    setSavingGoals(true);
    try {
      const shortReal = shortTermGoals.filter((g) => !g.id.startsWith('temp-'));
      const shortTemp = shortTermGoals.filter((g) => g.id.startsWith('temp-'));
      const visibleShortReal = shortReal.slice(0, MAX_SHORT);
      const availableShortSlots = Math.max(0, MAX_SHORT - visibleShortReal.length);
      const shortTempToInsert = shortTemp.slice(0, availableShortSlots);

      for (const g of visibleShortReal) {
        const { error } = await supabase.from('goals').update({ description: g.description }).eq('id', g.id);
        if (error) throw error;
      }
      if (shortTempToInsert.length) {
        const toInsert = shortTempToInsert.map((g) => ({
          project_id: projectId,
          goal_type: 'short_term' as const,
          description: g.description,
        }));
        const { error } = await supabase.from('goals').insert(toInsert);
        if (error) throw error;
      }

      const longReal = longTermGoals.filter((g) => !g.id.startsWith('temp-'));
      const longTemp = longTermGoals.filter((g) => g.id.startsWith('temp-'));
      for (const g of longReal) {
        const { error } = await supabase.from('goals').update({ description: g.description }).eq('id', g.id);
        if (error) throw error;
      }
      if (longTemp.length) {
        const toInsert = longTemp.map((g) => ({
          project_id: projectId,
          goal_type: 'long_term' as const,
          description: g.description,
        }));
        const { error } = await supabase.from('goals').insert(toInsert);
        if (error) throw error;
      }

      alert('Goals saved!');
      await fetchGoalsForDisplay(projectId);
    } catch (e) {
      console.error(e);
      alert('Error saving goals');
    } finally {
      setSavingGoals(false);
    }
  }

  async function deleteGoal(goalId: string | undefined, type: 'short' | 'long') {
    if (!goalId || typeof goalId !== 'string') {
      console.error('❌ Invalid goalId passed to deleteGoal:', goalId);
      alert('Error: Invalid goal ID.');
      return;
    }
    if (goalId.startsWith('temp-')) return;

    try {
      const { error } = await supabase.from('goals').delete().eq('id', goalId);
      if (error) throw error;

      if (type === 'short') setShortTermGoals((p) => p.filter((g) => g.id !== goalId));
      else setLongTermGoals((p) => p.filter((g) => g.id !== goalId));
    } catch (e) {
      console.error('❌ deleteGoal error:', e);
      alert('Failed to delete goal.');
    }
  }

  function updateGoalDescription(goalId: string, newDesc: string, type: 'short' | 'long') {
    if (type === 'short') {
      setShortTermGoals((prev) => prev.map((g) => (g.id === goalId ? { ...g, description: newDesc } : g)));
    } else {
      setLongTermGoals((prev) => prev.map((g) => (g.id === goalId ? { ...g, description: newDesc } : g)));
    }
  }

  function CreatedMeta({ ts }: { ts?: string | null }) {
    if (!ts) return null;
    return <span className="text-[11px] text-white/60">Created {dayjs(ts).format('MMM D, YYYY • h:mm A')}</span>;
  }

  function renderEditableEmptySlots(count: number, type: 'short' | 'long') {
    const goals = type === 'short' ? shortTermGoals : longTermGoals;
    const maxCount = type === 'short' ? MAX_SHORT : count;

    const real = goals.filter((g) => !g.id.startsWith('temp-'));
    const temp = goals.filter((g) => g.id.startsWith('temp-'));

    const currentTotal = type === 'short' ? Math.min(real.length, MAX_SHORT) + temp.length : real.length + temp.length;
    const emptyCount = Math.max(0, maxCount - currentTotal);

    if (type === 'short' && currentTotal >= MAX_SHORT) return [];

    const slots: JSX.Element[] = [];

    temp.forEach((goal, idx) => {
      if (type === 'short' && real.length + idx >= MAX_SHORT) return;
      slots.push(
        <li
          key={goal.id}
          className="flex justify-between items-start bg-blue-900/20 border border-blue-700 rounded-md px-3 py-2"
        >
          <AutoTextarea
            value={goal.description}
            onChange={(e) => updateGoalDescription(goal.id, e.target.value, type)}
            minRows={1}
            placeholder={type === 'short' ? 'New short-term goal...' : 'New long-term goal...'}
            className="flex-1 bg-transparent border-none text-white placeholder:text-white/60"
          />
          <button
            onClick={() => deleteGoal(goal.id, type)}
            className="ml-2 text-red-400 hover:text-red-500 font-bold px-2"
            title="Delete goal"
            type="button"
          >
            ✖️
          </button>
        </li>,
      );
    });

    for (let i = 0; i < emptyCount; i++) {
      const tempId = `temp-${type}-${newGoalCounter + i + 1}`;
      slots.push(
        <li
          key={tempId}
          className="flex justify-between items-start bg-blue-900/10 border border-dashed border-blue-700 rounded-md px-3 py-2"
        >
          <AutoTextarea
            value=""
            onChange={(e) => {
              const desc = e.target.value;
              if (desc.trim() === '') return;
              if (type === 'short') {
                if (shortTermGoals.length >= MAX_SHORT) return;
                setShortTermGoals((prev) => [...prev, { id: tempId, description: desc }]);
              } else {
                setLongTermGoals((prev) => [...prev, { id: tempId, description: desc }]);
              }
              setNewGoalCounter((c) => c + 1);
            }}
            minRows={1}
            placeholder={type === 'short' ? 'Add new short-term goal...' : 'Add new long-term goal...'}
            className="flex-1 bg-transparent border-none text-white placeholder:text-white/60 italic"
          />
          <span className="ml-3 text-white/70 select-none">＋</span>
        </li>,
      );
    }

    return slots;
  }

  if (loading) {
    return <p className={`text-${fontSize} text-white/80`}>Loading goals...</p>;
  }

  const shortReal = shortTermGoals.filter((g) => !g.id.startsWith('temp-'));
  const shortRealVisible = shortReal.slice(0, MAX_SHORT);
  const hasExtraShort = shortReal.length > MAX_SHORT;

  const trimmedLen = (vision ?? '').trim().length;
  const overLimit = trimmedLen > VISION_MAX;

  // --- Helpers used by portfolio generation ---

  // Ensure a tracker row exists for a goal; return tracker object
  async function ensureTracker(goalId: string): Promise<{ id: string; created_at: string; completed_at: string | null }> {
    // Try fetch
    const { data, error } = await supabase
      .from('goal_trackers')
      .select('id, created_at, completed_at')
      .eq('project_id', projectId)
      .eq('goal_id', goalId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') throw error; // unexpected error

    if (data?.id) return { id: data.id, created_at: data.created_at as string, completed_at: (data.completed_at as string | null) ?? null };

    // Insert if missing
    const ins = await supabase
      .from('goal_trackers')
      .insert({ project_id: projectId, goal_id: goalId, status: 'active' })
      .select('id, created_at, completed_at')
      .single();

    if (ins.error) throw ins.error;
    return {
      id: ins.data.id as string,
      created_at: ins.data.created_at as string,
      completed_at: (ins.data.completed_at as string | null) ?? null,
    };
  }

  // Aggregate usage from daily_feature_usage_checker for a date window
  async function aggregateUsage(startISO: string, endISO: string) {
    // Pull daily rows in range
    const { data, error } = await supabase
      .from('daily_feature_usage_checker')
      .select('usage_date, sys_events_total, user_inputs_total, top_events, feature_counts')
      .eq('project_id', projectId)
      .gte('usage_date', dayjs(startISO).format('YYYY-MM-DD'))
      .lte('usage_date', dayjs(endISO).format('YYYY-MM-DD'))
      .order('usage_date', { ascending: true });

    if (error) throw error;

    // Aggregate totals
    const byEvent: Record<string, number> = {};
    let eventsTotal = 0;
    let userInputsTotal = 0;
    const activeDates = new Set<string>();

    for (const r of data ?? []) {
      const sys = Number(r.sys_events_total || 0);
      const usr = Number(r.user_inputs_total || 0);
      eventsTotal += sys;
      userInputsTotal += usr;
      if (sys || usr) activeDates.add(r.usage_date as string);

      // feature_counts is expected as jsonb like {"calendar":1,"chat":2}
      try {
        const fc = typeof r.feature_counts === 'string' ? JSON.parse(r.feature_counts) : (r.feature_counts || {});
        for (const k of Object.keys(fc)) {
          byEvent[k] = (byEvent[k] || 0) + Number(fc[k] || 0);
        }
      } catch {
        // ignore bad json
      }
    }

    const daysActive = dayjs(endISO).diff(dayjs(startISO), 'day') + 1;
    return {
      start_date: dayjs(startISO).format('YYYY-MM-DD'),
      end_date: dayjs(endISO).format('YYYY-MM-DD'),
      days_active: daysActive,
      active_days_with_usage: activeDates.size,
      events_total: eventsTotal,
      user_inputs_total: userInputsTotal,
      by_event: byEvent,
    };
  }

  // --- Report (Portfolio) generation + preview modal opening ---
  async function generateAndSavePortfolio() {
    setReportSaving(true);

    const sanitize = (s: string) =>
      (s || 'goal-portfolio')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 80)
        .replace(/[^\w\-().\s]/g, '')
        .replace(/\s/g, '_');

    try {
      const selectedShort = shortTermGoals.filter((g) => selectedShortIds.has(g.id));
      const selectedLong = longTermGoals.filter((g) => selectedLongIds.has(g.id));

      const now = dayjs();
      const title = `Goal Completion Portfolio — ${now.format('YYYY-MM-DD HH.mm')}`;

      const md: string[] = [];
      md.push(`# ${title}`, '');
      md.push(`**Project ID:** \`${projectId}\``);
      if (zetaLevel.trim()) md.push(`**Zeta Level:** ${zetaLevel.trim()}`);
      if (reportNotes.trim()) md.push(`**Notes:** ${reportNotes.trim()}`);
      md.push(`**Generated:** ${now.format('MMM D, YYYY • h:mm A')}`, '');

      async function section(header: string, goals: Goal[]) {
        md.push(`## ${header}`);
        if (goals.length === 0) {
          md.push('_None selected._', '');
          return;
        }
        for (const g of goals) {
          md.push(`- ${g.description}`);
          if (g.created_at) md.push(`  - _Created: ${dayjs(g.created_at).format('MMM D, YYYY h:mm A')}_`);

          // Ensure tracker and compute stats (using daily_feature_usage_checker)
          try {
            const tr = await ensureTracker(g.id);
            const startISO = tr.created_at;
            const endISO = tr.completed_at ?? now.toISOString();

            const stats = await aggregateUsage(startISO, endISO);

            md.push(`  - **Usage window:** ${stats.start_date} → ${stats.end_date}`);
            md.push(`  - **Days active:** ${stats.days_active}`);
            md.push(`  - **Active days with usage logged:** ${stats.active_days_with_usage}`);
            md.push(`  - **System events total:** ${stats.events_total}`);
            md.push(`  - **User inputs total:** ${stats.user_inputs_total}`);

            const byKeys = Object.keys(stats.by_event || {});
            if (byKeys.length) {
              md.push('  - **By feature/event:**');
              for (const k of byKeys.sort()) {
                md.push(`    - ${k}: ${stats.by_event[k]}`);
              }
            }
          } catch (e) {
            console.warn('Stats aggregation skipped for goal:', g.id, e);
          }

          md.push('');
        }
      }

      await section('Completed Short-Term Goals', selectedShort);
      await section('Completed Long-Term Goals', selectedLong);

      const fileText = md.join('\n');

      // Save to storage + DB so it appears in Files → Generated
      const BUCKET = 'project-docs';
      const fileName = `${sanitize(`goal-portfolio-${now.format('YYYY-MM-DD_HH.mm')}`)}.md`;
      const storagePath = `${projectId}/generated/${fileName}`;

      const up = await supabase.storage.from(BUCKET).upload(
        storagePath,
        new Blob([fileText], { type: 'text/markdown' }),
        { cacheControl: '3600', upsert: false, contentType: 'text/markdown' }
      );
      if (up.error) throw up.error;

      const pub = supabase.storage.from(BUCKET).getPublicUrl(storagePath).data?.publicUrl ?? null;

      const ins = await supabase.from('documents').insert({
        project_id: projectId,
        file_name: fileName,
        file_url: pub,
        created_by: 'zeta',
      });
      if (ins.error) throw ins.error;

      // Reset selector modal + open preview
      setReportOpen(false);
      setSelectedShortIds(new Set());
      setSelectedLongIds(new Set());
      setZetaLevel('');
      setReportNotes('');

      setPortfolioPreview({ title: fileName, text: fileText, url: pub });
    } catch (e: any) {
      console.error('Portfolio generation failed:', e);
      alert(`Failed to generate portfolio: ${e?.message ?? e}`);
    } finally {
      setReportSaving(false);
    }
  }

  return (
    <div className={`text-${fontSize} text-white`}>
      {/* Vision */}
      <div className="p-5">
        <h3 className="text-base font-semibold text-white mb-2">🧭 Project Vision</h3>
        {!visionEditing ? (
          <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4 flex justify-between items-start shadow">
            <p className="max-w-[90%] leading-relaxed">{vision || 'No vision set yet.'}</p>
            <button
              title="Edit Vision"
              onClick={() => setVisionEditing(true)}
              className="text-amber-300 hover:text-amber-400 text-xl"
            >
              ✏️
            </button>
          </div>
        ) : (
          <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4">
            <AutoTextarea
              value={vision}
              onChange={(e) => setVision(e.target.value)}
              minRows={3}
              disabled={visionSaving}
              placeholder="Describe the project vision..."
              className={`w-full p-2 rounded-md bg-blue-900/40 border ${overLimit ? 'border-red-500' : 'border-blue-700'} text-white placeholder:text-white/60`}
            />
            <div className="mt-1 flex items-center justify-between">
              <span className={`text-xs ${overLimit ? 'text-red-400' : 'text-white/70'}`}>
                {trimmedLen}/{VISION_MAX}
              </span>
              <button
                onClick={saveVision}
                disabled={visionSaving || trimmedLen < VISION_MIN}
                className={`px-4 py-1 rounded text-white ${
                  visionSaving || trimmedLen < VISION_MIN
                    ? 'bg-blue-700/40 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-500'
                }`}
              >
                {visionSaving ? 'Saving...' : 'Save Vision'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Two-column goals layout */}
      <div className="px-5 pb-24 grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Short-term Column */}
        <section className="space-y-2">
          <h3 className="text-base font-semibold text-white">📌 Short-Term Goals</h3>
          {hasExtraShort && (
            <p className="text-xs text-amber-300">
              You have more than {MAX_SHORT} short-term goals stored. Saving edits only affects the first {MAX_SHORT}.
            </p>
          )}
          <ul className="space-y-2">
            {shortRealVisible.map((goal) => (
              <li
                key={goal.id}
                className="flex justify-between items-start bg-blue-900/20 border border-blue-700 rounded-md px-3 py-2"
              >
                <div className="flex-1">
                  <AutoTextarea
                    value={goal.description}
                    onChange={(e) => updateGoalDescription(goal.id, e.target.value, 'short')}
                    minRows={1}
                    className="w-full bg-transparent border-none text-white placeholder:text-white/60"
                  />
                  <div className="mt-0.5">
                    <CreatedMeta ts={goal.created_at} />
                  </div>
                </div>
                <button
                  onClick={() => deleteGoal(goal.id, 'short')}
                  className="text-red-400 hover:text-red-500 font-bold px-2"
                  title="Delete goal"
                  type="button"
                >
                  ✖️
                </button>
              </li>
            ))}
            {renderEditableEmptySlots(MAX_SHORT, 'short')}
          </ul>
        </section>

        {/* Long-term Column */}
        <section className="space-y-2">
          <h3 className="text-base font-semibold text-white">📈 Long-Term Goals</h3>
          <ul className="space-y-2">
            {Array.from(
              new Map(
                longTermGoals
                  .filter((g) => !g.id.startsWith('temp-'))
                  .map((g) => [g.description.trim().toLowerCase(), g]),
              ).values(),
            ).map((goal) => (
              <li
                key={goal.id}
                className="flex justify-between items-start bg-blue-900/20 border border-blue-700 rounded-md px-3 py-2"
              >
                <div className="flex-1">
                  <AutoTextarea
                    value={goal.description}
                    onChange={(e) => updateGoalDescription(goal.id, e.target.value, 'long')}
                    minRows={1}
                    className="w-full bg-transparent border-none text-white placeholder:text-white/60"
                  />
                  <div className="mt-0.5">
                    <CreatedMeta ts={goal.created_at} />
                  </div>
                </div>
                <button
                  onClick={() => deleteGoal(goal.id, 'long')}
                  className="text-red-400 hover:text-red-500 font-bold px-2"
                  title="Delete goal"
                  type="button"
                >
                  ✖️
                </button>
              </li>
            ))}
            {renderEditableEmptySlots(MAX_LONG, 'long')}
          </ul>
        </section>
      </div>

      {/* Sticky action bar */}
      <div className="sticky bottom-0 z-40 w-full bg-gradient-to-t from-blue-900/80 to-blue-900/0 backdrop-blur px-5 py-3">
        <div className="flex flex-wrap gap-3">
          <button
            disabled={savingGoals}
            onClick={saveGoals}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white disabled:opacity-60"
          >
            {savingGoals ? 'Saving Goals...' : 'Save All Goals'}
          </button>

          <button
            onClick={() => setReportOpen(true)}
            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 rounded text-white"
          >
            Report Completed Goal
          </button>
        </div>
      </div>

      {/* Report Modal */}
      {reportOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-xl bg-blue-950 border border-blue-700 shadow-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-white text-lg font-semibold">Create Portfolio</h4>
              <button className="text-white/70 hover:text-white" onClick={() => setReportOpen(false)}>✖️</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Short select */}
              <div>
                <div className="text-sm text-white/80 mb-1">Completed Short-Term</div>
                <div className="max-h-[220px] overflow-y-auto rounded border border-blue-700 p-2 bg-blue-900/20">
                  {shortTermGoals.length === 0 ? (
                    <div className="text-white/60 text-sm">No short-term goals.</div>
                  ) : (
                    shortTermGoals.map((g) => (
                      <label key={g.id} className="flex items-start gap-2 py-1 text-sm text-white">
                        <input
                          type="checkbox"
                          className="mt-1 accent-emerald-500"
                          checked={selectedShortIds.has(g.id)}
                          onChange={(e) => {
                            setSelectedShortIds((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(g.id);
                              else next.delete(g.id);
                              return next;
                            });
                          }}
                        />
                        <span>
                          {g.description}
                          <div className="text-[11px] text-white/60">
                            {g.created_at ? `Created ${dayjs(g.created_at).format('MMM D, YYYY')}` : ''}
                          </div>
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {/* Long select */}
              <div>
                <div className="text-sm text-white/80 mb-1">Completed Long-Term</div>
                <div className="max-h-[220px] overflow-y-auto rounded border border-blue-700 p-2 bg-blue-900/20">
                  {longTermGoals.length === 0 ? (
                    <div className="text-white/60 text-sm">No long-term goals.</div>
                  ) : (
                    longTermGoals.map((g) => (
                      <label key={g.id} className="flex items-start gap-2 py-1 text-sm text-white">
                        <input
                          type="checkbox"
                          className="mt-1 accent-emerald-500"
                          checked={selectedLongIds.has(g.id)}
                          onChange={(e) => {
                            setSelectedLongIds((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(g.id);
                              else next.delete(g.id);
                              return next;
                            });
                          }}
                        />
                        <span>
                          {g.description}
                          <div className="text-[11px] text-white/60">
                            {g.created_at ? `Created ${dayjs(g.created_at).format('MMM D, YYYY')}` : ''}
                          </div>
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-1">
                <label className="block text-sm text-white/80 mb-1">Zeta Level</label>
                <input
                  className="w-full rounded bg-blue-900/30 border border-blue-700 px-2 py-1 text-white placeholder:text-white/60"
                  placeholder="e.g., Level 2"
                  value={zetaLevel}
                  onChange={(e) => setZetaLevel(e.target.value)}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-white/80 mb-1">Notes (optional)</label>
                <input
                  className="w-full rounded bg-blue-900/30 border border-blue-700 px-2 py-1 text-white placeholder:text-white/60"
                  placeholder="Add any extra context…"
                  value={reportNotes}
                  onChange={(e) => setReportNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                className="px-4 py-2 rounded bg-blue-700 hover:bg-blue-600 text-white"
                onClick={() => setReportOpen(false)}
              >
                Cancel
              </button>
              <button
                className="px-5 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-60"
                disabled={reportSaving}
                onClick={generateAndSavePortfolio}
              >
                {reportSaving ? 'Saving…' : 'Generate & Save Portfolio'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Portfolio Preview Modal */}
      {portfolioPreview && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl rounded-xl bg-blue-950 border border-blue-700 shadow-xl p-0 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-blue-700">
              <div className="text-white font-semibold truncate pr-3">
                {portfolioPreview.title}
              </div>
              <div className="flex items-center gap-2">
                {portfolioPreview.url && (
                  <a
                    href={portfolioPreview.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs px-2 py-1 rounded border border-emerald-600 bg-emerald-700 hover:bg-emerald-600 text-white"
                  >
                    Open ↗
                  </a>
                )}
                <button
                  onClick={() => setPortfolioPreview(null)}
                  className="text-xs px-2 py-1 rounded border border-blue-600 bg-blue-800 hover:bg-blue-700 text-white"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="p-4 max-h-[70vh] overflow-auto">
              <pre className="whitespace-pre-wrap text-sm leading-6 text-blue-50">
{portfolioPreview.text}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
