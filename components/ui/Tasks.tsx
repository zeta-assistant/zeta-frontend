'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import TasksSummary from '@/components/TasksSummary';

type Props = {
  projectId?: string;
};

type DbStatus =
  | 'draft'
  | 'under_construction'
  | 'in_progress'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | null;

type SummaryStatus = 'under-construction' | 'in-progress';

const mapDbToSummary = (s: DbStatus): SummaryStatus =>
  s === 'under_construction' || s === 'draft' ? 'under-construction' : 'in-progress';

export default function DashboardTasks({ projectId: propProjectId }: Props) {
  const params = useParams();
  const searchParams = useSearchParams();

  const [resolvedId, setResolvedId] = useState<string | null>(propProjectId ?? null);
  const [resolving, setResolving] = useState<boolean>(!propProjectId);

  useEffect(() => {
    let cancelled = false;

    function resolveProjectId() {
      if (propProjectId) {
        setResolvedId(propProjectId);
        setResolving(false);
        return;
      }

      const fromRoute = (params?.projectId as string | undefined) ?? undefined;
      const fromQuery = searchParams?.get('projectId') ?? undefined;
      const fromStorage =
        typeof window !== 'undefined'
          ? localStorage.getItem('currentProjectId') ||
            localStorage.getItem('lastProjectId') ||
            undefined
          : undefined;

      const immediate = fromRoute || fromQuery || fromStorage;

      if (!cancelled) {
        setResolvedId(immediate ?? null);
        setResolving(false);
        if (immediate && typeof window !== 'undefined') {
          try {
            localStorage.setItem('currentProjectId', immediate);
          } catch {}
        }
      }
    }

    resolveProjectId();
    return () => {
      cancelled = true;
    };
  }, [propProjectId, params, searchParams]);

  const [zetaTitles, setZetaTitles] = useState<string[]>([]);
  const [userTitles, setUserTitles] = useState<string[]>([]);
  const [zetaStatuses, setZetaStatuses] = useState<SummaryStatus[]>([]);
  const [userStatuses, setUserStatuses] = useState<SummaryStatus[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!resolvedId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const [{ data: zRows, error: ez }, { data: uRows, error: eu }] = await Promise.all([
          supabase
            .from('task_items')
            .select('id,title,status,created_at')
            .eq('project_id', resolvedId)
            .eq('task_type', 'zeta')
            .order('created_at', { ascending: false })
            .limit(3),
          supabase
            .from('task_items')
            .select('id,title,status,created_at')
            .eq('project_id', resolvedId)
            .eq('task_type', 'user')
            .order('created_at', { ascending: false })
            .limit(3),
        ]);
        if (ez) throw ez;
        if (eu) throw eu;

        const zTitles = (zRows ?? []).map((r: any) => String(r.title)).slice(0, 3);
        const uTitles = (uRows ?? []).map((r: any) => String(r.title)).slice(0, 3);
        const zStats = (zRows ?? []).map((r: any) => mapDbToSummary(r.status as DbStatus)).slice(0, 3);
        const uStats = (uRows ?? []).map((r: any) => mapDbToSummary(r.status as DbStatus)).slice(0, 3);

        if (!cancelled) {
          setZetaTitles(zTitles);
          setUserTitles(uTitles);
          setZetaStatuses(zStats);
          setUserStatuses(uStats);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (resolvedId) load();
    else setLoading(false);

    return () => {
      cancelled = true;
    };
  }, [resolvedId]);

  if (resolving) return null;
  if (!resolvedId) return null;
  if (loading) return <p className="text-sm italic text-slate-500 mt-2">Loading tasks…</p>;

  return (
    <TasksSummary
      zetaTasks={zetaTitles}
      userTasks={userTitles}
      zetaStatuses={zetaStatuses}
      userStatuses={userStatuses}
      className="mt-2"
    />
  );
}
