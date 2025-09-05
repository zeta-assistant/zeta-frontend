'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Props = { projectId: string; fontSize: 'sm' | 'base' | 'lg' };

type ZetaTask = {
  id: string;
  keyword: string;
  description: string;
  status: 'queued' | 'in progress' | 'waiting for input' | 'complete' | 'failed';
};

const MOCK_ZETA_TASKS: ZetaTask[] = [
  { id: '1', keyword: 'Extract',  description: 'Extract team names and game times from uploaded PDF', status: 'in progress' },
  { id: '2', keyword: 'Generate', description: 'Generate weekly betting insights summary for email',   status: 'queued' },
  { id: '3', keyword: 'Review',   description: 'Review sales pitch and suggest improvements',          status: 'waiting for input' },
];

type Plan = 'free' | 'premium' | 'pro';
const DEBUG_PLAN = true;

function normalizePlanRow(row: any): Plan {
  if (!row) return 'free';
  const truthy = (v: any) =>
    v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true' || String(v).toLowerCase() === 't' || String(v).toLowerCase() === 'yes';
  if (truthy(row.is_premium)) return 'premium';

  const rawCandidates = [row.plan, row.subscription_tier, row.tier, row.billing_plan]
    .filter((v) => v != null && String(v).trim() !== '')
    .map((v) => String(v).trim().toLowerCase());

  if (rawCandidates.includes('free')) return 'free';

  const paid = new Set(['premium', 'pro', 'plus', 'paid', 'trial_premium', 'premium_monthly', 'premium_yearly']);
  for (const v of rawCandidates) {
    if (paid.has(v)) return v === 'pro' ? 'pro' : 'premium';
  }
  if (rawCandidates.length > 0) return 'premium';
  return 'free';
}

export default function ZetaWorkshopPanel({ projectId, fontSize }: Props) {
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
    if (DEBUG_PLAN) console.warn('[Workshop] plan row:', data, '→', resolved);
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
          if (DEBUG_PLAN) console.warn('[Workshop] realtime →', resolved, payload.new);
          setPlan(resolved);
        }
      )
      .subscribe();

    const id = setInterval(loadPlan, 15000);
    return () => { clearInterval(id); supabase.removeChannel(channel); };
  }, [projectId]);

  const [tasks] = useState<ZetaTask[]>(MOCK_ZETA_TASKS);

  const getStatusColor = (status: ZetaTask['status']) => {
    switch (status) {
      case 'queued':            return 'text-yellow-400';
      case 'in progress':       return 'text-blue-400';
      case 'waiting for input': return 'text-orange-300';
      case 'complete':          return 'text-green-400';
      case 'failed':            return 'text-red-400';
      default:                  return 'text-gray-400';
    }
  };

  return (
    <div className={`p-6 ${sizeClass} text-white space-y-6 overflow-y-auto`}>
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-semibold">🧪 Zeta Workshop</h3>
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

      <p className="text-sm text-gray-300">
        Monitor, assist, and manage Zeta’s ongoing or scheduled actions. You can review progress, step in to help, or trigger completions manually.
      </p>

      {isFree && (
        <div className="rounded-xl border border-amber-400/40 bg-amber-900/20 p-3 text-amber-100 text-sm">
          🔒 <span className="font-semibold">Locked (Premium)</span> · Workshop is available on premium plans during BETA.
        </div>
      )}

      <div className={`space-y-4 ${isFree ? 'opacity-60 pointer-events-none select-none' : ''}`}>
        {tasks.map((task) => (
          <div key={task.id} className="bg-blue-950 border border-purple-500 rounded-xl p-4 space-y-2 shadow text-sm">
            <div className="flex justify-between items-center">
              <div className="font-semibold text-purple-300">{task.keyword}</div>
              <div className={`italic ${getStatusColor(task.status)}`}>{task.status.toUpperCase()}</div>
            </div>
            <p className="text-purple-100">{task.description}</p>

            {(task.status === 'waiting for input' || task.status === 'failed') && (
              <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded shadow mt-1">
                🛠 Assist Zeta
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 bg-blue-900 border border-indigo-400 rounded-xl p-4 text-sm text-indigo-200">
        <p className="font-semibold mb-1">📊 Visual Task Pipeline (Coming Soon)</p>
        <p className="text-indigo-300">
          Zeta will soon show function timelines, dependencies, retries, and real-time execution logs here.
        </p>
      </div>
    </div>
  );
}
