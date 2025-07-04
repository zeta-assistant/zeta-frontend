'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type Project = {
  id: string;
  user_id: string;
  name: string;
  description: string;
  created_at: string;
  type: string;
  onboarding_complete: boolean;
  system_instructions: string | null;
};

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProjects = async () => {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.user) {
        router.push('/login');
        return;
      }

      setUserEmail(session.user.email ?? null);

      const { data, error } = await supabase
        .from('user_projects')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (!error && data) setProjects(data);
      setLoading(false);
    };

    fetchProjects();
  }, []);

  const goToProject = (project: Project) => {
    router.push(`/dashboard/${project.id}`);
  };

  const createNewProject = () => {
    router.push('/onboarding');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  return (
    <div className="min-h-screen bg-[#f9f9f9] px-6 py-10">
      {/* Header */}
      <div className="flex justify-between items-center max-w-6xl mx-auto mb-6">
        <h1 className="text-4xl font-bold">🏛️ Pantheon Project Hub</h1>
        {userEmail && (
          <div className="text-right">
            <p className="text-sm text-gray-600">
              👤 <span className="font-medium">{userEmail}</span>
            </p>
            <button
              onClick={handleLogout}
              className="text-xs text-red-500 hover:underline mt-1"
            >
              Log Out
            </button>
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
                className="bg-white rounded-xl shadow-md p-6 border border-gray-200 hover:shadow-lg transition cursor-pointer"
              >
                <h2 className="text-xl font-bold mb-1">{project.name}</h2>
                <p className="text-sm text-gray-600 mb-1">🧠 Type: {project.type}</p>

                {project.description && (
                  <p className="text-sm text-gray-500 italic mb-1">{project.description}</p>
                )}

                {project.system_instructions && (
                  <p className="text-xs text-gray-400 mb-2">
                    🛠 {project.system_instructions}
                  </p>
                )}

                <p className="text-sm text-gray-400 mb-2">
                  Created: {new Date(project.created_at).toLocaleDateString()}
                </p>

                {project.onboarding_complete ? (
                  <p className="text-xs text-green-600 font-semibold mb-2">✅ Onboarding Complete</p>
                ) : (
                  <p className="text-xs text-yellow-600 font-semibold mb-2">⚠️ Onboarding Pending</p>
                )}

                <button
                  onClick={() => goToProject(project)}
                  className="text-sm px-4 py-2 bg-black text-white rounded-full hover:bg-gray-800 transition"
                >
                  Launch Project
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={createNewProject}
            className="mt-8 px-6 py-4 bg-black text-white rounded-full hover:bg-gray-800 text-lg"
          >
            ➕ Create New Project
          </button>
        </div>
      )}
    </div>
  );
}