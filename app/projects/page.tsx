// app/projects/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getPlanAndUsage } from '@/lib/plan';

type Project = {
  id: string;
  user_id: string;
  name: string;
  description: string;
  created_at: string;
  type: string;
  onboarding_complete: boolean;
  system_instructions: string | null;
  assistant_id?: string | null;
};

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // plan/usage state
  const [plan, setPlan] = useState<'free' | 'premium'>('free');
  const [limit, setLimit] = useState<number>(3);
  const [used, setUsed] = useState<number>(0);

  useEffect(() => {
    const fetchProjects = async () => {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      if (sessionError || !session?.user) {
        router.push('/login');
        return;
      }

      const uid = session.user.id;
      setUserEmail(session.user.email ?? null);
      setUserId(uid);

      const usage = await getPlanAndUsage();
      setPlan(usage.plan);
      setLimit(usage.limit);
      setUsed(usage.used);

      const { data, error } = await supabase
        .from('user_projects')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false });

      if (!error && data) setProjects(data as Project[]);
      setLoading(false);
    };

    fetchProjects();
  }, [router]);

  const goToProject = (project: Project) => {
    router.push(`/dashboard/${project.id}`);
  };

  const createNewProject = async () => {
    if (used >= limit) {
      alert(
        plan === 'premium'
          ? `You've reached your Premium limit (${limit}).`
          : `You've reached your Free limit (${limit}). Upgrade to Premium for up to 10 projects.`
      );
      return;
    }
    router.push('/onboarding');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  const handleDelete = async (projectId: string) => {
    const confirmed = confirm(
      'Are you sure you want to delete this project? This action cannot be undone.'
    );
    if (!confirmed || !userId) return;

    setLoading(true);
    try {
      // fetch assistant id (best-effort)
      const { data: projRow } = await supabase
        .from('user_projects')
        .select('assistant_id')
        .eq('id', projectId)
        .eq('user_id', userId)
        .single();

      const assistantId = (projRow as { assistant_id?: string | null } | null)?.assistant_id;

      // delete assistant first (best-effort)
      if (assistantId) {
        try {
          const ares = await fetch('/api/delete-assistant', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId, assistantId }),
          });
          if (!ares.ok) {
            const txt = await ares.text();
            console.warn('Assistant deletion warning:', txt);
          }
        } catch (e) {
          console.warn('Assistant deletion request failed:', e);
        }
      }

      // server-side deletion via service role (bypasses RLS)
      const res = await fetch('/api/delete-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, userId }),
      });

      const result = await res.json();
      if (!res.ok) {
        console.error('❌ Failed to delete project:', result?.error || res.statusText);
        alert(`Failed to delete project: ${result?.error || res.statusText}`);
      } else {
        setProjects((prev) => prev.filter((p) => p.id !== projectId));
        setUsed((u) => Math.max(0, u - 1));
      }
    } catch (err) {
      console.error('❌ Unexpected deletion error:', err);
      alert('Unexpected error during deletion.');
    } finally {
      setLoading(false);
    }
  };

  const remaining = Math.max(0, limit - used);

  return (
    <div className="min-h-screen bg-[#f9f9f9] px-6 py-10">
      {/* Header */}
      <div className="flex justify-between items-center max-w-6xl mx-auto mb-3">
        <h1 className="text-4xl font-bold">🏛️ Pantheon Project Hub</h1>
        {userEmail && (
          <div className="text-right">
            <p className="text-sm text-gray-600">
              👤 <span className="font-medium">{userEmail}</span>
            </p>
            <div className="text-xs text-gray-500">
              Plan:{' '}
              <span
                className={
                  plan === 'premium'
                    ? 'text-amber-600 font-semibold'
                    : 'text-slate-700 font-semibold'
                }
              >
                {plan}
              </span>{' '}
              • Projects {used}/{limit}
            </div>
            <button onClick={handleLogout} className="text-xs text-red-500 hover:underline mt-1">
              Log Out
            </button>
          </div>
        )}
      </div>

      {/* Limit banner */}
      <div className="max-w-6xl mx-auto mb-6">
        {remaining === 0 ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 text-amber-800 px-3 py-2 text-sm">
            You’ve reached your {plan === 'premium' ? 'Premium' : 'Free'} project limit ({limit}).
            {plan === 'free' && (
              <>
                {' '}
                Upgrade to <span className="font-semibold">Premium</span> for up to 10 projects.
              </>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">
            You have <span className="font-semibold">{remaining}</span> project
            {remaining === 1 ? '' : 's'} remaining.
          </div>
        )}
      </div>

      {/* Project Cards */}
      {loading ? (
        <div className="text-center text-gray-500">Loading your projects...</div>
      ) : (
        <div className="flex flex-col items-center gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-6xl">
            {projects.map((project) => (
              <div
                key={project.id}
                className="bg-white rounded-xl shadow-md p-6 border border-gray-200 hover:shadow-lg transition"
              >
                <h2 className="text-xl font-bold mb-1">{project.name}</h2>
                <p className="text-sm text-gray-600 mb-1">⚡ Type: {project.type}</p>
                {project.description && (
                  <p className="text-sm text-gray-500 italic mb-1">{project.description}</p>
                )}
                {project.system_instructions && (
                  <p className="text-xs text-gray-400 mb-1">🛠 {project.system_instructions}</p>
                )}
                <p className="text-xs text-blue-500 font-mono mb-1">🆔: {project.id}</p>
                <p className="text-sm text-gray-400 mb-2">
                  Created: {new Date(project.created_at).toLocaleDateString()}
                </p>
                {project.onboarding_complete ? (
                  <p className="text-xs text-green-600 font-semibold mb-2">✅ Onboarding Complete</p>
                ) : (
                  <p className="text-xs text-yellow-600 font-semibold mb-2">⚠️ Onboarding Pending</p>
                )}
                <div className="flex gap-4">
                  <button
                    onClick={() => goToProject(project)}
                    className="flex-1 text-sm px-4 py-2 bg-black text-white rounded-full hover:bg-gray-800 transition"
                  >
                    Launch Project
                  </button>
                  <button
                    onClick={() => handleDelete(project.id)}
                    className="flex-1 text-sm px-4 py-2 bg-red-600 text-white rounded-full hover:bg-red-700 transition"
                  >
                    Delete Project
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={createNewProject}
            disabled={remaining === 0}
            className={`mt-2 px-6 py-4 rounded-full text-lg transition ${
              remaining === 0
                ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                : 'bg-black text-white hover:bg-gray-800'
            }`}
            title={
              remaining === 0
                ? plan === 'premium'
                  ? 'Premium limit reached (10)'
                  : 'Free limit reached (3). Upgrade for more.'
                : 'Create a new project'
            }
          >
            ➕ Create New Project
          </button>
        </div>
      )}
    </div>
  );
}
