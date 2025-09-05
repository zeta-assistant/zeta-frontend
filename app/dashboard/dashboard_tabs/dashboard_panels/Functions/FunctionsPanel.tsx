'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Props = {
  projectId: string;
  fontSize?: 'sm' | 'base' | 'lg';
  variant?: 'compact' | 'full';
};

type Plan = 'free' | 'premium' | 'pro';
const DEBUG_PLAN = true;

/** Default-FREE, prove-paid normalization (very forgiving) */
function normalizePlanRow(row: any): Plan {
  if (!row) return 'free';

  const truthy = (v: any) =>
    v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true' || String(v).toLowerCase() === 't' || String(v).toLowerCase() === 'yes';

  // boolean-ish gate
  if (truthy(row.is_premium)) return 'premium';

  // collect all possible plan-ish fields
  const rawCandidates = [
    row.plan,
    row.subscription_tier,
    row.tier,
    row.billing_plan,
  ]
    .filter((v) => v != null && String(v).trim() !== '')
    .map((v) => String(v).trim().toLowerCase());

  // if any candidate clearly says free -> free
  if (rawCandidates.includes('free')) return 'free';

  // common paid aliases
  const paid = new Set(['premium', 'pro', 'plus', 'paid', 'trial_premium', 'premium_monthly', 'premium_yearly']);
  for (const v of rawCandidates) {
    if (paid.has(v)) return v === 'pro' ? 'pro' : 'premium';
  }

  // if we got a non-empty candidate that's NOT "free", assume paid
  if (rawCandidates.length > 0) return 'premium';

  // nothing we can use -> free
  return 'free';
}

export default function FunctionsPanel({ projectId, fontSize = 'base' }: Props) {
  const sizeClass = fontSize === 'sm' ? 'text-sm' : fontSize === 'lg' ? 'text-lg' : 'text-base';

  const [plan, setPlan] = useState<Plan>('free');
  const isFree = plan === 'free';

  async function loadPlan() {
    const { data, error } = await supabase
      .from('user_projects')
      .select('plan, subscription_tier, is_premium, tier, billing_plan')
      .eq('id', projectId)
      .maybeSingle();

    const resolved = normalizePlanRow(data);
    if (DEBUG_PLAN) console.warn('[FunctionsPanel] plan row:', data, '→', resolved, error ?? '');
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
          if (DEBUG_PLAN) console.warn('[FunctionsPanel] realtime plan →', resolved, payload.new);
          setPlan(resolved);
        }
      )
      .subscribe();

    const id = setInterval(loadPlan, 15000);
    return () => { clearInterval(id); supabase.removeChannel(channel); };
  }, [projectId]);

  return (
    <div className={`relative p-6 ${sizeClass}`}>
      {/* Ribbon (and optional debug chip) */}
      <div className="absolute right-4 top-4 flex items-center gap-2">
        {DEBUG_PLAN && (
          <span className="text-[10px] rounded px-2 py-0.5 bg-slate-500/20 text-slate-200 border border-slate-400/40">
            plan: {plan}
          </span>
        )}
        <span className="text-[10px] tracking-wide rounded px-2 py-0.5 bg-amber-500/20 text-amber-200 border border-amber-400/40">
          {isFree ? 'BETA • Premium' : 'BETA'}
        </span>
      </div>

      <div className="rounded-2xl border border-indigo-500/60 bg-blue-950/60 p-5 shadow">
        <div className="flex items-center gap-3">
          <div className="text-2xl">🛠️</div>
          <div>
            <h2 className="text-xl font-semibold text-white">
              Custom Functions <span className="ml-2 text-[11px] text-amber-300/90">(BETA)</span>
            </h2>
            <p className="text-indigo-200/90 text-sm mt-0.5">
              Design automations that Zeta can run on your data, on a schedule, by webhook, or on demand.
            </p>
          </div>
        </div>

        {isFree && (
          <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-900/20 p-3 text-amber-100">
            🔒 <span className="font-semibold">Locked (Premium)</span> · Functions are in BETA and will unlock on premium plans post-launch.
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <PreviewTile title="Build" emoji="🧩" lines={['Create small, composable tasks','Type-safe inputs & outputs','Access Supabase, files, and APIs']} />
        <PreviewTile title="Triggers" emoji="⏱️" lines={['Run manually from the UI','CRON scheduling','Webhook & event triggers']} />
        <PreviewTile title="Observability" emoji="📈" lines={['Run history & logs','Output previews','Retry & error insights']} />
      </div>

      <div className="mt-6 rounded-2xl border border-indigo-500/60 bg-blue-950/40 p-5">
        <h3 className="text-white font-semibold mb-3">How it will work</h3>
        <ol className="space-y-2 text-indigo-200/90 text-sm list-decimal list-inside">
          <li>Define a function (name, description, inputs, outputs).</li>
          <li>Choose a trigger: <span className="opacity-90">Manual · Schedule · Webhook</span>.</li>
          <li>Write the action: read/write Supabase, transform files, call external APIs.</li>
          <li>Test, preview output, then enable.</li>
          <li>Track runs, logs, and results in a simple history view.</li>
        </ol>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          className={`px-4 py-2 rounded-lg text-sm shadow ${isFree ? 'bg-slate-800/70 border border-slate-600/60 text-slate-300 cursor-not-allowed' : 'bg-teal-500 hover:bg-teal-600 text-white'}`}
          disabled={isFree}
          title={isFree ? 'Available on Premium post-launch' : 'Start building'}
        >
          {isFree ? 'Premium Feature (Locked)' : '➕ Create Function'}
        </button>
        <span className="text-[11px] text-indigo-300/90">BETA preview · UI and capabilities may change before release.</span>
      </div>
    </div>
  );
}

/* helpers */
function PreviewTile({ title, emoji, lines }: { title: string; emoji: string; lines: string[] }) {
  return (
    <div className="rounded-2xl border border-indigo-500/60 bg-blue-950/40 p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="text-xl">{emoji}</div>
        <div className="text-white font-semibold">{title}</div>
      </div>
      <ul className="text-sm text-indigo-200/90 space-y-1">
        {lines.map((t) => (
          <li key={t} className="flex items-start gap-2">
            <span>•</span>
            <span className="leading-snug">{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}