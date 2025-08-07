'use client';

import { useState } from 'react';

type Props = {
  projectId: string;
  fontSize: 'sm' | 'base' | 'lg';
};

type ZetaTask = {
  id: string;
  keyword: string;
  description: string;
  status: 'queued' | 'in progress' | 'waiting for input' | 'complete' | 'failed';
};

const MOCK_ZETA_TASKS: ZetaTask[] = [
  {
    id: '1',
    keyword: 'Extract',
    description: 'Extract team names and game times from uploaded PDF',
    status: 'in progress',
  },
  {
    id: '2',
    keyword: 'Generate',
    description: 'Generate weekly betting insights summary for email',
    status: 'queued',
  },
  {
    id: '3',
    keyword: 'Review',
    description: 'Review sales pitch and suggest improvements',
    status: 'waiting for input',
  },
];

export default function ZetaWorkshopPanel({ projectId, fontSize }: Props) {
  const [tasks, setTasks] = useState<ZetaTask[]>(MOCK_ZETA_TASKS);

  const handleAssist = (taskId: string) => {
    console.log(`👨‍🔧 Assist requested for task ${taskId}`);
    // Future: Open modal or direct chat context with Zeta on this task
  };

  const getStatusColor = (status: ZetaTask['status']) => {
    switch (status) {
      case 'queued':
        return 'text-yellow-400';
      case 'in progress':
        return 'text-blue-400';
      case 'waiting for input':
        return 'text-orange-300';
      case 'complete':
        return 'text-green-400';
      case 'failed':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  return (
    <div className={`p-6 text-${fontSize} text-white space-y-6 overflow-y-auto`}>
      <h3 className="text-lg font-semibold">🧪 Zeta Workshop</h3>
      <p className="text-sm text-gray-300">
        Monitor, assist, and manage Zeta’s ongoing or scheduled actions. You can review progress,
        step in to help, or trigger completions manually.
      </p>

      <div className="space-y-4">
        {tasks.map((task) => (
          <div
            key={task.id}
            className="bg-blue-950 border border-purple-500 rounded-xl p-4 space-y-2 shadow text-sm"
          >
            <div className="flex justify-between items-center">
              <div className="font-semibold text-purple-300">{task.keyword}</div>
              <div className={`italic ${getStatusColor(task.status)}`}>
                {task.status.toUpperCase()}
              </div>
            </div>
            <p className="text-purple-100">{task.description}</p>

            {task.status === 'waiting for input' || task.status === 'failed' ? (
              <button
                onClick={() => handleAssist(task.id)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded shadow mt-1"
              >
                🛠 Assist Zeta
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {/* Future Visual Placeholder */}
      <div className="mt-6 bg-blue-900 border border-indigo-400 rounded-xl p-4 text-sm text-indigo-200">
        <p className="font-semibold mb-1">📊 Visual Task Pipeline (Coming Soon)</p>
        <p className="text-indigo-300">
          Zeta will soon show function timelines, dependencies, retries, and real-time execution
          logs here.
        </p>
      </div>
    </div>
  );
}