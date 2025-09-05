'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { getPlanFromUser } from '@/lib/plan';

import SettingsPageFree from './SettingsPageFree';
import SettingsPagePremium from './SettingsPagePremium';

type Choice = 'loading' | 'free' | 'premium';

export default function SettingsChooser() {
  const [choice, setChoice] = useState<Choice>('loading');

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        const session = data?.session ?? null;
        if (error || !session?.user) {
          if (alive) setChoice('free');
          return;
        }

        const user = session.user;

        // 1) Check user metadata (legacy / fallback)
        const metaPlan = getPlanFromUser(user);

        // 2) ALSO check DB: any premium project?
        //    Some schemas use `plan`, others use `type` for this.
        const { data: projRows, error: projErr } = await supabase
          .from('user_projects')
          .select('plan, type')
          .eq('user_id', user.id);

        const hasPremiumProject =
          !projErr &&
          Array.isArray(projRows) &&
          projRows.some((r: any) => {
            const v = String((r?.plan ?? r?.type ?? '')).toLowerCase();
            return v === 'premium';
          });

        const effectivePlan = hasPremiumProject ? 'premium' : metaPlan;

        if (alive) setChoice(effectivePlan === 'premium' ? 'premium' : 'free');
      } catch {
        if (alive) setChoice('free');
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  if (choice === 'loading') {
    return (
      <div className="min-h-screen bg-[#0b1226] text-white px-6 py-10">
        <div className="max-w-5xl mx-auto text-white/70">Loading settings…</div>
      </div>
    );
  }

  return choice === 'premium' ? <SettingsPagePremium /> : <SettingsPageFree />;
}
