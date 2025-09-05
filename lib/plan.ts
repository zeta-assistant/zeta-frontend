// lib/plan.ts
import { supabase } from '@/lib/supabaseClient';

export type Plan = 'free' | 'premium';
export const PLAN_LIMIT: Record<Plan, number> = { free: 3, premium: 10 };

export function getPlanFromUser(user: any | null | undefined): Plan {
  const raw =
    user?.app_metadata?.plan ??
    user?.user_metadata?.plan ??
    'free';
  return raw === 'premium' ? 'premium' : 'free';
}

/** Global (user-level) limits: how many projects they can have */
export async function getPlanAndUsage(): Promise<{
  plan: Plan;
  limit: number;
  used: number;
  remaining: number;
}> {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.user) {
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

/** Project-scoped plan, derived & cached on user_projects.plan */
export async function getProjectPlan(projectId: string): Promise<Plan> {
  const { data, error } = await supabase
    .from('user_projects')
    .select('plan')
    .eq('id', projectId)
    .single();
  if (error) return 'free';
  return (data?.plan ?? 'free') as Plan;
}

/** Simple guard for premium-only UI actions */
export async function requirePremium(projectId: string): Promise<{ ok: true } | { ok: false }> {
  const plan = await getProjectPlan(projectId);
  return plan === 'premium' ? { ok: true } : { ok: false };
}

/** Optional server-side limit guard you already have */
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
