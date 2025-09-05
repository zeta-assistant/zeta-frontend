'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Props = { projectId: string; fontSize: 'sm' | 'base' | 'lg' };

const FUNCTION_KEYWORDS = ['Summarize','Extract','Compare','Generate','Schedule','Research','Review','Convert','Track','Calculate','Rephrase','Clean'];

type Plan = 'free' | 'premium' | 'pro';
const DEBUG_PLAN = true;

function normalizePlanRow(row: any): Plan {
  if (!row) return 'free';
  const truthy = (v: any) =>
    v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true' || String(v).toLowerCase() === 't' || String(v).toLowerCase() === 'yes';
  if (truthy(row.is_premium)) return 'premium';

  const rawCandidates = [
    row.plan,
    row.subscription_tier,
    row.tier,
    row.billing_plan,
  ].filter((v) => v != null && String(v).trim() !== '')
   .map((v) => String(v).trim().toLowerCase());

  if (rawCandidates.includes('free')) return 'free';

  const paid = new Set(['premium', 'pro', 'plus', 'paid', 'trial_premium', 'premium_monthly', 'premium_yearly']);
  for (const v of rawCandidates) {
    if (paid.has(v)) return v === 'pro' ? 'pro' : 'premium';
  }
  if (rawCandidates.length > 0) return 'premium';
  return 'free';
}

export default function NewFunctionPanel({ projectId, fontSize }: Props) {
  const sizeClass = fontSize === 'sm' ? 'text-sm' : fontSize === 'lg' ? 'text-lg' : 'text-base';

  const [plan, setPlan] = useState<Plan>('free');
  const isFree = plan === 'free';

  async function loadPlan() {
    const { data } = await supabase
      .from('user_projects')
      .select('plan, subscription_tier, is_premium, tier, billing_plan')
      .eq('id', projectId)
      .maybeSingle();
    const resolved = normalizePlanRow(data);
    if (DEBUG_PLAN) console.warn('[NewFunction] plan row:', data, '→', resolved);
    setPlan(resolved);
  }

  useEffect(() => {
    void loadPlan();

    const channel = supabase
      .channel(`user_projects:plan:${projectId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'user_projects', filter: `id=eq.${projectId}` },
        (payload) => {
          const resolved = normalizePlanRow(payload.new);
          if (DEBUG_PLAN) console.warn('[NewFunction] realtime →', resolved, payload.new);
          setPlan(resolved);
        }
      )
      .subscribe();

    const id = setInterval(loadPlan, 15000);
    return () => { clearInterval(id); supabase.removeChannel(channel); };
  }, [projectId]);

  const [selectedKeyword, setSelectedKeyword] = useState('Summarize');
  const [prompt, setPrompt] = useState('Summarize ');
  const [trigger, setTrigger] = useState('');

  const handleKeywordChange = (newKeyword: string) => {
    setSelectedKeyword(newKeyword);
    const promptWithoutKeyword = prompt.replace(/^(\w+\s)/, '');
    setPrompt(`${newKeyword} ${promptWithoutKeyword}`);
  };

  const handlePromptChange = (text: string) => {
    const promptWithoutKeyword = text.replace(/^(\w+\s)/, '');
    setPrompt(`${selectedKeyword} ${promptWithoutKeyword}`);
  };

  return (
    <div className={`p-6 ${sizeClass} text-white space-y-6 overflow-y-auto`}>
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-semibold">✨ Create New Function</h3>
        {DEBUG_PLAN && (
          <span className="text-[10px] rounded px-2 py-0.5 bg-slate-500/20 text-slate-200 border border-slate-400/40">
            plan: {plan}
          </span>
        )}
        {isFree && (
          <span className="text-[10px] tracking-wide rounded px-1.5 py-[2px] bg-amber-500/20 text-amber-200 border border-amber-400/40">
            Premium
          </span>
        )}
      </div>
      <p className="text-sm text-gray-300">Define a new automation task for Zeta to execute.</p>

      {isFree && (
        <div className="rounded-xl border border-amber-400/40 bg-amber-900/20 p-3 text-amber-100 text-sm">
          🔒 <span className="font-semibold">Locked (Premium)</span> · Creating functions is available on premium plans during BETA.
        </div>
      )}

      <div className={`bg-blue-950 border border-purple-500 rounded-xl p-4 space-y-4 text-sm text-purple-100 shadow ${isFree ? 'opacity-60 pointer-events-none select-none' : ''}`}>
        <div>
          <label className="block mb-1 text-purple-300 font-semibold">🔧 Select Keyword</label>
          <select
            value={selectedKeyword}
            onChange={(e) => handleKeywordChange(e.target.value)}
            disabled={isFree}
            className="w-full bg-blue-900 text-white px-3 py-2 rounded-md border border-purple-700 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {FUNCTION_KEYWORDS.map((kw) => (<option key={kw} value={kw}>{kw}</option>))}
          </select>
        </div>

        <div>
          <label className="block mb-1 text-purple-300 font-semibold">🧠 Function Prompt</label>
          <input
            type="text"
            value={prompt}
            onChange={(e) => handlePromptChange(e.target.value)}
            disabled={isFree}
            className="w-full bg-blue-900 text-white px-3 py-2 rounded-md border border-purple-700 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
          />
        </div>

        <div>
          <label className="block mb-1 text-purple-300 font-semibold">⚙️ Trigger Condition</label>
          <input
            type="text"
            value={trigger}
            onChange={(e) => setTrigger(e.target.value)}
            placeholder="e.g., Every Sunday at 8PM"
            disabled={isFree}
            className="w-full bg-blue-900 text-white px-3 py-2 rounded-md border border-purple-700 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
          />
        </div>
      </div>

      <button
        onClick={() => {
          if (isFree) return;
          console.log(`📤 Save function for project: ${projectId}\nPrompt: ${prompt}\nTrigger: ${trigger}`);
        }}
        disabled={isFree}
        className={`px-4 py-2 rounded shadow ${isFree ? 'bg-slate-800/70 border border-slate-600/60 text-slate-300 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 text-white'}`}
      >
        {isFree ? 'Premium Feature (Locked)' : '✅ Save Function'}
      </button>
    </div>
  );
}
