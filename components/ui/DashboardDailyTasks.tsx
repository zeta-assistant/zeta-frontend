'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient'; // or your correct path
import DailyTasksPanel from '../DailyTasksPanel';

type Props = {
  projectId: string;
};

export default function DashboardDailyTasks({ projectId }: Props) {
  const [zetaTasks, setZetaTasks] = useState<string[]>([]);
  const [userTasks, setUserTasks] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDailyTasks = async () => {
      setLoading(true);

      const { data: zetaData } = await supabase
        .from('daily_tasks')
        .select('task_text')
        .eq('project_id', projectId)
        .eq('goal_type', 'zeta_task')
        .order('created_at', { ascending: false })
        .limit(3);

      const { data: userData } = await supabase
        .from('daily_tasks')
        .select('task_text')
        .eq('project_id', projectId)
        .eq('goal_type', 'user_task')
        .order('created_at', { ascending: false })
        .limit(3);

      setZetaTasks(zetaData?.map((t) => t.task_text) || []);
      setUserTasks(userData?.map((t) => t.task_text) || []);
      setLoading(false);
    };

    if (projectId) fetchDailyTasks();
  }, [projectId]);

  return (
    <div className="h-[200px]">
      {loading ? (
        <div className="text-sm italic text-gray-500 p-3">Loading tasks...</div>
      ) : (
        <DailyTasksPanel zetaTasks={zetaTasks} userTasks={userTasks} />
      )}
    </div>
  );
}