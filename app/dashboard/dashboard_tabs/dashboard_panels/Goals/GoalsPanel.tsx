'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Goal = {
  id: string;
  description: string;
};

const MAX_SHORT = 5;
const MAX_LONG = 3;

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

  useEffect(() => {
    async function fetchGoals() {
      setLoading(true);
      try {
        if (!projectId) {
          throw new Error('projectId is missing in GoalsPanel');
        }

        // ✅ Project vision
        const { data: projectData, error: projectError } = await supabase
          .from('user_projects')
          .select('vision')
          .eq('id', projectId)
          .single();

        if (projectError) throw projectError;
        setVision(projectData?.vision || '');

        // Short-term goals
        const { data: stGoals, error: stError } = await supabase
          .from('goals')
          .select('id, description')
          .eq('project_id', projectId)
          .eq('goal_type', 'short_term')
          .order('id', { ascending: true });

        if (stError) throw stError;
        setShortTermGoals(stGoals || []);

        // Long-term goals
        const { data: ltGoals, error: ltError } = await supabase
          .from('goals')
          .select('id, description')
          .eq('project_id', projectId)
          .eq('goal_type', 'long_term')
          .order('id', { ascending: true });

        if (ltError) throw ltError;
        setLongTermGoals(ltGoals || []);
      } catch (error) {
        console.error('❌ Failed to fetch goals:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchGoals();
  }, [projectId]);

  async function saveVision() {
    setVisionSaving(true);
    const { error } = await supabase
      .from('user_projects')
      .update({ vision })
      .eq('id', projectId);
    if (error) {
      console.error('Failed to save vision:', error);
      alert('Error saving vision');
    } else {
      setVisionEditing(false);
    }
    setVisionSaving(false);
  }

  async function saveGoals() {
    setSavingGoals(true);
    try {
      // Partition short goals into real/temp
      const shortReal = shortTermGoals.filter((g) => !g.id.startsWith('temp-'));
      const shortTemp = shortTermGoals.filter((g) => g.id.startsWith('temp-'));

      // Enforce MAX_SHORT strictly
      const visibleShortReal = shortReal.slice(0, MAX_SHORT);
      const availableShortSlots = Math.max(0, MAX_SHORT - visibleShortReal.length);
      const shortTempToInsert = shortTemp.slice(0, availableShortSlots);

      if (shortReal.length + shortTemp.length > MAX_SHORT) {
        console.warn('Short-term goals exceed max; extra ones are ignored.');
      }

      // Update existing short-term (only first MAX_SHORT)
      for (const goal of visibleShortReal) {
        const { error } = await supabase
          .from('goals')
          .update({ description: goal.description })
          .eq('id', goal.id);
        if (error) throw error;
      }

      // Insert new short-term (cap to remaining slots)
      if (shortTempToInsert.length > 0) {
        const { error } = await supabase.from('goals').insert(
          shortTempToInsert.map((g) => ({
            project_id: projectId,
            goal_type: 'short_term',
            description: g.description,
          }))
        );
        if (error) throw error;
      }

      // Long-term goals — unchanged logic
      const longReal = longTermGoals.filter((g) => !g.id.startsWith('temp-'));
      const longTemp = longTermGoals.filter((g) => g.id.startsWith('temp-'));

      for (const goal of longReal) {
        const { error } = await supabase
          .from('goals')
          .update({ description: goal.description })
          .eq('id', goal.id);
        if (error) throw error;
      }

      if (longTemp.length > 0) {
        const { error } = await supabase.from('goals').insert(
          longTemp.map((g) => ({
            project_id: projectId,
            goal_type: 'long_term',
            description: g.description,
          }))
        );
        if (error) throw error;
      }

      alert('Goals saved!');
    } catch (error) {
      console.error('Failed to save goals:', error);
      alert('Error saving goals');
    } finally {
      setSavingGoals(false);
    }
  }

  function updateGoalDescription(goalId: string, newDesc: string, type: 'short' | 'long') {
    if (type === 'short') {
      setShortTermGoals((prev) =>
        prev.map((g) => (g.id === goalId ? { ...g, description: newDesc } : g))
      );
    } else {
      setLongTermGoals((prev) =>
        prev.map((g) => (g.id === goalId ? { ...g, description: newDesc } : g))
      );
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

    // For short-term, only allow empty slots up to MAX_SHORT minus current (real + temp)
    const currentTotal = type === 'short' ? Math.min(real.length, MAX_SHORT) + temp.length : real.length + temp.length;
    const emptyCount = Math.max(0, maxCount - currentTotal);

    if (type === 'short' && currentTotal >= MAX_SHORT) {
      return []; // no more slots once we reach the cap
    }

    const slots = [];

    // Show existing temp goals (editable)
    temp.forEach((goal) => {
      // If short-term and we're over cap, skip rendering extra temps
      if (type === 'short' && real.length + temp.indexOf(goal) >= MAX_SHORT) return;

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
        </li>
      );
    });

    // Render empty slots that create new temp goals
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

              // Guard: do not exceed MAX_SHORT
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
        </li>
      );
    }

    return slots;
  }

  if (loading) {
    return <p className={`text-${fontSize} text-indigo-200`}>Loading goals...</p>;
  }

  // Prep short-term for display with cap + notice
  const shortReal = shortTermGoals.filter((g) => !g.id.startsWith('temp-'));
  const shortTemp = shortTermGoals.filter((g) => g.id.startsWith('temp-'));
  const shortRealVisible = shortReal.slice(0, MAX_SHORT);
  const hasExtraShort = shortReal.length > MAX_SHORT;

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
              className="w-full p-2 rounded-md bg-blue-900 border border-indigo-500 text-indigo-100"
              rows={4}
              value={vision}
              onChange={(e) => setVision(e.target.value)}
              disabled={visionSaving}
            />
            <button
              onClick={saveVision}
              disabled={visionSaving}
              className="mt-2 px-4 py-1 bg-indigo-600 hover:bg-indigo-700 rounded text-white"
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
            <li
              key={goal.id}
              className="flex justify-between items-center bg-blue-950 border border-green-500 rounded-md px-3 py-2"
            >
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

          {/* Render temp + empty slots with cap awareness */}
          {renderEditableEmptySlots(MAX_SHORT, 'short')}
        </ul>
      </div>

      <div>
        <h3 className="text-base font-semibold text-indigo-300 mt-6 mb-2">📈 Long-Term Goals</h3>
        <ul className="space-y-2">
          {longTermGoals
            .filter((g) => !g.id.startsWith('temp-'))
            .map((goal) => (
              <li
                key={goal.id}
                className="flex justify-between items-center bg-blue-950 border border-green-500 rounded-md px-3 py-2"
              >
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