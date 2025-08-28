// lib/plan.ts
import { supabase } from '@/lib/supabaseClient';

export type Plan = 'free' | 'premium';
export const PLAN_LIMIT: Record<Plan, number> = { free: 3, premium: 10 };

export function getPlanFromUser(user: any | null | undefined): Plan {
  const raw = user?.app_metadata?.plan ?? user?.user_metadata?.plan ?? 'free';
  return raw === 'premium' ? 'premium' : 'free';
}

/** Client-side helper: reads auth session, counts projects, returns plan/usage. */
export async function getPlanAndUsage(): Promise<{
  plan: Plan;
  limit: number;
  used: number;
  remaining: number;
}> {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.user) {
    // not signed in = default to free, 0 used
    return { plan: 'free', limit: PLAN_LIMIT.free, used: 0, remaining: PLAN_LIMIT.free };
  }

  const plan = getPlanFromUser(session.user);
  const limit = PLAN_LIMIT[plan];

  const { count } = await supabase
    .from('user_projects')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', session.user.id);

  const used = count ?? 0;
  return { plan, limit, used, remaining: Math.max(0, limit - used) };
}

/** Optional server-side guard (pass in a service-role client if you use it) */
export async function ensureUnderProjectLimit(
  adminClient: any,
  userId: string,
  plan: Plan
) {
  const limit = PLAN_LIMIT[plan];
  const { count, error } = await adminClient
    .from('user_projects')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
  const used = count ?? 0;
  if (used >= limit) {
    throw new Error(
      plan === 'premium'
        ? 'Project limit reached (10).'
        : 'Free plan limit reached (3). Upgrade to Premium for up to 10 projects.'
    );
  }
}
