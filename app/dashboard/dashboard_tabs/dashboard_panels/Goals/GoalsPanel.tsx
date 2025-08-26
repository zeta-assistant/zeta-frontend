'use client';

import React, { JSX, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Goal = {
  id: string;
  description: string;
};

const MAX_SHORT = 5;
const MAX_LONG = 3;

// Match your Postgres CHECK (was failing at len 53) → set to 50
const VISION_MIN = 1;
const VISION_MAX = 50;

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

  async function syncUserProjectsIntoGoals(pid: string) {
    const { data: projectData, error: projectError } = await supabase
      .from('user_projects')
      .select('vision, short_term_goals, long_term_goals')
      .eq('id', pid)
      .single();
    if (projectError) throw projectError;

    setVision(projectData?.vision || '');

    const shortParsed = parseGoals(projectData?.short_term_goals, MAX_SHORT);
    const longParsed = parseGoals(projectData?.long_term_goals, MAX_LONG);

    if (shortParsed.length > 0) {
      const { error: delErrST } = await supabase
        .from('goals')
        .delete()
        .eq('project_id', pid)
        .eq('goal_type', 'short_term');
      if (delErrST) console.error('❌ Delete short_term failed:', delErrST);

      const shortToInsert = Array.from(
        new Map(shortParsed.map((g) => [normalize(g), g])).values(),
      ).map((description) => ({
        project_id: pid,
        goal_type: 'short_term' as const,
        description,
      }));
      if (shortToInsert.length > 0) {
        const { error: insErrST } = await supabase.from('goals').insert(shortToInsert);
        if (insErrST) console.error('❌ Insert short_term failed:', insErrST);
      }
    }

    if (longParsed.length > 0) {
      const { error: delErrLT } = await supabase
        .from('goals')
        .delete()
        .eq('project_id', pid)
        .eq('goal_type', 'long_term');
      if (delErrLT) console.error('❌ Delete long_term failed:', delErrLT);

      const longToInsert = Array.from(
        new Map(longParsed.map((g) => [normalize(g), g])).values(),
      ).map((description) => ({
        project_id: pid,
        goal_type: 'long_term' as const,
        description,
      }));
      if (longToInsert.length > 0) {
        const { error: insErrLT } = await supabase.from('goals').insert(longToInsert);
        if (insErrLT) console.error('❌ Insert long_term failed:', insErrLT);
      }
    }
  }

  async function fetchGoalsForDisplay(pid: string) {
    const { data: stGoals, error: stError } = await supabase
      .from('goals')
      .select('id, description')
      .eq('project_id', pid)
      .eq('goal_type', 'short_term')
      .order('id', { ascending: true });
    if (stError) throw stError;

    const seenST = new Set<string>();
    const dedupedST = (stGoals || []).filter((g) => {
      const key = normalize(g.description || '');
      if (!key || seenST.has(key)) return false;
      seenST.add(key);
      return true;
    });
    setShortTermGoals(dedupedST);

    const { data: ltGoals, error: ltError } = await supabase
      .from('goals')
      .select('id, description')
      .eq('project_id', pid)
      .eq('goal_type', 'long_term')
      .order('id', { ascending: true });
    if (ltError) throw ltError;

    const seenLT = new Set<string>();
    const dedupedLT = (ltGoals || []).filter((g) => {
      const key = normalize(g.description || '');
      if (!key || seenLT.has(key)) return false;
      seenLT.add(key);
      return true;
    });
    setLongTermGoals(dedupedLT);
  }

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      setLoading(true);
      try {
        await syncUserProjectsIntoGoals(projectId);
        await fetchGoalsForDisplay(projectId);
      } catch (err) {
        console.error('❌ Failed to load/sync goals:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId]);

  async function saveVision() {
    setVisionSaving(true);
    try {
      if (!projectId) {
        console.error('❌ Missing projectId in saveVision');
        alert('No project selected.');
        return;
      }

      // normalize & clamp to DB limit
      const trimmed = (vision ?? '').trim();
      let toSave = trimmed;
      if (trimmed.length > VISION_MAX) {
        console.warn(`Vision over limit (${trimmed.length}). Clamping to ${VISION_MAX}.`);
        toSave = trimmed.slice(0, VISION_MAX);
        setVision(toSave); // reflect clamp in UI
      }
      if (toSave.length < VISION_MIN) {
        alert(`Vision must be at least ${VISION_MIN} character.`);
        return;
      }

      console.log('🧠 Attempting to save vision:', { len: toSave.length, preview: toSave.slice(0, 80) });

      const { data, error } = await supabase
        .from('user_projects')
        .update({ vision: toSave })
        .eq('id', projectId)
        .select();

      console.log('🧠 Vision update response:', { rows: Array.isArray(data) ? data.length : null, error });
      if (error) {
        // Better surfacing than "{}"
        console.error('❌ Failed to save vision:', JSON.stringify(error, null, 2));
        if ((error as any).code === '23514') {
          alert(`Vision violates DB constraint. Keep it ≤ ${VISION_MAX} characters.`);
        } else {
          alert('Error saving vision.');
        }
        return;
      }
      if (Array.isArray(data) && data.length === 0) {
        console.warn('⚠️ No row updated — check projectId or RLS.');
        alert('No project found to update.');
        return;
      }
      setVisionEditing(false);
    } finally {
      setVisionSaving(false);
      const { error: logErr } = await supabase.from('system_logs').insert({
        project_id: projectId,
        actor: 'user',
        event: 'project.vision.update',
        details: { excerpt: (vision ?? '').slice(0, 140), length: (vision ?? '').length },
      });
      if (logErr) console.warn('⚠️ Failed to insert vision log:', logErr);
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

      for (const goal of visibleShortReal) {
        const { error } = await supabase.from('goals').update({ description: goal.description }).eq('id', goal.id);
        if (error) throw error;
      }

      const existingST = new Set(visibleShortReal.map((g) => normalize(g.description)));
      const seenTempST = new Set<string>();
      const shortTempFiltered = shortTempToInsert.filter((g) => {
        const key = normalize(g.description || '');
        if (!key || existingST.has(key) || seenTempST.has(key)) return false;
        seenTempST.add(key);
        return true;
      });

      if (shortTempFiltered.length > 0) {
        const { error } = await supabase.from('goals').insert(
          shortTempFiltered.map((g) => ({
            project_id: projectId,
            goal_type: 'short_term' as const,
            description: g.description,
          })),
        );
        if (error) throw error;
      }

      const longReal = longTermGoals.filter((g) => !g.id.startsWith('temp-'));
      const longTemp = longTermGoals.filter((g) => g.id.startsWith('temp-'));

      for (const goal of longReal) {
        const { error } = await supabase.from('goals').update({ description: goal.description }).eq('id', goal.id);
        if (error) throw error;
      }

      const existingLT = new Set(longReal.map((g) => normalize(g.description)));
      const seenTempLT = new Set<string>();
      const longTempFiltered = longTemp.filter((g) => {
        const key = normalize(g.description || '');
        if (!key || existingLT.has(key) || seenTempLT.has(key)) return false;
        seenTempLT.add(key);
        return true;
      });

      if (longTempFiltered.length > 0) {
        const { error } = await supabase.from('goals').insert(
          longTempFiltered.map((g) => ({
            project_id: projectId,
            goal_type: 'long_term' as const,
            description: g.description,
          })),
        );
        if (error) throw error;
      }

      alert('Goals saved!');
      await supabase.from('system_logs').insert([
        {
          project_id: projectId,
          actor: 'user',
          event: 'project.goals.short.update',
          details: { count: shortTermGoals.length },
        },
        {
          project_id: projectId,
          actor: 'user',
          event: 'project.goals.long.update',
          details: { count: longTermGoals.length },
        },
      ]);
      await fetchGoalsForDisplay(projectId);
    } catch (error) {
      console.error('Failed to save goals:', error);
      alert('Error saving goals');
    } finally {
      setSavingGoals(false);
    }
  }

  function updateGoalDescription(goalId: string, newDesc: string, type: 'short' | 'long') {
    if (type === 'short') {
      setShortTermGoals((prev) => prev.map((g) => (g.id === goalId ? { ...g, description: newDesc } : g)));
    } else {
      setLongTermGoals((prev) => prev.map((g) => (g.id === goalId ? { ...g, description: newDesc } : g)));
    }
  }

  function deleteGoal(goalId: string, type: 'short' | 'long') {
    if (type === 'short') {
      setShortTermGoals((prev) => prev.filter((g) => g.id !== goalId));
    } else {
      setLongTermGoals((prev) => prev.filter((g) => g.id !== goalId));
    }
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
          className="flex justify-between items-center bg-blue-900 border border-green-400 rounded-md px-3 py-2"
        >
          <textarea
            className="flex-1 bg-blue-900 border-none text-indigo-100 resize-none"
            value={goal.description}
            onChange={(e) => updateGoalDescription(goal.id, e.target.value, type)}
            rows={1}
            placeholder={type === 'short' ? 'New short-term goal...' : 'New long-term goal...'}
          />
          <span className="ml-3 text-green-400 select-none">🆕</span>
          <button
            onClick={() => deleteGoal(goal.id, type)}
            className="ml-2 text-red-500 hover:text-red-700 font-bold px-2"
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
          className="flex justify-between items-center bg-blue-950 border border-dashed border-green-400 rounded-md px-3 py-2"
        >
          <textarea
            className="flex-1 bg-blue-950 border-none text-indigo-400 resize-none italic"
            value=""
            onChange={(e) => {
              const desc = e.target.value;
              if (desc.trim() === '') return;

              if (type === 'short') {
                const totalShort = shortTermGoals.length;
                if (totalShort >= MAX_SHORT) return;
                setShortTermGoals((prev) => [...prev, { id: tempId, description: desc }]);
              } else {
                setLongTermGoals((prev) => [...prev, { id: tempId, description: desc }]);
              }
              setNewGoalCounter((c) => c + 1);
            }}
            rows={1}
            placeholder={type === 'short' ? 'Add new short-term goal...' : 'Add new long-term goal...'}
          />
          <span className="ml-3 text-green-400 select-none">＋</span>
        </li>,
      );
    }

    return slots;
  }

  if (loading) {
    return <p className={`text-${fontSize} text-indigo-200`}>Loading goals...</p>;
  }

  const shortReal = shortTermGoals.filter((g) => !g.id.startsWith('temp-'));
  const shortTemp = shortTermGoals.filter((g) => g.id.startsWith('temp-'));
  const shortRealVisible = shortReal.slice(0, MAX_SHORT);
  const hasExtraShort = shortReal.length > MAX_SHORT;

  const trimmedLen = (vision ?? '').trim().length;
  const overLimit = trimmedLen > VISION_MAX;

  return (
    <div className={`p-6 overflow-y-auto text-${fontSize} text-indigo-200 space-y-6`}>
      <div>
        <h2 className="text-lg text-white font-semibold">🎯 Project Goals</h2>
      </div>

      <div className="pt-4">
        <h3 className="text-base font-semibold text-indigo-300 mb-2">🧭 Project Vision</h3>
        {!visionEditing ? (
          <div className="bg-blue-950 border border-indigo-500 rounded-lg p-4 flex justify-between items-start shadow">
            <p className="max-w-[90%] leading-relaxed text-indigo-100">{vision || 'No vision set yet.'}</p>
            <button
              title="Edit Vision"
              onClick={() => setVisionEditing(true)}
              className="text-yellow-300 hover:text-yellow-400 text-xl"
            >
              ✏️
            </button>
          </div>
        ) : (
          <div>
            <textarea
              className={`w-full p-2 rounded-md bg-blue-900 border ${overLimit ? 'border-red-500' : 'border-indigo-500'} text-indigo-100`}
              rows={4}
              value={vision}
              onChange={(e) => setVision(e.target.value)}
              disabled={visionSaving}
            />
            <div className="mt-1 flex items-center justify-between">
              <span className={`text-xs ${overLimit ? 'text-red-400' : 'text-indigo-400'}`}>
                {trimmedLen}/{VISION_MAX}
              </span>
            </div>
            <button
              onClick={saveVision}
              disabled={visionSaving || trimmedLen < VISION_MIN}
              className={`mt-2 px-4 py-1 rounded text-white ${
                visionSaving || trimmedLen < VISION_MIN
                  ? 'bg-indigo-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              {visionSaving ? 'Saving...' : 'Save Vision'}
            </button>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-base font-semibold text-indigo-300 mb-1">📌 Short-Term Goals</h3>
        <p className="text-xs text-indigo-400 mb-2">Maximum {MAX_SHORT} goals.</p>
        {hasExtraShort && (
          <p className="text-xs text-yellow-300 mb-2">
            You have {shortReal.length} short-term goals in the database. Showing and saving only the first {MAX_SHORT}.
            Delete extras to get back under the limit.
          </p>
        )}
        <ul className="space-y-2">
          {shortRealVisible.map((goal) => (
            <li key={goal.id} className="flex justify-between items-center bg-blue-950 border border-green-500 rounded-md px-3 py-2">
              <textarea
                className="flex-1 bg-blue-900 border-none text-indigo-100 resize-none"
                value={goal.description}
                onChange={(e) => updateGoalDescription(goal.id, e.target.value, 'short')}
                rows={1}
              />
              <div className="flex items-center space-x-2">
                <span className="text-green-400 select-none">✔</span>
                <button
                  onClick={() => deleteGoal(goal.id, 'short')}
                  className="text-red-500 hover:text-red-700 font-bold px-2"
                  title="Delete goal"
                  type="button"
                >
                  ✖️
                </button>
              </div>
            </li>
          ))}
          {renderEditableEmptySlots(MAX_SHORT, 'short')}
        </ul>
      </div>

      <div>
        <h3 className="text-base font-semibold text-indigo-300 mt-6 mb-2">📈 Long-Term Goals</h3>
        <ul className="space-y-2">
          {Array.from(
            new Map(
              longTermGoals
                .filter((g) => !g.id.startsWith('temp-'))
                .map((g) => [g.description.trim().toLowerCase(), g]),
            ).values(),
          ).map((goal) => (
            <li key={goal.id} className="flex justify-between items-center bg-blue-950 border border-green-500 rounded-md px-3 py-2">
              <textarea
                className="flex-1 bg-blue-900 border-none text-indigo-100 resize-none"
                value={goal.description}
                onChange={(e) => updateGoalDescription(goal.id, e.target.value, 'long')}
                rows={1}
              />
              <div className="flex items-center space-x-2">
                <span className="text-green-400 select-none">✔</span>
                <button
                  onClick={() => deleteGoal(goal.id, 'long')}
                  className="text-red-500 hover:text-red-700 font-bold px-2"
                  title="Delete goal"
                  type="button"
                >
                  ✖️
                </button>
              </div>
            </li>
          ))}
          {renderEditableEmptySlots(MAX_LONG, 'long')}
        </ul>
      </div>

      <div className="mt-6">
        <button
          disabled={savingGoals}
          onClick={saveGoals}
          className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 rounded text-white"
        >
          {savingGoals ? 'Saving Goals...' : 'Save All Goals'}
        </button>
      </div>
    </div>
  );
}
