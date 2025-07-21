import React from 'react';

type DailyGoalsPanelProps = {
  zetaTasks: string[];
  userTasks: string[];
};

export default function DailyGoalsPanel({
  zetaTasks = [],
  userTasks = [],
}: DailyGoalsPanelProps) {
  return (
    <div className="bg-yellow-100 rounded-xl px-4 py-3 text-black w-full shadow-md">
      <h2 className="text-base font-bold mb-2 flex items-center gap-2">📅 Daily Goals</h2>

      <div className="grid grid-cols-2 gap-x-6 text-sm">
        {/* Zeta’s Tasks */}
        <div>
          <h3 className="font-semibold mb-1">🤖 Zeta’s Tasks</h3>
          <ul className="list-disc list-inside space-y-0.5">
            {zetaTasks.length > 0 ? (
              zetaTasks.map((task, i) => <li key={`zeta-${i}`}>{task}</li>)
            ) : (
              <li className="italic text-xs">None</li>
            )}
          </ul>
        </div>

        {/* User’s Tasks */}
        <div>
          <h3 className="font-semibold mb-1">👤 Your Tasks</h3>
          <ul className="list-disc list-inside space-y-0.5">
            {userTasks.length > 0 ? (
              userTasks.map((task, i) => <li key={`user-${i}`}>{task}</li>)
            ) : (
              <li className="italic text-xs">None</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
