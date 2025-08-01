import React from 'react';

type DailyTasksPanelProps = {
  zetaTasks: string[];
  userTasks: string[];
};

export default function DailyTasksPanel({
  zetaTasks = [],
  userTasks = [],
}: DailyTasksPanelProps) {
  return (
    <div className="bg-yellow-100 rounded-xl px-5 py-6 text-black w-full shadow-md min-h-[200px]">
      <h2 className="text-base font-bold mb-4 flex items-center gap-2">📅 Daily Tasks</h2>

      <div className="grid grid-cols-2 gap-x-6 text-sm">
        {/* 🤖 Zeta’s Tasks */}
        <div>
          <h3 className="font-semibold text-[15px] mb-1">🤖 Zeta’s Tasks</h3>
          <ul className="list-disc list-inside space-y-1.5">
            {zetaTasks.length > 0 ? (
              zetaTasks.map((task, i) => <li key={`zeta-${i}`}>{task}</li>)
            ) : (
              <li className="italic text-xs">None yet</li>
            )}
          </ul>
        </div>

        {/* 👤 User’s Tasks */}
        <div>
          <h3 className="font-semibold text-[15px] mb-1">👤 Your Tasks</h3>
          <ul className="list-disc list-inside space-y-1.5">
            {userTasks.length > 0 ? (
              userTasks.map((task, i) => <li key={`user-${i}`}>{task}</li>)
            ) : (
              <li className="italic text-xs">None yet</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}