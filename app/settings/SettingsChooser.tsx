// app/settings/SettingsChooser.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getPlanFromUser } from '@/lib/plan';

import SettingsPageFree from './SettingsPageFree';
import SettingsPagePremium from './SettingsPagePremium';

type Choice = 'loading' | 'free' | 'premium';

export default function SettingsChooser() {
  const router = useRouter();
  const [choice, setChoice] = useState<Choice>('loading');

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        const session = data?.session ?? null;

        // Require login
        if (error || !session?.user) {
          if (!alive) return;
          router.replace('/login?next=/settings');
          return;
        }

        const user = session.user;

        // 1) Check user metadata (fallback)
        const metaPlan = getPlanFromUser(user);

        // 2) Check DB: any premium project?
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
        if (alive) router.replace('/login?next=/settings');
      }
    })();

    return () => {
      alive = false;
    };
  }, [router]);

  if (choice === 'loading') {
    return (
      <main className="min-h-screen bg-gradient-to-b from-sky-50 to-indigo-100">
        <div className="max-w-5xl mx-auto px-6 py-10 text-slate-600">Loading settings…</div>
      </main>
    );
  }

  return choice === 'premium' ? <SettingsPagePremium /> : <SettingsPageFree />;
}
